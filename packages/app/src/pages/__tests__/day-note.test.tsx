import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  HighlightResponse,
  NoteDocBody,
  NoteResponse,
  PlanItemResponse,
} from '@clube/shared';
import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { pt } from '@clube/shared/locales';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import type { ClubSummary } from '../../club/active-club';
import { createPendingNoteStoreFake } from '../../offline/__tests__/pending-note-store-fake';
import {
  createUnavailablePendingNoteStore,
  type PendingNoteStore,
} from '../../offline/store';
import { dayNotePath } from '../day-note';
import { expectNoGuilt, stripComments } from './anti-guilt-dom';
import {
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
 * A ANOTAÇÃO DO DIA — as 23 regras da Tarefa 18.
 *
 * Entra pelo `<App />` inteiro (cabeçalho + rotas), como as telas 16 e 17: o
 * `/me` vive no `ActiveClubProvider` e o `RequireAuth` é quem deixa a tela
 * aparecer. Montar a página sozinha provaria uma tela que a produção não tem.
 *
 * ⚠️ **O EDITOR É UM DUBLÊ, E A PARTIÇÃO É DELIBERADA** (§7.9 do
 * `docs/CONVENCOES-CODIGO.md`). O que se prova aqui é o que **a tela** faz com
 * o `onChange`: quando ela agenda um `PUT`, quando ela não agenda, e o que ela
 * manda. O que o **editor de verdade** faz — em especial *não emitir `onChange`
 * por montar, por trocar `editable` ou por receber um `doc` por prop* — é
 * propriedade dele, e tem três acusadores próprios em
 * `packages/ui/src/components/__tests__/rich-editor.test.tsx` (*emits nothing
 * just for being mounted*, *…when the screen only flips editable*, *…when the
 * screen loads a doc by prop*). Carregar o ProseMirror de verdade em todo teste
 * de tela custaria segundos e provaria a mesma coisa duas vezes.
 *
 * E o dublê é **mais** exigente que o real num ponto: ele tem um botão que
 * emite o `onChange` ESPÚRIO (o `doc` que acabou de receber) e outro que emite
 * o documento VAZIO. São os dois caminhos da ⚠️ 2 e da ⚠️ 3 da spec, e a
 * defesa da tela contra eles é o que os testes da regra 7 medem.
 */

/**
 * ⚠️ **O PORTÃO DO CHUNK DO EDITOR** — é ele que torna a regra 6 observável.
 *
 * `vi.hoisted` porque o objeto precisa existir ANTES do `vi.mock`, que o
 * vitest iça para o topo do arquivo. Por padrão ele está aberto (o `import()`
 * resolve na hora); um teste pode fechá-lo com `hold()` para observar o
 * `fallback` do `Suspense`.
 */
const chunk = vi.hoisted(() => {
  let release: () => void = () => undefined;
  let gate: Promise<void> = Promise.resolve();

  return {
    hold(): void {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    arrive(): void {
      release();
    },
    wait: (): Promise<void> => gate,
  };
});

/**
 * O dublê do `@clube/ui/editor`.
 *
 * Ele é definido DENTRO da fábrica (e não em `vi.hoisted`) porque a fábrica só
 * roda quando o `import()` do `React.lazy` acontece — em tempo de render, com
 * o runtime de JSX já inicializado.
 */
vi.mock('@clube/ui/editor', async () => {
  await chunk.wait();

  const EMPTY: Record<string, unknown> = {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  };

  function docOf(text: string): Record<string, unknown> {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    };
  }

  /** O texto de um ProseMirror JSON, para a tela ser legível no teste. */
  function textOf(doc: unknown): string {
    return [...JSON.stringify(doc ?? null).matchAll(/"text":"([^"]*)"/gu)]
      .map((match) => match[1] ?? '')
      .join('');
  }

  /**
   * Cada toque no "digitar" produz um documento DIFERENTE do anterior — é o
   * que permite provar que o debounce reinicia sem colidir com a defesa de
   * "mudou de verdade?" da tela.
   */
  let keystrokes = 0;
  /**
   * ⚠️ O QUE A PESSOA ACABOU DE DIGITAR, exposto no DOM — é o que permite o
   * teste ponta a ponta *digito → recarrego → o texto está lá* comparar a tela
   * DEPOIS com o que foi digitado ANTES, em vez de com um rascunho semeado à
   * mão (ou, pior, com o que a store devolver — que seria a asserção que se
   * autoajusta do §7.8).
   */
  let typed = '';

  function FakeRichEditor({
    className,
    doc,
    editable = true,
    onChange,
    penBar = 'none',
    placeholder,
    slashHintLabel,
  }: {
    doc?: Record<string, unknown>;
    editable?: boolean;
    onChange: (doc: Record<string, unknown>) => void;
    penBar?: string;
    placeholder?: string;
    slashHintLabel?: string;
    className?: string;
    uploadingLabel?: string;
    uploadFailedLabel?: string;
  }) {
    /*
      ⚠️ **O DUBLÊ EXPÕE O QUE A TELA DECIDE, e a Tarefa 43 acrescentou três
      coisas a essa lista.** O `penBar` e o `slashHintLabel` são o contrato novo
      (decisões D e F), e o `className` é o que a decisão B MATOU — a caixa do
      editor. Sem o atributo, "a tela deixou de passar a moldura" não é
      observável em teste nenhum: o dublê renderiza igual com ela e sem ela.
    */
    return (
      <div
        data-class={className ?? ''}
        data-editable={String(editable)}
        data-pen-bar={penBar}
        data-slash-hint={slashHintLabel ?? ''}
        data-testid={editable ? 'editor' : 'reader'}
      >
        <p data-testid={editable ? 'editor-text' : 'reader-text'}>
          {textOf(doc)}
        </p>
        {editable ? (
          <>
            <p data-testid="typed">{typed}</p>
            <button
              data-testid="type"
              onClick={() => {
                keystrokes += 1;
                typed = 'a'.repeat(keystrokes);
                onChange(docOf(typed));
              }}
              type="button"
            >
              {placeholder}
            </button>
            {/*
              O `onChange` ESPÚRIO: o editor devolvendo o documento que acabou
              de receber. É o que o `setEditable`/`setContent` do TipTap fazia
              antes da Tarefa 14, e é a ⚠️ 2 da spec.
            */}
            <button
              data-testid="echo"
              onClick={() => onChange(doc ?? EMPTY)}
              type="button"
            >
              eco
            </button>
            {/* O documento VAZIO de quem abriu e não escreveu (⚠️ 3). */}
            <button
              data-testid="empty"
              onClick={() => onChange(EMPTY)}
              type="button"
            >
              vazio
            </button>
          </>
        ) : null}
      </div>
    );
  }

  return { RichEditor: FakeRichEditor };
});

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
const DAY_ID = 'p-hoje';
/**
 * ⚠️ **O CLUBE QUE NÃO É O ATIVO — o fixture hostil do corte de tenant.**
 *
 * O clube ativo do cabeçalho é o `CASAL` (`c-casal`). Um livro de OUTRO
 * clube é o caso que o `CLAUDE.md` nomeia ("o dono do livro é quem manda") e
 * o único em que "clube do livro" e "clube ativo" dão respostas diferentes —
 * sem ele, a asserção da URL é verdadeira para as duas origens.
 */
const OTHER_CLUB_ID = 'c-outro';
const OTHER_DAY_ID = 'p-ontem';
/** O tema que o admin cadastrou — é ele que vira o título da tela (regra 1). */
const THEME = 'Cap. 3 — A promessa';

/** O `id` que o `meReply()` do harness devolve. Sou eu. */
const MARCOS = 'u-marcos';
const MARIA = 'u-maria';

/** O `doc` como o `noteResponseSchema` o declara — `passthrough` (ADR 0001). */
function aDoc(text: string): NoteDocBody {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

/**
 * O GRIFO DAQUELA LEITURA (Tarefa 43, decisão I).
 *
 * ⚠️ `planItemId` é o campo que a Tarefa 38i acrescentou, e é ele que torna
 * *"Grifos desta leitura"* possível: sem ele a margem mostraria o acervo
 * inteiro do livro ao lado do trecho de hoje.
 */
function aHighlight(
  overrides: Partial<HighlightResponse> = {},
): HighlightResponse {
  return {
    id: 'h-maria',
    clubId: CLUB_ID,
    bookId: BOOK_ID,
    userId: MARIA,
    planItemId: DAY_ID,
    quote: 'encaixar-se é o oposto de pertencer',
    color: '#facc15',
    page: 167,
    reference: null,
    commentDoc: null,
    commentText: '',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: '2026-09-04T10:00:00.000Z',
    updatedAt: '2026-09-04T10:00:00.000Z',
    ...overrides,
  };
}

/** Fixture é factory (§7.7) — e o `doc` é uma árvore MUTÁVEL por dentro. */
function aNote(overrides: Partial<NoteResponse> = {}): NoteResponse {
  return {
    id: 'n-maria',
    clubId: CLUB_ID,
    bookId: BOOK_ID,
    userId: MARIA,
    kind: 'PLAN',
    planItemId: DAY_ID,
    title: THEME,
    reference: 'p. 45-62',
    doc: aDoc('o dragao me assustou'),
    plainText: 'o dragao me assustou',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: '2026-09-04T10:00:00.000Z',
    updatedAt: '2026-09-04T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * O plano do livro. O dia da URL é o SEGUNDO, de propósito (§7.2): uma tela que
 * pegasse `planItems[0]` em vez de procurar pelo id acusa.
 */
function plan(): PlanItemResponse[] {
  return [
    aPlanItem({
      id: OTHER_DAY_ID,
      order: 1,
      date: '2026-09-03',
      title: 'Cap. 2 — Carneiro assado',
      reference: 'p. 31-44',
    }),
    aPlanItem({
      id: DAY_ID,
      order: 2,
      date: '2026-09-04',
      title: THEME,
      reference: 'p. 45-62',
    }),
  ];
}

function bookReply(
  planItems: readonly PlanItemResponse[] = plan(),
  clubId: string = CLUB_ID,
): Reply {
  return {
    status: 200,
    body: {
      book: {
        id: BOOK_ID,
        clubId,
        title: 'O Hobbit',
        author: 'J. R. R. Tolkien',
        month: '2026-09',
        coverUrl: null,
        totalPages: 320,
        createdById: MARCOS,
        status: 'ACTIVE',
        archivedAt: null,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
      planItems,
      writers: [],
      readers: [],
      inventory: { notes: 0, highlights: 0 },
      lastHighlight: null,
    },
  };
}

interface DaySetup {
  path?: string;
  book?: Reply;
  notes?: Reply;
  /** A resposta do `PUT /plan-items/:planItemId/note`, ou uma por chamada. */
  put?: Reply | Responder;
  me?: Reply;
  /**
   * `GET /clubs/:clubId/members` (Tarefa 26a) — quem é o clube, pelo nome.
   *
   * ⚠️ **O PADRÃO É FALHAR (500), e é o fiel** (§7.1): até a Tarefa 42 esta
   * tela não pedia os membros, então o estado em que os 60 testes anteriores
   * foram escritos é "a tela não conhece as pessoas" — o genérico. Um padrão
   * que já viesse com nomes mudaria o assunto de todos eles de uma vez.
   */
  members?: Reply;
  /**
   * `GET /clubs/:clubId/highlights?bookId=…` (Tarefa 43, decisão I).
   *
   * ⚠️ **O PADRÃO É FALHAR (500), e é o fiel** (§7.1), pelo mesmo argumento
   * do `members`: até esta fatia a tela não pedia os grifos, então o estado em
   * que as dezenas de testes anteriores foram escritos é "a margem não tem
   * grifo nenhum". Um padrão que já viesse cheio mudaria o assunto de todos
   * eles de uma vez — e a falha degrada em silêncio, como a dos nomes.
   */
  highlights?: Reply;
  /** A store da fila offline (Tarefa 21). Sem ela, o app age como na 18. */
  store?: PendingNoteStore;
}

/**
 * O shell autenticado inteiro, endpoint por endpoint.
 *
 * ⚠️ A ORDEM importa: `/notes` vem antes de `/books/` porque a listagem mora em
 * `/clubs/:clubId/notes`, e `/plan-items/` vem antes de tudo o mais para o
 * `PUT` nunca cair noutro ramo.
 *
 * ⚠️ **E `/members` VEM ANTES DE `/me`, ou ele nunca é servido** — medido, e é
 * uma armadilha de substring de verdade: `replyByUrl` casa por `includes`, e
 * `'/clubs/c-casal/members'.includes('/me')` é **`true`** (o `/me` de
 * `/members`). Com a ordem invertida, o pedido de membros recebe o corpo do
 * `/me`, que não passa no `clubMembersResponseSchema` — ou seja, o teste do
 * caminho FELIZ estaria medindo o caminho da FALHA, e verde.
 */
function dayResponder(setup: DaySetup): Responder {
  return replyByUrl(
    [
      ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
      [
        '/members',
        setup.members ?? {
          status: 500,
          body: { error: 'Internal Server Error' },
        },
      ],
      ['/me', setup.me ?? meReply({ clubs: [CASAL] })],
      [
        '/plan-items/',
        setup.put ?? {
          status: 200,
          body: aNote({ id: 'n-marcos', userId: MARCOS }),
        },
      ],
      [
        '/highlights',
        setup.highlights ?? {
          status: 500,
          body: { error: 'Internal Server Error' },
        },
      ],
      ['/notes', setup.notes ?? { status: 200, body: [] }],
      ['/books/', setup.book ?? bookReply()],
    ],
    { status: 500, body: { error: 'Internal Server Error' } },
  );
}

/**
 * Descarrega as microtarefas pendentes.
 *
 * ⚠️ Existe porque esta suíte roda com **timers falsos** do começo ao fim (o
 * debounce se prova por CONTAGEM, nunca por cronômetro — §7.3), e com timers
 * falsos o `waitFor` do Testing Library não pode ser usado para esperar. A
 * carga da tela encadeia duas requisições e o `import()` do editor, então uma
 * volta só de `Promise.resolve()` não basta.
 */
async function settle(): Promise<void> {
  for (let step = 0; step < 10; step += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderDayNote(setup: DaySetup = {}): Promise<RecordedRequest[]> {
  const calls = stubFetch(dayResponder(setup));

  await act(async () => {
    renderPage(<App />, {
      path: setup.path ?? dayNotePath(BOOK_ID, DAY_ID),
      storage: memoryStorage({ ...SESSION }),
      ...(setup.store ? { store: setup.store } : {}),
    });
  });
  await settle();

  return calls;
}

/** A conexão voltou — o único gatilho de reenvio junto com a abertura do app. */
async function goOnline(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event('online'));
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

async function press(testId: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
  });
  await settle();
}

/** As escritas da anotação do dia — a observável de todo o bloco do autosave. */
function writes(calls: readonly RecordedRequest[]): RecordedRequest[] {
  return requestsTo(calls, '/plan-items/');
}

function editorText(): string {
  return screen.getByTestId('editor-text').textContent ?? '';
}

function saveStatusText(): string {
  return screen.getByTestId('save-status').textContent ?? '';
}

function screenIsUp(): boolean {
  return screen.queryByRole('heading', { level: 1 }) !== null;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/*
  ⚠️ **ESTE BLOCO É O PRIMEIRO DO ARQUIVO DE PROPÓSITO, E MOVÊ-LO O DEIXA
  VERMELHO — não verde por acidente.**

  O `React.lazy` do `day-note.tsx` MEMOIZA a promessa do módulo: o `import()`
  acontece uma vez por processo, e daí em diante o componente já está resolvido.
  Então o `fallback` do `Suspense` só é observável na PRIMEIRA montagem do
  arquivo. Se este teste rodar depois de outro, o portão abaixo não segura nada,
  o `fallback` nunca aparece e a asserção `not.toBeNull()` acusa.
*/
describe('⚠️ THE EDITOR ARRIVES IN A CHUNK OF ITS OWN (rule 6)', () => {
  it('shows a loading state while the editor chunk is in flight, and the editor after it lands', async () => {
    chunk.hold();
    const calls = await renderDayNote();

    // A TELA já carregou — o tema do dia está no `h1` —, e o editor ainda não.
    expect(
      screen.queryByRole('heading', { level: 1, name: THEME }),
    ).not.toBeNull();
    expect(screen.queryByText(pt.pages.dayNote.editorLoading)).not.toBeNull();
    expect(screen.queryByTestId('editor')).toBeNull();
    expectNoGuilt();

    await act(async () => {
      chunk.arrive();
    });
    await settle();

    expect(screen.queryByTestId('editor')).not.toBeNull();
    expect(screen.queryByText(pt.pages.dayNote.editorLoading)).toBeNull();
    // E a chegada do chunk não é motivo para gravar nada (regra 7).
    expect(writes(calls)).toHaveLength(0);
    expectNoGuilt();
  });
});

describe('the day note opens on the theme of the day (rules 1, 2, 3)', () => {
  it('titles the screen with the theme of the plan item of the URL (rule 1)', async () => {
    const calls = await renderDayNote();

    // ⚠️ O dia da URL é o SEGUNDO do plano: uma tela que pegasse `planItems[0]`
    // mostraria "Cap. 2 — Carneiro assado".
    expect(
      screen.queryByRole('heading', { level: 1, name: THEME }),
    ).not.toBeNull();
    expect(screen.queryByText('p. 45-62')).not.toBeNull();

    // DECISÕES A e B: o livro do caminho, e a listagem do clube DO LIVRO,
    // filtrada pelo dia. Duas requisições, nenhuma rota nova.
    expect(requestsTo(calls, '/books/').map((call) => call.url)).toEqual([
      `https://api.teste/books/${BOOK_ID}`,
    ]);
    expect(requestsTo(calls, '/notes').map((call) => call.url)).toEqual([
      `https://api.teste/clubs/${CLUB_ID}/notes?planItemId=${DAY_ID}`,
    ]);
    expectNoGuilt();
  });

  it('opens the editor with MY doc of that day when there already is one (rule 2)', async () => {
    await renderDayNote({
      notes: {
        status: 200,
        body: [
          aNote({
            id: 'n-marcos',
            userId: MARCOS,
            doc: aDoc('minha anotacao de ontem'),
            plainText: 'minha anotacao de ontem',
          }),
        ],
      },
    });

    expect(editorText()).toBe('minha anotacao de ontem');
    expectNoGuilt();
  });

  it('opens the editor EMPTY, and with no error, when I wrote nothing yet (rule 3)', async () => {
    const calls = await renderDayNote({ notes: { status: 200, body: [] } });

    expect(editorText()).toBe('');
    expect(screen.queryByTestId('editor')).not.toBeNull();
    // Sem erro: nenhuma das frases de falha desta tela está na tela.
    expect(readableText()).not.toContain(pt.pages.dayNote.bookUnavailable);
    expect(readableText()).not.toContain(pt.pages.dayNote.dayUnavailable);
    expect(writes(calls)).toHaveLength(0);
    expectNoGuilt();
  });
});

describe('the day note when the address points at nothing (rules 4, 5)', () => {
  it('has a state of its own when the planItemId is NOT in the plan of the book (rule 4)', async () => {
    const calls = await renderDayNote({
      path: dayNotePath(BOOK_ID, 'p-que-nao-existe'),
    });

    // Nem tela branca, nem "não foi possível abrir o livro" (que mandaria
    // olhar o lugar errado — a API respondeu 200).
    expect(screenIsUp()).toBe(true);
    expect(screen.queryByText(pt.pages.dayNote.dayUnavailable)).not.toBeNull();
    expect(readableText()).not.toContain(pt.pages.dayNote.bookUnavailable);
    // E não pede a listagem de anotação nenhuma: não há dia para filtrar.
    expect(requestsTo(calls, '/notes')).toHaveLength(0);
    expectNoGuilt();
  });

  it('has its own words for a 404 on the book, and offers no pointless retry (rule 5)', async () => {
    await renderDayNote({
      book: { status: 404, body: { error: 'Not Found' } },
    });

    expect(screenIsUp()).toBe(true);
    expect(screen.queryByText(pt.pages.dayNote.bookUnavailable)).not.toBeNull();
    // Retentar um 404 é pedir a mesma negativa outra vez.
    expect(
      screen.queryByRole('button', { name: pt.pages.dayNote.retry }),
    ).toBeNull();
    expectNoGuilt();
  });

  it('offers to repeat a network failure on the load, and the repeat REDOES the request', async () => {
    let attempts = 0;
    const calls = stubFetch(
      replyByUrl(
        [
          ['/auth/refresh', { status: 200, body: { token: 't' } }],
          /*
            ⚠️ **`/members` ANTES de `/me`, também aqui** — este responder é o
            SEGUNDO deste arquivo, e a auditoria da Tarefa 42 o pegou sem a
            linha. Benigno neste teste (ele não fala de nomes), mas a armadilha
            é de substring e é silenciosa: `replyByUrl` casa por `includes`, e
            `'/clubs/c-casal/members'.includes('/me')` é **`true`**. Uma nota de
            reconciliação que declara a classe fechada com metade dos
            responders arrumados é exatamente a "correção incompleta" que este
            bloco já pagou quatro vezes.
          */
          ['/members', { status: 200, body: [] }],
          ['/me', meReply({ clubs: [CASAL] })],
          ['/notes', { status: 200, body: [] }],
          [
            '/books/',
            () => {
              attempts += 1;
              return attempts === 1
                ? { status: 0, offline: true }
                : bookReply();
            },
          ],
        ],
        { status: 500, body: { error: 'Internal Server Error' } },
      ),
    );

    await act(async () => {
      renderPage(<App />, {
        path: dayNotePath(BOOK_ID, DAY_ID),
        storage: memoryStorage({ ...SESSION }),
      });
    });
    await settle();

    const retry = screen.getByRole('button', { name: pt.pages.dayNote.retry });
    expectNoGuilt();

    await act(async () => {
      fireEvent.click(retry);
    });
    await settle();

    // REFEZ a requisição — não apenas apagou a mensagem.
    expect(requestsTo(calls, '/books/')).toHaveLength(2);
    expect(
      screen.queryByRole('heading', { level: 1, name: THEME }),
    ).not.toBeNull();
    expectNoGuilt();
  });
});

/**
 * ⚠️ **O BLOCO QUE IMPEDE UM SALVAMENTO POR ANOTAÇÃO ABERTA.**
 *
 * A regra 7 é o coração desta fatia: a pessoa abre a nota para LER e o app
 * grava. Somada à ⚠️ 3 (o documento vazio é válido e o backend o aceita), o
 * sintoma seria pior — abrir e sair criaria uma nota vazia no acervo do clube.
 */
describe('⚠️ NO PUT WITHOUT A CHANGE MADE BY THE PERSON (rules 7, 10)', () => {
  it('opens the note, loads the doc from the server and sends NO write at all (rule 7)', async () => {
    const calls = await renderDayNote({
      notes: {
        status: 200,
        body: [aNote({ id: 'n-marcos', userId: MARCOS })],
      },
    });

    expect(screen.queryByTestId('editor')).not.toBeNull();
    // Mesmo depois de muito mais que o debounce inteiro.
    await advance(5000);

    expect(writes(calls)).toHaveLength(0);
    expect(saveStatusText()).toBe('');
    expectNoGuilt();
  });

  it('sends no write when the editor emits the very doc it just received (rule 7, ⚠️ 2)', async () => {
    /*
      ⚠️ O `onChange` ESPÚRIO. A Tarefa 14 achou DOIS caminhos que o produzem
      no TipTap (`setEditable` e `setContent` emitem `update` sem mudança de
      conteúdo) e os consertou no editor. Esta é a segunda guarda, na tela, e
      ela é a que sobrevive a um upgrade do TipTap: um documento igual ao
      último conhecido não agenda nada.
    */
    const calls = await renderDayNote({
      notes: {
        status: 200,
        body: [aNote({ id: 'n-marcos', userId: MARCOS })],
      },
    });

    await press('echo');
    await advance(5000);

    expect(writes(calls)).toHaveLength(0);
    expectNoGuilt();
  });

  it('sends no write when the editor emits the EMPTY doc of a day nobody wrote on (rule 7, ⚠️ 3)', async () => {
    /*
      O editor emite `{type:'doc',content:[{type:'paragraph'}]}` para vazio, e o
      backend ACEITA de propósito (recusar quebraria a primeira digitação). Sem
      esta defesa, abrir a anotação de um dia em branco criaria uma nota vazia.
    */
    const calls = await renderDayNote({ notes: { status: 200, body: [] } });

    await press('empty');
    await advance(5000);

    expect(writes(calls)).toHaveLength(0);
    expectNoGuilt();
  });

  it('sends { doc } and NOTHING else, to the plan item of the URL (rule 10)', async () => {
    const calls = await renderDayNote();

    await press('type');
    await advance(1500);

    expect(writes(calls)).toHaveLength(1);
    const write = requestAt(writes(calls), 0);
    expect(write.method).toBe('PUT');
    expect(write.url).toBe(`https://api.teste/plan-items/${DAY_ID}/note`);
    /*
      ⚠️ AS CHAVES EXATAS, e não um `toMatchObject`: `plainText` é derivado no
      backend (ADR 0001) e `userId`/`clubId` vêm do JWT e da rota. O
      `upsertPlanNoteSchema` é `.strict()`, então qualquer chave a mais é 400 —
      e um 400 no autosave é a tela dizendo "não salvei" para sempre.
    */
    expect(Object.keys(write.body ?? {})).toEqual(['doc']);
    expect(JSON.stringify(write.body)).not.toContain('plainText');
    expect(JSON.stringify(write.body)).not.toContain(MARCOS);
    expect(JSON.stringify(write.body)).not.toContain(CLUB_ID);
    expectNoGuilt();
  });
});

describe('the autosave waits 1500 ms of silence, and RESTARTS (rules 8, 9, 11)', () => {
  it('sends ONE write 1500 ms after the last keystroke, not one per key (rule 8)', async () => {
    const calls = await renderDayNote();

    await press('type');
    await advance(1499);
    // ⚠️ O lado NEGATIVO do par: sem ele, "salva sempre" passaria.
    expect(writes(calls)).toHaveLength(0);

    await advance(1);
    expect(writes(calls)).toHaveLength(1);
    expectNoGuilt();
  });

  it('RESTARTS the wait on every keystroke — debounce, not throttle (rule 9)', async () => {
    const calls = await renderDayNote();

    await press('type');
    await advance(1000);
    expect(writes(calls)).toHaveLength(0);

    // A segunda tecla, ainda dentro da espera. Um THROTTLE já teria gravado
    // aos 1500 ms contados da PRIMEIRA.
    await press('type');
    await advance(1000);
    expect(writes(calls)).toHaveLength(0);

    await advance(500);
    // E é UMA escrita, não duas: a primeira espera foi cancelada, não somada.
    expect(writes(calls)).toHaveLength(1);
    expectNoGuilt();
  });

  it('walks idle → saving → saved, and back to idle 2000 ms later (rule 11)', async () => {
    let release: (() => void) | undefined;
    const calls = await renderDayNote({
      put: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { status: 200, body: aNote({ id: 'n-marcos', userId: MARCOS }) };
      },
    });

    expect(saveStatusText()).toBe('');

    await press('type');
    await advance(1500);
    // `saving` enquanto a resposta não volta — a requisição já saiu.
    expect(writes(calls)).toHaveLength(1);
    expect(saveStatusText()).toBe(pt.pages.dayNote.save.saving);

    await act(async () => {
      release?.();
    });
    await settle();
    expect(saveStatusText()).toBe(pt.pages.dayNote.save.saved);

    await advance(1999);
    expect(saveStatusText()).toBe(pt.pages.dayNote.save.saved);

    await advance(1);
    /*
      `saved` continua sendo um RECADO e não um estado permanente — e é essa a
      propriedade, que não mudou: passados os 2000 ms ele dá lugar a outra
      coisa.

      ⚠️ **O QUE MUDOU NA TAREFA 43 É O QUE VEM DEPOIS DELE** (decisão H).
      Esta linha era `toBe('')`: a nota de margem voltava ao vazio. O canvas
      desenha "Salvo 21:04" ali enquanto a pessoa escreve (`Dia.dc.html:56`), e
      a chave `pages.dayNote.save.savedAt` existia desde a Tarefa 40 sem
      consumidor, com o catálogo dizendo por escrito que ela é *"o irmão do
      `saved`: o estado que FICA"*.

      ⚠️ **Os 2000 ms, o `SaveStatus` e o debounce NÃO mudaram** — o acusador
      disso é o bloco *task 43 changes how the save LOOKS, never how it works*.
      A asserção aqui continua medindo a TRANSIÇÃO, e por isso ela segue sendo
      "deixou de dizer `saved`".
    */
    expect(saveStatusText()).not.toBe(pt.pages.dayNote.save.saved);
    expect(saveStatusText()).toContain('Salvo ');
    expectNoGuilt();
  });
});

describe('the autosave that fails NEVER loses the text (rules 12, 13)', () => {
  it('says it could not save, keeps the text, and the repeat REDOES the write (rule 12)', async () => {
    /*
      ⚠️ **"O TEXTO CONTINUA NA TELA" TEM DUAS OBSERVÁVEIS, e a segunda é a que
      importa de verdade.**

      A primeira é que a tela **não devolve** um `doc` para o editor: o que a
      pessoa digitou vive dentro do ProseMirror, e a única forma de perdê-lo
      seria a tela empurrar outro conteúdo (ou remontar o editor) ao falhar. O
      dublê mostra o `doc` que RECEBEU por prop — se ele mudar, a tela mexeu.

      A segunda é o `PUT` do "salvar de novo": ele leva o MESMO documento que
      falhou. Uma tela que descartasse o rascunho no erro mandaria outra coisa
      (ou nada), e é essa a asserção que morde.
    */
    let attempts = 0;
    const calls = await renderDayNote({
      notes: {
        status: 200,
        body: [
          aNote({
            id: 'n-marcos',
            userId: MARCOS,
            doc: aDoc('minha frase de ontem'),
            plainText: 'minha frase de ontem',
          }),
        ],
      },
      put: () => {
        attempts += 1;
        return attempts === 1
          ? { status: 0, offline: true }
          : { status: 200, body: aNote({ id: 'n-marcos', userId: MARCOS }) };
      },
    });

    await press('type');
    await advance(1500);

    expect(writes(calls)).toHaveLength(1);
    expect(screen.queryByText(pt.pages.dayNote.save.failed)).not.toBeNull();
    // O editor continua montado, com o MESMO `doc` que a tela lhe deu: nada
    // foi reiniciado por causa da falha.
    expect(editorText()).toBe('minha frase de ontem');

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: pt.pages.dayNote.save.retry }),
      );
    });
    await settle();

    // REFEZ o `PUT` — não apagou a mensagem e fingiu.
    expect(writes(calls)).toHaveLength(2);
    // E com o MESMO documento: o que a pessoa escreveu não se perdeu.
    expect(requestAt(writes(calls), 1).body).toEqual(
      requestAt(writes(calls), 0).body,
    );
    expect(saveStatusText()).toBe(pt.pages.dayNote.save.saved);
    expect(screen.queryByText(pt.pages.dayNote.save.failed)).toBeNull();
    expectNoGuilt();
  });

  it('has its own words for a 404 on the write, with no pointless retry and no text lost (rule 13)', async () => {
    const calls = await renderDayNote({
      notes: {
        status: 200,
        body: [
          aNote({
            id: 'n-marcos',
            userId: MARCOS,
            doc: aDoc('minha frase de ontem'),
            plainText: 'minha frase de ontem',
          }),
        ],
      },
      put: { status: 404, body: { error: 'Not Found' } },
    });

    await press('type');
    await advance(1500);

    expect(writes(calls)).toHaveLength(1);
    expect(
      screen.queryByText(pt.pages.dayNote.save.unavailable),
    ).not.toBeNull();
    expect(readableText()).not.toContain(pt.pages.dayNote.save.failed);
    // Insistir não resolve: o membership sumiu, ou o dia deixou de existir.
    expect(
      screen.queryByRole('button', { name: pt.pages.dayNote.save.retry }),
    ).toBeNull();
    // E o texto continua lá: o editor não foi desmontado nem reiniciado.
    expect(editorText()).toBe('minha frase de ontem');
    expectNoGuilt();
  });

  it('has the same own words for a 403 on the write (rule 13)', async () => {
    await renderDayNote({
      notes: {
        status: 200,
        body: [
          aNote({
            id: 'n-marcos',
            userId: MARCOS,
            doc: aDoc('minha frase de ontem'),
            plainText: 'minha frase de ontem',
          }),
        ],
      },
      put: { status: 403, body: { error: 'Forbidden' } },
    });

    await press('type');
    await advance(1500);

    expect(
      screen.queryByText(pt.pages.dayNote.save.unavailable),
    ).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: pt.pages.dayNote.save.retry }),
    ).toBeNull();
    expect(editorText()).toBe('minha frase de ontem');
    expectNoGuilt();
  });
});

