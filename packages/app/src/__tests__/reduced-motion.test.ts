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
 *
 * ============================================================================
 * ⚠️⚠️ REPAGINAÇÃO VISUAL — decisão do dono de 2026-09-24
 * ============================================================================
 *
 * O dono pediu o app "mais atual, sofisticado, cara de app de celular" e pediu
 * MOVIMENTO por extenso: troca de tela animada (View Transitions), gaveta que
 * sobe e desce, menu lateral que desliza, lista que entra em cascata, ícone do
 * tema que gira, e o toque que afunda (`scale(0.97)`) no dedo. Isso **revoga**
 * a letra do MVP 3.5 citada acima ("hover/pressionado mudando cor — sem
 * `transform`, sem escala"), e a revogação é do dono, não desta guarda.
 *
 * O que NÃO foi revogado, e é o núcleo desta guarda:
 *
 * 1. **quem pediu menos movimento ao sistema recebe menos movimento** — o
 *    bloco `@media (prefers-reduced-motion: reduce)` continua existindo e
 *    matando animação e transição (agora também no `::backdrop` do menu), e a
 *    troca de tela nem chama a View Transition nesse caso (`App.tsx`);
 * 2. **movimento novo não entra calado.** A proibição virou LISTA FECHADA: cada
 *    transição que não é de cor, cada gesto que responde com geometria, cada
 *    `transform:` cru e cada `@keyframes` está nomeado abaixo, com igualdade
 *    exata. Quem acrescentar movimento soma uma linha aqui e diz por quê — a
 *    mesma forma "soma um, não apague" do `TRANSITION_FILES`.
 */

/**
 * Os arquivos que escrevem `transition-*` em código, em ordem. Eram NOVE na
 * Tarefa 48; a repaginação (2026-09-24) somou `book.tsx`, `form-styles.ts` e
 * `streak-button.tsx`. O `chrome.tsx` **não** está aqui: a ocorrência dele é
 * um exemplo dentro de um docblock.
 */
const TRANSITION_FILES: readonly string[] = [
  'App.tsx',
  'RichEditor.tsx',
  'book.tsx',
  'button.tsx',
  'context-bar.tsx',
  'filter-bar.tsx',
  'filter-chip.tsx',
  'form-styles.ts',
  'highlight-fields.tsx',
  'home.tsx',
  'list.tsx',
  'streak-button.tsx',
];

/**
 * ⚠️ AS TRANSIÇÕES QUE NÃO SÃO DE COR — lista fechada da repaginação
 * (2026-09-24). Todo o resto continua `transition-colors`.
 */
const NON_COLOUR_TRANSITIONS: readonly string[] = [
  // o filete do campo acende no foco (`--shadow-field` → `-focus`)
  'form-styles.ts: transition-shadow',
  // a moldura do papel grifado, o mesmo filete
  'highlight-fields.tsx: transition-shadow',
  // a seta do cartão "ler hoje" anda meio passo no hover
  'home.tsx: transition-transform',
];

/**
 * ⚠️ OS GESTOS QUE RESPONDEM COM GEOMETRIA — lista fechada da repaginação.
 * O afundar do toque NÃO está aqui porque não é utilitário: mora no
 * `styles.css`, só para ponteiro grosso, e está em `RAW_TRANSFORMS`.
 */
const GESTURE_GEOMETRY: readonly string[] = [
  // a mesma seta do cartão "ler hoje" (`group-hover:translate-x-0.5`)
  'home.tsx: group-hover:translate',
];

/**
 * ⚠️ TODO `transform:` CRU DO PROJETO, por arquivo e valor, em ordem.
 * Era UM (a setinha do menu de bolha); a repaginação trouxe onze, todos no
 * `styles.css`.
 */
const RAW_TRANSFORMS: readonly string[] = [
  // a ponta do losango do menu de bolha — estática, não anima
  'editor.css: rotate(45deg)',
  // o menu lateral (`.app-drawer`): fechado, aberto, e o ponto de partida
  'styles.css: translateX(100%)',
  'styles.css: translateX(0)',
  'styles.css: translateX(100%)',
  // @keyframes rise-in (tela nova, lista em cascata)
  'styles.css: translateY(8px)',
  // @keyframes sink-out (tela velha)
  'styles.css: translateY(-4px) scale(0.99)',
  // @keyframes sheet-up / sheet-down (a gaveta no celular)
  'styles.css: translateY(100%)',
  'styles.css: translateY(100%)',
  // @keyframes pop-in / pop-out (a gaveta como janela, no desktop)
  'styles.css: translateY(8px) scale(0.97)',
  'styles.css: scale(0.97)',
  // @keyframes icon-swap (sol ↔ lua)
  'styles.css: rotate(-90deg) scale(0.6)',
  // o toque que afunda — só `@media (pointer: coarse)`
  'styles.css: scale(0.97)',
];

/** ⚠️ OS `@keyframes` DO PROJETO — lista fechada da repaginação. */
const KEYFRAMES: readonly string[] = [
  'fade-in',
  'fade-out',
  'icon-swap',
  'pop-in',
  'pop-out',
  'rise-in',
  'sheet-down',
  'sheet-up',
  'sink-out',
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

/**
 * Utilitários de animação e transição do Tailwind.
 *
 * ⚠️ O `(?<![\w-])` é da repaginação: o cabeçalho escreve
 * `[view-transition-name:app-header]`, e sem ele o `transition-name` de
 * dentro dessa PROPRIEDADE arbitrária contava como utilitário de transição.
 */
const TRANSITION_UTILITY = /(?<![\w-])transition-[a-z][a-z-]*/gu;
const ANIMATE_UTILITY = /(?<![\w-])animate-[a-z][a-z-]*/gu;

/** `C:\…\home.tsx: group-hover:translate` → `home.tsx: group-hover:translate`. */
function fileAndMatch(found: string): string {
  const [where = '', ...rest] = found.split(': ');
  return `${where.split(/[\\/]/u).at(-1) ?? ''}: ${rest.join(': ')}`;
}

/**
 * O bloco `@media (prefers-reduced-motion: reduce) { … }` do `styles.css`.
 *
 * ⚠️ Achado pela REGRA `@media (…)`, não pela palavra solta, e sobre o CSS
 * sem comentário: na repaginação o comentário do `.app-drawer` passou a citar
 * "prefers-reduced-motion" antes do bloco de verdade, e o localizador antigo
 * (`indexOf('prefers-reduced-motion')`) devolvia o bloco da GAVETA.
 */
function reducedMotionBlock(): string {
  return blockOf('@media (prefers-reduced-motion: reduce)');
}

/** O bloco `{ … }` que abre depois de `rule`, no `styles.css` sem comentário. */
function blockOf(rule: string): string {
  const styles = withoutComments(APP_STYLES);
  const at = styles.indexOf(rule);
  expect(at).toBeGreaterThan(-1);

  const open = styles.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < styles.length; i += 1) {
    if (styles[i] === '{') depth += 1;
    if (styles[i] === '}') {
      depth -= 1;
      if (depth === 0) return styles.slice(open, i + 1);
    }
  }
  throw new Error(`bloco de ${rule} sem fechamento`);
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
    // E o `::backdrop` do menu lateral (repaginação): o `*` não o alcança, e
    // o fundo dele anima cor e desfoque.
    expect(block).toContain('::backdrop');
  });

  it('⚠️ skips the page View Transition entirely for whoever asked for less motion', () => {
    /*
      O `::view-transition-*` não é casado pelo `*` do bloco acima — então a
      troca de tela é desligada na origem: o `App.tsx` consulta a preferência
      ANTES de chamar `startViewTransition`.
    */
    const app = withoutComments(
      readFileSync(resolve(process.cwd(), 'src', 'App.tsx'), 'utf8'),
    );
    const query = app.indexOf("matchMedia('(prefers-reduced-motion: reduce)')");
    const call = app.indexOf('document.startViewTransition(');

    expect(query).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(query);
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
    const animations = matchesIn(ANIMATE_UTILITY, 'utilities');
    const transitions = matchesIn(TRANSITION_UTILITY, 'utilities');

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

  it('⚠️ keeps every transition a COLOUR one, except the NAMED ones of the repaginação', () => {
    /*
      Até a Tarefa 48 isto era *"hover/pressionado mudando **cor** — sem
      `transform`, sem escala"* (MVP 3.5), e toda transição era
      `transition-colors`. A repaginação de 2026-09-24 (decisão do dono)
      acrescentou três, e elas estão nomeadas em `NON_COLOUR_TRANSITIONS`.

      `transition-all` continua proibido de fato: ele não está na lista, e é
      o jeito mais fácil de trazer movimento sem escrever a palavra.
    */
    const transitions = matchesIn(TRANSITION_UTILITY, 'utilities');

    expect(transitions.length).toBeGreaterThan(0);
    const nonColour = transitions
      .filter((found) => !found.endsWith('transition-colors'))
      .map(fileAndMatch)
      .sort();
    expect(nonColour).toEqual([...NON_COLOUR_TRANSITIONS].sort());
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

      ⚠️ **REPAGINAÇÃO (2026-09-24): era "zero"; hoje é a lista fechada
      `GESTURE_GEOMETRY`**, com um item — a seta do cartão "ler hoje". Um
      segundo gesto com geometria fica vermelho até alguém nomeá-lo lá.
    */
    const gesture =
      /\b(?:hover|active|focus|focus-visible|focus-within|group-hover|group-active|group-focus|peer-hover|peer-focus|aria-pressed|aria-expanded|aria-selected|aria-checked|data-\[[^\]]*\]):(?:-?(?:scale|rotate|translate|skew)\b|\[transform:)/gu;

    expect(matchesIn(gesture).map(fileAndMatch).sort()).toEqual(
      [...GESTURE_GEOMETRY].sort(),
    );
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

  it('⚠️ and every raw transform in the project is NAMED here', () => {
    /*
      ⚠️ A outra metade do par acima: a lista de `transform:` crus é fechada.
      Era UM item (a setinha do menu de bolha) até a Tarefa 48; a repaginação
      de 2026-09-24 trouxe os do menu lateral, das `@keyframes` e do toque que
      afunda — todos em `RAW_TRANSFORMS`. Um `transform:` novo — que é como o
      movimento entra sem passar por utilitário do Tailwind — deixa isto
      vermelho, e quem o escrever diz por escrito que está escrevendo.
    */
    const transforms = matchesIn(/(?<![\w-])transform:\s*[^;]+/gu).map(
      (found) => {
        const [where = '', what = ''] = found.split(/: transform:\s*/u);
        return `${where.split(/[\\/]/u).at(-1) ?? ''}: ${what.trim()}`;
      },
    );

    expect(transforms.sort()).toEqual([...RAW_TRANSFORMS].sort());
  });

  it('⚠️ keeps the press-and-sink ONLY for the finger (pointer: coarse)', () => {
    /*
      O toque que afunda foi pedido "cara de app de celular": no desktop o
      hover já responde. A regra `:active` com `scale` tem de morar DENTRO do
      `@media (pointer: coarse)` — solta, ela afundaria todo clique de mouse.
    */
    const styles = withoutComments(APP_STYLES);
    const block = blockOf('@media (pointer: coarse)');

    expect(block).toContain(':active');
    expect(block).toContain('transform: scale(0.97)');
    // E fora dele, nenhum `:active` mexe em geometria.
    const outside = styles.replace(block, '');
    expect(outside).not.toMatch(/:active[^{]*\{[^}]*transform/u);
  });

  it('⚠️ declares only the NAMED @keyframes', () => {
    const declared = [
      ...withoutComments(APP_STYLES).matchAll(/@keyframes\s+([\w-]+)/gu),
    ].map((match) => match[1] ?? '');

    expect(declared.sort()).toEqual([...KEYFRAMES].sort());
  });
});
