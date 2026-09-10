import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  BookResponse,
  ClubMemberResponse,
  HighlightResponse,
  NoteDocBody,
  NoteResponse,
} from '@clube/shared';
import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { en, pt } from '@clube/shared/locales';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import type { ClubSummary } from '../../club/active-club';
import { dayNotePath } from '../day-note';
import { freeNotePath } from '../free-note';
import { highlightPath, searchPath } from '../paths';
import { expectNoGuilt, stripComments } from './anti-guilt-dom';
import {
  aBook,
  memoryStorage,
  meReply,
  readableText,
  type RecordedRequest,
  renderPage,
  type Reply,
  replyByUrl,
  requestsTo,
  type Responder,
  stubFetch,
} from './harness';

/**
 * A BUSCA NO ACERVO DO CLUBE — as 18 regras da Tarefa 29 (as 11 de tela e as
 * transversais; as do backend têm suíte própria).
 *
 * Entra pelo `<App />` inteiro, como as telas 16 a 28: metade do que a fatia
 * entrega é composição — a rota nova, o `RequireAuth` que a protege, o clube
 * ATIVO do cabeçalho e o `me` do contexto que decide "meu × dela".
 *
 * ⚠️ **O DUBLÊ DO EDITOR EXISTE AQUI SEM QUE ESTA TELA USE EDITOR NENHUM** — o
 * mesmo motivo do `acervo.test.tsx`: um teste toca um resultado e chega na tela
 * que escreve, e lá o `React.lazy` importaria o ProseMirror inteiro para provar
 * uma navegação. Que ESTA tela não importa editor é uma varredura de fonte, no
 * fim do arquivo.
 *
 * ⚠️ **AS VARREDURAS SÃO AS ÚNICAS, E O `expectNoGuilt()` JÁ EMBUTE A DE
 * PRIVACIDADE** (conserto da Tarefa 25) — **nunca a chame duas vezes**. A de
 * **catálogo** (as duas: anti-culpa e ADR 0002) percorre `pt` **e** `en`
 * inteiros em `packages/shared/src/locales/__tests__/`, desde a Tarefa 27, e as
 * chaves novas desta fatia entram nela por construção — sem uma linha aqui.
 *
 * ⚠️ **O DEBOUNCE SE PROVA POR CONTAGEM, com timers FALSOS** (§7.3): um tique
 * antes do prazo, zero requisições; no tique, duas. Cronômetro nunca.
 */
vi.mock('@clube/ui/editor', () => ({
  RichEditor: () => <div data-testid="editor" />,
}));

const CASAL: ClubSummary = {
  id: 'c-casal',
  name: 'Clube do Casal',
  role: 'OWNER',
};

const SESSION: Record<string, string> = {
  [TOKEN_STORAGE_KEY]: 'token-da-sessao',
};

const CLUB_ID = 'c-casal';

/** O `id` que o `meReply()` do harness devolve. Sou eu. */
const MARCOS = 'u-marcos';
const MARIA = 'u-maria';

/**
 * ⚠️ **DOIS LIVROS, e é o que torna a decisão E observável** ("o resultado diz
 * de qual livro é"): com um livro só, uma tela que mostrasse sempre o mesmo
 * título — ou o título errado — passaria em todo teste.
 *
 * Os títulos não são substring um do outro (pinado no bloco de fixture), senão
 * a asserção de "qual livro" mediria o acidente.
 */
const HOBBIT_ID = 'b-hobbit';
const HOBBIT_TITLE = 'O Hobbit';
const SILMA_ID = 'b-silmarillion';
const SILMA_TITLE = 'A Queda de Gondolin';

const YELLOW = '#facc15';
const GREEN = '#22c55e';

/** O dia do plano em que a anotação da Maria está ancorada. */
const PLAN_ITEM_ID = 'p-a';

/** O termo que os fixtures casam. Duas letras ou mais (regra 9). */
const TERM = 'esmeralda';

