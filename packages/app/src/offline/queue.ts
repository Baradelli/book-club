import { noteResponseSchema } from '@clube/shared';
import { type ApiClient, ApiError } from '@clube/shared/client';

import type { PendingNoteStore } from './store';

/**
 * A FILA DE ESCRITA DA ANOTAÇÃO DO DIA (Tarefa 21) — enfileirar, deduplicar,
 * esvaziar. Sem React aqui dentro: quem monta o gatilho é o
 * `offline-notes.tsx`, e quem pinta é a tela.
 *
 * ⚠️ **O QUE ENTRA NA FILA É SÓ O QUE NÃO CHEGOU.** As três pontas têm nome
 * (`Delivery`), e o nome é a regra 8 escrita em código.
 */

/**
 * ⚠️ **O DISCRIMINADOR EXPLÍCITO QUE O §6.8 PEDE** — "chegou e foi recusado" ×
 * "chegou e foi aceito" × "não chegou".
 *
 * Ele existe como FUNÇÃO com teste próprio, e não como uma comparação de faixa
 * de status escondida num `catch`, porque a distinção do meio é invisível para
 * quem não conhece a história: um `ApiError` com status **2xx** quer dizer que o
 * servidor **gravou** e só o corpo não casou o `response` schema (o
 * `navigateFallback` de um service worker, um contrato que mudou). Reenviar
 * isso é escrever duas vezes.
 */
export type Delivery =
  /** Não chegou ao servidor — o único caso que a fila aceita (regra 5). */
  | 'not-delivered'
  /** Chegou, e o servidor **executou**. NUNCA reenviar (regra 8). */
  | 'accepted'
  /** Chegou e foi recusado: `4xx`, `5xx`, ou erro que não sabemos ler. */
  | 'rejected';

export function deliveryOf(error: unknown): Delivery {
  if (!(error instanceof ApiError)) {
    // Um defeito nosso não é uma queda de rede. Reenviar às cegas o que não
    // sabemos interpretar pode gravar duas vezes.
    return 'rejected';
  }
  // `isNetworkError` (status 0) já existe em `shared/client` exatamente para
  // isto — a decisão fechada da spec manda usá-lo, não reimplementá-lo.
  if (error.isNetworkError) return 'not-delivered';
  if (error.status >= 200 && error.status < 300) return 'accepted';
  return 'rejected';
}

/** O endereço da anotação de um dia. Uma constante só, lida também pelo teste. */
export function planNotePath(planItemId: string): string {
  return `/plan-items/${encodeURIComponent(planItemId)}/note`;
}

/** O resultado de UMA escrita, do ponto de vista de quem pinta a tela. */
export type WriteResult =
  /** O servidor confirmou: rascunho e entrada apagados (regras 3 e 10). */
  | { status: 'sent' }
  /** Não chegou, e está guardado para ir sozinho depois (regra 5). */
  | { status: 'queued' }
  /** Chegou e foi executado; a resposta é que não casou o contrato (regra 8). */
  | { status: 'accepted'; error: unknown }
  /** Recusado, ou sem fila para guardar (regras 7 e 17). */
  | { status: 'failed'; error: unknown };

export interface WriteContext {
  api: ApiClient;
  store: PendingNoteStore;
  /**
   * ⚠️ **DE QUEM É A FILA.** O autor da nota vem do JWT, então uma fila global
   * gravaria o texto de quem estava antes como nota de quem entrou depois — e o
   * backend aceitaria (decisão E).
   */
  userId: string;
}

/**
 * O `PUT` da anotação do dia.
 *
 * `{ doc }` e nada mais: `plainText` é derivado no backend (ADR 0001), o
 * `upsertPlanNoteSchema` é `.strict()`, e `userId`/`clubId` vêm do JWT e da
 * rota. `api.request` e não um `api.put` porque o `ApiClient` de
 * `shared/client` não tem `put` — e `shared/src/client/**` não é tocado nesta
 * fatia.
 */
async function sendPlanNote(
  api: ApiClient,
  planItemId: string,
  doc: Record<string, unknown>,
): Promise<void> {
  await api.request(planNotePath(planItemId), {
    method: 'PUT',
    body: { doc },
    schema: noteResponseSchema,
  });
}

/** A store pode recusar (decisão F). Uma limpeza que falha não muda o veredito. */
async function quietly(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch {
    // No-op deliberado: sem armazenamento local não há o que limpar.
  }
}

