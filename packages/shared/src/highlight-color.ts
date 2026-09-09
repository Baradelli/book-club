/**
 * A paleta fixa do grifo — as cinco canetas com que o dono grifa o livro de
 * papel. → `docs/adr/0004-grifo-entidade-propria.md`.
 *
 * **Mora aqui, e não no domínio do backend**, pelo caminho que o `calendar-day`
 * percorreu na Tarefa 07: são três chamadores com a MESMA lista — o domínio
 * (`domain/highlight.ts`), o `z.enum` da borda (Tarefa 24) e a tela de grifos
 * (Tarefa 25). Deixá-la no backend obrigaria a mover o arquivo na 24 e a copiar
 * a lista na 25, e a lição nº 3 do MVP 1 ("vocabulário compartilhado mora num
 * arquivo só") custou dois bugs.
 *
 * **O valor guardado é o hex de 6 dígitos, minúsculo e sem alpha**, que é a
 * **cor base** dos cinco `rgba` da paleta do editor (`docs/EDITOR.md` §6). São
 * três decisões numa:
 *
 * 1. Não guardamos a string `rgba(250, 204, 21, 0.40)` do editor: o `z.enum` da
 *    borda passaria a depender de espaço em branco e de duas casas decimais, e
 *    o alpha é decisão de **renderização** (texto legível atrás do grifo), não
 *    identidade da cor.
 * 2. Não guardamos nome semântico (`YELLOW`…): o futuro registrado é paleta
 *    configurável por clube, e nome não descreve cor arbitrária.
 * 3. Minúsculo e sem alpha para haver **uma** grafia por cor — duas grafias do
 *    mesmo amarelo fariam o filtro por cor perder metade dos grifos.
 *
 * O espelhamento com a paleta do editor que o ADR 0004 pede tem teste
 * (`__tests__/highlight-color.test.ts` lê o `RichEditor.tsx` do disco): sem
 * ele, a primeira correção de cor faria as duas divergirem em silêncio.
 *
 * A ordem é a mesma do editor (amarelo, verde, laranja, azul, rosa) — é ela que
 * a tela de grifos desenha, ao lado da do editor.
 */
export const HIGHLIGHT_COLORS = [
  '#facc15', // amarelo
  '#22c55e', // verde
  '#f97316', // laranja
  '#3b82f6', // azul
  '#ec4899', // rosa
] as const;

/** Uma das cinco cores da paleta — nunca uma cor arbitrária. */
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

/**
 * O portão da cor: recebe `unknown` e **estreita**.
 *
 * Recebe `unknown` de propósito — o valor vem de corpo de request, e é o
 * domínio (não o cliente) que decide o que é cor válida. Comparação exata,
 * sem `trim` e sem dobrar caixa: `'#FACC15'` e `' #facc15'` são recusados,
 * porque normalizar aqui criaria uma segunda grafia aceita que o `z.enum` da
 * borda (Tarefa 24) recusaria — fake e banco divergindo, a classe do ADR 0007.
 */
export function isHighlightColor(value: unknown): value is HighlightColor {
  return (HIGHLIGHT_COLORS as readonly unknown[]).includes(value);
}
