import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  ClubMemberResponse,
  HighlightResponse,
  NoteDocBody,
  NoteResponse,
  PlanItemResponse,
} from '@clube/shared';
import { HIGHLIGHT_COLORS } from '@clube/shared';
import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { en, pt } from '@clube/shared/locales';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import type { ClubSummary } from '../../club/active-club';
import { dayNotePath } from '../day-note';
import { freeNotePath } from '../free-note';
import { acervoPath, highlightNewPath, highlightPath } from '../paths';
import {
  DANGER_STYLE,
  expectNoGuilt,
  expectNoGuiltBesidesFormError,
  stripComments,
} from './anti-guilt-dom';
import {
  aBook,
  aPlanItem,
  memoryStorage,
  meReply,
  readableText,
  type RecordedRequest,
  renderPage,
  type Reply,
  replyByUrl,
  requestAt,
  requestsTo,
  type Responder,
  stubFetch,
} from './harness';

/**
 * O ACERVO DO LIVRO — as 18 regras da Tarefa 28.
 *
 * Ela **absorve** a coleção de grifos da Tarefa 25 e o acervo de anotações que
 * a Tarefa 19 pôs dentro do `book.tsx`: um lugar, uma lista, quatro dimensões
 * de recorte.
 *
 * Entra pelo `<App />` inteiro, como as telas 16 a 27: metade do que a fatia
 * entrega é composição — a rota nova, o `RequireAuth` que a protege, e o `me`
 * do contexto que decide "meu × dela".
 *
 * ⚠️ **O DUBLÊ DO EDITOR EXISTE AQUI SEM QUE ESTA TELA USE EDITOR NENHUM** — o
 * mesmo motivo do `book.test.tsx`: um teste toca "Novo grifo" e chega na tela
 * que escreve, e lá o `React.lazy` importaria o ProseMirror inteiro para provar
 * uma navegação. O que se prova aqui é o endereço, não o editor. (Que ESTA tela
 * não importa editor é uma varredura de fonte, no fim do arquivo.)
 *
 * ⚠️ **AS VARREDURAS SÃO AS ÚNICAS, E O `expectNoGuilt()` JÁ EMBUTE A DE
 * PRIVACIDADE** (conserto da Tarefa 25) — nunca a chame duas vezes. A de
 * **catálogo** (as duas: anti-culpa e ADR 0002) percorre `pt` **e** `en`
 * inteiros em `packages/shared/src/locales/__tests__/`, desde a Tarefa 27.
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

const BOOK_ID = 'b-hobbit';
const CLUB_ID = 'c-casal';

/** O `id` que o `meReply()` do harness devolve. Sou eu. */
const MARCOS = 'u-marcos';
const MARIA = 'u-maria';
/** A pessoa que SAIU do clube — `Membership` arquivado (decisão A da 26a). */
const JOANA = 'u-joana';
/**
 * A terceira pessoa ATIVA, e ela não escreveu nada — o chip cujo recorte vem
 * vazio.
 *
 * ⚠️ O `id` dela ordena ANTES do da Maria (`u-a-zeca` < `u-maria`) e o NOME
 * ordena depois: uma tela que ordenasse os chips por `userId` acusa. A
 * precondição está pinada no bloco de fixture.
 */
const ZECA = 'u-a-zeca';

const YELLOW = '#facc15';
const GREEN = '#22c55e';
const PINK = '#ec4899';

