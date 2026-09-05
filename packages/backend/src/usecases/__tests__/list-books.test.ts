import { beforeEach, describe, expect, it } from 'vitest';

import { ForbiddenRoleError, NotAMemberError } from '../../domain/errors';
import { aBook, aMembership } from '../../test-support/builders';
import { BookRepositoryFake } from '../_fakes/book-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { ListBooksInput } from '../list-books';
import { ListBooks } from '../list-books';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';

describe('ListBooks', () => {
  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let useCase: ListBooks;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    useCase = new ListBooks(new AssertMembership(memberships), books);

    for (const [userId, role] of [
      [OWNER_ID, 'OWNER'],
      [ADMIN_ID, 'ADMIN'],
      [MEMBER_ID, 'MEMBER'],
    ] as const) {
      await memberships.save(aMembership({ userId, clubId: CLUB_ID, role }));
      await memberships.save(
        aMembership({ userId, clubId: OTHER_CLUB_ID, role }),
      );
    }
  });

  function validInput(overrides: Partial<ListBooksInput> = {}): ListBooksInput {
    return { actorUserId: MEMBER_ID, clubId: CLUB_ID, ...overrides };
  }

  describe('permission and tenant', () => {
    // Regra 2 — 404 na borda, não 403.
    it('rejects an actor without an active membership', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: 'user-outsider' })),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    // Regra 2
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

    // Regra 2 — um clube em que a pessoa não entrou é 404, mesmo existindo
    // livro lá.
    it('rejects a club the actor is not a member of', async () => {
      await memberships.save(
        aMembership({ userId: 'user-solo', clubId: CLUB_ID, role: 'MEMBER' }),
      );

      await expect(
        useCase.execute(
          validInput({ actorUserId: 'user-solo', clubId: 'club-3' }),
        ),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    // Regra 3 — LEITURA exige só membership ativo: o livro é do grupo, e um
    // MEMBER que não consegue listar os livros do próprio clube não faz
    // sentido. Este teste é o lado "MEMBER pode" do corte de papel.
    it.each([
      ['MEMBER', MEMBER_ID],
      ['ADMIN', ADMIN_ID],
      ['OWNER', OWNER_ID],
    ])('lets the %s list the books', async (_label, actorUserId) => {
      await books.save(aBook({ id: 'book-1', clubId: CLUB_ID }));

      const found = await useCase.execute(validInput({ actorUserId }));

      expect(found.map((book) => book.id)).toEqual(['book-1']);
    });

    // Regra 3 — e nenhum papel é recusado na leitura.
    it('never raises ForbiddenRoleError on a read', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: MEMBER_ID })),
      ).resolves.not.toBeInstanceOf(ForbiddenRoleError);
    });
  });

  // Regra 15
  it('returns only the books of the club asked for', async () => {
    await books.save(aBook({ id: 'mine-1', clubId: CLUB_ID }));
    await books.save(aBook({ id: 'theirs-1', clubId: OTHER_CLUB_ID }));
    await books.save(aBook({ id: 'mine-2', clubId: CLUB_ID }));

    const found = await useCase.execute(validInput());

    expect(found.map((book) => book.id).sort()).toEqual(['mine-1', 'mine-2']);
  });

  describe('archived books', () => {
    beforeEach(async () => {
      await books.save(
        aBook({ id: 'active', clubId: CLUB_ID, month: '2026-10' }),
      );
      await books.save(
        aBook({
          id: 'archived',
          clubId: CLUB_ID,
          month: '2026-09',
          status: 'ARCHIVED',
          archivedAt: new Date('2026-10-01T00:00:00.000Z'),
        }),
      );
    });

    // Regra 16
    it('returns only the ACTIVE books by default', async () => {
      const found = await useCase.execute(validInput());

      expect(found.map((book) => book.id)).toEqual(['active']);
    });

    // Regra 16
    it('returns both statuses when includeArchived is true', async () => {
      const found = await useCase.execute(
        validInput({ includeArchived: true }),
      );

      expect(found.map((book) => book.id)).toEqual(['active', 'archived']);
    });

    // Regra 16 — `false` explícito é o mesmo que ausente.
    it('returns only the ACTIVE books when includeArchived is false', async () => {
      const found = await useCase.execute(
        validInput({ includeArchived: false }),
      );

      expect(found.map((book) => book.id)).toEqual(['active']);
    });
  });

  describe('order', () => {
    // Regra 17 — o livro do mês corrente primeiro. O fake devolve na ordem de
    // inserção, e os livros são inseridos EMBARALHADOS de propósito: quem
    // ordena é o UseCase, não o repositório.
    it('orders by month descending', async () => {
      await books.save(
        aBook({ id: 'setembro', clubId: CLUB_ID, month: '2026-09' }),
      );
      await books.save(
        aBook({ id: 'novembro', clubId: CLUB_ID, month: '2026-11' }),
      );
      await books.save(
        aBook({ id: 'outubro', clubId: CLUB_ID, month: '2026-10' }),
      );
      await books.save(
        aBook({ id: 'janeiro-2027', clubId: CLUB_ID, month: '2027-01' }),
      );

      const found = await useCase.execute(validInput());

      expect(found.map((book) => book.id)).toEqual([
        'janeiro-2027',
        'novembro',
        'outubro',
        'setembro',
      ]);
    });

    // Regra 17 — createdAt descendente como desempate do mesmo mês.
    it('breaks a month tie by createdAt descending', async () => {
      await books.save(
        aBook({
          id: 'cadastrado-antes',
          clubId: CLUB_ID,
          month: '2026-10',
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
        }),
      );
      await books.save(
        aBook({
          id: 'cadastrado-depois',
          clubId: CLUB_ID,
          month: '2026-10',
          createdAt: new Date('2026-09-20T00:00:00.000Z'),
        }),
      );

      const found = await useCase.execute(validInput());

      expect(found.map((book) => book.id)).toEqual([
        'cadastrado-depois',
        'cadastrado-antes',
      ]);
    });

    // Regra 17 — ordem DETERMINÍSTICA. Mês e createdAt iguais é possível (dois
    // livros cadastrados no mesmo lote), e aí a ordem não pode depender de
    // como o repositório enumerou: o id é o último desempate.
    it('breaks a full tie by id, so the order never depends on the repository', async () => {
      const createdAt = new Date('2026-09-01T00:00:00.000Z');
      await books.save(
        aBook({
          id: 'b-segundo',
          clubId: CLUB_ID,
          month: '2026-10',
          createdAt,
        }),
      );
      await books.save(
        aBook({
          id: 'a-primeiro',
          clubId: CLUB_ID,
          month: '2026-10',
          createdAt,
        }),
      );

      const found = await useCase.execute(validInput());

      expect(found.map((book) => book.id)).toEqual(['a-primeiro', 'b-segundo']);
    });
  });

  // Regra 18
  it('returns an empty list for a club with no books', async () => {
    await expect(useCase.execute(validInput())).resolves.toEqual([]);
  });

  // Regra 18 — e um clube cujos livros estão todos arquivados também.
  it('returns an empty list when every book is archived', async () => {
    await books.save(
      aBook({
        id: 'archived',
        clubId: CLUB_ID,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-10-01T00:00:00.000Z'),
      }),
    );

    await expect(useCase.execute(validInput())).resolves.toEqual([]);
  });

  // Estado acidental entre chamadas seria bug de produção invisível: a Tarefa
  // 07 compõe o UseCase uma vez e reusa por request. Aqui o vazamento mais
  // perigoso seria uma lista acumulada — a de um clube aparecendo no outro.
  it('does not leak state between two executes of the same instance', async () => {
    await books.save(aBook({ id: 'mine-1', clubId: CLUB_ID }));
    await books.save(aBook({ id: 'theirs-1', clubId: OTHER_CLUB_ID }));

    const first = await useCase.execute(validInput());
    const second = await useCase.execute(validInput({ clubId: OTHER_CLUB_ID }));

    expect(first.map((book) => book.id)).toEqual(['mine-1']);
    expect(second.map((book) => book.id)).toEqual(['theirs-1']);
  });
});
