import type { HighlightResponse, NoteResponse } from '@clube/shared';
import { describe, expect, it } from 'vitest';

import {
  type AcervoEntry,
  type AcervoFilter,
  ALL_SCOPE,
  authorScope,
  emptyTitleKey,
  EVERY_PAGE,
  filterEntries,
  matchesPage,
  matchesText,
  MINE_SCOPE,
  type PageRange,
  readingOf,
  typeCanCarryReading,
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
    // ⚠️ AUSENTE por padrão (Tarefa 38i): o grifo avulso é o caso que o ADR
    // 0004 protege, e quem testa a dimensão de leitura o passa explicitamente.
    planItemId: null,
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
  page: EVERY_PAGE,
};

/**
 * A FAIXA COMO O CAMPO A ENTREGA — **duas strings** (Tarefa 38h).
 *
 * ⚠️ É factory e não `const` de `describe` (§7.7), e as duas pontas são CRUAS:
 * quem normaliza é o `boundOf` do módulo, um dono só — o mesmo desenho do
 * `text`, que também chega cru da tela.
 */
function pages(from: string, to: string): PageRange {
  return { from, to };
}

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

/**
 * ⚠️ **A SEXTA DIMENSÃO — A FAIXA DE PÁGINA (Tarefa 38h), e ela EXCLUI quem não
 * tem página (decisão B).**
 *
 * ⚠️ **NÃO É ESCOLHA NOVA: é o precedente da COR, medido nesta mesma tela.** O
 * `colorOf(note)` é `null`, e escolher uma cor **já exclui as anotações** desde
 * a Tarefa 28 — a página é a mesma regra sobre outra coluna. E o port do grifo
 * documenta a mesma coisa do lado do servidor: no Postgres `WHERE "page" = 45`
 * contra `NULL` é **falso**, então o filtro por página não traz o grifo sem
 * página. Cliente e servidor concordam, e é a fidelidade do §7.1.
 *
 * ⚠️ **OS DOIS QUE SOMEM SÃO A REGRA 2, e o segundo é o que ninguém escreve:**
 * a **anotação** (que nunca tem página, nem coluna) e o **grifo com `page`
 * nula** — grifar sem anotar a página é caso previsto, e a coluna é anulável de
 * propósito (`Int?`).
 */
describe('⚠️ the page range EXCLUDES what has no page (decision B, rule 2)', () => {
  const INSIDE = highlightEntry({ id: 'h-inside', page: 45 });
  const NO_PAGE = highlightEntry({ id: 'h-no-page', page: null });
  const NOTE = noteEntry({ id: 'n-1' });

  it('keeps the highlight whose page is inside the range', () => {
    // O par positivo (§7.4): sem ele, as duas linhas de baixo ficariam verdes
    // com um `matchesPage` que devolvesse `false` para tudo.
    expect(matchesPage(INSIDE, pages('10', '100'))).toBe(true);
  });

  it('⚠️ drops the NOTE, which never has a page at all (rule 2)', () => {
    expect(matchesPage(NOTE, pages('10', '100'))).toBe(false);
    // E sem faixa nenhuma ela volta: a dimensão não recorta enquanto ninguém
    // disse o que procurar — é o mesmo "termo vazio não recorta" do texto.
    expect(matchesPage(NOTE, EVERY_PAGE)).toBe(true);
  });

  it('⚠️ drops the HIGHLIGHT whose page is NULL — the one nobody writes (rule 2)', () => {
    /*
      ⚠️ **GRIFAR SEM ANOTAR A PÁGINA É CASO PREVISTO** — a coluna é `Int?` de
      propósito, e o `highlight-fields.tsx` trata o campo em branco como
      AUSÊNCIA (regra 15 da Tarefa 24), nunca como zero. Uma faixa que
      INCLUÍSSE esses grifos mentiria: eles não estão na faixa, ninguém sabe
      onde eles estão.
    */
    expect(NO_PAGE).toMatchObject({ highlight: { page: null } });
    expect(matchesPage(NO_PAGE, pages('10', '100'))).toBe(false);
    // Só a ponta de baixo, só a de cima: os dois lados excluem igual.
    expect(matchesPage(NO_PAGE, pages('10', ''))).toBe(false);
    expect(matchesPage(NO_PAGE, pages('', '100'))).toBe(false);
    expect(matchesPage(NO_PAGE, EVERY_PAGE)).toBe(true);
  });
});

