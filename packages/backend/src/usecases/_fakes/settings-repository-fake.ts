import type { Settings } from '../../domain/settings';
import type { SettingsRepository } from '../ports/settings-repository';

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
