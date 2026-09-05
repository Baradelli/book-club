import { describe, expect, it } from 'vitest';

import {
  createBookSchema,
  editBookSchema,
  listBooksQuerySchema,
  planItemDraftSchema,
  replacePlanSchema,
} from '../index';

describe('planItemDraftSchema', () => {
  it.each([
    ['a single-digit month without padding', '2026-2-5'],
    ['a day that does not exist', '2026-02-30'],
    ['a month out of range', '2026-13-01'],
    ['an ISO instant', '2026-10-05T00:00:00.000Z'],
    ['an empty string', ''],
    ['a Brazilian format', '05/10/2026'],
  ])('rejects %s (%s)', (_label, date) => {
    expect(
      planItemDraftSchema.safeParse({ date, title: 'Cap. 1' }).success,
    ).toBe(false);
  });

  it.each(['2026-10-05', '2026-01-01', '2026-12-31', '2028-02-29'])(
    'accepts %s',
    (date) => {
      expect(
        planItemDraftSchema.safeParse({ date, title: 'Cap. 1' }).success,
      ).toBe(true);
    },
  );

  it('points at the date field when the date is malformed', () => {
    const result = planItemDraftSchema.safeParse({
      date: '2026-2-5',
      title: 'Cap. 1',
    });

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.path).toEqual(['date']);
  });

  it('rejects a title that is only spaces', () => {
    expect(
      planItemDraftSchema.safeParse({ date: '2026-10-05', title: '   ' })
        .success,
    ).toBe(false);
  });

  it('trims the title', () => {
    const result = planItemDraftSchema.parse({
      date: '2026-10-05',
      title: '  Cap. 1  ',
    });

    expect(result.title).toBe('Cap. 1');
  });

  // `order` é DERIVADO da posição pelo domínio: declará-lo daria ao cliente um
  // campo que o servidor ignora. → CONVENCOES-CODIGO §6.3.
  it('strips an order smuggled into a draft', () => {
    const result = planItemDraftSchema.parse({
      date: '2026-10-05',
      title: 'Cap. 1',
      order: 99,
    });

    expect(result).not.toHaveProperty('order');
  });
});

describe('createBookSchema', () => {
  const valid = { title: 'O Hobbit', month: '2026-10' };

  it('accepts the minimum body', () => {
    expect(createBookSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['a day instead of a month', '2026-10-05'],
    ['a month out of range', '2026-13'],
    ['a two-digit year', '26-10'],
    ['an unpadded month', '2026-9'],
    ['an empty string', ''],
  ])('rejects %s (%s) as month', (_label, month) => {
    expect(createBookSchema.safeParse({ ...valid, month }).success).toBe(false);
  });

  it('points at the month field when the month is malformed', () => {
    const result = createBookSchema.safeParse({ ...valid, month: '2026-13' });

    expect(!result.success && result.error.issues[0]?.path).toEqual(['month']);
  });

  it('rejects an empty title', () => {
    expect(createBookSchema.safeParse({ ...valid, title: '  ' }).success).toBe(
      false,
    );
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
  ])('rejects a %s totalPages', (_label, totalPages) => {
    expect(createBookSchema.safeParse({ ...valid, totalPages }).success).toBe(
      false,
    );
  });

  /**
   * `coverUrl` tem TRÊS caminhos, e o do meio é o que faltava: `''` é o que um
   * formulário manda num campo de capa em branco, e `optionalText` (no
   * domínio) existe nominalmente para transformá-lo em `null`. Um
   * `z.string().url()` puro matava esse caminho com 400 antes de o domínio
   * ver — e o `author`, que já aceitava `''`, provava a inconsistência.
   */
  describe('coverUrl', () => {
    it('accepts an empty string (a blank form field)', () => {
      const result = createBookSchema.safeParse({ ...valid, coverUrl: '' });

      expect(result.success).toBe(true);
      expect(result.success && result.data.coverUrl).toBe('');
    });

    it('accepts a real URL', () => {
      const result = createBookSchema.safeParse({
        ...valid,
        coverUrl: 'https://exemplo.test/capa.jpg',
      });

      expect(result.success && result.data.coverUrl).toBe(
        'https://exemplo.test/capa.jpg',
      );
    });

    it.each(['nao-e-url', 'exemplo.test/capa.jpg', '   '])(
      'rejects %s, which is neither empty nor a URL',
      (coverUrl) => {
        const result = createBookSchema.safeParse({ ...valid, coverUrl });

        expect(result.success).toBe(false);
        expect(!result.success && result.error.issues[0]?.path).toEqual([
          'coverUrl',
        ]);
      },
    );

    // O `author` é o irmão que já estava certo: aceita `''` e deixa o domínio
    // transformá-lo em `null`. Os dois campos passaram a se comportar igual.
    it('behaves like author for the empty string', () => {
      expect(createBookSchema.safeParse({ ...valid, author: '' }).success).toBe(
        true,
      );
      expect(
        createBookSchema.safeParse({ ...valid, coverUrl: '' }).success,
      ).toBe(true);
    });

    it('accepts the empty string and the explicit null on editBookSchema', () => {
      expect(editBookSchema.parse({ coverUrl: '' })).toEqual({ coverUrl: '' });
      expect(editBookSchema.parse({ coverUrl: null })).toEqual({
        coverUrl: null,
      });
      expect(editBookSchema.safeParse({ coverUrl: 'nao-e-url' }).success).toBe(
        false,
      );
    });
  });

  // O tenant e o ator NUNCA vêm do corpo: o strip do Zod é a primeira
  // barreira. → CONVENCOES-CODIGO §6.3.
  it('strips clubId, actorUserId and userId', () => {
    const result = createBookSchema.parse({
      ...valid,
      clubId: 'club-invasor',
      actorUserId: 'user-invasor',
      userId: 'user-invasor',
      createdById: 'user-invasor',
      status: 'ARCHIVED',
    });

    expect(result).toEqual(valid);
  });

  it('validates each plan item of the list', () => {
    const result = createBookSchema.safeParse({
      ...valid,
      planItems: [
        { date: '2026-10-01', title: 'Cap. 1' },
        { date: '2026-02-30', title: 'Cap. 2' },
      ],
    });

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.path).toEqual([
      'planItems',
      1,
      'date',
    ]);
  });
});

