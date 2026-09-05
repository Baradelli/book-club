import type { Settings } from '../../domain/settings';
import type { SettingsRepository } from '../ports/settings-repository';

export class SettingsRepositoryFake implements SettingsRepository {
  private store = new Map<string, Settings>();

  async save(settings: Settings): Promise<Settings> {
    this.assertUniqueUserId(settings);
    this.store.set(settings.id, this.clone(settings));
    return this.clone(settings);
  }

  async byUserId(userId: string): Promise<Settings | null> {
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
