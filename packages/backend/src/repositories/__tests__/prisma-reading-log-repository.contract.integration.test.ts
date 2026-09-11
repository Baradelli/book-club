import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ReadingLog } from '../../domain/reading-log';
import { required } from '../../test-support/builders';
import { PrismaReadingLogRepository } from '../prisma-reading-log-repository';
import { PrismaReadingPlanItemRepository } from '../prisma-reading-plan-item-repository';
import { prefixedEmail, prefixedId, prisma, removeFixtures } from './_db';

const CLUB_ID = prefixedId('t32', 'log-club');
const OTHER_CLUB_ID = prefixedId('t32', 'log-otherclub');
const READER_ID = prefixedId('t32', 'log-reader');
const OTHER_READER_ID = prefixedId('t32', 'log-otherreader');
const BOOK_ID = prefixedId('t32', 'log-book');
const OTHER_BOOK_ID = prefixedId('t32', 'log-otherbook');
const FOREIGN_BOOK_ID = prefixedId('t32', 'log-foreignbook');
/** Livro só da lacuna da decisão H: o plano dele é reescrito dentro do teste. */
const GAP_BOOK_ID = prefixedId('t32', 'log-gapbook');

const DAY_ONE = prefixedId('t32', 'log-day-one');
const DAY_TWO = prefixedId('t32', 'log-day-two');
const DAY_THREE = prefixedId('t32', 'log-day-three');
const OTHER_BOOK_DAY = prefixedId('t32', 'log-otherbook-day');
const FOREIGN_DAY = prefixedId('t32', 'log-foreign-day');

const EVERY_BOOK_ID = [
  BOOK_ID,
  OTHER_BOOK_ID,
  FOREIGN_BOOK_ID,
  GAP_BOOK_ID,
] as const;

const PLAN_CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
/** Com milissegundos NÃO zerados: é o que a regra do round-trip mede. */
const READ_AT = new Date('2026-10-01T18:30:45.123Z');

/**
 * Todo log criado por este arquivo, para a limpeza. Não é uma lista
 * "esperada": o `afterAll` também CONSULTA o banco pelos livros do arquivo,
 * então um teste que falhe no meio não vaza fixture, e a limpeza não estoura na
 * FK do plano (`docs/CONVENCOES-CODIGO.md` §6.6).
 */
const logIds: string[] = [];
/** Itens de plano criados DENTRO de um teste, fora do seed do arquivo. */
const extraPlanItemIds: string[] = [];

function trackedLogId(prefix: string): string {
  const id = prefixedId('t32', `log-${prefix}`);
  logIds.push(id);
  return id;
}

function trackedPlanItemId(prefix: string): string {
  const id = prefixedId('t32', `log-plan-${prefix}`);
  extraPlanItemIds.push(id);
  return id;
}

/**
 * O registro de leitura de um dia. O `prefix` é o que dá o id — e nunca vem do
 * `overrides` de propósito: id que não passa por aqui não entra na lista de
 * limpeza.
 */
function aLog(prefix: string, overrides: Partial<ReadingLog> = {}): ReadingLog {
  return {
    id: trackedLogId(prefix),
    clubId: CLUB_ID,
    bookId: BOOK_ID,
    userId: READER_ID,
    planItemId: DAY_ONE,
    readAt: READ_AT,
    ...overrides,
  };
}

