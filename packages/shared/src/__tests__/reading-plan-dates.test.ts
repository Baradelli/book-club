import { describe, expect, it } from 'vitest';

import { findPlanDateProblem } from '../index';

describe('findPlanDateProblem', () => {
  it.each([
    ['an empty plan', []],
    ['a single day', ['2026-10-01']],
    ['three increasing days', ['2026-10-01', '2026-10-02', '2026-10-03']],
    ['a gap between days', ['2026-10-01', '2026-10-15']],
    ['a plan crossing the month', ['2026-10-31', '2026-11-01']],
    ['a plan crossing the year', ['2026-12-31', '2027-01-01']],
  ])('finds no problem in %s', (_label, dates) => {
    expect(findPlanDateProblem(dates)).toBeNull();
  });

  it('reports the index where a date reappears, and where it first appeared', () => {
    const problem = findPlanDateProblem([
      '2026-10-01',
      '2026-10-02',
      '2026-10-01',
    ]);

    expect(problem).toEqual({
      kind: 'DUPLICATE',
      index: 2,
      date: '2026-10-01',
      firstIndex: 0,
    });
  });

  it('reports an adjacent duplicate as a duplicate, not as an ordering problem', () => {
    const problem = findPlanDateProblem(['2026-10-01', '2026-10-01']);

    expect(problem?.kind).toBe('DUPLICATE');
  });

  it('reports the index and the previous date when a day is out of order', () => {
    const problem = findPlanDateProblem([
      '2026-10-01',
      '2026-10-05',
      '2026-10-02',
    ]);

    expect(problem).toEqual({
      kind: 'OUT_OF_ORDER',
      index: 2,
      date: '2026-10-02',
      previousDate: '2026-10-05',
    });
  });

  // O PRIMEIRO problema, não o pior: é o que a borda marca em vermelho.
  it('reports the first problem when there are several', () => {
    const problem = findPlanDateProblem([
      '2026-10-03',
      '2026-10-02',
      '2026-10-02',
    ]);

    expect(problem).toMatchObject({ kind: 'OUT_OF_ORDER', index: 1 });
  });

  it('does not carry state between two calls with the same plan', () => {
    const dates = ['2026-10-01', '2026-10-02'];

    expect(findPlanDateProblem(dates)).toBeNull();
    expect(findPlanDateProblem(dates)).toBeNull();
  });

  // A pré-condição que a função NÃO confere, dita em voz alta: ela pressupõe
  // "YYYY-MM-DD" canônico, e é por isso que os dois chamadores validam o
  // formato de todos os itens antes de chegar aqui. Sem zero-padding a
  // comparação lexicográfica mente — '2026-9-30' ordena DEPOIS de
  // '2026-10-01' porque '9' > '1'.
  it('states the precondition it depends on', () => {
    expect('2026-9-30' > '2026-10-01').toBe(true);
    expect(findPlanDateProblem(['2026-10-01', '2026-9-30'])).toBeNull();
  });
});
