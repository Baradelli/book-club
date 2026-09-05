import { beforeEach, describe, expect, it } from 'vitest';

import { aMembership, required } from '../../../test-support/builders';
import { MembershipRepositoryFake } from '../membership-repository-fake';

const CLUB_ID = 'club-1';
const USER_ID = 'user-1';

describe('MembershipRepositoryFake', () => {
  let memberships: MembershipRepositoryFake;

  beforeEach(() => {
    memberships = new MembershipRepositoryFake();
  });

  describe('Date fidelity', () => {
    it('does not let the caller corrupt the store through a Date it read', async () => {
      await memberships.save(aMembership());

      const read = required(await memberships.byUserAndClub(USER_ID, CLUB_ID));
      read.joinedAt.setFullYear(1999);

      const reread = required(
        await memberships.byUserAndClub(USER_ID, CLUB_ID),
      );
      expect(reread.joinedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });

    it('does not let the caller corrupt the store through a Date it saved', async () => {
      const joinedAt = new Date('2026-01-01T00:00:00.000Z');
      await memberships.save(aMembership({ joinedAt }));

      joinedAt.setFullYear(1999);

      const read = required(await memberships.byUserAndClub(USER_ID, CLUB_ID));
      expect(read.joinedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });

    it('does not let the caller corrupt the store through the Date it got back from save', async () => {
      const returned = await memberships.save(aMembership());

      returned.joinedAt.setFullYear(1999);

      const read = required(await memberships.byUserAndClub(USER_ID, CLUB_ID));
      expect(read.joinedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });

    it('returns a different Date instance on every read', async () => {
      await memberships.save(aMembership());

      const first = required(await memberships.byUserAndClub(USER_ID, CLUB_ID));
      const second = required(
        await memberships.byUserAndClub(USER_ID, CLUB_ID),
      );

      expect(first.joinedAt).not.toBe(second.joinedAt);
      expect(first.joinedAt).toEqual(second.joinedAt);
    });

    it('clones the Dates exposed by the saved getter', async () => {
      await memberships.save(aMembership());

      const [first] = memberships.saved;
      required(first).joinedAt.setFullYear(1999);

      const read = required(await memberships.byUserAndClub(USER_ID, CLUB_ID));
      expect(read.joinedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });
  });

  describe('findByUser', () => {
    it('returns only the ACTIVE memberships of the user', async () => {
      await memberships.save(
        aMembership({ userId: USER_ID, clubId: 'club-1' }),
      );
      await memberships.save(
        aMembership({ userId: USER_ID, clubId: 'club-2' }),
      );
      await memberships.save(
        aMembership({
          userId: USER_ID,
          clubId: 'club-3',
          status: 'ARCHIVED',
        }),
      );
      await memberships.save(
        aMembership({ userId: 'user-outra', clubId: 'club-1' }),
      );

      const found = await memberships.findByUser(USER_ID);

      expect(found.map((m) => m.clubId).sort()).toEqual(['club-1', 'club-2']);
    });

    it('returns an empty array when the user has none', async () => {
      await expect(memberships.findByUser('user-ghost')).resolves.toEqual([]);
    });

    it('clones the Dates it returns', async () => {
      await memberships.save(aMembership({ userId: USER_ID }));

      const [first] = await memberships.findByUser(USER_ID);
      required(first).joinedAt.setFullYear(1999);

      const [again] = await memberships.findByUser(USER_ID);
      expect(required(again).joinedAt).toEqual(
        new Date('2026-01-01T00:00:00.000Z'),
      );
    });
  });

  // O Postgres rejeita o par duplicado com violação de índice único; o fake
  // tem que rejeitar também, senão uma regressão da regra 12 passa em silêncio.
  describe('unique(userId, clubId)', () => {
    it('refuses a second membership for the same user and club', async () => {
      await memberships.save(aMembership({ id: 'membership-1' }));

      await expect(
        memberships.save(aMembership({ id: 'membership-2' })),
      ).rejects.toThrow(/unique\(userId, clubId\)/);
    });

    it('keeps only the first membership when the second is refused', async () => {
      await memberships.save(aMembership({ id: 'membership-1' }));

      await expect(
        memberships.save(aMembership({ id: 'membership-2' })),
      ).rejects.toThrow();

      expect(memberships.saved).toHaveLength(1);
      expect(required(memberships.saved[0]).id).toBe('membership-1');
    });

    it('refuses the duplicate pair even when the existing one is archived', async () => {
      await memberships.save(
        aMembership({ id: 'membership-1', status: 'ARCHIVED' }),
      );

      await expect(
        memberships.save(aMembership({ id: 'membership-2' })),
      ).rejects.toThrow(/unique\(userId, clubId\)/);
    });

    it('allows updating the same membership by id', async () => {
      await memberships.save(aMembership({ id: 'membership-1' }));

      const updated = await memberships.save(
        aMembership({ id: 'membership-1', role: 'ADMIN', status: 'ARCHIVED' }),
      );

      expect(updated.role).toBe('ADMIN');
      expect(updated.status).toBe('ARCHIVED');
      expect(memberships.saved).toHaveLength(1);
    });

    it('allows the same user in a different club', async () => {
      await memberships.save(aMembership({ id: 'membership-1' }));

      await memberships.save(
        aMembership({ id: 'membership-2', clubId: 'club-2' }),
      );

      expect(memberships.saved).toHaveLength(2);
    });

    it('allows a different user in the same club', async () => {
      await memberships.save(aMembership({ id: 'membership-1' }));

      await memberships.save(
        aMembership({ id: 'membership-2', userId: 'user-2' }),
      );

      expect(memberships.saved).toHaveLength(2);
    });
  });
});
