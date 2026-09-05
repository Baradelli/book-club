import { forwardRef, useImperativeHandle } from 'react';

import type { NoteLinkAttrs, NoteSuggestion } from './note-mention';
import {
  type SuggestionListProps,
  type SuggestionListRef,
  useSuggestionKeys,
} from './suggestion-render';
import { SuggestionOption } from './SuggestionOption';

/**
 * O popup das menções `@` e dos wikilinks `[[` (`docs/EDITOR.md` §9) — no
 * mesmo molde do `SlashMenu`, e com o MESMO botão de item
 * (`SuggestionOption`), que é onde vive a regra do §4.4: nenhum `onClick`,
 * `preventDefault` no `mousedown` E no `touchend`, senão o toque fecha o
 * teclado do celular e a seleção se perde.
 *
 * Os dois popups compartilham o botão de propósito: enquanto cada um tinha o
 * seu, apagar o `preventDefault` de um dos quatro handlers deixava a suíte
 * verde (medido). Um botão só, um teste de comportamento por popup.
 *
 * O que ele lista são ANOTAÇÕES DO ACERVO — a sua e a das outras pessoas do
 * clube. A busca (`noteSearch`) é escopada ao clube ativo pela TELA, nunca por
 * aqui: o editor não sabe o que é um clube.
 *
 * Ele traduz o vocabulário do acervo (`{ id, title }`) para o do nó do TipTap
 * (`{ id, label }`) — é o único lugar do editor que sabe dos dois.
 */
export const MentionList = forwardRef<
  SuggestionListRef,
  SuggestionListProps<NoteSuggestion, NoteLinkAttrs>
>(function MentionList({ command, items }, ref) {
  const { onKeyDown, selected } = useSuggestionKeys<
    NoteSuggestion,
    NoteLinkAttrs
  >(items, (item) => ({ id: item.id, label: item.title }), command);

  useImperativeHandle(ref, () => ({ onKeyDown }), [onKeyDown]);

  if (items.length === 0) {
    return (
      <div className="clube-editor-popover w-64 px-3 py-2 text-sm text-muted">
        Nenhuma anotação
      </div>
    );
  }

  return (
    <div
      className="clube-editor-popover flex max-h-72 w-64 flex-col overflow-y-auto p-1"
      role="listbox"
    >
      {items.map((item, index) => (
        <SuggestionOption
          key={item.id}
          label={item.title}
          onPress={() => command({ id: item.id, label: item.title })}
          selected={index === selected}
        />
      ))}
    </div>
  );
});
