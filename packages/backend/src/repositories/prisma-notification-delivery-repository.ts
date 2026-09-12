import type { PrismaClient } from '@prisma/client';

import type { NotificationDelivery } from '../domain/notification-delivery';
import { assertNotificationKind } from '../domain/notification-delivery';
import type { NotificationDeliveryRepository } from '../usecases/ports/notification-delivery-repository';

/**
 * ⚠️ **A ÚNICA EXCEÇÃO DE SQL EXPLÍCITO DA FEATURE, E ELA VIVE AQUI DENTRO**
 * (`docs/NOTIFICACOES.md` §6, regra 11 da Tarefa 37).
 *
 * O `CLAUDE.md` proíbe `$queryRaw` espalhado por feature; esta é a exceção
 * declarada, e a exceção tem endereço: o **repositório**, nunca a rota e nunca
 * o scheduler. A razão de o SQL ser inevitável é que a operação é **um ato
 * só** — "insira se ninguém inseriu, e me diga se foi você" —, e é justamente
 * essa atomicidade que o dispatcher compra: duas instâncias rodando ao mesmo
 * tempo, ou duas passadas do cron que caíram na mesma janela, e **exatamente
 * uma** manda o lembrete.
 *
 * ⚠️ **Por que não `createMany({ skipDuplicates: true })`**, que também
 * existiria sem SQL cru: ele devolve `{ count }`, que responde a mesma
 * pergunta — mas o `NOTIFICACOES.md` §6 declara o `INSERT … ON CONFLICT DO
 * NOTHING … RETURNING "id"` por extenso, e uma implementação que "dá no mesmo"
 * mas não é a declarada obriga o próximo leitor a conferir se dá mesmo. O SQL
 * declarado está aqui, do jeito que a spec o escreve.
 *
 * ⚠️ **E por que NÃO um `try/catch` de `P2002`**, que é a forma que parece
 * equivalente: com o `catch`, a colisão passa a ser uma **exceção** dentro da
 * transação do Postgres — a segunda instância recebe um erro, não um `false`, e
 * distinguir "já foi enviado hoje" (normal, silencioso) de "o banco caiu" (log
 * de erro) viraria inspeção de código de erro no meio do laço. `DO NOTHING`
 * torna a colisão um **resultado**, que é o que ela é.
 */
export class PrismaNotificationDeliveryRepository implements NotificationDeliveryRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Reserva o aviso do dia, ou devolve `false` se alguém já o reservou.
   *
   * O `RETURNING "id"` é o que transforma "houve conflito?" em "quantas linhas
   * voltaram?": com `DO NOTHING`, uma colisão devolve **nenhuma** linha e
   * nenhum erro.
   *
   * ⚠️ **O `assertNotificationKind` roda ANTES do INSERT**, e não é cerimônia:
   * a coluna é `String` (decisão G), então o banco aceitaria qualquer texto — e
   * um `kind` torto gravado seria uma reserva que **nunca colide com nada**,
   * ou seja, um lembrete que sai todo dia. O portão na escrita é o que impede
   * isso; o portão na leitura não existe porque **nada lê esta tabela** (ver o
   * port).
   */
  async claim(delivery: NotificationDelivery): Promise<boolean> {
    const kind = assertNotificationKind(delivery.kind);

    const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "NotificationDelivery" ("id", "userId", "kind", "localDate", "deliveredAt")
      VALUES (${delivery.id}, ${delivery.userId}, ${kind}, ${delivery.localDate}, ${delivery.deliveredAt})
      ON CONFLICT ("userId", "kind", "localDate") DO NOTHING
      RETURNING "id"
    `;

    return inserted.length > 0;
  }
}
