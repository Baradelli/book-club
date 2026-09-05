import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * A restrição que decide a forma da Tarefa 12: `packages/shared` é dependência
 * do `@clube/backend`, que roda em Node. Um módulo daqui que leia
 * `window`, `localStorage`, `document` ou `import.meta.env` **em escopo de
 * módulo** quebra o backend no BOOT, não em teste.
 *
 * Por isso o cliente HTTP e o armazenamento de token são fábricas com
 * dependência injetada: quem lê o ambiente é o `packages/app`.
 *
 * ⚠️ **O gate PRIMÁRIO desta regra é o compilador, não este arquivo.**
 * `packages/shared/tsconfig.json` declara `"lib": ["ES2022"]` — sem `DOM` —,
 * então `window`, `document`, `localStorage`, `location`, `matchMedia` e
 * companhia simplesmente não existem para o `tsc` neste pacote: a classe
 * inteira vira erro de COMPILAÇÃO, inclusive os globais que a varredura por
 * regex abaixo não enumera (`globalThis.location?.href` e
 * `globalThis.matchMedia?.()` passavam nas duas portas).
 *
 * Estes dois testes CONTINUAM sendo a rede de runtime: a varredura acusa no
 * pacote que errou antes de o backend cair, e o import em Node é o mesmo que o
 * backend faz no boot. Mas quem fecha a classe é o `lib`.
 */

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : sourceFiles(full);
    }
    return entry.endsWith('.ts') ? [full] : [];
  });
}

/**
 * Comentário não é código: as regras deste projeto se explicam em prosa, e a
 * prosa cita justamente `window` e `localStorage`. Bloco primeiro, linha
 * depois — e `//` precedido de `:` fica (é uma URL, não um comentário).
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FORBIDDEN =
  /\b(window|document|localStorage|sessionStorage|navigator|HTMLElement)\b|import\s*\.\s*meta/;

describe('packages/shared never touches the browser', () => {
  it('imports in a DOM-less Node environment without blowing up', async () => {
    // O ambiente deste projeto de teste é `node`: não há `window`. Se um
    // módulo de `shared` lesse um global do navegador em escopo de módulo,
    // ESTE import lançaria — é o mesmo import que o backend faz.
    // `'window' in globalThis` e não `globalThis.window`: sem `DOM` na `lib`
    // deste pacote o acesso por propriedade nem COMPILA — que é justamente a
    // proteção que este arquivo documenta.
    expect('window' in globalThis).toBe(false);

    const [root, client, locales] = await Promise.all([
      import('../index'),
      import('../client/index'),
      import('../locales/index'),
    ]);

    expect(Object.keys(root).length).toBeGreaterThan(0);
    expect(Object.keys(client).length).toBeGreaterThan(0);
    expect(Object.keys(locales).length).toBeGreaterThan(0);
  });

  it('has no browser global in any source file', () => {
    const files = sourceFiles(SRC_DIR);
    // Sem isto, um `sourceFiles` quebrado devolveria `[]` e o teste passaria
    // sem olhar nada.
    expect(files.length).toBeGreaterThan(5);

    const offenders = files.filter((file) =>
      FORBIDDEN.test(stripComments(readFileSync(file, 'utf8'))),
    );

    expect(offenders).toEqual([]);
  });
});
