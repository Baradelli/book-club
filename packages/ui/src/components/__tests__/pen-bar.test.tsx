import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FORMAT_CONTROLS, HIGHLIGHT_COLORS, RichEditor } from '../RichEditor';

/**
 * ============================================================================
 * A BARRA DE CANETAS (Tarefa 43, decisões D, E, F, J e K)
 * ============================================================================
 *
 * O canvas tira a formatação de dentro da caixa. O que sobra fixo na tela são
 * **as cinco canetas + `Aa` + `/`**: no celular ancorado acima do teclado
 * (`Dia.dc.html:103`, 62px, `border-top`), no desktop no rodapé da coluna
 * (`DiaDesktop.dc.html:72`, 56px, `border-top`, canetas de 20px e a dica do `/`
 * à direita, `DiaDesktop.dc.html:92`).
 *
 * ⚠️ **A DECISÃO DE ARQUITETURA, e ela é o motivo de este arquivo existir em
 * `packages/ui` e não em `packages/app`:** a barra fica FORA da área de texto
 * mas comanda o editor, e o contrato (`docs/EDITOR.md` §3) diz por escrito que
 * **nenhuma ref imperativa é exposta**. Passar a instância para a tela
 * quebraria o contrato **e** — o que é pior — tiraria os botões novos do grafo
 * que `editor-touch-handlers.test.ts` percorre, que é a guarda da §4.4 (o
 * `preventDefault` que impede o teclado do celular de fechar a cada toque).
 *
 * Saída: o `RichEditor` continua dono da barra e ganha `penBar`; a tela só diz
 * **onde** ela fica.
 */

/** Fixture é factory (§7.7). */
function aDoc(text = 'trecho'): Record<string, unknown> {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

const source = resolve(process.cwd(), 'src', 'components', 'RichEditor.tsx');

/**
 * Comentário não é código — a mesma isenção do `editor-touch-handlers.test.ts`
 * e do `no-hardcoded-ui-text.test.ts`: este arquivo de produção EXPLICA a regra
 * citando os nomes que a guarda procura.
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

function penBarNode(): Element {
  const bar = document.querySelector('[data-editor-pen-bar]');
  if (bar === null) throw new Error('a barra de canetas não está montada');
  return bar;
}

function labelsIn(root: Element): (string | null)[] {
  return [...root.querySelectorAll('button')].map((button) =>
    button.getAttribute('aria-label'),
  );
}

describe('the pen bar exists in THREE forms, and none is a second screen', () => {
  it('draws the five pens, the Aa and the / when the screen asks for it', () => {
    render(
      <RichEditor doc={aDoc()} onChange={() => undefined} penBar="floating" />,
    );

    expect(labelsIn(penBarNode())).toEqual([
      ...HIGHLIGHT_COLORS.map((pen) => pen.label),
      'Formatar o texto',
      'Abrir o menu de blocos',
    ]);
    // Sem isto a asserção acima passaria com uma lista vazia dos dois lados.
    expect(HIGHLIGHT_COLORS).toHaveLength(5);
  });

  it('⚠️ is the SAME bar in every width — media query, never a branch', () => {
    /*
      ⚠️ A decisão D, e ela é a regra do `docs/EDITOR.md` §4.4 aplicada de novo:
      **nenhuma ramificação por dispositivo**. O que muda entre celular estreito,
      celular e desktop (a largura das canetas, o `/` que dá lugar à dica
      escrita) entra como VARIANTE DE MÍDIA na mesma classe.

      Um `useMediaQuery` aqui mentiria no primeiro frame, quebraria no
      redimensionamento — e nada disso apareceria neste teste, que é o que o
      torna tentador. Por isso a asserção é sobre a CLASSE, que é a propriedade
      decidível no jsdom (ele resolve cascata, não layout).
    */
    render(
      <RichEditor doc={aDoc()} onChange={() => undefined} penBar="floating" />,
    );

    const bar = penBarNode();
    // A pílula compacta: 48px de altura, arredondada, centrada na coluna.
    expect(bar.className).toContain('h-12');
    expect(bar.className).toContain('rounded-full');
    expect(bar.className).toContain('self-center');

    // Num celular de 320px as canetas estreitam para a pílula caber.
    const pen = screen.getByLabelText('Caneta amarela');
    expect(pen.className).toContain('max-[359px]:w-7');
  });

  it('⚠️ docks the bar at the BOTTOM of the text, lifted above the keyboard', () => {
    /*
      **Pedido do dono, 2026-10-06:** a pílula que acompanhava a rolagem NO
      TOPO desceu para o rodapé, como um rodapé flutuante — e, com o teclado
      aberto, ela fica logo ACIMA dele, onde o polegar está.

      `sticky` e não `fixed`: presa no fundo da janela enquanto há texto
      abaixo, e pousada no fim da anotação quando a pessoa chega lá. É a mesma
      classe nas duas larguras — no desktop ela fica centrada na coluna, não na
      janela. A altura do teclado entra pela variável que `clube-editor-dock`
      soma ao `bottom` (o `it()` do teclado, mais abaixo).
    */
    render(
      <RichEditor doc={aDoc()} onChange={() => undefined} penBar="floating" />,
    );

    expect(penBarNode().className).toContain('sticky');
    expect(penBarNode().className).toContain('clube-editor-dock');
    expect(penBarNode().className).not.toContain('order-first');
  });

  it('⚠️ draws NO control in the none form — the default, and the highlight comment', () => {
    /*
      `'none'` é o padrão, e ele tem dois consumidores reais: o editor de
      comentário do grifo (uma caixa de três linhas dentro de um formulário, que
      não pode ganhar uma faixa de 62px grudada no teclado) e o modo leitura.

      ⚠️ E o NÓ continua montado — é a invariante da §11. O que é condicional é
      o CONTEÚDO, nunca o elemento.
    */
    render(<RichEditor doc={aDoc()} onChange={() => undefined} />);

    expect(labelsIn(penBarNode())).toEqual([]);
    expect(screen.queryByLabelText('Formatar o texto')).toBeNull();
  });

  it('draws no control in read-only, even when the screen asks for the bar', () => {
    // §4: as superfícies de UI só existem quando `editable`. Uma caneta que não
    // grifa nada é um botão que não faz nada.
    render(
      <RichEditor
        doc={aDoc()}
        editable={false}
        onChange={() => undefined}
        penBar="floating"
      />,
    );

    expect(labelsIn(penBarNode())).toEqual([]);
  });
});

