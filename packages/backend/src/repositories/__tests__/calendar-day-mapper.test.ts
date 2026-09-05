import { describe, expect, it } from 'vitest';

import { calendarDayToDate, dateToCalendarDay } from '../calendar-day-mapper';

// Este arquivo é a rede que impede o bug "o plano do dia 5 aparece no dia 4".
// A coluna é `DateTime @db.Date` e o Prisma devolve um `Date` em meia-noite
// UTC; qualquer conversão que passe por hora LOCAL erra de um dia em metade do
// planeta — inclusive nesta máquina, que está em UTC−3.
//
// NENHUM teste aqui troca `TZ` do processo: `TZ=` não é confiável no Node do
// Windows. A prova é por asserção do INSTANTE UTC exato e da STRING exata.
describe('calendarDayToDate', () => {
  it('maps a calendar day to midnight UTC, never local midnight', () => {
    const date = calendarDayToDate('2026-10-05');

    // 03:00Z seria meia-noite LOCAL em UTC−3 — o erro que se quer barrar.
    expect(date.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(date.getTime()).toBe(Date.UTC(2026, 9, 5, 0, 0, 0, 0));
  });

  it.each([
    ['the first day of the year', '2026-01-01', '2026-01-01T00:00:00.000Z'],
    ['the last day of the year', '2026-12-31', '2026-12-31T00:00:00.000Z'],
    ['a leap day', '2028-02-29', '2028-02-29T00:00:00.000Z'],
    // Domingo da virada do horário de verão brasileiro de 2018 (o último):
    // é o dia em que a meia-noite local NÃO existe, e o `new Date('...T00:00:00')`
    // sem `Z` desliza para 01:00 local.
    ['a DST start day', '2018-11-04', '2018-11-04T00:00:00.000Z'],
    // E a volta do horário de verão, quando a hora local se repete.
    ['a DST end day', '2018-02-18', '2018-02-18T00:00:00.000Z'],
  ])('maps %s (%s) to %s', (_label, day, expected) => {
    expect(calendarDayToDate(day).toISOString()).toBe(expected);
  });
});

describe('dateToCalendarDay', () => {
  it('reads midnight UTC back as the same calendar day', () => {
    const day = dateToCalendarDay(new Date('2026-10-05T00:00:00.000Z'));

    expect(day).toBe('2026-10-05');
  });

  // Documenta POR QUE o UTC é obrigatório: numa máquina a oeste de Greenwich os
  // getters locais leem a meia-noite UTC do dia 5 como o dia 4. Se este teste
  // um dia falhar, é porque a máquina mudou de fuso — não porque a regra mudou.
  it('diverges from the local getters when the machine is west of UTC', () => {
    const stored = new Date('2026-10-05T00:00:00.000Z');

    const utc = dateToCalendarDay(stored);
    const local = [
      String(stored.getFullYear()).padStart(4, '0'),
      String(stored.getMonth() + 1).padStart(2, '0'),
      String(stored.getDate()).padStart(2, '0'),
    ].join('-');

    expect(utc).toBe('2026-10-05');
    // A asserção é condicional ao fuso da máquina de propósito: o teste prova
    // a divergência onde ela existe (offset negativo) e continua honesto onde
    // não existe, sem depender de trocar `TZ`.
    if (stored.getTimezoneOffset() > 0) {
      expect(local).toBe('2026-10-04');
      expect(local).not.toBe(utc);
    } else {
      expect(local).toBe(utc);
    }
  });
});

describe('round trip', () => {
  it.each([
    '2026-01-01',
    '2026-10-05',
    '2026-12-31',
    '2028-02-29',
    '2018-11-04',
    '2018-02-18',
    '1583-01-01',
    '9999-12-31',
  ])('gives back exactly %s', (day) => {
    expect(dateToCalendarDay(calendarDayToDate(day))).toBe(day);
  });
});
