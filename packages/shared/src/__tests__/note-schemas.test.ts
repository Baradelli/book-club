import { describe, expect, it } from 'vitest';

import {
  bookWithPlanResponseSchema,
  createFreeNoteSchema,
  editNoteSchema,
  listNotesQuerySchema,
  noteDocSchema,
  noteResponseSchema,
  upsertPlanNoteSchema,
} from '../index';

/**
 * O `doc` da anotação, com `content` e `marks` aninhados e um `attrs` que
 * nenhum schema declara — é a árvore que uma extensão do TipTap produz.
 *
 * Existe como FACTORY e não como `const` de módulo: o `doc` é mutável por
 * dentro (é uma árvore), e um objeto compartilhado entre testes é estado
 * escondido. → CONVENCOES-CODIGO §7.7.
 */
function aRichDoc(): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: 'left' },
        content: [
          {
            type: 'text',
            text: 'O anel é ',
            marks: [{ type: 'bold' }],
          },
          {
            type: 'text',
            text: 'pesado',
            marks: [{ type: 'italic' }, { type: 'highlight' }],
          },
        ],
      },
      { type: 'horizontalRule' },
    ],
  };
}

describe('noteDocSchema', () => {
  /**
   * ⚠️ A propriedade que decide a fatia: o `.passthrough()`.
   *
   * Sem ele o `serializerCompiler` do Zod responderia
   * `{"doc":{"type":"doc"}}` — a anotação inteira apagada, com 200 e sem erro
   * (CONVENCOES-CODIGO §6.1). Aqui a prova é por SNAPSHOT antes/depois, não por
   * um `toBe` escrito à mão: um valor listado à mão prova só que aquele campo
   * sobreviveu, e o que a operação apagou é justamente o que ninguém pensou em
   * listar. → §7.6.
   */
  it('keeps the whole tree — content, marks and attrs — on the way through', () => {
    const before = JSON.stringify(aRichDoc());

    const parsed = noteDocSchema.parse(aRichDoc());

    expect(JSON.stringify(parsed)).toBe(before);
  });

  it.each([
    ['a paragraph pretending to be a doc', { type: 'paragraph' }],
    ['an object without type', { content: [] }],
    ['a null', null],
    ['an array', []],
    ['a string', 'doc'],
    ['a number', 1],
  ])('rejects %s', (_label, value) => {
    expect(noteDocSchema.safeParse(value).success).toBe(false);
  });

  it('accepts an empty doc — the editor produces one before anything is typed', () => {
    expect(noteDocSchema.safeParse({ type: 'doc', content: [] }).success).toBe(
      true,
    );
  });
});

describe('upsertPlanNoteSchema', () => {
  it('accepts a body with only the doc', () => {
    expect(upsertPlanNoteSchema.safeParse({ doc: aRichDoc() }).success).toBe(
      true,
    );
  });

  it('rejects a body without a doc', () => {
    expect(upsertPlanNoteSchema.safeParse({}).success).toBe(false);
  });

  /**
   * `plainText` é DERIVADO do `doc` no backend (ADR 0001), então mandá-lo é um
   * cliente enganado sobre quem manda nele. O `.strict()` o recusa com 400 em
   * vez de descartá-lo em silêncio.
   */
  it.each(['plainText', 'userId', 'clubId', 'bookId', 'planItemId', 'title'])(
    'rejects a body carrying %s',
    (key) => {
      expect(
        upsertPlanNoteSchema.safeParse({ doc: aRichDoc(), [key]: 'x' }).success,
      ).toBe(false);
    },
  );
});

describe('createFreeNoteSchema', () => {
  it('accepts title, reference and doc', () => {
    const parsed = createFreeNoteSchema.parse({
      title: '  Sobre o poder  ',
      reference: 'p. 45',
      doc: aRichDoc(),
    });

    // `.trim()` antes do `.min(1)`: a borda normaliza e o `details` aponta o
    // campo, em vez de o domínio devolver um 400 sem `details`.
    expect(parsed.title).toBe('Sobre o poder');
    expect(parsed.reference).toBe('p. 45');
  });

  it('accepts a note without a reference', () => {
    expect(
      createFreeNoteSchema.safeParse({
        title: 'Sobre o poder',
        doc: aRichDoc(),
      }).success,
    ).toBe(true);
  });

  it.each([
    ['an empty title', ''],
    ['a title of only spaces', '   '],
  ])('rejects %s', (_label, title) => {
    expect(
      createFreeNoteSchema.safeParse({ title, doc: aRichDoc() }).success,
    ).toBe(false);
  });

  it('points at the title field when the title is empty', () => {
    const result = createFreeNoteSchema.safeParse({
      title: '   ',
      doc: aRichDoc(),
    });

    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.path).toEqual(['title']);
  });

  it.each(['plainText', 'userId', 'clubId'])(
    'rejects a body carrying %s',
    (key) => {
      expect(
        createFreeNoteSchema.safeParse({
          title: 'Sobre o poder',
          doc: aRichDoc(),
          [key]: 'x',
        }).success,
      ).toBe(false);
    },
  );
});

