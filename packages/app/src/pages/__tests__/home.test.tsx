import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ActivityEventResponse, ClubMemberResponse } from '@clube/shared';
import { localDay, localTimeZone } from '@clube/shared';
import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { pt } from '@clube/shared/locales';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import { AuthProvider } from '../../auth/auth-context';
import { ActiveClubProvider, type ClubSummary } from '../../club/active-club';
import { createI18n } from '../../i18n';
import { AppRoutes } from '../../router';
import {
  DANGER_STYLE,
  expectNoGuilt,
  expectNoGuiltInHtml,
  expectNoGuiltWithPlanPosition,
  stripComments,
} from './anti-guilt-dom';
import {
  aBook,
  aPlanItem,
  booksReply,
  bookWithPlanReply,
  memoryStorage,
  meReply,
  readableText,
  type RecordedRequest,
  renderPage,
  type Reply,
  replyByUrl,
  requestAt,
  requestsTo,
  type Responder,
  stubFetch,
} from './harness';

/**
 * A HOME — regras 12 a 19 e 21 da Tarefa 16.
 *
 * Entra pelo `<App />` inteiro (cabeçalho + rotas), e não pela `HomePage`
 * montada à mão, porque metade do que esta fatia entrega é a composição: o
 * seletor de clube vive no cabeçalho, o `/me` vive no `ActiveClubProvider`, e o
 * `RequireAuth` é quem deixa a home aparecer. Montar a página sozinha provaria
 * uma tela que a produção não tem.
 *
 * O que NÃO se testa (a spec é explícita): aparência, ordem VISUAL dos cartões,
 * snapshot. O `List`, o `Button` e o `PersonAvatar` têm cobertura própria na
 * Tarefa 13.
 */

const CASAL: ClubSummary = {
  id: 'c-casal',
  name: 'Clube do Casal',
  role: 'OWNER',
};

/**
 * Dois clubes — o seletor do cabeçalho só existe com 2+ (decisão F), e é ele
 * que a corrida de troca precisa.
 *
 * ⚠️ A ORDEM ALFABÉTICA É O OPOSTO DA ORDEM DA API (§7.2): `'Amigos do Livro'`
 * vem ANTES de `'Clube do Casal'` no alfabeto, e depois na lista. A precondição
 * é pinada em `active-club.test.tsx`, onde a ordem é o assunto.
 */
const TWO_CLUBS: readonly ClubSummary[] = [
  CASAL,
  { id: 'c-amigos', name: 'Amigos do Livro', role: 'MEMBER' },
];

const SESSION: Record<string, string> = {
  [TOKEN_STORAGE_KEY]: 'token-da-sessao',
};

/**
 * O dia de HOJE no fuso de quem roda o teste — a mesma conta que a tela faz.
 *
 * ⚠️ E é de propósito que ela seja a mesma função: o alternativo seria congelar
 * o relógio, e aí o dia esperado passaria a depender do fuso da MÁQUINA (o CI
 * está em UTC, a máquina do dono em UTC−3) — um fixture verde aqui e vermelho
 * lá. O `localDay` tem os testes dele em `packages/shared`, incluindo os dois
 * sentidos da meia-noite; aqui o que se prova é o ELO: o item cuja `date` é
 * hoje vira atalho, e o de outra data NÃO vira (o teste da regra 16 é o par
 * negativo desta linha, e sem ele isto seria tautologia).
 */
function today(): string {
  return localDay(new Date(), localTimeZone());
}

function otherDay(): string {
  // Um dia que existe e NÃO é hoje. `2000-01-01` está fora de qualquer fuso
  // possível para "agora".
  return '2000-01-01';
}

/**
 * ⚠️ **OS MESES SÃO DERIVADOS DE HOJE, NUNCA LITERAIS** — e é §7.6.1 aplicado
 * ao calendário.
 *
 * A home decide o que é "livro de agora" comparando `book.month` com o mês de
 * HOJE. Um fixture com `month: '2026-09'` escrito à mão prova a regra só
 * enquanto o relógio estiver em setembro de 2026: em outubro o mesmo livro
 * viraria "passado" e em agosto viraria "futuro", e o teste mudaria de assunto
 * sozinho, sem uma linha alterada.
 */
function currentMonth(): string {
  return today().slice(0, 7);
}

function monthShifted(by: number): string {
  const [year, month] = currentMonth().split('-');
  // `Date.UTC` faz a aritmética de virada de ano: mês 12 + 1 = janeiro do ano
  // seguinte, sem um `if` que alguém erra.
  const shifted = new Date(Date.UTC(Number(year), Number(month) - 1 + by, 1));
  return localDay(shifted, 'UTC').slice(0, 7);
}

/** O mês SEGUINTE: o livro que o admin já cadastrou adiantado. */
function futureMonth(): string {
  return monthShifted(1);
}

/** O mês ANTERIOR: o livro cujo plano ainda pode estar correndo. */
function previousMonth(): string {
  return monthShifted(-1);
}

const ME_ID = 'u-marcos';
const MARIA = 'u-maria';

/**
 * Quem é o clube — `GET /clubs/:clubId/members` (a rota da Tarefa 26a).
 *
 * ⚠️ A home é o **terceiro** chamador do `nameOfWriter` (o livro e o acervo são
 * os outros dois), e não a quarta cópia dele: o dono único é o
 * `pages/club-names.ts`.
 */
function clubMembers(): ClubMemberResponse[] {
  return [
    { userId: ME_ID, name: 'Marcos', role: 'OWNER', status: 'ACTIVE' },
    { userId: MARIA, name: 'Maria', role: 'MEMBER', status: 'ACTIVE' },
  ];
}

/**
 * Um evento do feed como a API o devolve — factory com `overrides` (§7.7).
 *
 * O CONTRATO REAL, medido em `activityEventResponseSchema`: os oito campos da
 * entidade **mais o `planItemTitle`** (Tarefa 38e), com `planItemId` e
 * `planItemTitle` **anuláveis, não opcionais** (o serializer do Zod exige as
 * duas chaves) e `createdAt` ISO em string.
 *
 * ⚠️ O padrão dos dois é `null`, que é o estado do grifo — o tipo padrão desta
 * fábrica. ⚠️ E o `planItemTitle` é **conteúdo do usuário**: quem digita o tema
 * do dia é o admin do clube, então ele nunca entra nas varreduras de
 * vocabulário, que medem as NOSSAS frases com as fixtures delas (regra 7).
 *
 * Fora ele, o evento continua levando **referência, nunca conteúdo** — não há
 * nome de quem fez nem nome do livro (decisão G da Tarefa 33). É por isso que a
 * home resolve os dois por conta própria.
 */
function anActivity(
  overrides: Partial<ActivityEventResponse> = {},
): ActivityEventResponse {
  return {
    id: 'a-1',
    clubId: CASAL.id,
    userId: MARIA,
    type: 'HIGHLIGHT',
    bookId: 'b-hobbit',
    planItemId: null,
    planItemTitle: null,
    subjectId: 'h-1',
    createdAt: agoMs(0),
    ...overrides,
  };
}

/**
 * ⚠️ **O `createdAt` É DERIVADO DE AGORA, NUNCA UM LITERAL** — §7.8 aplicado ao
 * relógio, e é a mesma disciplina do `month` do `aBook()`. Um
 * `'2026-09-11T10:00:00Z'` escrito à mão diria "há 2 horas" no dia em que este
 * arquivo nasceu e "há 3 anos" depois: o teste mudaria de assunto sem uma linha
 * alterada.
 */
function agoMs(elapsed: number): string {
  return new Date(Date.now() - elapsed).toISOString();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface HomeSetup {
  clubs?: readonly ClubSummary[];
  /** As respostas de `GET /clubs/:clubId/books`, uma por chamada. */
  shelf?: readonly Reply[];
  /**
   * A resposta de `GET /books/:bookId` — uma só, ou um `Responder` por id
   * (`bookRepliesById`).
   */
  book?: Reply | Responder;
  me?: Reply;
  /** `GET /clubs/:clubId/activity?limit=…` — o feed (Tarefa 35). */
  activity?: Reply | Responder;
  /** A resposta de `GET /clubs/:clubId/streaks` (ADR 0010). */
  streaks?: Reply | Responder;
  /** `GET /clubs/:clubId/members` — o nome de quem aparece no feed. */
  members?: Reply | Responder;
}

/**
 * ⚠️ **UMA RESPOSTA POR ID DE LIVRO** — e a falta disto é parte do motivo de o
 * bug do livro futuro ter passado batido.
 *
 * O `homeResponder` casa o fragmento `/books/` e responde **a mesma coisa para
 * qualquer id**: um fixture assim não distingue "pediu o plano do livro certo"
 * de "pediu o do errado e recebeu o certo". É a infidelidade do §7.1 escrita
 * para tela — o servidor real responde por id.
 */
function bookRepliesById(replies: Record<string, Reply>): Responder {
  return (request) => {
    for (const [id, reply] of Object.entries(replies)) {
      if (request.url.endsWith(`/books/${id}`)) return reply;
    }
    return { status: 404, body: { error: 'Not found' } };
  };
}

/** As URLs dos `GET /books/:bookId` — a observável do orçamento da decisão E. */
function planRequests(calls: readonly RecordedRequest[]): string[] {
  return requestsTo(calls, '/books/').map((call) => call.url);
}

/**
 * ⚠️ **A ESTANTE, E SÓ ELA — e este helper nasceu porque a Tarefa 35 QUEBROU o
 * `requestsTo(calls, '/clubs/')`.**
 *
 * Até aqui, "requisição a `/clubs/`" e "requisição da estante" eram a mesma
 * coisa. O feed acrescentou `/clubs/:id/activity` e `/clubs/:id/members`, e um
 * `toHaveLength(1)` sobre o fragmento passou a contar três coisas diferentes —
 * uma asserção que continua verde e deixou de descrever a verdade. A saída é
 * trocá-la pela que descreve a verdade nova, nunca afrouxá-la: o endereço da
 * estante é `/clubs/:clubId/books`, e é ele que este `RegExp` fixa.
 */
function shelfRequests(calls: readonly RecordedRequest[]): RecordedRequest[] {
  return calls.filter((call) => /\/clubs\/[^/]+\/books$/u.test(call.url));
}

/**
 * ⚠️ **O `/me`, E NÃO O `/members` — o mesmo falso verde, do outro lado.**
 *
 * `requestsTo` casa por SUBSTRING, e `/clubs/c-casal/members` **contém** `/me`.
 * É a medição que a Tarefa 27 já tinha feito no `busca.test.tsx` (lá, sobre a
 * ordem das rotas do fixture); aqui ela morde a CONTAGEM.
 */
function meRequests(calls: readonly RecordedRequest[]): RecordedRequest[] {
  return calls.filter((call) => new URL(call.url).pathname === '/me');
}

function feedRequests(calls: readonly RecordedRequest[]): RecordedRequest[] {
  return requestsTo(calls, '/activity');
}

function memberRequests(calls: readonly RecordedRequest[]): RecordedRequest[] {
  return requestsTo(calls, '/members');
}

/**
 * O shell autenticado inteiro, endpoint por endpoint.
 *
 * ⚠️ A ORDEM das rotas importa, e cada linha tem um motivo:
 * - `/activity` e `/members` vêm PRIMEIRO: os dois endereços contêm `/clubs/`,
 *   e embaixo dele receberiam o corpo da ESTANTE — que o schema recusaria
 *   (§6.8) e faria o feed cair no ramo de falha por um motivo que não é o do
 *   teste. Pior: cada um consumiria uma resposta do array `shelf`;
 * - `/members` vem antes de `/me`, e é um falso verde MEDIDO na Tarefa 27:
 *   `/clubs/c-casal/members` **contém** `/me`;
 * - `/clubs/` (a estante) vem antes de `/books/` (o livro com o plano), porque
 *   `.../clubs/c/books` também casaria um fragmento `/books`.
 */
function homeResponder(setup: HomeSetup): Responder {
  const shelf = setup.shelf ?? [booksReply([aBook()])];
  let shelfCall = 0;

  return replyByUrl(
    [
      ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
      ['/activity', setup.activity ?? { status: 200, body: [] }],
      /*
        ⚠️ **ANTES de `/clubs/`, e é a quarta aparição da classe neste
        projeto.** O `replyByUrl` casa por FRAGMENTO e o primeiro vencedor
        ganha: `/clubs/c-casal/streaks` **contém** `/clubs/`, então com a ordem
        trocada a corrente receberia o corpo da ESTANTE, o Zod recusaria, e o
        foguinho sumiria da tela com o teste verde.
      */
      ['/streaks', setup.streaks ?? { status: 200, body: [] }],
      ['/members', setup.members ?? { status: 200, body: clubMembers() }],
      ['/me', setup.me ?? meReply({ clubs: [...(setup.clubs ?? [CASAL])] })],
      [
        '/clubs/',
        () => {
          const reply = shelf[Math.min(shelfCall, shelf.length - 1)];
          shelfCall += 1;
          return reply ?? booksReply([]);
        },
      ],
      ['/books/', setup.book ?? bookWithPlanReply(aBook(), [])],
    ],
    { status: 500, body: { error: 'Internal Server Error' } },
  );
}

async function renderHome(setup: HomeSetup = {}): Promise<RecordedRequest[]> {
  const calls = stubFetch(homeResponder(setup));

  await act(async () => {
    renderPage(<App />, {
      path: '/',
      storage: memoryStorage({ ...SESSION }),
    });
    await Promise.resolve();
  });

  return calls;
}

function locationText(): string {
  return screen.getByTestId('location').textContent ?? '';
}

/** A home continua de pé: o título dela está na tela. */
function homeIsUp(): boolean {
  return screen.queryByRole('heading', { name: pt.pages.home.title }) !== null;
}

/**
 * ⚠️ **A VARREDURA ANTI-CULPA — REGRA 16, e ela mora num módulo COMUM.**
 *
 * `docs/plano-clube-do-livro.md` §1: *"o sistema não pune ausência de registro;
 * valoriza qualquer registro útil. Quem está atrasado não vê dívida vermelha
 * nem 'você falhou 3 dias'."* Isso é REQUISITO, e requisito sem guarda
 * automática é intenção.
 *
 * ⚠️ **ELA ERA LOCAL E ERA A VERSÃO FRACA** — achado da revisão da Tarefa 17.
 * Esta suíte ficou com a varredura da Tarefa 16 (palavras INTEIRAS, sem remoção
 * de diacrítico, sem regex de placar) enquanto a `book.test.tsx` ganhou a
 * forte. MEDIDO: `"Você deixou 3 dias passarem"` e `"0 de 30 dias"` plantados
 * nas duas telas davam **0 acusadores aqui** e **14 na tela do livro** — duas
 * funções com o mesmo nome e forças diferentes, que é a pior forma de dívida,
 * porque parece cobertura. Hoje as três telas importam a MESMA de
 * `./anti-guilt-dom`, e o vocabulário do catálogo continua guardado em
 * `packages/shared/src/locales/__tests__/anti-guilt.test.ts` (§7.9).
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the first login of the project falls into the empty state (rule 12)', () => {
  it('does not crash when /me comes back with clubs: []', async () => {
    /*
      ⚠️ ESTE É O CAMINHO QUE ACONTECE PRIMEIRO, não um caso de borda: o seed
      cria `admin@clube.local` com `isSuperAdmin: true` e ZERO memberships.
      Um `clubs[0]` sem guarda aqui quebraria a primeira impressão do projeto
      inteiro.
    */
    const calls = await renderHome({ clubs: [] });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.home.noClubs.title)).not.toBeNull();
    });
    expect(homeIsUp()).toBe(true);
    // A mensagem diz O QUE FAZER — criar clube é super-admin (Tarefa 42), e
    // entrar num clube é pelo link de convite (ADR 0003).
    expect(
      screen.queryByText(pt.pages.home.noClubs.description),
    ).not.toBeNull();
    // E não pede a estante de clube nenhum: sem clube ativo não há tenant para
    // pedir, e um `/clubs/undefined/books` daria 404 na primeira tela do app.
    expect(requestsTo(calls, '/clubs/')).toHaveLength(0);
    expectNoGuilt();
  });

  it('shows the loading state while the /me is in flight, never the empty one', async () => {
    /*
      Enquanto o `/me` não volta, ninguém sabe se há clube — e mostrar "Seu
      clube aparece aqui" nesse instante é afirmar o que não se sabe, para
      quem tem clube. A resposta fica PENDURADA de propósito: é o único jeito
      de olhar a tela ENQUANTO a requisição está no ar. As duas asserções são
      o par — "não mostra o vazio" sozinho passaria numa tela branca.

      MUTANTE QUE ELE MATA (medido): apagar o ramo de carregamento da home. Aí
      o `activeClub === null` do `loading` cai no estado vazio.

      ⚠️ **O QUE ELE NÃO PROVA, E ONDE ISSO É PROVADO.** A home testa
      `status !== 'ready'` e não `=== 'loading'`, porque o `/me` só sai num
      `useEffect` e o PRIMEIRO frame de quem tem sessão é `anonymous` — em React
      18 o efeito passivo roda depois do paint, então o navegador desenharia
      aquele frame. Esse mutante sobrevive AQUI por construção: o `act()` do
      Testing Library descarrega os efeitos antes de qualquer asserção, e jsdom
      não pinta.

      Ele é decidível, e a alegação anterior deste comentário — "quem quiser
      prová-lo precisa de navegador de verdade, não de jsdom" — era FALSA:
      `renderToString` não roda efeito nenhum, ou seja, é literalmente o frame
      que o `act()` descarta. O acusador é
      `the FIRST FRAME of a session never shows the empty state`, no fim deste
      arquivo.
    */
    let release: (() => void) | undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });

    stubFetch(
      replyByUrl(
        [
          ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
          [
            '/me',
            async () => {
              await inFlight;
              return meReply({ clubs: [CASAL] });
            },
          ],
          ['/clubs/', booksReply([aBook()])],
          ['/books/', bookWithPlanReply(aBook(), [])],
        ],
        { status: 500, body: { error: 'Internal Server Error' } },
      ),
    );

    await act(async () => {
      renderPage(<App />, {
        path: '/',
        storage: memoryStorage({ ...SESSION }),
      });
      await Promise.resolve();
    });

    expect(screen.queryByText(pt.pages.home.noClubs.title)).toBeNull();
    expect(screen.queryByText(pt.pages.home.loading)).not.toBeNull();
    expectNoGuilt();

    release?.();
    await waitFor(() => {
      expect(
        screen.queryByRole('list', { name: pt.pages.home.shelf.label }),
      ).not.toBeNull();
    });
  });

  it('does not charge anybody in the empty state either (rule 16)', async () => {
    /*
      A frase natural em português para este estado é "Você não está em nenhum
      clube" — e é exatamente a que a regra 16 proíbe. Daí "Seu clube aparece
      aqui".
    */
    await renderHome({ clubs: [] });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.home.noClubs.title)).not.toBeNull();
    });
    expectNoGuilt();
  });

  it('shows no club selector when there is no club (decision F)', async () => {
    await renderHome({ clubs: [] });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.home.noClubs.title)).not.toBeNull();
    });
    // Um seletor vazio no cabeçalho seria um controle que não faz nada.
    expect(screen.queryByLabelText(pt.pages.home.clubLabel)).toBeNull();
    expectNoGuilt();
  });
});

