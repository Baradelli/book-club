/**
 * ⚠️ **O VOCABULÁRIO DA VISIBILIDADE RESTRITA — UMA LISTA SÓ, PARA AS TRÊS
 * GUARDAS.**
 *
 * `docs/adr/0002-visibilidade-total-no-clube.md`: *"Não existe conteúdo privado
 * dentro de um clube. (…) O filtro `Tudo · Minhas · de <pessoa>` é
 * **navegação**: uma forma de olhar o mesmo acervo. Ele nunca deve ser
 * apresentado, rotulado ou explicado como privacidade."*
 *
 * ⚠️ **POR QUE ELA SUBIU PARA `shared`, e é a metade que faltava do §7.9.**
 *
 * A partição do ADR 0002 tinha três guardas e **duas** superfícies:
 *
 * - **desenho e ícone importado** são propriedade da FONTE
 *   (`ui/src/__tests__/adr-0002-iconography.test.ts` e o espelho dele no `app`);
 * - **vocabulário RENDERIZADO** é DOM
 *   (`app/src/pages/__tests__/adr-0002-dom.ts`);
 * - **vocabulário de CATÁLOGO** … não existia.
 *
 * E a consequência foi MEDIDA nesta rodada: `person: 'By {{name}} (only you can
 * see this)'` plantado no catálogo **`en`** dava **0 acusadores em 1.146
 * testes** — a MESMA frase em `pt` dava **12**. Todo teste de tela pina `pt` (o
 * `navigator.language` do jsdom é `en-US`, e sem o pino as asserções mudariam
 * com o ambiente), então **metade dos idiomas que o app declara suportar nunca
 * era varrida**. O eixo anti-culpa já tinha subido em `guilt-terms.ts` pela
 * Tarefa 16 — este é o irmão dele, e a Tarefa 16 o consertou pela metade.
 *
 * A sequência que isto fecha é concreta e é a mais tentadora de todas: "By
 * Maria" parece pedir explicação, alguém escreve *"only you can see this"* na
 * chave `en` do filtro, o app roda em inglês, o leitor de tela fala a frase — e
 * a suíte inteira fica verde.
 *
 * ⚠️ **IMPORTADA, NUNCA COPIADA** (lição nº 3 do MVP 1, e o `guilt-terms.ts` é o
 * molde exato): a varredura de catálogo, a de DOM do `app` e a de fonte do `app`
 * consomem **esta** lista. Ela foi uma cópia até esta rodada — morava em
 * `app/src/pages/__tests__/adr-0002-dom.ts` —, e duas listas com o mesmo nome e
 * forças diferentes é exatamente como o `GUILT_TERMS` viveu até a Tarefa 19
 * descobrir que as duas tinham divergido na primeira correção.
 *
 * Mora em `__tests__/` de propósito: é vocabulário de teste, e nada em
 * `__tests__/` embarca no PWA. É o mesmo endereço do `guilt-terms.ts`, exportado
 * por `@clube/shared/adr-0002`.
 */

/**
 * Radicais, não palavras (a mesma disciplina do `GUILT_TERMS`), já sem acento e
 * em minúscula — quem varre passa o texto por `withoutDiacritics` primeiro.
 *
 * Os dois idiomas, porque o vocabulário do ADR não é do `pt`: uma tela que
 * escrevesse "Only you can see this" erraria igual.
 *
 * ⚠️ **CADA RADICAL FOI MEDIDO CONTRA OS DOIS CATÁLOGOS INTEIROS** antes de
 * fechar, e a razão é a lição da Tarefa 19: o radical `tras` (largo demais)
 * casava dentro de "ou**tras**", e a guarda passou a **mandar no texto do
 * produto** — que é o contrário do que ela existe para fazer. Zero falso
 * positivo em `pt` e `en` na medição desta rodada; se um radical novo vetar
 * palavra legítima, **meça antes de afrouxar**.
 */
export const PRIVACY_TERMS: readonly string[] = [
  // Iconografia e rótulo, em português
  'cadead', // cadeado · cadeados
  'privad', // privado · privada · privadas
  'secret',
  'oculto',
  'oculta',
  'so voc', // "só você vê", já sem acento
  'somente voc',
  'apenas voc',
  'visivel para',
  'visivel so',
  // Inglês
  'private',
  'only you',
  'visible to',
  'hidden from',
];

/**
 * ⚠️ ANCORADO À ESQUERDA (`\b` antes do radical), e isso foi MEDIDO: um
 * `includes` cru acusa `block`/`unlock`/`SCROLL_LOCK_CLASS` e meia dúzia de
 * identificadores legítimos quando a superfície é CÓDIGO — e é a mesma âncora
 * que deixa "isso você" passar (o `so voc` de "is|so voce" vem depois de um
 * caractere de palavra) e continua pegando "só você".
 *
 * Sem âncora à DIREITA, para o radical pegar o plural.
 */
export function mentionsPrivacyTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`\\b${escaped}`, 'u').test(text);
}
