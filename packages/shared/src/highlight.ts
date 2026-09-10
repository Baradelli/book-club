import { z } from 'zod';

import { generalStatus } from './club';
import { HIGHLIGHT_COLORS } from './highlight-color';
import { noteDocSchema } from './note';

/**
 * A cor do grifo na borda: **a mesma constante** de `highlight-color.ts`, nunca
 * uma lista copiada.
 *
 * Já são três chamadores da MESMA paleta — o domínio do backend
 * (`assertHighlightColor`), este `z.enum` e a tela de grifos (Tarefa 25) —, e a
 * lição nº 3 do MVP 1 ("vocabulário compartilhado mora num arquivo só") custou
 * dois bugs. O teste pina as `options` do enum contra a constante: uma lista
 * escrita à mão aqui ficaria verde no dia em que a paleta mudasse e o schema
 * não.
 *
 * ⚠️ **A borda NÃO normaliza caixa nem dá `trim`.** O `=` de texto do Postgres
 * é byte-sensível, e aceitar `#FACC15` criaria uma segunda grafia gravada que o
 * banco não reconhece como a mesma cor — o filtro por cor perderia metade dos
 * grifos. É a mesma razão pela qual o `isHighlightColor` do domínio compara
 * exato.
 *
 * ⚠️ **Nota para quem monta a URL da listagem:** `#` é o delimitador de
 * fragmento numa URL, então `?color=#facc15` **não chega ao servidor** (o
 * navegador corta ali). A cor tem de ir percent-encoded — `?color=%23facc15`.
 */
export const highlightColor = z.enum(HIGHLIGHT_COLORS);

/**
 * O teto da página: `2147483647`, o maior `int32`.
 *
 * ⚠️ Não é um número escolhido — é o contrato da coluna. `Highlight.page` é
 * `Int?` no Postgres, e **só** valor fora do int32 faz o Prisma **lançar**
 * (medido: `page: 2147483648` dá `ConversionError` — *"Unable to fit integer
 * value '2147483648' into an INT4"*), o que a rota traduziria em **500** para
 * uma entrada que o cliente mandou errada.
 *
 * ⚠️ **Fração é outra coisa, e a frase antiga dizia o contrário: o Prisma NÃO
 * lança, ele TRUNCA.** Medido nesta rodada, com uma linha de `page = 45` no
 * banco: `find({ page: 45.5 })` chega ao SQL com o parâmetro **`45`** e devolve
 * **o grifo da página 45** — resultado byte-idêntico ao de `find({ page: 45 })`.
 * O fake devolve `[]`. Então a divergência real não é "erro × lista vazia", é
 * **lista vazia (fake) × os grifos de OUTRA página (Postgres)**: resultado
 * errado em silêncio, na direção restritiva do §7.1. Quem fecha as duas pontas
 * é o `.int()` (fração → 400) mais este `.max()` (fora do int32 → 400), aqui na
 * borda; o `HighlightFilter` do port declara `page?: number` e aponta para cá.
 *
 * Vale nos DOIS lados, e é a divergência que esta fatia registrou em relação à
 * spec (que pedia o `.max` só na query): a coluna que recebe o `page` do
 * **corpo** é a mesma que o filtro compara.
 */
export const HIGHLIGHT_PAGE_MAX = 2147483647;

/**
 * A página como o CORPO a manda: número JSON, inteiro, de 1 a int32.
 *
 * **Sem `coerce`**, de propósito: corpo é JSON e JSON tem número. Com `coerce`
 * a string `"45"` passaria, e a borda deixaria de ser a barreira que o §6.3
 * promete — o cliente que manda texto onde o contrato diz número está enganado,
 * e um 400 diz isso.
 */
const pageInBody = z.number().int().min(1).max(HIGHLIGHT_PAGE_MAX);

