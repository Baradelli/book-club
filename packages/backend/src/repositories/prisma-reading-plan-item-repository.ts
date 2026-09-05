import type {
  PrismaClient,
  ReadingPlanItem as PrismaReadingPlanItem,
} from '@prisma/client';

import type { ReadingPlanItem } from '../domain/book';
import type {
  PlanChange,
  ReadingPlanItemRepository,
} from '../usecases/ports/reading-plan-item-repository';
import { calendarDayToDate, dateToCalendarDay } from './calendar-day-mapper';

function toDomain(record: PrismaReadingPlanItem): ReadingPlanItem {
  return {
    id: record.id,
    bookId: record.bookId,
    order: record.order,
    // O único lugar onde a coluna `@db.Date` vira CalendarDay — e sempre em
    // UTC. → calendar-day-mapper.ts.
    date: dateToCalendarDay(record.date),
    title: record.title,
    reference: record.reference,
    createdAt: record.createdAt,
  };
}

/**
 * Os campos de escrita, com a `date` já convertida para a coluna.
 *
 * `create` leva o `bookId`; o `update` do upsert **não**. É o mesmo
 * endurecimento que o `PrismaBookRepository` faz com o `clubId`: mudar o livro
 * de um item do plano moveria a linha (e a anotação que aponta para ela) para
 * outro livro — e, como o livro carrega o clube, entre tenants. Não há caminho
 * que faça isso hoje; os dois irmãos se defendem igual de propósito.
 */
function toCreateData(item: ReadingPlanItem) {
  return { bookId: item.bookId, ...toUpdateData(item) };
}

function toUpdateData(item: ReadingPlanItem) {
  return {
    order: item.order,
    date: calendarDayToDate(item.date),
    title: item.title,
    reference: item.reference,
    createdAt: item.createdAt,
  };
}

export class PrismaReadingPlanItemRepository implements ReadingPlanItemRepository {
  constructor(private prisma: PrismaClient) {}

  // Upsert por id, num `$transaction`: é o que faz o diff do
  // `replacePlanItems` sobreviver sem um `update` separado — o item cuja data
  // sobrevive volta com o mesmo id, então a `Note` que aponta para ele
  // continua apontando. A transação dá o "tudo ou nada": um lote cujo último
  // item viola o `unique(bookId, date)` não deixa os anteriores gravados.
  async saveMany(items: ReadingPlanItem[]): Promise<ReadingPlanItem[]> {
    if (items.length === 0) return [];

    const records = await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.readingPlanItem.upsert({
          where: { id: item.id },
          create: { id: item.id, ...toCreateData(item) },
          update: toUpdateData(item),
        }),
      ),
    );
    return records.map(toDomain);
  }

  // Sem cláusula de clube de propósito: o corte de tenant é do `bookForActor`,
  // que carrega o livro do item. → o port.
  async byId(id: string): Promise<ReadingPlanItem | null> {
    const record = await this.prisma.readingPlanItem.findUnique({
      where: { id },
    });
    return record ? toDomain(record) : null;
  }

  async findByBook(bookId: string): Promise<ReadingPlanItem[]> {
    const records = await this.prisma.readingPlanItem.findMany({
      where: { bookId },
      // O port promete ordem de `order`. É o índice [bookId, order] servindo
      // ao uso real (ADR 0007).
      orderBy: { order: 'asc' },
    });
    return records.map(toDomain);
  }

  /**
   * O diff do plano numa só transação. Ver o port para o porquê de a operação
   * ser um método único em vez de `deleteMany` + `saveMany`.
   *
   * Remove antes de inserir, e a ordem tem efeito real aqui: é a remoção que
   * libera a `date` que um item novo do mesmo lote pode reivindicar (o
   * `unique(bookId, date)` é conferido linha por linha, porque índice único no
   * Postgres não é deferível).
   *
   * `deleteMany` do Prisma é idempotente por natureza (id inexistente não é
   * erro), e a cláusula `bookId` garante que um id de outro livro não apague
   * nada.
   */
  async replaceForBook(
    bookId: string,
    change: PlanChange,
  ): Promise<ReadingPlanItem[]> {
    if (change.removeIds.length === 0 && change.upsert.length === 0) return [];

    // Transação INTERATIVA, não o array de operações: o array mistura o
    // `{ count }` do deleteMany com as linhas do upsert, e separar os dois
    // depois exigiria um cast. Aqui cada retorno já vem tipado.
    const records = await this.prisma.$transaction(async (tx) => {
      if (change.removeIds.length > 0) {
        await tx.readingPlanItem.deleteMany({
          where: { bookId, id: { in: [...change.removeIds] } },
        });
      }

      const upserted: PrismaReadingPlanItem[] = [];
      for (const item of change.upsert) {
        upserted.push(
          await tx.readingPlanItem.upsert({
            where: { id: item.id },
            create: { id: item.id, ...toCreateData(item) },
            update: toUpdateData(item),
          }),
        );
      }
      return upserted;
    });

    return records.map(toDomain);
  }
}
