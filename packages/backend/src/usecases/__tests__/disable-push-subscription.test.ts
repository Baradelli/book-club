import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PushSubscription } from '../../domain/push-subscription';
import {
  type AdvancingClock,
  installAdvancingClock,
} from '../../test-support/advancing-clock';
import { required } from '../../test-support/builders';
import { PushSubscriptionRepositoryFake } from '../_fakes/push-subscription-repository-fake';
import { DisablePushSubscription } from '../disable-push-subscription';

/**
 * ⚠️ **REGRAS 11 e 12 DA TAREFA 36 — a desativação SOFT e idempotente, e
 * "ninguém desativa a inscrição de outra pessoa".**
 *
 * ⚠️ **A regra 12 é ESTRUTURAL, e não um `if`** (a decisão E da Tarefa 30
 * outra vez): a busca é pelo par `(endpoint, actorUserId)`, então a inscrição
 * de outra pessoa **não aparece** — não há linha alheia ao alcance do `update`,
 * e portanto não há guard de autoria para alguém esquecer de escrever.
 *
 * O input **não tem `userId`**, e é a primeira barreira. A segunda é a ordem do
 * spread na rota (§6.3), e a terceira é o `.strict()` do
 * `deletePushSubscriptionSchema`. O mutante que importa é o do **fallback**
 * (`input.userId ?? req.user.sub`, §7.5) — ele se comporta normalmente em todo
 * teste que não manda o campo, e os testes de contrabando daqui e do
 * `notification-routes.integration.test.ts` são os que o acusam.
 */

const MARIA = 'maria';
const MARCOS = 'marcos';
const MARIA_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/da-maria';
const MARCOS_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/do-marcos';

/** Fixture de objeto é FACTORY, nunca `const` de `describe` (§7.7). */
function aSubscription(
  overrides: Partial<PushSubscription> = {},
): PushSubscription {
  return {
    id: 'sub-da-maria',
    userId: MARIA,
    platform: 'web',
    endpoint: MARIA_ENDPOINT,
    p256dh: 'p256dh',
    auth: 'auth',
    userAgent: null,
    disabledAt: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    ...overrides,
  };
}

function storedByEndpoint(
  subscriptions: PushSubscriptionRepositoryFake,
  endpoint: string,
): PushSubscription {
  return required(subscriptions.saved.find((row) => row.endpoint === endpoint));
}

