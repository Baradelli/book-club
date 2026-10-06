import { describe, expect, it } from 'vitest';

import { type AppUpdateDevice, updateApp } from '../app-update';

/**
 * "ATUALIZAR O APP" (pedido do dono, 2026-10-06): no Android o PWA fica vivo em
 * segundo plano e continua rodando o JavaScript antigo mesmo depois do deploy.
 * O botão pede a versão nova ao service worker, espera ela assumir e recarrega.
 *
 * A propriedade que quebra em silêncio é o RELOAD: em qualquer caminho — sem
 * service worker, sem versão nova, com erro de rede — a tela TEM de recarregar.
 * Um botão que às vezes não faz nada é pior que nenhum.
 */

interface FakeLog {
  reloads: number;
  updates: number;
  waited: boolean;
}

/** Fixture é factory (§7.7). */
function aDevice(
  overrides: Partial<{
    hasRegistration: boolean;
    newVersionFound: boolean;
    updateFails: boolean;
  }> = {},
): { device: AppUpdateDevice; log: FakeLog } {
  const {
    hasRegistration = true,
    newVersionFound = true,
    updateFails = false,
  } = overrides;
  const log: FakeLog = { reloads: 0, updates: 0, waited: false };

  const device: AppUpdateDevice = {
    getRegistration: () =>
      Promise.resolve(
        hasRegistration
          ? {
              update: () => {
                log.updates += 1;
                return updateFails
                  ? Promise.reject(new Error('offline'))
                  : Promise.resolve();
              },
              hasPendingVersion: () => newVersionFound,
            }
          : undefined,
      ),
    waitForNewVersion: () => {
      log.waited = true;
      return Promise.resolve();
    },
    reload: () => {
      log.reloads += 1;
    },
  };

  return { device, log };
}

describe('updateApp — fetch the new version, then reload', () => {
  it('asks the service worker for the new version and waits for it before reloading', async () => {
    const { device, log } = aDevice();

    await updateApp(device);

    expect(log.updates).toBe(1);
    expect(log.waited).toBe(true);
    expect(log.reloads).toBe(1);
  });

  it('reloads right away when there is nothing new to wait for', async () => {
    // O `index.html` vem do precache: mesmo sem versão nova, recarregar é o
    // que a pessoa pediu — e é barato.
    const { device, log } = aDevice({ newVersionFound: false });

    await updateApp(device);

    expect(log.waited).toBe(false);
    expect(log.reloads).toBe(1);
  });

  it('⚠️ reloads even without a service worker, and even when the check fails', async () => {
    const without = aDevice({ hasRegistration: false });
    await updateApp(without.device);
    expect(without.log.reloads).toBe(1);

    const failing = aDevice({ updateFails: true });
    await updateApp(failing.device);
    expect(failing.log.reloads).toBe(1);
  });
});
