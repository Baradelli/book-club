import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * REGRA 8 da Tarefa 14 — a regra que separa "gostei muito do editor" de
 * "inutilizável no celular", virada guarda ESTÁTICA.
 *
 * ⚠️ O bug que ela impede: um `onClick` num botão do editor só dispara depois
 * do `mouseup`, e o `mousedown` que veio antes já tirou o foco do ProseMirror.
 * A seleção se perde e o TECLADO DO CELULAR FECHA a cada botão apertado —
 * escrever uma anotação vira abrir e fechar teclado.
 *
 * Ela é estática porque é a forma de cobrir os TREZE botões da barra, os sete
 * do bubble menu e os itens dos dois popups sem escrever vinte e dois testes
 * de comportamento — e porque o defeito volta por refactor distraído
 * (`onMouseDown` parece exótico; `onClick` parece certo).
 *
 * ============================================================================
 * O QUE MUDOU NA RODADA DE CORREÇÃO (e por quê)
 * ============================================================================
 *
 * A auditoria mediu QUATRO furos, todos com a suíte verde. Dois eram da forma
 * da varredura, e é isso que este arquivo conserta:
 *
 * 1. A LISTA DE ARQUIVOS ERA FIXA (`RichEditor.tsx`, `SlashMenu.tsx`,
 *    `MentionList.tsx`). Um arquivo NOVO com `<button onClick=…>` — o próximo
 *    popup, a próxima barra — passava sem ser olhado. Agora a lista é DERIVADA
 *    do grafo de imports do `RichEditor.tsx`: todo módulo local que o editor
 *    carrega e que renderiza `<button` está sujeito à regra, e um arquivo novo
 *    entra na varredura no instante em que o editor passa a importá-lo.
 *
 *    ⚠️ O escopo é o GRAFO DO EDITOR, e não a pasta `components/` inteira, de
 *    propósito: os seis componentes da Tarefa 13 (`button`, `filter-chip`,
 *    `list`, `sheet`) usam `onClick` legitimamente — eles não vivem dentro de
 *    um ProseMirror e não têm seleção para perder. A regra 8 é do editor.
 *
 * 2. A PROIBIÇÃO ERA DO LITERAL `onClick`, e não da FAMÍLIA. Um botão com só
 *    `onPointerUp` fecha o teclado exatamente igual e passava verde. Agora o
 *    que se proíbe é `on(Click|PointerUp|PointerDown)=`.
 *
 * Os outros dois furos eram de duplicação (`preventDefault` presente no
 * arquivo, ausente no handler) e foram consertados no CÓDIGO, extraindo o
 * `SuggestionOption` compartilhado — com um teste de comportamento por popup
 * em `slash-menu.test.tsx` e `mention-list.test.tsx`.
 */
const componentsRoot = resolve(process.cwd(), 'src', 'components');

/** Por onde o editor começa: quem não é alcançável daqui não é do editor. */
const ENTRY = 'RichEditor.tsx';

/**
 * Comentário não é código, e aqui isso decide o teste: os arquivos EXPLICAM a
 * regra citando `onClick` em prosa (`docs/CONVENCOES-CODIGO.md` §7.1). Sem
 * remover os comentários, a varredura acusaria a documentação da regra que ela
 * protege.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

/** O arquivo de um import relativo — `./x` pode ser `x.ts` ou `x.tsx`. */
function resolveLocal(specifier: string): string | undefined {
  const base = join(componentsRoot, specifier.replace(/^\.\//u, ''));
  for (const extension of ['.tsx', '.ts']) {
    if (existsSync(base + extension)) return base + extension;
  }
  return undefined;
}

/**
 * O grafo de imports LOCAIS a partir do `RichEditor.tsx`.
 *
 * Só `./algo` — `@tiptap/*`, `react` e `lucide-react` não são nossos, e
 * `../cx` não renderiza botão. É uma varredura por regex e não um parser de
 * verdade: para uma lista de arquivos-fonte de um pacote isso basta, e um
 * parser (`ts-morph`, `typescript`) seria uma dependência a mais para saber o
 * nome de sete arquivos.
 */
function editorGraph(): string[] {
  const seen = new Set<string>();
  const queue = [join(componentsRoot, ENTRY)];

  while (queue.length > 0) {
    const path = queue.pop();
    if (path === undefined || seen.has(path)) continue;
    seen.add(path);

    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/from '(\.\/[^']+)'/gu)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const next = resolveLocal(specifier);
      if (next !== undefined) queue.push(next);
    }
  }

  return [...seen];
}