/**
 * ⚠️ **AS DUAS PONTAS SÃO OPCIONAIS (decisão D), E A INVERTIDA DEVOLVE VAZIO
 * LITERALMENTE (decisão E).**
 */
describe('the two ends of the range, and what is not a bound', () => {
  const PAGE_9 = highlightEntry({ id: 'h-9', page: 9 });
  const PAGE_45 = highlightEntry({ id: 'h-45', page: 45 });
  const PAGE_200 = highlightEntry({ id: 'h-200', page: 200 });

  it('cuts nothing when both ends are empty', () => {
    expect(matchesPage(PAGE_9, EVERY_PAGE)).toBe(true);
    expect(matchesPage(PAGE_200, EVERY_PAGE)).toBe(true);
  });

  it('⚠️ takes only the LOWER end — "a partir da 40", with no ceiling', () => {
    expect(matchesPage(PAGE_9, pages('40', ''))).toBe(false);
    expect(matchesPage(PAGE_45, pages('40', ''))).toBe(true);
    expect(matchesPage(PAGE_200, pages('40', ''))).toBe(true);
  });

  it('⚠️ takes only the UPPER end — "até a 50", with no floor', () => {
    expect(matchesPage(PAGE_9, pages('', '50'))).toBe(true);
    expect(matchesPage(PAGE_45, pages('', '50'))).toBe(true);
    expect(matchesPage(PAGE_200, pages('', '50'))).toBe(false);
  });

  it('⚠️ has BOTH ends INCLUSIVE — the page written in the field is in the range', () => {
    /*
      "Os grifos do capítulo 3" é um pedido de FAIXA FECHADA: quem escreve 40 e
      55 está falando das páginas 40 e 55 também. Um `<` de um dos lados só
      apareceria na conta de quem lê a lista e não acha o grifo que ele acabou
      de marcar na primeira página do capítulo.
    */
    expect(matchesPage(PAGE_45, pages('45', '45'))).toBe(true);
    expect(matchesPage(PAGE_9, pages('9', '45'))).toBe(true);
    expect(matchesPage(PAGE_45, pages('9', '45'))).toBe(true);
  });

  it('⚠️ gives back NOTHING for an inverted range, and never swaps the ends (decision E)', () => {
    /*
      ⚠️ **NÃO "CONSERTAR" TROCANDO OS DOIS EM SILÊNCIO.** É o que a pessoa
      escreveu, e um filtro que desobedece é pior que um filtro que devolve
      nada: quem digitou 100 e 10 vê a lista vazia, entende o que fez e
      conserta — quem digitou 100 e 10 e recebe as páginas 10 a 100 passa a
      achar que o campo faz outra coisa.
    */
    expect(matchesPage(PAGE_45, pages('100', '10'))).toBe(false);
    expect(matchesPage(PAGE_9, pages('100', '10'))).toBe(false);
    expect(matchesPage(PAGE_200, pages('100', '10'))).toBe(false);
  });

  it('⚠️ treats what is not a whole page as NO bound, and trims the edges', () => {
    /*
      ⚠️ **O QUE NÃO É UM INTEIRO NÃO É UM LIMITE — é "ainda não me disseram até
      onde", nunca "não achei nada".** É a mesma decisão do termo vazio do
      texto. O `<input type="number">` já entrega `''` para o que ele não
      consegue ler, e esta função não depende disso para se comportar.
    */
    expect(matchesPage(PAGE_9, pages('   ', '  '))).toBe(true);
    expect(matchesPage(PAGE_9, pages('  40  ', ''))).toBe(false);
    expect(matchesPage(PAGE_9, pages('quarenta', ''))).toBe(true);
    expect(matchesPage(PAGE_9, pages('40,5', ''))).toBe(true);
    expect(matchesPage(PAGE_9, pages('40.5', ''))).toBe(true);
  });
});

