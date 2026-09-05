import { beforeEach, describe, expect, it } from 'vitest';

import {
  anInvite,
  EXPIRES_ISO,
  FIXED_ISO,
  required,
} from '../../../test-support/builders';
import { InviteRepositoryFake } from '../invite-repository-fake';

const CODE = 'CODE-1';
const INVITE_ID = `invite-${CODE}`;

describe('InviteRepositoryFake', () => {
  let invites: InviteRepositoryFake;

  beforeEach(() => {
    invites = new InviteRepositoryFake();
  });

  describe('Date fidelity', () => {
    it('does not let the caller corrupt the store through Dates it read', async () => {
      await invites.save(anInvite());

      const read = required(await invites.byCode(CODE));
      read.expiresAt.setFullYear(1999);
      read.createdAt.setFullYear(1999);

      const reread = required(await invites.byCode(CODE));
      expect(reread.expiresAt).toEqual(new Date(EXPIRES_ISO));
      expect(reread.createdAt).toEqual(new Date(FIXED_ISO));
    });

    it('does not let the caller corrupt the store through Dates it saved', async () => {
      const expiresAt = new Date(EXPIRES_ISO);
      await invites.save(anInvite({ expiresAt }));

      expiresAt.setFullYear(1999);

      expect(required(await invites.byCode(CODE)).expiresAt).toEqual(
        new Date(EXPIRES_ISO),
      );
    });

    it('does not let the caller corrupt the store through the Dates it got back from save', async () => {
      const returned = await invites.save(anInvite());

      returned.expiresAt.setFullYear(1999);

      expect(required(await invites.byCode(CODE)).expiresAt).toEqual(
        new Date(EXPIRES_ISO),
      );
    });

    it('returns different Date instances on every read', async () => {
      await invites.save(anInvite());

      const first = required(await invites.byCode(CODE));
      const second = required(await invites.byCode(CODE));

      expect(first.expiresAt).not.toBe(second.expiresAt);
      expect(first.expiresAt).toEqual(second.expiresAt);
    });

    it('clones a non-null usedAt', async () => {
      const usedAt = new Date('2026-01-05T00:00:00.000Z');
      await invites.save(anInvite({ usedAt, usedById: 'user-1' }));

      const read = required(await invites.byCode(CODE));
      expect(read.usedAt).not.toBe(usedAt);
      expect(read.usedAt).toEqual(usedAt);
    });

    // new Date(null) seria a epoch, não null.
    it('keeps a null usedAt null', async () => {
      await invites.save(anInvite({ usedAt: null }));

      expect(required(await invites.byCode(CODE)).usedAt).toBeNull();
      expect(required(invites.saved[0]).usedAt).toBeNull();
    });

    it('does not let a patch alias a Date into the store', async () => {
      await invites.save(anInvite());
      const usedAt = new Date('2026-01-05T00:00:00.000Z');

      await invites.update(INVITE_ID, { usedAt, usedById: 'user-1' });
      usedAt.setFullYear(1999);

      expect(required(await invites.byCode(CODE)).usedAt).toEqual(
        new Date('2026-01-05T00:00:00.000Z'),
      );
    });
  });

  describe('byCode', () => {
    it('returns null when no invite has that code', async () => {
      await invites.save(anInvite());

      await expect(invites.byCode('OUTRO-CODIGO')).resolves.toBeNull();
    });
  });

  describe('update', () => {
    it('applies the patch and keeps the other fields', async () => {
      await invites.save(anInvite());
      const usedAt = new Date('2026-01-05T00:00:00.000Z');

      const updated = await invites.update(INVITE_ID, {
        usedAt,
        usedById: 'user-1',
      });

      expect(updated.usedAt).toEqual(usedAt);
      expect(updated.usedById).toBe('user-1');
      expect(updated.code).toBe(CODE);
      expect(invites.saved).toHaveLength(1);
    });

    // Fidelidade ao Prisma: `undefined` é ausência de chave, não "apague".
    it('ignores patch keys whose value is undefined', async () => {
      await invites.save(anInvite({ usedById: 'user-1' }));

      const updated = await invites.update(INVITE_ID, {
        usedById: undefined,
        role: 'ADMIN',
      });

      expect(updated.usedById).toBe('user-1');
      expect(updated.role).toBe('ADMIN');
    });

    // Contrato do fake, não regra de domínio.
    it('refuses to update an id that does not exist', async () => {
      await expect(
        invites.update('invite-ghost', { usedById: 'user-1' }),
      ).rejects.toThrow(/invite-ghost/);
    });
  });

  // O `code` é a chave de busca do convite: duplicá-lo tornaria `byCode`
  // ambíguo e esconderia uma regressão da regra 6.
  describe('unique(code)', () => {
    it('refuses a second invite with the same code', async () => {
      await invites.save(anInvite({ id: 'invite-1', code: CODE }));

      await expect(
        invites.save(anInvite({ id: 'invite-2', code: CODE })),
      ).rejects.toThrow(/unique\(code\)/);
    });

    it('allows saving the same invite id again', async () => {
      await invites.save(anInvite({ id: 'invite-1', code: CODE }));

      await invites.save(
        anInvite({ id: 'invite-1', code: CODE, role: 'ADMIN' }),
      );

      expect(invites.saved).toHaveLength(1);
      expect(required(invites.saved[0]).role).toBe('ADMIN');
    });
  });
});
