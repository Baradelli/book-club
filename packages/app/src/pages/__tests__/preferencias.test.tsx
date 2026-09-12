import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import type {
  BrowserPushSubscription,
  NotificationConfigResponse,
  SettingsResponse,
} from '@clube/shared';
import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { pt } from '@clube/shared/locales';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import type { ClubSummary } from '../../club/active-club';
import { SETTINGS_PATH } from '../paths';
import type { PushBlocker, PushDevice } from '../push-device';
import { PushDeviceError } from '../push-device';
import { stripComments } from './anti-guilt-dom';
import {
  memoryStorage,
  meReply,
  readableText,
  type RecordedRequest,
  renderPage,
  type Reply,
  replyByUrl,
  requestsTo,
  stubFetch,
} from './harness';

/**
 * A TELA MÍNIMA DE PREFERÊNCIAS (Tarefa 36b) — três controles e o aparelho.
 *
 * Entra pelo `<App />` inteiro, como as telas 16 a 29: metade do que a fatia
 * entrega é composição — a rota nova, o `RequireAuth` que a protege e a entrada
 * no cabeçalho.
 *
 * ⚠️ **O APARELHO ENTRA POR `vi.mock`, E ISSO É A COSTURA DA DECISÃO I.** O
 * `jsdom` não tem `PushManager`, `Notification` nem `serviceWorker`: sem a
 * costura, cada teste daqui forjaria três globais — e um teste que forja global
 * testa o forjado. O dublê abaixo **sabe recusar como o de verdade recusa** (as
 * quatro da decisão G), e a REGRA de cada recusa tem teste próprio em
 * `push-device.test.ts`, contra um host falso.
 *
 * ⚠️ **A VARREDURA ANTI-CULPA DESTA TELA É A DO VOCABULÁRIO, E ELA NÃO MORA
 * AQUI** (regra 11, §7.9): `GUILT_TERMS` percorre `pt` **e** `en` inteiros em
 * `packages/shared/src/locales/__tests__/anti-guilt.test.ts`, e as chaves desta
 * fatia entram nela por construção. **Não** existe aqui a guarda de "nenhum
 * dígito" do feed (Tarefa 35): nesta tela o dígito é legítimo e obrigatório
 * (`07:30` **é** um número), e guarda copiada para onde a propriedade não vale
 * é a guarda no lugar errado — que o §7.9 diz ser pior que nenhuma.
 *
 * ⚠️ **NENHUMA CHAVE REAL** (regra 7): a chave pública abaixo é inventada, tem
 * forma de base64url e o nome diz que é falsa.
 */

const push = vi.hoisted(() => ({ device: null as PushDevice | null }));

vi.mock('../push-device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../push-device')>();
  return {
    ...actual,
    browserPushDevice: (): PushDevice => {
      if (push.device === null) {
        throw new Error('o teste não montou o dublê do aparelho');
      }
      return push.device;
    },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.device = null;
});

const CASAL: ClubSummary = {
  id: 'c-casal',
  name: 'Clube do Casal',
  role: 'OWNER',
};

const SESSION: Record<string, string> = {
  [TOKEN_STORAGE_KEY]: 'token-da-sessao',
};

/** ⚠️ Inventada. Forma de base64url, 87 caracteres, e nada de real dentro. */
const FAKE_PUBLIC_KEY_NOT_A_REAL_ONE =
  'BAcOFRwjKjE4P0ZNVFtiaXB3foWMk5qhqK-2vcTL0tng5-71_AMKERgfJi00O0JJUFdeZWxzeoGIj5adpKuyucA';

const AN_ENDPOINT = 'https://push.exemplo.test/aparelho-do-marcos';

const A_SUBSCRIPTION: BrowserPushSubscription = {
  endpoint: AN_ENDPOINT,
  keys: { p256dh: 'p256dh-de-mentira', auth: 'auth-de-mentira' },
};

/** Fixture é factory, com `overrides` (§7.7). */
function someSettings(
  overrides: Partial<SettingsResponse> = {},
): SettingsResponse {
  return {
    timezone: 'America/Sao_Paulo',
    locale: 'pt',
    reminderTime: '07:30',
    reminderEnabled: true,
    notifyGroupActivity: false,
    ...overrides,
  };
}

