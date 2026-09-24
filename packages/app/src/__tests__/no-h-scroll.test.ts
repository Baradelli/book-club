import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * ============================================================================
 * 360 px SEM ROLAGEM HORIZONTAL — a decisão D da Tarefa 48, nas quinze telas
 * ============================================================================
 *
 * É critério de aceite do MVP 3.5 inteiro (`docs/BACKLOG.md`, decisões
 * fechadas: *"nenhuma rolagem horizontal em 360 px"*) e nunca teve guarda.
 *
 * ⚠️⚠️ **A FORMA ÓBVIA É A ASSERÇÃO QUE SE AUTOAJUSTA DO §7.8 — MEDIDO, NÃO
 * SUPOSTO.** `expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth)`
 * parece a guarda certa e é **vazia**: o jsdom não tem motor de layout, e
 * devolve `0` para `scrollWidth`, `clientWidth`, `offsetWidth` e para todo
 * campo de `getBoundingClientRect()`. Medido com uma sonda nesta fatia, numa
 * `<div style="width:800px">`:
 *
 * ```
 * scrollWidth 0   clientWidth 0   offsetWidth 0
 * getBoundingClientRect {"width":0,"height":0,…}
 * ```
 *
 * Ou seja: `0 <= 0`. A asserção fica verde para toda tela, em todo estado,
 * **inclusive com um elemento de 800 px dentro** — os dois lados vêm do mesmo
 * motor ausente. É exatamente a classe de defeito que a spec antecipa
 * ("a guarda pode estar comparando duas grandezas que encolhem juntas").
 *
 * ⚠️ **ONDE A PROPRIEDADE É DECIDÍVEL (§7.9 e §7.10).** O que faz uma tela
 * rolar de lado em 360 px é um elemento com LARGURA FIXA maior que a janela —
 * e isso está escrito no fonte, não no layout: um utilitário de largura do
 * Tailwind, ou uma declaração `width`/`min-width` de CSS. Essa superfície o
 * jsdom não precisa medir: ela se lê.
 *
 * ⚠️⚠️ **O QUE ELA COBRE, E O QUE NÃO COBRE — e a primeira versão desta prosa
 * dizia "TOTAL, por construção", que era a palavra errada.** Ela cobre as
 * quinze telas e os componentes que elas montam **sem** depender de alguém
 * lembrar de renderizar o estado novo (a lição do §7.9, ao contrário da
 * varredura anti-culpa, que precisa do DOM porque mede texto renderizado).
 * Mas "total" declarava **uma** limitação e tinha **três**, e a rodada de
 * correção mediu duas com mutante:
 *
 * | escapava | por quê | hoje |
 * | --- | --- | --- |
 * | `w-[50rem]` (= 800 px) | os três padrões só entendiam **`px`** | ✅ converte `px`, `rem`, `em`, `vw` e `ch` |
 * | `size-96` (= 384 px) | a varredura lia `w-`/`min-w-`, e **`size-N` define largura** — este projeto o usa (`size-14` na tela 404, `size-5` no interruptor) | ✅ `size-` e `basis-` entram no alvo |
 * | uma palavra longa sem espaço vinda do conteúdo do clube | não há largura fixa nenhuma para ler: o estouro é do texto | ❌ **continua fora**, e a defesa é o `overflow-wrap: break-word` que o `editor.css` declara — provar o estouro exige navegador de verdade |
 *
 * As duas primeiras linhas são o motivo de a palavra "total" ter saído: uma
 * varredura que se declara completa é a que ninguém volta a medir.
 */

/** A janela mais estreita que o projeto promete atender. */
const NARROW_VIEWPORT_PX = 360;

/** O passo da escala de espaçamento do Tailwind: `w-44` é 44 × 4 = 176 px. */
const SPACING_STEP_PX = 4;

/**
 * ⚠️ **AS UNIDADES, e a primeira versão desta varredura entendia só `px`** —
 * medido: `w-[50rem]` são **800 px** e passavam com zero acusadores.
 *
 * `rem` e `em` valem 16 px porque é o tamanho de raiz do navegador, que este
 * projeto não muda (`styles.css` não redeclara `font-size` no `html`). `vw` se
 * resolve contra a própria janela estreita — `w-[100vw]` são exatamente 360 px
 * e não estouram; `w-[150vw]`, sim. `ch` é APROXIMADO em 8 px (a largura do
 * `0` da fonte de interface em 15px), e a aproximação está escrita porque ela
 * é o único número aqui que depende da fonte.
 */
const UNIT_PX: Readonly<Record<string, number>> = {
  px: 1,
  rem: 16,
  em: 16,
  vw: NARROW_VIEWPORT_PX / 100,
  ch: 8,
};

/** As unidades, para dentro de um padrão — `px|rem|em|vw|ch`. */
const UNITS = Object.keys(UNIT_PX).join('|');

