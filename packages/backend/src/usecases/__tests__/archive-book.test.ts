import { beforeEach, describe, expect, it } from 'vitest';

import type { Book, ReadingPlanItem } from '../../domain/book';
import {
  BookNotFoundError,
  ForbiddenRoleError,
  NotAMemberError,
} from '../../domain/errors';
import {
  aBook,
  aMembership,
  aPlanItem,
  required,
} from '../../test-support/builders';
import { BookRepositoryFake } from '../_fakes/book-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { ReadingPlanItemRepositoryFake } from '../_fakes/reading-plan-item-repository-fake';
import type { ArchiveBookInput } from '../archive-book';
import { ArchiveBook } from '../archive-book';
import { AssertMembership } from '../assert-membership';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const BOOK_ID = 'book-1';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';
const OTHER_ADMIN_ID = 'user-other-admin';

describe('ArchiveBook', () => {
  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let plan: ReadingPlanItemRepositoryFake;
  let useCase: ArchiveBook;
  let stored: Book;
  let planBefore: ReadingPlanItem[];

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    plan = new ReadingPlanItemRepositoryFake();
    useCase = new ArchiveBook(new AssertMembership(memberships), books);

    stored = aBook({ id: BOOK_ID, clubId: CLUB_ID });
    await books.save(stored);

    // O plano existe para a regra 14 poder ser afirmada: arquivar o livro não
    // toca no plano. A prova forte é estrutural — o ArchiveBook nem recebe o
    // ReadingPlanItemRepository —, e a asserção abaixo é a rede.
    await plan.saveMany([
      aPlanItem({ bookId: BOOK_ID, order: 0, date: '2026-10-01' }),
      aPlanItem({ bookId: BOOK_ID, order: 1, date: '2026-10-02' }),
    ]);
    planBefore = plan.saved;

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

  function validInput(
    overrides: Partial<ArchiveBookInput> = {},
  ): ArchiveBookInput {
    return { actorUserId: ADMIN_ID, bookId: BOOK_ID, ...overrides };
  }

  function expectBookUnchanged(): void {
    expect(books.saved).toEqual([stored]);
  }

  // Regra 14 — o acervo continua legível: nada do plano é apagado.
  function expectPlanUntouched(): void {
    expect(plan.saved).toEqual(planBefore);
    expect(plan.replaceForBookCalls).toBe(0);
    expect(plan.removedIds).toEqual([]);
  }

  describe('permission and tenant', () => {
    // Regra 1
    it('rejects a book that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ bookId: 'book-ghost' })),
      ).rejects.toBeInstanceOf(BookNotFoundError);

      expectBookUnchanged();
      expectPlanUntouched();
    });

    // Regras 1 e 13 — arquivar duas vezes não é idempotente por decisão: o
    // livro arquivado é invisível, então a segunda tentativa é um 404.
    it('rejects a book that is already archived', async () => {
      stored = aBook({
        id: BOOK_ID,
        clubId: CLUB_ID,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      await books.save(stored);

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        BookNotFoundError,
      );

      expectBookUnchanged();
      expectPlanUntouched();
    });

    // Regra 13 pelo caminho real: arquivar e tentar de novo.
    it('rejects the second archive of the same book', async () => {
      await useCase.execute(validInput());

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        BookNotFoundError,
      );
    });

    // Regra 2
    it('rejects an actor without an active membership', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: 'user-outsider' })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expectBookUnchanged();
      expectPlanUntouched();
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

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        NotAMemberError,
      );

      expectBookUnchanged();
    });

    // Regra 3
    it('rejects an actor whose role is MEMBER', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: MEMBER_ID })),
      ).rejects.toBeInstanceOf(ForbiddenRoleError);

      expectBookUnchanged();
      expectPlanUntouched();
    });

    // Regra 3
    it.each([
      ['ADMIN', ADMIN_ID],
      ['OWNER', OWNER_ID],
    ])('lets the %s archive the book', async (_label, actorUserId) => {
      const book = await useCase.execute(validInput({ actorUserId }));

      expect(book.status).toBe('ARCHIVED');
    });

    // Regra 4
    it('rejects an admin of another club', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: OTHER_ADMIN_ID })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expectBookUnchanged();
    });

    // Regra 4
    it('ignores a clubId smuggled into the input', async () => {
      const smuggled = {
        actorUserId: OTHER_ADMIN_ID,
        bookId: BOOK_ID,
        // @ts-expect-error o input não declara clubId — ele vem de book.clubId
        clubId: OTHER_CLUB_ID,
      } satisfies ArchiveBookInput;

      await expect(useCase.execute(smuggled)).rejects.toBeInstanceOf(
        NotAMemberError,
      );

      expectBookUnchanged();
    });
  });

  // Regra 12
  it('sets status to ARCHIVED and stamps archivedAt', async () => {
    const before = Date.now();

    const book = await useCase.execute(validInput());

    expect(book.status).toBe('ARCHIVED');
    expect(book.archivedAt).not.toBeNull();
    expect(required(book.archivedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(required(books.saved[0])).toEqual(book);
  });

  // Regra 12 — nada mais muda.
  it('changes nothing but status and archivedAt', async () => {
    const book = await useCase.execute(validInput());

    expect(book).toEqual({
      ...stored,
      status: 'ARCHIVED',
      archivedAt: book.archivedAt,
    });
  });

  // Regra 14
  it('does not delete the reading plan', async () => {
    await useCase.execute(validInput());

    expectPlanUntouched();
  });

  // Estado acidental entre chamadas seria bug de produção invisível: a Tarefa
  // 07 compõe o UseCase uma vez e reusa por request.
  it('does not leak state between two executes of the same instance', async () => {
    await books.save(aBook({ id: 'book-2', clubId: CLUB_ID, title: 'Outro' }));

    const first = await useCase.execute(validInput());
    const second = await useCase.execute(validInput({ bookId: 'book-2' }));

    expect(first.id).toBe(BOOK_ID);
    expect(second.id).toBe('book-2');
    expect(second.title).toBe('Outro');
    expect(second.status).toBe('ARCHIVED');
    expect(books.saved.map((book) => book.status)).toEqual([
      'ARCHIVED',
      'ARCHIVED',
    ]);
  });
});
