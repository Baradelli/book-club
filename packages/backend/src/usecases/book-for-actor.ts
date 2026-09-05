import type { Book } from '../domain/book';
import type { MemberRole } from '../domain/club';
import { BookNotFoundError } from '../domain/errors';
import type { AssertMembership } from './assert-membership';
import type { BookRepository } from './ports/book-repository';

export interface BookForActorInput {
  actorUserId: string;
  bookId: string;
  /** Ausente = basta membership ativo (o livro é do grupo). */
  requireRole?: readonly MemberRole[];
}

/**
 * O corte de tenant do livro, em UM lugar só.
 *
 * Carrega o livro e confirma que o ator é membro ativo **do clube do livro**.
 * O clube vem de `book.clubId`, NUNCA do input — é isso que impede pedir um
 * livro de outro clube mandando o `clubId` "certo" no corpo. Quatro UseCases
 * precisam exatamente disso; quatro cópias é como um deles passa a ler o
 * clube do input numa refatoração futura.
 *
 * Livro inexistente e livro arquivado dão o mesmo `BookNotFoundError` (404):
 * arquivado é invisível até o MVP 4, e distinguir os casos vazaria existência.
 */
export async function bookForActor(
  books: BookRepository,
  assertMembership: AssertMembership,
  input: BookForActorInput,
): Promise<Book> {
  const book = await books.byId(input.bookId);
  if (!book || book.status !== 'ACTIVE') {
    throw new BookNotFoundError(`book ${input.bookId} not found`);
  }

  // A regra de papel é a da Tarefa 01: NotAMemberError (404) para quem não é
  // do clube, ForbiddenRoleError (403) para quem está sem o papel.
  await assertMembership.execute({
    userId: input.actorUserId,
    clubId: book.clubId,
    ...(input.requireRole ? { requireRole: input.requireRole } : {}),
  });

  return book;
}
