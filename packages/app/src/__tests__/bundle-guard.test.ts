// @vitest-environment node
//
// ⚠️ `node` e não o `jsdom` do `vitest.config.ts`, pelo mesmo motivo medido em
// `ui-source-scan.test.ts`: o `esbuild` verifica no carregamento que
// `new TextEncoder().encode('') instanceof Uint8Array`, e o `TextEncoder` do
// jsdom devolve um `Uint8Array` de OUTRO realm — a checagem dá falso e o
// esbuild aborta com "your JavaScript environment is broken".
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * REGRA 21 (Tarefa 18) — **O CHUNK DE ENTRADA NÃO EMBARCA O EDITOR, E O EDITOR
 * TEM CHUNK PRÓPRIO.**
 *
 * A história de por que esta guarda existe, porque ela é o motivo de o formato
 * ser este e não um `grep` no código-fonte:
 *
 * 1. O barril `packages/ui/src/index.ts` reexportava o `RichEditor`. Uma tela
 *    que fizesse `import { Button } from '@clube/ui'` tocava o barril, e o
 *    barril tocava o TipTap — **+454 kB brutos / +143 kB gzip**, medido na
 *    Tarefa 14. O bundle do login foi para **684.692 B / 43 marcas**.
 * 2. A medição de "zero TipTap" da Tarefa 14 tinha sido feita quando NENHUMA
 *    tela importava de `@clube/ui`: zero era o resultado da ausência, não da
 *    poda. E o conserto de então (uma exceção de `treeshake.moduleSideEffects`
 *    no `vite.config.ts`) tinha a atribuição causal errada — a rodada de
 *    correção mediu as quatro combinações e apagou a exceção inteira.
 * 3. Hoje o editor mora numa entrada própria (`@clube/ui/editor`): não existe
 *    aresta do barril até o TipTap, e a poda é ESTRUTURAL, não configurada.
 *
 * ⚠️ **E A TAREFA 18 MUDOU O QUE HÁ PARA GUARDAR** — este é o formato novo, e
 * a colisão estava anunciada no docblock anterior. As duas asserções antigas
 * (`stays under a ceiling…` somando **todos** os `.js`, e `ships no TipTap`
 * exigindo zero marcas em **qualquer** asset) ficaram **impossíveis** no dia em
 * que uma tela de verdade passou a usar o editor — e ficaram impossíveis mesmo
 * com o editor em `React.lazy()`, que é justamente a forma certa.
 *
 * O formato certo é **por chunk**, e são três asserções:
 *
 * 1. **o que a pessoa baixa para ver o LOGIN** fica abaixo do teto e **sem**
 *    marcas de editor. É a propriedade que interessa de verdade;
 * 2. **o editor está num chunk separado**, e as marcas são permitidas **só**
 *    ali;
 * 3. **esse chunk EXISTE de fato.** Sem esta terceira, desfazer o `lazy()` e
 *    voltar tudo para a entrada faria as duas primeiras passarem por acidente
 *    — a (1) porque o teto subiria com o editor dentro, a (2) porque não
 *    haveria chunk separado para conter as marcas.
 *
 * ⚠️ **"O QUE A PESSOA BAIXA" NÃO É "O ARQUIVO DE ENTRADA"** — é ele MAIS todo
 * chunk que ele importa **estaticamente**, porque o navegador busca os dois
 * antes de pintar. E é o `index.html` do build que sabe disso sem palpite: o
 * Vite escreve lá o `<script type="module" src>` da entrada e um
 * `<link rel="modulepreload">` por chunk estaticamente importado. O chunk do
 * `lazy()` não aparece em nenhum dos dois — é buscado só quando a pessoa abre a
 * anotação do dia. Adivinhar pelo NOME do arquivo (`index-*.js`) seria frágil e
 * mentiria no dia em que o Rollup dividisse a entrada.
 *
 * A guarda continua compilando de verdade (~10 s): ler o `import` do
 * `day-note.tsx` provaria que o import está lá, não que o Rollup o pôs num
 * chunk à parte.
 */

/** Fora do repositório: o `dist/` do dono não é área de teste. */
const outDir = join(tmpdir(), 'clube-bundle-guard');