describe('leaving the screen with a pending save (rule 14)', () => {
  it('flushes what was typed EXACTLY once when the screen goes away', async () => {
    /*
      ⚠️ **SEM ISTO, O QUE A PESSOA DIGITOU NOS ÚLTIMOS 1500 ms IA PARA O
      LIXO.** O `clearTimeout` da limpeza do debounce cancela o timer no
      desmonte, e não há rascunho local até a Tarefa 21 — tocar "voltar" logo
      depois de escrever perderia a frase. O `dirtyRef` é o que garante o
      "exatamente uma vez".
    */
    const calls = await renderDayNote();

    await press('type');
    await advance(500);
    expect(writes(calls)).toHaveLength(0);

    await act(async () => {
      cleanup();
    });
    await settle();

    expect(writes(calls)).toHaveLength(1);
    expect(Object.keys(requestAt(writes(calls), 0).body ?? {})).toEqual([
      'doc',
    ]);
  });

  it('does NOT write twice when the debounce already fired before leaving', async () => {
    // O outro lado do par: já salvo é já salvo. Um flush incondicional no
    // desmonte gravaria a mesma anotação duas vezes por visita.
    const calls = await renderDayNote();

    await press('type');
    await advance(1500);
    expect(writes(calls)).toHaveLength(1);

    await act(async () => {
      cleanup();
    });
    await settle();

    expect(writes(calls)).toHaveLength(1);
  });

  it('writes nothing at all when the person only opened and left', async () => {
    // A regra 7 aplicada ao desmonte — que é por onde um flush ingênuo criaria
    // a nota vazia que a ⚠️ 3 descreve.
    const calls = await renderDayNote({ notes: { status: 200, body: [] } });

    await act(async () => {
      cleanup();
    });
    await settle();

    expect(writes(calls)).toHaveLength(0);
  });
});

