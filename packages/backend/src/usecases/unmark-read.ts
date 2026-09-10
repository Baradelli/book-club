import { PlanItemNotFoundError } from '../domain/errors';
import type { AssertMembership } from './assert-membership';
import { bookForActor } from './book-for-actor';
import type { BookRepository } from './ports/book-repository';
import type { ReadingLogRepository } from './ports/reading-log-repository';
import type { ReadingPlanItemRepository } from './ports/reading-plan-item-repository';

export interface UnmarkReadInput {
  actorUserId: string; // quem desmarca, e é sempre a PRÓPRIA leitura dele
  planItemId: string;
  /*
    ⚠️ **NÃO existe `logId` aqui, e é a decisão E da Tarefa 30.**

    O par (dia, pessoa) já É a identidade do registro, então o log de outra
    pessoa é **inalcançável**: não há endereço por onde pedi-lo. A alternativa
    — receber `logId` e conferir `log.userId === actor` com um
    `NotTheAuthorError` — é a forma da nota e do grifo, e ela é certa **lá**,
    porque lá o recurso tem endereço próprio. Aqui seria um guard de autoria
    sobre uma busca que já é por autor: uma regra a manter em dia sem nada a
    guardar.
  */
}

/**
 * "Me enganei": a pessoa desmarca **a própria** leitura de um dia do plano.
 *
 * **É HARD DELETE, e é a exceção documentada ao soft delete do projeto**
 * (`CLAUDE.md`, e as decisões fechadas do MVP 3): `ReadingLog` e
 * `ActivityEvent` são logs imutáveis — não se arquivam nem se editam. A
 * entidade nem tem `status` ou `archivedAt` para onde arquivar.
 *
 * **É IDEMPOTENTE: não haver o que apagar NÃO é erro** (decisão C). Lançar um
 * `ReadingLogNotFoundError` obrigaria a tela a distinguir "desmarquei" de "já
 * estava desmarcado", que é a mesma coisa para quem olha — e criaria uma
 * classe de erro nova só para isso.
 *
 * **Ninguém desmarca a leitura de outra pessoa, nem o `OWNER` do clube, nem o
 * super-admin** — e isso é ESTRUTURAL, não um `if`: veja o `UnmarkReadInput`.
 * Dentro do clube não existe conteúdo privado (ADR 0002), então quem leu é
 * visível para todos; o que a autoria protege é a **escrita** do registro.
 *
 * Como o `markRead`, **não faz aritmética de data nenhuma**: o log ancora no
 * dia do PLANO, não numa data de calendário.
 */
export class UnmarkRead {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly books: BookRepository,
    private readonly planItems: ReadingPlanItemRepository,
    private readonly logs: ReadingLogRepository,
  ) {}

  async execute(input: UnmarkReadInput): Promise<void> {
    const planItem = await this.planItems.byId(input.planItemId);
    if (!planItem) {
      throw new PlanItemNotFoundError(
        `reading plan item ${input.planItemId} not found`,
      );
    }

    /*
      O MESMO corte de tenant do `markRead`, e pelo mesmo motivo: o clube sai
      de `planItem.bookId` → `book.clubId`, nunca do input, e vem **antes da
      leitura** — "recusou antes de ler" e "leu e depois recusou" dão o mesmo
      erro ao cliente e são coisas diferentes (§7.3).

      Livro arquivado é recusado aqui, pelo `bookForActor`; clube arquivado
      **não** é, porque o guard confere o `Membership` e não o `Club`
      (ADR 0009). Nenhuma segunda regra de tenant nasce nesta fatia.
    */
    await bookForActor(this.books, this.assertMembership, {
      actorUserId: input.actorUserId,
      bookId: planItem.bookId,
    });

    /*
      A BUSCA É POR `(planItemId, actorUserId)`, e é ela que faz a decisão E
      ser estrutural: o log da Maria não aparece para o Marcos, então não há
      linha alheia ao alcance deste `delete`. Nenhum `if` de autoria, porque
      não há nada que ele pudesse recusar.
    */
    const existing = await this.logs.byPlanItemAndUser(
      planItem.id,
      input.actorUserId,
    );

    /*
      ⚠️ **O retorno antecipado é METADE da regra 14, e é a metade que só o
      contador vê.** O port declara o `delete` idempotente, então chamá-lo com
      um id que não existe daria o mesmo resultado observável — e uma ida ao
      banco por toque, em quem já desmarcou. "Não chamou" × "chamou e não havia
      o que apagar" é exatamente o par do §7.3.
    */
    if (!existing) return;

    await this.logs.delete(existing.id);
  }
}
