import { randomUUID } from 'node:crypto';

import type { MemberRole, Membership } from '../domain/club';
import { ADMIN_ROLES, MEMBER_ROLES } from '../domain/club';
import {
  ClubNotFoundError,
  DuplicateMembershipError,
  ForbiddenRoleError,
  InvalidClubError,
  NotAMemberError,
} from '../domain/errors';
import type { ClubRepository } from './ports/club-repository';
import type { MembershipRepository } from './ports/membership-repository';

export interface AddMemberInput {
  actorUserId: string;
  clubId: string;
  userId: string;
  role?: MemberRole;
}

export class AddMember {
  constructor(
    private readonly clubs: ClubRepository,
    private readonly memberships: MembershipRepository,
  ) {}

  async execute(input: AddMemberInput): Promise<Membership> {
    const club = await this.clubs.byId(input.clubId);
    if (!club || club.status !== 'ACTIVE') {
      throw new ClubNotFoundError(`club ${input.clubId} not found`);
    }

    const actor = await this.memberships.byUserAndClub(
      input.actorUserId,
      input.clubId,
    );
    // Sem membership ativo o clube não existe para o ator (404 na borda).
    if (!actor || actor.status !== 'ACTIVE') {
      throw new NotAMemberError(
        `user ${input.actorUserId} is not an active member of club ${input.clubId}`,
      );
    }
    if (!ADMIN_ROLES.includes(actor.role)) {
      throw new ForbiddenRoleError(
        `user ${input.actorUserId} must be OWNER or ADMIN to add members`,
      );
    }

    const role = input.role ?? 'MEMBER';
    if (!MEMBER_ROLES.includes(role)) {
      throw new InvalidClubError(`invalid member role`);
    }
    // Transferência de dono é MVP 4: addMember nunca cria um segundo OWNER.
    //
    // Precedência deliberada: esta guarda (regra 13) roda ANTES da checagem de
    // duplicidade (regra 11). Adicionar como OWNER alguém que já é membro ativo
    // devolve ForbiddenRoleError, não DuplicateMembershipError — a intenção
    // proibida é rejeitada antes de olhar o estado, e a resposta não muda
    // conforme quem é o alvo. Travado pelo teste "prefers ForbiddenRoleError
    // over DuplicateMembershipError...".
    if (role === 'OWNER') {
      throw new ForbiddenRoleError('a second OWNER cannot be added');
    }

    const existing = await this.memberships.byUserAndClub(
      input.userId,
      input.clubId,
    );
    if (existing && existing.status === 'ACTIVE') {
      throw new DuplicateMembershipError(
        `user ${input.userId} is already a member of club ${input.clubId}`,
      );
    }

    const joinedAt = new Date();

    // O @@unique([userId, clubId]) não permite duplicar: reativa o arquivado.
    if (existing) {
      return this.memberships.save({
        ...existing,
        role,
        status: 'ACTIVE',
        joinedAt,
      });
    }

    return this.memberships.save({
      id: randomUUID(),
      userId: input.userId,
      clubId: input.clubId,
      role,
      status: 'ACTIVE',
      joinedAt,
    });
  }
}
