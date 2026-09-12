import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { NotificationDelivery } from '../../domain/notification-delivery';
import { PrismaNotificationDeliveryRepository } from '../prisma-notification-delivery-repository';
import { prefixedEmail, prefixedId, prisma, removeFixtures } from './_db';

/**
 * ⚠️ **REGRAS 11, 12 e 13 DA TAREFA 37** — o contrato do `claim` contra o
 * Postgres de verdade.
 *
 * É **este** arquivo que prova que o `ON CONFLICT DO NOTHING` está lá: o fake
 * recusa o segundo claim porque alguém o escreveu assim, e um fake que
 * concordasse com um banco errado seria o falso verde perfeito (§7.1).
 *
 * ⚠️ **E a regra 13 pede CONCORRÊNCIA DE VERDADE**, não dois claims em
 * sequência: um teste sequencial prova que a segunda leitura vê a primeira
 * escrita, que é a coisa fácil. O caso que a tabela existe para resolver é
 * **duas instâncias do dispatcher ao mesmo tempo** — duas conexões, nenhuma das
 * duas tendo visto a outra —, e é o `Promise.all` abaixo que o exercita.
 *
 * ⚠️ **A limpeza CONSULTA O BANCO** (§6.6), e aqui não é zelo: a Tarefa 34
 * mediu o preço de errar — uma FK nova quebrou o `afterAll` de **quatro**
 * arquivos **com os testes verdes**, e 261 eventos vazaram no banco de
 * desenvolvimento do dono. `NotificationDelivery_userId_fkey` é
 * `ON DELETE RESTRICT`, então uma reserva esquecida impede o `user.delete` de
 * toda limpeza que venha depois.
 *
 * Nada de `deleteMany({})`: os ids têm prefixo próprio (`t37`), e a consulta é
 * pelos usuários DESTE arquivo.
 */

const MARIA_ID = prefixedId('t37', 'nd-maria');
const MARCOS_ID = prefixedId('t37', 'nd-marcos');
const EVERY_USER_ID = [MARIA_ID, MARCOS_ID] as const;

/** Fixture de objeto é FACTORY, nunca `const` de `describe` (§7.7). */
function aDelivery(
  overrides: Partial<NotificationDelivery> = {},
): NotificationDelivery {
  return {
    id: prefixedId('t37', 'nd'),
    userId: MARIA_ID,
    kind: 'READING_REMINDER',
    // Notoriamente NÃO-HOJE (§7.8): fixture não depende do relógio.
    localDate: '2026-10-05',
    deliveredAt: new Date('2026-10-05T21:00:03.123Z'),
    ...overrides,
  };
}

/**
 * Apaga TODA reserva dos usuários deste arquivo, **consultando o banco**.
 *
 * Por consulta, e não por uma lista alimentada pelos testes, pelo motivo do
 * §6.6: um teste que falhe no meio deixa fixture para trás, e a lista não sabe
 * dela — a limpeza seguinte estoura na FK e o fixture vaza. Aqui a pergunta é
 * feita ao banco, então o que existe é o que some.
 */
async function cleanUpDeliveries(): Promise<void> {
  const rows = await prisma.notificationDelivery.findMany({
    where: { userId: { in: [...EVERY_USER_ID] } },
    select: { id: true },
  });
  if (rows.length > 0) {
    await prisma.notificationDelivery.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
  }
}

