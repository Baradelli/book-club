import type { Club } from '../../domain/club';

export interface ClubRepository {
  save(club: Club): Promise<Club>;
  byId(id: string): Promise<Club | null>;
}
