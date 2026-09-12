import { beforeEach, describe, expect, it } from 'vitest';

import { InvalidSettingsError } from '../../domain/errors';
import { DEFAULT_SETTINGS } from '../../domain/settings';
import { aSettings, required } from '../../test-support/builders';
import { SettingsRepositoryFake } from '../_fakes/settings-repository-fake';
import { UpdateSettings } from '../update-settings';

/**
 * ⚠️ **REGRAS 2, 3, 4 e 5 DA TAREFA 36.**
 *
 * Como o `getSettings`, e pela decisão A: **não há `assertMembership`** — o
 * `Settings` é do usuário, e o corte é o próprio JWT.
 */

const MARIA = 'maria';
const MARCOS = 'marcos';

/** As cinco preferências de uma linha, sem `id` nem `userId`. */
function preferencesOf(
  settings: SettingsRepositoryFake,
  userId: string,
): Record<string, unknown> {
  const row = required(settings.saved.find((it) => it.userId === userId));
  return {
    timezone: row.timezone,
    locale: row.locale,
    reminderTime: row.reminderTime,
    reminderEnabled: row.reminderEnabled,
    notifyGroupActivity: row.notifyGroupActivity,
  };
}

describe('UpdateSettings', () => {
  let settings: SettingsRepositoryFake;
  let updateSettings: UpdateSettings;

  beforeEach(() => {
    settings = new SettingsRepositoryFake();
    updateSettings = new UpdateSettings(settings);
  });

  /**
   * ⚠️ **REGRA 2 — O PATCH PARCIAL PRESERVA O QUE NÃO VEIO, e a prova é
   * SNAPSHOT ANTES/DEPOIS** (§7.6), não `toBe` de campo escolhido à mão.
   *
   * *"Um `toBe(valorEsperado)` escrito à mão prova só que aquele valor
   * sobreviveu — e o campo que a operação apagou é justamente o que ninguém
   * pensou em listar."* Aqui o "depois" é derivado do "antes" com **uma** chave
   * trocada: qualquer outro campo que a operação perdesse aparece na diferença.
   */
  it('keeps every field the patch did not carry', async () => {
    await settings.save(
      aSettings({
        id: 'settings-maria',
        userId: MARIA,
        timezone: 'Asia/Tokyo',
        locale: 'en',
        reminderTime: '07:30',
        reminderEnabled: false,
        notifyGroupActivity: true,
      }),
    );
    const before = preferencesOf(settings, MARIA);

    await updateSettings.execute({
      actorUserId: MARIA,
      reminderEnabled: true,
    });

    expect(preferencesOf(settings, MARIA)).toEqual({
      ...before,
      reminderEnabled: true,
    });
  });

  /** E o mesmo, campo a campo: cada um dos cinco é patcheável isolado. */
  it.each([
    ['timezone', 'Europe/Lisbon'],
    ['locale', 'en'],
    ['reminderTime', '06:15'],
    ['reminderEnabled', false],
    ['notifyGroupActivity', false],
  ])('patches %s alone, losing nothing else', async (field, value) => {
    await settings.save(aSettings({ id: 'settings-maria', userId: MARIA }));
    const before = preferencesOf(settings, MARIA);

    await updateSettings.execute({ actorUserId: MARIA, [field]: value });

    expect(preferencesOf(settings, MARIA)).toEqual({
      ...before,
      [field]: value,
    });
  });

  /**
   * ⚠️ **`false` NÃO é "ausente".** Um merge escrito com `||` em vez de `??`
   * transformaria "desligue o lembrete" em "não mexa" — e os dois campos
   * booleanos nascem `true`, então o bug seria "o toggle não desliga", que é
   * exatamente o que a tela da 36b existe para fazer.
   */
  it('turns a boolean OFF, which a || merge would silently ignore', async () => {
    await settings.save(aSettings({ id: 'settings-maria', userId: MARIA }));

    await updateSettings.execute({
      actorUserId: MARIA,
      reminderEnabled: false,
      notifyGroupActivity: false,
    });

    const stored = preferencesOf(settings, MARIA);
    expect(stored['reminderEnabled']).toBe(false);
    expect(stored['notifyGroupActivity']).toBe(false);
  });

  it('returns the whole new state, not only what changed', async () => {
    await settings.save(
      aSettings({
        id: 'settings-maria',
        userId: MARIA,
        timezone: 'Asia/Tokyo',
      }),
    );

    const result = await updateSettings.execute({
      actorUserId: MARIA,
      reminderTime: '06:15',
    });

    expect(result).toEqual({
      timezone: 'Asia/Tokyo',
      locale: 'pt',
      reminderTime: '06:15',
      reminderEnabled: true,
      notifyGroupActivity: true,
    });
  });

  /**
   * ⚠️ **REGRA 3 — CRIA A LINHA QUANDO NÃO EXISTE** (o caso do super-admin do
   * seed, que nunca aceitou convite).
   *
   * O que não veio no patch sai do `DEFAULT_SETTINGS`: é o mesmo padrão que o
   * `getSettings` devolve, então a primeira escrita de quem nunca teve linha
   * não inventa valor nenhum.
   */
  it('creates the row for someone who never had one', async () => {
    const result = await updateSettings.execute({
      actorUserId: MARIA,
      reminderTime: '06:15',
    });

    expect(settings.saved).toHaveLength(1);
    expect(preferencesOf(settings, MARIA)).toEqual({
      timezone: DEFAULT_SETTINGS.timezone,
      locale: DEFAULT_SETTINGS.locale,
      reminderTime: '06:15',
      reminderEnabled: DEFAULT_SETTINGS.reminderEnabled,
      notifyGroupActivity: DEFAULT_SETTINGS.notifyGroupActivity,
    });
    expect(result.reminderTime).toBe('06:15');
  });

  it('gives the new row an id and the actor as owner', async () => {
    await updateSettings.execute({ actorUserId: MARIA, locale: 'en' });

    const row = required(settings.saved[0]);
    expect(row.userId).toBe(MARIA);
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  /**
   * ⚠️ **A SEGUNDA ESCRITA REUSA O `id` DA LINHA**, e não gera outro: o
   * `unique(userId)` do banco recusaria a segunda linha, e o fake a recusa
   * também (é a fidelidade que a suíte dele pina). Sem isto, o segundo toque no
   * toggle viraria `P2002` — que a borda **não mapeia**, ou seja 500.
   */
  it('updates in place on the second patch, never a second row', async () => {
    await updateSettings.execute({ actorUserId: MARIA, locale: 'en' });
    const firstId = required(settings.saved[0]).id;

    await updateSettings.execute({
      actorUserId: MARIA,
      reminderEnabled: false,
    });

    expect(settings.saved).toHaveLength(1);
    expect(required(settings.saved[0]).id).toBe(firstId);
  });

  /** O patch vazio grava o estado como está: "nada mudou" não é erro. */
  it('accepts an empty patch without losing anything', async () => {
    await settings.save(
      aSettings({ id: 'settings-maria', userId: MARIA, locale: 'en' }),
    );
    const before = preferencesOf(settings, MARIA);

    await updateSettings.execute({ actorUserId: MARIA });

    expect(preferencesOf(settings, MARIA)).toEqual(before);
  });

  /**
   * ⚠️ **REGRA 4 — `reminderTime` INVÁLIDO É RECUSADO NO DOMÍNIO.**
   *
   * A borda também o recusa (o `reminderTimeSchema` de `@clube/shared`), e são
   * **as duas**: a borda é a primeira barreira, não a única — o mesmo argumento
   * do `assertHighlightColor`. O dispatcher da Tarefa 37 fará
   * `split(':').map(Number)` neste valor.
   */
  it.each(['25:00', '9:00', '21:5', '', 'abc', '24:00', '21:60'])(
    'refuses %s in the domain',
    async (reminderTime) => {
      await expect(
        updateSettings.execute({ actorUserId: MARIA, reminderTime }),
      ).rejects.toThrow(InvalidSettingsError);
    },
  );

  /**
   * ⚠️ **E RECUSA ANTES DE LER, provado por contagem** (§7.3): "recusou antes de
   * ler" e "leu e depois recusou" dão o MESMO erro ao cliente, e a segunda vai
   * ao banco por um corpo que já era inválido.
   */
  it('refuses before touching the database at all', async () => {
    await expect(
      updateSettings.execute({ actorUserId: MARIA, reminderTime: '25:00' }),
    ).rejects.toThrow(InvalidSettingsError);

    expect({ read: settings.byUserIdCalls, wrote: settings.saveCalls }).toEqual(
      {
        read: 0,
        wrote: 0,
      },
    );
  });

  /** O existente não é corrompido por um patch recusado. */
  it('leaves the stored row untouched when it refuses', async () => {
    await settings.save(
      aSettings({ id: 'settings-maria', userId: MARIA, reminderTime: '07:30' }),
    );
    const before = preferencesOf(settings, MARIA);

    await expect(
      updateSettings.execute({ actorUserId: MARIA, reminderTime: '99:99' }),
    ).rejects.toThrow(InvalidSettingsError);

    expect(preferencesOf(settings, MARIA)).toEqual(before);
  });

  /**
   * ⚠️ **REGRA 5 — NINGUÉM ESCREVE NO `Settings` DE OUTRA PESSOA, e o
   * contrabando é testado com o ATOR LEGÍTIMO, assertando A LINHA GRAVADA**
   * (§7.5).
   *
   * A Maria (ator legítimo, com linha própria) manda `userId: MARCOS` no corpo.
   * O que muda se o contrabando pegar é **qual linha foi escrita** — então é
   * isso que se asserta, nas duas pontas: a dela mudou e a dele **não**.
   *
   * O `@ts-expect-error` é a metade do compilador; a variável solta é a metade
   * do runtime, porque é ela que atravessa a checagem de propriedade em excesso
   * (§7.1.1) e é a forma exata que um `{ ...req.body }` espalhado teria.
   */
  it('writes the actor row even when a userId is smuggled in the patch', async () => {
    await settings.save(
      aSettings({
        id: 'settings-marcos',
        userId: MARCOS,
        reminderTime: '05:00',
        reminderEnabled: true,
      }),
    );
    await settings.save(
      aSettings({ id: 'settings-maria', userId: MARIA, reminderTime: '07:30' }),
    );
    const marcosBefore = preferencesOf(settings, MARCOS);

    const smuggled = {
      actorUserId: MARIA,
      userId: MARCOS,
      reminderTime: '06:15',
      reminderEnabled: false,
    };
    await updateSettings.execute(smuggled);

    // A linha do ATOR mudou...
    expect(preferencesOf(settings, MARIA)).toEqual({
      ...DEFAULT_SETTINGS,
      reminderTime: '06:15',
      reminderEnabled: false,
    });
    // ...e a do Marcos não foi tocada.
    expect(preferencesOf(settings, MARCOS)).toEqual(marcosBefore);
    expect(settings.saved).toHaveLength(2);
  });

  it('does not even compile with a userId in a fresh literal', async () => {
    await updateSettings.execute({
      actorUserId: MARIA,
      locale: 'en',
      // @ts-expect-error o dono das preferências é o JWT, e só ele
      userId: MARCOS,
    });

    expect(required(settings.saved[0]).userId).toBe(MARIA);
  });

  /**
   * ⚠️ **E o `id` também não se contrabandeia**: um `id` no patch criaria a
   * chance de escrever em cima da linha de outra pessoa por chave primária —
   * pior que o `userId`, porque o `unique(userId)` não o barraria.
   */
  it('ignores a smuggled id and keeps writing the actor own row', async () => {
    await settings.save(
      aSettings({ id: 'settings-marcos', userId: MARCOS, locale: 'en' }),
    );
    const marcosBefore = preferencesOf(settings, MARCOS);

    const smuggled = {
      actorUserId: MARIA,
      id: 'settings-marcos',
      locale: 'en',
    };
    await updateSettings.execute(smuggled);

    expect(preferencesOf(settings, MARCOS)).toEqual(marcosBefore);
    expect(settings.saved).toHaveLength(2);
    expect(
      required(settings.saved.find((row) => row.userId === MARIA)).id,
    ).not.toBe('settings-marcos');
  });
});
