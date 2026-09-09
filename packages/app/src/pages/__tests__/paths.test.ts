import { describe, expect, it } from 'vitest';

import {
  HIGHLIGHT_NEW_PATH,
  HIGHLIGHT_PATH,
  highlightNewPath,
  highlightPath,
  HIGHLIGHTS_PATH,
  highlightsPath,
} from '../paths';

/**
 * OS ENDEREÇOS DOS GRIFOS (Tarefa 25) — as três rotas novas.
 *
 * ⚠️ **POR QUE UM TESTE UNITÁRIO, JÁ HAVENDO OS TESTES DE NAVEGAÇÃO.** Os
 * testes de tela provam o ELO (depois do toque o endereço mudou, o que em jsdom
 * só acontece se o roteador interceptou), mas eles usam ids de fixture — e o
 * `encodeURIComponent` que as três funções aplicam **não tem acusador nenhum**
 * ali: `b-hobbit` e `h-1` não têm nada a escapar. Um id com `/` deixaria de ser
 * um segmento, e o link abriria uma rota que não existe.
 *
 * `dayNotePath`/`freeNotePath` já carregam o mesmo `encodeURIComponent` desde a
 * Tarefa 18 **sem** este acusador; as três funções novas nascem com ele.
 */

describe('the addresses of the highlights (rules 4, 11, 17, 18)', () => {
  it('builds the collection of a book', () => {
    expect(highlightsPath('b-hobbit')).toBe('/books/b-hobbit/highlights');
  });

  it('builds the form of a NEW highlight', () => {
    expect(highlightNewPath('b-hobbit')).toBe('/books/b-hobbit/highlights/new');
  });

  it('builds the form of an EXISTING highlight', () => {
    expect(highlightPath('b-hobbit', 'h-porta')).toBe(
      '/books/b-hobbit/highlights/h-porta',
    );
  });

  it('escapes an id that would otherwise stop being one segment', () => {
    // Hoje os ids são `randomUUID()` e não há nada a escapar — e é justamente
    // por isso que só um teste consegue provar o escape.
    expect(highlightsPath('a/b')).toBe('/books/a%2Fb/highlights');
    expect(highlightNewPath('a/b')).toBe('/books/a%2Fb/highlights/new');
    expect(highlightPath('a/b', 'c/d')).toBe('/books/a%2Fb/highlights/c%2Fd');
  });

  /**
   * ⚠️ **`new` É SEGMENTO ESTÁTICO, E É O QUE DESAMBIGUA AS DUAS ROTAS DO
   * FORMULÁRIO.**
   *
   * O react-router prefere a rota MAIS ESPECÍFICA, independente da ordem de
   * declaração — o mesmo desenho de `FREE_NOTE_NEW_PATH` × `FREE_NOTE_PATH`. O
   * que este teste pina é a precondição disso: os dois padrões diferem no
   * último segmento, e o do "novo" é literal. Se alguém trocasse
   * `/highlights/new` por `/highlights/:highlightId` com um id reservado, o
   * ranking deixaria de existir e "new" viraria um grifo inexistente.
   */
  it('keeps the create route as a STATIC segment, distinct from the edit route', () => {
    expect(HIGHLIGHTS_PATH).toBe('/books/:bookId/highlights');
    expect(HIGHLIGHT_NEW_PATH).toBe('/books/:bookId/highlights/new');
    expect(HIGHLIGHT_PATH).toBe('/books/:bookId/highlights/:highlightId');
    expect(HIGHLIGHT_NEW_PATH).not.toContain(':highlightId');
    // E o endereço construído casa o padrão declarado: o `new` do construtor é
    // o `new` da rota.
    expect(highlightNewPath('b')).toBe(
      HIGHLIGHT_NEW_PATH.replace(':bookId', 'b'),
    );
  });
});
