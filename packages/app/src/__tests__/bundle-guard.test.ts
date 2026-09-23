// @vitest-environment node
//
// ⚠️ `node` e não o `jsdom` do `vitest.config.ts`, pelo mesmo motivo medido em
// `ui-source-scan.test.ts`: o `esbuild` verifica no carregamento que
// `new TextEncoder().encode('') instanceof Uint8Array`, e o `TextEncoder` do
// jsdom devolve um `Uint8Array` de OUTRO realm — a checagem dá falso e o
// esbuild aborta com "your JavaScript environment is broken".
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
 * ⚠️ **OS MÓDULOS QUE SÃO AS TELAS DE ADMINISTRAÇÃO DO LIVRO** (Tarefa 44c) —
 * o `book-form.tsx` e o `plan-editor.tsx`.
 *
 * ⚠️ **A GUARDA EXISTE PORQUE O TETO DE BYTES NÃO GUARDA ESTA PROPRIEDADE.** O
 * `ENTRY_CEILING_BYTES` mede TAMANHO: no dia em que alguém desfizer o
 * `React.lazy()` do `router.tsx` e outra coisa encolher na mesma proporção,
 * o teto continua verde e o formulário volta para o primeiro carregamento **em
 * silêncio**. É a classe "guarda unidirecional" que a Tarefa 41b pagou e que a
 * 44b pagou de novo. Medido nesta fatia, e não suposto: com o `lazy()`
 * desfeito a entrada volta a **445.040 B**, que está **abaixo** dos 450.000 —
 * o teto fica VERDE.
 *
 * ⚠️⚠️ **A ÂNCORA É O GRAFO DE MÓDULOS DO ROLLUP, e ela SUBSTITUIU uma marca
 * de texto — a troca é da rodada de correção da 44c, e foi medida.**
 *
 * A primeira versão varria o CÓDIGO EMITIDO atrás do caminho de chave de
 * catálogo `pages.bookForm.(fields|plan).`. Aquilo funcionava (string literal
 * sobrevive à minificação; o `pt.ts` é objeto aninhado, então o caminho
 * pontilhado só existe em quem chama o `t()`), mas tinha um defeito de
 * classe: **a marca era acoplada a uma GRAFIA de código-fonte**, e a lista de
 * exclusões dela já estava errada no dia em que nasceu. O docblock afirmava
 * que `pages.bookForm.` cru dava **2** ocorrências na entrada, as duas de
 * `entry.` — os rótulos dos links, escritos por `home.tsx:315` e
 * `book.tsx:650`. **Remedido neste build: são 3.** A terceira é
 * `pages.bookForm.loading`, e quem a pôs na entrada foi **esta mesma fatia**,
 * pelo `fallback` do `Suspense` no `router.tsx`. Ou seja: a exclusão
 * `(?!entry\.)` que qualquer "simplificação" escreveria deixaria a guarda
 * vermelha para sempre, pela razão errada.
 *
 * O grafo do Rollup não tem esse problema. `build()` devolve, por chunk, os
 * **ids dos módulos** que o Rollup pôs dentro dele — o caminho do ARQUIVO, que
 * é o mesmo que o `import('./pages/book-form')` do `router.tsx` escreve. Um
 * `import` estático põe o módulo no chunk da entrada e esta guarda cai;
 * renomear o arquivo quebra o `import` antes de quebrar a guarda; e nenhuma
 * mudança de tradução, de minificador ou de chave a alcança.
 *
 * ⚠️ **O que a troca NÃO muda:** quem responde "o que a pessoa baixa" continua
 * sendo o `index.html` do build, nunca o `isEntry` do Rollup nem o nome do
 * arquivo — é a disciplina que o docblock do topo defende, e as asserções
 * abaixo cruzam as duas fontes de propósito.
 */
const BOOK_FORM_MODULES =
  /[\\/]pages[\\/](?:book-form|plan-editor)\.tsx(?:$|\?)/u;

