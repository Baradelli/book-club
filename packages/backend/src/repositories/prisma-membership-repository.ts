import type {
  Membership as PrismaMembership,
  PrismaClient,
} from '@prisma/client';

import type { Membership } from '../domain/club';
import type { MembershipRepository } from '../usecases/ports/membership-repository';

function toDomain(record: PrismaMembership): Membership {
  return {
    id: record.id,
    userId: record.userId,
    clubId: record.clubId,
    role: record.role,
    status: record.status,
    joinedAt: record.joinedAt,
  };
}

export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private prisma: PrismaClient) {}

  // Upsert por id: é o que faz a reativação da regra 12 (Tarefa 01) funcionar
  // sem método novo. Um segundo membership do mesmo (userId, clubId) com id
  // diferente bate no @@unique e falha — que é o comportamento desejado.
  async save(membership: Membership): Promise<Membership> {
    const data = {
      userId: membership.userId,
      clubId: membership.clubId,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.joinedAt,
    };
    const record = await this.prisma.membership.upsert({
      where: { id: membership.id },
      create: { id: membership.id, ...data },
      update: data,
    });
    return toDomain(record);
  }

  // Só os ACTIVE, como o port declara. O índice [clubId, status] não serve
  // aqui (a busca é por userId), mas o volume por pessoa é de dezenas.
  async findByUser(userId: string): Promise<Membership[]> {
    const records = await this.prisma.membership.findMany({
      where: { userId, status: 'ACTIVE' },
    });
    return records.map(toDomain);
  }

  /**
   * TODOS os memberships do clube, `ACTIVE` e `ARCHIVED` — Tarefa 26a, regra 10.
   *
   * **Sem `where: { status }`**: quem saiu do clube tem de continuar tendo nome
   * no acervo (ADR 0002), e é o chamador que decide o que fazer com cada
   * `status`. **Sem `orderBy`** também, porque o port não promete ordem — a
   * ordem é do `listClubMembers`, onde ela é decidível (§7.2). O índice
   * `[clubId, status]` é **aplicável** a esta busca pelo prefixo `clubId` — o
   * que o catálogo prova é a aplicabilidade, não que o planner o **escolha**
   * (com um punhado de linhas na tabela ele faz seq scan, e está certo).
   */
  async findByClub(clubId: string): Promise<Membership[]> {
    const records = await this.prisma.membership.findMany({
      where: { clubId },
    });
    return records.map(toDomain);
  }

  async byUserAndClub(
    userId: string,
    clubId: string,
  ): Promise<Membership | null> {
    const record = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    return record ? toDomain(record) : null;
  }
}
