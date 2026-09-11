import { randomUUID } from 'node:crypto';

import { docToText } from '../domain/doc-to-text';
import type { Note } from '../domain/note';
import { assertNoteDoc, normalizeNoteTitle } from '../domain/note';
import { optionalText } from '../domain/optional-text';
import type { AssertMembership } from './assert-membership';
import { bookForActor } from './book-for-actor';
import type { BookRepository } from './ports/book-repository';
import type { NoteRepository } from './ports/note-repository';
import type { RecordActivity } from './record-activity';
import { recordActivitySafely } from './record-activity';

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
 *
 * ⚠️ **Registra atividade SEMPRE** (Tarefa 33, regra 10), e é a metade oposta
 * do `upsertPlanNote`: aqui não há idempotência para condicionar, porque duas
 * chamadas idênticas criam duas notas. Não há autosave nesta rota — quem
 * escreve avulsa aperta um botão — então cada chamada é um acontecimento.
 */
export class CreateFreeNote {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly books: BookRepository,
    private readonly notes: NoteRepository,
    private readonly recordActivity: RecordActivity,
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

    /*
      ⚠️ **O GATILHO, e ele vem DEPOIS da escrita** (Tarefa 33, decisão I) —
      registrar antes e a escrita falhar produziria um feed que mente. E ele
      **não pode derrubar a escrita da pessoa** (decisão C): quem captura e
      loga é o `recordActivitySafely`, dono único dessa regra nos quatro.

      `planItemId: null` é o produto, e não um detalhe: a avulsa **não tem dia
      de leitura** — é a metade em que o índice `unique(planItemId, userId)`
      não atrapalha justamente porque `NULL` não colide com `NULL`.
    */
    await recordActivitySafely(this.recordActivity, {
      clubId: book.clubId,
      actorUserId: input.actorUserId,
      type: 'FREE_NOTE',
      bookId: book.id,
      planItemId: null,
      subjectId: note.id,
    });

    return { note };
  }
}
