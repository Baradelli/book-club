import {
  bookWithPlanResponseSchema,
  type NoteResponse,
  notesResponseSchema,
  type PlanItemResponse,
} from '@clube/shared';
import { ApiError } from '@clube/shared/client';
import { Button, PersonAvatar } from '@clube/ui';
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
import { useParams } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { useActiveClub } from '../club/active-club';
import { useOfflineNotes } from '../offline/offline-notes';
import type { WriteResult } from '../offline/queue';
import { Notice, Screen } from './chrome';
import { messageFor, resolveApiError } from './form-errors';

/**
 * A ANOTAÇÃO DO DIA — **a fatia que torna o app usável** (Tarefa 18).
 *
 * Abro o trecho de hoje, o editor abre com o que eu já havia escrito, escrevo,
 * e **salva sozinho**. Ao lado, leio o que a outra pessoa escreveu sobre o
 * MESMO trecho (ADR 0002: dentro do clube não existe conteúdo privado).
 *
 * ⚠️ **O EDITOR ENTRA POR `React.lazy()`, E ISSO NÃO É OTIMIZAÇÃO PREMATURA.**
 * Ele custa **+454.527 B brutos / +143.254 B gzip** — cerca de 2,5× o app
 * inteiro, medido na Tarefa 14. Um `import { RichEditor } from '@clube/ui/editor'`
 * estático aqui põe o ProseMirror no chunk de ENTRADA, e a tela de **login**
 * volta a baixá-lo. O acusador é `src/__tests__/bundle-guard.test.ts`, que
 * compila de verdade e mede três coisas: o que o `index.html` manda buscar fica
 * abaixo do teto e sem marcas de editor, existe um chunk separado COM as
 * marcas, e o `index.html` não o pede.
 *
 * ⚠️ **O AUTOSAVE É DESTA TELA, NÃO DO EDITOR** (`docs/EDITOR.md` §7). Daqui
 * saem o debounce de 1500 ms, o `SaveStatus` e o `PUT`; do editor sai só
 * `onChange`. É essa separação que permite a Tarefa 21 pôr a fila offline aqui
 * sem tocar no editor.
 *
 * ⚠️ **E O `PUT` SÓ SAI DEPOIS DE UMA MUDANÇA FEITA PELA PESSOA** — a regra 7,
 * e ela tem duas causas somadas:
 *
 * 1. o TipTap emite `update` sem mudança de conteúdo em dois caminhos
 *    (`setEditable` e `setContent`), e a Tarefa 14 os consertou **no editor**
 *    (acusadores em `packages/ui/.../rich-editor.test.tsx`: *emits nothing just
 *    for being mounted*, *…when the screen only flips editable*, *…when the
 *    screen loads a doc by prop*). Esta tela é o primeiro chamador real;
 * 2. o **documento vazio é um documento válido**: o editor emite
 *    `{type:'doc',content:[{type:'paragraph'}]}` e o backend aceita de propósito
 *    (recusar quebraria a primeira digitação). Sem defesa, abrir a anotação de
 *    um dia em branco e sair criaria uma nota vazia.
 *
 * A defesa daqui é uma linha de baseline (`savedRef`) e não confia na boa
 * conduta do editor: só um `doc` **diferente** do último conhecido agenda
 * salvamento. Duas guardas para a mesma propriedade, de propósito — esta é a
 * que sobrevive a um upgrade do TipTap.
 *
 * ⚠️ **E AGORA EXISTE FILA OFFLINE — mas ela não mora aqui** (Tarefa 21). Esta
 * tela **grava o rascunho a cada tecla** (antes de qualquer tentativa de rede),
 * manda a escrita pelo `useOfflineNotes()` e pinta o que ele responde. Quem sabe
 * o que é IndexedDB é `offline/store.ts`; quem sabe se um erro pode ser
 * reenviado é `offline/queue.ts`; quem escuta o `online` é o
 * `OfflineNotesProvider`, que sobrevive à saída desta tela. Aqui não há uma
 * linha de `indexedDB`, nem um `catch` que decida sozinho o que é falha de rede.
 *
 * ⚠️ **DIGITAR DURANTE O `PUT` NÃO PERDE NADA — e isso é do `store.settle`, não
 * daqui.** A janela entre a requisição sair e a resposta voltar tem segundos de
 * rede ruim, e é dentro dela que a pessoa continua escrevendo. Todo destino de
 * uma escrita (apagar o rascunho, enfileirar, sair da fila) é aplicado **só se o
 * que está guardado ainda for o documento que subiu**; se mudou, o registro fica
 * intacto e o texto novo sobe no salvamento seguinte — ele continua no editor e
 * marcado como não salvo. Acusadores: *does NOT lose what was typed WHILE the
 * PUT was in flight* (aqui) e os três do `pending-note-store.test.ts`.
 *
 * ⚠️ **O LIMITE QUE CONTINUA, e ele é o Nível 2 que a spec deixou de fora:** o
 * último envio GANHA no servidor. Duas pessoas não escrevem na anotação uma da
 * outra (ADR 0002), então o conflito real seria a MESMA pessoa em dois
 * aparelhos.
 */

