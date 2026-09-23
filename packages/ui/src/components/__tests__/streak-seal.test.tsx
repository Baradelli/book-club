import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StreakSeal } from '../streak-seal';

/**
 * TAREFA 41b — O SELO DA CORRENTE DE LEITURA (o "foguinho" do ADR 0010).
 *
 * ⚠️ QUEM CONSOME (nota nº 10 da Tarefa 41a: parta do consumidor). A home, e
 * só ela: `pages/home.tsx` renderiza a `StreakBar` (`pages/streak-bar.tsx`).
 * ~~que hoje escreve o fogo e o número por conta própria. A Tarefa 42 troca
 * aquele desenho por este componente.~~ **Quem trocou foi a Tarefa 45** — não
 * a 42, e a frase ficou no futuro por três fatias. A `StreakBar` de hoje
 * consome este componente e não desenha marcação nenhuma por conta própria.
 *
 * As medidas, no artboard dessa tela:
 *
 * | estado | `Inicio.dc.html` | `InicioDesktop.dc.html` |
 * | --- | --- | --- |
 * | com corrente | `:97-101` — `border:1px solid var(--gold-line)`, `background:var(--gold-soft)`, `border-radius:999px`, `padding:6px 12px`, `gap:7px`; número mono 12px 500 em `--gold-strong`; rótulo 12px em `--text-muted` | `:108-112` — idem, `padding:7px 14px`, `gap:9px`, 12,5px |
 * | sem corrente | `:102-106` — `border:1px solid var(--border-soft)`, `background:var(--surface)`; número em `--text-muted` | `:113-117` — idem |
 *
 * ⚠️⚠️ ~~**O QUE O CANVAS NÃO DECIDE, e está registrado:** nos dois artboards
 * as DUAS pílulas têm número maior que zero (11 e 4) … O canvas desenha duas
 * PINTURAS; ele não diz qual estado ganha qual.~~ **ELE DIZ, e este parágrafo
 * estava errado — corrigido na auditoria da Tarefa 45.**
 *
 * Medido com o conteúdo impresso: a pílula de baixo é a do **Bruno**, que tem
 * **4 dias de corrente** (`InicioDesktop.dc.html:115`), e ela é a APAGADA
 * (`:113`: `border:1px solid #e3ddc9`, `background:#f9f5ec`). O celular
 * desenha o mesmo (`Inicio.dc.html:102-105`). Ou seja: o que acende o selo é
 * ser o de QUEM ESTÁ OLHANDO, não ter corrente — e o canvas diz isso com
 * clareza, bastava ler o número ao lado da pintura.
 *
 * O componente não sabe quem está olhando: quem diz é a tela, pela prop
 * `tone`. O `count > 0` que este parágrafo descrevia continua existindo como
 * **padrão** da prop, para não quebrar chamador nenhum — ver o docblock dela.
 */
