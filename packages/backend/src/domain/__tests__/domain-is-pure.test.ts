import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * **O domínio é puro: nada aqui lê relógio, sorteio ou ambiente.**
 *
 * A regra já estava escrita em três lugares — no `CLAUDE.md` ("todo cálculo
 * instante ↔ dia do calendário passa pelo helper `dayRange`", "o UseCase não
 * importa Fastify nem Prisma"), no docblock de cada função de domínio e na
 * spec de cada fatia — e mesmo assim tinha **zero acusadores**: medido na
 * rodada de correção da Tarefa 31, um `const impureNow = new Date();` dentro do
 * `groupUsersByPlanItem` passava em **1388/1388**. É o §7.9 na forma mais
 * simples dele: **requisito sem guarda automática é intenção**, e um `grep`
 * colado num relatório é medição de um instante, não guarda.
 *
 * Por que a varredura pega o `domain/` **inteiro**, e não os três módulos da
 * fatia que a escreveu: é o mesmo custo, e a propriedade é do pacote. Quem
 * escrever o módulo de domínio nº 18 não precisa saber que este arquivo
 * existe — é essa a diferença entre guarda e lembrança de quem estava lá.
 *
 * O que cada proibição protege:
 *
 * - **`new Date(` / `Date.now(`** — "que dia é hoje" NUNCA se calcula no
 *   domínio: o dia se calcula no `timezone` do `Settings`, pelo `dayRange`, e
 *   o `ReadingLog` nem isso faz (ancora no `planItemId`). Um relógio aqui
 *   também é a asserção que se autoajusta do §7.8, a mais difícil de ver.
 * - **`Math.random(`** — id se gera com `randomUUID()` no UseCase, e função de
 *   domínio que sorteia não é testável duas vezes com o mesmo resultado.
 * - **`process.env`** — configuração é da borda; um domínio que lê ambiente
 *   responde diferente em máquina diferente, e o teste vira loteria.
 *
 * O molde é o `packages/shared/src/__tests__/no-browser-globals.test.ts`,
 * inclusive o antídoto do `toBeGreaterThan`: sem ele um `sourceFiles` quebrado
 * devolveria `[]` e o teste passaria **sem olhar nada** — a asserção vazia do
 * §7.4 com outra roupa.
 */

const DOMAIN_DIR = fileURLToPath(new URL('..', import.meta.url));

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
 * Comentário não é código: os docblocks deste pacote explicam a regra citando
 * justamente `new Date()` e `Math.random()`. Bloco primeiro, linha depois — e
 * `//` precedido de `:` fica (é uma URL, não um comentário).
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const IMPURE =
  /new\s+Date\s*\(|\bDate\s*\.\s*now\s*\(|\bMath\s*\.\s*random\s*\(|\bprocess\s*\.\s*env\b/;

describe('the domain is pure', () => {
  it('has no clock, no randomness and no environment in any domain module', () => {
    const files = sourceFiles(DOMAIN_DIR);
    // Sem isto, um `sourceFiles` quebrado devolveria `[]` e o teste passaria
    // sem olhar nada.
    expect(files.length).toBeGreaterThan(10);

    const offenders = files
      .filter((file) => IMPURE.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => basename(file));

    expect(offenders).toEqual([]);
  });
});
