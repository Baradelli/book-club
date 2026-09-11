import {
  errorSchema,
  planItemIdParamsSchema,
  type ReadingLogResponse,
  readingLogResponseSchema,
} from '@clube/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { ReadingLog } from '../domain/reading-log';
import { handleDomainError } from '../http/handle-domain-error';
import { buildRepositories } from '../http/repositories';
import { AssertMembership } from '../usecases/assert-membership';
import { MarkRead } from '../usecases/mark-read';
import { RecordActivity } from '../usecases/record-activity';
import { UnmarkRead } from '../usecases/unmark-read';

function toReadingLogResponse(log: ReadingLog): ReadingLogResponse {
  return {
    id: log.id,
    clubId: log.clubId,
    bookId: log.bookId,
    // O LEITOR sai na resposta: dentro do clube não há conteúdo privado, e a
    // sobreposição mostra quem leu. → ADR 0002.
    userId: log.userId,
    planItemId: log.planItemId,
    readAt: log.readAt.toISOString(),
  };
}

/**
 * "Li o trecho de hoje" e "me enganei" — as duas rotas do registro de leitura.
 *
 * ⚠️ **O ENDEREÇO É O DO DIA DE LEITURA, e é a simetria exata do
 * `PUT /plan-items/:planItemId/note`** (decisão A da Tarefa 32). Um
 * `POST /reading-logs` com o `planItemId` no corpo daria endereço novo a um
 * recurso que **não tem id próprio na API**: o par `(dia, pessoa)` é a
 * identidade (decisão E da Tarefa 30), e é por isso que nenhum dos dois
 * UseCases recebe id de log. Consequência estrutural, e não um `if`: o log de
 * outra pessoa é **inalcançável** — não há endereço por onde pedi-lo.
 *
 * ⚠️ **NENHUMA DAS DUAS DECLARA `body`, e é decisão.** As duas não recebem
 * nada: o dia vem da rota, o leitor vem do JWT e o `readAt` é lido do relógio
 * pelo UseCase. Os handlers **nunca leem `req.body`**, então não existe o
 * spread cuja ordem o §6.3 governa — a barreira contra o contrabando de
 * `userId` aqui é **estrutural**, e não o strip de um schema. O teste que a
 * prova manda o campo com o **ator legítimo** e asserta **a linha gravada**
 * (§7.5), que é a única coisa que mudaria se o contrabando pegasse.
 *
 * **Sem 403 em nenhuma das duas:** marcar leitura não exige papel — `MEMBER`
 * marca, e papel de admin manda no livro e no plano, não no que as pessoas
 * registram. E não há autoria a conferir: o log endereçado por
 * `(planItemId, ator)` é, por construção, o do próprio ator.
 *
 * **400 declarado nas duas** porque elas REALMENTE o produzem:
 * `PUT /plan-items//reading-log` casa no find-my-way e o
 * `z.string().min(1)` do param recusa, antes do handler (medido na Tarefa 26a,
 * e varrido em `routes/__tests__/server-guards.integration.test.ts`). Nenhum
 * dos dois UseCases lança erro de classe 400.
 *
 * **Nenhuma classe de erro nova nesta fatia**: `PlanItemNotFoundError`,
 * `BookNotFoundError` e `NotAMemberError` já existem e já estão mapeadas —
 * as três em **404**, e é isso que faz "dia que não existe", "livro de outro
 * clube" e "sem membership ativo" serem indistinguíveis de fora.
 */
