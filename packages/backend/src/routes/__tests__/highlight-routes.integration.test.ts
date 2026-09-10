import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildServer } from '../../http/server';
import {
  prefixedEmail,
  prefixedId,
  prisma,
  removeFixtures,
} from '../../repositories/__tests__/_db';

const CLUB_ID = prefixedId('t24r', 'club');
const OTHER_CLUB_ID = prefixedId('t24r', 'otherclub');

/** A autora: `MEMBER` sem papel de admin — grifar não exige papel. */
const MARIA_ID = prefixedId('t24r', 'maria');
/** O outro autor, para o 403 de "grifo de outra pessoa". */
const MARCOS_ID = prefixedId('t24r', 'marcos');
/** Tem conta e é OWNER de OUTRO clube: o corte de tenant tem de dar 404. */
const OUTSIDER_ID = prefixedId('t24r', 'outsider');

const BOOK_ID = prefixedId('t24r', 'book');

/**
 * Livro só para os filtros da listagem.
 *
 * A listagem é do CLUBE inteiro, então toda asserção de filtro se ancora neste
 * `bookId` — senão os grifos dos outros testes entrariam no resultado e a
 * asserção viraria uma corrida contra a ordem de execução.
 */
const FILTER_BOOK_ID = prefixedId('t24r', 'fbook');

/**
 * ⚠️ Livro EXCLUSIVO do bloco dos filtros de navegação.
 *
 * Medido nesta fatia: com o bloco ancorado no `FILTER_BOOK_ID` — que outros
 * testes do arquivo também usam —, `filters by authorId` e `filters by colour`
 * ficaram **vermelhos por contaminação**, não por bug. Um teste de filtro
 * precisa de um livro em que só ele escreve, senão a asserção vira uma corrida
 * contra a ordem de execução do arquivo (é o mesmo motivo do `WRITERS_BOOK_ID`
 * no `note-routes`).
 */
const NAV_BOOK_ID = prefixedId('t24r', 'navbook');

/** Livro do clube alheio: o alvo dos 404 de tenant. */
const OTHER_CLUB_BOOK_ID = prefixedId('t24r', 'otherbook');

/**
 * ⚠️ Livro EXCLUSIVO do bloco da BUSCA (Tarefa 29), e pelo mesmo motivo medido
 * do `NAV_BOOK_ID`: a listagem é do CLUBE inteiro, então um bloco de filtro
 * ancorado num livro que outro teste também usa fica vermelho **por
 * contaminação**, não por bug.
 *
 * A tag do id é `t29` — é a fatia que o criou, e é o que deixa achar (e apagar)
 * sobra de uma execução interrompida.
 */
const SEARCH_BOOK_ID = prefixedId('t29', 'hl-searchbook');

const membershipIds: string[] = [];
const userIds: string[] = [MARIA_ID, MARCOS_ID, OUTSIDER_ID];
const bookIds = [
  BOOK_ID,
  FILTER_BOOK_ID,
  NAV_BOOK_ID,
  SEARCH_BOOK_ID,
  OTHER_CLUB_BOOK_ID,
];

