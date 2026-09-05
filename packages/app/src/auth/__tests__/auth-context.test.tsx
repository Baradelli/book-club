import { loginResponseSchema } from '@clube/shared';
import { type StorageLike, TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '../auth-context';

/**
 * A FIAÇÃO entre `AuthProvider` e `createApiClient` — e ela era cega.
 *
 * `createApiClient` tem 17 testes provando que manda o `Authorization` quando
 * o `getToken` devolve token. Nenhum deles olha para o `getToken` que o
 * Provider passa: o mutante `getToken: () => null` — um app que manda TODA
 * requisição sem autenticação — sobrevivia aos 31 testes do pacote.
 *
 * O mesmo para o `onUnauthorized: signOut`: trocar por um no-op deixa a pessoa
 * com um token morto no armazenamento e a tela em loop de 401.
 *
 * Este arquivo atravessa o Provider: storage fake, `fetch` espião, e as
 * asserções são sobre o header que saiu na rede e sobre o token que ficou
 * gravado.
 */

/** Fixture é factory (§7.7): cada teste ganha o seu armazenamento. */
function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
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

interface RecordedRequest {
  url: string;
  headers: Record<string, string>;
}

interface FetchSpy {
  calls: RecordedRequest[];
  install(status: number, body: unknown): void;
}

/**
 * O `AuthProvider` não recebe `fetchImpl` — ele monta o cliente sozinho, que é
 * exatamente a fiação sob teste. Então o espião entra pelo `fetch` global, o
 * mesmo caminho da produção.
 */
function fetchSpy(): FetchSpy {
  const calls: RecordedRequest[] = [];
  return {
    calls,
    install(status, body) {
      vi.stubGlobal(
        'fetch',
        (url: string, init: { headers: Record<string, string> }) => {
          calls.push({ url, headers: { ...init.headers } });
          return Promise.resolve({
            ok: status >= 200 && status < 300,
            status,
            text: () => Promise.resolve(JSON.stringify(body)),
          });
        },
      );
    },
  };
}

/** `noUncheckedIndexedAccess` está ligado: falha alto em vez de espalhar `!`. */
function callAt(calls: RecordedRequest[], index: number): RecordedRequest {
  const call = calls[index];
  if (!call) throw new Error(`expected a request at index ${index}`);
  return call;
}

/** Um schema qualquer de `shared`: o assunto aqui é o HEADER, não o corpo. */
const okSchema = loginResponseSchema;

/**
 * O consumidor: usa o `api` do contexto, e expõe o token e o `signIn` para o
 * teste poder medir o ANTES e o DEPOIS do login com o MESMO cliente.
 */
function ApiProbe() {
  const { api, signIn, isAuthenticated } = useAuth();

  return (
    <div>
      <span data-testid="authenticated">{isAuthenticated ? 'sim' : 'nao'}</span>
      <button
        data-testid="call"
        type="button"
        onClick={() => {
          void api.get('/me', okSchema).catch(() => undefined);
        }}
      >
        chamar
      </button>
      <button
        data-testid="signin"
        type="button"
        onClick={() => {
          signIn('token-do-login');
        }}
      >
        entrar
      </button>
    </div>
  );
}

/**
 * O consumidor do cliente PÚBLICO (Tarefa 15): é ele que login e aceite usam,
 * e a diferença dele está toda em coisas que não aparecem na tela — o header
 * que não sai e o `signOut` que não acontece.
 */
function PublicApiProbe() {
  const { publicApi, isAuthenticated } = useAuth();

  return (
    <div>
      <span data-testid="authenticated">{isAuthenticated ? 'sim' : 'nao'}</span>
      <button
        data-testid="call"
        type="button"
        onClick={() => {
          void publicApi
            .post('/auth/login', {}, okSchema)
            .catch(() => undefined);
        }}
      >
        chamar
      </button>
    </div>
  );
}

function renderProbe(
  storage: StorageLike,
  probe: ReactNode = <ApiProbe />,
): void {
  render(
    <AuthProvider storage={storage} baseUrl="https://api.teste">
      {probe}
    </AuthProvider>,
  );
}

async function click(testId: string): Promise<void> {
  await act(async () => {
    screen.getByTestId(testId).click();
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthProvider wires the token into the API client', () => {
  it('sends the stored token on the first request (rule 2, through the Provider)', async () => {
    const spy = fetchSpy();
    spy.install(200, { token: 'seja-o-que-for' });

    renderProbe(memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }));
    await click('call');

    // O mutante `getToken: () => null` é um app que manda TODA requisição sem
    // autenticação, e ele passava nos 31 testes anteriores.
    expect(callAt(spy.calls, 0).headers['Authorization']).toBe(
      'Bearer token-da-sessao',
    );
  });

  it('sends the NEW token right after signIn, on the same client (rule 12)', async () => {
    const spy = fetchSpy();
    spy.install(200, { token: 'seja-o-que-for' });

    renderProbe(memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }));
    await click('call');
    await click('signin');
    await click('call');

    // O `getToken` lê o ARMAZENAMENTO a cada request, não o estado do React —
    // senão o request disparado no mesmo tick do login veria o token antigo.
    expect(spy.calls.map((call) => call.headers['Authorization'])).toEqual([
      'Bearer token-da-sessao',
      'Bearer token-do-login',
    ]);
  });

  it('omits the header entirely when there is no session', async () => {
    const spy = fetchSpy();
    spy.install(200, { token: 'seja-o-que-for' });

    renderProbe(memoryStorage());
    await click('call');

    expect(Object.keys(callAt(spy.calls, 0).headers)).not.toContain(
      'Authorization',
    );
  });

  it('clears the stored token on a 401 (rules 7 and 10)', async () => {
    const spy = fetchSpy();
    spy.install(401, { error: 'Unauthorized' });
    const storage = memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-vencido' });

    renderProbe(storage);
    await click('call');

    // O `onUnauthorized: signOut` do Provider. Um no-op aqui deixa o token
    // morto gravado e a tela em loop de 401 na próxima abertura.
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId('authenticated').textContent).toBe('nao');
  });

  it('does NOT clear the stored token on a 404 (rule 8)', async () => {
    const spy = fetchSpy();
    spy.install(404, { error: 'Not found' });
    const storage = memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-valido' });

    renderProbe(storage);
    await click('call');

    // 404 é o corte de tenant do projeto inteiro (CONVENCOES §6.5): deslogar
    // aqui tiraria da conta um membro legítimo que errou de clube.
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('token-valido');
    expect(screen.getByTestId('authenticated').textContent).toBe('sim');
  });

  it('treats an empty token in storage as no session at all', async () => {
    const spy = fetchSpy();
    spy.install(200, { token: 'seja-o-que-for' });
    // Um `''` gravado por um login que morreu no meio. O cliente HTTP já o
    // tratava como "sem token" e omitia o header; o `isAuthenticated` dizia
    // que a pessoa estava logada. As duas leituras têm de concordar, senão o
    // app mostra a home e manda toda requisição sem autenticação.
    renderProbe(memoryStorage({ [TOKEN_STORAGE_KEY]: '' }));

    expect(screen.getByTestId('authenticated').textContent).toBe('nao');

    await click('call');
    expect(Object.keys(callAt(spy.calls, 0).headers)).not.toContain(
      'Authorization',
    );
  });
});

