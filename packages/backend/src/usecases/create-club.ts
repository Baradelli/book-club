import { randomUUID } from 'node:crypto';

import type { Club, Membership } from '../domain/club';
import { DEFAULT_TIMEZONE } from '../domain/club';
import { InvalidClubError, NotSuperAdminError } from '../domain/errors';
import type { ClubRepository } from './ports/club-repository';
import type { MembershipRepository } from './ports/membership-repository';
import type { UserRepository } from './ports/user-repository';

export interface CreateClubInput {
  actorUserId: string;
  name: string;
  timezone?: string;
  ownerUserId?: string;
}

export interface CreateClubOutput {
  club: Club;
  ownerMembership: Membership;
}

export class CreateClub {
  constructor(
    // Só o `isSuperAdmin` interessa aqui; o resto do User é da Tarefa 02.
    private readonly users: UserRepository,
    private readonly clubs: ClubRepository,
    private readonly memberships: MembershipRepository,
  ) {}

  async execute(input: CreateClubInput): Promise<CreateClubOutput> {
    // Criar clube é ação de plataforma, não de clube: exige super-admin.
    const actor = await this.users.byId(input.actorUserId);
    if (!actor || !actor.isSuperAdmin) {
      throw new NotSuperAdminError(
        `user ${input.actorUserId} is not a super-admin`,
      );
    }

    const name = input.name.trim();
    if (name.length === 0) {
      throw new InvalidClubError('club name must not be empty');
    }

    const timezone =
      input.timezone === undefined ? DEFAULT_TIMEZONE : input.timezone.trim();
    if (timezone.length === 0) {
      throw new InvalidClubError('club timezone must not be empty');
    }

    const now = new Date();

    const club = await this.clubs.save({
      id: randomUUID(),
      name,
      timezone,
      status: 'ACTIVE',
      archivedAt: null,
      createdAt: now,
    });

    // Clube sem dono é estado inválido: o OWNER nasce na mesma operação.
    const ownerMembership = await this.memberships.save({
      id: randomUUID(),
      userId: input.ownerUserId ?? input.actorUserId,
      clubId: club.id,
      role: 'OWNER',
      status: 'ACTIVE',
      joinedAt: now,
    });

    return { club, ownerMembership };
  }
}
