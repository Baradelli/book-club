import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx } from '../cx';
import type { ListItemLinkProps } from './list';
import { FOCUS_RING } from './styles';

/**
 * O QUE A BARRA ENTREGA A QUEM RENDERIZA A ÂNCORA — o mesmo contrato do
 * `ListItem`, e **de propósito o mesmo NOME**.
 *
 * ⚠️ Não nasce um segundo tipo com a mesma forma: este repositório já pagou
 * três vezes por dois nomes para uma coisa só (o `GUILT_TERMS` em duas cópias
 * até a Tarefa 19, o `dayRange` do `CLAUDE.md`, o `'Alguém do clube'` em três
 * chaves). O nome fala do primeiro componente que teve o contrato, e
 * renomeá-lo tocaria `packages/app/src/router-link.tsx`, que esta fatia não
 * toca.
 */
export type ContextBarLinkProps = ListItemLinkProps;

/** O padrão: uma âncora de verdade (idem `ListItem`). */
function defaultRenderLink({ children, className, href }: ContextBarLinkProps) {
  return (
    <a className={className} href={href}>
      {children}
    </a>
  );
}

interface ContextBarBase {
  /** Já traduzido: para onde se volta ("Início", ou o título do livro). */
  backLabel: string;
  href: string;
  renderLink?: (props: ContextBarLinkProps) => ReactNode;
  className?: string;
}

/**
 * AS DUAS PINTURAS DA AÇÃO — medidas no canvas, e a primeira entrega desta
 * fatia entregava uma só.
 *
 * | artboard | ação | pintura |
 * | --- | --- | --- |
 * | `NovaAnotacao.dc.html:41`, `NovoGrifo.dc.html:41`, `NovaAnotacaoDesktop.dc.html:43` | "Criar anotação", "Registrar grifo" | `background:#143524` (`--accent`) — CHEIA |
 * | `DiaDesktop.dc.html:40` | "Li hoje" | `background:#faf3e4`, `border:1px solid #d6ae64`, `color:#785822` — CONTORNO DOURADO |
 *
 * ⚠️ A segunda existe por uma razão de produto, não de variedade: "Li hoje" é
 * o **já fiz**, não a ação principal da tela. Um botão cheio de verde ali diz
 * "faça isto agora", que é o contrário do §1 do
 * `docs/plano-clube-do-livro.md`.
 *
 * ⚠️ **E A TINTA NÃO É NOVA:** os três valores acima são exatamente
 * `--gold-soft` / `--gold-line` / `--gold-strong`, que é a variante `seal` do
 * `Button` (Tarefa 41a). O NOME é o mesmo de propósito — um terceiro nome para
 * a mesma tinta é o defeito que este repositório já pagou três vezes.
 */
export type ContextBarActionVariant = 'primary' | 'seal';

/** ⚠️ Mapa LITERAL (decisão C): `` `bg-${variant}` `` compila e pinta nada. */
const ACTION_CLASS: Record<ContextBarActionVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  // As MESMAS três classes de `button.tsx:67` (variante `seal`). O acusador de
  // que elas não saiam de sincronia é
  // `context-bar.test.tsx › speaks the SAME gold as the Button seal`, que
  // compara com o `Button` RENDERIZADO, não com uma cópia.
  seal: 'border border-gold-line bg-gold-soft text-gold-strong hover:border-gold',
};

/**
 * A DECISÃO H: a barra tem duas formas, e a diferença é a AÇÃO.
 *
 * A união discriminada é o que impede na origem a combinação que não existe —
 * um rótulo de ação sem o que fazer ao clicar, um `onAction` sem nome
 * acessível, ou uma pintura de ação numa barra que não tem ação. É o mesmo
 * molde do `href`/`onClick` do `ListItem` e do `collapsed`/`onRefine` do
 * `FilterBar`.
 */
type ContextBarAction =
  | { actionLabel?: undefined; onAction?: never; actionVariant?: never }
  | {
      actionLabel: string;
      onAction: () => void;
      actionVariant?: ContextBarActionVariant;
    };

export type ContextBarProps = ContextBarBase & ContextBarAction;

