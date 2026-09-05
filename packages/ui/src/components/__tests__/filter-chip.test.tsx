import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FilterChip } from '../filter-chip';

/**
 * Regras 25 e 26.
 *
 * ⚠️ A REGRA 27 (o ADR 0002) NÃO MORA MAIS AQUI. Ela morava, e era o buraco:
 * a varredura por "cadeado / olho fechado / privado" lia só o
 * `filter-chip.tsx`, então o mesmo ícone no `list.tsx` — ou um "Só você vê" no
 * `ListItem` — passava pelos 89 testes da fatia. Ela foi para
 * `src/__tests__/adr-0002-iconography.test.ts`, que varre `ui/src` inteiro e
 * proíbe também `<svg>` inline: a lista pega PALAVRA, e um cadeado desenhado à
 * mão não tem palavra nenhuma para ela achar (medido).
 */

describe('FilterChip', () => {
  it('reflects the state in aria-pressed, not in aria-checked (rule 25)', () => {
    const { rerender } = render(
      <FilterChip label="Minhas" onPress={vi.fn()} pressed={false} />,
    );

    const chip = screen.getByRole('button', { name: 'Minhas' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    // `aria-checked` pertence a radio/checkbox: num botão ele faz o leitor de
    // tela anunciar um controle de formulário que não existe.
    expect(chip.hasAttribute('aria-checked')).toBe(false);

    rerender(<FilterChip label="Minhas" onPress={vi.fn()} pressed />);

    // As DUAS direções: um `aria-pressed` fixo passaria com metade do teste, e
    // quem ouve a tela nunca saberia qual filtro está ativo.
    expect(
      screen
        .getByRole('button', { name: 'Minhas' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('is a native button, which is what gives it Enter and Space (rule 26)', () => {
    render(<FilterChip label="Tudo" onPress={vi.fn()} pressed={false} />);

    const chip = screen.getByRole('button', { name: 'Tudo' });

    // jsdom não implementa o comportamento de ATIVAÇÃO por teclado (apertar
    // Espaço num `<button>` real dispara `click`; no jsdom, não dispara), então
    // o que se pina é o mecanismo que a plataforma usa: um `<button>` de
    // verdade. Um `<div role="button" onClick>` responde ao Enter — pelo
    // clique sintético do React — e fica MUDO no Espaço, que é justamente a
    // tecla de quem usa leitor de tela.
    expect(chip.tagName).toBe('BUTTON');
    expect(chip.getAttribute('type')).toBe('button');
  });

  it('calls onPress when activated (rule 26)', () => {
    const onPress = vi.fn();
    render(<FilterChip label="Tudo" onPress={onPress} pressed={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tudo' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
