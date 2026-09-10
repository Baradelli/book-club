import type { HighlightResponse, NoteResponse } from '@clube/shared';

import { HIGHLIGHT_COLORS, type HighlightColor } from './highlight-colors';

/**
 * O MODELO DO ACERVO — a entrada, a ordem e as quatro dimensões de recorte.
 *
 * ⚠️ **MÓDULO PRÓPRIO, E O MOTIVO É MEDIDO — não é gosto por abstração.** O
 * `acervo.tsx` nasceu com **703 linhas** pelo contador canônico (o comando está
 * no docblock dele), o que o faria a maior tela do app **no commit que existe
 * justamente para encolher a segunda maior** — o `book.tsx`, de 486 para 247.
 * A lição nº 8 do MVP 1 é dividir **antes** de a tela crescer, e uma tela que
 * nasce grande já é "depois" no dia seguinte. Depois dos três cortes: **514** na
 * tela, **165** no `acervo-filters.tsx`, **113** aqui e **23** no
 * `club-names.ts` — e a tela deixou de ser a maior do app (o `free-note.tsx`
 * tem 565).
 *
 * ⚠️ **E A COSTURA NÃO FOI ESCOLHIDA PELO TAMANHO, foi pelo ASSUNTO.** O que
 * mora aqui é a parte que **não sabe o que é React**: o que é uma entrada do
 * acervo, em que ordem elas ficam, e o que cada uma das quatro dimensões
 * exclui. O que ficou na tela é apresentação — estado de requisição, linhas,
 * chips, `<select>`, `Sheet`. É a mesma partição de `paths.ts`,
 * `highlight-colors.tsx`, `form-errors.ts` e `router-link.tsx`, que já são
 * módulos neutros de `pages/`.
 *
 * ⚠️ **CHAMADOR ÚNICO, E ISSO É DECLARADO.** O §7.1 do
 * `docs/CONVENCOES-CODIGO.md` registra que "helper compartilhado sem segundo
 * chamador é especulação" — foi por isso que o `matchesText` dos fakes **não**
 * se mudou na Tarefa 23. A razão aqui é a de cima, e é outra: separar o modelo
 * da apresentação numa tela que nasceu com 703 linhas. Se um dia a busca da
 * Tarefa 29 precisar recortar o mesmo acervo, ela é a segunda chamadora — e não
 * muda nada neste arquivo.
 *
 * ⚠️ **E O ACUSADOR CONTINUA SENDO O MESMO.** Nada aqui ganhou teste próprio, e
 * é deliberado: estas funções são provadas **através da tela**
 * (`__tests__/acervo.test.tsx`), com o fixture hostil do §7.2 — a ordem, o AND
 * das quatro dimensões e o que cada uma exclui são todos decidíveis no DOM. Um
 * unitário aqui seria um segundo acusador da mesma propriedade, não um a mais;
 * a extração é um MOVE, e nenhuma propriedade mudou de dono.
 *
 * ⚠️ **E ELE NÃO PODE VIRAR `.tsx`, o que decidiu onde o construtor dos
 * `FilterGroup[]` foi morar.** A auditoria pediu esse construtor aqui ("é função
 * pura e já é o assunto deste módulo"), e a medição diz que **não é pura**: o
 * `FilterOption.start` é um `ReactNode` — o chip de pessoa carrega um
 * `<PersonAvatar>` e cada chip de cor uma `<ColorSwatch>`. Trazê-lo exigiria JSX
 * aqui, e o que faz este arquivo valer é justamente **não saber o que é React**.
 * Ele foi para o `acervo-filters.tsx`, que é `.tsx` por necessidade; o que
 * ficou aqui são as CONSTANTES de vocabulário que os dois lados comparam
 * (`ALL_SCOPE`, `EVERY_TYPE`, `EVERY_COLOR`, `EVERY_READING`, `authorScope`) —
 * essas sim são puras, e é por isso que a comparação e a construção nunca
 * discordam.
 *
 * ⚠️ **ELE NÃO IMPORTA NENHUMA TELA**, e é isso que o mantém livre do ciclo que
 * a auditoria da Tarefa 20 mediu (uma `const` de módulo de um lendo a do outro
 * derruba a rota no import). Os únicos imports são dois TIPOS de
 * `@clube/shared` e a paleta, que é ela mesma um módulo neutro.
 */

