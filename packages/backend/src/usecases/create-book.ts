import { randomUUID } from 'node:crypto';

import type { Book, ReadingPlanItem } from '../domain/book';
import {
  assertClubMonth,
  normalizeBookTitle,
  normalizeTotalPages,
} from '../domain/book-fields';
import { ADMIN_ROLES } from '../domain/club';
import { ClubNotFoundError } from '../domain/errors';
import { optionalText } from '../domain/optional-text';
import type { PlanItemDraft } from '../domain/reading-plan';
import { normalizePlanDrafts } from '../domain/reading-plan';
import type { AssertMembership } from './assert-membership';
import type { BookRepository } from './ports/book-repository';
import type { ClubRepository } from './ports/club-repository';
import type { ReadingPlanItemRepository } from './ports/reading-plan-item-repository';

/**
 * O rascunho do plano no cadastro do livro é o mesmo do `replacePlanItems`:
 * o nome fica para a rota da Tarefa 07 não ter de mudar.
 */
export type CreateBookPlanItemInput = PlanItemDraft;

export interface CreateBookInput {
  actorUserId: string; // precisa ser OWNER/ADMIN do clube
  clubId: string;
  title: string;
  month: string; // "YYYY-MM"
  author?: string;
  coverUrl?: string;
  totalPages?: number;
  planItems?: CreateBookPlanItemInput[]; // ausente ou [] = livro sem plano
}

export interface CreateBookOutput {
  book: Book;
  planItems: ReadingPlanItem[];
}

export class CreateBook {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly clubs: ClubRepository,
    private readonly books: BookRepository,
    private readonly planItems: ReadingPlanItemRepository,
  ) {}

  async execute(input: CreateBookInput): Promise<CreateBookOutput> {
    const club = await this.clubs.byId(input.clubId);
    if (!club || club.status !== 'ACTIVE') {
      throw new ClubNotFoundError(`club ${input.clubId} not found`);
    }

    // A regra de papel é a da Tarefa 01: NotAMemberError (404) para quem não
    // é do clube, ForbiddenRoleError (403) para o MEMBER. Não se reimplementa.
    await this.assertMembership.execute({
      userId: input.actorUserId,
      clubId: input.clubId,
      requireRole: ADMIN_ROLES,
    });

    // Tudo é validado e montado ANTES de qualquer escrita: um item ruim no fim
    // do plano não pode deixar o livro, nem os itens anteriores, no banco.
    const now = new Date();
    const book = this.buildBook(input, now);
    const items = normalizePlanDrafts(input.planItems ?? []).map((row) => ({
      id: randomUUID(),
      bookId: book.id,
      ...row,
      createdAt: now,
    }));

    const savedBook = await this.books.save(book);
    const savedItems = await this.planItems.saveMany(items);

    return { book: savedBook, planItems: savedItems };
  }

  private buildBook(input: CreateBookInput, now: Date): Book {
    const title = normalizeBookTitle(input.title);
    assertClubMonth(input.month);
    const totalPages = normalizeTotalPages(input.totalPages);

    return {
      id: randomUUID(),
      clubId: input.clubId,
      title,
      author: optionalText(input.author),
      month: input.month,
      // Não se valida se é URL de verdade: isso é Zod na borda.
      coverUrl: optionalText(input.coverUrl),
      totalPages,
      createdById: input.actorUserId,
      status: 'ACTIVE',
      archivedAt: null,
      createdAt: now,
    };
  }
}
