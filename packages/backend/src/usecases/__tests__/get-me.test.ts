import { beforeEach, describe, expect, it } from 'vitest';

import { NotAMemberError, SessionUserNotFoundError } from '../../domain/errors';
import { aClub, aMembership, aUser } from '../../test-support/builders';
import { ClubRepositoryFake } from '../_fakes/club-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { UserRepositoryFake } from '../_fakes/user-repository-fake';
import { GetMe } from '../get-me';

const USER_ID = 'user-maria';

describe('GetMe', () => {
  let users: UserRepositoryFake;
  let memberships: MembershipRepositoryFake;
  let clubs: ClubRepositoryFake;
  let useCase: GetMe;

  beforeEach(async () => {
    users = new UserRepositoryFake();
    memberships = new MembershipRepositoryFake();
    clubs = new ClubRepositoryFake();
    useCase = new GetMe(users, memberships, clubs);

    await users.save(
      aUser({ id: USER_ID, email: 'maria@exemplo.com', name: 'Maria' }),
    );
  });

  it('returns the user with an empty club list when they have no membership', async () => {
    const result = await useCase.execute({ userId: USER_ID });

    expect(result.user.id).toBe(USER_ID);
    expect(result.user.email).toBe('maria@exemplo.com');
    expect(result.user.name).toBe('Maria');
    expect(result.clubs).toEqual([]);
  });

  it('returns each active club with the role of the membership', async () => {
    await clubs.save(aClub({ id: 'club-1', name: 'Clube do Casal' }));
    await clubs.save(aClub({ id: 'club-2', name: 'Clube dos Amigos' }));
    await memberships.save(
      aMembership({ userId: USER_ID, clubId: 'club-1', role: 'OWNER' }),
    );
    await memberships.save(
      aMembership({ userId: USER_ID, clubId: 'club-2', role: 'MEMBER' }),
    );

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.clubs).toHaveLength(2);
    expect(result.clubs).toEqual(
      expect.arrayContaining([
        { id: 'club-1', name: 'Clube do Casal', role: 'OWNER' },
        { id: 'club-2', name: 'Clube dos Amigos', role: 'MEMBER' },
      ]),
    );
  });

  it('leaves out clubs whose membership is archived', async () => {
    await clubs.save(aClub({ id: 'club-1', name: 'Clube do Casal' }));
    await clubs.save(aClub({ id: 'club-2', name: 'Clube Antigo' }));
    await memberships.save(
      aMembership({ userId: USER_ID, clubId: 'club-1', role: 'MEMBER' }),
    );
    await memberships.save(
      aMembership({
        userId: USER_ID,
        clubId: 'club-2',
        role: 'MEMBER',
        status: 'ARCHIVED',
      }),
    );

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.clubs).toEqual([
      { id: 'club-1', name: 'Clube do Casal', role: 'MEMBER' },
    ]);
  });

  it('leaves out clubs of other people', async () => {
    await clubs.save(aClub({ id: 'club-1', name: 'Clube do Casal' }));
    await clubs.save(aClub({ id: 'club-2', name: 'Clube de Outra' }));
    await memberships.save(
      aMembership({ userId: USER_ID, clubId: 'club-1', role: 'MEMBER' }),
    );
    await memberships.save(
      aMembership({ userId: 'user-outra', clubId: 'club-2', role: 'OWNER' }),
    );

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.clubs).toEqual([
      { id: 'club-1', name: 'Clube do Casal', role: 'MEMBER' },
    ]);
  });

  // Um clube arquivado não deve aparecer no seletor mesmo com membership ativo.
  it('leaves out archived clubs', async () => {
    await clubs.save(
      aClub({
        id: 'club-1',
        name: 'Clube Arquivado',
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    );
    await memberships.save(
      aMembership({ userId: USER_ID, clubId: 'club-1', role: 'OWNER' }),
    );

    const result = await useCase.execute({ userId: USER_ID });

    expect(result.clubs).toEqual([]);
  });

  // 401, não 404: o front precisa deslogar. E é erro PRÓPRIO — reaproveitar
  // NotAMemberError faria o corte de tenant (404) deslogar quem errou de clube.
  it('rejects a session whose user does not exist', async () => {
    await expect(
      useCase.execute({ userId: 'user-ghost' }),
    ).rejects.toBeInstanceOf(SessionUserNotFoundError);
  });

  it('does not reuse the tenant-cut error for a missing session user', async () => {
    await expect(
      useCase.execute({ userId: 'user-ghost' }),
    ).rejects.not.toBeInstanceOf(NotAMemberError);
  });
});
