import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';

import { buildExtensions } from '../RichEditor';
import { itemsFor } from '../slash-command';

/**
 * REGRAS 11, 12 e 13 da Tarefa 14 — o que o editor TEM registrado.
 *
 * As três quebram em silêncio, e cada uma de um jeito:
 *
 * - **12**: a extensão condicional que vira incondicional não dá erro nenhum —
 *   ela só faz a tela de login carregar o popup de menção e o ProseMirror
 *   inteiro por nada. E o contrário é pior: o nó `image` sair junto com o
 *   upload faria uma anotação ANTIGA com imagem parar de renderizar (o nó
 *   desconhecido é descartado no parse — a imagem desaparece do documento).
 * - **11**: o item "Imagem" oferecido sem upload abre o seletor de arquivo do
 *   sistema e não tem para onde mandar o arquivo.
 * - **13**: um H3 disponível não quebra nada — só produz três níveis de título
 *   num app de leitura, que é indecisão, e um documento com H3 que nenhum
 *   estilo do `editor.css` pinta.
 *
 * Os testes leem a lista de extensões diretamente, por isso `buildExtensions`
 * é exportado: montar o componente para descobrir se a menção está registrada
 * exigiria um popup aberto.
 */

const editors: Editor[] = [];

/** Um editor de verdade, sem tela: é o que responde `can()` e `storage`. */
function anEditor(options: Parameters<typeof buildExtensions>[0]): Editor {
  const editor = new Editor({ extensions: buildExtensions(options) });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function namesOf(options: Parameters<typeof buildExtensions>[0]): string[] {
  return buildExtensions(options).map((extension) => extension.name);
}

describe('conditional extensions (rule 12)', () => {
  it('registers the blocks the editor always has', () => {
    // Sem isto tudo abaixo é asserção vazia (§7.4): um `buildExtensions` que
    // devolvesse `[]` deixaria todo `not.toContain` verde.
    const names = namesOf({});

    expect(names).toContain('starterKit');
    expect(names).toContain('highlight');
    expect(names).toContain('taskList');
    expect(names).toContain('details');
    expect(names).toContain('table');
    expect(names).toContain('callout');
    expect(names).toContain('slashCommand');
  });

  it('leaves mention and wikilink out when there is no search', () => {
    const names = namesOf({});

    expect(names).not.toContain('mention');
    expect(names).not.toContain('wikilink');
  });

  it('registers both mention and wikilink when there is a search', () => {
    const names = namesOf({ noteSearch: async () => [] });

    // OS DOIS, e é o par que importa: o wikilink é uma extensão DERIVADA da
    // menção, e é justamente por isso que ele já foi engolido por ela uma vez
    // (§9). Um teste que só olhasse `mention` passaria com o `[[` morto.
    expect(names).toContain('mention');
    expect(names).toContain('wikilink');
  });

  it('keeps the image NODE registered even without upload', () => {
    /*
      ⚠️ A assimetria que este teste pina: sem `onUploadImage` não há upload,
      mas o nó `image` continua registrado. Sem ele, abrir uma anotação antiga
      que tem imagem descartaria o nó no parse — a imagem sai do documento, e
      o próximo salvamento gravaria o documento sem ela. Perda de dado, em
      silêncio.
    */
    const names = namesOf({});

    expect(names).toContain('image');
    expect(names).not.toContain('imageUpload');
  });

  it('registers the upload extension when there is an uploader', () => {
    expect(namesOf({ onFiles: () => undefined })).toContain('imageUpload');
  });
});

describe('the image item of the slash menu (rule 11)', () => {
  it('is absent when the editor has no upload', () => {
    const titles = itemsFor(anEditor({})).map((item) => item.title);

    expect(titles).toContain('Tabela');
    expect(titles).not.toContain('Imagem');
  });

  it('is present when the editor has upload', () => {
    // ⚠️ O flag é o `storage` da extensão (`editor.storage['imageUpload']`),
    // não uma prop: é o que deixa o popup do menu não receber nada e ainda
    // saber se pode oferecer imagem.
    const editor = anEditor({ onFiles: () => undefined });

    expect(editor.storage['imageUpload']).toEqual({ enabled: true });
    expect(itemsFor(editor).map((item) => item.title)).toContain('Imagem');
  });
});

describe('only H1 and H2 (rule 13)', () => {
  it('cannot make a level 3 heading', () => {
    // O teste é de COMPORTAMENTO, não de configuração: o `toggleHeading` do
    // TipTap recusa um nível que não está em `levels`, e é essa recusa que
    // significa "o editor não tem H3". Ler `options.heading.levels` provaria
    // que a configuração está escrita, não que ela vale.
    const editor = anEditor({});

    expect(editor.can().toggleHeading({ level: 1 })).toBe(true);
    expect(editor.can().toggleHeading({ level: 2 })).toBe(true);
    expect(editor.can().toggleHeading({ level: 3 })).toBe(false);
  });
});