describe('DisablePushSubscription', () => {
  let subscriptions: PushSubscriptionRepositoryFake;
  let disablePushSubscription: DisablePushSubscription;
  let clock: AdvancingClock;

  beforeEach(() => {
    clock = installAdvancingClock();
    subscriptions = new PushSubscriptionRepositoryFake();
    disablePushSubscription = new DisablePushSubscription(subscriptions);
  });

  afterEach(() => {
    clock.restore();
    vi.unstubAllGlobals();
  });

  /**
   * ⚠️ **REGRA 11 — SOFT: a linha FICA, com o instante.**
   *
   * A asserção é sobre a linha GRAVADA, e não sobre o retorno (o UseCase não
   * devolve nada): é o que separa "gravou `disabledAt`" de "apagou a linha", e
   * um hard delete passaria em qualquer teste que só olhasse o `byUserId`.
   */
  it('writes the disabledAt and keeps the row', async () => {
    await subscriptions.save(aSubscription());

    await disablePushSubscription.execute({
      actorUserId: MARIA,
      endpoint: MARIA_ENDPOINT,
    });

    expect(storedByEndpoint(subscriptions, MARIA_ENDPOINT).disabledAt).toEqual(
      new Date(clock.at(1)),
    );
    expect(subscriptions.saved).toHaveLength(1);
    // ...e ela sai das ATIVAS, que é o que o envio da Tarefa 38 vai ler.
    expect(await subscriptions.byUserId(MARIA)).toEqual([]);
  });

  /** Uma leitura de relógio, e a prova é CONTAR (§7.8). */
  it('reads the clock once', async () => {
    await subscriptions.save(aSubscription());

    await disablePushSubscription.execute({
      actorUserId: MARIA,
      endpoint: MARIA_ENDPOINT,
    });

    expect(clock.reads).toBe(1);
  });

  /**
   * ⚠️ **REGRA 11 — É IDEMPOTENTE: não haver o que desligar NÃO é erro.**
   *
   * É a decisão C da Tarefa 30 aplicada aqui: lançar obrigaria a tela a
   * distinguir "desliguei" de "já estava desligado", que é a mesma coisa para
   * quem olha — e criaria uma classe de erro nova só para isso.
   */
  it('does nothing, and does not throw, for an endpoint nobody registered', async () => {
    await expect(
      disablePushSubscription.execute({
        actorUserId: MARIA,
        endpoint: 'https://push.test/fantasma',
      }),
    ).resolves.toBeUndefined();
  });

  /**
   * ⚠️ **E o retorno antecipado é a metade que SÓ O CONTADOR VÊ** (§7.3): sem
   * linha, não há `update`. "Não chamou" × "chamou e não havia o que mudar" dão
   * o mesmo resultado observável — mas o segundo é `P2025`, que a borda não
   * mapeia, ou seja **500** para quem desligou duas vezes.
   */
  it('never calls update when there is nothing to disable', async () => {
    await disablePushSubscription.execute({
      actorUserId: MARIA,
      endpoint: 'https://push.test/fantasma',
    });

    expect(subscriptions.updateCalls).toBe(0);
    // ...e leu de verdade: sem isto, um UseCase que saísse sem consultar
    // passaria neste teste.
    expect(subscriptions.byEndpointAndUserCalls).toBe(1);
  });

  /** Desligar duas vezes é inofensivo: o segundo toque reescreve o instante. */
  it('is harmless twice', async () => {
    await subscriptions.save(aSubscription());

    await disablePushSubscription.execute({
      actorUserId: MARIA,
      endpoint: MARIA_ENDPOINT,
    });
    await disablePushSubscription.execute({
      actorUserId: MARIA,
      endpoint: MARIA_ENDPOINT,
    });

    expect(subscriptions.saved).toHaveLength(1);
    expect(storedByEndpoint(subscriptions, MARIA_ENDPOINT).disabledAt).toEqual(
      new Date(clock.at(2)),
    );
  });

  /** Desligar um aparelho não desliga o outro da mesma pessoa. */
  it('disables only the device that was asked for', async () => {
    await subscriptions.save(aSubscription());
    await subscriptions.save(
      aSubscription({ id: 'outro', endpoint: 'https://push.test/laptop' }),
    );

    await disablePushSubscription.execute({
      actorUserId: MARIA,
      endpoint: MARIA_ENDPOINT,
    });

    expect(
      (await subscriptions.byUserId(MARIA)).map((row) => row.endpoint),
    ).toEqual(['https://push.test/laptop']);
  });

  /**
   * ⚠️ **REGRA 12 — NINGUÉM DESATIVA A INSCRIÇÃO DE OUTRA PESSOA.**
   *
   * A Maria (ator legítimo, com inscrição própria) pede o endpoint do Marcos.
   * A busca é pelo par, então não há linha ao alcance: nada é escrito, e a
   * inscrição do Marcos **continua ativa** — que é a única coisa que mudaria se
   * o corte falhasse (§7.5).
   */
  it('never disables the subscription of another person', async () => {
    await subscriptions.save(
      aSubscription({
        id: 'sub-do-marcos',
        userId: MARCOS,
        endpoint: MARCOS_ENDPOINT,
      }),
    );
    await subscriptions.save(aSubscription());

    await disablePushSubscription.execute({
      actorUserId: MARIA,
      endpoint: MARCOS_ENDPOINT,
    });

    // A do Marcos continua ATIVA...
    expect(
      storedByEndpoint(subscriptions, MARCOS_ENDPOINT).disabledAt,
    ).toBeNull();
    expect(await subscriptions.byUserId(MARCOS)).toHaveLength(1);
    // ...e a da Maria também, porque ela não pediu a própria.
    expect(
      storedByEndpoint(subscriptions, MARIA_ENDPOINT).disabledAt,
    ).toBeNull();
    expect(subscriptions.updateCalls).toBe(0);
  });

  /**
   * ⚠️ **REGRA 12 — O CONTRABANDO, COM O ATOR LEGÍTIMO, ASSERTANDO A LINHA
   * GRAVADA** (§7.5).
   *
   * ⚠️ **É ESTE O TESTE QUE MATA O MUTANTE DO FALLBACK.** Com
   * `input.userId ?? input.actorUserId` no lugar do `input.actorUserId`, a
   * busca vira `(MARCOS_ENDPOINT, MARCOS)` — que **existe** —, o `update` roda,
   * e a inscrição do Marcos fica desativada. A asserção "a do Marcos continua
   * ativa" é a única coisa que muda.
   *
   * Testar isto com um ator de FORA não provaria nada: não há guard de tenant
   * aqui, mas o par já é o corte, e um ator de fora não encontraria nada nas
   * duas implementações.
   */
  it('ignores a smuggled userId and leaves the other person subscription active', async () => {
    await subscriptions.save(
      aSubscription({
        id: 'sub-do-marcos',
        userId: MARCOS,
        endpoint: MARCOS_ENDPOINT,
      }),
    );
    await subscriptions.save(aSubscription());

    const smuggled = {
      actorUserId: MARIA,
      userId: MARCOS,
      endpoint: MARCOS_ENDPOINT,
    };
    await disablePushSubscription.execute(smuggled);

    expect(
      storedByEndpoint(subscriptions, MARCOS_ENDPOINT).disabledAt,
    ).toBeNull();
    expect(subscriptions.updateCalls).toBe(0);
    // A PRECONDIÇÃO que dá dente ao teste: o mesmo pedido, feito pelo DONO,
    // desativa — senão um UseCase que nunca desativasse nada passaria aqui.
    await disablePushSubscription.execute({
      actorUserId: MARCOS,
      endpoint: MARCOS_ENDPOINT,
    });
    expect(
      storedByEndpoint(subscriptions, MARCOS_ENDPOINT).disabledAt,
    ).not.toBeNull();
  });

  it('does not even compile with a userId in a fresh literal', async () => {
    await subscriptions.save(aSubscription());

    await disablePushSubscription.execute({
      actorUserId: MARIA,
      endpoint: MARIA_ENDPOINT,
      // @ts-expect-error o dono da inscrição é o JWT, e só ele
      userId: MARCOS,
    });

    expect(
      storedByEndpoint(subscriptions, MARIA_ENDPOINT).disabledAt,
    ).not.toBeNull();
  });

  /**
   * ⚠️ **NENHUM `id` DE INSCRIÇÃO NO INPUT** (decisão E da Tarefa 30): o
   * recurso não tem endereço próprio na API — a identidade é o par
   * `(endpoint, pessoa)`. Um `id` no input seria a porta pela qual a inscrição
   * de outra pessoa voltaria a ser alcançável.
   */
  it('takes no subscription id at all', async () => {
    await subscriptions.save(
      aSubscription({
        id: 'sub-do-marcos',
        userId: MARCOS,
        endpoint: MARCOS_ENDPOINT,
      }),
    );

    const smuggled = {
      actorUserId: MARIA,
      endpoint: MARIA_ENDPOINT,
      id: 'sub-do-marcos',
      subscriptionId: 'sub-do-marcos',
    };
    await disablePushSubscription.execute(smuggled);

    expect(
      storedByEndpoint(subscriptions, MARCOS_ENDPOINT).disabledAt,
    ).toBeNull();
  });
});
