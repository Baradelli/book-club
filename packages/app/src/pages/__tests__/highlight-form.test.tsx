import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { HighlightResponse, NoteDocBody } from '@clube/shared';
import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { pt } from '@clube/shared/locales';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import type { ClubSummary } from '../../club/active-club';
import { acervoPath, highlightNewPath, highlightPath } from '../paths';
import { expectNoPrivacyTalk } from './adr-0002-dom';
import {
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
 * O FORMULÁRIO DO GRIFO — as regras 12 a 20 da Tarefa 25.
 *
 * Entra pelo `<App />` inteiro, como as telas 16 a 20: metade do que a fatia
 * entrega é composição — as duas rotas novas, o `RequireAuth` que as protege, e
 * o `me` do contexto que decide corrigir × recusar.
 *
 * ⚠️ **O EDITOR É UM DUBLÊ, E A PARTIÇÃO É A DA TAREFA 18** (§7.9). O que se
 * prova aqui é o que **a tela** faz com o `onChange`: quando ela manda
 * `commentDoc`, quando ela manda `null`, e quando ela não manda a chave. O que
 * o **editor de verdade** faz — em especial não emitir `onChange` por montar ou
 * por receber um `doc` por prop — é propriedade dele, com três acusadores em
 * `packages/ui/src/components/__tests__/rich-editor.test.tsx`.
 *
 * E o dublê é MAIS exigente que o real: ele tem um botão que emite o `onChange`
 * espúrio (o `doc` que acabou de receber) e um que **esvazia** o documento, que
 * é o caminho do "limpar o comentário" da regra 16.
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

  let keystrokes = 0;

  function FakeRichEditor({
    doc,
    editable = true,
    onChange,
    placeholder,
  }: {
    doc?: Record<string, unknown>;
    editable?: boolean;
    onChange: (doc: Record<string, unknown>) => void;
    placeholder?: string;
    className?: string;
  }) {
    return (
      <div
        data-editable={String(editable)}
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
                onChange(docOf('c'.repeat(keystrokes)));
              }}
              type="button"
            >
              {placeholder}
            </button>
            {/* LIMPAR: o documento volta ao parágrafo em branco — é o gesto de
                "apagar o comentário" da regra 16. */}
            <button
              data-testid="erase"
              onClick={() => onChange(EMPTY)}
              type="button"
            >
              limpar
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
const HIGHLIGHT_ID = 'h-minha';
const HER_HIGHLIGHT_ID = 'h-dela';

/** O `id` que o `meReply()` do harness devolve. Sou eu. */
const MARCOS = 'u-marcos';
const MARIA = 'u-maria';

const YELLOW = '#facc15';
const GREEN = '#22c55e';

function aDoc(text: string): NoteDocBody {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

/** Fixture é factory (§7.7) — o `commentDoc` é uma árvore MUTÁVEL por dentro. */
function aHighlight(
  overrides: Partial<HighlightResponse> = {},
): HighlightResponse {
  return {
    id: HIGHLIGHT_ID,
    clubId: CLUB_ID,
    bookId: BOOK_ID,
    userId: MARCOS,
    // ⚠️ AUSENTE por padrão (Tarefa 38i): o grifo avulso é o caso que o ADR
    // 0004 protege, e quem testa a dimensão de leitura o passa explicitamente.
    planItemId: null,
    quote: 'a porta redonda e verde no meio da colina',
    color: YELLOW,
    page: 9,
    reference: 'Cap. 1',
    commentDoc: aDoc('foi aqui que eu vi a casa da minha avo'),
    commentText: 'foi aqui que eu vi a casa da minha avo',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: '2026-09-04T10:00:00.000Z',
    updatedAt: '2026-09-04T10:00:00.000Z',
    ...overrides,
  };
}

function bookReply(): Reply {
  return {
    status: 200,
    body: {
      book: aBook({ id: BOOK_ID, clubId: CLUB_ID }),
      planItems: [],
      writers: [],
      readers: [],
      inventory: { notes: 0, highlights: 0 },
      lastHighlight: null,
    },
  };
}

/**
 * ⚠️ **O `PATCH` DEVOLVE O GRIFO COMO ELE FICOU, e isto é FIDELIDADE (§7.1),
 * não conveniência.** Um dublê que respondesse a linha ANTIGA faria a tela
 * recalcular a linha de base para trás, e o patch aceito voltaria a parecer
 * pendente. O backend devolve `toHighlightResponse` da linha gravada; o dublê
 * faz o mesmo.
 */
function echoWrite(request: RecordedRequest): Reply {
  const patch = request.body;
  return {
    status: 200,
    body:
      typeof patch === 'object' && patch !== null
        ? { ...aHighlight(), ...patch }
        : aHighlight(),
  };
}

interface FormSetup {
  path?: string;
  book?: Reply;
  /** O acervo — `GET /clubs/:clubId/highlights?bookId=…`. */
  list?: Reply | Responder;
  /** `POST /books/:bookId/highlights`. */
  create?: Reply | Responder;
  /** `PATCH /highlights/:highlightId`. */
  write?: Reply | Responder;
  me?: Reply;
}

/**
 * O shell autenticado inteiro, endpoint por endpoint.
 *
 * ⚠️ A ORDEM importa e cada linha tem um motivo:
 * - a criação (`/books/:bookId/highlights`) vem ANTES de `/books/`, senão o
 *   `POST` cairia na resposta do livro;
 * - `/highlights/` (com barra) é o `PATCH` por id, e não casa
 *   `/clubs/:id/highlights?…`, que é a listagem.
 */
function formResponder(setup: FormSetup): Responder {
  return replyByUrl(
    [
      ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
      ['/me', setup.me ?? meReply({ clubs: [CASAL] })],
      [
        `/books/${BOOK_ID}/highlights`,
        setup.create ?? { status: 201, body: aHighlight({ id: 'h-novo' }) },
      ],
      ['/highlights/', setup.write ?? echoWrite],
      ['/highlights?', setup.list ?? { status: 200, body: [aHighlight()] }],
      ['/books/', setup.book ?? bookReply()],
    ],
    { status: 500, body: { error: 'Internal Server Error' } },
  );
}

/** Descarrega as microtarefas pendentes — a suíte roda com timers FALSOS. */
async function settle(): Promise<void> {
  for (let step = 0; step < 10; step += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderForm(setup: FormSetup = {}): Promise<RecordedRequest[]> {
  const calls = stubFetch(formResponder(setup));

  await act(async () => {
    renderPage(<App />, {
      path: setup.path ?? highlightPath(BOOK_ID, HIGHLIGHT_ID),
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

/** As criações: `POST /books/:bookId/highlights`. */
function creates(calls: readonly RecordedRequest[]): RecordedRequest[] {
  return requestsTo(calls, `/books/${BOOK_ID}/highlights`);
}

/** As correções: `PATCH /highlights/:highlightId`. */
function patches(calls: readonly RecordedRequest[]): RecordedRequest[] {
  return requestsTo(calls, '/highlights/');
}

function locationText(): string {
  return screen.getByTestId('location').textContent ?? '';
}

function screenIsUp(): boolean {
  return screen.queryByRole('heading', { level: 1 }) !== null;
}

function bodyKeys(request: RecordedRequest): string[] {
  return Object.keys(request.body ?? {}).sort();
}

const FIELDS = pt.pages.highlightForm.fields;
const COLORS = pt.pages.highlights.colors;

function formSource(): string {
  return readFileSync(resolve(__dirname, '..', 'highlight-form.tsx'), 'utf8');
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
  VERMELHO.** O `React.lazy` MEMOIZA a promessa do módulo: o `import()`
  acontece uma vez por processo, e o `fallback` do `Suspense` só é observável na
  PRIMEIRA montagem do arquivo.
*/
describe('⚠️ THE EDITOR ARRIVES IN A CHUNK OF ITS OWN (rule 20)', () => {
  it('shows a loading state while the editor chunk is in flight, and the editor after it lands', async () => {
    chunk.hold();
    const calls = await renderForm({ path: highlightNewPath(BOOK_ID) });

    // A TELA já está de pé — o `h1` está lá — e o editor ainda não.
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: pt.pages.highlightForm.newTitle,
      }),
    ).not.toBeNull();
    expect(
      screen.queryByText(pt.pages.highlightForm.editorLoading),
    ).not.toBeNull();
    expect(screen.queryByTestId('editor')).toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();

    await act(async () => {
      chunk.arrive();
    });
    await settle();

    expect(screen.queryByTestId('editor')).not.toBeNull();
    expect(screen.queryByText(pt.pages.highlightForm.editorLoading)).toBeNull();
    // E a chegada do chunk não é motivo para gravar nada.
    expect(creates(calls)).toHaveLength(0);
    expectNoGuilt();
  });
});

describe('⚠️ REGISTERING IS EXPLICIT, AND THE SCREEN REFUSES BEFORE SENDING (rules 12, 13, 14, 19)', () => {
  it('writes NOTHING at all until the button is pressed (rule 19)', async () => {
    /*
      ⚠️ A REGRA QUE IMPEDE UM GRIFO POR TELA ABERTA — a mesma da Tarefa 19,
      com a agravante de `POST` não ser idempotente: cada abertura de tela
      criaria LINHA NOVA no acervo do clube.
    */
    const calls = await renderForm({ path: highlightNewPath(BOOK_ID) });

    await typeInto(FIELDS.quote, 'a porta redonda e verde');
    await press(screen.getByRole('button', { name: COLORS.yellow }));
    await typeInto(FIELDS.page, '9');
    await pressTestId('type');
    // Muito mais que o debounce de qualquer tela deste app.
    await advance(5000);

    expect(creates(calls)).toHaveLength(0);

    // E nem sair da tela cria nada.
    await act(async () => {
      cleanup();
    });
    await settle();
    expect(creates(calls)).toHaveLength(0);
  });

  it('marks the QUOTE and sends nothing when it is empty (rule 12)', async () => {
    const calls = await renderForm({ path: highlightNewPath(BOOK_ID) });

    // Cor escolhida e comentário escrito: é o caso realista de quem começou
    // pelo comentário e esqueceu de copiar o trecho.
    await press(screen.getByRole('button', { name: COLORS.yellow }));
    await pressTestId('type');
    await pressLabel(pt.pages.highlightForm.create);

    expect(creates(calls)).toHaveLength(0);
    expect(screen.queryByText(FIELDS.quoteRequired)).not.toBeNull();
    expect(
      screen.getByLabelText(FIELDS.quote).getAttribute('aria-invalid'),
    ).toBe('true');
    // E a tela continua onde estava, com o que a pessoa escreveu.
    expect(locationText()).toBe(highlightNewPath(BOOK_ID));
    expectNoGuiltBesidesFormError([FIELDS.quoteRequired]);
    expectNoPrivacyTalk();
  });

  it('marks the COLOUR and sends nothing when none was chosen (rule 13)', async () => {
    const calls = await renderForm({ path: highlightNewPath(BOOK_ID) });

    await typeInto(FIELDS.quote, 'a porta redonda e verde');
    await pressLabel(pt.pages.highlightForm.create);

    expect(creates(calls)).toHaveLength(0);
    expect(screen.queryByText(FIELDS.colorRequired)).not.toBeNull();
    expectNoGuiltBesidesFormError([FIELDS.colorRequired]);
    expectNoPrivacyTalk();
  });

  it('offers the FIVE colours of the shared palette, with an accessible active state (rule 13)', async () => {
    await renderForm({ path: highlightNewPath(BOOK_ID) });

    // Os cinco nomes, e nenhum a mais: a paleta é fixa e vem de
    // `@clube/shared` — a tela não inventa cor nem grafia.
    for (const name of Object.values(COLORS)) {
      expect(
        screen.queryByRole('button', { name, pressed: false }),
      ).not.toBeNull();
    }

    await press(screen.getByRole('button', { name: COLORS.green }));

    // ⚠️ O estado ativo NÃO é só a cor: é `aria-pressed`, que o leitor de tela
    // anuncia. Cor como único portador de informação é o defeito invisível.
    expect(
      screen
        .getByRole('button', { name: COLORS.green })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: COLORS.yellow })
        .getAttribute('aria-pressed'),
    ).toBe('false');
    expectNoGuilt();
  });

  it.each([
    ['zero', '0'],
    ['a negative page', '-3'],
    ['a fraction', '45.5'],
    ['a page that is not a number at all', 'nove'],
    ['a page beyond int32', '2147483648'],
  ])(
    '⚠️ refuses %s on the page BEFORE sending anything (rule 14)',
    async (_label, value) => {
      /*
        ⚠️ MEDIDO NA TAREFA 24: o Prisma **trunca** a fração (`page: 45.5` chega
        ao SQL como `45`) e a borda responde 400 por causa do `.int()`; e fora
        do int32 ele **lança**, o que a rota traduz em 400 pelo `.max()`. Nos
        dois casos a pessoa que escreveu descobriria o problema por um 400 em
        inglês, sem lugar na tela para mostrá-lo (§6.2). A tela recusa antes.
      */
      const calls = await renderForm({ path: highlightNewPath(BOOK_ID) });

      await typeInto(FIELDS.quote, 'a porta redonda e verde');
      await press(screen.getByRole('button', { name: COLORS.yellow }));
      await typeInto(FIELDS.page, value);
      await pressLabel(pt.pages.highlightForm.create);

      expect(creates(calls)).toHaveLength(0);
      expect(screen.queryByText(FIELDS.pageInvalid)).not.toBeNull();
      expect(
        screen.getByLabelText(FIELDS.page).getAttribute('aria-invalid'),
      ).toBe('true');
      expectNoGuiltBesidesFormError([FIELDS.pageInvalid]);
    },
  );

  it('accepts page 1 — the boundary the screen must NOT refuse (rule 14)', async () => {
    // O par positivo: sem ele, "recusa tudo" passaria nos cinco casos acima.
    const calls = await renderForm({ path: highlightNewPath(BOOK_ID) });

    await typeInto(FIELDS.quote, 'a porta redonda e verde');
    await press(screen.getByRole('button', { name: COLORS.yellow }));
    await typeInto(FIELDS.page, '1');
    await pressLabel(pt.pages.highlightForm.create);

    expect(creates(calls)).toHaveLength(1);
    expect(requestAt(creates(calls), 0).body).toMatchObject({ page: 1 });
    expect(screen.queryByText(FIELDS.pageInvalid)).toBeNull();
  });
});

describe('⚠️ THE CREATION SENDS ONLY THE FIELDS THAT WERE FILLED (rules 15, 16, 17)', () => {
  it('sends { quote, color } and NOTHING else when nothing else was filled', async () => {
    const calls = await renderForm({ path: highlightNewPath(BOOK_ID) });

    // Espaços em volta do trecho de propósito: o `.trim()` é da borda, e o
    // corpo tem de sair limpo.
    await typeInto(FIELDS.quote, '  a porta redonda e verde  ');
    await press(screen.getByRole('button', { name: COLORS.yellow }));
    await pressLabel(pt.pages.highlightForm.create);

    expect(creates(calls)).toHaveLength(1);
    const write = requestAt(creates(calls), 0);
    expect(write.method).toBe('POST');
    expect(write.url).toBe(`https://api.teste/books/${BOOK_ID}/highlights`);
    /*
      ⚠️ AS CHAVES EXATAS, e não um `toMatchObject`: o `createHighlightSchema` é
      `.strict()`, `commentText` é derivado no backend (ADR 0001) e
      `userId`/`clubId` vêm do JWT e da rota (§6.3). Qualquer chave a mais é
      **400** — e um 400 aqui é a pessoa perdendo o que escreveu.

      REGRAS 15 e 16: página em branco, referência em branco e comentário
      intocado são AUSÊNCIA DE CHAVE, nunca `''` nem `null`.
    */
    expect(bodyKeys(write)).toEqual(['color', 'quote']);
    expect(JSON.stringify(write.body)).toContain(
      '"quote":"a porta redonda e verde"',
    );
    expect(JSON.stringify(write.body)).toContain(`"color":"${YELLOW}"`);
    expect(JSON.stringify(write.body)).not.toContain('commentText');
    expect(JSON.stringify(write.body)).not.toContain('commentDoc');
    expect(JSON.stringify(write.body)).not.toContain(MARCOS);
    expect(JSON.stringify(write.body)).not.toContain(CLUB_ID);
    expect(JSON.stringify(write.body)).not.toContain('status');
    expect(JSON.stringify(write.body)).not.toContain('ACTIVE');

    // E a pessoa volta para a coleção, onde o grifo novo aparece.
    expect(locationText()).toBe(acervoPath(BOOK_ID));
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('sends the page as a NUMBER, the reference trimmed, and the comment', async () => {
    const calls = await renderForm({ path: highlightNewPath(BOOK_ID) });

    await typeInto(FIELDS.quote, 'a porta redonda e verde');
    await press(screen.getByRole('button', { name: COLORS.green }));
    await typeInto(FIELDS.page, '112');
    await typeInto(FIELDS.reference, '  Cap. 12  ');
    await pressTestId('type');
    await pressLabel(pt.pages.highlightForm.create);

    const write = requestAt(creates(calls), 0);
    expect(bodyKeys(write)).toEqual([
      'color',
      'commentDoc',
      'page',
      'quote',
      'reference',
    ]);
    // NÚMERO, não a string do `<input>`: o corpo é JSON e o
    // `createHighlightSchema` é `z.number()` SEM `coerce` — `"112"` seria 400.
    expect(write.body).toMatchObject({ page: 112, color: GREEN });
    expect(JSON.stringify(write.body)).toContain('"reference":"Cap. 12"');
    expect(JSON.stringify(write.body)).toContain('"type":"doc"');
  });

  it('⚠️ sends NO commentDoc when the editor was never touched (rule 16)', async () => {
    /*
      ⚠️ **"NÃO HÁ COMENTÁRIO" ≠ "COMENTÁRIO VAZIO", primeiro sentido.** Abrir o
      formulário e não tocar no editor tem de mandar o corpo SEM a chave — um
      `commentDoc` com o parágrafo em branco gravaria um comentário que existe e
      não diz nada, e o `commentText` derivado dele seria `''`: a tela de
      coleção passaria a renderizar uma área de comentário vazia (regra 6).
    */
    const calls = await renderForm({ path: highlightNewPath(BOOK_ID) });

    await typeInto(FIELDS.quote, 'a porta redonda e verde');
    await press(screen.getByRole('button', { name: COLORS.yellow }));
    await pressLabel(pt.pages.highlightForm.create);

    expect(bodyKeys(requestAt(creates(calls), 0))).toEqual(['color', 'quote']);
  });

  it('⚠️ sends NO commentDoc when the editor was touched and left EMPTY (rule 16)', async () => {
    /*
      A outra metade, e a que só um dublê com "limpar" acusa: quem abre o
      editor, escreve, apaga tudo e salva não escreveu comentário nenhum. Uma
      guarda escrita como "o editor emitiu?" mandaria o documento em branco.
    */
    const calls = await renderForm({ path: highlightNewPath(BOOK_ID) });

    await typeInto(FIELDS.quote, 'a porta redonda e verde');
    await press(screen.getByRole('button', { name: COLORS.yellow }));
    await pressTestId('type');
    await pressTestId('erase');
    await pressLabel(pt.pages.highlightForm.create);

    expect(bodyKeys(requestAt(creates(calls), 0))).toEqual(['color', 'quote']);
  });

  it('keeps the words of the API off the screen when the creation fails (rule 22)', async () => {
    const calls = await renderForm({
      path: highlightNewPath(BOOK_ID),
      create: { status: 500, body: { error: 'Boom: disk is on fire' } },
    });

    await typeInto(FIELDS.quote, 'a porta redonda e verde');
    await press(screen.getByRole('button', { name: COLORS.yellow }));
    await pressLabel(pt.pages.highlightForm.create);

    expect(creates(calls)).toHaveLength(1);
    expect(screenIsUp()).toBe(true);
    // `readableText()` vê texto E atributos que carregam texto (§7.6.1).
    expect(readableText()).not.toContain('Boom');
    expect(readableText()).not.toContain('disk is on fire');
    // E continua na tela de registro, com o que a pessoa escreveu.
    expect(locationText()).toBe(highlightNewPath(BOOK_ID));
    expect(screen.getByLabelText(FIELDS.quote)).toHaveProperty(
      'value',
      'a porta redonda e verde',
    );
    expectNoGuiltBesidesFormError([pt.pages.highlightForm.failed]);
  });
});

describe('⚠️ OPENING THE CORRECTION AND CHANGING NOTHING SENDS NO PATCH (rule 18)', () => {
  it('loads the highlight, fills every field, and writes nothing', async () => {
    const calls = await renderForm();

    expect(screen.getByLabelText(FIELDS.quote)).toHaveProperty(
      'value',
      'a porta redonda e verde no meio da colina',
    );
    expect(screen.getByLabelText(FIELDS.page)).toHaveProperty('value', '9');
    expect(screen.getByLabelText(FIELDS.reference)).toHaveProperty(
      'value',
      'Cap. 1',
    );
    expect(
      screen
        .getByRole('button', { name: COLORS.yellow })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByTestId('editor-text').textContent).toBe(
      'foi aqui que eu vi a casa da minha avo',
    );

    await pressLabel(pt.pages.highlightForm.save);

    // ⚠️ NENHUM `PATCH`: o patch é COMPARAÇÃO com a versão que o servidor
    // confirmou, e um patch vazio não vira requisição. Sem isso, abrir e
    // fechar a tela gastaria um `UPDATE` e um `updatedAt` novo por visita.
    expect(patches(calls)).toHaveLength(0);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('sends no patch when the editor emits the very doc it just received', async () => {
    // O `onChange` ESPÚRIO. A Tarefa 14 achou DOIS caminhos que o produzem no
    // TipTap; esta é a segunda guarda, na tela.
    const calls = await renderForm();

    await pressTestId('echo');
    await pressLabel(pt.pages.highlightForm.save);

    expect(patches(calls)).toHaveLength(0);
  });

  it('sends no patch when the person retypes exactly what was already there', async () => {
    const calls = await renderForm();

    await typeInto(FIELDS.quote, 'outra coisa');
    await typeInto(FIELDS.quote, 'a porta redonda e verde no meio da colina');
    await pressLabel(pt.pages.highlightForm.save);

    expect(patches(calls)).toHaveLength(0);
  });
});

describe('the correction sends ONLY what changed (rule 18)', () => {
  it('sends { quote } when only the quote changed', async () => {
    const calls = await renderForm();

    await typeInto(FIELDS.quote, 'a porta redonda e VERDE na colina');
    await pressLabel(pt.pages.highlightForm.save);

    expect(patches(calls)).toHaveLength(1);
    const write = requestAt(patches(calls), 0);
    expect(write.method).toBe('PATCH');
    expect(write.url).toBe(`https://api.teste/highlights/${HIGHLIGHT_ID}`);
    expect(bodyKeys(write)).toEqual(['quote']);
    expect(locationText()).toBe(acervoPath(BOOK_ID));
  });

  it('sends { color } when only the pen changed', async () => {
    const calls = await renderForm();

    await press(screen.getByRole('button', { name: COLORS.green }));
    await pressLabel(pt.pages.highlightForm.save);

    expect(bodyKeys(requestAt(patches(calls), 0))).toEqual(['color']);
    expect(requestAt(patches(calls), 0).body).toEqual({ color: GREEN });
  });

  it('sends { page } as a number when only the page changed', async () => {
    const calls = await renderForm();

    await typeInto(FIELDS.page, '58');
    await pressLabel(pt.pages.highlightForm.save);

    expect(requestAt(patches(calls), 0).body).toEqual({ page: 58 });
  });

  it('sends page: null when the page is CLEARED, not an empty string', async () => {
    /*
      ⚠️ AUSENTE × `null` É A DISTINÇÃO DO `editHighlightSchema`: ausente não
      mexe, `null` LIMPA. Mandar `''` nem é aceito (o campo é `z.number()`), e
      mandar a chave ausente deixaria a página velha lá.
    */
    const calls = await renderForm();

    await typeInto(FIELDS.page, '');
    await pressLabel(pt.pages.highlightForm.save);

    expect(requestAt(patches(calls), 0).body).toEqual({ page: null });
  });

  it('sends reference: null when the reference is CLEARED', async () => {
    const calls = await renderForm();

    await typeInto(FIELDS.reference, '   ');
    await pressLabel(pt.pages.highlightForm.save);

    expect(requestAt(patches(calls), 0).body).toEqual({ reference: null });
  });

  it('sends the four fields together when the four changed', async () => {
    const calls = await renderForm();

    await typeInto(FIELDS.quote, 'outro trecho');
    await press(screen.getByRole('button', { name: COLORS.green }));
    await typeInto(FIELDS.page, '58');
    await typeInto(FIELDS.reference, 'Cap. 5');
    await pressTestId('type');
    await pressLabel(pt.pages.highlightForm.save);

    // UMA requisição com as cinco chaves, e não cinco requisições.
    expect(patches(calls)).toHaveLength(1);
    expect(bodyKeys(requestAt(patches(calls), 0))).toEqual([
      'color',
      'commentDoc',
      'page',
      'quote',
      'reference',
    ]);
  });
});

describe('⚠️ THE COMMENT DISTINGUISHES "THERE IS NONE" FROM "IT IS EMPTY" (rule 16)', () => {
  it('does NOT touch the comment when the editor was never touched', async () => {
    const calls = await renderForm();

    await typeInto(FIELDS.quote, 'outro trecho');
    await pressLabel(pt.pages.highlightForm.save);

    // A chave nem aparece: ausente é "não mexa", e o comentário continua o que
    // era no servidor.
    expect(bodyKeys(requestAt(patches(calls), 0))).toEqual(['quote']);
  });

  it('⚠️ sends commentDoc: null when the comment is CLEARED', async () => {
    /*
      ⚠️ O SEGUNDO SENTIDO DA REGRA 16, e é o que zera o `commentText` no
      servidor (regra 6 da Tarefa 22). Mandar o documento em branco em vez de
      `null` gravaria um comentário que existe e não diz nada — e a coleção
      passaria a mostrar uma área de comentário vazia.
    */
    const calls = await renderForm();

    await pressTestId('erase');
    await pressLabel(pt.pages.highlightForm.save);

    expect(patches(calls)).toHaveLength(1);
    expect(requestAt(patches(calls), 0).body).toEqual({ commentDoc: null });
  });

  it('sends the document when the comment is WRITTEN', async () => {
    const calls = await renderForm();

    await pressTestId('type');
    await pressLabel(pt.pages.highlightForm.save);

    expect(bodyKeys(requestAt(patches(calls), 0))).toEqual(['commentDoc']);
    expect(JSON.stringify(requestAt(patches(calls), 0).body)).toContain(
      '"type":"doc"',
    );
  });

  it('sends NOTHING when a highlight that had NO comment is opened and left alone', async () => {
    // O caso simétrico: o grifo já não tinha comentário, e o editor abriu
    // vazio. "Limpar o que já estava limpo" não é uma mudança.
    const calls = await renderForm({
      list: {
        status: 200,
        body: [aHighlight({ commentDoc: null, commentText: '' })],
      },
    });

    await pressTestId('erase');
    await pressLabel(pt.pages.highlightForm.save);

    expect(patches(calls)).toHaveLength(0);
  });
});

describe('⚠️ THE HIGHLIGHT OF ANOTHER PERSON HAS NO AFFORDANCE AT ALL (rule 9)', () => {
  it('refuses the correction by AUTHORSHIP, never by visibility', async () => {
    /*
      ADR 0002: o trecho dela está na COLEÇÃO, inteiro, porque dentro do clube
      não existe conteúdo privado. O que não existe é corrigir o que o outro
      escreveu — e isso é AUTORIA. A frase da recusa não pode falar de
      privacidade, e o `expectNoPrivacyTalk` é o acusador.
    */
    const calls = await renderForm({
      path: highlightPath(BOOK_ID, HER_HIGHLIGHT_ID),
      list: {
        status: 200,
        body: [aHighlight({ id: HER_HIGHLIGHT_ID, userId: MARIA })],
      },
    });

    expect(screenIsUp()).toBe(true);
    expect(screen.queryByText(pt.pages.highlightForm.notYours)).not.toBeNull();

    // Nenhum controle de escrita: nem campo, nem chip de cor, nem salvar, nem
    // editor.
    const main = screen.getByRole('main');
    expect(main.querySelectorAll('input, textarea')).toHaveLength(0);
    expect(main.querySelectorAll('button')).toHaveLength(0);
    expect(screen.queryByTestId('editor')).toBeNull();
    // Só a saída: o caminho de volta para a coleção, pelo `Link` do roteador.
    const back = screen.getByRole('link', {
      name: pt.pages.highlightForm.backToList,
    });
    expect(back.getAttribute('href')).toBe(acervoPath(BOOK_ID));
    expect(patches(calls)).toHaveLength(0);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });
});

describe('the form when the address points at nothing (rules 21, 22)', () => {
  it('has a state of its own when the highlight is not in the collection', async () => {
    const calls = await renderForm({ list: { status: 200, body: [] } });

    expect(screenIsUp()).toBe(true);
    expect(
      screen.queryByText(pt.pages.highlightForm.highlightUnavailable),
    ).not.toBeNull();
    expect(patches(calls)).toHaveLength(0);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('has its own words for a 404 on the book, and no pointless retry', async () => {
    await renderForm({ book: { status: 404, body: { error: 'Not Found' } } });

    expect(screenIsUp()).toBe(true);
    expect(
      screen.queryByText(pt.pages.highlightForm.bookUnavailable),
    ).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: pt.pages.highlightForm.retry }),
    ).toBeNull();
    expect(readableText()).not.toContain('Not Found');
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('offers to repeat a load that failed, and the repeat REDOES it', async () => {
    let attempts = 0;
    const calls = await renderForm({
      list: () => {
        attempts += 1;
        return attempts === 1
          ? { status: 500, body: { error: 'Boom' } }
          : { status: 200, body: [aHighlight()] };
      },
    });

    expect(
      screen.queryByRole('button', { name: pt.pages.highlightForm.retry }),
    ).not.toBeNull();
    expect(readableText()).not.toContain('Boom');

    await pressLabel(pt.pages.highlightForm.retry);

    expect(requestsTo(calls, '/highlights?')).toHaveLength(2);
    expect(screen.getByLabelText(FIELDS.quote)).toHaveProperty(
      'value',
      'a porta redonda e verde no meio da colina',
    );
    expectNoGuilt();
  });

  it('does not guess who I am when the /me failed', async () => {
    /*
      ⚠️ A ARMADILHA NOMEADA DA TAREFA 18: `me` é `null` fora do `ready`. Uma
      tela que tratasse isso como "não sou ninguém" recusaria a correção do MEU
      grifo, em silêncio, com uma frase sobre autoria.
    */
    const calls = await renderForm({
      me: { status: 500, body: { error: 'Boom' } },
    });

    expect(screenIsUp()).toBe(true);
    expect(requestsTo(calls, '/books/')).toHaveLength(0);
    expect(requestsTo(calls, '/highlights')).toHaveLength(0);
    expect(screen.queryByText(pt.pages.highlightForm.notYours)).toBeNull();
    expect(
      screen.queryByRole('button', { name: pt.pages.highlightForm.retry }),
    ).not.toBeNull();
    expect(readableText()).not.toContain('Boom');
    expectNoGuilt();
  });

  it('keeps the words of the API off the screen when the correction fails', async () => {
    await renderForm({
      write: { status: 403, body: { error: 'Forbidden' } },
    });

    await typeInto(FIELDS.quote, 'outro trecho');
    await pressLabel(pt.pages.highlightForm.save);

    expect(screen.queryByText(pt.pages.highlightForm.failed)).not.toBeNull();
    expect(readableText()).not.toContain('Forbidden');
    // O que a pessoa escreveu continua na tela.
    expect(screen.getByLabelText(FIELDS.quote)).toHaveProperty(
      'value',
      'outro trecho',
    );
    expect(locationText()).toBe(highlightPath(BOOK_ID, HIGHLIGHT_ID));
    expectNoGuiltBesidesFormError([pt.pages.highlightForm.failed]);
  });
});

describe('the source of the form (rules 20, 21)', () => {
  it('⚠️ imports the editor DYNAMICALLY, so the first load stays without TipTap', () => {
    /*
      O acusador de verdade é o `__tests__/bundle-guard.test.ts`, que COMPILA o
      app e recusa qualquer marca de `tiptap`/`prosemirror` no chunk de
      ENTRADA — este teste é o ponteiro que diz onde procurar quando aquele
      ficar vermelho, e ele pina a FORMA: `lazy(() => import(...))`, nunca um
      `import` estático no topo.
    */
    const source = stripComments(formSource());

    expect(source).toContain("import('@clube/ui/editor')");
    expect(source).toContain('lazy(');
    expect(source).not.toMatch(/^import .*@clube\/ui\/editor/mu);
    expect(source).not.toContain('@tiptap');
  });
});

/**
 * ============================================================================
 * O PAPEL GRIFADO (Tarefa 47a) — decisões A a F
 * ============================================================================
 *
 * ⚠️ **A TABELA ABAIXO É UMA CÓPIA DELIBERADA do mapa de produção**, e é o que
 * torna o mutante da regra 2 vermelho: um teste que lesse o mapa da tela
 * provaria que a tela concorda consigo mesma, e concordância consigo mesmo é
 * exatamente o que um mutante de uma linha preserva (§7.8, virada do avesso —
 * aqui os dois lados NÃO podem ser calculados pelo mesmo código).
 *
 * A ordem é a de `HIGHLIGHT_COLORS`: amarelo, verde, laranja, azul, rosa.
 */
const PENS = [
  {
    dot: 'bg-pen-a-dot',
    edge: 'border-pen-a-dot',
    ink: 'text-pen-a-dot',
    name: COLORS.yellow,
    paper: 'bg-pen-a',
  },
  {
    dot: 'bg-pen-v-dot',
    edge: 'border-pen-v-dot',
    ink: 'text-pen-v-dot',
    name: COLORS.green,
    paper: 'bg-pen-v',
  },
  {
    dot: 'bg-pen-l-dot',
    edge: 'border-pen-l-dot',
    ink: 'text-pen-l-dot',
    name: COLORS.orange,
    paper: 'bg-pen-l',
  },
  {
    dot: 'bg-pen-z-dot',
    edge: 'border-pen-z-dot',
    ink: 'text-pen-z-dot',
    name: COLORS.blue,
    paper: 'bg-pen-z',
  },
  {
    dot: 'bg-pen-r-dot',
    edge: 'border-pen-r-dot',
    ink: 'text-pen-r-dot',
    name: COLORS.pink,
    paper: 'bg-pen-r',
  },
];

/**
 * ⚠️ **AS CLASSES SÃO LIDAS POR TOKEN, NUNCA POR `toContain` DE SUBSTRING.**
 *
 * A Tarefa 45 mediu que a regex de fronteira acerta 6 de 13 variantes, e a 46
 * achou a mesma forma frágil copiada para outra tela. Aqui o defeito seria
 * ainda mais barato: `toContain('border-pen-a-dot')` casa dentro de
 * `hover:border-pen-a-dot`, e `toContain('bg-pen-a')` casa dentro de
 * `bg-pen-a-dot` — ou seja, a bolinha passaria por papel.
 */
function tokensOf(element: Element): string[] {
  return (element.getAttribute('class') ?? '')
    .split(/\s+/u)
    .filter((token) => token !== '');
}

/** O papel do trecho e as suas partes, a partir do controle que o rótulo nomeia. */
function paperParts(): { mark: Element; paper: Element } {
  const control = screen.getByLabelText(FIELDS.quote);
  const paper = control.parentElement;
  if (paper === null) throw new Error('o papel do trecho saiu do DOM');
  const mark = paper.firstElementChild;
  if (mark === null) throw new Error('a aspa do papel saiu do DOM');
  return { mark, paper };
}

function penButton(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

/** A bolinha de cada pílula — a amostra que o `PenPill` desenha à mão. */
function penDot(name: string): Element {
  const dot = penButton(name).firstElementChild;
  if (dot === null) throw new Error('a bolinha da pílula saiu do DOM');
  return dot;
}

/** O `<textarea>` do trecho, que é quem carrega a altura e o degrau de leitura. */
function quoteControl(): HTMLElement {
  return screen.getByLabelText(FIELDS.quote);
}

/**
 * O número de pixels de um utilitário de valor arbitrário (`pl-[34px]` → 34).
 *
 * ⚠️ **LER O NÚMERO É O QUE PERMITE ASSERTAR UMA RELAÇÃO em vez de copiar uma
 * string.** `toContain('pl-[34px]')` prova que alguém escreveu aquele texto;
 * `esquerda > direita` prova a propriedade que o desenho quer — que há recuo
 * para a aspa caber. A segunda continua verdadeira se o canvas mudar de 34
 * para 36, e continua FALSA no mutante que iguala os dois lados.
 */
function pxOf(tokens: readonly string[], prefix: string): number {
  const token = tokens.find((candidate) => candidate.startsWith(`${prefix}-[`));
  if (token === undefined) {
    throw new Error(`o elemento não escreve nenhum "${prefix}" em pixels`);
  }
  const digits = /-\[(\d+(?:\.\d+)?)px\]$/u.exec(token)?.[1];
  if (digits === undefined) throw new Error(`"${token}" não é um valor em px`);
  return Number(digits);
}

/** A pintura dos três elementos, numa string só — para comparar cinco delas. */
function painting(): string {
  const { mark, paper } = paperParts();
  return `${tokensOf(paper).join(' ')} || ${tokensOf(mark).join(' ')}`;
}

describe('⚠️⚠️ THE QUOTE FIELD *IS* THE HIGHLIGHTED PAPER, AND IT REPAINTS (decision A)', () => {
  it('⚠️ paints the paper, its edge AND the quote mark with the pen that was chosen — all five', async () => {
    /*
      ⚠️ **O MUTANTE DESTA FATIA:** fixar a caneta em `a` na tela (fundo, borda
      e aspa) tem de ficar vermelho aqui. É o mesmo mutante que a Tarefa 44b
      exigiu para o bloco "Último grifo", e lá ele pegou.

      Os TRÊS elementos entram porque são três lugares onde a cor pode divergir
      sem que nenhum outro teste veja: a cor do papel vem do par `--pen-x`, a da
      borda e a da aspa vêm do par `--pen-x-dot`.
    */
    await renderForm({ path: highlightNewPath(BOOK_ID) });

    for (const pen of PENS) {
      await press(penButton(pen.name));

      const { mark, paper } = paperParts();
      expect(tokensOf(paper)).toContain(pen.paper);
      expect(tokensOf(paper)).toContain(pen.edge);
      /*
        ⚠️ **COR SEM LARGURA NÃO É FILETE — e esta linha nasceu de um mutante
        que sobreviveu a 975 testes** (rodada de correção da 47a). Apagar o
        utilitário de largura da classe do papel, deixando só o de cor, faz a
        borda ir a **zero** em produção: some nos dois temas, nas cinco
        canetas, e o nome deste teste (`its edge`) continuava jurando que ela
        estava guardada. É o §7.9 literal — o nome do teste é parte da guarda.

        O par negativo fecha a outra ponta: a largura declarada para não ser
        nenhuma também é filete que não existe.
      */
      expect(tokensOf(paper)).toContain('border');
      expect(tokensOf(paper)).not.toContain('border-0');
      expect(tokensOf(mark)).toContain(pen.ink);
      expectNoGuilt();
    }
  });

  it('⚠️ gives the five pens FIVE different paintings — the other half of the pair', async () => {
    /*
      Sem esta metade, um mapa que devolvesse a mesma classe para as cinco
      canetas passaria no teste acima em uma delas e seria "verde o bastante".

      ⚠️⚠️ **MAS ESTE TESTE SOZINHO NÃO PEGA ESSE MAPA — e a correção morava só
      no relatório, que não viaja com o código.** Medido por mutação: com as
      cinco canetas compartilhando **um** preenchimento, o filete e a aspa
      continuam divergindo, o conjunto das pinturas continua com cinco
      elementos e este `it` fica **verde**. Quem o mata é o mutante que fixa os
      **três** elementos na mesma caneta.

      Ou seja: a "outra metade do par" é do par inteiro, não de cada elemento.
      Se um dia esta comparação passar a olhar um elemento só, ela deixa de
      provar o que o nome dela diz.
    */
    await renderForm({ path: highlightNewPath(BOOK_ID) });

    const paintings: string[] = [];
    for (const pen of PENS) {
      await press(penButton(pen.name));
      paintings.push(painting());
    }

    expect(new Set(paintings).size).toBe(PENS.length);
  });

  it('⚠️ leaves the paper NEUTRAL while no pen has been chosen', async () => {
    /*
      O registro começa sem cor (a cor é obrigatória, regra 13), e papel
      grifado de caneta nenhuma seria uma cor inventada. Enquanto não há
      caneta, o campo é superfície e filete — e NENHUMA classe de caneta.
    */
    await renderForm({ path: highlightNewPath(BOOK_ID) });

    const { mark, paper } = paperParts();
    expect(tokensOf(paper)).toContain('bg-surface');
    expect(tokensOf(paper)).toContain('border-line');
    // Largura, não só cor — a mesma lição do mutante que sobreviveu acima.
    expect(tokensOf(paper)).toContain('border');
    expect(tokensOf(paper)).not.toContain('border-0');
    for (const token of [...tokensOf(paper), ...tokensOf(mark)]) {
      expect(token.startsWith('bg-pen-')).toBe(false);
      expect(token.startsWith('border-pen-')).toBe(false);
      expect(token.startsWith('text-pen-')).toBe(false);
    }
    expectNoGuilt();
  });

  it('⚠️ repaints the paper on the CORRECTION screen too, from the pen the highlight was saved with', async () => {
    // A tela de correção chega COM caneta — e o canvas a desenha igual
    // (`CorrigirGrifo.dc.html:50-52`).
    await renderForm({ list: { status: 200, body: [aHighlight()] } });

    const yellow = PENS[0];
    const green = PENS[1];
    if (yellow === undefined || green === undefined) throw new Error('paleta');

    expect(tokensOf(paperParts().paper)).toContain(yellow.paper);

    await press(penButton(green.name));

    const { mark, paper } = paperParts();
    expect(tokensOf(paper)).toContain(green.paper);
    expect(tokensOf(paper)).toContain(green.edge);
    expect(tokensOf(mark)).toContain(green.ink);
    expect(tokensOf(paper)).not.toContain(yellow.paper);
    expectNoGuilt();
  });
});

describe('⚠️ THE PAPER KEEPS THE WIRING THAT THE `Field` USED TO DO FOR IT', () => {
  /*
    ⚠️ **ESTE BLOCO EXISTE PORQUE A FATIA 47a TIROU O CAMPO DO `Field`** — o
    canvas quer o rótulo dourado e a dica na MESMA linha, alinhada pela base, e
    o `Field` não expõe nenhuma das duas coisas por prop. A fiação foi refeita à
    mão, e fiação de acessibilidade é o que quebra em SILÊNCIO: um
    `aria-describedby` apontando para um id que não existe não muda um pixel na
    tela e simplesmente não anuncia nada.
  */
  it('points the quote at its hint, and at the error only when there IS one, in that order', async () => {
    const calls = await renderForm({ path: highlightNewPath(BOOK_ID) });

    const control = screen.getByLabelText(FIELDS.quote);
    const hint = screen.getByText(FIELDS.quoteHint);
    expect(control.getAttribute('aria-describedby')).toBe(hint.id);
    // REGRA 13 da Tarefa 13: sem erro NÃO existe o atributo.
    expect(control.getAttribute('aria-invalid')).toBeNull();

    await pressLabel(pt.pages.highlightForm.create);

    expect(creates(calls)).toHaveLength(0);
    const described = control.getAttribute('aria-describedby') ?? '';
    const message = screen.getByText(FIELDS.quoteRequired);
    // A ordem é a do GOV.UK Design System: a dica é o contexto estável e vem
    // primeiro, a correção fecha a fala.
    expect(described.split(' ')).toEqual([hint.id, message.id]);
    expect(control.getAttribute('aria-invalid')).toBe('true');
    expectNoGuiltBesidesFormError([FIELDS.quoteRequired, FIELDS.colorRequired]);
  });

  it('⚠️ keeps the paper painted while the CORRECTION screen shows a validation error', async () => {
    /*
      O estado que só existe depois desta fatia: o campo em erro é o PAPEL, e o
      vermelho do formulário passa a conviver com o fundo da caneta. A varredura
      estreitada exige que os elementos vermelhos da tela sejam EXATAMENTE a
      mensagem esperada — um ponto vermelho novo em qualquer outro lugar acusa.
    */
    const calls = await renderForm({
      list: { status: 200, body: [aHighlight()] },
    });

    await typeInto(FIELDS.quote, '   ');
    await pressLabel(pt.pages.highlightForm.save);

    expect(patches(calls)).toHaveLength(0);
    const pen = PENS[0];
    if (pen === undefined) throw new Error('paleta');
    expect(tokensOf(paperParts().paper)).toContain(pen.paper);
    expectNoGuiltBesidesFormError([FIELDS.quoteRequired]);
  });
});

describe('⚠️ THE HANGING SERIF QUOTE IS A CHARACTER, AND IT IS DECORATION (decision B)', () => {
  it('hangs the quote mark as TEXT, never as a drawing, and hides it from the screen reader', async () => {
    /*
      ⚠️ O código do caractere é montado POR NÚMERO (`0x201c`,
      LEFT DOUBLE QUOTATION MARK) e não colado como glifo: um teste que
      carregasse o próprio glifo casaria também um aspas-reto ou um sósia
      visualmente idêntico vindo de outro bloco Unicode.

      `<svg>` inline já é proibido em toda tela do app
      (`adr-0002-iconography.test.ts`); o que esta guarda acrescenta é que a
      aspa é DECORAÇÃO — o texto ao lado já diz tudo, e um leitor de tela que a
      anunciasse leria uma aspa antes de cada trecho.
    */
    await renderForm({ path: highlightNewPath(BOOK_ID) });

    const { mark } = paperParts();
    expect(mark.textContent).toBe(String.fromCodePoint(0x20_1c));
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(tokensOf(mark)).toContain('font-quote');
    expectNoGuilt();
  });
});

describe('⚠️ THE FIELD LABEL IS GOLD AND THE PEN LEGEND IS MUTED — ON PURPOSE (decision D)', () => {
  /*
    ⚠️ **ACUSADOR NOS DOIS SENTIDOS.** São duas cores diferentes de propósito, e
    uniformizar é o erro fácil: o rótulo dourado marca **o campo que é o papel**
    (`NovoGrifo.dc.html:48`), e a legenda das canetas é neutra como todo rótulo
    de seção (`:58`). Um mutante em qualquer das duas direções fica vermelho.
  */
  it('paints the label of the paper with the gold of "this is the one"', async () => {
    /*
      ⚠️ `text-gold-strong` E NÃO `text-gold`, contra o canvas — e a guarda que
      manda isso já existia: `__tests__/theme-tokens.test.ts › refuses the FIRST
      USE of text-gold` ficou VERMELHA nesta fatia, com a primeira versão do
      rótulo. `--gold` dá 4,16 / 4,31 / 3,97 contra as três superfícies no tema
      claro, e o rótulo tem 10px — piso de 4,5:1, reprovado nas três. Quem
      carrega a conta é o `Eyebrow`, e é ele que a tela escreve.
    */
    await renderForm({ path: highlightNewPath(BOOK_ID) });

    const label = screen.getByText(FIELDS.quote);
    expect(tokensOf(label)).toContain('text-gold-strong');
    expect(tokensOf(label)).not.toContain('text-muted');
  });

  it('keeps the legend of the pens NEUTRAL, and it is not the gold one', async () => {
    await renderForm({ path: highlightNewPath(BOOK_ID) });

    const legend = screen.getByText(FIELDS.color);
    expect(tokensOf(legend)).toContain('text-muted');
    expect(tokensOf(legend)).not.toContain('text-gold-strong');
  });
});

describe('⚠️ THE FIVE PENS ARE 44px PILLS, AND THE CHOSEN ONE IS TELLABLE WITHOUT COLOUR (decision E)', () => {
  it('gives every pen the 44px touch floor', async () => {
    // §A.3 do briefing: alvo de 44px com foco sempre visível. `min-h-11` é a
    // única ponte classe→px do projeto, e ela está ancorada no CSS compilado
    // por `__tests__/ui-source-scan.test.ts`.
    await renderForm({ path: highlightNewPath(BOOK_ID) });

    for (const pen of PENS) {
      expect(tokensOf(penButton(pen.name))).toContain('min-h-11');
    }
  });

  it('⚠️ tells the chosen pen apart by the WIDTH of its border, not only by colour', async () => {
    /*
      ⚠️ A MESMA REGRA QUE O `PresenceMark` CUMPRE NA 44 E O `StreakSeal` NA 45:
      cor como único portador de informação é o defeito que ninguém vê olhando a
      tela — e que some inteiro num monitor em escala de cinza.

      A diferença de FORMA é a borda: a escolhida tem uma borda mais grossa que
      as outras (o canvas desenha 1,5px contra 1px). O `aria-pressed` cobre o
      leitor de tela; isto cobre quem enxerga sem distinguir cor.
    */
    await renderForm({ path: highlightNewPath(BOOK_ID) });

    const chosen = PENS[1];
    if (chosen === undefined) throw new Error('paleta');
    await press(penButton(chosen.name));

    const thick = 'border-[1.5px]';
    expect(tokensOf(penButton(chosen.name))).toContain(thick);
    expect(tokensOf(penButton(chosen.name))).not.toContain('border');

    for (const pen of PENS.filter((candidate) => candidate !== chosen)) {
      expect(tokensOf(penButton(pen.name))).toContain('border');
      expect(tokensOf(penButton(pen.name))).not.toContain(thick);
    }
    expectNoGuilt();
  });
});

/**
 * ============================================================================
 * ⚠️⚠️ A PINTURA TEM DE EXISTIR, E NÃO SÓ SER DA CANETA CERTA
 * ============================================================================
 *
 * **Rodada de correção da Tarefa 47a, e o veredito que a abriu:** *"a suíte
 * guarda COR e não guarda FORMA"*. Os dezesseis mutantes da primeira entrega
 * atacavam todos o mesmo eixo — **qual caneta pinta o quê** — e a auditoria
 * achou **seis sobreviventes em oito tentativas** no eixo que faltava: **se a
 * pintura existe**. Largura do filete, canto da aspa, assimetria do recuo,
 * bolinha por caneta, altura do papel, degrau do texto.
 *
 * É a forma mais barata de falso verde deste arquivo, porque o eixo coberto
 * **parece** cobrir o vizinho: o teste que afirma a tinta do filete lê como se
 * guardasse o filete, quando guarda só a cor dele. Cada `it` abaixo nomeia o
 * mutante que o prova.
 */
describe('⚠️ THE PAPER HAS A SHAPE, NOT ONLY A COLOUR (rodada de correção da 47a)', () => {
  it('⚠️ cuts the recess for the quote mark on the LEFT ONLY — a symmetric padding drops it on the text', async () => {
    /*
      **Mutante N3:** o recuo esquerdo do papel vira igual ao direito. A aspa
      é posicionada em absoluto no canto superior esquerdo e não empurra nada:
      o recuo é a ÚNICA coisa que impede o trecho de começar debaixo dela.
      Nenhum dos dezesseis mutantes originais o tocava.
    */
    await renderForm({ path: highlightNewPath(BOOK_ID) });

    const tokens = tokensOf(paperParts().paper);
    const left = pxOf(tokens, 'pl');
    const right = pxOf(tokens, 'pr');

    expect(right).toBe(18);
    expect(left).toBe(34);
    // A propriedade, que sobrevive a uma mudança de canvas: há recuo a MAIS do
    // lado da aspa, e a sobra é maior que a distância dela à borda (10px).
    expect(left - right).toBeGreaterThan(10);
  });

  it('⚠️ hangs the quote mark in the TOP LEFT corner, over the recess that was cut for it', async () => {
    /*
      **Mutante N1:** a aspa migra para o canto oposto (direita/baixo). Ela
      continuaria com a tinta da caneta, continuaria escondida do leitor de
      tela, continuaria sendo o caractere certo — e os três testes da decisão B
      continuariam verdes, com a aspa cobrindo o FIM do trecho.
    */
    await renderForm({ path: highlightNewPath(BOOK_ID) });

    const tokens = tokensOf(paperParts().mark);
    expect(tokens).toContain('absolute');
    expect(tokens).toContain('left-2.5');
    expect(tokens).toContain('top-2');
    // E o canto oposto fica vazio: uma âncora à direita ou embaixo venceria o
    // par acima sem apagá-lo, porque os quatro lados convivem na mesma classe.
    for (const token of tokens) {
      expect(token.startsWith('right-')).toBe(false);
      expect(token.startsWith('bottom-')).toBe(false);
    }
  });

  it('⚠️ gives the paper the height the canvas asks for, and puts it on the TEXTAREA (114 + 18 + 18 = 150)', async () => {
    /*
      **Mutante N7:** o campo de texto perde a altura mínima. O docblock do
      `QuoteField` dedica um parágrafo a esta conta — "escrever os dois números
      seria dar dois donos à mesma medida" — e a conta não tinha guarda
      nenhuma: o papel virava uma tira de uma linha e todo teste de cor passava.

      Aritmética declarada sem guarda é a classe que a Tarefa 44 pagou três
      vezes.
    */
    await renderForm({ path: highlightNewPath(BOOK_ID) });

    const paperTokens = tokensOf(paperParts().paper);
    const inner = pxOf(tokensOf(quoteControl()), 'min-h');
    const vertical = pxOf(paperTokens, 'py');

    expect(inner).toBe(114);
    expect(vertical).toBe(18);
    expect(inner + vertical * 2).toBe(150);
  });

  it('⚠️ sets the quote at the READING step, not at the interface step', async () => {
    /*
      **Mutante N8:** o degrau de leitura vira o degrau de interface. O 17 do
      canvas → 17,5 do degrau de leitura está listado na Definição de pronto
      como **divergência declarada** — e divergência declarada sem guarda volta
      sozinha, na primeira vez que alguém "uniformiza os tamanhos da tela".

      A serifa entra junto porque as duas são a mesma decisão: o trecho é
      texto de LEITURA (Fraunces, no canvas), não rótulo de formulário.
    */
    await renderForm({ path: highlightNewPath(BOOK_ID) });

    const tokens = tokensOf(quoteControl());
    expect(tokens).toContain('text-reading');
    expect(tokens).toContain('font-reading');
    expect(tokens).not.toContain('text-sm');
    expect(tokens).not.toContain('text-base');
  });

  it('⚠️ gives each pen pill ITS OWN dot — five pills, five dots', async () => {
    /*
      **Mutante N5, e ele é REGRESSÃO DE COBERTURA:** até esta fatia a amostra
      de cor era o `ColorSwatch` de `packages/ui`, com guardas próprias no
      acervo e na busca. A pílula passou a desenhá-la à mão — e nada olhava
      para ela. Fixar a bolinha das cinco na primeira caneta deixava a paleta
      com cinco pílulas idênticas e a suíte inteira verde.

      A segunda metade (cinco bolinhas DIFERENTES) é o par do §7.9 que este
      arquivo já paga em toda propriedade de mapa: sem ela, um mapa que
      devolvesse a mesma classe para todas passaria pela primeira.
    */
    await renderForm({ path: highlightNewPath(BOOK_ID) });

    const dots: string[] = [];
    for (const pen of PENS) {
      const tokens = tokensOf(penDot(pen.name));
      expect(tokens).toContain(pen.dot);
      dots.push(tokens.join(' '));
    }

    expect(new Set(dots).size).toBe(PENS.length);
  });

  it('⚠️ turns the edge of the paper DANGER while the quote is invalid, the way every other field of the app does', async () => {
    /*
      **M6 da auditoria:** até a Tarefa 47a o campo do trecho usava o estilo
      compartilhado de campo de texto, que traz a borda vermelha do erro
      (`form-styles.ts`). A fatia tirou o campo daquele estilo e **o vermelho
      foi junto** — sobrava só o parágrafo abaixo, enquanto o campo de PÁGINA
      da mesma tela continuava acendendo a borda. Um campo em erro que não se
      distingue de um campo em repouso é metade do erro faltando.

      ⚠️ **AQUI O ESTADO VEM DA PROP, E NÃO DO ATRIBUTO** — e a divergência é
      declarada. O `form-styles.ts` usa a variante de atributo porque é uma
      CONSTANTE compartilhada: ela não enxerga estado nenhum, e quem põe o
      atributo é o `Field`. Este componente já é o dono do `error` e já decide
      por ele três vezes (a descrição, o atributo e a mensagem), então a quarta
      sai da mesma fonte — não há como as duas divergirem. E o que se ganha é o
      que o §7.9 pede: a propriedade vira **decidível em jsdom**, porque é o
      render que muda, e não uma regra de CSS que o jsdom não avalia.
    */
    const calls = await renderForm({
      list: { status: 200, body: [aHighlight()] },
    });

    const pen = PENS[0];
    if (pen === undefined) throw new Error('paleta');
    expect(tokensOf(paperParts().paper)).toContain(pen.edge);
    expect(tokensOf(paperParts().paper)).not.toContain('border-danger');

    await typeInto(FIELDS.quote, '   ');
    await pressLabel(pt.pages.highlightForm.save);

    expect(patches(calls)).toHaveLength(0);
    const tokens = tokensOf(paperParts().paper);
    expect(tokens).toContain('border-danger');
    expect(tokens).toContain('border');
    // O filete vermelho SUBSTITUI o da caneta: dois utilitários de cor de borda
    // na mesma classe deixariam a ordem de emissão do CSS decidir qual vence.
    expect(tokens).not.toContain(pen.edge);
    // E o papel continua sendo o papel — o erro pinta a fronteira, não o fundo.
    expect(tokens).toContain(pen.paper);
    expectNoGuiltBesidesFormError([FIELDS.quoteRequired]);
  });
});