describe('the shelf of the active club (rules 13, 14)', () => {
  it('lists the books in the order the API returned them (rule 13)', async () => {
    /*
      Mês corrente primeiro é regra de PRODUTO e vive no `listBooks` do backend
      (`compareByMonthDesc`). A tela não reordena — duas ordens seriam duas
      verdades, e a que a pessoa vê mudaria com a tela.

      A fixture é escolhida para a implementação errada FALHAR (§7.2): a ordem
      da API é o oposto da alfabética E o oposto da crescente por mês. Uma tela
      que ordenasse por qualquer um dos dois critérios acusa.
    */
    await renderHome({
      shelf: [
        booksReply([
          aBook({ id: 'b-2', title: 'Zelda e o tempo', month: currentMonth() }),
          aBook({
            id: 'b-1',
            title: 'A arte da guerra',
            month: previousMonth(),
          }),
        ]),
      ],
    });

    const list = await screen.findByRole('list', {
      name: pt.pages.home.shelf.label,
    });
    const titles = Array.from(list.querySelectorAll('li')).map((item) =>
      item.textContent?.startsWith('Zelda') === true ? 'Zelda' : 'Arte',
    );
    expect(titles).toEqual(['Zelda', 'Arte']);
    expectNoGuilt();
  });

  it('gives zero books an empty state of their own, different from zero clubs (rule 14)', async () => {
    await renderHome({ shelf: [booksReply([])] });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.home.noBooks.title)).not.toBeNull();
    });
    /*
      As DUAS metades. "A estante está vazia" e "Seu clube aparece aqui" pedem
      coisas diferentes, de pessoas diferentes: o livro é cadastrado pelo admin
      do clube, o clube é criado por quem administra o sistema. Mostrar a
      mensagem errada manda a pessoa falar com quem não pode ajudar.
    */
    expect(screen.queryByText(pt.pages.home.noClubs.title)).toBeNull();
    expectNoGuilt();
  });

  it('opens the book screen from the shelf WITHOUT reloading the PWA', async () => {
    /*
      ⚠️ **O ACUSADOR DO LINK DA ESTANTE, E ELE VIVIA NA SUÍTE DA OUTRA TELA** —
      achado da revisão da Tarefa 17. O `listItemRouterLink` nasceu exportado de
      `pages/book.tsx`, e as DUAS listas que navegam no app o usam: a estante
      daqui e o plano de lá. MEDIDO: removendo o `renderLink` **da home**, esta
      suíte ficava 23/23 verde — quem acusava (ou não) era `book.test.tsx`, num
      teste cujo nome fala do plano do livro.

      O helper mudou para `src/router-link.tsx`, um módulo que nenhuma das duas
      telas possui, e cada lista ganhou o acusador na SUA suíte.

      A observável é o ENDEREÇO depois do clique: em jsdom uma âncora crua não
      navega, então o endereço só muda se o roteador interceptou. E o `href` de
      verdade continua lá — é ele que faz Ctrl+clique e "abrir em nova aba"
      funcionarem, e é por isso que a alternativa `onClick` + `useNavigate` foi
      recusada.
    */
    const calls = await renderHome({
      shelf: [booksReply([aBook({ id: 'b-hobbit', title: 'O Hobbit' })])],
    });

    const link = await screen.findByRole('link', { name: /O Hobbit/u });
    expect(link.getAttribute('href')).toBe('/books/b-hobbit');
    expectNoGuilt();

    await act(async () => {
      fireEvent.click(link);
    });

    expect(locationText()).toBe('/books/b-hobbit');
    // E a navegação foi de APLICAÇÃO: a tela do livro montou e pediu o livro.
    await waitFor(() => {
      expect(planRequests(calls)).toContain('https://api.teste/books/b-hobbit');
    });
  });

  it('shows the club name in the header even with a single club (decision F)', async () => {
    await renderHome({});

    await waitFor(() => {
      expect(screen.queryByText(CASAL.name)).not.toBeNull();
    });
    // Com um clube só, o seletor é ruído — mas o NOME continua visível.
    expect(screen.queryByLabelText(pt.pages.home.clubLabel)).toBeNull();
    expectNoGuilt();
  });
});

describe("today's reading is a one-tap shortcut (rule 15)", () => {
  it('appears when a plan item has the date of today, and leads to the note of the day', async () => {
    const item = aPlanItem({
      id: 'p-hoje',
      date: today(),
      title: 'Cap. 3 — A promessa',
      reference: 'p. 45-62',
    });
    const calls = await renderHome({
      book: bookWithPlanReply(aBook({ id: 'b-hobbit' }), [
        aPlanItem({ id: 'p-ontem', date: otherDay() }),
        item,
      ]),
    });

    const link = await screen.findByRole('link', {
      name: new RegExp(pt.pages.home.today.write, 'u'),
    });
    // O tema do dia está no atalho: é ele que faz a anotação já nascer com
    // assunto ("o livro é do grupo"), e é o que a pessoa lê antes de tocar.
    expect(link.textContent).toContain('Cap. 3 — A promessa');
    expect(link.textContent).toContain('p. 45-62');
    /*
      ⚠️ **A VARREDURA ANTES DO CLIQUE, e a ordem é o teste.** MEDIDO: com ela
      no fim do teste, ela varria a tela da ANOTAÇÃO — a home já tinha sido
      desmontada pela navegação —, e uma cobrança plantada ao lado da leitura de
      hoje passava por este arquivo sem um vermelho. É o estado onde um "você
      deixou 3 dias para trás" nasceria, e era o único que a varredura não
      visitava.
    */
    expectNoGuiltWithPlanPosition();

    await act(async () => {
      fireEvent.click(link);
    });

    // A rota da anotação do dia (placeholder da Tarefa 18) — não a home, e não
    // uma tela de "não encontrado".
    expect(locationText()).toBe('/books/b-hobbit/days/p-hoje');
    expect(
      screen.queryByRole('heading', { name: pt.pages.dayNote.title }),
    ).not.toBeNull();
    /*
      ⚠️ **OS NOMES DOS PARÂMETROS DA ROTA, e eles não eram provados.** MEDIDO:
      trocar `'/books/:bookId/days/:planItemId'` por
      `'/books/:planItemId/days/:bookId'` sobrevivia aos 192 testes, porque o
      placeholder nunca chamava `useParams` — o endereço casava e a tela
      aparecia.

      Com a tela de verdade (Tarefa 18), a observável é o que ela FAZ com cada
      segmento: o primeiro vira `GET /books/:bookId` e o segundo vira o filtro
      `planItemId` do `listNotes`. Trocados, a tela pediria `/books/p-hoje` e
      filtraria as anotações por `b-hobbit`.
    */
    await waitFor(() => {
      expect(requestsTo(calls, '/notes?')).toHaveLength(1);
    });
    expect(planRequests(calls).at(-1)).toBe('https://api.teste/books/b-hobbit');
    expect(planRequests(calls)).not.toContain('https://api.teste/books/p-hoje');
    expect(
      requestsTo(calls, '/notes?').map((call) =>
        new URL(call.url).searchParams.get('planItemId'),
      ),
    ).toEqual(['p-hoje']);
  });

  it('reads today in the TIME ZONE of whoever is looking, not in UTC', async () => {
    /*
      ⚠️ **O ELO `localDay` ↔ ATALHO, PINADO DE FORMA DETERMINÍSTICA** — o par
      do teste de mesmo nome em `book.test.tsx`, e o §7.10 aplicado: o
      `vitest.config.ts` FIXA `TZ=America/Sao_Paulo` e este teste CONGELA o
      relógio, então "o dia em UTC" e "o dia de quem olha" divergem por
      construção — às 02:00 UTC do dia 5, em UTC−3 ainda são 23:00 do dia 4.

      MEDIDO antes do pino: trocar a home por
      `new Date().toISOString().slice(0, 10)` sobrevivia à suíte, e o vermelho
      dependia da hora em que ela rodasse.

      `toFake: ['Date']` e não os timers inteiros: o `findByRole` precisa de
      `setTimeout` de verdade.
    */
    expect(process.env['TZ']).toBe('America/Sao_Paulo');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-05T02:00:00Z'));

    try {
      // A precondição pinada (§7.8): as duas contas dão dias DIFERENTES.
      expect(new Date().toISOString().slice(0, 10)).toBe('2026-09-05');
      expect(localDay(new Date(), localTimeZone())).toBe('2026-09-04');

      await renderHome({
        book: bookWithPlanReply(aBook({ id: 'b-hobbit' }), [
          aPlanItem({
            id: 'p-vespera',
            date: '2026-09-04',
            title: 'A vespera',
          }),
          aPlanItem({
            id: 'p-seguinte',
            date: '2026-09-05',
            title: 'O dia seguinte',
          }),
        ]),
      });

      const link = await screen.findByRole('link', {
        name: new RegExp(pt.pages.home.today.write, 'u'),
      });
      // O trecho de quem OLHA é o do dia 4. Uma home que lesse o dia em UTC
      // ofereceria o do dia 5 — o de amanhã, para quem está escrevendo.
      expect(link.textContent).toContain('A vespera');
      expect(link.getAttribute('href')).toBe('/books/b-hobbit/days/p-vespera');
      expectNoGuiltWithPlanPosition();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not lose the shortcut when a book of a FUTURE month is at the front of the shelf', async () => {
    /*
      ⚠️ **O BUG DE PRODUTO QUE ESTA RODADA CONSERTOU, e ele estava VIVO.**

      A spec afirmava que o `listBooks` põe "o mês corrente primeiro". Não põe:
      ele ordena `month` DESCENDENTE, então o livro do mês que vem — cadastrado
      adiantado, que é como um clube funciona — vem na frente. A home pedia o
      plano dele, não achava hoje, e o atalho SUMIA.

      Nenhum teste pegava porque todo fixture do atalho tinha UM livro e nenhum
      mês futuro. Este é o par que faltava.
    */
    const calls = await renderHome({
      shelf: [
        booksReply([
          aBook({
            id: 'b-futuro',
            title: 'O livro do mês que vem',
            month: futureMonth(),
          }),
          aBook({
            id: 'b-agora',
            title: 'O livro de agora',
            month: currentMonth(),
          }),
        ]),
      ],
      book: bookRepliesById({
        'b-futuro': bookWithPlanReply(aBook({ id: 'b-futuro' }), [
          aPlanItem({ id: 'p-futuro', bookId: 'b-futuro', date: otherDay() }),
        ]),
        'b-agora': bookWithPlanReply(aBook({ id: 'b-agora' }), [
          aPlanItem({ id: 'p-hoje', bookId: 'b-agora', date: today() }),
        ]),
      }),
    });

    const link = await screen.findByRole('link', {
      name: new RegExp(pt.pages.home.today.write, 'u'),
    });
    expect(link.getAttribute('href')).toBe('/books/b-agora/days/p-hoje');
    // E o livro futuro não é perguntado: ele não é "o livro de agora", e pedir
    // o plano dele é gastar a metade do orçamento com quem não pode responder.
    expect(planRequests(calls)).toEqual(['https://api.teste/books/b-agora']);
    expectNoGuiltWithPlanPosition();
  });

  it('asks the NEXT book when the first non-future one has no reading today', async () => {
    /*
      Três casos medidos caem aqui, e "o primeiro não futuro" sozinho erra nos
      três: plano de setembro que se estende até outubro; dois livros no mesmo
      mês; e este — o livro do mês corrente SEM plano mascarando o anterior, que
      cobre hoje.

      O fixture é escolhido para a implementação de uma requisição só FALHAR
      (§7.2): o item de hoje está no SEGUNDO.
    */
    const calls = await renderHome({
      shelf: [
        booksReply([
          aBook({
            id: 'b-corrente',
            title: 'O livro do mês, ainda sem plano',
            month: currentMonth(),
          }),
          aBook({
            id: 'b-anterior',
            title: 'O livro que ainda está correndo',
            month: previousMonth(),
          }),
        ]),
      ],
      book: bookRepliesById({
        'b-corrente': bookWithPlanReply(aBook({ id: 'b-corrente' }), []),
        'b-anterior': bookWithPlanReply(aBook({ id: 'b-anterior' }), [
          aPlanItem({ id: 'p-hoje', bookId: 'b-anterior', date: today() }),
        ]),
      }),
    });

    const link = await screen.findByRole('link', {
      name: new RegExp(pt.pages.home.today.write, 'u'),
    });
    expect(link.getAttribute('href')).toBe('/books/b-anterior/days/p-hoje');
    // As DUAS requisições, na ordem: a segunda só sai porque a primeira não
    // tinha hoje.
    expect(planRequests(calls)).toEqual([
      'https://api.teste/books/b-corrente',
      'https://api.teste/books/b-anterior',
    ]);
    expectNoGuiltWithPlanPosition();
  });

  it('spends only ONE request when the first non-future book already has today (decision E)', async () => {
    const calls = await renderHome({
      shelf: [
        booksReply([
          aBook({ id: 'b-corrente', month: currentMonth() }),
          aBook({ id: 'b-anterior', month: previousMonth() }),
        ]),
      ],
      book: bookRepliesById({
        'b-corrente': bookWithPlanReply(aBook({ id: 'b-corrente' }), [
          aPlanItem({ id: 'p-hoje', bookId: 'b-corrente', date: today() }),
        ]),
        'b-anterior': bookWithPlanReply(aBook({ id: 'b-anterior' }), [
          aPlanItem({ id: 'p-outro', bookId: 'b-anterior', date: today() }),
        ]),
      }),
    });

    await screen.findByRole('link', {
      name: new RegExp(pt.pages.home.today.write, 'u'),
    });
    // A segunda requisição é CONDICIONAL, e é ela que mantém o custo em uma no
    // caso comum.
    expect(planRequests(calls)).toEqual(['https://api.teste/books/b-corrente']);
    expectNoGuiltWithPlanPosition();
  });

  it('never asks for more than TWO plans, however long the shelf is (decision E)', async () => {
    /*
      O orçamento. Buscar o plano de todos seria N requisições para um atalho —
      e com trinta livros na estante seria a home inteira travada por um link.
    */
    const calls = await renderHome({
      shelf: [
        booksReply([
          aBook({ id: 'b-1', month: currentMonth() }),
          aBook({ id: 'b-2', month: previousMonth() }),
          aBook({ id: 'b-3', month: monthShifted(-2) }),
          aBook({ id: 'b-4', month: monthShifted(-3) }),
        ]),
      ],
      book: bookRepliesById({
        'b-1': bookWithPlanReply(aBook({ id: 'b-1' }), []),
        'b-2': bookWithPlanReply(aBook({ id: 'b-2' }), []),
        'b-3': bookWithPlanReply(aBook({ id: 'b-3' }), []),
        'b-4': bookWithPlanReply(aBook({ id: 'b-4' }), []),
      }),
    });

    await waitFor(() => {
      expect(planRequests(calls)).toHaveLength(2);
    });
    expect(planRequests(calls)).toEqual([
      'https://api.teste/books/b-1',
      'https://api.teste/books/b-2',
    ]);
    expect(screen.queryByText(pt.pages.home.today.write)).toBeNull();
    expectNoGuilt();
  });

  it('shows the shelf, and no shortcut, when EVERY book is of a future month', async () => {
    /*
      O fallback que importa: uma estante de livros só futuros não pode virar
      tela vazia. Ela aparece — e o atalho não, porque não há trecho de hoje.
      Sem atalho a home não cobra nada (regra 16), então "não sei qual é o livro
      de agora" é um estado silencioso, não um erro.
    */
    const calls = await renderHome({
      shelf: [
        booksReply([
          aBook({
            id: 'b-futuro',
            title: 'O livro de novembro',
            month: monthShifted(2),
          }),
          aBook({
            id: 'b-quase',
            title: 'O livro de outubro',
            month: futureMonth(),
          }),
        ]),
      ],
    });

    const list = await screen.findByRole('list', {
      name: pt.pages.home.shelf.label,
    });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(screen.queryByText(pt.pages.home.today.write)).toBeNull();
    // E nenhum plano é pedido: não há livro de agora a perguntar.
    expect(planRequests(calls)).toEqual([]);
    // Nem o estado vazio da estante: os livros ESTÃO lá.
    expect(screen.queryByText(pt.pages.home.noBooks.title)).toBeNull();
    expectNoGuilt();
  });

  it('shows no shortcut when the plan is empty', async () => {
    await renderHome({ book: bookWithPlanReply(aBook(), []) });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.home.shelf.heading)).not.toBeNull();
    });
    expect(screen.queryByText(pt.pages.home.today.write)).toBeNull();
    expectNoGuilt();
  });

  it('shows no shortcut when the plan of the first book cannot be read', async () => {
    /*
      Silêncio de propósito: o plano alimenta o ATALHO. Se ele não vem, o atalho
      não aparece — e a estante, que veio, continua na tela. Um segundo alerta
      vermelho por causa de um atalho seria a tela cobrando por uma falha nossa.
    */
    await renderHome({ book: { status: 500, body: { error: 'Boom' } } });

    const list = await screen.findByRole('list', {
      name: pt.pages.home.shelf.label,
    });
    expect(list.querySelectorAll('li')).toHaveLength(1);
    expect(screen.queryByText(pt.pages.home.today.write)).toBeNull();
    expect(readableText()).not.toContain('Boom');
    expectNoGuilt();
  });
});

