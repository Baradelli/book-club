/**
 * "ATUALIZAR O APP" — o botão das Preferências (pedido do dono, 2026-10-06).
 *
 * ⚠️ O PORQUÊ: o service worker é `autoUpdate` (`vite.config.ts`), mas ele só
 * PROCURA versão nova quando há navegação — e o PWA instalado no Android fica
 * vivo em segundo plano por dias, rodando o JavaScript antigo depois do deploy.
 * Este é o gesto manual: pedir a versão nova, esperar ela assumir, recarregar.
 *
 * ⚠️ O RELOAD ACONTECE EM QUALQUER CAMINHO — sem service worker (`localhost`
 * em http, navegador antigo), sem versão nova, ou com a verificação falhando
 * offline. Um botão que às vezes não faz nada é pior que nenhum.
 *
 * O aparelho entra por um port (a mesma forma do `push-device.ts`), porque
 * jsdom não tem service worker e é o único jeito de provar o reload.
 */
export interface AppUpdateRegistration {
  update: () => Promise<unknown>;
  /** Depois do `update()`: há um service worker novo instalando ou esperando? */
  hasPendingVersion: () => boolean;
}

export interface AppUpdateDevice {
  getRegistration: () => Promise<AppUpdateRegistration | undefined>;
  /** Resolve quando a versão nova assume a página — ou desiste no prazo. */
  waitForNewVersion: () => Promise<void>;
  reload: () => void;
}

export async function updateApp(device: AppUpdateDevice): Promise<void> {
  try {
    const registration = await device.getRegistration();
    if (registration !== undefined) {
      await registration.update();
      if (registration.hasPendingVersion()) await device.waitForNewVersion();
    }
  } catch {
    // Offline, ou o navegador recusou: recarregar ainda traz o que o precache
    // tem, e é o que a pessoa pediu.
  } finally {
    device.reload();
  }
}

/**
 * Quanto esperar a versão nova assumir. O `sw.js` novo tem de baixar o
 * precache inteiro (fontes incluídas) antes de ativar; numa conexão de celular
 * isso leva alguns segundos, e passar do prazo só significa recarregar com a
 * versão velha — a nova assume na próxima abertura.
 */
const NEW_VERSION_TIMEOUT_MS = 10_000;

export function browserAppUpdateDevice(): AppUpdateDevice {
  return {
    getRegistration: async () => {
      if (!('serviceWorker' in navigator)) return undefined;
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration === undefined) return undefined;
      return {
        update: () => registration.update(),
        hasPendingVersion: () =>
          registration.installing !== null || registration.waiting !== null,
      };
    },
    waitForNewVersion: () =>
      new Promise<void>((resolve) => {
        const done = (): void => {
          window.clearTimeout(timer);
          navigator.serviceWorker.removeEventListener('controllerchange', done);
          resolve();
        };
        const timer = window.setTimeout(done, NEW_VERSION_TIMEOUT_MS);
        navigator.serviceWorker.addEventListener('controllerchange', done);
      }),
    reload: () => {
      window.location.reload();
    },
  };
}
