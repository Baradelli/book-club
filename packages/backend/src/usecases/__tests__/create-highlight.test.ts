import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BookNotFoundError,
  ForbiddenRoleError,
  InvalidHighlightError,
  InvalidNoteError,
  NotAMemberError,
} from '../../domain/errors';
import type { NoteDoc } from '../../domain/note';
import { installAdvancingClock } from '../../test-support/advancing-clock';
import {
  aBook,
  aDoc,
  aMembership,
  required,
} from '../../test-support/builders';
import { ActivityEventRepositoryFake } from '../_fakes/activity-event-repository-fake';
import { BookRepositoryFake } from '../_fakes/book-repository-fake';
import { HighlightRepositoryFake } from '../_fakes/highlight-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { CreateHighlightInput } from '../create-highlight';
import { CreateHighlight } from '../create-highlight';
import { RecordActivity } from '../record-activity';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const BOOK_ID = 'book-1';
const OTHER_CLUB_BOOK_ID = 'book-do-outro-clube';
const ARCHIVED_BOOK_ID = 'book-arquivado';

const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-maria';
const OTHER_CLUB_MEMBER_ID = 'user-de-outro-clube';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const YELLOW = '#facc15';
const GREEN = '#22c55e';

describe('CreateHighlight', () => {
  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let highlights: HighlightRepositoryFake;
  let events: ActivityEventRepositoryFake;
  let recordActivity: RecordActivity;
  let useCase: CreateHighlight;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    highlights = new HighlightRepositoryFake();
    events = new ActivityEventRepositoryFake();
    // O `recordActivity` é um UseCase REAL sobre o fake do repositório, e não
    // um dublê: é o precedente do `AssertMembership` (decisão D), e é o que
    // faz `events.saveCalls` ser a contagem do gatilho de verdade.
    recordActivity = new RecordActivity(events);
    useCase = new CreateHighlight(
      new AssertMembership(memberships),
      books,
      highlights,
      recordActivity,
    );

    await books.save(aBook({ id: BOOK_ID, clubId: CLUB_ID }));
    await books.save(aBook({ id: OTHER_CLUB_BOOK_ID, clubId: OTHER_CLUB_ID }));
    await books.save(
      aBook({
        id: ARCHIVED_BOOK_ID,
        clubId: CLUB_ID,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    );

    for (const [userId, role] of [
      [OWNER_ID, 'OWNER'],
      [ADMIN_ID, 'ADMIN'],
      [MEMBER_ID, 'MEMBER'],
    ] as const) {
      await memberships.save(aMembership({ userId, clubId: CLUB_ID, role }));
    }
    await memberships.save(
      aMembership({
        userId: OTHER_CLUB_MEMBER_ID,
        clubId: OTHER_CLUB_ID,
        role: 'MEMBER',
      }),
    );
  });

  // O stub de relógio de `reads the clock once...` é GLOBAL: sem isto ele vazaria
  // para os testes seguintes do arquivo, que leem o relógio de verdade.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Fábrica, nunca `const` de `describe` (CONVENCOES-CODIGO §7.7). */
  function validInput(
    overrides: Partial<CreateHighlightInput> = {},
  ): CreateHighlightInput {
    return {
      actorUserId: MEMBER_ID,
      bookId: BOOK_ID,
      quote: 'não é o que você tem, é o que você faz com o que tem',
      color: YELLOW,
      ...overrides,
    };
  }

  describe('permission and tenant', () => {
    // Regra 8
    it('rejects a book that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ bookId: 'book-fantasma' })),
      ).rejects.toBeInstanceOf(BookNotFoundError);

      expect(highlights.saveCalls).toBe(0);
    });

    // Regra 8 — arquivado é invisível até o MVP 4, também para grifar.
    it('rejects an archived book', async () => {
      await expect(
        useCase.execute(validInput({ bookId: ARCHIVED_BOOK_ID })),
      ).rejects.toBeInstanceOf(BookNotFoundError);

      expect(highlights.saveCalls).toBe(0);
    });

    // Regra 8
    it('rejects an actor with no membership at all', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: 'user-forasteiro' })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(highlights.saveCalls).toBe(0);
    });

    // Regra 8 — membership arquivado não é membership.
    it('rejects an actor whose membership is archived', async () => {
      await memberships.save(
        aMembership({
          userId: MEMBER_ID,
          clubId: CLUB_ID,
          role: 'MEMBER',
          status: 'ARCHIVED',
        }),
      );

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        NotAMemberError,
      );

      expect(highlights.saveCalls).toBe(0);
    });

    // Regra 8 — 404, não 403. O membro do outro clube é membro de verdade.
    it('rejects a member of another club with 404, not 403', async () => {
      const error: unknown = await useCase
        .execute(validInput({ actorUserId: OTHER_CLUB_MEMBER_ID }))
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotAMemberError);
      expect(error).not.toBeInstanceOf(ForbiddenRoleError);
    });

    // Regra 8 — e o caminho inverso: o membro do clube 1 não grifa no livro do
    // clube 2 nem sabendo o id do livro.
    it('rejects highlighting a book of another club', async () => {
      await expect(
        useCase.execute(validInput({ bookId: OTHER_CLUB_BOOK_ID })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(highlights.saveCalls).toBe(0);
    });

    /**
     * ⚠️ Regra 9 — **A ORDEM: o corte de tenant vem ANTES da validação do
     * corpo**, e nada é lido nem escrito quando ele recusa.
     *
     * Os dois eixos se cruzam só aqui: todo outro teste de corpo inválido usa
     * membro válido, e todo outro teste de ator de fora usa corpo válido. Um
     * teste de cada eixo isolado deixa a ordem sem prova nenhuma.
     *
     * Por que a ordem importa: um `InvalidHighlightError` (400, e a classe 400 é
     * a única cuja `message` sai publicada — §6.2) confirmaria a quem não é do
     * clube que o `bookId` existe. O 404 do tenant não confirma nada.
     */
    it('cuts the tenant before it validates the body', async () => {
      const error: unknown = await useCase
        .execute(
          validInput({
            actorUserId: OTHER_CLUB_MEMBER_ID,
            quote: '   ',
            color: 'não é uma cor',
            page: 0,
            commentDoc: 'não é um doc',
          }),
        )
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotAMemberError);
      expect(error).not.toBeInstanceOf(InvalidHighlightError);
      expect(error).not.toBeInstanceOf(InvalidNoteError);
      expect(highlights.saveCalls).toBe(0);
    });

    /**
     * ⚠️ Regra 9 — **o lado POSITIVO do contador**, sem o qual todo
     * `saveCalls === 0` acima passa por acidente se alguém apagar o incremento
     * do fake (§7.3: um contador só afirmado como `toBe(0)` é meio contador, e
     * aí ele é a asserção vazia do §7.4).
     */
    it('writes exactly once on the happy path', async () => {
      await useCase.execute(validInput());

      expect(highlights.saveCalls).toBe(1);
      expect(highlights.saved).toHaveLength(1);
    });

    // Regra 8 — grifar não exige papel: `MEMBER` grifa.
    it.each([
      ['MEMBER', MEMBER_ID],
      ['ADMIN', ADMIN_ID],
      ['OWNER', OWNER_ID],
    ])('lets the %s create a highlight', async (_label, actorUserId) => {
      const { highlight } = await useCase.execute(validInput({ actorUserId }));

      expect(highlight.userId).toBe(actorUserId);
    });

    /**
     * Regra 7 — contrabando, com o ator LEGÍTIMO e assertado na LINHA GRAVADA
     * (§7.5). Um teste com ator de fora morreria no guard e nunca chegaria ao
     * campo que é escrito.
     */
    it('ignores a userId smuggled into the input', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        bookId: BOOK_ID,
        quote: 'a coragem de continuar',
        color: YELLOW,
        // @ts-expect-error o input não declara userId — o autor é o ator
        userId: OWNER_ID,
      } satisfies CreateHighlightInput;

      const { highlight } = await useCase.execute(smuggled);

      expect(highlight.userId).toBe(MEMBER_ID);
      expect(required(highlights.saved[0]).userId).toBe(MEMBER_ID);
    });

    /**
     * Regra 7 — o `clubId` GRAVADO ignora o input, e é isto que prova, porque o
     * ator é um MEMBRO LEGÍTIMO: a chamada atravessa o corte de tenant e chega
     * ao campo que vai para a linha. Um `clubId` vindo do corpo faria o grifo
     * aparecer na listagem de OUTRO clube (envenenamento cross-tenant).
     */
    it('ignores a clubId smuggled into the input and stores the club of the book', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        bookId: BOOK_ID,
        quote: 'a coragem de continuar',
        color: YELLOW,
        // @ts-expect-error o input não declara clubId — ele vem de book.clubId
        clubId: OTHER_CLUB_ID,
      } satisfies CreateHighlightInput;

      const { highlight } = await useCase.execute(smuggled);

      expect(highlight.clubId).toBe(CLUB_ID);
      expect(required(highlights.saved[0]).clubId).toBe(CLUB_ID);
    });

    // A OUTRA coisa que o `clubId` contrabandeado não compra: o corte de tenant.
    it('does not let a smuggled clubId buy a way past the tenant cut', async () => {
      const smuggled = {
        actorUserId: OTHER_CLUB_MEMBER_ID,
        bookId: BOOK_ID,
        quote: 'a coragem de continuar',
        color: YELLOW,
        // @ts-expect-error o input não declara clubId — ele vem de book.clubId
        clubId: OTHER_CLUB_ID,
      } satisfies CreateHighlightInput;

      await expect(useCase.execute(smuggled)).rejects.toBeInstanceOf(
        NotAMemberError,
      );
      expect(highlights.saveCalls).toBe(0);
    });

    // Regra 6 — `commentText` é DERIVADO, nunca entra na API (ADR 0001).
    it('ignores a commentText smuggled into the input', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        bookId: BOOK_ID,
        quote: 'a coragem de continuar',
        color: YELLOW,
        commentDoc: aDoc('o comentário de verdade'),
        // @ts-expect-error commentText é DERIVADO, nunca entra na API
        commentText: 'texto adulterado pelo cliente',
      } satisfies CreateHighlightInput;

      const { highlight } = await useCase.execute(smuggled);

      expect(highlight.commentText).toBe('o comentário de verdade');
      expect(required(highlights.saved[0]).commentText).toBe(
        'o comentário de verdade',
      );
    });

    /**
     * ⚠️ O mesmo contrabando **SEM `commentDoc`** — e é este que morde. Com o
     * doc presente, o `commentText` derivado cobre o envenenado e o mutante
     * sobrevive; sem doc não há nada para cobri-lo, e o texto do cliente chega à
     * linha de um grifo que nem tem comentário.
     */
    it('never lets a smuggled commentText reach a highlight with no comment', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        bookId: BOOK_ID,
        quote: 'a coragem de continuar',
        color: YELLOW,
        // @ts-expect-error commentText é DERIVADO, nunca entra na API
        commentText: 'texto adulterado pelo cliente',
      } satisfies CreateHighlightInput;

      const { highlight } = await useCase.execute(smuggled);

      expect(highlight.commentDoc).toBeNull();
      expect(highlight.commentText).toBe('');
      expect(required(highlights.saved[0]).commentText).toBe('');
    });

    // Arquivar é o `archiveHighlight`, e ele confere autoria por si. Um `status`
    // no corpo do create nasceria já arquivado — invisível para o clube todo.
    it('never lets a smuggled status or archivedAt make it born archived', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        bookId: BOOK_ID,
        quote: 'a coragem de continuar',
        color: YELLOW,
        // @ts-expect-error o input não declara status — arquivar é outro UseCase
        status: 'ARCHIVED',
        archivedAt: new Date('2026-05-05T00:00:00.000Z'),
      } satisfies CreateHighlightInput;

      const { highlight } = await useCase.execute(smuggled);

      expect(highlight.status).toBe('ACTIVE');
      expect(highlight.archivedAt).toBeNull();
      expect(required(highlights.saved[0]).status).toBe('ACTIVE');
      expect(required(highlights.saved[0]).archivedAt).toBeNull();
    });

    // O `id` é gerado com `randomUUID()` no UseCase: um id do corpo deixaria o
    // cliente sobrescrever o grifo de outra pessoa pelo upsert do `save`.
    it('never lets a smuggled id or createdAt reach the stored row', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        bookId: BOOK_ID,
        quote: 'a coragem de continuar',
        color: YELLOW,
        // @ts-expect-error nenhum dos dois existe no input
        id: 'highlight-escolhido-pelo-cliente',
        createdAt: new Date('1999-01-01T00:00:00.000Z'),
      } satisfies CreateHighlightInput;

      const { highlight } = await useCase.execute(smuggled);

      expect(highlight.id).not.toBe('highlight-escolhido-pelo-cliente');
      expect(highlight.id).toMatch(UUID);
      expect(highlight.createdAt.getFullYear()).toBeGreaterThan(2000);
    });
  });

  describe('creating', () => {
    // Regra 12
    it('creates it with the fields the domain decides', async () => {
      const { highlight } = await useCase.execute(validInput());

      expect(highlight.bookId).toBe(BOOK_ID);
      expect(highlight.clubId).toBe(CLUB_ID);
      expect(highlight.userId).toBe(MEMBER_ID);
      expect(highlight.quote).toBe(
        'não é o que você tem, é o que você faz com o que tem',
      );
      expect(highlight.color).toBe(YELLOW);
      expect(highlight.status).toBe('ACTIVE');
      expect(highlight.archivedAt).toBeNull();
      expect(highlight.id).toMatch(UUID);
      expect(highlights.saved).toHaveLength(1);
    });

    /**
     * Regra 12 — o grifo nasce estampado com **agora**: `createdAt` cai na
     * janela do `execute`, e `updatedAt` é igual a ele.
     *
     * ⚠️ O que este teste **não** prova, e a auditoria mediu: a igualdade
     * sozinha NÃO prova "um `new Date()` só". Duas chamadas no mesmo tick
     * devolvem o MESMO milissegundo, então o mutante com um `new Date()` por
     * campo passa aqui — foram 1206/1206 verdes em três rodadas, zero
     * acusadores. Quem escolheu o valor esperado foi o relógio, não o código
     * (§7.8). A leitura ÚNICA é assunto do
     * `reads the clock once and stamps both createdAt and updatedAt with it`,
     * logo abaixo, que é onde ela é decidível.
     */
    it('stamps createdAt and updatedAt with now', async () => {
      const before = Date.now();

      const { highlight } = await useCase.execute(validInput());

      const after = Date.now();
      expect(highlight.createdAt.getTime()).toBe(highlight.updatedAt.getTime());
      expect(highlight.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(highlight.createdAt.getTime()).toBeLessThanOrEqual(after);
      expect(required(highlights.saved[0]).createdAt.getTime()).toBe(
        required(highlights.saved[0]).updatedAt.getTime(),
      );
    });

    /**
     * ⚠️ Regra 12 — **UMA leitura só do relógio**, e é o stub que torna a
     * propriedade decidível.
     *
     * O `installAdvancingClock` faz cada `new Date()` sem argumento devolver um
     * instante um segundo à frente do anterior, então o mutante "um `new Date()`
     * por campo" muda DUAS coisas: `reads` vira 2 e `updatedAt` sai um segundo
     * depois de `createdAt`. Sem o stub, nenhuma das duas é observável — a
     * medição da auditoria foi 0 acusadores. O `at(1)` é calculado do
     * `CLOCK_BASE_ISO`, não do código sob teste, e a precondição "o relógio
     * ANDA" tem suíte própria (`advancing-clock.test.ts`).
     *
     * ⚠️ **`reads` passou de 1 para 2 na Tarefa 33, e as DUAS leituras têm
     * dono declarado**: a `at(1)` é a do grifo, a `at(2)` é a do
     * `ActivityEvent`. O mutante "um `new Date()` por campo" continua acusado
     * (ele levaria `reads` a 3 e separaria `createdAt` de `updatedAt`), e o
     * teste ganhou de brinde uma prova da **ordem** que a decisão I exige: o
     * evento é o instante mais NOVO, logo ele nasceu depois do grifo. Um
     * gatilho movido para antes da escrita inverteria os dois.
     */
    it('reads the clock once for the highlight and once for the event, in that order', async () => {
      const clock = installAdvancingClock();

      const { highlight } = await useCase.execute(validInput());

      expect(clock.reads).toBe(2);
      expect(highlight.createdAt.getTime()).toBe(clock.at(1));
      expect(highlight.updatedAt.getTime()).toBe(clock.at(1));
      expect(required(highlights.saved[0]).createdAt.getTime()).toBe(
        clock.at(1),
      );
      expect(required(highlights.saved[0]).updatedAt.getTime()).toBe(
        clock.at(1),
      );
      expect(required(events.saved[0]).createdAt.getTime()).toBe(clock.at(2));
    });

    // Regra 2 — o trecho gravado vem sem as pontas.
    it('trims the quote', async () => {
      const { highlight } = await useCase.execute(
        validInput({ quote: '   a coragem de continuar   ' }),
      );

      expect(highlight.quote).toBe('a coragem de continuar');
      expect(required(highlights.saved[0]).quote).toBe(
        'a coragem de continuar',
      );
    });

    // Regra 10 — entrada inválida não deixa NADA gravado: a validação inteira
    // roda antes da escrita.
    it.each([
      ['an empty quote', ''],
      ['a quote of spaces', '    '],
      ['a quote of a tab', '\t'],
      ['a quote of a newline', '\n'],
    ])('refuses %s and writes nothing', async (_label, quote) => {
      await expect(
        useCase.execute(validInput({ quote })),
      ).rejects.toBeInstanceOf(InvalidHighlightError);

      expect(highlights.saved).toEqual([]);
      expect(highlights.saveCalls).toBe(0);
    });

    // Regra 3 + 10
    it.each<[string, unknown]>([
      ['a colour outside the palette', '#ff0000'],
      ['the same yellow in uppercase', '#FACC15'],
      ['the rgba form of the editor', 'rgba(250, 204, 21, 0.40)'],
      ['a semantic name', 'YELLOW'],
      ['an empty string', ''],
      ['null', null],
      ['undefined', undefined],
      ['a number', 42],
    ])('refuses %s as a colour and writes nothing', async (_label, color) => {
      await expect(
        useCase.execute(validInput({ color })),
      ).rejects.toBeInstanceOf(InvalidHighlightError);

      expect(highlights.saved).toEqual([]);
      expect(highlights.saveCalls).toBe(0);
    });

    // Regra 3 — e as cinco cores passam, senão um `assertHighlightColor` que
    // recusasse tudo passaria em todos os testes de recusa acima.
    it.each(['#facc15', '#22c55e', '#f97316', '#3b82f6', '#ec4899'])(
      'stores the palette colour %s',
      async (color) => {
        const { highlight } = await useCase.execute(validInput({ color }));

        expect(highlight.color).toBe(color);
        expect(required(highlights.saved[0]).color).toBe(color);
      },
    );

    // Regra 4 — página ausente grava `null`.
    it.each<[string, Partial<CreateHighlightInput>]>([
      ['absent', {}],
      ['explicitly null', { page: null }],
    ])('stores a null page when it is %s', async (_label, overrides) => {
      const { highlight } = await useCase.execute(validInput(overrides));

      expect(highlight.page).toBeNull();
      expect(required(highlights.saved[0]).page).toBeNull();
    });

    // Regra 4
    it.each([1, 45, 1200])('stores the page %s', async (page) => {
      const { highlight } = await useCase.execute(validInput({ page }));

      expect(highlight.page).toBe(page);
      expect(required(highlights.saved[0]).page).toBe(page);
    });

    // Regra 4 + 10
    it.each<[string, unknown]>([
      ['zero', 0],
      ['a negative page', -1],
      ['a fractional page', 45.5],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['a page as a string', '45'],
    ])('refuses the page %s and writes nothing', async (_label, page) => {
      await expect(
        useCase.execute(validInput({ page })),
      ).rejects.toBeInstanceOf(InvalidHighlightError);

      expect(highlights.saved).toEqual([]);
      expect(highlights.saveCalls).toBe(0);
    });

    /**
     * Regra 5 — o MESMO `optionalText` do livro, do item do plano e da nota:
     * `''`/espaços viram `null`, o resto vem sem as pontas. Uma cópia da regra é
     * como um dos cinco passa a gravar `''`.
     */
    it.each<[string, string | undefined, string | null]>([
      ['undefined', undefined, null],
      ['an empty string', '', null],
      ['only spaces', '   ', null],
      ['a reference with spaces around', '  cap. 3  ', 'cap. 3'],
      ['a clean reference', 'cap. 3', 'cap. 3'],
      ['a subject instead of a chapter', 'sobre a coragem', 'sobre a coragem'],
    ])(
      'normalizes %s into the stored reference',
      async (_label, reference, expected) => {
        const { highlight } = await useCase.execute(
          validInput(reference === undefined ? {} : { reference }),
        );

        expect(highlight.reference).toBe(expected);
        expect(required(highlights.saved[0]).reference).toBe(expected);
      },
    );

    /**
     * ⚠️ Regra 6 — `commentDoc` ausente ou `null` grava `null` **e**
     * `commentText: ''`. É o que faz o grifo sem comentário existir (decisão C):
     * exigir comentário obrigaria a gravar um documento vazio só para ter onde
     * marcar.
     */
    it.each<[string, Partial<CreateHighlightInput>]>([
      ['absent', {}],
      ['explicitly null', { commentDoc: null }],
    ])(
      'stores no comment and an empty commentText when the doc is %s',
      async (_label, overrides) => {
        const { highlight } = await useCase.execute(validInput(overrides));

        expect(highlight.commentDoc).toBeNull();
        expect(highlight.commentText).toBe('');
        expect(required(highlights.saved[0]).commentDoc).toBeNull();
        expect(required(highlights.saved[0]).commentText).toBe('');
      },
    );

    // Regra 6 — e presente é validado e derivado.
    it('derives the commentText from the commentDoc', async () => {
      const commentDoc: NoteDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'me lembrou do anel' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'e do que ele custou' }],
          },
        ],
      };

      const { highlight } = await useCase.execute(validInput({ commentDoc }));

      // O esperado é LITERAL, escrito à mão. Um
      // `toBe(docToText(commentDoc))` ao lado seria identidade — os dois lados
      // saem da mesma função (§7.8) — e é o literal que acusa.
      expect(highlight.commentText).toBe(
        'me lembrou do anel\ne do que ele custou',
      );
      expect(required(highlights.saved[0]).commentText).toBe(
        'me lembrou do anel\ne do que ele custou',
      );
    });

    /**
     * Regra 6 — o doc é gravado COMO VEIO. A asserção é contra um SNAPSHOT
     * tirado antes do `execute`: `highlight.commentDoc` **é** o objeto que
     * entrou, e o do fake é o clone — comparar um com o outro seria comparar a
     * árvore com ela mesma.
     */
    it('stores the commentDoc exactly as it arrived, marks and attrs included', async () => {
      const commentDoc: unknown = {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            attrs: { fonte: 'p. 45' },
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'é o que você faz',
                    marks: [{ type: 'italic' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const snapshot = structuredClone(commentDoc);

      const { highlight } = await useCase.execute(validInput({ commentDoc }));

      expect(highlight.commentDoc).toEqual(snapshot);
      expect(required(highlights.saved[0]).commentDoc).toEqual(snapshot);
      expect(
        JSON.stringify(required(highlights.saved[0]).commentDoc),
      ).toContain('"marks"');
    });

    // Regra 6 — o doc VAZIO é um comentário válido (o autosave da primeira
    // digitação), e é diferente de "não há comentário": ele fica gravado.
    it('accepts an empty commentDoc, which is not the same as no comment', async () => {
      const { highlight } = await useCase.execute(
        validInput({ commentDoc: aDoc() }),
      );

      expect(highlight.commentDoc).toEqual(aDoc());
      expect(highlight.commentText).toBe('');
    });

    /**
     * Regra 6 + 10 — e o portão do doc é o `assertNoteDoc`, reusado sem renomear
     * (decisão D): a classe é `InvalidNoteError`, o status na borda é o mesmo
     * 400, e nada é gravado.
     */
    it.each<[string, unknown]>([
      ['a string', 'só um comentário'],
      ['a number', 42],
      ['an array', [{ type: 'paragraph' }]],
      ['a paragraph instead of a doc', { type: 'paragraph' }],
      ['an empty object', {}],
    ])(
      'refuses a commentDoc that is %s and writes nothing',
      async (_label, commentDoc) => {
        await expect(
          useCase.execute(validInput({ commentDoc })),
        ).rejects.toBeInstanceOf(InvalidNoteError);

        expect(highlights.saved).toEqual([]);
        expect(highlights.saveCalls).toBe(0);
      },
    );

    /**
     * Regra 10 — a validação INTEIRA roda antes da escrita: um `quote` bom com
     * uma `page` ruim não deixa meio grifo gravado, e vice-versa.
     */
    it.each<[string, Partial<CreateHighlightInput>]>([
      ['a good quote and a bad colour', { color: '#ff0000' }],
      ['a good colour and a bad page', { page: -1 }],
      ['a good page and an empty quote', { page: 45, quote: '  ' }],
      [
        'everything good but the comment',
        { page: 45, reference: 'cap. 3', commentDoc: 'não é um doc' },
      ],
    ])('writes nothing for %s', async (_label, overrides) => {
      await expect(useCase.execute(validInput(overrides))).rejects.toThrow();

      expect(highlights.saved).toEqual([]);
      expect(highlights.saveCalls).toBe(0);
    });

    /**
     * Regra 7 — o `clubId` vem de `book.clubId`, e o input não o tem.
     *
     * O ator é membro dos DOIS clubes de propósito e grifa no livro do segundo:
     * com um clube só, a asserção passaria com uma implementação que pegasse "o
     * clube do membership do ator" ou "o primeiro livro do repositório".
     */
    it('takes the clubId from the book, even for an actor who is in two clubs', async () => {
      await memberships.save(
        aMembership({
          userId: MEMBER_ID,
          clubId: OTHER_CLUB_ID,
          role: 'MEMBER',
        }),
      );

      const { highlight } = await useCase.execute(
        validInput({ bookId: OTHER_CLUB_BOOK_ID }),
      );

      expect(highlight.bookId).toBe(OTHER_CLUB_BOOK_ID);
      expect(highlight.clubId).toBe(OTHER_CLUB_ID);
    });
  });

  /**
   * Regra 11 — **ILIMITADO.** Duas chamadas idênticas criam dois grifos: não há
   * chave natural, não há upsert, e o fake não emula índice único nenhum. O caso
   * real é grifar o mesmo trecho outra vez, numa releitura, com outra cor.
   */
  describe('unlimited', () => {
    it('creates two highlights from two identical calls', async () => {
      const first = await useCase.execute(validInput());
      const second = await useCase.execute(validInput());

      expect(second.highlight.id).not.toBe(first.highlight.id);
      expect(second.highlight.id).toMatch(UUID);
      expect(highlights.saved).toHaveLength(2);
      expect(highlights.saveCalls).toBe(2);
    });

    it('creates a third one too, all with different ids', async () => {
      await useCase.execute(validInput());
      await useCase.execute(validInput());
      await useCase.execute(validInput());

      expect(highlights.saved).toHaveLength(3);
      expect(new Set(highlights.saved.map((one) => one.id)).size).toBe(3);
    });

    // O mesmo trecho com cores diferentes: duas linhas, e as duas com a cor que
    // a pessoa escolheu.
    it('keeps the same quote twice with two different colours', async () => {
      await useCase.execute(validInput({ color: YELLOW }));
      await useCase.execute(validInput({ color: GREEN }));

      // Ordenado antes de comparar: o assunto é QUAIS cores, não a ordem — e a
      // enumeração do fake é a armadilha invertida do §7.2.
      expect(highlights.saved.map((one) => one.color).sort()).toEqual(
        [YELLOW, GREEN].sort(),
      );
    });
  });

  /**
   * ⚠️ **O GATILHO DE ATIVIDADE (Tarefa 33)** — e a pergunta que governa este
   * bloco não é "o evento nasce?", é **"o que o gatilho pode quebrar?"**.
   */
  describe('the activity trigger', () => {
    /**
     * Regras 5, 13, 14 e 15 — o grifo registra um `HIGHLIGHT`, com o `clubId`
     * do LIVRO, o `userId` do ATOR, o id do grifo como `subjectId` e
     * **`planItemId` nulo**.
     *
     * ⚠️ **O `planItemId` nulo é o caso que decidiu o ADR 0004**: registrar um
     * grifo **não depende** de haver anotação naquele dia, e o grifo não
     * ancora em dia nenhum. Um evento com dia aqui inventaria um vínculo que a
     * entidade não tem.
     */
    it('records one HIGHLIGHT, with no day of reading', async () => {
      const { highlight } = await useCase.execute(validInput());

      expect(events.saveCalls).toBe(1);
      expect(events.saved).toHaveLength(1);
      expect(required(events.saved[0])).toMatchObject({
        clubId: CLUB_ID,
        userId: MEMBER_ID,
        type: 'HIGHLIGHT',
        bookId: BOOK_ID,
        subjectId: highlight.id,
      });
      expect(required(events.saved[0]).planItemId).toBeNull();
    });

    /**
     * ⚠️ **Regra 10 — o grifo registra SEMPRE.** Não há idempotência para
     * condicionar: duas chamadas idênticas criam dois grifos (o caso é grifar
     * o mesmo trecho de novo numa releitura, com outra cor), então são dois
     * acontecimentos e dois eventos. O contador afirmado no lado POSITIVO
     * (§7.3).
     */
    it('records every highlight, because two identical calls are two highlights', async () => {
      await useCase.execute(validInput());
      await useCase.execute(validInput());
      await useCase.execute(validInput());

      expect(highlights.saveCalls).toBe(3);
      expect(events.saveCalls).toBe(3);
      expect(events.saved).toHaveLength(3);
    });

    /**
     * ⚠️ **Regra 11 — o gatilho vem DEPOIS da escrita** (decisão I): com a
     * escrita principal falhando, `events.saveCalls === 0`.
     */
    it('records nothing when the highlight itself fails to be written', async () => {
      const save = vi
        .spyOn(highlights, 'save')
        .mockRejectedValue(new Error('o banco caiu'));

      await expect(useCase.execute(validInput())).rejects.toThrow(
        'o banco caiu',
      );

      expect(events.saveCalls).toBe(0);
      save.mockRestore();
    });

    /**
     * ⚠️ **Regra 12 — O GRIFO SOBREVIVE A UM RECORDER QUE LANÇA** (decisão C),
     * assertado sobre o ESTADO DO FAKE e não sobre ausência de erro (§7.4).
     */
    it('keeps the highlight the person registered when the recorder throws', async () => {
      const record = vi
        .spyOn(recordActivity, 'execute')
        .mockRejectedValue(new Error('o feed caiu'));
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { highlight } = await useCase.execute(
        validInput({ quote: 'o trecho que não pode se perder' }),
      );

      expect(highlight.quote).toBe('o trecho que não pode se perder');
      expect(highlights.saved).toHaveLength(1);
      expect(required(highlights.saved[0]).quote).toBe(
        'o trecho que não pode se perder',
      );
      expect(record).toHaveBeenCalledTimes(1);
      expect(logged).toHaveBeenCalledTimes(1);

      record.mockRestore();
      logged.mockRestore();
    });

    /**
     * Regra 13 — contrabando com o ator LEGÍTIMO, assertado na linha gravada
     * do EVENTO (§7.5).
     */
    it('stamps the event with the actor and the club of the book, never with the input', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        bookId: BOOK_ID,
        quote: 'a coragem de continuar',
        color: YELLOW,
        // @ts-expect-error nenhum dos dois existe no input
        userId: OWNER_ID,
        clubId: OTHER_CLUB_ID,
      } satisfies CreateHighlightInput;

      await useCase.execute(smuggled);

      expect(required(events.saved[0]).userId).toBe(MEMBER_ID);
      expect(required(events.saved[0]).clubId).toBe(CLUB_ID);
      expect(required(events.saved[0]).bookId).toBe(BOOK_ID);
    });

    // O corte de tenant recusa ANTES do gatilho (§7.3).
    it('records nothing for someone who is not a member of the club', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: OTHER_CLUB_MEMBER_ID })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(events.saveCalls).toBe(0);
    });

    // Cor fora da paleta é recusada antes de qualquer escrita — e o evento é
    // uma escrita como outra qualquer.
    it('records nothing when the colour is refused', async () => {
      await expect(
        useCase.execute(validInput({ color: '#ff0000' })),
      ).rejects.toBeInstanceOf(InvalidHighlightError);

      expect(events.saveCalls).toBe(0);
    });
  });

  // Estado acidental entre chamadas seria bug de produção invisível: a Tarefa 24
  // compõe o UseCase uma vez e o reusa por request.
  it('does not leak state between two executes of the same instance', async () => {
    await books.save(aBook({ id: 'book-2', clubId: CLUB_ID }));

    const first = await useCase.execute(
      validInput({
        quote: 'a primeira',
        page: 10,
        reference: 'cap. 1',
        commentDoc: aDoc('um comentário'),
      }),
    );
    const second = await useCase.execute(
      validInput({ bookId: 'book-2', quote: 'a segunda', color: GREEN }),
    );

    expect(first.highlight.quote).toBe('a primeira');
    expect(first.highlight.page).toBe(10);
    expect(first.highlight.reference).toBe('cap. 1');
    expect(first.highlight.commentText).toBe('um comentário');
    expect(first.highlight.bookId).toBe(BOOK_ID);

    expect(second.highlight.quote).toBe('a segunda');
    expect(second.highlight.color).toBe(GREEN);
    expect(second.highlight.bookId).toBe('book-2');
    // Nada da primeira vaza para a segunda.
    expect(second.highlight.page).toBeNull();
    expect(second.highlight.reference).toBeNull();
    expect(second.highlight.commentDoc).toBeNull();
    expect(second.highlight.commentText).toBe('');
  });
});
