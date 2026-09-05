import { randomUUID } from 'node:crypto';

import { docToText } from '../domain/doc-to-text';
import type { Note } from '../domain/note';
import { assertNoteDoc, normalizeNoteTitle } from '../domain/note';
import { optionalText } from '../domain/optional-text';
import type { AssertMembership } from './assert-membership';
import { bookForActor } from './book-for-actor';
import type { BookRepository } from './ports/book-repository';
import type { NoteRepository } from './ports/note-repository';

export interface CreateFreeNoteInput {
  actorUserId: string; // o autor. NÃO existe `userId` aqui.
  bookId: string;
  title: string; // obrigatório
  reference?: string;
  doc: unknown; // validado por assertNoteDoc
}

export interface CreateFreeNoteOutput {
  note: Note;
}

/**
 * A anotação avulsa: sem dia de leitura, com título e referência próprios.
 *
 * **Ilimitada** por decisão de produto — não há chave natural e nada de upsert
 * aqui: duas chamadas idênticas criam duas notas. É a metade em que o índice
 * `unique(planItemId, userId)` não atrapalha, porque `planItemId` é `null` e
 * no Postgres `NULL` não colide com `NULL`.
 *
 * **Não exige papel**: `MEMBER` escreve. E o `clubId` vem de `book.clubId`,
 * nunca do input — o corte é o do `bookForActor`, reusado sem cópia.
 */
export class CreateFreeNote {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly books: BookRepository,
    private readonly notes: NoteRepository,
  ) {}

  async execute(input: CreateFreeNoteInput): Promise<CreateFreeNoteOutput> {
    // O corte de tenant vem antes da validação do corpo: quem não é do clube
    // recebe o mesmo 404 para título bom e para título vazio.
    const book = await bookForActor(this.books, this.assertMembership, {
      actorUserId: input.actorUserId,
      bookId: input.bookId,
    });

    // Tudo é validado ANTES de qualquer escrita — título vazio ou doc
    // malformado não deixa nada gravado.
    const title = normalizeNoteTitle(input.title);
    const doc = assertNoteDoc(input.doc);
    const now = new Date();

    const note = await this.notes.save({
      id: randomUUID(),
      clubId: book.clubId,
      bookId: book.id,
      userId: input.actorUserId,
      kind: 'FREE',
      // Sem dia de leitura: é o que faz a avulsa ser ilimitada.
      planItemId: null,
      title,
      // O MESMO `optionalText` do livro e do item do plano: `''`/espaços viram
      // `null`. Uma cópia da regra é como um dos três passa a gravar `''`.
      reference: optionalText(input.reference),
      doc,
      plainText: docToText(doc),
      status: 'ACTIVE',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    return { note };
  }
}
