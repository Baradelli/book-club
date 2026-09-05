import { beforeEach, describe, expect, it } from 'vitest';

import {
  ClubNotFoundError,
  DuplicateMembershipError,
  InvalidInviteError,
  InviteAlreadyUsedError,
  InviteExpiredError,
  InviteNotFoundError,
  WeakPasswordError,
} from '../../domain/errors';
import { DEFAULT_SETTINGS } from '../../domain/settings';
import {
  aClub,
  aMembership,
  anInvite,
  aSettings,
  aUser,
  required,
} from '../../test-support/builders';
import { ClubRepositoryFake } from '../_fakes/club-repository-fake';
import { InviteRepositoryFake } from '../_fakes/invite-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { PasswordHasherFake } from '../_fakes/password-hasher-fake';
import { SettingsRepositoryFake } from '../_fakes/settings-repository-fake';
import { UserRepositoryFake } from '../_fakes/user-repository-fake';
import type { AcceptInviteInput } from '../accept-invite';
import { AcceptInvite } from '../accept-invite';

const CODE = 'CODE-1';
const CLUB_ID = 'club-1';
const EMAIL = 'maria@exemplo.com';
const PASSWORD = 'senha-forte';
const NOW = new Date('2026-01-02T00:00:00.000Z');
const AFTER_EXPIRY = new Date('2026-01-09T00:00:00.000Z');

