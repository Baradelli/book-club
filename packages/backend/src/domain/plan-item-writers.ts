import type { ReadingPlanItem } from './book';
import type { PlanItemWriter } from './note';
import { groupUsersByPlanItem } from './plan-item-groups';

/**
 * "Neste dia de leitura, estas pessoas já escreveram" — uma linha da
 * sobreposição de autoria da tela do livro.
 *
 * Tem o mesmo formato do `PlanItemReaders` e **não** é o mesmo tipo (decisão D
 * da Tarefa 31): reusar um para o outro economiza uma interface e custa uma
 * mentira na resposta da API, onde ela viaja para o `shared` e para a tela.
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
 * Agrupa os pares (dia, **autor**) na ordem do plano: quem já escreveu em cada
 * dia. Puro: sem I/O, sem relógio e sem mutar o que recebe.
 *
 * Existe como função própria — e não como método de um dos dois UseCases —
 * porque os DOIS precisam do mesmo agrupamento: o `getBookWithPlan` o devolve
 * ao abrir o livro, e o `listPlanItemWriters` continua existindo para a tela
 * atualizar **só a sobreposição** depois de alguém escrever, sem rebuscar o
 * livro inteiro. Duas cópias divergiriam no primeiro ajuste, e a divergência
 * apareceria como uma bolinha que muda ao recarregar a página.
 *
 * ⚠️ **A conta em si não mora mais aqui** (Tarefa 31): ela é o
 * `groupUsersByPlanItem`, neutro, e a leitura (`groupReadersByPlanItem`) o
 * chama do mesmo jeito. É o §7.1 aplicado — **extrair, não cobrir duas vezes** —
 * e as três propriedades da saída (ordem do plano, nenhum `planItemId` de fora,
 * nenhum dia vazio) estão documentadas e testadas lá, uma vez só.
 *
 * O que sobra aqui é o **nome**, e ele é a razão de a função continuar
 * existindo: um `groupUsersByPlanItem` cru no `getBookWithPlan` não diria de
 * que sobreposição se trata, e o parâmetro `PlanItemWriter` **documenta** que
 * esta é a de autoria.
 *
 * ⚠️ Documenta, e não *pina*: `PlanItemWriter` é estruturalmente idêntico ao
 * `PlanItemMark`, então o compilador aceitaria um `ReadingLog[]` aqui sem
 * reclamar. Quem impede a troca é a leitura humana e o nome — não o `tsc`.
 */
export function groupWritersByPlanItem(
  plan: readonly ReadingPlanItem[],
  pairs: readonly PlanItemWriter[],
): PlanItemWriters[] {
  return groupUsersByPlanItem(plan, pairs);
}
