import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  BookResponse,
  ClubMemberResponse,
  PlanItemResponse,
} from '@clube/shared';
import { localDay, localTimeZone } from '@clube/shared';
import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { en, pt } from '@clube/shared/locales';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import type { ClubSummary } from '../../club/active-club';
import { bookPath } from '../book';
import { mentionsPrivacyTerm, PRIVACY_TERMS } from './adr-0002-dom';
import {
  DANGER_STYLE,
  expectNoGuilt,
  stripComments,
  withoutDiacritics,
} from './anti-guilt-dom';
import {
  aBook,
  aPlanItem,
  booksReply,
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
 * A TELA DO LIVRO — as 16 regras da Tarefa 17.
 *
 * Entra pelo `<App />` inteiro (cabeçalho + rotas), e não pela `BookPage`
 * montada à mão, pelo mesmo motivo da home: metade do que a fatia entrega é
 * composição — a rota `/books/:bookId`, o `RequireAuth` que a protege, e o link
 * que vem da estante. Montar a página sozinha provaria uma tela que a produção
 * não tem.
 *
 * O que NÃO se testa: aparência, snapshot, e o `List`/`ListItem`/`PersonAvatar`,
 * que têm cobertura própria na Tarefa 13.
 */

/**
 * ⚠️ **O DUBLÊ DO EDITOR EXISTE AQUI SEM QUE ESTA TELA USE EDITOR NENHUM.**
 *
 * A tela do livro não escreve (e há um teste de fonte abaixo que o prova). Mas
 * um teste desta suíte TOCA em "Nova anotação" e chega na tela que escreve — e
 * lá o `React.lazy` importa `@clube/ui/editor` de verdade: ProseMirror inteiro,
 * segundos de relógio, para provar uma navegação. O dublê corta isso sem
 * afrouxar nada: o que se prova aqui é o endereço, não o editor.
 */
vi.mock('@clube/ui/editor', () => ({
  RichEditor: () => <div data-testid="editor" />,
}));

const CASAL: ClubSummary = {
  id: 'c-casal',
  name: 'Clube do Casal',
  role: 'OWNER',
};

const SESSION: Record<string, string> = {
  [TOKEN_STORAGE_KEY]: 'token-da-sessao',
};

const BOOK_ID = 'b-hobbit';

/**
 * O dia de HOJE no fuso de quem roda o teste — a MESMA conta que a tela faz.
 *
 * ⚠️ E é de propósito que seja a mesma função (§7.8): o alternativo seria
 * congelar o relógio, e aí o dia esperado passaria a depender do fuso da
 * MÁQUINA (o CI em UTC, a máquina do dono em UTC−3) — verde aqui e vermelho lá.
 * O `localDay` tem os testes dele em `packages/shared`, com os dois sentidos da
 * meia-noite; aqui o que se prova é o ELO, e ele só é elo por causa do PAR
 * negativo: o dia de hoje é destacado e **nenhum outro é**.
 */
function today(): string {
  return localDay(new Date(), localTimeZone());
}

/**
 * Um dia derivado de hoje — nunca um literal.
 *
 * ⚠️ §7.8, corolário de fixture: um `date: '2026-09-04'` escrito à mão prova a
 * regra só enquanto o relógio estiver naquele dia. O `aPlanItem()` do harness
 * tem data **notoriamente passada** justamente para não parecer "hoje"; quem
 * testa a fronteira do calendário DERIVA.
 *
 * Meio-dia UTC, e não meia-noite: somar dias a partir do meio do dia mantém a
 * conta longe de qualquer borda.
 */
function dayShifted(by: number): string {
  const instant = new Date(`${today()}T12:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + by);
  return localDay(instant, 'UTC');
}

/** As duas sobreposições têm o MESMO formato, e não o mesmo assunto. */
type Overlay = ReadonlyArray<{
  planItemId: string;
  userIds: readonly string[];
}>;

/**
 * `GET /books/:bookId` com as DUAS sobreposições de VERDADE.
 *
 * O `bookWithPlanReply` do harness fixa `writers: []` e `readers: []` — ele
 * nasceu para o atalho da home, que não olha sobreposição nenhuma. Aqui as duas
 * são o assunto, então o fixture as recebe.
 */
function bookReply(
  book: BookResponse,
  planItems: readonly PlanItemResponse[],
  writers: Overlay = [],
  readers: Overlay = [],
): Reply {
  return { status: 200, body: { book, planItems, writers, readers } };
}

/**
 * ⚠️ **O PLANO É ESCOLHIDO PARA A IMPLEMENTAÇÃO ERRADA FALHAR** (§7.2).
 *
 * Três propriedades do fixture, e cada uma mata um mutante:
 *
 * 1. **hoje é o do MEIO.** Se fosse o primeiro, "destaca o primeiro item"
 *    passaria; se fosse o último, "destaca o último" passaria. É a armadilha
 *    que a spec desta tarefa nomeia;
 * 2. **os títulos estão em ordem alfabética DECRESCENTE** e os **ids também**:
 *    uma tela que ordenasse por título ou por id acusa (a precondição está
 *    pinada em `the plan fixture is hostile to the wrong implementations`);
 * 3. **a autoria está no ÚLTIMO item**, não no primeiro nem no de hoje: um
 *    `writers` casado por ÍNDICE (em vez de por `planItemId`) põe os avatares no
 *    primeiro dia e acusa, e "hoje" não fica confundido com "quem escreveu".
 *
 * ⚠️ **O LIMITE HONESTO, e ele é o §7.2 escrito por inteiro:** "ordena por
 * `date`" é **indecidível aqui**. O domínio exige datas estritamente crescentes
 * num plano (`findPlanDateProblem`), então em qualquer fixture FIEL a ordem por
 * data COINCIDE com a ordem do `order`. Escrever um plano com datas fora de
 * ordem seria um fixture que a API não pode produzir (§7.1). A propriedade "a
 * ordem é a do `order`" é provada onde ela é decidível — no backend
 * (`get-book-with-plan.test.ts`); aqui o que se prova é que a tela **não
 * reordena** o array que recebeu.
 */
const PLAN_TITLES = ['Zumbis e anões', 'O carneiro assado', 'A porta redonda'];
const PLAN_IDS = ['p-c', 'p-b', 'p-a'];
/** O dia de hoje é o do meio — `PLAN_IDS[1]`. */
const TODAY_ID = 'p-b';
/** A autoria está no último — `PLAN_IDS[2]`. */
const WRITTEN_ID = 'p-a';
const MARIA = 'u-maria';
const MARCOS = 'u-marcos';
/**
 * As duas pessoas que a Tarefa 27 acrescentou ao clube — a que SAIU e a que
 * nunca escreveu (o `members()` abaixo explica por que cada uma existe).
 *
 * ⚠️ Elas moram AQUI, e não ao lado da fábrica, porque o `WRITERS` do plano usa
 * a `ZECA` e é avaliado na carga do módulo: declaradas depois, ficariam na zona
 * morta do `const` e o arquivo inteiro estouraria no import.
 */
const JOANA = 'u-joana';
const ZECA = 'u-a-zeca';

function plan(): PlanItemResponse[] {
  return [
    aPlanItem({
      id: 'p-c',
      order: 1,
      date: dayShifted(-2),
      title: 'Zumbis e anões',
      reference: 'p. 9-30',
    }),
    aPlanItem({
      id: 'p-b',
      order: 2,
      date: today(),
      title: 'O carneiro assado',
      reference: 'p. 31-58',
    }),
    aPlanItem({
      id: 'p-a',
      order: 3,
      date: dayShifted(2),
      title: 'A porta redonda',
      reference: null,
    }),
  ];
}

/**
 * ⚠️ **A SOBREPOSIÇÃO DE AUTORIA, ESCOLHIDA PARA A INICIAL ERRADA FALHAR**
 * (§7.2), e ela mudou na rodada de correção da Tarefa 27:
 *
 * - **a Zeca e EU**, e não "a Maria e eu": com os nomes resolvidos pelos
 *   membros, `Maria` e `Marcos` dariam a MESMA inicial ("M"), e a asserção não
 *   distinguiria "o nome de cada um" de "o meu nome nos dois";
 * - **as iniciais dos NOMES são diferentes entre si** (`Zeca` → "Z", `Marcos` →
 *   "M") **e as dos `id` são iguais** (`u-a-zeca` e `u-marcos` → "U"): uma tela
 *   que passasse o `userId` como nome poria "U" nos dois e acusa.
 */
const WRITERS = [{ planItemId: WRITTEN_ID, userIds: [ZECA, MARCOS] }];

/**
 * ⚠️ **A SOBREPOSIÇÃO DE LEITURA, ESCOLHIDA PARA AS IMPLEMENTAÇÕES ERRADAS
 * FALHAREM** (§7.2, Tarefa 32b). Quatro propriedades, cada uma matando um
 * mutante — e a precondição está pinada em
 * `the reading fixture is hostile to the wrong implementations`:
 *
 * 1. **o PRIMEIRO dia não tem leitor nenhum**: uma tela que desenhasse a marca
 *    em toda linha, ou que casasse a sobreposição por ÍNDICE, acusa;
 * 2. **quem leu HOJE é a Maria, e não eu**: o botão em primeira pessoa nasce
 *    DESMARCADO, então "o botão olha se o dia tem leitor" (em vez de "se EU
 *    li") acusa;
 * 3. **o último dia tem leitura E escrita**, e as duas listas são DIFERENTES
 *    ali (`readers: [Zeca]` contra `writers: [Zeca, Marcos]`): uma tela que
 *    desenhasse o `writers` como leitura poria duas marcas, e uma que
 *    desenhasse o `readers` como escrita poria um avatar só;
 * 4. **nenhuma entrada aponta o dia de hoje com o meu id**, que é o estado que
 *    o teste do "já li" monta À MÃO — assim ele não pode passar por acidente.
 */
const READERS = [
  { planItemId: TODAY_ID, userIds: [MARIA] },
  { planItemId: WRITTEN_ID, userIds: [ZECA] },
];

/**
 * ⚠️ **QUEM É O CLUBE — e o fixture é escolhido para o chip errado aparecer**
 * (§7.2). Quatro propriedades, cada uma matando um mutante:
 *
 * 1. **EU ESTOU NA LISTA** (`u-marcos`, o `id` que o `meReply` devolve). Uma
 *    tela que montasse "um chip por membro ativo" sem me excluir me daria DOIS
 *    chips para o mesmo recorte — "Minhas" e "De Marcos" —, com o segundo
 *    funcionando e o primeiro parecendo redundante;
 * 2. **a Joana está `ARCHIVED` e TEM NOME.** Ela não pode virar chip (decisão A
 *    da Tarefa 26a: os arquivados existem **exclusivamente** para resolver o
 *    nome de quem escreveu e saiu) **e** o nome dela tem de aparecer na
 *    anotação que ela deixou. Os dois lados têm teste;
 * 3. **há uma TERCEIRA pessoa ativa** (a Zeca), então o clube não é um casal e
 *    "o complemento de minhas" deixa de ser informação completa — que é
 *    exatamente a lacuna que esta fatia fecha. E ela **não escreveu nada**, o
 *    que dá o par que faltava: um chip cujo recorte vem vazio;
 * 4. **a ordem do `id` é o OPOSTO da ordem do nome** (`u-a-zeca` < `u-maria`,
 *    pinado abaixo): uma tela que ordenasse os chips por `userId` acusa.
 *
 * ⚠️ **O LIMITE HONESTO, e é o §7.2 escrito por inteiro:** "a tela não
 * reordena" é **indecidível** contra um fixture fiel. O `listClubMembers`
 * promete **nome crescente** (regra 9 da 26a), então em qualquer fixture fiel a
 * ordem da API COINCIDE com a ordem alfabética dos nomes — e o mutante que
 * ordena por nome sobrevive. Escrever a lista fora da ordem do nome seria um
 * fixture que a API não pode produzir (§7.1). O que É decidível é a ordem por
 * `id`, e é o que a propriedade 4 mata; a ordem em si tem teste dedicado onde
 * ela é assunto, no backend (`list-club-members.test.ts`).
 */
function members(): ClubMemberResponse[] {
  return [
    // Em ordem de NOME crescente, que é o contrato da rota da 26a.
    { userId: JOANA, name: 'Joana', role: 'MEMBER', status: 'ARCHIVED' },
    { userId: MARCOS, name: 'Marcos', role: 'OWNER', status: 'ACTIVE' },
    { userId: MARIA, name: 'Maria', role: 'ADMIN', status: 'ACTIVE' },
    { userId: ZECA, name: 'Zeca', role: 'MEMBER', status: 'ACTIVE' },
  ];
}

/** O corpo do `PUT /plan-items/:planItemId/reading-log` — o log recém-gravado. */
function readingLogReply(planItemId: string, status = 201): Reply {
  return {
    status,
    body: {
      id: `log-${planItemId}`,
      clubId: CASAL.id,
      bookId: BOOK_ID,
      userId: MARCOS,
      planItemId,
      readAt: '2026-09-05T10:00:00.000Z',
    },
  };
}

/**
 * ⚠️ **O `DELETE` RESPONDE 204 SEM CORPO, e o fixture tem de ser FIEL a isso**
 * (§7.1 escrito para tela). `raw: ''` e não `body: undefined`: o `stubFetch`
 * serializa `body ?? {}` como JSON, ou seja, um fixture sem `raw` devolveria
 * `'{}'` — um corpo que o servidor nunca manda, e que faria o caminho do
 * `safeJsonParse('')` → `undefined` (o único que a produção percorre) nunca
 * ser exercitado aqui.
 */
const NO_CONTENT: Reply = { status: 204, raw: '' };

/** `https://api.teste/plan-items/p-b/reading-log` → `p-b`. */
function planItemIdOf(url: string): string {
  return new URL(url).pathname.split('/')[2] ?? '';
}

/** O servidor honesto: `PUT` grava e devolve o log, `DELETE` devolve 204. */
function readingLogOf(request: RecordedRequest): Reply {
  return request.method === 'DELETE'
    ? NO_CONTENT
    : readingLogReply(planItemIdOf(request.url));
}

interface BookSetup {
  /** As respostas de `GET /books/:bookId`, uma por chamada. */
  book?: readonly Reply[];
  /** `PUT`/`DELETE /plan-items/:planItemId/reading-log` (Tarefa 32b). */
  readingLog?: Reply | Responder;
  /** Quem é o clube — `GET /clubs/:clubId/members` (Tarefa 26a). */
  members?: Reply | Responder;
  /** O `GET /me`, para o estado em que ainda não sei quem sou (regra 13). */
  me?: Reply;
  /** O endereço inicial. O padrão é a tela do livro. */
  path?: string;
  /** A estante, para o caminho que vem da home (regra 13). */
  shelf?: Reply;
}

/**
 * O shell autenticado inteiro, endpoint por endpoint.
 *
 * A ORDEM das rotas importa: `/clubs/` (a estante) vem antes de `/books/`,
 * porque `.../clubs/c/books` também casaria o fragmento `/books`.
 */
function bookResponder(setup: BookSetup): Responder {
  const replies = setup.book ?? [
    bookReply(aBook({ id: BOOK_ID }), plan(), WRITERS, READERS),
  ];
  let call = 0;

  return replyByUrl(
    [
      ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
      /*
        ⚠️ O REGISTRO DE LEITURA vem ANTES de tudo: o endereço é
        `/plan-items/:planItemId/reading-log`, que não casa nenhum dos outros
        fragmentos hoje — mas a ordem é a documentação de que ele é uma rota
        própria, e não uma variação de `/books/`.
      */
      [
        '/reading-log',
        setup.readingLog ?? ((request) => readingLogOf(request)),
      ],
      /*
        ⚠️ **ANTES DO `/me`, E ISSO NÃO É ESTILO — É UM FALSO VERDE MEDIDO.**

        O `replyByUrl` casa por SUBSTRING, e `/clubs/c-casal/members` **contém**
        `/me`. Com a rota de membros embaixo, a requisição do filtro recebia o
        corpo do `GET /me` — que passa no `clubMembersResponseSchema`? Não: o
        cliente valida a resposta (§6.8), então a tela caía no ramo degradado e
        o chip por pessoa simplesmente não aparecia. O teste do nome ficaria
        vermelho por um motivo que não tem nada a ver com o que ele prova.
      */
      ['/members', setup.members ?? { status: 200, body: members() }],
      ['/me', setup.me ?? meReply({ clubs: [CASAL] })],
      // ⚠️ ANTES do `/clubs/`: o acervo mora em `/clubs/:clubId/notes`, e o
      // fragmento da estante casaria a listagem de anotações primeiro.
      ['/notes', { status: 200, body: [] }],
      /*
        A COLEÇÃO DE GRIFOS (Tarefa 25): a aba "Grifos" deixou de ser
        desabilitada e NAVEGA, então um teste desta suíte chega à tela de
        grifos — que pede `GET /clubs/:clubId/highlights`. Sem esta linha o
        fragmento `/clubs/` responderia a ESTANTE para a coleção, o
        `highlightsResponseSchema` recusaria o corpo (§6.8) e a tela mostraria
        um erro: falso negativo perfeito para a asserção de navegação.
      */
      ['/highlights', { status: 200, body: [] }],
      ['/clubs/', setup.shelf ?? booksReply([aBook({ id: BOOK_ID })])],
      [
        '/books/',
        () => {
          const reply = replies[Math.min(call, replies.length - 1)];
          call += 1;
          return reply ?? { status: 500, body: { error: 'Boom' } };
        },
      ],
    ],
    { status: 500, body: { error: 'Internal Server Error' } },
  );
}

async function renderBook(setup: BookSetup = {}): Promise<RecordedRequest[]> {
  const calls = stubFetch(bookResponder(setup));

  await act(async () => {
    renderPage(<App />, {
      path: setup.path ?? bookPath(BOOK_ID),
      storage: memoryStorage({ ...SESSION }),
    });
    await Promise.resolve();
  });

  return calls;
}

function locationText(): string {
  return screen.getByTestId('location').textContent ?? '';
}

/** A tela continua de pé: existe um `h1` (regra 9 — nunca tela branca). */
function bookScreenIsUp(): boolean {
  return screen.queryByRole('heading', { level: 1 }) !== null;
}

function planRows(): HTMLElement[] {
  const list = screen.getByRole('list', { name: pt.pages.book.plan.label });
  return Array.from(list.querySelectorAll('li'));
}

/** A linha do plano que contém aquele título. */
function rowOf(title: string): HTMLElement {
  const row = planRows().find((item) => item.textContent?.includes(title));
  if (row === undefined) throw new Error(`nenhuma linha com "${title}"`);
  return row;
}

/**
 * Os avatares de quem ESCREVEU.
 *
 * ⚠️ **O `:not([data-read-mark])` é a metade de teste da decisão C** (Tarefa
 * 32b): as duas sobreposições convivem na mesma linha e as duas são
 * `role="img"` com nome acessível — sem o recorte, este helper contaria as
 * marcas de leitura como avatares de escrita e os testes da Tarefa 27 (as
 * iniciais, a frase nomeada) passariam a falar de outra coisa.
 */
function avatarsIn(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll('[role="img"]:not([data-read-mark])'));
}

/** As marcas de quem LEU. */
function readMarksIn(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll('[data-read-mark]'));
}

function labelsOf(elements: readonly HTMLElement[]): Array<string | null> {
  return elements.map((element) => element.getAttribute('aria-label'));
}

function readerLabel(name: string): string {
  return pt.pages.book.plan.readerNamed.replace('{{name}}', name);
}

function writerLabel(name: string): string {
  return pt.pages.book.plan.writerNamed.replace('{{name}}', name);
}

/** O botão "li hoje", no estado que o rótulo diz — `null` quando não há. */
function readButton(marked: boolean): HTMLElement | null {
  return screen.queryByRole('button', {
    name: marked ? pt.pages.book.read.unmark : pt.pages.book.read.mark,
  });
}

function readButtonOrThrow(marked: boolean): HTMLElement {
  const button = readButton(marked);
  if (button === null) throw new Error('o botão de leitura não está na tela');
  return button;
}

/** As requisições ao registro de leitura de UM dia. */
function readingLogCalls(
  calls: readonly RecordedRequest[],
  planItemId: string,
): RecordedRequest[] {
  return requestsTo(calls, `/plan-items/${planItemId}/reading-log`);
}

function linkIn(row: HTMLElement): HTMLElement {
  const link = row.querySelector('a');
  if (link === null) throw new Error('a linha do plano não é um link');
  return link;
}

async function press(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

/**
 * ⚠️ **A VARREDURA ANTI-CULPA — REGRA 5, e ela mora num módulo COMUM.**
 *
 * `docs/plano-clube-do-livro.md` §1: *"o sistema não pune ausência de registro;
 * valoriza qualquer registro útil. Quem está atrasado não vê dívida vermelha
 * nem 'você falhou 3 dias'."* Esta é a tela onde a cobrança nasceria: trinta
 * dias em lista, a maioria sem anotação.
 *
 * ⚠️ **A PARTIÇÃO É A DO §7.9, E ELA NÃO SE REABRE AQUI.** O **vocabulário** é
 * propriedade do CATÁLOGO, e a guarda dele é
 * `packages/shared/src/locales/__tests__/anti-guilt.test.ts`, que percorre `pt`
 * **e** `en` inteiros. O que **não** é catálogo é DOM — cor, número renderizado
 * a partir de dado, e a palavra que entrou na tela sem passar pelo `t()` —, e é
 * o que a `expectNoGuilt` de `./anti-guilt-dom` varre.
 *
 * ⚠️ **A VERSÃO FORTE NASCEU AQUI E FICOU SÓ AQUI**, e isso era o defeito: a
 * `home.test.tsx` continuou com a fraca da Tarefa 16 (palavras inteiras, sem
 * diacrítico, sem regex de placar), e `"Você deixou 3 dias passarem"` dava 14
 * acusadores nesta suíte e **zero** na home. Uma guarda com o mesmo nome e
 * força diferente é pior que nenhuma. Hoje é uma só, importada pelas três
 * telas.
 *
 * E ela roda em **TODOS** os estados desta suíte — o estado feliz incluído, que
 * na Tarefa 16 foi exatamente o que faltava.
 */

function pageSource(file: string): string {
  // `process.cwd()` e não `import.meta.url`: no ambiente jsdom do vitest a
  // `import.meta.url` não é uma URL `file:`, e o `fileURLToPath` recusa.
  return readFileSync(resolve(process.cwd(), 'src', 'pages', file), 'utf8');
}

function bookSource(): string {
  return pageSource('book.tsx');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the fixture of this suite is hostile to the wrong implementations (§7.2)', () => {
  it('has today in the MIDDLE, and titles and ids in reverse alphabetical order', () => {
    /*
      ⚠️ A PRECONDIÇÃO PINADA, e sem ela os testes de ordem e de destaque
      passariam por acidente — foi assim que a ordem dos clubes da Tarefa 16
      enganou uma auditoria inteira. Se alguém renomear um item do plano e a
      coincidência voltar, é ESTE teste que fica vermelho, e o nome dele diz o
      que consertar.
    */
    const items = plan();
    expect(items.map((item) => item.title)).toEqual(PLAN_TITLES);
    expect(items.map((item) => item.id)).toEqual(PLAN_IDS);

    // Hoje não é o primeiro nem o último: "destaca o primeiro" e "destaca o
    // último" não podem passar.
    expect(items[1]?.id).toBe(TODAY_ID);
    expect(items[1]?.date).toBe(today());
    expect(items[0]?.date).not.toBe(today());
    expect(items[2]?.date).not.toBe(today());

    // Ordenar por título ou por id daria OUTRA ordem que não a da API.
    expect([...PLAN_TITLES].sort()).not.toEqual(PLAN_TITLES);
    expect([...PLAN_IDS].sort()).not.toEqual(PLAN_IDS);

    // E a autoria está no ÚLTIMO item: um `writers` casado por índice acusa.
    expect(WRITERS[0]?.planItemId).toBe(items[2]?.id);
  });

  it('the reading fixture is hostile to the wrong implementations too (task 32b)', () => {
    const items = plan();
    const days = READERS.map((entry) => entry.planItemId);

    // 1. O PRIMEIRO dia não tem leitor: "marca em toda linha" e "casou por
    //    índice" não passam.
    expect(days).not.toContain(items[0]?.id);
    // 2. Quem leu HOJE não sou eu: o botão em primeira pessoa nasce
    //    desmarcado, e "o dia tem leitor" ≠ "eu li".
    const today = READERS.find((entry) => entry.planItemId === TODAY_ID);
    expect(today?.userIds).toEqual([MARIA]);
    expect(today?.userIds).not.toContain(MARCOS);
    // 3. O último dia tem leitura E escrita, e as duas listas DIFEREM ali:
    //    trocar uma pela outra muda a contagem de marcas dos dois lados.
    expect(days).toContain(WRITTEN_ID);
    expect(
      READERS.find((entry) => entry.planItemId === WRITTEN_ID)?.userIds,
    ).not.toEqual(WRITERS[0]?.userIds);
    // 4. E as duas frases acessíveis são diferentes no CATÁLOGO — se um dia
    //    alguém as igualar, é aqui que o vermelho aparece, antes de a asserção
    //    de tela virar tautologia (a lição nº 16 do MVP 2).
    expect(pt.pages.book.plan.readerNamed).not.toBe(
      pt.pages.book.plan.writerNamed,
    );
    expect(pt.pages.book.plan.reader).not.toBe(pt.pages.book.plan.writer);
  });
});

describe('the book screen draws the book and its plan (rules 1, 2)', () => {
  it('loads GET /books/:bookId ONCE and draws the book and every day of the plan (rule 1)', async () => {
    const calls = await renderBook({
      book: [
        bookReply(
          aBook({ id: BOOK_ID, title: 'O Hobbit', author: 'J. R. R. Tolkien' }),
          plan(),
          WRITERS,
        ),
      ],
    });

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { level: 1, name: 'O Hobbit' }),
      ).not.toBeNull();
    });
    // O cadastro do livro está na tela, não só o plano.
    expect(screen.queryByText('J. R. R. Tolkien')).not.toBeNull();
    // Os três dias, com o tema que o admin cadastrou.
    expect(planRows()).toHaveLength(3);
    for (const title of PLAN_TITLES) {
      expect(screen.queryByText(title)).not.toBeNull();
    }
    // UMA requisição, e ao livro do CAMINHO — não a dois, não em laço.
    expect(requestsTo(calls, '/books/').map((call) => call.url)).toEqual([
      `https://api.teste/books/${BOOK_ID}`,
    ]);
    expectNoGuilt();
  });

  it('keeps the order the API returned, without reordering it (rule 2)', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    /*
      A ordem do `order` é regra de PRODUTO e vive no `getBookWithPlan`. A tela
      não reordena — duas ordens seriam duas verdades, e a que a pessoa vê
      mudaria com a tela. O fixture é hostil a "ordena por título", "ordena por
      id" e a um `reverse()`; o limite (ordenar por data é indecidível) está no
      docblock do `plan()`.
    */
    const titles = planRows().map((row) =>
      PLAN_TITLES.find((title) => row.textContent?.includes(title)),
    );
    expect(titles).toEqual(PLAN_TITLES);
    expectNoGuilt();
  });

  it('shows the day and the reference of each item, and no reference when there is none', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    // O trecho do dia é o que diz o que ler; o dia é o que situa no mês.
    expect(rowOf('O carneiro assado').textContent).toContain('p. 31-58');
    // `reference: null` não vira "null" nem "undefined" na tela.
    const withoutReference = rowOf('A porta redonda').textContent ?? '';
    expect(withoutReference).not.toContain('null');
    expect(withoutReference).not.toContain('undefined');
    expectNoGuilt();
  });
});

