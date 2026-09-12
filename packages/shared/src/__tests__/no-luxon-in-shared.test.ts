import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * ⚠️ **REGRA 5 DA TAREFA 37 — LUXON É DEPENDÊNCIA DE `packages/backend` E SÓ
 * DELE (ADR 0006).**
 *
 * `packages/shared` é **empacotado no PWA**: tudo o que mora aqui e é alcançado
 * por uma tela vira bytes no navegador de quem abre o app. Luxon com os dados
 * de fuso é da ordem de centenas de kB — e o `packages/shared/src/local-day.ts`
 * existe **exatamente** para que ele não entre: "que dia é hoje" no front se
 * calcula com `Intl`, e o `CLAUDE.md` diz isso desde a Tarefa 12.
 *
 * ## ⚠️ Duas camadas, e a segunda é a que pega o import TRANSITIVO
 *
 * A regra 5 é explícita: *"ela tem de pegar o import **transitivo**, não só o
 * literal `from 'luxon'`: o furo real é `shared` importar um módulo que importa
 * Luxon"*. Uma varredura de texto por `'luxon'` não pega isso — o módulo do
 * meio não tem a palavra.
 *
 * - **CAMADA A — o grafo DENTRO do pacote.** A varredura anda a partir das
 *   entradas declaradas no `package.json`, segue **todo import relativo** e
 *   junta **todo especificador externo** que aparecer em qualquer arquivo
 *   alcançado. É isso que fecha o furo do módulo do meio: se `index.ts` →
 *   `a.ts` → `b.ts` → `'luxon'`, o `b.ts` está no grafo e o `'luxon'` está no
 *   conjunto. E a lista de externos é comparada com as `dependencies`
 *   declaradas, então um pacote novo não entra sem alguém declará-lo.
 * - **CAMADA B — o FECHO de dependências de runtime.** As `dependencies` do
 *   pacote, as `dependencies` delas, e assim por diante, lidas do disco — o
 *   conjunto que um bundler empacotaria. É a camada que sobrevive ao arquivo
 *   novo que ninguém pôs no grafo, ao import gerado e ao `require` dinâmico, e
 *   ela vale também para o `packages/app`.
 *
 * ⚠️ **E o antídoto do §7.4 nas duas:** uma varredura que não acha arquivo, ou
 * um fecho que volta vazio, passa **para sempre sem olhar nada**. Os dois lados
 * estão abaixo — inclusive o import plantado, que tem de deixar a camada A
 * vermelha.
 */

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE_ROOT = resolve(SRC_DIR, '..');

/** O pacote proibido, e o nome mora numa constante só. */
const FORBIDDEN_PACKAGE = 'luxon';

interface SharedManifest {
  exports: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

function manifest(): SharedManifest {
  return JSON.parse(
    readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'),
  ) as SharedManifest;
}

/**
 * A forma de um especificador de módulo — e ela existe por causa de um FALSO
 * POSITIVO medido nesta fatia.
 *
 * O `privacy-terms.ts` tem um termo de vocabulário que **termina em `from`**
 * (`'… from'`), e `\bfrom\s*'` casava ali dentro: a varredura "achava" um
 * import cujo especificador era o resto do arquivo. Sem este filtro, a guarda
 * ficaria vermelha por um motivo que não é o dela — e guarda que acusa à toa é
 * a que alguém desliga (§7.9).
 */
const MODULE_SPECIFIER = /^(?:@?[\w.-]+(?:\/[\w.-]+)*|\.{1,2}(?:\/[\w.-]+)*)$/;

/**
 * Todo `import`/`export ... from`/`import(...)`/`require(...)` de um arquivo.
 *
 * Comentário sai antes: a prosa deste pacote cita nomes de pacote, e o próprio
 * `local-day.ts` explica por extenso que Luxon não entra aqui.
 *
 * `[^'"\n]` e não `[^'"]`: um especificador nunca atravessa linha, e deixar o
 * `.` livre foi metade do falso positivo acima.
 */
function specifiersOf(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  return [
    ...code.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"\n]+)['"]/g,
    ),
  ].flatMap(([, specifier]) =>
    specifier !== undefined && MODULE_SPECIFIER.test(specifier)
      ? [specifier]
      : [],
  );
}

