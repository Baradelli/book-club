import { describe, expect, it } from 'vitest';

import {
  createHighlightSchema,
  editHighlightSchema,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_PAGE_MAX,
  highlightColor,
  highlightIdParamsSchema,
  highlightResponseSchema,
  highlightsResponseSchema,
  listHighlightsQuerySchema,
} from '../index';

/**
 * O comentário do grifo como o TipTap o produz: `content` aninhado, `marks`
 * empilhadas e um `attrs` que **nenhum** schema declara.
 *
 * Factory e não `const` de módulo: é uma árvore, mutável por dentro, e objeto
 * compartilhado entre testes é estado escondido. → CONVENCOES-CODIGO §7.7.
 */
function aRichComment(): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: 'left', extensaoFutura: { nivel: 3 } },
        content: [
          { type: 'text', text: 'Achei ', marks: [{ type: 'bold' }] },
          {
            type: 'text',
            text: 'lindo',
            marks: [
              { type: 'italic' },
              { type: 'highlight', attrs: { color: 'yellow' } },
            ],
          },
        ],
      },
      { type: 'horizontalRule' },
    ],
  };
}

function aValidCreate(): Record<string, unknown> {
  return { quote: 'Num buraco no chão vivia um hobbit', color: '#facc15' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Regra 11 — a cor é A MESMA constante, e a borda NÃO normaliza caixa
// ─────────────────────────────────────────────────────────────────────────────

describe('highlightColor', () => {
  /**
   * ⚠️ REGRA 11 — a prova de que o `z.enum` **é** a paleta de `@clube/shared` e
   * não uma lista copiada (a lição nº 3 do MVP 1).
   *
   * A asserção é sobre as `options` do enum contra a constante, e não uma lista
   * escrita à mão: uma lista à mão aqui seria a **terceira** cópia da paleta, e
   * ficaria verde no dia em que a paleta mudasse e o schema não.
   */
  it('is built from HIGHLIGHT_COLORS itself, in the same order', () => {
    expect(highlightColor.options).toEqual([...HIGHLIGHT_COLORS]);
  });

  it.each(HIGHLIGHT_COLORS)('accepts %s', (color) => {
    expect(highlightColor.safeParse(color).success).toBe(true);
  });

  /**
   * ⚠️ REGRA 11 — a borda **não normaliza caixa**, e não é descuido.
   *
   * O `=` de texto do Postgres é byte-sensível: aceitar `#FACC15` criaria uma
   * segunda grafia gravada que o banco não reconhece como a mesma cor, e o
   * filtro por cor perderia metade dos grifos. É a mesma razão do
   * `isHighlightColor` do domínio não dobrar caixa nem dar `trim`.
   */
  it.each([
    ['the same hex in upper case', '#FACC15'],
    ['the same hex with a leading space', ' #facc15'],
    ['the rgba form of the editor', 'rgba(250, 204, 21, 0.40)'],
    ['a hex outside the palette', '#000000'],
    ['the three-digit shorthand', '#fc1'],
    ['a semantic name', 'YELLOW'],
    ['the hex without the hash', 'facc15'],
  ])('rejects %s', (_label, value) => {
    expect(highlightColor.safeParse(value).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regras 12, 13 e 14 — os corpos de escrita
// ─────────────────────────────────────────────────────────────────────────────

describe('createHighlightSchema', () => {
  it('accepts the minimum: a quote and a colour', () => {
    const parsed = createHighlightSchema.parse(aValidCreate());

    expect(parsed).toEqual({
      quote: 'Num buraco no chão vivia um hobbit',
      color: '#facc15',
    });
  });

  it('accepts every optional field', () => {
    const parsed = createHighlightSchema.parse({
      ...aValidCreate(),
      page: 45,
      reference: 'Cap. 1',
      commentDoc: aRichComment(),
    });

    expect(parsed.page).toBe(45);
    expect(parsed.reference).toBe('Cap. 1');
    expect(parsed.commentDoc).toEqual(aRichComment());
  });

  // O `.trim()` ANTES do `.min(1)` é o padrão do `createFreeNoteSchema`: assim
  // um trecho só-de-espaços é reprovado pela BORDA, com `details` apontando o
  // campo, em vez de virar um 400 sem `details` vindo do domínio.
  it('trims the quote and refuses one made only of spaces', () => {
    expect(
      createHighlightSchema.parse({ ...aValidCreate(), quote: '  o anel  ' })
        .quote,
    ).toBe('o anel');
    expect(
      createHighlightSchema.safeParse({ ...aValidCreate(), quote: '   ' })
        .success,
    ).toBe(false);
    expect(
      createHighlightSchema.safeParse({ ...aValidCreate(), quote: '' }).success,
    ).toBe(false);
  });

  it('refuses a body without a quote or without a colour', () => {
    expect(createHighlightSchema.safeParse({ color: '#facc15' }).success).toBe(
      false,
    );
    expect(createHighlightSchema.safeParse({ quote: 'oi' }).success).toBe(
      false,
    );
  });

  /**
   * ⚠️ REGRA 12 — no CORPO **não há `coerce`**.
   *
   * Corpo é JSON, e JSON tem número. Com `coerce` a string `"45"` passaria, e a
   * borda deixaria de ser a barreira que o §6.3 promete: o cliente que manda
   * texto onde o contrato diz número está enganado, e um 400 diz isso.
   */
  it('refuses a page that arrives as a string', () => {
    expect(
      createHighlightSchema.safeParse({ ...aValidCreate(), page: '45' })
        .success,
    ).toBe(false);
  });

  // A página é inteiro >= 1 — a mesma regra do `normalizeHighlightPage`, aqui
  // para o erro sair na borda com `details`.
  it.each([
    ['zero', 0],
    ['a negative', -3],
    ['a fraction', 45.5],
    ['a NaN', Number.NaN],
    ['an Infinity', Number.POSITIVE_INFINITY],
  ])('refuses a page that is %s', (_label, value) => {
    expect(
      createHighlightSchema.safeParse({ ...aValidCreate(), page: value })
        .success,
    ).toBe(false);
  });

  /**
   * ⚠️ REGRA 12, a metade do `.max` — e ela vale no CORPO tanto quanto na
   * query, porque é a MESMA coluna `Int` que recebe o valor.
   *
   * `page: 2 ** 31` num campo `Int` faz o Prisma **lançar**, e a rota
   * responderia **500** para um corpo que o cliente mandou errado. O teto do
   * int32 é o contrato da coluna, e a borda é onde ele é dizível.
   */
  it('refuses a page past the int32 ceiling of the column', () => {
    expect(HIGHLIGHT_PAGE_MAX).toBe(2147483647);
    expect(
      createHighlightSchema.safeParse({
        ...aValidCreate(),
        page: HIGHLIGHT_PAGE_MAX,
      }).success,
    ).toBe(true);
    expect(
      createHighlightSchema.safeParse({
        ...aValidCreate(),
        page: HIGHLIGHT_PAGE_MAX + 1,
      }).success,
    ).toBe(false);
  });

  it('refuses a commentDoc that is not a ProseMirror doc', () => {
    expect(
      createHighlightSchema.safeParse({
        ...aValidCreate(),
        commentDoc: { type: 'paragraph' },
      }).success,
    ).toBe(false);
  });

  /**
   * ⚠️ REGRA 13 — o corpo é `.strict()`, e o efeito é **400 e nada escrito**.
   *
   * `commentText` é DERIVADO do `commentDoc` no backend (ADR 0001) e
   * `userId`/`clubId` vêm do JWT e do livro (§6.3): quem os manda está enganado
   * sobre quem manda neles, e um 400 diz isso — o strip silencioso o deixaria
   * achar que funcionou. `status`/`archivedAt` são o caminho de arquivar, que é
   * o DELETE, e um deles no corpo seria um segundo caminho (e, pior, um caminho
   * para DESARQUIVAR, que é MVP 4).
   */
  it.each([
    ['commentText', { commentText: 'mentira' }],
    ['userId', { userId: 'outra-pessoa' }],
    // ⚠️ `actorUserId` está na lista porque é o nome do campo do UseCase — e
    // não porque "a ordem do spread o segura". MEDIDO nesta rodada de
    // correção, direto no Zod: um `z.object` SEM `.strict()` já faz **strip**
    // (`parse({quote,color,actorUserId})` → `{quote,color}`), e `req.body` é a
    // SAÍDA do parse, então a chave nunca chega ao handler e o spread invertido
    // não tem o que sobrescrever. O que o `.strict()` acrescenta é o **400 em
    // vez do strip silencioso**; quem torna a chave impossível é o strip do
    // `z.object` mais o campo não declarado. → §6.3.
    ['actorUserId', { actorUserId: 'outra-pessoa' }],
    ['clubId', { clubId: 'outro-clube' }],
    ['bookId', { bookId: 'outro-livro' }],
    ['status', { status: 'ARCHIVED' }],
    ['archivedAt', { archivedAt: '2026-01-01T00:00:00.000Z' }],
    ['id', { id: 'escolhi-o-id' }],
    ['createdAt', { createdAt: '2026-01-01T00:00:00.000Z' }],
    ['updatedAt', { updatedAt: '2026-01-01T00:00:00.000Z' }],
  ])('refuses a body that carries %s', (_label, extra) => {
    expect(
      createHighlightSchema.safeParse({ ...aValidCreate(), ...extra }).success,
    ).toBe(false);
  });
});

describe('editHighlightSchema', () => {
  /**
   * ⚠️ REGRA 14 — **ausente ≠ `null`**, e nenhum `.default()`.
   *
   * Um `.default()` colapsaria os dois casos num só e mataria a semântica
   * "limpa o campo" que a Tarefa 22 entregou: o patch vazio tem de sair vazio
   * (e não custar um `UPDATE`), e `null` explícito tem de CHEGAR ao UseCase.
   *
   * A asserção é sobre as CHAVES do objeto parseado, e não sobre os valores: um
   * `.default(null)` produziria `page: null` para um corpo vazio, o que um
   * `toBeNull()` não distinguiria de "o cliente pediu para limpar".
   */
  it('parses an empty patch into an object with no keys at all', () => {
    expect(Object.keys(editHighlightSchema.parse({}))).toEqual([]);
  });

  it('keeps an explicit null for page, reference and commentDoc', () => {
    const parsed = editHighlightSchema.parse({
      page: null,
      reference: null,
      commentDoc: null,
    });

    expect(Object.keys(parsed).sort()).toEqual([
      'commentDoc',
      'page',
      'reference',
    ]);
    expect(parsed.page).toBeNull();
    expect(parsed.reference).toBeNull();
    expect(parsed.commentDoc).toBeNull();
  });

  it('accepts each field on its own', () => {
    expect(editHighlightSchema.parse({ quote: '  o anel  ' }).quote).toBe(
      'o anel',
    );
    expect(editHighlightSchema.parse({ color: '#22c55e' }).color).toBe(
      '#22c55e',
    );
    expect(editHighlightSchema.parse({ page: 62 }).page).toBe(62);
    expect(editHighlightSchema.parse({ reference: 'Cap. 3' }).reference).toBe(
      'Cap. 3',
    );
    expect(
      editHighlightSchema.parse({ commentDoc: aRichComment() }).commentDoc,
    ).toEqual(aRichComment());
  });

  /**
   * `quote` e `color` **não** são anuláveis: um grifo sem trecho ou sem cor não
   * é grifo. É o desenho que o `EditHighlightInput` da Tarefa 22 já entregou.
   */
  it('refuses null for the quote and for the colour', () => {
    expect(editHighlightSchema.safeParse({ quote: null }).success).toBe(false);
    expect(editHighlightSchema.safeParse({ color: null }).success).toBe(false);
  });

  it('refuses a quote made only of spaces', () => {
    expect(editHighlightSchema.safeParse({ quote: '   ' }).success).toBe(false);
  });

  // Regra 12 no PATCH: mesma coluna, mesmas bordas, e sem `coerce`.
  it.each([
    ['a string', '45'],
    ['a fraction', 45.5],
    ['zero', 0],
    ['past the int32 ceiling', 2147483648],
  ])('refuses a page that is %s', (_label, value) => {
    expect(editHighlightSchema.safeParse({ page: value }).success).toBe(false);
  });

  // Regra 13 — `.strict()` também no PATCH.
  it.each([
    ['commentText', { commentText: 'mentira' }],
    ['userId', { userId: 'outra-pessoa' }],
    // ⚠️ `actorUserId` está na lista porque é o nome do campo do UseCase — e
    // não porque "a ordem do spread o segura". MEDIDO nesta rodada de
    // correção, direto no Zod: um `z.object` SEM `.strict()` já faz **strip**
    // (`parse({quote,color,actorUserId})` → `{quote,color}`), e `req.body` é a
    // SAÍDA do parse, então a chave nunca chega ao handler e o spread invertido
    // não tem o que sobrescrever. O que o `.strict()` acrescenta é o **400 em
    // vez do strip silencioso**; quem torna a chave impossível é o strip do
    // `z.object` mais o campo não declarado. → §6.3.
    ['actorUserId', { actorUserId: 'outra-pessoa' }],
    ['clubId', { clubId: 'outro-clube' }],
    ['status', { status: 'ARCHIVED' }],
    ['archivedAt', { archivedAt: null }],
  ])('refuses a patch that carries %s', (_label, extra) => {
    expect(editHighlightSchema.safeParse(extra).success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regras 12 e 13 — a query da listagem
// ─────────────────────────────────────────────────────────────────────────────

describe('listHighlightsQuerySchema', () => {
  it('parses an empty query into an empty filter', () => {
    expect(Object.keys(listHighlightsQuerySchema.parse({}))).toEqual([]);
  });

  it('parses the four navigation filters', () => {
    const parsed = listHighlightsQuerySchema.parse({
      bookId: 'livro-1',
      authorId: 'maria',
      color: '#ec4899',
      page: '45',
    });

    expect(parsed).toEqual({
      bookId: 'livro-1',
      authorId: 'maria',
      color: '#ec4899',
      page: 45,
    });
  });

  /**
   * ⚠️ REGRA 12 — na QUERY o `coerce` é obrigatório, e é a outra natureza.
   *
   * Query string é **texto**: `?page=45` chega como `'45'`, e sem `coerce` isso
   * seria um 400 para a URL que a tela de grifos monta. O corpo é JSON e não
   * leva `coerce` — as duas naturezas, duas declarações.
   */
  it('coerces the page of the query string, which is always text', () => {
    expect(listHighlightsQuerySchema.parse({ page: '45' }).page).toBe(45);
    expect(typeof listHighlightsQuerySchema.parse({ page: '45' }).page).toBe(
      'number',
    );
  });

  /**
   * ⚠️ REGRA 12 — o `coerce` **não** afrouxa a coluna, e as duas pontas que ele
   * fecha são de naturezas DIFERENTES. Medido nesta rodada de correção, contra
   * o Postgres do projeto:
   *
   * - **Fora do int32 → o Prisma LANÇA.** `page: 2147483648` dá
   *   `ConversionError` (*"Unable to fit integer value '2147483648' into an
   *   INT4"*), e sem o `.max()` a rota responde **500**.
   * - **Fração → o Prisma TRUNCA, não lança.** `find({ page: 45.5 })` chega ao
   *   SQL com o parâmetro `45` e devolve **o grifo da página 45** — idêntico ao
   *   resultado de `find({ page: 45 })`. O fake devolve `[]`.
   *
   * ⚠️ A frase antiga aqui dizia que a fração "lança", e estava **errada na
   * direção que esconde melhor**: a divergência fake × Prisma não é
   * "vazio × erro", é **vazio × os grifos de OUTRA página** — resultado errado
   * em silêncio, que é a direção restritiva do §7.1. Quem fecha isso é o
   * `.int()` daqui (400 antes de qualquer consulta); o port **não** revalida, de
   * propósito — dois donos da mesma regra é como as duas divergem.
   * → `ports/highlight-repository.ts`.
   */
  it.each([
    ['a fraction', '45.5'],
    ['zero', '0'],
    ['a negative', '-1'],
    ['a word', 'quarenta'],
    ['empty', ''],
    ['past the int32 ceiling', '2147483648'],
  ])('answers a validation error for a page that is %s', (_label, value) => {
    expect(listHighlightsQuerySchema.safeParse({ page: value }).success).toBe(
      false,
    );
  });

  it('accepts the int32 ceiling itself', () => {
    expect(
      listHighlightsQuerySchema.parse({ page: String(HIGHLIGHT_PAGE_MAX) })
        .page,
    ).toBe(HIGHLIGHT_PAGE_MAX);
  });

  it('refuses a colour outside the palette', () => {
    expect(
      listHighlightsQuerySchema.safeParse({ color: '#FACC15' }).success,
    ).toBe(false);
    expect(
      listHighlightsQuerySchema.safeParse({ color: 'amarelo' }).success,
    ).toBe(false);
  });

  /**
   * ⚠️ REGRA 13 — a query **não** é `.strict()`, e os corpos são.
   *
   * É o precedente exato do `listNotesQuerySchema`: uma query string ganha
   * parâmetro alheio por acidente (um `utm_source` colado de um link de
   * e-mail), e derrubar a listagem do clube por causa disso trocaria um risco
   * que não existe — não há campo derivado nem de tenant declarado aqui — por
   * uma quebra real. O strip do `z.object` continua sendo a primeira barreira:
   * `clubId` e `status` **somem** antes de o handler existir.
   */
  it('tolerates an unknown parameter and strips tenant and derived keys', () => {
    const parsed = listHighlightsQuerySchema.parse({
      bookId: 'livro-1',
      utm_source: 'email',
      clubId: 'outro-clube',
      actorUserId: 'forasteiro',
      status: 'ARCHIVED',
      commentText: 'x',
    });

    expect(parsed).toEqual({ bookId: 'livro-1' });
  });
});

describe('highlightIdParamsSchema', () => {
  it('requires a non-empty highlightId', () => {
    expect(
      highlightIdParamsSchema.parse({ highlightId: 'abc' }).highlightId,
    ).toBe('abc');
    expect(highlightIdParamsSchema.safeParse({ highlightId: '' }).success).toBe(
      false,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regra 15 — a losslessness do `commentDoc` na resposta
// ─────────────────────────────────────────────────────────────────────────────

function aHighlightResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'h1',
    clubId: 'c1',
    bookId: 'b1',
    userId: 'u1',
    quote: 'Num buraco no chão vivia um hobbit',
    color: '#facc15',
    page: 45,
    reference: 'Cap. 1',
    commentDoc: aRichComment(),
    commentText: 'Achei lindo',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('highlightResponseSchema', () => {
  /**
   * ⚠️ REGRA 15 — o `commentDoc` da RESPOSTA usa o `noteDocSchema`
   * (`.passthrough()`), e é isso que impede a resposta de sair com o comentário
   * **apagado**.
   *
   * O `serializerCompiler` do Zod descarta campo não declarado — é o que faz
   * dele fronteira de segurança (§6.1) —, então um
   * `z.object({ type: z.literal('doc') })` aqui responderia
   * `{"commentDoc":{"type":"doc"}}` com **200 e sem erro nenhum**: o `content`,
   * as `marks` e os `attrs` de cada extensão, tudo perdido.
   *
   * A prova é por SNAPSHOT antes/depois (§7.6), e não por um `toBe` de campo
   * escolhido à mão: o campo que a operação apagou é justamente o que ninguém
   * pensou em listar.
   */
  it('keeps the whole comment tree — content, marks and attrs — on the way out', () => {
    const before = JSON.stringify(aRichComment());

    const parsed = highlightResponseSchema.parse(aHighlightResponse());

    expect(JSON.stringify(parsed.commentDoc)).toBe(before);
  });

  // E a prova de que o `.passthrough()` é o que faz a diferença, não a sorte: a
  // árvore tem MAIS que a raiz, e um `doc` só com a raiz passaria no `toEqual`.
  it('keeps the nested marks and the attrs no schema declares', () => {
    const parsed = highlightResponseSchema.parse(aHighlightResponse());

    const serialized = JSON.stringify(parsed.commentDoc);
    expect(serialized).toContain('"highlight"');
    expect(serialized).toContain('"extensaoFutura"');
    expect(serialized).toContain('"horizontalRule"');
  });

  // O grifo sem comentário: `commentDoc` é `null` e `commentText` é `''`. É o
  // que a tela da Tarefa 25 lê para decidir se mostra o comentário.
  it('accepts a highlight with no comment at all', () => {
    const parsed = highlightResponseSchema.parse(
      aHighlightResponse({ commentDoc: null, commentText: '' }),
    );

    expect(parsed.commentDoc).toBeNull();
    expect(parsed.commentText).toBe('');
  });

  it('accepts a highlight with no page and no reference', () => {
    const parsed = highlightResponseSchema.parse(
      aHighlightResponse({ page: null, reference: null }),
    );

    expect(parsed.page).toBeNull();
    expect(parsed.reference).toBeNull();
  });

  it('accepts an archived highlight', () => {
    const parsed = highlightResponseSchema.parse(
      aHighlightResponse({
        status: 'ARCHIVED',
        archivedAt: '2026-02-01T00:00:00.000Z',
      }),
    );

    expect(parsed.status).toBe('ARCHIVED');
    expect(parsed.archivedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  /**
   * O serializer corta o que não está declarado — a fronteira do §6.1. Aqui a
   * prova é a lista EXATA de chaves: um `toEqual` de conjunto quebra tanto
   * quando sobra campo quanto quando falta.
   */
  it('returns exactly the declared keys, dropping anything else', () => {
    const parsed = highlightResponseSchema.parse(
      aHighlightResponse({ passwordHash: 'nao-deveria-estar-aqui' }),
    );

    expect(Object.keys(parsed).sort()).toEqual([
      'archivedAt',
      'bookId',
      'clubId',
      'color',
      'commentDoc',
      'commentText',
      'createdAt',
      'id',
      'page',
      'quote',
      'reference',
      'status',
      'updatedAt',
      'userId',
    ]);
  });

  it('refuses a colour outside the palette on the way out', () => {
    expect(
      highlightResponseSchema.safeParse(
        aHighlightResponse({ color: '#000000' }),
      ).success,
    ).toBe(false);
  });

  it('wraps the listing in an array', () => {
    const parsed = highlightsResponseSchema.parse([
      aHighlightResponse(),
      aHighlightResponse({ id: 'h2', commentDoc: null, commentText: '' }),
    ]);

    expect(parsed.map((highlight) => highlight.id)).toEqual(['h1', 'h2']);
  });
});
