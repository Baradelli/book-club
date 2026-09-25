import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// ⚠️ Não há stub de `matchMedia` aqui, e é de propósito: o `useTheme` trata
// a ausência dele (jsdom) como "sistema claro", o mesmo padrão do CSS. A regra
// de alternância é pura e testada em `__tests__/theme.test.ts`.

afterEach(() => {
  cleanup();
});
