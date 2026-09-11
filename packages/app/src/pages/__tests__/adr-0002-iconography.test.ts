import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PRIVACY_TERMS } from './adr-0002-dom';
import { withoutDiacritics } from './harness';

/**
 * ⚠️ **O ADR 0002 CONTRA O DESENHO — a metade que faltava no `app`** (achado da
 * rodada de correção da Tarefa 25).
 *
 * `docs/adr/0002-visibilidade-total-no-clube.md`: dentro do clube não existe
 * conteúdo privado. Um cadeado ensinaria uma regra que o sistema não tem, e
 * quem acreditasse nele escreveria pensando que ninguém vai ler.
 *
 * ⚠️ **A LACUNA ESTAVA DECLARADA NA PROSA E NUNCA FECHADA, e é a lição nº 5 do
 * MVP 1 na forma mais literal.** O docblock de `./adr-0002-dom.ts` dizia, com
 * todas as letras, que *"um cadeado desenhado à mão numa tela do app
 * **passaria** por esta função"*, e delegava para
 * `packages/ui/src/__tests__/adr-0002-iconography.test.ts` — que varre **só
 * `packages/ui`**. A dívida foi assumida quando as telas do `app` não mostravam
 * autoria por linha. A Tarefa 25 passou a mostrar (e a 27 põe um filtro por
 * pessoa em cima), e a auditoria mediu o preço: um `Lock` do `lucide-react`
 * **e** um `<svg>` cru com `path` de cadeado em toda linha do acervo davam
 * **0 acusadores em 508 testes**.
 *
 * ⚠️ **E ELE NÃO MORA NO `ui-source-scan.test.ts`, apesar de a instrução pedir
 * isso — a premissa é falsa e está medida.** Aquele arquivo lê
 * `resolve(process.cwd(), '..', 'ui', 'src')` (a linha 50 dele), ou seja
 * `packages/ui/src`, **não** `packages/app/src`; e ele roda um build de Vite
 * de verdade (~6 s, o único do repositório). Pendurar uma varredura de FONTE
 * ali a faria pagar o build e ficaria sob um `describe` cujo assunto é "o CSS
 * do app vê o `packages/ui`". Aqui o arquivo tem o nome do ADR e espelha o de
 * `ui/`, que é onde o próximo leitor vai procurar.
 *
 * As duas metades, e a segunda é a que fecha o buraco de verdade:
 *
 * - a lista de termos (a MESMA de `./adr-0002-dom.ts`, não uma cópia), sobre
 *   `packages/app/src` inteiro;
 * - **nenhum `<svg>` inline nas telas.** Com todo ícone vindo do
 *   `lucide-react` (`CLAUDE.md`), o glifo passa a ter NOME — `<Lock />` cai na
 *   varredura de termos, `<path d="M8 11V7a4 4 0 0 1 8 0v4" />` não cairia
 *   nunca. É a mesma medição que a Tarefa 13 fez em `ui/`.
 */

// `process.cwd()` e não `import.meta.url`: no ambiente jsdom do Vitest o módulo
// não tem URL de arquivo, e o `fileURLToPath` estoura. Molde:
// `packages/ui/src/__tests__/adr-0002-iconography.test.ts`.
const sourceRoot = resolve(process.cwd(), 'src');

/**
 * Só o que VAI para o PWA. `__tests__/` fica de fora, e não por conveniência:
 * este arquivo consome a lista de termos proibidos como DADO, então uma
 * varredura que se incluísse acusaria a si mesma.
 */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (entry === '__tests__') return [];

    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(entry) ? [path] : [];
  });
}

