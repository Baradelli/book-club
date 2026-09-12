import type { PushSender } from '../usecases/ports/push-sender';
import { DEFAULT_WINDOW_MINUTES } from './reminder-window';
import type { DispatchDeps, DispatchResult } from './scheduler';
import { dispatchDueNotifications } from './scheduler';
import type { VapidConfig } from './vapid';

/**
 * ⚠️ **O CORPO DO SCRIPT DE CRON (regra 16 da Tarefa 37) — separado do
 * `main.ts` para ser TESTÁVEL sem banco e sem processo.**
 *
 * `NOTIFICACOES.md` §6 e ADR 0006: **não existe cron dentro do Fastify**. Um
 * cron externo chama, a cada 5–10 minutos:
 *
 * ```
 * pnpm --filter @clube/backend notifications:dispatch
 * ```
 *
 * ⚠️ **Ele imprime o resultado e sai com 0 mesmo sem ninguém a lembrar**: um
 * script de cron que sai diferente de 0 em dia normal enche a caixa do dono de
 * alerta falso, e o alerta que sempre toca é o alerta que ninguém lê. O que
 * **deve** sair diferente de 0 é uma falha de verdade (o banco caiu), e por
 * isso `runDispatch` **relança** — quem decide o código de saída é o `main`.
 */

/** O relatório de uma passada — uma linha de JSON no log do cron. */
export interface DispatchReport {
  /** A feature está ligada? (`getVapidConfig()` não é `null`.) */
  enabled: boolean;
  /** A varredura chegou a rodar? */
  dispatched: boolean;
  /** Por que não rodou, quando não rodou. `'ok'` quando rodou. */
  reason: string;
  /** Os quatro contadores. Zeros quando não rodou. */
  result: DispatchResult;
}

/**
 * As dependências abertas para uma passada, com o que fechá-las.
 *
 * ⚠️ **Sem o `sender`, de propósito.** Quem abre conexão são os repositórios;
 * o port de envio é o único ponto de efeito externo da feature, e ele entra por
 * outro caminho (`RunDispatchOptions.sender`) justamente para que "abrir o
 * banco" e "poder mandar push" sejam decisões separadas — é o que permite o
 * script recusar a passada sem precisar de um sender de mentira para satisfazer
 * um tipo.
 */
export interface OpenedDeps {
  repositories: Omit<DispatchDeps, 'sender'>;
  close: () => Promise<void>;
}

export interface RunDispatchOptions {
  /** `null` **desliga a feature inteira, limpo** (`NOTIFICACOES.md` §3). */
  vapid: VapidConfig | null;
  /**
   * ⚠️ **O port de envio real — foi `null` até a Tarefa 38; hoje o
   * `dispatch-main.ts` passa um `WebPushSender` sempre que há VAPID.**
   *
   * Ele entra por parâmetro (e não por import) porque é o único ponto de efeito
   * externo da feature: quem monta o script escolhe o que ele pode fazer, e o
   * teste escolhe o fake. O `null` continua representável — e o ramo que o
   * trata (`push-sender-not-provided`) está documentado no `runDispatch`.
   */
  sender: PushSender | null;
  /**
   * Abre o banco e monta os repositórios. **Preguiçoso de propósito**: uma
   * passada que não vai acontecer (feature desligada) não abre conexão.
   */
  open: () => Promise<OpenedDeps>;
  windowMinutes: number;
  /** O relógio, injetado como no dispatcher. O `main` não passa: usa o padrão. */
  now?: Date;
  log: (line: string) => void;
}

const NOTHING: DispatchResult = {
  considered: 0,
  sent: 0,
  disabled: 0,
  skipped: 0,
};

/**
 * `NOTIFICATION_WINDOW_MINUTES` do ambiente, com o padrão do
 * `NOTIFICACOES.md` §3.
 *
 * ⚠️ **Valor torto cai no PADRÃO, nunca em `NaN`.** Um `NaN` aqui faria
 * `minutesAfter < NaN` ser sempre falso: **ninguém** receberia lembrete, para
 * sempre, sem erro e sem log — o tipo de falha que só se descobre quando alguém
 * pergunta "por que parei de receber?". Zero e negativo também caem no padrão,
 * pelo mesmo motivo: são janelas vazias, e uma janela vazia é o mesmo silêncio.
 */
