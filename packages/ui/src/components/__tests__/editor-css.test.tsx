import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { RichEditor } from '../RichEditor';

/**
 * O `editor.css` CONTRA O DOM QUE O EDITOR REALMENTE PRODUZ.
 *
 * ⚠️ POR QUE ESTE ARQUIVO NASCEU NA RODADA DE CORREÇÃO: a auditoria achou três
 * defeitos no `editor.css`, todos da MESMA classe — seletor escrito contra uma
 * estrutura DEDUZIDA do nome do nó, em vez da estrutura medida. Nenhum deles
 * quebra nada; todos pintam a anotação errado, em silêncio, e a checklist §14
 * do `docs/EDITOR.md` não os pega (um aviso de UM parágrafo parece certo, e
 * ninguém seleciona célula de tabela numa conferida rápida).
 *
 * 1. `.ProseMirror > * + *` é FILHO DIRETO: o 2º parágrafo dentro de aviso, de
 *    citação, de bloco alternável e de célula nascia com `margin-top: 0`.
 * 2. `.ProseMirror th, td` não tinha `position`, e o `.selectedCell::after`
 *    (`absolute; inset: 0`) subia até o container do editor — selecionar uma
 *    célula TINGIA A ANOTAÇÃO INTEIRA.
 * 3. O `Details` do TipTap não renderiza `<details>`: é
 *    `div[data-type='details']`. Todas as regras do bloco alternável eram
 *    REGRA MORTA — sem borda, sem fundo, sem padding.
 *
 * A defesa é este arquivo: o CSS é lido do disco, injetado, e as asserções
 * saem do `getComputedStyle` do DOM que o `RichEditor` de verdade montou. É a
 * diferença entre "o seletor está escrito" e "o seletor casa".
 *
 * ⚠️ O LIMITE HONESTO, e ele importa: o jsdom NÃO TEM LAYOUT. Ele resolve a
 * cascata (por isso `margin-top` e `position` são legíveis), mas não calcula
 * caixa nenhuma — então a asserção do item 2 é "a célula declara contexto de
 * posicionamento", não "o véu fica dentro da célula". Onde a segunda se prova é
 * na checklist §14, no aparelho, e ela é do dono.
 */

/** O documento com um de cada container que o editor sabe aninhar. */
function aDoc(): Record<string, unknown> {
  const twoParagraphs = (prefix: string): Record<string, unknown>[] => [
    { type: 'paragraph', content: [{ type: 'text', text: `${prefix}1` }] },
    { type: 'paragraph', content: [{ type: 'text', text: `${prefix}2` }] },
  ];

  return {
    type: 'doc',
    content: [
      ...twoParagraphs('topo'),
      { type: 'callout', content: twoParagraphs('aviso') },
      { type: 'blockquote', content: twoParagraphs('citação') },
      {
        type: 'details',
        content: [
          {
            type: 'detailsSummary',
            content: [{ type: 'text', text: 'resumo' }],
          },
          { type: 'detailsContent', content: twoParagraphs('alternável') },
        ],
      },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [{ type: 'tableCell', content: twoParagraphs('célula') }],
          },
        ],
      },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: twoParagraphs('item') }],
      },
    ],
  };
}

beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = readFileSync(
    resolve(process.cwd(), 'src', 'editor.css'),
    'utf8',
  );
  document.head.append(style);
});

/**
 * O editor montado, com o CSS no `<head>`.
 *
 * ⚠️ A MONTAGEM É POR TESTE, e não num `beforeAll`: o `cleanup` do
 * `@testing-library/react` desmonta no `afterEach`, e desmontar DESTRÓI os node
 * views do TipTap — o wrapper do bloco alternável desaparece do DOM. Um
 * elemento guardado entre testes vira um nó órfão que ainda responde a
 * `getComputedStyle` e não responde mais a `querySelector`: verde no primeiro
 * teste, `null` no terceiro.
 */
