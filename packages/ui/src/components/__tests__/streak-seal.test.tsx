import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StreakSeal } from '../streak-seal';

/**
 * TAREFA 41b — O SELO DA CORRENTE DE LEITURA (o "foguinho" do ADR 0010).
 *
 * ⚠️ QUEM CONSOME (nota nº 10 da Tarefa 41a: parta do consumidor). A home, e
 * só ela: `pages/home.tsx` renderiza a `StreakBar` (`pages/streak-bar.tsx`),
 * que hoje escreve o fogo e o número por conta própria. A Tarefa 42 troca
 * aquele desenho por este componente.
 *
 * As medidas, no artboard dessa tela:
 *
 * | estado | `Inicio.dc.html` | `InicioDesktop.dc.html` |
 * | --- | --- | --- |
 * | com corrente | `:97-101` — `border:1px solid var(--gold-line)`, `background:var(--gold-soft)`, `border-radius:999px`, `padding:6px 12px`, `gap:7px`; número mono 12px 500 em `--gold-strong`; rótulo 12px em `--text-muted` | `:108-112` — idem, `padding:7px 14px`, `gap:9px`, 12,5px |
 * | sem corrente | `:102-106` — `border:1px solid var(--border-soft)`, `background:var(--surface)`; número em `--text-muted` | `:113-117` — idem |
 *
 * ⚠️ **O QUE O CANVAS NÃO DECIDE, e está registrado:** nos dois artboards as
 * DUAS pílulas têm número maior que zero (11 e 4) — a de cima é "Você" e a de
 * baixo é "Bruno". O canvas desenha duas PINTURAS; ele não diz qual estado
 * ganha qual. Quem diz é a decisão da fatia ("dois estados, com corrente e
 * sem") e o código que já existe: `streak-bar.tsx:78` pinta pelo
 * `row.streak === 0`. É esse o mapeamento aqui.
 */
