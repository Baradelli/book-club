import { randomUUID } from 'node:crypto';

import type { MemberRole } from '../domain/club';
import { ADMIN_ROLES, MEMBER_ROLES } from '../domain/club';
import { ClubNotFoundError, InvalidInviteError } from '../domain/errors';
import type { Invite } from '../domain/invite';
import { DEFAULT_INVITE_TTL_DAYS } from '../domain/invite';
import type { AssertMembership } from './assert-membership';
import type { ClubRepository } from './ports/club-repository';
import type { CodeGenerator } from './ports/code-generator';
import type { InviteRepository } from './ports/invite-repository';

export interface CreateInviteInput {
  actorUserId: string;
  clubId: string;
  role?: MemberRole;
  ttlDays?: number;
}

const MAX_CODE_ATTEMPTS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export class CreateInvite {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly clubs: ClubRepository,
    private readonly invites: InviteRepository,
    private readonly codes: CodeGenerator,
  ) {}

  async execute(input: CreateInviteInput): Promise<Invite> {
    const club = await this.clubs.byId(input.clubId);
    if (!club || club.status !== 'ACTIVE') {
      throw new ClubNotFoundError(`club ${input.clubId} not found`);
    }

    // A regra de papel é a da Tarefa 01: NotAMemberError (404) para quem não
    // é do clube, ForbiddenRoleError (403) para o MEMBER. Não se reimplementa.
    await this.assertMembership.execute({
      userId: input.actorUserId,
      clubId: input.clubId,
      requireRole: ADMIN_ROLES,
    });

    const role = input.role ?? 'MEMBER';
    if (!MEMBER_ROLES.includes(role)) {
      throw new InvalidInviteError('invalid invite role');
    }
    // Convite nunca carrega OWNER: transferência de dono é MVP 4.
    if (role === 'OWNER') {
      throw new InvalidInviteError('an invite cannot grant the OWNER role');
    }

    const ttlDays = input.ttlDays ?? DEFAULT_INVITE_TTL_DAYS;
    if (!Number.isInteger(ttlDays) || ttlDays <= 0) {
      throw new InvalidInviteError('ttlDays must be a positive integer');
    }

    const code = await this.generateFreeCode();
    const now = new Date();

    return this.invites.save({
      id: randomUUID(),
      clubId: input.clubId,
      code,
      role,
      createdById: input.actorUserId,
      expiresAt: new Date(now.getTime() + ttlDays * DAY_MS),
      usedAt: null,
      usedById: null,
      createdAt: now,
    });
  }

  private async generateFreeCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = this.codes.generate();
      const taken = await this.invites.byCode(code);
      if (!taken) return code;
    }
    throw new InvalidInviteError(
      `could not generate a free invite code in ${MAX_CODE_ATTEMPTS} attempts`,
    );
  }
}
