import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CLOCK_BASE_ISO,
  CLOCK_TICK_MS,
  installAdvancingClock,
} from '../advancing-clock';

/**
 * A SUÍTE DO MECANISMO, e é ela que impede os dois acusadores de virarem
 * identidade (§7.8).
 *
 * `create-highlight.test.ts` e `archive-highlight.test.ts` provam "um `new
 * Date()` só" **através** deste stub. Se ele parasse de andar, os dois testes
 * voltariam a comparar dois instantes iguais por construção e ficariam verdes
 * com o mutante — exatamente o estado que a auditoria mediu (0 acusadores). A
 * precondição "o relógio ANDA" é o primeiro teste daqui, e é de propósito.
 */
describe('installAdvancingClock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** ⚠️ A PRECONDIÇÃO: sem ela, os acusadores comparam vazio com vazio. */
  it('gives two consecutive reads two different instants', () => {
    const clock = installAdvancingClock();

    const first = new Date().getTime();
    const second = new Date().getTime();

    expect(second - first).toBe(CLOCK_TICK_MS);
    expect(clock.reads).toBe(2);
    clock.restore();
  });

  it('starts from CLOCK_BASE_ISO and hands the nth read the instant at(n)', () => {
    const clock = installAdvancingClock();

    const first = new Date();
    const second = new Date();

    expect(clock.at(1)).toBe(Date.parse(CLOCK_BASE_ISO) + CLOCK_TICK_MS);
    expect(first.getTime()).toBe(clock.at(1));
    expect(second.getTime()).toBe(clock.at(2));
    clock.restore();
  });

  /**
   * `new Date(valor)` **não** consome o relógio: é o que o `clone` dos fakes faz
   * a cada leitura, e cobrá-lo de `reads` deixaria o contador inútil como
   * acusador.
   */
  it('leaves a read with an argument untouched, and does not count it', () => {
    const clock = installAdvancingClock();

    const fromIso = new Date('2020-05-05T10:00:00.000Z');
    const fromMillis = new Date(1234567890);
    const fromDate = new Date(fromIso);

    expect(fromIso.toISOString()).toBe('2020-05-05T10:00:00.000Z');
    expect(fromMillis.getTime()).toBe(1234567890);
    expect(fromDate.getTime()).toBe(fromIso.getTime());
    expect(clock.reads).toBe(0);
    clock.restore();
  });

  // As instâncias continuam sendo `Date` de verdade: o `structuredClone` do
  // fake, o `getTime` e o `toISOString` dependem disso.
  it('still produces real Date instances', () => {
    const RealDate = Date;
    const clock = installAdvancingClock();

    const stamp = new Date();

    expect(stamp).toBeInstanceOf(RealDate);
    expect(stamp.toISOString()).toBe(new RealDate(clock.at(1)).toISOString());
    clock.restore();
  });

  it('gives the real clock back on restore', () => {
    const clock = installAdvancingClock();
    const stubbed = new Date().getTime();

    clock.restore();
    const afterRestore = new Date().getTime();

    expect(stubbed).toBe(clock.at(1));
    expect(Math.abs(afterRestore - Date.now())).toBeLessThan(5_000);
    expect(afterRestore).not.toBe(clock.at(2));
    // O contador congela: nada mais passa pelo stub.
    expect(clock.reads).toBe(1);
  });
});