describe('⚠️ ONLY TODAY IS HIGHLIGHTED, AND NOTHING ELSE IS (rules 3, 4)', () => {
  it('marks the day whose date is the localDay of the browser (rule 3)', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    /*
      ⚠️ Hoje é o item do MEIO (a precondição está pinada acima), então nem
      "destaca o primeiro" nem "destaca o último" sobrevivem a esta asserção.

      ⚠️ E O QUE ESTE TESTE NÃO PROVA, com o endereço de onde ele É provado: que
      o dia é calculado no FUSO de quem olha, e não em `'UTC'`. Em jsdom o fuso
      do processo É o do teste, e os dois só divergem em certas horas — o teste
      seria verde ou vermelho conforme a hora da suíte (§7.10). A propriedade
      vive em `packages/shared/src/__tests__/local-day.test.ts`, que dá dois
      fusos e exige dois dias.
    */
    expect(rowOf('O carneiro assado').textContent).toContain(
      pt.pages.book.plan.today,
    );
    expectNoGuilt();
  });

  it('marks NO other day — not the past ones, not the future ones (rule 4)', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    /*
      As DUAS metades. "Hoje" aparece UMA vez (um `getAllByText` de tamanho 1
      recusa "marca todos"), e a marca VISUAL — o anel de destaque — está só na
      linha de hoje. Sem a segunda, uma tela que desenhasse o anel em todas as
      linhas passaria, porque a palavra continuaria única.

      E a ausência de cobrança no dia PASSADO é o que o `expectNoGuilt` varre:
      sem vermelho, sem contagem, sem "atrasado".
    */
    expect(screen.getAllByText(pt.pages.book.plan.today)).toHaveLength(1);

    const highlighted = planRows().filter((row) =>
      /ring-accent/u.test(linkIn(row).getAttribute('class') ?? ''),
    );
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]?.textContent).toContain('O carneiro assado');
    expectNoGuilt();
  });

  it('reads the day of the plan in the TIME ZONE of whoever is looking, not in UTC', async () => {
    /*
      ⚠️ **O ELO `localDay` ↔ TELA, E ELE NÃO ESTAVA PINADO** — achado da
      revisão da Tarefa 17, e o §7.10 do `docs/CONVENCOES-CODIGO.md` aplicado à
      risca.

      O teste vizinho (`marks the day whose date is the localDay of the
      browser`) dizia no comentário que a propriedade do FUSO é indecidível em
      jsdom, e apontava para `packages/shared/.../local-day.test.ts`. Isso era
      verdade **enquanto o relógio fosse o de agora**: MEDIDO, trocar a tela por
      `new Date().toISOString().slice(0, 10)` sobrevivia à suíte, e só ficaria
      vermelho se ela rodasse entre 21h e 24h locais — cara-ou-coroa.

      As duas ferramentas que o §7.10 manda tentar antes de declarar algo
      indecidível resolvem: **escolher o ambiente** (`TZ` fixo no
      `vitest.config.ts`) e **congelar o relógio**. Às 02:00 UTC do dia 5, em
      `America/Sao_Paulo` (UTC−3) ainda são 23:00 do dia **4** — as duas
      respostas divergem por construção, todo dia, em qualquer máquina.

      `toFake: ['Date']` e não os timers inteiros: o `waitFor` precisa de
      `setTimeout` de verdade.
    */
    expect(process.env['TZ']).toBe('America/Sao_Paulo');

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-05T02:00:00Z'));

    try {
      // A precondição pinada (§7.2/§7.8): as duas contas dão dias DIFERENTES.
      expect(new Date().toISOString().slice(0, 10)).toBe('2026-09-05');
      expect(localDay(new Date(), localTimeZone())).toBe('2026-09-04');

      await renderBook({
        book: [
          bookReply(aBook({ id: BOOK_ID }), [
            aPlanItem({
              id: 'p-vespera',
              order: 1,
              date: '2026-09-04',
              title: 'A vespera',
            }),
            aPlanItem({
              id: 'p-seguinte',
              order: 2,
              date: '2026-09-05',
              title: 'O dia seguinte',
            }),
          ]),
        ],
      });

      await waitFor(() => {
        expect(planRows()).toHaveLength(2);
      });
      // O dia de quem OLHA é o 4. Uma tela que lesse o dia em UTC marcaria o 5.
      expect(rowOf('A vespera').textContent).toContain(
        pt.pages.book.plan.today,
      );
      expect(rowOf('O dia seguinte').textContent).not.toContain(
        pt.pages.book.plan.today,
      );
      expectNoGuilt();
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks no day at all when the plan has no day of today', async () => {
    /*
      O par negativo, e sem ele o teste acima seria tautologia: um "Hoje"
      escrito em toda linha, ou um destaque incondicional no segundo item,
      passaria. Este é o estado de quem parou de ler há duas semanas — o caso
      realista do §1 — e a tela não diz uma palavra sobre isso.
    */
    await renderBook({
      book: [
        bookReply(aBook({ id: BOOK_ID }), [
          aPlanItem({ id: 'p-1', order: 1, date: dayShifted(-10) }),
          aPlanItem({ id: 'p-2', order: 2, date: dayShifted(-9) }),
        ]),
      ],
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(2);
    });
    expect(screen.queryByText(pt.pages.book.plan.today)).toBeNull();
    expect(
      planRows().filter((row) =>
        /ring-accent/u.test(linkIn(row).getAttribute('class') ?? ''),
      ),
    ).toEqual([]);
    expectNoGuilt();
  });
});