/** A rota. Uma constante só, lida pelo `router.tsx` e pelo `dayNotePath`. */
export const DAY_NOTE_PATH = '/books/:bookId/days/:planItemId';

/**
 * O endereço da anotação de um dia do plano.
 *
 * `encodeURIComponent` nos dois: os ids são `randomUUID()` hoje (nada a
 * escapar), mas um id que contivesse `/` deixaria de ser um segmento — é a
 * mesma lição que a Tarefa 15 pagou no `code` do convite.
 */
export function dayNotePath(bookId: string, planItemId: string): string {
  return `/books/${encodeURIComponent(bookId)}/days/${encodeURIComponent(planItemId)}`;
}

/**
 * ⚠️ **O ÚNICO IMPORT DO EDITOR NO APP, E ELE É DINÂMICO.**
 *
 * `@clube/ui/editor` é uma entrada de subpath justamente para o barril
 * `@clube/ui` (de onde vêm `Button` e `PersonAvatar`, acima) não ter aresta
 * nenhuma até o TipTap. O `import()` dentro do `lazy` é o que faz o Rollup
 * emitir um chunk à parte.
 */
const RichEditor = lazy(async () => {
  const editor = await import('@clube/ui/editor');
  return { default: editor.RichEditor };
});

/** `docs/EDITOR.md` §7 e a decisão fechada da spec. */
const AUTOSAVE_DELAY_MS = 1500;
const SAVED_RESET_MS = 2000;

/**
 * O que o editor emite para um documento **vazio** — a baseline de quem ainda
 * não escreveu nada naquele dia (⚠️ 3 do docblock acima).
 */
const EMPTY_DOC: Record<string, unknown> = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

/**
 * ⚠️ `queued` e `unconfirmed` ENTRARAM NA TAREFA 21, e cada um é uma coisa que
 * a tela sabe e não pode dizer com as palavras do outro:
 *
 * - **`queued`**: não chegou ao servidor, está guardado no aparelho e vai
 *   sozinho quando a conexão voltar. Não é erro, e não tem botão — insistir é
 *   justamente o que a fila faz pela pessoa (regra 15);
 * - **`unconfirmed`**: chegou e o servidor **executou**, e só a resposta não
 *   casou o contrato (`ApiError` com status 2xx, §6.8). Dizer "não foi possível
 *   salvar" seria falso e empurraria a pessoa a mandar de novo o que já está
 *   gravado; dizer "Salvo" afirmaria uma confirmação que não houve.
 */
type SaveStatus =
  'idle' | 'saving' | 'saved' | 'queued' | 'unconfirmed' | 'error';

interface SaveState {
  status: SaveStatus;
  error: unknown;
}

const SAVE_IDLE: SaveState = { status: 'idle', error: undefined };

/**
 * A tradução do resultado da fila em estado de tela — **um lugar só**, usado
 * pelo salvamento desta tela E pelo reenvio que o provider faz por trás.
 *
 * Sem isto seriam duas escadas de `if` que precisam concordar, e a segunda é a
 * que ninguém revisa: o `online` esvaziando a fila com a tela do dia aberta é o
 * caminho mais difícil de reproduzir à mão.
 */
