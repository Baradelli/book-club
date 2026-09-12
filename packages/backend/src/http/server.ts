import { healthResponseSchema } from '@clube/shared';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodFastifySchemaValidationError,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { activityRoutes } from '../routes/activity-routes';
import { bookRoutes } from '../routes/book-routes';
import { clubRoutes } from '../routes/club-routes';
import { highlightRoutes } from '../routes/highlight-routes';
import { inviteRoutes } from '../routes/invite-routes';
import { meRoutes } from '../routes/me-routes';
import { noteRoutes } from '../routes/note-routes';
import { notificationRoutes } from '../routes/notification-routes';
import { publicRoutes } from '../routes/public-routes';
import { readingLogRoutes } from '../routes/reading-log-routes';
import { settingsRoutes } from '../routes/settings-routes';
import { publicMessageForStatus } from './handle-domain-error';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export interface BuildServerOptions {
  logger?: boolean;
  /**
   * Cliente injetável. Sem isto cada arquivo de teste de rota abriria o seu
   * pool contra o mesmo Postgres, e com dezenas de arquivos isso passa do
   * max_connections.
   */
  prisma?: PrismaClient;
}

/**
 * Rotas isentas da exigência de `response` schema, por prefixo. Só o que não
 * é nosso: o @fastify/swagger-ui registra a UI e seus assets sob /docs.
 */
const RESPONSE_SCHEMA_EXEMPT_PREFIXES = ['/docs'] as const;

/**
 * O `response` schema NÃO é decoração: é o serializador do Zod que corta
 * qualquer campo não declarado, e é o que impede um `passwordHash` de vazar
 * quando um `toResponse` erra. Uma rota sem `response` devolve o objeto cru —
 * e isso não é pego por tsc, eslint nem pelos testes das outras rotas.
 *
 * Então a ausência quebra o BOOT, alto e cedo, em vez de virar vazamento
 * silencioso na Tarefa 05.
 */
function isSchemaExemptUrl(url: string): boolean {
  return RESPONSE_SCHEMA_EXEMPT_PREFIXES.some(
    (prefix) => url === prefix || url.startsWith(`${prefix}/`),
  );
}

/**
 * O corpo já é o envelope de erro `{ error }` (com `details` opcional)? Um
 * envelope não carrega objeto de domínio, então pode sair sem serializer —
 * e é isso que evita a rede de segurança abaixo recursar sobre si mesma.
 */
function isErrorEnvelope(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  const keys = Object.keys(payload);
  if (keys.length === 0) return false;
  if (!keys.every((key) => key === 'error' || key === 'details')) return false;
  return typeof (payload as { error?: unknown }).error === 'string';
}

function assertDeclaresResponseSchema(route: RouteOptions): void {
  const methods = Array.isArray(route.method) ? route.method : [route.method];

  // OPTIONS: o @fastify/cors registra o preflight, que não é rota nossa.
  if (methods.every((method) => method === 'OPTIONS')) return;

  if (isSchemaExemptUrl(route.url)) return;

  const response: unknown = route.schema?.response;
  const statuses =
    typeof response === 'object' && response !== null
      ? Object.keys(response)
      : [];

  // O coringa '2xx' PARECE a declaração ampla que fecharia o buraco de
  // "status não enumerado", mas o fastify-type-provider-zod 4.0.2 não o
  // compila: a rota boota e devolve 500 (FST_ERR_RESPONSE_SERIALIZATION) em
  // TODA resposta de sucesso, mesmo com o corpo exato do schema. Medido.
  // Então ele é recusado no boot, com o motivo — quem o tentar recebe a
  // instrução em vez de um 500 em produção. Quem fecha o buraco de status
  // não enumerado é a rede de segurança de preSerialization, abaixo.
  if (statuses.some((status) => /^\dxx$/i.test(status))) {
    throw new Error(
      `Route ${methods.join(',')} ${route.url} declares the '${statuses.find((s) => /^\dxx$/i.test(s)) ?? '2xx'}' ` +
        `wildcard status, which fastify-type-provider-zod cannot compile: the route would answer ` +
        `500 on every success. Enumerate each status instead (e.g. 200, 201).`,
    );
  }

  if (!statuses.some((status) => /^2\d\d$/.test(status))) {
    throw new Error(
      `Route ${methods.join(',')} ${route.url} must declare a response schema ` +
        `for its success status. Without it the Zod serializer does not run and ` +
        `the handler's raw object is sent, which is how private fields leak.`,
    );
  }
}

