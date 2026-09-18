import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import cron from 'node-cron';
import { describe, expect, it } from 'vitest';

import type { StartReminderCronOptions } from '../reminder-cron';
import { REMINDER_CRON_EXPRESSION, startReminderCron } from '../reminder-cron';

/**
 * ⚠️ **TAREFA 38f — O LEMBRETE PASSA A SAIR SOZINHO, ATRÁS DE UMA CHAVE.**
 *
 * O ADR 0006 recusou `node-cron` dentro do Fastify com três argumentos; dois
 * caíram quando o claim no banco foi entregue (Tarefa 37), e o terceiro ("o
 * agendamento morre com o processo") foi aceito conscientemente. Esta fatia é a
 * **variante registrada** do ADR, e o que a mantém sendo variante é a chave de
 * ambiente: num deploy com duas instâncias ela fica desligada e o cron externo
 * assume, sem tocar uma linha de código.
 *
 * ## ⚠️⚠️ O QUE ESTE ARQUIVO NÃO FAZ: LER O TEXTO DO FONTE
 *
 * A regra 2 da tarefa é sobre a classe que este projeto já pagou **quatro
 * vezes** (Tarefas 29a, 34b, 38, 38d): um `expect(source).toContain('cron.schedule')`
 * continua **verde** depois de a propriedade morrer, porque texto sobrevive ao
 * comportamento. Aqui nenhuma asserção abre um arquivo de código. O que se
 * observa é:
 *
 * - **a chamada** ao agendador (houve? quantas? com que expressão?) — §7.3,
 *   contador, nunca cronômetro: o relógio nunca entra, o tique é uma função
 *   que o teste chama;
 * - **o efeito do callback** (o dispatcher foi chamado? quantas vezes?);
 * - **a saída** (a linha de boot, que é o que o dono lê no terminal);
 * - e **a expressão contra o `node-cron` de verdade** — `createTask` sem
 *   `start()`, que responde `match(date)` e `getNextRuns()` sem agendar nada e
 *   sem manter o processo vivo. É o que prova o que a expressão de cinco
 *   minutos significa, em vez de afirmar que a string está escrita em algum
 *   lugar.
 *
 * ⚠️ **Nenhum teste deste arquivo chama o dispatcher de verdade.** O `runPass` é
 * sempre um fake do teste: com VAPID configurado no `.env` do dono, uma passada
 * real manda push no aparelho dele e **queima o claim do dia**.
 */

/** Uma promessa que o teste resolve quando quiser — é o que torna "uma passada pendente" um estado, e não um tempo. */
interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Deixa as microtarefas pendentes rodarem.
 *
 * ⚠️ **Não é cronômetro (§7.3):** não espera intervalo nenhum — `setImmediate`
 * é o fim da fila de microtarefas do tique corrente. Um teste que esperasse os
 * cinco minutos do cron seria o instrumento errado para a propriedade.
 */
function settle(): Promise<void> {
  return new Promise<void>((resolveSettle) => {
    setImmediate(resolveSettle);
  });
}

interface Harness {
  /** O que `startReminderCron` devolveu: agendou ou não. */
  started: boolean;
  /** Uma entrada por chamada ao agendador, com a expressão recebida. */
  scheduled: string[];
  /** Dispara o callback agendado — o "tique" do cron, sem relógio. */
  tick: () => void;
  /** ⚠️ O CONTADOR (§7.3): quantas vezes o dispatcher foi CHAMADO. */
  passes: () => number;
  /** As linhas que o cron escreveu (a saída que o dono lê). */
  logs: string[];
  /** Termina a passada pendente com sucesso. */
  finishPass: () => void;
  /** Termina a passada pendente com falha. */
  failPass: (error: unknown) => void;
}

