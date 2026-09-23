import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { THEME_ATTRIBUTE, THEME_STORAGE_KEY } from '../theme';

/**
 * Regra 27: o tema é aplicado ANTES da primeira pintura.
 *
 * Não há como medir "não piscou" em jsdom — mas dá para provar o mecanismo, e
 * é exatamente o tipo de coisa que quebra em silêncio: quem apagar o script
 * inline não quebra teste nenhum de renderização, e o defeito só aparece na
 * abertura do app de quem usa tema escuro.
 */
// `process.cwd()` e não `import.meta.url`: no ambiente jsdom do Vitest o
// módulo não tem URL de arquivo, e o `fileURLToPath` estoura.
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('index.html', () => {
  it('applies the stored theme before the app module loads (rule 27)', () => {
    const themeScript = html.indexOf(THEME_STORAGE_KEY);
    const appModule = html.indexOf('src="/src/main.tsx"');

    expect(themeScript).toBeGreaterThan(-1);
    expect(appModule).toBeGreaterThan(-1);
    expect(themeScript).toBeLessThan(appModule);
  });

  it('uses the same storage key as theme.ts (rule 27)', () => {
    // Renomear a constante sem renomear o script inline devolve o flash sem
    // quebrar mais nada.
    expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
  });

  it('uses the same attribute the CSS selects (rule 27)', () => {
    expect(html).toContain(`setAttribute('${THEME_ATTRIBUTE}'`);
  });

  it('keeps the theme script synchronous, not deferred (rule 27)', () => {
    const head = html.slice(0, html.indexOf('</head>'));
    const inline = head.slice(head.lastIndexOf('<script'));

    // `defer`/`async` fariam o script rodar DEPOIS da primeira pintura, que é
    // o defeito que ele existe para evitar.
    expect(inline).not.toContain('defer');
    expect(inline).not.toContain('async');
    expect(inline).not.toContain('src=');
  });

  it('declares the document language as pt-BR', () => {
    expect(html).toContain('<html lang="pt-BR">');
  });
});

/**
 * AS QUATRO FAMÍLIAS, AUTO-HOSPEDADAS (decisão do dono, 2026-09-20).
 *
 * ⚠️ ESTE BLOCO MUDOU DE LADO. Até 2026-09-19 ele media um `<link>` para
 * `fonts.googleapis.com`, e registrava o preço: o `vite-plugin-pwa` precacheia
 * o que está em `dist/`, e uma folha de terceiro não está — OFFLINE, O APP
 * CAÍA NA FONTE DO SISTEMA. Era pergunta em aberto; o dono decidiu
 * auto-hospedar.
 *
 * O que sumiu do `index.html`: o `<link>` da folha e o `preconnect`. Nenhum
 * pedido do app sai para terceiro, e o script de tema não espera mais rede de
 * ninguém para rodar antes da primeira pintura.
 *
 * ⚠️ O CRUZAMENTO CONTINUA VALENDO NOS DOIS SENTIDOS — só que agora ele tem
 * TRÊS pontas em vez de duas, e a terceira é a que não mentia antes:
 *
 *   `--family-*` (theme.css)  ↔  `@font-face` (fonts.css)  ↔  arquivo em disco
 *
 * Os três defeitos que isso pega, e nenhum deles dá erro de build:
 *
 *  1. token nomeando família que ninguém carrega → o navegador cai no
 *     fallback, em silêncio (foi o mutante 8 da auditoria: `--family-reading:
 *     Georgia, serif`);
 *  2. `@font-face` que nenhum token nomeia → peso morto no precache, baixado
 *     por todo mundo e usado por ninguém;
 *  3. ⚠️ `@font-face` apontando para um `.woff2` QUE NÃO EXISTE. Esta é nova, e
 *     é a pior das três: `url()` quebrado não avisa nada — o navegador tenta,
 *     falha e usa o fallback. Com a folha do Google isso era impossível de
 *     acontecer por nossa causa; com arquivo nosso, um `mv` ou um `.gitignore`
 *     mal colocado basta.
 */

/** O `theme.css` sem comentário: ele CITA famílias em prosa, e citação não é
 * declaração (§7.1). */
