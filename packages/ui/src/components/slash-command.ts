import { type Editor, Extension, type Range } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';

import { CALLOUT_TYPE } from './callout';
import { SlashMenu } from './SlashMenu';
import { suggestionRender } from './suggestion-render';

/**
 * O menu `/` (`docs/EDITOR.md` §5) — a forma de inserir um bloco sem barra de
 * ferramentas nenhuma, que é o que salva a tela do celular: os blocos raros
 * (tabela, aviso, alternável) não caberiam na barra, e a barra não pode
 * crescer.
 *
 * O contrato do item é o mais simples possível — um título e o que fazer:
 * nenhum ícone, nenhuma categoria, nenhum atalho. O que ele SEMPRE faz
 * primeiro é apagar o `/que-a-pessoa-digitou`, e é por isso que o `run`
 * recebe o `range`.
 */
export interface SlashItem {
  title: string;
  run: (editor: Editor, range: Range) => void;
}

/** Quantos itens o popup mostra. Mais que isso ninguém lê antes de digitar. */
const MAX_ITEMS = 8;

/** O nome com que a extensão de upload se registra no `storage` do editor. */
const IMAGE_UPLOAD_NAME = 'imageUpload';

/**
 * Os blocos, na ordem em que aparecem. Rótulos em PORTUGUÊS no código (§10):
 * o `@clube/ui` não traduz (decisão B da Tarefa 13), e transformar doze
 * rótulos internos em chave de catálogo custa mais do que resolve.
 */
const ITEMS: SlashItem[] = [
  {
    title: 'Texto',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: 'Título 1',
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 1 })
        .run(),
  },
  {
    title: 'Título 2',
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 2 })
        .run(),
  },
  {
    title: 'Lista',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Lista numerada',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'Citação',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Tarefas',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: 'Código',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'Alternável',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setDetails().run(),
  },
  {
    title: 'Divisória',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: 'Tabela',
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: 'Aviso',
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).wrapIn(CALLOUT_TYPE).run(),
  },
];

const IMAGE_ITEM: SlashItem = {
  title: 'Imagem',
  run: (editor, range) =>
    editor.chain().focus().deleteRange(range).openImagePicker().run(),
};

/**
 * Os itens que ESTE editor oferece.
 *
 * ⚠️ "Imagem" é condicional, e a condição é o `storage` — não uma prop. A
 * extensão `ImageUpload` só está registrada quando a tela passou
 * `onUploadImage`, e o `addStorage()` dela é o que o menu lê. Assim o popup não
 * precisa receber nada para saber se pode oferecer imagem, e uma tela que use o
 * editor sem upload (a de cadastro de livro, por exemplo) não oferece um item
 * que abriria um seletor de arquivo sem para onde mandar.
 */
export function itemsFor(editor: Editor): SlashItem[] {
  const storage: unknown = editor.storage[IMAGE_UPLOAD_NAME];
  return storage === undefined || storage === null
    ? ITEMS
    : [...ITEMS, IMAGE_ITEM];
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',
        command: ({ editor, range, props }) => props.run(editor, range),
        items: ({ editor, query }) =>
          itemsFor(editor)
            .filter((item) =>
              item.title.toLowerCase().includes(query.toLowerCase()),
            )
            .slice(0, MAX_ITEMS),
        render: suggestionRender<SlashItem, SlashItem>(SlashMenu),
      }),
    ];
  },
});
