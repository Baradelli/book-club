import { beforeEach, describe, expect, it } from 'vitest';

import { aClub, required } from '../../../test-support/builders';
import { ClubRepositoryFake } from '../club-repository-fake';

const CLUB_ID = 'club-1';

// O fake tem que mentir o mínimo possível sobre o que o Prisma faria: um
// repositório real devolve Date nova a cada leitura, nunca a mesma referência.
describe('ClubRepositoryFake', () => {
  let clubs: ClubRepositoryFake;

  beforeEach(() => {
    clubs = new ClubRepositoryFake();
  });

  it('does not let the caller corrupt the store through a Date it read', async () => {
    await clubs.save(aClub());

    const read = required(await clubs.byId(CLUB_ID));
    read.createdAt.setFullYear(1999);

    const reread = required(await clubs.byId(CLUB_ID));
    expect(reread.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('does not let the caller corrupt the store through a Date it saved', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    await clubs.save(aClub({ createdAt }));

    createdAt.setFullYear(1999);

    const read = required(await clubs.byId(CLUB_ID));
    expect(read.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('does not let the caller corrupt the store through the Date it got back from save', async () => {
    const returned = await clubs.save(aClub());

    returned.createdAt.setFullYear(1999);

    const read = required(await clubs.byId(CLUB_ID));
    expect(read.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('returns a different Date instance on every read', async () => {
    await clubs.save(aClub());

    const first = required(await clubs.byId(CLUB_ID));
    const second = required(await clubs.byId(CLUB_ID));

    expect(first.createdAt).not.toBe(second.createdAt);
    expect(first.createdAt).toEqual(second.createdAt);
  });

  it('clones the Dates exposed by the saved getter', async () => {
    await clubs.save(aClub());

    const [first] = clubs.saved;
    required(first).createdAt.setFullYear(1999);

    const read = required(await clubs.byId(CLUB_ID));
    expect(read.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  // Erro clássico: new Date(null) é a epoch, não null.
  it('keeps a null archivedAt null', async () => {
    await clubs.save(aClub({ archivedAt: null }));

    const read = required(await clubs.byId(CLUB_ID));
    expect(read.archivedAt).toBeNull();
    expect(required(clubs.saved[0]).archivedAt).toBeNull();
  });

  it('clones a non-null archivedAt', async () => {
    const archivedAt = new Date('2026-02-01T00:00:00.000Z');
    await clubs.save(aClub({ status: 'ARCHIVED', archivedAt }));

    const read = required(await clubs.byId(CLUB_ID));
    expect(read.archivedAt).not.toBe(archivedAt);
    expect(read.archivedAt).toEqual(archivedAt);
  });
});