/** Todo módulo local que o editor carrega. */
const graph = editorGraph()
  .map((path) => ({
    name: path.slice(componentsRoot.length + 1),
    code: stripComments(readFileSync(path, 'utf8')),
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

const graphNames = graph.map(({ name }) => name);

/** Os arquivos do editor que renderizam botão — os sujeitos da regra 8. */
const files = graph.filter(({ code }) => code.includes('<button'));

const names = files.map(({ name }) => name);

/**
 * A FAMÍLIA DE PONTEIRO, não o literal.
 *
 * `onClick`, `onPointerUp` e `onPointerDown` fecham o teclado do celular pelo
 * mesmo motivo: os três só existem depois de o navegador já ter movido o foco,
 * ou movem o foco eles mesmos. Os dois autorizados são `onMouseDown` e
 * `onTouchEnd`, com `preventDefault`.
 */
const FORBIDDEN = /on(Click|PointerUp|PointerDown)\s*=/u;

describe('no editor button uses onClick (rule 8, §4.4)', () => {
  it('walks the editor graph and finds who renders a button', () => {
    /*
      Sem isto tudo abaixo é asserção vazia (§7.4): um `stripComments` que
      devolvesse vazio, ou um grafo que não achasse ninguém, deixaria a
      varredura verde provando nada.

      O grafo tem de ALCANÇAR os dois popups (eles chegam por `note-mention` e
      `slash-command`, não por um import direto do `RichEditor`) — é isso que
      prova que a travessia atravessa. E os dois arquivos que hoje renderizam
      botão ficam pinados: se um deles sair da lista, ou o editor deixou de
      importá-lo, ou ele deixou de ter botão. As duas coisas exigem alguém
      olhar.
    */
    expect(graphNames).toContain('RichEditor.tsx');
    expect(graphNames).toContain('SlashMenu.tsx');
    expect(graphNames).toContain('MentionList.tsx');
    expect(graphNames).toContain('SuggestionOption.tsx');

    expect(names).toContain('RichEditor.tsx');
    expect(names).toContain('SuggestionOption.tsx');
    for (const { code } of files) {
      expect(code).toContain('<button');
    }
  });

  // A proibição vale para o GRAFO INTEIRO, e não só para quem tem `<button`:
  // um `onClick` num `div` do popup fecha o teclado do mesmo jeito, e um
  // arquivo que ganhe botão amanhã já nasce coberto.
  it.each(graphNames)('has no pointer-family handler in %s', (name) => {
    const code = graph.find((candidate) => candidate.name === name)?.code ?? '';

    expect(code).not.toMatch(FORBIDDEN);
  });

  it.each(names)('answers to mousedown and touchend in %s', (name) => {
    const code = files.find((candidate) => candidate.name === name)?.code ?? '';

    /*
      O lado POSITIVO (§7.3): sem ele, um arquivo que perdesse TODOS os
      handlers passaria no teste de cima — "nenhum `onClick`" também é verdade
      num botão que não faz nada.

      ⚠️ E O LIMITE HONESTO DESTA ASSERÇÃO, medido: ela prova que as strings
      existem no ARQUIVO, não que existam no HANDLER. Enquanto os dois popups
      duplicavam o par, apagar o `preventDefault` de UM deles passava daqui —
      a string continuava no outro. É por isso que o par de comportamento
      (`fireEvent` devolvendo `false`) existe por popup, em
      `slash-menu.test.tsx` e `mention-list.test.tsx`, e é por isso que o botão
      de item foi extraído para um lugar só.
    */
    expect(code).toContain('onMouseDown');
    expect(code).toContain('onTouchEnd');
    expect(code).toContain('preventDefault');
  });
});
