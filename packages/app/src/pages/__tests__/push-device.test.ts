import type { BrowserPushSubscription } from '@clube/shared';
import { afterEach, describe, expect, it } from 'vitest';

import {
  browserPushDevice,
  createPushDevice,
  PushDeviceError,
  type PushDeviceHost,
  type PushManagerLike,
  type PushSubscriptionLike,
  urlBase64ToUint8Array,
} from '../push-device';

/**
 * A COSTURA COM O NAVEGADOR (Tarefa 36b, decisão I) — e a conversão que erra
 * calada.
 *
 * ⚠️ **NENHUMA CHAVE REAL AQUI** (regra 7). A chave de 65 bytes usada abaixo é
 * um valor **inventado**, com forma de base64url e nome que diz que é falso:
 * ela é o byte `0x04` seguido de `(i * 7) % 256`. Nenhum par VAPID foi gerado,
 * nenhum `.env` foi lido.
 *
 * ⚠️ **O `push-device.ts` é testado com um HOST falso, não com globais
 * forjados** (decisão I). `jsdom` não tem `PushManager` nem `Notification`, e um
 * teste que forja três globais testa a forja. O host é a fronteira: ele carrega
 * as **leituras cruas** (`'Notification' in window`, `navigator.standalone`,
 * `window.isSecureContext`), e a REGRA — qual das quatro recusas vale, em que
 * ordem, e o que acontece no toque — mora no `createPushDevice`, onde ela é
 * decidível.
 */

/** `Buffer` é o oráculo INDEPENDENTE do sentido inverso (§7.8: o esperado não
 *  pode ser produzido pelo código sob teste). Ele é do Node, não nosso. */
function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

/**
 * ⚠️ **UMA CHAVE PÚBLICA FALSA, DE 65 BYTES, COMEÇANDO EM `0x04`** — a forma
 * da chave P-256 descomprimida de verdade (regra 15), e nada mais que isso.
 *
 * O conteúdo é uma progressão (`0x04`, depois `(i * 7) % 256`), então ela é
 * reproduzível por quem ler este arquivo e **não vale como segredo em lugar
 * nenhum**. A string abaixo foi produzida pelo `Buffer` do Node a partir desses
 * bytes — não pela função sob teste.
 */
const FAKE_KEY_BYTES: Uint8Array = Uint8Array.from(
  Array.from({ length: 65 }, (_unused, index) =>
    index === 0 ? 0x04 : (index * 7) % 256,
  ),
);

const FAKE_KEY_BASE64URL =
  'BAcOFRwjKjE4P0ZNVFtiaXB3foWMk5qhqK-2vcTL0tng5-71_AMKERgfJi00O0JJUFdeZWxzeoGIj5adpKuyucA';

