import { z } from 'zod';

/**
 * Os schemas de borda do registro de leitura (MVP 3, Tarefa 32). Arquivo
 * próprio e não dentro do `note.ts` — espelha a separação que o backend fez
 * entre `note-routes.ts` e `reading-log-routes.ts`, e é o mesmo motivo pelo
 * qual o `highlight.ts` nasceu separado na Tarefa 24.
 *
 * ⚠️ **NÃO existe schema de CORPO aqui, e é decisão.** As duas rotas
 * (`PUT` e `DELETE /plan-items/:planItemId/reading-log`) não recebem nada: o
 * dia vem da rota, o leitor vem do JWT e o `readAt` é lido do relógio pelo
 * UseCase. Um corpo vazio declarado (`z.object({}).strict()`) daria um 400
 * explícito ao contrabando, mas exigiria que o cliente mandasse `{}` — e o
 * handler **nunca lê `req.body`**, então não há spread onde a ordem do §6.3
 * pudesse ser invertida. A barreira aqui é estrutural, não de schema.
 *
 * ⚠️ E **nenhum contador, nenhum percentual e nenhum total** — nem aqui nem no
 * `readers` do livro. Progresso é **calculado** a partir dos logs
 * (`CLAUDE.md`, e a decisão fechada do MVP 3), e é o CONTRATO que torna o
 * número irrenderizável: uma tela não pode desenhar um placar que a resposta
 * não carrega. É mais forte que uma regra de estilo, e foi escolhido por isso.
 */

/**
 * O registro de leitura como sai na resposta do `PUT`.
 *
 * Os SEIS campos da entidade, e nada mais: sem `status`, sem `archivedAt`, sem
 * `createdAt` (ele **é** o `readAt`) e sem `updatedAt` — o log é imutável.
 *
 * `userId` aparece porque dentro do clube não existe conteúdo privado: quem
 * leu é visível para todo membro ativo (ADR 0002). O que a autoria protege é a
 * **escrita** do registro.
 */
export const readingLogResponseSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  bookId: z.string(),
  /** O LEITOR. Visível para todo o clube, por decisão: → ADR 0002. */
  userId: z.string(),
  /** O dia do plano. Nunca nulo: não existe leitura avulsa. */
  planItemId: z.string(),
  readAt: z.string(),
});

/**
 * A sobreposição de leitura: "nestes dias, estas pessoas já leram".
 *
 * ⚠️ Tem o mesmo FORMATO do `planItemWritersResponseSchema` e **não é o mesmo
 * schema** — é a decisão D da Tarefa 31 aplicada à borda. Reusar aquele
 * economizaria seis linhas e custaria uma mentira no OpenAPI e no tipo que a
 * tela importa (`PlanItemWritersResponse` devolvendo leitores). O que se reusa
 * é a CONTA (`groupUsersByPlanItem`, no domínio do backend), não o nome.
 *
 * Só os dias que têm leitura — o front sobrepõe no plano que ele já tem, e
 * devolver todos os dias com `userIds: []` duplicaria o plano na resposta.
 */
export const planItemReadersResponseSchema = z.array(
  z.object({
    planItemId: z.string(),
    userIds: z.array(z.string()),
  }),
);

/**
 * ⚠️ **O 204 SEM CORPO, do lado do CLIENTE** (Tarefa 32b, decisão H).
 *
 * O `DELETE /plan-items/:planItemId/reading-log` responde **204 e nada mais**
 * — é hard delete, não sobra linha para devolver. Do lado do servidor a rota
 * declara `204: z.null()`, que é o schema honesto de "o Fastify não escreve
 * corpo em 204" e o que faz o OpenAPI dizer a verdade.
 *
 * ⚠️ **Do lado do cliente o valor NÃO é `null` — é `undefined`, e a diferença
 * não é acadêmica.** O `ApiClient` faz `raw = await response.text()` (`''`) e
 * `safeJsonParse('')` **lança** no `JSON.parse` e devolve `undefined`. Um
 * `z.null()` aqui recusaria o corpo vazio e transformaria toda desmarcação
 * bem-sucedida num `ApiError` — com o registro já apagado no banco, que é o
 * "chegou e foi EXECUTADO" do §6.8 na pior forma.
 *
 * Ele mora aqui, e não numa constante da tela, porque é a metade cliente de um
 * contrato de rota: quem muda a rota tem os dois lados na mesma linha de
 * busca. O acusador é
 * `lets a 204 with no body through when the schema accepts it` em
 * `src/client/__tests__/api-client.test.ts` (§7.10: a propriedade é decidível
 * no cliente, não na tela).
 */
export const noContentResponseSchema = z.undefined();

export type ReadingLogResponse = z.infer<typeof readingLogResponseSchema>;
export type PlanItemReadersResponse = z.infer<
  typeof planItemReadersResponseSchema
>;
