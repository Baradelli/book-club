import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { API_ERROR_KEYS } from '../../client/api-error-key';
import { pt, resources } from '../index';

/** `a.b.c` de cada folha do catálogo — é a chave que o `t()` recebe. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

/** Cada folha com o caminho dela — o par que a contagem de VALOR precisa. */
function entriesOf(value: unknown, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[prefix, value]];
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    entriesOf(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

function leaves(value: unknown): unknown[] {
  if (typeof value !== 'object' || value === null) return [value];
  return Object.values(value).flatMap(leaves);
}

describe('catálogos de i18n', () => {
  it('⚠️ has ONE catalog, and the en one does not exist (task 38d)', () => {
    /*
      ⚠️ **A DECISÃO DO DONO, PINADA NO DISCO** (`docs/ACEITE-MVP.md`, MVP 1,
      pergunta 7, 2026-09-17): *"só português — apagar o inglês"*.

      Ela é pinada aqui, e não só pela ausência de `export { en }`, porque um
      `en.ts` que voltasse ao disco **compila e passa** enquanto ninguém o
      importar — e aí o catálogo morto volta a pedir manutenção (a fatia
      seguinte escreve uma chave nova e alguém "conserta a paridade").

      ⚠️ O par positivo (§7.4): o `pt.ts` ESTÁ lá. Sem ele, um caminho errado
      deixaria as duas linhas verdes provando "esta pasta não existe".
    */
    const catalogPath = (name: string): string =>
      fileURLToPath(new URL(`../${name}.ts`, import.meta.url));

    expect(existsSync(catalogPath('pt'))).toBe(true);
    expect(existsSync(catalogPath('en'))).toBe(false);
  });

  /*
    ⚠️ **A ASSERÇÃO TROCADA DUAS VEZES, NUNCA APAGADA.** Ela já foi
    `exposes both catalogs in resources (rule 13)` (os DOIS catálogos no
    `i18next.init`) e depois `ships ONLY pt eagerly, because en is fetched on
    demand` (Tarefa 29a: só o `pt` eager, o `en` por `import()`).

    A Tarefa 38d apagou o segundo catálogo, e com ele a distinção
    eager/preguiçoso — por isso `eagerResources` voltou a se chamar `resources`:
    com um idioma só, "eager" prometia um irmão preguiçoso que não existe mais.
    O que sobra é a Única verdade que resta: o que o `i18next.init` recebe é o
    catálogo `pt`, e só ele.

    A paridade recursiva `pt` ↔ `en` (`has exactly the same key set…`) saiu
    junto, e não foi afrouxada: ela comparava dois conjuntos, e só há um.
  */
  it('puts the pt catalog, and nothing else, in what i18next receives', () => {
    expect(resources).toEqual({ pt: { translation: pt } });
    expect(Object.keys(resources)).toEqual(['pt']);
  });

  it('has no empty value in pt (rule 15)', () => {
    const catalog = pt;
    const empty = keyPaths(catalog).filter((path) => {
      const value = path
        .split('.')
        .reduce<unknown>(
          (node, segment) => (node as Record<string, unknown>)[segment],
          catalog,
        );
      return typeof value !== 'string' || value.trim() === '';
    });

    expect(empty).toEqual([]);
  });

  it('has only string leaves in pt (rule 15)', () => {
    /*
      ⚠️ **O PAR POSITIVO (§7.4), acrescentado na rodada de correção da 38d.**
      O laço abaixo é uma varredura, e varredura sobre lista vazia é verde para
      sempre: medido, com `leaves()` devolvendo `[]` o teste rodava **zero
      asserções** e passava (586/586, zero acusadores). O buraco vinha do
      `it.each` que este teste substituiu — herdado, não criado, mas herdado na
      mão de quem o reescreveu.
    */
    expect(leaves(pt).length).toBeGreaterThan(20);

    for (const leaf of leaves(pt)) expect(typeof leaf).toBe('string');
  });

  it('names every key in English camelCase (rule 16)', () => {
    const segment = /^[a-z][A-Za-z0-9]*$/;

    /*
      ⚠️ **O SUFIXO DE PLURAL DO i18next NÃO É NOME EM SNAKE_CASE** — é
      protocolo. A biblioteca escolhe entre `days_one` e `days_other` sozinha,
      a partir do `count` e das regras do idioma; a chave que o código escreve
      continua sendo `days`, em camelCase.

      ⚠️ A lista é FECHADA de propósito (`one` e `other`, os dois que o `pt`
      usa): aceitar qualquer `_algo` reabriria a porta para snake_case de
      verdade, que é o que esta regra existe para barrar. Quem precisar de
      `_few`/`_many` (russo, polonês) acrescenta aqui, e o acréscimo aparece no
      diff.
    */
    const PLURAL_SUFFIXES = ['_one', '_other'];
    const withoutPluralSuffix = (part: string): string => {
      const suffix = PLURAL_SUFFIXES.find((it) => part.endsWith(it));
      return suffix === undefined ? part : part.slice(0, -suffix.length);
    };

    const bad = keyPaths(pt).filter((path) =>
      path.split('.').some((part) => !segment.test(withoutPluralSuffix(part))),
    );

    expect(bad).toEqual([]);
  });

  /*
    ⚠️ **AS CHAVES DA TAREFA 40, E O QUE ESTE TESTE GUARDA DE VERDADE.**

    O catálogo é um objeto literal **sem `as const`**, e o tipo nasce por
    inferência (`TranslationCatalog = typeof pt`). Consequência medida: uma
    chave nova escrita no ramo ERRADO da árvore — `pages.dayNote.savedAt` em
    vez de `pages.dayNote.save.savedAt` — **compila**, passa em todo o `tsc`, e
    só aparece no dia em que a tela chama `t()` e recebe a chave de volta como
    texto. Este teste é o acusador desse erro, e ele é o único que existe:
    nenhuma guarda do projeto exige consumidor para chave de catálogo (varrido
    em `shared`, `app` e `ui`), então as chaves nascem aqui e ganham tela nas
    Tarefas 42–48.

    ⚠️ **São 20 FOLHAS para as 17 chaves do §A.9**, e as duas contas são
    diferentes de propósito: `savedAt` e `archivePreview` aparecem em DOIS
    namespaces cada (a tela é a dona do seu indicador de salvamento, como
    `save.saved` e `archive.*` já são hoje), e `days` tem par de plural. Quem
    contar 17 no arquivo está contando outra coisa.
  */
  const TASK_40_KEYS = [
    // A posição no plano — `pages.book.plan` é a dona do assunto, e o Início e
    // a tela do dia a LEEM de lá (decisão C: chave de duas telas não duplica).
    'pages.book.plan.dayOfPlan',
    // As marcas de presença do livro.
    'pages.book.marks.heading',
    'pages.book.marks.read',
    'pages.book.marks.wrote',
    'pages.book.marks.hint',
    // O bloco "Neste livro".
    'pages.book.inBook.heading',
    'pages.book.inBook.notes',
    'pages.book.inBook.highlights',
    // A anotação do dia.
    'pages.dayNote.save.savedAt',
    'pages.dayNote.highlights.heading',
    // A anotação avulsa.
    'pages.freeNote.save.savedAt',
    'pages.freeNote.preview.heading',
    /*
      ⚠️ **`draftSaved` PLANO, e NÃO `save.draft` como o mapa da Tarefa 40
      pedia. Medido:** `pages.highlightForm.save` já existe e é uma STRING (o
      rótulo do botão "Salvar", lido por `highlight-form.tsx:610`).
      Transformá-la em objeto para abrigar `draft` faria o `t()` daquela linha
      devolver a chave crua na tela, e o conserto exigiria editar a tela — que
      esta fatia não toca. A forma plana também é a consistente aqui: este
      formulário grava por BOTÃO, e o vocabulário de gravação dele sempre foi
      plano (`create`, `save`, `failed`); quem tem grupo `save.*` são as duas
      telas que salvam sozinhas.
    */
    'pages.highlightForm.draftSaved',
    'pages.highlightForm.preview.heading',
    // O acervo.
    'pages.acervo.filters.refine',
    // O formulário de livro — `days` com par de plural, porque o português
    // muda; `dayWithNote` sem, porque não conta nada.
    'pages.bookForm.plan.days_one',
    'pages.bookForm.plan.days_other',
    'pages.bookForm.plan.dayWithNote',
    // As preferências.
    'pages.settings.reminderTimeHint',
    // ⚠️ A ÚNICA fora de `pages.*`, e é a exceção ao §10 do `docs/EDITOR.md`:
    // quem renderiza esta frase é a TELA (o rodapé da coluna de leitura), não
    // o editor, e tela nenhuma tem texto solto.
    'editor.slashHint',
  ] as const;

  it('⚠️ puts the twenty task-40 leaves in the namespace of their screen (§A.9)', () => {
    const paths = new Set(keyPaths(pt));

    // O par positivo (§7.4): sem ele, um `keyPaths` quebrado devolvendo `[]`
    // deixaria o laço abaixo vermelho — mas um `paths` com tudo dentro (um
    // `Set` de um caminho só, por exemplo) o deixaria verde sem catálogo.
    expect(paths.size).toBeGreaterThan(20);
    expect(TASK_40_KEYS).toHaveLength(20);

    expect(TASK_40_KEYS.filter((key) => !paths.has(key))).toEqual([]);
  });

  it('⚠️ keeps every key inside a namespace, never at the root (task 40 decision A)', () => {
    /*
      O §A.9 do `docs/new-ui.md` escreveu as 21 frases SOLTAS, porque é uma
      lista de compras e não um mapa. O arquivo não tem uma única chave plana
      na raiz, e esta linha é o que impede a primeira: `refine: 'Refinar'` no
      topo do catálogo compilaria, e a próxima tela a chamaria de `t('refine')`
      sem ninguém saber de quem ela é.
    */
    expect(keyPaths(pt).filter((path) => !path.includes('.'))).toEqual([]);
  });

  it('⚠️ writes every placeholder as {{english}}, the i18next syntax (task 40 decision B)', () => {
    /*
      ⚠️ **MEDIDO NO §A.9: `{n}`, `{total}` e `{hora}`.** Nenhum dos três é a
      sintaxe do i18next — chave única, não dupla —, então o i18next **não os
      substituiria**: eles sairiam LITERAIS na tela ("Dia {n} de {total}"). E o
      `{hora}` erra duas vezes, porque `CLAUDE.md` manda nome em inglês.

      A guarda vale nos dois sentidos (§7.1): nenhuma chave simples, e todo
      nome de buraco em camelCase inglês.
    */
    const values = leaves(pt).filter(
      (leaf): leaf is string => typeof leaf === 'string',
    );
    expect(values.length).toBeGreaterThan(20);

    const singleBrace = values.filter((value) =>
      /(^|[^{])\{[^{}]+\}([^}]|$)/u.test(value),
    );
    expect(singleBrace).toEqual([]);

    const badName = values.flatMap((value) =>
      Array.from(value.matchAll(/\{\{([^{}]*)\}\}/gu))
        .map(([, name]) => name ?? '')
        .filter((name) => !/^[a-z][A-Za-z0-9]*$/u.test(name))
        .map((name) => `${value} → "${name}"`),
    );
    expect(badName).toEqual([]);

    /*
      ⚠️ **A CHAVE DESBALANCEADA ESCAPAVA DAS DUAS REGEX ACIMA, e a auditoria
      mediu:** `'Salva sozinho às {{time}.'` passava com **zero acusadores em
      1.459 testes**. Ela não é chave simples (o `{{` está lá) e não tem nome
      inválido (o nome é `time`) — mas o i18next não fecha a interpolação e
      renderiza `{{time}` **literal na tela**, que é exatamente o defeito que a
      decisão B existe para impedir.

      A conta que pega o caso é a mais tola possível: contar `{` e `}` e exigir
      que empatem. Ela também pega o excesso (`{{time}}}`), que o par de cima
      deixa passar pelo mesmo motivo.
    */
    const unbalanced = values.filter(
      (value) =>
        (value.match(/\{/gu) ?? []).length !==
        (value.match(/\}/gu) ?? []).length,
    );
    expect(unbalanced).toEqual([]);
  });

  it('⚠️ keeps _one and _other saying DIFFERENT things (task 40, audit M1)', () => {
    /*
      ⚠️ **O PAR DE PLURAL PODIA COLAPSAR, e a auditoria mediu:** com
      `days_one: '{{count}} dias'` — idêntico ao `_other` — a suíte inteira
      ficava verde (**zero acusadores em 1.459 testes**), e o app passaria a
      dizer "1 dias". Eu escrevi exatamente esta asserção para `dayWithNote` ×
      `dayHasNotes` e não para o par que esta fatia criou.

      ⚠️ **E ELA É GENÉRICA DE PROPÓSITO**, não uma linha sobre
      `bookForm.plan.days`: a mesma lacuna existia nos dois pares que o catálogo
      já tinha antes desta fatia (`pages.home.streak.days_*` e
      `notifications.readingReminder.streakBody_*`). Uma guarda que só olha o
      par novo protege o que acabou de ser escrito e deixa o antigo exposto —
      é o §7.9 ao contrário.

      As três coisas exigidas de cada par: as DUAS metades existem (um `_one`
      órfão faz o i18next devolver a chave crua), elas dizem coisas diferentes,
      e as duas têm o buraco do `count` (sem ele o número desaparece da frase e
      a pluralização não tem o que pluralizar).
    */
    const halves = new Map<string, { one?: string; other?: string }>();
    for (const [path, value] of entriesOf(pt)) {
      const isOne = path.endsWith('_one');
      const isOther = path.endsWith('_other');
      if (!isOne && !isOther) continue;

      const base = path.slice(0, -(isOne ? '_one'.length : '_other'.length));
      const slot = halves.get(base) ?? {};
      if (isOne) slot.one = value;
      else slot.other = value;
      halves.set(base, slot);
    }

    /*
      ⚠️ O par positivo (§7.4): o laço abaixo é uma varredura, e varredura sobre
      mapa vazio é verde para sempre. Os três pares de hoje são o piso — ele não
      congela o crescimento (um quarto par é bem-vindo), só impede que a guarda
      fique medindo nada.
    */
    expect(halves.size).toBeGreaterThanOrEqual(3);

    for (const [base, { one, other }] of halves) {
      expect(one, `${base}_one`).toBeTypeOf('string');
      expect(other, `${base}_other`).toBeTypeOf('string');
      expect(one, base).not.toBe(other);
      expect(one, `${base}_one`).toContain('{{count}}');
      expect(other, `${base}_other`).toContain('{{count}}');
    }
  });

  it('⚠️ says dayWithNote and dayHasNotes differently (task 40 decision D)', () => {
    /*
      ⚠️ **UM `s` DE DIFERENÇA, E DUAS COISAS DIFERENTES.**
      `pages.bookForm.plan.dayHasNotes` **já existia**: é o recado do 400 do
      domínio ao tentar REMOVER do plano um dia que já tem anotação do clube. A
      chave nova é o RÓTULO da linha que tem anotação. O §A.9 pediu
      `dayHasNote`, a um `s` da que existe — e duas chaves assim, uma dizendo
      "Dia 3 · tem anotação" e a outra "Um dos dias que saiu do plano…", são
      erro esperando acontecer. Daí `dayWithNote`.
    */
    const plan = pt.pages.bookForm.plan;

    expect(plan.dayWithNote).not.toBe(plan.dayHasNotes);
    // E cada uma diz a sua coisa: a do rótulo tem o número do dia, a do 400
    // não pode tê-lo (o corpo do 400 não diz qual dia é, e inventar seria
    // mentir — está escrito ao lado dela).
    expect(plan.dayWithNote).toContain('{{number}}');
    expect(plan.dayHasNotes).not.toContain('{{number}}');
  });

  it('⚠️ pins EVERY repeated phrase of the catalog, one group per value (task 40, audit A5)', () => {
    /*
      ⚠️⚠️ **ESTA GUARDA SUBSTITUIU UMA QUE NÃO GUARDAVA A PROPRIEDADE QUE
      INVOCAVA, e a medição é da auditoria da Tarefa 40.**

      A primeira versão se chamava *"reuses Arquivar and the quote hint instead
      of growing a twin"* e fazia duas asserções: `'Arquivar'` em exatamente
      dois caminhos, e a dica do trecho em um. Ela falhava nos dois sentidos:

      1. **fraca.** Três folhas novas carregando valores que ESTA fatia criou
         (`'As marcas'`, `'Refinar'`, `'Como vai aparecer no acervo'`) passavam
         com **zero acusadores em 1.459 testes**. O nome do teste prometia "não
         cresça uma gêmea"; o corpo media duas strings;
      2. **quebradiça na direção errada.** Um reword legítimo do `quoteHint` na
         Tarefa 47 a deixaria vermelha por um motivo que não tem nada a ver com
         gêmeas — e guarda que grita por nada é guarda que alguém desliga.

      É a **sexta** aparição da classe "a guarda pina o texto em vez da
      propriedade" (29a, 34b, 38, 38d, o `globPatterns` da 39, e esta).

      Agora a propriedade **é** a asserção: todo grupo de folhas que dividem o
      mesmo valor está listado aqui, ordenado por valor e por caminho. Uma gêmea
      nova de QUALQUER frase — recém-escrita ou antiga — deixa isto vermelho, e
      quem a criar tem de escrever o grupo, que é justamente o ponto (o molde é
      o `STREAK_KEYS`). A unicidade do `quoteHint` passa a ser guardada pela
      AUSÊNCIA dele no mapa, e um reword que continue único não mexe em nada.

      ⚠️ **27 GRUPOS, E NÃO TODOS SÃO CONTRATO — dois merecem leitura, e estão
      aqui porque o mapa tem de ser COMPLETO para ser guarda:**

      - ~~**`'Alguém do clube'` (3 caminhos) é DEFEITO, não convenção.** É UM
        conceito — "o autor cujo nome a tela não sabe" — com três chaves
        (`pages.acervo.item.author.other`, `pages.dayNote.others.author`,
        `pages.freeNote.author`). … **Quando ela reduzir as três a uma, este
        teste fica vermelho e a saída é APAGAR a linha, nunca crescê-la.**~~

        ✅ **RESOLVIDO NA TAREFA 42, EM 2026-09-21 — e a linha foi APAGADA,
        que é o que estava escrito aqui para ser feito.** A decisão F daquela
        fatia matou `pages.dayNote.others.author` e `pages.freeNote.author`; as
        duas telas passaram a resolver o nome de verdade pelo `nameOfWriter` do
        `club-names.ts` (decisão E), e o genérico ficou com **um dono só**,
        `pages.acervo.item.author.other`.

        ⚠️ **Por que APAGAR e não reescrever para um caminho:** este mapa lista
        **grupos de folhas que dividem um valor** — a linha 1259 abaixo filtra
        `paths.length > 1`. Um valor com um dono só **não é um grupo**, e
        deixá-lo aqui não seria possível sem afrouxar o filtro: pinaria um
        não-defeito e faria o mapa deixar de ser "as repetições que existem".
        A unicidade do genérico passa a ser guardada pela AUSÊNCIA dele aqui,
        exatamente como a do `quoteHint` — é a propriedade, não o texto;
      - **`'A leitura de hoje'` (2)** cruza MÍDIA: um é título de seção da tela,
        o outro é o título do push. Mudar um sem o outro é legítimo, e é por
        isso que são dois;
      - **`'Ver o acervo do livro'` (2)** são dois botões, em duas telas, para o
        MESMO destino. Convenção por-tela como o resto do arquivo, mas é o grupo
        que mais se parece com gêmea.

      Os 25 restantes são a convenção que o arquivo aplica desde a Tarefa 15:
      cada tela é dona do próprio `loading`, `retry`, `bookUnavailable`,
      `archive.*` e indicador de salvamento, porque a frase de uma tela muda sem
      arrastar as outras.
    */
    const groups = (): Array<[string, string[]]> => {
      const byValue = new Map<string, string[]>();
      for (const [path, value] of entriesOf(pt)) {
        byValue.set(value, [...(byValue.get(value) ?? []), path]);
      }
      return [...byValue.entries()]
        .filter(([, paths]) => paths.length > 1)
        .map(([value, paths]): [string, string[]] => [value, [...paths].sort()])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    };

    const REPEATED_PHRASES: Array<[string, string[]]> = [
      [
        'A leitura de hoje',
        ['notifications.readingReminder.title', 'pages.home.today.heading'],
      ],
      [
        'Abrindo o editor…',
        [
          'pages.dayNote.editorLoading',
          'pages.freeNote.editorLoading',
          'pages.highlightForm.editorLoading',
        ],
      ],
      /*
        ⚠️ A LINHA DE `'Alguém do clube'` (3 caminhos) FOI APAGADA AQUI, na
        Tarefa 42 (2026-09-21). O defeito que ela registrava — um conceito com
        três chaves — foi resolvido: veja o docblock acima.
      */
      [
        'Arquivar',
        ['pages.acervo.archive.confirm', 'pages.freeNote.archive.confirm'],
      ],
      [
        'Carregando…',
        [
          'pages.book.loading',
          'pages.bookForm.loading',
          'pages.busca.clubLoading',
          'pages.dayNote.loading',
          'pages.freeNote.loading',
          'pages.highlightForm.loading',
          'pages.home.loading',
        ],
      ],
      [
        'Como vai aparecer no acervo',
        [
          'pages.freeNote.preview.heading',
          'pages.highlightForm.preview.heading',
        ],
      ],
      [
        'Deixar como está',
        ['pages.acervo.archive.cancel', 'pages.freeNote.archive.cancel'],
      ],
      ['E-mail', ['pages.acceptInvite.email', 'pages.login.email']],
      ['Entrar', ['pages.login.submit', 'pages.login.title']],
      /*
        ⚠️ **O GRUPO CRESCEU NA TAREFA 46, E ESTA LINHA É O PREÇO ESCRITO.** O
        painel de refino do acervo ganhou o próprio "Fechar"
        (`pages.acervo.filters.close`), e a guarda exige que quem cria uma gêmea
        escreva o grupo — que é justamente o ponto dela.

        Por que não reusar `pages.acervo.archive.close`, já que as duas frases
        são iguais HOJE: elas falam de coisas diferentes. Uma fecha a
        confirmação de uma ação destrutiva, a outra fecha um painel de
        NAVEGAÇÃO (ADR 0002) — e a primeira correção de texto que distinguir as
        duas teria de desfazer a fusão antes de poder acontecer. É a convenção
        por-tela que o arquivo aplica desde a Tarefa 15, aplicada por-diálogo.
      */
      [
        'Fechar',
        [
          'pages.acervo.archive.close',
          'pages.acervo.filters.close',
          'pages.freeNote.archive.close',
        ],
      ],
      ['Nova anotação', ['pages.acervo.newNote', 'pages.freeNote.newTitle']],
      [
        'Novo grifo',
        ['pages.acervo.newHighlight', 'pages.highlightForm.newTitle'],
      ],
      [
        'Não foi possível abrir este livro agora.',
        [
          'pages.acervo.bookUnavailable',
          'pages.book.bookUnavailable',
          'pages.bookForm.bookUnavailable',
          'pages.dayNote.bookUnavailable',
          'pages.freeNote.bookUnavailable',
          'pages.highlightForm.bookUnavailable',
        ],
      ],
      [
        'Não foi possível arquivar agora.',
        ['pages.acervo.archive.failed', 'pages.freeNote.archive.failed'],
      ],
      [
        'Não foi possível salvar agora. Seu texto continua na tela.',
        ['pages.dayNote.save.failed', 'pages.freeNote.save.failed'],
      ],
      [
        'Pode ficar em branco.',
        [
          'pages.bookForm.fields.optionalHint',
          'pages.highlightForm.fields.pageHint',
        ],
      ],
      ['Preferências', ['nav.settings', 'pages.settings.title']],
      [
        'Referência',
        [
          'pages.freeNote.fields.reference',
          'pages.highlightForm.fields.reference',
        ],
      ],
      [
        'Salvando…',
        ['pages.dayNote.save.saving', 'pages.freeNote.save.saving'],
      ],
      ['Salvar', ['pages.bookForm.save', 'pages.highlightForm.save']],
      [
        'Salvar de novo',
        ['pages.dayNote.save.retry', 'pages.freeNote.save.retry'],
      ],
      ['Salvo', ['pages.dayNote.save.saved', 'pages.freeNote.save.saved']],
      [
        'Salvo {{time}}',
        ['pages.dayNote.save.savedAt', 'pages.freeNote.save.savedAt'],
      ],
      ['Senha', ['pages.acceptInvite.password', 'pages.login.password']],
      [
        'Somente leitura',
        ['pages.dayNote.others.readOnly', 'pages.freeNote.readOnly'],
      ],
      [
        'Tentar de novo',
        [
          'pages.acervo.retry',
          'pages.book.retry',
          'pages.bookForm.retry',
          'pages.busca.retry',
          'pages.dayNote.retry',
          'pages.freeNote.retry',
          'pages.highlightForm.retry',
          'pages.home.retry',
          'pages.settings.retry',
        ],
      ],
      [
        'Título',
        ['pages.bookForm.fields.title', 'pages.freeNote.fields.title'],
      ],
      [
        'Ver o acervo do livro',
        ['pages.book.acervoLink', 'pages.highlightForm.backToList'],
      ],
    ];

    /*
      O par positivo (§7.4): o mapa não é vazio (senão um `groups()` quebrado
      devolvendo `[]` casaria com uma lista vazia e o teste diria "não há
      gêmeas" provando "não há catálogo") e não é o catálogo inteiro.
    */
    // ⚠️ **28 → 27 na Tarefa 42 (2026-09-21)**: o grupo `'Alguém do clube'`
    // saiu porque o valor passou a ter um dono só. O número é conferido aqui
    // de propósito — ele é o que impede o mapa de encolher em silêncio.
    expect(REPEATED_PHRASES).toHaveLength(27);
    expect(REPEATED_PHRASES.length).toBeLessThan(entriesOf(pt).length / 4);

    expect(groups()).toEqual(REPEATED_PHRASES);
  });

  it('⚠️ makes the archive dialogs offer to KEEP, not to cancel (task 40, §A.9 keepAsIs)', () => {
    /*
      ⚠️ **ESTE TESTE PINA TEXTO DE PROPÓSITO, e é a exceção — porque aqui a
      DECISÃO É o texto.** `keepAsIs` não é chave nova: é troca de VALOR em
      duas chaves que diziam "Cancelar". O botão que não arquiva passa a dizer
      o que ele FAZ ("deixar como está") em vez de nomear o abandono de um
      formulário que não existe — não há formulário, há um diálogo de duas
      saídas.

      Sem esta linha a troca não tem acusador NENHUM: `acervo.test.tsx` e
      `free-note.test.tsx` buscam o botão por `pt.pages.*.archive.cancel`
      (medido), então eles continuam verdes com qualquer valor — inclusive com
      o antigo de volta. As duas telas dizem a MESMA frase porque é a mesma
      ação, e é o bloco `archive.*` inteiro que já é duplicado por tela.
    */
    expect(pt.pages.acervo.archive.cancel).toBe('Deixar como está');
    expect(pt.pages.freeNote.archive.cancel).toBe('Deixar como está');
    // E ela não pode falar a língua do botão que arquiva de verdade.
    expect(pt.pages.acervo.archive.cancel).not.toBe(
      pt.pages.acervo.archive.confirm,
    );
    expect(pt.pages.freeNote.archive.cancel).not.toBe(
      pt.pages.freeNote.archive.confirm,
    );
  });

  it('says a missing invite and an invalid invite differently, in pt', () => {
    const catalog = pt;
    /*
      A regra 15 da Tarefa 15 vive AQUI, e não na tela: "404 e 410 têm frases
      diferentes" é propriedade DO CATÁLOGO — dois valores distintos — e não
      comportamento de um componente. O teste de tela que a afirmava
      (`expect(pt.pages.acceptInvite.inviteNotFound).not.toBe(...)` dentro do
      `accept-invite.test.tsx`) era §7.2 na letra: propriedade do catálogo
      dentro de teste de tela, que passaria igual com a tela desmontada.

      ⚠️ Até a Tarefa 38d este era um `it.each` sobre `pt` e `en`, porque
      uma tradução copiada e colada mataria a distinção só em `en`. Com um
      catálogo só ele volta a ser um teste direto — e o nome diz qual, porque
      o nome é parte da guarda (§7.9).
    */
    const invite = catalog.pages.acceptInvite;

    expect(invite.inviteNotFound).not.toBe(invite.inviteExpired);
    expect(invite.alreadyInClub).not.toBe(invite.inviteExpired);
    expect(invite.alreadyInClub).not.toBe(invite.inviteNotFound);
  });

  it('⚠️ says the SIX feed sentences differently, in pt (task 35 rule 3, task 38e)', () => {
    const catalog = pt;
    /*
      ⚠️ **A LIÇÃO Nº 16 DO MVP 2 ESCRITA COMO TESTE: duas coisas que falam a
      MESMA frase são indistinguíveis pela varredura.** O feed da home tem
      quatro nascimentos (`ACTIVITY_TYPES`) e **seis frases** — os dois tipos
      que têm dia de leitura ganharam uma irmã COM o tema na Tarefa 38e —, e se
      duas delas dissessem a mesma coisa a pessoa não teria como saber se a
      outra escreveu ou grifou (nem se o tema entrou na linha) — e nenhuma
      varredura de DOM acusaria, porque a tela estaria renderizando texto
      legítimo.

      ⚠️ **E ELA MORA AQUI, NÃO NA TELA (§7.9).** "As frases são
      distintas" é propriedade de VALORES do catálogo: independe de
      estado e independe de tela. Até a Tarefa 38d ela também percorria os
      dois locales — esse era o argumento mais forte para ela morar aqui, e
      ele morreu com o segundo catálogo. Os outros dois continuam de pé: o
      feed tem treze estados, e uma varredura de tela só vê os que alguém
      lembrar de renderizar.

      O que o catálogo NÃO decide, e por isso continua na tela: que a tela
      escolha a chave certa para cada tipo — e, desde a 38e, que ela escolha a
      irmã COM tema só quando há tema. Frases distintas num catálogo que a tela
      lê por uma chave só ficariam verdes aqui. Os acusadores daquela metade são
      `activity-feed.test.ts` (o `activitySentenceKey`, onde a escolha é
      decidível sem tela) e `home.test.tsx` (a linha renderizada).
    */
    const feed = catalog.pages.home.feed;
    const sentences = [
      feed.planNote,
      feed.freeNote,
      feed.highlight,
      feed.read,
      // ⚠️ As DUAS da Tarefa 38e entram na MESMA varredura: elas são as frases
      // dos mesmos dois tipos quando há tema do dia, e uma delas igual à sua
      // irmã sem tema faria o tema sumir da linha sem nenhum vermelho.
      feed.planNoteOnTheme,
      feed.readOnTheme,
    ];

    // O par positivo: as seis existem e falam de alguém e de um livro. Sem ele,
    // seis strings vazias seriam "distintas" só no dia em que o `new Set`
    // mudasse de tamanho (§7.4).
    for (const sentence of sentences) {
      expect(sentence).toContain('{{name}}');
      expect(sentence).toContain('{{book}}');
    }
    expect(new Set(sentences).size).toBe(6);

    /*
      ⚠️ **E as duas com tema PRECISAM do buraco do tema** — uma frase de tema
      que esquecesse o `{{theme}}` seria distinta das outras cinco, passaria na
      contagem acima, e a tela diria "escreveu sobre , em O Hobbit". O tema é
      CONTEÚDO DO USUÁRIO (regra 7): o catálogo garante o buraco, nunca o texto
      que entra nele.
    */
    for (const sentence of [feed.planNoteOnTheme, feed.readOnTheme]) {
      expect(sentence).toContain('{{theme}}');
    }
    for (const sentence of [
      feed.planNote,
      feed.freeNote,
      feed.highlight,
      feed.read,
    ]) {
      expect(sentence).not.toContain('{{theme}}');
    }

    /*
      E os DOIS estados sem linha nenhuma também são distintos entre si — a
      lição das Tarefas 19/25/28, e a decisão G desta fatia: "ainda não há
      atividade" é constatação, "não foi possível carregar" é falha nossa, e
      uma frase só para os dois faz a pessoa achar que o clube está parado
      quando o que caiu foi a rede.
    */
    expect(feed.empty).not.toBe(feed.failed);
    expect(feed.loading).not.toBe(feed.empty);
    expect(feed.loading).not.toBe(feed.failed);
  });

  it('⚠️ says the FOUR device refusals differently, in pt (task 36b, decision G)', () => {
    const catalog = pt;
    /*
      ⚠️ **QUATRO CAUSAS COM QUATRO CONSERTOS DIFERENTES** — abrir por
      HTTPS/localhost · usar outro navegador · adicionar o PWA à tela de
      início · reverter a permissão. Uma frase genérica de "não deu" manda a
      pessoa adivinhar qual das quatro, e a quarta (o iPhone fora da tela de
      início) é a mais cruel porque **não parece falha**: o `PushManager`
      existe e o botão simplesmente não faria nada.

      ⚠️ **E ELA MORA AQUI, NÃO NA TELA (§7.9)**, pelo mesmo motivo do par de
      convite e dos quatro tipos do feed: "as quatro frases são distintas" é
      propriedade de QUATRO VALORES do catálogo, e a tela só mostra uma recusa
      por vez — a varredura teria de reproduzir os quatro ambientes.

      O que o catálogo NÃO decide, e por isso continua na tela: que a tela
      escolha a chave certa para cada recusa. O acusador daquela metade é
      `preferencias.test.tsx`.
    */
    const device = catalog.pages.settings.device;
    const refusals = [
      device.insecureContext,
      device.unsupported,
      device.iosNotInstalled,
      device.permissionDenied,
    ];

    // O par positivo (§7.4): sem ele, quatro strings vazias seriam
    // "distintas" só no dia em que o `new Set` mudasse de tamanho. E cada
    // recusa diz o CONSERTO, então nenhuma delas cabe em três palavras.
    for (const sentence of refusals) {
      expect(sentence.length).toBeGreaterThan(20);
    }
    expect(new Set(refusals).size).toBe(4);

    /*
      ⚠️ E nenhuma delas é a frase de "ainda não configurado" (decisão F):
      `enabled: false` é o estado NORMAL de quem clona o projeto sem VAPID, e
      não pode falar a mesma língua de uma falha.
    */
    expect(refusals).not.toContain(device.unavailable);

    /*
      ⚠️ E o TERCEIRO estado do aparelho — o `GET /notifications/config` que
      não respondeu — não fala a língua de nenhum dos outros dois. São
      consertos diferentes: `unavailable` pede configurar o servidor,
      `configFailed` pede tentar de novo.
    */
    expect(device.configFailed).not.toBe(device.unavailable);
    expect(refusals).not.toContain(device.configFailed);
  });

  it('has every key that apiErrorKey can return, in pt (rules 14 and 17)', () => {
    const keys = new Set(keyPaths(pt));

    // O elo que ninguém confere à mão: `apiErrorKey` devolve uma chave, e
    // uma chave ausente do catálogo aparece na tela como `errors.conflict`.
    expect(API_ERROR_KEYS.filter((key) => !keys.has(key))).toEqual([]);
  });

  it('⚠️ exports NO subpath for a second catalog (task 38d)', () => {
    /*
      ⚠️ **O SUBPATH `./locales/en` SAI, E ELE ERA A FRONTEIRA DE CORTE DO
      BUNDLER** (Tarefa 29a, decisão A): era dele que o `import()` dinâmico
      carregava o segundo catálogo, e era ele que dava ao Rollup um lugar por
      onde separar o chunk. Sem segundo catálogo não há o que carregar nem o
      que cortar.

      ⚠️ A asserção é de IGUALDADE do mapa inteiro, e não um
      `not.toHaveProperty`: um subpath a mais aqui é uma porta de entrada nova
      para o pacote, e ela tem de aparecer no diff de quem a abrir. Os quatro
      que sobram são os que já existiam antes da 29a.
    */
    const manifest: unknown = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../../package.json', import.meta.url)),
        'utf8',
      ),
    );
    const exportsField = (manifest as { exports: Record<string, string> })
      .exports;

    expect(exportsField).toEqual({
      '.': './src/index.ts',
      './client': './src/client/index.ts',
      './locales': './src/locales/index.ts',
      './anti-culpa': './src/locales/__tests__/guilt-terms.ts',
      './adr-0002': './src/locales/__tests__/privacy-terms.ts',
    });
  });
});
