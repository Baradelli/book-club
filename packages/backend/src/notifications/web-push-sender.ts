import webPush from 'web-push';

import type {
  PushPayload,
  PushSender,
  PushSendResult,
} from '../usecases/ports/push-sender';
import type { PushSubscriptionRepository } from '../usecases/ports/push-subscription-repository';
import type { VapidConfig } from './vapid';

/**
 * ⚠️⚠️ **O ÚNICO PONTO DO PROJETO QUE PRODUZ EFEITO FORA DA MÁQUINA.**
 *
 * Daqui sai uma mensagem para o celular de uma pessoa, e é a razão de o
 * `PushSender` ter nascido como **port com fake** na Tarefa 37: tudo o que
 * decide (quem recebe, o que a frase diz, se hoje já foi) é testado sem que
 * nada saia daqui. Este arquivo é o adaptador — ele **entrega**, não decide
 * (decisão I da 37).
 *
 * ## O que ele NÃO faz, e cada ausência é uma regra
 *
 * - **Não monta frase.** O `PushPayload` chega pronto; se ele montasse, a regra
 *   anti-culpa (§1 do plano) ficaria dentro do adaptador de rede, onde nenhum
 *   teste de UseCase a alcança e onde a varredura do catálogo não a veria.
 * - **Não escolhe quem recebe.** Ele recebe um `userId` e manda para **todos os
 *   aparelhos ativos** dele. O leque é do `NotifyGroupActivity`; o horário é do
 *   dispatcher.
 * - **Não lê `process.env`.** A `VapidConfig` chega por construtor, como manda
 *   o `CLAUDE.md` — quem lê o ambiente é o `vapid.ts`, e num lugar só.
 * - **Não faz `$queryRaw`.** As inscrições vêm do **repositório** (regra 7 e
 *   `NOTIFICACOES.md` §5), que já filtra `disabledAt IS NULL`: um chamador que
 *   esquecesse o filtro mandaria push para um aparelho que pediu para não
 *   receber mais.
 */

/** A inscrição, na forma que o protocolo Web Push (e o `web-push`) espera. */
export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** As opções do `NOTIFICACOES.md` §5, mais o `vapidDetails` que assina. */
export interface WebPushOptions {
  TTL: number;
  /**
   * As quatro urgências do RFC 8030 §5.3, escritas por extenso e **não** como
   * `string`: o `web-push` declara a união, e um `string` aqui só apareceria
   * como erro de tipo no dia em que o pacote fosse chamado — ou seja, no
   * arquivo que o teste não toca.
   */
  urgency: 'very-low' | 'low' | 'normal' | 'high';
  topic: string;
  vapidDetails: VapidConfig;
}

/** Uma tentativa de entrega, inteira — é o que o dublê guarda. */
export interface WebPushRequest {
  subscription: WebPushSubscription;
  payload: string;
  options: WebPushOptions;
}

/**
 * ⚠️ **A COSTURA COM O PACOTE `web-push`, e ela existe para o teste NÃO abrir
 * socket.**
 *
 * Um parâmetro só (e não os três de `webPush.sendNotification`) porque é o que
 * deixa o dublê guardar a chamada **inteira** em uma linha — e é a chamada
 * inteira que os testes asseguram (o JSON, o `TTL`, o `topic`, o
 * `vapidDetails`), não só o endpoint.
 */
export interface WebPushClient {
  sendNotification(request: WebPushRequest): Promise<void>;
}

/**
 * O cliente de verdade: o pacote `web-push`, e nada além de uma tradução de
 * argumentos.
 *
 * ⚠️ **É o ÚNICO lugar do monorepo que importa `web-push`**, e o pacote é
 * dependência **só** de `packages/backend` — `packages/shared` é empacotado no
 * PWA, e a chave privada que este arquivo passa ao `vapidDetails` é o segredo
 * que assina o push do clube.
 */
export const webPushClient: WebPushClient = {
  async sendNotification(request: WebPushRequest): Promise<void> {
    await webPush.sendNotification(
      request.subscription,
      request.payload,
      request.options,
    );
  },
};

/**
 * ⚠️ **"O APARELHO MORREU" — 404 e 410, e MAIS NADA** (`NOTIFICACOES.md` §5).
 *
 * A pessoa desinstalou o app ou limpou o navegador, e o endpoint dela deixou de
 * existir. Qualquer outro erro **relança**: *"falha de rede não deve
 * silenciosamente desligar a inscrição de alguém"* — um dia ruim do serviço de
 * push apagaria os aparelhos do clube inteiro, em silêncio, e ninguém voltaria
 * a receber nada até se reinscrever à mão.
 *
 * ⚠️ **Duck typing (`statusCode`), e não `instanceof WebPushError`.** A razão é
 * **uma**, e ela tem acusador: um erro com a mesma FORMA vindo por outro
 * caminho — um wrapper que reembrulha, uma versão do pacote que mude a
 * hierarquia, um `{ statusCode: 410 }` cru — é aparelho morto do mesmo jeito, e
 * com `instanceof` ele seria tentado para sempre. `instanceof` pergunta pela
 * **identidade da classe**, e identidade de classe é do grafo de módulos, não
 * do protocolo; o que o §5 do `NOTIFICACOES.md` decide é sobre o **status**.
 *
 * A fidelidade vale nos dois sentidos (§7.1) e os dois estão no teste: ele
 * constrói um `WebPushError` **de verdade** (true para 404/410, false para
 * 500/429) **e** passa objetos com a forma e sem a classe
 * (`recognises the SHAPE of a dead subscription … even without the class`).
 *
 * ⚠️⚠️ **ERRATA DA TAREFA 38 — aqui havia uma SEGUNDA razão, e ela era falsa**
 * (§7.10: afirmação sobre medição que sobrevive sem a medição). O texto dizia
 * que com `instanceof` *"o dublê do teste teria de construir a classe do pacote
 * — e o adaptador passaria a exigir o pacote em todo teste que o toca"*. O
 * teste que acompanhava esse parágrafo **já importava `WebPushError` de
 * `'web-push'`** e o construía em todos os casos de aparelho morto: o custo que
 * a razão dizia evitar já estava pago desde a primeira linha. E enquanto ela
 * ocupava o lugar da razão verdadeira, o mutante `instanceof` passava
 * **1886/1886, sem um acusador**. Razão a mais não reforça a decisão — ela
 * esconde que a decisão não estava guardada.
 */
