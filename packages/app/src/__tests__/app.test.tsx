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

/**
 * Um servidor com UM clube, para o `ClubPicker` ter o que nomear.
 *
 * ⚠️ O `respondWith` acima responde a MESMA coisa a todo endereço, e é fiel o
 * bastante para os testes de sessão — mas com ele o `/me` devolve
 * `{ token: … }`, o `activeClub` fica `null` e o cabeçalho não escreve nome de
 * clube nenhum. Quem mede o nome precisa de um `/me` de verdade.
 */
function respondWithOneClub(): void {
  vi.stubGlobal('fetch', (url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify(
            url.includes('/me')
              ? {
                  id: 'u-marcos',
                  email: 'marcos@clube.test',
                  name: 'Marcos',
                  isSuperAdmin: false,
                  clubs: [
                    { id: 'c-casal', name: 'Clube do Casal', role: 'OWNER' },
                  ],
                }
              : { token: 'token-renovado' },
          ),
        ),
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
      // ⚠️ Até a Tarefa 38d o idioma era PINADO aqui (o `navigator.language`
      // do jsdom é `en-US`, e sem o pino as asserções de texto mudavam com o
      // ambiente). Com um catálogo só não há o que pinar.
      <I18nextProvider i18n={createI18n()}>
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
    expect(screen.queryByText('Tema')).not.toBeNull();
    // ⚠️ "Idioma" saiu da lista na Tarefa 38d: o seletor de idioma não existe
    // mais, e a chave `language.*` saiu do catálogo junto com ele.
    expect(screen.queryByText('Idioma')).toBeNull();
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

/**
 * ⚠️ **O CABEÇALHO DO CANVAS — a decisão H da Tarefa 42, e ela é MEDIDA.**
 *
 * As duas alturas, conferidas artboard a artboard nos 21 arquivos do canvas
 * (`grep -n '<header' *.html`):
 *
 * | largura | altura | recuo | papel | filete | artboards |
 * | --- | --- | --- | --- | --- | --- |
 * | celular | **52px** | `0 20px` | `--surface` | `1px --border` | **16**, entre eles `Inicio.dc.html:26` |
 * | ≥1120px | **56px** | `0 40px` | `--surface` | `1px --border` | **5**: `InicioDesktop.dc.html:21`, `DiaDesktop:21`, `LivroDesktop:21`, `NovaAnotacaoDesktop:23`, `NovoGrifoDesktop:23` |
 *
 * ⚠️ **A SPEC CITAVA `Inicio.dc.html:32` E `InicioDesktop.dc.html:32` PARA OS
 * DOIS, E AS DUAS LINHAS ESTÃO ERRADAS** — a 32 do `Inicio` é o `<main>` e a do
 * `InicioDesktop` é o `</div>` do grupo da direita — o `</header>` está na
 * :33. ⚠️ **E esta linha estava errada na PRIMEIRA correção desta fatia**, que
 * é o mesmo defeito uma camada acima: conferir a spec de cabeça em vez de ler
 * a linha. Os NÚMEROS (52 e 56) estão certos; as
 * coordenadas não. Corrigido aqui contando o `<header>` de cada arquivo, que é
 * a única forma de a próxima fatia reconferir sem adivinhar.
 *
 * ⚠️ **E ELAS SÃO UNÂNIMES DENTRO DE CADA CLASSE — 16 e 5, e não "os
 * artboards"**: é a classe de erro nº 1 deste bloco (generalização de
 * amostra), e por isso o número está escrito.
 *
 * O que se assere é a CLASSE, e não o pixel: o jsdom não tem layout, então
 * "tem 52px de altura" não é medível aqui — é a mesma escolha, com a mesma
 * razão, do `chrome.test.tsx` para as larguras.
 */
describe('the header of the canvas (decision H)', () => {
  function headerOf(container: HTMLElement): HTMLElement {
    const header = container.querySelector('header');
    // Sem esta precondição as asserções abaixo seriam vazias (§7.4): um
    // `querySelector` que não acha devolve `null`, e `null?.className` é
    // `undefined` — que não contém classe nenhuma e passaria em todo `not`.
    if (header === null) throw new Error('o shell não tem `<header>`');
    return header;
  }

  it('is 52px tall on the phone and 56px above the 1120px cut', async () => {
    respondWith(200, { token: 'token-renovado' });
    await renderApp(memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }));

    const className = headerOf(document.body).className;

    // `h-13` = 52px e `h-14` = 56px (passo de 4px do Tailwind).
    expect(className).toContain('h-13');
    expect(className).toContain('min-[1120px]:h-14');
    // Recuo: 20px no celular, 40px acima do corte.
    expect(className).toContain('px-5');
    expect(className).toContain('min-[1120px]:px-10');
  });

  it('paints the header with the CARD colour, not the page colour', async () => {
    respondWith(200, { token: 'token-renovado' });
    await renderApp(memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }));

    const className = headerOf(document.body).className;

    /*
      ⚠️ O canvas dá ao cabeçalho `background:var(--surface)` enquanto a página
      é `--bg` — são DUAS superfícies, e é exatamente por isso que a regra 9
      desta fatia manda ler o `theme-tokens.test.ts` antes de mexer. Ele mede o
      `<div>` de `min-h-dvh` (a PÁGINA), não este elemento: as duas guardas
      falam de elementos diferentes e nenhuma precisou afrouxar.
    */
    expect(className).toContain('bg-surface');
    expect(className).not.toContain('bg-canvas');
    // O filete hairline embaixo, nunca sombra: o desenho é caderno.
    expect(className).toContain('border-b');
    expect(className).toContain('border-line');
  });

  /**
   * ⚠️ **A DIVERGÊNCIA DO NOME DO CLUBE ESTAVA MEDIDA E CERTA — E SEM GUARDA.**
   *
   * O canvas desenha o nome do clube só nos cinco artboards de 1280px
   * (`InicioDesktop.dc.html:24`), e esta fatia decidiu mantê-lo visível também
   * no celular: é o ÚNICO lugar em que o clube é nomeado lá (o `ClubPicker` só
   * vira `<select>` com 2+ clubes).
   *
   * Medido na auditoria: **esconder o nome com `hidden min-[1120px]:block`
   * passava por 886 testes**. O jsdom não aplica CSS, então
   * `home.test.tsx › shows the club name in the header even with a single club
   * (decision F)` fica **verde** com o nome apagado na tela — a guarda que
   * existe para isto é cega justamente para a forma mais provável de o defeito
   * entrar.
   *
   * A propriedade testável é a CLASSE: um utilitário de visibilidade no
   * elemento que carrega o nome é o que faria a próxima fatia escondê-lo sem
   * querer.
   */
  it('⚠️ keeps the club name VISIBLE on the phone, against the canvas and on purpose', async () => {
    respondWithOneClub();
    await renderApp(memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }));

    const name = screen.queryByText('Clube do Casal');
    // Sem esta precondição a asserção abaixo é vazia (§7.4): um `null` não tem
    // classe nenhuma, e "não contém `hidden`" passaria com o nome ausente.
    expect(name).not.toBeNull();

    for (const utility of ['hidden', 'invisible', 'sr-only', 'opacity-0']) {
      expect(name?.className.split(/\s+/u)).not.toContain(utility);
    }
  });

  it('writes the name of the app in the reading serif (Fraunces 16/600)', async () => {
    respondWith(200, { token: 'token-renovado' });
    await renderApp(memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }));

    // `Inicio.dc.html:27`: `font-family:Fraunces;font-size:16px;font-weight:600`.
    const name = screen.queryByText('Clube do Livro');
    expect(name).not.toBeNull();
    expect(name?.className).toContain('font-reading');
    expect(name?.className).toContain('font-semibold');
  });
});
