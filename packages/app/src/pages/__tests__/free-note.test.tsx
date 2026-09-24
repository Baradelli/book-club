import type { NoteDocBody, NoteResponse } from '@clube/shared';
import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { pt } from '@clube/shared/locales';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import type { ClubSummary } from '../../club/active-club';
import { ACERVO_PAPER_CLASS } from '../acervo-rows';
import { freeNoteNewPath, freeNotePath } from '../free-note';
import { expectNoPrivacyTalk } from './adr-0002-dom';
import { expectNoGuilt, expectNoGuiltBesidesFormError } from './anti-guilt-dom';
import {
  aPlanItem,
  hidingOf,
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
  tokensOf,
} from './harness';

/**
 * A ANOTAÇÃO AVULSA — as regras 9 a 23 da Tarefa 19.
 *
 * Entra pelo `<App />` inteiro, como as telas 16 a 18: metade do que a fatia
 * entrega é composição (as duas rotas novas, o `RequireAuth` que as protege, e
 * o `me` do contexto que decide correção × leitura).
 *
 * ⚠️ **O EDITOR É UM DUBLÊ, E A PARTIÇÃO É A DA TAREFA 18** (§7.9). O que se
 * prova aqui é o que **a tela** faz com o `onChange`: quando ela agenda um
 * `PATCH`, quando ela não agenda, e o que ela manda. O que o **editor de
 * verdade** faz — em especial não emitir `onChange` por montar ou por receber
 * um `doc` por prop — é propriedade dele, com três acusadores em
 * `packages/ui/src/components/__tests__/rich-editor.test.tsx`.
 *
 * E o dublê é MAIS exigente que o real: ele tem um botão que emite o `onChange`
 * espúrio (o `doc` que acabou de receber), que é o caminho da regra 13.
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

  function textOf(doc: unknown): string {
    return [...JSON.stringify(doc ?? null).matchAll(/"text":"([^"]*)"/gu)]
      .map((match) => match[1] ?? '')
      .join('');
  }

  /** Cada toque produz um documento DIFERENTE do anterior — é o que permite
      provar que o debounce reinicia. */
  let keystrokes = 0;

  function FakeRichEditor({
    doc,
    editable = true,
    onChange,
    penBar = 'none',
    placeholder,
    slashHintLabel = '',
  }: {
    doc?: Record<string, unknown>;
    editable?: boolean;
    onChange: (doc: Record<string, unknown>) => void;
    penBar?: string;
    placeholder?: string;
    slashHintLabel?: string;
    className?: string;
  }) {
    return (
      <div
        /*
          ⚠️ **A PARTIÇÃO DA §7.9, APLICADA À BARRA DE CANETAS.** O que a TELA
          decide é ONDE a barra fica — uma palavra, a prop `penBar` —, e é só
          isso que este dublê expõe. Quem desenha a barra, e quem prova que
          `'fixed'` vira `fixed inset-x-0 bottom-0` no celular e volta a ser
          estática acima de 1120px, é o `RichEditor` de verdade, guardado em
          `packages/ui/src/components/__tests__/pen-bar.test.tsx`.
        */
        data-editable={String(editable)}
        data-pen-bar={penBar}
        data-slash-hint={slashHintLabel}
        data-testid={editable ? 'editor' : 'reader'}
      >
        <p data-testid={editable ? 'editor-text' : 'reader-text'}>
          {textOf(doc)}
        </p>
        {editable ? (
          <>
            <button
              data-testid="type"
              onClick={() => {
                keystrokes += 1;
                onChange(docOf('a'.repeat(keystrokes)));
              }}
              type="button"
            >
              {placeholder}
            </button>
            {/* O `onChange` ESPÚRIO: o editor devolvendo o documento que
                acabou de receber (⚠️ 2 da Tarefa 14). */}
            <button
              data-testid="echo"
              onClick={() => onChange(doc ?? EMPTY)}
              type="button"
            >
              eco
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
const NOTE_ID = 'n-minha';
const HER_NOTE_ID = 'n-dela';
/**
 * ⚠️ **O CLUBE QUE NÃO É O ATIVO — o fixture hostil do corte de tenant.**
 *
 * O clube ativo do cabeçalho é o `CASAL` (`c-casal`). Um livro de OUTRO
 * clube é o único caso em que "clube do livro" e "clube ativo" dão respostas
 * diferentes — sem ele, a asserção da URL passa pelas duas origens.
 */
const OTHER_CLUB_ID = 'c-outro';

/** O `id` que o `meReply()` do harness devolve. Sou eu. */
const MARCOS = 'u-marcos';
const MARIA = 'u-maria';

function aDoc(text: string): NoteDocBody {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

/** Fixture é factory (§7.7) — o `doc` é uma árvore MUTÁVEL por dentro. */
function aNote(overrides: Partial<NoteResponse> = {}): NoteResponse {
  return {
    id: NOTE_ID,
    clubId: CLUB_ID,
    bookId: BOOK_ID,
    userId: MARCOS,
    kind: 'FREE',
    planItemId: null,
    title: 'A ideia da pagina 112',
    reference: 'p. 112',
    doc: aDoc('a ideia que veio no meio da noite'),
    plainText: 'a ideia que veio no meio da noite',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: '2026-09-04T10:00:00.000Z',
    updatedAt: '2026-09-04T10:00:00.000Z',
    ...overrides,
  };
}

function bookReply(clubId: string = CLUB_ID): Reply {
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
      planItems: [aPlanItem({ id: 'p-1', order: 1 })],
      writers: [],
      readers: [],
      inventory: { notes: 0, highlights: 0 },
      lastHighlight: null,
    },
  };
}

/**
 * ⚠️ **O `PATCH` DEVOLVE A NOTA COMO ELA FICOU, e isto é FIDELIDADE (§7.1),
 * não conveniência.**
 *
 * MEDIDO: um dublê que respondesse a nota ANTIGA faz a tela recalcular a linha
 * de base para trás — e aí o patch que acabou de ser aceito volta a parecer
 * pendente, e o flush do desmonte manda tudo outra vez. O teste *"does NOT
 * write twice when the debounce already fired"* ficava vermelho por causa do
 * fixture, e um bug de verdade se esconderia atrás dele. O backend devolve
 * `toNoteResponse(note)` da linha gravada; o dublê faz o mesmo.
 */
function echoWrite(request: RecordedRequest): Reply {
  const patch = request.body;
  return {
    status: 200,
    body:
      typeof patch === 'object' && patch !== null
        ? { ...aNote(), ...patch }
        : aNote(),
  };
}

interface FreeNoteSetup {
  path?: string;
  book?: Reply;
  /** O acervo — `GET /clubs/:clubId/notes?bookId=…`, ou um por chamada. */
  list?: Reply | Responder;
  /** `POST /books/:bookId/notes`. */
  create?: Reply | Responder;
  /** `PATCH` e `DELETE` em `/notes/:noteId`. */
  write?: Reply | Responder;
  me?: Reply;
  /**
   * `GET /clubs/:clubId/members` (Tarefa 26a) — quem é o clube, pelo nome.
   *
   * O padrão continua sendo a lista VAZIA, que é o estado em que os testes
   * anteriores a esta fatia foram escritos: o clube é conhecido e não tem
   * ninguém a nomear, logo o genérico.
   */
  members?: Reply;
}

/**
 * O shell autenticado inteiro, endpoint por endpoint.
 *
 * ⚠️ A ORDEM importa e cada linha tem um motivo:
 * - a criação (`/books/:bookId/notes`) vem antes de `/books/`, senão o `POST`
 *   cairia na resposta do livro;
 * - `/notes/` (com barra) é `PATCH`/`DELETE` por id, e não casa
 *   `/clubs/:id/notes?…`, que é a listagem.
 */
function freeNoteResponder(setup: FreeNoteSetup): Responder {
  return replyByUrl(
    [
      ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
      /*
        ⚠️ **AS DUAS LINHAS DO ACERVO (Tarefa 28), e elas não são decoração.**
        Arquivar esta anotação devolve a pessoa ao ACERVO (`/books/:id/acervo`),
        e aquela tela carrega as anotações **e** os grifos num `Promise.all` —
        meio acervo é uma lista incompleta em silêncio, então ela trata a falha
        de qualquer um dos dois como falha da seção. Sem a linha de
        `/highlights`, o fallback 500 faria a tela mostrar "não foi possível
        carregar o acervo" e o teste do arquivamento ficaria vermelho por um
        motivo que não tem nada a ver com o que ele prova.

        ⚠️ E `/members` vem ANTES de `/me`, que é o falso verde medido na Tarefa
        27: o `replyByUrl` casa por SUBSTRING, e `/clubs/c-casal/members`
        **contém** `/me`.
      */
      ['/members', setup.members ?? { status: 200, body: [] }],
      ['/highlights', { status: 200, body: [] }],
      ['/me', setup.me ?? meReply({ clubs: [CASAL] })],
      [
        `/books/${BOOK_ID}/notes`,
        setup.create ?? { status: 201, body: aNote({ id: 'n-nova' }) },
      ],
      ['/notes/', setup.write ?? echoWrite],
      ['/notes?', setup.list ?? { status: 200, body: [aNote()] }],
      ['/books/', setup.book ?? bookReply()],
    ],
    { status: 500, body: { error: 'Internal Server Error' } },
  );
}

/**
 * Descarrega as microtarefas pendentes — a suíte roda com timers FALSOS do
 * começo ao fim (o debounce se prova por CONTAGEM, §7.3), e com eles o
 * `waitFor` não pode esperar.
 */
async function settle(): Promise<void> {
  for (let step = 0; step < 10; step += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderFreeNote(
  setup: FreeNoteSetup = {},
): Promise<RecordedRequest[]> {
  const calls = stubFetch(freeNoteResponder(setup));

  await act(async () => {
    renderPage(<App />, {
      path: setup.path ?? freeNotePath(BOOK_ID, NOTE_ID),
      storage: memoryStorage({ ...SESSION }),
    });
  });
  await settle();

  return calls;
}

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

async function pressTestId(testId: string): Promise<void> {
  await press(screen.getByTestId(testId));
}

async function pressLabel(name: string): Promise<void> {
  await press(screen.getByRole('button', { name }));
}

async function typeInto(label: string, value: string): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
  await settle();
}

/** As escritas por id: `PATCH` e `DELETE` de `/notes/:noteId`. */
function writes(calls: readonly RecordedRequest[]): RecordedRequest[] {
  return requestsTo(calls, '/notes/');
}

/** As criações: `POST /books/:bookId/notes`. */
function creates(calls: readonly RecordedRequest[]): RecordedRequest[] {
  return requestsTo(calls, `/books/${BOOK_ID}/notes`);
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

function locationText(): string {
  return screen.getByTestId('location').textContent ?? '';
}

/**
 * O QUE UM CAMPO DE TEXTO TEM ESCRITO — `instanceof`, nunca `as`.
 *
 * ⚠️ Um `as HTMLInputElement` mentiria em silêncio no dia em que o campo
 * virasse `textarea` ou deixasse de existir: `.value` sairia `undefined` e a
 * asserção positiva viraria comparação de `undefined` com `undefined`. O
 * `throw` é o que faz a metade POSITIVA de um par negativo valer alguma coisa
 * (§7.3).
 */
function valueOf(label: string): string {
  const field = screen.getByLabelText(label);
  if (!(field instanceof HTMLInputElement))
    throw new Error(`"${label}" não é um campo de texto`);
  return field.value;
}

const TITLE_LABEL = pt.pages.freeNote.fields.title;
const REFERENCE_LABEL = pt.pages.freeNote.fields.reference;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/*
  ⚠️ **ESTE BLOCO É O PRIMEIRO DO ARQUIVO DE PROPÓSITO, E MOVÊ-LO O DEIXA
  VERMELHO.** O `React.lazy` MEMOIZA a promessa do módulo: o `import()`
  acontece uma vez por processo. O `fallback` do `Suspense` só é observável na
  PRIMEIRA montagem do arquivo.
*/
describe('⚠️ THE EDITOR ARRIVES IN A CHUNK OF ITS OWN (rule 14)', () => {
  it('shows a loading state while the editor chunk is in flight, and the editor after it lands', async () => {
    chunk.hold();
    const calls = await renderFreeNote({ path: freeNoteNewPath(BOOK_ID) });

    // A TELA já está de pé — o `h1` está lá — e o editor ainda não.
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: pt.pages.freeNote.newTitle,
      }),
    ).not.toBeNull();
    expect(screen.queryByText(pt.pages.freeNote.editorLoading)).not.toBeNull();
    expect(screen.queryByTestId('editor')).toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();

    await act(async () => {
      chunk.arrive();
    });
    await settle();

    expect(screen.queryByTestId('editor')).not.toBeNull();
    expect(screen.queryByText(pt.pages.freeNote.editorLoading)).toBeNull();
    // E a chegada do chunk não é motivo para gravar nada.
    expect(creates(calls)).toHaveLength(0);
    expectNoGuilt();
  });
});

describe('⚠️ CREATING IS EXPLICIT, AND AN EMPTY TITLE SENDS NOTHING (rules 9, 16)', () => {
  it('marks the field and sends NOTHING when the title is empty (rule 9)', async () => {
    const calls = await renderFreeNote({ path: freeNoteNewPath(BOOK_ID) });

    // Texto escrito, título em branco: é o caso realista de quem começou pelo
    // corpo da anotação.
    await pressTestId('type');
    await pressLabel(pt.pages.freeNote.create);

    // NADA foi enviado — nem um `POST` que o backend recusaria com um 400 em
    // inglês para a tela traduzir.
    expect(creates(calls)).toHaveLength(0);
    expect(
      screen.queryByText(pt.pages.freeNote.fields.titleRequired),
    ).not.toBeNull();
    expect(
      screen.getByLabelText(TITLE_LABEL).getAttribute('aria-invalid'),
    ).toBe('true');
    // E a tela continua onde estava, com o texto na mão.
    expect(locationText()).toBe(freeNoteNewPath(BOOK_ID));
    expectNoGuiltBesidesFormError([pt.pages.freeNote.fields.titleRequired]);
    expectNoPrivacyTalk();
  });

  it('writes NOTHING at all until the button is pressed (rule 16)', async () => {
    /*
      ⚠️ A REGRA QUE IMPEDE UMA NOTA POR TELA ABERTA. Na Tarefa 18 o sintoma
      era gravar a mesma nota à toa; aqui seria CRIAR LINHA NOVA no acervo do
      clube a cada vez que alguém abre o formulário e desiste.
    */
    const calls = await renderFreeNote({ path: freeNoteNewPath(BOOK_ID) });

    await typeInto(TITLE_LABEL, 'A ideia da pagina 112');
    await typeInto(REFERENCE_LABEL, 'p. 112');
    await pressTestId('type');
    // Muito mais que o debounce inteiro da tela de correção.
    await advance(5000);

    expect(creates(calls)).toHaveLength(0);

    // E nem sair da tela cria nada.
    await act(async () => {
      cleanup();
    });
    await settle();
    expect(creates(calls)).toHaveLength(0);
  });

  it('sends { title, doc } and nothing else, and goes to the note it just created (rules 10, 11)', async () => {
    const calls = await renderFreeNote({
      path: freeNoteNewPath(BOOK_ID),
      create: { status: 201, body: aNote({ id: 'n-nova' }) },
    });

    // Espaços em volta do título de propósito: o `.trim()` é da borda, e o
    // corpo tem de sair limpo.
    await typeInto(TITLE_LABEL, '  A ideia da pagina 112  ');
    await pressTestId('type');
    await pressLabel(pt.pages.freeNote.create);

    expect(creates(calls)).toHaveLength(1);
    const write = requestAt(creates(calls), 0);
    expect(write.method).toBe('POST');
    expect(write.url).toBe(`https://api.teste/books/${BOOK_ID}/notes`);
    /*
      ⚠️ AS CHAVES EXATAS, e não um `toMatchObject`: o `createFreeNoteSchema` é
      `.strict()`, `plainText` é derivado no backend (ADR 0001) e
      `userId`/`clubId` vêm do JWT e da rota (§6.3). Qualquer chave a mais é
      400 — e um 400 aqui é a pessoa perdendo o que escreveu.

      E REGRA 10: referência em branco é AUSÊNCIA de chave, não `''`.
    */
    expect(Object.keys(write.body ?? {}).sort()).toEqual(['doc', 'title']);
    expect(JSON.stringify(write.body)).toContain(
      '"title":"A ideia da pagina 112"',
    );
    expect(JSON.stringify(write.body)).not.toContain('plainText');
    expect(JSON.stringify(write.body)).not.toContain(MARCOS);
    expect(JSON.stringify(write.body)).not.toContain(CLUB_ID);

    // E a pessoa continua na anotação que acabou de escrever — não numa lista.
    expect(locationText()).toBe(freeNotePath(BOOK_ID, 'n-nova'));
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('sends the reference, trimmed, when there is one (rule 10)', async () => {
    const calls = await renderFreeNote({ path: freeNoteNewPath(BOOK_ID) });

    await typeInto(TITLE_LABEL, 'A ideia da pagina 112');
    await typeInto(REFERENCE_LABEL, '  p. 112  ');
    await pressLabel(pt.pages.freeNote.create);

    const write = requestAt(creates(calls), 0);
    expect(Object.keys(write.body ?? {}).sort()).toEqual([
      'doc',
      'reference',
      'title',
    ]);
    expect(JSON.stringify(write.body)).toContain('"reference":"p. 112"');
  });

  it('keeps the words of the API off the screen when the creation fails (rule 21)', async () => {
    const calls = await renderFreeNote({
      path: freeNoteNewPath(BOOK_ID),
      create: { status: 500, body: { error: 'Boom: disk is on fire' } },
    });

    await typeInto(TITLE_LABEL, 'A ideia da pagina 112');
    await pressLabel(pt.pages.freeNote.create);

    expect(creates(calls)).toHaveLength(1);
    expect(screenIsUp()).toBe(true);
    // `readableText()` vê texto E atributos que carregam texto (§7.6.1).
    expect(readableText()).not.toContain('Boom');
    expect(readableText()).not.toContain('disk is on fire');
    // E continua na tela de criação, com o que a pessoa digitou.
    expect(locationText()).toBe(freeNoteNewPath(BOOK_ID));
    expectNoGuiltBesidesFormError([pt.errors.serverError]);
  });
});

describe('⚠️ OPENING THE NOTE AND CHANGING NOTHING SENDS NO PATCH (rule 13)', () => {
  it('loads the note, fills the fields, and writes nothing at all', async () => {
    const calls = await renderFreeNote();

    expect(screen.getByLabelText(TITLE_LABEL)).toHaveProperty(
      'value',
      'A ideia da pagina 112',
    );
    expect(screen.getByLabelText(REFERENCE_LABEL)).toHaveProperty(
      'value',
      'p. 112',
    );
    expect(editorText()).toBe('a ideia que veio no meio da noite');

    await advance(5000);

    expect(writes(calls)).toHaveLength(0);
    expect(saveStatusText()).toBe('');
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('sends no write when the editor emits the very doc it just received', async () => {
    /*
      ⚠️ O `onChange` ESPÚRIO. A Tarefa 14 achou DOIS caminhos que o produzem no
      TipTap e os consertou no editor; esta é a segunda guarda, na tela, e é a
      que sobrevive a um upgrade do TipTap.
    */
    const calls = await renderFreeNote();

    await pressTestId('echo');
    await advance(5000);

    expect(writes(calls)).toHaveLength(0);
    expectNoGuilt();
  });

  it('sends no write when the person retypes exactly what was already there', async () => {
    // O outro lado da mesma defesa: o patch é COMPARAÇÃO, não "tocou no
    // campo". Reescrever o mesmo título não é uma correção.
    const calls = await renderFreeNote();

    await typeInto(TITLE_LABEL, 'A ideia da pagina 999');
    await typeInto(TITLE_LABEL, 'A ideia da pagina 112');
    await advance(5000);

    expect(writes(calls)).toHaveLength(0);
  });

  it('does not write an empty title, and marks the field instead (rule 9)', async () => {
    const calls = await renderFreeNote();

    await typeInto(TITLE_LABEL, '   ');
    await advance(5000);

    expect(writes(calls)).toHaveLength(0);
    expect(
      screen.getByLabelText(TITLE_LABEL).getAttribute('aria-invalid'),
    ).toBe('true');
    expectNoGuiltBesidesFormError([pt.pages.freeNote.fields.titleRequired]);
  });
});

describe('the correction sends ONLY what changed (rule 12)', () => {
  it('sends { title } when only the title changed', async () => {
    const calls = await renderFreeNote();

    await typeInto(TITLE_LABEL, 'A ideia que veio da pagina 112');
    await advance(1500);

    expect(writes(calls)).toHaveLength(1);
    const write = requestAt(writes(calls), 0);
    expect(write.method).toBe('PATCH');
    expect(write.url).toBe(`https://api.teste/notes/${NOTE_ID}`);
    // ⚠️ SÓ O TÍTULO: um patch com `doc` reenviaria a anotação inteira a cada
    // renomeação, e um com `reference` reescreveria o que ninguém tocou.
    expect(Object.keys(write.body ?? {})).toEqual(['title']);
  });

  it('sends { doc } when only the text changed', async () => {
    const calls = await renderFreeNote();

    await pressTestId('type');
    await advance(1500);

    expect(Object.keys(requestAt(writes(calls), 0).body ?? {})).toEqual([
      'doc',
    ]);
  });

  it('sends reference: null when the reference is CLEARED, not an empty string', async () => {
    /*
      ⚠️ AUSENTE × `null` É A DISTINÇÃO DO `editNoteSchema`, e ela é o que
      permite limpar a referência: ausente não mexe, `null` limpa. Mandar `''`
      gravaria uma referência vazia — e o schema nem aceita (é
      `.nullable().optional()`, sem `.default()`).
    */
    const calls = await renderFreeNote();

    await typeInto(REFERENCE_LABEL, '');
    await advance(1500);

    const write = requestAt(writes(calls), 0);
    expect(write.body).toEqual({ reference: null });
  });

  it('sends the three fields together when the three changed', async () => {
    const calls = await renderFreeNote();

    await typeInto(TITLE_LABEL, 'Outro titulo');
    await typeInto(REFERENCE_LABEL, 'p. 200');
    await pressTestId('type');
    await advance(1500);

    // UMA requisição com as três chaves, e não três requisições.
    expect(writes(calls)).toHaveLength(1);
    expect(Object.keys(requestAt(writes(calls), 0).body ?? {}).sort()).toEqual([
      'doc',
      'reference',
      'title',
    ]);
  });
});

describe('the autosave waits 1500 ms of silence, and RESTARTS (rule 15)', () => {
  it('sends ONE write 1500 ms after the last keystroke, not one per key', async () => {
    const calls = await renderFreeNote();

    await pressTestId('type');
    await advance(1499);
    // ⚠️ O lado NEGATIVO do par: sem ele, "salva sempre" passaria.
    expect(writes(calls)).toHaveLength(0);

    await advance(1);
    expect(writes(calls)).toHaveLength(1);
  });

  it('RESTARTS the wait on every keystroke — debounce, not throttle', async () => {
    const calls = await renderFreeNote();

    await pressTestId('type');
    await advance(1000);
    expect(writes(calls)).toHaveLength(0);

    // A segunda tecla, ainda dentro da espera. Um THROTTLE já teria gravado
    // aos 1500 ms contados da PRIMEIRA.
    await pressTestId('type');
    await advance(1000);
    expect(writes(calls)).toHaveLength(0);

    await advance(500);
    // E é UMA escrita: a primeira espera foi cancelada, não somada.
    expect(writes(calls)).toHaveLength(1);
  });

  it('walks idle → saving → saved, and back to idle 2000 ms later', async () => {
    let release: (() => void) | undefined;
    const calls = await renderFreeNote({
      write: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { status: 200, body: aNote({ title: 'Outro titulo' }) };
      },
    });

    expect(saveStatusText()).toBe('');

    await typeInto(TITLE_LABEL, 'Outro titulo');
    await advance(1500);
    expect(writes(calls)).toHaveLength(1);
    expect(saveStatusText()).toBe(pt.pages.freeNote.save.saving);

    await act(async () => {
      release?.();
    });
    await settle();
    expect(saveStatusText()).toBe(pt.pages.freeNote.save.saved);

    await advance(1999);
    expect(saveStatusText()).toBe(pt.pages.freeNote.save.saved);

    await advance(1);
    expect(saveStatusText()).toBe('');
    expectNoGuilt();
  });

  it('flushes what was typed EXACTLY once when the screen goes away', async () => {
    // Sem isto, o que a pessoa digitou nos últimos 1500 ms iria para o lixo ao
    // tocar "voltar" — e não há rascunho local até a Tarefa 21.
    const calls = await renderFreeNote();

    await pressTestId('type');
    await advance(500);
    expect(writes(calls)).toHaveLength(0);

    await act(async () => {
      cleanup();
    });
    await settle();

    expect(writes(calls)).toHaveLength(1);
  });

  it('does NOT write twice when the debounce already fired before leaving', async () => {
    // O outro lado do par: já salvo é já salvo. Um flush incondicional no
    // desmonte gravaria a mesma correção duas vezes por visita.
    const calls = await renderFreeNote();

    await pressTestId('type');
    await advance(1500);
    expect(writes(calls)).toHaveLength(1);

    await act(async () => {
      cleanup();
    });
    await settle();

    expect(writes(calls)).toHaveLength(1);
  });
});

describe('the autosave that fails NEVER loses the text', () => {
  it('says it could not save, keeps the text, and the repeat REDOES the write', async () => {
    let attempts = 0;
    const calls = await renderFreeNote({
      write: () => {
        attempts += 1;
        return attempts === 1
          ? { status: 0, offline: true }
          : { status: 200, body: aNote() };
      },
    });

    await pressTestId('type');
    await advance(1500);

    expect(writes(calls)).toHaveLength(1);
    expect(screen.queryByText(pt.pages.freeNote.save.failed)).not.toBeNull();
    // O editor continua montado, com o MESMO `doc` que a tela lhe deu.
    expect(editorText()).toBe('a ideia que veio no meio da noite');

    await pressLabel(pt.pages.freeNote.save.retry);

    expect(writes(calls)).toHaveLength(2);
    // E com o MESMO corpo: o que a pessoa escreveu não se perdeu.
    expect(requestAt(writes(calls), 1).body).toEqual(
      requestAt(writes(calls), 0).body,
    );
    expect(saveStatusText()).toBe(pt.pages.freeNote.save.saved);
    expectNoGuilt();
  });

  it('has its own words for a 403 on the write, with no pointless retry', async () => {
    await renderFreeNote({
      write: { status: 403, body: { error: 'Forbidden' } },
    });

    await pressTestId('type');
    await advance(1500);

    expect(
      screen.queryByText(pt.pages.freeNote.save.unavailable),
    ).not.toBeNull();
    expect(readableText()).not.toContain(pt.pages.freeNote.save.failed);
    // Insistir não resolve: a nota deixou de ser sua, ou sumiu.
    expect(
      screen.queryByRole('button', { name: pt.pages.freeNote.save.retry }),
    ).toBeNull();
    expect(editorText()).toBe('a ideia que veio no meio da noite');
    expect(readableText()).not.toContain('Forbidden');
    expectNoGuilt();
  });
});

describe('⚠️ THE NOTE OF ANOTHER PERSON HAS NO AFFORDANCE AT ALL (rule 17)', () => {
  it('opens it in reading mode, with no field and no button', async () => {
    /*
      ADR 0002: o texto está aqui INTEIRO, porque dentro do clube não existe
      conteúdo privado. O que não existe é editar o que o outro escreveu — e
      isso é AUTORIA, não privacidade. Daí o `expectNoPrivacyTalk` junto.
    */
    await renderFreeNote({
      path: freeNotePath(BOOK_ID, HER_NOTE_ID),
      list: {
        status: 200,
        body: [
          aNote({
            id: HER_NOTE_ID,
            userId: MARIA,
            title: 'O que ela achou da porta',
            doc: aDoc('a porta redonda e verde'),
            plainText: 'a porta redonda e verde',
          }),
        ],
      },
    });

    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: 'O que ela achou da porta',
      }),
    ).not.toBeNull();
    const reader = screen.getByTestId('reader');
    expect(reader.getAttribute('data-editable')).toBe('false');
    expect(screen.getByTestId('reader-text').textContent).toBe(
      'a porta redonda e verde',
    );

    // Nenhum controle da tela: nem campo, nem arquivar, nem salvar.
    const main = screen.getByRole('main');
    expect(main.querySelectorAll('button')).toHaveLength(0);
    expect(main.querySelectorAll('input, textarea')).toHaveLength(0);
    expect(screen.queryByTestId('save-status')).toBeNull();
    // E a tela DIZ que é leitura, em vez de só não ter botão.
    expect(readableText()).toContain(pt.pages.freeNote.readOnly);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });
});

/**
 * ⚠️⚠️ **O NOME DE QUEM ESCREVEU — a decisão E da Tarefa 42.**
 *
 * Esta tela dizia "Alguém do clube" desde a Tarefa 19, pelo mesmo motivo
 * registrado (e vencido) na tela do dia: `GET /clubs/:clubId/members` existe
 * desde a Tarefa 26a e **seis** telas já o usam pelo mesmo `club-names.ts`.
 *
 * As três propriedades são as da regra 6 da spec, e nenhuma delas é "a tela
 * chama `nameOfWriter`": o nome na tela, o fallback quando a chamada falha, e
 * o avatar recebendo **o mesmo nome** que o texto mostra.
 *
 * Fixture hostil (§7.2): `Maria Rita` → "MR", `u-maria` → "U", `Marcos` → "M".
 */
describe('⚠️ the name of whoever wrote it (decision E of Task 42)', () => {
  const MARIA_NAME = 'Maria Rita';

  function herNote(): Reply {
    return {
      status: 200,
      body: [
        aNote({
          id: HER_NOTE_ID,
          userId: MARIA,
          title: 'O que ela achou da porta',
          doc: aDoc('a porta redonda e verde'),
          plainText: 'a porta redonda e verde',
        }),
      ],
    };
  }

  function membersReply(): Reply {
    return {
      status: 200,
      body: [
        { userId: MARIA, name: MARIA_NAME, role: 'MEMBER', status: 'ACTIVE' },
        { userId: MARCOS, name: 'Marcos', role: 'OWNER', status: 'ACTIVE' },
      ],
    };
  }

  /** O avatar é `aria-hidden` — a marca é o par `--person-*` do canvas. */
  function avatars(): HTMLElement[] {
    return Array.from(document.querySelectorAll('[class*="bg-person"]'));
  }

  it('shows the NAME of the other person when the club is known', async () => {
    await renderFreeNote({
      path: freeNotePath(BOOK_ID, HER_NOTE_ID),
      list: herNote(),
      members: membersReply(),
    });

    expect(readableText()).toContain(MARIA_NAME);
    expect(readableText()).not.toContain(pt.pages.acervo.item.author.other);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('⚠️ gives the avatar the SAME name the text shows', async () => {
    await renderFreeNote({
      path: freeNotePath(BOOK_ID, HER_NOTE_ID),
      list: herNote(),
      members: membersReply(),
    });

    const marks = avatars();
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe('MR');
  });

  it('falls back to the neutral label when the members call FAILS — and shows the note anyway', async () => {
    await renderFreeNote({
      path: freeNotePath(BOOK_ID, HER_NOTE_ID),
      list: herNote(),
      members: { status: 500, body: { error: 'Internal Server Error' } },
    });

    expect(readableText()).toContain(pt.pages.acervo.item.author.other);
    expect(readableText()).not.toContain(MARIA_NAME);
    // A anotação continua inteira: o nome é legenda, o texto é o conteúdo.
    expect(screen.getByTestId('reader-text').textContent).toBe(
      'a porta redonda e verde',
    );
    // E o avatar cai no glifo NEUTRO, nunca na primeira letra do UUID.
    expect(avatars()[0]?.textContent).toBe('');
    expectNoGuilt();
  });

  /**
   * ⚠️⚠️ **O CORTE DE TENANT — a primeira versão deste `it()` NÃO O TESTAVA.**
   *
   * Ela usava o fixture comum, em que
   * `CASAL.id === CLUB_ID === book.clubId === 'c-casal'`, então a asserção da
   * URL era verdadeira para **as duas** origens possíveis. Medido na auditoria:
   * pedir os membros do clube **ATIVO** em vez do clube **DO LIVRO** passava
   * por **886 testes**. Fixture hostil agora (§7.2): o livro é de `c-outro`.
   */
  it('⚠️ asks the club OF THE BOOK, not the ACTIVE one — and asks once', async () => {
    const calls = await renderFreeNote({
      // O clube ativo continua sendo o `c-casal` do `meReply({ clubs: [CASAL] })`.
      book: bookReply(OTHER_CLUB_ID),
      path: freeNotePath(BOOK_ID, HER_NOTE_ID),
      list: herNote(),
      members: membersReply(),
    });

    const asked = requestsTo(calls, '/members');
    expect(asked).toHaveLength(1);
    expect(requestAt(asked, 0).url).toBe(
      `https://api.teste/clubs/${OTHER_CLUB_ID}/members`,
    );
    expect(requestAt(asked, 0).url).not.toContain(CLUB_ID);
  });
});

describe('⚠️ ARCHIVING ASKS FIRST (rules 18, 19, 20)', () => {
  it('does NOT call the API when the confirmation is cancelled (rule 18)', async () => {
    const calls = await renderFreeNote();

    await pressLabel(pt.pages.freeNote.archive.action);
    // O sheet está aberto e diz o que vai acontecer.
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(
      screen.queryByText(pt.pages.freeNote.archive.description),
    ).not.toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();

    await pressLabel(pt.pages.freeNote.archive.cancel);

    // ⚠️ NENHUMA requisição — e o sheet saiu do DOM (fechado ele não está lá,
    // que é o que impede o "Cancelar" de continuar tabulável).
    expect(writes(calls)).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    // E a anotação continua na tela, inteira.
    expect(editorText()).toBe('a ideia que veio no meio da noite');
  });

  it('sends DELETE on confirm, and the note is GONE from the collection (rules 19, 20)', async () => {
    /*
      ⚠️ O FLUXO INTEIRO, e é o único lugar onde a regra 20 é decidível: o
      backend esconde a arquivada, e a prova de que a TELA não guarda uma cópia
      é que ela volta a PERGUNTAR — a segunda listagem é uma requisição de
      verdade, e o que ela devolve é o que aparece.
    */
    let listCalls = 0;
    const calls = await renderFreeNote({
      list: () => {
        listCalls += 1;
        // A primeira listagem é a da tela da anotação; da segunda em diante é
        // o acervo do livro, já sem a nota arquivada.
        return listCalls === 1
          ? { status: 200, body: [aNote()] }
          : { status: 200, body: [] };
      },
      write: { status: 200, body: aNote({ status: 'ARCHIVED' }) },
    });

    await pressLabel(pt.pages.freeNote.archive.action);
    await pressLabel(pt.pages.freeNote.archive.confirm);

    expect(writes(calls)).toHaveLength(1);
    const write = requestAt(writes(calls), 0);
    expect(write.method).toBe('DELETE');
    expect(write.url).toBe(`https://api.teste/notes/${NOTE_ID}`);

    /*
      ⚠️ **VOLTOU PARA O ACERVO, e o acervo foi PERGUNTADO outra vez.** O
      destino mudou na Tarefa 28 — era `/books/:bookId`, e a coleção era uma
      seção daquela tela até a Tarefa 27. Com o acervo em tela própria, é para
      lá que a nota arquivada devolve a pessoa, e é o que mantém esta regra
      decidível: a segunda listagem é uma requisição de verdade, e o que ela
      devolve é o que aparece.
    */
    expect(locationText()).toBe(`/books/${BOOK_ID}/acervo`);
    expect(listCalls).toBeGreaterThan(1);
    expect(readableText()).not.toContain('A ideia da pagina 112');
    expect(screen.queryByText(pt.pages.acervo.empty.title)).not.toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('says it could not archive, and keeps the note on the screen', async () => {
    const calls = await renderFreeNote({
      write: { status: 500, body: { error: 'Boom: disk is on fire' } },
    });

    await pressLabel(pt.pages.freeNote.archive.action);
    await pressLabel(pt.pages.freeNote.archive.confirm);

    expect(writes(calls)).toHaveLength(1);
    expect(screen.queryByText(pt.pages.freeNote.archive.failed)).not.toBeNull();
    expect(readableText()).not.toContain('Boom');
    expect(readableText()).not.toContain('disk is on fire');
    // A anotação continua aqui: nada foi arquivado.
    expect(editorText()).toBe('a ideia que veio no meio da noite');
    expect(locationText()).toBe(freeNotePath(BOOK_ID, NOTE_ID));
    expectNoGuiltBesidesFormError([pt.pages.freeNote.archive.failed]);
  });
});

describe('the standalone note when the address points at nothing (rule 21)', () => {
  it('has a state of its own when the note is not in the collection of the book', async () => {
    const calls = await renderFreeNote({ list: { status: 200, body: [] } });

    expect(screenIsUp()).toBe(true);
    expect(
      screen.queryByText(pt.pages.freeNote.noteUnavailable),
    ).not.toBeNull();
    expect(writes(calls)).toHaveLength(0);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('has its own words for a 404 on the book, and no pointless retry', async () => {
    await renderFreeNote({
      book: { status: 404, body: { error: 'Not Found' } },
    });

    expect(screenIsUp()).toBe(true);
    expect(
      screen.queryByText(pt.pages.freeNote.bookUnavailable),
    ).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: pt.pages.freeNote.retry }),
    ).toBeNull();
    expect(readableText()).not.toContain('Not Found');
    expectNoGuilt();
  });

  it('does not guess who I am when the /me failed', async () => {
    /*
      ⚠️ A ARMADILHA NOMEADA DA TAREFA 18: `me` é `null` fora do `ready`. Uma
      tela que tratasse isso como "não sou ninguém" abriria a MINHA anotação em
      modo leitura — em silêncio, sem nada vermelho para denunciar.
    */
    const calls = await renderFreeNote({
      me: { status: 500, body: { error: 'Boom' } },
    });

    expect(screenIsUp()).toBe(true);
    expect(requestsTo(calls, '/books/')).toHaveLength(0);
    expect(requestsTo(calls, '/notes')).toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: pt.pages.freeNote.retry }),
    ).not.toBeNull();
    expect(readableText()).not.toContain('Boom');
    expectNoGuilt();
  });
});

/**
 * ============================================================================
 * A MARGEM DO DESKTOP — "Como vai aparecer no acervo" (Tarefa 47b)
 * ============================================================================
 *
 * `NovaAnotacaoDesktop.dc.html:91-113`. O que esta suíte guarda são as duas
 * perguntas que a 47a aprendeu a fazer separado:
 *
 * - **de CONTEÚDO** — a prévia mostra o que o FORMULÁRIO tem, e não um texto
 *   fixo; e ela continua mostrando depois da última tecla;
 * - **de FORMA** — a margem existe no desktop e NÃO existe no celular, os
 *   dois lados guardados, por TOKEN e nunca por regex.
 *
 * ⚠️ **VERMELHO HONESTO:** destas guardas, as de forma e as dos atalhos
 * nasceram **verdes** contra a implementação — o comportamento foi escrito
 * primeiro nesta fatia, e o que não existia era a guarda. O vermelho delas é
 * o dos mutantes, medido um a um nas notas de reconciliação da 47b. As de
 * conteúdo são as únicas que este arquivo poderia ter visto vermelhas antes.
 */
describe('⚠️ THE DESKTOP MARGIN MIRRORS THE FORM (task 47b, decision A)', () => {
  function preview(): HTMLElement {
    return screen.getByTestId('note-preview');
  }

  function previewText(): string {
    return preview().textContent ?? '';
  }

  function rail(): HTMLElement {
    const node = preview().closest('aside');
    if (node === null) throw new Error('a margem do desktop não está na tela');
    return node;
  }

  it('⚠️ shows the title of the LAST keystroke, and never a fixed text', async () => {
    /*
      ⚠️ **OS DOIS ACUSADORES DA REGRA 2, NUM `it()` SÓ de propósito.** O
      primeiro é "a prévia mostra um TEXTO FIXO em vez do formulário": um
      título que o fixture nunca escreveu reprova. O segundo é "ela deixa de
      refletir a última tecla": o mesmo campo é reescrito, e a prévia tem de
      ANDAR — comparar com o valor novo prova o que uma asserção sobre o
      primeiro valor não prova (ela ficaria verde com a prévia congelada no
      primeiro render).
    */
    await renderFreeNote({ path: freeNoteNewPath(BOOK_ID) });

    // Antes de qualquer tecla, o eco do formulário é o formulário vazio.
    expect(previewText()).not.toContain('a ideia');

    await typeInto(TITLE_LABEL, 'A ideia da pagina 112');
    expect(previewText()).toContain('A ideia da pagina 112');

    await typeInto(TITLE_LABEL, 'A ideia da pagina 113');
    expect(previewText()).toContain('A ideia da pagina 113');
    expect(previewText()).not.toContain('A ideia da pagina 112');
    expectNoGuilt();
  });

  it('⚠️ follows the keystroke on the CORRECTION screen too, not the loaded title', async () => {
    /*
      ⚠️ **ESTE `it()` NASCEU DE UM MUTANTE SOBREVIVENTE (M2 da Tarefa 47b), e
      é a mesma lição da 47a: a suíte guardava a tela de CRIAR e deixava a de
      corrigir sem dono.** O mutante é de uma linha — a margem recebe
      `state.note.title` (o que o servidor mandou) em vez de `title` (o que a
      pessoa está digitando) — e ele deixava 996 testes verdes enquanto a
      prévia congelava para sempre no título carregado.

      Os dois valores têm de ser DIFERENTES na asserção: comparar com o
      carregado é justamente o que o mutante faria passar.
    */
    await renderFreeNote();

    expect(previewText()).toContain('A ideia da pagina 112');

    await typeInto(TITLE_LABEL, 'A ideia da pagina 113');
    expect(previewText()).toContain('A ideia da pagina 113');
    expect(previewText()).not.toContain('A ideia da pagina 112');
    expectNoGuilt();
  });

  it('says WHERE the note lands, in the words the acervo itself uses', async () => {
    /*
      A prévia promete o ACERVO. Se ela inventasse um vocabulário próprio para
      o mesmo objeto, a promessa quebraria sem quebrar teste nenhum — daí a
      asserção ser sobre a chave DO ACERVO, e não sobre uma frase desta tela.
    */
    await renderFreeNote({ path: freeNoteNewPath(BOOK_ID) });

    expect(previewText()).toContain(pt.pages.acervo.kind.free);
    expectNoGuilt();
  });

  it('⚠️ does NOT show the reference — the acervo does not show it either', async () => {
    /*
      ⚠️⚠️ **DECISÃO DO DONO (2026-09-24), e este `it()` é o PAR NEGATIVO
      dela.** A margem imprime "Como vai aparecer no acervo", e o acervo
      **nunca** mostra a referência de uma anotação — medido: `reference`
      aparece ZERO vezes em `acervo.tsx` e em `acervo-entries.ts`. A entrega
      da 47b desenhava `Avulsa · p. 112`, uma linha que o acervo não desenha
      em lugar nenhum, e a auditoria cobrou. O dono escolheu tornar a promessa
      **literalmente verdadeira**: a prévia perde a referência.

      ⚠️ **A AUSÊNCIA SE GUARDA, NÃO SE APAGA — é a forma da 44b e da 46.**
      Sem este `it()`, a próxima fatia reintroduz a referência na prévia e a
      promessa volta a ser falsa **sem um vermelho**. O acusador tem de morder
      quando a linha VOLTA, não quando ela some.

      ⚠️ **E A METADE POSITIVA VEM PRIMEIRO (§7.3), senão isto é asserção
      vazia:** a referência continua existindo no formulário e continua sendo
      salva. Uma tela que simplesmente perdeu o campo passaria em todas as
      asserções negativas abaixo — e seria um defeito bem pior.
    */
    const calls = await renderFreeNote({ path: freeNoteNewPath(BOOK_ID) });

    await typeInto(TITLE_LABEL, 'Frases que quero guardar');
    await typeInto(REFERENCE_LABEL, 'p. 112');

    // POSITIVO (1): o campo tem o valor escrito.
    expect(valueOf(REFERENCE_LABEL)).toBe('p. 112');

    // NEGATIVO: a prévia não a mostra, e nem o separador que a anunciaria.
    expect(previewText()).not.toContain('p. 112');
    expect(previewText()).not.toContain(`${pt.pages.acervo.kind.free} ·`);
    expect(previewText()).toContain(pt.pages.acervo.kind.free);
    expectNoGuilt();

    /*
      POSITIVO (2): e a referência CHEGA À API. Vem por último porque criar é
      um BOTÃO (regra 16 da Tarefa 19) e ele NAVEGA — depois dele não há mais
      formulário nem margem para olhar.
    */
    await pressLabel(pt.pages.freeNote.create);
    expect(creates(calls)[0]?.body).toMatchObject({ reference: 'p. 112' });
  });

  it('⚠️ hides the LOADED reference too, on the correction screen', async () => {
    /*
      ⚠️ **O OUTRO LADO DA AUSÊNCIA, e ele existe pelo motivo do M2:** a tela
      de criar e a de corrigir são dois `return` diferentes do mesmo arquivo,
      e guardar um não guarda o outro. Aqui a referência chega **carregada do
      servidor** (`aNote().reference === 'p. 112'`), que é o caminho por onde
      ela reapareceria sem ninguém digitar nada.

      ⚠️ **METADE POSITIVA:** o campo carregado mostra a referência. Sem ela,
      um fixture mudo faria as duas negativas passarem provando nada.
    */
    await renderFreeNote();

    expect(valueOf(REFERENCE_LABEL)).toBe('p. 112');
    expect(previewText()).not.toContain('p. 112');
    expect(previewText()).not.toContain(`${pt.pages.acervo.kind.free} ·`);
    expect(previewText()).toContain(pt.pages.acervo.kind.free);
    expectNoGuilt();
  });

  it('⚠️ signs the preview with ME — the avatar and the word the acervo uses', async () => {
    /*
      ⚠️ **QUEM ASSINA, e os dois mutantes que cobraram (M22 e a metade de
      A5 da auditoria).**

      1. **O avatar.** Ele mostrava a inicial de `me`, e nenhuma asserção
         dizia de QUEM ele era: trocar `me?.name` por outra pessoa — ou por
         `null`, que rende o glifo neutro — deixava 999 testes verdes. Daí o
         `me` deste `it()` ter um nome que mais ninguém no fixture tem: a
         inicial é a assinatura, e "Z" só pode ter vindo de `me.name`.
      2. **O nome de quem escreveu.** A linha do acervo mostra o autor
         SEMPRE (`acervo.tsx`: sem corpo, o subtítulo é SÓ o autor) — e a
         prévia não mostrava autor nenhum. A auditoria mediu contra o
         `Acervo.dc.html:99-106` e contra `NovaAnotacaoDesktop:98`, e os dois
         desenham. `authorLabel` é `t()` puro, sem derivação: o argumento do
         ADR 0001, que barra o RESUMO do corpo, não alcança o AUTOR.
    */
    await renderFreeNote({
      me: meReply({ clubs: [CASAL], name: 'Zilda' }),
      path: freeNoteNewPath(BOOK_ID),
    });

    expect(previewText()).toContain(pt.pages.acervo.item.author.you);

    const avatars = preview().querySelectorAll('.bg-person');
    expect(avatars).toHaveLength(1);
    expect(avatars[0]?.textContent).toBe('Z');
    expectNoGuilt();
  });

  it('⚠️ wears the ACERVO’S paper, and not a hand copy of it', async () => {
    /*
      ⚠️ **A METADE QUE FALTAVA DO PAR M14/M15, do lado da AVULSA.** A prévia
      do grifo já importava a classe do card do acervo; esta desenhava o mesmo
      papel **escrito à mão** — fundo, filete, raio e recuo repetidos —, que é
      literalmente o defeito que aquele par existe para impedir. A auditoria
      mediu, o papel virou `ACERVO_PAPER_CLASS` em `acervo-rows.tsx`, e a
      direção ficou com quem chama (o card de grifo empilha; esta prévia põe o
      avatar ao lado).

      O outro lado do par é `acervo.test.tsx › draws the acervo card with
      EXACTLY the class the preview reads`, e ele guarda a mesma constante
      pela composição: `ACERVO_CARD_CLASS` É o papel mais a direção.
    */
    await renderFreeNote({ path: freeNoteNewPath(BOOK_ID) });

    expect(preview().getAttribute('class')).toBe(`${ACERVO_PAPER_CLASS} gap-3`);
  });

  it('⚠️ keeps the margin OFF the phone and ON the desktop — the pair, both sides', async () => {
    /*
      ⚠️ **O PAR GUARDADO DOS DOIS LADOS, e este bloco já pagou CINCO vezes
      por metade de par.** São dois defeitos OPOSTOS:

      - sem o `hidden`, a margem aparece NO CELULAR — e aí o título que a
        pessoa está digitando aparece duas vezes na mesma tela, uma no campo e
        outra logo abaixo;
      - sem o `min-[1120px]:flex`, a margem NUNCA aparece, e a fatia inteira
        vira código morto que renderiza.

      ⚠️ **O `flex` da base entra na asserção de propósito:** o `hidden` vem
      do `className` da tela e o `flex` vem do `MarginRail` de `packages/ui`.
      A margem só reaparece porque `.hidden` e `.flex` colidem e o
      `min-[1120px]:` vence por media query — escrever os DOIS tokens aqui é o
      que torna a colisão visível para quem mexer em qualquer um dos dois
      arquivos. (`jsdom` não aplica media query: o que se prova é a classe.)
    */
    await renderFreeNote({ path: freeNoteNewPath(BOOK_ID) });

    /*
      ⚠️ **E O CABEÇALHO DA PRÉVIA ENTRA AQUI PORQUE UM MUTANTE O PEDIU (M17
      da 47b).** Ele é a frase que dá sentido ao card — sem ela, o card é um
      pedaço de tela repetindo o que a pessoa acabou de digitar, sem dizer por
      quê. Apagá-lo deixava **999 testes verdes**: a margem continuava
      existindo, com as classes certas, dizendo nada. É a lição da 47a
      (a suíte guardava COR e não guardava FORMA) na versão "guardava a caixa
      e não guardava a promessa".
    */
    expect(rail().textContent).toContain(pt.pages.freeNote.preview.heading);
    expect(hidingOf(rail())).toEqual(['hidden']);
    expect(tokensOf(rail(), 'flex')).toEqual(['flex', 'min-[1120px]:flex']);
  });

  it('lists the editor shortcuts as a KEY and what it does — PAIRED', async () => {
    /*
      ⚠️⚠️ **EM PARES, E ISSO NASCEU DE UM MUTANTE SOBREVIVENTE (M23 da
      rodada de correção).** A asserção antiga olhava as teclas de um lado
      (`['/', '>']`) e as descrições do outro (`toContain` solto no texto da
      margem). Com as duas metades soltas, um mutante de UMA LINHA que TROCA
      as descrições — `/` passa a dizer "citação" e `>` "inserir bloco" —
      deixava **999 testes verdes** com a margem ensinando o gesto errado.

      É exatamente a classe de defeito que esta mesma fatia recusou por
      escrito ao deixar a terceira linha de fora ("seria a tela mentindo"): as
      duas linhas que ficaram podiam passar a mentir sem um vermelho.

      ⚠️ **E A TERCEIRA LINHA ENTROU** (decisão do dono, 2026-09-24): a caixa
      da esquerda dela carrega uma PALAVRA, não uma tecla, porque o gesto não
      tem tecla — o canvas a desenha assim (`NovaAnotacaoDesktop:111`).
    */
    await renderFreeNote({ path: freeNoteNewPath(BOOK_ID) });

    const shortcuts = pt.pages.freeNote.shortcuts;
    const pairs = Array.from(rail().querySelectorAll('kbd')).map((key) => [
      key.textContent,
      key.nextElementSibling?.textContent,
    ]);
    expect(pairs).toEqual([
      ['/', shortcuts.block],
      ['>', shortcuts.quote],
      [shortcuts.select, shortcuts.highlight],
    ]);

    const text = rail().textContent ?? '';
    expect(text).toContain(shortcuts.heading);
    expect(text).toContain(pt.pages.freeNote.preview.about);
    /*
      ⚠️ **O FILETE ENTRE OS DOIS BLOCOS (`NovaAnotacaoDesktop:105`) — e ele
      está aqui porque um mutante o apagou com a suíte inteira VERDE (M19 da
      47b).** É decoração (`aria-hidden`), mas é a única coisa que separa a
      prévia dos atalhos: sem ele os dois blocos viram um só, e nada no DOM
      muda de texto. É exatamente a classe de defeito que a auditoria da 47a
      nomeou — a suíte guardando a cor e não a FORMA.
    */
    expect(rail().querySelectorAll('[aria-hidden="true"].h-px')).toHaveLength(
      1,
    );
    expectNoGuilt();
  });

  it('⚠️ has NO margin on the note of ANOTHER person — there is no draft to mirror', async () => {
    /*
      Ausente ≠ vazia. A anotação alheia abre em LEITURA (regra 17), e uma
      prévia ali prometeria que o texto dela é o meu. É a mesma decisão que o
      `rail` da tela do livro e o da tela do dia já tomam para os estados sem
      dado.
    */
    await renderFreeNote({
      path: freeNotePath(BOOK_ID, HER_NOTE_ID),
      list: {
        status: 200,
        body: [aNote({ id: HER_NOTE_ID, userId: MARIA })],
      },
    });

    expect(screen.queryByTestId('note-preview')).toBeNull();
    expect(document.querySelector('aside')).toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('has no margin while the note is still loading, nor when the load failed', async () => {
    await renderFreeNote({ book: { status: 404, body: { error: 'x' } } });
    expect(document.querySelector('aside')).toBeNull();
    expectNoGuilt();
  });
});

/**
 * ⚠️ **QUEM ARQUIVA É O AUTOR — a decisão H da Tarefa 47b, com acusador
 * PRÓPRIO.**
 *
 * `Avulsa.dc.html:72` (o gatilho) e `:82` (o diálogo) desenham a tela do
 * AUTOR. O `CLAUDE.md` é literal: *"ninguém edita ou arquiva conteúdo de
 * outra pessoa"*.
 *
 * ⚠️ **POR QUE UM `it()` NOVO, se `opens it in reading mode` já conta os
 * botões da tela.** Aquela asserção é `toHaveLength(0)` sobre TODO botão do
 * `main`: ela acusa, mas acusa "apareceu um botão" — e no dia em que a tela
 * ganhar um botão legítimo na leitura (um "voltar ao acervo", digamos), o
 * conserto natural é afrouxar o número, e o arquivar alheio entra junto sem
 * ninguém ver. Esta nomeia a propriedade: o gatilho de arquivar é do autor.
 */
describe('⚠️ ONLY THE AUTHOR ARCHIVES (decision H)', () => {
  it('gives the archive trigger to MY note and to nobody else’s', async () => {
    await renderFreeNote();
    expect(
      screen.queryByRole('button', { name: pt.pages.freeNote.archive.action }),
    ).not.toBeNull();

    cleanup();

    await renderFreeNote({
      path: freeNotePath(BOOK_ID, HER_NOTE_ID),
      list: {
        status: 200,
        body: [aNote({ id: HER_NOTE_ID, userId: MARIA })],
      },
    });
    expect(
      screen.queryByRole('button', { name: pt.pages.freeNote.archive.action }),
    ).toBeNull();
    // E nem o diálogo, que é o que o gatilho abriria.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(readableText()).not.toContain(pt.pages.freeNote.archive.title);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });
});

/**
 * ============================================================================
 * A BARRA DE CANETAS NA AVULSA (decisão do dono, 2026-09-24)
 * ============================================================================
 *
 * A Tarefa 47b entregou a tela SEM a barra e registrou a ausência como
 * pendência de desenho (nota 2): os dois artboards a desenham em lugares
 * diferentes — `NovaAnotacao.dc.html:72-85` ancorada no fim da janela e
 * `NovaAnotacaoDesktop:77-88` como rodapé da coluna de 680px — e escolher
 * entre eles era decisão de desenho. **O dono escolheu: as duas, que é o que
 * a prop `penBar="fixed"` já significa.**
 *
 * ⚠️⚠️ **O PAR, DOS DOIS LADOS, e este bloco já pagou CINCO vezes por metade
 * de par.** A forma `fixed` não é "só no celular": ela ancora a barra acima
 * do teclado no celular E a devolve ao rodapé da coluna acima de 1120px, por
 * media query. A outra forma, `footer`, é a METADE de desktop sozinha: com
 * ela o celular perde a barra que o `NovaAnotacao.dc.html` desenha. Por isso
 * a asserção é sobre o valor EXATO, e não sobre "tem alguma barra".
 *
 * ⚠️ **A PARTIÇÃO É A DA §7.9.** Quem desenha as classes, e quem prova que
 * a forma `fixed` carrega as duas larguras, é o `RichEditor` — guardado em
 * `packages/ui/src/components/__tests__/pen-bar.test.tsx`, que afirma as
 * duas metades no mesmo `it()`. O que se prova AQUI é o que a TELA decide:
 * qual das três formas ela pede, e em que estado.
 */
describe('⚠️ THE PENS REACH THE STANDALONE NOTE (owner’s decision)', () => {
  function penBarOf(testId: string): string | null {
    return screen.getByTestId(testId).getAttribute('data-pen-bar');
  }

  it('asks for the FIXED bar — the one form that carries both widths', async () => {
    await renderFreeNote({ path: freeNoteNewPath(BOOK_ID) });

    expect(penBarOf('editor')).toBe('fixed');
    /*
      A dica do `/` é a terceira folha de `editor.*` lida pela TELA (o
      `packages/ui` não chama `t()` nenhuma vez). Sem ela o desktop perde a
      frase que o `NovaAnotacaoDesktop:86` põe à direita da barra.
    */
    expect(screen.getByTestId('editor').getAttribute('data-slash-hint')).toBe(
      pt.editor.slashHint,
    );
    expectNoGuilt();
  });

  it('asks for it on the CORRECTION screen too, and NEVER when reading', async () => {
    /*
      ⚠️ **OS DOIS ESTADOS QUE A 47b MEDIU SEPARADO, pelo mesmo motivo do M2:**
      a tela de criar e a de corrigir são dois `return` diferentes do mesmo
      arquivo, e guardar um deles não guarda o outro.

      ⚠️ E o terceiro estado é o oposto: na anotação de OUTRA pessoa a tela
      abre em LEITURA, e uma barra de canetas ali seria affordance de escrita
      sobre o texto que ninguém além da autora pode editar (regra 17).
    */
    await renderFreeNote();
    expect(penBarOf('editor')).toBe('fixed');

    cleanup();

    await renderFreeNote({
      list: {
        status: 200,
        body: [aNote({ id: HER_NOTE_ID, userId: MARIA })],
      },
      path: freeNotePath(BOOK_ID, HER_NOTE_ID),
    });
    expect(penBarOf('reader')).toBe('none');
    expectNoGuilt();
    expectNoPrivacyTalk();
  });
});
