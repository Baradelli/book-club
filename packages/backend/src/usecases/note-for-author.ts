import { NoteNotFoundError, NotTheAuthorError } from '../domain/errors';
import type { Note } from '../domain/note';
import type { AssertMembership } from './assert-membership';
import type { NoteRepository } from './ports/note-repository';

export interface NoteForAuthorInput {
  actorUserId: string;
  noteId: string;
}

/**
 * O corte de tenant **e** de autoria da nota, em UM lugar só.
 *
 * Carrega a nota e confirma que o ator é (a) membro ativo do clube **DA NOTA**
 * e (b) o autor. O clube vem de `note.clubId`, NUNCA do input — é isso que
 * impede mexer numa nota de outro clube mandando o `clubId` "certo" no corpo.
 * Extraído desde o início porque os dois UseCases da fatia precisam dele: é o
 * mesmo critério que tirou o `bookForActor` do `getBookWithPlan`.
 *
 * Nota inexistente e nota arquivada dão o mesmo `NoteNotFoundError` (404):
 * arquivada é invisível até o MVP 4 — inclusive para o autor, porque
 * desarquivar não existe —, e distinguir os casos vazaria estado.
 *
 * **A ORDEM é obrigatória: membership ANTES de autoria.** Quem não é do clube
 * recebe `NotAMemberError` (404) mesmo não sendo o autor, senão a diferença
 * entre 403 e 404 confirmaria a um forasteiro que aquela nota existe. Depois do
 * membership, o 403 é o certo — e é o único lugar do projeto onde é: o membro
 * ativo já LÊ a nota de todo mundo na listagem (ADR 0002), então esconder com
 * 404 não protegeria nada e mentiria para o front, que precisa distinguir
 * "não existe" de "não é sua".
 */
export async function noteForAuthor(
  notes: NoteRepository,
  assertMembership: AssertMembership,
  input: NoteForAuthorInput,
): Promise<Note> {
  const note = await notes.byId(input.noteId);
  if (!note || note.status !== 'ACTIVE') {
    throw new NoteNotFoundError(`note ${input.noteId} not found`);
  }

  // Sem papel exigido: escrever é do grupo, e mandar no livro não é mandar no
  // que as pessoas escreveram.
  await assertMembership.execute({
    userId: input.actorUserId,
    clubId: note.clubId,
  });

  if (note.userId !== input.actorUserId) {
    throw new NotTheAuthorError(
      `user ${input.actorUserId} is not the author of note ${note.id}`,
    );
  }

  return note;
}
