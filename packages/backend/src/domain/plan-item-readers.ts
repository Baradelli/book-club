import type { ReadingPlanItem } from './book';
import type { PlanItemMark } from './plan-item-groups';
import { groupUsersByPlanItem } from './plan-item-groups';

/**
 * "Neste dia de leitura, estas pessoas já leram" — uma linha da sobreposição de
 * leitura da tela do livro.
 *
 * Tem o mesmo formato do `PlanItemWriters` e **não** é o mesmo tipo (decisão D
 * da Tarefa 31). Reusar aquele economizaria uma interface e custaria uma
 * mentira na resposta da API — onde ela viaja para o `shared` e para a tela —,
 * e duas interfaces de mesmo formato com nomes honestos é o preço certo.
 *
 * **Presença, nunca placar:** nenhum contador, nenhum percentual e nenhuma
 * comparação entre pessoas. Progresso é **calculado** a partir dos logs e a
 * rota não devolve contagem nenhuma — decisão do dono na rodada do MVP 3, e é
 * o que torna o número impossível de renderizar por construção.
 *
 * `userIds` é **ordenado**, para a saída ser determinística: nenhum port
 * promete ordem, e o fake enumera invertido de propósito (§7.2).
 */
export interface PlanItemReaders {
  planItemId: string;
  /** Ordenado, para a saída ser determinística. */
  userIds: string[];
}

/**
 * Agrupa os registros de leitura (dia, **leitor**) na ordem do plano: quem já
 * leu cada dia. Puro — sem I/O, sem relógio, sem mutar o que recebe — e é o que
 * o mantém honesto: "que dia é hoje" não passa por aqui. O log ancora no
 * `planItemId` (Tarefa 30, decisão A), então esta conta não faz aritmética de
 * data nenhuma, não conhece fuso e não chama `dayRange`.
 *
 * ⚠️ **A conta é a mesma da autoria, e tem um dono só**: o
 * `groupUsersByPlanItem`, neutro. Escrever um segundo agrupamento aqui seria
 * cobrir duas vezes o que o `CONVENCOES-CODIGO` §7.1 mandou **extrair** — e a
 * seção nomeia justamente o `ReadingLog` do MVP 3 como o caso que dispararia
 * isto. As três propriedades da saída (ordem do plano, nenhum `planItemId` de
 * fora, nenhum dia vazio) estão testadas lá, uma vez só.
 *
 * ⚠️ **O que se reusa é a conta, não o nome** (decisão B): chamar
 * `groupWritersByPlanItem(plan, logs)` compilaria hoje, sem uma linha de
 * mudança, porque a tipagem é estrutural e o `ReadingLog` tem os dois campos.
 * Está recusado — um `writers` devolvendo leitores é a prosa-que-mente que a
 * Tarefa 29a pagou duas vezes.
 *
 * O parâmetro é o `PlanItemMark` **estrutural**, e não `ReadingLog[]`, de
 * propósito (decisão C): a Tarefa 32 é que decide se o port devolve o log
 * inteiro ou uma projeção `(planItemId, userId)`, e exigir aqui os campos que
 * a conta não olha (`id`, `clubId`, `readAt`) amarraria essa escolha antes da
 * hora. O `ReadingLog` inteiro atravessa como está — é o que o teste prova, com
 * a entidade de verdade no fixture.
 */
export function groupReadersByPlanItem(
  plan: readonly ReadingPlanItem[],
  logs: readonly PlanItemMark[],
): PlanItemReaders[] {
  return groupUsersByPlanItem(plan, logs);
}
