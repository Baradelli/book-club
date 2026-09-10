import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * REGRA 27 — o `docs/adr/0002-visibilidade-total-no-clube.md` virando guarda
 * automática, e agora em `ui/src` INTEIRO.
 *
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE, e por que ele não mora mais em
 * `components/__tests__/filter-chip.test.tsx`. Duas cegueiras medidas na
 * rodada de correção da Tarefa 13:
 *
 * 1. **A varredura cobria só o `filter-chip.tsx`.** Um cadeado no `list.tsx`,
 *    ou um "Só você vê" no `ListItem`, passavam pelos 89 testes. O chip não é
 *    o único lugar onde alguém explica uma privacidade que não existe — a
 *    lista de anotações (Tarefa 19) é o lugar mais provável.
 * 2. **A varredura pega PALAVRA, e desenho não tem palavra.** Medido: um
 *    cadeado desenhado em `<svg>` inline no `FilterChip`, sem nenhum termo da
 *    lista, sobreviveu aos 89 testes. Nenhuma lista de termos pega desenho à
 *    mão — nem esta, nem a próxima.
 *
 * Daí as DUAS metades abaixo, e a segunda é a que fecha o buraco de verdade:
 *
 * - a lista de termos, sobre todo `ui/src`;
 * - **nenhum `<svg>` inline em `ui/src`**. Com todo ícone vindo do
 *   `lucide-react` (`CLAUDE.md`), o glifo passa a ter NOME — `<Lock />` cai na
 *   varredura de termos, `<path d="M8 11V7a4 4 0 0 1 8 0v4" />` não cairia
 *   nunca.
 *
 * O ADR, em uma frase: dentro do clube não existe conteúdo privado. Toda
 * anotação e todo grifo são visíveis para os membros ativos desde o instante
 * em que são salvos, e o filtro `Tudo · Minhas · de <pessoa>` é NAVEGAÇÃO. Um
 * cadeado ensinaria uma regra que o sistema não tem — e quem acreditasse nele
 * escreveria pensando que ninguém vai ler.
 */
// `process.cwd()` e não `import.meta.url`: no ambiente jsdom do Vitest o
// módulo não tem URL de arquivo, e o `fileURLToPath` estoura. Molde:
// `packages/app/src/__tests__/index-html.test.ts`.
const sourceRoot = resolve(process.cwd(), 'src');

/**
 * Só o que VAI para o app. `__tests__/` fica de fora, e não por conveniência:
 * este arquivo lista os termos proibidos como DADO, então uma varredura que se
 * incluísse acusaria a si mesma — a mesma razão que já isenta `__tests__` em
 * `no-i18n.test.ts`.
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
 * Comentário não é código — e aqui isso DECIDE o teste: o cabeçalho do
 * `filter-chip.tsx` explica a regra citando "cadeado", "olho fechado" e
 * "privado" em prosa, e o `index.ts` cita `<Lock />` como exemplo. Sem remover
 * os comentários, a varredura acusaria a própria documentação da regra que ela
 * protege (`docs/CONVENCOES-CODIGO.md` §7.1).
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
 * Iconografia e vocabulário de visibilidade restrita.
 *
 * Os itens são RADICAIS (`cadead` pega "cadeado" e "cadeados"; `privad` pega
 * "privado" e "privada"), e os nomes do `lucide-react` entram pelo mesmo
 * caminho: `Lock`, `LockKeyhole` e `ShieldOff` casam `lock`/`shield`, e por
 * isso `unlock` e `eyeclos` (de `EyeClosed`) precisam de entrada própria — o
 * casamento é ancorado à ESQUERDA (veja `mentions`).
 */
const FORBIDDEN_TERMS = [
  'lock',
  'unlock',
  'cadead',
  'eye-off',
  'eyeoff',
  'eye_off',
  'eyeclos',
  'olho',
  'private',
  'privad',
  'secret',
  'oculto',
  'shield',
  // Vocabulário, não ícone: o rótulo é o outro jeito de ensinar a regra
  // errada. (`ui` não carrega texto de usuário — decisão B —, então qualquer
  // uma destas frases aqui já é sintoma duplo.)
  'só voc',
  'so voc',
  'somente voc',
  'apenas voc',
  'visível para',
  'visivel para',
] as const;

