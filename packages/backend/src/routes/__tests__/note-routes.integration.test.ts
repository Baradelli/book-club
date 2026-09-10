import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildServer } from '../../http/server';
import {
  prefixedEmail,
  prefixedId,
  prisma,
  removeFixtures,
} from '../../repositories/__tests__/_db';

const CLUB_ID = prefixedId('t11r', 'club');
const OTHER_CLUB_ID = prefixedId('t11r', 'otherclub');

/** A autora: `MEMBER` sem papel de admin — escrever não exige papel. */
const MARIA_ID = prefixedId('t11r', 'maria');
/** O outro autor, para o 403 de "nota de outra pessoa". */
const MARCOS_ID = prefixedId('t11r', 'marcos');
/** Tem conta e é OWNER de OUTRO clube: o corte de tenant tem de dar 404. */
const OUTSIDER_ID = prefixedId('t11r', 'outsider');

/** O livro principal. Os quatro dias são ALOCADOS por teste, ver abaixo. */
const BOOK_ID = prefixedId('t11r', 'book');
const DAY_1 = prefixedId('t11r', 'day1');
const DAY_2 = prefixedId('t11r', 'day2');
const DAY_3 = prefixedId('t11r', 'day3');
const DAY_4 = prefixedId('t11r', 'day4');

/**
 * Livro só para as regras 34 e 35 (a sobreposição de autoria).
 *
 * Livro próprio, e não mais dias no principal, porque a sobreposição é do LIVRO
 * inteiro: um teste anterior que escrevesse noutro dia mudaria a resposta
 * esperada aqui, e o vermelho apareceria com o nome de outro teste.
 */
const WRITERS_BOOK_ID = prefixedId('t11r', 'wbook');
const W_DAY_1 = prefixedId('t11r', 'wday1');
const W_DAY_2 = prefixedId('t11r', 'wday2');
const W_DAY_3 = prefixedId('t11r', 'wday3');

/**
 * Livro só para os filtros da listagem (regra 33).
 *
 * A listagem é do CLUBE inteiro, então toda asserção de filtro se ancora neste
 * `bookId` — senão as notas dos outros testes entrariam no resultado e a
 * asserção viraria uma corrida contra a ordem de execução.
 */
const FILTER_BOOK_ID = prefixedId('t11r', 'fbook');
const F_DAY_1 = prefixedId('t11r', 'fday1');

/** Livro do clube alheio, com um dia: o alvo dos 404 de tenant. */
const OTHER_CLUB_BOOK_ID = prefixedId('t11r', 'otherbook');
const OTHER_DAY_1 = prefixedId('t11r', 'otherday1');

const membershipIds: string[] = [];
const userIds: string[] = [MARIA_ID, MARCOS_ID, OUTSIDER_ID];
const bookIds = [BOOK_ID, WRITERS_BOOK_ID, FILTER_BOOK_ID, OTHER_CLUB_BOOK_ID];

interface NoteBody {
  id: string;
  clubId: string;
  bookId: string;
  userId: string;
  kind: string;
  planItemId: string | null;
  title: string;
  reference: string | null;
  doc: Record<string, unknown>;
  plainText: string;
  status: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WritersBody {
  planItemId: string;
  userIds: string[];
}

interface ErrorBody {
  error: string;
  details?: { path: string; message: string }[];
}

/**
 * O `doc` como o TipTap o produz: `content` aninhado, `marks` e um `attrs` que
 * NENHUM schema declara. É o que a regra 29 exige — sem o `.passthrough()` do
 * `noteDocSchema` a resposta sairia `{"doc":{"type":"doc"}}`, com 200 e sem
 * erro nenhum.
 *
 * Factory e não `const`: o `doc` é uma árvore, mutável por dentro, e um objeto
 * compartilhado entre testes é estado escondido. → CONVENCOES-CODIGO §7.7.
 */
function aRichDoc(text = 'pesado'): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: 'left', extensaoFutura: { nivel: 3 } },
        content: [
          { type: 'text', text: 'O anel é ', marks: [{ type: 'bold' }] },
          {
            type: 'text',
            text,
            marks: [
              { type: 'italic' },
              { type: 'highlight', attrs: { color: 'yellow' } },
            ],
          },
        ],
      },
      { type: 'horizontalRule' },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'e o portador também' }],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Um `doc` simples, quando o assunto do teste não é a árvore. */
