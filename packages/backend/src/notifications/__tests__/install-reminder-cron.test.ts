import type { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { generateEphemeralVapidKeys } from '../../test-support/ephemeral-vapid-keys';
import type { CronLike } from '../install-reminder-cron';
import { installReminderCron } from '../install-reminder-cron';
import { REMINDER_CRON_EXPRESSION } from '../reminder-cron';

/**
 * ⚠️⚠️ **A GUARDA DA FIAÇÃO — o achado ALTO da auditoria da Tarefa 38f.**
 *
 * Três mutações plantadas na fiação que morava no `http/main.ts` deixavam os
 * **1938** testes do backend verdes, o `tsc` em 0 e o `eslint` limpo:
 *
 * 1. `cron.schedule(...)` → `cron.createTask(...)` — tarefa criada e **nunca
 *    iniciada**;
 * 2. `env: process.env` → `env: {}` — a chave no `.env` deixa de ser lida;
 * 3. `vapidConfigured: vapid !== null` → `true` — a linha de boot mente.
 *
 * As três dão o mesmo sintoma para o dono (*"o lembrete não chegou"*) com todos
 * os documentos afirmando que o buraco nº 1 do MVP 3 fechou. Este arquivo é o
 * acusador das três, e **nenhuma asserção dele lê o texto de um arquivo-fonte**
 * (regra 2): o que se observa é qual método do agendador foi chamado, o que a
 * instalação faz quando o ambiente muda, e o que a passada agendada escreve.
 *
 * ⚠️ **Nada aqui manda push nem abre banco.** O `PrismaClient` é um `Proxy` que
 * **lança** em qualquer acesso — instalar o cron não pode tocá-lo —, e o único
 * tique disparado acontece com a feature **desligada** (sem VAPID), caminho em
 * que o dispatcher recusa a passada antes de abrir conexão.
 */

/** As chaves que estes testes mexem no ambiente do processo. */
const TOUCHED_ENV = [
  'NOTIFICATIONS_CRON',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'NOTIFICATION_WINDOW_MINUTES',
] as const;

const savedEnv = new Map<string, string | undefined>();

beforeEach(() => {
  savedEnv.clear();
  for (const key of TOUCHED_ENV) {
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/**
 * ⚠️ **Um cliente que NÃO PODE ser tocado** — o padrão do
 * `server-guards.integration.test.ts`. Instalar o cron monta um fecho e mais
 * nada; se alguém puser uma consulta no caminho da instalação, o teste morre
 * dizendo qual propriedade foi acessada.
 */
function neverTouchedPrisma(): PrismaClient {
  return new Proxy(
    {},
    {
      get(_target, property) {
        throw new Error(
          `install-reminder-cron: a instalação tocou o prisma (.${String(property)}) — ela deve apenas montar o fecho da passada`,
        );
      },
    },
  ) as PrismaClient;
}

interface CronDouble extends CronLike {
  /** ⚠️ CONTADOR (§7.3): as expressões que chegaram ao `schedule` — o que AGENDA. */
  scheduled: string[];
  /** E as que chegaram ao `createTask` — o que NÃO agenda. Tem de ficar vazio. */
  created: string[];
  /** Dispara o callback instalado, sem relógio. */
  tick: () => void;
}

function cronDouble(): CronDouble {
  const scheduled: string[] = [];
  const created: string[] = [];
  const callbacks: (() => void)[] = [];

  return {
    scheduled,
    created,
    schedule: (expression, callback) => {
      scheduled.push(expression);
      callbacks.push(callback);
      return undefined;
    },
    createTask: (expression, callback) => {
      created.push(expression);
      callbacks.push(callback);
      return undefined;
    },
    tick: () => {
      const callback = callbacks[0];
      if (callback === undefined) {
        throw new Error('nada foi instalado — não há tique para disparar');
      }
      callback();
    },
  };
}

function settle(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

describe('installReminderCron — a fiação, medida por comportamento', () => {
  /**
   * ⚠️ **MUTANTE 2 DA AUDITORIA:** `schedule` → `createTask`. No `node-cron` 4 o
   * `schedule` é `createTask` **mais `start()`**, e sem o `start()` a tarefa
   * existe, responde a tudo o que se perguntar a ela, e **nunca dispara**.
   */
  it('installs the task through schedule, and never through createTask', () => {
    process.env['NOTIFICATIONS_CRON'] = 'on';
    const cron = cronDouble();

    const installed = installReminderCron({
      cron,
      prisma: neverTouchedPrisma(),
      log: () => undefined,
    });

    expect(cron.scheduled).toEqual([REMINDER_CRON_EXPRESSION]);
    expect(cron.created).toEqual([]);
    expect(installed).toBe(true);
  });

  /**
   * ⚠️ **MUTANTE 1 DA AUDITORIA:** o ambiente que chega ao portão é o do
   * **processo**. Com um `{}` no lugar, o dono põe a chave no `.env`, reinicia,
   * e nada acontece — para sempre, sem erro.
   *
   * Os dois sentidos, no mesmo teste, porque é o par que decide: a variável do
   * processo liga, e a ausência dela desliga.
   */
  it('reads NOTIFICATIONS_CRON from the process environment, in both directions', () => {
    process.env['NOTIFICATIONS_CRON'] = 'on';
    const withKey = cronDouble();
    installReminderCron({
      cron: withKey,
      prisma: neverTouchedPrisma(),
      log: () => undefined,
    });

    delete process.env['NOTIFICATIONS_CRON'];
    const withoutKey = cronDouble();
    installReminderCron({
      cron: withoutKey,
      prisma: neverTouchedPrisma(),
      log: () => undefined,
    });

    expect(withKey.scheduled).toEqual([REMINDER_CRON_EXPRESSION]);
    expect(withoutKey.scheduled).toEqual([]);
    expect(withoutKey.created).toEqual([]);
  });

  /**
   * ⚠️ **MUTANTE 3 DA AUDITORIA:** a linha de boot é **a única coisa que o dono
   * lê** para saber o que ficou valendo. Um `vapidConfigured: true` fixo a faz
   * dizer "VAPID configured" com o `.env` vazio — e aí o lembrete que não chega
   * não tem explicação em lugar nenhum.
   *
   * As chaves são **efêmeras**, geradas na hora e descartadas: nenhuma chave
   * real entra em teste (regra da Tarefa 36).
   */
  it('reports the VAPID state of the environment on the boot line, both ways', () => {
    process.env['NOTIFICATIONS_CRON'] = 'on';

    const keys = generateEphemeralVapidKeys();
    process.env['VAPID_PUBLIC_KEY'] = keys.publicKey;
    process.env['VAPID_PRIVATE_KEY'] = keys.privateKey;
    const configured: string[] = [];
    installReminderCron({
      cron: cronDouble(),
      prisma: neverTouchedPrisma(),
      log: (line) => configured.push(line),
    });

    delete process.env['VAPID_PUBLIC_KEY'];
    delete process.env['VAPID_PRIVATE_KEY'];
    const notConfigured: string[] = [];
    installReminderCron({
      cron: cronDouble(),
      prisma: neverTouchedPrisma(),
      log: (line) => notConfigured.push(line),
    });

    expect(configured).toHaveLength(1);
    expect(configured[0]).not.toContain('vapid-not-configured');
    expect(notConfigured).toHaveLength(1);
    expect(notConfigured[0]).toContain('vapid-not-configured');
  });

  /**
   * ⚠️ **O CALLBACK INSTALADO É A PASSADA DE VERDADE, não um fecho vazio** — e
   * esta é a única asserção do projeto que atravessa `installReminderCron` →
   * `buildDispatchPass` → `runDispatch`.
   *
   * A prova é o **relatório do próprio dispatcher**: uma linha de JSON com
   * `"reason":"vapid-not-configured"`, que só existe se a passada real rodou.
   *
   * ⚠️ **E é seguro justamente por isso:** sem VAPID o `runDispatch` recusa a
   * passada **antes de abrir o banco** (por isso o `Proxy` que lança não é
   * tocado) e antes de qualquer envio. Nenhum claim é gasto, nenhum push sai.
   */
  it('schedules the REAL dispatch pass: a tick writes the dispatcher own report', async () => {
    process.env['NOTIFICATIONS_CRON'] = 'on';
    const cron = cronDouble();
    const logs: string[] = [];

    installReminderCron({
      cron,
      prisma: neverTouchedPrisma(),
      log: (line) => logs.push(line),
    });

    cron.tick();
    await settle();

    expect(
      logs.some((line) => line.includes('"reason":"vapid-not-configured"')),
    ).toBe(true);
  });

  /**
   * ⚠️⚠️ **A PASSADA É ARMADA COM O VAPID QUE FOI LIDO — e este teste existe
   * porque o mutante que trocava esse `vapid` por `null` sobrevivia a 1942
   * testes.**
   *
   * É o irmão silencioso do achado ALTO: a linha de boot diria *"VAPID
   * configured"*, o cron agendaria de cinco em cinco minutos, e **toda** passada
   * pararia em `vapid-not-configured` — com o dono lendo, no boot, que estava
   * tudo certo. O sintoma, de novo, é um lembrete que não chega.
   *
   * **O instrumento é o `Proxy` que lança.** Com as chaves no ambiente, a
   * passada vai **além** do portão do VAPID e começa a montar o `WebPushSender`,
   * que pede os repositórios ao Prisma — e aí o `Proxy` lança, a decisão D pega
   * a falha e a escreve no log. Ou seja: *"passou do portão"* é observável sem
   * banco, sem rede e sem gastar claim nenhum.
   *
   * As duas asserções são um par: a negativa diz que a passada **não** recusou
   * por falta de configuração, e a positiva diz que ela **rodou de verdade** —
   * sem esta, a negativa passaria também num mundo em que o tique não faz nada
   * (§7.4).
   */
  it('arms the pass with the VAPID it read: a tick does not refuse for lack of keys', async () => {
    process.env['NOTIFICATIONS_CRON'] = 'on';
    const keys = generateEphemeralVapidKeys();
    process.env['VAPID_PUBLIC_KEY'] = keys.publicKey;
    process.env['VAPID_PRIVATE_KEY'] = keys.privateKey;

    const cron = cronDouble();
    const logs: string[] = [];
    installReminderCron({
      cron,
      prisma: neverTouchedPrisma(),
      log: (line) => logs.push(line),
    });

    cron.tick();
    await settle();

    expect(
      logs.some((line) => line.includes('"reason":"vapid-not-configured"')),
    ).toBe(false);
    // ...e ela rodou mesmo: foi longe o bastante para pedir os repositórios, que
    // é o passo seguinte ao portão do VAPID.
    expect(
      logs.some(
        (line) =>
          line.includes('reminder cron pass failed') &&
          line.includes('tocou o prisma'),
      ),
    ).toBe(true);
  });
});
