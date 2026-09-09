import {
  type BookResponse,
  bookResponseSchema,
  type BookWithPlanResponse,
  bookWithPlanResponseSchema,
  isClubMonth,
  type PlanItemResponse,
  replacePlanResponseSchema,
} from '@clube/shared';
import { ApiError, apiErrorKey } from '@clube/shared/client';
import { Button, Field } from '@clube/ui';
import type { TFunction } from 'i18next';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { type ActiveClubValue, useActiveClub } from '../club/active-club';
import { Notice, Screen } from './chrome';
import { messageFor, resolveApiError } from './form-errors';
import { FORM_ERROR_CLASS, TEXT_INPUT_CLASS } from './form-styles';
import { bookPath, isClubAdmin } from './paths';
import {
  findPlanProblem,
  PlanEditor,
  type PlanProblem,
  type PlanRow,
  planRowsFrom,
} from './plan-editor';

/**
 * O CADASTRO DO LIVRO E DO PLANO (Tarefa 20) — a tela que aposenta o Swagger.
 *
 * ⚠️ **UMA TELA, DOIS MODOS** (decisão A): `/clubs/:clubId/books/new` e
 * `/books/:bookId/edit` são o MESMO formulário. Duas telas dobrariam a
 * validação do plano, que é a parte difícil.
 *
 * ⚠️ **E O EDITOR DE PLANO É ARQUIVO PRÓPRIO** (decisão B, e é requisito):
 * `plan-editor.tsx`. O `free-note.tsx` chegou a 580 linhas de código
 * acumulando modos, e a Tarefa 19 registrou isso como o próximo lugar onde a
 * complexidade morde. Aqui a divisão é feita ANTES.
 */

/**
 * ⚠️ **O `Notice` E O `Screen` VÊM DE `./chrome`** desde a Tarefa 25 — eram
 * cópias locais, e a do `Notice` era uma de cinco (decisão H da 25).
 *
 * ⚠️ **E ESTA TELA PASSA `width="wide"` NOS QUATRO `Screen`** (`max-w-4xl`, a
 * decisão F desta fatia): é a única tela de administração do MVP 1, e a linha
 * do plano tem três campos. No celular ela empilha; no desktop ela cabe inteira
 * numa linha. As outras telas ficam na coluna estreita, que é o padrão.
 */

/** Identidade estável para o modo criar — o plano nasce vazio. */
const NO_PLAN: readonly PlanItemResponse[] = [];

type EditState =
  | { status: 'loading' }
  | { status: 'ready'; data: BookWithPlanResponse }
  | { status: 'failed'; error: unknown };

const LOADING: EditState = { status: 'loading' };

export function BookFormPage() {
  const { bookId, clubId } = useParams();

  // Dois modos, um arquivo: o que muda antes do formulário é de ONDE vem o
  // clube (do caminho, ao criar; do livro carregado, ao editar).
  return clubId === undefined ? (
    <EditBook bookId={bookId ?? ''} />
  ) : (
    <NewBook clubId={clubId} />
  );
}

/**
 * ⚠️ **O `/me` QUE FALHOU NÃO É "CARREGANDO…"** — achado da auditoria da
 * Tarefa 20.
 *
 * Os dois modos mapeavam TODO status ≠ `ready` para a frase de carregamento,
 * `failed` incluído: quem abrisse a tela sem rede ficava olhando uma frase que
 * mente, para sempre, sem nada para tocar. A home já tratava o caso desde a
 * Tarefa 16 (`home.tsx`, `activeClubState.status === 'failed'`) — este é o
 * mesmo desenho, e a frase vem por CHAVE (`resolveApiError`), nunca do texto
 * da API (§6.2).
 *
 * A ordem importa: `failed` é conferido ANTES de `!== 'ready'`, senão o ramo
 * de carregamento engole o de erro outra vez.
 */
function meNotice(t: TFunction, club: ActiveClubValue): ReactNode {
  if (club.status === 'failed') {
    return (
      <Notice
        action={
          <Button onClick={club.reload} variant="ghost">
            {t('pages.bookForm.retry')}
          </Button>
        }
        title={messageFor(t, resolveApiError(club.error, { fields: [] }).key)}
      />
    );
  }

  if (club.status !== 'ready') {
    return <p className="text-sm text-muted">{t('pages.bookForm.loading')}</p>;
  }

  return null;
}

