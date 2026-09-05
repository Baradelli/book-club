import { forwardRef, useImperativeHandle } from 'react';

import type { SlashItem } from './slash-command';
import {
  type SuggestionListProps,
  type SuggestionListRef,
  useSuggestionKeys,
} from './suggestion-render';
import { SuggestionOption } from './SuggestionOption';

/**
 * O popup do menu `/` (`docs/EDITOR.md` §5).
 *
 * ⚠️ O BOTÃO DO ITEM É COMPARTILHADO com o `MentionList` (`SuggestionOption`),
 * e é lá que mora a regra do §4.4 — a que decide se o editor serve no
 * celular. Enquanto cada popup tinha o seu par de handlers, apagar o
 * `preventDefault` do `onTouchEnd` daqui deixava a suíte VERDE: e `touchend` é
 * O EVENTO DO CELULAR, ou seja, "o teclado fecha a cada item do menu `/`"
 * passava sem ninguém ver.
 *
 * Os rótulos ficam em PORTUGUÊS no código, e não em `t()`: é o §10 do
 * `EDITOR.md`, e a razão está escrita lá — transformar vinte rótulos internos
 * do editor em chave de catálogo custa mais do que resolve. O `@clube/ui` não
 * traduz (decisão B da Tarefa 13), então nem poderia ser de outro jeito.
 */
export const SlashMenu = forwardRef<
  SuggestionListRef,
  SuggestionListProps<SlashItem, SlashItem>
>(function SlashMenu({ command, items }, ref) {
  const { onKeyDown, selected } = useSuggestionKeys<SlashItem, SlashItem>(
    items,
    (item) => item,
    command,
  );

  useImperativeHandle(ref, () => ({ onKeyDown }), [onKeyDown]);

  if (items.length === 0) {
    return (
      <div className="clube-editor-popover w-56 px-3 py-2 text-sm text-muted">
        Nenhum bloco
      </div>
    );
  }

  return (
    <div
      className="clube-editor-popover flex max-h-72 w-56 flex-col overflow-y-auto p-1"
      role="listbox"
    >
      {items.map((item, index) => (
        <SuggestionOption
          key={item.title}
          label={item.title}
          onPress={() => command(item)}
          selected={index === selected}
        />
      ))}
    </div>
  );
});
