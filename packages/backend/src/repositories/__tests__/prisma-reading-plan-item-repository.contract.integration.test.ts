import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ReadingPlanItem } from '../../domain/book';
import { required } from '../../test-support/builders';
import { PrismaReadingPlanItemRepository } from '../prisma-reading-plan-item-repository';
import { prefixedEmail, prefixedId, prisma, removeFixtures } from './_db';

const CLUB_ID = prefixedId('t07', 'plan-club');
const AUTHOR_ID = prefixedId('t07', 'plan-author');
const BOOK_ID = prefixedId('t07', 'plan-book');
const OTHER_BOOK_ID = prefixedId('t07', 'plan-otherbook');

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function anItem(
  id: string,
  overrides: Partial<ReadingPlanItem> = {},
): ReadingPlanItem {
  return {
    id,
    bookId: BOOK_ID,
    order: 0,
    date: '2026-10-01',
    title: 'Cap. 1 — Uma reunião inesperada',
    reference: 'p. 1-20',
    createdAt: CREATED_AT,
    ...overrides,
  };
}

/**
 * Todo item criado por este arquivo, para a limpeza. Não é uma lista
 * "esperada": o `afterAll` também CONSULTA o banco pelos dois livros, então um
 * teste que falhe no meio não vaza fixture (CONVENCOES-CODIGO §6.6).
 */
const planItemIds: string[] = [];

function trackedId(prefix: string): string {
  const id = prefixedId('t07', prefix);
  planItemIds.push(id);
  return id;
}

async function cleanUpPlan(): Promise<void> {
  const ofBooks = await prisma.readingPlanItem.findMany({
    where: { bookId: { in: [BOOK_ID, OTHER_BOOK_ID] } },
    select: { id: true },
  });
  await removeFixtures({
    planItemIds: [...new Set([...planItemIds, ...ofBooks.map((i) => i.id)])],
  });
}

