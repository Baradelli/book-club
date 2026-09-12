import { describe, expect, it } from 'vitest';

import { installAdvancingClock } from '../../test-support/advancing-clock';
import {
  aBook,
  aMembership,
  aPlanItem,
  aPushSubscription,
  aReadingLog,
  aSettings,
} from '../../test-support/builders';
import { BookRepositoryFake } from '../../usecases/_fakes/book-repository-fake';
import { MembershipRepositoryFake } from '../../usecases/_fakes/membership-repository-fake';
import { NotificationDeliveryRepositoryFake } from '../../usecases/_fakes/notification-delivery-repository-fake';
import { PushSenderFake } from '../../usecases/_fakes/push-sender-fake';
import { PushSubscriptionRepositoryFake } from '../../usecases/_fakes/push-subscription-repository-fake';
import { ReadingLogRepositoryFake } from '../../usecases/_fakes/reading-log-repository-fake';
import { ReadingPlanItemRepositoryFake } from '../../usecases/_fakes/reading-plan-item-repository-fake';
import { SettingsRepositoryFake } from '../../usecases/_fakes/settings-repository-fake';
import type { DispatchDeps } from '../scheduler';
import { dispatchDueNotifications } from '../scheduler';

/**
 * ⚠️ **O DISPATCHER — a única peça do projeto que decide, sozinha e sem
 * ninguém olhando, mandar uma mensagem para o celular de uma pessoa.**
 *
 * Tudo aqui é sobre **não mandar**: não mandar duas vezes, não mandar para quem
 * já leu, não mandar quando não há o que ler. E o envio é contra o **fake** do
 * `PushSender` — nada sai da máquina nesta fatia (o `web-push` é a Tarefa 38, e
 * não é dependência de pacote nenhum).
 *
 * ⚠️ **O relógio é INJETADO e lido UMA vez** (regra 2, ADR 0008, §7.8), e "uma
 * vez" se prova **contando leituras** — nunca com cronômetro e nunca comparando
 * instantes. Num dispatcher isso importa mais que no resto do projeto: com duas
 * leituras, alguém perto da virada da janela entra pela primeira e sai pela
 * segunda.
 */

const MARIA = 'user-maria';
const MARCOS = 'user-marcos';
const CLUB = 'club-casal';
const BOOK = 'book-hobbit';
const SAO_PAULO = 'America/Sao_Paulo';
const NEW_YORK = 'America/New_York';

/**
 * ⚠️ **O relógio de referência dos testes que NÃO usam o `advancing-clock`.**
 *
 * `2026-10-05T00:03:00Z` é **00:03 do dia 5 em UTC** e **21:03 do dia 4 em São
 * Paulo** (UTC−3). O instante é escolhido para a implementação errada FALHAR
 * (§7.2/§7.8): quem calculasse o dia com `toISOString().slice(0, 10)` — o
 * atalho que parece inofensivo — pegaria o dia **5**, não acharia o plano do dia
 * **4**, e o lembrete sumiria sem erro nenhum. O plano do cenário é do dia 4,
 * então só a conta certa manda.
 */
const NIGHT_IN_SAO_PAULO = new Date('2026-10-05T00:03:00.000Z');
/** O dia de calendário que aquele instante É, no fuso da Maria. */
const HER_DAY = '2026-10-04';

interface Scenario {
  deps: DispatchDeps;
  settings: SettingsRepositoryFake;
  memberships: MembershipRepositoryFake;
  books: BookRepositoryFake;
  planItems: ReadingPlanItemRepositoryFake;
  readingLogs: ReadingLogRepositoryFake;
  pushSubscriptions: PushSubscriptionRepositoryFake;
  deliveries: NotificationDeliveryRepositoryFake;
  sender: PushSenderFake;
}

/**
 * O cenário feliz, montado por FACTORY (§7.7): a Maria, num clube, com um
 * livro, com o plano do dia dela, com um aparelho inscrito, com o lembrete
 * ligado para as 21:00 e sem ter lido ainda.
 *
 * Cada teste muda **uma** peça, e é isso que faz o vermelho apontar para a
 * regra e não para o cenário.
 */