/**
 * O CLIENTE PÚBLICO (⚠️ 2 da Tarefa 15).
 *
 * `POST /auth/login` com senha errada responde 401, e o `onUnauthorized` do
 * cliente autenticado é o `signOut()`: errar a senha dispararia o caminho de
 * "a sessão morreu". As duas propriedades abaixo são invisíveis na tela — o
 * header que não sai e o armazenamento que não é limpo —, que é exatamente a
 * classe de coisa que quebra em silêncio.
 */
describe('AuthProvider also exposes a client for the PUBLIC endpoints', () => {
  it('does not clear the stored token when a public call gets a 401', async () => {
    const spy = fetchSpy();
    spy.install(401, { error: 'Unauthorized' });
    const storage = memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-de-antes' });

    renderProbe(storage, <PublicApiProbe />);
    await click('call');

    // O mutante é de UMA linha: `publicApi` recebendo o mesmo
    // `onUnauthorized: signOut` do `api`. Ele deixa a suíte inteira verde
    // menos aqui.
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('token-de-antes');
    expect(screen.getByTestId('authenticated').textContent).toBe('sim');
    // E a chamada realmente aconteceu: sem isto o teste passaria com um
    // `publicApi` que não faz nada (§7.4).
    expect(spy.calls).toHaveLength(1);
  });

  it('never sends the Authorization header on a public call', async () => {
    const spy = fetchSpy();
    spy.install(200, { token: 'seja-o-que-for' });

    renderProbe(
      memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }),
      <PublicApiProbe />,
    );
    await click('call');

    // `getToken: () => null` de propósito: nenhuma das duas rotas públicas lê
    // o `Authorization`, e mandar um token vencido junto do login só daria ao
    // servidor um header para ignorar.
    expect(Object.keys(callAt(spy.calls, 0).headers)).not.toContain(
      'Authorization',
    );
  });
});
