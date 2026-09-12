import { randomUUID } from 'node:crypto';

import { localDay } from '@clube/shared';

import type { NotificationDeliveryRepository } from '../usecases/ports/notification-delivery-repository';
import type { PushSender } from '../usecases/ports/push-sender';
import type { PushSubscriptionRepository } from '../usecases/ports/push-subscription-repository';
import type { SettingsRepository } from '../usecases/ports/settings-repository';
import { localMinutesOfDay } from './local-clock';
import type { ReminderCandidateDeps } from './reminder-candidates';
import { readingOfTheDay } from './reminder-candidates';
import { buildReadingReminder } from './reminder-message';
import { DEFAULT_WINDOW_MINUTES, isInsideWindow } from './reminder-window';

/**
 * ⚠️ **O DISPATCHER — a peça que decide, sozinha e sem ninguém olhando, mandar
 * uma mensagem para o celular de uma pessoa.**
 *
 * `NOTIFICACOES.md` §6 e ADR 0006: um script chamado por **cron externo** (não
 * há cron dentro do Fastify) acorda a cada 5–10 minutos, descobre quem pediu
 * para ser lembrado **agora** no fuso de cada um, **cala a boca para quem já
 * leu**, garante que ninguém receba duas vezes no mesmo dia, e entrega a
 * mensagem a um port de envio.
 *
 * ## A ordem das perguntas, e por que ela é esta
 *
 * ```
 * 1. quem PEDIU lembrete        Settings.reminderEnabled   decisão C
 * 2. é a hora DELA?             isInsideWindow             decisão D   ← de graça
 * 3. ela tem aparelho ativo?    PushSubscription           decisão C
 * 4. há trecho hoje? já leu?    readingOfTheDay            decisões A e B
 * 5. RESERVA o dia              claim                      decisão E   ← antes do envio
 * 6. entrega                    PushSender                 decisão I
 * ```
 *
 * A decisão C manda a varredura começar pelo `Settings`, e não pela inscrição:
 * *"condição técnica não decide antes da vontade declarada"*. A janela entra
 * entre as duas porque ela é **pura e grátis** — nenhuma ida ao banco —, e
 * porque pular cedo é o que mantém o conteúdo do clube intocado para quem não
 * está na hora (§7.3: todo corte precisa de um `xxxCalls === 0`).
 *
 * ## ⚠️ O que este arquivo NÃO faz
 *
 * - **Não lê o ambiente e não conhece VAPID.** O `NOTIFICACOES.md` §6 esboça a
 *   assinatura com `{ prisma, vapid }`, e aqui ela é outra: um UseCase não
 *   importa Prisma nem lê `process.env` (`CLAUDE.md`). Quem decide se a feature
 *   está ligada é o **script** (`dispatch-script.ts`), que chama
 *   `getVapidConfig()` e nem começa a passada quando ele é `null`; e quem usa a
 *   chave é a implementação real do `PushSender`, na Tarefa 38. O desenho de
 *   fatia fina do §3 (*"`null` desliga a feature inteira, limpo"*) fica
 *   intacto — só com o dono certo.
 * - **Não faz aritmética de data** (decisão A). O dia da pessoa sai de
 *   `localDay(now, timezone)` — a mesma string de `ReadingPlanItem.date` — e a
 *   hora sai de `localMinutesOfDay`. Nenhum range, nenhum `startOf('day')`,
 *   nenhuma comparação de `Date`.
 * - **Não manda `GROUP_ACTIVITY`.** Ele não passa pelo dispatcher
 *   (`NOTIFICACOES.md` §6, último parágrafo): é disparado no mesmo UseCase que
 *   grava o `ActivityEvent`, e é a Tarefa 38.
 */

export interface DispatchDeps extends ReminderCandidateDeps {
  settings: SettingsRepository;
  pushSubscriptions: PushSubscriptionRepository;
  deliveries: NotificationDeliveryRepository;
  sender: PushSender;
}

export interface DispatchOptions {
  /**
   * ⚠️ **O relógio, injetado e lido UMA vez** (regra 2, ADR 0008, §7.8).
   *
   * O padrão é avaliado **uma** vez por passada, e o mesmo `Date` atravessa a
   * janela, o dia do plano e o `deliveredAt` do claim. Com duas leituras, alguém
   * perto da virada da janela entraria pela primeira e sairia pela segunda — e o
   * lembrete sumiria sem erro nenhum. A prova é por **contagem** de leituras
   * (`reads === 1`), nunca por cronômetro nem por "os dois instantes são
   * parecidos".
   */
  now?: Date;
  /** O tamanho da janela. Ver `DEFAULT_WINDOW_MINUTES` e a decisão D. */
  windowMinutes?: number;
}

