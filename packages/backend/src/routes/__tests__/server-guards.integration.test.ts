import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildServer } from '../../http/server';

describe('server guards', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // O `response` schema é a fronteira que impede vazar campo privado. Sem
  // esta guarda, esquecê-lo não é pego por tsc, eslint nem pelos testes.
  describe('every route must declare a response schema', () => {
    it('refuses to boot a route without any response schema', async () => {
      const app = await buildServer({ logger: false, prisma });
      app.register(async (api) => {
        api.get('/sem-schema', async () => ({ segredo: 'vazou' }));
      });

      await expect(app.ready()).rejects.toThrow(
        /must declare a response schema/,
      );

      await app.close();
    });

    it('refuses to boot a route whose response declares only error statuses', async () => {
      const app = await buildServer({ logger: false, prisma });
      app.register(async (api) => {
        api.get(
          '/so-erro',
          { schema: { response: { 400: z.object({ error: z.string() }) } } },
          async () => ({ segredo: 'vazou' }),
        );
      });

      await expect(app.ready()).rejects.toThrow(
        /must declare a response schema/,
      );

      await app.close();
    });

    it('boots a route that declares a success response schema', async () => {
      const app = await buildServer({ logger: false, prisma });
      app.register(async (api) => {
        api.get(
          '/com-schema',
          { schema: { response: { 200: z.object({ ok: z.boolean() }) } } },
          async () => ({ ok: true }),
        );
      });

      await expect(app.ready()).resolves.toBeDefined();

      const response = await app.inject({ method: 'GET', url: '/com-schema' });
      expect(response.statusCode).toBe(200);

      await app.close();
    });

    // A guarda não pode ter quebrado o boot normal: o servidor real registra
    // /docs (isento) e o preflight OPTIONS do cors.
    it('boots the real server, /docs and cors preflight included', async () => {
      const app = await buildServer({ logger: false, prisma });

      await expect(app.ready()).resolves.toBeDefined();
      expect(
        (await app.inject({ method: 'GET', url: '/docs/json' })).statusCode,
      ).toBe(200);

      await app.close();
    });
  });

  // O buraco que sobrava: o serializer é POR STATUS, então um status não
  // enumerado saía CRU mesmo com `response` declarado.
  describe('undeclared status codes cannot leak', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = await buildServer({ logger: false, prisma });
      app.register(async (api) => {
        // Declara SÓ 200 e responde 201: era aqui que vazava.
        //
        // O `as 200` é uma mentira deliberada para o TypeScript. O type
        // provider normalmente PROÍBE `reply.status(201)` numa rota que
        // declara só 200 — o que é uma segunda camada de proteção, e boa.
        // Mas ele só vê o `reply.status()` literal do handler: um status
        // vindo de hook, de erro, ou de código não tipado escapa. A rede de
        // runtime existe para esses, e é ela que este teste exercita.
        api.get(
          '/status-nao-declarado',
          { schema: { response: { 200: z.object({ id: z.string() }) } } },
          async (_req, reply) =>
            reply.status(201 as 200).send({
              id: 'x',
              passwordHash: 'HASH.SECRETO',
            } as {
              id: string;
            }),
        );
      });
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('does not leak an undeclared field on an undeclared status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/status-nao-declarado',
      });

      expect(response.statusCode).toBe(201);
      expect(response.body).not.toContain('passwordHash');
      expect(response.body).not.toContain('HASH.SECRETO');
      // Fail-safe: envelope genérico em vez do objeto cru.
      expect(response.json()).toEqual({ error: expect.any(String) });
    });

    // O coringa '2xx' é recusado no boot COM O MOTIVO: o
    // fastify-type-provider-zod não o compila e a rota devolveria 500 em todo
    // sucesso (medido). Recusar é mais seguro que deixar bootar.
    it('refuses the 2xx wildcard at boot, explaining why', async () => {
      const wildcardApp = await buildServer({ logger: false, prisma });
      wildcardApp.register(async (api) => {
        api.get(
          '/coringa-2xx',
          { schema: { response: { '2xx': z.object({ id: z.string() }) } } },
          async () => ({ id: 'y' }),
        );
      });

      await expect(wildcardApp.ready()).rejects.toThrow(
        /wildcard status, which fastify-type-provider-zod cannot compile/,
      );

      await wildcardApp.close();
    });
  });

  // Todo erro sai no formato do errorSchema, inclusive os do próprio Fastify.
  describe('every error uses the errorSchema envelope', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = await buildServer({ logger: false, prisma });
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('answers a 413 as { error }', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: `{"email":"a@b.com","password":"${'x'.repeat(1024 * 1024)}"}`,
      });

      expect(response.statusCode).toBe(413);
      expect(response.json()).toEqual({ error: 'Payload Too Large' });
      expect(response.body).not.toContain('FST_ERR');
      expect(response.body).not.toContain('statusCode');
    });

    it('answers malformed json on /auth/refresh as { error }', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'content-type': 'application/json' },
        payload: '{isto nao e json',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Bad Request' });
      expect(response.body).not.toContain('FST_ERR');
    });
  });

  // Erro de validação diz QUAL campo falhou; nada disso fora do 400.
  describe('validation details', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = await buildServer({ logger: false, prisma });
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('names the missing field on a 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'maria@exemplo.com' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{
        error: string;
        details?: { path: string; message: string }[];
      }>();
      expect(body.details).toBeDefined();
      expect(body.details?.map((d) => d.path)).toContain('password');
    });

    it('names each invalid field when more than one fails', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'nao-e-email', password: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{
        details?: { path: string; message: string }[];
      }>();
      const paths = body.details?.map((d) => d.path) ?? [];
      expect(paths).toContain('email');
      expect(paths).toContain('password');
    });

    it('never sends details outside the 400 class', async () => {
      const notFound = await app.inject({
        method: 'POST',
        url: '/invites/CODIGOINEXIST/accept',
        payload: { email: 'a@b.com', password: 'senha-forte-123' },
      });

      expect(notFound.statusCode).toBe(404);
      expect(notFound.json()).toEqual({ error: 'Not found' });
      expect(notFound.body).not.toContain('details');
    });

    it('sends no details for malformed json (not a validation error)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: '{isto nao e json',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'Bad Request' });
    });
  });

  // O serializador do Zod corta o que o schema não declara — é isso que a
  // guarda acima protege. Aqui provamos o corte em si.
  describe('the Zod serializer strips undeclared fields', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = await buildServer({ logger: false, prisma });
      app.register(async (api) => {
        api.get(
          '/com-vazamento',
          { schema: { response: { 200: z.object({ id: z.string() }) } } },
          async () => ({ id: 'x', passwordHash: 'HASH.SECRETO' }),
        );
      });
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('does not send a field that the schema omits', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/com-vazamento',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ id: 'x' });
      expect(response.body).not.toContain('passwordHash');
      expect(response.body).not.toContain('HASH.SECRETO');
    });
  });

  // /auth/refresh se propõe a devolver 401 limpo; o parser de JSON estourava
  // 400 antes disso quando o corpo vinha vazio.
  describe('empty JSON body', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = await buildServer({ logger: false, prisma });
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('answers 401 on /auth/refresh with a json content-type and no body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'content-type': 'application/json' },
        payload: '',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('still answers 400 where the body is required', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: '',
      });

      expect(response.statusCode).toBe(400);
    });

    it('answers 400 for malformed json', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: '{isto nao e json',
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
