import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MentionList } from '../MentionList';
import type { NoteLinkAttrs, NoteSuggestion } from '../note-mention';

/**
 * REGRA 8 da Tarefa 14 aplicada AO POPUP DE MENÇÃO (`docs/EDITOR.md` §4.4/§9).
 *
 * ⚠️ POR QUE ESTE ARQUIVO NASCEU NA RODADA DE CORREÇÃO: o `MentionList` não
 * tinha teste de comportamento NENHUM. Ele era coberto só pela varredura
 * estática, que exige a string `preventDefault` no arquivo — e enquanto os
 * dois popups duplicavam os handlers, apagar o `preventDefault` do
 * `onMouseDown` daqui deixava a suíte inteira VERDE, porque a string
 * continuava no `onTouchEnd` ao lado.
 *
 * O que quebrava em silêncio: quem digita `@` para citar outra anotação do
 * acervo, toca no resultado, e o teclado do celular fecha junto com a
 * seleção. O texto da menção nem entra.
 *
 * O teclado (↑/↓ com volta, Enter, reset da seleção) não se repete aqui: ele
 * mora no `useSuggestionKeys`, compartilhado, e é provado em
 * `slash-menu.test.tsx`. Este arquivo prova a metade que é DESTE popup — o
 * ponteiro e a tradução do vocabulário do acervo para o do nó.
 */

/** Fixture é factory (§7.7). */
function someNotes(): NoteSuggestion[] {
  return [
    { id: 'note-1', title: 'Capítulo 3, o naufrágio' },
    { id: 'note-2', title: 'A carta do capitão' },
  ];
}

describe('MentionList pointer (rule 8, §4.4)', () => {
  /**
   * ⚠️ OS DOIS EVENTOS. `fireEvent` devolve `false` quando o handler chamou
   * `preventDefault` — e sem ele o `mousedown`/`touchend` move o foco para o
   * botão, o ProseMirror perde a seleção e O TECLADO DO CELULAR FECHA.
   */
  it.each([
    ['mousedown', fireEvent.mouseDown],
    ['touchend', fireEvent.touchEnd],
  ])(
    'prevents the default of %s, so the mobile keyboard stays open',
    (_name, fire) => {
      const chosen: NoteLinkAttrs[] = [];
      render(
        <MentionList
          command={(attrs) => chosen.push(attrs)}
          items={someNotes()}
        />,
      );

      const option = screen.getAllByRole('option')[0];
      expect(option).toBeDefined();
      if (option === undefined) throw new Error('sem item para tocar');

      expect(fire(option)).toBe(false);
      /*
      E a MENÇÃO foi escolhida, no vocabulário do NÓ (`{ id, label }`) e não no
      do acervo (`{ id, title }`). Este popup é o único lugar do editor que
      sabe dos dois, e um `title` mandado adiante viraria uma menção sem
      rótulo — visível como um espaço em branco no meio da frase.
    */
      expect(chosen).toEqual([
        { id: 'note-1', label: 'Capítulo 3, o naufrágio' },
      ]);
    },
  );

  it('marks only the selected option, for the screen reader', () => {
    render(<MentionList command={() => undefined} items={someNotes()} />);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    expect(options[1]?.getAttribute('aria-selected')).toBe('false');
  });

  it('says so when the search found nothing', () => {
    // Lista vazia é o estado mais comum do `@`: quem digita duas letras
    // costuma não achar nada ainda. Um popup em branco parece travado.
    render(<MentionList command={() => undefined} items={[]} />);

    expect(screen.getByText('Nenhuma anotação')).toBeDefined();
    expect(screen.queryAllByRole('option')).toEqual([]);
  });
});
