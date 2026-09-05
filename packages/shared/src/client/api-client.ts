import type { ZodType } from 'zod';

import { errorSchema } from '../error';

/**
 * O cliente HTTP do projeto — uma FÁBRICA com dependências injetadas, nunca um
 * singleton que lê o ambiente.
 *
 * O motivo é duro: `@clube/shared` é dependência do `@clube/backend`, que roda
 * em Node. Um `import.meta.env.VITE_API_URL` aqui derrubaria o servidor no
 * boot. Quem lê o ambiente e passa o `window.localStorage` é o `packages/app`,
 * num arquivo só (`src/env.ts`).
 */

/** O `status` que marca "não chegou ao servidor". → regra 6 e decisão G. */
export const NETWORK_ERROR_STATUS = 0;

/**
 * O texto que fica no `error` quando o corpo não é o envelope da API (o HTML
 * de um proxy, um 502 de gateway). Nunca vai para a tela: quem traduz erro em
 * texto é o `apiErrorKey` + i18n.
 */
const UNEXPECTED_BODY = 'Unexpected response body';
const NETWORK_FAILURE = 'Network request failed';

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export interface ApiErrorParams {
  status: number;
  error: string;
  details?: ReadonlyArray<ApiErrorDetail>;
  /**
   * O erro ORIGINAL, quando existe um — hoje o `ZodError` de uma resposta que
   * não casa o `response` schema. Nunca vai para a tela; existe para o log
   * dizer QUAL campo quebrou em vez de "Unexpected response body".
   */
  cause?: unknown;
}

/**
 * O erro de TODA falha de request — inclusive a de rede, que é a mesma classe
 * com `status: 0`. Um caminho só de tratamento na tela.
 *
 * ⚠️ Nem `message` nem `error` vão para a interface: as mensagens do Zod são em
 * inglês e `error.message` só existe na classe 400
 * (`docs/CONVENCOES-CODIGO.md` §6.2). A tela usa `apiErrorKey`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly error: string;
  readonly details: ReadonlyArray<ApiErrorDetail> | undefined;

  constructor(params: ApiErrorParams) {
    super(
      `API error ${params.status}: ${params.error}`,
      ...('cause' in params ? [{ cause: params.cause }] : []),
    );
    this.name = 'ApiError';
    this.status = params.status;
    this.error = params.error;
    this.details = params.details;
  }

  /**
   * "Não chegou" × "chegou e foi recusado". A fila offline da Tarefa 21 precisa
   * da distinção para não reenviar o que o servidor já recusou.
   */
  get isNetworkError(): boolean {
    return this.status === NETWORK_ERROR_STATUS;
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue = string | number | boolean | undefined | null;

/**
 * O mínimo de `fetch` que usamos, declarado estruturalmente: o `fetch` global
 * satisfaz, e o teste passa um objeto de três campos em vez de um `Response`.
 */
export interface RequestInitLike {
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface ApiResponseLike {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: RequestInitLike,
) => Promise<ApiResponseLike>;

export interface ApiClientConfig {
  baseUrl: string;
  /**
   * Lido a CADA request, nunca uma vez na criação: o token entra depois do
   * login, com o cliente já montado. → regra 12.
   */
  getToken: () => string | null;
  /** Chamado só no 401. 403 e 404 NÃO deslogam. → regras 7, 8 e 9. */
  onUnauthorized: () => void;
  /** Injetável para teste; o padrão é o `fetch` do ambiente. */
  fetchImpl?: FetchLike;
}

export interface RequestOptions<TOut> {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, QueryValue>;
  /**
   * Obrigatório de propósito: toda rota da API declara um `response` schema em
   * `shared` (`docs/CONVENCOES-CODIGO.md` §6.1), e validar a resposta aqui é o
   * que dá tipo à tela sem um `as` sequer.
   */
  schema: ZodType<TOut>;
  signal?: AbortSignal;
}

export type CallOptions<TOut> = Omit<RequestOptions<TOut>, 'schema' | 'body'>;

export interface ApiClient {
  request<TOut>(path: string, options: RequestOptions<TOut>): Promise<TOut>;
  get<TOut>(
    path: string,
    schema: ZodType<TOut>,
    options?: CallOptions<TOut>,
  ): Promise<TOut>;
  post<TOut>(
    path: string,
    body: unknown,
    schema: ZodType<TOut>,
    options?: CallOptions<TOut>,
  ): Promise<TOut>;
  patch<TOut>(
    path: string,
    body: unknown,
    schema: ZodType<TOut>,
    options?: CallOptions<TOut>,
  ): Promise<TOut>;
  delete<TOut>(
    path: string,
    schema: ZodType<TOut>,
    options?: CallOptions<TOut>,
  ): Promise<TOut>;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query: Record<string, QueryValue> | undefined,
): string {
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    // `undefined`/`null` significam "não filtra" — mandar `?text=undefined`
    // faria a API buscar a string "undefined".
    if (value === undefined || value === null) continue;
    search.append(key, String(value));
  }

  const queryString = search.toString();
  return queryString === ''
    ? `${base}${suffix}`
    : `${base}${suffix}?${queryString}`;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // Um HTML de proxy não pode virar exceção de sintaxe no meio da tela.
    return undefined;
  }
}

