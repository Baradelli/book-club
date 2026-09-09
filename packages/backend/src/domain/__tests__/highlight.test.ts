import { HIGHLIGHT_COLORS } from '@clube/shared';
import { describe, expect, it } from 'vitest';

import { InvalidHighlightError, InvalidNoteError } from '../errors';
import {
  assertHighlightColor,
  normalizeHighlightComment,
  normalizeHighlightPage,
  normalizeHighlightQuote,
} from '../highlight';
import type { NoteDoc } from '../note';

/** Regra 2 — o trecho grifado é obrigatório, e vem sem as pontas. */
describe('normalizeHighlightQuote', () => {
  it.each([
    ['a clean quote', 'não é o que você tem', 'não é o que você tem'],
    ['spaces around', '  não é o que você tem  ', 'não é o que você tem'],
    ['a newline around', '\nnão é o que você tem\n', 'não é o que você tem'],
    ['a single word', 'coragem', 'coragem'],
    // O trecho pode ser longo: o teto é o `bodyLimit` da rota (Tarefa 24), e um
    // número escolhido aqui recusaria uma citação longa legítima (decisão G).
    ['a very long quote', `${'a'.repeat(5000)}  `, 'a'.repeat(5000)],
  ])('trims %s', (_label, quote, expected) => {
    expect(normalizeHighlightQuote(quote)).toBe(expected);
  });

  // As pontas somem, o MEIO fica: um grifo de duas frases guarda o espaçamento
  // interno como a pessoa digitou.
  it('never touches the whitespace inside the quote', () => {
    expect(normalizeHighlightQuote('  uma frase.  E outra.  ')).toBe(
      'uma frase.  E outra.',
    );
  });

  it.each([
    ['an empty quote', ''],
    ['a quote of spaces', '    '],
    ['a quote of a tab', '\t'],
    ['a quote of a newline', '\n'],
    ['a quote of a non-breaking space', ' '],
  ])('refuses %s', (_label, quote) => {
    expect(() => normalizeHighlightQuote(quote)).toThrow(InvalidHighlightError);
  });
});

/** Regra 3 — a cor é uma das cinco da paleta, e nada mais. */
describe('assertHighlightColor', () => {
  it.each(HIGHLIGHT_COLORS)('returns %s untouched', (color) => {
    expect(assertHighlightColor(color)).toBe(color);
  });

  it.each<[string, unknown]>([
    ['the same yellow in uppercase', '#FACC15'],
    ['the rgba form of the editor', 'rgba(250, 204, 21, 0.40)'],
    ['a colour outside the palette', '#ff0000'],
    ['a semantic name', 'YELLOW'],
    ['a palette colour with spaces around', ' #facc15 '],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an object', { color: '#facc15' }],
  ])('refuses %s', (_label, color) => {
    expect(() => assertHighlightColor(color)).toThrow(InvalidHighlightError);
  });
});

/**
 * Regra 4 — a página é opcional, e quando vem é inteiro **≥ 1**.
 *
 * Não é conferida contra `book.totalPages` de propósito (decisão E):
 * `totalPages` é opcional no `Book`, e a edição de quem grifa pode ser outra
 * (bolso × capa dura). Uma guarda que recusa a página real do livro de papel é
 * pior que nenhuma.
 */
