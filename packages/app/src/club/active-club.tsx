import { type MeResponse, meResponseSchema } from '@clube/shared';
import type { StorageLike } from '@clube/shared/client';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useAuth } from '../auth/auth-context';
import { browserStorage } from '../env';

/**
 * O **CLUBE ATIVO** — o termo do `CONTEXT.md` que deixa de ser glossário aqui.
 *
 * ⚠️ **É ESTADO LOCAL, NÃO DE SERVIDOR** (`CONTEXT.md`, e decisão fechada da
 * spec). Nada o envia para a API: o tenant de cada request vem do JWT
 * (`req.user.sub`) e do `clubId` que está no CAMINHO da rota. O `clubId` que
 * aparece numa URL daqui é o parâmetro de rota que o backend valida contra o
 * `Membership`, não uma preferência que o cliente declara — e nenhum corpo de
 * requisição do app carrega o clube ativo (regra 11, com teste que varre os
 * corpos).
 *
 * ⚠️ **E É AQUI QUE O `/me` É BUSCADO.** A spec supõe que os clubes "já vêm do
 * `AuthProvider`" — **não vêm**: o `AuthProvider` da Tarefa 12 guarda token e
 * clientes HTTP e não chama `/me` (o docblock dele diz, com todas as letras,
 * que o clube ativo é da Tarefa 16 e que "a interface cresce com quem a usa").
 * Então quem chama `/me` é este provider, que é justamente quem precisa da
 * lista: o seletor do cabeçalho e a home.
 */

/**
 * A chave gravada no navegador. Constante e com teste pelo VALOR, pelo mesmo
 * motivo do `TOKEN_STORAGE_KEY`: mudá-la faz todo mundo voltar para o primeiro
 * clube na próxima atualização.
 */
export const ACTIVE_CLUB_STORAGE_KEY = 'clube.activeClub';

/** O clube como o `/me` o devolve: `{ id, name, role }`. */
export type ClubSummary = MeResponse['clubs'][number];

/**
 * ⚠️ **QUEM SOU EU** — o pedaço do `/me` que a Tarefa 16 jogava fora.
 *
 * Até a Tarefa 17 este provider lia o `/me` e guardava **só** `clubs`: o `id` e
 * o `name` da pessoa eram descartados na linha do `.then()`. Consequência
 * medida: nenhuma tela sabia separar "o que EU escrevi" do que o clube escreveu
 * — a tela do livro mostrava uma inicial derivada do UUID (uma letra que "tem
 * cara de inicial e não é de ninguém") e a anotação do dia não conseguiria
 * dizer qual das notas do dia é a sua (decisão C da Tarefa 18).
 *
 * `name` é `string | null` porque é o contrato do `meResponseSchema` — o
 * `User.name` é anulável no banco, e o `PersonAvatar` já recebe `null` como
 * "sem nome" (glifo neutro).
 */
export interface ActiveClubMe {
  id: string;
  name: string | null;
}

export type ActiveClubStatus = 'anonymous' | 'loading' | 'ready' | 'failed';

export interface ActiveClubValue {
  status: ActiveClubStatus;
  /**
   * ⚠️ **`null` FORA DO `ready`, e a armadilha é nomeada.**
   *
   * `anonymous`, `loading` e `failed` não sabem quem é a pessoa, e um objeto
   * inventado ali (`{ id: '', name: null }`) faria a comparação
   * `note.userId === me.id` responder `false` para **todo mundo** — em
   * silêncio, e com a tela inteira funcionando: a sua anotação apareceria na
   * lista "das outras pessoas", em leitura, sem affordance de editar. Quem
   * consome isto trata o `null` como "ainda não sei", nunca como "não sou
   * ninguém".
   */
  me: ActiveClubMe | null;
  /** Na ORDEM que o `/me` devolveu — a tela não reordena. */
  clubs: readonly ClubSummary[];
  activeClub: ClubSummary | null;
  /**
   * O erro do `/me`, cru. A tela o traduz por CHAVE (`resolveApiError`), nunca
   * lê `.message` — que é texto em inglês (§6.2 e a regra de ESLint do
   * projeto).
   */
  error: unknown;
  /** Guarda a escolha e a aplica. É também o que semeia o clube do aceite. */
  selectClub(clubId: string): void;
  /** Refaz o `/me`. É a "ação de repetir" de quem abriu o app sem rede. */
  reload(): void;
}

const ActiveClubContext = createContext<ActiveClubValue | null>(null);

/**
 * ⚠️ TODO ACESSO PROTEGIDO, e não por zelo: o Safari em aba privada lança em
 * `setItem`, e um navegador com armazenamento do site bloqueado lança até em
 * `getItem` (a lição que a Tarefa 12 pagou no token — `createTokenStorage`).
 * Sem o `try`, o app **não abre** — e abrir no primeiro clube é muito melhor
 * que uma tela branca.
 *
 * Não reusa o `createTokenStorage` de `shared/client` porque ele é fixo na
 * chave do token, e `shared/src/client/**` não é alterado nesta fatia (compõe,
 * não muda).
 */