describe('⚠️ WITHOUT A READING TODAY, THE HOME CHARGES NOTHING (rule 16)', () => {
  it('says nothing about the days that went by, in text or in attributes', async () => {
    /*
      ⚠️ O CORAÇÃO DA FATIA. O plano existe, tem trinta dias, e NENHUM é hoje —
      é o estado de quem parou de ler há duas semanas, que é o caso realista do
      §1 ("atraso é normal; o app existe para retomar, não para cobrar").

      A tela não pode dizer "você está atrasado", nem "faltam 3 dias", nem
      mostrar badge de pendência, nem vermelho de atraso. E não pode CONTAR: um
      "0 de 30 dias" é a dívida escrita em números.
    */
    await renderHome({
      book: bookWithPlanReply(
        aBook({ title: 'O Hobbit' }),
        Array.from({ length: 30 }, (_, index) =>
          aPlanItem({
            id: `p-${String(index)}`,
            order: index + 1,
            date: `2026-01-${String(index + 1).padStart(2, '0')}`,
          }),
        ),
      ),
    });

    // ⚠️ A GUARDA CONTRA A VARREDURA VAZIA (§7.4): sem esta linha, uma home que
    // não renderizasse NADA passaria em todos os `not.toContain` abaixo — e o
    // teste diria "a home não cobra" provando "a home não existe".
    await waitFor(() => {
      expect(screen.queryByText('O Hobbit')).not.toBeNull();
    });
    expect(homeIsUp()).toBe(true);
    expect(screen.queryByText(pt.pages.home.today.write)).toBeNull();

    expectNoGuilt();
  });

  it('keeps the danger colour out of the SOURCE FILES of the home, not only out of the states rendered here', () => {
    /*
      ⚠️ O NOME ANTERIOR ERA "has no danger colour anywhere on the home, in ANY
      state", E ELE MENTIA: este teste não renderiza estado nenhum — ele lê o
      arquivo-fonte e procura duas strings. A auditoria mostrou o que o nome
      prometia e o teste não entregava (a cor por valor arbitrário, e os estados
      não varridos), e a promessa foi movida para onde ela é cumprida: a
      `expectNoGuilt` roda em TODOS os estados desta suíte, inclusive no estado
      com atalho.

      O que ESTE teste é: a rede contra a cor voltar por um estado que ninguém
      pensou em renderizar.

      ⚠️ **E ELE VARRE OS DOIS ARQUIVOS DESDE A TAREFA 35 (regra 11).** A home
      deixou de ser "um arquivo só" quando o feed foi para
      `activity-feed.tsx` — e é justamente lá que mora o caminho de ERRO ("não
      foi possível carregar a atividade"), que é o lugar mais natural do mundo
      para alguém pintar de vermelho. Esta varredura é **por nome de arquivo**
      (as do ADR 0002 — termos e desenho — são recursivas e pegariam o arquivo
      novo de graça), então ela é a que precisa ser estendida à mão: é a forma
      de "guarda no lugar errado" do §7.9 nascendo de um `split`, e foi
      exatamente o que a Tarefa 32b mediu no `reading-marks.tsx`.
    */
    // `process.cwd()` e não `import.meta.url`: no ambiente jsdom do vitest a
    // `import.meta.url` não é uma URL `file:`, e o `fileURLToPath` recusa. É o
    // mesmo caminho que o `ui-source-scan.test.ts` usa.
    function pageSource(file: string): string {
      return stripComments(
        readFileSync(resolve(process.cwd(), 'src', 'pages', file), 'utf8'),
      );
    }

    for (const file of ['home.tsx', 'activity-feed.tsx']) {
      expect(pageSource(file)).not.toMatch(DANGER_STYLE);
    }

    // E o lado positivo do par: os arquivos lidos são os certos (um caminho
    // errado lançaria, mas um arquivo VAZIO passaria calado — a asserção vazia
    // do §7.4 escrita como varredura de fonte).
    expect(pageSource('home.tsx')).toContain('pages.home.today.write');
    expect(pageSource('activity-feed.tsx')).toContain('pages.home.feed.failed');
  });
});

describe('the home when the club or the network goes away (rules 17, 18, 19)', () => {
  it('handles a 404 on the shelf without a blank screen, with its own words (rule 17)', async () => {
    /*
      O membership sumiu entre o `/me` e a listagem — arquivado no MVP 4, ou uma
      aba aberta desde ontem. O corte de tenant do projeto é 404, não 403
      (`CLAUDE.md`): o clube "não existe" para quem não é membro.
    */
    await renderHome({
      shelf: [{ status: 404, body: { error: 'Not found' } }],
    });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.home.clubUnavailable)).not.toBeNull();
    });
    expect(homeIsUp()).toBe(true);
    // Frase PRÓPRIA, não o genérico de 404 ("Não encontramos o que você
    // procurava"), que não diz o quê — e aqui o "o quê" é o clube inteiro.
    expect(readableText()).not.toContain(pt.errors.notFound);
    // E nada da API na tela (regra 19), atributos incluídos.
    expect(readableText()).not.toContain('Not found');
    // Retentar um 404 é pedir outra vez a mesma negativa: o membership não
    // volta porque alguém apertou um botão.
    expect(
      screen.queryByRole('button', { name: pt.pages.home.retry }),
    ).toBeNull();
    expectNoGuilt();
  });

  it('offers to repeat a network failure, and the repeat REDOES the request (rule 18)', async () => {
    const calls = await renderHome({
      shelf: [{ status: 0, offline: true }, booksReply([aBook()])],
    });

    await waitFor(() => {
      expect(screen.queryByText(pt.errors.network)).not.toBeNull();
    });
    expect(homeIsUp()).toBe(true);
    expect(shelfRequests(calls)).toHaveLength(1);

    const retry = screen.getByRole('button', { name: pt.pages.home.retry });
    await act(async () => {
      fireEvent.click(retry);
    });

    await waitFor(() => {
      // ⚠️ A METADE QUE IMPORTA: repetir REFAZ a requisição. Um botão que só
      // limpasse a mensagem deixaria a pessoa olhando uma tela vazia achando
      // que tentou.
      expect(shelfRequests(calls)).toHaveLength(2);
    });
    await waitFor(() => {
      expect(screen.queryByText(pt.errors.network)).toBeNull();
    });
    expect(
      screen.queryByRole('list', { name: pt.pages.home.shelf.label }),
    ).not.toBeNull();
    expectNoGuilt();
  });

  it('offers to repeat a /me that failed, and the repeat REDOES it', async () => {
    /*
      A outra ponta da mesma regra: se o `/me` não vem, não há clube ativo nem
      estante — e a home ficaria em "carregando" para sempre. A `reload` do
      contexto é a ação de repetir.
    */
    let meCall = 0;
    const calls = stubFetch(
      replyByUrl(
        [
          ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
          [
            '/me',
            () => {
              meCall += 1;
              return meCall === 1
                ? { status: 0, offline: true }
                : meReply({ clubs: [CASAL] });
            },
          ],
          ['/clubs/', booksReply([aBook()])],
          ['/books/', bookWithPlanReply(aBook(), [])],
        ],
        { status: 500, body: { error: 'Internal Server Error' } },
      ),
    );

    await act(async () => {
      renderPage(<App />, {
        path: '/',
        storage: memoryStorage({ ...SESSION }),
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByText(pt.errors.network)).not.toBeNull();
    });
    expect(homeIsUp()).toBe(true);

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: pt.pages.home.retry }),
      );
    });

    await waitFor(() => {
      expect(meRequests(calls)).toHaveLength(2);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('list', { name: pt.pages.home.shelf.label }),
      ).not.toBeNull();
    });
    expectNoGuilt();
  });

  it('never puts a word the API wrote on the screen, attributes included (rule 19)', async () => {
    /*
      ⚠️ ATRIBUTO TAMBÉM É TELA. A Tarefa 15 mediu que texto da API em `title`
      ou `aria-label` passava por um teste que lia só `textContent` — e o
      `aria-label` é justamente o que o leitor de tela FALA. A `readableText()`
      do harness varre a união: texto + `title`/`aria-label`/`placeholder`/
      `alt`/`value`/`aria-valuetext`.

      A mensagem do fixture é a que o backend manda de verdade na classe 400
      (§6.2: `error.message` cru da usecase).
    */
    await renderHome({
      shelf: [
        {
          status: 400,
          body: { error: 'clubId must be a non-empty string' },
        },
      ],
    });

    await waitFor(() => {
      expect(screen.queryByText(pt.errors.badRequest)).not.toBeNull();
    });
    expect(readableText()).not.toContain('clubId must be a non-empty string');
    expect(homeIsUp()).toBe(true);
    expectNoGuilt();
  });
});