/**
 * ⚠️ **O QUE PRENDE LARGURA, e `w-`/`min-w-` não é a lista inteira.** Medido
 * na rodada de correção: `size-96` são 384 px de largura (e de altura) e a
 * varredura não o via, num projeto que escreve `size-*` em dezenas de lugares.
 * `basis-*` idem, dentro de um flex.
 *
 * ⚠️ **`max-w-` NÃO ENTRA e nunca pode entrar** — ele é o contrário de um
 * estouro. O `-` antes do `w` é o que o mantém fora: o padrão recusa um nome
 * de utilitário colado em letra ou hífen à esquerda.
 */
const WIDTH_UTILITIES = '(?:min-w|w|size|basis)';

/**
 * As variantes de largura MÍNIMA que o projeto escreve, e o px em que cada uma
 * acende. Um utilitário atrás de uma delas nunca vale em 360 px.
 *
 * ⚠️ É por VARIANTE e não por valor: `min-[1120px]:w-[680px]` são 680 px de
 * largura fixa, e ele está certo — a coluna de leitura do desktop. Quem decide
 * não é o tamanho do número, é a condição em que ele acende.
 */
const MIN_WIDTH_VARIANTS: Readonly<Record<string, number>> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

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

/**
 * O px em que a variante de um utilitário acende, ou `0` quando ele vale
 * sempre. `min-[1120px]:` é lido do próprio nome; as nomeadas vêm da tabela.
 */
function guardedFrom(className: string): number {
  const variants = className.split(':').slice(0, -1);
  let widest = 0;

  for (const variant of variants) {
    const arbitrary = /^min-\[(\d+)px\]$/u.exec(variant);
    if (arbitrary?.[1] !== undefined) {
      widest = Math.max(widest, Number(arbitrary[1]));
      continue;
    }
    const named = MIN_WIDTH_VARIANTS[variant];
    if (named !== undefined) widest = Math.max(widest, named);
  }

  return widest;
}

export interface WideThing {
  where: string;
  what: string;
  px: number;
}

/**
 * Tudo o que prende uma largura maior que a janela estreita, e vale nela.
 *
 * ⚠️ **`max-width` NÃO ENTRA, e a primeira versão desta função o incluía por
 * descuido de regex** (`(?:min-)?width:` casa o `width:` de dentro de
 * `max-width:`). Um `max-width: 620px` é o oposto de um estouro — ele é o que
 * impede a linha de crescer. Medido: o `editor.css` tem três, e os três
 * viravam falso positivo.
 *
 * ⚠️ E `@media (min-width: 1120px)` também não: ali o `min-width` é CONDIÇÃO,
 * não propriedade. É o mesmo tipo de confusão, do outro lado.
 */
export function widerThanTheViewport(sources: Source[]): WideThing[] {
  const found: WideThing[] = [];

  for (const { path, text } of sources) {
    const source = withoutComments(text);

    // 1 · utilitário com largura arbitrária: `w-[680px]`, `min-w-[50rem]`.
    const arbitrary = new RegExp(
      `(?<![\\w-])((?:[\\w[\\]#./-]+:)*${WIDTH_UTILITIES}-\\[(\\d+(?:\\.\\d+)?)(${UNITS})\\])`,
      'gu',
    );
    for (const match of source.matchAll(arbitrary)) {
      const [, className = '', value = '0', unit = 'px'] = match;
      const px = Number(value) * (UNIT_PX[unit] ?? 1);
      if (px <= NARROW_VIEWPORT_PX) continue;
      if (guardedFrom(className) > NARROW_VIEWPORT_PX) continue;
      found.push({ where: path, what: className, px });
    }

    // 2 · utilitário da escala: `w-96` e `size-96` são 384 px.
    const scale = new RegExp(
      `(?<![\\w-])((?:[\\w[\\]#./-]+:)*${WIDTH_UTILITIES}-(\\d+))(?![\\w[./-])`,
      'gu',
    );
    for (const match of source.matchAll(scale)) {
      const [, className = '', steps = '0'] = match;
      const px = Number(steps) * SPACING_STEP_PX;
      if (px <= NARROW_VIEWPORT_PX) continue;
      if (guardedFrom(className) > NARROW_VIEWPORT_PX) continue;
      found.push({ where: path, what: className, px });
    }

    // 3 · CSS cru: `width: 420px` e `min-width: 50rem`, nunca `max-width`.
    const declaration = new RegExp(
      `(?<!-)\\b(min-width|width)\\s*:\\s*(\\d+(?:\\.\\d+)?)(${UNITS})`,
      'u',
    );
    for (const line of source.split('\n')) {
      if (line.includes('@media')) continue;
      const match = declaration.exec(line);
      if (match?.[2] === undefined) continue;
      const px = Number(match[2]) * (UNIT_PX[match[3] ?? 'px'] ?? 1);
      if (px <= NARROW_VIEWPORT_PX) continue;
      found.push({ where: path, what: match[0], px });
    }
  }

  return found;
}

