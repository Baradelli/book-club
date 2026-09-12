import { describe, expect, it, vi } from 'vitest';

import {
  aBook,
  aMembership,
  aPlanItem,
  aPushSubscription,
  aSettings,
} from '../../test-support/builders';
import { generateEphemeralVapidKeys } from '../../test-support/ephemeral-vapid-keys';
import { BookRepositoryFake } from '../../usecases/_fakes/book-repository-fake';
import { MembershipRepositoryFake } from '../../usecases/_fakes/membership-repository-fake';
import { NotificationDeliveryRepositoryFake } from '../../usecases/_fakes/notification-delivery-repository-fake';
import { PushSenderFake } from '../../usecases/_fakes/push-sender-fake';
import { PushSubscriptionRepositoryFake } from '../../usecases/_fakes/push-subscription-repository-fake';
import { ReadingLogRepositoryFake } from '../../usecases/_fakes/reading-log-repository-fake';
import { ReadingPlanItemRepositoryFake } from '../../usecases/_fakes/reading-plan-item-repository-fake';
import { SettingsRepositoryFake } from '../../usecases/_fakes/settings-repository-fake';
import type { OpenedDeps, RunDispatchOptions } from '../dispatch-script';
import {
  reportLine,
  runDispatch,
  windowMinutesFromEnv,
} from '../dispatch-script';
import type { VapidConfig } from '../vapid';

/**
 * ⚠️ **REGRA 16 DA TAREFA 37 — O SCRIPT DE CRON: ele IMPRIME o resultado e SAI
 * COM 0 mesmo sem ninguém a lembrar.**
 *
 * *"Um script de cron que sai diferente de 0 em dia normal enche a caixa do
 * dono de alerta falso, e o alerta que sempre toca é o alerta que ninguém lê."*
 *
 * ⚠️ **E ele NÃO ENVIA NADA NESTA FATIA.** O `PushSender` real é a Tarefa 38 e
 * o pacote `web-push` não é dependência de pacote nenhum — então o script
 * **recusa a passada** enquanto não houver sender, em vez de rodar com um
 * sender de mentira. Rodar sem enviar seria pior que não rodar: o claim é
 * gasto ANTES do envio (decisão E), então uma passada com sender falso queimaria
 * a reserva do dia de todo mundo e ninguém receberia nada — hoje nem amanhã.
 */

/** Uma configuração VAPID de FIXTURE, gerada na hora e descartada. */
function someVapid(): VapidConfig {
  const keys = generateEphemeralVapidKeys();
  return { ...keys, subject: 'mailto:fixture@localhost' };
}

function openedDeps(): {
  open: () => Promise<OpenedDeps>;
  opens: number;
  closes: number;
  settings: SettingsRepositoryFake;
} {
  const counters = { opens: 0, closes: 0 };
  const settings = new SettingsRepositoryFake();
  const state = {
    open: async (): Promise<OpenedDeps> => {
      counters.opens += 1;
      return {
        repositories: {
          settings,
          memberships: new MembershipRepositoryFake(),
          books: new BookRepositoryFake(),
          planItems: new ReadingPlanItemRepositoryFake(),
          readingLogs: new ReadingLogRepositoryFake(),
          pushSubscriptions: new PushSubscriptionRepositoryFake(),
          deliveries: new NotificationDeliveryRepositoryFake(),
        },
        close: async (): Promise<void> => {
          counters.closes += 1;
        },
      };
    },
    settings,
    get opens(): number {
      return counters.opens;
    },
    get closes(): number {
      return counters.closes;
    },
  };
  return state;
}

function options(
  overrides: Partial<RunDispatchOptions> = {},
): RunDispatchOptions & { lines: string[] } {
  const lines: string[] = [];
  const sender = new PushSenderFake();
  const opened = openedDeps();
  return {
    vapid: someVapid(),
    sender,
    open: opened.open,
    windowMinutes: 10,
    now: new Date('2026-10-05T00:03:00.000Z'),
    log: (line: string) => lines.push(line),
    lines,
    ...overrides,
  };
}

