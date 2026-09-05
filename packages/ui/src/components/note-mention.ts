import { mergeAttributes } from '@tiptap/core';
import { Mention } from '@tiptap/extension-mention';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { PluginKey } from '@tiptap/pm/state';

import { MentionList } from './MentionList';
import { suggestionRender } from './suggestion-render';

/**
 * Menção `@` e wikilink `[[` (`docs/EDITOR.md` §9) — as duas formas de CITAR
 * OUTRA ANOTAÇÃO do acervo do clube (a sua ou a de outra pessoa).
 *
 * As duas derivam de `@tiptap/extension-mention`. O que muda é o gatilho e
 * como o nó se escreve de volta: a menção mostra `@Título`, o wikilink mostra
 * `[[Título]]`.
 *
 * ⚠️ O grafo que isso produz (`NoteLink`) está FORA de escopo nesta fatia: não
 * existe tabela. O editor só emite o nó; quem recalcular o grafo a cada
 * salvamento lê o `doc`.
 */

/** Uma anotação que a busca da tela devolveu, no vocabulário do acervo. */
export interface NoteSuggestion {
  id: string;
  title: string;
}

/** A busca, injetada pela tela. Já escopada ao clube ativo. */
export type NoteSearch = (query: string) => Promise<NoteSuggestion[]>;

/** O que o nó do TipTap guarda. `label` é o que aparece escrito. */
export interface NoteLinkAttrs {
  id: string;
  label: string;
}

/**
 * A classe que marca as duas no HTML — o estilo mora em `editor.css`.
 *
 * Uma classe só para os dois nós de propósito: para quem lê a anotação, menção
 * e wikilink são a mesma coisa (um link para outra anotação); o que muda é
 * como se escreve, não o que é.
 */
export const NOTE_LINK_CLASS = 'note-link';

/** O rótulo escrito de um nó de menção — cai no `id` quando não tem rótulo. */
function labelOf(node: ProseMirrorNode): string {
  const label: unknown = node.attrs['label'];
  if (typeof label === 'string' && label !== '') return label;

  const id: unknown = node.attrs['id'];
  return typeof id === 'string' ? id : '';
}

/**
 * A menção `@`.
 *
 * A `pluginKey` é EXPLÍCITA, e não sobra do default — veja o aviso do
 * `createNoteWikilink`.
 */
export function createNoteMention(search: NoteSearch) {
  return Mention.configure({
    HTMLAttributes: { class: NOTE_LINK_CLASS },
    suggestion: {
      char: '@',
      pluginKey: new PluginKey('noteMentionSuggestion'),
      items: ({ query }) => search(query),
      render: suggestionRender<NoteSuggestion, NoteLinkAttrs>(MentionList),
    },
  });
}

/**
 * O wikilink `[[`.
 *
 * ⚠️ A PEGADINHA DAS DUAS EXTENSÕES DERIVADAS DE `Mention`, e o que ela é
 * HOJE. O `EDITOR.md` §9 registra que as duas compartilham a `PluginKey`
 * default e COLIDEM — uma engole a outra. Isso era verdade na linha em que o
 * editor original nasceu: o `MentionPluginKey` era um módulo, uma instância só
 * para todo mundo.
 *
 * Medido nesta fatia, no `@tiptap/extension-mention` que o `^2.10.0` instala
 * hoje (2.27.3): o `getSuggestionOptions` faz `const pluginKey = new
 * PluginKey()` — uma chave NOVA por gatilho, por instância. A colisão não
 * acontece mais sozinha, e o `EditorState.create` do ProseMirror, que recusa
 * duas instâncias de plugin com a mesma chave, não é mais provocado.
 *
 * A chave explícita FICA, por três razões: ela é o que o `EDITOR.md` manda,
 * ela é grátis, e ela é a única coisa que protege esta linha de código de um
 * downgrade da dependência — que reintroduziria a colisão em silêncio, no
 * carregamento da tela de anotação.
 */
export function createNoteWikilink(search: NoteSearch) {
  return Mention.extend({ name: 'wikilink' }).configure({
    HTMLAttributes: { class: NOTE_LINK_CLASS },
    // `[[Título]]` no texto e no HTML: é a notação que quem escreve reconhece.
    renderText: ({ node }) => `[[${labelOf(node)}]]`,
    renderHTML: ({ node, options }) => [
      'span',
      mergeAttributes(options.HTMLAttributes),
      `[[${labelOf(node)}]]`,
    ],
    suggestion: {
      char: '[[',
      pluginKey: new PluginKey('wikilinkSuggestion'),
      items: ({ query }) => search(query),
      render: suggestionRender<NoteSuggestion, NoteLinkAttrs>(MentionList),
    },
  });
}
