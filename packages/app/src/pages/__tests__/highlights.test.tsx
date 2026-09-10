import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { HighlightResponse, NoteDocBody } from '@clube/shared';
import { HIGHLIGHT_COLORS } from '@clube/shared';
import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { en, pt } from '@clube/shared/locales';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import type { ClubSummary } from '../../club/active-club';
import { highlightNewPath, highlightPath, highlightsPath } from '../paths';
import { expectNoPrivacyTalk } from './adr-0002-dom';
import {
  DANGER_STYLE,
  expectNoGuilt,
  expectNoGuiltBesidesFormError,
  stripComments,
} from './anti-guilt-dom';
import {
  aBook,
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
 * A COLEÇÃO DE GRIFOS DO LIVRO — as regras 4 a 10, 21 e 22 da Tarefa 25.
 *
 * Entra pelo `<App />` inteiro, como as telas 16 a 20: metade do que a fatia
 * entrega é composição — a rota nova, o `RequireAuth` que a protege, e o `me`
 * do contexto que decide "meu × dela".
 *
 * ⚠️ **O DUBLÊ DO EDITOR EXISTE AQUI SEM QUE ESTA TELA USE EDITOR NENHUM** — o
 * mesmo motivo do `book.test.tsx`: um teste toca "Novo grifo" e chega na tela
 * que escreve, e lá o `React.lazy` importaria o ProseMirror inteiro para provar
 * uma navegação. O que se prova aqui é o endereço, não o editor. (Que ESTA tela
 * não importa editor é uma varredura de fonte, no fim do arquivo.)
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
    createdAt: '2026-09-04T10:00:00.000Z',
    updatedAt: '2026-09-04T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * ⚠️ **O ACERVO É ESCOLHIDO PARA A IMPLEMENTAÇÃO ERRADA FALHAR** (§7.2), e são
 * seis propriedades, cada uma matando um mutante:
 *
 * 1. **as contagens por cor são DIFERENTES** — amarelo 3, verde 1, rosa 1, e
 *    laranja/azul 0. Um filtro que não filtra devolve 5, um invertido devolve 2
 *    onde se espera 3, e nenhum dos dois passa;
 * 2. **cor e autoria NÃO coincidem**: o amarelo tem dois meus e um dela, então
 *    um filtro que confundisse os dois eixos acusa;
 * 3. **as autorias estão INTERCALADAS** (eu, ela, eu, ela, eu), e são 3 × 2 —
 *    quantidades diferentes, e nenhum recorte por prefixo ou sufixo passa;
 * 4. **o grifo SEM PÁGINA é o segundo**, não o primeiro nem o último (regra 5);
 * 5. **o grifo SEM COMENTÁRIO é o do meio** (regra 6), e ele é MEU — então
 *    "sem comentário" não coincide com "de outra pessoa";
 * 6. **trechos, ids e páginas em ordem DECRESCENTE**: uma tela que ordenasse
 *    por qualquer um dos três acusa (a precondição está pinada logo abaixo).
 */
const QUOTES = [
  'Zangado com o dragao adormecido',
  'Uma porta redonda e verde na colina',
  'O carneiro assado que abre a leitura',
  'Duas linhas sobre o anel',
  'A promessa do anao',
] as const;

const YELLOW_QUOTES = [QUOTES[0], QUOTES[1], QUOTES[2]];
const MY_QUOTES = [QUOTES[0], QUOTES[2], QUOTES[4]];
const HER_QUOTES = [QUOTES[1], QUOTES[3]];

/** O grifo sem página, o sem comentário e um de cada autoria. */
const NO_PAGE_QUOTE = QUOTES[1];
const NO_COMMENT_QUOTE = QUOTES[2];
const NO_COMMENT_ID = 'h-3';

function collection(): HighlightResponse[] {
  return [
    aHighlight({
      id: 'h-5',
      userId: MARCOS,
      color: YELLOW,
      page: 112,
      reference: 'Cap. 12',
      quote: QUOTES[0],
      commentDoc: aDoc('ele ficou zangado quando a porta se fechou'),
      commentText: 'ele ficou zangado quando a porta se fechou',
    }),
    aHighlight({
      id: 'h-4',
      userId: MARIA,
      color: YELLOW,
      page: null,
      reference: null,
      quote: QUOTES[1],
      commentDoc: aDoc('a colina inteira num paragrafo'),
      commentText: 'a colina inteira num paragrafo',
    }),
    aHighlight({
      id: NO_COMMENT_ID,
      userId: MARCOS,
      color: YELLOW,
      page: 58,
      reference: 'Cap. 5',
      quote: QUOTES[2],
      // REGRA 6: não há comentário. `commentText` é DERIVADO do `commentDoc`
      // (ADR 0001), então `null` no documento implica `''` no texto — o
      // fixture não pode inventar as duas pontas em desacordo (§7.1).
      commentDoc: null,
      commentText: '',
    }),
    aHighlight({
      id: 'h-2',
      userId: MARIA,
      color: GREEN,
      page: 31,
      reference: 'Cap. 3',
      quote: QUOTES[3],
      commentDoc: aDoc('duas linhas e o anel muda de dono'),
      commentText: 'duas linhas e o anel muda de dono',
    }),
    aHighlight({
      id: 'h-1',
      userId: MARCOS,
      color: PINK,
      page: 9,
      reference: 'Cap. 1',
      quote: QUOTES[4],
      commentDoc: aDoc('a promessa vale o que custa cumpri-la'),
      commentText: 'a promessa vale o que custa cumpri-la',
    }),
  ];
}

interface HighlightsSetup {
  /**
   * `GET /books/:bookId` — `Reply` ou um `Responder`, para o caso em que a
   * PRIMEIRA chamada falha e a segunda (a do "tentar de novo") dá certo.
   */
  book?: Reply | Responder;
  /** `GET /clubs/:clubId/highlights?bookId=…`, ou um por chamada. */
  list?: Reply | Responder;
  /** `DELETE /highlights/:highlightId`. */
  write?: Reply | Responder;
  me?: Reply;
  path?: string;
}

function bookReply(): Reply {
  return {
    status: 200,
    body: {
      book: aBook({ id: BOOK_ID, clubId: CLUB_ID }),
      planItems: [],
      writers: [],
    },
  };
}

/**
 * O shell autenticado inteiro, endpoint por endpoint.
 *
 * ⚠️ A ORDEM importa e cada linha tem um motivo:
 * - `/highlights/` (com barra) é a escrita por id (`DELETE /highlights/:id`);
 * - `/highlights?` é a LISTAGEM (`/clubs/:clubId/highlights?bookId=…`), e ela
 *   viria depois de `/books/` se o fragmento fosse só `/highlights`.
 */
function highlightsResponder(setup: HighlightsSetup): Responder {
  return replyByUrl(
    [
      ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
      ['/me', setup.me ?? meReply({ clubs: [CASAL] })],
      ['/highlights/', setup.write ?? { status: 200, body: aHighlight() }],
      ['/highlights?', setup.list ?? { status: 200, body: collection() }],
      ['/books/', setup.book ?? bookReply()],
    ],
    { status: 500, body: { error: 'Internal Server Error' } },
  );
}

async function renderHighlights(
  setup: HighlightsSetup = {},
): Promise<RecordedRequest[]> {
  const calls = stubFetch(highlightsResponder(setup));

  await act(async () => {
    renderPage(<App />, {
      path: setup.path ?? highlightsPath(BOOK_ID),
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
  const list = screen.getByRole('list', { name: pt.pages.highlights.label });
  return Array.from(list.querySelectorAll('li'));
}

/** Os trechos NA ORDEM DA TELA — a observável do filtro e da ordem. */
function quotesOnScreen(): Array<string | undefined> {
  return rows().map((row) =>
    QUOTES.find((quote) => row.textContent?.includes(quote)),
  );
}

function rowOf(quote: string): HTMLElement {
  const row = rows().find((item) => item.textContent?.includes(quote));
  if (row === undefined) throw new Error(`nenhum grifo com "${quote}"`);
  return row;
}

/**
 * Os parágrafos de uma linha: o TRECHO e, quando existe, a prévia do
 * comentário. É a observável da regra 6 — o meta (cor, página, referência,
 * autoria) é `span`, então contar `p` separa "há comentário" de "não há", e um
 * bloco de comentário VAZIO conta como um.
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

const COLOR_NAMES = pt.pages.highlights.colors;
const ALL_COLORS = pt.pages.highlights.filters.all;
const ITEM = pt.pages.highlights.item;

function highlightsSource(): string {
  return readFileSync(resolve(__dirname, '..', 'highlights.tsx'), 'utf8');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the fixture is hostile to the wrong implementations (§7.2)', () => {
  it('has different counts per colour, per author, and decreasing order', () => {
    const all = collection();

    // 1. contagens por cor diferentes entre si e do total.
    expect(all.filter((h) => h.color === YELLOW)).toHaveLength(3);
    expect(all.filter((h) => h.color === GREEN)).toHaveLength(1);
    expect(all.filter((h) => h.color === PINK)).toHaveLength(1);
    expect(all).toHaveLength(5);

    // 2. cor e autoria NÃO coincidem: o amarelo tem os dois autores.
    const yellow = all.filter((h) => h.color === YELLOW);
    expect(new Set(yellow.map((h) => h.userId)).size).toBe(2);

    // 3. autorias intercaladas, 3 × 2.
    expect(all.map((h) => h.userId)).toEqual([
      MARCOS,
      MARIA,
      MARCOS,
      MARIA,
      MARCOS,
    ]);

    // 4 e 5. o sem página é o segundo, o sem comentário é o do meio e é MEU.
    expect(all.findIndex((h) => h.page === null)).toBe(1);
    expect(all.findIndex((h) => h.commentDoc === null)).toBe(2);
    expect(all[2]?.userId).toBe(MARCOS);

    // 6. trechos, ids e páginas em ordem decrescente — uma tela que ordenasse
    // por qualquer um dos três acusa.
    const quotes = all.map((h) => h.quote);
    expect([...quotes].sort().reverse()).toEqual(quotes);
    const ids = all.map((h) => h.id);
    expect([...ids].sort().reverse()).toEqual(ids);
    const pages = all.map((h) => h.page).filter((p): p is number => p !== null);
    expect([...pages].sort((a, b) => b - a)).toEqual(pages);
  });
});

describe('the collection draws quote, colour, page and authorship (rule 4)', () => {
  it('loads the book and then the collection of the CLUB, filtered by book', async () => {
    const calls = await renderHighlights();
    await waitForRows(5);

    /*
      DUAS requisições, e nenhuma rota nova: o livro (que dá o `clubId` e faz o
      corte de tenant) e o acervo do clube filtrado por `bookId`. Não existe
      `GET /highlights/:id` nem `GET /books/:bookId/highlights` — → o docblock
      de `HIGHLIGHTS_PATH` em `pages/paths.ts`.
    */
    expect(requestsTo(calls, '/books/')).toHaveLength(1);
    expect(requestAt(requestsTo(calls, '/books/'), 0).url).toBe(
      `https://api.teste/books/${BOOK_ID}`,
    );
    expect(requestsTo(calls, '/highlights?')).toHaveLength(1);
    /*
      ⚠️ DECISÃO D: a query sai pela opção `query` do cliente, que usa
      `URLSearchParams`. Nesta fatia ela não leva cor (o filtro é no cliente),
      e é por isso que o `%23` da armadilha da Tarefa 24 não aparece — a regra
      existe para a 28/29 não reintroduzi-la por concatenação.
    */
    expect(requestAt(requestsTo(calls, '/highlights?'), 0).url).toBe(
      `https://api.teste/clubs/${CLUB_ID}/highlights?bookId=${BOOK_ID}`,
    );
    expect(requestAt(requestsTo(calls, '/highlights?'), 0).method).toBe('GET');
  });

  it('shows the quote, the colour NAME, the page and who wrote it', async () => {
    await renderHighlights();
    await waitForRows(5);

    // A ordem é a que a API devolveu (o `listHighlights` ordena por
    // `createdAt` decrescente). A tela NÃO reordena — duas ordens seriam duas
    // verdades.
    expect(quotesOnScreen()).toEqual([...QUOTES]);

    const mine = rowOf(QUOTES[4]);
    expect(mine.textContent).toContain(COLOR_NAMES.pink);
    expect(mine.textContent).toContain('Página 9');
    expect(mine.textContent).toContain('Cap. 1');
    expect(mine.textContent).toContain(ITEM.author.you);

    const hers = rowOf(QUOTES[1]);
    expect(hers.textContent).toContain(COLOR_NAMES.yellow);
    expect(hers.textContent).toContain(ITEM.author.other);
    expect(hers.textContent).not.toContain(ITEM.author.you);

    // O livro é o contexto da tela, e o nome dela é "Grifos".
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: pt.pages.highlights.title,
      }),
    ).not.toBeNull();
    expect(readableText()).toContain('O Hobbit');
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('⚠️ never lets the COLOUR be the only carrier of information', async () => {
    /*
      ⚠️ A regra 4 escrita como propriedade de TODAS as linhas, e não de uma: a
      amostra é um `span` `aria-hidden` com a cor numa variável CSS, então quem
      não distingue as cinco cores (ou não vê nenhuma) depende do NOME. Um
      mutante que apague o `<span>` do nome deixa a bolinha sozinha — bonito, e
      ilegível para quem usa leitor de tela.
    */
    await renderHighlights();
    await waitForRows(5);

    const names = Object.values(COLOR_NAMES);
    for (const row of rows()) {
      const text = row.textContent ?? '';
      expect(names.some((name) => text.includes(name))).toBe(true);
    }

    // E o par positivo: a amostra existe, com a cor da paleta de `shared`.
    const swatches = Array.from(
      document.querySelectorAll<HTMLElement>('[style*="--swatch"]'),
    );
    const painted = swatches.map(
      (swatch) => swatch.getAttribute('style') ?? '',
    );
    expect(painted.some((style) => style.includes(PINK))).toBe(true);
    expect(painted.some((style) => style.includes(YELLOW))).toBe(true);
    // Nenhuma cor fora da paleta fixa (`HIGHLIGHT_COLORS` de `@clube/shared`).
    for (const style of painted) {
      const hex = /#[0-9a-f]{6}/u.exec(style);
      expect(hex).not.toBeNull();
      expect(HIGHLIGHT_COLORS).toContain(hex?.[0]);
    }
  });

  it('⚠️ has its OWN state for the highlight with no page (rule 5)', async () => {
    await renderHighlights();
    await waitForRows(5);

    const noPage = rowOf(NO_PAGE_QUOTE);
    // Nada de "Página null", nada de "Página" sem número: a ausência é
    // silenciosa, que é o anti-culpa aplicado ao espaço vazio.
    expect(noPage.textContent).not.toContain('Página');
    expect(readableText()).not.toContain('null');
    expect(readableText()).not.toContain('undefined');
    expect(readableText()).not.toContain('NaN');

    // O par positivo: os outros QUATRO mostram a página.
    const withPage = rows().filter((row) =>
      row.textContent?.includes('Página'),
    );
    expect(withPage).toHaveLength(4);
  });
});