describe('windowMinutesFromEnv', () => {
  /** `NOTIFICATION_WINDOW_MINUTES` do `NOTIFICACOES.md` §3, com o padrão 10. */
  it('reads NOTIFICATION_WINDOW_MINUTES, defaulting to 10', () => {
    expect(windowMinutesFromEnv({})).toBe(10);
    expect(windowMinutesFromEnv({ NOTIFICATION_WINDOW_MINUTES: '5' })).toBe(5);
    expect(windowMinutesFromEnv({ NOTIFICATION_WINDOW_MINUTES: '30' })).toBe(
      30,
    );
  });

  /**
   * ⚠️ **Valor torto cai no PADRÃO, e não em `NaN`.**
   *
   * Um `NaN` aqui faria `minutesAfter < NaN` ser sempre falso: **ninguém**
   * receberia lembrete, para sempre, sem erro e sem log. O tipo de falha que só
   * se descobre quando alguém pergunta "por que parei de receber?".
   */
  it.each(['', 'dez', '10min', 'NaN', '-5', '0'])(
    'falls back to the default for the bogus value %p',
    (value) => {
      expect(windowMinutesFromEnv({ NOTIFICATION_WINDOW_MINUTES: value })).toBe(
        10,
      );
    },
  );
});

describe('reportLine', () => {
  /**
   * ⚠️ **Uma linha, JSON** — é o que o ADR 0006 promete ao dono
   * (*"o script loga o resultado em JSON"*), e é o que um cron consegue
   * redirecionar para um arquivo sem virar prosa.
   */
  it('is one line of JSON with the four counters and the reason', () => {
    const line = reportLine({
      enabled: true,
      dispatched: true,
      reason: 'ok',
      result: { considered: 3, sent: 1, disabled: 0, skipped: 2 },
    });

    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual({
      enabled: true,
      dispatched: true,
      reason: 'ok',
      result: { considered: 3, sent: 1, disabled: 0, skipped: 2 },
    });
  });
});

