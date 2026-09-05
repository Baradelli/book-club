import type { MemberRole } from '../domain/club';
import { SessionUserNotFoundError } from '../domain/errors';
import type { User } from '../domain/user';
import type { ClubRepository } from './ports/club-repository';
import type { MembershipRepository } from './ports/membership-repository';
import type { UserRepository } from './ports/user-repository';

export interface GetMeInput {
  userId: string;
}

export interface GetMeClub {
  id: string;
  name: string;
  role: MemberRole;
}

export interface GetMeOutput {
  user: User;
  clubs: GetMeClub[];
}

export class GetMe {
  constructor(
    private readonly users: UserRepository,
    private readonly memberships: MembershipRepository,
    private readonly clubs: ClubRepository,
  ) {}

  async execute(input: GetMeInput): Promise<GetMeOutput> {
    const user = await this.users.byId(input.userId);
    // Token válido de uma conta que não existe mais: 401, para o front
    // deslogar. Erro próprio, não NotAMemberError — reaproveitá-lo faria o
    // corte de tenant deslogar quem só errou de clube.
    if (!user) {
      throw new SessionUserNotFoundError(
        `session user ${input.userId} not found`,
      );
    }

    // findByUser já devolve só os ACTIVE.
    const memberships = await this.memberships.findByUser(input.userId);

    const clubs: GetMeClub[] = [];
    for (const membership of memberships) {
      const club = await this.clubs.byId(membership.clubId);
      // Clube arquivado não aparece no seletor, mesmo com membership ativo.
      if (!club || club.status !== 'ACTIVE') continue;
      clubs.push({ id: club.id, name: club.name, role: membership.role });
    }

    return { user, clubs };
  }
}
