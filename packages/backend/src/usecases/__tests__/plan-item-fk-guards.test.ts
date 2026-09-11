import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * ⚠️ **A GUARDA CONTRA A QUARTA FK — e ela é a entrega principal da Tarefa
 * 34b, não a terceira guarda.**
 *
 * O `replacePlanItems` recusa a remoção de um dia do plano que ainda está
 * ancorado em alguma coisa, e dá **400 com mensagem** em vez do **500 mudo** do
 * `ON DELETE RESTRICT`. Hoje são três âncoras — `Note` (Tarefa 11),
 * `ReadingLog` (32c) e `ActivityEvent` (34b) —, e **as três guardas foram
 * escritas depois do estrago**:
 *
 * | Fatia | O que ela introduziu | Quem consertou |
 * | --- | --- | --- |
 * | 06/11 | `Note.planItemId` | a própria 11 |
 * | **32** | `ReadingLog.planItemId` **sem guarda** | a **32c** |
 * | **34** | `ActivityEvent.planItemId` **sem guarda** | a **34b** |
 *
 * **Duas vezes é coincidência; três é padrão.** Nas duas últimas a lacuna só
 * apareceu porque *alguém foi procurar* — e um requisito que depende de alguém
 * lembrar de procurar é intenção, não requisito (`docs/CONVENCOES-CODIGO.md`
 * §7.9). Esta é a guarda automática: ela lê o `schema.prisma`, acha **toda**
 * relação com `ReadingPlanItem` que **recusa** a remoção — o
 * `onDelete: Restrict` escrito **e o implícito** de relação obrigatória, que é
 * o default do Prisma —, e exige que o
 * `replace-plan-items.ts` tenha uma guarda para cada uma. No dia em que alguém
 * acrescentar a quarta FK, ela fica **vermelha** — e diz **qual** ficou sem
 * guarda, para quem a vir vermelha saber o que fazer.
 *
 * ## Por que o `schema.prisma`, e não o `Prisma.dmmf`
 *
 * Mesmo motivo que a Tarefa 33 mediu e a 34 confirmou (decisão C): o
 * `schema.prisma` é a fonte da verdade e o cliente é **derivado** dele. Um
 * `dmmf` desatualizado — quem declarou o modelo e ainda não rodou
 * `prisma generate` — deixaria a guarda dormindo exatamente na janela em que
 * ela precisa acordar, que é a janela em que a FK nova ainda não tem guarda.
 *
 * ## Por que aqui, e não numa tabela `{consulta, mensagem}` no UseCase
 *
 * Decisão B da 34b, e o teste decisivo é este: **uma tabela não mataria o
 * bug** — não porque ela sumiria junto com a guarda (essa explicação foi
 * medida e é **falsa**: esta varredura casa o texto `.planItemIdsWithAnyX(` em
 * qualquer ponto do arquivo, então uma tabela com os três nomes continuaria
 * satisfazendo-a), e sim porque **uma tabela não deriva de nada**. A quarta FK
 * que nascer sem linha nela não fica vermelha em lugar nenhum — é uma segunda
 * lista à mão, ao lado do schema, com a mesma chance de ficar para trás. A
 * forma das três guardas se repete, mas a regra de cada uma não (repositório
 * diferente, mensagem diferente por decisão de produto). Generalizar ali seria
 * arrumar a prateleira sem trancar a porta; a porta é este arquivo, e ela é a
 * única coisa aqui que **deriva do `schema.prisma`**.
 *
 * E mora em `usecases/__tests__/`, ao lado do UseCase (decisão D): é onde quem
 * acrescenta a guarda vai olhar.
 */

const BACKEND_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const SCHEMA = readFileSync(`${BACKEND_ROOT}/prisma/schema.prisma`, 'utf8');
const GUARD_SOURCE = readFileSync(
  `${BACKEND_ROOT}/src/usecases/replace-plan-items.ts`,
  'utf8',
);

/** A FK que pode recusar a remoção de um dia do plano. */
interface PlanItemFk {
  /** O modelo Prisma que aponta para o `ReadingPlanItem`. */
  model: string;
  /** O campo de relação dentro dele. */
  field: string;
}

/**
 * Tira comentário de linha do schema **antes** de varrer.
 *
 * Não é zelo: o `schema.prisma` deste projeto é meio prosa, e há comentários
 * que citam `ReadingPlanItem`, `onDelete: Restrict` e até o nome das guardas.
 * Varrer o arquivo cru faria a guarda achar FK onde há explicação.
 */
