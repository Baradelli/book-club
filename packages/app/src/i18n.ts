import type { StorageLike } from '@clube/shared/client';
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  isLocale,
  type Locale,
  resources,
  type TranslationCatalog,
} from '@clube/shared/locales';
import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { browserStorage } from './env';

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

export function createI18n(
  storage: StorageLike = browserStorage,
): I18nInstance {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng: pickInitialLocale(readStoredLocale(storage), browserLanguages()),
    fallbackLng: FALLBACK_LOCALE,
    interpolation: { escapeValue: false },
    // Chaves são `a.b.c`; nada de plural por namespace nesta fatia.
    defaultNS: 'translation',
  });
  return instance;
}

export const i18n = createI18n();
