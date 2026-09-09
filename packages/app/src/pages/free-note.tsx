import {
  bookWithPlanResponseSchema,
  type NoteResponse,
  noteResponseSchema,
  notesResponseSchema,
} from '@clube/shared';
import { ApiError } from '@clube/shared/client';
import { Button, Field, PersonAvatar, Sheet } from '@clube/ui';
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { useActiveClub } from '../club/active-club';
import { bookPath } from './book';
import { Notice, Screen } from './chrome';
import { messageFor, resolveApiError } from './form-errors';
import { TEXT_INPUT_CLASS } from './form-styles';

/**
 * A ANOTAÇÃO AVULSA (Tarefa 19) — a ideia que veio da página 112, com título e
 * referência próprias.
 *
 * A tela serve **três** estados, e é a mesma tela de propósito: criar,
 * corrigir a **minha**, e **ler** a de outra pessoa. O que muda entre eles é
 * affordance, não visibilidade — dentro do clube não existe conteúdo privado
 * (`docs/adr/0002-visibilidade-total-no-clube.md`); o que não existe é editar o
 * que o outro escreveu.
 *
 * ⚠️ **CRIAR É EXPLÍCITO** (regra 16). Um autosave na tela de criação gravaria
 * uma nota por tela aberta — o mesmo defeito da Tarefa 18, com a agravante de
 * criar LINHA NOVA em vez de reescrever a mesma. Aqui o `POST` sai do botão, e
 * o autosave só existe depois que a nota existe.
 *
 * ⚠️ **E CORRIGIR SÓ MANDA O QUE MUDOU** (regras 12 e 13). O `editNoteSchema`
 * distingue ausente (não mexe) de `null` (limpa a referência), então o patch é
 * montado por COMPARAÇÃO com a última versão que o servidor confirmou — e um
 * patch vazio não vira requisição nenhuma. É isso que faz "abrir e não mudar
 * nada" não salvar, inclusive quando o editor emite o `onChange` espúrio que a
 * Tarefa 14 descreve.
 *
 * ⚠️ **O EDITOR ENTRA POR `React.lazy()`** — mesma razão medida da Tarefa 18:
 * +454 kB no chunk de ENTRADA se ele entrar por import estático. O acusador é
 * `src/__tests__/bundle-guard.test.ts`.
 *
 * ⚠️ **O AUTOSAVE É DUPLICADO DA TAREFA 18 DE PROPÓSITO, e isto está
 * registrado.** O desenho é o mesmo (1500 ms, debounce com reinício, status que
 * volta a `idle`), mas o corpo não é (`PUT { doc }` lá, `PATCH` com só o que
 * mudou aqui) e o `day-note.tsx` está **fechado** nesta fatia. Extrair um hook
 * usado por uma tela só seria a abstração errada com o custo da certa; quando a
 * Tarefa 21 puser a fila offline nos dois, é lá que o hook nasce, com dois
 * chamadores reais para desenhá-lo.
 */

/** As rotas. Constantes lidas pelo `router.tsx` e pelos construtores abaixo. */
export const FREE_NOTE_NEW_PATH = '/books/:bookId/notes/new';

/**
 * ⚠️ **O ENDEREÇO DA EDIÇÃO CARREGA O LIVRO, e a spec pedia `/notes/:noteId`.**
 *
 * MEDIDO no `note-routes.ts`: **não existe `GET /notes/:noteId`**. A única
 * leitura de anotação da API é `GET /clubs/:clubId/notes`, e o `clubId` não
 * está no endereço de uma nota — ele vem do LIVRO (`book.clubId`), que é
 * exatamente o caminho que a tela do dia já faz. Com `/notes/:noteId` sozinho a
 * tela teria de adivinhar o clube pelo seletor do cabeçalho, e um link de nota
 * de OUTRO clube responderia 404 para uma nota que existe.
 *
 * Então o livro entra no caminho, simétrico ao `/books/:bookId/days/:planItemId`
 * da Tarefa 18. `new` é segmento estático e ganha do `:noteId` no ranking do
 * react-router, independente da ordem em que as rotas são declaradas.
 */
export const FREE_NOTE_PATH = '/books/:bookId/notes/:noteId';

/** `encodeURIComponent` pelo mesmo motivo do `dayNotePath`: id com `/`. */
export function freeNoteNewPath(bookId: string): string {
  return `/books/${encodeURIComponent(bookId)}/notes/new`;
}

