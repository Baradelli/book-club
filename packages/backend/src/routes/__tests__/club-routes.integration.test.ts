import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildServer } from '../../http/server';
import {
  prefixedEmail,
  prefixedId,
  prisma,
  removeFixtures,
} from '../../repositories/__tests__/_db';

const ADMIN_ID = prefixedId('t04', 'club-superadmin');
const PLAIN_ID = prefixedId('t04', 'club-plain');

describe('club routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let plainToken: string;

  beforeAll(async () => {
    app = await buildServer({ logger: false });
    await app.ready();

    await prisma.user.upsert({
      where: { id: ADMIN_ID },
      create: {
        id: ADMIN_ID,
        email: prefixedEmail('t04', 'club-superadmin'),
        name: 'Super',
        isSuperAdmin: true,
      },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: PLAIN_ID },
      create: {
        id: PLAIN_ID,
        email: prefixedEmail('t04', 'club-plain'),
        name: 'Comum',
        isSuperAdmin: false,
      },
      update: {},
    });

    adminToken = app.jwt.sign({ sub: ADMIN_ID });
    plainToken = app.jwt.sign({ sub: PLAIN_ID });
  });

  // A limpeza CONSULTA o banco em vez de confiar numa lista alimentada pelas
  // respostas esperadas: um teste que falhe no meio (ou um 201 inesperado)
  // ainda deixa clube criado, e este afterAll o encontra pelo membership dos
  // usuários do fixture. É este formato que deve ser copiado.
  afterAll(async () => {
    const memberships = await prisma.membership.findMany({
      where: { userId: { in: [ADMIN_ID, PLAIN_ID] } },
      select: { id: true, clubId: true },
    });
    const clubIds = [...new Set(memberships.map((m) => m.clubId))];
    const allMemberships = await prisma.membership.findMany({
      where: { clubId: { in: clubIds } },
      select: { id: true },
    });

    await removeFixtures({
      membershipIds: allMemberships.map((m) => m.id),
      clubIds,
      userIds: [ADMIN_ID, PLAIN_ID],
    });
    await prisma.$disconnect();
    await app.close();
  });

  it('lets a super-admin create a club, with the OWNER membership in the database', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/clubs',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Clube do Casal' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ id: string; name: string; status: string }>();
    expect(body.name).toBe('Clube do Casal');
    expect(body.status).toBe('ACTIVE');

    const membership = await prisma.membership.findFirst({
      where: { clubId: body.id },
    });
    expect(membership?.userId).toBe(ADMIN_ID);
    expect(membership?.role).toBe('OWNER');
    expect(membership?.status).toBe('ACTIVE');
  });

  it('serializes the dates as ISO strings', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/clubs',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Clube das Datas', timezone: 'Europe/Lisbon' },
    });

    const body = response.json<{
      id: string;
      timezone: string;
      createdAt: string;
      archivedAt: string | null;
    }>();
    expect(body.timezone).toBe('Europe/Lisbon');
    expect(body.archivedAt).toBeNull();
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
  });

  it('answers 403 for a user who is not a super-admin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/clubs',
      headers: { authorization: `Bearer ${plainToken}` },
      payload: { name: 'Clube Proibido' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('answers 401 without a token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/clubs',
      payload: { name: 'Clube Sem Token' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('answers 400 for an empty name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/clubs',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: '' },
    });

    expect(response.statusCode).toBe(400);
  });

  /**
   * `GET /clubs/:clubId/members` — Tarefa 26a.
   *
   * Fixtures PRÓPRIOS, com prefixo próprio (`t26a`) e limpeza própria: o
   * `afterAll` de fora recolhe os clubes pelos memberships do ADMIN e do PLAIN,
   * e nenhum destes usuários é um deles.
   */
  describe('GET /clubs/:clubId/members', () => {
    const MEMBERS_CLUB_ID = prefixedId('t26a', 'members-club');
    const OTHER_CLUB_ID = prefixedId('t26a', 'members-otherclub');
    const ANA_ID = prefixedId('t26a', 'members-ana');
    const NO_NAME_ID = prefixedId('t26a', 'members-sem-nome');
    const LEFT_ID = prefixedId('t26a', 'members-saiu');
    const OUTSIDER_ID = prefixedId('t26a', 'members-outsider');
    const ANA_EMAIL = prefixedEmail('t26a', 'members-ana');
    // Ids de membership com o MESMO prefixo dos outros fixtures, para a
    // varredura por `t26a-` no fim da suíte alcançar tudo o que eu criei.
    const MS_ANA_ID = prefixedId('t26a', 'ms-ana');
    const MS_NO_NAME_ID = prefixedId('t26a', 'ms-sem-nome');
    const MS_LEFT_ID = prefixedId('t26a', 'ms-saiu');
    const MS_OUTSIDER_ID = prefixedId('t26a', 'ms-outsider');

    let anaToken: string;
    let outsiderToken: string;

    interface MemberBody {
      userId: string;
      name: string | null;
      role: string;
      status: string;
    }

    beforeAll(async () => {
      for (const [id, name, email] of [
        [ANA_ID, 'Ana', ANA_EMAIL],
        // Sem nome: prova ponta a ponta que o `null` atravessa e que o backend
        // não inventa fallback (regra 6).
        [NO_NAME_ID, null, prefixedEmail('t26a', 'members-sem-nome')],
        [LEFT_ID, 'Carla', prefixedEmail('t26a', 'members-saiu')],
        [OUTSIDER_ID, 'Dora', prefixedEmail('t26a', 'members-outsider')],
      ] as const) {
        await prisma.user.upsert({
          where: { id },
          create: { id, email, name },
          update: {},
        });
      }

      for (const id of [MEMBERS_CLUB_ID, OTHER_CLUB_ID]) {
        await prisma.club.upsert({
          where: { id },
          create: { id, name: 'Clube dos Nomes' },
          update: {},
        });
      }

      for (const [id, userId, clubId, role, status] of [
        [MS_ANA_ID, ANA_ID, MEMBERS_CLUB_ID, 'OWNER', 'ACTIVE'],
        [MS_NO_NAME_ID, NO_NAME_ID, MEMBERS_CLUB_ID, 'MEMBER', 'ACTIVE'],
        // Quem SAIU: membership arquivado, e ainda assim o nome volta na
        // lista — é a razão de existir da fatia (ADR 0002, decisão A).
        [MS_LEFT_ID, LEFT_ID, MEMBERS_CLUB_ID, 'MEMBER', 'ARCHIVED'],
        // O de fora tem conta e é OWNER de OUTRO clube: só não deste.
        [MS_OUTSIDER_ID, OUTSIDER_ID, OTHER_CLUB_ID, 'OWNER', 'ACTIVE'],
      ] as const) {
        await prisma.membership.upsert({
          where: { id },
          create: { id, userId, clubId, role, status },
          update: { role, status },
        });
      }

      anaToken = app.jwt.sign({ sub: ANA_ID });
      outsiderToken = app.jwt.sign({ sub: OUTSIDER_ID });
    });

    // A limpeza CONSULTA o banco (§6.6), na ordem que respeita as FKs.
    afterAll(async () => {
      const membershipsOfClubs = await prisma.membership.findMany({
        where: { clubId: { in: [MEMBERS_CLUB_ID, OTHER_CLUB_ID] } },
        select: { id: true },
      });

      await removeFixtures({
        membershipIds: membershipsOfClubs.map((m) => m.id),
        clubIds: [MEMBERS_CLUB_ID, OTHER_CLUB_ID],
        userIds: [ANA_ID, NO_NAME_ID, LEFT_ID, OUTSIDER_ID],
      });
    });

    it('gives an active member the whole club, with the member who left and their name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/clubs/${MEMBERS_CLUB_ID}/members`,
        headers: { authorization: `Bearer ${anaToken}` },
      });

      expect(response.statusCode).toBe(200);
      // Nome crescente com os nulos no fim (regra 9), ponta a ponta.
      expect(response.json<MemberBody[]>()).toEqual([
        { userId: ANA_ID, name: 'Ana', role: 'OWNER', status: 'ACTIVE' },
        { userId: LEFT_ID, name: 'Carla', role: 'MEMBER', status: 'ARCHIVED' },
        { userId: NO_NAME_ID, name: null, role: 'MEMBER', status: 'ACTIVE' },
      ]);
    });

    /*
      ⚠️ Regra 7 ponta a ponta: o `response` schema é que CORTA, e é isso que
      faz dele fronteira de segurança e não decoração (§6.1).

      A varredura é sobre o CORPO CRU e não sobre as chaves: um `email` ou um
      `passwordHash` que escapasse dentro de um objeto aninhado passaria por uma
      checagem de `Object.keys` no primeiro nível.
    */
    it('never lets an email or a password hash out', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/clubs/${MEMBERS_CLUB_ID}/members`,
        headers: { authorization: `Bearer ${anaToken}` },
      });

      expect(response.payload).not.toContain('@');
      expect(response.payload).not.toContain(ANA_EMAIL);
      expect(response.payload.toLowerCase()).not.toContain('password');
      expect(response.payload).not.toContain('isSuperAdmin');
      for (const member of response.json<MemberBody[]>()) {
        expect(Object.keys(member).sort()).toEqual([
          'name',
          'role',
          'status',
          'userId',
        ]);
      }
    });

    /*
      ⚠️ O CORTE DE TENANT, na forma nova do §7.4 que a Tarefa 24 descobriu: o
      Fastify responde 404 para rota INEXISTENTE, então um teste de 404 sem
      precondição fica verde com a rota nem escrita. A precondição é a mesma URL
      atendendo quem PODE, no mesmo teste.
    */
    it('answers 404 for a member of another club, on a URL that answers 200 for a member of this one', async () => {
      const legitimate = await app.inject({
        method: 'GET',
        url: `/clubs/${MEMBERS_CLUB_ID}/members`,
        headers: { authorization: `Bearer ${anaToken}` },
      });
      expect(legitimate.statusCode).toBe(200);
      expect(legitimate.json<MemberBody[]>()).toHaveLength(3);

      const outsider = await app.inject({
        method: 'GET',
        url: `/clubs/${MEMBERS_CLUB_ID}/members`,
        headers: { authorization: `Bearer ${outsiderToken}` },
      });

      // 404 e NÃO 403: não confirmamos a existência de um clube que não é da
      // pessoa. → ADR 0005.
      expect(outsider.statusCode).toBe(404);
      expect(outsider.payload).not.toContain('Ana');
    });

    it('answers 401 without a token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/clubs/${MEMBERS_CLUB_ID}/members`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // Nenhum handler lê o tenant do corpo: o Zod descarta a chave e o ator
  // continua sendo o `sub` do token.
  it('ignores an actorUserId smuggled in the body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/clubs',
      headers: { authorization: `Bearer ${plainToken}` },
      payload: { name: 'Clube Injetado', actorUserId: ADMIN_ID },
    });

    // Se o corpo tivesse vencido o JWT, isto seria 201.
    expect(response.statusCode).toBe(403);
  });
});
