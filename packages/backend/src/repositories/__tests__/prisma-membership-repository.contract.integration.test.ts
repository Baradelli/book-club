import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { required } from '../../test-support/builders';
import { PrismaMembershipRepository } from '../prisma-membership-repository';
import { prisma, removeFixtures, setupTestUser, testId } from './_db';

const USER_ID = testId('user');
const CLUB_ID = testId('club');
const MEMBERSHIP_ID = testId('membership');
const DUPLICATE_ID = testId('membership-dup');

describe('PrismaMembershipRepository (contract)', () => {
  const repo = new PrismaMembershipRepository(prisma);

  beforeAll(async () => {
    await setupTestUser(USER_ID);
    await prisma.club.upsert({
      where: { id: CLUB_ID },
      create: { id: CLUB_ID, name: 'Clube Fixture' },
      update: {},
    });
  });

  afterAll(async () => {
    await removeFixtures({
      membershipIds: [MEMBERSHIP_ID, DUPLICATE_ID],
      clubIds: [CLUB_ID],
      userIds: [USER_ID],
    });
    await prisma.$disconnect();
  });

  it('saves a membership and finds it by user and club', async () => {
    const joinedAt = new Date('2026-01-01T00:00:00.000Z');

    await repo.save({
      id: MEMBERSHIP_ID,
      userId: USER_ID,
      clubId: CLUB_ID,
      role: 'OWNER',
      status: 'ACTIVE',
      joinedAt,
    });

    const read = required(await repo.byUserAndClub(USER_ID, CLUB_ID));
    expect(read.id).toBe(MEMBERSHIP_ID);
    expect(read.role).toBe('OWNER');
    expect(read.status).toBe('ACTIVE');
    expect(read.joinedAt).toEqual(joinedAt);
  });

  // É este teste que justifica a fatia: pega o @@unique esquecido.
  it('refuses a second membership for the same (user, club) with a different id', async () => {
    await expect(
      repo.save({
        id: DUPLICATE_ID,
        userId: USER_ID,
        clubId: CLUB_ID,
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: new Date(),
      }),
    ).rejects.toThrow();

    await expect(
      prisma.membership.count({ where: { userId: USER_ID, clubId: CLUB_ID } }),
    ).resolves.toBe(1);
  });

  // Reativação/arquivamento da regra 12 da Tarefa 01: mesmo id, sem método novo.
  it('upserts by id: the same id changes status and role in place', async () => {
    const archivedAt = new Date('2026-03-01T00:00:00.000Z');

    await repo.save({
      id: MEMBERSHIP_ID,
      userId: USER_ID,
      clubId: CLUB_ID,
      role: 'ADMIN',
      status: 'ARCHIVED',
      joinedAt: archivedAt,
    });

    const read = required(await repo.byUserAndClub(USER_ID, CLUB_ID));
    expect(read.id).toBe(MEMBERSHIP_ID);
    expect(read.status).toBe('ARCHIVED');
    expect(read.role).toBe('ADMIN');
    expect(read.joinedAt).toEqual(archivedAt);
    await expect(
      prisma.membership.count({ where: { userId: USER_ID, clubId: CLUB_ID } }),
    ).resolves.toBe(1);
  });

  describe('findByUser', () => {
    const OTHER_CLUB_ID = testId('club-other');
    const OTHER_MEMBERSHIP_ID = testId('membership-other');

    beforeAll(async () => {
      // Fixture ARCHIVED criado AQUI, explicitamente: antes ele dependia de
      // um teste anterior ter deixado MEMBERSHIP_ID arquivado, e rodar este
      // describe isolado (-t "findByUser") não exercitava o filtro.
      await prisma.membership.upsert({
        where: { id: MEMBERSHIP_ID },
        create: {
          id: MEMBERSHIP_ID,
          userId: USER_ID,
          clubId: CLUB_ID,
          role: 'ADMIN',
          status: 'ARCHIVED',
        },
        update: { status: 'ARCHIVED' },
      });

      await prisma.club.upsert({
        where: { id: OTHER_CLUB_ID },
        create: { id: OTHER_CLUB_ID, name: 'Outro Clube Fixture' },
        update: {},
      });
      await prisma.membership.upsert({
        where: { id: OTHER_MEMBERSHIP_ID },
        create: {
          id: OTHER_MEMBERSHIP_ID,
          userId: USER_ID,
          clubId: OTHER_CLUB_ID,
          role: 'MEMBER',
          status: 'ACTIVE',
        },
        update: {},
      });
    });

    afterAll(async () => {
      await removeFixtures({
        membershipIds: [OTHER_MEMBERSHIP_ID],
        clubIds: [OTHER_CLUB_ID],
      });
    });

    it('returns only the ACTIVE memberships of the user', async () => {
      const found = await repo.findByUser(USER_ID);

      expect(found.map((m) => m.clubId)).toEqual([OTHER_CLUB_ID]);
      expect(found.every((m) => m.status === 'ACTIVE')).toBe(true);
      expect(required(found[0]).joinedAt).toBeInstanceOf(Date);
    });

    it('returns an empty array for a user with no membership', async () => {
      await expect(repo.findByUser(testId('user-ghost'))).resolves.toEqual([]);
    });
  });

  it('returns null when the pair has no membership', async () => {
    await expect(
      repo.byUserAndClub(USER_ID, testId('club-ghost')),
    ).resolves.toBeNull();
  });
});
