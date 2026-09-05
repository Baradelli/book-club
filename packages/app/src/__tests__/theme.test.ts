import type { StorageLike } from '@clube/shared/client';
import { describe, expect, it } from 'vitest';

import {
  applyThemePreference,
  readThemePreference,
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
 * Havia aqui um `resolveTheme(preference, systemPrefersDark)` com quatro
 * testes citando as regras 25 e 26. A função era código morto (nada no app lê
 * `matchMedia`) e os testes dela provavam só a si mesmos, enquanto os mutantes
 * do CSS de verdade passavam ilesos. Foram apagados junto com ela.
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
});
