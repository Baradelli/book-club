import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { InvalidHighlightError, InvalidNoteError } from '../../domain/errors';
import type { Highlight } from '../../domain/highlight';
import type { NoteDoc } from '../../domain/note';
import { required } from '../../test-support/builders';
import { PrismaHighlightRepository } from '../prisma-highlight-repository';
import { prefixedEmail, prefixedId, prisma, removeFixtures } from './_db';

const CLUB_ID = prefixedId('t24', 'hl-club');
const OTHER_CLUB_ID = prefixedId('t24', 'hl-otherclub');
const AUTHOR_ID = prefixedId('t24', 'hl-author');
const OTHER_AUTHOR_ID = prefixedId('t24', 'hl-otherauthor');
const BOOK_ID = prefixedId('t24', 'hl-book');
const OTHER_BOOK_ID = prefixedId('t24', 'hl-otherbook');
const FOREIGN_BOOK_ID = prefixedId('t24', 'hl-foreignbook');
/** Livro só do teste da válvula: ele grava 501 linhas. */
const TAKE_BOOK_ID = prefixedId('t24', 'hl-takebook');

const EVERY_BOOK_ID = [
  BOOK_ID,
  OTHER_BOOK_ID,
  FOREIGN_BOOK_ID,
  TAKE_BOOK_ID,
] as const;

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
/** Com milissegundos NÃO zerados: é o que a regra do `updatedAt` mede. */
const UPDATED_AT = new Date('2026-03-04T05:06:07.008Z');

/**
 * O teto do `find` do repositório (`FIND_ROW_LIMIT`), pinado aqui de propósito.
 *
 * ⚠️ É o pino INDEPENDENTE do número que o código usa: se alguém mudar o teto,
 * este arquivo é o que denuncia. Um `import` da constante faria os dois lados
 * da asserção virem do código sob teste — a identidade do §7.8.
 */
const EXPECTED_ROW_LIMIT = 500;

/**
 * O comentário do grifo, como o ADR 0001 existe para proteger: `attrs` de
 * extensão, `marks` empilhadas, lista aninhada, acento, e uma URL com `&` e
 * `=`. Um round-trip que perdesse qualquer nível passaria num doc de um
 * parágrafo só.
 *
 * Factory e não `const`: é uma árvore, mutável por dentro (§7.7).
 */
function aRichComment(): NoteDoc {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Sobre a coragem' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Achei ' },
          {
            type: 'text',
            marks: [{ type: 'bold' }, { type: 'italic' }],
            text: 'lindo',
          },
          { type: 'text', text: ', e anotei ' },
          {
            type: 'text',
            marks: [
              {
                type: 'link',
                attrs: { href: 'https://exemplo.test/a?b=1&c=2' },
              },
            ],
            text: 'isto aqui',
          },
        ],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'reler no fim do mês' }],
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Todo grifo criado por este arquivo, para a limpeza. **Não é uma lista
 * "esperada"**: o `afterAll` também CONSULTA o banco pelos livros do arquivo,
 * então um teste que falhe no meio não vaza fixture e a limpeza não estoura na
 * FK (CONVENCOES-CODIGO §6.6).
 */
const highlightIds: string[] = [];

function trackedHighlightId(prefix: string): string {
  const id = prefixedId('t24', `hl-${prefix}`);
  highlightIds.push(id);
  return id;
}

/**
 * O grifo do fixture. O `prefix` é o que dá o id — e nunca vem do `overrides`
 * de propósito: id que não passa por aqui não entra na lista de limpeza.
 */
