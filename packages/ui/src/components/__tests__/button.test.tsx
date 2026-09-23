import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  Button,
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
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

  /*
    ============================================================================
    AS VARIANTES — Tarefa 41a, decisões A, B e C
    ============================================================================

    ⚠️ O QUE ESTE BLOCO GUARDA, E POR QUE ELE PRECISOU EXISTIR: até a Tarefa 41a
    a tabela `VARIANT_CLASS` não tinha acusador NENHUM. Medido: apagar o estilo
    de uma variante e deixá-la no tipo passava em 201 testes de `@clube/ui` —
    o `Record<ButtonVariant, string>` obriga a chave, mas nada obrigava o VALOR
    a pintar coisa alguma, e um `seal: ''` renderiza um botão sem selo.

    A decisão B mata `danger` (zero consumidores, medido: a única ocorrência era
    a própria declaração do tipo) e a decisão C faz nascer `seal`. Os dois
    sentidos do §7.1: a variante sai do TIPO e do ESTILO.
  */
  it('offers exactly the three variants the canvas draws (decisions B and C)', () => {
    // ⚠️ `danger` MORREU aqui, e é o pino que impede a ressurreição por
    // hábito: quem devolver a variante tem de vir a esta linha e explicar.
    // (Os utilitários `text-danger`/`border-danger` continuam vivos — o erro de
    // formulário de 8 telas é deles (contado; ver o docblock do `button.tsx`),
    // e a guarda `DANGER_STYLE` da varredura
    // anti-culpa depende deles. Variante de botão é outra coisa.)
    expect(Object.keys(BUTTON_VARIANTS).sort()).toEqual([
      'ghost',
      'primary',
      'seal',
    ]);
  });

  it.each(Object.keys(BUTTON_VARIANTS) as ButtonVariant[])(
    'gives variant %s a style that actually paints (decisions B and C)',
    (variant) => {
      // O lado que faltava: chave presente e valor vazio é o jeito silencioso
      // de ter uma variante que não existe na tela.
      const classes = BUTTON_VARIANTS[variant];
      expect(classes.split(/\s+/u).filter(Boolean).length).toBeGreaterThan(1);
      expect(classes).not.toContain('danger');

      renderButton({ variant });
      expect(screen.getByRole('button').className).toContain(
        classes.split(/\s+/u)[0],
      );
    },
  );

  it('paints the seal with the three gold tokens of the canvas (decision C)', () => {
    // `Livro.dc.html:55` (e `LivroDesktop.dc.html:55`): o estado "li hoje"
    // MARCADO é `background: var(--gold-soft)`, `border: 1px solid
    // var(--gold-line)`, `color: var(--gold-strong)`. Não é uma terceira
    // hierarquia de ação — é um ESTADO, e é por isso que ele é dourado e não
    // verde. Os três tokens andam juntos: fundo dourado com tinta de outra cor
    // é ilegível, e borda sem fundo é o `ghost`.
    renderButton({ children: 'Li hoje — tirar a marca', variant: 'seal' });

    const className = screen.getByRole('button').className;
    expect(className).toContain('bg-gold-soft');
    expect(className).toContain('border-gold-line');
    expect(className).toContain('text-gold-strong');
  });

  it('marks the seal with a lucide glyph, out of the screen reader path (rule 8)', () => {
    // O canvas desenha um "check" dentro do botão. Ele vem do `lucide-react`
    // (`CLAUDE.md`), e não de um `<polyline>` à mão: SVG inline em `ui/src` é
    // proibido por `adr-0002-iconography.test.ts`, porque a varredura de termos
    // do ADR 0002 pega PALAVRA — e desenho não tem palavra.
    renderButton({ children: 'Li hoje — tirar a marca', variant: 'seal' });

    const button = screen.getByRole('button');
    const glyph = button.querySelector('svg');
    expect(glyph).not.toBeNull();
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    // O rótulo continua sendo o nome acessível: o glifo não fala.
    expect(button.textContent).toContain('Li hoje — tirar a marca');
  });

  it('keeps the seal glyph out of the OTHER variants', () => {
    // O lado negativo do par: um `Check` desenhado sempre poria um selo em
    // todo botão "Salvar" do app.
    renderButton({ children: 'Salvar', variant: 'primary' });
    expect(screen.getByRole('button').querySelector('svg')).toBeNull();
  });
});
