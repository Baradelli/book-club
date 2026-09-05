import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { RichEditor, syncEditorContent } from '../RichEditor';

/**
 * REGRAS 6, 7 e 9 da Tarefa 14 — o contrato do editor com a TELA.
 *
 * As três são invisíveis quando quebram: o eco de conteúdo mexe no cursor de
 * quem digita (não dá erro), o formato errado só aparece quando a anotação for
 * reaberta meses depois, e um `aria-pressed` congelado só é percebido por quem
 * usa leitor de tela.
 */

/** Fixture é factory (§7.7) — e o `doc` é uma árvore MUTÁVEL por dentro. */
function aDoc(text = ''): Record<string, unknown> {
  // Parágrafo SEM `content` quando o texto é vazio: o ProseMirror recusa nó de
  // texto vazio ("Empty text nodes are not allowed"), e o TipTap engole isso
  // como um aviso no console e um documento em branco — um fixture inválido
  // que faria os testes provarem outra coisa.
  return {
    type: 'doc',
    content: [
      text === ''
        ? { type: 'paragraph' }
        : { type: 'paragraph', content: [{ type: 'text', text }] },
    ],
  };
}

/**
 * Colar texto é a única forma de "digitar" no ProseMirror dentro do jsdom: o
 * `keydown` de uma letra não insere nada (num navegador é o próprio navegador
 * que insere, e o ProseMirror lê a mutação depois).
 */
function pasteText(text: string): void {
  const dom = document.querySelector('.ProseMirror');
  if (dom === null) throw new Error('o editor não renderizou o ProseMirror');

  fireEvent.paste(dom, {
    clipboardData: {
      types: ['text/plain'],
      files: [],
      getData: (format: string) => (format === 'text/plain' ? text : ''),
    },
  });
}

describe('syncEditorContent (rule 6)', () => {
  /** Fake com CONTADOR (§7.3): é o que separa "não chamou" de "chamou à toa". */
  function aTarget(current: Record<string, unknown>) {
    const replaced: Array<Record<string, unknown>> = [];
    return {
      replaced,
      currentDoc: () => current,
      replaceContent: (doc: Record<string, unknown>) => {
        replaced.push(doc);
      },
    };
  }

  it('does nothing when the incoming doc has the same content', () => {
    /*
      ⚠️ O BUG QUE ISTO IMPEDE, em ordem: a tela guarda o `doc` em estado, o
      editor emite `onChange` a cada tecla, a tela re-renderiza com um objeto
      NOVO de conteúdo IGUAL, e o efeito manda o conteúdo de volta para o
      editor. O cursor pula para o começo da frase a cada letra digitada.

      Objeto novo, conteúdo igual: é exatamente o que uma tela com estado
      produz, e é por isso que a comparação é por VALOR e não por identidade.
    */
    const target = aTarget(aDoc('a leitura de hoje'));

    syncEditorContent(target, aDoc('a leitura de hoje'));

    expect(target.replaced).toEqual([]);
  });

  it('replaces the content when the incoming doc is different', () => {
    // O lado POSITIVO (§7.3): sem ele, um `syncEditorContent` que nunca
    // chamasse nada passaria no teste de cima — e a tela que carrega uma
    // anotação do servidor mostraria o editor vazio.
    const target = aTarget(aDoc('rascunho'));
    const incoming = aDoc('o que o servidor tem');

    syncEditorContent(target, incoming);

    expect(target.replaced).toEqual([incoming]);
  });

  it('does nothing when the screen passes no doc at all', () => {
    // Editor sem `doc` (uma anotação nova): o efeito não pode limpar o que a
    // pessoa já digitou.
    const target = aTarget(aDoc('já escrevi isto'));

    syncEditorContent(target, undefined);

    expect(target.replaced).toEqual([]);
  });
});

