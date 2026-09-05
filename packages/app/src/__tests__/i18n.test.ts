import type { StorageLike } from '@clube/shared/client';
import { describe, expect, it } from 'vitest';

import { LOCALE_STORAGE_KEY, persistLocale, pickInitialLocale } from '../i18n';

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

describe('pickInitialLocale', () => {
  it('honours the locale the person chose before (rule 13)', () => {
    // Navegador em inglês de propósito: se a escolha não vencesse, o
    // resultado seria 'en' e o teste passaria por acidente com 'pt'.
    expect(pickInitialLocale('pt', ['en-US', 'en'])).toBe('pt');
    expect(pickInitialLocale('en', ['pt-BR', 'pt'])).toBe('en');
  });

  it('falls back to the browser language, region stripped', () => {
    expect(pickInitialLocale(null, ['en-GB'])).toBe('en');
  });

  it('normalises the case of the browser language', () => {
    // A BCP-47 diz "recomenda-se" minúsculas na subtag primária, não "exige".
    // Sem o `toLowerCase`, um navegador que mande `EN-US` cai no padrão `pt` e
    // a pessoa vê o app no idioma errado — e nada acusa.
    expect(pickInitialLocale(null, ['EN-US'])).toBe('en');
    expect(pickInitialLocale(null, ['PT-br'])).toBe('pt');
  });

  it('falls back to pt, the default of the club (rule 13)', () => {
    expect(pickInitialLocale(null, ['fr-FR', 'de'])).toBe('pt');
    expect(pickInitialLocale(null, [])).toBe('pt');
  });

  it('ignores a stored value that is not a locale we have', () => {
    expect(pickInitialLocale('klingon', ['en-US'])).toBe('en');
  });
});

describe('persistLocale', () => {
  it('writes the choice under a named, constant key', () => {
    // O simétrico de `writeThemePreference`, que tinha teste. Sem este, um
    // `persistLocale` que virasse no-op passava na suíte inteira — e quem
    // troca de idioma volta para o padrão a cada recarga.
    const storage = memoryStorage();

    persistLocale('en', storage);

    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('reads back, in a new session, the choice of the previous one', () => {
    const storage = memoryStorage();

    persistLocale('en', storage);

    // A ida e a volta pela MESMA chave — é o par que o app faz de verdade.
    expect(
      pickInitialLocale(storage.getItem(LOCALE_STORAGE_KEY), ['pt-BR']),
    ).toBe('en');
  });

  it('uses a key of its own, not the one of the theme', () => {
    // Duas preferências na mesma chave: escolher idioma apagaria o tema.
    expect(LOCALE_STORAGE_KEY).toBe('clube.locale');
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

    // Safari em aba privada: a escolha vale só nesta sessão, mas o app abre.
    expect(() => persistLocale('en', boom)).not.toThrow();
  });
});
