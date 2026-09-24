import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * ============================================================================
 * TODA CITAÇÃO `Arquivo.dc.html:NN` APONTA PARA UMA LINHA QUE EXISTE
 * ============================================================================
 *
 * ⚠️⚠️ **ESTA GUARDA SÓ PÔDE EXISTIR EM 2026-09-24, e a razão é o achado que a
 * criou.** Até essa data os artboards do canvas **não estavam versionados**:
 * não estavam em `docs/`, não estavam no histórico do git
 * (`git log --all -- '*.dc.html'` devolvia vazio) e não estavam em lugar
 * nenhum que uma sessão alcançasse. Ou seja: **as 914 citações
 * `Arquivo.dc.html:NN` espalhadas por 96 arquivos permanentes deste
 * repositório eram inverificáveis** — a única classe de afirmação do projeto
 * que não tinha como ter acusador, e a causa estrutural de três citações
 * erradas achadas por auditoria na Tarefa 48.
 *
 * O dono decidiu versioná-los (`docs/ui/canvas/`, 2026-09-24), e a dívida
 * fecha **com prova**: esta guarda.
 *
 * ⚠️ **O QUE ELA DECIDE, E O QUE DELIBERADAMENTE NÃO DECIDE.** Ela prova que o
 * artboard citado **existe** e que o número **cai dentro dele**. Ela NÃO exige
 * que a linha tenha conteúdo, e isso é decisão medida, não desleixo: dez das
 * 914 citações apontam hoje para linha em branco, e **sete delas de
 * propósito** — são os documentos citando o número ERRADO para dizer que ele
 * está errado (`Dia.dc.html:60` corrigido para `:64-73` na Tarefa 43,
 * `InicioDesktop.dc.html:106` para `:107-118` na 45, `Main.dc.html:56` para
 * `:57` na 48). As outras três são extremos de intervalo (`:37-53`, `:96-140`)
 * que calham de cair numa linha vazia. Uma guarda de "linha não vazia"
 * precisaria de uma lista de exceções que mistura as duas coisas, e listas de
 * exceção assim é que apodrecem.
 *
 * O que ela pega é o defeito de verdade: **o número que passa do fim do
 * arquivo** e **o artboard que não existe** — que é o que acontece quando
 * alguém copia uma citação de uma tela para outra, ou quando o canvas encolhe.
 * Hoje: **0 e 0**, em 914 citações.
 */

/** A raiz do repositório: os testes rodam com `cwd` em `packages/app`. */
const REPO = resolve(process.cwd(), '..', '..');
const CANVAS = join(REPO, 'docs', 'ui', 'canvas');

/** O que não se varre: dependências, saída de build e o próprio canvas. */
const SKIP = new Set([
  'node_modules',
  'dist',
  'dev-dist',
  'coverage',
  '.git',
  '.turbo',
]);

/**
 * As três formas de citação em uso: um número só, um intervalo com hífen e uma
 * lista separada por vírgula.
 *
 * ⚠️ **O EXEMPLO SAIU DESTE COMENTÁRIO, e isso é a guarda mordendo a si
 * mesma.** A primeira versão escrevia um exemplo inventado aqui, e a varredura
 * o encontrou e o acusou — ela varre o repositório inteiro, e este arquivo faz
 * parte do repositório. As citações que SOBRAM no docblock acima são todas
 * reais e resolvem; um exemplo fictício, não.
 */
const CITATION = /([A-Za-z]+)\.dc\.html:(\d+(?:\s*[-,]\s*\d+)*)/gu;

/**
 * As linhas REAIS de cada artboard.
 *
 * ⚠️ **O `\n` FINAL NÃO É UMA LINHA, e ignorar isso afrouxaria a guarda em
 * exatamente um número** — medido: os 21 arquivos terminam em quebra, então um
 * `split()` cru devolve **72** para o `Main.dc.html`, cuja última linha de
 * verdade é a **71** (o `</html>`, que é também o número que a Tarefa 48
 * publica). Com 72 a guarda aceitaria uma citação para uma linha que não
 * existe — o defeito que ela existe para pegar, uma unidade adiante.
 */
