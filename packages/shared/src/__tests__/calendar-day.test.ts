import { describe, expect, it } from 'vitest';

import { isCalendarDay, isClubMonth } from '../calendar-day';

// Validação de data é o lugar onde erro passa batido: um regex frouxo aceita
// 2026-02-30, e o bug só aparece quando o admin cadastra o plano de fevereiro.
describe('isCalendarDay', () => {
  it.each([
    ['a plain day', '2026-10-05'],
    ['the first day of the year', '2026-01-01'],
    ['the last day of the year', '2026-12-31'],
    ['a leap day in a leap year', '2028-02-29'],
    ['the last day of a 30-day month', '2026-04-30'],
  ])('accepts %s (%s)', (_label, value) => {
    expect(isCalendarDay(value)).toBe(true);
  });

  it.each([
    ['a single-digit month without padding', '2026-2-5'],
    ['a single-digit day without padding', '2026-10-5'],
    ['a day that does not exist', '2026-02-30'],
    ['the 31st of a 30-day month', '2026-04-31'],
    ['a leap day in a common year', '2027-02-29'],
    ['month 13', '2026-13-01'],
    ['month 00', '2026-00-10'],
    ['day 00', '2026-10-00'],
    ['day 32', '2026-10-32'],
    ['the brazilian format', '05/10/2026'],
    ['an empty string', ''],
    ['an ISO instant', '2026-10-05T00:00:00Z'],
    ['a day with trailing whitespace', '2026-10-05 '],
    ['a club month', '2026-10'],
    ['prose', 'amanhã'],
  ])('rejects %s (%s)', (_label, value) => {
    expect(isCalendarDay(value)).toBe(false);
  });

  // A regra gregoriana COMPLETA, não só "divisível por 4". Sem os casos de
  // século, trocar `% 400` por `% 100` na implementação passa despercebido e
  // 1900-02-29 volta a ser aceito. Esta tabela é a referência que a borda
  // (Zod, Tarefa 07) e a tela (Tarefa 20) vão reescrever — deixe-a completa.
  describe('the full Gregorian leap rule', () => {
    it.each([
      ['divisible by 4 but not by 100', '2028-02-29'],
      ['divisible by 400', '2000-02-29'],
      ['divisible by 400, another century', '1600-02-29'],
    ])('accepts 29 Feb of a year %s (%s)', (_label, value) => {
      expect(isCalendarDay(value)).toBe(true);
    });

    it.each([
      ['not divisible by 4', '2027-02-29'],
      ['divisible by 100 but not by 400', '1900-02-29'],
      ['divisible by 100 but not by 400, next century', '2100-02-29'],
    ])('rejects 29 Feb of a year %s (%s)', (_label, value) => {
      expect(isCalendarDay(value)).toBe(false);
    });

    it('still accepts 28 Feb of a common century year', () => {
      expect(isCalendarDay('1900-02-28')).toBe(true);
      expect(isCalendarDay('2100-02-28')).toBe(true);
    });
  });

  describe('supported year range', () => {
    it.each([
      ['year 0000, which Postgres refuses outright', '0000-01-01'],
      ['a three-digit-year typo', '0226-10-05'],
      ['the last day before the Gregorian calendar', '1582-12-31'],
    ])('rejects %s (%s)', (_label, value) => {
      expect(isCalendarDay(value)).toBe(false);
    });

    it.each([
      ['the first supported year', '1583-01-01'],
      ['the last four-digit year', '9999-12-31'],
    ])('accepts %s (%s)', (_label, value) => {
      expect(isCalendarDay(value)).toBe(true);
    });
  });
});

describe('isClubMonth', () => {
  it.each([
    ['a plain month', '2026-10'],
    ['january', '2026-01'],
    ['december', '2026-12'],
  ])('accepts %s (%s)', (_label, value) => {
    expect(isClubMonth(value)).toBe(true);
  });

  it.each([
    ['a month without padding', '2026-1'],
    ['month 13', '2026-13'],
    ['month 00', '2026-00'],
    ['a full calendar day', '2026-10-05'],
    ['an empty string', ''],
    ['a month with trailing whitespace', '2026-10 '],
    ['a year alone', '2026'],
  ])('rejects %s (%s)', (_label, value) => {
    expect(isClubMonth(value)).toBe(false);
  });

  // A mesma faixa do isCalendarDay: os dois helpers viram coluna no banco na
  // Tarefa 07, e um `month` de ano 0000 estouraria igual.
  describe('supported year range', () => {
    it.each([
      ['year 0000, which Postgres refuses outright', '0000-01'],
      ['a three-digit-year typo', '0226-10'],
      ['the last month before the Gregorian calendar', '1582-12'],
    ])('rejects %s (%s)', (_label, value) => {
      expect(isClubMonth(value)).toBe(false);
    });

    it.each([
      ['the first supported year', '1583-01'],
      ['the last four-digit year', '9999-12'],
    ])('accepts %s (%s)', (_label, value) => {
      expect(isClubMonth(value)).toBe(true);
    });
  });
});