/**
 * Manda a anotação de um dia, e decide o que fazer com o que não foi.
 *
 * ⚠️ **A ORDEM DAS TRÊS SAÍDAS É A REGRA 8, A 7 E A 5**, nesta ordem de
 * precedência — e é por isso que o `catch` aqui **não** é genérico.
 */
export async function submitPlanNote(
  context: WriteContext,
  planItemId: string,
  doc: Record<string, unknown>,
): Promise<WriteResult> {
  const { api, store, userId } = context;

  /*
    ⚠️ **O `input` CARREGA O DOCUMENTO QUE SUBIU, e é ele que a store compara.**

    Todo destino aqui é aplicado ao registro de (pessoa, dia) **só se o que está
    guardado ainda for este documento**. Entre o `PUT` sair e a resposta voltar
    cabem segundos de rede ruim, e nesses segundos a pessoa continua digitando:
    aplicar o destino desta escrita ao texto NOVO apagaria dele do disco algo que
    nunca chegou ao servidor — com a tela dizendo "Salvo". → `store.settle`.
  */
  const input = { userId, planItemId, doc };

  try {
    await sendPlanNote(api, planItemId, doc);
  } catch (error: unknown) {
    const delivery = deliveryOf(error);

    if (delivery === 'not-delivered') {
      try {
        // A dedupe é da store: mesma chave, mesmo lugar na fila (regra 6).
        await store.settle(input, 'enqueue');
        return { status: 'queued' };
      } catch (queueError: unknown) {
        // Sem fila não há reenvio, e prometer um seria mentira na tela.
        return { status: 'failed', error: queueError };
      }
    }

    // REGRA 8: o servidor EXECUTOU — este texto está gravado lá. Some do disco
    // (inclusive da fila: o próximo `online` não pode gravá-lo de novo), e a
    // invariante A volta a valer sem exceção. Se a pessoa digitou durante o
    // `PUT`, o `settle` não encosta no registro e o texto novo continua.
    if (delivery === 'accepted') {
      await quietly(() => store.settle(input, 'forget'));
      return { status: 'accepted', error };
    }

    // REGRA 7 e decisão D: o servidor recusou. Uma fila que reenvia o que já
    // foi recusado tenta para sempre e nunca esvazia.
    await quietly(() => store.settle(input, 'dequeue'));
    return { status: 'failed', error };
  }

  // DECISÃO A: existir rascunho significa "não enviado". O servidor confirmou,
  // então ele não existe mais.
  await quietly(() => store.settle(input, 'forget'));
  return { status: 'sent' };
}

/**
 * O que aconteceu com CADA entrada — é o que a tela do dia aberto escuta.
 *
 * É o `WriteResult` **mais** o dia, e não um `{ planItemId, status }` novo: a
 * tela precisa do `error` para escolher a frase (403/404 têm a sua), e um tipo
 * paralelo perderia o campo no caminho.
 */
export type FlushOutcome = WriteResult & { planItemId: string };

/**
 * Esvazia a fila daquela pessoa, na ordem em que as entradas entraram.
 *
 * ⚠️ **SEQUENCIAL, e sem parar na primeira falha.** Sequencial porque a ordem é
 * a promessa da regra 9 (e porque uma saraivada em paralelo é justamente o que
 * a decisão B existe para evitar); sem parar porque uma entrada que o servidor
 * recusa não pode bloquear as de trás para sempre — cada uma decide o próprio
 * destino em `submitPlanNote`.
 *
 * ⚠️ **E NÃO EXISTE TIMER AQUI** (regra 14). Quem chama é o evento `online` e a
 * abertura do app, e mais nada: um `setInterval` gastaria bateria para repetir
 * o que o navegador já sabe avisar.
 */
export async function flushQueue(
  context: WriteContext,
): Promise<FlushOutcome[]> {
  let pending: readonly { planItemId: string; doc: Record<string, unknown> }[];
  try {
    pending = await context.store.queue(context.userId);
  } catch {
    // Sem armazenamento local não há fila para esvaziar (decisão F).
    return [];
  }

  const outcomes: FlushOutcome[] = [];
  for (const entry of pending) {
    const result = await submitPlanNote(context, entry.planItemId, entry.doc);
    outcomes.push({ ...result, planItemId: entry.planItemId });
  }
  return outcomes;
}
