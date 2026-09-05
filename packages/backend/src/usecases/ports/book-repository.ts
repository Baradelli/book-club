import type { Book } from '../../domain/book';
import type { GeneralStatus } from '../../domain/club';

export interface BookFilter {
  clubId: string;
  /** Ausente = os dois status. */
  status?: GeneralStatus;
}

export interface BookRepository {
  save(book: Book): Promise<Book>;
  byId(id: string): Promise<Book | null>;
  /** `undefined` no patch é "não mexe"; `null` grava nulo — como no Prisma. */
  update(id: string, patch: Partial<Book>): Promise<Book>;
  /**
   * Sem promessa de ordem: quem ordena é o `listBooks`, porque a ordem
   * ("mês corrente primeiro") é regra de produto, não de persistência.
   */
  find(filter: BookFilter): Promise<Book[]>;
}
