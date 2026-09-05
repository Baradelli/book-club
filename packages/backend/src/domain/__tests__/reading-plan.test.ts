import { describe, expect, it } from 'vitest';

import { InvalidBookError } from '../errors';
import type { PlanItemDraft } from '../reading-plan';
import { normalizePlanDrafts } from '../reading-plan';

/** Captura a exceção para o teste poder afirmar classe E mensagem. */
function caughtError(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`expected an Error, got ${typeof error}`);
  }
  throw new Error('expected the call to throw, but it returned');
}

const THREE_DAYS: PlanItemDraft[] = [
  { date: '2026-10-01', title: 'Cap. 1 — Uma reunião inesperada' },
  { date: '2026-10-02', title: 'Cap. 2 — Carneiro assado' },
  { date: '2026-10-03', title: 'Cap. 3 — Um descanso breve' },
];

describe('normalizePlanDrafts', () => {
  // Regra 8 do createBook / regra 26 do replacePlanItems: plano vazio é
  // legítimo, e é a mesma função que atende os dois.
  it('returns an empty plan for an empty draft list', () => {
    expect(normalizePlanDrafts([])).toEqual([]);
  });

  it('normalizes a three day plan in order', () => {
    expect(normalizePlanDrafts(THREE_DAYS)).toEqual([
      {
        order: 0,
        date: '2026-10-01',
        title: 'Cap. 1 — Uma reunião inesperada',
        reference: null,
      },
      {
        order: 1,
        date: '2026-10-02',
        title: 'Cap. 2 — Carneiro assado',
        reference: null,
      },
      {
        order: 2,
        date: '2026-10-03',
        title: 'Cap. 3 — Um descanso breve',
        reference: null,
      },
    ]);
  });

  // `order` é derivado da posição — o rascunho nunca o manda.
  it('derives order from the position in the draft list', () => {
    const rows = normalizePlanDrafts(THREE_DAYS);

    expect(rows.map((row) => row.order)).toEqual([0, 1, 2]);
  });

  // A fronteira da função: ela NÃO gera id, NÃO conhece bookId e NÃO decide
  // createdAt — quem faz isso é o UseCase, que é quem sabe se o item é novo
  // (createBook, e o item novo do replacePlanItems) ou sobrevivente.
  it('returns only the four normalized fields, without id, bookId or createdAt', () => {
    const rows = normalizePlanDrafts(THREE_DAYS);

    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        'date',
        'order',
        'reference',
        'title',
      ]);
    }
  });

  describe('title', () => {
    it.each([
      ['empty', ''],
      ['only spaces', '  '],
      ['only a tab', '\t'],
    ])('rejects a draft with a %s title', (_label, title) => {
      const error = caughtError(() =>
        normalizePlanDrafts([{ date: '2026-10-01', title }]),
      );

      expect(error).toBeInstanceOf(InvalidBookError);
      expect(error.message).toMatch(/position 0 must have a title/);
    });

    it('reports the position of the bad title, not just that there is one', () => {
      const error = caughtError(() =>
        normalizePlanDrafts([
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-02', title: 'Cap. 2' },
          { date: '2026-10-03', title: '   ' },
        ]),
      );

      expect(error.message).toMatch(/position 2 must have a title/);
    });

    it('trims the title', () => {
      const rows = normalizePlanDrafts([
        { date: '2026-10-01', title: '  Cap. 1  ' },
      ]);

      expect(rows[0]?.title).toBe('Cap. 1');
    });
  });

  describe('date', () => {
    it.each([
      ['a day that does not exist', '2026-02-30'],
      ['the brazilian format', '05/10/2026'],
      ['a day without padding', '2026-10-5'],
      ['an empty string', ''],
      ['an ISO instant', '2026-10-05T00:00:00Z'],
    ])('rejects a draft whose date is %s', (_label, date) => {
      const error = caughtError(() =>
        normalizePlanDrafts([{ date, title: 'Cap. 1' }]),
      );

      expect(error).toBeInstanceOf(InvalidBookError);
      expect(error.message).toMatch(/invalid date/);
    });

    // O ACOPLAMENTO entre a validação de formato e a de ordem.
    //
    // A comparação de ordem é lexicográfica ("2026-10-02" > "2026-10-01"), e
    // isso só equivale ao calendário porque `isCalendarDay` roda ANTES e
    // `previousDate` só recebe uma data já canônica e zero-padded. Uma data
    // malformada que ordene DEPOIS da anterior atravessa a checagem de ordem
    // lisa: '2026-9-30' > '2026-10-01' porque '9' > '1'.
    //
    // Os casos da tabela acima não protegem isso: com um item só,
    // `previousDate` é null e a interação nunca acontece. Foi exatamente o que
    // a auditoria da Tarefa 05 pegou — restringir a validação ao primeiro item
    // deixava este plano ser ACEITO.
    it.each([
      ['a month without padding that sorts after', '2026-9-30'],
      ['an ISO instant sharing the previous prefix', '2026-10-01T00:00:00Z'],
    ])(
      'rejects a malformed date at position 1 even when it sorts after the valid one (%s)',
      (_label, date) => {
        // Pré-condição do teste: a data ruim ordena DEPOIS da boa, então a
        // comparação de ordem não pega nada. Quem reprova é o formato.
        expect(date > '2026-10-01').toBe(true);

        const error = caughtError(() =>
          normalizePlanDrafts([
            { date: '2026-10-01', title: 'Cap. 1' },
            { date, title: 'Cap. 2' },
          ]),
        );

        expect(error).toBeInstanceOf(InvalidBookError);
        expect(error.message).toMatch(/invalid date/);
      },
    );
  });

  describe('uniqueness and order', () => {
    // A mensagem é afirmada de propósito, e a razão é mais forte do que
    // parece: o Set de datas é conferido ANTES da comparação de ordem, então
    // para datas IGUAIS ele é o único guardião que chega a disparar — o `<=`
    // nunca vê um par igual, e por isso trocá-lo por `<` não quebra nada
    // (mutante equivalente; não há teste para ele de propósito).
    //
    // Ou seja: sem estes dois testes, apagar o Set trocaria "aparece duas
    // vezes" por "fora de ordem" — ou, se a ordem das checagens fosse
    // invertida junto, deixaria de ser detectado no lugar certo. O teste
    // seguinte (data repetida NÃO adjacente) é o que prova que o Set varre o
    // plano inteiro, e não só o vizinho.
    it('rejects two drafts on the same date', () => {
      const error = caughtError(() =>
        normalizePlanDrafts([
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-01', title: 'Cap. 2' },
        ]),
      );

      expect(error).toBeInstanceOf(InvalidBookError);
      expect(error.message).toMatch(/2026-10-01 appears twice/);
    });

    it('rejects a repeated date that is not adjacent', () => {
      const error = caughtError(() =>
        normalizePlanDrafts([
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-02', title: 'Cap. 2' },
          { date: '2026-10-01', title: 'Cap. 3' },
        ]),
      );

      expect(error).toBeInstanceOf(InvalidBookError);
      expect(error.message).toMatch(/2026-10-01 appears twice/);
    });

    // Não reordenar em silêncio. A mensagem é a de ordem, não a de duplicata:
    // é o outro lado da separação entre as duas regras.
    it('rejects strictly decreasing dates', () => {
      const error = caughtError(() =>
        normalizePlanDrafts([
          { date: '2026-10-03', title: 'Cap. 3' },
          { date: '2026-10-02', title: 'Cap. 2' },
          { date: '2026-10-01', title: 'Cap. 1' },
        ]),
      );

      expect(error).toBeInstanceOf(InvalidBookError);
      expect(error.message).toMatch(/strictly increasing order/);
    });

    it('rejects one date out of order in the middle of the plan', () => {
      const error = caughtError(() =>
        normalizePlanDrafts([
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-05', title: 'Cap. 3' },
          { date: '2026-10-02', title: 'Cap. 2' },
          { date: '2026-10-06', title: 'Cap. 4' },
        ]),
      );

      expect(error).toBeInstanceOf(InvalidBookError);
      expect(error.message).toMatch(/strictly increasing order/);
    });

    // A virada de mês e de ano é ordem crescente de verdade.
    it('accepts a plan that crosses the month and the year', () => {
      const rows = normalizePlanDrafts([
        { date: '2026-12-30', title: 'Cap. 20' },
        { date: '2026-12-31', title: 'Cap. 21' },
        { date: '2027-01-01', title: 'Cap. 22' },
      ]);

      expect(rows.map((row) => row.order)).toEqual([0, 1, 2]);
      expect(rows.map((row) => row.date)).toEqual([
        '2026-12-30',
        '2026-12-31',
        '2027-01-01',
      ]);
    });

    // Buracos no plano são legítimos: ninguém lê todo dia.
    it('accepts increasing dates with gaps between them', () => {
      const rows = normalizePlanDrafts([
        { date: '2026-10-01', title: 'Cap. 1' },
        { date: '2026-10-07', title: 'Cap. 2' },
        { date: '2026-11-03', title: 'Cap. 3' },
      ]);

      expect(rows.map((row) => row.order)).toEqual([0, 1, 2]);
    });
  });

  describe('reference', () => {
    it.each([
      ['absent', undefined],
      ['only spaces', '   '],
    ])('nulls a %s reference', (_label, reference) => {
      const rows = normalizePlanDrafts([
        { date: '2026-10-01', title: 'Cap. 1', reference },
      ]);

      expect(rows[0]?.reference).toBeNull();
    });

    it('trims the reference', () => {
      const rows = normalizePlanDrafts([
        { date: '2026-10-01', title: 'Cap. 1', reference: '  p. 45-62  ' },
      ]);

      expect(rows[0]?.reference).toBe('p. 45-62');
    });
  });

  /**
   * A REGRA DE SEQUÊNCIA VIVE EM `@clube/shared` — E O DOMÍNIO CONTINUA
   * GUARDIÃO.
   *
   * `findPlanDateProblem` é chamado pela borda (via `superRefine`, para o
   * `details` apontar `planItems.1.date`) e por aqui. Uma implementação, dois
   * chamadores — o mesmo movimento que `isCalendarDay` fez.
   *
   * Estes testes existem para que a BORDA NÃO SEJA A ÚNICA GUARDIÃ: o UseCase
   * pode ser chamado sem passar por Zod nenhum (outro UseCase, um script, um
   * teste), e nesse caminho quem tem de reprovar é este módulo. Se alguém
   * apagar a chamada daqui confiando no Zod, estes testes ficam vermelhos.
   */
  describe('the sequence rule is enforced here, not only at the edge', () => {
    it('still rejects a repeated date', () => {
      const error = caughtError(() =>
        normalizePlanDrafts([
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-02', title: 'Cap. 2' },
          { date: '2026-10-01', title: 'Cap. 1 de novo' },
        ]),
      );

      expect(error).toBeInstanceOf(InvalidBookError);
      expect(error.message).toMatch(/2026-10-01 appears twice/);
    });

    it('still rejects a date out of order', () => {
      const error = caughtError(() =>
        normalizePlanDrafts([
          { date: '2026-10-02', title: 'Cap. 2' },
          { date: '2026-10-01', title: 'Cap. 1' },
        ]),
      );

      expect(error).toBeInstanceOf(InvalidBookError);
      expect(error.message).toMatch(/strictly increasing order/);
    });

    // A PRECEDÊNCIA, agora afirmada em vez de acidental: o formato de TODOS os
    // itens é conferido antes de qualquer par ser comparado. Aqui o item 0 já
    // está fora de ordem em relação ao 1, mas o item 2 tem data malformada — e
    // é o formato que sai, porque a comparação lexicográfica só faz sentido
    // sobre datas canônicas. É a mesma ordem que a borda tem (o `superRefine`
    // do array só roda depois de cada item passar).
    it('reports a malformed date at a later position before an earlier ordering problem', () => {
      const error = caughtError(() =>
        normalizePlanDrafts([
          { date: '2026-10-05', title: 'Cap. 5' },
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-13-99', title: 'Cap. ?' },
        ]),
      );

      expect(error).toBeInstanceOf(InvalidBookError);
      expect(error.message).toMatch(/position 2 has an invalid date/);
    });

    // ...e o título, que é do item, continua vindo antes de tudo.
    it('reports an empty title before the sequence problem', () => {
      const error = caughtError(() =>
        normalizePlanDrafts([
          { date: '2026-10-05', title: 'Cap. 5' },
          { date: '2026-10-01', title: '   ' },
        ]),
      );

      expect(error.message).toMatch(/position 1 must have a title/);
    });
  });

  // A função é pura: o mapa de datas e o `previousDate` são locais, não de
  // módulo. Um mapa de módulo passaria em todos os testes acima e reprovaria a
  // segunda chamada do mesmo plano — que é exatamente o que o
  // `replacePlanItems` faz quando alguém salva o mesmo plano duas vezes.
  it('does not carry state between two calls with the same plan', () => {
    const first = normalizePlanDrafts(THREE_DAYS);
    const second = normalizePlanDrafts(THREE_DAYS);

    expect(second).toEqual(first);
  });

  it('does not mutate the drafts it received', () => {
    const drafts: PlanItemDraft[] = [
      { date: '2026-10-01', title: '  Cap. 1  ', reference: '  p. 1-20  ' },
    ];
    const snapshot = structuredClone(drafts);

    normalizePlanDrafts(drafts);

    expect(drafts).toEqual(snapshot);
  });
});
