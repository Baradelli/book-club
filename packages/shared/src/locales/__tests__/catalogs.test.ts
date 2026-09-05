import { describe, expect, it } from 'vitest';

import { API_ERROR_KEYS } from '../../client/api-error-key';
import {
  DEFAULT_LOCALE,
  en,
  FALLBACK_LOCALE,
  isLocale,
  type Locale,
  pt,
  resources,
  SUPPORTED_LOCALES,
} from '../index';

/** `a.b.c` de cada folha do catálogo — é a chave que o `t()` recebe. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

function leaves(value: unknown): unknown[] {
  if (typeof value !== 'object' || value === null) return [value];
  return Object.values(value).flatMap(leaves);
}

describe('catálogos de i18n', () => {
  it('has pt as the default and en as the second locale (rule 13)', () => {
    expect(DEFAULT_LOCALE).toBe('pt');
    expect(FALLBACK_LOCALE).toBe('pt');
    expect(SUPPORTED_LOCALES).toEqual(['pt', 'en']);
  });

  it('exposes both catalogs in resources (rule 13)', () => {
    expect(resources).toEqual({
      pt: { translation: pt },
      en: { translation: en },
    });
  });

  it('has exactly the same key set in pt and en, compared recursively (rule 14)', () => {
    const ptKeys = keyPaths(pt).sort();
    const enKeys = keyPaths(en).sort();

    // Sem esta linha, um `keyPaths` quebrado devolvendo `[]` faria o teste
    // passar comparando nada com nada.
    expect(ptKeys.length).toBeGreaterThan(20);
    // Chave faltando não quebra nada em runtime: o i18next renderiza a
    // PRÓPRIA chave na tela, em inglês, e ninguém percebe. Este é o teste que
    // acusa.
    expect(ptKeys).toEqual(enKeys);
  });

  it.each([
    ['pt', pt],
    ['en', en],
  ])('has no empty value in %s (rule 15)', (_locale, catalog) => {
    const empty = keyPaths(catalog).filter((path) => {
      const value = path
        .split('.')
        .reduce<unknown>(
          (node, segment) => (node as Record<string, unknown>)[segment],
          catalog,
        );
      return typeof value !== 'string' || value.trim() === '';
    });

    expect(empty).toEqual([]);
  });

  it.each([
    ['pt', pt],
    ['en', en],
  ])('has only string leaves in %s (rule 15)', (_locale, catalog) => {
    for (const leaf of leaves(catalog)) expect(typeof leaf).toBe('string');
  });

  it('names every key in English camelCase (rule 16)', () => {
    const segment = /^[a-z][A-Za-z0-9]*$/;

    const bad = keyPaths(pt).filter((path) =>
      path.split('.').some((part) => !segment.test(part)),
    );

    expect(bad).toEqual([]);
  });

  it.each([
    ['pt', pt],
    ['en', en],
  ])(
    'says a missing invite and an invalid invite differently, in %s',
    (_locale, catalog) => {
      /*
        A regra 15 da Tarefa 15 vive AQUI, e não na tela: "404 e 410 têm frases
        diferentes" é propriedade DO CATÁLOGO — dois valores distintos — e não
        comportamento de um componente. O teste de tela que a afirmava
        (`expect(pt.pages.acceptInvite.inviteNotFound).not.toBe(...)` dentro do
        `accept-invite.test.tsx`) era §7.2 na letra: propriedade do catálogo
        dentro de teste de tela, que passaria igual com a tela desmontada.

        E as duas precisam ser diferentes NOS DOIS locales: uma tradução
        copiada e colada mataria a distinção só em `en`.
      */
      const invite = catalog.pages.acceptInvite;

      expect(invite.inviteNotFound).not.toBe(invite.inviteExpired);
      expect(invite.alreadyInClub).not.toBe(invite.inviteExpired);
      expect(invite.alreadyInClub).not.toBe(invite.inviteNotFound);
    },
  );

  it.each([
    ['pt', pt],
    ['en', en],
  ])(
    'has every key that apiErrorKey can return, in %s (rules 14 and 17)',
    (_locale, catalog) => {
      const keys = new Set(keyPaths(catalog));

      // O elo que ninguém confere à mão: `apiErrorKey` devolve uma chave, e
      // uma chave ausente do catálogo aparece na tela como `errors.conflict`.
      expect(API_ERROR_KEYS.filter((key) => !keys.has(key))).toEqual([]);
    },
  );

  it('accepts every supported locale and nothing else (rule 13)', () => {
    // O teste anterior aqui era `const locales: Locale[] = [...SUPPORTED_LOCALES]`
    // seguido de `toHaveLength(2)`: o `expect` afirmava o que o próprio
    // fixture garantia, e um `isLocale` que devolvesse `true` para tudo
    // passava. Este mede a função.
    expect(SUPPORTED_LOCALES.filter(isLocale)).toEqual([...SUPPORTED_LOCALES]);

    for (const notALocale of [
      'fr',
      // Com região: é por isso que `pickInitialLocale` corta o `-BR` antes de
      // perguntar. Se `pt-BR` passasse aqui, o i18next procuraria um catálogo
      // que não existe.
      'pt-BR',
      // Maiúscula: idem, o `toLowerCase` do `pickInitialLocale`.
      'PT',
      '',
      null,
      undefined,
      42,
      {},
      ['pt'],
    ]) {
      expect(isLocale(notALocale)).toBe(false);
    }
  });

  it('narrows to a key of resources, so a catalog is never indexed by a language we do not have', () => {
    const fromTheOutsideWorld: unknown = 'en';

    if (!isLocale(fromTheOutsideWorld)) throw new Error('unreachable');
    // Só compila porque `isLocale` é um type guard: é o compilador provando
    // que `Locale` e as chaves de `resources` são o mesmo conjunto.
    const locale: Locale = fromTheOutsideWorld;

    expect(resources[locale]).toEqual({ translation: en });
  });
});
