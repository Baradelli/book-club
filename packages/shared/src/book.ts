import { z } from 'zod';

import { isCalendarDay, isClubMonth } from './calendar-day';
import { generalStatus } from './club';
// A sobreposição de autoria é UM schema, declarado com a anotação e reusado
// aqui — `CLAUDE.md` proíbe duplicar schema, e duas cópias divergiriam na
// primeira vez que a sobreposição ganhasse um campo.
import { planItemWritersResponseSchema } from './note';
// A sobreposição de LEITURA, e ela é um schema próprio — mesmo formato do
// `writers`, nome honesto (decisão D da Tarefa 31). O que se reusa entre as
// duas é a conta, no domínio do backend, não o schema.
import { planItemReadersResponseSchema } from './reading-log';
import { findPlanDateProblem } from './reading-plan-dates';

/**
 * A borda usa `isCalendarDay`/`isClubMonth` via `.refine()` — NÃO um regex
 * novo. Duplicar a validação de data entre domínio, borda e tela é o caminho
 * curto para as três divergirem em silêncio, e `CLAUDE.md` o proíbe. É por
 * isso que esses dois helpers moraram no backend até a Tarefa 07 e agora vivem
 * aqui.
 */
const calendarDay = z
  .string()
  .refine(isCalendarDay, { message: 'must be a "YYYY-MM-DD" calendar day' });

const clubMonth = z
  .string()
  .refine(isClubMonth, { message: 'must be a "YYYY-MM" club month' });

/**
 * Uma linha do plano como o admin a digita. **Sem `order`**: ele é derivado da
 * posição no array pelo domínio (`normalizePlanDrafts`), então declará-lo aqui
 * daria ao cliente um campo que o servidor ignora. → CONVENCOES-CODIGO §6.3.
 */
export const planItemDraftSchema = z.object({
  date: calendarDay,
  // `.trim()` antes do `.min(1)`: assim um título só-de-espaços é reprovado
  // pela borda, com `details` apontando o campo, em vez de virar um 400 sem
  // `details` vindo do domínio.
  title: z.string().trim().min(1),
  reference: z.string().optional(),
});

/**
 * A lista de rascunhos, com a regra de SEQUÊNCIA aplicada.
 *
 * O `superRefine` roda depois de cada item ter passado — se uma `date` está
 * malformada, o erro de formato sai primeiro e a sequência não é conferida
 * (não faria sentido: a comparação lexicográfica pressupõe formato canônico).
 * A mesma precedência vale no domínio.
 *
 * O `path` relativo `[index, 'date']` é o que importa: dentro do objeto ele
 * vira `planItems.1.date` no `details` da resposta 400, e é o único jeito de a
 * tela marcar a linha errada num plano de 30 dias.
 */
const planItemDraftListSchema = z
  .array(planItemDraftSchema)
  .superRefine((items, ctx) => {
    const problem = findPlanDateProblem(items.map((item) => item.date));
    if (problem === null) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [problem.index, 'date'],
      message:
        problem.kind === 'DUPLICATE'
          ? `date ${problem.date} is already used at position ${problem.firstIndex}`
          : `date ${problem.date} must come after ${problem.previousDate}`,
    });
  });

/**
 * `clubId` vem da rota e `actorUserId` do JWT — nenhum dos dois é declarado
 * aqui, e é o strip do Zod que é a primeira barreira contra o cliente que
 * tenta mandá-los no corpo. → CONVENCOES-CODIGO §6.3.
 */
export const createBookSchema = z.object({
  title: z.string().trim().min(1),
  month: clubMonth,
  author: z.string().optional(),
  // A URL é conferida AQUI, na borda: o domínio (`createBook`) declara
  // explicitamente que não valida se é URL de verdade.
  //
  // O `.or(z.literal(''))` não é frouxidão: `''` é o que um formulário manda
  // num campo de capa que a pessoa deixou em branco, e `optionalText` (no
  // domínio) existe nominalmente para transformá-lo em `null`. Sem esta
  // alternativa, o `''` morria em 400 antes de o domínio ver — e o `author`
  // logo acima, que aceita `''`, provava a inconsistência.
  coverUrl: z.string().url().or(z.literal('')).optional(),
  totalPages: z.number().int().positive().optional(),
  /** Ausente ou `[]` = livro sem plano. */
  planItems: planItemDraftListSchema.optional(),
});