describe('⚠️ the fixed toolbar is DEAD (decision A)', () => {
  it('mounts NO control above the text, and exactly SEVEN when the bar is asked for', () => {
    /*
      ⚠️ **O ACUSADOR DA DECISÃO A, e ele teve de nascer.** "A barra fixa some"
      não tinha acusador nenhum: devolvê-la — um `<div>` `sticky top-0` antes do
      menu de bolha, com os controles dentro — passava por toda a suíte. A
      invariante da §11 não a pega (um irmão SEMPRE montado é legítimo, e o
      teste recalcula a linha de base), e o teto de texto cravado só a pega se
      ela trouxer rótulos novos junto.

      A propriedade que morde é de CONTAGEM, no DOM: com o editor editável e sem
      barra pedida, o editor não monta **nenhum** botão. O menu de bolha não
      conta porque o TipTap o destaca do container (e é por isso que ele não
      aparece aqui), e é justamente esse detalhe que fazia a barra do topo ser o
      único lugar onde controle nascia montado.

      E o lado positivo (§7.3): com a barra pedida são **sete** — as cinco
      canetas, o `Aa` e o `/`. Sem ele, "zero botões" também passaria num editor
      que não renderiza controle nenhum.
    */
    const { rerender } = render(
      <RichEditor doc={aDoc()} onChange={() => undefined} />,
    );

    expect(document.querySelectorAll('button')).toHaveLength(0);

    rerender(
      <RichEditor doc={aDoc()} onChange={() => undefined} penBar="floating" />,
    );

    expect(document.querySelectorAll('button')).toHaveLength(7);
    // E todos dentro da barra: nenhum controle solto no meio do texto.
    expect(penBarNode().querySelectorAll('button')).toHaveLength(7);

    /*
      ⚠️⚠️ **E A BARRA VEM DEPOIS DO TEXTO — sem esta asserção o `it()` mede
      CONTAGEM e o nome dele promete POSIÇÃO.**

      Medido na auditoria: trocando a ordem dos irmãos (a `<PenBar>` antes do
      `<EditorContent>`) o teste passava por **299/299 e 912/912**. E no
      desktop, onde `min-[1120px]:static` tira o `fixed`, isso é **literalmente
      a barra do topo de volta** — a decisão A desfeita, sem um vermelho.

      A §11 também não pega: ela captura a linha de base DEPOIS da troca e
      compara consigo mesma.

      `DOCUMENT_POSITION_FOLLOWING` (4) é "o argumento vem DEPOIS de mim no
      documento": o editor primeiro, a barra depois.
    */
    const text = document.querySelector('.ProseMirror');
    expect(text).not.toBeNull();
    expect(
      (text as Element).compareDocumentPosition(penBarNode()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0);
  });
});

describe('undo and redo — the two arrows at the start of the bar', () => {
  function renderWithHistory(
    onChange: (doc: Record<string, unknown>) => void = () => undefined,
  ) {
    return render(
      <RichEditor
        doc={aDoc()}
        onChange={onChange}
        penBar="floating"
        redoLabel="Refazer"
        undoLabel="Desfazer"
      />,
    );
  }

  it('puts ↶ and ↷ FIRST, before the pens, when the screen gives their labels', () => {
    /*
      Os rótulos entram por PROP, como a dica do `/`: `packages/ui` não chama
      `t()` (`no-i18n.test.ts`) e o teto de texto cravado do
      `no-hardcoded-ui-text.test.ts` só pode cair. Sem rótulo, sem botão —
      ausente ≠ vazio, a mesma regra do `slashHintLabel`.
    */
    renderWithHistory();

    expect(labelsIn(penBarNode())).toEqual([
      'Desfazer',
      'Refazer',
      ...HIGHLIGHT_COLORS.map((pen) => pen.label),
      'Formatar o texto',
      'Abrir o menu de blocos',
    ]);
  });

  it('undoes what was done, and redoes it', () => {
    const emitted: string[] = [];
    renderWithHistory((doc) => emitted.push(JSON.stringify(doc)));

    // O `/` digita um caractere: uma mudança no histórico. (A caneta com o
    // cursor colapsado não serviria — ela só guarda a marca, o doc não muda.)
    fireEvent.mouseDown(screen.getByLabelText('Abrir o menu de blocos'));
    expect(emitted.at(-1)).toContain('/');

    fireEvent.mouseDown(screen.getByLabelText('Desfazer'));
    expect(emitted.at(-1)).not.toContain('/');

    fireEvent.mouseDown(screen.getByLabelText('Refazer'));
    expect(emitted.at(-1)).toContain('/');
  });

  it('says when there is nothing to undo or redo — without leaving the text', () => {
    /*
      `aria-disabled`, e NÃO `disabled`: um botão `disabled` não recebe o
      `mousedown`, então o `preventDefault` da §4.4 não roda, o toque cai no
      que está atrás, o foco sai do ProseMirror e o TECLADO FECHA. Apertar um
      desfazer apagado não pode custar o teclado.
    */
    renderWithHistory();

    const undo = screen.getByLabelText('Desfazer');
    const redo = screen.getByLabelText('Refazer');
    expect(undo.getAttribute('aria-disabled')).toBe('true');
    expect(redo.getAttribute('aria-disabled')).toBe('true');
    expect(fireEvent.mouseDown(undo)).toBe(false);
    expect(fireEvent.touchEnd(redo)).toBe(false);

    fireEvent.mouseDown(screen.getByLabelText('Abrir o menu de blocos'));
    expect(undo.getAttribute('aria-disabled')).toBe('false');

    fireEvent.mouseDown(undo);
    expect(redo.getAttribute('aria-disabled')).toBe('false');
  });

  it('⚠️ never undoes the LOADING of the note — only what the person did', () => {
    /*
      ⚠️ O bug que um botão de desfazer à vista tornaria fácil de achar: a tela
      carrega o rascunho ou a nota do servidor DEPOIS de montar o editor, e o
      `setContent` do sincronismo entrava no histórico. Um toque em ↶ logo
      depois de abrir a anotação APAGAVA a nota carregada — e o autosave
      gravava o vazio.
    */
    const emitted: string[] = [];
    const { rerender } = render(
      <RichEditor
        doc={aDoc('')}
        onChange={(doc) => emitted.push(JSON.stringify(doc))}
        penBar="floating"
        redoLabel="Refazer"
        undoLabel="Desfazer"
      />,
    );

    rerender(
      <RichEditor
        doc={aDoc('anotação que veio do servidor')}
        onChange={(doc) => emitted.push(JSON.stringify(doc))}
        penBar="floating"
        redoLabel="Refazer"
        undoLabel="Desfazer"
      />,
    );

    const undo = screen.getByLabelText('Desfazer');
    expect(undo.getAttribute('aria-disabled')).toBe('true');

    fireEvent.mouseDown(undo);
    expect(emitted).toEqual([]);
    expect(document.querySelector('.ProseMirror')?.textContent).toBe(
      'anotação que veio do servidor',
    );
  });
});

describe('the bar rides ABOVE the on-screen keyboard', () => {
  /*
    O teclado do celular não encolhe a janela de layout (iOS sempre; Chrome do
    Android desde a 108, `interactive-widget=resizes-visual`): ele só encolhe a
    janela VISUAL. Um `bottom: 0` fica escondido atrás dele. Quem sabe quanto o
    teclado cobre é o `visualViewport` — e CSS nenhum lê isso no Safari.

    jsdom não tem `visualViewport`; o fake abaixo é o mínimo que o código lê.
  */
  class FakeVisualViewport extends EventTarget {
    height = 768;
    offsetTop = 0;
    scale = 1;
  }

  function installViewport(): FakeVisualViewport {
    const viewport = new FakeVisualViewport();
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 768,
    });
    return viewport;
  }

  function inset(): string {
    return (penBarNode() as HTMLElement).style.getPropertyValue(
      '--keyboard-inset',
    );
  }

  it('lifts the bar by exactly what the keyboard covers, and drops it when it closes', () => {
    const viewport = installViewport();
    render(
      <RichEditor doc={aDoc()} onChange={() => undefined} penBar="floating" />,
    );

    expect(inset()).toBe('0px');

    // O teclado abre: a janela visual encolhe 300px.
    viewport.height = 468;
    viewport.dispatchEvent(new Event('resize'));
    expect(inset()).toBe('300px');

    // O iOS rola a janela visual dentro da de layout: o que fica coberto é o
    // que sobra ABAIXO dela.
    viewport.offsetTop = 100;
    viewport.dispatchEvent(new Event('scroll'));
    expect(inset()).toBe('200px');

    viewport.height = 768;
    viewport.offsetTop = 0;
    viewport.dispatchEvent(new Event('resize'));
    expect(inset()).toBe('0px');
  });

  it('does not mistake a pinch-zoom for a keyboard', () => {
    const viewport = installViewport();
    render(
      <RichEditor doc={aDoc()} onChange={() => undefined} penBar="floating" />,
    );

    viewport.scale = 2;
    viewport.height = 384;
    viewport.dispatchEvent(new Event('resize'));

    expect(inset()).toBe('0px');
  });

  it('measures nothing when there is no bar', () => {
    installViewport();
    render(<RichEditor doc={aDoc()} onChange={() => undefined} />);

    expect(inset()).toBe('');
  });
});

