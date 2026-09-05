import type { NoteDocBody, NoteResponse } from '@clube/shared';
import {
  type ApiClient,
  ApiError,
  createApiClient,
  type FetchLike,
} from '@clube/shared/client';
import { describe, expect, it } from 'vitest';

import {
  deliveryOf,
  flushQueue,
  planNotePath,
  submitPlanNote,
  type WriteContext,
} from '../queue';
import {
  createUnavailablePendingNoteStore,
  type PendingNoteStore,
} from '../store';
import { createPendingNoteStoreFake } from './pending-note-store-fake';

/**
 * A FILA DE ESCRITA (Tarefa 21) — enfileirar, deduplicar, esvaziar.
 *
 * ⚠️ **O CLIENTE HTTP AQUI É O DE VERDADE**, com um `fetchImpl` no lugar da
 * rede. É deliberado, e é o que torna a regra 8 provável de verdade: o
 * `ApiError` com status **2xx** não é fabricado pelo teste — ele nasce do mesmo
 * caminho que o produz em produção (o corpo que não casa o `response` schema,
 * §6.8 do `docs/CONVENCOES-CODIGO.md`). Um dublê de `ApiClient` provaria o
 * discriminador contra um erro que o teste inventou.
 */

const MARCOS = 'u-marcos';
const MARIA = 'u-maria';
const FIRST_DAY = 'p-zebra';
const SECOND_DAY = 'p-abelha';

function aDoc(text: string): NoteDocBody {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

/** A nota como a API a devolve — o `noteResponseSchema` é validado pelo cliente. */
function aNote(doc: NoteDocBody): NoteResponse {
  return {
    id: 'n-marcos',
    clubId: 'c-casal',
    bookId: 'b-hobbit',
    userId: MARCOS,
    kind: 'PLAN',
    planItemId: FIRST_DAY,
    title: 'Cap. 3',
    reference: null,
    doc,
    plainText: 'texto',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: '2026-09-04T10:00:00.000Z',
    updatedAt: '2026-09-04T10:00:00.000Z',
  };
}

interface SentRequest {
  url: string;
  method: string;
  body: unknown;
}

interface ServerReply {
  status: number;
  /** Serializado como JSON; use `raw` para corpo FORA do contrato. */
  body?: unknown;
  raw?: string;
  /** `true` = o `fetch` rejeita: é a falha de REDE (`status: 0`). */
  offline?: boolean;
}

interface Server {
  api: ApiClient;
  sent: SentRequest[];
}

/**
 * Uma resposta por chamada, na ordem; a última vale para o que sobrar.
 *
 * O `whileInFlight` roda com a requisição **no ar** — é onde o teste escreve o
 * que a pessoa digita enquanto a barrinha ainda diz "Salvando…".
 */
function serverThat(
  replies: readonly ServerReply[],
  whileInFlight?: () => Promise<void>,
): Server {
  const sent: SentRequest[] = [];

  const fetchImpl: FetchLike = async (url, init) => {
    sent.push({
      url,
      method: init.method,
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    });
    await whileInFlight?.();

    const reply = replies[Math.min(sent.length - 1, replies.length - 1)] ?? {
      status: 500,
    };
    if (reply.offline === true) throw new TypeError('failed');

    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      text: () =>
        Promise.resolve(reply.raw ?? JSON.stringify(reply.body ?? {})),
    };
  };

  return {
    sent,
    api: createApiClient({
      baseUrl: 'https://api.teste',
      getToken: () => 'token-da-sessao',
      onUnauthorized: () => undefined,
      fetchImpl,
    }),
  };
}

function contextOf(
  server: Server,
  store: PendingNoteStore,
  userId = MARCOS,
): WriteContext {
  return { api: server.api, store, userId };
}

