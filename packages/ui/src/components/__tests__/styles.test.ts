import { describe, expect, it } from 'vitest';

import { MIN_TOUCH_TARGET_PX, SPACING_STEP_PX } from '../styles';

/**
 * O PISO DE TOQUE, e por que ele precisava de um teste próprio.
 *
 * ⚠️ MEDIDO na rodada de correção da Tarefa 13: os testes de `Button` e de
 * `ListItem` provam a COERÊNCIA entre a classe e o número
 * (`min-h-11` ↔ 11 × `SPACING_STEP_PX`) e comparam o resultado com
 * `MIN_TOUCH_TARGET_PX` — mas os dois lados da comparação leem as MESMAS
 * constantes. Consequência: dois mutantes de uma linha sobreviviam aos 100
 * testes do pacote.
 *
 * - `MIN_TOUCH_TARGET_PX` 44 → 36: o piso desce, e `min-h-9` passaria a ser
 *   "acima do mínimo". A decisão F (44px, o mínimo do Apple HIG) virava
 *   opinião de quem editar a linha.
 * - `SPACING_STEP_PX` 4 → 8: pior, porque é a ÚNICA ponte entre "classe" e
 *   "px" em toda a fatia. Com 8, `min-h-11` "vale" 88px e um botão de 44px
 *   real passaria por 88 — e um `min-h-6` (24px de verdade) passaria pelo piso.
 *
 * Aqui os dois números são PINADOS pelo valor. E o valor de `SPACING_STEP_PX`
 * não é escolha nossa: ele é o `--spacing` do Tailwind v4 (`0.25rem` = 4px na
 * raiz default). Quem prova ISSO — contra o CSS compilado, que é a verdade — é
 * `packages/app/src/__tests__/ui-source-scan.test.ts`, que é o único teste do
 * repositório com o CSS de verdade na mão. Os dois juntos fecham a tautologia:
 * lá se prova que o passo é 4px, aqui se prova que o código acredita nisso.
 */
describe('the touch-target floor (decision F, rules 9 and 22)', () => {
  it('keeps the floor at the 44px of the Apple HIG', () => {
    // "Escrever no celular, à noite, na cama, com uma mão": botão menor que
    // isso vira botão de precisão, e à noite ninguém tem precisão.
    expect(MIN_TOUCH_TARGET_PX).toBe(44);
  });

  it('reads a Tailwind spacing step of 4px, which is what makes min-h-<n> readable', () => {
    // `--spacing: 0.25rem` × 16px/rem = 4px. Não é um número nosso para
    // ajustar: é o do Tailwind, e o CSS compilado é quem o confirma.
    expect(SPACING_STEP_PX).toBe(4);
  });

  it('makes min-h-11 the smallest class that clears the floor', () => {
    // O elo que dá SENTIDO aos dois números acima, e o motivo de o `Button`
    // usar `min-h-11` e não `min-h-10`: 10 × 4 = 40px, abaixo do piso.
    expect(10 * SPACING_STEP_PX).toBeLessThan(MIN_TOUCH_TARGET_PX);
    expect(11 * SPACING_STEP_PX).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });
});
