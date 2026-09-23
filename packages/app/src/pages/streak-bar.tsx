import type { ClubStreaksResponse } from '@clube/shared';
import { StreakSeal } from '@clube/ui';
import { useTranslation } from 'react-i18next';

import type { ActiveClubMe } from '../club/active-club';
import { nameOfWriter } from './club-names';

export interface StreakBarProps {
  streaks: ClubStreaksResponse;
  /** Quem sou eu — a minha linha fala em primeira pessoa. */
  me: ActiveClubMe | null;
  /** `userId` → nome, como o resto das telas de clube resolve pessoa. */
  names: Map<string, string | null>;
  /**
   * ⚠️ **Já li hoje?** É isto que decide se o aviso de perda aparece — e ele só
   * aparece para quem **tem** corrente e ainda não leu. Para quem está em zero
   * não há o que perder, e mostrá-lo ali seria cobrar quem ainda não começou.
   */
  readToday: boolean;
}

/**
 * A CORRENTE DE LEITURA DO CLUBE — o "foguinho" (ADR 0010).
 *
 * ⚠️ **ESTE COMPONENTE CONTRARIA O DESENHO DO FEED DE PROPÓSITO, e o ADR
 * registra por quê.** O feed da Tarefa 35 é uma **frase** por linha,
 * deliberadamente sem coluna de pessoa e sem número — porque uma coluna de
 * pessoa convida o olho a varrê-la e contar quem fez mais. A corrente é
 * exatamente essa coluna, com o número dentro. Foi escolha do dono, feita
 * depois de a objeção ser levantada e medida.
 *
 * ⚠️ **PURAMENTE APRESENTAÇÃO.** Quem busca é o `activity-feed.tsx`, que já
 * carrega `members` para nomear as linhas do feed — um segundo componente
 * buscando os mesmos membros na mesma tela seria duas requisições para o mesmo
 * dado, e é por isso que este não busca nada.
 *
 * ⚠️ ~~**O NÚMERO É `aria-hidden` E O NOME ACESSÍVEL DIZ A FRASE INTEIRA.**~~
 * **CAIU NA TAREFA 45, e a troca é o oposto de um afrouxamento.** O desenho
 * antigo era um `<svg>` mudo, um `<span aria-hidden>` e um `aria-label` no
 * `<li>` repetindo tudo — a informação existia DUAS vezes, e uma delas era
 * invisível para qualquer varredura de texto. Hoje o `StreakSeal` desenha o
 * número e o rótulo em **texto de verdade**. O glifo continua `aria-hidden`
 * (é o componente quem o esconde), porque o texto ao lado já diz tudo — a
 * lição nº 16 do MVP 2.
 *
 * ⚠️⚠️ **MAS A FRASE NÃO ERA LIDA INTEIRA, e este parágrafo dizia que era —
 * corrigido na auditoria da fatia.** Medido no DOM entregue: os dois `<span>`
 * do selo eram irmãos **sem nó de texto entre eles**, então o `textContent`
 * era `12dias seguidos · Você`, colado — e os próprios acusadores pinavam
 * exatamente essa forma colada. O `gap-1.75` que dá o ar é CSS: ele resolve o
 * VISUAL e não chega à árvore de acessibilidade.
 *
 * ⚠️ **E o conserto NÃO é um `aria-label`.** Um `aria-label` reporia a
 * informação duas vezes no DOM, que é literalmente o defeito que o parágrafo
 * acima celebra ter removido — e a segunda cópia voltaria a ser invisível para
 * a varredura anti-culpa, que lê texto. O que faltava era **um espaço**: o
 * `StreakSeal` passou a emitir um nó de texto de verdade entre o número e o
 * rótulo. Num contêiner `flex` o item anônimo só de espaço **não é
 * desenhado**, então a tela não mudou um pixel e a frase passou a ser a frase.
 *
 * ============================================================================
 * ⚠️⚠️ O NÚMERO SAI DA FRASE, E É O CANVAS QUE O TIRA DE LÁ
 * ============================================================================
 *
 * `InicioDesktop.dc.html:110` desenha **"11"** em mono dourada e `:111` desenha
 * **"dias seguidos · Você"** ao lado — dois elementos, e é assim que o
 * `StreakSeal` é feito (`count` de um lado, `label` do outro). O catálogo, esse,
 * tem **uma** frase com o número dentro: `'{{count}} dias seguidos'`.
 *
 * ⚠️ **QUEM COMPÕE OS DOIS É O `replace` DO i18next, e NENHUMA CHAVE NASCE**
 * (decisão E da Tarefa 45). O `count` continua escolhendo o plural — "1 dia
 * seguido" × "12 dias seguidos", que é regra de catálogo e `packages/ui` não
 * conhece catálogo —, e o `replace.count` apaga o buraco `{{count}}` da frase
 * interpolada. O número volta, em mono, pelo componente.
 *
 * ⚠️ **E A COMPOSIÇÃO TEM ACUSADOR:** `home.test.tsx › ⚠️ desenha a corrente
 * com o StreakSeal, e o número reconstrói a frase do catálogo` exige que
 * `número + rótulo` volte a ser a frase do catálogo, caractere por caractere.
 * No dia em que o par de plural deixar de começar pelo `{{count}}`, a tela não
 * passa a escrever meia frase em silêncio — o teste fica vermelho.
 */
