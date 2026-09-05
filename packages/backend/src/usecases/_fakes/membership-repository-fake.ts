import type { Membership } from '../../domain/club';
import type { MembershipRepository } from '../ports/membership-repository';

export class MembershipRepositoryFake implements MembershipRepository {
  private store = new Map<string, Membership>();

  async save(membership: Membership): Promise<Membership> {
    this.assertUniqueUserAndClub(membership);
    this.store.set(membership.id, this.clone(membership));
    return this.clone(membership);
  }

  async byUserAndClub(
    userId: string,
    clubId: string,
  ): Promise<Membership | null> {
    for (const membership of this.store.values()) {
      if (membership.userId === userId && membership.clubId === clubId) {
        return this.clone(membership);
      }
    }
    return null;
  }

  // Só os ACTIVE: é o que o port declara e o que o getMe espera.
  async findByUser(userId: string): Promise<Membership[]> {
    return [...this.store.values()]
      .filter(
        (membership) =>
          membership.userId === userId && membership.status === 'ACTIVE',
      )
      .map((membership) => this.clone(membership));
  }

  get saved(): Membership[] {
    return [...this.store.values()].map((membership) => this.clone(membership));
  }

  // Não é erro de domínio: é o fake protegendo o @@unique([userId, clubId])
  // que o Postgres impõe. Se cair aqui, o UseCase tentou criar um membership
  // que o banco recusaria (a regra 12 manda reativar, não recriar).
  private assertUniqueUserAndClub(membership: Membership): void {
    for (const existing of this.store.values()) {
      if (
        existing.id !== membership.id &&
        existing.userId === membership.userId &&
        existing.clubId === membership.clubId
      ) {
        throw new Error(
          `MembershipRepositoryFake: saving membership ${membership.id} violates unique(userId, clubId) — user ${membership.userId} already has membership ${existing.id} in club ${membership.clubId}`,
        );
      }
    }
  }

  // Clona nos dois sentidos (entrada do save e saída da leitura): nem o
  // chamador contamina o store, nem o store devolve referência sua. A Date
  // precisa ser copiada — o Prisma devolve Date nova a cada leitura.
  private clone(membership: Membership): Membership {
    return { ...membership, joinedAt: new Date(membership.joinedAt) };
  }
}