function artboards(): Map<string, number> {
  const lines = new Map<string, number>();
  for (const file of readdirSync(CANVAS)) {
    if (!file.endsWith('.dc.html')) continue;
    const rows = readFileSync(join(CANVAS, file), 'utf8').split(/\r?\n/u);
    if (rows.at(-1) === '') rows.pop();
    lines.set(file, rows.length);
  }
  return lines;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIP.has(entry)) return [];
    const full = join(dir, entry);
    if (full === CANVAS) return [];
    if (statSync(full).isDirectory()) return filesUnder(full);
    return /\.(?:tsx?|css|md|json)$/u.test(entry) ? [full] : [];
  });
}

export interface Citation {
  where: string;
  board: string;
  line: number;
}

/** Toda citação de artboard escrita no repositório, fora do próprio canvas. */
export function citationsIn(files: readonly string[]): Citation[] {
  const found: Citation[] = [];

  for (const path of files) {
    const text = readFileSync(path, 'utf8');
    if (!text.includes('.dc.html:')) continue;

    const lines = text.split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      for (const match of line.matchAll(CITATION)) {
        const [, name = '', numbers = ''] = match;
        for (const raw of numbers.split(/[-,]/u)) {
          const value = Number(raw.trim());
          if (!Number.isFinite(value)) continue;
          found.push({
            where: `${relative(REPO, path).split(sep).join('/')}:${index + 1}`,
            board: `${name}.dc.html`,
            line: value,
          });
        }
      }
    }
  }

  return found;
}

/** As citações que apontam para fora: arquivo que não existe, ou linha além do fim. */
export function danglingIn(
  citations: readonly Citation[],
  boards: ReadonlyMap<string, number>,
): string[] {
  return citations
    .filter((citation) => {
      const total = boards.get(citation.board);
      if (total === undefined) return true;
      return citation.line < 1 || citation.line > total;
    })
    .map(
      (citation) => `${citation.board}:${citation.line}  <-  ${citation.where}`,
    );
}

describe('⚠️ as citações do canvas apontam para linha que existe', () => {
  it('⚠️ resolves every artboard citation in the repository', () => {
    const boards = artboards();
    const citations = citationsIn(filesUnder(REPO));

    expect(danglingIn(citations, boards)).toEqual([]);
  });

  it('⚠️ and it BITES — the positive pair, before the sweep is believed', () => {
    /*
      ⚠️ **SEM ESTA METADE A VARREDURA ACIMA É UMA TABELA VERDE.** Ela nasce
      verde contra a árvore (as 914 citações resolvem), então o vermelho dela é
      o do mutante — e as duas formas de errar estão plantadas aqui, não
      prometidas.
    */
    const boards = new Map([['Main.dc.html', 71]]);

    // 1 · o número passa do fim do arquivo
    expect(
      danglingIn(
        [{ where: 'x.md:1', board: 'Main.dc.html', line: 72 }],
        boards,
      ),
    ).toHaveLength(1);
    // 2 · o artboard citado não existe (a fileira escura, por exemplo)
    expect(
      danglingIn(
        [{ where: 'x.md:1', board: 'MainEscuro.dc.html', line: 10 }],
        boards,
      ),
    ).toHaveLength(1);
    // 3 · e a última linha do arquivo NÃO é um estouro — o par negativo.
    expect(
      danglingIn(
        [{ where: 'x.md:1', board: 'Main.dc.html', line: 71 }],
        boards,
      ),
    ).toEqual([]);
  });

  it('reads the real files, not an empty folder', () => {
    /*
      ⚠️ O pino que impede a guarda de ficar verde por não ter olhado nada — a
      lição do `pageSource` do `chrome.test.tsx`. Se o caminho do canvas ou o
      da raiz quebrar, as duas listas esvaziam e a asserção de cima passa sem
      ter conferido uma citação sequer.
    */
    const boards = artboards();
    const citations = citationsIn(filesUnder(REPO));

    // Os 21 artboards versionados em 2026-09-24. Um vigésimo segundo (a
    // fileira escura, se ela chegar) soma um aqui, com a razão escrita.
    expect(boards.size).toBe(21);
    expect(boards.get('Main.dc.html')).toBe(71);
    expect(boards.get('NaoEncontrada.dc.html')).toBe(67);
    // E a varredura achou citação de verdade, em muitos arquivos.
    expect(citations.length).toBeGreaterThan(800);
    expect(
      new Set(citations.map((c) => c.where.split(':')[0])).size,
    ).toBeGreaterThan(80);
  });
});
