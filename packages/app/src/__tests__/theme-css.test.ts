import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { THEME_ATTRIBUTE } from '../theme';

/**
 * REGRAS 3 e 4 da Tarefa 13 — e as regras 25/26 da Tarefa 12, que continuam
 * morando no CSS.
 *
 * ⚠️ ESTE ARQUIVO FOI REESCRITO NA TAREFA 13, e o motivo é o próprio §7.1.
 *
 * A Tarefa 12 escrevia cada cor escura DUAS vezes — um bloco
 * `@media (prefers-color-scheme: dark)` e um bloco `:root[data-theme='dark']`
 * — e a sincronia entre os dois estava afirmada num comentário ("mudou um,
 * mude o outro"). O teste antigo daqui era a rede: comparava os dois blocos
 * token por token. Rede é melhor que nada, mas continua sendo rede.
 *
 * A Tarefa 13 ELIMINOU a segunda cópia com `light-dark()`: um valor por token,
 * e a escolha explícita passou a trocar uma declaração só (`color-scheme`).
 * Com a duplicação, o teste antigo perdeu o objeto — não há dois blocos para
 * comparar. O que este arquivo prova agora é a propriedade que substituiu a
 * sincronia:
 *
 *   1. TODO token de cor usa `light-dark()` (o que torna a dessincronia
 *      impossível por construção, não por vigilância);
 *   2. as exceções são as declaradas, e nada além;
 *   3. os dois `[data-theme]` trocam SÓ o `color-scheme` — se algum voltar a
 *      declarar cor, a duplicação voltou;
 *   4. o `color-scheme` acompanha o tema (regra 4), e é declarado em três
 *      lugares e SÓ neles (a armadilha do `light-dark()`).
 *
 * O teste mora aqui, e não em `@clube/ui`, porque é o app que conhece
 * `THEME_ATTRIBUTE`: o valor tem de ser o MESMO dos dois lados, e é esse elo
 * que um seletor renomeado quebra. Molde: `index-html.test.ts`.
 */
// `process.cwd()` e não `import.meta.url`: no ambiente jsdom do Vitest o
// módulo não tem URL de arquivo, e o `fileURLToPath` estoura.
const uiSourceRoot = resolve(process.cwd(), '..', 'ui', 'src');
const themeCssPath = join(uiSourceRoot, 'theme.css');
const appCssPath = resolve(process.cwd(), 'src', 'styles.css');

/**
 * Comentário não é código — e aqui isso decide o teste: o cabeçalho do
 * `theme.css` EXPLICA a cascata citando `light-dark()`, `color-scheme` e os
 * dois `[data-theme]` em prosa. Sem remover os comentários, um `toContain`
 * passaria verde lendo a documentação de um mecanismo que não existe mais.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, ' ');
}

const themeCss = stripComments(readFileSync(themeCssPath, 'utf8'));

/**
 * O `vite.config.ts` — porque o `background_color` do manifest do PWA é o
 * MESMO valor claro do `--clube-bg`, e até agora esse espelhamento existia só
 * numa frase de comentário ("Espelhado no `background_color` do manifest").
 *
 * §7.1: garantia afirmada em comentário não é garantia. E o dia em que o
 * espelhamento quebra é invisível: o manifest só aparece na tela de splash de
 * quem instalou o PWA, então um fundo velho ali é um flash da cor errada na
 * abertura, que ninguém reporta como bug.
 */
const viteConfig = readFileSync(
  resolve(process.cwd(), 'vite.config.ts'),
  'utf8',
);

/**
 * O lado CLARO de um `light-dark(claro, escuro)` do `theme.css`.
 *
 * ⚠️ A expressão é montada com `\\s` e `\\(`, e não `\s`/`\(`: num template
 * literal o `\s` não é escape válido e o JavaScript o reduz a `s`, então a
 * expressão virava `--clube-bg:s*light-dark(s*...` — que estoura com
 * "Unterminated group" em vez de simplesmente não casar. Foi o que aconteceu na
 * primeira versão deste teste, e o erro é barulhento por sorte: se o `(` não
 * estivesse na expressão, ela compilaria e passaria a nunca casar nada, e o
 * `throw` do `lightSideOf` seria lido como "o token não existe".
 */
function lightSideOf(token: string): string {
  const match = new RegExp(
    `${token}:\\s*light-dark\\(\\s*(#[0-9a-f]{6})`,
    'i',
  ).exec(themeCss);
  if (!match?.[1]) {
    throw new Error(`nao achei o lado claro de ${token} no theme.css`);
  }
  return match[1];
}

const appCss = stripComments(readFileSync(appCssPath, 'utf8'));