describe('who already wrote, and NEVER how much (rules 6, 7)', () => {
  it('shows one avatar per person, with no number anywhere (rule 6)', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const row = rowOf('A porta redonda');
    // Duas pessoas escreveram: dois avatares, e é a única coisa que a
    // sobreposição diz.
    expect(avatarsIn(row)).toHaveLength(2);
    /*
      ⚠️ **NENHUM NÚMERO AO LADO DO AVATAR** — o §1 virando teste. Não é só o
      "+2" de estouro: qualquer dígito naquele espaço é contagem, e contagem é
      placar ("incentivo por presença, não por comparação"). As iniciais são
      letras; um contador seria dígito.
      (O `expectNoGuilt` varre a tela inteira; esta asserção fecha o cerco no
      lugar exato onde o número nasceria.)
    */
    for (const avatar of avatarsIn(row)) {
      expect(avatar.textContent ?? '').not.toMatch(/\d/u);
      // Sozinho, o avatar precisa de nome acessível — quem usa leitor de tela
      // ouviria "imagem" e nada mais.
      expect(avatar.getAttribute('aria-label')).not.toBeNull();
    }
    expectNoGuilt();
  });

  it('⚠️ gives EVERY avatar of the plan the real name — spoken and visual (rule 7 of the fix round)', async () => {
    /*
      ⚠️ **AS DUAS METADES DO NOME, NA MESMA TELA.** A Tarefa 17 pôs
      `name={null}` em todo avatar do plano (o `writers` devolve só `userId`, e
      a inicial tirada de um UUID tem cara de inicial e não é de ninguém); a
      Tarefa 18 pagou a metade do `me`; a 26a entregou a rota dos nomes.

      A primeira versão da Tarefa 27 deu nome ao ACERVO e deixou ESTA
      sobreposição no glifo neutro — a mesma pessoa era "Maria" embaixo e
      "alguém do clube" dois dedos acima, visível ao dono no primeiro scroll.

      Fixture hostil (§7.2): `Zeca` → "Z" e `Marcos` → "M" são iniciais
      DIFERENTES entre si, e os dois `id` (`u-a-zeca`, `u-marcos`) dariam "U" —
      então "passou o `userId` como nome" acusa, e "usou o meu nome nos dois"
      também.
    */
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const avatars = avatarsIn(rowOf('A porta redonda'));
    const texts = avatars.map((avatar) => avatar.textContent ?? '');
    // A inicial de CADA um, e nenhuma delas é a do UUID.
    expect([...texts].sort()).toEqual(['M', 'Z']);
    expect(texts).not.toContain('U');
    // E a metade FALADA: o nome DENTRO da frase, nunca o nome cru — o
    // "escreveu neste dia" é o que dá sentido ao avatar sozinho.
    const labels = avatars.map((avatar) => avatar.getAttribute('aria-label'));
    expect([...labels].sort()).toEqual(
      [
        pt.pages.book.plan.writerNamed.replace('{{name}}', 'Marcos'),
        pt.pages.book.plan.writerNamed.replace('{{name}}', 'Zeca'),
      ].sort(),
    );
    expectNoGuilt();
  });

  it('⚠️ falls back to the generic phrase and the neutral glyph when it does not know the people', async () => {
    /*
      O estado real de quem não conhece as pessoas — e é a propriedade que a
      Tarefa 17 instalou, agora onde ela ainda vale: `GET /members` que falhou.
      O `me` continua conhecido, então a assimetria é exatamente a que a Tarefa
      18 comprou: a MINHA inicial de verdade, e o glifo neutro para quem eu não
      sei nomear — nunca a primeira letra do UUID.
    */
    await renderBook({
      members: { status: 500, body: { error: 'Internal Server Error' } },
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const avatars = avatarsIn(rowOf('A porta redonda'));
    const texts = avatars.map((avatar) => avatar.textContent ?? '');
    expect(texts).toContain('M');
    expect(texts).toContain('');
    expect(texts).not.toContain('U');
    expect(avatars.some((avatar) => avatar.querySelector('svg') !== null)).toBe(
      true,
    );
    // E a frase genérica no avatar sem nome, com a nomeada no meu.
    const labels = avatars.map((avatar) => avatar.getAttribute('aria-label'));
    expect(labels).toContain(pt.pages.book.plan.writer);
    expect(labels).toContain(
      pt.pages.book.plan.writerNamed.replace('{{name}}', 'Marcos'),
    );
    expectNoGuilt();
  });

  it('puts the avatars on the day the writers entry names, not on the first row (rule 6)', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    // A entrada de `writers` aponta o ÚLTIMO item: um casamento por ÍNDICE
    // poria os avatares no primeiro dia, e é isto que o acusa.
    expect(avatarsIn(rowOf('A porta redonda'))).toHaveLength(2);
    expect(avatarsIn(rowOf('Zumbis e anões'))).toHaveLength(0);
    expectNoGuilt();
  });

  it('shows nothing in the place of a day nobody wrote on — not even "nobody" (rule 7)', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    /*
      A ausência é SILENCIOSA. "Ninguém escreveu" é a cobrança escrita com boas
      intenções: ela transforma um dia sem anotação numa lacuna anunciada, que é
      exatamente o que o §1 proíbe. O dia continua tocável — é assim que se
      escreve nele.
    */
    const quiet = rowOf('Zumbis e anões');
    expect(avatarsIn(quiet)).toHaveLength(0);
    expect(withoutDiacritics(quiet.textContent ?? '')).not.toContain('ninguem');
    expect(linkIn(quiet).getAttribute('href')).toBe(
      `/books/${BOOK_ID}/days/p-c`,
    );
    expectNoGuilt();
  });
});

