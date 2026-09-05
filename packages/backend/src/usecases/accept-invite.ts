import { randomUUID } from 'node:crypto';

import type { Membership } from '../domain/club';
import {
  ClubNotFoundError,
  DuplicateMembershipError,
  InvalidInviteError,
  InviteAlreadyUsedError,
  InviteExpiredError,
  InviteNotFoundError,
  WeakPasswordError,
} from '../domain/errors';
import type { Invite } from '../domain/invite';
import { MIN_PASSWORD_LENGTH } from '../domain/invite';
import { normalizeEmail } from '../domain/normalize-email';
import { DEFAULT_SETTINGS } from '../domain/settings';
import type { User } from '../domain/user';
import type { ClubRepository } from './ports/club-repository';
import type { InviteRepository } from './ports/invite-repository';
import type { MembershipRepository } from './ports/membership-repository';
import type { PasswordHasher } from './ports/password-hasher';
import type { SettingsRepository } from './ports/settings-repository';
import type { UserRepository } from './ports/user-repository';

export interface AcceptInviteInput {
  code: string;
  email: string;
  password: string;
  name?: string;
  now?: Date;
}

export interface AcceptInviteOutput {
  user: User;
  membership: Membership;
  clubId: string;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

export class AcceptInvite {
  constructor(
    private readonly invites: InviteRepository,
    private readonly users: UserRepository,
    private readonly memberships: MembershipRepository,
    private readonly clubs: ClubRepository,
    private readonly hasher: PasswordHasher,
    private readonly settings: SettingsRepository,
  ) {}

  async execute(input: AcceptInviteInput): Promise<AcceptInviteOutput> {
    const now = input.now ?? new Date();

    // Precedência deliberada: as checagens seguem a ordem numerada das regras
    // 8→13. Um convite expirado E já usado responde InviteAlreadyUsedError —
    // "já usado" é o fato mais específico, e é o que a tela precisa dizer.
    const invite = await this.invites.byCode(input.code);
    if (!invite) {
      throw new InviteNotFoundError(`invite code ${input.code} not found`);
    }
    if (invite.usedAt !== null) {
      throw new InviteAlreadyUsedError(`invite ${invite.id} was already used`);
    }
    if (invite.expiresAt.getTime() <= now.getTime()) {
      throw new InviteExpiredError(`invite ${invite.id} has expired`);
    }

    const club = await this.clubs.byId(invite.clubId);
    if (!club || club.status !== 'ACTIVE') {
      throw new ClubNotFoundError(`club ${invite.clubId} not found`);
    }

    // Normaliza antes de qualquer busca: é o mesmo e-mail que vai ser salvo.
    const email = normalizeEmail(input.email);
    if (!EMAIL_SHAPE.test(email)) {
      throw new InvalidInviteError('invalid email');
    }

    // Incondicional: vale também quando a senha informada será ignorada pela
    // regra 15 — a tela de aceite pede senha de qualquer jeito.
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new WeakPasswordError(
        `password must have at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    const existing = await this.users.byEmail(email);
    const user = existing
      ? await this.reuseUser(existing, invite, input.password)
      : await this.createUser(email, input.password, input.name, now);

    const membership = await this.joinClub(user, invite, now);
    await this.ensureSettings(user);

    await this.invites.update(invite.id, { usedAt: now, usedById: user.id });

    return { user, membership, clubId: invite.clubId };
  }

  private async createUser(
    email: string,
    password: string,
    name: string | undefined,
    now: Date,
  ): Promise<User> {
    const trimmedName = name?.trim();
    return this.users.save({
      id: randomUUID(),
      email,
      name: trimmedName ? trimmedName : null,
      passwordHash: await this.hasher.hash(password),
      // isSuperAdmin nunca vem de convite: só do seed ou do MVP 4.
      isSuperAdmin: false,
      createdAt: now,
    });
  }

  // Quem já existe conserva senha e nome; o convite só dá acesso ao clube.
  private async reuseUser(
    existing: User,
    invite: Invite,
    password: string,
  ): Promise<User> {
    // Antes de escrever qualquer coisa: quem já é membro ativo não consome o
    // convite (regra 17), então a checagem vem antes da regra 16.
    await this.assertNotAlreadyMember(existing.id, invite.clubId);

    if (existing.passwordHash !== null) return existing;

    return this.users.update(existing.id, {
      passwordHash: await this.hasher.hash(password),
    });
  }

  private async assertNotAlreadyMember(
    userId: string,
    clubId: string,
  ): Promise<void> {
    const membership = await this.memberships.byUserAndClub(userId, clubId);
    if (membership && membership.status === 'ACTIVE') {
      throw new DuplicateMembershipError(
        `user ${userId} is already a member of club ${clubId}`,
      );
    }
  }

  private async joinClub(
    user: User,
    invite: Invite,
    now: Date,
  ): Promise<Membership> {
    const existing = await this.memberships.byUserAndClub(
      user.id,
      invite.clubId,
    );

    // O @@unique([userId, clubId]) não permite duplicar: reativa o arquivado.
    if (existing) {
      return this.memberships.save({
        ...existing,
        role: invite.role,
        status: 'ACTIVE',
        joinedAt: now,
      });
    }

    return this.memberships.save({
      id: randomUUID(),
      userId: user.id,
      clubId: invite.clubId,
      role: invite.role,
      status: 'ACTIVE',
      joinedAt: now,
    });
  }

  // Regra 20: só cria quando não existe.
  private async ensureSettings(user: User): Promise<void> {
    const existing = await this.settings.byUserId(user.id);
    if (existing) return;

    await this.settings.save({
      id: randomUUID(),
      userId: user.id,
      ...DEFAULT_SETTINGS,
    });
  }
}