const EXPLICIT_LIGHT = `:root[${THEME_ATTRIBUTE}='light']`;
const EXPLICIT_DARK = `:root[${THEME_ATTRIBUTE}='dark']`;

/** O corpo do bloco que vem logo depois do seletor, com chaves balanceadas. */
function blockAfter(source: string, selector: string): string {
  const at = source.indexOf(selector);
  if (at === -1) throw new Error(`o CSS não tem \`${selector}\``);

  const open = source.indexOf('{', at + selector.length);
  if (open === -1) throw new Error(`\`${selector}\` não abre bloco`);

  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`chaves desbalanceadas depois de \`${selector}\``);
}

/** `--clube-bg: light-dark(#a, #b);` → `{ '--clube-bg': 'light-dark(#a, #b)' }` */
function declarations(block: string): Record<string, string> {
  const pairs: Record<string, string> = {};

  // Split por `;` fora de parênteses: `light-dark(#a, #b)` não tem `;`, mas
  // um valor futuro pode ter função aninhada, e quebrar por `;` cru é frágil
  // só quando o valor contém `;` — que CSS não permite fora de string.
  for (const statement of block.split(';')) {
    const separator = statement.indexOf(':');
    if (separator === -1) continue;

    const property = statement.slice(0, separator).trim();
    const value = statement.slice(separator + 1).trim();
    if (property === '') continue;

    pairs[property] = value;
  }

  return pairs;
}

/** O bloco `:root` puro — não o `:root[data-theme=...]`. */
function rootBlock(): Record<string, string> {
  const match = /:root\s*\{/u.exec(themeCss);
  if (match === null) throw new Error('theme.css não tem um bloco `:root {`');
  return declarations(blockAfter(themeCss.slice(match.index), ':root'));
}

/**
 * As ÚNICAS exceções ao `light-dark()`, e a razão de cada uma.
 *
 * A lista é fechada de propósito: um token de cor novo que nasça sem
 * `light-dark()` não entra aqui por acidente — ele quebra o teste, e quem o
 * escreveu decide entre corrigir o token ou registrar a exceção com motivo.
 */
const TOKENS_WITHOUT_LIGHT_DARK: Record<string, string> = {
  '--clube-radius': 'raio não é cor e não muda com o tema',
  '--clube-radius-lg': 'raio não é cor e não muda com o tema',
};

describe('@clube/ui theme.css — a cascata do tema (rules 3 and 4)', () => {
  it('declares enough tokens to be the full palette', () => {
    // Sem isto tudo abaixo é asserção vazia (§7.4): um `theme.css` esvaziado,
    // ou um `blockAfter` quebrado, deixaria as varreduras verdes comparando
    // nada com nada — e a Tarefa 12 já tinha caído nessa forma.
    const tokens = Object.keys(rootBlock()).filter((property) =>
      property.startsWith('--clube-'),
    );

    expect(tokens.length).toBeGreaterThan(20);
  });

  it('gives every colour token ONE declaration, with both themes inside it (rule 3)', () => {
    const offenders = Object.entries(rootBlock())
      .filter(([property]) => property.startsWith('--clube-'))
      .filter(([property, value]) => {
        if (property in TOKENS_WITHOUT_LIGHT_DARK) return false;
        return !value.includes('light-dark(');
      })
      .map(([property]) => property);

    // É isto que substituiu o teste de sincronia da Tarefa 12: com os dois
    // valores na MESMA declaração, não existe segunda cópia para sair de
    // sincronia. Um token de cor sem `light-dark()` fica com a cor clara no
    // tema escuro — invisível para quem desenvolve de dia.
    expect(offenders).toEqual([]);
  });

  it('keeps the list of light-dark() exceptions closed, and only for non-colours (rule 3)', () => {
    const root = rootBlock();

    for (const [property] of Object.entries(TOKENS_WITHOUT_LIGHT_DARK)) {
      // A exceção tem de existir de verdade: uma lista com token que ninguém
      // declara mais é uma isenção pendurada, e ela isentaria um token futuro
      // de mesmo nome sem ninguém reparar.
      expect(root[property]).toBeDefined();
      expect(root[property]).not.toContain('light-dark(');
    }

    expect(Object.keys(TOKENS_WITHOUT_LIGHT_DARK)).toEqual([
      '--clube-radius',
      '--clube-radius-lg',
    ]);
  });

  it('no longer duplicates the palette in a prefers-color-scheme block (rule 3)', () => {
    // A Tarefa 12 tinha um `@media (prefers-color-scheme: dark)` AQUI com a
    // paleta escura repetida. Se ele voltar, a duplicação voltou — e o teste
    // que a vigiava não existe mais.
    expect(themeCss).not.toContain('prefers-color-scheme');
  });

  it('lets the system decide when nobody chose (rules 4, 25)', () => {
    // `light dark` é o que faz o `light-dark()` de TODOS os tokens seguir a
    // preferência do sistema na primeira visita, sem uma linha de JavaScript.
    // Trocar por `light` congela o app no tema claro para todo mundo.
    expect(rootBlock()['color-scheme']).toBe('light dark');
  });

  it('lets an explicit choice beat the system, in both directions (rules 4, 26)', () => {
    // Pino cruzado: `theme.ts` ESCREVE `THEME_ATTRIBUTE` e o CSS seleciona por
    // ele. Renomear de um lado só desliga o tema sem quebrar renderização
    // nenhuma — foi o mutante `[data-theme='mutante']` da Tarefa 12.
    expect(THEME_ATTRIBUTE).toBe('data-theme');

    expect(declarations(blockAfter(themeCss, EXPLICIT_LIGHT))).toEqual({
      'color-scheme': 'light',
    });
    expect(declarations(blockAfter(themeCss, EXPLICIT_DARK))).toEqual({
      'color-scheme': 'dark',
    });
  });

  it('declares color-scheme in exactly three places, and only in theme.css', () => {
    /*
      ⚠️ A ARMADILHA DO `light-dark()`, virada guarda.

      Ele resolve no ponto de USO, não no de declaração: um componente que
      declare `color-scheme` próprio (um cartão com `color-scheme: light` para
      forçar um `input date` claro, por exemplo) INVERTE todos os tokens
      `--clube-*` lidos dentro dele, inclusive os herdados. O sintoma é uma
      caixa de texto claro sobre fundo claro, no meio de uma tela escura.

      Os três lugares legítimos são o `:root` e os dois `[data-theme]`.
    */
    // Regex sem `g` no `.test()`: um literal global carrega `lastIndex` entre
    // chamadas e o segundo arquivo seria testado a partir do meio.
    expect(themeCss.match(/color-scheme\s*:/gu)).toHaveLength(3);

    const others = uiFiles(uiSourceRoot)
      .filter((path) => path !== themeCssPath)
      .filter((path) =>
        /color-scheme\s*:/u.test(stripComments(readFileSync(path, 'utf8'))),
      );

    expect(others).toEqual([]);
  });
});

/** Todo arquivo de `packages/ui/src` que pode conter CSS ou classe. */
function uiFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (entry === '__tests__') return [];

    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return uiFiles(path);
    return /\.(?:css|tsx?)$/u.test(entry) ? [path] : [];
  });
}

