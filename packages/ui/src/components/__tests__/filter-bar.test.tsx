import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FilterBar, type FilterGroup, type FilterOption } from '../filter-bar';
import { PersonAvatar } from '../person-avatar';
import { MIN_TOUCH_TARGET_PX, SPACING_STEP_PX } from '../styles';

/**
 * O `FilterBar` da Tarefa 27 — as regras 1 a 4.
 *
 * ⚠️ **A REGRA 5 (o ADR 0002) NÃO MORA AQUI, e é a mesma lição do
 * `filter-chip.test.tsx`:** a varredura por "cadeado / olho fechado / privado"
 * vive em `src/__tests__/adr-0002-iconography.test.ts`, que lê `ui/src`
 * INTEIRO e proíbe também `<svg>` inline — uma varredura por arquivo deixa
 * passar o mesmo ícone no vizinho, e lista de termos nenhuma pega desenho à
 * mão. O nome do arquivo novo está pinado lá.
 *
 * ⚠️ **E A REGRA 6 TAMBÉM NÃO MORA AQUI**: "nenhuma string de interface nova
 * em `packages/ui`" é propriedade do PACOTE, e a guarda dela é
 * `src/__tests__/no-hardcoded-ui-text.test.ts`. Os rótulos deste arquivo são
 * português cravado de propósito — é um teste, e nada em `__tests__/` embarca
 * no PWA nem é varrido por aquela guarda.
 *
 * O que NÃO se testa aqui: o `FilterChip` (regras 25 a 27 da Tarefa 13, com
 * suíte própria) e aparência. O que se testa é o que a COMPOSIÇÃO pode perder:
 * o nome acessível de cada grupo, o `aria-pressed` de cada chip, o rótulo
 * textual que a amostra de cor não substitui, e o alvo de toque.
 */

/** Fixture é factory (§7.7): cada teste ganha as suas opções. */
function anOption(overrides: Partial<FilterOption> = {}): FilterOption {
  return { value: 'all', label: 'Tudo', ...overrides };
}

/**
 * ⚠️ **DOIS GRUPOS, E OS DOIS COM UMA OPÇÃO DE VALOR `all`** (§7.2: o fixture
 * se escolhe para a implementação errada falhar).
 *
 * Um `FilterBar` que guardasse UMA seleção para a barra inteira — em vez de uma
 * por grupo — passaria num fixture de valores todos distintos. Aqui ele acusa:
 * "pessoa" começa em `all` e "cor" começa em `yellow`, então o `all` da cor tem
 * de estar **solto** enquanto o da pessoa está pressionado.
 */
function twoGroups(
  overrides: {
    person?: Partial<FilterGroup>;
    color?: Partial<FilterGroup>;
  } = {},
): FilterGroup[] {
  return [
    {
      id: 'person',
      label: 'Como olhar o acervo',
      options: [
        anOption(),
        anOption({ value: 'mine', label: 'Minhas' }),
        anOption({ value: 'u-maria', label: 'de Maria' }),
      ],
      selected: 'all',
      onSelect: vi.fn(),
      ...overrides.person,
    },
    {
      id: 'color',
      label: 'Cor do grifo',
      options: [
        anOption({ value: 'all', label: 'Todas as cores' }),
        anOption({ value: 'yellow', label: 'Amarelo' }),
      ],
      selected: 'yellow',
      onSelect: vi.fn(),
      ...overrides.color,
    },
  ];
}

