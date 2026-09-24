import type { ReactNode } from 'react';

import { cx } from '../cx';

/**
 * AS CINCO CANETAS, POR CHAVE — nunca por hexadecimal (decisão B da Tarefa
 * 41b, e decisão fechada do MVP 3.5).
 *
 * ⚠️ Os cinco hexes de `HIGHLIGHT_COLORS` (`packages/shared/src/highlight-color.ts`)
 * são **dado persistido**: `Highlight.color` é coluna do banco, é filtro de
 * rota (`?color=%23facc15`) e é índice (`@@index([bookId, color])`). O canvas
 * define como o grifo é **pintado** — os tokens `--pen-a`…`--pen-r` —, jamais
 * o que é **guardado**.
 *
 * A tradução hex → caneta é da TELA (`pages/highlight-colors.tsx`, que já faz
 * hex → chave de i18n ao lado). Este componente não pode conhecer o dado: no
 * dia em que o dono trocar um dos cinco hexes, `packages/ui` não deve nem
 * ficar sabendo.
 *
 * A ordem é a da paleta no canvas (`Dia.dc.html:105-119`,
 * `NovoGrifo.dc.html:60-64`): amarelo, verde, laranja, azul, rosa.
 */
export const PEN_KEYS = ['a', 'v', 'l', 'z', 'r'] as const;

export type PenKey = (typeof PEN_KEYS)[number];

/**
 * ============================================================================
 * ⚠️ MAPA LITERAL. NUNCA `` `bg-pen-${key}` ``. (decisão C)
 * ============================================================================
 *
 * A interpolação compila em TypeScript, roda, e põe a classe certa no DOM —
 * todo teste de render fica verde. O que ela **não** faz é gerar CSS: o
 * Tailwind emite o CSS das classes que encontra **escritas** no código-fonte,
 * e uma classe montada em tempo de execução não está escrita em lugar nenhum.
 * O sintoma é um grifo sem cor nenhuma, na tela, em produção.
 *
 * É a lição que o `avatar-color.ts` carregava por escrito antes de morrer na
 * Tarefa 41a, e ela precisa estar aqui porque este é o mapa mais tentador do
 * pacote: cinco linhas que "só mudam uma letra".
 *
 * ⚠️ **SÃO DOIS ACUSADORES, e eles pegam coisas diferentes — leia os dois
 * antes de mexer aqui.**
 *
 * 1. `grifo-text.test.tsx › writes the pen→class map as LITERALS` lê ESTE
 *    arquivo e proíbe a interpolação. Ele é legítimo porque aqui o texto do
 *    fonte **é** a entrada do compilador — mas ele pega uma GRAFIA (`${`), e
 *    há outras (`concat`, `join`, um mapa vindo de outro módulo);
 * 2. `app/src/__tests__/ui-source-scan.test.ts › ships the CSS of every map
 *    assembled from a key` olha o CSS COMPILADO e exige `.bg-pen-a{` … e
 *    `.ring-pen-r{` no artefato. Ele pega **qualquer** grafia, porque não olha
 *    o fonte.
 *
 * ⚠️ E o segundo teve de nascer (auditoria da Tarefa 41b, 2026-09-21): o
 * `emits every class packages/ui uses` é **unidirecional** — ele prova que
 * toda classe escrita virou CSS, nunca que uma classe deixou de ser escrita.
 * Medido: com o mapa montado em runtime, os dez seletores somem do CSS
 * (32.891 B → 32.486 B) e aquele teste fica **10/10 verde**. Os dois
 * extratores dele casam aspas simples e duplas; um template literal fica entre
 * crases e não casa nenhum dos dois, então a lista de classes ENCOLHE e ele
 * não tem o que conferir.
 *
 * ⚠️ E AS DUAS CLASSES DE CADA LINHA SÃO A MESMA CANETA (decisão D). O
 * `bg-*` é o papel grifado e o `ring-*` é a auréola de 2px que alarga a marca
 * além da caixa do texto, como caneta de verdade (`Dia.dc.html:78`:
 * `background:var(--pen-a); box-shadow:0 0 0 2px var(--pen-a)`). Se as duas
 * divergirem, a marca ganha uma auréola de outra cor — e o acusador é
 * `uses the SAME pen for the background and for the halo`, que compara
 * igualdade, não presença.
 */
const PEN_CLASS: Record<PenKey, string> = {
  a: 'bg-pen-a ring-pen-a',
  v: 'bg-pen-v ring-pen-v',
  l: 'bg-pen-l ring-pen-l',
  z: 'bg-pen-z ring-pen-z',
  r: 'bg-pen-r ring-pen-r',
};

export interface GrifoTextProps {
  pen: PenKey;
  /** O trecho: conteúdo do usuário, que não se traduz. */
  children: ReactNode;
  className?: string;
}

/**
 * O TRECHO GRIFADO — a marca de caneta sobre o texto.
 *
 * A tinta é sempre `--text` (a cor normal do corpo), e isso é medido: sobre as
 * cinco canetas ela dá de 12,44:1 a 12,84:1 no tema claro e de 8,44:1 a
 * 10,81:1 no escuro (fórmula da WCAG 2.1 3.2.2). Nenhuma caneta precisa de
 * tinta própria — é por isso que este componente não pinta cor de texto
 * nenhuma e deixa o parágrafo em volta decidir.
 *
 * `<span>` e não `<mark>`: o canvas desenha um `<span>` (`Dia.dc.html:78`), e
 * `<mark>` traz da folha de estilo do navegador um fundo amarelo que brigaria
 * com a caneta escolhida — em todas as cinco menos numa.
 */
export function GrifoText({ children, className, pen }: GrifoTextProps) {
  return (
    <span
      className={cx(
        /*
          `ring-2` é `box-shadow: 0 0 0 2px <cor do anel>`, que é exatamente o
          que o canvas declara. Um anel sem número seria de 1px e a marca
          encostaria nas letras da linha de cima.

          `rounded-mark` é `--r-1` (2px); o canvas declara `border-radius:1px`.
          Divergência de UM pixel, registrada — o `theme.css` já a conhece
          ("o canvas usa `1px` no lugar que ele ocuparia"), e um sexto raio na
          escala fechada custaria mais que o pixel. Este é o primeiro
          consumidor de produção do `rounded-mark` desde a Tarefa 13.
        */
        'rounded-mark ring-2',
        PEN_CLASS[pen],
        className,
      )}
    >
      {children}
    </span>
  );
}
