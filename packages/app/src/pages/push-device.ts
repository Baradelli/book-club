import {
  type BrowserPushSubscription,
  browserPushSubscriptionSchema,
  type NotificationPlatform,
} from '@clube/shared';

/**
 * A COSTURA COM O NAVEGADOR — tudo o que a tela de preferências precisa saber
 * sobre `Notification`, `serviceWorker` e `PushManager`, e **nada mais**
 * (Tarefa 36b, decisão I).
 *
 * ⚠️ **POR QUE UMA COSTURA, e não `navigator` direto na tela.** O `jsdom` não
 * tem `PushManager`, não tem `Notification` e não tem `serviceWorker`: sem esta
 * fronteira, todo teste da tela precisaria forjar três globais — e um teste que
 * forja global testa o forjado. Aqui a divisão é outra e é o que torna a regra
 * decidível: o **host** carrega as leituras cruas (`'Notification' in window`,
 * `navigator.standalone`, `window.isSecureContext`) e o `createPushDevice`
 * carrega a REGRA (qual das quatro recusas vale, em que ordem, e o que
 * acontece no toque). A regra tem teste; e a leitura crua tem par positivo
 * **por leitura**, não um só.
 *
 * ⚠️ **E ISSO FOI CONSERTO, NÃO DESENHO.** A fatia nasceu com um único teste da
 * cola (`blockedBy()` responde `insecureContext` no jsdom), e a auditoria
 * mediu o preço: trocar `isSecureContext: window.isSecureContext` por
 * `isSecureContext: false` passava em **728/728 testes, zero acusadores** — o
 * push ficaria bloqueado em **todo** navegador, com a frase "abra por https", e
 * nada acusaria. O mesmo valia para `hasServiceWorker` → `true`. A causa era o
 * curto-circuito: no jsdom o contexto inseguro ganha primeiro, e as outras seis
 * leituras ficavam atrás dela. A saída é o §7.10 (tente a ferramenta que
 * ESCOLHE o ambiente): as sete leituras são `Object.defineProperty` em jsdom
 * 25, e cada uma virou uma propriedade decidível em `push-device.test.ts`.
 *
 * ⚠️ **E O DUBLÊ SABE RECUSAR COMO O DE VERDADE RECUSA** (§7.1 aplicado à
 * costura): as quatro recusas da decisão G são produzíveis pelo host falso, a
 * quarta inclusive — a do iPhone fora da tela de início, que é a que **não
 * parece falha**. Um dublê que só soubesse dizer "sim" contaria uma mentira mais
 * fácil que a realidade.
 *
 * ⚠️ **MORA EM `packages/app`, NÃO EM `packages/ui`** — e isto contraria o §7 do
 * `docs/NOTIFICACOES.md` de propósito (decisão J). O `CLAUDE.md` diz que
 * `packages/ui` é de componentes **compartilhados**; isto tem um chamador só,
 * fala com `navigator` e `Notification` (que `packages/ui` não toca em lugar
 * nenhum) e conversa com a API. É o precedente do §7.1 que recusou subir o
 * `matchesText` enquanto ele tivesse um chamador só. Quando houver um segundo
 * chamador, ele sobe — com o segundo chamador na mão.
 *
 * Contador canônico de linhas (o comando do docblock de `acervo.tsx`): **124**.
 */

/**
 * AS QUATRO RECUSAS (decisão G) — quatro causas com quatro consertos
 * diferentes, e é por isso que elas são quatro valores e não um `boolean`:
 *
 * | recusa | o conserto |
 * | --- | --- |
 * | `insecureContext` | abrir por HTTPS ou `localhost` |
 * | `unsupported` | usar outro navegador |
 * | `iosNotInstalled` | adicionar o PWA à tela de início |
 * | `permissionDenied` | reverter a permissão no navegador |
 *
 * Uma frase genérica de "não deu" manda a pessoa adivinhar qual das quatro.
 */
export const PUSH_BLOCKERS = [
  'insecureContext',
  'unsupported',
  'iosNotInstalled',
  'permissionDenied',
] as const;

export type PushBlocker = (typeof PUSH_BLOCKERS)[number];

/**
 * A recusa que só aparece no TOQUE — `Notification.requestPermission()` é uma
 * pergunta, e a resposta chega depois de o dedo cair no botão.
 *
 * Classe própria, e não uma string de erro, porque a tela precisa do `blocker`
 * para escolher qual das quatro frases mostrar.
 */
export class PushDeviceError extends Error {
  readonly blocker: PushBlocker;

  constructor(blocker: PushBlocker) {
    super(`push device blocked: ${blocker}`);
    this.name = 'PushDeviceError';
    this.blocker = blocker;
  }
}