function aDoc(text: string): NoteDocBody {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

/** O documento VAZIO que o editor emite — o comentário que existe e não diz nada. */
const EMPTY_DOC: NoteDocBody = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

/**
 * ⚠️ **O PLANO É ESCOLHIDO PARA A IMPLEMENTAÇÃO ERRADA FALHAR** (§7.2), e são
 * três propriedades:
 *
 * 1. **títulos e ids em ordem alfabética DECRESCENTE**, e a ordem do `<select>`
 *    tem de ser a do `order` — uma tela que ordenasse as opções por título ou
 *    por id acusa (a precondição está pinada logo abaixo);
 * 2. **as contagens por leitura são DIFERENTES**: a primeira tem DUAS
 *    anotações, a segunda UMA e a terceira NENHUMA — um recorte que não recorta
 *    devolve dez, um invertido devolve um onde se esperam dois;
 * 3. **a terceira leitura não tem nada**, e é o par que faltava: uma opção que
 *    existe e cujo recorte vem vazio (o estado "filtrado sem resultado" da
 *    dimensão leitura).
 */
const PLAN_IDS = ['p-c', 'p-b', 'p-a'] as const;
const PLAN_TITLES = [
  'Zumbis e anoes',
  'O ferreiro do vale',
  'A pausa no rio',
] as const;
/** A leitura com DUAS anotações, a com UMA e a com NENHUMA. */
const READING_TWO = PLAN_IDS[0];
const READING_ONE = PLAN_IDS[1];
const READING_NONE = PLAN_IDS[2];

function plan(): PlanItemResponse[] {
  return [
    aPlanItem({ id: PLAN_IDS[0], order: 1, title: PLAN_TITLES[0] }),
    aPlanItem({ id: PLAN_IDS[1], order: 2, title: PLAN_TITLES[1] }),
    aPlanItem({ id: PLAN_IDS[2], order: 3, title: PLAN_TITLES[2] }),
  ];
}

/**
 * ⚠️ **QUEM É O CLUBE — e o fixture é escolhido para o chip errado aparecer**
 * (§7.2, o mesmo da Tarefa 27). Quatro propriedades:
 *
 * 1. **EU ESTOU NA LISTA** (`u-marcos`, o `id` que o `meReply` devolve). Uma
 *    tela que montasse "um chip por membro ativo" sem me excluir me daria DOIS
 *    chips para o mesmo recorte — "Minhas" e "De Marcos";
 * 2. **a Joana está `ARCHIVED` e TEM NOME**: ela não pode virar chip (decisão A
 *    da 26a) **e** o nome dela tem de aparecer no que ela deixou. Os dois lados
 *    têm teste;
 * 3. **há uma TERCEIRA pessoa ativa** (a Zeca), que **não escreveu nada** — o
 *    chip cujo recorte vem vazio;
 * 4. **a ordem do `id` é o OPOSTO da ordem do nome**, pinado abaixo.
 */
function members(): ClubMemberResponse[] {
  return [
    // Em ordem de NOME crescente, que é o contrato da rota da 26a.
    { userId: JOANA, name: 'Joana', role: 'MEMBER', status: 'ARCHIVED' },
    { userId: MARCOS, name: 'Marcos', role: 'OWNER', status: 'ACTIVE' },
    { userId: MARIA, name: 'Maria', role: 'ADMIN', status: 'ACTIVE' },
    { userId: ZECA, name: 'Zeca', role: 'MEMBER', status: 'ACTIVE' },
  ];
}

/**
 * Um grifo como a API o devolve — factory com `overrides` (§7.7).
 *
 * O CONTRATO REAL, medido em `highlightResponseSchema`: `page`, `reference`,
 * `commentDoc` e `archivedAt` são **nullable, não opcionais** (o serializer do
 * Zod exige a chave), `commentText` é `string` sempre (derivado no backend,
 * ADR 0001) e as datas são ISO em string.
 */
function aHighlight(
  overrides: Partial<HighlightResponse> = {},
): HighlightResponse {
  return {
    id: 'h-1',
    clubId: CLUB_ID,
    bookId: BOOK_ID,
    userId: MARCOS,
    quote: 'A promessa do anao',
    color: PINK,
    page: 9,
    reference: 'Cap. 1',
    commentDoc: aDoc('a promessa vale o que custa cumpri-la'),
    commentText: 'a promessa vale o que custa cumpri-la',
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
    bookId: BOOK_ID,
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
 * ⚠️ **O ACERVO UNIFICADO É ESCOLHIDO PARA A IMPLEMENTAÇÃO ERRADA FALHAR**
 * (§7.2/§7.8), e cada propriedade mata um mutante diferente:
 *
 * 1. **a ordem por TIPO e a ordem por DATA DISCORDAM** (regra 1). As duas
 *    listagens chegam separadas e cada uma já vem em `createdAt` desc — então
 *    "concatena as duas" é a implementação errada mais provável, e ela põe as
 *    cinco anotações antes dos cinco grifos. O fixture INTERCALA de propósito, e
 *    não em alternância perfeita (há dois grifos seguidos e duas anotações
 *    seguidas), para nem um "zíper" passar;
 * 2. **as contagens por TIPO são diferentes entre si e do total**: 3 do dia,
 *    2 avulsas, 5 grifos, 10 no total;
 * 3. **as contagens por PESSOA são diferentes**: 5 minhas, 4 da Maria, 1 da
 *    Joana (que saiu), 0 da Zeca (que é membro ativo);
 * 4. **tipo e autoria NÃO coincidem**: eu tenho anotação do dia, avulsa e
 *    grifo; a Maria tem anotação do dia e grifo. Um filtro que confundisse os
 *    dois eixos acusa;
 * 5. **cor e autoria NÃO coincidem**: o amarelo tem dois meus e um dela;
 * 6. **as contagens por LEITURA são diferentes**: 2, 1 e 0;
 * 7. **os `createdAt` são todos DISTINTOS**, então a ordem não depende de
 *    critério de empate nenhum (a precondição está pinada);
 * 8. **títulos, trechos e ids não estão na ordem da tela**: uma tela que
 *    ordenasse por qualquer um deles acusa.
 */
const QUOTES = [
  'Zangado com o dragao adormecido',
  'Uma porta redonda e verde na colina',
  'O carneiro assado que abre a leitura',
  'Duas linhas sobre o anel',
  'A promessa do anao',
] as const;

const NOTE_TITLES = [
  'O dragao e o ouro',
  'O capitulo de hoje',
  'Uma ideia da pagina 112',
  'A porta que ela abriu',
  'A carta que ficou',
] as const;

/**
 * A ORDEM DA TELA — `createdAt` decrescente, com os dois tipos intercalados.
 *
 * É a observável da regra 1, e o rótulo de cada entrada é o que a linha mostra
 * como conteúdo principal: o título da anotação ou o trecho do grifo.
 */
const ORDERED_LABELS = [
  NOTE_TITLES[0], // 10:55 · avulsa · minha
  QUOTES[0], // 10:50 · grifo amarelo · meu
  QUOTES[1], // 10:45 · grifo amarelo · da Maria
  NOTE_TITLES[1], // 10:40 · do dia · minha · leitura 1
  NOTE_TITLES[2], // 10:35 · do dia · da Maria · leitura 1
  QUOTES[2], // 10:30 · grifo amarelo · meu · sem comentário
  NOTE_TITLES[3], // 10:25 · do dia · da Maria · leitura 2
  QUOTES[3], // 10:20 · grifo verde · da Maria
  NOTE_TITLES[4], // 10:15 · avulsa · da Joana (que saiu)
  QUOTES[4], // 10:10 · grifo rosa · meu
] as const;

const MY_LABELS = [
  NOTE_TITLES[0],
  QUOTES[0],
  NOTE_TITLES[1],
  QUOTES[2],
  QUOTES[4],
];
const MARIA_LABELS = [QUOTES[1], NOTE_TITLES[2], NOTE_TITLES[3], QUOTES[3]];
const PLAN_LABELS = [NOTE_TITLES[1], NOTE_TITLES[2], NOTE_TITLES[3]];
const FREE_LABELS = [NOTE_TITLES[0], NOTE_TITLES[4]];
const HIGHLIGHT_LABELS = [...QUOTES];
const YELLOW_LABELS = [QUOTES[0], QUOTES[1], QUOTES[2]];

/** O grifo sem página, o sem comentário, e o id de cada linha do teste. */
const NO_PAGE_QUOTE = QUOTES[1];
const NO_COMMENT_QUOTE = QUOTES[2];
const NO_COMMENT_ID = 'h-c';
const MY_FREE_ID = 'n-e';
const MY_HIGHLIGHT_ID = 'h-e';
const HER_FREE_ID = 'n-a';

function highlights(): HighlightResponse[] {
  return [
    aHighlight({
      id: MY_HIGHLIGHT_ID,
      userId: MARCOS,
      color: YELLOW,
      page: 112,
      reference: 'Cap. 12',
      quote: QUOTES[0],
      commentDoc: aDoc('ele ficou zangado quando a porta se fechou'),
      commentText: 'ele ficou zangado quando a porta se fechou',
      createdAt: '2026-09-04T10:50:00.000Z',
    }),
    aHighlight({
      id: 'h-d',
      userId: MARIA,
      color: YELLOW,
      page: null,
      reference: null,
      quote: QUOTES[1],
      commentDoc: aDoc('a colina inteira num paragrafo'),
      commentText: 'a colina inteira num paragrafo',
      createdAt: '2026-09-04T10:45:00.000Z',
    }),
    aHighlight({
      id: NO_COMMENT_ID,
      userId: MARCOS,
      color: YELLOW,
      page: 58,
      reference: 'Cap. 5',
      quote: QUOTES[2],
      // Não há comentário. `commentText` é DERIVADO do `commentDoc`
      // (ADR 0001), então `null` no documento implica `''` no texto — o
      // fixture não pode inventar as duas pontas em desacordo (§7.1).
      commentDoc: null,
      commentText: '',
      createdAt: '2026-09-04T10:30:00.000Z',
    }),
    aHighlight({
      id: 'h-b',
      userId: MARIA,
      color: GREEN,
      page: 31,
      reference: 'Cap. 3',
      quote: QUOTES[3],
      commentDoc: aDoc('duas linhas e o anel muda de dono'),
      commentText: 'duas linhas e o anel muda de dono',
      createdAt: '2026-09-04T10:20:00.000Z',
    }),
    aHighlight({
      id: 'h-a',
      userId: MARCOS,
      color: PINK,
      page: 9,
      reference: 'Cap. 1',
      quote: QUOTES[4],
      commentDoc: aDoc('a promessa vale o que custa cumpri-la'),
      commentText: 'a promessa vale o que custa cumpri-la',
      createdAt: '2026-09-04T10:10:00.000Z',
    }),
  ];
}

function notes(): NoteResponse[] {
  return [
    aNote({
      id: MY_FREE_ID,
      userId: MARCOS,
      kind: 'FREE',
      planItemId: null,
      title: NOTE_TITLES[0],
      plainText: 'o dragao dormia sobre o ouro',
      createdAt: '2026-09-04T10:55:00.000Z',
    }),
    aNote({
      id: 'n-d',
      userId: MARCOS,
      kind: 'PLAN',
      planItemId: READING_TWO,
      title: NOTE_TITLES[1],
      plainText: 'a leitura de hoje cabe numa frase',
      createdAt: '2026-09-04T10:40:00.000Z',
    }),
    aNote({
      id: 'n-c',
      userId: MARIA,
      kind: 'PLAN',
      planItemId: READING_TWO,
      title: NOTE_TITLES[2],
      plainText: 'a ideia que veio no meio da noite',
      createdAt: '2026-09-04T10:35:00.000Z',
    }),
    aNote({
      id: 'n-b',
      userId: MARIA,
      kind: 'PLAN',
      planItemId: READING_ONE,
      title: NOTE_TITLES[3],
      plainText: 'ela abriu a porta antes de todos',
      createdAt: '2026-09-04T10:25:00.000Z',
    }),
    aNote({
      id: HER_FREE_ID,
      userId: JOANA,
      kind: 'FREE',
      planItemId: null,
      title: NOTE_TITLES[4],
      plainText: 'o que ela escreveu antes de sair',
      createdAt: '2026-09-04T10:15:00.000Z',
    }),
  ];
}

interface AcervoSetup {
  /**
   * `GET /books/:bookId` — `Reply` ou um `Responder`, para o caso em que a
   * PRIMEIRA chamada falha e a segunda (a do "tentar de novo") dá certo.
   */
  book?: Reply | Responder;
  /** `GET /clubs/:clubId/notes?bookId=…`. */
  notes?: Reply | Responder;
  /** `GET /clubs/:clubId/highlights?bookId=…`. */
  list?: Reply | Responder;
  /** `GET /clubs/:clubId/members`. */
  members?: Reply | Responder;
  /** `DELETE /highlights/:highlightId`. */
  write?: Reply | Responder;
  /** `GET /me` — `Responder` para o estado em que ele ainda NÃO chegou. */
  me?: Reply | Responder;
  path?: string;
}

const NOTHING: Reply = { status: 200, body: [] };

function bookReply(planItems: readonly PlanItemResponse[] = plan()): Reply {
  return {
    status: 200,
    body: {
      book: aBook({ id: BOOK_ID, clubId: CLUB_ID }),
      planItems,
      writers: [],
    },
  };
}

/**
 * O shell autenticado inteiro, endpoint por endpoint.
 *
 * ⚠️ A ORDEM importa e cada linha tem um motivo:
 * - `/members` vem ANTES de `/me`, e é um falso verde MEDIDO na Tarefa 27: o
 *   `replyByUrl` casa por SUBSTRING, e `/clubs/c-casal/members` **contém**
 *   `/me`. Com a rota de membros embaixo, o filtro por pessoa receberia o corpo
 *   do `GET /me`, o `clubMembersResponseSchema` o recusaria (§6.8), e a tela
 *   cairia no ramo degradado — o teste do nome ficaria vermelho por um motivo
 *   que não tem nada a ver com o que ele prova;
 * - `/highlights/` (com barra) é a escrita por id (`DELETE /highlights/:id`);
 * - `/highlights?` é a LISTAGEM (`/clubs/:clubId/highlights?bookId=…`), e ela
 *   viria depois de `/books/` se o fragmento fosse só `/highlights`.
 */
function acervoResponder(setup: AcervoSetup): Responder {
  return replyByUrl(
    [
      ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
      ['/members', setup.members ?? { status: 200, body: members() }],
      ['/me', setup.me ?? meReply({ clubs: [CASAL] })],
      ['/notes', setup.notes ?? { status: 200, body: notes() }],
      ['/highlights/', setup.write ?? { status: 200, body: aHighlight() }],
      ['/highlights?', setup.list ?? { status: 200, body: highlights() }],
      ['/books/', setup.book ?? bookReply()],
    ],
    { status: 500, body: { error: 'Internal Server Error' } },
  );
}

async function renderAcervo(
  setup: AcervoSetup = {},
): Promise<RecordedRequest[]> {
  const calls = stubFetch(acervoResponder(setup));

  await act(async () => {
    renderPage(<App />, {
      path: setup.path ?? acervoPath(BOOK_ID),
      storage: memoryStorage({ ...SESSION }),
    });
    await Promise.resolve();
  });

  return calls;
}

async function press(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

async function pressLabel(name: string): Promise<void> {
  await press(screen.getByRole('button', { name }));
}

function rows(): HTMLElement[] {
  const list = screen.getByRole('list', { name: pt.pages.acervo.label });
  return Array.from(list.querySelectorAll('li'));
}

/**
 * Os rótulos NA ORDEM DA TELA — a observável da ordem e das quatro dimensões.
 *
 * ⚠️ É `flatMap` sobre uma lista de rótulos MUTUAMENTE NÃO-SUBSTRING (pinado no
 * bloco de fixture): com um deles contido em outro, uma linha contaria duas
 * vezes e a asserção de ordem passaria a medir o acidente.
 */
function labelsOnScreen(): string[] {
  return rows().flatMap((row) =>
    ORDERED_LABELS.filter((label) => row.textContent?.includes(label)),
  );
}

/** As linhas de GRIFO — as que dizem o tipo "Grifo" em texto (regra 2). */
function highlightRows(): HTMLElement[] {
  return rows().filter((row) =>
    row.textContent?.includes(pt.pages.acervo.kind.highlight),
  );
}

function rowOf(text: string): HTMLElement {
  const row = rows().find((item) => item.textContent?.includes(text));
  if (row === undefined) throw new Error(`nenhuma linha com "${text}"`);
  return row;
}

function linkIn(row: HTMLElement): HTMLElement {
  const link = row.querySelector('a');
  if (link === null) throw new Error('a linha não tem link');
  return link;
}

/**
 * Os parágrafos de uma linha de grifo: o TRECHO e, quando existe, a prévia do
 * comentário. O meta (tipo, cor, página, referência, autoria) é `span`, então
 * contar `p` separa "há comentário" de "não há", e um bloco de comentário
 * VAZIO conta como um.
 */
function paragraphsIn(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll('p'));
}

function chip(label: string): HTMLElement {
  return screen.getByRole('button', { name: label });
}

function pressedOf(label: string): string | null {
  return chip(label).getAttribute('aria-pressed');
}

/**
 * Os chips ACESOS de um grupo. A invariante da regra 12 é que ele tem
 * exatamente um.
 *
 * ⚠️ O rótulo sai pelo NOME ACESSÍVEL, e não pelo `textContent`, por um defeito
 * medido na Tarefa 25 (§7.6.1): ele **cola os nós irmãos sem separador**, e o
 * avatar do chip de pessoa é um `<span aria-hidden>` com a inicial dentro —
 * então o `textContent` do chip da Maria é `"MDe Maria"`.
 */
function chipLabel(button: Element): string {
  const clone = button.cloneNode(true) as HTMLElement;
  for (const hidden of Array.from(clone.querySelectorAll('[aria-hidden]'))) {
    hidden.remove();
  }
  return clone.textContent ?? '';
}

function groupOf(label: string): HTMLElement {
  return screen.getByRole('group', { name: label });
}

function chipsOf(label: string): string[] {
  return Array.from(groupOf(label).querySelectorAll('button')).map(chipLabel);
}

function pressedIn(label: string): string[] {
  return Array.from(groupOf(label).querySelectorAll('button'))
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map(chipLabel);
}

function locationText(): string {
  return screen.getByTestId('location').textContent ?? '';
}

/** A tela continua de pé: existe um `h1` — nunca tela branca. */
function screenIsUp(): boolean {
  return screen.queryByRole('heading', { level: 1 }) !== null;
}

async function waitForRows(count: number): Promise<void> {
  await waitFor(() => {
    expect(rows()).toHaveLength(count);
  });
}

/**
 * O `value` da opção "todas as leituras".
 *
 * ⚠️ Ele é a MESMA string do neutro dos chips (`'all'`), e não colide com nada
 * por construção: um `planItemId` é `randomUUID()`, e o que não está no plano
 * não vira leitura — vira "todas". A constante existe aqui para o teste não
 * escrever o literal em quatro lugares.
 */
const EVERY_READING_VALUE = 'all';

const COLOR_NAMES = pt.pages.highlights.colors;
const FILTERS = pt.pages.acervo.filters;
const ALL_COLORS = FILTERS.color.all;
const ALL_TYPES = FILTERS.type.all;
const EVERYONE = FILTERS.person.all;
const ITEM = pt.pages.acervo.item;
const KIND = pt.pages.acervo.kind;

/** O rótulo do chip de uma pessoa, com o nome interpolado do catálogo. */
function personChip(name: string): string {
  return FILTERS.person.person.replace('{{name}}', name);
}

/** O `<select>` da leitura, pelo `<label>` associado (decisão D). */
function readingSelect(): HTMLSelectElement {
  return screen.getByLabelText(FILTERS.reading.label) as HTMLSelectElement;
}

async function chooseReading(value: string): Promise<void> {
  await act(async () => {
    fireEvent.change(readingSelect(), { target: { value } });
  });
}

function acervoSource(): string {
  return readFileSync(resolve(__dirname, '..', 'acervo.tsx'), 'utf8');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the fixture is hostile to the wrong implementations (§7.2, §7.8)', () => {
  it('⚠️ makes the order by TYPE and the order by DATE disagree (rule 1)', () => {
    const merged = [...notes(), ...highlights()];

    // A precondição da regra 1: os `createdAt` são todos DISTINTOS, então a
    // ordem esperada não depende de critério de empate nenhum.
    const stamps = merged.map((entry) => entry.createdAt);
    expect(new Set(stamps).size).toBe(stamps.length);

    // ⚠️ E "concatena as duas listagens" NÃO é a ordem da tela: cada listagem
    // já vem em `createdAt` desc, então concatenar põe as cinco anotações antes
    // dos cinco grifos — o mutante mais provável desta fatia.
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
      duas anotações seguidas, então nem um "zíper" (um de cada, alternando)
      passa. Sem esta linha, um fixture perfeitamente alternado deixaria essa
      implementação errada verde.
    */
    const kinds = [...merged]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((entry) => ('quote' in entry ? 'H' : 'N'));
    expect(kinds.join('')).toContain('HH');
    expect(kinds.join('')).toContain('NN');
  });

  it('⚠️ has no label contained in another one', () => {
    /*
      A precondição do `labelsOnScreen()`: com um rótulo contido em outro, uma
      linha casaria dois e a asserção de ordem passaria a medir o acidente.
    */
    for (const label of ORDERED_LABELS) {
      const others = ORDERED_LABELS.filter((other) => other !== label);
      expect(others.some((other) => other.includes(label))).toBe(false);
    }
    expect(ORDERED_LABELS).toHaveLength(10);
  });

  it('has different counts per type, per person, per colour and per reading', () => {
    const allNotes = notes();
    const allHighlights = highlights();

    // TIPO: três contagens diferentes entre si e do total.
    expect(allNotes.filter((note) => note.kind === 'PLAN')).toHaveLength(3);
    expect(allNotes.filter((note) => note.kind === 'FREE')).toHaveLength(2);
    expect(allHighlights).toHaveLength(5);

    // PESSOA: 5 · 4 · 1 · 0 — quantidades diferentes, e a Zeca é membro ativo
    // que não escreveu nada.
    const authorOf = [
      ...allNotes.map((note) => note.userId),
      ...allHighlights.map((highlight) => highlight.userId),
    ];
    expect(authorOf.filter((id) => id === MARCOS)).toHaveLength(5);
    expect(authorOf.filter((id) => id === MARIA)).toHaveLength(4);
    expect(authorOf.filter((id) => id === JOANA)).toHaveLength(1);
    expect(authorOf.filter((id) => id === ZECA)).toHaveLength(0);

    // TIPO × PESSOA não coincidem: eu tenho os três tipos, ela tem dois.
    expect(
      new Set(
        allNotes.filter((note) => note.userId === MARCOS).map((n) => n.kind),
      ).size,
    ).toBe(2);
    expect(
      allHighlights.filter((highlight) => highlight.userId === MARCOS),
    ).toHaveLength(3);

    // COR: 3 · 1 · 1, e o amarelo tem os DOIS autores.
    expect(allHighlights.filter((h) => h.color === YELLOW)).toHaveLength(3);
    expect(allHighlights.filter((h) => h.color === GREEN)).toHaveLength(1);
    expect(allHighlights.filter((h) => h.color === PINK)).toHaveLength(1);
    expect(
      new Set(
        allHighlights.filter((h) => h.color === YELLOW).map((h) => h.userId),
      ).size,
    ).toBe(2);

    // LEITURA: 2 · 1 · 0.
    const readings = allNotes.map((note) => note.planItemId);
    expect(readings.filter((id) => id === READING_TWO)).toHaveLength(2);
    expect(readings.filter((id) => id === READING_ONE)).toHaveLength(1);
    expect(readings.filter((id) => id === READING_NONE)).toHaveLength(0);

    // ⚠️ E NEM A AVULSA NEM O GRIFO TÊM `planItemId` — é a fidelidade da regra
    // 10 escrita no fixture (§7.1, 4ª aparição: `= 'x'` contra `NULL` é falso).
    for (const note of allNotes.filter((n) => n.kind === 'FREE')) {
      expect(note.planItemId).toBeNull();
    }
    for (const highlight of allHighlights) {
      expect(highlight).not.toHaveProperty('planItemId');
    }

    // O grifo sem página é o SEGUNDO e o sem comentário é o do MEIO, e este é
    // MEU: "sem comentário" não coincide com "de outra pessoa".
    expect(allHighlights.findIndex((h) => h.page === null)).toBe(1);
    expect(allHighlights.findIndex((h) => h.commentDoc === null)).toBe(2);
    expect(allHighlights[2]?.userId).toBe(MARCOS);
  });

  it('has a plan and a club that break the wrong orders (§7.2)', () => {
    // ⚠️ AS PRECONDIÇÕES PINADAS: sem elas, um id ou um título renomeado
    // devolve a coincidência em silêncio.
    expect([...PLAN_TITLES].sort().reverse()).toEqual([...PLAN_TITLES]);
    expect([...PLAN_IDS].sort().reverse()).toEqual([...PLAN_IDS]);
    expect(plan().map((item) => item.order)).toEqual([1, 2, 3]);

    const club = members();
    expect(club.some((member) => member.userId === MARCOS)).toBe(true);
    expect(club.find((member) => member.userId === JOANA)?.status).toBe(
      'ARCHIVED',
    );
    expect(club.filter((member) => member.status === 'ACTIVE')).toHaveLength(3);
    // A ordem do `id` é o OPOSTO da ordem do nome.
    expect(ZECA < MARIA).toBe(true);
  });
});

describe('⚠️ ONE LIST, createdAt DESC, THE TWO TYPES INTERLEAVED (rule 1)', () => {
  it('loads the book, the notes, the highlights and the members — four requests', async () => {
    const calls = await renderAcervo();
    await waitForRows(10);

    /*
      QUATRO requisições e NENHUMA ROTA NOVA: o livro (que dá o `clubId`, o
      corte de tenant e o plano), as anotações e os grifos do CLUBE filtrados
      pelo livro, e os membros (que resolvem o nome de quem escreveu).
    */
    expect(requestsTo(calls, '/books/').map((call) => call.url)).toEqual([
      `https://api.teste/books/${BOOK_ID}`,
    ]);
    /*
      ⚠️ A query sai pela opção `query` do cliente, que usa `URLSearchParams`.
      Nenhuma das duas leva `authorId` nem `color` — o recorte é no CLIENTE —, e
      é por isso que o `%23` da armadilha da Tarefa 24 não aparece.
    */
    expect(requestsTo(calls, '/notes').map((call) => call.url)).toEqual([
      `https://api.teste/clubs/${CLUB_ID}/notes?bookId=${BOOK_ID}`,
    ]);
    expect(requestsTo(calls, '/highlights?').map((call) => call.url)).toEqual([
      `https://api.teste/clubs/${CLUB_ID}/highlights?bookId=${BOOK_ID}`,
    ]);
    expect(requestsTo(calls, '/members').map((call) => call.url)).toEqual([
      `https://api.teste/clubs/${CLUB_ID}/members`,
    ]);
    for (const fragment of ['/notes', '/highlights?', '/members']) {
      expect(requestAt(requestsTo(calls, fragment), 0).method).toBe('GET');
    }
  });

  it('⚠️ puts the ten entries in createdAt DESC, interleaved (rule 1)', async () => {
    await renderAcervo();
    await waitForRows(10);

    expect(labelsOnScreen()).toEqual([...ORDERED_LABELS]);
    expectNoGuilt();
  });

  it('⚠️ renders BOTH entries when a note and a highlight share an id', async () => {
    /*
      ⚠️ **O QUE QUEBRA CALADO NUMA LISTA UNIFICADA: a `key` do React.**
      `noteResponseSchema` e `highlightResponseSchema` declaram `id:
      z.string()` — as duas tabelas geram `randomUUID()`, mas a fronteira em que
      a tela confia não promete isso (§6.8: é o cliente que decide o que a tela
      vê), e o `clubMemberResponseSchema` já produziu esta mesma classe de
      colisão na Tarefa 27 (o `userId` literalmente `"mine"`).

      Com a `key` sendo o `id` cru, duas entradas de tabelas diferentes viram a
      MESMA chave: o React avisa no console e a reconciliação passa a reusar o
      nó errado no primeiro toque de chip. Com o tipo no prefixo, não há
      colisão possível.
    */
    const warnings: string[] = [];
    const spy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        warnings.push(args.map((arg) => String(arg)).join(' '));
      });

    try {
      await renderAcervo({
        notes: {
          status: 200,
          body: [aNote({ id: 'x-1', title: NOTE_TITLES[0] })],
        },
        list: {
          status: 200,
          body: [aHighlight({ id: 'x-1', quote: QUOTES[4] })],
        },
      });
      await waitForRows(2);

      expect(labelsOnScreen()).toEqual([NOTE_TITLES[0], QUOTES[4]]);
      expect(warnings.filter((line) => line.includes('same key'))).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it('⚠️ says the TYPE of every row — do dia · avulsa · grifo (rule 2)', async () => {
    await renderAcervo();
    await waitForRows(10);

    /*
      ⚠️ **O TIPO É INEQUÍVOCO, e o teste é o par completo:** cada linha diz o
      SEU tipo e **não** diz os outros dois. Sem a metade negativa, um mutante
      que escrevesse as três palavras em toda linha passaria.
    */
    for (const label of PLAN_LABELS) {
      const row = rowOf(label);
      expect(row.textContent).toContain(KIND.plan);
      expect(row.textContent).not.toContain(KIND.free);
      expect(row.textContent).not.toContain(KIND.highlight);
    }
    for (const label of FREE_LABELS) {
      const row = rowOf(label);
      expect(row.textContent).toContain(KIND.free);
      expect(row.textContent).not.toContain(KIND.plan);
      expect(row.textContent).not.toContain(KIND.highlight);
    }
    for (const label of HIGHLIGHT_LABELS) {
      const row = rowOf(label);
      expect(row.textContent).toContain(KIND.highlight);
      expect(row.textContent).not.toContain(KIND.plan);
      expect(row.textContent).not.toContain(KIND.free);
    }
    expect(highlightRows()).toHaveLength(5);
    expectNoGuilt();
  });

  it('⚠️ says WHOSE it is in BOTH halves, by the same nameOfWriter (rule 3)', async () => {
    /*
      ⚠️ **A ÚLTIMA INCONSISTÊNCIA DE VOCABULÁRIO DO MVP 2** (decisão G): até a
      Tarefa 27 a anotação dizia "Maria" e o grifo dizia "Alguém do clube" — a
      mesma pessoa, dois nomes, na mesma tela. Agora as duas metades passam pelo
      MESMO `nameOfWriter`.
    */
    await renderAcervo();
    await waitForRows(10);

    // A MINHA anotação e o MEU grifo dizem "Você" — eu não me leio pelo nome
    // numa lista em que também estão os outros.
    for (const label of [NOTE_TITLES[0], QUOTES[0]]) {
      const row = rowOf(label);
      expect(row.textContent).toContain(ITEM.author.you);
      expect(row.textContent).not.toContain('Marcos');
    }

    // A anotação DELA e o grifo DELA dizem o NOME — as duas metades.
    for (const label of [NOTE_TITLES[2], QUOTES[1]]) {
      const row = rowOf(label);
      expect(row.textContent).toContain('Maria');
      expect(row.textContent).not.toContain(ITEM.author.other);
      expect(row.textContent).not.toContain(ITEM.author.you);
    }

    // ⚠️ E QUEM SAIU DO CLUBE CONTINUA TENDO NOME (regra 7, decisão A da 26a):
    // sair arquiva o `Membership` e não apaga o que a pessoa escreveu — "o
    // acervo do clube continua íntegro, com autoria" (ADR 0002).
    const left = rowOf(NOTE_TITLES[4]);
    expect(left.textContent).toContain('Joana');
    expect(left.textContent).not.toContain(ITEM.author.other);
    expectNoGuilt();
  });

  it('⚠️ falls back to the generic phrase in BOTH halves when it does not know the people', async () => {
    /*
      O estado real de quem não conhece as pessoas: o `GET /members` que
      falhou. O `me` continua conhecido, então "Você" sobrevive — nunca o
      `userId`, que viraria uma inicial com cara de inicial e de ninguém
      (medido na Tarefa 17).
    */
    await renderAcervo({
      members: { status: 500, body: { error: 'Internal Server Error' } },
    });
    await waitForRows(10);

    for (const label of [NOTE_TITLES[2], QUOTES[1], NOTE_TITLES[4]]) {
      const row = rowOf(label);
      expect(row.textContent).toContain(ITEM.author.other);
      expect(row.textContent).not.toContain('Maria');
      expect(row.textContent).not.toContain('Joana');
    }
    expect(rowOf(NOTE_TITLES[0]).textContent).toContain(ITEM.author.you);
    // O acervo é o CONTEÚDO; o filtro é navegação: uma falha nos nomes não
    // vira frase nenhuma na tela (regra 17).
    expect(readableText()).not.toContain('Internal Server Error');
    expect(readableText()).not.toContain(MARIA);
    expectNoGuilt();
  });

  it('previews the plainText of a note, never the doc (decision I)', async () => {
    await renderAcervo();
    await waitForRows(10);

    expect(rowOf(NOTE_TITLES[0]).textContent).toContain(
      'o dragao dormia sobre o ouro',
    );
    // O `doc` não é renderizado na lista — nem o JSON dele vaza para a tela.
    expect(readableText()).not.toContain('"type":"doc"');
    expectNoGuilt();
  });
});

describe('⚠️ EVERY ROW OPENS THE RIGHT SCREEN (rule 4)', () => {
  it('sends the day note to the day, the standalone to the standalone, the highlight to its form', async () => {
    await renderAcervo();
    await waitForRows(10);

    // A MINHA avulsa: a tela da avulsa.
    expect(linkIn(rowOf(NOTE_TITLES[0])).getAttribute('href')).toBe(
      freeNotePath(BOOK_ID, MY_FREE_ID),
    );
    /*
      ⚠️ A DO DIA VAI PARA A TELA DO DIA, mesmo sendo minha — e é regra de
      backend, não gosto: o `editNote` RECUSA nota do dia (Tarefa 09), que só se
      escreve pelo `upsertPlanNote`. Uma tela que a mandasse para a edição
      avulsa daria 400 em todo salvamento.
    */
    expect(linkIn(rowOf(NOTE_TITLES[1])).getAttribute('href')).toBe(
      dayNotePath(BOOK_ID, READING_TWO),
    );
    // O MEU grifo: o formulário do grifo.
    expect(
      rowOf(QUOTES[0])
        .querySelector(`a[href^="/books/${BOOK_ID}/highlights/"]`)
        ?.getAttribute('href'),
    ).toBe(highlightPath(BOOK_ID, MY_HIGHLIGHT_ID));
  });

  it('⚠️ opens the note of ANOTHER PERSON in reading, on the same screen', async () => {
    /*
      A anotação alheia abre a MESMA tela da avulsa, que decide leitura ×
      correção pela autoria (regra 17 da Tarefa 19) — não um endereço
      diferente. Isso é AUTORIA, não privacidade: o texto está aqui inteiro
      porque dentro do clube não existe conteúdo privado (ADR 0002).
    */
    await renderAcervo();
    await waitForRows(10);

    expect(linkIn(rowOf(NOTE_TITLES[4])).getAttribute('href')).toBe(
      freeNotePath(BOOK_ID, HER_FREE_ID),
    );
    expect(linkIn(rowOf(NOTE_TITLES[3])).getAttribute('href')).toBe(
      dayNotePath(BOOK_ID, READING_ONE),
    );
    expectNoGuilt();
  });

  it('⚠️ navigates by the ROUTER, not by a raw anchor that reloads the PWA', async () => {
    // Em jsdom o endereço só muda se o roteador interceptou o clique: uma
    // âncora crua não navega. É a lição medida da Tarefa 16.
    await renderAcervo();
    await waitForRows(10);

    await press(linkIn(rowOf(NOTE_TITLES[1])));
    expect(locationText()).toBe(dayNotePath(BOOK_ID, READING_TWO));
  });
});

describe('the highlight row draws quote, colour, page and comment (rules 2, 3)', () => {
  it('shows the colour NAME, the page and the reference', async () => {
    await renderAcervo();
    await waitForRows(10);

    const mine = rowOf(QUOTES[4]);
    expect(mine.textContent).toContain(COLOR_NAMES.pink);
    expect(mine.textContent).toContain('Página 9');
    expect(mine.textContent).toContain('Cap. 1');

    // O livro é o CONTEXTO: o nome da tela é "Acervo", e o título do livro diz
    // de qual acervo se trata.
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: pt.pages.acervo.title,
      }),
    ).not.toBeNull();
    expect(readableText()).toContain('O Hobbit');
    expectNoGuilt();
  });

  it('⚠️ never lets the COLOUR be the only carrier of information', async () => {
    /*
      ⚠️ A regra 4 da Tarefa 25 escrita como propriedade de TODAS as linhas de
      grifo: a amostra é um `span` `aria-hidden` com a cor numa variável CSS,
      então quem não distingue as cinco cores depende do NOME. Um mutante que
      apague o `<span>` do nome deixa a bolinha sozinha — bonito, e ilegível
      para quem usa leitor de tela.
    */
    await renderAcervo();
    await waitForRows(10);

    /*
      ⚠️ **A PRECONDIÇÃO DE COMPRIMENTO, E ELA FOI MEDIDA.** Sem esta linha o
      laço abaixo é VACUOSO no cenário em que `highlightRows()` vem vazio (§7.4
      escrito como laço): mutando o rótulo do tipo para `''`, o filtro de linhas
      não acha nada, o laço não roda **e este teste passa** — o mutante morre em
      dois outros lugares, então nenhuma propriedade se perde, mas o teste que
      PROMETE a regra 4 da Tarefa 25 deixa de provar qualquer coisa. É o mesmo
      par que o teste da regra 2 já tinha.
    */
    expect(highlightRows()).toHaveLength(5);

    const names = Object.values(COLOR_NAMES);
    for (const row of highlightRows()) {
      const text = row.textContent ?? '';
      expect(names.some((name) => text.includes(name))).toBe(true);
    }

    // E o par positivo: a amostra existe, com a cor da paleta de `shared`.
    const painted = Array.from(
      document.querySelectorAll<HTMLElement>('[style*="--swatch"]'),
    ).map((swatch) => swatch.getAttribute('style') ?? '');
    expect(painted.some((style) => style.includes(PINK))).toBe(true);
    expect(painted.some((style) => style.includes(YELLOW))).toBe(true);
    // Nenhuma cor fora da paleta fixa (`HIGHLIGHT_COLORS` de `@clube/shared`).
    for (const style of painted) {
      const hex = /#[0-9a-f]{6}/u.exec(style);
      expect(hex).not.toBeNull();
      expect(HIGHLIGHT_COLORS).toContain(hex?.[0]);
    }
  });

  it('⚠️ has its OWN state for the highlight with no page (rule 2)', async () => {
    await renderAcervo();
    await waitForRows(10);

    const noPage = rowOf(NO_PAGE_QUOTE);
    // Nada de "Página null", nada de "Página" sem número: a ausência é
    // silenciosa, que é o anti-culpa aplicado ao espaço vazio.
    expect(noPage.textContent).not.toContain('Página');
    expect(readableText()).not.toContain('null');
    expect(readableText()).not.toContain('undefined');
    expect(readableText()).not.toContain('NaN');

    // O par positivo: os outros QUATRO grifos mostram a página.
    expect(
      highlightRows().filter((row) => row.textContent?.includes('Página')),
    ).toHaveLength(4);
  });

  it('previews the commentText, and shows NOTHING when commentDoc is null', async () => {
    await renderAcervo();
    await waitForRows(10);

    // Com comentário: dois parágrafos — o trecho e a prévia.
    const withComment = paragraphsIn(rowOf(QUOTES[4]));
    expect(withComment).toHaveLength(2);
    expect(withComment[0]?.textContent).toBe(QUOTES[4]);
    expect(withComment[1]?.textContent).toBe(
      'a promessa vale o que custa cumpri-la',
    );

    // Sem comentário: UM parágrafo. Nem bloco vazio, nem rótulo órfão.
    expect(paragraphsIn(rowOf(NO_COMMENT_QUOTE))).toHaveLength(1);
    expectNoGuilt();
  });

  it('shows no comment area for a comment that EXISTS and says nothing', async () => {
    /*
      ⚠️ A METADE QUE SÓ ESTE FIXTURE ACUSA. Um grifo pode ter `commentDoc`
      não-nulo e `commentText` vazio: é o documento em branco que o editor
      emite quando alguém abre o campo e não escreve. Uma guarda escrita só
      contra `commentDoc === null` renderiza para ele um bloco de comentário
      VAZIO — a "área de comentário vazia" com a mesma cara de bug do "página
      null".
    */
    await renderAcervo({
      notes: NOTHING,
      list: {
        status: 200,
        body: [
          aHighlight({
            id: 'h-vazio',
            quote: 'Um grifo com comentario em branco',
            commentDoc: EMPTY_DOC,
            commentText: '',
          }),
        ],
      },
    });
    await waitForRows(1);

    expect(
      paragraphsIn(rowOf('Um grifo com comentario em branco')),
    ).toHaveLength(1);
  });
});