function someConfig(
  overrides: Partial<NotificationConfigResponse> = {},
): NotificationConfigResponse {
  return {
    enabled: true,
    vapidPublicKey: FAKE_PUBLIC_KEY_NOT_A_REAL_ONE,
    ...overrides,
  };
}

interface FakeDeviceOptions {
  blocker?: PushBlocker;
  subscribed?: boolean;
  platform?: 'web' | 'mobile';
  /** O que `subscribe` lança — a recusa que só aparece no TOQUE. */
  subscribeThrows?: unknown;
  /**
   * ⚠️ **O NAVEGADOR QUE NÃO RESPONDE — §7.1 na direção restritiva**, e foi a
   * auditoria desta fatia que o achou: enquanto o dublê só sabia **responder**,
   * o `.catch` do `device.current()` na `push-section.tsx` ficava sem um único
   * acusador (medido: trocá-lo por `setState('active')` passava em 728/728).
   * Num aparelho em que `navigator.serviceWorker.ready` rejeita, a tela passaria
   * a dizer "os avisos estão ativados" para quem não recebe aviso nenhum — a
   * pior forma desta tela errar (regra 10).
   *
   * ⚠️ **O que NÃO foi ensinado aqui, e o motivo:** `unsubscribe()` que rejeita.
   * Ele cairia no MESMO `catch` do `deactivate` que o teste do `DELETE` que
   * falha já acusa — seria cobrir duas vezes a mesma linha. A rejeição do
   * `unsubscribe` tem acusador onde ela é de fato outra linha: o
   * `push-device.test.ts`, no `await` da costura.
   */
  currentThrows?: unknown;
}

interface FakeDevice {
  device: PushDevice;
  /** ⚠️ A ORDEM dos gestos, e é ela que prova a regra 16 (§7.3). */
  order: string[];
  /** As chaves públicas que a tela mandou inscrever (decisão E). */
  keys: string[];
}

/**
 * O DUBLÊ DO APARELHO — e ele sabe RECUSAR como o de verdade recusa (§7.1).
 *
 * O `order` é compartilhado com o espião de `fetch`: é assim que "o `DELETE`
 * acontece ANTES do `unsubscribe`" vira uma asserção exata, e não um
 * "não quebrou".
 */
function fakeDevice(
  options: FakeDeviceOptions = {},
  order: string[] = [],
): FakeDevice {
  let subscription: BrowserPushSubscription | null =
    options.subscribed === true ? A_SUBSCRIPTION : null;
  const keys: string[] = [];

  const device: PushDevice = {
    blockedBy: () => options.blocker ?? null,
    platform: () => options.platform ?? 'web',
    subscribe: async (vapidPublicKey) => {
      order.push('subscribe');
      keys.push(vapidPublicKey);
      if (options.subscribeThrows !== undefined) throw options.subscribeThrows;
      subscription = A_SUBSCRIPTION;
      return A_SUBSCRIPTION;
    },
    current: async () => {
      if (options.currentThrows !== undefined) throw options.currentThrows;
      return subscription;
    },
    unsubscribe: async () => {
      order.push('unsubscribe');
      subscription = null;
    },
  };

  return { device, order, keys };
}

interface Setup {
  settings?: Reply;
  config?: Reply;
  /** A resposta do `POST`/`DELETE` de inscrição. */
  subscriptions?: Reply;
  /** Uma resposta, ou a FILA delas — para o servidor que volta. */
  patch?: Reply | readonly Reply[];
  device?: FakeDeviceOptions;
  path?: string;
  storage?: Record<string, string>;
}

