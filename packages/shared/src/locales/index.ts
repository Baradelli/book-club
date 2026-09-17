// @clube/shared/locales — o catálogo de i18n.
//
// ⚠️ **UM IDIOMA SÓ: português** (`docs/ACEITE-MVP.md`, MVP 1, pergunta 7,
// respondida em 2026-09-17: *"só português — apagar o inglês"*). Até a Tarefa
// 38d havia um segundo catálogo (`en`) e a maquinaria para carregá-lo sob
// demanda; os dois saíram inteiros.
//
// ⚠️ **E NÃO SOBROU NENHUM `SUPPORTED_LOCALES`, `Locale`, `isLocale`,
// `DEFAULT_LOCALE` nem `FALLBACK_LOCALE`, de propósito.** Uma lista de um item
// só — `['pt']` — é um tipo que mente: ela faz o próximo leitor concluir que
// há escolha, e a próxima fatia escrever o ramo do idioma que ninguém escolhe.
// Quem reabrir a decisão escreve os dois de volta, e o diff mostra.
//
// O catálogo vive em `shared` porque a mesma chave é usada pelo app e pelo
// backend (as frases do push são montadas lá), e porque as guardas de
// vocabulário — anti-culpa (§1 do plano) e ADR 0002 — varrem este arquivo, que
// é onde a propriedade é decidível (§7.9).

import { pt } from './pt';

export { pt } from './pt';

/**
 * O que o `i18next.init` recebe em `resources` — e, portanto, o que vai no
 * chunk de entrada do PWA.
 *
 * ⚠️ **Ele se chamou `eagerResources` entre as Tarefas 29a e 38d**, porque
 * havia um catálogo preguiçoso ao lado. Com um idioma só esse nome passou a
 * prometer um irmão que não existe — e `resources` é o termo do i18next para
 * exatamente esta coisa.
 */
export const resources = {
  pt: { translation: pt },
};

export type TranslationCatalog = typeof pt;
