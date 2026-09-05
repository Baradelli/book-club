import type { Club } from '../../domain/club';
import type { ClubRepository } from '../ports/club-repository';

export class ClubRepositoryFake implements ClubRepository {
  private store = new Map<string, Club>();

  async save(club: Club): Promise<Club> {
    this.store.set(club.id, this.clone(club));
    return this.clone(club);
  }

  async byId(id: string): Promise<Club | null> {
    const found = this.store.get(id);
    return found ? this.clone(found) : null;
  }

  get saved(): Club[] {
    return [...this.store.values()].map((club) => this.clone(club));
  }

  // Clona nos dois sentidos (entrada do save e saída da leitura): nem o
  // chamador contamina o store, nem o store devolve referência sua. As Date
  // precisam ser copiadas — o Prisma devolve Date nova a cada leitura, e um
  // `d.setHours(0, 0, 0, 0)` no cálculo de fuso corromperia o store.
  private clone(club: Club): Club {
    return {
      ...club,
      createdAt: new Date(club.createdAt),
      // null preservado: new Date(null) seria a epoch, não null.
      archivedAt: club.archivedAt === null ? null : new Date(club.archivedAt),
    };
  }
}
