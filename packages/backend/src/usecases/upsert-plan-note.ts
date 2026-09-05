import { randomUUID } from 'node:crypto';

import type { ReadingPlanItem } from '../domain/book';
import { docToText } from '../domain/doc-to-text';
import { PlanItemNotFoundError } from '../domain/errors';
import type { Note, NoteDoc } from '../domain/note';
import { assertNoteDoc } from '../domain/note';
import type { AssertMembership } from './assert-membership';
import { bookForActor } from './book-for-actor';
import type { BookRepository } from './ports/book-repository';
import type { NoteRepository } from './ports/note-repository';
import type { ReadingPlanItemRepository } from './ports/reading-plan-item-repository';

export interface UpsertPlanNoteInput {
  actorUserId: string; // o autor. NÃO existe `userId` aqui.
  planItemId: string;
  doc: unknown; // validado por assertNoteDoc
}

export interface UpsertPlanNoteOutput {
  note: Note;
  /** A rota da Tarefa 11 devolve 201 × 200 a partir daqui. */
  created: boolean;
}

/**
 * A anotação do dia: abrir a leitura de hoje e escrever mexe **sempre na mesma
 * nota** (`unique(planItemId, userId)`), com o título vindo do tema do plano.
 *
 * **Não exige papel**: `MEMBER` escreve. Papel de admin manda no livro e no
 * plano, não no que as pessoas escrevem.
 *
 * Nem `clubId` nem `bookId` aparecem no input: o `bookId` vem de
 * `planItem.bookId` e o `clubId` de `book.clubId`. É isso que impede escrever
 * num livro de outro clube mandando o `clubId` "certo" no corpo — a mesma
 * regra que o `bookForActor` implementa desde a Tarefa 06, reusada sem cópia.
 */
export class UpsertPlanNote {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly books: BookRepository,
    private readonly planItems: ReadingPlanItemRepository,
    private readonly notes: NoteRepository,
  ) {}

  async execute(input: UpsertPlanNoteInput): Promise<UpsertPlanNoteOutput> {
    const planItem = await this.planItems.byId(input.planItemId);
    if (!planItem) {
      throw new PlanItemNotFoundError(
        `reading plan item ${input.planItemId} not found`,
      );
    }

    // O corte de tenant vem antes da validação do corpo: quem não é do clube
    // recebe o mesmo 404 para doc bom e para doc ruim.
    const book = await bookForActor(this.books, this.assertMembership, {
      actorUserId: input.actorUserId,
      bookId: planItem.bookId,
    });

    // Tudo é validado ANTES de qualquer escrita — doc malformado não deixa
    // nada gravado, nem meia nota.
    const doc = assertNoteDoc(input.doc);
    const now = new Date();

    const existing = await this.notes.byPlanItemAndUser(
      planItem.id,
      input.actorUserId,
    );

    if (existing) {
      const note = await this.notes.save(
        this.rewrite(existing, planItem, doc, now),
      );
      return { note, created: false };
    }

    const note = await this.notes.save({
      id: randomUUID(),
      clubId: book.clubId,
      bookId: book.id,
      userId: input.actorUserId,
      kind: 'PLAN',
      planItemId: planItem.id,
      // O título é o tema do dia, não algo que a pessoa digite.
      title: planItem.title,
      // A referência do dia é do ITEM DO PLANO. Copiar criaria duas fontes
      // para a mesma string, e elas divergiriam na primeira correção do plano.
      reference: null,
      doc,
      plainText: docToText(doc),
      status: 'ACTIVE',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    return { note, created: true };
  }

  /**
   * A nota do dia que já existe, reescrita.
   *
   * O que muda: o `doc` e o `plainText` derivado dele; o `title`, que é
   * RESSINCRONIZADO com o tema atual do item (o admin corrigiu "Cap. 3" para
   * "Cap. 3 — A promessa" e a nota acompanha); e o `updatedAt`.
   *
   * E `status`/`archivedAt` voltam ao ativo: o índice único não olha status,
   * então uma nota arquivada continua ocupando o par `(planItemId, userId)` —
   * criar outra faria a anotação do dia virar um 409 permanente para quem
   * arquivou a sua.
   *
   * O que NÃO muda, por vir do spread: `id`, `createdAt`, `kind`, `userId`,
   * `clubId`, `bookId`, `planItemId` e `reference`.
   */
  private rewrite(
    existing: Note,
    planItem: ReadingPlanItem,
    doc: NoteDoc,
    now: Date,
  ): Note {
    return {
      ...existing,
      title: planItem.title,
      doc,
      plainText: docToText(doc),
      status: 'ACTIVE',
      archivedAt: null,
      updatedAt: now,
    };
  }
}
