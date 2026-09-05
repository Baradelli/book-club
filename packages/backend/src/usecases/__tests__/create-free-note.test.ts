import { beforeEach, describe, expect, it } from 'vitest';

import { docToText } from '../../domain/doc-to-text';
import {
  BookNotFoundError,
  ForbiddenRoleError,
  InvalidNoteError,
  NotAMemberError,
} from '../../domain/errors';
import type { NoteDoc } from '../../domain/note';
import {
  aBook,
  aDoc,
  aMembership,
  required,
} from '../../test-support/builders';
import { BookRepositoryFake } from '../_fakes/book-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { NoteRepositoryFake } from '../_fakes/note-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { CreateFreeNoteInput } from '../create-free-note';
import { CreateFreeNote } from '../create-free-note';

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

describe('CreateFreeNote', () => {
  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let notes: NoteRepositoryFake;
  let useCase: CreateFreeNote;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    notes = new NoteRepositoryFake();
    useCase = new CreateFreeNote(
      new AssertMembership(memberships),
      books,
      notes,
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

  function validInput(
    overrides: Partial<CreateFreeNoteInput> = {},
  ): CreateFreeNoteInput {
    return {
      actorUserId: MEMBER_ID,
      bookId: BOOK_ID,
      title: 'Sobre o anel',
      doc: aDoc('uma ideia que me veio.'),
      ...overrides,
    };
  }

  describe('permission and tenant', () => {
    // Regra 28
    it('rejects a book that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ bookId: 'book-fantasma' })),
      ).rejects.toBeInstanceOf(BookNotFoundError);

      expect(notes.saveCalls).toBe(0);
    });

    // Regra 28 — arquivado é invisível até o MVP 4, também para escrever.
    it('rejects an archived book', async () => {
      await expect(
        useCase.execute(validInput({ bookId: ARCHIVED_BOOK_ID })),
      ).rejects.toBeInstanceOf(BookNotFoundError);

      expect(notes.saveCalls).toBe(0);
    });

    // Regra 29
    it('rejects an actor with no membership at all', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: 'user-forasteiro' })),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    // Regra 29
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
    });

    // Regra 29 — 404, não 403. O membro do outro clube é membro de verdade.
    it('rejects a member of another club with 404, not 403', async () => {
      const error: unknown = await useCase
        .execute(validInput({ actorUserId: OTHER_CLUB_MEMBER_ID }))
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotAMemberError);
      expect(error).not.toBeInstanceOf(ForbiddenRoleError);
    });

    /**
     * A ORDEM: o corte de tenant vem ANTES da validação do corpo. Os dois
     * eixos se cruzam só aqui — todo outro teste de título vazio / doc
     * malformado usa membro válido, e todo outro teste de ator de fora usa
     * corpo válido.
     *
     * Por que a ordem importa: um `InvalidNoteError` (400, e é a única classe
     * cuja `message` sai publicada — CONVENCOES-CODIGO §6.2) confirmaria a quem
     * não é do clube que o `bookId` existe. O 404 do tenant não confirma nada.
     */
    it('cuts the tenant before it validates the body', async () => {
      const error: unknown = await useCase
        .execute(
          validInput({
            actorUserId: OTHER_CLUB_MEMBER_ID,
            title: '   ',
            doc: 'não é um doc',
          }),
        )
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotAMemberError);
      expect(error).not.toBeInstanceOf(InvalidNoteError);
      expect(notes.saveCalls).toBe(0);
    });

    // Regra 29 — e o caminho inverso: o membro do clube 1 não escreve no livro
    // do clube 2 nem sabendo o id do livro.
    it('rejects writing on a book of another club', async () => {
      await expect(
        useCase.execute(validInput({ bookId: OTHER_CLUB_BOOK_ID })),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    // Escrever não exige papel: `MEMBER` escreve.
    it.each([
      ['MEMBER', MEMBER_ID],
      ['ADMIN', ADMIN_ID],
      ['OWNER', OWNER_ID],
    ])('lets the %s write a free note', async (_label, actorUserId) => {
      const { note } = await useCase.execute(validInput({ actorUserId }));

      expect(note.userId).toBe(actorUserId);
    });

    it('ignores a userId smuggled into the input', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        bookId: BOOK_ID,
        title: 'Sobre o anel',
        doc: aDoc('minha ideia'),
        // @ts-expect-error o input não declara userId — o autor é o ator
        userId: OWNER_ID,
      } satisfies CreateFreeNoteInput;

      const { note } = await useCase.execute(smuggled);

      expect(note.userId).toBe(MEMBER_ID);
    });

    /**
     * O `clubId` GRAVADO ignora o input — e é isto que prova, porque o ator é
     * um MEMBRO LEGÍTIMO: a chamada atravessa o corte de tenant e chega ao
     * campo que vai para a linha. Um `clubId` vindo do corpo faria a nota
     * aparecer na listagem de OUTRO clube (envenenamento cross-tenant), e um
     * teste feito com ator de fora nunca chegaria a esse campo.
     */
    it('ignores a clubId smuggled into the input and stores the club of the book', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        bookId: BOOK_ID,
        title: 'Sobre o anel',
        doc: aDoc('minha ideia'),
        // @ts-expect-error o input não declara clubId — ele vem de book.clubId
        clubId: OTHER_CLUB_ID,
      } satisfies CreateFreeNoteInput;

      const { note } = await useCase.execute(smuggled);

      expect(note.clubId).toBe(CLUB_ID);
      expect(required(notes.saved[0]).clubId).toBe(CLUB_ID);
    });

    // A OUTRA coisa que o `clubId` contrabandeado não compra: o corte de
    // tenant. Mandar o clube "certo" no corpo não faz o ator de fora entrar.
    it('does not let a smuggled clubId buy a way past the tenant cut', async () => {
      const smuggled = {
        actorUserId: OTHER_CLUB_MEMBER_ID,
        bookId: BOOK_ID,
        title: 'Sobre o anel',
        doc: aDoc('minha ideia'),
        // @ts-expect-error o input não declara clubId — ele vem de book.clubId
        clubId: OTHER_CLUB_ID,
      } satisfies CreateFreeNoteInput;

      await expect(useCase.execute(smuggled)).rejects.toBeInstanceOf(
        NotAMemberError,
      );
      expect(notes.saveCalls).toBe(0);
    });

    it('ignores a plainText smuggled into the input', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        bookId: BOOK_ID,
        title: 'Sobre o anel',
        doc: aDoc('o texto de verdade'),
        // @ts-expect-error plainText é DERIVADO, nunca entra na API (ADR 0001)
        plainText: 'texto adulterado pelo cliente',
      } satisfies CreateFreeNoteInput;

      const { note } = await useCase.execute(smuggled);

      expect(note.plainText).toBe('o texto de verdade');
    });
  });

  describe('creating', () => {
    // Regra 30
    it('creates it with the fields the domain decides', async () => {
      const { note } = await useCase.execute(validInput());

      expect(note.kind).toBe('FREE');
      expect(note.planItemId).toBeNull();
      expect(note.title).toBe('Sobre o anel');
      expect(note.userId).toBe(MEMBER_ID);
      expect(note.status).toBe('ACTIVE');
      expect(note.archivedAt).toBeNull();
      expect(note.id).toMatch(UUID);
      expect(note.createdAt).toEqual(note.updatedAt);
      expect(notes.saved).toHaveLength(1);
    });

    // Regra 30 — título aparado.
    it('trims the title', async () => {
      const { note } = await useCase.execute(
        validInput({ title: '   Sobre o anel   ' }),
      );

      expect(note.title).toBe('Sobre o anel');
    });

    // Regra 31
    it.each([
      ['an empty title', ''],
      ['a title of spaces', '    '],
      ['a title of a tab', '\t'],
      ['a title of a newline', '\n'],
    ])('refuses %s and writes nothing', async (_label, title) => {
      await expect(
        useCase.execute(validInput({ title })),
      ).rejects.toBeInstanceOf(InvalidNoteError);

      expect(notes.saved).toEqual([]);
      expect(notes.saveCalls).toBe(0);
    });

    // Regra 32 — o MESMO `optionalText` do livro e do item do plano.
    it.each<[string, string | undefined, string | null]>([
      ['undefined', undefined, null],
      ['an empty string', '', null],
      ['only spaces', '   ', null],
      ['a reference with spaces around', '  p. 45-62  ', 'p. 45-62'],
      ['a clean reference', 'p. 45-62', 'p. 45-62'],
      ['a subject instead of a page', 'sobre a coragem', 'sobre a coragem'],
    ])(
      'normalizes %s into the stored reference',
      async (_label, reference, expected) => {
        const { note } = await useCase.execute(
          validInput(reference === undefined ? {} : { reference }),
        );

        expect(note.reference).toBe(expected);
      },
    );

    /**
     * Regra 34 — o `clubId` vem de `book.clubId`, e o input não o tem.
     *
     * O ator é membro dos DOIS clubes de propósito e escreve no livro do
     * segundo: com um clube só, a asserção passaria com uma implementação que
     * pegasse "o clube do membership do ator" ou "o primeiro livro do
     * repositório".
     */
    it('takes the clubId from the book, even for an actor who is in two clubs', async () => {
      await memberships.save(
        aMembership({
          userId: MEMBER_ID,
          clubId: OTHER_CLUB_ID,
          role: 'MEMBER',
        }),
      );

      const { note } = await useCase.execute(
        validInput({ bookId: OTHER_CLUB_BOOK_ID }),
      );

      expect(note.bookId).toBe(OTHER_CLUB_BOOK_ID);
      expect(note.clubId).toBe(OTHER_CLUB_ID);
    });

    // Regra 35
    it('derives plainText from the doc', async () => {
      const doc: NoteDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'o anel é um símbolo' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'de poder que corrompe' }],
          },
        ],
      };

      const { note } = await useCase.execute(validInput({ doc }));

      expect(note.plainText).toBe('o anel é um símbolo\nde poder que corrompe');
      expect(note.plainText).toBe(docToText(doc));
    });

    /**
     * Regra 12 — o doc é gravado COMO VEIO.
     *
     * A asserção é contra um SNAPSHOT tirado antes do `execute`: `note.doc` **é**
     * o objeto que entrou, e `notes.saved[0].doc` é o clone que o fake fez dele
     * — comparar um com o outro seria comparar a árvore com ela mesma.
     */
    it('stores the doc exactly as it arrived', async () => {
      const doc: unknown = {
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
                    text: 'não é o que você tem',
                    marks: [{ type: 'italic' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const snapshot = structuredClone(doc);

      const { note } = await useCase.execute(validInput({ doc }));

      expect(note.doc).toEqual(snapshot);
      expect(required(notes.saved[0]).doc).toEqual(snapshot);
      // O itálico e o `attrs.fonte` da citação chegaram ao "banco".
      expect(JSON.stringify(required(notes.saved[0]).doc)).toContain('"marks"');
      expect(JSON.stringify(required(notes.saved[0]).doc)).toContain('p. 45');
    });

    // Regra 11 — o autosave da primeira digitação manda o doc vazio.
    it('accepts an empty doc', async () => {
      const { note } = await useCase.execute(validInput({ doc: aDoc() }));

      expect(note.plainText).toBe('');
    });

    // Regra 27 (o mesmo portão de doc do upsert)
    it.each<[string, unknown]>([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'só um texto'],
      ['an array', [{ type: 'paragraph' }]],
      ['a paragraph instead of a doc', { type: 'paragraph' }],
    ])('writes nothing when the doc is %s', async (_label, doc) => {
      await expect(useCase.execute(validInput({ doc }))).rejects.toBeInstanceOf(
        InvalidNoteError,
      );

      expect(notes.saved).toEqual([]);
      expect(notes.saveCalls).toBe(0);
    });
  });

  /**
   * Regra 33 — ILIMITADO. Duas chamadas idênticas criam duas notas: é o que o
   * BACKLOG decidiu, e é a metade em que o índice `unique(planItemId, userId)`
   * não pode atrapalhar — `planItemId: null` não colide no Postgres.
   */
  describe('unlimited', () => {
    it('creates two notes from two identical calls', async () => {
      const first = await useCase.execute(validInput());
      const second = await useCase.execute(validInput());

      expect(second.note.id).not.toBe(first.note.id);
      expect(second.note.id).toMatch(UUID);
      expect(notes.saved).toHaveLength(2);
    });

    it('creates a third one too', async () => {
      await useCase.execute(validInput());
      await useCase.execute(validInput());
      await useCase.execute(validInput());

      expect(notes.saved).toHaveLength(3);
      expect(new Set(notes.saved.map((note) => note.id)).size).toBe(3);
      expect(notes.saved.map((note) => note.planItemId)).toEqual([
        null,
        null,
        null,
      ]);
    });
  });

  // Estado acidental entre chamadas seria bug de produção invisível: a Tarefa
  // 11 compõe o UseCase uma vez e reusa por request.
  it('does not leak state between two executes of the same instance', async () => {
    await books.save(aBook({ id: 'book-2', clubId: CLUB_ID }));

    const first = await useCase.execute(
      validInput({ title: 'Primeira', reference: 'p. 10', doc: aDoc('uma') }),
    );
    const second = await useCase.execute(
      validInput({ bookId: 'book-2', title: 'Segunda', doc: aDoc('outra') }),
    );

    expect(first.note.title).toBe('Primeira');
    expect(first.note.reference).toBe('p. 10');
    expect(first.note.bookId).toBe(BOOK_ID);
    expect(second.note.title).toBe('Segunda');
    // A referência da primeira não vaza para a segunda.
    expect(second.note.reference).toBeNull();
    expect(second.note.bookId).toBe('book-2');
    expect(second.note.plainText).toBe('outra');
  });
});
