import type { StorageLike } from '@clube/shared/client';
import { useCallback, useEffect, useState } from 'react';

import { browserStorage } from './env';

/**
 * Tema claro/escuro.
 *
 * O mecanismo é de CSS, não de JavaScript: os tokens de `@clube/ui/theme.css`
 * respondem a `prefers-color-scheme` sozinhos, e o atributo `data-theme` só
 * existe para a escolha EXPLÍCITA vencer a do sistema. Por isso `'system'`
 * **remove** o atributo em vez de escrever um valor.
 *
 * ⚠️ A chave abaixo é lida por um script inline no `index.html`, ANTES da
 * primeira pintura (decisão F: aplicar no `useEffect` pisca branco antes de
 * virar escuro). Trocar o valor aqui sem trocar lá reintroduz o flash — há
 * teste (`__tests__/index-html.test.ts`).
 */
export const THEME_STORAGE_KEY = 'clube.theme';

export const THEME_ATTRIBUTE = 'data-theme';

export type ThemePreference = 'light' | 'dark' | 'system';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Sem escolha gravada, o padrão é `'system'` — é a primeira visita. */
export function readThemePreference(storage: StorageLike): ThemePreference {
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemePreference(
  storage: StorageLike,
  preference: ThemePreference,
): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Aba privada do Safari: o tema vale só nesta sessão.
  }
}

export type ResolvedTheme = 'light' | 'dark';

/**
 * O tema que está NA TELA. A cor continua sendo decidida pela cascata de
 * `@clube/ui/theme.css` (regras 25 e 26, provadas em `theme-css.test.ts`);
 * esta função existe só para o botão do cabeçalho saber qual ícone mostrar e
 * para onde alternar. Ela tem chamador: o `ThemeToggle` do `App.tsx`.
 */
export function resolveThemePreference(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/**
 * O clique do botão sol/lua. Sai de `'system'` para o OPOSTO do que está na
 * tela (senão o primeiro clique não muda nada) e daí só alterna entre claro e
 * escuro — não há clique que volte para `'system'`.
 */
export function nextThemePreference(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  return resolveThemePreference(preference, systemPrefersDark) === 'dark'
    ? 'light'
    : 'dark';
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Sem `matchMedia` (jsdom, navegador velho), vale o claro — o padrão do CSS. */
function systemPrefersDarkNow(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY).matches
    : false;
}

/** O mínimo de elemento que a aplicação do tema usa. */
export interface ThemeTarget {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export function applyThemePreference(
  target: ThemeTarget,
  preference: ThemePreference,
): void {
  if (preference === 'system') {
    // REMOVE, não escreve: um `data-theme` parado venceria a media query e a
    // pessoa que voltou para "do sistema" ficaria presa no tema antigo.
    target.removeAttribute(THEME_ATTRIBUTE);
    return;
  }
  target.setAttribute(THEME_ATTRIBUTE, preference);
}

export interface ThemeController {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference(preference: ThemePreference): void;
  toggle(): void;
}

export function useTheme(
  storage: StorageLike = browserStorage,
): ThemeController {
  const [preference, setStatePreference] = useState<ThemePreference>(() =>
    readThemePreference(storage),
  );

  const [systemPrefersDark, setSystemPrefersDark] =
    useState(systemPrefersDarkNow);

  useEffect(() => {
    applyThemePreference(document.documentElement, preference);
  }, [preference]);

  // Acompanha o sistema trocando de tema com o app aberto, para o ícone não
  // mentir enquanto a preferência for `'system'`.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      writeThemePreference(storage, next);
      setStatePreference(next);
    },
    [storage],
  );

  const toggle = useCallback(() => {
    setPreference(nextThemePreference(preference, systemPrefersDark));
  }, [preference, systemPrefersDark, setPreference]);

  return {
    preference,
    resolved: resolveThemePreference(preference, systemPrefersDark),
    setPreference,
    toggle,
  };
}