/**
 * ⚠️ **`Uint8Array<ArrayBuffer>`, e não `Uint8Array` solto** — medido no
 * `pnpm -r typecheck` desta fatia.
 *
 * Desde o TS 5.7 o `Uint8Array` é genérico no buffer, e o `Uint8Array` sem
 * argumento resolve `Uint8Array<ArrayBufferLike>` — que inclui
 * `SharedArrayBuffer` e por isso **não** é atribuível ao `BufferSource` que o
 * `PushSubscriptionOptionsInit` do lib.dom exige. O erro só aparece no
 * `browserPushDevice`, onde o `pushManager` de verdade encontra o nosso
 * `PushManagerLike`: o alias existe para a costura falar o mesmo tipo que o
 * navegador, em vez de um `as` na fronteira.
 */
type ApplicationServerKey = Uint8Array<ArrayBuffer>;

/** O pedaço do `PushSubscription` do navegador que nos interessa. */
export interface PushSubscriptionLike {
  endpoint: string;
  toJSON(): unknown;
  unsubscribe(): Promise<boolean>;
}

export interface PushManagerLike {
  subscribe(options: {
    userVisibleOnly: boolean;
    applicationServerKey: ApplicationServerKey;
  }): Promise<PushSubscriptionLike>;
  getSubscription(): Promise<PushSubscriptionLike | null>;
}

export interface PushRegistrationLike {
  pushManager: PushManagerLike;
}

/**
 * AS LEITURAS CRUAS DO NAVEGADOR — nenhuma decisão mora aqui.
 *
 * Os booleanos são um instantâneo (nenhum deles muda durante a sessão: o
 * endereço, os globais e o modo de exibição são do carregamento). A
 * **permissão** é função, porque ela muda no meio: a pessoa responde o diálogo
 * e a resposta precisa valer no render seguinte.
 */
export interface PushDeviceHost {
  /** `window.isSecureContext` — HTTPS ou `localhost`. */
  isSecureContext: boolean;
  /** `'Notification' in window` */
  hasNotification: boolean;
  /** `'serviceWorker' in navigator` */
  hasServiceWorker: boolean;
  /** `'PushManager' in window` */
  hasPushManager: boolean;
  /**
   * `navigator.standalone` — propriedade **só** do Safari do iPhone.
   *
   * ⚠️ `undefined` significa "não é iPhone", **não** "não está instalado": é
   * feature-detect, não farejamento de `userAgent`. `false` é o caso cruel da
   * decisão G (iPhone, mas fora da tela de início).
   */
  iosStandalone: boolean | undefined;
  /**
   * `matchMedia('(display-mode: standalone)').matches` — o PWA instalado, em
   * qualquer plataforma.
   *
   * ⚠️ **FUNÇÃO, e a razão é MEDIDA:** o `jsdom` **não tem** `window.matchMedia`
   * (`TypeError: window.matchMedia is not a function`, medido nesta fatia). Com
   * a leitura feita na criação do host, `browserPushDevice()` explodiria em todo
   * teste que apenas perguntasse `blockedBy()` — e a saída fácil seria um
   * `typeof … === 'function'` de código defensivo que só existe por causa do
   * ambiente de teste. Lida sob demanda, ela só é tocada por `platform()`, ou
   * seja, por quem está de fato se inscrevendo num navegador de verdade.
   */
  displayModeStandalone(): boolean;
  permission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  registration(): Promise<PushRegistrationLike>;
}

export interface PushDevice {
  /** Por que este aparelho **não** pode se inscrever — `null` quando pode. */
  blockedBy(): PushBlocker | null;
  platform(): NotificationPlatform;
  subscribe(vapidPublicKey: string): Promise<BrowserPushSubscription>;
  current(): Promise<BrowserPushSubscription | null>;
  unsubscribe(): Promise<void>;
}