describe('⚠️ THE HIGHLIGHT OF ANOTHER PERSON HAS NO AFFORDANCE AT ALL (rule 4)', () => {
  it('gives the actions to MY highlight and nothing to hers', async () => {
    /*
      ADR 0002: o trecho dela está aqui INTEIRO, porque dentro do clube não
      existe conteúdo privado. O que não existe é corrigir ou arquivar o que o
      outro escreveu — e isso é AUTORIA, não privacidade.

      ⚠️ **E O GRIFO ALHEIO NÃO TEM NEM LINK, ao contrário da anotação alheia.**
      A anotação abre em LEITURA (o `free-note.tsx` decide leitura × correção
      pela autoria); para grifo **não existe tela de leitura** — o
      `highlight-form.tsx` recusa o grifo de outra pessoa
      (`pages.highlightForm.notYours`, medido). Um link levaria a um beco.
    */
    await renderAcervo();
    await waitForRows(10);

    for (const quote of [QUOTES[0], QUOTES[2], QUOTES[4]]) {
      const row = rowOf(quote);
      expect(
        row.querySelector(`a[href^="/books/${BOOK_ID}/highlights/"]`),
      ).not.toBeNull();
      expect(row.querySelectorAll('button')).toHaveLength(1);
    }

    for (const quote of [QUOTES[1], QUOTES[3]]) {
      const row = rowOf(quote);
      expect(row.querySelectorAll('button')).toHaveLength(0);
      expect(row.querySelectorAll('a')).toHaveLength(0);
    }
    expectNoGuilt();
  });

  it('points the correction at the highlight itself, by the router Link', async () => {
    await renderAcervo();
    await waitForRows(10);

    const link = rowOf(NO_COMMENT_QUOTE).querySelector('a');
    expect(link?.getAttribute('href')).toBe(
      highlightPath(BOOK_ID, NO_COMMENT_ID),
    );

    if (link === null) throw new Error('a linha não tem link de correção');
    await press(link);
    expect(locationText()).toBe(highlightPath(BOOK_ID, NO_COMMENT_ID));
  });

  it('opens the NEW highlight and the NEW note from explicit buttons, writing nothing', async () => {
    const calls = await renderAcervo();
    await waitForRows(10);

    await pressLabel(pt.pages.acervo.newHighlight);

    expect(locationText()).toBe(highlightNewPath(BOOK_ID));
    /*
      Abrir a tela de registro NÃO grava linha no banco. O filtro é por
      ENDPOINT e não por método — o `POST /auth/refresh` do shell é uma escrita
      legítima que não tem nada a ver com grifo (é a lição do `requestsTo`).
    */
    expect(
      requestsTo(calls, '/highlights').filter((call) => call.method !== 'GET'),
    ).toEqual([]);
  });

  it('opens the NEW standalone note from an explicit button', async () => {
    const calls = await renderAcervo();
    await waitForRows(10);

    await pressLabel(pt.pages.acervo.newNote);

    expect(locationText()).toBe(`/books/${BOOK_ID}/notes/new`);
    expect(
      requestsTo(calls, `/books/${BOOK_ID}/notes`).filter(
        (call) => call.method !== 'GET',
      ),
    ).toEqual([]);
  });

  it('does not guess who I am when the /me failed', async () => {
    /*
      ⚠️ A ARMADILHA NOMEADA DA TAREFA 18: `me` é `null` fora do `ready`. Uma
      tela que tratasse isso como "não sou ninguém" mostraria o que é MEU como
      alheio, sem affordance nenhuma — em silêncio.
    */
    const calls = await renderAcervo({
      me: { status: 500, body: { error: 'Boom' } },
    });

    expect(screenIsUp()).toBe(true);
    expect(requestsTo(calls, '/books/')).toHaveLength(0);
    expect(requestsTo(calls, '/highlights')).toHaveLength(0);
    expect(requestsTo(calls, '/notes')).toHaveLength(0);
    expect(requestsTo(calls, '/members')).toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: pt.pages.acervo.retry }),
    ).not.toBeNull();
    expect(readableText()).not.toContain('Boom');
    expectNoGuilt();
  });
});

