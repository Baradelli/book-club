import { randomUUID } from 'node:crypto';

import type { PushSubscription } from '../domain/push-subscription';
import { assertNotificationPlatform } from '../domain/push-subscription';
import type { PushSubscriptionRepository } from './ports/push-subscription-repository';

export interface SavePushSubscriptionInput {
  /**
   * O DONO do aparelho, e ele vem do JWT.
   *
   * ⚠️ **NÃO existe `userId` aqui** (§6.3), e **não existe `clubId`** (decisão
   * F): push é da pessoa, não do clube — a mesma pessoa em dois clubes tem UM
   * aparelho.
   */
  actorUserId: string;
  /** `unknown` porque o portão é do domínio (`assertNotificationPlatform`). */
  platform: unknown;
  /** O que o `PushSubscription.toJSON()` do navegador entregou. */
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  /** Ausente grava `null`: é só para a tela da 36b listar "este aparelho". */
  userAgent?: string;
}

export interface SavePushSubscriptionOutput {
  subscription: PushSubscription;
  /**
   * A rota devolve **201** na primeira inscrição daquele aparelho e **200** nas
   * seguintes (inclusive na reativação), e o valor vem daqui — sem isto a borda
   * teria de perguntar ao banco de novo. É o mesmo desenho do `markRead`.
   */
  created: boolean;
}

/**
 * "Ative o push neste aparelho."
 *
 * ⚠️ **NÃO HÁ `assertMembership`** (decisão F), pelo mesmo motivo do `Settings`:
 * a inscrição não tem `clubId`, não é conteúdo de clube, e não existe clube a
 * conferir. O corte é o JWT, e a prova está em
 * `writes the actor as owner even when a userId is smuggled`.
 *
 * ⚠️ **É UPSERT POR `endpoint`, E REATIVA** (regra 10, e `NOTIFICACOES.md` §4).
 * O `endpoint` é a identidade da inscrição no protocolo (decisão E), e a
 * inscrição que volta é o caso comum do produto: a pessoa desliga o push, muda
 * de ideia, e o navegador devolve o MESMO endpoint. Como a inscrição nasce
 * sempre com `disabledAt: null` e o upsert escreve esse campo, a reativação sai
 * de graça — e é a única forma que não deixa a linha voltar **desligada**, que
 * seria uma ativação que a tela mostra como feita e que nunca recebe push.
 *
 * ⚠️ **O `id` gerado aqui pode ser DESCARTADO, e isso é correto.** O
 * `randomUUID()` sai sem saber se a linha existe; o upsert por `endpoint` do
 * repositório mantém o id da linha antiga e devolve a linha do banco — então o
 * chamador responde o id certo. É o mesmo caminho do `save` do `ReadingLog`.
 *
 * ⚠️ **Não registra `ActivityEvent`**: inscrever um aparelho não é notícia para
 * o clube. O `ACTIVITY_TYPES` tem quatro verbos, todos de leitura ou escrita de
 * conteúdo (`docs/NOTIFICACOES.md` §1), e "a Maria ligou o push" não é nenhum
 * deles — seria log de auditoria num feed de incentivo.
 */
export class SavePushSubscription {
  constructor(private readonly subscriptions: PushSubscriptionRepository) {}

  async execute(
    input: SavePushSubscriptionInput,
  ): Promise<SavePushSubscriptionOutput> {
    /*
      ⚠️ **O PORTÃO VEM ANTES DE QUALQUER IDA AO BANCO**, e a prova é por
      contagem (§7.3): "recusou antes de escrever" e "escreveu e depois
      recusou" dão o MESMO erro ao cliente, e a segunda deixa linha no banco.
      O teste `refuses a bad platform before writing anything` afirma
      `byEndpointAndUserCalls === 0` e `saveCalls === 0`.
    */
    const platform = assertNotificationPlatform(input.platform);

    const existing = await this.subscriptions.byEndpointAndUser(
      input.subscription.endpoint,
      input.actorUserId,
    );

    const subscription = await this.subscriptions.save({
      // O id da linha que já existe MANDA — e o upsert do repositório também o
      // preserva, então as duas pontas concordam. Aqui ele evita até a ida
      // desnecessária: numa reativação nenhum uuid novo é sorteado.
      id: existing?.id ?? randomUUID(),
      // ⚠️ O DONO É O ATOR, sempre, e é atribuído aqui — nunca do input.
      userId: input.actorUserId,
      platform,
      endpoint: input.subscription.endpoint,
      p256dh: input.subscription.keys.p256dh,
      auth: input.subscription.keys.auth,
      // `undefined` (o campo não veio) grava `null`, e não a string
      // `"undefined"`: é o padrão do `optionalText` do projeto, sem o `trim`
      // porque user agent não é texto que a pessoa digitou.
      userAgent: input.userAgent ?? null,
      /*
        ⚠️ **SEMPRE `null`, e é o que REATIVA.** O campo não existe no input: um
        corpo que o carregasse poderia inscrever um aparelho já desligado — uma
        ativação que a tela mostra como feita e que nunca recebe push.
      */
      disabledAt: null,
      /*
        UMA leitura de relógio, e é a única deste UseCase (ADR 0008) — o `??`
        curto-circuita, então numa REATIVAÇÃO o relógio nem é lido: o
        `createdAt` da inscrição que volta é o da primeira vez, que é o que a
        tela da 36b vai mostrar como "inscrito desde".

        Quando a linha existe para OUTRA pessoa (o endpoint reciclado, ver o
        `save` do port), `existing` é `null` para este ator e o `createdAt`
        passa a ser de agora — a linha é de outra inscrição.
      */
      createdAt: existing?.createdAt ?? new Date(),
    });

    return { subscription, created: existing === null };
  }
}
