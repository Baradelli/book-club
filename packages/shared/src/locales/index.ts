// @clube/shared/locales — catálogos de i18n.
//
// `pt` é o padrão do clube e o fallback; `en` é o segundo locale
// (`CLAUDE.md`). Os catálogos vivem em `shared` porque a mesma chave é usada
// pelo app e por qualquer outro consumidor futuro — e porque a paridade de
// chaves precisa de um teste, que mora aqui.

import { en } from './en';
import { pt } from './pt';

export { en } from './en';
export { pt } from './pt';

/** A ORDEM importa: o primeiro é o padrão. */
export const SUPPORTED_LOCALES = ['pt', 'en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'pt';

/**
 * Para onde o i18next cai quando a chave não existe no idioma escolhido.
 * É `pt` e não `en`: um clube brasileiro prefere ver português a ver inglês.
 */
export const FALLBACK_LOCALE: Locale = 'pt';

/** No formato que o `i18next.init` espera. */
export const resources = {
  pt: { translation: pt },
  en: { translation: en },
};

export type TranslationCatalog = typeof pt;

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}
