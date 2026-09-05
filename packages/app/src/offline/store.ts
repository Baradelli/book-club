/**
 * A STORE LOCAL DA ANOTAÇÃO — o port e a implementação IndexedDB (Tarefa 21).
 *
 * ⚠️ **UM PORT, UMA IMPLEMENTAÇÃO, UM FAKE.** É o `CLAUDE.md` ("nenhum acesso a
 * banco fora de um Repository") escrito para o front: **nenhuma tela abre
 * `indexedDB`**. Quem quiser guardar texto localmente passa por aqui, e o teste
 * de contrato (`__tests__/pending-note-store.test.ts`) roda as mesmas regras no
 * fake em memória e no IndexedDB de verdade.
 *
 * ⚠️ **UM REGISTRO SÓ POR (PESSOA, DIA) — o rascunho E a fila são a mesma
 * linha.** Foi decisão medida contra a alternativa de duas tabelas:
 *
 * - a **deduplicação da fila** (decisão B, regra 6) vira a chave primária, e
 *   não uma varredura antes de cada inserção: dez minutos escrevendo offline
 *   não têm como virar quarenta entradas;
 * - a **decisão A** ("existir rascunho já significa não enviado") fica
 *   observável num campo só: `seq === null` é rascunho fora da fila,
 *   `seq !== null` é escrita esperando a rede;
 * - e a **regra 12** ("`4xx` permanente tira da fila e o rascunho continua")
 *   vira uma transição de campo, em vez de uma dança entre duas tabelas que
 *   pode deixar órfão.
 *
 * ⚠️ **A CHAVE CARREGA O `userId`, e é a decisão E.** O aparelho é de casa: as
 * duas pessoas do clube usam o mesmo celular. Uma fila global reenviaria a
 * anotação de quem estava antes com o token de quem entrou depois — e o backend
 * **aceitaria**, porque o autor vem do JWT. Sem o `userId` na chave e no filtro
 * da fila, o texto de uma pessoa vira a nota da outra.
 *
 * ⚠️ **NADA DE RELÓGIO NA ORDEM DA FILA.** O `seq` é `max(seq) + 1` calculado
 * DENTRO da transação, e não `Date.now()`: relógio de celular anda para trás,
 * dois eventos no mesmo milissegundo empatam, e um fixture de teste que dependa
 * da hora prova a regra só enquanto o relógio colaborar (§7.8).
 */

/** Uma escrita local: o rascunho de um dia, na fila ou fora dela. */
export interface PendingNote {
  /** `pendingNoteKey(userId, planItemId)` — a chave primária. */
  readonly key: string;
  readonly userId: string;
  readonly planItemId: string;
  /** ProseMirror JSON (ADR 0001). Nunca HTML, nunca `plainText`. */
  readonly doc: Record<string, unknown>;
  /**
   * O lugar na fila, ou `null` para o rascunho que não está esperando rede.
   * Cresce sozinho; quem já tem lugar **mantém** o seu ao ser reescrito.
   */
  readonly seq: number | null;
}

export interface PendingNoteInput {
  userId: string;
  planItemId: string;
  doc: Record<string, unknown>;
}

/**
 * O destino de uma escrita que já terminou — o que fazer com o registro dela.
 *
 * - **`forget`**: o servidor confirmou (ou executou). Rascunho e fila somem.
 * - **`enqueue`**: não chegou. Guarda o lugar na fila.
 * - **`dequeue`**: chegou e foi recusado. Sai da fila; o rascunho CONTINUA,
 *   porque o texto é da pessoa (regra 12).
 */
export type WriteFate = 'forget' | 'enqueue' | 'dequeue';

/**
 * O contrato — e o vocabulário é o do domínio da fatia, não CRUD genérico.
 *
 * ⚠️ **A EXCEÇÃO AO `save · byId · update · find · delete` DO `CLAUDE.md` É
 * DELIBERADA, e foi decidida na auditoria da Tarefa 21 — não "conserte".** Aquele
 * vocabulário descreve **Repository de domínio** (entidade que o backend
 * persiste); isto aqui é armazenamento local do navegador, e as operações são
 * transições de estado de uma escrita. Um `update(id, patch)` genérico deixaria
 * o `seq` na mão do chamador — que é justamente o campo que a store existe para
 * administrar.
 */
