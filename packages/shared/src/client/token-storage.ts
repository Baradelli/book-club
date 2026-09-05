/**
 * O armazenamento do token da sessão.
 *
 * `StorageLike` existe para este arquivo NÃO citar o armazenamento do
 * navegador: `shared` é importado pelo backend, e um acesso a global de
 * navegador aqui quebraria o servidor no boot. O app injeta o real; o teste
 * injeta um mapa.
 */

/**
 * A chave gravada no navegador. Mudá-la desloga todo mundo na próxima
 * atualização — por isso ela é constante e tem teste pelo VALOR.
 */
export const TOKEN_STORAGE_KEY = 'clube.token';

/** O mínimo de armazenamento que precisamos. `window.localStorage` satisfaz. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface TokenStorage {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

/**
 * Todo acesso é protegido, e não por excesso de zelo: o Safari em aba privada
 * lança em `setItem`, e um navegador com armazenamento do site bloqueado lança
 * até em `getItem`. Sem o `try`, o app não ABRE — e abrir sem sessão salva é
 * muito melhor que uma tela branca.
 */
export function createTokenStorage(storage: StorageLike): TokenStorage {
  return {
    get() {
      try {
        return storage.getItem(TOKEN_STORAGE_KEY);
      } catch {
        return null;
      }
    },
    set(token) {
      try {
        storage.setItem(TOKEN_STORAGE_KEY, token);
      } catch {
        // No-op silencioso: a sessão vale só enquanto a aba estiver aberta.
      }
    },
    clear() {
      try {
        storage.removeItem(TOKEN_STORAGE_KEY);
      } catch {
        // Idem: não há o que fazer, e derrubar o logout seria pior.
      }
    },
  };
}
