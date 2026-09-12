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
   *    passar a ser um arquivo NOSSO, e as quatro propriedades acima teriam de
   *    ser remedidas uma a uma contra ele. O acréscimo de chave preserva as
   *    quatro de graça — e é por isso que a regra 3 da fatia o exige por
   *    escrito.
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
   * **765/765, zero acusadores**. É a mesma armadilha em que o `globIgnores` do
   * `en` caiu na Tarefa 29a, e a saída é a mesma: a guarda mora onde há **build
   * real**, em `bundle-guard.test.ts`
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
