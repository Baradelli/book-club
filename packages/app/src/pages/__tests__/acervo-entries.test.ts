import type { HighlightResponse, NoteResponse } from '@clube/shared';
import { describe, expect, it } from 'vitest';

import {
  type AcervoEntry,
  type AcervoFilter,
  ALL_SCOPE,
  authorScope,
  emptyTitleKey,
  filterEntries,
  matchesText,
  MINE_SCOPE,
} from '../acervo-entries';

/**
 * A QUINTA DIMENSÃO DO ACERVO — O TEXTO (Tarefa 38g).
 *
 * ⚠️ **ESTE É O PRIMEIRO TESTE PRÓPRIO DO `acervo-entries.ts`, e a exceção é
 * declarada.** O docblock daquele módulo registra que as quatro dimensões
 * originais são provadas **através da tela** (`acervo.test.tsx`) porque todas
 * são decidíveis no DOM, e que um unitário seria um SEGUNDO acusador da mesma
 * propriedade. A quinta é diferente em duas coisas, e as duas são a regra 1
 * desta fatia:
 *
 * 1. **o casamento por texto é decidível sem tela** — é função pura sobre
 *    `AcervoEntry[]`, e a spec manda testá-la ANTES de existir campo nenhum;
 * 2. **os casos que decidem a decisão B não têm observável barata no DOM**: o
 *    grifo que casa **só pelo trecho** exige um grifo com comentário VAZIO, e a
 *    nota que casa **só pelo `plainText`** exige um título que contém a palavra
 *    e um `plainText` que não — dois fixtures hostis que o fixture da tela,
 *    escrito para a ordem e para as quatro dimensões, não carrega.
 *
 * A tela continua sendo o acusador de que a dimensão CHEGA ao DOM e COMBINA com
 * as outras quatro (regra 3); aqui se prova o que ela casa.
 *
 * ⚠️ **O FIXTURE É HOSTIL ÀS DUAS IMPLEMENTAÇÕES ERRADAS MAIS PROVÁVEIS**
 * (`docs/CONVENCOES-CODIGO.md` §7.2):
 *
 * - **"casa o título da anotação"** — é o que a linha da lista MOSTRA como
 *   conteúdo principal, então é o campo que a mão escreve primeiro. A decisão B
 *   diz `plainText`, porque é o que a `/busca` do clube casa (o
 *   `PrismaNoteRepository.find` filtra `plainText`, e só ele). O fixture tem uma
 *   anotação cujo TÍTULO contém a palavra e cujo `plainText` não;
 * - **"casa só o comentário do grifo"** — o comentário é o que se parece com
 *   uma anotação. A decisão B diz `quote` **e** `commentText`, e o fixture tem
 *   um grifo com comentário vazio (`''`, nunca nulo) que só pode casar pelo
 *   trecho.
 */

const CLUB = 'c-casal';
const BOOK = 'b-hobbit';
const ME = 'u-marcos';
const HER = 'u-maria';

const YELLOW = '#facc15';
const GREEN = '#22c55e';

function aNote(overrides: Partial<NoteResponse> = {}): NoteResponse {
  return {
    id: 'n-1',
    clubId: CLUB,
    bookId: BOOK,
    userId: ME,
    kind: 'FREE',
    planItemId: null,
    title: 'Um titulo qualquer',
    reference: null,
    doc: { type: 'doc' },
    plainText: 'o texto que a lista mostra em previa',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: '2026-09-04T10:55:00.000Z',
    updatedAt: '2026-09-04T10:55:00.000Z',
    ...overrides,
  };
}

function aHighlight(
  overrides: Partial<HighlightResponse> = {},
): HighlightResponse {
  return {
    id: 'h-1',
    clubId: CLUB,
    bookId: BOOK,
    userId: ME,
    quote: 'um trecho qualquer',
    color: YELLOW,
    page: 9,
    reference: null,
    commentDoc: { type: 'doc' },
    commentText: 'um comentario qualquer',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: '2026-09-04T10:10:00.000Z',
    updatedAt: '2026-09-04T10:10:00.000Z',
    ...overrides,
  };
}

