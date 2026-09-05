import {
  type ClubResponse,
  clubResponseSchema,
  createClubSchema,
  errorSchema,
} from '@clube/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { Club } from '../domain/club';
import { handleDomainError } from '../http/handle-domain-error';
import { buildRepositories } from '../http/repositories';
import { CreateClub } from '../usecases/create-club';

function toResponse(club: Club): ClubResponse {
  return {
    id: club.id,
    name: club.name,
    timezone: club.timezone,
    status: club.status,
    archivedAt: club.archivedAt === null ? null : club.archivedAt.toISOString(),
    createdAt: club.createdAt.toISOString(),
  };
}

export const clubRoutes: FastifyPluginAsyncZod<{
  prisma: PrismaClient;
}> = async (app, options) => {
  const repos = buildRepositories(options.prisma);
  const createClub = new CreateClub(
    repos.users,
    repos.clubs,
    repos.memberships,
  );

  app.post(
    '/clubs',
    {
      schema: {
        summary: 'Cria um clube (exige super-admin)',
        body: createClubSchema,
        response: {
          201: clubResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        // O tenant vem SEMPRE do JWT. req.body é o objeto já validado pelo
        // Zod, que descarta chaves não declaradas.
        const { club } = await createClub.execute({
          ...req.body,
          actorUserId: req.user.sub,
        });
        return reply.status(201).send(toResponse(club));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );
};
