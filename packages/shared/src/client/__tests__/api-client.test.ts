import { describe, expect, it } from 'vitest';
import { z, ZodError } from 'zod';

import {
  ApiError,
  type ApiResponseLike,
  createApiClient,
  type FetchLike,
  NETWORK_ERROR_STATUS,
  type RequestInitLike,
} from '../api-client';
import { apiErrorKey } from '../api-error-key';

/**
 * Fixture de objeto é factory, nunca `const` de describe
 * (`docs/CONVENCOES-CODIGO.md` §7.7): cada teste monta o seu.
 */
interface RecordedRequest {
  url: string;
  init: RequestInitLike;
}

interface FetchSpy {
  fetch: FetchLike;
  calls: RecordedRequest[];
}

function jsonResponse(status: number, body: unknown): ApiResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function textResponse(status: number, body: string): ApiResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  };
}

/** Um fetch falso que grava a chamada e devolve sempre a mesma resposta. */
function respondingWith(response: ApiResponseLike): FetchSpy {
  const calls: RecordedRequest[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(response);
    },
  };
}

/** Um fetch falso que rejeita — é o `TypeError: Failed to fetch` do navegador. */
function failingWith(cause: Error): FetchSpy {
  const calls: RecordedRequest[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      return Promise.reject(cause);
    },
  };
}

/**
 * `noUncheckedIndexedAccess` está ligado: `calls[0]` é `T | undefined`. Este
 * helper falha alto em vez de espalhar `!` pelos testes.
 */
function onlyCall(calls: RecordedRequest[]): RecordedRequest {
  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (!call) throw new Error('unreachable: length was asserted above');
  return call;
}

interface UnauthorizedSpy {
  onUnauthorized: () => void;
  count: () => number;
}

/**
 * Contador de chamadas, nunca cronômetro (§7.3) — e o lado positivo é
 * asserido junto com o `0`, senão um incremento apagado passa despercebido.
 */
function unauthorizedSpy(): UnauthorizedSpy {
  let calls = 0;
  return {
    onUnauthorized: () => {
      calls += 1;
    },
    count: () => calls,
  };
}

const okSchema = z.object({ id: z.string(), name: z.string() });

