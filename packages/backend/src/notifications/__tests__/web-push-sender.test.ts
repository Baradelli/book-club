import { beforeEach, describe, expect, it } from 'vitest';
import { WebPushError } from 'web-push';

import { aPushSubscription, required } from '../../test-support/builders';
import { generateEphemeralVapidKeys } from '../../test-support/ephemeral-vapid-keys';
import { PushSubscriptionRepositoryFake } from '../../usecases/_fakes/push-subscription-repository-fake';
import type { PushPayload } from '../../usecases/ports/push-sender';
import type { VapidConfig } from '../vapid';
import type { WebPushClient, WebPushRequest } from '../web-push-sender';
import { isDeadSubscription, WebPushSender } from '../web-push-sender';

/**
 * ⚠️ **A ÚNICA PEÇA DO PROJETO QUE PRODUZ EFEITO FORA DA MÁQUINA — e ela é
 * testada contra um DUBLÊ.**
 *
 * Nenhum teste deste arquivo abre socket, e nenhum usa chave real: o par VAPID
 * vem do `test-support/ephemeral-vapid-keys.ts`, que sorteia um em memória e o
 * descarta. Quem vê push chegando num celular é o **dono**, pelo roteiro do
 * `docs/COMO-TESTAR.md`.
 */

/** O dublê: guarda a chamada inteira e responde o que o teste mandar. */
class WebPushClientDouble implements WebPushClient {
  calls: WebPushRequest[] = [];
  private readonly failures = new Map<string, unknown>();

  async sendNotification(request: WebPushRequest): Promise<void> {
    this.calls.push({
      subscription: {
        endpoint: request.subscription.endpoint,
        keys: { ...request.subscription.keys },
      },
      payload: request.payload,
      options: { ...request.options },
    });

    const failure = this.failures.get(request.subscription.endpoint);
    if (failure !== undefined) throw failure;
  }

  failsFor(endpoint: string, error: unknown): void {
    this.failures.set(endpoint, error);
  }
}

/** Um `WebPushError` de verdade — a classe do pacote, sem uma linha de rede. */
function aWebPushError(statusCode: number, endpoint: string): WebPushError {
  return new WebPushError(
    'push service said no',
    statusCode,
    {},
    'body',
    endpoint,
  );
}

const MARIA_ID = 'user-maria';
const APARELHO_1 = 'https://push.test/aparelho-1';
const APARELHO_2 = 'https://push.test/aparelho-2';

function aPayload(overrides: Partial<PushPayload> = {}): PushPayload {
  return {
    title: 'O clube está lendo',
    body: 'Alguém do clube escreveu uma anotação.',
    tag: 'group_activity',
    url: '/books/book-1',
    ...overrides,
  };
}