function withoutPrismaComments(schema: string): string {
  return schema
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

/**
 * Tira comentário do TypeScript.
 *
 * ⚠️ **Esta é a metade que impede o falso verde mais provável desta guarda.**
 * O docblock do `replacePlanItems` **cita** `planItemIdsWithAnyNote` e os dois
 * irmãos, em prosa — então procurar o nome no arquivo cru daria verde para uma
 * guarda que alguém apagou e deixou o comentário. O que a guarda procura é a
 * **chamada**, no código que sobra depois de tirar os comentários.
 */
function withoutTsComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

/**
 * Toda relação `ReadingPlanItem` que **recusa** a remoção de um dia, modelo por
 * modelo — e "recusa" inclui o `Restrict` que ninguém escreveu.
 *
 * ⚠️ **O `onDelete` do Prisma tem DEFAULT, e o default depende da
 * obrigatoriedade**, o que faz a mesma omissão significar coisas opostas:
 *
 * | Declaração | O que sai no Postgres | Recusa a remoção? |
 * | --- | --- | --- |
 * | `@relation(..., onDelete: Restrict)` | `ON DELETE RESTRICT` | **sim** |
 * | `ReadingPlanItem  @relation(...)` (obrigatória, sem `onDelete`) | `ON DELETE RESTRICT` | **sim** |
 * | `ReadingPlanItem? @relation(...)` (opcional, sem `onDelete`) | `ON DELETE SET NULL` | não |
 * | qualquer `onDelete` declarado que não seja `Restrict` | o declarado | não |
 *
 * A segunda linha é o furo que esta guarda tem de cobrir, e ele é **do tamanho
 * do padrão do Prisma**: a quarta FK pode nascer recusando de verdade sem uma
 * palavra escrita. O fato não é suposto — o `schema.prisma` deste projeto já o
 * registra medido, no docblock do `ReadingLog.planItem` (*"lido do SQL gerado
 * na Tarefa 24, não suposto"*). E a terceira linha tem de continuar fora: o
 * `SetNull` zera coluna em vez de recusar, e cobrar guarda dela seria ruído.
 *
 * Recebe o schema como STRING — e não lê o arquivo por dentro — porque é isso
 * que torna o predicado simulável: a regra 12 o alimenta com um schema
 * fabricado, e prova que a guarda **vira**, sem criar modelo nem rodar
 * migration.
 */
function restrictFksToPlanItem(schema: string): PlanItemFk[] {
  const found: PlanItemFk[] = [];
  const models = withoutPrismaComments(schema).matchAll(
    /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm,
  );

  for (const [, model, body] of models) {
    if (model === undefined || body === undefined) continue;
    // `ReadingPlanItem` ou `ReadingPlanItem?` seguido de `@relation(...)`. A
    // relação de lista (`ReadingPlanItem[]`, o lado de trás) não casa, e é
    // certo que não case: ela não é a que recusa a remoção.
    const fields = body.matchAll(
      /^\s*(\w+)\s+ReadingPlanItem(\?)?\s+@relation\(([^)]*)\)/gm,
    );
    for (const [, field, optional, args] of fields) {
      if (field === undefined || args === undefined) continue;
      const declared = /\bonDelete:\s*(\w+)/.exec(args)?.[1];
      // Declarado manda; omitido cai no default, que é `Restrict` para relação
      // obrigatória e `SetNull` para opcional.
      const restricts =
        declared === undefined
          ? optional === undefined
          : declared === 'Restrict';
      if (restricts) found.push({ model, field });
    }
  }

  return found;
}

/**
 * O nome do método de guarda que um modelo exige — e a convenção é MECÂNICA de
 * propósito.
 *
 * `Note` → `planItemIdsWithAnyNote`; `ReadingLog` →
 * `planItemIdsWithAnyReadingLog`; `ActivityEvent` →
 * `planItemIdsWithAnyActivityEvent`. Sem tabela de-para: uma tabela seria mais
 * uma lista à mão para alguém esquecer de atualizar, que é exatamente o defeito
 * que esta guarda existe para fechar (decisão B).
 *
 * ⚠️ É por isso que o método da 34b se chama `planItemIdsWithAnyActivityEvent`,
 * e não `...WithAnyActivity`: o nome do modelo, inteiro, é o que faz a guarda
 * funcionar sozinha para a QUARTA FK, que ninguém pode prever.
 */
function guardMethodFor(model: string): string {
  return `planItemIdsWithAny${model}`;
}

