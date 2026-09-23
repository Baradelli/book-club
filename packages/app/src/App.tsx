import { loginResponseSchema } from '@clube/shared';
import { cx, FOCUS_RING } from '@clube/ui';
import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useAuth } from './auth/auth-context';
import { useActiveClub } from './club/active-club';
import { SETTINGS_PATH } from './pages/paths';
import { AppRoutes } from './router';
import { isThemePreference, THEME_PREFERENCES, useTheme } from './theme';

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

  O `ThemePicker` FICA: ele tem três opções de verdade, e nenhuma delas tem
  a ver com idioma.
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
        ⚠️ **O NOME DO CLUBE EM MONO, e ele FICA no celular — divergência do
        canvas, declarada.** O canvas desenha o nome do clube só nos cinco
        artboards de 1280px (`InicioDesktop.dc.html:24`:
        `'Geist Mono' 10px 0.12em maiúsculo`), e o cabeçalho de celular não o
        tem. Escondê-lo abaixo de 1120px tiraria do celular o ÚNICO lugar em
        que o clube é nomeado — e faria isso em silêncio, porque o jsdom não
        aplica CSS: `home.test.tsx › shows the club name in the header even
        with a single club (decision F)` continuaria verde com o nome
        invisível. Divergência de pintura, não de informação.
      */
      <span className="max-w-32 truncate font-mono text-eyebrow uppercase tracking-[0.12em] text-muted">
        {activeClub.name}
      </span>
    );
  }

  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="sr-only">{t('pages.home.clubLabel')}</span>
      <select
        className="max-w-32 rounded-control border border-line bg-surface px-1 py-0.5"
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

