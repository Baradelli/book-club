import { beforeEach, describe, expect, it } from 'vitest';

import type { ReadingLog } from '../../../domain/reading-log';
import { aReadingLog, required } from '../../../test-support/builders';
import { ReadingLogRepositoryFake } from '../reading-log-repository-fake';

const READER_ID = 'user-maria';
const OTHER_READER_ID = 'user-marcos';
const PLAN_ITEM_ID = 'plan-book-1-2026-10-01';
const OTHER_PLAN_ITEM_ID = 'plan-book-1-2026-10-02';
const READ_ISO = '2026-10-01T18:30:00.000Z';

async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`expected an Error, got ${typeof error}`);
  }
  throw new Error('expected the promise to reject, but it resolved');
}

/**
 * Regra 21 — o fake do log de leitura tem suíte própria, como os onze fakes
 * anteriores.
 *
 * O port tem `save` · `byPlanItemAndUser` · `delete`, e **só**: o `find` chega
 * na Tarefa 32, junto da implementação Prisma que o satisfaz. Não há `update`
 * — o log é imutável por decisão fechada do MVP 3.
 */
describe('ReadingLogRepositoryFake', () => {
  let logs: ReadingLogRepositoryFake;

  beforeEach(() => {
    logs = new ReadingLogRepositoryFake();
  });

  /**
   * ⚠️ **Regras 1 e 2 — o que a entidade NÃO tem, e quem é a barreira.**
   *
   * `planItemId` é obrigatório e **não anulável** (regra 2): diferente da
   * `Note`, onde ele é nulo justamente para a avulsa existir, **não existe
   * leitura avulsa**. E não há `status`, `archivedAt`, `createdAt` nem
   * `updatedAt` (regra 1, decisão D): o log é imutável — nada o arquiva e nada
   * o reescreve —, e `createdAt` **é** o `readAt`, porque a linha nasce no ato
   * de marcar.
   *
   * Quem recusa é o **COMPILADOR**, e a prova é este bloco mais o
   * `pnpm -r typecheck` — é o padrão do `docs/CONVENCOES-CODIGO.md` §7.1.1, e
   * não um teste de runtime por campo.
   *
   * ⚠️ E a frase honesta que o mesmo §7.1.1 exige: a checagem de propriedade em
   * excesso do TypeScript só vale para **literal fresco**, e nada no fake filtra
   * campo nenhum em runtime — é o que o `expect` abaixo mostra, e é por isso
   * que ele afirma as três chaves em vez de fingir que elas sumiram. A asserção
   * de runtime que fecha a regra 1 está no `mark-read.test.ts`
   * (`stores exactly the six fields of the entity...`), sobre a linha que o
   * UseCase **monta** — que é onde o objeto nasce.
   */
  it('refuses at compile time a null day, a status and a second instant', () => {
    // Um objeto POR campo, e não os três num só: o TypeScript para de reportar
    // propriedade em excesso assim que o literal já tem um erro de
    // atribuição, e dois dos três `@ts-expect-error` sairiam como
    // "unused directive" — medido.
    const nullDay: Partial<ReadingLog> = {
      // @ts-expect-error `planItemId` NÃO é anulável: não existe leitura avulsa
      planItemId: null,
    };
    const softDeleted: Partial<ReadingLog> = {
      // @ts-expect-error o log é imutável — não se arquiva, não tem `status`
      status: 'ARCHIVED',
    };
    const secondInstant: Partial<ReadingLog> = {
      // @ts-expect-error `createdAt` É o `readAt`: dois nomes para o mesmo instante
      createdAt: new Date(),
    };

    expect(Object.keys(nullDay)).toEqual(['planItemId']);
    expect(Object.keys(softDeleted)).toEqual(['status']);
    expect(Object.keys(secondInstant)).toEqual(['createdAt']);
  });

  describe('save is an upsert by id', () => {
    it('returns the log it stored', async () => {
      const log = aReadingLog({ userId: READER_ID });

      const returned = await logs.save(log);

      expect(returned).toEqual(log);
      expect(logs.saved).toEqual([log]);
    });

    it('overwrites the same id in place instead of adding a second row', async () => {
      const first = aReadingLog({ id: 'log-a', readAt: new Date(READ_ISO) });
      await logs.save(first);

      await logs.save({
        ...first,
        readAt: new Date('2026-10-02T08:00:00.000Z'),
      });

      expect(logs.saved).toHaveLength(1);
      expect(required(logs.saved[0]).readAt.toISOString()).toBe(
        '2026-10-02T08:00:00.000Z',
      );
    });

    it('keeps two logs with different ids', async () => {
      await logs.save(aReadingLog({ id: 'log-a', userId: READER_ID }));
      await logs.save(aReadingLog({ id: 'log-b', userId: OTHER_READER_ID }));

      expect(logs.saved).toHaveLength(2);
    });

    /**
     * Regra 19 — o contador, com o lado **POSITIVO** também assertado (§7.3):
     * um contador só afirmado como `toBe(0)` é meio contador, porque um
     * incremento que alguém apague deixa todo `toBe(0)` passar por acidente — e
     * aí ele é a asserção vazia do §7.4.
     */
    it('counts every save call', async () => {
      expect(logs.saveCalls).toBe(0);

      // Leitores diferentes: dois ids não bastam para escapar do índice único,
      // e o fake é fiel a isso — o par `(planItemId, userId)` é a identidade.
      await logs.save(aReadingLog({ id: 'log-a', userId: READER_ID }));
      await logs.save(aReadingLog({ id: 'log-b', userId: OTHER_READER_ID }));

      expect(logs.saveCalls).toBe(2);
    });

    // Conta a CHAMADA, não o sucesso: a escrita que o índice recusou também foi
    // uma tentativa, e é isso que o teste do UseCase quer saber (§7.3).
    it('counts the save call the unique index refused', async () => {
      await logs.save(
        aReadingLog({
          id: 'log-a',
          planItemId: PLAN_ITEM_ID,
          userId: READER_ID,
        }),
      );

      await expect(
        logs.save(
          aReadingLog({
            id: 'log-b',
            planItemId: PLAN_ITEM_ID,
            userId: READER_ID,
          }),
        ),
      ).rejects.toThrow();

      expect(logs.saveCalls).toBe(2);
      expect(logs.saved).toHaveLength(1);
    });
  });

  /**
   * ⚠️ Regra 17 — **A FIDELIDADE NAS DUAS DIREÇÕES** (§7.1), e já são **seis**
   * aparições desta classe de bug no projeto.
   *
   * A pergunta é sempre "o Postgres faria isto?", e ela tem de ser respondida
   * nos dois sentidos:
   *
   * - **Restritiva demais** é a que esconde melhor, porque a suíte fica verde:
   *   um fake que recusasse o mesmo `planItemId` com **outro** `userId` faria
   *   "duas pessoas leram o mesmo dia" — o caso central do produto — nascer
   *   provando o comportamento errado. → ADR 0007.
   * - **Permissiva demais**: um fake que aceitasse o segundo `save` do mesmo
   *   par esconderia o `P2002` que o Postgres vai dar na Tarefa 32, e a
   *   idempotência do `markRead` passaria verde com um segundo `INSERT`.
   *
   * ⚠️ E a diferença em relação ao `NoteRepositoryFake`, que é o vizinho de
   * onde este fake foi copiado: **aqui não existe a metade do `NULL`**. O
   * `Note.planItemId` é anulável (é o que faz a anotação avulsa existir), e o
   * índice único do Postgres não compara `NULL` com `NULL`, então N avulsas do
   * mesmo autor convivem. `ReadingLog.planItemId` é **não anulável** — não há
   * leitura avulsa —, então aquela fidelidade não tem o que emular aqui.
   */
  describe('unique(planItemId, userId)', () => {
    it('refuses a second log of the same reader on the same plan item', async () => {
      await logs.save(
        aReadingLog({
          id: 'log-a',
          planItemId: PLAN_ITEM_ID,
          userId: READER_ID,
        }),
      );

      await expect(
        logs.save(
          aReadingLog({
            id: 'log-b',
            planItemId: PLAN_ITEM_ID,
            userId: READER_ID,
          }),
        ),
      ).rejects.toThrow(/unique\(planItemId, userId\)/);
    });

    // A OUTRA direção, e é o caso central do produto: o clube inteiro lê o
    // mesmo trecho no mesmo dia.
    it('allows two readers on the same plan item', async () => {
      await logs.save(
        aReadingLog({ planItemId: PLAN_ITEM_ID, userId: READER_ID }),
      );
      await logs.save(
        aReadingLog({ planItemId: PLAN_ITEM_ID, userId: OTHER_READER_ID }),
      );

      expect(logs.saved).toHaveLength(2);
    });

    // E a terceira: uma pessoa lê o livro inteiro, um dia por vez.
    it('allows the same reader on two plan items', async () => {
      await logs.save(
        aReadingLog({ planItemId: PLAN_ITEM_ID, userId: READER_ID }),
      );
      await logs.save(
        aReadingLog({ planItemId: OTHER_PLAN_ITEM_ID, userId: READER_ID }),
      );

      expect(logs.saved).toHaveLength(2);
    });

    it('lets the same id be rewritten: it does not collide with itself', async () => {
      const log = aReadingLog({
        planItemId: PLAN_ITEM_ID,
        userId: READER_ID,
      });
      await logs.save(log);

      await expect(
        logs.save({ ...log, readAt: new Date(READ_ISO) }),
      ).resolves.toBeTruthy();

      expect(logs.saved).toHaveLength(1);
    });

    it('refuses before writing: the store keeps only the first log', async () => {
      const first = aReadingLog({
        id: 'log-a',
        planItemId: PLAN_ITEM_ID,
        userId: READER_ID,
      });
      await logs.save(first);

      await expect(
        logs.save(
          aReadingLog({
            id: 'log-b',
            planItemId: PLAN_ITEM_ID,
            userId: READER_ID,
          }),
        ),
      ).rejects.toThrow();

      expect(logs.saved).toEqual([first]);
    });

    // Contrato do fake, não regra de domínio: quem cair aqui escreveu um log
    // que o Postgres recusaria, e isso é bug de código, não entrada de usuário.
    it('signals an index violation with a raw Error, never a domain error', async () => {
      await logs.save(
        aReadingLog({
          id: 'log-a',
          planItemId: PLAN_ITEM_ID,
          userId: READER_ID,
        }),
      );

      const error = await caught(
        logs.save(
          aReadingLog({
            id: 'log-b',
            planItemId: PLAN_ITEM_ID,
            userId: READER_ID,
          }),
        ),
      );

      expect(error.name).toBe('Error');
    });
  });

  describe('byPlanItemAndUser', () => {
    it('returns the log of that pair', async () => {
      const log = aReadingLog({
        id: 'log-a',
        planItemId: PLAN_ITEM_ID,
        userId: READER_ID,
      });
      await logs.save(log);

      expect(await logs.byPlanItemAndUser(PLAN_ITEM_ID, READER_ID)).toEqual(
        log,
      );
    });

    it('returns null when nobody marked that day', async () => {
      expect(await logs.byPlanItemAndUser(PLAN_ITEM_ID, READER_ID)).toBeNull();
    });

    /**
     * ⚠️ As DUAS metades da chave, e é o que faz a decisão E ser estrutural: o
     * log de outra pessoa é **inalcançável** por esta busca.
     */
    it('returns null for another reader on the same plan item', async () => {
      await logs.save(
        aReadingLog({ planItemId: PLAN_ITEM_ID, userId: READER_ID }),
      );

      expect(
        await logs.byPlanItemAndUser(PLAN_ITEM_ID, OTHER_READER_ID),
      ).toBeNull();
    });

    it('returns null for the same reader on another plan item', async () => {
      await logs.save(
        aReadingLog({ planItemId: PLAN_ITEM_ID, userId: READER_ID }),
      );

      expect(
        await logs.byPlanItemAndUser(OTHER_PLAN_ITEM_ID, READER_ID),
      ).toBeNull();
    });

    /** Regra 19 — o contador, com os dois lados. */
    it('counts every byPlanItemAndUser call, including the ones that found nothing', async () => {
      expect(logs.byPlanItemAndUserCalls).toBe(0);

      await logs.byPlanItemAndUser(PLAN_ITEM_ID, READER_ID);
      await logs.byPlanItemAndUser(PLAN_ITEM_ID, OTHER_READER_ID);
      await logs.byPlanItemAndUser(OTHER_PLAN_ITEM_ID, READER_ID);

      expect(logs.byPlanItemAndUserCalls).toBe(3);
    });

    // O Prisma devolve `Date` nova a cada leitura: mexer no que voltou não pode
    // alcançar o store.
    it('hands back a copy, not the stored row', async () => {
      await logs.save(
        aReadingLog({
          id: 'log-a',
          planItemId: PLAN_ITEM_ID,
          userId: READER_ID,
          readAt: new Date(READ_ISO),
        }),
      );

      const found = required(
        await logs.byPlanItemAndUser(PLAN_ITEM_ID, READER_ID),
      );
      found.readAt.setFullYear(1999);

      expect(
        required(
          await logs.byPlanItemAndUser(PLAN_ITEM_ID, READER_ID),
        ).readAt.toISOString(),
      ).toBe(READ_ISO);
    });
  });

  /**
   * O HARD DELETE, que é a exceção documentada ao soft delete do projeto: o
   * `ReadingLog` não tem `status` nem `archivedAt` para arquivar.
   */
  describe('delete', () => {
    it('removes the row for good', async () => {
      await logs.save(
        aReadingLog({
          id: 'log-a',
          planItemId: PLAN_ITEM_ID,
          userId: READER_ID,
        }),
      );

      await logs.delete('log-a');

      expect(logs.saved).toEqual([]);
      expect(await logs.byPlanItemAndUser(PLAN_ITEM_ID, READER_ID)).toBeNull();
    });

    it('removes only that row', async () => {
      await logs.save(aReadingLog({ id: 'log-a', userId: READER_ID }));
      await logs.save(
        aReadingLog({
          id: 'log-b',
          userId: OTHER_READER_ID,
        }),
      );

      await logs.delete('log-a');

      expect(logs.saved.map((log) => log.id)).toEqual(['log-b']);
    });

    /**
     * ⚠️ **IDEMPOTENTE: id inexistente não é erro** — e é contrato do port, não
     * indulgência do fake.
     *
     * O porquê, e **o que ali está medido contra o banco e o que não está**,
     * moram num lugar só: o docblock de `delete` em
     * `usecases/ports/reading-log-repository.ts`. Não é repetido aqui de
     * propósito — afirmação sobre o Postgres copiada de arquivo em arquivo é a
     * dívida do §7.1, e a última viajou por quatro antes de alguém medi-la.
     */
    it('does nothing and does not throw when the id was never saved', async () => {
      await logs.save(aReadingLog({ id: 'log-a' }));

      await logs.delete('log-que-nunca-existiu');

      expect(logs.saved.map((log) => log.id)).toEqual(['log-a']);
    });

    it('does nothing the second time the same id is deleted', async () => {
      await logs.save(aReadingLog({ id: 'log-a' }));

      await logs.delete('log-a');
      await logs.delete('log-a');

      expect(logs.saved).toEqual([]);
    });

    /**
     * Regra 19 — o contador, com o lado positivo E a chamada que não apagou
     * nada: é ela que separa "não chamou o repositório" de "chamou e a linha
     * não estava lá" (§7.3), que é exatamente o par que a regra 14 do
     * `unmarkRead` precisa distinguir.
     */
    it('counts every delete call, including the one that removed nothing', async () => {
      expect(logs.deleteCalls).toBe(0);

      await logs.save(aReadingLog({ id: 'log-a' }));
      await logs.delete('log-a');
      await logs.delete('log-que-nunca-existiu');

      expect(logs.deleteCalls).toBe(2);
    });
  });

  /**
   * ⚠️ Regra 18 — **A ARMADILHA DELIBERADA**, e o teste que a chama pelo nome
   * (§7.2). Não "conserte" esta ordem.
   *
   * O port **não promete ordem**, e a que o Postgres devolve sem `ORDER BY` é
   * indefinida de verdade (depende de plano de execução e de `VACUUM`). Então
   * "invertida" é tão fiel quanto qualquer outra — e é a única que **FALHA**
   * quando alguém confia na ordem do repositório, que foi o falso verde que a
   * Tarefa 07 descobriu.
   *
   * Ela nasce aqui **antes** do `find` da Tarefa 32, pelo mesmo motivo pelo
   * qual o fake do grifo a teve na Tarefa 22 sem `find`: quando o
   * `computeBookProgress` chegar, encontra a armadilha pronta em vez de uma
   * ordem "natural" de que alguém poderia depender no meio do caminho.
   *
   * Três logs, e não dois: com dois, "invertido" e "ordenado por id
   * decrescente" dariam o mesmo resultado.
   */
  it('enumerates in reverse insertion order', async () => {
    await logs.save(aReadingLog({ id: 'b-inserido-1o', userId: 'user-1' }));
    await logs.save(aReadingLog({ id: 'a-inserido-2o', userId: 'user-2' }));
    await logs.save(aReadingLog({ id: 'c-inserido-3o', userId: 'user-3' }));

    expect(logs.saved.map((log) => log.id)).toEqual([
      'c-inserido-3o',
      'a-inserido-2o',
      'b-inserido-1o',
    ]);
  });

  // Clone nos dois sentidos: nem o chamador contamina o store, nem o store
  // devolve referência sua. O Prisma devolve `Date` nova a cada leitura.
  it('does not let the caller mutate the stored row through what it passed in', async () => {
    const log = aReadingLog({ id: 'log-a', readAt: new Date(READ_ISO) });

    await logs.save(log);
    log.readAt.setFullYear(1999);

    expect(required(logs.saved[0]).readAt.toISOString()).toBe(READ_ISO);
  });

  it('does not let the caller mutate the stored row through what save returned', async () => {
    const returned = await logs.save(
      aReadingLog({ id: 'log-a', readAt: new Date(READ_ISO) }),
    );

    returned.readAt.setFullYear(1999);

    expect(required(logs.saved[0]).readAt.toISOString()).toBe(READ_ISO);
  });
});
