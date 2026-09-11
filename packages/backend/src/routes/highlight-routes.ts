import {
  bookIdParamsSchema,
  clubIdParamsSchema,
  createHighlightSchema,
  editHighlightSchema,
  errorSchema,
  highlightIdParamsSchema,
  type HighlightResponse,
  highlightResponseSchema,
  highlightsResponseSchema,
  listHighlightsQuerySchema,
} from '@clube/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { Highlight } from '../domain/highlight';
import { handleDomainError } from '../http/handle-domain-error';
import { buildRepositories } from '../http/repositories';
import { ArchiveHighlight } from '../usecases/archive-highlight';
import { AssertMembership } from '../usecases/assert-membership';
import { CreateHighlight } from '../usecases/create-highlight';
import { EditHighlight } from '../usecases/edit-highlight';
import { ListHighlights } from '../usecases/list-highlights';
import { RecordActivity } from '../usecases/record-activity';

/**
 * Arquivo de rota PRÓPRIO, e não mais quatro rotas dentro do `note-routes.ts`:
 * ele já tem **353** linhas com seis rotas, e somar estas quatro passaria de
 * 500. O dono pediu cuidado com complexidade, e a divisão feita **antes** foi o
 * que pagou na Tarefa 20 (`book-form` + `plan-editor`).
 */

/**
 * Teto de corpo das escritas de grifo: **256 KiB**.
 *
 * Declarado POR ROTA, e não herdado do global, pelo mesmo motivo do
 * `note-routes.ts`: a Tarefa 14 elevou o limite global para o editor aceitar
 * imagem colada, e sem este teto isso elevaria junto o corpo do grifo — que não
 * carrega imagem (o ADR 0001 proíbe `data:`/`blob:` no doc; a imagem entra como
 * URL depois do upload).
 *
 * O teto que IMPORTA é contagem de nós, não bytes: o `docToText` é linear em CPU
 * mas custa memória (1 M de nós ≈ 230 MB, medido na Tarefa 08). Bytes é a
 * aproximação que temos hoje, e é conservadora. O mesmo número da nota, e é o
 * precedente medido da Tarefa 11 — o `quote` é uma frase e o `commentDoc` é um
 * comentário, então o grifo cabe com folga onde a anotação do dia caberia.
 *
 * ⚠️ Sem teto no `quote` no domínio (decisão G da Tarefa 22): o teto é ESTE, e
 * um número escolhido no domínio recusaria uma citação longa legítima.
 */
const HIGHLIGHT_BODY_LIMIT_BYTES = 256 * 1024;

function toHighlightResponse(highlight: Highlight): HighlightResponse {
  return {
    id: highlight.id,
    clubId: highlight.clubId,
    bookId: highlight.bookId,
    // O AUTOR sai na resposta: dentro do clube não há conteúdo privado, e a
    // listagem mostra autoria. → ADR 0002.
    userId: highlight.userId,
    quote: highlight.quote,
    color: highlight.color,
    page: highlight.page,
    reference: highlight.reference,
    // O `commentDoc` atravessa INTEIRO — o `noteDocSchema` é `passthrough` nos
    // dois sentidos, senão o serializer responderia
    // `{"commentDoc":{"type":"doc"}}` com 200 e sem erro.
    // → CONVENCOES-CODIGO §6.1 e ADR 0001.
    commentDoc: highlight.commentDoc,
    // Derivado no backend, e por isso sai na resposta e não entra em nenhum
    // input. → ADR 0001.
    commentText: highlight.commentText,
    status: highlight.status,
    archivedAt:
      highlight.archivedAt === null ? null : highlight.archivedAt.toISOString(),
    createdAt: highlight.createdAt.toISOString(),
    updatedAt: highlight.updatedAt.toISOString(),
  };
}

