import type { BookResponse, MeResponse, PlanItemResponse } from '@clube/shared';
import type { StorageLike } from '@clube/shared/client';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import {
  MemoryRouter,
  parsePath,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { vi } from 'vitest';

import { AuthProvider } from '../../auth/auth-context';
import { ActiveClubProvider } from '../../club/active-club';
import { createI18n } from '../../i18n';
import { OfflineNotesProvider } from '../../offline/offline-notes';
import type { PendingNoteStore } from '../../offline/store';

/**
 * O chão dos testes de tela. NÃO é um arquivo de teste (o `include` do
 * `vitest.config.ts` é `*.test.ts(x)`), e por isso também não é varrido pelo
 * Tailwind — o `styles.css` exclui a pasta `__tests__` inteira.
 *
 * Ele existe porque as telas precisam das MESMAS cinco coisas — i18n pinado,
 * storage injetável, sessão, contexto de clube ativo e um `fetch` espião — e um
 * harness copiado em três arquivos sai de sincronia no primeiro conserto. A
 * Tarefa 16 acrescentou o `ActiveClubProvider` e o `requestsTo`; o teste do
 * clube ativo (`src/club/__tests__/`) importa daqui em vez de recopiar.
 */

/** Fixture é factory (§7.7): cada teste ganha o seu armazenamento. */
export function memoryStorage(
  initial: Record<string, string> = {},
): StorageLike {
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

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** O corpo já parseado — é sobre ele que as asserções de contrabando falam. */
  body: unknown;
}

export interface Reply {
  status: number;
  /** Serializado como JSON. Use `raw` para provar corpo fora do contrato. */
  body?: unknown;
  raw?: string;
  /** `true` = o `fetch` REJEITA, que é a falha de rede (`status: 0`). */
  offline?: boolean;
}

export type Responder = (
  request: RecordedRequest,
  index: number,
) => Reply | Promise<Reply>;

/**
 * O espião entra pelo `fetch` GLOBAL, e não por um `fetchImpl` injetado: o
 * `AuthProvider` monta os dois clientes sozinho (é parte do que está sob
 * teste), então este é o mesmo caminho que a produção usa.
 *
 * ⚠️ **INFIDELIDADE REGISTRADA (§7.1): ele IGNORA o `init.signal`.**
 *
 * O `ApiClient` já aceita `signal`, e o `fetch` do navegador rejeita com
 * `AbortError` quando o sinal dispara. Este espião não olha o campo, então uma
 * requisição abortada aqui **responde normalmente** — o que significa que um
 * teste escrito contra `AbortController` + `options.signal` seria **falso
 * verde**: ele passaria com o aborto implementado e com ele apagado.
 *
 * É por isso que a corrida de troca de clube (`home.tsx`) continua guardada por
 * uma flag `cancelled` no efeito, e não por `AbortController`: a flag é
 * observável AQUI (a resposta velha chega e é descartada), o aborto não. Quem
 * quiser trocar o mecanismo tem de ensinar este `stubFetch` a rejeitar quando
 * `init.signal.aborted` — e a escutar o `abort` — ANTES de escrever o teste.
 */
export function stubFetch(responder: Responder): RecordedRequest[] {
  const calls: RecordedRequest[] = [];

  vi.stubGlobal(
    'fetch',
    async (
      url: string,
      init: { method: string; headers: Record<string, string>; body?: string },
    ) => {
      const request: RecordedRequest = {
        url,
        method: init.method,
        headers: { ...init.headers },
        body: init.body === undefined ? undefined : JSON.parse(init.body),
      };
      calls.push(request);

      const reply = await responder(request, calls.length - 1);
      if (reply.offline === true) throw new TypeError('Failed to fetch');

      return {
        ok: reply.status >= 200 && reply.status < 300,
        status: reply.status,
        text: () =>
          Promise.resolve(reply.raw ?? JSON.stringify(reply.body ?? {})),
      };
    },
  );

  return calls;
}

/** Sempre a mesma resposta — o caso comum. */
export function alwaysReply(reply: Reply): Responder {
  return () => reply;
}

/**
 * Uma resposta por ENDPOINT, e o resto no `fallback`.
 *
 * ⚠️ Existe por causa do §7.1 escrito para tela: `alwaysReply({ status: 401 })`
 * é um servidor que recusa TUDO, e nenhum servidor real faz isso. Com o shell
 * carregando o `/me` do clube ativo (Tarefa 16), aquele fixture passou a
 * derrubar a sessão de quem só errou a senha — provando o contrário do que o
 * nome do teste promete. O fixture fiel responde 401 no login e 200 no `/me`.
 *
 * O primeiro fragmento que casar a URL ganha.
 */
export function replyByUrl(
  routes: ReadonlyArray<readonly [fragment: string, reply: Reply | Responder]>,
  fallback: Reply,
): Responder {
  return (request, index) => {
    for (const [fragment, reply] of routes) {
      if (!request.url.includes(fragment)) continue;
      return typeof reply === 'function' ? reply(request, index) : reply;
    }
    return fallback;
  };
}

/**
 * A resposta do `GET /me` — fixture é factory, com `overrides` (§7.7).
 *
 * Ela é o CONTRATO REAL medido no backend (`me-routes.ts` +
 * `meResponseSchema`): `{ id, email, name, isSuperAdmin, clubs: [{ id, name,
 * role }] }`. Em especial **não existe `timezone`** — é a lacuna ⚠️ 1 da spec
 * da Tarefa 16, e é por isso que o front usa o fuso do navegador.
 *
 * O padrão é `clubs: []`, e é de propósito: é o estado do PRIMEIRO LOGIN do
 * projeto (o seed cria o super-admin sem membership nenhum), e um fixture que
 * já viesse com clube esconderia o caminho que acontece primeiro.
 */
export function meReply(overrides: Partial<MeResponse> = {}): Reply {
  const body: MeResponse = {
    id: 'u-marcos',
    email: 'marcos@clube.test',
    name: 'Marcos',
    isSuperAdmin: false,
    clubs: [],
    ...overrides,
  };
  return { status: 200, body };
}

/**
 * Um livro como a API o devolve — factory com `overrides` (§7.7).
 *
 * O CONTRATO REAL, medido em `bookResponseSchema` + `book-routes.ts`: `author`,
 * `coverUrl` e `totalPages` são **nullable, não opcionais** (o serializer do
 * Zod exige a chave), `month` é `"YYYY-MM"` e as datas são ISO em string.
 *
 * ⚠️ **O `month` PADRÃO É UM MÊS NOTORIAMENTE PASSADO, e é decisão.** A home
 * decide o que é "o livro de agora" comparando `month` com o mês de HOJE
 * (`todayCandidates` em `pages/home.tsx`), então o mês do fixture é semântico:
 * um `'2026-09'` literal seria "o mês corrente" em setembro de 2026, "passado"
 * em outubro e **futuro** em agosto — e o mesmo teste mudaria de assunto com o
 * relógio, sem uma linha alterada. Um mês do passado é sempre "não futuro", que
 * é o que quase todo teste quer. Quem testa a fronteira derive o mês de hoje
 * (`currentMonth()`/`futureMonth()` em `home.test.tsx`).
 */
export function aBook(overrides: Partial<BookResponse> = {}): BookResponse {
  return {
    id: 'b-hobbit',
    clubId: 'c-casal',
    title: 'O Hobbit',
    author: 'J. R. R. Tolkien',
    month: '2024-03',
    coverUrl: null,
    totalPages: 320,
    createdById: 'u-marcos',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: '2024-03-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Um dia do plano — factory com `overrides` (§7.7).
 *
 * ⚠️ `date` é o **dia de calendário** `"YYYY-MM-DD"`, não um instante: o
 * `toPlanItemResponse` do backend manda o `CalendarDay` cru, sem passar por
 * `Date` nenhum. É contra ESTE formato que o `localDay` compara.
 *
 * ⚠️ **E O `date` PADRÃO É NOTORIAMENTE NÃO-HOJE, de propósito.** Ele valia
 * `'2026-09-04'`, que era a data de hoje na rodada em que este arquivo nasceu —
 * uma bomba de tempo: um teste futuro escrito com a fábrica sem sobrescrever
 * `date` mostraria o atalho HOJE e nenhum AMANHÃ, e o autor concluiria que
 * provou a regra 15 quando provou o calendário. Quem quer "hoje" escreve
 * `date: today()`.
 */
export function aPlanItem(
  overrides: Partial<PlanItemResponse> = {},
): PlanItemResponse {
  return {
    id: 'p-dia-1',
    bookId: 'b-hobbit',
    order: 1,
    date: '2024-03-05',
    title: 'Cap. 1 — Uma reunião inesperada',
    reference: 'p. 9-30',
    createdAt: '2024-03-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A estante: `GET /clubs/:clubId/books` devolve um ARRAY, não um envelope. */
export function booksReply(books: readonly BookResponse[]): Reply {
  return { status: 200, body: books };
}

/**
 * `GET /books/:bookId` — `{ book, planItems, writers }`.
 *
 * O `writers` é **obrigatório** no `bookWithPlanResponseSchema`, e o cliente
 * HTTP roda o schema sobre a resposta (§6.8): um fixture sem ele viraria
 * `ApiError` de corpo fora do contrato, e o atalho de hoje simplesmente não
 * apareceria — falso negativo perfeito.
 */
export function bookWithPlanReply(
  book: BookResponse,
  planItems: readonly PlanItemResponse[],
): Reply {
  return { status: 200, body: { book, planItems, writers: [] } };
}

/**
 * Mostra o endereço corrente inteiro, para as asserções de navegação serem
 * EXATAS: um `pathname` sem a query passaria num `toContain('/books/abc')`.
 */
export function LocationProbe() {
  const location = useLocation();

  return (
    <span data-testid="location">
      {`${location.pathname}${location.search}${location.hash}`}
    </span>
  );
}

/**
 * Um botão que anda para TRÁS no histórico. É o que decide o `replace` das duas
 * telas: sem `replace`, o `navigate` do sucesso empilha uma entrada nova e o
 * botão "voltar" do celular devolve a pessoa à tela de entrada que ela já
 * venceu — e aí o `RequireAnonymous` a manda de volta, num pingue-pongue
 * visível. Com `replace`, não há entrada anterior para voltar.
 */
export function BackButton() {
  const navigate = useNavigate();

  return (
    <button data-testid="voltar" onClick={() => navigate(-1)} type="button">
      {/* Sem texto: é sonda de teste, não controle de tela. */}
    </button>
  );
}

export interface RenderOptions {
  /**
   * O endereço inicial do roteador de memória.
   *
   * ⚠️ Ele é PARSEADO (`parsePath`), e não entregue como `pathname`. Medido na
   * rodada de correção da Tarefa 15, no arquivo vizinho
   * (`auth/__tests__/require-auth.test.tsx`): um `{ pathname: '/x?a=1#b' }` faz
   * o react-router confiar no campo que recebeu, e `search`/`hash` ficam `''`.
   * Nenhum `path` daqui tem query HOJE, então a armadilha não morde ainda — mas
   * a primeira tela com `?tab=` (Tarefa 16) a acordaria calada.
   */
  path?: string;
  storage?: StorageLike;
  /** O `state` do `location` inicial — é como o `from` chega à tela. */
  state?: unknown;
  /**
   * A store da fila offline (Tarefa 21).
   *
   * ⚠️ O padrão é NÃO passar nada, e isso é fiel: sem `store`, o provider cai
   * no IndexedDB do navegador — que o **jsdom não implementa** —, e a store que
   * recusa é exatamente o cenário da decisão F (modo privado, cota estourada).
   * Ou seja: toda tela que não é a da Tarefa 21 continua se comportando como na
   * Tarefa 18, e é assim que ela se comporta para quem não tem IndexedDB.
   */
  store?: PendingNoteStore;
}

/**
 * O idioma é PINADO em `pt`: o `navigator.language` do jsdom é `en-US`, e sem
 * isto as asserções de texto mudariam com o ambiente.
 */
export function renderPage(ui: ReactNode, options: RenderOptions = {}): void {
  const storage = options.storage ?? memoryStorage();

  render(
    <I18nextProvider i18n={createI18n(memoryStorage({ 'clube.locale': 'pt' }))}>
      <AuthProvider storage={storage} baseUrl="https://api.teste">
        {/*
          O MESMO `storage` do `AuthProvider`, e é o que faz o clube ativo ser
          observável no teste: o provider é montado ACIMA do roteador (como no
          `main.tsx`) porque o seletor vive no cabeçalho do app, fora das rotas.

          Consequência medida, e ela é real: com o provider montado, a sessão
          que nasce no meio de um teste (o login que dá certo, o aceite que dá
          certo) dispara UM `GET /me`. É por isso que as asserções de contagem
          de `login.test.tsx` e `accept-invite.test.tsx` passaram a filtrar por
          endpoint (`requestsTo`) em vez de contar o array inteiro.
        */}
        <ActiveClubProvider storage={storage}>
          {/* A MESMA ordem do `main.tsx`: abaixo do clube ativo (a fila é por
              pessoa) e acima do roteador (ela não é de rota nenhuma). */}
          <OfflineNotesProvider
            {...(options.store ? { store: options.store } : {})}
          >
            <MemoryRouter
              initialEntries={[
                {
                  ...parsePath(options.path ?? '/login'),
                  ...(options.state === undefined
                    ? {}
                    : { state: options.state }),
                },
              ]}
            >
              {ui}
              <LocationProbe />
            </MemoryRouter>
          </OfflineNotesProvider>
        </ActiveClubProvider>
      </AuthProvider>
    </I18nextProvider>,
  );
}

/**
 * Os atributos que CARREGAM TEXTO PARA A PESSOA — e o leitor de tela fala
 * todos eles.
 *
 * `value` entra porque é o conteúdo de um `input`, e `alt`/`title`/`aria-label`
 * porque são a legenda de quem não vê a tela.
 */
const TEXT_BEARING_ATTRIBUTES: readonly string[] = [
  'title',
  'aria-label',
  'aria-valuetext',
  'placeholder',
  'alt',
  'value',
];

/**
 * ⚠️ TUDO O QUE A PESSOA PODE LER OU OUVIR — não só os nós de texto.
 *
 * MEDIDO na rodada de correção: a regra 19 ("nenhuma mensagem vinda da API
 * aparece na tela") era provada com `document.body.textContent`, que só vê nós
 * de TEXTO. Mover a frase da API para `title`/`aria-label` deixava os 152
 * testes verdes — e o `aria-label` é justamente o que o leitor de tela FALA.
 * Quem depende da regra era exatamente quem ela deixava de proteger.
 *
 * Então a varredura é a união: o texto renderizado mais o valor de todo
 * atributo que carrega texto, de todo elemento do documento.
 */
export function readableText(): string {
  const parts: string[] = [document.body.textContent ?? ''];

  for (const element of Array.from(document.querySelectorAll('*'))) {
    /*
      ⚠️ **O TEXTO DE CADA ELEMENTO, SEPARADO — e é um DEFEITO MEDIDO da
      varredura, achado na rodada de correção da Tarefa 25.**

      `document.body.textContent` **cola** os nós irmãos sem separador algum:
      um `<span>Cor da caneta</span><span>Somente você vê este grifo.</span>`
      vira `"Cor da canetaSomente você vê este grifo."`. Aí a varredura do ADR
      0002, que é ANCORADA à esquerda por `\b` (`adr-0002-dom.ts`, e a âncora
      existe por medição: sem ela um `includes` cru acusa `block`/`unlock`), não
      encontra `somente voc` — porque entre o `a` de "caneta" e o `S` de
      "Somente" **não há fronteira de palavra**.

      MEDIDO: `"Somente voce ve este grifo."` plantado ao lado do rótulo da
      paleta dava **0 acusadores em 508 testes**, e a frase é exatamente o que
      o leitor de tela fala.

      O conserto é a SUPERFÍCIE, não a âncora: o `body.textContent` continua na
      lista (é ele que faz um `toContain` de frase quebrada em vários nós ainda
      funcionar), e cada elemento entra também com o SEU texto, numa linha
      própria. A união é estritamente mais forte — só acrescenta casamentos.
    */
    const own = element.textContent;
    if (own !== null && own !== '') parts.push(own);

    for (const attribute of TEXT_BEARING_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value !== null) parts.push(value);
    }
  }

  return parts.join('\n');
}

/**
 * `"você não"` → `"voce nao"`: nenhuma varredura pode depender do acento.
 *
 * ⚠️ Ele mora AQUI, ao lado do `readableText()`, e não numa das duas guardas —
 * é o que impede o ciclo `anti-guilt-dom` ⇄ `adr-0002-dom`. As duas o
 * consomem; nenhuma depende da outra para tê-lo. O `anti-guilt-dom` continua
 * reexportando-o, para os arquivos de teste que já o importavam de lá.
 */
export function withoutDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * As requisições feitas a UM endpoint.
 *
 * ⚠️ Existe porque `expect(calls).toHaveLength(1)` deixou de significar "houve
 * um login" no instante em que o app passou a carregar o `/me` do clube ativo:
 * uma sessão que nasce no meio do teste soma a requisição do shell ao array. A
 * asserção honesta é sobre o endpoint sob teste — e ela é MAIS forte que a
 * antiga, porque não confunde as duas.
 *
 * ⚠️ **O QUE SE PERDEU NA TROCA, registrado e não consertado.** O
 * `toHaveLength(1)` sobre o array INTEIRO também provava "a tela não dispara
 * mais nada" — nenhuma requisição a endpoint nenhum além daquela. Com o filtro
 * por endpoint, essa propriedade sobrevive só no caminho ANÔNIMO (onde o shell
 * não pede `/me`). Risco baixo: uma requisição a mais entraria por um efeito
 * novo, e os arquivos de tela contam as requisições dos endpoints que usam. Se
 * um dia importar, o formato é uma asserção sobre o CONJUNTO de endpoints
 * tocados, não sobre o total.
 */
export function requestsTo(
  calls: readonly RecordedRequest[],
  fragment: string,
): RecordedRequest[] {
  return calls.filter((call) => call.url.includes(fragment));
}

/** `noUncheckedIndexedAccess` ligado: falha alto em vez de espalhar `!`. */
export function requestAt(
  calls: readonly RecordedRequest[],
  index: number,
): RecordedRequest {
  const call = calls[index];
  if (!call) throw new Error(`esperava uma requisição no índice ${index}`);
  return call;
}
