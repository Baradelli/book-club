import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../button';
import { ContextBar } from '../context-bar';
import { MIN_TOUCH_TARGET_PX, SPACING_STEP_PX } from '../styles';

/**
 * TAREFA 41b — A BARRA DE CONTEXTO, que é **a única navegação de volta do
 * app** (decisão fechada do MVP 3.5: não nasce menu, não nasce nav inferior).
 *
 * ⚠️ QUEM CONSOME (nota nº 10 da Tarefa 41a: parta do consumidor). Toda tela
 * que não é a home: livro (`pages/book.tsx`), dia (`pages/day-note.tsx`),
 * acervo (`pages/acervo.tsx`), busca (`pages/busca.tsx`), preferências e os
 * quatro formulários — nas telas de formulário ela também abriga a ação
 * primária. As fatias que a consomem são as Tarefas 42 a 48.
 *
 * As medidas, dos artboards dessas telas — as TRÊS formas da decisão H:
 *
 * | forma | artboard | altura | recuo |
 * | --- | --- | --- | --- |
 * | sem ação, celular | `Livro.dc.html:36`, `Dia.dc.html:36` | **38px** | `padding:0 20px` |
 * | com ação, celular | `NovaAnotacao.dc.html:36`, `NovoGrifo.dc.html:36` | **48px** | `padding:0 12px 0 20px` |
 * | desktop | `DiaDesktop.dc.html:35` | **46px** | `padding:0 40px` |
 *
 * Em todas: `background:var(--bg)`, `border-bottom:1px solid var(--border-soft)`,
 * o link em `--text-muted` com um chevron (14px no celular, 15px no desktop) e
 * o rótulo em `'Geist Mono'` 10px `letter-spacing:0.1em` maiúsculo.
 *
 * ⚠️ **A AÇÃO TEM DUAS PINTURAS, e a primeira entrega desta fatia afirmava,
 * aqui, que tinha uma só ("em todas: `background:var(--accent)`") — falso no
 * artboard que este mesmo arquivo elege como referência de desktop:**
 *
 * | artboard | ação | pintura |
 * | --- | --- | --- |
 * | `NovaAnotacao.dc.html:41`, `NovoGrifo.dc.html:41`, `NovaAnotacaoDesktop.dc.html:43` | criar/registrar | `--accent` CHEIO |
 * | `DiaDesktop.dc.html:40` | "Li hoje" | `--gold-soft` + `--gold-line` + `--gold-strong` — CONTORNO |
 */
