export type GeneralStatus = 'ACTIVE' | 'ARCHIVED';
export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export const MEMBER_ROLES: readonly MemberRole[] = ['OWNER', 'ADMIN', 'MEMBER'];
export const ADMIN_ROLES: readonly MemberRole[] = ['OWNER', 'ADMIN'];

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export interface Club {
  id: string;
  name: string;
  timezone: string;
  status: GeneralStatus;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface Membership {
  id: string;
  userId: string;
  clubId: string;
  role: MemberRole;
  status: GeneralStatus;
  joinedAt: Date;
}
