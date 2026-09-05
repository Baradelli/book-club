import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { required } from '../../test-support/builders';
import { PrismaSettingsRepository } from '../prisma-settings-repository';
import { prisma, removeFixtures, setupTestUser, testId } from './_db';

const USER_ID = testId('user');
const SETTINGS_ID = testId('settings');
const DUPLICATE_ID = testId('settings-dup');

describe('PrismaSettingsRepository (contract)', () => {
  const repo = new PrismaSettingsRepository(prisma);

  beforeAll(async () => {
    await setupTestUser(USER_ID);
  });

  afterAll(async () => {
    await removeFixtures({
      settingsIds: [SETTINGS_ID, DUPLICATE_ID],
      userIds: [USER_ID],
    });
    await prisma.$disconnect();
  });

  it('saves settings and reads them back by user', async () => {
    await repo.save({
      id: SETTINGS_ID,
      userId: USER_ID,
      timezone: 'America/Sao_Paulo',
      locale: 'pt',
      reminderTime: '21:00',
      reminderEnabled: true,
      notifyGroupActivity: true,
    });

    const read = required(await repo.byUserId(USER_ID));
    expect(read.id).toBe(SETTINGS_ID);
    expect(read.timezone).toBe('America/Sao_Paulo');
    expect(read.locale).toBe('pt');
    expect(read.reminderTime).toBe('21:00');
    expect(read.reminderEnabled).toBe(true);
    expect(read.notifyGroupActivity).toBe(true);
  });

  it('refuses a second settings row for the same user', async () => {
    await expect(
      repo.save({
        id: DUPLICATE_ID,
        userId: USER_ID,
        timezone: 'Europe/Lisbon',
        locale: 'en',
        reminderTime: '08:00',
        reminderEnabled: false,
        notifyGroupActivity: false,
      }),
    ).rejects.toThrow();

    await expect(
      prisma.settings.count({ where: { userId: USER_ID } }),
    ).resolves.toBe(1);
  });

  it('upserts by id: the same id updates in place', async () => {
    await repo.save({
      id: SETTINGS_ID,
      userId: USER_ID,
      timezone: 'Europe/Lisbon',
      locale: 'en',
      reminderTime: '07:30',
      reminderEnabled: false,
      notifyGroupActivity: false,
    });

    const read = required(await repo.byUserId(USER_ID));
    expect(read.timezone).toBe('Europe/Lisbon');
    expect(read.locale).toBe('en');
    expect(read.reminderTime).toBe('07:30');
    expect(read.reminderEnabled).toBe(false);
    await expect(
      prisma.settings.count({ where: { userId: USER_ID } }),
    ).resolves.toBe(1);
  });

  it('returns null when the user has no settings', async () => {
    await expect(repo.byUserId(testId('user-ghost'))).resolves.toBeNull();
  });
});