describe('PrismaNotificationDeliveryRepository (contract)', () => {
  const repo = new PrismaNotificationDeliveryRepository(prisma);

  beforeAll(async () => {
    // A reserva antes do usuário: a FK é RESTRICT.
    await cleanUpDeliveries();
    await removeFixtures({ userIds: [...EVERY_USER_ID] });

    for (const [id, label] of [
      [MARIA_ID, 'maria'],
      [MARCOS_ID, 'marcos'],
    ] as const) {
      await prisma.user.create({
        data: {
          id,
          email: prefixedEmail('t37', `nd-${label}`),
          name: 'Fixture Reader',
        },
      });
    }
  });

  afterAll(async () => {
    await cleanUpDeliveries();
    await removeFixtures({ userIds: [...EVERY_USER_ID] });
    await prisma.$disconnect();
  });

  /**
   * Cada teste começa sem reserva nenhuma: um teste de contrato não pode
   * depender do estado que outro deixou — um que dependia passava verde rodado
   * isolado, sem exercitar o filtro que dizia provar (§6.6).
   */
  beforeEach(async () => {
    await cleanUpDeliveries();
  });

  it('grants the first claim and writes the row exactly as the domain sent it', async () => {
    const delivery = aDelivery();

    await expect(repo.claim(delivery)).resolves.toBe(true);

    const row = await prisma.notificationDelivery.findUnique({
      where: { id: delivery.id },
    });
    expect(row).toEqual({
      id: delivery.id,
      userId: MARIA_ID,
      kind: 'READING_REMINDER',
      localDate: '2026-10-05',
      // ⚠️ Até o MILISSEGUNDO, e a asserção é sobre a COLUNA: é o dono do
      // instante sendo provado (ADR 0008), não o mapper devolvendo o que
      // recebeu.
      deliveredAt: new Date('2026-10-05T21:00:03.123Z'),
    });
  });

  /**
   * ⚠️ **REGRA 12 — a prova de que o `ON CONFLICT` existe: `true`, depois
   * `false`.**
   *
   * E a segunda tentativa **não escreve nada**: o `deliveredAt` que fica é o da
   * primeira. Sem esta segunda metade, um `ON CONFLICT DO UPDATE` escrito por
   * engano passaria — ele também devolveria linha, mas sobrescrevendo.
   */
  it('refuses the second claim of the same (userId, kind, localDate), and keeps the first row', async () => {
    const first = aDelivery();
    await expect(repo.claim(first)).resolves.toBe(true);

    const second = aDelivery({
      deliveredAt: new Date('2026-10-05T21:09:59.999Z'),
    });
    await expect(repo.claim(second)).resolves.toBe(false);

    const rows = await prisma.notificationDelivery.findMany({
      where: { userId: MARIA_ID },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(first.id);
    expect(rows[0]?.deliveredAt).toEqual(new Date('2026-10-05T21:00:03.123Z'));
    // E a linha da segunda tentativa não existe: `DO NOTHING` é nothing.
    await expect(
      prisma.notificationDelivery.count({ where: { id: second.id } }),
    ).resolves.toBe(0);
  });

  /**
   * ⚠️ **A CHAVE É DE TRÊS CAMPOS — e estes são os três lados que um índice
   * errado calaria em silêncio.**
   *
   * É o par positivo do teste acima: sem ele, um `@@unique([userId])` passaria
   * na recusa e ninguém veria que o lembrete de amanhã também estaria bloqueado.
   */
  it.each([
    ['another person', { userId: MARCOS_ID }],
    ['another kind', { kind: 'GROUP_ACTIVITY' as const }],
    ['another day', { localDate: '2026-10-06' }],
  ])('grants the claim of %s', async (_label, overrides) => {
    await expect(repo.claim(aDelivery())).resolves.toBe(true);

    await expect(repo.claim(aDelivery(overrides))).resolves.toBe(true);
    await expect(
      prisma.notificationDelivery.count({
        where: { userId: { in: [...EVERY_USER_ID] } },
      }),
    ).resolves.toBe(2);
  });

  /**
   * ⚠️ **REGRA 13 — DOIS DISPATCHERS AO MESMO TEMPO, e EXATAMENTE UM ganha.**
   *
   * É o caso que a tabela existe para resolver, e o teste sequencial acima
   * **não o prova**: lá a segunda chamada já vê a primeira escrita commitada.
   * Aqui as duas saem juntas, sem que nenhuma tenha visto a outra — que é o
   * deploy com duas instâncias, ou o cron que disparou duas vezes.
   *
   * ⚠️ **O `Promise.all` não garante paralelismo de verdade sozinho** (o pool
   * do Prisma pode serializar), e é por isso que a asserção é sobre o
   * RESULTADO do banco — um `true` e um `false`, uma linha só — e não sobre o
   * tempo: se elas forem serializadas, o teste ainda é o teste sequencial e
   * continua correto; se forem paralelas, ele é o de concorrência. Nunca dá
   * falso verde, e é o oposto de um teste de cronômetro (§7.3).
   */
  it('lets exactly ONE of two simultaneous claims win', async () => {
    const results = await Promise.all([
      repo.claim(aDelivery()),
      repo.claim(aDelivery()),
    ]);

    expect(results.filter((granted) => granted)).toHaveLength(1);
    expect(results.filter((granted) => !granted)).toHaveLength(1);
    await expect(
      prisma.notificationDelivery.count({ where: { userId: MARIA_ID } }),
    ).resolves.toBe(1);
  });

  /**
   * ⚠️ **E com DEZ ao mesmo tempo continua sendo exatamente um.**
   *
   * Dois poderiam ganhar por sorte de escalonamento se o índice não existisse
   * e a janela fosse curta; dez tornam a sorte improvável o bastante para o
   * teste acusar. A conta não depende de tempo — depende do índice.
   */
  it('still lets exactly ONE win with ten simultaneous claims', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => repo.claim(aDelivery())),
    );

    expect(results.filter((granted) => granted)).toHaveLength(1);
    await expect(
      prisma.notificationDelivery.count({ where: { userId: MARIA_ID } }),
    ).resolves.toBe(1);
  });

  /**
   * ⚠️ **O `localDate` é TEXTO no banco, e a comparação é BYTE A BYTE.**
   *
   * É a decisão F medida contra o Postgres: se a coluna fosse `@db.Date`,
   * `'2026-10-5'` e `'2026-10-05'` seriam o **mesmo dia** e o segundo claim
   * seria recusado. Sendo texto, são chaves diferentes — e é isso que faz duas
   * pessoas em fusos diferentes terem reservas independentes no mesmo instante.
   *
   * Nenhum caminho produz `'2026-10-5'` hoje (o `localDay` sempre devolve dois
   * dígitos); o teste existe para o fake e o banco discordarem do MESMO jeito.
   */
  it('stores the calendar day as TEXT, compared byte by byte', async () => {
    await expect(
      repo.claim(aDelivery({ localDate: '2026-10-05' })),
    ).resolves.toBe(true);

    await expect(
      repo.claim(aDelivery({ localDate: '2026-10-5' })),
    ).resolves.toBe(true);

    const [column] = await prisma.$queryRaw<{ data_type: string }[]>`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'NotificationDelivery' AND column_name = 'localDate'
    `;
    expect(column?.data_type).toBe('text');
  });

  /**
   * ⚠️ **AS COLUNAS, LIDAS DO `information_schema` — cinco e nada mais.**
   *
   * A ausência é a decisão (ver o docblock da entidade). Um `planItemId` que
   * alguém acrescentasse aqui faria o claim mudar de chave quando o admin
   * editasse o plano, e o lembrete sairia duas vezes — que é a decisão J.
   */
  it('has exactly the five columns of the claim', async () => {
    const columns = await prisma.$queryRaw<
      { column_name: string; is_nullable: string }[]
    >`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'NotificationDelivery'
      ORDER BY column_name
    `;

    expect(columns).toEqual([
      { column_name: 'deliveredAt', is_nullable: 'NO' },
      { column_name: 'id', is_nullable: 'NO' },
      { column_name: 'kind', is_nullable: 'NO' },
      { column_name: 'localDate', is_nullable: 'NO' },
      { column_name: 'userId', is_nullable: 'NO' },
    ]);
  });

  /**
   * ⚠️ **DECISÃO J, LIDA DO CATÁLOGO: a ÚNICA foreign key aponta para `User`.**
   *
   * Não é o comentário do schema afirmando — é o Postgres respondendo. É o que
   * mantém a guarda estrutural da Tarefa 34b verde pelo motivo certo: esta
   * tabela recusa a remoção de uma **pessoa**, nunca a de um **dia do plano**.
   */
  it('has ONE foreign key, to User, and none to ReadingPlanItem', async () => {
    const rows = await prisma.$queryRaw<
      { constraint_name: string; referenced: string; rule: string }[]
    >`
      SELECT rc.constraint_name,
             ccu.table_name AS referenced,
             rc.delete_rule AS rule
      FROM information_schema.referential_constraints rc
      JOIN information_schema.table_constraints tc
        ON tc.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = rc.constraint_name
      WHERE tc.table_name = 'NotificationDelivery'
      ORDER BY rc.constraint_name
    `;

    expect(rows).toEqual([
      {
        constraint_name: 'NotificationDelivery_userId_fkey',
        referenced: 'User',
        rule: 'RESTRICT',
      },
    ]);
  });

  /**
   * ⚠️ **A ÚNICA chave única é a do claim, lida do catálogo.**
   *
   * Se alguém acrescentasse um `@@unique` a mais (ou trocasse a ordem das
   * colunas dele), o `ON CONFLICT ("userId", "kind", "localDate")` do SQL
   * deixaria de casar um índice e o `claim` passaria a **lançar** — o lembrete
   * de todo mundo viraria erro, de uma vez.
   */
  it('has exactly two indexes: the primary key and the claim key', async () => {
    const rows = await prisma.$queryRaw<
      { indexname: string; indexdef: string }[]
    >`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'NotificationDelivery'
      ORDER BY indexname
    `;

    // A chave primária conta como índice único no catálogo do Postgres — daí
    // duas linhas, e não uma. Nomear as duas é o que faz um índice a mais
    // (custo de escrita à toa) aparecer aqui.
    expect(rows.map((row) => row.indexname)).toEqual([
      'NotificationDelivery_pkey',
      'NotificationDelivery_userId_kind_localDate_key',
    ]);
    expect(rows[1]?.indexdef).toContain('UNIQUE');
    // ⚠️ **A ORDEM DAS COLUNAS É PARTE DO CONTRATO** — é ela que o
    // `ON CONFLICT ("userId", "kind", "localDate")` do `claim` tem de casar. E
    // o regex, e não um `toContain` de string literal, porque o Postgres cita
    // só o que precisa de citação: `"userId"` e `"localDate"` vêm com aspas
    // (têm maiúscula) e `kind` vem **sem** — medido nesta fatia, e um literal
    // escrito à mão erra isso em silêncio.
    expect(rows[1]?.indexdef).toMatch(/\("userId", kind, "localDate"\)/);
  });

  /**
   * ⚠️ **A REDE EMBAIXO DA FK, do outro lado:** com uma reserva viva, apagar a
   * pessoa FALHA. É o que a limpeza deste arquivo (e o `removeFixtures`) tem de
   * respeitar — e foi exatamente esta classe de FK que quebrou o `afterAll` de
   * quatro arquivos na Tarefa 34.
   */
  it('refuses to delete a person who still has a claim', async () => {
    const claimed = aDelivery({ userId: MARCOS_ID });
    await repo.claim(claimed);

    await expect(
      prisma.user.delete({ where: { id: MARCOS_ID } }),
    ).rejects.toThrow();

    // E o par: sem a reserva, nada impede — provado sem apagar o fixture do
    // arquivo, com a contagem de volta a zero.
    await prisma.notificationDelivery.delete({ where: { id: claimed.id } });
    await expect(
      prisma.notificationDelivery.count({ where: { userId: MARCOS_ID } }),
    ).resolves.toBe(0);
  });

  /**
   * ⚠️ **O portão do `kind` roda ANTES do INSERT, e nada é gravado.**
   *
   * A coluna é `String` (decisão G), então o banco aceitaria qualquer texto — e
   * um `kind` torto gravado seria uma reserva que **nunca colide com nada**,
   * ou seja, um lembrete que sai todo dia, para sempre, sem erro.
   */
  it('refuses a kind outside the vocabulary, and writes nothing', async () => {
    const bogus = aDelivery({
      kind: 'READING_REMINDER_2' as NotificationDelivery['kind'],
    });

    await expect(repo.claim(bogus)).rejects.toThrow(/kind must be one of/);
    await expect(
      prisma.notificationDelivery.count({ where: { id: bogus.id } }),
    ).resolves.toBe(0);
  });
});
