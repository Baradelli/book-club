import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import type { SlashItem } from '../slash-command';
import { SlashMenu } from '../SlashMenu';
import type { SuggestionListRef } from '../suggestion-render';

/**
 * REGRA 10 da Tarefa 14 — o teclado do menu `/`.
 *
 * Ele quebra em silêncio de um jeito específico e ruim: a seta continua
 * andando, o popup continua abrindo, e o Enter insere O BLOCO ERRADO. Nada
 * estoura, nada aparece no console, e quem digitou `/tab` ganha uma citação.
 *
 * O teste fala com o popup pelo `ref`, que é exatamente o que o plugin de
 * sugestão do TipTap faz — e é por isso que o `SuggestionListRef` recebe só a
 * tecla, sem `view` nem `range`: para provar que a seta desce um item não
 * precisa existir um ProseMirror.
 */

/** Fixture é factory (§7.7) — e o `run` conta em qual item o Enter caiu. */
function anItem(title: string, log: string[]): SlashItem {
  return {
    title,
    run: () => log.push(title),
  };
}

function threeItems(log: string[]): SlashItem[] {
  return [anItem('Texto', log), anItem('Lista', log), anItem('Tabela', log)];
}

/**
 * A tecla como o plugin do TipTap a entrega, dentro de `act`: o `onKeyDown`
 * chega de FORA do React (do ProseMirror), e sem o `act` o re-render fica
 * pendurado — o DOM ainda mostraria a seleção anterior e o teste falharia
 * dizendo que a seta não anda.
 */
function press(ref: { current: SuggestionListRef | null }, key: string) {
  let handled: boolean | undefined;
  act(() => {
    handled = ref.current?.onKeyDown({
      event: new KeyboardEvent('keydown', { key }),
    });
  });
  return handled;
}

/** Qual item está selecionado, lido do DOM como um leitor de tela leria. */
function selectedTitle(): string | null {
  const selected = screen
    .getAllByRole('option')
    .find((option) => option.getAttribute('aria-selected') === 'true');
  return selected?.textContent ?? null;
}

