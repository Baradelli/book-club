import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * REGRA 6 DA TAREFA 27 — **O BURACO NÃO CRESCE.**
 *
 * O `CLAUDE.md` é explícito: *"Nenhum texto solto nas telas — tudo via
 * `t('chave')`"*. E `packages/ui` **não traduz** (decisão B da Tarefa 13, com
 * `no-i18n.test.ts` como acusador): aqui todo texto entra por **prop, já
 * traduzido pela tela**. As duas regras juntas dizem uma coisa só — nenhuma
 * string de interface cravada neste pacote.
 *
 * ⚠️ **E HOJE ELAS SÃO VIOLADAS, EM QUATRO ARQUIVOS.** A barra do editor é
 * **monolíngue mesmo com o app em inglês**: os rótulos vão para `aria-label` e
 * `title`, que é justamente o que o leitor de tela fala (é a classe medida na
 * Tarefa 15 — texto em atributo passa por teste que lê `textContent`).
 *
 * ⚠️ **A MEDIÇÃO, e ela DISCORDA da spec da Tarefa 27** (que diz "16 strings,
 * **todas** no `RichEditor`"). Contado por este arquivo, no commit desta fatia:
 *
 * | Arquivo | Ocorrências | Textos distintos |
 * |---|---|---|
 * | `components/RichEditor.tsx` | 18 | 16 |
 * | `components/slash-command.ts` | 13 | 13 |
 * | `components/MentionList.tsx` | 1 | 1 |
 * | `components/SlashMenu.tsx` | 1 | 1 |
 * | **total** | **33** | **24** (há repetição entre os dois primeiros) |
 *
 * Ou seja: o **16** da spec é o número de textos distintos do `RichEditor`, e
 * faltavam os doze itens do menu `/` mais o "Imagem" condicional
 * (`slash-command.ts`, que o próprio docblock dele assume em prosa — *"rótulos
 * em PORTUGUÊS no código"*) e os dois estados vazios dos popups. O buraco é
 * **o dobro** do que a spec media. A FAMÍLIA, porém, é a mesma: os quatro
 * arquivos são o editor e os dois popups dele, e o conserto é um só — um objeto
 * `labels` por prop, como o `FilterChip.label` já faz.
 *
 * ⚠️ **POR QUE NÃO SE CONSERTA AGORA, e a razão é boa.** A **pergunta 7** do
 * `docs/ACEITE-MVP.md` — ainda sem resposta — é *"manter o inglês?"*. Se o dono
 * responder **não**, o conserto certo é **apagar** o segundo catálogo, e as
 * ~48 entradas que esta fatia teria criado (24 chaves × 2 locales) seriam
 * trabalho na direção oposta à decisão dele. Fazer agora é apostar na resposta.
 *
 * Então o que esta guarda faz é **impedir o crescimento**, com duas asserções
 * que se completam:
 *
 * 1. **a contagem só pode CAIR** (`toBeLessThanOrEqual`) — uma asserção que
 *    descreve a verdade e morde, na forma da "exatamente 1 linha vermelha" da
 *    Tarefa 25; e
 * 2. **nenhuma string fora dos quatro arquivos do editor** — que é o que faz o
 *    componente novo (o `FilterBar` desta fatia) **não poder** acrescentar a
 *    próxima. Sozinha, a contagem deixaria trocar um rótulo do editor por um da
 *    barra de filtro sem uma linha vermelha.
 *
 * ⚠️ **E O EXTRATOR TEM DE SER FALSIFICÁVEL ELE MESMO** (§7.4 escrito como
 * varredura de fonte): um regex quebrado devolveria zero e as duas asserções
 * ficariam verdes provando nada. Daí o lado positivo — os textos que ele SABE
 * que existem — e o teste sintético, que prova que ele pega uma string NOVA nas
 * duas formas (atributo e filho de JSX).
 */
const sourceRoot = resolve(process.cwd(), 'src');

/**
 * Só o que VAI para o app — a mesma isenção de `no-i18n.test.ts` e de
 * `adr-0002-iconography.test.ts`: um arquivo de teste crava português de
 * propósito (rótulo de fixture), e nada em `__tests__/` embarca no PWA.
 *
 * ⚠️ **TERCEIRA CÓPIA DESTE PAR (`sourceFiles` + `stripComments`) NO PACOTE, e
 * fica REGISTRADA, não consertada.** O §7.1 manda extrair na terceira
 * aparição — e aqui isso mudaria o que as duas guardas existentes leem: a de
 * i18n isenta `test-setup.ts` e a do ADR 0002 **não**. Unificar as três é mexer
 * na superfície de duas guardas fechadas, fora desta fatia; quem reabrir uma
 * delas extrai as duas funções para um módulo de `__tests__/` (que não é
 * varrido, porque `__tests__` está isento).
 */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (entry === '__tests__') return [];

    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (entry === 'test-setup.ts') return [];
    return /\.tsx?$/u.test(entry) ? [path] : [];
  });
}