function NewBook({ clubId }: { clubId: string }) {
  const { t } = useTranslation();
  const club = useActiveClub();

  const waiting = meNotice(t, club);
  if (waiting !== null) {
    return (
      <Screen title={t('pages.bookForm.newTitle')} width="wide">
        {waiting}
      </Screen>
    );
  }

  // REGRA 2: a rota também recusa. Sem isso, "a entrada não aparece" seria só
  // um botão escondido, e a URL colada num grupo do WhatsApp abriria o
  // formulário para qualquer membro.
  if (!isClubAdmin(club.clubs, clubId)) {
    return (
      <Screen title={t('pages.bookForm.newTitle')} width="wide">
        <Notice title={t('pages.bookForm.notAdmin')} />
      </Screen>
    );
  }

  return (
    <Screen title={t('pages.bookForm.newTitle')} width="wide">
      <BookForm book={null} clubId={clubId} planItems={NO_PLAN} />
    </Screen>
  );
}

function EditBook({ bookId }: { bookId: string }) {
  const { t } = useTranslation();
  const { api } = useAuth();
  const club = useActiveClub();

  const [state, setState] = useState<EditState>(LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState(LOADING);

    void api
      .get(`/books/${encodeURIComponent(bookId)}`, bookWithPlanResponseSchema)
      .then((data) => {
        if (cancelled) return;
        setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: 'failed', error });
      });

    return () => {
      cancelled = true;
    };
  }, [api, bookId, attempt]);

  function body(): ReactNode {
    // O `/me` primeiro: sem saber o papel não há formulário de administração a
    // mostrar, e "carregando" com o `/me` morto é a tela que mente.
    const waiting = meNotice(t, club);
    if (waiting !== null) return waiting;

    if (state.status === 'loading') {
      return (
        <p className="text-sm text-muted">{t('pages.bookForm.loading')}</p>
      );
    }

    if (state.status === 'failed') {
      return (
        <Notice
          action={
            <Button
              onClick={() => setAttempt((previous) => previous + 1)}
              variant="ghost"
            >
              {t('pages.bookForm.retry')}
            </Button>
          }
          title={t('pages.bookForm.bookUnavailable')}
        />
      );
    }

    // REGRA 2, no modo editar: o papel é conferido contra o clube DO LIVRO.
    if (!isClubAdmin(club.clubs, state.data.book.clubId)) {
      return <Notice title={t('pages.bookForm.notAdmin')} />;
    }

    return (
      <BookForm
        book={state.data.book}
        clubId={state.data.book.clubId}
        planItems={state.data.planItems}
      />
    );
  }

  return (
    <Screen title={t('pages.bookForm.editTitle')} width="wide">
      {body()}
    </Screen>
  );
}

/**
 * O que o admin digitou nos campos do LIVRO — tudo `string`, porque é o que um
 * `<input>` entrega. A conversão para `number` acontece uma vez só, na hora de
 * montar o corpo.
 */
interface BookDraft {
  title: string;
  month: string;
  author: string;
  coverUrl: string;
  totalPages: string;
}

const EMPTY_DRAFT: BookDraft = {
  title: '',
  month: '',
  author: '',
  coverUrl: '',
  totalPages: '',
};

/**
 * O corpo do `POST`, montado campo a campo.
 *
 * ⚠️ **É um tipo LOCAL e não o `CreateBookBody` de `shared`, e a razão é a
 * mesma do `NotePatch` da Tarefa 19**: o inferido carrega os refinamentos
 * (`clubMonth`, `calendarDay`), e provar o refinamento de um valor que nós
 * mesmos acabamos de validar exigiria um `as` (proibido) ou um `parse`. O
 * schema continua sendo a fronteira — ele valida no backend —, e a RESPOSTA é
 * validada aqui pelo `bookWithPlanResponseSchema` (§6.8).
 *
 * REGRA 6: **sem `order`, sem `clubId`, sem `id`.** O `order` é derivado da
 * posição pelo domínio, o `clubId` vem da ROTA e o ator vem do JWT (§6.3).
 */
interface PlanItemBody {
  date: string;
  title: string;
  reference?: string;
}