/**
 * A distinção **ausente × `null`** é a regra 5 da Tarefa 06: campo ausente não
 * mexe, `null` explícito LIMPA. Daí `.nullable().optional()` e **nunca**
 * `.default()`, que colapsaria os dois casos num só.
 *
 * `month` e `title` não são anuláveis: são obrigatórios no livro.
 */
export const editBookSchema = z.object({
  title: z.string().trim().min(1).optional(),
  month: clubMonth.optional(),
  author: z.string().nullable().optional(),
  // `''` também limpa a capa, como no createBookSchema — e `null` continua
  // sendo o "limpa" explícito, distinto da ausência.
  coverUrl: z.string().url().or(z.literal('')).nullable().optional(),
  totalPages: z.number().int().positive().nullable().optional(),
});

/** O plano NOVO inteiro. `planItems: []` remove tudo — não é erro. */
export const replacePlanSchema = z.object({
  planItems: planItemDraftListSchema,
});

/**
 * `includeArchived` chega como **string** na query.
 *
 * Escolhido `z.enum(['true','false'])` + `.transform`, e não
 * `z.coerce.boolean()`: o coerce aplica a veracidade do JavaScript, então a
 * string `'false'` (não vazia) vira `true` e `?includeArchived=false`
 * mostraria os arquivados. O enum também rejeita `?includeArchived=sim` com
 * 400 em vez de adivinhar.
 */
export const listBooksQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const bookIdParamsSchema = z.object({ bookId: z.string().min(1) });

export const bookResponseSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  title: z.string(),
  author: z.string().nullable(),
  month: z.string(),
  coverUrl: z.string().nullable(),
  totalPages: z.number().nullable(),
  createdById: z.string(),
  status: generalStatus,
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
});

/** A estante do clube. */
export const booksResponseSchema = z.array(bookResponseSchema);

export const planItemResponseSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  order: z.number(),
  /** "YYYY-MM-DD" — dia de calendário, não instante. */
  date: z.string(),
  title: z.string(),
  reference: z.string().nullable(),
  createdAt: z.string(),
});