describe('switching club is a RACE, and the guard is not decoration', () => {
  it('keeps the shelf of the club that was chosen LAST, even when the old answer arrives after', async () => {
    /*
      ⚠️ **MEDIDO: remover as duas linhas `if (cancelled) return` do efeito da
      estante passava nos 192 testes.** A propriedade estava certa e invisível.

      A corrida é real e é do celular: a pessoa abre o app no metrô, o `GET
      /clubs/A/books` fica pendurado, ela troca de clube, a estante de B chega e
      aparece — e então a resposta de A volta. Sem o guard, o `setShelf` da
      resposta VELHA substitui a nova: a tela mostra os livros do clube A com o
      seletor marcando B, e nada mais reescreve aquilo até a próxima troca.

      O fixture é escolhido para a implementação errada FALHAR (§7.2): os
      títulos dos dois clubes são distintos, e a asserção final é sobre os DOIS
      lados (o de B está, o de A não está) — só "o de B está" passaria numa tela
      que mostrasse os dois.

      (O mecanismo é a flag `cancelled`, e não `AbortController`: o `stubFetch`
      deste harness ignora `init.signal`, então um teste de aborto seria falso
      verde. Está registrado no docblock do `stubFetch`.)
    */
    let releaseA: (() => void) | undefined;
    const answerOfA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    const calls = stubFetch(
      replyByUrl(
        [
          ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
          ['/me', meReply({ clubs: [...TWO_CLUBS] })],
          [
            '/clubs/',
            async (request) => {
              if (request.url.includes('c-casal')) {
                // A resposta do clube A fica PENDURADA — é o único jeito de
                // fazer as duas chegarem fora de ordem.
                await answerOfA;
                return booksReply([
                  aBook({ id: 'b-do-a', title: 'O livro do clube A' }),
                ]);
              }
              return booksReply([
                aBook({ id: 'b-do-b', title: 'O livro do clube B' }),
              ]);
            },
          ],
          ['/books/', bookWithPlanReply(aBook(), [])],
        ],
        { status: 500, body: { error: 'Internal Server Error' } },
      ),
    );

    await act(async () => {
      renderPage(<App />, {
        path: '/',
        storage: memoryStorage({ ...SESSION }),
      });
      await Promise.resolve();
    });

    /*
      A estante de A foi pedida e está no ar.

      ⚠️ `shelfRequests` e não `requestsTo(calls, '/clubs/')`: desde a Tarefa 35
      aquele fragmento conta TRÊS endereços (`/books`, `/activity`, `/members`),
      e o `waitFor` resolvia no primeiro instante em que o total era 1 — antes
      de o feed sair. A asserção continuava verde e tinha deixado de descrever a
      verdade; é o mesmo diagnóstico do docblock do `shelfRequests`.
    */
    await waitFor(() => {
      expect(shelfRequests(calls)).toHaveLength(1);
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(pt.pages.home.clubLabel), {
        target: { value: 'c-amigos' },
      });
    });

    await waitFor(() => {
      expect(screen.queryByText('O livro do clube B')).not.toBeNull();
    });

    // E SÓ AGORA a resposta velha volta.
    await act(async () => {
      releaseA?.();
      await answerOfA;
    });

    await waitFor(() => {
      expect(screen.queryByText('O livro do clube B')).not.toBeNull();
    });
    // A metade que decide: a estante do clube velho NÃO substituiu a nova.
    expect(screen.queryByText('O livro do clube A')).toBeNull();
    expectNoGuilt();
  });
});

/**
 * ⚠️ **O FEED DE ATIVIDADE — a fatia mais perigosa do MVP para o §1 do plano.**
 *
 * Um feed é, por construção, uma superfície de **comparação**: quem fez mais
 * aparece mais. `docs/ACEITE-MVP.md` (MVP 3, pergunta 1, respondida pelo dono)
 * decide que atividade é **presença, não placar**, e é isso que estes testes
 * cobram — com a `expectNoGuilt` em TODOS os estados novos (regra 10), que já
 * embute a varredura de privacidade do ADR 0002 e por isso NÃO é chamada duas
 * vezes.
 */
