import type { Membership } from '../../domain/club';
import type { MembershipRepository } from '../ports/membership-repository';

export class MembershipRepositoryFake implements MembershipRepository {
  private store = new Map<string, Membership>();
  private findByClubCallCount = 0;

  async save(membership: Membership): Promise<Membership> {
    this.assertUniqueUserAndClub(membership);
    this.store.set(membership.id, this.clone(membership));
    return this.clone(membership);
  }

  async byUserAndClub(
    userId: string,
    clubId: string,
  ): Promise<Membership | null> {
    for (const membership of this.store.values()) {
      if (membership.userId === userId && membership.clubId === clubId) {
        return this.clone(membership);
      }
    }
    return null;
  }

  /**
   * Só os ACTIVE: é o que o port declara e o que o `getMe` espera.
   *
   * Enumera INVERTIDO, como o `findByClub` — e isso foi **medido** na rodada de
   * correção da Tarefa 26a, não presumido: acrescentar o `.reverse()` aqui dá
   * **0 acusadores** em 1286 testes. Nenhum teste e nenhum caminho do `getMe`
   * dependia da ordem de um port que não a promete; se algo dependesse, teria
   * aparecido aqui, e seria o achado.
   *
   * Custa zero e fecha a assimetria: metade de um fake com a armadilha do §7.2
   * e metade sem ela é metade de um port entregando uma estabilidade que ele
   * não prometeu — e é justamente na metade "estável" que o próximo UseCase se
   * apoia sem perceber.
   */
  async findByUser(userId: string): Promise<Membership[]> {
    return [...this.store.values()]
      .reverse()
      .filter(
        (membership) =>
          membership.userId === userId && membership.status === 'ACTIVE',
      )
      .map((membership) => this.clone(membership));
  }

  /**
   * TODOS os memberships do clube, `ACTIVE` e `ARCHIVED` — Tarefa 26a.
   *
   * **Sem filtro de status de propósito**, e isso é a pergunta do §7.1 ("o
   * Postgres faria isto?") respondida: o Prisma correspondente é um
   * `findMany({ where: { clubId } })` puro. Um fake restritivo aqui apagaria a
   * autoria de quem saiu do clube (ADR 0002) com a suíte inteira verde.
   *
   * Enumera INVERTIDO (§7.2): o port não promete ordem, e é o `listClubMembers`
   * que ordena.
   *
   * ⚠️ **E aqui a justificativa é OUTRA — a primeira versão deste docblock
   * afirmava, sobre uma medição, o oposto do que ela diz.** A frase era *"se
   * este método devolvesse na ordem 'natural', um UseCase sem `sort` passaria
   * verde"*, e ela é **falsa**: mutação DUPLA (fake sem `.reverse()` **e**
   * `listClubMembers` sem `sort`) → **3 acusadores**, dois deles os testes de
   * ordem do UseCase. Quem mata o mutante sem `sort` é o **fixture**
   * (inserção `[b,a,c,d,e]` ≠ esperada `[b,d,a,e,c]`), não a inversão.
   *
   * A inversão fica porque é a **convenção do §7.2** — a ordem que o Postgres
   * devolve sem `ORDER BY` é indefinida de verdade, e "invertida" é a única
   * escolha que FALHA quando alguém passa a confiar na ordem do repositório.
   * Ela é seguro contra o fixture FUTURO, que pode nascer já na ordem
   * esperada; não é o acusador dos de hoje. Não confunda as duas coisas: é a
   * "lição sobre a lição" do §7.1 — afirmação sobre medição, escrita sem a
   * medição colada, viaja de docblock em docblock.
   */
  async findByClub(clubId: string): Promise<Membership[]> {
    // Conta a CHAMADA, antes de qualquer coisa (§7.3): é o que separa "recusou
    // antes de ler" de "leu e depois recusou" no corte de tenant.
    this.findByClubCallCount += 1;
    return [...this.store.values()]
      .reverse()
      .filter((membership) => membership.clubId === clubId)
      .map((membership) => this.clone(membership));
  }

  /** Quantas vezes `findByClub` foi chamado — o contador do §7.3. */
  get findByClubCalls(): number {
    return this.findByClubCallCount;
  }

  get saved(): Membership[] {
    return [...this.store.values()].map((membership) => this.clone(membership));
  }

  // Não é erro de domínio: é o fake protegendo o @@unique([userId, clubId])
  // que o Postgres impõe. Se cair aqui, o UseCase tentou criar um membership
  // que o banco recusaria (a regra 12 manda reativar, não recriar).
  private assertUniqueUserAndClub(membership: Membership): void {
    for (const existing of this.store.values()) {
      if (
        existing.id !== membership.id &&
        existing.userId === membership.userId &&
        existing.clubId === membership.clubId
      ) {
        throw new Error(
          `MembershipRepositoryFake: saving membership ${membership.id} violates unique(userId, clubId) — user ${membership.userId} already has membership ${existing.id} in club ${membership.clubId}`,
        );
      }
    }
  }

  // Clona nos dois sentidos (entrada do save e saída da leitura): nem o
  // chamador contamina o store, nem o store devolve referência sua. A Date
  // precisa ser copiada — o Prisma devolve Date nova a cada leitura.
  private clone(membership: Membership): Membership {
    return { ...membership, joinedAt: new Date(membership.joinedAt) };
  }
}