/** Apaga TODO log dos livros deste arquivo, por id, consultando o banco. */
async function cleanUpLogs(): Promise<void> {
  const ofBooks = await prisma.readingLog.findMany({
    where: { bookId: { in: [...EVERY_BOOK_ID] } },
    select: { id: true },
  });
  await removeFixtures({
    readingLogIds: [...new Set([...logIds, ...ofBooks.map((log) => log.id)])],
  });
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

describe('PrismaReadingLogRepository (contract)', () => {
  const repo = new PrismaReadingLogRepository(prisma);
  const planRepo = new PrismaReadingPlanItemRepository(prisma);

  beforeAll(async () => {
    // O log antes do plano, e o plano antes do livro: as FKs são RESTRICT.
    await cleanUpLogs();
    await cleanUpPlan();
    await removeFixtures({
      bookIds: [...EVERY_BOOK_ID],
      clubIds: [CLUB_ID, OTHER_CLUB_ID],
      userIds: [READER_ID, OTHER_READER_ID],
    });

    for (const [id, label] of [
      [READER_ID, 'reader'],
      [OTHER_READER_ID, 'otherreader'],
    ] as const) {
      await prisma.user.create({
        data: {
          id,
          email: prefixedEmail('t32', `log-${label}`),
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
      [OTHER_BOOK_ID, CLUB_ID],
      [GAP_BOOK_ID, CLUB_ID],
      [FOREIGN_BOOK_ID, OTHER_CLUB_ID],
    ] as const) {
      await prisma.book.create({
        data: {
          id,
          clubId,
          title: 'O Hobbit',
          month: '2026-10',
          createdById: READER_ID,
        },
      });
    }
    await planRepo.saveMany([
      planItem(DAY_ONE, BOOK_ID, 0, '2026-10-01', 'Cap. 1'),
      planItem(DAY_TWO, BOOK_ID, 1, '2026-10-02', 'Cap. 2'),
      planItem(DAY_THREE, BOOK_ID, 2, '2026-10-03', 'Cap. 3'),
      planItem(OTHER_BOOK_DAY, OTHER_BOOK_ID, 0, '2026-10-01', 'Cap. 1'),
      planItem(FOREIGN_DAY, FOREIGN_BOOK_ID, 0, '2026-10-01', 'Cap. 1'),
    ]);
  });

  afterAll(async () => {
    await cleanUpLogs();
    await cleanUpPlan();
    await removeFixtures({
      bookIds: [...EVERY_BOOK_ID],
      clubIds: [CLUB_ID, OTHER_CLUB_ID],
      userIds: [READER_ID, OTHER_READER_ID],
    });
    await prisma.$disconnect();
  });

  /**
   * Cada teste começa sem log nenhum dos livros do arquivo: um teste de
   * contrato não pode depender do estado que outro deixou — um que dependia
   * passava verde rodado isolado, sem exercitar o filtro que dizia provar
   * (§6.6).
   *
   * Os itens de plano do seed ficam; os que um teste criou saem, senão o
   * `unique(bookId, date)` do próximo teste colidiria.
   */
  beforeEach(async () => {
    await prisma.readingLog.deleteMany({
      where: { bookId: { in: [...EVERY_BOOK_ID] } },
    });
    if (extraPlanItemIds.length > 0) {
      await prisma.readingPlanItem.deleteMany({
        where: { id: { in: extraPlanItemIds } },
      });
    }
  });

  describe('save', () => {
    // Regra 4
    it('creates the log and maps every field back', async () => {
      const log = aLog('create');

      const saved = await repo.save(log);

      expect(saved).toEqual(log);
      expect(saved.readAt).toBeInstanceOf(Date);
      // ...e o que voltou do banco numa SEGUNDA leitura é o mesmo.
      expect(await repo.byPlanItemAndUser(DAY_ONE, READER_ID)).toEqual(log);
    });

    /**
     * ⚠️ O `readAt` é do DOMÍNIO (ADR 0008), com precisão de milissegundo.
     *
     * A coluna nasceu **sem `@default(now())`** — o único instante do projeto
     * sem nem a rede de segurança —, então um `readAt` que o banco escolhesse
     * apareceria aqui. E a asserção é sobre a COLUNA, não só sobre o que o
     * mapper devolveu.
     */
    it('stores the readAt the domain sent, down to the millisecond', async () => {
      const log = aLog('instant');

      await repo.save(log);

      const rows = await prisma.$queryRaw<{ at: string }[]>`
        SELECT to_char("readAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS at
        FROM "ReadingLog" WHERE "id" = ${log.id}
      `;
      expect(required(rows[0]).at).toBe('2026-10-01T18:30:45.123');
    });

    // Regra 6 — upsert por `id`: re-salvar o mesmo id ATUALIZA, e o índice
    // único não é violado pela linha do próprio id.
    it('updates in place when the same id is saved again', async () => {
      const first = aLog('upsert');
      await repo.save(first);
      const later = new Date('2026-10-02T08:00:00.000Z');

      const again = await repo.save({ ...first, readAt: later });

      expect(again.id).toBe(first.id);
      expect(again.readAt).toEqual(later);
      await expect(
        prisma.readingLog.count({ where: { bookId: BOOK_ID } }),
      ).resolves.toBe(1);
    });

    /**
     * ⚠️ **REGRA 5, PRIMEIRA METADE — o índice único MORDE DE VERDADE**, e a
     * prova é um `create` **cru**, não o `save`.
     *
     * É o instrumento certo, e a primeira entrega desta fatia usou o errado: a
     * regra 5 é sobre o **banco**, então provar com o `save` amarra a medição à
     * chamada de Prisma que o repositório escolheu — e foi exatamente essa
     * escolha que a rodada de correção mudou. Com o `create` cru, o teste
     * continua valendo qualquer que seja o alvo do upsert, e é ele que faz a
     * fidelidade do fake deixar de ser afirmação.
     *
     * MEDIDO: `PrismaClientKnownRequestError`, `code: 'P2002'`,
     * `meta.target = ['planItemId', 'userId']` — o Prisma 5.22 nomeia as
     * COLUNAS, não o índice (`ReadingLog_planItemId_userId_key`), e o
     * `meta.target` está assertado porque é ele que diz **qual** único mordeu:
     * sem ele, um `P2002` da chave primária passaria por este teste.
     */
    it('states the precondition: a raw insert of the same pair raises P2002', async () => {
      const first = await repo.save(aLog('rawunique-a'));

      const error = await prisma.readingLog
        .create({
          data: {
            id: trackedLogId('rawunique-b'),
            clubId: CLUB_ID,
            bookId: BOOK_ID,
            userId: first.userId,
            planItemId: first.planItemId,
            readAt: READ_AT,
          },
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({ code: 'P2002' });
      expect(error).toMatchObject({
        meta: { target: ['planItemId', 'userId'] },
      });
      // E uma linha só ficou: a recusa é do banco, antes de escrever.
      await expect(
        prisma.readingLog.count({ where: { planItemId: DAY_ONE } }),
      ).resolves.toBe(1);
    });

    /**
     * ⚠️ **REGRA 5, SEGUNDA METADE — e é o ACHADO 1 da rodada de correção: a
     * CORRIDA não pode virar 500.**
     *
     * Dois `execute` do `markRead` que leem `null` no `byPlanItemAndUser`
     * chegam aqui com ids DIFERENTES e o mesmo par. A janela não é um toque
     * duplo em milissegundos: é a latência do round-trip (200 ms a 1 s num PWA
     * mobile em rede ruim) mais o retry da fila offline — e a 32b constrói
     * exatamente esse botão. Com o upsert mirando o `id`, o segundo dava
     * `P2002`, e `handle-domain-error.ts` **não mapeia `P2002`**: sairia 500.
     *
     * Com o alvo no índice composto, o segundo vira UPDATE da linha do
     * primeiro. É a mesma forma do `PrismaNoteRepository`, e o teste é o irmão
     * de `does not throw and leaves one row when two saves of the same day
     * race`.
     */
    it('does not throw and leaves one row when two saves of the same pair race', async () => {
      const first = aLog('race-a', {
        readAt: new Date('2026-10-01T06:00:00.000Z'),
      });
      const second = aLog('race-b', {
        readAt: new Date('2026-10-01T07:00:00.000Z'),
      });

      const [a, b] = await Promise.all([repo.save(first), repo.save(second)]);

      // A pré-condição que dá dente: os dois ids são DIFERENTES — é a forma
      // que o `markRead` produz quando dois `execute` leem `null`.
      expect(first.id).not.toBe(second.id);
      // O id que ficou é de UM dos dois, nunca um terceiro, e os dois `save`
      // devolvem a MESMA linha.
      expect(a.id).toBe(b.id);
      expect([first.id, second.id]).toContain(a.id);
      await expect(
        prisma.readingLog.count({ where: { planItemId: DAY_ONE } }),
      ).resolves.toBe(1);
    });

    /**
     * O caminho sequencial da mesma coisa, e é ele que pina o que o `id` do
     * segundo `save` sofre: é **descartado**. Como o `save` devolve a linha do
     * banco, o UseCase responde o id certo.
     */
    it('keeps the id of the first row when a second save carries the same pair', async () => {
      const first = await repo.save(aLog('samepair-a'));
      const later = new Date('2026-10-09T09:09:09.009Z');

      const second = await repo.save(aLog('samepair-b', { readAt: later }));

      expect(second.id).toBe(first.id);
      expect(second.readAt).toEqual(later);
      const rows = await prisma.readingLog.findMany({
        where: { planItemId: DAY_ONE },
      });
      expect(rows).toHaveLength(1);
      expect(required(rows[0]).id).toBe(first.id);
    });

    /**
     * ⚠️ O OUTRO LADO da regra 5, e sem ele um índice único que recusasse
     * QUALQUER segunda linha passaria no teste de cima. São os dois casos
     * centrais do produto: o clube inteiro lê o mesmo trecho, e a pessoa lê o
     * livro um dia por vez.
     */
    it('keeps two logs of two readers on the same day', async () => {
      await repo.save(aLog('two-readers-a'));
      await repo.save(aLog('two-readers-b', { userId: OTHER_READER_ID }));

      await expect(
        prisma.readingLog.count({ where: { planItemId: DAY_ONE } }),
      ).resolves.toBe(2);
    });

    it('keeps two logs of the same reader on two days', async () => {
      await repo.save(aLog('two-days-a'));
      await repo.save(aLog('two-days-b', { planItemId: DAY_TWO }));

      await expect(
        prisma.readingLog.count({
          where: { bookId: BOOK_ID, userId: READER_ID },
        }),
      ).resolves.toBe(2);
    });
  });

  describe('byPlanItemAndUser', () => {
    // Regra 4
    it('finds the log of that reader on that day', async () => {
      const log = await repo.save(aLog('bypair'));
      await repo.save(aLog('bypair-other', { userId: OTHER_READER_ID }));

      const found = await repo.byPlanItemAndUser(DAY_ONE, READER_ID);

      expect(found).toEqual(log);
    });

    it('returns null when that reader did not mark that day', async () => {
      await repo.save(aLog('bypair-null'));

      await expect(
        repo.byPlanItemAndUser(DAY_ONE, OTHER_READER_ID),
      ).resolves.toBeNull();
      await expect(
        repo.byPlanItemAndUser(DAY_TWO, READER_ID),
      ).resolves.toBeNull();
    });
  });

  describe('delete', () => {
    // Regra 4 — hard delete de verdade: a linha some, não vira ARCHIVED.
    it('removes the row for real', async () => {
      const log = await repo.save(aLog('delete'));

      await repo.delete(log.id);

      await expect(
        prisma.readingLog.count({ where: { id: log.id } }),
      ).resolves.toBe(0);
      await expect(
        repo.byPlanItemAndUser(DAY_ONE, READER_ID),
      ).resolves.toBeNull();
    });

    /**
     * ⚠️ **A PRÉ-CONDIÇÃO DA REGRA 7 — e é ela que a Tarefa 30 NÃO tinha
     * medido.**
     *
     * O docblock do port prescreve `deleteMany({ where: { id } })` porque
     * `delete({ where: { id } })` levantaria `P2025` num id inexistente. Aquela
     * frase estava rotulada **"NÃO MEDIDO contra o banco deste projeto"**, e
     * este teste é o que a mede: sem ela, "escolhemos `deleteMany`" e
     * "`delete` também serviria" dariam o mesmo resultado observável no teste
     * seguinte, e a prescrição do port seria superstição.
     *
     * MEDIDO: o Prisma 5.22 contra este Postgres levanta
     * `PrismaClientKnownRequestError` com `code: 'P2025'`.
     */
    it('states the precondition: prisma.delete on a missing id raises P2025', async () => {
      const ghost = prefixedId('t32', 'log-ghost-precondition');

      const error = await prisma.readingLog
        .delete({ where: { id: ghost } })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({ code: 'P2025' });
    });

    /**
     * ⚠️ REGRA 7 — e agora ela é a diferença entre as duas chamadas, não uma
     * afirmação sobre uma delas.
     *
     * O `delete` do repositório é **no-op silencioso** para um id que não
     * existe, e é contrato: entre o `byPlanItemAndUser` do `unmarkRead` e este
     * `delete` cabem o segundo toque da pessoa e o retry da fila offline, e
     * transformar isso em 500 é o oposto exato da decisão C da Tarefa 30.
     */
    it('is a silent no-op for an id that was never saved', async () => {
      const kept = await repo.save(aLog('delete-noop'));

      await expect(
        repo.delete(prefixedId('t32', 'log-ghost')),
      ).resolves.toBeUndefined();

      // E não apagou a linha de ninguém por acidente.
      await expect(
        prisma.readingLog.count({ where: { id: kept.id } }),
      ).resolves.toBe(1);
    });

    // Apagar duas vezes o MESMO id também é inofensivo — é o caminho literal
    // do retry da fila offline chegando depois do toque.
    it('is a silent no-op when the same id is deleted twice', async () => {
      const log = await repo.save(aLog('delete-twice'));

      await repo.delete(log.id);
      await expect(repo.delete(log.id)).resolves.toBeUndefined();

      await expect(
        prisma.readingLog.count({ where: { bookId: BOOK_ID } }),
      ).resolves.toBe(0);
    });

    // E depois de apagar, marcar de novo funciona: o índice único não guarda
    // fantasma. É o "desmarquei sem querer" do produto.
    it('lets the same reader mark the same day again after unmarking', async () => {
      const first = await repo.save(aLog('remark-a'));
      await repo.delete(first.id);

      const second = await repo.save(aLog('remark-b'));

      expect(second.id).not.toBe(first.id);
      await expect(
        prisma.readingLog.count({ where: { planItemId: DAY_ONE } }),
      ).resolves.toBe(1);
    });
  });

  describe('find', () => {
    // Regra 8 — o `bookId` é obrigatório, e nada de outro livro entra.
    it('never returns a log of another book', async () => {
      const mine = await repo.save(aLog('find-mine'));
      await repo.save(
        aLog('find-elsewhere', {
          bookId: OTHER_BOOK_ID,
          planItemId: OTHER_BOOK_DAY,
        }),
      );
      await repo.save(
        aLog('find-foreign', {
          clubId: OTHER_CLUB_ID,
          bookId: FOREIGN_BOOK_ID,
          planItemId: FOREIGN_DAY,
        }),
      );

      await expect(repo.find({ bookId: BOOK_ID })).resolves.toEqual([mine]);
      // A pré-condição: os outros dois existem e são achados pelos livros deles.
      expect(await repo.find({ bookId: OTHER_BOOK_ID })).toHaveLength(1);
      expect(await repo.find({ bookId: FOREIGN_BOOK_ID })).toHaveLength(1);
    });

    // Regra 8 — cada recorte, um a um.
    it('narrows by userId and by planItemId', async () => {
      const mine = await repo.save(aLog('find-day1-me'));
      const theirs = await repo.save(
        aLog('find-day1-them', { userId: OTHER_READER_ID }),
      );
      const myDayTwo = await repo.save(
        aLog('find-day2-me', { planItemId: DAY_TWO }),
      );

      const ids = async (filter: Parameters<typeof repo.find>[0]) =>
        (await repo.find(filter)).map((log) => log.id).sort();

      await expect(ids({ bookId: BOOK_ID })).resolves.toEqual(
        [mine.id, theirs.id, myDayTwo.id].sort(),
      );
      await expect(
        ids({ bookId: BOOK_ID, userId: READER_ID }),
      ).resolves.toEqual([mine.id, myDayTwo.id].sort());
      await expect(
        ids({ bookId: BOOK_ID, planItemId: DAY_ONE }),
      ).resolves.toEqual([mine.id, theirs.id].sort());
    });

    // Regra 8 — os filtros entram em AND, não em OR: cada um sozinho casa mais
    // de um log, e juntos casam um só.
    it('combines every filter with AND', async () => {
      const target = await repo.save(aLog('find-and'));
      await repo.save(aLog('find-and-other', { userId: OTHER_READER_ID }));
      await repo.save(aLog('find-and-day2', { planItemId: DAY_TWO }));

      await expect(
        repo.find({
          bookId: BOOK_ID,
          userId: READER_ID,
          planItemId: DAY_ONE,
        }),
      ).resolves.toEqual([target]);
      // Um campo trocado e o resultado é vazio — prova que é AND.
      await expect(
        repo.find({
          bookId: BOOK_ID,
          userId: OTHER_READER_ID,
          planItemId: DAY_TWO,
        }),
      ).resolves.toEqual([]);
    });

    /**
     * Regra 8 — **campo ausente não filtra por ele**.
     *
     * No Postgres um `undefined` no `where` do Prisma some da consulta, mas um
     * `null` viraria `IS NULL` — e as três colunas são NOT NULL, então esse
     * engano devolveria vazio. O teste separa os dois casos.
     */
    it('does not filter by a field the filter omits', async () => {
      await repo.save(aLog('find-omit-a'));
      await repo.save(aLog('find-omit-b', { userId: OTHER_READER_ID }));
      await repo.save(aLog('find-omit-c', { planItemId: DAY_THREE }));

      expect(await repo.find({ bookId: BOOK_ID })).toHaveLength(3);
    });

    it('returns an empty list for a book nobody read', async () => {
      await repo.save(aLog('find-empty'));

      await expect(
        repo.find({ bookId: prefixedId('t32', 'log-book-ghost') }),
      ).resolves.toEqual([]);
    });

    /**
     * ⚠️ **SEM TETO DE LINHAS, e a divergência com o `find` da nota e o do
     * grifo é deliberada.** Os dois têm `take: FIND_ROW_LIMIT` (500) +
     * `orderBy`; este não tem nenhum dos dois, e o motivo inteiro mora no
     * docblock do `find` do port.
     *
     * ⚠️⚠️ **A PRIMEIRA VERSÃO DESTE TESTE ERA UMA ASSERÇÃO VAZIA** (§7.4), e
     * a rodada de correção da Tarefa 32 a mediu: ela rodava `EXPLAIN` sobre uma
     * consulta que o **próprio teste escrevia à mão**, e do repositório
     * observava só `rows.length === 1`. Um `take: 500` acrescentado ao
     * `findMany` deixava tudo **verde** — 1 < 500, e o plano examinado era de
     * outra consulta. O docblock prometia uma guarda que o corpo não entregava.
     *
     * Agora a asserção é sobre o SQL **realmente emitido**, capturado por
     * `$on('query')` num cliente próprio (o `prisma` compartilhado não emite
     * eventos) — é o mesmo instrumento do `does not select the doc column` do
     * contrato da nota. Um `take` só apareceria no resultado com mais de 500
     * linhas no banco do dono, o que este arquivo não vai criar; no SQL ele
     * aparece com uma linha.
     */
    it('emits no LIMIT and no ORDER BY in the query it really sends', async () => {
      const client = new PrismaClient({
        log: [{ emit: 'event', level: 'query' }],
      });
      const queries: string[] = [];
      client.$on('query', (event) => queries.push(event.query));
      try {
        await repo.save(aLog('find-nolimit'));
        const found = await new PrismaReadingLogRepository(client).find({
          bookId: BOOK_ID,
        });
        expect(found).toHaveLength(1);
      } finally {
        await client.$disconnect();
      }

      const select = required(
        queries.find((sql) => sql.includes('"ReadingLog"')),
      );
      // A pré-condição: é mesmo a consulta do `find`, e não outra do cliente.
      expect(select).toContain('"bookId"');
      expect(select).not.toMatch(/\bLIMIT\b/i);
      // Sem `orderBy` também, e é o par do de cima: `orderBy` só é obrigatório
      // ao lado de um `take` (é ele que torna o corte determinístico). Sem
      // corte, pedir ordem à persistência seria uma promessa que o port não
      // faz — quem ordena é o `groupUsersByPlanItem`, pela ordem do plano.
      expect(select).not.toMatch(/\bORDER BY\b/i);
    });
  });

  /**
   * ⚠️ **REGRAS 1, 2 e 4 da Tarefa 32c** — o método da segunda guarda do
   * `replacePlanItems`, espelho do `planItemIdsWithAnyNote` da nota.
   *
   * Contra o Postgres, e não só contra o fake, porque as duas propriedades que
   * importam são do **banco**: o `IN (...)` devolve uma linha por leitura (dois
   * leitores no mesmo dia dão duas), e é o `Set` do repositório que as colapsa
   * num id só; e a lista vazia não pode virar um `IN ()`.
   */
  describe('planItemIdsWithAnyReadingLog', () => {
    it('finds a day that somebody read', async () => {
      await repo.save(aLog('anylog-found'));

      await expect(
        repo.planItemIdsWithAnyReadingLog([DAY_ONE, DAY_TWO]),
      ).resolves.toEqual([DAY_ONE]);
    });

    /**
     * É um CONJUNTO: duas pessoas que leram o MESMO dia dão **um** id, não
     * dois — senão a mensagem da guarda diria "2 dias" para um dia só.
     *
     * Aqui a duplicata é real (o `@@unique` é `(planItemId, userId)`, então
     * dois leitores no mesmo dia são duas linhas legítimas), e é por isso que
     * este teste vive contra o banco: no `IN (...)` cru voltariam dois
     * `planItemId` iguais.
     */
    it('returns one id per day, not one per reader', async () => {
      await repo.save(aLog('anylog-set-a'));
      await repo.save(aLog('anylog-set-b', { userId: OTHER_READER_ID }));

      // A pré-condição que dá dente ao teste: são DUAS linhas no banco.
      await expect(
        prisma.readingLog.count({ where: { planItemId: DAY_ONE } }),
      ).resolves.toBe(2);
      await expect(
        repo.planItemIdsWithAnyReadingLog([DAY_ONE]),
      ).resolves.toEqual([DAY_ONE]);
    });

    it('never returns an id nobody read', async () => {
      await repo.save(aLog('anylog-unread'));

      await expect(
        repo.planItemIdsWithAnyReadingLog([DAY_TWO, DAY_THREE]),
      ).resolves.toEqual([]);
    });

    // Só os ids PEDIDOS: um método que ignorasse a lista (devolvendo todos os
    // dias lidos) passaria nos testes de cima.
    it('returns only the asked ids', async () => {
      await repo.save(aLog('anylog-asked-a'));
      await repo.save(aLog('anylog-asked-c', { planItemId: DAY_THREE }));

      await expect(
        repo.planItemIdsWithAnyReadingLog([DAY_ONE, DAY_TWO]),
      ).resolves.toEqual([DAY_ONE]);
    });

    /**
     * ⚠️ **REGRA 2 — `[]` devolve `[]` SEM IDA AO BANCO, e a prova é uma
     * CONTAGEM de consultas, não o resultado** (§7.3).
     *
     * O resultado é `[]` nas duas implementações — a que sai na hora e a que
     * manda um `IN ()` ao Postgres para receber zero linhas —, então uma
     * asserção sobre ele não separa as duas. O que separa é o SQL realmente
     * emitido, capturado por `$on('query')` num cliente próprio (o `prisma`
     * compartilhado não emite eventos): é o mesmo instrumento do
     * `emits no LIMIT and no ORDER BY` logo acima.
     *
     * E os dois lados, porque um contador só afirmado como `0` é meio contador
     * (§7.3): sem o `afterAsking: 1`, um método mutilado para `return []` antes
     * de qualquer consulta passaria neste teste.
     *
     * ⚠️ **UM CLIENTE POR LADO, e a contagem lida DEPOIS do `$disconnect()`** —
     * é o `readingLogQueriesOf` no rodapé do arquivo, e a ordem é por causa da
     * **entrega do evento**, não por estilo: o `$on('query')` do Prisma não
     * promete ter emitido o evento antes de a promessa da consulta resolver.
     * Ler o array logo depois do `await` mediria um `0` quando o evento chega
     * um tick atrasado, e o lado exposto seria justamente o `afterAsking: 1` —
     * vermelho intermitente, que é como uma suíte aprende a ser ignorada. O
     * vizinho `emits no LIMIT and no ORDER BY` já lê depois do `$disconnect()`
     * pelo mesmo motivo.
     */
    it('asks the database nothing for an empty list, and once for a real one', async () => {
      await repo.save(aLog('anylog-count'));

      const empty = await readingLogQueriesOf(
        async (counted) => await counted.planItemIdsWithAnyReadingLog([]),
      );
      const asked = await readingLogQueriesOf(
        async (counted) =>
          await counted.planItemIdsWithAnyReadingLog([DAY_ONE]),
      );

      // Os resultados, que são iguais nas duas implementações...
      expect({ empty: empty.result, asked: asked.result }).toEqual({
        empty: [],
        asked: [DAY_ONE],
      });
      // ...e a contagem, que é a única coisa que as separa.
      expect({ afterEmpty: empty.queries, afterAsking: asked.queries }).toEqual(
        { afterEmpty: 0, afterAsking: 1 },
      );
    });
  });

  /**
   * ⚠️ REGRA 3 — o `onDelete: Restrict` do `planItem` ESTÁ ATIVO no banco.
   *
   * Para relação **obrigatória** o default do Prisma já é `Restrict`, mas foi
   * um implícito que quase produziu corrupção silenciosa no `Note.planItem`
   * (onde a relação é opcional e o default é `SetNull`), então aqui ele é
   * declarado — e provado.
   */
  describe('the planItem foreign key', () => {
    it('refuses to delete a plan item that has a reading log', async () => {
      const dayId = trackedPlanItemId('restrict');
      await planRepo.saveMany([
        planItem(dayId, BOOK_ID, 9, '2026-10-09', 'Cap. 9'),
      ]);
      const log = await repo.save(aLog('restrict', { planItemId: dayId }));

      await expect(
        prisma.readingPlanItem.delete({ where: { id: dayId } }),
      ).rejects.toThrow();

      // O dia continua no plano, e o log continua apontando para ele.
      await expect(
        prisma.readingPlanItem.count({ where: { id: dayId } }),
      ).resolves.toBe(1);
      expect(
        required(await prisma.readingLog.findUnique({ where: { id: log.id } }))
          .planItemId,
      ).toBe(dayId);
    });

    // O outro lado: sem log, o dia se apaga normalmente. Sem este par, um
    // `Restrict` que barrasse TODA remoção passaria no teste de cima.
    it('deletes a plan item that has no reading log', async () => {
      const dayId = trackedPlanItemId('nolog');
      await planRepo.saveMany([
        planItem(dayId, BOOK_ID, 8, '2026-10-08', 'Cap. 8'),
      ]);

      await prisma.readingPlanItem.delete({ where: { id: dayId } });

      await expect(
        prisma.readingPlanItem.count({ where: { id: dayId } }),
      ).resolves.toBe(0);
    });

    /**
     * ⚠️ **A REDE EMBAIXO DA GUARDA DE DOMÍNIO — decisões E e F da Tarefa 32c,
     * e este teste SUBSTITUI o que pinava a lacuna.**
     *
     * O que estava aqui chamava-se
     * `lets a day with only a reading log through the note guard, and then the
     * FK refuses it`, e documentava um **defeito**: o `replacePlanItems` só
     * tinha guarda para "dia que já tem NOTA", então um dia com **só leitura**
     * passava, chegava ao `replaceForBook` e estourava aqui como erro de banco
     * — 500 mudo, no caso irmão daquele que respondia 400 com mensagem.
     *
     * O defeito acabou: a 32c deu ao UseCase a segunda guarda
     * (`planItemIdsWithAnyReadingLog`). Mas o teste antigo **continuaria
     * verde**, porque o repositório de fato deixa passar — quem passou a
     * recusar é o **UseCase** —, e um teste verde cujo nome descreve um defeito
     * já consertado é pior que nenhum: ele faz o próximo leitor acreditar que a
     * lacuna continua aberta. Por isso a troca, e não o apagamento: a verdade
     * nova é pinada nos dois lugares certos.
     *
     * - **Aqui (contrato):** a FK `ReadingLog_planItemId_fkey` é a **rede**, e
     *   ela continua ativa mesmo sem nota nenhuma no dia. É a decisão F: tirar
     *   o `Restrict` porque "agora tem guarda" trocaria uma proteção estrutural
     *   por uma que alguém pode esquecer de chamar.
     * - **A recusa EDUCADA (400 com mensagem de leitura):** é do UseCase, e
     *   está no unitário —
     *   `usecases/__tests__/replace-plan-items.test.ts`, no
     *   `describe('the guard that refuses to remove a day that has readings')`
     *   — mais a fiação da rota em
     *   `routes/__tests__/book-routes.integration.test.ts`
     *   (`answers 400 without touching the plan when a removed day was already
     *   read`).
     *
     * A precondição `note.count === 0` fica: é ela que diz que a rede desta
     * linha é a FK do LOG, e não a da nota, que tem `Restrict` igual.
     *
     * E o dado continua a salvo: o `replaceForBook` roda em `$transaction`, e o
     * `after` prova que nem o dia condenado nem o sobrevivente se mexeram.
     */
    it('is the net under the domain guard: it refuses a day that only a reading log anchors', async () => {
      const doomed = trackedPlanItemId('gap-doomed');
      const survivor = trackedPlanItemId('gap-survivor');
      await planRepo.saveMany([
        planItem(survivor, GAP_BOOK_ID, 0, '2026-11-01', 'Cap. 1'),
        planItem(doomed, GAP_BOOK_ID, 1, '2026-11-02', 'Cap. 2'),
      ]);
      await repo.save(aLog('gap', { bookId: GAP_BOOK_ID, planItemId: doomed }));

      // A precondição: NENHUMA nota ancora este dia — a rede que morde abaixo
      // é a FK do log, não a da nota.
      await expect(
        prisma.note.count({ where: { planItemId: doomed } }),
      ).resolves.toBe(0);
      // ...e é o `planItemIdsWithAnyReadingLog` que o UseCase usa para nunca
      // chegar até aqui. A rede existe para o dia em que alguém o esquecer.
      await expect(
        repo.planItemIdsWithAnyReadingLog([survivor, doomed]),
      ).resolves.toEqual([doomed]);

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
  });

  /**
   * ⚠️ REGRAS 1 e 3 — o schema lido do CATÁLOGO DO POSTGRES, não do arquivo.
   * O que importa é o que o banco tem.
   *
   * Nota de execução: `@@unique` do Prisma emite `CREATE UNIQUE INDEX`, não
   * `CONSTRAINT ... UNIQUE`, então o índice **não aparece** em
   * `information_schema.table_constraints` — é `pg_index` que o conhece.
   */
  describe('the schema in the database', () => {
    /**
     * ⚠️ REGRA 1 — **SEIS colunas e nada mais.** É a única forma de provar as
     * AUSÊNCIAS: nenhum teste de comportamento acusa um `status` ou um
     * `createdAt` que ninguém escreve, e é assim que uma coluna morta entra e
     * fica. Ela também é a guarda do "progresso é calculado, nunca guardado" —
     * um `readDays` na tabela quebraria aqui.
     */
    it('has exactly the six columns of the entity', async () => {
      const rows = await prisma.$queryRaw<
        { column_name: string; is_nullable: string }[]
      >`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'ReadingLog'
        ORDER BY column_name
      `;

      expect(rows).toEqual([
        { column_name: 'bookId', is_nullable: 'NO' },
        { column_name: 'clubId', is_nullable: 'NO' },
        { column_name: 'id', is_nullable: 'NO' },
        // NOT NULL, ao contrário do `Note.planItemId`: não há leitura avulsa.
        { column_name: 'planItemId', is_nullable: 'NO' },
        { column_name: 'readAt', is_nullable: 'NO' },
        { column_name: 'userId', is_nullable: 'NO' },
      ]);
    });

    /**
     * ⚠️ O `readAt` nasceu **SEM `@default`** — o único instante do projeto sem
     * nem a rede de segurança que todo `createdAt` tem (ADR 0008: o dono é o
     * UseCase). Com um `@default(now())` no schema, um INSERT por fora gravaria
     * "agora" em silêncio, e o campo passaria a ter dois donos.
     */
    it('gives readAt no column default, and id the cuid safety net', async () => {
      const rows = await prisma.$queryRaw<
        { column_name: string; column_default: string | null }[]
      >`
        SELECT column_name, column_default
        FROM information_schema.columns
        WHERE table_name = 'ReadingLog'
          AND column_name IN ('readAt', 'id')
        ORDER BY column_name
      `;

      expect(rows).toEqual([
        { column_name: 'id', column_default: null },
        { column_name: 'readAt', column_default: null },
      ]);
    });

    // Regra 3 — UM índice único não-primário, com essas duas colunas nessa
    // ordem.
    it('has a unique index on exactly (planItemId, userId)', async () => {
      const rows = await uniqueIndexColumnsOf('ReadingLog');

      expect(rows.map((row) => row.column)).toEqual(['planItemId', 'userId']);
      expect(new Set(rows.map((row) => row.indexname)).size).toBe(1);
    });

    /**
     * Regra 3, decisão G — o índice de leitura é `(bookId)` e **só**. Nada de
     * `(clubId, createdAt)`, que as outras tabelas de conteúdo têm: não existe
     * listagem cronológica de leitura, e índice sem consulta é custo de escrita
     * à toa.
     */
    it('has exactly one non-unique index, on (bookId)', async () => {
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
        WHERE tc.relname = 'ReadingLog'
          AND NOT i.indisunique
        ORDER BY ic.relname, k.ordinality
      `;

      expect(rows.map((row) => row.column)).toEqual(['bookId']);
    });

    // Regra 3 — as QUATRO FKs, e as quatro são RESTRICT. Lidas do catálogo: é
    // o companheiro estático do teste de comportamento acima.
    it('declares every foreign key as ON DELETE RESTRICT', async () => {
      const rows = await prisma.$queryRaw<
        { constraint_name: string; rule: string }[]
      >`
        SELECT rc.constraint_name, rc.delete_rule AS rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.table_constraints tc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_name = 'ReadingLog'
        ORDER BY rc.constraint_name
      `;

      expect(rows).toEqual([
        { constraint_name: 'ReadingLog_bookId_fkey', rule: 'RESTRICT' },
        { constraint_name: 'ReadingLog_clubId_fkey', rule: 'RESTRICT' },
        { constraint_name: 'ReadingLog_planItemId_fkey', rule: 'RESTRICT' },
        { constraint_name: 'ReadingLog_userId_fkey', rule: 'RESTRICT' },
      ]);
    });
  });
});

/**
 * Roda `fn` contra um repositório de cliente PRÓPRIO e devolve o que ela
 * devolveu **mais** quantas consultas ao `ReadingLog` aquele cliente emitiu.
 *
 * Cliente próprio porque o `prisma` compartilhado do `_db.ts` não emite eventos
 * de `query`. E a contagem sai **depois** do `$disconnect()`, nunca logo após o
 * `await` da consulta: o `$on('query')` não promete ter entregado o evento
 * quando a promessa resolve, e uma leitura antecipada seria um `0` intermitente
 * no lado positivo da asserção.
 */
async function readingLogQueriesOf<T>(
  fn: (repo: PrismaReadingLogRepository) => Promise<T>,
): Promise<{ result: T; queries: number }> {
  const client = new PrismaClient({
    log: [{ emit: 'event', level: 'query' }],
  });
  const seen: string[] = [];
  client.$on('query', (event) => seen.push(event.query));

  let result: T;
  try {
    result = await fn(new PrismaReadingLogRepository(client));
  } finally {
    await client.$disconnect();
  }

  return {
    result,
    queries: seen.filter((sql) => sql.includes('"ReadingLog"')).length,
  };
}

async function uniqueIndexColumnsOf(
  table: string,
): Promise<{ indexname: string; column: string }[]> {
  return await prisma.$queryRaw<{ indexname: string; column: string }[]>`
    SELECT ic.relname AS indexname, a.attname AS column
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_class tc ON tc.oid = i.indrelid
    JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid AND a.attnum = k.attnum
    WHERE tc.relname = ${table} AND i.indisunique AND NOT i.indisprimary
    ORDER BY ic.relname, k.ordinality
  `;
}

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