function saveStateOf(result: WriteResult): SaveState {
  if (result.status === 'sent') return { status: 'saved', error: undefined };
  if (result.status === 'queued') return { status: 'queued', error: undefined };
  if (result.status === 'accepted') {
    return { status: 'unconfirmed', error: result.error };
  }
  return { status: 'error', error: result.error };
}

/**
 * União discriminada, e não um objeto com campos anuláveis: assim o ramo
 * "pronto e sem dia" — que é impossível — não existe para o compilador.
 *
 * `notInPlan` é a **regra 4**: o `planItemId` do endereço não está no plano do
 * livro (link velho, plano reescrito pelo admin, id trocado à mão). Ele é um
 * estado próprio e não um `failed`, porque a API respondeu 200 — não há erro
 * nenhum a traduzir, e "não foi possível abrir o livro" mandaria olhar o lugar
 * errado.
 */
type DayState =
  | { status: 'loading' }
  | {
      status: 'ready';
      item: PlanItemResponse;
      /** A minha anotação daquele dia, quando já existe (regras 2 e 16). */
      mine: NoteResponse | undefined;
      /**
       * ⚠️ O RASCUNHO LOCAL, quando existe — e ele **ganha** do que veio do
       * servidor (Tarefa 21, regra 2 e decisão A). Existir rascunho já
       * significa "não enviado": não há carimbo local para comparar com o
       * `updatedAt` do servidor, e é isso que mantém relógio de celular errado
       * e fuso fora desta fatia.
       */
      draft: Record<string, unknown> | undefined;
      /** As das outras pessoas, em leitura (regras 15 e 17). */
      others: readonly NoteResponse[];
    }
  | { status: 'notInPlan' }
  | { status: 'failed'; error: unknown };

/** Nasce em `loading`: o efeito dispara no primeiro frame, sem estado ocioso. */
const LOADING: DayState = { status: 'loading' };

/**
 * A NEGATIVA QUE NÃO MUDA COM INSISTÊNCIA — e é ela que decide se existe botão
 * de repetir, na carga e no salvamento.
 *
 * 404 é o corte de tenant do projeto (`CLAUDE.md`: sem membership, 404 e não
 * 403) e também o dia de leitura que deixou de existir; 403 é conteúdo de outra
 * pessoa. Rede, 500 e corpo fora do contrato, esses sim, voltam a ser tentados.
 */
function isGone(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 403 || error.status === 404)
  );
}

/**
 * A nota de outra pessoa é **só leitura**: nada do que aquele editor emita é
 * salvo, e o `onChange` é obrigatório na interface pública dele.
 */
function ignoreChange(): void {
  // No-op deliberado (ADR 0002: o grupo lê, não interfere).
}

