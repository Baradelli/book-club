import { beforeEach, describe, expect, it } from 'vitest';

import { ADMIN_ROLES, MEMBER_ROLES } from '../../domain/club';
import {
  BookNotFoundError,
  ForbiddenRoleError,
  NotAMemberError,
} from '../../domain/errors';
import { aBook, aMembership } from '../../test-support/builders';
import { BookRepositoryFake } from '../_fakes/book-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { BookForActorInput } from '../book-for-actor';
import { bookForActor } from '../book-for-actor';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const BOOK_ID = 'book-1';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';
/** Membro do OUTRO clube, com papel de sobra lá. */
const OUTSIDER_ID = 'user-outsider-admin';

/**
 * Suíte própria do guard, e não só por reflexo dos quatro chamadores.
 *
 * A auditoria da Tarefa 06 mostrou por quê: a mutação "o guard lê o `clubId`
 * do próprio input" **sobreviveu** aos 466 testes, e só morreu quando os
 * quatro UseCases também passaram a repassar `...input`. Ou seja: a proteção
 * dependia de os chamadores continuarem montando literais explícitos. Aqui ela
 * é afirmada onde mora.
 */
describe('bookForActor', () => {
  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let assertMembership: AssertMembership;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    // O AssertMembership REAL sobre o fake de membership — é o guard de
    // tenant da Tarefa 01, não um dublê.
    assertMembership = new AssertMembership(memberships);

    await books.save(aBook({ id: BOOK_ID, clubId: CLUB_ID }));
    await memberships.save(
      aMembership({ userId: ADMIN_ID, clubId: CLUB_ID, role: 'ADMIN' }),
    );
    await memberships.save(
      aMembership({ userId: MEMBER_ID, clubId: CLUB_ID, role: 'MEMBER' }),
    );
    // Fora do clube do livro, mas ADMIN no clube dele.
    await memberships.save(
      aMembership({
        userId: OUTSIDER_ID,
        clubId: OTHER_CLUB_ID,
        role: 'ADMIN',
      }),
    );
  });

  function run(input: BookForActorInput) {
    return bookForActor(books, assertMembership, input);
  }

  it('returns the book when the actor is an active member', async () => {
    const book = await run({ actorUserId: MEMBER_ID, bookId: BOOK_ID });

    expect(book.id).toBe(BOOK_ID);
    expect(book.clubId).toBe(CLUB_ID);
  });

  describe('the book has to exist and be active', () => {
    it('throws BookNotFoundError for a book that was never saved', async () => {
      await expect(
        run({ actorUserId: MEMBER_ID, bookId: 'book-ghost' }),
      ).rejects.toBeInstanceOf(BookNotFoundError);
    });

    // Arquivado é invisível: desarquivar é MVP 4. E é o MESMO erro do
    // inexistente de propósito — distinguir os dois vazaria existência.
    it('throws BookNotFoundError for an archived book', async () => {
      await books.save(
        aBook({
          id: BOOK_ID,
          clubId: CLUB_ID,
          status: 'ARCHIVED',
          archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );

      await expect(
        run({ actorUserId: ADMIN_ID, bookId: BOOK_ID }),
      ).rejects.toBeInstanceOf(BookNotFoundError);
    });

    // O livro é carregado ANTES do membership: um livro inexistente é 404
    // mesmo para quem não é membro de nada — não dá para sondar a existência
    // de um livro pelo erro que volta.
    it('throws BookNotFoundError before looking at the membership', async () => {
      await expect(
        run({ actorUserId: 'user-nobody', bookId: 'book-ghost' }),
      ).rejects.toBeInstanceOf(BookNotFoundError);
    });
  });

  describe('the membership has to be active', () => {
    it('throws NotAMemberError when there is no membership', async () => {
      await expect(
        run({ actorUserId: 'user-nobody', bookId: BOOK_ID }),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    it('throws NotAMemberError when the membership is archived', async () => {
      await memberships.save(
        aMembership({
          userId: MEMBER_ID,
          clubId: CLUB_ID,
          role: 'MEMBER',
          status: 'ARCHIVED',
        }),
      );

      await expect(
        run({ actorUserId: MEMBER_ID, bookId: BOOK_ID }),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });
  });

  describe('requireRole', () => {
    it('throws ForbiddenRoleError when the role is not allowed', async () => {
      await expect(
        run({
          actorUserId: MEMBER_ID,
          bookId: BOOK_ID,
          requireRole: ADMIN_ROLES,
        }),
      ).rejects.toBeInstanceOf(ForbiddenRoleError);
    });

    it('returns the book when the role is allowed', async () => {
      const book = await run({
        actorUserId: ADMIN_ID,
        bookId: BOOK_ID,
        requireRole: ADMIN_ROLES,
      });

      expect(book.id).toBe(BOOK_ID);
    });

    // Sem `requireRole`, basta membership ativo — é o caminho da LEITURA
    // (`listBooks`, `getBookWithPlan`): o livro é do grupo.
    it('lets a MEMBER through when no role is required', async () => {
      await expect(
        run({ actorUserId: MEMBER_ID, bookId: BOOK_ID }),
      ).resolves.toMatchObject({ id: BOOK_ID });
    });

    it('lets a MEMBER through when the required roles include MEMBER', async () => {
      await expect(
        run({
          actorUserId: MEMBER_ID,
          bookId: BOOK_ID,
          requireRole: MEMBER_ROLES,
        }),
      ).resolves.toMatchObject({ id: BOOK_ID });
    });

    // O papel exigido não vira 404: quem está no clube sem o papel recebe 403,
    // e é essa fronteira que separa "não existe para você" de "você não pode".
    it('separates a missing membership from an insufficient role', async () => {
      await expect(
        run({
          actorUserId: OUTSIDER_ID,
          bookId: BOOK_ID,
          requireRole: ADMIN_ROLES,
        }),
      ).rejects.toBeInstanceOf(NotAMemberError);

      await expect(
        run({
          actorUserId: MEMBER_ID,
          bookId: BOOK_ID,
          requireRole: ADMIN_ROLES,
        }),
      ).rejects.toBeInstanceOf(ForbiddenRoleError);
    });
  });

  // O CORTE DE TENANT, afirmado no guard e não só nos chamadores.
  describe('the club comes from book.clubId', () => {
    it('rejects a member of another club, however senior', async () => {
      await expect(
        run({ actorUserId: OUTSIDER_ID, bookId: BOOK_ID }),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    // O sentido NEGATIVO do contrabando: mandar o clubId "certo" não abre a
    // porta. Se o guard lesse o clube do input, o membership do OUTSIDER em
    // club-2 casaria e ele leria um livro de club-1.
    it('ignores a clubId key in the input when it would grant access', async () => {
      const smuggled = {
        actorUserId: OUTSIDER_ID,
        bookId: BOOK_ID,
        // @ts-expect-error o input não declara clubId — ele vem de book.clubId
        clubId: OTHER_CLUB_ID,
      } satisfies BookForActorInput;

      await expect(run(smuggled)).rejects.toBeInstanceOf(NotAMemberError);
    });

    // ...e o sentido POSITIVO, que é o que mata a mutação de verdade: o ADMIN
    // é membro só de club-1, e o input aponta para club-2. Se o guard lesse o
    // clube do input, isto viraria NotAMemberError em vez de devolver o livro.
    it('ignores a clubId key in the input when it would deny access', async () => {
      const smuggled = {
        actorUserId: ADMIN_ID,
        bookId: BOOK_ID,
        requireRole: ADMIN_ROLES,
        // @ts-expect-error o input não declara clubId — ele vem de book.clubId
        clubId: OTHER_CLUB_ID,
      } satisfies BookForActorInput;

      const book = await run(smuggled);

      expect(book.id).toBe(BOOK_ID);
      expect(book.clubId).toBe(CLUB_ID);
    });

    // Dois livros, dois clubes, um ator: o guard tem de olhar o clube do
    // livro PEDIDO, não o único clube em que o ator está.
    it('resolves the club per book, not per actor', async () => {
      await books.save(aBook({ id: 'book-2', clubId: OTHER_CLUB_ID }));

      await expect(
        run({ actorUserId: ADMIN_ID, bookId: BOOK_ID }),
      ).resolves.toMatchObject({ clubId: CLUB_ID });
      await expect(
        run({ actorUserId: ADMIN_ID, bookId: 'book-2' }),
      ).rejects.toBeInstanceOf(NotAMemberError);
      await expect(
        run({ actorUserId: OUTSIDER_ID, bookId: 'book-2' }),
      ).resolves.toMatchObject({ clubId: OTHER_CLUB_ID });
    });
  });

  // O guard não escreve: ele só lê o livro e o membership.
  it('writes nothing', async () => {
    const before = books.saved;

    await run({ actorUserId: ADMIN_ID, bookId: BOOK_ID });

    expect(books.saved).toEqual(before);
    expect(books.updateCalls).toBe(0);
  });
});
