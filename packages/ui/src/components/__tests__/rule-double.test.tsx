import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RuleDouble } from '../rule-double';

/**
 * TAREFA 41b — O FILETE DUPLO da edição crítica.
 *
 * ⚠️ QUEM CONSOME (nota nº 10 da Tarefa 41a: parta do consumidor). É a régua
 * que abre a leitura de hoje na **home** (`pages/home.tsx`, Tarefa 42) e a que
 * separa o cabeçalho do dia do campo de escrita na tela do **dia**
 * (`pages/day-note.tsx`, Tarefa 43) e na da **anotação avulsa**
 * (`pages/free-note.tsx`, Tarefa 45).
 *
 * As medidas, dos artboards dessas três telas:
 *
 * | onde | linhas | desenho |
 * | --- | --- | --- |
 * | home | `Inicio.dc.html:44-47` | coluna com `gap:3px`; **2px `--accent` em cima**, 1px `--border` embaixo |
 * | dia | `Dia.dc.html:49-52` | coluna com `gap:3px`; 1px `--border` em cima, **2px `--accent` embaixo** |
 * | avulsa | `NovaAnotacao.dc.html:59-62` | idem ao dia |
 * | dia, desktop | `DiaDesktop.dc.html:58-61` | idem ao dia |
 *
 * Ou seja: o par é o MESMO, e o que muda é de que lado fica o traço grosso.
 * Daí `accent="top" | "bottom"` em vez de dois componentes.
 */
describe('RuleDouble', () => {
  function rules(container: HTMLElement): HTMLElement[] {
    const rule = container.firstElementChild;
    if (!(rule instanceof HTMLElement)) throw new Error('nada renderizado');
    return [...rule.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
  }

  it('is two rules, 2px and 1px, separated by the 3px gap of the canvas', () => {
    const { container } = render(<RuleDouble />);

    const rule = container.firstElementChild as HTMLElement;
    expect(rule.className.split(/\s+/u)).toContain('gap-[3px]');

    const [first, second] = rules(container);
    expect(rules(container)).toHaveLength(2);
    // `h-0.5` é 2px e `h-px` é 1px — a conversão é o `SPACING_STEP_PX` de
    // `styles.ts`, e quem a ancora no CSS compilado é
    // `app/src/__tests__/ui-source-scan.test.ts`.
    expect(first?.className.split(/\s+/u)).toContain('h-0.5');
    expect(second?.className.split(/\s+/u)).toContain('h-px');
  });

  it('puts the heavy accent rule ON TOP by default (Inicio.dc.html:44-47)', () => {
    const { container } = render(<RuleDouble />);

    const [first, second] = rules(container);
    expect(first?.className.split(/\s+/u)).toContain('bg-accent');
    expect(second?.className.split(/\s+/u)).toContain('bg-line');
  });

  it('INVERTS the pair when the accent goes below (Dia.dc.html:49-52)', () => {
    const { container } = render(<RuleDouble accent="bottom" />);

    /*
      ⚠️ A INVERSÃO É DE ORDEM NO DOM, não de cor trocada de lugar. O canvas
      inverte os dois `<div>`: no dia o fino de `--border` vem primeiro e o
      grosso de `--accent` vem depois. Um componente que invertesse só as CORES
      deixaria o traço GROSSO em cima nas duas formas — que é exatamente o que
      o olho lê como "abre a seção".
    */
    const [first, second] = rules(container);
    expect(first?.className.split(/\s+/u)).toContain('h-px');
    expect(first?.className.split(/\s+/u)).toContain('bg-line');
    expect(second?.className.split(/\s+/u)).toContain('h-0.5');
    expect(second?.className.split(/\s+/u)).toContain('bg-accent');
  });

  it('stays OUT of the screen reader path — it is decoration (rule 6)', () => {
    const { container } = render(<RuleDouble />);

    const rule = container.firstElementChild as HTMLElement;
    // Uma régua anunciada é ruído: quem ouve a tela recebe "grupo" e nada
    // dentro. `aria-hidden` no pai já esconde os dois filhos.
    expect(rule.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toBe('');
  });

  it('lets the screen place it without losing the pair (className)', () => {
    const { container } = render(<RuleDouble className="my-4" />);

    const classes = (
      container.firstElementChild as HTMLElement
    ).className.split(/\s+/u);
    expect(classes).toContain('my-4');
    expect(classes).toContain('flex');
  });
});
