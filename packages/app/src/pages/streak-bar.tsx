import type { ClubStreaksResponse } from '@clube/shared';
import { Flame } from 'lucide-react';
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
 * ⚠️ **O NÚMERO É `aria-hidden` E O NOME ACESSÍVEL DIZ A FRASE INTEIRA.** Quem
 * ouve a tela receberia "chama 12" sem o `aria-label` — o emoji do fogo não se
 * lê, e "12" sozinho não é informação.
 */
export function StreakBar({ me, names, readToday, streaks }: StreakBarProps) {
  const { t } = useTranslation();

  if (streaks.length === 0) return null;

  const mine =
    me === null ? undefined : streaks.find((s) => s.userId === me.id);
  const atRisk = mine !== undefined && mine.streak > 0 && !readToday;

  return (
    <div className="flex flex-col gap-1">
      <ul
        className="flex flex-wrap items-center gap-3"
        aria-label={t('pages.home.streak.mine')}
      >
        {streaks.map((row) => {
          const isMine = me !== null && row.userId === me.id;
          // O mesmo caminho de nome que o feed e o acervo usam. Sem nome, a
          // frase do modelo — nunca um id na tela.
          const person = isMine
            ? t('pages.acervo.filters.person.mine')
            : (nameOfWriter(row.userId, me, names) ??
              t('pages.acervo.item.author.other'));
          const days =
            row.streak === 0
              ? t('pages.home.streak.none')
              : t('pages.home.streak.days', { count: row.streak });

          return (
            <li
              key={row.userId}
              className="flex items-center gap-1 text-sm"
              // A frase inteira, para quem ouve: "Você, 12 dias seguidos".
              aria-label={`${person}, ${days}`}
            >
              <Flame
                aria-hidden
                className={
                  row.streak === 0 ? 'size-4 text-muted' : 'size-4 text-accent'
                }
              />
              <span aria-hidden>
                {person} · {days}
              </span>
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
