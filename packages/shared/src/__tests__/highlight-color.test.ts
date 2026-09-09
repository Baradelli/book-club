import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HIGHLIGHT_COLORS, isHighlightColor } from '../highlight-color';

/**
 * Regra 1 da Tarefa 22 — a paleta fixa de 5 cores do `Highlight`, e o
 * espelhamento com a paleta do editor que o ADR 0004 exige.
 *
 * Mora em `shared` pelo mesmo motivo do `calendar-day` (Tarefa 07): o `z.enum`
 * da borda (Tarefa 24), o domínio do backend e a tela de grifos (Tarefa 25)
 * precisam da MESMA lista, e a lição nº 3 do MVP 1 ("vocabulário compartilhado
 * mora num arquivo só") custou dois bugs.
 */

/** Os cinco hex, escritos à mão: é a decisão B da spec, pinada. */
const EXPECTED_PALETTE = [
  '#facc15',
  '#22c55e',
  '#f97316',
  '#3b82f6',
  '#ec4899',
] as const;

/**
 * O arquivo do editor, lido do disco — e é isso que faz deste teste um
 * espelho de verdade em vez de duas listas escritas à mão que ninguém compara.
 *
 * `HIGHLIGHT_COLORS` do `RichEditor` **não é exportada** (é constante de
 * módulo, `docs/EDITOR.md` §6), e `packages/shared` não depende de
 * `packages/ui` — nem pode, é o pacote sem deps internas. Então a leitura é
 * pelo caminho do monorepo, que é fixo. Se o arquivo mudar de lugar, este teste
 * estoura e cobra que o espelho seja reapontado: é o comportamento certo, e o
 * oposto de uma cópia silenciosa que envelhece.
 *
 * `import.meta.url` e não `process.cwd()`: o projeto de teste de `shared` roda
 * em ambiente `node` (é o mesmo idioma do `no-browser-globals.test.ts`).
 */
const RICH_EDITOR_SOURCE = readFileSync(
  fileURLToPath(
    new URL('../../../ui/src/components/RichEditor.tsx', import.meta.url),
  ),
  'utf8',
);

const RGBA_RE = /rgba\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*[\d.]+\)/g;

/**
 * A **cor base** de um `rgba` do editor: os três canais em hex, sem o alpha.
 *
 * O alpha é decisão de RENDERIZAÇÃO (texto legível atrás do grifo,
 * `docs/EDITOR.md` §6), não identidade da cor — é por isso que a entidade
 * guarda o hex de 6 dígitos e não a string `rgba(...)` (decisão B).
 */
function baseColorOf(rgba: RegExpExecArray): string {
  const channels = [rgba[1], rgba[2], rgba[3]].map((channel) =>
    Number(channel).toString(16).padStart(2, '0'),
  );
  return `#${channels.join('')}`;
}

function editorBaseColors(): string[] {
  const found: string[] = [];
  for (
    let match = RGBA_RE.exec(RICH_EDITOR_SOURCE);
    match !== null;
    match = RGBA_RE.exec(RICH_EDITOR_SOURCE)
  ) {
    found.push(baseColorOf(match));
  }
  return found;
}

