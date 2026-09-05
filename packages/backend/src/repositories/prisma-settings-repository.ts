import type { PrismaClient, Settings as PrismaSettings } from '@prisma/client';

import type { Settings } from '../domain/settings';
import type { SettingsRepository } from '../usecases/ports/settings-repository';

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
}
