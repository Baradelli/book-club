import { beforeEach, describe, expect, it } from 'vitest';

import {
  ClubNotFoundError,
  ForbiddenRoleError,
  InvalidBookError,
  NotAMemberError,
} from '../../domain/errors';
import { aClub, aMembership, required } from '../../test-support/builders';
import { BookRepositoryFake } from '../_fakes/book-repository-fake';
import { ClubRepositoryFake } from '../_fakes/club-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { ReadingPlanItemRepositoryFake } from '../_fakes/reading-plan-item-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { CreateBookInput, CreateBookPlanItemInput } from '../create-book';
import { CreateBook } from '../create-book';

const CLUB_ID = 'club-1';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';

const THREE_DAYS: CreateBookPlanItemInput[] = [
  { date: '2026-10-01', title: 'Cap. 1 — Uma reunião inesperada' },
  { date: '2026-10-02', title: 'Cap. 2 — Carneiro assado' },
  { date: '2026-10-03', title: 'Cap. 3 — Um descanso breve' },
];

describe('CreateBook', () => {
  let clubs: ClubRepositoryFake;
  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let plan: ReadingPlanItemRepositoryFake;
  let useCase: CreateBook;

  beforeEach(async () => {
    clubs = new ClubRepositoryFake();
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    plan = new ReadingPlanItemRepositoryFake();
    // A regra de papel vem do assertMembership da Tarefa 01, não de uma
    // segunda implementação aqui dentro.
    useCase = new CreateBook(
      new AssertMembership(memberships),
      clubs,
      books,
      plan,
    );

    await clubs.save(aClub());
    await memberships.save(aMembership({ userId: OWNER_ID, role: 'OWNER' }));
    await memberships.save(aMembership({ userId: ADMIN_ID, role: 'ADMIN' }));
    await memberships.save(aMembership({ userId: MEMBER_ID, role: 'MEMBER' }));
  });

  function validInput(
    overrides: Partial<CreateBookInput> = {},
  ): CreateBookInput {
    return {
      actorUserId: ADMIN_ID,
      clubId: CLUB_ID,
      title: 'O Hobbit',
      month: '2026-10',
      ...overrides,
    };
  }

  // Regra 16: nenhum caminho de erro persiste nada — nem o livro.
  function expectNothingPersisted(): void {
    expect(books.saved).toHaveLength(0);
    expect(plan.saved).toHaveLength(0);
  }

  // Regras 7, 15 e 17
  it('creates the book with the defaults and persists book and plan', async () => {
    const before = Date.now();

    const { book, planItems } = await useCase.execute(
      validInput({ planItems: THREE_DAYS }),
    );

    expect(book.id).toEqual(expect.any(String));
    expect(book.clubId).toBe(CLUB_ID);
    expect(book.title).toBe('O Hobbit');
    expect(book.month).toBe('2026-10');
    expect(book.author).toBeNull();
    expect(book.coverUrl).toBeNull();
    expect(book.totalPages).toBeNull();
    expect(book.createdById).toBe(ADMIN_ID);
    expect(book.status).toBe('ACTIVE');
    expect(book.archivedAt).toBeNull();
    expect(book.createdAt.getTime()).toBeGreaterThanOrEqual(before);

    expect(planItems).toHaveLength(3);
    for (const item of planItems) {
      expect(item.id).toEqual(expect.any(String));
      expect(item.bookId).toBe(book.id);
      expect(item.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    }
    expect(new Set(planItems.map((item) => item.id)).size).toBe(3);

    // Regra 17: o output é exatamente o que foi salvo.
    expect(books.saved).toHaveLength(1);
    expect(required(books.saved[0])).toEqual(book);
    expect(plan.saved).toEqual(planItems);
  });

  // Regra 13
  it('derives order from the position in the array', async () => {
    const { planItems } = await useCase.execute(
      validInput({ planItems: THREE_DAYS }),
    );

    expect(planItems.map((item) => item.order)).toEqual([0, 1, 2]);
    expect(planItems.map((item) => item.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  // Regra 13 — o UseCase é SEM ESTADO entre chamadas.
  //
  // A Tarefa 07 compõe o UseCase uma vez em `src/http/` e reusa por request
  // (é o padrão de rota do §6 das convenções), então estado acidental aqui
  // seria bug de produção invisível: cada teste construir a sua instância
  // esconde um contador que não zera. Vale para os ~30 UseCases seguintes.
  it('starts the order over on a second execute of the same instance', async () => {
    const first = await useCase.execute(validInput({ planItems: THREE_DAYS }));

    const second = await useCase.execute(
      validInput({
        title: 'A Sociedade do Anel',
        month: '2026-11',
        planItems: [
          { date: '2026-11-01', title: 'Cap. 1' },
          { date: '2026-11-02', title: 'Cap. 2' },
        ],
      }),
    );

    expect(first.planItems.map((item) => item.order)).toEqual([0, 1, 2]);
    expect(second.planItems.map((item) => item.order)).toEqual([0, 1]);
    // Livros diferentes, então os índices únicos do plano não colidem.
    expect(second.book.id).not.toBe(first.book.id);
    expect(
      second.planItems.every((item) => item.bookId === second.book.id),
    ).toBe(true);
    expect(books.saved).toHaveLength(2);
    expect(plan.saved).toHaveLength(5);
  });

  // Regra 13 — o input não aceita `order`, nem no tipo nem em runtime.
  it('ignores an order smuggled into the input', async () => {
    const smuggled = [
      // @ts-expect-error o input do plano não declara `order` — é derivado
      { date: '2026-10-01', title: 'Cap. 1', order: 99 },
      // @ts-expect-error o input do plano não declara `order` — é derivado
      { date: '2026-10-02', title: 'Cap. 2', order: 98 },
    ] satisfies CreateBookPlanItemInput[];

    const { planItems } = await useCase.execute(
      validInput({ planItems: smuggled }),
    );

    expect(planItems.map((item) => item.order)).toEqual([0, 1]);
  });

  describe('permission and tenant', () => {
    // Regra 1
    it('rejects a club that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ clubId: 'club-ghost' })),
      ).rejects.toBeInstanceOf(ClubNotFoundError);

      expectNothingPersisted();
    });

    // Regra 1
    it('rejects an archived club', async () => {
      await clubs.save(
        aClub({ status: 'ARCHIVED', archivedAt: new Date('2026-02-01') }),
      );

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        ClubNotFoundError,
      );

      expectNothingPersisted();
    });

    // Regra 2 — via assertMembership (404 na borda).
    it('rejects an actor without an active membership', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: 'user-outsider' })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expectNothingPersisted();
    });

    // Regra 2 — membership arquivado não vale.
    it('rejects an actor whose membership is archived', async () => {
      await memberships.save(
        aMembership({ userId: ADMIN_ID, role: 'ADMIN', status: 'ARCHIVED' }),
      );

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        NotAMemberError,
      );

      expectNothingPersisted();
    });

    // Regra 2 — via assertMembership com ADMIN_ROLES (403 na borda).
    it('rejects an actor whose role is MEMBER', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: MEMBER_ID })),
      ).rejects.toBeInstanceOf(ForbiddenRoleError);

      expectNothingPersisted();
    });

    // Regra 2
    it.each([
      ['ADMIN', ADMIN_ID],
      ['OWNER', OWNER_ID],
    ])('lets the %s create the book', async (_label, actorUserId) => {
      const { book } = await useCase.execute(validInput({ actorUserId }));

      expect(book.createdById).toBe(actorUserId);
      expect(books.saved).toHaveLength(1);
    });
  });

  describe('the book', () => {
    // Regra 3
    it.each([
      ['empty', ''],
      ['only spaces', '   '],
      ['only a tab', '\t'],
    ])('rejects a %s title', async (_label, title) => {
      await expect(
        useCase.execute(validInput({ title })),
      ).rejects.toBeInstanceOf(InvalidBookError);

      expectNothingPersisted();
    });

    // Regra 3
    it('trims the title', async () => {
      const { book } = await useCase.execute(
        validInput({ title: '  O Hobbit  ' }),
      );

      expect(book.title).toBe('O Hobbit');
    });

    // Regra 4
    it.each([
      ['month 13', '2026-13'],
      ['a month without padding', '2026-1'],
      ['a full calendar day', '2026-10-05'],
      ['an empty string', ''],
      ['month 00', '2026-00'],
    ])('rejects %s as the club month', async (_label, month) => {
      await expect(
        useCase.execute(validInput({ month })),
      ).rejects.toBeInstanceOf(InvalidBookError);

      expectNothingPersisted();
    });

    // Regra 5
    it.each([
      ['zero', 0],
      ['negative', -1],
      ['fractional', 1.5],
    ])('rejects a %s totalPages', async (_label, totalPages) => {
      await expect(
        useCase.execute(validInput({ totalPages })),
      ).rejects.toBeInstanceOf(InvalidBookError);

      expectNothingPersisted();
    });

    // Regra 5
    it('keeps a positive integer totalPages', async () => {
      const { book } = await useCase.execute(validInput({ totalPages: 320 }));

      expect(book.totalPages).toBe(320);
    });

    // Regra 5
    it('defaults an absent totalPages to null', async () => {
      const { book } = await useCase.execute(validInput());

      expect(book.totalPages).toBeNull();
    });

    // Regra 6
    it('nulls an author and a coverUrl made of spaces only', async () => {
      const { book } = await useCase.execute(
        validInput({ author: '   ', coverUrl: ' ' }),
      );

      expect(book.author).toBeNull();
      expect(book.coverUrl).toBeNull();
    });

    // Regra 6
    it('trims the author and the coverUrl', async () => {
      const { book } = await useCase.execute(
        validInput({
          author: '  J. R. R. Tolkien  ',
          coverUrl: '  https://exemplo.com/capa.jpg  ',
        }),
      );

      expect(book.author).toBe('J. R. R. Tolkien');
      expect(book.coverUrl).toBe('https://exemplo.com/capa.jpg');
    });

    // Regra 6 — validar se é URL de verdade é Zod na borda, não aqui.
    it('does not check that the coverUrl is a URL', async () => {
      const { book } = await useCase.execute(
        validInput({ coverUrl: 'nao-e-uma-url' }),
      );

      expect(book.coverUrl).toBe('nao-e-uma-url');
    });
  });

  describe('the plan', () => {
    // Regra 8
    it('creates a book without a plan when planItems is absent', async () => {
      const { book, planItems } = await useCase.execute(validInput());

      expect(planItems).toEqual([]);
      expect(plan.saved).toHaveLength(0);
      expect(books.saved).toHaveLength(1);
      expect(required(books.saved[0]).id).toBe(book.id);
    });

    // Regra 8
    it('creates a book without a plan when planItems is empty', async () => {
      const { planItems } = await useCase.execute(
        validInput({ planItems: [] }),
      );

      expect(planItems).toEqual([]);
      expect(plan.saved).toHaveLength(0);
      expect(books.saved).toHaveLength(1);
    });

    // As demais regras do plano (títulos, formato de data, unicidade, ordem
    // estrita e normalização de reference) migraram para
    // src/domain/__tests__/reading-plan.test.ts na Tarefa 06, junto com a
    // extração de normalizePlanDrafts. Aqui ficam só as provas de INTEGRAÇÃO:
    // o plano vazio, a atomicidade, o bookId e os ids distintos.
  });

  // Regra 16 — a validação é atômica: um item ruim no fim do plano não deixa
  // o livro nem os itens anteriores no banco.
  describe('atomic validation', () => {
    it('persists nothing when the last plan item is invalid', async () => {
      await expect(
        useCase.execute(
          validInput({
            planItems: [
              { date: '2026-10-01', title: 'Cap. 1' },
              { date: '2026-10-02', title: 'Cap. 2' },
              { date: '2026-10-03', title: '   ' },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(InvalidBookError);

      expectNothingPersisted();
    });

    it('persists nothing when a valid plan comes with an invalid book', async () => {
      await expect(
        useCase.execute(
          validInput({ month: '2026-13', planItems: THREE_DAYS }),
        ),
      ).rejects.toBeInstanceOf(InvalidBookError);

      expectNothingPersisted();
    });
  });
});