describe('the dark: utilities still obey data-theme', () => {
  it('keeps the @custom-variant, which light-dark() does NOT replace', () => {
    /*
      O `light-dark()` resolve TOKEN; ele não tem nada a ver com o `dark:` do
      Tailwind, que é media query + seletor. Sem este `@custom-variant`,
      `dark:bg-x` compila só para `@media (prefers-color-scheme: dark)` —
      medido na Tarefa 12 — e o app fica esquizofrênico: com sistema escuro e
      "Claro" escolhido, os tokens clareiam e todo `dark:*` continua escuro.

      É a única duplicação que SOBROU, e ela é de decisão, não de valor: as
      mesmas três situações do `theme.css`, escritas como seletor.
    */
    expect(appCss).toContain('@custom-variant dark');

    const variant = blockAfter(appCss, '@custom-variant dark');
    expect(variant).toContain('prefers-color-scheme: dark');
    // O `:not` é a metade que faz "escolhi Claro" vencer um sistema escuro.
    expect(variant).toContain(`:root:not([${THEME_ATTRIBUTE}='light'])`);
    // E o `[data-theme='dark']` é a que faz "escolhi Escuro" vencer um sistema
    // claro. Uma sem a outra deixa metade das combinações errada.
    expect(variant).toContain(EXPLICIT_DARK);
  });

  it('keeps @theme INLINE, so the token is read at use time', () => {
    // Com `@theme` puro o Tailwind copia o VALOR do token na compilação, e a
    // cor congela no que o `light-dark()` valia naquele instante — o tema para
    // de funcionar sem nenhum erro de build.
    expect(appCss).toContain('@theme inline');
    expect(/@theme\s+\{/u.test(appCss)).toBe(false);
  });
});

describe('o manifest do PWA e o token de fundo', () => {
  it('paints the splash screen with the very light value of --clube-bg', () => {
    const pageBackground = lightSideOf('--clube-bg');
    const manifest = /background_color:\s*'(#[0-9a-f]{6})'/i.exec(viteConfig);

    expect(manifest?.[1]?.toLowerCase()).toBe(pageBackground.toLowerCase());
  });
});
