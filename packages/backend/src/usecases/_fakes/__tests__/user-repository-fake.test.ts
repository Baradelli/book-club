import { beforeEach, describe, expect, it } from 'vitest';

import { aUser, FIXED_ISO, required } from '../../../test-support/builders';
import { UserRepositoryFake } from '../user-repository-fake';

const EMAIL = 'maria@exemplo.com';
const USER_ID = `user-${EMAIL}`;

describe('UserRepositoryFake', () => {
  let users: UserRepositoryFake;

  beforeEach(() => {
    users = new UserRepositoryFake();
  });

  describe('Date fidelity', () => {
    it('does not let the caller corrupt the store through a Date it read', async () => {
      await users.save(aUser());

      const read = required(await users.byId(USER_ID));
      read.createdAt.setFullYear(1999);

      expect(required(await users.byId(USER_ID)).createdAt).toEqual(
        new Date(FIXED_ISO),
      );
    });

    it('does not let the caller corrupt the store through a Date it saved', async () => {
      const createdAt = new Date(FIXED_ISO);
      await users.save(aUser({ createdAt }));

      createdAt.setFullYear(1999);

      expect(required(await users.byId(USER_ID)).createdAt).toEqual(
        new Date(FIXED_ISO),
      );
    });

    it('does not let the caller corrupt the store through the Date it got back from save', async () => {
      const returned = await users.save(aUser());

      returned.createdAt.setFullYear(1999);

      expect(required(await users.byId(USER_ID)).createdAt).toEqual(
        new Date(FIXED_ISO),
      );
    });

    it('returns a different Date instance on every read', async () => {
      await users.save(aUser());

      const first = required(await users.byId(USER_ID));
      const second = required(await users.byId(USER_ID));

      expect(first.createdAt).not.toBe(second.createdAt);
      expect(first.createdAt).toEqual(second.createdAt);
    });

    it('clones the Dates exposed by the saved getter', async () => {
      await users.save(aUser());

      required(users.saved[0]).createdAt.setFullYear(1999);

      expect(required(await users.byId(USER_ID)).createdAt).toEqual(
        new Date(FIXED_ISO),
      );
    });

    it('does not let a patch alias a Date into the store', async () => {
      await users.save(aUser());
      const createdAt = new Date('2026-06-01T00:00:00.000Z');

      await users.update(USER_ID, { createdAt });
      createdAt.setFullYear(1999);

      expect(required(await users.byId(USER_ID)).createdAt).toEqual(
        new Date('2026-06-01T00:00:00.000Z'),
      );
    });
  });

  describe('byEmail', () => {
    it('finds the user by the normalized email', async () => {
      await users.save(aUser());

      const found = required(await users.byEmail(EMAIL));

      expect(found.id).toBe(USER_ID);
    });

    it('returns null when no user has that email', async () => {
      await users.save(aUser());

      await expect(users.byEmail('outra@exemplo.com')).resolves.toBeNull();
    });
  });

  describe('update', () => {
    it('applies the patch and keeps the other fields', async () => {
      await users.save(aUser({ name: 'Maria', passwordHash: null }));

      const updated = await users.update(USER_ID, {
        passwordHash: 'hashed:segredo',
      });

      expect(updated.passwordHash).toBe('hashed:segredo');
      expect(updated.name).toBe('Maria');
      expect(updated.email).toBe(EMAIL);
      expect(users.saved).toHaveLength(1);
    });

    // Fidelidade ao Prisma: `undefined` é ausência de chave, não "apague".
    // O spread do JS copia chaves com valor undefined — o fake tem que filtrar.
    it('ignores patch keys whose value is undefined', async () => {
      await users.save(aUser({ name: 'Maria', passwordHash: 'hashed:x' }));

      const updated = await users.update(USER_ID, {
        name: undefined,
        passwordHash: 'hashed:y',
      });

      expect(updated.name).toBe('Maria');
      expect(updated.passwordHash).toBe('hashed:y');
      expect(required(users.saved[0]).name).toBe('Maria');
    });

    // Contrato do fake, não regra de domínio.
    it('refuses to update an id that does not exist', async () => {
      await expect(
        users.update('user-ghost', { name: 'Ninguém' }),
      ).rejects.toThrow(/user-ghost/);
    });
  });

  // O Postgres impõe e-mail único; o fake tem que impor também, senão
  // `byEmail` passa a ser ambíguo e as regras 14-16 mentem.
  describe('unique(email)', () => {
    it('refuses a second user with the same email', async () => {
      await users.save(aUser({ id: 'user-1', email: EMAIL }));

      await expect(
        users.save(aUser({ id: 'user-2', email: EMAIL })),
      ).rejects.toThrow(/unique\(email\)/);
    });

    it('allows saving the same user id again', async () => {
      await users.save(aUser({ id: 'user-1', email: EMAIL }));

      await users.save(aUser({ id: 'user-1', email: EMAIL, name: 'Maria S.' }));

      expect(users.saved).toHaveLength(1);
      expect(required(users.saved[0]).name).toBe('Maria S.');
    });
  });
});
