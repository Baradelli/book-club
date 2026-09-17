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

  /*
    ⚠️ **A TERCEIRA PROPRIEDADE SAIU NA TAREFA 38d, e está escrito aqui em vez
    de apagado em silêncio porque esta guarda tem CINCO propriedades e a lição
    da fatia foi que tirar uma não pode derrubar as outras quatro.**

    Era `⚠️ DECLARES the intent of keeping the en catalog out of the precache
    (task 29a)`, e ela afirmava que a string `'assets/en-*.js'` estava escrita
    no `vite.config.ts`. O `globIgnores` existia para tirar o chunk do segundo
    catálogo do manifesto de precache do Workbox — sem catálogo `en` não há
    chunk, e um glob que não casa com nada é a guarda verde da lição nº 1.

    ⚠️ **E ela sai SEM substituta, de propósito.** A propriedade "o precache
    não tem o que não deve" continua com dono, e o dono é o outro lado do par:
    `bundle-guard.test.ts`, que lê o `sw.js` EMITIDO. O que morreu foi a
    declaração de intenção sobre um arquivo que não é mais emitido.
  */

  /**
   * ⚠️ **A QUINTA PROPRIEDADE (Tarefa 38): O HANDLER DE PUSH É INJETADO NO
   * SERVICE WORKER GERADO — e o `generateSW` CONTINUA.**
   *
   * Duas afirmações num teste só, porque elas são a mesma decisão:
   *
   * 1. **`importScripts: ['push-handler.js']` está no config.** Sem esta linha
   *    o arquivo continua sendo servido em `/push-handler.js` e **ninguém o
   *    executa**: o push chega ao navegador, o service worker não tem listener
   *    de `push`, e a notificação não aparece. Nada fica vermelho — nem o
   *    `push-handler.test.ts`, que roda o arquivo por fora.
   * 2. **não há `injectManifest`.** Trocar a estratégia faria o service worker
   *    passar a ser um arquivo NOSSO, e as outras propriedades desta guarda
   *    teriam de ser remedidas uma a uma contra ele. O acréscimo de chave as
   *    preserva de graça — e é por isso que a regra 3 da Tarefa 38d o exige
   *    por escrito.
   *
   * ⚠️ **O que esta asserção NÃO cobre, e é de propósito:** que o arquivo
   * EXISTA em `public/`. Isso é do `push-handler.test.ts`, que o lê do disco e
   * estoura se ele sumir — e lá a falta vira um erro de leitura, não uma
   * varredura vazia (§7.4).
   *
   * ⚠️⚠️ **E O QUE ELA NÃO COBRE PORQUE NÃO CONSEGUE: que o handler entre no
   * MANIFESTO DE PRECACHE, COM REVISÃO.** Esta aqui é a **declaração de
   * intenção** — ela lê o TEXTO do config, e o texto continua verdadeiro mesmo
   * depois de a propriedade morrer. Medido na rodada de conserto da 38: um
   * `globIgnores: ['assets/en-*.js', 'push-handler.js']` tira o arquivo do
   * manifesto, o `importScripts` acima continua lá e continua funcionando, o
   * precache cai de 16/897,12 KiB para 15/892,48 KiB — e a suíte do app passa
   * **765/765, zero acusadores**. ⚠️ **A Tarefa 38d apagou o `globIgnores`
   * inteiro** (ele só existia para o chunk do `en`), então o mutante que uma
   * fatia futura escreveria hoje é mais curto — `globIgnores:
   * ['push-handler.js']` — e faz exatamente a mesma coisa. É a mesma armadilha
   * em que o `globIgnores` do `en` caiu na Tarefa 29a, e a saída é a mesma: a
   * guarda mora onde há **build real**, em `bundle-guard.test.ts`
   * (`precaches the push handler WITH a revision…`), identificando o arquivo
   * por CONTEÚDO. É lá que se conserta quando o precache quebrar; aqui, só
   * quando o config mudar.
   */
  it('⚠️ injects the push handler into the GENERATED service worker (task 38)', () => {
    expect(config).toContain("importScripts: ['push-handler.js']");
    expect(config).not.toContain('injectManifest');
  });

  it('caches no API response in this slice (decision D)', () => {
    // Offline é a Tarefa 21. Cachear resposta de API agora criaria dado velho
    // invisível — e o `runtimeCaching` é o único jeito de fazer isso pelo
    // plugin, então basta provar que ele não existe.
    expect(config).not.toContain('runtimeCaching');
  });
});
