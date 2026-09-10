import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildServer } from '../../http/server';
import {
  prefixedEmail,
  prefixedId,
  prisma,
  removeFixtures,
} from '../../repositories/__tests__/_db';

const CLUB_ID = prefixedId('t32r', 'club');
const OTHER_CLUB_ID = prefixedId('t32r', 'otherclub');

/** A leitora: `MEMBER` sem papel de admin — marcar não exige papel. */
const MARIA_ID = prefixedId('t32r', 'maria');
/** O outro leitor: o clube inteiro lê o mesmo trecho. */
const MARCOS_ID = prefixedId('t32r', 'marcos');
/** Tem conta e é OWNER de OUTRO clube: o corte de tenant tem de dar 404. */
const OUTSIDER_ID = prefixedId('t32r', 'outsider');

/** O livro principal. Os dias são reservados POR bloco de teste. */
const BOOK_ID = prefixedId('t32r', 'book');
const DAY_1 = prefixedId('t32r', 'day1');
const DAY_2 = prefixedId('t32r', 'day2');
const DAY_3 = prefixedId('t32r', 'day3');
const DAY_4 = prefixedId('t32r', 'day4');
const DAY_5 = prefixedId('t32r', 'day5');

/**
 * Livro só para a sobreposição do `GET /books/:bookId` (regra 14).
 *
 * Livro próprio, e não mais dias no principal, porque a sobreposição é do
 * LIVRO inteiro: um teste anterior que marcasse noutro dia mudaria a resposta
 * esperada aqui, e o vermelho apareceria com o nome de outro teste. É a mesma
 * razão do `WRITERS_BOOK_ID` do `note-routes.integration.test.ts`.
 */
const OVERLAY_BOOK_ID = prefixedId('t32r', 'obook');
const O_DAY_1 = prefixedId('t32r', 'oday1');
const O_DAY_2 = prefixedId('t32r', 'oday2');
const O_DAY_3 = prefixedId('t32r', 'oday3');

/** Livro do clube alheio, com um dia: o alvo dos 404 de tenant. */
const OTHER_CLUB_BOOK_ID = prefixedId('t32r', 'otherbook');
const OTHER_DAY_1 = prefixedId('t32r', 'otherday1');

const membershipIds: string[] = [];
const userIds: string[] = [MARIA_ID, MARCOS_ID, OUTSIDER_ID];
const bookIds = [BOOK_ID, OVERLAY_BOOK_ID, OTHER_CLUB_BOOK_ID];

interface ReadingLogBody {
  id: string;
  clubId: string;
  bookId: string;
  userId: string;
  planItemId: string;
  readAt: string;
}

interface OverlayEntry {
  planItemId: string;
  userIds: string[];
}

async function seedUser(id: string, prefix: string): Promise<void> {
  await prisma.user.upsert({
    where: { id },
    create: { id, email: prefixedEmail('t32r', prefix), name: prefix },
    update: {},
  });
}

