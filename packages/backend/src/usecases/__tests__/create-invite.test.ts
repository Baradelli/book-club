import { beforeEach, describe, expect, it } from 'vitest';

import type { MemberRole } from '../../domain/club';
import {
  ClubNotFoundError,
  ForbiddenRoleError,
  InvalidInviteError,
  NotAMemberError,
} from '../../domain/errors';
import { DEFAULT_INVITE_TTL_DAYS } from '../../domain/invite';
import {
  aClub,
  aMembership,
  anInvite,
  required,
} from '../../test-support/builders';
import { ClubRepositoryFake } from '../_fakes/club-repository-fake';
import { CodeGeneratorFake } from '../_fakes/code-generator-fake';
import { InviteRepositoryFake } from '../_fakes/invite-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { AssertMembership } from '../assert-membership';
import { CreateInvite } from '../create-invite';

const CLUB_ID = 'club-1';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('CreateInvite', () => {
  let clubs: ClubRepositoryFake;
  let memberships: MembershipRepositoryFake;
  let invites: InviteRepositoryFake;
  let codes: CodeGeneratorFake;
  let useCase: CreateInvite;

  function makeUseCase(generator: CodeGeneratorFake): CreateInvite {
    // A regra de papel vem do assertMembership da Tarefa 01, não de uma
    // segunda implementação aqui dentro.
    return new CreateInvite(
      new AssertMembership(memberships),
      clubs,
      invites,
      generator,
    );
  }

  beforeEach(async () => {
    clubs = new ClubRepositoryFake();
    memberships = new MembershipRepositoryFake();
    invites = new InviteRepositoryFake();
    codes = new CodeGeneratorFake();
    useCase = makeUseCase(codes);

    await clubs.save(aClub());
    await memberships.save(aMembership({ userId: OWNER_ID, role: 'OWNER' }));
    await memberships.save(aMembership({ userId: ADMIN_ID, role: 'ADMIN' }));
    await memberships.save(aMembership({ userId: MEMBER_ID, role: 'MEMBER' }));
  });

  // Regras 6 (caminho felizes) e 7
  it('creates an invite with the default values and persists it', async () => {
    const before = Date.now();

    const invite = await useCase.execute({
      actorUserId: ADMIN_ID,
      clubId: CLUB_ID,
    });

    expect(invite.id).toEqual(expect.any(String));
    expect(invite.clubId).toBe(CLUB_ID);
    expect(invite.code).toBe('code-1');
    expect(invite.role).toBe('MEMBER');
    expect(invite.createdById).toBe(ADMIN_ID);
    expect(invite.usedAt).toBeNull();
    expect(invite.usedById).toBeNull();
    expect(invite.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(invites.saved).toHaveLength(1);
    expect(required(invites.saved[0])).toEqual(invite);
  });

  // Regra 5
  it('defaults the TTL to DEFAULT_INVITE_TTL_DAYS', async () => {
    const invite = await useCase.execute({
      actorUserId: ADMIN_ID,
      clubId: CLUB_ID,
    });

    expect(invite.expiresAt.getTime() - invite.createdAt.getTime()).toBe(
      DEFAULT_INVITE_TTL_DAYS * DAY_MS,
    );
  });

  // Regra 5
  it('honours the given TTL', async () => {
    const invite = await useCase.execute({
      actorUserId: ADMIN_ID,
      clubId: CLUB_ID,
      ttlDays: 3,
    });

    expect(invite.expiresAt.getTime() - invite.createdAt.getTime()).toBe(
      3 * DAY_MS,
    );
  });

  it('creates an ADMIN invite when the actor is the OWNER', async () => {
    const invite = await useCase.execute({
      actorUserId: OWNER_ID,
      clubId: CLUB_ID,
      role: 'ADMIN',
    });

    expect(invite.role).toBe('ADMIN');
  });

  // Regra 1
  it('rejects a club that does not exist', async () => {
    await expect(
      useCase.execute({ actorUserId: ADMIN_ID, clubId: 'club-ghost' }),
    ).rejects.toBeInstanceOf(ClubNotFoundError);

    expect(invites.saved).toHaveLength(0);
  });

  // Regra 1
  it('rejects an archived club', async () => {
    await clubs.save(
      aClub({ status: 'ARCHIVED', archivedAt: new Date('2026-02-01') }),
    );

    await expect(
      useCase.execute({ actorUserId: ADMIN_ID, clubId: CLUB_ID }),
    ).rejects.toBeInstanceOf(ClubNotFoundError);

    expect(invites.saved).toHaveLength(0);
  });

  // Regra 2 — via assertMembership (404 na borda).
  it('rejects an actor without an active membership', async () => {
    await expect(
      useCase.execute({ actorUserId: 'user-outsider', clubId: CLUB_ID }),
    ).rejects.toBeInstanceOf(NotAMemberError);

    expect(invites.saved).toHaveLength(0);
  });

  // Regra 2 — via assertMembership com ADMIN_ROLES (403 na borda).
  it('rejects an actor whose role is MEMBER', async () => {
    await expect(
      useCase.execute({ actorUserId: MEMBER_ID, clubId: CLUB_ID }),
    ).rejects.toBeInstanceOf(ForbiddenRoleError);

    expect(invites.saved).toHaveLength(0);
  });

  // Regra 2 — membership arquivado não vale.
  it('rejects an actor whose membership is archived', async () => {
    await memberships.save(
      aMembership({ userId: ADMIN_ID, role: 'ADMIN', status: 'ARCHIVED' }),
    );

    await expect(
      useCase.execute({ actorUserId: ADMIN_ID, clubId: CLUB_ID }),
    ).rejects.toBeInstanceOf(NotAMemberError);

    expect(invites.saved).toHaveLength(0);
  });

  // Regra 3 — convite nunca carrega OWNER.
  it('refuses to invite as OWNER', async () => {
    await expect(
      useCase.execute({
        actorUserId: OWNER_ID,
        clubId: CLUB_ID,
        role: 'OWNER',
      }),
    ).rejects.toBeInstanceOf(InvalidInviteError);

    expect(invites.saved).toHaveLength(0);
  });

  // Regra 4 — valor fora do enum chegando em runtime.
  it('rejects a role outside MEMBER_ROLES', async () => {
    const role = 'GUEST' as unknown as MemberRole;

    await expect(
      useCase.execute({ actorUserId: ADMIN_ID, clubId: CLUB_ID, role }),
    ).rejects.toBeInstanceOf(InvalidInviteError);

    expect(invites.saved).toHaveLength(0);
  });

  // Regra 5
  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
  ])('rejects a %s ttlDays', async (_label, ttlDays) => {
    await expect(
      useCase.execute({ actorUserId: ADMIN_ID, clubId: CLUB_ID, ttlDays }),
    ).rejects.toBeInstanceOf(InvalidInviteError);

    expect(invites.saved).toHaveLength(0);
  });

  // Regra 6
  describe('code collision', () => {
    it('retries with a new code when the first one already exists', async () => {
      await invites.save(anInvite({ code: 'code-1', clubId: CLUB_ID }));
      useCase = makeUseCase(new CodeGeneratorFake(['code-1', 'code-2']));

      const invite = await useCase.execute({
        actorUserId: ADMIN_ID,
        clubId: CLUB_ID,
      });

      expect(invite.code).toBe('code-2');
      expect(required(await invites.byCode('code-2')).id).toBe(invite.id);
    });

    it('gives up after 5 attempts when every code collides', async () => {
      const generator = new CodeGeneratorFake([
        'dup',
        'dup',
        'dup',
        'dup',
        'dup',
        'free',
      ]);
      await invites.save(anInvite({ code: 'dup', clubId: CLUB_ID }));
      useCase = makeUseCase(generator);

      await expect(
        useCase.execute({ actorUserId: ADMIN_ID, clubId: CLUB_ID }),
      ).rejects.toBeInstanceOf(InvalidInviteError);

      expect(generator.calls).toBe(5);
      expect(invites.saved).toHaveLength(1);
    });
  });
});