/** `./x` → o arquivo de verdade no disco, ou `undefined` se não é um módulo nosso. */
function resolveRelative(
  fromFile: string,
  specifier: string,
): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // não existe com este sufixo; tenta o próximo
    }
  }
  return undefined;
}

interface Graph {
  /** Todo arquivo alcançado a partir das entradas, pelos imports relativos. */
  files: string[];
  /** Todo especificador NÃO relativo visto em qualquer arquivo do grafo. */
  external: string[];
}

/**
 * O grafo do pacote a partir das entradas — e é ele que torna o import
 * transitivo visível.
 *
 * `extraSource` planta um arquivo virtual no grafo (o antídoto): é como a
 * varredura prova que ela **fica vermelha** sem que ninguém escreva um import
 * de Luxon no pacote de verdade.
 */
function walk(
  entries: string[],
  extraSource?: { file: string; source: string },
): Graph {
  const seen = new Set<string>();
  const external = new Set<string>();
  const queue = [...entries];

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);

    const source =
      extraSource !== undefined && extraSource.file === file
        ? extraSource.source
        : readFileSync(file, 'utf8');

    for (const specifier of specifiersOf(source)) {
      const relative = resolveRelative(file, specifier);
      if (relative === undefined) external.add(specifier);
      else queue.push(relative);
    }
  }

  return { files: [...seen], external: [...external] };
}

/** As entradas públicas do pacote, lidas do `exports` do `package.json`. */
function entryFiles(): string[] {
  return Object.values(manifest().exports).map((relative) =>
    resolve(PACKAGE_ROOT, relative),
  );
}

/** Todo `.ts` do pacote — a rede embaixo do grafo, para a camada A do arquivo órfão. */
function everySourceFile(dir: string = SRC_DIR): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return everySourceFile(full);
    return entry.endsWith('.ts') || entry.endsWith('.tsx') ? [full] : [];
  });
}

/**
 * ⚠️ **A CAMADA B É SOBRE A INSTALAÇÃO, e ela NÃO usa `require.resolve`.**
 *
 * MEDIDO nesta fatia, e o registro importa porque a primeira versão desta
 * guarda foi escrita com `createRequire` e deu **falso vermelho**: dentro do
 * Vitest a resolução é interceptada pelo Vite e enxerga a store inteira do
 * pnpm — `luxon` "resolve" a partir de `packages/shared` mesmo sem estar
 * declarado. Uma guarda que depende do resolvedor do test runner mede o test
 * runner.
 *
 * O que ela mede agora é o **fecho transitivo das dependências de RUNTIME**,
 * lido do disco: as `dependencies` do pacote, as `dependencies` delas, e assim
 * por diante. É exatamente o conjunto que um bundler empacotaria — `devDependencies`
 * ficam de fora porque não embarcam —, e é o que fecha o furo que a regra 5
 * nomeia: `shared` importar um módulo que importa Luxon.
 */
