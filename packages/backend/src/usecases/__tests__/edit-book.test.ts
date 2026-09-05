import { beforeEach, describe, expect, it } from 'vitest';

import type { Book } from '../../domain/book';
import {
  BookNotFoundError,
  ForbiddenRoleError,
  InvalidBookError,
  NotAMemberError,
} from '../../domain/errors';
import { aBook, aMembership, required } from '../../test-support/builders';
import { BookRepositoryFake } from '../_fakes/book-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { EditBookInput } from '../edit-book';
import { EditBook } from '../edit-book';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const BOOK_ID = 'book-1';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';
/** Admin do OUTRO clube: existe, tem papel, e não é do clube do livro. */
const OTHER_ADMIN_ID = 'user-other-admin';

describe('EditBook', () => {
  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let useCase: EditBook;
  let stored: Book;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    // AssertMembership real sobre o fake de membership: a regra de papel é a
    // da Tarefa 01, não uma segunda implementação aqui dentro.
    useCase = new EditBook(new AssertMembership(memberships), books);

    stored = aBook({ id: BOOK_ID, clubId: CLUB_ID });
    await books.save(stored);

    for (const [userId, role] of [
      [OWNER_ID, 'OWNER'],
      [ADMIN_ID, 'ADMIN'],
      [MEMBER_ID, 'MEMBER'],
    ] as const) {
      await memberships.save(aMembership({ userId, clubId: CLUB_ID, role }));
    }
    await memberships.save(
      aMembership({
        userId: OTHER_ADMIN_ID,
        clubId: OTHER_CLUB_ID,
        role: 'ADMIN',
      }),
    );
  });

  function validInput(overrides: Partial<EditBookInput> = {}): EditBookInput {
    return { actorUserId: ADMIN_ID, bookId: BOOK_ID, ...overrides };
  }

  /** Nenhum caminho de erro escreve: o livro guardado continua o original. */
  function expectBookUnchanged(): void {
    expect(books.saved).toEqual([stored]);
    expect(books.updateCalls).toBe(0);
  }

  describe('permission and tenant', () => {
    // Regra 1
    it('rejects a book that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ bookId: 'book-ghost' })),
      ).rejects.toBeInstanceOf(BookNotFoundError);

      expectBookUnchanged();
    });

    // Regra 1 — arquivado é invisível; desarquivar é MVP 4.
    it('rejects an archived book', async () => {
      stored = aBook({
        id: BOOK_ID,
        clubId: CLUB_ID,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      await books.save(stored);

      await expect(
        useCase.execute(validInput({ title: 'Outro' })),
      ).rejects.toBeInstanceOf(BookNotFoundError);

      expectBookUnchanged();
    });

    // Regra 2 — 404 na borda, não 403.
    it('rejects an actor without an active membership', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: 'user-outsider' })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expectBookUnchanged();
    });

    // Regra 2
    it('rejects an actor whose membership is archived', async () => {
      await memberships.save(
        aMembership({
          userId: ADMIN_ID,
          clubId: CLUB_ID,
          role: 'ADMIN',
          status: 'ARCHIVED',
        }),
      );

      await expect(
        useCase.execute(validInput({ title: 'Outro' })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expectBookUnchanged();
    });

    // Regra 3 — escrita exige OWNER/ADMIN.
    it('rejects an actor whose role is MEMBER', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: MEMBER_ID })),
      ).rejects.toBeInstanceOf(ForbiddenRoleError);

      expectBookUnchanged();
    });

    // Regra 3
    it.each([
      ['ADMIN', ADMIN_ID],
      ['OWNER', OWNER_ID],
    ])('lets the %s edit the book', async (_label, actorUserId) => {
      const book = await useCase.execute(
        validInput({ actorUserId, title: 'A Sociedade do Anel' }),
      );

      expect(book.title).toBe('A Sociedade do Anel');
    });

    // Regra 4 — o clube do guard vem de book.clubId. O admin do OUTRO clube é
    // admin de verdade, e ainda assim recebe 404 neste livro.
    it('rejects an admin of another club', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: OTHER_ADMIN_ID })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expectBookUnchanged();
    });

    // Regra 4 — e mandar o clubId "certo" no corpo não muda nada: o input não
    // declara clubId, e o guard não o leria de lá de todo jeito.
    it('ignores a clubId smuggled into the input', async () => {
      const smuggled = {
        actorUserId: OTHER_ADMIN_ID,
        bookId: BOOK_ID,
        // @ts-expect-error o input não declara clubId — ele vem de book.clubId
        clubId: OTHER_CLUB_ID,
      } satisfies EditBookInput;

      await expect(useCase.execute(smuggled)).rejects.toBeInstanceOf(
        NotAMemberError,
      );

      expectBookUnchanged();
    });
  });

  describe('what the patch touches', () => {
    // Regra 5 — campo ausente não é alterado.
    it('changes only the fields the input mentions', async () => {
      const book = await useCase.execute(validInput({ title: 'Outro título' }));

      expect(book).toEqual({ ...stored, title: 'Outro título' });
      expect(required(books.saved[0])).toEqual(book);
    });

    // Regra 5 — null explícito limpa.
    it('clears author, coverUrl and totalPages with an explicit null', async () => {
      stored = aBook({
        id: BOOK_ID,
        clubId: CLUB_ID,
        author: 'J. R. R. Tolkien',
        coverUrl: 'https://exemplo.com/capa.jpg',
        totalPages: 320,
      });
      await books.save(stored);

      const book = await useCase.execute(
        validInput({ author: null, coverUrl: null, totalPages: null }),
      );

      expect(book.author).toBeNull();
      expect(book.coverUrl).toBeNull();
      expect(book.totalPages).toBeNull();
    });

    // Regra 5 — undefined é ausência, não "grave nulo". É a diferença que
    // distingue "não mandei o campo" de "quero apagar o campo".
    it('keeps the current value when a field comes as undefined', async () => {
      const book = await useCase.execute(
        validInput({ author: undefined, coverUrl: undefined }),
      );

      expect(book.author).toBe(stored.author);
      expect(book.coverUrl).toBe(stored.coverUrl);
    });

    // Regra 11 — e a metade "não escreve" dela.
    //
    // `books.saved` sozinho não prova nada aqui: `update` com patch vazio é
    // no-op, então ele fica igual tanto se o UseCase voltar cedo quanto se
    // chamar o repositório à toa. Na Tarefa 07 a diferença é um `UPDATE` por
    // request em toda tela que salva sem mudar nada — daí o contador.
    it('returns the book unchanged when the input has no editable field', async () => {
      const book = await useCase.execute(validInput());

      expect(book).toEqual(stored);
      expect(books.saved).toEqual([stored]);
      expect(books.updateCalls).toBe(0);
    });

    // Regra 11 + regra 3: o guard roda ANTES de concluir que não há nada a
    // fazer. Um patch vazio não é atalho para furar o papel.
    it('still enforces the role when the input has no editable field', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: MEMBER_ID })),
      ).rejects.toBeInstanceOf(ForbiddenRoleError);
    });

    // Regra 10 — nem no tipo, nem em runtime.
    //
    // Uma chave por literal de propósito: o TypeScript só reporta a PRIMEIRA
    // propriedade excedente de cada literal, então as seis juntas num objeto
    // deixariam cinco @ts-expect-error sem uso — e o typecheck acusaria isso.
    it('never edits clubId, createdById, status, archivedAt, createdAt or id', async () => {
      const frozen = new Date('2020-01-01T00:00:00.000Z');
      const smuggled: EditBookInput[] = [
        // @ts-expect-error clubId não é editável (moveria conteúdo de tenant)
        { actorUserId: ADMIN_ID, bookId: BOOK_ID, clubId: OTHER_CLUB_ID },
        // @ts-expect-error createdById não é editável
        { actorUserId: ADMIN_ID, bookId: BOOK_ID, createdById: 'user-invasor' },
        // @ts-expect-error status não é editável (arquivar é o archiveBook)
        { actorUserId: ADMIN_ID, bookId: BOOK_ID, status: 'ARCHIVED' },
        // @ts-expect-error archivedAt não é editável
        { actorUserId: ADMIN_ID, bookId: BOOK_ID, archivedAt: frozen },
        // @ts-expect-error createdAt não é editável
        { actorUserId: ADMIN_ID, bookId: BOOK_ID, createdAt: frozen },
        // @ts-expect-error id não é editável
        { actorUserId: ADMIN_ID, bookId: BOOK_ID, id: 'book-outro' },
      ];

      for (const input of smuggled) {
        // Nenhuma delas entra no patch, então o livro volta intacto. Se uma
        // entrasse, o patch deixaria de ser vazio e o update a gravaria — e o
        // contador acusaria a chamada mesmo que o valor coincidisse.
        await expect(useCase.execute(input)).resolves.toEqual(stored);
      }
      expect(books.saved).toEqual([stored]);
      expect(books.updateCalls).toBe(0);
    });

    // Regra 10 — e junto de um campo editável de verdade, só ele muda.
    it('applies the editable field and drops the smuggled one', async () => {
      const book = await useCase.execute({
        actorUserId: ADMIN_ID,
        bookId: BOOK_ID,
        title: 'Outro título',
        // @ts-expect-error clubId não é editável
        clubId: OTHER_CLUB_ID,
      });

      expect(book).toEqual({ ...stored, title: 'Outro título' });
      expect(books.saved).toEqual([book]);
    });
  });

  describe('title', () => {
    // Regra 6
    it.each([
      ['empty', ''],
      ['only spaces', '   '],
      ['only a tab', '\t'],
    ])('rejects a %s title', async (_label, title) => {
      await expect(
        useCase.execute(validInput({ title })),
      ).rejects.toBeInstanceOf(InvalidBookError);

      expectBookUnchanged();
    });

    // Regra 6
    it('trims the title', async () => {
      const book = await useCase.execute(
        validInput({ title: '  A Sociedade do Anel  ' }),
      );

      expect(book.title).toBe('A Sociedade do Anel');
    });
  });

  describe('month', () => {
    // Regra 7
    it.each([
      ['month 13', '2026-13'],
      ['a month without padding', '2026-1'],
      ['a full calendar day', '2026-10-05'],
      ['an empty string', ''],
      ['month 00', '2026-00'],
    ])('rejects %s', async (_label, month) => {
      await expect(
        useCase.execute(validInput({ month })),
      ).rejects.toBeInstanceOf(InvalidBookError);

      expectBookUnchanged();
    });

    // Regra 7 — o mês NÃO é conferido contra as datas do plano: a virada de
    // mês é legítima (mesma razão da Tarefa 05).
    it('accepts a valid month', async () => {
      const book = await useCase.execute(validInput({ month: '2026-11' }));

      expect(book.month).toBe('2026-11');
    });
  });

  describe('totalPages', () => {
    // Regra 8
    it.each([
      ['zero', 0],
      ['negative', -1],
      ['fractional', 1.5],
    ])('rejects a %s totalPages', async (_label, totalPages) => {
      await expect(
        useCase.execute(validInput({ totalPages })),
      ).rejects.toBeInstanceOf(InvalidBookError);

      expectBookUnchanged();
    });

    // Regra 8
    it('keeps a positive integer totalPages', async () => {
      const book = await useCase.execute(validInput({ totalPages: 411 }));

      expect(book.totalPages).toBe(411);
    });
  });

  describe('author and coverUrl', () => {
    // Regra 9
    it('nulls an author and a coverUrl made of spaces only', async () => {
      const book = await useCase.execute(
        validInput({ author: '   ', coverUrl: ' ' }),
      );

      expect(book.author).toBeNull();
      expect(book.coverUrl).toBeNull();
    });

    // Regra 9
    it('trims the author and the coverUrl', async () => {
      const book = await useCase.execute(
        validInput({
          author: '  J. R. R. Tolkien  ',
          coverUrl: '  https://exemplo.com/capa.jpg  ',
        }),
      );

      expect(book.author).toBe('J. R. R. Tolkien');
      expect(book.coverUrl).toBe('https://exemplo.com/capa.jpg');
    });
  });

  // A validação é atômica: um campo ruim não deixa os anteriores no banco.
  it('writes nothing when one field of the patch is invalid', async () => {
    await expect(
      useCase.execute(
        validInput({ title: 'A Sociedade do Anel', month: '2026-13' }),
      ),
    ).rejects.toBeInstanceOf(InvalidBookError);

    expectBookUnchanged();
  });

  // O UseCase é SEM ESTADO entre chamadas: a Tarefa 07 o compõe uma vez em
  // src/http/ e reusa por request, então estado acidental seria bug de
  // produção invisível — e cada teste construir a sua instância o esconderia.
  it('does not leak state between two executes of the same instance', async () => {
    await books.save(
      aBook({
        id: 'book-2',
        clubId: CLUB_ID,
        title: 'A Sociedade do Anel',
        author: 'Tolkien',
        totalPages: 576,
      }),
    );

    const first = await useCase.execute(
      validInput({ title: 'Primeiro', author: null, totalPages: 100 }),
    );
    const second = await useCase.execute(
      validInput({ bookId: 'book-2', month: '2027-01' }),
    );

    expect(first.title).toBe('Primeiro');
    expect(first.author).toBeNull();
    expect(first.totalPages).toBe(100);
    // O segundo mandou só `month`: nada do patch anterior pode ter vazado.
    expect(second.id).toBe('book-2');
    expect(second.title).toBe('A Sociedade do Anel');
    expect(second.author).toBe('Tolkien');
    expect(second.totalPages).toBe(576);
    expect(second.month).toBe('2027-01');
  });
});