/**
 * Comentário não é código — e aqui isso DECIDE o teste: os docblocks das telas
 * explicam a regra citando "cadeado", "privado" e "só você vê" em prosa, para
 * dizer que eles NÃO entram. Sem remover os comentários, a varredura acusaria a
 * própria documentação da regra que ela protege (§7.1).
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

const files = sourceFiles(sourceRoot).map((path) => ({
  path,
  code: stripComments(readFileSync(path, 'utf8')),
}));

/**
 * Os NOMES do `lucide-react` que ensinam a regra errada.
 *
 * Eles não estão em `PRIVACY_TERMS` de propósito: aquela lista é o vocabulário
 * **falado** (é ela que a varredura de DOM usa, onde `Lock` nunca aparece), e
 * esta é a iconografia **importada**. Radicais e ancorados à esquerda, como lá.
 *
 * `unlock` e `eyeclos` têm entrada própria porque a âncora `\b` não os pegaria
 * por dentro de `lock`/`eye-off` — é a mesma medição de `ui/`.
 */
const FORBIDDEN_ICONS = [
  'lock',
  'unlock',
  'eye-off',
  'eyeoff',
  'eye_off',
  'eyeclos',
  'shield',
] as const;

/**
 * ⚠️ ANCORADO À ESQUERDA, e por medição — a mesma de `ui/`: um `includes` cru
 * acusa `blocked`, `SCROLL_LOCK_CLASS`, `block` e `clock`, que são
 * identificadores legítimos. Com a âncora, `<Lock />` e `LockKeyhole` continuam
 * pegos e o radical no MEIO de uma palavra passa.
 *
 * Sem âncora à DIREITA, para o radical pegar o plural e as variações.
 */
function mentions(code: string, term: string): boolean {
  // Sem o `-` na classe de escape: `\-` é escape INVÁLIDO no modo `u`, e o
  // termo `eye-off` derrubava a suíte por erro de regex, não por achado.
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`\\b${escaped}`, 'u').test(code.toLowerCase());
}

