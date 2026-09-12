import { REMINDER_TIME_PATTERN } from '@clube/shared';
import { describe, expect, it } from 'vitest';

import { InvalidSettingsError } from '../errors';
import { assertReminderTime, DEFAULT_SETTINGS } from '../settings';

/**
 * ⚠️ **REGRA 4 — `reminderTime` é validado no DOMÍNIO, não só na borda**
 * (decisão D).
 *
 * A borda é a **primeira** barreira, não a única — o mesmo argumento do
 * `assertHighlightColor`. E aqui o preço de errar tem nome: o dispatcher da
 * Tarefa 37 faz `target.split(':').map(Number)` neste valor, e um valor torto
 * ali é `NaN` na janela — o lembrete de alguém simplesmente nunca sai, sem
 * erro e sem ninguém notar.
 *
 * ⚠️ **UM DONO PARA O REGEX.** O `assertReminderTime` importa o
 * `REMINDER_TIME_PATTERN` de `@clube/shared`, que é o mesmo objeto que o
 * `reminderTimeSchema` da borda usa. Duas barreiras não são duas regras: um
 * segundo regex escrito à mão aqui seria a lição nº 3 do MVP 1 outra vez, e a
 * divergência apareceria no dia em que um dos dois aceitasse `"7:00"`.
 */

/** Os cinco que a regra 4 nomeia, mais os que eles representam. */
const REFUSED = [
  '25:00',
  '9:00',
  '21:5',
  '',
  'abc',
  '24:00',
  '21:60',
  '21:00:00',
  ' 21:00',
  '21:00 ',
  '2:00',
] as const;

describe('assertReminderTime', () => {
  it.each(['00:00', '09:05', '21:00', '23:59'])('accepts %s', (value) => {
    expect(assertReminderTime(value)).toBe(value);
  });

  it.each(REFUSED)('refuses %s', (value) => {
    expect(() => assertReminderTime(value)).toThrow(InvalidSettingsError);
  });

  /** Não é só formato: o que não é string nenhuma também é recusado. */
  it.each([null, undefined, 2100, {}, ['21:00']])('refuses %s', (value) => {
    expect(() => assertReminderTime(value)).toThrow(InvalidSettingsError);
  });

  /**
   * ⚠️ **É O MESMO OBJETO da borda, e o teste é por IDENTIDADE.** Um regex
   * copiado aqui passaria em tudo acima e divergiria silenciosamente no dia em
   * que um dos dois mudasse — é a fidelidade afirmada em comentário que o
   * §7.1 diz que o próximo refactor apaga.
   */
  it('validates with the very pattern the border uses', () => {
    expect(REMINDER_TIME_PATTERN.test('21:00')).toBe(true);
    expect(REMINDER_TIME_PATTERN.test('9:00')).toBe(false);
    // E o par que liga os dois: o que o pattern aceita, o assert aceita.
    for (const value of ['00:00', '23:59']) {
      expect(REMINDER_TIME_PATTERN.test(value)).toBe(true);
      expect(assertReminderTime(value)).toBe(value);
    }
  });

  /**
   * A mensagem do 400 — a única publicada (§6.2) — diz o formato e **não ecoa
   * o valor recusado**, pelo motivo do `assertHighlightColor`.
   */
  it('says the format and never echoes what came', () => {
    let message = '';
    try {
      assertReminderTime('vinte-e-uma-horas');
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('HH:mm');
    expect(message).not.toContain('vinte-e-uma-horas');
  });
});

describe('DEFAULT_SETTINGS', () => {
  /**
   * ⚠️ **O padrão da Tarefa 03 tem de passar pelo portão da Tarefa 36.** É a
   * precondição do `getSettings` (regra 1): ele devolve o `DEFAULT_SETTINGS`
   * quando não há linha, e um padrão que o próprio domínio recusaria seria uma
   * leitura que não sobrevive a uma escrita.
   */
  it('has a reminderTime the domain itself accepts', () => {
    expect(assertReminderTime(DEFAULT_SETTINGS.reminderTime)).toBe('21:00');
  });
});