function startHarness(
  options: {
    env?: StartReminderCronOptions['env'];
    vapidConfigured?: boolean;
    /** `true` deixa a passada pendente até o teste mandar terminar. */
    manualPasses?: boolean;
  } = {},
): Harness {
  const scheduled: string[] = [];
  const callbacks: (() => void)[] = [];
  const logs: string[] = [];
  const pending: Deferred[] = [];
  const counters = { passes: 0 };

  const started = startReminderCron({
    env: options.env ?? { NOTIFICATIONS_CRON: 'on' },
    vapidConfigured: options.vapidConfigured ?? true,
    schedule: (expression, callback) => {
      scheduled.push(expression);
      callbacks.push(callback);
    },
    runPass: async () => {
      counters.passes += 1;
      const next = deferred();
      pending.push(next);
      if (options.manualPasses !== true) next.resolve();
      return next.promise;
    },
    log: (line) => {
      logs.push(line);
    },
  });

  const takePending = (): Deferred => {
    const next = pending.shift();
    if (next === undefined) {
      throw new Error('nenhuma passada pendente — o teste está enganado');
    }
    return next;
  };

  return {
    started,
    scheduled,
    logs,
    tick: () => {
      const callback = callbacks[0];
      if (callback === undefined) {
        throw new Error('o cron não foi agendado — não há tique para disparar');
      }
      callback();
    },
    passes: () => counters.passes,
    finishPass: () => {
      takePending().resolve();
    },
    failPass: (error) => {
      takePending().reject(error);
    },
  };
}

describe('startReminderCron — o portão de NOTIFICATIONS_CRON (decisão A)', () => {
  /**
   * ⚠️ **O SENTIDO "LIGADO" DO PORTÃO (regra 3, §7.1 aplicado a configuração).**
   * Sem este lado, um cron que **nunca** agenda passaria — e o buraco nº 1 do
   * MVP 3 continuaria aberto com a suíte verde.
   *
   * ⚠️ **A primeira linha é uma PRECONDIÇÃO, e ela está aqui porque o `toEqual`
   * abaixo NÃO é a guarda da expressão** (§7.8): ele compara a expressão
   * agendada com a constante do próprio módulo, então os dois lados mudam
   * juntos e trocar cinco minutos por dez o deixaria **verde** (medido: o
   * mutante da expressão dá 2 acusadores, e nenhum é este teste). Quem guarda o
   * significado é o bloco "contra o node-cron de verdade", lá embaixo, com os
   * minutos escritos à mão. Aqui o `toEqual` só diz *"foi agendada UMA vez, com
   * a expressão do módulo"* — e a precondição impede que o próximo leitor
   * confunda uma coisa com a outra.
   */
  it('schedules the reminder pass when NOTIFICATIONS_CRON is exactly "on"', () => {
    expect(REMINDER_CRON_EXPRESSION).toBe('*/5 * * * *');

    const cronTask = startHarness({ env: { NOTIFICATIONS_CRON: 'on' } });

    expect(cronTask.scheduled).toEqual([REMINDER_CRON_EXPRESSION]);
    expect(cronTask.started).toBe(true);
  });

  /**
   * ⚠️ **O SENTIDO "DESLIGADO" (regra 3).** Sem este lado, um cron que roda
   * **sempre** passaria — e quem subisse uma segunda instância sem ler nada
   * passaria a mandar push duplicado. Desligado é o padrão seguro.
   */
  it('schedules nothing when NOTIFICATIONS_CRON is absent', () => {
    const cronTask = startHarness({ env: {} });

    expect(cronTask.scheduled).toEqual([]);
    expect(cronTask.started).toBe(false);
  });

  /**
   * ⚠️ **O valor PARECIDO é o que pega um `Boolean(env.X)`** (decisão A): com
   * ele, a string `'off'` liga o cron, porque toda string não vazia é
   * verdadeira. `'ON'` e `'on '` estão aqui pelo mesmo motivo — a comparação é
   * de igualdade, não de "parece um sim".
   */
  it.each(['true', '1', 'yes', 'ON', 'On', 'on ', ' on', 'off', '', 'sim'])(
    'schedules nothing when NOTIFICATIONS_CRON is %j',
    (value) => {
      const cronTask = startHarness({ env: { NOTIFICATIONS_CRON: value } });

      expect(cronTask.scheduled).toEqual([]);
      expect(cronTask.started).toBe(false);
    },
  );

  /**
   * A linha de boot do lado desligado: o dono tem de conseguir descobrir, sem
   * ler código, por que nenhum lembrete sai — e qual é a chave.
   */
  it('says on one boot line why nothing was scheduled, naming the variable', () => {
    const cronTask = startHarness({ env: {} });

    expect(cronTask.logs).toHaveLength(1);
    expect(cronTask.logs[0]).toContain('NOTIFICATIONS_CRON');
  });
});

