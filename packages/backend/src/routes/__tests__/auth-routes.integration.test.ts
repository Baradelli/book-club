import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildServer } from '../../http/server';
import {
  prefixedEmail,
  prefixedId,
  prisma,
  removeFixtures,
} from '../../repositories/__tests__/_db';
import { BcryptPasswordHasher } from '../../repositories/bcrypt-password-hasher';

const USER_ID = prefixedId('t04', 'auth-user');
const EMAIL = prefixedEmail('t04', 'auth');
const PASSWORD = 'senha-forte-123';

describe('auth routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({ logger: false });
    await app.ready();

    const hasher = new BcryptPasswordHasher();
    await prisma.user.upsert({
      where: { id: USER_ID },
      create: {
        id: USER_ID,
        email: EMAIL,
        name: 'Maria Auth',
        passwordHash: await hasher.hash(PASSWORD),
      },
      update: {},
    });
  });

  afterAll(async () => {
    await removeFixtures({ userIds: [USER_ID] });
    await prisma.$disconnect();
    await app.close();
  });

  it('GET /health answers ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('serves the Swagger UI at /docs', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs' });

    // O swagger-ui redireciona /docs -> /docs/static/index.html
    expect([200, 302]).toContain(response.statusCode);
  });

  it('logs in with the right credentials', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL, password: PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    const body: unknown = response.json();
    expect(body).toEqual({ token: expect.any(String) });
  });

  it('rejects a wrong password with 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL, password: 'senha-errada' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects an unknown email with 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ninguem-t04@exemplo.test', password: PASSWORD },
    });

    expect(response.statusCode).toBe(401);
  });

  // O ponto: de fora não se distingue "conta não existe" de "senha errada".
  it('answers wrong password and unknown email with the identical body', async () => {
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL, password: 'senha-errada' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ninguem-t04@exemplo.test', password: PASSWORD },
    });

    expect(wrongPassword.statusCode).toBe(unknownEmail.statusCode);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
    expect(wrongPassword.body).toBe(unknownEmail.body);
  });

  it('rejects a body without password with 400 (Zod at the edge)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a body whose email has no shape with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nao-e-email', password: PASSWORD },
    });

    expect(response.statusCode).toBe(400);
  });

  describe('POST /auth/refresh', () => {
    it('returns a fresh token for a valid one', async () => {
      const token = app.jwt.sign({ sub: USER_ID });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ token: expect.any(String) });
    });

    it('answers 401 without an authorization header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
      });

      expect(response.statusCode).toBe(401);
    });

    it('answers 401 for a garbage token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { authorization: 'Bearer nao-e-um-token' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // O escopo autenticado é um plugin encapsulado: /me está dentro dele.
  describe('GET /me', () => {
    it('answers 401 without a token', async () => {
      const response = await app.inject({ method: 'GET', url: '/me' });

      expect(response.statusCode).toBe(401);
    });

    // Token assinado para uma conta que não existe: 401, para o front
    // deslogar. NÃO é 404 — e o 404 do corte de tenant continua 404, provado
    // em invite-routes ("belongs to another club").
    it('answers 401 for a token whose user does not exist', async () => {
      const staleToken = app.jwt.sign({
        sub: prefixedId('t04', 'auth-fantasma'),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { authorization: `Bearer ${staleToken}` },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('returns the session data with a valid token', async () => {
      const token = app.jwt.sign({ sub: USER_ID });

      const response = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        id: USER_ID,
        email: EMAIL,
        name: 'Maria Auth',
        isSuperAdmin: false,
        clubs: [],
      });
    });
  });
});
