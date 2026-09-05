import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  Button,
  BUTTON_SIZES,
  type ButtonProps,
  type ButtonSize,
} from '../button';
import { MIN_TOUCH_TARGET_PX, SPACING_STEP_PX } from '../styles';

/**
 * Regras 5–9. Nada de snapshot e nada de "renderiza sem erro": o que quebra em
 * silêncio num botão é o TIPO (que submete o formulário sem ninguém pedir), o
 * clique que passa quando não devia, e o alvo de toque que encolheu.
 */

/** Fixture é factory (§7.7). */
function renderButton(props: Partial<ButtonProps> = {}) {
  const { children = 'Salvar', ...rest } = props;
  return render(<Button {...rest}>{children}</Button>);
}

/**
 * `min-h-11` → 44px. A conversão existe porque jsdom não tem layout NENHUM
 * (`offsetHeight` é sempre 0), então medir altura de verdade é impossível — e
 * a decisão real está na classe, que é o que vira CSS.
 */
function minHeightPxFromClass(className: string): number {
  const match = /^min-h-(\d+)$/u.exec(className);
  if (match === null) {
    throw new Error(`\`${className}\` não é uma classe min-h-<n>`);
  }
  return Number(match[1]) * SPACING_STEP_PX;
}

describe('Button', () => {
  it('renders type=button by default (rule 5)', () => {
    renderButton();

    // O default do HTML é `submit`: um botão de "arquivar" dentro de um
    // formulário enviaria o formulário, e o sintoma é a página recarregando.
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('renders type=submit only when asked (rule 5)', () => {
    renderButton({ type: 'submit' });

    expect(screen.getByRole('button').getAttribute('type')).toBe('submit');
  });

  it('does not call onClick when disabled (rule 6)', () => {
    const onClick = vi.fn();
    renderButton({ disabled: true, onClick });

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not call onClick when loading (rule 6)', () => {
    // `loading` SEM `disabled`: é o caso que só a guarda no handler pega, e é
    // o que grava a nota duas vezes num duplo toque.
    const onClick = vi.fn();
    renderButton({ loading: true, onClick });

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('calls onClick when neither disabled nor loading (rule 6)', () => {
    // O lado POSITIVO do contador (§7.3): sem ele, um botão que nunca chama o
    // handler passaria nos dois testes acima.
    const onClick = vi.fn();
    renderButton({ onClick });

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the label in the DOM while loading, so the width does not jump (rule 7)', () => {
    renderButton({ children: 'Salvar anotação', loading: true });

    const button = screen.getByRole('button');

    // O rótulo é o que dá largura ao botão. Trocá-lo pelo spinner encolhe o
    // botão no meio do toque — e o dedo acerta o que estiver do lado.
    expect(button.textContent).toContain('Salvar anotação');
  });

  it('hides the loading label without removing it from the layout (rule 7)', () => {
    renderButton({ children: 'Salvar anotação', loading: true });

    const label = screen.getByText('Salvar anotação');

    // `invisible` (visibility:hidden) reserva o espaço; `hidden`
    // (display:none) não. É a diferença entre o botão ficar do mesmo tamanho e
    // colapsar. E o spinner entra FORA do fluxo, senão soma largura.
    expect(label.className).toContain('invisible');
    expect(label.className).not.toContain('hidden');

    const spinner = screen.getByRole('button').querySelector('svg');
    expect(spinner?.parentElement?.className).toContain('absolute');
  });

  it('announces the loading state to a screen reader (rule 8)', () => {
    renderButton({ loading: true });

    expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('true');
  });

  it('leaves aria-busy off when it is not loading (rule 8)', () => {
    // `aria-busy="false"` num botão parado é ruído no DOM — e sem este teste
    // um `aria-busy={loading}` constante passaria no de cima.
    renderButton();

    expect(screen.getByRole('button').hasAttribute('aria-busy')).toBe(false);
  });

  it.each(Object.keys(BUTTON_SIZES) as ButtonSize[])(
    'gives size %s a touch target of at least 44px (rule 9)',
    (size) => {
      const { heightClass, heightPx } = BUTTON_SIZES[size];

      // Os dois lados do par: a classe (o que vira CSS) e o número (o que o
      // teste compara). Divergir um do outro é o jeito silencioso de "passar"
      // o piso de toque com um botão de 32px na tela.
      expect(minHeightPxFromClass(heightClass)).toBe(heightPx);
      expect(heightPx).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);

      renderButton({ size });
      expect(screen.getByRole('button').className).toContain(heightClass);
    },
  );

  it('offers exactly the two sizes the spec asks for (rule 9)', () => {
    // Sem esta linha o `it.each` acima é meio teste: uma tabela esvaziada não
    // roda caso nenhum e a suíte fica verde (§7.4).
    expect(Object.keys(BUTTON_SIZES).sort()).toEqual(['lg', 'md']);
  });
});
