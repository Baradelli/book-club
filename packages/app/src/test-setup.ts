import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// ⚠️ Não há stub de `matchMedia` aqui, e é de propósito: havia um, com o
// comentário "o tema pergunta por `prefers-color-scheme`" — e nada no app
// pergunta. Quem responde por `prefers-color-scheme` é a cascata de
// `@clube/ui/theme.css`, em CSS puro, sem uma linha de JavaScript. O stub
// sustentava um `resolveTheme` que era código morto; os dois saíram juntos.
//
// Se um dia algum componente precisar de `matchMedia` de verdade, o stub
// volta — mas com um chamador, não como decoração.

afterEach(() => {
  cleanup();
});
