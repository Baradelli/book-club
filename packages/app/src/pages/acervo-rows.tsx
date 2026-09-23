import type { HighlightResponse } from '@clube/shared';
import { Button, PersonAvatar } from '@clube/ui';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import {
  COMMENT_EXCERPT_LENGTH,
  excerptOf,
  QUOTE_EXCERPT_LENGTH,
} from './acervo-entries';
import { TEXT_LINK_CLASS } from './chrome';
import { COLOR_LABEL_KEYS, ColorSwatch } from './highlight-colors';
import { highlightPath } from './paths';

/**
 * REGRA 3 — AUTORIA EM TEXTO, e **uma** decisão para as duas metades.
 *
 * "Você" ganha do nome quando a linha é minha: eu não me leio pelo nome numa
 * lista em que também estão os outros. E o genérico entra quando a tela não
 * conhece as pessoas (o `/members` que falhou).
 *
 * ⚠️ **ELA VIROU FUNÇÃO NA TAREFA 38g, e o motivo é o mesmo da decisão G da
 * 27:** esta expressão estava escrita DUAS vezes neste arquivo — uma na linha
 * de anotação, outra na de grifo —, que é exatamente a forma pela qual as
 * duas metades voltaram a discordar sobre o nome da mesma pessoa na Tarefa
 * 27. O `nameOfWriter` já era um dono só; o "Você × o nome" não era.
 */
/**
 * ⚠️ **ELA SAIU DO `acervo.tsx` NA TAREFA 46, E O `t` PASSOU A SER PROP.**
 *
 * O motivo é tamanho medido, não gosto: a fatia 46 cresceu a tela em 20
 * linhas canônicas e a regra dela proibia que a tela subisse uma. O corte é
 * o que o docblock do `acervo.tsx` já nomeava como "fatia própria, com
 * desenho de props" — o card de grifo — e esta função veio junto porque as
 * DUAS metades da lista a chamam (é o que ela existe para garantir).
 */
export function authorLabel(
  t: TFunction,
  mine: boolean,
  writerName: string | null,
): string {
  return mine
    ? t('pages.acervo.item.author.you')
    : (writerName ?? t('pages.acervo.item.author.other'));
}

export interface HighlightRowProps {
  t: TFunction;
  highlight: HighlightResponse;
  /** Já decidido pela tela: `highlight.userId === myId`. */
  mine: boolean;
  /** Já resolvido pelo `nameOfWriter` — um dono só para as duas metades. */
  writerName: string | null;
  /** O livro da ROTA, que é para onde o link de correção aponta. */
  bookId: string;
  onArchive: () => void;
}

/**
 * A LINHA DE GRIFO — regras 2, 3 e 4 da Tarefa 28.
 *
 * ⚠️ **ELA SAIU DO `acervo.tsx` NA TAREFA 46, e a saída estava PREVISTA por
 * escrito lá desde a 38h:** *"a costura que fica registrada e não cortada: o
 * card de grifo (63 linhas) tem quatro dependências da tela — `t`, o nome de
 * quem escreveu, o `bookId` e o `setConfirming`. Ele é fatia própria, com
 * desenho de props"*. As quatro viraram as quatro props abaixo, sem uma
 * quinta.
 *
 * ⚠️ **O QUE O CORTE PAGA, REMEDIDO NA RODADA DE CORREÇÃO — e os dois números
 * anteriores estavam errados (achado B2).** A entrega dizia "custa +20 à tela"
 * e "este corte devolve 52", e a conta não fechava contra o único número duro
 * que existe: `511 + 20 − 52 = 479`, e o arquivo tem **478**. Num docblock cujo
 * assunto é **medir em vez de estimar**, um erro de 1 é o assunto.
 *
 * A conta refeita **por função**, que é a única que não mistura as duas
 * mudanças do mesmo commit:
 *
 * ```
 * saíram para cá   authorLabel   5  +  highlightRow  59   =  64
 * voltaram         o invólucro  16  +  o import       1   = −17
 * liberaram        COMMENT_EXCERPT_LENGTH, QUOTE_…    2   = + 2
 * o corte devolve                                         =  49
 * a fatia por si (511 − 49 + x = 478)                     = +16
 * ```
 *
 * **49 e +16**, não 52 e +20 — e agora fecha: `511 + 16 − 49 = 478`.
 *
 * ⚠️ E a lição da 44b fica escrita junto: extrair de um arquivo **não encolhe
 * o outro**, e o total das duas casas é maior do que era.
 *
 * ⚠️ **A `key` FICA NO CHAMADOR.** Ela é do React, não do card: passá-la como
 * prop faria o `<li>` daqui receber uma `key` que o React nunca lê.
 */
