import {
  bookIdParamsSchema,
  clubIdParamsSchema,
  createFreeNoteSchema,
  editNoteSchema,
  errorSchema,
  listNotesQuerySchema,
  noteIdParamsSchema,
  type NoteResponse,
  noteResponseSchema,
  notesResponseSchema,
  planItemIdParamsSchema,
  planItemWritersResponseSchema,
  upsertPlanNoteSchema,
} from '@clube/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { Note } from '../domain/note';
import { handleDomainError } from '../http/handle-domain-error';
import { buildRepositories } from '../http/repositories';
import { ArchiveNote } from '../usecases/archive-note';
import { AssertMembership } from '../usecases/assert-membership';
import { CreateFreeNote } from '../usecases/create-free-note';
import { EditNote } from '../usecases/edit-note';
import { ListNotes } from '../usecases/list-notes';
import { ListPlanItemWriters } from '../usecases/list-plan-item-writers';
import { RecordActivity } from '../usecases/record-activity';
import { UpsertPlanNote } from '../usecases/upsert-plan-note';

/**
 * Teto de corpo das escritas de anotação: **256 KiB**.
 *
 * Declarado POR ROTA, e não herdado do global, de propósito: a Tarefa 14 vai
 * elevar o limite global para o editor aceitar imagem colada, e sem este teto
 * isso elevaria junto o corpo da anotação — que não carrega imagem (o ADR 0001
 * proíbe `data:`/`blob:` no `doc`; a imagem entra como URL depois do upload).
 *
 * O teto que IMPORTA é contagem de nós, não bytes: a Tarefa 08 mediu que o
 * `docToText` é linear em CPU mas custa memória (1 M de nós ≈ 230 MB). Bytes é
 * a aproximação que temos hoje, e é conservadora — o nó mais barato do
 * ProseMirror JSON tem ~20 bytes, então 256 KiB são ~10 mil nós no pior caso, e
 * um capítulo inteiro de anotação escrita à mão fica em uma ordem de grandeza
 * abaixo disso.
 */
const NOTE_BODY_LIMIT_BYTES = 256 * 1024;

