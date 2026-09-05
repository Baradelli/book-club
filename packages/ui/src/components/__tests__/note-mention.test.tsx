import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { NoteSuggestion } from '../note-mention';
import { RichEditor } from '../RichEditor';

/**
 * REGRA 5 da Tarefa 14 — `@` e `[[` CONVIVEM na mesma instância do editor.
 *
 * ⚠️ O que o `EDITOR.md` §9 registra, e o que foi MEDIDO nesta fatia:
 *
 * A spec diz que duas extensões derivadas de `Mention` compartilham a
 * `PluginKey` default e colidem — uma engole a outra. Isso era verdade na linha
 * em que o editor original nasceu. No `@tiptap/extension-mention` que o
 * `^2.10.0` instala hoje (2.27.3), o `getSuggestionOptions` faz
 * `const pluginKey = new PluginKey()`: uma chave nova por gatilho, por
 * instância. A colisão não acontece mais sozinha.
 *
 * Consequência honesta para este teste: ele NÃO acusa mais o mutante que apaga
 * a `pluginKey` explícita (medido). O que ele acusa continua valendo e é o que
 * importa para quem lê a anotação: os dois gatilhos vivos ao mesmo tempo, com
 * as duas buscas chegando. Se um dia a colisão voltar (por downgrade da
 * dependência, ou por um `Mention` que volte a compartilhar a chave), o
 * `EditorState.create` do ProseMirror recusa a segunda instância com a mesma
 * chave — e este teste fica vermelho na montagem.
 */

function aDoc(): Record<string, unknown> {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** Fixture é factory (§7.7). */
function someNotes(): NoteSuggestion[] {
  return [
    { id: 'note-1', title: 'Capítulo 3, o naufrágio' },
    { id: 'note-2', title: 'A carta do capitão' },
  ];
}

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

describe('mention and wikilink in the same editor (rule 5)', () => {
  it('runs the note search for both @ and [[', async () => {
    const queries: string[] = [];
    const search = async (query: string): Promise<NoteSuggestion[]> => {
      queries.push(query);
      return someNotes();
    };

    render(
      <RichEditor
        doc={aDoc()}
        noteSearch={search}
        onChange={() => undefined}
      />,
    );

    pasteText('@nau');
    await waitFor(() => {
      expect(queries).toContain('nau');
    });

    // O espaço antes do `[[` não é enfeite: o plugin de sugestão do TipTap só
    // casa o gatilho no início da linha ou depois de um espaço
    // (`allowedPrefixes`), e sem ele o `[[` grudado numa palavra não abre nada
    // — nem no app.
    pasteText(' [[cart');
    await waitFor(() => {
      expect(queries).toContain('cart');
    });

    // As DUAS, na mesma instância: é o par que a §9 diz que já se engoliu uma
    // vez. Um teste que só olhasse o `@` passaria com o `[[` morto.
    expect(queries).toContain('nau');
    expect(queries).toContain('cart');
  });

  it('does not search at all when the screen passes no search', () => {
    // Extensão condicional (§3): sem `noteSearch`, digitar `@` é digitar uma
    // letra. É o que deixa a tela de login e a de cadastro de livro usarem o
    // editor sem carregar popup de menção nenhum.
    const emitted: Array<Record<string, unknown>> = [];
    render(<RichEditor doc={aDoc()} onChange={(doc) => emitted.push(doc)} />);

    pasteText('@nau');

    // O texto entra como texto — nenhum nó de menção, nenhum popup.
    expect(JSON.stringify(emitted)).toContain('@nau');
    expect(JSON.stringify(emitted)).not.toContain('mention');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });
});