/**
 * ⚠️ **O PISO DO CHUNK DO FORMULÁRIO** — o irmão pequeno do `> 300_000` do
 * editor, e ele existe pela mesma razão: um chunk de 1 kB seria o módulo de
 * fachada do `lazy()`, com o formulário de verdade ainda na entrada. Medido
 * nesta fatia: **10.059 B**. O piso é metade disso, para não cair num
 * conserto de prosa.
 */
const BOOK_FORM_CHUNK_FLOOR_BYTES = 5_000;

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

/**
 * Um chunk como o ROLLUP o descreve: o nome do arquivo emitido e os ids dos
 * módulos-fonte que entraram nele. É a âncora das duas guardas da 44c.
 */
interface BuiltChunk {
  fileName: string;
  moduleIds: string[];
}

let bundleChunks: BuiltChunk[] = [];
let scripts: Asset[] = [];
/** Os `.js` que o `index.html` manda buscar no primeiro carregamento. */
let entryScripts: Asset[] = [];
let indexHtml = '';
/** O `sw.js` emitido — é nele que mora o manifesto de precache do Workbox. */
let serviceWorker = '';
/**
 * Os `.js` da RAIZ do `dist/` — que é onde o Vite copia o `public/` verbatim.
 * O chunk do Rollup mora em `assets/`; o `push-handler.js` nunca passa por lá.
 */
let rootScripts: Asset[] = [];
/** Os `.woff2` que o build copiou de `public/fonts/` para o `dist/`. */
let fontFiles: string[] = [];

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

/**
 * Os `.css` que o `index.html` manda buscar no primeiro carregamento.
 *
 * O irmão do `eagerScriptNames`, e ele existe pela mesma razão: o que a pessoa
 * baixa antes de a tela pintar é o que o `index.html` DECLARA, não o que o nome
 * do arquivo sugere. Sem a folha de estilo o app abre offline **em branco**,
 * que é indistinguível de "não abriu".
 */
