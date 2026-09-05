import { type StorageLike, TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { act, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import { AuthProvider } from '../auth/auth-context';
import { ActiveClubProvider } from '../club/active-club';
import { createI18n } from '../i18n';

/**
 * A DECISÃO B da Tarefa 12, que não tinha guarda nenhuma.
 *
 * O `useSessionRefresh` renova o token no boot e engole a falha
 * (`.catch(() => undefined)`). O comportamento está CERTO — falha de rede não
 * desloga; só o 401, e por dentro do `onUnauthorized` do cliente —, mas nada o
 * protegia: o mutante `.catch(() => { signOut(); })` sobrevivia à suíte
 * inteira, e derruba a sessão de 15 dias de quem abriu o app no metrô.
 *
 * Este arquivo é o teste de fumaça do shell: os rótulos vêm do catálogo, a
 * falha de rede NÃO limpa o token, e o 401 limpa.
 */

/** Fixture é factory (§7.7). */
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

function respondWith(status: number, body: unknown): void {
  vi.stubGlobal('fetch', () =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(body)),
    }),
  );
}

/** O `TypeError: Failed to fetch` do navegador sem rede. */
function failWithNetworkError(): void {
  vi.stubGlobal('fetch', () =>
    Promise.reject(new TypeError('Failed to fetch')),
  );
}

async function renderApp(storage: StorageLike): Promise<void> {
  await act(async () => {
    render(
      // O idioma é PINADO em `pt`: o `navigator.language` do jsdom é `en-US`,
      // e sem isto as asserções de texto mudariam com o ambiente.
      <I18nextProvider
        i18n={createI18n(memoryStorage({ 'clube.locale': 'pt' }))}
      >
        <AuthProvider storage={storage} baseUrl="https://api.teste">
          {/*
            O cabeçalho do shell ganhou o seletor de clube ativo (Tarefa 16), e
            ele lê o `useActiveClub` — então o provider entra aqui, como no
            `main.tsx`: dentro do `AuthProvider` (usa o cliente HTTP e o
            `isAuthenticated`) e acima do roteador (o cabeçalho não é rota).
          */}
          <ActiveClubProvider storage={storage}>
            <MemoryRouter initialEntries={['/']}>
              <App />
            </MemoryRouter>
          </ActiveClubProvider>
        </AuthProvider>
      </I18nextProvider>,
    );
    // Deixa o `/auth/refresh` do boot resolver antes das asserções.
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('takes every label of the shell from the catalog, never from loose text', async () => {
    respondWith(200, { token: 'token-renovado' });

    await renderApp(memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }));

    // `CLAUDE.md`: nenhum texto solto na tela. Se alguém escrever a string
    // direto no JSX, a chave some do catálogo e ninguém percebe.
    // `queryBy*` + `not.toBeNull` e nao `getBy*` + `toBeDefined` (§7.4): o
    // `getBy*` LANCA quando nao acha, entao o `toBeDefined` nao assertava
    // nada — o teste dizia so "a query nao explodiu".
    expect(screen.queryByText('Clube do Livro')).not.toBeNull();
    expect(screen.queryByText('Idioma')).not.toBeNull();
    expect(screen.queryByText('Tema')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeNull();
  });

  it('hides the sign-out button when there is no session', async () => {
    respondWith(200, { token: 'token-renovado' });

    await renderApp(memoryStorage());

    expect(screen.queryByRole('button', { name: 'Sair' })).toBeNull();
  });

  it('slides the session forward when the refresh succeeds (decision B)', async () => {
    respondWith(200, { token: 'token-renovado' });
    const storage = memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' });

    await renderApp(storage);

    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('token-renovado');
  });

  it('does NOT sign out when the refresh fails for lack of network (decision B)', async () => {
    failWithNetworkError();
    const storage = memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' });

    await renderApp(storage);

    // O token vale 15 dias. Quem abriu o app no metrô tem de continuar dentro
    // — "melhorar" este `catch` para deslogar é a regressão que este teste
    // existe para impedir.
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('token-da-sessao');
    expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeNull();
  });

  it('DOES sign out when the refresh comes back 401 (decision B)', async () => {
    respondWith(401, { error: 'Unauthorized' });
    const storage = memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-vencido' });

    await renderApp(storage);

    // A outra metade, e é ela que faz a de cima não ser "nunca desloga": a
    // sessão morta sai, pelo `onUnauthorized` do cliente.
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sair' })).toBeNull();
  });
});
