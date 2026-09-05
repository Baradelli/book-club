import type { Invite } from '../../domain/invite';
import type { InviteRepository } from '../ports/invite-repository';
import { withoutUndefined } from './without-undefined';

export class InviteRepositoryFake implements InviteRepository {
  private store = new Map<string, Invite>();

  async save(invite: Invite): Promise<Invite> {
    this.assertUniqueCode(invite);
    this.store.set(invite.id, this.clone(invite));
    return this.clone(invite);
  }

  async byCode(code: string): Promise<Invite | null> {
    for (const invite of this.store.values()) {
      if (invite.code === code) return this.clone(invite);
    }
    return null;
  }

  async update(id: string, patch: Partial<Invite>): Promise<Invite> {
    const existing = this.store.get(id);
    if (!existing) {
      throw new Error(
        `InviteRepositoryFake: cannot update invite ${id} — it was never saved`,
      );
    }
    // O clone corta o aliasing de Date que venha pelo patch.
    const updated = this.clone({
      ...existing,
      ...withoutUndefined(patch),
      id,
    });
    this.assertUniqueCode(updated);
    this.store.set(id, updated);
    return this.clone(updated);
  }

  get saved(): Invite[] {
    return [...this.store.values()].map((invite) => this.clone(invite));
  }

  // Contrato do fake, não regra de domínio: o `code` é a chave de busca do
  // convite, e duplicá-lo esconderia uma regressão da regra 6.
  private assertUniqueCode(invite: Invite): void {
    for (const existing of this.store.values()) {
      if (existing.id !== invite.id && existing.code === invite.code) {
        throw new Error(
          `InviteRepositoryFake: saving invite ${invite.id} violates unique(code) — ${existing.id} already uses ${invite.code}`,
        );
      }
    }
  }

  private clone(invite: Invite): Invite {
    return {
      ...invite,
      expiresAt: new Date(invite.expiresAt),
      // null preservado: new Date(null) seria a epoch, não null.
      usedAt: invite.usedAt === null ? null : new Date(invite.usedAt),
      createdAt: new Date(invite.createdAt),
    };
  }
}