export function DayNotePage() {
  const { t } = useTranslation();
  const { api } = useAuth();
  const { me, status: meStatus, error: meError, reload } = useActiveClub();
  const { bookId, planItemId } = useParams();
  /** A fatia offline inteira (Tarefa 21) entra por AQUI, e só por aqui. */
  const { draftOf, keepDraft, lastFlush, submit } = useOfflineNotes();

  const [state, setState] = useState<DayState>(LOADING);
  const [attempt, setAttempt] = useState(0);
  const [save, setSave] = useState<SaveState>(SAVE_IDLE);
  /** Bump a cada mudança REAL — é ele que reinicia o debounce (regra 9). */
  const [pending, setPending] = useState(0);

  /** O último `doc` que o editor entregou. Ref, não estado: não pinta nada. */
  const docRef = useRef<Record<string, unknown> | undefined>(undefined);
  /** O `doc` que o servidor tem (ou a baseline vazia). → regra 7. */
  const savedRef = useRef<string>(JSON.stringify(EMPTY_DOC));
  /** Há mudança não salva? É o que impede o `PUT` em duplicidade (regra 14). */
  const dirtyRef = useRef(false);
  const mounted = useRef(true);

  /**
   * ⚠️ **A CARGA ESPERA O `/me`**, e é o que torna a decisão C segura: sem
   * saber quem eu sou, a minha anotação apareceria na lista "das outras
   * pessoas" — em leitura, sem affordance de editar, e sem nada vermelho para
   * denunciar. Esperar custa nada (o `/me` já foi disparado pelo shell) e
   * elimina o frame errado.
   */
  const myId = me === null ? null : me.id;

  useEffect(() => {
    if (bookId === undefined || planItemId === undefined || myId === null) {
      return;
    }

    let cancelled = false;
    setState(LOADING);

    /**
     * DECISÕES A, B e C: `GET /books/:bookId` (que traz o TEMA do dia — o
     * título da nota) e, com o clube do próprio livro, o `listNotes` filtrado
     * por `planItemId` (que traz a minha nota E as das outras pessoas de uma
     * vez). Duas requisições, e nenhuma delas nova: as duas rotas já existem.
     *
     * O `clubId` vem de `book.clubId`, não do clube ATIVO do cabeçalho: o dono
     * do livro é quem manda: assim abrir o link de um livro de outro clube
     * consulta o clube certo, e o backend faz o corte de tenant contra o
     * `Membership` (sem membership, 404).
     */
    async function load(): Promise<DayState> {
      const withPlan = await api.get(
        `/books/${encodeURIComponent(bookId ?? '')}`,
        bookWithPlanResponseSchema,
      );
      const item = withPlan.planItems.find(
        (candidate) => candidate.id === planItemId,
      );
      if (item === undefined) return { status: 'notInPlan' };

      const notes = await api.get(
        `/clubs/${encodeURIComponent(withPlan.book.clubId)}/notes`,
        notesResponseSchema,
        { query: { planItemId } },
      );

      return {
        status: 'ready',
        item,
        mine: notes.find((note) => note.userId === myId),
        // REGRA 2: o que está guardado neste aparelho, para ESTE dia e ESTA
        // pessoa. `draftOf` nunca lança — sem armazenamento local ele responde
        // `undefined` e a tela abre com o do servidor (decisão F).
        draft: await draftOf(planItemId ?? ''),
        others: notes.filter((note) => note.userId !== myId),
      };
    }

    void load()
      .then((next) => {
        if (cancelled) return;
        if (next.status === 'ready') {
          // A BASELINE é sempre o que o SERVIDOR tem (ou o documento vazio) —
          // nunca o rascunho. É isso que faz "abrir e sair" não criar nota
          // nenhuma E faz um rascunho não confirmado nascer SUJO: ele ainda
          // precisa subir (decisão A).
          savedRef.current = JSON.stringify(next.mine?.doc ?? EMPTY_DOC);
          docRef.current = next.draft ?? next.mine?.doc;
          dirtyRef.current =
            next.draft !== undefined &&
            JSON.stringify(next.draft) !== savedRef.current;
        }
        setState(next);
      })
      .catch((error: unknown) => {
        // A resposta velha chega e é DESCARTADA: a mesma guarda das telas 16 e
        // 17, e o `stubFetch` do harness ignora `signal` (§7.1), então a flag é
        // a única forma observável.
        if (cancelled) return;
        setState({ status: 'failed', error });
      });

    return () => {
      cancelled = true;
    };
  }, [api, bookId, planItemId, myId, attempt, draftOf]);

  const flushSave = useCallback(async (): Promise<void> => {
    const doc = docRef.current;
    if (doc === undefined || !dirtyRef.current || planItemId === undefined) {
      return;
    }

    // Marcado ANTES do `await`: é o que impede o timer e o desmonte de
    // mandarem o mesmo documento duas vezes (regra 14 da Tarefa 18).
    dirtyRef.current = false;
    const sent = JSON.stringify(doc);
    if (mounted.current) setSave({ status: 'saving', error: undefined });

    // O `PUT`, a decisão de enfileirar e a limpeza do rascunho vivem em
    // `offline/queue.ts` — inclusive a regra 8 (`ApiError` 2xx nunca volta).
    const result = await submit(planItemId, doc);

    if (result.status === 'sent') savedRef.current = sent;
    // ⚠️ **SÓ O ERRO VOLTA A SER "SUJO".** Uma escrita `queued` está guardada e
    // vai sozinha: remarcá-la aqui faria o desmonte mandar de novo o que a fila
    // já tem (regra 16). E um `accepted` já foi executado pelo servidor —
    // reenviar é escrever duas vezes (regra 8).
    if (result.status === 'failed') dirtyRef.current = true;

    if (mounted.current) setSave(saveStateOf(result));
  }, [planItemId, submit]);

  /**
   * ⚠️ **O REENVIO ACONTECE FORA DESTA TELA, E ELA SÓ ESCUTA** (regra 10).
   *
   * Quem esvazia a fila é o `OfflineNotesProvider` — ele precisa continuar
   * existindo depois que a pessoa sai daqui, e precisa ser **um só** (dois
   * ouvintes de `online` mandariam a mesma anotação duas vezes). Quando o dia
   * que está aberto é justamente o que subiu, o indicador vira `saved` sem que
   * esta tela tenha disparado requisição nenhuma.
   */
  useEffect(() => {
    const mine = lastFlush.find((outcome) => outcome.planItemId === planItemId);
    // ⚠️ O `dirtyRef` NÃO é tocado aqui de propósito: o que a fila mandou é o
    // documento que ESTAVA guardado, e a pessoa pode ter digitado depois. Se
    // ela digitou, `dirty` é `true` e o texto novo sobe no próximo salvamento;
    // se não, ele já é `false` desde o enfileiramento.
    if (mine !== undefined) setSave(saveStateOf(mine));
  }, [lastFlush, planItemId]);

  /**
   * O DEBOUNCE (regras 8 e 9). O `clearTimeout` da limpeza é o que faz a
   * espera **reiniciar** a cada tecla, em vez de virar throttle: cada bump de
   * `pending` desmonta o timer anterior e monta outro.
   */
  useEffect(() => {
    if (pending === 0) return;

    const timer = setTimeout(() => {
      void flushSave();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [pending, flushSave]);

  /** REGRA 11: `saved` é um recado, não um estado permanente. */
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
   * ⚠️ **SAIR DA TELA COM MUDANÇA PENDENTE SALVA UMA VEZ** (regra 14).
   *
   * O `clearTimeout` acima cancela o timer no desmonte, então **sem isto o que
   * a pessoa digitou nos últimos 1500 ms iria para o lixo** ao tocar "voltar" —
   * e não há rascunho local até a Tarefa 21. O `dirtyRef` é o que garante
   * "uma vez": se o timer já disparou, ele está `false` e o `flushSave` é
   * no-op.
   *
   * `mounted.current = false` ANTES do flush: o `setSave` do caminho de sucesso
   * (e o do erro) não pode tocar um componente desmontado.
   *
   * O `flushSave` entra por ref porque este efeito roda **uma vez** — pô-lo nas
   * dependências faria a limpeza rodar a cada troca de identidade do callback,
   * que é o oposto de "no desmonte".
   */
  const flushRef = useRef(flushSave);
  flushRef.current = flushSave;

  useEffect(() => {
    // `= true` no corpo, e não só na inicialização do ref: o `StrictMode` do
    // `main.tsx` monta, desmonta e remonta, e sem esta linha a segunda montagem
    // nasceria com o componente marcado como morto.
    mounted.current = true;

    return () => {
      mounted.current = false;
      void flushRef.current();
    };
  }, []);

  /**
   * O que o editor entrega a cada tecla. **Nada sai daqui sem mudança de
   * conteúdo** (regra 7): o `onChange` espúrio do TipTap e o documento vazio
   * de quem abriu e não escreveu casam a baseline e são descartados.
   */
  const handleChange = useCallback(
    (next: Record<string, unknown>): void => {
      if (JSON.stringify(next) === savedRef.current) return;

      docRef.current = next;
      dirtyRef.current = true;
      // ⚠️ **REGRA 1: O RASCUNHO É GRAVADO AQUI, ANTES DE QUALQUER TENTATIVA DE
      // REDE.** O `PUT` só sai 1500 ms depois da última tecla, e nesse
      // intervalo cabem o app fechar, o service worker atualizar (o
      // `registerType: 'autoUpdate'` do `vite.config.ts`) e o metrô entrar no
      // túnel. `keepDraft` não devolve promessa e nunca lança: digitar não pode
      // esperar disco, nem quebrar quando não há disco (decisão F).
      if (planItemId !== undefined) keepDraft(planItemId, next);
      setPending((previous) => previous + 1);
    },
    [keepDraft, planItemId],
  );

  function saveIndicator(): ReactNode {
    if (save.status === 'saving') {
      return (
        <span className="text-sm text-muted">
          {t('pages.dayNote.save.saving')}
        </span>
      );
    }
    if (save.status === 'saved') {
      return (
        <span className="text-sm text-muted">
          {t('pages.dayNote.save.saved')}
        </span>
      );
    }
    /*
      ⚠️ **`queued` E `unconfirmed` SÃO RECADOS, NÃO ERROS** (regra 15), e é por
      isso que os dois saem por este ramo — `text-muted`, sem botão e sem cor de
      alerta. O primeiro diz que a rede caiu e o app se vira; o segundo, que o
      servidor executou e a confirmação é que não veio. Em nenhum dos dois há
      ação para a pessoa tomar, e oferecer "salvar de novo" seria pedir a ela
      que fizesse o trabalho da fila (ou que gravasse duas vezes).
    */
    if (save.status === 'queued' || save.status === 'unconfirmed') {
      return (
        <span className="text-sm text-muted">
          {save.status === 'queued'
            ? t('pages.dayNote.save.queued')
            : t('pages.dayNote.save.unconfirmed')}
        </span>
      );
    }
    if (save.status === 'error') {
      /*
        ⚠️ AS DUAS FRASES DE ERRO DIZEM QUE O TEXTO NÃO SE PERDEU, e nenhuma
        delas passa pelo `resolveApiError`/`apiErrorKey`. É escolha medida
        contra o outro caminho: o genérico por status diria "Sem conexão com o
        servidor" ou "Algo deu errado do nosso lado", e nenhum dos dois responde
        a única pergunta de quem estava escrevendo — *perdi o que escrevi?*.
        Nenhuma string da API chega aqui em caminho nenhum (regra 22): o `error`
        só é lido por `status`.
      */
      return (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-content">
            {isGone(save.error)
              ? t('pages.dayNote.save.unavailable')
              : t('pages.dayNote.save.failed')}
          </span>
          {isGone(save.error) ? null : (
            <Button
              onClick={() => {
                void flushSave();
              }}
              variant="ghost"
            >
              {t('pages.dayNote.save.retry')}
            </Button>
          )}
        </div>
      );
    }
    return null;
  }

  function body(): ReactNode {
    if (meStatus === 'failed') {
      return (
        <Notice
          action={
            <Button onClick={reload} variant="ghost">
              {t('pages.dayNote.retry')}
            </Button>
          }
          title={messageFor(t, resolveApiError(meError, { fields: [] }).key)}
        />
      );
    }

    if (state.status === 'loading' || me === null) {
      return <p className="text-sm text-muted">{t('pages.dayNote.loading')}</p>;
    }

    // REGRA 4: estado tratado, e a frase diz o que aconteceu de verdade.
    if (state.status === 'notInPlan') {
      return <Notice title={t('pages.dayNote.dayUnavailable')} />;
    }

    // REGRA 5: 404 no livro tem frase própria; o resto cai no genérico e
    // ganha "tentar de novo".
    if (state.status === 'failed') {
      return (
        <Notice
          action={
            isGone(state.error) ? undefined : (
              <Button
                onClick={() => {
                  setAttempt((previous) => previous + 1);
                }}
                variant="ghost"
              >
                {t('pages.dayNote.retry')}
              </Button>
            )
          }
          title={
            state.error instanceof ApiError && state.error.status === 404
              ? t('pages.dayNote.bookUnavailable')
              : messageFor(t, resolveApiError(state.error, { fields: [] }).key)
          }
        />
      );
    }

    return (
      <>
        {state.item.reference !== null ? (
          <p className="text-sm text-muted">{state.item.reference}</p>
        ) : null}

        {/*
          REGRA 6: o chunk do editor pode demorar (é o maior do app), e sem um
          `fallback` a tela ficaria em branco no lugar dele. UM `Suspense` para
          as duas seções: elas vêm do MESMO chunk, então esperar junto é o que
          acontece de verdade.
        */}
        <Suspense
          fallback={
            <p className="text-sm text-muted">
              {t('pages.dayNote.editorLoading')}
            </p>
          }
        >
          <section className="flex flex-col gap-2">
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-muted">
                {t('pages.dayNote.mine.heading')}
              </h2>
              {/* `aria-live`: o estado do salvamento é falado, não só visto. */}
              <span aria-live="polite" data-testid="save-status">
                {saveIndicator()}
              </span>
            </div>
            {/*
              REGRAS 2 e 3: o `doc` do servidor quando existe, e `undefined`
              (editor vazio, sem erro) quando não. Ele é ESTÁVEL entre renders
              — vem do estado da carga —, e é isso que impede o eco descrito na
              §7 do `docs/EDITOR.md`.
            */}
            <RichEditor
              className="rounded-control border border-line bg-surface"
              // REGRA 2: o rascunho local GANHA do que veio do servidor. Ele
              // vem do ESTADO da carga (não de um ref), então continua estável
              // entre renders — o eco descrito na §7 do `docs/EDITOR.md`.
              doc={state.draft ?? state.mine?.doc}
              onChange={handleChange}
              placeholder={t('pages.dayNote.placeholder')}
              uploadFailedLabel={t('editor.image.uploadFailed')}
              uploadingLabel={t('editor.image.uploading')}
            />
          </section>

          {/*
            REGRA 18: dia em que só eu escrevi **não ganha frase nenhuma**. A
            seção simplesmente não existe — "ninguém mais escreveu ainda" é
            comentário sobre a ausência do outro, que é o §1 do plano ao
            contrário.
          */}
          {state.others.length === 0 ? null : (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted">
                {t('pages.dayNote.others.heading')}
              </h2>
              {state.others.map((note) => (
                <article
                  className="flex flex-col gap-2 rounded-control border border-line bg-surface p-4"
                  key={note.id}
                >
                  <header className="flex flex-wrap items-center gap-2">
                    {/*
                      Sem `label`: o texto ao lado já diz de quem é, e um
                      `aria-label` igual faria o leitor de tela repetir.
                      `name={null}` porque o nome de quem não é você não está
                      em resposta nenhuma da API (lacuna de backend, ⚠️ 4).
                    */}
                    <PersonAvatar id={note.userId} name={null} size="sm" />
                    <span className="text-sm text-content">
                      {t('pages.dayNote.others.author')}
                    </span>
                    {/*
                      REGRA 17: nenhuma affordance de editar ou arquivar — e a
                      tela DIZ que é leitura, em vez de só não ter botão (o que
                      se lê como bug). O `editable={false}` esconde a barra e o
                      bubble menu por construção (Tarefa 14).
                    */}
                    <span className="text-xs text-muted">
                      {t('pages.dayNote.others.readOnly')}
                    </span>
                  </header>
                  <RichEditor
                    doc={note.doc}
                    editable={false}
                    onChange={ignoreChange}
                  />
                </article>
              ))}
            </section>
          )}
        </Suspense>
      </>
    );
  }

  /*
    REGRA 1: o TEMA DO DIA é o título da tela — é o que o admin cadastrou no
    plano, e é ele que dá assunto à anotação. O `h1` (e a coluna) vêm do
    `Screen` de `./chrome`, que garante que ele existe SEMPRE: é ele que faz
    "carregando", "este dia não faz parte do plano" e o erro serem ESTADOS de
    uma tela, não telas brancas.
  */
  return (
    <Screen
      title={
        state.status === 'ready' ? state.item.title : t('pages.dayNote.title')
      }
    >
      {body()}
    </Screen>
  );
}