describe('⚠️ ARCHIVING A HIGHLIGHT ASKS FIRST', () => {
  /*
    ⚠️ **ESTA CAPACIDADE VEIO INTEIRA DA TAREFA 25, e ela NÃO estava nas 18
    regras da spec.** Ela entrou porque medi o que ficaria de fora: o
    `highlight-form.tsx` **não tem** arquivar (só o `free-note.tsx` tem, para a
    anotação avulsa), então tirar o arquivamento da lista de grifos apagaria do
    produto a única forma de arquivar um grifo. → o relatório da fatia.
  */
  async function openArchiveOf(quote: string): Promise<void> {
    const row = rowOf(quote);
    const button = row.querySelector('button');
    if (button === null) throw new Error('a linha não tem botão de arquivar');
    await press(button);
  }

  it('does NOT call the API when the confirmation is cancelled', async () => {
    const calls = await renderAcervo();
    await waitForRows(10);

    await openArchiveOf(NO_COMMENT_QUOTE);

    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(
      screen.queryByText(pt.pages.acervo.archive.description),
    ).not.toBeNull();
    expectNoGuilt();

    await pressLabel(pt.pages.acervo.archive.cancel);

    // ⚠️ NENHUMA requisição — e o sheet saiu do DOM (fechado ele não está lá,
    // que é o que impede o "Cancelar" de continuar tabulável).
    expect(requestsTo(calls, '/highlights/')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    // E o grifo continua na lista, inteiro.
    expect(labelsOnScreen()).toEqual([...ORDERED_LABELS]);
  });

  it('sends DELETE on confirm, and the highlight LEAVES the list for good', async () => {
    const calls = await renderAcervo({
      write: {
        status: 200,
        body: aHighlight({
          id: NO_COMMENT_ID,
          status: 'ARCHIVED',
          archivedAt: '2026-09-05T10:00:00.000Z',
        }),
      },
    });
    await waitForRows(10);

    await openArchiveOf(NO_COMMENT_QUOTE);
    await pressLabel(pt.pages.acervo.archive.confirm);

    expect(requestsTo(calls, '/highlights/')).toHaveLength(1);
    const write = requestAt(requestsTo(calls, '/highlights/'), 0);
    expect(write.method).toBe('DELETE');
    expect(write.url).toBe(`https://api.teste/highlights/${NO_COMMENT_ID}`);

    expect(labelsOnScreen()).toEqual(
      ORDERED_LABELS.filter((label) => label !== NO_COMMENT_QUOTE),
    );
    expect(readableText()).not.toContain(NO_COMMENT_QUOTE);
    expect(screen.queryByRole('dialog')).toBeNull();

    /*
      ⚠️ **E ELE NÃO VOLTA QUANDO O RECORTE MUDA** — a forma decidível de "não
      volta ao recarregar" nesta tela. O mutante real é a tela guardar DUAS
      listas (o acervo e o recorte) e tirar o grifo de uma só: aí ele
      ressuscita no primeiro toque de chip. Com uma fonte só, não há cópia para
      ressuscitar. (Que o SERVIDOR não o devolve mais é propriedade do
      backend, provada na integração da Tarefa 24.)
    */
    await press(chip(COLOR_NAMES.yellow));
    expect(labelsOnScreen()).toEqual([QUOTES[0], QUOTES[1]]);
    await press(chip(ALL_COLORS));
    expect(readableText()).not.toContain(NO_COMMENT_QUOTE);
    expectNoGuilt();
  });

  it('says it could not archive, and keeps the highlight on the screen', async () => {
    const calls = await renderAcervo({
      write: { status: 500, body: { error: 'Boom: disk is on fire' } },
    });
    await waitForRows(10);

    await openArchiveOf(NO_COMMENT_QUOTE);
    await pressLabel(pt.pages.acervo.archive.confirm);

    expect(requestsTo(calls, '/highlights/')).toHaveLength(1);
    expect(screen.queryByText(pt.pages.acervo.archive.failed)).not.toBeNull();
    // Nada da API na tela, atributos incluídos (regra 17).
    expect(readableText()).not.toContain('Boom');
    expect(readableText()).not.toContain('disk is on fire');
    // O grifo continua aqui: nada foi arquivado.
    expect(labelsOnScreen()).toEqual([...ORDERED_LABELS]);
    expectNoGuiltBesidesFormError([pt.pages.acervo.archive.failed]);
  });
});

describe('⚠️ EMPTY ≠ FILTERED-WITH-NO-RESULT, and neither one nags (rule 5)', () => {
  /*
    ⚠️ **ESTE BLOCO VOLTOU DEPOIS DE UMA MEDIÇÃO, e o achado é o registro.** Ele
    existia na primeira unidade desta fatia e eu o perdi ao reescrever o arquivo
    para o acervo UNIFICADO — sobrou só a metade "não há filtro sobre o vazio".
    Quem mostrou foi uma **mutação**: uma frase de privacidade plantada no
    `Notice` do estado vazio deu **0 acusadores no DOM** (só a varredura de
    FONTE acusou), porque nenhum teste chegava a renderizar aquele estado por
    inteiro e chamar a `expectNoGuilt()` nele.

    É o §7.9 na forma mais concreta: a guarda existia, a lista de termos estava
    certa, e o ESTADO em que ela deveria rodar não era renderizado por ninguém.
  */
  it('has an empty state with no nagging, and no filter over the void', async () => {
    await renderAcervo({ notes: NOTHING, list: NOTHING });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.acervo.empty.title)).not.toBeNull();
    });
    // O par que a regra 5 exige: o vazio TEM descrição (o que dá para fazer) e
    // NÃO usa a frase do filtro.
    expect(
      screen.queryByText(pt.pages.acervo.empty.description),
    ).not.toBeNull();
    expect(screen.queryByText(pt.pages.acervo.empty.filtered)).toBeNull();
    expect(
      screen.queryByRole('list', { name: pt.pages.acervo.label }),
    ).toBeNull();

    // Filtrar o vazio é oferecer uma escolha que não muda nada — nem chip, nem
    // `<select>`.
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(screen.queryByLabelText(FILTERS.reading.label)).toBeNull();

    // Mas registrar o primeiro continua possível: escrever não depende de
    // conseguir ler, e são DOIS destinos (ADR 0004).
    expect(
      screen.queryByRole('button', { name: pt.pages.acervo.newNote }),
    ).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: pt.pages.acervo.newHighlight }),
    ).not.toBeNull();

    // ⚠️ E É AQUI QUE A VARREDURA RODA NO ESTADO VAZIO — a chamada que faltava.
    expectNoGuilt();
  });

  it('keeps the empty state up when the book has no plan either', async () => {
    // Dois vazios ao mesmo tempo: nenhum plano e nenhum acervo. É o estado do
    // livro recém-cadastrado, e ele também não cobra ninguém.
    await renderAcervo({ book: bookReply([]), notes: NOTHING, list: NOTHING });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.acervo.empty.title)).not.toBeNull();
    });
    expect(screenIsUp()).toBe(true);
    expect(screen.queryByLabelText(FILTERS.reading.label)).toBeNull();
    expectNoGuilt();
  });
});