describe('normalizeHighlightPage', () => {
  it.each<[string, unknown]>([
    ['undefined', undefined],
    ['null', null],
  ])('stores null for %s', (_label, page) => {
    expect(normalizeHighlightPage(page)).toBeNull();
  });

  it.each([
    ['the first page', 1],
    ['a page in the middle', 45],
    ['a page of a long book', 1200],
  ])('keeps %s', (_label, page) => {
    expect(normalizeHighlightPage(page)).toBe(page);
  });

  it.each<[string, unknown]>([
    ['zero', 0],
    ['a negative page', -1],
    ['a very negative page', -320],
    ['a fractional page', 45.5],
    // `-0` é `>= 1` falso e inteiro verdadeiro: entra na lista porque o
    // `Number.isInteger(-0)` é `true` e só a comparação com 1 o barra.
    ['negative zero', -0],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('refuses %s', (_label, page) => {
    expect(() => normalizeHighlightPage(page)).toThrow(InvalidHighlightError);
  });

  /**
   * O parâmetro é `unknown` pelo mesmo motivo do `assertNoteDoc`: o valor vem
   * de corpo de request, e o domínio é o portão — o `z.coerce` da borda
   * (Tarefa 24) é a primeira barreira, não a única.
   */
  it.each<[string, unknown]>([
    ['a page as a string', '45'],
    ['an empty string', ''],
    ['a boolean', true],
    ['an array', [45]],
    ['an object', { page: 45 }],
  ])('refuses %s, which is not a number at all', (_label, page) => {
    expect(() => normalizeHighlightPage(page)).toThrow(InvalidHighlightError);
  });
});

/**
 * Regra 6 — o comentário é ProseMirror JSON e o `commentText` é **derivado**,
 * a cada escrita, nunca vindo do input. → ADR 0001, que nomeia
 * `Highlight.commentDoc`/`commentText` na própria decisão.
 *
 * Reusa `assertNoteDoc` e `docToText` do domínio de `Note` **sem renomear nada**
 * (decisão D): é o mesmo tipo de dado, o ADR 0001 governa os dois com a mesma
 * frase, e um `assertCommentDoc` próprio seria uma cópia da regra.
 */
describe('normalizeHighlightComment', () => {
  function aCommentDoc(...texts: string[]): NoteDoc {
    return {
      type: 'doc',
      content: texts.map((text) => ({
        type: 'paragraph',
        content: [{ type: 'text', text }],
      })),
    };
  }

  it.each<[string, unknown]>([
    ['undefined', undefined],
    ['null', null],
  ])('stores no doc and an empty text for %s', (_label, value) => {
    expect(normalizeHighlightComment(value)).toEqual({
      commentDoc: null,
      commentText: '',
    });
  });

  it('derives the commentText from the doc', () => {
    const commentDoc = aCommentDoc('o anel é um símbolo', 'de poder');

    expect(normalizeHighlightComment(commentDoc)).toEqual({
      commentDoc,
      commentText: 'o anel é um símbolo\nde poder',
    });
  });

  /**
   * O doc é devolvido COMO VEIO — `marks` e `attrs` incluídos. O ADR 0001
   * escolheu ProseMirror JSON justamente para o round-trip ser lossless, e o
   * comentário de um grifo de meses atrás tem de reabrir idêntico.
   *
   * A asserção é contra um SNAPSHOT tirado antes da chamada: comparar o
   * devolvido com o objeto que entrou seria comparar a árvore com ela mesma.
   */
  it('keeps the doc exactly as it arrived', () => {
    const commentDoc: unknown = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          attrs: { fonte: 'p. 45' },
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'não é o que você tem',
                  marks: [{ type: 'italic' }],
                },
              ],
            },
          ],
        },
      ],
    };
    const snapshot = structuredClone(commentDoc);

    const { commentDoc: stored } = normalizeHighlightComment(commentDoc);

    expect(stored).toEqual(snapshot);
    expect(JSON.stringify(stored)).toContain('"marks"');
    expect(JSON.stringify(stored)).toContain('p. 45');
  });

  // O doc VAZIO é um comentário válido (é o que o autosave da primeira
  // digitação manda), e é diferente de "não há comentário": o doc fica gravado.
  it('accepts an empty doc, which is not the same as no comment', () => {
    const empty = aCommentDoc();

    expect(normalizeHighlightComment(empty)).toEqual({
      commentDoc: empty,
      commentText: '',
    });
  });

  /**
   * ⚠️ A classe do erro é `InvalidNoteError`, e é DE PROPÓSITO (decisão D): o
   * portão é o `assertNoteDoc`, reusado sem renomear. Os dois erros são 400 na
   * borda, e a `message` do 400 é a única publicada — mas a tela nunca a mostra
   * (a Tarefa 15 provou que o front mapeia `status`/`path`, nunca `message`).
   * Renomear para um `editor-doc.ts` neutro tocaria três fatias fechadas para
   * ganhar uma palavra numa mensagem que ninguém lê.
   */
  it.each<[string, unknown]>([
    ['a string', 'só um comentário'],
    ['a number', 42],
    ['a boolean', true],
    ['an array', [{ type: 'paragraph' }]],
    ['a paragraph instead of a doc', { type: 'paragraph' }],
    ['an empty object', {}],
    ['a doc with the wrong case', { type: 'Doc' }],
  ])('refuses %s', (_label, value) => {
    expect(() => normalizeHighlightComment(value)).toThrow(InvalidNoteError);
  });
});
