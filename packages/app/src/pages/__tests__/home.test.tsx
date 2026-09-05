import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
 * O shell autenticado inteiro, endpoint por endpoint.
 *
 * A ORDEM das rotas importa: `/clubs/` (a estante) vem antes de `/books/` (o
 * livro com o plano), porque `.../clubs/c/books` também casaria um fragmento
 * `/books`.
 */
function homeResponder(setup: HomeSetup): Responder {
  const shelf = setup.shelf ?? [booksReply([aBook()])];
  let shelfCall = 0;

  return replyByUrl(
    [
      ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
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
    expectNoGuilt();

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
      expectNoGuilt();
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
    expectNoGuilt();
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
    expectNoGuilt();
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
    expectNoGuilt();
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

  it('keeps the danger colour out of the SOURCE FILE of the home, not only out of the states rendered here', () => {
    /*
      ⚠️ O NOME ANTERIOR ERA "has no danger colour anywhere on the home, in ANY
      state", E ELE MENTIA: este teste não renderiza estado nenhum — ele lê o
      arquivo-fonte e procura duas strings. A auditoria mostrou o que o nome
      prometia e o teste não entregava (a cor por valor arbitrário, e os estados
      não varridos), e a promessa foi movida para onde ela é cumprida: a
      `expectNoGuilt` roda em TODOS os estados desta suíte, inclusive no estado
      com atalho.

      O que ESTE teste é: a rede contra a cor voltar por um estado que ninguém
      pensou em renderizar. Vale porque a home é um arquivo só.
    */
    // `process.cwd()` e não `import.meta.url`: no ambiente jsdom do vitest a
    // `import.meta.url` não é uma URL `file:`, e o `fileURLToPath` recusa. É o
    // mesmo caminho que o `ui-source-scan.test.ts` usa.
    const source = stripComments(
      readFileSync(resolve(process.cwd(), 'src', 'pages', 'home.tsx'), 'utf8'),
    );

    expect(source).not.toMatch(DANGER_STYLE);
    // E o lado positivo do par: o arquivo lido é o certo (um caminho errado
    // lançaria, mas um arquivo VAZIO passaria calado — a asserção vazia do
    // §7.4 escrita como varredura de fonte).
    expect(source).toContain('pages.home.today.write');
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
    expect(requestsTo(calls, '/clubs/')).toHaveLength(1);

    const retry = screen.getByRole('button', { name: pt.pages.home.retry });
    await act(async () => {
      fireEvent.click(retry);
    });

    await waitFor(() => {
      // ⚠️ A METADE QUE IMPORTA: repetir REFAZ a requisição. Um botão que só
      // limpasse a mensagem deixaria a pessoa olhando uma tela vazia achando
      // que tentou.
      expect(requestsTo(calls, '/clubs/')).toHaveLength(2);
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
      expect(requestsTo(calls, '/me')).toHaveLength(2);
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

    // A estante de A foi pedida e está no ar.
    await waitFor(() => {
      expect(requestsTo(calls, '/clubs/')).toHaveLength(1);
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
      <I18nextProvider
        i18n={createI18n(memoryStorage({ 'clube.locale': 'pt' }))}
      >
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
