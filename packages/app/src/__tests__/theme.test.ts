import type { StorageLike } from '@clube/shared/client';
import { describe, expect, it } from 'vitest';

import {
  applyThemePreference,
  nextThemePreference,
  readThemePreference,
  resolveThemePreference,
  THEME_ATTRIBUTE,
  type ThemeTarget,
  writeThemePreference,
} from '../theme';

/** Fixture é factory (§7.7). */
function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function recordingTarget(): ThemeTarget & { attribute: () => string | null } {
  let value: string | null = null;
  return {
    setAttribute: (_name, next) => {
      value = next;
    },
    removeAttribute: () => {
      value = null;
    },
    attribute: () => value,
  };
}

/**
 * ⚠️ Este arquivo prova o que `theme.ts` faz: LER e GRAVAR a preferência, e
 * escrever ou remover o atributo. Ele NÃO prova as regras 25 e 26 — quem
 * decide a cor é a cascata de `@clube/ui/theme.css`, e ela tem acusador
 * próprio em `theme-css.test.ts`.
 *
 * `resolveThemePreference`/`nextThemePreference` só decidem o ÍCONE e o
 * destino do clique do botão sol/lua; a cor na tela segue sendo do CSS.
 */
describe('tema', () => {
  it('has no preference on the first visit, so the system decides (rule 25)', () => {
    expect(readThemePreference(memoryStorage())).toBe('system');
  });

  it('leaves data-theme off when the preference is system (rule 25)', () => {
    const target = recordingTarget();
    // Estado inicial "escuro por escolha", para o teste medir a REMOÇÃO e não
    // um alvo que já estava vazio.
    applyThemePreference(target, 'dark');

    applyThemePreference(target, 'system');

    // Um `data-theme` parado venceria a media query, e quem voltasse para "do
    // sistema" ficaria preso no tema anterior.
    expect(target.attribute()).toBeNull();
  });

  it('persists an explicit choice (rule 26)', () => {
    const storage = memoryStorage();

    writeThemePreference(storage, 'dark');

    expect(readThemePreference(storage)).toBe('dark');
  });

  it('reads back a choice made in an earlier visit (rule 26)', () => {
    expect(readThemePreference(memoryStorage({ 'clube.theme': 'light' }))).toBe(
      'light',
    );
  });

  it.each([['light'], ['dark']] as const)(
    'writes data-theme=%s for an explicit choice (rule 26)',
    (preference) => {
      const target = recordingTarget();

      applyThemePreference(target, preference);

      expect(target.attribute()).toBe(preference);
    },
  );

  it('ignores a garbage value stored by an older version', () => {
    expect(readThemePreference(memoryStorage({ 'clube.theme': 'sepia' }))).toBe(
      'system',
    );
  });

  it('survives a storage that throws', () => {
    const boom: StorageLike = {
      getItem: () => {
        throw new Error('storage blocked');
      },
      setItem: () => {
        throw new Error('storage blocked');
      },
      removeItem: () => {
        throw new Error('storage blocked');
      },
    };

    expect(readThemePreference(boom)).toBe('system');
    expect(() => writeThemePreference(boom, 'dark')).not.toThrow();
  });

  it('uses an attribute name the CSS can select', () => {
    // O `theme.css` do `@clube/ui` casa `[data-theme='dark']`. Renomear aqui
    // sem renomear lá desliga o tema sem quebrar teste nenhum de renderização.
    expect(THEME_ATTRIBUTE).toBe('data-theme');
  });

  it.each([
    ['system', false, 'light'],
    ['system', true, 'dark'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
  ] as const)(
    'resolves %s with system dark=%s to %s',
    (preference, systemPrefersDark, expected) => {
      expect(resolveThemePreference(preference, systemPrefersDark)).toBe(
        expected,
      );
    },
  );

  it.each([
    // Primeiro clique a partir do sistema: vai para o OPOSTO do que a pessoa
    // está vendo — senão o clique não muda nada na tela.
    ['system', false, 'dark'],
    ['system', true, 'light'],
    ['light', false, 'dark'],
    ['dark', true, 'light'],
  ] as const)(
    'toggles %s (system dark=%s) to %s, never back to system',
    (preference, systemPrefersDark, expected) => {
      expect(nextThemePreference(preference, systemPrefersDark)).toBe(expected);
    },
  );
});
