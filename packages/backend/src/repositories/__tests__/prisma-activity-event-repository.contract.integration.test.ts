import { randomUUID } from 'node:crypto';

import { ACTIVITY_FEED_DEFAULT_LIMIT } from '@clube/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ActivityEvent } from '../../domain/activity-event';
import { required } from '../../test-support/builders';
import { PrismaActivityEventRepository } from '../prisma-activity-event-repository';
import { PrismaReadingPlanItemRepository } from '../prisma-reading-plan-item-repository';
import { prefixedEmail, prefixedId, prisma, removeFixtures } from './_db';

const CLUB_ID = prefixedId('t34', 'act-club');
const OTHER_CLUB_ID = prefixedId('t34', 'act-otherclub');
const MARIA_ID = prefixedId('t34', 'act-maria');
const MARCOS_ID = prefixedId('t34', 'act-marcos');
const BOOK_ID = prefixedId('t34', 'act-book');
const FOREIGN_BOOK_ID = prefixedId('t34', 'act-foreignbook');
/** Livro só da lacuna da decisão H: o plano dele é reescrito dentro do teste. */
const GAP_BOOK_ID = prefixedId('t34', 'act-gapbook');

const DAY_ONE = prefixedId('t34', 'act-day-one');
const DAY_TWO = prefixedId('t34', 'act-day-two');
const FOREIGN_DAY = prefixedId('t34', 'act-foreign-day');

const EVERY_CLUB_ID = [CLUB_ID, OTHER_CLUB_ID] as const;
const EVERY_BOOK_ID = [BOOK_ID, FOREIGN_BOOK_ID, GAP_BOOK_ID] as const;

const PLAN_CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
/** Com milissegundos NÃO zerados: é o que a regra do round-trip mede. */
const CREATED_AT = new Date('2026-10-01T18:30:45.123Z');

/**
 * Todo evento criado por este arquivo, para a limpeza. Não é uma lista
 * "esperada": o `afterAll` também CONSULTA o banco pelos clubes do arquivo,
 * então um teste que falhe no meio não vaza fixture, e a limpeza não estoura na
 * FK do plano (`docs/CONVENCOES-CODIGO.md` §6.6).
 */
const eventIds: string[] = [];
/** Itens de plano criados DENTRO de um teste, fora do seed do arquivo. */
const extraPlanItemIds: string[] = [];

function trackedEventId(prefix: string): string {
  const id = prefixedId('t34', `act-${prefix}`);
  eventIds.push(id);
  return id;
}

function trackedPlanItemId(prefix: string): string {
  const id = prefixedId('t34', `act-plan-${prefix}`);
  extraPlanItemIds.push(id);
  return id;
}

/**
 * ⚠️ **OS IDS DA ORDENAÇÃO, e eles NÃO saem do `prefixedId`** (§7.2: fixture de
 * ordenação se escolhe para a implementação errada **falhar**).
 *
 * O `prefixedId` termina num `randomUUID()`, então a ordem alfabética dos ids
 * seria SORTEADA a cada execução — e uma sorte favorável faria `orderBy: id`
 * coincidir com `createdAt desc` de vez em quando, que é exatamente o falso
 * verde intermitente que a Tarefa 11 descobriu no `planItemWritersByBook`.
 *
 * Aqui o sufixo aleatório é UM SÓ para os três (basta para não colidir com uma
 * execução interrompida), e o que varia é o número na frente dele — então a
 * ordem alfabética é conhecida, escolhida e **pinada** dentro do teste.
 */
const ORDER_RUN = randomUUID();
function orderedId(n: 1 | 2 | 3): string {
  const id = `t34-act-ord${n}-${ORDER_RUN}`;
  eventIds.push(id);
  return id;
}

/**
 * Um evento do feed. O `prefix` é o que dá o id — e nunca vem do `overrides` de
 * propósito: id que não passa por aqui não entra na lista de limpeza.
 */
function anEvent(
  prefix: string,
  overrides: Partial<ActivityEvent> = {},
): ActivityEvent {
  return {
    id: trackedEventId(prefix),
    clubId: CLUB_ID,
    userId: MARIA_ID,
    type: 'PLAN_NOTE',
    bookId: BOOK_ID,
    planItemId: DAY_ONE,
    subjectId: prefixedId('t34', 'act-subject'),
    createdAt: CREATED_AT,
    ...overrides,
  };
}

