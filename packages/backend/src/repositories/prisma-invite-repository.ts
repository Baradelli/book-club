import type {
  Invite as PrismaInvite,
  Prisma,
  PrismaClient,
} from '@prisma/client';

import type { Invite } from '../domain/invite';
import type { InviteRepository } from '../usecases/ports/invite-repository';

function toDomain(record: PrismaInvite): Invite {
  return {
    id: record.id,
    clubId: record.clubId,
    code: record.code,
    role: record.role,
    createdById: record.createdById,
    expiresAt: record.expiresAt,
    usedAt: record.usedAt,
    usedById: record.usedById,
    createdAt: record.createdAt,
  };
}

// Só os campos presentes no patch vão para o `data`. `undefined` é ausência;
// `null` é valor, e sobrescreve.
function toUpdateData(patch: Partial<Invite>): Prisma.InviteUpdateInput {
  const data: Prisma.InviteUpdateInput = {};
  if (patch.code !== undefined) data.code = patch.code;
  if (patch.role !== undefined) data.role = patch.role;
  if (patch.expiresAt !== undefined) data.expiresAt = patch.expiresAt;
  if (patch.usedAt !== undefined) data.usedAt = patch.usedAt;
  if (patch.createdAt !== undefined) data.createdAt = patch.createdAt;
  if (patch.clubId !== undefined) {
    data.club = { connect: { id: patch.clubId } };
  }
  if (patch.createdById !== undefined) {
    data.createdBy = { connect: { id: patch.createdById } };
  }
  if (patch.usedById !== undefined) {
    data.usedBy =
      patch.usedById === null
        ? { disconnect: true }
        : { connect: { id: patch.usedById } };
  }
  return data;
}

export class PrismaInviteRepository implements InviteRepository {
  constructor(private prisma: PrismaClient) {}

  async save(invite: Invite): Promise<Invite> {
    const data = {
      clubId: invite.clubId,
      code: invite.code,
      role: invite.role,
      createdById: invite.createdById,
      expiresAt: invite.expiresAt,
      usedAt: invite.usedAt,
      usedById: invite.usedById,
      createdAt: invite.createdAt,
    };
    const record = await this.prisma.invite.upsert({
      where: { id: invite.id },
      create: { id: invite.id, ...data },
      update: data,
    });
    return toDomain(record);
  }

  async byCode(code: string): Promise<Invite | null> {
    const record = await this.prisma.invite.findUnique({ where: { code } });
    return record ? toDomain(record) : null;
  }

  async update(id: string, patch: Partial<Invite>): Promise<Invite> {
    const record = await this.prisma.invite.update({
      where: { id },
      data: toUpdateData(patch),
    });
    return toDomain(record);
  }
}
