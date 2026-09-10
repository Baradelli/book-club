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

  it('⚠️ DECLARES the intent of keeping the en catalog out of the precache (task 29a)', () => {
    /*
      ⚠️ **ESTA NÃO É A GUARDA — ela é a DECLARAÇÃO DE INTENÇÃO no config.** A
      guarda de verdade é `bundle-guard.test.ts > keeps the en catalog OUT of
      the service worker PRECACHE`, que lê o `sw.js` EMITIDO e identifica o
      chunk do `en` por CONTEÚDO.

      A diferença é medida, e é a razão de as duas existirem: esta afirma que
      a string `'assets/en-*.js'` está escrita aqui, e a propriedade que
      importa não mora no texto — o glob está acoplado a um nome de arquivo
      que o Rollup escolheu. Com o `globIgnores` intacto e um
      `chunkFileNames: 'assets/chunk-[name]-[hash].js'` no `rollupOptions`, o
      precache voltava a 16 entradas / 887,85 KiB e **esta asserção continuava
      verde**. Ela sobrevive porque é barata e porque documenta a decisão no
      lugar onde alguém vai mexer; não porque cobre alguma coisa sozinha.
    */
    /*
      ⚠️ **O BLOQUEADOR DA RODADA DE CORREÇÃO DA 29a, e ele é o motivo de esta
      asserção existir.** Tirar o `en` do chunk de entrada não basta: o
      `globPatterns: ['**\/*.{js,...}']` do Workbox varre o `dist/` inteiro e
      põe TODO `.js` emitido no manifesto de precache. Medido no build:

        antes da fatia (HEAD 613b7e4)   precache  15 entries (887.15 KiB)
        com o chunk do `en` precacheado precache  16 entries (887.79 KiB)

      Ou seja: o install passava a baixar **+0,64 KiB**, e o objetivo escrito
      na spec ("quem abre o app em português para de baixar o catálogo em
      inglês") continuava sem ser entregue — o download só tinha mudado de
      momento, do primeiro paint para o segundo plano. A fatia ficava líquida
      NEGATIVA em bytes transferidos.

      ⚠️ **A consequência, que é decisão e não descuido: trocar para inglês
      OFFLINE não funciona.** O `import()` rejeita, e a decisão G já manda cair
      no `pt` sem tela de erro. É o preço combinado: o segundo idioma é
      sob demanda, e "sob demanda" pressupõe rede.

      ⚠️ E o que esta asserção NÃO cobre, de propósito: o chunk do EDITOR
      (453.606 B) também está no precache. É pré-existente, é maior que tudo
      isto junto, e entra em fatia própria — misturá-lo aqui tornaria a
      medição desta ilegível.
    */
    expect(config).toContain('globIgnores');
    expect(config).toContain("'assets/en-*.js'");
  });

  it('caches no API response in this slice (decision D)', () => {
    // Offline é a Tarefa 21. Cachear resposta de API agora criaria dado velho
    // invisível — e o `runtimeCaching` é o único jeito de fazer isso pelo
    // plugin, então basta provar que ele não existe.
    expect(config).not.toContain('runtimeCaching');
  });
});