function aPlainDoc(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

async function seedUser(id: string, prefix: string): Promise<void> {
  await prisma.user.upsert({
    where: { id },
    create: { id, email: prefixedEmail('t11r', prefix), name: prefix },
    update: {},
  });
}

async function seedMembership(
  userId: string,
  clubId: string,
  role: 'OWNER' | 'ADMIN' | 'MEMBER',
): Promise<void> {
  const id = prefixedId('t11r', `ms-${role}`);
  await prisma.membership.create({
    data: { id, userId, clubId, role, status: 'ACTIVE' },
  });
  membershipIds.push(id);
}

async function seedBook(
  id: string,
  clubId: string,
  createdById: string,
  title: string,
): Promise<void> {
  await prisma.book.create({
    data: { id, clubId, title, month: '2026-10', createdById },
  });
}

async function seedPlan(
  bookId: string,
  days: readonly (readonly [string, number, string])[],
): Promise<void> {
  await prisma.readingPlanItem.createMany({
    data: days.map(([id, order, date]) => ({
      id,
      bookId,
      order,
      date: new Date(`${date}T00:00:00.000Z`),
      title: `Cap. ${order + 1}`,
      reference: null,
    })),
  });
}

describe('note routes', () => {
  let app: FastifyInstance;
  let mariaToken: string;
  let marcosToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    app = await buildServer({ logger: false });
    await app.ready();

    for (const [id, prefix] of [
      [MARIA_ID, 'maria'],
      [MARCOS_ID, 'marcos'],
      [OUTSIDER_ID, 'outsider'],
    ] as const) {
      await seedUser(id, prefix);
    }

    for (const [id, name] of [
      [CLUB_ID, 'Clube do Casal'],
      [OTHER_CLUB_ID, 'Clube de Outra Gente'],
    ] as const) {
      await prisma.club.upsert({
        where: { id },
        create: { id, name },
        update: {},
      });
    }

    await seedMembership(MARIA_ID, CLUB_ID, 'MEMBER');
    await seedMembership(MARCOS_ID, CLUB_ID, 'MEMBER');
    // O outsider é OWNER de OUTRO clube: tem conta e papel, só não neste.
    await seedMembership(OUTSIDER_ID, OTHER_CLUB_ID, 'OWNER');

    await seedBook(BOOK_ID, CLUB_ID, MARIA_ID, 'O Hobbit');
    await seedPlan(BOOK_ID, [
      [DAY_1, 0, '2026-10-01'],
      [DAY_2, 1, '2026-10-02'],
      [DAY_3, 2, '2026-10-03'],
      [DAY_4, 3, '2026-10-04'],
    ]);

    await seedBook(WRITERS_BOOK_ID, CLUB_ID, MARIA_ID, 'A Sociedade do Anel');
    await seedPlan(WRITERS_BOOK_ID, [
      [W_DAY_1, 0, '2026-11-01'],
      [W_DAY_2, 1, '2026-11-02'],
      [W_DAY_3, 2, '2026-11-03'],
    ]);

    await seedBook(FILTER_BOOK_ID, CLUB_ID, MARIA_ID, 'As Duas Torres');
    await seedPlan(FILTER_BOOK_ID, [[F_DAY_1, 0, '2026-12-01']]);

    await seedBook(
      OTHER_CLUB_BOOK_ID,
      OTHER_CLUB_ID,
      OUTSIDER_ID,
      'Livro de Outra Gente',
    );
    await seedPlan(OTHER_CLUB_BOOK_ID, [[OTHER_DAY_1, 0, '2026-10-01']]);

    mariaToken = app.jwt.sign({ sub: MARIA_ID });
    marcosToken = app.jwt.sign({ sub: MARCOS_ID });
    outsiderToken = app.jwt.sign({ sub: OUTSIDER_ID });
  });

  /**
   * A limpeza CONSULTA o banco (o formato do `invite-routes`,
   * CONVENCOES-CODIGO §6.6): as notas nascem com id gerado pelo servidor, e um
   * teste que falhe no meio deixa nota para trás. Uma lista alimentada pelas
   * respostas esperadas estouraria na FK do `planItemId`
   * (`onDelete: Restrict`).
   */
  afterAll(async () => {
    const notes = await prisma.note.findMany({
      where: { bookId: { in: bookIds } },
      select: { id: true },
    });
    const planItems = await prisma.readingPlanItem.findMany({
      where: { bookId: { in: bookIds } },
      select: { id: true },
    });
    const memberships = await prisma.membership.findMany({
      where: { clubId: { in: [CLUB_ID, OTHER_CLUB_ID] } },
      select: { id: true },
    });

    await removeFixtures({
      noteIds: notes.map((note) => note.id),
      planItemIds: planItems.map((item) => item.id),
      bookIds,
      membershipIds: [
        ...new Set([...membershipIds, ...memberships.map((m) => m.id)]),
      ],
      clubIds: [CLUB_ID, OTHER_CLUB_ID],
      userIds,
    });
    await prisma.$disconnect();
    await app.close();
  });

  function auth(token: string): { authorization: string } {
    return { authorization: `Bearer ${token}` };
  }

  async function putDayNote(
    planItemId: string,
    payload: Record<string, unknown>,
    token = mariaToken,
  ): Promise<LightMyRequestResponse> {
    return await app.inject({
      method: 'PUT',
      url: `/plan-items/${planItemId}/note`,
      headers: auth(token),
      payload,
    });
  }

  async function postFreeNote(
    payload: Record<string, unknown>,
    token = mariaToken,
    bookId = BOOK_ID,
  ): Promise<LightMyRequestResponse> {
    return await app.inject({
      method: 'POST',
      url: `/books/${bookId}/notes`,
      headers: auth(token),
      payload,
    });
  }

  /** Uma avulsa criada pela própria rota, para os testes que precisam de uma. */
  async function createFreeNote(
    overrides: Record<string, unknown> = {},
    token = mariaToken,
    bookId = BOOK_ID,
  ): Promise<NoteBody> {
    const response = await postFreeNote(
      {
        title: 'Sobre o poder',
        doc: aPlainDoc('o anel corrompe'),
        ...overrides,
      },
      token,
      bookId,
    );
    expect(response.statusCode).toBe(201);
    return response.json<NoteBody>();
  }

  async function listNotes(
    query = '',
    token = mariaToken,
    clubId = CLUB_ID,
  ): Promise<LightMyRequestResponse> {
    return await app.inject({
      method: 'GET',
      url: `/clubs/${clubId}/notes${query}`,
      headers: auth(token),
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 25 — autenticação
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Regra 25 — as SEIS rotas exigem token. O escopo autenticado é um plugin
   * encapsulado, então isto vale por construção (§6.6) — e o teste existe para
   * a construção não deixar de valer sem ninguém notar.
   */
  describe('authentication', () => {
    it.each([
      ['PUT', `/plan-items/${DAY_1}/note`, { doc: { type: 'doc' } }],
      ['POST', `/books/${BOOK_ID}/notes`, { title: 'x', doc: { type: 'doc' } }],
      ['PATCH', '/notes/qualquer', { title: 'x' }],
      ['DELETE', '/notes/qualquer', undefined],
      ['GET', `/clubs/${CLUB_ID}/notes`, undefined],
      ['GET', `/books/${BOOK_ID}/writers`, undefined],
    ] as const)(
      'answers 401 for %s %s without a token',
      async (method, url, payload) => {
        const response = await app.inject({ method, url, payload });

        expect(response.statusCode).toBe(401);
      },
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 26 — o corte de tenant, nas seis
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Regra 26 — **404, nunca 403**: não confirmamos a existência de um recurso
   * de um clube que não é da pessoa. O outsider é OWNER de outro clube, então
   * tem conta e papel — só não neste.
   */
  describe('tenant cut', () => {
    it('answers 404 when an outsider writes the day note', async () => {
      const response = await putDayNote(
        DAY_1,
        { doc: aPlainDoc('invadi') },
        outsiderToken,
      );

      expect(response.statusCode).toBe(404);
      // E nada foi escrito: o corte vem antes da escrita.
      expect(await prisma.note.count({ where: { userId: OUTSIDER_ID } })).toBe(
        0,
      );
    });

    it('answers 404 when an outsider creates a free note', async () => {
      const response = await postFreeNote(
        { title: 'Invasão', doc: aPlainDoc('invadi') },
        outsiderToken,
      );

      expect(response.statusCode).toBe(404);
      expect(await prisma.note.count({ where: { userId: OUTSIDER_ID } })).toBe(
        0,
      );
    });

    it('answers 404 when an outsider patches a note of another club', async () => {
      const note = await createFreeNote();

      const response = await app.inject({
        method: 'PATCH',
        url: `/notes/${note.id}`,
        headers: auth(outsiderToken),
        payload: { title: 'Sequestrada' },
      });

      expect(response.statusCode).toBe(404);
      const stored = await prisma.note.findUnique({ where: { id: note.id } });
      expect(stored?.title).toBe('Sobre o poder');
    });

    it('answers 404 when an outsider archives a note of another club', async () => {
      const note = await createFreeNote();

      const response = await app.inject({
        method: 'DELETE',
        url: `/notes/${note.id}`,
        headers: auth(outsiderToken),
      });

      expect(response.statusCode).toBe(404);
      const stored = await prisma.note.findUnique({ where: { id: note.id } });
      expect(stored?.status).toBe('ACTIVE');
    });

    it('answers 404 when an outsider lists the notes of another club', async () => {
      const response = await listNotes('', outsiderToken);

      expect(response.statusCode).toBe(404);
    });

    it('answers 404 when an outsider asks who wrote in another club book', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/books/${BOOK_ID}/writers`,
        headers: auth(outsiderToken),
      });

      expect(response.statusCode).toBe(404);
    });

    /**
     * O outro lado do corte, que é o que prova que ele é do MEMBERSHIP e não do
     * id: a Maria é membro do clube dela e ainda assim não alcança o livro (nem
     * o dia) do clube alheio.
     */
    it('answers 404 when a member reaches for a book of another club', async () => {
      const day = await putDayNote(OTHER_DAY_1, { doc: aPlainDoc('oi') });
      const free = await postFreeNote(
        { title: 'x', doc: aPlainDoc('oi') },
        mariaToken,
        OTHER_CLUB_BOOK_ID,
      );
      const writers = await app.inject({
        method: 'GET',
        url: `/books/${OTHER_CLUB_BOOK_ID}/writers`,
        headers: auth(mariaToken),
      });
      const list = await listNotes('', mariaToken, OTHER_CLUB_ID);

      expect([
        day.statusCode,
        free.statusCode,
        writers.statusCode,
        list.statusCode,
      ]).toEqual([404, 404, 404, 404]);
      expect(
        await prisma.note.count({ where: { bookId: OTHER_CLUB_BOOK_ID } }),
      ).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 27 — autoria: 403, e é o único 403 de conteúdo do projeto
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Regra 27 — o Marcos é membro ATIVO do clube e **lê** a nota da Maria na
   * listagem (ADR 0002). Só não mexe nela: 403, não 404 — esconder de quem
   * acabou de ler a nota na tela ao lado não protegeria nada, e mentiria para o
   * front, que precisa distinguir "não existe" de "não é sua".
   */
  describe('authorship', () => {
    it('answers 403 when a club member patches someone else note', async () => {
      const note = await createFreeNote();

      const response = await app.inject({
        method: 'PATCH',
        url: `/notes/${note.id}`,
        headers: auth(marcosToken),
        payload: { title: 'Reescrevi a sua' },
      });

      expect(response.statusCode).toBe(403);
      const stored = await prisma.note.findUnique({ where: { id: note.id } });
      expect(stored?.title).toBe('Sobre o poder');
    });

    it('answers 403 when a club member archives someone else note', async () => {
      const note = await createFreeNote();

      const response = await app.inject({
        method: 'DELETE',
        url: `/notes/${note.id}`,
        headers: auth(marcosToken),
      });

      expect(response.statusCode).toBe(403);
      const stored = await prisma.note.findUnique({ where: { id: note.id } });
      expect(stored?.status).toBe('ACTIVE');
    });

    // O outro lado: o Marcos LÊ a nota da Maria. É o ADR 0002 na borda — e é o
    // que faz o 403 acima ser sobre autoria, não sobre visibilidade.
    it('lets a club member read the note of another member', async () => {
      const note = await createFreeNote();

      const response = await listNotes(`?bookId=${BOOK_ID}`, marcosToken);

      expect(response.statusCode).toBe(200);
      const ids = response.json<NoteBody[]>().map((found) => found.id);
      expect(ids).toContain(note.id);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 28 — 201 na criação, 200 na atualização, corpo válido nos DOIS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ⚠️ REGRA 28 — a armadilha do serializer POR STATUS.
   *
   * O `upsertPlanNote` é idempotente e devolve `created: boolean`; a rota
   * traduz isso em 201 × 200. Com só o 200 declarado no `response`, a rede de
   * segurança do `preSerialization` trocaria o corpo do 201 por um `{error}`
   * genérico — e quebraria **a primeira** escrita de cada nota do dia, só a
   * primeira. → CONVENCOES-CODIGO §6.1.
   *
   * O `DAY_3` é reservado a este teste: outro teste que escrevesse nele faria a
   * primeira escrita aqui já ser um 200.
   */
  describe('PUT /plan-items/:planItemId/note', () => {
    it('answers 201 on the first write and 200 on the next, with a valid body in both', async () => {
      const first = await putDayNote(DAY_3, { doc: aPlainDoc('comecei hoje') });
      const second = await putDayNote(DAY_3, {
        doc: aPlainDoc('reescrevi tudo'),
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(200);

      // O corpo é uma nota de verdade nos DOIS — é o que o `{error}` genérico
      // do preSerialization não seria.
      const created = first.json<NoteBody>();
      const updated = second.json<NoteBody>();
      expect(created.plainText).toBe('comecei hoje');
      expect(updated.plainText).toBe('reescrevi tudo');
      // A MESMA linha: o upsert é no par (planItemId, userId).
      expect(updated.id).toBe(created.id);
      expect(updated.kind).toBe('PLAN');
      expect(updated.planItemId).toBe(DAY_3);
      expect(updated.userId).toBe(MARIA_ID);
      // Uma linha só no banco, não duas.
      expect(
        await prisma.note.count({
          where: { planItemId: DAY_3, userId: MARIA_ID },
        }),
      ).toBe(1);
    });

    // O título da nota do dia é o TEMA do item do plano, não algo que o cliente
    // mande — e o schema `.strict()` recusaria um `title` no corpo.
    it('takes the title from the plan item, never from the body', async () => {
      const response = await putDayNote(DAY_4, { doc: aPlainDoc('li o cap') });

      expect(response.statusCode).toBe(201);
      // `seedPlan` nomeia o dia pelo `order + 1`; o DAY_4 é o quarto.
      expect(response.json<NoteBody>().title).toBe('Cap. 4');
    });

    it('answers 404 for a plan item that does not exist', async () => {
      const response = await putDayNote(prefixedId('t11r', 'ghost'), {
        doc: aPlainDoc('oi'),
      });

      expect(response.statusCode).toBe(404);
    });

    // Duas pessoas escrevem no MESMO dia: são duas notas, uma de cada.
    it('gives each author her own note on the same day', async () => {
      const maria = await putDayNote(
        DAY_2,
        { doc: aPlainDoc('a minha') },
        mariaToken,
      );
      const marcos = await putDayNote(
        DAY_2,
        { doc: aPlainDoc('a dele') },
        marcosToken,
      );

      expect(maria.statusCode).toBe(201);
      expect(marcos.statusCode).toBe(201);
      expect(maria.json<NoteBody>().id).not.toBe(marcos.json<NoteBody>().id);
      expect(await prisma.note.count({ where: { planItemId: DAY_2 } })).toBe(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // O `bodyLimit` por rota — decisão G da Tarefa 11
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ⚠️ AS TRÊS ROTAS DE ESCRITA, não uma.
   *
   * O `bodyLimit` POR ROTA é real, não um comentário: sem ele a Tarefa 14
   * elevaria o limite global para o editor aceitar imagem colada, e elevaria
   * junto o corpo da anotação — que não carrega imagem (ADR 0001). O teto que
   * importa é contagem de nós (o `docToText` custa memória: 1 M de nós ≈
   * 230 MB); bytes é a aproximação que temos hoje.
   *
   * Cobre as três porque a auditoria mediu que **duas não tinham acusador**:
   * tirar o `bodyLimit` do `POST` e do `PATCH` passava em 52/52, e os
   * `413: errorSchema` declarados nas duas eram ficção não verificada — o
   * default do Fastify é 1 MiB, então um corpo de 300 KiB simplesmente
   * passava. É exatamente o cenário do comentário da decisão G (alguém "limpa"
   * o limite por rota quando o global sobe).
   *
   * O `PATCH` mira um id que não existe de propósito: o `bodyLimit` é decidido
   * ANTES do handler, então o 413 não depende de haver nota — e sem o limite a
   * resposta seria 404, que é o vermelho que acusa.
   */
  describe('the per-route body limit', () => {
    const tooBig = (): Record<string, unknown> =>
      aPlainDoc('x'.repeat(300 * 1024));

    it.each([
      ['PUT', () => `/plan-items/${DAY_1}/note`, () => ({ doc: tooBig() })],
      [
        'POST',
        () => `/books/${BOOK_ID}/notes`,
        () => ({ title: 'Grande demais', doc: tooBig() }),
      ],
      [
        'PATCH',
        () => `/notes/${prefixedId('t11r', 'ghost')}`,
        () => ({ doc: tooBig() }),
      ],
    ] as const)(
      'answers 413 for a %s body past the per-route limit',
      async (method, url, payload) => {
        const response = await app.inject({
          method,
          url: url(),
          headers: auth(mariaToken),
          payload: payload(),
        });

        expect(response.statusCode).toBe(413);
        // E o erro sai no envelope da API, não no formato do Fastify.
        expect(response.json<ErrorBody>().error).toBe('Payload Too Large');
      },
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 29 — o `doc` volta IDÊNTICO ao que entrou
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ⚠️ REGRA 29 — losslessness na BORDA, provada por snapshot antes/depois e
   * nunca por um `toBe` de campo escolhido à mão (§7.6): o campo que a operação
   * apagou é justamente o que ninguém pensou em listar.
   *
   * Sem o `.passthrough()` do `noteDocSchema` — nos dois sentidos — a resposta
   * sairia `{"doc":{"type":"doc"}}` com **200 e sem erro nenhum**: o `content`
   * todo, os `marks` e os `attrs` de cada extensão, apagados.
   *
   * A comparação é a árvore INTEIRA contra a árvore inteira (`toEqual` do que
   * foi enviado), nunca um campo escolhido a dedo, e é isso que a torna um
   * snapshot antes/depois: o campo que a operação apagou é justamente o que
   * ninguém pensou em listar.
   *
   * ⚠️ Comparação por IGUALDADE PROFUNDA e não por `JSON.stringify`: a coluna é
   * `Json`, que o Prisma mapeia para **`jsonb`**, e o `jsonb` NORMALIZA a ordem
   * das chaves de cada objeto (por comprimento, depois bytewise) — `{type,text}`
   * volta como `{text,type}`. É reordenação, não perda: nenhum valor, `mark` ou
   * `attr` some, e o ProseMirror não depende de ordem de chave. Uma asserção por
   * string falharia por um motivo que não é o da regra.
   */
  describe('doc losslessness at the border', () => {
    it('returns the whole tree the day note went in with', async () => {
      const sent = aRichDoc('pesado');

      const response = await putDayNote(DAY_1, { doc: sent });

      expect(response.statusCode).toBeGreaterThanOrEqual(200);
      expect(response.json<NoteBody>().doc).toEqual(sent);
    });

    it('returns the whole tree the free note went in with', async () => {
      const sent = aRichDoc('leve');

      const response = await postFreeNote({ title: 'Árvore', doc: sent });

      expect(response.statusCode).toBe(201);
      expect(response.json<NoteBody>().doc).toEqual(sent);
    });

    // E sobrevive ao ROUND-TRIP pelo Postgres, não só ao serializer: a leitura
    // seguinte devolve a mesma árvore.
    it('returns the whole tree again on the next read', async () => {
      const sent = aRichDoc('relido');
      const note = await createFreeNote({ title: 'Round-trip', doc: sent });

      const response = await listNotes(`?bookId=${BOOK_ID}`);

      const found = response
        .json<NoteBody[]>()
        .find((candidate) => candidate.id === note.id);
      expect(found?.doc).toEqual(sent);
    });

    /**
     * A prova de que o `.passthrough()` é o que faz a diferença, e não a sorte:
     * a árvore recebida tem MAIS que a raiz. Sem ele o `doc` seria exatamente
     * `{ type: 'doc' }`, e o `toEqual` acima ainda passaria num doc que só
     * tivesse a raiz.
     */
    it('keeps the nested marks and the attrs no schema declares', async () => {
      const response = await postFreeNote({
        title: 'Marks e attrs',
        doc: aRichDoc('sublinhado'),
      });

      const serialized = JSON.stringify(response.json<NoteBody>().doc);
      expect(serialized).toContain('"highlight"');
      expect(serialized).toContain('"yellow"');
      expect(serialized).toContain('"extensaoFutura"');
      expect(serialized).toContain('"horizontalRule"');
      expect(serialized).toContain('"bulletList"');
    });

    // O `plainText` é DERIVADO da árvore inteira, no backend, e é o que prova
    // que o servidor recebeu a árvore e não só a raiz.
    it('derives plainText from the whole tree', async () => {
      const response = await postFreeNote({
        title: 'Derivado',
        doc: aRichDoc('pesado'),
      });

      const body = response.json<NoteBody>();
      expect(body.plainText).toContain('O anel é');
      expect(body.plainText).toContain('pesado');
      expect(body.plainText).toContain('e o portador também');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regras 30, 31 e 32 — o que o input aceita, e o que ele recusa
  // ───────────────────────────────────────────────────────────────────────────

  describe('input hardening', () => {
    /**
     * Regra 30 — `plainText` **sai** na resposta (é derivado e útil ao front) e
     * **não entra**: quem manda o campo derivado está enganado sobre quem manda
     * nele, e um 400 diz isso; o strip silencioso o deixaria achar que
     * funcionou. → ADR 0001.
     */
    it('answers 400 when the body carries plainText', async () => {
      const day = await putDayNote(DAY_1, {
        doc: aPlainDoc('oi'),
        plainText: 'mentira',
      });
      const free = await postFreeNote({
        title: 'x',
        doc: aPlainDoc('oi'),
        plainText: 'mentira',
      });
      const patch = await app.inject({
        method: 'PATCH',
        url: `/notes/${(await createFreeNote()).id}`,
        headers: auth(mariaToken),
        payload: { plainText: 'mentira' },
      });

      expect([day.statusCode, free.statusCode, patch.statusCode]).toEqual([
        400, 400, 400,
      ]);
      expect(await prisma.note.count({ where: { plainText: 'mentira' } })).toBe(
        0,
      );
    });

    /**
     * ⚠️ REGRA 31 — contrabando de autoria/tenant, testado com o **ator
     * legítimo** e assertando **a linha gravada**. Testá-lo com um ator de fora
     * não provaria nada sobre o campo: a requisição morreria no guard de tenant,
     * e morreria igual se o contrabando funcionasse. → §7.5.
     */
    it('never lets a userId in the body change who wrote the note', async () => {
      const response = await postFreeNote({
        title: 'Autoria',
        doc: aPlainDoc('minha'),
        userId: MARCOS_ID,
      });

      // A chave proibida é 400 pelo `.strict()`, e nada é escrito — mais forte
      // que "foi ignorada".
      expect(response.statusCode).toBe(400);
      expect(
        await prisma.note.count({
          where: { userId: MARCOS_ID, title: 'Autoria' },
        }),
      ).toBe(0);
    });

    it('never lets a clubId in the body move the note to another club', async () => {
      const response = await postFreeNote({
        title: 'Tenant',
        doc: aPlainDoc('minha'),
        clubId: OTHER_CLUB_ID,
      });

      expect(response.statusCode).toBe(400);
      expect(
        await prisma.note.count({ where: { clubId: OTHER_CLUB_ID } }),
      ).toBe(0);
    });

    /**
     * E o caminho FELIZ do mesmo par de campos: sem nada no corpo, o `clubId` e
     * o `userId` gravados são os do JWT e do livro. É o que distingue "a chave
     * foi recusada" de "o servidor sabe de onde tira esses valores".
     */
    it('takes clubId from the book and userId from the JWT', async () => {
      const note = await createFreeNote({ title: 'De onde vem' });

      expect(note.clubId).toBe(CLUB_ID);
      expect(note.userId).toBe(MARIA_ID);
      const stored = await prisma.note.findUnique({ where: { id: note.id } });
      expect(stored?.clubId).toBe(CLUB_ID);
      expect(stored?.userId).toBe(MARIA_ID);
    });

    // Regra 32 — `doc` que não é doc → 400 COM `details` apontando o campo. É o
    // que a tela precisa para marcar o erro no lugar certo.
    it('answers 400 with details for a doc that is not a doc', async () => {
      const response = await putDayNote(DAY_1, { doc: { type: 'paragraph' } });

      expect(response.statusCode).toBe(400);
      const body = response.json<ErrorBody>();
      expect(body.details?.map((detail) => detail.path)).toContain('doc.type');
    });

    it('answers 400 for a body without a doc', async () => {
      const response = await putDayNote(DAY_1, {});

      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorBody>().details?.[0]?.path).toBe('doc');
    });

    // Regra 32 — título vazio na avulsa → 400, e o `details` aponta `title`
    // (o `.trim()` antes do `.min(1)` é o que traz o erro para a borda).
    it('answers 400 with details for an empty title on a free note', async () => {
      const response = await postFreeNote({
        title: '   ',
        doc: aPlainDoc('oi'),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorBody>().details?.[0]?.path).toBe('title');
    });

    // O PATCH da nota do DIA é recusado: ela tem o caminho de escrita próprio
    // (o PUT), que ressincroniza o título com o tema do plano.
    it('answers 400 when the PATCH targets a reading plan note', async () => {
      const created = await putDayNote(DAY_4, { doc: aPlainDoc('do dia') });
      const noteId = created.json<NoteBody>().id;

      const response = await app.inject({
        method: 'PATCH',
        url: `/notes/${noteId}`,
        headers: auth(mariaToken),
        payload: { title: 'Outro título' },
      });

      expect(response.statusCode).toBe(400);
    });

    // A distinção ausente × `null` atravessa a borda: `null` LIMPA a referência.
    it('clears the reference when the patch says null', async () => {
      const note = await createFreeNote({ reference: 'p. 45' });
      expect(note.reference).toBe('p. 45');

      const response = await app.inject({
        method: 'PATCH',
        url: `/notes/${note.id}`,
        headers: auth(mariaToken),
        payload: { reference: null },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<NoteBody>().reference).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 33 — os cinco filtros da listagem
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Regra 33 — os cinco filtros chegam por query string e são APLICADOS.
   *
   * Todas as asserções se ancoram no `FILTER_BOOK_ID`: a listagem é do clube
   * inteiro, e sem essa âncora as notas dos outros testes entrariam no
   * resultado — a asserção viraria uma corrida contra a ordem de execução.
   */
  describe('GET /clubs/:clubId/notes', () => {
    let mariaDayNoteId: string;
    let mariaFreeNoteId: string;
    let marcosFreeNoteId: string;

    beforeAll(async () => {
      const day = await putDayNote(F_DAY_1, {
        doc: aPlainDoc('anotei o coração do capítulo'),
      });
      expect(day.statusCode).toBe(201);
      mariaDayNoteId = day.json<NoteBody>().id;

      mariaFreeNoteId = (
        await createFreeNote(
          { title: 'Avulsa da Maria', doc: aPlainDoc('sobre o poder') },
          mariaToken,
          FILTER_BOOK_ID,
        )
      ).id;
      marcosFreeNoteId = (
        await createFreeNote(
          { title: 'Avulsa do Marcos', doc: aPlainDoc('sobre o anel') },
          marcosToken,
          FILTER_BOOK_ID,
        )
      ).id;
    });

    async function idsOf(query: string): Promise<string[]> {
      const response = await listNotes(query);
      expect(response.statusCode).toBe(200);
      // Ordena antes de comparar: a ordem NÃO é o assunto destes testes, e
      // depender dela os quebraria por um motivo que não tem a ver com o nome
      // deles. → CONVENCOES-CODIGO §7.2.
      return response
        .json<NoteBody[]>()
        .map((note) => note.id)
        .sort();
    }

    it('filters by bookId', async () => {
      expect(await idsOf(`?bookId=${FILTER_BOOK_ID}`)).toEqual(
        [mariaDayNoteId, mariaFreeNoteId, marcosFreeNoteId].sort(),
      );
    });

    it('filters by authorId', async () => {
      expect(
        await idsOf(`?bookId=${FILTER_BOOK_ID}&authorId=${MARCOS_ID}`),
      ).toEqual([marcosFreeNoteId]);
    });

    it('filters by kind', async () => {
      expect(await idsOf(`?bookId=${FILTER_BOOK_ID}&kind=PLAN`)).toEqual([
        mariaDayNoteId,
      ]);
      expect(await idsOf(`?bookId=${FILTER_BOOK_ID}&kind=FREE`)).toEqual(
        [mariaFreeNoteId, marcosFreeNoteId].sort(),
      );
    });

    it('filters by planItemId', async () => {
      expect(await idsOf(`?planItemId=${F_DAY_1}`)).toEqual([mariaDayNoteId]);
    });

    // A busca é `ILIKE` no `plainText`, e só nele: `title` fica fora.
    it('filters by text, case-insensitively and only in plainText', async () => {
      expect(await idsOf(`?bookId=${FILTER_BOOK_ID}&text=PODER`)).toEqual([
        mariaFreeNoteId,
      ]);
      // 'Avulsa do Marcos' é TÍTULO, não plainText: a busca não o casa.
      expect(await idsOf(`?bookId=${FILTER_BOOK_ID}&text=Avulsa`)).toEqual([]);
    });

    // Acento é significativo (busca sem acento é a Tarefa 29, com `unaccent`).
    it('does not ignore accents', async () => {
      expect(await idsOf(`?bookId=${FILTER_BOOK_ID}&text=coração`)).toEqual([
        mariaDayNoteId,
      ]);
      expect(await idsOf(`?bookId=${FILTER_BOOK_ID}&text=coracao`)).toEqual([]);
    });

    // Os filtros COMBINAM em AND.
    it('combines the filters with AND', async () => {
      expect(
        await idsOf(
          `?bookId=${FILTER_BOOK_ID}&authorId=${MARIA_ID}&kind=FREE&text=poder`,
        ),
      ).toEqual([mariaFreeNoteId]);
    });

    it('answers 400 for a kind that is not PLAN or FREE', async () => {
      const response = await listNotes('?kind=DIA');

      expect(response.statusCode).toBe(400);
    });

    /**
     * ⚠️ O STRIP DA QUERY — as duas propriedades do §6.3 e da decisão de
     * "sem `.strict()` na query", num teste só.
     *
     * 1. **Nada de tenant nem de derivado entra pela query string.** O
     *    `listNotesQuerySchema` é um `z.object` sem `.passthrough()`, e é ELE a
     *    primeira barreira: `clubId`, `actorUserId`, `status` e `plainText`
     *    somem antes de o handler existir. A ordem do spread (o tenant DEPOIS
     *    de `...req.query`) é a segunda; romper as duas ao mesmo tempo é
     *    escalação de privilégio — medido: com só a ordem invertida, esta
     *    requisição continua devolvendo o clube certo, porque as chaves nem
     *    chegaram.
     * 2. **Um `utm_source` colado de um link NÃO derruba a listagem.** É a
     *    razão de a query não ser `.strict()` como os três corpos de escrita
     *    são: numa query string não há campo derivado nem de tenant a defender,
     *    e um 400 aqui quebraria a tela de quem chegou por um link de e-mail.
     *
     * A asserção é "a query envenenada é INDISTINGUÍVEL da limpa" — não uma
     * lista escrita à mão, que continuaria verde se o `bookId` também sumisse.
     */
    it('strips tenant and derived keys from the query, and tolerates an unknown one', async () => {
      const clean = await listNotes(`?bookId=${FILTER_BOOK_ID}`);
      expect(clean.statusCode).toBe(200);

      const poisoned = await listNotes(
        `?bookId=${FILTER_BOOK_ID}` +
          `&clubId=${OTHER_CLUB_ID}` +
          `&actorUserId=${OUTSIDER_ID}` +
          '&status=ARCHIVED' +
          '&plainText=x' +
          '&utm_source=email',
      );

      // O `utm_source` não derruba nada...
      expect(poisoned.statusCode).toBe(200);
      // ...e o resultado é exatamente o da query limpa.
      expect(poisoned.json<NoteBody[]>()).toEqual(clean.json<NoteBody[]>());
      // E o clube é o da ROTA, nunca o da query.
      const notes = poisoned.json<NoteBody[]>();
      expect(notes.length).toBeGreaterThan(0);
      expect(notes.every((note) => note.clubId === CLUB_ID)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regras 34 e 35 — a sobreposição de autoria
  // ───────────────────────────────────────────────────────────────────────────

  describe('the writers overlay', () => {
    /**
     * ⚠️ A SOBREPOSIÇÃO ESPERADA, e a escolha de autor que a torna decidível.
     *
     * O `planItemWritersByBook` do Prisma **não tem `orderBy`** — o port promete
     * "sem ordem" de propósito (o fake enumera invertido, §7.2) — e o Postgres
     * devolve o que sair mais barato: medido, a enumeração desta consulta é por
     * `userId` crescente quando a suíte inteira roda (índice `(bookId, userId)`)
     * e a de inserção quando o arquivo roda sozinho.
     *
     * A versão anterior deste bloco escrevia "fora da ordem do plano" (dia 3,
     * dia 1, dia 1) e ainda assim NÃO acusava o mutante que monta a resposta na
     * ordem dos pares: a autora do dia 1 era a `marcos`, e `marcos < maria`
     * fazia a ordem errada COINCIDIR com a certa. O comentário afirmava uma
     * intenção que a medição desmentia.
     *
     * Agora a autoria é escolhida para que a implementação errada FALHE: quem
     * ordena PRIMEIRO no alfabeto (`marcos`) escreve o ÚLTIMO dia do plano, e
     * quem ordena depois (`maria`) escreve o primeiro. Nas DUAS enumerações
     * possíveis o primeiro par encontrado é do `W_DAY_3`, então uma resposta
     * montada na ordem dos pares sai `[W_DAY_3, W_DAY_1]` — o oposto do
     * esperado, e os dois testes deste bloco acusam.
     *
     * ⚠️ **A ORDENAÇÃO DOS `userIds` NÃO É DECIDÍVEL AQUI, e não há fixture que
     * a torne.** Quando o Postgres enumera pelo índice `(bookId, userId)` os
     * pares já chegam em `userId` crescente, que é exatamente o que o `.sort()`
     * produziria — medido: com o `.sort()` removido, esta suíte acusa quando a
     * enumeração é a de inserção e fica VERDE quando é a do índice, e nada no
     * teste escolhe qual das duas o banco usa. Ordenar um conjunto que já vem
     * ordenado é indistinguível por construção. Quem prova a ordenação são os
     * unitários dedicados (`sorts the userIds of an entry`, no
     * `plan-item-groups.test.ts` — para onde a conta e os 12 testes dela se
     * mudaram na Tarefa 31 — e no `list-plan-item-writers.test.ts`), onde
     * o fake enumera INVERTIDO de propósito (§7.2). Este bloco prova a ordem do
     * PLANO; é essa a regra 34 que ele fecha.
     */
    beforeAll(async () => {
      // A precondição, pinada: um `prefixedId` renomeado que invertesse isto
      // devolveria a coincidência em silêncio.
      expect(MARCOS_ID < MARIA_ID).toBe(true);

      // A primeira nota do livro é a do ÚLTIMO dia do plano — é o que faz a
      // enumeração por inserção montar `[W_DAY_3, W_DAY_1]`, e a por `userId`
      // também (o `marcos` só escreveu no `W_DAY_3`).
      expect(
        (await putDayNote(W_DAY_3, { doc: aPlainDoc('dia 3') })).statusCode,
      ).toBe(201);
      expect(
        (
          await putDayNote(
            W_DAY_3,
            { doc: aPlainDoc('dia 3 do Marcos') },
            marcosToken,
          )
        ).statusCode,
      ).toBe(201);
      expect(
        (await putDayNote(W_DAY_1, { doc: aPlainDoc('dia 1') })).statusCode,
      ).toBe(201);
    });

    // Regra 34 — a ordem é a do PLANO, e os `userIds` são ordenados.
    it('returns the overlay in the plan order', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/books/${WRITERS_BOOK_ID}/writers`,
        headers: auth(mariaToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<WritersBody[]>()).toEqual([
        { planItemId: W_DAY_1, userIds: [MARIA_ID] },
        // O W_DAY_2 não aparece: ninguém escreveu nele.
        { planItemId: W_DAY_3, userIds: [MARCOS_ID, MARIA_ID].sort() },
      ]);
    });

    /**
     * ⚠️ REGRA 35 — o `writers` CHEGA no `GET /books/:bookId`.
     *
     * É a regra que só passa porque o `bookWithPlanResponseSchema` em `shared/`
     * cresceu junto: o serializer do Zod descarta campo não declarado, então um
     * `writers` esquecido lá sairia APAGADO, com 200 e sem erro nenhum.
     * → CONVENCOES-CODIGO §6.1.
     */
    it('carries the same overlay inside GET /books/:bookId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/books/${WRITERS_BOOK_ID}`,
        headers: auth(mariaToken),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        book: { id: string };
        planItems: { id: string }[];
        writers: WritersBody[];
      }>();
      expect(body.writers).toEqual([
        { planItemId: W_DAY_1, userIds: [MARIA_ID] },
        { planItemId: W_DAY_3, userIds: [MARCOS_ID, MARIA_ID].sort() },
      ]);
      // E o resto da resposta continua inteiro.
      expect(body.book.id).toBe(WRITERS_BOOK_ID);
      expect(body.planItems.map((item) => item.id)).toEqual([
        W_DAY_1,
        W_DAY_2,
        W_DAY_3,
      ]);
    });

    // Livro em que ninguém escreveu: `[]`, e o campo EXISTE — a tela não tem de
    // adivinhar entre "vazio" e "o servidor esqueceu".
    it('carries an empty overlay for a book nobody wrote in', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/books/${OTHER_CLUB_BOOK_ID}/writers`,
        headers: auth(outsiderToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<WritersBody[]>()).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 36 — DELETE arquiva e NÃO apaga
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Regra 36 — o soft delete: a nota sai da vista e a LINHA fica, com o
   * conteúdo intacto. Arquivar é tirar da vista, não destruir — o acervo do
   * clube continua íntegro, com autoria.
   */
  describe('DELETE /notes/:noteId', () => {
    it('archives without deleting, and the listing stops showing it', async () => {
      const note = await createFreeNote({
        title: 'Para arquivar',
        doc: aPlainDoc('não serve mais'),
      });
      const before = await listNotes(`?bookId=${BOOK_ID}`);
      expect(before.json<NoteBody[]>().map((n) => n.id)).toContain(note.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/notes/${note.id}`,
        headers: auth(mariaToken),
      });

      // 200 com a nota atualizada — é o que o front usa em vez de refetch.
      expect(response.statusCode).toBe(200);
      const archived = response.json<NoteBody>();
      expect(archived.status).toBe('ARCHIVED');
      expect(archived.archivedAt).not.toBeNull();

      // O GET seguinte não a lista.
      const after = await listNotes(`?bookId=${BOOK_ID}`);
      expect(after.json<NoteBody[]>().map((n) => n.id)).not.toContain(note.id);

      // E a LINHA continua no banco, conferida por consulta — com o conteúdo
      // intacto: arquivar não apaga o que a pessoa escreveu.
      const stored = await prisma.note.findUnique({ where: { id: note.id } });
      expect(stored?.status).toBe('ARCHIVED');
      expect(stored?.archivedAt).not.toBeNull();
      expect(stored?.plainText).toBe('não serve mais');
    });

    // Arquivada é invisível INCLUSIVE para a autora: desarquivar é MVP 4, então
    // até lá arquivada e inexistente dão o mesmo 404.
    it('answers 404 when the author archives the same note twice', async () => {
      const note = await createFreeNote({ title: 'Duas vezes' });
      const first = await app.inject({
        method: 'DELETE',
        url: `/notes/${note.id}`,
        headers: auth(mariaToken),
      });

      const second = await app.inject({
        method: 'DELETE',
        url: `/notes/${note.id}`,
        headers: auth(mariaToken),
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(404);
    });

    it('answers 404 for a note that does not exist', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/notes/${prefixedId('t11r', 'ghost')}`,
        headers: auth(mariaToken),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 37 — nenhuma rota devolve campo que o schema não declara
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Regra 37 — o `response` schema é fronteira de segurança, não decoração
   * (§6.1): o serializer do Zod é quem corta campo não declarado. Aqui a prova
   * é a lista EXATA de chaves — um `toEqual` de conjunto quebra tanto quando
   * sobra campo quanto quando falta.
   *
   * (A guarda de boot que exige `response` para o status de sucesso é provada
   * pelo `server-guards.integration.test.ts`; este arquivo só existe porque o
   * servidor subiu, o que já a exercita.)
   */
  describe('response shape', () => {
    const NOTE_KEYS = [
      'archivedAt',
      'bookId',
      'clubId',
      'createdAt',
      'doc',
      'id',
      'kind',
      'plainText',
      'planItemId',
      'reference',
      'status',
      'title',
      'updatedAt',
      'userId',
    ];

    it('returns exactly the declared keys of a note', async () => {
      const note = await createFreeNote({ title: 'Chaves' });

      expect(Object.keys(note).sort()).toEqual(NOTE_KEYS);
    });

    it('returns exactly the declared keys of a note in the listing', async () => {
      await createFreeNote({ title: 'Chaves na listagem' });

      const response = await listNotes(`?bookId=${BOOK_ID}`);
      const [first] = response.json<NoteBody[]>();

      expect(Object.keys(first ?? {}).sort()).toEqual(NOTE_KEYS);
    });

    it('returns exactly the declared keys of a writers entry', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/books/${WRITERS_BOOK_ID}/writers`,
        headers: auth(mariaToken),
      });
      const [first] = response.json<WritersBody[]>();

      expect(Object.keys(first ?? {}).sort()).toEqual([
        'planItemId',
        'userIds',
      ]);
    });
  });
});