async function renderSettings(
  setup: Setup = {},
): Promise<{ calls: RecordedRequest[]; order: string[]; keys: string[] }> {
  const order: string[] = [];
  const fake = fakeDevice(setup.device ?? {}, order);
  push.device = fake.device;
  let patchIndex = 0;

  const calls = stubFetch(
    replyByUrl(
      [
        /*
          ⚠️ `/me/settings` ANTES de `/me`: o `replyByUrl` casa por FRAGMENTO e
          o primeiro que casa ganha — com a ordem trocada, toda leitura de
          preferências receberia o corpo do `/me` e viraria `ApiError` de corpo
          fora do contrato (§6.8), com a tela em "não foi possível abrir".
        */
        [
          '/me/settings',
          (request) => {
            if (request.method !== 'PATCH') {
              return setup.settings ?? { status: 200, body: someSettings() };
            }
            const configured = setup.patch ?? {
              status: 200,
              body: someSettings(),
            };
            const reply = Array.isArray(configured)
              ? ((configured[patchIndex] ??
                  configured[configured.length - 1]) as Reply)
              : (configured as Reply);
            patchIndex += 1;
            return reply;
          },
        ],
        ['/me', meReply({ clubs: [CASAL] })],
        [
          '/notifications/config',
          setup.config ?? { status: 200, body: someConfig() },
        ],
        [
          '/notifications/subscriptions',
          (request) => {
            order.push(request.method);
            return (
              setup.subscriptions ??
              (request.method === 'DELETE'
                ? { status: 204, raw: '' }
                : {
                    status: 201,
                    body: {
                      id: 'ps-1',
                      platform: 'web',
                      endpoint: AN_ENDPOINT,
                      userAgent: null,
                      disabledAt: null,
                      createdAt: '2026-09-11T00:00:00.000Z',
                    },
                  })
            );
          },
        ],
      ],
      { status: 404, body: { error: 'not found' } },
    ),
  );

  await act(async () => {
    renderPage(<App />, {
      path: setup.path ?? SETTINGS_PATH,
      storage: memoryStorage({ ...SESSION, ...setup.storage }),
    });
    await Promise.resolve();
  });

  return { calls, order, keys: fake.keys };
}

const TIME_LABEL = pt.pages.settings.reminderTime;
const REMINDER_LABEL = pt.pages.settings.reminderEnabled;
const ACTIVITY_LABEL = pt.pages.settings.notifyGroupActivity;

function timeInput(): HTMLInputElement {
  const input = screen.getByLabelText(TIME_LABEL);
  if (!(input instanceof HTMLInputElement)) throw new Error('não é um input');
  return input;
}

function checkbox(name: string): HTMLInputElement {
  const control = screen.getByRole('checkbox', { name });
  if (!(control instanceof HTMLInputElement)) throw new Error('não é um input');
  return control;
}

/** Só os `PATCH` — o `GET` do clube ativo não é assunto de nenhum destes. */
function patches(calls: readonly RecordedRequest[]): RecordedRequest[] {
  return requestsTo(calls, '/me/settings').filter(
    (call) => call.method === 'PATCH',
  );
}

describe('a rota e a entrada no cabeçalho (regras 2 e 3)', () => {
  it('opens from the header, with a link that the screen reader can name', async () => {
    await renderSettings({ path: '/' });

    const entry = screen.getByRole('link', { name: pt.nav.settings });
    await act(async () => {
      fireEvent.click(entry);
      await Promise.resolve();
    });

    expect(screen.getByTestId('location').textContent).toBe(SETTINGS_PATH);
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: pt.pages.settings.title }),
      ).not.toBeNull();
    });
  });

  it('is behind RequireAuth — no session, no preferences', async () => {
    push.device = fakeDevice().device;
    stubFetch(() => ({ status: 200, body: {} }));

    await act(async () => {
      renderPage(<App />, {
        path: SETTINGS_PATH,
        storage: memoryStorage(),
      });
      await Promise.resolve();
    });

    expect(screen.getByTestId('location').textContent).toBe('/login');
    expect(
      screen.queryByRole('heading', { name: pt.pages.settings.title }),
    ).toBeNull();
  });

  it('does not offer the entry to someone who is not signed in', async () => {
    push.device = fakeDevice().device;
    stubFetch(() => ({ status: 200, body: {} }));

    await act(async () => {
      renderPage(<App />, { path: '/login', storage: memoryStorage() });
      await Promise.resolve();
    });

    expect(screen.queryByRole('link', { name: pt.nav.settings })).toBeNull();
  });
});

