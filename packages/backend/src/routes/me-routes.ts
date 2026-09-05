import { errorSchema, type MeResponse, meResponseSchema } from '@clube/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { handleDomainError } from '../http/handle-domain-error';
import { buildRepositories } from '../http/repositories';
import { GetMe, type GetMeOutput } from '../usecases/get-me';

function toResponse(result: GetMeOutput): MeResponse {
  return {
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
    isSuperAdmin: result.user.isSuperAdmin,
    clubs: result.clubs,
  };
}

export const meRoutes: FastifyPluginAsyncZod<{ prisma: PrismaClient }> = async (
  app,
  options,
) => {
  const repos = buildRepositories(options.prisma);
  const getMe = new GetMe(repos.users, repos.memberships, repos.clubs);

  app.get(
    '/me',
    {
      schema: {
        summary: 'Dados da sessão e os clubes da pessoa',
        response: {
          200: meResponseSchema,
          // Sessão de conta inexistente também cai em 401.
          401: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const result = await getMe.execute({ userId: req.user.sub });
        return reply.status(200).send(toResponse(result));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );
};
