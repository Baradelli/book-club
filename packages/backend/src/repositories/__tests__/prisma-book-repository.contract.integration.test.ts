import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { required } from '../../test-support/builders';
import { PrismaBookRepository } from '../prisma-book-repository';
import { prefixedEmail, prefixedId, prisma, removeFixtures } from './_db';

const CLUB_ID = prefixedId('t07', 'book-club');
const OTHER_CLUB_ID = prefixedId('t07', 'book-otherclub');
const AUTHOR_ID = prefixedId('t07', 'book-author');

const BOOK_ID = prefixedId('t07', 'book');
const UPSERT_BOOK_ID = prefixedId('t07', 'book-upsert');
const PATCH_BOOK_ID = prefixedId('t07', 'book-patch');
const ARCHIVED_BOOK_ID = prefixedId('t07', 'book-archived');
const OTHER_CLUB_BOOK_ID = prefixedId('t07', 'book-otherclub-book');

const bookIds = [
  BOOK_ID,
  UPSERT_BOOK_ID,
  PATCH_BOOK_ID,
  ARCHIVED_BOOK_ID,
  OTHER_CLUB_BOOK_ID,
];

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function aRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    clubId: CLUB_ID,
    title: 'O Hobbit',
    author: 'J. R. R. Tolkien',
    month: '2026-10',
    coverUrl: null,
    totalPages: 320,
    createdById: AUTHOR_ID,
    status: 'ACTIVE' as const,
    archivedAt: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

async function cleanUp(): Promise<void> {
  await removeFixtures({
    bookIds,
    clubIds: [CLUB_ID, OTHER_CLUB_ID],
    userIds: [AUTHOR_ID],
  });
}

describe('PrismaBookRepository (contract)', () => {
  const repo = new PrismaBookRepository(prisma);

  beforeAll(async () => {
    await cleanUp();

    await prisma.user.create({
      data: {
        id: AUTHOR_ID,
        email: prefixedEmail('t07', 'book-author'),
        name: 'Fixture Admin',
      },
    });
    for (const [id, name] of [
      [CLUB_ID, 'Clube do Livro'],
      [OTHER_CLUB_ID, 'Clube de Outra Gente'],
    ] as const) {
      await prisma.club.create({ data: { id, name } });
    }
  });

  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
  });

  it('saves a book and reads it back with the fields mapped', async () => {
    const saved = await repo.save(aRow(BOOK_ID));

    expect(saved.id).toBe(BOOK_ID);

    const read = required(await repo.byId(BOOK_ID));
    expect(read).toEqual({
      id: BOOK_ID,
      clubId: CLUB_ID,
      title: 'O Hobbit',
      author: 'J. R. R. Tolkien',
      month: '2026-10',
      coverUrl: null,
      totalPages: 320,
      createdById: AUTHOR_ID,
      status: 'ACTIVE',
      archivedAt: null,
      createdAt: CREATED_AT,
    });
    expect(read.createdAt).toBeInstanceOf(Date);
    expect(read.archivedAt).toBeNull();
  });

  it('returns null for an id that does not exist', async () => {
    await expect(repo.byId(prefixedId('t07', 'ghost'))).resolves.toBeNull();
  });

  it('upserts by id: saving the same id updates in place and does not duplicate', async () => {
    await repo.save(aRow(UPSERT_BOOK_ID, { title: 'Título Antigo' }));

    await repo.save(
      aRow(UPSERT_BOOK_ID, { title: 'Título Novo', totalPages: 400 }),
    );

    const read = required(await repo.byId(UPSERT_BOOK_ID));
    expect(read.title).toBe('Título Novo');
    expect(read.totalPages).toBe(400);
    await expect(
      prisma.book.count({ where: { id: UPSERT_BOOK_ID } }),
    ).resolves.toBe(1);
  });

  describe('update', () => {
    beforeAll(async () => {
      await repo.save(aRow(PATCH_BOOK_ID));
    });

    it('changes only the field in the patch', async () => {
      const updated = await repo.update(PATCH_BOOK_ID, {
        title: 'Só o título',
      });

      expect(updated.title).toBe('Só o título');
      // Os outros campos permanecem — inclusive o createdAt.
      expect(updated.author).toBe('J. R. R. Tolkien');
      expect(updated.month).toBe('2026-10');
      expect(updated.totalPages).toBe(320);
      expect(updated.status).toBe('ACTIVE');
      expect(updated.createdAt).toEqual(CREATED_AT);
    });

    // `undefined` é ausência, `null` é valor: é a semântica que o `editBook`
    // depende para distinguir "não mexe" de "limpa o campo".
    it('writes an explicit null', async () => {
      const updated = await repo.update(PATCH_BOOK_ID, {
        author: null,
        totalPages: null,
      });

      expect(updated.author).toBeNull();
      expect(updated.totalPages).toBeNull();
      // ...e o que não estava no patch continua lá.
      expect(updated.title).toBe('Só o título');
    });

    it('archives with status and archivedAt', async () => {
      const archivedAt = new Date('2026-02-01T00:00:00.000Z');

      const updated = await repo.update(PATCH_BOOK_ID, {
        status: 'ARCHIVED',
        archivedAt,
      });

      expect(updated.status).toBe('ARCHIVED');
      expect(updated.archivedAt).toEqual(archivedAt);
    });
  });

  describe('find', () => {
    beforeAll(async () => {
      await repo.save(aRow(BOOK_ID));
      await repo.save(
        aRow(ARCHIVED_BOOK_ID, {
          title: 'Livro Arquivado',
          status: 'ARCHIVED',
          archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );
      await repo.save(
        aRow(OTHER_CLUB_BOOK_ID, {
          clubId: OTHER_CLUB_ID,
          title: 'Livro de Outro Clube',
        }),
      );
    });

    // Sem `status` o port devolve OS DOIS: a regra de produto ("só os ACTIVE
    // por padrão") vive no listBooks, não na persistência.
    it('returns both statuses when the filter has no status', async () => {
      const found = await repo.find({ clubId: CLUB_ID });

      const ids = found.map((book) => book.id);
      expect(ids).toContain(BOOK_ID);
      expect(ids).toContain(ARCHIVED_BOOK_ID);
    });

    it('filters by status when asked', async () => {
      const active = await repo.find({ clubId: CLUB_ID, status: 'ACTIVE' });
      const archived = await repo.find({ clubId: CLUB_ID, status: 'ARCHIVED' });

      expect(active.map((book) => book.id)).toContain(BOOK_ID);
      expect(active.map((book) => book.id)).not.toContain(ARCHIVED_BOOK_ID);
      expect(archived.map((book) => book.id)).toContain(ARCHIVED_BOOK_ID);
      expect(archived.map((book) => book.id)).not.toContain(BOOK_ID);
      expect(active.every((book) => book.status === 'ACTIVE')).toBe(true);
      expect(archived.every((book) => book.status === 'ARCHIVED')).toBe(true);
    });

    // O CORTE DE TENANT no nível da persistência.
    it('never returns a book of another club', async () => {
      const found = await repo.find({ clubId: CLUB_ID });

      expect(found.every((book) => book.clubId === CLUB_ID)).toBe(true);
      expect(found.map((book) => book.id)).not.toContain(OTHER_CLUB_BOOK_ID);
    });

    it('returns an empty list for a club with no books', async () => {
      await expect(
        repo.find({ clubId: prefixedId('t07', 'club-ghost') }),
      ).resolves.toEqual([]);
    });
  });
});
