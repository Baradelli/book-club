import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_TIMEZONE } from '../../domain/club';
import { InvalidClubError, NotSuperAdminError } from '../../domain/errors';
import { aUser } from '../../test-support/builders';
import { ClubRepositoryFake } from '../_fakes/club-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { UserRepositoryFake } from '../_fakes/user-repository-fake';
import { CreateClub } from '../create-club';

const SUPER_ADMIN_ID = 'user-super-admin';
const PLAIN_USER_ID = 'user-plain';

describe('CreateClub', () => {
  let users: UserRepositoryFake;
  let clubs: ClubRepositoryFake;
  let memberships: MembershipRepositoryFake;
  let useCase: CreateClub;

  beforeEach(async () => {
    users = new UserRepositoryFake();
    clubs = new ClubRepositoryFake();
    memberships = new MembershipRepositoryFake();
    useCase = new CreateClub(users, clubs, memberships);

    await users.save(
      aUser({
        id: SUPER_ADMIN_ID,
        email: 'admin@exemplo.com',
        isSuperAdmin: true,
      }),
    );
    await users.save(
      aUser({
        id: PLAIN_USER_ID,
        email: 'plain@exemplo.com',
        isSuperAdmin: false,
      }),
    );
  });

  // Regras 4 e 6
  it('creates a club with the default values and persists it', async () => {
    const before = Date.now();

    const { club } = await useCase.execute({
      actorUserId: SUPER_ADMIN_ID,
      name: 'Clube do Casal',
    });

    expect(club.id).toEqual(expect.any(String));
    expect(club.id.length).toBeGreaterThan(0);
    expect(club.name).toBe('Clube do Casal');
    expect(club.status).toBe('ACTIVE');
    expect(club.archivedAt).toBeNull();
    expect(club.createdAt).toBeInstanceOf(Date);
    expect(club.createdAt.getTime()).toBeGreaterThanOrEqual(before);

    expect(clubs.saved).toHaveLength(1);
    expect(clubs.saved[0]).toEqual(club);
  });

  // Regras 5 e 6
  it("creates the owner's membership as OWNER and persists it", async () => {
    const { club, ownerMembership } = await useCase.execute({
      actorUserId: SUPER_ADMIN_ID,
      name: 'Clube do Casal',
    });

    expect(ownerMembership.id).toEqual(expect.any(String));
    expect(ownerMembership.userId).toBe(SUPER_ADMIN_ID);
    expect(ownerMembership.clubId).toBe(club.id);
    expect(ownerMembership.role).toBe('OWNER');
    expect(ownerMembership.status).toBe('ACTIVE');
    expect(ownerMembership.joinedAt).toBeInstanceOf(Date);

    expect(memberships.saved).toHaveLength(1);
    expect(memberships.saved[0]).toEqual(ownerMembership);
  });

  // Regra 5
  it('makes ownerUserId the OWNER when it is given, not the actor', async () => {
    const { ownerMembership } = await useCase.execute({
      actorUserId: SUPER_ADMIN_ID,
      name: 'Clube dos Amigos',
      ownerUserId: PLAIN_USER_ID,
    });

    expect(ownerMembership.userId).toBe(PLAIN_USER_ID);
    expect(ownerMembership.role).toBe('OWNER');
    // Só um OWNER: o ator não ganha membership junto.
    expect(memberships.saved).toHaveLength(1);
  });

  // Regra 1
  it('rejects an actor that does not exist', async () => {
    await expect(
      useCase.execute({ actorUserId: 'user-ghost', name: 'Clube do Casal' }),
    ).rejects.toBeInstanceOf(NotSuperAdminError);

    expect(clubs.saved).toHaveLength(0);
    expect(memberships.saved).toHaveLength(0);
  });

  // Regra 1
  it('rejects an actor that is not a super-admin', async () => {
    await expect(
      useCase.execute({ actorUserId: PLAIN_USER_ID, name: 'Clube do Casal' }),
    ).rejects.toBeInstanceOf(NotSuperAdminError);

    expect(clubs.saved).toHaveLength(0);
    expect(memberships.saved).toHaveLength(0);
  });

  // Regra 2
  it('rejects an empty name', async () => {
    await expect(
      useCase.execute({ actorUserId: SUPER_ADMIN_ID, name: '' }),
    ).rejects.toBeInstanceOf(InvalidClubError);
  });

  // Regra 2
  it('rejects a whitespace-only name', async () => {
    await expect(
      useCase.execute({ actorUserId: SUPER_ADMIN_ID, name: '   ' }),
    ).rejects.toBeInstanceOf(InvalidClubError);

    expect(clubs.saved).toHaveLength(0);
  });

  // Regra 2
  it('trims the name', async () => {
    const { club } = await useCase.execute({
      actorUserId: SUPER_ADMIN_ID,
      name: '  Clube do Casal  ',
    });

    expect(club.name).toBe('Clube do Casal');
  });

  // Regra 3
  it('falls back to the default timezone when none is given', async () => {
    const { club } = await useCase.execute({
      actorUserId: SUPER_ADMIN_ID,
      name: 'Clube do Casal',
    });

    expect(club.timezone).toBe(DEFAULT_TIMEZONE);
  });

  // Regra 3
  it('keeps the given timezone', async () => {
    const { club } = await useCase.execute({
      actorUserId: SUPER_ADMIN_ID,
      name: 'Clube do Casal',
      timezone: 'Europe/Lisbon',
    });

    expect(club.timezone).toBe('Europe/Lisbon');
  });

  // Regra 3
  it('rejects an empty timezone', async () => {
    await expect(
      useCase.execute({
        actorUserId: SUPER_ADMIN_ID,
        name: 'Clube do Casal',
        timezone: '',
      }),
    ).rejects.toBeInstanceOf(InvalidClubError);
  });

  // Regra 3 — o trim do timezone é o mesmo da regra 2 para o `name`.
  it('rejects a whitespace-only timezone', async () => {
    await expect(
      useCase.execute({
        actorUserId: SUPER_ADMIN_ID,
        name: 'Clube do Casal',
        timezone: '   ',
      }),
    ).rejects.toBeInstanceOf(InvalidClubError);

    expect(clubs.saved).toHaveLength(0);
  });

  // Regra 3
  it('trims the timezone', async () => {
    const { club } = await useCase.execute({
      actorUserId: SUPER_ADMIN_ID,
      name: 'Clube do Casal',
      timezone: '  Europe/Lisbon  ',
    });

    expect(club.timezone).toBe('Europe/Lisbon');
  });
});
