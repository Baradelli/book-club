import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { required } from '../../test-support/builders';
import { PrismaUserRepository } from '../prisma-user-repository';
import { prisma, removeFixtures, testEmail, testId } from './_db';

const USER_ID = testId('user');
const DUPLICATE_ID = testId('user-dup');
const EMAIL = testEmail('maria');

describe('PrismaUserRepository (contract)', () => {
  const repo = new PrismaUserRepository(prisma);

  beforeAll(async () => {
    await removeFixtures({ userIds: [USER_ID, DUPLICATE_ID] });
  });

  afterAll(async () => {
    await removeFixtures({ userIds: [USER_ID, DUPLICATE_ID] });
    await prisma.$disconnect();
  });

  it('saves a user and reads it back by id and by email', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    await repo.save({
      id: USER_ID,
      email: EMAIL,
      name: 'Maria',
      passwordHash: 'hashed:senha',
      isSuperAdmin: false,
      createdAt,
    });

    const byId = required(await repo.byId(USER_ID));
    expect(byId.email).toBe(EMAIL);
    expect(byId.name).toBe('Maria');
    expect(byId.passwordHash).toBe('hashed:senha');
    expect(byId.isSuperAdmin).toBe(false);
    expect(byId.createdAt).toEqual(createdAt);

    const byEmail = required(await repo.byEmail(EMAIL));
    expect(byEmail.id).toBe(USER_ID);
  });

  // O repositório NÃO normaliza: normalizar é domínio (normalizeEmail).
  it('does not normalize the email it receives', async () => {
    await expect(repo.byEmail(EMAIL.toUpperCase())).resolves.toBeNull();
  });

  it('refuses a second user with the same email', async () => {
    await expect(
      repo.save({
        id: DUPLICATE_ID,
        email: EMAIL,
        name: 'Outra',
        passwordHash: null,
        isSuperAdmin: false,
        createdAt: new Date(),
      }),
    ).rejects.toThrow();

    await expect(prisma.user.count({ where: { email: EMAIL } })).resolves.toBe(
      1,
    );
  });

  it('update changes only the fields present in the patch', async () => {
    const before = required(await repo.byId(USER_ID));

    const updated = await repo.update(USER_ID, {
      passwordHash: 'hashed:nova',
    });

    expect(updated.passwordHash).toBe('hashed:nova');
    expect(updated.name).toBe(before.name);
    expect(updated.email).toBe(before.email);
    expect(updated.isSuperAdmin).toBe(before.isSuperAdmin);
    expect(updated.createdAt).toEqual(before.createdAt);
  });

  it('update can write a null over an existing value', async () => {
    const updated = await repo.update(USER_ID, { name: null });

    expect(updated.name).toBeNull();
    expect(updated.email).toBe(EMAIL);
  });

  // Equivalência com o fake, que também rejeita (erro de contrato do fake).
  it('update rejects an id that does not exist', async () => {
    await expect(
      repo.update(testId('user-ghost'), { name: 'Ninguem' }),
    ).rejects.toThrow();
  });

  it('returns null for ids and emails that do not exist', async () => {
    await expect(repo.byId(testId('ghost'))).resolves.toBeNull();
    await expect(repo.byEmail(testEmail('ghost'))).resolves.toBeNull();
  });
});