/**
 * ⚠️ ANCORADO À ESQUERDA (`\b` antes do radical), e isso foi MEDIDO, não
 * escolhido por gosto. Um `includes` cru acusa dois identificadores legítimos
 * que já existem nesta pasta:
 *
 * - `const blocked = disabled || loading` (`button.tsx`) — contém `lock`;
 * - `SCROLL_LOCK_CLASS` (`sheet.tsx`) — contém `lock`.
 *
 * Nos dois o radical está no MEIO de uma palavra (`_` é caractere de palavra
 * para o `\b`), então a âncora os deixa passar; `<Lock />`, `LockKeyhole` e
 * `lock` solto continuam sendo pegos. Idem para `clock` e `block`, que um dia
 * vão aparecer.
 *
 * Não há âncora à DIREITA de propósito: sem ela `privad` pega "privado" e
 * "privada", que é o ponto de usar radical.
 *
 * E é por isso que `hidden` NÃO está na lista: `aria-hidden` e
 * `overflow-hidden` têm o radical logo depois de um `-`, que É fronteira — a
 * âncora não salvaria, e a lista acusaria metade da pasta.
 */
function mentions(code: string, term: string): boolean {
  // Sem o `-` na classe: fora de uma classe de caracteres ele não precisa de
  // escape, e `\-` é escape INVÁLIDO no modo `u` — medido, com o termo
  // `eye-off` derrubando a suíte por erro de regex, não por achado.
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`\\b${escaped}`, 'u').test(code.toLowerCase());
}

describe('no privacy iconography anywhere in @clube/ui (rule 27, ADR 0002)', () => {
  it('reads the whole package, not just the chip', () => {
    // Sem isto tudo abaixo é asserção vazia (§7.4): um `sourceRoot` errado
    // devolve zero arquivos e as varreduras ficam verdes provando nada. E os
    // nomes ABAIXO são o pino da correção: o buraco medido era a varredura
    // cobrir SÓ o `filter-chip.tsx`.
    const scanned = files.map(({ path }) => path);

    expect(scanned.length).toBeGreaterThan(8);
    for (const file of [
      'filter-chip.tsx',
      // O componente da Tarefa 27, pinado por NOME: a barra de filtro é o
      // lugar mais provável de alguém explicar uma privacidade que não existe,
      // e a varredura só protege o que ela comprovadamente lê.
      'filter-bar.tsx',
      'list.tsx',
      'sheet.tsx',
      'person-avatar.tsx',
      'button.tsx',
      'field.tsx',
    ]) {
      expect(scanned.some((path) => path.endsWith(file))).toBe(true);
    }

    // E que o que foi lido é código, não vazio.
    expect(files.some(({ code }) => code.includes('aria-pressed'))).toBe(true);
  });

  it.each(FORBIDDEN_TERMS)('carries no %s anywhere in ui/src', (term) => {
    const offenders = files
      .filter(({ code }) => mentions(code, term))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('anchors the match to the left, so legitimate identifiers survive', () => {
    // O matcher tem de ser falsificável ELE MESMO: sem estas quatro linhas,
    // trocar `\b${term}` por um `includes` cru deixaria a suíte vermelha em
    // `button.tsx`/`sheet.tsx` e o próximo leitor apagaria o termo `lock` da
    // lista — perdendo a guarda para consertar o matcher.
    expect(mentions('const blocked = disabled || loading;', 'lock')).toBe(
      false,
    );
    expect(mentions('body.classList.add(SCROLL_LOCK_CLASS)', 'lock')).toBe(
      false,
    );
    expect(mentions('<Lock aria-hidden="true" />', 'lock')).toBe(true);
    expect(mentions('import { LockKeyhole } from "x";', 'lock')).toBe(true);
  });

  it('draws no icon by hand — every glyph comes from lucide-react', () => {
    /*
      ⚠️ ESTA É A GUARDA DURÁVEL, e a razão está medida: um cadeado em `<svg>`
      inline no `FilterChip`, sem nenhum termo da lista acima, sobreviveu aos
      89 testes da fatia. Lista de termos nenhuma pega desenho à mão.

      Com o ícone vindo do `lucide-react`, o glifo tem NOME — e nome cai na
      varredura de termos. É a metade que transforma a regra 27 de "vigilância
      sobre um arquivo" em invariante do pacote.

      `dangerouslySetInnerHTML` entra junto porque é o desvio óbvio: ele
      injetaria o mesmo `<path>` sem a string `<svg` aparecer no JSX.
    */
    const offenders = files
      .filter(({ code }) => /<svg\b|dangerouslySetInnerHTML/iu.test(code))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
