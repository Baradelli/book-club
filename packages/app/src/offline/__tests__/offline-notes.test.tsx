import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { act, screen } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  memoryStorage,
  meReply,
  renderPage,
  replyByUrl,
  stubFetch,
} from '../../pages/__tests__/harness';
import { useOfflineNotes } from '../offline-notes';
import { createIndexedDbPendingNoteStore } from '../store';

/**
 * ⚠️ **A FIAÇÃO DE PRODUÇÃO — E ELA NÃO TINHA ACUSADOR NENHUM.**
 *
 * Achado da auditoria da Tarefa 21: trocar o corpo de `browserIndexedDb()` por
 * `return undefined` deixava **414 testes verdes** e desligava a fatia inteira
 * para todo mundo — sem rascunho, sem fila, todos os usuários caindo no caminho
 * da Tarefa 18. A causa é estrutural: o jsdom **não tem IndexedDB**, então todo
 * teste de tela passa a store por parâmetro (ou cai na que recusa, que é a
 * decisão F), e o caminho `openPendingNoteStore(browserIndexedDb())` — o único
 * que o `main.tsx` usa — nunca era exercido.
 *
 * Aqui o `globalThis.indexedDB` recebe um IndexedDB de verdade
 * (`fake-indexeddb`) e o provider é montado **sem** `store`. Se a fiação
 * quebrar, nada é gravado e este teste fica vermelho.
 */

const DAY = 'p-hoje';
const MARCOS = 'u-marcos';

const SESSION: Record<string, string> = {
  [TOKEN_STORAGE_KEY]: 'token-da-sessao',
};

function aDoc(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

/** Uma tela mínima: ela só grava o rascunho assim que sabe quem é a pessoa. */
function DraftProbe({ doc }: { doc: Record<string, unknown> }) {
  const { keepDraft, userId } = useOfflineNotes();

  useEffect(() => {
    if (userId === null) return;
    keepDraft(DAY, doc);
  }, [keepDraft, userId, doc]);

  return <span data-testid="who">{userId ?? ''}</span>;
}

async function settle(): Promise<void> {
  for (let step = 0; step < 10; step += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the offline notes wired the way production wires them', () => {
  it('⚠️ writes the draft into the IndexedDB of the BROWSER, with no store injected', async () => {
    const factory = new IDBFactory();
    vi.stubGlobal('indexedDB', factory);
    stubFetch(
      replyByUrl([['/me', meReply()]], {
        status: 500,
        body: { error: 'Internal Server Error' },
      }),
    );

    await act(async () => {
      renderPage(<DraftProbe doc={aDoc('o que eu escrevi')} />, {
        path: '/',
        storage: memoryStorage({ ...SESSION }),
        // ⚠️ NENHUM `store` — este é o ponto do teste.
      });
    });
    await settle();

    // A precondição pinada: sem o `/me`, o provider não sabe de quem é o texto
    // e não grava nada — e o teste passaria por engano (§7.4).
    expect(screen.getByTestId('who').textContent).toBe(MARCOS);

    // E o que foi gravado está no IndexedDB de verdade, na mesma base.
    const store = createIndexedDbPendingNoteStore(factory);
    expect((await store.byDay(MARCOS, DAY))?.doc).toEqual(
      aDoc('o que eu escrevi'),
    );
  });
});
