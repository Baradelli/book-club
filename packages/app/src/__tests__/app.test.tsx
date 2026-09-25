import { type StorageLike, TOKEN_STORAGE_KEY } from '@clube/shared/client';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
 *
 * ⚠️ **REPAGINAÇÃO VISUAL — decisão do dono de 2026-09-24.** O cabeçalho
 * deixou de ter os ícones de preferências e de sair: hoje ele tem o VOLTAR
 * (fora das telas-raiz), o nome do app, o `ClubPicker`, o foguinho da
 * corrente, o botão sol/lua e o ☰ que abre o MENU LATERAL — um `<dialog
 * class="app-drawer">` com Início, Buscar, Preferências e o "Sair". E sair
 * passou a PEDIR CONFIRMAÇÃO (uma gaveta "Sair da sua conta?"). Os testes de
 * sessão abaixo continuam medindo a mesma decisão B; o que mudou é ONDE o
 * "Sair" mora — então eles abrem o menu para achá-lo.
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

async function renderApp(storage: StorageLike, path = '/'): Promise<void> {
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
            <MemoryRouter initialEntries={[path]}>
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

/**
 * O jsdom não implementa `showModal`/`close` do `<dialog>` — e o `Sidebar`
 * se protege disso (sem eles o menu só não abre). Para medir o menu aberto, o
 * par é plantado aqui com o comportamento que importa: `open` liga e desliga,
 * e o `close` dispara o evento que o `Sidebar` escuta.
 */
const dialogProto = HTMLDialogElement.prototype as {
  showModal?: () => void;
  close?: () => void;
};
const nativeShowModal = dialogProto.showModal;
const nativeClose = dialogProto.close;

beforeEach(() => {
  dialogProto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  dialogProto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  dialogProto.showModal = nativeShowModal;
  dialogProto.close = nativeClose;
});

/** O cabeçalho do shell — as consultas do cabeçalho ficam DENTRO dele. */
function header(): HTMLElement {
  const found = document.querySelector('header');
  // Sem esta precondição as asserções seriam vazias (§7.4).
  if (found === null) throw new Error('o shell não tem `<header>`');
  return found;
}

/** O menu lateral — o `<dialog class="app-drawer">`. */
function drawer(): HTMLDialogElement {
  const found = document.querySelector('dialog.app-drawer');
  if (!(found instanceof HTMLDialogElement)) {
    throw new Error('o shell não tem o `<dialog class="app-drawer">`');
  }
  return found;
}

/** Toca o ☰ do cabeçalho e devolve o menu aberto. */
async function openMenu(): Promise<HTMLDialogElement> {
  await act(async () => {
    fireEvent.click(
      within(header()).getByRole('button', { name: 'Abrir o menu' }),
    );
    await Promise.resolve();
  });
  expect(drawer().open).toBe(true);
  return drawer();
}

describe('App', () => {
  it('takes every label of the shell from the catalog, never from loose text', async () => {
    respondWith(200, { token: 'token-renovado' });

    await renderApp(memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }));

    // `CLAUDE.md`: nenhum texto solto na tela. Se alguém escrever a string
    // direto no JSX, a chave some do catálogo e ninguém percebe.
    // `queryBy*` + `not.toBeNull` e nao `getBy*` + `toBeDefined` (§7.4): o
    // `getBy*` LANCA quando nao acha, entao o `toBeDefined` nao assertava
    // nada — o teste dizia so "a query nao explodiu".
    expect(within(header()).queryByText('Clube do Livro')).not.toBeNull();
    // O tema é um botão sol/lua: sem `matchMedia` no jsdom o sistema é claro,
    // então o botão oferece o escuro.
    expect(
      screen.queryByRole('button', { name: 'Mudar para o tema escuro' }),
    ).not.toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Tema' })).toBeNull();
    // ⚠️ "Idioma" saiu da lista na Tarefa 38d: o seletor de idioma não existe
    // mais, e a chave `language.*` saiu do catálogo junto com ele.
    expect(screen.queryByText('Idioma')).toBeNull();
    expect(
      within(header()).queryByRole('button', { name: 'Abrir o menu' }),
    ).not.toBeNull();

    // O menu: as três entradas e o "Sair", todos do catálogo.
    const menu = await openMenu();
    expect(menu.getAttribute('aria-label')).toBe('Menu');
    for (const name of ['Início', 'Buscar', 'Preferências']) {
      expect(within(menu).queryByRole('link', { name })).not.toBeNull();
    }
    expect(within(menu).queryByRole('button', { name: 'Sair' })).not.toBeNull();
    expect(
      within(menu).queryByRole('button', { name: 'Fechar o menu' }),
    ).not.toBeNull();
  });

  it('keeps the old header icons OUT of the header — settings and sign-out live in the menu now', async () => {
    respondWith(200, { token: 'token-renovado' });
    await renderApp(memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }));

    // A repaginação tirou os dois ícones do cabeçalho; eles não podem voltar
    // em dobro com o menu.
    expect(
      within(header()).queryByRole('link', { name: 'Preferências' }),
    ).toBeNull();
    expect(within(header()).queryByRole('button', { name: 'Sair' })).toBeNull();
  });

  it('shows the back button on an inner page, and not on a root one', async () => {
    respondWith(200, { token: 'token-renovado' });
    await renderApp(memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }));
    // Início é tela-raiz: lá só o menu.
    expect(
      within(header()).queryByRole('button', { name: 'Voltar' }),
    ).toBeNull();

    cleanup();
    // Dentro de um livro: o voltar aparece.
    await renderApp(
      memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }),
      '/books/b-1',
    );
    expect(
      within(header()).queryByRole('button', { name: 'Voltar' }),
    ).not.toBeNull();
  });

  it('asks before signing out — Cancel keeps the session, Sair ends it', async () => {
    respondWith(200, { token: 'token-renovado' });
    const storage = memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' });
    await renderApp(storage);

    // Tocar "Sair" no menu NÃO sai: fecha o menu e abre a confirmação.
    let menu = await openMenu();
    await act(async () => {
      fireEvent.click(within(menu).getByRole('button', { name: 'Sair' }));
      await Promise.resolve();
    });
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('token-renovado');
    expect(drawer().open).toBe(false);
    let confirm = screen.getByRole('dialog', { name: 'Sair da sua conta?' });

    // "Cancelar" deixa a sessão onde estava.
    await act(async () => {
      // Dois 'Cancelar' na gaveta: o X do Sheet (closeLabel) e o botão escrito.
      // Qualquer um cancela; este é o escrito.
      const cancel = within(confirm)
        .getAllByRole('button', { name: 'Cancelar' })
        .find((button) => button.textContent === 'Cancelar');
      if (cancel === undefined) throw new Error('sem o botão Cancelar escrito');
      fireEvent.click(cancel);
      await Promise.resolve();
    });
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('token-renovado');

    // "Sair" na confirmação é que apaga a sessão.
    menu = await openMenu();
    await act(async () => {
      fireEvent.click(within(menu).getByRole('button', { name: 'Sair' }));
      await Promise.resolve();
    });
    confirm = screen.getByRole('dialog', { name: 'Sair da sua conta?' });
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Sair' }));
      await Promise.resolve();
    });
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(
      within(header()).queryByRole('button', { name: 'Abrir o menu' }),
    ).toBeNull();
  });

  it('toggles between dark and light with the sun/moon button, starting from the system', async () => {
    respondWith(200, { token: 'token-renovado' });
    await renderApp(memoryStorage());
    const root = document.documentElement;
    // Primeira visita: nada gravado, o sistema decide (sem atributo).
    expect(root.getAttribute('data-theme')).toBeNull();

    try {
      fireEvent.click(
        screen.getByRole('button', { name: 'Mudar para o tema escuro' }),
      );
      expect(root.getAttribute('data-theme')).toBe('dark');

      fireEvent.click(
        screen.getByRole('button', { name: 'Mudar para o tema claro' }),
      );
      expect(root.getAttribute('data-theme')).toBe('light');
    } finally {
      window.localStorage.removeItem('clube.theme');
      root.removeAttribute('data-theme');
    }
  });

  it('hides the menu — and the sign-out inside it — when there is no session', async () => {
    respondWith(200, { token: 'token-renovado' });

    await renderApp(memoryStorage());

    expect(
      within(header()).queryByRole('button', { name: 'Abrir o menu' }),
    ).toBeNull();
    expect(document.querySelector('dialog.app-drawer')).toBeNull();
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
    // Ainda dentro: o menu (e o "Sair" nele) continua lá.
    const menu = await openMenu();
    expect(within(menu).queryByRole('button', { name: 'Sair' })).not.toBeNull();
  });

  it('DOES sign out when the refresh comes back 401 (decision B)', async () => {
    respondWith(401, { error: 'Unauthorized' });
    const storage = memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-vencido' });

    await renderApp(storage);

    // A outra metade, e é ela que faz a de cima não ser "nunca desloga": a
    // sessão morta sai, pelo `onUnauthorized` do cliente.
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(
      within(header()).queryByRole('button', { name: 'Abrir o menu' }),
    ).toBeNull();
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
 *
 * ⚠️⚠️ **REPAGINAÇÃO VISUAL — decisão do dono de 2026-09-24: a tabela acima é
 * o REGISTRO do canvas, não o que está entregue.** O cabeçalho virou barra de
 * app de celular: **56px nos dois cortes** (`h-14`, na linha interna — o
 * `<header>` ganhou o recuo do entalhe, `pt-[env(safe-area-inset-top)]`),
 * recuo `pl-4 pr-2` no celular (o ☰ encosta na borda, como em app nativo) e
 * `px-10` acima do corte, e **fixo e translúcido**: `sticky top-0`, a cor da
 * PÁGINA a 80% com desfoque atrás (`bg-canvas/80 backdrop-blur-xl`) em vez do
 * papel de cartão, e o filete suave embaixo. O nome do app subiu para Fraunces
 * 19/600.
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

  it('is 56px tall on both sides of the 1120px cut (repaginação, 2026-09-24)', async () => {
    respondWith(200, { token: 'token-renovado' });
    await renderApp(memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }));

    const bar = headerOf(document.body).firstElementChild;
    if (bar === null) throw new Error('o `<header>` não tem a linha interna');
    const classes = bar.className.split(/\s+/u);

    // `h-14` = 56px (passo de 4px do Tailwind), sem variante: vale nos dois.
    expect(classes).toContain('h-14');
    expect(classes).not.toContain('h-13');
    // Recuo: o ☰ perto da borda no celular, 40px acima do corte.
    expect(classes).toContain('pl-4');
    expect(classes).toContain('pr-2');
    expect(classes).toContain('min-[1120px]:px-10');
    // E o entalhe do celular fica POR CIMA da linha, não dentro dela.
    expect(headerOf(document.body).className).toContain(
      'pt-[env(safe-area-inset-top)]',
    );
  });

  it('sticks the header to the top, translucent over the PAGE colour, with a soft fillet', async () => {
    respondWith(200, { token: 'token-renovado' });
    await renderApp(memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }));

    const classes = headerOf(document.body).className.split(/\s+/u);

    /*
      ⚠️ O canvas pintava o cabeçalho com `--surface` (papel de cartão); a
      repaginação o pinta com a cor da PÁGINA a 80% e desfoca o que rola por
      baixo — é o cabeçalho de app de celular. Continua sendo um elemento
      DIFERENTE do `<div>` de `min-h-dvh` que o `theme-tokens.test.ts` mede
      (a página tem UM fundo; este é outro elemento), então aquela guarda não
      precisou afrouxar.
    */
    expect(classes).toContain('sticky');
    expect(classes).toContain('top-0');
    expect(classes).toContain('bg-canvas/80');
    expect(classes).toContain('backdrop-blur-xl');
    expect(classes).not.toContain('bg-surface');
    // O filete hairline embaixo, nunca sombra.
    expect(classes).toContain('border-b');
    expect(classes).toContain('border-line-soft');
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

    // No cabeçalho — o menu lateral também escreve o nome, mas é o do
    // cabeçalho que está sempre à vista.
    const name = within(headerOf(document.body)).queryByText('Clube do Casal');
    // Sem esta precondição a asserção abaixo é vazia (§7.4): um `null` não tem
    // classe nenhuma, e "não contém `hidden`" passaria com o nome ausente.
    expect(name).not.toBeNull();

    for (const utility of ['hidden', 'invisible', 'sr-only', 'opacity-0']) {
      expect(name?.className.split(/\s+/u)).not.toContain(utility);
    }
  });

  it('writes the name of the app in the reading serif (Fraunces 19/600 since the repaginação)', async () => {
    respondWith(200, { token: 'token-renovado' });
    await renderApp(memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-da-sessao' }));

    // `Inicio.dc.html:27` desenhava Fraunces 16/600; a repaginação
    // (2026-09-24) subiu o corpo para 19px. A família e o peso ficaram.
    const name = within(headerOf(document.body)).queryByText('Clube do Livro');
    expect(name).not.toBeNull();
    expect(name?.className).toContain('font-reading');
    expect(name?.className).toContain('font-semibold');
  });
});
