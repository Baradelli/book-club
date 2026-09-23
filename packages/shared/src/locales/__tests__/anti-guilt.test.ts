import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { pt } from '../index';
import { COUNTER_EXEMPT_KEYS, GUILT_TERMS, STREAK_KEYS } from './guilt-terms';

/**
 * ⚠️ **O PRINCÍPIO ANTI-CULPA, GUARDADO NO CATÁLOGO** —
 * `docs/plano-clube-do-livro.md` §1: *"o sistema **não pune ausência de
 * registro**; valoriza qualquer registro útil. Quem está atrasado não vê dívida
 * vermelha nem 'você falhou 3 dias' — vê a leitura de hoje e um convite para
 * escrever."*
 *
 * ⚠️ **POR QUE AQUI, E NÃO SÓ NA TELA.** A primeira guarda deste princípio foi
 * uma varredura de DOM na home (`pages/__tests__/home.test.tsx`), e a auditoria
 * mediu que ela era em boa parte teatral: **três de quatro** cobranças plantadas
 * sobreviveram aos 192 testes. Duas das três falhas eram do LUGAR, não da lista:
 *
 * 1. **estado.** A varredura rodava em 6 dos 13 estados da home, e não no estado
 *    **com atalho** — que é exatamente onde um "você deixou 3 dias para trás"
 *    nasceria, ao lado da leitura de hoje. Uma guarda que depende de alguém
 *    lembrar de chamá-la no estado novo não é guarda;
 * 2. **locale.** Todo teste de tela pina `pt` (o `navigator.language` do jsdom é
 *    `en-US`, e sem o pino as asserções mudariam com o ambiente). Então um
 *    `"You're 3 days behind"` no catálogo `en` embarcava sem uma linha vermelha
 *    — e `en` é metade dos idiomas que o app declara suportar.
 *
 * O vocabulário da cobrança é propriedade **do catálogo**: são strings, não
 * comportamento. Aqui ele é varrido inteiro, sem renderizar nada — independente
 * de estado, independente de tela, e impossível de esquecer.
 *
 * ⚠️⚠️ **TAREFA 38d — O SEGUNDO CATÁLOGO NÃO EXISTE MAIS, E METADE DO
 * ARGUMENTO ACIMA MORREU COM ELE.** A medição registrada continua sendo história
 * verdadeira (foi ela que mudou o lugar da guarda), mas a **razão de locale**
 * deixou de valer: com um idioma só, a varredura de DOM vê o mesmo catálogo que
 * esta aqui. O que ainda faz esta guarda morar no catálogo, e não na tela, são
 * as outras duas razões do §7.9: ela independe de **estado** (a tela só é
 * varrida nos estados que alguém lembrar de renderizar) e alcança as frases que
 * **não passam por tela nenhuma** — as do push, montadas no backend.
 *
 * ⚠️ **E a rede que se perdeu, registrada:** o segundo catálogo era o que
 * pegava texto solto (*"se a frase não existe em dois lugares, ela não passou
 * pelo `t()`"*). No lugar dela sobraram a varredura de FONTE das telas e estas
 * varreduras de vocabulário — nenhuma das duas pega uma frase em português
 * escrita direto no JSX de uma tela que a varredura de fonte não cubra.
 *
 * O que continua na tela: o que **não** vem de catálogo. Um "0 de 30 dias"
 * renderizado a partir de dado, e a COR (um ponto vermelho ao lado do dia sem
 * anotação cobra sem escrever nada). Essa é a divisão.
 */

/**
 * ⚠️ **A EXCEÇÃO DECLARADA: `'voce nao'` NÃO está na lista acima.**
 *
 * `errors.forbidden` é *"Você não tem permissão para fazer isso."* — uma recusa
 * de autorização, que não tem nada a ver com ausência de registro. O termo
 * continua guardado onde ele É cobrança: a varredura de DOM da home, que só vê
 * as frases daquela tela.
 *
 * Está escrito porque a alternativa (isentar a chave) envelhece: uma isenção por
 * chave viraria uma lista de chaves que alguém amplia para calar o teste.
 */