describe('editNoteSchema', () => {
  // Um patch vazio é legítimo: é o retry de uma fila offline que já coalesceu
  // tudo, e o UseCase o trata como no-op.
  it('accepts an empty patch', () => {
    expect(editNoteSchema.safeParse({}).success).toBe(true);
  });

  /**
   * A distinção **ausente × `null`**: ausente não mexe, `null` LIMPA. É por isso
   * que não há `.default()` em `reference` — ele colapsaria os dois casos.
   */
  it('keeps absent and null apart in reference', () => {
    expect(editNoteSchema.parse({})).not.toHaveProperty('reference');
    expect(editNoteSchema.parse({ reference: null }).reference).toBeNull();
  });

  it('rejects a null title — the free note always has one', () => {
    expect(editNoteSchema.safeParse({ title: null }).success).toBe(false);
  });

  it('rejects a title of only spaces', () => {
    expect(editNoteSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('rejects a doc that is not a doc', () => {
    expect(
      editNoteSchema.safeParse({ doc: { type: 'paragraph' } }).success,
    ).toBe(false);
  });

  it.each(['plainText', 'userId', 'clubId', 'status', 'archivedAt'])(
    'rejects a patch carrying %s',
    (key) => {
      expect(editNoteSchema.safeParse({ [key]: 'x' }).success).toBe(false);
    },
  );
});

describe('listNotesQuerySchema', () => {
  it('accepts the five filters', () => {
    const parsed = listNotesQuerySchema.parse({
      bookId: 'book-1',
      authorId: 'user-1',
      kind: 'PLAN',
      planItemId: 'plan-1',
      text: 'anel',
    });

    expect(parsed).toEqual({
      bookId: 'book-1',
      authorId: 'user-1',
      kind: 'PLAN',
      planItemId: 'plan-1',
      text: 'anel',
    });
  });

  it('accepts an empty query — no filter is "the whole club"', () => {
    expect(listNotesQuerySchema.parse({})).toEqual({});
  });

  it('rejects a kind that is not PLAN or FREE', () => {
    expect(listNotesQuerySchema.safeParse({ kind: 'DAY' }).success).toBe(false);
  });

  // Sem `.strict()`, ao contrário dos corpos de escrita: um parâmetro alheio
  // colado de um link não pode derrubar a listagem do clube.
  it('ignores an unknown query parameter instead of rejecting it', () => {
    expect(listNotesQuerySchema.parse({ utm_source: 'whatsapp' })).toEqual({});
  });
});

describe('noteResponseSchema', () => {
  function aNoteResponse(): Record<string, unknown> {
    return {
      id: 'note-1',
      clubId: 'club-1',
      bookId: 'book-1',
      userId: 'user-1',
      kind: 'FREE',
      planItemId: null,
      title: 'Sobre o poder',
      reference: 'p. 45',
      doc: aRichDoc(),
      plainText: 'O anel é pesado',
      status: 'ACTIVE',
      archivedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  // `plainText` APARECE na resposta (derivado e útil ao front), e é justamente
  // por isso que ele não entra em nenhum input. → ADR 0001, regra 30.
  it('carries plainText out', () => {
    expect(noteResponseSchema.parse(aNoteResponse()).plainText).toBe(
      'O anel é pesado',
    );
  });

  // A losslessness na SAÍDA: o serializer é este schema, e é aqui que a
  // anotação seria apagada se o `doc` não fosse passthrough.
  it('serializes the doc without losing the tree', () => {
    const before = JSON.stringify(aRichDoc());

    const parsed = noteResponseSchema.parse(aNoteResponse());

    expect(JSON.stringify(parsed.doc)).toBe(before);
  });

  // A fronteira de segurança: campo não declarado NÃO sai. É o que impede um
  // `toNoteResponse` errado de vazar coluna nova.
  it('drops a field the schema does not declare', () => {
    const parsed = noteResponseSchema.parse({
      ...aNoteResponse(),
      passwordHash: 'nunca',
    });

    expect(parsed).not.toHaveProperty('passwordHash');
  });
});

describe('bookWithPlanResponseSchema', () => {
  function aBookWithPlan(writers: unknown): Record<string, unknown> {
    return {
      book: {
        id: 'book-1',
        clubId: 'club-1',
        title: 'O Senhor dos Anéis',
        author: null,
        month: '2026-10',
        coverUrl: null,
        totalPages: null,
        createdById: 'user-1',
        status: 'ACTIVE',
        archivedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      planItems: [],
      writers,
    };
  }

  // Regra 35 — o campo chega. Sem ele declarado aqui, o `writers` que o
  // `getBookWithPlan` passou a devolver sairia APAGADO (§6.1).
  it('carries writers out', () => {
    const parsed = bookWithPlanResponseSchema.parse(
      aBookWithPlan([{ planItemId: 'plan-1', userIds: ['user-a', 'user-z'] }]),
    );

    expect(parsed.writers).toEqual([
      { planItemId: 'plan-1', userIds: ['user-a', 'user-z'] },
    ]);
  });

  it('accepts an empty overlay', () => {
    expect(bookWithPlanResponseSchema.parse(aBookWithPlan([])).writers).toEqual(
      [],
    );
  });

  // Obrigatório, não opcional: `[]` é a resposta de "ninguém escreveu", e um
  // `undefined` só significaria "o servidor esqueceu".
  it('refuses a response without writers', () => {
    const withoutWriters = aBookWithPlan([]);
    delete withoutWriters['writers'];

    expect(bookWithPlanResponseSchema.safeParse(withoutWriters).success).toBe(
      false,
    );
  });

  /**
   * ⚠️ REGRA 14 da Tarefa 32 — o `readers` CHEGA, e é o `.optional()` que faz
   * esta fatia caber sem tocar `packages/app`.
   *
   * Sem o campo declarado aqui, o `readers` que o `getBookWithPlan` passou a
   * devolver sairia **apagado** pelo serializer, com 200 e sem erro nenhum
   * (§6.1) — que é exatamente a armadilha que o `writers` documentou na
   * Tarefa 11.
   */
  it('carries readers out, next to writers', () => {
    const parsed = bookWithPlanResponseSchema.parse({
      ...aBookWithPlan([{ planItemId: 'plan-1', userIds: ['user-a'] }]),
      readers: [{ planItemId: 'plan-2', userIds: ['user-b', 'user-c'] }],
    });

    expect(parsed.writers).toEqual([
      { planItemId: 'plan-1', userIds: ['user-a'] },
    ]);
    // As duas sobreposições são INDEPENDENTES: ler não é escrever, e a
    // resposta as carrega separadas. Um handler que passasse a mesma lista nos
    // dois campos acusaria aqui.
    expect(parsed.readers).toEqual([
      { planItemId: 'plan-2', userIds: ['user-b', 'user-c'] },
    ]);
  });

  /**
   * ⚠️ **A FASE 1 DO PHASE-IN, e o teste que ela pede.** Diferente do
   * `writers`, uma resposta SEM `readers` é aceita — e é isso que deixa os 164
   * testes de tela de `packages/app` continuarem passando enquanto a 32b não
   * sobe os fixtures. O docblock do schema é o dono do argumento; este teste
   * é o que faz a fase 2 (tirar o `optional()`) ficar VERMELHA aqui em vez de
   * passar batida.
   */
  it('still accepts a response without readers, which is the phase-1 shape', () => {
    const parsed = bookWithPlanResponseSchema.parse(aBookWithPlan([]));

    expect(parsed.readers).toBeUndefined();
  });

  // Nenhum contador de progresso atravessa: progresso é presença, e é o
  // contrato que torna o número irrenderizável.
  it('drops a progress count somebody adds to the book response', () => {
    const parsed = bookWithPlanResponseSchema.parse({
      ...aBookWithPlan([]),
      readers: [],
      readDays: 12,
      progress: 0.4,
    });

    expect(parsed).not.toHaveProperty('readDays');
    expect(parsed).not.toHaveProperty('progress');
  });
});