describe('carregar as três preferências (regra 5)', () => {
  it('shows what the API said — the hour and the two switches', async () => {
    await renderSettings({
      settings: {
        status: 200,
        body: someSettings({
          reminderTime: '21:05',
          reminderEnabled: false,
          notifyGroupActivity: true,
        }),
      },
    });

    await waitFor(() => {
      expect(timeInput().value).toBe('21:05');
    });
    expect(checkbox(REMINDER_LABEL).checked).toBe(false);
    expect(checkbox(ACTIVITY_LABEL).checked).toBe(true);
  });

  it('reads the settings AND the push config, once each', async () => {
    const { calls } = await renderSettings();

    await waitFor(() => {
      expect(
        screen.queryByRole('checkbox', { name: REMINDER_LABEL }),
      ).not.toBeNull();
    });

    expect(requestsTo(calls, '/me/settings')).toHaveLength(1);
    expect(requestsTo(calls, '/notifications/config')).toHaveLength(1);
  });

  it('says it could not open them, and tries again on demand', async () => {
    const { calls } = await renderSettings({
      settings: { status: 500, body: { error: 'boom' } },
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.settings.failed);
    });
    /*
      ⚠️ E aqui a tela INTEIRA cai, de propósito — é a metade assimétrica do
      teste do `/notifications/config` logo abaixo. Sem as preferências não há
      o que editar: mostrar interruptores sem valor carregado seria a tela
      inventando o estado do banco.
    */
    expect(screen.queryByRole('checkbox', { name: REMINDER_LABEL })).toBeNull();
    expect(requestsTo(calls, '/me/settings')).toHaveLength(1);

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: pt.pages.settings.retry }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(requestsTo(calls, '/me/settings')).toHaveLength(2);
    });
  });

  /**
   * ⚠️ **O SECUNDÁRIO NÃO LEVA O PRINCIPAL JUNTO.**
   *
   * Medido na auditoria desta fatia, com `/me/settings` em 200 e
   * `/notifications/config` em 500: a tela inteira dizia "Não foi possível
   * abrir suas preferências", e o texto colado do DOM era "campo de horário
   * presente? false · switches: 0 · PATCHes emitidos: 0". Uma queda **só** do
   * endpoint de push impedia mexer no horário do lembrete e nos dois
   * interruptores, que não dependem de push nenhum.
   *
   * ⚠️ E o recado do aparelho é o DELE, não o de `enabled: false`: fundir os
   * dois faria uma indisponibilidade falar a língua do estado normal de quem
   * clona o projeto sem VAPID (decisão F).
   */
  it('⚠️ keeps the three preferences working when only /notifications/config falls', async () => {
    const { calls } = await renderSettings({
      config: { status: 500, body: { error: 'boom' } },
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.settings.device.configFailed);
    });
    // A tela NÃO caiu, e a queda não virou "push não configurado".
    expect(readableText()).not.toContain(pt.pages.settings.failed);
    expect(readableText()).not.toContain(pt.pages.settings.device.unavailable);

    // Os três controles estão lá — e o horário grava.
    expect(timeInput().value).toBe('07:30');
    expect(
      screen.queryByRole('checkbox', { name: REMINDER_LABEL }),
    ).not.toBeNull();
    expect(
      screen.queryByRole('checkbox', { name: ACTIVITY_LABEL }),
    ).not.toBeNull();

    await act(async () => {
      fireEvent.change(timeInput(), { target: { value: '22:15' } });
      await Promise.resolve();
    });

    // ⚠️ Contador (§7.3): "a tela renderizou" não é a regra — a regra é que a
    // preferência CHEGA ao servidor mesmo com o push indisponível.
    await waitFor(() => {
      expect(patches(calls)).toHaveLength(1);
    });
    expect(patches(calls)[0]?.body).toEqual({ reminderTime: '22:15' });
  });
});

describe('cada controle salva sozinho, com UM campo (regra 8, decisão C)', () => {
  it('sends only reminderTime when the hour changes', async () => {
    const { calls } = await renderSettings();
    await waitFor(() => {
      expect(timeInput().value).toBe('07:30');
    });

    await act(async () => {
      fireEvent.change(timeInput(), { target: { value: '22:15' } });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(patches(calls)).toHaveLength(1);
    });
    // ⚠️ O corpo tem EXATAMENTE a chave que mudou — nunca o objeto inteiro,
    // nunca `userId`. Um `toMatchObject` deixaria os outros quatro campos
    // passarem calados, que é o bug que a parcialidade existe para impedir.
    expect(patches(calls)[0]?.body).toEqual({ reminderTime: '22:15' });
  });

  it('sends only reminderEnabled when the reminder switch changes', async () => {
    const { calls } = await renderSettings();
    await waitFor(() => {
      expect(checkbox(REMINDER_LABEL).checked).toBe(true);
    });

    await act(async () => {
      fireEvent.click(checkbox(REMINDER_LABEL));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(patches(calls)).toHaveLength(1);
    });
    expect(patches(calls)[0]?.body).toEqual({ reminderEnabled: false });
  });

  it('sends only notifyGroupActivity when the activity switch changes', async () => {
    const { calls } = await renderSettings();
    await waitFor(() => {
      expect(checkbox(ACTIVITY_LABEL).checked).toBe(false);
    });

    await act(async () => {
      fireEvent.click(checkbox(ACTIVITY_LABEL));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(patches(calls)).toHaveLength(1);
    });
    expect(patches(calls)[0]?.body).toEqual({ notifyGroupActivity: true });
  });
});

