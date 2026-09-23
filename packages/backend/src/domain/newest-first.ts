/**
 * "O mais recente primeiro" — `createdAt` **desc**, empate desfeito por `id`
 * **asc**. Ordem TOTAL, e um dono só.
 *
 * ⚠️ **ELA MOROU EM CINCO LUGARES ATÉ A RODADA DE CORREÇÃO DA TAREFA 44b**, e
 * a quinta cópia divergiu: `list-notes.ts`, `list-highlights.ts`,
 * `list-books.ts` (com o `month` na frente) e o `compareForTheFeed` do
 * `ActivityEventRepositoryFake` comparavam por **code point**; o
 * `lastActiveByBook` do `HighlightRepositoryFake`, escrito por último, usou
 * `localeCompare`. Ninguém acusou: medido, **inverter o desempate daquele
 * fake passava por 1987 testes unitários sem um vermelho**.
 *
 * É o §7.1 do `docs/CONVENCOES-CODIGO.md` na frase que ele mesmo prescreve —
 * *"extrair, não cobrir duas vezes"* —, e é a lição nº 3 do MVP 1 (regra que
 * mora em N lugares). O que estava duplicado **não** é detalhe de cada
 * listagem: é a codificação da MESMA cláusula que os dois repositórios Prisma
 * pedem ao Postgres (`orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]`). O
 * acoplamento já existia; ele só não estava escrito num lugar. Agora uma
 * mutação do dono único atinge os cinco chamadores — que é exatamente o que o
 * `sql-equality.ts` (Tarefa 23) e o `club-names.ts` (Tarefa 28) compraram.
 *
 * ⚠️ **`createdAt` E NUNCA `updatedAt`.** A nota do dia é reescrita a cada
 * autosave e o comentário de um grifo antigo pode ser corrigido hoje: por
 * `updatedAt` a lista pularia embaixo do dedo de quem digita, e "o último
 * grifo" do livro seria o último *editado*.
 *
 * ⚠️ **O DESEMPATE NÃO É DECORAÇÃO.** `createdAt` sozinho não é ordem total, e
 * empate no mesmo milissegundo é o caso NORMAL de um clube: duas pessoas
 * salvando ao mesmo tempo, o retry da fila offline, um seed em lote. Sem ele a
 * ordem sairia como o repositório enumerou — que é diferente entre o fake
 * (§7.2: ele enumera INVERTIDO de propósito) e o Prisma, e mudaria a cada
 * recarga na tela.
 *
 * ⚠️ **COMPARAÇÃO POR CODE POINT, E NUNCA `localeCompare`** — a mesma razão
 * que o `compareByName` do `list-club-members.ts` já escrevia: escolher locale
 * no backend exigiria decidir de QUEM (do clube? de quem lê?). E os dois
 * discordam de verdade: `'A'.localeCompare('a')` é **1**, `'A' < 'a'` é
 * **true**. Nos ids de produção (`randomUUID()`, alfabeto `[0-9a-f-]`) a
 * divergência é latente — varridos os 1.206.681 pares, zero —, mas id de
 * FIXTURE é escrito à mão, e é ali que a maiúscula entra.
 *
 * ⚠️ **O QUE ESTE MÓDULO NÃO DECIDE:** qual ordem o Postgres daria. Isso é do
 * teste de contrato contra o banco real, que é o único lugar onde a pergunta é
 * decidível (§7.10) — `breaks a createdAt tie by id, the same total order the
 * listing uses`, no contrato do `PrismaHighlightRepository`.
 */

/**
 * O par mínimo que a ordem consome, e o **único** vocabulário que ela conhece.
 *
 * Estrutural de propósito, como o `PlanItemMark` do `plan-item-groups.ts`
 * (decisão C da Tarefa 31): amarrá-lo a `Note`, `Highlight`, `Book` ou
 * `ActivityEvent` faria as outras três dependerem do vocabulário alheio. Como
 * o TypeScript é estrutural, as quatro entidades satisfazem este tipo como
 * estão — sem conversão e sem `as`.
 */
export interface NewestFirst {
  createdAt: Date;
  id: string;
}

export function compareNewestFirst(a: NewestFirst, b: NewestFirst): number {
  const byCreatedAt = b.createdAt.getTime() - a.createdAt.getTime();
  if (byCreatedAt !== 0) return byCreatedAt;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