/**
 * As FKs que NÃO têm guarda no `replacePlanItems` — vazio é o estado saudável.
 *
 * ⚠️ **O LIMITE, e ele precisa estar escrito aqui:** isto prova que a
 * **chamada** existe, **não** que ela recusa. Medido nesta fatia — com a
 * chamada mantida e o `throw` removido, esta guarda fica **VERDE** e são os
 * sete testes de comportamento que acusam. Para as três FKs de hoje é
 * inofensivo (o comportamento tem teste); para a **quarta** é justamente o
 * estado em que teste de comportamento ainda não existe, e é por isso que a
 * mensagem de falha diz *"add a call … that throws"*.
 *
 * A recusa é provada em `usecases/__tests__/replace-plan-items.test.ts`, nos
 * três `describe('the guard that refuses to remove a day that has …')` e no
 * `describe('the message never lies about which guard refused')`. **O ponteiro
 * é pelo NOME do teste, nunca pela linha** (§7.4).
 */
function unguarded(schema: string, source: string): PlanItemFk[] {
  const code = withoutTsComments(source);
  return restrictFksToPlanItem(schema).filter(
    (fk) => !code.includes(`.${guardMethodFor(fk.model)}(`),
  );
}

/**
 * O que a guarda diz quando fica vermelha.
 *
 * Sem isto, quem vir o `expect([...]).toEqual([])` falhar sabe que alguma coisa
 * está errada e não sabe o quê — e a guarda vira ruído que alguém desliga.
 */
function orphanMessage(orphans: PlanItemFk[]): string {
  return [
    `${orphans.length} foreign key(s) that refuse the delete (onDelete: Restrict, declared or the Prisma default of a required relation) point at ReadingPlanItem with NO domain guard in replace-plan-items.ts:`,
    ...orphans.map(
      (fk) =>
        `  - ${fk.model}.${fk.field}: add a call to .${guardMethodFor(fk.model)}(removedIds) that throws InvalidBookError, or removing a plan day anchored by ${fk.model} answers 500 instead of 400.`,
    ),
  ].join('\n');
}

