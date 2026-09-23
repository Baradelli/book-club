import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  BookInventoryResponse,
  BookResponse,
  ClubMemberResponse,
  LastHighlightResponse,
  PlanItemResponse,
} from '@clube/shared';
import { localDay, localTimeZone } from '@clube/shared';
import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { pt } from '@clube/shared/locales';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import type { ClubSummary } from '../../club/active-club';
import { bookPath } from '../book';
import { mentionsPrivacyTerm, PRIVACY_TERMS } from './adr-0002-dom';
import {
  DANGER_STYLE,
  expectNoGuilt,
  expectNoGuiltWithPlanPosition,
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
 *
 * ⚠️ **O `inventory` E O `lastHighlight` ENTRARAM NA TAREFA 44b**, e entraram
 * como parâmetros com padrão pelo mesmo motivo das sobreposições: a maioria
 * dos testes desta tela não fala da margem, e um acervo vazio sem grifo nenhum
 * é a verdade deles. Quem testa "Neste livro" e "Último grifo" os passa.
 */
function bookReply(
  book: BookResponse,
  planItems: readonly PlanItemResponse[],
  writers: Overlay = [],
  readers: Overlay = [],
  inventory: BookInventoryResponse = { notes: 0, highlights: 0 },
  lastHighlight: LastHighlightResponse | null = null,
): Reply {
  return {
    status: 200,
    body: { book, planItems, writers, readers, inventory, lastHighlight },
  };
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
 * ⚠️ **O recorte por `data-read-mark` é a metade de teste da decisão C**
 * (Tarefa 32b): as duas sobreposições convivem na mesma linha e as duas são
 * `role="img"` com nome acessível — sem o recorte, este helper contaria as
 * marcas de leitura como avatares de escrita e os testes da Tarefa 27 (as
 * iniciais, a frase nomeada) passariam a falar de outra coisa.
 *
 * ⚠️ **O `data-read-mark` PASSOU A SER UM ENVOLTÓRIO na Tarefa 44 (decisão
 * B).** Quem desenha as duas marcas agora é o MESMO componente
 * (`PresenceMark`, de `packages/ui`), que não aceita atributo arbitrário — e
 * alargar a API dele para um chamador seria o "peso" que a decisão B da 41a
 * proíbe. Então o gancho ficou no `<span>` de fora, e os dois helpers passaram
 * a devolver o elemento de DENTRO: é nele que estão a classe, a inicial e o
 * `aria-label` que todos os `it()` desta suíte leem.
 *
 * ⚠️ **NÃO troque este recorte por um recorte pelo `aria-label`.** Seria
 * circular: metade dos testes daqui mede justamente que os dois rótulos são
 * diferentes, e selecionar por rótulo transformaria essas asserções na
 * tautologia do §7.8.
 */
function avatarsIn(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll<HTMLElement>('[role="img"]')).filter(
    (element) => element.closest('[data-read-mark]') === null,
  );
}

/** As marcas de quem LEU. */
function readMarksIn(row: HTMLElement): HTMLElement[] {
  return Array.from(
    row.querySelectorAll<HTMLElement>('[data-read-mark] [role="img"]'),
  );
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

/** As classes do ALVO da linha — é nele que o tom do sumário é pintado. */
function classesOf(row: HTMLElement): string {
  return linkIn(row).getAttribute('class') ?? '';
}

/**
 * O CONDUTOR pontilhado da linha do sumário (`data-sumario-leader`, nascido na
 * Tarefa 41a). Ele é o único gancho estrutural que o `ListItem` expõe para a
 * meta da direita: o slot `end` é o IRMÃO SEGUINTE dele.
 */
function leaderOf(row: HTMLElement): HTMLElement {
  const leader = row.querySelector<HTMLElement>('[data-sumario-leader]');
  if (leader === null) throw new Error('a linha do plano não é um sumário');
  return leader;
}

/**
 * O slot `end` — a meta em monoespaçada à direita (`Livro.dc.html:78`).
 *
 * ⚠️ Achado por POSIÇÃO relativa ao condutor, e não por classe: a classe é
 * decisão de `packages/ui` e muda lá; o que esta suíte precisa saber é que a
 * data e a referência estão **depois** do condutor, que é o que a decisão A da
 * Tarefa 44 move. Uma linha sem `end` devolve string vazia, e é isso que o
 * caso `reference: null` exercita.
 */
function endOf(row: HTMLElement): string {
  return leaderOf(row).nextElementSibling?.textContent ?? '';
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
 * `packages/shared/src/locales/__tests__/anti-guilt.test.ts`, que percorre o
 * catálogo `pt` inteiro. O que **não** é catálogo é DOM — cor, número renderizado
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

/*
  ⚠️ **AQUI VIVIA `testSource()`, o leitor do fonte DESTA suíte**, e ele morreu
  com o pino que o justificava (veja o bilhete no fim deste arquivo, onde o
  `it()` estava). O argumento escrito era que a propriedade "este estado chama
  a variante estrita" só seria observável no TEXTO do arquivo; a medição da
  rodada de correção da Tarefa 44 mostrou que ela é observável no DOM, desde
  que as duas variantes sejam mutuamente exclusivas — e aí o acusador mora no
  `it()` de verdade, não numa contagem de ocorrências.
*/

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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
  });

  it('marks NO other day — not the past ones, not the future ones (rule 4)', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    /*
      As DUAS metades. "Hoje" aparece UMA vez (uma lista de tamanho 1 recusa
      "marca todos"), e a marca VISUAL está só na linha de hoje. Sem a segunda,
      uma tela que desenhasse o destaque em todas as linhas passaria, porque a
      palavra continuaria única.

      E a ausência de cobrança no dia PASSADO é o que o `expectNoGuilt` varre:
      sem vermelho, sem contagem, sem "atrasado".

      ⚠️ **AS DUAS ASSERÇÕES MUDARAM DE FORMA NA TAREFA 44 — não de força.**

      (a) A palavra era procurada por `getAllByText(…)`, que casa o texto
      INTEIRO de um elemento. Desde a decisão A ela divide o slot `end` com a
      referência do dia ("Hoje · p. 31-58", como `Livro.dc.html:146` desenha),
      então o casamento exato deixou de existir — e a asserção passou a dizer
      ONDE a palavra está, que é mais do que ela dizia antes;

      (b) a marca visual era o anel `ring-accent` da Tarefa 17. O canvas não
      desenha anel nenhum: o dia de hoje tem PAPEL próprio (`--surface-today`)
      e um filete DOURADO em cima e embaixo (`Livro.dc.html:139`). O par
      negativo continua inteiro — nenhuma outra linha os tem —, e o anel morto
      ganhou asserção própria para não voltar por engano.
    */
    const saidToday = planRows().filter((row) =>
      endOf(row).startsWith(pt.pages.book.plan.today),
    );
    expect(saidToday).toHaveLength(1);
    expect(saidToday[0]?.textContent).toContain('O carneiro assado');

    const highlighted = planRows().filter((row) =>
      /bg-surface-today/u.test(classesOf(row)),
    );
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]?.textContent).toContain('O carneiro assado');
    for (const row of planRows()) {
      expect(classesOf(row)).not.toContain('ring-accent');
    }
    expectNoGuiltWithPlanPosition();
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
      expectNoGuiltWithPlanPosition();
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
    // ⚠️ O papel de hoje no lugar do anel da Tarefa 17 — a decisão D da 44.
    expect(
      planRows().filter((row) => /bg-surface-today/u.test(classesOf(row))),
    ).toEqual([]);
    expectNoGuilt();
  });
});

