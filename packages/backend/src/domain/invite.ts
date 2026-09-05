import type { MemberRole } from './club';

export interface Invite {
  id: string;
  clubId: string;
  code: string;
  role: MemberRole; // nunca 'OWNER'
  createdById: string;
  expiresAt: Date;
  usedAt: Date | null;
  usedById: string | null;
  createdAt: Date;
}

export const DEFAULT_INVITE_TTL_DAYS = 7;
export const MIN_PASSWORD_LENGTH = 8;
