import type { PrismaClient } from '@prisma/client';

import { PrismaBookRepository } from '../repositories/prisma-book-repository';
import { PrismaClubRepository } from '../repositories/prisma-club-repository';
import { PrismaHighlightRepository } from '../repositories/prisma-highlight-repository';
import { PrismaInviteRepository } from '../repositories/prisma-invite-repository';
import { PrismaMembershipRepository } from '../repositories/prisma-membership-repository';
import { PrismaNoteRepository } from '../repositories/prisma-note-repository';
import { PrismaReadingPlanItemRepository } from '../repositories/prisma-reading-plan-item-repository';
import { PrismaSettingsRepository } from '../repositories/prisma-settings-repository';
import { PrismaUserRepository } from '../repositories/prisma-user-repository';

export interface Repositories {
  users: PrismaUserRepository;
  clubs: PrismaClubRepository;
  memberships: PrismaMembershipRepository;
  invites: PrismaInviteRepository;
  settings: PrismaSettingsRepository;
  books: PrismaBookRepository;
  planItems: PrismaReadingPlanItemRepository;
  notes: PrismaNoteRepository;
  highlights: PrismaHighlightRepository;
}

/**
 * Instancia os repositórios de um `PrismaClient`. Cada arquivo de rota chama
 * isto UMA vez, no registro — assim um repositório novo entra em um lugar só,
 * em vez de em cada arquivo de rota.
 */
export function buildRepositories(prisma: PrismaClient): Repositories {
  return {
    users: new PrismaUserRepository(prisma),
    clubs: new PrismaClubRepository(prisma),
    memberships: new PrismaMembershipRepository(prisma),
    invites: new PrismaInviteRepository(prisma),
    settings: new PrismaSettingsRepository(prisma),
    books: new PrismaBookRepository(prisma),
    planItems: new PrismaReadingPlanItemRepository(prisma),
    notes: new PrismaNoteRepository(prisma),
    highlights: new PrismaHighlightRepository(prisma),
  };
}