describe('⚠️ o horário que não se manda (regra 9, decisão D)', () => {
  it('⚠️ sends NOTHING when the hour is cleared — measured by call count', async () => {
    const { calls } = await renderSettings();
    await waitFor(() => {
      expect(timeInput().value).toBe('07:30');
    });

    await act(async () => {
      // O `<input type="time">` produz `''` quando a pessoa limpa o campo. Não
      // é erro: é um gesto. Mandá-lo daria 400 e pintaria o campo de vermelho.
      fireEvent.change(timeInput(), { target: { value: '' } });
      await Promise.resolve();
    });

    /*
      ⚠️ CONTADOR, NUNCA "não quebrou" (§7.3). Uma asserção de ausência de erro
      passaria com a requisição indo e voltando 400, que é exatamente o
      comportamento que esta regra existe para proibir. E o lado POSITIVO do
      contador está nos três testes acima (`toHaveLength(1)`): sem eles, um
      `patches()` quebrado deixaria este `toHaveLength(0)` verde para sempre.
    */
    expect(patches(calls)).toHaveLength(0);
    // E o campo mostra o que a pessoa fez — o gesto não é desfeito na cara dela.
    expect(timeInput().value).toBe('');
  });

  it.each([['7:0'], ['25:00'], ['21:5'], ['abc']])(
    'sends nothing for %s, which is not an HH:mm',
    async (typed) => {
      const { calls } = await renderSettings();
      await waitFor(() => {
        expect(timeInput().value).toBe('07:30');
      });

      await act(async () => {
        fireEvent.change(timeInput(), { target: { value: typed } });
        await Promise.resolve();
      });

      expect(patches(calls)).toHaveLength(0);
    },
  );
});

describe('⚠️ a escrita que falha NÃO mente sobre o estado (regra 10)', () => {
  it('⚠️ puts the switch back where it was, and says so', async () => {
    const { calls } = await renderSettings({
      patch: { status: 500, body: { error: 'boom' } },
    });
    await waitFor(() => {
      expect(checkbox(REMINDER_LABEL).checked).toBe(true);
    });

    await act(async () => {
      fireEvent.click(checkbox(REMINDER_LABEL));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.settings.saveFailed);
    });
    /*
      ⚠️ É ESTA a pior forma desta tela errar: um interruptor ligado na tela e
      desligado no banco faz a pessoa achar que vai ser lembrada e não ser. O
      recado sozinho não basta — o VALOR tem de voltar.
    */
    expect(checkbox(REMINDER_LABEL).checked).toBe(true);
    expect(patches(calls)).toHaveLength(1);
  });

  it('⚠️ puts the hour back where it was, and says so', async () => {
    await renderSettings({ patch: { status: 500, body: { error: 'boom' } } });
    await waitFor(() => {
      expect(timeInput().value).toBe('07:30');
    });

    await act(async () => {
      fireEvent.change(timeInput(), { target: { value: '22:15' } });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.settings.saveFailed);
    });
    expect(timeInput().value).toBe('07:30');
  });

  it('stops saying it failed once a save works — o recado não fica preso', async () => {
    await renderSettings({
      patch: [
        { status: 500, body: { error: 'boom' } },
        { status: 200, body: someSettings({ reminderEnabled: false }) },
      ],
    });
    await waitFor(() => {
      expect(checkbox(REMINDER_LABEL).checked).toBe(true);
    });

    await act(async () => {
      fireEvent.click(checkbox(REMINDER_LABEL));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.settings.saveFailed);
    });

    await act(async () => {
      fireEvent.click(checkbox(REMINDER_LABEL));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(readableText()).not.toContain(pt.pages.settings.saveFailed);
    });
    // ⚠️ E o estado que vale é o que o SERVIDOR devolveu, não o otimista.
    expect(checkbox(REMINDER_LABEL).checked).toBe(false);
  });
});