/**
 * ⚠️ **CADA RECORTE DAS OUTRAS CINCO CONTÉM UMA ENTRADA FORA DA FAIXA — e essa é
 * a propriedade que faz o teste do AND valer** (regra 3, e é a lição que a
 * Tarefa 38g pagou do jeito difícil).
 *
 * Um teste de `faixa AND cor` fica **verde com a dimensão de faixa
 * inexistente** se todas as entradas daquela cor já estiverem dentro da faixa —
 * porque o recorte por cor sozinho devolveria a mesma lista. Por isso cada
 * dimensão deste fixture tem pelo menos uma entrada **fora** de `[10, 100]`, e
 * cada par abaixo mostra os **dois tamanhos**: com a faixa e sem ela.
 *
 * ⚠️ **E DUAS COMBINAÇÕES SÃO VAZIAS POR CONSTRUÇÃO, não por acaso:** a faixa
 * com uma LEITURA escolhida e a faixa com o tipo em anotação. A leitura só
 * existe na anotação do dia, a página só existe no grifo — é o mesmo "vazio por
 * construção" que cor + leitura já produziam desde a Tarefa 28, e a tela mostra
 * o estado "filtrado sem resultado", nunca uma lista que ignora um recorte.
 */
describe('⚠️ the sixth dimension is in AND with the other five (rule 3)', () => {
  const ENTRIES: readonly AcervoEntry[] = [
    highlightEntry({
      id: 'h-mine-40',
      page: 40,
      quote: 'A colina de quem chegou primeiro',
    }),
    highlightEntry({
      id: 'h-mine-120',
      page: 120,
      quote: 'A colina vista de longe',
    }),
    // O "mudo" do TEXTO: dentro da faixa e sem a palavra, para o par
    // faixa × texto ter os dois tamanhos.
    highlightEntry({
      id: 'h-mine-mute-50',
      page: 50,
      quote: 'Duas linhas sobre o anel',
      commentText: 'o anel muda de dono',
    }),
    highlightEntry({
      id: 'h-no-page',
      page: null,
      quote: 'A colina sem numero nenhum',
      commentDoc: null,
      commentText: '',
    }),
    highlightEntry({
      id: 'h-hers-55',
      userId: HER,
      color: GREEN,
      page: 55,
      quote: 'A colina de quem escreveu depois',
    }),
    highlightEntry({
      id: 'h-hers-200',
      userId: HER,
      color: GREEN,
      page: 200,
      quote: 'A colina no fim do livro',
    }),
    noteEntry({ id: 'n-free', plainText: 'a colina que a anotacao descreve' }),
    noteEntry({
      id: 'n-day',
      kind: 'PLAN',
      planItemId: 'p-1',
      userId: HER,
      plainText: 'a colina vista do outro lado',
    }),
  ];

  const RANGE = pages('10', '100');

  function visible(patch: Partial<AcervoFilter>): string[] {
    return idsOf(filterEntries(ENTRIES, { ...ALL_FILTER, ...patch }, ME));
  }

  it('cuts by the range alone, and only the highlights INSIDE it survive', () => {
    expect(visible({ page: RANGE })).toEqual([
      'h-mine-40',
      'h-mine-mute-50',
      'h-hers-55',
    ]);
    // Sem a faixa, as oito — as duas anotações e o grifo sem página incluídos.
    expect(visible({})).toHaveLength(8);
  });

  it('⚠️ AND with PERSON — and the person alone would show more', () => {
    expect(visible({ page: RANGE, author: MINE_SCOPE })).toEqual([
      'h-mine-40',
      'h-mine-mute-50',
    ]);
    expect(visible({ author: MINE_SCOPE })).toEqual([
      'h-mine-40',
      'h-mine-120',
      'h-mine-mute-50',
      'h-no-page',
      'n-free',
    ]);
    expect(visible({ page: RANGE, author: authorScope(HER) })).toEqual([
      'h-hers-55',
    ]);
    expect(visible({ author: authorScope(HER) })).toEqual([
      'h-hers-55',
      'h-hers-200',
      'n-day',
    ]);
  });

  it('⚠️ AND with TYPE — and the type alone would show more', () => {
    expect(visible({ page: RANGE, type: 'HIGHLIGHT' })).toEqual([
      'h-mine-40',
      'h-mine-mute-50',
      'h-hers-55',
    ]);
    expect(visible({ type: 'HIGHLIGHT' })).toEqual([
      'h-mine-40',
      'h-mine-120',
      'h-mine-mute-50',
      'h-no-page',
      'h-hers-55',
      'h-hers-200',
    ]);
    // ⚠️ E o tipo que exclui grifo esvazia a faixa POR CONSTRUÇÃO — é o mesmo
    // vazio de cor + leitura, e é por isso que o controle some (decisão C).
    expect(visible({ page: RANGE, type: 'PLAN' })).toEqual([]);
    expect(visible({ type: 'PLAN' })).toEqual(['n-day']);
  });

  it('⚠️ AND with COLOUR — and the colour alone would show more', () => {
    expect(visible({ page: RANGE, color: GREEN })).toEqual(['h-hers-55']);
    expect(visible({ color: GREEN })).toEqual(['h-hers-55', 'h-hers-200']);
    expect(visible({ page: RANGE, color: YELLOW })).toEqual([
      'h-mine-40',
      'h-mine-mute-50',
    ]);
    expect(visible({ color: YELLOW })).toEqual([
      'h-mine-40',
      'h-mine-120',
      'h-mine-mute-50',
      'h-no-page',
    ]);
  });

  it('⚠️ AND with READING — empty by construction, and the reading alone shows one', () => {
    expect(visible({ page: RANGE, reading: 'p-1' })).toEqual([]);
    expect(visible({ reading: 'p-1' })).toEqual(['n-day']);
  });

  it('⚠️ AND with TEXT — and each one alone would show more', () => {
    expect(visible({ page: RANGE, text: 'colina' })).toEqual([
      'h-mine-40',
      'h-hers-55',
    ]);
    expect(visible({ text: 'colina' })).toEqual([
      'h-mine-40',
      'h-mine-120',
      'h-no-page',
      'h-hers-55',
      'h-hers-200',
      'n-free',
      'n-day',
    ]);
    // E a faixa sozinha traz o "mudo" que a palavra descarta.
    expect(visible({ page: RANGE })).toEqual([
      'h-mine-40',
      'h-mine-mute-50',
      'h-hers-55',
    ]);
  });

  it('⚠️ the SIX together come back with exactly one line', () => {
    expect(
      visible({
        author: authorScope(HER),
        type: 'HIGHLIGHT',
        color: GREEN,
        reading: null,
        text: 'colina',
        page: RANGE,
      }),
    ).toEqual(['h-hers-55']);

    // E afrouxar a FAIXA é o que prova que ela estava valendo: as outras cinco
    // sozinhas devolvem DUAS linhas, e uma faixa que nenhum dos dois grifos
    // alcança esvazia o mesmo recorte.
    expect(
      visible({
        author: authorScope(HER),
        type: 'HIGHLIGHT',
        color: GREEN,
        text: 'colina',
      }),
    ).toEqual(['h-hers-55', 'h-hers-200']);
    expect(
      visible({
        author: authorScope(HER),
        type: 'HIGHLIGHT',
        color: GREEN,
        text: 'colina',
        page: pages('300', ''),
      }),
    ).toEqual([]);
  });
});

