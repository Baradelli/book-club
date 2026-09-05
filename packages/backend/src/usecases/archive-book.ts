import type { Book } from '../domain/book';
import { ADMIN_ROLES } from '../domain/club';
import type { AssertMembership } from './assert-membership';
import { bookForActor } from './book-for-actor';
import type { BookRepository } from './ports/book-repository';

export interface ArchiveBookInput {
  actorUserId: string;
  bookId: string;
}

/**
 * Soft delete do livro. **Não** recebe o `ReadingPlanItemRepository` de
 * propósito: arquivar o livro não pode apagar o plano — é o plano que amarra
 * as anotações das pessoas, e o acervo continua legível.
 */
export class ArchiveBook {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly books: BookRepository,
  ) {}

  async execute(input: ArchiveBookInput): Promise<Book> {
    const book = await bookForActor(this.books, this.assertMembership, {
      actorUserId: input.actorUserId,
      bookId: input.bookId,
      requireRole: ADMIN_ROLES,
    });

    // Livro já arquivado nem chega aqui: o guard acima o trata como
    // inexistente. Então não há caminho que regrave um archivedAt antigo.
    return this.books.update(book.id, {
      status: 'ARCHIVED',
      archivedAt: new Date(),
    });
  }
}
