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
 * `outline-hidden` e não `outline-none`: no Tailwind v4 o `outline-hidden`
 * apaga o anel só para quem vê, e mantém o outline no modo de contraste
 * forçado do Windows — onde `outline: none` deixa o controle sem nenhuma
 * indicação de foco.
 *
 * `focus-visible` e não `focus`: o anel aparece para quem navega por teclado e
 * não pisca no toque, que é o que faz alguém querer removê-lo por estética.
 */
export const FOCUS_RING =
  'outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';
