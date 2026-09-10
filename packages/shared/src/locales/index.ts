// @clube/shared/locales — catálogos de i18n.
//
// `pt` é o padrão do clube e o fallback; `en` é o segundo locale
// (`CLAUDE.md`). Os catálogos vivem em `shared` porque a mesma chave é usada
// pelo app e por qualquer outro consumidor futuro — e porque a paridade de
// chaves precisa de um teste, que mora aqui.

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

/**
 * Os catálogos **EAGER** — os que o `i18next.init` recebe, e portanto os que
 * vão no chunk de entrada do PWA.
 *
 * ⚠️ **O nome diz "eager" porque `en` NÃO está aqui (Tarefa 29a, decisão C).**
 * Ele custava 9.583 B no chunk de entrada de todo mundo, inclusive de quem
 * nunca vai vê-lo: agora chega por `import('@clube/shared/locales/en')` quando
 * (e só quando) alguém escolhe inglês. Chamar isto de `resources` com um só
 * locale dentro seria a prosa que mente — quem lesse concluiria que o app tem
 * um idioma.
 *
 * `en` continua exportado por este barril (é dele que os testes de paridade
 * leem) e por um subpath próprio (é dele que o `import()` carrega). O
 * re-export é tree-shaken: medido, ele não custa byte nenhum.
 */
export const eagerResources = {
  pt: { translation: pt },
};

export type TranslationCatalog = typeof pt;

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}