interface CreateBookBody {
  title: string;
  month: string;
  author?: string;
  coverUrl?: string;
  totalPages?: number;
  planItems?: PlanItemBody[];
}

/** Só dígitos e maior que zero — é o `z.number().int().positive()` da borda. */
function isPositiveInteger(value: string): boolean {
  return /^\d+$/u.test(value) && Number(value) > 0;
}

/**
 * REGRAS 3 e 4 — O QUE A TELA REPROVA ANTES DE ENVIAR, campo por campo.
 *
 * Não é desconfiança do backend: é que um 400 do Zod chega em INGLÊS e sem
 * lugar na tela (§6.2), então a mesma recusa custaria uma ida à rede e uma
 * frase que a pessoa não pode ler. O backend continua sendo o guardião — esta
 * é a primeira barreira, não a única.
 */
function bookFieldProblems(draft: BookDraft): Readonly<Record<string, string>> {
  const fields: Record<string, string> = {};

  if (draft.title.trim() === '') {
    fields['title'] = 'pages.bookForm.fields.titleRequired';
  }

  const month = draft.month.trim();
  if (month === '') {
    fields['month'] = 'pages.bookForm.fields.monthRequired';
  } else if (!isClubMonth(month)) {
    // REGRA 4: a MESMA função que o `clubMonth` do `shared` usa no
    // `.refine()`. Um regex novo aqui divergiria do da borda em silêncio.
    fields['month'] = 'pages.bookForm.fields.monthInvalid';
  }

  const totalPages = draft.totalPages.trim();
  if (totalPages !== '' && !isPositiveInteger(totalPages)) {
    fields['totalPages'] = 'errors.fields.totalPages';
  }

  return fields;
}

/**
 * REGRA 5 — CAMPO OPCIONAL EM BRANCO NÃO ENTRA NO CORPO, **nem como `''`**.
 *
 * O `createBookSchema` aceita `''` na capa (é o que um formulário manda), e o
 * domínio o transforma em `null`. Mas mandar `''` é dizer "grave vazio" quando
 * a intenção é "não informei" — e no `PATCH` os dois casos são literalmente
 * diferentes (ausente não mexe, `null` limpa).
 */