describe('urlBase64ToUint8Array (regra 15)', () => {
  /**
   * Vetores conferidos À MÃO, e escolhidos para a implementação errada
   * **falhar**:
   *
   * - `AQAB` é o expoente RSA 65537 (`01 00 01`) — o vetor mais publicado que
   *   existe;
   * - `-_-_` e `__8` **só decodificam se os `-_` virarem `+/`**: são os dois
   *   caracteres em que base64url difere de base64, e sem a troca o `atob`
   *   lança;
   * - `BA` e `__8` têm comprimento 2 e 3, ou seja, **exigem padding** para um
   *   decodificador estrito (⚠️ ver a medição no docblock da função).
   */
  it.each([
    ['AQAB', [0x01, 0x00, 0x01]],
    ['-_-_', [0xfb, 0xff, 0xbf]],
    ['__8', [0xff, 0xff]],
    ['BA', [0x04]],
  ])('decodes %s into the bytes it names', (encoded, bytes) => {
    const decoded = urlBase64ToUint8Array(encoded);

    expect(decoded).toBeInstanceOf(Uint8Array);
    expect([...decoded]).toEqual(bytes);
    // O SENTIDO INVERSO, pelo oráculo do Node: o mesmo par, de volta.
    expect(toBase64Url(Uint8Array.from(bytes))).toBe(encoded);
  });

  it('⚠️ decodes a 65-byte P-256-shaped key, and it starts with 0x04', () => {
    const decoded = urlBase64ToUint8Array(FAKE_KEY_BASE64URL);

    // O comprimento é a metade da regra que erra CALADA: uma conversão que
    // devolvesse os bytes ASCII da string daria 87, e o servidor de push
    // aceitaria a inscrição sem nunca entregar nada.
    expect(decoded).toHaveLength(65);
    expect(decoded[0]).toBe(0x04);
    expect([...decoded]).toEqual([...FAKE_KEY_BYTES]);
    // E o inverso, pelo oráculo independente.
    expect(toBase64Url(FAKE_KEY_BYTES)).toBe(FAKE_KEY_BASE64URL);
  });

  it('decodes the empty string into no bytes at all', () => {
    expect([...urlBase64ToUint8Array('')]).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* O host falso — e ele sabe RECUSAR como o de verdade recusa (§7.1).   */
/* ------------------------------------------------------------------ */

interface HostOverrides {
  isSecureContext?: boolean;
  hasNotification?: boolean;
  hasServiceWorker?: boolean;
  hasPushManager?: boolean;
  iosStandalone?: boolean | undefined;
  displayModeStandalone?: boolean;
  permission?: NotificationPermission;
  /** O que `Notification.requestPermission()` responde no toque. */
  answer?: NotificationPermission;
  /** O que o `pushManager` já tem guardado. */
  existing?: PushSubscriptionLike | null;
  /** O que `subscribe` devolve — pode ser lixo, de propósito. */
  fresh?: unknown;
  /**
   * ⚠️ **AS TRÊS RECUSAS DO NAVEGADOR QUE NÃO SÃO `PushDeviceError`** — §7.1 na
   * direção restritiva, e ela foi achada na auditoria desta fatia: o dublê que
   * só sabe **responder** é mais fácil que o navegador de verdade, e a suíte
   * fica verde justamente onde o código trata o que o dublê nunca produz.
   *
   * - `registrationThrows`: `navigator.serviceWorker.ready` que **rejeita** (o
   *   service worker que não registrou, ou o navegador que o desligou);
   * - `getSubscriptionThrows`: `pushManager.getSubscription()` que rejeita;
   * - `subscribeThrows`: o **erro cru do navegador** no `subscribe` — o
   *   `push-device.ts` documenta por escrito que "o Chrome recusa a inscrição
   *   sem `userVisibleOnly`, e a recusa vem como exceção", e até a auditoria
   *   desta fatia o dublê não sabia produzir essa exceção;
   * - e o `unsubscribe()` que **rejeita** é o terceiro argumento do
   *   `aSubscription`, porque quem rejeita é a inscrição, não o host.
   *
   * ⚠️ **O que NÃO foi ensinado, e o motivo:** `unsubscribe()` que devolve
   * `false`. O booleano é **descartado** por desenho (`await
   * subscription.unsubscribe()` e nada mais), então não há estado observável
   * que mude — um teste sobre ele nasceria sem acusador possível (§7.10).
   */
  registrationThrows?: unknown;
  getSubscriptionThrows?: unknown;
  subscribeThrows?: unknown;
}

interface Host {
  host: PushDeviceHost;
  /** ⚠️ CONTADOR, NUNCA CRONÔMETRO (§7.3) — e ele guarda a ORDEM. */
  events: string[];
  subscribeOptions: Array<{
    userVisibleOnly: boolean;
    applicationServerKey: Uint8Array;
  }>;
}

const A_SUBSCRIPTION: BrowserPushSubscription = {
  endpoint: 'https://push.exemplo.test/aparelho-do-marcos',
  keys: { p256dh: 'p256dh-de-mentira', auth: 'auth-de-mentira' },
};

function aSubscription(
  events: string[],
  json: unknown = A_SUBSCRIPTION,
  throws?: unknown,
): PushSubscriptionLike {
  return {
    endpoint: A_SUBSCRIPTION.endpoint,
    toJSON: () => json,
    unsubscribe: async () => {
      events.push('unsubscribe');
      if (throws !== undefined) throw throws;
      return true;
    },
  };
}

/** Fixture é factory, com `overrides` (§7.7). */
function aHost(overrides: HostOverrides = {}): Host {
  const events: string[] = [];
  const subscribeOptions: Host['subscribeOptions'] = [];
  const existing = overrides.existing === undefined ? null : overrides.existing;

  const pushManager: PushManagerLike = {
    subscribe: async (options) => {
      events.push('subscribe');
      subscribeOptions.push(options);
      // ⚠️ O erro CRU do navegador, que não é `PushDeviceError`.
      if (overrides.subscribeThrows !== undefined)
        throw overrides.subscribeThrows;
      return aSubscription(events, overrides.fresh ?? A_SUBSCRIPTION);
    },
    getSubscription: async () => {
      events.push('getSubscription');
      if (overrides.getSubscriptionThrows !== undefined) {
        throw overrides.getSubscriptionThrows;
      }
      return existing;
    },
  };

  const host: PushDeviceHost = {
    isSecureContext: overrides.isSecureContext ?? true,
    hasNotification: overrides.hasNotification ?? true,
    hasServiceWorker: overrides.hasServiceWorker ?? true,
    hasPushManager: overrides.hasPushManager ?? true,
    iosStandalone: overrides.iosStandalone,
    displayModeStandalone: () => overrides.displayModeStandalone ?? false,
    permission: () => overrides.permission ?? 'default',
    requestPermission: async () => {
      events.push('requestPermission');
      return overrides.answer ?? 'granted';
    },
    registration: async () => {
      events.push('registration');
      // O `navigator.serviceWorker.ready` que nunca fica pronto.
      if (overrides.registrationThrows !== undefined) {
        throw overrides.registrationThrows;
      }
      return { pushManager };
    },
  };

  return { host, events, subscribeOptions };
}

describe('as QUATRO recusas do aparelho (decisão G, regra 13)', () => {
  it('says nothing is wrong when the four conditions hold', () => {
    expect(createPushDevice(aHost().host).blockedBy()).toBeNull();
  });

  /**
   * ⚠️ **O CONTEXTO INSEGURO VEM PRIMEIRO, e isso é a decisão, não a ordem das
   * linhas.** Num `http://` que não é `localhost` o navegador **não expõe** o
   * `serviceWorker` nem o `PushManager` — ou seja, o feature-detect também
   * falha, e quem responder "seu navegador não suporta" manda a pessoa trocar
   * de navegador para consertar o endereço. A causa é o endereço.
   */
  it('⚠️ blames the INSECURE CONTEXT even when the three globals are missing too', () => {
    const device = createPushDevice(
      aHost({
        isSecureContext: false,
        hasNotification: false,
        hasServiceWorker: false,
        hasPushManager: false,
      }).host,
    );

    expect(device.blockedBy()).toBe('insecureContext');
  });

  it.each([
    ['Notification', { hasNotification: false }],
    ['serviceWorker', { hasServiceWorker: false }],
    ['PushManager', { hasPushManager: false }],
  ])(
    'blames the BROWSER when %s is missing — the three, not one',
    (_name, missing) => {
      expect(createPushDevice(aHost(missing).host).blockedBy()).toBe(
        'unsupported',
      );
    },
  );

  /**
   * ⚠️ **A RECUSA QUE NÃO PARECE FALHA** (decisão G, `NOTIFICACOES.md` §7): no
   * iPhone fora da tela de início o `PushManager` **existe**, o feature-detect
   * passa inteiro, e a permissão simplesmente nunca é concedida. Sem esta
   * recusa o botão apareceria e "não faria nada".
   */
  it('⚠️ blames the iPhone OUTSIDE the home screen, with all three globals present', () => {
    const device = createPushDevice(aHost({ iosStandalone: false }).host);

    expect(device.blockedBy()).toBe('iosNotInstalled');
  });

  it('does not blame the iPhone when the PWA IS on the home screen', () => {
    expect(
      createPushDevice(aHost({ iosStandalone: true }).host).blockedBy(),
    ).toBeNull();
  });

  it('does not blame the iPhone on a browser that has no such property', () => {
    // `navigator.standalone` é do Safari do iPhone e de mais ninguém:
    // `undefined` não é "não instalado", é "não é iPhone".
    expect(
      createPushDevice(aHost({ iosStandalone: undefined }).host).blockedBy(),
    ).toBeNull();
  });

  it('blames the DENIED PERMISSION when the person already refused', () => {
    expect(
      createPushDevice(aHost({ permission: 'denied' }).host).blockedBy(),
    ).toBe('permissionDenied');
  });

  it('reads the permission at EVERY call, never once at creation', () => {
    let permission: NotificationPermission = 'default';
    const { host } = aHost();
    const device = createPushDevice({ ...host, permission: () => permission });

    expect(device.blockedBy()).toBeNull();
    permission = 'denied';
    expect(device.blockedBy()).toBe('permissionDenied');
  });
});

describe('a plataforma da inscrição', () => {
  it.each([
    ['mobile', { iosStandalone: true }],
    ['mobile', { displayModeStandalone: true }],
    ['web', {}],
  ])('is %s', (expected, overrides) => {
    expect(createPushDevice(aHost(overrides).host).platform()).toBe(expected);
  });
});

describe('ativar o aparelho (regras 14 e 15)', () => {
  it('⚠️ asks, waits for the service worker and only THEN subscribes — in that order', async () => {
    const { host, events } = aHost();

    await createPushDevice(host).subscribe(FAKE_KEY_BASE64URL);

    expect(events).toEqual(['requestPermission', 'registration', 'subscribe']);
  });

  it('⚠️ always asks for userVisibleOnly: true — Chrome refuses without it', async () => {
    const { host, subscribeOptions } = aHost();

    await createPushDevice(host).subscribe(FAKE_KEY_BASE64URL);

    expect(subscribeOptions).toHaveLength(1);
    expect(subscribeOptions[0]?.userVisibleOnly).toBe(true);
  });

  it('⚠️ hands the applicationServerKey as BYTES, never as the base64url string', async () => {
    const { host, subscribeOptions } = aHost();

    await createPushDevice(host).subscribe(FAKE_KEY_BASE64URL);

    const key = subscribeOptions[0]?.applicationServerKey;
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key).toHaveLength(65);
    expect([...(key ?? [])]).toEqual([...FAKE_KEY_BYTES]);
  });

  it.each([['denied'], ['default']] as const)(
    'refuses with permissionDenied when the answer is %s, and does NOT subscribe',
    async (answer) => {
      const { host, events } = aHost({ answer });
      const device = createPushDevice(host);

      await expect(device.subscribe(FAKE_KEY_BASE64URL)).rejects.toBeInstanceOf(
        PushDeviceError,
      );
      await expect(device.subscribe(FAKE_KEY_BASE64URL)).rejects.toMatchObject({
        blocker: 'permissionDenied',
      });

      // ⚠️ Contagem, não ausência de erro (§7.3): a permissão negada tem de
      // parar ANTES do `subscribe`, senão o navegador lança sozinho e a tela
      // perde a causa.
      expect(events.filter((event) => event === 'subscribe')).toEqual([]);
    },
  );

  it('gives back the subscription in the shape the API expects', async () => {
    const { host } = aHost();

    expect(await createPushDevice(host).subscribe(FAKE_KEY_BASE64URL)).toEqual(
      A_SUBSCRIPTION,
    );
  });

  /**
   * ⚠️ **O ERRO CRU DO NAVEGADOR ATRAVESSA — ele não vira `PushDeviceError`.**
   *
   * O docblock do `subscribe` afirma por escrito que "o Chrome recusa a
   * inscrição sem `userVisibleOnly`, e a recusa vem como **exceção**" — e até a
   * auditoria desta fatia o dublê não sabia produzir essa exceção, ou seja, a
   * afirmação do código não tinha um único teste atrás dela (§7.1 na direção
   * restritiva). Quem trata essa exceção é a TELA, e ela só distingue o caminho
   * "recado genérico" do caminho "uma das quatro frases" porque a classe do
   * erro chega intacta: embrulhar tudo em `PushDeviceError` aqui faria a tela
   * culpar a permissão por uma falha que não é dela.
   */
  it('⚠️ lets the RAW browser refusal through, instead of dressing it as a PushDeviceError', async () => {
    const refusal = new Error('Registration failed - permission denied');
    const { host } = aHost({ subscribeThrows: refusal });

    await expect(
      createPushDevice(host).subscribe(FAKE_KEY_BASE64URL),
    ).rejects.toBe(refusal);
  });

  it('⚠️ refuses a subscription the browser gave back MALFORMED, instead of POSTing it', async () => {
    // §6.8 aplicado à outra ponta: o que vem do navegador também passa pelo
    // schema de `shared`. Um `endpoint` que não é URL viraria 400 no servidor,
    // e a tela diria "não deu" sem ninguém saber onde.
    const { host } = aHost({ fresh: { endpoint: 'nao-e-url', keys: {} } });

    await expect(
      createPushDevice(host).subscribe(FAKE_KEY_BASE64URL),
    ).rejects.toThrow();
  });
});

describe('desativar o aparelho (regra 16)', () => {
  it('reads the CURRENT subscription from the browser, never from a copy', async () => {
    const { host, events } = aHost({ existing: aSubscription([]) });

    expect(await createPushDevice(host).current()).toEqual(A_SUBSCRIPTION);
    expect(events).toEqual(['registration', 'getSubscription']);
  });

  it('says there is none when the browser has none', async () => {
    expect(await createPushDevice(aHost().host).current()).toBeNull();
  });

  it('unsubscribes the subscription the browser has', async () => {
    const events: string[] = [];
    const { host } = aHost({ existing: aSubscription(events) });

    await createPushDevice(host).unsubscribe();

    expect(events).toEqual(['unsubscribe']);
  });

  it('does not explode when there is nothing to unsubscribe', async () => {
    await expect(
      createPushDevice(aHost().host).unsubscribe(),
    ).resolves.toBeUndefined();
  });

  /**
   * ⚠️ **AS TRÊS REJEIÇÕES QUE O DUBLÊ NÃO SABIA PRODUZIR** (§7.1, achado da
   * auditoria desta fatia). O navegador de verdade rejeita `serviceWorker.ready`
   * quando o service worker não registrou, e rejeita `getSubscription()` e
   * `unsubscribe()` quando o serviço de push está indisponível. A costura
   * **deixa passar** as três, e é isso que dá à tela a chance de cair para o
   * estado honesto em vez de afirmar "ativado". Um `try/catch` benevolente
   * aqui — o refactor que parece gentileza — apagaria o sinal antes de a tela
   * ver.
   */
  it('⚠️ lets a registration that never gets ready reject, instead of swallowing it', async () => {
    const boom = new Error('the service worker never registered');

    await expect(
      createPushDevice(aHost({ registrationThrows: boom }).host).current(),
    ).rejects.toBe(boom);
  });

  it('⚠️ lets a getSubscription that rejects reject', async () => {
    const boom = new Error('push service unavailable');

    await expect(
      createPushDevice(
        aHost({ getSubscriptionThrows: boom }).host,
      ).unsubscribe(),
    ).rejects.toBe(boom);
  });

  it('⚠️ lets an unsubscribe that rejects reject — the await is the point', async () => {
    const boom = new Error('could not unsubscribe');
    const { host } = aHost({
      existing: aSubscription([], A_SUBSCRIPTION, boom),
    });

    await expect(createPushDevice(host).unsubscribe()).rejects.toBe(boom);
  });
});

/* ------------------------------------------------------------------ */
/* A cola — e o navegador que o jsdom deixa MONTAR, propriedade a       */
/* propriedade.                                                          */
/* ------------------------------------------------------------------ */

/**
 * ⚠️ **O DESFAZEDOR, E ELE NÃO É OPCIONAL.** Um `window` vazado entre testes é
 * falso verde na fila: o teste seguinte herdaria um `isSecureContext: true` que
 * ninguém pediu. Cada `define` guarda o descritor original e o `afterEach`
 * desfaz na ordem inversa — apagando a propriedade quando ela **não existia**,
 * que é o caso dos sete globais em jsdom 25 (medido).
 */
const undoGlobals: Array<() => void> = [];

afterEach(() => {
  while (undoGlobals.length > 0) undoGlobals.pop()?.();
});

function define(target: object, name: string, value: unknown): void {
  const original = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, value });
  undoGlobals.push(() => {
    if (original === undefined) Reflect.deleteProperty(target, name);
    else Object.defineProperty(target, name, original);
  });
}

interface BrowserSpec {
  secure?: boolean;
  notification?: boolean;
  serviceWorker?: boolean;
  pushManager?: boolean;
  /** `navigator.standalone` — só definido quando o teste pede. */
  standalone?: boolean;
  permission?: NotificationPermission;
  displayModeStandalone?: boolean;
  existing?: PushSubscriptionLike | null;
}

/**
 * MONTA UM NAVEGADOR NO `jsdom`, e devolve os espiões.
 *
 * ⚠️ Isto **não** é forjar o que está sob teste: o que está sob teste é a
 * `browserPushDevice`, ou seja, **qual global ela lê para cada campo**. O
 * navegador é o ambiente, e é justamente por ele ser montável que as sete
 * leituras cruas deixam de ser inobserváveis.
 */
function installBrowser(spec: BrowserSpec = {}): { events: string[] } {
  const events: string[] = [];

  define(window, 'isSecureContext', spec.secure ?? true);

  if (spec.notification !== false) {
    define(window, 'Notification', {
      permission: spec.permission ?? 'default',
      requestPermission: async (): Promise<NotificationPermission> => {
        events.push('requestPermission');
        return 'granted';
      },
    });
  }
  if (spec.pushManager !== false) define(window, 'PushManager', class {});
  if (spec.serviceWorker !== false) {
    const pushManager: PushManagerLike = {
      subscribe: async () => {
        events.push('subscribe');
        return aSubscription(events);
      },
      getSubscription: async () => {
        events.push('getSubscription');
        return spec.existing ?? null;
      },
    };
    define(navigator, 'serviceWorker', {
      ready: Promise.resolve({ pushManager }),
    });
  }
  if (spec.standalone !== undefined) {
    define(navigator, 'standalone', spec.standalone);
  }
  // O `jsdom` não tem `matchMedia` (medido no docblock do host).
  define(window, 'matchMedia', () => ({
    matches: spec.displayModeStandalone ?? false,
  }));

  return { events };
}

describe('browserPushDevice — a cola que lê os globais de verdade', () => {
  /**
   * ⚠️ **O PAR POSITIVO DA COLA, E ELE PRECISOU DE MEDIÇÃO PARA EXISTIR.**
   *
   * A auditoria desta fatia mediu que, com **só** a asserção de `jsdom`
   * abaixo, trocar `isSecureContext: window.isSecureContext` por
   * `isSecureContext: false` passava em **728/728 testes, zero acusadores** —
   * e o mesmo valia para `hasServiceWorker: 'serviceWorker' in navigator` →
   * `true`. Ou seja: o push podia ficar bloqueado em **todo** navegador, com a
   * frase "abra por https", e nada acusaria. A causa era o curto-circuito: em
   * `jsdom` o contexto inseguro ganha primeiro, e as outras seis leituras
   * cruas ficavam atrás dela, inobserváveis.
   *
   * ⚠️ **A saída é o §7.10: antes de escrever "não é decidível aqui", tente a
   * ferramenta que ESCOLHE o ambiente.** As sete leituras cruas são
   * `Object.defineProperty` em jsdom 25 — **as sete**, medido: nenhuma delas
   * sequer existe no `window`/`navigator` de partida, então definir e apagar
   * devolve o ambiente ao estado exato de antes. Cada teste abaixo vira UMA
   * leitura crua numa propriedade decidível:
   *
   * | leitura crua | o acusador |
   * | --- | --- |
   * | `window.isSecureContext` | os dois primeiros testes, um de cada lado |
   * | `'Notification' in window` | `nothing is wrong` e `no Notification` |
   * | `'serviceWorker' in navigator` | `nothing is wrong` e `no serviceWorker` |
   * | `'PushManager' in window` | `nothing is wrong` e `no PushManager` |
   * | `navigator.standalone` | `blames the iPhone` |
   * | `Notification.permission` | `blames the denied permission` |
   * | `navigator.serviceWorker.ready` | `reads the registration` |
   *
   * E de lambuja, as duas leituras que não estavam na lista das sete:
   * `matchMedia` (`platform`) e `Notification.requestPermission` (`subscribes`).
   */
  it('⚠️ blames the insecure context in the jsdom of the suite, untouched', () => {
    // Sem nada montado: `window.isSecureContext` **nem existe** em jsdom 25
    // (medido — é `undefined`, não `false`), e nenhum dos três globais existe.
    // A asserção pina QUAL das duas primeiras recusas ganha.
    expect(browserPushDevice().blockedBy()).toBe('insecureContext');
  });

  it('⚠️ says nothing is wrong once the real globals are all there', () => {
    installBrowser();

    expect(browserPushDevice().blockedBy()).toBeNull();
  });

  it('blames the insecure context even with the three globals present', () => {
    installBrowser({ secure: false });

    expect(browserPushDevice().blockedBy()).toBe('insecureContext');
  });

  it.each([
    ['no Notification', { notification: false }],
    ['no serviceWorker', { serviceWorker: false }],
    ['no PushManager', { pushManager: false }],
  ])('blames the browser with %s', (_name, missing) => {
    installBrowser(missing);

    expect(browserPushDevice().blockedBy()).toBe('unsupported');
  });

  it('⚠️ blames the iPhone when navigator.standalone is false', () => {
    installBrowser({ standalone: false });

    expect(browserPushDevice().blockedBy()).toBe('iosNotInstalled');
  });

  it('blames the denied permission read from the real Notification global', () => {
    installBrowser({ permission: 'denied' });

    expect(browserPushDevice().blockedBy()).toBe('permissionDenied');
  });

  it('⚠️ reads the registration from navigator.serviceWorker.ready', async () => {
    const { events } = installBrowser({ existing: aSubscription([]) });

    expect(await browserPushDevice().current()).toEqual(A_SUBSCRIPTION);
    // Contador, nunca cronômetro (§7.3): o `ready` de verdade foi esperado.
    expect(events).toEqual(['getSubscription']);
  });

  it('reads the display mode from the real matchMedia', () => {
    installBrowser({ displayModeStandalone: true });

    expect(browserPushDevice().platform()).toBe('mobile');
  });

  it('asks the real Notification.requestPermission before subscribing', async () => {
    const { events } = installBrowser();

    expect(await browserPushDevice().subscribe(FAKE_KEY_BASE64URL)).toEqual(
      A_SUBSCRIPTION,
    );
    expect(events).toEqual(['requestPermission', 'subscribe']);
  });
});
