import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
 *   `var(--inexistente)` — que é vazio. O elemento fica transparente, e
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

/**
 * Todo token DECLARADO (`--x:`) no `theme.css`, não os citados dentro de
 * `var()`.
 *
 * ⚠️ O DISCRIMINADOR É `--`, E NÃO MAIS `--clube-` (Tarefa 39, decisão B). O
 * prefixo morreu com os nomes do canvas, e a guarda ficou MAIS forte: antes,
 * um token escrito sem o prefixo escapava desta varredura em silêncio. Sem
 * prefixo nenhum, não existe token que escape.
 */
function declaredTokens(): string[] {
  const found = new Set<string>();
  for (const match of stripComments(themeCss).matchAll(
    /(--[a-z0-9-]+)\s*:/gu,
  )) {
    const token = match[1];
    if (token !== undefined) found.add(token);
  }
  return [...found].sort();
}

/**
 * O bloco `@theme inline` do app, e SÓ ele.
 *
 * O `body { background-color: var(--bg) }` do fim do arquivo também cita
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

/** `--color-surface: var(--surface);` → `['--color-surface','--surface']` */
function mappings(): Array<{ utility: string; token: string }> {
  return [
    ...themeInlineBlock().matchAll(
      /(--[a-z0-9-]+)\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/gu,
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
 * UMA FONTE A VARRER: caminho + texto.
 *
 * O texto vem por PARÂMETRO, e não de dentro da função que varre, por um
 * motivo só: é o que permite o par positivo alimentar fontes inventadas. Uma
 * varredura que só sabe ler o disco não tem como provar que MORDE, porque no
 * disco a resposta certa é sempre `[]`.
 */
interface Source {
  path: string;
  text: string;
}

/** Comentário não é uso: `// um dia usar text-faint` não pinta nada (§7.1). */
function stripAllComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

/** Todo `.ts`/`.tsx` de produção de um pacote — `__tests__/` não embarca. */
function sourcesUnder(root: string): Source[] {
  return readdirSync(root).flatMap((entry) => {
    if (entry === '__tests__') return [];

    const full = join(root, entry);
    if (statSync(full).isDirectory()) return sourcesUnder(full);
    return /\.tsx?$/u.test(entry)
      ? [{ path: full, text: readFileSync(full, 'utf8') }]
      : [];
  });
}

/** As telas e os componentes — os dois lugares que escrevem classe. */
function appAndUiSources(): Source[] {
  return [
    ...sourcesUnder(resolve(process.cwd(), 'src')),
    ...sourcesUnder(resolve(process.cwd(), '..', 'ui', 'src')),
  ];
}

/**
 * Os arquivos que USAM um utilitário do Tailwind.
 *
 * ⚠️ O `(?<![\w-])` não é zelo: sem ele, a DECLARAÇÃO do token (`--text-faint`)
 * casaria com o utilitário `text-faint`, e a varredura acusaria o `theme.css`
 * de usar o que ele apenas declara. O `(?![\w-])` do outro lado separa
 * `text-faint` de `text-faintish`. Variante (`hover:`, `md:`) é PREFIXO, então
 * ela casa de propósito: `hover:text-faint` pinta o mesmo cinza.
 */
function usagesOf(sources: Source[], utility: string): string[] {
  const pattern = new RegExp(`(?<![\\w-])${utility}(?![\\w-])`, 'u');
  return sources
    .filter((source) => pattern.test(stripAllComments(source.text)))
    .map((source) => source.path);
}

/**
 * Luminância relativa da WCAG. Mora aqui porque as duas guardas abaixo — a
 * orientação claro/escuro e o contraste do par vermelho — precisam comparar
 * cores, e comparar cor por STRING é o que este projeto já pagou quatro vezes
 * para não fazer mais: a guarda tem de medir a propriedade.
 */
function relativeLuminance(hex: string): number {
  const channel = (start: number): number => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
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
 * var(--bg) }` do `styles.css` virava tinta morta, porque o div ganha.
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
      /body\s*\{[^}]*background-color:\s*var\(\s*(--[a-z0-9-]+)\s*\)/u.exec(
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
      const page = lightDarkPair('--bg')[theme];
      const card = lightDarkPair('--surface')[theme];
      const raised = lightDarkPair('--surface-2')[theme];

      expect(new Set([page, card, raised]).size).toBe(3);
    }
  });
});

describe('the palette tokens and their utilities (rule 2)', () => {
  it('reads a palette and a mapping to compare', () => {
    // Sem isto as duas direções abaixo são asserção vazia (§7.4): dois
    // conjuntos vazios são iguais, e um caminho errado ou um `matchAll` sem
    // captura deixaria a suíte verde sem comparar nada.
    expect(declaredTokens().length).toBeGreaterThan(40);
    expect(mappings().length).toBeGreaterThan(40);
  });

  it('maps every declared token to a utility', () => {
    const mapped = new Set(mappings().map(({ token }) => token));
    const orphans = declaredTokens().filter((token) => !mapped.has(token));

    // Token sem utilitário é token que ninguém consegue usar — a tela teria de
    // escrever `style={{ color: 'var(--x)' }}`, que é o CSS inline que o
    // `CLAUDE.md` proíbe.
    expect(orphans).toEqual([]);
  });

  it('points every utility at a token that exists', () => {
    const declared = new Set(declaredTokens());
    const dangling = mappings()
      .filter(({ token }) => !declared.has(token))
      .map(({ token, utility }) => `${utility} → ${token}`);

    // `var(--inexistente)` compila, gera a regra e pinta VAZIO. O
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
      .filter(
        ({ utility }) =>
          !/^--(?:color|radius|shadow|font|text)-/u.test(utility),
      )
      .map(({ utility }) => utility);

    // No Tailwind v4 é o PREFIXO que decide qual família de utilitário nasce:
    // `--color-*` → `bg-*`/`text-*`/`border-*`, `--radius-*` → `rounded-*`,
    // `--shadow-*` → `shadow-*`, `--font-*` → `font-*`, `--text-*` → `text-*`
    // (o corpo, não a cor). Um `--surface-raised: var(...)` é declaração
    // válida de CSS que não gera utilitário NENHUM, e a classe que a tela
    // escrever simplesmente não existirá.
    expect(wrong).toEqual([]);
  });
});

/**
 * A TIPOGRAFIA DA INTERFACE — a única linha desta fatia que troca a fonte das
 * 15 telas.
 *
 * ⚠️ MEDIDO na auditoria da Tarefa 39: apagar `font-family: var(--family-ui)`
 * do `body` do `styles.css` não era acusado por NADA. As 15 telas voltavam à
 * fonte do sistema, o app continuava pagando o download de quatro famílias, e
 * o objetivo declarado da fatia ("trocar a tipografia de todas as telas sem
 * tocar uma linha de JSX") desaparecia em silêncio.
 *
 * A guarda mede a PROPRIEDADE e não a string: o que ela exige é que o `body`
 * seja pintado pelo MESMO token que o utilitário `font-ui` resolve. Renomear o
 * token nos dois lugares continua passando; apagar a linha, ou apontá-la para
 * outra família, não.
 */
describe('the interface typeface (Tarefa 39)', () => {
  it('dresses the whole interface from the body, with the UI family token', () => {
    const bodyFamily =
      /body\s*\{[^}]*font-family:\s*var\(\s*(--[a-z0-9-]+)\s*\)/u.exec(
        stripComments(appCss),
      )?.[1];
    const uiFamily = mappings().find(
      ({ utility }) => utility === '--font-ui',
    )?.token;

    // Sem isto a comparação seria `undefined === undefined` (§7.4) — e é
    // exatamente o que o mutante produz.
    expect(uiFamily).toBeDefined();
    expect(bodyFamily).toBeDefined();
    expect(bodyFamily).toBe(uiFamily);
  });
});

/**
 * O ANEL DE FOCO — decisão do dono de 2026-09-20, o §A.6 LITERAL.
 *
 * Os critérios de aceite "válidos para toda fase" do `docs/new-ui.md` pedem
 * duas coisas na MESMA frase: "`outline` nunca removido" **e** "anel de 3px
 * `color-mix(in oklch, var(--accent) 18%, transparent)`". Elas não são
 * alternativas, e tratá-las como alternativa foi o erro da primeira entrega.
 *
 * ⚠️ MEDIDO antes da decisão: o halo de 18% SOZINHO dá ~1,4:1 contra o creme —
 * ele não é visível por si. Ele é halo **sobre** um contorno sólido, e é só com
 * os dois que a frase fecha. Entregar só o `color-mix()` seria entregar um foco
 * que não se vê, com a guarda verde.
 *
 * O que estas asserções prendem:
 *
 *  1. o anel segue a COR DE AÇÃO (`--accent`), não uma entrada de paleta —
 *    até 2026-09-19 ele era `--gold` fixo, que no claro dá 4,16:1 contra a
 *    página; `--accent` dá 11,91:1;
 *  2. o halo é DERIVADO de `--accent` por `color-mix()`, nunca um hex — é a
 *    mesma razão do `--accent-soft`: duplicar a cor de ação é a dessincronia
 *    que o cabeçalho do `theme.css` existe para ter eliminado;
 *  3. o contorno é visível de verdade (3:1 de componente não textual) nas três
 *    superfícies e nos dois temas.
 */
describe('o anel de foco (decisão do dono, 2026-09-20)', () => {
  /** O valor cru de um token do `:root`, sem passar por `light-dark()`. */
  function rawValue(token: string): string | undefined {
    return new RegExp(`${token}:\\s*([^;]+);`, 'u').exec(
      stripComments(themeCss),
    )?.[1];
  }

  it('points the ring at the ACTION colour, not at a palette entry', () => {
    // Propriedade, não string: o que se exige é que o anel e a ação sejam o
    // MESMO token. Trocar o verde do clube continua passando; prender o anel a
    // uma cor própria, não.
    const ring = rawValue('--ring');

    expect(ring).toBeDefined();
    expect(ring).toContain('var(--accent)');
    expect(ring).not.toContain('var(--gold)');
  });

  it('derives the halo from --accent with color-mix, never from a hex', () => {
    /*
      ⚠️ O MUTANTE QUE ESTA LINHA EXISTE PARA PEGAR: trocar o `color-mix()` por
      o hex que ele resolve hoje. O app continua pintando igual, a bijeção
      continua fechando, o contraste continua o mesmo — e no dia em que alguém
      trocar `--accent`, o halo fica da cor antiga, sozinho, sem nada acusar.
    */
    const halo = rawValue('--ring-halo');

    expect(halo).toBeDefined();
    expect(halo).toContain('color-mix(');
    expect(halo).toContain('var(--accent)');
    // Um hex aqui é a cor de ação duplicada — exatamente o que o `--accent-soft`
    // evita, e pela mesma razão.
    expect(halo).not.toMatch(/#[0-9a-f]{3,8}/iu);
  });

  it('keeps the solid ring VISIBLE on the three surfaces, in both themes', () => {
    // 3:1 é o piso de componente não textual. O anel é o único retorno de "o
    // teclado está aqui", e um anel que não se vê é o mesmo que não ter anel.
    const accent = lightDarkPair('--accent');

    for (const surface of ['--bg', '--surface', '--surface-2'] as const) {
      const paper = lightDarkPair(surface);
      for (const theme of ['light', 'dark'] as const) {
        expect(
          contrastRatio(accent[theme], paper[theme]),
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

/**
 * OS CINZAS DE LEGENDA — decisão do dono de 2026-09-20.
 *
 * `docs/new-ui.md` diz, nos critérios de aceite: "Contraste conferido no claro
 * e no escuro. **Os pontos de risco são os cinzas de legenda** e os fundos de
 * grifo." Eram, e agora têm acusador.
 *
 * ⚠️ O `--text-subtle` foi ESCURECIDO no claro e CLAREADO no escuro até fechar
 * 4,5:1 contra as TRÊS superfícies. Medido antes e depois:
 *
 * | lado   | antes     | depois    | antes (bg/surface/s-2) | depois           |
 * |--------|-----------|-----------|------------------------|------------------|
 * | claro  | `#74786e` | `#686c63` | 4,00 / 4,15 / 3,82     | 4,76/4,93/4,54   |
 * | escuro | `#86847f` | `#95938e` | 4,76 / 4,41 / 3,96     | 5,79/5,37/4,82   |
 *
 * ⚠️ NO TEMA ESCURO, "fechar contraste" é CLAREAR, não escurecer — a tinta está
 * sobre papel escuro. Escurecer o lado escuro, que é o que a leitura apressada
 * da decisão sugere, teria PIORADO os três números.
 */
describe('os cinzas de legenda (decisão do dono, 2026-09-20)', () => {
  const SURFACES = ['--bg', '--surface', '--surface-2'] as const;

  /** O menor contraste de um token de texto contra as três superfícies. */
  function worstContrast(token: string, theme: 'light' | 'dark'): number {
    const ink = lightDarkPair(token)[theme];
    return Math.min(
      ...SURFACES.map((surface) =>
        contrastRatio(ink, lightDarkPair(surface)[theme]),
      ),
    );
  }

  it('gives --text-subtle 4.5:1 on every surface, in both themes', () => {
    // É o token do placeholder e da dica de campo (`form-styles.ts`,
    // `field.tsx`, `highlight-fields.tsx`) — texto de verdade, que alguém
    // precisa ler para saber o que digitar. Piso de texto, não de componente.
    for (const theme of ['light', 'dark'] as const) {
      expect(worstContrast('--text-subtle', theme)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('refuses the FIRST USE of text-faint while it fails contrast', () => {
    /*
      ⚠️ A GUARDA QUE O DONO PEDIU JUNTO COM A ISENÇÃO (2026-09-20).

      `--text-faint` fica com o valor do canvas e NÃO passa: 2,45:1 no claro,
      2,58:1 no escuro, contra 4,5:1 de piso. O dono aceitou por um motivo
      verificável — **ninguém usa `text-faint` hoje**. Um token que nenhuma
      tela pinta não reprova ninguém.

      Mas "ninguém usa" é um fato do presente, e um fato do presente sem guarda
      é uma bomba-relógio: a primeira tela que escrever `text-faint` embarca um
      cinza de 2,45:1 sem uma linha vermelha em lugar nenhum.

      ⚠️ QUANDO ESTE TESTE FICAR VERMELHO, A SAÍDA É ESCURECER O TOKEN — não
      apagar a guarda, não pôr o arquivo numa lista de exceções, não trocar o
      4.5 por 2.4. O valor do canvas vale enquanto ninguém o usa; no momento em
      que alguém usa, quem manda é o critério de aceite do `docs/new-ui.md`
      ("contraste conferido no claro e no escuro; os pontos de risco são os
      cinzas de legenda"). Se o dono quiser o cinza claro mesmo assim, isso é
      uma decisão nova, e ela se registra aqui — não se contorna.

      A guarda se aposenta sozinha no dia em que o token passar: com os dois
      temas acima de 4,5:1, `failing` fica vazio e o uso está liberado.
    */
    const failing = (['light', 'dark'] as const).filter(
      (theme) => worstContrast('--text-faint', theme) < 4.5,
    );
    const users = usagesOf(appAndUiSources(), 'text-faint');

    const problems =
      users.length === 0
        ? []
        : failing.map(
            (theme) =>
              `text-faint é usado (${users.join(', ')}) e reprova no tema ${theme}`,
          );

    expect(problems).toEqual([]);
  });

  it('proves the usage scan actually reads the screens (par positivo)', () => {
    // Duas asserções, e as duas são o §7.4: a varredura acima só significa
    // alguma coisa se ela (a) enxerga arquivo de verdade e (b) sabe ACHAR um
    // utilitário quando ele está lá. `text-subtle` está — é o placeholder de
    // todo campo do app.
    const sources = appAndUiSources();

    expect(sources.length).toBeGreaterThan(20);
    expect(usagesOf(sources, 'text-subtle').length).toBeGreaterThan(0);
  });

  it('spots text-faint in every shape a screen could write it', () => {
    /*
      O PAR POSITIVO SINTÉTICO. A varredura real acima devolve `[]` hoje, e uma
      varredura que devolve `[]` por estar quebrada é indistinguível de uma que
      devolve `[]` por estar certa — foi assim que a lista fechada de isenções
      virou esconderijo na rodada passada.

      Aqui o `usagesOf` recebe fontes INVENTADAS, então o par positivo não
      depende de plantar nada no repositório.
    */
    const plantadas = [
      { path: 'a.tsx', text: '<span className="text-sm text-faint">oi</span>' },
      { path: 'b.tsx', text: "cx('text-faint', outra)" },
      { path: 'c.tsx', text: '<p className="hover:text-faint" />' },
      { path: 'd.tsx', text: "const x = 'md:text-faint'" },
    ];

    for (const fonte of plantadas) {
      expect(usagesOf([fonte], 'text-faint')).toEqual([fonte.path]);
    }

    // E o par NEGATIVO, senão bastaria devolver tudo: a DECLARAÇÃO do token
    // (`--text-faint`) e um nome que só começa igual não são uso do utilitário.
    expect(
      usagesOf(
        [
          { path: 'e.css.ts', text: '--color-faint: var(--text-faint);' },
          { path: 'f.tsx', text: 'className="text-faintish"' },
          { path: 'g.tsx', text: '// um dia usar text-faint aqui' },
          { path: 'h.tsx', text: '/* text-faint fica para depois */' },
        ],
        'text-faint',
      ),
    ).toEqual([]);
  });

  it('⚠️ refuses the FIRST USE of text-gold, and says where to go instead', () => {
    /*
      ============================================================================
      A GUARDA QUE O DONO PEDIU NA AUDITORIA DA TAREFA 41b (2026-09-21)
      ============================================================================

      ⚠️ **`--gold` REPROVA COMO TEXTO, E O CANVAS O USA COMO TEXTO.** Medido
      pela fórmula de luminância relativa da WCAG 2.1 (3.2.2), contra as três
      superfícies:

      | tinta | tema | vs `--bg` | vs `--surface` | vs `--surface-2` |
      | --- | --- | --- | --- | --- |
      | `--gold` `#946d2c` | claro | **4,16** | **4,31** | **3,97** |
      | `--gold` `#c89a44` | escuro | 6,90 | 6,40 | 5,74 |
      | `--gold-strong` `#785822` | claro | 5,79 | 6,00 | 5,53 |
      | `--gold-strong` `#d6ae64` | escuro | 8,54 | 7,92 | 7,11 |

      O canvas pinta o rótulo de seção dourado com `var(--gold)` a **10px**
      (`Inicio.dc.html:50`, `NovaAnotacao.dc.html:46`, `NovoGrifo.dc.html:48`)
      — muito abaixo dos 24px que autorizariam o piso de 3:1. A Tarefa 41b
      entregou o `Eyebrow` com `--gold-strong`, que passa nas três; esta guarda
      é o que faltava para a próxima tela não repetir o defeito em silêncio.

      ⚠️⚠️ **E ELA NÃO PROÍBE O TOKEN — proíbe o USO TEXTUAL dele**, que é a
      diferença que o dono nomeou. Como traço de ícone e como filete, `--gold`
      é componente não textual: o piso é 3:1 e 3,97 passa com folga. É assim
      que o canvas o usa em `Inicio.dc.html:98` (`stroke="var(--gold)"`) e em
      `Inicio.dc.html:97` (`border:1px solid var(--gold-line)`).

      A distinção é ESTRUTURAL, e é por isso que ela é verificável por
      varredura de fonte: quem pinta traço escreve `stroke-gold` (que só afeta
      SVG) e quem pinta filete escreve `border-gold`. `text-gold` sobra
      exclusivamente para texto — e é só ele que esta guarda vê. O
      `StreakSeal` foi reescrito para `stroke-gold` na mesma rodada, justamente
      para que esta guarda pudesse nascer sem um falso positivo embutido.

      ⚠️ **QUANDO ESTE TESTE FICAR VERMELHO, A SAÍDA É `text-gold-strong`** —
      não apagar a guarda, não pôr o arquivo numa lista de exceções, não trocar
      o 4.5 por 3.9. `--gold-strong` não é uma cor inventada para tapar o
      buraco: é a tinta que o PRÓPRIO canvas usa quando o dourado precisa
      carregar texto (`Inicio.dc.html:99`, o número do selo de sequência;
      `Livro.dc.html:146`, a data do dia de hoje no sumário).

      Ela se aposenta sozinha no dia em que `--gold` passar 4,5:1 nos dois
      temas: `failing` fica vazio e o uso está liberado. Molde: a guarda irmã
      do `text-faint`, logo acima.
    */
    const failing = (['light', 'dark'] as const).filter(
      (theme) => worstContrast('--gold', theme) < 4.5,
    );
    const users = usagesOf(appAndUiSources(), 'text-gold');

    // Sem isto a guarda seria asserção vazia num cenário plausível: se um dia
    // `--gold` escurecesse, `failing` esvaziaria e ninguém notaria que o
    // motivo dela deixou de existir. Hoje ela morde — no tema claro.
    expect(failing).toEqual(['light']);

    const problems = users.map(
      (path) =>
        `${path} pinta TEXTO com text-gold (${failing.join(', ')}: reprova 4,5:1) — use text-gold-strong`,
    );

    expect(problems).toEqual([]);
  });

  it('spots text-gold as TEXT without accusing the stroke or the fillet', () => {
    /*
      O PAR POSITIVO, e ele tem de provar as DUAS metades — senão a guarda
      acima devolve `[]` hoje e ninguém sabe se é por estar certa ou por estar
      quebrada (§7.4, a classe que já fez uma lista fechada virar esconderijo).

      Metade 1: ela MORDE um `text-gold` de texto, em toda grafia que uma tela
      poderia escrever.
      Metade 2: ela NÃO morde `stroke-gold`, `border-gold`, `bg-gold` nem
      `text-gold-strong` — que é o que a torna uma guarda de USO e não uma
      proibição de token.
    */
    const mordem = [
      {
        path: 'a.tsx',
        text: '<span className="text-eyebrow text-gold">Hoje</span>',
      },
      { path: 'b.tsx', text: "cx('text-gold', outra)" },
      { path: 'c.tsx', text: '<p className="hover:text-gold" />' },
      { path: 'd.tsx', text: "const x = 'min-[1120px]:text-gold'" },
    ];
    for (const fonte of mordem) {
      expect(usagesOf([fonte], 'text-gold')).toEqual([fonte.path]);
    }

    expect(
      usagesOf(
        [
          // O traço do glifo e o filete: não textuais, piso de 3:1, liberados.
          { path: 'e.tsx', text: "const G = 'stroke-gold'" },
          {
            path: 'f.tsx',
            text: "cx('border border-gold-line hover:border-gold')",
          },
          { path: 'g.tsx', text: 'className="bg-gold-soft"' },
          // A saída que a guarda MANDA usar não pode ser acusada por ela.
          { path: 'h.tsx', text: "gold: 'text-gold-strong'," },
          // Declaração do token e prosa não são uso (§7.1).
          { path: 'i.css.ts', text: '--color-gold: var(--gold);' },
          { path: 'j.tsx', text: '// o canvas usa text-gold aqui, e reprova' },
          { path: 'k.tsx', text: '/* text-gold fica proibido como texto */' },
        ],
        'text-gold',
      ),
    ).toEqual([]);
  });

  it('keeps the three greys in order, so the hierarchy still exists', () => {
    // Escurecer um cinza até ele passar é fácil; escurecê-lo até ele virar o
    // vizinho é o jeito de "passar" destruindo a coisa. `muted` tem de seguir
    // mais forte que `subtle`, e `subtle` mais forte que `faint`.
    for (const theme of ['light', 'dark'] as const) {
      const muted = worstContrast('--text-muted', theme);
      const subtle = worstContrast('--text-subtle', theme);
      const faint = worstContrast('--text-faint', theme);

      expect(muted).toBeGreaterThan(subtle);
      expect(subtle).toBeGreaterThan(faint);
    }
  });
});

/**
 * A ORIENTAÇÃO CLARO/ESCURO DA PALETA.
 *
 * ⚠️ MEDIDO na auditoria da Tarefa 39: inverter os dois lados de `--text`
 * (`light-dark(#e8e4d6, #1a201a)`) não tinha UM acusador, e inverter `--danger`
 * — que deixa o botão destrutivo com 1,20:1 contra o próprio fundo — não tinha
 * acusador em 3.596 testes. A única ponta da paleta ancorada era o lado CLARO
 * de `--bg`, e por acidente: quem a ancorava era o `background_color` do
 * manifest.
 *
 * A guarda não diz qual cor é qual (a spec proíbe teste de cor exata). Ela diz
 * a PROPRIEDADE que faz um tema ser um tema: no claro a tinta é mais escura
 * que o papel, e no escuro é mais clara. Trocar o verde por um azul continua
 * passando; inverter os lados, não.
 */
describe('a orientação claro/escuro da paleta', () => {
  it('keeps the text darker than the page in light, and lighter in dark', () => {
    const page = lightDarkPair('--bg');
    const text = lightDarkPair('--text');

    expect(relativeLuminance(text.light)).toBeLessThan(
      relativeLuminance(page.light),
    );
    expect(relativeLuminance(text.dark)).toBeGreaterThan(
      relativeLuminance(page.dark),
    );
  });

  it('keeps the text LEGIBLE on the three surfaces, in both themes', () => {
    /*
      ⚠️ A ordem sozinha NÃO mata o mutante, e isso foi medido nesta rodada:
      com `--text: light-dark(#e8e4d6, #1a201a)` o texto claro AINDA é mais
      escuro que o papel claro (1,13:1) e o escuro ainda é mais claro que o
      papel escuro (1,07:1) — a orientação continua "certa" e o app fica
      ilegível. É a diferença entre a paleta apontar para o lado certo e ela
      funcionar.

      Os três fundos porque o texto cai nos três: a página, a folha e o que
      flutua. 4,5:1 é o piso de texto da regra 32; hoje o pior par é 11,6:1.
    */
    const text = lightDarkPair('--text');

    for (const surface of ['--bg', '--surface', '--surface-2'] as const) {
      const paper = lightDarkPair(surface);
      for (const theme of ['light', 'dark'] as const) {
        expect(contrastRatio(text[theme], paper[theme])).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });

  it('keeps the danger ink ON the danger paper, in both themes', () => {
    // `--danger` é a TINTA e `--danger-bg` é o PAPEL, e eles se invertem entre
    // os temas — é o que o `theme.css` diz em prosa desde esta fatia. Aqui
    // isso deixa de ser prosa.
    const ink = lightDarkPair('--danger');
    const paper = lightDarkPair('--danger-bg');

    expect(relativeLuminance(ink.light)).toBeLessThan(
      relativeLuminance(paper.light),
    );
    expect(relativeLuminance(ink.dark)).toBeGreaterThan(
      relativeLuminance(paper.dark),
    );

    // E orientado não basta: o par tem de ser LEGÍVEL (regra 32). O mutante da
    // auditoria dava 1,20:1 — orientação errada E contraste de papel em papel.
    for (const theme of ['light', 'dark'] as const) {
      expect(contrastRatio(ink[theme], paper[theme])).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
});

/**
 * ============================================================================
 * A FRONTEIRA DO CAMPO DE TEXTO — decisão do dono de 2026-09-24 (Tarefa 48)
 * ============================================================================
 *
 * WCAG 1.4.11 (contraste de não-texto) pede **3:1** para a fronteira de um
 * componente de interface. A nota 19 da Tarefa 47a mediu o filete padrão do app
 * contra a página e achou **1,35:1** no claro e **1,38:1** no escuro — e mediu
 * também que NENHUM token do projeto passava: o forte dá 2,37 / 1,88 e o suave
 * dá 1,21 / 1,20. Não era defeito de uma tela; era o estado da base.
 *
 * O dono decidiu que a borda de campo de texto ganha **tom próprio**,
 * escurecido (clareado, no escuro) até passar 3:1 nos dois temas. Medido com o
 * valor entregue, contra as seis superfícies em que um campo pode cair:
 *
 * | superfície        | claro | escuro |
 * | ----------------- | ----- | ------ |
 * | `--bg`            | 3,63  | 4,01   |
 * | `--surface`       | 3,76  | 3,72   |
 * | `--surface-2`     | 3,47  | 3,33   |
 * | `--surface-today` | 3,70  | 3,47   |
 * | `--gold-soft`     | 3,70  | 3,47   |
 * | `--danger-bg`     | 3,12  | 3,44   |
 *
 * ⚠️ **CARD E FILETE DECORATIVO NÃO MUDAM, e isso é decisão escrita.** O piso
 * de 3:1 é para **componente de interface**, não para moldura — e o desenho
 * "caderno encadernado" do canvas depende de filete discreto. O utilitário do
 * filete neutro segue pintando dezenas de lugares; quem troca de tom é só o
 * campo de texto.
 *
 * ⚠️ **NO TEMA ESCURO, FECHAR CONTRASTE É CLAREAR** — a mesma armadilha que o
 * `--text-subtle` documenta acima. O filete está sobre papel escuro.
 */
describe('a fronteira do campo de texto (decisão do dono, 2026-09-24)', () => {
  /**
   * As seis superfícies em que um campo de texto do app pode cair. As três
   * primeiras são as do cromo; as três últimas existem porque o canvas pinta
   * papel próprio no dia de hoje, no bloco dourado e na caixa de erro.
   */
  const FIELD_SURFACES = [
    '--bg',
    '--surface',
    '--surface-2',
    '--surface-today',
    '--gold-soft',
    '--danger-bg',
  ] as const;

  it('⚠️ gives the text field an edge of its OWN, at 3:1 on every surface, in both themes', () => {
    const edge = lightDarkPair('--border-field');

    for (const surface of FIELD_SURFACES) {
      const paper = lightDarkPair(surface);
      for (const theme of ['light', 'dark'] as const) {
        expect(contrastRatio(edge[theme], paper[theme])).toBeGreaterThanOrEqual(
          3,
        );
      }
    }
  });

  it('⚠️ and the twelve PUBLISHED numbers are the real ones, to the second decimal', () => {
    /*
      ⚠️⚠️ **ESTA ASSERÇÃO EXISTE PORQUE DOIS DOS DOZE ESTAVAM ERRADOS, e o
      erro sobreviveu à entrega inteira.** `--surface-today` e `--gold-soft` no
      tema claro foram publicados como **3,48** e valem **3,70** — em QUATRO
      arquivos permanentes ao mesmo tempo (este docblock, o `theme.css`, a spec
      da tarefa e o `BACKLOG.md`).

      A conclusão não mudou (3,70 passa com mais folga que 3,48), e é isso que
      torna o caso instrutivo: um número errado que conclui certo não tem
      sintoma. O que falhou foi o mecanismo — o script da entrega se validava
      contra pares conhecidos, e **nenhum dos pares conhecidos tocava essas
      duas superfícies**. A auto-validação pegou um erro do dourado porque
      havia par ali; aqui não havia, e o número saiu.

      Então a tabela publicada passou a ter acusador: o `>= 3` de cima prova o
      piso, e isto prova **o número que está escrito na prosa**. Quem mudar o
      token muda os doze aqui, e ao mudá-los passa pelo docblock.
    */
    const PUBLISHED: ReadonlyArray<readonly [string, number, number]> = [
      ['--bg', 3.63, 4.01],
      ['--surface', 3.76, 3.72],
      ['--surface-2', 3.47, 3.33],
      ['--surface-today', 3.7, 3.47],
      ['--gold-soft', 3.7, 3.47],
      ['--danger-bg', 3.12, 3.44],
    ];
    const edge = lightDarkPair('--border-field');

    for (const [surface, light, dark] of PUBLISHED) {
      const paper = lightDarkPair(surface);
      expect([
        surface,
        Number(contrastRatio(edge.light, paper.light).toFixed(2)),
        Number(contrastRatio(edge.dark, paper.dark).toFixed(2)),
      ]).toEqual([surface, light, dark]);
    }
  });

  it('⚠️ and the ratio itself is checked against an identity, on every colour it measures', () => {
    /*
      ⚠️ **A AUTO-VALIDAÇÃO QUE NÃO DEPENDE DE ALGUÉM LEMBRAR DO PAR.** A
      lição do erro acima é que uma lista de pares conhecidos só cobre o que
      quem a escreveu lembrou de pôr nela. Esta forma não tem lista: para
      QUALQUER cor, razão-contra-branco × razão-contra-preto é exatamente
      **21,00**, porque as duas frações se cancelam
      (`(1,05 / (L+0,05)) × ((L+0,05) / 0,05)`).

      Ou seja: toda superfície que esta suíte mede se valida sozinha, e um erro
      de canal (o clássico: trocar R por B, ou pôr o coeficiente errado) quebra
      a identidade em vez de produzir um número plausível.
    */
    const MEASURED = [
      '--border-field',
      '--bg',
      '--surface',
      '--surface-2',
      '--surface-today',
      '--gold-soft',
      '--danger-bg',
    ] as const;

    for (const token of MEASURED) {
      const colours = lightDarkPair(token);
      for (const theme of ['light', 'dark'] as const) {
        const product =
          contrastRatio(colours[theme], '#ffffff') *
          contrastRatio(colours[theme], '#000000');
        expect(Number(product.toFixed(2))).toBe(21);
      }
    }
  });

  it('⚠️ is a DIFFERENT tone from the decorative fillets, and says by how much', () => {
    /*
      ⚠️ **O PAR GUARDADO DOS DOIS LADOS.** A metade de cima prova que o filete
      novo passa; esta prova que os TRÊS filetes antigos continuam reprovando —
      e é ela que mata o mutante que aponta o token novo de volta para o filete
      neutro, que deixaria a metade de cima vermelha só por sorte do número.

      Os números da nota 19 da 47a, reconferidos aqui contra a página: o neutro
      dá 1,35 / 1,38, o forte 2,37 / 1,88 e o suave 1,21 / 1,20. Nenhum chega
      a 3.
    */
    const page = lightDarkPair('--bg');
    const field = lightDarkPair('--border-field');

    for (const decorative of [
      '--border',
      '--border-soft',
      '--border-strong',
    ] as const) {
      const fillet = lightDarkPair(decorative);
      for (const theme of ['light', 'dark'] as const) {
        // O decorativo REPROVA — é por isso que o campo precisou de tom próprio.
        expect(contrastRatio(fillet[theme], page[theme])).toBeLessThan(3);
        // E o do campo é ESTRITAMENTE mais forte que ele, nos dois temas.
        expect(contrastRatio(field[theme], page[theme])).toBeGreaterThan(
          contrastRatio(fillet[theme], page[theme]),
        );
      }
    }
  });

  it('keeps the decorative fillet discreet — 3:1 is for controls, not for frames', () => {
    /*
      ⚠️ A metade que impede o conserto de virar varredura: se alguém "resolver"
      o 1,35 escurecendo o filete neutro, o caderno encadernado vira cartão de
      aplicativo em 23 arquivos. Esta asserção pina que o decorativo continua
      SENDO discreto — e quem quiser mudá-lo terá de dizer que está mudando o
      desenho, não consertando contraste.
    */
    const page = lightDarkPair('--bg');
    const fillet = lightDarkPair('--border');

    for (const theme of ['light', 'dark'] as const) {
      expect(contrastRatio(fillet[theme], page[theme])).toBeLessThan(2);
    }
  });
});
