import type { PrismaClient } from '@prisma/client';

import { buildDispatchPass } from './dispatch-pass';
import { windowMinutesFromEnv } from './dispatch-script';
import { startReminderCron } from './reminder-cron';
import { getVapidConfig } from './vapid';

/**
 * ⚠️⚠️ **A FIAÇÃO DO CRON — E ELA EXISTE PORQUE FIAÇÃO SEM GUARDA FOI O ACHADO
 * ALTO DA AUDITORIA DA TAREFA 38f.**
 *
 * Na primeira entrega isto morava dentro do `http/main.ts`, pelo mesmo padrão do
 * `dispatch-main.ts`: "composition root não se testa". A auditoria mediu o preço
 * e ele não é o mesmo de antes — **três mutações plantadas na fiação deixavam a
 * suíte inteira verde**:
 *
 * | mutante na fiação | o que o dono veria |
 * | --- | --- |
 * | `cron.schedule(...)` → `cron.createTask(...)` | uma tarefa **criada e nunca iniciada**: nenhum lembrete, nunca |
 * | `env: process.env` → `env: {}` | `NOTIFICATIONS_CRON=on` no `.env` e **nada acontece** |
 * | `vapidConfigured: vapid !== null` → `true` | a **única linha que ele lê no boot** passa a mentir |
 *
 * E os três dão o mesmo sintoma: *"o lembrete não chegou"* — indistinguível de
 * "hoje não havia ninguém a lembrar", com todos os documentos dizendo que o
 * buraco nº 1 do MVP 3 fechou. A diferença para a Tarefa 37 é que lá havia **um**
 * composition root sem guarda; aqui seriam **dois**, e o segundo é justamente
 * aquele de que o lembrete passou a depender para existir.
 *
 * ## O que ficou testável, e como (sem ler o texto de arquivo nenhum)
 *
 * - O **adaptador** recebe um `CronLike` — e `createTask` está declarado nele de
 *   propósito: é o vizinho errado, e é o que torna o mutante **representável**
 *   para o teste poder matá-lo por contagem de chamadas (§7.3). Uma porta que
 *   só declarasse `schedule` empurraria a propriedade para o compilador, e
 *   "não compila" não é acusador: ninguém mede o que nunca roda.
 * - O **ambiente** é lido aqui dentro (`process.env`), não recebido: assim o
 *   teste prova a cadeia inteira mexendo no ambiente do processo, e não sobra
 *   um `env:` no `main.ts` para alguém trocar por `{}`.
 * - O **VAPID** também: `getVapidConfig()` lê `process.env` a cada chamada (é
 *   decisão registrada no `vapid.ts`), então o teste liga e desliga a feature
 *   com chaves efêmeras e confere a linha de boot.
 *
 * O que sobra no `http/main.ts` é a chamada, e nada mais.
 */
export interface CronLike {
  /**
   * ⚠️ **O que agenda de verdade.** No `node-cron` 4, `schedule` é
   * `createTask` **seguido de `start()`** — e é o `start()` que faz a diferença
   * entre um lembrete que sai e um objeto parado na memória.
   */
  schedule: (expression: string, callback: () => void) => unknown;
  /**
   * ⚠️ **O VIZINHO ERRADO, declarado para que o teste possa recusá-lo.** Ele
   * cria a tarefa **sem iniciar** — é o que o teste do `reminder-cron` usa para
   * medir a expressão sem agendar nada, e é exatamente por isso que trocar um
   * pelo outro aqui é um erro tão fácil de cometer quanto invisível.
   */
  createTask: (expression: string, callback: () => void) => unknown;
}

export interface InstallReminderCronOptions {
  /** O `node-cron` de verdade no `main.ts`; um duplo instrumentado no teste. */
  cron: CronLike;
  /**
   * O cliente do processo — o **mesmo** que atende as telas.
   *
   * ⚠️ **Instalar não toca nele**: o `buildDispatchPass` só monta um fecho, e
   * quem abre o banco é a passada. O teste prova isso passando um `Proxy` que
   * **lança** em qualquer acesso.
   */
  prisma: PrismaClient;
  log: (line: string) => void;
}

/**
 * Instala (ou não) o agendamento do lembrete. Devolve **se agendou**.
 *
 * ⚠️ **AO VIVO:** com `NOTIFICATIONS_CRON=on` e VAPID configurado, a partir daqui
 * o processo manda push de verdade de cinco em cinco minutos e gasta o claim do
 * dia de cada pessoa. Quem liga é o dono.
 */
export function installReminderCron(
  options: InstallReminderCronOptions,
): boolean {
  // Lido UMA vez, como no script: o mesmo `vapid` decide a linha de boot e
  // assina o envio da passada.
  const vapid = getVapidConfig();

  return startReminderCron({
    env: process.env,
    vapidConfigured: vapid !== null,
    // Dois argumentos, sem `timezone` (decisão C) — e `schedule`, não
    // `createTask`: é o `start()` que o `schedule` faz por dentro que separa
    // "agendado" de "objeto parado na memória".
    schedule: (expression, callback) => {
      options.cron.schedule(expression, callback);
    },
    runPass: buildDispatchPass({
      prisma: options.prisma,
      vapid,
      windowMinutes: windowMinutesFromEnv(process.env),
      closeAfterPass: async () => {
        // ⚠️ NÃO desconecta: é o mesmo cliente que atende as telas. Quem
        // desconecta é o script de cron externo, que morre logo depois.
      },
      log: options.log,
    }),
    log: options.log,
  });
}
