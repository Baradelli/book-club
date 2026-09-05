import type { CalendarDay } from '@clube/shared';
import { findPlanDateProblem, isCalendarDay } from '@clube/shared';

import { InvalidBookError } from './errors';
import { optionalText } from './optional-text';

/** O rascunho de uma linha do plano, como o admin digita. Sem `order`. */
export interface PlanItemDraft {
  date: string; // "YYYY-MM-DD"
  title: string;
  reference?: string;
}

/**
 * Uma linha de plano validada e normalizada. Não tem `id`, `bookId` nem
 * `createdAt` de propósito: quem decide isso é o UseCase, que é o único que
 * sabe se a linha é nova (`createBook`, item novo do `replacePlanItems`) ou
 * sobrevivente de um plano anterior (e aí id e `createdAt` são os antigos).
 */
export interface NormalizedPlanItem {
  order: number;
  date: CalendarDay;
  title: string;
  reference: string | null;
}

/**
 * Valida o rascunho do plano e devolve as linhas normalizadas, em ordem.
 *
 * Lança `InvalidBookError` na primeira falha e **não** escreve nada — é o que
 * dá atomicidade ao `createBook` (nem o livro entra se o plano é ruim) e ao
 * `replacePlanItems` (nada é apagado se o plano novo é ruim).
 */
export function normalizePlanDrafts(
  drafts: readonly PlanItemDraft[],
): NormalizedPlanItem[] {
  // Primeiro passo: título e FORMATO de data, item por item, em ordem de
  // posição. O formato vem antes da sequência porque a sequência depende dele
  // — a comparação de `findPlanDateProblem` é lexicográfica, e só equivale ao
  // calendário se TODAS as datas já forem "YYYY-MM-DD" canônicas e
  // zero-padded. Conferir o formato do plano inteiro antes de comparar
  // qualquer par é o que garante essa pré-condição (e é a mesma precedência
  // que a borda tem: o `superRefine` do `planItemDraftListSchema` só roda
  // depois de cada item passar).
  const rows = drafts.map((raw, index): NormalizedPlanItem => {
    const title = raw.title.trim();
    if (title === '') {
      throw new InvalidBookError(
        `plan item at position ${index} must have a title`,
      );
    }

    if (!isCalendarDay(raw.date)) {
      throw new InvalidBookError(
        `plan item at position ${index} has an invalid date ${JSON.stringify(raw.date)}`,
      );
    }

    return {
      order: index, // derivado da posição — o rascunho não manda `order`
      date: raw.date,
      title,
      reference: optionalText(raw.reference),
    };
  });

  // Segundo passo: a regra de SEQUÊNCIA (datas únicas e estritamente
  // crescentes), que vive em `@clube/shared` porque a borda precisa da MESMA
  // regra para apontar a linha errada. O domínio continua sendo o guardião:
  // o UseCase pode ser chamado sem passar pela borda, e aqui ele lança
  // `InvalidBookError` como sempre.
  const problem = findPlanDateProblem(rows.map((row) => row.date));
  if (problem !== null) {
    throw new InvalidBookError(
      problem.kind === 'DUPLICATE'
        ? `plan date ${problem.date} appears twice`
        : `plan dates must be in strictly increasing order: ${problem.date} does not come after ${problem.previousDate}`,
    );
  }

  return rows;
}
