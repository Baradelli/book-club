import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { API_ERROR_KEYS } from '../../client/api-error-key';
import {
  DEFAULT_LOCALE,
  eagerResources,
  en,
  FALLBACK_LOCALE,
  isLocale,
  type Locale,
  pt,
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

  /*
    ⚠️ **A ASSERÇÃO TROCADA, NÃO APAGADA (Tarefa 29a, decisão D).** O nome
    antigo era `exposes both catalogs in resources (rule 13)`, e ele descrevia a
    verdade de então: os DOIS catálogos iam no `i18next.init`, ou seja, no chunk
    de entrada do PWA. A partir da 29a só o `pt` é eager — o `en` chega por
    `import()` quando alguém escolhe inglês —, e a asserção antiga passaria a
    afirmar o oposto do que o produto faz.

    A substituta pina a verdade nova pelos DOIS lados: o que está lá dentro
    (`pt`) e o que NÃO está (`en`). Um `toEqual` do objeto inteiro já reprova o
    `en` de volta; a segunda linha existe para o vermelho DIZER isso.
  */
  it('ships ONLY pt eagerly, because en is fetched on demand (rules 4 and 13)', () => {
    expect(eagerResources).toEqual({ pt: { translation: pt } });
    expect(Object.keys(eagerResources)).toEqual(['pt']);
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

  /*
    ⚠️ **A SEGUNDA ASSERÇÃO TROCADA (decisão D).** O nome antigo era
    `narrows to a key of resources, so a catalog is never indexed by a language
    we do not have`, e o corpo dele provava, pelo COMPILADOR, que `Locale` e as
    chaves de `resources` eram o MESMO conjunto (`resources[locale]` só compila
    se forem).

    Essa identidade quebrou por decisão: `eagerResources` passou a ser um
    SUBCONJUNTO de `Locale`. Apagar o teste deixaria o conjunto `Locale` sem
    nenhum acusador estrutural — o `Record<Locale, true>` abaixo é quem assume
    esse papel: acrescentar ou tirar um locale do `SUPPORTED_LOCALES` deixa de
    compilar aqui, exatamente como o `resources[locale]` deixava antes.

    E a relação nova entre os dois conjuntos é afirmada em runtime, nos dois
    sentidos: quem é eager (`pt`) e quem é sob demanda (`en`).
  */
  it('narrows to a supported locale, of which the eager resources are a strict SUBSET', () => {
    const fromTheOutsideWorld: unknown = 'en';

    if (!isLocale(fromTheOutsideWorld)) throw new Error('unreachable');
    // Só compila porque `isLocale` é um type guard sobre `Locale`.
    const locale: Locale = fromTheOutsideWorld;

    // O acusador ESTRUTURAL de `Locale`: chave a mais ou a menos aqui é erro de
    // compilação, não de runtime.
    const everyLocale: Record<Locale, true> = { pt: true, en: true };
    expect(Object.keys(everyLocale).sort()).toEqual(
      [...SUPPORTED_LOCALES].sort(),
    );

    // `en` é um locale de verdade...
    expect(SUPPORTED_LOCALES).toContain(locale);
    // ...e é justamente o que NÃO vem no pacote eager.
    expect(SUPPORTED_LOCALES.filter((l) => l in eagerResources)).toEqual([
      'pt',
    ]);
    expect(SUPPORTED_LOCALES.filter((l) => !(l in eagerResources))).toEqual([
      'en',
    ]);
  });

  it('exports the en catalog under a subpath of its OWN, so the bundler can cut there (rule 1)', () => {
    /*
      Sem este subpath o único alvo do `import()` seria o BARRIL, que já está
      inteiro no chunk de entrada: o Rollup veria o binding `en` usado e o
      traria de volta para a entrada, desfazendo a fatia em silêncio. O subpath
      é o que dá ao bundler uma fronteira para cortar (Tarefa 29a, decisão A).
    */
    const manifest: unknown = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../../package.json', import.meta.url)),
        'utf8',
      ),
    );
    const exportsField = (manifest as { exports: Record<string, string> })
      .exports;

    expect(exportsField['./locales/en']).toBe('./src/locales/en.ts');
    // E os subpaths que já existiam não mudam — o barril continua onde estava.
    expect(exportsField).toEqual({
      '.': './src/index.ts',
      './client': './src/client/index.ts',
      './locales': './src/locales/index.ts',
      './locales/en': './src/locales/en.ts',
      './anti-culpa': './src/locales/__tests__/guilt-terms.ts',
      './adr-0002': './src/locales/__tests__/privacy-terms.ts',
    });
  });

  it('imports pt as a TYPE in en.ts, so the en chunk carries no pt (rule 2)', () => {
    /*
      `import { pt }` num arquivo que só usa `typeof pt` é elidido pelo `tsc`,
      mas NÃO por um bundler que respeite `isolatedModules` sem enxergar o uso:
      o chunk do `en` passaria a arrastar o catálogo `pt` inteiro junto, e a
      pessoa que troca de idioma baixaria os dois. O `import type` tira o
      binding da mesa antes de qualquer bundler ter opinião.
    */
    const source = readFileSync(
      fileURLToPath(new URL('../en.ts', import.meta.url)),
      'utf8',
    );

    expect(source).toMatch(/^import type \{ pt \} from '\.\/pt';$/mu);
    // O lado positivo do par: nenhum import de VALOR sobrou no arquivo.
    expect(source).not.toMatch(/^import (?!type )/mu);
  });
});