export function HighlightRow({
  bookId,
  highlight,
  mine,
  onArchive,
  t,
  writerName,
}: HighlightRowProps): ReactNode {
  const comment = excerptOf(highlight.commentText, COMMENT_EXCERPT_LENGTH);

  return (
    <li className="flex">
      <div className="flex w-full flex-col gap-2 rounded-control border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {/*
            REGRA 2 — O TIPO EM TEXTO, EM TODA LINHA. Numa lista unificada, a
            cor não basta: é o ADR 0004 exigindo que o leitor não precise
            adivinhar que aquilo é grifo e não anotação.
          */}
          <span className="font-medium">
            {t('pages.acervo.kind.highlight')}
          </span>
          {/*
            A COR TEM NOME, e o nome é texto de verdade. A amostra é
            `aria-hidden` (o nome está ao lado); quem não distingue as cinco
            cores depende do nome, e cor como único portador de informação é
            o defeito que ninguém vê olhando.
          */}
          <ColorSwatch color={highlight.color} />
          <span>{t(COLOR_LABEL_KEYS[highlight.color])}</span>
          {/*
            SEM PÁGINA É SILÊNCIO. Nem "página null", nem o rótulo órfão: a
            ausência não se anuncia (é o anti-culpa aplicado ao espaço
            vazio).
          */}
          {highlight.page !== null ? (
            <span>
              {t('pages.acervo.item.page', { number: highlight.page })}
            </span>
          ) : null}
          {highlight.reference !== null ? (
            <span>{highlight.reference}</span>
          ) : null}
          {/* REGRA 3 — o MESMO `nameOfWriter` da anotação (decisão G). */}
          <PersonAvatar id={highlight.userId} name={writerName} size="sm" />
          <span>{authorLabel(t, mine, writerName)}</span>
        </div>

        <p className="text-content">
          {excerptOf(highlight.quote, QUOTE_EXCERPT_LENGTH)}
        </p>

        {/*
          SEM COMENTÁRIO, NENHUMA ÁREA DE COMENTÁRIO.

          ⚠️ A guarda é a PRÉVIA VAZIA, e não `commentDoc === null`, e a razão
          é que ela fecha os dois casos com um dono só: `commentText` é
          DERIVADO do `commentDoc` no backend (ADR 0001), então `null` no
          documento implica `''` no texto — e o documento que EXISTE e não diz
          nada (o parágrafo em branco que o editor emite) também cai aqui.
        */}
        {comment === '' ? null : (
          <p className="text-sm text-muted">{comment}</p>
        )}

        {/*
          REGRA 4 — SÓ O MEU GRIFO TEM AS AÇÕES.

          O alheio aparece INTEIRO e sem affordance nenhuma: nem link de
          correção, nem arquivar. Isso é AUTORIA, não privacidade — o trecho
          está aqui porque dentro do clube não existe conteúdo privado
          (ADR 0002), e o filtro nunca é rotulado como permissão.

          ⚠️ **E ELE NÃO TEM NEM LINK, ao contrário da anotação alheia** — a
          assimetria é MEDIDA, não gosto: a anotação de outra pessoa abre em
          LEITURA (o `free-note.tsx` decide leitura × correção pela autoria),
          e para grifo **não existe tela de leitura** — o `highlight-form.tsx`
          recusa o grifo alheio com `pages.highlightForm.notYours`. Um link
          levaria a um beco.
        */}
        {mine ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className={TEXT_LINK_CLASS}
              to={highlightPath(bookId, highlight.id)}
            >
              {t('pages.acervo.item.edit')}
            </Link>
            <Button onClick={onArchive} variant="ghost">
              {t('pages.acervo.item.archive')}
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