/**
 * O grifo novo: o trecho e a cor são obrigatórios; página, referência e
 * comentário são opcionais.
 *
 * Não existem `userId`, `clubId` nem `bookId` aqui — o autor vem do JWT, o
 * clube vem de `book.clubId` e o livro vem da ROTA (§6.3). E não existe
 * `commentText`: ele é DERIVADO do `commentDoc` no backend, a cada escrita
 * (ADR 0001).
 *
 * `.strict()` e não o strip default, como nos três corpos de escrita de nota:
 * chave proibida no corpo é **400 e nada escrito**, que é mais forte que "foi
 * ignorada" — quem manda um campo derivado ou de tenant está enganado sobre
 * quem manda nele, e o silêncio o deixaria achar que funcionou.
 *
 * O `.trim()` antes do `.min(1)` no `quote` é o padrão do
 * `createFreeNoteSchema`: assim um trecho só-de-espaços é reprovado pela BORDA,
 * com `details` apontando o campo, em vez de virar um 400 sem `details` vindo
 * do `normalizeHighlightQuote`.
 *
 * `page` e `commentDoc` são só `.optional()` (e não `.nullable()`), o
 * precedente exato do `reference` do `createFreeNoteSchema`: num grifo NOVO não
 * há campo a limpar, então "ausente" e "`null`" significariam a mesma coisa, e
 * uma grafia só é melhor que duas. A distinção que importa está no PATCH.
 */
export const createHighlightSchema = z
  .object({
    quote: z.string().trim().min(1),
    color: highlightColor,
    page: pageInBody.optional(),
    reference: z.string().optional(),
    commentDoc: noteDocSchema.optional(),
  })
  .strict();

/**
 * A correção do próprio grifo.
 *
 * ⚠️ **Ausente ≠ `null`, e NUNCA `.default()`.** Campo ausente não mexe;
 * `null` explícito em `page`, `reference` e `commentDoc` **limpa** o campo — a
 * semântica que a Tarefa 22 entregou no `editHighlight`. Um `.default()`
 * colapsaria os dois casos num só: o patch vazio passaria a carregar chaves, e
 * o `editHighlight` gastaria um `UPDATE` (e um `updatedAt` novo) em cima de um
 * retry de fila offline que já coalesceu tudo.
 *
 * `quote` e `color` **não** são anuláveis: um grifo sem trecho ou sem cor não é
 * grifo — vazio e cor de fora da paleta são erro, não "limpa".
 */
export const editHighlightSchema = z
  .object({
    quote: z.string().trim().min(1).optional(),
    color: highlightColor.optional(),
    page: pageInBody.nullable().optional(),
    reference: z.string().nullable().optional(),
    commentDoc: noteDocSchema.nullable().optional(),
  })
  .strict();

/**
 * Os quatro filtros de navegação do acervo **mais a busca por texto**, todos
 * opcionais. O `clubId` **não** está aqui: vem da rota, e é o corte de tenant.
 *
 * **Sem `.strict()`**, ao contrário dos dois corpos de escrita — o precedente
 * do `listNotesQuerySchema`: uma query string ganha parâmetro alheio por
 * acidente (um `utm_source` colado de um link de e-mail), e derrubar a listagem
 * do clube por causa disso trocaria um risco que não existe (não há campo
 * derivado nem de tenant declarado aqui) por uma quebra real. O strip do
 * `z.object` continua sendo a primeira barreira: `clubId` e `status` somem
 * antes de o handler existir.
 *
 * ⚠️ **`page` aqui tem `coerce`, e no corpo não.** São duas naturezas: query
 * string é **texto** (`?page=45` chega como `'45'`, e sem `coerce` a URL que a
 * tela monta seria 400), corpo é JSON. E o `coerce` não afrouxa a coluna — o
 * `.int()` fecha `?page=45.5` e o `.max()` fecha `?page=2147483648`, os dois com
 * **400**. As duas pontas são de naturezas diferentes, e a segunda é a única que
 * seria um 500: fora do int32 o Prisma **lança**; fração ele **trunca**, e
 * devolveria os grifos de outra página. → `HIGHLIGHT_PAGE_MAX`.
 *
 * Sem `includeArchived`: não há tela de arquivados (MVP 4), e flag sem chamador
 * é especulação — o `listHighlights` corta `status: 'ACTIVE'` no repositório.
 */