function ThemePicker() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="sr-only">{t('theme.label')}</span>
      <select
        className="rounded-control border border-line bg-surface px-1 py-0.5"
        value={theme.preference}
        onChange={(event) => {
          const next = event.target.value;
          if (isThemePreference(next)) theme.setPreference(next);
        }}
      >
        {THEME_PREFERENCES.map((preference) => (
          <option key={preference} value={preference}>
            {t(`theme.${preference}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function App() {
  const { t } = useTranslation();
  const { isAuthenticated, signOut } = useAuth();
  useSessionRefresh();

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
        | ≥1120px | 56px (`h-14`) | `0 40px` (`px-10`) | `--surface` | `1px --border` |

        Fonte: `Inicio.dc.html:26` e `InicioDesktop.dc.html:21`. ⚠️ A spec da
        fatia citava `:32` para os dois — a 32 do `Inicio` é o `<main>` e a do
        `InicioDesktop` é o `</div>` do grupo da direita (o `</header>` está na
        :33). Os números (52/56) estavam certos; as
        linhas, não.

        ⚠️ **DUAS SUPERFÍCIES A PARTIR DAQUI, e isso é a regra 9.** A página é
        `--bg` (o `bg-canvas` do `div` acima) e o cabeçalho é `--surface`. As
        duas guardas falam de elementos diferentes —
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
      <header className="flex h-13 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-5 min-[1120px]:h-14 min-[1120px]:px-10">
        {/*
          O canvas agrupa o nome do app e o do clube à ESQUERDA, alinhados pela
          linha de base (`InicioDesktop.dc.html:22`: `align-items:baseline`,
          `gap:20px`). No celular o clube não existe no desenho — veja o
          `ClubPicker`, que registra por que ele fica mesmo assim.
        */}
        <div className="flex min-w-0 items-baseline gap-3 min-[1120px]:gap-5">
          {/*
            `Inicio.dc.html:27`: Fraunces 16px/600, `letter-spacing:-0.01em`.

            ⚠️ **UM PIXEL DE DIVERGÊNCIA, DECLARADO:** o desktop usa 17px
            (`InicioDesktop.dc.html:23`) e aqui saem 16px nas duas larguras.
            17px não existe na escala fechada de sete degraus da Tarefa 39, e
            um degrau novo entra também na lista fechada de isenções ao
            `light-dark()` — caro demais para 1px. É a mesma decisão, e o mesmo
            registro, dos 14/15px do chevron da `ContextBar` (Tarefa 41b).
          */}
          <span className="truncate font-reading text-base font-semibold tracking-[-0.01em]">
            {t('app.name')}
          </span>
          <ClubPicker />
        </div>
        {/*
          ⚠️ **8px CONTRA OS 4px DO CANVAS (`Inicio.dc.html:28`), declarado.**
          O canvas encosta o alvo de 44×44 do botao no rotulo "Sair", que la e
          um `<a>` de 34px de altura. Aqui os dois sao alvos de 44px pelo piso
          da decisao F, e 4px entre duas areas de toque de 44px deixa o dedo
          acertar a errada — o mesmo argumento do `-mx-2 px-2` da
          `ContextBar`. No desktop saem 16px, que e o que
          `InicioDesktop.dc.html:26` desenha.
        */}
        <div className="flex items-center gap-2 min-[1120px]:gap-4">
          <ThemePicker />
          {isAuthenticated ? (
            <>
              {/*
                A ENTRADA DAS PREFERÊNCIAS (Tarefa 36b, decisão A e regra 3).

                ⚠️ **NO CABEÇALHO, E NÃO NA HOME.** O cabeçalho já é o lar dos
                controles da PESSOA (idioma e tema); a home é a tela do CLUBE —
                é por isso que a entrada da busca mora nela (Tarefa 29).
                Preferência não pertence a clube nenhum, e o `Settings` é
                `unique(userId)` sem `clubId` desde a Tarefa 03.

                ⚠️ **`Link`, NUNCA `<a href>` cru**: âncora crua é navegação de
                documento e recarrega o PWA inteiro (o `home.tsx` registra
                isso) — perde a sessão em memória, o clube ativo e o chunk já
                baixado.

                ⚠️ **ÍCONE MAIS RÓTULO ACESSÍVEL**: ícone sozinho não tem nome.
                O glifo vem do `lucide-react` (`CLAUDE.md`) e é `aria-hidden`;
                quem nomeia o alvo é o `aria-label`, e é ele que o leitor de
                tela fala. `min-h-11` = 44px, o piso de toque da Tarefa 13 — um
                ícone de 16px sem alvo é toque errado garantido no celular.
              */}
              <Link
                aria-label={t('nav.settings')}
                className={cx(
                  // `Inicio.dc.html:29`: 44×44, `color:var(--text-muted)`. ⚠️ A
                  // primeira entrega citava a :28, que e o `<div>` que o
                  // CONTEM — conferido lendo a linha, nao contando de cabeca.
                  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-muted transition-colors hover:text-content',
                  FOCUS_RING,
                )}
                to={SETTINGS_PATH}
              >
                <SlidersHorizontal
                  aria-hidden="true"
                  className="size-4"
                  focusable="false"
                />
              </Link>
              {/*
                `Inicio.dc.html:32`: `'Geist Mono'` 10px, `0.1em`, maiúsculo,
                `--text-muted`, sem sublinhado — o mesmo rótulo de sistema que
                a `ContextBar` usa para "voltar".

                ⚠️ **`<button>` e não o `<a href="#">` do canvas.** Sair é uma
                AÇÃO (apaga o token), não um endereço; uma âncora daria menu de
                contexto com "abrir em nova aba" para algo que não abre nada. O
                canvas desenha a pintura, não a semântica.

                `min-h-11` = 44px: o canvas dá `padding:12px 0` (≈34px), e o
                piso de toque da decisão F vence, como nas Tarefas 41a e 41b.
              */}
              <button
                className={cx(
                  'inline-flex min-h-11 items-center rounded-control font-mono text-eyebrow uppercase tracking-[0.1em] text-muted transition-colors hover:text-content',
                  FOCUS_RING,
                )}
                onClick={signOut}
                type="button"
              >
                {t('nav.signOut')}
              </button>
            </>
          ) : null}
        </div>
      </header>
      <main className="flex-1">
        <AppRoutes />
      </main>
    </div>
  );
}