describe('what the club wrote about the same day (rules 15, 16, 17, 18, 20)', () => {
  it('shows the note of the other person, in reading mode (rule 15)', async () => {
    await renderDayNote({
      notes: {
        status: 200,
        body: [aNote({ id: 'n-maria', userId: MARIA })],
      },
    });

    expect(screen.queryByText(pt.pages.dayNote.others.heading)).not.toBeNull();
    const readers = screen.getAllByTestId('reader');
    expect(readers).toHaveLength(1);
    expect(screen.getByTestId('reader-text').textContent).toBe(
      'o dragao me assustou',
    );
    expectNoGuilt();
  });

  it('does NOT show my own note among the others — it is the one in the editor (rules 16, 20)', async () => {
    /*
      ⚠️ **A DECISÃO C, E ELA DEPENDE DO `me` DO CONTEXTO** (⚠️ 4 da spec). A
      minha nota e a dela vêm da MESMA listagem; quem as separa é o `me.id`.
      Com o `me` descartado — que era o estado até a Tarefa 17 —, a comparação
      `note.userId === undefined` responde `false` para todo mundo e a MINHA
      anotação apareceria ali embaixo, em leitura, sem nada vermelho para
      denunciar.
    */
    await renderDayNote({
      notes: {
        status: 200,
        body: [
          aNote({
            id: 'n-marcos',
            userId: MARCOS,
            doc: aDoc('o que EU escrevi'),
            plainText: 'o que EU escrevi',
          }),
          aNote({ id: 'n-maria', userId: MARIA }),
        ],
      },
    });

    // A minha está no editor, e só lá.
    expect(editorText()).toBe('o que EU escrevi');
    expect(screen.getAllByTestId('reader')).toHaveLength(1);
    expect(screen.getByTestId('reader-text').textContent).toBe(
      'o dragao me assustou',
    );
    expect(
      screen.queryAllByText('o que EU escrevi', { exact: false }),
    ).toHaveLength(1);
    expectNoGuilt();
  });

  it('gives the note of the other person NO affordance to edit or archive (rule 17)', async () => {
    await renderDayNote({
      notes: {
        status: 200,
        body: [aNote({ id: 'n-maria', userId: MARIA })],
      },
    });

    const reader = screen.getByTestId('reader');
    // O editor daquela nota é somente leitura: sem barra, sem bubble menu (a
    // Tarefa 14 provou que `editable={false}` esconde as três superfícies).
    expect(reader.getAttribute('data-editable')).toBe('false');

    // E a TELA não põe controle nenhum ao redor dela: nem "editar", nem
    // "arquivar", nem nada clicável (ADR 0002: o grupo lê, não interfere).
    const card = reader.closest('article');
    expect(card).not.toBeNull();
    expect(card?.querySelectorAll('button')).toHaveLength(0);
    expect(card?.querySelectorAll('input, textarea')).toHaveLength(0);
    // A tela DIZ que é leitura, em vez de só não ter botão.
    expect(readableText()).toContain(pt.pages.dayNote.others.readOnly);
    expectNoGuilt();
  });

  it('says NOTHING at all on a day only I wrote on (rule 18)', async () => {
    /*
      ⚠️ A frase natural aqui é "ninguém mais escreveu ainda", e ela é o §1 do
      plano ao contrário: comentário sobre a ausência do outro. A seção
      simplesmente não existe.
    */
    await renderDayNote({
      notes: {
        status: 200,
        body: [aNote({ id: 'n-marcos', userId: MARCOS })],
      },
    });

    expect(screen.queryByText(pt.pages.dayNote.others.heading)).toBeNull();
    expect(screen.queryAllByTestId('reader')).toHaveLength(0);
    expect(readableText()).not.toContain('ningu');
    expectNoGuilt();
  });
});