export const highlightRoutes: FastifyPluginAsyncZod<{
  prisma: PrismaClient;
}> = async (app, options) => {
  const repos = buildRepositories(options.prisma);
  // Os UseCases são instanciados UMA vez, no registro — não por request.
  const assertMembership = new AssertMembership(repos.memberships);
  const createHighlight = new CreateHighlight(
    assertMembership,
    repos.books,
    repos.highlights,
    // O gatilho de atividade (Tarefa 33): só o NASCIMENTO do grifo é notícia.
    // Editar e arquivar não entram (decisão B).
    new RecordActivity(repos.activityEvents),
  );
  const editHighlight = new EditHighlight(assertMembership, repos.highlights);
  const archiveHighlight = new ArchiveHighlight(
    assertMembership,
    repos.highlights,
  );
  const listHighlights = new ListHighlights(assertMembership, repos.highlights);

  /**
   * O grifo novo: o trecho, a cor da caneta, a página e o comentário.
   *
   * **O `bookId` vem da ROTA, não do corpo**, e é a decisão que mantém o corte
   * de tenant fora do alcance do cliente: com o livro na rota, o `bookForActor`
   * resolve o clube a partir do RECURSO (`book.clubId`), e nenhum campo que o
   * cliente manda participa do corte. Um `POST /clubs/:clubId/highlights`
   * exigiria o `bookId` no corpo, e aí o corte sairia de um campo enviado.
   *
   * **POST e não PUT**: o grifo é ILIMITADO por decisão de produto — não há
   * chave natural, a tabela não tem `@@unique`, e duas chamadas idênticas criam
   * dois grifos (grifar o mesmo trecho outra vez, com outra cor, é o caso de
   * uso).
   *
   * **Sem 403**: grifar não exige papel (`MEMBER` grifa — papel de admin manda
   * no livro e no plano, não no que as pessoas escrevem) e não há autoria a
   * conferir num grifo que ainda não existe. Declarar um status que o handler
   * não produz faz o OpenAPI mentir para a tela que o lê.
   */
  app.post(
    '/books/:bookId/highlights',
    {
      // → HIGHLIGHT_BODY_LIMIT_BYTES.
      bodyLimit: HIGHLIGHT_BODY_LIMIT_BYTES,
      schema: {
        summary: 'Registra um grifo no livro',
        params: bookIdParamsSchema,
        body: createHighlightSchema,
        response: {
          201: highlightResponseSchema,
          400: errorSchema,
          401: errorSchema,
          // Livro inexistente, arquivado, de outro clube ou sem membership
          // ativo: os quatro são 404, e é o que não vaza a existência do
          // recurso. → ADR 0005.
          404: errorSchema,
          // Declarado porque esta rota REALMENTE o produz: o `bodyLimit` acima
          // é dela, não o global. É assim que a tela descobre que o grifo tem
          // teto próprio.
          413: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const { highlight } = await createHighlight.execute({
          ...req.body,
          bookId: req.params.bookId,
          // O tenant vem do JWT, e SEMPRE depois do spread. → §6.3.
          actorUserId: req.user.sub,
        });
        return reply.status(201).send(toHighlightResponse(highlight));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  /**
   * O autor corrige o próprio grifo — o trecho que digitou errado, a cor da
   * caneta que confundiu, a página, o comentário.
   *
   * O 403 aparece aqui (e no DELETE) e em nenhuma outra rota de grifo: é o
   * `NotTheAuthorError`, o único 403 de conteúdo do projeto. O clube já LÊ o
   * grifo de todo mundo (ADR 0002), então esconder com 404 não protegeria nada —
   * só mentiria para o front, que precisa distinguir "não existe" de "não é
   * seu".
   *
   * O corpo distingue ausente (não mexe) de `null` (limpa `page`, `reference` ou
   * `commentDoc`), e o spread preserva a distinção porque o schema não usa
   * `.default()`.
   */
  app.patch(
    '/highlights/:highlightId',
    {
      // → HIGHLIGHT_BODY_LIMIT_BYTES: este corpo também carrega um doc.
      bodyLimit: HIGHLIGHT_BODY_LIMIT_BYTES,
      schema: {
        summary: 'Corrige o próprio grifo (só o autor)',
        params: highlightIdParamsSchema,
        body: editHighlightSchema,
        response: {
          200: highlightResponseSchema,
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
        const { highlight } = await editHighlight.execute({
          ...req.body,
          highlightId: req.params.highlightId,
          actorUserId: req.user.sub,
        });
        return reply.status(200).send(toHighlightResponse(highlight));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  /**
   * DELETE é soft delete e devolve **200 com a linha** — o mesmo padrão de
   * `DELETE /notes/:noteId` e de `DELETE /books/:bookId`. 204 sem corpo seria
   * mais REST, mas o front quer a linha atualizada (o `status` e o `archivedAt`
   * que o servidor gravou) para não ter de refetch.
   *
   * ⚠️ **400 declarado**, e não porque o `archiveHighlight` lance
   * `InvalidHighlightError` (ele não lança): `DELETE /highlights/` casa o
   * segmento vazio e o `min(1)` do `highlightIdParamsSchema` recusa na
   * VALIDAÇÃO, antes do handler (medido na rodada de correção da Tarefa 26a).
   * → varredura em `routes/__tests__/server-guards.integration.test.ts`.
   */
  app.delete(
    '/highlights/:highlightId',
    {
      schema: {
        summary: 'Arquiva o próprio grifo (soft delete; só o autor)',
        params: highlightIdParamsSchema,
        response: {
          200: highlightResponseSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const { highlight } = await archiveHighlight.execute({
          highlightId: req.params.highlightId,
          actorUserId: req.user.sub,
        });
        return reply.status(200).send(toHighlightResponse(highlight));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  /**
   * O acervo de grifos do clube, como o clube escolhe olhar.
   *
   * O `clubId` é da ROTA e o `authorId` é filtro de QUERY, e a diferença é a
   * fatia inteira: o primeiro é o corte de tenant, o segundo é o
   * `Tudo · Minhas · de X`, que é **navegação, não permissão** — dentro do clube
   * não há conteúdo privado. → ADR 0002.
   *
   * ⚠️ É a **borda** que valida a `color` (`z.enum`) e a `page`
   * (`z.coerce.number().int().min(1).max(...)`), e é isso que torna segura a
   * decisão D da Tarefa 23: o `listHighlights` recebe a cor já tipada e **não**
   * revalida — dois donos da mesma regra é como as duas divergem na primeira
   * correção. E as duas bordas do `page` fecham coisas diferentes, medidas:
   * sem o `.max`, um `?page=2147483648` é **500** (o Prisma lança
   * `ConversionError` num `Int`); sem o `.int()`, um `?page=45.5` é **200 com os
   * grifos da página 45** — o Prisma trunca o parâmetro. → `HIGHLIGHT_PAGE_MAX`
   * em `@clube/shared`.
   *
   * ⚠️ **E ELA É A ROTA DA BUSCA (Tarefa 29).** O `?text=` chegou ao
   * `listHighlightsQuerySchema` e atravessa por este mesmo `...req.query` —
   * **nenhuma rota nova**. Três coisas, todas decisão fechada:
   *
   * - o `text` casa `quote` **OU** `commentText` (decisão A da Tarefa 29): o
   *   `quote` é o conteúdo do grifo (ADR 0004), e uma busca que o ignorasse não
   *   acharia a frase que a pessoa grifou. Registrado como pergunta do dono;
   * - `?text=` (vazio) é **200 com o acervo**, não 400: o schema é
   *   `z.string()` sem `.min(1)`, e quem normaliza é o `optionalText` do
   *   `listHighlights`;
   * - `ILIKE` é accent-**SENSITIVE**, então `?text=coracao` **não** acha
   *   `'coração'`. Não é pendência: `unaccent` exige DDL + índice + ADR e é
   *   fatia própria — pergunta do dono na spec da Tarefa 29
   *   (`docs/tasks/29-busca-por-texto.md`).
   *
   * Sem 403: ler o acervo do clube não exige papel — `MEMBER` lê tudo.
   */
  app.get(
    '/clubs/:clubId/highlights',
    {
      schema: {
        summary:
          'Lista os grifos do clube, com os filtros de navegação e a busca por texto',
        params: clubIdParamsSchema,
        querystring: listHighlightsQuerySchema,
        response: {
          200: highlightsResponseSchema,
          400: errorSchema,
          401: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const highlights = await listHighlights.execute({
          ...req.query,
          clubId: req.params.clubId,
          actorUserId: req.user.sub,
        });
        return reply.status(200).send(highlights.map(toHighlightResponse));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );
};
