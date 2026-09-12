import { beforeEach, describe, expect, it } from 'vitest';

import type { NotificationDelivery } from '../../../domain/notification-delivery';
import { NotificationDeliveryRepositoryFake } from '../notification-delivery-repository-fake';

/**
 * ⚠️ **REGRA 12 DA TAREFA 37 — O FAKE TEM DE RECUSAR O SEGUNDO CLAIM IGUAL.**
 *
 * Sem isso ele é **mais permissivo que o banco**, e aí todo teste de
 * idempotência do dispatcher passa **por acidente**: o `claim` devolveria
 * `true` duas vezes, o segundo lembrete sairia, e o teste que dizia provar "não
 * manda duas vezes" estaria provando "o fake deixa". É a direção do §7.1 que
 * costuma quebrar em produção logo — e aqui "produção" é o celular de alguém às
 * nove da noite.
 *
 * ⚠️ E a direção contrária também é infidelidade (§7.1, e é a que esconde
 * melhor porque a suíte fica verde): o índice é
 * `@@unique([userId, kind, localDate])`, os **três** campos. Um fake que
 * recusasse por `userId` só calaria o `GROUP_ACTIVITY` de quem já recebeu o
 * lembrete; um que recusasse por `(userId, kind)` calaria o lembrete de
 * **amanhã**. Os dois têm teste aqui.
 *
 * A prova contra o Postgres de verdade é o teste de contrato
 * (`repositories/__tests__/prisma-notification-delivery-repository.contract.integration.test.ts`),
 * que é quem mostra que o `ON CONFLICT` existe — inclusive com dois claims
 * **concorrentes** (regra 13).
 */

/** Fixture de objeto é FACTORY, nunca `const` de `describe` (§7.7). */
function aDelivery(
  overrides: Partial<NotificationDelivery> = {},
): NotificationDelivery {
  return {
    id: 'delivery-1',
    userId: 'maria',
    kind: 'READING_REMINDER',
    // Notoriamente NÃO-HOJE (§7.8): data de fábrica não depende do relógio.
    localDate: '2026-10-05',
    deliveredAt: new Date('2026-10-05T21:00:03.000Z'),
    ...overrides,
  };
}

describe('NotificationDeliveryRepositoryFake', () => {
  let repo: NotificationDeliveryRepositoryFake;

  beforeEach(() => {
    repo = new NotificationDeliveryRepositoryFake();
  });

  it('grants the first claim of the day', async () => {
    await expect(repo.claim(aDelivery())).resolves.toBe(true);
    expect(repo.claimed).toHaveLength(1);
  });

  /** ⚠️ A regra 12 em uma linha: o segundo claim IGUAL é recusado. */
  it('refuses the SECOND claim with the same (userId, kind, localDate)', async () => {
    await repo.claim(aDelivery());

    // Id e instante diferentes de propósito: não é o id que colide, é a CHAVE.
    await expect(
      repo.claim(
        aDelivery({
          id: 'delivery-2',
          deliveredAt: new Date('2026-10-05T21:05:00.000Z'),
        }),
      ),
    ).resolves.toBe(false);

    // E nada foi gravado pela segunda: a reserva continua sendo a primeira.
    expect(repo.claimed).toHaveLength(1);
    expect(repo.claimed[0]?.id).toBe('delivery-1');
    expect(repo.claimed[0]?.deliveredAt).toEqual(
      new Date('2026-10-05T21:00:03.000Z'),
    );
  });

  /**
   * ⚠️ **A CHAVE É DE TRÊS CAMPOS, e estes são os três lados que um fake
   * preguiçoso erraria** — cada um cala um lembrete legítimo em silêncio.
   */
  it.each([
    ['another person', { userId: 'marcos' }],
    ['another kind', { kind: 'GROUP_ACTIVITY' as const }],
    ['another day', { localDate: '2026-10-06' }],
  ])('grants the claim of %s', async (_label, overrides) => {
    await repo.claim(aDelivery());

    await expect(
      repo.claim(aDelivery({ id: 'delivery-2', ...overrides })),
    ).resolves.toBe(true);
    expect(repo.claimed).toHaveLength(2);
  });

  /**
   * ⚠️ **O `=` de texto do Postgres é BYTE-SENSÍVEL**, e o fake tem de ser
   * também: `'2026-10-5'` não é `'2026-10-05'`, e um fake que normalizasse
   * datas aceitaria uma chave que o banco trata como outra linha.
   *
   * Não há caminho que produza isso hoje (o `localDay` sempre devolve os dois
   * dígitos), e é justamente por isso que está travado: no dia em que houver, o
   * fake e o banco têm de discordar do mesmo jeito.
   */
  it('compares the calendar day byte by byte, like the database does', async () => {
    await repo.claim(aDelivery({ localDate: '2026-10-05' }));

    await expect(
      repo.claim(aDelivery({ id: 'delivery-2', localDate: '2026-10-5' })),
    ).resolves.toBe(true);
  });

  /**
   * ⚠️ **O PAR UNITÁRIO DO CONTRATO — e o nome é O MESMO de propósito.**
   *
   * O teste de contrato contra o Postgres
   * (`prisma-notification-delivery-repository.contract.integration.test.ts`)
   * já tinha `refuses a kind outside the vocabulary, and writes nothing`; aqui
   * não tinha nada, e um fake que não valida é a direção **permissiva** do
   * §7.1 — ele aceita o que o banco recusa. Dois testes com o mesmo nome, nos
   * dois lados do port, é como se lê que a fidelidade é a mesma.
   *
   * A alcançabilidade é baixa (`kind` é tipado, e quem o escreve é o
   * dispatcher), e por isso o `as` é necessário para chegar até aqui. O que
   * está travado não é um bug de hoje: é que o fake **e** o banco recusem o
   * mesmo valor no dia em que houver um segundo escritor.
   */
  it('refuses a kind outside the vocabulary, and writes nothing', async () => {
    const bogus = aDelivery({
      kind: 'READING_REMINDER_2' as NotificationDelivery['kind'],
    });

    await expect(repo.claim(bogus)).rejects.toThrow(/kind must be one of/);
    expect(repo.claimed).toHaveLength(0);

    // E a tentativa FOI contada (§7.3): o portão está depois do contador, e
    // "estourou" continua sendo uma chamada.
    expect(repo.claimCalls).toBe(1);
  });

  /**
   * ⚠️ **CONTADOR DE CHAMADA, NUNCA CRONÔMETRO (§7.3), e ele conta a TENTATIVA
   * — não o sucesso.**
   *
   * É o que o dispatcher precisa para provar a decisão E: "o claim veio antes
   * do envio" se prova contando, e a recusa **também foi uma chamada**. Sem
   * isso, "não pediu reserva" e "pediu e perdeu" dariam o mesmo `claimed`.
   */
  it('counts the ATTEMPT, refusals included', async () => {
    expect(repo.claimCalls).toBe(0);

    await repo.claim(aDelivery());
    await repo.claim(aDelivery({ id: 'delivery-2' }));

    expect(repo.claimCalls).toBe(2);
    // ...e só uma virou linha: é a diferença entre tentativa e sucesso.
    expect(repo.claimed).toHaveLength(1);
  });

  /** O `claimed` é uma cópia: mexer no que voltou não mexe no que está guardado. */
  it('hands out copies, never the stored rows', async () => {
    await repo.claim(aDelivery());

    const [first] = repo.claimed;
    if (first === undefined) expect.unreachable('nothing was claimed');
    first.localDate = '1999-01-01';

    expect(repo.claimed[0]?.localDate).toBe('2026-10-05');
  });
});
