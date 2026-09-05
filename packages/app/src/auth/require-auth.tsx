import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from './auth-context';

/**
 * O destino que a pessoa queria quando foi mandada para o login. A tela de
 * entrada (Tarefa 15) lê isto de `location.state` para voltar ao lugar certo.
 */
export interface FromLocationState {
  from: string;
}

export function isFromLocationState(
  value: unknown,
): value is FromLocationState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'from' in value &&
    typeof (value as { from: unknown }).from === 'string'
  );
}

/** Para onde o app manda quem já está autenticado. */
export const HOME_PATH = '/';
export const LOGIN_PATH = '/login';
/**
 * O aceite de convite. Em português porque é o único endereço que sai do
 * sistema e vai para o WhatsApp de alguém (ADR 0003) — quem recebe lê o link.
 *
 * Fica FORA do `RequireAnonymous` (Tarefa 15): quem já tem sessão e abre um
 * link de convite está aceitando um convite, e mandá-lo para a home o
 * deixaria sem nenhuma forma de entrar no clube novo.
 */
export const ACCEPT_INVITE_PATH = '/convite/:code';

/**
 * ⚠️ O `from` só é aceito se for CAMINHO INTERNO — regra 4 da Tarefa 15.
 *
 * Hoje o `from` só é escrito pelo `Navigate` do `RequireAuth` logo abaixo,
 * então não é explorável. A guarda existe porque a distância entre "só nós
 * escrevemos" e *open redirect* é uma linha de código: basta alguém ler o
 * `from` de query string um dia (`/login?from=...`, que é o padrão que todo
 * mundo copia) para o destino passar a vir de fora. Custa três linhas agora e
 * não custa nada depois.
 *
 * O que é recusado, e por quê:
 *
 * - não começa com `/` — `https://evil.com`, `javascript:alert(1)`,
 *   `mailto:`, e também qualquer relativo (`books/abc`), que o `Navigate`
 *   resolveria contra a rota atual;
 * - começa com `//` — URL relativa a protocolo: `//evil.com` é host EXTERNO,
 *   e passa por qualquer checagem que só olhe o primeiro caractere;
 * - começa com `/\` — o navegador normaliza `\` para `/` no lugar do
 *   separador, então `/\evil.com` é o `//evil.com` de novo, escrito de outra
 *   forma;
 * - contém espaço ou caractere de controle — tab, CR e LF são REMOVIDOS da URL
 *   pelo navegador antes de resolvê-la, então `/<TAB>/evil.com` volta a ser
 *   `//evil.com`. Nenhum destino legítimo do app tem espaço fora de `%20`.
 *
 * ⚠️ AUDITADO E REGISTRADO COMO CORRETO (rodada de correção da Tarefa 15): a
 * auditoria atacou **24 formas** — entre elas `/%2f%2f`, `/..//`, `HTTPS://`,
 * `\evil.com`, `/@evil.com` e o `U+2028` — e **nenhuma sai da origem**. As duas
 * únicas classes que trocariam de origem (esquema absoluto e URL relativa a
 * protocolo) estão barradas pelas três linhas acima.
 *
 * Os dois nits medidos e SEM severidade, anotados para quem reabrir: espaço
 * Unicode ACIMA de `0x20` (o `U+00A0` e companhia) passa a guarda — e produz
 * só um 404 estranho, dentro da origem —, e não há teto de tamanho no `from`.
 */
export function internalPath(from: string): string | null {
  // Comparação por CÓDIGO, e não por regex: escrever a faixa de controle
  // dentro de uma expressão regular é o que o `no-control-regex` do ESLint
  // reprova — e reprova com razão, porque ali o caractere de controle quase
  // sempre é engano. Um `/\s/` passaria no lint e deixaria o resto da faixa
  // de fora por nada.
  if ([...from].some((character) => character.charCodeAt(0) <= 0x20)) {
    return null;
  }
  if (!from.startsWith('/')) return null;
  if (from.startsWith('//') || from.startsWith('/\\')) return null;
  return from;
}

/**
 * O destino preservado de um `location.state`, ou a home.
 *
 * Uma função só, usada pelos DOIS lados (o `RequireAnonymous` abaixo e a tela
 * de login): se cada um decidisse por conta, um aceitaria o destino que o
 * outro recusa — e a divergência apareceria como "entrei e caí na home
 * às vezes".
 */
export function destinationFrom(state: unknown): string {
  if (!isFromLocationState(state)) return HOME_PATH;
  return internalPath(state.from) ?? HOME_PATH;
}

/**
 * Rota de layout que protege as filhas. Sem token, manda para o login
 * **preservando o destino** — mandar todo mundo para a home depois de entrar
 * perde o link que a pessoa abriu (regra 21).
 */
export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    // `replace`: o histórico não pode guardar a rota protegida, senão o botão
    // "voltar" devolve a pessoa para o redirecionamento em loop.
    return (
      <Navigate
        to={LOGIN_PATH}
        replace
        state={{ from } satisfies FromLocationState}
      />
    );
  }

  return <Outlet />;
}

/**
 * O contrário: quem já tem sessão não vê a tela de entrada (regra 23).
 *
 * ⚠️ E vai para o DESTINO PRESERVADO, não para a home — a pendência que a
 * Tarefa 12 registrou e esta fatia paga (regra 1 da Tarefa 15). O
 * `RequireAuth` acima grava `state.from` com `pathname`, `search` e `hash`, e
 * este `Navigate` jogava tudo fora: quem abria `/books/abc#dia-3` sem sessão
 * era mandado para o login, entrava, e **caía na home**. O
 * `isFromLocationState` existia sem um único chamador de produção.
 */
export function RequireAnonymous() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (isAuthenticated) {
    return <Navigate to={destinationFrom(location.state)} replace />;
  }

  return <Outlet />;
}
