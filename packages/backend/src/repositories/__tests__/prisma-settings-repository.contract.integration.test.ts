import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { required } from '../../test-support/builders';
import { PrismaSettingsRepository } from '../prisma-settings-repository';
import {
  prefixedEmail,
  prefixedId,
  prisma,
  removeFixtures,
  setupTestUser,
  testId,
} from './_db';

const USER_ID = testId('user');
const SETTINGS_ID = testId('settings');
const DUPLICATE_ID = testId('settings-dup');

/**
 * ⚠️ **Os fixtures do `find` são da Tarefa 37, com prefixo próprio (`t37`).**
 *
 * Eles são separados dos de cima porque o `find({ reminderEnabled })` varre a
 * tabela INTEIRA — inclusive as preferências reais do dono, que vivem neste
 * banco de desenvolvimento. Por isso as asserções abaixo são de **contenção**
 * (`arrayContaining` / `not.toContain`), nunca de igualdade: um `toEqual` aqui
 * quebraria no dia em que o dono ligasse o lembrete dele, e o vermelho não teria
 * nada a ver com o repositório.
 */
const WANTS_ID = prefixedId('t37', 'settings-wants');
const DOES_NOT_WANT_ID = prefixedId('t37', 'settings-nope');
const FIND_USER_IDS = [WANTS_ID, DOES_NOT_WANT_ID] as const;

describe('PrismaSettingsRepository (contract)', () => {
  const repo = new PrismaSettingsRepository(prisma);

  beforeAll(async () => {
    await setupTestUser(USER_ID);
  });

  afterAll(async () => {
    // ⚠️ A limpeza CONSULTA O BANCO (§6.6): o `Settings` dos usuários do `find`
    // é criado por id conhecido, mas quem garante que nada sobrou de uma
    // execução interrompida é a pergunta feita ao banco, não a lista.
    const strays = await prisma.settings.findMany({
      where: { userId: { in: [...FIND_USER_IDS] } },
      select: { id: true },
    });
    await removeFixtures({
      settingsIds: [SETTINGS_ID, DUPLICATE_ID, ...strays.map((row) => row.id)],
      userIds: [USER_ID, ...FIND_USER_IDS],
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

  /**
   * ⚠️ **O `find` DA TAREFA 37 — a varredura de quem pediu para ser lembrado
   * (decisão C), contra o Postgres.**
   *
   * O port cresceu junto com esta implementação, na MESMA unidade (§6.9).
   */
  describe('find({ reminderEnabled })', () => {
    beforeAll(async () => {
      for (const [id, label, reminderEnabled] of [
        [WANTS_ID, 'wants', true],
        [DOES_NOT_WANT_ID, 'nope', false],
      ] as const) {
        await prisma.user.upsert({
          where: { id },
          create: {
            id,
            email: prefixedEmail('t37', `settings-${label}`),
            name: 'Fixture Reader',
          },
          update: {},
        });
        await repo.save({
          id: `${id}-settings`,
          userId: id,
          timezone: 'America/Sao_Paulo',
          locale: 'pt',
          reminderTime: '21:00',
          reminderEnabled,
          notifyGroupActivity: true,
        });
      }
    });

    it('brings the person who asked to be reminded, and not the one who did not', async () => {
      const found = await repo.find({ reminderEnabled: true });
      const userIds = found.map((row) => row.userId);

      expect(userIds).toContain(WANTS_ID);
      expect(userIds).not.toContain(DOES_NOT_WANT_ID);
      // E a linha volta inteira, não só o id: é o `toDomain` sendo exercitado
      // por este caminho também.
      expect(found.find((row) => row.userId === WANTS_ID)).toEqual({
        id: `${WANTS_ID}-settings`,
        userId: WANTS_ID,
        timezone: 'America/Sao_Paulo',
        locale: 'pt',
        reminderTime: '21:00',
        reminderEnabled: true,
        notifyGroupActivity: true,
      });
    });

    /**
     * O OUTRO lado, e ele é o que impede "traz todo mundo" de passar: um
     * `where` que o Prisma ignorasse deixaria o teste acima verde.
     */
    it('brings the person who turned it off when asked for false', async () => {
      const userIds = (await repo.find({ reminderEnabled: false })).map(
        (row) => row.userId,
      );

      expect(userIds).toContain(DOES_NOT_WANT_ID);
      expect(userIds).not.toContain(WANTS_ID);
    });
  });
});