/*
  ⚠️ **O DISCRIMINADOR EXPLÍCITO — A REGRA 8, E ELA TEM NOME.**

  `docs/CONVENCOES-CODIGO.md` §6.8: um `ApiError` com status 2xx significa "o
  servidor aceitou e EXECUTOU, só não entendemos a resposta". Reenviar isso é
  escrever duas vezes. Um `catch (error) { enfileira() }` genérico perde a
  distinção inteira — e é por isso que ela é uma FUNÇÃO com teste próprio, e não
  uma comparação de faixa de status espalhada pela fila.
*/
describe('⚠️ THE EXPLICIT DELIVERY DISCRIMINATOR (rule 8)', () => {
  it('calls a network failure NOT DELIVERED — and it is the only thing the queue accepts', () => {
    expect(deliveryOf(new ApiError({ status: 0, error: 'Network' }))).toBe(
      'not-delivered',
    );
  });

  it('⚠️ calls an ApiError with a 2xx status ACCEPTED — the server executed it', () => {
    // 200 e 201: o `PUT` gravou e respondeu, e só o CORPO não casou o schema.
    expect(deliveryOf(new ApiError({ status: 200, error: 'Bad body' }))).toBe(
      'accepted',
    );
    expect(deliveryOf(new ApiError({ status: 201, error: 'Bad body' }))).toBe(
      'accepted',
    );
  });

  it('calls everything the server refused REJECTED', () => {
    for (const status of [400, 401, 403, 404, 410, 422, 500, 502]) {
      expect(deliveryOf(new ApiError({ status, error: 'no' }))).toBe(
        'rejected',
      );
    }
  });

  it('calls an error that is not an ApiError REJECTED — never "try again later"', () => {
    // Um defeito nosso não é uma queda de rede. Enfileirar o que não sabemos
    // interpretar é reenviar às cegas o que pode já ter sido gravado.
    expect(deliveryOf(new TypeError('boom'))).toBe('rejected');
    expect(deliveryOf(undefined)).toBe('rejected');
  });
});

