import type { BookResponse, PlanItemResponse } from '@clube/shared';
import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { en, pt } from '@clube/shared/locales';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import type { ClubSummary } from '../../club/active-club';
import { bookEditPath, bookNewPath } from '../paths';
import { expectNoPrivacyTalk } from './adr-0002-dom';
import { expectNoGuilt, expectNoGuiltBesidesFormError } from './anti-guilt-dom';
import {
  aBook,
  aPlanItem,
  booksReply,
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
 * O CADASTRO DO LIVRO E DO PLANO — as regras 1 a 19 da Tarefa 20.
 *
 * Entra pelo `<App />` inteiro, como as telas 16 a 19: metade do que a fatia
 * entrega é composição (as duas rotas novas, o `RequireAuth` que as protege, e
 * o `role` do `/me` que decide quem vê a entrada e quem passa da rota).
 *
 * ⚠️ **NÃO HÁ DUBLÊ DE EDITOR AQUI, e é a regra 19.** Esta tela não usa
 * `@clube/ui/editor` — o chunk de entrada continua sem TipTap, e o acusador é
 * `src/__tests__/bundle-guard.test.ts`, que compila de verdade.
 */

const CLUB_ID = 'c-casal';
const BOOK_ID = 'b-hobbit';

const SESSION: Record<string, string> = {
  [TOKEN_STORAGE_KEY]: 'token-da-sessao',
};

function aClub(role: ClubSummary['role']): ClubSummary {
  return { id: CLUB_ID, name: 'Clube do Casal', role };
}

interface BookFormSetup {
  path?: string;
  /** O papel de quem abriu a tela, no clube do livro. */
  role?: ClubSummary['role'];
  /** `GET /books/:bookId` — e também a resposta do `PATCH`. */
  book?: Reply | Responder;
  /** `POST /clubs/:clubId/books` e `GET /clubs/:clubId/books`. */
  clubBooks?: Reply | Responder;
  /** `PUT /books/:bookId/plan`. */
  plan?: Reply | Responder;
  me?: Reply;
}

function bookWithPlanReplyOf(
  book: BookResponse,
  planItems: readonly PlanItemResponse[],
): Reply {
  return { status: 200, body: { book, planItems, writers: [] } };
}

/** O plano que a tela de edição abre preenchida (regra 14). */
function threeDays(): PlanItemResponse[] {
  return [
    aPlanItem({
      id: 'p-1',
      order: 1,
      date: '2024-03-05',
      title: 'Cap. 1',
      reference: 'p. 9-30',
    }),
    aPlanItem({
      id: 'p-2',
      order: 2,
      date: '2024-03-06',
      title: 'Cap. 2',
      reference: null,
    }),
    aPlanItem({
      id: 'p-3',
      order: 3,
      date: '2024-03-07',
      title: 'Cap. 3',
      reference: 'p. 51-70',
    }),
  ];
}

/**
 * O shell autenticado inteiro, endpoint por endpoint.
 *
 * ⚠️ A ORDEM importa e cada linha tem um motivo:
 * - `/plan` vem antes de `/books/`, senão o `PUT` cairia na resposta do livro;
 * - `/books/` (com barra) é o livro por id (`GET` e `PATCH`), e NÃO casa
 *   `/clubs/c-casal/books`, que é a estante e a criação.
 */
function bookFormResponder(setup: BookFormSetup): Responder {
  return replyByUrl(
    [
      ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
      ['/me', setup.me ?? meReply({ clubs: [aClub(setup.role ?? 'OWNER')] })],
      ['/plan', setup.plan ?? { status: 500, body: { error: 'no plan stub' } }],
      [
        '/books/',
        setup.book ?? bookWithPlanReplyOf(aBook({ clubId: CLUB_ID }), []),
      ],
      ['/books', setup.clubBooks ?? booksReply([])],
    ],
    { status: 500, body: { error: 'Internal Server Error' } },
  );
}

/** Descarrega as microtarefas pendentes — a suíte não usa timers falsos. */
async function settle(): Promise<void> {
  for (let step = 0; step < 10; step += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderBookForm(
  setup: BookFormSetup = {},
): Promise<RecordedRequest[]> {
  const calls = stubFetch(bookFormResponder(setup));

  await act(async () => {
    renderPage(<App />, {
      path: setup.path ?? bookNewPath(CLUB_ID),
      storage: memoryStorage({ ...SESSION }),
    });
  });
  await settle();

  return calls;
}

async function press(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
  await settle();
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

/** As escritas do livro por id: `PATCH /books/:bookId`. */
function bookWrites(calls: readonly RecordedRequest[]): RecordedRequest[] {
  return requestsTo(calls, `/books/${BOOK_ID}`).filter(
    (call) => call.method === 'PATCH',
  );
}

/** As substituições do plano: `PUT /books/:bookId/plan`. */
function planWrites(calls: readonly RecordedRequest[]): RecordedRequest[] {
  return requestsTo(calls, '/plan');
}

/** As criações: `POST /clubs/:clubId/books`. */
function creates(calls: readonly RecordedRequest[]): RecordedRequest[] {
  return requestsTo(calls, `/clubs/${CLUB_ID}/books`).filter(
    (call) => call.method === 'POST',
  );
}

function locationText(): string {
  return screen.getByTestId('location').textContent ?? '';
}

const TITLE_LABEL = pt.pages.bookForm.fields.title;
const MONTH_LABEL = pt.pages.bookForm.fields.month;
const AUTHOR_LABEL = pt.pages.bookForm.fields.author;
const COVER_LABEL = pt.pages.bookForm.fields.coverUrl;
const PAGES_LABEL = pt.pages.bookForm.fields.totalPages;

/** `'Data do dia {{number}}'` → `'Data do dia 2'`, sem repetir a fábrica. */
function rowLabel(
  key: 'dateLabel' | 'titleLabel' | 'referenceLabel' | 'remove',
  number: number,
): string {
  return pt.pages.bookForm.plan[key].replace('{{number}}', String(number));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ONLY AN OWNER/ADMIN GETS IN (rules 1, 2)', () => {
  it('shows the entry on the home only for an OWNER', async () => {
    await renderBookForm({ path: '/', role: 'OWNER' });

    expect(
      screen.queryByRole('button', { name: pt.pages.bookForm.entry.new }),
    ).not.toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('hides the entry on the home from a MEMBER', async () => {
    await renderBookForm({ path: '/', role: 'MEMBER' });

    expect(
      screen.queryByRole('button', { name: pt.pages.bookForm.entry.new }),
    ).toBeNull();
    expectNoGuilt();
  });

  it('shows the entry on the book screen only for an ADMIN', async () => {
    await renderBookForm({
      path: `/books/${BOOK_ID}`,
      role: 'ADMIN',
      book: bookWithPlanReplyOf(aBook({ clubId: CLUB_ID }), threeDays()),
      clubBooks: { status: 200, body: [] },
    });

    expect(
      screen.queryByRole('button', { name: pt.pages.bookForm.entry.edit }),
    ).not.toBeNull();
    expectNoGuilt();
  });

  it('hides the entry on the book screen from a MEMBER', async () => {
    await renderBookForm({
      path: `/books/${BOOK_ID}`,
      role: 'MEMBER',
      book: bookWithPlanReplyOf(aBook({ clubId: CLUB_ID }), threeDays()),
    });

    expect(
      screen.queryByRole('button', { name: pt.pages.bookForm.entry.edit }),
    ).toBeNull();
    expectNoGuilt();
  });

  it('refuses the CREATE route with a sentence of its own, not a form (rule 2)', async () => {
    const calls = await renderBookForm({
      path: bookNewPath(CLUB_ID),
      role: 'MEMBER',
    });

    expect(screen.queryByText(pt.pages.bookForm.notAdmin)).not.toBeNull();
    expect(screen.queryByLabelText(TITLE_LABEL)).toBeNull();
    expect(
      screen.queryByRole('button', { name: pt.pages.bookForm.save }),
    ).toBeNull();
    // E nada foi escrito: a recusa acontece ANTES de qualquer requisição.
    expect(creates(calls)).toHaveLength(0);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('refuses the EDIT route with a sentence of its own, not a form (rule 2)', async () => {
    const calls = await renderBookForm({
      path: bookEditPath(BOOK_ID),
      role: 'MEMBER',
      book: bookWithPlanReplyOf(aBook({ clubId: CLUB_ID }), threeDays()),
    });

    expect(screen.queryByText(pt.pages.bookForm.notAdmin)).not.toBeNull();
    expect(screen.queryByLabelText(TITLE_LABEL)).toBeNull();
    expect(bookWrites(calls)).toHaveLength(0);
    expect(planWrites(calls)).toHaveLength(0);
    expectNoGuilt();
  });

  it('opens the form for an OWNER on the create route', async () => {
    await renderBookForm({ path: bookNewPath(CLUB_ID), role: 'OWNER' });

    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: pt.pages.bookForm.newTitle,
      }),
    ).not.toBeNull();
    expect(screen.queryByLabelText(TITLE_LABEL)).not.toBeNull();
    expect(screen.queryByText(pt.pages.bookForm.notAdmin)).toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();
  });
});

describe('THE BOOK: what is required, what is optional, and what goes in the body (rules 3, 4, 5, 6, 13)', () => {
  it('marks the title and sends NOTHING when it is empty (rule 3)', async () => {
    const calls = await renderBookForm();

    await typeInto(MONTH_LABEL, '2026-09');
    await pressLabel(pt.pages.bookForm.save);

    expect(creates(calls)).toHaveLength(0);
    expect(
      screen.queryByText(pt.pages.bookForm.fields.titleRequired),
    ).not.toBeNull();
    expect(
      screen.getByLabelText(TITLE_LABEL).getAttribute('aria-invalid'),
    ).toBe('true');
    expectNoGuiltBesidesFormError([pt.pages.bookForm.fields.titleRequired]);
  });

  it('marks the month and sends NOTHING when it is empty (rule 3)', async () => {
    const calls = await renderBookForm();

    await typeInto(TITLE_LABEL, 'O Hobbit');
    await pressLabel(pt.pages.bookForm.save);

    expect(creates(calls)).toHaveLength(0);
    expect(
      screen.queryByText(pt.pages.bookForm.fields.monthRequired),
    ).not.toBeNull();
    expect(
      screen.getByLabelText(MONTH_LABEL).getAttribute('aria-invalid'),
    ).toBe('true');
    expectNoGuiltBesidesFormError([pt.pages.bookForm.fields.monthRequired]);
  });

  it('rejects a malformed month ON THE SCREEN, before sending (rule 4)', async () => {
    const calls = await renderBookForm();

    await typeInto(TITLE_LABEL, 'O Hobbit');
    // Um mês que o `isClubMonth` do `shared` reprova: mês 13 não existe.
    await typeInto(MONTH_LABEL, '2026-13');
    await pressLabel(pt.pages.bookForm.save);

    expect(creates(calls)).toHaveLength(0);
    expect(
      screen.queryByText(pt.pages.bookForm.fields.monthInvalid),
    ).not.toBeNull();
    expectNoGuiltBesidesFormError([pt.pages.bookForm.fields.monthInvalid]);
  });

  it('leaves the optional fields OUT of the body when they are blank — not even as an empty string (rules 5, 6, 13)', async () => {
    const calls = await renderBookForm({
      clubBooks: (request) =>
        request.method === 'POST'
          ? {
              status: 201,
              body: {
                book: aBook({ id: 'b-novo', clubId: CLUB_ID }),
                planItems: [],
                writers: [],
              },
            }
          : booksReply([]),
    });

    await typeInto(TITLE_LABEL, 'O Hobbit');
    await typeInto(MONTH_LABEL, '2026-09');
    await pressLabel(pt.pages.bookForm.save);

    // REGRA 6: o corpo é EXATAMENTE o que o schema declara. Sem `order`, sem
    // `clubId`, sem `id`, sem `planItems: []` — e sem `author: ''`.
    expect(creates(calls)).toHaveLength(1);
    expect(requestAt(creates(calls), 0).body).toEqual({
      title: 'O Hobbit',
      month: '2026-09',
    });
    expect(requestAt(creates(calls), 0).url).toContain(
      `/clubs/${CLUB_ID}/books`,
    );
    // REGRA 16: salvar com sucesso leva para a tela do livro.
    expect(locationText()).toBe('/books/b-novo');
  });

  it('sends the optional fields that were filled in, with the right types (rules 5, 6)', async () => {
    const calls = await renderBookForm({
      clubBooks: (request) =>
        request.method === 'POST'
          ? {
              status: 201,
              body: {
                book: aBook({ id: 'b-novo', clubId: CLUB_ID }),
                planItems: [],
                writers: [],
              },
            }
          : booksReply([]),
    });

    await typeInto(TITLE_LABEL, '  O Hobbit  ');
    await typeInto(MONTH_LABEL, '2026-09');
    await typeInto(AUTHOR_LABEL, 'J. R. R. Tolkien');
    await typeInto(COVER_LABEL, 'https://capas.teste/hobbit.jpg');
    await typeInto(PAGES_LABEL, '320');
    await pressLabel(pt.pages.bookForm.save);

    expect(requestAt(creates(calls), 0).body).toEqual({
      // As pontas somem: o schema faz `.trim()`, e mandar com espaço faria o
      // título gravado divergir do digitado sem ninguém saber por quê.
      title: 'O Hobbit',
      month: '2026-09',
      author: 'J. R. R. Tolkien',
      coverUrl: 'https://capas.teste/hobbit.jpg',
      // NÚMERO, não string: o `createBookSchema` declara `z.number().int()`, e
      // um `"320"` seria 400 com a mensagem do Zod em inglês.
      totalPages: 320,
    });
  });
});

/** O valor de um campo, sem `as`: o `instanceof` é o narrowing honesto. */
function inputValue(label: string): string {
  const element = screen.getByLabelText(label);
  return element instanceof HTMLInputElement ? element.value : '';
}

function rowCount(): number {
  return screen.queryAllByRole('listitem').length;
}

function ariaInvalid(label: string): string | null {
  return screen.getByLabelText(label).getAttribute('aria-invalid');
}

const START_LABEL = pt.pages.bookForm.plan.generator.startDate;
const COUNT_LABEL = pt.pages.bookForm.plan.generator.count;
const GENERATE = pt.pages.bookForm.plan.generator.submit;

/** O caminho comum: gerar N dias a partir de uma data. */
async function generate(startDate: string, count: number): Promise<void> {
  await typeInto(START_LABEL, startDate);
  await typeInto(COUNT_LABEL, String(count));
  await pressLabel(GENERATE);
}

/** Um livro válido no formulário, sem o plano. */
async function fillBook(): Promise<void> {
  await typeInto(TITLE_LABEL, 'O Hobbit');
  await typeInto(MONTH_LABEL, '2026-09');
}

/** A resposta do `POST /clubs/:clubId/books` que dá certo. */
function createdReply(): Responder {
  return (request) =>
    request.method === 'POST'
      ? {
          status: 201,
          body: {
            book: aBook({ id: 'b-novo', clubId: CLUB_ID }),
            planItems: [],
            writers: [],
          },
        }
      : booksReply([]);
}

describe('THE PLAN: the generator, adding and removing by hand (rules 7, 8)', () => {
  it('creates N rows with CONSECUTIVE dates and empty topics (rule 7)', async () => {
    const calls = await renderBookForm();

    await generate('2026-09-01', 3);

    expect(rowCount()).toBe(3);
    expect(inputValue(rowLabel('dateLabel', 1))).toBe('2026-09-01');
    expect(inputValue(rowLabel('dateLabel', 2))).toBe('2026-09-02');
    expect(inputValue(rowLabel('dateLabel', 3))).toBe('2026-09-03');
    // O TEMA é conteúdo: o gerador não o inventa.
    expect(inputValue(rowLabel('titleLabel', 1))).toBe('');
    expect(inputValue(rowLabel('titleLabel', 3))).toBe('');
    // Gerar não é salvar (decisão E).
    expect(creates(calls)).toHaveLength(0);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('crosses the end of the month without inventing a 31st of September (rule 7)', async () => {
    await renderBookForm();

    await generate('2026-09-29', 4);

    expect(inputValue(rowLabel('dateLabel', 2))).toBe('2026-09-30');
    expect(inputValue(rowLabel('dateLabel', 3))).toBe('2026-10-01');
    expect(inputValue(rowLabel('dateLabel', 4))).toBe('2026-10-02');
  });

  it('adds a row by hand, already dated after the last one (rule 8)', async () => {
    await renderBookForm();

    await generate('2026-09-01', 2);
    await pressLabel(pt.pages.bookForm.plan.add);

    expect(rowCount()).toBe(3);
    // A data já vem depois da última: a sequência da regra 10 continua válida
    // sem ninguém digitar nada.
    expect(inputValue(rowLabel('dateLabel', 3))).toBe('2026-09-03');
    expectNoGuilt();
  });

  it('removes a row by hand, and the rows below RENUMBER (rule 8)', async () => {
    await renderBookForm();

    await generate('2026-09-01', 3);
    await typeInto(rowLabel('titleLabel', 3), 'Cap. 3');
    await pressLabel(rowLabel('remove', 2));

    expect(rowCount()).toBe(2);
    // A linha 2 saiu; a que era a 3 virou a 2, com o tema que já tinha.
    expect(inputValue(rowLabel('dateLabel', 2))).toBe('2026-09-03');
    expect(inputValue(rowLabel('titleLabel', 2))).toBe('Cap. 3');
    expectNoGuilt();
  });
});

describe('THE PLAN: what the screen refuses, and on WHICH row (rules 9, 10)', () => {
  it('marks the row with an empty topic and sends NOTHING (rule 9)', async () => {
    const calls = await renderBookForm();

    await fillBook();
    await generate('2026-09-01', 3);
    await typeInto(rowLabel('titleLabel', 1), 'Cap. 1');
    // A linha 2 fica sem tema — é o caso realista de quem parou no meio.
    await typeInto(rowLabel('titleLabel', 3), 'Cap. 3');
    await pressLabel(pt.pages.bookForm.save);

    expect(creates(calls)).toHaveLength(0);
    expect(
      screen.queryByText(pt.pages.bookForm.plan.titleRequired),
    ).not.toBeNull();
    // A LINHA CERTA: a 2, e só ela.
    expect(ariaInvalid(rowLabel('titleLabel', 2))).toBe('true');
    expect(ariaInvalid(rowLabel('titleLabel', 1))).toBeNull();
    expect(ariaInvalid(rowLabel('titleLabel', 3))).toBeNull();
    expectNoGuiltBesidesFormError([pt.pages.bookForm.plan.titleRequired]);
  });

  it('marks the row with a REPEATED date, and sends nothing (rule 10)', async () => {
    const calls = await renderBookForm();

    await fillBook();
    await generate('2026-09-01', 3);
    await typeInto(rowLabel('titleLabel', 1), 'Cap. 1');
    await typeInto(rowLabel('titleLabel', 2), 'Cap. 2');
    await typeInto(rowLabel('titleLabel', 3), 'Cap. 3');
    // O dia 3 repete o dia 1 — a duplicata é conferida contra o plano INTEIRO
    // (é o `findPlanDateProblem` do `shared`), não só contra a linha anterior.
    await typeInto(rowLabel('dateLabel', 3), '2026-09-01');
    await pressLabel(pt.pages.bookForm.save);

    expect(creates(calls)).toHaveLength(0);
    expect(
      screen.queryByText(pt.pages.bookForm.plan.dateDuplicate),
    ).not.toBeNull();
    expect(ariaInvalid(rowLabel('dateLabel', 3))).toBe('true');
    expect(ariaInvalid(rowLabel('dateLabel', 1))).toBeNull();
    expectNoGuiltBesidesFormError([pt.pages.bookForm.plan.dateDuplicate]);
  });

  it('marks the row that goes BACKWARDS in time, and sends nothing (rule 10)', async () => {
    const calls = await renderBookForm();

    await fillBook();
    await generate('2026-09-01', 3);
    await typeInto(rowLabel('titleLabel', 1), 'Cap. 1');
    await typeInto(rowLabel('titleLabel', 2), 'Cap. 2');
    await typeInto(rowLabel('titleLabel', 3), 'Cap. 3');
    // A linha 2 volta para antes da 1: é OUT_OF_ORDER, não duplicata — e as
    // duas frases são diferentes de propósito.
    await typeInto(rowLabel('dateLabel', 2), '2026-08-20');
    await pressLabel(pt.pages.bookForm.save);

    expect(creates(calls)).toHaveLength(0);
    expect(
      screen.queryByText(pt.pages.bookForm.plan.dateOutOfOrder),
    ).not.toBeNull();
    expect(ariaInvalid(rowLabel('dateLabel', 2))).toBe('true');
    expectNoGuiltBesidesFormError([pt.pages.bookForm.plan.dateOutOfOrder]);
  });

  it('sends the plan INSIDE the POST, without `order` and without an empty reference (rules 6, 7)', async () => {
    const calls = await renderBookForm({ clubBooks: createdReply() });

    await fillBook();
    await generate('2026-09-01', 2);
    await typeInto(rowLabel('titleLabel', 1), 'Cap. 1');
    await typeInto(rowLabel('titleLabel', 2), 'Cap. 2');
    await typeInto(rowLabel('referenceLabel', 2), 'p. 31-50');
    await pressLabel(pt.pages.bookForm.save);

    expect(requestAt(creates(calls), 0).body).toEqual({
      title: 'O Hobbit',
      month: '2026-09',
      planItems: [
        // Sem `order` (o domínio o deriva da posição) e sem `reference: ''`.
        { date: '2026-09-01', title: 'Cap. 1' },
        { date: '2026-09-02', title: 'Cap. 2', reference: 'p. 31-50' },
      ],
    });
    expect(locationText()).toBe('/books/b-novo');
  });
});

/**
 * `/books/:bookId` responde a DOIS verbos com corpos diferentes: o `GET` traz
 * `{ book, planItems, writers }` e o `PATCH` traz o livro sozinho
 * (`bookResponseSchema`). Um dublê que devolvesse o mesmo corpo nos dois faria
 * o `PATCH` estourar no `safeParse` do cliente (§6.8) — falso vermelho.
 */
function bookRoute(
  book: BookResponse,
  planItems: readonly PlanItemResponse[],
  patch?: Reply,
): Responder {
  return (request) =>
    request.method === 'PATCH'
      ? (patch ?? { status: 200, body: book })
      : bookWithPlanReplyOf(book, planItems);
}

/** A resposta do `PUT /books/:bookId/plan` — com os contadores do diff. */
function planReply(items: readonly PlanItemResponse[]): Reply {
  return {
    status: 200,
    body: { planItems: items, created: 0, updated: 0, removed: 0 },
  };
}

/** Oito dias, para a linha 8 do 400 do servidor existir de verdade. */
function eightDays(): PlanItemResponse[] {
  return Array.from({ length: 8 }, (_unused, index) =>
    aPlanItem({
      id: `p-${index + 1}`,
      order: index + 1,
      date: `2024-03-0${index + 1}`,
      title: `Cap. ${index + 1}`,
      reference: null,
    }),
  );
}

/** Abre a tela de edição com o livro e o plano já respondidos. */
async function renderEdit(
  setup: Partial<BookFormSetup> & {
    planItems?: readonly PlanItemResponse[];
  } = {},
): Promise<RecordedRequest[]> {
  return renderBookForm({
    ...setup,
    path: bookEditPath(BOOK_ID),
    book:
      setup.book ??
      bookRoute(
        aBook({ id: BOOK_ID, clubId: CLUB_ID }),
        setup.planItems ?? threeDays(),
      ),
    plan: setup.plan ?? planReply(setup.planItems ?? threeDays()),
  });
}

describe('EDITING: it opens filled in, and only what CHANGED is sent (rules 14, 15, 16)', () => {
  it('opens filled with the book and the plan of GET /books/:bookId (rule 14)', async () => {
    await renderEdit();

    expect(inputValue(TITLE_LABEL)).toBe('O Hobbit');
    expect(inputValue(MONTH_LABEL)).toBe('2024-03');
    expect(inputValue(AUTHOR_LABEL)).toBe('J. R. R. Tolkien');
    expect(inputValue(PAGES_LABEL)).toBe('320');
    // `coverUrl` é `null` na resposta: o campo abre em branco, não com "null".
    expect(inputValue(COVER_LABEL)).toBe('');

    expect(rowCount()).toBe(3);
    expect(inputValue(rowLabel('dateLabel', 1))).toBe('2024-03-05');
    expect(inputValue(rowLabel('titleLabel', 2))).toBe('Cap. 2');
    expect(inputValue(rowLabel('referenceLabel', 1))).toBe('p. 9-30');
    // Referência `null` vira campo em branco, e não a palavra "null".
    expect(inputValue(rowLabel('referenceLabel', 2))).toBe('');
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('opening and saving WITHOUT CHANGING ANYTHING fires neither PATCH nor PUT (rule 15)', async () => {
    const calls = await renderEdit();

    await pressLabel(pt.pages.bookForm.save);

    expect(bookWrites(calls)).toHaveLength(0);
    expect(planWrites(calls)).toHaveLength(0);
    // E ainda assim a pessoa sai do formulário: "salvar" sem mudança é uma
    // saída, não uma tela travada.
    expect(locationText()).toBe(`/books/${BOOK_ID}`);
  });

  it('sends only the CHANGED book fields, and no PUT when the plan is untouched (rules 15, 16)', async () => {
    const calls = await renderEdit();

    await typeInto(TITLE_LABEL, 'O Hobbit anotado');
    await pressLabel(pt.pages.bookForm.save);

    expect(bookWrites(calls)).toHaveLength(1);
    // SÓ o título: `month`, `author` e `totalPages` não mudaram, e o
    // `editBookSchema` distingue ausente (não mexe) de `null` (limpa).
    expect(requestAt(bookWrites(calls), 0).body).toEqual({
      title: 'O Hobbit anotado',
    });
    expect(planWrites(calls)).toHaveLength(0);
    expect(locationText()).toBe(`/books/${BOOK_ID}`);
  });

  it('clears an optional field with an explicit `null` when it is emptied (rules 5, 16)', async () => {
    const calls = await renderEdit();

    await typeInto(AUTHOR_LABEL, '   ');
    await typeInto(PAGES_LABEL, '');
    await pressLabel(pt.pages.bookForm.save);

    // `null` e NÃO `''`: no `PATCH` os dois são casos diferentes — ausente não
    // mexe, `null` limpa —, e é por isso que o schema não usa `.default()`.
    expect(requestAt(bookWrites(calls), 0).body).toEqual({
      author: null,
      totalPages: null,
    });
  });

  it('sends only the PLAN when only the plan changed, and no PATCH (rules 15, 16)', async () => {
    const calls = await renderEdit();

    await typeInto(rowLabel('titleLabel', 2), 'Cap. 2 — A comida cozinhou');
    await pressLabel(pt.pages.bookForm.save);

    expect(bookWrites(calls)).toHaveLength(0);
    expect(planWrites(calls)).toHaveLength(1);
    expect(requestAt(planWrites(calls), 0).method).toBe('PUT');
    expect(requestAt(planWrites(calls), 0).body).toEqual({
      planItems: [
        { date: '2024-03-05', title: 'Cap. 1', reference: 'p. 9-30' },
        { date: '2024-03-06', title: 'Cap. 2 — A comida cozinhou' },
        { date: '2024-03-07', title: 'Cap. 3', reference: 'p. 51-70' },
      ],
    });
    expect(locationText()).toBe(`/books/${BOOK_ID}`);
  });
});

describe('THE 400 OF THE SERVER: which row, and whose sentence (rules 11, 12, 17)', () => {
  it('marks row 8 from `details[0].path` = planItems.7.date, with the sentence from the CATALOG (rule 11)', async () => {
    const apiText = 'String must contain at least 1 character(s)';
    const calls = await renderEdit({
      planItems: eightDays(),
      plan: {
        status: 400,
        body: {
          error: apiText,
          details: [{ path: 'planItems.7.date', message: apiText }],
        },
      },
    });

    await typeInto(rowLabel('titleLabel', 1), 'Cap. 1 revisado');
    await pressLabel(pt.pages.bookForm.save);

    expect(planWrites(calls)).toHaveLength(1);
    // O ÍNDICE vem do `path` (é número, não texto da API): a linha 8.
    expect(ariaInvalid(rowLabel('dateLabel', 8))).toBe('true');
    expect(ariaInvalid(rowLabel('dateLabel', 1))).toBeNull();
    // A FRASE vem do catálogo, via `apiErrorKey` (`planItems.*.date`).
    expect(screen.queryByText(pt.errors.fields.planItem.date)).not.toBeNull();
    // REGRA 17: nada do que a API escreveu chega ao olho de ninguém — nem em
    // texto, nem em atributo.
    expect(readableText()).not.toContain(apiText);
    expectNoGuiltBesidesFormError([pt.errors.fields.planItem.date]);
  });

  it('brings the removed day BACK and keeps what was typed when the server refuses it (rule 12)', async () => {
    const apiText =
      'cannot remove 1 reading plan day(s) that already have notes';
    const calls = await renderEdit({
      plan: { status: 400, body: { error: apiText } },
    });

    await typeInto(rowLabel('titleLabel', 1), 'Cap. 1 revisado');
    await pressLabel(rowLabel('remove', 2));
    expect(rowCount()).toBe(2);

    await pressLabel(pt.pages.bookForm.save);

    // A tentativa aconteceu, e sem o dia 6 de março.
    expect(planWrites(calls)).toHaveLength(1);
    expect(requestAt(planWrites(calls), 0).body).toEqual({
      planItems: [
        { date: '2024-03-05', title: 'Cap. 1 revisado', reference: 'p. 9-30' },
        { date: '2024-03-07', title: 'Cap. 3', reference: 'p. 51-70' },
      ],
    });

    // A FRASE é do catálogo, e é própria desta recusa.
    expect(
      screen.queryByText(pt.pages.bookForm.plan.dayHasNotes),
    ).not.toBeNull();
    expect(readableText()).not.toContain(apiText);
    // A LINHA VOLTOU, na posição certa…
    expect(rowCount()).toBe(3);
    expect(inputValue(rowLabel('dateLabel', 2))).toBe('2024-03-06');
    expect(inputValue(rowLabel('titleLabel', 2))).toBe('Cap. 2');
    // …e o formulário NÃO perdeu o que foi digitado.
    expect(inputValue(rowLabel('titleLabel', 1))).toBe('Cap. 1 revisado');
    // E a pessoa continua no formulário: não há para onde sair sem salvar.
    expect(locationText()).toBe(bookEditPath(BOOK_ID));
    expectNoGuiltBesidesFormError([pt.pages.bookForm.plan.dayHasNotes]);
  });

  it('marks the BOOK field the server pointed at, with the catalog sentence (rules 11, 17)', async () => {
    const apiText = 'must be a "YYYY-MM" club month';
    const calls = await renderBookForm({
      clubBooks: (request) =>
        request.method === 'POST'
          ? {
              status: 400,
              body: {
                error: apiText,
                details: [{ path: 'month', message: apiText }],
              },
            }
          : booksReply([]),
    });

    await fillBook();
    await pressLabel(pt.pages.bookForm.save);

    expect(creates(calls)).toHaveLength(1);
    expect(ariaInvalid(MONTH_LABEL)).toBe('true');
    expect(screen.queryByText(pt.errors.fields.month)).not.toBeNull();
    expect(readableText()).not.toContain(apiText);
    expectNoGuiltBesidesFormError([pt.errors.fields.month]);
  });

  it('shows a translated sentence — never the API text — when the save just fails (rule 17)', async () => {
    const apiText = 'Internal Server Error';
    const calls = await renderBookForm({
      clubBooks: (request) =>
        request.method === 'POST'
          ? { status: 500, body: { error: apiText } }
          : booksReply([]),
    });

    await fillBook();
    await pressLabel(pt.pages.bookForm.save);

    expect(creates(calls)).toHaveLength(1);
    expect(screen.queryByText(pt.errors.serverError)).not.toBeNull();
    expect(readableText()).not.toContain(apiText);
    // E o que foi digitado continua na tela.
    expect(inputValue(TITLE_LABEL)).toBe('O Hobbit');
    expectNoGuiltBesidesFormError([pt.errors.serverError]);
  });
});

describe('THE CATALOG CARRIES EVERY NEW KEY, IN BOTH LOCALES (rule 17)', () => {
  it('has no empty leaf and no leaf that is the key itself, in pt and en', () => {
    /*
      ⚠️ O NOME É O QUE ELE PROVA, e a versão anterior prometia "a mesma forma
      em pt e en" — que este teste NÃO confere: a forma é do compilador
      (`en: typeof pt` reprova chave a mais ou a menos, antes de qualquer
      teste). Nome que promete mais do que a asserção entrega é como uma guarda
      morre: o próximo leitor confia nele e não escreve a que falta (§7.9).

      O que ele acrescenta é o outro sintoma: folha vazia, ou folha com o nome
      da chave dentro — que é o que o i18next renderiza quando alguém esquece
      uma tradução.
    */
    for (const catalog of [pt.pages.bookForm, en.pages.bookForm]) {
      const leaves = JSON.stringify(catalog);
      expect(leaves).not.toContain('""');
      expect(leaves).not.toContain('bookForm.');
    }
  });
});

describe('THE STATES THAT ARE NOT THE FORM (rules 17, 18)', () => {
  it('shows a loading state — never a blank screen — while the book is in flight', async () => {
    await renderBookForm({
      path: bookEditPath(BOOK_ID),
      // Uma resposta que nunca chega: é o estado que a pessoa vê no metrô.
      book: () => new Promise<Reply>(() => undefined),
    });

    // Sempre existe um `h1`: "carregando" é um ESTADO desta tela.
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: pt.pages.bookForm.editTitle,
      }),
    ).not.toBeNull();
    expect(screen.queryByText(pt.pages.bookForm.loading)).not.toBeNull();
    expect(screen.queryByLabelText(TITLE_LABEL)).toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('shows its own sentence when the book cannot be opened, and RETRYING refires the request', async () => {
    const apiText = 'Internal Server Error';
    const calls = await renderBookForm({
      path: bookEditPath(BOOK_ID),
      book: { status: 500, body: { error: apiText } },
    });

    expect(
      screen.queryByText(pt.pages.bookForm.bookUnavailable),
    ).not.toBeNull();
    expect(readableText()).not.toContain(apiText);
    expect(requestsTo(calls, `/books/${BOOK_ID}`)).toHaveLength(1);

    await pressLabel(pt.pages.bookForm.retry);

    // Repetir REFAZ a requisição — não é só apagar a mensagem.
    expect(requestsTo(calls, `/books/${BOOK_ID}`)).toHaveLength(2);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('keeps the generator OUT once the plan has rows, so no typed topic is ever overwritten', async () => {
    await renderBookForm();

    expect(screen.queryByLabelText(START_LABEL)).not.toBeNull();

    await generate('2026-09-01', 2);

    // Com linhas na tela, gerar de novo apagaria os temas — que é a única
    // parte do plano que não dá para refazer sozinha. O caminho passa a ser
    // acrescentar e remover à mão (regra 8).
    expect(screen.queryByLabelText(START_LABEL)).toBeNull();
    expect(
      screen.queryByRole('button', { name: pt.pages.bookForm.plan.add }),
    ).not.toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();
  });
});

describe('THE FORM KEEPS THE FOCUS WHILE SOMEONE TYPES', () => {
  it('does not remount the field on every keystroke', async () => {
    /*
      ⚠️ O acusador do `textField` ser uma FUNÇÃO CHAMADA, e não um componente
      declarado dentro do `BookForm`. Um componente definido no corpo de outro
      tem identidade nova a cada render: o React desmonta a subárvore, o
      `<input>` é substituído por um nó novo, e o foco vai para o `<body>` no
      meio da palavra. É o tipo de defeito que passa em toda asserção de valor
      e só aparece com o dedo na tela.
    */
    await renderBookForm();

    const field = screen.getByLabelText(TITLE_LABEL);
    await act(async () => {
      field.focus();
    });
    await typeInto(TITLE_LABEL, 'O Hob');

    expect(document.activeElement).toBe(screen.getByLabelText(TITLE_LABEL));
    expect(inputValue(TITLE_LABEL)).toBe('O Hob');
  });
});

/** O SEGUNDO clube — o que torna "clube ativo × clube do livro" observável. */
const AMIGOS_ID = 'c-amigos';

/**
 * ⚠️ **DOIS CLUBES, COM PAPÉIS DIFERENTES — e é o fixture que faltava.**
 *
 * MEDIDO pela auditoria: trocar `isClubAdmin(clubs, book.clubId)` por
 * `isClubAdmin(clubs, activeClub.id)` na tela do livro e no formulário dava
 * ZERO acusadores em 332 testes, porque todo fixture da fatia tinha UM clube —
 * e ele era, sempre, o clube do livro. Os dois argumentos eram o mesmo valor.
 *
 * O primeiro da lista é o clube ATIVO (o `ActiveClubProvider` cai no
 * `clubs[0]` sem escolha guardada); o segundo é o clube do LIVRO.
 */
function twoClubs(
  activeRole: ClubSummary['role'],
  bookRole: ClubSummary['role'],
): Reply {
  return meReply({
    clubs: [
      { id: AMIGOS_ID, name: 'Clube dos Amigos', role: activeRole },
      { id: CLUB_ID, name: 'Clube do Casal', role: bookRole },
    ],
  });
}

describe('THE ADMIN GATE IS MEASURED AGAINST THE CLUB OF THE BOOK (rules 1, 2)', () => {
  it('refuses the EDIT route when the admin role is in the ACTIVE club and NOT in the club of the book', async () => {
    const calls = await renderEdit({ me: twoClubs('OWNER', 'MEMBER') });

    expect(screen.queryByText(pt.pages.bookForm.notAdmin)).not.toBeNull();
    expect(screen.queryByLabelText(TITLE_LABEL)).toBeNull();
    expect(bookWrites(calls)).toHaveLength(0);
    expect(planWrites(calls)).toHaveLength(0);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('opens the EDIT route when the admin role is in the CLUB OF THE BOOK, even with another club active', async () => {
    await renderEdit({ me: twoClubs('MEMBER', 'OWNER') });

    // O papel do clube ATIVO é `MEMBER`; o do clube do LIVRO é `OWNER`. Quem
    // manda é o do livro.
    expect(screen.queryByText(pt.pages.bookForm.notAdmin)).toBeNull();
    expect(inputValue(TITLE_LABEL)).toBe('O Hobbit');
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('hides the entry on the book screen when the admin role is in the ACTIVE club only', async () => {
    await renderBookForm({
      path: `/books/${BOOK_ID}`,
      me: twoClubs('OWNER', 'MEMBER'),
      book: bookWithPlanReplyOf(aBook({ clubId: CLUB_ID }), threeDays()),
    });

    expect(
      screen.queryByRole('button', { name: pt.pages.bookForm.entry.edit }),
    ).toBeNull();
    expectNoGuilt();
  });

  it('shows the entry on the book screen when the admin role is in the CLUB OF THE BOOK', async () => {
    await renderBookForm({
      path: `/books/${BOOK_ID}`,
      me: twoClubs('MEMBER', 'ADMIN'),
      book: bookWithPlanReplyOf(aBook({ clubId: CLUB_ID }), threeDays()),
    });

    expect(
      screen.queryByRole('button', { name: pt.pages.bookForm.entry.edit }),
    ).not.toBeNull();
    expectNoGuilt();
  });

  it('refuses the CREATE route when the admin role is in the ACTIVE club and NOT in the club of the URL', async () => {
    const calls = await renderBookForm({
      path: bookNewPath(CLUB_ID),
      me: twoClubs('OWNER', 'MEMBER'),
    });

    // O clube do CAMINHO é quem manda: é o `:clubId` que o backend vai validar
    // contra o `Membership`.
    expect(screen.queryByText(pt.pages.bookForm.notAdmin)).not.toBeNull();
    expect(screen.queryByLabelText(TITLE_LABEL)).toBeNull();
    expect(creates(calls)).toHaveLength(0);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });
});

describe('WHICH WRITE FAILED DECIDES WHICH SENTENCE (the `stage` discriminator)', () => {
  it('a 400 on the PATCH of the book says "check the data" and resurrects NO row', async () => {
    const apiText = 'month must be a "YYYY-MM" club month';
    const calls = await renderEdit({
      book: bookRoute(aBook({ id: BOOK_ID, clubId: CLUB_ID }), threeDays(), {
        status: 400,
        body: { error: apiText },
      }),
    });

    // As DUAS metades mudam: o livro e o plano. O `PATCH` vai primeiro e falha,
    // então o `PUT` nem sai.
    await typeInto(TITLE_LABEL, 'O Hobbit anotado');
    await pressLabel(rowLabel('remove', 2));
    await pressLabel(pt.pages.bookForm.save);

    expect(bookWrites(calls)).toHaveLength(1);
    expect(planWrites(calls)).toHaveLength(0);

    // A frase é a do 400 GENÉRICO — e NÃO a do dia com anotação, que é a do
    // `PUT` do plano.
    expect(screen.queryByText(pt.errors.badRequest)).not.toBeNull();
    expect(screen.queryByText(pt.pages.bookForm.plan.dayHasNotes)).toBeNull();
    expect(readableText()).not.toContain(apiText);
    // E nenhuma linha ressuscitou: quem removeu o dia 2 continua com dois dias.
    expect(rowCount()).toBe(2);
    expectNoGuiltBesidesFormError([pt.errors.badRequest]);
  });

  it('a 400 WITH details on the plan is a validation error, not the notes guard', async () => {
    const apiText = 'Array must contain at least 1 element(s)';
    const calls = await renderEdit({
      plan: {
        status: 400,
        body: {
          error: apiText,
          details: [{ path: 'planItems', message: apiText }],
        },
      },
    });

    await pressLabel(rowLabel('remove', 2));
    await pressLabel(pt.pages.bookForm.save);

    expect(planWrites(calls)).toHaveLength(1);
    // O `details` é o que separa "o Zod recusou o plano" de "este dia tem
    // anotação" — o segundo é erro de DOMÍNIO e chega sem `details` (§6.2).
    expect(screen.queryByText(pt.errors.fields.planItems)).not.toBeNull();
    expect(screen.queryByText(pt.pages.bookForm.plan.dayHasNotes)).toBeNull();
    expect(readableText()).not.toContain(apiText);
    // E nada ressuscita: a recusa não diz que o servidor ainda tem o dia.
    expect(rowCount()).toBe(2);
    expectNoGuiltBesidesFormError([pt.errors.fields.planItems]);
  });
});

describe('THE VALIDATION BRANCHES THAT HAD NO ACCUSER (rules 3, 9, 10)', () => {
  it('marks the row of a day with NO DATE, and sends nothing', async () => {
    /*
      O caminho real: com o plano vazio, "Acrescentar um dia" não tem um dia
      anterior de onde derivar a data, então a linha nasce SEM data. É o único
      jeito de uma linha sem data existir na tela — e ele é o primeiro que
      alguém encontra ao montar um plano à mão.
    */
    const calls = await renderBookForm();

    await fillBook();
    await pressLabel(pt.pages.bookForm.plan.add);
    await typeInto(rowLabel('titleLabel', 1), 'Cap. 1');
    await pressLabel(pt.pages.bookForm.save);

    expect(creates(calls)).toHaveLength(0);
    expect(
      screen.queryByText(pt.pages.bookForm.plan.dateRequired),
    ).not.toBeNull();
    expect(ariaInvalid(rowLabel('dateLabel', 1))).toBe('true');
    expectNoGuiltBesidesFormError([pt.pages.bookForm.plan.dateRequired]);
  });

  it('marks a day whose date came MALFORMED FROM THE SERVER, and sends nothing', async () => {
    /*
      ⚠️ **ONDE ESTE RAMO É DECIDÍVEL** (§7.10). O campo é `type="date"`, e o
      jsdom — como todo navegador que implementa o tipo — sanitiza um valor
      impossível para `''`: pela DIGITAÇÃO o ramo é inalcançável, e um teste que
      tentasse por ali estaria provando a regra da data VAZIA.

      O caminho real é o DADO: o `planItemResponseSchema` declara
      `date: z.string()` (não o dia refinado), então uma linha malformada no
      banco chega intacta à tela — é a mesma razão pela qual o `formatPlanDay`
      da tela do livro confere `isCalendarDay` antes de formatar.
    */
    const calls = await renderEdit({
      planItems: [
        aPlanItem({ id: 'p-1', order: 1, date: '2026-02-31', title: 'Cap. 1' }),
      ],
    });

    await pressLabel(pt.pages.bookForm.save);

    expect(planWrites(calls)).toHaveLength(0);
    expect(bookWrites(calls)).toHaveLength(0);
    expect(
      screen.queryByText(pt.pages.bookForm.plan.dateInvalid),
    ).not.toBeNull();
    expect(ariaInvalid(rowLabel('dateLabel', 1))).toBe('true');
    expectNoGuiltBesidesFormError([pt.pages.bookForm.plan.dateInvalid]);
  });

  it('marks the page count when it is not a positive whole number, and sends nothing (rule 3)', async () => {
    const calls = await renderBookForm();

    await fillBook();
    await typeInto(PAGES_LABEL, 'trezentas');
    await pressLabel(pt.pages.bookForm.save);

    expect(creates(calls)).toHaveLength(0);
    expect(screen.queryByText(pt.errors.fields.totalPages)).not.toBeNull();
    expect(ariaInvalid(PAGES_LABEL)).toBe('true');
    expectNoGuiltBesidesFormError([pt.errors.fields.totalPages]);
  });
});

describe('A /me THAT FAILED IS NOT "LOADING…" (rule 18)', () => {
  it('shows a translated sentence and a retry on the CREATE route', async () => {
    const apiText = 'Internal Server Error';
    const calls = await renderBookForm({
      path: bookNewPath(CLUB_ID),
      me: { status: 500, body: { error: apiText } },
    });

    // Sem isto a tela dizia "Carregando…" para sempre: quem abre o app sem
    // rede fica olhando uma frase que mente, e sem nada para tocar.
    expect(screen.queryByText(pt.pages.bookForm.loading)).toBeNull();
    expect(screen.queryByText(pt.errors.serverError)).not.toBeNull();
    expect(readableText()).not.toContain(apiText);
    expect(requestsTo(calls, '/me')).toHaveLength(1);

    await pressLabel(pt.pages.bookForm.retry);

    expect(requestsTo(calls, '/me')).toHaveLength(2);
    // `expectNoGuilt` inteiro, e não a versão estreitada: o aviso de "não deu
    // para carregar" NÃO é vermelho — vermelho aqui é campo de formulário.
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('shows a translated sentence and a retry on the EDIT route', async () => {
    const calls = await renderEdit({
      me: { status: 500, body: { error: 'Internal Server Error' } },
    });

    expect(screen.queryByText(pt.pages.bookForm.loading)).toBeNull();
    expect(screen.queryByText(pt.errors.serverError)).not.toBeNull();
    // E o formulário NÃO abre: sem o `/me` não há como saber o papel, e abrir
    // um formulário de administração "no escuro" é pior que a frase.
    expect(screen.queryByLabelText(TITLE_LABEL)).toBeNull();
    expect(requestsTo(calls, '/me')).toHaveLength(1);

    await pressLabel(pt.pages.bookForm.retry);

    expect(requestsTo(calls, '/me')).toHaveLength(2);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });
});

describe('THE DAY THAT COMES BACK COMES BACK AS THE PERSON HAD IT (rule 12)', () => {
  it('keeps the edit made to the removed day, not the version the server still has', async () => {
    const calls = await renderEdit({
      plan: {
        status: 400,
        body: {
          error: 'cannot remove 1 reading plan day(s) that already have notes',
        },
      },
    });

    // Corrige o tema do dia 2 e SÓ ENTÃO o remove — é o caminho de quem mudou
    // de ideia depois de digitar.
    await typeInto(rowLabel('titleLabel', 2), 'Cap. 2 — A comida cozinhou');
    await pressLabel(rowLabel('remove', 2));
    await pressLabel(pt.pages.bookForm.save);

    expect(planWrites(calls)).toHaveLength(1);
    expect(rowCount()).toBe(3);
    expect(inputValue(rowLabel('dateLabel', 2))).toBe('2024-03-06');
    // A versão de QUEM DIGITOU, e não a `Cap. 2` que o servidor ainda tem:
    // restaurar a do servidor apagaria a correção em silêncio.
    expect(inputValue(rowLabel('titleLabel', 2))).toBe(
      'Cap. 2 — A comida cozinhou',
    );
    expectNoGuiltBesidesFormError([pt.pages.bookForm.plan.dayHasNotes]);
  });
});