async function aScenario(): Promise<Scenario> {
  const settings = new SettingsRepositoryFake();
  const memberships = new MembershipRepositoryFake();
  const books = new BookRepositoryFake();
  const planItems = new ReadingPlanItemRepositoryFake();
  const readingLogs = new ReadingLogRepositoryFake();
  const pushSubscriptions = new PushSubscriptionRepositoryFake();
  const deliveries = new NotificationDeliveryRepositoryFake();
  const sender = new PushSenderFake();

  await settings.save(
    aSettings({
      userId: MARIA,
      timezone: SAO_PAULO,
      reminderTime: '21:00',
      reminderEnabled: true,
    }),
  );
  await memberships.save(aMembership({ userId: MARIA, clubId: CLUB }));
  await books.save(aBook({ id: BOOK, clubId: CLUB }));
  await planItems.saveMany([
    aPlanItem({
      id: 'dia-4',
      bookId: BOOK,
      date: HER_DAY,
      title: 'Cap. 3 — A promessa',
    }),
  ]);
  await pushSubscriptions.save(
    aPushSubscription({ userId: MARIA, endpoint: 'https://push.test/maria' }),
  );

  return {
    deps: {
      settings,
      memberships,
      books,
      planItems,
      readingLogs,
      pushSubscriptions,
      deliveries,
      sender,
    },
    settings,
    memberships,
    books,
    planItems,
    readingLogs,
    pushSubscriptions,
    deliveries,
    sender,
  };
}