function toNoteResponse(note: Note): NoteResponse {
  return {
    id: note.id,
    clubId: note.clubId,
    bookId: note.bookId,
    // O AUTOR sai na resposta: dentro do clube não há conteúdo privado, e a
    // listagem mostra autoria. → ADR 0002.
    userId: note.userId,
    kind: note.kind,
    planItemId: note.planItemId,
    title: note.title,
    reference: note.reference,
    // O `doc` atravessa INTEIRO — o `noteDocSchema` é `passthrough` nos dois
    // sentidos, senão o serializer responderia `{"doc":{"type":"doc"}}` com
    // 200 e sem erro. → CONVENCOES-CODIGO §6.1 e ADR 0001.
    doc: note.doc,
    // Derivado no backend, e por isso sai na resposta e não entra em nenhum
    // input. → ADR 0001.
    plainText: note.plainText,
    status: note.status,
    archivedAt: note.archivedAt === null ? null : note.archivedAt.toISOString(),
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export const noteRoutes: FastifyPluginAsyncZod<{
  prisma: PrismaClient;
}> = async (app, options) => {
  const repos = buildRepositories(options.prisma);
  // Os UseCases são instanciados UMA vez, no registro — não por request.
  const assertMembership = new AssertMembership(repos.memberships);
  // O gatilho de atividade (Tarefa 33): UM `recordActivity` para os dois
  // UseCases de nascimento deste arquivo — é a mesma regra, e um por rota
  // seriam dois donos dela.
  const recordActivity = new RecordActivity(repos.activityEvents);
  const upsertPlanNote = new UpsertPlanNote(
    assertMembership,
    repos.books,
    repos.planItems,
    repos.notes,
    recordActivity,
  );
  const createFreeNote = new CreateFreeNote(
    assertMembership,
    repos.books,
    repos.notes,
    recordActivity,
  );
  const editNote = new EditNote(assertMembership, repos.notes);
  const archiveNote = new ArchiveNote(assertMembership, repos.notes);
  const listNotes = new ListNotes(assertMembership, repos.notes);
  const listPlanItemWriters = new ListPlanItemWriters(
    assertMembership,
    repos.books,
    repos.planItems,
    repos.notes,
  );

  /**
   * A anotação do dia. **PUT e idempotente**: abrir a leitura de hoje e
   * escrever mexe sempre na MESMA nota (`unique(planItemId, userId)`), então o
   * autosave do editor reenvia à vontade.
   *
   * ⚠️ **Responde 201 na criação e 200 na atualização, e os DOIS status estão
   * declarados.** O serializer do Zod é POR STATUS: com só o 200 declarado, a
   * rede de segurança do `preSerialization` trocaria o corpo do 201 por um
   * `{error}` genérico — e quebraria **a primeira** escrita de cada nota do dia,
   * só a primeira, que é o pior tipo de bug para achar. (E o curinga `'2xx'` é
   * recusado no boot de propósito. → CONVENCOES-CODIGO §6.1.)
   *
   * Sem 403: escrever a nota do dia **não exige papel** — `MEMBER` escreve, e
   * papel de admin manda no livro e no plano, não no que as pessoas escrevem. E
   * não há autoria a conferir: a nota endereçada por `(planItemId, ator)` é, por
   * construção, a do próprio ator.
   */
  app.put(
    '/plan-items/:planItemId/note',
    {
      // → NOTE_BODY_LIMIT_BYTES.
      bodyLimit: NOTE_BODY_LIMIT_BYTES,
      schema: {
        summary: 'Escreve (ou reescreve) a anotação do dia de leitura',
        params: planItemIdParamsSchema,
        body: upsertPlanNoteSchema,
        response: {
          200: noteResponseSchema,
          201: noteResponseSchema,
          400: errorSchema,
          401: errorSchema,
          // Item de plano inexistente, livro de outro clube ou sem membership
          // ativo: os três são 404, e é o que não vaza a existência do recurso.
          404: errorSchema,
          // Declarado porque esta rota REALMENTE o produz: o `bodyLimit` acima
          // é dela, não o global. É assim que a tela descobre que a anotação
          // tem teto próprio.
          413: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const { note, created } = await upsertPlanNote.execute({
          ...req.body,
          planItemId: req.params.planItemId,
          // O tenant vem do JWT, e SEMPRE depois do spread. → §6.3.
          actorUserId: req.user.sub,
        });
        return reply.status(created ? 201 : 200).send(toNoteResponse(note));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  /**
   * A anotação avulsa: sem dia de leitura, com título e referência próprios.
   *
   * **POST e não PUT**: é ilimitada por decisão de produto — não há chave
   * natural, e duas chamadas idênticas criam duas notas.
   */
  app.post(
    '/books/:bookId/notes',
    {
      // → NOTE_BODY_LIMIT_BYTES.
      bodyLimit: NOTE_BODY_LIMIT_BYTES,
      schema: {
        summary: 'Cria uma anotação avulsa no livro',
        params: bookIdParamsSchema,
        body: createFreeNoteSchema,
        response: {
          201: noteResponseSchema,
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
          // → o `bodyLimit` desta rota.
          413: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const { note } = await createFreeNote.execute({
          ...req.body,
          bookId: req.params.bookId,
          actorUserId: req.user.sub,
        });
        return reply.status(201).send(toNoteResponse(note));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  /**
   * O autor corrige a própria anotação avulsa.
   *
   * O 403 aparece aqui (e no DELETE) e em nenhuma outra rota de nota: é o
   * `NotTheAuthorError`, o único 403 de conteúdo do projeto. O clube já LÊ a
   * nota de todo mundo (ADR 0002), então esconder com 404 não protegeria nada —
   * só mentiria para o front, que precisa distinguir "não existe" de "não é
   * sua".
   *
   * Sem `bodyLimit` próprio? Não: TEM, pelo mesmo motivo do PUT — este corpo
   * também carrega um `doc`.
   */
  app.patch(
    '/notes/:noteId',
    {
      // → NOTE_BODY_LIMIT_BYTES.
      bodyLimit: NOTE_BODY_LIMIT_BYTES,
      schema: {
        summary: 'Corrige a própria anotação avulsa (só o autor)',
        params: noteIdParamsSchema,
        body: editNoteSchema,
        response: {
          200: noteResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          // → o `bodyLimit` desta rota.
          413: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        // O corpo distingue ausente (não mexe) de `null` (limpa a referência), e
        // o spread preserva a distinção porque o schema não usa `.default()`.
        const { note } = await editNote.execute({
          ...req.body,
          noteId: req.params.noteId,
          actorUserId: req.user.sub,
        });
        return reply.status(200).send(toNoteResponse(note));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  /**
   * DELETE é soft delete e devolve 200 com a nota atualizada — o mesmo padrão
   * de `DELETE /books/:bookId`. 204 sem corpo seria mais REST, mas o front quer
   * a linha atualizada (o `status` e o `archivedAt` que o servidor gravou) para
   * não ter de refetch.
   *
   * ⚠️ **400 declarado, e a frase anterior dizia que ele não existia.** O
   * `archiveNote` de fato não lança `InvalidNoteError`, mas `DELETE /notes/`
   * responde 400 com `details: [{ path: 'noteId', ... }]` (medido na rodada de
   * correção da Tarefa 26a): o find-my-way casa o segmento vazio e o
   * `z.string().min(1)` do param recusa, ANTES do handler. Mentir por omissão
   * engana a tela igual que declarar status que não sai.
   * → varredura em `routes/__tests__/server-guards.integration.test.ts`.
   */
  app.delete(
    '/notes/:noteId',
    {
      schema: {
        summary: 'Arquiva a própria anotação (soft delete; só o autor)',
        params: noteIdParamsSchema,
        response: {
          200: noteResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const { note } = await archiveNote.execute({
          noteId: req.params.noteId,
          actorUserId: req.user.sub,
        });
        return reply.status(200).send(toNoteResponse(note));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  /**
   * O acervo do clube, como o clube escolhe olhar.
   *
   * O `clubId` é da ROTA e o `authorId` é filtro de QUERY, e a diferença é a
   * fatia inteira: o primeiro é o corte de tenant, o segundo é o
   * `Tudo · Minhas · de X`, que é **navegação, não permissão** — dentro do clube
   * não há conteúdo privado. → ADR 0002.
   */
  app.get(
    '/clubs/:clubId/notes',
    {
      schema: {
        summary: 'Lista as anotações do clube, com os filtros de navegação',
        params: clubIdParamsSchema,
        querystring: listNotesQuerySchema,
        response: {
          200: notesResponseSchema,
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const notes = await listNotes.execute({
          ...req.query,
          clubId: req.params.clubId,
          actorUserId: req.user.sub,
        });
        return reply.status(200).send(notes.map(toNoteResponse));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  /**
   * Só a sobreposição de autoria do livro — quem já escreveu em cada dia.
   *
   * Existe **além** do `writers` do `GET /books/:bookId` porque a tela precisa
   * atualizar só a sobreposição depois de alguém escrever, sem rebuscar o livro
   * inteiro. Os dois chamam a mesma função pura (`groupWritersByPlanItem`), então
   * não há duas verdades sobre quem escreveu.
   *
   * Sem 403, pelo mesmo motivo do `GET /books/:bookId`: a leitura não exige
   * papel. O **400 está declarado** porque `GET /books//writers` casa e o
   * `min(1)` do `bookIdParamsSchema` recusa (medido na Tarefa 26a) — não porque
   * o UseCase lance.
   */
  app.get(
    '/books/:bookId/writers',
    {
      schema: {
        summary: 'Quem já escreveu em cada dia do plano do livro',
        params: bookIdParamsSchema,
        response: {
          200: planItemWritersResponseSchema,
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const writers = await listPlanItemWriters.execute({
          bookId: req.params.bookId,
          actorUserId: req.user.sub,
        });
        return reply.status(200).send(writers);
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );
};