function noteEntry(overrides: Partial<NoteResponse> = {}): AcervoEntry {
  const note = aNote(overrides);
  return { type: note.kind, note };
}

function highlightEntry(
  overrides: Partial<HighlightResponse> = {},
): AcervoEntry {
  return { type: 'HIGHLIGHT', highlight: aHighlight(overrides) };
}

/**
 * ⚠️ **O GRIFO SEM COMENTÁRIO GUARDA STRING VAZIA, NUNCA NULO** — é a nota de
 * rodapé da regra 2 desta fatia, e ela vem do ADR 0001: o `commentText` é
 * DERIVADO do `commentDoc` no backend, então "não há comentário" chega como
 * `commentDoc: null` **e** `commentText: ''`. O fixture não pode inventar as
 * duas pontas em desacordo (§7.1).
 */
const QUOTE_ONLY = highlightEntry({
  id: 'h-quote',
  quote: 'Uma porta redonda e verde na colina',
  commentDoc: null,
  commentText: '',
});

const COMMENT_ONLY = highlightEntry({
  id: 'h-comment',
  quote: 'Zangado com o dragao adormecido',
  commentText: 'a colina inteira num paragrafo',
});

/** O título diz "colina" e o `plainText` não — a decisão B em forma de dado. */
const TITLE_ONLY = noteEntry({
  id: 'n-title',
  title: 'A colina que ela abriu',
  plainText: 'ela abriu a porta antes de todos',
});

const PLAIN_TEXT = noteEntry({
  id: 'n-plain',
  title: 'A carta que ficou',
  plainText: 'o que ela escreveu sobre a colina',
});

const ALL_FILTER: AcervoFilter = {
  author: ALL_SCOPE,
  type: null,
  color: null,
  reading: null,
  text: '',
};

function idsOf(entries: readonly AcervoEntry[]): string[] {
  return entries.map((entry) =>
    entry.type === 'HIGHLIGHT' ? entry.highlight.id : entry.note.id,
  );
}

describe('⚠️ the text matches what the CLUB SEARCH matches (decision B)', () => {
  it('⚠️ matches a highlight by its QUOTE ALONE, with no comment at all (rule 2)', () => {
    // O caso que ninguém escreve, e o que o dono acabou de preservar na
    // pergunta 2 do MVP 2: o grifo sem comentário guarda `''`, não nulo.
    expect(QUOTE_ONLY).toMatchObject({ highlight: { commentText: '' } });
    expect(matchesText(QUOTE_ONLY, 'porta')).toBe(true);
  });

  it('⚠️ matches a highlight by its COMMENT ALONE (rule 2)', () => {
    expect(matchesText(COMMENT_ONLY, 'paragrafo')).toBe(true);
    // E o trecho continua casando no MESMO grifo: são duas colunas em OR, não
    // uma escolha entre elas.
    expect(matchesText(COMMENT_ONLY, 'dragao')).toBe(true);
  });

  it('⚠️ matches a note by its plainText, and NEVER by its title', () => {
    /*
      ⚠️ O título é o que a LINHA mostra, e é por isso que ele é o campo errado
      mais provável. A `/busca` do clube filtra `plainText` e só ele
      (`PrismaNoteRepository.find`); um acervo que casasse o título acharia
      aqui o que a busca não acha ali — duas verdades sobre a mesma pergunta.
    */
    expect(matchesText(PLAIN_TEXT, 'colina')).toBe(true);
    expect(matchesText(TITLE_ONLY, 'colina')).toBe(false);
  });

  it('ignores case, like the ILIKE of the server (decision C)', () => {
    expect(matchesText(PLAIN_TEXT, 'COLINA')).toBe(true);
    expect(matchesText(QUOTE_ONLY, 'PoRtA')).toBe(true);
  });

  it('⚠️ keeps the ACCENT significant, like the ILIKE of the server (decision D)', () => {
    /*
      ⚠️ **NORMALIZAR SERIA GRÁTIS AQUI (`normalize('NFD')`), E É JUSTAMENTE
      POR ISSO QUE ESTE TESTE EXISTE.** O dono decidiu NÃO ligar o `unaccent`
      no Postgres (pergunta 1 do MVP 2), e um acervo que achasse "coracao"
      enquanto a `/busca` do clube não acha seria duas verdades sobre a mesma
      pergunta. No dia em que o `unaccent` entrar, as duas se movem juntas — e
      este teste é o lugar que fica vermelho para lembrar.
    */
    const accented = noteEntry({ plainText: 'o coração do anão' });

    expect(matchesText(accented, 'coração')).toBe(true);
    expect(matchesText(accented, 'CORAÇÃO')).toBe(true);
    expect(matchesText(accented, 'coracao')).toBe(false);
  });

  it('cuts nothing when there is no term, and trims the edges', () => {
    expect(matchesText(TITLE_ONLY, '')).toBe(true);
    expect(matchesText(TITLE_ONLY, '   ')).toBe(true);
    expect(matchesText(PLAIN_TEXT, '  colina  ')).toBe(true);
  });
});