export interface PendingNoteStore {
  /** Guarda o rascunho. Não tira da fila quem já está nela (regra 1). */
  saveDraft(input: PendingNoteInput): Promise<void>;
  /**
   * ⚠️ **APLICA O DESTINO DE UMA ESCRITA — E SÓ SE O QUE ESTÁ GUARDADO AINDA FOR
   * O QUE SUBIU.** É compare-and-write, e é a correção do bloqueador da
   * auditoria.
   *
   * O `input.doc` é o documento que a escrita levou. Entre o `PUT` sair e a
   * resposta voltar cabem **segundos** de rede ruim, e nesses segundos a pessoa
   * continua digitando — o rascunho seguinte grava por cima do MESMO registro.
   * Um `delete` incondicional depois do `await` apagaria o texto NOVO enquanto a
   * tela diz "Salvo": perdido do servidor e do disco, em silêncio.
   *
   * Então, quando o documento guardado **mudou**, nenhum destino é aplicado: o
   * registro fica exatamente como está (e continua na fila, se estava). Aquele
   * texto é outra escrita, e ela terá o próprio destino.
   */
  settle(input: PendingNoteInput, fate: WriteFate): Promise<void>;
  /** O que está guardado daquele dia daquela pessoa (regras 2 e 4). */
  byDay(userId: string, planItemId: string): Promise<PendingNote | undefined>;
  /** A fila daquela pessoa, na ordem de entrada (regras 9 e decisão E). */
  queue(userId: string): Promise<PendingNote[]>;
}

/**
 * "É o mesmo documento?" por serialização, que é a mesma comparação que a tela
 * já usa para decidir se houve mudança (`savedRef` em `day-note.tsx`).
 *
 * ⚠️ O limite, registrado: ela é sensível à ORDEM das chaves. Não morde aqui
 * porque os dois lados vêm da mesma árvore (o `structuredClone` do IndexedDB
 * preserva a ordem de inserção), e o custo do contrário seria um deep-equal
 * próprio para ganhar um caso que não existe.
 */
export function sameDoc(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown>,
): boolean {
  return a !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

/**
 * `encodeURIComponent` nos dois lados: os ids são `randomUUID()` hoje (nada a
 * escapar), mas dois ids que contivessem `:` poderiam produzir a MESMA chave
 * para pares diferentes — e aí o rascunho de uma pessoa apareceria para outra.
 * É a mesma lição que a Tarefa 15 pagou no `code` do convite.
 */
export function pendingNoteKey(userId: string, planItemId: string): string {
  return `${encodeURIComponent(userId)}:${encodeURIComponent(planItemId)}`;
}

/**
 * A recusa da store que não abriu (decisão F).
 *
 * ⚠️ Ela **recusa** em vez de fingir que gravou, e isso é o que impede a mentira
 * do `queued` na tela: um no-op silencioso faria o app prometer "vamos enviar
 * quando a conexão voltar" sobre uma fila que não existe. Quem chama decide —
 * a tela trata a recusa como a Tarefa 18 tratava tudo (erro + "salvar de novo").
 */
export class StoreUnavailableError extends Error {
  constructor() {
    super('IndexedDB is not available');
    this.name = 'StoreUnavailableError';
  }
}

export function createUnavailablePendingNoteStore(): PendingNoteStore {
  const refuse = <T>(): Promise<T> =>
    Promise.reject(new StoreUnavailableError());

  return {
    saveDraft: refuse,
    settle: refuse,
    byDay: refuse,
    queue: refuse,
  };
}

const DB_NAME = 'clube-do-livro';
const DB_VERSION = 1;
const STORE_NAME = 'pendingNotes';
/** A fila de uma pessoa se lê por aqui, sem varrer a de todo mundo. */
const USER_INDEX = 'byUser';

/** O `result` de um `IDBRequest` é `any`; ele entra como `unknown` e é NARROWED. */
function toPendingNote(value: unknown): PendingNote | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record: Record<string, unknown> = { ...value };
  const { key, userId, planItemId, doc, seq } = record;

  if (typeof key !== 'string') return undefined;
  if (typeof userId !== 'string') return undefined;
  if (typeof planItemId !== 'string') return undefined;
  if (typeof doc !== 'object' || doc === null) return undefined;
  if (seq !== null && typeof seq !== 'number') return undefined;

  return { key, userId, planItemId, doc: { ...doc }, seq };
}

