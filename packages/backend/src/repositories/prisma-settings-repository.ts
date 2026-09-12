import type { PrismaClient, Settings as PrismaSettings } from '@prisma/client';

import type { Settings } from '../domain/settings';
import type {
  SettingsFilter,
  SettingsRepository,
} from '../usecases/ports/settings-repository';

function toDomain(record: PrismaSettings): Settings {
  return {
    id: record.id,
    userId: record.userId,
    timezone: record.timezone,
    locale: record.locale,
    reminderTime: record.reminderTime,
    reminderEnabled: record.reminderEnabled,
    notifyGroupActivity: record.notifyGroupActivity,
  };
}

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private prisma: PrismaClient) {}

  async save(settings: Settings): Promise<Settings> {
    const data = {
      userId: settings.userId,
      timezone: settings.timezone,
      locale: settings.locale,
      reminderTime: settings.reminderTime,
      reminderEnabled: settings.reminderEnabled,
      notifyGroupActivity: settings.notifyGroupActivity,
    };
    const record = await this.prisma.settings.upsert({
      where: { id: settings.id },
      create: { id: settings.id, ...data },
      update: data,
    });
    return toDomain(record);
  }

  async byUserId(userId: string): Promise<Settings | null> {
    const record = await this.prisma.settings.findUnique({
      where: { userId },
    });
    return record ? toDomain(record) : null;
  }

  /**
   * "Quem pediu para ser lembrado" — a varredura do dispatcher (Tarefa 37).
   *
   * **Sem `orderBy`** porque o port não promete ordem, e **sem `take`** porque
   * um corte aqui seria a falha e não a válvula: as pessoas depois do corte
   * nunca receberiam lembrete, em silêncio. Ver o docblock do port.
   */
  async find(filter: SettingsFilter): Promise<Settings[]> {
    const records = await this.prisma.settings.findMany({
      where: { reminderEnabled: filter.reminderEnabled },
    });
    return records.map(toDomain);
  }
}