export const readingLogRoutes: FastifyPluginAsyncZod<{
  prisma: PrismaClient;
}> = async (app, options) => {
  const repos = buildRepositories(options.prisma);
  // Os UseCases são instanciados UMA vez, no registro — não por request.
  const assertMembership = new AssertMembership(repos.memberships);
  const markRead = new MarkRead(
    assertMembership,
    repos.books,
    repos.planItems,
    repos.readingLogs,
    // O gatilho de atividade (Tarefa 33): só MARCAR é notícia. O `unmarkRead`
    // é um NÃO-EVENTO (decisão B) e não recebe o recorder.
    new RecordActivity(repos.activityEvents),
  );
  const unmarkRead = new UnmarkRead(
    assertMembership,
    repos.books,
    repos.planItems,
    repos.readingLogs,
  );

  /**
   * "Li o trecho de hoje". **PUT e idempotente**: marcar duas vezes é
   * inofensivo — é a definição de idempotente, e é o que faz o toque duplo e o
   * retry da fila offline não virarem erro para quem está lendo.
   *
   * ⚠️ **Responde 201 na primeira marcação e 200 nas seguintes, e os DOIS
   * status estão declarados** (decisão B). O serializer do Zod é POR STATUS:
   * com só o 200 declarado, a rede de segurança do `preSerialization` trocaria
   * o corpo do 201 por um `{error}` genérico — e quebraria **a primeira**
   * marcação de cada dia, só a primeira, que é o pior tipo de bug para achar.
   * (E o curinga `'2xx'` é recusado no boot de propósito.
   * → CONVENCOES-CODIGO §6.1.)
   *
   * O `created` vem do UseCase, e é a razão de ele devolver `{ log, created }`:
   * sem isso a borda teria de perguntar ao banco de novo.
   */
  app.put(
    '/plan-items/:planItemId/reading-log',
    {
      schema: {
        summary: 'Marca o dia de leitura como lido',
        params: planItemIdParamsSchema,
        response: {
          200: readingLogResponseSchema,
          201: readingLogResponseSchema,
          400: errorSchema,
          401: errorSchema,
          // Dia inexistente, livro de outro clube ou sem membership ativo: os
          // três são 404, e é o que não vaza a existência do recurso.
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const { log, created } = await markRead.execute({
          // Nenhum spread de `req.body`: esta rota não tem corpo. O tenant vem
          // do JWT. → §6.3, e o docblock do arquivo.
          planItemId: req.params.planItemId,
          actorUserId: req.user.sub,
        });
        return reply
          .status(created ? 201 : 200)
          .send(toReadingLogResponse(log));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  /**
   * "Me enganei": desmarca **a própria** leitura do dia.
   *
   * **204 SEMPRE, inclusive quando não havia o que apagar** (decisão C da
   * Tarefa 32, que é a decisão C da 30 na borda). Um 404 obrigaria a tela a
   * distinguir "desmarquei" de "já estava desmarcado", que é a mesma coisa
   * para quem olha — e o `unmarkRead` já resolve sem escrever, sem nem ir ao
   * banco.
   *
   * ⚠️ **204 e não 200-com-corpo, ao contrário do `DELETE /notes/:noteId`.** Lá
   * o soft delete devolve a linha atualizada porque o front quer o `status` e o
   * `archivedAt` que o servidor gravou. Aqui é **hard delete** (a exceção
   * documentada do `CLAUDE.md`): não sobra linha nenhuma para devolver, e um
   * corpo seria invenção.
   *
   * ⚠️ **O `response` do 204 é `z.null()`, e ele NÃO é decoração** — a guarda
   * de boot exige um schema para o status de sucesso, e sem ele o servidor não
   * sobe (§6.1). `z.null()` é o schema honesto de "sem corpo": o Fastify não
   * serializa corpo em 204, então nada atravessa, e o que a declaração compra é
   * o OpenAPI dizendo a verdade para a tela.
   */
  app.delete(
    '/plan-items/:planItemId/reading-log',
    {
      schema: {
        summary: 'Desmarca a própria leitura do dia (hard delete)',
        params: planItemIdParamsSchema,
        response: {
          204: z.null(),
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        await unmarkRead.execute({
          planItemId: req.params.planItemId,
          actorUserId: req.user.sub,
        });
        // `send(null)` e não `send()`: o type provider exige o payload que o
        // `response[204]` declara, e é o compilador cobrando o que o §6.1
        // pede. O Fastify não escreve corpo em 204 — nem o `preSerialization`
        // roda sobre `null` —, então o que sai é a resposta vazia.
        return reply.status(204).send(null);
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );
};