describe('SlashMenu keyboard (rule 10)', () => {
  it('starts on the first item', () => {
    const log: string[] = [];
    render(<SlashMenu command={() => undefined} items={threeItems(log)} />);

    expect(selectedTitle()).toBe('Texto');
    // Sem esta linha o `selectedTitle` poderia estar devolvendo `null` para
    // tudo e os testes abaixo passariam comparando nada (§7.4).
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('walks down and up', () => {
    const log: string[] = [];
    const ref = createRef<SuggestionListRef>();
    render(
      <SlashMenu command={() => undefined} items={threeItems(log)} ref={ref} />,
    );

    press(ref, 'ArrowDown');
    expect(selectedTitle()).toBe('Lista');

    press(ref, 'ArrowUp');
    expect(selectedTitle()).toBe('Texto');
  });

  it('wraps around at both ends', () => {
    /*
      O WRAP-AROUND não é enfeite: a lista tem oito itens e quem digitou `/`
      já sabe o que quer. Parar no último obriga a subir oito vezes para
      alcançar o primeiro — e `ArrowUp` no primeiro item, sem volta, não faz
      nada, o que parece o menu ter travado.
    */
    const log: string[] = [];
    const ref = createRef<SuggestionListRef>();
    render(
      <SlashMenu command={() => undefined} items={threeItems(log)} ref={ref} />,
    );

    // Do primeiro para cima: vai para o ÚLTIMO.
    press(ref, 'ArrowUp');
    expect(selectedTitle()).toBe('Tabela');

    // E do último para baixo: volta para o primeiro.
    press(ref, 'ArrowDown');
    expect(selectedTitle()).toBe('Texto');
  });

  it('confirms the selected item with Enter', () => {
    const log: string[] = [];
    const chosen: string[] = [];
    const ref = createRef<SuggestionListRef>();
    render(
      <SlashMenu
        command={(item) => chosen.push(item.title)}
        items={threeItems(log)}
        ref={ref}
      />,
    );

    press(ref, 'ArrowDown');
    press(ref, 'Enter');

    // O item SELECIONADO, não o primeiro: um `items[0]` no lugar do
    // `items[selected]` passaria em qualquer teste que não andasse antes.
    expect(chosen).toEqual(['Lista']);
  });

  it('resets the selection to the first item when the list changes', () => {
    /*
      ⚠️ O PIOR ERRO POSSÍVEL DESTE POPUP, e o que este teste impede: a pessoa
      desce até o item 3, digita mais uma letra, a lista filtra para dois
      itens — e o índice 2 continua guardado. O Enter insere o que não está na
      tela, ou nada.
    */
    const log: string[] = [];
    const ref = createRef<SuggestionListRef>();
    const { rerender } = render(
      <SlashMenu command={() => undefined} items={threeItems(log)} ref={ref} />,
    );

    press(ref, 'ArrowDown');
    press(ref, 'ArrowDown');
    expect(selectedTitle()).toBe('Tabela');

    rerender(
      <SlashMenu
        command={() => undefined}
        items={[anItem('Tarefas', log), anItem('Tabela', log)]}
        ref={ref}
      />,
    );

    expect(selectedTitle()).toBe('Tarefas');
  });

  it('answers nothing to a key it does not handle, so the editor keeps it', () => {
    // `false` é o que devolve a tecla ao ProseMirror. Um `return true` guloso
    // aqui engoliria a letra que a pessoa digitou para filtrar a lista.
    const log: string[] = [];
    const ref = createRef<SuggestionListRef>();
    render(
      <SlashMenu command={() => undefined} items={threeItems(log)} ref={ref} />,
    );

    expect(press(ref, 'a')).toBe(false);
    expect(press(ref, 'ArrowDown')).toBe(true);
  });

  it('handles no key at all when the list is empty', () => {
    // Filtro que não achou nada: o Enter não pode inserir bloco nenhum, e a
    // seta não pode andar num vazio.
    const ref = createRef<SuggestionListRef>();
    render(<SlashMenu command={() => undefined} items={[]} ref={ref} />);

    expect(press(ref, 'ArrowDown')).toBe(false);
    expect(press(ref, 'Enter')).toBe(false);
    expect(screen.getByText('Nenhum bloco')).toBeDefined();
  });
});

describe('SlashMenu pointer (rule 8, §4.4)', () => {
  /**
   * ⚠️ OS DOIS EVENTOS, e o `touchend` não é o secundário — é O DO CELULAR.
   *
   * Medido na auditoria: com só o `mousedown` afirmado aqui, apagar o
   * `preventDefault` do `onTouchEnd` deste popup deixava a suíte VERDE. O
   * defeito escondido era literalmente o pior desta fatia: "o teclado fecha a
   * cada item do menu `/`" — no aparelho em que o editor existe para ser
   * usado, e em nenhum dos 152 testes.
   *
   * `fireEvent` devolve `false` quando o handler chamou `preventDefault`.
   */
  it.each([
    ['mousedown', fireEvent.mouseDown],
    ['touchend', fireEvent.touchEnd],
  ])(
    'prevents the default of %s, so the mobile keyboard stays open',
    (_name, fire) => {
      const log: string[] = [];
      const chosen: string[] = [];
      render(
        <SlashMenu
          command={(item) => chosen.push(item.title)}
          items={threeItems(log)}
        />,
      );

      const option = screen.getAllByRole('option')[0];
      expect(option).toBeDefined();
      if (option === undefined) throw new Error('sem item para tocar');

      expect(fire(option)).toBe(false);
      // E o item foi ESCOLHIDO: um handler que só chamasse `preventDefault` e
      // não fizesse nada passaria na asserção de cima (§7.4).
      expect(chosen).toEqual(['Texto']);
    },
  );
});
