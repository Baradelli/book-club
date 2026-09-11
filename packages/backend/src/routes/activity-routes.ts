import {
  type ActivityEventResponse,
  activityResponseSchema,
  clubIdParamsSchema,
  errorSchema,
  listActivityQuerySchema,
} from '@clube/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { ActivityEvent } from '../domain/activity-event';
import { handleDomainError } from '../http/handle-domain-error';
import { buildRepositories } from '../http/repositories';
import { AssertMembership } from '../usecases/assert-membership';
import { ListActivity } from '../usecases/list-activity';

/**
 * ⚠️ **REFERÊNCIA, NUNCA CONTEÚDO** (decisão G da Tarefa 33): os oito campos da
 * entidade e nada mais. Nem nome de quem fez, nem título do dia, nem nome do
 * livro, nem trecho.
 *
 * A tela resolve nome pelo `GET /clubs/:clubId/members` (usa isso desde a 26a)
 * e já tem o livro. Fazer o backend juntar tudo seria um segundo
 * `getBookWithPlan` com outra forma — e o título do dia MUDA (o `editBook`
 * ressincroniza até o título da nota), então um evento com título velho seria
 * uma tela que mente.
 */
function toActivityResponse(event: ActivityEvent): ActivityEventResponse {
  return {
    id: event.id,
    clubId: event.clubId,
    // O ATOR sai na resposta: dentro do clube não há conteúdo privado, e o feed
    // mostra autoria. → ADR 0002.
    userId: event.userId,
    type: event.type,
    bookId: event.bookId,
    planItemId: event.planItemId,
    subjectId: event.subjectId,
    createdAt: event.createdAt.toISOString(),
  };
}

/**
 * "O que aconteceu por aqui" — o feed do clube (Tarefa 34).
 *
 * ⚠️ **O ENDEREÇO É O DO CLUBE, e é a simetria exata do
 * `GET /clubs/:clubId/notes` e do `/highlights`** (decisão E): o feed é do
 * clube, não do livro. Os três são a mesma forma — `clubId` na rota como corte
 * de tenant, e o resto em query.
 *
 * **Arquivo próprio**, e não uma rota a mais no `note-routes.ts`: o
 * `ActivityEvent` é entidade própria, com port, repositório e UseCase próprios,
 * e é o mesmo motivo pelo qual `highlight-routes.ts` e `reading-log-routes.ts`
 * nasceram separados.
 *
 * **Sem 403**: ler o feed não exige papel — `MEMBER` lê igual ao `OWNER`, e
 * papel de admin manda no livro e no plano, não no que as pessoas escreveram
 * (ADR 0002). **Sem classe de erro nova** (regra 16): `NotAMemberError` já
 * existe e já é 404, e é isso que faz "clube que não existe" e "clube que não é
 * seu" serem indistinguíveis de fora.
 *
 * **400 declarado** porque a rota REALMENTE o produz, em dois caminhos: o
 * `GET /clubs//activity` casa no find-my-way e o `min(1)` do
 * `clubIdParamsSchema` recusa (medido na Tarefa 26a, e varrido em
 * `routes/__tests__/server-guards.integration.test.ts`), e um `?limit` fora do
 * contrato é recusado pelo `listActivityQuerySchema`.
 *
 * ⚠️ **Uma rota só, e nenhuma escrita.** O evento nasce como efeito colateral
 * dos quatro UseCases de escrita (Tarefa 33); não há `POST /activity`, não há
 * `DELETE` e não há `PATCH` — o log é imutável, e um endereço de escrita daria
 * a qualquer cliente a chance de inventar o passado do clube.
 */
export const activityRoutes: FastifyPluginAsyncZod<{
  prisma: PrismaClient;
}> = async (app, options) => {
  const repos = buildRepositories(options.prisma);
  // O UseCase é instanciado UMA vez, no registro — não por request.
  const listActivity = new ListActivity(
    new AssertMembership(repos.memberships),
    repos.activityEvents,
  );

  app.get(
    '/clubs/:clubId/activity',
    {
      schema: {
        summary: 'Lista o que aconteceu no clube, do mais recente para trás',
        params: clubIdParamsSchema,
        querystring: listActivityQuerySchema,
        response: {
          200: activityResponseSchema,
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const events = await listActivity.execute({
          // O spread primeiro, o tenant depois — e o `clubId` vem da ROTA, não
          // do corpo nem da query. → §6.3.
          ...req.query,
          clubId: req.params.clubId,
          actorUserId: req.user.sub,
        });
        return reply.status(200).send(events.map(toActivityResponse));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );
};