describe('what onChange emits (rule 7)', () => {
  it('emits ProseMirror JSON, never HTML', () => {
    /*
      ADR 0001: o `doc` é o JSON nativo do ProseMirror. HTML é LOSSY na volta —
      reabrir passa por um parser que adivinha a estrutura, e um nó
      customizado (aviso, wikilink, tarefa) depende de `parseHTML` correto para
      sobreviver ao round-trip. Um bug ali corromperia em silêncio uma anotação
      antiga, que é justamente o dado que não pode se perder.
    */
    const emitted: Array<Record<string, unknown>> = [];
    render(<RichEditor doc={aDoc('')} onChange={(doc) => emitted.push(doc)} />);

    pasteText('primeira anotação');

    const last = emitted[emitted.length - 1];
    expect(emitted.length).toBeGreaterThan(0);
    expect(last?.['type']).toBe('doc');
    expect(Array.isArray(last?.['content'])).toBe(true);
    // E o texto está lá — sem isto, um `onChange` chamado com `{type:'doc'}`
    // vazio passaria provando só o formato.
    expect(JSON.stringify(last)).toContain('primeira anotação');
    // Nada de tag: um `getHTML()` no lugar do `getJSON()` traria `<p>`.
    expect(JSON.stringify(last)).not.toContain('<p>');
  });

  it('emits nothing just for being mounted', () => {
    /*
      ⚠️ MEDIDO NESTA FATIA, e o `EDITOR.md` não prevê: `editor.setEditable(x)`
      do TipTap EMITE um `update` mesmo quando nada mudou (o segundo parâmetro
      é `emitUpdate`, e o default é `true`). Com um `setEditable` solto no
      efeito de montagem, o editor chamava `onChange` com o documento INTACTO
      no primeiro render.

      Por que isso importa mais do que parece: o autosave da Tarefa 18 escuta
      `onChange`. Um `onChange` na montagem é uma GRAVAÇÃO por anotação aberta
      — o `updatedAt` de toda anotação do clube mudaria só por alguém ter
      lido, e a lista "escreveu hoje" mentiria.
    */
    const emitted: Array<Record<string, unknown>> = [];

    render(
      <RichEditor
        doc={aDoc('já escrito')}
        onChange={(doc) => emitted.push(doc)}
      />,
    );

    expect(emitted).toEqual([]);
  });

  it('emits nothing when the screen only flips editable', () => {
    /*
      ⚠️ A SEGUNDA METADE do `setEditable(editable, false)`, e ela não tem nada
      a ver com a primeira: a guarda (`isEditable === editable`) protege o
      render que não mudou nada; o `false` (o `emitUpdate`) protege a TROCA de
      verdade. Mutar só o segundo parâmetro para `true` sobrevive a todo o
      resto da suíte — e o efeito real, na Tarefa 18, é um AUTOSAVE ESPÚRIO:
      apertar "editar" numa anotação grava a anotação inteira sem ninguém ter
      digitado uma letra, e o `updatedAt` passa a mentir.

      Mudar a permissão de escrita não é mudar o conteúdo. O documento aqui é o
      mesmo objeto nas duas renderizações, de propósito: o que muda é só
      `editable`.
    */
    const emitted: Array<Record<string, unknown>> = [];
    const doc = aDoc('já escrito');

    const { rerender } = render(
      <RichEditor doc={doc} onChange={(next) => emitted.push(next)} />,
    );

    rerender(
      <RichEditor
        doc={doc}
        editable={false}
        onChange={(next) => emitted.push(next)}
      />,
    );

    expect(emitted).toEqual([]);
  });

  it('emits nothing when the screen loads a doc by prop', () => {
    /*
      ⚠️ O `false` do `setContent(incoming, false)`, que também é `emitUpdate`
      — e o mutante que o liga sobrevive a todo o resto da suíte, porque o
      conteúdo aparece na tela do mesmo jeito.

      Duas consequências reais, e nenhuma delas é visível: a tela da Tarefa 18
      carrega a anotação do servidor, o editor chama `onChange` com o que
      acabou de RECEBER, e o autosave grava — UM autosave por anotação aberta.
      E o carregamento entra no HISTÓRICO: o primeiro `Ctrl+Z` de quem começa a
      escrever desfaz o texto que estava salvo.

      Aqui o `doc` chega por prop, como a tela faz quando a resposta do
      servidor volta: o editor montou com um documento e recebe outro.
    */
    const emitted: Array<Record<string, unknown>> = [];

    const { rerender } = render(
      <RichEditor
        doc={aDoc('rascunho local')}
        onChange={(next) => emitted.push(next)}
      />,
    );

    rerender(
      <RichEditor
        doc={aDoc('o que o servidor tem')}
        onChange={(next) => emitted.push(next)}
      />,
    );

    // O conteúdo TROCOU (sem isto o teste passaria com um sincronismo que não
    // faz nada — §7.4)...
    expect(screen.getByText('o que o servidor tem')).toBeDefined();
    // ...e nada foi emitido para a tela.
    expect(emitted).toEqual([]);
  });

  it('does not echo back what the screen just stored', () => {
    /*
      O laço fechado, montado como a Tarefa 18 vai montar: a tela guarda o
      `doc` que o editor emitiu e o devolve como prop. Se o sincronismo
      mandasse esse conteúdo de volta com `emitUpdate` ligado, cada tecla
      geraria um `onChange` novo — laço infinito, e o teste não terminaria.

      Aqui o que se afirma é o número de emissões: UMA colagem, UM `onChange`.
    */
    const emitted: Array<Record<string, unknown>> = [];

    function Screen() {
      const [doc, setDoc] = useState<Record<string, unknown>>(aDoc(''));
      return (
        <RichEditor
          doc={doc}
          onChange={(next) => {
            emitted.push(next);
            setDoc(next);
          }}
        />
      );
    }

    render(<Screen />);
    pasteText('uma vez só');

    expect(emitted).toHaveLength(1);
    expect(screen.getByText('uma vez só')).toBeDefined();
  });
});