export function windowMinutesFromEnv(env: {
  NOTIFICATION_WINDOW_MINUTES?: string | undefined;
}): number {
  const raw = Number(env.NOTIFICATION_WINDOW_MINUTES);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_WINDOW_MINUTES;
  return Math.trunc(raw);
}

/**
 * A linha que o cron loga. **Uma linha, JSON** — é o que o ADR 0006 promete ao
 * dono, e é o que um cron consegue redirecionar para um arquivo sem virar
 * prosa.
 */
export function reportLine(report: DispatchReport): string {
  return JSON.stringify(report);
}

/**
 * Uma passada, com tudo injetado.
 *
 * ⚠️ **Dois motivos de não rodar, e os dois saem BEM (com 0):**
 *
 * 1. **`vapid-not-configured`** — `NOTIFICACOES.md` §3 e decisão G da Tarefa
 *    36: *"`null` desliga a feature inteira, limpo"*. Ninguém precisa de VAPID
 *    configurado para rodar o projeto, e nem a conexão de banco é aberta.
 * 2. ⚠️ **`push-sender-not-provided`** — chegou um `sender: null`. Rodar a
 *    passada com um sender de mentira seria **pior que não rodar**: o claim é
 *    gasto ANTES do envio (decisão E), então ela queimaria a reserva do dia de
 *    todo mundo e ninguém receberia nada — nem hoje, nem amanhã.
 *
 *    ⚠️⚠️ **NENHUM CHAMADOR DE PRODUÇÃO ALCANÇA ESTE RAMO DESDE A TAREFA 38.**
 *    Até ela, o `PushSender` real não existia e o `dispatch-main.ts` passava
 *    `sender: null` sempre — era **este** o motivo normal de o script não fazer
 *    nada. A 38 trouxe o `WebPushSender`, e hoje o `dispatch-main.ts` só manda
 *    `null` quando `vapid === null` — caso que o ramo 1 acima já devolveu antes
 *    de chegar aqui. O ramo continua porque `runDispatch` recebe o sender por
 *    parâmetro e um `null` é representável; quem o exercita é o teste.
 *
 *    ⚠️ **E foi por isso que ele foi RENOMEADO**: chamava-se
 *    `push-sender-not-implemented`, e depois da 38 o sender **está**
 *    implementado — o nome mandava o próximo leitor procurar uma implementação
 *    que não faltava. É a classe do `dayRange` (`CLAUDE.md`, "Convenções"):
 *    ponteiro que sobrevive à fatia que o resolveu faz inventar um terceiro
 *    nome para a mesma coisa.
 *
 * O que ela **não** engole é erro de verdade: se o banco cair, a exceção sobe
 * (depois de fechar o que abriu) e o `main` sai diferente de 0. Alerta falso
 * treina o dono a ignorar; alerta ausente é pior.
 */
export async function runDispatch(
  options: RunDispatchOptions,
): Promise<DispatchReport> {
  const report = (
    partial: Omit<DispatchReport, 'result'> & {
      result?: DispatchResult;
    },
  ): DispatchReport => {
    const full: DispatchReport = {
      ...partial,
      result: partial.result ?? NOTHING,
    };
    options.log(reportLine(full));
    return full;
  };

  if (options.vapid === null) {
    return report({
      enabled: false,
      dispatched: false,
      reason: 'vapid-not-configured',
    });
  }

  const sender = options.sender;
  if (sender === null) {
    return report({
      enabled: true,
      dispatched: false,
      reason: 'push-sender-not-provided',
    });
  }

  const opened = await options.open();
  try {
    const result = await dispatchDueNotifications(
      { ...opened.repositories, sender },
      {
        windowMinutes: options.windowMinutes,
        ...(options.now === undefined ? {} : { now: options.now }),
      },
    );
    return report({ enabled: true, dispatched: true, reason: 'ok', result });
  } finally {
    // Fecha o que abriu, inclusive quando a passada estoura: um script de cron
    // que vaza conexão enche o pool do Postgres do dono a cada 5 minutos, e o
    // sintoma aparece num lugar que não tem nada a ver com notificação.
    await opened.close();
  }
}