describe('the activity feed of the club (rules 1 to 10)', () => {
  /** A lista do feed, pelo nome que o leitor de tela ouve. */
  function feedList(): HTMLElement | null {
    return screen.queryByRole('list', { name: pt.pages.home.feed.label });
  }

  function feedLines(): string[] {
    const list = feedList();
    if (list === null) return [];
    return Array.from(list.querySelectorAll('li')).map(
      (item) => item.textContent ?? '',
    );
  }

  function feedHrefs(): Array<string | null> {
    const list = feedList();
    if (list === null) return [];
    return Array.from(list.querySelectorAll('a')).map((link) =>
      link.getAttribute('href'),
    );
  }

  /**
   * ⚠️ **A SEÇÃO INTEIRA DO FEED — cabeçalho incluído.**
   *
   * MEDIDO na rodada de correção: a guarda de dígito varria só o `<ul>`, e um
   * `"O que aconteceu por aqui 3 atividades"` no `<h2>` — o placar no lugar
   * mais visível da seção — passava pela `GUILT_TERMS`, pela `COUNTER_SHAPE` e
   * pela guarda, com **0 acusadores em 662 testes**. O escopo é a `<section>`,
   * que é a unidade que a decisão A protege.
   */
  function feedSection(): HTMLElement {
    /*
      ⚠️ **`includes` E NÃO IGUALDADE DE TEXTO, e a diferença foi medida.** Com
      um `getByText(heading)` exato, o mutante que acrescenta " 3 atividades" ao
      cabeçalho fica vermelho pelo motivo ERRADO ("Unable to find an element
      with the text") — o teste acusa a query que quebrou, não o placar que
      entrou. Com o `includes`, a seção é achada e o dígito cai na varredura,
      que é o vermelho que descreve o defeito.
    */
    const heading = screen.getByText(
      (_content, element) =>
        element?.tagName === 'H2' &&
        (element.textContent ?? '').includes(pt.pages.home.feed.heading),
    );
    const section = heading.closest('section');
    if (section === null) throw new Error('a seção do feed não está na tela');
    return section;
  }

  /**
   * Os pedaços LITERAIS de uma frase do catálogo, sem os buracos de
   * interpolação — `'{{name}} grifou um trecho de {{book}}'` vira
   * `['grifou um trecho de']`.
   *
   * ⚠️ Ele existe para o valor esperado sair do CATÁLOGO e não de uma cópia
   * escrita à mão aqui: uma frase corrigida no `pt.ts` que esquecesse este
   * arquivo deixaria o teste vermelho, que é o que se quer — e uma cópia
   * deixaria os dois textos divergirem em silêncio (lição nº 3 do MVP 1).
   */
  function saidBy(template: string): string {
    const pieces = template
      .split(/\{\{\w+\}\}/u)
      .map((piece) => piece.trim())
      .filter((piece) => piece !== '');
    const first = pieces[0];
    if (first === undefined) throw new Error(`frase sem texto: ${template}`);
    return first;
  }

  /**
   * ⚠️ **A FRASE INTEIRA, com os buracos preenchidos — e ela existe porque o
   * `saidBy` NÃO distingue duas frases quando uma começa dentro da outra.**
   *
   * Medido sobre o catálogo real, na rodada de correção da Tarefa 38e:
   *
   * ```
   * saidBy(read)        = "leu um dia de"
   * saidBy(readOnTheme) = "leu"          ← substring da de cima
   * ```
   *
   * Ou seja: `expect(linha).toContain(saidBy(readOnTheme))` afirmava só *"a
   * linha tem a palavra leu"*, e sobrevivia ao mutante que ela nomeia (medido:
   * a tela obrigada a nunca escolher a frase com tema do `READ`, com as linhas
   * companheiras de `THEME` removidas como sonda, deixava `home.test.tsx`
   * **50/50 verde**).
   *
   * ⚠️ **E o pior era o lado NEGATIVO:** `not.toContain(saidBy(readOnTheme))`
   * era, na prática, `not.toContain('leu')` — uma asserção que ficaria vermelha
   * **com o código certo** no dia em que o fixture ganhasse um `READ` sem tema,
   * que é exatamente o caso que aquele teste existe para cobrir. (Ele ganhou,
   * nesta mesma rodada.)
   *
   * O valor esperado continua saindo do CATÁLOGO, nunca de uma cópia escrita à
   * mão: uma frase corrigida no `pt.ts` deixa o teste vermelho, que é o que se
   * quer. O que muda é que agora ele compara a frase toda.
   */
  function lineOf(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/gu, (_hole, key: string) => {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`frase sem valor para {{${key}}}: ${template}`);
      }
      return value;
    });
  }

  /** A estante que dá NOME ao livro de cada linha (medição 1 da spec). */
  function shelfOfTheFeed(): readonly Reply[] {
    return [
      booksReply([
        aBook({ id: 'b-hobbit', title: 'O Hobbit', month: currentMonth() }),
      ]),
    ];
  }

  async function renderFeed(setup: HomeSetup = {}): Promise<RecordedRequest[]> {
    const calls = await renderHome({ shelf: shelfOfTheFeed(), ...setup });
    return calls;
  }

  it('⚠️ keeps the order the API returned, and groups NOBODY (rules 1, 5 and decision B)', async () => {
    /*
      ⚠️ **AGRUPAR POR PESSOA *É* O PLACAR** (decisão B). O fixture é escolhido
      para as duas implementações erradas FALHAREM (§7.2): as duas linhas da
      Maria estão SEPARADAS pela minha (então agrupar por autor as juntaria), e
      a ordem da API é do mais recente para trás (então reordenar por
      `createdAt` crescente a inverteria).
    */
    await renderFeed({
      activity: {
        status: 200,
        body: [
          anActivity({ id: 'a-1', userId: MARIA, type: 'HIGHLIGHT' }),
          anActivity({
            id: 'a-2',
            userId: ME_ID,
            type: 'FREE_NOTE',
            subjectId: 'n-2',
            createdAt: agoMs(DAY),
          }),
          anActivity({
            id: 'a-3',
            userId: MARIA,
            type: 'READ',
            planItemId: 'p-hoje',
            subjectId: 'log-3',
            createdAt: agoMs(2 * DAY),
          }),
        ],
      },
    });

    await waitFor(() => {
      expect(feedLines()).toHaveLength(3);
    });

    const lines = feedLines();
    expect(lines[0]).toContain(saidBy(pt.pages.home.feed.highlight));
    expect(lines[1]).toContain(saidBy(pt.pages.home.feed.freeNote));
    expect(lines[2]).toContain(saidBy(pt.pages.home.feed.read));
    // E as duas da Maria continuam em linhas próprias, separadas pela minha:
    // uma linha "Maria · 2 atividades" é exatamente o placar que não existe.
    expect(lines[0]).toContain('Maria');
    expect(lines[2]).toContain('Maria');
    expect(lines[1]).toContain(pt.pages.acervo.item.author.you);

    expectNoGuilt();
  });

  it('⚠️ adds NO NUMBER OF ITS OWN to the feed section — every digit on it comes from data (rule 5)', async () => {
    /*
      ⚠️ **O NOME MUDOU PORQUE A PROPRIEDADE MUDOU, e as duas versões anteriores
      estavam erradas de maneiras opostas.**

      A primeira varria só o `<ul>` e exigia ZERO dígito. Ela tinha um furo e um
      falso positivo, os dois MEDIDOS na rodada de correção:

      - **furo:** `"O que aconteceu por aqui 3 atividades"` no `<h2>` — o placar
        no lugar mais visível da seção — dava **0 acusadores em 662 testes**. A
        `GUILT_TERMS` não tem "atividades", a `COUNTER_SHAPE` não casa "3
        atividades" (é o furo já medido no MVP 3 com "12 dias lidos"), e o
        escopo `list.textContent` não chega ao cabeçalho;
      - **falso positivo garantido em produção:** um livro chamado
        `"O Hobbit 1984"` ficava VERMELHO sem placar nenhum na tela, e os
        instantes realistas também ("há 2 horas", "há 3 dias"). O verde só
        existia porque o fixture caía nas três faixas em que o `numeric:'auto'`
        escreve palavra. É a lição nº 4 do MVP 1 — o teste mandando no produto —
        e o §7.9 (o NOME do teste é parte da guarda: aquele prometia mais do que
        a propriedade tinha).

      A propriedade honesta é: **a tela não acrescenta número nenhum**. Então o
      escopo é a `<section>` inteira, e o que vem de DADO é redigido antes da
      varredura — título do livro, rótulo de autor e o "quando".

      ⚠️ **E OS VALORES REDIGIDOS SÃO ESCRITOS À MÃO, nunca calculados pelo
      código sob teste (§7.8).** Se o "quando" fosse redigido chamando o
      `formatActivityMoment`, um mutante que grudasse "+3" nele sairia junto na
      redação e o teste ficaria verde. Aqui os três instantes são escolhidos
      para cair em três degraus distintos da escada, e as três frases estão
      escritas abaixo — um texto que a tela produza a MAIS sobrevive à redação.
    */
    const BOOK_WITH_A_DIGIT = 'O Hobbit 1984';
    /* O tema de um dia real TEM dígito — "Cap. 3" é o exemplo do §1 do plano. */
    const THEME_WITH_A_DIGIT = 'Cap. 3 — A promessa';

    await renderFeed({
      shelf: [
        booksReply([
          aBook({
            id: 'b-hobbit',
            title: BOOK_WITH_A_DIGIT,
            month: currentMonth(),
          }),
        ]),
      ],
      activity: {
        status: 200,
        body: [
          anActivity({ id: 'a-1', userId: MARIA, createdAt: agoMs(2 * HOUR) }),
          anActivity({ id: 'a-2', userId: MARIA, createdAt: agoMs(3 * DAY) }),
          /*
            ⚠️ **A LINHA COM TEMA ENTRA NA VARREDURA, e o tema É DADO** (regra 7
            da Tarefa 38e): quem digita "Cap. 3" é o admin do clube, não nós. Ele
            é redigido junto com o título do livro e o rótulo de autor — e é a
            frase COM tema que fica exposta ao `not.toMatch(/\d/u)` abaixo.
          */
          anActivity({
            id: 'a-3',
            userId: ME_ID,
            type: 'PLAN_NOTE',
            planItemId: 'p-hoje',
            planItemTitle: THEME_WITH_A_DIGIT,
            subjectId: 'n-3',
            createdAt: agoMs(10 * DAY),
          }),
        ],
      },
    });

    await waitFor(() => {
      expect(feedLines()).toHaveLength(3);
    });

    const text = feedSection().textContent ?? '';

    /** O que vem de DADO — e cada um deles TEM dígito ou pode ter. */
    const fromData = [
      BOOK_WITH_A_DIGIT,
      THEME_WITH_A_DIGIT,
      'Maria',
      pt.pages.acervo.item.author.you,
      // Os três degraus: hora, dia e semana. Escritos à mão.
      'há 2 horas',
      'há 3 dias',
      'semana passada',
    ];

    /*
      A precondição do par (§7.4): cada valor está MESMO na tela. Sem ela, uma
      seção vazia — ou uma redação que não casasse nada — deixaria a asserção
      final verde provando nada.
    */
    for (const value of fromData) expect(text).toContain(value);

    let mine = text;
    for (const value of fromData) mine = mine.split(value).join(' ');

    // ⚠️ O que sobrou é o que a TELA escreveu: cabeçalho e frases. Nada disso
    // pode ter número — nem "3 atividades", nem "+2", nem "12 de 30".
    expect(mine).not.toMatch(/\d/u);

    expectNoGuilt();
  });

  it('says WHO, WHAT, in which BOOK and WHEN, with "Você" for the actor (rules 2, 3 and decision H)', async () => {
    await renderFeed({
      activity: {
        status: 200,
        body: [
          anActivity({
            id: 'a-1',
            userId: MARIA,
            type: 'HIGHLIGHT',
            createdAt: agoMs(2 * HOUR),
          }),
          anActivity({
            id: 'a-2',
            userId: ME_ID,
            type: 'PLAN_NOTE',
            planItemId: 'p-hoje',
            subjectId: 'n-2',
            createdAt: agoMs(3 * HOUR),
          }),
        ],
      },
    });

    await waitFor(() => {
      expect(feedLines()).toHaveLength(2);
    });

    const [dela, minha] = feedLines();
    // Quem, o quê, em que livro, e quando.
    expect(dela).toContain('Maria');
    expect(dela).toContain(saidBy(pt.pages.home.feed.highlight));
    expect(dela).toContain('O Hobbit');
    expect(dela).toContain('há 2 horas');
    /*
      ⚠️ **EU SOU "VOCÊ", E NÃO O MEU NOME** (decisão H, e é o comportamento do
      acervo e da busca, pelo MESMO vocabulário). Uma frase dizendo o próprio
      nome na terceira pessoa é estranha e, num feed, soa a registro de ponto.
      As duas metades: a palavra está, e o nome NÃO está.
    */
    expect(minha).toContain(pt.pages.acervo.item.author.you);
    expect(minha).not.toContain('Marcos');

    expectNoGuilt();
  });

  /**
   * ⚠️ **O TEMA DO DIA NA LINHA (Tarefa 38e)** — a resposta do dono à pergunta
   * que a Tarefa 35 registrou sem decidir: *"quero o tema do dia na linha"*.
   *
   * ⚠️ **O TÍTULO É CONTEÚDO DO USUÁRIO** (regra 7): quem o digita é o admin do
   * clube. Ele não é uma frase nossa e por isso **não** é alimentado às guardas
   * de vocabulário — a `expectNoGuilt()` e a varredura de dígito continuam
   * medindo as NOSSAS frases, com as fixtures delas. Aqui o tema é escolhido
   * como um tema real seria, e o que os testes afirmam é que ele **aparece**.
   */
  describe('the theme of the day on the line (task 38e)', () => {
    const THEME = 'A promessa antiga';

    it('⚠️ says the theme when the event has one, for the day note and for the read', async () => {
      await renderFeed({
        activity: {
          status: 200,
          body: [
            anActivity({
              id: 'a-1',
              userId: MARIA,
              type: 'PLAN_NOTE',
              planItemId: 'p-hoje',
              planItemTitle: THEME,
              subjectId: 'n-1',
              createdAt: agoMs(2 * HOUR),
            }),
            anActivity({
              id: 'a-2',
              userId: MARIA,
              type: 'READ',
              planItemId: 'p-hoje',
              planItemTitle: THEME,
              subjectId: 'log-1',
              createdAt: agoMs(3 * HOUR),
            }),
          ],
        },
      });

      await waitFor(() => {
        expect(feedLines()).toHaveLength(2);
      });

      const [escreveu, leu] = feedLines();
      /*
        ⚠️ **A FRASE INTEIRA, montada pelo `lineOf` a partir do catálogo** — e
        não o primeiro pedaço dela. Com `saidBy`, a asserção do `READ` era
        `toContain('leu')`, que a frase SEM tema também satisfaz: ela sobrevivia
        ao mutante que ela nomeia (medido). A frase montada casa quem, o quê, o
        TEMA e o livro de uma vez — e é o livro no fim dela que prova que o tema
        não o substituiu.
      */
      expect(escreveu).toContain(
        lineOf(pt.pages.home.feed.planNoteOnTheme, {
          name: 'Maria',
          theme: THEME,
          book: 'O Hobbit',
        }),
      );
      expect(leu).toContain(
        lineOf(pt.pages.home.feed.readOnTheme, {
          name: 'Maria',
          theme: THEME,
          book: 'O Hobbit',
        }),
      );

      expectNoGuilt();
    });

    /**
     * ⚠️ **OS DOIS `null` DA DECISÃO C, NA TELA, E ELES FALAM A MESMA FRASE.**
     *
     * (1) o evento não tem dia — a avulsa e o grifo; (2) o dia **existia e
     * sumiu**, porque o admin o tirou do plano: o `planItemId` continua no
     * evento e o título vem `null`. A tela trata os dois igual, caindo na frase
     * de sempre. **Não existe frase de "dia removido"** — seria ruído sobre uma
     * correção de plano que não é da conta de quem lê o feed.
     *
     * ⚠️ E a asserção que importa é a primeira: **a linha do dia removido
     * CONTINUA na lista**. Um `.filter()` mal posto — na junção do servidor ou
     * aqui — sumiria com ela, e o feed apagaria do passado do clube um evento
     * que é dele.
     */
    it('⚠️ keeps the line, with the plain sentence, when there is no theme (decision C)', async () => {
      await renderFeed({
        activity: {
          status: 200,
          body: [
            // (2) o dia sumiu do plano: tem `planItemId`, não tem título.
            anActivity({
              id: 'a-1',
              userId: MARIA,
              type: 'PLAN_NOTE',
              planItemId: 'p-que-sumiu',
              planItemTitle: null,
              subjectId: 'n-1',
              createdAt: agoMs(2 * HOUR),
            }),
            // (1) a avulsa nunca teve dia.
            anActivity({
              id: 'a-2',
              userId: MARIA,
              type: 'FREE_NOTE',
              planItemId: null,
              planItemTitle: null,
              subjectId: 'n-2',
              createdAt: agoMs(3 * HOUR),
            }),
            /*
              ⚠️ **O `READ` SEM TEMA, acrescentado na rodada de correção.** Ele
              é o caso (2) do outro tipo que tem dia — e é o fixture que a
              asserção negativa antiga NÃO suportava: com `saidBy`, ela era
              `not.toContain('leu')`, e esta linha a deixaria vermelha **com o
              código certo**. Com a frase inteira do `lineOf`, ela passa a
              descrever a verdade.
            */
            anActivity({
              id: 'a-3',
              userId: MARIA,
              type: 'READ',
              planItemId: 'p-que-sumiu',
              planItemTitle: null,
              subjectId: 'log-3',
              createdAt: agoMs(4 * HOUR),
            }),
          ],
        },
      });

      // ⚠️ AS TRÊS LINHAS ESTÃO LÁ — as dos dias removidos não sumiram.
      await waitFor(() => {
        expect(feedLines()).toHaveLength(3);
      });

      const [semTema, avulsa, leu] = feedLines();
      expect(semTema).toContain(
        lineOf(pt.pages.home.feed.planNote, {
          name: 'Maria',
          book: 'O Hobbit',
        }),
      );
      expect(avulsa).toContain(
        lineOf(pt.pages.home.feed.freeNote, {
          name: 'Maria',
          book: 'O Hobbit',
        }),
      );
      expect(leu).toContain(
        lineOf(pt.pages.home.feed.read, { name: 'Maria', book: 'O Hobbit' }),
      );
      /*
        E nenhuma delas usa a frase com tema. ⚠️ A asserção é a frase INTEIRA
        (com o tema que a linha teria se houvesse um), não o primeiro pedaço
        dela: `not.toContain(saidBy(readOnTheme))` era `not.toContain('leu')`, e
        a linha do `READ` logo acima a deixaria vermelha com o código certo.
      */
      const text = feedSection().textContent ?? '';
      for (const template of [
        pt.pages.home.feed.planNoteOnTheme,
        pt.pages.home.feed.readOnTheme,
      ]) {
        expect(text).not.toContain(
          lineOf(template, {
            name: 'Maria',
            theme: THEME,
            book: 'O Hobbit',
          }),
        );
      }
      // E o tema NÃO aparece em lugar nenhum da seção: nenhuma linha o inventou.
      expect(text).not.toContain(THEME);

      expectNoGuilt();
    });

    /**
     * ⚠️ **A LINHA COM TEMA É LINK PARA O MESMO LUGAR** — o tema enfeita a
     * frase, não muda o alvo (decisão D da Tarefa 35: a linha inteira é o
     * link). Sem isto, um `<a>` a mais dentro da linha nasceria sem ninguém
     * notar, e alvo dentro de alvo em celular é toque errado garantido.
     */
    it('does not change the target, nor add a second link, because of the theme', async () => {
      await renderFeed({
        activity: {
          status: 200,
          body: [
            anActivity({
              id: 'a-1',
              userId: MARIA,
              type: 'PLAN_NOTE',
              planItemId: 'p-hoje',
              planItemTitle: THEME,
              subjectId: 'n-1',
            }),
          ],
        },
      });

      await waitFor(() => {
        expect(feedLines()).toHaveLength(1);
      });

      expect(feedHrefs()).toEqual(['/books/b-hobbit/days/p-hoje']);

      expectNoGuilt();
    });
  });

  it('⚠️ gives the FOUR types four DISTINGUISHABLE sentences (rule 3)', async () => {
    /*
      ⚠️ **A LIÇÃO Nº 16 DO MVP 2: duas coisas que falam a mesma frase são
      indistinguíveis pela varredura.** O catálogo garante que as quatro frases
      são diferentes entre si (`catalogs.test.ts`, §7.9) — o
      que ELE não consegue garantir é que a TELA escolha uma chave diferente
      para cada tipo. Quatro frases distintas lidas por uma chave só ficariam
      verdes lá e mentiriam aqui.

      A mesma pessoa e o mesmo livro nos quatro, de propósito: senão a
      distinção poderia vir do nome ou do título, e não do VERBO. É o molde do
      `tells READING apart from WRITING on the same row` da Tarefa 32b.
    */
    await renderFeed({
      activity: {
        status: 200,
        body: [
          anActivity({
            id: 'a-1',
            type: 'PLAN_NOTE',
            planItemId: 'p-hoje',
            subjectId: 'n-1',
          }),
          anActivity({ id: 'a-2', type: 'FREE_NOTE', subjectId: 'n-2' }),
          anActivity({ id: 'a-3', type: 'HIGHLIGHT', subjectId: 'h-3' }),
          anActivity({
            id: 'a-4',
            type: 'READ',
            planItemId: 'p-hoje',
            subjectId: 'log-4',
          }),
        ],
      },
    });

    await waitFor(() => {
      expect(feedLines()).toHaveLength(4);
    });

    const lines = feedLines();
    // A metade que decide: as quatro linhas falam coisas DIFERENTES.
    expect(new Set(lines).size).toBe(4);
    // E cada uma fala a frase do SEU tipo — sem isto, quatro frases trocadas
    // entre si também dariam quatro linhas distintas.
    expect(lines[0]).toContain(saidBy(pt.pages.home.feed.planNote));
    expect(lines[1]).toContain(saidBy(pt.pages.home.feed.freeNote));
    expect(lines[2]).toContain(saidBy(pt.pages.home.feed.highlight));
    expect(lines[3]).toContain(saidBy(pt.pages.home.feed.read));

    expectNoGuilt();
  });

  it('opens the right target from the line, WITHOUT reloading the PWA (rule 4, decision D)', async () => {
    /*
      A LINHA INTEIRA é o link (decisão D): é o padrão do acervo, e um alvo
      dentro de outro alvo em celular é toque errado garantido.

      A observável do clique é o ENDEREÇO: em jsdom uma âncora crua não navega,
      então ele só muda se o roteador interceptou. (O mapa tipo → endereço é
      provado sem tela em `activity-feed.test.ts`, que é onde ele é decidível.)
    */
    await renderFeed({
      activity: {
        status: 200,
        body: [
          anActivity({
            id: 'a-1',
            type: 'PLAN_NOTE',
            planItemId: 'p-hoje',
            subjectId: 'n-1',
          }),
          anActivity({ id: 'a-2', type: 'FREE_NOTE', subjectId: 'n-2' }),
          anActivity({ id: 'a-3', type: 'HIGHLIGHT', subjectId: 'h-3' }),
          anActivity({
            id: 'a-4',
            type: 'READ',
            planItemId: 'p-hoje',
            subjectId: 'log-4',
          }),
        ],
      },
    });

    await waitFor(() => {
      expect(feedLines()).toHaveLength(4);
    });

    expect(feedHrefs()).toEqual([
      '/books/b-hobbit/days/p-hoje',
      '/books/b-hobbit/notes/n-2',
      '/books/b-hobbit/highlights/h-3',
      '/books/b-hobbit/days/p-hoje',
    ]);
    expectNoGuilt();

    const list = feedList();
    const grifo = list?.querySelectorAll('a')[2];
    expect(grifo).toBeDefined();
    await act(async () => {
      if (grifo !== undefined) fireEvent.click(grifo);
    });

    expect(locationText()).toBe('/books/b-hobbit/highlights/h-3');
  });

  it('⚠️ does not break the line of a book the shelf does not know (rule 6)', async () => {
    /*
      O livro pode ter sido arquivado, ou ser de um mês que a estante não
      trouxe. ⚠️ **NUNCA o `bookId` cru como rótulo**: um UUID na linha tem cara
      de informação e não é de ninguém (a medição do `nameOfWriter`). E nunca
      tom de erro: o feed não cobra por uma falha nossa.
    */
    await renderFeed({
      activity: {
        status: 200,
        body: [anActivity({ id: 'a-1', bookId: 'b-que-nao-esta-na-estante' })],
      },
    });

    await waitFor(() => {
      expect(feedLines()).toHaveLength(1);
    });

    const [line] = feedLines();
    expect(line).toContain(pt.pages.busca.item.unknownBook);
    expect(line).toContain('Maria');
    // As duas metades negativas: nem o id cru, nem tom de erro.
    expect(line).not.toContain('b-que-nao-esta-na-estante');
    expect(readableText()).not.toContain(pt.pages.home.feed.failed);
    // E a linha continua sendo um link: o livro some do RÓTULO, não do alvo —
    // o endereço é montado com o `bookId`, que existe mesmo sem título.
    expect(feedHrefs()).toEqual([
      '/books/b-que-nao-esta-na-estante/highlights/h-1',
    ]);

    expectNoGuilt();
  });

  it('⚠️ a feed that FAILS does not take the home down (rule 7)', async () => {
    /*
      ⚠️ **POR CONTAGEM *E* PELO ESTADO RENDERIZADO, não por ausência de erro**
      (§7.4). "Não estourou" é o que um `expect(...).toBeDefined()` prova, e não
      é nada: a home podia ter ficado em branco.

      A estante e o atalho de hoje são o PRODUTO da home; o feed é o acessório
      (decisão F). É o mesmo desenho que o plano já usa — o que falha some, o
      resto fica.
    */
    const calls = await renderFeed({
      activity: { status: 500, body: { error: 'Boom' } },
      book: bookWithPlanReply(aBook({ id: 'b-hobbit' }), [
        aPlanItem({ id: 'p-hoje', bookId: 'b-hobbit', date: today() }),
      ]),
    });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.home.feed.failed)).not.toBeNull();
    });

    // O ESTADO: a home inteira continua de pé.
    expect(homeIsUp()).toBe(true);
    const shelf = screen.queryByRole('list', {
      name: pt.pages.home.shelf.label,
    });
    expect(shelf?.querySelectorAll('li')).toHaveLength(1);
    expect(
      screen.queryByRole('link', {
        name: new RegExp(pt.pages.home.today.write, 'u'),
      }),
    ).not.toBeNull();

    // A CONTAGEM: nada foi refeito nem deixou de ser pedido por causa do feed.
    expect(shelfRequests(calls)).toHaveLength(1);
    expect(planRequests(calls)).toEqual(['https://api.teste/books/b-hobbit']);
    expect(feedRequests(calls)).toHaveLength(1);

    /*
      ⚠️ E A FALHA NÃO FALA PELA FRASE DO VAZIO (decisão G, e a lição das
      Tarefas 19/25/28): "ainda não há atividade" faria a pessoa achar que o
      clube está parado quando o que caiu foi a rede.
    */
    expect(screen.queryByText(pt.pages.home.feed.empty)).toBeNull();
    expect(readableText()).not.toContain('Boom');
    expectNoGuiltWithPlanPosition();
  });

  it('⚠️ members that fail do not take the FEED down (rule 8)', async () => {
    const calls = await renderFeed({
      members: { status: 500, body: { error: 'Boom' } },
      activity: {
        status: 200,
        body: [anActivity({ id: 'a-1', userId: MARIA })],
      },
    });

    await waitFor(() => {
      expect(feedLines()).toHaveLength(1);
    });

    // A linha aparece inteira, com a frase NEUTRA de nome — e o livro, que não
    // depende dos membros, continua nomeado.
    const [line] = feedLines();
    expect(line).toContain(pt.pages.acervo.item.author.other);
    expect(line).toContain('O Hobbit');
    expect(line).not.toContain('u-maria');
    // Por contagem: os membros foram pedidos UMA vez, e o feed não foi refeito.
    expect(memberRequests(calls)).toHaveLength(1);
    expect(feedRequests(calls)).toHaveLength(1);
    // E a falha dos nomes é SILENCIOSA: ninguém lê um texto de servidor por
    // causa de um nome.
    expect(readableText()).not.toContain(pt.pages.home.feed.failed);
    expectNoGuilt();
  });

  it('asks for the feed and for the members ONCE each per load, with an explicit small limit (rules 9, decision I)', async () => {
    const calls = await renderFeed({
      activity: {
        status: 200,
        body: [anActivity({ id: 'a-1' })],
      },
    });

    await waitFor(() => {
      expect(feedLines()).toHaveLength(1);
    });

    // O lado positivo junto do `toBe(0)` (§7.3): uma de cada, e nenhuma a mais.
    expect(feedRequests(calls)).toHaveLength(1);
    expect(memberRequests(calls)).toHaveLength(1);
    expect(shelfRequests(calls)).toHaveLength(1);

    const feed = requestAt(feedRequests(calls), 0);
    const query = new URL(feed.url).searchParams;
    expect(new URL(feed.url).pathname).toBe('/clubs/c-casal/activity');
    /*
      ⚠️ **O LIMITE É EXPLÍCITO E PEQUENO** (decisão I): o padrão do contrato é
      50, e a home não mostra 50 linhas. Pedir o que a tela mostra é o que
      impede o feed de virar histórico — e não existe "e mais N", que seria
      contador.
    */
    expect(query.get('limit')).toBe('12');
    expect(query.get('authorId')).toBeNull();
    expect(query.get('type')).toBeNull();
    expectNoGuilt();
  });

  it('⚠️ asks the feed and the members IN PARALLEL, and neither blocks the shelf (decision F)', async () => {
    /*
      Serial seria "o feed e, quando ele voltar, os membros" — e com o feed
      pendurado no metrô os nomes nunca chegariam. A observável é exatamente
      essa: com a resposta do feed PRESA, a requisição dos membros já saiu.

      E a estante, que é o produto da home, já está na tela enquanto os dois
      estão no ar.
    */
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const calls = await renderFeed({
      activity: async () => {
        await held;
        return { status: 200, body: [anActivity({ id: 'a-1' })] };
      },
    });

    await waitFor(() => {
      expect(memberRequests(calls)).toHaveLength(1);
    });
    expect(feedRequests(calls)).toHaveLength(1);
    // A estante NÃO esperou por nenhum dos dois.
    expect(
      screen.queryByRole('list', { name: pt.pages.home.shelf.label }),
    ).not.toBeNull();
    // E o feed diz que está carregando, com frase PRÓPRIA — um segundo
    // "Carregando…" não diria de quê (regra 10, estado "carregando").
    expect(screen.queryByText(pt.pages.home.feed.loading)).not.toBeNull();
    expect(feedList()).toBeNull();
    expectNoGuilt();

    await act(async () => {
      release?.();
      await held;
    });

    await waitFor(() => {
      expect(feedLines()).toHaveLength(1);
    });
    expectNoGuilt();
  });

  it('⚠️ an empty feed states it, and does NOT charge anybody (rule 10, decision G)', async () => {
    await renderFeed({ activity: { status: 200, body: [] } });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.home.feed.empty)).not.toBeNull();
    });
    // "Ainda não há atividade por aqui" é constatação; "ninguém leu ainda" é
    // cobrança. E o estado vazio não é o de falha.
    expect(screen.queryByText(pt.pages.home.feed.failed)).toBeNull();
    expect(feedList()).toBeNull();
    expect(homeIsUp()).toBe(true);
    expectNoGuilt();
  });

  it('⚠️ stays up when the feed AND the members fail together', async () => {
    /*
      As duas cargas novas caindo na mesma viagem de metrô. A home continua
      inteira, o feed diz que não conseguiu carregar — com a frase dele, nunca
      a do vazio — e nada de servidor aparece na tela.
    */
    const calls = await renderFeed({
      activity: { status: 500, body: { error: 'Boom do feed' } },
      members: { status: 500, body: { error: 'Boom dos membros' } },
      book: bookWithPlanReply(aBook({ id: 'b-hobbit' }), [
        aPlanItem({ id: 'p-hoje', bookId: 'b-hobbit', date: today() }),
      ]),
    });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.home.feed.failed)).not.toBeNull();
    });

    expect(homeIsUp()).toBe(true);
    expect(
      screen.queryByRole('list', { name: pt.pages.home.shelf.label }),
    ).not.toBeNull();
    expect(
      screen.queryByRole('link', {
        name: new RegExp(pt.pages.home.today.write, 'u'),
      }),
    ).not.toBeNull();
    expect(screen.queryByText(pt.pages.home.feed.empty)).toBeNull();
    // Uma de cada, mesmo as duas falhando: a falha não vira retentativa muda.
    expect(feedRequests(calls)).toHaveLength(1);
    expect(memberRequests(calls)).toHaveLength(1);
    expect(readableText()).not.toContain('Boom do feed');
    expect(readableText()).not.toContain('Boom dos membros');
    expectNoGuiltWithPlanPosition();
  });

  it('⚠️ does not ask for the feed when the SHELF is not there (the inversion of decision F)', async () => {
    /*
      ⚠️ **ESTE TESTE PINA UM ACOPLAMENTO QUE VAI ALÉM DA DECISÃO F, e é de
      propósito.** A decisão F decidiu que as duas requisições novas são
      paralelas entre si e **não bloqueiam** a estante. O que a home implementa é
      isso MAIS o inverso: sem estante pronta e não vazia, o feed nem é pedido.

      Os dois motivos estão no comentário do `home.tsx`, e os dois são de
      produto: é a ESTANTE que dá o nome de cada livro (montar antes diria
      "Livro do clube" em toda linha por um instante), e um clube sem livro não
      pode ter atividade nenhuma — todo `ActivityEvent` carrega um `bookId`.
      Sem este teste isso existiria só em prosa, e a prosa não tem acusador.
    */
    const failed = await renderHome({
      shelf: [{ status: 500, body: { error: 'Boom' } }],
    });

    await waitFor(() => {
      expect(screen.queryByText(pt.errors.serverError)).not.toBeNull();
    });
    expect(feedRequests(failed)).toHaveLength(0);
    expect(memberRequests(failed)).toHaveLength(0);
    // E o feed não deixa rastro: nem seção, nem frase de falha própria.
    expect(screen.queryByText(pt.pages.home.feed.heading)).toBeNull();
    expect(screen.queryByText(pt.pages.home.feed.failed)).toBeNull();
    expectNoGuilt();
  });

  it('⚠️ does not ask for the feed of a club with an EMPTY shelf either', async () => {
    // O outro lado do mesmo acoplamento: sem livro não pode haver atividade —
    // todo `ActivityEvent` carrega um `bookId` —, então a seção seria um estado
    // vazio embaixo de outro estado vazio.
    const calls = await renderHome({ shelf: [booksReply([])] });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.home.noBooks.title)).not.toBeNull();
    });
    expect(feedRequests(calls)).toHaveLength(0);
    expect(memberRequests(calls)).toHaveLength(0);
    expect(screen.queryByText(pt.pages.home.feed.heading)).toBeNull();
    expectNoGuilt();
  });

  it('does not ask for activity of a club that does not exist yet (rule 9)', async () => {
    /*
      Sem clube ativo não há tenant a perguntar, e um
      `/clubs/undefined/activity` seria um 404 na PRIMEIRA tela do app. O par
      negativo da contagem de cima.
    */
    const calls = await renderHome({ clubs: [] });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.home.noClubs.title)).not.toBeNull();
    });
    expect(feedRequests(calls)).toHaveLength(0);
    expect(memberRequests(calls)).toHaveLength(0);
    expectNoGuilt();
  });
});

