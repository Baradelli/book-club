import { describe, expect, it } from 'vitest';

import {
  browserPushSubscriptionSchema,
  deletePushSubscriptionSchema,
  isNotificationPlatform,
  NOTIFICATION_PLATFORMS,
  notificationConfigResponseSchema,
  notificationPlatform,
  pushSubscriptionResponseSchema,
  savePushSubscriptionSchema,
} from '../notification';

/**
 * O contrato do `docs/NOTIFICACOES.md` §4, na borda (Tarefa 36).
 *
 * ⚠️ **`PushSubscription.platform` é `String` validado por `z.enum`**, e não
 * enum Prisma — o `CLAUDE.md` o lista ao lado de `ActivityEvent.type`,
 * `NotificationDelivery.kind` e `Highlight.color`. O molde é o medido na Tarefa
 * 22 e repetido na 33: **uma constante**, o `z.enum` derivado dela, e o portão
 * `isX` que o domínio do backend usa.
 */

/** Os dois, escritos à mão: é o §4 do `NOTIFICACOES.md`, pinado. */
const EXPECTED_PLATFORMS = ['web', 'mobile'] as const;

/** Um endpoint de push realista — o do FCM, que é o que o Chrome devolve. */
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc-123';

function someKeys(): { p256dh: string; auth: string } {
  return { p256dh: 'BFake-p256dh', auth: 'fake-auth' };
}

function aSubscription(): {
  endpoint: string;
  keys: ReturnType<typeof someKeys>;
} {
  return { endpoint: ENDPOINT, keys: someKeys() };
}

describe('the platform vocabulary', () => {
  it('is the two of the contract, in order', () => {
    expect(NOTIFICATION_PLATFORMS).toEqual(EXPECTED_PLATFORMS);
  });

  /**
   * ⚠️ **A identidade, e não uma lista igual:** o `z.enum` tem de sair da
   * constante. Uma lista escrita à mão no schema ficaria verde no dia em que a
   * constante crescesse e o schema não.
   */
  it('feeds the z.enum from the constant itself', () => {
    expect(notificationPlatform.options).toBe(NOTIFICATION_PLATFORMS);
  });

  it.each(EXPECTED_PLATFORMS)('narrows %s', (value) => {
    expect(isNotificationPlatform(value)).toBe(true);
  });

  /** Sem `trim` e sem dobrar caixa: uma grafia por plataforma (o `=` do Postgres é byte-sensível). */
  it.each(['WEB', ' web', 'web ', 'desktop', 'ios', '', 42, null, undefined])(
    'refuses %s',
    (value) => {
      expect(isNotificationPlatform(value)).toBe(false);
      expect(notificationPlatform.safeParse(value).success).toBe(false);
    },
  );
});

describe('browserPushSubscriptionSchema', () => {
  it('accepts what PushManager.subscribe().toJSON() produces', () => {
    expect(browserPushSubscriptionSchema.parse(aSubscription())).toEqual({
      endpoint: ENDPOINT,
      keys: { p256dh: 'BFake-p256dh', auth: 'fake-auth' },
    });
  });

  it.each(['', 'not-a-url', 'fcm.googleapis.com/fcm/send/abc'])(
    'refuses the endpoint %s',
    (endpoint) => {
      expect(
        browserPushSubscriptionSchema.safeParse({
          ...aSubscription(),
          endpoint,
        }).success,
      ).toBe(false);
    },
  );

  it.each(['p256dh', 'auth'])('refuses an empty %s', (key) => {
    expect(
      browserPushSubscriptionSchema.safeParse({
        endpoint: ENDPOINT,
        keys: { ...someKeys(), [key]: '' },
      }).success,
    ).toBe(false);
  });

  it('refuses a subscription with no keys at all', () => {
    expect(
      browserPushSubscriptionSchema.safeParse({ endpoint: ENDPOINT }).success,
    ).toBe(false);
  });
});

describe('savePushSubscriptionSchema', () => {
  it('accepts the body the screen sends, with the userAgent', () => {
    const body = {
      platform: 'web',
      subscription: aSubscription(),
      userAgent: 'Mozilla/5.0',
    };

    expect(savePushSubscriptionSchema.parse(body)).toEqual(body);
  });

  it('accepts it without the userAgent, which is optional', () => {
    expect(
      savePushSubscriptionSchema.parse({
        platform: 'mobile',
        subscription: aSubscription(),
      }),
    ).toEqual({ platform: 'mobile', subscription: aSubscription() });
  });

  it('refuses a platform outside the vocabulary', () => {
    expect(
      savePushSubscriptionSchema.safeParse({
        platform: 'desktop',
        subscription: aSubscription(),
      }).success,
    ).toBe(false);
  });

  /**
   * ⚠️ **NENHUM campo de ator ou de tenant** — o dono da inscrição vem do JWT
   * (§6.3). `.strict()` é o padrão dos corpos de escrita: chave proibida é 400
   * e nada escrito, e não um strip silencioso que deixa o cliente achar que
   * funcionou.
   */
  it.each(['userId', 'actorUserId', 'clubId', 'disabledAt', 'id'])(
    'refuses a body that declares %s',
    (field) => {
      expect(
        savePushSubscriptionSchema.safeParse({
          platform: 'web',
          subscription: aSubscription(),
          [field]: 'alguem-de-fora',
        }).success,
      ).toBe(false);
    },
  );
});