/** `"você não"` → `"voce nao"`: a varredura não pode depender do acento. */
function withoutDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Toda folha do catálogo, com o caminho `a.b.c` que o `t()` receberia. */
function entries(value: unknown, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[prefix, value]];
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    entries(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

describe('the anti-guilt principle is a property of the CATALOG (plano §1)', () => {
  it('has no word of debt, delay or streak in pt', () => {
    const leaves = entries(pt);

    /*
      ⚠️ A GUARDA CONTRA A VARREDURA VAZIA (§7.4): sem esta linha, um `entries`
      quebrado devolvendo `[]` deixaria o `toEqual([])` abaixo verde — o teste
      diria "o catálogo não cobra" provando "o catálogo não existe".
    */
    expect(leaves.length).toBeGreaterThan(20);

    const offenders = leaves.flatMap(([path, text]) => {
      // ⚠️ A única isenção desta varredura — a do VOCABULÁRIO (ADR 0010) —, e
      // ela é nominal e PINADA logo abaixo: ampliá-la fica vermelho.
      //
      // ⚠️ Desde a Tarefa 40 existe uma segunda isenção no projeto, o
      // `COUNTER_EXEMPT_KEYS`, e ela NÃO tem efeito aqui: é isenção da guarda
      // de FORMATO, que roda sobre o DOM. "Dia 11 de 30" passa nesta varredura
      // por não ter palavra de cobrança nenhuma, não por estar isenta.
      if (STREAK_KEYS.includes(path)) return [];
      const normalized = withoutDiacritics(text);
      return GUILT_TERMS.filter((term) => normalized.includes(term)).map(
        (term) => `${path}: "${text}" (termo "${term}")`,
      );
    });

    expect(offenders).toEqual([]);
  });

  /**
   * ⚠️ **A ISENÇÃO NÃO PODE CRESCER EM SILÊNCIO — e é esta asserção que responde
   * à objeção escrita no docblock acima** ("uma isenção por chave viraria uma
   * lista de chaves que alguém amplia para calar o teste").
   *
   * Igualdade EXATA, não `toContain`: acrescentar uma chave aqui deixa este
   * teste vermelho, e quem ampliar tem de escrever no teste que está ampliando.
   * A objeção era contra a isenção que cresce sozinha; esta não cresce sozinha.
   */
  it('⚠️ isenta EXATAMENTE as chaves da corrente, e nada mais (ADR 0010)', () => {
    expect([...STREAK_KEYS].sort()).toEqual(
      [
        'pages.home.streak.atRisk',
        'pages.home.streak.days_one',
        'pages.home.streak.days_other',
        'pages.home.streak.mine',
        'pages.home.streak.none',
        'notifications.readingReminder.streakBody_one',
        'notifications.readingReminder.streakBody_other',
      ].sort(),
    );
  });

  /**
   * ⚠️ E as chaves isentas **existem de verdade** no catálogo. Sem isto, uma
   * isenção com o caminho errado (um `pages.hoome.') não isentaria nada e
   * ninguém notaria — a guarda continuaria verde por não ter o que isentar.
   */
  it('as chaves isentas de vocabulário existem no catálogo pt', () => {
    const paths = new Set(entries(pt).map(([path]) => path));
    for (const key of STREAK_KEYS) expect(paths.has(key)).toBe(true);
  });

  /**
   * ⚠️⚠️ **CADA LISTA ISENTA COM O DOCBLOCK DELA COLADO — e esta guarda nasceu
   * de um BLOQUEADOR da auditoria da Tarefa 40.**
   *
   * O que aconteceu: o docblock da isenção nova foi escrito **abaixo** do
   * docblock que ele queria emendar, e não acima da própria lista. Resultado
   * medido: `COUNTER_EXEMPT_KEYS` herdou **os dois** docblocks e `STREAK_KEYS`
   * ficou **sem nenhum** — a isenção do ADR 0010, que o dono reconfirmou contra
   * o §1 do plano, perdeu a justificativa de ao lado. E as duas palavras
   * "acima" apontaram para o lado errado do arquivo.
   *
   * Nada acusava, porque o TypeScript não liga para onde o comentário está e a
   * suíte inteira ficava verde. Num projeto em que a prosa ao lado da decisão
   * **é** o registro da decisão, um docblock órfão é perda de informação, não
   * de estilo — é a mesma classe do nome que não existe (`dayRange`).
   *
   * Duas propriedades, e a segunda é a que pega o defeito exato:
   *
   * 1. toda lista exportada tem um docblock **imediatamente** acima;
   * 2. não existem dois docblocks empilhados — um fechamento de bloco seguido
   *    direto de uma abertura, sem nada entre os dois, significa que um deles
   *    perdeu o dono.
   *
   * ⚠️ E a prosa acima não escreve os dois delimitadores literalmente de
   * propósito: um deles dentro de crase **fecha este docblock** e joga o resto
   * do texto para fora do comentário. Aconteceu ao escrever esta guarda, e o
   * `eslint` foi quem acusou (`no-unused-expressions`).
   */
  it('⚠️ keeps each exempt list glued to ITS docblock (task 40, blocker B1)', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./guilt-terms.ts', import.meta.url)),
      'utf8',
    );
    const lines = source.split(/\r?\n/);

    const exported = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /^export const [A-Z_]+/u.test(line));

    // O par positivo (§7.4): as três listas do arquivo. Sem esta linha, um
    // regex que não casa nada deixaria o laço abaixo verde para sempre.
    expect(exported).toHaveLength(3);

    const orphans = exported
      .filter(({ index }) => lines[index - 1]?.trim() !== '*/')
      .map(({ line }) => line);
    expect(orphans).toEqual([]);

    const stacked = lines
      .map((line, index) => ({ line, index }))
      .filter(
        ({ line, index }) =>
          line.trim() === '*/' && lines[index + 1]?.trim().startsWith('/**'),
      )
      .map(({ index }) => `linha ${index + 1}`);
    expect(stacked).toEqual([]);
  });

  /**
   * ⚠️ **A SEGUNDA ISENÇÃO DO PROJETO, E ELA É DE OUTRA GUARDA — a do FORMATO
   * (`COUNTER_SHAPE`), não a do vocabulário.**
   *
   * `COUNTER_SHAPE` proíbe `\d+ de \d+` no DOM, porque é a forma do placar. Mas
   * "Dia 11 de 30" **não é placar**: é a POSIÇÃO da leitura no plano — onde o
   * clube está no mês —, e ela não compara ninguém com ninguém nem registra
   * ausência. A decisão é do dono (`docs/BACKLOG.md`, decisões fechadas do MVP
   * 3.5), e a forma é a mesma do `STREAK_KEYS` do ADR 0010: **isenção nominal,
   * pinada por igualdade exata**.
   *
   * ⚠️ **POR QUE NOMINAL, E NÃO AFROUXAR O `COUNTER_SHAPE`.** Tirar `de` do
   * regex entregaria a mesma frase e desprotegeria todo o app: "3 de 30 dias"
   * em qualquer outra tela passaria a ser legal. A isenção por chave custa uma
   * linha no `toEqual` abaixo, e o custo é o ponto.
   *
   * ⚠️ **E A LISTA POR SI NÃO ISENTA NADA**, porque o `COUNTER_SHAPE` roda
   * sobre o DOM RENDERIZADO e não sobre chaves. Quem executa a isenção é a
   * varredura de DOM (`packages/app/src/pages/__tests__/anti-guilt-dom.ts`):
   * ela deriva desta lista a frase EXATA de cada chave — literal a literal,
   * com buraco só de dígito —, subtrai essas frases do texto e só então mede o
   * formato. Um `replace(/\d+ de \d+/g, '')` faria o mesmo teste ficar verde
   * isentando todo contador do app; é por isso que a subtração é exata e tem
   * par positivo lá.
   */
  it('⚠️ isenta EXATAMENTE a posição no plano do formato de placar (MVP 3.5)', () => {
    expect([...COUNTER_EXEMPT_KEYS].sort()).toEqual(
      ['pages.book.plan.dayOfPlan'].sort(),
    );
  });

  /**
   * ⚠️ O mesmo companheiro do `STREAK_KEYS`, e pela mesma razão: uma isenção
   * com o caminho errado (`pages.book.plan.dayOfPan`) não isentaria nada, e a
   * guarda ficaria verde por não ter o que isentar. Aqui é ainda pior que no
   * `STREAK_KEYS`, porque a varredura de DOM **deriva** a frase desta chave —
   * um caminho morto viraria uma subtração de string vazia.
   */
  it('as chaves isentas do contador existem no catálogo pt', () => {
    const paths = new Set(entries(pt).map(([path]) => path));
    for (const key of COUNTER_EXEMPT_KEYS) expect(paths.has(key)).toBe(true);
  });

  /**
   * ⚠️⚠️ **A ISENÇÃO DE FORMATO NÃO PODE ESCONDER UMA PALAVRA — e esta guarda
   * nasceu de um SOBREVIVENTE EQUIVALENTE da auditoria da Tarefa 40.**
   *
   * A varredura de DOM subtrai a frase isenta antes de medir o formato. Rotear
   * também o VOCABULÁRIO por essa subtração — varrer os `GUILT_TERMS` no texto
   * já subtraído — **sobrevive com zero acusadores**, e é equivalente HOJE por
   * inalcançabilidade: os literais do único padrão isento são `'Dia '` e
   * `' de '`, e nenhum dos 12 radicais é substring de nenhum dos dois.
   *
   * ⚠️ **Mas "equivalente hoje" é uma promessa com data.** No dia em que a
   * lista isenta ganhar uma frase como `'Dia {{number}} · faltam {{count}}'`, a
   * subtração passaria a apagar `falta` do texto junto com o formato — e a
   * guarda de vocabulário ficaria cega exatamente na frase que mais cobra.
   *
   * Então a prova deixa de ser prosa e vira asserção: **nenhum literal de
   * frase isenta contém radical de cobrança.** Com ela, a ordem das linhas do
   * `expectNoGuilt()` deixa de ser a única coisa que separa as duas varreduras,
   * e quem ampliar a isenção descobre o problema aqui em vez de na próxima
   * auditoria.
   */
  it('⚠️ keeps guilt words OUT of the exempt literals (task 40, equivalent survivor)', () => {
    const literals = COUNTER_EXEMPT_KEYS.flatMap((key) => {
      const template = entries(pt).find(([path]) => path === key)?.[1] ?? '';
      return template.split(/\{\{[A-Za-z][A-Za-z0-9]*\}\}/gu);
    }).filter((literal) => literal !== '');

    // O par positivo (§7.4): há literal de verdade para medir. Sem isto, uma
    // chave isenta que sumisse do catálogo deixaria o laço vazio e verde.
    expect(literals.length).toBeGreaterThan(0);

    const collisions = literals.flatMap((literal) =>
      GUILT_TERMS.filter((term) =>
        withoutDiacritics(literal).includes(term),
      ).map((term) => `"${literal}" contém "${term}"`),
    );
    expect(collisions).toEqual([]);
  });

  /**
   * ⚠️ **REGRA 15 DA TAREFA 37 — A MENSAGEM DO LEMBRETE ENTRA NA VARREDURA, E
   * ELA É A ÚNICA FRASE DO SISTEMA QUE CHEGA SEM A PESSOA ABRIR A TELA.**
   *
   * Toda outra frase do catálogo é lida por quem decidiu olhar. Esta acorda a
   * pessoa no celular — então ela é a que menos pode cobrar, e é justamente a
   * que NENHUMA varredura de DOM alcança: ela não passa por tela nenhuma, é
   * montada no backend (`packages/backend/src/notifications/reminder-message.ts`)
   * e sai pela rede. Se a guarda dela morasse numa tela, ela não existiria —
   * §7.9 na letra: a guarda mora onde a propriedade é DECIDÍVEL.
   *
   * Este teste não repete a varredura (o `has no word of debt, delay or streak
   * in pt` acima já percorre o catálogo inteiro): ele prova que as chaves novas
   * **estão dentro do conjunto varrido**. Sem ele, alguém que pusesse a
   * mensagem fora do catálogo — uma string no backend — teria as duas guardas
   * verdes e nenhuma delas olhando a frase.
   */
  it('puts the reading reminder itself inside the swept set, in pt', () => {
    const swept = entries(pt).map(([path]) => path);

    expect(swept).toEqual(
      expect.arrayContaining([
        'notifications.readingReminder.title',
        'notifications.readingReminder.body',
      ]),
    );
  });

  /**
   * ⚠️ **O MESMO MOLDE DA 37, PARA AS FRASES DA TAREFA 38 — e ele existe
   * porque a 38 trouxe DUAS famílias novas que chegam sem ninguém abrir tela.**
   *
   * A `readingReminder` acima é a do cron. Estas duas são as da 38:
   *
   * - **`notifications.groupActivity.*`** — "um incentiva o outro"
   *   (`CLAUDE.md`), disparado no mesmo caminho que grava o `ActivityEvent`
   *   (`docs/NOTIFICACOES.md` §6). É a frase com o maior risco de virar
   *   cobrança sem ninguém notar: ela fala do que **outra pessoa** fez, e a
   *   distância entre "alguém do clube leu hoje" e "todo mundo leu hoje, menos
   *   você" é uma palavra;
   * - **`notifications.test.*`** — o corpo do `POST /notifications/test`, que a
   *   pessoa dispara do botão de diagnóstico.
   *
   * Nenhuma das duas passa por tela nenhuma: as duas são montadas no backend
   * (`notifications/group-activity-message.ts` e
   * `notifications/diagnostic-message.ts`) e saem pela rede. **Se a guarda
   * delas morasse numa tela, ela não existiria** — §7.9 na letra.
   *
   * ⚠️ **E este teste NÃO repete a varredura** (o `has no word of debt, delay
   * or streak in pt` do topo já percorre o catálogo inteiro): ele prova que as
   * chaves estão **dentro do conjunto varrido**. Sem ele, alguém que escrevesse
   * a
   * frase no backend — uma string em `group-activity-message.ts` em vez de uma
   * chave — teria as duas guardas verdes e nenhuma delas olhando a frase, que é
   * exatamente o buraco que o §7.9 descreve.
   */
  it('puts the group-activity notice and the test push inside the swept set, in pt', () => {
    const swept = entries(pt).map(([path]) => path);

    expect(swept).toEqual(
      expect.arrayContaining([
        // A frase que o clube recebe quando alguém lê, escreve ou grifa —
        // uma por nascimento, porque são notícias diferentes.
        'notifications.groupActivity.title',
        'notifications.groupActivity.planNote',
        'notifications.groupActivity.freeNote',
        'notifications.groupActivity.highlight',
        'notifications.groupActivity.read',
        // O "chegou?" do botão de diagnóstico.
        'notifications.test.title',
        'notifications.test.body',
      ]),
    );
  });

  it('would catch the phrases the audit walked through, English included', () => {
    /*
      ⚠️ O LADO POSITIVO DO PAR, e ele é o que impede a lista de virar decoração:
      um `GUILT_TERMS` esvaziado (ou um `includes` invertido) deixaria o teste
      acima verde para sempre. Estas são as frases MEDIDAS que passaram pela
      varredura antiga.

      ⚠️ **As duas em INGLÊS ficam, mesmo sem catálogo `en` (Tarefa 38d)**, e
      a razão é que o `GUILT_TERMS` não serve só a este arquivo: ele é a mesma
      lista da varredura de DOM e da de fonte do `app`, onde uma frase em
      inglês escrita direto no JSX continua alcançável. Apagar os radicais
      ingleses aqui desprotegeria lá — e nada acusaria.
    */
    const planted = [
      'Você deixou 3 dias para trás',
      'Suas leituras em atrazo: 3',
      "You're 3 days behind on this book",
      'Você tem 2 leituras pendentes',
      'Your streak: 0 days',
    ];

    for (const phrase of planted) {
      const normalized = withoutDiacritics(phrase);
      expect(GUILT_TERMS.some((term) => normalized.includes(term))).toBe(true);
    }
  });
});