/** Apaga TODO evento dos clubes deste arquivo, por id, consultando o banco. */
async function cleanUpEvents(): Promise<void> {
  const ofClubs = await prisma.activityEvent.findMany({
    where: { clubId: { in: [...EVERY_CLUB_ID] } },
    select: { id: true },
  });
  const ids = [...new Set([...eventIds, ...ofClubs.map((row) => row.id)])];
  if (ids.length > 0) {
    await prisma.activityEvent.deleteMany({ where: { id: { in: ids } } });
  }
}

async function cleanUpPlan(): Promise<void> {
  const ofBooks = await prisma.readingPlanItem.findMany({
    where: { bookId: { in: [...EVERY_BOOK_ID] } },
    select: { id: true },
  });
  await removeFixtures({
    planItemIds: [
      ...new Set([...extraPlanItemIds, ...ofBooks.map((item) => item.id)]),
    ],
  });
}

describe('PrismaActivityEventRepository (contract)', () => {
  const repo = new PrismaActivityEventRepository(prisma);
  const planRepo = new PrismaReadingPlanItemRepository(prisma);

  beforeAll(async () => {
    // O evento antes do plano, e o plano antes do livro: as FKs são RESTRICT.
    await cleanUpEvents();
    await cleanUpPlan();
    await removeFixtures({
      bookIds: [...EVERY_BOOK_ID],
      clubIds: [...EVERY_CLUB_ID],
      userIds: [MARIA_ID, MARCOS_ID],
    });

    for (const [id, label] of [
      [MARIA_ID, 'maria'],
      [MARCOS_ID, 'marcos'],
    ] as const) {
      await prisma.user.create({
        data: {
          id,
          email: prefixedEmail('t34', `act-${label}`),
          name: 'Fixture Reader',
        },
      });
    }
    await prisma.club.create({
      data: { id: CLUB_ID, name: 'Clube da Leitura' },
    });
    await prisma.club.create({
      data: { id: OTHER_CLUB_ID, name: 'Outro Clube' },
    });
    for (const [id, clubId] of [
      [BOOK_ID, CLUB_ID],
      [GAP_BOOK_ID, CLUB_ID],
      [FOREIGN_BOOK_ID, OTHER_CLUB_ID],
    ] as const) {
      await prisma.book.create({
        data: {
          id,
          clubId,
          title: 'O Hobbit',
          month: '2026-10',
          createdById: MARIA_ID,
        },
      });
    }
    await planRepo.saveMany([
      planItem(DAY_ONE, BOOK_ID, 0, '2026-10-01', 'Cap. 1'),
      planItem(DAY_TWO, BOOK_ID, 1, '2026-10-02', 'Cap. 2'),
      planItem(FOREIGN_DAY, FOREIGN_BOOK_ID, 0, '2026-10-01', 'Cap. 1'),
    ]);
  });

  afterAll(async () => {
    await cleanUpEvents();
    await cleanUpPlan();
    await removeFixtures({
      bookIds: [...EVERY_BOOK_ID],
      clubIds: [...EVERY_CLUB_ID],
      userIds: [MARIA_ID, MARCOS_ID],
    });
    await prisma.$disconnect();
  });

  /**
   * Cada teste começa sem evento nenhum dos clubes do arquivo: um teste de
   * contrato não pode depender do estado que outro deixou — um que dependia
   * passava verde rodado isolado, sem exercitar o filtro que dizia provar
   * (§6.6).
   */
  beforeEach(async () => {
    await prisma.activityEvent.deleteMany({
      where: { clubId: { in: [...EVERY_CLUB_ID] } },
    });
    if (extraPlanItemIds.length > 0) {
      await prisma.readingPlanItem.deleteMany({
        where: { id: { in: extraPlanItemIds } },
      });
    }
  });

  describe('save', () => {
    // Regra 5
    it('creates the event and maps every field back', async () => {
      const event = anEvent('create');

      const saved = await repo.save(event);

      expect(saved).toEqual(event);
      expect(saved.createdAt).toBeInstanceOf(Date);
      // ...e o que voltou do banco numa SEGUNDA leitura é o mesmo.
      expect(await repo.find({ clubId: CLUB_ID })).toEqual([event]);
    });

    /**
     * ⚠️ O `createdAt` é do DOMÍNIO (ADR 0008), com precisão de milissegundo, e
     * a asserção é sobre a COLUNA — não só sobre o que o mapper devolveu.
     *
     * Aqui ele importa mais que de costume: é por ele que o feed se ordena, e
     * um instante que o banco escolhesse (o `@default(now())`, que existe como
     * rede de segurança) embaralharia a ordem do produto.
     */
    it('stores the createdAt the domain sent, down to the millisecond', async () => {
      const event = anEvent('instant');

      await repo.save(event);

      const rows = await prisma.$queryRaw<{ at: string }[]>`
        SELECT to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS at
        FROM "ActivityEvent" WHERE "id" = ${event.id}
      `;
      expect(required(rows[0]).at).toBe('2026-10-01T18:30:45.123');
    });

    /** O `null` do avulso e do grifo atravessa como ausência, não como texto. */
    it('stores a null planItemId for the free note and the highlight', async () => {
      const event = anEvent('freenote', {
        type: 'FREE_NOTE',
        planItemId: null,
      });

      const saved = await repo.save(event);

      expect(saved.planItemId).toBeNull();
      const rows = await prisma.$queryRaw<{ nulls: boolean }[]>`
        SELECT "planItemId" IS NULL AS nulls
        FROM "ActivityEvent" WHERE "id" = ${event.id}
      `;
      expect(required(rows[0]).nulls).toBe(true);
    });

    // Upsert por `id`, a convenção dos outros repositórios (Tarefa 03) — e é o
    // que o `ActivityEventRepositoryFake` já pina no unitário.
    it('updates in place when the same id is saved again', async () => {
      const first = anEvent('upsert');
      await repo.save(first);

      const again = await repo.save({ ...first, subjectId: 'note-2' });

      expect(again.id).toBe(first.id);
      expect(again.subjectId).toBe('note-2');
      await expect(
        prisma.activityEvent.count({ where: { clubId: CLUB_ID } }),
      ).resolves.toBe(1);
    });

    /**
     * ⚠️ **NENHUM `@@unique`, e é o caso central do produto.** Escrever a
     * anotação do dia 1 e a do dia 2 são dois acontecimentos; duas pessoas
     * escrevendo no mesmo dia, idem. Um índice único em qualquer par disto
     * transformaria o segundo evento em `P2002` — e o
     * `handle-domain-error.ts` **não mapeia `P2002`**, então sairia 500 na
     * escrita de alguém.
     *
     * É o outro lado do teste de cima: sem ele, um repositório que recusasse
     * toda segunda linha passaria no upsert e quebraria o feed.
     */
    it('keeps four events of the same person, the same day and the same book', async () => {
      await repo.save(anEvent('many-a'));
      await repo.save(anEvent('many-b'));
      await repo.save(anEvent('many-c', { userId: MARCOS_ID }));
      await repo.save(anEvent('many-d', { type: 'READ' }));

      await expect(
        prisma.activityEvent.count({ where: { clubId: CLUB_ID } }),
      ).resolves.toBe(4);
    });

    it('stores the four types of the vocabulary', async () => {
      await repo.save(anEvent('type-plan', { type: 'PLAN_NOTE' }));
      await repo.save(
        anEvent('type-free', { type: 'FREE_NOTE', planItemId: null }),
      );
      await repo.save(
        anEvent('type-hl', { type: 'HIGHLIGHT', planItemId: null }),
      );
      await repo.save(anEvent('type-read', { type: 'READ' }));

      const found = await repo.find({ clubId: CLUB_ID });
      expect(found.map((event) => event.type).sort()).toEqual([
        'FREE_NOTE',
        'HIGHLIGHT',
        'PLAN_NOTE',
        'READ',
      ]);
    });
  });

  describe('find', () => {
    /**
     * ⚠️ **REGRA 6 — `createdAt` DESC, e a ordem É o produto.**
     *
     * Diferente de todo outro `find` do projeto, que declara não prometer
     * ordem: um feed é cronologia invertida por definição, então aqui a ordem
     * é CONTRATO do port e tem teste contra o banco.
     *
     * ⚠️ **A fixture é HOSTIL, e as quatro precondições estão pinadas** (§7.2:
     * fixture de ordenação se escolhe para a implementação errada **falhar**;
     * se você não mediu que ela falha, você não tem o teste que o nome
     * promete). As quatro implementações erradas plausíveis dão resultados
     * DIFERENTES do esperado:
     *
     * ```
     * esperado (createdAt desc)   ord2, ord3, ord1
     * sem orderBy (inserção)      ord3, ord1, ord2
     * orderBy id asc              ord1, ord2, ord3
     * orderBy id desc             ord3, ord2, ord1
     * orderBy createdAt asc       ord1, ord3, ord2
     * ```
     */
    it('returns the newest first, with insertion order and clock disagreeing', async () => {
      const oldest = orderedId(1);
      const newest = orderedId(2);
      const middle = orderedId(3);

      // A ordem de INSERÇÃO é a terceira permutação: nem a esperada, nem a
      // inversa dela.
      await repo.save(
        anEvent('ord-m', {
          id: middle,
          createdAt: new Date('2026-10-02T00:00:00.000Z'),
        }),
      );
      await repo.save(
        anEvent('ord-o', {
          id: oldest,
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
        }),
      );
      await repo.save(
        anEvent('ord-n', {
          id: newest,
          createdAt: new Date('2026-10-03T00:00:00.000Z'),
        }),
      );

      // As PRECONDIÇÕES, sem as quais o teste pode passar por coincidência.
      expect(oldest < newest).toBe(true);
      expect(newest < middle).toBe(true);

      const found = await repo.find({ clubId: CLUB_ID });

      expect(found.map((event) => event.id)).toEqual([newest, middle, oldest]);
    });

    /**
     * ⚠️ **O DESEMPATE POR `id`, e ele não é decoração:** `createdAt desc`
     * sozinho não é ordem total, e empate no mesmo milissegundo é o caso normal
     * de um clube (duas pessoas escrevendo ao mesmo tempo, o retry da fila
     * offline). Sem desempate, quem cai dentro do `take` na fronteira é
     * escolhido pelo plano de execução — e duas chamadas iguais trariam
     * eventos diferentes.
     *
     * A precondição pina que o esperado NÃO é a ordem de inserção.
     */
    it('breaks a createdAt tie by id, ascending', async () => {
      const second = orderedId(2);
      const first = orderedId(1);
      const tie = new Date('2026-10-05T12:00:00.000Z');

      await repo.save(anEvent('tie-b', { id: second, createdAt: tie }));
      await repo.save(anEvent('tie-a', { id: first, createdAt: tie }));

      expect(first < second).toBe(true);

      const found = await repo.find({ clubId: CLUB_ID });

      expect(found.map((event) => event.id)).toEqual([first, second]);
    });

    /**
     * ⚠️ **REGRA 7 — NADA de outro clube atravessa**, provado com dois clubes
     * no banco, e não com um.
     *
     * O `clubId` é o corte de tenant do feed, e é o único filtro do port: o
     * `ActivityEventFilter` não tem `bookId`, `userId` nem `type` (escopo).
     */
    it('never returns an event of another club', async () => {
      const mine = await repo.save(anEvent('tenant-mine'));
      const theirs = await repo.save(
        anEvent('tenant-theirs', {
          clubId: OTHER_CLUB_ID,
          bookId: FOREIGN_BOOK_ID,
          planItemId: FOREIGN_DAY,
        }),
      );

      await expect(repo.find({ clubId: CLUB_ID })).resolves.toEqual([mine]);
      // A precondição: o evento do outro clube EXISTE, e é achado pelo clube
      // dele — senão um `find` que devolvesse vazio passaria neste teste.
      await expect(repo.find({ clubId: OTHER_CLUB_ID })).resolves.toEqual([
        theirs,
      ]);
    });

    it('returns an empty list for a club where nothing happened', async () => {
      await repo.save(anEvent('empty-other'));

      await expect(
        repo.find({ clubId: prefixedId('t34', 'act-club-ghost') }),
      ).resolves.toEqual([]);
    });

    /**
     * ⚠️ **REGRA 8, primeira metade — o `limit` é HONRADO, e ele corta as mais
     * RECENTES.** É o que faz o parâmetro da decisão D ser útil: uma tela que
     * mostra dois eventos pede dois, e recebe os dois últimos, não dois
     * quaisquer.
     */
    it('honours the limit, keeping the newest', async () => {
      const newest = orderedId(1);
      const middle = orderedId(2);
      await repo.save(
        anEvent('lim-n', {
          id: newest,
          createdAt: new Date('2026-10-03T00:00:00.000Z'),
        }),
      );
      await repo.save(
        anEvent('lim-m', {
          id: middle,
          createdAt: new Date('2026-10-02T00:00:00.000Z'),
        }),
      );
      await repo.save(
        anEvent('lim-o', { createdAt: new Date('2026-10-01T00:00:00.000Z') }),
      );

      await expect(
        (await repo.find({ clubId: CLUB_ID, limit: 2 })).map(
          (event) => event.id,
        ),
      ).toEqual([newest, middle]);
      // A precondição: sem o limite as TRÊS voltam, então o 2 acima é o corte
      // e não o tamanho do acervo.
      expect(await repo.find({ clubId: CLUB_ID })).toHaveLength(3);
    });

    /**
     * ⚠️ **REGRA 8, segunda metade — sem `limit`, o padrão DOCUMENTADO manda.**
     *
     * A prova é de COMPORTAMENTO, e não uma asserção sobre o texto do SQL: são
     * `ACTIVITY_FEED_DEFAULT_LIMIT + 1` eventos no banco, e o mais antigo é
     * exatamente o que fica de fora. Um `take` ausente devolveria os
     * `+1`; um `take` de outro número devolveria outra contagem; um `take` sem
     * a ordem certa deixaria de fora outro evento.
     *
     * As linhas são baratas — oito colunas escalares, nenhum JSON —, e saem no
     * `beforeEach` do arquivo.
     */
    it('falls back to the documented default when nobody asks for a limit', async () => {
      const oldestOfAll = trackedEventId('default-oldest');
      await prisma.activityEvent.createMany({
        data: [
          {
            id: oldestOfAll,
            clubId: CLUB_ID,
            userId: MARIA_ID,
            type: 'READ',
            bookId: BOOK_ID,
            planItemId: DAY_ONE,
            subjectId: 'log-oldest',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
          ...Array.from({ length: ACTIVITY_FEED_DEFAULT_LIMIT }, (_, i) => ({
            id: trackedEventId(`default-${i}`),
            clubId: CLUB_ID,
            userId: MARIA_ID,
            type: 'READ',
            bookId: BOOK_ID,
            planItemId: DAY_ONE,
            subjectId: `log-${i}`,
            createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, i)),
          })),
        ],
      });

      const found = await repo.find({ clubId: CLUB_ID });

      expect(found).toHaveLength(ACTIVITY_FEED_DEFAULT_LIMIT);
      // A precondição que dá dente: há MAIS de um padrão no banco, e o que
      // ficou de fora é o mais antigo — não um qualquer.
      await expect(
        prisma.activityEvent.count({ where: { clubId: CLUB_ID } }),
      ).resolves.toBe(ACTIVITY_FEED_DEFAULT_LIMIT + 1);
      expect(found.map((event) => event.id)).not.toContain(oldestOfAll);
    });

    /** Um limite maior que o acervo devolve o acervo, sem inventar linha. */
    it('returns everything when the limit is bigger than the club', async () => {
      await repo.save(anEvent('big-a'));
      await repo.save(anEvent('big-b'));

      await expect(
        repo.find({ clubId: CLUB_ID, limit: 100 }),
      ).resolves.toHaveLength(2);
    });

    /**
     * ⚠️ **A PRECONDIÇÃO DO PAR ABAIXO, e ela é sobre o PRISMA, não sobre nós:
     * o `take` é COM SINAL.**
     *
     * `take: -2` não é "menos dois, que não faz sentido, então erro": o Prisma
     * o traduz numa consulta que devolve **a ponta OPOSTA** — os mais ANTIGOS
     * —, e `take: 0` devolve nada. Nenhum dos dois lança.
     *
     * É a forma do §7.1 que esconde melhor ("vazio × resultado ERRADO"): sem
     * esta medição colada, o teste seguinte pareceria paranoia, e a proteção
     * que ele guarda seria apagada no primeiro refactor por "não fazer nada".
     * A regra §7.1 existe para isto — afirmação sobre o banco sem medição é
     * suposição com cara de fato.
     */
    it('states the precondition: a negative take asks Prisma for the OPPOSITE end', async () => {
      const oldest = orderedId(1);
      const newest = orderedId(2);
      await repo.save(
        anEvent('signed-o', {
          id: oldest,
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
        }),
      );
      await repo.save(
        anEvent('signed-n', {
          id: newest,
          createdAt: new Date('2026-10-03T00:00:00.000Z'),
        }),
      );

      const raw = await prisma.activityEvent.findMany({
        where: { clubId: CLUB_ID },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: -1,
      });

      expect(raw.map((row) => row.id)).toEqual([oldest]);
      // ...e é literalmente o oposto do que o feed pede.
      expect(raw.map((row) => row.id)).not.toEqual([newest]);
    });

    /**
     * ⚠️ **O `take` NUNCA sai daqui negativo nem zero — e a proteção mora no
     * REPOSITÓRIO, que é a fronteira que o Prisma vê.**
     *
     * Hoje o `min(1)` do `listActivityQuerySchema` já barra na borda, mas o
     * port aceita `number` e a rota **não é o único chamador previsto**: o
     * docblock do `recordActivity` e o ADR 0006 nomeiam o push
     * `GROUP_ACTIVITY` da **Tarefa 38** como o segundo leitor, e ele não passa
     * por Zod nenhum. Um `limit` calculado que desse `-1` ou `0` devolveria o
     * feed invertido, ou vazio, **sem erro e sem ninguém notar**.
     *
     * O dono da normalização é o `activityFeedTake` do port — um lugar só, e o
     * fake chama o mesmo.
     */
    it('never asks for the opposite end, whatever the limit says', async () => {
      const oldest = orderedId(1);
      const newest = orderedId(2);
      await repo.save(
        anEvent('clamp-o', {
          id: oldest,
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
        }),
      );
      await repo.save(
        anEvent('clamp-n', {
          id: newest,
          createdAt: new Date('2026-10-03T00:00:00.000Z'),
        }),
      );

      // Negativo: o corte vira UM, e é o mais RECENTE — nunca o mais antigo.
      await expect(
        (await repo.find({ clubId: CLUB_ID, limit: -1 })).map((e) => e.id),
      ).toEqual([newest]);
      await expect(
        (await repo.find({ clubId: CLUB_ID, limit: -50 })).map((e) => e.id),
      ).toEqual([newest]);
      // Zero: um feed vazio seria indistinguível de "nada aconteceu".
      await expect(
        (await repo.find({ clubId: CLUB_ID, limit: 0 })).map((e) => e.id),
      ).toEqual([newest]);
      // Fração: trunca para baixo, nunca vai inteira para o `take`.
      expect(await repo.find({ clubId: CLUB_ID, limit: 1.9 })).toHaveLength(1);
    });
  });

  /**
   * ⚠️ **DECISÃO H, a consequência MEDIDA — e ela é REPORTE, não conserto.**
   *
   * O `ActivityEvent.planItemId` é a **terceira** FK `RESTRICT` apontando para
   * o `ReadingPlanItem`, ao lado de `Note_planItemId_fkey` e
   * `ReadingLog_planItemId_fkey`. As duas primeiras têm guarda de domínio na
   * frente no `replacePlanItems` (`planItemIdsWithAnyNote` e
   * `planItemIdsWithAnyReadingLog`), que dão **400 com mensagem**; esta **não
   * tem** — então remover um dia que só tem EVENTO estoura na FK, como erro de
   * banco, e a borda o relança em **500**.
   *
   * É exatamente a lacuna que a Tarefa 32 registrou para o `ReadingLog` e que a
   * **32c** consertou — e é assim que a 32c nasceu. Fica pinada aqui, com o
   * nome dizendo o que é, para o próximo leitor não precisar descobrir de novo.
   *
   * ⚠️ E a rede continua sendo a certa: tirar o `Restrict` "porque não há
   * guarda" trocaria uma proteção estrutural por nenhuma. O dado está a salvo —
   * o `replaceForBook` roda em `$transaction`, e o `after` prova que nem o dia
   * condenado nem o sobrevivente se mexeram.
   */
  describe('the planItem foreign key', () => {
    it('is a third reason the plan replacement can fail, and no domain guard covers it', async () => {
      const doomed = trackedPlanItemId('gap-doomed');
      const survivor = trackedPlanItemId('gap-survivor');
      await planRepo.saveMany([
        planItem(survivor, GAP_BOOK_ID, 0, '2026-11-01', 'Cap. 1'),
        planItem(doomed, GAP_BOOK_ID, 1, '2026-11-02', 'Cap. 2'),
      ]);
      await repo.save(
        anEvent('gap', { bookId: GAP_BOOK_ID, planItemId: doomed }),
      );

      // As precondições: NENHUMA nota e NENHUMA leitura ancoram este dia — a
      // rede que morde abaixo é a FK do EVENTO, e só ela.
      await expect(
        prisma.note.count({ where: { planItemId: doomed } }),
      ).resolves.toBe(0);
      await expect(
        prisma.readingLog.count({ where: { planItemId: doomed } }),
      ).resolves.toBe(0);

      await expect(
        planRepo.replaceForBook(GAP_BOOK_ID, {
          upsert: [planItem(survivor, GAP_BOOK_ID, 0, '2026-11-01', 'Cap. 1')],
          removeIds: [doomed],
        }),
      ).rejects.toThrow();

      const after = await planRepo.findByBook(GAP_BOOK_ID);
      expect(after.map((item) => item.id).sort()).toEqual(
        [survivor, doomed].sort(),
      );
    });

    // O outro lado: sem evento, o dia se apaga normalmente. Sem este par, um
    // `Restrict` que barrasse TODA remoção passaria no teste de cima.
    it('deletes a plan item that has no activity event', async () => {
      const dayId = trackedPlanItemId('noevent');
      await planRepo.saveMany([
        planItem(dayId, BOOK_ID, 8, '2026-10-08', 'Cap. 8'),
      ]);

      await prisma.readingPlanItem.delete({ where: { id: dayId } });

      await expect(
        prisma.readingPlanItem.count({ where: { id: dayId } }),
      ).resolves.toBe(0);
    });
  });

  /**
   * ⚠️ REGRAS 1 e 3 — o schema lido do CATÁLOGO DO POSTGRES, não do arquivo.
   * O que importa é o que o banco tem.
   */
  describe('the schema in the database', () => {
    /**
     * ⚠️ REGRA 1 — **OITO colunas e nada mais.** É a única forma de provar as
     * AUSÊNCIAS: nenhum teste de comportamento acusa um `status`, um
     * `archivedAt` ou um `updatedAt` que ninguém escreve, e é assim que uma
     * coluna morta entra e fica. Ela também é a guarda do "o evento guarda
     * referência, nunca conteúdo" — um `title` ou um `excerpt` na tabela
     * quebraria aqui.
     */
    it('has exactly the eight columns of the entity', async () => {
      const rows = await prisma.$queryRaw<
        { column_name: string; is_nullable: string }[]
      >`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'ActivityEvent'
        ORDER BY column_name
      `;

      expect(rows).toEqual([
        { column_name: 'bookId', is_nullable: 'NO' },
        { column_name: 'clubId', is_nullable: 'NO' },
        { column_name: 'createdAt', is_nullable: 'NO' },
        { column_name: 'id', is_nullable: 'NO' },
        // ANULÁVEL, ao contrário do `ReadingLog.planItemId`: a anotação avulsa
        // e o grifo não têm dia de leitura.
        { column_name: 'planItemId', is_nullable: 'YES' },
        { column_name: 'subjectId', is_nullable: 'NO' },
        { column_name: 'type', is_nullable: 'NO' },
        { column_name: 'userId', is_nullable: 'NO' },
      ]);
    });

    /**
     * O `type` é **TEXT**, e não um enum do Postgres — a decisão do `CLAUDE.md`
     * lida do catálogo. Um enum Prisma criaria um tipo no banco e exigiria
     * migration por verbo novo.
     */
    it('stores the type as text, not as a database enum', async () => {
      const rows = await prisma.$queryRaw<{ data_type: string }[]>`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'ActivityEvent' AND column_name = 'type'
      `;

      expect(required(rows[0]).data_type).toBe('text');
    });

    /**
     * ⚠️ **NENHUM índice ÚNICO não-primário** — o evento é ilimitado (decisão
     * do fake, e o teste `keeps four events...` acima é o lado de
     * comportamento). Um `@@unique` em qualquer par transformaria o segundo
     * nascimento num 500.
     */
    it('has no unique index other than the primary key', async () => {
      const rows = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT ic.relname AS indexname
        FROM pg_index i
        JOIN pg_class ic ON ic.oid = i.indexrelid
        JOIN pg_class tc ON tc.oid = i.indrelid
        WHERE tc.relname = 'ActivityEvent'
          AND i.indisunique AND NOT i.indisprimary
      `;

      expect(rows).toEqual([]);
    });

    /**
     * ⚠️ REGRA 3, decisão G — UM índice não-único, e ele é
     * `(clubId, createdAt)`: **exatamente** a consulta do feed. Nada por `type`
     * nem por `userId` — não há filtro por eles no escopo, e índice sem
     * consulta é custo de escrita à toa.
     */
    it('has exactly one non-unique index, on (clubId, createdAt)', async () => {
      const rows = await prisma.$queryRaw<
        { indexname: string; column: string }[]
      >`
        SELECT ic.relname AS indexname, a.attname AS column
        FROM pg_index i
        JOIN pg_class ic ON ic.oid = i.indexrelid
        JOIN pg_class tc ON tc.oid = i.indrelid
        JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
        JOIN pg_attribute a
          ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE tc.relname = 'ActivityEvent'
          AND NOT i.indisunique
        ORDER BY ic.relname, k.ordinality
      `;

      expect(rows.map((row) => row.column)).toEqual(['clubId', 'createdAt']);
      expect(new Set(rows.map((row) => row.indexname)).size).toBe(1);
    });

    /**
     * ⚠️ REGRA 3, decisão H — as QUATRO FKs, e as quatro são RESTRICT. Lidas do
     * catálogo, e não supostas: para a relação OPCIONAL (`planItem`) o default
     * do Prisma seria `SET NULL`, e é isso que a declaração explícita no
     * `schema.prisma` impede. Um evento com `planItemId` zerado seria um
     * "escreveu sobre o dia nenhum" — corrupção silenciosa, a mesma que o
     * `Note.planItem` quase produziu.
     */
    it('declares every foreign key as ON DELETE RESTRICT', async () => {
      const rows = await prisma.$queryRaw<
        { constraint_name: string; rule: string }[]
      >`
        SELECT rc.constraint_name, rc.delete_rule AS rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.table_constraints tc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_name = 'ActivityEvent'
        ORDER BY rc.constraint_name
      `;

      expect(rows).toEqual([
        { constraint_name: 'ActivityEvent_bookId_fkey', rule: 'RESTRICT' },
        { constraint_name: 'ActivityEvent_clubId_fkey', rule: 'RESTRICT' },
        { constraint_name: 'ActivityEvent_planItemId_fkey', rule: 'RESTRICT' },
        { constraint_name: 'ActivityEvent_userId_fkey', rule: 'RESTRICT' },
      ]);
    });

    /**
     * O `subjectId` **NÃO é uma foreign key**, e é decisão: ele aponta para
     * três tabelas diferentes conforme o `type`, e uma FK por tipo seria três
     * colunas anuláveis com uma só preenchida. O teste de cima já lista as
     * quatro FKs; este diz por que não são cinco.
     */
    it('leaves the subjectId without a foreign key, because the target depends on the type', async () => {
      const rows = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'ActivityEvent'
          AND tc.constraint_type = 'FOREIGN KEY'
        ORDER BY kcu.column_name
      `;

      expect(rows.map((row) => row.column_name)).toEqual([
        'bookId',
        'clubId',
        'planItemId',
        'userId',
      ]);
    });
  });
});

/** Um item de plano, no formato do domínio. Factory, nunca `const` (§7.7). */
function planItem(
  id: string,
  bookId: string,
  order: number,
  date: string,
  title: string,
) {
  return {
    id,
    bookId,
    order,
    date,
    title,
    reference: null,
    createdAt: PLAN_CREATED_AT,
  };
}
