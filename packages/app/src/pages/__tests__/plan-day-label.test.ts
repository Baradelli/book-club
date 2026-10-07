import { describe, expect, it } from 'vitest';

import { highlightPlaceLabel, planDayLabel } from '../plan-day-label';

/**
 * O RÓTULO DO DIA DO PLANO NO GRIFO — Tarefa 48a, decisões E, F e O.
 *
 * Uma função pura serve o `<select>` do formulário, a linha do acervo e a
 * margem de prévia: um dono só para o formato `DD/MM · tema`, e um dono só
 * para a precedência "dia, senão a referência antiga, senão nada".
 */
describe('planDayLabel', () => {
  it('writes DD/MM · theme, sliced from the calendar day', () => {
    expect(planDayLabel({ date: '2026-10-07', title: 'Cap. 3' })).toBe(
      '07/10 · Cap. 3',
    );
  });

  /**
   * ⚠️ **Sem `Date` (decisão O, e a regra de datas do `CLAUDE.md`).** A
   * suíte do app roda em `America/Sao_Paulo` (UTC−3): `new Date('2026-10-01')`
   * é meia-noite UTC, que lá é **30/09**. Um rótulo montado com `Date` erraria
   * o dia em todo primeiro do mês — e este é o fixture que o pega.
   */
  it('keeps the first day of the month on the first, in a timezone west of UTC', () => {
    expect(planDayLabel({ date: '2026-10-01', title: 'Cap. 1' })).toBe(
      '01/10 · Cap. 1',
    );
  });
});

describe('highlightPlaceLabel', () => {
  const DAYS = [
    { id: 'p-1', date: '2026-10-06', title: 'Cap. 1' },
    { id: 'p-2', date: '2026-10-07', title: 'Cap. 2' },
  ];

  /**
   * ⚠️ **MUTANTE 6 DA SPEC — a precedência.** Um grifo com OS DOIS — dia e
   * texto antigo — prova que o dia ganha. Com só um dos dois, "o dia antes"
   * e "o texto antes" dariam o mesmo resultado.
   */
  it('shows the day, and not the old reference, when the highlight has both', () => {
    expect(
      highlightPlaceLabel(
        { planItemId: 'p-2', reference: 'Cap. antigo' },
        DAYS,
      ),
    ).toEqual({ text: '07/10 · Cap. 2', planDay: true });
  });

  it('falls back to the old reference when there is no day', () => {
    expect(
      highlightPlaceLabel({ planItemId: null, reference: 'Cap. antigo' }, DAYS),
    ).toEqual({ text: 'Cap. antigo', planDay: false });
  });

  it('shows nothing when there is neither', () => {
    expect(
      highlightPlaceLabel({ planItemId: null, reference: null }, DAYS),
    ).toBeNull();
  });

  /**
   * O plano que não carregou (ou um dia que a tela não conhece): o grifo tem
   * dia, mas não há como escrevê-lo. Cai no texto antigo — nunca no id cru.
   */
  it('falls back to the old reference when the day is not among the known days', () => {
    expect(
      highlightPlaceLabel(
        { planItemId: 'p-9', reference: 'Cap. antigo' },
        DAYS,
      ),
    ).toEqual({ text: 'Cap. antigo', planDay: false });
    expect(
      highlightPlaceLabel({ planItemId: 'p-9', reference: null }, []),
    ).toBeNull();
  });
});
