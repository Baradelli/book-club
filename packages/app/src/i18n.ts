import type { StorageLike } from '@clube/shared/client';
import {
  DEFAULT_LOCALE,
  eagerResources,
  FALLBACK_LOCALE,
  isLocale,
  type Locale,
  type TranslationCatalog,
} from '@clube/shared/locales';
import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { browserStorage } from './env';
import {
  changeLocale,
  type EnCatalogImport,
  registerCatalogLoader,
} from './i18n/lazy-catalog';

/**
 * O carregador preguiçoso do `en` mora em `./i18n/lazy-catalog` — reexportado
 * aqui porque `App.tsx` e os testes falam com o i18n por UMA porta só, e
 * mover o arquivo não pode virar churn em quem só troca de idioma.
 */
export { changeLocale, type EnCatalogImport } from './i18n/lazy-catalog';

/**
 * i18n do app. Os catálogos vivem em `@clube/shared/locales` — back e front
 * importam do mesmo lugar, e a paridade de chaves `pt`/`en` tem teste lá.
 *
 * Nenhum texto solto nas telas: tudo via `t('chave')`, com chaves semânticas
 * em inglês (`CLAUDE.md`).
 */

/**
 * O `t()` TIPADO pelo catálogo — o lado CHAMADOR da regra 14.
 *
 * A paridade `pt`/`en` já tinha duas portas (o `typeof pt` no `en` e o teste
 * recursivo). A paridade **catálogo ↔ chamador** não tinha nenhuma:
 * `t('app.nomeErrado')` compilava, passava na suíte, e o i18next renderizava a
 * PRÓPRIA CHAVE na tela — exatamente o sintoma que a regra 14 existe para
 * impedir, só que do outro lado.
 *
 * Com esta declaração, chave que não existe no catálogo é erro de compilação.
 * Consequência de propósito: apagar uma chave do `pt` quebra o `tsc` em todo
 * lugar que a usava, em vez de quebrar a tela em silêncio.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: TranslationCatalog };
  }
}
export const LOCALE_STORAGE_KEY = 'clube.locale';

/**
 * A escolha da pessoa vence; depois o idioma do navegador, se for um que
 * temos; senão o padrão do clube, que é `pt`.
 */
export function pickInitialLocale(
  stored: string | null,
  preferredLanguages: readonly string[],
): Locale {
  if (isLocale(stored)) return stored;

  for (const language of preferredLanguages) {
    // 'pt-BR' → 'pt'. O navegador manda a região junto; nossos catálogos não
    // têm região.
    const base = language.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }

  return DEFAULT_LOCALE;
}

function readStoredLocale(storage: StorageLike): string | null {
  try {
    return storage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistLocale(
  locale: Locale,
  storage: StorageLike = browserStorage,
): void {
  try {
    storage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Sem armazenamento a escolha vale só nesta sessão.
  }
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages ?? [navigator.language];
}

/**
 * ⚠️ **CADA INSTÂNCIA RECEBE A SUA CÓPIA, DE DOIS NÍVEIS, e os dois são
 * medidos.**
 *
 * O `addResourceBundle` escreve DENTRO do objeto que o `init` recebeu em
 * `resources` — e `eagerResources` é um só, exportado por
 * `@clube/shared/locales`. Sem cópia nenhuma (**7 acusadores**), a primeira
 * instância que carregasse o `en` deixava o catálogo lá dentro e toda
 * instância criada depois já nascia com ele: o `hasResourceBundle` da regra 8
 * passava a responder "já tenho" para um catálogo que aquela instância nunca
 * baixou.
 *
 * O SEGUNDO nível (`{ ...namespaces }`) é carga útil e tinha ficado sem dono:
 * medido na rodada de correção, a cópia rasa de um nível dava **zero**
 * acusadores, porque o `addResourceBundle` grava `data[lng][ns] = pack` e o
 * objeto por locale seria compartilhado. Hoje dá **5**, e o dono é
 * `does NOT leak a bundle WRITTEN OVER pt into the next instance`.
 *
 * ⚠️ **O TERCEIRO nível continua compartilhado — dívida registrada, não
 * consertada:** o objeto de tradução em si é o mesmo `pt` em todas as
 * instâncias, e um `addResourceBundle(..., { deep: true, overwrite: true })`
 * mergiria DENTRO dele e vazaria igual. É inalcançável hoje: o único chamador
 * é o carregador do `en`, que grava um namespace inexistente e sem `deep`.
 */
function eagerResourcesCopy(): Record<
  string,
  { translation: TranslationCatalog }
> {
  const copy: Record<string, { translation: TranslationCatalog }> = {};
  for (const [locale, namespaces] of Object.entries(eagerResources)) {
    copy[locale] = { ...namespaces };
  }
  return copy;
}

export function createI18n(
  storage: StorageLike = browserStorage,
  importEn?: EnCatalogImport,
): I18nInstance {
  const instance = i18next.createInstance();
  const initialLocale = pickInitialLocale(
    readStoredLocale(storage),
    browserLanguages(),
  );

  if (importEn !== undefined) registerCatalogLoader(instance, importEn);

  void instance.use(initReactI18next).init({
    resources: eagerResourcesCopy(),
    lng: initialLocale,
    fallbackLng: FALLBACK_LOCALE,
    interpolation: { escapeValue: false },
    // Chaves são `a.b.c`; nada de plural por namespace nesta fatia.
    defaultNS: 'translation',
  });

  // Quem já abre em inglês (escolha guardada ou navegador) também precisa do
  // catálogo — só o seletor deixaria essa pessoa em português para sempre,
  // sem nada acusando (decisão E).
  void changeLocale(instance, initialLocale);

  return instance;
}

export const i18n = createI18n();
