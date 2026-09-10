import {
  bookWithPlanResponseSchema,
  type HighlightResponse,
  highlightResponseSchema,
  highlightsResponseSchema,
} from '@clube/shared';
import { ApiError } from '@clube/shared/client';
import { Button } from '@clube/ui';
import {
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { useActiveClub } from '../club/active-club';
import { Notice, Screen, TEXT_LINK_CLASS } from './chrome';
import { messageFor, resolveApiError } from './form-errors';
import { FORM_ERROR_CLASS } from './form-styles';
import { type HighlightColor } from './highlight-colors';
import {
  CommentLabel,
  commentOf,
  type Draft,
  draftOf,
  EMPTY_DOC,
  EMPTY_DRAFT,
  hasProblem,
  HighlightFields,
  NO_PROBLEMS,
  type Problems,
  problemsOf,
  textOrAbsent,
} from './highlight-fields';
import { acervoPath } from './paths';

/**
 * O FORMULÁRIO DO GRIFO (Tarefa 25) — registrar e corrigir.
 *
 * ⚠️ **TELA PRÓPRIA, E NÃO UM `Sheet` DENTRO DA COLEÇÃO** (decisão B, e é a
 * decisão B da Tarefa 19 pelo mesmo motivo medido): o comentário usa o editor,
 * o editor precisa de altura, e o teclado do celular come metade da tela. Um
 * sheet com editor dentro é o caminho curto para o teclado tapar o texto.
 *
 * ⚠️ **REGISTRAR É EXPLÍCITO** (regra 19). Um autosave na tela de registro
 * criaria um grifo por tela aberta — e `POST` não é idempotente, então o
 * sintoma seria LINHA NOVA no acervo do clube a cada abertura, não uma
 * reescrita. Aqui o `POST` sai do botão, e não há autosave nenhum: o grifo é um
 * registro curto (trecho, cor, página, comentário), não um documento que se
 * escreve por meia hora — a razão pela qual a anotação tem autosave e este não.
 *
 * ⚠️ **E CORRIGIR SÓ MANDA O QUE MUDOU** (regra 18). O `editHighlightSchema`
 * distingue ausente (não mexe) de `null` (limpa o campo), então o patch é
 * montado por COMPARAÇÃO com a versão que o servidor confirmou — e um patch
 * vazio não vira requisição nenhuma. É isso que faz "abrir a correção e não
 * mudar nada" não gastar um `UPDATE` (e um `updatedAt` novo) por visita,
 * inclusive quando o editor emite o `onChange` espúrio da Tarefa 14.
 *
 * ⚠️ **O COMENTÁRIO DISTINGUE "NÃO HÁ" DE "VAZIO"** (regra 16), e é a distinção
 * mais fácil de perder: o editor SEMPRE tem um documento (o parágrafo em
 * branco), então "o editor emitiu algo" não é "há comentário". → `commentOf`.
 *
 * ⚠️ **O EDITOR ENTRA POR `React.lazy()`** — a medição da Tarefa 14: +454 kB no
 * chunk de ENTRADA se ele entrar por import estático. O acusador é
 * `src/__tests__/bundle-guard.test.ts`, que compila de verdade.
 *
 * ⚠️ **E OS CAMPOS MORAM EM `highlight-fields.tsx`** — a divisão feita ANTES,
 * como a decisão B da Tarefa 20 (`book-form` + `plan-editor`). Medido pelo
 * comando que o docblock de `highlights.tsx` fixa: num arquivo só esta tela
 * daria **618 linhas de código**, mais que o `free-note.tsx` (**565**), que a
 * Tarefa 19 registrou como o próximo lugar onde a complexidade morde.
 * Divididos, são **423 aqui + 189 lá**. Aqui fica o que fala com a API; lá, os
 * campos, a paleta e o que a tela recusa antes de enviar.
 */

/** O terceiro import dinâmico do editor no app. → `free-note.tsx`. */
const RichEditor = lazy(async () => {
  const editor = await import('@clube/ui/editor');
  return { default: editor.RichEditor };
});

/**
 * O corpo do `POST`, montado campo a campo.
 *
 * ⚠️ **É um tipo LOCAL e não o `CreateHighlightBody` de `shared`, e a razão é o
 * `commentDoc`** — a mesma do `NotePatch` da Tarefa 19: o `noteDocSchema`
 * infere `{ type: 'doc' } & { [k: string]: unknown }`, e o que o editor entrega
 * é `Record<string, unknown>`; provar o literal `'doc'` exigiria um `as`
 * (proibido) ou um `parse` de um documento que nós mesmos acabamos de produzir.
 * O schema continua sendo a fronteira — ele valida no backend —, e a RESPOSTA é
 * validada aqui pelo `highlightResponseSchema` (§6.8).
 *
 * Não existem `commentText`, `userId`, `clubId`, `bookId` nem `status`: o texto
 * é DERIVADO no backend (ADR 0001), o autor vem do JWT, o clube vem de
 * `book.clubId` e o livro vem da ROTA (§6.3). O corpo é `.strict()`, então
 * qualquer um deles é **400 e nada escrito**.
 */
interface CreateBody {
  quote: string;
  color: HighlightColor;
  page?: number;
  reference?: string;
  commentDoc?: Record<string, unknown>;
}

/**
 * O corpo do `PATCH`.
 *
 * `null` é o "LIMPE este campo" do `editHighlightSchema`, e é diferente de
 * ausente, que é "não mexa" — o schema não usa `.default()` justamente para não
 * colapsar os dois casos.
 */
interface PatchBody {
  quote?: string;
  color?: HighlightColor;
  page?: number | null;
  reference?: string | null;
  commentDoc?: Record<string, unknown> | null;
}

/** A última versão que o SERVIDOR confirmou. É contra ela que o patch nasce. */
interface Confirmed {
  quote: string;
  color: HighlightColor;
  page: number | null;
  reference: string | null;
  /** JSON, não a árvore: comparação por valor sem percorrer o ProseMirror. */
  comment: string;
}

function confirmedOf(highlight: HighlightResponse): Confirmed {
  return {
    quote: highlight.quote,
    color: highlight.color,
    page: highlight.page,
    reference: highlight.reference,
    comment: JSON.stringify(highlight.commentDoc),
  };
}

type LoadState =
  | { status: 'loading' }
  /** `mine` decide a tela inteira: formulário × recusa por autoria. */
  | { status: 'ready'; highlight: HighlightResponse; mine: boolean }
  /** O grifo não está no acervo ATIVO deste livro (arquivado, ou id errado). */
  | { status: 'missing' }
  | { status: 'failed'; error: unknown };

const LOADING: LoadState = { status: 'loading' };

/** A negativa que não muda com insistência. → `free-note.tsx`. */
function isGone(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 403 || error.status === 404)
  );
}

