import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Só `cleanup`, como em `packages/app/src/test-setup.ts`.
 *
 * Sem `@testing-library/jest-dom`: o projeto não o usa em nenhum pacote, e
 * matcher de conveniência não vale uma dependência a mais numa fatia cuja
 * regra é "nenhuma dependência nova". As asserções aqui são DOM cru
 * (`getAttribute`, `textContent`, `tagName`), que é o que estas regras
 * realmente cobram.
 *
 * ⚠️ E o `cleanup` importa mais aqui do que no app: o `Sheet` põe uma classe
 * no `document.body` enquanto está aberto. Sem desmontar entre testes, o
 * primeiro sheet aberto deixaria o body travado para todos os seguintes.
 */
afterEach(() => {
  cleanup();
});