describe('WebPushSender', () => {
  let subscriptions: PushSubscriptionRepositoryFake;
  let client: WebPushClientDouble;
  let vapid: VapidConfig;
  let sender: WebPushSender;

  beforeEach(async () => {
    subscriptions = new PushSubscriptionRepositoryFake();
    client = new WebPushClientDouble();
    // ⚠️ Par descartável, sorteado agora. Nenhuma chave real entra aqui.
    const keys = generateEphemeralVapidKeys();
    vapid = { ...keys, subject: 'mailto:clube@exemplo.test' };
    sender = new WebPushSender(subscriptions, vapid, client);

    await subscriptions.save(
      aPushSubscription({ userId: MARIA_ID, endpoint: APARELHO_1 }),
    );
    await subscriptions.save(
      aPushSubscription({ userId: MARIA_ID, endpoint: APARELHO_2 }),
    );
  });

  /**
   * ⚠️ **REGRA 7 — as inscrições vêm do REPOSITÓRIO (`byUserId`), nunca de um
   * `$queryRaw`**, e o port já filtra `disabledAt IS NULL`. O contador prova
   * que a leitura aconteceu por ali (§7.3).
   */
  it('sends to every active device of the person, loaded through the repository', async () => {
    const result = await sender.send(MARIA_ID, aPayload());

    expect(subscriptions.byUserIdCalls).toBe(1);
    expect(result).toEqual({ sent: 2, disabled: 0 });
    expect(
      client.calls.map((call) => call.subscription.endpoint).sort(),
    ).toEqual([APARELHO_1, APARELHO_2]);
  });

  /** Um aparelho desligado não recebe — e quem o corta é o port, não este laço. */
  it('never sends to a subscription that was disabled', async () => {
    await subscriptions.save(
      aPushSubscription({
        userId: MARIA_ID,
        endpoint: 'https://push.test/desligado',
        disabledAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    );

    await sender.send(MARIA_ID, aPayload());

    expect(
      client.calls.map((call) => call.subscription.endpoint),
    ).not.toContain('https://push.test/desligado');
  });

  /** Ninguém com aparelho nenhum: zero chamadas, e um resultado honesto. */
  it('says {sent: 0, disabled: 0} for someone with no device, without calling out', async () => {
    const result = await sender.send('user-sem-aparelho', aPayload());

    expect(result).toEqual({ sent: 0, disabled: 0 });
    expect(client.calls).toHaveLength(0);
  });

  /**
   * ⚠️ **O PAYLOAD VAI COMO JSON, e com os QUATRO campos — nem um a mais.**
   *
   * É o que o `push-handler.js` lê (`NOTIFICACOES.md` §2), e é a fronteira em
   * que "o push nunca leva o conteúdo" (§1) deixa de ser regra de código e vira
   * bytes na rede.
   */
  it('serialises the payload as JSON, with the four fields the handler reads', async () => {
    await sender.send(MARIA_ID, aPayload({ tag: 'group_activity' }));

    const call = required(client.calls[0]);
    expect(JSON.parse(call.payload)).toEqual({
      title: 'O clube está lendo',
      body: 'Alguém do clube escreveu uma anotação.',
      tag: 'group_activity',
      url: '/books/book-1',
    });
  });

  /**
   * As credenciais do aparelho e as opções do §5 — `TTL 43200`,
   * `urgency: 'normal'`, o `topic` igual ao `tag`, e o `vapidDetails`.
   */
  it('passes the device credentials and the options of NOTIFICACOES.md §5', async () => {
    await sender.send(MARIA_ID, aPayload());

    const call = required(client.calls[0]);
    expect(call.subscription.keys).toEqual({
      p256dh: 'fake-p256dh',
      auth: 'fake-auth',
    });
    expect(call.options.TTL).toBe(43200);
    expect(call.options.urgency).toBe('normal');
    expect(call.options.topic).toBe('group_activity');
    expect(call.options.vapidDetails).toEqual(vapid);
  });

  /**
   * O `Topic` do Web Push tem **32 caracteres**, e um `tag` maior seria recusado
   * pelo serviço de push — o §5 já escreve o `.slice(0, 32)`.
   */
  it('truncates the topic at 32 characters, as the protocol requires', async () => {
    await sender.send(MARIA_ID, aPayload({ tag: 'a'.repeat(50) }));

    expect(required(client.calls[0]).options.topic).toBe('a'.repeat(32));
  });

  describe('a dead subscription (NOTIFICACOES.md §5)', () => {
    /**
     * ⚠️ **REGRA 9 — 404 e 410 DESATIVAM**: a pessoa desinstalou o app ou
     * limpou o navegador. A desativação é **soft** (`disabledAt`), pelo
     * `update` do port — e a asserção é sobre a **linha gravada**, não sobre o
     * contador: um `disabled: 1` com nada escrito no banco faria o mesmo
     * aparelho morto ser tentado para sempre.
     */
    it.each([[404], [410]])(
      'disables the subscription on a WebPushError %i, and keeps going',
      async (statusCode) => {
        client.failsFor(APARELHO_1, aWebPushError(statusCode, APARELHO_1));

        const result = await sender.send(MARIA_ID, aPayload());

        expect(result).toEqual({ sent: 1, disabled: 1 });
        const morto = required(
          subscriptions.saved.find((row) => row.endpoint === APARELHO_1),
        );
        expect(morto.disabledAt).toBeInstanceOf(Date);
        const vivo = required(
          subscriptions.saved.find((row) => row.endpoint === APARELHO_2),
        );
        expect(vivo.disabledAt).toBeNull();
      },
    );

    /**
     * ⚠️ **REGRA 9, O LIMITE — UM 500 DO SERVIÇO DE PUSH NÃO DESLIGA A
     * INSCRIÇÃO DE NINGUÉM.**
     *
     * É a metade que o `NOTIFICACOES.md` §5 grifa (*"falha de rede não deve
     * silenciosamente desligar a inscrição de alguém"*), e é a que um
     * `catch (e) { disable() }` ingênuo destruiria: um dia ruim do serviço de
     * push apagaria os aparelhos do clube inteiro, em silêncio, e ninguém
     * voltaria a receber nada até se reinscrever à mão.
     */
    it.each([[500], [429], [400], [401]])(
      'rethrows a WebPushError %i and disables nobody',
      async (statusCode) => {
        client.failsFor(APARELHO_1, aWebPushError(statusCode, APARELHO_1));

        await expect(sender.send(MARIA_ID, aPayload())).rejects.toBeInstanceOf(
          WebPushError,
        );

        expect(subscriptions.updateCalls).toBe(0);
        for (const row of subscriptions.saved) {
          expect(row.disabledAt).toBeNull();
        }
      },
    );

    /** Erro sem `statusCode` nenhum — o roteador caiu — também sobe. */
    it('rethrows a plain network error, and disables nobody', async () => {
      client.failsFor(APARELHO_1, new Error('ECONNREFUSED'));

      await expect(sender.send(MARIA_ID, aPayload())).rejects.toThrow(
        'ECONNREFUSED',
      );

      expect(subscriptions.updateCalls).toBe(0);
    });

    /**
     * ⚠️ **DECISÃO H — O CASO MISTO: DESATIVA E RELANÇA (a saída (a) do
     * port).**
     *
     * Dois aparelhos, dois problemas na MESMA chamada: um morto (410) e um
     * estourando rede. A pergunta que a Tarefa 37 deixou em aberto é o que o
     * chamador vê — e a resposta é: **a exceção**, com a desativação já
     * gravada. O efeito que importa (o aparelho morto sai da lista) aconteceu;
     * a contagem `disabled` daquela passada se perde, e isso é o preço, não um
     * descuido.
     *
     * A saída (b) — colecionar e devolver — preservaria o número ao custo de
     * apagar do chamador a diferença entre "entregou a todos" e "um aparelho
     * ficou sem"; e um terceiro contador seria mudança de contrato.
     */
    it('deactivates the dead one and STILL rethrows when both happen at once', async () => {
      client.failsFor(APARELHO_1, aWebPushError(410, APARELHO_1));
      client.failsFor(APARELHO_2, new Error('ECONNREFUSED'));

      await expect(sender.send(MARIA_ID, aPayload())).rejects.toThrow(
        'ECONNREFUSED',
      );

      // O efeito no banco ACONTECEU, ainda que o número não tenha chegado a
      // ninguém: é exatamente isso que a decisão H escolhe.
      const morto = required(
        subscriptions.saved.find((row) => row.endpoint === APARELHO_1),
      );
      expect(morto.disabledAt).toBeInstanceOf(Date);
      expect(subscriptions.updateCalls).toBe(1);
    });
  });

  /**
   * ⚠️ **A FIDELIDADE DO DUBLÊ (§7.1), nos DOIS sentidos: o reconhecedor de
   * inscrição morta é medido contra a classe REAL do `web-push`.**
   *
   * `isDeadSubscription` é *duck typing* (`statusCode` 404/410), e não um
   * `instanceof WebPushError` — porque com `instanceof` o dublê teria de
   * construir a classe do pacote para exercitar o caminho, e um erro que o
   * serviço de push devolvesse com outra forma passaria batido. Estes casos são
   * o antídoto: eles provam que a forma que o pacote REALMENTE lança é a que o
   * reconhecedor pega.
   */
  it.each([
    [404, true],
    [410, true],
    [500, false],
    [429, false],
  ])('recognises a real WebPushError %i as dead=%s', (statusCode, dead) => {
    expect(isDeadSubscription(aWebPushError(statusCode, APARELHO_1))).toBe(
      dead,
    );
  });

  /**
   * ⚠️⚠️ **O OUTRO SENTIDO DA MESMA FIDELIDADE, E ELE FALTAVA — o acusador do
   * *duck typing*** (rodada de conserto da Tarefa 38).
   *
   * Os casos acima constroem a **classe** do pacote; os de baixo enumeram
   * formas **sem status**. Entre os dois havia um buraco do tamanho da decisão:
   * trocar o corpo do `isDeadSubscription` por
   * `if (!(error instanceof webPush.WebPushError)) return false;` passava
   * **1886/1886, ZERO acusadores**. Ou seja, o projeto tinha um comentário de
   * dez linhas explicando por que NÃO era `instanceof` e nenhuma linha
   * vermelha se alguém escrevesse `instanceof`.
   *
   * E o mutante **não é equivalente**: 410 chega com a FORMA e sem a classe por
   * caminhos que existem de verdade — um wrapper que reembrulha o erro, uma
   * versão do `web-push` que troque a hierarquia, uma segunda cópia do pacote
   * na árvore (`instanceof` compara identidade de classe, e duas cópias são
   * duas classes). Nesses casos o código de hoje desativa o aparelho morto e o
   * mutante o tenta para sempre.
   *
   * São estes os casos que dão razão ao comentário do `web-push-sender.ts` — e
   * sem eles o comentário era afirmação sobre uma medição que nunca houve
   * (§7.10).
   */
  it.each([
    ['404', { statusCode: 404 }],
    ['410', { statusCode: 410 }],
    ['410 com outros campos em volta', { statusCode: 410, body: 'gone' }],
  ])(
    'recognises the SHAPE of a dead subscription (%s) even without the class',
    (_label, thrown) => {
      expect(isDeadSubscription(thrown)).toBe(true);
    },
  );

  it.each([
    ['a plain error', new Error('boom')],
    ['a string', 'boom'],
    ['null', null],
    ['undefined', undefined],
    ['an object with no status', { message: 'boom' }],
    // ⚠️ O par negativo da forma: ter `statusCode` NÃO basta — o limite da
    // regra 9 (um 500 não desliga a inscrição de ninguém) vale também para o
    // erro que chega sem a classe.
    ['an object with a status that is not 404/410', { statusCode: 500 }],
  ])('never mistakes %s for a dead subscription', (_label, thrown) => {
    expect(isDeadSubscription(thrown)).toBe(false);
  });
});
