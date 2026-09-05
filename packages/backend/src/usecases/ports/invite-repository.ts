import type { Invite } from '../../domain/invite';

export interface InviteRepository {
  save(invite: Invite): Promise<Invite>;
  byCode(code: string): Promise<Invite | null>;
  update(id: string, patch: Partial<Invite>): Promise<Invite>;
}