function aHighlightRow(
  prefix: string,
  overrides: Partial<Highlight> = {},
): Highlight {
  return {
    id: trackedHighlightId(prefix),
    clubId: CLUB_ID,
    bookId: BOOK_ID,
    userId: AUTHOR_ID,
    quote: 'não é o que você tem, é o que você faz com o que tem',
    color: '#facc15',
    page: 45,
    reference: null,
    commentDoc: aRichComment(),
    commentText: 'Achei lindo',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

/** Apaga TODO grifo dos livros deste arquivo, por id, consultando o banco. */
async function cleanUpHighlights(): Promise<void> {
  const ofBooks = await prisma.highlight.findMany({
    where: { bookId: { in: [...EVERY_BOOK_ID] } },
    select: { id: true },
  });
  await removeFixtures({
    highlightIds: [
      ...new Set([...highlightIds, ...ofBooks.map((row) => row.id)]),
    ],
  });
}

describe('PrismaHighlightRepository (contract)', () => {
  const repo = new PrismaHighlightRepository(prisma);

  beforeAll(async () => {
    // O grifo antes do livro, e o livro antes do clube e do autor: as FKs são
    // RESTRICT.
    await cleanUpHighlights();
    await removeFixtures({
      bookIds: [...EVERY_BOOK_ID],
      clubIds: [CLUB_ID, OTHER_CLUB_ID],
      userIds: [AUTHOR_ID, OTHER_AUTHOR_ID],
    });

    for (const [id, label] of [
      [AUTHOR_ID, 'author'],
      [OTHER_AUTHOR_ID, 'otherauthor'],
    ] as const) {
      await prisma.user.create({
        data: {
          id,
          email: prefixedEmail('t24', `hl-${label}`),
          name: 'Fixture Author',
        },
      });
    }
    await prisma.club.create({ data: { id: CLUB_ID, name: 'Clube do Grifo' } });
    await prisma.club.create({
      data: { id: OTHER_CLUB_ID, name: 'Outro Clube' },
    });
    for (const [id, clubId] of [
      [BOOK_ID, CLUB_ID],
      [OTHER_BOOK_ID, CLUB_ID],
      [TAKE_BOOK_ID, CLUB_ID],
      [FOREIGN_BOOK_ID, OTHER_CLUB_ID],
    ] as const) {
      await prisma.book.create({
        data: {
          id,
          clubId,
          title: 'O Hobbit',
          month: '2026-10',
          createdById: AUTHOR_ID,
        },
      });
    }
  });

  afterAll(async () => {
    await cleanUpHighlights();
    await removeFixtures({
      bookIds: [...EVERY_BOOK_ID],
      clubIds: [CLUB_ID, OTHER_CLUB_ID],
      userIds: [AUTHOR_ID, OTHER_AUTHOR_ID],
    });
    await prisma.$disconnect();
  });

  /**
   * Cada teste começa sem grifo nenhum dos livros do arquivo: um teste de
   * contrato não pode depender do estado que outro deixou — um que dependia
   * passava verde rodado isolado, sem exercitar o filtro que dizia provar
   * (CONVENCOES-CODIGO §6.6).
   */
  beforeEach(async () => {
    await prisma.highlight.deleteMany({
      where: { bookId: { in: [...EVERY_BOOK_ID] } },
    });
  });

  describe('save', () => {
    it('creates the highlight and maps every field back', async () => {
      const highlight = aHighlightRow('create', { reference: 'Cap. 1' });

      const saved = await repo.save(highlight);

      expect(saved).toEqual(highlight);
      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.updatedAt).toBeInstanceOf(Date);
      // ...e o que voltou do banco numa SEGUNDA leitura é o mesmo.
      expect(await repo.byId(highlight.id)).toEqual(highlight);
    });

    /**
     * A parte que o ADR 0001 existe para garantir: o `commentDoc` volta
     * IDÊNTICO — `attrs` de extensão, `marks` empilhadas, lista aninhada,
     * acento e a URL com `&`. É a coluna que não pode ser lossy.
     */
    it('round-trips the commentDoc with nested content, marks and attrs', async () => {
      const highlight = aHighlightRow('lossless');

      await repo.save(highlight);

      const read = required(await repo.byId(highlight.id));
      expect(read.commentDoc).toEqual(aRichComment());
      // E o objeto que volta é NOVO: o Prisma reparseia o JSON a cada leitura,
      // então mutar o que se leu não pode contaminar a próxima leitura.
      required(read.commentDoc).content = [];
      expect(required(await repo.byId(highlight.id)).commentDoc).toEqual(
        aRichComment(),
      );
    });

    /**
     * ⚠️ REGRA 5 — `Json?` + `null` no Prisma **NÃO é `null`**.
     *
     * Numa coluna `Json?` o tipo de entrada é
     * `DbNull | JsonNull | InputJsonValue`, e `null` literal é **erro de
     * compilação** — o repositório usa `Prisma.DbNull`. As três provas, e as
     * três importam:
     *
     * 1. o domínio recebe **`null`** de volta (não a string `"null"`, não um
     *    sentinela, não um objeto) — é o que a tela da Tarefa 25 lê para
     *    decidir se mostra o comentário;
     * 2. a COLUNA é SQL `NULL`, e não o `'null'::jsonb` que o
     *    `Prisma.JsonNull` gravaria — o `IS NULL` do Postgres distingue os dois,
     *    e o mapper não;
     * 3. `commentText` fica `''`, que é o que o domínio produz quando não há
     *    comentário.
     */
    it('stores a highlight with no comment as a real SQL NULL, and reads it back as null', async () => {
      const highlight = aHighlightRow('nocomment', {
        commentDoc: null,
        commentText: '',
      });

      const saved = await repo.save(highlight);

      expect(saved.commentDoc).toBeNull();
      expect(saved.commentText).toBe('');
      expect(required(await repo.byId(highlight.id)).commentDoc).toBeNull();
      // A prova de que é SQL NULL e não JSON `null`: `'null'::jsonb IS NULL` é
      // FALSO, então um `Prisma.JsonNull` acusaria aqui.
      const rows = await prisma.$queryRaw<
        { sqlnull: boolean; astext: string | null }[]
      >`
        SELECT "commentDoc" IS NULL AS sqlnull,
               "commentDoc"::text   AS astext
        FROM "Highlight" WHERE "id" = ${highlight.id}
      `;
      expect(required(rows[0])).toEqual({ sqlnull: true, astext: null });
    });

    // O mesmo par de campos no `update`: limpar o comentário grava SQL NULL.
    it('clears the comment to a real SQL NULL on update', async () => {
      const highlight = aHighlightRow('clearcomment');
      await repo.save(highlight);

      const updated = await repo.update(highlight.id, {
        commentDoc: null,
        commentText: '',
      });

      expect(updated.commentDoc).toBeNull();
      const rows = await prisma.$queryRaw<{ sqlnull: boolean }[]>`
        SELECT "commentDoc" IS NULL AS sqlnull
        FROM "Highlight" WHERE "id" = ${highlight.id}
      `;
      expect(required(rows[0]).sqlnull).toBe(true);
    });

    // A prova NO BANCO, e não só no que o mapper devolve: a coluna guarda a
    // árvore inteira. Um `commentDoc` que o Prisma serializasse como `{}` (o
    // risco de um `toJSON` que não fosse chamado) passaria pelo `toEqual` de
    // cima se o mapper tivesse cache.
    it('stores the whole comment tree in the jsonb column', async () => {
      const highlight = aHighlightRow('column');
      await repo.save(highlight);

      const rows = await prisma.$queryRaw<{ mark: string; href: string }[]>`
        SELECT "commentDoc" #>> '{content,1,content,1,marks,0,type}' AS mark,
               "commentDoc" #>> '{content,1,content,3,marks,0,attrs,href}' AS href
        FROM "Highlight" WHERE "id" = ${highlight.id}
      `;

      expect(required(rows[0])).toEqual({
        mark: 'bold',
        href: 'https://exemplo.test/a?b=1&c=2',
      });
    });

    // Upsert por `id`, como os outros repositórios.
    it('updates in place when the same id is saved again', async () => {
      const first = aHighlightRow('upsert');
      await repo.save(first);

      const again = await repo.save({ ...first, quote: 'corrigi o trecho' });

      expect(again.id).toBe(first.id);
      expect(again.quote).toBe('corrigi o trecho');
      await expect(
        prisma.highlight.count({ where: { bookId: BOOK_ID } }),
      ).resolves.toBe(1);
    });

    /**
     * ⚠️ O grifo é **ILIMITADO**, e é a tabela que garante: **nenhum
     * `@@unique`**. Grifar o mesmo trecho outra vez numa releitura, com outra
     * cor, é o caso de uso — um índice único o transformaria em 409.
     *
     * Três grifos byte-idênticos (menos o id) convivendo é o que prova.
     */
    it('keeps three identical highlights of the same author in the same book', async () => {
      const shared = { quote: 'a mesma frase', color: '#facc15' as const };
      await repo.save(aHighlightRow('unlimited-a', shared));
      await repo.save(aHighlightRow('unlimited-b', shared));
      await repo.save(aHighlightRow('unlimited-c', shared));

      const rows = await prisma.highlight.findMany({
        where: { bookId: BOOK_ID, userId: AUTHOR_ID, quote: 'a mesma frase' },
      });
      expect(rows).toHaveLength(3);
      // A pré-condição: os três são do MESMO autor, na MESMA página e cor.
      expect(rows.every((row) => row.page === 45)).toBe(true);
      expect(new Set(rows.map((row) => row.color)).size).toBe(1);
    });

    it('stores a highlight with no page and no reference', async () => {
      const highlight = aHighlightRow('nopage', { page: null });

      const saved = await repo.save(highlight);

      expect(saved.page).toBeNull();
      expect(saved.reference).toBeNull();
      expect(required(await repo.byId(highlight.id)).page).toBeNull();
    });
  });

  describe('byId', () => {
    // O port é explícito: devolve arquivado também, e o `highlightForAuthor`
    // depende disso para tratar arquivado como inexistente.
    it('returns an archived highlight too', async () => {
      const archivedAt = new Date('2026-02-01T00:00:00.000Z');
      const highlight = aHighlightRow('archived', {
        status: 'ARCHIVED',
        archivedAt,
      });
      await repo.save(highlight);

      const found = required(await repo.byId(highlight.id));

      expect(found.status).toBe('ARCHIVED');
      expect(found.archivedAt).toEqual(archivedAt);
    });

    it('returns null for an id that was never saved', async () => {
      await expect(
        repo.byId(prefixedId('t24', 'hl-ghost')),
      ).resolves.toBeNull();
    });

    /**
     * ⚠️ REGRA 6 — o `toDomain` estreita `Json` → `NoteDoc | null` com
     * `assertNoteDoc`, o precedente exato do `PrismaNoteRepository`.
     *
     * Um `commentDoc` corrompido no banco **estoura na leitura**, não três
     * camadas depois dentro do `docToText`. A corrupção é escrita pelo Prisma
     * cru de propósito: nenhum caminho do domínio consegue produzi-la, que é
     * justamente por que a guarda existe.
     */
    it('refuses a commentDoc that is not a ProseMirror doc', async () => {
      const highlight = aHighlightRow('corrupt');
      await repo.save(highlight);
      await prisma.highlight.update({
        where: { id: highlight.id },
        data: { commentDoc: { type: 'paragraph' } },
      });

      await expect(repo.byId(highlight.id)).rejects.toBeInstanceOf(
        InvalidNoteError,
      );
    });

    /**
     * ⚠️ REGRA 6, a metade da COR — e a coluna é `String`, não enum Prisma
     * (`CLAUDE.md`: `Highlight.color` é um dos quatro validados por `z.enum`,
     * porque paleta configurável por clube é o futuro registrado).
     *
     * Sem enum no banco, nada impede uma cor de fora da paleta de chegar à
     * coluna — e o `toDomain` tem de estreitar `String` → `HighlightColor` sem
     * cast (o `CLAUDE.md` proíbe). Então o `assertHighlightColor` faz a cor
     * corrompida estourar na LEITURA, e não na tela, pintando um grifo
     * transparente. Sem este teste o assert seria decoração: nenhum caminho do
     * domínio produz a corrupção, que é justamente por que a guarda existe.
     */
    it('refuses a colour that is not in the palette', async () => {
      const highlight = aHighlightRow('corrupt-color');
      await repo.save(highlight);
      await prisma.highlight.update({
        where: { id: highlight.id },
        data: { color: '#000000' },
      });

      await expect(repo.byId(highlight.id)).rejects.toBeInstanceOf(
        InvalidHighlightError,
      );
    });

    /**
     * ⚠️ E o outro lado, que é o que faz o `null` não ser tratado como
     * corrupção: o grifo SEM comentário lê normalmente. Um `toDomain` que
     * chamasse `assertNoteDoc` sem o desvio do `null` estouraria em todo grifo
     * sem comentário — o caso mais comum de todos.
     */
    it('reads a highlight with no comment without raising', async () => {
      const highlight = aHighlightRow('nocomment-read', {
        commentDoc: null,
        commentText: '',
      });
      await repo.save(highlight);

      const found = required(await repo.byId(highlight.id));

      expect(found.commentDoc).toBeNull();
      expect(found.quote).toBe(highlight.quote);
    });
  });

  describe('update', () => {
    it('applies only the keys present in the patch', async () => {
      const highlight = aHighlightRow('patch', { reference: 'Cap. 1' });
      await repo.save(highlight);

      const updated = await repo.update(highlight.id, {
        quote: 'corrigido',
      });

      expect(updated).toEqual({ ...highlight, quote: 'corrigido' });
    });

    // `null` é valor e sobrescreve.
    it('writes null when the patch says null', async () => {
      const highlight = aHighlightRow('patch-null', { reference: 'Cap. 1' });
      await repo.save(highlight);

      const updated = await repo.update(highlight.id, {
        reference: null,
        page: null,
      });

      expect(updated.reference).toBeNull();
      expect(updated.page).toBeNull();
    });

    // `undefined` é ausência, não "grava nulo".
    it('treats undefined in the patch as "do not touch"', async () => {
      const highlight = aHighlightRow('patch-undef', { reference: 'Cap. 1' });
      await repo.save(highlight);

      const updated = await repo.update(highlight.id, {
        reference: undefined,
        page: undefined,
      });

      expect(updated.reference).toBe('Cap. 1');
      expect(updated.page).toBe(45);
    });

    /**
     * ⚠️ REGRA 1 / ADR 0008 — o `updatedAt` que o DOMÍNIO mandou é o que volta,
     * com precisão de milissegundo.
     *
     * Com `@updatedAt` no schema o Prisma bombearia a coluna com "agora" e este
     * teste falharia — é a prova, no banco, de que o atributo **não está lá**.
     */
    it('stores the updatedAt the domain sent, down to the millisecond', async () => {
      const highlight = aHighlightRow('updatedat');
      await repo.save(highlight);
      const domainInstant = new Date('2026-07-08T09:10:11.012Z');

      const updated = await repo.update(highlight.id, {
        quote: 'reescrito',
        updatedAt: domainInstant,
      });

      expect(updated.updatedAt).toEqual(domainInstant);
      expect(updated.updatedAt.getMilliseconds()).toBe(12);
      // E a coluna, não só o que o mapper devolveu.
      const rows = await prisma.$queryRaw<{ at: string }[]>`
        SELECT to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS at
        FROM "Highlight" WHERE "id" = ${highlight.id}
      `;
      expect(required(rows[0]).at).toBe('2026-07-08T09:10:11.012');
    });

    // O outro lado da mesma prova: um patch que NÃO manda `updatedAt` deixa a
    // coluna quieta. `@updatedAt` moveria o valor aqui.
    it('leaves updatedAt alone when the patch does not carry it', async () => {
      const highlight = aHighlightRow('updatedat-quiet');
      await repo.save(highlight);

      const updated = await repo.update(highlight.id, { quote: 'outro' });

      expect(updated.updatedAt).toEqual(UPDATED_AT);
    });

    /**
     * ⚠️ REGRA 9 — o `toUpdateData` **não tem allowlist**, e é o dividendo do
     * `HighlightPatch` ser um tipo próprio (§7.1.1): identidade (`id`), tenant
     * (`clubId`/`bookId`), autoria (`userId`) e `createdAt` não são
     * REPRESENTÁVEIS no patch — o compilador recusa o literal, e o
     * `HighlightRepositoryFake` copia campo a campo o resto.
     *
     * O que sobra para provar aqui, contra o Postgres, é que as **nove** chaves
     * que o `HighlightPatch` permite chegam todas, e que nada mais muda — a
     * losslessness por snapshot (§7.6), e não um `toBe` de campo escolhido à
     * mão.
     */
    it('applies every key the HighlightPatch does allow, and nothing else changes', async () => {
      const highlight = aHighlightRow('patch-allowed', {
        reference: 'Cap. 1',
      });
      await repo.save(highlight);
      const archivedAt = new Date('2026-08-09T10:11:12.013Z');
      const newComment: NoteDoc = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'outro' }] },
        ],
      };

      const updated = await repo.update(highlight.id, {
        quote: 'reescrito',
        color: '#3b82f6',
        page: 62,
        reference: 'Cap. 3',
        commentDoc: newComment,
        commentText: 'outro',
        status: 'ARCHIVED',
        archivedAt,
        updatedAt: archivedAt,
      });

      expect(updated).toEqual({
        ...highlight,
        quote: 'reescrito',
        color: '#3b82f6',
        page: 62,
        reference: 'Cap. 3',
        commentDoc: newComment,
        commentText: 'outro',
        status: 'ARCHIVED',
        archivedAt,
        updatedAt: archivedAt,
      });
    });
  });

  describe('find', () => {
    // O `clubId` é o corte de tenant e vale sempre.
    it('never returns a highlight of another club', async () => {
      await repo.save(
        aHighlightRow('find-foreign', {
          clubId: OTHER_CLUB_ID,
          bookId: FOREIGN_BOOK_ID,
        }),
      );

      await expect(repo.find({ clubId: CLUB_ID })).resolves.toEqual([]);
      // A pré-condição: o grifo existe, e o outro clube o vê.
      expect(await repo.find({ clubId: OTHER_CLUB_ID })).toHaveLength(1);
    });

    it('filters by each dimension', async () => {
      const mine = await repo.save(aHighlightRow('find-mine'));
      const theirs = await repo.save(
        aHighlightRow('find-theirs', {
          userId: OTHER_AUTHOR_ID,
          color: '#22c55e',
          page: 62,
        }),
      );
      const elsewhere = await repo.save(
        aHighlightRow('find-elsewhere', { bookId: OTHER_BOOK_ID }),
      );

      const ids = async (filter: Parameters<typeof repo.find>[0]) =>
        (await repo.find(filter)).map((row) => row.id).sort();

      await expect(ids({ clubId: CLUB_ID, bookId: BOOK_ID })).resolves.toEqual(
        [mine.id, theirs.id].sort(),
      );
      // ⚠️ `authorId` do filtro é a coluna `userId`: o vocabulário do port fala
      // de AUTORIA, o do banco fala de dono da linha. Um mapeamento errado aqui
      // devolveria tudo (chave ignorada) ou estouraria.
      await expect(
        ids({ clubId: CLUB_ID, authorId: OTHER_AUTHOR_ID }),
      ).resolves.toEqual([theirs.id]);
      await expect(ids({ clubId: CLUB_ID, color: '#22c55e' })).resolves.toEqual(
        [theirs.id],
      );
      await expect(ids({ clubId: CLUB_ID, page: 62 })).resolves.toEqual([
        theirs.id,
      ]);
      await expect(
        ids({ clubId: CLUB_ID, bookId: OTHER_BOOK_ID }),
      ).resolves.toEqual([elsewhere.id]);
    });

    // Os filtros entram em AND, não em OR: cada um sozinho casa o grifo, e
    // juntos não.
    it('combines every filter with AND', async () => {
      const target = await repo.save(aHighlightRow('find-and'));
      await repo.save(
        aHighlightRow('find-and-other', {
          userId: OTHER_AUTHOR_ID,
          color: '#22c55e',
          page: 62,
        }),
      );

      await expect(
        repo.find({
          clubId: CLUB_ID,
          bookId: BOOK_ID,
          authorId: AUTHOR_ID,
          color: '#facc15',
          page: 45,
          status: 'ACTIVE',
        }),
      ).resolves.toEqual([target]);

      // Um filtro trocado e o resultado é vazio — prova que é AND.
      await expect(
        repo.find({ clubId: CLUB_ID, authorId: AUTHOR_ID, page: 62 }),
      ).resolves.toEqual([]);
    });

    // `status` ausente devolve OS DOIS, como no `NoteFilter`: a regra de
    // produto ("só os ACTIVE") vive no `listHighlights`.
    it('returns both statuses when the filter carries no status', async () => {
      await repo.save(aHighlightRow('find-status-active'));
      await repo.save(
        aHighlightRow('find-status-archived', {
          status: 'ARCHIVED',
          archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );

      expect(await repo.find({ clubId: CLUB_ID })).toHaveLength(2);
      expect(
        await repo.find({ clubId: CLUB_ID, status: 'ARCHIVED' }),
      ).toHaveLength(1);
    });

    /**
     * ⚠️ REGRA 10 — a coluna NULA contra o filtro de igualdade, provada contra
     * o **Postgres de verdade**. É a 4ª aparição do §7.1 fechando o ciclo.
     *
     * No Postgres `WHERE "page" = 45` contra `NULL` é **falso**: um grifo sem
     * página **não** casa o filtro de nenhuma página. O fake afirma essa
     * fidelidade e tem teste unitário (35 acusadores na direção restritiva),
     * mas este é o único lugar onde ela é decidível **contra o banco** — se o
     * `WHERE` fosse montado como `IS NULL OR = 45`, o grifo sem página
     * apareceria no filtro de uma página que não é a dele.
     */
    it('never matches a highlight without a page when the filter asks for one', async () => {
      const withPage = await repo.save(
        aHighlightRow('find-page', { page: 45 }),
      );
      await repo.save(aHighlightRow('find-nopage', { page: null }));

      await expect(repo.find({ clubId: CLUB_ID, page: 45 })).resolves.toEqual([
        withPage,
      ]);
      // A pré-condição que dá dente ao teste: os DOIS grifos estão lá.
      expect(await repo.find({ clubId: CLUB_ID })).toHaveLength(2);
      // E nenhuma página casa o grifo sem página.
      await expect(repo.find({ clubId: CLUB_ID, page: 1 })).resolves.toEqual(
        [],
      );
    });

    /**
     * ⚠️ A PRÉ-CONDIÇÃO DA REGRA 11 medida no banco: o `=` de texto do Postgres
     * é **byte-sensível**, então `#FACC15` **não** casa `#facc15`.
     *
     * É por isso que a borda não normaliza caixa: aceitar as duas grafias
     * criaria uma segunda cor gravada que o filtro por cor não reconhece como a
     * mesma, e a listagem por cor perderia metade dos grifos. Aqui a
     * propriedade é decidível; no `z.enum` ela é só uma escolha.
     */
    it('states the precondition: the colour comparison is byte-sensitive', async () => {
      await repo.save(aHighlightRow('find-color-case'));

      await expect(
        repo.find({ clubId: CLUB_ID, color: '#facc15' }),
      ).resolves.toHaveLength(1);
      const rows = await prisma.highlight.findMany({
        where: { clubId: CLUB_ID, color: '#FACC15' },
      });
      expect(rows).toEqual([]);
    });

    it('returns an empty list for a club with no highlights', async () => {
      await expect(
        repo.find({ clubId: prefixedId('t24', 'hl-club-ghost') }),
      ).resolves.toEqual([]);
    });

    /**
     * O `orderBy` que acompanha o `take` da válvula de segurança.
     *
     * O port **não promete ordem** — quem ordena é o `listHighlights` —, mas a
     * ordem PRECISA existir na consulta: `take` sobre um conjunto sem ordem
     * definida corta linhas que dependem do plano de execução e de `VACUUM`,
     * então duas chamadas iguais poderiam trazer grifos diferentes.
     *
     * Os ids são embaralhados em relação ao `createdAt` de propósito: se fossem
     * crescentes junto, um `orderBy: { id: ... }` (ou nenhum, com o Postgres
     * devolvendo na ordem de inserção) passaria por acidente. E são QUATRO
     * grifos porque com três `id asc` ou `id desc` acertaria a ordem esperada
     * por acidente de nomenclatura.
     */
    it('returns the newest first, which is what makes the take deterministic', async () => {
      const at = (month: string) => new Date(`2026-${month}-01T00:00:00.000Z`);
      const first = aHighlightRow('order-b', { createdAt: at('01') });
      const second = aHighlightRow('order-d', { createdAt: at('02') });
      const third = aHighlightRow('order-a', { createdAt: at('03') });
      const fourth = aHighlightRow('order-c', { createdAt: at('04') });
      // Gravados numa ordem que não é nem a de `createdAt` nem a de id.
      const insertionOrder = [third, first, fourth, second];
      for (const highlight of insertionOrder) {
        await repo.save(highlight);
      }

      const found = (await repo.find({ clubId: CLUB_ID })).map((row) => row.id);

      const newestFirst = [fourth.id, third.id, second.id, first.id];
      expect(found).toEqual(newestFirst);
      // As pré-condições: nenhuma das três ordens erradas coincide.
      const ids = [first.id, second.id, third.id, fourth.id];
      expect([...ids].sort()).not.toEqual(newestFirst);
      expect([...ids].sort().reverse()).not.toEqual(newestFirst);
      expect(insertionOrder.map((row) => row.id)).not.toEqual(newestFirst);
    });

    /**
     * ⚠️ REGRA 7/8 — O DESEMPATE, e é ele que alinha o CORTE do `take` com a
     * ordem que a pessoa vê.
     *
     * `createdAt desc` sozinho **não é ordem total**, e empate no mesmo
     * milissegundo é o caso NORMAL de um clube (duas pessoas grifando ao mesmo
     * tempo, dois dispositivos da mesma pessoa). Sem `id` como segundo
     * critério, o conjunto que o `take` corta na fronteira é escolhido pela
     * ordem que o Postgres achou mais barata — e a reordenação determinística
     * do `listHighlights` (`createdAt desc`, depois `id asc`) ESCONDERIA a
     * instabilidade em vez de denunciá-la.
     */
    it('breaks a createdAt tie by id, the same total order the listing uses', async () => {
      const sameInstant = new Date('2026-06-06T06:06:06.006Z');
      const first = aHighlightRow('tie-a', { createdAt: sameInstant });
      const second = aHighlightRow('tie-b', { createdAt: sameInstant });
      const third = aHighlightRow('tie-c', { createdAt: sameInstant });
      // Gravados fora da ordem de id, para a ordem de inserção não acertar.
      const insertionOrder = [third, first, second];
      for (const highlight of insertionOrder) {
        await repo.save(highlight);
      }

      const found = (await repo.find({ clubId: CLUB_ID })).map((row) => row.id);

      const byIdAscending = [first.id, second.id, third.id];
      expect(found).toEqual(byIdAscending);
      // Pré-condições: nem a inserção nem o id descendente acertariam.
      expect(insertionOrder.map((row) => row.id)).not.toEqual(byIdAscending);
      expect([...byIdAscending].reverse()).not.toEqual(byIdAscending);
    });

    /**
     * ⚠️ REGRA 8 — A VÁLVULA, e este é o ÚNICO lugar onde ela é decidível.
     *
     * O fake não tem teto de linhas, então **nenhum** mutante da suíte unitária
     * acusa `take` ausente (§7.10, e o port diz isso no docblock do `find`). O
     * teste grava **`EXPECTED_ROW_LIMIT + 1`** linhas e prova as duas metades:
     *
     * 1. voltam exatamente `EXPECTED_ROW_LIMIT` — o `take` está lá;
     * 2. as que voltam são as **mais recentes**, e a mais antiga ficou de fora —
     *    é o `orderBy` colado ao `take` que decide QUEM é cortado. Um `take`
     *    sem `orderBy` também devolveria 500 linhas, e esta segunda metade é a
     *    que separa os dois.
     *
     * As 501 linhas entram num `createMany` só (uma ida ao banco) e num livro
     * próprio, para o `beforeEach` do arquivo as apagar por `bookId`.
     */
    it('cuts the result at the row limit, keeping the newest', async () => {
      const total = EXPECTED_ROW_LIMIT + 1;
      const base = Date.UTC(2026, 0, 1);
      const rows = Array.from({ length: total }, (_unused, index) => ({
        id: trackedHighlightId(`take-${String(index).padStart(4, '0')}`),
        clubId: CLUB_ID,
        bookId: TAKE_BOOK_ID,
        userId: AUTHOR_ID,
        quote: `linha ${index}`,
        color: '#facc15',
        page: null,
        reference: null,
        // ⚠️ `Prisma.DbNull`, e NÃO `null`: numa coluna `Json?` o tipo de
        // entrada é `DbNull | JsonNull | InputJsonValue`, e `null` literal não
        // compila. A armadilha da regra 5 morde até aqui, num fixture que só
        // quer 501 linhas baratas.
        commentDoc: Prisma.DbNull,
        commentText: '',
        status: 'ACTIVE' as const,
        archivedAt: null,
        // Um minuto entre cada: o índice 0 é o MAIS ANTIGO.
        createdAt: new Date(base + index * 60_000),
        updatedAt: new Date(base + index * 60_000),
      }));
      await prisma.highlight.createMany({ data: rows });
      const oldest = required(rows[0]);
      const newest = required(rows[total - 1]);

      const found = await repo.find({ clubId: CLUB_ID, bookId: TAKE_BOOK_ID });

      expect(found).toHaveLength(EXPECTED_ROW_LIMIT);
      // A pré-condição: as 501 estão no banco, então o corte é do `take`.
      await expect(
        prisma.highlight.count({ where: { bookId: TAKE_BOOK_ID } }),
      ).resolves.toBe(total);
      // E o que ficou de fora é a MAIS ANTIGA, não uma qualquer.
      const foundIds = new Set(found.map((row) => row.id));
      expect(foundIds.has(newest.id)).toBe(true);
      expect(foundIds.has(oldest.id)).toBe(false);
      expect(required(found[0]).id).toBe(newest.id);
    });
  });

  /**
   * ⚠️ REGRAS 1, 2 e 3 — o schema lido do CATÁLOGO DO POSTGRES, não do arquivo
   * do `schema.prisma`. O que importa é o que o banco tem.
   *
   * Nota de execução: `@@unique` do Prisma emite `CREATE UNIQUE INDEX`, não
   * `CONSTRAINT ... UNIQUE`, então um índice único **não apareceria** em
   * `information_schema.table_constraints` — é `pg_index` que o conhece.
   */
  describe('the schema in the database', () => {
    /**
     * ⚠️ REGRA 2 — **nenhum `@@unique`**, e é o que faz o grifo ser ilimitado.
     *
     * O par desta asserção é o teste dos três grifos idênticos convivendo: um
     * prova a ausência do índice, o outro prova a consequência.
     */
    it('has no unique index at all beyond the primary key', async () => {
      const rows = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT ic.relname AS indexname
        FROM pg_index i
        JOIN pg_class ic ON ic.oid = i.indexrelid
        JOIN pg_class tc ON tc.oid = i.indrelid
        WHERE tc.relname = 'Highlight'
          AND i.indisunique
          AND NOT i.indisprimary
      `;

      expect(rows).toEqual([]);
    });

    // Regra 2 — os TRÊS índices, com as colunas e a ordem de cada um. A ordem
    // das colunas importa: `(clubId, createdAt)` serve o acervo do clube e
    // `(createdAt, clubId)` não.
    it('has exactly the three declared indexes', async () => {
      const rows = await prisma.$queryRaw<
        { indexname: string; columns: string }[]
      >`
        SELECT ic.relname AS indexname,
               string_agg(a.attname, ',' ORDER BY k.ordinality) AS columns
        FROM pg_index i
        JOIN pg_class ic ON ic.oid = i.indexrelid
        JOIN pg_class tc ON tc.oid = i.indrelid
        JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
        JOIN pg_attribute a
          ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE tc.relname = 'Highlight' AND NOT i.indisprimary
        GROUP BY ic.relname
        ORDER BY ic.relname
      `;

      expect(rows.map((row) => row.columns)).toEqual([
        'bookId,color',
        'bookId,userId',
        'clubId,createdAt',
      ]);
    });

    /**
     * ⚠️ REGRA 1 — o `updatedAt` é `NOT NULL` e **sem `DEFAULT`**, e é a
     * assinatura de "nasceu sem `@updatedAt`" no catálogo.
     *
     * `@updatedAt` do Prisma não é um default de coluna (ele bombeia a coluna no
     * cliente), então a prova de comportamento é o round-trip do `update`
     * acima; esta é a prova estática do resto da forma da tabela — inclusive
     * `commentDoc` e `page` ANULÁVEIS, que é o que faz "grifo sem comentário" e
     * "grifo sem página" serem casos legítimos.
     */
    it('declares the columns with the nullability the domain assumes', async () => {
      const rows = await prisma.$queryRaw<
        {
          column_name: string;
          is_nullable: string;
          column_default: string | null;
        }[]
      >`
        SELECT column_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'Highlight'
          AND column_name IN
            ('commentDoc', 'commentText', 'page', 'quote', 'color', 'updatedAt', 'createdAt')
        ORDER BY column_name
      `;

      expect(rows.map((row) => [row.column_name, row.is_nullable])).toEqual([
        ['color', 'NO'],
        ['commentDoc', 'YES'],
        ['commentText', 'NO'],
        ['createdAt', 'NO'],
        ['page', 'YES'],
        ['quote', 'NO'],
        ['updatedAt', 'NO'],
      ]);
      // O `updatedAt` não tem DEFAULT nenhum: quem o escreve é o domínio.
      expect(
        rows.find((row) => row.column_name === 'updatedAt')?.column_default,
      ).toBeNull();
      // E o `commentText` tem o `@default('')` que é a rede de segurança.
      expect(
        rows.find((row) => row.column_name === 'commentText')?.column_default,
      ).toContain("''");
    });

    /**
     * ⚠️ REGRA 3 — o `onDelete` das três relações, **LIDO** e não suposto.
     *
     * O `prisma migrate diff --from-empty --to-schema-datamodel ... --script`
     * (offline) mostrou as três como
     * `ON DELETE RESTRICT ON UPDATE CASCADE`, e é o que o catálogo confirma. É
     * o default do Prisma para relação OBRIGATÓRIA — ao contrário do default
     * para relação OPCIONAL, que é `SetNull`: foi essa suposição que a Tarefa 06
     * fez errado ("o `Restrict` que herdamos") e a 11 corrigiu no
     * `Note.planItem`, com uma declaração explícita.
     */
    it('declares the three foreign keys as ON DELETE RESTRICT', async () => {
      const rows = await prisma.$queryRaw<
        { constraint_name: string; rule: string }[]
      >`
        SELECT rc.constraint_name, rc.delete_rule AS rule
        FROM information_schema.referential_constraints rc
        WHERE rc.constraint_name IN
          ('Highlight_clubId_fkey', 'Highlight_bookId_fkey', 'Highlight_userId_fkey')
        ORDER BY rc.constraint_name
      `;

      expect(rows).toEqual([
        { constraint_name: 'Highlight_bookId_fkey', rule: 'RESTRICT' },
        { constraint_name: 'Highlight_clubId_fkey', rule: 'RESTRICT' },
        { constraint_name: 'Highlight_userId_fkey', rule: 'RESTRICT' },
      ]);
    });

    /**
     * ⚠️ REGRA 3, o lado COMPORTAMENTAL: `RESTRICT` está ativo no banco.
     *
     * É o par do teste estático acima, pelo mesmo motivo que o
     * `PrismaNoteRepository` tem os dois: apagar um livro que tem grifo tem de
     * **falhar**, não zerar coluna nenhuma. Com `SetNull` a coluna é `NOT
     * NULL`, então o Postgres também recusaria — mas com uma mensagem de
     * violação de `NOT NULL` em vez de FK, e num modelo futuro com relação
     * opcional a diferença seria corrupção silenciosa.
     */
    it('refuses to delete a book that has a highlight, and keeps the row', async () => {
      const highlight = aHighlightRow('restrict', { bookId: OTHER_BOOK_ID });
      await repo.save(highlight);

      await expect(
        prisma.book.delete({ where: { id: OTHER_BOOK_ID } }),
      ).rejects.toThrow();

      expect(required(await repo.byId(highlight.id)).bookId).toBe(
        OTHER_BOOK_ID,
      );
      await expect(
        prisma.book.count({ where: { id: OTHER_BOOK_ID } }),
      ).resolves.toBe(1);
    });
  });
});