describe('HIGHLIGHT_COLORS', () => {
  it('is exactly the five colours of the fixed palette', () => {
    expect(HIGHLIGHT_COLORS).toEqual(EXPECTED_PALETTE);
    expect(HIGHLIGHT_COLORS).toHaveLength(5);
  });

  it('has no repeated colour', () => {
    expect(new Set(HIGHLIGHT_COLORS).size).toBe(5);
  });

  // Sem isto, um `'#FACC15'` na lista passaria no `toEqual` acima e seria
  // recusado pelo próprio `isHighlightColor` — uma paleta que não se aceita.
  it('is written in lowercase 6-digit hex, with no alpha', () => {
    for (const color of HIGHLIGHT_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  /**
   * ⚠️ O ESPELHAMENTO que o ADR 0004 exige — e a única forma de ele não
   * divergir na primeira correção de cor.
   *
   * Os cinco `rgba` do editor são lidos do `RichEditor.tsx`; a comparação é
   * ORDENADA, porque a ordem é a mesma nos dois lugares (amarelo, verde,
   * laranja, azul, rosa) e é ela que a tela de grifos vai desenhar ao lado da
   * do editor. Quem trocar uma cor num dos dois arquivos e não no outro fica
   * vermelho aqui.
   */
  it('mirrors the base colour of the five rgba of the editor palette', () => {
    const fromEditor = editorBaseColors();

    // Sem esta pré-condição, um regex que deixasse de casar devolveria `[]` e o
    // teste passaria comparando vazio com vazio.
    expect(fromEditor).toHaveLength(5);
    expect(HIGHLIGHT_COLORS).toEqual(fromEditor);
  });

  // A pré-condição do espelho: o arquivo lido é MESMO o do editor. Um caminho
  // errado que devolvesse outro arquivo qualquer sem `rgba` cairia no
  // `toHaveLength(5)` acima, mas um arquivo com `rgba` por acaso não cairia.
  it('reads the palette from the editor component itself', () => {
    expect(RICH_EDITOR_SOURCE).toContain('HIGHLIGHT_COLORS');
    expect(RICH_EDITOR_SOURCE).toContain('Grifo amarelo');
  });
});

describe('isHighlightColor', () => {
  it.each(EXPECTED_PALETTE)('accepts %s', (color) => {
    expect(isHighlightColor(color)).toBe(true);
  });

  /**
   * A caixa alta é o caso que morde: o mesmo amarelo escrito `#FACC15` é o
   * mesmo pixel na tela e uma string DIFERENTE na coluna — e o `z.enum` da
   * Tarefa 24 vai recusá-lo. Aceitá-lo aqui gravaria duas grafias da mesma cor
   * e faria o filtro por cor perder metade dos grifos.
   */
  it.each([
    ['the same yellow in uppercase', '#FACC15'],
    ['the same yellow in mixed case', '#Facc15'],
    ['the same green in uppercase', '#22C55E'],
  ])('refuses %s (%s)', (_label, value) => {
    expect(isHighlightColor(value)).toBe(false);
  });

  /**
   * A forma `rgba(...)` do editor é recusada, e é de propósito: guardá-la faria
   * o `z.enum` da borda depender de espaço em branco e de duas casas decimais,
   * e o alpha é decisão de renderização (decisão B).
   */
  it.each([
    ['the rgba form of the editor yellow', 'rgba(250, 204, 21, 0.40)'],
    ['the rgba form of the editor pink', 'rgba(236, 72, 153, 0.35)'],
    ['the rgb form without alpha', 'rgb(250, 204, 21)'],
  ])('refuses %s (%s)', (_label, value) => {
    expect(isHighlightColor(value)).toBe(false);
  });

  it.each([
    ['a hex with alpha appended', '#facc15ff'],
    ['the 3-digit shorthand', '#fc1'],
    ['a hex without the hash', 'facc15'],
    ['a colour that is not in the palette', '#ff0000'],
    ['tailwind yellow-500 of another shade', '#eab308'],
    ['a semantic name', 'yellow'],
    ['a semantic name in uppercase', 'YELLOW'],
    ['an empty string', ''],
    ['only spaces', '   '],
    ['a palette colour with a leading space', ' #facc15'],
    ['a palette colour with a trailing space', '#facc15 '],
    ['a CSS variable', 'var(--clube-highlight-yellow)'],
  ])('refuses %s (%s)', (_label, value) => {
    expect(isHighlightColor(value)).toBe(false);
  });

  // O tipo diz `unknown`, então o corpo de um request pode mandar qualquer
  // coisa: nenhuma delas pode estourar aqui.
  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a boolean', true],
    ['an object', { color: '#facc15' }],
    ['an array with a palette colour inside', ['#facc15']],
  ])('refuses %s without throwing', (_label, value) => {
    expect(isHighlightColor(value)).toBe(false);
  });

  /**
   * O predicado ESTREITA — é o que o domínio usa para o `color` sair de
   * `string` para `HighlightColor` sem um `as`. Sem esta prova, um
   * `(value: unknown) => boolean` passaria em tudo acima e obrigaria um cast no
   * primeiro chamador.
   */
  it('narrows the value to HighlightColor', () => {
    const value: unknown = '#22c55e';

    if (!isHighlightColor(value)) throw new Error('expected a palette colour');

    // `value` é `HighlightColor` daqui para baixo: o `includes` de uma lista
    // de literais só compila com o tipo estreito.
    expect(HIGHLIGHT_COLORS.includes(value)).toBe(true);
  });
});