function textOrAbsent(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** As linhas do plano viram o `planItems` do corpo — regras 5, 6 e 13. */
function planItemsBody(rows: readonly PlanRow[]): PlanItemBody[] {
  return rows.map((row) => {
    const item: PlanItemBody = {
      date: row.date.trim(),
      title: row.title.trim(),
    };
    // Referência em branco é AUSÊNCIA, não string vazia (regra 5).
    const reference = textOrAbsent(row.reference);
    if (reference !== undefined) item.reference = reference;
    return item;
  });
}

/** O corpo do `PATCH` — ausente NÃO MEXE, `null` LIMPA (regra 5 da Tarefa 06). */
interface BookPatchBody {
  title?: string;
  month?: string;
  author?: string | null;
  coverUrl?: string | null;
  totalPages?: number | null;
}

/** A última versão do LIVRO que o servidor confirmou. */
interface ConfirmedBook {
  title: string;
  month: string;
  author: string | null;
  coverUrl: string | null;
  totalPages: number | null;
}

function confirmedOf(book: BookResponse): ConfirmedBook {
  return {
    title: book.title,
    month: book.month,
    author: book.author,
    coverUrl: book.coverUrl,
    totalPages: book.totalPages,
  };
}

function draftOf(book: BookResponse | null): BookDraft {
  if (book === null) return EMPTY_DRAFT;
  return {
    title: book.title,
    month: book.month,
    // `null` é campo em BRANCO, nunca a palavra "null" no `<input>`.
    author: book.author ?? '',
    coverUrl: book.coverUrl ?? '',
    totalPages: book.totalPages === null ? '' : String(book.totalPages),
  };
}

/**
 * REGRA 15 — **SÓ O QUE MUDOU**, por comparação com a versão que o servidor
 * confirmou.
 *
 * É a mesma regra das Tarefas 18 e 19 e pelo mesmo motivo: um `PATCH` que
 * manda o formulário inteiro grava uma linha nova no banco em toda abertura de
 * tela, e um `PUT` de plano sem mudança nenhuma faz um diff inútil sobre o
 * plano do mês.
 */
function bookPatchBody(
  draft: BookDraft,
  confirmed: ConfirmedBook,
): BookPatchBody {
  const patch: BookPatchBody = {};

  const title = draft.title.trim();
  if (title !== confirmed.title) patch.title = title;

  const month = draft.month.trim();
  if (month !== confirmed.month) patch.month = month;

  // `?? null` é o "LIMPE este campo" explícito do `editBookSchema` — e é
  // diferente de ausente, que é "não mexa".
  const author = textOrAbsent(draft.author) ?? null;
  if (author !== confirmed.author) patch.author = author;

  const coverUrl = textOrAbsent(draft.coverUrl) ?? null;
  if (coverUrl !== confirmed.coverUrl) patch.coverUrl = coverUrl;

  const pages = textOrAbsent(draft.totalPages);
  const totalPages = pages === undefined ? null : Number(pages);
  if (totalPages !== confirmed.totalPages) patch.totalPages = totalPages;

  return patch;
}

/**
 * REGRA 11 — QUAL LINHA O SERVIDOR RECUSOU.
 *
 * O `details[].path` da API é `planItems.7.date` (§6.2), e as duas metades têm
 * donos diferentes: o **índice** sai do `path` (é NÚMERO, não texto da API) e a
 * **frase** sai do catálogo, via `apiErrorKey` — que normaliza
 * `planItems.7.date` → `planItems.*.date` → `errors.fields.planItem.date`. Um
 * plano de trinta dias tem UMA chave de tradução, não trinta.
 */
const PLAN_ROW_PATH = /^planItems\.(\d+)\.(date|title|reference)$/u;

function planRowProblem(error: unknown): PlanProblem | null {
  if (!(error instanceof ApiError)) return null;

  const detail = error.details?.[0];
  if (detail === undefined) return null;

  const match = PLAN_ROW_PATH.exec(detail.path);
  if (match === null) return null;

  const field = match[2];
  // O narrowing é do compilador, não um `as`: `noUncheckedIndexedAccess` faz
  // `match[2]` ser `string | undefined`, e o regex já limitou os valores.
  if (field !== 'date' && field !== 'title' && field !== 'reference') {
    return null;
  }

  return { index: Number(match[1]), field, key: apiErrorKey(error) };
}

/**
 * REGRA 12 — **A LINHA VOLTA, E VOLTA COMO A PESSOA A TINHA.**
 *
 * O 400 de "este dia já tem anotação" significa que o servidor CONTINUA com o
 * dia que a tela tirou. Deixar a lista sem ele esconderia o motivo da recusa e
 * faria todo salvamento seguinte falhar igual, sem explicação.
 *
 * ⚠️ **E a versão que volta é a de QUEM DIGITOU, não a do servidor** — achado
 * da auditoria. Quem corrige o tema de um dia e só então o remove teria a
 * correção apagada em silêncio pela linha que o servidor ainda tem; o `removed`
 * (as linhas que saíram desta sessão de edição) é a memória disso. Sem
 * correspondência, cai na versão confirmada, que é o melhor que existe.
 *
 * A reinserção é por DATA e a lista volta ordenada: é a mesma invariante de
 * `findPlanDateProblem` (estritamente crescente), então o plano restaurado
 * continua salvável.
 */
function restoreRemovedRows(
  rows: readonly PlanRow[],
  confirmed: readonly PlanRow[],
  removed: readonly PlanRow[],
): readonly PlanRow[] {
  const present = new Set(rows.map((row) => row.date));
  const asTyped = new Map(removed.map((row) => [row.date, row]));
  const missing = confirmed
    .filter((row) => !present.has(row.date))
    .map((row) => asTyped.get(row.date) ?? row);
  if (missing.length === 0) return rows;

  return [...rows, ...missing].sort((left, right) =>
    left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
  );
}

/**
 * Os campos do LIVRO que esta tela tem. Um `details[].path` fora desta lista
 * não pode virar erro de campo — o `Field` não existiria e a mensagem
 * desapareceria (→ `form-errors.ts`).
 */
const BOOK_FIELDS: readonly string[] = [
  'title',
  'month',
  'author',
  'coverUrl',
  'totalPages',
];

/**
 * REGRA 12 — **400 SEM `details` É ERRO DE DOMÍNIO**, e no `PUT` do plano ele
 * significa uma coisa só: "nenhum dia com anotação pode ser removido".
 *
 * ⚠️ **O `details === undefined` é a metade que decide**, e a auditoria mediu
 * que ela não tinha acusador. O 400 do Zod da borda vem COM `details` (§6.2) e
 * é outra coisa — um `planItems` malformado, por exemplo. Tratá-lo como a
 * guarda de anotação diria a frase errada E ressuscitaria linhas que o
 * servidor nunca disse ter. O acusador é `a 400 WITH details on the plan is a
 * validation error, not the notes guard`.
 */
function isDomainBadRequest(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 400 &&
    error.details === undefined
  );
}

