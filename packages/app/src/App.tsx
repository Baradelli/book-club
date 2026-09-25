import { loginResponseSchema } from '@clube/shared';
import { Button, cx, FOCUS_RING, Sheet } from '@clube/ui';
import {
  ChevronLeft,
  House,
  LogOut,
  Menu,
  Moon,
  Search,
  SlidersHorizontal,
  Sun,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  type Location,
  NavLink,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import { useAuth } from './auth/auth-context';
import { useActiveClub } from './club/active-club';
import { SEARCH_PATH, SETTINGS_PATH } from './pages/paths';
import { AppRoutes } from './router';
import { StreakButton } from './streak-button';
import { useTheme } from './theme';

/**
 * Renova o token no BOOT (decisão B da Tarefa 12), não num interceptador com
 * retry: o token vive 15 dias e o `/auth/refresh` desliza a validade. Um
 * interceptador que tenta refresh a cada 401 precisaria de fila de requests
 * pendentes e de proteção contra loop — complexidade sem caso de uso num app
 * de sessão longa.
 *
 * Falhou porque a sessão morreu (401)? O `onUnauthorized` do cliente já
 * deslogou. Falhou por rede? Não faz nada: o token que está aí continua
 * valendo, e insistir só deixaria a pessoa sem app no metrô.
 */
function useSessionRefresh(): void {
  const { token, api, signIn } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (token === null || done.current) return;
    done.current = true;

    void api
      .post('/auth/refresh', undefined, loginResponseSchema)
      .then((response) => signIn(response.token))
      .catch(() => undefined);
  }, [token, api, signIn]);
}

/*
  ⚠️ **O SELETOR DE IDIOMA SAIU NA TAREFA 38d**, e com ele o `changeLocale`,
  o `persistLocale` e as chaves `language.*` do catálogo. O dono respondeu à
  pergunta 7 do MVP 1 (`docs/ACEITE-MVP.md`, 2026-09-17): *"só português —
  apagar o inglês"*. Um `<select>` de um item só é ruído puro — o mesmo
  argumento que já vale para o `ClubPicker` logo abaixo, que só aparece com
  2+ clubes.

  O tema deixou de ser `<select>`: começa no do sistema e o botão sol/lua do
  cabeçalho só alterna entre claro e escuro (`ThemeToggle`).
*/

/**
 * O SELETOR DE CLUBE ATIVO — regra 6 e decisão F.
 *
 * ⚠️ SÓ APARECE COM 2+ CLUBES. Com um clube, um seletor de um item é ruído
 * puro: o nome continua visível, como texto. E com ZERO clubes não há nada a
 * dizer aqui — é o primeiro login do projeto (o seed cria o super-admin sem
 * membership), e quem explica isso é o estado vazio da home, não o cabeçalho.
 *
 * O nome do clube é conteúdo do usuário, não frase da API: não passa por
 * `t()` (não se traduz o nome que a pessoa deu ao clube), e o `value` do
 * `<option>` é o `id`.
 */