describe('⚠️ a seção do aparelho desligada limpo (decisão F)', () => {
  it('⚠️ hides the WHOLE push section when the server has no VAPID', async () => {
    await renderSettings({
      config: {
        status: 200,
        body: someConfig({ enabled: false, vapidPublicKey: null }),
      },
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.settings.device.unavailable);
    });
    // Nem botão desligado, nem título de seção: botão que não funciona é
    // convite a tocar, e `enabled: false` não é erro.
    expect(
      screen.queryByRole('button', { name: pt.pages.settings.device.activate }),
    ).toBeNull();
    expect(readableText()).not.toContain(pt.pages.settings.device.title);
    // E as três preferências continuam lá: o push é uma seção, não a tela.
    expect(
      screen.queryByRole('checkbox', { name: REMINDER_LABEL }),
    ).not.toBeNull();
  });

  it('hides it too when the key is null even with enabled true', async () => {
    // Contrato impossível hoje, mas a tela não pode inscrever sem chave: sem
    // esta linha ela chamaria `subscribe(null)` e o navegador lançaria.
    await renderSettings({
      config: { status: 200, body: someConfig({ vapidPublicKey: null }) },
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.settings.device.unavailable);
    });
  });
});

describe('ativar e desativar este aparelho (regras 14 e 16)', () => {
  it('⚠️ subscribes with the key that came from GET /notifications/config (decisão E)', async () => {
    const { calls, keys, order } = await renderSettings();
    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: pt.pages.settings.device.activate,
        }),
      ).not.toBeNull();
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: pt.pages.settings.device.activate }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(requestsTo(calls, '/notifications/subscriptions')).toHaveLength(1);
    });
    // ⚠️ A chave veio da RESPOSTA, não de `import.meta.env` (decisão E).
    expect(keys).toEqual([FAKE_PUBLIC_KEY_NOT_A_REAL_ONE]);

    const post = requestsTo(calls, '/notifications/subscriptions')[0];
    expect(post?.method).toBe('POST');
    // ⚠️ A ORDEM da regra 14 pela ponta que esta tela controla: o navegador
    // primeiro, o servidor depois. Um `POST` antes da inscrição gravaria um
    // aparelho que não existe.
    expect(order).toEqual(['subscribe', 'POST']);
    // ⚠️ Sem `userId` e sem `clubId`: o dono da inscrição é o JWT (§6.3).
    expect(post?.body).toEqual({
      platform: 'web',
      subscription: A_SUBSCRIPTION,
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.settings.device.active);
    });
  });

  it('says mobile when the device says mobile', async () => {
    const { calls } = await renderSettings({
      device: { platform: 'mobile' },
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: pt.pages.settings.device.activate,
        }),
      ).not.toBeNull();
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: pt.pages.settings.device.activate }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        requestsTo(calls, '/notifications/subscriptions')[0]?.body,
      ).toEqual({ platform: 'mobile', subscription: A_SUBSCRIPTION });
    });
  });

  it('starts out saying the device is already active when the browser has a subscription', async () => {
    await renderSettings({ device: { subscribed: true } });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.settings.device.active);
    });
    expect(
      screen.queryByRole('button', {
        name: pt.pages.settings.device.deactivate,
      }),
    ).not.toBeNull();
  });

  it('⚠️ DELETEs on the server BEFORE unsubscribing in the browser (regra 16)', async () => {
    const { order } = await renderSettings({ device: { subscribed: true } });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: pt.pages.settings.device.deactivate,
        }),
      ).not.toBeNull();
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: pt.pages.settings.device.deactivate,
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.settings.device.inactive);
    });
    /*
      ⚠️ A ORDEM É A REGRA, e ela é exata: desinscrever primeiro e o `DELETE`
      falhar deixaria no backend uma inscrição morta que o dispatcher da Tarefa
      37 tentaria usar. Um `expect(order).toContain(...)` não provaria nada —
      os dois gestos acontecem nos dois desenhos.
    */
    expect(order).toEqual(['DELETE', 'unsubscribe']);
  });

  it('sends the endpoint the BROWSER knows, in the body of the DELETE', async () => {
    const { calls } = await renderSettings({ device: { subscribed: true } });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: pt.pages.settings.device.deactivate,
        }),
      ).not.toBeNull();
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: pt.pages.settings.device.deactivate,
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(requestsTo(calls, '/notifications/subscriptions')).toHaveLength(1);
    });
    expect(requestsTo(calls, '/notifications/subscriptions')[0]?.body).toEqual({
      endpoint: AN_ENDPOINT,
    });
  });

  it('⚠️ does NOT unsubscribe in the browser when the DELETE fails', async () => {
    const { order } = await renderSettings({
      device: { subscribed: true },
      subscriptions: { status: 500, body: { error: 'boom' } },
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: pt.pages.settings.device.deactivate,
        }),
      ).not.toBeNull();
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: pt.pages.settings.device.deactivate,
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.settings.device.failed);
    });
    expect(order).toEqual(['DELETE']);
    // E a tela continua dizendo a verdade: o aparelho AINDA está inscrito.
    expect(readableText()).toContain(pt.pages.settings.device.active);
  });

  /**
   * ⚠️ **O NAVEGADOR QUE NÃO RESPONDE CAI PARA "DESATIVADO", NUNCA PARA
   * "ATIVADO"** — e o vermelho deste teste é a regra 10 pelo lado do aparelho.
   *
   * Medido na auditoria: com o dublê sem saber rejeitar, trocar o `.catch` por
   * `setState('active')` passava em 728/728 testes. O estado observável muda —
   * a tela passa a dizer "os avisos estão ativados neste aparelho" e a oferecer
   * "Desativar" —, e num aparelho em que `navigator.serviceWorker.ready`
   * rejeita a pessoa leria isso e **não receberia aviso nenhum**.
   */
  it('⚠️ falls back to INACTIVE when the browser refuses to answer, never to active', async () => {
    await renderSettings({
      device: {
        currentThrows: new Error('serviceWorker.ready never resolved'),
      },
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.settings.device.inactive);
    });
    // As duas metades: a frase que NÃO pode aparecer, e o gesto que ela ofereceria.
    expect(readableText()).not.toContain(pt.pages.settings.device.active);
    expect(
      screen.queryByRole('button', {
        name: pt.pages.settings.device.deactivate,
      }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: pt.pages.settings.device.activate }),
    ).not.toBeNull();
  });

  it('says it could not change the device when the POST fails', async () => {
    await renderSettings({
      subscriptions: { status: 500, body: { error: 'boom' } },
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: pt.pages.settings.device.activate,
        }),
      ).not.toBeNull();
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: pt.pages.settings.device.activate }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(readableText()).toContain(pt.pages.settings.device.failed);
    });
    expect(readableText()).toContain(pt.pages.settings.device.inactive);
  });
});

