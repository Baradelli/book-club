import type {
  FastifyInstance,
  InjectOptions,
  LightMyRequestResponse,
} from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '../../http/server';
import {
  prefixedEmail,
  prefixedId,
  prisma,
  removeFixtures,
} from '../../repositories/__tests__/_db';

const CLUB_ID = prefixedId('t07', 'book-club');
const OTHER_CLUB_ID = prefixedId('t07', 'book-otherclub');
const ADMIN_ID = prefixedId('t07', 'book-admin');
const MEMBER_ID = prefixedId('t07', 'book-member');
const OUTSIDER_ID = prefixedId('t07', 'book-outsider');
/**
 * Um livro ATIVO no clube alheio, semeado direto no banco.
 *
 * Existe para as asserções de escopo terem dente: `every(clubId === CLUB_ID)`
 * numa lista onde nenhum livro de outro clube existe passa com o filtro de
 * `clubId` removido.
 */
const OTHER_CLUB_BOOK_ID = prefixedId('t07', 'book-of-otherclub');

const membershipIds: string[] = [];
const userIds: string[] = [ADMIN_ID, MEMBER_ID, OUTSIDER_ID];

interface BookBody {
  id: string;
  clubId: string;
  title: string;
  author: string | null;
  month: string;
  coverUrl: string | null;
  totalPages: number | null;
  status: string;
  archivedAt: string | null;
}

interface PlanItemBody {
  id: string;
  bookId: string;
  order: number;
  date: string;
  title: string;
  reference: string | null;
}

interface ErrorBody {
  error: string;
  details?: { path: string; message: string }[];
}

async function seedUser(id: string, prefix: string): Promise<void> {
  await prisma.user.upsert({
    where: { id },
    create: { id, email: prefixedEmail('t07', prefix), name: prefix },
    update: {},
  });
}

async function seedMembership(
  userId: string,
  clubId: string,
  role: 'OWNER' | 'ADMIN' | 'MEMBER',
): Promise<void> {
  const id = prefixedId('t07', `ms-${role}`);
  await prisma.membership.create({
    data: { id, userId, clubId, role, status: 'ACTIVE' },
  });
  membershipIds.push(id);
}

