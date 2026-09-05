import type { CalendarDay } from '@clube/shared';

/**
 * A tradução `CalendarDay` ↔ coluna `DateTime @db.Date`, e o único lugar do
 * backend onde ela acontece.
 *
 * Um dia de calendário não é um instante (`CONTEXT.md`), mas a coluna é um
 * `Date` do Prisma. Toda a aritmética aqui é em **UTC**, porque a coluna
 * `@db.Date` volta do Postgres como meia-noite UTC e qualquer passagem por
 * hora local desloca de um dia em metade do planeta. Medido nesta máquina, que
 * está em UTC−3:
 *
 * ```
 * new Date('2026-10-05')           → 2026-10-05T00:00:00.000Z   ✅
 * new Date('2026-10-05T00:00:00')  → 2026-10-05T03:00:00.000Z   ❌ meia-noite LOCAL
 * d.getFullYear()/getMonth()/getDate() → 2026-10-04             ❌ getters locais
 * d.toISOString().slice(0, 10)     → 2026-10-05                 ✅
 * ```
 *
 * Ou seja: a implementação ingênua faz o dia 5 do plano aparecer como dia 4 —
 * exatamente o bug que a decisão da Tarefa 05 (`date` como `string`) existe
 * para evitar. Por isso as duas funções são puras, exportadas e testadas
 * separadamente: `calendar-day-mapper.test.ts` prova o ida-e-volta e documenta
 * a divergência dos getters locais.
 *
 * Proibido aqui, para sempre: `getFullYear`/`getMonth`/`getDate`,
 * `toLocaleDateString`, `toDateString` e qualquer `new Date(...)` sem `Z`.
 */

/** `"2026-10-05"` → o instante `2026-10-05T00:00:00.000Z`. */
export function calendarDayToDate(day: CalendarDay): Date {
  // O `Z` é o ponto todo desta função: sem ele o construtor interpreta a hora
  // como LOCAL e a coluna guardaria o dia anterior num fuso negativo.
  return new Date(`${day}T00:00:00.000Z`);
}

/** O instante de volta como `"YYYY-MM-DD"`, sempre lido em UTC. */
export function dateToCalendarDay(date: Date): CalendarDay {
  // `toISOString` é sempre UTC, por especificação. É por isso que ele é o
  // caminho de volta, e não os getters de componente (que são locais).
  return date.toISOString().slice(0, 10);
}
