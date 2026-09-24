import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * ============================================================================
 * `prefers-reduced-motion` — a decisão E da Tarefa 48, MEDIDA antes de escrita
 * ============================================================================
 *
 * A spec avisa: *"se o app não anima nada, a guarda certa é a que prova a
 * ausência, e dizer isso é mais honesto que inventar uma media query sem
 * consumidor"*. Então o primeiro trabalho foi **medir o que anima hoje**, e o
 * resultado é que ela NÃO é a resposta certa aqui — o app anima:
 *
 * | o que | quantos | onde |
 * | --- | --- | --- |
 * | `animate-*` | **1** | `packages/ui/src/components/button.tsx` — o giro do `Loader2` enquanto o envio está em voo |
 * | `transition-*` | **12**, em **9** arquivos | sempre `transition-colors` — a lista exata está em `TRANSITION_FILES`, abaixo |
 * | `transform` que se MOVE | **0** | o único `transform:` do projeto é o `rotate(45deg)` ESTÁTICO da setinha do menu de bolha (`editor.css`) — ele não anima |
 * | `prefers-reduced-motion` | **0** | não existia em lugar nenhum antes desta fatia |
 *
 * ⚠️ **A CONTA DE ARQUIVOS SAIU ERRADA NA PRIMEIRA ENTREGA — 10, e são 9.** A
 * ocorrência de `chrome.tsx` é **comentário** (um exemplo de classe dentro de
 * um docblock), e a própria varredura deste arquivo descarta comentário antes
 * de contar. Ou seja: o número publicado discordava da guarda que o media, na
 * mesma fatia. Por isso a lista deixou de viver só na prosa e passou a ser
 * `TRANSITION_FILES`, com igualdade exata — quem acrescentar um arquivo soma
 * um nome aqui em vez de a conta envelhecer em silêncio.
 *
 * Ou seja: havia movimento e **nenhuma** media query o desligando, contra uma
 * decisão fechada do MVP 3.5 que manda o contrário em letra literal
 * (`docs/BACKLOG.md`: *"`prefers-reduced-motion` desligando transição, e
 * hover/pressionado mudando **cor** — sem `transform`, sem escala"*).
 *
 * ⚠️ **O PAR É GUARDADO DOS DOIS LADOS, e é o que impede esta guarda de virar
 * a media query sem consumidor que a 41b e a 44c pagaram.** A metade de cima
 * prova que a regra existe; a de baixo prova que **há movimento para ela
 * desligar**. No dia em que o último `animate-*` sair do projeto, a metade de
 * baixo fica vermelha e alguém decide — em vez de a regra sobreviver sozinha,
 * apontando para nada.
 */

/**
 * Os NOVE arquivos que escrevem `transition-*` em código, em ordem. Medido
 * nesta rodada; o `chrome.tsx` **não** está aqui, e essa é a correção: a
 * ocorrência dele é um exemplo dentro de um docblock.
 */
const TRANSITION_FILES: readonly string[] = [
  'App.tsx',
  'RichEditor.tsx',
  'button.tsx',
  'context-bar.tsx',
  'filter-bar.tsx',
  'filter-chip.tsx',
  'highlight-fields.tsx',
  'home.tsx',
  'list.tsx',
];

const APP_STYLES = readFileSync(
  resolve(process.cwd(), 'src', 'styles.css'),
  'utf8',
);

interface Source {
  path: string;
  text: string;
}

function sourcesUnder(root: string): Source[] {
  return readdirSync(root).flatMap((entry) => {
    if (entry === '__tests__') return [];
    const full = join(root, entry);
    if (statSync(full).isDirectory()) return sourcesUnder(full);
    return /\.(?:tsx?|css)$/u.test(entry) && !/\.test\./u.test(entry)
      ? [{ path: full, text: readFileSync(full, 'utf8') }]
      : [];
  });
}

/** Comentário não é código: a prosa deste projeto cita utilitário pelo nome. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

function appAndUiSources(): Source[] {
  return [
    ...sourcesUnder(resolve(process.cwd(), 'src')),
    ...sourcesUnder(resolve(process.cwd(), '..', 'ui', 'src')),
  ];
}

function matchesIn(pattern: RegExp, only?: 'utilities'): string[] {
  /*
    ⚠️ **A VARREDURA DE UTILITÁRIO NÃO PODE LER CSS, e isto foi medido — a
    primeira versão desta guarda ficou vermelha contra a própria entrega.** O
    bloco de `prefers-reduced-motion` do `styles.css` escreve
    `transition-duration`, que é PROPRIEDADE de CSS; o padrão de utilitário o
    casava e o teste acusava a regra de ser a transição que ela desliga.

    Utilitário do Tailwind mora em string de código; propriedade mora em folha
    de estilo. As duas superfícies são diferentes, e a partição é essa.
  */
  const sources =
    only === 'utilities'
      ? appAndUiSources().filter(({ path }) => !path.endsWith('.css'))
      : appAndUiSources();

  return sources.flatMap(({ path, text }) =>
    [...withoutComments(text).matchAll(pattern)].map(
      (match) => `${path}: ${match[0]}`,
    ),
  );
}

