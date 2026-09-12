import type { SettingsPreferences } from '../domain/settings';
import { assertReminderTime, DEFAULT_SETTINGS } from '../domain/settings';
import type { SettingsRepository } from './ports/settings-repository';

export interface GetSettingsInput {
  /**
   * Quem está pedindo, e é sempre o dono das preferências que voltam.
   *
   * ⚠️ **NÃO existe `userId` aqui, e é a decisão A da Tarefa 36.** O `Settings`
   * é `unique(userId)` e não tem `clubId`: o único endereço é "o meu", e o corte
   * de tenant é o **próprio JWT**. Não há campo por onde pedir o alheio — é
   * estrutural, não um `if`.
   */
  actorUserId: string;
}

/**
 * "Quais são as minhas preferências?"
 *
 * ⚠️ **NÃO HÁ `assertMembership` AQUI, e isso é diferente de todo o resto do
 * projeto** (decisão A). Não é esquecimento: o `Settings` não tem `clubId`, não
 * é conteúdo de clube, e não existe clube a conferir. O corte é o JWT, e a
 * prova de que ele funciona está no teste
 * `never answers with the row of another person` — a ausência de guard é
 * correta aqui e seria um furo em qualquer outro UseCase, então ela está
 * provada, não suposta.
 *
 * ⚠️ **SEM LINHA, DEVOLVE O `DEFAULT_SETTINGS` — e NÃO CRIA** (decisão B).
 *
 * O caso é real e tem nome: **o super-admin do seed não tem `Settings`**, porque
 * ele nunca aceitou convite (é o `acceptInvite` que cria a linha). Um 404 ali
 * seria a tela de preferências quebrando para o único usuário que existe num
 * projeto novo.
 *
 * E ler não escreve: uma leitura que cria linha é efeito colateral escondido, e
 * quebraria a idempotência de um `GET` — abrir a tela passaria a gravar no
 * banco. ⚠️ **O resultado é IDÊNTICO nas duas implementações** (devolver o
 * padrão × criar a linha com o padrão e devolvê-la), então quem separa as duas é
 * o **contador** `saveCalls === 0`, nunca uma asserção sobre o retorno (§7.3).
 * Quem cria é o `updateSettings`.
 *
 * **Devolve `SettingsPreferences`, e não `Settings`**: o `DEFAULT_SETTINGS` não
 * tem `id`, e inventar um para ele seria devolver a identidade de uma linha que
 * não existe — a tela poderia guardá-lo e um dia mandá-lo de volta. Com o tipo
 * de cinco campos, o caminho com linha e o caminho sem linha têm a MESMA forma.
 */
export class GetSettings {
  constructor(private readonly settings: SettingsRepository) {}

  async execute(input: GetSettingsInput): Promise<SettingsPreferences> {
    const stored = await this.settings.byUserId(input.actorUserId);
    if (!stored) {
      // O spread do `DEFAULT_SETTINGS` (que é `as const`, portanto readonly)
      // para um objeto novo e mutável: devolver a própria constante daria ao
      // chamador uma referência ao padrão do projeto.
      return { ...DEFAULT_SETTINGS };
    }

    return {
      timezone: stored.timezone,
      locale: stored.locale,
      /*
        ⚠️ **O PORTÃO VALE NA LEITURA TAMBÉM**, e é o mesmo desenho do
        `assertActivityType` no repositório do evento: um `reminderTime` torto na
        coluna (uma escrita por fora, um `psql` na mão) é erro de verdade, e tem
        de aparecer AQUI — não na tela, e muito menos no dispatcher da Tarefa 37,
        que fará `split(':').map(Number)` e teria `NaN` na janela, sem erro e sem
        ninguém notar.
      */
      reminderTime: assertReminderTime(stored.reminderTime),
      reminderEnabled: stored.reminderEnabled,
      notifyGroupActivity: stored.notifyGroupActivity,
    };
  }
}