describe('deletePushSubscriptionSchema', () => {
  it('takes the endpoint, which is the identity of the subscription', () => {
    expect(deletePushSubscriptionSchema.parse({ endpoint: ENDPOINT })).toEqual({
      endpoint: ENDPOINT,
    });
  });

  it('refuses a body with no endpoint', () => {
    expect(deletePushSubscriptionSchema.safeParse({}).success).toBe(false);
  });

  /**
   * ⚠️ **É AQUI QUE A REGRA 12 COMEÇA.** O `userId` declarado neste schema é
   * exatamente "romper o strip" do §6.3 — e o mutante perigoso do §7.5
   * (`input.userId ?? req.user.sub`) **precisa dele** para ser alcançável. Com
   * o `.strict()`, um corpo que o carregue é 400 antes de o handler existir.
   */
  it.each(['userId', 'actorUserId', 'clubId'])(
    'refuses a body that declares %s',
    (field) => {
      expect(
        deletePushSubscriptionSchema.safeParse({
          endpoint: ENDPOINT,
          [field]: 'alguem-de-fora',
        }).success,
      ).toBe(false);
    },
  );
});

describe('notificationConfigResponseSchema', () => {
  /**
   * ⚠️ **DOIS campos, e o nome do segundo diz PÚBLICA.** É a decisão H da
   * fatia: `packages/shared` é empacotado no PWA, e o schema é a fronteira que
   * o `serializerCompiler` aplica (§6.1). A chave privada **não tem onde sair
   * por aqui**.
   */
  it('has exactly enabled and vapidPublicKey', () => {
    expect(Object.keys(notificationConfigResponseSchema.shape).sort()).toEqual([
      'enabled',
      'vapidPublicKey',
    ]);
  });

  it('accepts the disabled shape of the contract', () => {
    expect(
      notificationConfigResponseSchema.parse({
        enabled: false,
        vapidPublicKey: null,
      }),
    ).toEqual({ enabled: false, vapidPublicKey: null });
  });

  /**
   * ⚠️ **REGRA 15, primeira metade, na BORDA: um `vapidPrivateKey` no objeto é
   * CORTADO.** O strip do `z.object` é a barreira que o serializer aplica — se
   * um dia um `toResponse` errar e juntar a privada, ela não atravessa.
   */
  it('strips a private key that some future toResponse might add', () => {
    const parsed = notificationConfigResponseSchema.parse({
      enabled: true,
      vapidPublicKey: 'a-public-one',
      vapidPrivateKey: 'NAO-PODE-SAIR',
      privateKey: 'NAO-PODE-SAIR',
    });

    expect(parsed).toEqual({ enabled: true, vapidPublicKey: 'a-public-one' });
    expect(JSON.stringify(parsed)).not.toContain('NAO-PODE-SAIR');
  });
});

describe('pushSubscriptionResponseSchema', () => {
  /**
   * ⚠️ **O `p256dh` e o `auth` NÃO SAEM NA RESPOSTA.** São as credenciais que o
   * navegador entregou para cifrar o push daquele aparelho; devolvê-las não
   * serve a tela nenhuma (o cliente acabou de mandá-las) e as põe em log de
   * proxy, em histórico de devtools e em cache. O schema é a fronteira (§6.1).
   */
  it('has exactly six fields, and none of them is a key', () => {
    expect(Object.keys(pushSubscriptionResponseSchema.shape).sort()).toEqual([
      'createdAt',
      'disabledAt',
      'endpoint',
      'id',
      'platform',
      'userAgent',
    ]);
  });

  it('strips the keys when something tries to send them', () => {
    const parsed = pushSubscriptionResponseSchema.parse({
      id: 'sub-1',
      platform: 'web',
      endpoint: ENDPOINT,
      userAgent: null,
      disabledAt: null,
      createdAt: '2026-10-01T18:30:45.123Z',
      p256dh: 'NAO-PODE-SAIR',
      auth: 'NAO-PODE-SAIR',
      userId: 'maria',
    });

    expect(JSON.stringify(parsed)).not.toContain('NAO-PODE-SAIR');
    expect(JSON.stringify(parsed)).not.toContain('maria');
  });

  /**
   * `userAgent` e `disabledAt` são **obrigatórios e anuláveis**, nunca
   * `optional()`: `null` é estado real (ninguém mandou o user agent; a
   * inscrição está ativa) e a AUSÊNCIA do campo quebraria a tela em cheio,
   * porque o cliente valida a resposta de sucesso (§6.8).
   */
  it('takes null in userAgent and disabledAt, and refuses their absence', () => {
    const complete = {
      id: 'sub-1',
      platform: 'web' as const,
      endpoint: ENDPOINT,
      userAgent: null,
      disabledAt: null,
      createdAt: '2026-10-01T18:30:45.123Z',
    };

    expect(pushSubscriptionResponseSchema.parse(complete)).toEqual(complete);

    // A AUSÊNCIA do campo é recusada — `nullable()` e não `optional()`, porque
    // o cliente valida a resposta de sucesso e um campo que desaparece quebra a
    // tela em cheio (§6.8).
    for (const absent of ['userAgent', 'disabledAt'] as const) {
      const partial: Record<string, unknown> = { ...complete };
      delete partial[absent];
      expect(pushSubscriptionResponseSchema.safeParse(partial).success).toBe(
        false,
      );
    }
  });
});
