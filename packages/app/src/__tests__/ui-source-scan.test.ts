// @vitest-environment node
//
// ⚠️ MEDIDO, não presumido: no ambiente `jsdom` do `vitest.config.ts` este
// arquivo nem chega a rodar. O `esbuild` (que o `vite.build` usa) verifica no
// carregamento que `new TextEncoder().encode('') instanceof Uint8Array`, e o
// `TextEncoder` do jsdom devolve um `Uint8Array` de OUTRO realm — a checagem dá
// falso e o esbuild aborta com "your JavaScript environment is broken". É o
// único teste do app que não precisa de DOM, e o único que precisa compilar.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// As duas constantes que a fatia usa para ler `min-h-<n>` como px. Elas entram
// aqui — e não só nos testes do `ui` — porque é ESTE arquivo que tem o CSS
// compilado, e é contra o CSS que os números se provam (veja o último
// `describe`).
import { MIN_TOUCH_TARGET_PX, SPACING_STEP_PX } from '@clube/ui';
import { build } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * REGRA 1 — A PROVA DE QUE `@clube/ui` EXISTE PARA O TAILWIND.
 *
 * A detecção automática de fontes do Tailwind v4 IGNORA `node_modules`, e num
 * workspace pnpm o `@clube/ui` chega ao app como symlink dentro de
 * `node_modules/@clube/ui`. Sem o `@source '../../ui/src'` de `styles.css`,
 * uma classe usada num componente de `packages/ui` não gera CSS NENHUM: o
 * componente renderiza cru e o sintoma parece bug de CSS, não de configuração.
 *
 * Medido na Tarefa 13, com uma sonda de margem de valor arbitrário (137px)
 * plantada em `ui/src`: sem o `@source`, o `dist/assets/*.css` não continha o
 * seletor da sonda; com o `@source`, continha, com `margin-top` de 137px.
 *
 * ⚠️ A sonda NÃO é citada aqui pelo nome de classe, e isso é um achado da
 * fatia: o Tailwind varre também os arquivos de teste do app, e um nome de
 * classe escrito num COMENTÁRIO gera CSS de verdade. Citá-la pelo nome fazia a
 * asserção "não sobrou sonda no CSS" falhar por causa do próprio comentário
 * que a explicava — medido.
 *
 * Por isso este teste COMPILA (não lê): é a mesma disciplina que fez a Tarefa
 * 12 descobrir que o `dark:` não obedecia o `data-theme`. Ler o `styles.css` e
 * ver a linha lá provaria que a linha está lá, não que ela funciona — um
 * caminho errado (`../ui/src`) passaria numa leitura e falharia aqui.
 *
 * ⚠️ O custo: é o único teste do repositório que roda um build de verdade
 * (~10s). Ele existe porque, sem ele, TODA a Tarefa 13 pode estar
 * silenciosamente sem estilo.
 */

const uiSourceRoot = resolve(process.cwd(), '..', 'ui', 'src');

/** Só o que vai para o app: `__tests__/` não embarca e não precisa de CSS. */
function uiSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (entry === '__tests__') return [];

    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return uiSourceFiles(path);
    return /\.tsx?$/u.test(entry) ? [path] : [];
  });
}

/**
 * A MESMA varredura, do lado do app — e ela existe por causa da auditoria da
 * Tarefa 41a.
 *
 * A lista de sondas de `finds classes in packages/ui to check` prometia em
 * comentário que aquelas classes existiam SÓ em `packages/ui`, e medido isso já
 * era falso para duas delas. Promessa em comentário não é garantia (§7.1): ou a
 * propriedade é afirmada, ou o comentário para de afirmá-la. As duas coisas
 * foram feitas, e esta função é a metade que afirma.
 *
 * `__tests__/` fica fora pela mesma razão de lá: teste não embarca, e o
 * `styles.css` tem `@source not` para ele.
 */
const appSourceRoot = resolve(process.cwd(), 'src');

function appSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (entry === '__tests__') return [];

    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return appSourceFiles(path);
    return /\.tsx?$/u.test(entry) ? [path] : [];
  });
}

/** Os arquivos de `packages/app/src` que escrevem esta classe. */
function usagesOutsideUi(className: string): string[] {
  // `(?<![\w-])`/`(?![\w-])`: o mesmo par do `theme-tokens.test.ts`, e pela
  // mesma razão — sem ele `border-leader` casaria `border-leader-future`, e a
  // canária acusaria por um uso que não é dela. Variante (`hover:`, `sm:`) é
  // PREFIXO, então ela casa de propósito: `hover:bg-person` pinta o mesmo.
  const pattern = new RegExp(`(?<![\\w-])${className}(?![\\w-])`, 'u');

  return appSourceFiles(appSourceRoot).filter((path) =>
    pattern.test(stripComments(readFileSync(path, 'utf8'))),
  );
}