describe('ContextBar', () => {
  it('is a real anchor, so Ctrl+click and "open in new tab" still work (rule 6)', () => {
    render(<ContextBar backLabel="Início" href="/" />);

    const back = screen.getByRole('link', { name: 'Início' });
    expect(back.tagName).toBe('A');
    expect(back.getAttribute('href')).toBe('/');
  });

  it('lets the app pass its router Link, so the PWA does not reload (renderLink)', () => {
    /*
      A mesma inversão do `ListItem`, e pela mesma razão medida na Tarefa 16:
      `<a href>` é navegação de DOCUMENTO e recarrega o shell inteiro do PWA,
      perdendo a sessão, o clube ativo e o rascunho do editor. `packages/ui`
      não pode importar `react-router-dom` (o barril passaria a arrastá-lo para
      todo bundle que importa um `Button`), então quem sabe do roteador é o
      consumidor.
    */
    render(
      <ContextBar
        backLabel="Acervo"
        href="/acervo"
        renderLink={({ children, className, href }) => (
          <a className={className} data-router-link="" href={href}>
            {children}
          </a>
        )}
      />,
    );

    const back = screen.getByRole('link', { name: 'Acervo' });
    expect(back.hasAttribute('data-router-link')).toBe(true);
    // ⚠️ E o `className` vai JUNTO: o alvo de toque, o filete e o anel de foco
    // são da barra, não do consumidor. Quem troca a âncora não deve ter de
    // copiar a lista de classes.
    expect(back.className).toContain('min-h-11');
  });

  it('⚠️ gives the back link a 44px target although the canvas draws 38px (rule 7)', () => {
    /*
      ⚠️ DIVERGÊNCIA CANVAS × DECISÃO F, e o piso vence — mesma classe da nota
      nº 6 da Tarefa 41a (a pílula "Refinar", o botão `seal` e a linha do
      sumário).

      O canvas desenha a barra sem ação com `height:38px` (`Livro.dc.html:36`)
      e o LINK dentro dela ocupa a altura toda. 38px está abaixo dos 44px da
      decisão F, e a regra 7 desta fatia é explícita: resolva com PADDING, não
      baixando o piso.

      Como foi resolvido: o piso de 44px está no LINK (`min-h-11`), via
      `py-` — não numa altura fixa da barra. A barra não declara altura nenhuma
      própria: ela é o que o link faz dela. Consequência honesta, e é o custo
      que fica registrado: **a faixa fica 44px em vez de 38px, 6px a mais**.

      A alternativa — 38px de barra com o link transbordando 3px para cada lado
      — foi recusada porque o alvo invadiria o cabeçalho acima e o conteúdo
      abaixo, criando dois alvos sobrepostos, que é um defeito pior que 6px.
    */
    render(<ContextBar backLabel="Início" href="/" />);

    const classes = screen
      .getByRole('link', { name: 'Início' })
      .className.split(/\s+/u);

    expect(classes).toContain('min-h-11');
    // O par que impede a tautologia: a classe é lida como px pela ponte de
    // `styles.ts`, e é essa conta que o CSS compilado confere em
    // `app/src/__tests__/ui-source-scan.test.ts`.
    expect(11 * SPACING_STEP_PX).toBe(MIN_TOUCH_TARGET_PX);
  });

  it('draws the mono label of the canvas, muted and upper case', () => {
    render(<ContextBar backLabel="A Coragem de Ser Imperfeito" href="/l/1" />);

    const label = screen.getByText('A Coragem de Ser Imperfeito');
    const classes = label.className.split(/\s+/u);
    expect(classes).toContain('font-mono');
    expect(classes).toContain('text-eyebrow');
    expect(classes).toContain('uppercase');
    expect(classes).toContain('tracking-[0.1em]');
    // O título do livro é longo e a barra é estreita: o canvas corta com
    // reticências (`Dia.dc.html:38`, `text-overflow:ellipsis`).
    expect(classes).toContain('truncate');
  });

  it('separates itself from the page with the hairline, never with a shadow', () => {
    const { container } = render(<ContextBar backLabel="Início" href="/" />);

    const bar = container.firstElementChild as HTMLElement;
    const classes = bar.className.split(/\s+/u);
    expect(classes).toContain('border-b');
    expect(classes).toContain('border-line-soft');
    expect(classes).toContain('bg-canvas');
    expect(classes.some((name) => name.startsWith('shadow'))).toBe(false);
  });

  it('carries a chevron from lucide, never a hand-drawn arrow (rule 8)', () => {
    const { container } = render(<ContextBar backLabel="Início" href="/" />);

    // O glifo vem do `lucide-react` e é `aria-hidden`: o rótulo ao lado já
    // diz para onde se volta. A guarda do pacote inteiro é
    // `src/__tests__/adr-0002-iconography.test.ts`, que proíbe `<svg` escrito
    // à mão em `ui/src` — aqui o que se pina é que o ícone EXISTE e está fora
    // do caminho do leitor de tela.
    const glyph = container.querySelector('svg');
    expect(glyph).not.toBeNull();
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
  });

  it('grows to the 48px of the canvas and shows a BUTTON when there is an action', () => {
    const onAction = vi.fn();
    render(
      <ContextBar
        actionLabel="Criar anotação"
        backLabel="Acervo"
        href="/acervo"
        onAction={onAction}
      />,
    );

    const action = screen.getByRole('button', { name: 'Criar anotação' });
    // Regra 6: a ação primária é `<button>`, nunca uma âncora com `onClick`.
    expect(action.tagName).toBe('BUTTON');
    expect(action.getAttribute('type')).toBe('button');

    fireEvent.click(action);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('⚠️ gives the action a 44px target although the canvas draws 34px (rule 7)', () => {
    /*
      `NovaAnotacao.dc.html:41` e `NovoGrifo.dc.html:41`: `height:34px`. É a
      MESMA divergência do link acima, e a mesma saída — o piso da decisão F
      vence, por padrão vertical. E aqui ela custa ZERO ao desenho: a faixa com
      ação tem 48px no canvas, então um alvo de 44px cabe dentro dela sem
      empurrar nada.
    */
    render(
      <ContextBar
        actionLabel="Registrar grifo"
        backLabel="Acervo"
        href="/acervo"
        onAction={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole('button', { name: 'Registrar grifo' })
        .className.split(/\s+/u),
    ).toContain('min-h-11');
  });

  it('paints the action with the ONE colour of action, filled (canvas)', () => {
    render(
      <ContextBar
        actionLabel="Criar anotação"
        backLabel="Acervo"
        href="/acervo"
        onAction={vi.fn()}
      />,
    );

    const classes = screen
      .getByRole('button', { name: 'Criar anotação' })
      .className.split(/\s+/u);
    expect(classes).toContain('bg-accent');
    expect(classes).toContain('text-accent-fg');
    // Mono maiúsculo, como o canvas (`NovaAnotacao.dc.html:41`) — a ação da
    // barra fala a língua do rótulo, não a do botão de corpo de página.
    expect(classes).toContain('font-mono');
    expect(classes).toContain('uppercase');
  });

  it('⚠️ has a SECOND action paint — the gold outline of "Li hoje" (audit)', () => {
    /*
      ⚠️ CORREÇÃO DA RODADA DE AUDITORIA (2026-09-21), e a afirmação que caiu
      era minha: o cabeçalho deste arquivo dizia "**em todas**: a ação é
      `background:var(--accent)`". **Falso no artboard que ele próprio elegeu
      como referência de desktop.**

      O canvas desenha DUAS pinturas de ação nesta barra:

      | artboard | ação | pintura |
      | --- | --- | --- |
      | `NovaAnotacaoDesktop.dc.html:43` | "Criar anotação" | `background:#143524` (`--accent`), `color:#f5f1e8` — CHEIA |
      | `DiaDesktop.dc.html:40` | "Li hoje" | `background:#faf3e4`, `border:1px solid #d6ae64`, `color:#785822` — CONTORNO DOURADO |

      ⚠️ E isso morde na Tarefa 44: ela monta "Li hoje" com este componente e
      receberia um botão cheio de verde onde o canvas pede contorno dourado —
      justamente o elemento que o §1 do plano quer discreto, porque ele é o
      "já fiz", não a ação principal da tela.

      ⚠️ **E A TINTA NÃO É NOVA.** Os três valores medidos acima são
      exatamente `--gold-soft` / `--gold-line` / `--gold-strong`, que é a
      variante `seal` do `Button` (Tarefa 41a, `button.tsx:67`). O nome é o
      mesmo de propósito: um terceiro nome para a mesma tinta é o defeito que
      este repositório já pagou três vezes.
    */
    const { rerender } = render(
      <ContextBar
        actionLabel="Criar anotação"
        backLabel="Acervo"
        href="/acervo"
        onAction={vi.fn()}
      />,
    );

    // `primary` é o padrão — é a forma que quatro das cinco telas de
    // formulário usam.
    expect(
      screen.getByRole('button', { name: 'Criar anotação' }).className,
    ).toContain('bg-accent');

    rerender(
      <ContextBar
        actionLabel="Li hoje"
        actionVariant="seal"
        backLabel="A Coragem de Ser Imperfeito"
        href="/l/1"
        onAction={vi.fn()}
      />,
    );

    const seal = screen
      .getByRole('button', { name: 'Li hoje' })
      .className.split(/\s+/u);
    expect(seal).toContain('border-gold-line');
    expect(seal).toContain('bg-gold-soft');
    expect(seal).toContain('text-gold-strong');
    expect(seal).not.toContain('bg-accent');
  });

  it('⚠️ speaks the SAME gold as the Button seal — one tint, not two (audit)', () => {
    /*
      O pino que impede a tinta de sair de sincronia. Se alguém repintar o
      `seal` do `Button` e esquecer daqui — ou o contrário —, o "Li hoje" do
      desktop e o "Li hoje" do corpo da página ficam de cores diferentes, e
      nada acusaria: os dois passariam nos seus próprios testes.

      Comparar a lista INTEIRA seria frágil (o `Button` tem `hover:` e o botão
      da barra não); o que se compara é o conjunto de tokens de COR. E a fonte
      do outro lado é o `Button` RENDERIZADO, não uma cópia das classes escrita
      aqui — uma cópia sairia de sincronia exatamente quando importa.
    */
    render(
      <ContextBar
        actionLabel="Li hoje"
        actionVariant="seal"
        backLabel="Livro"
        href="/l/1"
        onAction={vi.fn()}
      />,
    );
    render(<Button variant="seal">Li hoje</Button>);

    const colours = (classes: string) =>
      classes
        .split(/\s+/u)
        .filter((name) => /^(?:bg|text|border)-gold/u.test(name))
        .sort();

    const [barra, corpo] = screen.getAllByRole('button', { name: 'Li hoje' });

    expect(colours(barra?.className ?? '')).toEqual(
      colours(corpo?.className ?? ''),
    );
    // Sem isto o teste passaria com os dois vazios — a asserção vazia do §7.4.
    expect(colours(barra?.className ?? '')).toEqual([
      'bg-gold-soft',
      'border-gold-line',
      'text-gold-strong',
    ]);
  });

  it('⚠️ ships the 46px bar of the desktop artboard — all THREE heights (audit)', () => {
    /*
      ⚠️ CORREÇÃO DA RODADA DE AUDITORIA (2026-09-21).

      A primeira entrega media as três alturas do canvas (38 / 48 / **46px**) e
      entregava duas: no desktop a barra saía com 44px (sem ação) ou 48px (com
      ação), nunca 46. Dos três números medidos, dois não chegavam à tela e só
      o de 38px estava declarado como custo — o mesmo defeito de escrever a
      medição e não a usar.

      `DiaDesktop.dc.html:35`, `NovaAnotacaoDesktop.dc.html:37`,
      `NovoGrifoDesktop.dc.html:37` e `LivroDesktop.dc.html:35`: `height:46px`,
      os quatro. A partir de 1120px a barra tem 46px **com ação e sem**, e o
      alvo de 44px do link cabe inteiro dentro dela.
    */
    const { container, rerender } = render(
      <ContextBar backLabel="Início" href="/" />,
    );

    const bar = () => (container.firstElementChild as HTMLElement).className;

    expect(bar().split(/\s+/u)).toContain('min-[1120px]:h-[46px]');

    rerender(
      <ContextBar
        actionLabel="Salvar"
        backLabel="Início"
        href="/"
        onAction={vi.fn()}
      />,
    );

    // ⚠️ `h-` e não `min-h-`: com ação o celular pede 48px (`min-h-12`), e um
    // `min-h-[46px]` no desktop NÃO desceria dos 48 — a barra ficaria 2px
    // fora do canvas justamente na tela em que o botão aparece. Altura fixa
    // no desktop é o que faz as duas formas terem os 46px medidos.
    expect(bar().split(/\s+/u)).toContain('min-[1120px]:h-[46px]');
  });

  it('keeps the bar SHORT when there is no action, and taller when there is', () => {
    const { container, rerender } = render(
      <ContextBar backLabel="Início" href="/" />,
    );

    const quiet = (container.firstElementChild as HTMLElement).className.split(
      /\s+/u,
    );
    expect(quiet).toContain('px-5');
    expect(quiet).not.toContain('min-h-12');

    rerender(
      <ContextBar
        actionLabel="Salvar"
        backLabel="Início"
        href="/"
        onAction={vi.fn()}
      />,
    );

    const busy = (container.firstElementChild as HTMLElement).className.split(
      /\s+/u,
    );
    // 48px (`NovaAnotacao.dc.html:36`) e `padding:0 12px 0 20px`.
    expect(busy).toContain('min-h-12');
    expect(busy).toContain('pl-5');
    expect(busy).toContain('pr-3');
  });

  it('opens up to the 40px gutter of the desktop artboard (≥1120px)', () => {
    /*
      `DiaDesktop.dc.html:35`: `padding:0 40px`. O corte é o mesmo ≥1120px da
      decisão fechada do MVP 3.5, e é MEDIA QUERY — nenhuma ramificação por
      dispositivo, nenhum `userAgent`.
    */
    const { container } = render(<ContextBar backLabel="Início" href="/" />);

    expect(
      (container.firstElementChild as HTMLElement).className.split(/\s+/u),
    ).toContain('min-[1120px]:px-10');
  });

  it('carries no text of its own — both words come from the screen (decision A)', () => {
    const { container } = render(
      <ContextBar
        actionLabel="Criar anotação"
        backLabel="Acervo"
        href="/acervo"
        onAction={vi.fn()}
      />,
    );

    // Tudo que aparece são as duas props. Uma palavra a mais seria a 34ª
    // string do pacote, e o teto do `no-hardcoded-ui-text` só pode cair.
    expect(container.textContent).toBe('AcervoCriar anotação');
  });
});
