import { randomUUID } from 'node:crypto';

import {
  ACTIVITY_FEED_DEFAULT_LIMIT,
  ACTIVITY_FEED_MAX_LIMIT,
} from '@clube/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildServer } from '../../http/server';
import {
  prefixedEmail,
  prefixedId,
  prisma,
  removeFixtures,
} from '../../repositories/__tests__/_db';

const CLUB_ID = prefixedId('t34r', 'club');
const OTHER_CLUB_ID = prefixedId('t34r', 'otherclub');

/** A leitora: `MEMBER` sem papel de admin — ler o feed não exige papel. */
const MARIA_ID = prefixedId('t34r', 'maria');
/** O outro membro: o feed mostra o que TODO MUNDO fez (ADR 0002). */
const MARCOS_ID = prefixedId('t34r', 'marcos');
/** Tem conta e é OWNER de OUTRO clube: o corte de tenant tem de dar 404. */
const OUTSIDER_ID = prefixedId('t34r', 'outsider');

const BOOK_ID = prefixedId('t34r', 'book');
const DAY_1 = prefixedId('t34r', 'day1');
const DAY_2 = prefixedId('t34r', 'day2');

/** Livro do clube alheio, com um dia: o alvo dos 404 de tenant. */
const OTHER_CLUB_BOOK_ID = prefixedId('t34r', 'otherbook');
const OTHER_DAY_1 = prefixedId('t34r', 'otherday1');

const membershipIds: string[] = [];
const userIds: string[] = [MARIA_ID, MARCOS_ID, OUTSIDER_ID];
const bookIds = [BOOK_ID, OTHER_CLUB_BOOK_ID];
const clubIds = [CLUB_ID, OTHER_CLUB_ID];

/**
 * ⚠️ **IDS DE ORDENAÇÃO SEM SUFIXO ALEATÓRIO NA PONTA** (§7.2). O `prefixedId`
 * termina num `randomUUID()`, então a ordem alfabética dos ids seria sorteada a
 * cada execução — e uma sorte favorável faria a implementação errada coincidir
 * com a certa de vez em quando. Aqui o sufixo aleatório é UM SÓ para o grupo, e
 * o que varia é o número na frente dele.
 */
const ORDER_RUN = randomUUID();
function orderedId(n: number): string {
  return `t34r-ord${n}-${ORDER_RUN}`;
}

interface ActivityBody {
  id: string;
  clubId: string;
  userId: string;
  type: string;
  bookId: string;
  planItemId: string | null;
  subjectId: string;
  createdAt: string;
}

