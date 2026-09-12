import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidPushSubscriptionError } from '../../domain/errors';
import {
  type AdvancingClock,
  installAdvancingClock,
} from '../../test-support/advancing-clock';
import { required } from '../../test-support/builders';
import { PushSubscriptionRepositoryFake } from '../_fakes/push-subscription-repository-fake';
import { SavePushSubscription } from '../save-push-subscription';

/**
 * ⚠️ **REGRA 10 DA TAREFA 36 — o upsert por `endpoint` que REATIVA.**
 *
 * Como o `Settings`, e pela decisão F: **não há `assertMembership`** — a
 * inscrição é da PESSOA, não do clube, e o corte é o próprio JWT.
 */

const MARIA = 'maria';
const MARCOS = 'marcos';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc-123';

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    actorUserId: MARIA,
    platform: 'web',
    subscription: {
      endpoint: ENDPOINT,
      keys: { p256dh: 'p256dh-do-aparelho', auth: 'auth-do-aparelho' },
    },
    userAgent: 'Mozilla/5.0 (fixture)',
    ...overrides,
  };
}

describe('SavePushSubscription', () => {
  let subscriptions: PushSubscriptionRepositoryFake;
  let savePushSubscription: SavePushSubscription;
  let clock: AdvancingClock;

  beforeEach(() => {
    clock = installAdvancingClock();
    subscriptions = new PushSubscriptionRepositoryFake();
    savePushSubscription = new SavePushSubscription(subscriptions);
  });

  afterEach(() => {
    clock.restore();
    vi.unstubAllGlobals();
  });

  it('stores the subscription of the actor, with the keys of the device', async () => {
    const { subscription } = await savePushSubscription.execute(validInput());

    expect(subscription).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      userId: MARIA,
      platform: 'web',
      endpoint: ENDPOINT,
      p256dh: 'p256dh-do-aparelho',
      auth: 'auth-do-aparelho',
      userAgent: 'Mozilla/5.0 (fixture)',
      disabledAt: null,
      createdAt: new Date(clock.at(1)),
    });
    expect(subscriptions.saved).toHaveLength(1);
  });

  /**
   * ⚠️ **UMA leitura de relógio, e a prova é CONTAR leituras — nunca comparar
   * instantes** (§7.8: *"um relógio só se prova contando leituras"*). Duas
   * chamadas a `new Date()` no mesmo tick devolvem o MESMO milissegundo, então
   * uma igualdade entre campos passaria com um `new Date()` por campo.
   */
  it('reads the clock once', async () => {
    await savePushSubscription.execute(validInput());

    expect(clock.reads).toBe(1);
  });

  /** `userAgent` ausente grava `null`, e não a string `"undefined"`. */
  it('stores a null userAgent when the browser did not say', async () => {
    const { subscription } = await savePushSubscription.execute(
      validInput({ userAgent: undefined }),
    );

    expect(subscription.userAgent).toBeNull();
  });

  /** A `created` é o que a rota usa para escolher 201 × 200. */
  it('says created on the first subscription of that endpoint', async () => {
    const { created } = await savePushSubscription.execute(validInput());

    expect(created).toBe(true);
  });

  it('says not created when the person subscribes the same device again', async () => {
    await savePushSubscription.execute(validInput());

    const { created } = await savePushSubscription.execute(validInput());

    expect(created).toBe(false);
    expect(subscriptions.saved).toHaveLength(1);
  });

  /**
   * ⚠️ **REGRA 10 — O `POST` REATIVA** (`disabledAt = null`).
   *
   * É o caso comum do produto: a pessoa desliga o push, muda de ideia, e o
   * navegador devolve o MESMO endpoint. Se a reativação não acontecesse, a
   * inscrição existiria **desligada** e o envio da Tarefa 38 — que lê só as
   * ativas — nunca mandaria nada, sem erro nenhum.
   */
  it('reactivates a subscription the person had disabled', async () => {
    const first = await savePushSubscription.execute(validInput());
    await subscriptions.update(first.subscription.id, {
      disabledAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    // A precondição: ela está DESLIGADA — o `byUserId` do fake devolve só as
    // ativas, então a lista está vazia antes do `POST` de volta.
    expect(await subscriptions.byUserId(MARIA)).toEqual([]);

    const back = await savePushSubscription.execute(validInput());

    expect(back.subscription.disabledAt).toBeNull();
    expect(back.created).toBe(false);
    expect(await subscriptions.byUserId(MARIA)).toHaveLength(1);
  });

  /**
   * ⚠️ **O `id` DA LINHA QUE JÁ EXISTE MANDA.** O UseCase gera um
   * `randomUUID()` sem saber que a linha existe; o upsert por `endpoint` do
   * repositório descarta esse id, e é a linha do banco que volta — então a
   * resposta leva o id certo.
   */
  it('keeps the id of the row that already exists, discarding the new one', async () => {
    const first = await savePushSubscription.execute(validInput());

    const again = await savePushSubscription.execute(validInput());

    expect(again.subscription.id).toBe(first.subscription.id);
  });

  /** Dois aparelhos da mesma pessoa convivem: não há `@@unique` por dono. */
  it('keeps two devices of the same person', async () => {
    await savePushSubscription.execute(validInput());
    await savePushSubscription.execute(
      validInput({
        platform: 'mobile',
        subscription: {
          endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/xyz',
          keys: { p256dh: 'outro-p256dh', auth: 'outro-auth' },
        },
      }),
    );

    expect(await subscriptions.byUserId(MARIA)).toHaveLength(2);
  });

  /**
   * ⚠️ **O PORTÃO DA PLATAFORMA, no domínio** — o `z.enum` da borda é a
   * primeira barreira, não a única (o mesmo argumento do
   * `assertHighlightColor`).
   */
  it.each(['WEB', 'desktop', '', 'ios', null, 42])(
    'refuses the platform %s',
    async (platform) => {
      await expect(
        savePushSubscription.execute(validInput({ platform })),
      ).rejects.toThrow(InvalidPushSubscriptionError);
    },
  );

  /**
   * ⚠️ **E RECUSA ANTES DE ESCREVER, provado por contagem** (§7.3): "recusou
   * antes de escrever" e "escreveu e depois recusou" dão o MESMO erro ao
   * cliente, e a segunda deixa linha no banco.
   */
  it('refuses a bad platform before writing anything', async () => {
    await expect(
      savePushSubscription.execute(validInput({ platform: 'carteiro-pombo' })),
    ).rejects.toThrow(InvalidPushSubscriptionError);

    expect({
      read: subscriptions.byEndpointAndUserCalls,
      wrote: subscriptions.saveCalls,
    }).toEqual({ read: 0, wrote: 0 });
  });

  it('accepts both platforms of the vocabulary', async () => {
    const web = await savePushSubscription.execute(validInput());
    const mobile = await savePushSubscription.execute(
      validInput({
        platform: 'mobile',
        subscription: {
          endpoint: 'https://push.test/mobile',
          keys: { p256dh: 'a', auth: 'b' },
        },
      }),
    );

    expect([web.subscription.platform, mobile.subscription.platform]).toEqual([
      'web',
      'mobile',
    ]);
  });

  /**
   * ⚠️ **NINGUÉM INSCREVE EM NOME DE OUTRA PESSOA, e o contrabando é testado
   * com o ATOR LEGÍTIMO, assertando A LINHA GRAVADA** (§7.5).
   *
   * O que muda se o contrabando pegar é **de quem é a linha** — então é isso
   * que se asserta. O `@ts-expect-error` é a metade do compilador; a variável
   * solta é a metade do runtime.
   */
  it('writes the actor as owner even when a userId is smuggled', async () => {
    const smuggled = { ...validInput(), userId: MARCOS };

    const { subscription } = await savePushSubscription.execute(smuggled);

    expect(subscription.userId).toBe(MARIA);
    expect(required(subscriptions.saved[0]).userId).toBe(MARIA);
    expect(await subscriptions.byUserId(MARCOS)).toEqual([]);
  });

  it('does not even compile with a userId in a fresh literal', async () => {
    await savePushSubscription.execute({
      ...validInput(),
      // @ts-expect-error o dono da inscrição é o JWT, e só ele
      userId: MARCOS,
    });

    expect(required(subscriptions.saved[0]).userId).toBe(MARIA);
  });

  /**
   * ⚠️ **E o `disabledAt` também não se contrabandeia:** um corpo que o
   * carregasse poderia inscrever um aparelho **já desligado** — uma ativação que
   * a tela mostra como feita e que nunca recebe push. O campo não existe no
   * input, e a inscrição nasce ativa sempre.
   */
  it('always writes an active subscription, whatever the body carries', async () => {
    const smuggled = {
      ...validInput(),
      disabledAt: new Date('2020-01-01T00:00:00.000Z'),
      id: 'id-escolhido-pelo-cliente',
    };

    const { subscription } = await savePushSubscription.execute(smuggled);

    expect(subscription.disabledAt).toBeNull();
    expect(subscription.id).not.toBe('id-escolhido-pelo-cliente');
  });
});
