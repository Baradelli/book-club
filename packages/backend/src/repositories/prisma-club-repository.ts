import type { Club as PrismaClub, PrismaClient } from '@prisma/client';

import type { Club } from '../domain/club';
import type { ClubRepository } from '../usecases/ports/club-repository';

function toDomain(record: PrismaClub): Club {
  return {
    id: record.id,
    name: record.name,
    timezone: record.timezone,
    status: record.status,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
  };
}

export class PrismaClubRepository implements ClubRepository {
  constructor(private prisma: PrismaClient) {}

  // Upsert por id: o UseCase já gerou o id, então o mesmo `save` cria e
  // atualiza (é o que dispensa um método a mais na interface).
  async save(club: Club): Promise<Club> {
    const data = {
      name: club.name,
      timezone: club.timezone,
      status: club.status,
      archivedAt: club.archivedAt,
      createdAt: club.createdAt,
    };
    const record = await this.prisma.club.upsert({
      where: { id: club.id },
      create: { id: club.id, ...data },
      update: data,
    });
    return toDomain(record);
  }

  async byId(id: string): Promise<Club | null> {
    const record = await this.prisma.club.findUnique({ where: { id } });
    return record ? toDomain(record) : null;
  }
}