export const listHighlightsQuerySchema = z.object({
  bookId: z.string().min(1).optional(),
  /** O autor — é o "de \<pessoa\>". Navegação, não permissão (ADR 0002). */
  authorId: z.string().min(1).optional(),
  color: highlightColor.optional(),
  page: z.coerce.number().int().min(1).max(HIGHLIGHT_PAGE_MAX).optional(),
  /**
   * A BUSCA (Tarefa 29): `ILIKE` no `quote` **ou** no `commentText`
   * (decisão A). Vazio ou só espaços = **não filtra**.
   *
   * ⚠️ **`z.string()` puro, SEM `.min(1)`** — e é o precedente exato do `text`
   * do `listNotesQuerySchema`, não desatenção. Um `.min(1)` aqui faria
   * `?text=` (a URL que um campo de busca esvaziado monta com naturalidade)
   * virar **400**, quando a resposta certa é o acervo inteiro: quem NORMALIZA é
   * o `listHighlights`, pelo `optionalText`, e ele já trata `''` e `'   '` como
   * "não filtra". Dois donos da mesma regra é como as duas divergem na primeira
   * correção — e aqui a divergência seria um 400 numa tela que funcionava.
   *
   * ⚠️ **E a borda NÃO dá `trim` nem normaliza acento.** O trim é do UseCase
   * (uma regra, um dono), e o acento é **decisão fechada**: `ILIKE` é
   * accent-sensitive, então `?text=coracao` **não** acha `'coração'`. Está
   * pinado por integração desde a Tarefa 11 no lado da nota. `unaccent` é fatia
   * própria — registrada como pergunta do dono na spec da Tarefa 29.
   */
  text: z.string().optional(),
});

export const highlightIdParamsSchema = z.object({
  highlightId: z.string().min(1),
});

/**
 * O grifo como sai na resposta.
 *
 * `commentText` **aparece** aqui — é derivado no backend e é o texto que a
 * busca da Tarefa 29 vai casar —, e é justamente por isso que ele não entra em
 * nenhum input. → ADR 0001.
 *
 * ⚠️ **O `commentDoc` usa o `noteDocSchema`, que é `.passthrough()`**, e é isso
 * que impede a resposta de sair com o comentário APAGADO: o
 * `serializerCompiler` do Zod descarta campo não declarado (é o que faz dele
 * fronteira de segurança, §6.1), então um `z.object({ type: z.literal('doc') })`
 * aqui responderia `{"commentDoc":{"type":"doc"}}` com **200 e sem erro
 * nenhum** — o `content`, as `marks` e os `attrs` de cada extensão, tudo
 * perdido. → ADR 0001.
 */
export const highlightResponseSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  bookId: z.string(),
  /** O AUTOR. Visível para todo o clube, por decisão: → ADR 0002. */
  userId: z.string(),
  quote: z.string(),
  color: highlightColor,
  page: z.number().nullable(),
  reference: z.string().nullable(),
  commentDoc: noteDocSchema.nullable(),
  commentText: z.string(),
  status: generalStatus,
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** O acervo, na ordem que o `listHighlights` decidiu (mais recente antes). */
export const highlightsResponseSchema = z.array(highlightResponseSchema);

export type CreateHighlightBody = z.infer<typeof createHighlightSchema>;
export type EditHighlightBody = z.infer<typeof editHighlightSchema>;
export type ListHighlightsQuery = z.infer<typeof listHighlightsQuerySchema>;
export type HighlightResponse = z.infer<typeof highlightResponseSchema>;
export type HighlightsResponse = z.infer<typeof highlightsResponseSchema>;