describe('the collection when the book or the network goes away (rules 5, 17)', () => {
  it('handles a 404 on the book with its OWN words, and never a blank screen', async () => {
    await renderAcervo({
      book: { status: 404, body: { error: 'Not found' } },
    });

    await waitFor(() => {
      expect(
        screen.queryByText(pt.pages.acervo.bookUnavailable),
      ).not.toBeNull();
    });
    expect(screenIsUp()).toBe(true);
    // Frase PRÓPRIA, não o genérico de 404, que não diz o quê.
    expect(readableText()).not.toContain(pt.errors.notFound);
    expect(readableText()).not.toContain('Not found');
    // Retentar um 404 é pedir outra vez a mesma negativa.
    expect(
      screen.queryByRole('button', { name: pt.pages.acervo.retry }),
    ).toBeNull();
    expectNoGuilt();
  });

  it('⚠️ offers to repeat a BOOK that failed with 500, and the repeat REDOES it', async () => {
    /*
      ⚠️ **A METADE POSITIVA DO `isRetriable`, E ELA NÃO TINHA ACUSADOR NA
      TAREFA 25** — achado da auditoria de lá. A suíte só falhava o livro com
      **404**, e no 404 o teste asserta a AUSÊNCIA do botão: mutar `isRetriable`
      para `return false` dava **0 acusadores**.
    */
    let attempts = 0;
    const calls = await renderAcervo({
      book: () => {
        attempts += 1;
        return attempts === 1
          ? { status: 500, body: { error: 'Boom: disk is on fire' } }
          : bookReply();
      },
    });

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: pt.pages.acervo.retry }),
      ).not.toBeNull();
    });
    expect(screenIsUp()).toBe(true);
    // Frase genérica por status, nunca o texto da API (§6.2).
    expect(readableText()).not.toContain('Boom');
    expect(readableText()).not.toContain('disk is on fire');
    // E NÃO é a frase do 404, que fala do livro que não existe para você.
    expect(readableText()).not.toContain(pt.pages.acervo.bookUnavailable);
    expectNoGuilt();

    await pressLabel(pt.pages.acervo.retry);
    await waitForRows(10);

    // Repetir REFAZ o `GET /books/:bookId` — não é só apagar a mensagem —, e o
    // acervo vem atrás, porque ele depende do clube que o livro informa.
    expect(requestsTo(calls, '/books/')).toHaveLength(2);
    expect(requestsTo(calls, '/notes')).toHaveLength(1);
    expect(requestsTo(calls, '/highlights?')).toHaveLength(1);
    expectNoGuilt();
  });

  it('⚠️ treats a HALF-loaded collection as a failure, and the retry redoes ALL THREE', async () => {
    /*
      ⚠️ **AS DUAS LISTAGENS SÃO UMA COISA SÓ NA TELA, e é decisão medida.** O
      acervo chega em duas requisições, e mostrar metade dele quando uma falha
      seria uma lista SILENCIOSAMENTE incompleta — a pessoa veria as anotações,
      não veria grifo nenhum, e nada na tela diria por quê. Um estado só para as
      duas cargas é a resposta honesta.

      E o "tentar de novo" refaz as TRÊS cargas da seção — as duas listagens e
      os membros —, que é a lição medida da Tarefa 27: sem o gatilho comum, uma
      falha passageira nos nomes só se conserta recarregando o app, com o único
      botão da seção ali do lado sem efeito sobre ela. O cenário é o REAL: a
      rede caiu, e ela cai para as três.
    */
    let listAttempts = 0;
    let noteAttempts = 0;
    let memberAttempts = 0;
    const calls = await renderAcervo({
      notes: () => {
        noteAttempts += 1;
        return { status: 200, body: notes() };
      },
      list: () => {
        listAttempts += 1;
        return listAttempts === 1
          ? { status: 0, offline: true }
          : { status: 200, body: highlights() };
      },
      members: () => {
        memberAttempts += 1;
        return memberAttempts === 1
          ? { status: 0, offline: true }
          : { status: 200, body: members() };
      },
    });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.acervo.unavailable)).not.toBeNull();
    });
    // ⚠️ NENHUMA lista pela metade: as anotações chegaram e não são mostradas
    // sozinhas.
    expect(
      screen.queryByRole('list', { name: pt.pages.acervo.label }),
    ).toBeNull();
    expect(readableText()).not.toContain(NOTE_TITLES[0]);
    expect(readableText()).not.toContain('Failed to fetch');
    expectNoGuilt();

    await pressLabel(pt.pages.acervo.retry);
    await waitForRows(10);

    // TRÊS cargas refeitas pelo mesmo botão.
    expect(requestsTo(calls, '/notes')).toHaveLength(2);
    expect(requestsTo(calls, '/highlights?')).toHaveLength(2);
    expect(requestsTo(calls, '/members')).toHaveLength(2);
    expect(noteAttempts).toBe(2);
    // E os nomes VOLTAM — no chip e na autoria da linha.
    expect(chipsOf(FILTERS.person.label)).toContain(personChip('Maria'));
    expect(rowOf(NOTE_TITLES[2]).textContent).toContain('Maria');
    expectNoGuilt();
  });

  it('shows a loading state while the collection is in flight, and it does not nag', async () => {
    /*
      O carregamento é um ESTADO desta tela, não uma tela branca: o `h1` já
      está lá (é o que o `Screen` de `./chrome` garante) e há uma frase. A
      resposta é SEGURADA de propósito — sem isso o `act` do render descarrega
      tudo e o estado nunca é observável.
    */
    let release: (() => void) | undefined;
    await renderAcervo({
      list: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { status: 200, body: highlights() };
      },
    });

    expect(screenIsUp()).toBe(true);
    expect(screen.queryByText(pt.pages.acervo.loading)).not.toBeNull();
    expect(
      screen.queryByRole('list', { name: pt.pages.acervo.label }),
    ).toBeNull();
    expectNoGuilt();

    await act(async () => {
      release?.();
    });
    await waitForRows(10);
  });
});