function readStoredClubId(storage: StorageLike): string | null {
  try {
    return storage.getItem(ACTIVE_CLUB_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredClubId(storage: StorageLike, clubId: string): void {
  try {
    storage.setItem(ACTIVE_CLUB_STORAGE_KEY, clubId);
  } catch {
    // No-op: a escolha vale só enquanto a aba estiver aberta.
  }
}

function clearStoredClubId(storage: StorageLike): void {
  try {
    storage.removeItem(ACTIVE_CLUB_STORAGE_KEY);
  } catch {
    // Idem: não há o que fazer, e derrubar a home seria pior.
  }
}

interface MeState {
  status: ActiveClubStatus;
  me: ActiveClubMe | null;
  clubs: readonly ClubSummary[];
  error: unknown;
}

const ANONYMOUS: MeState = {
  status: 'anonymous',
  me: null,
  clubs: [],
  error: undefined,
};

/** `loading` e `failed` também não sabem quem é a pessoa (→ `ActiveClubValue.me`). */
function withoutMe(status: 'loading' | 'failed', error: unknown): MeState {
  return { status, me: null, clubs: [], error };
}

export interface ActiveClubProviderProps {
  children: ReactNode;
  storage?: StorageLike;
}

export function ActiveClubProvider({
  children,
  storage = browserStorage,
}: ActiveClubProviderProps) {
  const { api, isAuthenticated } = useAuth();

  /**
   * A ESCOLHA EXPLÍCITA — e só ela mora no armazenamento.
   *
   * O padrão ("o primeiro clube de `/me`", regra 8) é derivado, não gravado:
   * gravá-lo faria o app lembrar de uma decisão que ninguém tomou, e a lista
   * do `/me` já é a fonte da ordem.
   */
  const [chosenId, setChosenId] = useState<string | null>(() =>
    readStoredClubId(storage),
  );
  const [attempt, setAttempt] = useState(0);
  /**
   * ⚠️ O ESTADO INICIAL DEPENDE DA SESSÃO, e é um FLASH medido: o `/me` só sai
   * num efeito, então quem tem sessão teria um primeiro frame `anonymous` —
   * "nenhum clube" — antes do `loading`. Nascer em `loading` fecha a janela.
   */
  const [me, setMe] = useState<MeState>(() =>
    isAuthenticated ? withoutMe('loading', undefined) : ANONYMOUS,
  );

  useEffect(() => {
    if (!isAuthenticated) {
      // Sem sessão não há `/me` para buscar — e a tela de login e a de aceite
      // não podem disparar requisição autenticada nenhuma.
      setMe(ANONYMOUS);
      return;
    }

    let cancelled = false;
    setMe(withoutMe('loading', undefined));

    void api
      .get('/me', meResponseSchema)
      .then((response) => {
        if (cancelled) return;
        setMe({
          status: 'ready',
          // `id` e `name`, e nada mais: o `email` e o `isSuperAdmin` não têm
          // chamador, e expor o que ninguém usa é convidar um vazamento de
          // dado privado para uma tela futura.
          me: { id: response.id, name: response.name },
          clubs: response.clubs,
          error: undefined,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMe(withoutMe('failed', error));
      });

    return () => {
      cancelled = true;
    };
    // `api` é estável entre trocas de token (o `useMemo` do `AuthProvider` não
    // depende do token — ele lê o armazenamento a cada request), então o
    // refresh do boot NÃO refaz este `/me`.
  }, [api, isAuthenticated, attempt]);

  /**
   * REGRA 9 — O ID GUARDADO QUE NÃO ESTÁ MAIS EM `/me` É LIMPO.
   *
   * O membership pode ter sido arquivado (MVP 4). Manter o id morto deixaria a
   * home pedindo a estante de um clube que responde 404 — tela quebrada por
   * dado velho no `localStorage`, para sempre, porque nada mais reescreveria a
   * chave.
   *
   * Só roda com o `/me` `ready`: durante o `loading` a lista está vazia, e
   * limpar ali apagaria a escolha de quem só está esperando a rede.
   */
  useEffect(() => {
    if (me.status !== 'ready' || chosenId === null) return;
    if (me.clubs.some((club) => club.id === chosenId)) return;

    clearStoredClubId(storage);
    setChosenId(null);
  }, [me, chosenId, storage]);

  const activeClub = useMemo<ClubSummary | null>(() => {
    const chosen =
      chosenId === null
        ? undefined
        : me.clubs.find((club) => club.id === chosenId);

    // REGRAS 8 e 9: sem escolha válida, o PRIMEIRO da lista. `?? null` porque
    // `noUncheckedIndexedAccess` está ligado — e porque `clubs: []` é o
    // primeiro login do projeto (o seed cria o super-admin sem membership
    // nenhum), não um caso de borda.
    return chosen ?? me.clubs[0] ?? null;
  }, [me.clubs, chosenId]);

  const selectClub = useCallback(
    (clubId: string) => {
      writeStoredClubId(storage, clubId);
      setChosenId(clubId);
    },
    [storage],
  );

  const reload = useCallback(() => {
    setAttempt((previous) => previous + 1);
  }, []);

  const value = useMemo<ActiveClubValue>(
    () => ({
      status: me.status,
      me: me.me,
      clubs: me.clubs,
      activeClub,
      error: me.error,
      selectClub,
      reload,
    }),
    [me, activeClub, selectClub, reload],
  );

  return (
    <ActiveClubContext.Provider value={value}>
      {children}
    </ActiveClubContext.Provider>
  );
}

export function useActiveClub(): ActiveClubValue {
  const value = useContext(ActiveClubContext);
  if (value === null) {
    throw new Error(
      'useActiveClub must be used inside an <ActiveClubProvider>',
    );
  }
  return value;
}
