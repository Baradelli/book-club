import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RichEditor } from '../RichEditor';

/**
 * REGRAS 2 e 4 da Tarefa 14 — as duas que só um editor DE VERDADE prova.
 *
 * Aqui o `RichEditor` é montado, uma imagem é colada, e o que se afirma é o
 * `doc`: nada de `blob:`/`data:` antes do upload resolver (ADR 0001), e nada
 * de `NotFoundError` do React quando a pílula de estado aparece (§11).
 *
 * ⚠️ O `tippy.js` AQUI É O DE VERDADE. Havia um fake (`tippy-fake.ts`) e um
 * alias em `vitest.config.ts`, com a justificativa de que "o fake precisa
 * reparentear, senão o teste da §11 não reproduz o bug". A auditoria mediu as
 * duas metades e as duas eram falsas: o fake parar de reparentear deixava a
 * suíte igual, e o alias removido também. Quem destaca o elemento do container
 * é o `element.remove()` do construtor do `BubbleMenuView` — o TipTap, não o
 * tippy — e é dele que o `NotFoundError` da §11 nasce. O fake e o alias foram
 * apagados: peça móvel que não sustenta nada, com um comentário afirmando que
 * sustentava (`docs/CONVENCOES-CODIGO.md` §7.1).
 */

/** Fixture é factory (§7.7). */
function aDoc(): Record<string, unknown> {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

function anImage(name = 'print.png'): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, {
    type: 'image/png',
  });
}

/**
 * O clipboard de um PRINT DE TELA: arquivo de imagem e nenhum texto.
 *
 * `files` como `ArrayLike` (e não `Array`) porque é o que o navegador entrega
 * — uma `FileList` não tem `map` nem `filter` (§7.1).
 */
function anImageClipboard(files: File[]) {
  return {
    types: ['Files'],
    files: {
      length: files.length,
      ...Object.fromEntries(files.map((file, index) => [index, file])),
    },
    getData: () => '',
  };
}

function proseMirror(): Element {
  const dom = document.querySelector('.ProseMirror');
  if (dom === null) throw new Error('o editor não renderizou o ProseMirror');
  return dom;
}

/** Uma promessa que o teste solta na hora que quiser: o "upload que demora". */
function heldUpload(url: string) {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const uploaded: string[] = [];

  return {
    uploaded,
    release: () => release(),
    upload: async (file: File): Promise<string> => {
      uploaded.push(file.name);
      await held;
      return url;
    },
  };
}

/** Uma seleção de texto, que é o que faz o bubble menu existir de verdade. */
function selectAll(): void {
  const dom = proseMirror();
  const range = document.createRange();
  range.selectNodeContents(dom);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.mouseUp(dom);
}

describe('pasting an image (rule 2, ADR 0001)', () => {
  it('inserts the node only AFTER the upload resolves, with the final URL', async () => {
    /*
      ⚠️ A REGRA DO ADR 0001: nunca um `blob:` nem um `data:` no `doc`. O
      documento vai para o banco; uma URL temporária gravada lá aponta para a
      memória de um navegador que já fechou — a imagem quebra em qualquer
      outro aparelho, e não há como recuperá-la.

      O upload é retido de propósito ("upload que demora"), porque é entre o
      paste e a resolução que o bug moraria: é aí que um `blob:` "provisório"
      seria inserido para a pessoa ver a imagem logo.
    */
    const uploader = heldUpload('https://cdn.clube/print.png');
    const emitted: Array<Record<string, unknown>> = [];

    render(
      <RichEditor
        doc={aDoc()}
        onChange={(doc) => emitted.push(doc)}
        onUploadImage={uploader.upload}
      />,
    );

    fireEvent.paste(proseMirror(), {
      clipboardData: anImageClipboard([anImage()]),
    });

    // O upload COMEÇOU...
    expect(uploader.uploaded).toEqual(['print.png']);
    // ...a pessoa está vendo que algo acontece...
    expect(screen.getByText('Enviando imagem…')).toBeDefined();
    // ...e o documento continua SEM imagem nenhuma.
    expect(document.querySelector('.ProseMirror img')).toBeNull();
    expect(JSON.stringify(emitted)).not.toContain('image');

    uploader.release();

    await waitFor(() => {
      expect(document.querySelector('.ProseMirror img')).not.toBeNull();
    });

    const image = document.querySelector('.ProseMirror img');
    expect(image?.getAttribute('src')).toBe('https://cdn.clube/print.png');

    // E o que foi emitido para a tela guardar não tem URL temporária.
    const serialized = JSON.stringify(emitted);
    expect(serialized).toContain('https://cdn.clube/print.png');
    expect(serialized).not.toContain('blob:');
    expect(serialized).not.toContain('data:');

    // A pílula sai quando acaba: um "Enviando…" que fica é indistinguível de
    // um upload travado.
    await waitFor(() => {
      expect(screen.queryByText('Enviando imagem…')).toBeNull();
    });
  });

  it('shows the failure and keeps the document untouched', async () => {
    const emitted: Array<Record<string, unknown>> = [];

    render(
      <RichEditor
        doc={aDoc()}
        onChange={(doc) => emitted.push(doc)}
        onUploadImage={() => Promise.reject(new Error('rede caiu'))}
        uploadFailedLabel="Falha ao enviar"
      />,
    );

    fireEvent.paste(proseMirror(), {
      clipboardData: anImageClipboard([anImage()]),
    });

    await waitFor(() => {
      expect(screen.getByText('Falha ao enviar')).toBeDefined();
    });

    // Nenhuma imagem, e nenhuma emissão: o documento não mudou.
    expect(document.querySelector('.ProseMirror img')).toBeNull();
    expect(emitted).toEqual([]);
  });

  it('does nothing when the editor has no uploader', () => {
    // Sem `onUploadImage` a extensão nem é registrada, então o paste de imagem
    // é ignorado — e o `doc` continua igual. O nó `image` continua existindo
    // (uma anotação antiga com imagem tem de renderizar), o que se prova em
    // `editor-extensions.test.ts`.
    const emitted: Array<Record<string, unknown>> = [];

    render(<RichEditor doc={aDoc()} onChange={(doc) => emitted.push(doc)} />);

    fireEvent.paste(proseMirror(), {
      clipboardData: anImageClipboard([anImage()]),
    });

    expect(emitted).toEqual([]);
    expect(screen.queryByText('Enviando imagem…')).toBeNull();
  });
});

