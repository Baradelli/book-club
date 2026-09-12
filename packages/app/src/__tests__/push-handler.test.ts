import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

/**
 * ⚠️ **O `push-handler.js` — O ÚNICO CÓDIGO DESTE PROJETO QUE RODA FORA DO APP,
 * E O ÚNICO QUE NENHUMA OUTRA REDE OLHA.**
 *
 * Ele mora em `public/`, não passa pelo TypeScript nem pelo bundler
 * (`docs/NOTIFICACOES.md` §2: *"arquivo pequeno, sem build, sem imports"*), e é
 * executado pelo **service worker** — um contexto em que uma exceção não
 * aparece no console de ninguém, não sobe para nenhum log, e o sintoma é
 * "a notificação simplesmente não chegou".
 *
 * Daí este arquivo: ele **lê o `.js` de verdade** e o executa com um `self` de
 * mentira. É o mesmo molde do `service-worker-config.test.ts` (leitura estática
 * do que o build consome), com um passo a mais — aqui o arquivo não é só lido,
 * é **rodado**.
 *
 * ⚠️ **REGRA 6 — PAYLOAD TORTO NÃO PODE EXPLODIR.** `event.data` ausente, JSON
 * inválido, campo faltando: cada um tem de resultar em **nada acontecendo**,
 * nunca numa exceção dentro do service worker.
 */

// `process.cwd()` e não `import.meta.url`: no ambiente jsdom do Vitest o módulo
// não tem URL de arquivo (a mesma razão do `service-worker-config.test.ts`).
const handlerSource = readFileSync(
  resolve(process.cwd(), 'public/push-handler.js'),
  'utf8',
);

interface ShownNotification {
  title: unknown;
  options: unknown;
}

interface FakeClient {
  url: string;
  navigated: string[];
  focused: number;
  navigate?: (url: string) => Promise<FakeClient>;
  focus: () => Promise<FakeClient>;
}

function aClient(url: string, withNavigate = true): FakeClient {
  const client: FakeClient = {
    url,
    navigated: [],
    focused: 0,
    focus: async () => {
      client.focused += 1;
      return client;
    },
  };
  if (withNavigate) {
    client.navigate = async (target: string) => {
      client.navigated.push(target);
      return client;
    };
  }
  return client;
}

/** O `self` do service worker, reduzido ao que o handler toca. */
class FakeServiceWorkerGlobalScope {
  readonly listeners = new Map<string, (event: unknown) => void>();
  readonly shown: ShownNotification[] = [];
  readonly openedWindows: string[] = [];
  windowClients: FakeClient[] = [];

  readonly registration = {
    showNotification: async (title: unknown, options: unknown) => {
      this.shown.push({ title, options });
    },
  };

  readonly clients = {
    matchAll: async (): Promise<FakeClient[]> => this.windowClients,
    openWindow: async (url: string): Promise<null> => {
      this.openedWindows.push(url);
      return null;
    },
  };

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, listener);
  }
}

/** Uma passada do `event.waitUntil`, para o teste poder esperar por ela. */
class FakeExtendableEvent {
  readonly pending: Promise<unknown>[] = [];

  waitUntil(promise: Promise<unknown>): void {
    this.pending.push(promise);
  }

  async settle(): Promise<void> {
    await Promise.all(this.pending);
  }
}

class FakePushEvent extends FakeExtendableEvent {
  constructor(readonly data: { json: () => unknown } | null) {
    super();
  }
}

class FakeNotificationClickEvent extends FakeExtendableEvent {
  closed = 0;
  readonly notification: { data: unknown; close: () => void };

  constructor(data: unknown) {
    super();
    this.notification = {
      data,
      close: () => {
        this.closed += 1;
      },
    };
  }
}

