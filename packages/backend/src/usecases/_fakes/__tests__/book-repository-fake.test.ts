import { beforeEach, describe, expect, it } from 'vitest';

import { aBook, required } from '../../../test-support/builders';
import { BookRepositoryFake } from '../book-repository-fake';

const CREATED_ISO = '2026-01-01T00:00:00.000Z';

// O fake tem que mentir o mínimo possível sobre o que o Prisma faria: um
// repositório real devolve Date nova a cada leitura, nunca a mesma referência.
describe('BookRepositoryFake', () => {
  let books: BookRepositoryFake;

  beforeEach(() => {
    books = new BookRepositoryFake();
  });

  describe('Date fidelity', () => {
    it('does not let the caller corrupt the store through a Date it saved', async () => {
      const createdAt = new Date(CREATED_ISO);
      await books.save(aBook({ createdAt }));

      createdAt.setFullYear(1999);

      expect(required(books.saved[0]).createdAt).toEqual(new Date(CREATED_ISO));
    });

    it('does not let the caller corrupt the store through the Date it got back from save', async () => {
      const returned = await books.save(aBook());

      returned.createdAt.setFullYear(1999);

      expect(required(books.saved[0]).createdAt).toEqual(new Date(CREATED_ISO));
    });

    it('clones the Dates exposed by the saved getter', async () => {
      await books.save(aBook());

      required(books.saved[0]).createdAt.setFullYear(1999);

      expect(required(books.saved[0]).createdAt).toEqual(new Date(CREATED_ISO));
    });

    it('returns a different Date instance on every read', async () => {
      await books.save(aBook());

      const first = required(books.saved[0]);
      const second = required(books.saved[0]);

      expect(first.createdAt).not.toBe(second.createdAt);
      expect(first.createdAt).toEqual(second.createdAt);
    });

    // Erro clássico: new Date(null) é a epoch, não null.
    it('keeps a null archivedAt null', async () => {
      const returned = await books.save(aBook({ archivedAt: null }));

      expect(returned.archivedAt).toBeNull();
      expect(required(books.saved[0]).archivedAt).toBeNull();
    });

    it('clones a non-null archivedAt', async () => {
      const archivedAt = new Date('2026-02-01T00:00:00.000Z');
      await books.save(aBook({ status: 'ARCHIVED', archivedAt }));

      const read = required(books.saved[0]);

      expect(read.archivedAt).not.toBe(archivedAt);
      expect(read.archivedAt).toEqual(archivedAt);
    });
  });

  describe('save', () => {
    it('returns the book it stored', async () => {
      const book = aBook();

      const returned = await books.save(book);

      expect(returned).toEqual(book);
      expect(required(books.saved[0])).toEqual(book);
    });

    it('stores one entry per id', async () => {
      await books.save(aBook({ id: 'book-1' }));
      await books.save(aBook({ id: 'book-2' }));

      expect(books.saved.map((book) => book.id)).toEqual(['book-1', 'book-2']);
    });

    it('overwrites the book with the same id instead of duplicating it', async () => {
      await books.save(aBook({ id: 'book-1', title: 'O Hobbit' }));
      await books.save(aBook({ id: 'book-1', title: 'A Sociedade do Anel' }));

      expect(books.saved).toHaveLength(1);
      expect(required(books.saved[0]).title).toBe('A Sociedade do Anel');
    });
  });

  describe('byId', () => {
    it('returns the book it stored', async () => {
      const book = aBook({ id: 'book-1' });
      await books.save(book);

      await expect(books.byId('book-1')).resolves.toEqual(book);
    });

    it('returns null for an id that was never saved', async () => {
      await expect(books.byId('book-ghost')).resolves.toBeNull();
    });

    it('clones the Dates it returns', async () => {
      const archivedAt = new Date('2026-02-01T00:00:00.000Z');
      await books.save(aBook({ status: 'ARCHIVED', archivedAt }));

      const read = required(await books.byId('book-1'));
      read.createdAt.setFullYear(1999);
      read.archivedAt?.setFullYear(1999);

      const again = required(await books.byId('book-1'));
      expect(again.createdAt).toEqual(new Date(CREATED_ISO));
      expect(again.archivedAt).toEqual(archivedAt);
    });
  });

  describe('update', () => {
    it('applies the patch and keeps the id', async () => {
      await books.save(aBook({ id: 'book-1', title: 'O Hobbit' }));

      const updated = await books.update('book-1', {
        title: 'A Sociedade do Anel',
      });

      expect(updated.id).toBe('book-1');
      expect(updated.title).toBe('A Sociedade do Anel');
      expect(books.saved).toHaveLength(1);
      expect(required(books.saved[0]).title).toBe('A Sociedade do Anel');
    });

    it('leaves the fields the patch does not mention alone', async () => {
      const book = aBook({ id: 'book-1' });
      await books.save(book);

      const updated = await books.update('book-1', { title: 'Outro' });

      expect(updated).toEqual({ ...book, title: 'Outro' });
    });

    // Fidelidade ao Prisma: `undefined` é "não mexe", não "grave nulo".
    it('ignores a patch key whose value is undefined', async () => {
      await books.save(aBook({ id: 'book-1', author: 'J. R. R. Tolkien' }));

      const updated = await books.update('book-1', { author: undefined });

      expect(updated.author).toBe('J. R. R. Tolkien');
    });

    it('writes an explicit null', async () => {
      await books.save(aBook({ id: 'book-1', author: 'J. R. R. Tolkien' }));

      const updated = await books.update('book-1', { author: null });

      expect(updated.author).toBeNull();
      expect(required(books.saved[0]).author).toBeNull();
    });

    // Diferente do deleteMany do plano: atualizar o que não existe é bug de
    // código, não retry idempotente.
    it('throws a raw Error when the book was never saved', async () => {
      await expect(
        books.update('book-ghost', { title: 'Outro' }),
      ).rejects.toThrow(/was never saved/);
    });

    it('clones a Date that arrives through the patch', async () => {
      await books.save(aBook({ id: 'book-1' }));
      const archivedAt = new Date('2026-02-01T00:00:00.000Z');

      await books.update('book-1', { status: 'ARCHIVED', archivedAt });
      archivedAt.setFullYear(1999);

      expect(required(books.saved[0]).archivedAt).toEqual(
        new Date('2026-02-01T00:00:00.000Z'),
      );
    });
  });

  // O contador é o único jeito de o teste do editBook afirmar "não escreveu":
  // `update` com patch vazio é no-op, então `saved` não distingue "não chamou"
  // de "chamou à toa" — e "chamou à toa" é um UPDATE por request em produção.
  // Mesmo padrão do `compareCalls` do PasswordHasherFake (CONVENCOES §6.4) e
  // do `saveManyCalls` do fake do plano.
  describe('updateCalls', () => {
    it('starts at zero', () => {
      expect(books.updateCalls).toBe(0);
    });

    it('does not count a save', async () => {
      await books.save(aBook({ id: 'book-1' }));

      expect(books.updateCalls).toBe(0);
    });

    it('counts each update', async () => {
      await books.save(aBook({ id: 'book-1' }));

      await books.update('book-1', { title: 'A' });
      await books.update('book-1', { title: 'B' });

      expect(books.updateCalls).toBe(2);
    });

    // Um patch vazio é uma escrita à toa, e o contador tem de acusá-la —
    // é justamente o caso que `saved` não vê.
    it('counts an update whose patch is empty', async () => {
      await books.save(aBook({ id: 'book-1' }));

      await books.update('book-1', {});

      expect(books.updateCalls).toBe(1);
    });

    // Conta a CHAMADA, não o sucesso: a tentativa é o que o teste quer saber.
    it('counts an update that was refused', async () => {
      await expect(books.update('book-ghost', { title: 'A' })).rejects.toThrow(
        /was never saved/,
      );

      expect(books.updateCalls).toBe(1);
    });
  });

  describe('find', () => {
    beforeEach(async () => {
      await books.save(aBook({ id: 'a-active', clubId: 'club-1' }));
      await books.save(
        aBook({
          id: 'b-archived',
          clubId: 'club-1',
          status: 'ARCHIVED',
          archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );
      await books.save(aBook({ id: 'c-other-club', clubId: 'club-2' }));
    });

    it('returns only the books of the club asked for', async () => {
      const found = await books.find({ clubId: 'club-1' });

      expect(found.map((book) => book.id).sort()).toEqual([
        'a-active',
        'b-archived',
      ]);
    });

    it('filters by status when the filter asks for one', async () => {
      const found = await books.find({ clubId: 'club-1', status: 'ACTIVE' });

      expect(found.map((book) => book.id)).toEqual(['a-active']);
    });

    it('returns both statuses when the filter omits status', async () => {
      const found = await books.find({ clubId: 'club-1' });

      expect(found.map((book) => book.status).sort()).toEqual([
        'ACTIVE',
        'ARCHIVED',
      ]);
    });

    it('returns an empty list for a club with no books', async () => {
      await expect(books.find({ clubId: 'club-ghost' })).resolves.toEqual([]);
    });

    it('clones the Dates it returns', async () => {
      const found = await books.find({ clubId: 'club-1', status: 'ACTIVE' });

      required(found[0]).createdAt.setFullYear(1999);

      const again = await books.find({ clubId: 'club-1', status: 'ACTIVE' });
      expect(required(again[0]).createdAt).toEqual(new Date(CREATED_ISO));
    });
  });
});