describe('PrismaReadingPlanItemRepository (contract)', () => {
  const repo = new PrismaReadingPlanItemRepository(prisma);

  beforeAll(async () => {
    await cleanUpPlan();
    await removeFixtures({
      bookIds: [BOOK_ID, OTHER_BOOK_ID],
      clubIds: [CLUB_ID],
      userIds: [AUTHOR_ID],
    });

    await prisma.user.create({
      data: {
        id: AUTHOR_ID,
        email: prefixedEmail('t07', 'plan-author'),
        name: 'Fixture Admin',
      },
    });
    await prisma.club.create({ data: { id: CLUB_ID, name: 'Clube do Plano' } });
    for (const [id, title] of [
      [BOOK_ID, 'O Hobbit'],
      [OTHER_BOOK_ID, 'O Senhor dos Anéis'],
    ] as const) {
      await prisma.book.create({
        data: {
          id,
          clubId: CLUB_ID,
          title,
          month: '2026-10',
          createdById: AUTHOR_ID,
        },
      });
    }
  });

  afterAll(async () => {
    await cleanUpPlan();
    await removeFixtures({
      bookIds: [BOOK_ID, OTHER_BOOK_ID],
      clubIds: [CLUB_ID],
      userIds: [AUTHOR_ID],
    });
    await prisma.$disconnect();
  });

  // Cada bloco começa com a tabela do livro vazia: um teste de contrato não
  // pode depender do estado que outro deixou (CONVENCOES-CODIGO §6.6).
  beforeEach(async () => {
    await prisma.readingPlanItem.deleteMany({
      where: { bookId: { in: [BOOK_ID, OTHER_BOOK_ID] } },
    });
  });

  // ⚠️ O CORAÇÃO DA FATIA. A coluna é `DATE` e o Prisma devolve um `Date` em
  // meia-noite UTC; qualquer conversão que passe por hora local faz o dia 5 do
  // plano aparecer como dia 4 nesta máquina (UTC−3). Nenhum teste aqui troca
  // `TZ` do processo (não é confiável no Node do Windows): a prova é a string
  // exata que volta MAIS um SELECT conferindo o que a coluna guarda.
  describe('CalendarDay round trip', () => {
    it("stores '2026-10-05' and reads back '2026-10-05'", async () => {
      const id = trackedId('plan-roundtrip');

      const [saved] = await repo.saveMany([anItem(id, { date: '2026-10-05' })]);

      expect(required(saved).date).toBe('2026-10-05');
      expect(required((await repo.findByBook(BOOK_ID))[0]).date).toBe(
        '2026-10-05',
      );
    });

    // A prova no BANCO: o que a coluna realmente guarda. `to_char` formata a
    // data no servidor, sem passar por Date nenhum do Node.
    it('holds 2026-10-05 in the column, not 2026-10-04', async () => {
      const id = trackedId('plan-column');
      await repo.saveMany([anItem(id, { date: '2026-10-05' })]);

      const rows = await prisma.$queryRaw<{ day: string }[]>`
        SELECT to_char("date", 'YYYY-MM-DD') AS day
        FROM "ReadingPlanItem" WHERE "id" = ${id}
      `;

      expect(required(rows[0]).day).toBe('2026-10-05');
    });

    // Os limites onde erro de fuso aparece: virada de ano (o deslocamento
    // muda o ANO, não só o dia) e os dois domingos de horário de verão do
    // fuso do clube (America/Sao_Paulo), quando a meia-noite local não existe
    // ou se repete.
    it.each([
      ['the first day of the year', '2026-01-01'],
      ['the last day of the year', '2026-12-31'],
      ['a leap day', '2028-02-29'],
      ['a DST start day in the club timezone', '2018-11-04'],
      ['a DST end day in the club timezone', '2018-02-18'],
    ])('round-trips %s (%s)', async (_label, date) => {
      const id = trackedId(`plan-edge-${date}`);

      await repo.saveMany([anItem(id, { date })]);

      const [read] = await repo.findByBook(BOOK_ID);
      expect(required(read).date).toBe(date);

      const rows = await prisma.$queryRaw<{ day: string }[]>`
        SELECT to_char("date", 'YYYY-MM-DD') AS day
        FROM "ReadingPlanItem" WHERE "id" = ${id}
      `;
      expect(required(rows[0]).day).toBe(date);
    });
  });

  describe('saveMany', () => {
    it('maps every field back, including a null reference', async () => {
      const id = trackedId('plan-fields');

      await repo.saveMany([
        anItem(id, { order: 7, title: 'Cap. 7', reference: null }),
      ]);

      const read = required((await repo.findByBook(BOOK_ID))[0]);
      expect(read).toEqual({
        id,
        bookId: BOOK_ID,
        order: 7,
        date: '2026-10-01',
        title: 'Cap. 7',
        reference: null,
        createdAt: CREATED_AT,
      });
      expect(read.createdAt).toBeInstanceOf(Date);
    });

    it('upserts by id: the same id updates in place', async () => {
      const id = trackedId('plan-upsert');
      await repo.saveMany([anItem(id, { title: 'Cap. 1' })]);

      await repo.saveMany([anItem(id, { title: 'Cap. 1 — corrigido' })]);

      const found = await repo.findByBook(BOOK_ID);
      expect(found).toHaveLength(1);
      expect(required(found[0]).title).toBe('Cap. 1 — corrigido');
    });

    it('accepts an empty batch', async () => {
      await expect(repo.saveMany([])).resolves.toEqual([]);
    });

    // O @@unique([bookId, date]) — a chave natural do dia de leitura, e o que
    // o diff do replacePlanItems usa.
    it('refuses a second item with the same date in the same book', async () => {
      const first = trackedId('plan-dup-a');
      const second = trackedId('plan-dup-b');
      await repo.saveMany([anItem(first, { date: '2026-10-01' })]);

      await expect(
        repo.saveMany([anItem(second, { order: 1, date: '2026-10-01' })]),
      ).rejects.toThrow();

      expect(await repo.findByBook(BOOK_ID)).toHaveLength(1);
    });

    it('allows the same date in another book', async () => {
      const here = trackedId('plan-samedate-a');
      const there = trackedId('plan-samedate-b');

      await repo.saveMany([
        anItem(here, { date: '2026-10-01' }),
        anItem(there, { bookId: OTHER_BOOK_ID, date: '2026-10-01' }),
      ]);

      expect(await repo.findByBook(BOOK_ID)).toHaveLength(1);
      expect(await repo.findByBook(OTHER_BOOK_ID)).toHaveLength(1);
    });

    // ADR 0007: `order` tem @@index, NÃO @@unique. Este teste é a prova de que
    // o schema nasceu como o ADR manda — com @@unique ele falharia.
    it('accepts two items sharing an order in the same book', async () => {
      const first = trackedId('plan-order-a');
      const second = trackedId('plan-order-b');

      await repo.saveMany([
        anItem(first, { order: 0, date: '2026-10-01' }),
        anItem(second, { order: 0, date: '2026-10-02' }),
      ]);

      const found = await repo.findByBook(BOOK_ID);
      expect(found.map((item) => item.order)).toEqual([0, 0]);
    });
  });

  // O método que a Tarefa 08 acrescentou ao port, para o `upsertPlanNote`
  // descobrir de que livro (e, por ele, de que clube) o item do plano é.
  describe('byId', () => {
    it('maps every field back, including the CalendarDay', async () => {
      const id = trackedId('plan-byid');
      await repo.saveMany([
        anItem(id, { order: 4, date: '2026-10-05', title: 'Cap. 5' }),
      ]);

      const found = await repo.byId(id);

      expect(found).toEqual({
        id,
        bookId: BOOK_ID,
        order: 4,
        date: '2026-10-05',
        title: 'Cap. 5',
        reference: 'p. 1-20',
        createdAt: CREATED_AT,
      });
    });

    it('returns null for an id that was never saved', async () => {
      await expect(
        repo.byId(prefixedId('t08', 'plan-ghost')),
      ).resolves.toBeNull();
    });

    // O port NÃO promete corte de clube aqui: o item de outro livro é
    // devolvido, e quem barra o acesso é o `bookForActor`, com o livro em mão.
    it('returns an item of another book without filtering it out', async () => {
      const there = trackedId('plan-byid-other');
      await repo.saveMany([anItem(there, { bookId: OTHER_BOOK_ID })]);

      const found = await repo.byId(there);

      expect(found?.bookId).toBe(OTHER_BOOK_ID);
    });
  });

  describe('findByBook', () => {
    /**
     * Os rótulos são o CONTRÁRIO do `order` de propósito: o item de
     * `order: 0` é o `z`, e o de `order: 2` é o `a`.
     *
     * Com os rótulos na mesma direção do `order` (o que este teste tinha
     * antes), trocar o `orderBy: { order: 'asc' }` por `{ id: 'asc' }` devolvia
     * a-b-c — que É a ordem esperada, por acidente de nomenclatura. O teste
     * passava com a implementação errada. Invertidos, `id` asc devolve
     * a-m-z = orders 2-1-0, e a asserção acusa.
     */
    it('returns the items ordered by order, not by id', async () => {
      const first = trackedId('plan-sort-z'); // order 0, id ordena por ÚLTIMO
      const middle = trackedId('plan-sort-m'); // order 1
      const last = trackedId('plan-sort-a'); // order 2, id ordena por PRIMEIRO
      // Salvos embaralhados, e nenhuma das duas ordens é a de inserção.
      await repo.saveMany([
        anItem(last, { order: 2, date: '2026-10-03' }),
        anItem(first, { order: 0, date: '2026-10-01' }),
        anItem(middle, { order: 1, date: '2026-10-02' }),
      ]);

      const found = await repo.findByBook(BOOK_ID);

      expect(found.map((item) => item.id)).toEqual([first, middle, last]);
      expect(found.map((item) => item.order)).toEqual([0, 1, 2]);
      expect(found.map((item) => item.date)).toEqual([
        '2026-10-01',
        '2026-10-02',
        '2026-10-03',
      ]);
      // A pré-condição que dá dente ao teste: por id a ordem seria OUTRA.
      expect([first, middle, last].slice().sort()).toEqual([
        last,
        middle,
        first,
      ]);
    });

    it('returns only the items of the book asked for', async () => {
      const here = trackedId('plan-scope-a');
      const there = trackedId('plan-scope-b');
      await repo.saveMany([
        anItem(here),
        anItem(there, { bookId: OTHER_BOOK_ID }),
      ]);

      const found = await repo.findByBook(BOOK_ID);

      expect(found.map((item) => item.id)).toEqual([here]);
    });

    it('returns an empty list for a book with no plan', async () => {
      await expect(
        repo.findByBook(prefixedId('t07', 'book-ghost')),
      ).resolves.toEqual([]);
    });
  });

  describe('replaceForBook', () => {
    let dayOne: string;
    let dayTwo: string;

    beforeEach(async () => {
      dayOne = trackedId('plan-day-one');
      dayTwo = trackedId('plan-day-two');
      await repo.saveMany([
        anItem(dayOne, { order: 0, date: '2026-10-01', title: 'Cap. 1' }),
        anItem(dayTwo, { order: 1, date: '2026-10-02', title: 'Cap. 2' }),
      ]);
    });

    // O CASO DO ADR 0007, contra o Postgres de verdade: inserir um item na
    // frente renumerando os sobreviventes, NUMA SÓ chamada. Com
    // `@@unique([bookId, order])` o item novo colidiria com o `order 0` que o
    // sobrevivente ainda ocupa — e índice único no Postgres não é deferível,
    // então nem a transação salvaria. É o teste que o fake não conseguia dar.
    it('inserts an item in front and renumbers the survivors, in one call', async () => {
      const prologue = trackedId('plan-prologue');

      const replaced = await repo.replaceForBook(BOOK_ID, {
        upsert: [
          anItem(prologue, { order: 0, date: '2026-09-30', title: 'Prólogo' }),
          anItem(dayOne, { order: 1, date: '2026-10-01', title: 'Cap. 1' }),
          anItem(dayTwo, { order: 2, date: '2026-10-02', title: 'Cap. 2' }),
        ],
        removeIds: [],
      });

      expect(replaced.map((item) => [item.id, item.order])).toEqual([
        [prologue, 0],
        [dayOne, 1],
        [dayTwo, 2],
      ]);
      const found = await repo.findByBook(BOOK_ID);
      expect(found.map((item) => item.id)).toEqual([prologue, dayOne, dayTwo]);
      // Os sobreviventes mantêm o id — é o que salva as anotações.
      expect(found.map((item) => item.date)).toEqual([
        '2026-09-30',
        '2026-10-01',
        '2026-10-02',
      ]);
    });

    it('removes the ids it was given and upserts the rest', async () => {
      const replaced = await repo.replaceForBook(BOOK_ID, {
        upsert: [
          anItem(dayTwo, { order: 0, date: '2026-10-02', title: 'Cap. 2' }),
        ],
        removeIds: [dayOne],
      });

      expect(replaced.map((item) => item.id)).toEqual([dayTwo]);
      expect((await repo.findByBook(BOOK_ID)).map((item) => item.id)).toEqual([
        dayTwo,
      ]);
    });

    // A remoção acontece ANTES do upsert, dentro da mesma transação: é o que
    // libera a `date` para um item novo do mesmo lote.
    it('lets a new item claim the date of a removed one', async () => {
      const fresh = trackedId('plan-fresh');

      await repo.replaceForBook(BOOK_ID, {
        upsert: [
          anItem(fresh, { order: 0, date: '2026-10-01', title: 'Prólogo' }),
        ],
        removeIds: [dayOne, dayTwo],
      });

      const found = await repo.findByBook(BOOK_ID);
      expect(found.map((item) => [item.id, item.date])).toEqual([
        [fresh, '2026-10-01'],
      ]);
    });

    it('empties the plan when the upsert is empty', async () => {
      await repo.replaceForBook(BOOK_ID, {
        upsert: [],
        removeIds: [dayOne, dayTwo],
      });

      expect(await repo.findByBook(BOOK_ID)).toEqual([]);
    });

    // Idempotência: um retry da mesma substituição não pode falhar.
    it('does not throw for a removeId that does not exist', async () => {
      await expect(
        repo.replaceForBook(BOOK_ID, {
          upsert: [],
          removeIds: [prefixedId('t07', 'plan-ghost')],
        }),
      ).resolves.toEqual([]);

      expect(await repo.findByBook(BOOK_ID)).toHaveLength(2);
    });

    // A remoção é escopada ao livro: um id de outro livro não apaga nada.
    it('never removes an item of another book', async () => {
      const there = trackedId('plan-otherbook-item');
      await repo.saveMany([anItem(there, { bookId: OTHER_BOOK_ID })]);

      await repo.replaceForBook(BOOK_ID, {
        upsert: [],
        removeIds: [there],
      });

      expect(await repo.findByBook(OTHER_BOOK_ID)).toHaveLength(1);
    });

    // ATOMICIDADE — a razão de este método existir em vez de deleteMany +
    // saveMany. Se o upsert viola o unique(bookId, date), NADA foi removido:
    // a tabela que ancora as anotações não pode ficar truncada.
    it('removes nothing when the upsert violates unique(bookId, date)', async () => {
      const before = await repo.findByBook(BOOK_ID);
      const colliding = trackedId('plan-colliding');

      await expect(
        repo.replaceForBook(BOOK_ID, {
          // Reivindica a data do dia 2, que NÃO está sendo removido.
          upsert: [anItem(colliding, { order: 0, date: '2026-10-02' })],
          removeIds: [dayOne],
        }),
      ).rejects.toThrow();

      expect(await repo.findByBook(BOOK_ID)).toEqual(before);
    });

    it('writes nothing from a batch whose last row violates the index', async () => {
      const before = await repo.findByBook(BOOK_ID);
      const good = trackedId('plan-atomic-good');
      const bad = trackedId('plan-atomic-bad');

      await expect(
        repo.replaceForBook(BOOK_ID, {
          upsert: [
            anItem(good, { order: 0, date: '2026-09-28' }),
            anItem(bad, { order: 1, date: '2026-10-02' }),
          ],
          removeIds: [],
        }),
      ).rejects.toThrow();

      expect(await repo.findByBook(BOOK_ID)).toEqual(before);
    });
  });

  /**
   * ⚠️ **O `find` DA TAREFA 37 — "o trecho de hoje, nestes livros", contra o
   * Postgres.**
   *
   * O port cresceu junto com esta implementação, na MESMA unidade (§6.9).
   *
   * ⚠️ **É AQUI que a decisão A se prova contra o banco:** o dia vem como
   * `CalendarDay` (`"YYYY-MM-DD"`), atravessa o `calendarDayToDate` — o único
   * tradutor, sempre em UTC — e casa a coluna `@db.Date` por **igualdade**.
   * Nenhuma faixa, nenhum `startOf`, nenhuma comparação de `Date` espalhada.
   *
   * Esta máquina está em **UTC−3**, e é justamente o fuso em que a
   * implementação ingênua erra: `new Date('2026-10-05T00:00:00')` daria
   * `2026-10-05T03:00Z`, e o item do dia 5 não casaria — ou o do dia 4 casaria
   * no lugar. O `calendar-day-mapper.ts` registra a medição.
   */
  describe('find({ bookIds, date })', () => {
    beforeEach(async () => {
      await repo.saveMany([
        anItem(trackedId('find-hoje'), { order: 0, date: '2026-10-05' }),
        anItem(trackedId('find-amanha'), { order: 1, date: '2026-10-06' }),
        anItem(trackedId('find-outro-livro'), {
          bookId: OTHER_BOOK_ID,
          order: 0,
          date: '2026-10-05',
        }),
      ]);
    });

    it('brings the item of that exact calendar day, in those books only', async () => {
      const found = await repo.find({
        bookIds: [BOOK_ID],
        date: '2026-10-05',
      });

      expect(found).toHaveLength(1);
      expect(required(found[0]).date).toBe('2026-10-05');
      expect(required(found[0]).bookId).toBe(BOOK_ID);
    });

    it('brings one item per book when the same day is in two books', async () => {
      const found = await repo.find({
        bookIds: [BOOK_ID, OTHER_BOOK_ID],
        date: '2026-10-05',
      });

      expect(found.map((item) => item.bookId).sort()).toEqual(
        [BOOK_ID, OTHER_BOOK_ID].sort(),
      );
    });

    /**
     * ⚠️ **Os dois vizinhos do dia ficam de fora, e é a prova de que a
     * comparação é IGUALDADE e não faixa.** Um `gte`/`lt` mal escrito traria o
     * dia 6 aqui.
     */
    it('asks for one day and gets one day, never a neighbour', async () => {
      // O dia 4 não existe no plano: vazio.
      await expect(
        repo.find({ bookIds: [BOOK_ID], date: '2026-10-04' }),
      ).resolves.toEqual([]);

      // O dia 6 existe — e vem SOZINHO, sem o 5 a reboque. É esta metade que
      // uma faixa mal escrita (`gte` sem `lt`) quebraria.
      const tomorrow = await repo.find({
        bookIds: [BOOK_ID],
        date: '2026-10-06',
      });
      expect(tomorrow.map((item) => item.date)).toEqual(['2026-10-06']);
    });

    /**
     * ⚠️ **Nenhuma ida ao banco com lista vazia** — senão seria um `IN ()` a
     * cada 5 minutos, para sempre, para quem está entre dois livros.
     *
     * O que o teste consegue provar daqui é o **resultado**; que não houve
     * consulta está no `if` da implementação e no espelho do fake. O par
     * positivo (o mesmo dia COM livro) é o que impede "devolve vazio sempre" de
     * passar.
     */
    it('answers empty for an empty list of books', async () => {
      await expect(
        repo.find({ bookIds: [], date: '2026-10-05' }),
      ).resolves.toEqual([]);
      await expect(
        repo.find({ bookIds: [BOOK_ID], date: '2026-10-05' }),
      ).resolves.toHaveLength(1);
    });

    /**
     * ⚠️ **O id de um livro que não é da pessoa não traz nada de graça** — o
     * corte de tenant é do chamador (ver o port), e este teste pina que o
     * repositório respeita a lista que recebeu em vez de ignorá-la.
     */
    it('never brings a book that was not asked for', async () => {
      const found = await repo.find({
        bookIds: [OTHER_BOOK_ID],
        date: '2026-10-05',
      });

      expect(found.map((item) => item.bookId)).toEqual([OTHER_BOOK_ID]);
    });
  });
});