function eagerStyleNames(html: string): string[] {
  const names = new Set<string>();

  for (const match of html.matchAll(/<link\b[^>]*\bhref="([^"]+\.css)"/gu)) {
    const reference = match[1];
    if (reference === undefined) continue;
    const name = reference.split(/[?#]/u)[0]?.split('/').pop();
    if (name !== undefined) names.add(name);
  }

  return [...names];
}

/**
 * ⚠️ **BYTES DE VERDADE, E NÃO `String.length`** — correção medida na rodada da
 * Tarefa 27.
 *
 * `asset.code` é uma string JÁ DECODIFICADA, e `.length` conta **unidades de
 * código UTF-16**, não bytes. Todo caractere acentuado dos catálogos custa
 * **2 bytes e 1 unidade**, então o teto chamado `..._BYTES` media uma coisa e
 * se chamava outra: medido neste build, `chars = 417.719` × `bytes = 418.003`
 * — um gap de 284 que **cresce com conteúdo em português**, exatamente a
 * direção em que o produto cresce.
 *
 * Foi esse gap que produziu a "divergência de 283 B não reproduzida" que a spec
 * da Tarefa 27 registrou entre duas medições do MESMO build: os dois números
 * sempre foram o mesmo build, contado em unidades diferentes.
 *
 * O teto de 450.000 fica: ele é uma ordem de grandeza de rede, e passar a
 * contar 284 bytes a mais não muda a decisão — muda o número dizer a verdade.
 */
function totalBytes(assets: readonly Asset[]): number {
  return assets.reduce(
    (sum, asset) => sum + Buffer.byteLength(asset.code, 'utf8'),
    0,
  );
}

/**
 * Os assets cujo CÓDIGO carrega uma das marcas — o nome deles, para a mensagem
 * de falha dizer QUAL arquivo sujou.
 *
 * ⚠️ Generalizada na Tarefa 44c. Ela se chamava `contaminated` e tinha o
 * `EDITOR_MARKERS` preso por dentro; a guarda do formulário de livro nasceu
 * com uma marca de texto própria e precisava da MESMA varredura.
 *
 * ⚠️ **HOJE O ÚNICO CHAMADOR VOLTOU A SER O EDITOR** — a rodada de correção da
 * 44c trocou a marca de texto do formulário pela âncora de GRAFO
 * (`chunksBuiltFrom`), pelas razões medidas no `BOOK_FORM_MODULES`. O
 * parâmetro fica: ele é o que separa "varrer" de "que marca varrer", e voltar
 * a prender a marca por dentro seria desfazer a lição pela metade.
 */
function marked(assets: readonly Asset[], markers: RegExp): string[] {
  return assets
    .filter((asset) => markers.test(asset.code))
    .map((asset) => asset.name);
}

/** Os chunks que o `index.html` NÃO manda buscar no primeiro carregamento. */
function lazyChunks(): Asset[] {
  return scripts.filter((asset) => !entryScripts.includes(asset));
}

/**
 * Os NOMES dos chunks que o Rollup montou a partir de algum módulo que casa
 * com `pattern` — a âncora de grafo que substituiu a marca de texto na rodada
 * de correção da 44c.
 *
 * ⚠️ O nome volta como **basename**, para casar com o `Asset.name` (que vem do
 * `readdirSync`) e com o que o `index.html` escreve. O `fileName` do Rollup
 * traz o prefixo `assets/`.
 */
function chunksBuiltFrom(pattern: RegExp): string[] {
  return bundleChunks
    .filter((chunk) => chunk.moduleIds.some((id) => pattern.test(id)))
    .map((chunk) => chunk.fileName.split('/').pop() ?? chunk.fileName);
}

/**
 * ⚠️ **O `push-handler.js` COMO ELE ESTÁ NO DISCO** (Tarefa 38, rodada de
 * conserto).
 *
 * Ele é lido para servir de **identidade por CONTEÚDO**: o arquivo emitido na
 * raiz do `dist/` é encontrado por ser byte a byte este, e não por alguém
 * escrever o nome dele numa constante. É a disciplina que a guarda do `en`
 * inaugurou (Tarefa 29a, e ela saiu na 38d), pelo motivo que continua valendo:
 * um nome escrito no teste é um nome que pode deixar de casar em silêncio.
 */
const pushHandlerSource = readFileSync(
  resolve(process.cwd(), 'public/push-handler.js'),
  'utf8',
);

/**
 * A entrada do manifesto de precache daquele `url`, e a **revisão** dela.
 *
 * Devolve `null` quando não há entrada nenhuma **ou** quando ela vem sem
 * revisão — os dois são a mesma falha para quem tem o app instalado, e é por
 * isso que não se distinguem aqui.
 *
 * ⚠️ A leitura é por **regex sobre o objeto**, e não pela string
 * `{url:"x",revision:"y"}` inteira: a ordem das chaves e os espaços são escolha
 * do minificador, e pinar o texto minificado faria a guarda cair num upgrade de
 * Workbox — por um motivo que não tem nada a ver com a propriedade.
 */
function precacheRevision(sw: string, url: string): string | null {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const entry = new RegExp(
    `\\{[^{}]*\\burl:\\s*"${escaped}"[^{}]*\\}`,
    'u',
  ).exec(sw);
  if (entry === null) return null;
  return /\brevision:\s*"([0-9a-f]{32})"/u.exec(entry[0])?.[1] ?? null;
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
  let result: Awaited<ReturnType<typeof build>>;
  try {
    result = await build({
      root: process.cwd(),
      mode: 'production',
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
  } finally {
    process.env['NODE_ENV'] = previousEnv;
  }

  /*
    ⚠️ **O GRAFO DE MÓDULOS, guardado antes de qualquer asserção.** `build()`
    devolve `RollupOutput`, `RollupOutput[]` ou um `RollupWatcher` (que este
    build nunca é, porque não há `watch`); o estreitamento é por `'output' in`,
    sem `as`. É daqui que sai a âncora das duas guardas do formulário de livro:
    o id do MÓDULO-FONTE que o Rollup pôs em cada chunk.
  */
  const outputs = Array.isArray(result)
    ? result
    : 'output' in result
      ? [result]
      : [];

  bundleChunks = outputs.flatMap((output) =>
    output.output
      .filter((chunk) => chunk.type === 'chunk')
      .map((chunk) => ({
        fileName: chunk.fileName,
        moduleIds: Object.keys(chunk.modules),
      })),
  );

  const assets = join(outDir, 'assets');
  scripts = readdirSync(assets)
    .filter((entry) => entry.endsWith('.js'))
    .map((entry) => ({
      name: entry,
      code: readFileSync(join(assets, entry), 'utf8'),
    }));

  indexHtml = readFileSync(join(outDir, 'index.html'), 'utf8');
  serviceWorker = readFileSync(join(outDir, 'sw.js'), 'utf8');
  rootScripts = readdirSync(outDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => ({
      name: entry.name,
      code: readFileSync(join(outDir, entry.name), 'utf8'),
    }));
  const fontsDir = join(outDir, 'fonts');
  fontFiles = existsSync(fontsDir)
    ? readdirSync(fontsDir).filter((entry) => entry.endsWith('.woff2'))
    : [];

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
    expect(marked(entryScripts, EDITOR_MARKERS)).toEqual([]);
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
    const lazyScripts = lazyChunks();
    const withEditor = marked(lazyScripts, EDITOR_MARKERS);

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

  it('⚠️ ships NO BOOK FORM in the FIRST LOAD (task 44c)', () => {
    /*
      ⚠️ **A GUARDA QUE DÁ SENTIDO À TAREFA 44c, e ela é de CONTEÚDO.**

      As telas de ADMINISTRAÇÃO do livro (`book-form.tsx` + `plan-editor.tsx`)
      não entram no arquivo que o navegador baixa antes de qualquer coisa
      aparecer. Quem lê e escreve — que é todo mundo, todo dia — não paga o
      formulário que dois administradores abrem uma vez por mês.

      Medido na Tarefa 44c: a entrada caiu de **445.040 B** para **435.580 B**
      (−9.460 B), e a folga contra os 450.000 subiu de 4.960 B para 14.420 B.

      ⚠️ Falhou? Alguém trocou o `lazy(() => import('./pages/book-form'))` do
      `router.tsx` por um `import { BookFormPage } from './pages/book-form'`
      estático. NÃO relaxe esta guarda: desfaça o import.

      ⚠️ E ela NÃO é redundante com o teto de bytes logo acima. O teto mede
      TAMANHO: com o formulário de volta na entrada e outra coisa encolhendo na
      mesma proporção, ele fica verde e o defeito volta sem acusador.

      ⚠️⚠️ **MAS ELA TAMBÉM NÃO É "uma guarda, uma razão de cair" (§7.9) — e a
      versão anterior deste comentário afirmava que era, o que é FALSO.** Ela
      cai por DUAS razões, e as duas foram medidas na rodada de correção:

      1. o formulário voltou para o primeiro carregamento (o defeito);
      2. o ARQUIVO mudou de nome ou de pasta, e o `BOOK_FORM_MODULES` deixou de
         casar — a guarda envelheceu, o app está certo.

      A (2) é o preço de toda âncora, e ela é BARATA aqui: renomear
      `pages/book-form.tsx` quebra o `import('./pages/book-form')` do
      `router.tsx` e o `typecheck` antes de chegar a este teste. **Se esta
      linha ficar vermelha sem que o `lazy()` tenha mudado, é a ÂNCORA que
      envelheceu, e o conserto é a âncora, não o `lazy()`.**
    */
    const eager = new Set(entryScripts.map((asset) => asset.name));
    const inFirstLoad = chunksBuiltFrom(BOOK_FORM_MODULES).filter((name) =>
      eager.has(name),
    );

    expect(inFirstLoad).toEqual([]);
  });

  it('⚠️ puts the book form in a chunk of its OWN, which the first load does not fetch (task 44c)', () => {
    /*
      ⚠️ **O PAR POSITIVO, e ele é obrigatório** — a mesma terceira asserção que
      o teste do editor acima tem, pela mesma razão exata: APAGAR as telas de
      administração (ou o `import()` dinâmico) deixaria a asserção de cima
      verde **por omissão**, que é o estado em que a Tarefa 14 mediu "zero
      marcas" e concluiu a coisa errada.

      Então o chunk do formulário tem de EXISTIR, tem de conter os dois
      módulos, tem de ser grande o bastante para não ser só a fachada do
      `lazy()`, e tem de estar FORA do que o `index.html` manda buscar.
    */
    const withBookForm = chunksBuiltFrom(BOOK_FORM_MODULES);

    expect(withBookForm.length).toBeGreaterThan(0);

    /*
      ⚠️ O CRUZAMENTO DAS DUAS FONTES, e é ele que faz a âncora de grafo valer:
      o Rollup diz QUAL chunk carrega os módulos, e o `lazyChunks()` — que sai
      do `index.html` — diz que esse chunk não é buscado no primeiro
      carregamento. Nenhum dos dois lados adivinha pelo nome do arquivo.
    */
    const onDisk = lazyChunks().filter((asset) =>
      withBookForm.includes(asset.name),
    );
    expect(onDisk).toHaveLength(withBookForm.length);

    expect(totalBytes(onDisk)).toBeGreaterThan(BOOK_FORM_CHUNK_FLOOR_BYTES);

    // E o `index.html` não o pede — nem por `src`, nem por `modulepreload`.
    for (const name of withBookForm) {
      expect(indexHtml).not.toContain(name);
    }
  });

  /*
    ⚠️⚠️ **TRÊS ASSERÇÕES DO `en` SAÍRAM NA TAREFA 38d — e este bloco existe
    para dizer QUAIS, porque duas delas eram par positivo uma da outra.**

    Elas eram:

    1. `⚠️ ships no en CATALOG in the FIRST LOAD (rule 16)` — nenhuma frase
       exclusiva do `en` no que o `index.html` manda buscar;
    2. `⚠️ puts the en catalog in a chunk of its OWN, which the first load does
       not fetch (rule 15)` — o par positivo da primeira: sem ele, APAGAR o
       catálogo deixaria a (1) verde por omissão;
    3. `⚠️ keeps the en catalog OUT of the service worker PRECACHE (task 29a)`
       — a guarda de verdade do `globIgnores`, lendo o `sw.js` emitido.

    ⚠️ **A (2) é o motivo de as três saírem JUNTAS, e não é detalhe.** Ela foi
    escrita exatamente para o estado em que estamos agora — "o catálogo não
    está na entrada porque não está em lugar nenhum" — e foi o dono quem
    decidiu que esse estado passa a ser o certo. Manter a (1) e a (3) sem a (2)
    seria a asserção vazia do §7.4 em duas cópias: duas varreduras verdes sobre
    um conjunto que nunca mais tem elemento.

    ⚠️⚠️ **O QUE ESTE PARÁGRAFO DIZIA, E ERA FALSO — achado pela auditoria da
    rodada de correção da 38d:** *"o `entryScripts` continua pinado dentro do
    `sw.js` pela asserção do `push-handler` abaixo"*. **Não continuava.** A
    asserção do `push-handler` só olha `rootScripts` e a revisão dele; a linha
    que pinava a entrada morava DENTRO da (3), e saiu com ela:

      expect(entryScripts.filter((a) => serviceWorker.includes(a.name)))
        .toHaveLength(entryScripts.length)

    Ou seja: a fatia apagou um teste do `en` e levou junto, de carona, a
    propriedade **"o app abre offline"** — que não tem nada a ver com idioma. O
    parágrafo é pior que o silêncio porque desliga quem vier depois: ele nomeia
    um dono que não existe. Fica riscado, e a propriedade ganhou **asserção
    própria** logo abaixo (§7.9: uma guarda, uma razão de cair).
  */

  it('⚠️ precaches the FIRST LOAD, so an installed app opens offline (task 38d)', () => {
    /*
      ⚠️⚠️ **A PROPRIEDADE ÓRFÃ, COM DONO — e ela é a QUARTA aparição da classe
      "a guarda pina o TEXTO do config em vez do COMPORTAMENTO"** (29a, 34b, 38,
      e a rodada de correção desta).

      O `service-worker-config.test.ts` diz o que está ESCRITO no
      `vite.config.ts`. Nada lá sabe o que o Workbox de fato pôs no manifesto —
      e o mutante que mede isso é de uma linha:

        globIgnores: ['assets/**']

        suite do app   33/33 arquivos verdes, ZERO acusadores
        precache       16 entradas / 898,33 KiB  →  13 entradas / 11,84 KiB

      O chunk de entrada (431 kB), o CSS (22 kB) e o chunk do editor saem do
      precache: **o app deixa de abrir offline**, e a única coisa que muda na
      suíte é nada. Um `globPatterns` mais estreito, um `manifestTransform`, um
      upgrade de plugin — qualquer um chega no mesmo lugar.

      ⚠️ **O CSS entra junto, e não é zelo:** sem a folha de estilo o app abre
      offline **em branco**, que para quem está no metrô é indistinguível de não
      abrir. As duas listas saem do `index.html` do build (o que o navegador
      DECLARA buscar), nunca de um nome de arquivo adivinhado.

      ⚠️ **O que esta asserção NÃO cobre, de propósito:** o chunk do EDITOR, que
      o `index.html` não pede (é `lazy()`). Ele está no precache hoje e isso é
      pré-existente e discutido no teste do editor acima — pô-lo aqui faria esta
      guarda cair no dia em que alguém o tirasse do precache DE PROPÓSITO, que é
      uma fatia de performance legítima.
    */
    const styleNames = eagerStyleNames(indexHtml);

    /*
      ⚠️ O PAR POSITIVO (§7.4), e aqui ele é obrigatório: os dois laços abaixo
      são varreduras, e uma lista vazia os deixa verdes provando "o
      `index.html` não pede nada".
    */
    expect(entryScripts.length).toBeGreaterThan(0);
    expect(styleNames.length).toBeGreaterThan(0);

    for (const asset of entryScripts) {
      expect(serviceWorker).toContain(asset.name);
    }
    for (const name of styleNames) {
      expect(serviceWorker).toContain(name);
    }
  });

  it('⚠️ precaches EVERY self-hosted font, so offline keeps the typography (dono, 2026-09-20)', () => {
    /*
      ⚠️ A ASSERÇÃO QUE FAZ A DECISÃO DE AUTO-HOSPEDAR VALER ALGUMA COISA.

      O dono trocou o `<link>` do Google Fonts por `@font-face` próprio com
      arquivo em `public/fonts/`, e a razão foi UMA: offline, uma folha de
      terceiro não é precacheada e o app cai na fonte do sistema.

      Mas quem decide o que entra no precache é o `globPatterns` do
      `vite.config.ts`, e ele lista EXTENSÕES. Até 2026-09-20 ele não tinha
      `woff2`. Tirar `woff2` de lá devolve exatamente o defeito que a decisão
      comprou — os arquivos ficam no `dist/`, o CSS os pede, e offline o
      navegador não os tem — e NADA mais no projeto acusa:

      - `service-worker-config.test.ts` só lê o TEXTO do `vite.config.ts`, e
        um `globPatterns` sem `woff2` é texto perfeitamente válido;
      - `index-html.test.ts` confere que o arquivo existe em `public/`, não que
        ele foi precacheado;
      - a suíte inteira fica verde, e a tipografia só falha no metrô.

      É a QUINTA aparição da classe "a guarda pina o texto do config em vez do
      comportamento" (29a, 34b, 38, 38d e esta). Por isso ela mede o `sw.js`
      emitido, como as duas vizinhas.
    */
    // §7.4: um build sem fonte nenhuma deixaria o laço verde provando nada — e
    // "a pasta sumiu" é justamente uma das formas de o defeito acontecer.
    expect(fontFiles.length).toBeGreaterThan(0);

    const missing = fontFiles.filter(
      (name) => !serviceWorker.includes(`fonts/${name}`),
    );

    expect(missing).toEqual([]);
  });

  it('⚠️ precaches the push handler WITH a revision, so a fix REACHES an installed app (task 38)', () => {
    /*
      ⚠️⚠️ **A PROPRIEDADE QUE FAZ UMA CORREÇÃO NO `push-handler.js` CHEGAR A
      QUEM JÁ TEM O APP INSTALADO — e a TERCEIRA aparição, neste projeto, do
      padrão "a guarda pina o TEXTO do config".**

      O `service-worker-config.test.ts` afirma que `importScripts:
      ['push-handler.js']` está escrito no `vite.config.ts`. Isso é a
      **declaração de intenção**, e ela é verdadeira mesmo quando a propriedade
      está morta — exatamente como o `globIgnores` do `en` era verdadeiro depois
      de ter deixado de casar (Tarefa 29a: 619 testes verdes, zero acusadores).

      A propriedade de verdade é OUTRA: o handler entra no **manifesto de
      precache COM REVISÃO**. É a revisão que faz o `sw.js` mudar quando só o
      handler muda; e é o `sw.js` mudar que faz o navegador buscar a versão
      nova. Sem ela, `importScripts('push-handler.js')` continua funcionando —
      o arquivo é servido, o listener é registrado, tudo verde — e quem já tem o
      app instalado fica com o handler ANTIGO **para sempre**, porque o
      service worker que ele já baixou é byte a byte o mesmo.

      ⚠️ **O mutante medido, e ele é uma linha que qualquer fatia futura pode
      escrever:** `globIgnores: ['assets/en-*.js', 'push-handler.js']`. Sem esta
      guarda o build cai de **16 entradas / 897,12 KiB** para **15 / 892,48
      KiB**, a entrada desaparece do `sw.js`, e a suíte do app passa **765/765,
      ZERO acusadores**.

      ⚠️ **E a identificação é por CONTEÚDO, não por nome** — a lição da 29a na
      letra: o arquivo emitido é achado por ser byte a byte o
      `public/push-handler.js`, e o nome sai daí. Um `push-handler.js` renomeado
      (ou copiado para outra pasta) continua sendo pego.
    */
    const emitted = rootScripts.filter(
      (asset) => asset.code === pushHandlerSource,
    );

    // ⚠️ O LADO POSITIVO (§7.4): sem esta linha, um build que não copiasse o
    // handler deixaria o laço abaixo sem nenhuma iteração, e a guarda diria
    // "está tudo certo" provando "o arquivo não existe".
    expect(emitted).toHaveLength(1);

    for (const asset of emitted) {
      /*
        A revisão É o `md5` do arquivo — medido neste build:
        `md5sum public/push-handler.js` e o `revision` da entrada no `sw.js` são
        a mesma string. Não é decoração: é ela que carrega a mudança do handler
        para dentro dos bytes do service worker.

        Um Workbox futuro que trocasse o digest deixaria esta linha vermelha.
        **ATUALIZE o cálculo, não apague a asserção** — a propriedade continua
        sendo "a revisão vem do conteúdo".
      */
      expect(precacheRevision(serviceWorker, asset.name)).toBe(
        createHash('md5').update(asset.code, 'utf8').digest('hex'),
      );
    }
  });

  it('stays under a ceiling for the WHOLE build, editor chunk included', () => {
    // A rede contra o que a varredura por NOME não pega: outra biblioteca de
    // 400 kB entrando por um `import` distraído deixaria os `EDITOR_MARKERS`
    // verdes e o PWA lento igual.
    expect(totalBytes(scripts)).toBeLessThan(TOTAL_CEILING_BYTES);
  });
});
