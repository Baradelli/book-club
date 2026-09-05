import { Editor } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';

import { buildExtensions } from '../RichEditor';

/**
 * O CAMINHO DE *DROP* DO §8 — soltar um arquivo de imagem dentro da anotação.
 *
 * ⚠️ POR QUE ESTE ARQUIVO NASCEU NA RODADA DE CORREÇÃO: o `handleDrop` era
 * INVISÍVEL para a suíte, e dois mutantes sobreviviam aos 152 testes:
 *
 * - inverter a guarda `if (moved) return false` — arrastar um parágrafo de
 *   lugar DENTRO do documento passava a tentar subir arquivo, e o parágrafo
 *   não se movia;
 * - ignorar a posição do drop (`onFiles(files)` em vez de
 *   `onFiles(files, at?.pos)`) — a imagem entrava onde o cursor estava
 *   parado, não onde a pessoa a soltou.
 *
 * A causa medida não era descuido de quem escreveu: o `handleDrop` não era
 * ALCANÇÁVEL no jsdom. O `prosemirror-view` estoura antes de chamar o nosso
 * handler, em `posAtCoords`:
 *
 *     TypeError: (…).elementFromPoint is not a function
 *
 * ============================================================================
 * A ESCOLHA: ESTIMULAR O `elementFromPoint`, E NÃO EXTRAIR UM HELPER PURO
 * ============================================================================
 *
 * A alternativa era extrair um helper puro de posição e testá-lo. Não foi
 * adotada por dois motivos medidos:
 *
 * 1. `moved` é conceito do ProseMirror, não nosso: um helper que o recebesse
 *    de parâmetro deixaria a LIGAÇÃO (quem lê o `moved` do `handleDrop` e o
 *    passa) exatamente tão sem teste quanto antes. O mutante mudaria de lugar,
 *    não morreria.
 * 2. Com uma linha de setup, o caminho REAL fica alcançável — o plugin
 *    registrado, o `view.posAtCoords` de verdade, o `event.dataTransfer` de
 *    verdade. Testar o helper em vez do caminho é trocar a propriedade por uma
 *    parecida.
 *
 * ⚠️ E O LIMITE HONESTO DO SETUP: o jsdom não tem layout, então a posição que
 * o `posAtCoords` devolve aqui (`0`, o começo do documento) é artefato do
 * ambiente, não geometria. O que este arquivo prova NÃO é "a imagem cai no
 * pixel onde foi solta" — isso é da checklist §14, no aparelho. É que a
 * posição vem do DROP e não do CURSOR, e é por isso que o cursor é levado
 * para o fim do documento antes de cada drop e essa precondição é PINADA: sem
 * ela, `0` poderia coincidir com onde o cursor estava e o mutante passaria
 * (`docs/CONVENCOES-CODIGO.md` §7.2 — fixture de posição se escolhe para a
 * implementação errada FALHAR).
 */

/** Fixture é factory (§7.7). */
function anImage(name = 'print.png'): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, {
    type: 'image/png',
  });
}

function aDoc(): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'primeiro' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'segundo' }] },
    ],
  };
}

/**
 * O `dataTransfer` de um arquivo arrastado do sistema: arquivo de imagem e
 * nenhum texto. `files` é `ArrayLike` porque é o que o navegador entrega —
 * uma `FileList` não tem `map` nem `filter` (§7.1).
 */
function aTransfer(files: File[]) {
  return {
    types: ['Files'],
    files: {
      length: files.length,
      ...Object.fromEntries(files.map((file, index) => [index, file])),
    },
    getData: () => '',
    setData: () => undefined,
    clearData: () => undefined,
  };
}

interface DropCall {
  names: string[];
  position: number | undefined;
}

interface Harness {
  editor: Editor;
  calls: DropCall[];
  /** Solta o arquivo no editor. `moved` = arrastar DENTRO do documento. */
  drop: (files: File[], options?: { moved?: boolean }) => void;
}

function aHarness(): Harness {
  const calls: DropCall[] = [];
  const element = document.createElement('div');
  document.body.append(element);

  const editor = new Editor({
    element,
    content: aDoc(),
    extensions: buildExtensions({
      onFiles: (files, position) => {
        calls.push({ names: files.map((file) => file.name), position });
      },
    }),
  });

  /*
    ⚠️ A ÚNICA LINHA DE FICÇÃO, e ela é a mesma classe do fake do tippy: o
    jsdom não implementa `elementFromPoint` (não há layout para consultar), e
    sem ela o `posAtCoords` do `prosemirror-view` estoura antes de o nosso
    handler existir. Devolver o próprio elemento editável é o que o navegador
    devolveria para um ponto dentro do editor.

    Ela vai no `document` porque é lá que o `posAtCoords` procura
    (`view.root.elementFromPoint ? view.root : doc`), e sai no `afterEach`.
  */
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => editor.view.dom,
    writable: true,
  });

  return {
    editor,
    calls,
    drop: (files, { moved = false } = {}) => {
      /*
        `view.dragging` é o que o ProseMirror mesmo põe no `dragstart`, e é o
        que faz o `moved` do `handleDrop` valer `true`
        (`move = !!(dragging && dragMoves(view, event))`). Setá-lo é a forma
        fiel de simular "arrastei um parágrafo daqui para ali" sem inventar
        geometria de arraste.
      */
      editor.view.dragging = moved ? { slice: Slice.empty, move: true } : null;

      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.assign(event, {
        dataTransfer: aTransfer(files),
        clientX: 10,
        clientY: 10,
      });
      editor.view.dom.dispatchEvent(event);
    },
  };
}

afterEach(() => {
  delete (document as unknown as Record<string, unknown>)['elementFromPoint'];
});

describe('dropping an image file (§8)', () => {
  it('hands the files over with the position of the DROP, not of the cursor', () => {
    const harness = aHarness();

    // O cursor vai para o FIM: é o que torna a propriedade decidível.
    harness.editor.commands.focus('end');
    const cursor = harness.editor.state.selection.from;
    // A PRECONDIÇÃO PINADA (§7.2): se o cursor estivesse em 0, o mutante que
    // ignora a posição do drop passaria por coincidência.
    expect(cursor).toBeGreaterThan(0);

    harness.drop([anImage()]);

    expect(harness.calls).toEqual([{ names: ['print.png'], position: 0 }]);
  });

  it('ignores a drag that only moves content inside the document', () => {
    /*
      ⚠️ A GUARDA `if (moved) return false`, e o que a inversão dela causa:
      arrastar um parágrafo de um lugar para outro DENTRO da anotação passaria
      pelo caminho de upload. O parágrafo não se moveria (o `return true` come
      o evento) e, se o arraste carregasse arquivo, o conteúdo seria
      DUPLICADO. Devolver `false` é o que deixa o ProseMirror fazer o trabalho
      dele.
    */
    const harness = aHarness();

    harness.drop([anImage()], { moved: true });

    expect(harness.calls).toEqual([]);
  });

  it('ignores a drop that carries no image at all', () => {
    // Arrastar um `.pdf` para dentro da anotação não é upload de imagem: o
    // `extractImageFiles` descarta, e o handler devolve `false`.
    const harness = aHarness();
    const pdf = new File([new Uint8Array([37, 80, 68, 70])], 'contrato.pdf', {
      type: 'application/pdf',
    });

    harness.drop([pdf]);

    expect(harness.calls).toEqual([]);
  });
});