/**
 * ⚠️⚠️ **O NOME DE QUEM ESCREVEU — a decisão E da Tarefa 42, e ela é a metade
 * do §A.5.9 do `docs/new-ui.md` que continuava de pé.**
 *
 * Esta tela dizia "Alguém do clube" desde a Tarefa 18, com um comentário no
 * catálogo afirmando que *"nenhuma rota lista os membros do clube"*.
 * **`GET /clubs/:clubId/members` existe desde a Tarefa 26a**, e **seis** telas
 * já o usam pelo mesmo `club-names.ts` (`acervo`, `activity-feed`, `book`,
 * `busca`, `reading-marks`, `streak-bar`). A mesma pessoa aparecia como
 * "Maria" no acervo e como "Alguém do clube" aqui.
 *
 * ⚠️ **E É COMPORTAMENTO, NÃO FIAÇÃO:** "a tela chama `nameOfWriter`" não é a
 * propriedade. As três que são:
 *
 * 1. com os membros carregados, a nota da outra pessoa mostra **o nome dela**;
 * 2. com o `GET /members` **falhando**, a tela mostra o genérico e **não
 *    quebra** — o nome é uma inicial de avatar, ninguém perde a anotação por
 *    causa dela;
 * 3. o `PersonAvatar` recebe **o mesmo nome** que o texto ao lado mostra. Até
 *    esta fatia ele recebia `name={null}` (`day-note.tsx:645`), e uma inicial
 *    que discorda do nome ao lado é pior que nenhuma inicial.
 *
 * Fixture hostil (§7.2): `Maria Rita` dá **"MR"**, e o `userId` (`u-maria`)
 * daria **"U"** — então "passou o id como nome" acusa. E o meu nome é
 * `Marcos` → "M", diferente dos dois, então "usou o meu nome para todo mundo"
 * também acusa.
 */
describe('⚠️ the name of whoever wrote it (decision E of Task 42)', () => {
  const MARIA_NAME = 'Maria Rita';

  /** O que `GET /clubs/:clubId/members` devolve (Tarefa 26a). */
  function membersReply(): Reply {
    return {
      status: 200,
      body: [
        {
          userId: MARIA,
          name: MARIA_NAME,
          role: 'MEMBER',
          status: 'ACTIVE',
        },
        {
          userId: MARCOS,
          name: 'Marcos',
          role: 'OWNER',
          status: 'ACTIVE',
        },
      ],
    };
  }

  /**
   * O avatar da nota alheia. Ele é `aria-hidden` (o nome está escrito ao
   * lado), então não há `role` para procurar — a marca é o par `--person-*`
   * do canvas, que só o `PersonAvatar` pinta.
   */
  function avatars(): HTMLElement[] {
    return Array.from(document.querySelectorAll('[class*="bg-person"]'));
  }

  it('shows the NAME of the other person when the club is known', async () => {
    await renderDayNote({
      members: membersReply(),
      notes: { status: 200, body: [aNote({ id: 'n-maria', userId: MARIA })] },
    });

    expect(readableText()).toContain(MARIA_NAME);
    // E o genérico saiu da tela: ele é o FALLBACK, não o texto de sempre.
    expect(readableText()).not.toContain(pt.pages.acervo.item.author.other);
    expectNoGuilt();
  });

  /**
   * ⚠️⚠️ **O FORMATO DA LINHA DE MONO DESTA TELA, GUARDADO NESTA SUÍTE — e
   * ele passou a viver na suíte da OUTRA tela na Tarefa 44b.**
   *
   * Medida da rodada de correção daquela fatia: trocar
   * `Página {{number}} · Nome` por `Nome · Página {{number}}` dava **1
   * acusador, e ele estava em `book.test.tsx`**. Nenhum aqui. O desenho é o
   * mesmo — o `MarginHighlight` foi extraído para um módulo neutro, de
   * propósito e com razão —, mas o efeito colateral é que o formato da linha
   * **da tela do dia** passou a ser guardado por um teste que roda na suíte da
   * tela do **livro**.
   *
   * ⚠️ **Não é regressão** (medido no commit `dcac49a`: antes da extração esta
   * suíte também não assertava o formato, só a presença do trecho). Mas é o
   * §7.9 outra vez: a guarda existe e mora onde é fácil de escrever, não onde
   * a propriedade é da tela. Quem apagasse o `it()` do livro apagaria em
   * silêncio a única prova do desenho desta margem aqui.
   *
   * O fixture é hostil de propósito: `Maria Rita` não é quem está lendo
   * (`Marcos`), e a página (167) não coincide com nenhum id — então "escreveu
   * 'Você'", "passou o `userId` como nome" e "trocou a ordem dos dois" ficam
   * todos vermelhos.
   */
  it('⚠️ writes the mono line as "Página N · Nome", in THIS order', async () => {
    await renderDayNote({
      members: membersReply(),
      highlights: { status: 200, body: [aHighlight({ id: 'h-maria' })] },
    });

    const section = screen
      .getByText(pt.pages.dayNote.highlights.heading)
      .closest('section');
    // A linha é a que fica ao LADO da bolinha da caneta — nunca o primeiro
    // `.font-mono` da seção, que é o `Eyebrow` do rótulo.
    const dot = section?.querySelector('span[aria-hidden="true"]');
    expect(dot?.nextElementSibling?.textContent).toBe(
      `Página 167 · ${MARIA_NAME}`,
    );

    expectNoGuilt();
  });

  it('⚠️ gives the avatar the SAME name the text shows', async () => {
    await renderDayNote({
      members: membersReply(),
      notes: { status: 200, body: [aNote({ id: 'n-maria', userId: MARIA })] },
    });

    const marks = avatars();
    expect(marks).toHaveLength(1);
    // "MR" de `Maria Rita` — nunca "U" de `u-maria`, nunca "M" de `Marcos`.
    expect(marks[0]?.textContent).toBe('MR');
  });

  it('falls back to the neutral label when the members call FAILS — and shows the note anyway', async () => {
    /*
      A metade que impede a de cima de virar "a tela sempre sabe o nome". O
      `GET /members` é o único pedido que falha; a anotação já está na tela, e
      ela **continua** na tela. Uma inicial de avatar não derruba uma tela de
      leitura.
    */
    await renderDayNote({
      members: { status: 500, body: { error: 'Internal Server Error' } },
      notes: { status: 200, body: [aNote({ id: 'n-maria', userId: MARIA })] },
    });

    expect(readableText()).toContain(pt.pages.acervo.item.author.other);
    expect(readableText()).not.toContain(MARIA_NAME);
    // A nota continua inteira — o texto dela é o conteúdo, o nome é a legenda.
    expect(screen.getByTestId('reader-text').textContent).toBe(
      'o dragao me assustou',
    );
    // E o avatar cai no glifo NEUTRO, nunca na primeira letra do UUID.
    expect(avatars()[0]?.textContent).toBe('');
    expectNoGuilt();
  });

  /**
   * ⚠️⚠️ **O CORTE DE TENANT — e a primeira versão deste `it()` NÃO O TESTAVA.**
   *
   * Ela usava o fixture comum, em que
   * `CASAL.id === CLUB_ID === book.clubId === 'c-casal'`: a asserção era
   * verdadeira para **as duas** origens possíveis do `clubId`. Medido na
   * auditoria: trocar `state.clubId` por `activeClub?.id` — pedir os membros do
   * clube **ATIVO** em vez do clube **DO LIVRO**, que é literalmente o defeito
   * que o docblock do efeito diz existir para impedir — passava por **886
   * testes**.
   *
   * É a regra mais fácil de esquecer do `CLAUDE.md`, escrita lá com essas
   * palavras. O fixture agora é **hostil** (§7.2): o livro é de `c-outro` e o
   * clube ativo do cabeçalho é `c-casal`, então as duas origens dão respostas
   * DIFERENTES e só uma passa.
   */
  it('⚠️ asks the club OF THE BOOK, not the ACTIVE one — and asks once', async () => {
    const calls = await renderDayNote({
      // O clube ativo continua sendo o `c-casal` do `meReply({ clubs: [CASAL] })`.
      book: bookReply(plan(), OTHER_CLUB_ID),
      members: membersReply(),
      notes: { status: 200, body: [aNote({ id: 'n-maria', userId: MARIA })] },
    });

    const asked = requestsTo(calls, '/members');
    expect(asked).toHaveLength(1);
    expect(requestAt(asked, 0).url).toBe(
      `https://api.teste/clubs/${OTHER_CLUB_ID}/members`,
    );
    // E a asserção que fecha a porta: o clube do CABEÇALHO não foi consultado.
    expect(requestAt(asked, 0).url).not.toContain(CLUB_ID);
  });

  it('asks the club of the book for the NOTES too — the same owner decides both', async () => {
    /*
      O par que impede o de cima de virar um caso especial dos membros: o
      `clubId` do livro já decidia de onde vêm as notas desde a Tarefa 18, e as
      duas leituras têm de concordar. Se um dia divergirem, a tela mostra as
      notas de um clube e os nomes de outro.
    */
    const calls = await renderDayNote({
      book: bookReply(plan(), OTHER_CLUB_ID),
      members: membersReply(),
    });

    expect(requestAt(requestsTo(calls, '/notes'), 0).url).toContain(
      `/clubs/${OTHER_CLUB_ID}/notes`,
    );
  });
});

