import type { Book } from '../domain/book';
import {
  assertClubMonth,
  normalizeBookTitle,
  normalizeTotalPages,
} from '../domain/book-fields';
import { ADMIN_ROLES } from '../domain/club';
import { optionalText } from '../domain/optional-text';
import type { AssertMembership } from './assert-membership';
import { bookForActor } from './book-for-actor';
import type { BookRepository } from './ports/book-repository';

/**
 * `undefined` é ausência ("não mexe neste campo"); `null` explícito em
 * `author`, `coverUrl` e `totalPages` LIMPA o campo. É a mesma semântica do
 * `update(id, patch)` dos repositórios.
 *
 * `clubId`, `createdById`, `status`, `archivedAt`, `createdAt` e `id` não
 * aparecem aqui de propósito: mudar o clube de um livro moveria conteúdo entre
 * tenants, e arquivar é o `archiveBook`.
 */
export interface EditBookInput {
  actorUserId: string;
  bookId: string;
  title?: string;
  author?: string | null;
  month?: string;
  coverUrl?: string | null;
  totalPages?: number | null;
}

export class EditBook {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly books: BookRepository,
  ) {}

  async execute(input: EditBookInput): Promise<Book> {
    const book = await bookForActor(this.books, this.assertMembership, {
      actorUserId: input.actorUserId,
      bookId: input.bookId,
      requireRole: ADMIN_ROLES,
    });

    // O patch inteiro é validado ANTES de escrever: um campo ruim não pode
    // deixar os anteriores no banco.
    const patch = buildPatch(input);

    // Nada a fazer não é erro — e o guard acima já rodou, então um patch
    // vazio não é atalho para furar o papel.
    if (Object.keys(patch).length === 0) return book;

    return this.books.update(book.id, patch);
  }
}

/** Só as chaves presentes no input entram no patch — as outras nem existem. */
function buildPatch(input: EditBookInput): Partial<Book> {
  const patch: Partial<Book> = {};

  // O `!== undefined` de cada bloco é a semântica do editBook (ausência não
  // mexe); a regra do campo em si é a de `domain/book-fields.ts`, a mesma que
  // o createBook usa.
  if (input.title !== undefined) {
    patch.title = normalizeBookTitle(input.title);
  }

  if (input.month !== undefined) {
    assertClubMonth(input.month);
    patch.month = input.month;
  }

  if (input.totalPages !== undefined) {
    patch.totalPages = normalizeTotalPages(input.totalPages);
  }

  if (input.author !== undefined) {
    patch.author = optionalText(input.author);
  }

  if (input.coverUrl !== undefined) {
    // Não se valida se é URL de verdade: isso é Zod na borda.
    patch.coverUrl = optionalText(input.coverUrl);
  }

  return patch;
}
