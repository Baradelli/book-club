import {
  clubIdParamsSchema,
  createInviteSchema,
  errorSchema,
  type InviteResponse,
  inviteResponseSchema,
} from '@clube/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { Invite } from '../domain/invite';
import { handleDomainError } from '../http/handle-domain-error';
import { buildRepositories } from '../http/repositories';
import { RandomCodeGenerator } from '../repositories/random-code-generator';
import { AssertMembership } from '../usecases/assert-membership';
import { CreateInvite } from '../usecases/create-invite';

function toResponse(invite: Invite): InviteResponse {
  return {
    id: invite.id,
    clubId: invite.clubId,
    code: invite.code,
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString(),
    usedAt: invite.usedAt === null ? null : invite.usedAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  };
}

export const inviteRoutes: FastifyPluginAsyncZod<{
  prisma: PrismaClient;
}> = async (app, options) => {
  const repos = buildRepositories(options.prisma);
  const createInvite = new CreateInvite(
    new AssertMembership(repos.memberships),
    repos.clubs,
    repos.invites,
    new RandomCodeGenerator(),
  );

  app.post(
    '/clubs/:clubId/invites',
    {
      schema: {
        summary: 'Cria um convite do clube (exige OWNER ou ADMIN)',
        params: clubIdParamsSchema,
        body: createInviteSchema,
        response: {
          201: inviteResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          // Sem membership ativo o clube "não existe" para a pessoa.
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const invite = await createInvite.execute({
          ...req.body,
          clubId: req.params.clubId,
          actorUserId: req.user.sub,
        });
        return reply.status(201).send(toResponse(invite));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );
};
