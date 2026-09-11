import type { PrismaClient } from '@prisma/client';

import { PrismaBookRepository } from '../repositories/prisma-book-repository';
import { PrismaClubRepository } from '../repositories/prisma-club-repository';
import { PrismaHighlightRepository } from '../repositories/prisma-highlight-repository';
import { PrismaInviteRepository } from '../repositories/prisma-invite-repository';
import { PrismaMembershipRepository } from '../repositories/prisma-membership-repository';
import { PrismaNoteRepository } from '../repositories/prisma-note-repository';
import { PrismaReadingLogRepository } from '../repositories/prisma-reading-log-repository';
import { PrismaReadingPlanItemRepository } from '../repositories/prisma-reading-plan-item-repository';
import { PrismaSettingsRepository } from '../repositories/prisma-settings-repository';
import { PrismaUserRepository } from '../repositories/prisma-user-repository';
import type { ActivityEventRepository } from '../usecases/ports/activity-event-repository';
import { PendingActivityEventRepository } from './pending-activity-event-repository';

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
  readingLogs: PrismaReadingLogRepository;
  /**
   * ⚠️ **Tipado pelo PORT, e não pela classe concreta** — é o único assim, e é
   * de propósito: a implementação de hoje é a
   * `PendingActivityEventRepository`, que a **Tarefa 34** troca pela do Prisma.
   * Com o tipo do port, essa troca é **uma linha aqui** e nada nas rotas.
   */
  activityEvents: ActivityEventRepository;
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
    readingLogs: new PrismaReadingLogRepository(prisma),
    // ⚠️ A LINHA QUE A TAREFA 34 TROCA — ver o docblock da classe.
    activityEvents: new PendingActivityEventRepository(),
  };
}
