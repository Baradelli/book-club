/**
 * O que os seis componentes compartilham. Não é "utilitário genérico": é o
 * pouco que, repetido, sairia de sincronia.
 */

/**
 * Decisão F: 44px é o mínimo do Apple HIG, e é o que o princípio "escrever no
 * celular, à noite, na cama, com uma mão" exige — botão menor que isso vira
 * botão de precisão, e à noite ninguém tem precisão.
 *
 * O número mora aqui, e não solto em cada tabela de tamanho, porque é ele que
 * os testes das regras 9 e 22 comparam.
 */
export const MIN_TOUCH_TARGET_PX = 44;

/**
 * A escala de espaçamento do Tailwind v4 é `calc(var(--spacing) * n)`, e
 * `--spacing` vale `0.25rem` — 4px na raiz default. É a conversão que permite
 * ler `min-h-11` como 44px sem medir layout (jsdom não tem layout nenhum).
 */
export const SPACING_STEP_PX = 4;

/**
 * Decisão G: foco visível SEMPRE, inclusive no mobile.
 *
 * `outline-hidden` e não o `outline: none` cru: no Tailwind v4 o `outline-hidden`
 * apaga o anel só para quem vê, e mantém o outline no modo de contraste
 * forçado do Windows — onde `outline: none` deixa o controle sem nenhuma
 * indicação de foco.
 *
 * `focus-visible` e não `focus`: o anel aparece para quem navega por teclado e
 * não pisca no toque, que é o que faz alguém querer removê-lo por estética.
 *
 * ============================================================================
 * O HALO ENTROU EM 2026-09-20 — o §A.6 LITERAL, por decisão do dono
 * ============================================================================
 *
 * Os critérios de aceite "válidos para toda fase" do `docs/new-ui.md` pedem
 * DUAS coisas na mesma frase: "`outline` nunca removido" **e** "anel de 3px
 * `color-mix(in oklch, var(--accent) 18%, transparent)`".
 *
 * ⚠️ MEDIDO: o halo de 18% **sozinho** dá ~1,4:1 contra o creme — ele não é
 * visível por si. Ele é halo **sobre** o contorno sólido, e é a soma dos dois
 * que fecha a frase. Entregar só o `color-mix()` seria entregar um foco que
 * não se vê. O acusador é `src/__tests__/focus-ring.test.ts`, e o teste
 * `never ships the halo WITHOUT the solid outline` existe exatamente para que
 * as duas metades não possam ser separadas.
 *
 * O halo sai de TOKEN e não de valor arbitrário:
 * (`--ring-halo`), derivado de `--accent` por `color-mix()`. Um hex aqui seria
 * a cor de ação duplicada num segundo lugar.
 *
 * ⚠️ E O CONTORNO PASSOU A SEGUIR `--accent`, não `--gold`: no tema claro isso
 * vai de 4,16:1 para 11,91:1 contra a página. A medição completa está no
 * `theme.css`, ao lado do token.
 */
export const FOCUS_RING =
  'outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:ring-3 focus-visible:ring-focus-halo';