/**
 * UMA ENTRADA DO ACERVO — e ela é uma **união discriminada**, não um objeto com
 * `note?` e `highlight?`.
 *
 * ⚠️ **O DISCRIMINADOR É O TIPO QUE A TELA MOSTRA** (regra 2), e é o mesmo
 * vocabulário do chip de tipo: `PLAN`, `FREE` e `HIGHLIGHT`. Com isso o
 * compilador garante que a linha de grifo nunca leia `note` e vice-versa, e o
 * ramo "pronto e sem dado" — que é impossível — não existe para o `tsc`.
 *
 * ⚠️ **E `HIGHLIGHT` NÃO É UM `kind` DE `Note`** (ADR 0004): o `noteKind` do
 * schema tem dois valores, e esta união acrescenta o terceiro **na tela**,
 * onde ele é um tipo de LINHA — nunca no modelo.
 */
export interface NoteEntry {
  type: 'PLAN' | 'FREE';
  note: NoteResponse;
}

export interface HighlightEntry {
  type: 'HIGHLIGHT';
  highlight: HighlightResponse;
}

export type AcervoEntry = HighlightEntry | NoteEntry;

/**
 * A `key` do React — **prefixada pelo tipo**.
 *
 * ⚠️ **SEM O PREFIXO, UMA ANOTAÇÃO E UM GRIFO PODEM TER A MESMA CHAVE.** As
 * duas tabelas geram `randomUUID()`, mas a fronteira em que a tela confia não
 * promete isso: `noteResponseSchema` e `highlightResponseSchema` declaram
 * `id: z.string()`, sem `.uuid()`, e é o cliente que decide o que a tela vê
 * (§6.8). É a MESMA classe de colisão que a Tarefa 27 mediu no
 * `clubMemberResponseSchema` (o `userId` literalmente `"mine"` engolindo o chip
 * "Minhas"), e aqui ela é pior: chave duplicada faz o React reusar o nó errado
 * na próxima reconciliação — o primeiro toque de chip mostra a linha de outra
 * entrada.
 */
export function keyOf(entry: AcervoEntry): string {
  return entry.type === 'HIGHLIGHT'
    ? `highlight:${entry.highlight.id}`
    : `note:${entry.note.id}`;
}

export function authorOf(entry: AcervoEntry): string {
  return entry.type === 'HIGHLIGHT'
    ? entry.highlight.userId
    : entry.note.userId;
}

export function createdAtOf(entry: AcervoEntry): string {
  return entry.type === 'HIGHLIGHT'
    ? entry.highlight.createdAt
    : entry.note.createdAt;
}

/**
 * A leitura de uma entrada — `null` quando ela não está ancorada em dia nenhum.
 *
 * ⚠️ **A ANOTAÇÃO AVULSA E O GRIFO NÃO TÊM LEITURA, e isso é a fidelidade do
 * §7.1** (4ª aparição): `WHERE "planItemId" = 'x'` contra coluna nula é
 * **falso** no Postgres, e o grifo nem tem a coluna (ADR 0004: ele não depende
 * de existir um `ReadingPlanItem`). Escolher uma leitura os **exclui** — é o
 * comportamento certo, não um bug a consertar.
 */
export function readingOf(entry: AcervoEntry): string | null {
  return entry.type === 'HIGHLIGHT' ? null : entry.note.planItemId;
}

/** A cor de uma entrada — `null` quando ela não é grifo. */
export function colorOf(entry: AcervoEntry): HighlightColor | null {
  return entry.type === 'HIGHLIGHT' ? entry.highlight.color : null;
}

/**
 * QUANTOS CARACTERES DE PRÉVIA CABEM NUMA LINHA DE LISTA sem ela virar
 * parágrafo — e o `excerptOf` que os aplica.
 *
 * ⚠️ **ELES DESCERAM PARA CÁ NA TAREFA 29, e é a lição nº 3 do MVP 1 pela
 * quarta vez nesta sessão.** O `excerptOf` era **byte-idêntico** no
 * `acervo.tsx` e no `busca.tsx`, com as três constantes ao lado — a mesma
 * classe do `matches` dos fakes (Tarefa 23) e do `toLikePattern` dos
 * repositórios (Tarefa 29). Duas telas mostram a MESMA prévia do MESMO acervo:
 * se uma cortar em 120 e a outra em 130, a mesma anotação fica diferente em
 * dois lugares, e ninguém vê o defeito olhando **uma** tela.
 *
 * ⚠️ **E ELES CABEM AQUI, ao contrário do `noteTarget`.** São puros e não
 * importam nada: o invariante deste módulo ("ele não importa tela nenhuma",
 * que é o que o mantém livre do ciclo medido na Tarefa 20) fica intacto. O
 * `noteTarget` das duas telas **não** desceu justamente por isso — ele precisa
 * de `dayNotePath` e `freeNotePath`, que moram em duas TELAS, e trazê-los para
 * cá poria dois `.tsx` no grafo do módulo que existe para não saber o que é
 * React. O docblock do `noteTarget` no `busca.tsx` tem a medição.
 *
 * O trecho ganha mais que o comentário porque ele **É** o conteúdo do grifo; o
 * comentário na lista é prévia. Os três valores são derivados: o `quote` é o
 * que a pessoa digitou, e `commentText`/`plainText` são derivados no backend a
 * partir do documento (ADR 0001) exatamente para isto — montar N documentos
 * ProseMirror numa lista seria caro e ilegível.
 */
