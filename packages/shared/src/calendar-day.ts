/**
 * Dia de calendário no formato "YYYY-MM-DD". Não é um instante.
 *
 * Um dia de calendário não tem fuso: representá-lo como `Date` obrigaria a
 * escolher um, e é daí que vem o bug clássico "o plano do dia 5 aparece no dia
 * 4". A conversão para a coluna `@db.Date` é problema do repositório.
 */
export type CalendarDay = string;

const CALENDAR_DAY_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const CLUB_MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Primeiro ano em que a regra de bissexto abaixo é a regra de verdade: o
 * calendário gregoriano começa em 15/10/1582, e antes disso `isLeapYear`
 * estaria mentindo sobre o calendário histórico.
 *
 * O piso serve a dois outros propósitos práticos: o Postgres recusa
 * `DATE '0000-01-01'` com "date/time field value out of range" — sem o piso, o
 * domínio aceitaria um dia que a coluna `@db.Date` (Tarefa 07) rejeitaria com
 * erro de banco (500) em vez de 400 —, e ele pega o erro de digitação clássico
 * de quem esquece um dígito do ano ("0226-10-05" em vez de "2026-10-05").
 *
 * O teto é 9999 por construção: o regex só aceita quatro dígitos.
 */
const FIRST_GREGORIAN_YEAR = 1583;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  // month já veio validado pelo regex (01–12), então o índice existe.
  return DAYS_IN_MONTH[month - 1] ?? 0;
}

/** "YYYY-MM-DD" com dia que existe de verdade (rejeita 2026-02-30). */
export function isCalendarDay(value: string): boolean {
  const match = CALENDAR_DAY_RE.exec(value);
  if (!match) return false;

  // Aritmética pura em vez de `new Date(...)`: o construtor mapeia os anos de
  // 0 a 99 para 1900+ e obrigaria a escolher um fuso só para validar.
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (year < FIRST_GREGORIAN_YEAR) return false;

  return day <= daysInMonth(year, month);
}

/** "YYYY-MM" com mês entre 01 e 12, no mesmo intervalo de anos do dia. */
export function isClubMonth(value: string): boolean {
  const match = CLUB_MONTH_RE.exec(value);
  if (!match) return false;

  return Number(match[1]) >= FIRST_GREGORIAN_YEAR;
}