describe('every RESTRICT foreign key to ReadingPlanItem has a domain guard', () => {
  /**
   * ⚠️ **AS PRÉ-CONDIÇÕES, e sem elas o resto é asserção vazia** (§7.4): um
   * caminho errado devolveria string vazia, a varredura não acharia FK nenhuma
   * e o `toEqual([])` da guarda passaria **sem ter olhado nada**.
   */
  it('reads the real schema and the real UseCase', () => {
    expect(SCHEMA).toContain('model ReadingPlanItem {');
    expect(SCHEMA).toContain('model ActivityEvent {');
    expect(GUARD_SOURCE).toContain('export class ReplacePlanItems');
    // E o código sem comentário continua sendo código: se o removedor de
    // comentário comesse o arquivo, todas as FKs virariam órfãs — vermelho, e
    // não verde, mas por um motivo que não é o desta guarda.
    const code = withoutTsComments(GUARD_SOURCE);
    expect(code).toContain('export class ReplacePlanItems');
    expect(code).toContain('throw new InvalidBookError');
  });

  /**
   * ⚠️ **O ANTÍDOTO DO §7.4, a segunda metade: a varredura tem de ACHAR.**
   *
   * Um regex quebrado devolveria `[]`, e um `[]` faz a guarda de baixo passar
   * para sempre sem olhar nada — a guarda que parece cobrir e não cobre (§7.9).
   * Aqui a varredura declara o que ela achou HOJE, e as três são nomeadas: são
   * exatamente as três FKs que a Tarefa 34b mediu no `schema.prisma` e nas
   * migrations aplicadas.
   *
   * ⚠️ **`arrayContaining`, e não igualdade**: uma QUARTA FK legítima, com
   * guarda, não pode quebrar este teste — quem cobra a guarda dela é o teste
   * seguinte, e é lá que a cobrança tem de aparecer.
   */
  it('finds the three foreign keys that exist today, and does not come back empty', () => {
    const fks = restrictFksToPlanItem(SCHEMA);

    expect(fks.length).toBeGreaterThanOrEqual(3);
    expect(fks).toEqual(
      expect.arrayContaining([
        { model: 'Note', field: 'planItem' },
        { model: 'ReadingLog', field: 'planItem' },
        { model: 'ActivityEvent', field: 'planItem' },
      ]),
    );
  });

  /**
   * ⚠️ **A GUARDA.** Toda FK `Restrict` para o `ReadingPlanItem` tem de ter, no
   * `replacePlanItems`, uma chamada à leitura que a antecipa.
   *
   * A mensagem de falha nomeia a órfã e diz o que fazer — ver `orphanMessage`.
   */
  it('leaves no foreign key without a guard', () => {
    const orphans = unguarded(SCHEMA, GUARD_SOURCE);

    expect(orphans, orphanMessage(orphans)).toEqual([]);
  });

  /**
   * ⚠️ **REGRA 12 — a prova de que a guarda VIRA, sem criar modelo e sem rodar
   * migration.**
   *
   * O predicado é alimentado com um schema fabricado: o de verdade mais um
   * quarto modelo com a mesma FK. Sem esta simulação, a guarda acima estaria
   * verde hoje e ninguém saberia se ela **pode** ficar vermelha — que é
   * exatamente a auditoria que a Tarefa 33 pediu para a guarda irmã.
   */
  it('flips the moment a fourth foreign key arrives without a guard', () => {
    const asOfSomeFutureTask = `${SCHEMA}
model Bookmark {
  id         String  @id
  planItemId String?

  planItem ReadingPlanItem? @relation(fields: [planItemId], references: [id], onDelete: Restrict)
}
`;

    // A varredura enxerga a quarta...
    expect(restrictFksToPlanItem(asOfSomeFutureTask)).toEqual(
      expect.arrayContaining([{ model: 'Bookmark', field: 'planItem' }]),
    );
    // ...e a guarda a acusa, sozinha: as três de hoje continuam cobertas.
    expect(unguarded(asOfSomeFutureTask, GUARD_SOURCE)).toEqual([
      { model: 'Bookmark', field: 'planItem' },
    ]);
  });

  /**
   * ⚠️ **REGRA 14 — a mensagem NOMEIA a órfã.**
   *
   * Uma guarda vermelha que não diz qual FK ficou sem guarda faz quem a vê
   * procurar no lugar errado — e o §7.9 registra que guarda no lugar errado é
   * pior que nenhuma, porque dá sensação de cobertura. Aqui o nome do modelo, o
   * do campo e o do método esperado saem na mensagem.
   */
  it('names the orphan foreign key, the field and the method to write', () => {
    const message = orphanMessage([{ model: 'Bookmark', field: 'planItem' }]);

    expect(message).toContain('Bookmark.planItem');
    expect(message).toContain('planItemIdsWithAnyBookmark');
    expect(message).toContain('replace-plan-items.ts');
    // E o custo, para quem não souber por que isto importa: é o 500 de volta.
    expect(message).toContain('500');
  });

  /**
   * O outro lado da varredura, e ele é o que a impede de acusar à toa. Três
   * coisas que **parecem** a FK guardada e não são:
   *
   * - a relação de lista (`ReadingPlanItem[]`, o lado de trás em `Book` e no
   *   próprio `ReadingPlanItem`) — ela não recusa remoção nenhuma;
   * - uma FK com outro `onDelete` — `Cascade` e `SetNull` não recusam nada
   *   (apagam ou zeram, que é outro problema, e não o desta guarda);
   * - o schema é meio prosa: há comentário citando `ReadingPlanItem` e
   *   `onDelete: Restrict` em quase todo modelo.
   *
   * Sem este teste, uma varredura frouxa acusaria modelos que não existem e a
   * guarda viraria ruído — e ruído é o que faz alguém apagá-la.
   */
  it('never mistakes a back-relation, another onDelete, nor a comment for a guarded FK', () => {
    const noise = `
model Shelf {
  id String @id

  // planItem ReadingPlanItem? @relation(fields: [planItemId], references: [id], onDelete: Restrict)
  days ReadingPlanItem[]
}

model Bookmark {
  id         String @id
  planItemId String

  planItem ReadingPlanItem @relation(fields: [planItemId], references: [id], onDelete: Cascade)
}
`;

    expect(restrictFksToPlanItem(noise)).toEqual([]);
    // A precondição do par: com o `onDelete` certo, o MESMO texto é achado —
    // senão um regex que nunca casa passaria neste teste.
    expect(restrictFksToPlanItem(noise.replace('Cascade', 'Restrict'))).toEqual(
      [{ model: 'Bookmark', field: 'planItem' }],
    );
  });

  /**
   * ⚠️ **O `onDelete: Restrict` IMPLÍCITO conta — e ele é o furo do tamanho do
   * padrão do Prisma.**
   *
   * Uma relação **OBRIGATÓRIA** sem `onDelete` **é** `ON DELETE RESTRICT` no
   * Postgres. Isso não é suposição: o `schema.prisma` deste projeto já o
   * registra medido, no `ReadingLog.planItem` (*"para relação OBRIGATÓRIA o
   * default do Prisma já é `Restrict` (lido do SQL gerado na Tarefa 24, não
   * suposto)"*). Então a quarta FK pode nascer recusando remoção **de verdade**
   * e sem guarda, pela porta que o Prisma abre por omissão — e uma guarda que
   * só enxergasse o `onDelete` escrito ficaria verde exatamente no caso que ela
   * existe para matar.
   *
   * ⚠️ **E a relação OPCIONAL sem `onDelete` tem de continuar de fora:** para
   * ela o default é `SetNull`, que **não recusa** nada (zera a coluna — outro
   * problema, e não o desta guarda). Incluí-la faria a guarda cobrar guarda de
   * quem não precisa, e guarda que cobra à toa é a que alguém desliga.
   *
   * A convenção "declare o `onDelete` explicitamente" existe em **três**
   * comentários do schema e em guarda automática nenhuma (§7.9) — esta linha é
   * o que faz a diferença entre a convenção e o requisito.
   */
  it('counts the implicit Restrict of a required relation, and never the SetNull of an optional one', () => {
    const implicitRequired = `
model Bookmark {
  id         String @id
  planItemId String

  planItem ReadingPlanItem @relation(fields: [planItemId], references: [id])
}
`;
    const implicitOptional = `
model Sticker {
  id         String  @id
  planItemId String?

  planItem ReadingPlanItem? @relation(fields: [planItemId], references: [id])
}
`;

    // OBRIGATÓRIA sem `onDelete` = RESTRICT no banco: conta.
    expect(restrictFksToPlanItem(implicitRequired)).toEqual([
      { model: 'Bookmark', field: 'planItem' },
    ]);
    // OPCIONAL sem `onDelete` = SetNull: não recusa nada, não conta.
    expect(restrictFksToPlanItem(implicitOptional)).toEqual([]);
    // E o par que impede a conta de virar "toda relação obrigatória conta": com
    // um `onDelete` DECLARADO que não é `Restrict`, o declarado manda.
    expect(
      restrictFksToPlanItem(
        implicitRequired.replace(
          'references: [id]',
          'references: [id], onDelete: Cascade',
        ),
      ),
    ).toEqual([]);
  });

  /**
   * ⚠️ **E a guarda VIRA também pela FK implícita** — o mesmo teste da regra 12,
   * na forma que o Prisma produz quando ninguém escreve o `onDelete`. Sem este
   * lado, a correção do parser existiria e a guarda continuaria sem cobrá-la.
   */
  it('flips when the fourth foreign key arrives with an implicit Restrict', () => {
    const asOfSomeFutureTask = `${SCHEMA}
model Bookmark {
  id         String @id
  planItemId String

  planItem ReadingPlanItem @relation(fields: [planItemId], references: [id])
}
`;

    expect(unguarded(asOfSomeFutureTask, GUARD_SOURCE)).toEqual([
      { model: 'Bookmark', field: 'planItem' },
    ]);
    expect(
      orphanMessage(unguarded(asOfSomeFutureTask, GUARD_SOURCE)),
    ).toContain('Bookmark.planItem');
  });

  /**
   * ⚠️ **O falso verde mais provável desta guarda, fechado: o nome do método
   * num COMENTÁRIO não vale como guarda.**
   *
   * O docblock do `replacePlanItems` cita os três métodos em prosa. Se a
   * varredura olhasse o arquivo cru, apagar a chamada e deixar o comentário
   * deixaria a guarda **verde** — e o comentário é justamente a primeira coisa
   * que sobrevive a um refactor apressado (§7.1: fidelidade afirmada em
   * comentário e não em teste é fidelidade que o próximo refactor apaga).
   */
  it('does not accept a guard that exists only in a comment', () => {
    const commentOnly = `
export class ReplacePlanItems {
  async execute() {
    // a guarda de nota usa notes.planItemIdsWithAnyNote(removedIds)
    /** e a de leitura, .planItemIdsWithAnyReadingLog(removedIds) */
    throw new InvalidBookError('nada guardado de verdade');
  }
}
`;

    expect(unguarded(SCHEMA, commentOnly)).toEqual(
      restrictFksToPlanItem(SCHEMA),
    );
    // A precondição: com a chamada de VERDADE no código, a mesma FK deixa de
    // ser órfã — senão um `unguarded` que devolvesse tudo passaria aqui.
    expect(
      unguarded(SCHEMA, `${commentOnly}\nnotes.planItemIdsWithAnyNote(ids);`),
    ).not.toEqual(
      expect.arrayContaining([{ model: 'Note', field: 'planItem' }]),
    );
  });
});