describe('⚠️ THE FOUR DIMENSIONS OF THE FILTER (rules 6 to 12)', () => {
  it('⚠️ draws THREE named groups of chips plus the reading select (rules 6, 10)', async () => {
    /*
      ⚠️ **ESTA TELA É O TERCEIRO CONSUMIDOR DO `FilterBar`** (Tarefa 27), e o
      que o teste pina é o que a COMPOSIÇÃO entrega e o `FilterChip` não: o
      `role="group"` com nome acessível PRÓPRIO (decisão C da 27). Sem ele, quem
      ouve a tela recebe uma fileira única de botões sem saber onde acaba
      "pessoa" e começa "cor".

      ⚠️ **E A LEITURA NÃO É UM GRUPO DE CHIPS, de propósito** (decisão D): o
      plano real tem TRINTA dias (é o que o `docs/COMO-TESTAR.md` §5.1 manda
      gerar), e trinta chips num celular é um filtro que ninguém usa. `<select>`
      nativo tem teclado e acessibilidade de graça, e `packages/ui` **não tem
      `Select`** (medido) — um componente novo lá exigiria tokens, foco e teste
      próprio, sem segundo chamador.
    */
    await renderAcervo();
    await waitForRows(10);

    expect(screen.getAllByRole('group')).toHaveLength(3);

    expect(chipsOf(FILTERS.person.label)).toEqual([
      EVERYONE,
      FILTERS.person.mine,
      personChip('Maria'),
      personChip('Zeca'),
    ]);
    expect(chipsOf(FILTERS.type.label)).toEqual([
      ALL_TYPES,
      KIND.plan,
      KIND.free,
      KIND.highlight,
    ]);
    expect(chipsOf(FILTERS.color.label)).toEqual([
      ALL_COLORS,
      COLOR_NAMES.yellow,
      COLOR_NAMES.green,
      COLOR_NAMES.orange,
      COLOR_NAMES.blue,
      COLOR_NAMES.pink,
    ]);

    // `aria-pressed`, e não `aria-checked`: o chip é um botão de dois estados
    // (regra 25 da Tarefa 13).
    expect(chip(EVERYONE).getAttribute('aria-checked')).toBeNull();
    expect(pressedOf(EVERYONE)).toBe('true');
    expect(pressedOf(ALL_TYPES)).toBe('true');
    expect(pressedOf(ALL_COLORS)).toBe('true');

    /*
      ⚠️ **O `<select>` TEM `<label>` ASSOCIADO, e não um `aria-label` solto**
      (decisão D): um `aria-label` daria nome acessível a quem OUVE a tela e
      deixaria quem VÊ sem saber o que aquela caixa recorta. O `getByLabelText`
      só acha o controle se a associação existir de verdade.
    */
    const select = readingSelect();
    expect(select.tagName).toBe('SELECT');
    expect(select.getAttribute('aria-label')).toBeNull();
    // As opções vêm do PLANO, na ordem do plano, com "todas" primeiro.
    expect(
      Array.from(select.querySelectorAll('option')).map(
        (option) => option.textContent,
      ),
    ).toEqual([FILTERS.reading.all, ...PLAN_TITLES]);
    expect(select.value).toBe('all');
    expectNoGuilt();
  });

  it('⚠️ makes a chip of every ACTIVE member, and of nobody else (rule 7)', async () => {
    /*
      ⚠️ **O QUE NÃO ESTÁ NA LISTA É METADE DO TESTE:**

      - nenhum "De Marcos" — EU sou o chip "Minhas", e dois chips para o mesmo
        recorte é confusão, com o de baixo funcionando e o de cima parecendo
        quebrado;
      - nenhum "De Joana" — ela SAIU do clube (decisão A da 26a: os arquivados
        chegam na resposta **exclusivamente** para resolver o nome de quem
        escreveu e saiu, e isso acontece na LISTA, não no filtro). A outra
        metade — o nome dela na linha que ela deixou — está no teste da regra 3;
      - nenhum "De outras pessoas" — o complemento morreu no modo com nome, e
        ele só volta degradado.
    */
    await renderAcervo();
    await waitForRows(10);

    expect(
      screen.queryByRole('button', { name: personChip('Marcos') }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: personChip('Joana') }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: FILTERS.person.others }),
    ).toBeNull();

    // O avatar no slot `start` do chip, com a inicial de VERDADE — é isso que a
    // Tarefa 26a comprou. E o nome ao lado, porque a inicial não identifica
    // ninguém sozinha (`FilterOption.label` é obrigatório por isso).
    const maria = chip(personChip('Maria'));
    expect(maria.querySelector('[aria-hidden="true"]')?.textContent).toBe('M');
    expectNoGuilt();
  });

  it('⚠️ cuts the collection by PERSON, without asking the server again (rule 7)', async () => {
    const calls = await renderAcervo();
    await waitForRows(10);

    await press(chip(FILTERS.person.mine));
    // CINCO, e são as minhas — anotação do dia, avulsa e grifo. Um filtro que
    // não filtra daria dez; um invertido daria cinco DIFERENTES.
    expect(labelsOnScreen()).toEqual(MY_LABELS);
    expect(pressedIn(FILTERS.person.label)).toEqual([FILTERS.person.mine]);

    await press(chip(personChip('Maria')));
    // QUATRO, e são as dela — quantidade diferente das minhas de propósito.
    expect(labelsOnScreen()).toEqual(MARIA_LABELS);

    await press(chip(EVERYONE));
    expect(labelsOnScreen()).toEqual([...ORDERED_LABELS]);

    /*
      ⚠️ **NENHUMA REQUISIÇÃO NOVA.** As duas listagens aceitam `authorId`, e
      usá-lo faria cada toque num chip virar uma ida ao servidor — "minhas" não
      é um pedido novo, é um recorte do mesmo acervo. Sem esta asserção, a
      implementação que refaz a busca passaria em todas as de cima.
    */
    expect(requestsTo(calls, '/notes')).toHaveLength(1);
    expect(requestsTo(calls, '/highlights?')).toHaveLength(1);
    expect(requestsTo(calls, '/members')).toHaveLength(1);
    expectNoGuilt();
  });

  it('⚠️ cuts the collection by TYPE, and each of the three cuts for real (rule 8)', async () => {
    await renderAcervo();
    await waitForRows(10);

    await press(chip(KIND.plan));
    expect(labelsOnScreen()).toEqual(PLAN_LABELS);
    expect(pressedIn(FILTERS.type.label)).toEqual([KIND.plan]);

    await press(chip(KIND.free));
    expect(labelsOnScreen()).toEqual(FREE_LABELS);

    await press(chip(KIND.highlight));
    expect(labelsOnScreen()).toEqual(HIGHLIGHT_LABELS);

    await press(chip(ALL_TYPES));
    expect(labelsOnScreen()).toEqual([...ORDERED_LABELS]);
    expectNoGuilt();
  });

  it('⚠️ hides the COLOUR group when the type cannot include a highlight, and DISCARDS the choice (rule 9)', async () => {
    /*
      ⚠️ **DECISÃO E, E O TESTE PROVA AS DUAS DIREÇÕES.** Um chip de cor com o
      tipo em "Avulsa" é um filtro que **garante zero resultados** — mostrar um
      controle que só pode esvaziar a lista é pior que esconder.

      E a segunda direção é a que quebra calado: a cor escolhida tem de ser
      **descartada**, senão ela fica valendo por baixo de um grupo que
      desapareceu — um recorte que nenhum chip aceso explica, que é a invariante
      da regra 12. Este é o QUARTO caminho real dela, e os outros três estão no
      docblock da Tarefa 27.
    */
    await renderAcervo();
    await waitForRows(10);

    await press(chip(COLOR_NAMES.yellow));
    expect(labelsOnScreen()).toEqual(YELLOW_LABELS);
    expect(pressedIn(FILTERS.color.label)).toEqual([COLOR_NAMES.yellow]);

    // ⚠️ DIREÇÃO 1: com o tipo em "Avulsa", o grupo de cor DESAPARECE.
    await press(chip(KIND.free));
    expect(
      screen.queryByRole('group', { name: FILTERS.color.label }),
    ).toBeNull();
    expect(screen.getAllByRole('group')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: COLOR_NAMES.yellow })).toBe(
      null,
    );
    // E a lista é a das avulsas INTEIRA: a cor não ficou valendo por baixo.
    expect(labelsOnScreen()).toEqual(FREE_LABELS);

    // Idem para "Do dia": nenhuma anotação tem cor.
    await press(chip(KIND.plan));
    expect(
      screen.queryByRole('group', { name: FILTERS.color.label }),
    ).toBeNull();
    expect(labelsOnScreen()).toEqual(PLAN_LABELS);

    /*
      ⚠️ DIREÇÃO 2: voltando a um tipo que PODE incluir grifo, o grupo volta —
      e ele volta NEUTRO. Se a escolha tivesse sobrevivido, o acervo apareceria
      recortado por amarelo sem ninguém ter tocado num chip de cor.
    */
    await press(chip(ALL_TYPES));
    expect(
      screen.queryByRole('group', { name: FILTERS.color.label }),
    ).not.toBeNull();
    expect(pressedIn(FILTERS.color.label)).toEqual([ALL_COLORS]);
    expect(labelsOnScreen()).toEqual([...ORDERED_LABELS]);

    // E com o tipo em "Grifo" o grupo continua lá: grifo TEM cor.
    await press(chip(KIND.highlight));
    expect(
      screen.queryByRole('group', { name: FILTERS.color.label }),
    ).not.toBeNull();
    await press(chip(COLOR_NAMES.green));
    expect(labelsOnScreen()).toEqual([QUOTES[3]]);
    expectNoGuilt();
  });

  it('⚠️ hides the READING select when the type cannot carry a reading, and DISCARDS the choice (rules 9, 10)', async () => {
    /*
      ⚠️ **A DECISÃO E GENERALIZADA, e a rodada de correção mediu que ela CABE.**

      A primeira versão desta fatia deixou o `<select>` de leitura vivo com o
      tipo em "Avulsa" ou "Grifo" — onde ele **só pode esvaziar a lista**, que é
      exatamente o defeito que a decisão E existe para evitar do lado da cor —, e
      o relatório justificou isso dizendo que generalizar tornaria a regra 11
      ("um caso com as quatro juntas") **impossível**. A afirmação era FALSA nos
      dois pontos, e o §7.10 é explícito sobre medir antes de escrever isso:

      1. o teste da regra 11 já põe o tipo no **neutro** (é o que ele tem de
         fazer para as quatro dimensões coexistirem), e com o tipo em "Tudo" os
         DOIS controles condicionais existem;
      2. a exclusão mútua "cor exige tipo ∈ {Tudo, Grifo} · leitura exige tipo ∈
         {Tudo, Do dia}" **já valia para a cor** e nunca impediu nada.

      A sequência que ficava sem dono é concreta: a pessoa toca "Avulsa", o
      `<select>` continua oferecendo os trinta dias do plano, ela escolhe um, e a
      lista vai a zero — sem nada na tela explicando por quê. O `setColor(null)`
      protegia METADE da simetria.
    */
    await renderAcervo();
    await waitForRows(10);

    await chooseReading(READING_TWO);
    expect(labelsOnScreen()).toEqual([NOTE_TITLES[1], NOTE_TITLES[2]]);

    // ⚠️ DIREÇÃO 1: com o tipo em "Avulsa", o `<select>` DESAPARECE — a avulsa
    // não tem `planItemId`, então nenhuma opção dele poderia casar.
    await press(chip(KIND.free));
    expect(screen.queryByLabelText(FILTERS.reading.label)).toBeNull();
    // E a lista é a das avulsas INTEIRA: a leitura não ficou valendo por baixo.
    expect(labelsOnScreen()).toEqual(FREE_LABELS);

    // Idem para "Grifo": ADR 0004 — ele não depende de existir um dia do plano.
    await press(chip(KIND.highlight));
    expect(screen.queryByLabelText(FILTERS.reading.label)).toBeNull();
    expect(labelsOnScreen()).toEqual(HIGHLIGHT_LABELS);

    /*
      ⚠️ DIREÇÃO 2: voltando a um tipo que PODE carregar leitura, o controle
      volta — e volta NEUTRO. Se a escolha tivesse sobrevivido, o acervo
      apareceria recortado por um dia do plano sem ninguém ter tocado no
      `<select>`.
    */
    await press(chip(ALL_TYPES));
    expect(screen.queryByLabelText(FILTERS.reading.label)).not.toBeNull();
    expect(readingSelect().value).toBe(EVERY_READING_VALUE);
    expect(labelsOnScreen()).toEqual([...ORDERED_LABELS]);

    // E com o tipo em "Do dia" o controle continua lá: a anotação do dia É a
    // que tem leitura.
    await press(chip(KIND.plan));
    expect(screen.queryByLabelText(FILTERS.reading.label)).not.toBeNull();
    await chooseReading(READING_ONE);
    expect(labelsOnScreen()).toEqual([NOTE_TITLES[3]]);
    expectNoGuilt();
  });

  it('⚠️ cuts by READING, and choosing one EXCLUDES the standalone note and the highlight (rule 10)', async () => {
    /*
      ⚠️ **ISTO NÃO É BUG — É A FIDELIDADE QUE O §7.1 REGISTRA COMO 4ª
      APARIÇÃO.** `WHERE "planItemId" = 'x'` contra coluna **nula** é falso no
      Postgres, e o grifo nem tem a coluna (ADR 0004: ele não depende de existir
      um `ReadingPlanItem`). Então escolher uma leitura mostra **só** as
      anotações do dia daquele dia — a avulsa e o grifo saem, e é o que a pessoa
      pediu quando pediu "a leitura de tal dia".

      Este teste existe para o próximo leitor não "consertar" isso.
    */
    await renderAcervo();
    await waitForRows(10);

    await chooseReading(READING_TWO);

    // DUAS anotações do dia, e NENHUMA avulsa e NENHUM grifo.
    expect(labelsOnScreen()).toEqual([NOTE_TITLES[1], NOTE_TITLES[2]]);
    for (const label of [...FREE_LABELS, ...HIGHLIGHT_LABELS]) {
      expect(readableText()).not.toContain(label);
    }
    // O tipo continua em "Tudo": foi a LEITURA que excluiu os dois, não o tipo.
    expect(pressedIn(FILTERS.type.label)).toEqual([ALL_TYPES]);

    // UMA na leitura seguinte — contagens diferentes de propósito (§7.2).
    await chooseReading(READING_ONE);
    expect(labelsOnScreen()).toEqual([NOTE_TITLES[3]]);

    await chooseReading('all');
    expect(labelsOnScreen()).toEqual([...ORDERED_LABELS]);
    expectNoGuilt();
  });

  it('⚠️ combines the dimensions with AND, and the FOUR together come back empty (rule 11)', async () => {
    await renderAcervo();
    await waitForRows(10);

    /*
      TRÊS dimensões vivas, e o AND é o que faz o recorte ser UM: a Maria tem
      quatro entradas, duas são grifo, e só uma delas é amarela. Um OR daria
      quatro ou mais; um "vale a última" daria os três amarelos.
    */
    await press(chip(personChip('Maria')));
    await press(chip(KIND.highlight));
    await press(chip(COLOR_NAMES.yellow));
    expect(labelsOnScreen()).toEqual([QUOTES[1]]);

    // E afrouxar QUALQUER uma das três alarga a lista — é o par que prova que
    // as três estão valendo ao mesmo tempo.
    await press(chip(ALL_COLORS));
    expect(labelsOnScreen()).toEqual([QUOTES[1], QUOTES[3]]);
    await press(chip(EVERYONE));
    expect(labelsOnScreen()).toEqual(HIGHLIGHT_LABELS);

    /*
      ⚠️ **AS QUATRO JUNTAS, e o resultado é VAZIO — por construção.** Com uma
      leitura escolhida, o grifo está fora (ele não tem `planItemId`), e com uma
      cor escolhida, a anotação está fora (ela não tem cor). As duas dimensões
      são mutuamente exclusivas, e o AND é honesto sobre isso: a tela mostra o
      estado "filtrado sem resultado", nunca uma lista que ignora um dos
      recortes.
    */
    await press(chip(personChip('Maria')));
    await press(chip(ALL_TYPES));
    await press(chip(COLOR_NAMES.yellow));
    await chooseReading(READING_TWO);

    expect(
      screen.queryByRole('list', { name: pt.pages.acervo.label }),
    ).toBeNull();
    expect(screen.queryByText(pt.pages.acervo.empty.filtered)).not.toBeNull();
    expect(screen.queryByText(pt.pages.acervo.empty.title)).toBeNull();
    expectNoGuilt();
  });

  it('⚠️ has a filtered-with-no-result state in EVERY dimension (rule 5)', async () => {
    await renderAcervo();
    await waitForRows(10);

    // PESSOA: a Zeca é membro ativo e não escreveu nada.
    await press(chip(personChip('Zeca')));
    expect(screen.queryByText(pt.pages.acervo.empty.filtered)).not.toBeNull();
    expect(screen.queryByText(pt.pages.acervo.empty.title)).toBeNull();
    expect(screen.queryByText(pt.pages.acervo.empty.description)).toBeNull();
    expectNoGuilt();
    await press(chip(EVERYONE));

    // COR: nenhum grifo é azul.
    await press(chip(COLOR_NAMES.blue));
    expect(screen.queryByText(pt.pages.acervo.empty.filtered)).not.toBeNull();
    expectNoGuilt();
    await press(chip(ALL_COLORS));

    // LEITURA: a terceira do plano não tem anotação nenhuma.
    await chooseReading(READING_NONE);
    expect(screen.queryByText(pt.pages.acervo.empty.filtered)).not.toBeNull();
    expectNoGuilt();
  });

  it('⚠️ has the same state for a TYPE that found nothing (rule 5)', async () => {
    // O único recorte de tipo que vem vazio pede um acervo sem grifo nenhum —
    // e o chip existe de qualquer forma, porque os quatro tipos são fixos.
    await renderAcervo({ list: NOTHING });
    await waitForRows(5);

    await press(chip(KIND.highlight));
    expect(screen.queryByText(pt.pages.acervo.empty.filtered)).not.toBeNull();
    expect(screen.queryByText(pt.pages.acervo.empty.title)).toBeNull();
    // ⚠️ E o grupo de COR continua existindo: o tipo "Grifo" PODE incluir
    // grifo, e o acervo estar sem nenhum é dado, não vocabulário.
    expect(
      screen.queryByRole('group', { name: FILTERS.color.label }),
    ).not.toBeNull();
    expectNoGuilt();
  });

  it('⚠️ ALWAYS exactly one chip pressed — the chip that dies mid-session leaves no invisible cut (rule 12)', async () => {
    /*
      ⚠️ **A TRANSIÇÃO REAL, E ELA É DECIDÍVEL EM JSDOM** (§7.10): o `Responder`
      do harness devolve `Reply | Promise<Reply>`, então uma resposta de
      `/members` resolvida à mão produz a sequência que a Tarefa 27 nomeou e que
      esta tela herda:

      `/members` demora → os chips de pessoa são os três do modo degradado →
      toco "De outras pessoas" → os membros chegam → **aquele chip morre**. Sem
      a derivação, o recorte continua valendo e a lista fica cortada por um
      critério que NENHUM chip aceso explica.
    */
    let releaseMembers = (): void => {
      throw new Error('o gatilho dos membros não foi montado');
    };
    const membersArrived = new Promise<Reply>((resolve) => {
      releaseMembers = () => {
        resolve({ status: 200, body: members() });
      };
    });

    await renderAcervo({ members: () => membersArrived });
    await waitForRows(10);

    // Enquanto os membros não chegam, o filtro por pessoa é o da Tarefa 19.
    expect(chipsOf(FILTERS.person.label)).toEqual([
      EVERYONE,
      FILTERS.person.mine,
      FILTERS.person.others,
    ]);

    await press(chip(FILTERS.person.others));
    expect(pressedIn(FILTERS.person.label)).toEqual([FILTERS.person.others]);
    /*
      O complemento de "minhas": as quatro da Maria mais a da Joana, e nesta
      ordem — os índices delas em `ORDERED_LABELS` são 2, 4, 6, 7 e 8, então a
      concatenação JÁ está na ordem da tela (a precondição está no `expect`
      abaixo, que compara com a ordem da lista completa).
    */
    expect(labelsOnScreen()).toEqual([...MARIA_LABELS, NOTE_TITLES[4]]);
    expect(
      [...MARIA_LABELS, NOTE_TITLES[4]].map((label) =>
        ORDERED_LABELS.indexOf(label),
      ),
    ).toEqual([2, 4, 6, 7, 8]);

    // E AGORA os membros chegam, e o chip escolhido deixa de existir.
    await act(async () => {
      releaseMembers();
      await membersArrived;
    });

    await waitFor(() => {
      expect(chipsOf(FILTERS.person.label)).toHaveLength(4);
    });
    // ⚠️ EXATAMENTE UM chip aceso, e o recorte é o que ele diz: o acervo
    // inteiro. Sem a derivação, seriam ZERO acesos e a lista mostraria cinco.
    expect(pressedIn(FILTERS.person.label)).toEqual([EVERYONE]);
    expect(labelsOnScreen()).toEqual([...ORDERED_LABELS]);
    // E os outros dois grupos continuam com exatamente um aceso.
    expect(pressedIn(FILTERS.type.label)).toEqual([ALL_TYPES]);
    expect(pressedIn(FILTERS.color.label)).toEqual([ALL_COLORS]);
    expectNoGuilt();
  });

  it('⚠️ a member whose userId is literally "mine" does not hijack the "Minhas" chip', async () => {
    /*
      ⚠️ **O FIXTURE É PRODUZÍVEL PELO CONTRATO EM QUE A TELA CONFIA** — a
      medição da Tarefa 27: a fronteira que a tela valida é o
      `clubMemberResponseSchema`, e ele declara `userId: z.string()` **sem
      `.uuid()`**. O cliente aceita este corpo, e é o cliente que decide o que a
      tela vê (§6.8).

      Sem o prefixo `author:`, o `value` do chip dela seria exatamente `'mine'`:
      o chip "Minhas" e o dela viram O MESMO chip, o `aria-pressed` acende nos
      dois, e o recorte de um dos dois desaparece — em silêncio.
    */
    await renderAcervo({
      members: {
        status: 200,
        body: [
          { userId: MARCOS, name: 'Marcos', role: 'OWNER', status: 'ACTIVE' },
          { userId: 'mine', name: 'Mina', role: 'MEMBER', status: 'ACTIVE' },
        ] satisfies ClubMemberResponse[],
      },
    });
    await waitForRows(10);

    // Três chips DISTINTOS: o dela não engoliu o "Minhas".
    expect(chipsOf(FILTERS.person.label)).toEqual([
      EVERYONE,
      FILTERS.person.mine,
      personChip('Mina'),
    ]);

    await press(chip(FILTERS.person.mine));
    expect(labelsOnScreen()).toEqual(MY_LABELS);
    expect(pressedIn(FILTERS.person.label)).toEqual([FILTERS.person.mine]);

    await press(chip(personChip('Mina')));
    // E o dela é o dela: ninguém escreveu com esse id, então o recorte é vazio.
    expect(screen.queryByText(pt.pages.acervo.empty.filtered)).not.toBeNull();
    expect(pressedIn(FILTERS.person.label)).toEqual([personChip('Mina')]);
    expectNoGuilt();
  });

  it('⚠️ falls back to a CATALOG phrase for a member with no name — never "null"', async () => {
    /*
      Decisão C da Tarefa 26a: `User.name` é `String?`, o aceite de convite não
      exige nome, e o backend **não inventa fallback** — um `?? 'Alguém'` no
      servidor seria texto de interface em inglês ou português, decidido no
      lugar errado. Quem escolhe a palavra é a TELA, com `t()`.
    */
    await renderAcervo({
      members: {
        status: 200,
        body: [
          { userId: MARCOS, name: 'Marcos', role: 'OWNER', status: 'ACTIVE' },
          { userId: MARIA, name: null, role: 'ADMIN', status: 'ACTIVE' },
        ] satisfies ClubMemberResponse[],
      },
    });
    await waitForRows(10);

    expect(chipsOf(FILTERS.person.label)).toEqual([
      EVERYONE,
      FILTERS.person.mine,
      FILTERS.person.unnamed,
    ]);
    // Nem "null", nem "undefined", nem um chip vazio — em texto OU em atributo.
    expect(readableText()).not.toContain('null');
    expect(readableText()).not.toContain('undefined');

    // E o recorte dela funciona igual: o chip sem nome não é chip quebrado.
    await press(chip(FILTERS.person.unnamed));
    expect(labelsOnScreen()).toEqual(MARIA_LABELS);
    // Na LISTA, quem não tem nome volta ao genérico do catálogo — nas duas
    // metades (a anotação e o grifo).
    expect(rowOf(NOTE_TITLES[2]).textContent).toContain(ITEM.author.other);
    expect(rowOf(QUOTES[1]).textContent).toContain(ITEM.author.other);
    expectNoGuilt();
  });

  it('⚠️ DEGRADES the person dimension when I still do not know WHICH of them is me', async () => {
    /*
      ⚠️ **A ARMADILHA NOMEADA DA TAREFA 18, na sua segunda cara.** Com os
      membros carregados e o `me` desconhecido, "um chip por membro ativo" me
      daria um chip **meu** ao lado de um "Minhas" que mostra tudo. Saber quem
      são as pessoas não basta — é preciso saber qual delas sou eu.

      ⚠️ E aqui o `/me` que falha derruba a tela inteira para a frase de sessão
      (é o que a Tarefa 25 já fazia), então o estado observável é o `/me` que
      **ainda não chegou**: a tela não pede o livro, e é por isso que o teste
      olha a AUSÊNCIA do acervo em vez da lista de chips.
    */
    let releaseMe = (): void => {
      throw new Error('o gatilho do /me não foi montado');
    };
    const meArrived = new Promise<Reply>((resolve) => {
      releaseMe = () => {
        resolve(meReply({ clubs: [CASAL] }));
      };
    });

    const calls = await renderAcervo({ me: () => meArrived });

    // Sem saber quem sou, nada é pedido: "meu × dela" seria chute.
    expect(screenIsUp()).toBe(true);
    expect(requestsTo(calls, '/books/')).toHaveLength(0);
    expect(screen.queryByText(pt.pages.acervo.loading)).not.toBeNull();
    expectNoGuilt();

    await act(async () => {
      releaseMe();
      await meArrived;
    });
    await waitForRows(10);
    expect(chipsOf(FILTERS.person.label)).toHaveLength(4);
  });

  it('offers no filter at all over an empty collection', async () => {
    await renderAcervo({ notes: NOTHING, list: NOTHING });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.acervo.empty.title)).not.toBeNull();
    });
    // Nem chip, nem `<select>`: filtrar o vazio é oferecer uma escolha que não
    // muda nada.
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(screen.queryByLabelText(FILTERS.reading.label)).toBeNull();
    expectNoGuilt();
  });

  it('offers no reading select for a book with no plan', async () => {
    /*
      O mesmo princípio: um `<select>` com uma opção só ("todas as leituras") é
      um controle que não pode fazer nada. E livro sem plano é caminho real — a
      tela do livro tem estado próprio para ele desde a Tarefa 17.
    */
    await renderAcervo({ book: bookReply([]) });
    await waitForRows(10);

    expect(screen.queryByLabelText(FILTERS.reading.label)).toBeNull();
    // Os três grupos de chips continuam: eles não dependem do plano.
    expect(screen.getAllByRole('group')).toHaveLength(3);
    expectNoGuilt();
  });
});