describe('o tique chama o dispatcher (regra 1)', () => {
  /**
   * ⚠️ **CONTADOR, NUNCA CRONÔMETRO (§7.3).** O tique é a função que o
   * agendador recebeu; o teste a chama. Nenhum `setTimeout` de cinco minutos —
   * o que se decide aqui é *"o callback chama o dispatcher"*, e isso não
   * precisa de relógio.
   */
  it('calls the dispatch pass once per tick', async () => {
    const cronTask = startHarness();

    expect(cronTask.passes()).toBe(0);

    cronTask.tick();
    await settle();
    expect(cronTask.passes()).toBe(1);

    cronTask.tick();
    await settle();
    expect(cronTask.passes()).toBe(2);
  });

  /**
   * ⚠️ **DECISÃO F — agenda mesmo sem VAPID, e o boot diz em UMA linha.**
   *
   * O dispatcher já devolve `vapid-not-configured` sem abrir o banco; um
   * segundo portão aqui dobraria os caminhos de configuração a testar para não
   * ganhar nada. O que o dono precisa é do aviso no lugar onde ele olha.
   */
  it('schedules even without VAPID, and the boot line says the passes will stop', () => {
    const cronTask = startHarness({ vapidConfigured: false });

    expect(cronTask.scheduled).toEqual([REMINDER_CRON_EXPRESSION]);
    expect(cronTask.logs).toHaveLength(1);
    expect(cronTask.logs[0]).toContain('vapid-not-configured');
  });

  /** E o outro lado do mesmo par: com VAPID, a linha NÃO carrega o aviso. */
  it('does not warn about VAPID when it is configured', () => {
    const cronTask = startHarness({ vapidConfigured: true });

    expect(cronTask.logs).toHaveLength(1);
    expect(cronTask.logs[0]).not.toContain('vapid-not-configured');
    expect(cronTask.logs[0]).toContain(REMINDER_CRON_EXPRESSION);
  });
});