describe('⚠️ as QUATRO recusas do aparelho, cada uma com a SUA frase (decisão G)', () => {
  const BLOCKERS: ReadonlyArray<[PushBlocker, string]> = [
    ['insecureContext', pt.pages.settings.device.insecureContext],
    ['unsupported', pt.pages.settings.device.unsupported],
    ['iosNotInstalled', pt.pages.settings.device.iosNotInstalled],
    ['permissionDenied', pt.pages.settings.device.permissionDenied],
  ];

  it.each(BLOCKERS)(
    'says the sentence of %s, and no other',
    async (blocker, sentence) => {
      await renderSettings({ device: { blocker } });

      await waitFor(() => {
        expect(readableText()).toContain(sentence);
      });

      // ⚠️ A metade que o catálogo NÃO decide: que a tela escolha a chave CERTA.
      // Sem esta linha, uma tela que mostrasse sempre a mesma frase passaria em
      // três dos quatro casos.
      for (const [other, otherSentence] of BLOCKERS) {
        if (other === blocker) continue;
        expect(readableText()).not.toContain(otherSentence);
      }

      // E não há botão: os quatro consertos são fora desta tela.
      expect(
        screen.queryByRole('button', {
          name: pt.pages.settings.device.activate,
        }),
      ).toBeNull();
    },
  );

  it('⚠️ shows the permission refusal that only appears ON THE TAP', async () => {
    await renderSettings({
      device: { subscribeThrows: new PushDeviceError('permissionDenied') },
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: pt.pages.settings.device.activate,
        }),
      ).not.toBeNull();
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: pt.pages.settings.device.activate }),
      );
      await Promise.resolve();
    });

    /*
      ⚠️ No iPhone e no Chrome, a permissão é uma PERGUNTA: `blockedBy()` não
      sabe a resposta antes de o dedo cair no botão. Sem este caminho, a recusa
      viraria o "não foi possível" genérico — e a pessoa nunca saberia que basta
      liberar a permissão.
    */
    await waitFor(() => {
      expect(readableText()).toContain(
        pt.pages.settings.device.permissionDenied,
      );
    });
    expect(readableText()).not.toContain(pt.pages.settings.device.failed);
    expect(
      screen.queryByRole('button', { name: pt.pages.settings.device.activate }),
    ).toBeNull();
  });
});

