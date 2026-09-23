import type { ReactNode } from 'react';

import { cx } from '../cx';

/**
 * As duas tintas do rótulo de seção (decisão I da Tarefa 41b).
 *
 * `muted` é o rótulo que só nomeia uma seção ("O que o clube está lendo",
 * "Plano de leitura", "Sua anotação"); `gold` é o que é de HOJE ou o que está
 * sendo CRIADO agora ("A leitura de hoje", "Nova anotação avulsa", "Trecho
 * grifado"). Medido no canvas, artboard a artboard, na tabela do teste.
 */
export type EyebrowTone = 'muted' | 'gold';

/**
 * ⚠️ MAPA LITERAL, nunca montado em runtime (decisão C).
 *
 * `` `text-${tone}` `` compila em TypeScript e pinta NADA: o Tailwind emite o
 * CSS das classes que encontra escritas no código-fonte, e uma classe montada
 * em tempo de execução não está escrita em lugar nenhum. É a lição que o
 * `avatar-color.ts` carregava por escrito antes de morrer na Tarefa 41a.
 */
const TONE_CLASS: Record<EyebrowTone, string> = {
  /*
    ⚠️ `text-gold-strong` E NÃO `text-gold`, contra o canvas — e a razão é uma
    conta, não gosto. `--gold` no tema claro (`#946d2c`) dá **4,16:1** contra
    `--bg`, **4,31** contra `--surface` e **3,97** contra `--surface-2`; o
    rótulo tem 10px, então o piso é 4,5:1 e ele reprova nas três. O mesmo
    número já está registrado no `theme.css`, no motivo de o anel de foco ter
    deixado de ser `--gold`.

    `--gold-strong` (`#785822`) passa nas três (5,79 / 6,00 / 5,53), e não é
    invenção para tapar o buraco: é a tinta que o PRÓPRIO canvas usa quando o
    dourado precisa carregar texto — o número do selo de sequência
    (`Inicio.dc.html:99`) e a data de hoje no sumário (`Livro.dc.html:146`).

    O acusador é `eyebrow.test.tsx › refuses --gold for the gold tone`.
  */
  gold: 'text-gold-strong',
  muted: 'text-muted',
};

export interface EyebrowProps {
  /** Já traduzido pela tela (decisão A: `packages/ui` não conhece catálogo). */
  children: ReactNode;
  tone?: EyebrowTone;
  className?: string;
}

/**
 * O RÓTULO DE SEÇÃO em monoespaçada maiúscula — o que o §A.6 do
 * `docs/new-ui.md` põe no lugar de todo `h2`/`h3`.
 *
 * ⚠️ Ele é um `<span>`, e isso é decisão: um rótulo que se ANUNCIA como título
 * sem estar na árvore de títulos da página (nível errado, ou fora de ordem) é
 * pior para quem ouve do que nenhum título. Quando uma tela precisar de um
 * título de verdade, ela escreve um `<h1>`/`<h2>` de verdade — este componente
 * é a tipografia do rótulo, não a semântica dele.
 *
 * ⚠️ E ele NÃO carrega texto: toda palavra entra por `children`, já traduzida
 * (decisão A da Tarefa 41b, decisão J da 41a). O acusador do pacote é
 * `src/__tests__/no-hardcoded-ui-text.test.ts`, cujo teto só pode cair.
 */
export function Eyebrow({ children, className, tone = 'muted' }: EyebrowProps) {
  return (
    <span
      className={cx(
        /*
          Medido no canvas, e os três artboards concordam valor a valor:
          `Inicio.dc.html:40`, `Livro.dc.html:67`, `Dia.dc.html:44` —
          `font-family:'Geist Mono'`, `font-size:10px`,
          `letter-spacing:0.12em`, `text-transform:uppercase`.

          `text-eyebrow` é `--size-eyebrow` (10px), e o token se chama assim
          por causa DESTE rótulo: o `theme.css` o descreve como "mono: o RÓTULO
          DE SEÇÃO, que substitui todo h2/h3".
        */
        'font-mono text-eyebrow uppercase tracking-[0.12em]',
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