/**
 * Comentário não é código — e aqui isso DECIDE a varredura: este pacote explica
 * as regras em prosa, e os docblocks citam rótulos entre aspas. Sem remover os
 * comentários, a documentação da regra entraria na conta dela.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

/**
 * As TRÊS formas pelas quais texto de interface entra num componente sem passar
 * por prop.
 *
 * 1. **atributo ou propriedade que CARREGA TEXTO**, com string literal. A lista
 *    é a do `readableText()` do app (`harness.tsx`, §7.6.1 — o `aria-label` é o
 *    que o leitor de tela fala) mais o `label`, que é o nome da prop de texto
 *    em todo componente daqui, e o `title`, que é o do item do menu `/`;
 * 2. **filho de JSX**, o texto solto entre `>` e `<`;
 * 3. ⚠️ **`const` de prosa**, que é a terceira forma e nasceu de uma medição
 *    desta rodada de correção.
 *
 * ⚠️ **O `\{?` DO PRIMEIRO PADRÃO E O TERCEIRO PADRÃO SÃO DUAS FUGAS MEDIDAS**,
 * as duas escritas sem má-fé por qualquer pessoa, as duas com `eslint`,
 * `prettier --check` e `tsc` **verdes**, e as duas dando **0 acusadores** na
 * primeira versão desta guarda:
 *
 * - `title={'Filtrar por pessoa'}` — literal entre chaves. ⚠️ E o Prettier
 *   **não** normaliza `={'x'}` para `="x"` (medido nesta rodada), então não há
 *   ninguém a jusante para consertar a forma;
 * - `const CLEAR_LABEL = 'Limpar o filtro'` + `title={CLEAR_LABEL}` — o texto
 *   sai do atributo e vira constante de módulo.
 *
 * Era a classe §7.9 na sua forma mais perigosa: a guarda dando **sensação** de
 * cobertura sobre a única coisa que impede o buraco de crescer enquanto a
 * pergunta 7 do `docs/ACEITE-MVP.md` não é respondida.
 *
 * ⚠️ O `[^=]` antes do `>` no segundo padrão existe por medição: sem ele, o `>`
 * de uma arrow function casava, e `Promise<void>` / `Record<'--swatch',
 * string>` entravam na conta como "texto de interface" — três falsos positivos
 * que inflariam o teto e o tornariam mentira.
 */
const TEXT_ATTRIBUTE =
  /\b(?:label|title|aria-label|aria-valuetext|placeholder|alt)\s*[=:]\s*\{?\s*(?:'([^']*)'|"([^"]*)")/gu;
const JSX_TEXT_CHILD = /[^=]>\s*([A-Za-zÀ-ÿ][^<>{}\n]{0,80}?)\s*</gu;
const CONST_STRING =
  /\bconst\s+\w+\s*(?::[^=\n]+)?=\s*(?:'([^']*)'|"([^"]*)")/gu;

/**
 * ⚠️ **A HEURÍSTICA DE PROSA, E O FALSO POSITIVO QUE ELA EVITA.**
 *
 * O terceiro padrão pega TODA `const` de string, e a maioria das deste pacote é
 * legítima: nome de classe do Tailwind (`FOCUS_RING`, `SCROLL_LOCK_CLASS`,
 * `LIST_ITEM_HEIGHT_CLASS`), nome de extensão do TipTap (`CALLOUT_TYPE`,
 * `IMAGE_UPLOAD_NAME`), chave de `storage`. Contá-las inflaria o teto e o
 * tornaria mentira — o defeito do §7.9 pela outra ponta.
 *
 * O que separa as duas é a FORMA do texto, não o nome da constante: prosa
 * começa com **maiúscula** e tem **espaço ou acento**. Nome de classe e
 * identificador são minúsculos, ou colados, ou os dois. Medido nesta rodada: as
 * `const` de string de `ui/src` inteiro dão **zero** falso positivo, e os dois
 * plantes de prosa acusam.
 *
 * Se um dia uma prosa legítima em minúsculas aparecer aqui (ou uma classe com
 * maiúscula e espaço), **meça antes de afrouxar** — a lição da Tarefa 19 é que
 * uma guarda larga demais passa a mandar no produto, e uma frouxa demais não
 * guarda nada.
 */