export function isDeadSubscription(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const status: unknown = (error as { statusCode?: unknown }).statusCode;
  return status === 404 || status === 410;
}

/** `NOTIFICACOES.md` §5: doze horas. Um lembrete de ontem não serve a ninguém. */
const TTL_SECONDS = 43200;

/** O `Topic` do protocolo tem 32 caracteres; um maior é recusado. */
const TOPIC_MAX = 32;

export class WebPushSender implements PushSender {
  constructor(
    private readonly subscriptions: PushSubscriptionRepository,
    private readonly vapid: VapidConfig,
    /**
     * O cliente, injetado com o real por padrão. É o que permite testar o
     * adaptador inteiro — inclusive o 404, o 410 e o caso misto — **sem abrir
     * um socket**, e é a razão de nenhum subagente deste projeto precisar
     * mandar push de verdade para saber que ele funciona.
     */
    private readonly client: WebPushClient = webPushClient,
  ) {}

  async send(userId: string, payload: PushPayload): Promise<PushSendResult> {
    // Regra 7: o port já devolve só as ATIVAS (`disabledAt IS NULL`).
    const devices = await this.subscriptions.byUserId(userId);
    // UMA leitura de relógio para a chamada inteira: dois aparelhos mortos na
    // mesma tentativa morreram no mesmo instante, e é assim que o banco conta a
    // história.
    const now = new Date();
    const body = JSON.stringify(payload);

    let sent = 0;
    let disabled = 0;
    /**
     * ⚠️ **A PRIMEIRA falha que NÃO é aparelho morto — guardada, não lançada na
     * hora.**
     *
     * A versão fail-fast deste laço passava 22 dos 23 testes, e o que a
     * derrubou foi o caso misto (decisão H) com a ordem invertida: o port
     * **não promete ordem** (§7.2, e o fake enumera invertido exatamente para
     * isso), então com o `throw` dentro do laço a desativação do aparelho morto
     * acontecia **ou não** conforme a ordem em que o Postgres devolvesse as
     * linhas. Uma propriedade que depende de `ORDER BY` ausente é uma
     * propriedade que não existe.
     *
     * Guardando a falha, a decisão H vale sempre: **todo** aparelho morto sai
     * da lista, e o erro de rede sobe depois. A primeira, e não a última,
     * porque é a que explica o que começou a dar errado.
     */
    let failure: unknown = null;
    let failed = false;

    for (const device of devices) {
      try {
        await this.client.sendNotification({
          subscription: {
            endpoint: device.endpoint,
            keys: { p256dh: device.p256dh, auth: device.auth },
          },
          payload: body,
          options: {
            TTL: TTL_SECONDS,
            urgency: 'normal',
            // O `topic` é o `tag` (§2 e §5 querem a mesma string): uma
            // notificação nova **substitui** a anterior, tanto na fila do
            // serviço de push quanto na bandeja do aparelho.
            topic: payload.tag.slice(0, TOPIC_MAX),
            vapidDetails: this.vapid,
          },
        });
        sent += 1;
      } catch (error) {
        if (!isDeadSubscription(error)) {
          /*
            ⚠️ **DECISÃO H — DESATIVAR E RELANÇAR (a saída (a) da pergunta que a
            Tarefa 37 deixou no port).**

            O que já foi desativado nesta chamada **continua desativado**: o
            `update` acima já gravou, e o efeito é o que importa. O que se perde
            é a CONTAGEM daquela passada — o chamador recebe exceção, não
            resultado, e não fica sabendo que um aparelho saiu da lista.

            A saída (b) (colecionar as falhas e devolver o número) preservaria a
            contagem ao custo de apagar do chamador a diferença entre "entregou
            a todos" e "um aparelho ficou sem" — e um terceiro contador seria
            mudança de contrato. Quem chama já sabe aguentar: o dispatcher tem
            teste para isso (o claim não é desfeito, e a passada continua), e o
            `recordActivitySafely` captura e loga.
          */
          if (!failed) {
            failed = true;
            failure = error;
          }
          continue;
        }

        // Soft, sempre (`NOTIFICACOES.md` §4): a inscrição é um **canal**, e um
        // canal se desliga — não se apaga. Se o aparelho voltar, o `save` por
        // endpoint o reativa com o `createdAt` original.
        await this.subscriptions.update(device.id, { disabledAt: now });
        disabled += 1;
      }
    }

    // ⚠️ Decisão H: o erro sobe **depois** de toda desativação estar gravada, e
    // a contagem desta passada se perde com ele. É o preço escolhido; o efeito
    // no banco é o que importa.
    if (failed) throw failure;

    return { sent, disabled };
  }
}