describe('⚠️ THE PLAN IS A SUMÁRIO, NOT A LIST OF ROWS (task 44, decisions A, D)', () => {
  it('⚠️ puts the day and the reference in the END slot, in mono — the subtitle is gone (decision A)', async () => {
    /*
      ⚠️ **A NOTA DO `ListItemLook` PREVIU ESTA MIGRAÇÃO POR ESCRITO** (Tarefa
      41a, `packages/ui/src/components/list.tsx`): o braço `sumario` declara
      `subtitle?: never`, então o `subtitle={subtitleFor(item, locale)}` que
      esta tela passava desde a Tarefa 17 **não compila** com `variant="sumario"`.

      A informação não se perde: ela MUDA de lugar. No canvas a data e a
      referência estão à direita, em monoespaçada, depois do condutor pontilhado
      (`Livro.dc.html:78`: `8 SET · 9`) — e é isso que este teste fixa, para
      que "migrar" não vire "apagar" numa fatia futura.
    */
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    for (const row of planRows()) {
      // A coluna de marcas existe MESMO VAZIA: é ela que alinha os títulos
      // entre o dia lido e o dia que ainda não chegou (`Livro.dc.html:150`).
      expect(row.querySelector('[data-sumario-marks]')).not.toBeNull();
      expect(leaderOf(row).getAttribute('aria-hidden')).toBe('true');
    }

    // A meta está no `end`, em mono, e traz a referência do dia.
    const today = rowOf('O carneiro assado');
    expect(endOf(today)).toContain('p. 31-58');
    expect(leaderOf(today).nextElementSibling?.className).toContain(
      'font-mono',
    );

    // E o dia PASSADO traz a data formatada, não "Hoje".
    const past = rowOf('Zumbis e anões');
    expect(endOf(past)).not.toContain(pt.pages.book.plan.today);
    expect(endOf(past)).toMatch(/\d/u);

    /*
      O par negativo do `reference: null` (§7.4): sem referência o `end` é só a
      data — nunca "null", nunca um " · " pendurado no fim.
    */
    const withoutReference = endOf(rowOf('A porta redonda'));
    expect(withoutReference).not.toContain('null');
    expect(withoutReference).not.toContain('·');

    expectNoGuiltWithPlanPosition();
  });

  it('⚠️ gives TODAY its own paper and a GOLD fillet, and the future gets text-subtle (decision D)', async () => {
    /*
      ⚠️ **`--text-subtle` NO DIA FUTURO, E NÃO `--text-faint`** — decisão do
      dono de 2026-09-21, registrada na nota nº 5 de `tasks/41a-*.md`. O canvas
      pinta o futuro com `--text-faint` (`Livro.dc.html:149`), que dá 2,45:1 no
      claro contra 4,5:1 de piso; os três cinzas de legenda não cabem todos
      acima do piso, e o dono escolheu preservar a INTENÇÃO (o futuro mais
      apagado que a linha lida) com o cinza que passa.

      A asserção negativa é a que vale: `text-faint` aqui acenderia também a
      guarda de primeiro uso da Tarefa 39
      (`theme-tokens.test.ts › refuses the FIRST USE of text-faint`).
    */
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const today = classesOf(rowOf('O carneiro assado'));
    expect(today).toContain('bg-surface-today');
    expect(today).toContain('border-gold-line');
    expect(today).toContain('border-y-2');
    expect(leaderOf(rowOf('O carneiro assado')).className).toContain(
      'border-gold-line',
    );

    const future = rowOf('A porta redonda');
    expect(classesOf(future)).toContain('text-subtle');
    expect(classesOf(future)).not.toContain('text-faint');
    expect(leaderOf(future).className).toContain('border-leader-future');

    /*
      ⚠️ **O PASSADO NÃO É APAGADO NEM DESTACADO** — é o §1 do plano na forma de
      par negativo. Apagar o que já passou é cobrança desenhada; destacá-lo
      seria "você não leu isto". Ele fica exatamente como uma linha comum.
    */
    const past = classesOf(rowOf('Zumbis e anões'));
    expect(past).not.toContain('text-subtle');
    expect(past).not.toContain('text-faint');
    expect(past).not.toContain('bg-surface-today');
    expect(past).not.toContain('border-gold-line');
    expect(leaderOf(rowOf('Zumbis e anões')).className).toContain(
      'border-leader',
    );

    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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

    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
  });

  it('⚠️ tells READING apart from WRITING on the same row, without leaning on colour (rule 7)', async () => {
    /*
      ⚠️ **DECISÃO C, e ela existe por causa da lição nº 12 do MVP 2** (varrer
      palavra não pega desenho, e cor sozinha não é portadora) e da nº 16
      ("duas coisas que falam a mesma frase", que já mentiu numa tela deste
      projeto).

      ⚠️⚠️ **A PROPRIEDADE MUDOU DE FORMA NA TAREFA 44 (decisão B) — NÃO DE
      FORÇA, e é por isso que este `it()` foi REESCRITO em vez de apagado.**

      Até aqui o portador era **glifo × letra**: a marca de leitura era um
      `<Check>` do lucide (SVG, sem letra) e o avatar de escrita era a INICIAL
      (letra, sem SVG). No canvas os dois são o MESMO desenho — círculo de
      18×18 com a inicial em monoespaçada — e o que os separa é
      **vazado × cheio**: `Livro.dc.html:83` é `border:1px solid
      var(--border-strong)` sem preenchimento nenhum, e `:73` é
      `background:var(--accent)` sem filete.

      A propriedade que SOBREVIVE, e que este teste continua medindo com a
      mesma força, é: *leu e escreveu* tem de ser distinguível de *só leu*
      **sem depender de cor**. As três metades:

      - **forma**: uma tem preenchimento e a outra NÃO TEM NENHUM. Isso é
        estrutural, não matiz — quem não distingue as cores continua vendo um
        disco cheio e um anel. Um "vazado" que virasse um cheio de outra tinta
        (o mutante iii da regra 2) passaria por um teste que só comparasse os
        nomes das classes, e não passa por este;
      - **conteúdo**: as DUAS carregam a inicial, e é a MESMA letra da MESMA
        pessoa. É essa igualdade que impede o teste de passar de graça: se a
        distinção viesse do texto, ela não estaria vindo da forma;
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

    const hollow = marks[0];
    if (hollow === undefined) throw new Error('unreachable: length asserted');
    /*
      ⚠️ A MESMA pessoa nos dois papéis: a inicial não pode ser o que
      distingue. Quem asserta a metade CHEIA é o `throw` logo abaixo — a busca
      é por `textContent === 'Z'`, e não achar significa que a inicial da Zeca
      não está no avatar de escrita.

      ⚠️ **E NÃO HÁ `expect(filled.textContent).toBe('Z')` AQUI, de propósito.**
      Ele existiu até a rodada de correção da Tarefa 44 e era TAUTOLÓGICO: o
      `filled` acabara de ser escolhido por essa mesma igualdade, então os dois
      lados da asserção vinham do mesmo lugar e ela não podia ficar vermelha.
      É o §7.8 em miniatura — "quem escolheu o valor esperado?" — na versão
      mais curta possível.
    */
    const filled = avatars.find((avatar) => avatar.textContent === 'Z');
    if (filled === undefined) throw new Error('a Zeca escreveu naquele dia');

    expect(hollow.textContent).toBe('Z');

    /*
      ⚠️ **VAZADO = SEM PREENCHIMENTO NENHUM, não "com outro fundo".** A regex
      procura QUALQUER utilitário `bg-*`: é ela que mata o mutante que troca a
      forma por matiz (um `bg-surface-2` no lugar do filete continuaria
      "diferente" e deixaria de ser distinguível sem cor).
    */
    expect(hollow.className).not.toMatch(/(?<![\w-])bg-[\w-]+/u);
    expect(hollow.className).toContain('border-line-strong');
    expect(filled.className).toMatch(/(?<![\w-])bg-[\w-]+/u);
    expect(filled.className).not.toContain('border-line-strong');

    // E as duas são o MESMO desenho de base: círculo, e não quadrado × círculo
    // (a silhueta que o docblock da Tarefa 32b media e que ninguém acusava).
    expect(hollow.className).toContain('rounded-full');
    expect(filled.className).toContain('rounded-full');

    // E a MESMA pessoa (a Zeca) é falada de dois jeitos diferentes.
    expect(labelsOf(marks)).toEqual([readerLabel('Zeca')]);
    expect([...labelsOf(avatars)].sort()).toEqual(
      [writerLabel('Zeca'), writerLabel('Marcos')].sort(),
    );
    expect(labelsOf(marks)[0]).not.toBe(labelsOf(avatars)[0]);
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
  });
});

