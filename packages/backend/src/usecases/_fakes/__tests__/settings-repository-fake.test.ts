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
   * ⚠️ **O `find` DA TAREFA 37 — a varredura de quem pediu para ser lembrado
   * (decisão C).**
   *
   * O port cresceu junto com a implementação Prisma, na MESMA unidade (§6.9), e
   * o contrato contra o Postgres está em
   * `repositories/__tests__/prisma-settings-repository.contract.integration.test.ts`.
   */
  describe('find({ reminderEnabled })', () => {
    it('brings only the people who asked to be reminded', async () => {
      await settings.save(
        aSettings({ userId: 'maria', reminderEnabled: true }),
      );
      await settings.save(
        aSettings({ userId: 'marcos', reminderEnabled: false }),
      );
      await settings.save(aSettings({ userId: 'ana', reminderEnabled: true }));

      const found = await settings.find({ reminderEnabled: true });

      // Ordenado antes de comparar: o assunto deste teste NÃO é a ordem, e a
      // enumeração do fake é armadilha de propósito (§7.2).
      expect(found.map((row) => row.userId).sort()).toEqual(['ana', 'maria']);
    });

    /**
     * O OUTRO lado do filtro, e ele é o que impede "traz todo mundo" de passar:
     * com `false`, vem exatamente quem desligou.
     */
    it('brings only the people who turned it off when asked for false', async () => {
      await settings.save(
        aSettings({ userId: 'maria', reminderEnabled: true }),
      );
      await settings.save(
        aSettings({ userId: 'marcos', reminderEnabled: false }),
      );

      const found = await settings.find({ reminderEnabled: false });

      expect(found.map((row) => row.userId)).toEqual(['marcos']);
    });

    /**
     * ⚠️ **A ENUMERAÇÃO É INVERTIDA DE PROPÓSITO** (§7.2), e este é o teste
     * dedicado em que a ordem É o assunto — é aqui que ela se pina, e só aqui.
     *
     * O port não promete ordem e o Postgres sem `ORDER BY` devolve o que o
     * plano de execução quiser; "invertida" é tão fiel quanto qualquer outra, e
     * é a única que **falha** quando alguém confia na ordem do repositório.
     */
    it('enumerates in reverse insertion order, so nobody depends on it', async () => {
      await settings.save(aSettings({ userId: 'primeira' }));
      await settings.save(aSettings({ userId: 'segunda' }));
      await settings.save(aSettings({ userId: 'terceira' }));

      const found = await settings.find({ reminderEnabled: true });

      expect(found.map((row) => row.userId)).toEqual([
        'terceira',
        'segunda',
        'primeira',
      ]);
    });

    it('does not let the caller mutate the store through what it read', async () => {
      await settings.save(aSettings({ userId: 'maria' }));

      const [found] = await settings.find({ reminderEnabled: true });
      required(found).timezone = 'Europe/Lisbon';

      expect(required(await settings.byUserId('maria')).timezone).toBe(
        'America/Sao_Paulo',
      );
    });

    /**
     * ⚠️ **O FILTRO QUE FOI AO REPOSITÓRIO, e não só o resultado** (§7.3).
     *
     * O `findFilters` guarda uma CÓPIA: sem ela, um chamador que mutasse o
     * objeto depois faria o histórico mentir — e o histórico é a única coisa
     * que distingue "pediu ao banco" de "carregou tudo e filtrou em memória",
     * que dão o mesmo resultado em todo cenário de teste sem gente desligada.
     */
    it('records a COPY of every filter it was asked for', async () => {
      await settings.find({ reminderEnabled: true });
      const filter = { reminderEnabled: false };
      await settings.find(filter);
      filter.reminderEnabled = true;

      expect(settings.findFilters).toEqual([
        { reminderEnabled: true },
        { reminderEnabled: false },
      ]);
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
        find: settings.findCalls,
      }).toEqual({ save: 0, byUserId: 0, find: 0 });

      await settings.save(aSettings({ id: 'settings-1', userId: 'user-1' }));
      await settings.byUserId('user-1');
      await settings.byUserId('user-ghost');
      await settings.find({ reminderEnabled: true });
      // Uma escrita RECUSADA pelo índice também foi uma tentativa (§7.3).
      await expect(
        settings.save(aSettings({ id: 'settings-2', userId: 'user-1' })),
      ).rejects.toThrow();

      expect({
        save: settings.saveCalls,
        byUserId: settings.byUserIdCalls,
        find: settings.findCalls,
      }).toEqual({ save: 2, byUserId: 2, find: 1 });
    });
  });
});