describe('⚠️ the Aa opens the SAME controls as the bubble menu (decision E)', () => {
  it('renders, under the Aa, exactly the shared list — not a copy', () => {
    /*
      ⚠️ **TESTE DE IDENTIDADE, NÃO DE PRESENÇA.** A lista esperada é
      `FORMAT_CONTROLS`, importada da PRODUÇÃO — não uma segunda lista escrita
      aqui. Duas cópias divergem na primeira correção, e este repositório já
      pagou isso três vezes (o `GUILT_TERMS` até a Tarefa 19, o `dayRange` do
      `CLAUDE.md`, o "Alguém do clube" em três chaves da Tarefa 40).

      ⚠️ **E O LIMITE HONESTO DESTA METADE, medido:** o conteúdo do bubble menu
      NÃO é alcançável por `document.querySelector` no jsdom — o `BubbleMenuView`
      do TipTap chama `element.remove()` no construtor e o tippy só o reanexa ao
      `body` quando MOSTRA, o que não acontece sem layout (medido: zero
      `[data-tippy-root]` depois de selecionar e disparar `mouseup`). Por isso a
      identidade tem duas metades, e a segunda (o `it` abaixo) é estrutural.
    */
    render(
      <RichEditor doc={aDoc()} onChange={() => undefined} penBar="floating" />,
    );

    fireEvent.mouseDown(screen.getByLabelText('Formatar o texto'));

    const popover = document.querySelector('[data-editor-format]');
    expect(popover).not.toBeNull();
    expect(labelsIn(popover as Element)).toEqual(
      FORMAT_CONTROLS.map((control) => control.label),
    );
    /*
      ⚠️ **E O PINO ESCRITO À MÃO, que é outra propriedade — e sem ele a
      comparação acima é a ASSERÇÃO AUTO-AJUSTÁVEL do §7.8.** Medido: apagando
      o controle de "Citação" da `FORMAT_CONTROLS`, os DOIS lados da igualdade
      encolhem juntos e ela continua verde; o único acusador era a pré-condição
      de contagem, que não diz QUAL controle sumiu.

      A lista abaixo é o CANVAS (`Dia.dc.html:65-70`), copiado uma vez para cá
      de propósito — é o molde do `EXPECTED_PALETTE` de
      `highlight-palette.test.tsx`. A identidade ENTRE AS DUAS ÂNCORAS é outro
      assunto, e é do `it()` estrutural logo abaixo.
    */
    expect(FORMAT_CONTROLS.map((control) => control.label)).toEqual([
      'Negrito',
      'Itálico',
      'Código',
      'Título 1',
      'Título 2',
      'Citação',
    ]);
  });

  it('⚠️ keeps ONE list for the two anchors — neither declares a button of its own', () => {
    /*
      A metade ESTRUTURAL da identidade, e ela é a que pega o mutante que a
      regra 4 da spec nomeia: *acrescente um controle a um só*.

      A propriedade é "um conjunto, duas âncoras": existe UMA declaração de
      `FormatControls`, e cada âncora renderiza essa e nada mais. Um
      `<ToolButton>` escrito dentro de um dos dois `return` é exatamente como as
      duas listas passam a divergir — e a metade renderizada acima só pega o
      lado do `Aa`.
    */
    const code = stripComments(readFileSync(source, 'utf8'));

    expect(code.split('function FormatControls(')).toHaveLength(2);

    for (const anchor of [bubbleAnchor(code), formatPopover(code)]) {
      expect(anchor).toContain('<FormatControls editor={editor} />');
      expect(anchor).not.toContain('<ToolButton');
    }
  });
});