function mountEditor(): Element {
  render(<RichEditor doc={aDoc()} onChange={() => undefined} />);

  const dom = document.querySelector('.ProseMirror');
  if (dom === null) throw new Error('o editor não renderizou o ProseMirror');
  return dom;
}

/** O segundo elemento que casa o seletor — o irmão que precisa de respiro. */
function second(editor: Element, selector: string): Element {
  const found = editor.querySelectorAll(selector)[1];
  if (found === undefined) {
    throw new Error(`o editor não produziu dois \`${selector}\``);
  }
  return found;
}

function marginTop(element: Element): string {
  return getComputedStyle(element).marginTop;
}

describe('the CSS reaches the DOM the editor produces', () => {
  it('gives every nested block the same breathing room as a top-level one', () => {
    /*
      ⚠️ O DEFEITO QUE ISTO IMPEDE: um aviso de dois parágrafos vira um bloco
      de texto corrido, sem respiro entre as frases — e é justamente no aviso
      (o bloco de destaque) que a falta de ar mais aparece.

      O topo é a referência: se ele mudar, muda para todos, e o teste continua
      dizendo a mesma coisa.
    */
    const editor = mountEditor();
    const reference = marginTop(second(editor, ':scope > p'));
    expect(reference).not.toBe('0px');
    expect(reference).not.toBe('');

    for (const selector of [
      "div[data-type='callout'] > p",
      'blockquote > p',
      "div[data-type='detailsContent'] > p",
      'td > p',
    ]) {
      expect(marginTop(second(editor, selector))).toBe(reference);
    }
  });

  it('keeps the paragraph of a list item flush, which is deliberate', () => {
    // `.ProseMirror li > p { margin: 0 }` é decisão, não esquecimento: dentro
    // de um item de lista o parágrafo é o invólucro do item, e margem ali abre
    // um buraco entre os marcadores. O respiro dos containers não pode
    // atropelar isto.
    const editor = mountEditor();
    expect(marginTop(second(editor, 'li > p'))).toBe('0px');
  });

  it('makes the table cell a positioning context for the selection veil', () => {
    /*
      ⚠️ `.ProseMirror .selectedCell::after` é `position: absolute; inset: 0`.
      Sem um ancestral posicionado DENTRO do editor, o bloco de contenção passa
      a ser o container do `RichEditor` (que é `relative`, por causa da pílula
      de upload) — e o véu de `--clube-accent-soft` cobre a anotação inteira.

      O jsdom não tem layout para provar onde o véu cai; o que ele prova é o
      que basta para o defeito não voltar: a célula declara o contexto.
    */
    const editor = mountEditor();
    const cell = editor.querySelector('td');
    expect(cell).not.toBeNull();
    expect(getComputedStyle(cell as Element).position).toBe('relative');
  });

  it('styles the toggle block by the element the extension really renders', () => {
    /*
      ⚠️ MEDIDO: o `Details` do TipTap renderiza

          <div data-type="details">
            <button type="button"></button>
            <div><summary>…</summary><div data-type="detailsContent">…</div></div>
          </div>

      e não um `<details>` nativo. As regras eram escritas contra `details` e
      `details > summary`: casavam ZERO elementos, então o bloco alternável não
      tinha borda, nem fundo, nem padding, e o resumo não ficava em negrito.

      As duas asserções são as duas metades do seletor errado: o bloco (que era
      `details`) e o resumo (que era `details > summary`, e o `summary` nem é
      filho direto — há um `div` intermediário do node view).
    */
    const editor = mountEditor();
    const block = editor.querySelector("div[data-type='details']");
    const summary = editor.querySelector('summary');
    expect(block).not.toBeNull();
    expect(summary).not.toBeNull();

    expect(getComputedStyle(block as Element).paddingTop).not.toBe('0px');
    expect(getComputedStyle(summary as Element).fontWeight).toBe('600');
  });
});
