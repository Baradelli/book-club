import {
  clubMembersResponseSchema,
  type ClubStreaksResponse,
  clubStreaksResponseSchema,
} from '@clube/shared';
import { cx, FOCUS_RING, Sheet } from '@clube/ui';
import { Flame } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useAuth } from './auth/auth-context';
import { useActiveClub } from './club/active-club';
import {
  memberNamesOf,
  MEMBERS_UNKNOWN,
  type MembersState,
} from './pages/club-names';
import { StreakBar } from './pages/streak-bar';

/**
 * O FOGUINHO NO CABEÇALHO (ADR 0010): a sua sequência de leitura como um
 * ícone com o número ao lado, sempre à vista — e não mais um banner no topo
 * do feed da home.
 *
 * - aceso (dourado, chama cheia): você já leu hoje;
 * - apagado (cinza, só o contorno): ainda não leu hoje — com sequência em
 *   jogo, o rótulo acessível avisa que ela está em risco.
 *
 * Tocar abre a gaveta com a sequência de cada pessoa do clube — a mesma
 * `StreakBar` que o feed mostrava, agora sob demanda.
 *
 * Busca sozinho, e busca de novo a cada troca de tela: marcar "li hoje" num
 * livro e voltar já mostra o foguinho aceso. Falha em silêncio (some), como
 * fazia no feed: o foguinho é enfeite, não pode derrubar o cabeçalho.
 */
export function StreakButton() {
  const { t } = useTranslation();
  const { api } = useAuth();
  const { activeClub, me } = useActiveClub();
  const { pathname } = useLocation();
  const [streaks, setStreaks] = useState<ClubStreaksResponse>([]);
  const [members, setMembers] = useState<MembersState>(MEMBERS_UNKNOWN);
  const [open, setOpen] = useState(false);

  const clubId = activeClub === null ? null : activeClub.id;

  useEffect(() => {
    if (clubId === null) {
      setStreaks([]);
      return undefined;
    }
    let cancelled = false;
    void api
      .get(
        `/clubs/${encodeURIComponent(clubId)}/streaks`,
        clubStreaksResponseSchema,
      )
      .then((list) => {
        if (!cancelled) setStreaks(list);
      })
      .catch(() => {
        // Silêncio: sem dado, o botão some (ver acima).
      });
    return () => {
      cancelled = true;
    };
  }, [api, clubId, pathname]);

  // Os nomes só fazem falta na gaveta: a busca espera ela abrir.
  useEffect(() => {
    if (!open || clubId === null || members.status === 'ready') return;
    let cancelled = false;
    void api
      .get(
        `/clubs/${encodeURIComponent(clubId)}/members`,
        clubMembersResponseSchema,
      )
      .then((list) => {
        if (!cancelled) setMembers({ status: 'ready', members: list });
      })
      .catch(() => {
        // Sem nomes, a gaveta diz "Alguém do clube" — o `nameOfWriter` cuida.
      });
    return () => {
      cancelled = true;
    };
  }, [api, clubId, members.status, open]);

  // Trocou de clube: os nomes do clube anterior não valem mais.
  useEffect(() => {
    setMembers(MEMBERS_UNKNOWN);
  }, [clubId]);

  const memberNames = useMemo(() => memberNamesOf(members), [members]);

  if (clubId === null || me === null || streaks.length === 0) return null;

  const mine = streaks.find((row) => row.userId === me.id);
  const count = mine?.streak ?? 0;
  const readToday = mine?.readToday ?? false;
  const atRisk = count > 0 && !readToday;

  const days =
    count === 0
      ? t('pages.home.streak.none')
      : t('pages.home.streak.days', { count });
  const label = atRisk
    ? `${t('pages.home.streak.mine')}: ${days}. ${t('pages.home.streak.atRisk')}`
    : `${t('pages.home.streak.mine')}: ${days}`;

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={label}
        className={cx(
          'relative inline-flex h-9 items-center gap-1 rounded-full pl-2 pr-2.5 text-sm font-semibold tabular-nums transition-colors',
          readToday
            ? 'bg-gold-soft text-gold-strong hover:bg-pen-a'
            : 'text-muted hover:bg-surface-raised hover:text-content',
          FOCUS_RING,
        )}
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        <Flame
          aria-hidden="true"
          className="size-[18px]"
          fill={readToday ? 'currentColor' : 'none'}
          focusable="false"
          strokeWidth={readToday ? 1.75 : 2}
        />
        <span aria-hidden="true">{count}</span>
        {atRisk ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 size-2 rounded-full bg-gold ring-2 ring-canvas"
          />
        ) : null}
      </button>
      <Sheet
        closeLabel={t('pages.home.streak.close')}
        onClose={() => {
          setOpen(false);
        }}
        open={open}
        title={t('pages.home.streak.title')}
      >
        <StreakBar
          me={me}
          names={memberNames}
          readToday={readToday}
          streaks={streaks}
        />
      </Sheet>
    </>
  );
}
