import {
  clubIdParamsSchema,
  clubMembersResponseSchema,
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
import { AssertMembership } from '../usecases/assert-membership';
import { CreateClub } from '../usecases/create-club';
import { ListClubMembers } from '../usecases/list-club-members';

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
  const listClubMembers = new ListClubMembers(
    new AssertMembership(repos.memberships),
    repos.memberships,
    repos.users,
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

  /**
   * Quem é o clube: os nomes por trás dos `userId` do acervo.
   *
   * Sub-recurso de clube, e mora aqui pelo mesmo motivo do `POST /clubs`: o
   * arquivo tem meia centena de linhas e `members` é do clube.
   *
   * **Sem 403 declarado, e isso é decisão** (regra 11): a leitura não exige
   * papel, porque ler quem é o clube é atribuição de autoria e não
   * administração (ADR 0002). Declarar status que o handler não produz faz o
   * OpenAPI mentir para a tela que o lê.
   *
   * ⚠️ **O 400 está declarado, e a primeira versão desta rota dizia que ele era
   * impossível.** A frase era *"o único parâmetro é o `:clubId` da rota, que o
   * Fastify nunca casa vazio"*, e ela é **falsa**: medido na rodada de correção
   * da Tarefa 26a, `GET /clubs//members` com token responde
   * `400 {"error":"Bad Request","details":[{"path":"clubId","message":"String must contain at least 1 character(s)"}]}`
   * — o find-my-way **casa** o segmento vazio e o `z.string().min(1)` do
   * `clubIdParamsSchema` recusa. Mentir por OMISSÃO engana a tela igual: ela
   * chega nesse 400 no dia em que nenhum clube estiver selecionado e o `clubId`
   * sair vazio da URL. A varredura que trava isto para TODA rota está em
   * `routes/__tests__/server-guards.integration.test.ts`.
   *
   * O 404 cobre "clube que não existe" E "clube que não é seu", sem distinguir:
   * é o corte de tenant do ADR 0005.
   */
  app.get(
    '/clubs/:clubId/members',
    {
      schema: {
        summary: 'Lista quem é o clube (nome, papel e status de cada membro)',
        params: clubIdParamsSchema,
        response: {
          200: clubMembersResponseSchema,
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        // O tenant vem SEMPRE do JWT; o clube, da rota. Nenhum dos dois do
        // corpo — e não há corpo. → §6.3.
        const members = await listClubMembers.execute({
          clubId: req.params.clubId,
          actorUserId: req.user.sub,
        });
        // Sem `toResponse`: o `ClubMember` do UseCase já é exatamente os quatro
        // campos da resposta, e não há Date para serializar. O `response`
        // schema continua sendo a fronteira que corta o que não está declarado
        // (§6.1) — é ele que impede um campo novo no domínio de vazar sem
        // ninguém decidir.
        return reply.status(200).send(members);
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );
};
