import { HighlightNotFoundError, NotTheAuthorError } from '../domain/errors';
import type { Highlight } from '../domain/highlight';
import type { AssertMembership } from './assert-membership';
import type { HighlightRepository } from './ports/highlight-repository';

export interface HighlightForAuthorInput {
  actorUserId: string;
  highlightId: string;
}

/**
 * O corte de tenant **e** de autoria do grifo, em UM lugar só.
 *
 * Carrega o grifo e confirma que o ator é (a) membro ativo do clube **DO GRIFO**
 * e (b) o autor. O clube vem de `highlight.clubId`, NUNCA do input — é isso que
 * impede mexer num grifo de outro clube mandando o `clubId` "certo" no corpo.
 * Extraído desde o início porque os dois UseCases de escrita da fatia precisam
 * dele: é o mesmo critério que tirou o `noteForAuthor` do `editNote`, e é cópia
 * fiel dele.
 *
 * Grifo inexistente e grifo arquivado dão o mesmo `HighlightNotFoundError`
 * (404): arquivado é invisível até o MVP 4 — inclusive para o autor, porque
 * desarquivar não existe —, e distinguir os casos vazaria estado.
 *
 * **A ORDEM é obrigatória: membership ANTES de autoria.** Quem não é do clube
 * recebe `NotAMemberError` (404) mesmo não sendo o autor, senão a diferença
 * entre 403 e 404 confirmaria a um forasteiro que aquele grifo existe. Depois do
 * membership, o 403 é o certo — e é o `NotTheAuthorError`, reusado sem cópia
 * porque a razão é a mesma da nota: o membro ativo já LÊ o grifo de todo mundo
 * na listagem (ADR 0002), então esconder com 404 não protegeria nada e mentiria
 * para o front, que precisa distinguir "não existe" de "não é seu".
 *
 * **Sem papel exigido, e papel nenhum substitui autoria**: nem o `OWNER` do
 * clube nem o super-admin mexem no grifo de outra pessoa. Mandar no livro e no
 * plano não é mandar no que as pessoas escreveram.
 */
export async function highlightForAuthor(
  highlights: HighlightRepository,
  assertMembership: AssertMembership,
  input: HighlightForAuthorInput,
): Promise<Highlight> {
  const highlight = await highlights.byId(input.highlightId);
  if (!highlight || highlight.status !== 'ACTIVE') {
    throw new HighlightNotFoundError(
      `highlight ${input.highlightId} not found`,
    );
  }

  await assertMembership.execute({
    userId: input.actorUserId,
    clubId: highlight.clubId,
  });

  if (highlight.userId !== input.actorUserId) {
    throw new NotTheAuthorError(
      `user ${input.actorUserId} is not the author of highlight ${highlight.id}`,
    );
  }

  return highlight;
}
