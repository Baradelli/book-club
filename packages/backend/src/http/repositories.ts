import type { PrismaClient } from '@prisma/client';

import { PrismaActivityEventRepository } from '../repositories/prisma-activity-event-repository';
import { PrismaBookRepository } from '../repositories/prisma-book-repository';
import { PrismaClubRepository } from '../repositories/prisma-club-repository';
import { PrismaHighlightRepository } from '../repositories/prisma-highlight-repository';
import { PrismaInviteRepository } from '../repositories/prisma-invite-repository';
import { PrismaMembershipRepository } from '../repositories/prisma-membership-repository';
import { PrismaNoteRepository } from '../repositories/prisma-note-repository';
import { PrismaPushSubscriptionRepository } from '../repositories/prisma-push-subscription-repository';
import { PrismaReadingLogRepository } from '../repositories/prisma-reading-log-repository';
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
  readingLogs: PrismaReadingLogRepository;
  /**
   * Foi o único campo tipado pelo PORT até a Tarefa 33, porque a implementação
   * de então era um remendo em `src/http/` que **lançava de propósito**, à
   * espera do `model ActivityEvent`. A **Tarefa 34** criou o modelo, a
   * migration e o repositório real, e o remendo — com a guarda auto-desarmável
   * que vigiava esta linha — foi **apagado**. Com a implementação de verdade no
   * lugar, o campo volta à forma dos outros dez: tipado pela classe concreta.
   *
   * (O nome da classe removida não é citado aqui de propósito: a regra 4 da
   * fatia é que o `grep` por ele em `packages/backend/src` volte VAZIO.)
   */
  activityEvents: PrismaActivityEventRepository;
  /**
   * Bloco I (Tarefa 36). Um aparelho inscrito é da PESSOA, não do clube
   * (decisão F) — é o único repositório desta lista, junto com `settings`, que
   * não conhece `clubId`.
   */
  pushSubscriptions: PrismaPushSubscriptionRepository;
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
    activityEvents: new PrismaActivityEventRepository(prisma),
    pushSubscriptions: new PrismaPushSubscriptionRepository(prisma),
  };
}
