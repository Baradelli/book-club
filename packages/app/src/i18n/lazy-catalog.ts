import type { Locale, TranslationCatalog } from '@clube/shared/locales';
import type { i18n as I18nInstance } from 'i18next';

/**
 * O CATÁLOGO `en` SOB DEMANDA (Tarefa 29a) — o assunto inteiro, num arquivo.
 *
 * `eagerResources` tem só o `pt`, o padrão e o `fallbackLng` do clube. O `en`
 * mora num chunk próprio e chega por `import()` quando (e só quando) alguém
 * escolhe inglês, no boot ou no seletor. Medido: **8.923 B** a menos no chunk
 * de entrada e **8,72 KiB** a menos no precache do service worker, para quem
 * lê em português — e toda chave nova do MVP 3 passa a custar a entrada UMA
 * vez, não duas.
 *
 * ⚠️ **Ele saiu do `i18n.ts` na rodada de correção, e a ORDEM foi essa de
 * propósito** (lição nº 15 do MVP 2): os acusadores nasceram primeiro, a
 * extração veio depois. Extrair um helper sem acusador faz ele PARECER
 * coberto. O `i18n.ts` guarda a escolha e a persistência do locale; aqui mora
 * "como o segundo catálogo chega e quem manda na tela quando ele demora".
 *
 * ⚠️ **O alvo do `import()` é o SUBPATH, nunca o barril.** Apontar para
 * `@clube/shared/locales` faria o Rollup ver o binding `en` usado e trazê-lo
 * de volta para a entrada — sem chunk nenhum, sem erro nenhum, e a fatia
 * desfeita em silêncio. O acusador é `src/__tests__/bundle-guard.test.ts`.
 */
export type EnCatalogImport = () => Promise<{ en: TranslationCatalog }>;

const importEnCatalog: EnCatalogImport = () =>
  import('@clube/shared/locales/en');

/** O único locale preguiçoso — o `pt` é eager por ser padrão e fallback. */
const LAZY_LOCALE: Locale = 'en';

/**
 * O estado por INSTÂNCIA, e não por módulo: cada teste de tela cria a sua com
 * `createI18n`, e um contador de módulo faria um teste enxergar o catálogo que
 * outro carregou.
 */
interface LazyCatalogs {
  readonly importEn: EnCatalogImport;
  /** A carga em voo, para dois pedidos simultâneos não virarem dois `fetch`. */
  pending: Promise<void> | null;
  /** O último idioma PEDIDO — quem decide a tela quando a rede atrasa. */
  requested: Locale | null;
}

const lazyCatalogs = new WeakMap<I18nInstance, LazyCatalogs>();

function lazyCatalogsOf(instance: I18nInstance): LazyCatalogs {
  const existing = lazyCatalogs.get(instance);
  if (existing !== undefined) return existing;

  const created: LazyCatalogs = {
    importEn: importEnCatalog,
    pending: null,
    requested: null,
  };
  lazyCatalogs.set(instance, created);
  return created;
}

/**
 * Diz a esta instância por onde buscar o catálogo preguiçoso.
 *
 * O importador é parâmetro para poder ser CONTADO nos testes (§7.3): "não
 * carregou" e "carregou e deu no mesmo" são indistinguíveis pelo resultado, e
 * a diferença entre as duas é um pedido de rede por toque no seletor.
 */
export function registerCatalogLoader(
  instance: I18nInstance,
  importEn: EnCatalogImport,
): void {
  lazyCatalogs.set(instance, { importEn, pending: null, requested: null });
}

/**
 * ⚠️ **`ensureEnCatalog`, e não `ensureCatalog(locale)`** — o nome mentia, e a
 * armadilha era de TERCEIRO locale.
 *
 * A assinatura antiga prometia "garanta o catálogo deste locale" e o corpo
 * chamava sempre `importEn()`, registrando `module.en` **sob o locale
 * recebido**. Hoje isso é inalcançável (só `en` é preguiçoso), então nenhum
 * mutante consegue matá-lo — e é justamente por isso que era perigoso: no dia
 * em que alguém acrescentar `es`, `changeLocale(i18n, 'es')` registraria o
 * catálogo INGLÊS sob `es`, com zero acusadores. É a mesma prosa-que-mente que
 * a decisão C consertou um nível acima (`resources` → `eagerResources`).
 *
 * Quem tornar um segundo catálogo preguiçoso indexa o importador por locale —
 * e aí a assinatura genérica volta, com um teste que a exige.
 */
function ensureEnCatalog(instance: I18nInstance): Promise<void> {
  // Já está aqui? Não custa rede: é o `en` que já foi baixado uma vez nesta
  // sessão (regra 8).
  if (instance.hasResourceBundle(LAZY_LOCALE, 'translation'))
    return Promise.resolve();

  const state = lazyCatalogsOf(instance);
  state.pending ??= state
    .importEn()
    .then((module) => {
      instance.addResourceBundle(LAZY_LOCALE, 'translation', module.en);
      state.pending = null;
    })
    .catch((error: unknown) => {
      // Decisão G: rede caída no meio de uma troca de idioma não é motivo para
      // quebrar o app. O `fallbackLng` já é `pt`, então a pessoa vê conteúdo —
      // e a memória guarda SUCESSO, não fracasso, senão ela ficaria sem inglês
      // até recarregar. ⚠️ Sem este `.catch` o boot em inglês offline vira um
      // `unhandledRejection`, porque quem o dispara é um `void`.
      state.pending = null;
      console.error('[i18n] failed to load the en catalog', error);
    });

  return state.pending;
}

/**
 * Troca o idioma — carregando o catálogo antes, se ele ainda não estiver aqui.
 *
 * ⚠️ **O `changeLanguage` depois do `addResourceBundle` não é redundância**
 * (decisão F): o `addResourceBundle` guarda o pacote e não avisa ninguém — o
 * `react-i18next` só re-renderiza no evento `languageChanged`. Sem ele a tela
 * fica em `pt` até o próximo clique, que é indistinguível de "a tradução não
 * chegou".
 */
export async function changeLocale(
  instance: I18nInstance,
  locale: Locale,
): Promise<void> {
  const state = lazyCatalogsOf(instance);
  state.requested = locale;

  // Só o `en` é preguiçoso; o `pt` é eager e já veio no chunk de entrada.
  // Acusadores dos dois lados: chamar SEMPRE quebra a regra 6 (boot em `pt`
  // passa a baixar), e nunca chamar quebra as regras 5, 7 e 8.
  if (locale === LAZY_LOCALE) await ensureEnCatalog(instance);

  /*
    ⚠️ **QUEM PEDIU POR ÚLTIMO MANDA.** Dois toques no seletor com rede lenta:
    a carga do `en` volta DEPOIS de a pessoa já ter voltado para o português.
    Sem esta linha o `changeLanguage('en')` atrasado vence, a tela vira inglês
    sozinha e o `<select>` (que lê `resolvedLanguage`) pula de volta para
    "English" — enquanto o `persistLocale('pt')` já gravou `pt`. O `WeakMap`
    não protege disto: ele cuida de QUANTOS fetch, não de quem escreve por
    último.
  */
  if (state.requested !== locale) return;

  await instance.changeLanguage(locale);
}
