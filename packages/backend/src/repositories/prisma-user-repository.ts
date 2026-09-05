import type { Prisma, PrismaClient, User as PrismaUser } from '@prisma/client';

import type { User } from '../domain/user';
import type { UserRepository } from '../usecases/ports/user-repository';

function toDomain(record: PrismaUser): User {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    passwordHash: record.passwordHash,
    isSuperAdmin: record.isSuperAdmin,
    createdAt: record.createdAt,
  };
}

// Só os campos presentes no patch vão para o `data`. `undefined` é ausência
// (o Prisma também o trata assim); `null` é valor, e sobrescreve.
function toUpdateData(patch: Partial<User>): Prisma.UserUpdateInput {
  const data: Prisma.UserUpdateInput = {};
  if (patch.email !== undefined) data.email = patch.email;
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.passwordHash !== undefined) data.passwordHash = patch.passwordHash;
  if (patch.isSuperAdmin !== undefined) data.isSuperAdmin = patch.isSuperAdmin;
  if (patch.createdAt !== undefined) data.createdAt = patch.createdAt;
  return data;
}

export class PrismaUserRepository implements UserRepository {
  constructor(private prisma: PrismaClient) {}

  async save(user: User): Promise<User> {
    const data = {
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      isSuperAdmin: user.isSuperAdmin,
      createdAt: user.createdAt,
    };
    const record = await this.prisma.user.upsert({
      where: { id: user.id },
      create: { id: user.id, ...data },
      update: data,
    });
    return toDomain(record);
  }

  async byId(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });
    return record ? toDomain(record) : null;
  }

  // Recebe o e-mail JÁ normalizado: normalizar é domínio (normalizeEmail),
  // não persistência. Por isso a busca é exata.
  async byEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { email } });
    return record ? toDomain(record) : null;
  }

  async update(id: string, patch: Partial<User>): Promise<User> {
    const record = await this.prisma.user.update({
      where: { id },
      data: toUpdateData(patch),
    });
    return toDomain(record);
  }
}