/** Os nomes que denunciam o editor no bundle, em qualquer capitalização. */
const EDITOR_MARKERS = /prosemirror|tiptap/iu;

/**
 * O TETO DO QUE A PESSOA BAIXA PARA VER O LOGIN.
 *
 * Medido nesta fatia: **357.489 B** antes do editor entrar, e o mesmo número
 * depois — que é a prova de que o `lazy()` funcionou. O teto de 450 kB é o
 * mesmo de antes, e continua com folga de ~92 kB para as telas que faltam.
 * Estourou? A primeira coisa a olhar é o que entrou no grafo da entrada — não
 * este número.
 */
const ENTRY_CEILING_BYTES = 450_000;

/**
 * O TETO DO BUILD INTEIRO — entrada **mais** o chunk do editor.
 *
 * Ele é mais alto de propósito: o editor custa ~454 kB brutos e é baixado só
 * por quem abre a anotação do dia. O número existe como rede contra o que a
 * varredura por NOME não pega — outra biblioteca de 400 kB entrando por um
 * `import` distraído deixaria os `EDITOR_MARKERS` verdes e o PWA lento igual.
 */
const TOTAL_CEILING_BYTES = 1_000_000;

interface Asset {
  name: string;
  code: string;
}

let scripts: Asset[] = [];
/** Os `.js` que o `index.html` manda buscar no primeiro carregamento. */
let entryScripts: Asset[] = [];
let indexHtml = '';

