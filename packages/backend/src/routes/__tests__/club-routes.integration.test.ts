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