export const QUOTE_EXCERPT_LENGTH = 200;
export const COMMENT_EXCERPT_LENGTH = 120;
export const NOTE_EXCERPT_LENGTH = 120;

/**
 * O texto colapsado numa linha e cortado no teto, com reticências.
 *
 * ⚠️ **O `replace(/\s+/gu, ' ')` NÃO é cosmético**: o `plainText` e o
 * `commentText` são derivados de um documento ProseMirror, então eles carregam
 * as quebras de linha entre parágrafos. Sem o colapso, uma prévia de duas
 * linhas empurra a linha da lista para baixo e a lista deixa de ser varrível
 * com o polegar.
 *
 * ⚠️ **E O CORTE TEM ACUSADOR DESDE A TAREFA 29** — antes dela não tinha, nos
 * DOIS chamadores: mutar este corpo para `return text` dava **0 acusadores** em
 * `acervo.test.tsx` (55) **e** em `busca.test.tsx` (44), porque nenhum fixture
 * das duas telas tinha texto mais longo que o teto nem espaço nas pontas.
 * Extrair um helper sem acusador para um módulo compartilhado é a forma do §7.4
 * (parece coberto porque tem dono); o acusador está em
 * `busca.test.tsx`, `⚠️ truncates a long preview at the ceiling…`.
 */
export function excerptOf(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/gu, ' ');
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

/**
 * REGRA 1 — UMA LISTA, `createdAt` DECRESCENTE, OS DOIS TIPOS INTERCALADOS.
 *
 * ⚠️ **"CONCATENAR AS DUAS LISTAGENS" É A IMPLEMENTAÇÃO ERRADA MAIS PROVÁVEL**,
 * e é por isso que o fixture do teste tem a ordem por tipo e a ordem por data em
 * **desacordo** (§7.2): cada listagem já chega ordenada pelo backend, então
 * concatenar parece funcionar e põe todas as anotações antes de todos os grifos.
 *
 * ⚠️ **A COMPARAÇÃO É DE STRING, e não `new Date()`.** Os dois `createdAt` vêm
 * de `toISOString()`, cujo formato é de largura fixa (`YYYY-MM-DDTHH:mm:ss.sssZ`,
 * sempre em UTC), então a ordem lexicográfica **é** a cronológica. Comparar
 * strings evita construir N objetos `Date` por render e evita o pior caso: o
 * schema declara `createdAt: z.string()` (não um instante refinado), e um valor
 * malformado viraria `NaN` num `getTime()` — com `NaN` de um dos lados, o
 * comparador deixa de ser transitivo e a ordem da lista fica **indefinida**.
 */
export function mergeEntries(
  notes: readonly NoteResponse[],
  highlights: readonly HighlightResponse[],
): AcervoEntry[] {
  const entries: AcervoEntry[] = [
    ...notes.map((note): AcervoEntry => ({ type: note.kind, note })),
    ...highlights.map((highlight): AcervoEntry => ({
      type: 'HIGHLIGHT',
      highlight,
    })),
  ];

  return entries.sort((left, right) => {
    const a = createdAtOf(left);
    const b = createdAtOf(right);
    if (a === b) return 0;
    return a < b ? 1 : -1;
  });
}

/**
 * O `value` do chip "todas as cores".
 *
 * ⚠️ Ele não pode colidir com uma cor da paleta, e não colide **por
 * construção**: toda `HighlightColor` é um hex de sete caracteres começando com
 * `#` (`shared/src/highlight-color.ts`), então `colorFromChipValue` devolver
 * `null` para esta string é a mesma coisa que devolver `null` para qualquer
 * valor que não seja da paleta — e "não é da paleta" é exatamente "todas".
 */
export const EVERY_COLOR = 'all';

