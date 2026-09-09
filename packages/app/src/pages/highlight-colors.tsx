import { HIGHLIGHT_COLORS, type HighlightColor } from '@clube/shared';
import { cx } from '@clube/ui';
import type { CSSProperties } from 'react';

import type { MessageKey } from './form-errors';

/**
 * A PALETA DO GRIFO NA TELA — o nome de cada cor e a amostra.
 *
 * ⚠️ **ELE TEM MÓDULO PRÓPRIO PELA LIÇÃO MEDIDA DA TAREFA 17** (o
 * `router-link.tsx`): as DUAS telas de grifo precisam da mesma paleta — a
 * coleção (os chips do filtro e a amostra de cada linha) e o formulário (os
 * cinco chips de escolha). Exportá-la de uma das telas faria o acusador de uma
 * viver na suíte da OUTRA, e a próxima fatia moveria isso sem reparar. Um
 * módulo neutro que as duas importam não tem lado — e, como o `paths.ts`, ele
 * não importa nenhuma tela, então não há ciclo possível.
 *
 * ⚠️ **A LISTA DE CORES NÃO É COPIADA**: ela vem de `HIGHLIGHT_COLORS`, de
 * `@clube/shared`, que é a MESMA constante do domínio do backend e do `z.enum`
 * da borda (lição nº 3 do MVP 1, e o docblock de `shared/src/highlight-color.ts`
 * já conta os três chamadores — esta tela é o terceiro).
 *
 * ⚠️ **E A COR NUNCA É O ÚNICO PORTADOR DE INFORMAÇÃO** (regra 4 da Tarefa
 * 25). O `Record<HighlightColor, MessageKey>` abaixo é o que amarra as duas
 * pontas **no compilador**: uma cor nova na paleta de `shared` deixa o mapa
 * incompleto e reprova no `tsc` — em vez de aparecer na tela como uma bolinha
 * sem nome, que é justamente o defeito que ninguém vê olhando.
 */

/**
 * hex → chave de catálogo do NOME da cor.
 *
 * As chaves são semânticas em inglês (`CLAUDE.md`) e o valor traduzido é o nome
 * em português/inglês. O hex é a identidade da cor (é o que o banco guarda, e o
 * `=` do Postgres é byte-sensível); o nome é o que a pessoa lê e o leitor de
 * tela fala.
 */
export const COLOR_LABEL_KEYS: Readonly<Record<HighlightColor, MessageKey>> = {
  '#facc15': 'pages.highlights.colors.yellow',
  '#22c55e': 'pages.highlights.colors.green',
  '#f97316': 'pages.highlights.colors.orange',
  '#3b82f6': 'pages.highlights.colors.blue',
  '#ec4899': 'pages.highlights.colors.pink',
};

/**
 * A ordem em que as duas telas desenham a paleta: a de `@clube/shared`
 * (amarelo, verde, laranja, azul, rosa), que é a mesma da barra do editor.
 * Reexportada para nenhuma tela ter de importar de dois lugares.
 */
export { HIGHLIGHT_COLORS };
export type { HighlightColor };

/**
 * A cor dinâmica da amostra: a MESMA exceção ao "sem CSS inline" que o
 * `RichEditor` documenta (`CLAUDE.md` proíbe CSS inline nas telas; o §6 do
 * `docs/EDITOR.md` abre esta exceção).
 *
 * O valor entra por uma variável CSS e a REGRA fica na classe
 * (`[background-color:var(--swatch)]`), que é o padrão do projeto para valor
 * que só o runtime conhece — o Tailwind compila o que existe literalmente no
 * código-fonte, então uma classe de cor montada em runtime não geraria CSS
 * nenhum, e uma classe de cor ARBITRÁRIA escrita à mão (a forma com colchetes
 * e um hex dentro) seria acusada, com razão, pela varredura de cor do
 * `anti-guilt-dom.ts` — que proíbe essa família inteira.
 *
 * ⚠️ **E ESTA PROSA NÃO ESCREVE NENHUMA CLASSE DE COR ARBITRÁRIA, de
 * propósito — o docblock anterior escreveu duas e as duas EMBARCARAM.**
 *
 * O Tailwind extrai nome de classe **de comentário**, e este arquivo é código
 * de produção (não `__tests__`, que o `styles.css` exclui). A versão anterior
 * citava o amarelo da paleta na forma de utilitário arbitrário, para dizer que
 * ele seria acusado — e a menção compilou a regra de verdade no CSS que o
 * navegador baixa, onde a varredura de DOM nunca olha porque nenhum elemento
 * usa a classe. Ela citava também a sonda de altura da Tarefa 13, e essa
 * embarcou junto.
 *
 * Quem pegou foi a guarda nova de `src/__tests__/ui-source-scan.test.ts`
 * (`ships no ARBITRARY COLOUR class at all`), **minutos depois de ser
 * escrita** — e é a melhor prova de que ela vale: a regra sobre o CSS emitido
 * pega a menção em comentário, que nenhuma varredura de DOM ou de fonte pega.
 *
 * A regra para quem escrever a próxima: descreva a FORMA do utilitário em
 * palavras, nunca um exemplo que o extrator saiba ler.
 */
type SwatchStyle = CSSProperties & Record<'--swatch', string>;

function swatchStyle(color: HighlightColor): SwatchStyle {
  return { '--swatch': color };
}

export interface ColorSwatchProps {
  color: HighlightColor;
  className?: string;
}

/**
 * A bolinha da cor.
 *
 * `aria-hidden` de propósito: o NOME da cor está escrito ao lado, em texto, e
 * um `aria-label` igual faria o leitor de tela dizer a cor duas vezes — o mesmo
 * cuidado do `PersonAvatar` sem `label` nas telas da Tarefa 18. Quem garante
 * que o nome está lá é a varredura das duas suítes de tela.
 *
 * A borda existe porque o amarelo da paleta sobre a superfície clara quase não
 * se vê sem contorno.
 */
export function ColorSwatch({ className, color }: ColorSwatchProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'size-4 shrink-0 rounded-full border border-line-strong',
        '[background-color:var(--swatch)]',
        className,
      )}
      style={swatchStyle(color)}
    />
  );
}