describe('runDispatch', () => {
  /**
   * ⚠️ **A FEATURE DESLIGADA É O CAMINHO LIMPO** (`NOTIFICACOES.md` §3, decisão
   * G da Tarefa 36): sem chave VAPID o script **não faz nada**, loga e sai bem.
   * *"Ninguém precisa de VAPID configurado para rodar o projeto."*
   *
   * E ele **nem abre o banco**: provado por contagem, não pelo resultado — as
   * duas implementações devolvem os mesmos zeros.
   */
  it('does nothing, cleanly, when VAPID is not configured', async () => {
    const opened = openedDeps();
    const o = options({ vapid: null, open: opened.open });

    const report = await runDispatch(o);

    expect(report).toEqual({
      enabled: false,
      dispatched: false,
      reason: 'vapid-not-configured',
      result: { considered: 0, sent: 0, disabled: 0, skipped: 0 },
    });
    expect(o.lines).toHaveLength(1);
    expect(JSON.parse(o.lines[0] ?? '')).toMatchObject({ enabled: false });
    // ⚠️ Nem a conexão de banco é aberta — provado por CONTAGEM (§7.3), não
    // pelo resultado: "não abriu" e "abriu e não achou ninguém" devolvem os
    // mesmos zeros.
    expect(opened.opens).toBe(0);
  });

  /**
   * ⚠️ **SEM `PushSender`, NÃO HÁ PASSADA — e é uma decisão de SEGURANÇA, não
   * de escopo.**
   *
   * O claim é gasto ANTES do envio (decisão E). Uma passada com um sender de
   * mentira queimaria a reserva do dia de todo mundo e **ninguém receberia
   * nada** — nem hoje, nem amanhã, porque a reserva de hoje já estaria gasta.
   * Então o script recusa, explica por quê, e sai com 0.
   */
  it('refuses the pass when there is no real sender yet (Tarefa 38)', async () => {
    const opened = openedDeps();
    const o = options({ sender: null, open: opened.open });

    const report = await runDispatch(o);

    expect(report).toEqual({
      enabled: true,
      dispatched: false,
      reason: 'push-sender-not-implemented',
      result: { considered: 0, sent: 0, disabled: 0, skipped: 0 },
    });
    // Nem abriu o banco: não há passada a preparar.
    expect(opened.opens).toBe(0);
  });

  /**
   * ⚠️ **DIA NORMAL, NINGUÉM A LEMBRAR: zeros, uma linha de log, e NADA de
   * erro** (regra 16). É o caso mais comum de todos — e o que, se virasse
   * alerta, treinaria o dono a ignorar o alerta.
   */
  it('reports zeros without any error when nobody is due', async () => {
    const o = options();

    const report = await runDispatch(o);

    expect(report).toEqual({
      enabled: true,
      dispatched: true,
      reason: 'ok',
      result: { considered: 0, sent: 0, disabled: 0, skipped: 0 },
    });
    expect(o.lines).toHaveLength(1);
  });

  it('dispatches and reports what happened', async () => {
    const sender = new PushSenderFake();
    const opened = openedDeps();
    const o = options({ sender, open: opened.open });

    await opened.settings.save(
      aSettings({
        userId: 'user-maria',
        timezone: 'America/Sao_Paulo',
        reminderTime: '21:00',
      }),
    );

    const report = await runDispatch(o);

    // Sem clube nem plano, ela é considerada e pulada — o que interessa aqui é
    // que a passada ACONTECEU e os números chegaram ao log.
    expect(report.dispatched).toBe(true);
    expect(report.result).toEqual({
      considered: 1,
      sent: 0,
      disabled: 0,
      skipped: 1,
    });
    expect(JSON.parse(o.lines[0] ?? '')).toMatchObject({
      result: { considered: 1 },
    });
  });

  /**
   * ⚠️ **A CONEXÃO É FECHADA — inclusive quando a passada estoura.**
   *
   * Um script de cron que deixa conexão aberta enche o pool do Postgres do dono
   * a cada 5 minutos, e o sintoma aparece num lugar que não tem nada a ver com
   * notificação.
   */
  it('closes what it opened, even when the pass blows up', async () => {
    const sender = new PushSenderFake();
    const opened = openedDeps();
    const o = options({ sender, open: opened.open });
    vi.spyOn(opened.settings, 'find').mockRejectedValueOnce(
      new Error('o banco caiu no meio'),
    );

    await expect(runDispatch(o)).rejects.toThrow('o banco caiu no meio');

    expect(opened.opens).toBe(1);
    expect(opened.closes).toBe(1);
  });

  it('closes what it opened on the happy path too', async () => {
    const sender = new PushSenderFake();
    const opened = openedDeps();

    await runDispatch(options({ sender, open: opened.open }));

    expect(opened.opens).toBe(1);
    expect(opened.closes).toBe(1);
  });

  /** A janela do ambiente chega ao dispatcher — não um 10 escondido no caminho. */
  it('passes the window it was given down to the dispatcher', async () => {
    const sender = new PushSenderFake();
    const opened = openedDeps();
    await opened.settings.save(
      aSettings({
        userId: 'user-maria',
        timezone: 'America/Sao_Paulo',
        reminderTime: '21:00',
      }),
    );
    const o = options({ sender, open: opened.open, windowMinutes: 1 });
    // 21:03 local, com janela de 1 minuto: fora. Com 10, estaria dentro — é o
    // par que faz esta asserção escolher alguma coisa.
    const report = await runDispatch(o);

    expect(report.result).toEqual({
      considered: 1,
      sent: 0,
      disabled: 0,
      skipped: 1,
    });
  });

  /**
   * A passada de verdade, ponta a ponta pelo script: uma pessoa com clube,
   * livro, plano do dia e aparelho recebe — e o log diz isso.
   */
  it('reminds a real reader, end to end through the script', async () => {
    const sender = new PushSenderFake();
    const settings = new SettingsRepositoryFake();
    const memberships = new MembershipRepositoryFake();
    const books = new BookRepositoryFake();
    const planItems = new ReadingPlanItemRepositoryFake();
    const pushSubscriptions = new PushSubscriptionRepositoryFake();

    await settings.save(
      aSettings({
        userId: 'user-maria',
        timezone: 'America/Sao_Paulo',
        reminderTime: '21:00',
      }),
    );
    await memberships.save(
      aMembership({ userId: 'user-maria', clubId: 'club-1' }),
    );
    await books.save(aBook({ id: 'book-1', clubId: 'club-1' }));
    await planItems.saveMany([
      aPlanItem({ id: 'dia-4', bookId: 'book-1', date: '2026-10-04' }),
    ]);
    await pushSubscriptions.save(
      aPushSubscription({
        userId: 'user-maria',
        endpoint: 'https://push.test/maria',
      }),
    );

    const report = await runDispatch(
      options({
        sender,
        open: async () => ({
          repositories: {
            settings,
            memberships,
            books,
            planItems,
            readingLogs: new ReadingLogRepositoryFake(),
            pushSubscriptions,
            deliveries: new NotificationDeliveryRepositoryFake(),
          },
          close: async () => {},
        }),
      }),
    );

    expect(report.result).toEqual({
      considered: 1,
      sent: 1,
      disabled: 0,
      skipped: 0,
    });
    expect(sender.recipients).toEqual(['user-maria']);
  });
});