describe('the source of the collection screen (rules 6, 18)', () => {
  it('imports no editor, so the FIRST LOAD stays without TipTap (rule 18)', () => {
    /*
      Esta tela não escreve: quem escreve são os formulários. O acusador de
      verdade é o `__tests__/bundle-guard.test.ts`, que COMPILA o app — este
      teste é o ponteiro que diz onde procurar quando aquele ficar vermelho.
    */
    const source = stripComments(acervoSource());

    expect(source).not.toContain('@clube/ui/editor');
    expect(source).not.toContain('@tiptap');
  });

  it('⚠️ builds the filter with the SHARED FilterBar, and keeps NO chip composition of its own (rule 6)', () => {
    /*
      ⚠️ **A ASSERÇÃO NEGATIVA É A QUE VALE**: uma tela que passasse a usar o
      `FilterBar` e deixasse a composição antiga ao lado teria duas verdades
      sobre o mesmo filtro, e a medição da regra 8 da Tarefa 27 (mudar o
      componente acusa em duas suítes) voltaria a passar por acidente.

      O `role="group"` também não mora aqui: a fronteira acessível do grupo é
      do componente (decisão C da 27), e escrevê-la nas duas casas é o jeito
      silencioso de a segunda sair de sincronia.
    */
    const source = stripComments(acervoSource());

    expect(source).toContain('FilterBar');
    expect(source).not.toContain('FilterChip');
    expect(source).not.toContain('role="group"');
  });

  it('has exactly ONE red line in the source, and it is the failed archive', () => {
    /*
      ⚠️ **A ASSERÇÃO NÃO É "ZERO VERMELHO", e é o que a diferencia da do
      `book.tsx`.** Esta tela TEM um vermelho legítimo: a falha de ARQUIVAR —
      ação destrutiva que não deu certo, que é exatamente o vermelho que o §1
      do `docs/plano-clube-do-livro.md` permite ("vermelho é erro de formulário
      e ação destrutiva, NADA MAIS").

      A rede é a CONTAGEM, com o MESMO regex da guarda única
      (`anti-guilt-dom.ts`, §7.9: cor se varre por regex, nunca por strings
      literais de classe).
    */
    const red = stripComments(acervoSource())
      .split('\n')
      .filter((line) => DANGER_STYLE.test(line));

    expect(red).toHaveLength(1);
    expect(red[0]).toContain('text-danger');
    // O lado positivo do par: o arquivo lido é o certo (um arquivo VAZIO
    // passaria calado — §7.4 escrito como varredura de fonte).
    expect(stripComments(acervoSource())).toContain(
      'pages.acervo.empty.filtered',
    );
  });
});