/**
 * ⚠️ **A VARREDURA É RECURSIVA, E O NOME DELA É QUE EXIGE ISSO (§7.9).**
 *
 * A fatia nasceu com uma lista de QUATRO arquivos à mão sob um teste chamado
 * "anywhere in the app source". Medido na auditoria: plantar
 * `import.meta.env.VITE_VAPID_PUBLIC_KEY` no `router.tsx` — um arquivo que esta
 * fatia TOCOU — passava em 728/728, zero acusadores. É o precedente exato do
 * `writes NO NUMBER in the feed` (Tarefa 35): o nome do teste é parte da
 * guarda, e um nome que promete o que a asserção não sustenta é a guarda no
 * lugar errado, que o §7.9 diz ser pior que nenhuma.
 *
 * `__tests__` fica de fora porque é daqui que sai a string procurada.
 */
function appSources(): Array<{ file: string; text: string }> {
  const root = resolve(__dirname, '../..');
  const found: Array<{ file: string; text: string }> = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        found.push({
          file: relative(root, full).split(sep).join('/'),
          /*
            ⚠️ **SEM COMENTÁRIO, e é obrigatório aqui:** o docblock de
            `push-section.tsx` CITA `import.meta.env.VITE_VAPID_PUBLIC_KEY` para
            explicar por que ela não existe. Uma varredura sobre o texto cru
            acusaria a própria explicação — e a saída fácil seria tirar o
            arquivo da varredura, ou apagar a explicação. O `stripComments` é o
            mesmo do `anti-guilt-dom.ts`.
          */
          text: stripComments(readFileSync(full, 'utf8')),
        });
      }
    }
  };

  walk(root);
  return found;
}

describe('⚠️ o que esta fatia NÃO pode ter (regra 6)', () => {
  it('⚠️ reads no VITE_VAPID_* anywhere in the app source', () => {
    /*
      Decisão E: um `VITE_VAPID_PUBLIC_KEY` seria um SEGUNDO dono da mesma
      chave, congelado no BUILD — girar a chave passaria a exigir rebuild do
      PWA, e um aparelho com o bundle velho se inscreveria com a chave velha e
      receberia silêncio. O endpoint já existe e já responde.

      É varredura de FONTE porque a propriedade é estrutural: nenhum estado de
      tela a torna observável.
    */
    const sources = appSources();

    /*
      ⚠️ **O ANTÍDOTO DA VARREDURA VAZIA (§7.4), E ELE NÃO PODE SER
      AUTO-REFERENTE.** A primeira versão comparava `sources.length` com
      `files.length` — os dois lados saíam da MESMA lista, então esvaziá-la
      deixava o teste verde provando que não leu nada. O piso e a asserção de
      conteúdo abaixo saem de fora dela: um é um número escrito à mão (41
      arquivos hoje, e o piso é folgado porque a lista cresce), o outro é um
      arquivo NOMEADO — justamente aquele em que a variável apareceria, porque é
      ele que passa a chave ao `subscribe`.
    */
    expect(sources.length).toBeGreaterThan(30);
    const section = sources.find((source) =>
      source.file.endsWith('pages/push-section.tsx'),
    );
    expect(section?.file).toBe('pages/push-section.tsx');
    expect(section?.text).toContain('vapidPublicKey');

    for (const source of sources) {
      expect(`${source.file}: ${source.text}`).not.toContain('VITE_VAPID');
    }
  });
});
