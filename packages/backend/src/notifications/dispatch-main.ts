import { PrismaClient } from '@prisma/client';

import { buildRepositories } from '../http/repositories';
import type { OpenedDeps } from './dispatch-script';
import { runDispatch, windowMinutesFromEnv } from './dispatch-script';
import { getVapidConfig } from './vapid';
import { WebPushSender } from './web-push-sender';

/**
 * ⚠️ **A ENTRADA DO SCRIPT DE CRON — `pnpm --filter @clube/backend
 * notifications:dispatch`** (regra 16 da Tarefa 37).
 *
 * `NOTIFICACOES.md` §6 e ADR 0006: **não existe cron dentro do processo do
 * Fastify**. Um cron externo chama isto a cada 5–10 minutos; a janela é maior
 * que o intervalo (decisão D) para absorver atraso, e o claim no banco é quem
 * garante que absorver não vira duplicar.
 *
 * Este arquivo é **só fiação**: abrir o Prisma, ler o ambiente, chamar o
 * `runDispatch` (onde mora a decisão, e que é testado) e escolher o código de
 * saída. É o mesmo recorte que o `http/main.ts` faz do `buildServer`.
 *
 * ⚠️⚠️ **A TRANSIÇÃO ACONTECEU NA TAREFA 38: ATÉ ELA, `sender: null`; A PARTIR
 * DELA, ESTE SCRIPT GRAVA CLAIM NO BANCO E MANDA PUSH DE VERDADE.**
 *
 * Da Tarefa 37 até a 38 este script era **inofensivo por construção**: o
 * `PushSender` real não existia, o `sender` era `null`, e o `runDispatch`
 * **recusava a passada** (`reason: 'push-sender-not-provided'` — que na 37 se
 * chamava `push-sender-not-implemented`, renomeado quando o sender passou a
 * existir) em vez de
 * rodá-la com um sender de mentira — o claim é gasto ANTES do envio (decisão E
 * da 37), então uma passada falsa queimaria a reserva do dia de todo mundo e
 * ninguém receberia nada, nem hoje nem amanhã.
 *
 * A **Tarefa 38** trocou a linha: o `sender` passou a ser um `WebPushSender`
 * quando há VAPID configurado. **Uma chamada a `notifications:dispatch` deixou
 * de ser um no-op** — ela reserva o dia de cada pessoa na tabela
 * `NotificationDelivery` (e o claim daquele dia **não volta**, por decisão E) e
 * entrega a mensagem ao serviço de push. Com `getVapidConfig()` devolvendo
 * `null` ela continua inofensiva, e nem abre conexão de banco.
 *
 * Quem roda isto é o **dono**, pelo roteiro do `docs/COMO-TESTAR.md`. Nenhum
 * agente deste projeto executa este script.
 *
 * ⚠️ **Sai com 0 em dia normal**, inclusive sem ninguém a lembrar e inclusive
 * com a feature desligada (regra 16): *"um script de cron que sai diferente de
 * 0 em dia normal enche a caixa do dono de alerta falso, e o alerta que sempre
 * toca é o alerta que ninguém lê"*. Sai com **1** só quando algo quebrou de
 * verdade — e aí o alerta é o que o dono quer.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  // Lido UMA vez: o mesmo `vapid` decide se a passada acontece e assina o
  // envio. Duas leituras abririam a janela para um script que começa ligado e
  // termina desligado.
  const vapid = getVapidConfig();

  try {
    await runDispatch({
      vapid,
      // ⚠️ **A LINHA DA TRANSIÇÃO (Tarefa 38).** Era `sender: null`; agora é o
      // envio de verdade. Sem VAPID continua `null`, e o `runDispatch` não
      // gasta claim de ninguém.
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
          // dispatcher fala o dele. A tradução é esta linha, e é aqui que ela
          // deve estar — não dentro do UseCase.
          repositories: {
            settings: repositories.settings,
            memberships: repositories.memberships,
            books: repositories.books,
            planItems: repositories.planItems,
            readingLogs: repositories.readingLogs,
            pushSubscriptions: repositories.pushSubscriptions,
            deliveries: repositories.notificationDeliveries,
          },
          close: () => prisma.$disconnect(),
        };
      },
      windowMinutes: windowMinutesFromEnv(process.env),
      log: (line) => {
        console.log(line);
      },
    });
  } finally {
    // O `open` preguiçoso pode nem ter sido chamado (feature desligada), e aí
    // ninguém fechou o cliente. `$disconnect` é idempotente.
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
