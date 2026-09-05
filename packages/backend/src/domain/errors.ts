// Erros de domínio. A borda (rota) traduz cada um em status HTTP — e só a borda.
// NotAMemberError vira 404 de propósito: não vazamos a existência do clube.
//
// Cada classe declara o próprio `name`: sem isso todas seriam estruturalmente
// idênticas para o TypeScript (trocar uma pela outra numa assinatura compilaria,
// que é justamente o vazamento 404-vs-403) e todas logariam como 'Error'.

export class InvalidClubError extends Error {
  override readonly name = 'InvalidClubError';
}

export class ClubNotFoundError extends Error {
  override readonly name = 'ClubNotFoundError';
}

export class NotAMemberError extends Error {
  override readonly name = 'NotAMemberError';
}

export class ForbiddenRoleError extends Error {
  override readonly name = 'ForbiddenRoleError';
}

export class NotSuperAdminError extends Error {
  override readonly name = 'NotSuperAdminError';
}

export class DuplicateMembershipError extends Error {
  override readonly name = 'DuplicateMembershipError';
}

export class InvalidInviteError extends Error {
  override readonly name = 'InvalidInviteError';
}

export class InviteNotFoundError extends Error {
  override readonly name = 'InviteNotFoundError';
}

export class InviteExpiredError extends Error {
  override readonly name = 'InviteExpiredError';
}

export class InviteAlreadyUsedError extends Error {
  override readonly name = 'InviteAlreadyUsedError';
}

export class EmailAlreadyInUseError extends Error {
  override readonly name = 'EmailAlreadyInUseError';
}

export class WeakPasswordError extends Error {
  override readonly name = 'WeakPasswordError';
}

/**
 * Entrada malformada de livro OU de plano de leitura — vira 400 na borda.
 *
 * Um erro só para as duas famílias de propósito: na borda os dois viram 400
 * igual, e é o `details` do errorSchema que diz qual campo está errado.
 */
export class InvalidBookError extends Error {
  override readonly name = 'InvalidBookError';
}

/**
 * Livro inexistente OU arquivado OU de um clube que não é o seu — vira 404.
 *
 * Um erro só para os três casos de propósito: distinguir "não existe" de
 * "existe em outro clube" na resposta é justamente o vazamento que o 404 do
 * corte de tenant existe para evitar. Livro arquivado entra aqui porque
 * desarquivar é MVP 4: até lá, arquivado é invisível.
 */
export class BookNotFoundError extends Error {
  override readonly name = 'BookNotFoundError';
}

/**
 * Entrada malformada de anotação — vira 400 na borda.
 *
 * Cobre título vazio e `doc` que não é um nó de ProseMirror. Um erro só para as
 * duas famílias pelo mesmo motivo do `InvalidBookError`: na borda os dois viram
 * 400 igual, e é o `details` do errorSchema que diz qual campo está errado.
 */
export class InvalidNoteError extends Error {
  override readonly name = 'InvalidNoteError';
}

/**
 * Nota inexistente OU arquivada OU de um clube que não é o seu — vira 404.
 *
 * Um erro só para os três casos, pelo mesmo motivo do `BookNotFoundError`:
 * distinguir "não existe" de "existe em outro clube" é justamente o vazamento
 * que o 404 do corte de tenant evita. Arquivada entra aqui porque desarquivar é
 * MVP 4 — até lá, arquivada é invisível, inclusive para o próprio autor.
 */
export class NoteNotFoundError extends Error {
  override readonly name = 'NoteNotFoundError';
}

/**
 * O ator é membro ativo do clube da nota, mas a nota não é dele — vira **403**.
 *
 * É o único lugar do projeto onde 403 é o certo para conteúdo, e a razão é o
 * ADR 0002: o clube já lê a nota de todo mundo, com autoria, na listagem.
 * Responder 404 aqui não esconderia nada de quem acabou de ler a nota na tela
 * ao lado — só mentiria para o front, que precisa distinguir "não existe" de
 * "não é sua" para mostrar a mensagem certa.
 *
 * Só é alcançável DEPOIS do `NotAMemberError`: quem não é do clube não pode
 * descobrir, pela diferença entre 403 e 404, que aquela nota existe.
 */
export class NotTheAuthorError extends Error {
  override readonly name = 'NotTheAuthorError';
}

/**
 * Item de plano de leitura inexistente — vira 404.
 *
 * Não cobre "item de outro clube": esse corte é do `bookForActor`, que carrega
 * o livro do item e devolve `BookNotFoundError`. Aqui é só a ausência.
 */
export class PlanItemNotFoundError extends Error {
  override readonly name = 'PlanItemNotFoundError';
}

export class InvalidCredentialsError extends Error {
  override readonly name = 'InvalidCredentialsError';
}

/**
 * Token válido cujo `sub` não existe mais. É 401 (a sessão morreu, o front
 * desloga) e NÃO reaproveita NotAMemberError de propósito: aquele é o erro do
 * corte de tenant, e precisa continuar 404 — senão um membro legítimo que
 * acerte um clube alheio seria deslogado por erro de navegação.
 */
export class SessionUserNotFoundError extends Error {
  override readonly name = 'SessionUserNotFoundError';
}
