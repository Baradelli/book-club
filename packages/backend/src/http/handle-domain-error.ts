import {
  BookNotFoundError,
  ClubNotFoundError,
  DuplicateMembershipError,
  EmailAlreadyInUseError,
  ForbiddenRoleError,
  InvalidBookError,
  InvalidClubError,
  InvalidCredentialsError,
  InvalidInviteError,
  InvalidNoteError,
  InviteAlreadyUsedError,
  InviteExpiredError,
  InviteNotFoundError,
  NotAMemberError,
  NoteNotFoundError,
  NotSuperAdminError,
  NotTheAuthorError,
  PlanItemNotFoundError,
  SessionUserNotFoundError,
  WeakPasswordError,
} from '../domain/errors';

/**
 * O mínimo de reply que a tradução usa — FastifyReply satisfaz. O retorno é
 * genérico para o handler continuar inferindo o próprio tipo de resposta.
 */
interface DomainErrorReply<T> {
  status(statusCode: number): { send(payload: { error: string }): T };
}

// O ÚNICO ponto de tradução erro de domínio → status HTTP. `instanceof` só
// aqui, na borda. NotAMemberError é 404 de propósito (não 403): não
// confirmamos a existência de um clube de que a pessoa não participa.
const STATUS_BY_ERROR: ReadonlyArray<
  readonly [new (message?: string) => Error, number]
> = [
  [InvalidBookError, 400],
  [InvalidClubError, 400],
  [InvalidNoteError, 400],
  [InvalidInviteError, 400],
  [WeakPasswordError, 400],
  [InvalidCredentialsError, 401],
  [SessionUserNotFoundError, 401],
  [ForbiddenRoleError, 403],
  [NotSuperAdminError, 403],
  // O único 403 de conteúdo: o ator é membro ativo e já LÊ a nota (ADR 0002),
  // só não é o autor. Esconder com 404 aqui não protegeria nada.
  [NotTheAuthorError, 403],
  // Livro inexistente, arquivado ou de outro clube: os três são 404, e é o
  // que impede a resposta de vazar a existência do recurso.
  [BookNotFoundError, 404],
  [ClubNotFoundError, 404],
  [NotAMemberError, 404],
  // Nota inexistente, arquivada ou de outro clube: os três são 404, pelo mesmo
  // motivo do livro.
  [NoteNotFoundError, 404],
  // Item de plano inexistente é 404 pelo mesmo motivo do livro: a resposta não
  // diz se o item não existe ou se é de um clube que não é o seu.
  [PlanItemNotFoundError, 404],
  [InviteNotFoundError, 404],
  [DuplicateMembershipError, 409],
  [EmailAlreadyInUseError, 409],
  /*
    ⚠️ `InviteAlreadyUsedError` é 410 E NÃO 409, e a razão é a tela (rodada de
    correção da Tarefa 15).

    O corpo de erro fora da classe 400 não carrega discriminador (§6.2: texto
    genérico por status), então TODO status é o único sinal que o front tem. Com
    "já foi usado" e "venceu" no MESMO 409 de `DuplicateMembershipError`, a tela
    de aceite não tinha como escrever uma frase certa: ela dizia "este e-mail já
    está no clube, ou este convite já foi usado" e marcava o campo de e-mail —
    ou seja, punha `aria-invalid="true"` num e-mail válido e, por ser erro de
    CAMPO, deixava a mensagem fora de qualquer `role="alert"`: quem usa leitor
    de tela não ouvia nada.

    Para quem lê, "este link já foi usado" e "este link venceu" são a mesma
    frase — *"não vale mais, peça outro"* —, que é exatamente o 410 que
    `InviteExpiredError` já produzia. Com esta linha, o **409 desta rota passa a
    significar só `DuplicateMembershipError`** ("você já está neste clube"), e
    aí marcar o campo de e-mail fica correto.
  */
  [InviteAlreadyUsedError, 410],
  [InviteExpiredError, 410],
];

/**
 * Texto público por status. `error.message` só sai na classe 400, que é erro
 * de validação e a pessoa precisa ler. Nos outros status a mensagem de
 * domínio fica no log e não na resposta: sem este gate, o primeiro UseCase
 * futuro que escrever `email X já em uso` numa mensagem vaza dado pela API,
 * e faltam ~30 tarefas de UseCase.
 */
const PUBLIC_MESSAGE_BY_STATUS: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

/**
 * Texto público de um status. Fonte única: o tradutor de erro de domínio, o
 * errorHandler do Fastify e a rede de segurança de serialização usam este
 * mesmo mapa, para a API não ter três vocabulários de erro.
 */
export function publicMessageForStatus(status: number): string {
  return (
    PUBLIC_MESSAGE_BY_STATUS[status] ??
    (status >= 500 ? 'Internal Server Error' : 'Error')
  );
}

export function handleDomainError<T>(
  error: unknown,
  reply: DomainErrorReply<T>,
): T {
  for (const [ErrorClass, status] of STATUS_BY_ERROR) {
    if (error instanceof ErrorClass) {
      const message =
        status === 400 ? error.message : publicMessageForStatus(status);
      return reply.status(status).send({ error: message });
    }
  }

  // Desconhecido: relança de propósito. Um 500 no log é melhor que um 400
  // mentiroso que esconde o bug.
  throw error;
}