describe('the catalog of the collection (rule 17)', () => {
  it('has the new keys in pt AND in en, actually translated', () => {
    /*
      A paridade recursiva de chaves é do catálogo
      (`shared/src/locales/__tests__/catalogs.test.ts`) e do compilador (o `en`
      é `typeof pt`). O que ESTE teste acrescenta é o par que nenhum dos dois
      pega: um bloco copiado do `pt` para o `en`, que passa na paridade e
      embarca português no idioma inglês.
    */
    expect(Object.keys(en.pages.acervo)).toEqual(Object.keys(pt.pages.acervo));
    expect(en.pages.acervo.title).not.toBe(pt.pages.acervo.title);
    expect(en.pages.acervo.empty.description).not.toBe(
      pt.pages.acervo.empty.description,
    );
    expect(en.pages.acervo.empty.filtered).not.toBe(
      pt.pages.acervo.empty.filtered,
    );
    expect(en.pages.acervo.archive.description).not.toBe(
      pt.pages.acervo.archive.description,
    );
    expect(en.pages.acervo.item.archive).not.toBe(pt.pages.acervo.item.archive);

    // As três palavras do TIPO, traduzidas nas duas — e é o `en` que o teste
    // de tela nunca vê, porque toda suíte pina `pt`.
    expect(Object.keys(en.pages.acervo.kind)).toEqual(
      Object.keys(pt.pages.acervo.kind),
    );
    expect(en.pages.acervo.kind.plan).not.toBe(pt.pages.acervo.kind.plan);
    expect(en.pages.acervo.kind.free).not.toBe(pt.pages.acervo.kind.free);
    expect(en.pages.acervo.kind.highlight).not.toBe(
      pt.pages.acervo.kind.highlight,
    );

    // As quatro dimensões, com rótulo de grupo em cada uma.
    expect(Object.keys(en.pages.acervo.filters)).toEqual(
      Object.keys(pt.pages.acervo.filters),
    );
    for (const dimension of ['person', 'type', 'color', 'reading'] as const) {
      expect(en.pages.acervo.filters[dimension].label).not.toBe(
        pt.pages.acervo.filters[dimension].label,
      );
      expect(en.pages.acervo.filters[dimension].all).not.toBe(
        pt.pages.acervo.filters[dimension].all,
      );
    }
  });

  it('⚠️ gives every dimension a DISTINCT neutral label, in both locales', () => {
    /*
      ⚠️ **TRÊS GRUPOS DE CHIPS NA MESMA TELA, e dois "Tudo" seriam DOIS BOTÕES
      COM O MESMO NOME ACESSÍVEL.** Para quem usa leitor de tela isso é a mesma
      palavra com dois comportamentos; para esta suíte é um
      `getByRole('button', { name })` que lança
      *"found multiple elements"* — o defeito aparece como erro de teste, não
      como bug de produto, e é por isso que ele tem guarda própria.
    */
    for (const catalog of [pt, en]) {
      const neutral = [
        catalog.pages.acervo.filters.person.all,
        catalog.pages.acervo.filters.type.all,
        catalog.pages.acervo.filters.color.all,
        catalog.pages.acervo.filters.reading.all,
      ];
      expect(new Set(neutral).size).toBe(neutral.length);

      // E os rótulos de GRUPO também: eles são o nome acessível de cada
      // `role="group"`, e dois iguais tornariam o grupo inencontrável.
      const labels = [
        catalog.pages.acervo.filters.person.label,
        catalog.pages.acervo.filters.type.label,
        catalog.pages.acervo.filters.color.label,
        catalog.pages.acervo.filters.reading.label,
      ];
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('⚠️ keeps the {{name}} interpolator alive in both locales', () => {
    // Um `en` que perdesse o interpolador mostraria o chip sem o nome de
    // ninguém — o defeito que a Tarefa 27 consertou, de volta pelo outro
    // idioma.
    for (const label of [
      pt.pages.acervo.filters.person.person,
      en.pages.acervo.filters.person.person,
    ]) {
      expect(label).toContain('{{name}}');
    }
    for (const label of [
      pt.pages.acervo.item.page,
      en.pages.acervo.item.page,
    ]) {
      expect(label).toContain('{{number}}');
    }
  });
});
