import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * REGRA 2 — todo token tem utilitário, e todo utilitário tem token.
 *
 * A decisão está partida em dois arquivos por construção: os VALORES vivem em
 * `packages/ui/src/theme.css` (é lá que a paleta mora, e é de lá que o pacote
 * de componentes a exporta) e os NOMES DE UTILITÁRIO vivem no `@theme inline`
 * de `packages/app/src/styles.css` (é o app que compila o Tailwind). Nenhuma
 * das duas metades funciona sozinha, e as duas falham CALADAS:
 *
 * - token declarado sem utilitário mapeado não serve para nada — ninguém
 *   consegue usá-lo sem CSS inline, que o `CLAUDE.md` proíbe;
 * - utilitário apontando para token inexistente compila, gera a regra, e pinta
 *   `var(--clube-inexistente)` — que é vazio. O elemento fica transparente, e
 *   parece um problema de layout.
 *
 * Nenhuma asserção aqui diz qual COR é o quê — a spec proíbe teste de cor
 * exata, e com razão. O que se afirma é a correspondência.
 *
 * ⚠️ E, desde a rodada de correção, também a HIERARQUIA DE SUPERFÍCIE (o
 * primeiro `describe`): qual token pinta a PÁGINA. Mora aqui porque é este
 * arquivo que já sabe ler o mapeamento token ↔ utilitário nos dois arquivos —
 * a pergunta "o shell está pintando a cor de cartão?" só se responde com esse
 * mapeamento na mão.
 */
const themeCss = readFileSync(
  resolve(process.cwd(), '..', 'ui', 'src', 'theme.css'),
  'utf8',
);
const appCss = readFileSync(
  resolve(process.cwd(), 'src', 'styles.css'),
  'utf8',
);

/** Comentário não é código: os dois arquivos citam tokens em prosa (§7.1). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, ' ');
}

/** Todo `--clube-x` DECLARADO (`--clube-x:`), não os citados dentro de `var()`. */
function declaredTokens(): string[] {
  const found = new Set<string>();
  for (const match of stripComments(themeCss).matchAll(
    /(--clube-[a-z0-9-]+)\s*:/gu,
  )) {
    const token = match[1];
    if (token !== undefined) found.add(token);
  }
  return [...found].sort();
}

/**
 * O bloco `@theme inline` do app, e SÓ ele.
 *
 * O `body { background-color: var(--clube-bg) }` do fim do arquivo também cita
 * um token, e não é um mapeamento de utilitário — incluí-lo faria o token `bg`
 * "ter utilitário" mesmo sem ter.
 */
function themeInlineBlock(): string {
  const source = stripComments(appCss);
  const at = source.indexOf('@theme inline');
  if (at === -1) throw new Error('styles.css não tem `@theme inline`');

  const open = source.indexOf('{', at);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error('`@theme inline` com chaves desbalanceadas');
}

/** `--color-surface: var(--clube-surface);` → `['--color-surface','--clube-surface']` */
function mappings(): Array<{ utility: string; token: string }> {
  return [
    ...themeInlineBlock().matchAll(
      /(--[a-z0-9-]+)\s*:\s*var\(\s*(--clube-[a-z0-9-]+)\s*\)/gu,
    ),
  ].flatMap((match) => {
    const utility = match[1];
    const token = match[2];
    return utility === undefined || token === undefined
      ? []
      : [{ utility, token }];
  });
}

/** O token que um utilitário de cor (`bg-canvas` → `--color-canvas`) resolve. */
function tokenOfColorUtility(name: string): string | undefined {
  return mappings().find(({ utility }) => utility === `--color-${name}`)?.token;
}

/**
 * O `light` e o `dark` de um token, do `light-dark()` que o declara.
 *
 * Molde: `packages/ui/src/__tests__/avatar-contrast.test.ts`. Aqui não se mede
 * contraste — só se compara se os dois lados da hierarquia são valores
 * DIFERENTES, que é o que faz a hierarquia existir.
 */