describe('⚠️ 360 px sem rolagem horizontal (decisão D, Tarefa 48)', () => {
  it('⚠️ pins nothing wider than the narrow viewport, in any of the fifteen screens', () => {
    expect(widerThanTheViewport(appAndUiSources())).toEqual([]);
  });

  it('⚠️ and it BITES — the positive pair, before the sweep is believed', () => {
    /*
      ⚠️ **SEM ESTA METADE A VARREDURA ACIMA É UMA TABELA VERDE.** Ela nasceu
      verde contra a implementação (nada no projeto prende largura maior que
      360 px), então o vermelho dela é o do mutante — e o mutante tem de estar
      escrito, não prometido.

      Os jeitos de trazer o estouro de volta, cada um plantado e cada um
      acusado.

      ⚠️ **OS DOIS ÚLTIMOS PASSAVAM até a rodada de correção**, e os dois são o
      caminho mais curto de volta: `w-[50rem]` são 800 px escritos em outra
      unidade, e `size-96` são 384 px escritos em outro utilitário — um que
      este projeto usa de verdade.
    */
    const planted: Source[] = [
      { path: 'tela-inventada.tsx', text: '<div className="w-[800px]" />' },
      { path: 'tela-inventada.tsx', text: '<div className="min-w-[420px]" />' },
      { path: 'tela-inventada.tsx', text: '<div className="w-96" />' },
      { path: 'folha-inventada.css', text: '.faixa { min-width: 900px; }' },
      { path: 'tela-inventada.tsx', text: '<div className="w-[50rem]" />' },
      { path: 'tela-inventada.tsx', text: '<div className="size-96" />' },
      { path: 'tela-inventada.tsx', text: '<div className="basis-[30em]" />' },
      { path: 'tela-inventada.tsx', text: '<div className="min-w-[150vw]" />' },
      { path: 'folha-inventada.css', text: '.faixa { width: 50rem; }' },
    ];

    for (const source of planted) {
      expect(widerThanTheViewport([source])).toHaveLength(1);
    }
  });

  it('⚠️ and it does NOT bite what the desktop guards — the other half of the pair', () => {
    /*
      A metade que impede o conserto fácil (alargar a varredura até ela pegar
      tudo). A coluna de leitura de 680 px e a margem de 320 px são o desenho
      do canvas acima de 1120 px, e o `max-width` do editor é o contrário de um
      estouro. Se a varredura acusasse os três, o próximo leitor a desligaria.
    */
    const legit: Source[] = [
      {
        path: 'reading-column.tsx',
        text: '<div className="min-[1120px]:w-[680px] min-[1120px]:w-80" />',
      },
      { path: 'plan-editor.tsx', text: '<div className="sm:w-[500px]" />' },
      { path: 'editor.css', text: '.corpo { max-width: 620px; }' },
      { path: 'editor.css', text: '@media (min-width: 1120px) { }' },
      // ⚠️ As unidades novas não podem alargar o alvo: `max-w-[50rem]` é o
      // mesmo contrário de estouro que o `max-width` de cima.
      { path: 'tela.tsx', text: '<div className="max-w-[50rem]" />' },
      { path: 'editor.css', text: '.corpo { max-width: 40rem; }' },
      // 100vw é exatamente a janela estreita: encosta, não estoura.
      { path: 'tela.tsx', text: '<div className="w-[100vw]" />' },
      // E `size-14` (56px) é o glifo da 404 — a escala pequena não é alvo.
      { path: 'not-found.tsx', text: '<svg className="size-14" />' },
    ];

    expect(widerThanTheViewport(legit)).toEqual([]);
  });

  it('reads the screens themselves, not some other folder', () => {
    /*
      ⚠️ O pino que impede a varredura de ficar verde por estar lendo o lugar
      errado — a lição do `pageSource` do `chrome.test.tsx`. Se o caminho
      quebrar, `sourcesUnder` devolve pouca coisa e a guarda acima fica verde
      sem ter olhado nada.
    */
    const paths = appAndUiSources().map(({ path }) => path);

    expect(paths.length).toBeGreaterThan(60);
    expect(paths.some((path) => path.endsWith('login.tsx'))).toBe(true);
    expect(paths.some((path) => path.endsWith('preferencias.tsx'))).toBe(true);
    expect(paths.some((path) => path.endsWith('not-found.tsx'))).toBe(true);
    expect(paths.some((path) => path.endsWith('accept-invite.tsx'))).toBe(true);
    expect(paths.some((path) => path.endsWith('reading-column.tsx'))).toBe(
      true,
    );
  });
});
