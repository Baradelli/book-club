import type {
  ActivityEvent as PrismaActivityEvent,
  PrismaClient,
} from '@prisma/client';

import type { ActivityEvent } from '../domain/activity-event';
import { assertActivityType } from '../domain/activity-event';
import type {
  ActivityEventFilter,
  ActivityEventRepository,
} from '../usecases/ports/activity-event-repository';
import { activityFeedTake } from '../usecases/ports/activity-event-repository';

/**
 * Oito colunas escalares: não há `doc` para atravessar (ADR 0001), não há
 * `Json?` para o `Prisma.DbNull` (o grifo), não há `CalendarDay` para converter
 * (o item de plano) e não há `status`/`archivedAt` para mapear — o evento é
 * imutável. A única tradução é a do `type`.
 */
function toDomain(record: PrismaActivityEvent): ActivityEvent {
  return {
    id: record.id,
    clubId: record.clubId,
    userId: record.userId,
    // A coluna é `String` (o `CLAUDE.md` lista `ActivityEvent.type` entre os
    // campos validados por `z.enum`, porque a lista de verbos ainda evolui) e o
    // domínio quer `ActivityType`. O assert é o único jeito de estreitar sem
    // cast (que o `CLAUDE.md` proíbe), e é o comportamento certo: um verbo fora
    // da lista no banco é erro de verdade, e tem de aparecer na LEITURA — não
    // na tela do feed, desenhando uma frase que não existe. É o mesmo desenho
    // do `assertHighlightColor` no repositório do grifo.
    type: assertActivityType(record.type),
    bookId: record.bookId,
    planItemId: record.planItemId,
    subjectId: record.subjectId,
    createdAt: record.createdAt,
  };
}

/**
 * "A Maria escreveu sobre o Cap. 3" no Postgres.
 *
 * ⚠️ **NÃO há `FIND_ROW_LIMIT` aqui**, ao contrário do repositório da nota e do
 * grifo — e a divergência é decisão medida (decisão D da Tarefa 34), não
 * esquecimento. O motivo inteiro mora no docblock do `find` do port
 * (`usecases/ports/activity-event-repository.ts`): o teto deste `find` é
 * **parâmetro explícito**, e o padrão dele é o `ACTIVITY_FEED_DEFAULT_LIMIT` de
 * `@clube/shared`. Uma verdade, um lugar.
 */
export class PrismaActivityEventRepository implements ActivityEventRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Upsert por **`id`**, e não por um par de colunas — ao contrário da nota do
   * dia e do registro de leitura.
   *
   * A razão é que **não há chave natural**: a tabela não tem `@@unique` nenhum,
   * porque escrever a anotação do dia 1 e a do dia 2 são dois acontecimentos, e
   * grifar o mesmo livro numa releitura também. Quem impede a enxurrada do
   * autosave não é o banco — é a decisão A da Tarefa 33, no UseCase, que só
   * dispara no nascimento (`created === true`).
   *
   * Sendo assim, o único `P2002` possível seria colisão de chave primária, e
   * nenhum chamador consegue produzi-la: o `recordActivity` gera o id com
   * `randomUUID()`. O upsert existe pela convenção da Tarefa 03, e o fake pina
   * o mesmo comportamento (`overwrites the row when the same id comes back`) —
   * um `create` cru aqui divergiria dele.
   *
   * Só o CREATE leva o `id`: escrevê-lo no UPDATE trocaria a chave primária da
   * linha existente. É o mesmo `toUpsertUpdateData` da nota, sem allowlist
   * porque não há campo a filtrar.
   */
  async save(event: ActivityEvent): Promise<ActivityEvent> {
    const data = {
      clubId: event.clubId,
      userId: event.userId,
      type: event.type,
      bookId: event.bookId,
      planItemId: event.planItemId,
      subjectId: event.subjectId,
      createdAt: event.createdAt,
    };

    const record = await this.prisma.activityEvent.upsert({
      where: { id: event.id },
      create: { id: event.id, ...data },
      update: data,
    });
    return toDomain(record);
  }

  /**
   * "O que aconteceu neste clube", do mais recente para o mais antigo.
   *
   * ⚠️ **O `orderBy` é CONTRATO aqui, e não conveniência.** O port promete
   * `createdAt desc` com desempate por `id asc` (decisão C), e é o único `find`
   * do projeto que promete ordem: feed é cronologia invertida por definição.
   * O desempate torna o corte determinístico — sem ele, empate de
   * milissegundo (duas pessoas do clube escrevendo ao mesmo tempo) faria duas
   * chamadas iguais trazerem eventos diferentes na fronteira do `take`.
   *
   * ⚠️ **O `take` passa pelo `activityFeedTake`, e NÃO pelo `limit` cru — o
   * `take` do Prisma é COM SINAL.** `take: -1` devolve o mais ANTIGO (a ponta
   * oposta do feed) e `take: 0` devolve nada, sem lançar nem uma vez. O
   * `min(1)` do Zod barra isso na borda, mas o port aceita `number` e a rota
   * não é o único chamador previsto (a Tarefa 38 não passa por Zod). A regra e
   * o padrão têm um dono só: o `activityFeedTake` do port, que o fake também
   * chama.
   *
   * O `where` tem uma chave só: o `clubId` é o corte de tenant, e nada mais
   * filtra (escopo da fatia — ver o `ActivityEventFilter`).
   */
  async find(filter: ActivityEventFilter): Promise<ActivityEvent[]> {
    const records = await this.prisma.activityEvent.findMany({
      where: { clubId: filter.clubId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: activityFeedTake(filter.limit),
    });
    return records.map(toDomain);
  }
}