describe('the day note never puts a word the API wrote on the screen (rule 22)', () => {
  it('keeps the API text out of text AND attributes, on the load and on the write', async () => {
    const calls = await renderDayNote({
      book: { status: 500, body: { error: 'Boom: connection refused' } },
    });

    expect(screenIsUp()).toBe(true);
    // `readableText()` vê texto E atributos que carregam texto — o
    // `aria-label` é justamente o que o leitor de tela fala.
    expect(readableText()).not.toContain('Boom');
    expect(readableText()).not.toContain('connection refused');
    expect(writes(calls)).toHaveLength(0);
    expectNoGuilt();
  });

  it('keeps the API text out of the FAILED WRITE too', async () => {
    await renderDayNote({
      put: { status: 500, body: { error: 'Boom: disk is on fire' } },
    });

    await press('type');
    await advance(1500);

    expect(screen.queryByText(pt.pages.dayNote.save.failed)).not.toBeNull();
    expect(readableText()).not.toContain('Boom');
    expect(readableText()).not.toContain('disk is on fire');
    expectNoGuilt();
  });
});

describe('the day note without a /me (rule 20)', () => {
  it('does not guess who I am when the /me failed — it says so and offers to repeat', async () => {
    /*
      ⚠️ A ARMADILHA NOMEADA DA ⚠️ 4: `me` é `null` fora do `ready`. Uma tela
      que tratasse isso como "não sou ninguém" partiria a listagem pelo lado
      errado — TODA nota viraria "de outra pessoa", em silêncio. Aqui a tela
      nem chega a pedir a listagem.
    */
    const calls = await renderDayNote({
      me: { status: 500, body: { error: 'Boom' } },
    });

    expect(screenIsUp()).toBe(true);
    expect(requestsTo(calls, '/books/')).toHaveLength(0);
    expect(requestsTo(calls, '/notes')).toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: pt.pages.dayNote.retry }),
    ).not.toBeNull();
    expect(readableText()).not.toContain('Boom');
    expectNoGuilt();
  });
});

/*
  ══════════════════════════════════════════════════════════════════════════
  OFFLINE NÍVEL 1 (Tarefa 21) — o texto não se perde, e sobe sozinho UMA vez.

  ⚠️ **A STORE ENTRA POR PARÂMETRO, E NÃO PASSAR NADA TAMBÉM É UM CENÁRIO.**
  Sem `store`, o provider cai no IndexedDB do navegador — que o jsdom não
  implementa —, e é exatamente a decisão F (modo privado, cota estourada). É
  por isso que os 27 testes da Tarefa 18 acima continuam valendo palavra por
  palavra: eles descrevem o app de quem não tem armazenamento local.
  ══════════════════════════════════════════════════════════════════════════
*/

