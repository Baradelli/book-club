import type {
  PrismaClient,
  PushSubscription as PrismaPushSubscription,
} from '@prisma/client';

import type {
  PushSubscription,
  PushSubscriptionPatch,
} from '../domain/push-subscription';
import { assertNotificationPlatform } from '../domain/push-subscription';
import type { PushSubscriptionRepository } from '../usecases/ports/push-subscription-repository';

/**
 * Nove colunas escalares: não há `doc` para atravessar (ADR 0001), não há
 * `Json?` para o `Prisma.DbNull` (o grifo), não há `CalendarDay` para converter
 * (o item de plano) e não há `status`/`archivedAt` para mapear — a desativação
 * é o `disabledAt`. A única tradução é a da `platform`.
 */
function toDomain(record: PrismaPushSubscription): PushSubscription {
  return {
    id: record.id,
    userId: record.userId,
    // A coluna é `String` (o `CLAUDE.md` lista `PushSubscription.platform`
    // entre os campos validados por `z.enum`, porque a lista ainda evolui) e o
    // domínio quer `NotificationPlatform`. O assert é o único jeito de
    // estreitar sem cast (que o `CLAUDE.md` proíbe), e é o comportamento certo:
    // uma plataforma fora da lista no banco é erro de verdade, e tem de
    // aparecer na LEITURA — não na tela, desenhando um estado que não existe.
    // É o mesmo desenho do `assertActivityType` no repositório do evento.
    platform: assertNotificationPlatform(record.platform),
    endpoint: record.endpoint,
    p256dh: record.p256dh,
    auth: record.auth,
    userAgent: record.userAgent,
    disabledAt: record.disabledAt,
    createdAt: record.createdAt,
  };
}

/**
 * ⚠️ **O PATCH, campo a campo — e a allowlist NÃO é necessária aqui, ela é
 * consequência.**
 *
 * O `PushSubscriptionPatch` é `Partial<Pick<…, 'disabledAt'>>` (§7.1.1), então
 * não há campo proibido a filtrar: o tipo já é a lista de permitidos. Copiar
 * campo a campo em vez de espalhar o patch é o que faz o fake poder fazer
 * **exatamente isto** — uma semântica emulada a menos, não a mais.
 *
 * ⚠️ **`undefined` no `data` do Prisma SOME da consulta**, e é por isso que o
 * patch vazio é um `UPDATE` que não muda nada em vez de um que zera o
 * `disabledAt`. Um `patch.disabledAt ?? null` aqui apagaria a desativação a
 * cada patch vazio — e o teste `leaves everything alone when the patch is
 * empty` é o acusador.
 */
function toUpdateData(patch: PushSubscriptionPatch): {
  disabledAt?: Date | null;
} {
  return { disabledAt: patch.disabledAt };
}

/**
 * "Este aparelho recebe push" no Postgres.
 *
 * ⚠️ **NÃO há `find(filter)` nem `FIND_ROW_LIMIT` aqui**, ao contrário do
 * repositório da nota e do grifo: o único recorte é o dono, o conjunto é "os
 * aparelhos de uma pessoa" (um punhado de linhas de nove colunas escalares) e
 * um `take` faria o envio da Tarefa 38 **perder aparelho em silêncio** — a
 * válvula viraria a falha, que é o argumento do `find` do `ReadingLog` e do
 * `planItemIdsWithAnyNote`. O motivo inteiro mora no docblock do port. Uma
 * verdade, um lugar.
 */