/**
 * Abrir o livro: cadastro + plano + **quem já escreveu** + **quem já leu**
 * cada dia.
 *
 * Os dois campos de sobreposição PRECISAM estar declarados aqui: o
 * `serializerCompiler` do Zod descarta campo não declarado, então um
 * `getBookWithPlan` que passasse a devolvê-los sem esta linha responderia 200
 * com o campo **apagado** — e nada avisaria.
 * → `docs/CONVENCOES-CODIGO.md` §6.1.
 *
 * Os dois são **obrigatórios**, não opcionais: um livro em que ninguém
 * escreveu (ou leu) tem `[]`, que é uma resposta legítima e o que a tela sabe
 * desenhar. Com `.optional()` o front ganharia um caso `undefined` que só
 * significa "o servidor esqueceu". O `POST /clubs/:clubId/books` também usa
 * este schema e manda `[]` nos dois — um livro criado neste instante não tem
 * anotação nem leitura nenhuma.
 *
 * É por o `readers` vir JUNTO do livro que a 32b desenha as duas sobreposições
 * numa requisição só — **não** existe `GET /books/:bookId/readers`, de
 * propósito: a `/writers` equivalente existe sem cliente nenhum desde a Tarefa
 * 11 (medido — o app lê o `writers` daqui), e criar a gêmea seria repetir um
 * erro já pago.
 *
 * ⚠️ E **nenhum contador**: nem `readDays`, nem total, nem percentual.
 * Progresso é presença, e é o contrato que torna o número irrenderizável.
 *
 * ⚠️⚠️ **POR QUE O `readers` É `.optional()` E O `writers` NÃO — e os dois
 * números que decidiram.**
 *
 * O §6.8 diz que campo NOVO no backend é a direção segura porque "o `parse` do
 * Zod faz strip, o front antigo ignora". Isso vale quando o front tem uma
 * CÓPIA velha do schema; aqui o schema é **um só**, morando no `shared`, então
 * declarar `readers` obrigatório torna obrigatório também tudo o que
 * **produz** uma resposta destas — inclusive os fixtures dos testes de tela,
 * que só vão saber dele na 32b.
 *
 * 1. **Obrigatório: 164 testes falhando em 7 arquivos** de `packages/app`
 *    (medido na Tarefa 32), e esta fatia não pode tocar o app — a 32b sobe a
 *    tela e os fixtures juntos.
 * 2. **`.default([])`, que daria tipo de saída não-opcional e deixaria o
 *    fixture antigo passar, NÃO COMPILA aqui**: o `RequestOptions.schema` do
 *    cliente é `ZodType<TOut>`, cujo terceiro parâmetro (`Input`) cai para
 *    `TOut` também — e `.default()` é justamente o caso em que entrada e saída
 *    DIFEREM. Medido: `TS2345` em `book.tsx:226` e `book-form.tsx:158`, com
 *    `readers?: ... | undefined` do lado do valor. Alargar aquela assinatura é
 *    mudança no cliente HTTP compartilhado e está fora desta fatia.
 *
 * Então `optional()` é a **fase 1** do phase-in de duas etapas que o próprio
 * §6.8 prescreve, palavra por palavra. **A fase 2 é da 32b**: ela sobe a tela
 * e os fixtures, tira o `optional()`, e com isso recupera uma proteção real —
 * com o campo obrigatório, um handler que ESQUECESSE o `readers` responde 500
 * (erro de serialização, logado) em vez de omitir o campo em silêncio, que é o
 * mesmo argumento pelo qual o `writers` nasceu obrigatório.
 *
 * ⚠️⚠️ **E O QUE O `optional()` CUSTA, medido na rodada de correção da 32 —
 * porque "quem segura a ponta é a integração" é verdade e insuficiente.**
 * Mutante: apagar `readers` do `send()` de `GET /books/:bookId` em
 * `book-routes.ts`. Resultado:
 *
 * ```
 * pnpm -r typecheck          → verde   (o campo é opcional: o handler pode omitir)
 * backend unit               → 1399/1399 PASSAM
 * integração                 → 4 falhas, TODAS no mesmo bloco
 *                              (`the reading overlay inside GET /books/:bookId`)
 * ```
 *
 * Ou seja: com o `optional()`, a fiação `getBookWithPlan → rota → resposta`
 * **não tem guarda nenhuma fora da integração**, e os quatro acusadores estão
 * todos num `describe` só. Quem apagar aquele bloco apaga a guarda inteira.
 * Com o campo obrigatório (fase 2), o mesmo mutante vira **500** de erro de
 * serialização, logado — que é a proteção que o `writers` tem hoje e o
 * `readers` não.
 */
export const bookWithPlanResponseSchema = z.object({
  book: bookResponseSchema,
  planItems: z.array(planItemResponseSchema),
  writers: planItemWritersResponseSchema,
  readers: planItemReadersResponseSchema.optional(),
});

/**
 * A substituição do plano devolve os contadores junto: é o que a tela do
 * cadastro mostra depois de salvar ("1 dia adicionado, 2 atualizados, 1
 * removido"), e é a saída que o `replacePlanItems` já produz.
 */
export const replacePlanResponseSchema = z.object({
  planItems: z.array(planItemResponseSchema),
  created: z.number(),
  updated: z.number(),
  removed: z.number(),
});

export type PlanItemDraftBody = z.infer<typeof planItemDraftSchema>;
export type CreateBookBody = z.infer<typeof createBookSchema>;
export type EditBookBody = z.infer<typeof editBookSchema>;
export type ReplacePlanBody = z.infer<typeof replacePlanSchema>;
export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>;
export type BookResponse = z.infer<typeof bookResponseSchema>;
export type PlanItemResponse = z.infer<typeof planItemResponseSchema>;
export type BookWithPlanResponse = z.infer<typeof bookWithPlanResponseSchema>;
export type ReplacePlanResponse = z.infer<typeof replacePlanResponseSchema>;