/**
 * ⚠️ **A DIMENSÃO DE LEITURA PASSA A ALCANÇAR O GRIFO (Tarefa 38i, decisão G).**
 *
 * Até aqui `readingOf` devolvia `null` para todo grifo, e `typeCanCarryReading`
 * respondia "só a anotação do dia": era a verdade enquanto o grifo não tinha
 * coluna de dia. A emenda de 2026-09-18 ao ADR 0004 deu-lhe `planItemId?`, e o
 * que muda aqui é o **alcance** da dimensão que já existia — nenhuma dimensão
 * nova, nenhum controle novo na tela.
 *
 * ⚠️ **O que NÃO muda: a decisão central do ADR 0004.** O campo é opcional, e o
 * grifo avulso — o que nasceu num dia sem plano — continua **sumindo** quando se
 * escolhe uma leitura, pela mesma fidelidade do §7.1 que exclui a anotação
 * avulsa: `= 'x'` contra coluna nula é falso.
 */
describe('⚠️ the READING dimension now reaches the highlight (decision G)', () => {
  it('reads the plan day of a highlight, like it already did for the note of the day', () => {
    expect(readingOf(highlightEntry({ planItemId: 'p-1' }))).toBe('p-1');
    expect(readingOf(noteEntry({ kind: 'PLAN', planItemId: 'p-1' }))).toBe(
      'p-1',
    );
  });

  /**
   * ⚠️ **O grifo AVULSO continua sem leitura, e é o caso que o ADR 0004
   * protege** — grifar num dia em que não há plano, ou em que não se escreveu
   * nada, continua possível. O par com a avulsa está aqui porque as duas
   * ausências têm a MESMA causa (coluna nula), e um `readingOf` que devolvesse
   * `''` ou `undefined` para uma delas quebraria o `!==` do recorte em silêncio.
   */
  it('still has no reading for the loose highlight nor for the loose note', () => {
    expect(readingOf(highlightEntry({ planItemId: null }))).toBeNull();
    expect(readingOf(noteEntry({ kind: 'FREE', planItemId: null }))).toBeNull();
  });

  /**
   * ⚠️ **O controle de leitura passa a existir com o tipo em "Grifo"**, e some
   * só em "Avulsa" — o único tipo que NUNCA carrega dia. Antes da 38i o grifo
   * estava do lado da avulsa aqui, e a tela escondia um `<select>` que agora tem
   * o que casar.
   */
  it('lets the HIGHLIGHT carry a reading, and only the FREE note cannot', () => {
    expect(typeCanCarryReading('HIGHLIGHT')).toBe(true);
    expect(typeCanCarryReading('PLAN')).toBe(true);
    expect(typeCanCarryReading(null)).toBe(true);
    expect(typeCanCarryReading('FREE')).toBe(false);
  });

  /**
   * ⚠️ **O FIXTURE NÃO É CÚMPLICE (regra 9):** cada recorte das outras cinco
   * contém pelo menos uma entrada **fora** do dia `p-1` — o grifo do dia `p-2`,
   * os dois grifos avulsos, a anotação do outro dia e a avulsa —, e por isso
   * nenhuma das colunas "sem a leitura" repete a "com a leitura". Um teste de
   * AND só prova o AND quando a outra dimensão, **sozinha**, devolveria MAIS.
   */
  describe('⚠️ and it is in AND with the other five (rule 9)', () => {
    const DAY = 'p-1';
    const OTHER_DAY = 'p-2';
    const RANGE: PageRange = { from: '10', to: '100' };

    const ENTRIES: readonly AcervoEntry[] = [
      highlightEntry({
        id: 'h-day-mine',
        planItemId: DAY,
        userId: ME,
        color: YELLOW,
        page: 20,
        quote: 'Uma porta redonda na colina',
        commentDoc: null,
        commentText: '',
      }),
      highlightEntry({
        id: 'h-day-hers',
        planItemId: DAY,
        userId: HER,
        color: GREEN,
        page: 120,
        quote: 'O dragao dormia sobre o ouro',
        commentText: 'o jantar dos anoes',
      }),
      highlightEntry({
        id: 'h-other-day',
        planItemId: OTHER_DAY,
        userId: ME,
        color: YELLOW,
        page: 50,
        quote: 'A colina vista do outro lado',
        commentDoc: null,
        commentText: '',
      }),
      highlightEntry({
        id: 'h-loose',
        planItemId: null,
        userId: ME,
        color: YELLOW,
        page: 30,
        quote: 'Zangado com o anel',
        commentText: 'o anel muda de dono',
      }),
      highlightEntry({
        id: 'h-hers-loose',
        planItemId: null,
        userId: HER,
        color: GREEN,
        page: 5,
        quote: 'O carneiro assado',
        commentDoc: null,
        commentText: '',
      }),
      noteEntry({
        id: 'n-day-hers',
        kind: 'PLAN',
        planItemId: DAY,
        userId: HER,
        plainText: 'ela abriu a porta antes de todos',
      }),
      noteEntry({
        id: 'n-other-day',
        kind: 'PLAN',
        planItemId: OTHER_DAY,
        userId: ME,
        plainText: 'a promessa vale o que custa cumpri-la',
      }),
      noteEntry({
        id: 'n-free',
        kind: 'FREE',
        planItemId: null,
        userId: ME,
        plainText: 'o que ela escreveu sobre a colina',
      }),
    ];

    function visible(patch: Partial<AcervoFilter>): string[] {
      return idsOf(filterEntries(ENTRIES, { ...ALL_FILTER, ...patch }, ME));
    }

    it('cuts by reading alone, over note AND highlight', () => {
      expect(visible({ reading: DAY })).toEqual([
        'h-day-mine',
        'h-day-hers',
        'n-day-hers',
      ]);
      // A precondição que dá dente: sem a leitura são as oito entradas.
      expect(visible({})).toHaveLength(8);
    });

    it('⚠️ AND with PERSON — and the person alone would show more', () => {
      expect(visible({ reading: DAY, author: MINE_SCOPE })).toEqual([
        'h-day-mine',
      ]);
      expect(visible({ author: MINE_SCOPE })).toHaveLength(5);

      expect(visible({ reading: DAY, author: authorScope(HER) })).toEqual([
        'h-day-hers',
        'n-day-hers',
      ]);
      expect(visible({ author: authorScope(HER) })).toHaveLength(3);
    });

    it('⚠️ AND with TYPE — and the type alone would show more', () => {
      expect(visible({ reading: DAY, type: 'HIGHLIGHT' })).toEqual([
        'h-day-mine',
        'h-day-hers',
      ]);
      expect(visible({ type: 'HIGHLIGHT' })).toHaveLength(5);

      expect(visible({ reading: DAY, type: 'PLAN' })).toEqual(['n-day-hers']);
      expect(visible({ type: 'PLAN' })).toHaveLength(2);
    });

    // ⚠️ "Avulsa" com uma leitura é vazio POR CONSTRUÇÃO — e é o par que prova
    // que o grifo avulso e a anotação avulsa continuam do mesmo lado.
    it('⚠️ AND with TYPE free — empty by construction, and the type alone shows one', () => {
      expect(visible({ reading: DAY, type: 'FREE' })).toEqual([]);
      expect(visible({ type: 'FREE' })).toEqual(['n-free']);
    });

    it('⚠️ AND with COLOUR — and the colour alone would show more', () => {
      expect(visible({ reading: DAY, color: YELLOW })).toEqual(['h-day-mine']);
      expect(visible({ color: YELLOW })).toHaveLength(3);

      expect(visible({ reading: DAY, color: GREEN })).toEqual(['h-day-hers']);
      expect(visible({ color: GREEN })).toHaveLength(2);
    });

    it('⚠️ AND with TEXT — and the text alone would show more', () => {
      expect(visible({ reading: DAY, text: 'colina' })).toEqual(['h-day-mine']);
      expect(visible({ text: 'colina' })).toHaveLength(3);
    });

    it('⚠️ AND with the PAGE RANGE — and the range alone would show more', () => {
      expect(visible({ reading: DAY, page: RANGE })).toEqual(['h-day-mine']);
      expect(visible({ page: RANGE })).toHaveLength(3);
    });

    /**
     * ⚠️ **AS SEIS JUNTAS**, e o par que prova que a leitura estava valendo:
     * soltá-la devolve DUAS linhas, porque o grifo do outro dia satisfaz as
     * outras cinco.
     */
    it('⚠️ all SIX together, and dropping the reading shows more', () => {
      const five: Partial<AcervoFilter> = {
        author: MINE_SCOPE,
        type: 'HIGHLIGHT',
        color: YELLOW,
        text: 'colina',
        page: RANGE,
      };

      expect(visible({ ...five, reading: DAY })).toEqual(['h-day-mine']);
      expect(visible(five)).toEqual(['h-day-mine', 'h-other-day']);
    });
  });
});