interface HighlightBody {
  id: string;
  clubId: string;
  bookId: string;
  userId: string;
  quote: string;
  color: string;
  page: number | null;
  reference: string | null;
  commentDoc: Record<string, unknown> | null;
  commentText: string;
  status: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ErrorBody {
  error: string;
  details?: { path: string; message: string }[];
}

/**
 * O comentário como o TipTap o produz: `content` aninhado, `marks` e um `attrs`
 * que NENHUM schema declara. É o que a regra 15 exige — sem o `.passthrough()`
 * do `noteDocSchema` a resposta sairia `{"commentDoc":{"type":"doc"}}`, com 200
 * e sem erro nenhum.
 *
 * Factory e não `const`: é uma árvore, mutável por dentro (§7.7).
 */
function aRichComment(text = 'lindo'): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: 'left', extensaoFutura: { nivel: 3 } },
        content: [
          { type: 'text', text: 'Achei ', marks: [{ type: 'bold' }] },
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
                content: [{ type: 'text', text: 'reler no fim do mês' }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function aPlainComment(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

async function seedUser(id: string, prefix: string): Promise<void> {
  await prisma.user.upsert({
    where: { id },
    create: { id, email: prefixedEmail('t24r', prefix), name: prefix },
    update: {},
  });
}

async function seedMembership(
  userId: string,
  clubId: string,
  role: 'OWNER' | 'ADMIN' | 'MEMBER',
): Promise<void> {
  const id = prefixedId('t24r', `ms-${role}`);
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

describe('highlight routes', () => {
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
    await seedBook(FILTER_BOOK_ID, CLUB_ID, MARIA_ID, 'As Duas Torres');
    await seedBook(NAV_BOOK_ID, CLUB_ID, MARIA_ID, 'O Retorno do Rei');
    await seedBook(SEARCH_BOOK_ID, CLUB_ID, MARIA_ID, 'O Silmarillion');
    await seedBook(
      OTHER_CLUB_BOOK_ID,
      OTHER_CLUB_ID,
      OUTSIDER_ID,
      'Livro de Outra Gente',
    );

    mariaToken = app.jwt.sign({ sub: MARIA_ID });
    marcosToken = app.jwt.sign({ sub: MARCOS_ID });
    outsiderToken = app.jwt.sign({ sub: OUTSIDER_ID });
  });

  /**
   * A limpeza CONSULTA o banco (o formato do `invite-routes`,
   * CONVENCOES-CODIGO §6.6): os grifos nascem com id gerado pelo servidor, e um
   * teste que falhe no meio deixa grifo para trás. Uma lista alimentada pelas
   * respostas esperadas estouraria na FK do `bookId` (ON DELETE RESTRICT).
   */
  afterAll(async () => {
    const highlights = await prisma.highlight.findMany({
      where: { bookId: { in: bookIds } },
      select: { id: true },
    });
    const memberships = await prisma.membership.findMany({
      where: { clubId: { in: [CLUB_ID, OTHER_CLUB_ID] } },
      select: { id: true },
    });

    await removeFixtures({
      highlightIds: highlights.map((row) => row.id),
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

  async function postHighlight(
    payload: Record<string, unknown>,
    token = mariaToken,
    bookId = BOOK_ID,
  ): Promise<LightMyRequestResponse> {
    return await app.inject({
      method: 'POST',
      url: `/books/${bookId}/highlights`,
      headers: auth(token),
      payload,
    });
  }

  /** Um grifo criado pela própria rota, para os testes que precisam de um. */
  async function createHighlight(
    overrides: Record<string, unknown> = {},
    token = mariaToken,
    bookId = BOOK_ID,
  ): Promise<HighlightBody> {
    const response = await postHighlight(
      {
        quote: 'não é o que você tem, é o que você faz com o que tem',
        color: '#facc15',
        ...overrides,
      },
      token,
      bookId,
    );
    expect(response.statusCode).toBe(201);
    return response.json<HighlightBody>();
  }

  async function patchHighlight(
    highlightId: string,
    payload: Record<string, unknown>,
    token = mariaToken,
  ): Promise<LightMyRequestResponse> {
    return await app.inject({
      method: 'PATCH',
      url: `/highlights/${highlightId}`,
      headers: auth(token),
      payload,
    });
  }

  async function deleteHighlight(
    highlightId: string,
    token = mariaToken,
  ): Promise<LightMyRequestResponse> {
    return await app.inject({
      method: 'DELETE',
      url: `/highlights/${highlightId}`,
      headers: auth(token),
    });
  }

  async function listHighlights(
    query = '',
    token = mariaToken,
    clubId = CLUB_ID,
  ): Promise<LightMyRequestResponse> {
    return await app.inject({
      method: 'GET',
      url: `/clubs/${clubId}/highlights${query}`,
      headers: auth(token),
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 20 — a fiação: as quatro rotas nascem DENTRO do escopo autenticado
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Regra 20 — as QUATRO rotas exigem token. O escopo autenticado é um plugin
   * encapsulado, então isto vale por construção (§6.6) — e o teste existe
   * porque a construção falha em silêncio: um `register` fora do escopo faria as
   * quatro nascerem **públicas**, e nada mais no projeto notaria.
   */
  describe('authentication', () => {
    it.each([
      [
        'POST',
        `/books/${BOOK_ID}/highlights`,
        { quote: 'x', color: '#facc15' },
      ],
      ['PATCH', '/highlights/qualquer', { quote: 'x' }],
      ['DELETE', '/highlights/qualquer', undefined],
      ['GET', `/clubs/${CLUB_ID}/highlights`, undefined],
    ] as const)(
      'answers 401 for %s %s without a token',
      async (method, url, payload) => {
        const response = await app.inject({ method, url, payload });

        expect(response.statusCode).toBe(401);
      },
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 19 — o corte de tenant, nas QUATRO
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ⚠️ REGRA 19 — **404, nunca 403**: não confirmamos a existência de um
   * recurso de um clube que não é da pessoa (ADR 0005). O outsider é OWNER de
   * outro clube, então tem conta e papel — só não neste.
   */
  describe('tenant cut', () => {
    /**
     * ⚠️ **A precondição que impede este bloco de ser uma asserção vazia**
     * (§7.4, a forma que a medição desta fatia encontrou): o Fastify responde
     * **404 para rota inexistente**, então um `expect(404)` aqui passa verde
     * com as quatro rotas nem registradas — e passou: quando este arquivo
     * nasceu, antes de uma linha de rota existir, a rodada foi
     * `43 failed | 6 passed | 13 skipped (62)`, e os 6 verdes eram justamente
     * os 404 sem precondição.
     *
     * Então **cada teste deste bloco pina, ele mesmo, que o ator legítimo é
     * atendido na MESMA rota** — inclusive os de PATCH e DELETE. A versão
     * anterior deste docblock dizia que neles "o pino é o `createHighlight()`,
     * que já asserta 201", e isso era falso: o `createHighlight()` exercita o
     * **POST**, então os dois ficariam verdes com as rotas PATCH e DELETE
     * inexistentes (as asserções de `stored?.quote`/`stored?.status` também
     * passariam, porque nada foi alterado). Um docblock que promete uma guarda
     * inexistente é pior que nenhum: ele faz o próximo leitor não ir procurar.
     */
    it('answers 404 when an outsider creates a highlight in another club book', async () => {
      const response = await postHighlight(
        { quote: 'invadi', color: '#facc15' },
        outsiderToken,
      );

      expect(response.statusCode).toBe(404);
      // A precondição: a MESMA rota atende a Maria, que é do clube do livro.
      expect(
        (await postHighlight({ quote: 'eu posso', color: '#facc15' }))
          .statusCode,
      ).toBe(201);
      // E nada foi escrito pelo outsider: o corte vem antes da escrita.
      expect(
        await prisma.highlight.count({ where: { userId: OUTSIDER_ID } }),
      ).toBe(0);
    });

    it('answers 404 when an outsider patches a highlight of another club', async () => {
      const highlight = await createHighlight();

      const response = await patchHighlight(
        highlight.id,
        { quote: 'sequestrado' },
        outsiderToken,
      );

      expect(response.statusCode).toBe(404);
      // A precondição, e ela é do PATCH: sem esta linha o teste fica verde com
      // a rota PATCH inexistente (o Fastify responde 404 para rota que não
      // existe, e o `stored?.quote` abaixo também passaria).
      expect(
        (await patchHighlight(highlight.id, { quote: 'eu posso' })).statusCode,
      ).toBe(200);
      const stored = await prisma.highlight.findUnique({
        where: { id: highlight.id },
      });
      expect(stored?.quote).toBe('eu posso');
    });

    it('answers 404 when an outsider archives a highlight of another club', async () => {
      const highlight = await createHighlight();

      const response = await deleteHighlight(highlight.id, outsiderToken);

      expect(response.statusCode).toBe(404);
      const stored = await prisma.highlight.findUnique({
        where: { id: highlight.id },
      });
      expect(stored?.status).toBe('ACTIVE');
      // A precondição, e ela é do DELETE: a MESMA rota atende a autora, e é o
      // que separa "o corte de tenant recusou" de "a rota não existe".
      expect((await deleteHighlight(highlight.id)).statusCode).toBe(200);
    });

    it('answers 404 when an outsider lists the highlights of another club', async () => {
      const response = await listHighlights('', outsiderToken);

      expect(response.statusCode).toBe(404);
      // A precondição (→ o docblock do bloco): a MESMA rota atende a Maria.
      expect((await listHighlights('', mariaToken)).statusCode).toBe(200);
    });

    /**
     * O outro lado do corte, que é o que prova que ele é do MEMBERSHIP e não do
     * id: a Maria é membro do clube dela e ainda assim não alcança o livro (nem
     * a listagem) do clube alheio.
     */
    it('answers 404 when a member reaches for a book and a listing of another club', async () => {
      const create = await postHighlight(
        { quote: 'oi', color: '#facc15' },
        mariaToken,
        OTHER_CLUB_BOOK_ID,
      );
      const list = await listHighlights('', mariaToken, OTHER_CLUB_ID);

      expect([create.statusCode, list.statusCode]).toEqual([404, 404]);
      // A precondição: as mesmas duas rotas atendem a Maria no clube DELA.
      expect(
        (await postHighlight({ quote: 'no meu clube', color: '#facc15' }))
          .statusCode,
      ).toBe(201);
      expect((await listHighlights('', mariaToken)).statusCode).toBe(200);
      expect(
        await prisma.highlight.count({
          where: { bookId: OTHER_CLUB_BOOK_ID },
        }),
      ).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 18 — autoria: 403, e só no PATCH e no DELETE
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ⚠️ REGRA 18 — o Marcos é membro ATIVO do clube e **lê** o grifo da Maria na
   * listagem (ADR 0002). Só não mexe nele: 403, não 404 — esconder de quem
   * acabou de ler o grifo na tela ao lado não protegeria nada, e mentiria para o
   * front, que precisa distinguir "não existe" de "não é seu".
   */
  describe('authorship', () => {
    it('answers 403 when a club member patches someone else highlight', async () => {
      const highlight = await createHighlight();

      const response = await patchHighlight(
        highlight.id,
        { quote: 'reescrevi o seu' },
        marcosToken,
      );

      expect(response.statusCode).toBe(403);
      const stored = await prisma.highlight.findUnique({
        where: { id: highlight.id },
      });
      expect(stored?.quote).toBe(highlight.quote);
    });

    it('answers 403 when a club member archives someone else highlight', async () => {
      const highlight = await createHighlight();

      const response = await deleteHighlight(highlight.id, marcosToken);

      expect(response.statusCode).toBe(403);
      const stored = await prisma.highlight.findUnique({
        where: { id: highlight.id },
      });
      expect(stored?.status).toBe('ACTIVE');
    });

    /**
     * ⚠️ REGRA 18, a outra metade: o POST e o GET **não** produzem 403.
     *
     * Grifar não exige papel (`MEMBER` grifa) e ler o acervo do clube não exige
     * autoria — o Marcos LÊ o grifo da Maria. É o ADR 0002 na borda, e é o que
     * faz os dois 403 acima serem sobre AUTORIA e não sobre visibilidade.
     */
    it('lets a club member create a highlight and read the ones of another member', async () => {
      const hers = await createHighlight(
        { quote: 'o trecho dela' },
        mariaToken,
        FILTER_BOOK_ID,
      );

      const his = await postHighlight(
        { quote: 'o trecho dele', color: '#22c55e' },
        marcosToken,
        FILTER_BOOK_ID,
      );
      const list = await listHighlights(
        `?bookId=${FILTER_BOOK_ID}`,
        marcosToken,
      );

      expect(his.statusCode).toBe(201);
      expect(list.statusCode).toBe(200);
      const ids = list.json<HighlightBody[]>().map((row) => row.id);
      expect(ids).toContain(hers.id);
      expect(ids).toContain(his.json<HighlightBody>().id);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 16 — os status, um por um
  // ───────────────────────────────────────────────────────────────────────────

  describe('POST /books/:bookId/highlights', () => {
    /**
     * ⚠️ REGRA 16 — **201**, e o corpo é um grifo de verdade.
     *
     * O serializer do Zod é POR STATUS: com só o 200 declarado no `response`, a
     * rede de segurança do `preSerialization` trocaria o corpo do 201 por um
     * `{error}` genérico — e quebraria TODA criação de grifo, com 201 e sem erro
     * nenhum no log do cliente. → CONVENCOES-CODIGO §6.1.
     */
    it('answers 201 with the highlight the server stored', async () => {
      const response = await postHighlight({
        quote: '  Num buraco no chão vivia um hobbit  ',
        color: '#3b82f6',
        page: 1,
        reference: 'Cap. 1',
        commentDoc: aPlainComment('o começo'),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<HighlightBody>();
      // O trecho vem SEM as pontas: o `.trim()` da borda mais o
      // `normalizeHighlightQuote` do domínio.
      expect(body.quote).toBe('Num buraco no chão vivia um hobbit');
      expect(body.color).toBe('#3b82f6');
      expect(body.page).toBe(1);
      expect(body.reference).toBe('Cap. 1');
      // `commentText` é DERIVADO do `commentDoc` no backend, nunca do input.
      expect(body.commentText).toBe('o começo');
      expect(body.status).toBe('ACTIVE');
      expect(body.archivedAt).toBeNull();
      // Nasce com `createdAt === updatedAt`: nada aconteceu entre o nascimento
      // e a última mudança.
      expect(body.updatedAt).toBe(body.createdAt);
    });

    // O grifo sem comentário e sem página: o caso mais comum, e o que o ADR 0004
    // existe para permitir (grifar sem ter escrito anotação nenhuma).
    it('creates a highlight with no page, no reference and no comment', async () => {
      const body = await createHighlight();

      expect(body.page).toBeNull();
      expect(body.reference).toBeNull();
      expect(body.commentDoc).toBeNull();
      expect(body.commentText).toBe('');
    });

    /**
     * O grifo é **ILIMITADO**: duas chamadas idênticas criam DOIS grifos, com
     * ids diferentes. Não há chave natural, não há upsert, e a tabela não tem
     * `@@unique` nenhum — grifar o mesmo trecho outra vez, com outra cor, é o
     * caso de uso.
     */
    it('creates a second highlight for the very same quote', async () => {
      const first = await createHighlight(
        { quote: 'a mesma frase' },
        mariaToken,
        FILTER_BOOK_ID,
      );
      const second = await createHighlight(
        { quote: 'a mesma frase', color: '#ec4899' },
        mariaToken,
        FILTER_BOOK_ID,
      );

      expect(second.id).not.toBe(first.id);
      expect(
        await prisma.highlight.count({
          where: { bookId: FILTER_BOOK_ID, quote: 'a mesma frase' },
        }),
      ).toBe(2);
    });

    it('answers 404 for a book that does not exist', async () => {
      const response = await postHighlight(
        { quote: 'oi', color: '#facc15' },
        mariaToken,
        prefixedId('t24r', 'ghostbook'),
      );

      expect(response.statusCode).toBe(404);
      // A precondição: rota inexistente também responde 404, então sem esta
      // linha o teste não distingue "livro não existe" de "rota não existe".
      expect(
        (await postHighlight({ quote: 'este livro existe', color: '#facc15' }))
          .statusCode,
      ).toBe(201);
    });

    // Regra 16 — o 400 da borda, COM `details` apontando o campo. É o que a
    // tela precisa para marcar o erro no lugar certo.
    it.each([
      ['an empty quote', { quote: '   ', color: '#facc15' }, 'quote'],
      ['no quote at all', { color: '#facc15' }, 'quote'],
      [
        'a colour outside the palette',
        { quote: 'x', color: '#000000' },
        'color',
      ],
      [
        'the rgba form of the editor',
        { quote: 'x', color: 'rgba(250, 204, 21, 0.40)' },
        'color',
      ],
      ['the same hex in upper case', { quote: 'x', color: '#FACC15' }, 'color'],
      [
        'a fractional page',
        { quote: 'x', color: '#facc15', page: 45.5 },
        'page',
      ],
      ['a page of zero', { quote: 'x', color: '#facc15', page: 0 }, 'page'],
      [
        'a page past the int32 ceiling',
        { quote: 'x', color: '#facc15', page: 2147483648 },
        'page',
      ],
      [
        'a page that arrives as a string',
        { quote: 'x', color: '#facc15', page: '45' },
        'page',
      ],
      [
        'a commentDoc that is not a doc',
        { quote: 'x', color: '#facc15', commentDoc: { type: 'paragraph' } },
        'commentDoc.type',
      ],
    ] as const)(
      'answers 400 with details for %s',
      async (_label, payload, path) => {
        const response = await postHighlight(payload);

        expect(response.statusCode).toBe(400);
        expect(
          response.json<ErrorBody>().details?.map((d) => d.path),
        ).toContain(path);
      },
    );
  });

  describe('PATCH /highlights/:highlightId', () => {
    // Regra 16 — **200**, com a linha que o servidor gravou.
    it('answers 200 and corrects the fields the patch carries', async () => {
      const highlight = await createHighlight({
        page: 45,
        reference: 'Cap. 1',
        commentDoc: aPlainComment('primeiro'),
      });

      const response = await patchHighlight(highlight.id, {
        quote: 'corrigi o trecho',
        color: '#f97316',
        page: 62,
        commentDoc: aPlainComment('reescrevi'),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HighlightBody>();
      expect(body.quote).toBe('corrigi o trecho');
      expect(body.color).toBe('#f97316');
      expect(body.page).toBe(62);
      expect(body.commentText).toBe('reescrevi');
      // O que o patch NÃO carregou ficou como estava...
      expect(body.reference).toBe('Cap. 1');
      // ...e o `updatedAt` ANDOU (o `createdAt`, não). → ADR 0008.
      expect(body.createdAt).toBe(highlight.createdAt);
      expect(new Date(body.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(highlight.updatedAt).getTime(),
      );
    });

    /**
     * ⚠️ REGRA 14 na borda: **ausente ≠ `null`**, e o `null` explícito LIMPA.
     *
     * Um `.default()` no schema colapsaria os dois casos, e limpar o campo
     * deixaria de ser possível pela API.
     */
    it('clears page, reference and comment when the patch says null', async () => {
      const highlight = await createHighlight({
        page: 45,
        reference: 'Cap. 1',
        commentDoc: aPlainComment('tinha comentário'),
      });
      expect(highlight.commentText).toBe('tinha comentário');

      const response = await patchHighlight(highlight.id, {
        page: null,
        reference: null,
        commentDoc: null,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HighlightBody>();
      expect(body.page).toBeNull();
      expect(body.reference).toBeNull();
      expect(body.commentDoc).toBeNull();
      // Limpar o `commentDoc` ZERA o `commentText`: é o `commentText` que a
      // busca da Tarefa 29 vai casar, e ele não pode sobreviver ao comentário.
      expect(body.commentText).toBe('');
      // E a LINHA, não só o que voltou.
      const stored = await prisma.highlight.findUnique({
        where: { id: highlight.id },
      });
      expect(stored?.commentDoc).toBeNull();
      expect(stored?.commentText).toBe('');
    });

    // Patch vazio é o retry de uma fila offline que já coalesceu tudo: devolve o
    // grifo como está, e não custa um `UPDATE` (nem move o `updatedAt`).
    it('answers 200 for an empty patch without touching the row', async () => {
      const highlight = await createHighlight();

      const response = await patchHighlight(highlight.id, {});

      expect(response.statusCode).toBe(200);
      expect(response.json<HighlightBody>().updatedAt).toBe(
        highlight.updatedAt,
      );
    });

    it('answers 404 for a highlight that does not exist', async () => {
      const response = await patchHighlight(prefixedId('t24r', 'ghost'), {
        quote: 'x',
      });

      expect(response.statusCode).toBe(404);
      // A precondição: a MESMA rota, com um id que existe, responde 200.
      const real = await createHighlight({ quote: 'este existe' });
      expect((await patchHighlight(real.id, { quote: 'x' })).statusCode).toBe(
        200,
      );
    });

    it('answers 400 with details for a colour outside the palette', async () => {
      const highlight = await createHighlight();

      const response = await patchHighlight(highlight.id, { color: '#000000' });

      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorBody>().details?.map((d) => d.path)).toContain(
        'color',
      );
    });
  });

  describe('DELETE /highlights/:highlightId', () => {
    /**
     * Regra 16 / decisão C — **200 com a linha**, não 204: é soft delete, e o
     * front quer o `status`/`archivedAt` que o SERVIDOR gravou, sem refetch. É o
     * precedente exato do `DELETE /notes/:noteId` e do `/books/:bookId`.
     *
     * E arquivar **não apaga conteúdo**: a linha fica, com o trecho, a cor, a
     * página e o comentário intactos — o acervo do clube continua íntegro, com
     * autoria (ADR 0002). A prova é por snapshot antes/depois (§7.6), não por
     * um campo escolhido à mão.
     */
    it('archives without deleting, and the listing stops showing it', async () => {
      const highlight = await createHighlight({
        page: 45,
        reference: 'Cap. 1',
        commentDoc: aRichComment('para arquivar'),
      });
      const before = await listHighlights(`?bookId=${BOOK_ID}`);
      expect(before.json<HighlightBody[]>().map((row) => row.id)).toContain(
        highlight.id,
      );

      const response = await deleteHighlight(highlight.id);

      expect(response.statusCode).toBe(200);
      const archived = response.json<HighlightBody>();
      expect(archived.status).toBe('ARCHIVED');
      expect(archived.archivedAt).not.toBeNull();
      // Nada de conteúdo mudou: só `status`, `archivedAt` e `updatedAt`.
      expect(archived).toEqual({
        ...highlight,
        status: 'ARCHIVED',
        archivedAt: archived.archivedAt,
        updatedAt: archived.updatedAt,
      });

      // O GET seguinte não o lista.
      const after = await listHighlights(`?bookId=${BOOK_ID}`);
      expect(after.json<HighlightBody[]>().map((row) => row.id)).not.toContain(
        highlight.id,
      );

      // E a LINHA continua no banco, com o comentário intacto.
      const stored = await prisma.highlight.findUnique({
        where: { id: highlight.id },
      });
      expect(stored?.status).toBe('ARCHIVED');
      expect(stored?.commentText).toContain('para arquivar');
    });

    // Arquivado é invisível INCLUSIVE para o autor: desarquivar é MVP 4, então
    // até lá arquivado e inexistente dão o mesmo 404.
    it('answers 404 when the author archives the same highlight twice', async () => {
      const highlight = await createHighlight();
      const first = await deleteHighlight(highlight.id);

      const second = await deleteHighlight(highlight.id);

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(404);
    });

    // ...e o PATCH de um arquivado é o mesmo 404, pelo mesmo guard.
    it('answers 404 when the author patches an archived highlight', async () => {
      const highlight = await createHighlight();
      // A precondição: ANTES de arquivar, o PATCH desta mesma linha responde
      // 200 — é o que faz o 404 abaixo ser sobre o `status`, e não sobre a rota
      // (nem sobre o id).
      expect(
        (await patchHighlight(highlight.id, { quote: 'ainda dá' })).statusCode,
      ).toBe(200);
      expect((await deleteHighlight(highlight.id)).statusCode).toBe(200);

      const response = await patchHighlight(highlight.id, { quote: 'x' });

      expect(response.statusCode).toBe(404);
    });

    it('answers 404 for a highlight that does not exist', async () => {
      const response = await deleteHighlight(prefixedId('t24r', 'ghost'));

      expect(response.statusCode).toBe(404);
      // A precondição: a MESMA rota, com um id que existe, responde 200.
      const real = await createHighlight({ quote: 'este existe' });
      expect((await deleteHighlight(real.id)).statusCode).toBe(200);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 17 — o `bodyLimit` por rota, e o 413 declarado
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ⚠️ REGRA 17 — as DUAS rotas de escrita, não uma.
   *
   * O `bodyLimit` POR ROTA é real, não um comentário: o limite global foi
   * elevado na Tarefa 14 para o editor aceitar imagem colada, e sem este teto
   * isso elevaria junto o corpo do grifo — que não carrega imagem (o ADR 0001
   * proíbe `data:`/`blob:` no doc). A auditoria da Tarefa 11 mediu que dois dos
   * três `413: errorSchema` de nota eram **ficção não verificada**: sem o teste,
   * um `bodyLimit` que alguém "limpe" não tem acusador.
   *
   * O `PATCH` mira um id que não existe de propósito: o `bodyLimit` é decidido
   * ANTES do handler, então o 413 não depende de haver grifo — e sem o limite a
   * resposta seria 404, que é o vermelho que acusa.
   */
  describe('the per-route body limit', () => {
    const tooBig = (): Record<string, unknown> =>
      aPlainComment('x'.repeat(300 * 1024));

    it.each([
      [
        'POST',
        () => `/books/${BOOK_ID}/highlights`,
        () => ({
          quote: 'grande demais',
          color: '#facc15',
          commentDoc: tooBig(),
        }),
      ],
      [
        'PATCH',
        () => `/highlights/${prefixedId('t24r', 'ghost')}`,
        () => ({ commentDoc: tooBig() }),
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
  // Regra 15 — o `commentDoc` volta IDÊNTICO ao que entrou
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ⚠️ REGRA 15 — losslessness na BORDA, provada por snapshot antes/depois e
   * nunca por um `toBe` de campo escolhido à mão (§7.6).
   *
   * Sem o `.passthrough()` do `noteDocSchema` — nos dois sentidos — a resposta
   * sairia `{"commentDoc":{"type":"doc"}}` com **200 e sem erro nenhum**: o
   * `content` todo, as `marks` e os `attrs` de cada extensão, apagados.
   *
   * ⚠️ Comparação por IGUALDADE PROFUNDA e não por `JSON.stringify`: a coluna é
   * `Json`, que o Prisma mapeia para **`jsonb`**, e o `jsonb` NORMALIZA a ordem
   * das chaves de cada objeto — `{type,text}` volta como `{text,type}`. É
   * reordenação, não perda.
   */
  describe('comment losslessness at the border', () => {
    it('returns the whole tree the highlight went in with', async () => {
      const sent = aRichComment('pesado');

      const response = await postHighlight({
        quote: 'árvore',
        color: '#facc15',
        commentDoc: sent,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json<HighlightBody>().commentDoc).toEqual(sent);
    });

    // E sobrevive ao ROUND-TRIP pelo Postgres, não só ao serializer: a leitura
    // seguinte devolve a mesma árvore.
    it('returns the whole tree again on the next read', async () => {
      const sent = aRichComment('relido');
      const highlight = await createHighlight(
        { quote: 'round-trip', commentDoc: sent },
        mariaToken,
        FILTER_BOOK_ID,
      );

      const response = await listHighlights(`?bookId=${FILTER_BOOK_ID}`);

      const found = response
        .json<HighlightBody[]>()
        .find((candidate) => candidate.id === highlight.id);
      expect(found?.commentDoc).toEqual(sent);
    });

    /**
     * A prova de que o `.passthrough()` é o que faz a diferença, e não a sorte:
     * a árvore recebida tem MAIS que a raiz. Sem ele o `commentDoc` seria
     * exatamente `{ type: 'doc' }`, e o `toEqual` acima ainda passaria num doc
     * que só tivesse a raiz.
     */
    it('keeps the nested marks and the attrs no schema declares', async () => {
      const response = await postHighlight({
        quote: 'marks e attrs',
        color: '#facc15',
        commentDoc: aRichComment('sublinhado'),
      });

      const serialized = JSON.stringify(
        response.json<HighlightBody>().commentDoc,
      );
      expect(serialized).toContain('"highlight"');
      expect(serialized).toContain('"yellow"');
      expect(serialized).toContain('"extensaoFutura"');
      expect(serialized).toContain('"horizontalRule"');
      expect(serialized).toContain('"bulletList"');
    });

    // O `commentText` é DERIVADO da árvore inteira, no backend, e é o que prova
    // que o servidor recebeu a árvore e não só a raiz.
    it('derives commentText from the whole tree', async () => {
      const response = await postHighlight({
        quote: 'derivado',
        color: '#facc15',
        commentDoc: aRichComment('pesado'),
      });

      const body = response.json<HighlightBody>();
      expect(body.commentText).toContain('Achei');
      expect(body.commentText).toContain('pesado');
      expect(body.commentText).toContain('reler no fim do mês');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 13 — o que o input recusa, e o contrabando (regra 19)
  // ───────────────────────────────────────────────────────────────────────────

  describe('input hardening', () => {
    /**
     * Regra 13 — `commentText` **sai** na resposta (é derivado e é o que a busca
     * casa) e **não entra**: quem manda o campo derivado está enganado sobre
     * quem manda nele, e um 400 diz isso; o strip silencioso o deixaria achar
     * que funcionou. → ADR 0001.
     */
    it('answers 400 when the body carries commentText', async () => {
      const highlight = await createHighlight();
      const post = await postHighlight({
        quote: 'x',
        color: '#facc15',
        commentText: 'mentira',
      });
      const patch = await patchHighlight(highlight.id, {
        commentText: 'mentira',
      });

      expect([post.statusCode, patch.statusCode]).toEqual([400, 400]);
      expect(
        await prisma.highlight.count({ where: { commentText: 'mentira' } }),
      ).toBe(0);
    });

    /**
     * ⚠️ REGRA 19 — contrabando de autoria/tenant, testado com o **ator
     * legítimo** e assertando **a linha gravada**. Testá-lo com um ator de fora
     * não provaria nada sobre o campo: a requisição morreria no guard de tenant,
     * e morreria igual se o contrabando funcionasse. → §7.5.
     *
     * E o mutante perigoso não é `input.userId` cru: é
     * `input.userId ?? req.user.sub`, o envenenamento com fallback, que se
     * comporta normalmente em todo teste que NÃO manda o campo.
     */
    it('never lets a userId in the body change who wrote the highlight', async () => {
      const response = await postHighlight({
        quote: 'autoria',
        color: '#facc15',
        userId: MARCOS_ID,
      });

      // A chave proibida é 400 pelo `.strict()`, e nada é escrito — mais forte
      // que "foi ignorada".
      expect(response.statusCode).toBe(400);
      expect(
        await prisma.highlight.count({
          where: { userId: MARCOS_ID, quote: 'autoria' },
        }),
      ).toBe(0);
    });

    /**
     * ⚠️ REGRA 19 — o campo com o NOME que o UseCase usa, que é o único que
     * teria como sobrescrever o ator.
     *
     * O `userId` do teste acima não serve para isto: o `CreateHighlightInput`
     * não declara `userId`, então essa chave nunca alcançaria a linha nem sem
     * `.strict()`. `actorUserId`, sim — é o nome que o UseCase lê.
     *
     * ⚠️ **E o que este teste prova é o 400, não "a ordem do spread segura".**
     * A frase anterior aqui dizia que `.strict()` removido + spread invertido
     * daria escalação de privilégio, e é **falso** — medido direto no Zod na
     * rodada de correção:
     *
     * ```
     * z.object({...}).parse({ …, actorUserId:'marcos' }) → {…}        (STRIP)
     *   .strict()      → success: false
     *   .passthrough() → {…, actorUserId:'marcos'}
     * ```
     *
     * `req.body` é a **saída** do parse, então um `z.object` sem `.strict()` já
     * faz strip e a chave não chega ao handler: com o spread invertido o ator
     * continua sendo o do JWT (verificado). A combinação perigosa é
     * **`.passthrough()` (ou declarar o campo) + spread invertido** — não "tirar
     * o `.strict()`". O valor real do `.strict()` é outro, e é o que este teste
     * asserta: **400 em vez de strip silencioso**, que diz ao cliente que ele
     * está enganado sobre quem manda no campo. A ordem do spread continua sendo
     * a certa (é grátis, e passa a valer no dia em que alguém puser
     * `.passthrough()` num corpo), só não é a barreira. → §6.3.
     */
    it('never lets an actorUserId in the body change who wrote the highlight', async () => {
      const response = await postHighlight({
        quote: 'ator do corpo',
        color: '#facc15',
        actorUserId: MARCOS_ID,
      });

      expect(response.statusCode).toBe(400);
      expect(
        await prisma.highlight.count({ where: { quote: 'ator do corpo' } }),
      ).toBe(0);
    });

    it('never lets a clubId in the body move the highlight to another club', async () => {
      const response = await postHighlight({
        quote: 'tenant',
        color: '#facc15',
        clubId: OTHER_CLUB_ID,
      });

      expect(response.statusCode).toBe(400);
      expect(
        await prisma.highlight.count({ where: { clubId: OTHER_CLUB_ID } }),
      ).toBe(0);
    });

    it('never lets a status in the body archive the highlight on creation', async () => {
      const response = await postHighlight({
        quote: 'arquivado de nascença',
        color: '#facc15',
        status: 'ARCHIVED',
      });

      expect(response.statusCode).toBe(400);
      expect(
        await prisma.highlight.count({
          where: { quote: 'arquivado de nascença' },
        }),
      ).toBe(0);
    });

    /**
     * ⚠️ REGRA 19, e o caminho FELIZ do mesmo par de campos: sem nada no corpo,
     * o `clubId` e o `userId` gravados são os do LIVRO e do JWT. É o que
     * distingue "a chave foi recusada" de "o servidor sabe de onde tira esses
     * valores" — e é a asserção que o envenenamento com fallback quebraria.
     */
    it('takes clubId from the book and userId from the JWT', async () => {
      const highlight = await createHighlight({ quote: 'de onde vem' });

      expect(highlight.clubId).toBe(CLUB_ID);
      expect(highlight.userId).toBe(MARIA_ID);
      const stored = await prisma.highlight.findUnique({
        where: { id: highlight.id },
      });
      expect(stored?.clubId).toBe(CLUB_ID);
      expect(stored?.userId).toBe(MARIA_ID);
      expect(stored?.bookId).toBe(BOOK_ID);
    });

    // O `bookId` vem da ROTA, e um `bookId` no corpo é 400 — é o que mantém o
    // corte de tenant num campo que o cliente NÃO manda (decisão B).
    it('never lets a bookId in the body choose the book', async () => {
      const response = await postHighlight({
        quote: 'livro alheio',
        color: '#facc15',
        bookId: OTHER_CLUB_BOOK_ID,
      });

      expect(response.statusCode).toBe(400);
      expect(
        await prisma.highlight.count({
          where: { bookId: OTHER_CLUB_BOOK_ID },
        }),
      ).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 20 — o `listHighlights` fiado na rota, com os quatro filtros
  // ───────────────────────────────────────────────────────────────────────────

  describe('GET /clubs/:clubId/highlights', () => {
    let mariaYellow: string;
    let mariaGreen: string;
    let marcosYellow: string;

    beforeAll(async () => {
      mariaYellow = (
        await createHighlight(
          { quote: 'o amarelo da Maria', color: '#facc15', page: 10 },
          mariaToken,
          NAV_BOOK_ID,
        )
      ).id;
      mariaGreen = (
        await createHighlight(
          { quote: 'o verde da Maria', color: '#22c55e' },
          mariaToken,
          NAV_BOOK_ID,
        )
      ).id;
      marcosYellow = (
        await createHighlight(
          { quote: 'o amarelo do Marcos', color: '#facc15', page: 10 },
          marcosToken,
          NAV_BOOK_ID,
        )
      ).id;
    });

    /**
     * Ordena antes de comparar: a ordem NÃO é o assunto destes testes, e
     * depender dela os quebraria por um motivo que não tem a ver com o nome
     * deles. → CONVENCOES-CODIGO §7.2. A ordem tem teste dedicado, abaixo.
     */
    async function idsOf(query: string): Promise<string[]> {
      const response = await listHighlights(query);
      expect(response.statusCode).toBe(200);
      return response
        .json<HighlightBody[]>()
        .map((row) => row.id)
        .sort();
    }

    it('filters by bookId', async () => {
      const filtered = (await listHighlights(`?bookId=${NAV_BOOK_ID}`)).json<
        HighlightBody[]
      >();

      expect(filtered.map((row) => row.id).sort()).toEqual(
        expect.arrayContaining([mariaYellow, mariaGreen, marcosYellow]),
      );
      // Só grifos DESTE livro voltam...
      expect(filtered.every((row) => row.bookId === NAV_BOOK_ID)).toBe(true);
      // ...e a precondição que dá dente à asserção acima: sem o filtro, a
      // listagem do clube carrega grifos de OUTROS livros. Sem ela um `bookId`
      // ignorado passaria nas duas linhas anteriores.
      const unfiltered = (await listHighlights('')).json<HighlightBody[]>();
      expect(unfiltered.some((row) => row.bookId !== NAV_BOOK_ID)).toBe(true);
    });

    it('filters by authorId — navigation, never permission', async () => {
      expect(
        await idsOf(`?bookId=${NAV_BOOK_ID}&authorId=${MARCOS_ID}`),
      ).toEqual([marcosYellow]);
    });

    /**
     * ⚠️ O filtro por cor, e a armadilha da URL: `#` é o delimitador de
     * FRAGMENTO, então a cor tem de ir percent-encoded (`%23facc15`). Uma tela
     * que montasse `?color=#facc15` mandaria `color=` vazio — 400 pelo
     * `z.enum` — e o filtro nunca funcionaria.
     */
    it('filters by colour, percent-encoded', async () => {
      expect(
        (await idsOf(`?bookId=${NAV_BOOK_ID}&color=%23facc15`)).sort(),
      ).toEqual([mariaYellow, marcosYellow].sort());
      expect(await idsOf(`?bookId=${NAV_BOOK_ID}&color=%2322c55e`)).toEqual([
        mariaGreen,
      ]);
    });

    // ⚠️ A query string é TEXTO, e o `z.coerce` é o que faz `?page=10` chegar
    // como número — sem ele esta URL seria 400.
    it('filters by page, coercing the text of the query string', async () => {
      expect((await idsOf(`?bookId=${NAV_BOOK_ID}&page=10`)).sort()).toEqual(
        [mariaYellow, marcosYellow].sort(),
      );
    });

    // ⚠️ REGRA 12 — o `coerce` não afrouxa a coluna, e os dois valores abaixo
    // erram por motivos DIFERENTES (medido na rodada de correção): fora do
    // int32 o Prisma **lança** `ConversionError` (seria 500); a fração ele
    // **trunca**, e `?page=45.5` responderia **200 com os grifos da página 45**.
    // O `.int()` e o `.max()` da borda transformam os dois em 400.
    it.each([
      ['a fraction', '45.5'],
      ['zero', '0'],
      ['a word', 'quarenta'],
      ['past the int32 ceiling', '2147483648'],
    ])('answers 400 for a page that is %s', async (_label, value) => {
      const response = await listHighlights(`?page=${value}`);

      expect(response.statusCode).toBe(400);
      expect(response.json<ErrorBody>().details?.map((d) => d.path)).toContain(
        'page',
      );
    });

    it('answers 400 for a colour outside the palette', async () => {
      const response = await listHighlights('?color=%23000000');

      expect(response.statusCode).toBe(400);
    });

    it('combines the filters with AND', async () => {
      expect(
        await idsOf(
          `?bookId=${NAV_BOOK_ID}&authorId=${MARIA_ID}&color=%23facc15&page=10`,
        ),
      ).toEqual([mariaYellow]);
    });

    // A ordem é do `listHighlights`: mais recente primeiro. Aqui é assunto, e é
    // o único teste deste bloco que depende dela.
    it('returns the newest first', async () => {
      const response = await listHighlights(`?bookId=${NAV_BOOK_ID}`);

      const ids = response.json<HighlightBody[]>().map((row) => row.id);
      // Os três nasceram nesta ordem, então a listagem os devolve ao contrário.
      expect(ids.indexOf(marcosYellow)).toBeLessThan(ids.indexOf(mariaGreen));
      expect(ids.indexOf(mariaGreen)).toBeLessThan(ids.indexOf(mariaYellow));
    });

    /**
     * ⚠️ O STRIP DA QUERY — as duas propriedades do §6.3 e da decisão de "sem
     * `.strict()` na query", num teste só.
     *
     * 1. **Nada de tenant nem de derivado entra pela query string.** O
     *    `listHighlightsQuerySchema` é um `z.object` sem `.passthrough()`, e é
     *    ELE a primeira barreira: `clubId`, `actorUserId`, `status` e
     *    `commentText` somem antes de o handler existir. A ordem do spread (o
     *    tenant DEPOIS de `...req.query`) é a segunda.
     * 2. **Um `utm_source` colado de um link NÃO derruba a listagem.**
     *
     * A asserção é "a query envenenada é INDISTINGUÍVEL da limpa" — não uma
     * lista escrita à mão, que continuaria verde se o `bookId` também sumisse.
     */
    it('strips tenant and derived keys from the query, and tolerates an unknown one', async () => {
      const clean = await listHighlights(`?bookId=${NAV_BOOK_ID}`);
      expect(clean.statusCode).toBe(200);

      const poisoned = await listHighlights(
        `?bookId=${NAV_BOOK_ID}` +
          `&clubId=${OTHER_CLUB_ID}` +
          `&actorUserId=${OUTSIDER_ID}` +
          '&status=ARCHIVED' +
          '&commentText=x' +
          '&utm_source=email',
      );

      expect(poisoned.statusCode).toBe(200);
      expect(poisoned.json<HighlightBody[]>()).toEqual(
        clean.json<HighlightBody[]>(),
      );
      const rows = poisoned.json<HighlightBody[]>();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.clubId === CLUB_ID)).toBe(true);
    });

    // Arquivado é invisível: não há flag para pedi-lo (MVP 4).
    it('never lists an archived highlight', async () => {
      const doomed = await createHighlight(
        { quote: 'vai sumir da lista' },
        mariaToken,
        NAV_BOOK_ID,
      );
      expect((await deleteHighlight(doomed.id)).statusCode).toBe(200);

      expect(await idsOf(`?bookId=${NAV_BOOK_ID}`)).not.toContain(doomed.id);
    });
  });

  /**
   * ⚠️ **A BUSCA POR TEXTO PONTA A PONTA (Tarefa 29, regra 6) — e ela é a
   * CHAMADORA que faltava.**
   *
   * O `?text=` atravessa borda → UseCase → repositório → Postgres, e o que só
   * aqui é observável é o **encadeamento**: um `text` que o
   * `listHighlightsQuerySchema` não declarasse seria **stripado em silêncio**
   * pelo `z.object` (§6.3) e a listagem responderia 200 com o acervo inteiro —
   * verde no unitário, verde no contrato, e a busca "funcionando" sem buscar.
   *
   * ⚠️ Livro EXCLUSIVO (`SEARCH_BOOK_ID`): a listagem é do clube inteiro, e o
   * `NAV_BOOK_ID` já tem grifos de outro bloco. Ancorar aqui seria uma corrida
   * contra a ordem de execução — a contaminação que esta fatia da 24 mediu.
   */
  describe('the text search (task 29, rule 6)', () => {
    let inQuote: string;
    let inComment: string;
    let inNeither: string;
    let accented: string;
    let withPercent: string;

    beforeAll(async () => {
      inQuote = (
        await createHighlight(
          { quote: 'a esmeralda de Feanor' },
          mariaToken,
          SEARCH_BOOK_ID,
        )
      ).id;
      inComment = (
        await createHighlight(
          {
            quote: 'as duas arvores',
            // O comentário é `commentDoc`, e o `commentText` que o `ILIKE`
            // compara é DERIVADO dele no backend (ADR 0001) — o teste manda o
            // documento, nunca o texto. É por isso que este caso prova a
            // decisão A de ponta a ponta: nada aqui escreve `commentText`.
            commentDoc: aPlainComment('me lembrou a esmeralda dela'),
          },
          marcosToken,
          SEARCH_BOOK_ID,
        )
      ).id;
      inNeither = (
        await createHighlight(
          { quote: 'o silmaril perdido', reference: 'Cap. esmeralda' },
          mariaToken,
          SEARCH_BOOK_ID,
        )
      ).id;
      accented = (
        await createHighlight(
          { quote: 'Chorei no coração do livro' },
          mariaToken,
          SEARCH_BOOK_ID,
        )
      ).id;
      withPercent = (
        await createHighlight(
          { quote: '100% garantido pelo Valar' },
          mariaToken,
          SEARCH_BOOK_ID,
        )
      ).id;
    });

    /**
     * Ordena antes de comparar: a ordem NÃO é o assunto deste bloco (ela tem
     * teste dedicado no bloco da listagem), e depender dela quebraria estes
     * testes por um motivo que não tem a ver com o nome deles. → §7.2.
     */
    async function idsOfSearch(
      query: string,
      token = mariaToken,
      clubId = CLUB_ID,
    ): Promise<string[]> {
      const response = await listHighlights(query, token, clubId);
      expect(response.statusCode).toBe(200);
      return response
        .json<HighlightBody[]>()
        .map((row) => row.id)
        .sort();
    }

    async function searchIds(text: string): Promise<string[]> {
      return await idsOfSearch(
        `?bookId=${SEARCH_BOOK_ID}&text=${encodeURIComponent(text)}`,
      );
    }

    /**
     * ⚠️ **DECISÃO A ponta a ponta: casa o `quote` OU o `commentText`**, e a
     * `reference` fica **fora** — o grifo `inNeither` tem o termo justamente na
     * `reference`, de propósito. Uma busca que casasse metadado devolveria o
     * clube inteiro para "capítulo".
     */
    it('matches the quote or the commentText, never the reference', async () => {
      expect(await searchIds('esmeralda')).toEqual([inQuote, inComment].sort());
      // A precondição que dá dente à asserção: os cinco estão na listagem sem
      // o filtro.
      expect(await idsOfSearch(`?bookId=${SEARCH_BOOK_ID}`)).toEqual(
        [inQuote, inComment, inNeither, accented, withPercent].sort(),
      );
    });

    // Case-insensitive de ponta a ponta: a caixa da query não importa.
    it.each(['ESMERALDA', 'EsMeRaLdA'])(
      'matches case-insensitively when the query is %s',
      async (text) => {
        expect(await searchIds(text)).toEqual([inQuote, inComment].sort());
      },
    );

    /**
     * ⚠️ **REGRA 3 NA BORDA: `?text=coracao` devolve VAZIO para `'coração'`.**
     *
     * `ILIKE` é accent-**SENSITIVE**, e isto é **decisão fechada** — a decisão
     * do MVP 2 diz `ILIKE`, e o irmão deste teste no lado da nota está verde
     * desde a **Tarefa 11**. Não conserte: o conserto é a extensão `unaccent` +
     * índice funcional + ADR, é **fatia própria**, e está **registrado como
     * pergunta do dono** na spec da Tarefa 29.
     *
     * A precondição está junto: COM o acento, o grifo é achado — senão um
     * `text` stripado pela borda daria "vazio" nas duas metades e o teste
     * passaria provando nada.
     */
    it('is accent-sensitive: coracao finds nothing, coração finds the highlight', async () => {
      await expect(searchIds('coracao')).resolves.toEqual([]);
      expect(await searchIds('coração')).toEqual([accented]);
    });

    /**
     * ⚠️ **`?text=` VAZIO É 200 COM O ACERVO, não 400.**
     *
     * É a URL que um campo de busca esvaziado monta com naturalidade, e é o
     * `z.string()` **sem `.min(1)`** da borda mais o `optionalText` do UseCase
     * que a fazem devolver a lista. Um `.min(1)` copiado do `bookId` ao lado
     * seria 400 numa tela que funcionava.
     */
    it.each([
      ['empty', ''],
      ['blank', '   '],
      ['a tab', '\t'],
    ])(
      'answers 200 with the whole collection for a %s text',
      async (_label, text) => {
        expect(await searchIds(text)).toEqual(
          [inQuote, inComment, inNeither, accented, withPercent].sort(),
        );
      },
    );

    // O `trim` é do UseCase, e é ponta a ponta que se vê: `' esmeralda '` não
    // acharia nada num `ILIKE '% esmeralda %'`.
    it('trims the text of the query string', async () => {
      expect(await searchIds('  esmeralda  ')).toEqual(
        [inQuote, inComment].sort(),
      );
    });

    /**
     * ⚠️ **REGRA 5 NA BORDA: `%` é literal**, e quem o escapa é o
     * `toLikePattern` de `repositories/like-pattern.ts` — **uma** função para os
     * dois repositórios (decisão B).
     *
     * Sem o escape, `?text=100%25` (o `%` percent-encoded) casaria `100` e
     * traria o acervo. Com ele, casa só quem tem `100%` de verdade.
     */
    it('treats a percent in the query as a literal character', async () => {
      expect(await searchIds('100%')).toEqual([withPercent]);
      // E o `%` no fim não vira "qualquer coisa": `garantido%` não existe.
      await expect(searchIds('garantido%')).resolves.toEqual([]);
    });

    // O `text` entra em AND com os outros filtros de navegação.
    it('combines the text with the other filters, with AND', async () => {
      const response = await listHighlights(
        `?bookId=${SEARCH_BOOK_ID}&authorId=${MARCOS_ID}&text=esmeralda`,
      );

      expect(response.statusCode).toBe(200);
      expect(response.json<HighlightBody[]>().map((row) => row.id)).toEqual([
        inComment,
      ]);
    });

    // E o corte de tenant vale para a busca: o outsider não pesquisa o acervo
    // de um clube em que não é membro (404, não 403 — não vazamos existência).
    it('answers 404 when an outsider searches the collection of another club', async () => {
      const response = await listHighlights(
        '?text=esmeralda',
        outsiderToken,
        CLUB_ID,
      );

      expect(response.statusCode).toBe(404);
    });

    /**
     * ⚠️ **A BUSCA SEM `bookId` — E ESTA É A FORMA QUE A TELA USA (achado
     * MÉDIO 3 da auditoria).**
     *
     * Todos os outros testes deste bloco ancoram em `?bookId=SEARCH_BOOK_ID`, e
     * todos os fixtures deles são do MESMO clube: com o `bookId` no filtro, um
     * `clubId` perdido no `where` do repositório é **invisível** aqui — a
     * propriedade tinha **um** dono só (o teste de contrato), e o fixture que a
     * mata vivia **dentro** daquele único teste. Quem "simplificasse" o teste
     * apagaria a guarda inteira.
     *
     * E a forma que faltava é justamente a que a **tela** usa: a busca é do
     * CLUBE, sem livro nenhum no filtro — o `pages/busca.tsx` manda só
     * `{ text }`.
     *
     * ⚠️ **O FIXTURE É UM GRIFO DE OUTRO CLUBE QUE CASA O TERMO**, criado pelo
     * outsider no livro dele (ele é `OWNER` do `OTHER_CLUB_ID`): é o que faz o
     * mutante "tira o `clubId` do `where`" ficar vermelho AQUI, e não só no
     * contrato. Sem ele, o teste passaria com o vazamento.
     */
    it('searches the whole CLUB when no bookId is given, and never crosses the tenant', async () => {
      const alheio = await createHighlight(
        { quote: 'a esmeralda de outro clube' },
        outsiderToken,
        OTHER_CLUB_BOOK_ID,
      );

      // A busca da Maria, do jeito que a tela faz: só o termo.
      const mine = await idsOfSearch('?text=esmeralda');

      // Os dois do clube dela voltam, de livros DIFERENTES do `SEARCH_BOOK_ID`
      // (o `?bookId=` está fora de propósito)...
      expect(mine).toEqual([inQuote, inComment].sort());
      // ...e o grifo do OUTRO clube, que casa o termo, **não** volta.
      expect(mine).not.toContain(alheio.id);
      // A precondição que dá dente à asserção: ele existe, e quem é do clube
      // dele o acha pela mesma busca.
      expect(
        await idsOfSearch('?text=esmeralda', outsiderToken, OTHER_CLUB_ID),
      ).toEqual([alheio.id]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // A forma da resposta — o `response` schema é fronteira, não decoração
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * O serializer do Zod é quem corta campo não declarado (§6.1). A prova é a
   * lista EXATA de chaves — um `toEqual` de conjunto quebra tanto quando sobra
   * campo quanto quando falta.
   */
  describe('response shape', () => {
    const HIGHLIGHT_KEYS = [
      'archivedAt',
      'bookId',
      'clubId',
      'color',
      'commentDoc',
      'commentText',
      'createdAt',
      'id',
      'page',
      'quote',
      'reference',
      'status',
      'updatedAt',
      'userId',
    ];

    it('returns exactly the declared keys of a highlight', async () => {
      const highlight = await createHighlight({ quote: 'chaves' });

      expect(Object.keys(highlight).sort()).toEqual(HIGHLIGHT_KEYS);
    });

    it('returns exactly the declared keys of a highlight in the listing', async () => {
      await createHighlight(
        { quote: 'chaves na listagem' },
        mariaToken,
        FILTER_BOOK_ID,
      );

      const response = await listHighlights(`?bookId=${FILTER_BOOK_ID}`);
      const [first] = response.json<HighlightBody[]>();

      expect(Object.keys(first ?? {}).sort()).toEqual(HIGHLIGHT_KEYS);
    });
  });
});
