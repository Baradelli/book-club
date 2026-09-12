// @vitest-environment node
//
// ⚠️ `node` e não o `jsdom` do `vitest.config.ts`, pelo mesmo motivo medido em
// `ui-source-scan.test.ts`: o `esbuild` verifica no carregamento que
// `new TextEncoder().encode('') instanceof Uint8Array`, e o `TextEncoder` do
// jsdom devolve um `Uint8Array` de OUTRO realm — a checagem dá falso e o
// esbuild aborta com "your JavaScript environment is broken".
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
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
 * AS FRASES QUE DENUNCIAM O CATÁLOGO `en` (Tarefa 29a, regras 15 e 16).
 *
 * São **valores** do `en.ts`, escolhidos por leitura, e cada uma é exclusiva
 * dele — o `pt` diz outra coisa no mesmo lugar, e nenhuma tela as escreve à
 * mão (`CLAUDE.md`: nenhum texto solto). Frase de catálogo sobrevive à
 * minificação inteira: não é identificador, é conteúdo.
 *
 * | chave | `en` (aqui) | `pt` |
 * |---|---|---|
 * | `app.name` | `Book Club` | `Clube do Livro` |
 * | `errors.network` | `No connection to the server…` | `Sem conexão com o servidor…` |
 *
 * Duas, e não uma, porque uma frase é uma string que alguém reescreve num
 * conserto de tradução; as duas caírem juntas é bem menos provável. Se uma
 * delas mudar no catálogo, ATUALIZE a lista — não apague a asserção.
 */
const EN_CATALOG_MARKERS = [
  'Book Club',
  'No connection to the server. Check your internet.',
] as const;

function withEnCatalog(assets: readonly Asset[]): string[] {
  return assets
    .filter((asset) =>
      EN_CATALOG_MARKERS.some((phrase) => asset.code.includes(phrase)),
    )
    .map((asset) => asset.name);
}

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
/** O `sw.js` emitido — é nele que mora o manifesto de precache do Workbox. */
let serviceWorker = '';
/**
 * Os `.js` da RAIZ do `dist/` — que é onde o Vite copia o `public/` verbatim.
 * O chunk do Rollup mora em `assets/`; o `push-handler.js` nunca passa por lá.
 */
let rootScripts: Asset[] = [];

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

function contaminated(assets: readonly Asset[]): string[] {
  return assets
    .filter((asset) => EDITOR_MARKERS.test(asset.code))
    .map((asset) => asset.name);
}

