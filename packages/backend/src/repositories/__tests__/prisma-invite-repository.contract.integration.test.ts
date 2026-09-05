import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { required } from '../../test-support/builders';
import { PrismaInviteRepository } from '../prisma-invite-repository';
import { prisma, removeFixtures, setupTestUser, testId } from './_db';

const USER_ID = testId('user');
const CLUB_ID = testId('club');
const INVITE_ID = testId('invite');
const DUPLICATE_ID = testId('invite-dup');
const CODE = `T03${testId('code').slice(-8).toUpperCase()}`;

describe('PrismaInviteRepository (contract)', () => {
  const repo = new PrismaInviteRepository(prisma);

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
      inviteIds: [INVITE_ID, DUPLICATE_ID],
      clubIds: [CLUB_ID],
      userIds: [USER_ID],
    });
    await prisma.$disconnect();
  });

  it('saves an invite and reads it back by code', async () => {
    const expiresAt = new Date('2026-01-08T00:00:00.000Z');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    await repo.save({
      id: INVITE_ID,
      clubId: CLUB_ID,
      code: CODE,
      role: 'ADMIN',
      createdById: USER_ID,
      expiresAt,
      usedAt: null,
      usedById: null,
      createdAt,
    });

    const read = required(await repo.byCode(CODE));
    expect(read.id).toBe(INVITE_ID);
    expect(read.clubId).toBe(CLUB_ID);
    expect(read.role).toBe('ADMIN');
    expect(read.createdById).toBe(USER_ID);
    expect(read.expiresAt).toEqual(expiresAt);
    expect(read.createdAt).toEqual(createdAt);
    expect(read.usedAt).toBeNull();
    expect(read.usedById).toBeNull();
  });

  it('returns null for a code that does not exist', async () => {
    await expect(repo.byCode('CODIGO-QUE-NAO-EXISTE')).resolves.toBeNull();
  });

  it('refuses a second invite with the same code', async () => {
    await expect(
      repo.save({
        id: DUPLICATE_ID,
        clubId: CLUB_ID,
        code: CODE,
        role: 'MEMBER',
        createdById: USER_ID,
        expiresAt: new Date('2026-02-01T00:00:00.000Z'),
        usedAt: null,
        usedById: null,
        createdAt: new Date(),
      }),
    ).rejects.toThrow();

    await expect(prisma.invite.count({ where: { code: CODE } })).resolves.toBe(
      1,
    );
  });

  it('update marks the invite as used and leaves the other fields alone', async () => {
    const before = required(await repo.byCode(CODE));
    const usedAt = new Date('2026-01-05T00:00:00.000Z');

    const updated = await repo.update(INVITE_ID, {
      usedAt,
      usedById: USER_ID,
    });

    expect(updated.usedAt).toEqual(usedAt);
    expect(updated.usedById).toBe(USER_ID);
    expect(updated.code).toBe(before.code);
    expect(updated.role).toBe(before.role);
    expect(updated.expiresAt).toEqual(before.expiresAt);
    expect(updated.createdAt).toEqual(before.createdAt);
  });

  // O ramo `usedById === null -> { disconnect: true }` do mapeador de update.
  it('update can clear usedAt and usedById back to null', async () => {
    const before = required(await repo.byCode(CODE));

    const updated = await repo.update(INVITE_ID, {
      usedAt: null,
      usedById: null,
    });

    expect(updated.usedAt).toBeNull();
    expect(updated.usedById).toBeNull();
    expect(updated.code).toBe(before.code);
    expect(updated.clubId).toBe(before.clubId);
    expect(updated.createdById).toBe(before.createdById);
  });

  // Equivalência com o fake, que também rejeita (erro de contrato do fake).
  it('update rejects an id that does not exist', async () => {
    await expect(
      repo.update(testId('invite-ghost'), { usedById: USER_ID }),
    ).rejects.toThrow();
  });
});