export function freeNotePath(bookId: string, noteId: string): string {
  return `/books/${encodeURIComponent(bookId)}/notes/${encodeURIComponent(noteId)}`;
}

/** O segundo (e último) import dinâmico do editor no app. → `day-note.tsx`. */
const RichEditor = lazy(async () => {
  const editor = await import('@clube/ui/editor');
  return { default: editor.RichEditor };
});

const AUTOSAVE_DELAY_MS = 1500;
const SAVED_RESET_MS = 2000;

/** O que o editor emite para um documento vazio — a nota que nasce em branco. */
const EMPTY_DOC: Record<string, unknown> = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

/**
 * O corpo do `PATCH`, montado campo a campo.
 *
 * ⚠️ **É um tipo LOCAL e não o `EditNoteBody` de `shared`, e a razão é o `doc`.**
 * O `noteDocSchema` infere `{ type: 'doc' } & { [k: string]: unknown }`, e o que
 * o editor entrega é `Record<string, unknown>` — provar o literal `'doc'` exigiria
 * um `as` (proibido) ou um `parse` de um documento que nós mesmos acabamos de
 * produzir. O schema continua sendo a fronteira: ele valida no backend, e a
 * RESPOSTA é validada aqui pelo `noteResponseSchema` (§6.8).
 *
 * `reference: null` é o "limpe a referência" do `editNoteSchema` — ausente e
 * `null` são casos diferentes, e o schema não usa `.default()` justamente para
 * não colapsá-los.
 */
interface NotePatch {
  title?: string;
  reference?: string | null;
  doc?: Record<string, unknown>;
}

/** O corpo do `POST` — `plainText` é derivado no backend e nunca entra. */
interface CreateFreeNoteBody {
  title: string;
  reference?: string;
  doc: Record<string, unknown>;
}

/** A última versão que o SERVIDOR confirmou. É contra ela que o patch nasce. */
interface Confirmed {
  title: string;
  reference: string | null;
  /** JSON, não a árvore: comparação por valor sem percorrer o ProseMirror. */
  doc: string;
}

function confirmedOf(note: NoteResponse): Confirmed {
  return {
    title: note.title,
    reference: note.reference,
    doc: JSON.stringify(note.doc),
  };
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SaveState {
  status: SaveStatus;
  error: unknown;
}

const SAVE_IDLE: SaveState = { status: 'idle', error: undefined };
const SAVE_SAVING: SaveState = { status: 'saving', error: undefined };
const SAVE_SAVED: SaveState = { status: 'saved', error: undefined };

type NoteState =
  | { status: 'loading' }
  /** `mine` decide a tela inteira: campos e arquivar × leitura pura. */
  | { status: 'ready'; note: NoteResponse; mine: boolean }
  /** A nota não está no acervo ATIVO deste livro (arquivada, ou id errado). */
  | { status: 'missing' }
  | { status: 'failed'; error: unknown };

const LOADING: NoteState = { status: 'loading' };

/** A negativa que não muda com insistência. → `day-note.tsx`. */
function isGone(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 403 || error.status === 404)
  );
}

/** A nota de outra pessoa é leitura: nada do que aquele editor emita é salvo. */
function ignoreChange(): void {
  // No-op deliberado (ADR 0002: o grupo lê, não interfere).
}

function isEmptyPatch(patch: NotePatch): boolean {
  return Object.keys(patch).length === 0;
}

/**
 * O editor, sempre dentro de um `Suspense` — o chunk é o maior do app, e sem
 * `fallback` a tela ficaria em branco no lugar dele (regra 14).
 */
function LazyEditor({
  doc,
  editable,
  onChange,
  placeholder,
}: {
  doc: Record<string, unknown> | undefined;
  onChange: (doc: Record<string, unknown>) => void;
  editable?: boolean;
  placeholder?: string;
}) {
  const { t } = useTranslation();

  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted">
          {t('pages.freeNote.editorLoading')}
        </p>
      }
    >
      <RichEditor
        className="rounded-control border border-line bg-surface"
        doc={doc}
        editable={editable}
        onChange={onChange}
        placeholder={placeholder}
      />
    </Suspense>
  );
}

