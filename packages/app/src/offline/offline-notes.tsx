import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from '../auth/auth-context';
import { useActiveClub } from '../club/active-club';
import {
  type FlushOutcome,
  flushQueue,
  submitPlanNote,
  type WriteResult,
} from './queue';
import {
  browserIndexedDb,
  openPendingNoteStore,
  type PendingNoteStore,
} from './store';

/**
 * ⚠️ **O DONO DA STORE, DOS GATILHOS E DE NADA MAIS** (Tarefa 21).
 *
 * Ele existe porque **uma tela não pode ser dona da fila**: quem esvazia tem de
 * continuar existindo depois que a pessoa sai da anotação do dia, e tem de ser
 * **um só** — dois donos escutando `online` mandariam a mesma anotação duas
 * vezes. Aqui há um gatilho de `online` e um de abertura, e a tela só **lê** o
 * resultado.
 *
 * ⚠️ **NÃO EXISTE TIMER** (regra 14, decisão C). Um `setInterval` gastaria
 * bateria para repetir o que o navegador já sabe avisar, e quando o `online`
 * mente (rede sem internet), a tentativa falha e a entrada CONTINUA na fila —
 * que é o comportamento correto.
 *
 * ⚠️ **`lastFlush` É ESTADO, NÃO UM `subscribe`** — e a troca foi feita na
 * auditoria. A versão anterior tinha um `Set<listener>` com API de inscrição
 * para **um único assinante** (a tela do dia), só para pintar `saved` quando o
 * `online` esvazia com aquele dia aberto. O array inteiro (e não só o último
 * resultado) porque um esvaziamento manda vários dias de uma vez, e a tela
 * procura o **dela** — com `setState` de um só, dois resultados no mesmo lote se
 * atropelariam e o dia aberto ficaria sem notícia.
 *
 * O preço, registrado: uma tela montada DEPOIS de um esvaziamento lê o
 * resultado dele. É informação verdadeira sobre aquele dia ("a sua anotação
 * subiu"), e o indicador volta a `idle` em 2 s.
 */

export interface OfflineNotesValue {
  /** `null` = ainda não sei quem é a pessoa (o `/me` não respondeu). */
  userId: string | null;
  /** Guarda o rascunho. Nunca lança: sem armazenamento, a tela segue igual. */
  keepDraft(planItemId: string, doc: Record<string, unknown>): void;
  /** O rascunho daquele dia, se houver. Nunca lança (decisão F). */
  draftOf(planItemId: string): Promise<Record<string, unknown> | undefined>;
  /** Manda a anotação e decide fila × erro × "já foi executado" (regra 8). */
  submit(
    planItemId: string,
    doc: Record<string, unknown>,
  ): Promise<WriteResult>;
  /** O que saiu no último esvaziamento — a tela do dia procura o dela (regra 10). */
  lastFlush: readonly FlushOutcome[];
}

const OfflineNotesContext = createContext<OfflineNotesValue | null>(null);

export interface OfflineNotesProviderProps {
  children: ReactNode;
  /**
   * A store. O padrão é o IndexedDB do navegador — e, onde ele não existe (o
   * jsdom dos testes, o modo privado), a que **recusa**, que é a decisão F.
   */
  store?: PendingNoteStore;
}

export function OfflineNotesProvider({
  children,
  store,
}: OfflineNotesProviderProps) {
  const { api } = useAuth();
  const { me } = useActiveClub();
  const userId = me === null ? null : me.id;

  // `useMemo` e não `useState`: a store é uma dependência, não um estado.
  const fallback = useMemo(() => openPendingNoteStore(browserIndexedDb()), []);
  const active = store ?? fallback;

  const [lastFlush, setLastFlush] = useState<readonly FlushOutcome[]>([]);

  /**
   * ⚠️ **UM ESVAZIAMENTO POR VEZ.** O `StrictMode` roda o efeito duas vezes em
   * desenvolvimento e o `online` dispara repetidamente em rede instável; dois
   * `flushQueue` concorrentes leem o MESMO retrato da fila e mandam a mesma
   * anotação duas vezes — inofensivo (o `PUT` é idempotente), mas é a janela do
   * compare-and-write escancarada de graça.
   */
  const draining = useRef(false);

  /**
   * ⚠️ **OS DOIS ÚNICOS GATILHOS: a abertura do app e o evento `online`**
   * (regras 9 e 13, decisão C).
   *
   * O efeito roda quando **passo a saber quem é a pessoa** — que é a abertura
   * do app do ponto de vista da fila (antes disso não há de quem esvaziar). E
   * trocar de conta o refaz com o outro `userId`: a fila de quem estava antes
   * fica onde está, esperando ELA voltar (decisão E).
   */
  useEffect(() => {
    if (userId === null) return;

    let alive = true;

    const drain = (): void => {
      if (draining.current) return;
      draining.current = true;

      void flushQueue({ api, store: active, userId })
        .then((outcomes) => {
          if (alive && outcomes.length > 0) setLastFlush(outcomes);
        })
        .finally(() => {
          draining.current = false;
        });
    };

    drain();
    window.addEventListener('online', drain);

    return () => {
      alive = false;
      window.removeEventListener('online', drain);
    };
  }, [api, active, userId]);

  const value = useMemo<OfflineNotesValue>(() => {
    /*
      ⚠️ **SEM SABER QUEM É A PESSOA, NADA É GUARDADO E NADA É ENVIADO POR ELA**
      (decisão E) — e a guarda é UMA, aqui, em vez de um `if` repetido dentro de
      cada operação. O autor da nota vem do JWT: um registro gravado sem dono
      seria lixo que nunca é reenviado, e a fila de quem estava antes não pode
      subir com o token de quem entrou agora.
    */
    if (userId === null) {
      return {
        userId,
        lastFlush,
        keepDraft: () => undefined,
        draftOf: () => Promise.resolve(undefined),
        submit: () =>
          Promise.resolve<WriteResult>({ status: 'failed', error: undefined }),
      };
    }

    return {
      userId,
      lastFlush,

      keepDraft(planItemId, doc) {
        // REGRA 1: gravar o rascunho é a PRIMEIRA coisa, e ela não pode
        // atrapalhar quem está digitando — nem quando a store recusa.
        void active
          .saveDraft({ userId, planItemId, doc })
          .catch(() => undefined);
      },

      async draftOf(planItemId) {
        try {
          return (await active.byDay(userId, planItemId))?.doc;
        } catch {
          // Decisão F: sem armazenamento, a tela abre com o que o servidor deu.
          return undefined;
        }
      },

      submit(planItemId, doc) {
        return submitPlanNote({ api, store: active, userId }, planItemId, doc);
      },
    };
  }, [api, active, userId, lastFlush]);

  return (
    <OfflineNotesContext.Provider value={value}>
      {children}
    </OfflineNotesContext.Provider>
  );
}

export function useOfflineNotes(): OfflineNotesValue {
  const value = useContext(OfflineNotesContext);
  if (value === null) {
    throw new Error(
      'useOfflineNotes must be used inside an <OfflineNotesProvider>',
    );
  }
  return value;
}