/**
 * ⚠️ **CADA RECORTE DAS OUTRAS QUATRO DIMENSÕES CONTÉM UMA ENTRADA QUE **NÃO**
 * CASA A PALAVRA — e essa é a propriedade que faz o teste do AND valer.**
 *
 * MEDIDO nesta fatia, antes da implementação: com um fixture em que todo grifo
 * dizia "colina", os testes `AND with TYPE` e `AND with COLOUR` passavam
 * **verdes com a dimensão de texto inexistente** — o recorte por tipo e por cor
 * já devolvia exatamente a mesma lista. Um teste de AND só prova o AND quando a
 * outra dimensão, sozinha, devolveria MAIS. Daí os quatro "mudos": um grifo meu
 * amarelo, um grifo dela verde, uma anotação minha avulsa (a do TÍTULO) e uma
 * anotação dela do dia, nenhum deles dizendo a palavra.
 */
describe('⚠️ the fifth dimension is in AND with the other four (rule 3)', () => {
  const ENTRIES: readonly AcervoEntry[] = [
    QUOTE_ONLY,
    COMMENT_ONLY,
    highlightEntry({
      id: 'h-mute',
      quote: 'Duas linhas sobre o anel',
      commentText: 'o anel muda de dono',
    }),
    highlightEntry({
      id: 'h-hers',
      userId: HER,
      color: GREEN,
      quote: 'A colina de quem escreveu depois',
      commentDoc: null,
      commentText: '',
    }),
    highlightEntry({
      id: 'h-hers-mute',
      userId: HER,
      color: GREEN,
      quote: 'O carneiro assado que abre a leitura',
      commentText: 'o jantar dos anoes',
    }),
    TITLE_ONLY,
    PLAIN_TEXT,
    noteEntry({
      id: 'n-day',
      kind: 'PLAN',
      planItemId: 'p-1',
      userId: HER,
      plainText: 'a colina vista do outro lado',
    }),
    noteEntry({
      id: 'n-day-mute',
      kind: 'PLAN',
      planItemId: 'p-1',
      userId: HER,
      plainText: 'o dragao dormia sobre o ouro',
    }),
  ];

  function visible(patch: Partial<AcervoFilter>): string[] {
    return idsOf(filterEntries(ENTRIES, { ...ALL_FILTER, ...patch }, ME));
  }

  it('cuts by text alone, over every type', () => {
    expect(visible({ text: 'colina' })).toEqual([
      'h-quote',
      'h-comment',
      'h-hers',
      'n-plain',
      'n-day',
    ]);
  });

  it('⚠️ AND with PERSON — and the person alone would show more', () => {
    expect(visible({ text: 'colina', author: MINE_SCOPE })).toEqual([
      'h-quote',
      'h-comment',
      'n-plain',
    ]);
    expect(visible({ author: MINE_SCOPE })).toEqual([
      'h-quote',
      'h-comment',
      'h-mute',
      'n-title',
      'n-plain',
    ]);
    expect(visible({ text: 'colina', author: authorScope(HER) })).toEqual([
      'h-hers',
      'n-day',
    ]);
  });

  it('⚠️ AND with TYPE — and the type alone would show more', () => {
    expect(visible({ text: 'colina', type: 'HIGHLIGHT' })).toEqual([
      'h-quote',
      'h-comment',
      'h-hers',
    ]);
    expect(visible({ type: 'HIGHLIGHT' })).toEqual([
      'h-quote',
      'h-comment',
      'h-mute',
      'h-hers',
      'h-hers-mute',
    ]);
    expect(visible({ text: 'colina', type: 'PLAN' })).toEqual(['n-day']);
    expect(visible({ type: 'PLAN' })).toEqual(['n-day', 'n-day-mute']);
  });

  it('⚠️ AND with COLOUR — and the colour alone would show more', () => {
    expect(visible({ text: 'colina', color: GREEN })).toEqual(['h-hers']);
    expect(visible({ color: GREEN })).toEqual(['h-hers', 'h-hers-mute']);
    expect(visible({ text: 'colina', color: YELLOW })).toEqual([
      'h-quote',
      'h-comment',
    ]);
    expect(visible({ color: YELLOW })).toEqual([
      'h-quote',
      'h-comment',
      'h-mute',
    ]);
  });

  it('⚠️ AND with READING — and the reading alone would show more', () => {
    expect(visible({ text: 'colina', reading: 'p-1' })).toEqual(['n-day']);
    expect(visible({ reading: 'p-1' })).toEqual(['n-day', 'n-day-mute']);
    // E o texto que não casa esvazia um recorte que sozinho não era vazio.
    expect(visible({ text: 'anel', reading: 'p-1' })).toEqual([]);
  });

  it('⚠️ the FIVE together come back with exactly one line', () => {
    expect(
      visible({
        author: authorScope(HER),
        type: 'HIGHLIGHT',
        color: GREEN,
        reading: null,
        text: 'colina',
      }),
    ).toEqual(['h-hers']);

    // E afrouxar o TEXTO é o que prova que ele estava valendo: as outras quatro
    // sozinhas devolvem DUAS linhas, e trocar a palavra por uma que nenhum dos
    // dois grifos diz esvazia o mesmo recorte.
    expect(
      visible({
        author: authorScope(HER),
        type: 'HIGHLIGHT',
        color: GREEN,
      }),
    ).toEqual(['h-hers', 'h-hers-mute']);
    expect(
      visible({
        author: authorScope(HER),
        type: 'HIGHLIGHT',
        color: GREEN,
        text: 'anel',
      }),
    ).toEqual([]);
  });
});

describe('⚠️ the empty state tells the three cases apart (decision F)', () => {
  it('says "there is nothing here" when the collection itself is empty', () => {
    expect(emptyTitleKey(false, '')).toBe('pages.acervo.empty.title');
    // ⚠️ E ele ganha do texto: com o acervo vazio não há o que a palavra
    // pudesse achar, e "nada com esta palavra" mandaria a pessoa trocar o termo
    // de uma busca que não tinha onde procurar.
    expect(emptyTitleKey(false, 'colina')).toBe('pages.acervo.empty.title');
  });

  it('says "nothing with this filter" when the cut came from the chips', () => {
    expect(emptyTitleKey(true, '')).toBe('pages.acervo.empty.filtered');
    expect(emptyTitleKey(true, '   ')).toBe('pages.acervo.empty.filtered');
  });

  it('⚠️ says "nothing with this word" when there IS a term', () => {
    expect(emptyTitleKey(true, 'colina')).toBe('pages.acervo.empty.noMatch');
  });
});