/** Comentário não é código: a prosa de `ui/` cita classes em exemplo (§7.1). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

/**
 * Especificador de módulo não é classe.
 *
 * ⚠️ MEDIDO na rodada de correção, e é o falso positivo que o `lucide-react`
 * trouxe: `'lucide-react'` tem a forma exata de um utilitário (minúsculas,
 * separador `-`) e virou "classe que o Tailwind não emitiu" — vermelho que
 * mandava consertar o `@source`, que estava certo. Os relativos
 * (`'./components/button'`) e os escopados (`'@testing-library/react'`) já
 * caíam fora por não começarem com letra; um pacote com hífen no nome, não.
 */
function stripModuleSpecifiers(source: string): string {
  return source
    .replace(/\bfrom\s*(['"])[^'"\n]*\1/gu, ' from _ ')
    .replace(/\bimport\s*(['"])[^'"\n]*\1/gu, ' import _ ');
}

/**
 * Um token com CARA de utilitário do Tailwind: minúsculas, começando por
 * letra. Maiúscula elimina `pt-BR`, `currentColor` e o `d=` dos SVGs; dígito
 * inicial elimina coordenada de path.
 */
const CLASS_TOKEN = /^[a-z][a-z0-9]*(?:[-:/][a-z0-9[\]#%./-]+)*$/u;

/** `-`, `:` ou `/` — o que separa um utilitário do seu valor. */
const HAS_SEPARATOR = /[-:/]/u;

/**
 * Nome de ATRIBUTO entre aspas não é classe — mas VARIANTE de atributo é.
 *
 * Medido: `'aria-describedby'`, `'aria-invalid'` (chaves de `FieldControlProps`)
 * e `'aria-label'` (prop de `ListProps`) casam a forma de um utilitário e
 * apareciam como "classe que o Tailwind não emitiu" — um vermelho que mandaria
 * consertar o `@source`, que estava certo.
 *
 * ⚠️ ANCORADO (`$`) na rodada de correção, e o motivo é a Tarefa 15: a exclusão
 * era `/^(?:aria|data)-/`, um PREFIXO, e ela isentava
 * `aria-invalid:border-danger` e `data-[state=open]:bg-surface` — que são
 * exatamente as variantes que o `Field` e o `Sheet` vão querer. Medido: um
 * `'aria-invalid:sonda-variante'` plantado em `ui/src` sobrevivia à suíte.
 * Um token com `:` (ou qualquer coisa além do nome do atributo) volta ao
 * escopo.
 */
const ATTRIBUTE_NAME = /^(?:aria|data)-[a-z-]+$/u;

/**
 * Os utilitários do Tailwind que NÃO têm separador nenhum.
 *
 * ⚠️ Esta lista existe porque a extração por FORMA não consegue distinguir
 * `'invisible'` (a classe de que a regra 7 depende) de `'primary'`, `'submit'`
 * ou `'md'` (valores de prop) — as duas coisas são "uma palavra minúscula".
 * Sem a lista, a família toda escapava: `border` (do `VARIANT_CLASS.ghost`) não
 * era conferido, e nem `hidden`, `block`, `italic`, `underline`, `uppercase`,
 * `visible`, `isolate` seriam quando aparecessem.
 *
 * Toda entrada aqui é um utilitário REAL do Tailwind. Isso importa: o
 * extrator do próprio Tailwind também varre `ui/src`, então qualquer candidato
 * VÁLIDO que apareça num literal daqui é emitido — e a lista não pode gerar
 * falso positivo. Uma entrada inventada geraria.
 */
const SINGLE_WORD_UTILITIES = new Set([
  'absolute',
  'antialiased',
  'block',
  'border',
  'capitalize',
  'collapse',
  'contents',
  'fixed',
  'flex',
  'grid',
  'hidden',
  'inline',
  'invisible',
  'isolate',
  'italic',
  'lowercase',
  'outline',
  'relative',
  'resize',
  'ring',
  'rounded',
  'shadow',
  'static',
  'sticky',
  'table',
  'transform',
  'transition',
  'truncate',
  'underline',
  'uppercase',
  'visible',
]);

/**
 * VALOR DE OPÇÃO DE BIBLIOTECA NÃO É CLASSE.
 *
 * ⚠️ ACRESCENTADO NA TAREFA 14, e é o mesmo tipo de falso positivo que o
 * `stripModuleSpecifiers` já resolveu para `'lucide-react'`: uma string que
 * tem a FORMA exata de um utilitário (minúsculas, com separador) e não é
 * classe nenhuma. Medido: os dois abaixo apareciam como "classe que o Tailwind
 * não emitiu" — um vermelho que manda consertar o `@source`, que está certo.
 *
 * - `bottom-start` é o `placement` do tippy (`suggestion-render.ts`): onde o
 *   popup do menu `/` nasce em relação ao `/` digitado;
 * - `text/plain` é o formato do clipboard que decide se um paste é imagem ou
 *   texto (`image-upload.ts` §8.3).
 *
 * A lista é FECHADA e por literal EXATO, não por padrão: cada entrada é uma
 * isenção nomeada, e uma classe de verdade não pode entrar aqui por acidente
 * (nem `.bottom-start` nem `.text\/plain` existem no Tailwind). O teste
 * `keeps the exemption list closed` abaixo é o que impede a lista de virar a
 * gaveta onde alguém guarda uma classe que o Tailwind não gerou.
 */
const LIBRARY_OPTION_VALUES = new Set(['bottom-start', 'text/plain']);

function tokensOf(literal: string): string[] {
  return literal.split(/\s+/u).filter((token) => token !== '');
}

/**
 * Do `{`/`(` de `openIndex` até o fecha correspondente, pulando o conteúdo de
 * string (senão um `'}'` dentro de um literal fecharia a região cedo).
 */
function balancedRegion(code: string, openIndex: number): string {
  const open = code[openIndex];
  const close = open === '{' ? '}' : ')';
  let depth = 0;
  let quote: string | undefined;

  for (let index = openIndex; index < code.length; index += 1) {
    const character = code[index];

    if (quote !== undefined) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }

    if (character === "'" || character === '"' || character === '`') {
      quote = character;
    } else if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
      if (depth === 0) return code.slice(openIndex, index + 1);
    }
  }

  return code.slice(openIndex);
}

/**
 * As POSIÇÕES DE CLASSE de um arquivo: `className="…"`, `className={…}` e todo
 * `cx(…)`.
 *
 * É a única fonte que sabe de verdade o que é classe e o que é valor de prop —
 * a forma do token não sabe. É ela que faz `'invisible'` e uma sonda de uma
 * palavra só serem CONFERIDAS, sem que `'primary'` ou um
 * `const FALLBACK_ALT = 'member of the club'` entrem como classe.
 */
function classRegions(code: string): string[] {
  const regions: string[] = [];

  for (const match of code.matchAll(/className\s*=\s*(['"])([^'"\n]*)\1/gu)) {
    regions.push(match[0]);
  }

  for (const match of code.matchAll(/className\s*=\s*\{|\bcx\s*\(/gu)) {
    if (match.index === undefined) continue;
    regions.push(balancedRegion(code, match.index + match[0].length - 1));
  }

  return regions;
}

/** Todo token de todo literal de uma região de classe. */
function classesFromContext(code: string): string[] {
  return classRegions(code).flatMap((region) =>
    [...region.matchAll(/'([^'\n]*)'|"([^"\n]*)"/gu)].flatMap((match) => {
      // `size === 'lg' ? 'px-5 text-lg' : 'px-4 text-base'` mora DENTRO de um
      // `cx(...)`, e o `'lg'` ali é um valor comparado, não uma classe. É a
      // única forma de literal não-classe que aparece em posição de classe, e
      // o que a distingue é o operador antes dela.
      const at = match.index ?? 0;
      const before = region.slice(Math.max(0, at - 4), at);
      if (/[=!]=\s*$/u.test(before)) return [];
      return tokensOf(match[1] ?? match[2] ?? '');
    }),
  );
}

/**
 * Todo token com forma de utilitário, de qualquer literal do arquivo.
 *
 * ⚠️ A regra é UNIFORME desde a rodada de correção: o token precisa de
 * separador (ou de estar em `SINGLE_WORD_UTILITIES`), esteja ele sozinho ou
 * numa lista. Antes, pertencer a uma lista ISENTAVA o token da exigência — e
 * era isso que fazia um `const FALLBACK_ALT = 'member of the club'` entrar
 * como quatro classes e deixar a regra 1 vermelha pelo motivo errado, mandando
 * olhar o `@source`, que estava certo.
 *
 * Esta varredura é a que cobre as TABELAS de classe (`VARIANT_CLASS`,
 * `SIZE_CLASS`, `BACKGROUND_CLASS`, `FOCUS_RING`, `SCROLL_LOCK_CLASS`), que não
 * ficam em posição de `className`/`cx`.
 */
function classesFromShape(code: string): string[] {
  return [...code.matchAll(/'([^'\n]*)'|"([^"\n]*)"/gu)].flatMap((match) =>
    tokensOf(match[1] ?? match[2] ?? '').filter(
      (token) =>
        CLASS_TOKEN.test(token) &&
        !ATTRIBUTE_NAME.test(token) &&
        (HAS_SEPARATOR.test(token) || SINGLE_WORD_UTILITIES.has(token)),
    ),
  );
}

/**
 * As classes que `packages/ui` usa, extraídas do código-fonte.
 *
 * A UNIÃO das duas varreduras, e a união é de propósito: nenhuma delas sozinha
 * cobre o pacote. O contexto sabe o que é classe mas não vê as tabelas; a forma
 * vê tudo mas não sabe distinguir classe de valor de prop. Somadas, o que
 * escapa é só o que nenhuma das duas alcança — e aí é uma tabela de classe com
 * um utilitário de uma palavra fora da lista, que a próxima fatia paga com um
 * item na lista.
 *
 * ⚠️ REGISTRADO, NÃO CONSERTADO — o `FOCUSABLE_SELECTOR` do `Sheet`. Ele é uma
 * lista de SELETORES CSS (`'button:not([disabled])'`, `'a[href]'`,
 * `'[tabindex]:not([tabindex="-1"])'`), não de classes, e nenhum entra aqui —
 * mas por dois motivos de força bem diferente:
 *
 * - os que começam por `[`, e os que têm `[` sem separador antes, são
 *   rejeitados pela ESTRUTURA do `CLASS_TOKEN` (`^[a-z]` e a exigência de
 *   separador antes do valor). Sólido;
 * - os quatro `*:not([disabled])` são rejeitados porque `(` e `)` não estão na
 *   classe de caracteres permitida — um ACIDENTE FELIZ. Quem um dia acrescentar
 *   parênteses ali (para uma variante `not-[...]`, por exemplo) traz os quatro
 *   de volta como "classes que o Tailwind não emitiu".
 *
 * A varredura por CONTEXTO não os alcança (eles não moram em
 * `className`/`cx`), então hoje há uma segunda barreira, e essa é deliberada.
 * Se a primeira cair, a saída é uma exclusão explícita de seletor, não mexer
 * no `CLASS_TOKEN`. Decisão do dono.
 */
function classesUsedByUi(): string[] {
  const found = new Set<string>();

  for (const path of uiSourceFiles(uiSourceRoot)) {
    const code = stripModuleSpecifiers(
      stripComments(readFileSync(path, 'utf8')),
    );
    for (const token of [
      ...classesFromShape(code),
      ...classesFromContext(code),
    ]) {
      if (!LIBRARY_OPTION_VALUES.has(token)) found.add(token);
    }
  }

  return [...found].sort();
}

/**
 * `hover:bg-surface` → `.hover\:bg-surface`.
 *
 * O Tailwind escapa no seletor o que o CSS não aceita cru — e foi essa
 * escapada que fez o primeiro `grep` da sonda voltar vazio, com o CSS já
 * contendo a classe.
 */
function escapedSelector(className: string): string {
  return `.${className.replace(/[:/[\].%#,()]/gu, (character) => `\\${character}`)}`;
}

/** O build de verdade, num diretório temporário fora do repositório. */
const outDir = join(tmpdir(), 'clube-ui-source-scan');

let compiledCss = '';

beforeAll(async () => {
  await build({
    root: process.cwd(),
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true },
  });

  const assets = join(outDir, 'assets');
  compiledCss = readdirSync(assets)
    .filter((entry) => entry.endsWith('.css'))
    .map((entry) => readFileSync(join(assets, entry), 'utf8'))
    .join('\n');
}, 300_000);

describe('the app CSS sees packages/ui (rule 1)', () => {
  it('compiles CSS at all', () => {
    // Sem isto todo `toContain` abaixo poderia estar comparando com string
    // vazia e falhando por um motivo, mas um build silenciosamente vazio
    // falharia por outro — e o vermelho mandaria olhar o lugar errado.
    expect(compiledCss.length).toBeGreaterThan(1000);
  });

  it('finds classes in packages/ui to check', () => {
    // Asserção vazia (§7.4): uma extração quebrada devolveria zero classes e o
    // teste seguinte ficaria verde provando NADA — que é exatamente o estado
    // que a regra 1 existe para acusar.
    const classes = classesUsedByUi();
    expect(classes.length).toBeGreaterThan(60);

    /*
      ⚠️ A LISTA ERA UMA SÓ E AFIRMAVA ALGO FALSO — a auditoria da Tarefa 41a
      mediu. O comentário dizia "classes que só existem em `packages/ui` e em
      lugar nenhum de `packages/app`: se o `@source` cair, estas são as
      primeiras a sumir", e isso já era **falso para duas das cinco**:
      `rounded-control` tem **14** ocorrências de produção em `packages/app/src`
      (13 classes + 1 menção em docblock de `chrome.tsx`) e `min-h-11` tem **8**.
      Se o `@source` caísse, as duas continuariam no CSS pelo lado do app.

      Uma sonda que promete exclusividade sem ter é pior que nenhuma: ela dá
      confiança de que a regra 1 está guardada por cinco classes quando ela está
      guardada por três. A lista foi PARTIDA em duas, com nomes honestos.
    */

    // ---------------------------------------------------------------- canárias
    /*
      Estas existem SÓ em `packages/ui` — e isso é AFIRMADO abaixo, não
      prometido em comentário. Se o `@source '../../ui/src'` do `styles.css`
      cair, elas somem do CSS e a regra 1 fica vermelha aqui.

      ⚠️ `border-leader` é a mais frágil das três DE PROPÓSITO, e está escrito
      para a Tarefa 44 não descobrir isso por acidente: ela é a classe do
      condutor do sumário, e no dia em que a tela do livro renderizar o
      `variant="sumario"` o app passa a escrevê-la. Quando isso acontecer, a
      asserção de exclusividade abaixo fica VERMELHA — e a saída é **mover
      `border-leader` para a lista de presença simples**, não apagar a
      asserção. Uma canária que vira presença simples continua útil; uma
      asserção apagada leva a propriedade embora.
    */
    const CANARIES = ['bg-person', 'text-person-fg', 'border-leader'];

    /*
      ⚠️ O LADO POSITIVO PRIMEIRO (§7.3), senão o laço abaixo é asserção vazia:
      um `appSourceRoot` errado, ou um `stripComments` que devolvesse string
      vazia, faria `usagesOutsideUi` devolver `[]` para SEMPRE — e as três
      canárias passariam provando nada, que é exatamente o defeito que esta
      rodada veio consertar.

      As duas sondas abaixo são as que a auditoria mediu como NÃO exclusivas.
      Contado por esta própria função: `rounded-control` em **10** arquivos de
      `packages/app/src` e `min-h-11` em **6**. (Por `grep` cru dão 10 e 7 — o
      sétimo do `min-h-11` é `chrome.tsx`, que só o cita dentro de um comentário
      de bloco, e comentário não pinta nada. É a diferença que o
      `stripComments` existe para fazer.)

      ⚠️ **O SEGUNDO NÚMERO SUBIU DE 5 PARA 6 NA TAREFA 47a, e o vermelho veio
      daqui** — não de quem escreveu a tela. A pílula de caneta de
      `highlight-fields.tsx` passou a escrever o piso de toque no próprio
      arquivo (antes ele só chegava lá pelo `TEXT_INPUT_CLASS`, que mora em
      `form-styles.ts`). Quem mexer numa tela e vir este número vermelho: some
      um, não apague a asserção — ela é o que prova que a extração ALCANÇA o
      `packages/app`, e uma sonda de contagem apagada leva a propriedade junto.
    */
    expect(usagesOutsideUi('rounded-control')).toHaveLength(10);
    expect(usagesOutsideUi('min-h-11')).toHaveLength(6);
    // E que o par de fronteira do regex funciona: `border-leader-future` não é
    // `border-leader`. Sem isto a canária mais frágil acusaria por um vizinho.
    expect(
      usagesOutsideUi('border-leader').concat(
        usagesOutsideUi('border-leader-future'),
      ),
    ).toEqual([]);

    for (const canary of CANARIES) {
      expect(classes).toContain(canary);
      // A propriedade que o comentário antigo só prometia.
      expect(usagesOutsideUi(canary)).toEqual([]);
    }

    // ------------------------------------------------------- presença simples
    /*
      Estas três `packages/ui` USA, e é só isso que se afirma. Elas não provam
      o `@source` (o app também as escreve), mas provam que a extração de
      classes deste arquivo alcança as TABELAS de `packages/ui`
      (`SIZE`/`VARIANT_CLASS` do `Button`, `FOCUS_RING`) — e essa é a metade que
      a rodada de correção da Tarefa 13 pagou para existir.
    */
    expect(classes).toContain('rounded-control');
    expect(classes).toContain('shadow-sheet');
    expect(classes).toContain('min-h-11');

    // ⚠️ OS DOIS UTILITÁRIOS DE UMA PALAVRA, um por varredura, e é aqui que a
    // correção do extrator se pina:
    //
    // - `invisible` (`button.tsx`) é a classe de que a REGRA 7 depende — é ela
    //   que reserva a largura do rótulo enquanto o botão carrega. A extração
    //   antiga NÃO a conferia: literal de um token só era isento por
    //   construção. Quem a cobre é a varredura por CONTEXTO (ela está dentro
    //   de um `cx(...)`);
    // - `border` (`VARIANT_CLASS.ghost`) a antiga conferia por acidente — o
    //   literal tem outras classes, e pertencer a uma lista isentava o token da
    //   exigência de separador. Com a regra uniforme ele se perderia; quem o
    //   cobre agora é `SINGLE_WORD_UTILITIES`, e é por isso que a lista existe.
    //
    // Um deles fora do conjunto significa que uma das duas metades morreu.
    expect(classes).toContain('invisible');
    expect(classes).toContain('border');

    // E o que NÃO pode entrar: valor de prop com cara de token.
    expect(classes).not.toContain('primary');
    expect(classes).not.toContain('lucide-react');
  });

  it('keeps the exemption list of library option values closed', () => {
    /*
      A lista de isenções não pode crescer sem alguém decidir: ela é a única
      porta por onde uma classe REAL que o Tailwind não gerou passaria sem
      vermelho. Duas guardas, e as duas medem coisas diferentes:

      1. a lista é exatamente esta (quem acrescentar tem de editar aqui, e
         explicar);
      2. cada entrada é MENCIONADA no código de `packages/ui` — uma isenção
         para um valor que ninguém usa mais é isenção pendurada, e ela
         isentaria um nome futuro sem ninguém reparar (mesmo raciocínio do
         `TOKENS_WITHOUT_LIGHT_DARK` de `theme-css.test.ts`).
    */
    expect([...LIBRARY_OPTION_VALUES]).toEqual(['bottom-start', 'text/plain']);

    const sources = uiSourceFiles(uiSourceRoot).map((path) =>
      readFileSync(path, 'utf8'),
    );
    for (const value of LIBRARY_OPTION_VALUES) {
      expect(sources.some((code) => code.includes(value))).toBe(true);
    }
  });

  it('emits every class packages/ui uses', () => {
    const missing = classesUsedByUi().filter(
      (className) => !compiledCss.includes(escapedSelector(className)),
    );

    // ⚠️ Falhou? São duas causas possíveis, nesta ordem:
    // 1. o `@source '../../ui/src'` de `styles.css` saiu, mudou de caminho ou
    //    o pacote mudou de pasta — e NADA de `ui/` tem estilo;
    // 2. um componente novo usa uma classe que o Tailwind não gera (nome
    //    errado, ou um token sem utilitário mapeado — regra 2).
    expect(missing).toEqual([]);
  });

  it('leaves no probe class behind in the shipped CSS', () => {
    // A sonda da medição da regra 1 foi removida do código e da prosa. Este
    // teste é o que garante que ela não voltou por descuido — e ele acusa as
    // DUAS formas de ela voltar em CÓDIGO DE PRODUÇÃO, porque no Tailwind as
    // duas viram CSS: a classe usada num componente e a classe citada num
    // comentário dele.
    expect(compiledCss).not.toContain('137px');
  });

  it('⚠️ ships no ARBITRARY COLOUR class at all — literal or merely mentioned', () => {
    /*
      ⚠️ **A GENERALIZAÇÃO DAS DUAS SONDAS NOMINAIS ACIMA** — pedida pela
      auditoria da Tarefa 25, e medida antes de entrar.

      As duas guardas vizinhas pinam sondas por NOME (`137px`, `min-h-10`):
      cada uma pega uma volta específica e nenhuma é geral. Esta é sobre uma
      PROPRIEDADE do CSS emitido, e por isso pega as duas formas de a cor
      arbitrária entrar — porque no Tailwind as duas viram CSS:

      1. a classe escrita num componente (`className="bg-[#b3261e]"`);
      2. a classe **citada num comentário** dele. Medido nesta rodada: o
         docblock de `pages/highlight-colors.tsx` mencionava um
         `bg-[<hex>]` literal só para dizer que ele seria acusado, e a menção
         compilava **41 bytes** de `.bg-\[\#facc15\]{background-color:#facc15}`
         no CSS de produção — onde a varredura de DOM de
         `pages/__tests__/anti-guilt-dom.ts` **nunca olha**, porque nenhum
         elemento usa a classe.

      Por que a família toda, e não só o vermelho: o `--color-*: initial` do
      `styles.css` mata a paleta padrão do Tailwind exatamente para que a cor
      fora do sistema não compile (o docblock dele conta a medição). A cor
      arbitrária é o último caminho que sobrou, e o `anti-guilt-dom.ts` já
      proíbe `text-[#`/`bg-[#` no DOM pelo mesmo motivo — esta é a mesma regra,
      um degrau antes, sobre o artefato que o navegador recebe.

      A cor dinâmica legítima (a amostra de grifo) NÃO cai aqui: ela é
      `[background-color:var(--swatch)]`, com o valor numa variável CSS — que é
      o padrão do projeto justamente por isso.
    */
    const arbitrary = [
      ...compiledCss.matchAll(/\.[a-z-]*-\\\[\\#[0-9a-fA-F]{3,8}\\\]/gu),
    ].map((match) => match[0]);

    expect(arbitrary).toEqual([]);
    // O lado positivo do par: o regex CASA de verdade. Sem isto, um padrão
    // quebrado devolveria `[]` para sempre e a guarda seria asserção vazia.
    expect(
      /\.[a-z-]*-\\\[\\#[0-9a-fA-F]{3,8}\\\]/u.test(
        '.bg-\\[\\#facc15\\]{background-color:#facc15}',
      ),
    ).toBe(true);
  });

  it('⚠️ ships the CSS of every map assembled from a key — the other direction', () => {
    /*
      ============================================================================
      O BURACO QUE ESTE TESTE FECHA, E ELE É DE DIREÇÃO
      ============================================================================

      ⚠️ **`emits every class packages/ui uses` é UNIDIRECIONAL.** Ele prova que
      toda classe ESCRITA virou CSS. Ele **não** prova — e não pode — que uma
      classe deixou de ser escrita: quando a lista de classes ENCOLHE, ele fica
      verde. "Nada a conferir" e "tudo conferido" são o mesmo resultado para
      ele.

      Medido na Tarefa 41b, com o mutante que troca o mapa literal de canetas
      do `GrifoText` por `` `bg-pen-${key}` ``: os dez seletores `.bg-pen-*` e
      `.ring-pen-*` **somem do CSS compilado** (32.891 B → 32.486 B, o grifo
      fica sem cor nenhuma na tela) e a suíte inteira deste arquivo continua
      **10/10 verde**. A razão é estrutural: os dois extratores (`classesFromContext`
      e `classesFromShape`) casam literais entre aspas simples e duplas, e um
      template literal fica entre CRASES.

      ⚠️ Há uma guarda de FONTE para o caso do grifo
      (`ui/src/components/__tests__/grifo-text.test.tsx › writes the pen→class
      map as LITERALS`), e ela é legítima — ali o texto do fonte É a entrada do
      compilador. Mas ela pega uma GRAFIA (`${`), e há outras: `concat`,
      `join`, um `Object.fromEntries` com `String.raw`, um mapa vindo de outro
      módulo. **Esta aqui pega qualquer uma**, porque ela não olha o fonte: ela
      olha o artefato que o navegador recebe.

      Os mapas pinados são os que pintam por CHAVE — os únicos em que a
      tentação de montar o nome existe. Se um mapa novo nascer com essa forma,
      ele entra aqui.
    */
    const porChave: Record<string, readonly string[]> = {
      // `GrifoText` — as cinco canetas, fundo e auréola da MESMA caneta.
      'grifo-text.tsx': [
        '.bg-pen-a',
        '.bg-pen-v',
        '.bg-pen-l',
        '.bg-pen-z',
        '.bg-pen-r',
        '.ring-pen-a',
        '.ring-pen-v',
        '.ring-pen-l',
        '.ring-pen-z',
        '.ring-pen-r',
      ],
      // `BookSpine` — os três tamanhos (`SIZE_CLASS`) e as duas paletas
      // (`PALETTE_CLASS`). ⚠️ Até esta rodada eles NÃO tinham acusador nenhum
      // para o mesmo mutante: o `GrifoText` ganhou a guarda de fonte e estes
      // ficaram de fora, que é a "correção incompleta" da lista da Tarefa 41a.
      'book-spine.tsx': [
        '.h-15',
        '.w-10\\.5',
        '.h-21',
        '.w-14\\.5',
        '.h-32',
        '.w-22',
        '.bg-spine',
        '.border-spine-edge',
        '.text-spine-fg',
        '.bg-spine2',
        '.border-spine2-edge',
        '.text-spine2-fg',
      ],
      // `PresenceMark` e `StreakSeal` — dois estados cada, pelo mesmo motivo.
      'presence-mark.tsx': ['.border-line-strong', '.bg-accent'],
      'streak-seal.tsx': [
        '.border-gold-line',
        '.bg-gold-soft',
        '.border-line-soft',
        '.bg-surface',
        '.stroke-gold',
        '.stroke-subtle',
      ],
    };

    const faltando = Object.entries(porChave).flatMap(([arquivo, seletores]) =>
      seletores
        .filter((seletor) => !compiledCss.includes(`${seletor}{`))
        .map((seletor) => `${arquivo}: ${seletor}`),
    );

    expect(faltando).toEqual([]);

    // O par positivo, e ele é o §7.4: sem esta linha um `compiledCss` vazio (ou
    // uma sonda com a grafia errada) devolveria `[]` para sempre.
    expect(compiledCss).not.toContain('.bg-pen-x{');
  });

  it('ships no class that only a test mentions', () => {
    /*
      ⚠️ O PAR DOS `@source not` DO `styles.css`, e a medição que os motivou.

      O Tailwind varre arquivo de teste como varre componente — e extrai classe
      de comentário. Medido: a lista `SINGLE_WORD_UTILITIES` acima (dado de
      teste!) emitia 1256 bytes de utilitários que nenhuma tela usa, e o
      `min-h-10` citado no comentário de
      `packages/ui/src/components/__tests__/styles.test.ts` — citado justamente
      para dizer que ele NÃO serve, porque 40px é abaixo do piso — gerava
      `.min-h-10` de verdade. Com os `@source not`, o CSS caiu de 17,8 kB para
      14,3 kB.

      `min-h-10` é a sonda perfeita para pinar isso: ela é NOMEADA em teste (em
      dois, contando este) e não existe em nenhum componente. Se ela reaparecer
      no CSS, os `@source not` caíram — e junto com eles voltam os 3,5 kB.
    */
    expect(compiledCss).toContain('.min-h-11{');
    expect(compiledCss).not.toContain('.min-h-10{');
  });
});

/**
 * O PISO DE 44px ANCORADO NO CSS COMPILADO — o fim da tautologia.
 *
 * ⚠️ MEDIDO na rodada de correção: `SPACING_STEP_PX` 4 → 8 sobrevivia aos 100
 * testes de `@clube/ui`. A razão é estrutural, não descuido: aquela constante é
 * a ÚNICA ponte entre "classe" (`min-h-11`) e "px" (44), jsdom não tem layout
 * para medir a altura de verdade, e os testes de `Button`/`ListItem` comparam
 * dois lados que leem a mesma constante. Um teste assim prova coerência
 * interna, e coerência interna é o que um mutante de uma linha preserva.
 *
 * A verdade está aqui, no CSS que o navegador vai receber:
 *
 *   :root { --spacing: .25rem }
 *   .min-h-11 { min-height: calc(var(--spacing) * 11) }
 *
 * Este bloco lê os dois e refaz a conta que os componentes assumem. É o único
 * teste do repositório que pode: é o único com o CSS compilado na mão.
 *
 * O outro lado do par — `MIN_TOUCH_TARGET_PX === 44` — mora em
 * `packages/ui/src/components/__tests__/styles.test.ts`, porque ele é uma
 * DECISÃO nossa (a decisão F), não um fato do Tailwind.
 */
describe('the 44px floor, measured against the compiled CSS (rule 9)', () => {
  /** `--spacing:.25rem` → 0.25. */
  function spacingRem(): number {
    const match = /--spacing:\s*(\d*\.?\d+)rem/u.exec(compiledCss);
    if (match?.[1] === undefined) {
      throw new Error('o CSS compilado não declara `--spacing` em rem');
    }
    return Number(match[1]);
  }

  /** `.min-h-11{min-height:calc(var(--spacing) * 11)}` → 11. */
  function spacingStepsOf(utility: string): number {
    const pattern = new RegExp(
      `\\.${utility}\\{min-height:calc\\(var\\(--spacing\\)\\s*\\*\\s*(\\d+)\\)\\}`,
      'u',
    );
    const match = pattern.exec(compiledCss);
    if (match?.[1] === undefined) {
      throw new Error(
        `o CSS compilado não tem \`.${utility}\` como calc(var(--spacing) * n)`,
      );
    }
    return Number(match[1]);
  }

  it('declares a spacing step worth exactly SPACING_STEP_PX', () => {
    // 1rem = 16px na raiz default, e é o que o `--spacing` do Tailwind assume.
    // ⚠️ ESTE É O ACUSADOR do mutante `SPACING_STEP_PX` 4 → 8: aqui o número
    // do TypeScript é confrontado com o CSS, não consigo mesmo.
    expect(spacingRem() * 16).toBe(SPACING_STEP_PX);
  });

  it('gives the button and the list row a real height above the floor', () => {
    // A conta refeita do lado do CSS: a classe que o componente escreve, o
    // passo que o Tailwind declara, e o piso que a decisão F fixa.
    for (const utility of ['min-h-11', 'min-h-13', 'min-h-14']) {
      expect(spacingStepsOf(utility) * SPACING_STEP_PX).toBeGreaterThanOrEqual(
        MIN_TOUCH_TARGET_PX,
      );
    }
  });

  it('would reject the class just below the floor', () => {
    // O lado NEGATIVO (§7.3): sem ele, um `MIN_TOUCH_TARGET_PX` zerado deixaria
    // o teste acima verde para qualquer altura. `min-h-10` = 40px reprova.
    expect(10 * SPACING_STEP_PX).toBeLessThan(MIN_TOUCH_TARGET_PX);
  });
});

/**
 * ⚠️⚠️ **`hidden` × `flex` — A INVARIANTE QUE SE APOIAVA EM ORDEM DE EMISSÃO E
 * NÃO ESTAVA PINADA EM LUGAR NENHUM.** Achado B5 da rodada de correção da
 * Tarefa 46.
 *
 * Toda margem responsiva do projeto é a MESMA colisão de utilitário: o
 * `MarginRail` traz `flex` na base e a tela passa `hidden`
 * (`acervo-filters.tsx`) ou o contrário. O `cx` **não é** `tailwind-merge` — é
 * decisão escrita em `packages/ui/src/cx.ts`, e a Tarefa 46 recusou um
 * `border-y-0` por causa dela. Então quem resolve a colisão não é a ordem do
 * código: é a ordem em que o Tailwind EMITE as regras, porque as três têm a
 * mesma especificidade (`0,1,0`) e `@media` não acrescenta nenhuma.
 *
 * Medido no CSS compilado desta build: `.flex{display:flex}` em **7099**,
 * `.hidden{display:none}` em **7118**, e o bloco
 * `@media (min-width:1120px)` com `.min-\[1120px\]\:flex` e
 * `.min-\[1120px\]\:hidden` em **21305**. A cascata funciona — mas funcionava
 * por um fato do Tailwind que nenhum teste afirmava, e quem lesse o código não
 * tinha como saber se o desenho era intencional ou sorte.
 *
 * ⚠️ **E ELE VALE A GUARDA porque o custo é zero e a falha é silenciosa:** se
 * a ordem invertesse, a margem do acervo ficaria `display:none` em TODA
 * largura — os seis controles sumiriam do desktop inteiro — e nenhum teste de
 * DOM veria, porque o `jsdom` não aplica media query. É exatamente o par que o
 * achado A1 desta mesma rodada mediu como **0 acusadores em 961**.
 */
describe('the hidden × flex cascade the responsive margins rely on (task 46, B5)', () => {
  /** Onde o CSS compilado emite uma regra, em bytes desde o começo. */
  function emittedAt(rule: string): number {
    const at = compiledCss.indexOf(rule);
    if (at < 0) throw new Error(`o CSS compilado não emite \`${rule}\``);
    return at;
  }

  it('emits .hidden AFTER .flex, so a base `hidden` beats a base `flex`', () => {
    // É o que faz `<MarginRail className="hidden …">` nascer escondido, apesar
    // de o `MarginRail` trazer `flex` na base e o `cx` não resolver conflito.
    expect(emittedAt('.hidden{display:none}')).toBeGreaterThan(
      emittedAt('.flex{display:flex}'),
    );
  });

  it('emits the 1120px variants AFTER the base ones, in both directions', () => {
    /*
      O par inteiro, e os dois sentidos importam:

      - `min-[1120px]:flex` depois de `.hidden` → a margem VOLTA acima do corte
        (sem isto o desktop perde os seis controles, em silêncio);
      - `min-[1120px]:hidden` depois de `.flex` → a FAIXA some acima do corte
        (sem isto haveria duas cópias dos controles, com `id` duplicado).
    */
    const base = emittedAt('.hidden{display:none}');
    const flex = emittedAt('.flex{display:flex}');

    expect(emittedAt('.min-\\[1120px\\]\\:flex{display:flex}')).toBeGreaterThan(
      base,
    );
    expect(
      emittedAt('.min-\\[1120px\\]\\:hidden{display:none}'),
    ).toBeGreaterThan(flex);
  });
});