describe('StreakSeal', () => {
  /**
   * ⚠️ **ISTO É O PADRÃO, E SÓ O PADRÃO — desde a auditoria da Tarefa 45.**
   *
   * Sem `tone` o selo acende por ter corrente, que é o desenho que este
   * componente tinha desde a 41b e que fica exatamente onde estava para a prop
   * nova ser acréscimo e não quebra. **Não é a regra do produto**: o canvas
   * acende o selo de QUEM ESTÁ OLHANDO (`InicioDesktop.dc.html:113-116`
   * desenha o Bruno, com 4 dias, apagado), e quem sabe disso é a tela. Ver o
   * `it()` do `tone` abaixo.
   */
  it('lights up in gold while the chain is alive, and goes quiet at zero — BY DEFAULT', () => {
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

    /*
      ⚠️⚠️ **O ESPAÇO É UM NÓ DE TEXTO, e esta linha exigia a frase COLADA até
      a auditoria da Tarefa 45.**

      O DOM eram dois `<span>` irmãos sem nada entre eles, então o
      `textContent` era `11dias seguidos · Você` — e o docblock da `StreakBar`
      afirmava que quem ouve a tela lê a frase inteira. Não lia: o `gap-1.75`
      é CSS e não chega à árvore de acessibilidade, e este próprio teste
      pinava a forma colada.

      O conserto é um espaço de verdade, **não** um `aria-label` (ele reporia
      a informação duas vezes no DOM, que é o defeito que este componente
      existe para não ter). Num contêiner `flex` o item anônimo só de espaço
      não é desenhado, então a tela não mudou e a frase passou a ser a frase.
    */
    expect(container.textContent).toBe('11 dias seguidos · Você');
    // E o glifo NÃO fala: um ícone anunciado no meio da frase ("marcador, 11,
    // dias seguidos") atrapalha em vez de ajudar.
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  /**
   * ⚠️⚠️ **O `tone` — QUEM ACENDE É A TELA, e o canvas diz por quê.**
   *
   * `InicioDesktop.dc.html:113-116` desenha o selo do **Bruno**, que tem
   * **4 dias de corrente**, na pílula APAGADA (`border:1px solid #e3ddc9`,
   * `background:#f9f5ec`); `Inicio.dc.html:102-105` faz o mesmo no celular. O
   * dourado é PERTENCIMENTO, não prêmio: `packages/ui` não sabe quem é o
   * usuário, então a tela passa `isMine ? 'lit' : 'quiet'`.
   *
   * ⚠️ **As duas contagens aqui são > 0 de propósito.** Com um zero no meio, o
   * padrão (`count > 0`) e a prop dariam a mesma resposta e este teste ficaria
   * verde sem guardar nada — que foi exatamente como o defeito passou.
   */
  it('⚠️ lets the SCREEN say which seal is lit, whatever the count says', () => {
    const { container, rerender } = render(
      <StreakSeal count={4} label="dias seguidos · Bruno" tone="quiet" />,
    );

    const classes = () =>
      (container.firstElementChild as HTMLElement).className.split(/\s+/u);

    // Corrente VIVA e mesmo assim apagado — o padrão diria o contrário.
    expect(classes()).toContain('border-line-soft');
    expect(classes()).toContain('bg-surface');
    expect(classes()).not.toContain('bg-gold-soft');
    expect(
      container.querySelector('svg')?.getAttribute('class')?.split(/\s+/u),
    ).toContain('stroke-subtle');

    // E o outro lado: zero dias, e aceso — porque é o SELO DE QUEM OLHA.
    rerender(
      <StreakSeal
        count={0}
        label="Comece a sua sequência hoje · Você"
        tone="lit"
      />,
    );

    expect(classes()).toContain('border-gold-line');
    expect(classes()).toContain('bg-gold-soft');
    expect(
      container.querySelector('svg')?.getAttribute('class')?.split(/\s+/u),
    ).toContain('stroke-gold');
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

  it('⚠️ draws NO number at zero — a zero is a score read over an invitation', () => {
    /*
      ⚠️ PRINCÍPIO ANTI-CULPA (`docs/plano-clube-do-livro.md` §1): o zero é um
      estado, não uma cobrança. Nada de vermelho, nada de badge de pendência —
      o selo é a MESMA pílula.

      ⚠️⚠️ **E ELE DEIXOU DE DESENHAR O NÚMERO, na auditoria da Tarefa 45.**
      Até aqui este teste exigia um "0" em `text-muted`, e a tela mostrava
      `0 Comece a sua sequência hoje · Maria`: um placar lido em voz alta
      **antes** do convite, e a única parte daquela frase que fala de dívida.
      O `0` saiu; a frase, que é o que o §1 quer que se leia, ficou.

      A metade que este teste guardava — "nada aqui é vermelho" — continua, e
      agora vale para o selo inteiro em vez de para um elemento só.
    */
    const { container } = render(
      <StreakSeal count={0} label="ainda não começou · Bruno" />,
    );

    expect(screen.queryByText('0')).toBeNull();
    expect(container.textContent).toBe('ainda não começou · Bruno');
    expect(
      (container.firstElementChild as HTMLElement).innerHTML,
    ).not.toContain('text-danger');
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