describe('⚠️ "LI HOJE" — THE FIRST-PERSON TOUCH (task 32b, rules 10 to 14)', () => {
  it('offers the touch ONLY when the plan has a day of today (rule 10)', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });
    expect(readButton(false)).not.toBeNull();
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();

    release?.();
    await waitFor(() => {
      expect(requestsTo(calls, '/books/')).toHaveLength(2);
    });
    expect(readingLogCalls(calls, TODAY_ID)).toHaveLength(1);
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();

    // ⚠️ A METADE QUE IMPORTA: repetir REFAZ a requisição.
    await press(screen.getByRole('button', { name: pt.pages.book.retry }));

    await waitFor(() => {
      expect(readingLogCalls(calls, TODAY_ID)).toHaveLength(2);
    });
    await waitFor(() => {
      expect(readButton(true)).not.toBeNull();
    });
    expect(screen.queryByText(pt.pages.book.read.failed)).toBeNull();
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();

    release?.();
    await waitFor(() => {
      expect(requestsTo(calls, '/books/')).toHaveLength(2);
    });
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();

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

describe('⚠️ THE POSITION IN THE PLAN, AND THE COUNTER EXEMPTION IT EXERCISES (task 40, decision F)', () => {
  it('⚠️ says WHERE today is in the plan, and the exemption actually SUBTRACTS it', async () => {
    /*
      ⚠️⚠️ **ESTA É A PRIMEIRA TELA A EXERCITAR A ISENÇÃO DO CONTADOR.**

      `COUNTER_EXEMPT_KEYS` e `expectNoGuiltWithPlanPosition()` nasceram na
      Tarefa 40, foram medidos e **nunca foram chamados por uma tela** — a
      decisão H daquela fatia dizia, por escrito, que o consumidor viria nas
      42–48. A variante mede tudo o que o `expectNoGuilt()` mede **e** exige
      ≥ 1 subtração efetiva: sem ela, uma isenção que nunca isenta nada
      continuaria verde para sempre e isentaria, no dia em que um texto novo
      tivesse o mesmo formato, um placar de verdade.

      ⚠️ **A DIVERGÊNCIA DECLARADA:** o canvas desenha "Dia 11 de 30" no
      INÍCIO (`Inicio.dc.html:41`, `InicioDesktop.dc.html:42`) e na tela do dia
      em desktop (`DiaDesktop.dc.html:51`) — **não** em `Livro.dc.html` nem em
      `LivroDesktop.dc.html`, conferido com o script que imprime a linha
      citada. Aqui ela ocupa a linha de monoespaçada do cabeçalho, que é onde
      os dois artboards do livro põem a meta do mês (`Livro.dc.html:50`:
      "Setembro de 2026 · 288 p."). O conteúdo daquela linha não pôde ser
      reproduzido porque "p." e o mês por extenso seriam chaves NOVAS, e a
      regra 9 desta fatia não permite nenhuma.
    */
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    // Hoje é o item do MEIO de três: "Dia 2 de 3", derivado da POSIÇÃO no
    // plano — nunca de quantos dias alguém leu.
    expect(readableText()).toContain(
      pt.pages.book.plan.dayOfPlan
        .replace('{{number}}', '2')
        .replace('{{total}}', '3'),
    );
    expectNoGuiltWithPlanPosition();
  });

  it('⚠️ writes the header META LINE as an Eyebrow: the month, then the position (owner decision, 2026-09-22)', async () => {
    /*
      ⚠️⚠️ **DECISÃO DO DONO NA RODADA DE CORREÇÃO DA TAREFA 44, e ela
      desfaz uma afirmação FALSA da execução.**

      A execução daquela fatia escreveu, em três lugares, que reproduzir a
      linha de mono do canvas pediria chaves NOVAS — "o mês por extenso e o
      'p.'". Metade disso é falso, e foi medido: o mês por extenso NÃO é chave
      nenhuma. Ele sai do `formatClubMonth` (hoje em `./club-month`, extraído
      do `home.tsx`), que formata `"2024-03"` com `Intl`, e `book.month` já vem
      no `bookResponseSchema` que esta tela carrega.

      O "288 p." **continua fora**: esse, sim, seria chave nova (`pt.ts` só tem
      `bookForm.fields.totalPages = 'Total de páginas'`, rótulo de campo).

      ⚠️ **E A TIPOGRAFIA PASSOU A SER O COMPONENTE — MUTANTE SOBREVIVENTE
      M15.** A linha copiava À MÃO, byte a byte, a string de classes do
      `Eyebrow` (`font-mono text-eyebrow uppercase tracking-[0.12em]` +
      `text-muted`): era o TERCEIRO sítio de tipografia de rótulo no arquivo,
      dois pelo componente e um copiado. Trocar a cópia inteira por
      `text-ui text-muted` passava por **926 testes**, e a frase que justifica
      a fatia inteira ficava sem forma nenhuma. Agora o dono da tipografia é um
      só, e mudar o `tracking` do `Eyebrow` move os três juntos.

      ⚠️ **O TOM É `muted`, E FOI MEDIDO NO ARTBOARD CERTO.** `Inicio.dc.html:41`
      desenha "Dia 11 de 30" em `var(--gold)`, mas isso é a HOME. Nesta tela o
      slot é o da meta do mês: `Livro.dc.html:50` usa `color:var(--text-muted)`
      e `LivroDesktop.dc.html:53` usa `#565b52`, que é o valor de `--text-muted`
      no tema claro (`theme.css:122`). O `Eyebrow` sem `tone` é exatamente esse.

      ⚠️ **DIVERGÊNCIAS DECLARADAS, com a linha citada:** o canvas põe a linha em
      9,5px/0,1em no celular e 10px/0,1em no desktop; o `Eyebrow` é 10px/0,12em
      nas duas. A cópia à mão que saiu daqui já era 10px/0,12em — ou seja, a
      divergência é antiga e não nasceu deste conserto.
    */
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    /*
      O valor esperado é escrito À MÃO (§7.8): "março de 2024" é o `month` do
      `aBook()` formatado em `pt`, não o que o `formatClubMonth` devolver. Se
      alguém trocar o fuso do formatador pelo local, esta linha vira "fevereiro
      de 2024" em qualquer fuso negativo — e é o único jeito de esse bug de um
      dia ficar vermelho.
    */
    const meta = screen.getByText(
      `março de 2024 · ${pt.pages.book.plan.dayOfPlan
        .replace('{{number}}', '2')
        .replace('{{total}}', '3')}`,
    );

    // A tipografia do `Eyebrow`, valor a valor — é isto que o mutante M15
    // apagava sem um vermelho.
    expect(meta.className).toContain('font-mono');
    expect(meta.className).toContain('text-eyebrow');
    expect(meta.className).toContain('uppercase');
    expect(meta.className).toContain('tracking-[0.12em]');
    expect(meta.className).toContain('text-muted');
    // E o tom da HOME não vaza para cá (`Inicio.dc.html:41` é `--gold`).
    expect(meta.className).not.toContain('text-gold');

    /*
      ⚠️ **A COPIA À MÃO NÃO PODE VOLTAR.** O `Eyebrow` é um `<span>` por
      decisão escrita, e o que prova que ele é o dono é a fonte: nenhuma outra
      linha desta tela escreve a tipografia do rótulo à mão.
    */
    const source = stripComments(bookSource());
    expect(source).not.toContain('font-mono text-eyebrow');

    expectNoGuiltWithPlanPosition();
  });

  it('⚠️ says NOTHING about the position when the plan has no day of today', async () => {
    /*
      O par negativo, e ele é a metade que impede a frase de virar decoração:
      um livro do mês passado não tem "hoje", e uma posição inventada ("Dia 0
      de 30") seria exatamente a cobrança que o §1 proíbe — o vazio anunciado.

      E é por isso que ESTE estado chama o `expectNoGuilt()` de sempre: sem a
      frase isenta na tela, exigir uma subtração seria a asserção vazia do §7.4
      virada do avesso.
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

    expect(readableText()).not.toContain('Dia 1 de 2');
    expect(readableText()).not.toContain('Dia 0 de 2');

    /*
      ⚠️ **O MÊS FICA, E SOZINHO — sem o "·" pendurado.** A meta do cabeçalho
      é do LIVRO; quem depende de haver um dia de hoje é só a posição. Um
      separador órfão ("março de 2024 · ") é o tipo de sujeira que nenhuma
      varredura pega e que o olho do dono acha no primeiro scroll.
    */
    expect(screen.queryByText('março de 2024')).not.toBeNull();
    expect(readableText()).not.toContain('março de 2024 ·');

    /*
      ⚠️ E É AQUI QUE A VARIANTE DE SEMPRE MORDE O DEFEITO INVERSO: se a
      posição vazasse para um livro sem dia de hoje ("Dia 0 de 2", o vazio
      anunciado que o §1 proíbe), o `expectNoGuilt()` ficaria vermelho por
      conta própria — `scanGuilt()` devolveria 1 e a exigência é `toBe(0)`.
      Antes da rodada de correção da Tarefa 44 nada acusava esse lado.
    */
    expectNoGuilt();
  });

  it('⚠️ still catches a REAL scoreboard, with the exemption switched on (rule 7, decision H)', async () => {
    /*
      ⚠️ **O CASO (b) DO PAR POSITIVO DA TAREFA 40, CHEGANDO A UMA TELA DE
      VERDADE.**

      A isenção subtrai a frase do plano **caractere por caractere**, com buraco
      só de dígito. O atalho óbvio — `replace(/\d+ de \d+/g, '')` — entregaria
      esta suíte verde e isentaria TODO contador do app: a guarda continuaria
      no relatório e teria parado de guardar, que é a pior das duas falhas.

      Aqui o placar é plantado no conteúdo (o tema de um dia do plano), a frase
      isenta está na tela ao mesmo tempo, e a varredura TEM de acusar mesmo
      assim. Sem este teste, a decisão H ("as contagens de inventário são
      inventário, não placar") não teria como ser lida senão como confiança.
    */
    await renderBook({
      book: [
        bookReply(aBook({ id: BOOK_ID }), [
          aPlanItem({
            id: 'p-placar',
            order: 1,
            date: today(),
            title: 'Anotacoes 18 de 27',
          }),
        ]),
      ],
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(1);
    });

    // A frase isenta ESTÁ na tela — a precondição do caso (b).
    expect(readableText()).toContain(
      pt.pages.book.plan.dayOfPlan
        .replace('{{number}}', '1')
        .replace('{{total}}', '1'),
    );
    // E o placar plantado continua acusado, com a isenção ligada.
    expect(() => {
      expectNoGuiltWithPlanPosition();
    }).toThrow();
  });
});

describe('⚠️ THE BOOK GETS A SPINE, A SEAL AND A MARGIN (task 44, decisions C, E, F, G)', () => {
  it('⚠️ draws the typographic SPINE in the two sizes the canvas measures (decision C)', async () => {
    /*
      O app não tem imagem de capa e não vai ter: cadastrar um livro é digitar
      título, autor e plano. A lombada é o que dá cara de estante sem pedir
      arquivo a ninguém — `Livro.dc.html:44` (58×84) e
      `LivroDesktop.dc.html:47` (88×128).

      ⚠️ **DUAS LOMBADAS NO DOM, e é decisão declarada:** o `BookSpine` recebe o
      tamanho por prop (`md`/`lg`), e o corte de 1120px é media query. As duas
      ficam montadas e uma delas é escondida por CSS — o jsdom não aplica CSS,
      então o que esta suíte pode provar é que os DOIS tamanhos existem e que
      nenhuma das duas fala (as duas são `aria-hidden`, porque o título está
      escrito ao lado, no `h1`).
    */
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const spineBoxes = Array.from(document.querySelectorAll('span')).filter(
      (element) => element.querySelector('[class*="writing-mode"]') !== null,
    );
    expect(spineBoxes).toHaveLength(2);
    // Os dois tamanhos do canvas, e nenhum terceiro.
    expect(spineBoxes[0]?.className).toContain('h-21');
    expect(spineBoxes[1]?.className).toContain('h-32');

    /*
      ⚠️⚠️ **E CADA UMA APARECE NA SUA LARGURA — ESTA ASSERÇÃO NASCEU DE UM
      MUTANTE SOBREVIVENTE.** Apagar o `hidden min-[1120px]:flex` da lombada de
      desktop passava por **926 testes**, e o efeito na tela é **duas lombadas
      lado a lado em toda largura** — o desenho do canvas desfeito sem um
      vermelho.

      É a classe que a nota nº 20 da Tarefa 43 nomeou: *divergência declarada
      sem guarda é a próxima fatia a desfazê-la sem querer*. Aqui a
      "divergência" é a duplicação no DOM, que eu declarei no docblock da tela
      — e o que a torna aceitável é EXATAMENTE o par de media queries. Sem
      elas, a declaração vira defeito.
    */
    expect(spineBoxes[0]?.className).toContain('min-[1120px]:hidden');
    expect(spineBoxes[1]?.className).toContain('hidden');
    expect(spineBoxes[1]?.className).toContain('min-[1120px]:flex');

    // A lombada não fala: quem diz o título é o `h1`.
    for (const spine of spineBoxes) {
      expect(spine.getAttribute('aria-hidden')).toBe('true');
      expect(spine.getAttribute('aria-label')).toBeNull();
      expect(spine.textContent).toBe('O Hobbit');
    }
    // E nenhuma imagem: a lombada é `span` e borda (regra 8 da Tarefa 41b).
    expect(document.querySelector('img')).toBeNull();
    expectNoGuiltWithPlanPosition();
  });

  it('⚠️ the MARKED touch is the golden SEAL; the unmarked one is not (decision F)', async () => {
    /*
      ⚠️ **O PRIMEIRO CONSUMIDOR DA VARIANTE `seal`**, que nasceu na Tarefa 41a
      sem nenhum. `Livro.dc.html:55`: `background:var(--gold-soft)`,
      `border:1px solid var(--gold-line)`, `color:var(--gold-strong)`.

      `seal` é ESTADO, não hierarquia: o ouro é o filete da edição crítica — o
      dia de hoje, a abertura de seção —, e o botão só o veste quando a marca
      de hoje já existe. Desmarcado ele continua `ghost`, e é o par negativo
      que impede "ouro em todo botão".
    */
    await renderBook({
      book: [
        bookReply(aBook({ id: BOOK_ID }), plan(), WRITERS, [
          { planItemId: TODAY_ID, userIds: [MARCOS] },
        ]),
      ],
    });

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const marked = readButtonOrThrow(true);
    expect(marked.className).toContain('bg-gold-soft');
    expect(marked.className).toContain('border-gold-line');
    expect(marked.className).toContain('text-gold-strong');

    /*
      O par negativo NA MESMA TELA: a tela tem outros botões (o "editar o
      plano" do admin), e nenhum deles veste o ouro. Sem isto, um `seal` posto
      no `Button` por padrão passaria.
    */
    const golden = Array.from(document.querySelectorAll('button')).filter(
      (button) => button.className.includes('bg-gold-soft'),
    );
    expect(golden).toEqual([marked]);
    expect(document.querySelectorAll('button').length).toBeGreaterThan(1);
    expectNoGuiltWithPlanPosition();
  });

  it('⚠️ keeps the UNMARKED touch a ghost — the gold is the STATE, not a rank (decision F)', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const unmarked = readButtonOrThrow(false);
    expect(unmarked.className).not.toContain('bg-gold-soft');
    expect(unmarked.className).not.toContain('text-gold-strong');
    expect(unmarked.className).toContain('border-line');
    expectNoGuiltWithPlanPosition();
  });

  it('⚠️ puts the MARKS legend in the margin, and the two samples differ by FILL (decision E)', async () => {
    /*
      `LivroDesktop.dc.html:180-192`: a margem de 320px com o bloco "As marcas"
      — uma amostra vazada com "Leu neste dia" e uma cheia com "Leu e
      escreveu". São as três chaves que a Tarefa 40 criou e que ninguém
      consumia (`pages.book.marks.{heading,read,wrote}`).

      ⚠️ **ABAIXO DE 1120px A MARGEM DESCE PARA O FLUXO** — isso é do
      `MarginRail` e é media query, não condição de render. A legenda aparece
      nas duas larguras, e a alternativa (esconder por media query) seria
      invisível para o teste, que é a armadilha que a Tarefa 43 registrou na
      nota nº 20.
    */
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const rail = document.querySelector('aside');
    expect(rail).not.toBeNull();
    expect(rail?.textContent).toContain(pt.pages.book.marks.heading);
    expect(rail?.textContent).toContain(pt.pages.book.marks.read);
    expect(rail?.textContent).toContain(pt.pages.book.marks.wrote);
    // A divergência declarada da Tarefa 43 (nota 20), com guarda: a seção NÃO
    // se esconde no celular.
    expect(rail?.className ?? '').not.toContain('hidden');

    /*
      ⚠️ **AS DUAS AMOSTRAS SE DISTINGUEM POR PREENCHIMENTO, não por matiz** —
      é a mesma propriedade que a linha do plano carrega, e ela é medida aqui
      também porque a legenda é justamente o que explica a forma a quem vê.
    */
    const marks = Array.from(rail?.querySelectorAll('[role="img"]') ?? []);
    const samples = marks.map((element) => element.className);
    expect(samples).toHaveLength(2);
    const [hollow, filled] = samples;
    expect(hollow ?? '').not.toMatch(/(?<![\w-])bg-[\w-]+/u);
    expect(filled ?? '').toMatch(/(?<![\w-])bg-[\w-]+/u);

    /*
      ⚠️⚠️ **A AMOSTRA NÃO FALA — E ESTA ASSERÇÃO NASCEU DE UM MUTANTE
      SOBREVIVENTE (M7).** Tirar o `aria-hidden="true"` do envoltório do
      `PresenceMark` passava por **926 testes, com ZERO acusadores**, e o
      efeito é auditivo: cada linha da legenda passa a anunciar a frase DUAS
      vezes — uma pelo `role="img"` + `aria-label` da marca, outra pelo texto
      escrito ao lado. É a lição nº 16 do MVP 2 ("duas coisas que falam a mesma
      frase"), que o docblock deste `describe` **cita por escrito** e que
      ninguém tinha transformado em guarda.

      ⚠️ **AS LOMBADAS TÊM A ASSERÇÃO ANÁLOGA** (`draws the typographic SPINE`,
      que exige `aria-hidden="true"` nas duas); a legenda não tinha. É a mesma
      classe da nota nº 20 da Tarefa 43: decisão declarada em prosa, sem
      guarda.

      O `PresenceMark` exige `label` e é certo que exija — na linha do plano
      ele é a ÚNICA coisa que diz quem passou por ali. Quem o silencia é o
      CHAMADOR, e só onde a informação já está escrita ao lado.
    */
    for (const mark of marks) {
      expect(mark.closest('[aria-hidden="true"]')).not.toBeNull();
    }

    /*
      O par positivo, na mesma tela: na LINHA DO PLANO a mesma marca continua
      falando. Sem isto, "silenciar tudo" passaria — e aí o dia com leitor
      viraria uma bolinha muda para quem ouve.
    */
    const spoken = Array.from(document.querySelectorAll('[role="img"]')).filter(
      (mark) => mark.closest('[aria-hidden="true"]') === null,
    );
    expect(spoken.length).toBeGreaterThan(0);

    expectNoGuiltWithPlanPosition();
  });

  /**
   * ⚠️ **"NESTE LIVRO" E "ÚLTIMO GRIFO" — Tarefa 44b**
   * (`LivroDesktop.dc.html:196-207` e `:211-218`).
   *
   * Os dois blocos que a Tarefa 44 **parou** e reportou: o inventário exigia
   * uma contagem que a API não devolvia, e a contagem das listagens seria
   * truncada em 500 — *lista truncada é registro; contagem truncada é
   * mentira*. O dono abriu exceção ao fora-de-escopo do MVP 3.5, o backend
   * ganhou `inventory` e `lastHighlight`, e as três chaves
   * `pages.book.inBook.*` da Tarefa 40 finalmente têm consumidor.
   *
   * ⚠️ **O FIXTURE É ESCOLHIDO PARA A IMPLEMENTAÇÃO ERRADA FALHAR** (§7.2), e
   * são quatro propriedades:
   *
   * 1. **18 ≠ 9**: trocar os dois números de lugar acusa. Com dois números
   *    iguais, a troca passaria;
   * 2. **a cor do grifo é AZUL, não o amarelo da maquete.** É a armadilha mais
   *    fácil desta fatia: o canvas desenha o bloco em `#c89a44`/`#f0e2b4`, que
   *    são `--pen-a-dot` e `--pen-a`, e quem fixasse a caneta em `a` teria a
   *    tela IDÊNTICA ao artboard e ERRADA para todo grifo que não é amarelo;
   * 3. **a página existe e o autor NÃO sou eu** (a Zeca): a linha de mono tem
   *    de dizer os dois, e "Você" no lugar do nome acusa;
   * 4. **o padrão da suíte é `lastHighlight: null`**, então o bloco só aparece
   *    onde este `describe` o monta — um bloco desenhado sempre acusa no teste
   *    do livro sem grifo, logo abaixo.
   */
  describe('"Neste livro" and "Último grifo" (task 44b)', () => {
    const BLUE = '#3b82f6';

    /**
     * O grifo do fixture, com a página e a cor que a tela tem de RESPEITAR.
     * `page` é parâmetro porque `null` é caso legítimo e documentado — e
     * porque, medido na rodada de correção desta fatia, **nenhum teste do
     * projeto renderizava um grifo sem página**: o ramo `page === null` do
     * `MarginHighlight` tinha ZERO acusadores, e um `'PLACAR 18 de 27'`
     * plantado nele passava pelos 931 testes do app com a varredura
     * anti-culpa inteira passando ao largo, porque ela nunca chegava a
     * renderizar aquele ramo.
     */
    function lastHighlight(page: number | null = 138): LastHighlightResponse {
      return {
        id: 'h-1',
        userId: ZECA,
        quote: 'encaixar-se é o oposto de pertencer',
        color: BLUE,
        page,
      };
    }

    async function renderWithMargin(
      grifo: LastHighlightResponse | null = lastHighlight(),
    ): Promise<void> {
      await renderBook({
        book: [
          bookReply(
            aBook({ id: BOOK_ID }),
            plan(),
            WRITERS,
            READERS,
            { notes: 18, highlights: 9 },
            grifo,
          ),
        ],
      });

      await waitFor(() => {
        expect(planRows()).toHaveLength(3);
      });
    }

    /**
     * ⚠️ **A FORMA DA MARGEM, NA ORDEM EM QUE ELA APARECE — e é uma asserção
     * só porque as duas propriedades que ela guarda nasceram do MESMO
     * mutante sobrevivente.**
     *
     * O canvas desenha a coluna de 320px nesta ordem, com um filete de 1px
     * entre cada par de blocos: "As marcas" · filete (`LivroDesktop.dc.html:194`)
     * · "Neste livro" (`:196`) · filete (`:209`) · "Último grifo" (`:211`).
     *
     * Medido na rodada de correção desta fatia, os dois lados estavam soltos:
     * **trocar "Neste livro" e "Último grifo" de lugar passava pelos 931
     * testes do app**, e os dois filetes **não existiam** embora a Definição
     * de pronto os marcasse como feitos. Uma lista de rótulos na ordem do DOM
     * fecha os dois — e fecha também o terceiro caso, o de uma seção
     * desaparecer sem ninguém notar.
     */
    function railShape(): string[] {
      const aside = document.querySelector('aside');
      return Array.from(aside?.children ?? []).map((child) =>
        child.tagName === 'SECTION'
          ? (child.querySelector('h2')?.textContent ?? '(seção sem rótulo)')
          : 'filete',
      );
    }

    /** A seção da margem que contém aquele rótulo. */
    function railSectionWith(heading: string): HTMLElement {
      const aside = document.querySelector('aside');
      const section = Array.from(
        aside?.querySelectorAll<HTMLElement>('section') ?? [],
      ).find((element) => element.textContent?.includes(heading));
      if (section === undefined) {
        throw new Error(`nenhuma seção da margem com "${heading}"`);
      }
      return section;
    }

    /** A linha de inventário daquele rótulo, dentro de "Neste livro". */
    function inventoryRow(label: string): HTMLElement {
      const row = Array.from(
        railSectionWith(
          pt.pages.book.inBook.heading,
        ).querySelectorAll<HTMLElement>('a'),
      ).find((element) => element.textContent?.startsWith(label));
      if (row === undefined) throw new Error(`nenhuma linha "${label}"`);
      return row;
    }

    it('⚠️ draws the three blocks in the CANVAS ORDER, with a hairline between them', async () => {
      await renderWithMargin();

      /*
        ⚠️ **DOIS MUTANTES SOBREVIVENTES NUMA ASSERÇÃO SÓ.** Trocar as duas
        seções de lugar dava **0 de 931**, e os dois filetes de
        `LivroDesktop.dc.html:194` e `:209` simplesmente **não existiam** — a
        Definição de pronto desta fatia os declarava desenhados. Uma lista de
        rótulos na ordem do DOM prova a ordem, a presença e a contagem dos
        separadores de uma vez.
      */
      expect(railShape()).toEqual([
        pt.pages.book.marks.heading,
        'filete',
        pt.pages.book.inBook.heading,
        'filete',
        pt.pages.book.inBook.lastHighlight,
      ]);

      /*
        E o filete é o que o canvas desenha: 1px de altura na cor do traço
        suave (`#e3ddc9` é `--border-soft`, medido em `theme.css`), e MUDO —
        um `<div>` vazio que o leitor de tela anunciasse seria a lição nº 16
        do MVP 2 pela porta dos fundos.
      */
      const filetes = Array.from(
        document.querySelector('aside')?.children ?? [],
      ).filter((child) => child.tagName !== 'SECTION');
      expect(filetes).toHaveLength(2);
      for (const filete of filetes) {
        expect(filete.className).toContain('h-px');
        expect(filete.className).toContain('bg-line-soft');
        expect(filete.getAttribute('aria-hidden')).toBe('true');
      }

      expectNoGuiltWithPlanPosition();
    });

    /**
     * ⚠️ **SEM GRIFO, SEM O SEGUNDO FILETE.** Um separador com nada depois
     * dele é um traço solto no fim da coluna — e é o erro que um filete
     * escrito como "depois de toda seção" cometeria no livro recém-cadastrado,
     * que é o estado mais comum de todos.
     */
    it('⚠️ drops the second hairline together with the last-highlight block', async () => {
      await renderWithMargin(null);

      expect(railShape()).toEqual([
        pt.pages.book.marks.heading,
        'filete',
        pt.pages.book.inBook.heading,
      ]);

      expectNoGuiltWithPlanPosition();
    });

    /**
     * ⚠️ **A LINHA DE INVENTÁRIO TEM O FILETE EMBAIXO** — `border-bottom: 1px
     * solid #e3ddc9` em `LivroDesktop.dc.html:198-205`, que é o que separa
     * "Anotações do clube" de "Grifos" sem precisar de cor nem de peso.
     *
     * Medido na rodada de correção desta fatia: tirar o
     * `border-b border-line-soft` das duas linhas dava **0 de 931**. Toda
     * asserção da margem era sobre TEXTO, e texto não vê traço.
     */
    it('⚠️ underlines each inventory row with the canvas hairline', async () => {
      await renderWithMargin();

      for (const label of [
        pt.pages.book.inBook.notes,
        pt.pages.book.inBook.highlights,
      ]) {
        const row = inventoryRow(label);
        expect(row.className).toContain('border-b');
        expect(row.className).toContain('border-line-soft');
      }

      expectNoGuiltWithPlanPosition();
    });

    /**
     * ⚠️⚠️ **O GRIFO SEM PÁGINA — o ramo que NENHUM teste do projeto
     * renderizava.**
     *
     * `page` é anulável por decisão de produto: dá para grifar sem anotar a
     * página, e o `MarginHighlight` tem um ramo próprio para isso desde a
     * Tarefa 43. Medido na rodada de correção desta fatia, o ramo tinha
     * **zero acusadores**: um `'PLACAR 18 de 27'` plantado nele passava pelos
     * 931 testes do app, **e a varredura anti-culpa inteira passava ao
     * largo** — não porque ela seja fraca, mas porque `grep "page: null"`
     * dava **0** em `book.test.tsx` e em `day-note.test.tsx`. Guarda que nunca
     * renderiza o estado não guarda o estado (§7.9).
     *
     * A linha diz só o NOME: sem página, "Página null · Zeca" e "· Zeca"
     * seriam os dois jeitos de errar, e os dois ficam vermelhos aqui.
     */
    it('⚠️ says only the NAME when the highlight has no page', async () => {
      await renderWithMargin(lastHighlight(null));

      const section = railSectionWith(pt.pages.book.inBook.lastHighlight);
      // A linha do grifo é a que fica ao LADO da bolinha — e não o primeiro
      // `.font-mono` da seção, que é o `Eyebrow` do rótulo.
      const dot = section.querySelector('span[aria-hidden="true"]');
      expect(dot?.nextElementSibling?.textContent).toBe('Zeca');
      // E nada de "Página", nem do separador órfão.
      expect(section.textContent).not.toContain('Página');
      expect(section.textContent).not.toContain('·');
      expect(section.textContent).not.toContain('null');

      // O resto do bloco continua inteiro: o trecho e a caneta daquele grifo.
      expect(section.textContent).toContain(
        'encaixar-se é o oposto de pertencer',
      );
      expect(
        section.querySelector('span[aria-hidden="true"]')?.className ?? '',
      ).toContain('bg-pen-z-dot');

      /*
        ⚠️ **E A VARREDURA ANTI-CULPA RODA AQUI**, que é a metade que faltava:
        este é um estado da tela, e o §7.9 manda a varredura rodar em TODOS
        eles — o estado "feliz" incluído.
      */
      expectNoGuiltWithPlanPosition();
    });

    it('⚠️ puts the ACERVO INVENTORY in the margin, each number next to its OWN label', async () => {
      await renderWithMargin();

      const section = railSectionWith(pt.pages.book.inBook.heading);
      /*
        ⚠️ **Cada número é lido DENTRO da sua linha**, e não no texto da seção
        inteira: um `textContent` da seção conteria "18" e "9" mesmo com os
        dois trocados de lugar, e o teste que dizia guardar o inventário
        guardaria só a presença dos dígitos.
      */
      expect(inventoryRow(pt.pages.book.inBook.notes).textContent).toBe(
        `${pt.pages.book.inBook.notes}18`,
      );
      expect(inventoryRow(pt.pages.book.inBook.highlights).textContent).toBe(
        `${pt.pages.book.inBook.highlights}9`,
      );

      // Os três links da seção levam ao acervo do LIVRO, sem filtro (decisão
      // E): a pré-aplicação do tipo é território da Tarefa 46.
      const links = Array.from(section.querySelectorAll('a'));
      expect(links).toHaveLength(3);
      for (const link of links) {
        expect(link.getAttribute('href')).toBe(`/books/${BOOK_ID}/acervo`);
      }

      /*
        ⚠️ **GUARDA DE VISIBILIDADE, não só de presença no DOM.** A rodada de
        correção da Tarefa 44 fechou dois mutantes exatamente assim: um
        `hidden` esconde da tela e **não** some do DOM, então toda asserção de
        texto continua verde. A margem inteira desce para o fluxo abaixo de
        1120px (é o `MarginRail`), e esta seção aparece nas duas larguras.
      */
      expect(section.className).not.toContain('hidden');
      expect(document.querySelector('aside')?.className ?? '').not.toContain(
        'hidden',
      );

      expectNoGuiltWithPlanPosition();
    });

    it('⚠️ paints the LAST HIGHLIGHT with the pen of THAT highlight, never a fixed colour', async () => {
      await renderWithMargin();

      const section = railSectionWith(pt.pages.book.inBook.lastHighlight);
      // A linha de mono diz a página E quem grifou — o nome de verdade, pelo
      // mesmo `nameOfWriter` das outras sete telas.
      expect(section.textContent).toContain('Página 138 · Zeca');
      expect(section.textContent).toContain(
        'encaixar-se é o oposto de pertencer',
      );

      /*
        ⚠️⚠️ **A CANETA É A DAQUELE GRIFO.** O grifo do fixture é AZUL, então a
        bolinha é `bg-pen-z-dot` e o papel é `bg-pen-z`. Fixar a caneta em `a`
        — que é o que a maquete desenha — deixa a tela idêntica ao artboard e
        errada para quatro das cinco cores.
      */
      const dot = section.querySelector('span[aria-hidden="true"]');
      expect(dot?.className ?? '').toContain('bg-pen-z-dot');
      expect(dot?.className ?? '').not.toContain('bg-pen-a-dot');

      const mark = section.querySelector('p > span');
      expect(mark?.className ?? '').toContain('bg-pen-z');
      expect(mark?.className ?? '').toContain('ring-pen-z');
      expect(mark?.className ?? '').not.toContain('bg-pen-a');

      /*
        ⚠️ **A BOLINHA NÃO FALA** (regra 8, lição nº 16 do MVP 2): ela é
        decoração ao lado de um texto que já diz a página e o nome. Tirar o
        `aria-hidden` faz o leitor de tela anunciar um elemento vazio no meio
        da frase — e foi exatamente este mutante (M7) que sobreviveu a 926
        testes na rodada de correção da Tarefa 44.
      */
      expect(dot?.getAttribute('aria-hidden')).toBe('true');

      // E a seção não se esconde por media query.
      expect(section.className).not.toContain('hidden');

      expectNoGuiltWithPlanPosition();
    });

    /**
     * ⚠️ **AUSENTE ≠ VAZIO.** Livro sem grifo nenhum não ganha o bloco com o
     * rótulo e um espaço em branco embaixo — isso seria o vazio anunciado que
     * o §1 do plano proíbe, a mesma razão pela qual o dia sem autoria não
     * ganha "ninguém escreveu". O inventário, esse, aparece com zero: ele diz
     * o tamanho do acervo, e zero é um tamanho.
     */
    it('⚠️ draws NO last-highlight block when the book has no highlight yet', async () => {
      await renderBook();

      await waitFor(() => {
        expect(planRows()).toHaveLength(3);
      });

      const aside = document.querySelector('aside');
      expect(aside?.textContent).not.toContain(
        pt.pages.book.inBook.lastHighlight,
      );
      // O par positivo: o inventário continua ali, zerado.
      expect(aside?.textContent).toContain(pt.pages.book.inBook.heading);
      expect(inventoryRow(pt.pages.book.inBook.notes).textContent).toBe(
        `${pt.pages.book.inBook.notes}0`,
      );

      expectNoGuiltWithPlanPosition();
    });

    /**
     * ⚠️ **AS CONTAGENS SÃO INVENTÁRIO, NÃO PLACAR — e esta é a guarda que a
     * decisão F pede por escrito.**
     *
     * "Anotações do clube 18" não casa o `COUNTER_SHAPE` porque não tem total
     * ao lado, e é isso que a varredura dos dois testes acima já mede. Este
     * `it()` mede o OUTRO lado: que a varredura ainda MORDE nesta tela. Um
     * "18 de 27 anotações" plantado na margem tem de ficar vermelho — senão
     * as três chamadas de `expectNoGuiltWithPlanPosition()` deste bloco
     * estariam dizendo "não há placar" sobre uma guarda que parou de guardar.
     */
    it('⚠️ would catch a scoreboard planted in the margin', async () => {
      await renderWithMargin();

      const section = railSectionWith(pt.pages.book.inBook.heading);
      const planted = document.createElement('p');
      planted.textContent = '18 de 27 anotações';
      section.append(planted);

      expect(() => {
        expectNoGuiltWithPlanPosition();
      }).toThrow();

      planted.remove();
      expectNoGuiltWithPlanPosition();
    });
  });

  it('⚠️ draws NO margin at all while there is no book yet, nor when it failed', async () => {
    /*
      ⚠️ **ESTE `it()` NASCEU DE UM MUTANTE SOBREVIVENTE, e a medição é o
      argumento.** Trocar o `rail={state.status === 'ready' ? rail() : undefined}`
      por `rail={rail()}` — a margem montada SEMPRE — passava por **925 testes
      do app sem um vermelho**, e o efeito na tela é um `<aside>` de 320px com
      um filete vertical ao lado de "Carregando…" e ao lado do 404.

      É exatamente a classe que a Tarefa 42 mediu ao criar a prop (**2
      acusadores**, os dois nascidos do caso VAZIO) e que a Tarefa 43 repetiu:
      **ausente ≠ vazio**. A capacidade tem guarda em `chrome.test.tsx` e na
      tela do dia; nesta tela ela não tinha nenhuma, porque o acusador da
      legenda só olha o estado feliz.

      Os DOIS estados sem livro, porque eles chegam por caminhos diferentes: o
      carregamento (o primeiro frame, antes da resposta) e a falha (o 404, que
      não reabre).
    */
    await renderBook({
      book: [{ status: 404, body: { error: 'Not found' } }],
    });

    await waitFor(() => {
      expect(screen.queryByText(pt.pages.book.bookUnavailable)).not.toBeNull();
    });
    expect(document.querySelector('aside')).toBeNull();
    // E a tela continua de pé: o que falta é a margem, não a página.
    expect(bookScreenIsUp()).toBe(true);
    expectNoGuilt();
  });

  it('⚠️ labels the plan section with the Eyebrow, and hangs the marks hint beside it (decision G)', async () => {
    /*
      `Livro.dc.html:66-68`: o rótulo de seção em mono maiúscula à esquerda e a
      legenda "Cheio = escreveu" à direita, sobre um filete de 2px em
      `--accent`. O `Eyebrow` (Tarefa 41b) é essa tipografia — mono 10px,
      0.12em, maiúscula —, e a Tarefa 43 já o pôs em uso na tela do dia: duas
      tipografias de rótulo na mesma tela é a "correção incompleta" que este
      bloco já pagou duas vezes.

      ⚠️ **DIVERGÊNCIA DECLARADA:** o canvas escreve "Plano de leitura" e a tela
      escreve "Dias do plano de leitura", que é o valor de
      `pages.book.plan.label` — a chave que já nomeava a lista. Encurtá-la
      exigiria uma chave NOVA, e a regra 9 não permite nenhuma.
    */
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const label = screen.getByText(pt.pages.book.plan.label);
    expect(label.className).toContain('font-mono');
    expect(label.className).toContain('text-eyebrow');
    expect(label.className).toContain('uppercase');
    // ⚠️ O `Eyebrow` é um `<span>` por decisão escrita (a tipografia do
    // rótulo, não a semântica dele): quem carrega a seção é o `<h2>` em volta.
    expect(label.tagName).toBe('SPAN');
    expect(label.parentElement?.tagName).toBe('H2');

    // A legenda das marcas, que é a quarta chave órfã da Tarefa 40.
    const hint = screen.getByText(pt.pages.book.marks.hint);
    expect(hint).not.toBeNull();

    /*
      ⚠️⚠️ **ELA APARECE NAS DUAS LARGURAS — E ESTA ASSERÇÃO NASCEU DE UM
      MUTANTE SOBREVIVENTE (M12).** Pôr `hidden` nesta legenda — escondê-la em
      TODA largura — passava por **926 testes**. O jsdom não aplica CSS, então
      um `hidden` (ou um `min-[1120px]:hidden`) some da tela e não some do DOM:
      é exatamente a armadilha que a nota nº 20 da Tarefa 43 nomeou e que a
      nota 8.7 da execução desta fatia **escreveu por extenso** — "esconder por
      media query seria invisível para o teste" — sem escrever a guarda.

      O `<aside>` da margem tem a guarda análoga três `it()` acima
      (`not.toContain('hidden')`); esta linha faltava. A divergência declarada
      é que o canvas desenha a frase só no celular (`Livro.dc.html:68`) e a
      tela a mostra nas duas — declarada É, mas agora com acusador.
    */
    expect(hint.className).not.toContain('hidden');
    expect(hint.parentElement?.className ?? '').not.toContain('hidden');

    /*
      ⚠️ **O FILETE DE 2px EM `--accent` QUE ABRE A SEÇÃO — E ESTA ASSERÇÃO
      NASCEU DE UM MUTANTE SOBREVIVENTE.** Apagar o `border-b-2 border-accent`
      da linha do rótulo passava por **926 testes**, e o que some da tela é o
      traço que separa o cabeçalho do livro do sumário — `Livro.dc.html:66` e
      `LivroDesktop.dc.html:65`, os dois com `border-bottom:2px solid
      var(--accent)`.

      Um filete a menos não muda texto, nem papel, nem foco: é exatamente o
      tipo de coisa que a Tarefa 42 descobriu que passa despercebida (o
      `rule="none"` das três telas sem filete de abertura).
    */
    const header = label.parentElement?.parentElement;
    expect(header?.className).toContain('border-b-2');
    expect(header?.className).toContain('border-accent');
    // E o rótulo e a legenda dividem ESSA linha — não duas.
    expect(header?.contains(hint)).toBe(true);
    expectNoGuiltWithPlanPosition();
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
  it('has ONE VISIBLE link to the collection per width, and no tab left', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    /*
      ⚠️⚠️ **O TESTE MUDOU NA TAREFA 44b, e a propriedade que ele guarda NÃO
      afrouxou — ela ficou mais apertada.**

      Ele dizia "UM link" e contava os do DOM. Na 44b o canvas passou a pedir a
      mesma frase em dois LUGARES diferentes conforme a largura: no corpo no
      celular (`Livro.dc.html:60`) e **só** na margem no desktop
      (`LivroDesktop.dc.html:206`). Os dois ficam montados e o CSS mostra um —
      o MESMO desenho das duas lombadas do cabeçalho, que este arquivo já
      testa assim.

      Então a asserção passou a ser sobre a EXCLUSÃO MÚTUA, que é o que a
      pessoa de fato vê: dois no DOM, e exatamente um visível em cada largura.
      Um terceiro link, ou os dois visíveis ao mesmo tempo, ficam vermelhos
      aqui — o que a versão anterior **não** pegava, porque ela só sabia
      contar.
    */
    const links = screen.getAllByRole('link', {
      name: pt.pages.book.acervoLink,
    });
    expect(links).toHaveLength(2);
    const [inBody, inRail] = links;
    // O do CORPO some acima de 1120px; o da MARGEM só aparece lá.
    expect(inBody?.parentElement?.className ?? '').toContain(
      'min-[1120px]:hidden',
    );
    /*
      ⚠️⚠️ **O PAR NEGATIVO DO LADO DO CORPO — e ele FALTAVA.**

      A asserção de cima prova que o link do corpo some ACIMA de 1120px. Ela
      não prova nada sobre abaixo: medido na rodada de correção desta fatia,
      trocar `flex min-[1120px]:hidden` por `hidden min-[1120px]:hidden` — ou
      seja, escondê-lo em TODA largura — passava pelos 931 testes do app. E o
      efeito é o pior possível: no celular, que é onde o `MarginRail` desce
      para o fluxo mas este link é o único visível, a tela do livro ficaria
      **sem nenhum caminho para o acervo**, com a suíte verde.

      ⚠️ **É a TERCEIRA aparição deste padrão neste arquivo** (as duas
      lombadas do cabeçalho, a legenda "As marcas" da Tarefa 44, e este par) e
      a primeira em que só metade havia sido fechada.

      ⚠️⚠️ **E A FRONTEIRA DE PALAVRA NÃO BASTAVA — corrigido na auditoria da
      Tarefa 45.** O `/(^|\s)hidden(\s|$)/u` que estava aqui acusa `hidden`
      cru e **deixa passar** `max-[1119px]:hidden`, `max-lg:hidden` e
      `[@media(max-width:1119px)]:hidden` — ou seja, deixa passar justamente
      "escondi este link no CELULAR", que é o lado que este par negativo
      existe para fechar. Medido no `home.test.tsx`, onde a mesma regex nasceu:
      a variante `max-[1119px]:` sobrevivia com **zero** acusadores.

      A guarda passou a ser de TOKEN: toda classe do Tailwind é
      `variante:…:utilitário`, então o utilitário é o último segmento depois de
      `:`. Assim toda media query é pega, e `overflow-hidden` —
      classe legítima e comum — continua em paz, que é a razão de isto nunca
      ter sido um `toContain('hidden')`.
    */
    const hidesInSomeWidth = (classes: string): string[] =>
      classes
        .split(/\s+/u)
        .filter((name) => name.split(':').at(-1) === 'hidden');

    /*
      ⚠️ **A LISTA EXATA, e não "nenhuma":** este link TEM de sumir acima de
      1120px (é o par do da margem), então a resposta certa é uma classe de
      sumiço e **exatamente** ela. Assim `hidden` cru, `max-[1119px]:hidden` e
      qualquer terceira variante mudam a lista e ficam vermelhos, e a
      mensagem de falha já diz qual classe apareceu.
    */
    expect(hidesInSomeWidth(inBody?.parentElement?.className ?? '')).toEqual([
      'min-[1120px]:hidden',
    ]);
    // O da margem é o espelho: some ABAIXO do corte, e só lá ele aparece.
    expect(hidesInSomeWidth(inRail?.className ?? '')).toEqual(['hidden']);
    expect(inRail?.className ?? '').toContain('min-[1120px]:inline-flex');
    // E o da margem está DENTRO do `<aside>`, não solto no corpo.
    expect(inRail?.closest('aside')).not.toBeNull();
    expect(inBody?.closest('aside')).toBeNull();

    for (const link of links) {
      // A âncora tem endereço de verdade: é o que faz Ctrl+clique e "abrir em
      // nova aba" funcionarem.
      expect(link.getAttribute('href')).toBe(`/books/${BOOK_ID}/acervo`);
      expect(link.hasAttribute('disabled')).toBe(false);
      expect(link.getAttribute('aria-disabled')).toBeNull();
    }

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

    expectNoGuiltWithPlanPosition();
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

    /*
      ⚠️ **O DA MARGEM, e não o do corpo** (Tarefa 44b): os dois levam ao mesmo
      endereço, e é o da margem que nasceu nesta fatia — o do corpo já estava
      testado desde a 28. Um `Link` trocado por âncora crua ali ficaria
      vermelho **aqui**, que é o único lugar onde a diferença aparece.
    */
    const inRail = screen
      .getAllByRole('link', { name: pt.pages.book.acervoLink })
      .find((link) => link.closest('aside') !== null);
    if (inRail === undefined) {
      throw new Error('o link do acervo na margem não existe');
    }
    await press(inRail);

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
  /**
   * ⚠️ **O LINK DO CORPO TAMBÉM NAVEGA — e ele é o ÚNICO que a pessoa vê no
   * CELULAR.**
   *
   * O `it()` acima clica o da MARGEM, que é o que nasceu na Tarefa 44b. Medido
   * na rodada de correção dela: depois daquela troca, o link do corpo **não
   * era clicado por teste nenhum** — o que sobrava dele era uma substring de
   * classe (`min-[1120px]:hidden`). Somado ao mutante que o escondia em toda
   * largura, o caminho do celular para o acervo ficava guardado por nada.
   *
   * Os dois levam ao mesmo endereço e os dois são `Link` do roteador. Clicar
   * os dois é barato, e é o que faz "um visível por largura" significar "e o
   * que está visível funciona".
   */
  it('⚠️ navigates from the link in the BODY too — the only one on a phone', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const inBody = screen
      .getAllByRole('link', { name: pt.pages.book.acervoLink })
      .find((link) => link.closest('aside') === null);
    if (inBody === undefined) {
      throw new Error('o link do acervo no corpo não existe');
    }
    await press(inBody);

    expect(locationText()).toBe(`/books/${BOOK_ID}/acervo`);
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
    expectNoGuiltWithPlanPosition();
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
    expectNoGuiltWithPlanPosition();
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
    /*
      ⚠️ **A VARREDURA ESTRITA DOS DOIS LADOS DO CLIQUE, desde a Tarefa 45.**

      Esta linha varre a HOME, e a home passou a mostrar a posição no plano
      ("Dia 11 de 30", decisão F daquela fatia) — a mesma frase isenta que a
      tela do livro já mostrava. As duas variantes são MUTUAMENTE EXCLUSIVAS:
      deixar o `expectNoGuilt()` aqui ficaria vermelho, e é de propósito que
      fique. Nada foi afrouxado; a exigência subiu nos dois lados.
    */
    expectNoGuiltWithPlanPosition();

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
    expectNoGuiltWithPlanPosition();
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

      ⚠️⚠️ **E FOI EXATAMENTE ISSO QUE ACONTECEU DE NOVO NA TAREFA 44b — o
      aviso acima, no mesmo arquivo, no mesmo teste.** A fatia extraiu
      `margin-highlight.tsx` e a lista literal continuou com dois nomes: a
      tela do livro passou a ter TRÊS arquivos e a varredura lia dois. O
      arquivo de fora é o que desenha COR (a caneta do grifo, a bolinha, o
      papel do `GrifoText`), ou seja, o mais exposto dos três à cor de perigo.

      ⚠️ **A lição, escrita para a próxima:** uma lista literal de arquivos é a
      mesma classe de defeito que a lista literal de classes de cor que o §7.9
      já proíbe — as duas conhecem o que existia no dia em que foram escritas.
      A varredura irmã de `adr-0002-iconography.test.ts` é **recursiva** sobre
      `src/pages/`, e por isso absorveu o arquivo novo sozinha (medido). Esta
      continua por lista porque as três telas deste arquivo são um conjunto
      nomeado — e o preço de ser por lista é ESTE `it()` ter de crescer junto
      com o `split`.
    */
    for (const file of [
      'book.tsx',
      'reading-marks.tsx',
      'margin-highlight.tsx',
    ]) {
      expect(stripComments(pageSource(file))).not.toMatch(DANGER_STYLE);
    }

    // O lado positivo do par: os arquivos lidos são os certos (um caminho
    // errado lançaria, mas um arquivo VAZIO passaria calado — §7.4 escrito
    // como varredura de fonte).
    expect(stripComments(bookSource())).toContain('pages.book.plan.today');
    expect(stripComments(pageSource('reading-marks.tsx'))).toContain(
      'pages.book.plan.readerNamed',
    );
    // O par positivo do terceiro arquivo, e ele é escolhido para valer: é a
    // linha que PINTA — a caneta daquele grifo, que é a razão de o arquivo
    // estar na varredura.
    expect(stripComments(pageSource('margin-highlight.tsx'))).toContain(
      'PEN_DOT_CLASS[COLOR_PEN_KEYS[color]]',
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

  /*
    ⚠️⚠️ **AQUI VIVIA O PINO DE FONTE `scans the plan-position states with the
    EXEMPTION-EXERCISING variant`, E ELE FOI APAGADO na rodada de correção da
    Tarefa 44 — com a medição que o desmente.**

    Ele lia o próprio fonte deste arquivo e exigia ≥ 45 chamadas da variante,
    sob a afirmação de que o mutante obrigatório da regra 3 **sobreviveria por
    construção**, porque "trocar a variante estrita pela frouxa remove uma
    asserção, e asserção removida nunca fica vermelha sozinha".

    ⚠️ **A afirmação era FALSA.** O mutante sobrevivia pela FORMA ANINHADA do
    helper — a variante estrita chamava a de sempre e somava uma exigência, o
    que a tornava superconjunto —, não por construção. Reestruturado o helper
    em torno de um núcleo `scanGuilt(): number`, as duas variantes ficaram
    MUTUAMENTE EXCLUSIVAS (`toBe(0)` contra `toBeGreaterThan(0)`), e o mesmo
    mutante fica vermelho no `it()` em que acontece — medido, com o pino já
    fora: `⚠️ says WHERE today is in the plan, and the exemption actually
    SUBTRACTS it`.

    O desenho novo é estritamente mais forte: ele pega também o defeito
    INVERSO — uma frase de posição vazando num estado que não deveria
    mostrá-la —, que o pino de contagem não via. E não sobra número escrito à
    mão para envelhecer.
  */

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

  it('⚠️ keeps the keys the screen reads, and the ones it must NOT have back', () => {
    /*
      ⚠️ **O QUE ESTE TESTE ERA, e por que ele encolheu na Tarefa 38d.** Ele
      se chamava `has the new keys in pt AND in en, actually translated (rule
      15)` e o trabalho dele era pegar o único defeito que nem a paridade
      recursiva de chaves nem o compilador pegavam: um bloco COPIADO do `pt`
      para o `en`, que passa na paridade e embarca português no idioma inglês.
      Sem segundo catálogo esse defeito não existe — e a metade das asserções
      que sobrou não é a metade "fraca": são as três propriedades que sempre
      foram de `pt` sozinho.
    */

    /*
      ⚠️ **AS CHAVES QUE MORRERAM, E A LINHAGEM DELAS.** `tabs.highlightsSoon`
      ("os grifos chegam no MVP 2") morreu na Tarefa 25, quando deixou de ser
      verdade; `tabs.notes`/`tabs.highlights` e o bloco `notes` inteiro morreram
      na Tarefa 28, quando o acervo saiu desta tela (as chaves dele estão em
      `pages.acervo`, com par próprio em `acervo.test.tsx`).
    */
    expect(pt.pages.book).not.toHaveProperty('tabs');
    expect(pt.pages.book).not.toHaveProperty('notes');

    // ⚠️ E o `{{name}}` sobrevive: um rótulo que perdesse o interpolador
    // mostraria o nome de ninguém — o defeito que a Tarefa 27 consertou.
    for (const label of [
      pt.pages.book.plan.writerNamed,
      pt.pages.book.plan.readerNamed,
    ]) {
      expect(label).toContain('{{name}}');
    }

    /*
      ⚠️ **E OS DOIS ESTADOS DO BOTÃO NÃO DIZEM A MESMA COISA.** O rótulo É o
      estado (decisão D: sem `aria-pressed`), então dois rótulos iguais
      apagariam a informação inteira — e o teste de tela que procura o botão
      pelo nome passaria a achar o mesmo nos dois casos.
    */
    expect(pt.pages.book.read.mark).not.toBe(pt.pages.book.read.unmark);
  });
});
