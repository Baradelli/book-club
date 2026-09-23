import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
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

/**
 * O editor COM a barra de canetas — é o único estado em que as amostras
 * existem, e por isso ele é um segundo montador em vez de um parâmetro: o
 * `mountEditor` devolve o `.ProseMirror`, e aqui o que interessa é a bolinha.
 */
function mountPenBar(): Element {
  render(<RichEditor doc={aDoc()} onChange={() => undefined} penBar="fixed" />);

  const swatch = document.querySelector('[data-editor-pen]');
  if (swatch === null)
    throw new Error('a barra não renderizou amostra nenhuma');
  return swatch;
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
      de upload) — e o véu de `--accent-soft` cobre a anotação inteira.

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

/**
 * ============================================================================
 * ⚠️ O EDITOR PERDE A CAIXA E GANHA A SERIFA (decisões B e C da Tarefa 43)
 * ============================================================================
 *
 * As duas decisões são uma só quando vistas do canvas: o texto **senta no papel
 * da página**. `Dia.dc.html:59` desenha o corpo da anotação sem `background`,
 * sem `border` e sem `border-radius`, em Fraunces **17,5px/1,72**; e
 * `DiaDesktop.dc.html:63` o mesmo bloco em **19px/1,75** com
 * `max-width:620px`.
 *
 * ⚠️ **ESTE ARQUIVO LÊ O `getComputedStyle`, e é essa a diferença que ele
 * existe para medir** (veja o docblock do topo): "o seletor está escrito"
 * contra "o seletor casa". Uma regra de corpo escrita contra `.ProseMirror p`
 * em vez de `.ProseMirror`, por exemplo, deixaria o parágrafo certo e o título,
 * a citação e a lista com a fonte da interface — e um teste que lesse o arquivo
 * não veria diferença.
 *
 * ⚠️ **O LIMITE HONESTO, e ele é o mesmo do topo:** o jsdom resolve cascata,
 * não layout. Então a media query dos 19px **não** é medida aqui (o jsdom não
 * tem viewport que a case); ela é lida do arquivo, na última asserção, que é a
 * forma fraca — e está declarada como tal em vez de parecer forte.
 */
