import type { StorageLike } from '@clube/shared/client';

/**
 * **O ÚNICO arquivo do projeto que lê o ambiente do navegador.**
 *
 * `packages/shared` é dependência do `@clube/backend`, que roda em Node: um
 * `import.meta.env` ou um `window.localStorage` lá quebraria o servidor no
 * boot. Então `shared` só oferece fábricas com dependência injetada, e a
 * composição — ler a variável, passar o armazenamento real — acontece aqui.
 *
 * Se você precisar de `import.meta.env` ou de um global de navegador em outro
 * lugar, exporte-o daqui em vez de espalhar a leitura.
 */

/**
 * Fallback relativo: em produção o app e a API ficam atrás do mesmo domínio.
 *
 * ⚠️ Exportado porque o `navigateFallbackDenylist` do `vite.config.ts` é ESTA
 * MESMA decisão escrita num segundo lugar: um SW que devolve `index.html` para
 * um `GET /api/...` é o bug clássico de PWA, e o front receberia HTML onde
 * espera JSON. Mudar o prefixo aqui sem mudar a denylist reintroduz o bug em
 * silêncio — há teste (`__tests__/service-worker-config.test.ts`).
 */
export const DEFAULT_API_URL = '/api';

export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;

/**
 * Armazenamento em memória para quando não há navegador (SSR de teste) ou o
 * navegador recusa o acesso. `createTokenStorage` já protege cada operação;
 * este fallback existe para o próprio ACESSO a `window.localStorage`, que
 * lança em navegador com armazenamento do site bloqueado.
 */
function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function resolveBrowserStorage(): StorageLike {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Navegador com armazenamento bloqueado: o app abre, só não lembra nada.
  }
  return memoryStorage();
}

export const browserStorage: StorageLike = resolveBrowserStorage();