describe('no privacy iconography anywhere in @clube/app (ADR 0002)', () => {
  it('reads the whole app source, the collection and the highlight form included', () => {
    /*
      Sem isto tudo abaixo é asserção vazia (§7.4): um `sourceRoot` errado
      devolve zero arquivos e as varreduras ficam verdes provando nada. E os
      nomes ABAIXO são o pino da correção — o buraco medido era o `app` não ter
      varredura NENHUMA de desenho, e as telas de grifo são as primeiras a
      mostrar autoria por linha.
    */
    const scanned = files.map(({ path }) => path);

    expect(scanned.length).toBeGreaterThan(15);
    for (const file of [
      'acervo.tsx',
      'acervo-entries.ts',
      'highlight-form.tsx',
      'highlight-fields.tsx',
      'highlight-colors.tsx',
      'chrome.tsx',
      'book.tsx',
      'home.tsx',
      'day-note.tsx',
      'free-note.tsx',
      'App.tsx',
    ]) {
      expect(scanned.some((path) => path.endsWith(file))).toBe(true);
    }

    /*
      E que o que foi lido é CÓDIGO, não comentário sobrando nem vazio.

      ⚠️ O marcador é `useActiveClub` e uma chave de catálogo — **não**
      `aria-pressed`, que foi a primeira escolha e ficou vermelha: `aria-pressed`
      é escrito pelo `FilterChip`, em `packages/ui`, e nenhuma tela do app o
      digita. Um marcador que não existe na superfície varrida transforma a
      precondição em asserção vazia ao contrário — ela reprova sem haver
      defeito, e o conserto natural é apagá-la.
    */
    expect(files.some(({ code }) => code.includes('useActiveClub'))).toBe(true);
    expect(
      files.some(({ code }) => code.includes('pages.acervo.empty.filtered')),
    ).toBe(true);
  });

  it.each(PRIVACY_TERMS)('speaks of no %s anywhere in app/src', (term) => {
    /*
      ⚠️ A MESMA LISTA da varredura de DOM (`./adr-0002-dom.ts`), importada e
      não copiada: o `GUILT_TERMS` viveu como duas cópias até a Tarefa 19
      descobrir que elas tinham divergido na primeira correção.

      Ela pega a frase que entrou na tela **sem passar pelo `t()`** — o que a
      varredura do CATÁLOGO não vê e a de DOM só vê se o estado for renderizado
      por algum teste.

      ⚠️ **`withoutDiacritics` E NÃO `normalize('NFD')` — CORREÇÃO MEDIDA DA
      TAREFA 32b.** O `NFD` **decompõe** o acento, não o remove: `'Só você'`
      vira `'só você'` com o diacrítico solto ao lado da letra, e o
      `includes('so voc')` continua **falso**. Resultado: cinco dos termos da
      lista (`'so voc'`, `'somente voc'`, `'apenas voc'`, `'visivel para'`,
      `'visivel so'`) eram **inalcançáveis** nesta varredura — e em português
      ninguém escreve nenhum deles sem acento.

      MEDIDO: `const planted = 'Só você vê esta marca'` numa tela dava **0
      acusadores em 24 testes**; a mesma frase em ASCII dava 1. É a assimetria
      que a Tarefa 27 pagou caro para fechar no catálogo, sobrevivendo aqui — e
      o DOM ter pego o caso medido é sorte, não desenho: esta varredura existe
      justamente para o que o DOM não vê.

      O helper mora no `harness.tsx`, ao lado do `readableText()`, e é o MESMO
      que as duas varreduras de DOM usam — ele remove o diacrítico e baixa a
      caixa.
    */
    const offenders = files
      .filter(({ code }) => mentions(withoutDiacritics(code), term))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('⚠️ sees an ACCENTED privacy phrase, not only the ASCII one', () => {
    /*
      O matcher tem de ser falsificável ELE MESMO (o mesmo par do teste de
      âncora abaixo). Sem estas duas linhas, alguém que trocasse o
      `withoutDiacritics` de volta por `normalize('NFD')` deixaria os quinze
      `it.each` acima **verdes**, e a regressão voltaria calada.
    */
    expect(mentions('Só você vê esta marca'.normalize('NFD'), 'so voc')).toBe(
      false,
    );
    expect(mentions(withoutDiacritics('Só você vê esta marca'), 'so voc')).toBe(
      true,
    );
  });

  it.each(FORBIDDEN_ICONS)('imports no %s icon anywhere in app/src', (term) => {
    const offenders = files
      .filter(({ code }) => mentions(code, term))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('anchors the match to the left, so legitimate identifiers survive', () => {
    // O matcher tem de ser falsificável ELE MESMO: sem estas linhas, trocar
    // `\b${term}` por um `includes` cru deixaria a suíte vermelha em algum
    // identificador legítimo e o próximo leitor apagaria o termo `lock` da
    // lista — perdendo a guarda para consertar o matcher.
    expect(mentions('const blocked = disabled || loading;', 'lock')).toBe(
      false,
    );
    expect(mentions('body.classList.add(SCROLL_LOCK_CLASS)', 'lock')).toBe(
      false,
    );
    expect(mentions('<Lock aria-hidden="true" />', 'lock')).toBe(true);
    expect(
      mentions("import { LockKeyhole } from 'lucide-react';", 'lock'),
    ).toBe(true);
  });

  it('⚠️ draws no icon by hand — every glyph comes from lucide-react', () => {
    /*
      ⚠️ ESTA É A GUARDA DURÁVEL, e a razão está medida DUAS vezes: na Tarefa 13
      um cadeado em `<svg>` inline no `FilterChip` sobreviveu aos 89 testes de
      `ui/`; na rodada de correção da Tarefa 25, o mesmo `<svg>` em toda linha
      do acervo de grifos sobreviveu aos 508 do `app`. Lista de termos nenhuma
      pega desenho à mão — nem esta, nem a próxima.

      Com o ícone vindo do `lucide-react`, o glifo tem NOME, e nome cai nas duas
      varreduras acima. É a metade que transforma o ADR 0002 de "vigilância
      sobre um estado renderizado" em invariante do pacote.

      `dangerouslySetInnerHTML` entra junto porque é o desvio óbvio: ele
      injetaria o mesmo `<path>` sem a string `<svg` aparecer no JSX.
    */
    const offenders = files
      .filter(({ code }) => /<svg\b|dangerouslySetInnerHTML/iu.test(code))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