/**
 * O editor, sempre dentro de um `Suspense` — o chunk é o maior do app, e sem
 * `fallback` a tela ficaria em branco no lugar dele (regra 20).
 */
function LazyComment({
  doc,
  onChange,
}: {
  doc: Record<string, unknown> | undefined;
  onChange: (doc: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();

  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted">
          {t('pages.highlightForm.editorLoading')}
        </p>
      }
    >
      <RichEditor
        className="rounded-control border border-line bg-surface"
        doc={doc}
        onChange={onChange}
      />
    </Suspense>
  );
}

export function HighlightFormPage() {
  const { bookId, highlightId } = useParams();

  // Duas telas, um endereço de arquivo: os estados de "ainda não existe" e "já
  // existe" não têm nada em comum além dos campos, e um componente que fizesse
  // os dois teria um `if` em cada linha.
  return highlightId === undefined ? (
    <NewHighlight bookId={bookId ?? ''} />
  ) : (
    <ExistingHighlight bookId={bookId ?? ''} highlightId={highlightId} />
  );
}

/**
 * REGISTRAR — regras 12 a 17 e 19.
 *
 * Nenhuma requisição de carga: não há o que carregar. E nenhuma requisição de
 * escrita antes do botão.
 */
function NewHighlight({ bookId }: { bookId: string }) {
  const { t } = useTranslation();
  const { api } = useAuth();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [color, setColor] = useState<HighlightColor | null>(null);
  const [problems, setProblems] = useState<Problems>(NO_PROBLEMS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(undefined);

  /** O documento vive no ref: devolvê-lo ao editor por prop causaria eco. */
  const docRef = useRef<Record<string, unknown> | undefined>(undefined);

  function field(key: keyof Draft, value: string): void {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  async function create(): Promise<void> {
    const found = problemsOf(draft, color);
    if (hasProblem(found) || color === null) {
      // REGRAS 12, 13 e 14: o campo é marcado e NADA é enviado. Um `POST` que
      // o backend recusaria com 400 seria a mesma recusa, mais lenta e com uma
      // frase em inglês para traduzir.
      setProblems(found);
      return;
    }

    setProblems(NO_PROBLEMS);
    setSubmitting(true);
    setError(undefined);

    // REGRA 17: só os campos preenchidos. O corpo é `.strict()`.
    const body: CreateBody = { quote: draft.quote.trim(), color };
    const page = textOrAbsent(draft.page);
    if (page !== undefined) body.page = Number(page);
    // REGRA 15: referência em branco é AUSÊNCIA, não string vazia.
    const reference = textOrAbsent(draft.reference);
    if (reference !== undefined) body.reference = reference;
    // REGRA 16: comentário intocado (ou esvaziado) é AUSÊNCIA de chave.
    const comment = commentOf(docRef.current);
    if (comment !== null) body.commentDoc = comment;

    try {
      await api.post(
        `/books/${encodeURIComponent(bookId)}/highlights`,
        body,
        highlightResponseSchema,
      );
      // `replace`: o "voltar" do celular tem de devolver a pessoa à coleção, e
      // não a um formulário de registro que já virou grifo.
      navigate(acervoPath(bookId), { replace: true });
    } catch (caught: unknown) {
      setError(caught);
      setSubmitting(false);
    }
  }

  return (
    <Screen title={t('pages.highlightForm.newTitle')}>
      <HighlightFields
        color={color}
        colorError={
          problems.color
            ? t('pages.highlightForm.fields.colorRequired')
            : undefined
        }
        draft={draft}
        onColor={setColor}
        onField={field}
        pageError={
          problems.page
            ? t('pages.highlightForm.fields.pageInvalid')
            : undefined
        }
        quoteError={
          problems.quote
            ? t('pages.highlightForm.fields.quoteRequired')
            : undefined
        }
      />
      <CommentLabel />
      <LazyComment
        doc={undefined}
        onChange={(next) => {
          docRef.current = next;
        }}
      />
      {error !== undefined ? (
        <p className={FORM_ERROR_CLASS} role="alert">
          {/* Nada da API na tela: o erro vira CHAVE de catálogo (§6.2). */}
          {t('pages.highlightForm.failed')}
        </p>
      ) : null}
      <div className="flex">
        <Button
          loading={submitting}
          onClick={() => void create()}
          size="lg"
          type="button"
        >
          {t('pages.highlightForm.create')}
        </Button>
      </div>
    </Screen>
  );
}

/** CORRIGIR o meu — regras 12 a 18. */
function ExistingHighlight({
  bookId,
  highlightId,
}: {
  bookId: string;
  highlightId: string;
}) {
  const { t } = useTranslation();
  const { api } = useAuth();
  const { error: meError, me, reload, status: meStatus } = useActiveClub();
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState>(LOADING);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [color, setColor] = useState<HighlightColor | null>(null);
  const [problems, setProblems] = useState<Problems>(NO_PROBLEMS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(undefined);

  const docRef = useRef<Record<string, unknown> | undefined>(undefined);
  const confirmedRef = useRef<Confirmed | null>(null);

  /** A carga espera o `/me`: sem saber quem sou, "meu × dela" é chute. */
  const myId = me === null ? null : me.id;

  useEffect(() => {
    if (myId === null) return;

    let cancelled = false;
    setState(LOADING);

    /**
     * DUAS requisições, e nenhuma rota nova: o livro (que dá o `clubId` e faz
     * o corte de tenant) e o acervo do clube filtrado por `bookId`. Não existe
     * `GET /highlights/:highlightId` — → o docblock de `HIGHLIGHT_PATH` em
     * `paths.ts`.
     *
     * ⚠️ **O PONTEIRO FOI CORRIGIDO NA TAREFA 28: era `HIGHLIGHTS_PATH`, e
     * aquela constante DEIXOU DE EXISTIR** (a rota de lista de grifos deu lugar
     * ao acervo, decisão A). É o §7.4 na forma por NOME: um ponteiro de
     * documentação envelhece sozinho, e o próximo leitor procura uma constante
     * que não está lá, não acha nada e conclui que a medição foi desfeita. A
     * medição continua de pé — ela só mudou de vizinho.
     */
    async function load(): Promise<LoadState> {
      const withPlan = await api.get(
        `/books/${encodeURIComponent(bookId)}`,
        bookWithPlanResponseSchema,
      );
      const highlights = await api.get(
        `/clubs/${encodeURIComponent(withPlan.book.clubId)}/highlights`,
        highlightsResponseSchema,
        { query: { bookId } },
      );
      const highlight = highlights.find(
        (candidate) => candidate.id === highlightId,
      );
      if (highlight === undefined) return { status: 'missing' };

      return {
        status: 'ready',
        highlight,
        mine: highlight.userId === myId,
      };
    }

    void load()
      .then((next) => {
        if (cancelled) return;
        if (next.status === 'ready') {
          docRef.current = undefined;
          setDraft(draftOf(next.highlight));
          setColor(next.highlight.color);
          // A LINHA DE BASE. Enquanto os campos forem iguais a ela, o patch é
          // vazio e não sai requisição nenhuma (regra 18).
          confirmedRef.current = confirmedOf(next.highlight);
        }
        setState(next);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setState({ status: 'failed', error: caught });
      });

    return () => {
      cancelled = true;
    };
  }, [api, bookId, highlightId, myId, attempt]);

  function field(key: keyof Draft, value: string): void {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  /**
   * ⚠️ **O PATCH É O QUE MUDOU, E SÓ** (regra 18).
   *
   * A comparação é contra a versão que o SERVIDOR confirmou, nunca contra o que
   * mandamos — e é o que faz "abrir e não mudar nada" não virar requisição.
   */
  function buildPatch(confirmed: Confirmed): PatchBody {
    const patch: PatchBody = {};

    const quote = draft.quote.trim();
    // Trecho vazio não vira patch: ele é obrigatório, e mandar `''` seria um
    // 400 (regra 12 — quem marca o campo é o `problemsOf`).
    if (quote !== '' && quote !== confirmed.quote) patch.quote = quote;

    if (color !== null && color !== confirmed.color) patch.color = color;

    // `?? null` é o "LIMPE a página" explícito do `editHighlightSchema` — e é
    // diferente de ausente, que é "não mexa".
    const pageText = textOrAbsent(draft.page);
    const page = pageText === undefined ? null : Number(pageText);
    if (page !== confirmed.page) patch.page = page;

    const reference = textOrAbsent(draft.reference) ?? null;
    if (reference !== confirmed.reference) patch.reference = reference;

    /*
      REGRA 16 — o comentário, nos dois sentidos.

      O editor intocado deixa `docRef.current` `undefined`, e aí a chave nem
      nasce: ausente é "não mexa". Tocado, `commentOf` decide entre o documento
      e `null` — e `null` explícito é o que ZERA o `commentText` no servidor.
    */
    if (docRef.current !== undefined) {
      const comment = commentOf(docRef.current);
      if (JSON.stringify(comment) !== confirmed.comment) {
        patch.commentDoc = comment;
      }
    }

    return patch;
  }

  async function save(highlight: HighlightResponse): Promise<void> {
    const found = problemsOf(draft, color);
    if (hasProblem(found)) {
      setProblems(found);
      return;
    }

    setProblems(NO_PROBLEMS);
    const confirmed = confirmedRef.current ?? confirmedOf(highlight);
    const patch = buildPatch(confirmed);

    // REGRA 18: patch vazio NÃO é requisição. É a mesma guarda que absorve o
    // `onChange` espúrio do editor (⚠️ 2 da Tarefa 14).
    if (Object.keys(patch).length === 0) {
      navigate(acervoPath(bookId), { replace: true });
      return;
    }

    setSaving(true);
    setError(undefined);

    try {
      await api.patch(
        `/highlights/${encodeURIComponent(highlight.id)}`,
        patch,
        highlightResponseSchema,
      );
      navigate(acervoPath(bookId), { replace: true });
    } catch (caught: unknown) {
      // O que a pessoa escreveu NÃO se perde: os campos continuam no estado, e
      // "salvar de novo" tem o que mandar.
      setError(caught);
      setSaving(false);
    }
  }

  function body(): ReactNode {
    if (meStatus === 'failed') {
      return (
        <Notice
          action={
            <Button onClick={reload} variant="ghost">
              {t('pages.highlightForm.retry')}
            </Button>
          }
          title={messageFor(t, resolveApiError(meError, { fields: [] }).key)}
        />
      );
    }

    // `me === null` é "ainda não sei quem é você", nunca "não é ninguém": sem
    // isso o MEU grifo cairia na recusa por autoria, em silêncio.
    if (state.status === 'loading' || me === null) {
      return (
        <p className="text-sm text-muted">{t('pages.highlightForm.loading')}</p>
      );
    }

    // O grifo não está no acervo ATIVO deste livro: arquivado, de outro livro,
    // ou id trocado à mão. A API respondeu 200 — não há erro a traduzir.
    if (state.status === 'missing') {
      return <Notice title={t('pages.highlightForm.highlightUnavailable')} />;
    }

    if (state.status === 'failed') {
      return (
        <Notice
          action={
            isGone(state.error) ? undefined : (
              <Button
                onClick={() => setAttempt((previous) => previous + 1)}
                variant="ghost"
              >
                {t('pages.highlightForm.retry')}
              </Button>
            )
          }
          title={
            state.error instanceof ApiError && state.error.status === 404
              ? t('pages.highlightForm.bookUnavailable')
              : messageFor(t, resolveApiError(state.error, { fields: [] }).key)
          }
        />
      );
    }

    /*
      REGRA 9 — O GRIFO DE OUTRA PESSOA NÃO TEM AFFORDANCE NENHUMA.

      Nem campo, nem chip de cor, nem editor, nem botão. E a recusa fala de
      AUTORIA: o trecho dela está na COLEÇÃO, inteiro, porque dentro do clube
      não existe conteúdo privado (ADR 0002) — o que não existe é corrigir o que
      o outro escreveu. Nunca "privado", nunca "só você".
    */
    if (!state.mine) {
      return (
        <Notice
          action={
            <Link className={TEXT_LINK_CLASS} to={acervoPath(bookId)}>
              {t('pages.highlightForm.backToList')}
            </Link>
          }
          title={t('pages.highlightForm.notYours')}
        />
      );
    }

    const { highlight } = state;

    return (
      <>
        <HighlightFields
          color={color}
          colorError={
            problems.color
              ? t('pages.highlightForm.fields.colorRequired')
              : undefined
          }
          draft={draft}
          onColor={setColor}
          onField={field}
          pageError={
            problems.page
              ? t('pages.highlightForm.fields.pageInvalid')
              : undefined
          }
          quoteError={
            problems.quote
              ? t('pages.highlightForm.fields.quoteRequired')
              : undefined
          }
        />
        <CommentLabel />
        <LazyComment
          // O `doc` que veio da CARGA, estável entre renders: é o que impede o
          // eco descrito na §7 do `docs/EDITOR.md`.
          doc={highlight.commentDoc ?? EMPTY_DOC}
          onChange={(next) => {
            docRef.current = next;
          }}
        />
        {error !== undefined ? (
          <p className={FORM_ERROR_CLASS} role="alert">
            {t('pages.highlightForm.failed')}
          </p>
        ) : null}
        <div className="flex">
          <Button
            loading={saving}
            onClick={() => void save(highlight)}
            size="lg"
            type="button"
          >
            {t('pages.highlightForm.save')}
          </Button>
        </div>
      </>
    );
  }

  return <Screen title={t('pages.highlightForm.editTitle')}>{body()}</Screen>;
}