interface BookFormProps {
  /** O clube dono do livro: da ROTA ao criar, do LIVRO ao editar. */
  clubId: string;
  /** `null` = criar. */
  book: BookResponse | null;
  planItems: readonly PlanItemResponse[];
}

function BookForm({ book, clubId, planItems }: BookFormProps) {
  const { t } = useTranslation();
  const { api } = useAuth();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<BookDraft>(() => draftOf(book));
  const [rows, setRows] = useState<readonly PlanRow[]>(() =>
    planRowsFrom(planItems),
  );
  /**
   * A LINHA DE BASE do livro e do plano. Enquanto o formulário for igual a
   * ela, salvar não dispara requisição nenhuma (regra 15) — e ela vem sempre
   * da RESPOSTA do servidor, nunca do que mandamos.
   */
  const [confirmedBook, setConfirmedBook] = useState<ConfirmedBook | null>(
    book === null ? null : confirmedOf(book),
  );
  const [confirmedPlan, setConfirmedPlan] = useState<readonly PlanRow[]>(() =>
    planRowsFrom(planItems),
  );

  /**
   * As linhas que SAÍRAM do plano nesta sessão de edição — a memória que
   * permite a regra 12 devolver a linha com o tema que a pessoa digitou, e não
   * com o que o servidor ainda tem. Esvazia quando o `PUT` dá certo: a partir
   * daí o servidor concorda com a tela, e não há o que restaurar.
   */
  const [removedRows, setRemovedRows] = useState<readonly PlanRow[]>([]);
  const [fields, setFields] = useState<Readonly<Record<string, string>>>({});
  const [planProblem, setPlanProblem] = useState<PlanProblem | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /**
   * QUAL das duas escritas estava correndo quando o erro veio.
   *
   * Ele existe porque o 400 significa coisas diferentes nas duas: no `PATCH`
   * do livro é entrada malformada, no `PUT` do plano é a guarda "este dia já
   * tem anotação" (regra 12). Sem o estágio, um `PATCH` recusado devolveria a
   * frase do plano — e ressuscitaria linhas que ninguém removeu.
   */
  const stage = useRef<'book' | 'plan'>('book');

  /**
   * O `PlanEditor` é controlado e só devolve a lista NOVA — quem sabe o que
   * saiu é esta comparação, pela `key` (a identidade estável da linha, que não
   * muda quando alguém edita a data).
   */
  function changeRows(next: readonly PlanRow[]): void {
    const present = new Set(next.map((row) => row.key));
    const gone = rows.filter((row) => !present.has(row.key));
    if (gone.length > 0) setRemovedRows((previous) => [...previous, ...gone]);
    setRows(next);
  }

  function set<K extends keyof BookDraft>(key: K, value: string): void {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function fieldError(name: keyof BookDraft): string | undefined {
    const key = fields[name];
    return key === undefined ? undefined : messageFor(t, key);
  }

  /**
   * O erro de uma escrita → linha, campo ou formulário. **Nunca texto da API**
   * (§6.2): o que sai daqui é sempre CHAVE de catálogo.
   */
  function showWriteError(error: unknown, stage: 'book' | 'plan'): void {
    const rowProblem = planRowProblem(error);
    if (rowProblem !== null) {
      // REGRA 11: a linha que o `path` apontou.
      setPlanProblem(rowProblem);
      return;
    }

    // REGRA 12: a guarda "nenhum dia com anotação pode ser removido" — o único
    // 400 sem `details` que o `PUT` do plano produz. A frase e a restauração
    // são o MESMO ramo: dizer uma sem a outra deixa a tela incoerente.
    if (stage === 'plan' && isDomainBadRequest(error)) {
      setRows((previous) =>
        restoreRemovedRows(previous, confirmedPlan, removedRows),
      );
      setFormError('pages.bookForm.plan.dayHasNotes');
      return;
    }

    const message = resolveApiError(error, { fields: BOOK_FIELDS });
    if (message.field !== undefined) {
      setFields({ [message.field]: message.key });
      return;
    }
    setFormError(message.key);
  }

  async function create(): Promise<void> {
    const body: CreateBookBody = {
      title: draft.title.trim(),
      month: draft.month.trim(),
    };
    const author = textOrAbsent(draft.author);
    if (author !== undefined) body.author = author;
    const coverUrl = textOrAbsent(draft.coverUrl);
    if (coverUrl !== undefined) body.coverUrl = coverUrl;
    const totalPages = textOrAbsent(draft.totalPages);
    if (totalPages !== undefined) body.totalPages = Number(totalPages);
    // REGRA 13: plano vazio é válido, e "vazio" é AUSÊNCIA — um `planItems: []`
    // no `POST` diria a mesma coisa com uma chave a mais.
    if (rows.length > 0) body.planItems = planItemsBody(rows);

    // DECISÃO D: criar manda livro + plano JUNTOS. Em duas etapas, uma falha
    // na segunda deixaria um livro sem plano — e o mês começa torto.
    const created = await api.post(
      `/clubs/${encodeURIComponent(clubId)}/books`,
      body,
      bookWithPlanResponseSchema,
    );
    navigate(bookPath(created.book.id), { replace: true });
  }

  /**
   * DECISÃO D — editar são DUAS chamadas, e **só as que mudaram**.
   *
   * É o que a API oferece (`PATCH` do livro, `PUT` do plano), e é a regra 15
   * aplicada às duas metades: um `PUT` do plano inteiro sem mudança nenhuma
   * faria um diff inútil sobre os dias que ancoram as anotações do clube.
   */
  async function update(
    saved: BookResponse,
    confirmed: ConfirmedBook,
  ): Promise<void> {
    stage.current = 'book';
    const patch = bookPatchBody(draft, confirmed);
    const nextPlan = planItemsBody(rows);
    const planChanged =
      JSON.stringify(nextPlan) !== JSON.stringify(planItemsBody(confirmedPlan));

    if (Object.keys(patch).length > 0) {
      const updated = await api.patch(
        `/books/${encodeURIComponent(saved.id)}`,
        patch,
        bookResponseSchema,
      );
      // A linha de base vem da RESPOSTA: é o que o servidor tem de fato, e é
      // contra isso que o próximo patch nasce.
      setConfirmedBook(confirmedOf(updated));
    }

    if (planChanged) {
      stage.current = 'plan';
      // Não existe `api.put`: o cliente de `shared` expõe `request`, e
      // `packages/shared/src/client/**` não é alterado nesta fatia (compõe,
      // não muda).
      const result = await api.request(
        `/books/${encodeURIComponent(saved.id)}/plan`,
        {
          method: 'PUT',
          body: { planItems: nextPlan },
          schema: replacePlanResponseSchema,
        },
      );
      setConfirmedPlan(planRowsFrom(result.planItems));
      setRemovedRows([]);
    }

    navigate(bookPath(saved.id), { replace: true });
  }

  async function save(): Promise<void> {
    const problems = bookFieldProblems(draft);
    // REGRAS 9 e 10: a linha errada é marcada, e a regra de sequência vem do
    // `shared` — ela NÃO é reescrita aqui (→ `plan-editor.tsx`).
    const rowProblem = findPlanProblem(rows);
    if (Object.keys(problems).length > 0 || rowProblem !== null) {
      // REGRAS 3, 4, 9 e 10: o campo (ou a linha) é marcado e NADA é enviado.
      setFields(problems);
      setPlanProblem(rowProblem);
      setFormError(null);
      return;
    }

    setFields({});
    setPlanProblem(null);
    setFormError(null);
    setSaving(true);
    stage.current = 'book';

    try {
      if (book === null || confirmedBook === null) {
        await create();
      } else {
        await update(book, confirmedBook);
      }
    } catch (error: unknown) {
      // O texto NÃO se perde: o formulário inteiro continua no estado, e
      // "salvar de novo" tem o que mandar (regra 12).
      showWriteError(error, stage.current);
      setSaving(false);
    }
  }

  /**
   * Um campo do livro — rótulo, dica, erro e o `<input>`, numa chamada.
   *
   * Cinco `<Field>` com render prop escritos à mão eram setenta e cinco linhas
   * quase iguais no meio da tela, e o que muda entre eles cabe em quatro
   * argumentos. É a mesma disciplina da decisão B, uma escala abaixo: a tela
   * tem de caber na cabeça de quem a abrir depois.
   *
   * ⚠️ **É uma FUNÇÃO CHAMADA, não um componente declarado aqui dentro** — e a
   * diferença não é estilo. Um componente definido no corpo de outro tem
   * IDENTIDADE NOVA a cada render: o React desmonta e remonta a subárvore a
   * cada tecla, e o `<input>` perde o foco no meio da palavra. Chamada de
   * função, os elementos entram direto na árvore do formulário e o `Field`
   * continua sendo o mesmo tipo entre renders.
   */
  function textField(options: {
    name: keyof BookDraft;
    label: string;
    hint?: string;
    type?: 'text' | 'url';
    inputMode?: 'numeric';
  }): ReactNode {
    const { hint, inputMode, label, name, type = 'text' } = options;

    return (
      <Field error={fieldError(name)} hint={hint} label={label}>
        {(control) => (
          <input
            {...control}
            className={TEXT_INPUT_CLASS}
            inputMode={inputMode}
            onChange={(event) => set(name, event.target.value)}
            type={type}
            value={draft[name]}
          />
        )}
      </Field>
    );
  }

  return (
    <>
      {textField({ name: 'title', label: t('pages.bookForm.fields.title') })}
      {/*
        ⚠️ **O MÊS É `type="text"` E NÃO `type="month"`, e é decisão MEDIDA.**

        `<input type="month">` existe só no Chrome e no Edge: Firefox e Safari
        (o navegador do iPhone) caem em campo de TEXTO, e é lá que um "2026-13"
        entra. Ou seja, o tipo nativo não substitui a regra 4 — ele só a
        esconde de metade dos navegadores.

        E esconderia do TESTE também: o algoritmo de sanitização do
        `type="month"` (que o jsdom implementa, como o Chrome) troca todo valor
        malformado por `''`, então a regra 4 viraria a regra 3 ("mês em
        branco") e o mutante que apaga o `isClubMonth` sobreviveria. →
        `docs/CONVENCOES-CODIGO.md` §7.6.1: fixture que o framework interpreta
        diferente do runtime real é falso verde.

        O campo do PLANO continua `type="date"` — esse é suportado pelos quatro
        navegadores, e lá o seletor nativo é o que evita digitar trinta datas.
      */}
      {textField({
        name: 'month',
        label: t('pages.bookForm.fields.month'),
        hint: t('pages.bookForm.fields.monthHint'),
        inputMode: 'numeric',
      })}
      {textField({
        name: 'author',
        label: t('pages.bookForm.fields.author'),
        hint: t('pages.bookForm.fields.optionalHint'),
      })}
      {textField({
        name: 'coverUrl',
        label: t('pages.bookForm.fields.coverUrl'),
        hint: t('pages.bookForm.fields.optionalHint'),
        type: 'url',
      })}
      {textField({
        name: 'totalPages',
        label: t('pages.bookForm.fields.totalPages'),
        hint: t('pages.bookForm.fields.optionalHint'),
        inputMode: 'numeric',
      })}

      {/* DECISÃO B: as linhas do plano moram em `plan-editor.tsx`. */}
      <PlanEditor onChange={changeRows} problem={planProblem} rows={rows} />

      {formError !== null ? (
        <p className={FORM_ERROR_CLASS} role="alert">
          {/* Nada da API na tela: o erro vira CHAVE de catálogo (§6.2). */}
          {messageFor(t, formError)}
        </p>
      ) : null}

      <div className="flex">
        <Button loading={saving} onClick={() => void save()} size="lg">
          {t('pages.bookForm.save')}
        </Button>
      </div>
    </>
  );
}