const themeCss = readFileSync(
  resolve(process.cwd(), '..', 'ui', 'src', 'theme.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//gu, ' ');

/** O `fonts.css` do app, sem comentário, pelo mesmo motivo. */
const fontsCss = readFileSync(
  resolve(process.cwd(), 'src', 'fonts.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//gu, ' ');

/** A raiz servida: `public/` vira a raiz do `dist/`, então `/x` é `public/x`. */
const publicRoot = resolve(process.cwd(), 'public');

/**
 * Família que NÃO se carrega de lugar nenhum: genérico do CSS, ou fonte que já
 * vem instalada. É a única lista de NOMES neste arquivo, e ela é pequena de
 * propósito — ela classifica o FALLBACK de uma pilha, não decide desenho.
 */
const SYSTEM_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'georgia',
  'menlo',
  'consolas',
  'monaco',
  'courier new',
  'times new roman',
  'arial',
  'helvetica',
  'helvetica neue',
  'segoe ui',
  'roboto',
]);

/** Todo nome de família citado em algum `--family-*` do `theme.css`. */
function tokenFamilies(): string[] {
  return [...themeCss.matchAll(/--family-[a-z0-9-]+\s*:\s*([^;]+);/gu)]
    .flatMap((match) => (match[1] ?? '').split(','))
    .map((name) => name.trim().replace(/^['"]|['"]$/gu, ''))
    .filter((name) => name !== '');
}

interface FontFace {
  family: string;
  url: string;
}

/** Cada `@font-face` do `fonts.css`: a família que ele define e o arquivo. */
function fontFaces(): FontFace[] {
  return [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/gu)].flatMap(
    (block) => {
      const body = block[1] ?? '';
      const family = /font-family:\s*([^;]+);/u
        .exec(body)?.[1]
        ?.trim()
        .replace(/^['"]|['"]$/gu, '');
      const url = /url\(\s*['"]?([^'")]+)['"]?\s*\)/u.exec(body)?.[1]?.trim();
      return family === undefined || url === undefined ? [] : [{ family, url }];
    },
  );
}

describe('as quatro famílias do canvas, auto-hospedadas', () => {
  it('asks NO third party for anything', () => {
    /*
      A decisão inteira em uma asserção. `fonts.googleapis.com` servia a folha
      e `fonts.gstatic.com` servia os arquivos; nenhum dos dois pode voltar —
      nem como `<link>`, nem como `preconnect`, nem dentro de um `@import` do
      CSS, que é por onde ela voltaria sem ninguém reparar.
    */
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
    expect(fontsCss).not.toContain('https://');
  });

  it('declares a @font-face for every web family the tokens name', () => {
    // SENTIDO 1. Sem ele, perder a Fraunces do `@font-face` deixaria
    // `font-reading` compilando e o navegador caindo no Georgia — sem erro,
    // sem aviso, sem vermelho.
    const webFamilies = tokenFamilies().filter(
      (name) => !SYSTEM_FAMILIES.has(name.toLowerCase()),
    );
    const declared = fontFaces().map((face) => face.family.toLowerCase());

    // Sem isto o `for` é asserção vazia (§7.4): um `theme.css` sem
    // `--family-*` nenhum não rodaria uma iteração.
    expect(webFamilies.length).toBeGreaterThan(0);

    for (const family of webFamilies) {
      expect(declared).toContain(family.toLowerCase());
    }
  });

  it('names in a --family-* token every family it loads', () => {
    // SENTIDO 2. Sem ele, um `@font-face` órfão seria baixado por todo mundo e
    // usado por ninguém — e o precache pagaria por ele para sempre.
    const named = tokenFamilies().map((name) => name.toLowerCase());
    const faces = fontFaces();

    expect(faces.length).toBeGreaterThan(0);

    for (const face of faces) {
      expect(named).toContain(face.family.toLowerCase());
    }
  });

  it('⚠️ points every @font-face at a file that EXISTS on disk', () => {
    /*
      A terceira ponta, e a que nenhuma guarda tinha. Um `url()` quebrado não
      dá erro de build, não dá erro de console que alguém veja, e não muda um
      teste de renderização: o navegador tenta, falha e usa o fallback. O
      sintoma é "a fonte está esquisita", que ninguém reporta como bug.
    */
    const faces = fontFaces();
    expect(faces.length).toBeGreaterThan(0);

    const missing = faces
      .map((face) => face.url)
      .filter(
        (url) => !existsSync(resolve(publicRoot, url.replace(/^\//u, ''))),
      )
      .map((url) => `${url} não existe em public/`);

    expect(missing).toEqual([]);
  });

  it('swaps instead of hiding the text while the font loads', () => {
    // `font-display: swap`: sem ele o navegador esconde o texto por até 3 s.
    // Num app de leitura, esse é o pior default possível. Vale para TODOS os
    // blocos — um sem `swap` é uma família que some na abertura.
    const faces = [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/gu)];
    expect(faces.length).toBeGreaterThan(0);

    for (const [, body] of faces) {
      expect(body).toContain('font-display: swap');
    }
  });

  it('keeps latin-ext behind a unicode-range, so nobody downloads it for nothing', () => {
    // Sem `unicode-range` o navegador baixa TODOS os arquivos. Com ele, o
    // português comum se resolve com os `latin` e o `latin-ext` só desce
    // quando a página tem um caractere dele.
    const faces = [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/gu)];

    for (const [, body] of faces) {
      expect(body).toContain('unicode-range:');
    }
  });
});
/**
 * A COR DA BARRA DO NAVEGADOR ESPELHA O FUNDO DA PÁGINA (decisão J).
 *
 * O companheiro deste teste é `theme-css.test.ts`, que prende o
 * `background_color` do manifest ao mesmo valor. Os dois existem porque o dia
 * em que o espelhamento quebra é invisível: a `meta` só aparece na barra do
 * navegador no celular, e uma cor velha ali é uma faixa da cor errada em cima
 * do app — que ninguém reporta como bug.
 *
 * ⚠️ Até a Tarefa 38 a `meta` dizia `#1c1a17`, que era o valor claro do token
 * de TEXTO. Ou seja: ela já estava espelhando a coisa errada, e nada acusava.
 */
describe('a meta theme-color e o fundo da página', () => {
  it('mirrors the light value of --bg', () => {
    const themeCss = readFileSync(
      resolve(process.cwd(), '..', 'ui', 'src', 'theme.css'),
      'utf8',
    );
    const pageBackground = /--bg:\s*light-dark\(\s*(#[0-9a-f]{6})/iu.exec(
      themeCss,
    )?.[1];
    const meta = /<meta\s+name="theme-color"\s+content="(#[0-9a-f]{6})"/iu.exec(
      html,
    )?.[1];

    // Sem isto a comparação abaixo seria `undefined === undefined` (§7.4).
    expect(pageBackground).toBeDefined();
    expect(meta?.toLowerCase()).toBe(pageBackground?.toLowerCase());
  });
});
