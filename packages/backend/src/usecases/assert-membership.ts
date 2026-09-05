import type { MemberRole, Membership } from '../domain/club';
import { ForbiddenRoleError, NotAMemberError } from '../domain/errors';
import type { MembershipRepository } from './ports/membership-repository';

export interface AssertMembershipInput {
  userId: string;
  clubId: string;
  requireRole?: readonly MemberRole[];
}

/**
 * O guard de tenant: toda leitura e toda escrita de conteúdo passa por aqui.
 *
 * ⚠️ **Ele confere o status do `Membership`, e NÃO o do `Club`. Isso é decisão,
 * não esquecimento** — ver `docs/adr/0009-clube-arquivado-continua-legivel.md`.
 *
 * A pergunta ("clube arquivado devia ser invisível?") foi levantada em 13
 * fatias seguidas antes de o dono decidir: **arquivar tira o clube do seletor
 * e não apaga o acervo**. Quem tem membership ativo continua lendo o que o
 * clube escreveu, porque o que foi escrito é das pessoas (ADR 0002), e
 * arquivar é "acabou", não "nunca existiu".
 *
 * Daí a assimetria que salta aos olhos e é **intencional**: o `createBook`
 * carrega o clube e recusa um arquivado, enquanto o `listBooks`, o
 * `getBookWithPlan` e as escritas de anotação funcionam. Não se **acrescenta**
 * conteúdo a um clube encerrado; o que já está lá continua legível. Escrever é
 * ato presente, ler é memória.
 *
 * Se um dia o produto quiser encerrar um clube **de verdade** (sem leitura),
 * isso é estado novo com nome próprio — não uma reinterpretação de `ARCHIVED`.
 */
export class AssertMembership {
  constructor(private readonly memberships: MembershipRepository) {}

  async execute(input: AssertMembershipInput): Promise<Membership> {
    const membership = await this.memberships.byUserAndClub(
      input.userId,
      input.clubId,
    );

    // "Esse clube não existe para você" — a borda traduz em 404.
    if (!membership || membership.status !== 'ACTIVE') {
      throw new NotAMemberError(
        `user ${input.userId} is not an active member of club ${input.clubId}`,
      );
    }

    // "Você está no clube, mas não tem o papel" — a borda traduz em 403.
    if (input.requireRole && !input.requireRole.includes(membership.role)) {
      throw new ForbiddenRoleError(
        `role ${membership.role} is not allowed in club ${input.clubId}`,
      );
    }

    return membership;
  }
}