describe('⚠️ WHO ALREADY READ EACH DAY, AND NEVER HOW MANY (task 32b, rules 5 to 9)', () => {
  it('shows one mark per reader, on the day the entry names, in the order of the plan (rule 5)', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    /*
      Uma marca por leitor, no dia que a entrada nomeia — e a ORDEM é a do
      plano, não a do array `readers` nem a alfabética. O fixture põe a Maria
      no dia do MEIO e a Zeca no ÚLTIMO: um casamento por índice poria as duas
      nos dois primeiros, e uma tela que varresse `readers` em vez de
      `planItems` inverteria nada — por isso a asserção é sobre a sequência
      lida do DOM, linha a linha.
    */
    expect(planRows().map((row) => readMarksIn(row).length)).toEqual([0, 1, 1]);

    const marks = planRows().flatMap((row) => readMarksIn(row));
    expect(labelsOf(marks)).toEqual([
      readerLabel('Maria'),
      readerLabel('Zeca'),
    ]);
    expectNoGuilt();
  });

  it('leaves a day nobody read without a mark and without a phrase (rule 6)', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    /*
      A ausência é SILENCIOSA — o mesmo que o dia sem autoria já faz. "Ninguém
      leu este dia" é a cobrança escrita com boas intenções: ela transforma um
      dia sem leitura numa lacuna anunciada (§1 do plano de produto).
    */
    const quiet = rowOf('Zumbis e anões');
    expect(readMarksIn(quiet)).toHaveLength(0);
    expect(avatarsIn(quiet)).toHaveLength(0);
    const spoken = withoutDiacritics(quiet.textContent ?? '');
    expect(spoken).not.toContain('ninguem');
    expect(spoken).not.toContain('leu');

    expectNoGuilt();
  });

  it('⚠️ says nothing about reading on a day that has WRITING and no reading (rule 6)', async () => {
    /*
      ⚠️ **A SEGUNDA METADE, E ELA VEIO DE UMA MEDIÇÃO QUE DEU ZERO.** O teste
      acima olha o dia em que ninguém leu **nem escreveu** — e aí a tela nem
      monta a sobreposição (o `start` do `ListItem` fica `undefined`). Medido:
      um `"Ninguém leu este dia"` plantado DENTRO do `ReadMarks`, no ramo da
      lista vazia, dava **0 acusadores em 45 testes**, porque aquele ramo não
      era alcançado por fixture nenhum.

      O dia que o alcança é o que tem ESCRITA e não tem leitura: a sobreposição
      existe por causa dos avatares, e o `ReadMarks` recebe `[]`. É o buraco
      que este teste fecha — e é o §7.4 na forma de fixture, não de asserção.
    */
    await renderBook({
      book: [bookReply(aBook({ id: BOOK_ID }), plan(), WRITERS, [])],
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const written = rowOf('A porta redonda');
    expect(avatarsIn(written)).toHaveLength(2);
    expect(readMarksIn(written)).toHaveLength(0);
    expect(withoutDiacritics(written.textContent ?? '')).not.toContain('leu');
    expect(readableText()).not.toContain(pt.pages.book.plan.reader);
    expectNoGuilt();
  });

  it('⚠️ tells READING apart from WRITING on the same row, without leaning on colour (rule 7)', async () => {
    /*
      ⚠️ **DECISÃO C, e ela existe por causa da lição nº 12 do MVP 2** (varrer
      palavra não pega desenho, e cor sozinha não é portadora) e da nº 16
      ("duas coisas que falam a mesma frase", que já mentiu numa tela deste
      projeto).

      As duas sobreposições dividem a linha do último dia. As DUAS metades:

      - **forma**: a marca de leitura é um glifo (SVG, sem letra nenhuma) num
        quadrado; o avatar de escrita é a INICIAL (letra, sem SVG) num círculo.
        Um teste que olhasse só o rótulo passaria com as duas desenhadas
        idênticas;
      - **fala**: os textos acessíveis não são iguais — e não são iguais NEM
        para a mesma pessoa, que é o caso que a Zeca cobre (ela leu E escreveu
        naquele dia).
    */
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const row = rowOf('A porta redonda');
    const marks = readMarksIn(row);
    const avatars = avatarsIn(row);
    expect(marks).toHaveLength(1);
    expect(avatars).toHaveLength(2);

    const mark = marks[0];
    if (mark === undefined) throw new Error('unreachable: length asserted');
    expect(mark.querySelector('svg')).not.toBeNull();
    expect(mark.textContent).toBe('');

    for (const avatar of avatars) {
      expect(avatar.querySelector('svg')).toBeNull();
      expect(avatar.textContent ?? '').toMatch(/^\p{Lu}+$/u);
    }

    // E a MESMA pessoa (a Zeca) é falada de dois jeitos diferentes.
    expect(labelsOf(marks)).toEqual([readerLabel('Zeca')]);
    expect([...labelsOf(avatars)].sort()).toEqual(
      [writerLabel('Zeca'), writerLabel('Marcos')].sort(),
    );
    expect(labelsOf(marks)[0]).not.toBe(labelsOf(avatars)[0]);
    expectNoGuilt();
  });

  it('names WHO read, with the same nameOfWriter the rest of the screen uses (rule 8)', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    // A Maria não escreveu em dia nenhum: o nome dela na tela só pode ter
    // vindo do `GET /clubs/:clubId/members`, pelo mesmo `nameOfWriter`.
    expect(labelsOf(readMarksIn(rowOf('O carneiro assado')))).toEqual([
      readerLabel('Maria'),
    ]);
    expectNoGuilt();
  });

  it('falls back to the NEUTRAL reading phrase when it does not know the people (rule 8)', async () => {
    await renderBook({
      members: { status: 500, body: { error: 'Internal Server Error' } },
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    /*
      A frase neutra é a versão de LEITURA da que a escrita já tinha — nunca a
      de escrita reaproveitada, que diria "escreveu" sobre quem só leu.
    */
    expect(labelsOf(readMarksIn(rowOf('O carneiro assado')))).toEqual([
      pt.pages.book.plan.reader,
    ]);
    expect(readableText()).not.toContain(readerLabel('Maria'));
    expectNoGuilt();
  });

  it('⚠️ puts NO number next to the marks — one more reader is one more mark (rule 9)', async () => {
    /*
      ⚠️ Três leitores no mesmo dia é o cenário em que o "+N" de estouro nasce.
      Não há: três marcas. O `expectNoGuilt` varre o `COUNTER_SHAPE` na tela
      inteira; estas asserções fecham o cerco no lugar exato onde o número
      apareceria.
    */
    await renderBook({
      book: [
        bookReply(aBook({ id: BOOK_ID }), plan(), WRITERS, [
          { planItemId: TODAY_ID, userIds: [MARIA, ZECA, JOANA] },
        ]),
      ],
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const row = rowOf('O carneiro assado');
    expect(readMarksIn(row)).toHaveLength(3);
    for (const mark of readMarksIn(row)) {
      expect(mark.textContent ?? '').not.toMatch(/\d/u);
    }
    expect(row.textContent ?? '').not.toMatch(/\d\s*(?:leitor|pessoa)/u);
    expectNoGuilt();
  });
});

describe('⚠️ "LI HOJE" — THE FIRST-PERSON TOUCH (task 32b, rules 10 to 14)', () => {
  it('offers the touch ONLY when the plan has a day of today (rule 10)', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    expect(readButton(false)).not.toBeNull();
    expectNoGuilt();
  });

  it('⚠️ offers NO touch at all when the plan has no day of today (rule 10, decision E)', async () => {
    /*
      ⚠️ **A AUSÊNCIA, E NÃO UM BOTÃO DESABILITADO** (decisão E). Um livro do
      mês passado não tem "hoje"; mostrar o toque cinzento seria cobrança
      silenciosa ("você não pode mais"). É o anti-culpa aplicado ao espaço
      vazio, o mesmo que o dia sem autoria já faz.
    */
    await renderBook({
      book: [
        bookReply(aBook({ id: BOOK_ID }), [
          aPlanItem({ id: 'p-1', order: 1, date: dayShifted(-10) }),
          aPlanItem({ id: 'p-2', order: 2, date: dayShifted(-9) }),
        ]),
      ],
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(2);
    });
    expect(readButton(false)).toBeNull();
    expect(readButton(true)).toBeNull();
    // E nem desabilitado, nem com outro nome: NENHUM botão de leitura.
    expect(screen.queryAllByRole('button', { name: /hoje/iu })).toHaveLength(0);
    expectNoGuilt();
  });

  it('says the CURRENT state in the first person, and the state comes from MY reading (rule 10)', async () => {
    /*
      No fixture padrão quem leu hoje é a MARIA. Se o botão olhasse "o dia tem
      leitor" em vez de "EU li", ele já nasceria marcado — e é por isso que o
      par negativo vem antes do positivo.
    */
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    expect(readButton(false)).not.toBeNull();
    expect(readButton(true)).toBeNull();
    expectNoGuilt();
  });

  it('says the OTHER state when I am among the readers of today (rule 10)', async () => {
    await renderBook({
      book: [
        bookReply(aBook({ id: BOOK_ID }), plan(), WRITERS, [
          { planItemId: TODAY_ID, userIds: [MARIA, MARCOS] },
        ]),
      ],
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    expect(readButton(true)).not.toBeNull();
    expect(readButton(false)).toBeNull();
    expectNoGuilt();
  });

  it('⚠️ does not show itself as marked while it still does not know who I am (rule 10)', async () => {
    /*
      ⚠️ **O RAMO `me === null`, E ELE NÃO TINHA TESTE.** O `BookSetup.me` do
      harness existe desde a Tarefa 17 e nenhum teste o usava — era inócuo até
      esta fatia, porque nenhuma decisão dependia do `me`. Agora o estado
      INICIAL do botão depende: `me !== null && readers.includes(me.id)`.

      Com o `/me` fora do ar, o `useActiveClub` responde `me: null` (é o
      `withoutMe` de `club/active-club.tsx`, o mesmo para `loading` e
      `failed`), e hoje quem leu é a Maria. As duas coisas erradas que este
      teste mata:

      - um `me?.id` sem a guarda, com o `includes(undefined)` virando `false`
        por acidente em vez de por decisão — aqui é igual, mas a próxima
        pessoa saberia que o ramo tem dono;
      - qualquer leitura do estado que ignore o `me` e olhe "o dia tem
        leitor": ela mostraria "li hoje — tirar a marca" para quem o app ainda
        nem sabe quem é.

      A resposta honesta para "ainda não sei quem é você" é oferecer o GESTO,
      nunca a desfeita dele.
    */
    await renderBook({
      me: { status: 500, body: { error: 'Internal Server Error' } },
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    expect(readButton(false)).not.toBeNull();
    expect(readButton(true)).toBeNull();
    // E a marca da Maria continua lá: quem leu é informação do clube, e não
    // depende de o app saber quem está olhando.
    expect(readMarksIn(rowOf('O carneiro assado'))).toHaveLength(1);
    expectNoGuilt();
  });

  it('marks with ONE PUT, to TODAY plan item, counted (rule 11)', async () => {
    const calls = await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    // O lado `0` do par (§7.3): antes do toque não há escrita nenhuma.
    expect(requestsTo(calls, '/reading-log')).toHaveLength(0);

    await press(readButtonOrThrow(false));

    const written = readingLogCalls(calls, TODAY_ID);
    expect(written).toHaveLength(1);
    expect(written[0]?.method).toBe('PUT');
    // E em NENHUM outro dia: a tela não oferece auditoria retroativa.
    expect(requestsTo(calls, '/reading-log')).toHaveLength(1);
    expectNoGuilt();
  });

  it('unmarks with ONE DELETE, counted (rule 11)', async () => {
    const calls = await renderBook({
      book: [
        bookReply(aBook({ id: BOOK_ID }), plan(), WRITERS, [
          { planItemId: TODAY_ID, userIds: [MARCOS] },
        ]),
        bookReply(aBook({ id: BOOK_ID }), plan(), WRITERS, []),
      ],
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    await press(readButtonOrThrow(true));

    const written = readingLogCalls(calls, TODAY_ID);
    expect(written).toHaveLength(1);
    expect(written[0]?.method).toBe('DELETE');
    await waitFor(() => {
      expect(readButton(false)).not.toBeNull();
    });
    expectNoGuilt();
  });

  it('⚠️ refetches the book after marking, and the overlay shows the new state (rule 12)', async () => {
    /*
      ⚠️ **DECISÃO F.** Não existe rota de sobreposição (medido na Tarefa 32),
      então atualizar só o estado local faria a marca do ATOR aparecer e a dos
      outros envelhecer — e a divergência só apareceria no próximo
      recarregamento. A prova é por CONTAGEM de `GET /books/` (§7.3): uma tela
      que só mexesse no estado local mostraria a marca nova e faria UMA
      requisição.
    */
    const calls = await renderBook({
      book: [
        bookReply(aBook({ id: BOOK_ID }), plan(), WRITERS, READERS),
        bookReply(aBook({ id: BOOK_ID }), plan(), WRITERS, [
          { planItemId: TODAY_ID, userIds: [MARIA, MARCOS] },
          { planItemId: WRITTEN_ID, userIds: [ZECA] },
        ]),
      ],
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    expect(requestsTo(calls, '/books/')).toHaveLength(1);
    expect(readMarksIn(rowOf('O carneiro assado'))).toHaveLength(1);

    await press(readButtonOrThrow(false));

    await waitFor(() => {
      expect(requestsTo(calls, '/books/')).toHaveLength(2);
    });
    await waitFor(() => {
      expect(readButton(true)).not.toBeNull();
    });
    // A sobreposição inteira foi relida: a marca da Maria continua lá, e a
    // minha entrou ao lado.
    expect(labelsOf(readMarksIn(rowOf('O carneiro assado'))).sort()).toEqual(
      [readerLabel('Marcos'), readerLabel('Maria')].sort(),
    );
    expectNoGuilt();
  });

  it('⚠️ a double tap does NOT send two PUTs (rule 13)', async () => {
    /*
      ⚠️ A Tarefa 32 já matou o 500 do lado do servidor (o `PUT` é idempotente);
      aqui é o lado que evita a CORRIDA. A resposta fica pendurada de
      propósito: é o único jeito de tocar duas vezes com a primeira requisição
      ainda no ar. A prova é a CONTAGEM, nunca a ausência de erro (§7.3).
    */
    let release: (() => void) | undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });

    const calls = await renderBook({
      readingLog: async (request) => {
        await inFlight;
        return readingLogOf(request);
      },
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const button = readButtonOrThrow(false);
    await press(button);
    expect(readingLogCalls(calls, TODAY_ID)).toHaveLength(1);

    // O segundo toque, com a primeira requisição ainda no ar.
    await press(button);
    expect(readingLogCalls(calls, TODAY_ID)).toHaveLength(1);
    expectNoGuilt();

    release?.();
    await waitFor(() => {
      expect(requestsTo(calls, '/books/')).toHaveLength(2);
    });
    expect(readingLogCalls(calls, TODAY_ID)).toHaveLength(1);
    expectNoGuilt();
  });

  it('keeps the list, says so without charging anyone, and the RETRY works (rule 14)', async () => {
    /*
      ⚠️ **DECISÃO G**: a falha não desfaz a tela. O recado fala do registro que
      não foi gravado, nunca da pessoa que não leu — e o `expectNoGuilt` roda
      NESTE estado, que é onde a frase de cobrança nasceria.
    */
    let attempts = 0;
    const calls = await renderBook({
      readingLog: (request) => {
        attempts += 1;
        return attempts === 1
          ? { status: 500, body: { error: 'Internal Server Error' } }
          : readingLogOf(request);
      },
      book: [
        bookReply(aBook({ id: BOOK_ID }), plan(), WRITERS, READERS),
        bookReply(aBook({ id: BOOK_ID }), plan(), WRITERS, [
          { planItemId: TODAY_ID, userIds: [MARIA, MARCOS] },
        ]),
      ],
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    await press(readButtonOrThrow(false));

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.book.read.failed)).not.toBeNull();
    });
    // A lista NÃO se perdeu, e nada da API foi para a tela.
    expect(planRows()).toHaveLength(3);
    expect(readableText()).not.toContain('Internal Server Error');
    expect(bookScreenIsUp()).toBe(true);
    expect(requestsTo(calls, '/books/')).toHaveLength(1);
    expectNoGuilt();

    // ⚠️ A METADE QUE IMPORTA: repetir REFAZ a requisição.
    await press(screen.getByRole('button', { name: pt.pages.book.retry }));

    await waitFor(() => {
      expect(readingLogCalls(calls, TODAY_ID)).toHaveLength(2);
    });
    await waitFor(() => {
      expect(readButton(true)).not.toBeNull();
    });
    expect(screen.queryByText(pt.pages.book.read.failed)).toBeNull();
    expectNoGuilt();
  });

  it('shows the marking in flight without losing the plan, and charges nothing there either (rule 15)', async () => {
    let release: (() => void) | undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });

    const calls = await renderBook({
      readingLog: async (request) => {
        await inFlight;
        return readingLogOf(request);
      },
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    await press(readButtonOrThrow(false));

    // O estado "em voo" é um estado como outro qualquer: a lista continua, o
    // botão anuncia que está ocupado, e nada cobra ninguém.
    expect(planRows()).toHaveLength(3);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expectNoGuilt();

    release?.();
    await waitFor(() => {
      expect(requestsTo(calls, '/books/')).toHaveLength(2);
    });
    expectNoGuilt();
  });
});

describe('tapping a day goes to the note of that day (rule 8)', () => {
  it('navigates to /books/:bookId/days/:planItemId, with the ids in the right order', async () => {
    const calls = await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const link = linkIn(rowOf('O carneiro assado'));
    // A âncora tem endereço de verdade: é o que faz Ctrl+clique e "abrir em
    // nova aba" funcionarem.
    expect(link.getAttribute('href')).toBe(
      `/books/${BOOK_ID}/days/${TODAY_ID}`,
    );
    expectNoGuilt();

    await act(async () => {
      fireEvent.click(link);
    });

    expect(locationText()).toBe(`/books/${BOOK_ID}/days/${TODAY_ID}`);
    /*
      ⚠️ **OS NOMES DOS PARÂMETROS DA ROTA, E ELES SE PINAM NAS REQUISIÇÕES.**

      MEDIDO na Tarefa 16: trocar `'/books/:bookId/days/:planItemId'` por
      `'/books/:planItemId/days/:bookId'` sobrevivia à suíte, porque o endereço
      casava e a tela aparecia. O placeholder daquela fatia renderizava os dois
      ids em `data-testid` para pinar isso; a Tarefa 18 pôs a tela de verdade no
      lugar, e a observável passou a ser o que ela FAZ com cada segmento — que é
      mais forte, porque é o que quebraria de verdade:

      - o PRIMEIRO segmento vira `GET /books/:bookId` (a última requisição de
        livro é a da tela da anotação, não a desta tela);
      - o SEGUNDO vira o filtro `planItemId` do `listNotes`.

      Com os parâmetros trocados, a primeira asserção pediria `/books/p-b` e a
      segunda filtraria por `b-hobbit`.
    */
    /*
      ⚠️ O FRAGMENTO É `'/notes?planItemId='`, e não `'/notes?'`: desde a
      Tarefa 19 a tela do livro TAMBÉM lista anotações
      (`/clubs/:clubId/notes?bookId=…`), e o fragmento largo passou a contar as
      duas — um teste sobre os PARÂMETROS DA ROTA falhando por causa de uma
      requisição que não é dele.
    */
    await waitFor(() => {
      expect(requestsTo(calls, '/notes?planItemId=')).toHaveLength(1);
    });
    expect(requestsTo(calls, '/books/').at(-1)?.url).toBe(
      `https://api.teste/books/${BOOK_ID}`,
    );
    expect(
      requestsTo(calls, '/notes?planItemId=').map((call) =>
        new URL(call.url).searchParams.get('planItemId'),
      ),
    ).toEqual([TODAY_ID]);
  });
});

describe('⚠️ ONE LINK TO THE COLLECTION, IN PLACE OF THE TWO TABS (rule 14 of task 28)', () => {
  /*
    ⚠️ **ESTE BLOCO SUBSTITUIU O ANTERIOR DUAS VEZES, E A TROCA É O PONTO.** Da
    Tarefa 17 à 24 a aba de Grifos era um `<button disabled aria-disabled>` com
    um "chega no MVP 2" ao lado; a Tarefa 25 a fez navegar; a Tarefa 28 apagou as
    DUAS abas (decisão B). Cada asserção que deixou de descrever a verdade foi
    TROCADA pela que descreve a verdade nova — nenhuma foi apagada nem
    afrouxada.

    ⚠️ **E O MOTIVO DE NÃO HAVER MAIS ABA:** as duas eram inconsistentes entre
    si — "Anotações" listava NESTA tela e "Grifos" navegava —, e uma lista dos
    dois tem de ser UM lugar. Com o acervo do outro lado, o que sobra aqui é uma
    SAÍDA, e saída é link.
  */
  it('has ONE link to the collection, and no tab left', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const link = screen.getByRole('link', {
      name: pt.pages.book.acervoLink,
    });
    // A âncora tem endereço de verdade: é o que faz Ctrl+clique e "abrir em
    // nova aba" funcionarem.
    expect(link.getAttribute('href')).toBe(`/books/${BOOK_ID}/acervo`);
    expect(link.hasAttribute('disabled')).toBe(false);
    expect(link.getAttribute('aria-disabled')).toBeNull();

    /*
      ⚠️ **O QUE NÃO ESTÁ AQUI É METADE DO TESTE.** Nenhum chip, nenhum
      `role="group"`, nenhum `aria-pressed`: o filtro inteiro mudou de tela, e
      uma aba sobrevivente seria a inconsistência de volta. E não há SEGUNDO
      link para o acervo — decisão B: **um**.
      (O `<select>` de idioma do cabeçalho não é chip nem grupo.)
    */
    expect(screen.queryAllByRole('group')).toHaveLength(0);

    /*
      ⚠️ **A ASSERÇÃO FOI CORRIGIDA NA RODADA DA 32b, e o achado é a lição nº 4
      do MVP 1 com o acusador na mão.**

      Ela era `document.querySelectorAll('[aria-pressed]')).toHaveLength(0)` —
      GLOBAL à tela. Isso não proíbe "aba sobrevivente", que é o que o nome
      deste teste promete: proíbe **o atributo ARIA em qualquer lugar da tela
      do livro**. Medido: pôr `aria-pressed` no botão "li hoje" — que não é aba
      nenhuma, e para quem ouve a tela seria estado anunciado duas vezes — dava
      **1 acusador**, e era este teste. O teste tinha passado a mandar no
      produto.

      O corpo agora diz o que o nome diz: nenhum chip de aba, ou seja, nenhum
      `[aria-pressed]` que **não seja** o toque de leitura. Um chip de verdade
      continua vermelho aqui (medido: **1** acusador).
    */
    const readingToggle = readButton(false);
    expect(readingToggle).not.toBeNull();
    expect(
      Array.from(document.querySelectorAll('[aria-pressed]')).filter(
        (element) => element !== readingToggle,
      ),
    ).toEqual([]);

    expect(
      screen.getAllByRole('link', { name: pt.pages.book.acervoLink }),
    ).toHaveLength(1);
    expectNoGuilt();
  });

  it('⚠️ navigates by the ROUTER, not by a raw anchor that reloads the PWA', async () => {
    /*
      ⚠️ A LIÇÃO MEDIDA DA TAREFA 16. `<a href>` cru é navegação de DOCUMENTO:
      num PWA ela recarrega o shell inteiro e perde o estado em memória (a
      sessão, o clube ativo, o rascunho do editor). O `Link` do react-router
      renderiza um `<a href>` de verdade — Ctrl+clique e "abrir em nova aba"
      continuam — E intercepta o clique normal.

      Em jsdom o endereço só muda se o roteador interceptou: uma âncora crua
      não navega. É por isso que a asserção é sobre o `location`, e não sobre o
      `href` (que o teste acima já pina).
    */
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    await press(screen.getByRole('link', { name: pt.pages.book.acervoLink }));

    expect(locationText()).toBe(`/books/${BOOK_ID}/acervo`);
    // E chegou na tela do acervo de verdade, não numa página não encontrada.
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: pt.pages.acervo.title,
      }),
    ).not.toBeNull();
    expectNoGuilt();
  });
});

describe('⚠️ NOTHING ON THIS SCREEN SUGGESTS PRIVACY (ADR 0002)', () => {
  it('would catch the words the ADR forbids, in both languages', () => {
    /*
      ⚠️ **O LADO POSITIVO DO PAR (§7.3), e ele fica AQUI de propósito.** A
      varredura de privacidade roda dentro de `expectNoGuilt()` em todos os
      estados desta suíte (conserto da Tarefa 25) — mas uma lista esvaziada, ou
      um matcher invertido, deixaria todas elas verdes para sempre.

      Este teste não é sobre a tela do livro: é sobre a LISTA e o MATCHER, que
      moram em `@clube/shared/adr-0002`. Ele ficou nesta suíte quando o acervo
      saiu (Tarefa 28) porque mudar de casa um teste que não mudou de assunto é
      como uma propriedade perde o dono — e é a única cópia dele no app.
    */
    const planted = [
      'Só você vê esta anotação',
      'Anotação privada',
      'Visível para: você',
      'Only you can see this note',
    ];

    for (const phrase of planted) {
      const normalized = withoutDiacritics(phrase);
      expect(
        PRIVACY_TERMS.some((term) => mentionsPrivacyTerm(normalized, term)),
      ).toBe(true);
    }
  });
});

describe('the book screen when the book or the network goes away (rules 9, 10, 14)', () => {
  it('handles a 404 with its OWN words, and never a blank screen (rule 9)', async () => {
    /*
      Livro de outro clube, livro arquivado, ou id que não existe: para quem não
      é membro, os três são a mesma resposta. O corte de tenant do projeto é 404
      e não 403 (`CLAUDE.md`), de propósito — o livro "não existe" para quem não
      é do clube.
    */
    await renderBook({ book: [{ status: 404, body: { error: 'Not found' } }] });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.book.bookUnavailable)).not.toBeNull();
    });
    expect(bookScreenIsUp()).toBe(true);
    // Frase PRÓPRIA, não o genérico de 404 ("Não encontramos o que você
    // procurava"), que não diz o quê — e aqui o "o quê" é o livro do mês.
    expect(readableText()).not.toContain(pt.errors.notFound);
    // Nada da API na tela, atributos incluídos (regra 14).
    expect(readableText()).not.toContain('Not found');
    // Retentar um 404 é pedir outra vez a mesma negativa.
    expect(
      screen.queryByRole('button', { name: pt.pages.book.retry }),
    ).toBeNull();
    expectNoGuilt();
  });

  it('offers to repeat a network failure, and the repeat REDOES the request (rule 10)', async () => {
    const calls = await renderBook({
      book: [
        { status: 0, offline: true },
        bookReply(aBook({ id: BOOK_ID }), plan(), WRITERS),
      ],
    });

    await waitFor(() => {
      expect(screen.queryByText(pt.errors.network)).not.toBeNull();
    });
    expect(bookScreenIsUp()).toBe(true);
    expect(requestsTo(calls, '/books/')).toHaveLength(1);
    expectNoGuilt();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: pt.pages.book.retry }),
      );
    });

    await waitFor(() => {
      // ⚠️ A METADE QUE IMPORTA: repetir REFAZ a requisição. Um botão que só
      // apagasse a mensagem deixaria a pessoa olhando o vazio achando que
      // tentou.
      expect(requestsTo(calls, '/books/')).toHaveLength(2);
    });
    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    expect(screen.queryByText(pt.errors.network)).toBeNull();
    expectNoGuilt();
  });

  it('never puts a word the API wrote on the screen, attributes included (rule 14)', async () => {
    /*
      ⚠️ ATRIBUTO TAMBÉM É TELA (§7.6.1): texto da API em `title` ou
      `aria-label` passava por um teste que lia só `textContent` — e o
      `aria-label` é justamente o que o leitor de tela FALA. A `readableText()`
      varre a união.

      A mensagem do fixture é a que o backend manda de verdade na classe 400
      (§6.2: `error.message` cru da usecase).
    */
    await renderBook({
      book: [
        { status: 400, body: { error: 'bookId must be a non-empty string' } },
      ],
    });

    await waitFor(() => {
      expect(screen.queryByText(pt.errors.badRequest)).not.toBeNull();
    });
    expect(readableText()).not.toContain('bookId must be a non-empty string');
    expect(bookScreenIsUp()).toBe(true);
    expectNoGuilt();
  });

  it('shows the loading state while the request is in flight, and charges nothing there either', async () => {
    /*
      A resposta fica PENDURADA de propósito: é o único jeito de olhar a tela
      ENQUANTO a requisição está no ar. As duas asserções são o par — "não
      mostra o plano" sozinho passaria numa tela branca.
    */
    let release: (() => void) | undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });

    const calls = stubFetch(
      replyByUrl(
        [
          ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
          ['/me', meReply({ clubs: [CASAL] })],
          ['/notes', { status: 200, body: [] }],
          ['/clubs/', booksReply([aBook({ id: BOOK_ID })])],
          [
            '/books/',
            async () => {
              await inFlight;
              return bookReply(aBook({ id: BOOK_ID }), plan(), WRITERS);
            },
          ],
        ],
        { status: 500, body: { error: 'Internal Server Error' } },
      ),
    );

    await act(async () => {
      renderPage(<App />, {
        path: bookPath(BOOK_ID),
        storage: memoryStorage({ ...SESSION }),
      });
      await Promise.resolve();
    });

    expect(screen.queryByText(pt.pages.book.loading)).not.toBeNull();
    expect(
      screen.queryByRole('list', { name: pt.pages.book.plan.label }),
    ).toBeNull();
    expect(bookScreenIsUp()).toBe(true);
    expectNoGuilt();

    release?.();
    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    expect(requestsTo(calls, '/books/')).toHaveLength(1);
    expectNoGuilt();
  });
});