function aDoc(text: string): NoteDocBody {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

/** A estante do clube — é ela que dá o TÍTULO de cada livro (decisão E). */
function books(): BookResponse[] {
  return [
    aBook({ id: HOBBIT_ID, clubId: CLUB_ID, title: HOBBIT_TITLE }),
    aBook({ id: SILMA_ID, clubId: CLUB_ID, title: SILMA_TITLE }),
  ];
}

function members(): ClubMemberResponse[] {
  return [
    { userId: MARCOS, name: 'Marcos', role: 'OWNER', status: 'ACTIVE' },
    { userId: MARIA, name: 'Maria', role: 'ADMIN', status: 'ACTIVE' },
  ];
}

/**
 * Um grifo como a API o devolve — factory com `overrides` (§7.7).
 *
 * O CONTRATO REAL, medido em `highlightResponseSchema`: `page`, `reference`,
 * `commentDoc` e `archivedAt` são **nullable, não opcionais** (o serializer do
 * Zod exige a chave) e `commentText` é `string` sempre (derivado no backend,
 * ADR 0001).
 */
function aHighlight(
  overrides: Partial<HighlightResponse> = {},
): HighlightResponse {
  return {
    id: 'h-1',
    clubId: CLUB_ID,
    bookId: HOBBIT_ID,
    userId: MARCOS,
    quote: 'A promessa do anao',
    color: YELLOW,
    page: 9,
    reference: 'Cap. 1',
    commentDoc: aDoc('vale o que custa cumpri-la'),
    commentText: 'vale o que custa cumpri-la',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: '2026-09-04T10:10:00.000Z',
    updatedAt: '2026-09-04T10:10:00.000Z',
    ...overrides,
  };
}

/** Fixture é factory (§7.7) — e o `doc` é uma árvore MUTÁVEL por dentro. */
function aNote(overrides: Partial<NoteResponse> = {}): NoteResponse {
  return {
    id: 'n-1',
    clubId: CLUB_ID,
    bookId: HOBBIT_ID,
    userId: MARCOS,
    kind: 'FREE',
    planItemId: null,
    title: 'O dragao e o ouro',
    reference: null,
    doc: { type: 'doc' },
    plainText: 'o trecho que aparece na lista',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: '2026-09-04T10:55:00.000Z',
    updatedAt: '2026-09-04T10:55:00.000Z',
    ...overrides,
  };
}

/**
 * ⚠️ **O RESULTADO É ESCOLHIDO PARA A IMPLEMENTAÇÃO ERRADA FALHAR** (§7.2/§7.8),
 * e cada propriedade mata um mutante diferente:
 *
 * 1. **a ordem por TIPO e a ordem por DATA DISCORDAM** (regra 12). As duas
 *    listagens chegam separadas e cada uma já vem em `createdAt` desc — então
 *    "concatena as duas" é a implementação errada mais provável, e ela põe as
 *    três anotações antes dos dois grifos. O fixture INTERCALA, e não em
 *    alternância perfeita (há duas anotações seguidas), para nem um "zíper"
 *    passar. A precondição está **pinada** no primeiro bloco;
 * 2. **os dois LIVROS aparecem, e não na ordem da lista** (decisão E): um
 *    resultado do Hobbit está no meio de dois de Gondolin, então uma tela que
 *    mostrasse "o primeiro livro da estante" em toda linha acusa;
 * 3. **as contagens por TIPO são diferentes**: 3 anotações, 2 grifos;
 * 4. **tipo e AUTORIA não coincidem**: eu tenho avulsa e grifo; a Maria tem do
 *    dia, avulsa e grifo. Um filtro que confundisse os dois eixos acusa;
 * 5. **os `createdAt` são todos DISTINTOS**, então a ordem não depende de
 *    critério de empate nenhum;
 * 6. **os rótulos não estão na ordem da tela** nem em ordem alfabética: uma
 *    tela que ordenasse por título ou por trecho acusa.
 */
const MY_FREE_TITLE = 'O dragao e o ouro';
const HER_PLAN_TITLE = 'O capitulo de hoje';
const HER_FREE_TITLE = 'A carta que ficou';
const MY_QUOTE = 'A esmeralda de Feanor';
const HER_QUOTE = 'Uma porta redonda e verde';

const MY_HIGHLIGHT_ID = 'h-meu';
const HER_HIGHLIGHT_ID = 'h-dela';
const MY_FREE_ID = 'n-meu';
const HER_PLAN_ID = 'n-dela-dia';
const HER_FREE_ID = 'n-dela-avulsa';

/**
 * A ORDEM DA TELA — `createdAt` decrescente, com os dois tipos intercalados.
 *
 * O rótulo de cada entrada é o que a linha mostra como conteúdo principal: o
 * título da anotação ou o trecho do grifo.
 */
const ORDERED_LABELS = [
  MY_FREE_TITLE, // 10:55 · avulsa · minha · Hobbit
  HER_QUOTE, // 10:52 · grifo  · dela  · Hobbit
  MY_QUOTE, // 10:50 · grifo  · meu   · Gondolin
  HER_PLAN_TITLE, // 10:45 · do dia · dela  · Hobbit
  HER_FREE_TITLE, // 10:30 · avulsa · dela  · Gondolin
] as const;

function notes(): NoteResponse[] {
  return [
    aNote({
      id: MY_FREE_ID,
      userId: MARCOS,
      kind: 'FREE',
      planItemId: null,
      bookId: HOBBIT_ID,
      title: MY_FREE_TITLE,
      plainText: 'a esmeralda no bolso do dragao',
      createdAt: '2026-09-04T10:55:00.000Z',
    }),
    aNote({
      id: HER_PLAN_ID,
      userId: MARIA,
      kind: 'PLAN',
      planItemId: PLAN_ITEM_ID,
      bookId: HOBBIT_ID,
      title: HER_PLAN_TITLE,
      plainText: 'a esmeralda que ela leu hoje',
      createdAt: '2026-09-04T10:45:00.000Z',
    }),
    aNote({
      id: HER_FREE_ID,
      userId: MARIA,
      kind: 'FREE',
      planItemId: null,
      bookId: SILMA_ID,
      title: HER_FREE_TITLE,
      // ⚠️ Prévia VAZIA de propósito: é o ramo em que o subtítulo é só o
      // contexto (livro · autoria), sem o ` · ` órfão no fim.
      plainText: '',
      createdAt: '2026-09-04T10:30:00.000Z',
    }),
  ];
}

/** Em `createdAt` desc, que é como o `listHighlights` os devolve. */
function highlights(): HighlightResponse[] {
  return [
    aHighlight({
      id: HER_HIGHLIGHT_ID,
      userId: MARIA,
      bookId: HOBBIT_ID,
      color: GREEN,
      // ⚠️ SEM página e SEM comentário: os dois ramos de ausência silenciosa.
      page: null,
      reference: null,
      quote: HER_QUOTE,
      commentDoc: null,
      commentText: '',
      createdAt: '2026-09-04T10:52:00.000Z',
    }),
    aHighlight({
      id: MY_HIGHLIGHT_ID,
      userId: MARCOS,
      bookId: SILMA_ID,
      color: YELLOW,
      page: 112,
      quote: MY_QUOTE,
      commentDoc: aDoc('a esmeralda mudou o reino'),
      commentText: 'a esmeralda mudou o reino',
      createdAt: '2026-09-04T10:50:00.000Z',
    }),
  ];
}

interface SearchSetup {
  /** `GET /clubs/:clubId/notes?text=…` — `Responder` para a falha que se conserta. */
  notes?: Reply | Responder;
  /** `GET /clubs/:clubId/highlights?text=…`. */
  list?: Reply | Responder;
  /** `GET /clubs/:clubId/books` — a estante que dá o título de cada livro. */
  books?: Reply | Responder;
  /** `GET /clubs/:clubId/members`. */
  members?: Reply | Responder;
  /** `GET /me` — `Responder` para o estado em que ele ainda NÃO chegou. */
  me?: Reply | Responder;
  path?: string;
}

const NOTHING: Reply = { status: 200, body: [] };

/**
 * O shell autenticado inteiro, endpoint por endpoint.
 *
 * ⚠️ A ORDEM importa e cada linha tem um motivo:
 * - `/members` vem ANTES de `/me`, e é um falso verde MEDIDO na Tarefa 27: o
 *   `replyByUrl` casa por SUBSTRING, e `/clubs/c-casal/members` **contém**
 *   `/me`. Com a rota de membros embaixo, o nome de quem escreveu receberia o
 *   corpo do `GET /me`, o `clubMembersResponseSchema` o recusaria (§6.8), e a
 *   tela cairia no ramo degradado — o teste do nome ficaria vermelho por um
 *   motivo que não tem nada a ver com o que ele prova;
 * - `/notes`, `/highlights` e `/books` não são substring um do outro.
 */
function searchResponder(setup: SearchSetup): Responder {
  return replyByUrl(
    [
      ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
      ['/members', setup.members ?? { status: 200, body: members() }],
      ['/me', setup.me ?? meReply({ clubs: [CASAL] })],
      ['/notes', setup.notes ?? { status: 200, body: notes() }],
      ['/highlights', setup.list ?? { status: 200, body: highlights() }],
      ['/books', setup.books ?? { status: 200, body: books() }],
    ],
    { status: 500, body: { error: 'Internal Server Error' } },
  );
}

async function settle(): Promise<void> {
  for (let step = 0; step < 10; step += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderBusca(
  setup: SearchSetup = {},
): Promise<RecordedRequest[]> {
  const calls = stubFetch(searchResponder(setup));

  await act(async () => {
    renderPage(<App />, {
      path: setup.path ?? searchPath(),
      storage: memoryStorage({ ...SESSION }),
    });
  });
  await settle();

  return calls;
}

/** O campo de busca — `type="search"`, então o papel é `searchbox`. */
function field(): HTMLElement {
  return screen.getByRole('searchbox', {
    name: pt.pages.busca.field.label,
  });
}

/** Digita no campo. O gatilho da busca é o DEBOUNCE, nunca um submit. */
async function type(value: string): Promise<void> {
  await act(async () => {
    fireEvent.change(field(), { target: { value } });
  });
  await settle();
}

/** Avança o relógio FALSO e deixa o que ele disparou terminar. */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await settle();
}

async function press(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
  await settle();
}

/** As requisições de BUSCA — as duas listagens, e só elas. */
function searchCalls(calls: readonly RecordedRequest[]): RecordedRequest[] {
  return [
    ...requestsTo(calls, '/notes'),
    ...requestsTo(calls, `/${CLUB_ID}/highlights`),
  ];
}

function rows(): HTMLElement[] {
  const list = screen.queryByRole('list', { name: pt.pages.busca.label });
  if (list === null) return [];
  return Array.from(list.querySelectorAll('li'));
}

/**
 * Os rótulos NA ORDEM DA TELA — a observável da regra 12.
 *
 * ⚠️ É `flatMap` sobre uma lista de rótulos MUTUAMENTE NÃO-SUBSTRING (pinado no
 * primeiro bloco): com um deles contido em outro, uma linha contaria duas vezes
 * e a asserção de ordem passaria a medir o acidente.
 */
function labelsOnScreen(): string[] {
  return rows().flatMap((row) =>
    ORDERED_LABELS.filter((label) => row.textContent?.includes(label)),
  );
}

function rowOf(text: string): HTMLElement {
  const row = rows().find((item) => item.textContent?.includes(text));
  if (row === undefined) throw new Error(`nenhuma linha com "${text}"`);
  return row;
}

function linksIn(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll('a'));
}

function locationNow(): string {
  return screen.getByTestId('location').textContent ?? '';
}

function buscaSource(): string {
  return readFileSync(resolve(__dirname, '..', 'busca.tsx'), 'utf8');
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
// O fixture, antes de qualquer tela: sem estas precondições os testes de ordem
// e de livro medem coincidência (§7.2, §7.8)
// ─────────────────────────────────────────────────────────────────────────────

describe('the fixture is hostile to the wrong implementations (§7.2, §7.8)', () => {
  it('⚠️ makes the order by TYPE and the order by DATE disagree (rule 12)', () => {
    const merged = [...notes(), ...highlights()];

    // Precondição 1: os `createdAt` são todos DISTINTOS, então a ordem esperada
    // não depende de critério de empate nenhum.
    const stamps = merged.map((entry) => entry.createdAt);
    expect(new Set(stamps).size).toBe(stamps.length);

    // ⚠️ Precondição 2: "concatena as duas listagens" NÃO é a ordem da tela —
    // cada listagem já vem em `createdAt` desc do backend, então concatenar põe
    // as três anotações antes dos dois grifos. É o mutante mais provável desta
    // fatia, e o `mergeEntries` é o que o mata.
    const concatenated = merged.map((entry) =>
      'quote' in entry ? entry.quote : entry.title,
    );
    expect(concatenated).not.toEqual([...ORDERED_LABELS]);

    // A ordem da tela é a decrescente por `createdAt`, e ela INTERCALA.
    const byDate = [...merged]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((entry) => ('quote' in entry ? entry.quote : entry.title));
    expect(byDate).toEqual([...ORDERED_LABELS]);

    /*
      ⚠️ E a intercalação NÃO é alternância perfeita: há dois grifos seguidos e
      duas anotações seguidas (`NHHNN`), então nem um "zíper" — um de cada,
      alternando — passa. A primeira redação deste fixture era exatamente um
      zíper (`NHNHN`), e foi este `expect` que denunciou.
    */
    const kinds = [...merged]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((entry) => ('quote' in entry ? 'H' : 'N'));
    expect(kinds.join('')).toContain('HH');
    expect(kinds.join('')).toContain('NN');
  });

  it('⚠️ has no label contained in another one', () => {
    for (const label of ORDERED_LABELS) {
      const others = ORDERED_LABELS.filter((other) => other !== label);
      expect(others.some((other) => other.includes(label))).toBe(false);
    }
  });

  /**
   * ⚠️ A precondição da DECISÃO E: os dois livros aparecem, os títulos não são
   * substring um do outro, e a ordem dos livros na lista **não** é a ordem da
   * estante — então uma tela que mostrasse "o primeiro livro" em toda linha, ou
   * que confundisse as duas listas, acusa.
   */
  it('⚠️ spreads the results over TWO books, in an order that is not the shelf order', () => {
    expect(HOBBIT_TITLE.includes(SILMA_TITLE)).toBe(false);
    expect(SILMA_TITLE.includes(HOBBIT_TITLE)).toBe(false);

    const byDate = [...notes(), ...highlights()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    expect(byDate.map((entry) => entry.bookId)).toEqual([
      HOBBIT_ID,
      HOBBIT_ID,
      SILMA_ID,
      HOBBIT_ID,
      SILMA_ID,
    ]);
    // E a estante devolve o Hobbit primeiro: "sempre o primeiro da estante"
    // daria Hobbit nas cinco linhas.
    expect(books().map((book) => book.id)).toEqual([HOBBIT_ID, SILMA_ID]);
  });

  // ⚠️ Tipo e autoria não coincidem: um eixo confundido com o outro acusa.
  it('⚠️ makes type and authorship cut across each other', () => {
    const mine = [
      ...notes().filter((note) => note.userId === MARCOS),
      ...highlights().filter((row) => row.userId === MARCOS),
    ];
    const hers = [
      ...notes().filter((note) => note.userId === MARIA),
      ...highlights().filter((row) => row.userId === MARIA),
    ];

    expect(mine).toHaveLength(2);
    expect(hers).toHaveLength(3);
    expect(notes()).toHaveLength(3);
    expect(highlights()).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regras 8 e 9 — o que a tela PEDE, contado com timers falsos (§7.3)
// ─────────────────────────────────────────────────────────────────────────────

describe('what the screen ASKS FOR (rules 8 and 9)', () => {
  /**
   * ⚠️ **REGRA 8 — termo vazio não pede NADA, e o estado inicial é próprio.**
   *
   * O contador é o que separa "não pediu" de "pediu e não mostrou": os dois
   * desenhos deixam a tela igual (§7.3).
   */
  it('asks for no listing at all while the field is empty, and shows its OWN initial state', async () => {
    vi.useFakeTimers();
    const calls = await renderBusca();

    expect(searchCalls(calls)).toHaveLength(0);
    expect(screen.queryByText(pt.pages.busca.start.title)).not.toBeNull();
    expect(screen.queryByText(pt.pages.busca.start.description)).not.toBeNull();
    // ⚠️ E ele é DIFERENTE do "não achei" (regra 11): os dois estados nunca são
    // o mesmo texto.
    expect(screen.queryByText(pt.pages.busca.empty.title)).toBeNull();
    expect(rows()).toHaveLength(0);
    expectNoGuilt();

    // E o prazo do debounce passar não faz aparecer requisição nenhuma: o campo
    // vazio nem monta timer.
    await advance(10_000);
    expect(searchCalls(calls)).toHaveLength(0);
  });

  /**
   * ⚠️ **REGRA 9 — UM caractere não pede nada**, nem depois do prazo.
   *
   * Uma letra casa quase tudo e custa duas consultas de até 500 linhas.
   */
  it('asks for nothing for a single character, even after the debounce elapses', async () => {
    vi.useFakeTimers();
    const calls = await renderBusca();

    await type('e');
    await advance(10_000);

    expect(searchCalls(calls)).toHaveLength(0);
    // E a tela continua no estado inicial — não em "procurando…" nem em "não
    // achei".
    expect(screen.queryByText(pt.pages.busca.start.title)).not.toBeNull();
    expect(screen.queryByText(pt.pages.busca.empty.title)).toBeNull();
    expectNoGuilt();
  });

  // Regra 9 — e um caractere depois de espaços continua sendo um caractere: o
  // corte é sobre o termo já sem as pontas.
  it('asks for nothing for a single character surrounded by spaces', async () => {
    vi.useFakeTimers();
    const calls = await renderBusca();

    await type('   e   ');
    await advance(10_000);

    expect(searchCalls(calls)).toHaveLength(0);
  });

  /**
   * ⚠️ **REGRA 9 — A FRONTEIRA DO DEBOUNCE, contada: um tique ANTES, zero; no
   * tique, DUAS.**
   *
   * É o formato da Tarefa 18, e o lado NEGATIVO é o que importa: sem ele, "pede
   * sempre, a cada tecla" passaria.
   */
  it('sends NO request one tick before the debounce, and TWO on the tick', async () => {
    vi.useFakeTimers();
    const calls = await renderBusca();

    await type(TERM);
    await advance(399);
    // ⚠️ O lado NEGATIVO do par.
    expect(searchCalls(calls)).toHaveLength(0);

    await advance(1);
    // As DUAS listagens, sempre juntas (regra 14).
    expect(searchCalls(calls)).toHaveLength(2);
    expect(requestsTo(calls, '/notes')).toHaveLength(1);
    expect(requestsTo(calls, `/${CLUB_ID}/highlights`)).toHaveLength(1);
    expectNoGuilt();
  });

  /**
   * ⚠️ **REGRA 9 — É DEBOUNCE, NÃO THROTTLE: a espera REINICIA a cada tecla.**
   *
   * Um throttle já teria pedido aos 400 ms contados da PRIMEIRA tecla. E é UMA
   * busca (duas requisições), não duas: a primeira espera foi cancelada, não
   * somada.
   */
  /**
   * ⚠️ **O PAR POSITIVO DO MÍNIMO — e ele não existia (achado ALTO/MÉDIO 2 da
   * auditoria).**
   *
   * O lado negativo ("0 e 1 caractere não pedem") tinha dois donos; o positivo
   * ("**dois** caracteres PEDEM") tinha **zero**. É o meio contador do §7.3 na
   * letra, e o preço estava medido: subir o mínimo de 2 para **3** deixava a
   * tela parada no estado inicial para quem digitou uma palavra de duas letras,
   * com **0 acusadores em 600**.
   *
   * ⚠️ E o termo é de **exatamente** dois caracteres de propósito: com um termo
   * longo (`'esmeralda'`) um mínimo de 3, 4 ou 5 passaria igual.
   */
  it('DOES ask at the minimum length — exactly two characters is a search', async () => {
    vi.useFakeTimers();
    const calls = await renderBusca();

    await type('es');
    await advance(400);

    expect(searchCalls(calls)).toHaveLength(2);
    expect(requestsTo(calls, '/notes')[0]?.url).toContain('text=es');
  });

  /**
   * ⚠️ **O ESTADO "PROCURANDO…" — e ele era renderizado pela tela e por
   * NENHUM teste (achado ALTO da auditoria).**
   *
   * Três medições da auditoria, todas contra 600 testes verdes:
   * `return null` naquele ramo dava **0 acusadores**; uma cobrança em texto
   * puro plantada nele (que casa `deixou` **e** a `COUNTER_SHAPE`) dava **0**;
   * a mesma frase no ramo `empty` dava **1**. Ou seja: a regra 15 ("as
   * varreduras rodam em TODOS os estados novos") era **falsa** justamente para
   * o estado que ninguém segurava — a classe que a Tarefa 28 pegou.
   *
   * ⚠️ **E O QUE FAZIA O ESTADO SER INVISÍVEL ERA A FRASE COMPARTILHADA**: o
   * `/me` pendente e a busca no ar diziam o MESMO texto, então o teste do `/me`
   * afirmava a frase e nenhuma asserção distinguia os dois. Agora são
   * `clubLoading` e `loading`, e este teste afirma as **três** coisas que só
   * este estado tem: a frase da BUSCA, o campo **na tela** com o termo, e
   * nenhuma linha ainda.
   *
   * A listagem de notas fica pendente para sempre (`new Promise(() => …)`), que
   * é o formato do teste do `/me` — e o `Promise.all` não resolve com uma
   * metade no ar, que é exatamente a regra 14 vista de dentro.
   */
  it('says it is SEARCHING while the two listings are in flight, with the field still on screen', async () => {
    vi.useFakeTimers();
    const calls = await renderBusca({
      notes: () => new Promise<Reply>(() => undefined),
    });

    await type(TERM);
    await advance(400);

    // As duas saíram (regra 14: nunca meia busca)...
    expect(searchCalls(calls)).toHaveLength(2);
    // ...e a tela está no estado da BUSCA, não no do clube.
    expect(screen.queryByText(pt.pages.busca.loading)).not.toBeNull();
    expect(screen.queryByText(pt.pages.busca.clubLoading)).toBeNull();
    // ⚠️ O campo continua na tela COM o termo — é o que distingue este estado
    // do `/me` pendente, onde não há campo nenhum.
    expect(field()).toHaveProperty('value', TERM);
    // E nenhum dos outros estados vazou: nem inicial, nem sem-resultado, nem
    // falha, nem lista.
    expect(screen.queryByText(pt.pages.busca.start.title)).toBeNull();
    expect(screen.queryByText(pt.pages.busca.empty.title)).toBeNull();
    expect(screen.queryByText(pt.pages.busca.unavailable)).toBeNull();
    expect(rows()).toHaveLength(0);
    // ⚠️ E A VARREDURA RODA AQUI, que é o que faltava.
    expectNoGuilt();
  });

  it('RESTARTS the wait on every keystroke — debounce, not throttle', async () => {
    vi.useFakeTimers();
    const calls = await renderBusca();

    await type('es');
    await advance(300);
    expect(searchCalls(calls)).toHaveLength(0);

    await type('esm');
    await advance(300);
    // Um THROTTLE já teria pedido aqui, aos 600 ms da primeira tecla.
    expect(searchCalls(calls)).toHaveLength(0);

    await advance(100);
    expect(searchCalls(calls)).toHaveLength(2);
  });

  /**
   * ⚠️ **O TERMO VAI PELA OPÇÃO `query` DO CLIENTE, que escapa sozinha.**
   *
   * É a armadilha que a Tarefa 24 mediu com o `#` da cor (`?color=#facc15` não
   * chega ao servidor: `#` é delimitador de FRAGMENTO). Aqui ela morderia em
   * `&`, `#` e `+`, que são caracteres normais no que alguém escreveu num livro
   * — e uma concatenação faria a busca por `a & b` procurar por `a `.
   */
  it('percent-encodes the term instead of concatenating it into the URL', async () => {
    vi.useFakeTimers();
    const calls = await renderBusca();

    await type('a & b #1');
    await advance(400);

    const [noteCall] = requestsTo(calls, '/notes');
    expect(noteCall?.url).toContain('text=a+%26+b+%231');
    // A prova de que nada vazou como delimitador: a URL não tem `#` nem `&`
    // crus depois do `text=`.
    expect(noteCall?.url.split('text=')[1]).not.toContain('#');
  });

  // O termo chega SEM as pontas — o `trim` é do cliente e do UseCase, e o de cá
  // é o que impede uma segunda busca só porque a pessoa apertou espaço.
  it('trims the term before asking, and a trailing space does not ask again', async () => {
    vi.useFakeTimers();
    const calls = await renderBusca();

    await type(`  ${TERM}  `);
    await advance(400);
    expect(searchCalls(calls)).toHaveLength(2);
    expect(requestsTo(calls, '/notes')[0]?.url).toContain(`text=${TERM}`);

    await type(`  ${TERM} `);
    await advance(400);
    // O termo NORMALIZADO não mudou, então o efeito não refaz a busca.
    expect(searchCalls(calls)).toHaveLength(2);
  });

  // Apagar o campo volta ao estado INICIAL — não a "não achei", e sem pedir.
  it('goes back to the initial state when the field is cleared, without asking again', async () => {
    vi.useFakeTimers();
    const calls = await renderBusca();

    await type(TERM);
    await advance(400);
    expect(searchCalls(calls)).toHaveLength(2);

    await type('');
    await advance(10_000);

    expect(searchCalls(calls)).toHaveLength(2);
    expect(screen.queryByText(pt.pages.busca.start.title)).not.toBeNull();
    expect(rows()).toHaveLength(0);
    expectNoGuilt();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regras 10, 12 e 13 — o que cada resultado DIZ, e para onde ele leva
// ─────────────────────────────────────────────────────────────────────────────

describe('what a result says (rules 10 and 12)', () => {
  async function search(setup: SearchSetup = {}): Promise<RecordedRequest[]> {
    vi.useFakeTimers();
    const calls = await renderBusca(setup);
    await type(TERM);
    await advance(400);
    return calls;
  }

  /**
   * ⚠️ **REGRA 12 — a ordem é `createdAt` desc, INTERCALADA**, pelo
   * `mergeEntries` do `acervo-entries.ts`.
   *
   * O fixture tem a ordem por tipo e a por data em desacordo (pinado acima), e é
   * isso que faz "concatena as duas listagens" — a implementação errada mais
   * provável — falhar aqui.
   */
  it('lists the two kinds interleaved, newest first', async () => {
    await search();

    expect(labelsOnScreen()).toEqual([...ORDERED_LABELS]);
    expectNoGuilt();
  });

  /**
   * ⚠️ **REGRA 10 — o resultado diz DE QUAL LIVRO é** (decisão E).
   *
   * Sem isso um resultado de clube é ambíguo: "página 112" em qual livro? É o
   * campo que distingue esta tela do acervo de um livro.
   */
  it('says which BOOK each result belongs to, for both kinds', async () => {
    await search();

    // A anotação do Hobbit diz "O Hobbit"...
    expect(rowOf(MY_FREE_TITLE).textContent).toContain(HOBBIT_TITLE);
    // ...e a de Gondolin diz Gondolin — a prova de que não é sempre o mesmo.
    expect(rowOf(HER_FREE_TITLE).textContent).toContain(SILMA_TITLE);
    // O mesmo para o grifo, nas duas direções.
    expect(rowOf(MY_QUOTE).textContent).toContain(SILMA_TITLE);
    expect(rowOf(HER_QUOTE).textContent).toContain(HOBBIT_TITLE);
    // E nenhuma linha diz os DOIS livros.
    expect(rowOf(MY_FREE_TITLE).textContent).not.toContain(SILMA_TITLE);
    expect(rowOf(MY_QUOTE).textContent).not.toContain(HOBBIT_TITLE);
  });

  /**
   * ⚠️ **REGRA 10 — o TIPO em texto, em toda linha** (ADR 0004: o grifo não é
   * um tipo de anotação, e numa lista unificada o leitor não pode ter de
   * adivinhar).
   */
  it('says the KIND of each result in words', async () => {
    await search();

    expect(rowOf(MY_FREE_TITLE).textContent).toContain(
      pt.pages.acervo.kind.free,
    );
    expect(rowOf(HER_PLAN_TITLE).textContent).toContain(
      pt.pages.acervo.kind.plan,
    );
    expect(rowOf(MY_QUOTE).textContent).toContain(
      pt.pages.acervo.kind.highlight,
    );
  });

  /**
   * ⚠️ **REGRA 10 — a autoria pelo NOME**, pelo `nameOfWriter` do
   * `club-names.ts` (um dono só, dividido com o acervo e com a tela do livro).
   *
   * "Você" ganha do nome quando é meu: eu não me leio pelo nome numa lista em
   * que também estão os outros. E nada aqui é rotulado como privacidade —
   * dentro do clube tudo é visível (ADR 0002).
   */
  it('names who wrote each result, and calls me "you"', async () => {
    await search();

    expect(rowOf(HER_PLAN_TITLE).textContent).toContain('Maria');
    expect(rowOf(HER_QUOTE).textContent).toContain('Maria');
    expect(rowOf(MY_FREE_TITLE).textContent).toContain(
      pt.pages.acervo.item.author.you,
    );
    expect(rowOf(MY_QUOTE).textContent).toContain(
      pt.pages.acervo.item.author.you,
    );
    // E o meu NÃO aparece com o meu nome — senão "Você" seria decoração.
    expect(rowOf(MY_FREE_TITLE).textContent).not.toContain('Marcos');
  });

  /**
   * ⚠️ **REGRA 10 — a COR do grifo tem NOME**, e o nome é texto de verdade.
   *
   * Cor como único portador de informação é o defeito que ninguém vê olhando: a
   * amostra é `aria-hidden` e o nome está ao lado.
   */
  it('names the COLOUR of a highlight, never only paints it', async () => {
    await search();

    expect(rowOf(MY_QUOTE).textContent).toContain(
      pt.pages.highlights.colors.yellow,
    );
    expect(rowOf(HER_QUOTE).textContent).toContain(
      pt.pages.highlights.colors.green,
    );
  });

  // A prévia de cada tipo: o `plainText` da anotação e o `quote` do grifo (o
  // trecho É o conteúdo do grifo — ADR 0004), mais o comentário quando existe.
  it('previews the content of each kind', async () => {
    await search();

    expect(rowOf(MY_FREE_TITLE).textContent).toContain(
      'a esmeralda no bolso do dragao',
    );
    expect(rowOf(MY_QUOTE).textContent).toContain('a esmeralda mudou o reino');
  });

  /**
   * A AUSÊNCIA É SILENCIOSA: sem página, nenhum rótulo de página; sem
   * comentário, nenhuma área de comentário. É o anti-culpa aplicado ao espaço
   * vazio — nem "página null", nem o rótulo órfão.
   */
  it('says nothing at all about a missing page and a missing comment', async () => {
    await search();

    const her = rowOf(HER_QUOTE);
    expect(her.textContent).not.toContain('null');
    expect(her.textContent).not.toContain(
      pt.pages.acervo.item.page.replace('{{number}}', ''),
    );
    // O meu grifo TEM página, e a diz — a precondição que dá dente à asserção.
    expect(rowOf(MY_QUOTE).textContent).toContain('112');
  });

  /**
   * ⚠️ **O CORTE DA PRÉVIA — e ele NÃO TINHA ACUSADOR EM LUGAR NENHUM (achado
   * BAIXO 4 da auditoria, medido no conserto).**
   *
   * O `excerptOf` era byte-idêntico nas duas telas, e mutar o corpo dele para
   * `return text` dava **0 acusadores** em `acervo.test.tsx` (55) **e** em
   * `busca.test.tsx` (44): nenhum fixture das duas tinha texto mais longo que o
   * teto, nem espaço nas pontas, nem quebra de linha no meio. Extrair um helper
   * **sem acusador** para um módulo compartilhado é a forma do §7.4 — ele passa
   * a *parecer* coberto porque tem dono. Então o acusador vem primeiro.
   *
   * As três propriedades do `excerptOf`, e cada uma mata um mutante diferente:
   *
   * 1. **o corte no teto, com reticências** — sem ele a linha de lista vira
   *    parágrafo;
   * 2. **o colapso de `\s+`** — o `plainText` é derivado de um documento
   *    ProseMirror e carrega as quebras entre parágrafos; sem o colapso a linha
   *    cresce e a lista deixa de ser varrível com o polegar;
   * 3. **o `trim`** — espaço nas pontas empurra o texto e desalinha a coluna.
   *
   * ⚠️ O texto é montado com `repeat` para o teste **não** depender do valor do
   * teto: ele afirma "cortou, e o que sobrou é menor que o original", não "tem
   * 120 caracteres" — pinar o número aqui seria a identidade do §7.8 (os dois
   * lados vindos do mesmo lugar) no dia em que o teto virar prop.
   */
  it('⚠️ truncates a long preview at the ceiling, collapses newlines and trims', async () => {
    const LONG = 'esmeralda '.repeat(60).trim();
    const RAGGED = '   a esmeralda\n\n   e o anel   ';
    vi.useFakeTimers();
    await renderBusca({
      notes: {
        status: 200,
        body: [
          aNote({ id: 'n-longa', title: 'A longa', plainText: LONG }),
          aNote({
            id: 'n-quebrada',
            title: 'A quebrada',
            plainText: RAGGED,
            createdAt: '2026-09-04T09:00:00.000Z',
          }),
        ],
      },
      list: NOTHING,
    });
    await type(TERM);
    await advance(400);

    const long = rowOf('A longa').textContent ?? '';
    // 1 — cortou: as reticências estão lá e o texto inteiro NÃO.
    expect(long).toContain('…');
    expect(long).not.toContain(LONG);
    // ...e a precondição que dá dente: o original é mais longo que o que ficou.
    expect(long.length).toBeLessThan(LONG.length);

    const ragged = rowOf('A quebrada').textContent ?? '';
    // 2 — colapsou a quebra de linha (e o espaço duplo que vinha com ela)...
    expect(ragged).toContain('a esmeralda e o anel');
    expect(ragged).not.toContain('\n');
    // 3 — ...e cortou as pontas: nada de ` · ` seguido de espaços.
    expect(ragged).not.toContain('·    a esmeralda');
    expectNoGuilt();
  });

  // A prévia vazia não deixa separador órfão no subtítulo.
  it('leaves no dangling separator when the note has no preview', async () => {
    await search();

    const row = rowOf(HER_FREE_TITLE);
    expect(row.textContent).not.toMatch(/·\s*$/u);
  });

  /**
   * ⚠️ **NÃO HÁ CONTADOR DE RESULTADOS (decisão G)** — "5 resultados" é a forma
   * que a `COUNTER_SHAPE` da varredura anti-culpa proíbe, e ela existe por
   * decisão de produto ("incentivo por presença, não por comparação").
   *
   * O `expectNoGuilt()` acima já varre a forma em todos os estados; este teste
   * é o registro EXPLÍCITO da decisão, para quem for ler a tela procurando o
   * número não concluir que ele foi esquecido.
   */
  it('shows NO result count anywhere, in any state (decision G)', async () => {
    await search();

    expect(readableText()).not.toMatch(/\b5\s+resultados?\b/iu);
    expect(readableText()).not.toMatch(/\b5\s+results?\b/iu);
    expectNoGuilt();
  });
});

describe('where a result leads (rule 13)', () => {
  async function search(): Promise<void> {
    vi.useFakeTimers();
    await renderBusca();
    await type(TERM);
    await advance(400);
  }

  /**
   * ⚠️ **REGRA 13 — cada resultado abre a tela CERTA.**
   *
   * A anotação do DIA abre a tela do dia (é lá que ela se escreve), a avulsa
   * abre a tela da avulsa, e o grifo abre o formulário dele. Os três endereços
   * carregam o `bookId` **do resultado** — não o de um livro fixo, que é o
   * mutante que um fixture de um livro só esconderia.
   */
  it('opens the day-note screen from a note of the plan, with the book of the result', async () => {
    await search();

    await press(linksIn(rowOf(HER_PLAN_TITLE))[0] as HTMLElement);

    expect(locationNow()).toBe(dayNotePath(HOBBIT_ID, PLAN_ITEM_ID));
  });

  it('opens the free-note screen from a standalone note, with the book of the result', async () => {
    await search();

    await press(linksIn(rowOf(HER_FREE_TITLE))[0] as HTMLElement);

    // ⚠️ O livro é o de GONDOLIN, não o do primeiro resultado: é isto que um
    // fixture de um livro só não conseguiria provar.
    expect(locationNow()).toBe(freeNotePath(SILMA_ID, HER_FREE_ID));
  });

  it('opens the highlight form from MY highlight, with the book of the result', async () => {
    await search();

    await press(screen.getByRole('link', { name: pt.pages.acervo.item.edit }));

    expect(locationNow()).toBe(highlightPath(SILMA_ID, MY_HIGHLIGHT_ID));
  });

  /**
   * ⚠️ **REGRA 13 — O GRIFO ALHEIO APARECE INTEIRO E SEM AFFORDANCE NENHUMA.**
   *
   * Isso é AUTORIA, não privacidade: o trecho está lá porque dentro do clube não
   * existe conteúdo privado (ADR 0002). E ele não tem nem LINK, ao contrário da
   * anotação alheia — para grifo **não existe tela de leitura** (o
   * `highlight-form.tsx` recusa o grifo alheio), então um link levaria a um
   * beco.
   */
  it('gives someone else HIGHLIGHT no affordance at all, while showing it whole', async () => {
    await search();

    const her = rowOf(HER_QUOTE);
    expect(her.textContent).toContain(HER_QUOTE);
    expect(linksIn(her)).toHaveLength(0);
    expect(her.querySelectorAll('button')).toHaveLength(0);
    // Só existe UM "corrigir" na tela: o do meu grifo.
    expect(
      screen.queryAllByRole('link', { name: pt.pages.acervo.item.edit }),
    ).toHaveLength(1);
    expectNoGuilt();
  });

  /**
   * E a ANOTAÇÃO alheia TEM link, de propósito — a assimetria com o grifo é
   * medida, não gosto: o `free-note.tsx` decide leitura × correção pela
   * autoria, então a anotação de outra pessoa abre em LEITURA.
   */
  it('does give someone else NOTE a link, because it opens in reading mode', async () => {
    await search();

    expect(linksIn(rowOf(HER_PLAN_TITLE))).toHaveLength(1);
    expect(linksIn(rowOf(HER_FREE_TITLE))).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regras 11 e 14 — os estados que não são a lista
// ─────────────────────────────────────────────────────────────────────────────

describe('the states that are not the list (rules 11 and 14)', () => {
  /**
   * ⚠️ **REGRA 11 — "não achei" é um estado PRÓPRIO, distinto do inicial.**
   *
   * É a lição das Tarefas 19, 25 e 28: os dois estados nunca são o mesmo. E a
   * frase fala da PALAVRA, nunca de quem escreveu pouco.
   */
  it('has its OWN no-results state, different from the initial one', async () => {
    vi.useFakeTimers();
    await renderBusca({ notes: NOTHING, list: NOTHING });

    await type(TERM);
    await advance(400);

    expect(screen.queryByText(pt.pages.busca.empty.title)).not.toBeNull();
    expect(screen.queryByText(pt.pages.busca.empty.description)).not.toBeNull();
    // ⚠️ E o inicial NÃO está na tela: os dois textos são diferentes.
    expect(screen.queryByText(pt.pages.busca.start.title)).toBeNull();
    expect(rows()).toHaveLength(0);
    expectNoGuilt();
  });

  // A propriedade do catálogo, afirmada onde ela é decidível: as duas frases
  // são diferentes NOS DOIS locales. Uma tradução copiada mataria a distinção
  // só em `en` — e todo teste de tela pina `pt` (§7.9).
  it.each([
    ['pt', pt],
    ['en', en],
  ])(
    'says the initial state and the empty one differently, in %s',
    (_locale, catalog) => {
      expect(catalog.pages.busca.start.title).not.toBe(
        catalog.pages.busca.empty.title,
      );
      expect(catalog.pages.busca.start.description).not.toBe(
        catalog.pages.busca.empty.description,
      );
    },
  );

  /**
   * ⚠️ **REGRA 14 — A FALHA DE UMA LISTAGEM É FALHA DA BUSCA.**
   *
   * É o precedente MEDIDO da Tarefa 28: meia lista é uma lista silenciosamente
   * incompleta — a pessoa veria as anotações, não veria grifo nenhum, e nada na
   * tela diria por quê.
   */
  it.each([
    ['the notes listing', { notes: { status: 500 } as Reply }],
    ['the highlights listing', { list: { status: 500 } as Reply }],
  ])(
    'treats a failure of %s as a failure of the whole search',
    async (_label, setup) => {
      vi.useFakeTimers();
      await renderBusca(setup);

      await type(TERM);
      await advance(400);

      expect(screen.queryByText(pt.pages.busca.unavailable)).not.toBeNull();
      // ⚠️ E NADA da metade que deu certo aparece: nem uma linha.
      expect(rows()).toHaveLength(0);
      expect(readableText()).not.toContain(MY_FREE_TITLE);
      expect(readableText()).not.toContain(MY_QUOTE);
      expectNoGuilt();
    },
  );

  /**
   * ⚠️ **REGRA 14 — O "TENTAR DE NOVO" REFAZ AS DUAS.**
   *
   * A primeira tentativa falha na listagem de grifos; a segunda dá certo. Se o
   * retry refizesse só a que falhou, a lista viria sem anotação nenhuma.
   */
  it('redoes BOTH listings on retry, not only the one that failed', async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const calls = await renderBusca({
      list: () => {
        attempt += 1;
        return attempt === 1
          ? { status: 500 }
          : { status: 200, body: highlights() };
      },
    });

    await type(TERM);
    await advance(400);
    expect(screen.queryByText(pt.pages.busca.unavailable)).not.toBeNull();
    expect(searchCalls(calls)).toHaveLength(2);

    await press(screen.getByRole('button', { name: pt.pages.busca.retry }));
    await settle();

    // ⚠️ QUATRO: as duas da primeira busca mais as duas do retry.
    expect(searchCalls(calls)).toHaveLength(4);
    expect(requestsTo(calls, '/notes')).toHaveLength(2);
    expect(labelsOnScreen()).toEqual([...ORDERED_LABELS]);
    expectNoGuilt();
  });

  /**
   * A estante que falha NÃO derruba a busca: o rótulo do livro degrada para a
   * frase neutra do catálogo, do mesmo jeito que o nome de quem escreveu
   * degrada quando `/members` falha.
   *
   * ⚠️ E **nunca o `bookId` cru**: um UUID na linha tem cara de informação e não
   * é de ninguém — a medição do `nameOfWriter` ("comunicar errado é pior que não
   * comunicar").
   */
  it('degrades the BOOK label when the shelf failed, and never shows the raw id', async () => {
    vi.useFakeTimers();
    await renderBusca({ books: { status: 500 } });

    await type(TERM);
    await advance(400);

    expect(labelsOnScreen()).toEqual([...ORDERED_LABELS]);
    expect(readableText()).toContain(pt.pages.busca.item.unknownBook);
    expect(readableText()).not.toContain(HOBBIT_ID);
    expect(readableText()).not.toContain(SILMA_ID);
    expectNoGuilt();
  });

  // O nome degrada em silêncio para o glifo neutro quando `/members` falha — e
  // a busca continua inteira.
  it('degrades the writer name when the members listing failed', async () => {
    vi.useFakeTimers();
    await renderBusca({ members: { status: 500 } });

    await type(TERM);
    await advance(400);

    expect(labelsOnScreen()).toEqual([...ORDERED_LABELS]);
    expect(readableText()).not.toContain('Maria');
    expect(readableText()).toContain(pt.pages.acervo.item.author.other);
    // ⚠️ E o MEU continua sendo "Você": o `/me` chegou, e o `nameOfWriter` põe o
    // `me` na frente do mapa de membros.
    expect(readableText()).toContain(pt.pages.acervo.item.author.you);
    expectNoGuilt();
  });

  /**
   * ⚠️ **NADA É PEDIDO NEM RENDERIZADO ATÉ O `/me` CHEGAR**, e é a garantia que
   * substitui o ramo `myId === null` do `matchesAuthor` (que esta tela **não**
   * chama — ver o docblock dela).
   *
   * Sem o clube ativo não há para onde perguntar, e "meu × dela" seria chute: a
   * armadilha nomeada da Tarefa 18 é justamente tratar `me === null` como "não
   * sou ninguém", o que mostraria o que é MEU como alheio, em silêncio.
   */
  it('asks for nothing and shows no field while the /me has not arrived', async () => {
    vi.useFakeTimers();
    const calls = await renderBusca({
      me: () => new Promise<Reply>(() => undefined),
    });

    expect(screen.queryByRole('searchbox')).toBeNull();
    /*
      ⚠️ `clubLoading` e NÃO `loading`: aqui nada foi pedido. Este teste afirmava
      a frase COMPARTILHADA, e era isso que fazia o estado "procurando…" da busca
      parecer varrido quando não era — a auditoria mediu 0 acusadores para uma
      cobrança plantada lá. Duas frases, duas asserções.
    */
    expect(screen.queryByText(pt.pages.busca.clubLoading)).not.toBeNull();
    expect(screen.queryByText(pt.pages.busca.loading)).toBeNull();
    expect(searchCalls(calls)).toHaveLength(0);
    expectNoGuilt();
  });

  // O `/me` que falhou tem estado próprio e "tentar de novo" — a mesma forma do
  // acervo e da home.
  it('offers a retry when the /me failed', async () => {
    vi.useFakeTimers();
    const calls = await renderBusca({ me: { status: 500 } });

    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(
      screen.queryByRole('button', { name: pt.pages.busca.retry }),
    ).not.toBeNull();
    expect(searchCalls(calls)).toHaveLength(0);
    expectNoGuilt();

    await press(screen.getByRole('button', { name: pt.pages.busca.retry }));
    expect(requestsTo(calls, '/me').length).toBeGreaterThan(1);
  });

  /**
   * Sem clube não há acervo para buscar — e é o PRIMEIRO login do projeto (o
   * seed cria o super-admin com zero memberships). A frase é própria e não
   * promete botão que não existe.
   */
  it('has its own state for someone who is in no club yet', async () => {
    vi.useFakeTimers();
    const calls = await renderBusca({ me: meReply({ clubs: [] }) });

    expect(screen.queryByText(pt.pages.busca.noClubs.title)).not.toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(searchCalls(calls)).toHaveLength(0);
    expectNoGuilt();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A entrada, e as varreduras de fonte
// ─────────────────────────────────────────────────────────────────────────────

describe('the entry on the home', () => {
  async function renderHome(setup: SearchSetup = {}): Promise<void> {
    vi.useFakeTimers();
    await renderBusca({ ...setup, path: '/' });
  }

  it('links from the home to the search, and the router intercepts the click', async () => {
    await renderHome();

    await press(screen.getByRole('link', { name: pt.pages.busca.entry }));

    // O endereço MUDOU, o que em jsdom só acontece se o roteador interceptou
    // (uma âncora crua não navega).
    expect(locationNow()).toBe(searchPath());
    expect(screen.queryByRole('searchbox')).not.toBeNull();
  });

  /**
   * ⚠️ **A ENTRADA NÃO EXISTE NUM CLUBE SEM LIVRO NENHUM**, e é decisão: um
   * link que só pode levar a "nada com esta palavra" é a mesma armadilha do
   * controle que só esvazia a lista (decisão E da Tarefa 28).
   */
  it('does not offer the entry in a club with no book at all', async () => {
    await renderHome({ books: NOTHING });

    expect(
      screen.queryByRole('link', { name: pt.pages.busca.entry }),
    ).toBeNull();
    expectNoGuilt();
  });
});

describe('the source of the screen', () => {
  /**
   * ⚠️ **NENHUM EDITOR AQUI.** Um `import` estático de `@clube/ui/editor` põe
   * ~454 kB de TipTap no chunk de ENTRADA do PWA. O acusador de verdade é o
   * `bundle-guard.test.ts` (ele compila); esta varredura é a que diz **qual
   * arquivo** o trouxe.
   */
  it('imports no editor', () => {
    expect(stripComments(buscaSource())).not.toContain('@clube/ui/editor');
  });

  /**
   * ⚠️ **NENHUMA STRING SOLTA NA TELA** (regra 17, e `CLAUDE.md`): todo texto
   * passa por `t()`. A varredura procura o que sobrou: um atributo de texto com
   * literal em vez de chamada.
   */
  it('puts no bare string in a text-bearing attribute', () => {
    const source = stripComments(buscaSource());

    for (const attribute of [
      'aria-label',
      'placeholder',
      'title',
      'label',
      'alt',
    ]) {
      // `attr="algo"` é literal; `attr={t('chave')}` é catálogo.
      expect(source).not.toMatch(new RegExp(`\\s${attribute}="`, 'u'));
    }
  });

  /**
   * ⚠️ **NENHUMA COR DE PERIGO E NENHUM CONTADOR NO CÓDIGO-FONTE.**
   *
   * A varredura de DOM roda em todos os estados testados; esta pega o que
   * nenhum estado desta suíte alcançou. A cor vai por REGEX e não por duas
   * strings literais — medido: `['text-danger','bg-danger']` conhecia duas
   * grafias e `text-[#b3261e]` passava em 192 testes (§7.9).
   */
  it('writes no danger colour anywhere in the screen', () => {
    const source = stripComments(buscaSource());

    expect(source).not.toMatch(/text-\[#|bg-\[#|--clube-danger/u);
    expect(source).not.toMatch(/\btext-danger\b|\bbg-danger\b/u);
  });
});
