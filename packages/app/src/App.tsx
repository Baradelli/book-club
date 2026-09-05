import { loginResponseSchema } from '@clube/shared';
import { isLocale, SUPPORTED_LOCALES } from '@clube/shared/locales';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from './auth/auth-context';
import { useActiveClub } from './club/active-club';
import { persistLocale } from './i18n';
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

function LanguagePicker() {
  const { t, i18n } = useTranslation();

  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="sr-only">{t('language.label')}</span>
      <select
        className="rounded border border-line bg-surface px-1 py-0.5"
        value={i18n.resolvedLanguage ?? 'pt'}
        onChange={(event) => {
          const next = event.target.value;
          if (!isLocale(next)) return;
          void i18n.changeLanguage(next);
          persistLocale(next);
        }}
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {t(`language.${locale}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

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
      <span className="max-w-32 truncate text-xs text-muted">
        {activeClub.name}
      </span>
    );
  }

  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="sr-only">{t('pages.home.clubLabel')}</span>
      <select
        className="max-w-32 rounded border border-line bg-surface px-1 py-0.5"
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
        className="rounded border border-line bg-surface px-1 py-0.5"
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
    // `bg-canvas` (→ `--clube-bg`) e NÃO `bg-surface`: `surface` é a cor de
    // CARTÃO. Pintar a página com ela colapsa a hierarquia de superfície da
    // Tarefa 13 — todo `bg-surface`/`hover:bg-surface` dos componentes passa a
    // pintar exatamente a cor da página, com contraste MEDIDO de 1.0000:1 nos
    // dois temas, e o hover do `ListItem` (o único retorno visual de "dá para
    // tocar aqui") desaparece. E são duas pinturas de página em disputa: o
    // `body { background-color: var(--clube-bg) }` do `styles.css` fica morto,
    // porque este div ganha. O acusador é `__tests__/theme-tokens.test.ts`.
    <div className="flex min-h-dvh flex-col bg-canvas text-content">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className="text-sm font-semibold">{t('app.name')}</span>
        <div className="flex items-center gap-3">
          <ClubPicker />
          <LanguagePicker />
          <ThemePicker />
          {isAuthenticated ? (
            <button
              className="text-xs underline"
              onClick={signOut}
              type="button"
            >
              {t('nav.signOut')}
            </button>
          ) : null}
        </div>
      </header>
      <main className="flex-1">
        <AppRoutes />
      </main>
    </div>
  );
}
