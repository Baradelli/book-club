import { describe, expect, it } from 'vitest';

import { docToText } from '../doc-to-text';
import type { NoteDoc, NoteDocNode } from '../note';

/** Um parágrafo com um texto só — o bloco mais comum do editor. */
function paragraph(...children: NoteDocNode[]): NoteDocNode {
  return { type: 'paragraph', content: children };
}

function text(value: string, marks?: unknown[]): NoteDocNode {
  return marks
    ? { type: 'text', text: value, marks }
    : { type: 'text', text: value };
}

function doc(...children: NoteDocNode[]): NoteDoc {
  return { type: 'doc', content: children };
}

describe('docToText', () => {
  // Regra 1
  describe('empty doc', () => {
    it('returns an empty string for a doc with no content key', () => {
      expect(docToText({ type: 'doc' })).toBe('');
    });

    it('returns an empty string for a doc with an empty content array', () => {
      expect(docToText(doc())).toBe('');
    });

    // O autosave da primeira digitação manda exatamente isto.
    it('returns an empty string for a doc with one empty paragraph', () => {
      expect(docToText(doc(paragraph()))).toBe('');
    });
  });

  // Regra 2 — as três palavras são distintas e formam uma frase só na ordem
  // certa: uma implementação que invertesse, ordenasse ou perdesse um nó
  // devolveria outra frase, não a mesma com espaçamento diferente.
  describe('document order', () => {
    it('concatenates the text nodes in document order', () => {
      const value = docToText(
        doc(
          paragraph(
            text('Numa '),
            text('toca', [{ type: 'bold' }]),
            text(' vivia um hobbit'),
          ),
        ),
      );

      expect(value).toBe('Numa toca vivia um hobbit');
    });

    it('keeps the order across blocks', () => {
      const value = docToText(
        doc(
          paragraph(text('Primeiro')),
          paragraph(text('Segundo')),
          paragraph(text('Terceiro')),
        ),
      );

      expect(value).toBe('Primeiro\nSegundo\nTerceiro');
    });
  });

  // Regra 3
  describe('block nodes separate, inline nodes do not', () => {
    it.each([
      ['paragraph', 'paragraph'],
      ['heading', 'heading'],
      ['list item', 'listItem'],
      ['table cell', 'tableCell'],
      ['callout', 'callout'],
      ['blockquote', 'blockquote'],
    ])('separates two %s blocks with a newline', (_label, type) => {
      const value = docToText(
        doc(
          { type, content: [text('Antes')] },
          { type, content: [text('Depois')] },
        ),
      );

      expect(value).toBe('Antes\nDepois');
    });

    // O lado inline: nada separa dentro do parágrafo, nem o `text` com marks
    // (negrito, itálico, LINK — link é mark, não nó) nem a menção.
    it('does not separate inline nodes inside a block', () => {
      const value = docToText(
        doc(
          paragraph(
            text('um '),
            text('link', [{ type: 'link', attrs: { href: 'https://x' } }]),
            text(' e a '),
            { type: 'mention', attrs: { id: 'user-1', label: 'Maria' } },
            text(' juntos'),
          ),
        ),
      );

      expect(value).toBe('um link e a Maria juntos');
    });

    // Um bloco dentro de outro não emite dois separadores visíveis entre
    // palavras de blocos vizinhos, e nunca gruda uma palavra na outra.
    it('separates nested blocks without gluing words together', () => {
      const value = docToText(
        doc({
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph(text('primeiro item'))] },
            { type: 'listItem', content: [paragraph(text('segundo item'))] },
          ],
        }),
      );

      expect(value).toContain('primeiro item');
      expect(value).toContain('segundo item');
      expect(value).not.toContain('itemsegundo');
    });
  });

  // Regra 4
  describe('hardBreak', () => {
    it('turns a hardBreak into a newline', () => {
      const value = docToText(
        doc(
          paragraph(
            text('Linha um'),
            { type: 'hardBreak' },
            text('Linha dois'),
          ),
        ),
      );

      expect(value).toBe('Linha um\nLinha dois');
    });
  });

  // Regra 5 — o que faz uma extensão nova do editor (Tarefa 14) entrar na
  // busca sem ninguém mexer aqui.
  describe('unknown node types', () => {
    it('walks through an unknown block and keeps its text', () => {
      const value = docToText(
        doc({
          type: 'extensaoQueAindaNaoExiste',
          attrs: { cor: 'azul' },
          content: [paragraph(text('Aviso importante'))],
        }),
      );

      expect(value).toBe('Aviso importante');
    });

    it('walks through several unknown levels', () => {
      const value = docToText(
        doc({
          type: 'tipoNovoA',
          content: [
            {
              type: 'tipoNovoB',
              content: [{ type: 'tipoNovoC', content: [text('achado')] }],
            },
          ],
        }),
      );

      expect(value).toBe('achado');
    });

    it('keeps the text of an unknown node that sits between two known ones', () => {
      const value = docToText(
        doc(
          paragraph(text('antes')),
          { type: 'tipoNovo', content: [paragraph(text('meio'))] },
          paragraph(text('depois')),
        ),
      );

      // O `\n\n` do meio é o parágrafo fechando dentro do desconhecido, que
      // fecha em seguida — dois separadores, e a normalização só corta 3+.
      expect(value).toBe('antes\nmeio\n\ndepois');
    });

    /**
     * A ASSIMETRIA da regra 5, e o único teste que a defende: um tipo
     * desconhecido é **BLOCO**, não inline.
     *
     * O filho aqui é `text` CRU, sem parágrafo no meio — é isso que expõe a
     * escolha. Com um parágrafo dentro, o separador vem do parágrafo e a
     * asserção passaria com a decisão invertida (desconhecido ⇒ inline). E a
     * asserção é EXATA (`toBe`): com `toContain`, `antes\nmeiodepois` passaria,
     * e uma palavra grudada não é achada por busca nenhuma.
     */
    it('treats an unknown type as a BLOCK, never as inline', () => {
      const value = docToText(
        doc(
          paragraph(text('antes')),
          { type: 'extensaoNova', content: [text('meio')] },
          paragraph(text('depois')),
        ),
      );

      expect(value).toBe('antes\nmeio\ndepois');
    });

    // O mesmo, sem nada em volta: o desconhecido é o último bloco e a palavra
    // dele não pode grudar na do bloco seguinte.
    it('does not glue the text of an unknown block to the next block', () => {
      const value = docToText(
        doc(
          { type: 'extensaoNova', content: [text('primeira')] },
          { type: 'outraExtensao', content: [text('segunda')] },
        ),
      );

      expect(value).toBe('primeira\nsegunda');
    });
  });

  // Regra 6 — buscar o nome de uma pessoa tem de achar a nota.
  describe('mention', () => {
    it('contributes attrs.label when it is a string', () => {
      const value = docToText(
        doc(
          paragraph(text('combinei com '), {
            type: 'mention',
            attrs: { id: 'user-2', label: 'Marcos' },
          }),
        ),
      );

      expect(value).toBe('combinei com Marcos');
    });

    it.each<[string, NoteDocNode]>([
      ['no attrs at all', { type: 'mention' }],
      ['attrs of another type', { type: 'mention', attrs: 'Marcos' }],
      ['attrs without label', { type: 'mention', attrs: { id: 'user-2' } }],
      [
        'a label that is not a string',
        { type: 'mention', attrs: { label: 42 } },
      ],
      ['a null label', { type: 'mention', attrs: { label: null } }],
    ])('does not break on a mention with %s', (_label, mention) => {
      const value = docToText(doc(paragraph(text('oi '), mention)));

      expect(value).toBe('oi');
      expect(value).not.toContain('undefined');
      expect(value).not.toContain('42');
      expect(value).not.toContain('null');
    });
  });

  // Regra 7 — a travessia é ITERATIVA (pilha explícita). Um doc profundo é o
  // que um cliente ruim (ou um "colar" infeliz) manda, e o `doc` é o único
  // campo que chega inteiro do cliente: recursão aqui derruba o processo.
  describe('deep documents', () => {
    function nestedDoc(depth: number, leaf: string): NoteDoc {
      let node: NoteDocNode = { type: 'paragraph', content: [text(leaf)] };
      for (let level = 0; level < depth; level += 1) {
        node = { type: 'blockquote', content: [node] };
      }
      return { type: 'doc', content: [node] };
    }

    it('returns the text of a 50 000 level deep doc instead of blowing the stack', () => {
      const value = docToText(nestedDoc(50_000, 'fundo do poço'));

      expect(value).toBe('fundo do poço');
    });

    // A pré-condição do teste acima: a mesma travessia RECURSIVA estoura nesta
    // profundidade. Sem isto, o teste passaria com uma implementação recursiva
    // e não provaria nada.
    it('is a depth at which a recursive walk really does blow the stack', () => {
      function recursive(node: NoteDocNode): string {
        return (node.content ?? []).map(recursive).join('') + (node.text ?? '');
      }

      expect(() => recursive(nestedDoc(50_000, 'x'))).toThrow(RangeError);
    });

    it('keeps every leaf of a wide and deep doc', () => {
      const value = docToText(
        doc(nestedDoc(1_000, 'esquerda').content?.[0] ?? paragraph(), {
          type: 'blockquote',
          content: [paragraph(text('direita'))],
        }),
      );

      expect(value).toContain('esquerda');
      expect(value).toContain('direita');
    });
  });

  // Regra 8
  describe('whitespace', () => {
    it('trims the ends', () => {
      expect(docToText(doc(paragraph(text('  Primeiro  '))))).toBe('Primeiro');
    });

    it('never leaves a leading or trailing newline', () => {
      const value = docToText(doc(paragraph(text('só um parágrafo'))));

      expect(value).toBe('só um parágrafo');
    });

    // O caso que produz a pilha de separadores: blocos aninhados fecham vários
    // níveis de uma vez.
    it('never returns three newlines in a row', () => {
      const value = docToText(
        doc(
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  paragraph(text('a')),
                  {
                    type: 'bulletList',
                    content: [
                      {
                        type: 'listItem',
                        content: [paragraph(text('a.1'))],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          paragraph(text('b')),
        ),
      );

      expect(value).not.toMatch(/\n{3,}/);
      expect(value.trim()).toBe(value);
      expect(value).toContain('a.1');
      expect(value).toContain('b');
    });

    it('collapses the empty paragraphs the editor leaves behind', () => {
      const value = docToText(
        doc(
          paragraph(text('antes')),
          paragraph(),
          paragraph(),
          paragraph(),
          paragraph(text('depois')),
        ),
      );

      expect(value).not.toMatch(/\n{3,}/);
      expect(value).toBe('antes\n\ndepois');
    });
  });

  /**
   * O `doc` é gravado como veio e `assertNoteDoc` é RASO (regra 12): então o
   * que o `docToText` atravessa pode ter qualquer coisa no `content`. Ele é o
   * derivador de TODA escrita — se ele estoura, ninguém salva anotação.
   */
  describe('malformed content is survived, not trusted', () => {
    /**
     * A asserção é a STRING RESULTANTE, não a ausência de exceção.
     *
     * `not.toThrow()` só prova "survived": ele passa igual se o lixo virar
     * texto na busca. Cada caso carrega um parágrafo BEM FORMADO ao lado, então
     * o `toBe` prova as duas metades — o lixo não contribui nada, e não
     * atropela o texto de verdade.
     *
     * O cast em cada caso é o ponto: é isto que chega quando o cliente manda
     * JSON que o `assertNoteDoc` raso aceitou.
     */
    it.each<[string, unknown, string]>([
      // Sem sibling: quando `content` não é array, não há onde pôr um.
      ['a content that is not an array', { type: 'doc', content: 'nada' }, ''],
      /**
       * O caso que a guarda `Array.isArray` defende, e o único que a distingue
       * de um `content ?? []`: um OBJETO array-like — com `length` e chaves
       * numéricas. É JSON válido, então um cliente pode mandá-lo, e sem a
       * guarda o acesso indexado o atravessaria como se fosse um array.
       */
      [
        'a content that is an array-like object',
        {
          type: 'doc',
          content: { 0: { type: 'text', text: 'contrabando' }, length: 1 },
        },
        '',
      ],
      [
        'a null child',
        { type: 'doc', content: [null, paragraph(text('boa'))] },
        'boa',
      ],
      [
        'a numeric child',
        { type: 'doc', content: [42, paragraph(text('boa'))] },
        'boa',
      ],
      // Este é o caso que a checagem `typeof value.type === 'string'` do
      // `isNoteDocNode` defende: sem ela, o `text: 'oi'` de um não-nó entraria
      // na busca.
      [
        'a child without type',
        { type: 'doc', content: [{ text: 'oi' }, paragraph(text('boa'))] },
        'boa',
      ],
      [
        'a text that is not a string',
        {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 42 }] },
            paragraph(text('boa')),
          ],
        },
        'boa',
      ],
      [
        'a nested array',
        { type: 'doc', content: [[text('oi')], paragraph(text('boa'))] },
        'boa',
      ],
    ])('yields %s as nothing at all', (_label, malformed, expected) => {
      expect(docToText(malformed as NoteDoc)).toBe(expected);
    });

    it('still collects the text that is well formed around the garbage', () => {
      const malformed: unknown = {
        type: 'doc',
        content: [null, paragraph(text('sobreviveu')), 42],
      };

      expect(docToText(malformed as NoteDoc)).toBe('sobreviveu');
    });
  });

  // Puro: chamar duas vezes dá o mesmo resultado e o doc não é tocado.
  describe('purity', () => {
    it('does not mutate the doc it receives', () => {
      const original = doc(paragraph(text('intacto')));
      const snapshot = structuredClone(original);

      docToText(original);

      expect(original).toEqual(snapshot);
    });

    it('returns the same text for the same doc', () => {
      const original = doc(paragraph(text('a')), paragraph(text('b')));

      expect(docToText(original)).toBe(docToText(original));
    });
  });
});