/**
 * O que a passada fez, para o script logar.
 *
 * ⚠️ **`considered = sent + skipped`, e os dois primeiros contam PESSOAS**
 * (regra 14). Contador que não fecha é contador que mente no log do dono — e
 * este log é a única coisa que o dono vê de uma peça que roda sozinha.
 *
 * ⚠️ **`disabled` é o único contador de APARELHO, e por isso ele fica FORA da
 * conta de pessoas.** Ele é a soma do `{ disabled }` que o `PushSender` devolve
 * (`NOTIFICACOES.md` §5): as inscrições que morreram porque a pessoa
 * desinstalou ou limpou o navegador. Uma pessoa com três aparelhos e dois
 * mortos é **uma** pessoa lembrada e **dois** aparelhos desligados; somá-los num
 * contador só faria o log dizer que cinco pessoas foram lembradas.
 */
export interface DispatchResult {
  /** Quantas pessoas a varredura olhou — as que pediram lembrete. */
  considered: number;
  /** Quantas **receberam** (pelo menos um aparelho entregou). */
  sent: number;
  /** Quantas **inscrições** o envio desativou. Aparelho, não pessoa. */
  disabled: number;
  /** Quantas pessoas não receberam, por qualquer motivo. */
  skipped: number;
}

const READING_REMINDER = 'READING_REMINDER' as const;

export async function dispatchDueNotifications(
  deps: DispatchDeps,
  options: DispatchOptions = {},
): Promise<DispatchResult> {
  // ⚠️ UMA leitura de relógio, aqui, para a passada inteira (regra 2).
  const now = options.now ?? new Date();
  const windowMinutes = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;

  const result: DispatchResult = {
    considered: 0,
    sent: 0,
    disabled: 0,
    skipped: 0,
  };

  // Decisão C: a varredura COMEÇA por quem pediu para ser lembrado. Quem não
  // quer não é nem considerado.
  const wantsReminder = await deps.settings.find({ reminderEnabled: true });

  for (const settings of wantsReminder) {
    result.considered += 1;

    // Fuso corrompido: a pessoa fica SEM lembrete, e a passada continua. Um
    // push na hora errada é o oposto do §1 do plano, e uma exceção aqui mataria
    // o lembrete de todo mundo por causa de uma linha.
    const localMinutes = localMinutesOfDay(now, settings.timezone);
    if (localMinutes === null) {
      result.skipped += 1;
      continue;
    }

    // A janela é pura e grátis: pular aqui é o que mantém o conteúdo do clube
    // intocado para quem não está na hora.
    if (!isInsideWindow(localMinutes, settings.reminderTime, windowMinutes)) {
      result.skipped += 1;
      continue;
    }

    // Decisão C, segundo filtro: o aparelho existe? O port já devolve só as
    // ativas (`disabledAt IS NULL`), e o filtro é dele, não daqui.
    const devices = await deps.pushSubscriptions.byUserId(settings.userId);
    if (devices.length === 0) {
      result.skipped += 1;
      continue;
    }

    // ⚠️ Decisão A: o dia dela é uma STRING, e é a mesma forma de
    // `ReadingPlanItem.date`. Daqui para baixo não há data a calcular.
    const day = localDay(now, settings.timezone);
    const reading = await readingOfTheDay(deps, settings.userId, day);
    // `NO_PLAN` (decisão B) e `ALREADY_READ` (a supressão anti-culpa) são
    // regras diferentes com o mesmo desfecho: silêncio, e sem gastar a reserva
    // do dia — quem já leu hoje não pode perder o lembrete de amanhã.
    if (reading.status !== 'TO_READ') {
      result.skipped += 1;
      continue;
    }

    // ⚠️ DECISÃO E: A RESERVA VEM ANTES DO ENVIO.
    //
    // Se o envio viesse primeiro, uma falha entre enviar e gravar faria a
    // próxima passada enviar DE NOVO. Claim primeiro significa que a pior falha
    // possível é um lembrete PERDIDO, não um lembrete REPETIDO — e num app cujo
    // §1 é "não virar cobrança", repetir é o erro caro.
    const granted = await deps.deliveries.claim({
      id: randomUUID(),
      userId: settings.userId,
      kind: READING_REMINDER,
      localDate: day,
      deliveredAt: now,
    });
    if (!granted) {
      result.skipped += 1;
      continue;
    }

    // Decisão I: o payload sai pronto daqui. O sender entrega.
    const payload = buildReadingReminder({
      locale: settings.locale,
      bookId: reading.bookId,
      planItem: reading.planItem,
    });

    try {
      const delivery = await deps.sender.send(settings.userId, payload);
      result.disabled += delivery.disabled;
      // `sent` é "recebeu", não "tentei": com todos os aparelhos mortos, contar
      // como lembrada faria o log afirmar uma entrega que não aconteceu.
      if (delivery.sent > 0) result.sent += 1;
      else result.skipped += 1;
    } catch {
      // ⚠️ O claim NÃO é desfeito, e é deliberado: o lembrete daquele dia está
      // gasto. E a falha de uma pessoa não derruba a passada — a próxima da
      // fila não tem nada com o roteador de quem veio antes.
      result.skipped += 1;
    }
  }

  return result;
}