describe('the mount trap of §11 (rule 4)', () => {
  it('survives a paste of an image with the bubble menu mounted', async () => {
    /*
      ⚠️ O TESTE DE REGRESSÃO, e o que ele pega:

      O `BubbleMenuView` do TipTap chama `element.remove()` no elemento que o
      React renderizou dentro do container do editor, e o entrega ao tippy, que
      o reparenteia para o `body`. O React continua acreditando que aquele
      elemento é filho do container. A partir daí, qualquer irmão CONDICIONAL
      que apareça ANTES dele faz o React chamar
      `container.insertBefore(novo, elementoDoBubbleMenu)` — e o DOM responde
      `NotFoundError: The node before which the new node is to be inserted is
      not a child of this node`. A tela morre no meio de um paste de imagem.

      Aqui o caminho inteiro é exercitado: seleção (que cria a view do bubble
      menu e dispara o reparenteamento), paste de imagem (que faz a pílula
      aparecer) e resolução do upload (que a faz desaparecer). Se o React
      estourar em qualquer um dos três, o teste falha.
    */
    const uploader = heldUpload('https://cdn.clube/print.png');

    render(
      <RichEditor
        doc={{
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'trecho selecionado' }],
            },
          ],
        }}
        onChange={() => undefined}
        onUploadImage={uploader.upload}
      />,
    );

    selectAll();

    fireEvent.paste(proseMirror(), {
      clipboardData: anImageClipboard([anImage()]),
    });

    expect(screen.getByText('Enviando imagem…')).toBeDefined();

    uploader.release();

    await waitFor(() => {
      expect(screen.queryByText('Enviando imagem…')).toBeNull();
    });
  });

  it('never mounts or unmounts a sibling, in any state', async () => {
    /*
      ⚠️ ESTE TESTE MUDOU DE ASSERÇÃO NA RODADA DE CORREÇÃO, e o motivo fica
      escrito porque a asserção antiga era ARMADILHA — não fraqueza:

      Ela era `expect(container.lastElementChild).toBe(status)` — "o wrapper é
      o último filho". Medido: um `<div data-editor-footer>` BENIGNO depois do
      wrapper (um contador de palavras, coisa que a Tarefa 18 vai querer)
      deixava este teste VERMELHO sem introduzir defeito nenhum. E o conserto
      óbvio de quem encontrasse esse vermelho seria apagar a asserção — a
      §11 perderia o acusador por um teste que estava errado, não por descuido.

      Pior: "ser o último filho" não é a propriedade que importa. A que importa
      é NENHUM IRMÃO CONDICIONAL MONTAR OU DESMONTAR — e era exatamente essa
      que o código violava (a barra e o bubble menu eram condicionais) com o
      teste antigo VERDE.

      Então a asserção passa a ser de INVARIANTE: a lista de filhos-host do
      container é a MESMA, elemento por elemento, em todo estado que o editor
      tem — parado, enviando imagem, com falha e em somente-leitura. Um irmão
      novo é livre de nascer, desde que nasça montado para sempre.

      A direção que ESTA asserção não cobre, e não deve: montar/desmontar o
      próprio nó reparenteado (o bubble menu), que o TipTap destaca do container
      e por isso nem aparece nesta lista. Quem cobre essa é
      `rich-editor.test.tsx > survives flipping editable in both directions`, e
      ela cobre da única forma honesta: o React estoura.
    */
    const uploader = heldUpload('https://cdn.clube/print.png');

    const { rerender } = render(
      <RichEditor
        doc={aDoc()}
        onChange={() => undefined}
        onUploadImage={uploader.upload}
      />,
    );

    const status = document.querySelector('[data-editor-status]');
    expect(status).not.toBeNull();
    // Sempre montado: mesmo sem upload nenhum acontecendo.
    expect(status?.textContent).toBe('');

    const container = status?.parentElement;
    const siblings = (): Element[] => [...(container?.children ?? [])];

    // Sem isto a comparação abaixo é asserção vazia (§7.4): um container errado
    // devolveria duas listas vazias e iguais.
    const baseline = siblings();
    expect(baseline).toContain(status);
    expect(baseline.length).toBeGreaterThan(2);

    fireEvent.paste(proseMirror(), {
      clipboardData: anImageClipboard([anImage()]),
    });

    // Enviando: a pílula APARECEU dentro do wrapper, e nenhum irmão mudou.
    expect(screen.getByText('Enviando imagem…')).toBeDefined();
    expect(siblings()).toEqual(baseline);

    uploader.release();
    await waitFor(() => {
      expect(screen.queryByText('Enviando imagem…')).toBeNull();
    });
    expect(siblings()).toEqual(baseline);

    // E em somente-leitura, que é onde a barra e o bubble menu desapareciam.
    rerender(
      <RichEditor
        doc={aDoc()}
        editable={false}
        onChange={() => undefined}
        onUploadImage={uploader.upload}
      />,
    );
    expect(siblings()).toEqual(baseline);
  });
});
