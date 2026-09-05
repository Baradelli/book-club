import { ReactRenderer } from '@tiptap/react';
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from '@tiptap/suggestion';
import type {
  ForwardRefExoticComponent,
  PropsWithoutRef,
  RefAttributes,
} from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import tippy, { type Instance } from 'tippy.js';

/**
 * A fábrica de `render()` que o menu `/` e os dois popups de menção
 * COMPARTILHAM (`docs/EDITOR.md` §5), e o teclado que os três usam.
 *
 * Os dois moram no mesmo arquivo porque são as duas metades de um popup de
 * sugestão: a de fora (ReactRenderer + tippy, chamada pelo plugin do
 * ProseMirror) e a de dentro (↑/↓/Enter, chamada pelo componente React). Quem
 * escrever o terceiro popup pega os dois de graça — e não reescreve o
 * wrap-around, que é o detalhe que sai de sincronia primeiro.
 */

/**
 * O que o popup precisa saber de uma tecla: a tecla.
 *
 * ⚠️ É DE PROPÓSITO que não seja o `SuggestionKeyDownProps` do TipTap inteiro
 * (que traz `view` e `range`): o popup não usa nem um nem outro, e depender
 * deles obrigaria todo teste de teclado a construir um `EditorView` — ou seja,
 * a montar um ProseMirror para provar que a seta desce um item. O objeto do
 * TipTap satisfaz esta forma, então o plugin passa o dele sem conversão.
 */
export interface SuggestionKeyEvent {
  event: KeyboardEvent;
}

/** O que o plugin de sugestão chama no popup: a tecla. */
export interface SuggestionListRef {
  onKeyDown: (props: SuggestionKeyEvent) => boolean;
}

/**
 * As props de um popup de sugestão.
 *
 * `TItem` é o que a lista MOSTRA; `TSelected` é o que o editor RECEBE — no
 * menu `/` são a mesma coisa, e na menção não: a lista mostra
 * `{ id, title }` (o vocabulário do acervo) e o nó da menção quer
 * `{ id, label }` (o vocabulário do TipTap). Separar os dois é o que impede o
 * popup de virar tradutor de atributo de nó.
 */
export interface SuggestionListProps<TItem, TSelected> {
  items: TItem[];
  command: (selected: TSelected) => void;
}

/** O componente de popup: um `forwardRef` que expõe o `onKeyDown`. */
export type SuggestionListComponent<TItem, TSelected> =
  ForwardRefExoticComponent<
    PropsWithoutRef<SuggestionListProps<TItem, TSelected>> &
      RefAttributes<SuggestionListRef>
  >;

/**
 * ↑/↓ COM VOLTA NO FIM, Enter confirma, e a seleção volta para 0 quando a
 * lista muda.
 *
 * O wrap-around não é enfeite: a lista do menu `/` tem 8 itens no máximo e
 * quem digita `/` já sabe o que quer — parar no último obriga a subir oito
 * vezes para alcançar o primeiro. E o reset é o que evita o pior erro
 * possível: filtrar de "Tabela" para "Ta" com o índice 5 preso e o Enter
 * inserir um bloco que não está mais na tela.
 *
 * O estado vai também num ref porque o `onKeyDown` é chamado de FORA do React
 * (pelo plugin do ProseMirror, via `useImperativeHandle`): um closure sobre o
 * `selected` do render veria sempre o valor do primeiro render.
 */
export function useSuggestionKeys<TItem, TSelected>(
  items: TItem[],
  choose: (item: TItem) => TSelected | undefined,
  command: (selected: TSelected) => void,
): { selected: number; onKeyDown: (props: SuggestionKeyEvent) => boolean } {
  const [selected, setSelected] = useState(0);

  const latest = useRef({ items, choose, command, selected });
  latest.current = { items, choose, command, selected };

  useEffect(() => {
    setSelected(0);
  }, [items]);

  const onKeyDown = useCallback(({ event }: SuggestionKeyEvent): boolean => {
    const current = latest.current;
    const total = current.items.length;
    if (total === 0) return false;

    if (event.key === 'ArrowUp') {
      setSelected((current.selected + total - 1) % total);
      return true;
    }

    if (event.key === 'ArrowDown') {
      setSelected((current.selected + 1) % total);
      return true;
    }

    if (event.key === 'Enter') {
      const item = current.items[current.selected];
      if (item === undefined) return false;
      const chosen = current.choose(item);
      if (chosen === undefined) return false;
      current.command(chosen);
      return true;
    }

    return false;
  }, []);

  return { selected, onKeyDown };
}

/**
 * Onde o popup nasce, no `body`, ancorado na decoração que o plugin de
 * sugestão pintou em volta do `/` (ou do `@`) que a pessoa digitou.
 *
 * `bottom-start`: a lista desce e alinha à esquerda do trigger, como todo menu
 * de comando que já se viu. O tippy vira para cima sozinho quando não cabe.
 */
const POPUP_PLACEMENT = 'bottom-start';

/**
 * O `render()` de um `Suggestion` — ReactRenderer + tippy, com o ciclo de vida
 * completo.
 *
 * ⚠️ POR QUE `onExit` DESTRÓI OS DOIS: cada abertura cria um `ReactRenderer`
 * (que é uma root do React num elemento solto) e uma instância do tippy (que é
 * um nó no `body`). Sem destruir, cada `/` digitado deixa uma root montada e um
 * div no `body` — e o próximo `Escape` esconderia um popup que já não é o que
 * está na tela.
 */
export function suggestionRender<TItem, TSelected>(
  component: SuggestionListComponent<TItem, TSelected>,
) {
  return () => {
    let renderer: ReactRenderer<
      SuggestionListRef,
      SuggestionListProps<TItem, TSelected>
    > | null = null;
    let popup: Instance | null = null;

    function propsOf(
      props: SuggestionProps<TItem, TSelected>,
    ): SuggestionListProps<TItem, TSelected> {
      return { items: props.items, command: props.command };
    }

    /**
     * O tippy quer um retângulo, e o `clientRect` do plugin pode devolver
     * `null` (a decoração saiu do DOM entre o cálculo e o desenho). Um
     * retângulo zerado põe o popup no canto; devolver `null` faria o tippy
     * estourar no meio da digitação.
     */
    function rectOf(props: SuggestionProps<TItem, TSelected>): () => DOMRect {
      const clientRect = props.clientRect;
      return () => clientRect?.() ?? new DOMRect(0, 0, 0, 0);
    }

    return {
      onStart: (props: SuggestionProps<TItem, TSelected>): void => {
        renderer = new ReactRenderer(component, {
          editor: props.editor,
          props: propsOf(props),
        });

        popup = tippy(document.body, {
          appendTo: () => document.body,
          content: renderer.element,
          getReferenceClientRect: rectOf(props),
          interactive: true,
          placement: POPUP_PLACEMENT,
          showOnCreate: true,
          trigger: 'manual',
        });
      },

      onUpdate: (props: SuggestionProps<TItem, TSelected>): void => {
        renderer?.updateProps(propsOf(props));
        popup?.setProps({ getReferenceClientRect: rectOf(props) });
      },

      onKeyDown: (props: SuggestionKeyDownProps): boolean => {
        // `Escape` fecha o popup e NÃO chega ao editor: quem digitou `/` e
        // desistiu quer o menu fechado, não o parágrafo desfeito.
        if (props.event.key === 'Escape') {
          popup?.hide();
          return true;
        }

        return renderer?.ref?.onKeyDown(props) ?? false;
      },

      onExit: (): void => {
        popup?.destroy();
        renderer?.destroy();
        popup = null;
        renderer = null;
      },
    };
  };
}
