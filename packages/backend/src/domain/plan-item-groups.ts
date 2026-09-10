import type { ReadingPlanItem } from './book';

/**
 * "Esta pessoa marcou este dia do plano" — o par mínimo que o agrupamento
 * consome, e o **único** vocabulário que ele conhece.
 *
 * É **estrutural de propósito** (decisão C da Tarefa 31): não é `PlanItemWriter`
 * nem `ReadingLog`, e não deve virar nenhum dos dois. Amarrá-lo a uma das
 * entidades faria a outra depender do vocabulário alheio — a autoria passaria a
 * importar leitura, ou a leitura a importar nota —, e o terceiro candidato (o
 * `ActivityEvent` da Tarefa 33) não é nem nota nem leitura. Como o TypeScript é
 * estrutural, `PlanItemWriter[]` e `ReadingLog[]` satisfazem este parâmetro
 * como estão, sem conversão e sem `as`.
 */
export interface PlanItemMark {
  planItemId: string;
  userId: string;
}

/**
 * "Neste dia de leitura, estas pessoas" — uma linha de uma sobreposição da tela
 * do livro, sem dizer **de que** sobreposição se trata.
 *
 * Quem dá nome ao dado é a chamadora (`PlanItemWriters`, `PlanItemReaders`),
 * nunca este módulo: um tipo que se chamasse `writers` e carregasse leitores
 * seria a prosa-que-mente que a Tarefa 29a pagou duas vezes.
 *
 * `userIds` é **ordenado**, para a saída ser determinística: nenhum port de
 * leitura promete ordem, e o fake enumera invertido de propósito
 * (CONVENCOES-CODIGO §7.2).
 */
export interface PlanItemGroup {
  planItemId: string;
  /** Ordenado, para a saída ser determinística. */
  userIds: string[];
}

/**
 * Agrupa os pares (dia, pessoa) **na ordem do plano**. Puro: sem I/O, sem
 * relógio e sem mutar o que recebe.
 *
 * ## Por que ela é neutra, e não "de autoria"
 *
 * Esta conta nasceu na Tarefa 11 como `groupWritersByPlanItem`, com dois
 * chamadores: o `getBookWithPlan` a devolve ao abrir o livro, e o
 * `listPlanItemWriters` continua existindo para a tela atualizar **só a
 * sobreposição** depois de alguém escrever, sem rebuscar o livro inteiro. O
 * MVP 3 traz o **terceiro** — "quem já leu em cada dia" —, e ele faz
 * exatamente a mesma conta sobre `ReadingLog`.
 *
 * A saída é a que o `CONVENCOES-CODIGO` §7.1 já tinha decidido por antecipação,
 * nomeando esta fatia: **extrair, não cobrir duas vezes**. E a lição nº 15 do
 * MVP 2 (o acusador vem primeiro, a extração depois) estava satisfeita **antes**
 * da extração — os 12 testes deste módulo são os mesmos, com os mesmos nomes,
 * que já cobriam o agrupamento de autoria.
 *
 * ⚠️ O que **não** se fez, e é a decisão B da tarefa: reusar
 * `groupWritersByPlanItem` direto para a leitura. Ele compila hoje (a tipagem é
 * estrutural, e `ReadingLog` tem os dois campos), e mesmo assim está recusado —
 * um `writers` devolvendo leitores é pior que uma cópia, porque a cópia pelo
 * menos se vê.
 *
 * ## As três propriedades, e de onde elas vêm
 *
 * Todas as três vêm de o array ser construído a partir do **plano**, e não dos
 * pares:
 *
 * 1. **A ordem é a do plano** (`order` crescente), nunca a que o repositório
 *    enumerou. E ordena aqui mesmo com o port do plano prometendo ordem: a tela
 *    do livro não pode virar um plano fora de ordem porque alguém perdeu o
 *    `orderBy` num repositório Prisma.
 * 2. **Um `planItemId` fora do plano não vaza** para a resposta — dado
 *    inconsistente não desenha marca num dia que a tela não tem.
 * 3. **Dia sem marca não aparece**: o front sobrepõe no plano que ele já tem, e
 *    devolver todos os dias com `userIds: []` duplicaria o plano numa resposta
 *    que já vem ao lado dele.
 */
export function groupUsersByPlanItem(
  plan: readonly ReadingPlanItem[],
  marks: readonly PlanItemMark[],
): PlanItemGroup[] {
  // `Set` por dia: o par repetido é UMA pessoa. Os ports não prometem
  // unicidade, e uma duplicata desenharia a mesma pessoa duas vezes.
  const usersByPlanItem = new Map<string, Set<string>>();
  for (const mark of marks) {
    const users = usersByPlanItem.get(mark.planItemId);
    if (users === undefined) {
      usersByPlanItem.set(mark.planItemId, new Set([mark.userId]));
      continue;
    }
    users.add(mark.userId);
  }

  // Copia antes de ordenar: o array é de quem chamou (e veio de um
  // repositório), e mutá-lo é smell de fronteira.
  return [...plan]
    .sort((a, b) => a.order - b.order)
    .flatMap((item) => {
      const users = usersByPlanItem.get(item.id);
      // `flatMap` e não `map` + `filter`: é o que deixa o dia sem marca
      // simplesmente não existir no array, em vez de virar um `undefined` que
      // alguém depois tem de estreitar.
      if (users === undefined) return [];

      return [{ planItemId: item.id, userIds: [...users].sort() }];
    });
}