async function seedMembership(
  userId: string,
  clubId: string,
  role: 'OWNER' | 'ADMIN' | 'MEMBER',
): Promise<void> {
  const id = prefixedId('t32r', `ms-${role}`);
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

describe('reading log routes', () => {
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
      [DAY_5, 4, '2026-10-05'],
    ]);

    await seedBook(OVERLAY_BOOK_ID, CLUB_ID, MARIA_ID, 'A Sociedade do Anel');
    await seedPlan(OVERLAY_BOOK_ID, [
      [O_DAY_1, 0, '2026-11-01'],
      [O_DAY_2, 1, '2026-11-02'],
      [O_DAY_3, 2, '2026-11-03'],
    ]);

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
   * ⚠️ A limpeza **CONSULTA o banco** (o formato do `invite-routes`,
   * `docs/CONVENCOES-CODIGO.md` §6.6): os logs nascem com id gerado pelo
   * SERVIDOR, e um teste que falhe no meio deixa log para trás. Uma lista
   * alimentada pelas respostas esperadas estouraria na FK do `planItemId`
   * (`onDelete: Restrict`) e vazaria fixture no banco de desenvolvimento do
   * dono.
   */
  afterAll(async () => {
    const logs = await prisma.readingLog.findMany({
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
      readingLogIds: logs.map((log) => log.id),
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

  async function markRead(
    planItemId: string,
    token = mariaToken,
    payload?: Record<string, unknown>,
  ): Promise<LightMyRequestResponse> {
    return await app.inject({
      method: 'PUT',
      url: `/plan-items/${planItemId}/reading-log`,
      headers: auth(token),
      payload,
    });
  }

  async function unmarkRead(
    planItemId: string,
    token = mariaToken,
  ): Promise<LightMyRequestResponse> {
    return await app.inject({
      method: 'DELETE',
      url: `/plan-items/${planItemId}/reading-log`,
      headers: auth(token),
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 12 — autenticação (vem de graça do escopo autenticado)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * As duas rotas exigem token. O escopo autenticado é um plugin encapsulado,
   * então isto vale por CONSTRUÇÃO (§6.6) — e o teste existe para a construção
   * não deixar de valer sem ninguém notar: um `register` fora do escopo faria
   * as duas nascerem públicas, e nada mais no projeto acusaria.
   */
  describe('authentication', () => {
    it.each([
      ['PUT', `/plan-items/${DAY_1}/reading-log`],
      ['DELETE', `/plan-items/${DAY_1}/reading-log`],
    ] as const)(
      'answers 401 for %s %s without a token',
      async (method, url) => {
        const response = await app.inject({ method, url });

        expect(response.statusCode).toBe(401);
        // E nada foi escrito nem apagado: o 401 vem antes do handler.
        expect(
          await prisma.readingLog.count({ where: { bookId: BOOK_ID } }),
        ).toBe(0);
      },
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 12 — o corte de tenant, ponta a ponta, nas DUAS rotas
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ⚠️ REGRA 12 — **404, nunca 403**: não confirmamos a existência de um
   * recurso de um clube que não é da pessoa. O outsider é OWNER de outro
   * clube, então tem conta e papel — só não neste.
   *
   * ⚠️ **A PRECONDIÇÃO QUE IMPEDE ESTE BLOCO DE SER UMA ASSERÇÃO VAZIA**
   * (§7.4): o Fastify responde **404 para rota inexistente**, então um
   * `expect(404)` aqui passa verde com as duas rotas nem registradas. Está
   * medido no projeto: quando o `highlight-routes.integration.test.ts` nasceu,
   * antes de uma linha de rota existir, a rodada foi
   * `43 failed | 6 passed | 13 skipped (62)` — e os 6 verdes eram justamente
   * os 404 sem precondição.
   *
   * Então **cada teste deste bloco pina, ele mesmo, que o ator legítimo é
   * atendido na MESMA rota E no MESMO VERBO**. O formato é o do
   * `highlight-routes.integration.test.ts:365-460`, e o docblock de lá
   * registra o erro que a primeira entrega desta fatia repetiu: pinar com
   * outro verbo (um `markRead` de sucesso não diz nada sobre o `DELETE`
   * existir). O bloco `authentication` acima cobre os dois verbos, mas ele
   * não salva ESTE bloco quando rodado isolado.
   */
  describe('tenant cut', () => {
    it('answers 404 when an outsider marks a day of another club as read', async () => {
      const response = await markRead(DAY_1, outsiderToken);

      expect(response.statusCode).toBe(404);
      // A precondição, e ela é do PUT: a MESMA rota, no MESMO verbo, atende a
      // Maria — é o que separa "o corte de tenant recusou" de "a rota não
      // existe".
      expect((await markRead(DAY_1, mariaToken)).statusCode).toBe(201);
      // E nada foi escrito pelo outsider: o corte vem antes da escrita.
      expect(
        await prisma.readingLog.count({ where: { userId: OUTSIDER_ID } }),
      ).toBe(0);
    });

    /**
     * ⚠️ O DELETE do estranho, e o que ele NÃO pode fazer: a leitura da Maria
     * continua lá. Sem esta segunda metade, um `unmarkRead` que apagasse antes
     * de conferir o tenant daria o mesmo 404 e teria destruído o registro.
     */
    it('answers 404 when an outsider unmarks a day of another club, and deletes nothing', async () => {
      expect((await markRead(DAY_2)).statusCode).toBe(201);

      const response = await unmarkRead(DAY_2, outsiderToken);

      expect(response.statusCode).toBe(404);
      expect(
        await prisma.readingLog.count({
          where: { planItemId: DAY_2, userId: MARIA_ID },
        }),
      ).toBe(1);
      // ⚠️ A precondição, e ela é do DELETE: o `markRead` acima exercita o
      // PUT e não diz nada sobre esta rota existir. Sem esta linha o teste
      // fica verde com o DELETE não registrado — e a contagem de 1 acima
      // passaria igual, porque nada teria sido apagado.
      expect((await unmarkRead(DAY_2, mariaToken)).statusCode).toBe(204);
    });

    /**
     * O outro lado do corte, que é o que prova que ele é do MEMBERSHIP e não
     * do id: a Maria é membro do clube dela e ainda assim não alcança o dia do
     * livro do clube alheio, nas duas rotas.
     */
    it('answers 404 when a member reaches for a day of another club book', async () => {
      const put = await markRead(OTHER_DAY_1);
      const del = await unmarkRead(OTHER_DAY_1);

      expect([put.statusCode, del.statusCode]).toEqual([404, 404]);
      expect(
        await prisma.readingLog.count({
          where: { bookId: OTHER_CLUB_BOOK_ID },
        }),
      ).toBe(0);
      // A precondição, nos DOIS verbos: as mesmas duas rotas atendem a Maria
      // num dia do clube DELA.
      expect((await markRead(DAY_1, mariaToken)).statusCode).toBeLessThan(300);
      expect((await unmarkRead(DAY_1, mariaToken)).statusCode).toBe(204);
    });

    // Regra 12 — dia que não existe: 404 nas duas, e indistinguível do de
    // cima. É o que não vaza a existência do recurso.
    it('answers 404 for a plan item that does not exist', async () => {
      const ghost = prefixedId('t32r', 'ghost');

      expect((await markRead(ghost)).statusCode).toBe(404);
      expect((await unmarkRead(ghost)).statusCode).toBe(404);
      // A precondição, nos DOIS verbos: com um dia que EXISTE, as mesmas duas
      // rotas respondem. Sem ela, este teste é um `expect(404)` que passa com
      // as rotas inexistentes.
      expect((await markRead(DAY_1, mariaToken)).statusCode).toBeLessThan(300);
      expect((await unmarkRead(DAY_1, mariaToken)).statusCode).toBe(204);
    });

    /**
     * O `bookForActor` recusa livro ARQUIVADO, e o guard confere o
     * `Membership` e nunca o `Club` (ADR 0009). Este é o lado do livro: o dia
     * some junto com o livro que foi arquivado.
     */
    it('answers 404 for a day of an archived book', async () => {
      const archivedBook = prefixedId('t32r', 'archivedbook');
      const archivedDay = prefixedId('t32r', 'archivedday');
      bookIds.push(archivedBook);
      await prisma.book.create({
        data: {
          id: archivedBook,
          clubId: CLUB_ID,
          title: 'Arquivado',
          month: '2026-09',
          createdById: MARIA_ID,
          status: 'ARCHIVED',
          archivedAt: new Date('2026-09-30T00:00:00.000Z'),
        },
      });
      await seedPlan(archivedBook, [[archivedDay, 0, '2026-09-01']]);

      expect((await markRead(archivedDay)).statusCode).toBe(404);
      expect((await unmarkRead(archivedDay)).statusCode).toBe(404);
      expect(
        await prisma.readingLog.count({ where: { bookId: archivedBook } }),
      ).toBe(0);
      // A precondição, nos DOIS verbos: o mesmo par de rotas atende a Maria
      // num dia de um livro ATIVO. É o que separa "o livro está arquivado" de
      // "a rota não existe".
      expect((await markRead(DAY_1, mariaToken)).statusCode).toBeLessThan(300);
      expect((await unmarkRead(DAY_1, mariaToken)).statusCode).toBe(204);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 10 — 201 na primeira, 200 nas seguintes
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ⚠️ REGRA 10 — a armadilha do serializer POR STATUS.
   *
   * O `markRead` é idempotente e devolve `created: boolean`; a rota traduz
   * isso em 201 × 200. Com só o 200 declarado no `response`, a rede de
   * segurança do `preSerialization` trocaria o corpo do 201 por um `{error}`
   * genérico — e quebraria **a primeira** marcação de cada dia, só a primeira.
   * → CONVENCOES-CODIGO §6.1.
   *
   * O `DAY_3` é reservado a este bloco: outro teste que marcasse nele faria a
   * primeira marcação aqui já ser um 200.
   */
  describe('PUT /plan-items/:planItemId/reading-log', () => {
    it('answers 201 on the first mark and 200 on the next, with a valid body in both', async () => {
      const first = await markRead(DAY_3);
      const second = await markRead(DAY_3);

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(200);

      // O corpo é um log de verdade nos DOIS — é o que o `{error}` genérico do
      // preSerialization não seria.
      const created = first.json<ReadingLogBody>();
      const again = second.json<ReadingLogBody>();
      expect(created.planItemId).toBe(DAY_3);
      expect(created.userId).toBe(MARIA_ID);
      expect(created.clubId).toBe(CLUB_ID);
      expect(created.bookId).toBe(BOOK_ID);
      // A MESMA linha, e o `readAt` da PRIMEIRA vez: é quando a pessoa leu.
      // Um `save` na segunda chamada moveria o instante.
      expect(again.id).toBe(created.id);
      expect(again.readAt).toBe(created.readAt);
      // Uma linha só no banco, não duas.
      expect(
        await prisma.readingLog.count({
          where: { planItemId: DAY_3, userId: MARIA_ID },
        }),
      ).toBe(1);
    });

    /**
     * O corpo carrega os SEIS campos da entidade e **nada mais** — nenhum
     * contador, nenhum total, nenhum percentual. Progresso é presença, e é o
     * contrato que torna o número irrenderizável.
     */
    it('answers with the six fields of the entity and no progress count', async () => {
      const response = await markRead(DAY_4);

      expect(response.statusCode).toBe(201);
      expect(Object.keys(response.json<ReadingLogBody>()).sort()).toEqual([
        'bookId',
        'clubId',
        'id',
        'planItemId',
        'readAt',
        'userId',
      ]);
    });

    // Duas pessoas marcam o MESMO dia: são dois logs, um de cada. É o caso
    // central do produto — o clube inteiro lê o mesmo trecho.
    it('gives each reader her own log on the same day', async () => {
      const maria = await markRead(DAY_5, mariaToken);
      const marcos = await markRead(DAY_5, marcosToken);

      expect(maria.statusCode).toBe(201);
      expect(marcos.statusCode).toBe(201);
      expect(maria.json<ReadingLogBody>().id).not.toBe(
        marcos.json<ReadingLogBody>().id,
      );
      expect(
        await prisma.readingLog.count({ where: { planItemId: DAY_5 } }),
      ).toBe(2);
    });

    // `MEMBER` marca: a leitura não exige papel. Papel de admin manda no livro
    // e no plano, não no que as pessoas registram — daí não haver 403 aqui.
    it('lets a MEMBER without an admin role mark a day', async () => {
      const response = await markRead(DAY_1, marcosToken);

      expect(response.statusCode).toBe(201);
      expect(
        await prisma.membership.findFirst({
          where: { userId: MARCOS_ID, clubId: CLUB_ID },
          select: { role: true },
        }),
      ).toEqual({ role: 'MEMBER' });
    });

    /**
     * ⚠️ REGRA 13 — **CONTRABANDO COM O ATOR LEGÍTIMO, assertando A LINHA
     * GRAVADA** (§7.5).
     *
     * Testar "o `userId` do corpo é ignorado" com um ator de fora não provaria
     * nada sobre o campo: a requisição morreria no guard de tenant, e morreria
     * igual se o contrabando funcionasse. Aqui quem manda é a Maria, que é
     * membro, e o que se asserta é **de quem é a linha** — a única coisa que
     * muda quando o contrabando pega.
     *
     * ⚠️ **E o mutante perigoso não é `input.userId` cru: é
     * `input.userId ?? req.user.sub`**, o envenenamento com fallback, que se
     * comporta normalmente em todo teste que NÃO manda o campo. Nesta rota a
     * barreira é mais forte que o strip do Zod e que a ordem do spread: o
     * handler **não lê `req.body`** — não há spread nenhum. É o que este teste
     * pina, e é o que ficaria vermelho no dia em que alguém acrescentasse um
     * `body` schema e um `...req.body` "para o futuro".
     */
    it('never lets a userId, clubId or bookId in the body change the row it writes', async () => {
      const response = await markRead(DAY_1, mariaToken, {
        userId: MARCOS_ID,
        clubId: OTHER_CLUB_ID,
        bookId: OTHER_CLUB_BOOK_ID,
        planItemId: OTHER_DAY_1,
      });

      /*
        ⚠️ **AS ASSERÇÕES DE AUTORIA VÊM ANTES DA DE STATUS, e a ordem é
        medida.** Com elas depois, o mutante `input.userId ?? req.user.sub`
        acusava pelo STATUS (200 em vez de 201, porque o log do Marcos naquele
        dia já existia) — um vermelho que fala de idempotência num teste cujo
        assunto é AUTORIA, e que sumiria no dia em que o dia do fixture
        mudasse. O acusador tem de ser de quem é a linha (§7.5).
      */
      const body = response.json<ReadingLogBody>();
      expect(body.userId).toBe(MARIA_ID);
      expect(body.clubId).toBe(CLUB_ID);
      expect(body.bookId).toBe(BOOK_ID);
      expect(body.planItemId).toBe(DAY_1);
      expect(response.statusCode).toBe(201);
      // E A LINHA GRAVADA, que é o que muda quando o contrabando pega.
      const stored = await prisma.readingLog.findUnique({
        where: { id: body.id },
      });
      expect(stored).toMatchObject({
        userId: MARIA_ID,
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        planItemId: DAY_1,
      });
      /*
        Nenhuma linha nasceu para o Marcos NESTE dia por causa do corpo, e a
        asserção é sobre o `id` — não sobre uma contagem.

        ⚠️ A primeira entrega afirmava `count({ planItemId: DAY_1, userId:
        MARCOS_ID }) === 1` "a do teste do MEMBER acima": isso depende de outro
        teste ter rodado, e isolado dá 0. Um teste de contrabando que muda de
        veredito conforme o vizinho não é guarda de contrabando.
      */
      const marcosRows = await prisma.readingLog.findMany({
        where: { planItemId: DAY_1, userId: MARCOS_ID },
        select: { id: true },
      });
      expect(marcosRows.map((row) => row.id)).not.toContain(body.id);
      expect(
        await prisma.readingLog.count({ where: { clubId: OTHER_CLUB_ID } }),
      ).toBe(0);
    });

    /**
     * ⚠️ **O `readAt` NUNCA vem do cliente.** Um instante no corpo deixaria a
     * pessoa antedatar a leitura — e o `readAt` é o dado que a supressão
     * anti-culpa do lembrete (Bloco I) vai consultar. O handler não lê o
     * corpo, então o que fica gravado é o relógio do servidor.
     */
    it('never lets a readAt in the body backdate the reading', async () => {
      const backdated = '1999-01-01T00:00:00.000Z';
      const before = Date.now();

      const response = await markRead(DAY_2, marcosToken, {
        readAt: backdated,
        id: prefixedId('t32r', 'chosen-id'),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<ReadingLogBody>();
      expect(body.readAt).not.toBe(backdated);
      expect(new Date(body.readAt).getTime()).toBeGreaterThanOrEqual(before);
      // E nem o id veio do corpo: quem o gera é o UseCase, com randomUUID().
      expect(body.id).not.toContain('chosen-id');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 11 — DELETE responde 204 sempre
  // ───────────────────────────────────────────────────────────────────────────

  describe('DELETE /plan-items/:planItemId/reading-log', () => {
    // Regra 11 — hard delete de verdade: a linha SOME, não vira ARCHIVED. É a
    // exceção documentada ao soft delete do projeto.
    it('answers 204 and removes the row for real', async () => {
      const marked = await markRead(DAY_4, marcosToken);
      expect(marked.statusCode).toBe(201);
      const { id } = marked.json<ReadingLogBody>();

      const response = await unmarkRead(DAY_4, marcosToken);

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
      expect(await prisma.readingLog.count({ where: { id } })).toBe(0);
    });

    /**
     * ⚠️ REGRA 11 — **204 mesmo sem nada para apagar** (decisão C). Um 404
     * obrigaria a tela a distinguir "desmarquei" de "já estava desmarcado",
     * que é a mesma coisa para quem olha.
     *
     * ⚠️ **O dia é `UNREAD_DAY`, criado AQUI e por ninguém marcado.** A
     * primeira entrega desta fatia usava `const ghostDay = DAY_5` com a prosa
     * "a Maria desmarca o que nunca marcou" — e ela **tinha** marcado
     * (`gives each reader her own log on the same day`), então a primeira
     * chamada era um DELETE normal e só a segunda exercitava a propriedade do
     * título. Fixture que a prosa descreve errado é fixture que anula o teste.
     *
     * O MARCOS marca o mesmo dia, e é o par que impede a leitura "204 =
     * apagou tudo": ninguém desmarca a leitura de outra pessoa, e isso é
     * estrutural — a busca do `unmarkRead` já é por autor.
     */
    it('answers 204 when there was nothing to unmark, and touches nobody else', async () => {
      const unreadDay = prefixedId('t32r', 'unreadday');
      await seedPlan(BOOK_ID, [[unreadDay, 9, '2026-10-10']]);
      expect((await markRead(unreadDay, marcosToken)).statusCode).toBe(201);
      // A precondição do título: a MARIA nunca marcou este dia.
      expect(
        await prisma.readingLog.count({
          where: { planItemId: unreadDay, userId: MARIA_ID },
        }),
      ).toBe(0);

      const first = await unmarkRead(unreadDay, mariaToken);
      const second = await unmarkRead(unreadDay, mariaToken);

      expect(first.statusCode).toBe(204);
      expect(second.statusCode).toBe(204);
      // A leitura do MARCOS no mesmo dia continua lá.
      expect(
        await prisma.readingLog.count({
          where: { planItemId: unreadDay, userId: MARCOS_ID },
        }),
      ).toBe(1);
    });

    // E depois de desmarcar, marcar de novo é um 201 outra vez: o índice único
    // não guarda fantasma. É o "desmarquei sem querer" do produto.
    it('lets the same reader mark the day again after unmarking', async () => {
      expect((await markRead(DAY_3, marcosToken)).statusCode).toBe(201);
      expect((await unmarkRead(DAY_3, marcosToken)).statusCode).toBe(204);

      const again = await markRead(DAY_3, marcosToken);

      expect(again.statusCode).toBe(201);
      expect(
        await prisma.readingLog.count({
          where: { planItemId: DAY_3, userId: MARCOS_ID },
        }),
      ).toBe(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 14 — o `readers` chega no GET /books/:bookId
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ⚠️ REGRA 14 — a regra que só passa porque o `bookWithPlanResponseSchema`
   * em `shared/` cresceu junto: o serializer do Zod descarta campo não
   * declarado, então um `readers` esquecido lá sairia **APAGADO**, com 200 e
   * sem erro nenhum. → CONVENCOES-CODIGO §6.1.
   *
   * E é este bloco que segura a ponta enquanto o campo é `optional()` no
   * schema (fase 1 do phase-in — ver o docblock de lá): com o campo opcional,
   * um handler que o esquecesse **não** daria 500.
   */
  describe('the reading overlay inside GET /books/:bookId', () => {
    /**
     * ⚠️ Os leitores são escolhidos para a ordem alfabética ser o OPOSTO da
     * ordem do plano — quem ordena primeiro no alfabeto lê o ÚLTIMO dia —, e a
     * precondição é pinada abaixo. Sem isso, uma sobreposição montada na ordem
     * dos pares coincidiria com a certa por acidente de nomenclatura, que é o
     * falso verde que a Tarefa 11 pagou (§7.2).
     */
    beforeAll(async () => {
      expect(MARCOS_ID < MARIA_ID).toBe(true);

      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/plan-items/${O_DAY_3}/reading-log`,
            headers: auth(marcosToken),
          })
        ).statusCode,
      ).toBe(201);
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/plan-items/${O_DAY_1}/reading-log`,
            headers: auth(mariaToken),
          })
        ).statusCode,
      ).toBe(201);
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/plan-items/${O_DAY_3}/reading-log`,
            headers: auth(mariaToken),
          })
        ).statusCode,
      ).toBe(201);
    });

    it('carries the reading overlay inside GET /books/:bookId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/books/${OVERLAY_BOOK_ID}`,
        headers: auth(mariaToken),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        book: { id: string };
        planItems: { id: string }[];
        writers: OverlayEntry[];
        readers: OverlayEntry[];
      }>();
      // Na ordem do PLANO, e o dia 2 (sem leitura) não aparece.
      expect(body.readers).toEqual([
        { planItemId: O_DAY_1, userIds: [MARIA_ID] },
        { planItemId: O_DAY_3, userIds: [MARCOS_ID, MARIA_ID].sort() },
      ]);
      // E o resto da resposta continua inteiro.
      expect(body.book.id).toBe(OVERLAY_BOOK_ID);
      expect(body.planItems.map((item) => item.id)).toEqual([
        O_DAY_1,
        O_DAY_2,
        O_DAY_3,
      ]);
      // ⚠️ LER NÃO É ESCREVER: ninguém escreveu neste livro, então o `writers`
      // é `[]` enquanto o `readers` tem duas entradas. Um handler que passasse
      // a mesma lista nos dois campos acusa aqui.
      expect(body.writers).toEqual([]);
    });

    // Nenhum contador atravessa a resposta do livro: progresso é presença.
    it('carries no progress count next to the overlay', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/books/${OVERLAY_BOOK_ID}`,
        headers: auth(mariaToken),
      });

      const body = response.json<Record<string, unknown>>();
      expect(Object.keys(body).sort()).toEqual([
        'book',
        'planItems',
        'readers',
        'writers',
      ]);
    });

    // Livro que ninguém leu: `[]`, e o campo EXISTE — a tela não tem de
    // adivinhar entre "vazio" e "o servidor esqueceu".
    it('carries an empty reading overlay for a book nobody read', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/books/${OTHER_CLUB_BOOK_ID}`,
        headers: auth(outsiderToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<{ readers: OverlayEntry[] }>().readers).toEqual([]);
    });

    /**
     * O ADR 0002 na sobreposição: quem leu é visível para **todo membro
     * ativo**, não só para o próprio. O Marcos vê a leitura da Maria, e ela a
     * dele — dentro do clube não existe conteúdo privado.
     */
    it('shows every reader of the club to every member', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/books/${OVERLAY_BOOK_ID}`,
        headers: auth(marcosToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<{ readers: OverlayEntry[] }>().readers).toEqual([
        { planItemId: O_DAY_1, userIds: [MARIA_ID] },
        { planItemId: O_DAY_3, userIds: [MARCOS_ID, MARIA_ID].sort() },
      ]);
    });
  });
});
