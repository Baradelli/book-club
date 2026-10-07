import { isCalendarDay } from '@clube/shared';

/**
 * O BLOQUINHO DE DATA DO PLANO — um dono só para os dois lugares que o
 * desenham: a lista do plano na tela do livro e o seletor de "Referência"
 * do formulário de grifo (`plan-day-select.tsx`). Saiu de `book.tsx` quando
 * ganhou o segundo chamador, sem mudar uma linha da conta.
 *
 * ⚠️ Aqui há `Date`, e é permitido: o instante é montado COM `Z` e formatado
 * em `timeZone: 'UTC'` (a regra de datas do `CLAUDE.md`). Quem fatia a
 * string sem `Date` é o `planDayLabel`, de `plan-day-label.ts`.
 */

/**
 * O BLOQUINHO DE DATA da linha do plano: dia da semana curto e o número do dia.
 *
 * `isCalendarDay` antes de formatar, e não é zelo: o `planItemResponseSchema`
 * declara `date: z.string()`, então uma linha malformada faria um
 * `Invalid Date` e o `Intl` **lançaria** — apagando a tela inteira por causa
 * de um dia do plano. Sem formato canônico, a linha mostra o valor cru.
 *
 * `timeZone: 'UTC'` porque o instante montado é meia-noite UTC do próprio dia:
 * no fuso local sairia o dia ANTERIOR em qualquer fuso negativo.
 */
export function dayTileParts(
  date: string,
  locale: string,
): { weekday: string; day: string } | null {
  if (!isCalendarDay(date)) return null;
  const instant = new Date(`${date}T00:00:00.000Z`);
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  })
    .format(instant)
    .replace('.', '');
  const day = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    timeZone: 'UTC',
  }).format(instant);
  return { weekday, day };
}

/**
 * `"2026-09-05"` → "sex., 5 de set.", no idioma da tela — a data da linha
 * para quem OUVE.
 *
 * ⚠️ **O BLOQUINHO É `aria-hidden`**, e até o redesenho de 2026-09-24 a data
 * da linha estava em texto de verdade (o slot `end` do sumário). Sem esta
 * frase num `sr-only`, o leitor de tela anunciava o título e o trecho de
 * cada dia e nunca QUANDO — trinta links sem data. Mesmos cuidados do
 * bloquinho: `isCalendarDay` antes, `timeZone: 'UTC'`.
 */
export function spokenPlanDay(date: string, locale: string): string {
  if (!isCalendarDay(date)) return date;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

/**
 * `"2026-09-03"` → "3 de setembro" — a data ESCRITA ao lado do bloquinho,
 * no seletor do grifo. Sem o dia da semana, que o bloquinho já mostra.
 * Mesmos cuidados: `isCalendarDay` antes, `timeZone: 'UTC'`.
 */
export function writtenPlanDay(date: string, locale: string): string {
  if (!isCalendarDay(date)) return date;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}