/**
 * ⚠️ **É o `find` da lista de `@clube/shared` que estreita, não um `as`.** O
 * `FilterOption.value` é `string` de propósito (o `FilterBar` é agnóstico de
 * dimensão — decisão G da Tarefa 27), e a tela é a dona do vocabulário: um
 * valor que não está na paleta não vira cor, vira "todas".
 */
export function colorFromChipValue(value: string): HighlightColor | null {
  return HIGHLIGHT_COLORS.find((candidate) => candidate === value) ?? null;
}

/**
 * OS `value` DO GRUPO DE PESSOA — três fixos e um por membro, com PREFIXO.
 *
 * ⚠️ **SEM O PREFIXO, um `userId` que fosse literalmente `mine` viraria O MESMO
 * chip que "Minhas"** — dois chips acesos, e o recorte de um dos dois
 * desaparecendo em silêncio. E o cenário é produzível pelo contrato em que a
 * tela confia: o `clubMemberResponseSchema` declara `userId: z.string()` **sem
 * `.uuid()`**, e é o cliente que decide o que a tela vê (§6.8). Medido na
 * Tarefa 27: o mutante sem prefixo tem acusador.
 */
export const ALL_SCOPE = 'all';
export const MINE_SCOPE = 'mine';
/**
 * ⚠️ O COMPLEMENTO É O **MODO DEGRADADO** (Tarefa 27, regra 14): é o que a tela
 * mostra quando não sabe as pessoas (`GET /members` que falhou) ou não sabe
 * qual delas sou eu (`/me` que ainda não chegou). Num clube de duas pessoas ele
 * é informação completa; em qualquer clube continua sendo um recorte honesto.
 */
export const OTHERS_SCOPE = 'others';
export const AUTHOR_SCOPE_PREFIX = 'author:';

export function authorScope(userId: string): string {
  return `${AUTHOR_SCOPE_PREFIX}${userId}`;
}

/** O `userId` de um recorte por pessoa, ou `null` se o recorte é outro. */
export function authorOfScope(scope: string): string | null {
  return scope.startsWith(AUTHOR_SCOPE_PREFIX)
    ? scope.slice(AUTHOR_SCOPE_PREFIX.length)
    : null;
}

/**
 * OS `value` DO GRUPO DE TIPO — `Tudo · Do dia · Avulsa · Grifo` (decisão F).
 *
 * ⚠️ **UM GRUPO DE QUATRO, e não três perguntas.** O `BACKLOG` chama a
 * distinção de "pré-definida × avulsa" e o ADR 0004 põe o grifo **fora** das
 * duas — três grupos separados seriam três perguntas para uma escolha só, e
 * duas delas com resposta implícita.
 *
 * O neutro (`'all'`) não colide com nenhum tipo por construção, como o
 * `EVERY_COLOR`: um valor que não está em `ENTRY_TYPES` não vira tipo, vira
 * "tudo".
 */
export const EVERY_TYPE = 'all';
export const ENTRY_TYPES = ['PLAN', 'FREE', 'HIGHLIGHT'] as const;

export function typeFromChipValue(value: string): AcervoEntry['type'] | null {
  return ENTRY_TYPES.find((candidate) => candidate === value) ?? null;
}

/**
 * ⚠️ **DECISÃO E — UM CONTROLE SÓ EXISTE QUANDO O TIPO SELECIONADO PODE
 * CARREGAR AQUELE CAMPO.**
 *
 * Um chip de cor com o tipo em "Avulsa" é um filtro que **garante zero
 * resultados** (anotação não tem cor), e mostrar um controle que só pode
 * esvaziar a lista é pior que esconder — é a armadilha que a Tarefa 25 evitou
 * distinguindo "vazio" de "filtrado sem resultado", agora na origem.
 *
 * ⚠️ **E A REGRA VALE PARA AS DUAS DIMENSÕES CONDICIONAIS, não só para a cor —
 * conserto medido da rodada da Tarefa 28.** A primeira versão da fatia aplicou
 * a decisão E só à cor e deixou o `<select>` de leitura vivo com o tipo em
 * "Avulsa"/"Grifo", justificando que generalizar tornaria a regra 11 ("um caso
 * com as quatro juntas") impossível. **Falso, e medido:** o teste da regra 11 já
 * põe o tipo no NEUTRO — é o que ele tem de fazer para as quatro dimensões
 * coexistirem —, e com o tipo em "Tudo" os dois controles condicionais existem.
 * A exclusão mútua entre cor e leitura **já valia para a cor** e nunca impediu
 * nada.
 *
 * As duas funções abaixo são a mesma regra escrita duas vezes porque os dois
 * campos são diferentes, não porque a regra é diferente:
 *
 * - **cor** só existe em grifo → tipo ∈ {Tudo, Grifo};
 * - **leitura** (`planItemId`) só existe na anotação DO DIA → tipo ∈ {Tudo, Do
 *   dia}. A avulsa tem a coluna nula e o grifo nem tem a coluna (ADR 0004).
 */
