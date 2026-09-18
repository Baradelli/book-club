import type { PrismaClient } from '@prisma/client';

import { buildRepositories } from '../http/repositories';
import type { DispatchReport, OpenedDeps } from './dispatch-script';
import { runDispatch } from './dispatch-script';
import type { VapidConfig } from './vapid';
import { WebPushSender } from './web-push-sender';

/**
 * ⚠️ **UMA PASSADA DO DISPATCHER, MONTADA COM PRISMA — e o único dono dessa
 * montagem.**
 *
 * Extraído na **Tarefa 38f**, quando a passada ganhou o **segundo** chamador: o
 * script de cron externo (`dispatch-main.ts`, Tarefa 37) e o agendador dentro do
 * Fastify (`http/main.ts`, a variante registrada do ADR 0006). Até aqui a
 * tradução *"o `buildRepositories` fala o vocabulário da composição HTTP; o
 * dispatcher fala o dele"* morava no `dispatch-main.ts`, e estava certo: um
 * chamador só. Com dois, copiá-la seria a **lição nº 3 do MVP 1** de novo — dois
 * donos da mesma fiação, e o segundo envelhece calado.
 *
 * ⚠️ **Isto é fiação, e fiação não tem regra de negócio**: quem decide se a
 * passada acontece, o que ela faz e o que ela loga é o `runDispatch`
 * (`dispatch-script.ts`), que é testado sem banco e sem processo. O que este
 * arquivo faz é abrir o Prisma pelo vocabulário certo e escolher o sender.
 *
 * ⚠️ **AO VIVO desde a Tarefa 38:** com VAPID configurado, chamar a função que
 * este builder devolve **reserva o dia de cada pessoa** na tabela
 * `NotificationDelivery` (e o claim daquele dia **não volta**, decisão E da
 * Tarefa 37) e **manda push de verdade**. Nenhum agente deste projeto a executa.
 */
export interface DispatchPassOptions {
  prisma: PrismaClient;
  /**
   * ⚠️ **Lido UMA vez pelo chamador**, e passado aqui: o mesmo `vapid` decide se
   * a passada acontece e assina o envio. Duas leituras abririam a janela para
   * uma passada que começa ligada e termina desligada.
   */
  vapid: VapidConfig | null;
  windowMinutes: number;
  /**
   * O que fazer com a conexão quando a passada termina.
   *
   * ⚠️ **É o que muda entre os dois chamadores, e por isso entra por
   * parâmetro:** o script de cron externo é dono do cliente e o **desconecta**
   * (o processo morre logo depois); o servidor **não** pode desconectar o
   * cliente dele a cada cinco minutos, porque é o mesmo cliente que atende as
   * requisições das telas.
   */
  closeAfterPass: () => Promise<void>;
  log: (line: string) => void;
}

export function buildDispatchPass(
  options: DispatchPassOptions,
): () => Promise<DispatchReport> {
  const { prisma, vapid } = options;

  return async () =>
    runDispatch({
      vapid,
      // Sem VAPID continua `null`, e o `runDispatch` não gasta claim de
      // ninguém — nem abre o banco.
      sender:
        vapid === null
          ? null
          : new WebPushSender(
              buildRepositories(prisma).pushSubscriptions,
              vapid,
            ),
      open: async (): Promise<OpenedDeps> => {
        const repositories = buildRepositories(prisma);
        return {
          // O `buildRepositories` fala o vocabulário da composição HTTP; o
          // dispatcher fala o dele. A tradução é esta linha, e agora ela tem
          // um dono só.
          repositories: {
            settings: repositories.settings,
            memberships: repositories.memberships,
            books: repositories.books,
            planItems: repositories.planItems,
            readingLogs: repositories.readingLogs,
            pushSubscriptions: repositories.pushSubscriptions,
            deliveries: repositories.notificationDeliveries,
          },
          close: options.closeAfterPass,
        };
      },
      windowMinutes: options.windowMinutes,
      log: options.log,
    });
}