describe('a book with no plan gets an empty state of its own (rule 11)', () => {
  it('says the book has no plan yet, and charges nobody for it', async () => {
    await renderBook({
      book: [bookReply(aBook({ id: BOOK_ID, title: 'O Hobbit' }), [])],
    });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.book.plan.empty.title)).not.toBeNull();
    });
    /*
      A frase fala do LIVRO, não da pessoa, e diz de quem é a ação: quem cadastra
      o plano é o admin do clube. E o livro continua na tela — um estado vazio de
      plano não é um erro de livro.
    */
    expect(
      screen.queryByText(pt.pages.book.plan.empty.description),
    ).not.toBeNull();
    expect(
      screen.queryByRole('heading', { level: 1, name: 'O Hobbit' }),
    ).not.toBeNull();
    expect(
      screen.queryByRole('list', { name: pt.pages.book.plan.label }),
    ).toBeNull();
    expectNoGuilt();
  });
});

describe('⚠️ THE SHELF OF THE HOME LINKS HERE, AND THE CLICK DOES NOT RELOAD THE PWA (rule 13)', () => {
  it('opens the book screen from the shelf, in-app', async () => {
    /*
      DECISÃO A: o `renderLink` do `ListItem` nasceu na Tarefa 16 exatamente para
      isto e **não tinha chamador**. Sem o link, a única porta para esta tela
      seria digitar a URL.

      ⚠️ **E É AQUI QUE "NÃO RECARREGA O PWA" É DECIDÍVEL.** Em jsdom, clicar uma
      âncora CRUA não navega (o jsdom não implementa navegação de documento):
      o endereço não mudaria. Então o `LocationProbe` mostrar o novo caminho
      depois do clique é a prova de que o roteador INTERCEPTOU — ou seja, que é
      um `<Link>` e não um `<a>` solto. Um `onClick` + `useNavigate` também
      mudaria o endereço, e é por isso que o `href` é assertado junto: os dois
      lados são o que a decisão pede.
    */
    await renderBook({
      path: '/',
      shelf: booksReply([
        aBook({ id: BOOK_ID, title: 'O Hobbit', author: 'J. R. R. Tolkien' }),
      ]),
    });

    const shelf = await screen.findByRole('list', {
      name: pt.pages.home.shelf.label,
    });
    const link = shelf.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe(`/books/${BOOK_ID}`);
    expectNoGuilt();

    await act(async () => {
      if (link !== null) fireEvent.click(link);
    });

    expect(locationText()).toBe(`/books/${BOOK_ID}`);
    await waitFor(() => {
      expect(
        screen.queryByRole('list', { name: pt.pages.book.plan.label }),
      ).not.toBeNull();
    });
    // E a home saiu de cena: é navegação de rota, não um cartão que abre um
    // painel.
    expect(screen.queryByText(pt.pages.home.shelf.heading)).toBeNull();
    expectNoGuilt();
  });
});