export class PrismaPushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * ⚠️ **Upsert com o alvo em `endpoint`, e NÃO no `id`** — a divergência com
   * todos os outros repositórios do projeto, e ela é a decisão E da Tarefa 36.
   *
   * O `endpoint` **é** a identidade da inscrição no protocolo Web Push, e a
   * tabela tem `@@unique([endpoint])`. Com o alvo no `id`, um segundo `POST` do
   * mesmo aparelho — o retry da fila offline, ou a pessoa reativando depois de
   * desligar — chega com um id **novo** (o UseCase não sabe que a linha existe),
   * bate no índice único do endpoint e vira `P2002`. E o
   * `handle-domain-error.ts` **não mapeia `P2002`** (o `grep` volta vazio), então
   * ele cai no `setErrorHandler` genérico: **500 na ativação de alguém**. É o
   * mesmo raciocínio, com a mesma medição, do `save` da nota e do log de
   * leitura.
   *
   * ⚠️ **O `disabledAt` vai no UPDATE, e é isso que REATIVA** (a regra 10, e o
   * `NOTIFICACOES.md` §4: *"upsert por `endpoint`, reativando (`disabledAt =
   * null`) se voltou"*). Sem ele no UPDATE, a inscrição voltaria a existir
   * **desligada**, e o envio da Tarefa 38 — que lê só as ativas — nunca mandaria
   * nada, sem erro nenhum.
   *
   * ⚠️ **Só o CREATE leva o `id`:** ele é da linha que já existe, não da chamada
   * que chega. Escrevê-lo no UPDATE trocaria a chave primária de uma inscrição
   * existente — o mesmo `toUpsertUpdateData` da nota e do log.
   *
   * O `userId` e o `createdAt` **vão** no UPDATE, e é deliberado: ver o docblock
   * do `save` no port (o endpoint é a identidade do APARELHO, e quem está com o
   * navegador na mão é quem receberá o push de fato).
   */
  async save(subscription: PushSubscription): Promise<PushSubscription> {
    const data = {
      userId: subscription.userId,
      platform: subscription.platform,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      userAgent: subscription.userAgent,
      disabledAt: subscription.disabledAt,
      createdAt: subscription.createdAt,
    };

    const record = await this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: { id: subscription.id, ...data },
      update: data,
    });
    return toDomain(record);
  }

  /**
   * O par `(endpoint, userId)` — e é ele que faz o corte de dono ser
   * ESTRUTURAL: a inscrição do Marcos não aparece para a Maria, então não há
   * linha alheia ao alcance do `update` que vem depois (a decisão E da Tarefa
   * 30 outra vez).
   *
   * ⚠️ **`findFirst` e não `findUnique`**, porque a chave única é o `endpoint`
   * sozinho: o par não é índice, é **filtro** — e é justamente o filtro que
   * corta. Um `findUnique({ endpoint })` seguido de um `if (row.userId ===
   * actor)` daria o mesmo resultado e seria a forma que o port recusa: "leu e
   * depois recusou" traz a linha de outra pessoa para a memória do processo
   * antes de descartá-la (§7.3).
   *
   * **Sem filtro por `disabledAt`**, de propósito: a inscrição desligada tem de
   * ser encontrada — "desligada" não é "inexistente".
   */
  async byEndpointAndUser(
    endpoint: string,
    userId: string,
  ): Promise<PushSubscription | null> {
    const record = await this.prisma.pushSubscription.findFirst({
      where: { endpoint, userId },
    });
    return record ? toDomain(record) : null;
  }

  /**
   * "Os aparelhos ATIVOS desta pessoa" — `disabledAt: null`, e o filtro é
   * **daqui**, não do chamador (`NOTIFICACOES.md` §5).
   *
   * **Sem `orderBy`**, porque o port não promete ordem (§7.2) e porque não há
   * `take` que precise de uma para ser determinístico — é a mesma escolha do
   * `find` do `ReadingLog`. O fake enumera INVERTIDO, para ninguém depender da
   * ordem sem perceber.
   */
  async byUserId(userId: string): Promise<PushSubscription[]> {
    const records = await this.prisma.pushSubscription.findMany({
      where: { userId, disabledAt: null },
    });
    return records.map(toDomain);
  }

  /**
   * A desativação **soft**: grava o `disabledAt` e a linha FICA.
   *
   * `update` e não `updateMany`, ao contrário do `delete` do `ReadingLog` que é
   * `deleteMany` de propósito: lá havia uma corrida real a absorver (entre a
   * leitura e o hard delete cabem o segundo toque e o retry da fila), e aqui
   * não há — **nada no produto faz hard delete de inscrição**, então a linha que
   * o UseCase acabou de ler não desaparece. O teste de contrato
   * `states the precondition: update on a missing id raises P2025` é o que
   * transforma essa escolha em fato medido, em vez de prescrição (§7.1).
   */
  async update(
    id: string,
    patch: PushSubscriptionPatch,
  ): Promise<PushSubscription> {
    const record = await this.prisma.pushSubscription.update({
      where: { id },
      data: toUpdateData(patch),
    });
    return toDomain(record);
  }
}
