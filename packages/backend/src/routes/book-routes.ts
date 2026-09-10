import {
  bookIdParamsSchema,
  type BookResponse,
  bookResponseSchema,
  booksResponseSchema,
  bookWithPlanResponseSchema,
  clubIdParamsSchema,
  createBookSchema,
  editBookSchema,
  errorSchema,
  listBooksQuerySchema,
  type PlanItemResponse,
  replacePlanResponseSchema,
  replacePlanSchema,
} from '@clube/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { Book, ReadingPlanItem } from '../domain/book';
import { handleDomainError } from '../http/handle-domain-error';
import { buildRepositories } from '../http/repositories';
import { ArchiveBook } from '../usecases/archive-book';
import { AssertMembership } from '../usecases/assert-membership';
import { CreateBook } from '../usecases/create-book';
import { EditBook } from '../usecases/edit-book';
import { GetBookWithPlan } from '../usecases/get-book-with-plan';
import { ListBooks } from '../usecases/list-books';
import { ReplacePlanItems } from '../usecases/replace-plan-items';

function toBookResponse(book: Book): BookResponse {
  return {
    id: book.id,
    clubId: book.clubId,
    title: book.title,
    author: book.author,
    month: book.month,
    coverUrl: book.coverUrl,
    totalPages: book.totalPages,
    createdById: book.createdById,
    status: book.status,
    archivedAt: book.archivedAt === null ? null : book.archivedAt.toISOString(),
    createdAt: book.createdAt.toISOString(),
  };
}

function toPlanItemResponse(item: ReadingPlanItem): PlanItemResponse {
  return {
    id: item.id,
    bookId: item.bookId,
    order: item.order,
    // `date` JÁ é a CalendarDay "YYYY-MM-DD" — não passa por Date nenhum aqui.
    // A conversão da coluna vive só no repositório (calendar-day-mapper.ts).
    date: item.date,
    title: item.title,
    reference: item.reference,
    createdAt: item.createdAt.toISOString(),
  };
}

