import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_API_URL } from '../env';

/**
 * O pino cruzado entre `src/env.ts` e `vite.config.ts`.
 *
 * `DEFAULT_API_URL = '/api'` e `navigateFallbackDenylist: [/^\/api\//]` são a
 * MESMA decisão escrita em dois arquivos, e não havia nada ligando as duas.
 * Mudar o prefixo da API de um lado só faz o service worker devolver o
 * `index.html` para toda chamada de API: o app recebe HTML onde espera JSON, e
 * o sintoma aparece só depois do deploy, em navegador com SW instalado.
 *
 * Este projeto já sabe fazer este pino — é o que `index-html.test.ts` faz com
 * a chave do tema. Molde igual: leitura estática, comentários fora, e a
 * constante de produção como fonte da verdade.
 */
// `process.cwd()` e não `import.meta.url`: no ambiente jsdom do Vitest o
// módulo não tem URL de arquivo, e o `fileURLToPath` estoura.
const configPath = resolve(process.cwd(), 'vite.config.ts');

/**
 * Comentário não é código — e aqui isso decide o teste: o `vite.config.ts`
 * EXPLICA a denylist em prosa, citando `/api`. Sem remover os comentários, a
 * asserção passaria lendo a documentação de uma denylist que não existe mais.
 */
function stripComments(source: string): string {
  return (
    source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      // Linha INTEIRA de comentário, e não "de `//` até o fim da linha": o que
      // se procura aqui é um literal de RegExp (`/^\/api\//`), que termina em
      // `\//` — e um recortador ingênuo comeria justamente a asserção. Todo
      // comentário de prosa do `vite.config.ts` ocupa a linha inteira.
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n')
  );
}

const config = stripComments(readFileSync(configPath, 'utf8'));

/** `/api` → `\/api`, para casar o literal de RegExp escrito no config. */
function escapedForRegExpLiteral(path: string): string {
  return path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

describe('service worker config', () => {
  it('keeps the navigateFallback denylist pinned to DEFAULT_API_URL', () => {
    // `/^\/api\//` — montado a partir da constante, não escrito à mão: uma
    // cópia à mão envelheceria junto com o bug que ela deveria acusar.
    const expected = `/^${escapedForRegExpLiteral(DEFAULT_API_URL)}\\//`;

    expect(config).toContain('navigateFallbackDenylist');
    expect(config).toContain(expected);
  });

  it('has a navigateFallback at all, so the denylist has something to exclude', () => {
    // Sem esta linha o teste acima é meio teste: uma denylist correta com o
    // `navigateFallback` removido não engole nada — e o app deixa de abrir
    // offline em qualquer rota que não seja `/`.
    expect(config).toContain("navigateFallback: '/index.html'");
  });

  it('caches no API response in this slice (decision D)', () => {
    // Offline é a Tarefa 21. Cachear resposta de API agora criaria dado velho
    // invisível — e o `runtimeCaching` é o único jeito de fazer isso pelo
    // plugin, então basta provar que ele não existe.
    expect(config).not.toContain('runtimeCaching');
  });
});
