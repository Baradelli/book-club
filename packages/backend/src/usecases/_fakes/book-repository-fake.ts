import type { Book } from '../../domain/book';
import type { BookFilter, BookRepository } from '../ports/book-repository';
import { withoutUndefined } from './without-undefined';

export class BookRepositoryFake implements BookRepository {
  private store = new Map<string, Book>();
  private updateCallCount = 0;

  async save(book: Book): Promise<Book> {
    this.store.set(book.id, this.clone(book));
    return this.clone(book);
  }

  async byId(id: string): Promise<Book | null> {
    const found = this.store.get(id);
    return found ? this.clone(found) : null;
  }

  async update(id: string, patch: Partial<Book>): Promise<Book> {
    // Conta a CHAMADA, não o sucesso: um update recusado também foi uma
    // tentativa de escrita, e é isso que o teste quer saber.
    this.updateCallCount += 1;

    const existing = this.store.get(id);
    if (!existing) {
      throw new Error(
        `BookRepositoryFake: cannot update book ${id} — it was never saved`,
      );
    }
    // O clone corta o aliasing de Date que venha pelo patch.
    const updated = this.clone({ ...existing, ...withoutUndefined(patch), id });
    this.store.set(id, updated);
    return this.clone(updated);
  }

  async find(filter: BookFilter): Promise<Book[]> {
    return [...this.store.values()]
      .filter(
        (book) =>
          book.clubId === filter.clubId &&
          // `status` ausente no filtro = os dois status.
          (filter.status === undefined || book.status === filter.status),
      )
      .map((book) => this.clone(book));
  }

  get saved(): Book[] {
    return [...this.store.values()].map((book) => this.clone(book));
  }

  /**
   * Quantas vezes `update` foi chamado.
   *
   * Existe porque `update` com patch vazio é no-op: `saved` não distingue
   * "não chamou" de "chamou à toa", e "chamou à toa" é um `UPDATE` por
   * request em toda tela que salva sem mudar nada. Mesmo padrão do
   * `compareCalls` do PasswordHasherFake (CONVENCOES-CODIGO §6.4).
   */
  get updateCalls(): number {
    return this.updateCallCount;
  }

  // Clona nos dois sentidos (entrada do save e saída da leitura): nem o
  // chamador contamina o store, nem o store devolve referência sua. As Date
  // precisam ser copiadas — o Prisma devolve Date nova a cada leitura.
  private clone(book: Book): Book {
    return {
      ...book,
      createdAt: new Date(book.createdAt),
      // null preservado: new Date(null) seria a epoch, não null.
      archivedAt: book.archivedAt === null ? null : new Date(book.archivedAt),
    };
  }
}