export function StreakBar({ me, names, readToday, streaks }: StreakBarProps) {
  const { t } = useTranslation();

  if (streaks.length === 0) return null;

  const mine =
    me === null ? undefined : streaks.find((s) => s.userId === me.id);
  const atRisk = mine !== undefined && mine.streak > 0 && !readToday;

  return (
    <div className="flex flex-col gap-2">
      {/*
        ⚠️ **LINHA NO CELULAR, COLUNA NO DESKTOP** — e os dois números são do
        canvas: `Inicio.dc.html:96` é `display:flex; gap:8px` (os selos lado a
        lado numa tela de 390px) e `InicioDesktop.dc.html:107` é
        `flex-direction:column; gap:8px` (a margem de 320px empilha). Media
        query e só: nenhuma ramificação por dispositivo (decisão G da 41b).
      */}
      <ul
        className="flex flex-wrap items-center gap-2 min-[1120px]:flex-col min-[1120px]:items-start"
        aria-label={t('pages.home.streak.mine')}
      >
        {streaks.map((row) => {
          const isMine = me !== null && row.userId === me.id;
          /*
            O mesmo caminho de nome que o feed e o acervo usam. Sem nome, a
            frase do modelo — nunca um id na tela.

            ⚠️ **"Você", E NÃO "Minhas".** Até a Tarefa 45 esta linha lia
            `pages.acervo.filters.person.mine`, que é o rótulo de um CHIP DE
            FILTRO ("Minhas [anotações]") e produzia "Minhas · 12 dias
            seguidos". O canvas escreve **"Você"** (`InicioDesktop.dc.html:111`),
            e a chave que diz isso já existe e já tem dono nesta mesma tela: é a
            que o `activity-feed.tsx` usa para nomear o ator da linha do feed.
          */
          const person = isMine
            ? t('pages.acervo.item.author.you')
            : (nameOfWriter(row.userId, me, names) ??
              t('pages.acervo.item.author.other'));
          const days =
            row.streak === 0
              ? t('pages.home.streak.none')
              : t('pages.home.streak.days', {
                  count: row.streak,
                  replace: { count: '' },
                }).trim();

          return (
            <li className="flex" key={row.userId}>
              {/*
                ⚠️⚠️ **O TOM É `isMine`, E NÃO `streak > 0` — é assim que o
                canvas desenha, e a primeira entrega desta fatia errou.**

                `InicioDesktop.dc.html:113-116` põe o Bruno, com **4 dias de
                corrente**, na pílula APAGADA; `Inicio.dc.html:102-105` faz o
                mesmo no celular. O dourado diz "esta linha é você", nunca
                "você foi bem" — se ele chegasse com a corrente e sumisse com
                ela, seria a moldura de PERDA que o §1 do plano recusa e que já
                custou a troca do glifo (a chama virou marcador).

                Sem esta prop o componente acende por `count > 0` (o padrão que
                ele tinha desde a 41b), e num clube de casal em que os dois
                leram os DOIS selos saíam dourados. O acusador é
                `home.test.tsx › ⚠️ acende o selo QUE É MEU — duas correntes
                vivas, e só uma dourada`, e ele usa **duas correntes > 0** de
                propósito: é a única forma de separar "a minha" de "tem
                corrente".
              */}
              <StreakSeal
                count={row.streak}
                label={`${days} · ${person}`}
                tone={isMine ? 'lit' : 'quiet'}
              />
            </li>
          );
        })}
      </ul>
      {/*
        ⚠️ A frase de PERDA, que é o mecanismo que o dono escolheu. Ela é a
        única do app isenta da varredura anti-culpa, e a isenção é nominal e
        pinada — ver `locales/__tests__/guilt-terms.ts`.
      */}
      {atRisk ? (
        <p className="text-sm font-medium text-accent">
          {t('pages.home.streak.atRisk')}
        </p>
      ) : null}
    </div>
  );
}
