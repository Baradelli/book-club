import type { StorageLike } from '@clube/shared/client';

import { browserStorage } from './env';

/**
 * A barra de canetas da tela do dia acompanha a rolagem (fica presa no topo)
 * ou fica parada no começo do texto.
 *
 * É preferência do APARELHO, como o tema: celular e computador pedem coisas
 * diferentes, e não há por que ela viajar no `Settings` do servidor. Sem
 * escolha gravada, a barra acompanha.
 */
export const PEN_BAR_STICKY_KEY = 'clube.penBar.sticky';

export function readPenBarSticky(
  storage: StorageLike = browserStorage,
): boolean {
  try {
    return storage.getItem(PEN_BAR_STICKY_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writePenBarSticky(
  sticky: boolean,
  storage: StorageLike = browserStorage,
): void {
  try {
    storage.setItem(PEN_BAR_STICKY_KEY, sticky ? '1' : '0');
  } catch {
    // Aba privada do Safari: a escolha vale só nesta sessão.
  }
}