/** O corpo do `<BubbleMenu>` — a primeira âncora do conjunto compartilhado. */
function bubbleAnchor(code: string): string {
  return between(code, '<BubbleMenu', '</BubbleMenu>');
}

/** O corpo do popover do `Aa` — a segunda âncora. */
function formatPopover(code: string): string {
  return between(code, 'data-editor-format=', '</div>');
}

function between(code: string, from: string, to: string): string {
  const start = code.indexOf(from);
  const end = code.indexOf(to, start);
  if (start < 0 || end < 0) {
    throw new Error(`âncora não encontrada no fonte: ${from} … ${to}`);
  }
  return code.slice(start, end);
}

describe('⚠️ every new button answers to mousedown and touchend (§4.4, rule K)', () => {
  it('keeps the mobile keyboard open on the pens, on the Aa and on the /', () => {
    /*
      ⚠️ O PAR DE COMPORTAMENTO da varredura estática de
      `editor-touch-handlers.test.ts`: sem o `preventDefault`, o `mousedown`
      move o foco para o botão, o ProseMirror perde a seleção e **o teclado do
      celular fecha** — a cada toque. O `new-ui.md` diz que o app é usado *"à
      noite, na cama"*.

      `fireEvent` devolve `false` quando o handler chamou `preventDefault`.
    */
    render(
      <RichEditor doc={aDoc()} onChange={() => undefined} penBar="floating" />,
    );

    for (const label of [
      ...HIGHLIGHT_COLORS.map((pen) => pen.label),
      'Formatar o texto',
      'Abrir o menu de blocos',
    ]) {
      expect(fireEvent.mouseDown(screen.getByLabelText(label))).toBe(false);
      expect(fireEvent.touchEnd(screen.getByLabelText(label))).toBe(false);
    }
  });

  it('marks the pen that is ON — the ring of the canvas', () => {
    /*
      `Dia.dc.html:106`: a caneta selecionada ganha
      `box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--gold)`. Quem
      carrega o estado é o BOTÃO (`aria-pressed`), e a bolinha é um `<span>`
      decorativo dentro dele — o alvo de toque tem 44px e a bolinha 22px.

      Sem isto, quem grifou de amarelo e quer trocar para verde não tem como
      saber o que está ligado, e apertar a mesma caneta de novo (que é como se
      tira o grifo) parece não fazer nada.
    */
    render(
      <RichEditor doc={aDoc()} onChange={() => undefined} penBar="floating" />,
    );

    const yellow = screen.getByLabelText('Caneta amarela');
    const green = screen.getByLabelText('Caneta verde');
    expect(yellow.getAttribute('aria-pressed')).toBe('false');

    fireEvent.mouseDown(yellow);

    expect(yellow.getAttribute('aria-pressed')).toBe('true');
    // E só a ligada: um `active` que devolvesse `true` para todas seria
    // igualmente inútil.
    expect(green.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('⚠️ the / button inserts the character and opens the menu that exists', () => {
  it('types a / into the document instead of reimplementing the menu', () => {
    /*
      Decisão F: `slash-command.ts` NÃO muda. O botão é um atalho para quem não
      tem teclado físico — ele insere o caractere, e a extensão `Suggestion` que
      já existe faz o resto. Reimplementar a lista aqui seria o segundo nome
      para a mesma coisa.
    */
    const emitted: Array<Record<string, unknown>> = [];

    render(
      <RichEditor
        doc={aDoc()}
        onChange={(doc) => emitted.push(doc)}
        penBar="floating"
      />,
    );

    fireEvent.mouseDown(screen.getByLabelText('Abrir o menu de blocos'));

    expect(JSON.stringify(emitted)).toContain('/');
  });
});

describe('the hint of the / — the third leaf of editor.* to get a consumer', () => {
  it('shows what the screen gave it, and nothing when the screen gave nothing', () => {
    /*
      ⚠️ `editor.slashHint` chega por PROP, como as duas do upload: `packages/ui`
      **não chama `t()`** (`no-i18n.test.ts`), então toda folha de `editor.*` é
      lida pela tela (`docs/EDITOR.md` §10, corrigido na auditoria da Tarefa 40).

      O canvas a desenha à direita da barra do DESKTOP
      (`DiaDesktop.dc.html:92`), e ela não existe na barra do celular
      (`Dia.dc.html:103-126`) — daí `hidden min-[1120px]:block`, que é a mesma
      media query da altura.
    */
    const { rerender } = render(
      <RichEditor
        doc={aDoc()}
        onChange={() => undefined}
        penBar="floating"
        slashHintLabel="Digite / para inserir um bloco"
      />,
    );

    const hint = document.querySelector('[data-editor-slash-hint]');
    expect(hint?.textContent).toBe('Digite / para inserir um bloco');
    expect(hint?.className).toContain('hidden');
    expect(hint?.className).toContain('min-[1120px]:block');

    rerender(
      <RichEditor doc={aDoc()} onChange={() => undefined} penBar="floating" />,
    );

    // Ausente ≠ vazio: sem a frase não nasce elemento nenhum.
    expect(document.querySelector('[data-editor-slash-hint]')).toBeNull();
  });
});