function declaredRuntimeDeps(packageDir: string): string[] {
  const pkg = JSON.parse(
    readFileSync(join(packageDir, 'package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> };
  return Object.keys(pkg.dependencies ?? {});
}

/** O diretório real de um pacote, resolvido como o Node resolveria. */
function packageDirOf(fromDir: string, name: string): string | null {
  let current = fromDir;
  for (;;) {
    const candidate =
      basename(current) === 'node_modules'
        ? join(current, name)
        : join(current, 'node_modules', name);
    try {
      if (statSync(join(candidate, 'package.json')).isFile()) {
        return realpathSync(candidate);
      }
    } catch {
      // não está neste nível; sobe
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Todo pacote que roda junto com este — direto ou de décima mão. */
function runtimeClosure(packageDir: string): string[] {
  const seen = new Set<string>();
  const queue = declaredRuntimeDeps(packageDir).map((name) => ({
    name,
    from: packageDir,
  }));

  while (queue.length > 0) {
    const next = queue.pop();
    if (next === undefined || seen.has(next.name)) continue;
    seen.add(next.name);

    const dir = packageDirOf(next.from, next.name);
    if (dir === null) continue;
    for (const child of declaredRuntimeDeps(dir)) {
      queue.push({ name: child, from: dir });
    }
  }

  return [...seen];
}

describe('packages/shared never pulls Luxon into the PWA (ADR 0006)', () => {
  /**
   * ⚠️ **O ANTÍDOTO, primeira metade: o grafo TEM DE ANDAR.** Um `exports`
   * mal lido ou um `resolveRelative` quebrado devolveria um grafo de um arquivo
   * só, e aí a guarda passaria sem ter aberto quase nada.
   */
  it('walks the whole package from its declared entry points', () => {
    const graph = walk(entryFiles());

    expect(entryFiles().length).toBeGreaterThanOrEqual(5);
    expect(graph.files.length).toBeGreaterThan(20);
    // E ele chega de fato aos arquivos profundos, não só às entradas: o
    // `local-day.ts` é o vizinho desta regra, e o `pt.ts` é o catálogo que a
    // entrada de locales carrega.
    expect(graph.files.map((file) => basename(file))).toEqual(
      expect.arrayContaining(['local-day.ts', 'pt.ts', 'calendar-day.ts']),
    );
  });

  /**
   * ⚠️ **O ANTÍDOTO, segunda metade: a varredura acha os externos que EXISTEM.**
   *
   * Se `specifiersOf` devolvesse `[]`, o conjunto de externos seria vazio e a
   * guarda passaria para sempre. O pacote depende de `zod` hoje, e é isso que
   * tem de aparecer.
   */
  it('sees the external packages the code really imports', () => {
    const graph = walk(entryFiles());

    expect(graph.external).toContain('zod');
    expect(graph.external.length).toBeGreaterThan(0);
  });

  /**
   * ⚠️ **CAMADA A — nenhum arquivo alcançável importa Luxon, nem de terceira
   * mão.**
   *
   * O grafo segue os imports relativos, então o módulo do MEIO está nele: se
   * `index.ts` → `a.ts` → `'luxon'`, o `'luxon'` aparece aqui, e nenhuma
   * varredura de texto no `index.ts` o veria.
   */
  it('has no Luxon anywhere in the module graph, however deep', () => {
    const graph = walk(entryFiles());

    expect(
      graph.external.filter((name) => name.startsWith(FORBIDDEN_PACKAGE)),
      `packages/shared reaches ${FORBIDDEN_PACKAGE} through its module graph. This package is BUNDLED INTO THE PWA — "que dia é hoje" no front se calcula com Intl (src/local-day.ts), e Luxon é SÓ do backend (ADR 0006).`,
    ).toEqual([]);
  });

  /**
   * ⚠️ **O ANTÍDOTO DA CAMADA A, e ele é o que a regra 5 cobra por escrito:
   * plante o import e prove que a varredura VIRA.**
   *
   * O import plantado está num arquivo do MEIO do grafo (o `local-day.ts`,
   * alcançado pelo `index.ts`), e não numa entrada — que é a forma em que uma
   * varredura ingênua falharia: quem só olhasse as entradas veria verde.
   */
  it('flips the moment a file in the MIDDLE of the graph imports Luxon', () => {
    const middleFile = join(SRC_DIR, 'local-day.ts');
    const poisoned = walk(entryFiles(), {
      file: middleFile,
      source: `import { DateTime } from '${FORBIDDEN_PACKAGE}';\nexport const x = DateTime;\n`,
    });

    expect(poisoned.external).toContain(FORBIDDEN_PACKAGE);
    // ...e a precondição: aquele arquivo está mesmo no grafo, e o grafo real
    // continua limpo. Sem ela, o teste passaria com um grafo que não anda.
    expect(walk(entryFiles()).files).toContain(middleFile);
    expect(walk(entryFiles()).external).not.toContain(FORBIDDEN_PACKAGE);
  });

  /**
   * ⚠️ **A rede embaixo do grafo: nenhum `.ts` do pacote — alcançável ou órfão,
   * teste incluído — escreve o nome.**
   *
   * O grafo pega o transitivo; esta varredura pega o arquivo que ainda não foi
   * ligado a nada e que alguém ligará amanhã.
   */
  it('has no Luxon import in any file of the package, reachable or not', () => {
    const offenders = everySourceFile().filter((file) =>
      specifiersOf(readFileSync(file, 'utf8')).some((specifier) =>
        specifier.startsWith(FORBIDDEN_PACKAGE),
      ),
    );

    expect(everySourceFile().length).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });

  /**
   * ⚠️ **CAMADA B — Luxon não está no FECHO TRANSITIVO de runtime de `shared`,
   * nem no do `app`.**
   *
   * Esta é a camada que sobrevive ao arquivo que a varredura de texto não viu,
   * ao import gerado e ao `require` dinâmico: ela lê o disco e responde "quais
   * pacotes rodam junto com este", seguindo `dependencies` de `dependencies`
   * até o fim. É o conjunto que um bundler empacotaria.
   *
   * ⚠️ **E o antídoto vem junto, na mesma asserção:** no fecho do
   * `packages/backend` o Luxon **está** — é lá que o ADR 0006 o põe. Sem esse
   * lado, um `runtimeClosure` que devolvesse `[]` deixaria as duas primeiras
   * linhas verdes para sempre.
   */
  it('keeps Luxon out of the runtime closure of shared and of the app, while the backend has it', () => {
    const packagesDir = resolve(PACKAGE_ROOT, '..');

    expect(runtimeClosure(join(packagesDir, 'shared'))).not.toContain(
      FORBIDDEN_PACKAGE,
    );
    expect(runtimeClosure(join(packagesDir, 'app'))).not.toContain(
      FORBIDDEN_PACKAGE,
    );
    // O ANTÍDOTO: o backend tem — o fecho não está vazio e a busca funciona.
    expect(runtimeClosure(join(packagesDir, 'backend'))).toContain(
      FORBIDDEN_PACKAGE,
    );
    // E a precondição do método: `zod`, que shared DECLARA, aparece no fecho
    // dele; e o fecho do app é grande de verdade (ele tem React e companhia).
    expect(runtimeClosure(join(packagesDir, 'shared'))).toContain('zod');
    expect(runtimeClosure(join(packagesDir, 'app')).length).toBeGreaterThan(3);
  });

  /**
   * ⚠️ **O fecho é TRANSITIVO, e este é o teste que prova que ele anda mais de
   * um passo** — sem isso, "não achei Luxon" poderia ser só "só olhei os
   * diretos".
   *
   * O `packages/backend` depende de `@clube/shared`, que depende de `zod`:
   * `zod` está no fecho do backend **sem** estar nas `dependencies` diretas
   * dele... não — ele está nas duas. O par que decide é outro: `fastify`, que o
   * backend declara, arrasta `pino` (o logger), que o backend **não** declara.
   */
  it('walks more than one level: it finds a dependency of a dependency', () => {
    const backendDir = resolve(PACKAGE_ROOT, '..', 'backend');
    const closure = runtimeClosure(backendDir);

    expect(declaredRuntimeDeps(backendDir)).not.toContain('pino');
    expect(closure).toContain('pino');
  });

  /**
   * ⚠️ **O manifesto: Luxon não está nas dependências declaradas de `shared`, e
   * nenhum externo do grafo está fora delas.**
   *
   * A segunda metade é a que vale para o futuro: um pacote novo que alguém
   * importe sem declarar fica vermelho aqui, e é nesse momento que se pergunta
   * "isto vai para o PWA?".
   */
  it('declares no Luxon, and imports nothing it has not declared', () => {
    const { dependencies, devDependencies } = manifest();
    const declared = new Set([
      ...Object.keys(dependencies),
      ...Object.keys(devDependencies),
    ]);

    expect(declared.has(FORBIDDEN_PACKAGE)).toBe(false);
    // `node:`/`vitest` são ambiente de teste, não bundle: ficam de fora da
    // conta, como o `no-vapid-private-key.test.ts` isenta os `*.test.ts`.
    const undeclared = walk(entryFiles()).external.filter(
      (name) => !name.startsWith('node:') && !declared.has(name),
    );

    expect(declared.size).toBeGreaterThan(0);
    expect(undeclared).toEqual([]);
  });
});
