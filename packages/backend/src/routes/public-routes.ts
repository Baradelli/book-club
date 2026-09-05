import {
  type AcceptInviteResponse,
  acceptInviteResponseSchema,
  acceptInviteSchema,
  errorSchema,
  inviteCodeParamsSchema,
  type LoginResponse,
  loginResponseSchema,
  loginSchema,
} from '@clube/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { handleDomainError } from '../http/handle-domain-error';
import { buildRepositories } from '../http/repositories';
import { TOKEN_TTL } from '../http/token';
import { BcryptPasswordHasher } from '../repositories/bcrypt-password-hasher';
import {
  AcceptInvite,
  type AcceptInviteOutput,
} from '../usecases/accept-invite';
import { AuthenticateUser } from '../usecases/authenticate-user';

function toLoginResponse(token: string): LoginResponse {
  return { token };
}

function toAcceptResponse(
  result: AcceptInviteOutput,
  token: string,
): AcceptInviteResponse {
  return { token, clubId: result.clubId };
}

export const publicRoutes: FastifyPluginAsyncZod<{
  prisma: PrismaClient;
}> = async (app, options) => {
  const repos = buildRepositories(options.prisma);
  const hasher = new BcryptPasswordHasher();

  const authenticateUser = new AuthenticateUser(repos.users, hasher);
  const acceptInvite = new AcceptInvite(
    repos.invites,
    repos.users,
    repos.memberships,
    repos.clubs,
    hasher,
    repos.settings,
  );

  // A assinatura do token é da borda: o UseCase devolve só o userId.
  function signToken(userId: string): string {
    return app.jwt.sign({ sub: userId }, { expiresIn: TOKEN_TTL });
  }

  app.post(
    '/auth/login',
    {
      schema: {
        summary: 'Autentica e devolve o token',
        body: loginSchema,
        response: {
          200: loginResponseSchema,
          400: errorSchema,
          401: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const { userId } = await authenticateUser.execute(req.body);
        return reply.status(200).send(toLoginResponse(signToken(userId)));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  // Fica no escopo público e chama jwtVerify no próprio handler, para
  // devolver um 401 limpo em vez de ser cortada por um hook.
  app.post(
    '/auth/refresh',
    {
      schema: {
        summary: 'Renova o token da sessão',
        response: { 200: loginResponseSchema, 401: errorSchema },
      },
    },
    async (req, reply) => {
      try {
        await req.jwtVerify();
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      return reply.status(200).send(toLoginResponse(signToken(req.user.sub)));
    },
  );

  app.post(
    '/invites/:code/accept',
    {
      schema: {
        summary: 'Aceita um convite e entra no clube',
        params: inviteCodeParamsSchema,
        body: acceptInviteSchema,
        response: {
          201: acceptInviteResponseSchema,
          400: errorSchema,
          404: errorSchema,
          409: errorSchema,
          410: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const result = await acceptInvite.execute({
          ...req.body,
          code: req.params.code,
        });
        return reply
          .status(201)
          .send(toAcceptResponse(result, signToken(result.user.id)));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );
};