describe('editBookSchema', () => {
  // A REGRA 5 DA TAREFA 06: ausente é "não mexe", `null` é "limpa". Um
  // `.default()` colapsaria os dois casos e o editBook perderia a distinção.
  it('keeps an explicit null', () => {
    const result = editBookSchema.parse({
      author: null,
      coverUrl: null,
      totalPages: null,
    });

    expect(result).toEqual({ author: null, coverUrl: null, totalPages: null });
    expect(Object.keys(result).sort()).toEqual([
      'author',
      'coverUrl',
      'totalPages',
    ]);
  });

  it('omits the field that was absent, instead of nulling it', () => {
    const result = editBookSchema.parse({ title: 'Título Novo' });

    expect(Object.keys(result)).toEqual(['title']);
    expect('author' in result).toBe(false);
    expect('coverUrl' in result).toBe(false);
    expect('totalPages' in result).toBe(false);
  });

  it('accepts an empty patch', () => {
    expect(editBookSchema.parse({})).toEqual({});
  });

  it.each(['title', 'month'])('refuses a null %s', (field) => {
    expect(editBookSchema.safeParse({ [field]: null }).success).toBe(false);
  });

  it('rejects a malformed month', () => {
    expect(editBookSchema.safeParse({ month: '2026-13' }).success).toBe(false);
  });

  it('strips a key it does not declare', () => {
    const result = editBookSchema.parse({
      title: 'Título Novo',
      clubId: 'club-invasor',
      actorUserId: 'user-invasor',
      status: 'ARCHIVED',
      archivedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result).toEqual({ title: 'Título Novo' });
  });
});

describe('replacePlanSchema', () => {
  it('accepts an empty plan (it means "remove everything")', () => {
    expect(replacePlanSchema.parse({ planItems: [] })).toEqual({
      planItems: [],
    });
  });

  it('requires the planItems key', () => {
    expect(replacePlanSchema.safeParse({}).success).toBe(false);
  });

  /**
   * A REGRA DE SEQUÊNCIA NA BORDA. `findPlanDateProblem` (em
   * `reading-plan-dates.ts`) é a MESMA função que `normalizePlanDrafts` usa —
   * uma implementação, dois chamadores, como o `isCalendarDay`.
   *
   * O que a borda acrescenta é o **ponteiro**: sem ela, um plano de 30 linhas
   * com uma data repetida devolvia 400 com uma frase em inglês e nada para a
   * tela marcar em vermelho (e `CONVENCOES-CODIGO` §6.2 proíbe exibir
   * `message` cru). O `path` é o que a Tarefa 20 consome.
   */
  describe('date sequence', () => {
    it('points at the repeated date, at its own index', () => {
      const result = replacePlanSchema.safeParse({
        planItems: [
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-01', title: 'Cap. 1 de novo' },
        ],
      });

      expect(result.success).toBe(false);
      expect(!result.success && result.error.issues[0]?.path).toEqual([
        'planItems',
        1,
        'date',
      ]);
      expect(!result.success && result.error.issues[0]?.message).toMatch(
        /already used at position 0/,
      );
    });

    it('points at a repeated date that is not adjacent', () => {
      const result = replacePlanSchema.safeParse({
        planItems: [
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-02', title: 'Cap. 2' },
          { date: '2026-10-01', title: 'Cap. 1 de novo' },
        ],
      });

      expect(!result.success && result.error.issues[0]?.path).toEqual([
        'planItems',
        2,
        'date',
      ]);
    });

    it('points at the date that is out of order', () => {
      const result = replacePlanSchema.safeParse({
        planItems: [
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-05', title: 'Cap. 5' },
          { date: '2026-10-02', title: 'Cap. 2' },
        ],
      });

      expect(!result.success && result.error.issues[0]?.path).toEqual([
        'planItems',
        2,
        'date',
      ]);
      expect(!result.success && result.error.issues[0]?.message).toMatch(
        /must come after 2026-10-05/,
      );
    });

    // A precedência: o formato é do item e sai primeiro. A sequência só é
    // conferida depois de cada item passar — comparar lexicograficamente uma
    // data não canônica mentiria. É a mesma ordem do `normalizePlanDrafts`.
    it('reports the malformed date instead of the sequence problem', () => {
      const result = replacePlanSchema.safeParse({
        planItems: [
          { date: '2026-10-05', title: 'Cap. 5' },
          { date: '2026-2-5', title: 'Cap. 2' },
        ],
      });

      expect(result.success).toBe(false);
      const paths =
        (!result.success && result.error.issues.map((issue) => issue.path)) ||
        [];
      expect(paths).toEqual([['planItems', 1, 'date']]);
      expect(!result.success && result.error.issues[0]?.message).toMatch(
        /calendar day/,
      );
    });

    it('accepts a plan whose dates are unique and increasing', () => {
      const result = replacePlanSchema.safeParse({
        planItems: [
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-02', title: 'Cap. 2' },
          { date: '2026-11-01', title: 'Cap. 3' },
        ],
      });

      expect(result.success).toBe(true);
    });

    // A mesma lista, o mesmo refinamento: o cadastro do livro não pode aceitar
    // o plano que o PUT recusa.
    it('applies the same rule inside createBookSchema', () => {
      const result = createBookSchema.safeParse({
        title: 'O Hobbit',
        month: '2026-10',
        planItems: [
          { date: '2026-10-02', title: 'Cap. 2' },
          { date: '2026-10-01', title: 'Cap. 1' },
        ],
      });

      expect(result.success).toBe(false);
      expect(!result.success && result.error.issues[0]?.path).toEqual([
        'planItems',
        1,
        'date',
      ]);
    });
  });

  it('points at the offending item and field', () => {
    const result = replacePlanSchema.safeParse({
      planItems: [
        { date: '2026-10-01', title: 'Cap. 1' },
        { date: '2026-10-02', title: '   ' },
      ],
    });

    expect(!result.success && result.error.issues[0]?.path).toEqual([
      'planItems',
      1,
      'title',
    ]);
  });
});

describe('listBooksQuerySchema', () => {
  // O CUIDADO QUE ESTE SCHEMA EXISTE PARA TER: `z.coerce.boolean()` faria
  // `'false'` virar `true`, porque a string não vazia é truthy.
  it("reads 'false' as false, not as true", () => {
    expect(listBooksQuerySchema.parse({ includeArchived: 'false' })).toEqual({
      includeArchived: false,
    });
  });

  it("reads 'true' as true", () => {
    expect(listBooksQuerySchema.parse({ includeArchived: 'true' })).toEqual({
      includeArchived: true,
    });
  });

  it('defaults to false when the parameter is absent', () => {
    expect(listBooksQuerySchema.parse({})).toEqual({ includeArchived: false });
  });

  it('rejects a value that is neither true nor false', () => {
    expect(
      listBooksQuerySchema.safeParse({ includeArchived: 'sim' }).success,
    ).toBe(false);
  });

  it('proves the coerce trap it avoids', () => {
    expect(Boolean('false')).toBe(true);
  });
});
