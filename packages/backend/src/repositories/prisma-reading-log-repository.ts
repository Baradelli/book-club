import type {
  PrismaClient,
  ReadingLog as PrismaReadingLog,
} from '@prisma/client';

import type { ReadingLog } from '../domain/reading-log';
import type {
  ReadingLogFilter,
  ReadingLogRepository,
} from '../usecases/ports/reading-log-repository';

/**
 * Seis colunas, todas escalares e todas NOT NULL: não há `doc` para atravessar
 * (ADR 0001), não há `Json?` para o `Prisma.DbNull` (o grifo), não há
 * `CalendarDay` para converter (o item de plano) e não há `status`/`archivedAt`
 * para mapear — o log é imutável. É o mapper mais raso do projeto, e é assim
 * porque a entidade é a mais rasa.
 */
function toDomain(record: PrismaReadingLog): ReadingLog {
  return {
    id: record.id,
    clubId: record.clubId,
    bookId: record.bookId,
    userId: record.userId,
    planItemId: record.planItemId,
    readAt: record.readAt,
  };
}

/**
 * O registro de "eu li o trecho de hoje" no Postgres.
 *
 * ⚠️ **NÃO há `FIND_ROW_LIMIT` aqui**, ao contrário do repositório da nota e
 * do grifo — e a divergência é medida, não esquecimento. O motivo inteiro mora
 * no docblock do `find` do port (`usecases/ports/reading-log-repository.ts`):
 * a linha não carrega JSON, o conjunto é limitado por dias-do-plano × membros,
 * e um `take` faria a sobreposição **perder leitores em silêncio** — a válvula
 * viraria a falha, que é o mesmo argumento do `planItemIdsWithAnyNote`. Uma
 * verdade, um lugar.
 */
export class PrismaReadingLogRepository implements ReadingLogRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Upsert com o alvo em **`(planItemId, userId)`**, e não no `id` — a mesma
   * escolha do `PrismaNoteRepository.save` para a nota do dia, pelo mesmo
   * motivo e com o mesmo teste.
   *
   * ⚠️ **A CORRIDA É REAL, e a primeira entrega desta fatia errou a conta.** O
   * docblock que estava aqui dizia que a janela era "um toque duplo em
   * milissegundos num botão que não autossalva". Ela não é: é a **latência do
   * round-trip** — 200 ms a 1 s num PWA mobile em rede ruim — mais o **retry
   * da fila offline**, e o toque duplo humano cabe dentro dela com folga. A
   * 32b constrói exatamente esse botão.
   *
   * E o preço de errar é 500, não um erro tratado: `handle-domain-error.ts`
   * **não mapeia `P2002`** (o `grep` volta vazio), então ele cai no
   * `setErrorHandler` genérico. O `prisma-note-repository.ts` diz isto por
   * extenso no docblock do `save` dele desde a Tarefa 11.
   *
   * Com o alvo no índice composto, os dois `execute` que leram `null` no
   * `byPlanItemAndUser` convergem: o segundo vira UPDATE da linha do primeiro,
   * o `id` gerado pelo segundo é **descartado**, e como o `save` devolve a
   * linha do banco, o UseCase responde o id certo. O `readAt` que fica é o do
   * segundo — e isso é inofensivo aqui, ao contrário do `createdAt` da nota:
   * os dois instantes distam a latência de uma requisição, e não há ordenação
   * de tela pendurada nele.
   *
   * ⚠️ **A regra 5 da fatia continua provada, e melhor:** ela é sobre o
   * ÍNDICE DO BANCO morder, não sobre o `save` estourar. A prova mudou para um
   * `prisma.readingLog.create` **cru** no teste de contrato — que é o
   * instrumento certo, porque não depende da chamada que o repositório
   * escolheu. A regra 6 ("re-salvar o mesmo id atualiza") também continua
   * verde: mesmo id e mesmo par caem no mesmo UPDATE.
   */
  async save(log: ReadingLog): Promise<ReadingLog> {
    const data = {
      clubId: log.clubId,
      bookId: log.bookId,
      userId: log.userId,
      planItemId: log.planItemId,
      readAt: log.readAt,
    };

    const record = await this.prisma.readingLog.upsert({
      where: {
        planItemId_userId: {
          planItemId: log.planItemId,
          userId: log.userId,
        },
      },
      // Só o CREATE leva o `id`: ele é da linha que já existe, não da chamada
      // que chega. Escrevê-lo no UPDATE trocaria a chave primária de um log
      // existente na corrida — o mesmo raciocínio do `toUpsertUpdateData` da
      // nota, com um campo só porque a entidade não tem `createdAt`.
      create: { id: log.id, ...data },
      update: data,
    });
    return toDomain(record);
  }

  /**
   * O par `(planItemId, userId)` **é a identidade** do registro — é o
   * `@@unique` da tabela, e é por ele existir que nenhum dos dois UseCases
   * recebe id de log no input: o log de outra pessoa é inalcançável.
   */
  async byPlanItemAndUser(
    planItemId: string,
    userId: string,
  ): Promise<ReadingLog | null> {
    const record = await this.prisma.readingLog.findUnique({
      where: { planItemId_userId: { planItemId, userId } },
    });
    return record ? toDomain(record) : null;
  }

  /**
   * "Quem leu o quê neste livro". Cada filtro em AND com o `bookId`, que nunca
   * é opcional.
   *
   * **Sem `orderBy`**, porque o port não promete ordem (§7.2) e porque não há
   * `take` que precise de uma para ser determinístico — é a mesma escolha do
   * `planItemWritersByBook`. Quem ordena é o `groupUsersByPlanItem`, pela ordem
   * do plano.
   *
   * `undefined` no `where` do Prisma **some da consulta**; `null` viraria
   * `IS NULL`, e as três colunas são NOT NULL — por isso os opcionais do
   * filtro atravessam como estão, sem um `??` que os transformasse em nulo.
   */
  async find(filter: ReadingLogFilter): Promise<ReadingLog[]> {
    const records = await this.prisma.readingLog.findMany({
      where: {
        bookId: filter.bookId,
        userId: filter.userId,
        planItemId: filter.planItemId,
      },
    });
    return records.map(toDomain);
  }

  /**
   * Hard delete, e **idempotente**: id inexistente não é erro.
   *
   * ⚠️ **`deleteMany` e não `delete`, e agora isso está MEDIDO** — o docblock
   * do port é o dono da decisão, e o teste de contrato
   * `states the precondition: prisma.delete on a missing id raises P2025` é o
   * que a transformou de prescrição em fato. Sem `deleteMany`, o retry da fila
   * offline chegando depois do toque viraria 500.
   */
  async delete(id: string): Promise<void> {
    await this.prisma.readingLog.deleteMany({ where: { id } });
  }
}
