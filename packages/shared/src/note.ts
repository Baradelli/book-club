import { z } from 'zod';

import { generalStatus } from './club';

export const noteKind = z.enum(['PLAN', 'FREE']);

/**
 * O documento da anotação: ProseMirror JSON, como o editor o produz. → ADR 0001.
 *
 * ⚠️ **O `.passthrough()` não é frouxidão — é o que impede a resposta de sair
 * com a anotação apagada.**
 *
 * O `serializerCompiler` do Zod DESCARTA campo não declarado
 * (`docs/CONVENCOES-CODIGO.md` §6.1), e é isso que faz dele uma fronteira de
 * segurança. Mas o `doc` é um objeto de forma aberta por decisão de produto: um
 * `z.object({ type: z.literal('doc') })` no **response** faria a resposta sair
 * com `{"doc":{"type":"doc"}}` — o `content` todo, os `marks`, os `attrs` de
 * cada extensão, tudo apagado, com **200 e sem erro nenhum**. E no **input**
 * faria o servidor gravar um documento vazio no lugar do que a pessoa escreveu.
 *
 * Então `passthrough` nos DOIS sentidos, e um teste de losslessness na borda
 * (regra 29 da Tarefa 11) com `content` e `marks` aninhados.
 *
 * A validação continua RASA de propósito, igual à do `assertNoteDoc` do
 * domínio: só "é um objeto de `type: 'doc'`". Validar a árvore em profundidade
 * seria decidir aqui quais nós o editor pode ter, e cada extensão nova (tabela,
 * callout, menção) passaria a exigir uma mudança neste arquivo para poder ser
 * salva — o oposto do que o ADR 0001 escolheu.
 */
export const noteDocSchema = z.object({ type: z.literal('doc') }).passthrough();

/**
 * A anotação do dia: **só o `doc`**.
 *
 * `title` não entra porque é o tema do item do plano (o UseCase o
 * ressincroniza), `reference` porque é a do dia, `planItemId` porque vem da
 * rota, e `userId`/`clubId`/`bookId` porque vêm do JWT e do próprio item.
 *
 * `.strict()` e não o strip default: `plainText` é DERIVADO do `doc` no
 * backend (ADR 0001) e um cliente que o mandasse estaria enganado sobre quem
 * manda nele — melhor um 400 que diz isso do que um silêncio que o deixa achar
 * que funcionou. Vale para `userId`/`clubId` também: chave proibida no corpo é
 * 400, e nada é escrito. → regras 30 e 31 da Tarefa 11.
 */
export const upsertPlanNoteSchema = z
  .object({
    doc: noteDocSchema,
  })
  .strict();

/**
 * A anotação avulsa: título obrigatório, referência opcional, `doc`.
 *
 * O `.trim()` antes do `.min(1)` é o mesmo padrão do `planItemDraftSchema`:
 * assim um título só-de-espaços é reprovado pela borda, com `details` apontando
 * o campo, em vez de virar um 400 sem `details` vindo do domínio.
 */
export const createFreeNoteSchema = z
  .object({
    title: z.string().trim().min(1),
    reference: z.string().optional(),
    doc: noteDocSchema,
  })
  .strict();

/**
 * A correção da própria anotação avulsa.
 *
 * A distinção **ausente × `null`** é a mesma do `editBookSchema`: campo ausente
 * não mexe, `null` explícito LIMPA a referência. Daí `.nullable().optional()` e
 * **nunca** `.default()`, que colapsaria os dois casos num só.
 *
 * `title` não é anulável (é obrigatório na avulsa), e `doc` ausente significa
 * "renomear sem reenviar o documento".
 */
export const editNoteSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    reference: z.string().nullable().optional(),
    doc: noteDocSchema.optional(),
  })
  .strict();

/**
 * Os cinco filtros do acervo, todos opcionais. O `clubId` NÃO está aqui: vem da
 * rota, e é o corte de tenant.
 *
 * Sem `.strict()`, ao contrário dos corpos de escrita: uma query string ganha
 * parâmetro alheio por acidente (um `utm_source` colado de um link), e derrubar
 * a listagem do clube por causa disso seria trocar um risco que não existe
 * — não há campo derivado nem de tenant aqui — por uma quebra real.
 *
 * `includeArchived` não existe de propósito: não há tela de arquivadas no MVP 1,
 * e flag sem chamador é especulação. O `listNotes` corta `status: 'ACTIVE'` no
 * repositório.
 */
export const listNotesQuerySchema = z.object({
  bookId: z.string().min(1).optional(),
  /** O autor — é o "de \<pessoa\>" do filtro. Navegação, não permissão (ADR 0002). */
  authorId: z.string().min(1).optional(),
  kind: noteKind.optional(),
  planItemId: z.string().min(1).optional(),
  /** Busca `ILIKE` no `plainText`. Vazio ou só espaços = não filtra. */
  text: z.string().optional(),
});

export const noteIdParamsSchema = z.object({ noteId: z.string().min(1) });
export const planItemIdParamsSchema = z.object({
  planItemId: z.string().min(1),
});

/**
 * A anotação como sai na resposta.
 *
 * `plainText` APARECE aqui — é derivado no backend e útil ao front (prévia de
 * listagem, e o mesmo texto que a busca casou) —, e é justamente por isso que
 * ele não entra em nenhum input. → ADR 0001.
 */
export const noteResponseSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  bookId: z.string(),
  /** O AUTOR. Visível para todo o clube, por decisão: → ADR 0002. */
  userId: z.string(),
  kind: noteKind,
  planItemId: z.string().nullable(),
  title: z.string(),
  reference: z.string().nullable(),
  doc: noteDocSchema,
  plainText: z.string(),
  status: generalStatus,
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** O acervo do clube, na ordem que o `listNotes` decidiu (mais recente antes). */
export const notesResponseSchema = z.array(noteResponseSchema);

/**
 * A sobreposição de autoria: "nestes dias, estas pessoas já escreveram".
 *
 * Só os dias que têm nota — o front sobrepõe no plano que ele já tem, e
 * devolver todos os dias com `userIds: []` duplicaria o plano na resposta.
 */
export const planItemWritersResponseSchema = z.array(
  z.object({
    planItemId: z.string(),
    userIds: z.array(z.string()),
  }),
);

export type NoteKindValue = z.infer<typeof noteKind>;
export type NoteDocBody = z.infer<typeof noteDocSchema>;
export type UpsertPlanNoteBody = z.infer<typeof upsertPlanNoteSchema>;
export type CreateFreeNoteBody = z.infer<typeof createFreeNoteSchema>;
export type EditNoteBody = z.infer<typeof editNoteSchema>;
export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;
export type NoteResponse = z.infer<typeof noteResponseSchema>;
export type NotesResponse = z.infer<typeof notesResponseSchema>;
export type PlanItemWritersResponse = z.infer<
  typeof planItemWritersResponseSchema
>;