/** O bloco `@media (prefers-reduced-motion: reduce) { … }` do `styles.css`. */
function reducedMotionBlock(): string {
  const at = APP_STYLES.indexOf('prefers-reduced-motion');
  expect(at).toBeGreaterThan(-1);

  const open = APP_STYLES.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < APP_STYLES.length; i += 1) {
    if (APP_STYLES[i] === '{') depth += 1;
    if (APP_STYLES[i] === '}') {
      depth -= 1;
      if (depth === 0) return APP_STYLES.slice(open, i + 1);
    }
  }
  throw new Error('bloco de prefers-reduced-motion sem fechamento');
}

describe('⚠️ prefers-reduced-motion (decisão E, Tarefa 48)', () => {
  it('⚠️ turns motion OFF for whoever asked the system to turn it off', () => {
    const block = reducedMotionBlock();

    // `reduce`, e não `no-preference`: a consulta tem de ser a de QUEM PEDIU.
    expect(APP_STYLES).toContain('prefers-reduced-motion: reduce');

    /*
      ⚠️ AS QUATRO PROPRIEDADES, E CADA UMA APAGA UM MOVIMENTO DIFERENTE:
      `animation-duration` mata o giro do botão, `animation-iteration-count`
      impede que um `infinite` o traga de volta pelo outro lado,
      `transition-duration` mata as doze transições de cor, e
      `scroll-behavior` mata a rolagem suave que o navegador faz sozinho.

      Sem a segunda, um `animate-spin` com `iteration-count: infinite` e
      duração quase zero continua girando — rápido demais para se ver e caro
      igual. É a metade que quase todo mundo esquece.
    */
    for (const property of [
      'animation-duration',
      'animation-iteration-count',
      'transition-duration',
      'scroll-behavior',
    ]) {
      expect(block).toContain(property);
    }

    // `*` e os pseudoelementos: um `::before` que gira não é menos movimento.
    expect(block).toContain('*');
    expect(block).toContain('::before');
    expect(block).toContain('::after');
  });

  it('⚠️ and there IS motion for it to turn off — the other half of the pair', () => {
    /*
      ⚠️ **SEM ESTA METADE A GUARDA ACIMA É UMA MEDIA QUERY SEM CONSUMIDOR** —
      a classe de defeito que a 41b e a 44c pagaram, e que a decisão E desta
      fatia nomeia. Medido hoje: UM `animate-*` (o giro do botão) e DOZE
      `transition-*`. Se os dois chegarem a zero, isto fica vermelho e a
      pergunta volta para o dono em vez de a regra sobreviver apontando para
      nada.
    */
    const animations = matchesIn(/\banimate-[a-z][a-z-]*/gu, 'utilities');
    const transitions = matchesIn(/\btransition-[a-z][a-z-]*/gu, 'utilities');

    expect(animations.length).toBeGreaterThan(0);
    expect(transitions.length).toBeGreaterThan(0);

    /*
      ⚠️ **E A LISTA DE ARQUIVOS PASSOU A TER ACUSADOR — a lição do número
      errado.** O docblock desta guarda publicou "12, em 10 arquivos" e a
      medição dá **9**: a décima ocorrência era um exemplo dentro de um
      comentário do `chrome.tsx`, que a própria `matchesIn` descarta. Um número
      que discorda da guarda que o mede, na mesma fatia.

      Daqui em diante a lista é dado, não prosa — e a comparação é por
      igualdade exata, a forma "soma um, não apague" que o
      `SCREENS_WITH_TEXT_FIELDS` já usa.
    */
    const files = [
      ...new Set(
        transitions.map((found) => {
          const [where = ''] = found.split(': ');
          return where.split(/[\\/]/u).at(-1) ?? '';
        }),
      ),
    ].sort();

    expect(files).toEqual([...TRANSITION_FILES]);
  });

  it('⚠️ keeps every transition a COLOUR one — the closed MVP 3.5 decision', () => {
    /*
      *"hover/pressionado mudando **cor** — sem `transform`, sem escala"*
      (`docs/BACKLOG.md`, decisões fechadas do MVP 3.5). Era letra sem guarda
      até esta fatia. Medido: as doze transições do projeto são
      `transition-colors`, sem exceção.

      `transition-all` entra na lista porque ele anima a GEOMETRIA junto — é o
      jeito mais fácil de trazer movimento de volta sem escrever a palavra.
    */
    const transitions = matchesIn(/\btransition-[a-z][a-z-]*/gu, 'utilities');

    expect(transitions.length).toBeGreaterThan(0);
    for (const found of transitions) {
      expect(found).toMatch(/transition-colors$/u);
    }
  });

  it('⚠️ never answers a hover or a press with GEOMETRY — only with colour', () => {
    /*
      ⚠️ **A ASSERÇÃO PRECISOU DA VARIANTE, e a primeira versão dela estava
      larga demais — medido, não suposto.** Escrita como "nenhuma geometria em
      lugar nenhum", ela ficou vermelha contra a implementação por causa do
      `rotate-180` do `BookSpine` — que é a lombada vertical do
      `Inicio.dc.html:72`, uma rotação **estática** de tipografia, sem
      `hover:`, sem `transition` e sem movimento nenhum. Proibi-la seria a
      guarda cobrando o que a decisão não diz.

      O que a decisão fechada do MVP 3.5 diz é sobre a RESPOSTA ao gesto:
      *"hover/pressionado mudando cor — sem `transform`, sem escala"*. Então é
      a variante que a guarda lê: um gesto respondendo com geometria. Medido
      hoje: **zero**.

      ⚠️⚠️ **E O PADRÃO ESTAVA MEIO PIXEL CURTO — medido na rodada de correção,
      com três mutantes que passavam.** O estreitamento pela variante estava
      certo; o que estava errado era a forma do que vem DEPOIS dela:

      | escapava | por quê |
      | --- | --- |
      | `hover:-translate-y-1` | o utilitário NEGATIVO põe o `-` antes do nome, e o padrão exigia o nome colado no `:`. É o "levantar no hover" mais idiomático do Tailwind, e tinha zero acusadores |
      | `hover:[transform:scale(1.1)]` | valor arbitrário: a geometria entra como PROPRIEDADE dentro de colchete, sem nome de utilitário nenhum |
      | `data-[state=open]:scale-105` | a variante de estado de dado não estava na lista, e é a que um menu/sheet usa |

      Daí as três frouxidões de propósito: o `-?` do utilitário negativo, o
      `\[transform:` do valor arbitrário, e `data-[…]` entre as variantes de
      gesto. E `translate`/`skew` sem exigir o eixo, porque `translate-4` (sem
      eixo) também move.
    */
    const gesture =
      /\b(?:hover|active|focus|focus-visible|focus-within|group-hover|group-active|group-focus|peer-hover|peer-focus|aria-pressed|aria-expanded|aria-selected|aria-checked|data-\[[^\]]*\]):(?:-?(?:scale|rotate|translate|skew)\b|\[transform:)/gu;

    expect(matchesIn(gesture)).toEqual([]);
  });

  it('⚠️ and THAT sweep bites all three ways geometry comes back', () => {
    /*
      ⚠️ **O PAR POSITIVO DA VARREDURA ACIMA.** Ela nasceu verde contra a
      implementação (nada responde a gesto com geometria hoje), então o
      vermelho dela é o do mutante — e a rodada de correção mediu que a versão
      anterior deixava passar exatamente os três casos abaixo.

      Escritos como TEXTO de sonda, não como classe de uma tela, para não
      pagarem CSS: o `@source` do app não cobre `__tests__`, mas a forma que se
      copia é a que não escreve classe onde não precisa.
    */
    const gesture =
      /\b(?:hover|active|focus|focus-visible|focus-within|group-hover|group-active|group-focus|peer-hover|peer-focus|aria-pressed|aria-expanded|aria-selected|aria-checked|data-\[[^\]]*\]):(?:-?(?:scale|rotate|translate|skew)\b|\[transform:)/gu;

    for (const planted of [
      'hover:-translate-y-1',
      'hover:scale-105',
      'active:rotate-3',
      'group-hover:translate-x-1',
      'data-[state=open]:scale-105',
      'hover:[transform:scale(1.1)]',
    ]) {
      expect(planted.match(gesture)).not.toBeNull();
    }

    /*
      E a metade negativa, que impede o conserto fácil (alargar até pegar
      tudo): a lombada vertical é rotação ESTÁTICA de tipografia, e a seta do
      acordeão idem enquanto ninguém a amarrar a um gesto.
    */
    for (const legit of [
      'rotate-180',
      '-translate-y-1',
      'min-[1120px]:rotate-180',
      'hover:text-gold-strong',
      'hover:bg-surface-2',
    ]) {
      expect(legit.match(gesture)).toBeNull();
    }
  });

  it('⚠️ and the only transform in the project is a STATIC one, named here', () => {
    /*
      ⚠️ A outra metade do par acima: a lista de `transform:` crus é fechada e
      tem UM item. Um `transform:` novo — que é como o movimento entra sem
      passar por utilitário do Tailwind — deixa isto vermelho, e quem o
      escrever diz por escrito que está escrevendo.
    */
    const transforms = matchesIn(/transform:\s*[^;]+/gu);

    expect(transforms).toHaveLength(1);
    expect(transforms[0]).toContain('editor.css');
    // A setinha do menu de bolha. Ela não anima: é a ponta de um losango.
    expect(transforms[0]).toContain('rotate(45deg)');
  });
});
