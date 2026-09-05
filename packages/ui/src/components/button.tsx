import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';

import { cx } from '../cx';
import { FOCUS_RING, SPACING_STEP_PX } from './styles';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

/**
 * UMA cor de ação (`--clube-accent`), e o que separa as variantes é
 * preenchimento × fantasma — não matiz. O app não tem hierarquia de botão
 * colorido, e `danger` não é "mais importante": é destrutivo.
 */
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  ghost: 'border border-line bg-transparent text-content hover:bg-surface',
  danger: 'bg-danger text-danger-fg hover:opacity-90',
};

/**
 * O `heightClass` e o `heightPx` são a MESMA decisão escrita duas vezes, e é
 * de propósito: o Tailwind só compila classe que exista literalmente no
 * código-fonte (`min-h-[${n}px]` montado em runtime não gera CSS nenhum — é o
 * mesmo mecanismo da regra 1), e jsdom não tem layout para medir altura.
 *
 * Então o número fica ao lado da classe e `button.test.tsx` amarra os dois:
 * `min-h-11` tem de valer 11 × 4px, e o resultado tem de ser ≥ 44px (regra 9).
 * Quem baixar o tamanho para caber mais botão na tela quebra o teste.
 */
const SIZE: Record<ButtonSize, { heightClass: string; heightPx: number }> = {
  md: { heightClass: 'min-h-11', heightPx: 11 * SPACING_STEP_PX },
  lg: { heightClass: 'min-h-13', heightPx: 13 * SPACING_STEP_PX },
};

/** Exportado só para o teste da regra 9 — a tela usa `size`. */
export const BUTTON_SIZES = SIZE;

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Desabilita e mostra o spinner sem mudar a largura (regra 7). */
  loading?: boolean;
}

/**
 * O botão do app.
 *
 * `type="button"` por padrão (regra 5): o default do HTML é `submit`, e um
 * botão de "arquivar" dentro de um formulário submeteria o formulário.
 *
 * `asChild` não existe de propósito (spec): render delegado pede
 * `cloneElement` e um contrato de props que ninguém consegue tipar sem `any`.
 * Precisa de um link com cara de botão? É o `ListItem` com `href`, ou uma tela
 * que aplique as classes — não este componente.
 */
export function Button({
  children,
  className,
  disabled = false,
  loading = false,
  onClick,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...rest
}: ButtonProps) {
  /**
   * REGRA 6: `disabled` E `loading` impedem o clique.
   *
   * O `disabled` no elemento já bastaria num navegador, mas não é onde a regra
   * pode morar: `loading` sem `disabled` (alguém "só quer o spinner") faria o
   * duplo toque gravar duas notas, e um `fireEvent.click` chega ao handler do
   * React mesmo em botão desabilitado. A guarda é no handler, e o `disabled`
   * fica por cima para o cursor e o leitor de tela concordarem.
   */
  const blocked = disabled || loading;

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    if (blocked) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      {...rest}
      // `aria-busy` é o que ANUNCIA o carregamento (regra 8); o spinner é
      // `aria-hidden`. `undefined` e não `false`: `aria-busy="false"` num botão
      // parado é ruído no DOM.
      aria-busy={loading || undefined}
      className={cx(
        'relative inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        FOCUS_RING,
        SIZE[size].heightClass,
        size === 'lg' ? 'px-5 text-lg' : 'px-4 text-base',
        VARIANT_CLASS[variant],
        className,
      )}
      disabled={blocked}
      onClick={handleClick}
      type={type}
    >
      {/*
        REGRA 7: o rótulo NÃO sai do DOM quando carrega — ele fica invisível
        (`invisible`, que reserva o espaço) e o spinner entra fora do fluxo
        (`absolute`). Trocar o rótulo pelo spinner encolheria o botão no meio
        do toque, e o dedo que ia acertar "Salvar" acerta o que estiver do lado.
      */}
      <span
        className={cx('inline-flex items-center gap-2', loading && 'invisible')}
      >
        {children}
      </span>
      {loading ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center"
        >
          {/*
            `lucide-react` (`CLAUDE.md`: "Ícones: lucide-react"), e não um arco
            desenhado à mão: SVG inline em `ui/src` é proibido por teste, porque
            é assim que um cadeado entra sem a varredura do ADR 0002 ver — ela
            pega PALAVRA, e desenho não tem palavra.

            `aria-hidden`: quem anuncia o carregamento é o `aria-busy` do botão
            (regra 8). Um segundo anúncio pelo ícone só duplicaria a fala.
          */}
          <Loader2
            aria-hidden="true"
            className="size-5 animate-spin"
            focusable="false"
          />
        </span>
      ) : null}
    </button>
  );
}