describe('the reading body, and the box that died (task 43)', () => {
  it('⚠️ sets the reading serif ON THE .ProseMirror, not on the paragraph', () => {
    const editor = mountEditor();
    const style = getComputedStyle(editor);

    /*
      ⚠️ O VALOR VOLTA COMO `var(--…)` E NÃO RESOLVIDO: este arquivo injeta só o
      `editor.css`, e o `:root` do `theme.css` não está aqui. É o que basta —
      o que se guarda é que a declaração CHEGA ao `.ProseMirror` e aponta para
      os tokens certos. Quem confere o VALOR de cada token é o
      `theme-tokens.test.ts`, do lado do app, sobre o CSS compilado.
    */
    expect(style.fontFamily).toBe('var(--family-reading)');
    expect(style.fontSize).toBe('var(--size-reading)');
    expect(style.lineHeight).toBe('1.72');
    // A medida máxima (`DiaDesktop.dc.html:63`), que vale nas duas larguras.
    expect(style.maxWidth).toBe('620px');
  });

  it('⚠️ paints NO box — no paper, no border, no radius, no side gutter', () => {
    /*
      A caixa vinha da TELA (`day-note.tsx` passava
      `rounded-control border border-line bg-surface` por `className`), e o
      recuo lateral vinha daqui (`padding: 1.5rem 1.5rem 7rem`). As duas somem:
      a moldura porque o canvas não a desenha, o recuo porque a coluna de
      leitura já dá os 20px e dois recuos estreitariam a medida.

      ⚠️ **AS 7rem DE BAIXO FICAM, e agora elas pagam DUAS coisas:** o teclado
      do celular e a barra de canetas de 62px ancorada acima dele. Sem elas a
      última linha digitada nasce embaixo das duas.
    */
    const editor = mountEditor();
    const style = getComputedStyle(editor);

    expect(style.paddingLeft).toBe('0px');
    expect(style.paddingRight).toBe('0px');
    expect(style.paddingTop).toBe('0px');
    expect(style.paddingBottom).toBe('7rem');
    // O papel e a moldura nunca foram declarados AQUI; o que se guarda é que
    // eles não voltem por este arquivo.
    expect(style.borderRadius).toBe('');
    expect(style.borderTopWidth).toBe('');
    // `rgba(0, 0, 0, 0)` é o inicial do jsdom para `background-color`: nada foi
    // declarado, que é a propriedade.
    expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  it('grows the body above 1120px, at the SAME cut as the rest of the app', () => {
    /*
      ⚠️ **ASSERÇÃO FRACA, E DECLARADA COMO TAL:** ela lê o ARQUIVO, porque o
      jsdom não aplica media query nenhuma. O que ela guarda é o que quebraria
      em silêncio: o corte escrito com outro número (1119, 1200, o `xl` do
      Tailwind, que é 1280) — aí o corpo do texto cresceria numa largura e a
      coluna noutra, e nenhuma suíte veria.
    */
    const css = readFileSync(
      resolve(process.cwd(), 'src', 'editor.css'),
      'utf8',
    );

    expect(css).toContain('@media (min-width: 1120px)');
    expect(css).toContain('font-size: 19px;');
    expect(css).toContain('line-height: 1.75;');
  });
});

/**
 * ============================================================================
 * ⚠️⚠️ A BARRA DE CANETAS PINTA — e até a auditoria da Tarefa 43 NADA media isso
 * ============================================================================
 *
 * **O buraco, medido pelo revisor:** apagar a regra `.clube-editor-swatch`
 * INTEIRA deixava `@clube/ui`, `@clube/app` e `@clube/shared` **verdes** — as
 * cinco bolinhas parariam de pintar e a barra viraria **cinco alvos invisíveis**
 * de 44px, com **1.812 testes** sem ver. Apagar só o anel de ouro tinha o mesmo
 * efeito em escala menor: a caneta ligada perde qualquer sinal.
 *
 * **Por que nada pegava**, e é a lição da direção errada: o
 * `highlight-palette.test.tsx` usa `.clube-editor-swatch` apenas como
 * **seletor**, para achar o elemento e ler o `style` inline — ele prova que a
 * COR CERTA chega ao DOM, nunca que alguma regra a pinta. E este arquivo, que é
 * o único do pacote que sabe montar o CSS no jsdom e medir `getComputedStyle`,
 * tinha três `it()` para o corpo de leitura e **zero** para a amostra.
 *
 * ⚠️ **O LIMITE HONESTO, o mesmo do resto do arquivo:** o jsdom resolve cascata,
 * não `var()` — ele devolve a declaração literal. O que se guarda aqui é que a
 * regra EXISTE e CASA o elemento que o componente monta; o valor de cada token
 * é do `theme-tokens.test.ts`, do lado do app, sobre o CSS compilado.
 */
describe('the pen bar paints (task 43, audit A2)', () => {
  it('⚠️ paints the swatch — without this rule the bar is five invisible targets', () => {
    const swatch = mountPenBar();
    const style = getComputedStyle(swatch);

    // O fundo é a cor que a caneta APLICA, injetada por `--swatch` (a única
    // exceção autorizada ao "sem CSS inline", §13).
    expect(style.backgroundColor).toBe('var(--swatch)');
    // E o filete de 1,5px do canvas (`Dia.dc.html:106`), em longhands: o
    // atalho `border: 1.5px solid` reporia `border-color` para `currentColor`
    // e apagaria o `--border-strong` da linha seguinte.
    expect(style.borderWidth).toBe('1.5px');
    expect(style.borderStyle).toBe('solid');
    expect(style.borderColor).toBe('var(--border-strong)');
  });

  it('⚠️ rings the pen that is ON with the gold of the canvas', () => {
    /*
      `Dia.dc.html:106`: `box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px
      var(--gold)`. Os dois anéis são um truque só — o primeiro abre um vão da
      cor do papel entre a bolinha e o dourado.

      ⚠️ **É O ÚNICO SINAL DE "esta é a cor de agora".** A caneta não acende o
      fundo do botão (o `plain` do `ToolButton`), então sem esta regra quem
      grifou de amarelo e quer trocar para verde não tem como saber o que está
      ligado — e apertar a mesma caneta de novo, que é como se TIRA o grifo
      desde que a borracha saiu, parece não fazer nada.
    */
    const swatch = mountPenBar();

    // Desligada: nenhum anel.
    expect(getComputedStyle(swatch).boxShadow).toBe('');

    fireEvent.mouseDown(screen.getByLabelText('Caneta amarela'));

    const ringed = getComputedStyle(
      document.querySelector('[aria-pressed="true"] > [data-editor-pen]') ??
        document.createElement('span'),
    ).boxShadow;
    expect(ringed).toContain('var(--gold)');
    expect(ringed).toContain('var(--surface)');
  });
});

/**
 * ============================================================================
 * ⚠️ A SETA DE 12×7 DO MENU DE BOLHA — outro sobrevivente da auditoria
 * ============================================================================
 *
 * `Dia.dc.html:73`: um quadrado girado 45° com duas bordas, subido 4px para
 * encostar no papel. Apagar `.clube-editor-arrow` do `editor.css` passava por
 * toda a suíte — o menu de bolha ficaria flutuando sem apontar para a palavra
 * selecionada.
 *
 * ⚠️ **ELE NÃO PODE SER MEDIDO NO DOM QUE O EDITOR PRODUZ, e o motivo é o
 * mesmo já medido para a lista de controles:** o `BubbleMenuView` do TipTap
 * chama `element.remove()` no construtor, e o tippy só reanexa o elemento ao
 * `body` quando MOSTRA — o que depende de layout, e o jsdom não tem. A seta
 * vive dentro desse elemento destacado, então `document.querySelector` não a
 * alcança.
 *
 * Daí as DUAS metades, e nenhuma delas sozinha fecha o buraco:
 *
 * 1. a REGRA pinta — medida num elemento-sonda com a classe, que é o que este
 *    arquivo sabe fazer (montar o CSS e ler `getComputedStyle`);
 * 2. o COMPONENTE usa a classe — lida do fonte, porque o DOM não a entrega.
 *
 * Só a primeira deixaria apagar o `<span>` do JSX; só a segunda deixaria
 * apagar a regra.
 */
describe('the arrow of the bubble menu (task 43, audit survivor)', () => {
  it('⚠️ paints the 12×7 square the canvas rotates', () => {
    const probe = document.createElement('span');
    probe.className = 'clube-editor-arrow';
    document.body.append(probe);

    const style = getComputedStyle(probe);
    expect(style.width).toBe('12px');
    expect(style.height).toBe('7px');
    expect(style.transform).toBe('rotate(45deg)');
    // O -4px é o que faz a costura entre a seta e o papel sumir.
    expect(style.marginTop).toBe('-4px');

    probe.remove();
  });

  it('⚠️ is rendered by the editor — the rule needs a consumer', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'components', 'RichEditor.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');

    expect(source).toContain('className="clube-editor-arrow"');
  });
});