/**
 * ⚠️ **O `push-handler.js` COMO ELE ESTÁ NO DISCO** (Tarefa 38, rodada de
 * conserto).
 *
 * Ele é lido para servir de **identidade por CONTEÚDO**: o arquivo emitido na
 * raiz do `dist/` é encontrado por ser byte a byte este, e não por alguém
 * escrever o nome dele numa constante. Mesma disciplina da guarda do `en` logo
 * acima, e pelo mesmo motivo — um nome escrito no teste é um nome que pode
 * deixar de casar em silêncio.
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
  serviceWorker = readFileSync(join(outDir, 'sw.js'), 'utf8');
  rootScripts = readdirSync(outDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => ({
      name: entry.name,
      code: readFileSync(join(outDir, entry.name), 'utf8'),
    }));
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

  it('⚠️ ships no en CATALOG in the FIRST LOAD (rule 16)', () => {
    /*
      ⚠️ Falhou? Alguém pôs o `en` de volta em `eagerResources`, ou apontou o
      `import()` para o BARRIL (`@clube/shared/locales`) em vez do subpath
      `@clube/shared/locales/en`. As duas desfazem a fatia SEM ERRO NENHUM: o
      Rollup vê o binding usado e traz o catálogo para a entrada, e todo mundo
      que lê em português volta a baixar 9,5 kB de inglês.

      É a guarda do tipo "só pode melhorar" (decisão H), o mesmo padrão que o
      MVP 2 usou para as strings cravadas em `ui`: pina o fato e deixa a
      asserção só poder cair.
    */
    expect(withEnCatalog(entryScripts)).toEqual([]);
  });

  it('⚠️ puts the en catalog in a chunk of its OWN, which the first load does not fetch (rule 15)', () => {
    /*
      A terceira asserção do par, pelo mesmo motivo do chunk do editor: sem
      ela, APAGAR o catálogo `en` (ou trocar as frases acima) deixaria a
      asserção de cima verde por omissão — "não está na entrada" seria verdade
      porque ele não está em lugar nenhum, e ninguém saberia que o segundo
      idioma do app deixou de ser entregue.
    */
    const lazyScripts = scripts.filter(
      (asset) => !entryScripts.includes(asset),
    );
    const withCatalog = withEnCatalog(lazyScripts);

    expect(withCatalog).toHaveLength(1);
    // E é o catálogo INTEIRO que está lá, não um módulo de fachada com uma
    // frase dentro: o `en.ts` tem ~9,5 kB de conteúdo.
    expect(
      totalBytes(
        lazyScripts.filter((asset) => withCatalog.includes(asset.name)),
      ),
    ).toBeGreaterThan(5_000);

    // E o `index.html` não o pede — nem por `src`, nem por `modulepreload`.
    for (const name of withCatalog) expect(indexHtml).not.toContain(name);
  });

  it('⚠️ keeps the en catalog OUT of the service worker PRECACHE (task 29a)', () => {
    /*
      ⚠️ **ESTA É A GUARDA DO PRECACHE; a de `service-worker-config.test.ts` é
      a declaração de intenção.** As duas existem, e a distinção decide qual
      delas você conserta quando uma ficar vermelha.

      A de lá afirma que a string `'assets/en-*.js'` está escrita no
      `vite.config.ts`. É barata e documenta a decisão — mas a propriedade que
      importa NÃO mora no texto do config: o glob está acoplado a um nome de
      arquivo que **o Rollup escolheu**, e nada pina esse nome. Medido na
      rodada de correção, com o `globIgnores` intacto e um
      `chunkFileNames: 'assets/chunk-[name]-[hash].js'` acrescentado ao
      `rollupOptions` — a linha que qualquer fatia futura de performance pode
      escrever:

        dist/assets/chunk-en-DQfkl5UE.js       9.55 kB
        precache  16 entries (887.85 KiB)      ← o bloqueador de volta, inteiro
        suíte do app: 619 passed               ← ZERO acusadores

      Ou seja: o glob continuava lá, verdinho, e tinha deixado de casar.
      Guarda verde não é guarda (lição nº 1 do MVP 1).

      Por isso esta olha o ARTEFATO EMITIDO — o `sw.js` que este mesmo
      `beforeAll` já gera de graça — e identifica o chunk do `en` **por
      conteúdo** (as frases exclusivas do catálogo), nunca por nome. O nome
      pode mudar à vontade.
    */
    const lazyScripts = scripts.filter(
      (asset) => !entryScripts.includes(asset),
    );
    const withCatalog = withEnCatalog(lazyScripts);

    // O chunk existe e é UM (o mesmo par das regras 15/16): sem esta linha, um
    // build que não emitisse o catálogo deixaria o `not.toContain` abaixo
    // verde por omissão.
    expect(withCatalog).toHaveLength(1);

    // ⚠️ O LADO POSITIVO, e ele é o que impede a asserção de baixo de passar
    // com um `sw.js` vazio, sem manifesto, ou lido do lugar errado: o precache
    // LISTA o chunk de entrada, que é justamente o que ele deve trazer.
    expect(
      entryScripts.filter((asset) => serviceWorker.includes(asset.name)),
    ).toHaveLength(entryScripts.length);

    // E não lista o do `en`: quem lê em português não baixa inglês nem no
    // install, em segundo plano. O preço combinado é a decisão G — trocar de
    // idioma OFFLINE cai no `pt`, sem tela de erro.
    for (const name of withCatalog) expect(serviceWorker).not.toContain(name);
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