describe('writing the note of a day (rules 5, 7, 8)', () => {
  it('sends { doc } to the plan item and FORGETS the draft when the server confirms (rule 3)', async () => {
    const server = serverThat([{ status: 200, body: aNote(aDoc('salvo')) }]);
    const store = createPendingNoteStoreFake();
    await store.saveDraft({
      userId: MARCOS,
      planItemId: FIRST_DAY,
      doc: aDoc('salvo'),
    });

    const result = await submitPlanNote(
      contextOf(server, store),
      FIRST_DAY,
      aDoc('salvo'),
    );

    expect(result.status).toBe('sent');
    expect(server.sent).toHaveLength(1);
    expect(server.sent[0]?.method).toBe('PUT');
    expect(server.sent[0]?.url).toBe(
      `https://api.teste${planNotePath(FIRST_DAY)}`,
    );
    // ⚠️ AS CHAVES EXATAS: `plainText` é derivado no backend (ADR 0001) e o
    // `upsertPlanNoteSchema` é `.strict()`.
    expect(Object.keys(server.sent[0]?.body ?? {})).toEqual(['doc']);
    // DECISÃO A: o servidor confirmou, então o rascunho não existe mais.
    expect(await store.byDay(MARCOS, FIRST_DAY)).toBeUndefined();
  });

  it('⚠️ does NOT erase what was typed WHILE the PUT was in flight (the blocker)', async () => {
    /*
      ⚠️ **A JANELA TEM A LARGURA DO `PUT` INTEIRO — segundos, no metrô — e não
      de uma microtarefa.** O `fetchImpl` abaixo grava o rascunho novo ANTES de
      o servidor responder, que é exatamente o que a pessoa faz: ela continua
      escrevendo enquanto a barrinha diz "Salvando…".

      Sem o compare-and-write, o `settle(..., 'forget')` apagava o registro que
      já continha o texto NOVO: perdido do servidor (nunca subiu) e do disco, com
      a tela dizendo "Salvo".
    */
    const store = createPendingNoteStoreFake();
    const typedDuringThePut = {
      userId: MARCOS,
      planItemId: FIRST_DAY,
      doc: aDoc('o que subiu, e mais uma frase'),
    };

    const server = serverThat(
      [{ status: 200, body: aNote(aDoc('o que subiu')) }],
      () => store.saveDraft(typedDuringThePut),
    );

    await store.saveDraft({
      userId: MARCOS,
      planItemId: FIRST_DAY,
      doc: aDoc('o que subiu'),
    });

    const result = await submitPlanNote(
      contextOf(server, store),
      FIRST_DAY,
      aDoc('o que subiu'),
    );

    expect(result.status).toBe('sent');
    // O texto novo continua guardado — ele é outra escrita, e sobe na próxima.
    expect((await store.byDay(MARCOS, FIRST_DAY))?.doc).toEqual(
      typedDuringThePut.doc,
    );
  });

  it('QUEUES a write that did not reach the server, and keeps the draft (rule 5)', async () => {
    const server = serverThat([{ status: 0, offline: true }]);
    const store = createPendingNoteStoreFake();

    const result = await submitPlanNote(
      contextOf(server, store),
      FIRST_DAY,
      aDoc('sem rede'),
    );

    expect(result.status).toBe('queued');
    const queue = await store.queue(MARCOS);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.doc).toEqual(aDoc('sem rede'));
  });

  it('⚠️ NEVER queues an ApiError with a 2xx status, and never sends it again (rule 8)', async () => {
    /*
      ⚠️ **A REGRA QUE UM `catch` GENÉRICO PERDE.** O servidor respondeu **200**
      e o corpo não casou o `noteResponseSchema` — ou seja, **a anotação FOI
      gravada**. Pôr isso na fila faria o app gravar a mesma anotação outra vez
      quando a conexão "voltasse". Decisão fechada da Tarefa 12.
    */
    const server = serverThat([{ status: 200, raw: '<!doctype html>' }]);
    const store = createPendingNoteStoreFake();

    const result = await submitPlanNote(
      contextOf(server, store),
      FIRST_DAY,
      aDoc('foi gravado'),
    );

    expect(result.status).toBe('accepted');
    // A FILA CONTINUA VAZIA — não há reenvio possível.
    expect(await store.queue(MARCOS)).toEqual([]);

    // E esvaziar a fila depois disso não manda nada: só houve UMA requisição.
    await flushQueue(contextOf(server, store));
    expect(server.sent).toHaveLength(1);
  });

  it('⚠️ takes an ALREADY QUEUED write out of the queue on a 2xx ApiError (rule 8)', async () => {
    /*
      O outro lado, e é o que fecha o buraco: a entrada já estava na fila (a
      pessoa escreveu sem sinal), a conexão voltou, o servidor gravou e
      respondeu 2xx com corpo fora do contrato. Se ela CONTINUASSE na fila,
      cada `online` seguinte gravaria de novo — para sempre.
    */
    const server = serverThat([
      { status: 0, offline: true },
      { status: 200, raw: 'nao e json' },
    ]);
    const store = createPendingNoteStoreFake();

    await submitPlanNote(contextOf(server, store), FIRST_DAY, aDoc('offline'));
    expect(await store.queue(MARCOS)).toHaveLength(1);

    await flushQueue(contextOf(server, store));

    expect(await store.queue(MARCOS)).toEqual([]);
    expect(server.sent).toHaveLength(2);

    // E um `online` depois não manda mais nada.
    await flushQueue(contextOf(server, store));
    expect(server.sent).toHaveLength(2);
  });

  it('does NOT queue what the server refused, and keeps the text (rule 7, decision D)', async () => {
    for (const status of [400, 403, 404, 410]) {
      const server = serverThat([{ status, body: { error: 'no' } }]);
      const store = createPendingNoteStoreFake();
      await store.saveDraft({
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('recusado'),
      });

      const result = await submitPlanNote(
        contextOf(server, store),
        FIRST_DAY,
        aDoc('recusado'),
      );

      // Uma fila que reenvia o que o servidor já recusou tenta para sempre.
      expect(result.status).toBe('failed');
      expect(await store.queue(MARCOS)).toEqual([]);
      // O texto é da pessoa: o rascunho CONTINUA (regra 12).
      expect((await store.byDay(MARCOS, FIRST_DAY))?.doc).toEqual(
        aDoc('recusado'),
      );
    }
  });

  it('does not lose the outcome when the queue itself is unavailable (rule 17, decision F)', async () => {
    /*
      ⚠️ Modo privado, cota estourada, navegador antigo. Sem IndexedDB não há
      fila — e dizer `queued` seria mentir sobre um reenvio que não vai
      acontecer. A tela volta a se comportar como na Tarefa 18.
    */
    const server = serverThat([{ status: 0, offline: true }]);
    const store = createUnavailablePendingNoteStore();

    const result = await submitPlanNote(
      { api: server.api, store, userId: MARCOS },
      FIRST_DAY,
      aDoc('sem armazenamento'),
    );

    expect(result.status).toBe('failed');
  });
});

