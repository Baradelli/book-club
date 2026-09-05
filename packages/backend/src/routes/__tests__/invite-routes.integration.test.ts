import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildServer } from '../../http/server';
import {
  prefixedEmail,
  prefixedId,
  prisma,
  removeFixtures,
} from '../../repositories/__tests__/_db';

const CLUB_ID = prefixedId('t04', 'invite-club');
const OTHER_CLUB_ID = prefixedId('t04', 'invite-otherclub');
const OWNER_ID = prefixedId('t04', 'invite-owner');
const MEMBER_ID = prefixedId('t04', 'invite-member');
const OUTSIDER_ID = prefixedId('t04', 'invite-outsider');
const EXPIRED_INVITE_ID = prefixedId('t04', 'invite-expired');
const EXPIRED_CODE = 'T04EXPIRED01';

// Tudo o que o próprio teste cria e precisa apagar depois.
const inviteIds: string[] = [EXPIRED_INVITE_ID];
const membershipIds: string[] = [];
const userIds: string[] = [OWNER_ID, MEMBER_ID, OUTSIDER_ID];
// E-mails que os aceites criam: rastreados um a um para a limpeza não
// alcançar fixture de outro arquivo de teste.
const acceptedEmails: string[] = [];

function anAcceptedEmail(prefix: string): string {
  const email = prefixedEmail('t04', prefix);
  acceptedEmails.push(email);
  return email;
}

async function seedUser(id: string, prefix: string): Promise<void> {
  await prisma.user.upsert({
    where: { id },
    create: { id, email: prefixedEmail('t04', prefix), name: prefix },
    update: {},
  });
}

async function seedMembership(
  id: string,
  userId: string,
  clubId: string,
  role: 'OWNER' | 'ADMIN' | 'MEMBER',
): Promise<void> {
  await prisma.membership.upsert({
    where: { id },
    create: { id, userId, clubId, role, status: 'ACTIVE' },
    update: {},
  });
  membershipIds.push(id);
}