/** O `doc` que o dublê do editor emite, para o rascunho semeado ser legível. */
function typedDoc(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

/** O `doc` que o `PUT` de índice `index` levou — o que a fila realmente mandou. */
function sentDoc(calls: readonly RecordedRequest[], index: number): unknown {
  const body = requestAt(writes(calls), index).body;
  return body === null || typeof body !== 'object'
    ? undefined
    : Object.getOwnPropertyDescriptor(body, 'doc')?.value;
}

describe('the draft that survives the reload (rules 1, 2, 3, 4)', () => {
  it('writes the doc into the local store on the first keystroke, BEFORE any request (rule 1)', async () => {
    /*
      ⚠️ **ANTES DE QUALQUER TENTATIVA DE REDE**, e é o que separa esta fatia da
      Tarefa 18: o `PUT` só sai 1500 ms depois da última tecla, e nesse
      intervalo cabem o app fechar, o service worker atualizar e o metrô entrar
      no túnel. O rascunho não espera o debounce.
    */
    const store = createPendingNoteStoreFake();
    const calls = await renderDayNote({ store });

    await press('type');

    expect(writes(calls)).toHaveLength(0);
    const draft = await store.byDay(MARCOS, DAY_ID);
    expect(draft?.doc).toBeDefined();
    // E ele ainda NÃO é uma escrita na fila: nada falhou (decisão A).
    expect(await store.queue(MARCOS)).toEqual([]);
    expectNoGuilt();
  });

  it('⚠️ opens with the DRAFT, not with the doc the server has (rule 2)', async () => {
    /*
      A decisão A em uma linha: **existir rascunho já significa "não enviado"**,
      então o rascunho GANHA — sem comparar carimbo local com `updatedAt` do
      servidor, que é onde entrariam relógio de celular errado e fuso.
    */
    const store = createPendingNoteStoreFake();
    await store.saveDraft({
      userId: MARCOS,
      planItemId: DAY_ID,
      doc: typedDoc('o que eu escrevi no metro'),
    });

    await renderDayNote({
      store,
      notes: {
        status: 200,
        body: [
          aNote({
            id: 'n-marcos',
            userId: MARCOS,
            doc: aDoc('a versao velha do servidor'),
            plainText: 'a versao velha do servidor',
          }),
        ],
      },
    });

    expect(editorText()).toBe('o que eu escrevi no metro');
    expectNoGuilt();
  });

  it('ERASES the draft when the server confirms the save (rule 3)', async () => {
    const store = createPendingNoteStoreFake();
    const calls = await renderDayNote({ store });

    await press('type');
    await advance(1500);

    expect(writes(calls)).toHaveLength(1);
    expect(saveStatusText()).toBe(pt.pages.dayNote.save.saved);
    // Decisão A: confirmado é confirmado — abrir de novo mostra o do servidor.
    expect(await store.byDay(MARCOS, DAY_ID)).toBeUndefined();
    expectNoGuilt();
  });

  it('does NOT show the draft of another DAY (rule 4)', async () => {
    const store = createPendingNoteStoreFake();
    await store.saveDraft({
      userId: MARCOS,
      planItemId: OTHER_DAY_ID,
      doc: typedDoc('o rascunho de ontem'),
    });

    await renderDayNote({ store });

    expect(editorText()).toBe('');
    expectNoGuilt();
  });

  it('does NOT show the draft of another PERSON (rule 4, decision E)', async () => {
    /*
      ⚠️ O aparelho é de casa. Um rascunho que vazasse entre contas viraria a
      anotação de uma pessoa gravada como nota da OUTRA — o autor vem do JWT, e
      o backend aceitaria sem uma linha vermelha em lugar nenhum.
    */
    const store = createPendingNoteStoreFake();
    await store.saveDraft({
      userId: MARIA,
      planItemId: DAY_ID,
      doc: typedDoc('o rascunho DELA'),
    });

    await renderDayNote({ store });

    expect(editorText()).toBe('');
    expect(readableText()).not.toContain('o rascunho DELA');
    expectNoGuilt();
  });
});

describe('⚠️ THE WRITE THAT DID NOT REACH THE SERVER (rules 5, 6, 7, 8, 15)', () => {
  it('queues the write and says so — WITHOUT the tone of an error (rules 5, 15)', async () => {
    const store = createPendingNoteStoreFake();
    const calls = await renderDayNote({
      store,
      put: { status: 0, offline: true },
    });

    await press('type');
    await advance(1500);

    expect(writes(calls)).toHaveLength(1);
    // `queued`, e NÃO `error`: a rede caiu, e o app não tem do que reclamar.
    expect(saveStatusText()).toBe(pt.pages.dayNote.save.queued);
    expect(readableText()).not.toContain(pt.pages.dayNote.save.failed);
    // E não há botão nenhum: insistir é o que a fila faz pela pessoa.
    expect(
      screen.queryByRole('button', { name: pt.pages.dayNote.save.retry }),
    ).toBeNull();
    // O texto continua na tela E está guardado.
    expect(await store.queue(MARCOS)).toHaveLength(1);
    expect(screen.queryByTestId('editor')).not.toBeNull();
    expectNoGuilt();
  });

  it('⚠️ DEDUPLICATES: ten minutes writing offline become ONE request (rule 6)', async () => {
    /*
      A decisão B, e é a razão de a fila ter chave: sem ela, escrever offline
      por dez minutos enfileira dezenas de versões do MESMO documento, e a volta
      da conexão vira uma saraivada de `PUT` — todos vencidos menos o último.
    */
    let online = false;
    const store = createPendingNoteStoreFake();
    const calls = await renderDayNote({
      store,
      put: () =>
        online
          ? { status: 200, body: aNote({ id: 'n-marcos', userId: MARCOS }) }
          : { status: 0, offline: true },
    });

    for (let round = 0; round < 4; round += 1) {
      await press('type');
      await advance(1500);
    }

    // Quatro tentativas de rede, UMA entrada na fila.
    expect(writes(calls)).toHaveLength(4);
    expect(await store.queue(MARCOS)).toHaveLength(1);

    online = true;
    await goOnline();

    // E a volta da conexão manda UMA requisição, com o texto MAIS NOVO.
    expect(writes(calls)).toHaveLength(5);
    expect(sentDoc(calls, 4)).toEqual(sentDoc(calls, 3));
    expect(await store.queue(MARCOS)).toEqual([]);
    expectNoGuilt();
  });

  it('does NOT queue what the server refused, and keeps the text (rule 7)', async () => {
    const store = createPendingNoteStoreFake();
    const calls = await renderDayNote({
      store,
      notes: {
        status: 200,
        body: [
          aNote({
            id: 'n-marcos',
            userId: MARCOS,
            doc: aDoc('minha frase de ontem'),
            plainText: 'minha frase de ontem',
          }),
        ],
      },
      put: { status: 404, body: { error: 'Not Found' } },
    });

    await press('type');
    await advance(1500);

    // Uma fila que reenvia o que já foi recusado tenta para sempre.
    expect(await store.queue(MARCOS)).toEqual([]);
    expect(
      screen.queryByText(pt.pages.dayNote.save.unavailable),
    ).not.toBeNull();
    expect(readableText()).not.toContain(pt.pages.dayNote.save.queued);
    // O texto é da pessoa: o rascunho CONTINUA guardado.
    expect((await store.byDay(MARCOS, DAY_ID))?.doc).toBeDefined();
    expect(editorText()).toBe('minha frase de ontem');
    // E a conexão "voltar" não manda nada: não há o que reenviar.
    await goOnline();
    expect(writes(calls)).toHaveLength(1);
    expectNoGuilt();
  });

  it('says it could not save, and offers to repeat, on a 400 (rule 7)', async () => {
    const store = createPendingNoteStoreFake();
    await renderDayNote({
      store,
      put: { status: 400, body: { error: 'Bad Request' } },
    });

    await press('type');
    await advance(1500);

    expect(screen.queryByText(pt.pages.dayNote.save.failed)).not.toBeNull();
    expect(readableText()).not.toContain(pt.pages.dayNote.save.queued);
    expect(await store.queue(MARCOS)).toEqual([]);
    expectNoGuilt();
  });

  it('⚠️ NEVER queues, and NEVER resends, an ApiError with a 2xx status (rule 8)', async () => {
    /*
      ⚠️ **A REGRA MAIS FÁCIL DE PERDER NUM `catch` GENÉRICO, E ELA ESTÁ AQUI
      COM TODAS AS LETRAS.** O servidor respondeu **200** e o corpo é que não
      casou o `noteResponseSchema` — ou seja, **a anotação FOI gravada**
      (`docs/CONVENCOES-CODIGO.md` §6.8). Pôr isso na fila faria o app gravar a
      mesma anotação outra vez quando a conexão "voltasse", e a pessoa veria a
      própria frase duplicada sem nunca ter mandado duas vezes.
    */
    const store = createPendingNoteStoreFake();
    const calls = await renderDayNote({
      store,
      put: { status: 200, raw: '<!doctype html>' },
    });

    await press('type');
    await advance(1500);

    expect(writes(calls)).toHaveLength(1);
    // A FILA CONTINUA VAZIA.
    expect(await store.queue(MARCOS)).toEqual([]);
    // A tela não mente para nenhum dos dois lados: nem "Salvo" (não
    // confirmamos), nem "não foi possível salvar" (foi gravado).
    expect(saveStatusText()).toBe(pt.pages.dayNote.save.unconfirmed);
    expect(readableText()).not.toContain(pt.pages.dayNote.save.failed);
    expect(readableText()).not.toContain(pt.pages.dayNote.save.queued);
    expect(
      screen.queryByRole('button', { name: pt.pages.dayNote.save.retry }),
    ).toBeNull();

    // E o `online` NÃO reenvia: nem agora, nem daqui a dez minutos.
    await goOnline();
    await advance(600_000);
    expect(writes(calls)).toHaveLength(1);
    expectNoGuilt();
  });
});

describe('⚠️ THE RESEND (rules 9, 10, 11, 12, 13, 14, 16)', () => {
  it('empties the queue when the connection comes back, and the open day says SAVED (rule 10)', async () => {
    let online = false;
    const store = createPendingNoteStoreFake();
    const calls = await renderDayNote({
      store,
      put: () =>
        online
          ? { status: 200, body: aNote({ id: 'n-marcos', userId: MARCOS }) }
          : { status: 0, offline: true },
    });

    await press('type');
    await advance(1500);
    expect(saveStatusText()).toBe(pt.pages.dayNote.save.queued);

    online = true;
    await goOnline();

    expect(writes(calls)).toHaveLength(2);
    expect(saveStatusText()).toBe(pt.pages.dayNote.save.saved);
    // A entrada E o rascunho somem juntos (regra 10).
    expect(await store.queue(MARCOS)).toEqual([]);
    expect(await store.byDay(MARCOS, DAY_ID)).toBeUndefined();
    expectNoGuilt();
  });

  it('KEEPS the entry when the resend fails by network — nothing lost, nothing doubled (rule 11)', async () => {
    const store = createPendingNoteStoreFake();
    const calls = await renderDayNote({
      store,
      put: { status: 0, offline: true },
    });

    await press('type');
    await advance(1500);

    // O `online` que MENTE (rede sem internet): a tentativa falha, e a entrada
    // continua onde estava — que é o comportamento correto (decisão C).
    await goOnline();

    expect(writes(calls)).toHaveLength(2);
    expect(await store.queue(MARCOS)).toHaveLength(1);
    expect(saveStatusText()).toBe(pt.pages.dayNote.save.queued);
    expectNoGuilt();
  });

  it('takes a permanently refused entry OUT of the queue, and keeps the draft (rule 12)', async () => {
    /*
      Senão a fila nunca esvazia: um 404 na anotação do dia é "o membership
      sumiu" ou "o admin apagou o dia", e repetir não conserta nenhum dos dois.
    */
    let refuse = false;
    const store = createPendingNoteStoreFake();
    const calls = await renderDayNote({
      store,
      put: () =>
        refuse
          ? { status: 404, body: { error: 'Not Found' } }
          : { status: 0, offline: true },
    });

    await press('type');
    await advance(1500);
    expect(await store.queue(MARCOS)).toHaveLength(1);

    refuse = true;
    await goOnline();

    expect(await store.queue(MARCOS)).toEqual([]);
    // O texto continua guardado: ele é da pessoa.
    expect((await store.byDay(MARCOS, DAY_ID))?.doc).toBeDefined();
    expect(
      screen.queryByText(pt.pages.dayNote.save.unavailable),
    ).not.toBeNull();

    // E o próximo `online` não tenta de novo — a fila esvaziou de verdade.
    await goOnline();
    expect(writes(calls)).toHaveLength(2);
    expectNoGuilt();
  });

  it('empties the queue ONCE when the app opens, in the order the entries went in (rules 9, 13)', async () => {
    const store = createPendingNoteStoreFake();
    await store.settle(
      {
        userId: MARCOS,
        planItemId: DAY_ID,
        doc: typedDoc('o primeiro que entrou'),
      },
      'enqueue',
    );
    await store.settle(
      {
        userId: MARCOS,
        planItemId: OTHER_DAY_ID,
        doc: typedDoc('o segundo'),
      },
      'enqueue',
    );
    // ⚠️ E a fila da OUTRA pessoa não é reenviada com o meu token (decisão E).
    await store.settle(
      {
        userId: MARIA,
        planItemId: DAY_ID,
        doc: typedDoc('o dela'),
      },
      'enqueue',
    );

    const calls = await renderDayNote({ store });

    expect(writes(calls)).toHaveLength(2);
    expect(writes(calls).map((call) => call.url)).toEqual([
      `https://api.teste/plan-items/${DAY_ID}/note`,
      `https://api.teste/plan-items/${OTHER_DAY_ID}/note`,
    ]);
    expect(await store.queue(MARIA)).toHaveLength(1);
    expectNoGuilt();
  });

  it('⚠️ has NO periodic resend: ten minutes of clock produce nothing (rule 14)', async () => {
    /*
      Decisão C, provada por CONTAGEM com timers falsos (§7.3): um timer que
      tenta a cada N segundos gasta bateria, e o navegador já avisa quando a
      conexão volta. Os únicos gatilhos são o `online` e a abertura do app.
    */
    const store = createPendingNoteStoreFake();
    const calls = await renderDayNote({
      store,
      put: { status: 0, offline: true },
    });

    await press('type');
    await advance(1500);
    expect(writes(calls)).toHaveLength(1);

    await advance(600_000);

    expect(writes(calls)).toHaveLength(1);
    expect(await store.queue(MARCOS)).toHaveLength(1);
    expectNoGuilt();
  });

  it('does not lose NOR double the queued write when the screen closes (rule 16)', async () => {
    const store = createPendingNoteStoreFake();
    const calls = await renderDayNote({
      store,
      put: { status: 0, offline: true },
    });

    await press('type');
    await advance(1500);
    expect(writes(calls)).toHaveLength(1);
    const queuedBefore = await store.queue(MARCOS);
    // A PRECONDIÇÃO PINADA (§7.4): com a fila vazia, o `toEqual` lá embaixo
    // compararia `[]` com `[]` e o teste passaria sem provar nada.
    expect(queuedBefore).toHaveLength(1);

    await act(async () => {
      cleanup();
    });
    await settle();

    // Sair não manda de novo o que já está na fila...
    expect(writes(calls)).toHaveLength(1);
    // ...e não perde: a entrada continua igualzinha.
    expect(await store.queue(MARCOS)).toEqual(queuedBefore);
  });
});

describe('the day note when there is no local storage at all (rule 17)', () => {
  it('behaves exactly like Task 18 — it says it failed and offers to repeat', async () => {
    /*
      DECISÃO F: modo privado, cota estourada e navegador antigo existem. Uma
      tela que morresse porque o armazenamento local falhou trocaria "não
      salvou" por "não abre".

      ⚠️ E a tela NÃO pode dizer `queued` aqui: prometer "vai sozinho quando a
      conexão voltar" sem fila nenhuma é mentira — e a pessoa perderia o texto
      confiando nela.
    */
    let attempts = 0;
    const calls = await renderDayNote({
      store: createUnavailablePendingNoteStore(),
      put: () => {
        attempts += 1;
        return attempts === 1
          ? { status: 0, offline: true }
          : { status: 200, body: aNote({ id: 'n-marcos', userId: MARCOS }) };
      },
    });

    await press('type');
    await advance(1500);

    expect(screenIsUp()).toBe(true);
    expect(screen.queryByText(pt.pages.dayNote.save.failed)).not.toBeNull();
    expect(readableText()).not.toContain(pt.pages.dayNote.save.queued);

    // E o "salvar de novo" da Tarefa 18 continua lá, e continua funcionando.
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: pt.pages.dayNote.save.retry }),
      );
    });
    await settle();

    expect(writes(calls)).toHaveLength(2);
    expect(saveStatusText()).toBe(pt.pages.dayNote.save.saved);
    expectNoGuilt();
  });

  it('opens with the doc of the server when the draft cannot be read', async () => {
    await renderDayNote({
      store: createUnavailablePendingNoteStore(),
      notes: {
        status: 200,
        body: [
          aNote({
            id: 'n-marcos',
            userId: MARCOS,
            doc: aDoc('o que o servidor tem'),
            plainText: 'o que o servidor tem',
          }),
        ],
      },
    });

    expect(screenIsUp()).toBe(true);
    expect(editorText()).toBe('o que o servidor tem');
    expectNoGuilt();
  });
});

describe('the offline states never put a word the API wrote on the screen (rule 18)', () => {
  it('keeps the API text out of text AND attributes in the unconfirmed state', async () => {
    const store = createPendingNoteStoreFake();
    await renderDayNote({
      store,
      put: { status: 200, raw: '{"error":"Boom: schema drifted"}' },
    });

    await press('type');
    await advance(1500);

    expect(saveStatusText()).toBe(pt.pages.dayNote.save.unconfirmed);
    expect(readableText()).not.toContain('Boom');
    expect(readableText()).not.toContain('schema drifted');
    expectNoGuilt();
  });
});

/*
  ══════════════════════════════════════════════════════════════════════════
  ⚠️ **O CIRCUITO COMPLETO — o vão que a auditoria da Tarefa 21 encontrou.**

  As regras 1 e 2 eram provadas separadamente, e a da 2 com o rascunho semeado
  à mão. Nenhum teste fazia o que a pessoa faz: **digitar, sair e voltar.** É
  esse vão que deixou passar um `forget` incondicional que apagava o texto novo
  gravado durante o `PUT`.
  ══════════════════════════════════════════════════════════════════════════
*/