function lightDarkPair(token: string): { light: string; dark: string } {
  const pattern = new RegExp(
    `${token}:\\s*light-dark\\(\\s*(#[0-9a-f]{3,8})\\s*,\\s*(#[0-9a-f]{3,8})\\s*\\)`,
    'iu',
  );
  const match = pattern.exec(stripComments(themeCss));
  const light = match?.[1];
  const dark = match?.[2];
  if (light === undefined || dark === undefined) {
    throw new Error(`theme.css não declara ${token} como light-dark(#a, #b)`);
  }
  return { light, dark };
}

/**
 * O SHELL — o elemento de altura de viewport inteira do `App.tsx`, que é o que
 * pinta o fundo da PÁGINA.
 *
 * Ele é achado pelo `min-h-dvh`, e não por posição no markup: é essa classe
 * que faz dele a página, e é ela que continua verdadeira quando a Tarefa 15
 * mexer no header.
 */
function shellClasses(): string[] {
  const source = readFileSync(
    resolve(process.cwd(), 'src', 'App.tsx'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//gu, ' ');

  const literal = [...source.matchAll(/'([^'\n]*)'|"([^"\n]*)"/gu)]
    .map((match) => match[1] ?? match[2] ?? '')
    .find((candidate) => candidate.split(/\s+/u).includes('min-h-dvh'));

  if (literal === undefined) {
    throw new Error(
      'App.tsx não tem um elemento `min-h-dvh` — quem é a página?',
    );
  }

  return literal.split(/\s+/u).filter((token) => token !== '');
}

/**
 * A HIERARQUIA DE SUPERFÍCIE — a regra que não tinha acusador nenhum.
 *
 * ⚠️ MEDIDO em navegador na rodada de correção da Tarefa 13: o shell do
 * `App.tsx` pintava `bg-surface`, que é a cor de CARTÃO. Consequência real, não
 * teórica: todo `bg-surface` e todo `hover:bg-surface` dos componentes desta
 * fatia (o `FilterChip` não pressionado, o hover do `ListItem`, o hover do
 * botão de fechar do `Sheet`) passava a pintar EXATAMENTE a cor da página —
 * contraste de 1.0000:1 nos dois temas. O hover do item de lista é o único
 * retorno visual de "dá para tocar aqui", e ele havia desaparecido.
 *
 * E havia duas pinturas de página em disputa: o `body { background-color:
 * var(--clube-bg) }` do `styles.css` virava tinta morta, porque o div ganha.
 *
 * Estes quatro testes são o que faltava: trocar `bg-canvas` por `bg-surface` no
 * shell não era acusado por NADA — nem pelos 66 testes do app, nem pelos 89 do
 * `ui`. Com eles, o mutante é acusado por dois.
 *
 * ⚠️ E `bg-canvas` NÃO EXISTIA no CSS compilado antes desta correção (medido:
 * zero ocorrências no `dist/assets/*.css`), porque ninguém o usava. Usá-lo no
 * shell é o que o emite — e é o `ui-source-scan.test.ts` que confere isso.
 */
describe('the page background (surface hierarchy)', () => {
  it('paints the shell with exactly one background utility', () => {
    // Sem isto as duas asserções abaixo são asserção vazia (§7.4): um shell
    // sem `bg-*` nenhum deixaria `shellBackground` indefinido e o `not.toBe`
    // passaria comparando `undefined` com um token.
    const backgrounds = shellClasses().filter((token) =>
      token.startsWith('bg-'),
    );
    expect(backgrounds).toHaveLength(1);
  });

  it('paints the shell with the same token the body paints', () => {
    const utility = shellClasses()
      .filter((token) => token.startsWith('bg-'))
      .map((token) => token.slice('bg-'.length))[0];

    // O `body` do `styles.css` é a outra fonte de fundo de página. Se as duas
    // discordarem, a de cima ganha e a de baixo é tinta morta — e quem for
    // trocar a cor da página vai editar a que não vale.
    const bodyToken =
      /body\s*\{[^}]*background-color:\s*var\(\s*(--clube-[a-z0-9-]+)\s*\)/u.exec(
        stripComments(appCss),
      )?.[1];

    expect(bodyToken).toBeDefined();
    expect(tokenOfColorUtility(utility ?? '')).toBe(bodyToken);
  });

  it('does not paint the page with the card colour', () => {
    const utility = shellClasses()
      .filter((token) => token.startsWith('bg-'))
      .map((token) => token.slice('bg-'.length))[0];

    // O mutante que esta linha acusa: `bg-canvas` → `bg-surface` no shell.
    expect(tokenOfColorUtility(utility ?? '')).not.toBe(
      tokenOfColorUtility('surface'),
    );
  });

  it('keeps page, card and raised card as three different colours', () => {
    // A hierarquia tem de EXISTIR nos valores, senão o utilitário certo pinta
    // a cor errada e o teste acima fica verde provando um nome. Não é teste de
    // cor exata (a spec proíbe): nenhuma asserção diz qual cor é qual.
    for (const theme of ['light', 'dark'] as const) {
      const page = lightDarkPair('--clube-bg')[theme];
      const card = lightDarkPair('--clube-surface')[theme];
      const raised = lightDarkPair('--clube-surface-raised')[theme];

      expect(new Set([page, card, raised]).size).toBe(3);
    }
  });
});

describe('the palette tokens and their utilities (rule 2)', () => {
  it('reads a palette and a mapping to compare', () => {
    // Sem isto as duas direções abaixo são asserção vazia (§7.4): dois
    // conjuntos vazios são iguais, e um caminho errado ou um `matchAll` sem
    // captura deixaria a suíte verde sem comparar nada.
    expect(declaredTokens().length).toBeGreaterThan(20);
    expect(mappings().length).toBeGreaterThan(20);
  });

  it('maps every declared token to a utility', () => {
    const mapped = new Set(mappings().map(({ token }) => token));
    const orphans = declaredTokens().filter((token) => !mapped.has(token));

    // Token sem utilitário é token que ninguém consegue usar — a tela teria de
    // escrever `style={{ color: 'var(--clube-x)' }}`, que é o CSS inline que o
    // `CLAUDE.md` proíbe.
    expect(orphans).toEqual([]);
  });

  it('points every utility at a token that exists', () => {
    const declared = new Set(declaredTokens());
    const dangling = mappings()
      .filter(({ token }) => !declared.has(token))
      .map(({ token, utility }) => `${utility} → ${token}`);

    // `var(--clube-inexistente)` compila, gera a regra e pinta VAZIO. O
    // elemento fica transparente e parece bug de layout — o pior sintoma
    // possível, porque manda procurar no lugar errado.
    expect(dangling).toEqual([]);
  });

  it('gives each token exactly one utility, and each utility one token', () => {
    const all = mappings();

    // Dois utilitários para o mesmo token é ambiguidade que a Tarefa 15 herda:
    // duas telas usam nomes diferentes para a mesma cor e ninguém sabe qual é
    // o certo. Dois tokens para o mesmo utilitário é pior — o segundo vence em
    // silêncio, e o primeiro token fica órfão sem o teste acima acusar.
    expect(new Set(all.map(({ token }) => token)).size).toBe(all.length);
    expect(new Set(all.map(({ utility }) => utility)).size).toBe(all.length);
  });

  it('keeps the utilities inside the namespaces Tailwind understands', () => {
    const wrong = mappings()
      .filter(({ utility }) => !/^--(?:color|radius|shadow)-/u.test(utility))
      .map(({ utility }) => utility);

    // No Tailwind v4 é o PREFIXO que decide qual família de utilitário nasce:
    // `--color-*` → `bg-*`/`text-*`/`border-*`, `--radius-*` → `rounded-*`,
    // `--shadow-*` → `shadow-*`. Um `--surface-raised: var(...)` é declaração
    // válida de CSS que não gera utilitário NENHUM, e a classe que a tela
    // escrever simplesmente não existirá.
    expect(wrong).toEqual([]);
  });
});
