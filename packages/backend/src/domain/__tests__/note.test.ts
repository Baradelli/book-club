import { describe, expect, it } from 'vitest';

import { InvalidNoteError } from '../errors';
import { assertNoteDoc, isNoteDocNode, normalizeNoteTitle } from '../note';

describe('assertNoteDoc', () => {
  // Regra 9 — o `doc` chega do cliente como `unknown`, e este é o único portão.
  describe('what is not a doc at all', () => {
    it.each<[string, unknown]>([
      ['null', null],
      ['undefined', undefined],
      ['an array', [{ type: 'doc' }]],
      ['an empty array', []],
      ['a number', 42],
      ['a string', 'doc'],
      ['the JSON of a doc, still a string', '{"type":"doc"}'],
      ['a boolean', true],
    ])('rejects %s', (_label, value) => {
      expect(() => assertNoteDoc(value)).toThrow(InvalidNoteError);
    });
  });

  // Regra 10
  describe('what is an object but not a doc', () => {
    it.each<[string, unknown]>([
      ['a paragraph', { type: 'paragraph', content: [] }],
      ['an empty object', {}],
      ['a type that is not a string', { type: 1 }],
      ['a type that is null', { type: null }],
      ['an empty type', { type: '' }],
      ['a doc with the wrong case', { type: 'Doc' }],
      ['a doc with spaces around', { type: ' doc ' }],
    ])('rejects %s', (_label, value) => {
      expect(() => assertNoteDoc(value)).toThrow(InvalidNoteError);
    });
  });

  /**
   * A mensagem do `InvalidNoteError` é a ÚNICA que sai publicada na resposta
   * (`handleDomainError` só devolve `error.message` na classe 400 —
   * CONVENCOES-CODIGO §6.2). Então ela nomeia o problema sem devolver o corpo
   * que o cliente mandou.
   */
  describe('the 400 message names the problem without echoing the payload', () => {
    it('names the type the client sent when it is a string', () => {
      expect(() => assertNoteDoc({ type: 'paragraph' })).toThrow(/paragraph/);
    });

    it('does not dump an object that arrived in the type field', () => {
      const error: unknown = (() => {
        try {
          assertNoteDoc({ type: { segredo: 'não devolva isto' } });
        } catch (thrown: unknown) {
          return thrown;
        }
        return null;
      })();

      expect(error).toBeInstanceOf(InvalidNoteError);
      expect((error as Error).message).not.toContain('segredo');
      expect((error as Error).message).not.toContain('não devolva isto');
    });
  });

  // Regra 11 — o editor autossalva com o doc vazio, e recusar isso quebraria a
  // primeira digitação.
  describe('the empty doc is accepted', () => {
    it('accepts a doc with no content key', () => {
      expect(assertNoteDoc({ type: 'doc' })).toEqual({ type: 'doc' });
    });

    it('accepts a doc with an empty content array', () => {
      expect(assertNoteDoc({ type: 'doc', content: [] })).toEqual({
        type: 'doc',
        content: [],
      });
    });

    it('accepts a doc with one empty paragraph', () => {
      const value = { type: 'doc', content: [{ type: 'paragraph' }] };

      expect(assertNoteDoc(value)).toEqual(value);
    });
  });

  // Regra 12 — estreita e NÃO reescreve. O ADR 0001 escolheu ProseMirror JSON
  // para o round-trip ser lossless: uma anotação de meses atrás tem de reabrir
  // idêntica, com os `attrs` de toda extensão que o editor tinha na época.
  describe('the doc comes out exactly as it went in', () => {
    /**
     * FACTORY, não `const` no escopo do `describe`. Uma fixture mutável
     * compartilhada faz um teste que (por bug) estraga a árvore contaminar o
     * `structuredClone` do vizinho — que passaria a fotografar a árvore JÁ
     * DANIFICADA e a comparar dano com dano. → CONVENCOES-CODIGO §6.6.
     */
    function richDoc(): unknown {
      return {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2, id: 'ancora' },
            content: [{ type: 'text', text: 'Cap. 3' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'promessa',
                marks: [
                  { type: 'bold' },
                  { type: 'link', attrs: { href: 'https://x', target: null } },
                ],
              },
              { type: 'mention', attrs: { id: 'user-2', label: 'Marcos' } },
            ],
          },
          {
            type: 'extensaoQueAindaNaoExiste',
            attrs: { cor: 'azul', nivel: 3 },
            content: [{ type: 'text', text: 'de uma versão futura do editor' }],
          },
        ],
      };
    }

    /**
     * Documenta que HOJE não há cópia defensiva — e é só isso que prova.
     * Identidade de referência **não é** o contrato do ADR 0001: um
     * `structuredClone` no retorno é lossless e defensável, e uma travessia que
     * apagasse os `marks` devolvendo o mesmo objeto passaria aqui.
     * A prova de losslessness é o teste do snapshot, abaixo.
     */
    it('does not copy the doc today: the same reference comes back', () => {
      const input = richDoc();

      expect(assertNoteDoc(input)).toBe(input);
    });

    /**
     * A prova da regra 12: fotografar ANTES e comparar DEPOIS. Negrito, itálico
     * e link são `marks`; `attrs` guarda o `href` e o `label` da menção. Perder
     * qualquer um deles é a perda que o ADR 0001 existe para impedir.
     */
    it('keeps every key, attr and mark of the whole tree', () => {
      const input = richDoc();
      const snapshot = structuredClone(input);

      const narrowed = assertNoteDoc(input);

      // Nada foi perdido na SAÍDA...
      expect(narrowed).toEqual(snapshot);
      // ...e a ENTRADA também não foi mutada no lugar.
      expect(input).toEqual(snapshot);
    });

    // A mesma prova, apontada nos campos que uma travessia "limpadora"
    // apagaria primeiro — para quem quebrar isto ler o nome do que perdeu.
    it('keeps the marks of a text node: bold, italic and link survive', () => {
      const input = richDoc();
      const snapshot = structuredClone(input);

      const narrowed = assertNoteDoc(input);

      expect(JSON.stringify(narrowed)).toBe(JSON.stringify(snapshot));
      expect(JSON.stringify(narrowed)).toContain('"marks"');
      expect(JSON.stringify(narrowed)).toContain('https://x');
      expect(JSON.stringify(narrowed)).toContain('Marcos');
    });

    it('does not reorder the keys of a node', () => {
      const oddOrder: unknown = {
        content: [{ text: 'primeiro a chave text', type: 'text' }],
        attrs: { qualquer: 'coisa' },
        type: 'doc',
      };

      expect(Object.keys(assertNoteDoc(oddOrder))).toEqual([
        'content',
        'attrs',
        'type',
      ]);
    });
  });
});