function aDoc(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

async function seedUser(id: string, prefix: string): Promise<void> {
  await prisma.user.upsert({
    where: { id },
    create: { id, email: prefixedEmail('t34r', prefix), name: prefix },
    update: {},
  });
}

async function seedMembership(
  userId: string,
  clubId: string,
  role: 'OWNER' | 'ADMIN' | 'MEMBER',
): Promise<void> {
  const id = prefixedId('t34r', `ms-${role}`);
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

describe('activity routes', () => {
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
   * ⚠️ A limpeza **CONSULTA o banco** (o formato do `invite-routes`, §6.6): os
   * eventos, as notas, os grifos e os logs nascem com id gerado pelo SERVIDOR,
   * e um teste que falhe no meio deixa linha para trás. Uma lista alimentada
   * pelas respostas esperadas estouraria na FK do `planItemId`
   * (`onDelete: Restrict`) e vazaria fixture no banco de desenvolvimento do
   * dono.
   *
   * A ordem importa: o EVENTO sai primeiro de todos — ele é a ponta nova, e a
   * FK dele aponta para clube, pessoa, livro e dia do plano.
   */
  afterAll(async () => {
    await wipeActivity();
    const notes = await prisma.note.findMany({
      where: { bookId: { in: bookIds } },
      select: { id: true },
    });
    const highlights = await prisma.highlight.findMany({
      where: { bookId: { in: bookIds } },
      select: { id: true },
    });
    const logs = await prisma.readingLog.findMany({
      where: { bookId: { in: bookIds } },
      select: { id: true },
    });
    const planItems = await prisma.readingPlanItem.findMany({
      where: { bookId: { in: bookIds } },
      select: { id: true },
    });
    const memberships = await prisma.membership.findMany({
      where: { clubId: { in: clubIds } },
      select: { id: true },
    });

    await removeFixtures({
      highlightIds: highlights.map((row) => row.id),
      readingLogIds: logs.map((row) => row.id),
      noteIds: notes.map((row) => row.id),
      planItemIds: planItems.map((row) => row.id),
      bookIds,
      membershipIds: [
        ...new Set([...membershipIds, ...memberships.map((m) => m.id)]),
      ],
      clubIds,
      userIds,
    });
    await prisma.$disconnect();
    await app.close();
  });

  /** Apaga todo evento dos clubes deste arquivo, consultando o banco. */
  async function wipeActivity(): Promise<void> {
    const rows = await prisma.activityEvent.findMany({
      where: { clubId: { in: clubIds } },
      select: { id: true },
    });
    if (rows.length > 0) {
      await prisma.activityEvent.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });
    }
  }

  /**
   * Cada teste começa com o feed vazio: um teste de rota não pode depender do
   * que outro deixou (§6.6). As notas, os grifos e os logs também saem — senão
   * o `unique(planItemId, userId)` da nota do dia faria a segunda escrita
   * convergir e o gatilho não disparar (decisão A da Tarefa 33).
   */
  beforeEach(async () => {
    await wipeActivity();
    await prisma.note.deleteMany({ where: { bookId: { in: bookIds } } });
    await prisma.highlight.deleteMany({ where: { bookId: { in: bookIds } } });
    await prisma.readingLog.deleteMany({ where: { bookId: { in: bookIds } } });
  });

  function auth(token: string): { authorization: string } {
    return { authorization: `Bearer ${token}` };
  }

  async function listActivity(
    token = mariaToken,
    query = '',
  ): Promise<LightMyRequestResponse> {
    return await app.inject({
      method: 'GET',
      url: `/clubs/${CLUB_ID}/activity${query}`,
      headers: auth(token),
    });
  }

  function bodyOf(response: LightMyRequestResponse): ActivityBody[] {
    return JSON.parse(response.body) as ActivityBody[];
  }

  /** Grava eventos direto no banco, com instantes ESCOLHIDOS. */
  async function seedEvents(
    rows: readonly {
      id: string;
      createdAt: Date;
      clubId?: string;
      bookId?: string;
      planItemId?: string | null;
      userId?: string;
      type?: string;
    }[],
  ): Promise<void> {
    await prisma.activityEvent.createMany({
      data: rows.map((row) => ({
        id: row.id,
        clubId: row.clubId ?? CLUB_ID,
        userId: row.userId ?? MARIA_ID,
        type: row.type ?? 'PLAN_NOTE',
        bookId: row.bookId ?? BOOK_ID,
        planItemId: row.planItemId === undefined ? DAY_1 : row.planItemId,
        subjectId: `subject-${row.id}`,
        createdAt: row.createdAt,
      })),
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Autenticação — vem de graça do escopo autenticado, e o teste é a guarda
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * O escopo autenticado é um plugin encapsulado, então isto vale por
   * CONSTRUÇÃO (§6.6) — e o teste existe para a construção não deixar de valer
   * sem ninguém notar: um `register` fora do escopo faria a rota nascer
   * pública, e nada mais no projeto acusaria.
   */
  describe('authentication', () => {
    it('answers 401 without a token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/clubs/${CLUB_ID}/activity`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // REGRA 14 — o corte de tenant, ponta a ponta
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ⚠️ REGRA 14 — **404, nunca 403**: não confirmamos a existência de um
   * recurso de um clube que não é da pessoa. O outsider é OWNER de outro clube,
   * então tem conta e papel — só não neste.
   *
   * ⚠️ **A PRECONDIÇÃO QUE IMPEDE ESTE BLOCO DE SER UMA ASSERÇÃO VAZIA**
   * (§7.4): o Fastify responde **404 para rota inexistente**, então um
   * `expect(404)` aqui passa verde com a rota nem registrada. Está medido no
   * projeto: quando o `highlight-routes.integration.test.ts` nasceu, antes de
   * uma linha de rota existir, a rodada foi `43 failed | 6 passed | 13 skipped
   * (62)` — e os 6 verdes eram justamente os 404 sem precondição.
   *
   * Então cada teste deste bloco pina, ele mesmo, que o ator legítimo é
   * atendido na MESMA rota **e no MESMO VERBO** — aqui só existe um verbo, e
   * mesmo assim a precondição é do GET, não de outra rota.
   */
  describe('tenant cut', () => {
    it('answers 404 when an outsider asks for the feed of another club', async () => {
      await seedEvents([{ id: orderedId(1), createdAt: new Date() }]);

      const response = await listActivity(outsiderToken);

      expect(response.statusCode).toBe(404);
      // A precondição, e ela é do GET: a MESMA rota, no MESMO verbo, atende a
      // Maria — é o que separa "o corte de tenant recusou" de "a rota não
      // existe".
      const legit = await listActivity(mariaToken);
      expect(legit.statusCode).toBe(200);
      expect(bodyOf(legit)).toHaveLength(1);
    });

    it('answers 404 for a club that does not exist at all', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/clubs/${prefixedId('t34r', 'ghost')}/activity`,
        headers: auth(mariaToken),
      });

      expect(response.statusCode).toBe(404);
      // A precondição do mesmo verbo, outra vez.
      expect((await listActivity(mariaToken)).statusCode).toBe(200);
    });

    /**
     * ⚠️ **NADA de outro clube atravessa**, e a prova é com os DOIS clubes
     * cheios: sem o evento alheio no banco, um `find` sem corte passaria igual.
     */
    it('never lets an event of another club into the feed', async () => {
      await seedEvents([
        { id: orderedId(1), createdAt: new Date('2026-10-01T10:00:00Z') },
        {
          id: orderedId(2),
          createdAt: new Date('2026-10-02T10:00:00Z'),
          clubId: OTHER_CLUB_ID,
          bookId: OTHER_CLUB_BOOK_ID,
          planItemId: OTHER_DAY_1,
          userId: OUTSIDER_ID,
        },
      ]);

      const body = bodyOf(await listActivity(mariaToken));

      expect(body.map((event) => event.id)).toEqual([orderedId(1)]);
      // A precondição: o evento alheio EXISTE, e o dono dele o vê.
      const theirs = await app.inject({
        method: 'GET',
        url: `/clubs/${OTHER_CLUB_ID}/activity`,
        headers: auth(outsiderToken),
      });
      expect(theirs.statusCode).toBe(200);
      expect(bodyOf(theirs).map((event) => event.id)).toEqual([orderedId(2)]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // REGRA 13 — 200 com o array, e a forma da resposta
  // ───────────────────────────────────────────────────────────────────────────

  describe('the feed', () => {
    it('answers 200 with an empty array when nothing happened yet', async () => {
      const response = await listActivity();

      expect(response.statusCode).toBe(200);
      expect(bodyOf(response)).toEqual([]);
    });

    /**
     * ⚠️ **A RESPOSTA TEM OITO CAMPOS E NADA MAIS** — o `response` schema é
     * fronteira de segurança (§6.1), e é o serializer do Zod que corta o que
     * não está declarado.
     *
     * E ela leva **referência, nunca conteúdo** (decisão G da Tarefa 33): sem
     * título do dia, sem nome de quem fez, sem trecho. A tela resolve nome pelo
     * `GET /clubs/:clubId/members`.
     */
    it('gives exactly the eight fields of the entity, and no content', async () => {
      const at = new Date('2026-10-01T18:30:45.123Z');
      await seedEvents([{ id: orderedId(1), createdAt: at }]);

      const [event] = bodyOf(await listActivity());

      expect(event).toEqual({
        id: orderedId(1),
        clubId: CLUB_ID,
        userId: MARIA_ID,
        type: 'PLAN_NOTE',
        bookId: BOOK_ID,
        planItemId: DAY_1,
        subjectId: `subject-${orderedId(1)}`,
        createdAt: at.toISOString(),
      });
    });

    /** O `planItemId` nulo do avulso e do grifo atravessa como `null`. */
    it('gives back a null planItemId for the free note and the highlight', async () => {
      await seedEvents([
        {
          id: orderedId(1),
          createdAt: new Date('2026-10-01T10:00:00Z'),
          type: 'FREE_NOTE',
          planItemId: null,
        },
      ]);

      expect(bodyOf(await listActivity())[0]?.planItemId).toBeNull();
    });

    /**
     * ⚠️ **A ORDEM É O PRODUTO** (decisão C), e a fixture é hostil: a ordem de
     * inserção, a alfabética dos ids e a cronológica **discordam**, e as
     * precondições estão pinadas (§7.2).
     *
     * ```
     * esperado (createdAt desc)   ord2, ord3, ord1
     * ordem de inserção           ord3, ord1, ord2
     * orderBy id asc              ord1, ord2, ord3
     * orderBy createdAt asc       ord1, ord3, ord2
     * ```
     */
    it('lists the newest first, with insertion order and clock disagreeing', async () => {
      await seedEvents([
        { id: orderedId(3), createdAt: new Date('2026-10-02T00:00:00Z') },
        { id: orderedId(1), createdAt: new Date('2026-10-01T00:00:00Z') },
        { id: orderedId(2), createdAt: new Date('2026-10-03T00:00:00Z') },
      ]);

      // As precondições, sem as quais o teste pode passar por coincidência.
      expect(orderedId(1) < orderedId(2)).toBe(true);
      expect(orderedId(2) < orderedId(3)).toBe(true);

      expect(bodyOf(await listActivity()).map((event) => event.id)).toEqual([
        orderedId(2),
        orderedId(3),
        orderedId(1),
      ]);
    });

    /**
     * ⚠️ **O feed mostra o que TODO MUNDO fez** (ADR 0002: dentro do clube não
     * existe conteúdo privado, e o evento não cria visibilidade nova). Um
     * filtro por ator que alguém acrescentasse "por segurança" quebraria aqui,
     * e em lugar nenhum mais.
     */
    it('shows the events of every member, to every member', async () => {
      await seedEvents([
        { id: orderedId(1), createdAt: new Date('2026-10-01T10:00:00Z') },
        {
          id: orderedId(2),
          createdAt: new Date('2026-10-02T10:00:00Z'),
          userId: MARCOS_ID,
        },
      ]);

      for (const token of [mariaToken, marcosToken]) {
        const body = bodyOf(await listActivity(token));
        expect(body.map((event) => event.userId).sort()).toEqual(
          [MARIA_ID, MARCOS_ID].sort(),
        );
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // DECISÃO D — o `limit` é parâmetro explícito da BORDA
  // ───────────────────────────────────────────────────────────────────────────

  describe('the limit', () => {
    async function seedMany(count: number): Promise<void> {
      await seedEvents(
        Array.from({ length: count }, (_, i) => ({
          id: orderedId(1000 + i),
          createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, i)),
        })),
      );
    }

    it('honours ?limit, keeping the newest', async () => {
      await seedMany(5);

      const body = bodyOf(await listActivity(mariaToken, '?limit=2'));

      expect(body.map((event) => event.id)).toEqual([
        orderedId(1004),
        orderedId(1003),
      ]);
      // A precondição: sem o parâmetro as cinco voltam.
      expect(bodyOf(await listActivity())).toHaveLength(5);
    });

    /**
     * ⚠️ O padrão só é observável com MAIS eventos do que ele — e é a prova de
     * que a borda **não** declara `.default()`: quem aplica o padrão é o
     * repositório, e a chave nem viaja no filtro.
     */
    it('falls back to the documented default when nobody asks', async () => {
      await seedMany(ACTIVITY_FEED_DEFAULT_LIMIT + 1);

      expect(bodyOf(await listActivity())).toHaveLength(
        ACTIVITY_FEED_DEFAULT_LIMIT,
      );
      await expect(
        prisma.activityEvent.count({ where: { clubId: CLUB_ID } }),
      ).resolves.toBe(ACTIVITY_FEED_DEFAULT_LIMIT + 1);
    });

    it.each([
      ['zero', '0'],
      ['a negative', '-3'],
      ['a fraction', '2.5'],
      ['text', 'vinte'],
      ['one past the ceiling', String(ACTIVITY_FEED_MAX_LIMIT + 1)],
    ])('answers 400 for %s', async (_label, value) => {
      const response = await listActivity(mariaToken, `?limit=${value}`);

      expect(response.statusCode).toBe(400);
      // A precondição do mesmo verbo: a rota existe e atende sem o parâmetro.
      expect((await listActivity()).statusCode).toBe(200);
    });

    /**
     * A query string ganha parâmetro alheio por acidente (um `utm_source`
     * colado de um link), e o schema NÃO é `.strict()` — o mesmo desenho do
     * `listNotesQuerySchema`: não há campo derivado nem de tenant aqui, então
     * derrubar o feed por causa disso seria trocar um risco que não existe por
     * uma quebra real.
     */
    it('ignores a query parameter nobody declared', async () => {
      await seedMany(2);

      const response = await listActivity(mariaToken, '?utm_source=whatsapp');

      expect(response.statusCode).toBe(200);
      expect(bodyOf(response)).toHaveLength(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ⚠️ REGRA 20 — A DÍVIDA PAGA, VISTA DE FORA
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ⚠️ **A PROVA PONTA A PONTA DE QUE O GATILHO DA TAREFA 33 CHEGA AO BANCO.**
   *
   * Até esta fatia o `buildRepositories` ligava o remendo da Tarefa 33, que
   * **lançava de propósito** — cada nascimento deixava uma linha de log
   * `activity_event_not_recorded` e o evento se perdia. Nenhum teste da 33
   * podia ver isto: o que ela tinha eram os quatro UseCases com fake.
   *
   * Este bloco escreve pelas rotas REAIS — a anotação do dia, a avulsa, o grifo
   * e o "li" — e depois pede o feed. Se a fiação do repositório voltar a ser um
   * remendo, é aqui que aparece.
   */
  describe('the four births reach the feed', () => {
    it('records the day note, the free note, the highlight and the read', async () => {
      const planNote = await app.inject({
        method: 'PUT',
        url: `/plan-items/${DAY_1}/note`,
        headers: auth(mariaToken),
        payload: { doc: aDoc('a anotação do dia') },
      });
      const freeNote = await app.inject({
        method: 'POST',
        url: `/books/${BOOK_ID}/notes`,
        headers: auth(mariaToken),
        payload: { title: 'Uma ideia solta', doc: aDoc('avulsa') },
      });
      const highlight = await app.inject({
        method: 'POST',
        url: `/books/${BOOK_ID}/highlights`,
        headers: auth(marcosToken),
        payload: {
          quote: 'Num buraco no chão vivia um hobbit',
          color: '#facc15',
        },
      });
      const read = await app.inject({
        method: 'PUT',
        url: `/plan-items/${DAY_2}/reading-log`,
        headers: auth(marcosToken),
        payload: {},
      });

      // As precondições: as quatro escritas deram certo. Sem elas, um feed
      // vazio por causa de um 400 numa delas passaria como "não registrou".
      expect([
        planNote.statusCode,
        freeNote.statusCode,
        highlight.statusCode,
        read.statusCode,
      ]).toEqual([201, 201, 201, 201]);

      const body = bodyOf(await listActivity());

      expect(body).toHaveLength(4);
      expect(body.map((event) => event.type).sort()).toEqual([
        'FREE_NOTE',
        'HIGHLIGHT',
        'PLAN_NOTE',
        'READ',
      ]);
      // ...e cada evento aponta para o que acabou de nascer: REFERÊNCIA, e a
      // referência certa.
      const subjectOf = (type: string) =>
        body.find((event) => event.type === type)?.subjectId;
      expect(subjectOf('PLAN_NOTE')).toBe(
        (JSON.parse(planNote.body) as { id: string }).id,
      );
      expect(subjectOf('FREE_NOTE')).toBe(
        (JSON.parse(freeNote.body) as { id: string }).id,
      );
      expect(subjectOf('HIGHLIGHT')).toBe(
        (JSON.parse(highlight.body) as { id: string }).id,
      );
      expect(subjectOf('READ')).toBe(
        (JSON.parse(read.body) as { id: string }).id,
      );
      // O dia do plano só nos dois que têm dia — e nos dois é o dia CERTO.
      expect(body.find((event) => event.type === 'PLAN_NOTE')?.planItemId).toBe(
        DAY_1,
      );
      expect(
        body.find((event) => event.type === 'FREE_NOTE')?.planItemId,
      ).toBeNull();
      expect(
        body.find((event) => event.type === 'HIGHLIGHT')?.planItemId,
      ).toBeNull();
      expect(body.find((event) => event.type === 'READ')?.planItemId).toBe(
        DAY_2,
      );
    });

    /**
     * ⚠️ **A DECISÃO A DA TAREFA 33, vista do feed:** o autosave da tela do dia
     * reenvia o `PUT` a cada 1500 ms, e só o NASCIMENTO é notícia. Três
     * escritas da mesma anotação dão **um** evento — senão meia hora de escrita
     * afogaria o feed com dezenas de linhas.
     */
    it('records one event for three autosaves of the same day note', async () => {
      for (const text of ['primeiro', 'segundo', 'terceiro']) {
        const response = await app.inject({
          method: 'PUT',
          url: `/plan-items/${DAY_1}/note`,
          headers: auth(mariaToken),
          payload: { doc: aDoc(text) },
        });
        expect(response.statusCode).toBe(text === 'primeiro' ? 201 : 200);
      }

      expect(bodyOf(await listActivity())).toHaveLength(1);
    });
  });
});