export function typeCanIncludeHighlight(
  type: AcervoEntry['type'] | null,
): boolean {
  return type === null || type === 'HIGHLIGHT';
}

export function typeCanCarryReading(type: AcervoEntry['type'] | null): boolean {
  return type === null || type === 'PLAN';
}

/** O `value` da opção "todas as leituras" do `<select>`. */
export const EVERY_READING = 'all';

/** As quatro dimensões, já normalizadas: `null` é "não recorta". */
export interface AcervoFilter {
  /** O `value` do chip de pessoa, já derivado para um que existe. */
  author: string;
  type: AcervoEntry['type'] | null;
  color: HighlightColor | null;
  reading: string | null;
}

/**
 * REGRA 7 — o recorte por pessoa.
 *
 * Sem `/me` não há como partir a lista; mostrar tudo é a resposta honesta para
 * "ainda não sei quem é você" — nunca uma lista partida ao contrário, que é a
 * armadilha nomeada da Tarefa 18.
 *
 * ⚠️ **E O RAMO `myId === null` É INALCANÇÁVEL PELO ÚNICO CHAMADOR DE HOJE, com
 * a medição colada: mutá-lo para `return false` dá 0 acusadores em 557.** O
 * `body()` do `acervo.tsx` devolve a frase de carregamento enquanto
 * `me === null`, então a lista nunca é montada sem `myId` — a garantia da Tarefa
 * 18 migrou para um mecanismo mais forte, "nada é pedido nem renderizado até o
 * `/me` chegar", que TEM acusador
 * (`__tests__/acervo.test.tsx`, `⚠️ DEGRADES the person dimension when I still
 * do not know WHICH of them is me` e `does not guess who I am when the /me
 * failed`). §7.10: a afirmação de inalcançabilidade vem com o endereço da
 * prova.
 *
 * ⚠️ **O RAMO FICA, e é por causa da segunda chamadora.** Este módulo se
 * declara reusável pela busca da Tarefa 29; uma tela que renderize a lista com
 * o `me` ainda desconhecido herdaria, sem ele, a lista partida ao contrário —
 * em silêncio. Quem escrever essa tela ganha o ramo de graça e paga o teste
 * dele.
 */
export function matchesAuthor(
  entry: AcervoEntry,
  scope: string,
  myId: string | null,
): boolean {
  const author = authorOfScope(scope);
  if (author !== null) return authorOf(entry) === author;
  if (scope === ALL_SCOPE) return true;
  if (myId === null) return true;
  return scope === MINE_SCOPE
    ? authorOf(entry) === myId
    : authorOf(entry) !== myId;
}

/**
 * REGRA 11 — AS QUATRO DIMENSÕES EM **AND**, sobre a lista já carregada.
 *
 * ⚠️ **E O "AND" É HONESTO SOBRE O QUE CADA DIMENSÃO EXCLUI.** Uma dimensão com
 * valor escolhido descarta a entrada que **não carrega aquele campo**, e é a
 * fidelidade do §7.1 (4ª aparição: `= 'x'` contra coluna nula é falso):
 *
 * - escolher uma **leitura** exclui a avulsa e o grifo (nenhum tem
 *   `planItemId`) — regra 10, e é o comportamento certo;
 * - escolher uma **cor** exclui as anotações (nenhuma tem cor).
 *
 * As duas juntas, portanto, devolvem **vazio por construção** — e a tela mostra
 * o estado "filtrado sem resultado", nunca uma lista que ignora um dos
 * recortes.
 */
export function filterEntries(
  entries: readonly AcervoEntry[],
  filter: AcervoFilter,
  myId: string | null,
): AcervoEntry[] {
  return entries.filter((entry) => {
    if (filter.type !== null && entry.type !== filter.type) return false;
    if (filter.color !== null && colorOf(entry) !== filter.color) return false;
    if (filter.reading !== null && readingOf(entry) !== filter.reading) {
      return false;
    }
    return matchesAuthor(entry, filter.author, myId);
  });
}