/** Título + referência: os dois campos que só a avulsa tem. */
function NoteFields({
  onReference,
  onTitle,
  reference,
  title,
  titleError,
}: {
  title: string;
  reference: string;
  titleError: string | undefined;
  onTitle: (value: string) => void;
  onReference: (value: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <Field error={titleError} label={t('pages.freeNote.fields.title')}>
        {(control) => (
          <input
            {...control}
            className={TEXT_INPUT_CLASS}
            onChange={(event) => onTitle(event.target.value)}
            type="text"
            value={title}
          />
        )}
      </Field>
      <Field
        hint={t('pages.freeNote.fields.referenceHint')}
        label={t('pages.freeNote.fields.reference')}
      >
        {(control) => (
          <input
            {...control}
            className={TEXT_INPUT_CLASS}
            onChange={(event) => onReference(event.target.value)}
            type="text"
            value={reference}
          />
        )}
      </Field>
    </>
  );
}

export function FreeNotePage() {
  const { bookId, noteId } = useParams();

  // Duas telas, um endereço de arquivo: os estados de "ainda não existe" e "já
  // existe" não têm nada em comum além dos dois campos e do editor, e um
  // componente que fizesse os dois teria um `if` em cada linha.
  return noteId === undefined ? (
    <NewFreeNote bookId={bookId ?? ''} />
  ) : (
    <ExistingFreeNote bookId={bookId ?? ''} noteId={noteId} />
  );
}

/**
 * CRIAR — regras 9, 10, 11 e 16.
 *
 * Nenhuma requisição de carga: não há o que carregar. E nenhuma requisição de
 * escrita antes do botão.
 */
function NewFreeNote({ bookId }: { bookId: string }) {
  const { t } = useTranslation();
  const { api } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [reference, setReference] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(undefined);

  /** O documento vive no ref: devolvê-lo ao editor por prop causaria eco. */
  const docRef = useRef<Record<string, unknown>>(EMPTY_DOC);

  const handleChange = useCallback((next: Record<string, unknown>): void => {
    docRef.current = next;
  }, []);

  async function create(): Promise<void> {
    const trimmedTitle = title.trim();
    if (trimmedTitle === '') {
      // REGRA 9: o campo é marcado e NADA é enviado. Um `POST` que o backend
      // recusaria com 400 seria a mesma recusa, mais lenta e com uma frase em
      // inglês para traduzir.
      setInvalid(true);
      return;
    }

    setInvalid(false);
    setSubmitting(true);
    setError(undefined);

    // REGRA 11: `{ title, reference?, doc }` e nada mais. O
    // `createFreeNoteSchema` é `.strict()`, e `plainText`/`userId`/`clubId`
    // não são do cliente (ADR 0001, §6.3).
    const body: CreateFreeNoteBody = {
      title: trimmedTitle,
      doc: docRef.current,
    };
    // REGRA 10: referência vazia é AUSÊNCIA, não string vazia.
    const trimmedReference = reference.trim();
    if (trimmedReference !== '') body.reference = trimmedReference;

    try {
      const note = await api.post(
        `/books/${encodeURIComponent(bookId)}/notes`,
        body,
        noteResponseSchema,
      );
      // `replace`: o "voltar" do celular tem de devolver a pessoa ao livro, e
      // não a um formulário de criação que já virou nota.
      navigate(freeNotePath(bookId, note.id), { replace: true });
    } catch (caught: unknown) {
      setError(caught);
      setSubmitting(false);
    }
  }

  return (
    <Screen title={t('pages.freeNote.newTitle')}>
      <NoteFields
        onReference={setReference}
        onTitle={setTitle}
        reference={reference}
        title={title}
        titleError={
          invalid ? t('pages.freeNote.fields.titleRequired') : undefined
        }
      />
      <LazyEditor
        doc={undefined}
        onChange={handleChange}
        placeholder={t('pages.freeNote.placeholder')}
      />
      {error !== undefined ? (
        <p className="text-sm text-danger" role="alert">
          {/* Nada da API na tela: o erro é lido por STATUS, nunca por texto. */}
          {messageFor(
            t,
            resolveApiError(error, {
              fields: [],
              byStatus: { 404: { key: 'pages.freeNote.bookUnavailable' } },
            }).key,
          )}
        </p>
      ) : null}
      <div className="flex">
        <Button
          loading={submitting}
          onClick={() => void create()}
          size="lg"
          type="button"
        >
          {t('pages.freeNote.create')}
        </Button>
      </div>
    </Screen>
  );
}

/**
 * CORRIGIR a minha, ou LER a de outra pessoa — regras 12 a 20.
 */
function ExistingFreeNote({
  bookId,
  noteId,
}: {
  bookId: string;
  noteId: string;
}) {
  const { t } = useTranslation();
  const { api } = useAuth();
  const { error: meError, me, reload, status: meStatus } = useActiveClub();
  const navigate = useNavigate();

  const [state, setState] = useState<NoteState>(LOADING);
  const [attempt, setAttempt] = useState(0);
  const [title, setTitle] = useState('');
  const [reference, setReference] = useState('');
  /** Bump a cada `onChange` do editor — é o sinal reativo do `docRef`. */
  const [docVersion, setDocVersion] = useState(0);
  const [save, setSave] = useState<SaveState>(SAVE_IDLE);
  const [confirming, setConfirming] = useState(false);
  const [archiveError, setArchiveError] = useState<unknown>(undefined);

  const docRef = useRef<Record<string, unknown> | undefined>(undefined);
  const confirmedRef = useRef<Confirmed>({
    title: '',
    reference: null,
    doc: '',
  });
  const mounted = useRef(true);
  /** Arquivada: o flush do desmonte não pode ressuscitar um `PATCH`. */
  const archivedRef = useRef(false);

  /** A carga espera o `/me`: sem saber quem sou, "minha × dela" é chute. */
  const myId = me === null ? null : me.id;

  useEffect(() => {
    if (myId === null) return;

    let cancelled = false;
    setState(LOADING);

    /**
     * DUAS requisições, e nenhuma rota nova: o livro (que dá o `clubId` e faz
     * o corte de tenant) e o acervo do clube filtrado por `bookId`. Não existe
     * `GET /notes/:noteId` — → o docblock de `FREE_NOTE_PATH`.
     */
    async function load(): Promise<NoteState> {
      const withPlan = await api.get(
        `/books/${encodeURIComponent(bookId)}`,
        bookWithPlanResponseSchema,
      );
      const notes = await api.get(
        `/clubs/${encodeURIComponent(withPlan.book.clubId)}/notes`,
        notesResponseSchema,
        { query: { bookId } },
      );
      const note = notes.find((candidate) => candidate.id === noteId);
      if (note === undefined) return { status: 'missing' };

      return { status: 'ready', note, mine: note.userId === myId };
    }

    void load()
      .then((next) => {
        if (cancelled) return;
        if (next.status === 'ready') {
          docRef.current = next.note.doc;
          setTitle(next.note.title);
          setReference(next.note.reference ?? '');
          // A LINHA DE BASE. Enquanto os campos forem iguais a ela, o patch é
          // vazio e não sai requisição nenhuma (regra 13).
          confirmedRef.current = confirmedOf(next.note);
        }
        setState(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: 'failed', error });
      });

    return () => {
      cancelled = true;
    };
  }, [api, bookId, noteId, myId, attempt]);

  /**
   * ⚠️ **O PATCH É O QUE MUDOU, E SÓ** (regra 12).
   *
   * `docVersion` está nas dependências de propósito: o documento mora num ref
   * (devolvê-lo ao editor por prop causaria eco), então ele é o único sinal
   * reativo de que a árvore mudou. Sem ele o `useCallback` congelaria e o
   * autosave nunca veria uma tecla.
   */
  const buildPatch = useCallback((): NotePatch => {
    const confirmed = confirmedRef.current;
    const patch: NotePatch = {};

    const trimmedTitle = title.trim();
    // Título vazio não vira patch: `title` é obrigatório na avulsa, e mandar
    // `''` seria um 400 a cada 1500 ms (regra 9).
    if (trimmedTitle !== '' && trimmedTitle !== confirmed.title) {
      patch.title = trimmedTitle;
    }

    const trimmedReference = reference.trim();
    const nextReference = trimmedReference === '' ? null : trimmedReference;
    if (nextReference !== confirmed.reference) patch.reference = nextReference;

    const doc = docRef.current;
    if (doc !== undefined && JSON.stringify(doc) !== confirmed.doc) {
      patch.doc = doc;
    }

    return patch;
    // `docVersion` não é LIDO aqui — ele é OBSERVADO: é o que troca a
    // identidade deste callback quando a árvore do editor muda.
  }, [title, reference, docVersion]);

  const flushSave = useCallback(async (): Promise<void> => {
    if (archivedRef.current) return;

    const patch = buildPatch();
    // REGRA 13: patch vazio não é requisição. É a mesma guarda que absorve o
    // `onChange` espúrio do editor (⚠️ 2 da Tarefa 18) e o documento vazio.
    if (isEmptyPatch(patch)) return;

    if (mounted.current) setSave(SAVE_SAVING);

    try {
      const note = await api.patch(
        `/notes/${encodeURIComponent(noteId)}`,
        patch,
        noteResponseSchema,
      );
      // A linha de base vem da RESPOSTA, não do que mandamos: é o que o
      // servidor tem de fato, e é contra isso que o próximo patch nasce.
      confirmedRef.current = confirmedOf(note);
      if (mounted.current) setSave(SAVE_SAVED);
    } catch (error: unknown) {
      // O texto NÃO se perde: ele está no editor e no `docRef`, e a linha de
      // base continua velha — então "salvar de novo" tem o que mandar.
      if (mounted.current) setSave({ status: 'error', error });
    }
  }, [api, noteId, buildPatch]);

  /**
   * O DEBOUNCE (regra 15). O `clearTimeout` da limpeza é o que faz a espera
   * REINICIAR a cada tecla, em vez de virar throttle — e o `isEmptyPatch` na
   * entrada é o que faz a montagem da tela não agendar nada.
   */
  useEffect(() => {
    if (state.status !== 'ready' || !state.mine) return;
    if (isEmptyPatch(buildPatch())) return;

    const timer = setTimeout(() => {
      void flushSave();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [state, buildPatch, flushSave]);

  /** `saved` é um recado, não um estado permanente. */
  useEffect(() => {
    if (save.status !== 'saved') return;

    const timer = setTimeout(() => {
      setSave(SAVE_IDLE);
    }, SAVED_RESET_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [save.status]);

  /**
   * Sair da tela com mudança pendente salva UMA vez — o `clearTimeout` acima
   * cancelaria o timer no desmonte, e não há rascunho local até a Tarefa 21.
   */
  const flushRef = useRef(flushSave);
  flushRef.current = flushSave;

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      void flushRef.current();
    };
  }, []);

  const handleChange = useCallback((next: Record<string, unknown>): void => {
    docRef.current = next;
    setDocVersion((previous) => previous + 1);
  }, []);

  async function archive(): Promise<void> {
    setArchiveError(undefined);
    try {
      // REGRA 19: `DELETE /notes/:noteId`. É soft delete no backend, e a
      // resposta é a linha atualizada — que esta tela não precisa, porque vai
      // embora.
      await api.delete(
        `/notes/${encodeURIComponent(noteId)}`,
        noteResponseSchema,
      );
      archivedRef.current = true;
      setConfirming(false);
      // `replace`: a nota arquivada não é destino de "voltar".
      navigate(bookPath(bookId), { replace: true });
    } catch (error: unknown) {
      setArchiveError(error);
      setConfirming(false);
    }
  }

  function saveIndicator(): ReactNode {
    if (save.status === 'saving' || save.status === 'saved') {
      return (
        <span className="text-sm text-muted">
          {t(
            save.status === 'saving'
              ? 'pages.freeNote.save.saving'
              : 'pages.freeNote.save.saved',
          )}
        </span>
      );
    }
    if (save.status === 'error') {
      // As duas frases dizem que o texto não se perdeu, e nenhuma passa pelo
      // genérico por status — que não responde a única pergunta de quem estava
      // escrevendo.
      return (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-content">
            {isGone(save.error)
              ? t('pages.freeNote.save.unavailable')
              : t('pages.freeNote.save.failed')}
          </span>
          {isGone(save.error) ? null : (
            <Button onClick={() => void flushSave()} variant="ghost">
              {t('pages.freeNote.save.retry')}
            </Button>
          )}
        </div>
      );
    }
    return null;
  }

  /**
   * ⚠️ UM `Screen` SÓ, e o corpo escolhido por estado — o mesmo desenho da
   * Tarefa 18. É ele que faz "carregando", "esta anotação não está aqui" e o
   * erro serem ESTADOS de uma tela, e não telas brancas com `h1` diferente em
   * cada ramo.
   */
  function body(): ReactNode {
    if (meStatus === 'failed') {
      return (
        <Notice
          action={
            <Button onClick={reload} variant="ghost">
              {t('pages.freeNote.retry')}
            </Button>
          }
          title={messageFor(t, resolveApiError(meError, { fields: [] }).key)}
        />
      );
    }

    // `me === null` é "ainda não sei quem é você", nunca "não é ninguém": sem
    // isso a MINHA anotação abriria em leitura, em silêncio.
    if (state.status === 'loading' || me === null) {
      return (
        <p className="text-sm text-muted">{t('pages.freeNote.loading')}</p>
      );
    }

    // A nota não está no acervo ATIVO deste livro: arquivada, de outro livro,
    // ou id trocado à mão. A API respondeu 200 — não há erro a traduzir.
    if (state.status === 'missing') {
      return <Notice title={t('pages.freeNote.noteUnavailable')} />;
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
                {t('pages.freeNote.retry')}
              </Button>
            )
          }
          title={
            state.error instanceof ApiError && state.error.status === 404
              ? t('pages.freeNote.bookUnavailable')
              : messageFor(t, resolveApiError(state.error, { fields: [] }).key)
          }
        />
      );
    }

    /*
      REGRA 17 — A NOTA DE OUTRA PESSOA NÃO TEM AFFORDANCE NENHUMA.

      Nem campo, nem botão, nem editor editável. E a tela DIZ que é leitura, em
      vez de só não ter controle (o que se lê como bug). Isso é AUTORIA, não
      privacidade: o texto está aqui, inteiro, porque dentro do clube não existe
      conteúdo privado (ADR 0002).
    */
    if (!state.mine) {
      return (
        <>
          <header className="flex flex-wrap items-center gap-2">
            {/* Sem `label`: o texto ao lado já diz de quem é, e um `aria-label`
                igual faria o leitor de tela repetir. */}
            <PersonAvatar id={state.note.userId} name={null} size="sm" />
            <span className="text-sm text-content">
              {t('pages.freeNote.author')}
            </span>
            <span className="text-xs text-muted">
              {t('pages.freeNote.readOnly')}
            </span>
          </header>
          {state.note.reference !== null ? (
            <p className="text-sm text-muted">{state.note.reference}</p>
          ) : null}
          <LazyEditor
            doc={state.note.doc}
            editable={false}
            onChange={ignoreChange}
          />
        </>
      );
    }

    return (
      <>
        <NoteFields
          onReference={setReference}
          onTitle={setTitle}
          reference={reference}
          title={title}
          titleError={
            title.trim() === ''
              ? t('pages.freeNote.fields.titleRequired')
              : undefined
          }
        />
        {/* `aria-live`: o estado do salvamento é falado, não só visto. */}
        <span
          aria-live="polite"
          className="flex min-h-11 flex-wrap items-center justify-end gap-2"
          data-testid="save-status"
        >
          {saveIndicator()}
        </span>
        <LazyEditor
          // O `doc` que veio da CARGA, estável entre renders: é o que impede o
          // eco descrito na §7 do `docs/EDITOR.md`.
          doc={state.note.doc}
          onChange={handleChange}
          placeholder={t('pages.freeNote.placeholder')}
        />
        {archiveError !== undefined ? (
          <p className="text-sm text-danger" role="alert">
            {t('pages.freeNote.archive.failed')}
          </p>
        ) : null}
        <div className="flex">
          <Button onClick={() => setConfirming(true)} variant="ghost">
            {t('pages.freeNote.archive.action')}
          </Button>
        </div>
        {/*
          REGRA 18 — ARQUIVAR PEDE CONFIRMAÇÃO, e cancelar não chama a API.

          É o primeiro uso real do `Sheet` da Tarefa 13: fechado ele NÃO está
          no DOM, então o "Cancelar" não tem como disparar nada — e o foco
          volta para o botão que abriu.
        */}
        <Sheet
          closeLabel={t('pages.freeNote.archive.close')}
          onClose={() => setConfirming(false)}
          open={confirming}
          title={t('pages.freeNote.archive.title')}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              {t('pages.freeNote.archive.description')}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setConfirming(false)} variant="ghost">
                {t('pages.freeNote.archive.cancel')}
              </Button>
              <Button onClick={() => void archive()}>
                {t('pages.freeNote.archive.confirm')}
              </Button>
            </div>
          </div>
        </Sheet>
      </>
    );
  }

  /*
    O `h1` é o nome da TELA — menos na leitura da nota de outra pessoa, onde o
    título DELA é a informação principal e não há campo para mostrá-lo.
  */
  return (
    <Screen
      title={
        state.status === 'ready' && !state.mine
          ? state.note.title
          : t('pages.freeNote.title')
      }
    >
      {body()}
    </Screen>
  );
}
