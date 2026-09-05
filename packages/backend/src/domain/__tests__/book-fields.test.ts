import { describe, expect, it } from 'vitest';

import {
  assertClubMonth,
  normalizeBookTitle,
  normalizeTotalPages,
} from '../book-fields';
import { InvalidBookError } from '../errors';

/** Captura a exceção para o teste poder afirmar classe E mensagem. */
function caughtError(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`expected an Error, got ${typeof error}`);
  }
  throw new Error('expected the call to throw, but it returned');
}

/**
 * Suíte própria das três validações de campo do livro.
 *
 * `createBook` e `editBook` já as exercitam pelas tabelas `it.each` deles, mas
 * o valor de estar aqui é durabilidade: um terceiro consumidor com semântica
 * diferente — o Zod da borda na Tarefa 07, ou um `importBook` qualquer — não
 * seria pego por nenhuma das duas suítes de UseCase.
 *
 * A distinção `undefined` (ausência) × `null` (limpar) NÃO é testada aqui: ela
 * é do chamador, e está nos testes do `editBook`.
 */
describe('normalizeBookTitle', () => {
  it.each([
    ['empty', ''],
    ['only spaces', '   '],
    ['only a tab', '\t'],
    ['only a newline', '\n'],
    ['mixed whitespace', ' \t \n '],
  ])('rejects a %s title', (_label, title) => {
    const error = caughtError(() => normalizeBookTitle(title));

    expect(error).toBeInstanceOf(InvalidBookError);
    expect(error.message).toBe('book title must not be empty');
  });

  it('trims the padding off the title', () => {
    expect(normalizeBookTitle('  O Hobbit  ')).toBe('O Hobbit');
  });

  it('keeps a title that needs no trimming', () => {
    expect(normalizeBookTitle('O Hobbit')).toBe('O Hobbit');
  });

  // Só as PONTAS são aparadas: o espaço interno é conteúdo.
  it('keeps the spaces inside the title', () => {
    expect(normalizeBookTitle('  Cap. 3 — A promessa  ')).toBe(
      'Cap. 3 — A promessa',
    );
  });

  // A regra é vazio, não comprimento: um título de um caractere é legítimo.
  it.each([
    ['a single letter', 'É'],
    ['a single digit', '1'],
    ['punctuation only', '...'],
  ])('accepts %s as a title', (_label, title) => {
    expect(normalizeBookTitle(title)).toBe(title);
  });
});

describe('assertClubMonth', () => {
  it.each([
    ['a plain month', '2026-10'],
    ['january', '2026-01'],
    ['december', '2026-12'],
    ['the first gregorian year', '1583-01'],
    ['the last four-digit year', '9999-12'],
  ])('accepts %s', (_label, month) => {
    expect(() => assertClubMonth(month)).not.toThrow();
  });

  // Não normaliza nada: quem valida não devolve valor.
  it('returns nothing when the month is valid', () => {
    expect(assertClubMonth('2026-10')).toBeUndefined();
  });

  it.each([
    ['month 13', '2026-13'],
    ['month 00', '2026-00'],
    ['a month without padding', '2026-1'],
    ['a full calendar day', '2026-10-05'],
    ['an empty string', ''],
    ['an ISO instant', '2026-10-01T00:00:00Z'],
    ['a year before the gregorian calendar', '1582-12'],
    ['a year missing a digit', '226-10'],
    ['a year with a leading zero typo', '0226-10'],
    ['a slash separator', '2026/10'],
    ['leading whitespace', ' 2026-10'],
    ['trailing whitespace', '2026-10 '],
    ['a trailing dash', '2026-10-'],
  ])('rejects %s', (_label, month) => {
    const error = caughtError(() => assertClubMonth(month));

    expect(error).toBeInstanceOf(InvalidBookError);
    expect(error.message).toMatch(/is not a "YYYY-MM" club month/);
  });

  // O formato da mensagem faz parte do contrato, e o valor vai ENTRE ASPAS de
  // propósito. Sem elas, os dois casos que mais confundem quem lê o log ficam
  // ilegíveis: a string vazia desaparece da frase, e um mês com espaço nas
  // pontas fica indistinguível do mês válido. Nenhuma suíte de UseCase afirma
  // esta mensagem — as duas só conferem a classe do erro.
  it.each([
    ['2026-13', 'book month "2026-13" is not a "YYYY-MM" club month'],
    ['', 'book month "" is not a "YYYY-MM" club month'],
    ['2026-10 ', 'book month "2026-10 " is not a "YYYY-MM" club month'],
  ])('quotes %o in the message', (month, expected) => {
    expect(caughtError(() => assertClubMonth(month)).message).toBe(expected);
  });
});

describe('normalizeTotalPages', () => {
  // Ausência e nulo explícito dão o MESMO resultado: o banco recebe um só
  // valor para "sem total de páginas".
  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('turns %s into null', (_label, value) => {
    expect(normalizeTotalPages(value)).toBeNull();
  });

  it('does not distinguish absence from an explicit null', () => {
    expect(normalizeTotalPages(undefined)).toBe(normalizeTotalPages(null));
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['a large negative', -320],
    ['fractional', 1.5],
    ['a negative fraction', -0.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects %s', (_label, value) => {
    const error = caughtError(() => normalizeTotalPages(value));

    expect(error).toBeInstanceOf(InvalidBookError);
    expect(error.message).toBe('totalPages must be a positive integer');
  });

  it.each([
    ['one', 1],
    ['a typical page count', 320],
    ['a very long book', 4211],
  ])('keeps %s', (_label, value) => {
    expect(normalizeTotalPages(value)).toBe(value);
  });

  // `1` passa e `0` não: a fronteira é "positivo", não "não negativo".
  it('accepts the smallest positive integer and rejects zero', () => {
    expect(normalizeTotalPages(1)).toBe(1);
    expect(() => normalizeTotalPages(0)).toThrow(InvalidBookError);
  });
});
