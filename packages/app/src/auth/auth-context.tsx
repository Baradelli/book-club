import {
  type ApiClient,
  createApiClient,
  createTokenStorage,
  type StorageLike,
} from '@clube/shared/client';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { API_BASE_URL, browserStorage } from '../env';

/**
 * A sessão do app: o token e o cliente HTTP que o usa.
 *
 * Tudo é injetável (`storage`, `baseUrl`) porque o `shared` só oferece
 * fábricas — quem lê o ambiente é `env.ts`, e ele só é consultado aqui como
 * valor padrão.
 *
 * **Não há "clube ativo" nesta fatia** (decisão A da Tarefa 12): o primeiro
 * consumidor é o seletor da Tarefa 16, e a interface cresce com quem a usa.
 */
export interface AuthValue {
  token: string | null;
  isAuthenticated: boolean;
  api: ApiClient;
  /**
   * ⚠️ O CLIENTE DOS ENDPOINTS PÚBLICOS — sem `onUnauthorized`.
   *
   * `POST /auth/login` com senha errada responde **401**, e o `onUnauthorized`
   * do `api` acima é o `signOut()`. Ou seja: no cliente autenticado, **errar a
   * senha dispara o caminho de "a sessão morreu"** — limpa o armazenamento e
   * derruba o estado da sessão.
   *
   * Hoje o dano seria pequeno (quem está no login costuma não ter sessão), mas
   * é uma armadilha montada: a mesma tela é usada por quem chegou com token
   * expirado, e o `RequireAnonymous` agora manda para o destino preservado. Um
   * `signOut()` no meio disso embaralha os dois caminhos, e o sintoma seria
   * "digitei a senha errada uma vez e perdi o link que eu tinha aberto".
   *
   * Login e aceite de convite são as duas rotas públicas da API
   * (`packages/backend/src/routes/public-routes.ts`), e nenhuma das duas tem
   * sessão para perder. Então elas usam este cliente: mesma `baseUrl`, mesmo
   * tratamento de erro, **nenhum efeito colateral no 401**. É composição — o
   * `createApiClient` já recebe o callback por config, e `shared/src/client/`
   * não foi tocado.
   */
  publicApi: ApiClient;
  signIn(token: string): void;
  signOut(): void;
}

const AuthContext = createContext<AuthValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  storage?: StorageLike;
  baseUrl?: string;
}

export function AuthProvider({
  children,
  storage = browserStorage,
  baseUrl = API_BASE_URL,
}: AuthProviderProps) {
  const tokens = useMemo(() => createTokenStorage(storage), [storage]);
  const [token, setToken] = useState<string | null>(() => tokens.get());

  const signIn = useCallback(
    (next: string) => {
      tokens.set(next);
      setToken(next);
    },
    [tokens],
  );

  const signOut = useCallback(() => {
    tokens.clear();
    setToken(null);
  }, [tokens]);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl,
        // Lido a cada request, do armazenamento e não do estado do React: o
        // request disparado no mesmo tick do login veria o estado antigo.
        getToken: () => tokens.get(),
        // Só o 401 chega aqui — o 404 do corte de tenant e o 403 de "não é o
        // autor" não deslogam ninguém (regras 8 e 9).
        onUnauthorized: signOut,
      }),
    [baseUrl, tokens, signOut],
  );

  const publicApi = useMemo(
    () =>
      createApiClient({
        baseUrl,
        // `null` e não `tokens.get()`: nenhuma das duas rotas públicas lê o
        // `Authorization`, e mandar um token expirado junto do login só daria
        // ao servidor um header para ignorar.
        getToken: () => null,
        // O ponto de tudo isto. Um login que falha NÃO desloga (regra 8).
        onUnauthorized: () => undefined,
      }),
    [baseUrl],
  );

  const value = useMemo<AuthValue>(
    () => ({
      token,
      // `!== ''` junto com `!== null`, e não por zelo: o `createApiClient`
      // trata `''` como "sem token" e OMITE o `Authorization`. Sem esta
      // segunda metade, um `''` no armazenamento (um login que morreu no meio,
      // uma versão antiga) marcava a pessoa como autenticada, o `RequireAuth`
      // mostrava a home, e toda requisição saía sem header. As duas leituras
      // do mesmo valor têm de concordar.
      isAuthenticated: token !== null && token !== '',
      api,
      publicApi,
      signIn,
      signOut,
    }),
    [token, api, publicApi, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return value;
}