describe('dispatchDueNotifications', () => {
  it('sends the reminder of the day to the person who asked for it', async () => {
    const s = await aScenario();

    const result = await dispatchDueNotifications(s.deps, {
      now: NIGHT_IN_SAO_PAULO,
    });

    expect(result).toEqual({
      considered: 1,
      sent: 1,
      disabled: 0,
      skipped: 0,
    });
    expect(s.sender.recipients).toEqual([MARIA]);
  });

  /**
   * ⚠️ **DECISÃO I — o dispatcher decide, o sender entrega: o payload sai
   * PRONTO.**
   *
   * E ele diz o trecho de hoje, no idioma DELA (decisão H), sem contar nada
   * (regra 15).
   */
  it('hands the sender a ready payload, with the topic of the day and her language', async () => {
    const s = await aScenario();
    await s.settings.save(
      aSettings({
        userId: MARIA,
        timezone: SAO_PAULO,
        reminderTime: '21:00',
        locale: 'en',
      }),
    );

    await dispatchDueNotifications(s.deps, { now: NIGHT_IN_SAO_PAULO });

    expect(s.sender.sends).toEqual([
      {
        userId: MARIA,
        payload: {
          title: "Today's reading",
          body: 'Cap. 3 — A promessa',
          tag: 'reading_reminder',
          url: `/books/${BOOK}`,
        },
      },
    ]);
  });

  /**
   * ⚠️ **REGRA 2 — UM RELÓGIO SÓ, PROVADO CONTANDO LEITURAS.**
   *
   * `expect(a).toEqual(b)` sobre dois instantes **não prova nada**: duas
   * chamadas a `new Date()` no mesmo tick devolvem o mesmo milissegundo, e o
   * mutante "um `new Date()` por uso" passaria em 1206/1206 (§7.8, medido na
   * Tarefa 22). O acusador é o **contador**.
   *
   * ⚠️ E num dispatcher a propriedade vale mais que no resto do projeto: com
   * duas leituras, alguém perto da virada da janela entra pela primeira
   * (`isInsideWindow`) e sai pela segunda (o `localDate` do claim, ou o dia do
   * plano) — e o lembrete some sem erro nenhum.
   *
   * O relógio do teste **anda 1 s a cada leitura**, então duas leituras não são
   * só contadas: elas produzem valores diferentes.
   */
  it('reads the clock exactly ONCE, for the whole pass', async () => {
    const s = await aScenario();
    const clock = installAdvancingClock();
    try {
      // O `advancing-clock` começa em 2026-04-01T12:00:00Z → 09:00 em São
      // Paulo. O cenário é reescrito para aquele dia e aquele horário.
      await s.settings.save(
        aSettings({
          userId: MARIA,
          timezone: SAO_PAULO,
          reminderTime: '09:00',
        }),
      );
      await s.planItems.saveMany([
        aPlanItem({ id: 'dia-abril', bookId: BOOK, date: '2026-04-01' }),
      ]);

      // SEM `now`: é o padrão que tem de ler o relógio, e uma vez só.
      const result = await dispatchDueNotifications(s.deps);

      expect(result.sent).toBe(1);
      expect(clock.reads).toBe(1);
      // E o instante que foi parar no claim é EXATAMENTE a primeira leitura —
      // derivado de uma constante, não do código sob teste (§7.8).
      expect(s.deliveries.claimed[0]?.deliveredAt.getTime()).toBe(clock.at(1));
    } finally {
      clock.restore();
    }
  });

  /**
   * ⚠️ **DECISÃO C — a varredura começa pelo `Settings` com `reminderEnabled`,
   * e ela vai AO BANCO com o filtro.**
   *
   * Quem não quer lembrete não deve nem ser **considerado**: o `considered` não
   * o conta. E a propriedade é provada pelo `findFilters` (§7.3), não pelo
   * resultado — carregar todo mundo e filtrar em memória daria o mesmo número.
   */
  it('starts the scan from reminderEnabled, asking the repository for it', async () => {
    const s = await aScenario();
    await s.settings.save(
      aSettings({ userId: MARCOS, reminderEnabled: false }),
    );

    const result = await dispatchDueNotifications(s.deps, {
      now: NIGHT_IN_SAO_PAULO,
    });

    expect(result.considered).toBe(1);
    expect(s.settings.findFilters).toEqual([{ reminderEnabled: true }]);
  });

  describe('the window', () => {
    /**
     * ⚠️ **OS QUATRO LIMITES, vistos de ponta a ponta.** O `isInsideWindow` tem
     * os seus (`reminder-window.test.ts`); estes provam que o dispatcher usa a
     * janela de verdade, no fuso da pessoa, e que fora dela **nada** acontece.
     *
     * 21:00 em São Paulo é 00:00Z do dia seguinte.
     */
    it.each([
      ['a minute before', '2026-10-04T23:59:00.000Z', 0],
      ['at the exact minute', '2026-10-05T00:00:00.000Z', 1],
      ['at the last minute of the window', '2026-10-05T00:09:00.000Z', 1],
      ['the first minute after', '2026-10-05T00:10:00.000Z', 0],
    ])('sends %s: %s', async (_label, instant, expected) => {
      const s = await aScenario();

      const result = await dispatchDueNotifications(s.deps, {
        now: new Date(instant),
      });

      expect(result.sent).toBe(expected);
      expect(s.sender.sendCalls).toBe(expected);
    });

    it('honours a windowMinutes given by the caller', async () => {
      const s = await aScenario();

      // Com janela de 2 minutos, o minuto 5 já está fora.
      await expect(
        dispatchDueNotifications(s.deps, {
          now: new Date('2026-10-05T00:05:00.000Z'),
          windowMinutes: 2,
        }),
      ).resolves.toMatchObject({ sent: 0, skipped: 1 });
    });

    /**
     * ⚠️ **FORA DA JANELA, NADA É LIDO DO CLUBE** — e isso não é desempenho, é
     * a regra de tenant do §7.3: *"todo corte precisa de um `xxxCalls === 0`"*.
     * O plano de um livro é conteúdo do clube, e o dispatcher não tem por que
     * tocá-lo para quem não está na hora.
     */
    it('touches no club content at all for somebody outside the window', async () => {
      const s = await aScenario();

      await dispatchDueNotifications(s.deps, {
        now: new Date('2026-10-04T15:00:00.000Z'),
      });

      expect(s.planItems.findCalls).toBe(0);
      expect(s.deliveries.claimCalls).toBe(0);
      expect(s.sender.sendCalls).toBe(0);
    });

    /**
     * ⚠️ **FUSO CORROMPIDO: a pessoa fica SEM lembrete, e a passada CONTINUA.**
     *
     * Um lembrete na hora errada é o oposto do §1 do plano; e uma exceção aqui
     * mataria o lembrete de todo mundo por causa de uma linha. O Marcos entra
     * com fuso quebrado e a Maria continua recebendo.
     */
    it('skips a broken timezone without killing the pass', async () => {
      const s = await aScenario();
      await s.settings.save(
        aSettings({
          userId: MARCOS,
          timezone: 'America/Sao Paulo',
          reminderTime: '21:00',
        }),
      );

      const result = await dispatchDueNotifications(s.deps, {
        now: NIGHT_IN_SAO_PAULO,
      });

      expect(result).toEqual({
        considered: 2,
        sent: 1,
        disabled: 0,
        skipped: 1,
      });
      expect(s.sender.recipients).toEqual([MARIA]);
    });
  });

  /**
   * ⚠️ **REGRA 7 — HORÁRIO DE VERÃO, e ele não é hipótese.**
   *
   * `America/New_York` ainda tem DST, e 2026 traz os dois casos.
   */
  describe('daylight saving time', () => {
    async function aReaderInNewYork(
      reminderTime: string,
      day: string,
    ): Promise<Scenario> {
      const s = await aScenario();
      await s.settings.save(
        aSettings({ userId: MARIA, timezone: NEW_YORK, reminderTime }),
      );
      await s.planItems.saveMany([
        aPlanItem({ id: `dia-${day}`, bookId: BOOK, date: day }),
      ]);
      return s;
    }

    /**
     * ⚠️ **A HORA QUE NÃO EXISTE.** Em 2026-03-08 Nova York pula das 01:59 EST
     * para as 03:00 EDT: nenhum instante tem 02:15 como hora local ali.
     *
     * Quem marcou o lembrete para 02:15 **não é lembrado naquele dia**, e não há
     * conserto honesto — a hora não aconteceu. O que não pode acontecer é o
     * oposto: o lembrete sair às 03:15 porque alguém "normalizou" a hora.
     *
     * A varredura é do dia inteiro, minuto a minuto de UTC: nenhuma passada
     * possível do cron manda.
     */
    it('never fires on the day the clock skips the chosen hour', async () => {
      const s = await aReaderInNewYork('02:15', '2026-03-08');

      let sent = 0;
      for (let minute = 0; minute < 24 * 60; minute += 1) {
        const result = await dispatchDueNotifications(s.deps, {
          now: new Date(Date.UTC(2026, 2, 8, 0, minute)),
        });
        sent += result.sent;
      }

      expect(sent).toBe(0);
      expect(s.sender.sendCalls).toBe(0);
    });

    /**
     * ⚠️ **O ANTÍDOTO do teste acima** (§7.4): uma implementação que nunca
     * mandasse passaria nele. No **mesmo dia**, com o horário movido para uma
     * hora que existe, o lembrete sai.
     */
    it('still fires on that same day for an hour that DOES exist', async () => {
      const s = await aReaderInNewYork('09:15', '2026-03-08');

      let sent = 0;
      for (let minute = 0; minute < 24 * 60; minute += 1) {
        const result = await dispatchDueNotifications(s.deps, {
          now: new Date(Date.UTC(2026, 2, 8, 0, minute)),
        });
        sent += result.sent;
      }

      expect(sent).toBe(1);
    });

    /**
     * ⚠️ **A HORA QUE ACONTECE DUAS VEZES — e quem impede o lembrete dobrado é
     * o CLAIM, não a janela.**
     *
     * Em 2026-11-01 Nova York volta das 02:00 EDT para as 01:00 EST: a hora da
     * 01 acontece inteira, duas vezes, com uma hora de mundo entre as duas. A
     * janela casa **as duas vezes** — e é isso que o teste mostra, junto com o
     * claim recusando a segunda.
     *
     * O dia local é o MESMO nas duas (`2026-11-01`), e é por isso que a chave
     * `(userId, kind, localDate)` funciona aqui sem saber nada de fuso.
     */
    it('sends ONE reminder on the day the clock falls back and the window matches twice', async () => {
      const s = await aReaderInNewYork('01:05', '2026-11-01');

      const firstPass = await dispatchDueNotifications(s.deps, {
        now: new Date('2026-11-01T05:05:00.000Z'), // 01:05 EDT
      });
      const secondPass = await dispatchDueNotifications(s.deps, {
        now: new Date('2026-11-01T06:05:00.000Z'), // 01:05 EST, uma hora depois
      });

      // A janela casou NAS DUAS: as duas pediram reserva.
      expect(s.deliveries.claimCalls).toBe(2);
      // ...e o claim só concedeu UMA.
      expect(firstPass.sent).toBe(1);
      expect(secondPass.sent).toBe(0);
      expect(secondPass.skipped).toBe(1);
      expect(s.sender.sendCalls).toBe(1);
      expect(s.deliveries.claimed).toHaveLength(1);
      expect(s.deliveries.claimed[0]?.localDate).toBe('2026-11-01');
    });
  });

  /**
   * ⚠️ **REGRA 8 — A SUPRESSÃO ANTI-CULPA, ponta a ponta: o app não cobra quem
   * já fez.**
   *
   * E ela vem **antes** do claim: quem já leu não gasta a reserva do dia. Se
   * gastasse, um "desmarquei sem querer" às 21:01 calaria o lembrete de um dia
   * que a pessoa ainda não leu.
   */
  it('never reminds somebody who already registered today’s reading', async () => {
    const s = await aScenario();
    await s.readingLogs.save(
      aReadingLog({ planItemId: 'dia-4', userId: MARIA, bookId: BOOK }),
    );

    const result = await dispatchDueNotifications(s.deps, {
      now: NIGHT_IN_SAO_PAULO,
    });

    expect(result).toEqual({
      considered: 1,
      sent: 0,
      disabled: 0,
      skipped: 1,
    });
    expect(s.sender.sendCalls).toBe(0);
    // ⚠️ E a reserva do dia NÃO foi gasta: quem já leu não consome o claim.
    expect(s.deliveries.claimCalls).toBe(0);
  });

  /**
   * ⚠️ **REGRA 9 / DECISÃO B — sem plano para hoje, `skipped` SILENCIOSO.**
   *
   * É o estado normal do clube entre dois livros: não é erro, não vira log de
   * erro, e não sai lembrete vazio.
   */
  it('sends nothing, silently, when there is no reading for today', async () => {
    const s = await aScenario();
    await s.planItems.replaceForBook(BOOK, {
      upsert: [],
      removeIds: ['dia-4'],
    });

    const result = await dispatchDueNotifications(s.deps, {
      now: NIGHT_IN_SAO_PAULO,
    });

    expect(result).toEqual({
      considered: 1,
      sent: 0,
      disabled: 0,
      skipped: 1,
    });
    expect(s.sender.sendCalls).toBe(0);
    expect(s.deliveries.claimCalls).toBe(0);
  });

  /**
   * ⚠️ **DECISÃO C, segunda metade: a inscrição ativa é o SEGUNDO filtro.**
   *
   * Quem quer o lembrete mas não tem aparelho é **considerado** (a vontade dela
   * está declarada) e depois pulado por condição técnica. E a reserva do dia
   * **não é gasta** — senão o dia em que ela instalasse o app às 21:05
   * continuaria sem lembrete até amanhã.
   */
  it('skips somebody with no active device, without spending the claim', async () => {
    const s = await aScenario();
    // O aparelho dela existe, mas está DESLIGADO — e `byUserId` só devolve as
    // ativas (contrato do port, `NOTIFICACOES.md` §5).
    await s.pushSubscriptions.save(
      aPushSubscription({
        userId: MARIA,
        endpoint: 'https://push.test/maria',
        disabledAt: new Date('2026-10-01T00:00:00.000Z'),
      }),
    );

    const result = await dispatchDueNotifications(s.deps, {
      now: NIGHT_IN_SAO_PAULO,
    });

    expect(result).toEqual({
      considered: 1,
      sent: 0,
      disabled: 0,
      skipped: 1,
    });
    expect(s.deliveries.claimCalls).toBe(0);
    expect(s.sender.sendCalls).toBe(0);
  });

  describe('the claim comes BEFORE the send (decision E)', () => {
    /**
     * ⚠️ **REGRA 10 — provado por CONTAGEM: com o claim recusando, o sender
     * recebe ZERO chamadas.**
     *
     * Se o envio viesse primeiro, uma falha entre enviar e gravar faria a
     * próxima passada **enviar de novo** — e num app cujo §1 é "não virar
     * cobrança", repetir é o erro caro. Claim primeiro significa que a pior
     * falha possível é um lembrete **perdido**, não um **repetido**.
     */
    it('calls the sender ZERO times when the claim is refused', async () => {
      const s = await aScenario();
      // Alguém (a passada anterior, ou a outra instância) já reservou o dia.
      await s.deliveries.claim({
        id: 'reserva-de-outro-processo',
        userId: MARIA,
        kind: 'READING_REMINDER',
        localDate: HER_DAY,
        deliveredAt: new Date('2026-10-05T00:01:00.000Z'),
      });

      const result = await dispatchDueNotifications(s.deps, {
        now: NIGHT_IN_SAO_PAULO,
      });

      expect(s.sender.sendCalls).toBe(0);
      expect(result).toMatchObject({ considered: 1, sent: 0, skipped: 1 });
    });

    /**
     * ⚠️ **O INVERSO, e ele é deliberado: um envio que FALHA não desfaz o
     * claim.** O lembrete daquele dia está gasto.
     *
     * A prova é a segunda passada, dentro da mesma janela: o sender não é
     * chamado de novo. Sem esta metade, "não desfaz" seria só uma frase no
     * comentário.
     */
    it('does not undo the claim when the send fails', async () => {
      const s = await aScenario();
      s.sender.failsFor(MARIA);

      const first = await dispatchDueNotifications(s.deps, {
        now: NIGHT_IN_SAO_PAULO,
      });
      const second = await dispatchDueNotifications(s.deps, {
        now: new Date('2026-10-05T00:06:00.000Z'),
      });

      expect(first).toMatchObject({ sent: 0, skipped: 1 });
      expect(s.deliveries.claimed).toHaveLength(1);
      // A segunda passada nem tenta: a reserva do dia já foi gasta.
      expect(second).toMatchObject({ sent: 0, skipped: 1 });
      expect(s.sender.sendCalls).toBe(1);
    });

    /**
     * E uma falha de uma pessoa **não derruba a passada**: a fila continua. É o
     * que separa "um roteador caiu" de "ninguém foi lembrado hoje".
     */
    it('keeps going through the queue when one person’s send blows up', async () => {
      const s = await aScenario();
      await s.settings.save(
        aSettings({
          userId: MARCOS,
          timezone: SAO_PAULO,
          reminderTime: '21:00',
        }),
      );
      await s.memberships.save(aMembership({ userId: MARCOS, clubId: CLUB }));
      await s.pushSubscriptions.save(
        aPushSubscription({
          userId: MARCOS,
          endpoint: 'https://push.test/marcos',
        }),
      );
      s.sender.failsFor(MARIA);

      const result = await dispatchDueNotifications(s.deps, {
        now: NIGHT_IN_SAO_PAULO,
      });

      expect(result).toEqual({
        considered: 2,
        sent: 1,
        disabled: 0,
        skipped: 1,
      });
      expect(s.sender.recipients.sort()).toEqual([MARCOS, MARIA].sort());
    });
  });

  describe('the four counters close the account (rule 14)', () => {
    /**
     * ⚠️ **`considered = sent + skipped`, com TODOS os motivos de pulo
     * exercitados de uma vez.**
     *
     * Contador que não fecha é contador que mente no log do dono — e o log
     * deste script é a única coisa que o dono vê de uma peça que roda sozinha.
     *
     * Cinco pessoas, cinco destinos: uma recebe, uma já leu (supressão), uma não
     * tem plano hoje, uma está fora da janela e uma não tem aparelho.
     */
    it('adds up with every skip reason at once', async () => {
      const s = await aScenario();

      // 2. já leu
      const READ = 'user-ja-leu';
      await s.settings.save(
        aSettings({ userId: READ, timezone: SAO_PAULO, reminderTime: '21:00' }),
      );
      await s.memberships.save(aMembership({ userId: READ, clubId: CLUB }));
      await s.pushSubscriptions.save(
        aPushSubscription({ userId: READ, endpoint: 'https://push.test/leu' }),
      );
      await s.readingLogs.save(
        aReadingLog({ planItemId: 'dia-4', userId: READ, bookId: BOOK }),
      );

      // 3. sem plano hoje (clube próprio, livro sem o dia)
      const NO_PLAN = 'user-sem-plano';
      await s.settings.save(
        aSettings({
          userId: NO_PLAN,
          timezone: SAO_PAULO,
          reminderTime: '21:00',
        }),
      );
      await s.memberships.save(
        aMembership({ userId: NO_PLAN, clubId: 'club-vazio' }),
      );
      await s.books.save(aBook({ id: 'book-vazio', clubId: 'club-vazio' }));
      await s.pushSubscriptions.save(
        aPushSubscription({
          userId: NO_PLAN,
          endpoint: 'https://push.test/sem-plano',
        }),
      );

      // 4. fora da janela (mesmo clube, outro horário)
      const OUTSIDE = 'user-fora-da-janela';
      await s.settings.save(
        aSettings({
          userId: OUTSIDE,
          timezone: SAO_PAULO,
          reminderTime: '07:00',
        }),
      );
      await s.memberships.save(aMembership({ userId: OUTSIDE, clubId: CLUB }));
      await s.pushSubscriptions.save(
        aPushSubscription({
          userId: OUTSIDE,
          endpoint: 'https://push.test/fora',
        }),
      );

      // 5. sem aparelho
      const NO_DEVICE = 'user-sem-aparelho';
      await s.settings.save(
        aSettings({
          userId: NO_DEVICE,
          timezone: SAO_PAULO,
          reminderTime: '21:00',
        }),
      );
      await s.memberships.save(
        aMembership({ userId: NO_DEVICE, clubId: CLUB }),
      );

      const result = await dispatchDueNotifications(s.deps, {
        now: NIGHT_IN_SAO_PAULO,
      });

      expect(result).toEqual({
        considered: 5,
        sent: 1,
        disabled: 0,
        skipped: 4,
      });
      expect(result.sent + result.skipped).toBe(result.considered);
      expect(s.sender.recipients).toEqual([MARIA]);
    });

    /**
     * ⚠️ **O `disabled` é contador de APARELHO, e por isso ele NÃO entra na
     * conta de pessoas — a documentação disso é este teste.**
     *
     * `NOTIFICACOES.md` §5: o envio devolve `{ sent, disabled }`, e `disabled`
     * são as inscrições que morreram (a pessoa desinstalou, o navegador limpou
     * tudo). Uma pessoa com três aparelhos e dois mortos é **uma** pessoa
     * lembrada e **dois** aparelhos desligados — somá-los num contador só faria
     * o log do dono dizer que cinco pessoas foram lembradas.
     */
    it('sums the devices the sender disabled, without breaking the person count', async () => {
      const s = await aScenario();
      s.sender.answersFor(MARIA, { sent: 1, disabled: 2 });

      const result = await dispatchDueNotifications(s.deps, {
        now: NIGHT_IN_SAO_PAULO,
      });

      expect(result).toEqual({
        considered: 1,
        sent: 1,
        disabled: 2,
        skipped: 0,
      });
      expect(result.sent + result.skipped).toBe(result.considered);
    });

    /**
     * ⚠️ **Todos os aparelhos mortos: ela NÃO conta como lembrada.**
     *
     * `sent` é "recebeu", não "tentei". Contá-la como lembrada faria o log
     * afirmar uma entrega que não aconteceu — e a reserva do dia continua gasta,
     * que é a consequência deliberada da decisão E.
     */
    it('counts as skipped when every device of the person was dead', async () => {
      const s = await aScenario();
      s.sender.answersFor(MARIA, { sent: 0, disabled: 1 });

      const result = await dispatchDueNotifications(s.deps, {
        now: NIGHT_IN_SAO_PAULO,
      });

      expect(result).toEqual({
        considered: 1,
        sent: 0,
        disabled: 1,
        skipped: 1,
      });
      expect(s.deliveries.claimed).toHaveLength(1);
    });
  });

  /**
   * ⚠️ **DUAS PASSADAS SEGUIDAS DENTRO DA MESMA JANELA MANDAM UMA VEZ.**
   *
   * É o caso para que a janela é MAIOR que o intervalo do cron (decisão D): ela
   * absorve o atraso, e o claim é quem garante que absorver não vira duplicar.
   */
  it('sends once even when the cron runs twice inside the same window', async () => {
    const s = await aScenario();

    const first = await dispatchDueNotifications(s.deps, {
      now: new Date('2026-10-05T00:01:00.000Z'),
    });
    const second = await dispatchDueNotifications(s.deps, {
      now: new Date('2026-10-05T00:06:00.000Z'),
    });

    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect(s.sender.sendCalls).toBe(1);
  });

  /**
   * ⚠️ **E O LEMBRETE DE AMANHÃ SAI.** Sem esta metade, "manda uma vez" poderia
   * ser "manda uma vez e nunca mais" — que é a forma de a idempotência ficar
   * larga demais, e a mais difícil de notar em produção.
   */
  it('reminds again the next day', async () => {
    const s = await aScenario();
    await s.planItems.saveMany([
      aPlanItem({ id: 'dia-5', bookId: BOOK, date: '2026-10-05' }),
    ]);

    await dispatchDueNotifications(s.deps, {
      now: new Date('2026-10-05T00:01:00.000Z'), // 21:01 do dia 4, em SP
    });
    const tomorrow = await dispatchDueNotifications(s.deps, {
      now: new Date('2026-10-06T00:01:00.000Z'), // 21:01 do dia 5, em SP
    });

    expect(tomorrow.sent).toBe(1);
    expect(s.deliveries.claimed.map((row) => row.localDate).sort()).toEqual([
      '2026-10-04',
      '2026-10-05',
    ]);
  });

  /**
   * ⚠️ **O CLAIM É POR PESSOA, e o dia é o DELA.** Duas pessoas em fusos
   * diferentes no mesmo instante têm chaves diferentes — é a decisão F, e é o
   * que quebraria se o `localDate` fosse um instante ou uma `DATE` em UTC.
   *
   * `2026-10-05T00:03Z` é dia **4** em São Paulo e dia **5** em Tóquio.
   */
  it('gives each person a claim in HER OWN calendar day', async () => {
    const s = await aScenario();
    const TOKYO = 'user-toquio';
    await s.settings.save(
      aSettings({
        userId: TOKYO,
        timezone: 'Asia/Tokyo',
        reminderTime: '09:00',
      }),
    );
    await s.memberships.save(aMembership({ userId: TOKYO, clubId: CLUB }));
    await s.pushSubscriptions.save(
      aPushSubscription({
        userId: TOKYO,
        endpoint: 'https://push.test/toquio',
      }),
    );
    await s.planItems.saveMany([
      aPlanItem({ id: 'dia-5', bookId: BOOK, date: '2026-10-05' }),
    ]);

    const result = await dispatchDueNotifications(s.deps, {
      now: NIGHT_IN_SAO_PAULO,
    });

    expect(result.sent).toBe(2);
    const byUser = Object.fromEntries(
      s.deliveries.claimed.map((row) => [row.userId, row.localDate]),
    );
    expect(byUser).toEqual({ [MARIA]: '2026-10-04', [TOKYO]: '2026-10-05' });
  });

  it('sends nothing at all when nobody asked to be reminded', async () => {
    const s = await aScenario();
    s.deps.settings = new SettingsRepositoryFake();

    await expect(
      dispatchDueNotifications(s.deps, { now: NIGHT_IN_SAO_PAULO }),
    ).resolves.toEqual({ considered: 0, sent: 0, disabled: 0, skipped: 0 });
  });
});
