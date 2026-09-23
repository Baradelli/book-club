import { cx, GrifoText } from '@clube/ui';
import { useTranslation } from 'react-i18next';

import {
  COLOR_PEN_KEYS,
  type HighlightColor,
  PEN_DOT_CLASS,
} from './highlight-colors';

/**
 * ⚠️ **UM GRIFO NA MARGEM — a bolinha da caneta, a linha de mono e o trecho.**
 *
 * ⚠️ **ELE TEM MÓDULO PRÓPRIO PELA LIÇÃO MEDIDA DO §7.1 DO
 * `docs/CONVENCOES-CODIGO.md` ("extrair, não cobrir duas vezes").** Duas telas
 * desenham exatamente este bloco:
 *
 * - `day-note.tsx`, no "Grifos deste dia" da margem (Tarefa 43);
 * - `book.tsx`, no "Último grifo" da margem (Tarefa 44b).
 *
 * As duas nasceram do MESMO desenho do canvas (`DiaDesktop.dc.html:115-121` e
 * `LivroDesktop.dc.html:213-217`), e a segunda seria uma cópia byte a byte da
 * primeira. É o padrão que o `club-names.ts` e o `sql-equality.ts` já pagaram:
 * duas cópias divergem na primeira correção, e a divergência aparece como um
 * grifo pintado de um jeito numa tela e de outro na tela ao lado.
 *
 * ⚠️ **Módulo NEUTRO, e não exportado de uma das telas** — é a lição do
 * `router-link.tsx` (Tarefa 17) e do `highlight-colors.tsx`: exportá-lo de
 * `day-note.tsx` faria o acusador do `book.tsx` viver na suíte da outra tela, e
 * a próxima fatia moveria isso sem reparar. Ele não importa tela nenhuma, então
 * não há ciclo possível.
 *
 * ⚠️⚠️ **A COR É A DA CANETA DAQUELE GRIFO, NUNCA UMA COR FIXA — e é a
 * armadilha mais fácil desta fatia.** O canvas desenha o bloco em amarelo
 * (`#c89a44` é `--pen-a-dot` e `#f0e2b4` é `--pen-a`, `theme.css:231-232`)
 * porque o grifo da maquete é amarelo; um grifo vermelho pinta o bloco de
 * vermelho. Quem traduz hex do banco para caneta do tema é o
 * `COLOR_PEN_KEYS`, e ele está amarrado no compilador.
 */
export interface MarginHighlightProps {
  /** O hex gravado no banco — um dos cinco de `HIGHLIGHT_COLORS`. */
  color: HighlightColor;
  /** `null` é caso legítimo: dá para grifar sem anotar a página. */
  page: number | null;
  /** O trecho: conteúdo do clube, que não se traduz. */
  quote: string;
  /**
   * O nome JÁ RESOLVIDO pelo `nameOfWriter` da tela; `null` quando ela não
   * conhece a pessoa (o `GET /clubs/:clubId/members` que falhou, ou alguém
   * fora da lista). O fallback é a frase genérica, e ele é o estado real —
   * o `userId` cru viraria uma inicial que tem cara de inicial e não é de
   * ninguém (medido na Tarefa 17).
   */
  authorName: string | null;
}

export function MarginHighlight({
  authorName,
  color,
  page,
  quote,
}: MarginHighlightProps) {
  const { t } = useTranslation();
  const who = authorName ?? t('pages.acervo.item.author.other');

  return (
    <div className="flex flex-col gap-[7px]">
      <div className="flex items-center gap-2">
        {/*
          A bolinha de 9px do canvas. `aria-hidden` porque a cor **nunca** é o
          único portador de informação (ADR 0002, regra 4 da Tarefa 25): o que
          a linha diz está escrito ao lado, e anunciá-la seria a lição nº 16 do
          MVP 2 — duas coisas falando a mesma frase.
        */}
        <span
          aria-hidden="true"
          className={cx(
            'size-[9px] shrink-0 rounded-full',
            PEN_DOT_CLASS[COLOR_PEN_KEYS[color]],
          )}
        />
        <span className="font-mono text-micro uppercase tracking-[0.1em] text-muted">
          {page === null
            ? who
            : `${t('pages.acervo.item.page', { number: page })} · ${who}`}
        </span>
      </div>
      {/*
        ⚠️ **DOIS ARREDONDAMENTOS DECLARADOS**, os dois contra a escala fechada
        de sete degraus da Tarefa 39:

        - o trecho grifado tem **14,5px** no canvas (`DiaDesktop.dc.html:120`,
          `LivroDesktop.dc.html:217`) e sai em `text-ui` (14px);
        - o rótulo em mono tem **9px** (`:118`, `:215`) e sai em `text-micro`
          (9,5px).

        Meio pixel e meio pixel não pagam dois degraus novos — e cada degrau
        novo entra também na lista fechada de isenções ao `light-dark()`. É a
        mesma conta, e o mesmo registro, dos quatro arredondamentos que a
        Tarefa 41a deixou abertos.
      */}
      <p className="font-reading text-ui leading-[1.6]">
        <GrifoText pen={COLOR_PEN_KEYS[color]}>{quote}</GrifoText>
      </p>
    </div>
  );
}