function toPendingNotes(value: unknown): PendingNote[] {
  if (!Array.isArray(value)) return [];
  const notes: PendingNote[] = [];
  for (const item of value) {
    const note = toPendingNote(item);
    if (note !== undefined) notes.push(note);
  }
  return notes;
}

/** O registro como ele vai para o disco. Uma função só, para os dois caminhos. */
function toEntry(input: PendingNoteInput, seq: number | null): PendingNote {
  return {
    key: pendingNoteKey(input.userId, input.planItemId),
    userId: input.userId,
    planItemId: input.planItemId,
    doc: input.doc,
    seq,
  };
}

/** Um `IDBRequest` vira `Promise`. `unknown` na saída — o narrowing é do chamador. */
function fromRequest(request: IDBRequest): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    request.onsuccess = () => {
      const result: unknown = request.result;
      resolve(result);
    };
    request.onerror = () => {
      reject(request.error ?? new StoreUnavailableError());
    };
  });
}

export function createIndexedDbPendingNoteStore(
  factory: IDBFactory,
): PendingNoteStore {
  /**
   * ⚠️ A conexão é memoizada, e a promessa é **descartada quando falha**: um
   * `open` que deu errado por cota estourada pode dar certo na próxima vez, e
   * uma promessa rejeitada guardada para sempre condenaria a aba inteira.
   */
  let connection: Promise<IDBDatabase> | undefined;

  function open(): Promise<IDBDatabase> {
    if (connection !== undefined) return connection;

    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (db.objectStoreNames.contains(STORE_NAME)) return;
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex(USER_INDEX, 'userId', { unique: false });
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new StoreUnavailableError());
      };
      // Modo privado do Safari e "armazenamento do site bloqueado" travam o
      // `open` sem `error` nenhum. Sem isto a tela ficaria em `saving` para
      // sempre — que é pior que dizer "não salvei".
      request.onblocked = () => {
        reject(new StoreUnavailableError());
      };
    });

    return connection.catch((error: unknown) => {
      connection = undefined;
      throw error instanceof Error ? error : new StoreUnavailableError();
    });
  }

  /**
   * ⚠️ **A PROMESSA SÓ RESOLVE NO COMMIT DA TRANSAÇÃO** — e isto é a correção
   * de um achado da auditoria, não zelo.
   *
   * O `onsuccess` de um `put` **não** quer dizer que a escrita ficou gravada:
   * `QuotaExceededError` e a maior parte das falhas de escrita aparecem no
   * COMMIT, depois do `onsuccess` do request. Resolvendo no request, o
   * `settle(..., 'enqueue')` respondia sucesso, a tela dizia "vai sozinho
   * quando a conexão voltar", e a transação tinha abortado — a mentira exata
   * que a decisão F existe para impedir.
   *
   * `oncomplete` resolve; `onabort` e `onerror` recusam.
   *
   * ⚠️ **E ISTO NÃO É DECIDÍVEL NA SUÍTE — a afirmação foi medida** (§7.10). O
   * `fake-indexeddb` resolve o request e comita a transação na MESMA tarefa, e
   * não tem cota: as duas implementações (resolver no request × resolver no
   * commit) são indistinguíveis aqui, e um teste escrito contra elas seria falso
   * verde nos dois sentidos. A propriedade é decidível onde ela morde — num
   * navegador de verdade com a cota estourada, que é o §6.1 do
   * `docs/COMO-TESTAR.md` ("aba anônima"). O que a suíte guarda é o outro lado:
   * a store que recusa não pode virar `queued` na tela (regra 17).
   */
  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const db = await open();

    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      let value: T;
      const fail = (): void => {
        reject(transaction.error ?? new StoreUnavailableError());
      };

      transaction.oncomplete = () => {
        resolve(value);
      };
      transaction.onabort = fail;
      transaction.onerror = fail;

      run(transaction.objectStore(STORE_NAME)).then(
        (result) => {
          value = result;
        },
        (error: unknown) => {
          try {
            transaction.abort();
          } catch {
            // Já abortada: o `onabort` acima é quem recusa.
          }
          reject(error);
        },
      );
    });
  }

  return {
    saveDraft(input) {
      return withStore('readwrite', async (store) => {
        const key = pendingNoteKey(input.userId, input.planItemId);
        const current = toPendingNote(await fromRequest(store.get(key)));
        // O rascunho NÃO tira da fila quem já está nela: continuar escrevendo
        // sem sinal atualiza o documento e mantém o lugar (regra 6).
        store.put(toEntry(input, current?.seq ?? null));
      });
    },

    settle(input, fate) {
      return withStore('readwrite', async (store) => {
        /*
          ⚠️ **UM ÚNICO PONTO DE `await` ANTES DA ESCRITA, e é de propósito.**

          O `getAll()` traz TUDO — o registro deste dia e o maior `seq` da fila
          — numa requisição só, então a mutação é emitida logo depois do
          primeiro (e único) `await`. A versão anterior fazia `get` → await →
          `getAll` → await → `put`, que é o padrão que estoura com
          `TransactionInactiveError` no Safari. A tabela tem uma linha por
          (pessoa, dia) — varrer é mais barato que a segunda ida.
        */
        const all = toPendingNotes(await fromRequest(store.getAll()));
        const key = pendingNoteKey(input.userId, input.planItemId);
        const current = all.find((entry) => entry.key === key);

        // ⚠️ **COMPARE-AND-WRITE**: se a pessoa digitou durante o `PUT`, o
        // documento guardado é OUTRA escrita — e o destino desta não se aplica
        // a ele. Nada muda; aquele texto terá o próprio destino.
        if (current !== undefined && !sameDoc(current.doc, input.doc)) return;

        if (fate === 'forget') {
          store.delete(key);
          return;
        }
        if (fate === 'dequeue') {
          // REGRA 12: sai da fila, o rascunho continua.
          if (current !== undefined) store.put(toEntry(input, null));
          return;
        }
        // `enqueue`: quem já tem lugar MANTÉM o seu (regras 6 e 9).
        const next =
          current?.seq ??
          all.reduce((highest, entry) => Math.max(highest, entry.seq ?? 0), 0) +
            1;
        store.put(toEntry(input, next));
      });
    },

    byDay(userId, planItemId) {
      return withStore('readonly', async (store) =>
        toPendingNote(
          await fromRequest(store.get(pendingNoteKey(userId, planItemId))),
        ),
      );
    },

    queue(userId) {
      return withStore('readonly', async (store) => {
        const mine = toPendingNotes(
          await fromRequest(store.index(USER_INDEX).getAll(userId)),
        );
        // ⚠️ O `sort` é OBRIGATÓRIO: o índice enumera por chave, não por ordem
        // de entrada. O teste de contrato escolhe os dias para que as duas
        // ordens sejam OPOSTAS (§7.2).
        return mine
          .filter((entry) => entry.seq !== null)
          .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      });
    },
  };
}

/**
 * O que o `main.tsx` chama: a store de verdade quando o navegador tem
 * IndexedDB, e a que **recusa** quando não tem (decisão F).
 *
 * O `factory` entra por parâmetro em vez de ser lido do `globalThis` aqui
 * dentro para o teste poder passar o `fake-indexeddb` — e para este módulo
 * continuar importável em qualquer ambiente.
 */
export function openPendingNoteStore(
  factory: IDBFactory | undefined,
): PendingNoteStore {
  if (factory === undefined) return createUnavailablePendingNoteStore();
  return createIndexedDbPendingNoteStore(factory);
}

/**
 * ⚠️ Protegido por `try`: um navegador com armazenamento do site bloqueado
 * lança ao só TOCAR em `globalThis.indexedDB` — a mesma lição que a Tarefa 12
 * pagou no token (`createTokenStorage`) e a 16 no clube ativo. Sem o `try`, o
 * app **não abre**.
 */
export function browserIndexedDb(): IDBFactory | undefined {
  try {
    return globalThis.indexedDB ?? undefined;
  } catch {
    return undefined;
  }
}
