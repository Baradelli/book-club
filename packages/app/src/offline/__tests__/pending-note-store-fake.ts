import {
  type PendingNote,
  type PendingNoteInput,
  pendingNoteKey,
  type PendingNoteStore,
  sameDoc,
} from '../store';

/**
 * O FAKE EM MEMÓRIA DO `PendingNoteStore` — o que as telas usam nos testes.
 *
 * Ele existe pelo mesmo motivo dos fakes de repositório do backend
 * (`CLAUDE.md`: um port, uma implementação real, um fake): a tela precisa de uma
 * store rápida e inspecionável, e o IndexedDB de verdade num teste de tela
 * custaria uma transação assíncrona por tecla.
 *
 * ⚠️ **E ELE RESPONDE AO MESMO TESTE DE CONTRATO QUE A IMPLEMENTAÇÃO REAL**
 * (`pending-note-store.test.ts`, `describe.each`). É o §7.1 do
 * `docs/CONVENCOES-CODIGO.md`: fake que diverge da implementação real esconde
 * bug **nas duas direções**, e a restritiva esconde melhor, porque a suíte fica
 * verde.
 *
 * ⚠️ **A ENUMERAÇÃO INTERNA É INVERTIDA DE PROPÓSITO** (§7.2). O `queue()`
 * promete ordem de ENTRADA, e a única forma de cumprir essa promessa é ordenar
 * por `seq`. Se o fake devolvesse os valores do `Map` na ordem de inserção, uma
 * implementação que esquecesse o `sort` passaria aqui e falharia no IndexedDB
 * — que enumera por chave primária, não por inserção. Invertendo, o esquecimento
 * fica vermelho nas duas implementações.
 *
 * ⚠️ **E O `sameDoc` VEM DE `../store`**, não é reescrito aqui: a comparação do
 * compare-and-write é parte do contrato, e duas cópias dela divergiriam na
 * primeira correção (é a lição do `GUILT_TERMS` na Tarefa 19).
 */
export function createPendingNoteStoreFake(): PendingNoteStore {
  const entries = new Map<string, PendingNote>();

  /** §7.1: o IndexedDB CLONA o que grava, então o fake não pode guardar a árvore que o chamador ainda segura. */
  function clone(doc: Record<string, unknown>): Record<string, unknown> {
    return structuredClone(doc);
  }

  function put(input: PendingNoteInput, seq: number | null): void {
    const key = pendingNoteKey(input.userId, input.planItemId);
    entries.set(key, {
      key,
      userId: input.userId,
      planItemId: input.planItemId,
      doc: clone(input.doc),
      seq,
    });
  }

  return {
    saveDraft(input) {
      // O rascunho NÃO tira da fila quem já está nela: digitar mais enquanto
      // offline atualiza o documento e mantém o lugar (regra 6).
      const current = entries.get(
        pendingNoteKey(input.userId, input.planItemId),
      );
      put(input, current?.seq ?? null);
      return Promise.resolve();
    },

    settle(input, fate) {
      const key = pendingNoteKey(input.userId, input.planItemId);
      const current = entries.get(key);

      // ⚠️ COMPARE-AND-WRITE: o documento guardado mudou durante o `PUT`, então
      // ele é outra escrita — e o destino desta não se aplica a ele.
      if (current !== undefined && !sameDoc(current.doc, input.doc)) {
        return Promise.resolve();
      }

      if (fate === 'forget') {
        entries.delete(key);
        return Promise.resolve();
      }
      if (fate === 'dequeue') {
        if (current !== undefined) put(input, null);
        return Promise.resolve();
      }

      let max = 0;
      for (const entry of entries.values()) {
        if (entry.seq !== null && entry.seq > max) max = entry.seq;
      }
      put(input, current?.seq ?? max + 1);
      return Promise.resolve();
    },

    byDay(userId, planItemId) {
      const entry = entries.get(pendingNoteKey(userId, planItemId));
      return Promise.resolve(
        entry === undefined ? undefined : { ...entry, doc: clone(entry.doc) },
      );
    },

    queue(userId) {
      // ⚠️ `.reverse()` ANTES do `sort`: a enumeração crua é hostil de
      // propósito (§7.2) — quem não ordenar por `seq` fica vermelho aqui.
      const queued = [...entries.values()]
        .reverse()
        .filter((entry) => entry.userId === userId && entry.seq !== null)
        .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
        .map((entry) => ({ ...entry, doc: clone(entry.doc) }));
      return Promise.resolve(queued);
    },
  };
}
