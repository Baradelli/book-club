import { beforeEach, describe, expect, it } from 'vitest';

import { aSettings, required } from '../../../test-support/builders';
import { SettingsRepositoryFake } from '../settings-repository-fake';

// `Settings` não tem nenhum campo Date, então não há teste de clone de Date
// aqui: o spread já é cópia completa. Se um campo Date entrar, o clone precisa
// acompanhar (como nos outros fakes).
describe('SettingsRepositoryFake', () => {
  let settings: SettingsRepositoryFake;

  beforeEach(() => {
    settings = new SettingsRepositoryFake();
  });

  it('does not let the caller mutate the store through what it read', async () => {
    await settings.save(aSettings({ userId: 'user-1' }));

    const read = required(await settings.byUserId('user-1'));
    read.timezone = 'Europe/Lisbon';

    expect(required(await settings.byUserId('user-1')).timezone).toBe(
      'America/Sao_Paulo',
    );
  });

  it('returns null when the user has no settings', async () => {
    await expect(settings.byUserId('user-ghost')).resolves.toBeNull();
  });

  // Um Settings por pessoa: o que a regra 20 depende de saber.
  describe('unique(userId)', () => {
    it('refuses a second settings row for the same user', async () => {
      await settings.save(aSettings({ id: 'settings-1', userId: 'user-1' }));

      await expect(
        settings.save(aSettings({ id: 'settings-2', userId: 'user-1' })),
      ).rejects.toThrow(/unique\(userId\)/);
    });

    it('allows saving the same settings id again', async () => {
      await settings.save(aSettings({ id: 'settings-1', userId: 'user-1' }));

      await settings.save(
        aSettings({ id: 'settings-1', userId: 'user-1', locale: 'en' }),
      );

      expect(settings.saved).toHaveLength(1);
      expect(required(settings.saved[0]).locale).toBe('en');
    });

    it('allows settings for a different user', async () => {
      await settings.save(aSettings({ userId: 'user-1' }));
      await settings.save(aSettings({ userId: 'user-2' }));

      expect(settings.saved).toHaveLength(2);
    });
  });

  /**
   * Os contadores da Tarefa 36, com os DOIS lados de cada um — §7.3: *"um
   * contador só afirmado como `toBe(0)` é meio contador: escreva também o lado
   * positivo, senão um incremento que alguém apague deixa todo `toBe(0)` passar
   * por acidente"*. E é justamente num `toBe(0)` que a **regra 1** da fatia se
   * apoia (o `getSettings` não escreve).
   */
  describe('the call counters', () => {
    it('starts at zero and counts the call, not the success', async () => {
      expect({
        save: settings.saveCalls,
        byUserId: settings.byUserIdCalls,
      }).toEqual({ save: 0, byUserId: 0 });

      await settings.save(aSettings({ id: 'settings-1', userId: 'user-1' }));
      await settings.byUserId('user-1');
      await settings.byUserId('user-ghost');
      // Uma escrita RECUSADA pelo índice também foi uma tentativa (§7.3).
      await expect(
        settings.save(aSettings({ id: 'settings-2', userId: 'user-1' })),
      ).rejects.toThrow();

      expect({
        save: settings.saveCalls,
        byUserId: settings.byUserIdCalls,
      }).toEqual({ save: 2, byUserId: 2 });
    });
  });
});
