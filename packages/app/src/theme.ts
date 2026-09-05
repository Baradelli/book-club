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

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'system',
  'light',
  'dark',
];

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

/**
 * ⚠️ **Aqui NÃO existe um `resolveTheme(preference, systemPrefersDark)`, e é
 * de propósito.** Existia, com quatro testes citando as regras 25 e 26, e os
 * únicos chamadores eram os próprios testes: nada neste app lê `matchMedia`,
 * porque quem resolve "sistema escuro" é a cascata de `@clube/ui/theme.css`,
 * em CSS puro. A função só provava a si mesma, e o teste dela dava a impressão
 * de que as regras 25/26 estavam cobertas — enquanto os mutantes do CSS
 * passavam ilesos.
 *
 * As regras 25 e 26 são provadas onde elas moram:
 * `__tests__/theme-css.test.ts`.
 */

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
  setPreference(preference: ThemePreference): void;
}

export function useTheme(
  storage: StorageLike = browserStorage,
): ThemeController {
  const [preference, setStatePreference] = useState<ThemePreference>(() =>
    readThemePreference(storage),
  );

  useEffect(() => {
    applyThemePreference(document.documentElement, preference);
  }, [preference]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      writeThemePreference(storage, next);
      setStatePreference(next);
    },
    [storage],
  );

  return { preference, setPreference };
}
