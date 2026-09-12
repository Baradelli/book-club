import { randomUUID } from 'node:crypto';

import type { SettingsPatch, SettingsPreferences } from '../domain/settings';
import { assertReminderTime, DEFAULT_SETTINGS } from '../domain/settings';
import type { SettingsRepository } from './ports/settings-repository';

export interface UpdateSettingsInput {
  /**
   * ⚠️ **NÃO existe `userId` aqui** (decisão A): o dono das preferências é o
   * JWT, e o `Settings` não tem `clubId`. O mutante perigoso é o do **fallback**
   * (`input.userId ?? input.actorUserId`, §7.5) — ele se comporta normalmente em
   * todo teste que não manda o campo, e é por isso que o teste de contrabando
   * usa o **ator legítimo** e asserta **as duas linhas gravadas**.
   */
  actorUserId: string;
  timezone?: string;
  locale?: string;
  /** `unknown` porque o portão é do domínio (`assertReminderTime`). */
  reminderTime?: unknown;
  reminderEnabled?: boolean;
  notifyGroupActivity?: boolean;
}

/**
 * "Mudei de ideia": a pessoa ajusta **as próprias** preferências.
 *
 * ⚠️ **PATCH PARCIAL — só os campos que vieram** (decisão C). A tela mínima da
 * 36b mexe em três campos de cinco; exigir o objeto inteiro faria ela mandar
 * `timezone` e `locale` que não edita, e um dia sobrescrever com valor velho.
 *
 * ⚠️ **CRIA A LINHA QUANDO NÃO EXISTE** (regra 3), e é a outra metade da decisão
 * B: ler não escreve, escrever cria. O caso é o **super-admin do seed**, que
 * nunca aceitou convite e por isso nunca teve a linha criada pelo
 * `acceptInvite` — sem isto, a primeira mudança de preferência dele seria um
 * erro.
 *
 * ⚠️ **NÃO HÁ `assertMembership`** (decisão A), pelo mesmo motivo do
 * `getSettings`: não há clube envolvido, e o corte é o JWT. A prova está em
 * `writes the actor row even when a userId is smuggled in the patch`.
 *
 * **Não lê relógio nenhum**: `Settings` não tem `createdAt` nem `updatedAt` (o
 * modelo da Tarefa 03 tem cinco colunas de preferência, `id` e `userId`). Um
 * instante sem dono é campo que mente (ADR 0008), e aqui nem existe.
 */
export class UpdateSettings {
  constructor(private readonly settings: SettingsRepository) {}

  async execute(input: UpdateSettingsInput): Promise<SettingsPreferences> {
    /*
      ⚠️ **A VALIDAÇÃO VEM ANTES DA LEITURA, e a prova é por contagem** (§7.3):
      "recusou antes de ler" e "leu e depois recusou" dão o MESMO erro ao
      cliente, e a segunda vai ao banco por um corpo que já era inválido. O
      teste `refuses before touching the database at all` afirma
      `byUserIdCalls === 0` e `saveCalls === 0`.

      Só o `reminderTime` tem portão de domínio, e é decisão da fatia (D): ele é
      o único campo que um consumidor futuro **parseia** (o
      `split(':').map(Number)` do dispatcher da Tarefa 37). `timezone` e
      `locale` param no `.min(1)` da borda — validar nome de fuso aqui exigiria
      uma lista, e uma lista errada recusaria o fuso real de alguém, que é pior
      que nenhuma (o mesmo argumento com que a decisão E da Tarefa 22 recusou
      conferir `page` contra `totalPages`).
    */
    const patch = this.toPatch(input);

    const stored = await this.settings.byUserId(input.actorUserId);
    const base: SettingsPreferences = stored ?? { ...DEFAULT_SETTINGS };

    const saved = await this.settings.save({
      // O `id` da linha que já existe MANDA. Gerar outro faria o `save` (que é
      // upsert por `id`) inserir uma segunda linha e bater no `unique(userId)`
      // — `P2002`, que o `handle-domain-error.ts` não mapeia, ou seja 500 no
      // segundo toque do toggle.
      id: stored?.id ?? randomUUID(),
      // ⚠️ O DONO É O ATOR, sempre, e ele é atribuído DEPOIS de tudo: nem o
      // `patch` nem o `base` carregam `userId` (§6.3, a ordem do spread).
      userId: input.actorUserId,
      ...this.merge(base, patch),
    });

    return {
      timezone: saved.timezone,
      locale: saved.locale,
      reminderTime: saved.reminderTime,
      reminderEnabled: saved.reminderEnabled,
      notifyGroupActivity: saved.notifyGroupActivity,
    };
  }

  /**
   * O input (que é a borda, com `unknown` no horário) vira o `SettingsPatch`
   * (que é o domínio, com `string` validado).
   *
   * ⚠️ **Campo a campo, e nunca um spread do input**: espalhar `input` traria
   * `actorUserId` — e traria qualquer chave que um `req.body` mal declarado
   * carregasse — para dentro do patch. É a mesma disciplina que o §7.1.1 pede do
   * `update` de um repositório, aplicada ao caminho de entrada.
   */
  private toPatch(input: UpdateSettingsInput): SettingsPatch {
    const patch: SettingsPatch = {};
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.locale !== undefined) patch.locale = input.locale;
    if (input.reminderTime !== undefined) {
      patch.reminderTime = assertReminderTime(input.reminderTime);
    }
    if (input.reminderEnabled !== undefined) {
      patch.reminderEnabled = input.reminderEnabled;
    }
    if (input.notifyGroupActivity !== undefined) {
      patch.notifyGroupActivity = input.notifyGroupActivity;
    }
    return patch;
  }

  /**
   * O patch em cima do estado atual, campo a campo.
   *
   * ⚠️ **`??` e NUNCA `||`.** Os dois campos booleanos nascem `true`, então com
   * `||` um `reminderEnabled: false` seria lido como "não mexa" — e o bug
   * apareceria como "o toggle não desliga", que é exatamente o que a tela da
   * 36b existe para fazer. O `??` só cai no `base` para `null`/`undefined`.
   *
   * ⚠️ **E campo a campo em vez de `{ ...base, ...patch }`**: o spread
   * sobrescreveria com `undefined` qualquer chave que existisse no patch com
   * valor indefinido — e um patch construído dinamicamente (ou um `req.body`
   * que declare o campo e mande `null`) apagaria a preferência em silêncio.
   * Uma semântica emulada a menos (§7.1.1).
   */
  private merge(
    base: SettingsPreferences,
    patch: SettingsPatch,
  ): SettingsPreferences {
    return {
      timezone: patch.timezone ?? base.timezone,
      locale: patch.locale ?? base.locale,
      reminderTime: patch.reminderTime ?? base.reminderTime,
      reminderEnabled: patch.reminderEnabled ?? base.reminderEnabled,
      notifyGroupActivity:
        patch.notifyGroupActivity ?? base.notifyGroupActivity,
    };
  }
}
