import { beforeEach, describe, expect, it } from 'vitest';

import type { MemberRole } from '../../domain/club';
import { ADMIN_ROLES } from '../../domain/club';
import { ForbiddenRoleError, NotAMemberError } from '../../domain/errors';
import { aMembership } from '../../test-support/builders';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { AssertMembership } from '../assert-membership';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';

describe('AssertMembership', () => {
  let memberships: MembershipRepositoryFake;
  let useCase: AssertMembership;

  beforeEach(() => {
    memberships = new MembershipRepositoryFake();
    useCase = new AssertMembership(memberships);
  });

  // Regra 16
  it('returns the active membership when no role is required', async () => {
    const stored = aMembership({ userId: 'user-1', role: 'MEMBER' });
    await memberships.save(stored);

    const membership = await useCase.execute({
      userId: 'user-1',
      clubId: CLUB_ID,
    });

    expect(membership).toEqual(stored);
  });

  // Regra 15
  it('rejects a user without any membership', async () => {
    await expect(
      useCase.execute({ userId: 'user-outsider', clubId: CLUB_ID }),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });

  // Regra 15 — corte de tenant: membro de outro clube não enxerga este.
  it('rejects a user whose membership is in another club', async () => {
    await memberships.save(aMembership({ userId: 'user-1', clubId: CLUB_ID }));

    await expect(
      useCase.execute({ userId: 'user-1', clubId: OTHER_CLUB_ID }),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });

  // Regra 15
  it('rejects an archived membership', async () => {
    await memberships.save(
      aMembership({ userId: 'user-1', status: 'ARCHIVED' }),
    );

    await expect(
      useCase.execute({ userId: 'user-1', clubId: CLUB_ID }),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });

  // Regra 18
  it('returns the membership when the ADMIN role is required and met', async () => {
    const stored = aMembership({ userId: 'user-admin', role: 'ADMIN' });
    await memberships.save(stored);

    const membership = await useCase.execute({
      userId: 'user-admin',
      clubId: CLUB_ID,
      requireRole: ADMIN_ROLES,
    });

    expect(membership).toEqual(stored);
  });

  // Regra 18
  it('returns the membership when the actor is the OWNER', async () => {
    const stored = aMembership({ userId: 'user-owner', role: 'OWNER' });
    await memberships.save(stored);

    const membership = await useCase.execute({
      userId: 'user-owner',
      clubId: CLUB_ID,
      requireRole: ADMIN_ROLES,
    });

    expect(membership.role).toBe('OWNER');
    expect(membership).toEqual(stored);
  });

  // Regra 17 — está no clube, mas não tem o papel (403, não 404).
  it('rejects an active MEMBER when an admin role is required', async () => {
    await memberships.save(aMembership({ userId: 'user-1', role: 'MEMBER' }));

    await expect(
      useCase.execute({
        userId: 'user-1',
        clubId: CLUB_ID,
        requireRole: ADMIN_ROLES,
      }),
    ).rejects.toBeInstanceOf(ForbiddenRoleError);
  });

  // Regras 15 e 17 são erros distintos de propósito.
  it('tells NotAMemberError and ForbiddenRoleError apart', async () => {
    await memberships.save(aMembership({ userId: 'user-1', role: 'MEMBER' }));
    const ownerOnly: readonly MemberRole[] = ['OWNER'];

    await expect(
      useCase.execute({
        userId: 'user-1',
        clubId: CLUB_ID,
        requireRole: ownerOnly,
      }),
    ).rejects.not.toBeInstanceOf(NotAMemberError);
    await expect(
      useCase.execute({ userId: 'user-ghost', clubId: CLUB_ID }),
    ).rejects.not.toBeInstanceOf(ForbiddenRoleError);
  });
});
