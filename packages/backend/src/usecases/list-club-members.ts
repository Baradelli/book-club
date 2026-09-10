import type { GeneralStatus, MemberRole } from '../domain/club';
import type { AssertMembership } from './assert-membership';
import type { MembershipRepository } from './ports/membership-repository';
import type { UserRepository } from './ports/user-repository';

export interface ListClubMembersInput {
  actorUserId: string;
  /** OBRIGATÓRIO: é a âncora de tenant, como no `listNotes`. */
  clubId: string;
}

/**
 * Uma pessoa do clube, do ponto de vista de quem precisa ATRIBUIR autoria.
 *
 * Quatro campos, e cada um tem chamador: o `userId` casa com o `Note.userId`
 * da listagem, o `name` é o que a tela escreve no avatar, o `role` é o que
 * distingue quem administra, e o `status` é o que diz se a pessoa ainda está no
 * clube (só as ativas viram chip do filtro por pessoa; as arquivadas servem
 * para resolver o nome de quem escreveu e saiu).
 *
 * **Sem e-mail**: a tela precisa de nome para atribuir autoria, e expor o
 * e-mail de todo membro a todo membro é PII além da necessidade (decisão B).
 * **Sem `membershipId` e sem `joinedAt`**: nenhum chamador, e cada campo
 * declarado é um campo que sai (decisão H).
 */
export interface ClubMember {
  userId: string;
  /**
   * ANULÁVEL, e o backend **não** inventa fallback: `User.name` é `String?` e o
   * aceite de convite não exige nome. Um `?? 'Alguém'` aqui seria texto de
   * interface no servidor, que o `CLAUDE.md` proíbe — e em que idioma? Quem
   * decide a frase é o `t()` da tela (decisão C).
   */
  name: string | null;
  role: MemberRole;
  status: GeneralStatus;
}

export type ListClubMembersOutput = ClubMember[];

/**
 * Quem é o clube: os nomes por trás dos `userId` do acervo.
 *
 * Existe para que a anotação de outra pessoa deixe de dizer "Alguém do clube" e
 * passe a dizer o nome dela, e para que o filtro por pessoa tenha o que
 * escrever no chip.
 *
 * **Devolve os memberships `ACTIVE` E `ARCHIVED`**, cada um com o seu `status`.
 * Não é generosidade: sair do clube arquiva o `Membership` e **não** apaga o
 * que a pessoa escreveu — "o acervo do clube continua íntegro, **com
 * autoria**" (`docs/adr/0002-visibilidade-total-no-clube.md`). Devolver só os
 * ativos devolveria a anotação de quem saiu ao anonimato, que é exatamente a
 * lacuna que esta fatia fecha.
 *
 * **Não exige papel.** Ler quem é o clube é atribuição, não administração:
 * dentro do clube tudo é visível (ADR 0002), e o nome de quem escreveu é o
 * mínimo disso.
 */
export class ListClubMembers {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly memberships: MembershipRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(input: ListClubMembersInput): Promise<ListClubMembersOutput> {
    // ANTES da consulta, sempre: um ator de fora não pode gerar nem uma
    // leitura — senão a rota trafega os nomes de um clube que não é dele antes
    // de descartá-los, e vira oráculo de existência. → §7.3.
    await this.assertMembership.execute({
      userId: input.actorUserId,
      clubId: input.clubId,
    });

    const memberships = await this.memberships.findByClub(input.clubId);

    const members: ClubMember[] = [];
    for (const membership of memberships) {
      // Um `byId` por membro, em laço, e é o precedente EXATO do `getMe`, que
      // faz `clubs.byId` por membership. Um clube tem 2–10 pessoas ⇒ ~11
      // consultas; um `byIds` novo sem necessidade medida seria especulação.
      // **Registrado**: se um clube passar de dezenas, o `byIds` é a saída — e
      // aí ele nasce com chamador (decisão F).
      const user = await this.users.byId(membership.userId);

      /*
        Membership cujo usuário não existe: ignorado.

        ⚠️ **Inalcançável hoje, e de propósito sem teste.** A FK
        `Membership.userId → User.id` é `ON DELETE RESTRICT` (o default do
        Prisma para relação obrigatória, confirmado no catálogo na Tarefa 24),
        então o banco recusa apagar a pessoa antes de apagar a filiação: é lá,
        na FK, que a propriedade É garantida. Esta linha é defesa em
        profundidade e **não tem acusador possível** — inventar um fixture
        impossível para "cobri-la" provaria o comportamento de um estado que o
        banco não deixa existir. → §7.10.
      */
      if (!user) continue;

      members.push({
        // Campo a campo, e não `{ ...user }`: o `User` carrega `email`,
        // `passwordHash` e `isSuperAdmin`, e o `response` schema é a segunda
        // barreira, não a primeira (§6.1).
        userId: user.id,
        name: user.name,
        role: membership.role,
        status: membership.status,
      });
    }

    // `members` é array NOSSO (montado aqui), então ordenar in loco é seguro —
    // ao contrário do `listNotes`, que copia porque o array é do repositório.
    return members.sort(compareByName);
  }
}

/**
 * Nome crescente, **nulos no fim**, desempate por `userId`.
 *
 * Comparação por **code point** e não `localeCompare`: escolher locale no
 * backend exigiria decidir de QUEM (do clube? de quem lê?), e a lista tem 2–10
 * pessoas — a tela reordena se quiser (decisão E).
 *
 * O nulo vai para o fim porque a tela lista gente com nome primeiro; e o
 * desempate por `userId` existe para a ordem ser DETERMINÍSTICA — dois membros
 * homônimos num clube de casal é o caso normal (a "Maria" e a "Maria"), e sem
 * ele a ordem sairia como o repositório enumerou, que é diferente entre o fake
 * e o Prisma. → §7.2.
 */
function compareByName(a: ClubMember, b: ClubMember): number {
  if (a.name === null && b.name === null) return compareByUserId(a, b);
  if (a.name === null) return 1;
  if (b.name === null) return -1;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;

  return compareByUserId(a, b);
}

function compareByUserId(a: ClubMember, b: ClubMember): number {
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}