describe('createApiClient', () => {
  it('sends the token as a Bearer header when there is one (rule 2)', async () => {
    const spy = respondingWith(jsonResponse(200, { id: 'u1', name: 'Maria' }));
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => 'token-abc',
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    await client.get('/me', okSchema);

    expect(onlyCall(spy.calls).init.headers['Authorization']).toBe(
      'Bearer token-abc',
    );
  });

  it('omits the Authorization header when there is no token (rule 2)', async () => {
    const spy = respondingWith(jsonResponse(200, { id: 'u1', name: 'Maria' }));
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => null,
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    await client.get('/me', okSchema);

    // `toBeUndefined` passaria com o header presente e vazio: a asserção é
    // sobre a AUSÊNCIA da chave.
    expect(Object.keys(onlyCall(spy.calls).init.headers)).not.toContain(
      'Authorization',
    );
  });

  it('treats an empty token as no token at all (rule 2)', async () => {
    const spy = respondingWith(jsonResponse(200, { id: 'u1', name: 'Maria' }));
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      // Um `''` gravado por uma versão antiga, ou por um login que falhou no
      // meio: `Authorization: Bearer ` é um header sintaticamente válido e
      // semanticamente vazio, e a API responderia 401 em vez do 200 público.
      getToken: () => '',
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    await client.get('/me', okSchema);

    expect(Object.keys(onlyCall(spy.calls).init.headers)).not.toContain(
      'Authorization',
    );
  });

  it('reads the token on every request, not once at creation (rule 12)', async () => {
    const spy = respondingWith(jsonResponse(200, { id: 'u1', name: 'Maria' }));
    let token: string | null = null;
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => token,
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    await client.get('/me', okSchema);
    token = 'token-depois-do-login';
    await client.get('/me', okSchema);

    expect(spy.calls.map((call) => call.init.headers['Authorization'])).toEqual(
      [undefined, 'Bearer token-depois-do-login'],
    );
  });

  it('returns the parsed body on 2xx (rule 3)', async () => {
    const spy = respondingWith(jsonResponse(200, { id: 'u1', name: 'Maria' }));
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => null,
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    // Asserção exata no resultado, não `toContain`.
    await expect(client.get('/me', okSchema)).resolves.toEqual({
      id: 'u1',
      name: 'Maria',
    });
  });

  it('builds the URL joining baseUrl, path and query', async () => {
    const spy = respondingWith(jsonResponse(200, { id: 'u1', name: 'Maria' }));
    const client = createApiClient({
      // Barra final de propósito: o join não pode produzir `//notes`.
      baseUrl: 'https://api.exemplo.com/',
      getToken: () => null,
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    await client.get('/notes', okSchema, {
      query: { bookId: 'b1', text: 'coração', includeArchived: undefined },
    });

    expect(onlyCall(spy.calls).url).toBe(
      'https://api.exemplo.com/notes?bookId=b1&text=cora%C3%A7%C3%A3o',
    );
  });

  it('sends the body as JSON with the content type', async () => {
    const spy = respondingWith(jsonResponse(201, { id: 'n1', name: 'Nota' }));
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => null,
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    await client.post('/notes', { title: 'Dia 1' }, okSchema);

    const call = onlyCall(spy.calls);
    expect(call.init.method).toBe('POST');
    expect(call.init.headers['Content-Type']).toBe('application/json');
    expect(call.init.body).toBe(JSON.stringify({ title: 'Dia 1' }));
  });

  it('turns an API error body into ApiError with status, error and details (rule 4)', async () => {
    const spy = respondingWith(
      jsonResponse(400, {
        error: 'Bad Request',
        details: [{ path: 'planItems.0.date', message: 'Invalid date' }],
      }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => null,
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    const error = await client.get('/books', okSchema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) throw new Error('unreachable');
    expect(error.status).toBe(400);
    expect(error.error).toBe('Bad Request');
    expect(error.details).toEqual([
      { path: 'planItems.0.date', message: 'Invalid date' },
    ]);
  });

  it('drops the WHOLE envelope when the details are not in the errorSchema shape (rule 4)', async () => {
    const spy = respondingWith(
      jsonResponse(400, { error: 'Bad Request', details: 'quase' }),
    );
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => null,
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    const error = await client.get('/books', okSchema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) throw new Error('unreachable');
    expect(error.status).toBe(400);
    expect(error.details).toBeUndefined();
    // O nome antigo deste teste prometia que só o `details` caía. MEDIDO: o
    // `errorSchema.safeParse` é tudo-ou-nada, então o `error: 'Bad Request'`
    // que veio no corpo cai JUNTO. Não é defeito — a tela nunca renderiza
    // `error` —, mas o nome mentia sobre o que estava provado.
    expect(error.error).toBe('Unexpected response body');
  });

  it('turns a non-JSON error body into a generic ApiError instead of throwing on JSON.parse (rule 5)', async () => {
    const spy = respondingWith(
      textResponse(502, '<html><body>Bad Gateway</body></html>'),
    );
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => null,
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    const error = await client.get('/me', okSchema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) throw new Error('unreachable');
    expect(error.status).toBe(502);
    expect(error.details).toBeUndefined();
    // O HTML do proxy não pode virar o texto do erro: a tela nunca renderiza
    // `error`, mas o log também não precisa da página inteira.
    expect(error.error).not.toContain('<html>');
  });

  it('turns a non-JSON body on a 200 into an ApiError instead of throwing on JSON.parse (rule 5)', async () => {
    // O cenário é concreto e mora nesta fatia: o `navigateFallback` do service
    // worker devolvendo `index.html` para uma chamada de API. O status é 200,
    // o corpo é HTML, e um `JSON.parse` desprotegido no ramo de SUCESSO
    // estouraria um `SyntaxError` cru dentro da tela — que nenhum
    // `catch (ApiError)` das telas 15+ pegaria.
    const spy = respondingWith(
      textResponse(200, '<!doctype html><html><body>app</body></html>'),
    );
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => null,
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    const error = await client.get('/me', okSchema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) throw new Error('unreachable');
    expect(error.status).toBe(200);
    // E o caminho até a tela: um 2xx sem entrada no mapa de status vira a
    // chave genérica, nunca texto em inglês.
    expect(apiErrorKey(error)).toBe('errors.unknown');
  });

  it('keeps the contract failure as the cause of the ApiError', async () => {
    const spy = respondingWith(jsonResponse(200, { id: 'u1' }));
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => null,
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    const error = await client.get('/me', okSchema).catch((e: unknown) => e);

    if (!(error instanceof ApiError)) throw new Error('expected an ApiError');
    // Sem o `cause`, o `ZodError` — o único que sabe QUAL campo quebrou — era
    // descartado, e diagnosticar "o servidor mudou o contrato" em produção
    // virava caça no escuro. A tela continua sem vê-lo: é para o log.
    expect(error.cause).toBeInstanceOf(ZodError);
    const cause = error.cause;
    if (!(cause instanceof ZodError)) throw new Error('unreachable');
    expect(cause.issues.map((issue) => issue.path.join('.'))).toEqual(['name']);
  });

  it('turns a network failure into ApiError with status 0 (rule 6)', async () => {
    const spy = failingWith(new TypeError('Failed to fetch'));
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => null,
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    const error = await client.get('/me', okSchema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) throw new Error('unreachable');
    // É o que a Tarefa 21 usa para decidir reenviar: "não chegou" tem de ser
    // distinguível de "chegou e foi recusado".
    expect(error.status).toBe(NETWORK_ERROR_STATUS);
    expect(NETWORK_ERROR_STATUS).toBe(0);
    expect(error.isNetworkError).toBe(true);
  });

  it('does not report a server error as a network failure (rule 6)', async () => {
    const spy = respondingWith(jsonResponse(500, { error: 'Internal' }));
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => null,
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    const error = await client.get('/me', okSchema).catch((e: unknown) => e);

    if (!(error instanceof ApiError)) throw new Error('expected an ApiError');
    expect(error.isNetworkError).toBe(false);
  });

  it('calls onUnauthorized exactly once on 401 and still throws (rule 7)', async () => {
    const spy = respondingWith(jsonResponse(401, { error: 'Unauthorized' }));
    const unauthorized = unauthorizedSpy();
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => 'token-vencido',
      onUnauthorized: unauthorized.onUnauthorized,
      fetchImpl: spy.fetch,
    });

    const error = await client.get('/me', okSchema).catch((e: unknown) => e);

    expect(unauthorized.count()).toBe(1);
    if (!(error instanceof ApiError)) throw new Error('expected an ApiError');
    expect(error.status).toBe(401);
  });

  it('does NOT sign out on 404 — it is the tenant cut, not a dead session (rule 8)', async () => {
    const spy = respondingWith(jsonResponse(404, { error: 'Not found' }));
    const unauthorized = unauthorizedSpy();
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => 'token-valido',
      onUnauthorized: unauthorized.onUnauthorized,
      fetchImpl: spy.fetch,
    });

    const error = await client
      .get('/clubs/de-outro/books', okSchema)
      .catch((e: unknown) => e);

    // Sem membership a API responde 404 (CONVENCOES §6.5). Deslogar aqui
    // tiraria da conta um membro legítimo que errou de clube.
    expect(unauthorized.count()).toBe(0);
    if (!(error instanceof ApiError)) throw new Error('expected an ApiError');
    expect(error.status).toBe(404);
  });

  it('does NOT sign out on 403 (rule 9)', async () => {
    const spy = respondingWith(jsonResponse(403, { error: 'Forbidden' }));
    const unauthorized = unauthorizedSpy();
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => 'token-valido',
      onUnauthorized: unauthorized.onUnauthorized,
      fetchImpl: spy.fetch,
    });

    const error = await client
      .patch('/notes/n1', { title: 'x' }, okSchema)
      .catch((e: unknown) => e);

    expect(unauthorized.count()).toBe(0);
    if (!(error instanceof ApiError)) throw new Error('expected an ApiError');
    expect(error.status).toBe(403);
  });

  it('turns a success body that does not match the schema into an ApiError', async () => {
    const spy = respondingWith(jsonResponse(200, { id: 'u1' }));
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => null,
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    const error = await client.get('/me', okSchema).catch((e: unknown) => e);

    // Um corpo que não casa o schema é defeito de versão, não sessão morta:
    // vira ApiError como qualquer outro, para a tela ter um caminho só.
    expect(error).toBeInstanceOf(ApiError);
    if (!(error instanceof ApiError)) throw new Error('unreachable');
    expect(error.status).toBe(200);
  });

  it('sends DELETE without a body', async () => {
    const spy = respondingWith(jsonResponse(200, { id: 'n1', name: 'Nota' }));
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => null,
      onUnauthorized: () => undefined,
      fetchImpl: spy.fetch,
    });

    await client.delete('/notes/n1', okSchema);

    const call = onlyCall(spy.calls);
    expect(call.init.method).toBe('DELETE');
    expect(call.init.body).toBeUndefined();
    expect(Object.keys(call.init.headers)).not.toContain('Content-Type');
  });
});
