import { cx } from '../cx';

/**
 * O ITEM DE UM POPUP DE SUGESTÃO — o mesmo botão no menu `/` e nos dois popups
 * de menção (`docs/EDITOR.md` §5 e §9).
 *
 * ⚠️ POR QUE ELE EXISTE, e é uma correção de rodada: os dois popups
 * DUPLICAVAM os handlers da §4.4, e duplicata de regra é duplicata de buraco.
 * Medido: apagar o `preventDefault` do `onMouseDown` do `MentionList` deixava
 * a suíte inteira VERDE, porque a varredura estática só exigia que a string
 * `preventDefault` existisse em algum lugar do arquivo — e ela continuava no
 * outro handler. O mesmo valia para o `onTouchEnd` do `SlashMenu`, que é o
 * evento DO CELULAR: era literalmente "o teclado fecha a cada item do menu
 * `/`" passando verde.
 *
 * Com um botão só, há um `preventDefault` por evento no projeto inteiro, e
 * cada um tem um teste de comportamento por popup em cima dele. A extração do
 * `useSuggestionKeys` já havia mostrado que os dois popups são a mesma coisa
 * com listas diferentes; isto fecha a outra metade.
 *
 * ⚠️ E NENHUM `onClick` (§4.4): o `click` só nasce depois do `mouseup`, e o
 * `mousedown` que veio antes já tirou o foco do ProseMirror — a seleção se
 * perde e o TECLADO DO CELULAR FECHA. O `preventDefault` nos dois eventos é o
 * que impede o navegador de mover o foco.
 */
export interface SuggestionOptionProps {
  /** O texto do item. É o que a pessoa lê e o que o leitor de tela anuncia. */
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function SuggestionOption({
  label,
  onPress,
  selected,
}: SuggestionOptionProps) {
  return (
    <button
      aria-selected={selected}
      className={cx(
        'flex min-h-11 shrink-0 items-center rounded-control px-3 text-left text-sm',
        selected
          ? 'bg-accent-soft text-content'
          : 'text-muted hover:text-content',
      )}
      onMouseDown={(event) => {
        event.preventDefault();
        onPress();
      }}
      onTouchEnd={(event) => {
        event.preventDefault();
        onPress();
      }}
      role="option"
      type="button"
    >
      <span className="truncate">{label}</span>
    </button>
  );
}
