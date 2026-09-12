import { beforeEach, describe, expect, it } from 'vitest';

import { InvalidSettingsError } from '../../domain/errors';
import { DEFAULT_SETTINGS } from '../../domain/settings';
import { aSettings } from '../../test-support/builders';
import { SettingsRepositoryFake } from '../_fakes/settings-repository-fake';
import { GetSettings } from '../get-settings';

/**
 * ⚠️ **REGRAS 1 e 5 DA TAREFA 36.**
 *
 * ⚠️ **E a decisão A, que é o que faz este UseCase ser diferente de todos os
 * outros do projeto: NÃO HÁ `assertMembership` aqui.** O `Settings` é do
 * USUÁRIO — `unique(userId)`, nenhum `clubId` —, então não existe clube a
 * conferir. **O corte de tenant é o próprio JWT**: o único endereço é "o meu",
 * e o input não tem `userId`. É por isso que este arquivo precisa dos testes
 * explícitos de vizinhança (a regra 5): a ausência de guard é correta aqui e
 * seria um furo em qualquer outro UseCase, então ela tem de estar provada, não
 * suposta.
 */

const MARIA = 'maria';
const MARCOS = 'marcos';

describe('GetSettings', () => {
  let settings: SettingsRepositoryFake;
  let getSettings: GetSettings;

  beforeEach(() => {
    settings = new SettingsRepositoryFake();
    getSettings = new GetSettings(settings);
  });

  it('returns the preferences of the person who asked', async () => {
    await settings.save(
      aSettings({
        id: 'settings-maria',
        userId: MARIA,
        timezone: 'Europe/Lisbon',
        locale: 'en',
        reminderTime: '07:30',
        reminderEnabled: false,
        notifyGroupActivity: false,
      }),
    );

    await expect(getSettings.execute({ actorUserId: MARIA })).resolves.toEqual({
      timezone: 'Europe/Lisbon',
      locale: 'en',
      reminderTime: '07:30',
      reminderEnabled: false,
      notifyGroupActivity: false,
    });
  });

  /**
   * ⚠️ **CINCO campos, e nem `id` nem `userId`.** O `DEFAULT_SETTINGS` não tem
   * `id`, e inventar um para ele seria devolver a identidade de uma linha que
   * não existe — a tela poderia guardá-lo e um dia mandá-lo de volta. Então o
   * UseCase fala `SettingsPreferences`, e o caminho com linha e o caminho sem
   * linha têm a MESMA forma.
   */
  it('answers the five preference fields and nothing else', async () => {
    await settings.save(aSettings({ id: 'settings-maria', userId: MARIA }));

    const result = await getSettings.execute({ actorUserId: MARIA });

    expect(Object.keys(result).sort()).toEqual([
      'locale',
      'notifyGroupActivity',
      'reminderEnabled',
      'reminderTime',
      'timezone',
    ]);
  });

  /**
   * ⚠️ **REGRA 1 — SEM LINHA, DEVOLVE O `DEFAULT_SETTINGS`** (decisão B).
   *
   * O caso é real e tem nome: **o super-admin do seed não tem `Settings`**, porque
   * ele nunca aceitou convite (é o `acceptInvite` que cria a linha). A primeira
   * coisa que ele faz ao abrir a tela de preferências é um `GET`, e um 404 ali
   * seria a tela quebrando para o único usuário que existe num projeto novo.
   */
  it('falls back to the DEFAULT_SETTINGS when the person has no row', async () => {
    await expect(getSettings.execute({ actorUserId: MARIA })).resolves.toEqual({
      timezone: DEFAULT_SETTINGS.timezone,
      locale: DEFAULT_SETTINGS.locale,
      reminderTime: DEFAULT_SETTINGS.reminderTime,
      reminderEnabled: DEFAULT_SETTINGS.reminderEnabled,
      notifyGroupActivity: DEFAULT_SETTINGS.notifyGroupActivity,
    });
  });

  /**
   * ⚠️ **REGRA 1, A METADE QUE SÓ O CONTADOR VÊ: ler NÃO ESCREVE** — provado
   * por **contagem** (§7.3), não por resultado.
   *
   * Uma leitura que cria linha é efeito colateral escondido, e quebraria a
   * idempotência de um `GET`: abrir a tela de preferências passaria a gravar no
   * banco. E o resultado é **idêntico** nas duas implementações — a que devolve
   * o padrão e a que cria a linha com o padrão e a devolve —, então nenhuma
   * asserção sobre o retorno separa as duas. Só `saveCalls === 0` separa.
   *
   * O lado positivo do contador vive na suíte do fake
   * (`the call counters`), como o §7.3 manda.
   */
  it('never writes while reading, not even to materialise the default', async () => {
    await getSettings.execute({ actorUserId: MARIA });

    expect(settings.saveCalls).toBe(0);
    expect(settings.saved).toEqual([]);
    // ...e leu de verdade: sem isto, um UseCase que devolvesse o padrão sem
    // nem consultar passaria neste teste.
    expect(settings.byUserIdCalls).toBe(1);
  });

  it('reads the database once, not once per field', async () => {
    await settings.save(aSettings({ id: 'settings-maria', userId: MARIA }));

    await getSettings.execute({ actorUserId: MARIA });

    expect(settings.byUserIdCalls).toBe(1);
  });

  /**
   * ⚠️ **REGRA 5 — NINGUÉM LÊ O `Settings` DE OUTRA PESSOA.**
   *
   * O input **não tem** `userId`: não há campo por onde pedir o alheio, e é
   * ESTRUTURAL, não um `if`. Este teste usa o **ator legítimo** (a Maria, que
   * tem linha própria) com a linha do Marcos no banco, e asserta **o que
   * voltou** — que é a única coisa que mudaria se o corte falhasse (§7.5).
   */
  it('never answers with the row of another person', async () => {
    await settings.save(
      aSettings({
        id: 'settings-marcos',
        userId: MARCOS,
        timezone: 'Asia/Tokyo',
        locale: 'en',
        reminderTime: '05:00',
      }),
    );
    await settings.save(
      aSettings({
        id: 'settings-maria',
        userId: MARIA,
        timezone: 'Europe/Lisbon',
      }),
    );

    const mine = await getSettings.execute({ actorUserId: MARIA });

    expect(mine.timezone).toBe('Europe/Lisbon');
    expect(mine.reminderTime).toBe('21:00');
    // A precondição do par: a linha do Marcos EXISTE e é dele — senão um
    // repositório vazio passaria neste teste.
    const theirs = await getSettings.execute({ actorUserId: MARCOS });
    expect(theirs.timezone).toBe('Asia/Tokyo');
  });

  /**
   * ⚠️ **O CONTRABANDO, com o ATOR LEGÍTIMO** (§7.5): o campo proibido chega, e
   * o que volta continua sendo o do ator.
   *
   * Testar com um ator de fora não provaria nada — não há guard de tenant aqui
   * para matar a requisição, mas o raciocínio é o mesmo: o que muda quando o
   * contrabando pega é **o dado devolvido**, e é isso que se asserta.
   *
   * O `@ts-expect-error` é metade da prova: o `GetSettingsInput` não declara
   * `userId`, então nem compila. A outra metade é o runtime — porque a variável
   * solta atravessa a checagem de propriedade em excesso do TypeScript
   * (§7.1.1), e é essa a forma que um `req.body` espalhado teria.
   */
  it('ignores a smuggled userId and still answers the actor', async () => {
    await settings.save(
      aSettings({
        id: 'settings-marcos',
        userId: MARCOS,
        timezone: 'Asia/Tokyo',
      }),
    );
    await settings.save(
      aSettings({
        id: 'settings-maria',
        userId: MARIA,
        timezone: 'Europe/Lisbon',
      }),
    );

    const smuggled = { actorUserId: MARIA, userId: MARCOS };
    const result = await getSettings.execute(smuggled);

    expect(result.timezone).toBe('Europe/Lisbon');
  });

  it('does not even compile with a userId in a fresh literal', async () => {
    await getSettings.execute({
      actorUserId: MARIA,
      // @ts-expect-error o dono das preferências é o JWT, e só ele
      userId: MARCOS,
    });

    expect(settings.saveCalls).toBe(0);
  });

  /**
   * ⚠️ **O PORTÃO TAMBÉM VALE NA LEITURA.** Uma linha com `reminderTime` torto
   * no banco (uma escrita por fora, um `psql` na mão) tem de estourar na
   * LEITURA — não chegar à tela nem ao dispatcher da Tarefa 37, que faria
   * `split(':')` e teria `NaN` na janela, sem erro e sem ninguém notar.
   *
   * É o mesmo desenho do `assertActivityType` no repositório do evento: o
   * portão vale nos dois sentidos.
   */
  it('refuses to hand over a row whose reminderTime is broken', async () => {
    await settings.save(
      aSettings({ id: 'settings-maria', userId: MARIA, reminderTime: '9h' }),
    );

    await expect(getSettings.execute({ actorUserId: MARIA })).rejects.toThrow(
      InvalidSettingsError,
    );
  });
});
