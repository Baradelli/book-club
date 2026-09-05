import { DEFAULT_TIMEZONE } from './club';

export interface Settings {
  id: string;
  userId: string;
  timezone: string;
  locale: string;
  reminderTime: string;
  reminderEnabled: boolean;
  notifyGroupActivity: boolean;
}

export const DEFAULT_SETTINGS = {
  timezone: DEFAULT_TIMEZONE,
  locale: 'pt',
  reminderTime: '21:00',
  reminderEnabled: true,
  notifyGroupActivity: true,
} as const;
