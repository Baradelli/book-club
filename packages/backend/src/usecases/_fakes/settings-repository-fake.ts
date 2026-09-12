import type { Settings } from '../../domain/settings';
import type {
  SettingsFilter,
  SettingsRepository,
} from '../ports/settings-repository';

export class SettingsRepositoryFake implements SettingsRepository {
  private store = new Map<string, Settings>();

  /**
   * Contadores de CHAMADA, nunca cronômetro (§7.3) — e eles nasceram na Tarefa
   * 36 porque a **regra 1** exige prová-los: o `getSettings` devolve o
   * `DEFAULT_SETTINGS` quando não há linha e **não escreve**, e isso se prova
   * por `saveCalls === 0`, não por resultado. "Não chamou" e "chamou e não
   * mudou nada" dão o MESMO `saved`, e a segunda é um `UPDATE` por request em
   * toda abertura da tela de preferências.
   *
   * O contador conta a **chamada, não o sucesso**: uma escrita recusada pelo
   * `unique(userId)` também foi uma tentativa, e é isso que o teste quer saber.
   */
  saveCalls = 0;
  byUserIdCalls = 0;
  findCalls = 0;

  /**
   * Uma CÓPIA do filtro de cada chamada (§7.3).
   *
   * O contador diz "foi ao repositório"; só o filtro diz **o que** foi pedido —
   * e a decisão C da Tarefa 37 é exatamente sobre isso: o dispatcher tem de
   * pedir `reminderEnabled: true` ao banco, e não carregar todo mundo para
   * filtrar em memória. Num cenário de teste onde só há gente com lembrete
   * ligado, as duas implementações dão o mesmo resultado.
   */
  findFilters: SettingsFilter[] = [];

  async save(settings: Settings): Promise<Settings> {
    this.saveCalls += 1;
    this.assertUniqueUserId(settings);
    this.store.set(settings.id, this.clone(settings));
    return this.clone(settings);
  }

  async byUserId(userId: string): Promise<Settings | null> {
    this.byUserIdCalls += 1;
    for (const settings of this.store.values()) {
      if (settings.userId === userId) return this.clone(settings);
    }
    return null;
  }

  /**
   * "Quem pediu para ser lembrado" — e a enumeração é **INVERTIDA de
   * propósito** (§7.2).
   *
   * O port não promete ordem, e a ordem que o Postgres devolve sem `ORDER BY` é
   * indefinida de verdade (depende do plano de execução e do `VACUUM`).
   * "Invertida" é tão fiel quanto qualquer outra — e é a única que **falha**
   * quando alguém confia na ordem do repositório.
   */
  async find(filter: SettingsFilter): Promise<Settings[]> {
    this.findCalls += 1;
    this.findFilters.push({ ...filter });

    return [...this.store.values()]
      .filter((settings) => settings.reminderEnabled === filter.reminderEnabled)
      .reverse()
      .map((settings) => this.clone(settings));
  }

  get saved(): Settings[] {
    return [...this.store.values()].map((settings) => this.clone(settings));
  }

  // Contrato do fake, não regra de domínio: um Settings por pessoa é o que a
  // regra 20 depende de saber.
  private assertUniqueUserId(settings: Settings): void {
    for (const existing of this.store.values()) {
      if (existing.id !== settings.id && existing.userId === settings.userId) {
        throw new Error(
          `SettingsRepositoryFake: saving settings ${settings.id} violates unique(userId) — ${existing.id} already belongs to ${settings.userId}`,
        );
      }
    }
  }

  // Settings não tem campo Date; o spread já é cópia completa.
  private clone(settings: Settings): Settings {
    return { ...settings };
  }
}
