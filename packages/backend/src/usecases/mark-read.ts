import { randomUUID } from 'node:crypto';

import { PlanItemNotFoundError } from '../domain/errors';
import type { ReadingLog } from '../domain/reading-log';
import type { AssertMembership } from './assert-membership';
import { bookForActor } from './book-for-actor';
import type { BookRepository } from './ports/book-repository';
import type { ReadingLogRepository } from './ports/reading-log-repository';
import type { ReadingPlanItemRepository } from './ports/reading-plan-item-repository';

export interface MarkReadInput {
  actorUserId: string; // quem leu. NÃO existe `userId` aqui.
  planItemId: string;
}

export interface MarkReadOutput {
  log: ReadingLog;
  /** A rota da Tarefa 32 devolve 201 × 200 a partir daqui. */
  created: boolean;
}

/**
 * "Li o trecho de hoje": a pessoa marca **um dia do plano** como lido.
 *
 * É o parente próximo do `upsertPlanNote`, e de propósito: recebe
 * `planItemId`, resolve o livro pelo item, corta o tenant pelo `bookForActor`
 * e é idempotente por `unique(planItemId, userId)`. Nem `clubId` nem `bookId`
 * aparecem no input — o `bookId` vem de `planItem.bookId` e o `clubId` de
 * `book.clubId`. É isso que impede marcar leitura num livro de outro clube
 * mandando o `clubId` "certo" no corpo.
 *
 * **Não exige papel**: `MEMBER` marca. Papel de admin manda no livro e no
 * plano, não no que as pessoas registram.
 *
 * **Não faz aritmética de data nenhuma**, e é a consequência que se quis: o
 * log ancora no dia do PLANO, não numa data de calendário, então não há fuso,
 * não há "que dia é hoje" e não há `dayRange` — quem lê no domingo o capítulo
 * de sexta marca o capítulo de sexta. Ver o docblock de `domain/reading-log.ts`.
 *
 * **Não emite `ActivityEvent`**: o gatilho dos três UseCases de escrita entra
 * de uma vez na Tarefa 33. Espalhá-lo agora criaria dois donos da mesma regra.
 */
export class MarkRead {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly books: BookRepository,
    private readonly planItems: ReadingPlanItemRepository,
    private readonly logs: ReadingLogRepository,
  ) {}

  async execute(input: MarkReadInput): Promise<MarkReadOutput> {
    const planItem = await this.planItems.byId(input.planItemId);
    if (!planItem) {
      throw new PlanItemNotFoundError(
        `reading plan item ${input.planItemId} not found`,
      );
    }

    /*
      ⚠️ **O CORTE DE TENANT VEM ANTES DA LEITURA DO LOG, e não só antes da
      escrita.** "Recusou antes de ler" e "leu e depois recusou" dão o MESMO
      erro ao cliente e são coisas diferentes (CONVENCOES-CODIGO §7.3): a
      segunda ordem consulta o registro de leitura de um clube para quem não é
      dele antes de o descartar. É por isso que o teste da regra 5 afirma
      `byPlanItemAndUserCalls === 0`, e não só `saveCalls === 0`.

      O clube sai de `planItem.bookId` → `book.clubId`, NUNCA do input. E o
      guard confere o status do `Membership`, nunca o do `Club` — clube
      arquivado continua legível (ADR 0009); livro arquivado, não, e é o
      `bookForActor` que já recusa com `BookNotFoundError`.
    */
    const book = await bookForActor(this.books, this.assertMembership, {
      actorUserId: input.actorUserId,
      bookId: planItem.bookId,
    });

    /*
      A IDEMPOTÊNCIA, e ela é por `unique(planItemId, userId)` — a mesma forma
      do `upsertPlanNote`. Dois toques na tela, ou o retry da fila offline, têm
      de ser **inofensivos**: lançar "já marcado" transformaria um toque duplo
      em erro para quem está lendo.

      E o retorno antecipado é o que faz a segunda chamada **não escrever**. Um
      `save` que sobrescrevesse a mesma linha daria o mesmo resultado
      observável e um `UPDATE` por toque — o par que só o `saveCalls` separa.
      Nada é reescrito: o `readAt` que fica é o da PRIMEIRA vez, que é quando a
      pessoa leu.
    */
    const existing = await this.logs.byPlanItemAndUser(
      planItem.id,
      input.actorUserId,
    );
    if (existing) {
      return { log: existing, created: false };
    }

    /*
      UMA leitura de relógio, e ela é a única do caminho. Não é só estilo: o
      `readAt` é o dado que a supressão anti-culpa do lembrete (Bloco I) vai
      consultar, e ele nunca vem do cliente — um instante no corpo deixaria a
      pessoa antedatar a leitura.

      "Uma leitura só" se prova CONTANDO leituras, nunca comparando instantes:
      duas chamadas a `new Date()` no mesmo tick devolvem o mesmo milissegundo,
      e na Tarefa 22 esse mutante passou em 1206/1206 (§7.8). Quem conta é o
      `test-support/advancing-clock.ts`, no teste da regra 10.
    */
    const log = await this.logs.save({
      // `randomUUID()` no UseCase: um id vindo do corpo deixaria o cliente
      // sobrescrever o log de outra pessoa pelo upsert do `save`.
      id: randomUUID(),
      clubId: book.clubId,
      bookId: book.id,
      userId: input.actorUserId,
      planItemId: planItem.id,
      readAt: new Date(),
    });
    return { log, created: true };
  }
}