function looksLikeProse(value: string): boolean {
  return /^[A-ZÀ-Þ]/u.test(value) && /[\sÀ-ſ]/u.test(value);
}

function hardcodedTextIn(code: string): string[] {
  const clean = stripComments(code);
  const found: string[] = [];

  for (const match of clean.matchAll(TEXT_ATTRIBUTE)) {
    const value = match[1] ?? match[2];
    if (value !== undefined && value !== '') found.push(value);
  }
  for (const match of clean.matchAll(JSX_TEXT_CHILD)) {
    const value = match[1];
    if (value !== undefined) found.push(value);
  }
  for (const match of clean.matchAll(CONST_STRING)) {
    const value = match[1] ?? match[2];
    if (value !== undefined && looksLikeProse(value)) found.push(value);
  }

  return found;
}

const files = sourceFiles(sourceRoot).map((path) => ({
  path,
  texts: hardcodedTextIn(readFileSync(path, 'utf8')),
}));

/**
 * ⚠️ **O TETO, EM OCORRÊNCIAS, E ELE SÓ PODE CAIR.**
 *
 * 33 é a medição desta fatia (a tabela do topo). Em ocorrências e não em textos
 * distintos porque é a contagem que morde: dois rótulos iguais em dois arquivos
 * são dois lugares para consertar.
 *
 * **Baixou? Baixe este número junto** — um teto folgado é um teto que não
 * guarda nada. **Subiu?** Não é aqui que se conserta: ou o texto vira prop, ou
 * a resposta da pergunta 7 do `docs/ACEITE-MVP.md` chegou e o conserto é o
 * `labels` por prop, nos quatro arquivos de uma vez.
 */
const HARDCODED_TEXT_BUDGET = 33;

/**
 * Os quatro arquivos onde a dívida mora — o editor e os dois popups dele.
 *
 * É a lista de ISENTOS, e ela é fechada: qualquer outro arquivo de `ui/src` com
 * texto cravado reprova. Um arquivo novo aqui é uma decisão do dono, não um
 * acidente de fatia.
 */
const EDITOR_FILES: readonly string[] = [
  'RichEditor.tsx',
  'slash-command.ts',
  'SlashMenu.tsx',
  'MentionList.tsx',
];

function offenders(): string[] {
  return files
    .filter(
      ({ path, texts }) =>
        texts.length > 0 && !EDITOR_FILES.some((name) => path.endsWith(name)),
    )
    .map(({ path, texts }) => `${path}: ${texts.join(' · ')}`);
}

