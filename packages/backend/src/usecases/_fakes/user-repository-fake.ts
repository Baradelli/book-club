import type { User } from '../../domain/user';
import type { UserRepository } from '../ports/user-repository';
import { withoutUndefined } from './without-undefined';

export class UserRepositoryFake implements UserRepository {
  private store = new Map<string, User>();

  async save(user: User): Promise<User> {
    this.assertUniqueEmail(user);
    this.store.set(user.id, this.clone(user));
    return this.clone(user);
  }

  async byId(id: string): Promise<User | null> {
    const found = this.store.get(id);
    return found ? this.clone(found) : null;
  }

  async byEmail(email: string): Promise<User | null> {
    for (const user of this.store.values()) {
      if (user.email === email) return this.clone(user);
    }
    return null;
  }

  async update(id: string, patch: Partial<User>): Promise<User> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new Error(
        `UserRepositoryFake: cannot update user ${id} — it was never saved`,
      );
    }
    // O clone corta o aliasing de Date que venha pelo patch.
    const updated = this.clone({
      ...existing,
      ...withoutUndefined(patch),
      id,
    });
    this.assertUniqueEmail(updated);
    this.store.set(id, updated);
    return this.clone(updated);
  }

  get saved(): User[] {
    return [...this.store.values()].map((user) => this.clone(user));
  }

  // Contrato do fake, não regra de domínio: o Postgres impõe e-mail único, e
  // sem isso `byEmail` seria ambíguo e as regras 14-16 mentiriam.
  private assertUniqueEmail(user: User): void {
    for (const existing of this.store.values()) {
      if (existing.id !== user.id && existing.email === user.email) {
        throw new Error(
          `UserRepositoryFake: saving user ${user.id} violates unique(email) — ${existing.id} already uses ${user.email}`,
        );
      }
    }
  }

  private clone(user: User): User {
    return { ...user, createdAt: new Date(user.createdAt) };
  }
}