describe('decisão D — uma passada que REJEITA não derruba o processo', () => {
  /**
   * ⚠️ **O QUE ESTÁ EM JOGO:** um `await` solto num callback de cron vira
   * *unhandled rejection*, e o Node 15+ **derruba o processo por padrão** — o
   * lembrete levaria a API junto. Uma noite de banco instável derrubaria o app.
   *
   * ⚠️ **E a prova é de que a rejeição foi TRATADA, não de que "não lançou"**
   * (§7.4: `not.toThrow` sobre um callback que devolve `undefined` não asserta
   * nada — ele **nunca** lançaria, porque a rejeição é assíncrona). As três
   * asserções são: a falha **apareceu no log** (alguém a pegou), **nada** veio
   * parar no `unhandledRejection` do processo, e **a passada seguinte
   * aconteceu**.
   */
  it('logs the failure, leaves no unhandled rejection, and takes the next tick', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      const cronTask = startHarness({ manualPasses: true });

      cronTask.tick();
      cronTask.failPass(new Error('o banco caiu no meio da passada'));
      await settle();

      expect(
        cronTask.logs.some((line) =>
          line.includes('o banco caiu no meio da passada'),
        ),
      ).toBe(true);
      expect(unhandled).toEqual([]);

      // E a passada seguinte acontece assim mesmo: uma falha é de uma passada,
      // não do agendamento.
      cronTask.tick();
      await settle();
      expect(cronTask.passes()).toBe(2);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('decisão E — uma passada por vez, provado por CONTADOR', () => {
  /**
   * ⚠️ Se uma passada demorar mais que cinco minutos, o `node-cron` dispara a
   * seguinte **em paralelo**. O claim no banco impede notificação duplicada,
   * mas duas passadas concorrentes são trabalho jogado fora e log ilegível.
   *
   * ⚠️ **O contador é o único instrumento que separa as duas coisas** (§7.3):
   * o resultado de uma passada ignorada e o de uma passada que rodou e não
   * mudou nada são idênticos vistos de fora.
   */
  it('ignores a tick while a pass is still running, and takes the next one after it ends', async () => {
    const cronTask = startHarness({ manualPasses: true });

    cronTask.tick();
    await settle();
    expect(cronTask.passes()).toBe(1);

    // O segundo tique chega com a primeira passada ainda pendente.
    cronTask.tick();
    await settle();
    expect(cronTask.passes()).toBe(1);
    expect(cronTask.logs.some((line) => line.includes('still running'))).toBe(
      true,
    );

    // A primeira termina; o tique seguinte roda de novo.
    cronTask.finishPass();
    await settle();
    cronTask.tick();
    await settle();
    expect(cronTask.passes()).toBe(2);
  });
});

describe('a expressão, contra o node-cron de verdade (decisões B e C)', () => {
  /**
   * ⚠️ **`createTask` NÃO INICIA a tarefa** (`schedule` é quem chama `start()`),
   * então nada é agendado, nada dispara e nada segura o processo vivo. É o que
   * torna a expressão decidível aqui sem esperar cinco minutos e sem risco de
   * uma passada de verdade sair.
   */
  function matchedMinutesOf(timezone?: string): number[] {
    const task =
      timezone === undefined
        ? cron.createTask(REMINDER_CRON_EXPRESSION, () => undefined)
        : cron.createTask(REMINDER_CRON_EXPRESSION, () => undefined, {
            timezone,
          });
    try {
      const base = Date.UTC(2026, 8, 17, 14, 0, 0);
      const minutes: number[] = [];
      for (let minute = 0; minute < 60; minute += 1) {
        if (task.match(new Date(base + minute * 60_000))) minutes.push(minute);
      }
      return minutes;
    } finally {
      void task.destroy();
    }
  }

  /**
   * ⚠️ **DECISÃO B — de cinco em cinco minutos**, que é metade da janela de
   * tolerância (`DEFAULT_WINDOW_MINUTES = 10`): uma passada perdida ainda tem a
   * seguinte dentro da janela.
   */
  it('fires on every multiple of five minutes, and on nothing else', () => {
    expect(matchedMinutesOf()).toEqual([
      0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55,
    ]);
  });

  /**
   * ⚠️ **DECISÃO C — passar `timezone` aqui não mudaria NADA**, e é por isso que
   * não se passa: a opção faria o próximo leitor achar que o fuso do lembrete
   * se decide aqui, quando ele se decide no `Settings.timezone` de cada pessoa,
   * com Luxon, dentro do `scheduler.ts`.
   *
   * A prova é medida, não afirmada: `Asia/Kathmandu` é **UTC+05:45**, o fuso
   * mais hostil que existe para esta conta — e mesmo ele casa exatamente os
   * mesmos instantes, porque todo deslocamento real de fuso é múltiplo de 15
   * minutos, e 15 é múltiplo de 5.
   */
  it('matches the same instants with or without a timezone, even at UTC+05:45', () => {
    const noTimezone = matchedMinutesOf();

    expect(matchedMinutesOf('Asia/Kathmandu')).toEqual(noTimezone);
    expect(matchedMinutesOf('Pacific/Chatham')).toEqual(noTimezone);
    // A precondição do método: a varredura acha alguma coisa. Uma lista vazia
    // dos dois lados seria "igual" e não teria olhado nada (§7.4).
    expect(noTimezone.length).toBe(12);
  });
});

describe('node-cron é dependência do backend, e só dele (regra 6)', () => {
  const PACKAGES_DIR = resolve(
    fileURLToPath(new URL('..', import.meta.url)),
    '..',
    '..',
    '..',
  );

  function declaredDepsOf(packageName: string): string[] {
    const manifest = JSON.parse(
      readFileSync(join(PACKAGES_DIR, packageName, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ];
  }

  /**
   * ⚠️ O `packages/app` é o que vai para o celular, e `shared` e `ui` são
   * **empacotados** nele: uma dependência de servidor declarada em qualquer um
   * dos três vira bytes no navegador de quem abre o app.
   *
   * ⚠️ **O antídoto está na mesma asserção** (§7.4): o backend **tem** o pacote.
   * Sem esse lado, um `declaredDepsOf` quebrado devolveria `[]` e as três
   * primeiras linhas passariam para sempre sem olhar nada.
   *
   * ⚠️ **O que esta guarda NÃO mede:** o fecho **transitivo** — um pacote do
   * app que arrastasse `node-cron` de terceira mão passaria aqui. Quem mede
   * isso de fato é o `bundle-guard.test.ts` do app, que constrói o bundle e o
   * pesa contra um teto; e `node-cron` não tem dependência nenhuma, então o
   * único caminho até o PWA é alguém declará-lo — que é exatamente o que esta
   * linha vê.
   */
  it('is declared by the backend and by no package that ships to the phone', () => {
    expect(declaredDepsOf('app')).not.toContain('node-cron');
    expect(declaredDepsOf('shared')).not.toContain('node-cron');
    expect(declaredDepsOf('ui')).not.toContain('node-cron');
    // O ANTÍDOTO: o backend declara.
    expect(declaredDepsOf('backend')).toContain('node-cron');
  });
});