describe('@clube/ui crava nenhum texto de interface novo (rule 6 of task 27)', () => {
  it('reads the sources it claims to scan, the new component included', () => {
    // Sem isto tudo abaixo é asserção vazia (§7.4): um `sourceRoot` errado
    // devolve zero arquivos, e um teto de 33 passa com nada dentro.
    const scanned = files.map(({ path }) => path);

    expect(scanned.length).toBeGreaterThan(8);
    for (const file of [
      'filter-bar.tsx',
      'filter-chip.tsx',
      'RichEditor.tsx',
      'slash-command.ts',
      'SlashMenu.tsx',
      'MentionList.tsx',
    ]) {
      expect(scanned.some((path) => path.endsWith(file))).toBe(true);
    }
  });

  it('sees the hardcoded text it claims to count', () => {
    /*
      O LADO POSITIVO (§7.3), e ele é o que impede o resto de ser teatro: um
      regex quebrado devolveria zero, o teto passaria e a lista de isentos
      ficaria vazia — verde, provando nada.

      As quatro amostras são de arquivos diferentes e de FORMAS diferentes: um
      `label=` de JSX, um `label:` de objeto, um `title:` de objeto e dois
      filhos de JSX.
    */
    const all = files.flatMap(({ texts }) => texts);

    expect(all).toContain('Negrito'); // label= no RichEditor
    expect(all).toContain('Grifo amarelo'); // label: da paleta
    expect(all).toContain('Imagem'); // title: do menu `/`
    expect(all).toContain('Nenhuma anotação'); // filho de JSX no MentionList
    expect(all).toContain('Nenhum bloco'); // filho de JSX no SlashMenu
    expect(all.length).toBeGreaterThan(30);
  });

  it('⚠️ pins the count, and it can only FALL', () => {
    const total = files.reduce((sum, { texts }) => sum + texts.length, 0);

    expect(total).toBeLessThanOrEqual(HARDCODED_TEXT_BUDGET);
  });

  it('⚠️ keeps every hardcoded string inside the EDITOR, and nowhere else', () => {
    /*
      ⚠️ **É ESTA que impede o componente novo de acrescentar a próxima.** O
      teto sozinho deixaria trocar um rótulo do editor por um da barra de filtro
      sem uma linha vermelha — e a dívida do editor tem uma razão registrada
      (pergunta 7 do `docs/ACEITE-MVP.md`), que um texto cravado num componente
      novo não tem.
    */
    expect(offenders()).toEqual([]);
  });

  it('would catch a NEW hardcoded label, in ALL FIVE shapes', () => {
    /*
      O extrator tem de ser falsificável ele mesmo: as asserções acima olham o
      código que EXISTE, e um regex que só casasse aquelas formas exatas
      deixaria passar a forma que alguém escrever amanhã.
    */
    expect(hardcodedTextIn('<FilterChip label="Filtrar" />')).toEqual([
      'Filtrar',
    ]);
    expect(hardcodedTextIn("const item = { title: 'Pessoa' };")).toEqual([
      'Pessoa',
    ]);
    expect(hardcodedTextIn('<span>Nenhuma pessoa</span>')).toEqual([
      'Nenhuma pessoa',
    ]);
    expect(hardcodedTextIn('<button aria-label="Fechar" />')).toEqual([
      'Fechar',
    ]);

    /*
      ⚠️ **AS DUAS FUGAS MEDIDAS NESTA RODADA** — as duas davam 0 acusadores, e
      as duas passam por `eslint`, `prettier --check` e `tsc` sem uma objeção. O
      Prettier em particular **não** normaliza `={'x'}` para `="x"`: não há
      ninguém a jusante para consertar a forma.
    */
    expect(hardcodedTextIn("<button title={'Filtrar por pessoa'} />")).toEqual([
      'Filtrar por pessoa',
    ]);
    expect(hardcodedTextIn("const CLEAR_LABEL = 'Limpar o filtro';")).toEqual([
      'Limpar o filtro',
    ]);
    // Com anotação de tipo no meio, que é como este pacote declara as tabelas.
    expect(hardcodedTextIn("const CLEAR: string = 'Limpar o filtro';")).toEqual(
      ['Limpar o filtro'],
    );
  });

  it('⚠️ accuses no legitimate string — the prose heuristic is measured, not chosen by taste', () => {
    /*
      ⚠️ O OUTRO LADO DA MOEDA, e ele é o §7.9 pela ponta oposta: um extrator
      largo demais infla o teto com nome de classe do Tailwind e nome de
      extensão do TipTap, e aí o número deixa de significar "texto cravado". As
      quatro primeiras são `const` que EXISTEM neste pacote.
    */
    for (const legitimate of [
      "const FOCUS_RING = 'outline-hidden focus-visible:outline-2';",
      "const SCROLL_LOCK_CLASS = 'overflow-hidden';",
      "const LIST_ITEM_HEIGHT_CLASS = 'min-h-14';",
      "const CALLOUT_TYPE = 'callout';",
      "const SIZE = 'sm';",
      // Texto que entra por PROP — o jeito certo, e o mais importante de não
      // acusar: é ele que a decisão B da Tarefa 13 manda usar.
      '<FilterChip label={option.label} />',
      '<FilterChip label={labels.bold} />',
      // E genéricos de TypeScript, que o `[^=]` do segundo padrão já cobria.
      'const f = (): Promise<void> => Promise.resolve();',
    ]) {
      expect(hardcodedTextIn(legitimate)).toEqual([]);
    }
  });
});