/** O que a pessoa acabou de digitar, lido do dublê do editor. */
function typedText(): string {
  return screen.getByTestId('typed').textContent ?? '';
}

describe('⚠️ TYPE → RELOAD → THE TEXT IS THERE (rules 1, 2, end to end)', () => {
  it('brings back what was typed offline, with nothing seeded by hand', async () => {
    const store = createPendingNoteStoreFake();
    const offline: DaySetup = { store, put: { status: 0, offline: true } };

    await renderDayNote(offline);
    await press('type');
    const mine = typedText();
    // A PRECONDIÇÃO PINADA (§7.4): sem isto, um dublê que não digitasse nada
    // faria o teste comparar `''` com `''` e passar sem provar coisa alguma.
    expect(mine).not.toBe('');
    await advance(1500);

    // "Recarregar": a tela morre inteira e nasce de novo, com a MESMA store —
    // que é o que o IndexedDB faz por cima de um fechamento de aba.
    await act(async () => {
      cleanup();
    });
    await renderDayNote(offline);

    expect(editorText()).toBe(mine);
    expectNoGuilt();
  });

  it('⚠️ does NOT lose what was typed WHILE the PUT was in flight — and the reload proves it', async () => {
    /*
      ⚠️ **O BLOQUEADOR DA AUDITORIA, na tela.** A janela não é de microtarefa:
      ela tem a largura do `PUT` inteiro, que numa rede ruim são segundos — e
      nesses segundos a pessoa continua escrevendo. Um `forget` incondicional
      apagava o registro que já continha o texto NOVO, e a tela dizia "Salvo":
      perdido do servidor (nunca subiu) e do disco, em silêncio.
    */
    const store = createPendingNoteStoreFake();
    let release: (() => void) | undefined;

    const calls = await renderDayNote({
      store,
      put: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { status: 200, body: aNote({ id: 'n-marcos', userId: MARCOS }) };
      },
    });

    await press('type');
    await advance(1500);
    expect(writes(calls)).toHaveLength(1);
    expect(saveStatusText()).toBe(pt.pages.dayNote.save.saving);

    // ⚠️ AQUI: o `PUT` está NO AR, e a pessoa digita de novo.
    await press('type');
    const newer = typedText();
    expect(newer).not.toBe('');

    // Só agora o servidor confirma o documento ANTIGO.
    await act(async () => {
      release?.();
    });
    await settle();
    expect(saveStatusText()).toBe(pt.pages.dayNote.save.saved);

    // O texto novo continua guardado — e reabrir a tela o traz de volta.
    await act(async () => {
      cleanup();
    });
    await renderDayNote({ store, put: { status: 0, offline: true } });

    expect(editorText()).toBe(newer);
    expectNoGuilt();
  });
});

/**
 * ============================================================================
 * ⚠️⚠️ A REGRA DE OURO DA TAREFA 43, E ELA TEM ACUSADOR ESTRUTURAL
 * ============================================================================
 *
 * A Tarefa 43 muda **como o estado de salvamento aparece**, nunca como ele é
 * calculado (`docs/new-ui.md` §A.5 item 1: *"Autosave e fila offline não mudam
 * — só o indicador"*). O risco não é alguém decidir mudar o autosave: é ele
 * derivar **de carona** numa fatia que reescreve o indicador logo ao lado.
 *
 * ⚠️ **Os 23 acusadores de COMPORTAMENTO já existem** — medido antes de uma
 * linha desta fatia ser escrita: trocar `AUTOSAVE_DELAY_MS` por 3000 deixa
 * **23** `it()` vermelhos neste arquivo. Este bloco não os substitui; ele
 * acrescenta o que eles não dizem, e que é o que a fatia ameaça:
 *
 * - os dois NÚMEROS pinados por igualdade, num lugar em que a diferença se lê
 *   sem desenrolar um `advanceTimersByTime`;
 * - os SEIS estados de `SaveStatus`, que a nota de margem em mono passa a
 *   pintar — encolher a máquina para caber no visual novo (juntar `queued` com
 *   `saved`, por exemplo) é a forma mais provável de o dano entrar, e ela não
 *   deixa vermelho em teste de tempo nenhum;
 * - o FLUSH NO DESMONTE, que some sem barulho se alguém trocar o efeito de
 *   saída ao mexer na tela;
 * - e `packages/app/src/offline/` inteiro, que esta fatia **não pode tocar**.
 *
 * Ele lê o FONTE, e isso é deliberado: a propriedade aqui é "estes valores não
 * mudaram", não "a tela se comporta assim" — e essa segunda já está provada 23
 * vezes logo acima. É o mesmo molde do `grifo-text.test.tsx › writes the
 * pen→class map as LITERALS`.
 */
describe('⚠️ task 43 changes how the save LOOKS, never how it works', () => {
  /*
    ⚠️ SEM COMENTÁRIO: a prosa desta tela CITA `indexedDB` e `navigator.onLine`
    nominalmente, para dizer que eles não entram (o docblock do topo). Sem o
    strip, o comentário que documenta a regra a deixaria vermelha — a mesma
    isenção do `ui-source-scan.test.ts` e do `editor-touch-handlers.test.ts`.
  */
  const source = stripComments(
    readFileSync(
      resolve(process.cwd(), 'src', 'pages', 'day-note.tsx'),
      'utf8',
    ),
  );

  it('⚠️ keeps the two autosave numbers EXACTLY as task 18 left them', () => {
    expect(source).toContain('const AUTOSAVE_DELAY_MS = 1500;');
    expect(source).toContain('const SAVED_RESET_MS = 2000;');
  });

  it('⚠️ keeps ALL SIX states of the SaveStatus machine', () => {
    /*
      A união inteira, membro a membro: a nota de margem mostra um texto por
      estado, e o atalho tentador ao reescrevê-la é fundir os que "parecem
      iguais na tela". `queued` e `unconfirmed` NÃO são o mesmo recado — o
      docblock da tela explica a diferença, e ela é a Tarefa 21 inteira.
    */
    for (const state of [
      "'idle'",
      "'saving'",
      "'saved'",
      "'queued'",
      "'unconfirmed'",
      "'error'",
    ]) {
      expect(source).toContain(state);
    }

    // E a tradução do resultado da fila continua com UM dono só (regra 15).
    expect(source).toContain('function saveStateOf(result: WriteResult)');
  });

  it('⚠️ keeps the flush on unmount — the last 1500 ms of typing', () => {
    // O `clearTimeout` do debounce cancela o timer ao sair; sem esta linha o
    // que a pessoa digitou nos últimos 1500 ms vai para o lixo ao tocar
    // "voltar" (regra 14 da Tarefa 18).
    expect(source).toContain('mounted.current = false;');
    expect(source).toContain('void flushRef.current();');
  });

  it('⚠️ leaves the offline queue untouched — it is read, never reimplemented', () => {
    /*
      A fatia offline entra por UMA porta (`useOfflineNotes`), e o que a tela
      não pode ter é conhecimento de IndexedDB nem decisão própria sobre o que
      é falha de rede — as duas moram em `offline/`. Uma tela que reimplemente
      metade disso para pintar o indicador novo passaria em todo teste de
      tempo.
    */
    expect(source).toContain('useOfflineNotes()');
    expect(source).not.toContain('indexedDB');
    expect(source).not.toContain('navigator.onLine');
  });
});

/**
 * ============================================================================
 * A TELA QUE JUSTIFICA O PROJETO — o que a Tarefa 43 mudou nela
 * ============================================================================
 *
 * Tudo aqui é sobre **como as coisas aparecem**. Nada neste bloco toca o
 * autosave nem a fila: o acusador disso é o bloco
 * *task 43 changes how the save LOOKS, never how it works*, no fim do arquivo.
 */
describe('⚠️ the editor loses the box and gains the pen bar (decisions B and D)', () => {
  it('stops passing the frame the canvas does not draw', async () => {
    /*
      ⚠️ **A DECISÃO B, e ela é da TELA — não do editor.** Até aqui esta tela
      passava `rounded-control border border-line bg-surface` por `className`, e
      o editor virava um cartão dentro da página. O canvas põe o texto direto no
      papel (`Dia.dc.html:59`: nenhum `background`, nenhuma `border`, nenhum
      `border-radius` no bloco do corpo).

      ⚠️ E a asserção é sobre o que a tela PASSA, porque é isso que ela decide.
      Que o `.ProseMirror` também não desenhe caixa nenhuma é do editor, e tem
      acusador próprio (`editor-css.test.tsx › paints NO box`).
    */
    await renderDayNote();

    expect(screen.getByTestId('editor').getAttribute('data-class')).toBe('');
    expectNoGuilt();
  });

  it('asks for the FIXED pen bar, and hands over the hint of the /', async () => {
    /*
      A decisão D: `penBar='fixed'` é a forma do canvas do dia — ancorada acima
      do teclado no celular (`Dia.dc.html:103`, 62px) e devolvida ao rodapé da
      coluna acima de 1120px (`DiaDesktop.dc.html:72`, 56px). **UMA prop, não
      duas telas.**

      E a dica do `/` (`DiaDesktop.dc.html:92`) entra por prop, já traduzida:
      `packages/ui` não chama `t()` (`no-i18n.test.ts`), então toda folha de
      `editor.*` é lida pela TELA. É o terceiro consumidor daquele namespace, e
      `editor.slashHint` nasceu na Tarefa 40 sem nenhum.
    */
    await renderDayNote();

    const editor = screen.getByTestId('editor');
    expect(editor.getAttribute('data-pen-bar')).toBe('fixed');
    expect(editor.getAttribute('data-slash-hint')).toBe(pt.editor.slashHint);
    expectNoGuilt();
  });

  it('gives the note of the other person NO pen bar — it is not being written', async () => {
    // A forma `'none'` é o padrão, e é a certa aqui: uma barra de canetas numa
    // anotação que não se pode editar é uma faixa de 62px que não faz nada.
    await renderDayNote({
      notes: { status: 200, body: [aNote({ id: 'n-maria', userId: MARIA })] },
    });

    expect(screen.getByTestId('reader').getAttribute('data-pen-bar')).toBe(
      'none',
    );
    expectNoGuilt();
  });
});