describe('⚠️ THE HIGHLIGHT WITH NO COMMENT RENDERS NO COMMENT AREA (rule 6)', () => {
  it('previews the commentText, and shows NOTHING when commentDoc is null', async () => {
    await renderHighlights();
    await waitForRows(5);

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
    expectNoPrivacyTalk();
  });

  it('shows no comment area for a comment that EXISTS and says nothing', async () => {
    /*
      ⚠️ A METADE QUE SÓ ESTE FIXTURE ACUSA. Um grifo pode ter `commentDoc`
      não-nulo e `commentText` vazio: é o documento em branco que o editor
      emite quando alguém abre o campo e não escreve. Uma guarda escrita só
      contra `commentDoc === null` renderiza para ele um bloco de comentário
      VAZIO — a "área de comentário vazia" que a regra 6 proíbe, com a mesma
      cara de bug do "página null".
    */
    await renderHighlights({
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

describe('the colour filter is CLIENT-SIDE and changes the list (rule 7)', () => {
  it('starts on "every colour" and filters without asking the server again', async () => {
    const calls = await renderHighlights();
    await waitForRows(5);

    // O estado "todas" existe, e é o inicial.
    expect(pressedOf(ALL_COLORS)).toBe('true');
    expect(pressedOf(COLOR_NAMES.yellow)).toBe('false');

    await press(chip(COLOR_NAMES.yellow));

    expect(quotesOnScreen()).toEqual(YELLOW_QUOTES);
    expect(pressedOf(COLOR_NAMES.yellow)).toBe('true');
    expect(pressedOf(ALL_COLORS)).toBe('false');
    // ⚠️ DECISÃO C: o recorte é no CLIENTE. Uma requisição por toque de chip é
    // pior que filtrar o acervo já carregado — e o `%23` da Tarefa 24 só
    // apareceria por aí.
    expect(requestsTo(calls, '/highlights?')).toHaveLength(1);
    expectNoGuilt();
    expectNoPrivacyTalk();

    await press(chip(COLOR_NAMES.green));
    expect(quotesOnScreen()).toEqual([QUOTES[3]]);
    expect(pressedOf(COLOR_NAMES.yellow)).toBe('false');

    await press(chip(ALL_COLORS));
    expect(quotesOnScreen()).toEqual([...QUOTES]);
    expect(requestsTo(calls, '/highlights?')).toHaveLength(1);
  });

  it('⚠️ draws the chips with the SHARED FilterBar, in ONE named group (rules 1, 7, 8 of task 27)', async () => {
    /*
      ⚠️ **ESTE TESTE É METADE DA MEDIÇÃO DA REGRA 8 DA TAREFA 27**, e a outra
      metade é o teste gêmeo em `book.test.tsx`: mudar a marcação do `FilterBar`
      tem de deixar vermelho em **mais de uma** suíte de tela. Se acusasse numa
      só, uma das duas telas não estaria usando o componente compartilhado — é a
      regra 2 da Tarefa 25, que pegou exatamente isso.

      O que ele pina é o que a COMPOSIÇÃO entrega e o `FilterChip` não: o
      `role="group"` com nome acessível próprio (decisão C). Sem ele, quem ouve
      a tela recebe seis botões seguidos sem saber de que dimensão são.
    */
    await renderHighlights();
    await waitForRows(5);

    const group = screen.getByRole('group', {
      name: pt.pages.highlights.filters.label,
    });
    // UM grupo só: esta tela tem uma dimensão (a cor). O segundo grupo chega
    // com o acervo unificado da Tarefa 28.
    expect(screen.getAllByRole('group')).toHaveLength(1);

    // Os seis chips, na ordem de `@clube/shared` — "todas" primeiro, e depois a
    // paleta na mesma ordem da barra do editor.
    expect(
      Array.from(group.querySelectorAll('button')).map(
        (chipButton) => chipButton.textContent,
      ),
    ).toEqual([
      ALL_COLORS,
      COLOR_NAMES.yellow,
      COLOR_NAMES.green,
      COLOR_NAMES.orange,
      COLOR_NAMES.blue,
      COLOR_NAMES.pink,
    ]);
    expectNoGuilt();
  });

  it('⚠️ keeps the colour NAME on every chip — colour is never the only carrier (rule 3 of task 27)', async () => {
    /*
      A regra 4 da Tarefa 25, medida lá: apagar o nome da cor dá 2 acusadores.
      Aqui o par é o outro: a amostra entra pelo slot `start` do chip e o NOME
      continua sendo o nome acessível — um chip só-com-bolinha não diria nada a
      quem não distingue as cinco cores.
    */
    await renderHighlights();
    await waitForRows(5);

    for (const name of Object.values(COLOR_NAMES)) {
      const chipButton = chip(name);
      expect(chipButton.textContent).toContain(name);
      // E a bolinha está DENTRO do chip, fora do caminho do leitor de tela.
      expect(chipButton.querySelector('[aria-hidden="true"]')).not.toBeNull();
    }
    expectNoGuilt();
  });

  it('uses aria-pressed, not aria-checked', async () => {
    // O chip é um botão de DOIS ESTADOS, não um controle de formulário
    // (regra 25 da Tarefa 13): `aria-checked` faria o leitor de tela anunciar
    // um radio que não existe.
    await renderHighlights();
    await waitForRows(5);

    expect(chip(ALL_COLORS).getAttribute('aria-checked')).toBeNull();
    expect(chip(COLOR_NAMES.blue).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('empty ≠ filtered-with-no-result, and neither one nags (rules 8, 21)', () => {
  it('has an empty state with no nagging, and no filter over the void', async () => {
    await renderHighlights({ list: { status: 200, body: [] } });

    await waitFor(() => {
      expect(
        screen.queryByText(pt.pages.highlights.empty.title),
      ).not.toBeNull();
    });
    expect(
      screen.queryByText(pt.pages.highlights.empty.description),
    ).not.toBeNull();
    expect(screen.queryByText(pt.pages.highlights.empty.filtered)).toBeNull();
    // Filtrar o vazio é oferecer uma escolha que não muda nada.
    expect(screen.queryByRole('button', { name: ALL_COLORS })).toBeNull();
    // Mas registrar o primeiro continua possível: escrever não depende de
    // haver acervo.
    expect(
      screen.queryByRole('button', { name: pt.pages.highlights.new }),
    ).not.toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('has a DIFFERENT state for a filter that found nothing', async () => {
    /*
      É a lição da Tarefa 19: os dois estados não são o mesmo. "Registre o
      primeiro" embaixo de um filtro que só escondeu o que existe é mentira.
    */
    await renderHighlights();
    await waitForRows(5);

    await press(chip(COLOR_NAMES.blue));

    expect(
      screen.queryByText(pt.pages.highlights.empty.filtered),
    ).not.toBeNull();
    expect(screen.queryByText(pt.pages.highlights.empty.title)).toBeNull();
    expect(
      screen.queryByText(pt.pages.highlights.empty.description),
    ).toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();
  });
});

describe('⚠️ THE HIGHLIGHT OF ANOTHER PERSON HAS NO AFFORDANCE AT ALL (rule 9)', () => {
  it('gives the actions to MY highlight and nothing to hers', async () => {
    /*
      ADR 0002: o trecho dela está aqui INTEIRO, porque dentro do clube não
      existe conteúdo privado. O que não existe é corrigir ou arquivar o que o
      outro escreveu — e isso é AUTORIA, não privacidade. Daí o
      `expectNoPrivacyTalk` junto.
    */
    await renderHighlights();
    await waitForRows(5);

    for (const quote of MY_QUOTES) {
      const row = rowOf(quote);
      expect(
        row.querySelector(`a[href^="/books/${BOOK_ID}/highlights/"]`),
      ).not.toBeNull();
      expect(row.querySelectorAll('button')).toHaveLength(1);
    }

    for (const quote of HER_QUOTES) {
      const row = rowOf(quote);
      expect(row.querySelectorAll('button')).toHaveLength(0);
      expect(row.querySelectorAll('a')).toHaveLength(0);
    }
    expectNoPrivacyTalk();
    expectNoGuilt();
  });

  it('points the correction at the highlight itself, by the router Link', async () => {
    await renderHighlights();
    await waitForRows(5);

    const link = rowOf(NO_COMMENT_QUOTE).querySelector('a');
    expect(link?.getAttribute('href')).toBe(
      highlightPath(BOOK_ID, NO_COMMENT_ID),
    );

    // ⚠️ E ele NAVEGA sem recarregar: em jsdom o endereço só muda se o
    // roteador interceptou o clique (uma âncora crua não navega). É a lição
    // medida da Tarefa 16.
    if (link === null) throw new Error('a linha não tem link de correção');
    await press(link);
    expect(locationText()).toBe(highlightPath(BOOK_ID, NO_COMMENT_ID));
  });

  it('opens the NEW highlight from an explicit button, writing nothing', async () => {
    const calls = await renderHighlights();
    await waitForRows(5);

    await pressLabel(pt.pages.highlights.new);

    expect(locationText()).toBe(highlightNewPath(BOOK_ID));
    /*
      REGRA 19: abrir a tela de registro NÃO grava linha no banco. O filtro é
      por ENDPOINT e não por método — o `POST /auth/refresh` do shell é uma
      escrita legítima que não tem nada a ver com grifo (é a lição do
      `requestsTo` do harness).
    */
    expect(
      requestsTo(calls, '/highlights').filter((call) => call.method !== 'GET'),
    ).toEqual([]);
  });

  it('does not guess who I am when the /me failed', async () => {
    /*
      ⚠️ A ARMADILHA NOMEADA DA TAREFA 18: `me` é `null` fora do `ready`. Uma
      tela que tratasse isso como "não sou ninguém" mostraria os MEUS grifos
      como "de alguém do clube", sem affordance nenhuma — em silêncio.
    */
    const calls = await renderHighlights({
      me: { status: 500, body: { error: 'Boom' } },
    });

    expect(screenIsUp()).toBe(true);
    expect(requestsTo(calls, '/books/')).toHaveLength(0);
    expect(requestsTo(calls, '/highlights')).toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: pt.pages.highlights.retry }),
    ).not.toBeNull();
    expect(readableText()).not.toContain('Boom');
    expectNoGuilt();
  });
});

describe('⚠️ ARCHIVING ASKS FIRST (rule 10)', () => {
  async function openArchiveOf(quote: string): Promise<void> {
    const row = rowOf(quote);
    const button = row.querySelector('button');
    if (button === null) throw new Error('a linha não tem botão de arquivar');
    await press(button);
  }

  it('does NOT call the API when the confirmation is cancelled', async () => {
    const calls = await renderHighlights();
    await waitForRows(5);

    await openArchiveOf(NO_COMMENT_QUOTE);

    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(
      screen.queryByText(pt.pages.highlights.archive.description),
    ).not.toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();

    await pressLabel(pt.pages.highlights.archive.cancel);

    // ⚠️ NENHUMA requisição — e o sheet saiu do DOM (fechado ele não está lá,
    // que é o que impede o "Cancelar" de continuar tabulável).
    expect(requestsTo(calls, '/highlights/')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    // E o grifo continua na lista, inteiro.
    expect(quotesOnScreen()).toEqual([...QUOTES]);
  });

  it('sends DELETE on confirm, and the highlight LEAVES the list for good', async () => {
    const calls = await renderHighlights({
      write: {
        status: 200,
        body: aHighlight({
          id: NO_COMMENT_ID,
          status: 'ARCHIVED',
          archivedAt: '2026-09-05T10:00:00.000Z',
        }),
      },
    });
    await waitForRows(5);

    await openArchiveOf(NO_COMMENT_QUOTE);
    await pressLabel(pt.pages.highlights.archive.confirm);

    expect(requestsTo(calls, '/highlights/')).toHaveLength(1);
    const write = requestAt(requestsTo(calls, '/highlights/'), 0);
    expect(write.method).toBe('DELETE');
    expect(write.url).toBe(`https://api.teste/highlights/${NO_COMMENT_ID}`);

    expect(quotesOnScreen()).toEqual([
      QUOTES[0],
      QUOTES[1],
      QUOTES[3],
      QUOTES[4],
    ]);
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
    expect(quotesOnScreen()).toEqual([QUOTES[0], QUOTES[1]]);
    await press(chip(ALL_COLORS));
    expect(readableText()).not.toContain(NO_COMMENT_QUOTE);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('says it could not archive, and keeps the highlight on the screen', async () => {
    const calls = await renderHighlights({
      write: { status: 500, body: { error: 'Boom: disk is on fire' } },
    });
    await waitForRows(5);

    await openArchiveOf(NO_COMMENT_QUOTE);
    await pressLabel(pt.pages.highlights.archive.confirm);

    expect(requestsTo(calls, '/highlights/')).toHaveLength(1);
    expect(
      screen.queryByText(pt.pages.highlights.archive.failed),
    ).not.toBeNull();
    // Nada da API na tela, atributos incluídos (regra 22).
    expect(readableText()).not.toContain('Boom');
    expect(readableText()).not.toContain('disk is on fire');
    // O grifo continua aqui: nada foi arquivado.
    expect(quotesOnScreen()).toEqual([...QUOTES]);
    expectNoGuiltBesidesFormError([pt.pages.highlights.archive.failed]);
    expectNoPrivacyTalk();
  });
});

describe('the collection when the book or the network goes away (rules 21, 22)', () => {
  it('handles a 404 on the book with its OWN words, and never a blank screen', async () => {
    await renderHighlights({
      book: { status: 404, body: { error: 'Not found' } },
    });

    await waitFor(() => {
      expect(
        screen.queryByText(pt.pages.highlights.bookUnavailable),
      ).not.toBeNull();
    });
    expect(screenIsUp()).toBe(true);
    // Frase PRÓPRIA, não o genérico de 404, que não diz o quê.
    expect(readableText()).not.toContain(pt.errors.notFound);
    expect(readableText()).not.toContain('Not found');
    // Retentar um 404 é pedir outra vez a mesma negativa.
    expect(
      screen.queryByRole('button', { name: pt.pages.highlights.retry }),
    ).toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('⚠️ offers to repeat a BOOK that failed with 500, and the repeat REDOES it', async () => {
    /*
      ⚠️ **A METADE POSITIVA DO `isRetriable`, E ELA NÃO TINHA ACUSADOR** —
      achado da auditoria da Tarefa 25. A suíte só falhava o livro com **404**,
      e no 404 o teste asserta a AUSÊNCIA do botão: mutar `isRetriable` para
      `return false` dava **0 acusadores**, ou seja o "tentar de novo" do livro
      podia desaparecer para sempre com a suíte verde.

      O par completo é o padrão que o `isGone` do formulário já tinha. 500 é o
      caso que se retenta (rede, servidor, corpo fora do contrato); 404 é a
      negativa que não muda com insistência.
    */
    let attempts = 0;
    const calls = await renderHighlights({
      book: () => {
        attempts += 1;
        return attempts === 1
          ? { status: 500, body: { error: 'Boom: disk is on fire' } }
          : bookReply();
      },
    });

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: pt.pages.highlights.retry }),
      ).not.toBeNull();
    });
    expect(screenIsUp()).toBe(true);
    // Frase genérica por status, nunca o texto da API (§6.2).
    expect(readableText()).not.toContain('Boom');
    expect(readableText()).not.toContain('disk is on fire');
    // E NÃO é a frase do 404, que fala do livro que não existe para você.
    expect(readableText()).not.toContain(pt.pages.highlights.bookUnavailable);
    expectNoGuilt();

    await pressLabel(pt.pages.highlights.retry);
    await waitForRows(5);

    // Repetir REFAZ o `GET /books/:bookId` — não é só apagar a mensagem —, e
    // a coleção vem atrás, porque ela depende do clube que o livro informa.
    expect(requestsTo(calls, '/books/')).toHaveLength(2);
    expect(requestsTo(calls, '/highlights?')).toHaveLength(1);
    expectNoGuilt();
  });

  it('offers to repeat a collection that failed, and the repeat REDOES it', async () => {
    let attempts = 0;
    const calls = await renderHighlights({
      list: () => {
        attempts += 1;
        return attempts === 1
          ? { status: 500, body: { error: 'Boom: disk is on fire' } }
          : { status: 200, body: collection() };
      },
    });

    await waitFor(() => {
      expect(
        screen.queryByText(pt.pages.highlights.unavailable),
      ).not.toBeNull();
    });
    expect(readableText()).not.toContain('Boom');
    expectNoGuilt();

    await pressLabel(pt.pages.highlights.retry);
    await waitForRows(5);

    // Repetir REFAZ a requisição — não é só apagar a mensagem.
    expect(requestsTo(calls, '/highlights?')).toHaveLength(2);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('keeps the words of the API off the screen when the network is gone', async () => {
    await renderHighlights({ list: { status: 0, offline: true } });

    await waitFor(() => {
      expect(
        screen.queryByText(pt.pages.highlights.unavailable),
      ).not.toBeNull();
    });
    expect(screenIsUp()).toBe(true);
    expect(readableText()).not.toContain('Failed to fetch');
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
    await renderHighlights({
      list: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { status: 200, body: collection() };
      },
    });

    expect(screenIsUp()).toBe(true);
    expect(screen.queryByText(pt.pages.highlights.loading)).not.toBeNull();
    expect(
      screen.queryByRole('list', { name: pt.pages.highlights.label }),
    ).toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();

    await act(async () => {
      release?.();
    });
    await waitForRows(5);
  });
});

describe('the source of the collection screen (rules 20, 21)', () => {
  it('imports no editor, so the FIRST LOAD stays without TipTap (rule 20)', () => {
    /*
      Esta tela não escreve: quem escreve é o formulário. O acusador de verdade
      é o `__tests__/bundle-guard.test.ts`, que COMPILA o app — este teste é o
      ponteiro que diz onde procurar quando aquele ficar vermelho.
    */
    const source = stripComments(highlightsSource());

    expect(source).not.toContain('@clube/ui/editor');
    expect(source).not.toContain('@tiptap');
  });

  it('⚠️ builds the filter with the SHARED FilterBar, and keeps NO chip composition of its own (rule 7 of task 27)', () => {
    /*
      ⚠️ **A ASSERÇÃO NEGATIVA É A QUE VALE**: uma tela que passasse a usar o
      `FilterBar` e deixasse a composição antiga ao lado teria duas verdades
      sobre o mesmo filtro, e a medição da regra 8 (mudar o componente acusa em
      duas suítes) voltaria a passar por acidente.

      O `role="group"` também sai daqui: a fronteira acessível do grupo é do
      componente agora (decisão C), e escrevê-la nas duas casas é o jeito
      silencioso de a segunda sair de sincronia.
    */
    const source = stripComments(highlightsSource());

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
      e ação destrutiva, NADA MAIS"). Escrever `not.toMatch(DANGER_STYLE)` aqui
      seria uma asserção que não descreve a verdade, e o conserto natural dela
      (apagar o teste) tiraria a rede inteira.

      Então a rede é a CONTAGEM, com o MESMO regex da guarda única
      (`anti-guilt-dom.ts`, §7.9: cor se varre por regex, nunca por strings
      literais de classe): um segundo vermelho — inclusive nas grafias
      `text-[#`, `bg-[#` e `--clube-danger`, que o regex cobre — acusa. A
      guarda de cada ESTADO renderizado continua sendo a `expectNoGuilt`, que
      roda em todos eles.
    */
    const red = stripComments(highlightsSource())
      .split('\n')
      .filter((line) => DANGER_STYLE.test(line));

    expect(red).toHaveLength(1);
    expect(red[0]).toContain('text-danger');
    // O lado positivo do par: o arquivo lido é o certo (um arquivo VAZIO
    // passaria calado — §7.4 escrito como varredura de fonte).
    expect(stripComments(highlightsSource())).toContain(
      'pages.highlights.empty.filtered',
    );
  });
});

describe('the catalog of the collection (rule 22)', () => {
  it('has the new keys in pt AND in en, actually translated', () => {
    /*
      A paridade recursiva de chaves é do catálogo
      (`shared/src/locales/__tests__/catalogs.test.ts`) e do compilador (o `en`
      é `typeof pt`). O que ESTE teste acrescenta é o par que nenhum dos dois
      pega: um bloco copiado do `pt` para o `en`, que passa na paridade e
      embarca português no idioma inglês.
    */
    expect(Object.keys(en.pages.highlights)).toEqual(
      Object.keys(pt.pages.highlights),
    );
    expect(en.pages.highlights.empty.description).not.toBe(
      pt.pages.highlights.empty.description,
    );
    expect(en.pages.highlights.empty.filtered).not.toBe(
      pt.pages.highlights.empty.filtered,
    );
    expect(en.pages.highlights.filters.all).not.toBe(
      pt.pages.highlights.filters.all,
    );
    expect(en.pages.highlights.item.archive).not.toBe(
      pt.pages.highlights.item.archive,
    );
    expect(en.pages.highlights.archive.description).not.toBe(
      pt.pages.highlights.archive.description,
    );
    // As cinco cores, traduzidas nos dois — e é o `en` que o teste de tela
    // nunca vê, porque toda suíte pina `pt`.
    expect(Object.keys(en.pages.highlights.colors)).toEqual(
      Object.keys(pt.pages.highlights.colors),
    );
    expect(en.pages.highlights.colors.yellow).not.toBe(
      pt.pages.highlights.colors.yellow,
    );
    expect(en.pages.highlights.colors.orange).not.toBe(
      pt.pages.highlights.colors.orange,
    );
  });
});