describe('the FIRST FRAME of a session never shows the empty state', () => {
  it('renders the loading state, not "your club shows up here", before any effect has run', () => {
    /*
      ⚠️ **O MUTANTE DO PRIMEIRO FRAME É DECIDÍVEL — a alegação de que ele
      exigia navegador de verdade era FALSA.**

      Duas defesas guardam esse frame, e as duas eram invisíveis em jsdom:

      1. o `ActiveClubProvider` NASCE em `'loading'` quando há sessão (em vez de
         `'anonymous'`);
      2. a home mostra o carregamento com `status !== 'ready'` (em vez de
         `=== 'loading'`).

      O `act()` do Testing Library descarrega os efeitos antes de qualquer
      asserção, então o frame que o navegador PINTA nunca era observado. O
      `renderToString` é exatamente aquele frame: SSR não roda efeito nenhum.

      MEDIDO: com as duas defesas fora, o SSR mostra "Seu clube aparece aqui";
      com QUALQUER uma delas, verde. É a primeira coisa que a pessoa vê ao abrir
      o app, e "você não está em nenhum clube" piscando é o oposto do que a
      regra 12 pede.

      (`<AppRoutes />` e não `<App />`: o cabeçalho tem seletor de tema, que lê
      o navegador. O que está sob teste é a home.)
    */
    const storage = memoryStorage({ ...SESSION });

    const html = renderToString(
      <I18nextProvider i18n={createI18n()}>
        <AuthProvider storage={storage} baseUrl="https://api.teste">
          <ActiveClubProvider storage={storage}>
            <MemoryRouter initialEntries={['/']}>
              <AppRoutes />
            </MemoryRouter>
          </ActiveClubProvider>
        </AuthProvider>
      </I18nextProvider>,
    );

    // O par: o carregamento ESTÁ, e o estado vazio NÃO está. Sem a primeira
    // asserção, uma árvore que não renderizasse nada passaria (§7.4).
    expect(html).toContain(pt.pages.home.loading);
    expect(html).not.toContain(pt.pages.home.noClubs.title);

    // E este estado também não cobra nada (regra 16). É o único que esta suíte
    // observa FORA do DOM, então a varredura é a mesma, sobre a string.
    expectNoGuiltInHtml(html);
  });
});

/**
 * A CORRENTE DE LEITURA na home — o "foguinho" (ADR 0010).
 *
 * ⚠️ **Este bloco testa uma feature que CONTRARIA o desenho do feed**, e o ADR
 * registra a reversão: o feed nasceu sem coluna de pessoa e sem número porque
 * uma coluna com número convida a comparar. Foi decisão do dono, tomada depois
 * de a objeção ser levantada e medida.
 */
describe('a corrente de leitura (ADR 0010)', () => {
  const MARIA_ID = 'u-maria';

  /**
   * ⚠️ **O SELO SEPARA O NÚMERO DO RESTO DA FRASE — Tarefa 45, decisão B — MAS
   * A FRASE CONTINUA SENDO A FRASE.**
   *
   * O canvas desenha os dois em elementos distintos
   * (`InicioDesktop.dc.html:110` e `:111`), e é assim que o `StreakSeal` é
   * feito: `count` num `<span>`, `label` no outro.
   *
   * ⚠️⚠️ ~~`textContent` cola irmãos sem separador, então a frase do catálogo
   * ("12 dias seguidos") **não** aparece inteira no DOM~~ — **era verdade, e
   * era um defeito, corrigido na auditoria da fatia.** O `gap` que dá o ar
   * entre os dois é CSS e não chega à árvore de acessibilidade: quem OUVIA a
   * tela ouvia `12dias seguidos`. Hoje o selo emite um nó de texto de verdade
   * entre eles (um item anônimo só de espaço, que o `flex` não desenha), e a
   * frase do DOM voltou a ser a frase do catálogo, caractere por caractere.
   *
   * Por isso este helper **interpola** em vez de subtrair: é a asserção mais
   * forte disponível, e a que diz o que a pessoa lê e ouve.
   */
  function daysPhrase(count: number): string {
    const key = count === 1 ? 'days_one' : 'days_other';
    return pt.pages.home.streak[key].replace('{{count}}', String(count));
  }

  it('mostra a corrente de cada pessoa do clube', async () => {
    await renderHome({
      streaks: {
        status: 200,
        body: [
          { userId: ME_ID, streak: 12, readToday: true },
          { userId: MARIA_ID, streak: 30, readToday: true },
        ],
      },
    });

    await waitFor(() => {
      expect(readableText()).toContain(daysPhrase(12));
    });
    expect(readableText()).toContain(daysPhrase(30));
  });

  /**
   * ⚠️ **O SINGULAR EXISTE, e é o plural do i18next fazendo o trabalho.** Sem
   * as duas chaves (`days_one` e `days_other`), o primeiro dia de alguém diria
   * "1 dias seguidos" — a tela errando no exato momento em que a pessoa começa.
   */
  it('⚠️ diz "1 dia seguido" no singular, não "1 dias seguidos"', async () => {
    await renderHome({
      streaks: {
        status: 200,
        body: [{ userId: ME_ID, streak: 1, readToday: true }],
      },
    });

    await waitFor(() => {
      expect(readableText()).toContain(daysPhrase(1));
    });
    expect(readableText()).not.toContain(
      pt.pages.home.streak.days_other.replace('{{count}}', '1'),
    );
  });

  /**
   * ⚠️ **A FRASE DE PERDA — o mecanismo que o dono escolheu, e o único lugar do
   * app isento da varredura anti-culpa.**
   *
   * Ela só aparece para quem TEM corrente e ainda não leu hoje. Os dois testes
   * abaixo são o par: sem o negativo, um `atRisk` sempre verdadeiro passaria.
   */
  it('⚠️ avisa que a sequência vai se perder quando eu ainda não li hoje', async () => {
    await renderHome({
      streaks: {
        status: 200,
        body: [{ userId: ME_ID, streak: 12, readToday: false }],
      },
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.home.streak.atRisk);
    });
  });

  it('⚠️ NÃO avisa quando eu já li hoje', async () => {
    await renderHome({
      streaks: {
        status: 200,
        body: [{ userId: ME_ID, streak: 12, readToday: true }],
      },
    });

    await waitFor(() => {
      expect(readableText()).toContain(daysPhrase(12));
    });
    expect(readableText()).not.toContain(pt.pages.home.streak.atRisk);
  });

  /**
   * ⚠️ **NÃO cobra quem está em ZERO.** Não há o que perder, e a frase de perda
   * ali seria o app cobrando quem ainda não começou — o oposto do que o
   * incentivo existe para fazer, e o caso mais fácil de deixar passar.
   */
  it('⚠️ não mostra o aviso de perda para quem está em zero', async () => {
    await renderHome({
      streaks: {
        status: 200,
        body: [{ userId: ME_ID, streak: 0, readToday: false }],
      },
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.home.streak.none);
    });
    expect(readableText()).not.toContain(pt.pages.home.streak.atRisk);
  });

  /**
   * ⚠️ A corrente é **enfeite ao lado do feed**: se ela cair, a atividade do
   * clube continua na tela. Uma home que troca o feed por um erro de foguinho
   * errou a prioridade.
   */
  it('⚠️ o feed sobrevive quando a corrente falha', async () => {
    await renderHome({
      streaks: { status: 500, body: { error: 'Internal Server Error' } },
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.home.feed.heading);
    });
  });

  /**
   * ⚠️ **A rota é `/streaks`, e NÃO a estante.** O `replyByUrl` casa por
   * fragmento e `/clubs/c-casal/streaks` contém `/clubs/` — esta asserção é o
   * que impede a corrente de receber o corpo da estante em silêncio.
   */
  it('⚠️ pede a corrente no endereço do clube, não no da estante', async () => {
    const calls = await renderHome();

    await waitFor(() => {
      expect(requestsTo(calls, '/streaks')).toHaveLength(1);
    });
    const streaks = requestsTo(calls, '/streaks')[0];
    expect(new URL(streaks?.url ?? '').pathname).toBe('/clubs/c-casal/streaks');
  });
});