describe('isNoteDocNode', () => {
  it.each<[string, unknown]>([
    ['a doc', { type: 'doc' }],
    ['a paragraph', { type: 'paragraph', content: [] }],
    ['an unknown type', { type: 'tipoNovo' }],
  ])('accepts %s', (_label, value) => {
    expect(isNoteDocNode(value)).toBe(true);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['an array', [{ type: 'doc' }]],
    ['a number', 42],
    ['a string', 'text'],
    ['an object without type', { text: 'oi' }],
    ['an object whose type is not a string', { type: 42 }],
  ])('refuses %s', (_label, value) => {
    expect(isNoteDocNode(value)).toBe(false);
  });
});

// O título da anotação avulsa. A do dia não passa por aqui: o título dela é
// copiado do tema do ReadingPlanItem.
describe('normalizeNoteTitle', () => {
  it('trims the ends', () => {
    expect(normalizeNoteTitle('  A promessa  ')).toBe('A promessa');
  });

  it('keeps a title that is already clean', () => {
    expect(normalizeNoteTitle('A promessa')).toBe('A promessa');
  });

  it('keeps the inner spaces', () => {
    expect(normalizeNoteTitle(' Cap. 3 — A  promessa ')).toBe(
      'Cap. 3 — A  promessa',
    );
  });

  it.each([
    ['an empty string', ''],
    ['only spaces', '   '],
    ['only a tab', '\t'],
    ['only a newline', '\n'],
  ])('rejects %s', (_label, value) => {
    expect(() => normalizeNoteTitle(value)).toThrow(InvalidNoteError);
  });
});
