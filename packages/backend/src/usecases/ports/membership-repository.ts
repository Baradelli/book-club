import type { Membership } from '../../domain/club';

export interface MembershipRepository {
  save(membership: Membership): Promise<Membership>;
  byUserAndClub(userId: string, clubId: string): Promise<Membership | null>;
  /** Só os memberships ACTIVE da pessoa. */
  findByUser(userId: string): Promise<Membership[]>;
  /**
   * TODOS os memberships do clube — `ACTIVE` **e** `ARCHIVED`.
   *
   * A assimetria com o `findByUser` acima é decisão, não esquecimento: sair do
   * clube **arquiva** o `Membership` e **não** apaga o que a pessoa escreveu,
   * porque "o acervo do clube continua íntegro, **com autoria**"
   * (`docs/adr/0002-visibilidade-total-no-clube.md`). Filtrar os arquivados
   * aqui devolveria a anotação de quem saiu ao anonimato — a lacuna que a
   * Tarefa 26a existe para fechar. Quem só quer os ativos filtra pelo `status`
   * que vem em cada linha.
   *
   * **Não promete ordem.** Quem precisa de ordem ordena no UseCase; o fake
   * enumera INVERTIDO de propósito para que confiar nesta ordem falhe
   * (`docs/CONVENCOES-CODIGO.md` §7.2).
   */
  findByClub(clubId: string): Promise<Membership[]>;
}