describe('push-handler.js', () => {
  let scope: FakeServiceWorkerGlobalScope;

  function fire(type: string, event: FakeExtendableEvent): void {
    const listener = scope.listeners.get(type);
    if (listener === undefined) {
      throw new Error(`the handler registered no "${type}" listener`);
    }
    listener(event);
  }

  beforeEach(() => {
    scope = new FakeServiceWorkerGlobalScope();
    // Executa o arquivo de verdade, com `self` trocado. Sem `import`: o handler
    // não tem nenhum, de propósito (§2).
    new Function('self', handlerSource)(scope);
  });

  /**
   * ⚠️ **O ANTÍDOTO (§7.4), e ele vem primeiro:** se o arquivo não registrasse
   * listener nenhum — um `typo` em `addEventListener`, um `return` cedo — todos
   * os testes de "não explode" abaixo passariam provando que o handler não
   * existe.
   */
  it('registers the two listeners the feature needs', () => {
    expect([...scope.listeners.keys()].sort()).toEqual([
      'notificationclick',
      'push',
    ]);
  });

  describe('push', () => {
    it('shows the notification of a well formed payload', async () => {
      const event = new FakePushEvent({
        json: () => ({
          title: 'O clube está lendo',
          body: 'Alguém do clube escreveu uma anotação.',
          tag: 'group_activity',
          url: '/books/book-1',
        }),
      });

      fire('push', event);
      await event.settle();

      expect(scope.shown).toEqual([
        {
          title: 'O clube está lendo',
          options: {
            body: 'Alguém do clube escreveu uma anotação.',
            tag: 'group_activity',
            data: { url: '/books/book-1' },
          },
        },
      ]);
    });

    /**
     * ⚠️ **O `waitUntil` NÃO É DECORAÇÃO.** Sem ele, o navegador pode encerrar
     * o service worker antes de a notificação aparecer — o bug é intermitente,
     * pior no celular (onde o SO mata o worker mais cedo), e parece "o push
     * não chega às vezes".
     */
    it('holds the service worker alive with waitUntil while it shows', () => {
      const event = new FakePushEvent({ json: () => ({ title: 'Oi' }) });

      fire('push', event);

      expect(event.pending).toHaveLength(1);
    });

    /**
     * REGRA 6, caso 1: **sem `event.data`**. Nada acontece, e nada estoura.
     *
     * ⚠️ **E o que este teste NÃO acusa, medido na rodada de conserto da 38:
     * a linha `if (!event.data) return;` do handler.** Apagá-la deixa este
     * teste **verde** — entre a guarda e o `try` não há operação nenhuma, então
     * o `event.data.json()` de um `data` nulo lança `TypeError` e cai no
     * **`catch` que já existe** (o do caso 2), com o mesmo resultado
     * observável: nada mostrado, nada propagado. O mutante é equivalente, com a
     * inalcançabilidade provada por leitura — não é dívida de teste.
     *
     * Quem sustenta o caso 1, portanto, é o `catch`; a guarda explícita fica
     * porque ela **diz a intenção** ("push vazio para acordar o worker é
     * normal") sem depender de uma exceção como fluxo de controle. Não escreva
     * teste para ela: não existe asserção que a distinga.
     */
    it('does nothing when there is no data at all', async () => {
      const event = new FakePushEvent(null);

      expect(() => {
        fire('push', event);
      }).not.toThrow();
      await event.settle();

      expect(scope.shown).toEqual([]);
    });

    /** REGRA 6, caso 2: **JSON inválido** — o `json()` do evento lança. */
    it('does nothing when the payload is not valid JSON', async () => {
      const event = new FakePushEvent({
        json: () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      });

      expect(() => {
        fire('push', event);
      }).not.toThrow();
      await event.settle();

      expect(scope.shown).toEqual([]);
    });

    /**
     * ⚠️ **REGRA 6, caso 3: CAMPO FALTANDO — e "nada acontecendo" aqui é mais
     * forte que "não estourou".**
     *
     * O esboço do `NOTIFICACOES.md` §2 chama `showNotification(title, …)` com o
     * que vier: sem `title`, o navegador mostra uma notificação com o título
     * **`"undefined"`** — ela acorda a pessoa para dizer nada. Uma notificação
     * errada é pior que nenhuma, então sem título não há notificação.
     */
    it.each([
      ['an empty object', {}],
      ['a payload with no title', { body: 'só corpo' }],
      ['a title that is not a string', { title: 42 }],
      ['an empty title', { title: '   ' }],
      ['a null payload', null],
      ['a string payload', 'nem é objeto'],
      ['an array payload', ['nem é objeto']],
    ])('does nothing for %s', async (_label, payload) => {
      const event = new FakePushEvent({ json: () => payload });

      expect(() => {
        fire('push', event);
      }).not.toThrow();
      await event.settle();

      expect(scope.shown).toEqual([]);
    });

    /**
     * O resto do payload é **opcional**, e a falta dele não pode impedir o
     * aviso: o que a pessoa precisa ver é o título. Sem `url`, o clique cai na
     * raiz (ver o `notificationclick` abaixo).
     */
    it('shows a title-only payload, with the optional fields left undefined', async () => {
      const event = new FakePushEvent({ json: () => ({ title: 'O clube' }) });

      fire('push', event);
      await event.settle();

      expect(scope.shown).toEqual([
        {
          title: 'O clube',
          options: {
            body: undefined,
            tag: undefined,
            data: { url: undefined },
          },
        },
      ]);
    });
  });

  describe('notificationclick', () => {
    /**
     * ⚠️ **§2: *"o clique tem de cair na tela certa, senão a notificação não
     * converte em leitura"*.** Com uma aba do clube aberta, ela é **navegada e
     * focada** — abrir uma segunda deixaria a pessoa com duas abas do mesmo
     * app, e é o defeito clássico deste handler.
     */
    it('navigates and focuses an open window instead of opening another', async () => {
      const client = aClient('https://clube.test/books/outro');
      scope.windowClients = [client];
      const event = new FakeNotificationClickEvent({ url: '/books/book-1' });

      fire('notificationclick', event);
      await event.settle();

      expect(client.navigated).toEqual(['/books/book-1']);
      expect(client.focused).toBe(1);
      expect(scope.openedWindows).toEqual([]);
    });

    it('closes the notification it was asked about', () => {
      const event = new FakeNotificationClickEvent({ url: '/books/book-1' });

      fire('notificationclick', event);

      expect(event.closed).toBe(1);
    });

    it('opens a window when the club has no tab open', async () => {
      scope.windowClients = [];
      const event = new FakeNotificationClickEvent({ url: '/books/book-1' });

      fire('notificationclick', event);
      await event.settle();

      expect(scope.openedWindows).toEqual(['/books/book-1']);
    });

    /**
     * Nem todo `Client` sabe navegar (o `navigate` é do `WindowClient`, e nem
     * todo navegador o expõe). Sem o `'navigate' in client`, isto seria um
     * `TypeError` dentro do service worker — o clique não faria nada, e ninguém
     * veria o erro.
     */
    it('falls back to opening a window when the client cannot navigate', async () => {
      scope.windowClients = [aClient('https://clube.test/', false)];
      const event = new FakeNotificationClickEvent({ url: '/books/book-1' });

      fire('notificationclick', event);
      await event.settle();

      expect(scope.openedWindows).toEqual(['/books/book-1']);
    });

    /** REGRA 6 outra vez, do outro lado: notificação sem `data` não estoura. */
    it.each([
      ['no data', undefined],
      ['null data', null],
      ['data with no url', {}],
    ])(
      'falls back to the root when the notification has %s',
      async (_label, data) => {
        scope.windowClients = [];
        const event = new FakeNotificationClickEvent(data);

        expect(() => {
          fire('notificationclick', event);
        }).not.toThrow();
        await event.settle();

        expect(scope.openedWindows).toEqual(['/']);
      },
    );
  });
});