describe('the toolbar (rules 8 and 9)', () => {
  it('reflects the active mark in aria-pressed', () => {
    // Um `aria-pressed` congelado não aparece na tela (a cor do botão vem da
    // mesma variável), mas quem usa leitor de tela ouve "não pressionado" com
    // o negrito ligado — e não tem como saber o estado de outro jeito.
    render(<RichEditor doc={aDoc('')} onChange={() => undefined} />);

    const bold = screen.getByLabelText('Negrito');
    expect(bold.getAttribute('aria-pressed')).toBe('false');

    fireEvent.mouseDown(bold);

    expect(bold.getAttribute('aria-pressed')).toBe('true');
  });

  it('prevents the default of mousedown, so the mobile keyboard stays open', () => {
    /*
      ⚠️ O PAR DE COMPORTAMENTO do teste estático da regra 8: sem o
      `preventDefault`, o `mousedown` move o foco para o botão, o ProseMirror
      perde a seleção e O TECLADO DO CELULAR FECHA — a cada botão apertado.

      `fireEvent` devolve `false` quando o handler chamou `preventDefault`.
    */
    render(<RichEditor doc={aDoc('')} onChange={() => undefined} />);

    expect(fireEvent.mouseDown(screen.getByLabelText('Negrito'))).toBe(false);
    expect(fireEvent.touchEnd(screen.getByLabelText('Negrito'))).toBe(false);
    expect(fireEvent.mouseDown(screen.getByLabelText('Grifo amarelo'))).toBe(
      false,
    );
  });

  it('reflects the active highlight color in aria-pressed', () => {
    /*
      ⚠️ A REGRA 9 APLICADA ÀS CINCO AMOSTRAS, e não só ao negrito — medido: com
      `active={editor.isActive('highlight', { color })}` trocado por `false` nas
      cinco, a suíte ficava VERDE.

      O que se perde é a única informação que a amostra dá: o contorno da cor
      LIGADA (`[aria-pressed='true'] > .clube-editor-swatch`, no `editor.css`).
      Sem ele, quem grifou de amarelo e quer trocar para verde não tem como
      saber o que está ligado — e o `unsetHighlight` da borracha parece não ter
      feito nada.
    */
    render(<RichEditor doc={aDoc('trecho')} onChange={() => undefined} />);

    const yellow = screen.getByLabelText('Grifo amarelo');
    const green = screen.getByLabelText('Grifo verde');
    expect(yellow.getAttribute('aria-pressed')).toBe('false');

    fireEvent.mouseDown(yellow);

    expect(yellow.getAttribute('aria-pressed')).toBe('true');
    // E só a cor ligada: um `active` que devolvesse `true` para todas seria
    // igualmente inútil.
    expect(green.getAttribute('aria-pressed')).toBe('false');

    fireEvent.mouseDown(screen.getByLabelText('Remover grifo'));

    expect(yellow.getAttribute('aria-pressed')).toBe('false');
  });

  it('is not rendered when the editor is read-only', () => {
    // Uma anotação de outra pessoa (§4: as três superfícies só existem quando
    // `editable`). Barra visível sem poder escrever é um botão que não faz
    // nada. E "Negrito" cobre as DUAS superfícies condicionais: a barra e o
    // bubble menu têm o mesmo botão.
    render(
      <RichEditor doc={aDoc('')} editable={false} onChange={() => undefined} />,
    );

    expect(screen.queryByLabelText('Negrito')).toBeNull();
    expect(screen.queryByLabelText('Grifo amarelo')).toBeNull();
  });

  it('survives flipping editable in both directions', () => {
    /*
      ⚠️ O ACUSADOR DO CRASH AO VIVO que a auditoria achou no código entregue —
      não era mutante, era a tela morrendo ao virar somente-leitura:

          NotFoundError: The node to be removed is not a child of this node.

      A causa é a §11 esquecida nas duas superfícies que são elas mesmas
      condicionais. O `BubbleMenuView` do TipTap DESTACA o próprio elemento no
      construtor (`element.remove()`), então:

      - `{editable ? <BubbleMenu/> : null}` virando `false` fazia o React
        chamar `removeChild` num nó que já não era filho — morria aqui;
      - e a BARRA, que é condicional e vem ANTES, faria `insertBefore(barra,
        nóDestacado)` ao voltar para `true`. Por isso as DUAS ficam montadas: a
        primeira direção sem a segunda só troca o erro de lugar.

      Nenhum dos 152 testes anteriores cobria esta direção: o teste de leitura
      montava já com `editable={false}`, e o da §11 nunca desmontava o bubble
      menu. O `rerender` nas duas direções é o que fecha o buraco.
    */
    const { rerender } = render(
      <RichEditor doc={aDoc('trecho')} onChange={() => undefined} />,
    );

    expect(screen.getByLabelText('Negrito')).toBeDefined();

    rerender(
      <RichEditor
        doc={aDoc('trecho')}
        editable={false}
        onChange={() => undefined}
      />,
    );

    expect(screen.queryByLabelText('Negrito')).toBeNull();
    // O editor continua VIVO (sem isto, uma tela que estourou e ficou em
    // branco passaria no `queryBy...toBeNull` acima — §7.4).
    expect(screen.getByText('trecho')).toBeDefined();

    rerender(<RichEditor doc={aDoc('trecho')} onChange={() => undefined} />);

    expect(screen.getByLabelText('Negrito')).toBeDefined();
    expect(screen.getByText('trecho')).toBeDefined();
  });
});
