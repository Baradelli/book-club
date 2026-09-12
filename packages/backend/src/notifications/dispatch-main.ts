import { PrismaClient } from '@prisma/client';

import { buildRepositories } from '../http/repositories';
import type { OpenedDeps } from './dispatch-script';
import { runDispatch, windowMinutesFromEnv } from './dispatch-script';
import { getVapidConfig } from './vapid';

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
 * ⚠️ **O `sender` é `null` nesta fatia**, e é escolha de segurança: o
 * `PushSender` real (`web-push`, `vapidDetails`, o `WebPushError` 404/410) é a
 * **Tarefa 38**, e o pacote não é dependência de pacote nenhum deste monorepo.
 * O `runDispatch` **recusa a passada** nesse estado em vez de rodá-la com um
 * sender de mentira — o claim é gasto ANTES do envio (decisão E), então uma
 * passada falsa queimaria a reserva do dia de todo mundo e ninguém receberia
 * nada, nem hoje nem amanhã. A 38 troca **uma** linha aqui.
 *
 * ⚠️ **Sai com 0 em dia normal**, inclusive sem ninguém a lembrar e inclusive
 * com a feature desligada (regra 16): *"um script de cron que sai diferente de
 * 0 em dia normal enche a caixa do dono de alerta falso, e o alerta que sempre
 * toca é o alerta que ninguém lê"*. Sai com **1** só quando algo quebrou de
 * verdade — e aí o alerta é o que o dono quer.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await runDispatch({
      vapid: getVapidConfig(),
      // ⚠️ Tarefa 38: aqui entra o `WebPushSender`. Até lá, `null` significa
      // "não há como entregar", e o `runDispatch` não gasta claim de ninguém.
      sender: null,
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