function toApiError(status: number, body: unknown): ApiError {
  const parsed = errorSchema.safeParse(body);
  if (!parsed.success) return new ApiError({ status, error: UNEXPECTED_BODY });

  return new ApiError({
    status,
    error: parsed.data.error,
    ...(parsed.data.details ? { details: parsed.data.details } : {}),
  });
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  // Resolvido na CRIAÇÃO do cliente (que o app faz), não no escopo de módulo:
  // é o que mantém este arquivo importável pelo backend.
  const doFetch: FetchLike =
    config.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));

  async function request<TOut>(
    path: string,
    options: RequestOptions<TOut>,
  ): Promise<TOut> {
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = { Accept: 'application/json' };

    const token = config.getToken();
    if (token !== null && token !== '') {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const hasBody = options.body !== undefined;
    if (hasBody) headers['Content-Type'] = 'application/json';

    const init: RequestInitLike = {
      method,
      headers,
      ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    };

    let response: ApiResponseLike;
    let raw: string;
    try {
      response = await doFetch(
        buildUrl(config.baseUrl, path, options.query),
        init,
      );
      raw = await response.text();
    } catch {
      throw new ApiError({
        status: NETWORK_ERROR_STATUS,
        error: NETWORK_FAILURE,
      });
    }

    const body = safeJsonParse(raw);

    if (!response.ok) {
      const error = toApiError(response.status, body);
      // Só o 401 desloga. O 404 é o corte de tenant do projeto inteiro
      // (CONVENCOES §6.5) e o 403 é o "não é o autor" da Tarefa 09.
      if (response.status === 401) config.onUnauthorized();
      throw error;
    }

    const parsed = options.schema.safeParse(body);
    if (!parsed.success) {
      // Resposta fora do contrato é defeito de versão, não sessão morta: vira
      // ApiError como qualquer outra falha, para a tela ter um caminho só.
      //
      // O `cause` guarda o `ZodError`, que é o único que sabe QUAL campo
      // quebrou. Sem ele, diagnosticar "o servidor mudou o contrato" em
      // produção era caçar no escuro.
      throw new ApiError({
        status: response.status,
        error: UNEXPECTED_BODY,
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  return {
    request,
    get: (path, schema, options) => request(path, { ...options, schema }),
    post: (path, body, schema, options) =>
      request(path, { ...options, method: 'POST', body, schema }),
    patch: (path, body, schema, options) =>
      request(path, { ...options, method: 'PATCH', body, schema }),
    delete: (path, schema, options) =>
      request(path, { ...options, method: 'DELETE', schema }),
  };
}