describe('AcceptInvite', () => {
  let invites: InviteRepositoryFake;
  let users: UserRepositoryFake;
  let memberships: MembershipRepositoryFake;
  let clubs: ClubRepositoryFake;
  let hasher: PasswordHasherFake;
  let settings: SettingsRepositoryFake;
  let useCase: AcceptInvite;

  beforeEach(async () => {
    invites = new InviteRepositoryFake();
    users = new UserRepositoryFake();
    memberships = new MembershipRepositoryFake();
    clubs = new ClubRepositoryFake();
    hasher = new PasswordHasherFake();
    settings = new SettingsRepositoryFake();
    useCase = new AcceptInvite(
      invites,
      users,
      memberships,
      clubs,
      hasher,
      settings,
    );

    await clubs.save(aClub());
    await invites.save(anInvite({ code: CODE, clubId: CLUB_ID }));
  });

  function accept(overrides: Partial<AcceptInviteInput> = {}) {
    return useCase.execute({
      code: CODE,
      email: EMAIL,
      password: PASSWORD,
      now: NOW,
      ...overrides,
    });
  }

  // Regras 9 e 17: o convite não pode ser consumido quando o aceite falha.
  async function expectInviteStillUnused(code: string = CODE): Promise<void> {
    const invite = required(await invites.byCode(code));
    expect(invite.usedAt).toBeNull();
    expect(invite.usedById).toBeNull();
  }

  describe('new person', () => {
    // Regras 14, 19 e 20
    it('creates the user, the settings and the membership, and marks the invite used', async () => {
      const result = await accept({ name: 'Maria' });

      expect(result.clubId).toBe(CLUB_ID);
      expect(result.user.email).toBe(EMAIL);
      expect(result.user.name).toBe('Maria');
      expect(result.user.isSuperAdmin).toBe(false);
      expect(result.user.createdAt).toBeInstanceOf(Date);

      expect(result.membership.userId).toBe(result.user.id);
      expect(result.membership.clubId).toBe(CLUB_ID);
      expect(result.membership.role).toBe('MEMBER');
      expect(result.membership.status).toBe('ACTIVE');

      expect(users.saved).toHaveLength(1);
      expect(memberships.saved).toHaveLength(1);
      expect(settings.saved).toHaveLength(1);

      const invite = required(await invites.byCode(CODE));
      expect(invite.usedAt).toEqual(NOW);
      expect(invite.usedById).toBe(result.user.id);
    });

    // Regra 14 — o papel vem do convite, não do input.
    it('uses the role carried by the invite', async () => {
      await invites.save(
        anInvite({ code: 'ADMIN-CODE', clubId: CLUB_ID, role: 'ADMIN' }),
      );

      const result = await accept({ code: 'ADMIN-CODE' });

      expect(result.membership.role).toBe('ADMIN');
    });

    // Regra 14 + Definição de pronto: a senha nunca em claro.
    it('stores the password hashed, never in clear', async () => {
      // Com `name`: sem um campo de texto livre no User não haveria onde a
      // senha vazar embutida, e a asserção mascarada não teria o que pegar.
      const result = await accept({ name: 'Maria' });

      expect(result.user.passwordHash).toBe(`hashed:${PASSWORD}`);
      const stored = required(users.saved[0]);
      expect(stored.passwordHash).toBe(`hashed:${PASSWORD}`);

      // A senha não aparece em claro em NENHUM lugar do User — nem como valor
      // de campo, nem embutida dentro de outro texto. O hash legítimo é
      // mascarado antes da busca porque o fake embute a senha nele de
      // propósito (`hashed:<senha>`), para o `compare` funcionar sem bcrypt.
      const masked = JSON.stringify(stored).replaceAll(
        `hashed:${PASSWORD}`,
        '<HASH>',
      );
      expect(masked).not.toContain(PASSWORD);
      expect(Object.values(stored)).not.toContain(PASSWORD);

      // Nenhum campo a mais: um `password` em claro ao lado do hash cai aqui
      // mesmo que o valor fosse transformado.
      expect(Object.keys(stored).sort()).toEqual([
        'createdAt',
        'email',
        'id',
        'isSuperAdmin',
        'name',
        'passwordHash',
      ]);

      await expect(
        hasher.compare(PASSWORD, required(stored.passwordHash)),
      ).resolves.toBe(true);
    });

    // Regra 12
    it('normalizes the email before saving it', async () => {
      const result = await accept({ email: '  MARIA@Exemplo.COM  ' });

      expect(result.user.email).toBe(EMAIL);
      expect(required(users.saved[0]).email).toBe(EMAIL);
      await expect(users.byEmail(EMAIL)).resolves.not.toBeNull();
    });

    // A outra metade da regra 12: normalizar só na gravação faria esta pessoa
    // não ser reconhecida, virar um usuário novo e colidir com o
    // User.email @unique do Postgres — violação de índice, não erro de domínio.
    it('normalizes the email before looking the person up', async () => {
      const existing = aUser({
        email: EMAIL,
        passwordHash: 'hashed:senha-antiga',
      });
      await users.save(existing);

      const result = await accept({ email: '  MARIA@Exemplo.COM  ' });

      expect(users.saved).toHaveLength(1);
      expect(result.user.id).toBe(existing.id);
      expect(result.user.passwordHash).toBe('hashed:senha-antiga');
    });

    // Regra 12 — e-mail já cadastrado com outra caixa reaproveita a pessoa.
    it('finds an existing person even when the email case differs', async () => {
      await users.save(aUser({ email: EMAIL, passwordHash: 'hashed:antiga' }));

      const result = await accept({ email: 'MARIA@EXEMPLO.COM' });

      expect(users.saved).toHaveLength(1);
      expect(result.user.passwordHash).toBe('hashed:antiga');
    });

    // Regra 14
    it('trims the name', async () => {
      const result = await accept({ name: '  Maria  ' });

      expect(result.user.name).toBe('Maria');
    });

    // Regra 14
    it.each([
      ['absent', undefined],
      ['blank', '   '],
    ])('stores a null name when it is %s', async (_label, name) => {
      const result = await accept({ name });

      expect(result.user.name).toBeNull();
    });

    // Regra 14
    it('creates the settings with the defaults', async () => {
      const result = await accept();

      const stored = required(await settings.byUserId(result.user.id));
      expect(stored.timezone).toBe(DEFAULT_SETTINGS.timezone);
      expect(stored.locale).toBe(DEFAULT_SETTINGS.locale);
      expect(stored.reminderTime).toBe(DEFAULT_SETTINGS.reminderTime);
      expect(stored.reminderEnabled).toBe(DEFAULT_SETTINGS.reminderEnabled);
      expect(stored.notifyGroupActivity).toBe(
        DEFAULT_SETTINGS.notifyGroupActivity,
      );
    });
  });

  describe('invite validation', () => {
    // Regra 8
    it('rejects a code that does not exist', async () => {
      await expect(accept({ code: 'GHOST' })).rejects.toBeInstanceOf(
        InviteNotFoundError,
      );

      expect(users.saved).toHaveLength(0);
      await expectInviteStillUnused();
    });

    // Regra 9
    it('rejects an invite that was already used', async () => {
      await invites.save(
        anInvite({
          code: CODE,
          clubId: CLUB_ID,
          usedAt: new Date('2026-01-01T12:00:00.000Z'),
          usedById: 'user-outra',
        }),
      );

      await expect(accept()).rejects.toBeInstanceOf(InviteAlreadyUsedError);

      expect(users.saved).toHaveLength(0);
    });

    // Regra 10
    it('rejects an expired invite', async () => {
      await expect(accept({ now: AFTER_EXPIRY })).rejects.toBeInstanceOf(
        InviteExpiredError,
      );

      expect(users.saved).toHaveLength(0);
      await expectInviteStillUnused();
    });

    // Regra 10 — o limite é inclusivo: expiresAt == now já está expirado.
    it('treats an invite expiring exactly now as expired', async () => {
      const expiresAt = new Date('2026-01-08T00:00:00.000Z');

      await expect(accept({ now: expiresAt })).rejects.toBeInstanceOf(
        InviteExpiredError,
      );

      await expectInviteStillUnused();
    });

    // Precedência 9 → 10: usado E expirado responde "já usado".
    it('prefers InviteAlreadyUsedError over InviteExpiredError', async () => {
      await invites.save(
        anInvite({
          code: CODE,
          clubId: CLUB_ID,
          usedAt: new Date('2026-01-01T12:00:00.000Z'),
          usedById: 'user-outra',
        }),
      );

      // `toBeInstanceOf` já é estritamente mais forte que a negativa: só
      // InviteAlreadyUsedError passa, InviteExpiredError não.
      await expect(accept({ now: AFTER_EXPIRY })).rejects.toBeInstanceOf(
        InviteAlreadyUsedError,
      );
    });

    // Regra 11
    it('rejects an invite whose club is archived', async () => {
      await clubs.save(
        aClub({ status: 'ARCHIVED', archivedAt: new Date('2026-01-01') }),
      );

      await expect(accept()).rejects.toBeInstanceOf(ClubNotFoundError);

      expect(users.saved).toHaveLength(0);
      await expectInviteStillUnused();
    });

    // Regra 11 — o outro ramo: clube que não existe, não apenas arquivado.
    it('rejects an invite whose club does not exist', async () => {
      await invites.save(
        anInvite({ code: 'GHOST-CLUB', clubId: 'club-ghost' }),
      );

      await expect(accept({ code: 'GHOST-CLUB' })).rejects.toBeInstanceOf(
        ClubNotFoundError,
      );

      expect(users.saved).toHaveLength(0);
      await expectInviteStillUnused('GHOST-CLUB');
    });

    // Regra 12
    it.each([
      ['empty', ''],
      ['blank', '   '],
      ['without @', 'maria.exemplo.com'],
      ['without a domain', 'maria@'],
      ['without a local part', '@exemplo.com'],
    ])('rejects an email that is %s', async (_label, email) => {
      await expect(accept({ email })).rejects.toBeInstanceOf(
        InvalidInviteError,
      );

      expect(users.saved).toHaveLength(0);
      await expectInviteStillUnused();
    });

    // Regra 13
    it('rejects a password shorter than the minimum', async () => {
      await expect(accept({ password: 'abc' })).rejects.toBeInstanceOf(
        WeakPasswordError,
      );

      expect(users.saved).toHaveLength(0);
      await expectInviteStillUnused();
    });
  });

  describe('person who already exists', () => {
    // Regras 15 e 20
    it('keeps the existing password and settings, and only adds the membership', async () => {
      const existing = aUser({
        email: EMAIL,
        passwordHash: 'hashed:senha-antiga',
      });
      await users.save(existing);
      await settings.save(aSettings({ userId: existing.id, locale: 'en' }));

      const result = await accept({ password: 'outra-senha-longa' });

      expect(result.user.id).toBe(existing.id);
      expect(result.user.passwordHash).toBe('hashed:senha-antiga');
      expect(users.saved).toHaveLength(1);
      expect(settings.saved).toHaveLength(1);
      expect(required(settings.saved[0]).locale).toBe('en');
      expect(memberships.saved).toHaveLength(1);
      expect(required(memberships.saved[0]).userId).toBe(existing.id);
    });

    // O aceite não renomeia quem já existe (a regra 14 fala de `name` só na
    // criação).
    it('does not change the name of a person who already exists', async () => {
      const existing = aUser({
        email: EMAIL,
        name: 'Maria Antiga',
        passwordHash: 'hashed:senha-antiga',
      });
      await users.save(existing);

      const result = await accept({ name: 'Maria Nova' });

      expect(result.user.name).toBe('Maria Antiga');
      expect(required(users.saved[0]).name).toBe('Maria Antiga');
    });

    // Regra 16
    it('sets the password when the person has none yet', async () => {
      const existing = aUser({ email: EMAIL, passwordHash: null });
      await users.save(existing);

      const result = await accept();

      expect(result.user.passwordHash).toBe(`hashed:${PASSWORD}`);
      expect(required(users.saved[0]).passwordHash).toBe(`hashed:${PASSWORD}`);
      expect(users.saved).toHaveLength(1);
    });

    // Regra 20 — quem já existe sem Settings ganha um.
    it('creates the settings when the existing person has none', async () => {
      const existing = aUser({
        email: EMAIL,
        passwordHash: 'hashed:senha-antiga',
      });
      await users.save(existing);

      const result = await accept();

      expect(settings.saved).toHaveLength(1);
      await expect(settings.byUserId(result.user.id)).resolves.not.toBeNull();
    });

    // Regra 13 é incondicional: vale mesmo quando a senha informada seria
    // ignorada pela regra 15.
    it('still rejects a weak password when the person already has one', async () => {
      const existing = aUser({
        email: EMAIL,
        passwordHash: 'hashed:senha-antiga',
      });
      await users.save(existing);

      await expect(accept({ password: 'abc' })).rejects.toBeInstanceOf(
        WeakPasswordError,
      );

      expect(required(users.saved[0]).passwordHash).toBe('hashed:senha-antiga');
      expect(memberships.saved).toHaveLength(0);
      await expectInviteStillUnused();
    });

    // Regra 17
    it('rejects someone who is already an active member, without consuming the invite', async () => {
      const existing = aUser({
        email: EMAIL,
        passwordHash: 'hashed:senha-antiga',
      });
      await users.save(existing);
      await memberships.save(
        aMembership({ userId: existing.id, clubId: CLUB_ID, role: 'MEMBER' }),
      );
      const membershipsBefore = memberships.saved.length;

      await expect(accept()).rejects.toBeInstanceOf(DuplicateMembershipError);

      expect(memberships.saved).toHaveLength(membershipsBefore);
      await expectInviteStillUnused();
    });

    // Regra 18
    it('reactivates an archived membership with the role from the invite', async () => {
      const existing = aUser({
        email: EMAIL,
        passwordHash: 'hashed:senha-antiga',
      });
      await users.save(existing);
      await memberships.save(
        aMembership({
          id: 'membership-archived',
          userId: existing.id,
          clubId: CLUB_ID,
          role: 'MEMBER',
          status: 'ARCHIVED',
        }),
      );
      await invites.save(
        anInvite({ code: 'ADMIN-CODE', clubId: CLUB_ID, role: 'ADMIN' }),
      );

      const result = await accept({ code: 'ADMIN-CODE' });

      expect(result.membership.id).toBe('membership-archived');
      expect(result.membership.status).toBe('ACTIVE');
      expect(result.membership.role).toBe('ADMIN');
      expect(result.membership.joinedAt).toEqual(NOW);
      expect(memberships.saved).toHaveLength(1);
    });
  });

  // Regra 19
  it('refuses a second acceptance of the same code', async () => {
    await accept();

    await expect(accept({ email: 'outra@exemplo.com' })).rejects.toBeInstanceOf(
      InviteAlreadyUsedError,
    );

    expect(users.saved).toHaveLength(1);
  });
});
