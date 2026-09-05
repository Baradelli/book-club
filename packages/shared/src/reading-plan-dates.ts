import type { CalendarDay } from './calendar-day';

/**
 * A regra de sequência das datas de um plano de leitura: **únicas e
 * estritamente crescentes**.
 *
 * Mora aqui, e não só no domínio do backend, pelo mesmo motivo que
 * `isCalendarDay` mudou de casa na Tarefa 07: **dois chamadores precisam da
 * MESMA regra**, e reimplementá-la num deles é como as duas divergem em
 * silêncio.
 *
 * - o Zod da borda (`planItemDraftListSchema`) a usa num `.superRefine()` para
 *   emitir o issue **no índice ofensor** — é o que faz o `details` da resposta
 *   400 dizer `planItems.1.date`, e é a única coisa que a tela de cadastro tem
 *   para marcar a linha errada em vermelho (`CONVENCOES-CODIGO` §6.2 proíbe
 *   exibir `message` cru);
 * - `normalizePlanDrafts` (domínio) a usa para continuar sendo o guardião: o
 *   UseCase pode ser chamado sem passar pela borda, então ele não pode confiar
 *   nela. Defesa em profundidade, uma implementação só.
 *
 * A função **não valida formato** — ela pressupõe `"YYYY-MM-DD"` canônico, e é
 * o que torna a comparação lexicográfica equivalente ao calendário. Os dois
 * chamadores conferem o formato de TODOS os itens antes de chegar aqui.
 */
export type PlanDateProblem =
  | {
      kind: 'DUPLICATE';
      /** Onde a data reaparece. */
      index: number;
      date: CalendarDay;
      /** Onde ela apareceu pela primeira vez. */
      firstIndex: number;
    }
  | {
      kind: 'OUT_OF_ORDER';
      index: number;
      date: CalendarDay;
      previousDate: CalendarDay;
    };

/**
 * O **primeiro** problema da sequência, ou `null` se ela está boa.
 *
 * A duplicata é conferida antes da ordem, e contra o plano INTEIRO (não só
 * contra a data anterior): assim uma data repetida longe da outra é relatada
 * como duplicata, com a mensagem útil, em vez de "não vem depois de si mesma".
 * Para datas iguais, portanto, o ramo de ordem nunca dispara.
 */
export function findPlanDateProblem(
  dates: readonly CalendarDay[],
): PlanDateProblem | null {
  const firstIndexByDate = new Map<CalendarDay, number>();
  let previousDate: CalendarDay | null = null;

  for (const [index, date] of dates.entries()) {
    const firstIndex = firstIndexByDate.get(date);
    if (firstIndex !== undefined) {
      return { kind: 'DUPLICATE', index, date, firstIndex };
    }

    if (previousDate !== null && date <= previousDate) {
      return { kind: 'OUT_OF_ORDER', index, date, previousDate };
    }

    firstIndexByDate.set(date, index);
    previousDate = date;
  }

  return null;
}