describe('StreakSeal', () => {
  it('lights up in gold while the chain is alive, and goes quiet at zero', () => {
    const { container, rerender } = render(
      <StreakSeal count={11} label="dias seguidos · Você" />,
    );

    const seal = () => container.firstElementChild as HTMLElement;

    expect(seal().className.split(/\s+/u)).toContain('border-gold-line');
    expect(seal().className.split(/\s+/u)).toContain('bg-gold-soft');

    rerender(<StreakSeal count={0} label="ainda não começou · Bruno" />);

    expect(seal().className.split(/\s+/u)).toContain('border-line-soft');
    expect(seal().className.split(/\s+/u)).toContain('bg-surface');
    expect(seal().className.split(/\s+/u)).not.toContain('bg-gold-soft');
  });

  it('⚠️ never lets the COLOUR be the only carrier — it says the NUMBER and the NAME', () => {
    /*
      Decisão F, com a mesma força do `filter-bar.test.tsx`. Um selo que fosse
      só uma pílula dourada diria "alguma coisa boa aconteceu" e nada mais —
      quem não distingue o dourado do creme (ou imprimiu a tela) ficaria sem
      informação nenhuma.

      Aqui a cor é REDUNDANTE por construção: o número e o rótulo são texto de
      verdade, no DOM, legíveis por leitor de tela sem `aria-label` nenhum.
    */
    const { container } = render(
      <StreakSeal count={11} label="dias seguidos · Você" />,
    );

    expect(container.textContent).toBe('11dias seguidos · Você');
    // E o glifo NÃO fala: um ícone anunciado no meio da frase ("marcador, 11,
    // dias seguidos") atrapalha em vez de ajudar.
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('⚠️ is a BOOKMARK, not a flame — the canvas draws one and the §1 wants one', () => {
    /*
      ⚠️ CORREÇÃO DA RODADA DE AUDITORIA (2026-09-21), POR DECISÃO DO DONO.

      A entrega usava `Flame`, porque a regra 8 da spec da 41b o nomeava. **A
      spec estava errada**, e o dono corrigiu: o canvas desenha um MARCADOR DE
      LIVRO (`Inicio.dc.html:98` e `InicioDesktop.dc.html:109`, o path
      `M6 3h12v18l-6-4.5L6 21z` — a ponta em V de um marcador, não a língua de
      uma chama), e `lucide-react@0.469` tem `Bookmark`.

      ⚠️ **E há um argumento além da fidelidade, que é o que faz esta linha
      valer um teste:** a chama é a metáfora do Duolingo, e ela é enquadrada na
      PERDA — o fogo que "apaga". O marcador é presença: ele diz onde você
      parou. O §1 do `docs/plano-clube-do-livro.md` é anti-culpa, e o ícone é
      a parte do selo que fala mais rápido que o número.

      O ADR 0010 não é reaberto: ele nomeia o MECANISMO (a corrente visível, o
      "foguinho" como apelido), não o glifo.

      O acusador do ADR 0002 (`adr-0002-iconography.test.ts`) continua sendo
      quem garante que o glifo VEM do lucide; este aqui é quem garante QUAL.
    */
    const { container } = render(
      <StreakSeal count={11} label="dias seguidos · Você" />,
    );

    const glyph = container.querySelector('svg');
    // O lucide carrega o nome do ícone na classe (`lucide-bookmark`), que é a
    // única forma de perguntar "qual glifo?" sem desenhar um `<path>` à mão
    // aqui dentro para comparar.
    expect(glyph?.getAttribute('class')).toContain('lucide-bookmark');
    expect(glyph?.getAttribute('class')).not.toContain('lucide-flame');
  });

  it('⚠️ paints the glyph with stroke-*, never with text-* (the --gold guard)', () => {
    /*
      ⚠️ ISTO NÃO É ESTÉTICA — é o que torna possível a guarda de primeiro uso
      de `text-gold` (`app/src/__tests__/theme-tokens.test.ts`).

      Medido: `--gold` (`#946d2c`) dá 4,16 / 4,31 / **3,97** contra as três
      superfícies no tema claro. Como TEXTO ele reprova (piso 4,5:1); como
      TRAÇO DE ÍCONE ele passa, porque o piso de componente não textual é 3:1 —
      e é exatamente assim que o canvas o usa aqui (`Inicio.dc.html:98`,
      `stroke="var(--gold)"`).

      Uma varredura de código-fonte não consegue adivinhar se um `text-gold`
      está num `<span>` de texto ou num `<svg>`. Então a distinção virou
      ESTRUTURAL: quem pinta traço usa `stroke-*` (que só afeta SVG), e
      `text-gold` fica livre para ser proibido como texto sem proibir o token.

      O `stroke` do CSS vence o atributo `stroke="currentColor"` que o lucide
      escreve no `<svg>` — propriedade CSS ganha de atributo de apresentação.
    */
    const { container, rerender } = render(
      <StreakSeal count={11} label="dias seguidos · Você" />,
    );

    const glyphClass = () =>
      (container.querySelector('svg')?.getAttribute('class') ?? '').split(
        /\s+/u,
      );

    expect(glyphClass()).toContain('stroke-gold');
    expect(glyphClass()).not.toContain('text-gold');

    rerender(<StreakSeal count={0} label="ainda não começou · Bruno" />);

    expect(glyphClass()).toContain('stroke-subtle');
    expect(glyphClass()).not.toContain('text-subtle');
  });

  it('writes the number in mono, the way every short datum of the drawing is', () => {
    render(<StreakSeal count={4} label="dias seguidos · Bruno" />);

    const number = screen.getByText('4');
    const classes = number.className.split(/\s+/u);
    expect(classes).toContain('font-mono');
    expect(classes).toContain('font-medium');
    // Com corrente o número é a tinta dourada ESCURA — a mesma que o canvas
    // usa (`Inicio.dc.html:99`, `color:var(--gold-strong)`), e a única do
    // dourado que passa 4,5:1 contra as três superfícies no tema claro.
    expect(classes).toContain('text-gold-strong');
  });

  it('turns the number muted at zero, so nothing reads like a debt', () => {
    /*
      ⚠️ PRINCÍPIO ANTI-CULPA (`docs/plano-clube-do-livro.md` §1): o zero é um
      estado, não uma cobrança. Nada de vermelho, nada de badge de pendência —
      o selo apagado é a MESMA pílula, em cinza.
    */
    render(<StreakSeal count={0} label="ainda não começou · Bruno" />);

    const classes = screen.getByText('0').className.split(/\s+/u);
    expect(classes).toContain('text-muted');
    expect(classes).not.toContain('text-danger');
  });

  it('is the pill of the canvas: rounded-full, hairline, and no shadow', () => {
    const { container } = render(
      <StreakSeal count={2} label="dias seguidos · Você" />,
    );

    const classes = (
      container.firstElementChild as HTMLElement
    ).className.split(/\s+/u);
    expect(classes).toContain('rounded-full');
    expect(classes).toContain('border');
    expect(classes).toContain('px-3');
    expect(classes).toContain('py-1.5');
    expect(classes.some((name) => name.startsWith('shadow'))).toBe(false);
  });

  it('is not a control — nothing here is clickable (ADR 0010)', () => {
    const { container } = render(
      <StreakSeal count={11} label="dias seguidos · Você" />,
    );

    // O canvas desenha um `<div>` (`Inicio.dc.html:97`). Um selo clicável
    // pediria um destino que não existe — e um alvo de toque de 44px, que
    // faria a pílula de 30px do desenho crescer sem ganhar nada.
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
  });

  it('carries no text of its own — the words come from the screen (decision A)', () => {
    render(<StreakSeal count={1} label="dia seguido · Você" />);

    // Inclusive o plural: "dia" × "dias" é regra de catálogo (o par de plural
    // de `pages.home.streak.days`), e `packages/ui` não conhece catálogo.
    expect(screen.getByText('dia seguido · Você')).toBeTruthy();
  });
});