function chip(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

function chipsOf(groupName: string): HTMLElement[] {
  const group = screen.getByRole('group', { name: groupName });
  return Array.from(group.querySelectorAll('button'));
}

/**
 * `min-h-11` → 44px. A mesma conversão do `button.test.tsx`, e pelo mesmo
 * motivo: jsdom não tem layout nenhum (`offsetHeight` é sempre 0), então a
 * decisão real está na classe — que é o que vira CSS.
 */
function minHeightPxFromClass(className: string): number {
  const match = /\bmin-h-(\d+)\b/u.exec(className);
  if (match === null) {
    throw new Error(`\`${className}\` não declara nenhuma classe min-h-<n>`);
  }
  return Number(match[1]) * SPACING_STEP_PX;
}

describe('FilterBar', () => {
  it('renders one group per dimension, each with its OWN accessible name (rule 1)', () => {
    render(<FilterBar groups={twoGroups()} />);

    // DECISÃO C: sem o `role="group"` com `aria-label` próprio, quem usa leitor
    // de tela ouve cinco botões seguidos sem saber onde acaba "pessoa" e começa
    // "cor".
    expect(screen.getAllByRole('group')).toHaveLength(2);
    expect(
      chipsOf('Como olhar o acervo').map((item) => item.textContent),
    ).toEqual(['Tudo', 'Minhas', 'de Maria']);
    expect(chipsOf('Cor do grifo').map((item) => item.textContent)).toEqual([
      'Todas as cores',
      'Amarelo',
    ]);
  });

  it('renders no group at all when there is no group to render (rule 1)', () => {
    // O lado negativo do par: um componente que injetasse um grupo vazio — ou
    // um "tudo" de fabricação própria (decisão H) — apareceria aqui.
    render(<FilterBar groups={[]} />);

    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('reflects the selection in aria-pressed, per group and in BOTH directions (rule 2)', () => {
    render(<FilterBar groups={twoGroups()} />);

    expect(chip('Tudo').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Minhas').getAttribute('aria-pressed')).toBe('false');
    expect(chip('de Maria').getAttribute('aria-pressed')).toBe('false');

    /*
      ⚠️ E A SELEÇÃO É POR GRUPO: o `all` da cor está SOLTO enquanto o `all` da
      pessoa está pressionado. Uma barra com uma seleção só passaria no par de
      cima e erraria aqui — e na tela isso é um chip aceso em duas dimensões ao
      mesmo tempo.
    */
    expect(chip('Todas as cores').getAttribute('aria-pressed')).toBe('false');
    expect(chip('Amarelo').getAttribute('aria-pressed')).toBe('true');

    // `aria-checked` pertence a radio/checkbox (regra 25 da Tarefa 13): num
    // botão ele faz o leitor de tela anunciar um controle que não existe.
    for (const button of screen.getAllByRole('button')) {
      expect(button.hasAttribute('aria-checked')).toBe(false);
    }
  });

  it('calls onSelect of the RIGHT group with the option, and moves nothing by itself (rule 2, decision A)', () => {
    const onPerson = vi.fn();
    const onColor = vi.fn();
    render(
      <FilterBar
        groups={twoGroups({
          person: { onSelect: onPerson },
          color: { onSelect: onColor },
        })}
      />,
    );

    fireEvent.click(chip('de Maria'));

    // A opção INTEIRA, e não só o `value`: é o que a tela precisa para não
    // manter um segundo mapa de valor → rótulo.
    expect(onPerson).toHaveBeenCalledTimes(1);
    expect(onPerson).toHaveBeenCalledWith({
      value: 'u-maria',
      label: 'de Maria',
    });
    // E o toque num grupo não chama o callback do outro.
    expect(onColor).not.toHaveBeenCalled();

    /*
      ⚠️ **CONTROLADO (decisão A): a barra NÃO mexe na seleção.** Um componente
      com estado próprio deixaria "de Maria" pressionado aqui — e aí a tela
      perderia o poder de decidir se o filtro vive na URL, no `useState` ou em
      nada, e a Tarefa 28 lutaria contra ele.
    */
    expect(chip('de Maria').getAttribute('aria-pressed')).toBe('false');
    expect(chip('Tudo').getAttribute('aria-pressed')).toBe('true');
  });

  it('puts the start slot BEFORE the label, and the label stays the accessible name (rule 3, decisions D and E)', () => {
    render(
      <FilterBar
        groups={[
          {
            id: 'person',
            label: 'Como olhar o acervo',
            options: [
              {
                value: 'u-maria',
                label: 'de Maria',
                // DECISÃO D: o slot `start` do `FilterChip` nasceu na Tarefa 13
                // para este uso exato. ⚠️ Ele já tinha dois chamadores com
                // `ColorSwatch` (Tarefas 24/25) — o que é novo é o AVATAR nele.
                start: <PersonAvatar id="u-maria" name="Maria" size="sm" />,
              },
            ],
            selected: 'u-maria',
            onSelect: vi.fn(),
          },
        ]}
      />,
    );

    /*
      ⚠️ **A REGRA 4 DA TAREFA 25, MEDIDA LÁ: cor (e avatar) não pode ser o
      ÚNICO portador de informação.** O nome acessível do chip é o RÓTULO — a
      amostra e o avatar entram `aria-hidden`, porque o texto já está ao lado.
      Um chip só-com-amostra teria nome acessível vazio, e quem não distingue as
      cinco cores (ou as iniciais de duas pessoas) ficaria sem nada.
    */
    const person = chip('de Maria');
    expect(person.textContent).toContain('de Maria');

    // O avatar está DENTRO do chip e sai do caminho do leitor de tela.
    const avatar = person.querySelector('[aria-hidden="true"]');
    expect(avatar).not.toBeNull();
    expect(avatar?.textContent).toBe('M');
  });

  it('keeps the 44px touch target and the visible focus ring of the chip (rule 4)', () => {
    render(<FilterBar groups={twoGroups()} />);

    for (const button of screen.getAllByRole('button')) {
      // A composição não pode perder o que o `FilterChip` já garante: o piso de
      // toque (decisão F da Tarefa 13 — "escrever no celular, à noite, com uma
      // mão") e o anel de foco de quem navega por teclado.
      expect(minHeightPxFromClass(button.className)).toBeGreaterThanOrEqual(
        MIN_TOUCH_TARGET_PX,
      );
      expect(button.className).toContain('focus-visible:outline-focus');
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
    }
  });

  it('requires a textual label on every option, and the COMPILER is the guard (rule 3)', () => {
    /*
      ⚠️ §7.1.1: o compilador recusa o LITERAL, e é a metade que fecha a porta
      onde ela é usada — nenhuma tela monta opção por variável solta. Um chip
      só-com-amostra não compila.

      O acusador desta linha é o `pnpm -r typecheck`: sem o `label` obrigatório
      no `FilterOption`, o `@ts-expect-error` fica sem erro para esperar e o
      próprio `tsc` acusa ("unused @ts-expect-error").
    */
    // ⚠️ A diretiva vai no INÍCIO da declaração, e não na linha da propriedade
    // que falta: o `TS2741` ("Property 'label' is missing") é reportado no
    // OBJETO, não dentro dele — medido, com o `tsc` acusando "Unused
    // '@ts-expect-error' directive" na posição errada.
    // @ts-expect-error — `label` é obrigatório: cor não pode ser o único
    // portador de informação (decisão E).
    const colourOnly: FilterOption = {
      value: 'yellow',
      start: <span />,
    };

    expect(colourOnly.value).toBe('yellow');
  });
});