/**
 * A BARRA DE CONTEXTO — a única navegação de volta do app.
 *
 * Decisão fechada do MVP 3.5: não nasce menu, não nasce nav inferior. Toda
 * tela que não é a home tem esta faixa logo abaixo do cabeçalho, e nas telas
 * de formulário ela também abriga a ação primária.
 *
 * ============================================================================
 * AS TRÊS MEDIDAS DO CANVAS, E O QUE FOI FEITO COM A PRIMEIRA
 * ============================================================================
 *
 * | forma | artboard | altura | recuo |
 * | --- | --- | --- | --- |
 * | sem ação, celular | `Livro.dc.html:36` | **38px** | `0 20px` |
 * | com ação, celular | `NovaAnotacao.dc.html:36` | **48px** | `0 12px 0 20px` |
 * | desktop | `DiaDesktop.dc.html:35`, `LivroDesktop.dc.html:35`, `NovaAnotacaoDesktop.dc.html:37`, `NovoGrifoDesktop.dc.html:37` | **46px** | `0 40px` |
 *
 * ⚠️ **OS 38px DA PRIMEIRA FORMA NÃO FORAM ENTREGUES, E ISSO É A REGRA 7.** A
 * faixa inteira é um alvo de toque — o link ocupa a altura toda —, e 38px está
 * abaixo dos 44px da decisão F. A saída pedida é padrão vertical, não baixar o
 * piso: o `min-h-11` está no LINK, e a barra não declara altura própria
 * nenhuma; ela é o que o link faz dela. **Custo honesto: a faixa sem ação fica
 * 44px em vez de 38px.**
 *
 * A alternativa (38px de barra com o link transbordando 3px para cima e para
 * baixo) foi recusada: o alvo invadiria o cabeçalho e o conteúdo, criando dois
 * alvos sobrepostos — defeito pior que 6px de altura.
 *
 * As outras duas formas saem EXATAS: 48px (`min-h-12`) com ação no celular, e
 * **46px de altura fixa** (`min-[1120px]:h-[46px]`) com 40px de recuo no
 * desktop — nas duas formas, com ação e sem.
 *
 * ⚠️ **Os 46px chegaram na rodada de auditoria (2026-09-21).** A primeira
 * entrega media as três alturas e entregava duas: no desktop saía 44px (sem
 * ação) ou 48px (com ação), nunca 46. Medir e não usar é o mesmo defeito de
 * medir errado, com o agravante de a medição certa ficar escrita ao lado do
 * número errado.
 *
 * O corte de ≥1120px é o da decisão fechada do MVP 3.5, e é **media query e
 * só**: nenhuma ramificação por `userAgent`, nenhum `isMobile`.
 *
 * ⚠️ **UMA MEDIDA DO CANVAS QUE NÃO FOI ENTREGUE, e ela fica escrita:** o
 * chevron tem **15px** no desktop (`DiaDesktop.dc.html:37`) contra os 14px do
 * celular (`Livro.dc.html:37`). Entregue em `size-3.5` (14px) nas duas
 * larguras — um pixel não paga uma media query a mais numa classe que já tem
 * três. Mesma decisão, e mesmo registro, dos 18/19px do `PresenceMark`.
 */
export function ContextBar({
  actionLabel,
  actionVariant = 'primary',
  backLabel,
  className,
  href,
  onAction,
  renderLink = defaultRenderLink,
}: ContextBarProps) {
  const back = renderLink({
    className: cx(
      /*
        `min-h-11` é o piso de 44px (decisão F). `-mx-2 px-2` alarga o alvo
        para os lados sem deslocar o rótulo: o dedo acerta um pouco antes do
        chevron e um pouco depois da palavra.
      */
      'flex min-h-11 min-w-0 items-center gap-2 -mx-2 px-2 text-muted transition-colors hover:text-content',
      FOCUS_RING,
    ),
    href,
    children: (
      <>
        {/*
          `ChevronLeft` do `lucide-react` (regra 8): nenhum `<svg>` à mão em
          `packages/ui` — o acusador é `adr-0002-iconography.test.ts`, e a
          razão é que a varredura de termos do ADR 0002 pega PALAVRA, e um
          desenho não tem palavra nenhuma para ela achar. No canvas o chevron
          tem 14px (`Livro.dc.html:37`) e 15px no desktop
          (`DiaDesktop.dc.html:37`).
        */}
        <ChevronLeft aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate font-mono text-eyebrow uppercase tracking-[0.1em]">
          {backLabel}
        </span>
      </>
    ),
  });

  return (
    <div
      className={cx(
        // O filete hairline, nunca sombra: o desenho é caderno encadernado.
        'flex w-full items-center border-b border-line-soft bg-canvas',
        actionLabel === undefined
          ? // `Livro.dc.html:36`: `padding:0 20px`. Sem `min-h` próprio — quem
            // define a altura é o alvo de 44px do link (veja o docblock).
            'px-5'
          : // `NovaAnotacao.dc.html:36`: 48px, `padding:0 12px 0 20px`, e a
            // ação empurrada para a direita.
            'min-h-12 justify-between gap-3 pl-5 pr-3',
        /*
          O DESKTOP, e os quatro artboards de 1280px concordam nos dois
          números: `height:46px` e `padding:0 40px`
          (`DiaDesktop.dc.html:35`, `LivroDesktop.dc.html:35`,
          `NovaAnotacaoDesktop.dc.html:37`, `NovoGrifoDesktop.dc.html:37`).

          ⚠️ `h-` e não `min-h-`, e a diferença importa: com ação o celular
          pede 48px (`min-h-12`), e uma altura MÍNIMA de 46px no desktop NÃO
          desceria
          dos 48 — a barra ficaria 2px fora do canvas justamente na tela em que
          o botão aparece. Altura FIXA acima do corte é o que faz as duas
          formas terem os 46px medidos, e ela é segura porque o alvo de 44px do
          link cabe inteiro dentro dela.
        */
        'min-[1120px]:h-[46px] min-[1120px]:px-10',
        className,
      )}
    >
      {back}
      {actionLabel === undefined ? null : (
        <button
          className={cx(
            /*
              `NovaAnotacao.dc.html:41`: `height:34px`, `padding:0 16px`,
              `background:var(--accent)`, `color:var(--accent-fg)`,
              `border-radius:3px`, `'Geist Mono'` 10px `0.1em` maiúsculo.

              ⚠️ Os 34px viraram `min-h-11` (44px) pela regra 7 — e aqui isso
              custa zero ao desenho, porque a faixa com ação já tem 48px no
              canvas e o alvo cabe inteiro dentro dela.

              `rounded-callout` é o `--r-2` (3px), que é exatamente o raio que
              o canvas dá a este botão nas DUAS pinturas. Ele nasceu sem
              consumidor na Tarefa 41a, com prazo para a 47; este é o primeiro.
            */
            'inline-flex min-h-11 shrink-0 items-center justify-center rounded-callout px-4 font-mono text-eyebrow uppercase tracking-[0.1em] transition-colors',
            ACTION_CLASS[actionVariant],
            FOCUS_RING,
          )}
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
