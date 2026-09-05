import type { StorageLike } from '@clube/shared/client';
import { pt } from '@clube/shared/locales';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import {
  MemoryRouter,
  parsePath,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActiveClubProvider } from '../../club/active-club';
import { createI18n } from '../../i18n';
import { alwaysReply, meReply, stubFetch } from '../../pages/__tests__/harness';
import { AppRoutes } from '../../router';
import { AuthProvider } from '../auth-context';
import {
  destinationFrom,
  internalPath,
  isFromLocationState,
  RequireAnonymous,
  RequireAuth,
} from '../require-auth';

/**
 * ⚠️ **ESTE ARQUIVO PASSOU A FAZER REQUISIÇÕES DE REDE, e não tinha `fetch`
 * espião.**
 *
 * MEDIDO: o `ActiveClubProvider` que o `renderAt` monta (ele entrou aqui quando
 * a home passou a existir de verdade, Tarefa 16) dispara
 * `GET https://api.teste/me` em **16** dos testes deste arquivo — os que têm
 * token. Nenhum deles stubava o `fetch`, então eram 16 requisições REAIS.
 *
 * Hoje elas rejeitam por DNS e o `.catch` do provider as absorve, o que é
 * exatamente por que ninguém notou. Mas o arquivo passou a depender do AMBIENTE
 * DE REDE: um resolvedor com curinga, um proxy corporativo ou um portal de
 * captura devolvem 200 com HTML — ou **penduram** —, e aí os testes ficam
 * lentos, intermitentes ou vermelhos por um motivo que não tem nada a ver com o
 * nome deles. E `.teste` **não** é TLD reservado: o reservado é `.test`
 * (RFC 2606).
 *
 * O `stubFetch` no `beforeEach` fecha a porta: nenhuma requisição sai da
 * máquina, e o `/me` responde o contrato real.
 */
