import { resources, type TranslationCatalog } from '@clube/shared/locales';
import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * i18n do app. O catálogo vive em `@clube/shared/locales` — back e front
 * importam do mesmo lugar, e as guardas de vocabulário moram lá.
 *
 * Nenhum texto solto nas telas: tudo via `t('chave')`, com chaves semânticas
 * em inglês (`CLAUDE.md`).
 *
 * ⚠️ **UM IDIOMA SÓ, e por isso este arquivo encolheu na Tarefa 38d**
 * (`docs/ACEITE-MVP.md`, MVP 1, pergunta 7: *"só português — apagar o
 * inglês"*). Saíram daqui, inteiros:
 *
 * - `pickInitialLocale` — a escolha entre o que estava guardado, o idioma do
 *   navegador e o padrão do clube;
 * - `persistLocale` e `LOCALE_STORAGE_KEY` — a preferência gravada em
 *   `localStorage`;
 * - o reexport do `changeLocale` e do `EnCatalogImport` (o módulo
 *   `./i18n/lazy-catalog` foi apagado com a Tarefa 29a inteira);
 * - `eagerResourcesCopy`, a cópia de dois níveis do `resources`. Ela existia
 *   porque o `addResourceBundle` do carregador preguiçoso escrevia DENTRO do
 *   objeto compartilhado e vazava o catálogo de uma instância para a
 *   seguinte. Sem carregador preguiçoso nada mais chama `addResourceBundle`,
 *   e a cópia passou a defender de um escritor que não existe.
 *
 * ⚠️ **E `createI18n` deixou de receber o `storage`**: ele o lia só para
 * descobrir o idioma guardado. Os cinco arquivos de teste que pinavam
 * `'clube.locale': 'pt'` passaram a chamar `createI18n()` — o pino existia
 * porque o `navigator.language` do jsdom é `en-US`, e não há mais o que pinar.
 */

/**
 * O `t()` TIPADO pelo catálogo — o lado CHAMADOR da regra 14.
 *
 * Sem esta declaração, `t('app.nomeErrado')` compila, passa na suíte, e o
 * i18next renderiza a PRÓPRIA CHAVE na tela. Com ela, chave que não existe no
 * catálogo é erro de compilação — e apagar uma chave do `pt` quebra o `tsc` em
 * todo lugar que a usava, em vez de quebrar a tela em silêncio.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: TranslationCatalog };
  }
}

/**
 * O idioma do clube — e o único.
 *
 * ⚠️ Ele é uma constante local e não um export de `@clube/shared/locales`, de
 * propósito: um `DEFAULT_LOCALE` exportado é a metade de um `SUPPORTED_LOCALES`
 * — "padrão" só quer dizer alguma coisa onde há escolha. Aqui ele é o que o
 * i18next precisa receber em `lng`, e a chave de `resources` que lhe
 * corresponde é provada pelo `i18n.test.ts`, que lê o `t()` de um componente
 * React de verdade.
 */
const LANGUAGE = 'pt';

export function createI18n(): I18nInstance {
  const instance = i18next.createInstance();

  void instance.use(initReactI18next).init({
    resources,
    lng: LANGUAGE,
    fallbackLng: LANGUAGE,
    interpolation: { escapeValue: false },
    // Chaves são `a.b.c`; nada de plural por namespace nesta fatia.
    defaultNS: 'translation',
  });

  return instance;
}

export const i18n = createI18n();
