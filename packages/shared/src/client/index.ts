// @clube/shared/client — cliente HTTP e armazenamento de token.
//
// ⚠️ Nada aqui pode ler global de navegador em escopo de módulo: este pacote é
// dependência do `@clube/backend`, que roda em Node. Tudo é fábrica com
// dependência injetada; quem lê o ambiente é `packages/app/src/env.ts`.
// → `src/__tests__/no-browser-globals.test.ts`.

export {
  type ApiClient,
  type ApiClientConfig,
  ApiError,
  type ApiErrorDetail,
  type ApiErrorParams,
  type ApiResponseLike,
  type CallOptions,
  createApiClient,
  type FetchLike,
  type HttpMethod,
  NETWORK_ERROR_STATUS,
  type QueryValue,
  type RequestInitLike,
  type RequestOptions,
} from './api-client';
export { API_ERROR_KEYS, apiErrorKey } from './api-error-key';
export {
  createTokenStorage,
  type StorageLike,
  TOKEN_STORAGE_KEY,
  type TokenStorage,
} from './token-storage';