export const bookRoutes: FastifyPluginAsyncZod<{
  prisma: PrismaClient;
}> = async (app, options) => {
  const repos = buildRepositories(options.prisma);
  // Os UseCases são instanciados UMA vez, no registro — não por request.
  const assertMembership = new AssertMembership(repos.memberships);
  const createBook = new CreateBook(
    assertMembership,
    repos.clubs,
    repos.books,
    repos.planItems,
  );
  const listBooks = new ListBooks(assertMembership, repos.books);
  const getBookWithPlan = new GetBookWithPlan(
    assertMembership,
    repos.books,
    repos.planItems,
    // O `writers` da tela do livro sai daqui, e não de uma segunda chamada a
    // `GET /books/:bookId/writers`: abrir um livro é UM corte de tenant, não
    // dois. → decisão D da Tarefa 11.
    repos.notes,
  );
  const editBook = new EditBook(assertMembership, repos.books);
  const archiveBook = new ArchiveBook(assertMembership, repos.books);
  const replacePlanItems = new ReplacePlanItems(
    assertMembership,
    repos.books,
    repos.planItems,
    // A guarda "não remover dia do plano que já tem anotação" (Tarefa 11): sem
    // este repositório a rota `PUT /books/:bookId/plan` devolveria 500 de FK
    // em vez do 400 que explica.
    repos.notes,
  );

  app.post(
    '/clubs/:clubId/books',
    {
      schema: {
        summary: 'Cadastra o livro do mês com o plano (exige OWNER ou ADMIN)',
        params: clubIdParamsSchema,
        body: createBookSchema,
        response: {
          201: bookWithPlanResponseSchema,
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
        const { book, planItems } = await createBook.execute({
          ...req.body,
          clubId: req.params.clubId,
          actorUserId: req.user.sub,
        });
        return reply.status(201).send({
          book: toBookResponse(book),
          planItems: planItems.map(toPlanItemResponse),
          // Um livro criado NESTE instante não tem anotação nenhuma, então `[]`
          // é a verdade e não um placeholder. O campo é obrigatório no schema
          // de propósito: com `.optional()` o front ganharia um caso
          // `undefined` que só significa "o servidor esqueceu".
          writers: [],
        });
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  // Ler a estante NÃO exige papel: o livro é do grupo.
  app.get(
    '/clubs/:clubId/books',
    {
      schema: {
        summary: 'Lista os livros do clube',
        params: clubIdParamsSchema,
        querystring: listBooksQuerySchema,
        response: {
          200: booksResponseSchema,
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const books = await listBooks.execute({
          includeArchived: req.query.includeArchived,
          clubId: req.params.clubId,
          actorUserId: req.user.sub,
        });
        return reply.status(200).send(books.map(toBookResponse));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  app.get(
    '/books/:bookId',
    {
      schema: {
        summary: 'Abre o livro com o plano de leitura ordenado',
        params: bookIdParamsSchema,
        // ⚠️ A frase que estava aqui — "`bookId` é param de rota (sempre
        // presente, então o `min(1)` não reprova)" — é FALSA, e foi corrigida
        // na rodada de correção da Tarefa 26a: `GET /books/` responde
        // 400 com `details: [{ path: 'bookId', ... }]`, porque o find-my-way
        // CASA o segmento vazio e o `z.string().min(1)` recusa. O
        // `getBookWithPlan` de fato não lança `InvalidBookError` — o 400 vem da
        // VALIDAÇÃO, antes do handler. Sem 403: a leitura não exige papel.
        // → varredura em `routes/__tests__/server-guards.integration.test.ts`.
        response: {
          200: bookWithPlanResponseSchema,
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const { book, planItems, writers } = await getBookWithPlan.execute({
          bookId: req.params.bookId,
          actorUserId: req.user.sub,
        });
        return reply.status(200).send({
          book: toBookResponse(book),
          planItems: planItems.map(toPlanItemResponse),
          // `writers` só chega porque o `bookWithPlanResponseSchema` em
          // `shared/` cresceu junto: o serializer do Zod descarta campo não
          // declarado, então um `writers` esquecido lá sairia APAGADO, com 200 e
          // sem erro. → CONVENCOES-CODIGO §6.1, regra 35.
          writers,
        });
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  app.patch(
    '/books/:bookId',
    {
      schema: {
        summary: 'Corrige o cadastro do livro (exige OWNER ou ADMIN)',
        params: bookIdParamsSchema,
        body: editBookSchema,
        response: {
          200: bookResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        // O corpo distingue ausente (não mexe) de `null` (limpa) — regra 5 da
        // Tarefa 06 —, e o spread preserva a distinção porque o schema não
        // usa `.default()`.
        const book = await editBook.execute({
          ...req.body,
          bookId: req.params.bookId,
          actorUserId: req.user.sub,
        });
        return reply.status(200).send(toBookResponse(book));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  // DELETE é soft delete: o recurso realmente fica invisível (o GET seguinte
  // dá 404), então o verbo é honesto. Desarquivar é MVP 4.
  app.delete(
    '/books/:bookId',
    {
      schema: {
        summary: 'Arquiva o livro (soft delete; exige OWNER ou ADMIN)',
        params: bookIdParamsSchema,
        // 400 declarado pelo mesmo motivo do GET acima: `DELETE /books/` casa e
        // o `min(1)` do param recusa (medido na Tarefa 26a). O `archiveBook`
        // não lança `InvalidBookError` — o 400 é da validação, não do UseCase.
        response: {
          200: bookResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const book = await archiveBook.execute({
          bookId: req.params.bookId,
          actorUserId: req.user.sub,
        });
        return reply.status(200).send(toBookResponse(book));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  // PUT, não PATCH: `replacePlanItems` substitui o recurso inteiro. Por dentro
  // é um DIFF pela `date`, e é o que mantém o `id` do dia que sobrevive — a
  // anotação de quem já escreveu continua apontando para ele.
  app.put(
    '/books/:bookId/plan',
    {
      schema: {
        summary: 'Substitui o plano de leitura do livro (exige OWNER ou ADMIN)',
        params: bookIdParamsSchema,
        body: replacePlanSchema,
        response: {
          200: replacePlanResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const result = await replacePlanItems.execute({
          ...req.body,
          bookId: req.params.bookId,
          actorUserId: req.user.sub,
        });
        return reply.status(200).send({
          planItems: result.planItems.map(toPlanItemResponse),
          created: result.created,
          updated: result.updated,
          removed: result.removed,
        });
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );
};