function ClubPicker() {
  const { t } = useTranslation();
  const { activeClub, clubs, selectClub } = useActiveClub();

  if (activeClub === null) return null;

  if (clubs.length < 2) {
    return (
      /*
        ⚠️ **O NOME DO CLUBE FICA no celular — divergência do canvas,
        declarada.** (O mono do canvas saiu na repaginação de 2026-09-24: hoje
        é a sans da interface, em `text-label`.) O canvas desenha o nome do clube só nos cinco
        artboards de 1280px (`InicioDesktop.dc.html:24`:
        `'Geist Mono' 10px 0.12em maiúsculo`), e o cabeçalho de celular não o
        tem. Escondê-lo abaixo de 1120px tiraria do celular o ÚNICO lugar em
        que o clube é nomeado — e faria isso em silêncio, porque o jsdom não
        aplica CSS: `home.test.tsx › shows the club name in the header even
        with a single club (decision F)` continuaria verde com o nome
        invisível. Divergência de pintura, não de informação.
      */
      <span className="max-w-40 truncate text-label font-medium text-muted">
        {activeClub.name}
      </span>
    );
  }

  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="sr-only">{t('pages.home.clubLabel')}</span>
      <select
        className="max-w-40 rounded-full bg-surface px-2.5 py-1 text-label font-medium text-muted shadow-field"
        value={activeClub.id}
        onChange={(event) => {
          selectClub(event.target.value);
        }}
      >
        {clubs.map((club) => (
          <option key={club.id} value={club.id}>
            {club.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * O BOTÃO SOL/LUA. Sem escolha gravada vale o tema do sistema; cada clique
 * alterna entre claro e escuro. O ícone mostra para onde o clique LEVA (lua no
 * claro, sol no escuro) e o `aria-label` diz o mesmo — ícone sozinho não tem
 * nome para quem ouve a tela. 44×44 como a entrada de preferências.
 */
function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useTheme();
  const toDark = theme.resolved === 'light';
  const Icon = toDark ? Moon : Sun;

  return (
    <button
      aria-label={t(toDark ? 'theme.switchToDark' : 'theme.switchToLight')}
      className={cx(HEADER_ICON_CLASS, FOCUS_RING)}
      onClick={theme.toggle}
      type="button"
    >
      <Icon
        aria-hidden="true"
        className="icon-swap size-5"
        focusable="false"
        key={theme.resolved}
      />
    </button>
  );
}

const HEADER_ICON_CLASS =
  'inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-raised hover:text-content';

/** As telas-raiz: nelas não há "voltar", só o menu. */
const ROOT_PATHS = ['/', SEARCH_PATH, SETTINGS_PATH] as const;

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  onSignOut: () => void;
}

/**
 * A BARRA LATERAL — o menu do app, aberto pelo botão do cabeçalho em QUALQUER
 * tela (a barra de abas do rodapé só existia nas telas-raiz, e de dentro de um
 * livro não havia como chegar à busca ou às preferências).
 *
 * `<dialog>` nativo com `showModal()`: prende o foco dentro do menu, fecha
 * com Esc e deixa o resto da página inerte para o leitor de tela — as três
 * coisas que um `div` fixo teria de reimplementar. O deslize é CSS
 * (`.app-drawer` em `styles.css`).
 */
function Sidebar({ onClose, onSignOut, open }: SidebarProps) {
  const { t } = useTranslation();
  const { activeClub } = useActiveClub();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    // O jsdom não implementa `showModal`; sem ele o menu só não abre.
    if (dialog === null || typeof dialog.showModal !== 'function') return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Esc (e qualquer outro fechamento nativo) fecha o `<dialog>` por conta
  // própria; o estado do React tem de acompanhar, senão o botão não reabre.
  // ⚠️ Ouvinte NATIVO, e não o `onClose` do JSX: medido no navegador, o React
  // 18 não entregou o evento `close` do `<dialog>` — o menu fechava com Esc e
  // o estado ficava `open`, travando a reabertura.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return undefined;
    dialog.addEventListener('close', onClose);
    return () => {
      dialog.removeEventListener('close', onClose);
    };
  }, [onClose]);

  const links = [
    { to: '/', label: t('nav.home'), Icon: House, end: true },
    { to: SEARCH_PATH, label: t('nav.search'), Icon: Search, end: false },
    {
      to: SETTINGS_PATH,
      label: t('nav.settings'),
      Icon: SlidersHorizontal,
      end: false,
    },
  ];

  const rowClass =
    'flex min-h-12 w-full items-center gap-3.5 rounded-control px-3.5 text-base font-medium transition-colors';

  return (
    <dialog
      aria-label={t('nav.drawer')}
      className="app-drawer"
      onClick={(event) => {
        // O clique no fundo escurecido cai no próprio `<dialog>`.
        if (event.target === event.currentTarget) onClose();
      }}
      ref={ref}
    >
      <div className="flex h-full flex-col pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 pl-5 pr-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-reading text-[19px] font-semibold tracking-[-0.02em]">
              {t('app.name')}
            </span>
            {activeClub === null ? null : (
              <span className="truncate text-label text-muted">
                {activeClub.name}
              </span>
            )}
          </div>
          <button
            aria-label={t('nav.closeMenu')}
            className={cx(HEADER_ICON_CLASS, FOCUS_RING)}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" focusable="false" />
          </button>
        </div>

        <nav aria-label={t('nav.drawer')} className="flex-1 px-3 pt-2">
          <ul className="flex list-none flex-col gap-1" role="list">
            {links.map(({ Icon, end, label, to }) => (
              <li key={to}>
                <NavLink
                  className={({ isActive }) =>
                    cx(
                      rowClass,
                      isActive
                        ? 'bg-accent-soft text-accent'
                        : 'text-content hover:bg-surface-raised',
                      FOCUS_RING,
                    )
                  }
                  end={end}
                  onClick={onClose}
                  to={to}
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        aria-hidden="true"
                        className="size-5 shrink-0"
                        focusable="false"
                        strokeWidth={isActive ? 2.25 : 1.75}
                      />
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-line-soft px-3 py-3">
          <button
            className={cx(
              rowClass,
              'text-muted hover:bg-surface-raised hover:text-content',
              FOCUS_RING,
            )}
            onClick={onSignOut}
            type="button"
          >
            <LogOut
              aria-hidden="true"
              className="size-5 shrink-0"
              focusable="false"
              strokeWidth={1.75}
            />
            {t('nav.signOut')}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * O VOLTAR das telas internas. Num PWA instalado não há o voltar do
 * navegador; sem este botão, quem entra num livro só sai pelo menu.
 * Volta no histórico quando há para onde voltar dentro do app (o `idx` que o
 * roteador grava no `history.state`); aberto direto por link, vai para o início.
 */
function BackButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <button
      aria-label={t('nav.back')}
      className={cx(HEADER_ICON_CLASS, '-ml-2 text-accent', FOCUS_RING)}
      onClick={() => {
        const state: unknown = window.history.state;
        const idx =
          typeof state === 'object' && state !== null && 'idx' in state
            ? state.idx
            : 0;
        if (typeof idx === 'number' && idx > 0) void navigate(-1);
        else void navigate('/');
      }}
      type="button"
    >
      <ChevronLeft
        aria-hidden="true"
        className="size-6"
        focusable="false"
        strokeWidth={2.25}
      />
    </button>
  );
}

/**
 * A TROCA DE TELA ANIMADA. A localização exibida fica um passo atrás da real:
 * quando o caminho muda, o navegador fotografa a tela velha, a troca acontece
 * dentro de `startViewTransition` e o CSS (`::view-transition-*(page)` em
 * `styles.css`) faz a velha sumir e a nova entrar subindo de leve — o
 * crossfade de app nativo, com a tela velha de verdade saindo.
 *
 * Só o CAMINHO anima: filtro na query ou âncora na mesma tela trocam na hora.
 * Sem a API (Firefox antigo) ou com "reduzir movimento", troca na hora também.
 * `flushSync` porque a API precisa do DOM novo pronto quando o callback volta.
 */
function useViewTransitionLocation(): Location {
  const location = useLocation();
  const [shown, setShown] = useState(location);

  useEffect(() => {
    if (location.key === shown.key) return;
    const samePath = location.pathname === shown.pathname;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (
      samePath ||
      reduce ||
      document.hidden ||
      !('startViewTransition' in document)
    ) {
      setShown(location);
      return;
    }
    const transition = document.startViewTransition(() => {
      flushSync(() => {
        setShown(location);
      });
    });
    // O navegador ABORTA a animação (aba escondida, outra troca no meio) e
    // rejeita estas promessas; a troca de tela em si já aconteceu no callback.
    transition.ready.catch(() => undefined);
    transition.finished.catch(() => undefined);
  }, [location, shown]);

  return shown;
}

export function App() {
  const { t } = useTranslation();
  const { isAuthenticated, signOut } = useAuth();
  const shownLocation = useViewTransitionLocation();
  const { pathname } = shownLocation;
  useSessionRefresh();
  const isRoot = (ROOT_PATHS as readonly string[]).includes(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  // Trocou de tela, o menu fecha — inclusive pelo "voltar" do navegador.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    // `bg-canvas` (→ `--bg`) e NÃO `bg-surface`: `surface` é a cor de
    // CARTÃO. Pintar a página com ela colapsa a hierarquia de superfície da
    // Tarefa 13 — todo `bg-surface`/`hover:bg-surface` dos componentes passa a
    // pintar exatamente a cor da página, com contraste MEDIDO de 1.0000:1 nos
    // dois temas, e o hover do `ListItem` (o único retorno visual de "dá para
    // tocar aqui") desaparece. E são duas pinturas de página em disputa: o
    // `body { background-color: var(--bg) }` do `styles.css` fica morto,
    // porque este div ganha. O acusador é `__tests__/theme-tokens.test.ts`.
    <div className="flex min-h-dvh flex-col bg-canvas text-content">
      {/*
        ============================================================================
        O CABEÇALHO DO CANVAS — a decisão H da Tarefa 42
        ============================================================================

        Medido contando o `<header>` dos 21 artboards, e as duas alturas são
        unânimes DENTRO de cada classe (16 artboards de celular, 5 de desktop —
        o número está escrito porque "os artboards concordam" é a generalização
        de amostra que já derrubou afirmações nas fatias 39, 40, 41a e 41b):

        | largura | altura | recuo | papel | filete |
        | --- | --- | --- | --- | --- |
        | celular | 52px (`h-13`) | `0 20px` (`px-5`) | `--surface` | `1px --border` |
        | ≥1120px | 56px | `0 40px` | `--surface` | `1px --border` |

        Fonte: `Inicio.dc.html:26` e `InicioDesktop.dc.html:21`. ⚠️ A spec da
        fatia citava `:32` para os dois — a 32 do `Inicio` é o `<main>` e a do
        `InicioDesktop` é o `</div>` do grupo da direita (o `</header>` está na
        :33). Os números (52/56) estavam certos; as
        linhas, não.

        ⚠️⚠️ **A TABELA ACIMA É O REGISTRO DO CANVAS — a repaginação visual de
        2026-09-24 (decisão do dono) mudou o entregue.** Hoje: 56px nos dois
        cortes (`h-14` na linha interna), recuo `pl-4 pr-2` no celular e
        `px-10` acima do corte, o entalhe (`safe-area-inset-top`) por cima da
        linha, e o cabeçalho FIXO e TRANSLÚCIDO — `sticky top-0`, a cor da
        página a 80% com desfoque atrás (`bg-canvas/80 backdrop-blur-xl`) e o
        filete suave embaixo. O acusador é `app.test.tsx › the header of the
        canvas`.

        ⚠️ **O CABEÇALHO É UM ELEMENTO À PARTE, e isso é a regra 9.** A página
        é `--bg` (o `bg-canvas` do `div` acima); o cabeçalho tem fundo próprio
        (hoje translúcido). As duas guardas falam de elementos diferentes —
        `theme-tokens.test.ts › paints the shell with exactly one background
        utility` mede o literal que contém `min-h-dvh`, que continua tendo um
        `bg-*` só — então nenhuma precisou afrouxar, e o acusador do cabeçalho
        nasceu em `app.test.tsx`.

        ⚠️ **O CORTE É MEDIA QUERY E SÓ** (decisão G do MVP 3.5): nenhum
        `userAgent`, nenhum `isMobile`. E `min-[1120px]:` é escrito por extenso
        em cada classe, nunca montado — o Tailwind emite o que está literal no
        fonte.

        `shrink-0` porque o `div` externo é `flex-col`: sem ele o cabeçalho
        encolhe quando o `<main>` cresce, e as duas alturas medidas viram
        sugestão.
      */}
      <header className="sticky top-0 z-30 shrink-0 [view-transition-name:app-header] border-b border-line-soft bg-canvas/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="flex h-14 items-center justify-between gap-3 pl-4 pr-2 min-[1120px]:px-10">
          <div className="flex min-w-0 items-center gap-2.5 min-[1120px]:gap-5">
            {isAuthenticated && !isRoot ? <BackButton /> : null}
            <span className="shrink-0 font-reading text-[19px] font-semibold tracking-[-0.02em]">
              {t('app.name')}
            </span>
            <ClubPicker />
          </div>
          <div className="flex items-center gap-0.5 min-[1120px]:gap-2">
            {isAuthenticated ? <StreakButton /> : null}
            <ThemeToggle />
            {isAuthenticated ? (
              <button
                aria-expanded={menuOpen}
                aria-haspopup="dialog"
                aria-label={t('nav.menu')}
                className={cx(HEADER_ICON_CLASS, FOCUS_RING)}
                onClick={() => {
                  setMenuOpen(true);
                }}
                type="button"
              >
                <Menu aria-hidden="true" className="size-5" focusable="false" />
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="flex-1 [view-transition-name:page]">
        <AppRoutes location={shownLocation} />
      </main>
      {isAuthenticated ? (
        <Sidebar
          onClose={closeMenu}
          onSignOut={() => {
            // O menu fecha ANTES da confirmação abrir: ele é um `<dialog>`
            // modal na camada do topo, e a gaveta ficaria por baixo dele.
            setMenuOpen(false);
            setConfirmingSignOut(true);
          }}
          open={menuOpen}
        />
      ) : null}
      {/*
        A CONFIRMAÇÃO DE SAIR. Sair apaga a sessão deste aparelho, e o botão
        mora no fim do menu, onde o polegar esbarra — um toque sem querer não
        pode derrubar a pessoa para a tela de login.
      */}
      <Sheet
        closeLabel={t('nav.signOutConfirm.close')}
        onClose={() => {
          setConfirmingSignOut(false);
        }}
        open={confirmingSignOut}
        title={t('nav.signOutConfirm.title')}
      >
        <div className="flex flex-col gap-5">
          <p className="text-ui text-muted">
            {t('nav.signOutConfirm.description')}
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row-reverse">
            <Button
              onClick={() => {
                setConfirmingSignOut(false);
                signOut();
              }}
            >
              {t('nav.signOutConfirm.confirm')}
            </Button>
            <Button
              onClick={() => {
                setConfirmingSignOut(false);
              }}
              variant="ghost"
            >
              {t('nav.signOutConfirm.cancel')}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
