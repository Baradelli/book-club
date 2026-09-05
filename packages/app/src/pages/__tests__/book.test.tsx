import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  BookResponse,
  NoteResponse,
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
import {
  expectNoPrivacyTalk,
  mentionsPrivacyTerm,
  PRIVACY_TERMS,
} from './adr-0002-dom';
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

/**
 * `GET /books/:bookId` com `writers` de VERDADE.
 *
 * O `bookWithPlanReply` do harness fixa `writers: []` — ele nasceu para o
 * atalho da home, que não olha a sobreposição de autoria. Aqui o `writers` É o
 * assunto de duas regras, então o fixture o recebe.
 */
function bookReply(
  book: BookResponse,
  planItems: readonly PlanItemResponse[],
  writers: ReadonlyArray<{
    planItemId: string;
    userIds: readonly string[];
  }> = [],
): Reply {
  return { status: 200, body: { book, planItems, writers } };
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

const WRITERS = [{ planItemId: WRITTEN_ID, userIds: [MARIA, MARCOS] }];

/**
 * ⚠️ **O ACERVO É ESCOLHIDO PARA O FILTRO ERRADO FALHAR** (§7.2), e são quatro
 * propriedades, cada uma matando um mutante:
 *
 * 1. **MINHAS são 3 e DE OUTRA PESSOA são 2** — quantidades DIFERENTES. Um
 *    filtro que não filtra devolve 5, um filtro invertido devolve 2 onde se
 *    espera 3, e nenhum dos dois passa;
 * 2. **as autorias estão INTERCALADAS** (eu, ela, eu, ela, eu), então um
 *    recorte por prefixo ou por sufixo da lista acusa;
 * 3. **títulos e ids em ordem alfabética DECRESCENTE**: uma tela que ordenasse
 *    por qualquer um dos dois acusa (a precondição está pinada logo abaixo);
 * 4. **a nota DO DIA está no meio, e é minha**, então "tipo" não coincide com
 *    "autoria" — um filtro que confundisse os dois passaria num acervo em que
 *    todas as minhas fossem avulsas.
 */
const NOTE_IDS = ['n-5', 'n-4', 'n-3', 'n-2', 'n-1'];
const NOTE_TITLES = [
  'Zangado com o dragao',
  'Uma ideia da pagina 112',
  'O capitulo de hoje',
  'Duas linhas sobre a porta',
  'A promessa do anao',
];
/** Os títulos das minhas (índices 0, 2 e 4) e os das dela (1 e 3). */
const MY_TITLES = [
  'Zangado com o dragao',
  'O capitulo de hoje',
  'A promessa do anao',
];
const HER_TITLES = ['Uma ideia da pagina 112', 'Duas linhas sobre a porta'];

/** Fixture é factory (§7.7) — e o `doc` é uma árvore MUTÁVEL por dentro. */
function aNote(overrides: Partial<NoteResponse> = {}): NoteResponse {
  return {
    id: 'n-1',
    clubId: CASAL.id,
    bookId: BOOK_ID,
    userId: MARCOS,
    kind: 'FREE',
    planItemId: null,
    title: 'A promessa do anao',
    reference: null,
    doc: { type: 'doc' },
    plainText: 'o trecho que aparece na lista',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: '2026-09-04T10:00:00.000Z',
    updatedAt: '2026-09-04T10:00:00.000Z',
    ...overrides,
  };
}

/** O acervo na ordem em que a API o devolve (mais recente primeiro). */
function notes(): NoteResponse[] {
  return [
    aNote({
      id: 'n-5',
      userId: MARCOS,
      title: 'Zangado com o dragao',
      plainText: 'ele ficou zangado quando a porta se fechou',
    }),
    aNote({
      id: 'n-4',
      userId: MARIA,
      title: 'Uma ideia da pagina 112',
      reference: 'p. 112',
      plainText: 'a ideia que veio no meio da noite',
    }),
    aNote({
      id: 'n-3',
      userId: MARCOS,
      kind: 'PLAN',
      planItemId: TODAY_ID,
      title: 'O capitulo de hoje',
      plainText: 'o carneiro assado que abre a leitura',
    }),
    aNote({
      id: 'n-2',
      userId: MARIA,
      title: 'Duas linhas sobre a porta',
      plainText: 'a porta redonda e verde no meio da colina',
    }),
    aNote({
      id: 'n-1',
      userId: MARCOS,
      title: 'A promessa do anao',
      plainText: 'a promessa vale o que custa cumpri-la',
    }),
  ];
}

interface BookSetup {
  /** As respostas de `GET /books/:bookId`, uma por chamada. */
  book?: readonly Reply[];
  /** O acervo — `GET /clubs/:clubId/notes?bookId=…` (Tarefa 19). */
  notes?: Reply | Responder;
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
    bookReply(aBook({ id: BOOK_ID }), plan(), WRITERS),
  ];
  let call = 0;

  return replyByUrl(
    [
      ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
      ['/me', meReply({ clubs: [CASAL] })],
      // ⚠️ ANTES do `/clubs/`: o acervo mora em `/clubs/:clubId/notes`, e o
      // fragmento da estante casaria a listagem de anotações primeiro.
      ['/notes', setup.notes ?? { status: 200, body: [] }],
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

function avatarsIn(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll('[role="img"]'));
}

function linkIn(row: HTMLElement): HTMLElement {
  const link = row.querySelector('a');
  if (link === null) throw new Error('a linha do plano não é um link');
  return link;
}

/** As linhas do ACERVO — a segunda lista da tela (Tarefa 19). */
function noteRows(): HTMLElement[] {
  const list = screen.getByRole('list', { name: pt.pages.book.notes.label });
  return Array.from(list.querySelectorAll('li'));
}

/** Os títulos do acervo NA ORDEM DA TELA — a observável do filtro e da ordem. */
function noteTitles(): Array<string | undefined> {
  return noteRows().map((row) =>
    NOTE_TITLES.find((title) => row.textContent?.includes(title)),
  );
}

function noteRowOf(title: string): HTMLElement {
  const row = noteRows().find((item) => item.textContent?.includes(title));
  if (row === undefined) throw new Error(`nenhuma anotação com "${title}"`);
  return row;
}

function chip(label: string): HTMLElement {
  return screen.getByRole('button', { name: label });
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

function bookSource(): string {
  // `process.cwd()` e não `import.meta.url`: no ambiente jsdom do vitest a
  // `import.meta.url` não é uma URL `file:`, e o `fileURLToPath` recusa.
  return readFileSync(
    resolve(process.cwd(), 'src', 'pages', 'book.tsx'),
    'utf8',
  );
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
      expect(avatar.getAttribute('aria-label')).toBe(pt.pages.book.plan.writer);
    }
    expectNoGuilt();
  });

  it('gives MY avatar my initial, and the other person the neutral glyph', async () => {
    /*
      ⚠️ **A METADE QUE A TAREFA 18 PAGOU.** O `writers` do
      `GET /books/:bookId` devolve só `userId`, e a Tarefa 17 registrou a
      lacuna: `name={null}` em TODO avatar, porque a inicial tirada de um UUID
      ("u-maria" → "U") tem cara de inicial e não é de ninguém — comunicar
      errado é pior que não comunicar.

      Com o `me` exposto pelo `club/active-club.tsx`, metade da lacuna fecha: o
      avatar de QUEM É VOCÊ ganha a inicial de verdade. A outra metade continua
      lacuna de BACKEND — nenhuma rota lista os membros do clube, então o nome
      da outra pessoa não existe em resposta nenhuma da API.

      O fixture é hostil (§7.2): as iniciais dos dois ids são DIFERENTES entre
      si e diferentes da minha (`u-maria` → "U", `u-marcos` → "U", `Marcos` →
      "M"). Uma tela que passasse o `userId` como nome poria "U" nos dois, e a
      asserção do glifo acusa; uma que passasse `null` nos dois perderia o "M".
    */
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const avatars = avatarsIn(rowOf('A porta redonda'));
    const texts = avatars.map((avatar) => avatar.textContent ?? '');
    // O meu tem a minha inicial (o `meReply()` do harness devolve "Marcos").
    expect(texts).toContain('M');
    // O da outra pessoa não tem letra nenhuma: é o glifo neutro (um `<svg>` do
    // lucide), e nunca a primeira letra do UUID dela.
    expect(texts).toContain('');
    expect(texts).not.toContain('U');
    expect(avatars.some((avatar) => avatar.querySelector('svg') !== null)).toBe(
      true,
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

describe('the tabs: notes now, highlights in MVP 2 (rule 12)', () => {
  it('has the notes tab active and the highlights tab disabled, with the reason legible', async () => {
    await renderBook();

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    const notes = screen.getByRole('button', {
      name: pt.pages.book.tabs.notes,
    });
    // `aria-pressed`, e não `aria-checked`: o chip é um botão de dois estados,
    // não um controle de formulário (regra 25 da Tarefa 13).
    expect(notes.getAttribute('aria-pressed')).toBe('true');

    // Sem `hidden: true`: um botão DESABILITADO continua na árvore de
    // acessibilidade (é `disabled`, não `aria-hidden`), e é isso que faz a aba
    // ser visível como plano do produto em vez de desaparecer.
    const highlights = screen.getByRole('button', {
      name: pt.pages.book.tabs.highlights,
    });
    /*
      DECISÃO F: a aba EXISTE e está desabilitada, com o motivo escrito. Uma aba
      que não existe esconde o plano do produto; uma que existe e não faz nada
      frustra. Os dois atributos juntos: o `disabled` tira do foco e do clique, o
      `aria-disabled` é o que alguns leitores de tela anunciam.
    */
    expect(highlights.hasAttribute('disabled')).toBe(true);
    expect(highlights.getAttribute('aria-disabled')).toBe('true');
    expect(highlights.getAttribute('aria-pressed')).toBeNull();
    // E o motivo é LEGÍVEL — não um `title` que só o mouse revela.
    expect(
      screen.queryByText(pt.pages.book.tabs.highlightsSoon),
    ).not.toBeNull();
    expectNoGuilt();
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

/*
  ⚠️ **O ACERVO — AS REGRAS 1 A 8 DA TAREFA 19.**

  A aba "Anotações" deixa de ser um rótulo: ela mostra o que o clube escreveu
  sobre este livro, filtrável por autoria. O filtro é NAVEGAÇÃO — dentro do
  clube não existe conteúdo privado (ADR 0002) —, e é por isso que cada estado
  novo passa também pelo `expectNoPrivacyTalk`.
*/
describe('the fixture of the collection is hostile to the wrong filters (§7.2)', () => {
  it('has different counts per author, interleaved, and out of alphabetical order', () => {
    const collection = notes();

    expect(collection.map((note) => note.id)).toEqual(NOTE_IDS);
    expect(collection.map((note) => note.title)).toEqual(NOTE_TITLES);

    // ⚠️ QUANTIDADES DIFERENTES: com 3 e 2, "não filtra" (5) e "filtra ao
    // contrário" (2 onde se espera 3) ficam vermelhos. Com 2 e 2, o segundo
    // passaria.
    expect(collection.filter((note) => note.userId === MARCOS)).toHaveLength(3);
    expect(collection.filter((note) => note.userId === MARIA)).toHaveLength(2);

    // INTERCALADAS: um recorte por prefixo ou por sufixo da lista acusa.
    expect(collection.map((note) => note.userId === MARCOS)).toEqual([
      true,
      false,
      true,
      false,
      true,
    ]);

    // Ordenar por título ou por id daria OUTRA ordem que não a da API.
    expect([...NOTE_TITLES].sort()).not.toEqual(NOTE_TITLES);
    expect([...NOTE_IDS].sort()).not.toEqual(NOTE_IDS);

    // E a nota DO DIA é MINHA: assim "tipo" não coincide com "autoria", e um
    // filtro que confundisse os dois não passa por acidente.
    const ofTheDay = collection.find((note) => note.kind === 'PLAN');
    expect(ofTheDay?.userId).toBe(MARCOS);
    expect(ofTheDay?.planItemId).toBe(TODAY_ID);
    expect(MY_TITLES).toContain(ofTheDay?.title);
  });
});

describe('the collection of the book, in the Notes tab (rules 1, 2, 3)', () => {
  it('lists the notes OF THE BOOK, in the order the API returned (rule 1)', async () => {
    const calls = await renderBook({ notes: { status: 200, body: notes() } });

    await waitFor(() => {
      expect(noteRows()).toHaveLength(5);
    });
    // A tela NÃO reordena: o `listNotes` já devolve mais recente primeiro, e
    // duas ordens seriam duas verdades.
    expect(noteTitles()).toEqual(NOTE_TITLES);

    // UMA requisição, ao clube DO LIVRO (`book.clubId`, não o clube ativo do
    // cabeçalho) e filtrada pelo livro desta tela.
    expect(requestsTo(calls, '/notes').map((call) => call.url)).toEqual([
      `https://api.teste/clubs/${CASAL.id}/notes?bookId=${BOOK_ID}`,
    ]);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('shows the title, the authorship and an excerpt of the plainText (rule 2)', async () => {
    await renderBook({ notes: { status: 200, body: notes() } });

    await waitFor(() => {
      expect(noteRows()).toHaveLength(5);
    });

    /*
      ⚠️ AS DUAS AUTORIAS, e é o par que morde: uma tela que trocasse os dois
      lados da comparação com o `me.id` continuaria mostrando as duas frases —
      só que nas linhas erradas.
    */
    const mine = noteRowOf('A promessa do anao');
    expect(mine.textContent).toContain(pt.pages.book.notes.author.you);
    expect(mine.textContent).not.toContain(pt.pages.book.notes.author.other);
    expect(mine.textContent).toContain('a promessa vale o que custa');

    const hers = noteRowOf('Uma ideia da pagina 112');
    expect(hers.textContent).toContain(pt.pages.book.notes.author.other);
    expect(hers.textContent).toContain('a ideia que veio no meio da noite');

    // DECISÃO F: o trecho vem do `plainText`, então o `doc` não é renderizado
    // na lista — nem o JSON dele vaza para a tela.
    expect(readableText()).not.toContain('"type":"doc"');
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('says which note is of the DAY and which is standalone (rule 3)', async () => {
    await renderBook({ notes: { status: 200, body: notes() } });

    await waitFor(() => {
      expect(noteRows()).toHaveLength(5);
    });
    // Os dois tipos convivem na mesma lista (decisão C), identificados.
    expect(noteRowOf('O capitulo de hoje').textContent).toContain(
      pt.pages.book.notes.kind.plan,
    );
    expect(noteRowOf('A promessa do anao').textContent).toContain(
      pt.pages.book.notes.kind.free,
    );
    expect(noteRowOf('A promessa do anao').textContent).not.toContain(
      pt.pages.book.notes.kind.plan,
    );
    expectNoGuilt();
  });
});

describe('⚠️ THE FILTER CHANGES THE LIST, AND IT IS DONE ON THE CLIENT (rules 4, 5)', () => {
  it('cuts the collection by authorship without asking the server again', async () => {
    const calls = await renderBook({ notes: { status: 200, body: notes() } });

    await waitFor(() => {
      expect(noteRows()).toHaveLength(5);
    });
    expect(requestsTo(calls, '/notes')).toHaveLength(1);

    // `aria-pressed`, e não `aria-checked`: o chip é um botão de dois estados
    // (regra 25 da Tarefa 13).
    expect(
      chip(pt.pages.book.notes.filters.all).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      chip(pt.pages.book.notes.filters.mine).getAttribute('aria-pressed'),
    ).toBe('false');

    await press(chip(pt.pages.book.notes.filters.mine));
    // ⚠️ TRÊS, e são as MINHAS — na ordem da API. Um filtro que devolvesse a
    // lista inteira daria cinco; um invertido daria duas.
    expect(noteTitles()).toEqual(MY_TITLES);
    expect(
      chip(pt.pages.book.notes.filters.mine).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      chip(pt.pages.book.notes.filters.all).getAttribute('aria-pressed'),
    ).toBe('false');
    expectNoGuilt();
    expectNoPrivacyTalk();

    await press(chip(pt.pages.book.notes.filters.others));
    expect(noteTitles()).toEqual(HER_TITLES);
    expectNoGuilt();
    expectNoPrivacyTalk();

    await press(chip(pt.pages.book.notes.filters.all));
    expect(noteTitles()).toEqual(NOTE_TITLES);

    /*
      ⚠️ **REGRA 5: NENHUMA REQUISIÇÃO NOVA.** O `listNotes` aceita `authorId`,
      e usá-lo faria cada toque num chip virar uma ida ao servidor — "minhas"
      não é um pedido novo, é um recorte do mesmo acervo. Sem esta asserção, a
      implementação que refaz a busca passaria em todas as de cima.
    */
    expect(requestsTo(calls, '/notes')).toHaveLength(1);
  });
});

describe('⚠️ NOTHING ON THIS SCREEN SUGGESTS PRIVACY (rule 6, ADR 0002)', () => {
  it('keeps the vocabulary of restricted visibility out of every cut of the collection', async () => {
    /*
      O ADR 0002 em uma frase: dentro do clube não existe conteúdo privado, e o
      filtro é NAVEGAÇÃO. Um cadeado — ou um "só você vê" — ensinaria uma regra
      que o sistema não tem, e quem acreditasse nele escreveria pensando que
      ninguém vai ler.
    */
    await renderBook({ notes: { status: 200, body: notes() } });

    await waitFor(() => {
      expect(noteRows()).toHaveLength(5);
    });
    expectNoPrivacyTalk();

    for (const label of [
      pt.pages.book.notes.filters.mine,
      pt.pages.book.notes.filters.others,
      pt.pages.book.notes.filters.all,
    ]) {
      await press(chip(label));
      expectNoPrivacyTalk();
    }
  });

  it('would catch the words the ADR forbids, in both languages', () => {
    /*
      ⚠️ O LADO POSITIVO DO PAR (§7.3): uma lista esvaziada — ou um matcher
      invertido — deixaria o teste acima verde para sempre.
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

describe('an empty collection charges nobody (rule 7)', () => {
  it('says the book has no notes yet, and offers no filter for nothing', async () => {
    await renderBook({ notes: { status: 200, body: [] } });

    await waitFor(() => {
      expect(
        screen.queryByText(pt.pages.book.notes.empty.title),
      ).not.toBeNull();
    });
    expect(
      screen.queryByText(pt.pages.book.notes.empty.description),
    ).not.toBeNull();
    expect(
      screen.queryByRole('list', { name: pt.pages.book.notes.label }),
    ).toBeNull();
    // Filtrar o vazio é oferecer uma escolha que não muda nada.
    expect(
      screen.queryByRole('button', { name: pt.pages.book.notes.filters.mine }),
    ).toBeNull();
    // E o livro continua na tela: acervo vazio não é erro de livro.
    expect(planRows()).toHaveLength(3);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('says the FILTER came back empty, not that the book did', async () => {
    /*
      A frase "escreva a primeira" seria mentira embaixo de um recorte que só
      escondeu o que já existe — e é o tipo de frase que vira cobrança sem
      querer.
    */
    await renderBook({
      notes: { status: 200, body: [aNote({ id: 'n-1', userId: MARCOS })] },
    });

    await waitFor(() => {
      expect(noteRows()).toHaveLength(1);
    });

    await press(chip(pt.pages.book.notes.filters.others));
    expect(
      screen.queryByText(pt.pages.book.notes.empty.filtered),
    ).not.toBeNull();
    expect(screen.queryByText(pt.pages.book.notes.empty.title)).toBeNull();
    expectNoGuilt();
    expectNoPrivacyTalk();
  });

  it('has its own words when the collection fails to load, and the retry REDOES it', async () => {
    let attempts = 0;
    const calls = await renderBook({
      notes: () => {
        attempts += 1;
        return attempts === 1
          ? { status: 0, offline: true }
          : { status: 200, body: notes() };
      },
    });

    await waitFor(() => {
      expect(
        screen.queryByText(pt.pages.book.notes.unavailable),
      ).not.toBeNull();
    });
    // O plano continua de pé: falhar no acervo não apaga o livro.
    expect(planRows()).toHaveLength(3);
    expectNoGuilt();

    await press(screen.getByRole('button', { name: pt.pages.book.retry }));

    await waitFor(() => {
      expect(noteRows()).toHaveLength(5);
    });
    expect(requestsTo(calls, '/notes')).toHaveLength(2);
    expectNoGuilt();
    expectNoPrivacyTalk();
  });
});

describe('tapping a note goes to the screen that can open it (rule 8)', () => {
  it('sends the day note to the day, and every standalone note to the standalone screen', async () => {
    await renderBook({ notes: { status: 200, body: notes() } });

    await waitFor(() => {
      expect(noteRows()).toHaveLength(5);
    });

    // A MINHA avulsa: a tela de correção.
    expect(linkIn(noteRowOf('A promessa do anao')).getAttribute('href')).toBe(
      `/books/${BOOK_ID}/notes/n-1`,
    );
    /*
      ⚠️ A DO DIA VAI PARA A TELA DO DIA, mesmo sendo minha — e é regra de
      backend, não gosto: o `editNote` RECUSA nota do dia (Tarefa 09), que só se
      escreve pelo `upsertPlanNote`. Uma tela que a mandasse para a edição
      avulsa daria 400 em todo salvamento.
    */
    expect(linkIn(noteRowOf('O capitulo de hoje')).getAttribute('href')).toBe(
      `/books/${BOOK_ID}/days/${TODAY_ID}`,
    );
    // A de OUTRA PESSOA abre a MESMA tela da avulsa, que decide leitura ×
    // correção pela autoria (regra 17) — não um endereço diferente.
    expect(
      linkIn(noteRowOf('Duas linhas sobre a porta')).getAttribute('href'),
    ).toBe(`/books/${BOOK_ID}/notes/n-2`);
    expectNoPrivacyTalk();
  });

  it('opens the NEW standalone note from an explicit button', async () => {
    /*
      REGRA 16 do lado da escrita: criar é um BOTÃO. E ele existe mesmo com o
      acervo vazio — escrever não depende de conseguir ler a lista.
    */
    const calls = await renderBook({ notes: { status: 200, body: [] } });

    await waitFor(() => {
      expect(planRows()).toHaveLength(3);
    });

    await press(screen.getByRole('button', { name: pt.pages.book.notes.new }));

    expect(locationText()).toBe(`/books/${BOOK_ID}/notes/new`);
    // Abrir a tela de criação NÃO cria linha no banco (regra 16): nenhuma
    // requisição foi para `POST /books/:bookId/notes`.
    expect(requestsTo(calls, `/books/${BOOK_ID}/notes`)).toEqual([]);
  });
});

describe('the source of the book screen (rules 5, 15, 16)', () => {
  it('keeps the danger colour out of the SOURCE FILE, not only out of the states rendered here', () => {
    /*
      A rede contra a cor voltar por um estado que ninguém pensou em renderizar.
      Vale porque a tela é um arquivo só. O que ele NÃO é: a guarda da cor nos
      estados — essa é a `expectNoGuilt`, que roda em todos eles.
    */
    const source = stripComments(bookSource());

    expect(source).not.toMatch(DANGER_STYLE);
    // O lado positivo do par: o arquivo lido é o certo (um caminho errado
    // lançaria, mas um arquivo VAZIO passaria calado — §7.4 escrito como
    // varredura de fonte).
    expect(source).toContain('pages.book.plan.today');
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
    expect(en.pages.book.tabs.highlightsSoon).not.toBe(
      pt.pages.book.tabs.highlightsSoon,
    );

    // As chaves da Tarefa 19, no mesmo par: existir nas duas e estar
    // TRADUZIDA nas duas.
    expect(Object.keys(en.pages.book.notes)).toEqual(
      Object.keys(pt.pages.book.notes),
    );
    expect(en.pages.book.notes.filters.others).not.toBe(
      pt.pages.book.notes.filters.others,
    );
    expect(en.pages.book.notes.empty.description).not.toBe(
      pt.pages.book.notes.empty.description,
    );
    expect(en.pages.book.notes.kind.plan).not.toBe(
      pt.pages.book.notes.kind.plan,
    );
  });
});