describe('invite routes', () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let memberToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    app = await buildServer({ logger: false });
    await app.ready();

    for (const [id, prefix] of [
      [OWNER_ID, 'invite-owner'],
      [MEMBER_ID, 'invite-member'],
      [OUTSIDER_ID, 'invite-outsider'],
    ] as const) {
      await seedUser(id, prefix);
    }

    for (const [id, name] of [
      [CLUB_ID, 'Clube do Convite'],
      [OTHER_CLUB_ID, 'Clube de Outra Gente'],
    ] as const) {
      await prisma.club.upsert({
        where: { id },
        create: { id, name },
        update: {},
      });
    }

    await seedMembership(
      prefixedId('t04', 'ms-owner'),
      OWNER_ID,
      CLUB_ID,
      'OWNER',
    );
    await seedMembership(
      prefixedId('t04', 'ms-member'),
      MEMBER_ID,
      CLUB_ID,
      'MEMBER',
    );
    // O outsider é OWNER de OUTRO clube: tem conta e papel, só não neste.
    await seedMembership(
      prefixedId('t04', 'ms-outsider'),
      OUTSIDER_ID,
      OTHER_CLUB_ID,
      'OWNER',
    );

    await prisma.invite.upsert({
      where: { id: EXPIRED_INVITE_ID },
      create: {
        id: EXPIRED_INVITE_ID,
        clubId: CLUB_ID,
        code: EXPIRED_CODE,
        role: 'MEMBER',
        createdById: OWNER_ID,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      },
      update: {},
    });

    ownerToken = app.jwt.sign({ sub: OWNER_ID });
    memberToken = app.jwt.sign({ sub: MEMBER_ID });
    outsiderToken = app.jwt.sign({ sub: OUTSIDER_ID });
  });

  afterAll(async () => {
    // Recolhe o que os aceites criaram antes de apagar.
    const invitesOfClub = await prisma.invite.findMany({
      where: { clubId: { in: [CLUB_ID, OTHER_CLUB_ID] } },
      select: { id: true },
    });
    const membershipsOfClub = await prisma.membership.findMany({
      where: { clubId: { in: [CLUB_ID, OTHER_CLUB_ID] } },
      select: { id: true, userId: true },
    });
    const acceptedUsers = await prisma.user.findMany({
      where: { email: { in: acceptedEmails } },
      select: { id: true },
    });
    const settingsOfUsers = await prisma.settings.findMany({
      where: { userId: { in: acceptedUsers.map((u) => u.id) } },
      select: { id: true },
    });

    await removeFixtures({
      settingsIds: settingsOfUsers.map((s) => s.id),
      inviteIds: [
        ...new Set([...inviteIds, ...invitesOfClub.map((i) => i.id)]),
      ],
      membershipIds: [
        ...new Set([...membershipIds, ...membershipsOfClub.map((m) => m.id)]),
      ],
      clubIds: [CLUB_ID, OTHER_CLUB_ID],
      userIds: [...new Set([...userIds, ...acceptedUsers.map((u) => u.id)])],
    });
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /clubs/:clubId/invites', () => {
    it('lets the OWNER create an invite with a code', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/clubs/${CLUB_ID}/invites`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{
        id: string;
        code: string;
        role: string;
        clubId: string;
        usedAt: string | null;
      }>();
      inviteIds.push(body.id);
      expect(body.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/);
      expect(body.role).toBe('MEMBER');
      expect(body.clubId).toBe(CLUB_ID);
      expect(body.usedAt).toBeNull();
    });

    it('answers 403 for a MEMBER of the club', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/clubs/${CLUB_ID}/invites`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(403);
    });

    // O CORTE DE TENANT: a única barreira entre dois clubes. 404, não 403 —
    // não confirmamos a existência de um clube que não é da pessoa.
    it('answers 404 for a user who belongs to another club', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/clubs/${CLUB_ID}/invites`,
        headers: { authorization: `Bearer ${outsiderToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(404);
      expect(
        await prisma.invite.count({ where: { createdById: OUTSIDER_ID } }),
      ).toBe(0);
    });

    it('answers 401 without a token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/clubs/${CLUB_ID}/invites`,
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });

    it("answers 400 for role 'OWNER' in the body", async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/clubs/${CLUB_ID}/invites`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { role: 'OWNER' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('answers 400 for a fractional ttlDays', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/clubs/${CLUB_ID}/invites`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { ttlDays: 1.5 },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /invites/:code/accept', () => {
    async function createInvite(): Promise<string> {
      const response = await app.inject({
        method: 'POST',
        url: `/clubs/${CLUB_ID}/invites`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { role: 'ADMIN' },
      });
      const body = response.json<{ id: string; code: string }>();
      inviteIds.push(body.id);
      return body.code;
    }

    it('accepts the invite without a token and returns token + clubId', async () => {
      const code = await createInvite();
      const email = anAcceptedEmail('accepted');

      const response = await app.inject({
        method: 'POST',
        url: `/invites/${code}/accept`,
        payload: { email, password: 'senha-forte-123', name: 'Convidada' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ token: string; clubId: string }>();
      expect(body.clubId).toBe(CLUB_ID);
      expect(body.token).toEqual(expect.any(String));

      const created = await prisma.user.findUnique({ where: { email } });
      expect(created).not.toBeNull();
      const membership = await prisma.membership.findFirst({
        where: { userId: created?.id, clubId: CLUB_ID },
      });
      expect(membership?.role).toBe('ADMIN');
      expect(membership?.status).toBe('ACTIVE');
    });

    it('answers 410 when the same code is accepted twice', async () => {
      /*
        ⚠️ 410 E NÃO 409, e é a mudança da rodada de correção da Tarefa 15.

        Fora da classe 400 o corpo não carrega discriminador (§6.2), então o
        STATUS é o único sinal que a tela tem. Convite de uso único já usado é,
        para quem lê, a mesma frase do convite vencido — "este link não vale
        mais, peça outro" —, e é isso que o 410 diz. Deixar isto em 409 obrigava
        a tela a marcar o campo de e-mail (com `aria-invalid` num valor válido, e
        sem `role="alert"`) por causa de um convite.
      */
      const code = await createInvite();

      const first = await app.inject({
        method: 'POST',
        url: `/invites/${code}/accept`,
        payload: {
          email: anAcceptedEmail('twice-a'),
          password: 'senha-forte-123',
        },
      });
      const second = await app.inject({
        method: 'POST',
        url: `/invites/${code}/accept`,
        payload: {
          email: anAcceptedEmail('twice-b'),
          password: 'senha-forte-123',
        },
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(410);
    });

    it('answers 409 for someone who is already a member of the club', async () => {
      /*
        O OUTRO LADO DO PAR, e é ele que dá sentido ao 410 acima: sem este
        teste, mapear TODO conflito do aceite para 410 passaria verde, e a tela
        perderia o único caso em que "você já está neste clube" é a frase certa.

        Dois convites do mesmo clube, o MESMO e-mail: o primeiro aceite cria a
        pessoa e a filiação; o segundo reaproveita a conta (e-mail já cadastrado
        é o caminho de SUCESSO deste caso de uso) e bate no
        `DuplicateMembershipError`.
      */
      const email = anAcceptedEmail('already-member');
      const firstCode = await createInvite();
      const secondCode = await createInvite();

      const first = await app.inject({
        method: 'POST',
        url: `/invites/${firstCode}/accept`,
        payload: { email, password: 'senha-forte-123' },
      });
      const second = await app.inject({
        method: 'POST',
        url: `/invites/${secondCode}/accept`,
        payload: { email, password: 'senha-forte-123' },
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(409);
    });

    it('answers 410 for an expired invite', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/invites/${EXPIRED_CODE}/accept`,
        payload: {
          email: anAcceptedEmail('expired'),
          password: 'senha-forte-123',
        },
      });

      expect(response.statusCode).toBe(410);
    });

    it('answers 404 for a code that does not exist', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/invites/CODIGOINEXIST/accept',
        payload: {
          email: anAcceptedEmail('ghost'),
          password: 'senha-forte-123',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('answers 400 for a password shorter than 8 characters', async () => {
      const code = await createInvite();

      const response = await app.inject({
        method: 'POST',
        url: `/invites/${code}/accept`,
        payload: { email: anAcceptedEmail('weak'), password: 'abc' },
      });

      expect(response.statusCode).toBe(400);
    });

    // O clube aparece em /me depois do aceite — é o que o seletor consome.
    it('shows the club in GET /me after accepting', async () => {
      const code = await createInvite();
      const email = anAcceptedEmail('me-after-accept');

      const accept = await app.inject({
        method: 'POST',
        url: `/invites/${code}/accept`,
        payload: { email, password: 'senha-forte-123', name: 'Nova' },
      });
      const { token } = accept.json<{ token: string }>();

      const me = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(me.statusCode).toBe(200);
      const body = me.json<{
        email: string;
        clubs: { id: string; name: string; role: string }[];
      }>();
      expect(body.email).toBe(email);
      expect(body.clubs).toEqual([
        { id: CLUB_ID, name: 'Clube do Convite', role: 'ADMIN' },
      ]);
    });
  });
});