/**
 * ============================================================================
 * TAREFA 45 — O INÍCIO: o selo, a margem, e o admin fora da frente
 * ============================================================================
 *
 * As quatro propriedades que esta fatia entrega, e cada uma tem o mutante que a
 * provou (o relatório da fatia traz a tabela):
 *
 * 1. **a entrada de admin desce** — no estado NORMAL ela é link de rodapé; no
 *    estado VAZIO ela **continua botão**, porque é lá que o mês começa;
 * 2. **a corrente é o `StreakSeal`** de `packages/ui` (Tarefa 41b), que até
 *    aqui era o último componente daquela fatia sem consumidor;
 * 3. **corrente e feed vivem na MARGEM** acima de 1120px e **descem para o
 *    fluxo** abaixo dela — media query, nunca condição de render;
 * 4. **a posição no plano entra** ("Dia 11 de 30"), e os estados que a mostram
 *    varrem com `expectNoGuiltWithPlanPosition()`.
 */
describe('o Início da Tarefa 45', () => {
  const ADMIN_ENTRY = pt.pages.bookForm.entry.new;

  /** Um plano cujo item de HOJE é o segundo de três — posição "Dia 2 de 3". */
  function planWithToday(): Reply {
    return bookWithPlanReply(aBook({ id: 'b-hobbit' }), [
      aPlanItem({ id: 'p-ontem', date: otherDay(), order: 1 }),
      aPlanItem({
        id: 'p-hoje',
        date: today(),
        order: 2,
        title: 'Cap. 3 — A promessa',
        reference: 'p. 45-62',
      }),
      aPlanItem({ id: 'p-amanha', date: '2099-01-01', order: 3 }),
    ]);
  }

  /** A frase da posição, montada como a tela a monta — chave, nunca literal. */
  function dayOfPlan(number: number, total: number): string {
    return pt.pages.book.plan.dayOfPlan
      .replace('{{number}}', String(number))
      .replace('{{total}}', String(total));
  }

  /**
   * ⚠️ **OS DOIS LADOS DA DECISÃO A, E ELES SÃO UM PAR.**
   *
   * `home.tsx` chamava a mesma `adminEntry()` em DOIS lugares: dentro do estado
   * vazio (`shelf.books.length === 0`) e no estado normal, **acima** do bloco
   * de hoje. Só o segundo desce para o rodapé e vira link — mover os dois
   * destruiria o que o docblock daquela função defende por escrito: *"é daqui
   * que o mês começa: o admin abre o app, não vê livro nenhum, e o botão é a
   * resposta"*.
   *
   * ⚠️ **Guardar metade do par é o defeito que este bloco já pagou TRÊS vezes**
   * (as duas lombadas e a legenda na Tarefa 44, o link do acervo na 44b). Daí
   * os dois `it()` abaixo, e a asserção de POSIÇÃO no primeiro: sem ela, o link
   * voltar para cima da leitura de hoje passaria verde.
   */
  it('⚠️ (a) com estante cheia, o cadastro é LINK e vem DEPOIS da estante', async () => {
    await renderHome({ book: planWithToday() });

    const link = await screen.findByRole('link', { name: ADMIN_ENTRY });
    expect(link.getAttribute('href')).toBe(`/clubs/${CASAL.id}/books/new`);
    // Não é mais botão: o `Button` empurrava o gesto de um toque para baixo.
    expect(screen.queryByRole('button', { name: ADMIN_ENTRY })).toBeNull();

    /*
      ⚠️ **A POSIÇÃO, e ela é o acusador do mutante (ii).** O link tem de vir
      DEPOIS do atalho de hoje E depois da estante — é isso que "rodapé"
      significa, e é o que se perde quando alguém o devolve para cima.
    */
    const shortcut = screen.getByRole('link', {
      name: new RegExp(pt.pages.home.today.write, 'u'),
    });
    const shelf = screen.getByRole('list', { name: pt.pages.home.shelf.label });
    for (const earlier of [shortcut, shelf]) {
      // `FOLLOWING` exato: o link vem depois E não está DENTRO de nenhum dos
      // dois (aí o valor traria também o bit de `CONTAINED_BY`).
      expect(earlier.compareDocumentPosition(link)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }

    expectNoGuiltWithPlanPosition();
  });

  it('⚠️ (b) com estante VAZIA, o cadastro continua BOTÃO — é onde o mês começa', async () => {
    await renderHome({ shelf: [booksReply([])] });

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: ADMIN_ENTRY }),
      ).not.toBeNull();
    });
    // E não há um SEGUNDO caminho: o rodapé daquele estado não existe.
    expect(screen.queryByRole('link', { name: ADMIN_ENTRY })).toBeNull();
    expectNoGuilt();
  });

  /**
   * ⚠️ **REGRA 9 — O PAPEL NÃO MUDOU DE LUGAR JUNTO COM O BOTÃO.**
   *
   * `adminEntry()` só existe para `OWNER`/`ADMIN`, *"e a ROTA recusa igual
   * (`book-form.tsx`), senão isto seria só um botão escondido"* — a frase é do
   * docblock de `home.tsx`. Um link de rodapé sem o guarda de papel seria o
   * mesmo defeito com marcação nova.
   */
  it('⚠️ não mostra o cadastro — nem link, nem botão — para quem é MEMBER', async () => {
    await renderHome({
      clubs: [{ ...CASAL, role: 'MEMBER' }],
      book: planWithToday(),
    });

    await screen.findByRole('list', { name: pt.pages.home.shelf.label });
    expect(screen.queryByRole('link', { name: ADMIN_ENTRY })).toBeNull();
    expect(screen.queryByRole('button', { name: ADMIN_ENTRY })).toBeNull();
    expectNoGuiltWithPlanPosition();
  });

  /**
   * ⚠️ **DECISÃO B — A CORRENTE É O `StreakSeal`, e ele era o ÚLTIMO
   * componente da Tarefa 41b sem consumidor** (medido na 44b).
   *
   * ⚠️ **A RECONSTRUÇÃO É O QUE FAZ ESTA ASSERÇÃO VALER.** O canvas separa o
   * NÚMERO (`InicioDesktop.dc.html:110`, mono, dourado) do RESTO DA FRASE
   * (`:111`, "dias seguidos · Você"), e o catálogo tem **uma** frase com o
   * número dentro (`'{{count}} dias seguidos'`). A tela compõe os dois sem
   * chave nova; este teste exige que a composição **volte a ser** a frase do
   * catálogo, caractere por caractere. Se o par de plural deixar de começar
   * pelo `{{count}}`, isto fica vermelho — em vez de a tela passar a escrever
   * meia frase em silêncio.
   */
  it('⚠️ desenha a corrente com o StreakSeal, e o número reconstrói a frase do catálogo', async () => {
    await renderHome({
      streaks: {
        status: 200,
        body: [
          { userId: ME_ID, streak: 12, readToday: true },
          { userId: MARIA, streak: 1, readToday: true },
        ],
      },
    });

    const list = await screen.findByRole('list', {
      name: pt.pages.home.streak.mine,
    });
    const seals = Array.from(list.querySelectorAll('li'));
    expect(seals).toHaveLength(2);

    // O glifo é o MARCADOR DE LIVRO do `StreakSeal`, nunca a chama de antes
    // (a metáfora de perda do Duolingo, que o §1 do plano recusa).
    for (const seal of seals) {
      const glyph = seal.querySelector('svg');
      expect(glyph?.getAttribute('class')).toContain('lucide-bookmark');
      expect(glyph?.getAttribute('class')).not.toContain('lucide-flame');
    }

    const [mine, hers] = seals;
    /*
      ⚠️⚠️ **A RECONSTRUÇÃO É A FRASE INTEIRA, COM O ESPAÇO — e o espaço é a
      correção da rodada de auditoria (achado M4).**

      Até aqui esta linha exigia `"12" + "dias seguidos · Você"` **colados**,
      porque era isso que o DOM tinha: dois `<span>` irmãos sem nó de texto
      entre eles. O `gap-1.75` do selo dá o ar na TELA e não existe para quem
      OUVE — o `textContent` era `"12dias seguidos · Você"`, e o docblock da
      `StreakBar` afirmava que a frase era lida inteira. Não era.

      O conserto é um nó de texto de verdade entre os dois `<span>` (um
      `{' '}`), que num contêiner `flex` **não é desenhado** (o CSS descarta o
      item anônimo só de espaço) e entra no texto. Por isso a asserção agora é
      a frase do catálogo INTERPOLADA, caractere por caractere — a forma mais
      forte, e a que diz o que a pessoa de fato lê e ouve.
    */
    expect(mine?.textContent).toBe(
      `${pt.pages.home.streak.days_other.replace('{{count}}', '12')} · ${pt.pages.acervo.item.author.you}`,
    );
    expect(hers?.textContent).toBe(
      `${pt.pages.home.streak.days_one.replace('{{count}}', '1')} · Maria`,
    );

    expectNoGuilt();
  });

  /**
   * ⚠️ **A COR NUNCA É O ÚNICO PORTADOR** — a mesma regra que o `PresenceMark`
   * cumpre na Tarefa 44 e que `filter-bar.test.tsx` cobra desde a 41a.
   *
   * Aqui os dois tons pintam de formas diferentes (`bg-gold-soft` × `bg-surface`)
   * **e** dizem coisas diferentes em texto: quem tem corrente lê o número de
   * dias, quem está em zero lê o convite. Quem imprimiu a tela, ou não
   * distingue o dourado do creme, continua com a informação inteira.
   */
  it('⚠️ distingue o selo aceso do apagado SEM depender da cor', async () => {
    await renderHome({
      streaks: {
        status: 200,
        body: [
          { userId: ME_ID, streak: 12, readToday: true },
          { userId: MARIA, streak: 0, readToday: false },
        ],
      },
    });

    const list = await screen.findByRole('list', {
      name: pt.pages.home.streak.mine,
    });
    const [lit, quiet] = Array.from(list.querySelectorAll('li')).map(
      (item) => item.firstElementChild as HTMLElement,
    );

    const classesOf = (element?: HTMLElement): string[] =>
      (element?.className ?? '').split(/\s+/u);
    expect(classesOf(lit)).toContain('bg-gold-soft');
    expect(classesOf(quiet)).toContain('bg-surface');
    expect(classesOf(quiet)).not.toContain('bg-gold-soft');

    /*
      ⚠️ **E A METADE QUE NÃO É COR.** Sem ela, trocar os dois mapas de classe
      por um só deixaria a tela indistinguível para quem não vê a diferença de
      matiz — e o teste acima continuaria sendo sobre classes, não sobre
      informação.
    */
    expect(lit?.textContent).toContain(
      pt.pages.home.streak.days_other.replace('{{count}} ', ''),
    );
    expect(quiet?.textContent).toContain(pt.pages.home.streak.none);
    expect(quiet?.textContent).not.toContain(
      pt.pages.home.streak.days_other.replace('{{count}} ', ''),
    );

    expectNoGuilt();
  });

  /**
   * ⚠️⚠️ **O TOM DIZ "ESTA É A MINHA", NÃO "ESTA TEM CORRENTE" — e este `it()`
   * nasceu de um DEFEITO DE PRODUTO que a primeira entrega da fatia deixou
   * passar.**
   *
   * O canvas é explícito, e foi medido com o conteúdo impresso:
   * `InicioDesktop.dc.html:113` desenha o selo do **Bruno** com
   * `border:1px solid #e3ddc9` e `background:#f9f5ec` — **apagado** —, e o
   * `:116` diz `dias seguidos · Bruno`. O Bruno tem **4** dias de corrente
   * (`:115`). Ou seja: o que acende o selo é ser o MEU, não ter corrente. O
   * celular desenha o mesmo (`Inicio.dc.html:102-105`).
   *
   * A entrega acendia por `count > 0` (`streak-seal.tsx`), e num clube de
   * casal em que os dois leram **os dois selos saíam dourados** — a distinção
   * que o artboard desenha simplesmente sumia. Nenhum teste pegava: o único
   * `it()` de tom usava 12 × **0**, e nesse par "a minha" e "tem corrente"
   * dão a mesma resposta.
   *
   * ⚠️ **POR ISSO AS DUAS CORRENTES SÃO > 0 AQUI.** É a única forma de separar
   * as duas regras. Com um zero no fixture o mutante volta a sobreviver.
   */
  it('⚠️ acende o selo QUE É MEU — duas correntes vivas, e só uma dourada', async () => {
    await renderHome({
      streaks: {
        status: 200,
        body: [
          { userId: ME_ID, streak: 12, readToday: true },
          { userId: MARIA, streak: 4, readToday: true },
        ],
      },
    });

    const list = await screen.findByRole('list', {
      name: pt.pages.home.streak.mine,
    });
    const [mine, hers] = Array.from(list.querySelectorAll('li')).map(
      (item) => item.firstElementChild as HTMLElement,
    );

    const classesOf = (element?: HTMLElement): string[] =>
      (element?.className ?? '').split(/\s+/u);
    expect(classesOf(mine)).toContain('border-gold-line');
    expect(classesOf(mine)).toContain('bg-gold-soft');
    // ⚠️ A DELA TEM CORRENTE VIVA (4 dias) E MESMO ASSIM É A PÍLULA APAGADA.
    expect(classesOf(hers)).toContain('border-line-soft');
    expect(classesOf(hers)).toContain('bg-surface');
    expect(classesOf(hers)).not.toContain('bg-gold-soft');

    // O glifo acompanha o tom, com a mesma regra.
    const glyphOf = (element?: HTMLElement): string[] =>
      (element?.querySelector('svg')?.getAttribute('class') ?? '').split(
        /\s+/u,
      );
    expect(glyphOf(mine)).toContain('stroke-gold');
    expect(glyphOf(hers)).toContain('stroke-subtle');

    /*
      ⚠️ **E A DISTINÇÃO SOBREVIVE SEM A COR** — a mesma propriedade que o
      `PresenceMark` cumpre na Tarefa 44. Quem imprimiu a tela, ou não
      distingue o dourado do creme, continua sabendo qual linha é a sua:
      quem fala é o NOME, em texto de verdade.
    */
    expect(mine?.textContent).toContain(pt.pages.acervo.item.author.you);
    expect(hers?.textContent).toContain('Maria');
    expect(hers?.textContent).not.toContain(pt.pages.acervo.item.author.you);

    expectNoGuilt();
  });

  /**
   * ⚠️⚠️ **O CASO DO ZERO, DECIDIDO COM O §1 NA MÃO — e são DUAS decisões numa
   * tela só.**
   *
   * **(1) O meu zero é o selo ACESO.** Se o dourado só chegasse com a corrente
   * viva, ele passaria a significar "você foi bem", e sumir dele no dia em que
   * a corrente quebra seria exatamente a moldura de PERDA que o §1 do
   * `docs/plano-clube-do-livro.md` recusa — a chama do Duolingo que o glifo
   * deste selo já foi trocado para não ser. Com o tom preso a QUEM É, o
   * dourado não carrega juízo nenhum: ele é a placa que diz "esta linha é
   * você", e diz isso no primeiro dia igual ao décimo segundo.
   *
   * **(2) O zero não é desenhado como número.** "0 · Comece a sua sequência
   * hoje · Você" é um placar lido em voz alta antes do convite; o `0` é a
   * única parte da frase que fala de dívida. O selo passa a desenhar o número
   * **só quando ele existe**, e quem fica é a frase — que é o que o §1 quer
   * que se leia.
   */
  it('⚠️ o meu ZERO também é o selo aceso, e ele não desenha um número', async () => {
    await renderHome({
      streaks: {
        status: 200,
        body: [
          { userId: ME_ID, streak: 0, readToday: false },
          { userId: MARIA, streak: 4, readToday: true },
        ],
      },
    });

    const list = await screen.findByRole('list', {
      name: pt.pages.home.streak.mine,
    });
    const [mine, hers] = Array.from(list.querySelectorAll('li')).map(
      (item) => item.firstElementChild as HTMLElement,
    );

    const classesOf = (element?: HTMLElement): string[] =>
      (element?.className ?? '').split(/\s+/u);
    // Zero dias, e ainda assim dourado: o tom é de PERTENCIMENTO, não de placar.
    expect(classesOf(mine)).toContain('bg-gold-soft');
    expect(classesOf(hers)).toContain('bg-surface');

    // E a frase é o convite inteiro, sem o "0" na frente.
    expect(mine?.textContent).toBe(
      `${pt.pages.home.streak.none} · ${pt.pages.acervo.item.author.you}`,
    );
    expect(mine?.textContent).not.toContain('0');
    // A dela continua com número, porque ela tem um.
    expect(hers?.textContent).toBe(
      `${pt.pages.home.streak.days_other.replace('{{count}}', '4')} · Maria`,
    );

    expectNoGuilt();
  });

  /**
   * ⚠️ **O RÓTULO DO FEED E O RITMO DA MARGEM — duas propriedades da fatia que
   * saíram SEM acusador nenhum, medidas por mutante sobrevivente na auditoria.**
   *
   * `InicioDesktop.dc.html:105` e `Inicio.dc.html:93` desenham o rótulo em
   * monoespaçada maiúscula de 10px com `letter-spacing:0.12em` — que é
   * exatamente o `Eyebrow` (decisão I da Tarefa 41b), e não o
   * `text-sm font-semibold` que a tela usava antes. E `:104` dá o ritmo da
   * margem: `gap:18px` entre o rótulo, a corrente e as linhas.
   *
   * Medido na auditoria: devolver o `<h2 className="text-sm font-semibold
   * text-muted">` e trocar o `gap-[18px]` por `gap-2` passavam os **951**
   * testes do app. São dois mutantes, e este `it()` é o acusador dos dois.
   */
  it('⚠️ o rótulo do feed é o Eyebrow, e a margem guarda o ritmo de 18px', async () => {
    await renderHome({
      activity: {
        status: 200,
        body: [anActivity({ id: 'a-1', type: 'HIGHLIGHT' })],
      },
    });

    const label = await screen.findByText(pt.pages.home.feed.heading);
    const classes = label.className.split(/\s+/u);
    expect(classes).toContain('font-mono');
    expect(classes).toContain('text-eyebrow');
    expect(classes).toContain('uppercase');
    expect(classes).toContain('tracking-[0.12em]');
    // O desenho anterior, nominalmente recusado.
    expect(classes).not.toContain('text-sm');
    expect(classes).not.toContain('font-semibold');

    /*
      O `Eyebrow` é a TIPOGRAFIA do rótulo, não a semântica: ele é um `<span>`
      de propósito, e o `<h2>` de verdade fica por fora. Trocar um pelo outro
      é o que o componente existe para impedir.
    */
    expect(label.tagName).toBe('SPAN');
    expect(label.parentElement?.tagName).toBe('H2');

    // O ritmo da margem, que é da TELA e não do `MarginRail` (ele não fixa
    // nenhum): 18px entre o rótulo, a corrente e as linhas do feed.
    expect(label.closest('section')?.className.split(/\s+/u)).toContain(
      'gap-[18px]',
    );

    expectNoGuilt();
  });

  /**
   * ⚠️ **DECISÃO C — A MARGEM, E A GUARDA É DE VISIBILIDADE, NÃO DE PRESENÇA.**
   *
   * `InicioDesktop.dc.html:104` é a coluna de 320px com `border-left`, e ela
   * contém o rótulo (`:105`), as correntes (`:107-118`) e o feed (`:120-149`).
   * O `MarginRail` é montado **sempre**: o que muda com a largura é o filete e
   * a largura, e abaixo de 1120px ele desce para o fluxo.
   *
   * ⚠️⚠️ **A GUARDA É DE TOKEN, E NÃO DE REGEX — e a troca vem de um MUTANTE
   * SOBREVIVENTE, medido na auditoria desta fatia.**
   *
   * A primeira entrega usava `/(^|\s)(min-\[1120px\]:)?hidden(\s|$)/u`, que
   * acusa `hidden` cru e `min-[1120px]:hidden` e **deixa passar** todo o
   * resto: `max-[1119px]:hidden` (aplicado na margem: **951/951, ZERO
   * acusadores**), `max-lg:hidden`, `sm:`/`md:`/`lg:`/`print:hidden` e
   * `[@media(max-width:1119px)]:hidden`. O primeiro deles é literalmente
   * "escondi a corrente e o feed no celular", que é o que o NOME deste `it()`
   * promete impedir — e o §7.9 diz que o nome do teste é parte da guarda.
   *
   * O conserto não é mais uma alternativa na regex (a próxima variante
   * escaparia igual): é olhar o que a classe É. Toda classe do Tailwind é
   * `variante:variante:utilitário`, então o utilitário é o último segmento
   * depois de `:`. `hidden` como utilitário some da tela em ALGUMA largura;
   * `overflow-hidden`, `overflow-x-hidden` e `group-hover:overflow-hidden`
   * têm outro utilitário e ficam em paz — que é a razão de a guarda não ser um
   * `toContain('hidden')`, e continua valendo.
   */
  it('⚠️ põe corrente e feed na MARGEM, e não os esconde no celular', async () => {
    await renderHome({
      streaks: {
        status: 200,
        body: [{ userId: ME_ID, streak: 12, readToday: true }],
      },
      activity: {
        status: 200,
        body: [anActivity({ id: 'a-1', type: 'HIGHLIGHT' })],
      },
    });

    const streaks = await screen.findByRole('list', {
      name: pt.pages.home.streak.mine,
    });
    const feed = screen.getByRole('list', { name: pt.pages.home.feed.label });

    const rail = streaks.closest('aside');
    expect(rail).not.toBeNull();
    expect(feed.closest('aside')).toBe(rail);
    // A estante continua na COLUNA — a margem é o aparato, não a tela inteira.
    expect(
      screen
        .getByRole('list', { name: pt.pages.home.shelf.label })
        .closest('aside'),
    ).toBeNull();

    // É o `MarginRail`: filete e largura só acima do corte.
    const railClasses = rail?.className ?? '';
    expect(railClasses).toContain('min-[1120px]:w-80');
    expect(railClasses).toContain('min-[1120px]:border-l');

    /*
      ⚠️ **O PAR NEGATIVO, E ELE VALE NAS DUAS LARGURAS.** Nada no caminho da
      margem pode ser `hidden` cru (abaixo de 1120px é ali que a corrente e o
      feed VIVEM) **nem** `min-[1120px]:hidden` (acima do corte é ali que eles
      são desenhados). O jsdom não enxerga media query nenhuma, então as duas
      formas são invisíveis para qualquer asserção sobre o que "aparece" — e é
      por isso que a guarda é sobre a CLASSE.

      ⚠️ **E NÃO É UM `toContain('hidden')`:** ele casaria `overflow-hidden` —
      classe legítima e comum — e acusaria um defeito que não existe. Guarda
      que grita à toa é desligada, e guarda desligada não guarda nada (§7.9).

      ⚠️ **A LISTA, e não um `toBe(false)` por nó:** quando isto ficar
      vermelho, a mensagem tem de dizer QUAL classe escondeu — senão o próximo
      a ler sabe que a margem some e não sabe onde.
    */
    const hidingClasses: string[] = [];
    for (
      let node: HTMLElement | null = streaks;
      node !== null && node !== document.body;
      node = node.parentElement
    ) {
      hidingClasses.push(
        ...node.className
          .split(/\s+/u)
          .filter((name) => name.split(':').at(-1) === 'hidden'),
      );
    }
    expect(hidingClasses).toEqual([]);

    expectNoGuilt();
  });

  /**
   * ⚠️ **DECISÃO D — O `atRisk` FICA, E O ACUSADOR DIZ QUE FICA.**
   *
   * O §A.5.9 do `docs/new-ui.md` manda remover "Você vai perder a sua
   * sequência!"; o **ADR 0010** registra que o dono foi avisado de que a
   * moldura de perda contraria o §1 do plano e **reafirmou o pedido**, e a
   * precedência do `README-IA.md` põe ADR acima de spec. Uma fatia de redesenho
   * é exatamente onde a frase sumiria sem ninguém reparar — daí a asserção
   * aqui, ao lado do selo que a substituiu no resto da corrente.
   */
  it('⚠️ mantém o aviso de perda ao lado dos selos (ADR 0010 vence o §A.5.9)', async () => {
    await renderHome({
      streaks: {
        status: 200,
        body: [{ userId: ME_ID, streak: 12, readToday: false }],
      },
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.home.streak.atRisk);
    });
    // Ele mora na margem, junto da corrente de que fala — não solto no corpo.
    const warning = screen.getByText(pt.pages.home.streak.atRisk);
    expect(warning.closest('aside')).not.toBeNull();
  });

  /**
   * ⚠️⚠️ **DECISÃO F — A POSIÇÃO NO PLANO, E A ISENÇÃO SUBTRAINDO DE VERDADE.**
   *
   * `Inicio.dc.html:41` e `InicioDesktop.dc.html:42` escrevem "Dia 11 de 30" em
   * dourado, ao lado do bloco de hoje. A frase tem a forma que o
   * `COUNTER_SHAPE` proíbe, e é a ÚNICA do app isenta — por chave, em
   * `COUNTER_EXEMPT_KEYS`.
   *
   * ⚠️ **`expectNoGuiltWithPlanPosition()` E NÃO `expectNoGuilt()`, e as duas
   * são MUTUAMENTE EXCLUSIVAS** desde a rodada de correção da Tarefa 44: a
   * primeira exige **zero** subtrações, a segunda exige **pelo menos uma**.
   * Trocar uma pela outra fica vermelho no `it()` em que a troca acontece, e a
   * posição vazando num estado sem dia de hoje fica vermelha do outro lado.
   */
  it('⚠️ diz ONDE a leitura de hoje está no plano, e a isenção SUBTRAI', async () => {
    /*
      ⚠️ **A CORRENTE ENTRA NESTE FIXTURE DE PROPÓSITO — é o PAR POSITIVO da
      regra 4.** A isenção do contador está LIGADA aqui (a posição está na
      tela), e é justamente o estado em que um placar de verdade passaria
      despercebido: "11 de 30 dias" escrito num selo tem a mesma forma que a
      frase isenta. Medido: com a corrente vazia, plantar esse texto num selo
      não é sequer renderizado, e o mutante sobrevive. Com ela aqui, o
      `COUNTER_SHAPE` acusa **apesar** da isenção — que é o que a subtração por
      frase EXATA existe para garantir.
    */
    await renderHome({
      book: planWithToday(),
      streaks: {
        status: 200,
        body: [{ userId: ME_ID, streak: 12, readToday: true }],
      },
    });

    await screen.findByRole('link', {
      name: new RegExp(pt.pages.home.today.write, 'u'),
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('list', { name: pt.pages.home.streak.mine }),
      ).not.toBeNull();
    });
    // O item de hoje é o SEGUNDO de três: a posição é a ORDEM no plano, não um
    // placar de quem leu o quê.
    expect(readableText()).toContain(dayOfPlan(2, 3));

    /*
      ⚠️ **E ELA É DOURADA — o canvas a desenha assim, e nada guardava isso.**

      `Inicio.dc.html:41` usa `color:var(--gold)` e `InicioDesktop.dc.html:42`
      usa `#946d2c`, que é o mesmo token: a posição é a ÚNICA coisa dourada da
      linha de mono que abre o bloco de hoje (o `:40`/`:41` ao lado dela é
      `--text-muted`). Medido na auditoria: tirar o `tone="gold"` desta
      `Eyebrow` passava os **951** testes do app.

      O tom `gold` do `Eyebrow` emite `text-gold-strong`, e não `text-gold`:
      `--gold` dá 4,16:1 contra `--bg` num corpo de 10px, abaixo do piso de
      4,5:1. A tinta é a decisão de contraste da Tarefa 39, não o hex do
      artboard — é a mesma divergência que o próprio `Eyebrow` já declara.
    */
    const position = screen.getByText(dayOfPlan(2, 3));
    expect(position.className.split(/\s+/u)).toContain('text-gold-strong');
    expect(position.className.split(/\s+/u)).not.toContain('text-muted');

    expectNoGuiltWithPlanPosition();
  });

  /**
   * ⚠️ **O LADO INVERSO, e é o defeito que nenhum pino de contagem via:** sem
   * dia de hoje **não há posição**. Inventar "Dia 0 de 3" seria o vazio
   * anunciado que o §1 do plano proíbe — e seria, além disso, um contador de
   * verdade entrando pela porta da isenção.
   */
  it('⚠️ não anuncia posição nenhuma quando não há leitura de hoje', async () => {
    await renderHome({
      book: bookWithPlanReply(aBook({ id: 'b-hobbit' }), [
        aPlanItem({ id: 'p-ontem', date: otherDay(), order: 1 }),
      ]),
    });

    await screen.findByRole('list', { name: pt.pages.home.shelf.label });
    expect(readableText()).not.toContain(dayOfPlan(0, 1));
    expect(readableText()).not.toContain(dayOfPlan(1, 1));
    expectNoGuilt();
  });
});