/**
 * ⚠️ **BASE64URL → BYTES, E ELA É A LINHA QUE ERRA EM SILÊNCIO** (regra 15).
 *
 * O `applicationServerKey` do `pushManager.subscribe` é `Uint8Array`, não
 * string: a chave P-256 descomprimida tem **65 bytes** e começa com `0x04`. Uma
 * conversão torta produz inscrição que o serviço de push **aceita** e nunca
 * entrega — não há erro para ninguém ver.
 *
 * Duas diferenças entre base64url e base64, e elas **não valem o mesmo**:
 *
 * 1. **`-_` → `+/` é obrigatório e tem acusador.** Medido: `atob('-_-_')` lança
 *    `InvalidCharacterError`, e uma chave VAPID de verdade quase sempre tem um
 *    dos dois caracteres (a falsa de 87 caracteres do teste tem os dois).
 * 2. ⚠️ **O padding `=` NÃO tem acusador, e a afirmação contrária estava na
 *    spec.** Medido no Node 20 e no navegador: o `atob` implementa o
 *    *forgiving-base64* do WHATWG, que aceita entrada sem padding —
 *    `atob('//8')` e `atob('//8=')` devolvem os **mesmos** bytes, e a chave de
 *    87 caracteres (87 % 4 = 3) decodifica para os mesmos 65 bytes com e sem o
 *    `=`. ⚠️ **E medido por MUTAÇÃO nesta fatia: `const padding = ''` passa em
 *    728/728 testes do app — zero acusadores; RECONFERIDO na rodada de
 *    conserto, com a suíte já em 744/744, e continua zero.** A linha fica, porque ela é
 *    grátis e porque um decodificador estrito
 *    (`Buffer.from(s, 'base64')` de um dia futuro, ou um polyfill) a exige —
 *    mas ela é registrada aqui como **sem acusador**, e não afirmada como
 *    guarda (§7.10: "não é testável" e "é testado" precisam os dois de
 *    medição).
 */
export function urlBase64ToUint8Array(base64Url: string): ApplicationServerKey {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/gu, '+').replace(/_/gu, '/');
  const binary = atob(base64);

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * ⚠️ **A INSCRIÇÃO DO NAVEGADOR PASSA PELO SCHEMA DE `shared`** — o §6.8 na
 * outra ponta.
 *
 * O `toJSON()` de um `PushSubscription` é `unknown` para nós: é o navegador que
 * o preenche, e navegadores acrescentam campo. Validar aqui é o que impede um
 * `POST` torto de sair daqui e virar 400 do outro lado, onde ninguém saberia de
 * qual aparelho veio.
 */
function toContract(
  subscription: PushSubscriptionLike,
): BrowserPushSubscription {
  return browserPushSubscriptionSchema.parse(subscription.toJSON());
}

export function createPushDevice(host: PushDeviceHost): PushDevice {
  async function pushManager(): Promise<PushManagerLike> {
    return (await host.registration()).pushManager;
  }

  return {
    blockedBy() {
      /*
        ⚠️ A ORDEM É A DECISÃO, não o acaso das linhas. Num `http://` que não é
        `localhost` o navegador NÃO expõe `serviceWorker` nem `PushManager`:
        o feature-detect também falha, e responder "seu navegador não suporta"
        mandaria a pessoa trocar de navegador para consertar o ENDEREÇO.
      */
      if (!host.isSecureContext) return 'insecureContext';
      if (!host.hasNotification) return 'unsupported';
      if (!host.hasServiceWorker) return 'unsupported';
      if (!host.hasPushManager) return 'unsupported';
      // A quarta recusa, e a única que passa pelo feature-detect inteiro.
      if (host.iosStandalone === false) return 'iosNotInstalled';
      if (host.permission() === 'denied') return 'permissionDenied';
      return null;
    },

    platform() {
      return host.iosStandalone === true || host.displayModeStandalone()
        ? 'mobile'
        : 'web';
    },

    async subscribe(vapidPublicKey) {
      // A ORDEM da regra 14: perguntar, esperar o service worker, inscrever.
      const answer = await host.requestPermission();
      if (answer !== 'granted') throw new PushDeviceError('permissionDenied');

      const subscription = await (
        await pushManager()
      ).subscribe({
        // ⚠️ OBRIGATÓRIO: o Chrome recusa a inscrição sem ele, e a recusa vem
        // como exceção — não como `null`.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      return toContract(subscription);
    },

    async current() {
      const subscription = await (await pushManager()).getSubscription();
      return subscription === null ? null : toContract(subscription);
    },

    async unsubscribe() {
      const subscription = await (await pushManager()).getSubscription();
      if (subscription !== null) await subscription.unsubscribe();
    },
  };
}

/**
 * A COLA — e é a única coisa deste arquivo que toca global.
 *
 * ⚠️ **Função, e não constante de módulo:** ela lê `window` e `navigator` na
 * hora em que a tela monta, não na hora em que o módulo é importado. Um
 * `matchMedia` no escopo de módulo rodaria no import de **qualquer** teste que
 * alcançasse o `router.tsx`.
 */
export function browserPushDevice(): PushDevice {
  const nav: Navigator & { standalone?: boolean } = navigator;

  return createPushDevice({
    isSecureContext: window.isSecureContext,
    hasNotification: 'Notification' in window,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    iosStandalone: nav.standalone,
    displayModeStandalone: () =>
      window.matchMedia('(display-mode: standalone)').matches,
    // Só chamados quando o feature-detect passou — é por isso que são funções.
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    registration: () => navigator.serviceWorker.ready,
  });
}
