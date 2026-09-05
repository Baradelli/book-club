import { describe, expect, it } from 'vitest';

import { optionalText } from '../optional-text';

/**
 * Suíte própria porque o helper tem três consumidores (`author`/`coverUrl` do
 * livro no `createBook` e no `editBook`, `reference` do item do plano no
 * `normalizePlanDrafts`) e hoje é coberto só por reflexo deles. Um quarto
 * consumidor com semântica diferente não seria pego.
 *
 * A regra em uma frase: **nada de string vazia no banco** — `''` e `'   '`
 * viram `null`, para a tela não ter de distinguir "vazio" de "ausente".
 */
describe('optionalText', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['only spaces', '   '],
    ['only a tab', '\t'],
    ['a newline', '\n'],
  ])('turns %s into null', (_label, value) => {
    expect(optionalText(value)).toBeNull();
  });

  it('trims the padding off a real value', () => {
    expect(optionalText('  J. R. R. Tolkien  ')).toBe('J. R. R. Tolkien');
  });

  it('keeps a value that needs no trimming', () => {
    expect(optionalText('p. 45-62')).toBe('p. 45-62');
  });

  // Só as PONTAS são aparadas: o espaço interno é conteúdo.
  it('keeps the spaces inside the value', () => {
    expect(optionalText('  Cap. 3 — A promessa  ')).toBe('Cap. 3 — A promessa');
  });

  // `null` e `undefined` chegam pelos dois chamadores: o `editBook` manda
  // `null` para limpar, o `createBook` manda `undefined` quando o campo é
  // ausente. Os dois têm de dar o MESMO resultado, senão o banco recebe
  // valores diferentes para "sem valor".
  it('does not distinguish absence from an explicit null', () => {
    expect(optionalText(undefined)).toBe(optionalText(null));
  });
});