describe('emptying the queue (rules 9, 10, 11, 12)', () => {
  it('sends what is queued, in the order the entries went in (rule 9)', async () => {
    const server = serverThat([{ status: 200, body: aNote(aDoc('ok')) }]);
    const store = createPendingNoteStoreFake();
    await store.settle(
      {
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('primeiro'),
      },
      'enqueue',
    );
    await store.settle(
      {
        userId: MARCOS,
        planItemId: SECOND_DAY,
        doc: aDoc('segundo'),
      },
      'enqueue',
    );

    await flushQueue(contextOf(server, store));

    expect(server.sent.map((request) => request.url)).toEqual([
      `https://api.teste${planNotePath(FIRST_DAY)}`,
      `https://api.teste${planNotePath(SECOND_DAY)}`,
    ]);
  });

  it('erases the entry AND the draft of what went out (rule 10)', async () => {
    const server = serverThat([{ status: 200, body: aNote(aDoc('ok')) }]);
    const store = createPendingNoteStoreFake();
    await store.settle(
      {
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('enviado'),
      },
      'enqueue',
    );

    const results = await flushQueue(contextOf(server, store));

    expect(results).toEqual([{ planItemId: FIRST_DAY, status: 'sent' }]);
    expect(await store.queue(MARCOS)).toEqual([]);
    expect(await store.byDay(MARCOS, FIRST_DAY)).toBeUndefined();
  });

  it('KEEPS the entry when the resend fails by network — no duplicate, nothing lost (rule 11)', async () => {
    const server = serverThat([{ status: 0, offline: true }]);
    const store = createPendingNoteStoreFake();
    await store.settle(
      {
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('ainda sem rede'),
      },
      'enqueue',
    );

    await flushQueue(contextOf(server, store));

    const queue = await store.queue(MARCOS);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.doc).toEqual(aDoc('ainda sem rede'));
  });

  it('REMOVES the entry on a permanent 4xx, and keeps the draft (rule 12)', async () => {
    /*
      Senão a fila nunca esvazia: 404 na anotação do dia é "o membership sumiu"
      ou "o dia deixou de existir", e repetir não conserta. O texto, esse,
      continua — é da pessoa.
    */
    const server = serverThat([{ status: 404, body: { error: 'Not Found' } }]);
    const store = createPendingNoteStoreFake();
    await store.settle(
      {
        userId: MARCOS,
        planItemId: FIRST_DAY,
        doc: aDoc('o dia sumiu'),
      },
      'enqueue',
    );

    const results = await flushQueue(contextOf(server, store));

    expect(results.map((result) => result.status)).toEqual(['failed']);
    expect(await store.queue(MARCOS)).toEqual([]);
    expect((await store.byDay(MARCOS, FIRST_DAY))?.doc).toEqual(
      aDoc('o dia sumiu'),
    );
  });

  it('⚠️ sends ONLY the entries of the person who is signed in (decision E)', async () => {
    /*
      ⚠️ **O APARELHO É DE CASA.** O autor da nota vem do JWT, então reenviar a
      anotação de quem estava antes com o token de quem entrou agora faria o
      backend gravar o texto de uma pessoa como nota da OUTRA — e ele
      aceitaria, sem uma linha vermelha em lugar nenhum.
    */
    const server = serverThat([{ status: 200, body: aNote(aDoc('ok')) }]);
    const store = createPendingNoteStoreFake();
    await store.settle(
      {
        userId: MARIA,
        planItemId: FIRST_DAY,
        doc: aDoc('o que ELA escreveu'),
      },
      'enqueue',
    );
    await store.settle(
      {
        userId: MARCOS,
        planItemId: SECOND_DAY,
        doc: aDoc('o que EU escrevi'),
      },
      'enqueue',
    );

    await flushQueue(contextOf(server, store, MARCOS));

    expect(server.sent).toHaveLength(1);
    expect(server.sent[0]?.body).toEqual({ doc: aDoc('o que EU escrevi') });
    // E o dela continua guardado, esperando ELA voltar.
    expect((await store.queue(MARIA))[0]?.doc).toEqual(
      aDoc('o que ELA escreveu'),
    );
  });

  it('does nothing, and does not throw, when there is no queue at all (decision F)', async () => {
    const server = serverThat([{ status: 200, body: aNote(aDoc('ok')) }]);

    const results = await flushQueue({
      api: server.api,
      store: createUnavailablePendingNoteStore(),
      userId: MARCOS,
    });

    expect(results).toEqual([]);
    expect(server.sent).toEqual([]);
  });

  it('sends nothing when the queue is empty', async () => {
    const server = serverThat([{ status: 200, body: aNote(aDoc('ok')) }]);

    await flushQueue(contextOf(server, createPendingNoteStoreFake()));

    expect(server.sent).toEqual([]);
  });
});