describe('the source of the book screen (rules 5, 15, 16)', () => {
  it('keeps the danger colour out of the SOURCE FILES, not only out of the states rendered here', () => {
    /*
      A rede contra a cor voltar por um estado que ninguém pensou em renderizar.

      ⚠️ **E ELA VARRE OS DOIS ARQUIVOS DESDE A TAREFA 32b.** A tela deixou de
      ser "um arquivo só" quando a marca de leitura foi para
      `reading-marks.tsx` — e é justamente lá que mora o caminho de ERRO
      ("não deu para registrar"), que é o lugar mais natural do mundo para
      alguém pintar de vermelho. Uma varredura de fonte que ficasse só no
      `book.tsx` teria perdido exatamente o arquivo novo: é a forma de
      "guarda no lugar errado" do §7.9, nascendo de um `split`.
    */
    for (const file of ['book.tsx', 'reading-marks.tsx']) {
      expect(stripComments(pageSource(file))).not.toMatch(DANGER_STYLE);
    }

    // O lado positivo do par: os arquivos lidos são os certos (um caminho
    // errado lançaria, mas um arquivo VAZIO passaria calado — §7.4 escrito
    // como varredura de fonte).
    expect(stripComments(bookSource())).toContain('pages.book.plan.today');
    expect(stripComments(pageSource('reading-marks.tsx'))).toContain(
      'pages.book.plan.readerNamed',
    );
  });

  it('⚠️ keeps the reading touch OUT of the days that are not today (rule 10, decision E)', () => {
    /*
      ⚠️ **A REDE DE FONTE CONTRA OS 30 TOGGLES.** O estado "um botão por dia"
      não é renderizado por teste nenhum — ele nem existe —, então nenhuma
      varredura de DOM o pegaria. O que o impede hoje é estrutural: o
      `TodayReading` é montado **uma vez**, fora do `planItems.map`, a partir
      de um `find` pelo dia de hoje.

      Se alguém o mover para dentro do `map`, esta asserção fica vermelha antes
      de a lista virar formulário de auditoria retroativa — que é a razão de
      escopo que a spec desta fatia escreveu por extenso.
    */
    const source = stripComments(bookSource());
    const list = source.slice(source.indexOf('planItems.map('));

    expect(source).toContain('<TodayReading');
    expect(list).not.toContain('TodayReading');
    // E o dia de hoje é achado por comparação de STRING contra o `localDay`,
    // o mesmo que a marca da lista usa — nunca um `new Date()` novo aqui.
    expect(source).toContain('planItems.find((item) => item.date === today)');
  });

  it('⚠️ keeps NO filter of its own — the whole filter moved to the acervo (rule 13 of task 28)', () => {
    /*
      ⚠️ **A ASSERÇÃO NEGATIVA É A QUE VALE, e ela substitui a da Tarefa 27.**
      Lá o teste dizia "usa o `FilterBar` compartilhado e sobra exatamente UM
      `FilterChip` à mão — a aba"; aqui não sobra nenhum dos dois. Uma tela que
      encolhesse o acervo e deixasse a barra de filtro ao lado teria um controle
      que não recorta nada, e o `role="group"` órfão continuaria na fala do
      leitor de tela.

      ⚠️ **E ISSO FECHA A LACUNA DE `renderLink` que vivia registrada desde a
      Tarefa 25**: as classes de chip escritas à mão (`HIGHLIGHTS_TAB_CLASS`)
      existiam porque o `FilterChipProps` não aceita `renderLink` e a aba tinha
      de navegar. Sem aba, não há chamador — a lacuna deixou de ter custo nesta
      tela, e continua registrada em `packages/ui` para quem precisar dela.
    */
    const source = stripComments(bookSource());

    expect(source).not.toContain('FilterBar');
    expect(source).not.toContain('FilterChip');
    expect(source).not.toContain('role="group"');
    // E nenhum resto do acervo: a segunda listagem e o recorte por autoria.
    expect(source).not.toContain('notesResponseSchema');
    expect(source).not.toContain('pages.book.notes');

    /*
      O lado positivo do par (§7.4 escrito como varredura de fonte): o que
      SOBROU é o link para o acervo, pelo `Link` do roteador, e a resolução do
      NOME de quem escreveu — que é a regra 15 e a única razão de o
      `GET /members` ter ficado nesta tela.
    */
    expect(source).toContain('pages.book.acervoLink');
    expect(source).toContain('acervoPath');
    expect(source).toContain('clubMembersResponseSchema');
    expect(source).toContain('pages.book.plan.writerNamed');
  });

  it('imports no editor, so the bundle stays without TipTap (rule 16)', () => {
    /*
      Esta tela não escreve: quem escreve é a anotação do dia (Tarefa 18). O
      acusador de verdade é o `__tests__/bundle-guard.test.ts`, que COMPILA o app
      e recusa qualquer marca de `tiptap`/`prosemirror` nos assets — este teste é
      o ponteiro que diz onde procurar quando aquele ficar vermelho.
    */
    const source = stripComments(bookSource());

    expect(source).not.toContain('@clube/ui/editor');
    expect(source).not.toContain('@tiptap');
  });

  it('has the new keys in pt AND in en, actually translated (rule 15)', () => {
    /*
      A paridade recursiva de `pt`/`en` é provada no catálogo
      (`shared/src/locales/__tests__/catalogs.test.ts`) e pelo compilador (o `en`
      é declarado `typeof pt`). O que ESTE teste acrescenta é o par que nenhum
      dos dois pega: um bloco copiado e colado do `pt` para o `en`, que passa na
      paridade de CHAVES e embarca português no idioma inglês.
    */
    expect(Object.keys(en.pages.book)).toEqual(Object.keys(pt.pages.book));
    expect(en.pages.book.bookUnavailable).not.toBe(
      pt.pages.book.bookUnavailable,
    );
    expect(en.pages.book.plan.empty.title).not.toBe(
      pt.pages.book.plan.empty.title,
    );

    /*
      ⚠️ **AS CHAVES QUE MORRERAM, E A LINHAGEM DELAS.** `tabs.highlightsSoon`
      ("os grifos chegam no MVP 2") morreu na Tarefa 25, quando deixou de ser
      verdade; `tabs.notes`/`tabs.highlights` e o bloco `notes` inteiro morreram
      na Tarefa 28, quando o acervo saiu desta tela (as chaves dele estão em
      `pages.acervo`, com par próprio em `acervo.test.tsx`). O que sobra do lado
      da navegação é UM link, e é ele que este par confere.
    */
    expect(en.pages.book.acervoLink).not.toBe(pt.pages.book.acervoLink);
    expect(pt.pages.book).not.toHaveProperty('tabs');
    expect(pt.pages.book).not.toHaveProperty('notes');

    // A chave nomeada da sobreposição do plano, no mesmo par — ela é a regra 15
    // desta fatia, e é a que NÃO podia sair junto com o acervo.
    expect(Object.keys(en.pages.book.plan)).toEqual(
      Object.keys(pt.pages.book.plan),
    );
    expect(en.pages.book.plan.writerNamed).not.toBe(
      pt.pages.book.plan.writerNamed,
    );
    expect(en.pages.book.plan.writer).not.toBe(pt.pages.book.plan.writer);

    // ⚠️ E o `{{name}}` sobrevive à tradução: um `en` que perdesse o
    // interpolador mostraria o rótulo sem o nome de ninguém — o defeito que a
    // Tarefa 27 consertou, de volta pelo outro idioma.
    for (const label of [
      pt.pages.book.plan.writerNamed,
      en.pages.book.plan.writerNamed,
      pt.pages.book.plan.readerNamed,
      en.pages.book.plan.readerNamed,
    ]) {
      expect(label).toContain('{{name}}');
    }

    /*
      ⚠️ **AS CHAVES DA TAREFA 32b, NOS DOIS IDIOMAS.** O par pt≠en é o que
      pega o bloco copiado e colado — que passa na paridade de CHAVES do
      catálogo e embarca português no inglês.
    */
    expect(Object.keys(en.pages.book.read)).toEqual(
      Object.keys(pt.pages.book.read),
    );
    for (const [ptText, enText] of [
      [pt.pages.book.read.mark, en.pages.book.read.mark],
      [pt.pages.book.read.unmark, en.pages.book.read.unmark],
      [pt.pages.book.read.failed, en.pages.book.read.failed],
      [pt.pages.book.plan.reader, en.pages.book.plan.reader],
      [pt.pages.book.plan.readerNamed, en.pages.book.plan.readerNamed],
    ]) {
      expect(enText).not.toBe(ptText);
    }

    /*
      ⚠️ **E OS DOIS ESTADOS DO BOTÃO NÃO DIZEM A MESMA COISA, nos dois
      idiomas.** O rótulo É o estado (decisão D: sem `aria-pressed`), então
      dois rótulos iguais apagariam a informação inteira — e o teste de tela
      que procura o botão pelo nome passaria a achar o mesmo nos dois casos.
    */
    expect(pt.pages.book.read.mark).not.toBe(pt.pages.book.read.unmark);
    expect(en.pages.book.read.mark).not.toBe(en.pages.book.read.unmark);
  });
});
