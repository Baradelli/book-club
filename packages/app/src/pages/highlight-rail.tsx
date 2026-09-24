import { Eyebrow, MarginRail, PersonAvatar } from '@clube/ui';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';

import type { ActiveClubMe } from '../club/active-club';
import { excerptOf, QUOTE_EXCERPT_LENGTH } from './acervo-entries';
import {
  ACERVO_CARD_CLASS,
  ACERVO_META_CLASS,
  authorLabel,
} from './acervo-rows';
import {
  COLOR_LABEL_KEYS,
  ColorSwatch,
  type HighlightColor,
} from './highlight-colors';
import { type Draft, isValidPage } from './highlight-fields';

export interface HighlightRailProps {
  t: TFunction;
  /** Quem escreve — é o avatar da linha que vai para o acervo. */
  me: ActiveClubMe | null;
  /** Os MESMOS valores que os campos mostram. Nunca uma segunda fonte. */
  draft: Draft;
  color: HighlightColor | null;
}

/**
 * ============================================================================
 * A MARGEM DO GRIFO — "Como vai aparecer no acervo"
 * ============================================================================
 *
 * `NovoGrifoDesktop.dc.html:104-120`: coluna de 320px com filete à esquerda, o
 * cabeçalho da prévia, a linha do acervo e o parágrafo sobre a caneta. O
 * aparato de coluna + margem é o das fatias 42–46 — **nenhum mecanismo novo**
 * (decisão E da Tarefa 47b).
 *
 * ⚠️ **ARQUIVO PRÓPRIO, E O MOTIVO É O TETO DE 400.** O `highlight-form.tsx`
 * entrou nesta fatia com **427** linhas canônicas (27 acima do teto) e o
 * `highlight-fields.tsx` com **309**. Pendurar a margem em qualquer um dos
 * dois empurraria um deles para cima — e "um teto que vale para um arquivo só
 * é um teto que anda de lado" é literalmente a lição que a Tarefa 46 pagou.
 * Os números de saída estão na entrada 47b do `docs/BACKLOG.md`.
 *
 * ⚠️⚠️ **O QUE NÃO ENTROU, E POR MEDIÇÃO: "Seus grifos recentes"**
 * (`NovoGrifoDesktop.dc.html:122-132`). Aquele bloco lista grifos ANTERIORES
 * de quem escreve, e este formulário não tem esse dado: ele não carrega o
 * acervo, e a única rota que responderia é `GET /books/:bookId/highlights`.
 * O cabeçalho do MVP 3.5 põe **rota e schema fora de escopo para a seção
 * inteira**, com instrução literal de parar e perguntar. Improvisar o bloco
 * com o que está na tela — o grifo que ainda não foi registrado — seria pior
 * que a ausência: a margem passaria a chamar de "recente" aquilo que a prévia
 * logo acima já mostra como o que está sendo escrito agora. **Ausente, e
 * declarado.**
 *
 * ⚠️ **A PRÉVIA MOSTRA O QUE O FORMULÁRIO TEM COMO TEXTO.** O comentário do
 * grifo fica de fora pela mesma razão que o corpo da anotação avulsa fica: o
 * resumo que o acervo mostra é DERIVADO no backend (ADR 0001), e recalculá-lo
 * aqui criaria um segundo dono da mesma derivação. Trecho, cor, página e
 * referência são texto de campo — esses a prévia espelha tecla a tecla.
 *
 * ⚠️ **ELA SOME NO CELULAR, e o par está guardado dos dois lados** — o canvas
 * de celular (`NovoGrifo.dc.html`) não desenha prévia nenhuma.
 *
 * ⚠️⚠️ **O QUE ESTA PRÉVIA E A LINHA DO ACERVO TÊM DE DIFERENTE, contado
 * elemento a elemento na rodada de correção.** A entrega escreveu que os dois
 * eram *"o mesmo desenho, na mesma ordem"*, e isso é falso: o card do acervo
 * (`Acervo.dc.html:87-96`) tem **sete** elementos e o da prévia do canvas
 * (`NovoGrifoDesktop:107-115`) tem **seis** — falta nele o NOME de quem
 * escreveu (`:93`, Instrument Serif itálico 15px). E os números diferem:
 * recuo **14 × 16**, espaço **9 × 10**, trecho **16 × 15**. A ordem que a
 * entrega citou era a do artboard do formulário, não a do acervo.
 *
 * ⚠️ **A DECISÃO CONTINUA A MESMA, e agora pelo motivo certo:** o que se
 * segue é o ACERVO, não o artboard da prévia — daí esta margem mostrar o
 * autor (`authorLabel`), que é o sétimo elemento e o que o canvas da prévia
 * esqueceu. Nesta propriedade a prévia está **um passo à frente** do
 * artboard, de propósito, porque é o acervo que ela promete.
 *
 * ⚠️ **E QUEM ASSINA TEM ACUSADOR PRÓPRIO desde a rodada de correção.** O
 * avatar mostrava a inicial de `me` e nada dizia de QUEM ele era: um mutante
 * de uma linha o trocava por outra pessoa — **com o rótulo ao lado ainda
 * dizendo "Você"** — e deixava 999 testes verdes. Acusador:
 * `highlight-form.test.tsx › ⚠️ signs the preview with ME`.
 */
export function HighlightRail({
  color,
  draft,
  me,
  t,
}: HighlightRailProps): ReactNode {
  const page = draft.page.trim();
  const reference = draft.reference.trim();

  return (
    <MarginRail className="hidden gap-4 pt-4 min-[1120px]:flex">
      <Eyebrow>{t('pages.highlightForm.preview.heading')}</Eyebrow>
      <div className={ACERVO_CARD_CLASS} data-testid="highlight-preview">
        <div className={ACERVO_META_CLASS}>
          {/* As MESMAS palavras do acervo — a prévia promete o acervo. */}
          <span className="font-medium">
            {t('pages.acervo.kind.highlight')}
          </span>
          {color === null ? null : (
            <>
              <ColorSwatch color={color} />
              <span>{t(COLOR_LABEL_KEYS[color])}</span>
            </>
          )}
          {isValidPage(page) ? (
            <span>{t('pages.acervo.item.page', { number: Number(page) })}</span>
          ) : null}
          {reference === '' ? null : <span>{reference}</span>}
          <PersonAvatar id={me?.id ?? ''} name={me?.name ?? null} size="sm" />
          <span>{authorLabel(t, true, me?.name ?? null)}</span>
        </div>
        {/* A MESMA truncagem do acervo, do mesmo dono. */}
        <p className="text-content">
          {excerptOf(draft.quote.trim(), QUOTE_EXCERPT_LENGTH)}
        </p>
      </div>
      <p className="text-sm text-muted">
        {t('pages.highlightForm.preview.about')}
      </p>
    </MarginRail>
  );
}