/**
 * Status HTTP que o erro declara, quando declara. Erro sem `statusCode` (ou
 * com um que não é de cliente) é falha nossa: 500.
 */
function httpStatusOf(error: unknown): number {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    error.statusCode >= 400
  ) {
    return error.statusCode;
  }
  return 500;
}

/** `/password` -> `password`; `/planItems/0/title` -> `planItems.0.title`. */
function toDetail(issue: ZodFastifySchemaValidationError): {
  path: string;
  message: string;
} {
  return {
    path: issue.instancePath.replace(/^\//, '').replace(/\//g, '.'),
    message: issue.message,
  };
}

/**
 * A raiz de composição. Devolve o app SEM escutar — é isso que permite
 * `app.inject()` nos testes de integração. Quem chama `listen` é o main.ts.
 */
export async function buildServer(
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
  }).withTypeProvider<ZodTypeProvider>();

  const prisma = options.prisma ?? new PrismaClient();
  const ownsPrisma = options.prisma === undefined;

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Um cliente que manda `Content-Type: application/json` com corpo VAZIO
  // recebia FST_ERR_CTP_EMPTY_JSON_BODY (400) do parser, antes de a rota
  // rodar — e /auth/refresh se propõe a devolver um 401 limpo. Declarar um
  // `body` schema não resolve: o parser roda antes da validação. Então corpo
  // vazio passa a significar "sem corpo"; rota que exige corpo continua
  // dando 400, agora pelo Zod e no formato do errorSchema.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (
      _req,
      body: string,
      done: (err: Error | null, parsed?: unknown) => void,
    ) => {
      // Sem `body.trim()`: aquilo copia o corpo inteiro só para decidir se
      // está vazio. O regex falha no primeiro caractere de um corpo real, e a
      // Tarefa 14 vai elevar o bodyLimit para colar imagem no editor.
      if (body.length === 0 || /^\s*$/.test(body)) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(body));
      } catch {
        // O `statusCode` é obrigatório: sem ele o Fastify trata como falha do
        // servidor e devolve 500 para um JSON malformado do cliente.
        done(
          Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }),
          undefined,
        );
      }
    },
  );

  // Antes de qualquer registro de rota: assim nenhuma rota registrada depois
  // — inclusive num plugin de outra tarefa — escapa da exigência.
  app.addHook('onRoute', assertDeclaresResponseSchema);

  const corsEnv = process.env['CORS_ORIGIN'];
  await app.register(cors, {
    origin: corsEnv ? corsEnv.split(',').map((s) => s.trim()) : true,
  });
  await app.register(swagger, {
    openapi: { info: { title: 'Clube do Livro API', version: '0.0.0' } },
    // Sem o transform o Swagger não sabe ler os schemas Zod das rotas.
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  await app.register(jwt, {
    secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-me',
  });

  app.addHook('onClose', async () => {
    // Só desconecta o cliente que este servidor abriu: um injetado é do
    // chamador, e fechá-lo quebraria o resto da suíte dele.
    if (ownsPrisma) await prisma.$disconnect();
  });

  // Todo erro sai no formato do errorSchema. Sem isto os erros do próprio
  // Fastify (413 do bodyLimit, JSON malformado) saem no formato dele
  // (`{statusCode, code, error, message}`), quebrando o contrato `{error}`
  // que o front assume. `details` só na classe 400, e só para validação.
  app.setErrorHandler((error, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: publicMessageForStatus(400),
        details: error.validation.map(toDetail),
      });
    }

    // A resposta não passou pelo PRÓPRIO schema: é bug nosso, não do cliente.
    if (isResponseSerializationError(error)) {
      req.log.error(
        { err: error, url: req.url },
        'response did not match its own schema',
      );
      return reply.status(500).send({ error: publicMessageForStatus(500) });
    }

    const status = httpStatusOf(error);
    if (status >= 500) {
      req.log.error({ err: error, url: req.url }, 'unhandled error');
    }
    return reply.status(status).send({ error: publicMessageForStatus(status) });
  });

  // REDE DE SEGURANÇA. O serializer do Zod é POR STATUS: uma resposta cujo
  // status não está enumerado no `response` sai crua, e a guarda de boot não
  // vê isso (ela só exige que exista um status de sucesso). Aqui, se não há
  // serializer compilado para o status corrente, o corpo NÃO sai.
  //
  // Fail-safe, não fail-loud: o que está em jogo é vazamento de dado privado,
  // então é melhor o cliente receber um erro genérico do que o objeto cru.
  app.addHook('preSerialization', async (req, reply, payload: unknown) => {
    if (isSchemaExemptUrl(req.url)) return payload;
    // Envelope de erro não carrega domínio: passa, e não recursa.
    if (isErrorEnvelope(payload)) return payload;

    let hasSerializer = false;
    try {
      // A API recebe o status como string.
      hasSerializer =
        reply.getSerializationFunction(String(reply.statusCode)) !== undefined;
    } catch {
      hasSerializer = false;
    }
    if (hasSerializer) return payload;

    req.log.error(
      {
        url: req.url,
        method: req.method,
        statusCode: reply.statusCode,
      },
      'no response schema for this status; payload replaced to avoid leaking undeclared fields',
    );
    return { error: publicMessageForStatus(reply.statusCode) };
  });

  app.get(
    '/health',
    {
      schema: {
        summary: 'Sonda de saúde',
        response: { 200: healthResponseSchema },
      },
    },
    async () => ({ status: 'ok' }) as const,
  );

  // Público: login, refresh e aceite de convite.
  await app.register(publicRoutes, { prisma });

  // Escopo autenticado ENCAPSULADO: o hook vale só dentro deste plugin, então
  // uma rota pública fica de fora por construção, não por alguém lembrar.
  await app.register(async (api) => {
    api.addHook('onRequest', async (req, reply) => {
      try {
        await req.jwtVerify();
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    });

    await api.register(meRoutes, { prisma });
    await api.register(clubRoutes, { prisma });
    await api.register(inviteRoutes, { prisma });
    await api.register(bookRoutes, { prisma });
    await api.register(noteRoutes, { prisma });
    // DENTRO do escopo autenticado: as quatro rotas de grifo nasceriam
    // PÚBLICAS se o registro fosse para fora dele, e nada mais no projeto
    // notaria — quem acusa é o bloco `authentication` do
    // `highlight-routes.integration.test.ts`.
    await api.register(highlightRoutes, { prisma });
    // DENTRO do escopo autenticado, pelo mesmo motivo das rotas de grifo: as
    // duas rotas de leitura nasceriam PÚBLICAS se o registro fosse para fora
    // dele, e nada mais no projeto notaria — quem acusa é o bloco
    // `authentication` do `reading-log-routes.integration.test.ts`.
    await api.register(readingLogRoutes, { prisma });
    // DENTRO do escopo autenticado, pelo mesmo motivo das rotas de grifo e de
    // leitura: o feed do clube nasceria PÚBLICO se o registro fosse para fora
    // dele, e nada mais no projeto notaria — quem acusa é o bloco
    // `authentication` do `activity-routes.integration.test.ts`.
    await api.register(activityRoutes, { prisma });
    // DENTRO do escopo autenticado, pelo mesmo motivo das rotas de grifo, de
    // leitura e do feed: as preferências da pessoa nasceriam PÚBLICAS se o
    // registro fosse para fora dele, e nada mais no projeto notaria — quem
    // acusa é o bloco `authentication` do
    // `settings-routes.integration.test.ts`.
    //
    // ⚠️ E estas duas rotas NÃO têm `clubId` nem `assertMembership` (decisão A
    // da Tarefa 36): o `Settings` é do USUÁRIO, e o corte de tenant é o próprio
    // JWT. Ou seja, aqui o escopo autenticado é a ÚNICA barreira — motivo a
    // mais para o registro estar dentro dele.
    await api.register(settingsRoutes, { prisma });
    // DENTRO do escopo autenticado, e pelo mesmo motivo. ⚠️ Aqui o preço de
    // errar tem duas faces: um `GET /notifications/config` público entregaria a
    // configuração do push a qualquer um, e um `POST` público deixaria qualquer
    // um inscrever aparelho sem dono — que estouraria na FK, em 500. Quem acusa
    // é o bloco `authentication` do
    // `notification-routes.integration.test.ts`.
    await api.register(notificationRoutes, { prisma });
  });

  return app;
}
