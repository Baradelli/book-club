import type { Note } from '../domain/note';
import type { AssertMembership } from './assert-membership';
import { noteForAuthor } from './note-for-author';
import type { NoteRepository } from './ports/note-repository';

export interface ArchiveNoteInput {
  actorUserId: string; // tem de ser o AUTOR
  noteId: string;
}

export interface ArchiveNoteOutput {
  note: Note;
}

/**
 * Soft delete da anotação: o autor tira da listagem o que não serve mais.
 *
 * **Não exige papel, e papel nenhum substitui autoria**: nem o `OWNER` do clube
 * nem o super-admin arquivam a nota de outra pessoa (ADR 0002). É por isso que
 * o `requireRole` do `archiveBook` NÃO aparece aqui — livro é do grupo, nota é
 * de quem escreveu.
 *
 * **Não apaga conteúdo**: `doc`, `plainText`, `title` e `reference` ficam
 * intactos. Arquivar é tirar da vista, não destruir — o acervo do clube
 * continua íntegro. Hard delete não existe nesta fatia, e desarquivar é MVP 4.
 */
export class ArchiveNote {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly notes: NoteRepository,
  ) {}

  async execute(input: ArchiveNoteInput): Promise<ArchiveNoteOutput> {
    const note = await noteForAuthor(this.notes, this.assertMembership, {
      actorUserId: input.actorUserId,
      noteId: input.noteId,
    });

    // Nota já arquivada nem chega aqui: o guard a trata como inexistente
    // (`NoteNotFoundError`). Então não há caminho que regrave um `archivedAt`
    // antigo — é o precedente do `archiveBook`, que documenta exatamente isso.
    //
    // UM `new Date()` só, para os três campos derivados dele: `updatedAt` e
    // `archivedAt` têm de sair no MESMO instante. Duas chamadas divergiriam em
    // milissegundos e deixariam a igualdade não-determinística no teste.
    const archivedAt = new Date();

    // O `updatedAt` ANDA ao arquivar. → ADR 0008: o domínio é o dono de
    // `updatedAt` (o `Note` nasce SEM `@updatedAt` no schema, e é a Tarefa 11
    // que declara a coluna), e `updatedAt` significa "quando esta linha mudou
    // pela última vez" — arquivar muda a linha. A leitura antiga ("última
    // edição de conteúdo") exigiria uma terceira coluna para "última mudança de
    // linha", que ninguém pediu. E o `archiveBook` NÃO é precedente contra
    // isso: o `Book` não tem a coluna.
    const updated = await this.notes.update(note.id, {
      status: 'ARCHIVED',
      archivedAt,
      updatedAt: archivedAt,
    });

    return { note: updated };
  }
}
