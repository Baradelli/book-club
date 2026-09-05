import type { ReadingPlanItem } from './book';
import type { PlanItemWriter } from './note';

/**
 * "Neste dia de leitura, estas pessoas já escreveram" — uma linha da
 * sobreposição de autoria da tela do livro.
 *
 * `userIds` é **ordenado**, para a saída ser determinística: nenhum dos dois
 * ports de leitura de nota promete ordem, e o fake enumera invertido de
 * propósito (CONVENCOES-CODIGO §7.2).
 */
export interface PlanItemWriters {
  planItemId: string;
  /** Ordenado, para a saída ser determinística. */
  userIds: string[];
}

/**
 * Agrupa os pares (dia, autor) **na ordem do plano**. Puro: sem I/O, sem
 * relógio e sem mutar o que recebe.
 *
 * Existe como função própria — e não como método de um dos dois UseCases —
 * porque os DOIS precisam do mesmo agrupamento: o `getBookWithPlan` o devolve
 * ao abrir o livro, e o `listPlanItemWriters` continua existindo para a tela
 * atualizar **só a sobreposição** depois de alguém escrever, sem rebuscar o
 * livro inteiro. Duas cópias divergiriam no primeiro ajuste, e a divergência
 * apareceria como uma bolinha que muda ao recarregar a página.
 *
 * Três propriedades vêm de o array ser construído a partir do **plano**, e não
 * dos pares:
 *
 * 1. **A ordem é a do plano** (`order` crescente), nunca a que o repositório de
 *    notas enumerou. E ordena aqui mesmo com o port do plano prometendo ordem:
 *    a tela do livro não pode virar um plano fora de ordem porque alguém perdeu
 *    o `orderBy` num repositório Prisma.
 * 2. **Um `planItemId` fora do plano não vaza** para a resposta — dado
 *    inconsistente não desenha bolinha num dia que a tela não tem.
 * 3. **Dia sem nota não aparece**: o front sobrepõe no plano que ele já tem, e
 *    devolver todos os dias com `userIds: []` duplicaria o plano numa resposta
 *    que já vem ao lado dele.
 */
export function groupWritersByPlanItem(
  plan: readonly ReadingPlanItem[],
  pairs: readonly PlanItemWriter[],
): PlanItemWriters[] {
  // `Set` por dia: o par repetido é UM autor. Os ports não prometem unicidade,
  // e uma duplicata desenharia a mesma pessoa duas vezes.
  const authorsByPlanItem = new Map<string, Set<string>>();
  for (const writer of pairs) {
    const authors = authorsByPlanItem.get(writer.planItemId);
    if (authors === undefined) {
      authorsByPlanItem.set(writer.planItemId, new Set([writer.userId]));
      continue;
    }
    authors.add(writer.userId);
  }

  // Copia antes de ordenar: o array é de quem chamou (e veio de um
  // repositório), e mutá-lo é smell de fronteira.
  return [...plan]
    .sort((a, b) => a.order - b.order)
    .flatMap((item) => {
      const authors = authorsByPlanItem.get(item.id);
      // `flatMap` e não `map` + `filter`: é o que deixa o dia sem nota
      // simplesmente não existir no array, em vez de virar um `undefined` que
      // alguém depois tem de estreitar.
      if (authors === undefined) return [];

      return [{ planItemId: item.id, userIds: [...authors].sort() }];
    });
}