/** `assets/index-abc.js` → `index-abc.js`; ignora o que não é `.js` local. */
function scriptFileName(reference: string): string | undefined {
  const withoutQuery = reference.split(/[?#]/u)[0] ?? '';
  if (!withoutQuery.endsWith('.js')) return undefined;
  return withoutQuery.split('/').pop();
}

/**
 * O `<script type="module" src>` da entrada + todo `<link rel="modulepreload">`.
 *
 * São exatamente os dois lugares onde o Vite declara "busque isto agora".
 */
function eagerScriptNames(html: string): string[] {
  const names = new Set<string>();

  for (const match of html.matchAll(
    /<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/gu,
  )) {
    const reference = match[1];
    if (reference === undefined) continue;
    const name = scriptFileName(reference);
    if (name !== undefined) names.add(name);
  }

  return [...names];
}

function totalBytes(assets: readonly Asset[]): number {
  return assets.reduce((sum, asset) => sum + asset.code.length, 0);
}

function contaminated(assets: readonly Asset[]): string[] {
  return assets
    .filter((asset) => EDITOR_MARKERS.test(asset.code))
    .map((asset) => asset.name);
}

beforeAll(async () => {
  /*
    ⚠️ `NODE_ENV=production` À MÃO, e é MEDIDO: o vitest põe
    `NODE_ENV=test` no processo, e o `resolveConfig` do Vite decide
    `isProduction` por ele — não pelo `mode`. Com `test`, o build embarca o
    React de DESENVOLVIMENTO e o mesmo código dá **540 kB** em vez dos
    **342 kB** que o `pnpm build` gera. Os tetos acima medem o bundle que a
    pessoa baixa, então o build daqui tem de ser o mesmo que o do deploy.
  */
  const previousEnv = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = 'production';
  try {
    await build({
      root: process.cwd(),
      mode: 'production',
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
  } finally {
    process.env['NODE_ENV'] = previousEnv;
  }

  const assets = join(outDir, 'assets');
  scripts = readdirSync(assets)
    .filter((entry) => entry.endsWith('.js'))
    .map((entry) => ({
      name: entry,
      code: readFileSync(join(assets, entry), 'utf8'),
    }));

  indexHtml = readFileSync(join(outDir, 'index.html'), 'utf8');
  const eager = new Set(eagerScriptNames(indexHtml));
  entryScripts = scripts.filter((asset) => eager.has(asset.name));
}, 300_000);

describe('the app bundle (rule 21)', () => {
  it('produces JavaScript assets, and knows which of them the first load fetches', () => {
    // Asserção vazia (§7.4): um build que não emitisse nada deixaria TODO
    // `not.toMatch` abaixo verde, provando nada — que é justamente o estado que
    // esta guarda existe para acusar. E um `index.html` de onde a extração não
    // tirasse nada faria `entryScripts` ficar vazio, com o mesmo efeito: o teto
    // da entrada passaria com 0 B e as marcas com nenhum arquivo para varrer.
    expect(scripts.length).toBeGreaterThan(0);
    expect(totalBytes(scripts)).toBeGreaterThan(100_000);
    expect(entryScripts.length).toBeGreaterThan(0);
    expect(totalBytes(entryScripts)).toBeGreaterThan(100_000);
  });

  it('does bundle the design system it claims to guard', () => {
    /*
      O outro lado do par, e ele é o que dá sentido ao teste seguinte: se o
      `@clube/ui` NÃO estivesse no bundle, "não tem TipTap" seria verdade por
      omissão, e a guarda passaria verde justamente no dia em que alguém
      apagasse o `import { Button } from '@clube/ui'` das telas.

      A marca é `rounded-control`, a classe que o `button.tsx` escreve. Duas
      razões: nome de CLASSE sobrevive à minificação (não é identificador), e
      ele existe só em `packages/ui` — nenhuma tela do app o escreve.

      ⚠️ MEDIDO, e é o motivo de não ser `aria-busy` (a primeira escolha, pela
      regra 8 da Tarefa 13): `aria-busy` já estava no bundle ANTES de qualquer
      tela importar o `Button`. O `react-dom` embarca a tabela de atributos
      ARIA, então a marca ficava verde por acidente e o par não guardava nada.
    */
    const bundled = entryScripts.some((asset) =>
      asset.code.includes('rounded-control'),
    );
    expect(bundled).toBe(true);
  });

  it('keeps the FIRST LOAD under a ceiling that the editor cannot fit into', () => {
    // O teto do que a pessoa baixa para ver o LOGIN. O chunk do editor não
    // entra nesta soma porque o `index.html` não o pede — e é isso que o
    // `lazy()` compra.
    expect(totalBytes(entryScripts)).toBeLessThan(ENTRY_CEILING_BYTES);
  });

  it('ships no TipTap and no ProseMirror in the FIRST LOAD', () => {
    // ⚠️ Falhou? Alguém importou `@clube/ui/editor` de forma ESTÁTICA (ou
    // reexportou o `RichEditor` pelo barril de `@clube/ui`). O bundle do login
    // acabou de crescer ~454 kB. NÃO relaxe este teste: troque o import por
    // `React.lazy(() => import('@clube/ui/editor'))`.
    expect(contaminated(entryScripts)).toEqual([]);
  });

  it('puts the editor in a chunk of its OWN, which the first load does not fetch', () => {
    /*
      ⚠️ A TERCEIRA ASSERÇÃO, e ela é a que impede as duas de cima de passarem
      por acidente. Desfazer o `lazy()` põe o editor de volta na entrada: a
      asserção acima acusa. Mas APAGAR a tela do editor (ou o `import`
      dinâmico) deixaria as duas de cima verdes por omissão — e é exatamente o
      estado em que a Tarefa 14 mediu "zero marcas" e concluiu a coisa errada.

      Então o chunk do editor tem de EXISTIR, tem de ter as marcas, e tem de
      estar FORA do que o `index.html` manda buscar.
    */
    const lazyScripts = scripts.filter(
      (asset) => !entryScripts.includes(asset),
    );
    const withEditor = contaminated(lazyScripts);

    expect(withEditor.length).toBeGreaterThan(0);
    // E o chunk é grande: se ele tivesse 2 kB, o editor de verdade continuaria
    // na entrada e o que sobrou aqui seria só o módulo de fachada.
    const editorBytes = totalBytes(
      lazyScripts.filter((asset) => withEditor.includes(asset.name)),
    );
    expect(editorBytes).toBeGreaterThan(300_000);

    // E o `index.html` não o pede — nem por `src`, nem por `modulepreload`.
    for (const name of withEditor) {
      expect(indexHtml).not.toContain(name);
    }
  });

  it('stays under a ceiling for the WHOLE build, editor chunk included', () => {
    // A rede contra o que a varredura por NOME não pega: outra biblioteca de
    // 400 kB entrando por um `import` distraído deixaria os `EDITOR_MARKERS`
    // verdes e o PWA lento igual.
    expect(totalBytes(scripts)).toBeLessThan(TOTAL_CEILING_BYTES);
  });
});
