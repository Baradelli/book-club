import { beforeEach, describe, expect, it } from 'vitest';

import type { MemberRole } from '../../domain/club';
import {
  ClubNotFoundError,
  DuplicateMembershipError,
  ForbiddenRoleError,
  InvalidClubError,
  NotAMemberError,
} from '../../domain/errors';
import { aClub, aMembership } from '../../test-support/builders';
import { ClubRepositoryFake } from '../_fakes/club-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { AddMember } from '../add-member';

const CLUB_ID = 'club-1';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';
const NEWCOMER_ID = 'user-newcomer';

describe('AddMember', () => {
  let clubs: ClubRepositoryFake;
  let memberships: MembershipRepositoryFake;
  let useCase: AddMember;

  beforeEach(async () => {
    clubs = new ClubRepositoryFake();
    memberships = new MembershipRepositoryFake();
    useCase = new AddMember(clubs, memberships);

    await clubs.save(aClub());
    await memberships.save(aMembership({ userId: OWNER_ID, role: 'OWNER' }));
    await memberships.save(aMembership({ userId: ADMIN_ID, role: 'ADMIN' }));
    await memberships.save(aMembership({ userId: MEMBER_ID, role: 'MEMBER' }));
  });

  // Regra 14
  it('adds a MEMBER with the default values and persists it', async () => {
    const before = Date.now();

    const membership = await useCase.execute({
      actorUserId: ADMIN_ID,
      clubId: CLUB_ID,
      userId: NEWCOMER_ID,
    });

    expect(membership.id).toEqual(expect.any(String));
    expect(membership.userId).toBe(NEWCOMER_ID);
    expect(membership.clubId).toBe(CLUB_ID);
    expect(membership.role).toBe('MEMBER');
    expect(membership.status).toBe('ACTIVE');
    expect(membership.joinedAt.getTime()).toBeGreaterThanOrEqual(before);

    await expect(
      memberships.byUserAndClub(NEWCOMER_ID, CLUB_ID),
    ).resolves.toEqual(membership);
  });

  // Regra 14
  it('adds an ADMIN when the actor is the OWNER', async () => {
    const membership = await useCase.execute({
      actorUserId: OWNER_ID,
      clubId: CLUB_ID,
      userId: NEWCOMER_ID,
      role: 'ADMIN',
    });

    expect(membership.role).toBe('ADMIN');
    expect(membership.status).toBe('ACTIVE');
  });

  // Regra 7
  it('rejects a club that does not exist', async () => {
    const countBefore = memberships.saved.length;

    await expect(
      useCase.execute({
        actorUserId: ADMIN_ID,
        clubId: 'club-ghost',
        userId: NEWCOMER_ID,
      }),
    ).rejects.toBeInstanceOf(ClubNotFoundError);

    expect(memberships.saved).toHaveLength(countBefore);
  });

  // Regra 7
  it('rejects an archived club', async () => {
    await clubs.save(
      aClub({ status: 'ARCHIVED', archivedAt: new Date('2026-02-01') }),
    );
    const countBefore = memberships.saved.length;

    await expect(
      useCase.execute({
        actorUserId: ADMIN_ID,
        clubId: CLUB_ID,
        userId: NEWCOMER_ID,
      }),
    ).rejects.toBeInstanceOf(ClubNotFoundError);

    expect(memberships.saved).toHaveLength(countBefore);
  });

  // Regra 8 — sem membership o clube "não existe" para o ator (404 na borda).
  it('rejects an actor without a membership in the club', async () => {
    const countBefore = memberships.saved.length;

    await expect(
      useCase.execute({
        actorUserId: 'user-outsider',
        clubId: CLUB_ID,
        userId: NEWCOMER_ID,
      }),
    ).rejects.toBeInstanceOf(NotAMemberError);

    expect(memberships.saved).toHaveLength(countBefore);
  });

  // Regra 8
  it('rejects an actor whose membership is archived', async () => {
    await memberships.save(
      aMembership({ userId: ADMIN_ID, role: 'ADMIN', status: 'ARCHIVED' }),
    );
    const countBefore = memberships.saved.length;

    await expect(
      useCase.execute({
        actorUserId: ADMIN_ID,
        clubId: CLUB_ID,
        userId: NEWCOMER_ID,
      }),
    ).rejects.toBeInstanceOf(NotAMemberError);

    expect(memberships.saved).toHaveLength(countBefore);
  });

  // Regra 9 — está no clube, mas não tem o papel (403 na borda).
  it('rejects an actor whose role is MEMBER', async () => {
    const countBefore = memberships.saved.length;

    await expect(
      useCase.execute({
        actorUserId: MEMBER_ID,
        clubId: CLUB_ID,
        userId: NEWCOMER_ID,
      }),
    ).rejects.toBeInstanceOf(ForbiddenRoleError);

    expect(memberships.saved).toHaveLength(countBefore);
  });

  // Regra 10 — valor fora do enum chegando em runtime.
  it('rejects a role outside MEMBER_ROLES', async () => {
    const role = 'GUEST' as unknown as MemberRole;
    const countBefore = memberships.saved.length;

    await expect(
      useCase.execute({
        actorUserId: ADMIN_ID,
        clubId: CLUB_ID,
        userId: NEWCOMER_ID,
        role,
      }),
    ).rejects.toBeInstanceOf(InvalidClubError);

    expect(memberships.saved).toHaveLength(countBefore);
  });

  // Regra 13 — segundo dono só por transferência (MVP 4).
  it('refuses to add a second OWNER', async () => {
    const countBefore = memberships.saved.length;

    await expect(
      useCase.execute({
        actorUserId: OWNER_ID,
        clubId: CLUB_ID,
        userId: NEWCOMER_ID,
        role: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenRoleError);

    expect(memberships.saved).toHaveLength(countBefore);
  });

  // Regras 13 × 11 — precedência: a intenção proibida é rejeitada antes de
  // olhar o estado, então a resposta não muda conforme quem é o alvo.
  it('prefers ForbiddenRoleError over DuplicateMembershipError when adding an existing member as OWNER', async () => {
    const countBefore = memberships.saved.length;

    // `toBeInstanceOf` já é estritamente mais forte que a negativa: só
    // ForbiddenRoleError passa, DuplicateMembershipError não.
    await expect(
      useCase.execute({
        actorUserId: ADMIN_ID,
        clubId: CLUB_ID,
        userId: MEMBER_ID,
        role: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenRoleError);

    expect(memberships.saved).toHaveLength(countBefore);
  });

  // Regra 11
  it('rejects a user that already has an active membership', async () => {
    const countBefore = memberships.saved.length;

    await expect(
      useCase.execute({
        actorUserId: ADMIN_ID,
        clubId: CLUB_ID,
        userId: MEMBER_ID,
      }),
    ).rejects.toBeInstanceOf(DuplicateMembershipError);

    expect(memberships.saved).toHaveLength(countBefore);
  });

  // Regra 12 — o @@unique([userId, clubId]) não permite duplicar.
  it('reactivates an archived membership keeping the same id', async () => {
    await memberships.save(
      aMembership({
        id: 'membership-archived',
        userId: NEWCOMER_ID,
        role: 'MEMBER',
        status: 'ARCHIVED',
      }),
    );
    const countBefore = memberships.saved.length;
    const before = Date.now();

    const membership = await useCase.execute({
      actorUserId: ADMIN_ID,
      clubId: CLUB_ID,
      userId: NEWCOMER_ID,
      role: 'ADMIN',
    });

    expect(membership.id).toBe('membership-archived');
    expect(membership.status).toBe('ACTIVE');
    expect(membership.role).toBe('ADMIN');
    expect(membership.joinedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(memberships.saved).toHaveLength(countBefore);
  });
});