describe('⚠️ the save notice is a margin note in mono (decisions G and H)', () => {
  it('writes the state with the SaveIndicator of task 41b — not a second one', async () => {
    /*
      `Dia.dc.html:56`: mono 9,5px, `uppercase`, `letter-spacing:.1em`,
      `--text-subtle`. O componente que já entrega exatamente isso nasceu na
      Tarefa 41b e **nunca teve consumidor** — escrever um segundo aqui seria o
      defeito que este repositório já pagou três vezes.
    */
    const calls = await renderDayNote();

    await press('type');
    await advance(1500);
    expect(writes(calls)).toHaveLength(1);

    /*
      ⚠️ O `PUT` padrão do responder resolve na mesma volta, então o estado
      observável depois do debounce é `saved` e não `saving` — medido. Quem
      prova a passagem por `saving` é o `it()` da regra 11, que segura a
      resposta de propósito. O que se mede aqui é a ROUPA da nota de margem, e
      ela é a mesma nos cinco estados que a usam.
    */
    const notice = document.querySelector('[data-testid="save-status"] span');
    expect(notice?.textContent).toBe(pt.pages.dayNote.save.saved);
    expect(notice?.className).toContain('font-mono');
    expect(notice?.className).toContain('text-micro');
    expect(notice?.className).toContain('uppercase');
    expect(notice?.className).toContain('text-subtle');
    expectNoGuilt();
  });

  it('⚠️ says WHEN it was saved once the "Salvo" moment passes (decision H)', async () => {
    /*
      ⚠️ **`pages.dayNote.save.savedAt` GANHA CONSUMIDOR AQUI.** Ela nasceu na
      Tarefa 40 e nunca teve um. O catálogo já dizia o que ela é: *"o irmão do
      `saved`: o estado que FICA"* — `saved` é o instante em que a gravação
      voltou e some em 2000 ms; este é o que a nota de margem mostra depois,
      enquanto a pessoa continua escrevendo.

      ⚠️ **E OS 2000 ms CONTINUAM SENDO OS 2000 ms.** O que muda é o que
      aparece DEPOIS deles: era o vazio, passa a ser a hora. A máquina de
      estados não ganhou membro nenhum — o acusador disso é o bloco do fim do
      arquivo.

      A hora sai do relógio local, pelo mesmo `Intl.DateTimeFormat` que o
      `book.tsx` e a `home.tsx` já usam. **Nenhuma chave nova.**
    */
    vi.setSystemTime(new Date('2026-09-18T21:04:00'));
    const calls = await renderDayNote();

    await press('type');
    await advance(1500);
    expect(writes(calls)).toHaveLength(1);
    expect(saveStatusText()).toBe(pt.pages.dayNote.save.saved);

    await advance(2000);

    // O vazio de antes:
    expect(saveStatusText()).not.toBe('');
    expect(saveStatusText()).toBe(
      pt.pages.dayNote.save.savedAt.replace('{{time}}', '21:04'),
    );
    expectNoGuilt();
  });

  it('says nothing at all before the first save of the session', async () => {
    // Ausente ≠ vazio: abrir a anotação e não escrever não pode inventar uma
    // hora. O `savedAt` fala do que ESTA sessão gravou.
    await renderDayNote();

    expect(saveStatusText()).toBe('');
    expectNoGuilt();
  });
});

describe('⚠️ the desktop margin gets its content (decision I)', () => {
  it('moves what the club wrote into the rail, and the highlights with it', async () => {
    /*
      `DiaDesktop.dc.html:96-135`: a margem de 320px com `border-left` e
      `padding-left:40px` tem **duas** seções — *O que o clube escreveu*
      (`:99`) e *Grifos desta leitura* (`:113`).

      ⚠️ **É A PRIMEIRA TELA A PASSAR `rail` AO `Screen`.** A capacidade
      nasceu na Tarefa 42 (decisão C) sem nenhum consumidor, e com o caso vazio
      já testado — que é o que impedia um `<aside>` de 320px em branco em todas
      as telas.

      ⚠️ **E NENHUMA CHAVE NOVA:** `pages.dayNote.others.heading` existe desde
      a Tarefa 18 e `pages.dayNote.highlights.heading` desde a 40, esta também
      sem consumidor até aqui.
    */
    await renderDayNote({
      notes: { status: 200, body: [aNote({ id: 'n-maria', userId: MARIA })] },
      highlights: {
        status: 200,
        body: [
          aHighlight({
            id: 'h-1',
            userId: MARIA,
            planItemId: DAY_ID,
            quote: 'encaixar-se é o oposto de pertencer',
            page: 167,
          }),
        ],
      },
    });

    const rail = document.querySelector('aside');
    expect(rail).not.toBeNull();
    expect(rail?.textContent).toContain(pt.pages.dayNote.others.heading);
    expect(rail?.textContent).toContain(pt.pages.dayNote.highlights.heading);
    expect(rail?.textContent).toContain('encaixar-se é o oposto de pertencer');
    expectNoGuilt();
  });

  it('⚠️ shows ONLY the highlights of THIS reading, never the whole book', async () => {
    /*
      ⚠️ O grifo carrega o dia do plano desde a Tarefa 38i, e é isso que torna
      a seção possível. Sem o corte, a margem mostraria o acervo inteiro do
      livro ao lado do trecho de hoje — e nada acusaria, porque a seção
      apareceria cheia.

      ⚠️ **O `planItemId: null` é o caso do ADR 0004** (grifo guardado num dia
      sem plano) e ele também fica de fora: `null` não é "todos".
    */
    await renderDayNote({
      highlights: {
        status: 200,
        body: [
          aHighlight({
            id: 'h-hoje',
            userId: MARIA,
            planItemId: DAY_ID,
            quote: 'o trecho de hoje',
            page: 167,
          }),
          aHighlight({
            id: 'h-outro-dia',
            userId: MARIA,
            planItemId: 'plan-outro',
            quote: 'o trecho de outro dia',
            page: 12,
          }),
          aHighlight({
            id: 'h-sem-dia',
            userId: MARIA,
            planItemId: null,
            quote: 'o trecho sem dia',
            page: 3,
          }),
        ],
      },
    });

    const rail = document.querySelector('aside');
    expect(rail?.textContent).toContain('o trecho de hoje');
    expect(rail?.textContent).not.toContain('o trecho de outro dia');
    expect(rail?.textContent).not.toContain('o trecho sem dia');
    expectNoGuilt();
  });

  it('⚠️ asks the club OF THE BOOK for the highlights, not the ACTIVE one', async () => {
    /*
      ⚠️ **O CORTE DE TENANT, e é a regra que o `CLAUDE.md` chama de "a mais
      fácil de esquecer".** O fixture é HOSTIL de propósito (§7.2): o livro é de
      `c-outro` e o clube ativo do cabeçalho é `c-casal`. Com os dois iguais —
      que era o fixture comum até a auditoria da Tarefa 42 — a asserção seria
      verdadeira para as DUAS origens, e pedir os grifos do clube ATIVO passaria
      verde.
    */
    const calls = await renderDayNote({
      book: bookReply(plan(), 'c-outro'),
      highlights: { status: 200, body: [] },
    });

    const asked = requestsTo(calls, '/highlights');
    expect(asked).toHaveLength(1);
    expect(asked[0]?.url).toContain('/clubs/c-outro/highlights');
    expect(asked[0]?.url).not.toContain('c-casal');
    // E o livro entra na consulta: a margem é dos grifos DESTE livro.
    expect(asked[0]?.url).toContain(`bookId=${BOOK_ID}`);
    expectNoGuilt();
  });

  it('draws NO rail at all when there is nothing to put in it', async () => {
    /*
      Ausente ≠ vazio, e aqui isso é a decisão C da Tarefa 42 sendo cobrada por
      quem a consome: um `<aside>` que nascesse sempre desenharia 320px em
      branco e um filete vertical solto ao lado do texto, **com o teste de
      render verde**.
    */
    await renderDayNote();

    expect(document.querySelector('aside')).toBeNull();
    expectNoGuilt();
  });
});

/**
 * ============================================================================
 * ⚠️ OS RÓTULOS DE SEÇÃO (auditoria da Tarefa 43, A6)
 * ============================================================================
 *
 * Os TRÊS rótulos desta tela são o mesmo elemento no canvas, valor a valor:
 * `Dia.dc.html:55` ("Sua anotação"), `DiaDesktop.dc.html:99` ("O que o clube
 * escreveu") e `:113` ("Grifos desta leitura") — `'Geist Mono'`, **10px**,
 * `letter-spacing:0.12em`, `uppercase`, `--text-muted`.
 *
 * ⚠️ **A PRIMEIRA ENTREGA DESTA FATIA ESCREVEU `text-sm font-semibold` NOS
 * TRÊS**, e `text-sm` é o **default do Tailwind** — não é um dos sete degraus
 * da escala fechada da Tarefa 39. E existe um componente feito exatamente para
 * isto: o `Eyebrow` da 41b, que nasceu com **zero** consumidores em
 * `packages/app`. "Grifos desta leitura" é elemento **novo** desta fatia, então
 * ali não havia nem herança para alegar.
 *
 * ⚠️ **CORRIGIDOS OS TRÊS, e não só os dois que a auditoria nomeou.** Deixar
 * "Sua anotação" em `text-sm` daria à MESMA tela duas tipografias de rótulo de
 * seção — que é a "correção incompleta" que a auditoria da 41b nomeou como
 * classe de erro, e o mesmo defeito que a da 42 achou nos `h1` de
 * `accept-invite` e `not-found`.
 *
 * ⚠️ **E o `<h2>` FICA.** O `Eyebrow` é um `<span>` de propósito — o docblock
 * dele diz, com todas as letras, que ele é *"a tipografia do rótulo, não a
 * semântica dele"*, e que *"quando uma tela precisar de um título de verdade,
 * ela escreve um `<h2>` de verdade"*. Aqui as três seções SÃO seções, e quem
 * navega por títulos precisa delas na árvore. Então o `<h2>` embrulha o
 * `Eyebrow`: semântica da tela, tipografia do design system.
 */
describe('⚠️ the section labels use the Eyebrow of task 41b (audit A6)', () => {
  it('gives the THREE labels the mono type of the canvas, still as headings', async () => {
    await renderDayNote({
      notes: { status: 200, body: [aNote({ id: 'n-maria', userId: MARIA })] },
      highlights: { status: 200, body: [aHighlight({ id: 'h-1' })] },
    });

    const labels = [
      pt.pages.dayNote.mine.heading,
      pt.pages.dayNote.others.heading,
      pt.pages.dayNote.highlights.heading,
    ];

    for (const label of labels) {
      const eyebrow = screen.getByText(label);
      // A tipografia do canvas, pelo componente — nunca reescrita à mão.
      expect(eyebrow.className).toContain('font-mono');
      expect(eyebrow.className).toContain('text-eyebrow');
      expect(eyebrow.className).toContain('uppercase');
      expect(eyebrow.className).toContain('tracking-[0.12em]');
      // E `text-sm`, que era o default do Tailwind, saiu de vez.
      expect(eyebrow.className).not.toContain('text-sm');
      // A semântica continua sendo da TELA: o rótulo vive dentro de um h2.
      expect(eyebrow.closest('h2')).not.toBeNull();
    }

    expectNoGuilt();
  });

  it('⚠️ never hides "Grifos desta leitura" on the phone — the declared divergence, guarded', async () => {
    /*
      ⚠️ **DIVERGÊNCIA DECLARADA SEM GUARDA É A PRÓXIMA FATIA A DESFAZÊ-LA SEM
      QUERER**, e esta é a terceira vez que este repositório paga por isso: o
      nome do clube no cabeçalho (auditoria da Tarefa 42) e a compensação de
      48px da home (a mesma) são as outras duas.

      O artboard de celular NÃO desenha esta seção — só o de desktop a tem. Ela
      foi entregue nas duas larguras de propósito: escondê-la com
      `hidden min-[1120px]:block` seria **invisível para o teste**, porque o
      jsdom não aplica CSS e todo `it()` acima continuaria verde com a seção
      apagada na tela.

      Por isso a asserção é sobre a CLASSE, que é a propriedade decidível aqui —
      exatamente o molde de
      `app.test.tsx › ⚠️ keeps the club name VISIBLE on the phone`.
    */
    await renderDayNote({
      highlights: { status: 200, body: [aHighlight({ id: 'h-1' })] },
    });

    const section = screen
      .getByText(pt.pages.dayNote.highlights.heading)
      .closest('section');
    expect(section).not.toBeNull();
    expect(section?.className ?? '').not.toContain('hidden');
    // E a margem inteira também não some no celular.
    expect(document.querySelector('aside')?.className ?? '').not.toContain(
      'hidden',
    );

    expectNoGuilt();
  });
});
