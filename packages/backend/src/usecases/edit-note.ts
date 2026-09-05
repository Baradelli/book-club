import { docToText } from '../domain/doc-to-text';
import { InvalidNoteError } from '../domain/errors';
import type { Note } from '../domain/note';
import { assertNoteDoc, normalizeNoteTitle } from '../domain/note';
import { optionalText } from '../domain/optional-text';
import type { AssertMembership } from './assert-membership';
import { noteForAuthor } from './note-for-author';
import type { NotePatch, NoteRepository } from './ports/note-repository';

/**
 * `undefined` é ausência ("não mexe neste campo"); `null` explícito em
 * `reference` LIMPA o campo. É a mesma semântica do `update(id, patch)` dos
 * repositórios e do `editBook`.
 *
 * `userId`, `clubId`, `bookId`, `kind`, `planItemId`, `createdAt`, `status`,
 * `archivedAt` e `plainText` não aparecem aqui de propósito: autoria e tenant
 * vêm do JWT e da própria nota, `plainText` é derivado do `doc` (ADR 0001), e
 * arquivar é o `archiveNote`.
 */
export interface EditNoteInput {
  actorUserId: string; // tem de ser o AUTOR
  noteId: string;
  /** Ausente = não mexe. Vazio/só-espaços = `InvalidNoteError`. */
  title?: string;
  /** Ausente = não mexe. `null`/`''`/espaços = limpa (grava `null`). */
  reference?: string | null;
  /** Ausente = não mexe (renomear não exige reenviar o documento). */
  doc?: unknown;
}

export interface EditNoteOutput {
  note: Note;
}

/**
 * O autor corrige a própria anotação avulsa. **Ninguém mais mexe** — nem o
 * `OWNER` do clube, nem o super-admin: o grupo lê tudo e não interfere em nada
 * (ADR 0002). Quem confere isso é o `noteForAuthor`, reusado sem cópia.
 *
 * **Last-write-wins**: sem lock otimista e sem resolução de conflito, que é
 * offline Nível 2 e está fora do escopo do `CLAUDE.md`.
 */
export class EditNote {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly notes: NoteRepository,
  ) {}

  async execute(input: EditNoteInput): Promise<EditNoteOutput> {
    // O corte de tenant e de autoria vem antes de tudo: quem não é do clube
    // recebe o mesmo 404 para patch bom e para patch ruim.
    const note = await noteForAuthor(this.notes, this.assertMembership, {
      actorUserId: input.actorUserId,
      noteId: input.noteId,
    });

    /**
     * A anotação do dia tem o próprio caminho de escrita — o `upsertPlanNote`,
     * endereçado por `(planItemId, userId)` —, e ele RESSINCRONIZA o título com
     * o tema atual do item do plano. Editar a nota do dia por aqui deixaria o
     * título velho quando o admin corrigisse o tema: divergência silenciosa, do
     * tipo que só aparece meses depois quando alguém compara a tela do plano
     * com a da anotação. São telas diferentes, e cada uma sabe qual nota edita.
     *
     * Vem ANTES do patch vazio de propósito: um "nada a fazer" bem-sucedido
     * numa nota `PLAN` diria ao front que este caminho serve para ela.
     */
    if (note.kind === 'PLAN') {
      throw new InvalidNoteError(
        `note ${note.id} is a reading plan note; write it through the reading plan`,
      );
    }

    // O patch INTEIRO é validado antes de escrever: um campo ruim não pode
    // deixar os anteriores gravados, nem meia edição.
    const patch = buildPatch(input);

    // Nada a fazer não é erro — é o retry de uma fila offline que já coalesceu
    // tudo. E não pode custar um `UPDATE`: o guard acima já rodou, então o
    // patch vazio não é atalho para furar autoria nenhuma.
    if (Object.keys(patch).length === 0) return { note };

    const updated = await this.notes.update(note.id, {
      ...patch,
      updatedAt: new Date(),
    });
    return { note: updated };
  }
}

/**
 * Só as chaves presentes no input entram no patch — as outras nem existem.
 *
 * É a montagem CAMPO POR CAMPO que fecha a porta do contrabando: nada de
 * spread do input, então `userId`, `clubId` ou `plainText` que venham no corpo
 * não têm por onde chegar à linha.
 */
function buildPatch(input: EditNoteInput): NotePatch {
  const patch: NotePatch = {};

  // O `!== undefined` de cada bloco é a semântica do editNote (ausência não
  // mexe); a regra do campo em si é a do domínio, a mesma que o
  // `createFreeNote` usa.
  if (input.title !== undefined) {
    patch.title = normalizeNoteTitle(input.title);
  }

  // O MESMO `optionalText` do livro e do item do plano: `''`/espaços viram
  // `null`. Uma cópia da regra é como um dos quatro passa a gravar `''`.
  if (input.reference !== undefined) {
    patch.reference = optionalText(input.reference);
  }

  if (input.doc !== undefined) {
    const doc = assertNoteDoc(input.doc);
    patch.doc = doc;
    // O `plainText` é derivado do `doc` a cada escrita, e SÓ quando o `doc`
    // vem: renomear não pode mexer no texto derivado — o `plainText` gravado
    // pode ter vindo de outra versão do `docToText`. → ADR 0001.
    patch.plainText = docToText(doc);
  }

  return patch;
}