beforeEach(() => {
  stubFetch(alwaysReply(meReply()));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

function withToken(token: string): StorageLike {
  return memoryStorage({ 'clube.token': token });
}

/**
 * ⚠️ O `path` É PARSEADO (`parsePath`), e o teste da regra 3 depende disso.
 *
 * MEDIDO na rodada de correção: entregar `initialEntries={[{ pathname: path }]}`
 * com `path = '/books/abc?tab=plano#dia-3'` NÃO parseia nada — o react-router
 * confia no campo que recebeu, e `location.search`/`location.hash` ficam `''`.
 * Aí `${pathname}${search}${hash}` **é** o `pathname`, e o mutante que troca a
 * concatenação inteira por `location.pathname` no `RequireAuth` ficava verde
 * nos 33 testes deste arquivo. Fixture que anula o próprio teste (§7.2).
 *
 * O `parsePath` reparte a string nas três partes, que é o que o navegador faz.
 * Sem ele o `state` também não teria como viajar junto — é por isso que a
 * entrada continua sendo objeto, e não a string crua.
 */
function renderAt(
  path: string,
  storage: StorageLike,
  children: ReactNode,
  state?: unknown,
): void {
  render(
    // O idioma é PINADO em `pt`: o `navigator.language` do jsdom é `en-US`, e
    // sem isto as asserções de texto mudariam com o ambiente.
    <I18nextProvider i18n={createI18n(memoryStorage({ 'clube.locale': 'pt' }))}>
      <AuthProvider storage={storage} baseUrl="https://api.teste">
        {/*
          O `ActiveClubProvider` entra aqui porque a HOME passou a existir de
          verdade (Tarefa 16) e ela lê o clube ativo: os testes que provam
          "quem tem token VÊ a home" montam a home, e sem o provider o
          `useActiveClub` lança. Mesma posição do `main.tsx` — dentro do
          `AuthProvider`, acima do roteador.
        */}
        <ActiveClubProvider storage={storage}>
          <MemoryRouter
            initialEntries={[
              {
                ...parsePath(path),
                ...(state === undefined ? {} : { state }),
              },
            ]}
          >
            {children}
          </MemoryRouter>
        </ActiveClubProvider>
      </AuthProvider>
    </I18nextProvider>,
  );
}

/** Mostra o destino preservado, para o teste poder asseverar o valor exato. */
function LoginProbe() {
  const location = useLocation();
  const state: unknown = location.state;

  return (
    <div data-testid="login">
      {isFromLocationState(state) ? state.from : 'sem-destino'}
    </div>
  );
}

/**
 * Mostra o endereço corrente INTEIRO. É o que permite a asserção exata do
 * destino: um `pathname` sem a query passa num `toContain('/books/abc')`.
 */
function LocationProbe() {
  const location = useLocation();

  return (
    <span data-testid="destino">
      {`${location.pathname}${location.search}${location.hash}`}
    </span>
  );
}

/**
 * A árvore do OUTRO lado do guarda: quem já tem sessão não vê o login, e vai
 * para o destino preservado (regra 1 da Tarefa 15).
 */
function AnonymousRoutes() {
  return (
    <Routes>
      <Route element={<RequireAnonymous />}>
        <Route path="/login" element={<div>a tela de entrada</div>} />
      </Route>
      <Route path="/books/:bookId" element={<LocationProbe />} />
      <Route path="/" element={<LocationProbe />} />
    </Routes>
  );
}

function ProtectedRoutes() {
  return (
    <Routes>
      <Route element={<RequireAuth />}>
        <Route path="/books/:bookId" element={<div>a estante do clube</div>} />
      </Route>
      <Route path="/login" element={<LoginProbe />} />
    </Routes>
  );
}

describe('RequireAuth', () => {
  it('sends an anonymous visitor to the login screen (rule 21)', () => {
    renderAt('/books/abc', memoryStorage(), <ProtectedRoutes />);

    expect(screen.queryByTestId('login')).not.toBeNull();
    expect(screen.queryByText('a estante do clube')).toBeNull();
  });

  it.each([
    // Com query string de propósito: mandar a pessoa para `/books/abc` sem o
    // `?tab=plano` perde metade do link que ela abriu.
    ['/books/abc?tab=plano'],
    // E com HASH, que é a outra metade do endereço e não tinha fixture: o
    // link de um dia do plano (`#dia-3`) é exatamente o que se manda no grupo
    // — perder a âncora devolve a pessoa ao topo de um plano de 30 dias.
    ['/books/abc?tab=plano#dia-3'],
    ['/books/abc#dia-3'],
  ])(
    'preserves the destination %s the visitor was trying to reach (rule 21)',
    (destination) => {
      renderAt(destination, memoryStorage(), <ProtectedRoutes />);

      // Asserção EXATA no destino, não `toContain`: um `location.pathname` sem
      // a query passaria num `toContain('/books/abc')`.
      expect(screen.getByTestId('login').textContent).toBe(destination);
    },
  );

  it('renders the protected route when there is a token (rule 22)', () => {
    renderAt('/books/abc', withToken('token-valido'), <ProtectedRoutes />);

    expect(screen.queryByText('a estante do clube')).not.toBeNull();
    expect(screen.queryByTestId('login')).toBeNull();
  });
});

/**
 * A PENDÊNCIA QUE A TAREFA 12 REGISTROU E ESTA FATIA PAGA.
 *
 * O `RequireAuth` gravava `state.from` (com `search` e `hash`) e o
 * `RequireAnonymous` fazia `<Navigate to={HOME_PATH} replace />`
 * INCONDICIONALMENTE: quem abria `/books/abc#dia-3` sem sessão ia para o
 * login, entrava, e caía na home. O `isFromLocationState` existia com ZERO
 * chamadores de produção.
 */
describe('RequireAnonymous honours the preserved destination (rules 1, 3, 4)', () => {
  it('sends someone with a session to the destination they had asked for', () => {
    renderAt('/login', withToken('token-valido'), <AnonymousRoutes />, {
      from: '/books/abc',
    });

    expect(screen.getByTestId('destino').textContent).toBe('/books/abc');
  });

  it.each([
    ['/books/abc?tab=plano'],
    // Query E hash: o link de um dia do plano (`#dia-3`) é o que se manda no
    // grupo, e perder a âncora devolve a pessoa ao topo de um plano de 30
    // dias.
    ['/books/abc?tab=plano#dia-3'],
    ['/books/abc#dia-3'],
  ])('keeps search and hash of %s intact (rule 3)', (destination) => {
    renderAt('/login', withToken('token-valido'), <AnonymousRoutes />, {
      from: destination,
    });

    // Asserção EXATA, não `toContain`.
    expect(screen.getByTestId('destino').textContent).toBe(destination);
  });

  it('goes to the home when there is no destination to honour (rule 1)', () => {
    renderAt('/login', withToken('token-valido'), <AnonymousRoutes />);

    expect(screen.getByTestId('destino').textContent).toBe('/');
  });

  it.each([
    // Host externo com esquema: o *open redirect* clássico.
    ['https://evil.example/phish'],
    // Relativa a protocolo: `//evil.example` é host EXTERNO, e passa por
    // qualquer checagem que só olhe o primeiro caractere.
    ['//evil.example'],
    // O navegador normaliza `\` para `/` no lugar do separador, então isto é
    // o `//evil.example` de novo, escrito de outra forma.
    ['/\\evil.example'],
    ['javascript:alert(1)'],
    ['mailto:alguem@evil.example'],
    // Relativo: o `Navigate` o resolveria contra a rota atual, e o destino
    // deixaria de ser o que quem escreveu o `from` quis dizer.
    ['books/abc'],
    // Tab e CR/LF são REMOVIDOS da URL pelo navegador antes de resolvê-la:
    // isto volta a ser `//evil.example`.
    ['/\t/evil.example'],
  ])('ignores %s, which is not an internal path (rule 4)', (hostile) => {
    renderAt('/login', withToken('token-valido'), <AnonymousRoutes />, {
      from: hostile,
    });

    expect(screen.getByTestId('destino').textContent).toBe('/');
  });

  it('still shows the login to someone without a session, destination or not', () => {
    // O par negativo: um `RequireAnonymous` que redirecionasse sempre passaria
    // em todos os testes acima.
    renderAt('/login', memoryStorage(), <AnonymousRoutes />, {
      from: '/books/abc',
    });

    expect(screen.queryByText('a tela de entrada')).not.toBeNull();
  });
});

describe('internalPath and destinationFrom', () => {
  it('accepts an internal path unchanged', () => {
    expect(internalPath('/books/abc?tab=plano#dia-3')).toBe(
      '/books/abc?tab=plano#dia-3',
    );
  });

  it.each([
    ['https://evil.example'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['javascript:alert(1)'],
    ['books/abc'],
    ['/books /abc'],
    [''],
  ])('refuses %s', (hostile) => {
    expect(internalPath(hostile)).toBeNull();
  });

  it('falls back to the home for a state that is not a destination at all', () => {
    // O `location.state` é `unknown` de verdade: ele vem do histórico do
    // navegador, e pode ter sido escrito por outra versão do app.
    for (const state of [null, undefined, {}, { from: 42 }, 'texto', []]) {
      expect(destinationFrom(state)).toBe('/');
    }
  });
});

describe('AppRoutes', () => {
  it('shows the home to someone with a token (rule 22)', () => {
    renderAt('/', withToken('token-valido'), <AppRoutes />);

    expect(
      screen.queryByRole('heading', { name: pt.pages.home.title }),
    ).not.toBeNull();
  });

  it('sends an anonymous visitor from the home to the login (rule 21)', () => {
    renderAt('/', memoryStorage(), <AppRoutes />);

    expect(
      screen.queryByRole('heading', { name: pt.pages.login.title }),
    ).not.toBeNull();
  });

  it('sends someone who already has a token away from /login (rule 23)', () => {
    renderAt('/login', withToken('token-valido'), <AppRoutes />);

    expect(
      screen.queryByRole('heading', { name: pt.pages.home.title }),
    ).not.toBeNull();
    expect(
      screen.queryByRole('heading', { name: pt.pages.login.title }),
    ).toBeNull();
  });

  it('shows the login to someone without a token (rule 23)', () => {
    renderAt('/login', memoryStorage(), <AppRoutes />);

    expect(
      screen.queryByRole('heading', { name: pt.pages.login.title }),
    ).not.toBeNull();
  });

  it('shows the not-found screen on an unknown route, not a blank page (rule 24)', () => {
    renderAt('/rota-que-nao-existe', withToken('token-valido'), <AppRoutes />);

    expect(
      screen.queryByRole('heading', { name: pt.pages.notFound.title }),
    ).not.toBeNull();
  });

  it('does not turn an unknown route into a login redirect (rule 24)', () => {
    // Sem sessão E sem rota: a pessoa tem de ver "não encontrada", não achar
    // que perdeu a sessão.
    renderAt('/rota-que-nao-existe', memoryStorage(), <AppRoutes />);

    expect(
      screen.queryByRole('heading', { name: pt.pages.notFound.title }),
    ).not.toBeNull();
    expect(
      screen.queryByRole('heading', { name: pt.pages.login.title }),
    ).toBeNull();
  });
});
