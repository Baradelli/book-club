import type { Settings } from '../../domain/settings';

export interface SettingsRepository {
  save(settings: Settings): Promise<Settings>;
  byUserId(userId: string): Promise<Settings | null>;
}