describe('book routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let memberToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    app = await buildServer({ logger: false });
    await app.ready();

    for (const [id, prefix] of [
      [ADMIN_ID, 'book-admin'],
      [MEMBER_ID, 'book-member'],
      [OUTSIDER_ID, 'book-outsider'],
    ] as const) {
      await seedUser(id, prefix);
    }
    for (const [id, name] of [
      [CLUB_ID, 'Clube do Livro'],
      [OTHER_CLUB_ID, 'Clube de Outra Gente'],
    ] as const) {
      await prisma.club.upsert({
        where: { id },
        create: { id, name },
        update: {},
      });
    }

    await prisma.book.create({
      data: {
        id: OTHER_CLUB_BOOK_ID,
        clubId: OTHER_CLUB_ID,
        title: 'Livro de Outra Gente',
        month: '2026-10',
        createdById: OUTSIDER_ID,
      },
    });

    await seedMembership(ADMIN_ID, CLUB_ID, 'ADMIN');
    await seedMembership(MEMBER_ID, CLUB_ID, 'MEMBER');
    // O outsider é OWNER de OUTRO clube: tem conta e papel, só não neste.
    await seedMembership(OUTSIDER_ID, OTHER_CLUB_ID, 'OWNER');

    adminToken = app.jwt.sign({ sub: ADMIN_ID });
    memberToken = app.jwt.sign({ sub: MEMBER_ID });
    outsiderToken = app.jwt.sign({ sub: OUTSIDER_ID });
  });

  // A limpeza CONSULTA o banco (o formato do invite-routes, CONVENCOES-CODIGO
  // §6.6): um teste que falhe no meio deixa livro e plano para trás, e uma
  // lista alimentada pelas respostas esperadas estouraria na FK.
  afterAll(async () => {
    const books = await prisma.book.findMany({
      where: { clubId: { in: [CLUB_ID, OTHER_CLUB_ID] } },
      select: { id: true },
    });
    const planItems = await prisma.readingPlanItem.findMany({
      where: { bookId: { in: books.map((book) => book.id) } },
      select: { id: true },
    });
    // As notas ANTES do plano: a guarda do plano tem um teste que escreve uma
    // anotação de verdade, e `Note.planItemId` é `onDelete: Restrict` — sem
    // esta consulta a limpeza estouraria na FK. Consultada pelo `bookId`, não
    // por uma lista alimentada pelas respostas: a nota nasce com id do
    // servidor. → CONVENCOES-CODIGO §6.6.
    const notes = await prisma.note.findMany({
      where: { bookId: { in: books.map((book) => book.id) } },
      select: { id: true },
    });
    const memberships = await prisma.membership.findMany({
      where: { clubId: { in: [CLUB_ID, OTHER_CLUB_ID] } },
      select: { id: true },
    });

    await removeFixtures({
      noteIds: notes.map((note) => note.id),
      planItemIds: planItems.map((item) => item.id),
      bookIds: books.map((book) => book.id),
      membershipIds: [
        ...new Set([...membershipIds, ...memberships.map((m) => m.id)]),
      ],
      clubIds: [CLUB_ID, OTHER_CLUB_ID],
      userIds,
    });
    await prisma.$disconnect();
    await app.close();
  });

  async function postBook(
    payload: InjectOptions['payload'],
    token = adminToken,
    clubId = CLUB_ID,
  ): Promise<LightMyRequestResponse> {
    return await app.inject({
      method: 'POST',
      url: `/clubs/${clubId}/books`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  /** Um livro com plano, criado pela própria rota. */
  async function createBook(
    overrides: Record<string, unknown> = {},
  ): Promise<{ book: BookBody; planItems: PlanItemBody[] }> {
    const response = await postBook({
      title: 'O Hobbit',
      month: '2026-10',
      author: 'J. R. R. Tolkien',
      totalPages: 320,
      planItems: [
        { date: '2026-10-01', title: 'Cap. 1', reference: 'p. 1-20' },
        { date: '2026-10-02', title: 'Cap. 2' },
      ],
      ...overrides,
    });
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  describe('POST /clubs/:clubId/books', () => {
    it('lets the ADMIN create a book with its plan', async () => {
      const response = await postBook({
        title: '  O Hobbit  ',
        month: '2026-10',
        author: 'J. R. R. Tolkien',
        totalPages: 320,
        planItems: [
          { date: '2026-10-05', title: 'Cap. 1', reference: 'p. 1-20' },
          { date: '2026-10-06', title: 'Cap. 2' },
        ],
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{
        book: BookBody;
        planItems: PlanItemBody[];
      }>();
      expect(body.book.title).toBe('O Hobbit');
      expect(body.book.clubId).toBe(CLUB_ID);
      expect(body.book.status).toBe('ACTIVE');
      expect(body.book.archivedAt).toBeNull();
      expect(body.book.coverUrl).toBeNull();
      // O DIA NÃO ESCORREGA: '2026-10-05' vai e volta como '2026-10-05'.
      expect(body.planItems.map((item) => item.date)).toEqual([
        '2026-10-05',
        '2026-10-06',
      ]);
      expect(body.planItems.map((item) => item.order)).toEqual([0, 1]);
      expect(body.planItems[1]?.reference).toBeNull();
    });

    // O `''` de um campo de capa em branco atravessa a borda e chega ao
    // `optionalText`, que existe nominalmente para transformá-lo em `null`.
    // Um `z.string().url()` puro matava esse caminho com 400.
    it('turns an empty coverUrl into null on the saved book', async () => {
      const response = await postBook({
        title: 'Capa em Branco',
        month: '2026-10',
        coverUrl: '',
      });

      expect(response.statusCode).toBe(201);
      const { book } = response.json<{ book: BookBody }>();
      expect(book.coverUrl).toBeNull();
      // E no banco, não só na resposta.
      expect(
        (await prisma.book.findUnique({ where: { id: book.id } }))?.coverUrl,
      ).toBeNull();
    });

    it('keeps a real coverUrl', async () => {
      const response = await postBook({
        title: 'Com Capa',
        month: '2026-10',
        coverUrl: 'https://exemplo.test/capa.jpg',
      });

      expect(response.statusCode).toBe(201);
      expect(response.json<{ book: BookBody }>().book.coverUrl).toBe(
        'https://exemplo.test/capa.jpg',
      );
    });

    it('answers 400 with details for a coverUrl that is not a URL', async () => {
      const response = await postBook({
        title: 'Capa Ruim',
        month: '2026-10',
        coverUrl: 'nao-e-url',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorBody>().details?.[0]?.path).toBe('coverUrl');
    });

    it('answers 403 for a MEMBER of the club', async () => {
      const response = await postBook(
        { title: 'Do Membro', month: '2026-10' },
        memberToken,
      );

      expect(response.statusCode).toBe(403);
    });

    // O CORTE DE TENANT: 404, não 403 — não confirmamos a existência de um
    // clube que não é da pessoa.
    it('answers 404 for a user who belongs to another club', async () => {
      const response = await postBook(
        { title: 'Do Invasor', month: '2026-10' },
        outsiderToken,
      );

      expect(response.statusCode).toBe(404);
      expect(await prisma.book.count({ where: { title: 'Do Invasor' } })).toBe(
        0,
      );
    });

    it('answers 401 without a token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/clubs/${CLUB_ID}/books`,
        payload: { title: 'Sem Token', month: '2026-10' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('answers 400 with details pointing at the offending plan item', async () => {
      const response = await postBook({
        title: 'Plano Ruim',
        month: '2026-10',
        planItems: [
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-02-30', title: 'Cap. 2' },
        ],
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ErrorBody>();
      expect(body.details?.[0]?.path).toBe('planItems.1.date');
    });

    // Nenhum handler aceita o tenant do corpo: o strip do Zod é a primeira
    // barreira, a ordem do spread é a segunda.
    it('ignores a clubId and a createdById smuggled into the body', async () => {
      const response = await postBook({
        title: 'Com Contrabando',
        month: '2026-10',
        clubId: OTHER_CLUB_ID,
        createdById: OUTSIDER_ID,
        status: 'ARCHIVED',
      });

      expect(response.statusCode).toBe(201);
      const { book } = response.json<{ book: BookBody }>();
      expect(book.clubId).toBe(CLUB_ID);
      expect(book.status).toBe('ACTIVE');
    });
  });

  describe('GET /clubs/:clubId/books', () => {
    it('lets a MEMBER list the books (reading needs no role)', async () => {
      const { book } = await createBook({ title: 'Para Listar' });

      const response = await app.inject({
        method: 'GET',
        url: `/clubs/${CLUB_ID}/books`,
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BookBody[]>();
      expect(body.map((item) => item.id)).toContain(book.id);
      // O corte de tenant da LISTA, com dente: o `OTHER_CLUB_BOOK_ID` existe
      // e está ACTIVE. Sem ele semeado, o `every(clubId === CLUB_ID)` passava
      // mesmo se o filtro de `clubId` fosse removido, porque nenhum livro de
      // outro clube existia — a asserção prometia mais do que provava.
      expect(body.map((item) => item.id)).not.toContain(OTHER_CLUB_BOOK_ID);
      expect(body.every((item) => item.clubId === CLUB_ID)).toBe(true);
    });

    // ...e o espelho: o livro alheio aparece para quem é do clube dele. Sem
    // este, um filtro que devolvesse SEMPRE vazio passaria no teste acima.
    it('returns the other club book to the owner of that club', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/clubs/${OTHER_CLUB_ID}/books`,
        headers: { authorization: `Bearer ${outsiderToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<BookBody[]>().map((item) => item.id)).toEqual([
        OTHER_CLUB_BOOK_ID,
      ]);
    });

    it('hides the archived book unless includeArchived=true', async () => {
      const { book } = await createBook({ title: 'Para Arquivar na Lista' });
      await app.inject({
        method: 'DELETE',
        url: `/books/${book.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const withoutArchived = await app.inject({
        method: 'GET',
        url: `/clubs/${CLUB_ID}/books`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const withArchived = await app.inject({
        method: 'GET',
        url: `/clubs/${CLUB_ID}/books?includeArchived=true`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(
        withoutArchived.json<BookBody[]>().map((item) => item.id),
      ).not.toContain(book.id);
      expect(withArchived.json<BookBody[]>().map((item) => item.id)).toContain(
        book.id,
      );
    });

    // `z.coerce.boolean()` faria 'false' virar true. O enum não.
    it('treats includeArchived=false as false', async () => {
      const { book } = await createBook({ title: 'Arquivado com false' });
      await app.inject({
        method: 'DELETE',
        url: `/books/${book.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/clubs/${CLUB_ID}/books?includeArchived=false`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<BookBody[]>().map((item) => item.id)).not.toContain(
        book.id,
      );
    });

    it('answers 400 for an includeArchived that is neither true nor false', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/clubs/${CLUB_ID}/books?includeArchived=sim`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('answers 404 for a user who belongs to another club', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/clubs/${CLUB_ID}/books`,
        headers: { authorization: `Bearer ${outsiderToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('answers 401 without a token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/clubs/${CLUB_ID}/books`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /books/:bookId', () => {
    it('returns the book with the plan ordered', async () => {
      const { book } = await createBook({
        title: 'Para Abrir',
        planItems: [
          { date: '2026-10-03', title: 'Cap. 3' },
          { date: '2026-10-04', title: 'Cap. 4' },
          { date: '2026-10-05', title: 'Cap. 5' },
        ],
      });

      const response = await app.inject({
        method: 'GET',
        url: `/books/${book.id}`,
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        book: BookBody;
        planItems: PlanItemBody[];
      }>();
      expect(body.planItems.map((item) => item.order)).toEqual([0, 1, 2]);
      expect(body.planItems.map((item) => item.date)).toEqual([
        '2026-10-03',
        '2026-10-04',
        '2026-10-05',
      ]);
    });

    it('answers 404 for a book of another club', async () => {
      const { book } = await createBook({ title: 'Alheio para GET' });

      const response = await app.inject({
        method: 'GET',
        url: `/books/${book.id}`,
        headers: { authorization: `Bearer ${outsiderToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('answers 404 for a book that does not exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/books/${prefixedId('t07', 'ghost')}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('answers 401 without a token', async () => {
      const { book } = await createBook({ title: 'GET sem token' });

      const response = await app.inject({
        method: 'GET',
        url: `/books/${book.id}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /books/:bookId', () => {
    it('answers 400 with details pointing at month', async () => {
      const { book } = await createBook({ title: 'Mês Ruim' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/books/${book.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { month: '2026-13' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ErrorBody>();
      expect(body.details?.[0]?.path).toBe('month');
    });

    // A regra 5 da Tarefa 06, ponta a ponta: `null` limpa, ausente não mexe.
    it('clears the author with an explicit null and keeps what was absent', async () => {
      const { book } = await createBook({ title: 'Para Limpar' });

      const cleared = await app.inject({
        method: 'PATCH',
        url: `/books/${book.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { author: null },
      });

      expect(cleared.statusCode).toBe(200);
      const body = cleared.json<BookBody>();
      expect(body.author).toBeNull();
      // O que não estava no corpo não foi mexido.
      expect(body.title).toBe('Para Limpar');
      expect(body.totalPages).toBe(320);
      expect(body.month).toBe('2026-10');
    });

    it('changes only the field in the body', async () => {
      const { book } = await createBook({ title: 'Título Antigo' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/books/${book.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { title: 'Título Novo' },
      });

      const body = response.json<BookBody>();
      expect(body.title).toBe('Título Novo');
      expect(body.author).toBe('J. R. R. Tolkien');
    });

    it('answers 403 for a MEMBER of the club', async () => {
      const { book } = await createBook({ title: 'PATCH do membro' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/books/${book.id}`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { title: 'Não vai' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('answers 404 for a book of another club', async () => {
      const { book } = await createBook({ title: 'Alheio para PATCH' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/books/${book.id}`,
        headers: { authorization: `Bearer ${outsiderToken}` },
        payload: { title: 'Não vai' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('answers 401 without a token', async () => {
      const { book } = await createBook({ title: 'PATCH sem token' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/books/${book.id}`,
        payload: { title: 'Não vai' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /books/:bookId', () => {
    it('archives the book and the next GET answers 404', async () => {
      const { book } = await createBook({ title: 'Para Arquivar' });

      const archived = await app.inject({
        method: 'DELETE',
        url: `/books/${book.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(archived.statusCode).toBe(200);
      const body = archived.json<BookBody>();
      expect(body.status).toBe('ARCHIVED');
      expect(body.archivedAt).not.toBeNull();

      const after = await app.inject({
        method: 'GET',
        url: `/books/${book.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(after.statusCode).toBe(404);
    });

    // Arquivar o livro NÃO apaga o plano: é o plano que ancora as anotações.
    it('keeps the plan of the archived book in the database', async () => {
      const { book, planItems } = await createBook({
        title: 'Plano Sobrevive',
      });

      await app.inject({
        method: 'DELETE',
        url: `/books/${book.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(
        await prisma.readingPlanItem.count({ where: { bookId: book.id } }),
      ).toBe(planItems.length);
    });

    it('answers 403 for a MEMBER of the club', async () => {
      const { book } = await createBook({ title: 'DELETE do membro' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/books/${book.id}`,
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('answers 404 for a book of another club', async () => {
      const { book } = await createBook({ title: 'Alheio para DELETE' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/books/${book.id}`,
        headers: { authorization: `Bearer ${outsiderToken}` },
      });

      expect(response.statusCode).toBe(404);
      expect(
        (await prisma.book.findUnique({ where: { id: book.id } }))?.status,
      ).toBe('ACTIVE');
    });

    it('answers 401 without a token', async () => {
      const { book } = await createBook({ title: 'DELETE sem token' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/books/${book.id}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PUT /books/:bookId/plan', () => {
    let bookId: string;
    let dayOneId: string;
    let dayTwoId: string;

    beforeEach(async () => {
      const created = await createBook({ title: 'Para Replanejar' });
      bookId = created.book.id;
      dayOneId = created.planItems[0]?.id ?? '';
      dayTwoId = created.planItems[1]?.id ?? '';
      expect(dayOneId).not.toBe('');
      expect(dayTwoId).not.toBe('');
    });

    // A PROVA QUE MAIS IMPORTA: inserir um dia na frente e o `id` do item
    // sobrevivente continuar o mesmo. É a garantia, PELA ROTA, de que a
    // anotação de quem já escreveu não seria destruída.
    it('inserts a day in front and keeps the id of every survivor', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/books/${bookId}/plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planItems: [
            { date: '2026-09-30', title: 'Prólogo' },
            { date: '2026-10-01', title: 'Cap. 1' },
            { date: '2026-10-02', title: 'Cap. 2 — corrigido' },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        planItems: PlanItemBody[];
        created: number;
        updated: number;
        removed: number;
      }>();
      expect({
        created: body.created,
        updated: body.updated,
        removed: body.removed,
      }).toEqual({ created: 1, updated: 2, removed: 0 });
      expect(body.planItems.map((item) => item.order)).toEqual([0, 1, 2]);
      expect(body.planItems.map((item) => item.date)).toEqual([
        '2026-09-30',
        '2026-10-01',
        '2026-10-02',
      ]);
      // OS IDS DOS SOBREVIVENTES SÃO OS MESMOS DE ANTES, renumerados.
      expect(body.planItems[1]?.id).toBe(dayOneId);
      expect(body.planItems[2]?.id).toBe(dayTwoId);
      expect(body.planItems[1]?.order).toBe(1);
      expect(body.planItems[2]?.order).toBe(2);
      // ...e o item novo é novo.
      expect([dayOneId, dayTwoId]).not.toContain(body.planItems[0]?.id);

      // O que o GET seguinte lê é o mesmo, com as datas intactas.
      const after = await app.inject({
        method: 'GET',
        url: `/books/${bookId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const plan = after.json<{ planItems: PlanItemBody[] }>().planItems;
      expect(plan.map((item) => item.id)).toEqual(
        body.planItems.map((item) => item.id),
      );
    });

    it('removes the day whose date disappeared', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/books/${bookId}/plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { planItems: [{ date: '2026-10-02', title: 'Cap. 2' }] },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        planItems: PlanItemBody[];
        removed: number;
      }>();
      expect(body.removed).toBe(1);
      expect(body.planItems.map((item) => item.id)).toEqual([dayTwoId]);
      expect(
        await prisma.readingPlanItem.count({ where: { id: dayOneId } }),
      ).toBe(0);
    });

    /**
     * ⚠️ A GUARDA DO PLANO, **pela rota** — a fiação
     * `new ReplacePlanItems(..., repos.notes)` que é a razão declarada de a
     * pendência da Tarefa 06 ter caído nesta fatia.
     *
     * A guarda é provada no unitário com o fake; o que este teste prova é que
     * o repositório de notas está **ligado** ao UseCase aqui. A auditoria
     * mediu: trocar `repos.notes` na rota por um duplo cujo
     * `planItemIdsWithAnyNote` devolve `[]` sobrevivia aos 1202 testes, e a
     * consequência real era `PUT /books/:bookId/plan` respondendo **500** (o
     * `P2003` cru do `Restrict`) em vez do 400 que explica.
     *
     * Por isso a nota é escrita pela ROTA e a sobrevivência do dia é conferida
     * por `count` no banco: é o par (status, linha) que distingue a guarda
     * ligada da FK gritando no meio da transação.
     */
    it('answers 400 without touching the plan when a removed day already has a note', async () => {
      const written = await app.inject({
        method: 'PUT',
        url: `/plan-items/${dayTwoId}/note`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          doc: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'o dia 2 é meu' }],
              },
            ],
          },
        },
      });
      expect(written.statusCode).toBe(201);

      const response = await app.inject({
        method: 'PUT',
        url: `/books/${bookId}/plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { planItems: [{ date: '2026-10-01', title: 'Cap. 1' }] },
      });

      // 400, e NÃO 500: sem a fiação o `Restrict` da FK viraria erro de banco.
      expect(response.statusCode).toBe(400);
      // A mensagem diz QUANTOS dias, e não cita autor nem conteúdo (§6.2).
      const body = response.json<ErrorBody>();
      expect(body.error).toContain('1');
      expect(body.error).not.toContain(ADMIN_ID);
      expect(body.error).not.toContain('o dia 2 é meu');

      // E NADA foi escrito nem removido: o dia continua no banco, com a nota.
      expect(
        await prisma.readingPlanItem.count({ where: { id: dayTwoId } }),
      ).toBe(1);
      expect(await prisma.readingPlanItem.count({ where: { bookId } })).toBe(2);
      expect(await prisma.note.count({ where: { planItemId: dayTwoId } })).toBe(
        1,
      );
    });

    it('empties the plan when planItems is empty', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/books/${bookId}/plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { planItems: [] },
      });

      expect(response.statusCode).toBe(200);
      expect(await prisma.readingPlanItem.count({ where: { bookId } })).toBe(0);
    });

    /**
     * A data repetida agora aponta a LINHA. A regra de sequência ("datas
     * únicas e estritamente crescentes") mudou de casa para
     * `@clube/shared/reading-plan-dates`, e é a MESMA função que o
     * `normalizePlanDrafts` usa — o mesmo movimento do `isCalendarDay`, uma
     * implementação com dois chamadores, não uma regra duplicada.
     *
     * Sem isto, um plano de 30 linhas com uma data repetida devolvia uma frase
     * em inglês e nada para a tela marcar em vermelho — e `CONVENCOES-CODIGO`
     * §6.2 proíbe exibir `message` cru. O `details` é o que a Tarefa 20 lê.
     */
    it('answers 400 with details pointing at the repeated date', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/books/${bookId}/plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planItems: [
            { date: '2026-10-01', title: 'Cap. 1' },
            { date: '2026-10-01', title: 'Cap. 1 de novo' },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ErrorBody>();
      expect(body.details?.[0]?.path).toBe('planItems.1.date');
      // O plano antigo continua inteiro: nada foi apagado no caminho.
      expect(await prisma.readingPlanItem.count({ where: { bookId } })).toBe(2);
    });

    it('answers 400 with details pointing at the date that is out of order', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/books/${bookId}/plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planItems: [
            { date: '2026-10-05', title: 'Cap. 5' },
            { date: '2026-10-02', title: 'Cap. 2' },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorBody>().details?.[0]?.path).toBe(
        'planItems.1.date',
      );
      expect(await prisma.readingPlanItem.count({ where: { bookId } })).toBe(2);
    });

    it('answers 400 with details for a malformed date', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/books/${bookId}/plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { planItems: [{ date: '2026-2-5', title: 'Cap. 1' }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorBody>().details?.[0]?.path).toBe(
        'planItems.0.date',
      );
    });

    it('answers 403 for a MEMBER of the club', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/books/${bookId}/plan`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { planItems: [] },
      });

      expect(response.statusCode).toBe(403);
      expect(await prisma.readingPlanItem.count({ where: { bookId } })).toBe(2);
    });

    it('answers 404 for a book of another club', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/books/${bookId}/plan`,
        headers: { authorization: `Bearer ${outsiderToken}` },
        payload: { planItems: [] },
      });

      expect(response.statusCode).toBe(404);
      expect(await prisma.readingPlanItem.count({ where: { bookId } })).toBe(2);
    });

    it('answers 401 without a token', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/books/${bookId}/plan`,
        payload: { planItems: [] },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // A guarda de boot exige `response` para o status de sucesso, e a rede de
  // runtime substitui o corpo de um status não declarado. As seis rotas
  // aparecem no OpenAPI — é o que a tela da Tarefa 20 vai ler.
  it('lists the six book routes in the OpenAPI document', () => {
    const paths = Object.keys(app.swagger().paths ?? {});

    expect(paths).toContain('/clubs/{clubId}/books');
    expect(paths).toContain('/books/{bookId}');
    expect(paths).toContain('/books/{bookId}/plan');
  });

  // O OpenAPI não pode PROMETER um status que o handler não produz: a tela da
  // Tarefa 20 vai gerar o cliente a partir dele. `GET` e `DELETE` de
  // `/books/:bookId` não têm corpo nem query, e nenhum dos dois UseCases lança
  // InvalidBookError — então não declaram 400.
  it('declares exactly the statuses each handler can send', () => {
    const paths = app.swagger().paths ?? {};
    const statusesOf = (path: string, method: string): string[] =>
      Object.keys(
        (paths[path] as Record<string, { responses?: object }> | undefined)?.[
          method
        ]?.responses ?? {},
      ).sort();

    expect(statusesOf('/clubs/{clubId}/books', 'post')).toEqual([
      '201',
      '400',
      '401',
      '403',
      '404',
    ]);
    expect(statusesOf('/clubs/{clubId}/books', 'get')).toEqual([
      '200',
      '400',
      '401',
      '404',
    ]);
    // Sem 400 nos dois abaixo.
    expect(statusesOf('/books/{bookId}', 'get')).toEqual(['200', '401', '404']);
    expect(statusesOf('/books/{bookId}', 'delete')).toEqual([
      '200',
      '401',
      '403',
      '404',
    ]);
    expect(statusesOf('/books/{bookId}', 'patch')).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
    ]);
    expect(statusesOf('/books/{bookId}/plan', 'put')).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
    ]);
  });
});
