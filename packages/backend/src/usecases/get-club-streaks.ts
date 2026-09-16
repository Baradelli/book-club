import { localDay } from '@clube/shared';

import { NotAMemberError } from '../domain/errors';
import { computeReadingStreak } from '../domain/reading-streak';
import { DEFAULT_SETTINGS } from '../domain/settings';
import type { BookRepository } from './ports/book-repository';
import type { MembershipRepository } from './ports/membership-repository';
import type { ReadingLogRepository } from './ports/reading-log-repository';
import type { ReadingPlanItemRepository } from './ports/reading-plan-item-repository';
import type { SettingsRepository } from './ports/settings-repository';

export interface GetClubStreaksInput {
  clubId: string;
  /** Sempre `req.user.sub` — nunca do corpo (§6.3). */
  actorUserId: string;
  /** ⚠️ Injetado, e lido UMA vez pelo chamador (ADR 0008 / §7.8). */
  now?: Date;
}

export interface ClubStreak {
  userId: string;
  streak: number;
  /** Se esta pessoa já leu o dia de hoje **no fuso dela**. */
  readToday: boolean;
}

/**
 * A CORRENTE DE CADA PESSOA DO CLUBE — o "foguinho" (ADR 0010).
 *
 * ⚠️ **CALCULADA, NUNCA GUARDADA.** O `CLAUDE.md` diz que progresso se calcula
 * a partir dos logs, e o ADR 0010 mantém essa regra mesmo revertendo a decisão
 * 1 do MVP 3: não existe coluna `streak`, nem job noturno. Guardá-la criaria um
 * segundo dono da verdade que diverge do log no primeiro fuso mal resolvido —
 * e a corrente é justamente uma conta que depende de fuso.
 *
 * ⚠️ **CADA PESSOA TEM O SEU "HOJE".** O `localDay` roda com o `timezone` do
 * `Settings` **dela**, não com o de quem pediu a lista: com um "hoje" só, a
 * corrente de quem mora em outro fuso seria calculada num dia que não é o dela,
 * e o dia que ela ainda tem contaria como falta. Sem linha de `Settings`, vale
 * o `DEFAULT_SETTINGS` — o padrão do projeto para quem nunca abriu a tela.
 *
 * ⚠️ **UMA leitura de relógio para a lista inteira** (§7.8): o `now` chega
 * pronto. Com uma leitura por pessoa, duas pessoas da mesma lista poderiam
 * cair em dias diferentes na virada da meia-noite.
 */
export class GetClubStreaks {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly books: BookRepository,
    private readonly planItems: ReadingPlanItemRepository,
    private readonly readingLogs: ReadingLogRepository,
    private readonly settings: SettingsRepository,
  ) {}

  async execute(input: GetClubStreaksInput): Promise<ClubStreak[]> {
    // ⚠️ O corte de tenant ANTES de qualquer consulta (`CLAUDE.md`): sem
    // membership ativo é 404, e quem não pode ver não descobre que o clube tem
    // plano pelo tempo de resposta.
    const mine = await this.memberships.byUserAndClub(
      input.actorUserId,
      input.clubId,
    );
    if (mine === null || mine.status !== 'ACTIVE') throw new NotAMemberError();

    const now = input.now ?? new Date();

    const clubBooks = await this.books.find({ clubId: input.clubId });
    const bookIds = clubBooks.map((book) => book.id);

    // Sem `date`: o plano INTEIRO do clube, que é o que a corrente percorre
    // (ADR 0010). Lista de livros vazia devolve vazio sem ida ao banco.
    const plan = await this.planItems.find({ bookIds });
    const planDays = plan.map((item) => item.date);
    const planItemIds = plan.map((item) => item.id);

    const members = await this.memberships.findByClub(input.clubId);
    const active = members.filter((member) => member.status === 'ACTIVE');

    const streaks: ClubStreak[] = [];
    for (const member of active) {
      const theirs = await this.settings.byUserId(member.userId);
      const timeZone = theirs?.timezone ?? DEFAULT_SETTINGS.timezone;

      const readPlanItemIds = await this.readingLogs.planItemIdsReadBy(
        member.userId,
        planItemIds,
      );
      const read = new Set(readPlanItemIds);
      const readDays = plan
        .filter((item) => read.has(item.id))
        .map((item) => item.date);

      const today = localDay(now, timeZone);
      streaks.push({
        userId: member.userId,
        streak: computeReadingStreak({ planDays, readDays, today }),
        // ⚠️ O dia de hoje DELA, não o de quem pergunta — mesmo motivo do
        // `today` acima.
        readToday: readDays.includes(today),
      });
    }

    return streaks;
  }
}
