import type { Membership } from '../../domain/club';

export interface MembershipRepository {
  save(membership: Membership): Promise<Membership>;
  byUserAndClub(userId: string, clubId: string): Promise<Membership | null>;
  /** Só os memberships ACTIVE da pessoa. */
  findByUser(userId: string): Promise<Membership[]>;
}
