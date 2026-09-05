import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

// O banco de teste é o MESMO banco de desenvolvimento (docs/SETUP.md §2), então
// NENHUMA limpeza aqui pode ser `deleteMany({})` numa tabela inteira: cada
// arquivo apaga só os ids que ele mesmo criou.
export const prisma = new PrismaClient();

export const TEST_ADMIN_ID = `t03-admin-${randomUUID()}`;

// Ids únicos por execução: uma execução interrompida não deixa fixture no
// caminho da próxima. O `tag` marca a fatia que criou o fixture, para dar
// para achar (e apagar) sobra de uma execução interrompida.
export function prefixedId(tag: string, prefix: string): string {
  return `${tag}-${prefix}-${randomUUID()}`;
}

export function prefixedEmail(tag: string, prefix: string): string {
  return `${tag}-${prefix}-${randomUUID()}@exemplo.test`;
}

export function testId(prefix: string): string {
  return prefixedId('t03', prefix);
}

export function testEmail(prefix: string): string {
  return prefixedEmail('t03', prefix);
}

/** Cria (ou reaproveita) o usuário dono dos fixtures do arquivo. */
export async function setupTestUser(
  id: string = TEST_ADMIN_ID,
  email: string = testEmail('admin'),
): Promise<string> {
  await prisma.user.upsert({
    where: { id },
    create: { id, email, name: 'Fixture Admin', isSuperAdmin: false },
    update: {},
  });
  return id;
}

export interface Fixtures {
  settingsIds?: string[];
  inviteIds?: string[];
  membershipIds?: string[];
  noteIds?: string[];
  planItemIds?: string[];
  bookIds?: string[];
  clubIds?: string[];
  userIds?: string[];
}

/**
 * Apaga só os fixtures informados, na ordem que respeita as foreign keys.
 * Sempre por `id in [...]` — nunca a tabela inteira.
 */
export async function removeFixtures(fixtures: Fixtures): Promise<void> {
  const {
    settingsIds = [],
    inviteIds = [],
    membershipIds = [],
    noteIds = [],
    planItemIds = [],
    bookIds = [],
    clubIds = [],
    userIds = [],
  } = fixtures;

  if (settingsIds.length > 0) {
    await prisma.settings.deleteMany({ where: { id: { in: settingsIds } } });
  }
  if (inviteIds.length > 0) {
    await prisma.invite.deleteMany({ where: { id: { in: inviteIds } } });
  }
  if (membershipIds.length > 0) {
    await prisma.membership.deleteMany({
      where: { id: { in: membershipIds } },
    });
  }
  // A nota antes do plano: `Note.planItemId` é ON DELETE RESTRICT (declarado
  // EXPLICITAMENTE no schema — para relação opcional o default do Prisma seria
  // SET NULL), então um item de plano com nota não se apaga.
  if (noteIds.length > 0) {
    await prisma.note.deleteMany({ where: { id: { in: noteIds } } });
  }
  // O plano antes do livro, e o livro antes do clube e do autor: as FKs são
  // ON DELETE RESTRICT.
  if (planItemIds.length > 0) {
    await prisma.readingPlanItem.deleteMany({
      where: { id: { in: planItemIds } },
    });
  }
  if (bookIds.length > 0) {
    await prisma.book.deleteMany({ where: { id: { in: bookIds } } });
  }
  if (clubIds.length > 0) {
    await prisma.club.deleteMany({ where: { id: { in: clubIds } } });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}
