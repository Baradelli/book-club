import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { InvalidNoteError } from '../../domain/errors';
import type { Note, NoteDoc } from '../../domain/note';
import { required } from '../../test-support/builders';
import { PrismaNoteRepository } from '../prisma-note-repository';
import { PrismaReadingPlanItemRepository } from '../prisma-reading-plan-item-repository';
import { prefixedEmail, prefixedId, prisma, removeFixtures } from './_db';

const CLUB_ID = prefixedId('t11', 'note-club');
const OTHER_CLUB_ID = prefixedId('t11', 'note-otherclub');
const AUTHOR_ID = prefixedId('t11', 'note-author');
const OTHER_AUTHOR_ID = prefixedId('t11', 'note-otherauthor');
const BOOK_ID = prefixedId('t11', 'note-book');
const OTHER_BOOK_ID = prefixedId('t11', 'note-otherbook');
const FOREIGN_BOOK_ID = prefixedId('t11', 'note-foreignbook');
/** Livro só do bloco do ADR 0007: o plano dele é reescrito dentro do teste. */
const PLAN_BOOK_ID = prefixedId('t11', 'note-planbook');

const DAY_ONE = prefixedId('t11', 'note-day-one');
const DAY_TWO = prefixedId('t11', 'note-day-two');
const DAY_THREE = prefixedId('t11', 'note-day-three');
const OTHER_BOOK_DAY = prefixedId('t11', 'note-otherbook-day');
const FOREIGN_DAY = prefixedId('t11', 'note-foreign-day');

const EVERY_BOOK_ID = [
  BOOK_ID,
  OTHER_BOOK_ID,
  FOREIGN_BOOK_ID,
  PLAN_BOOK_ID,
] as const;

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
/** Com milissegundos NÃO zerados: é o que a regra 8 mede. */
const UPDATED_AT = new Date('2026-03-04T05:06:07.008Z');

/**
 * O `doc` da regra 1 — e é factory, não `const`: o `doc` é uma árvore
 * ProseMirror, o único campo mutável por dentro de uma `Note`, e um objeto
 * compartilhado entre testes é estado escondido (CONVENCOES-CODIGO §7.7).
 *
 * A forma é a que o ADR 0001 existe para proteger: `attrs` de extensão,
 * `marks` empilhadas, aninhamento de lista, acento, e uma URL com `&` e `=`.
 * Um round-trip que perdesse qualquer desses níveis passaria num `doc` de um
 * parágrafo só.
 */
function aRichDoc(): NoteDoc {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Cap. 1 — Uma reunião inesperada' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Gostei do ' },
          {
            type: 'text',
            marks: [{ type: 'bold' }, { type: 'italic' }],
            text: 'começo',
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
                content: [{ type: 'text', text: 'o Gandalf sabia' }],
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Toda nota criada por este arquivo, para a limpeza. Não é uma lista
 * "esperada": o `afterAll` também CONSULTA o banco pelos livros do arquivo,
 * então um teste que falhe no meio não vaza fixture, e a limpeza não estoura
 * na FK do plano (CONVENCOES-CODIGO §6.6).
 */
const noteIds: string[] = [];
/** Itens de plano criados DENTRO de um teste, fora do seed do arquivo. */
const extraPlanItemIds: string[] = [];

function trackedNoteId(prefix: string): string {
  const id = prefixedId('t11', `note-${prefix}`);
  noteIds.push(id);
  return id;
}

function trackedPlanItemId(prefix: string): string {
  const id = prefixedId('t11', `note-plan-${prefix}`);
  extraPlanItemIds.push(id);
  return id;
}

/**
 * A anotação do dia. O `prefix` é o que dá o id — e nunca vem do `overrides`
 * de propósito: id que não passa por aqui não entra na lista de limpeza.
 */
function aDayNote(prefix: string, overrides: Partial<Note> = {}): Note {
  return {
    id: trackedNoteId(prefix),
    clubId: CLUB_ID,
    bookId: BOOK_ID,
    userId: AUTHOR_ID,
    kind: 'PLAN',
    planItemId: DAY_ONE,
    title: 'Cap. 1 — Uma reunião inesperada',
    reference: null,
    doc: aRichDoc(),
    plainText: 'Gostei do começo',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function aFreeNote(prefix: string, overrides: Partial<Note> = {}): Note {
  return aDayNote(prefix, {
    kind: 'FREE',
    planItemId: null,
    title: 'Uma ideia avulsa',
    reference: 'p. 45-62',
    ...overrides,
  });
}

/** Apaga TODA nota dos livros deste arquivo, por id, consultando o banco. */
async function cleanUpNotes(): Promise<void> {
  const ofBooks = await prisma.note.findMany({
    where: { bookId: { in: [...EVERY_BOOK_ID] } },
    select: { id: true },
  });
  await removeFixtures({
    noteIds: [...new Set([...noteIds, ...ofBooks.map((note) => note.id)])],
  });
}

async function cleanUpPlan(): Promise<void> {
  const ofBooks = await prisma.readingPlanItem.findMany({
    where: { bookId: { in: [...EVERY_BOOK_ID] } },
    select: { id: true },
  });
  await removeFixtures({
    planItemIds: [
      ...new Set([...extraPlanItemIds, ...ofBooks.map((item) => item.id)]),
    ],
  });
}

describe('PrismaNoteRepository (contract)', () => {
  const repo = new PrismaNoteRepository(prisma);
  const planRepo = new PrismaReadingPlanItemRepository(prisma);

  beforeAll(async () => {
    // A nota antes do plano, e o plano antes do livro: as FKs são RESTRICT.
    await cleanUpNotes();
    await cleanUpPlan();
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
          email: prefixedEmail('t11', `note-${label}`),
          name: 'Fixture Author',
        },
      });
    }
    await prisma.club.create({ data: { id: CLUB_ID, name: 'Clube da Nota' } });
    await prisma.club.create({
      data: { id: OTHER_CLUB_ID, name: 'Outro Clube' },
    });
    for (const [id, clubId] of [
      [BOOK_ID, CLUB_ID],
      [OTHER_BOOK_ID, CLUB_ID],
      [PLAN_BOOK_ID, CLUB_ID],
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
    await planRepo.saveMany([
      planItem(DAY_ONE, BOOK_ID, 0, '2026-10-01', 'Cap. 1'),
      planItem(DAY_TWO, BOOK_ID, 1, '2026-10-02', 'Cap. 2'),
      planItem(DAY_THREE, BOOK_ID, 2, '2026-10-03', 'Cap. 3'),
      planItem(OTHER_BOOK_DAY, OTHER_BOOK_ID, 0, '2026-10-01', 'Cap. 1'),
      planItem(FOREIGN_DAY, FOREIGN_BOOK_ID, 0, '2026-10-01', 'Cap. 1'),
    ]);
  });

  afterAll(async () => {
    await cleanUpNotes();
    await cleanUpPlan();
    await removeFixtures({
      bookIds: [...EVERY_BOOK_ID],
      clubIds: [CLUB_ID, OTHER_CLUB_ID],
      userIds: [AUTHOR_ID, OTHER_AUTHOR_ID],
    });
    await prisma.$disconnect();
  });

  /**
   * Cada teste começa sem nota nenhuma dos livros do arquivo: um teste de
   * contrato não pode depender do estado que outro deixou — um que dependia
   * passava verde rodado isolado, sem exercitar o filtro que dizia provar
   * (CONVENCOES-CODIGO §6.6).
   *
   * Os itens de plano do seed ficam; os que um teste criou saem, senão o
   * `unique(bookId, date)` do próximo teste colidiria.
   */
  beforeEach(async () => {
    await prisma.note.deleteMany({
      where: { bookId: { in: [...EVERY_BOOK_ID] } },
    });
    if (extraPlanItemIds.length > 0) {
      await prisma.readingPlanItem.deleteMany({
        where: { id: { in: extraPlanItemIds } },
      });
    }
  });

  describe('save', () => {
    // Regra 1
    it('creates the note and maps every field back', async () => {
      const note = aDayNote('create', { reference: 'p. 1-20' });

      const saved = await repo.save(note);

      expect(saved).toEqual(note);
      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.updatedAt).toBeInstanceOf(Date);
      // ...e o que voltou do banco numa SEGUNDA leitura é o mesmo.
      expect(await repo.byId(note.id)).toEqual(note);
    });

    // ⚠️ Regra 1, a parte que o ADR 0001 existe para garantir: o `doc` volta
    // IDÊNTICO — `attrs` de extensão, `marks` empilhadas, lista aninhada,
    // acento e a URL com `&`. É a coluna que não pode ser lossy.
    it('round-trips the doc with nested content, marks and attrs', async () => {
      const note = aDayNote('lossless');

      await repo.save(note);

      const read = required(await repo.byId(note.id));
      expect(read.doc).toEqual(aRichDoc());
      // E o objeto que volta é NOVO: o Prisma reparseia o JSON a cada leitura,
      // então mutar o que se leu não pode contaminar a próxima leitura.
      read.doc.content = [];
      expect(required(await repo.byId(note.id)).doc).toEqual(aRichDoc());
    });

    // Regra 1 — a prova NO BANCO, e não só no que o mapper devolve: a coluna
    // guarda a árvore inteira. Sem isto, um `doc` que o Prisma serializasse
    // como `{}` (o risco de um `toJSON` que não fosse chamado) passaria pelo
    // `toEqual` de cima se o mapper tivesse cache.
    it('stores the whole tree in the jsonb column', async () => {
      const note = aDayNote('column');
      await repo.save(note);

      const rows = await prisma.$queryRaw<{ mark: string; href: string }[]>`
        SELECT "doc" #>> '{content,1,content,1,marks,0,type}' AS mark,
               "doc" #>> '{content,1,content,3,marks,0,attrs,href}' AS href
        FROM "Note" WHERE "id" = ${note.id}
      `;

      expect(required(rows[0])).toEqual({
        mark: 'bold',
        href: 'https://exemplo.test/a?b=1&c=2',
      });
    });

    // Regra 2
    it('updates in place when the same id is saved again', async () => {
      const first = aDayNote('upsert');
      await repo.save(first);

      const again = await repo.save({ ...first, title: 'Cap. 1 — corrigido' });

      expect(again.id).toBe(first.id);
      expect(again.title).toBe('Cap. 1 — corrigido');
      await expect(
        prisma.note.count({ where: { bookId: BOOK_ID } }),
      ).resolves.toBe(1);
    });

    // Regra 2 — e a avulsa também, que faz upsert por `id` (o outro alvo).
    it('updates a free note in place when the same id is saved again', async () => {
      const first = aFreeNote('upsert-free');
      await repo.save(first);

      await repo.save({ ...first, title: 'Outra ideia' });

      const rows = await prisma.note.findMany({ where: { bookId: BOOK_ID } });
      expect(rows).toHaveLength(1);
      expect(required(rows[0]).title).toBe('Outra ideia');
    });

    /**
     * ⚠️ REGRA 3 — a divergência que a Tarefa 08 registrou como a mais
     * perigosa possível. Índice único no Postgres **não compara `NULL` com
     * `NULL`**, então N anotações avulsas do mesmo autor no mesmo livro
     * convivem. Um fake que tratasse `null` como valor reprovaria a segunda —
     * o oposto do "ilimitado" que o BACKLOG decidiu, e verde na suíte.
     */
    it('keeps three free notes of the same author in the same book', async () => {
      await repo.save(aFreeNote('free-a'));
      await repo.save(aFreeNote('free-b'));
      await repo.save(aFreeNote('free-c'));

      const rows = await prisma.note.findMany({
        where: { bookId: BOOK_ID, userId: AUTHOR_ID, kind: 'FREE' },
      });
      expect(rows).toHaveLength(3);
      // A pré-condição: as três são do MESMO autor e todas com planItemId nulo.
      expect(rows.every((row) => row.planItemId === null)).toBe(true);
    });

    /**
     * Regra 4 — a nota do dia é UMA por pessoa. Os dois `save` levam ids
     * DIFERENTES de propósito: é a forma que o `upsertPlanNote` produz quando
     * lê `null` no `byPlanItemAndUser` e gera um id novo.
     */
    it('keeps one row for two notes of the same author on the same day', async () => {
      const first = await repo.save(aDayNote('unique-a'));

      const second = await repo.save(
        aDayNote('unique-b', { title: 'Cap. 1 — reescrito' }),
      );

      const rows = await prisma.note.findMany({ where: { bookId: BOOK_ID } });
      expect(rows).toHaveLength(1);
      // A linha mantém o id do PRIMEIRO: o id do segundo é descartado, e é o
      // `save` devolver a linha do banco que faz o UseCase responder o id
      // certo.
      expect(second.id).toBe(first.id);
      expect(required(rows[0]).title).toBe('Cap. 1 — reescrito');
    });

    it('keeps two rows for two authors on the same day', async () => {
      await repo.save(aDayNote('two-authors-a'));
      await repo.save(aDayNote('two-authors-b', { userId: OTHER_AUTHOR_ID }));

      await expect(
        prisma.note.count({ where: { planItemId: DAY_ONE } }),
      ).resolves.toBe(2);
    });

    /**
     * ⚠️ REGRA 5 — A CORRIDA, e a razão de o `save` da nota do dia mirar o
     * ÍNDICE COMPOSTO em vez do `id`.
     *
     * Dois autosaves sobrepostos da mesma pessoa no mesmo dia leem `null` no
     * `byPlanItemAndUser` e AMBOS tentam criar. Com upsert por `id` isso é um
     * `P2002`, que o `handleDomainError` relança como **500** — e o editor
     * autossalva e a fila offline reenvia, então a forma é real.
     */
    it('does not throw and leaves one row when two saves of the same day race', async () => {
      const first = aDayNote('race-a', { title: 'primeiro' });
      const second = aDayNote('race-b', { title: 'segundo' });

      const [a, b] = await Promise.all([repo.save(first), repo.save(second)]);

      expect(a.id).toBe(b.id);
      await expect(
        prisma.note.count({ where: { planItemId: DAY_ONE } }),
      ).resolves.toBe(1);
      // O id que ficou é de um dos dois, nunca um terceiro.
      expect([first.id, second.id]).toContain(a.id);
    });

    /**
     * ⚠️ O `createdAt` é de QUEM NASCEU, e o conteúdo é de quem escreveu por
     * último — o segundo `save` do par `(planItemId, userId)` cai no ramo de
     * UPDATE do upsert, e o `createdAt` não pode ir junto.
     *
     * O caminho é o mesmo da corrida da regra 5: os dois `execute` leem `null`
     * no `byPlanItemAndUser` e cada um constrói a nota com o SEU `now`. Sem
     * esta separação o `UPDATE` do segundo reescreveria o `createdAt` do
     * primeiro, e o comportamento ficaria INCONSISTENTE — a nota que corre
     * pularia para o topo do `listNotes` (que ordena por `createdAt desc`) e a
     * que não corre, não. `last-write-wins` é a política declarada do
     * CONTEÚDO; do `createdAt` nunca foi.
     */
    it('keeps the createdAt of the first write while the content is the last one', async () => {
      const born = new Date('2026-02-02T02:02:02.002Z');
      const later = new Date('2026-05-05T05:05:05.005Z');
      const rewrittenDoc: NoteDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'reescrevi tudo' }],
          },
        ],
      };
      const first = await repo.save(
        aDayNote('birth-a', { createdAt: born, doc: aRichDoc() }),
      );

      const second = await repo.save(
        aDayNote('birth-b', {
          createdAt: later,
          doc: rewrittenDoc,
          plainText: 'reescrevi tudo',
        }),
      );

      // O conteúdo é o do segundo...
      expect(second.doc).toEqual(rewrittenDoc);
      expect(second.plainText).toBe('reescrevi tudo');
      // ...e o nascimento é o do primeiro, no que voltou e na LINHA.
      expect(second.createdAt).toEqual(born);
      expect(second.id).toBe(first.id);
      const row = await prisma.note.findUnique({ where: { id: first.id } });
      expect(required(row).createdAt).toEqual(born);
    });
  });

  describe('byId', () => {
    // Regra 6
    it('returns an archived note too', async () => {
      const note = aDayNote('archived', {
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      await repo.save(note);

      const found = required(await repo.byId(note.id));

      expect(found.status).toBe('ARCHIVED');
      expect(found.archivedAt).toEqual(new Date('2026-02-01T00:00:00.000Z'));
    });

    // Regra 6
    it('returns null for an id that was never saved', async () => {
      await expect(
        repo.byId(prefixedId('t11', 'note-ghost')),
      ).resolves.toBeNull();
    });

    /**
     * Regra da decisão H: o repositório chama `assertNoteDoc` ao LER, então um
     * `doc` corrompido no banco vira `InvalidNoteError` na leitura, não um
     * `undefined` que estoura três camadas depois no `docToText`.
     *
     * A corrupção é escrita pelo Prisma cru de propósito: nenhum caminho do
     * domínio consegue produzi-la, que é justamente por que a guarda existe.
     */
    it('refuses a doc that is not a ProseMirror doc', async () => {
      const note = aDayNote('corrupt');
      await repo.save(note);
      await prisma.note.update({
        where: { id: note.id },
        data: { doc: { type: 'paragraph' } },
      });

      await expect(repo.byId(note.id)).rejects.toBeInstanceOf(InvalidNoteError);
    });
  });

  describe('update', () => {
    // Regra 7
    it('applies only the keys present in the patch', async () => {
      const note = aDayNote('patch', { reference: 'p. 1-20' });
      await repo.save(note);

      const updated = await repo.update(note.id, { title: 'Cap. 1 — novo' });

      expect(updated).toEqual({ ...note, title: 'Cap. 1 — novo' });
    });

    // Regra 7 — `null` é valor e sobrescreve.
    it('writes null when the patch says null', async () => {
      const note = aDayNote('patch-null', { reference: 'p. 1-20' });
      await repo.save(note);

      const updated = await repo.update(note.id, { reference: null });

      expect(updated.reference).toBeNull();
    });

    // Regra 7 — `undefined` é ausência, não "grava nulo".
    it('treats undefined in the patch as "do not touch"', async () => {
      const note = aDayNote('patch-undef', { reference: 'p. 1-20' });
      await repo.save(note);

      const updated = await repo.update(note.id, { reference: undefined });

      expect(updated.reference).toBe('p. 1-20');
    });

    /**
     * ⚠️ REGRA 8 — ADR 0008. O `updatedAt` que o DOMÍNIO mandou é o que volta,
     * com precisão de milissegundo. Com `@updatedAt` no schema o Prisma
     * bombearia a coluna com "agora" e este teste falharia — é a prova, no
     * banco, de que o atributo não está lá.
     */
    it('stores the updatedAt the domain sent, down to the millisecond', async () => {
      const note = aDayNote('updatedat');
      await repo.save(note);
      const domainInstant = new Date('2026-07-08T09:10:11.012Z');

      const updated = await repo.update(note.id, {
        title: 'Cap. 1 — reescrito',
        updatedAt: domainInstant,
      });

      expect(updated.updatedAt).toEqual(domainInstant);
      expect(updated.updatedAt.getMilliseconds()).toBe(12);
      // E a coluna, não só o que o mapper devolveu.
      const rows = await prisma.$queryRaw<{ at: string }[]>`
        SELECT to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS at
        FROM "Note" WHERE "id" = ${note.id}
      `;
      expect(required(rows[0]).at).toBe('2026-07-08T09:10:11.012');
    });

    // Regra 8 — e um patch que NÃO manda `updatedAt` deixa a coluna quieta.
    // É o outro lado da mesma prova: `@updatedAt` moveria o valor aqui.
    it('leaves updatedAt alone when the patch does not carry it', async () => {
      const note = aDayNote('updatedat-quiet');
      await repo.save(note);

      const updated = await repo.update(note.id, { title: 'Cap. 1 — novo' });

      expect(updated.updatedAt).toEqual(UPDATED_AT);
    });

    /**
     * ⚠️ REGRA 9 — ADR 0008, resolvida pelo TIPO e não mais por allowlist.
     *
     * O que a regra 9 pedia — "um `id` no patch não troca a chave primária", e
     * espelhado, "o patch não move a nota entre tenants nem troca a autoria" —
     * era provado aqui contra uma allowlist no `toUpdateData`, enquanto o port
     * declarava `Partial<Note>` e o fake obedecia ao patch proibido: a quinta
     * aparição da classe do ADR 0007, na direção que fica verde.
     *
     * A saída foi estreitar o patch (`NotePatch` no port), então estes dois
     * casos deixaram de ser **representáveis**: o compilador recusa
     * `update(id, { id })`, `{ userId }`, `{ clubId }`, `{ bookId }`,
     * `{ kind }`, `{ planItemId }` e `{ createdAt }`. Não há teste de runtime
     * possível — nem necessário —, e a prova mora no `@ts-expect-error` do
     * `note-repository-fake.test.ts` mais o `pnpm -r typecheck`.
     * → CONVENCOES-CODIGO §7.1.
     *
     * O que continua provado aqui contra o Postgres é o que o `NotePatch`
     * permite: as três semânticas de patch (presente/`null`/`undefined`) e o
     * `updatedAt` do domínio, acima.
     */
    it('applies every key the NotePatch does allow, and nothing else changes', async () => {
      const note = aDayNote('patch-allowed', { reference: 'p. 1-20' });
      await repo.save(note);
      const archivedAt = new Date('2026-08-09T10:11:12.013Z');

      const updated = await repo.update(note.id, {
        title: 'Cap. 1 — reescrito',
        reference: 'p. 21-40',
        doc: { type: 'doc', content: [{ type: 'paragraph' }] },
        plainText: 'reescrito',
        status: 'ARCHIVED',
        archivedAt,
        updatedAt: archivedAt,
      });

      // A losslessness por snapshot (§7.6): o que MUDOU é exatamente o patch, e
      // identidade, tenant, autoria, âncora e `createdAt` seguem os de origem.
      expect(updated).toEqual({
        ...note,
        title: 'Cap. 1 — reescrito',
        reference: 'p. 21-40',
        doc: { type: 'doc', content: [{ type: 'paragraph' }] },
        plainText: 'reescrito',
        status: 'ARCHIVED',
        archivedAt,
        updatedAt: archivedAt,
      });
    });
  });

  describe('byPlanItemAndUser', () => {
    // Regra 10
    it('finds an archived note too', async () => {
      const note = aDayNote('bypair-archived', {
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      await repo.save(note);

      const found = await repo.byPlanItemAndUser(DAY_ONE, AUTHOR_ID);

      expect(found?.id).toBe(note.id);
    });

    it('returns null when that author wrote nothing on that day', async () => {
      await repo.save(aDayNote('bypair-other'));

      await expect(
        repo.byPlanItemAndUser(DAY_ONE, OTHER_AUTHOR_ID),
      ).resolves.toBeNull();
      await expect(
        repo.byPlanItemAndUser(DAY_TWO, AUTHOR_ID),
      ).resolves.toBeNull();
    });
  });

  describe('find', () => {
    // Regra 11 — o `clubId` é o corte de tenant e vale sempre.
    it('never returns a note of another club', async () => {
      await repo.save(
        aDayNote('find-foreign', {
          clubId: OTHER_CLUB_ID,
          bookId: FOREIGN_BOOK_ID,
          planItemId: FOREIGN_DAY,
        }),
      );

      await expect(repo.find({ clubId: CLUB_ID })).resolves.toEqual([]);
      // A pré-condição: a nota existe, e o outro clube a vê.
      expect(await repo.find({ clubId: OTHER_CLUB_ID })).toHaveLength(1);
    });

    // Regra 11
    it('filters by each dimension', async () => {
      const mine = await repo.save(aDayNote('find-mine'));
      const theirs = await repo.save(
        aDayNote('find-theirs', {
          userId: OTHER_AUTHOR_ID,
          planItemId: DAY_TWO,
        }),
      );
      const free = await repo.save(aFreeNote('find-free'));
      const elsewhere = await repo.save(
        aDayNote('find-elsewhere', {
          bookId: OTHER_BOOK_ID,
          planItemId: OTHER_BOOK_DAY,
        }),
      );

      const ids = async (filter: Parameters<typeof repo.find>[0]) =>
        (await repo.find(filter)).map((note) => note.id).sort();

      await expect(ids({ clubId: CLUB_ID, bookId: BOOK_ID })).resolves.toEqual(
        [mine.id, theirs.id, free.id].sort(),
      );
      await expect(
        ids({ clubId: CLUB_ID, authorId: OTHER_AUTHOR_ID }),
      ).resolves.toEqual([theirs.id]);
      await expect(ids({ clubId: CLUB_ID, kind: 'FREE' })).resolves.toEqual([
        free.id,
      ]);
      await expect(
        ids({ clubId: CLUB_ID, planItemId: DAY_TWO }),
      ).resolves.toEqual([theirs.id]);
      await expect(
        ids({ clubId: CLUB_ID, bookId: OTHER_BOOK_ID }),
      ).resolves.toEqual([elsewhere.id]);
    });

    // Regra 11 — os filtros entram em AND, não em OR: cada um sozinho casa a
    // nota, e juntos não.
    it('combines every filter with AND', async () => {
      const target = await repo.save(
        aDayNote('find-and', { plainText: 'a palavra certa' }),
      );
      await repo.save(
        aDayNote('find-and-other', {
          userId: OTHER_AUTHOR_ID,
          planItemId: DAY_TWO,
          plainText: 'a palavra certa',
        }),
      );

      await expect(
        repo.find({
          clubId: CLUB_ID,
          bookId: BOOK_ID,
          authorId: AUTHOR_ID,
          kind: 'PLAN',
          planItemId: DAY_ONE,
          text: 'palavra',
          status: 'ACTIVE',
        }),
      ).resolves.toEqual([target]);

      // Um filtro trocado e o resultado é vazio — prova que é AND.
      await expect(
        repo.find({
          clubId: CLUB_ID,
          authorId: AUTHOR_ID,
          planItemId: DAY_TWO,
        }),
      ).resolves.toEqual([]);
    });

    // Regra 11 — `status` ausente devolve OS DOIS, como no `BookFilter`.
    it('returns both statuses when the filter carries no status', async () => {
      await repo.save(aDayNote('find-status-active'));
      await repo.save(
        aDayNote('find-status-archived', {
          planItemId: DAY_TWO,
          status: 'ARCHIVED',
          archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );

      expect(await repo.find({ clubId: CLUB_ID })).toHaveLength(2);
      expect(
        await repo.find({ clubId: CLUB_ID, status: 'ARCHIVED' }),
      ).toHaveLength(1);
    });

    // Regra 11 — a avulsa NUNCA casa um filtro por dia de leitura. No Postgres
    // é `WHERE "planItemId" = 'x'` contra coluna nula: falso. Sem isto, a tela
    // do dia mostraria anotação que não é dela.
    it('never matches a free note when the filter asks for a planItemId', async () => {
      await repo.save(aFreeNote('find-free-vs-day'));

      await expect(
        repo.find({ clubId: CLUB_ID, planItemId: DAY_ONE }),
      ).resolves.toEqual([]);
    });

    /**
     * ⚠️ REGRA 12 — `ILIKE` é case-insensitive, e **accent-sensitive**. O fake
     * promete isso; aqui é a confirmação no banco. Se algum dia o Postgres
     * deste projeto ganhar `unaccent` no caminho do `contains` (Tarefa 29),
     * este teste é o que acusa.
     */
    it('matches case but not accent', async () => {
      const note = await repo.save(
        aDayNote('find-accent', { plainText: 'Chorei no CORAÇÃO do livro' }),
      );

      await expect(
        repo.find({ clubId: CLUB_ID, text: 'coração' }),
      ).resolves.toEqual([note]);
      await expect(
        repo.find({ clubId: CLUB_ID, text: 'coracao' }),
      ).resolves.toEqual([]);
    });

    /**
     * ⚠️ A PRÉ-CONDIÇÃO DA REGRA 13, e sem ela o teste seguinte não prova
     * nada: se o Postgres não tratasse `_` e `%` como curinga dentro do
     * parâmetro, "escapou" e "não escapou" dariam o mesmo resultado.
     */
    it('states the precondition: % and _ are wildcards inside an ILIKE parameter', async () => {
      const rows = await prisma.$queryRaw<
        { underscore: boolean; percent: boolean }[]
      >`
        SELECT 'axb' ILIKE '%a_b%'            AS underscore,
               '100% garantido' ILIKE '%100%%' AS percent
      `;

      expect(required(rows[0])).toEqual({ underscore: true, percent: true });
    });

    /**
     * ⚠️ REGRA 13 — o escape dos curingas, a pendência que a Tarefa 10
     * registrou. É o teste que o fake não consegue dar: para ele `%` e `_` já
     * são literais, então o bug é invisível em memória.
     *
     * Sem o escape, quem digitasse `p. 100%` receberia toda nota que contém
     * `p. 100` — em silêncio, porque nada na tela anuncia sintaxe de padrão.
     */
    it('treats % and _ in the query as literal characters', async () => {
      const axb = await repo.save(
        aDayNote('find-axb', { plainText: 'axb no meio' }),
      );
      const aUnderscoreB = await repo.save(
        aDayNote('find-a_b', { planItemId: DAY_TWO, plainText: 'a_b no meio' }),
      );
      const hundredAndFive = await repo.save(
        aDayNote('find-100-5', {
          planItemId: DAY_THREE,
          plainText: 'p. 100 e 5',
        }),
      );
      const guaranteed = await repo.save(
        aFreeNote('find-100pct', { plainText: '100% garantido' }),
      );

      // `_` não é curinga: `a_b` acha `a_b` e NÃO acha `axb`.
      await expect(
        repo.find({ clubId: CLUB_ID, text: 'a_b' }),
      ).resolves.toEqual([aUnderscoreB]);
      // `%` não é curinga: `p. 100%` não acha `p. 100 e 5`...
      await expect(
        repo.find({ clubId: CLUB_ID, text: 'p. 100%' }),
      ).resolves.toEqual([]);
      // ...e `100%` acha quem tem `100%` de verdade no texto.
      await expect(
        repo.find({ clubId: CLUB_ID, text: '100%' }),
      ).resolves.toEqual([guaranteed]);
      // A pré-condição: as quatro notas estão lá, e as duas do `%` também são
      // achadas pelo prefixo sem curinga.
      expect(await repo.find({ clubId: CLUB_ID })).toHaveLength(4);
      expect(
        (await repo.find({ clubId: CLUB_ID, text: 'no meio' }))
          .map((note) => note.id)
          .sort(),
      ).toEqual([axb.id, aUnderscoreB.id].sort());
      expect(await repo.find({ clubId: CLUB_ID, text: 'p. 100' })).toHaveLength(
        1,
      );
      expect(hundredAndFive.plainText).toBe('p. 100 e 5');
    });

    // Regra 13 — a `\` também é literal. É o caractere de escape do próprio
    // `LIKE`, então um escape que não se protegesse deixaria `\%` passar como
    // "por-cento literal" em vez de "barra seguida de curinga".
    it('treats a backslash in the query as a literal character', async () => {
      const withBackslash = await repo.save(
        aDayNote('find-backslash', { plainText: 'o caminho c:\\temp' }),
      );
      await repo.save(
        aDayNote('find-nobackslash', {
          planItemId: DAY_TWO,
          plainText: 'o caminho c:temp',
        }),
      );

      await expect(
        repo.find({ clubId: CLUB_ID, text: 'c:\\temp' }),
      ).resolves.toEqual([withBackslash]);
      // E uma `\` sozinha não estoura o `LIKE` nem casa tudo.
      await expect(repo.find({ clubId: CLUB_ID, text: '\\' })).resolves.toEqual(
        [withBackslash],
      );
    });

    // Regra 14 — a busca é só no `plainText`. `title` e `reference` ficam
    // FORA por decisão fechada do MVP 2.
    it('matches only the plainText, never the title nor the reference', async () => {
      await repo.save(
        aDayNote('find-title-only', {
          title: 'Cap. 1 — a palavraunica',
          reference: 'p. palavraunica',
          plainText: 'nada demais aqui',
        }),
      );

      await expect(
        repo.find({ clubId: CLUB_ID, text: 'palavraunica' }),
      ).resolves.toEqual([]);
    });

    it('returns an empty list for a club with no notes', async () => {
      await expect(
        repo.find({ clubId: prefixedId('t11', 'note-club-ghost') }),
      ).resolves.toEqual([]);
    });

    /**
     * O `orderBy` que acompanha o `take` da válvula de segurança
     * (`FIND_ROW_LIMIT`). O port **não promete ordem** — quem ordena é o
     * `listNotes` —, mas a ordem PRECISA existir na consulta: `take` sobre um
     * conjunto sem ordem definida corta linhas que dependem do plano de
     * execução e de `VACUUM`, então duas chamadas iguais poderiam trazer notas
     * diferentes.
     *
     * Testar o corte em si exigiria 501 notas no banco de desenvolvimento do
     * dono; o que se testa aqui é a propriedade que torna o corte
     * determinístico — "as mais recentes primeiro".
     *
     * Os ids são embaralhados em relação ao `createdAt` de propósito: se
     * fossem crescentes junto, um `orderBy: { id: ... }` (ou nenhum, com o
     * Postgres devolvindo na ordem de inserção) passaria por acidente.
     */
    it('returns the newest first, which is what makes the take deterministic', async () => {
      const at = (month: string) => new Date(`2026-${month}-01T00:00:00.000Z`);
      // `createdAt` crescente: first < second < third < fourth.
      const first = aDayNote('order-b', { createdAt: at('01') });
      const second = aDayNote('order-d', {
        planItemId: DAY_TWO,
        createdAt: at('02'),
      });
      const third = aDayNote('order-a', {
        planItemId: DAY_THREE,
        createdAt: at('03'),
      });
      const fourth = aFreeNote('order-c', { createdAt: at('04') });
      // Gravadas numa ordem que não é nem a de `createdAt` nem a de id.
      const insertionOrder = [third, first, fourth, second];
      for (const note of insertionOrder) {
        await repo.save(note);
      }

      const found = (await repo.find({ clubId: CLUB_ID })).map(
        (note) => note.id,
      );

      const newestFirst = [fourth.id, third.id, second.id, first.id];
      expect(found).toEqual(newestFirst);
      /**
       * As pré-condições, e é por isso que são QUATRO notas: com três,
       * `id asc` ou `id desc` acertaria a ordem esperada por acidente de
       * nomenclatura — o falso verde que a auditoria da Tarefa 07 pegou no
       * `findByBook`. Nenhuma das três ordens erradas coincide.
       */
      const ids = [first.id, second.id, third.id, fourth.id];
      expect([...ids].sort()).not.toEqual(newestFirst);
      expect([...ids].sort().reverse()).not.toEqual(newestFirst);
      expect(insertionOrder.map((note) => note.id)).not.toEqual(newestFirst);
    });

    /**
     * ⚠️ O DESEMPATE, e é ele que alinha o CORTE das 500 com a ordem que a
     * pessoa vê.
     *
     * `createdAt desc` sozinho não é ordem total, e empate no mesmo
     * milissegundo é o caso NORMAL (duas pessoas do clube salvando ao mesmo
     * tempo, dois dispositivos da mesma pessoa, e a corrida do `save` acima,
     * que produz exatamente isto). Sem `id` como segundo critério, o conjunto
     * que o `take` corta na fronteira das 500 é escolhido pela ordem que o
     * Postgres achou mais barata — duas requisições idênticas podem devolver
     * conjuntos DIFERENTES, e a reordenação determinística do `listNotes`
     * (`createdAt desc`, depois `id asc`) esconderia a instabilidade em vez de
     * denunciá-la.
     *
     * A ordem daqui é agora a MESMA do `compareByCreatedAtDesc`: o corte e a
     * tela concordam sobre quem são "as 500 mais recentes".
     */
    it('breaks a createdAt tie by id, the same total order the listing uses', async () => {
      const sameInstant = new Date('2026-06-06T06:06:06.006Z');
      const first = aDayNote('tie-a', { createdAt: sameInstant });
      const second = aDayNote('tie-b', {
        planItemId: DAY_TWO,
        createdAt: sameInstant,
      });
      const third = aDayNote('tie-c', {
        planItemId: DAY_THREE,
        createdAt: sameInstant,
      });
      // Gravadas fora da ordem de id, para a ordem de inserção não acertar.
      const insertionOrder = [third, first, second];
      for (const note of insertionOrder) {
        await repo.save(note);
      }

      const found = (await repo.find({ clubId: CLUB_ID })).map(
        (note) => note.id,
      );

      const byIdAscending = [first.id, second.id, third.id];
      expect(found).toEqual(byIdAscending);
      // Pré-condições: nem a inserção nem o id descendente acertariam.
      expect(insertionOrder.map((note) => note.id)).not.toEqual(byIdAscending);
      expect([...byIdAscending].reverse()).not.toEqual(byIdAscending);
    });
  });

  describe('planItemWritersByBook', () => {
    // Regra 15
    it('returns the pairs of the ACTIVE notes of the book', async () => {
      await repo.save(aDayNote('writers-a'));
      await repo.save(aDayNote('writers-b', { userId: OTHER_AUTHOR_ID }));

      const found = await repo.planItemWritersByBook(BOOK_ID);

      expect(found).toHaveLength(2);
      expect(found).toEqual(
        expect.arrayContaining([
          { planItemId: DAY_ONE, userId: AUTHOR_ID },
          { planItemId: DAY_ONE, userId: OTHER_AUTHOR_ID },
        ]),
      );
    });

    // Regra 15 — nem arquivada, nem avulsa, nem de outro livro.
    it('never returns an archived note, a free note nor a note of another book', async () => {
      await repo.save(
        aDayNote('writers-archived', {
          status: 'ARCHIVED',
          archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );
      await repo.save(aFreeNote('writers-free'));
      await repo.save(
        aDayNote('writers-elsewhere', {
          bookId: OTHER_BOOK_ID,
          planItemId: OTHER_BOOK_DAY,
        }),
      );

      await expect(repo.planItemWritersByBook(BOOK_ID)).resolves.toEqual([]);
      // A pré-condição: as três notas existem.
      expect(await repo.find({ clubId: CLUB_ID })).toHaveLength(3);
    });

    // Regra 15 — o par sai com DUAS chaves e nada mais.
    it('returns objects with only planItemId and userId', async () => {
      await repo.save(aDayNote('writers-shape'));

      const [pair] = await repo.planItemWritersByBook(BOOK_ID);

      expect(Object.keys(required(pair)).sort()).toEqual([
        'planItemId',
        'userId',
      ]);
    });

    /**
     * ⚠️ REGRA 15, a metade que dá razão ao método existir: o SQL **não pede o
     * `doc`**. O `doc` é a maior coluna da tabela, e trafegar as ~60 notas de
     * um livro para desenhar bolinhas de autoria é trafegar o acervo do clube.
     *
     * A asserção é sobre o SQL, e não sobre o objeto devolvido, porque um
     * mapper que descartasse o `doc` DEPOIS de o banco o mandar passaria no
     * teste de forma acima e não pouparia nada. Daí o cliente próprio, com log
     * de query — o `prisma` compartilhado não emite eventos.
     */
    it('does not select the doc column', async () => {
      const client = new PrismaClient({
        log: [{ emit: 'event', level: 'query' }],
      });
      const queries: string[] = [];
      client.$on('query', (event) => queries.push(event.query));
      try {
        await repo.save(aDayNote('writers-sql'));
        await new PrismaNoteRepository(client).planItemWritersByBook(BOOK_ID);
      } finally {
        await client.$disconnect();
      }

      const select = required(queries.find((sql) => sql.includes('"Note"')));
      expect(select).toContain('"planItemId"');
      expect(select).toContain('"userId"');
      expect(select).not.toContain('"doc"');
      expect(select).not.toContain('"plainText"');
    });
  });

  describe('planItemIdsWithAnyNote', () => {
    // Regra 16
    it('finds a day that has an ACTIVE note', async () => {
      await repo.save(aDayNote('anynote-active'));

      await expect(
        repo.planItemIdsWithAnyNote([DAY_ONE, DAY_TWO]),
      ).resolves.toEqual([DAY_ONE]);
    });

    /**
     * ⚠️ REGRA 16 — a regra que separa este método do `planItemWritersByBook`.
     * A FK **não olha `status`**: uma nota arquivada ainda aponta para o item,
     * então remover o dia falharia no banco. Uma guarda que reusasse a leitura
     * da sobreposição de tela (que filtra ACTIVE, e de propósito) liberaria
     * uma remoção que o banco vai recusar.
     */
    it('finds a day whose only note is archived', async () => {
      await repo.save(
        aDayNote('anynote-archived', {
          status: 'ARCHIVED',
          archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );

      await expect(repo.planItemIdsWithAnyNote([DAY_ONE])).resolves.toEqual([
        DAY_ONE,
      ]);
      // A pré-condição que dá dente ao teste: pela OUTRA leitura, o dia está
      // vazio.
      await expect(repo.planItemWritersByBook(BOOK_ID)).resolves.toEqual([]);
    });

    // Regra 16 — é um CONJUNTO: dois autores no mesmo dia dão UM id, senão a
    // mensagem da guarda diria "2 dias" para um dia só.
    it('returns one id per day, not one per note', async () => {
      await repo.save(aDayNote('anynote-set-a'));
      await repo.save(aDayNote('anynote-set-b', { userId: OTHER_AUTHOR_ID }));

      await expect(repo.planItemIdsWithAnyNote([DAY_ONE])).resolves.toEqual([
        DAY_ONE,
      ]);
    });

    // Regra 16 — a avulsa não ancora dia nenhum. No Postgres é o `IN (...)`
    // contra coluna nula: falso.
    it('never lets a free note keep a day alive', async () => {
      await repo.save(aFreeNote('anynote-free'));

      await expect(
        repo.planItemIdsWithAnyNote([DAY_ONE, DAY_TWO, DAY_THREE]),
      ).resolves.toEqual([]);
    });

    it('returns only the asked ids', async () => {
      await repo.save(aDayNote('anynote-asked-a'));
      await repo.save(aDayNote('anynote-asked-c', { planItemId: DAY_THREE }));

      const found = await repo.planItemIdsWithAnyNote([DAY_ONE, DAY_TWO]);

      expect(found).toEqual([DAY_ONE]);
    });

    it('returns an empty list for an empty list of ids', async () => {
      await repo.save(aDayNote('anynote-empty'));

      await expect(repo.planItemIdsWithAnyNote([])).resolves.toEqual([]);
    });
  });

  /**
   * ⚠️ REGRA 17 — `onDelete: Restrict` ESTÁ ATIVO no banco.
   *
   * Este é o teste que a Tarefa 06 não tinha: ela escreveu "o `onDelete:
   * Restrict` que herdamos", e ele não existia. Para relação **opcional** o
   * default do Prisma é **`SetNull`**, e sem a declaração explícita remover um
   * dia do plano NÃO falharia — zeraria o `planItemId` da nota e deixaria uma
   * linha com `kind = 'PLAN'` e `planItemId = null`, um estado que nenhum
   * UseCase produz e que ninguém percebe.
   */
  describe('the planItem foreign key', () => {
    it('refuses to delete a plan item that has a note, and does not null the column', async () => {
      const dayId = trackedPlanItemId('restrict');
      await planRepo.saveMany([
        planItem(dayId, BOOK_ID, 9, '2026-10-09', 'Cap. 9'),
      ]);
      const note = aDayNote('restrict', { planItemId: dayId });
      await repo.save(note);

      await expect(
        prisma.readingPlanItem.delete({ where: { id: dayId } }),
      ).rejects.toThrow();

      // A prova de que NÃO é SetNull: a coluna continua preenchida...
      expect(required(await repo.byId(note.id)).planItemId).toBe(dayId);
      // ...e o dia continua no plano.
      await expect(
        prisma.readingPlanItem.count({ where: { id: dayId } }),
      ).resolves.toBe(1);
    });

    // O outro lado: sem nota, o dia se apaga normalmente. Sem este par, um
    // `Restrict` que barrasse TODA remoção passaria no teste de cima.
    it('deletes a plan item that has no note', async () => {
      const dayId = trackedPlanItemId('nonote');
      await planRepo.saveMany([
        planItem(dayId, BOOK_ID, 8, '2026-10-08', 'Cap. 8'),
      ]);

      await prisma.readingPlanItem.delete({ where: { id: dayId } });

      await expect(
        prisma.readingPlanItem.count({ where: { id: dayId } }),
      ).resolves.toBe(0);
    });
  });

  /**
   * ⚠️ REGRA 18 — os índices lidos do CATÁLOGO DO POSTGRES, não do arquivo do
   * schema. O que importa é o que o banco tem.
   *
   * Nota de execução: `@@unique` do Prisma emite `CREATE UNIQUE INDEX`, não
   * `CONSTRAINT ... UNIQUE`, então o índice **não aparece** em
   * `information_schema.table_constraints` — é `pg_index` que o conhece. A
   * nulidade da coluna, sim, vem do `information_schema`.
   */
  describe('the schema in the database', () => {
    it('has a unique index on exactly (planItemId, userId)', async () => {
      const rows = await prisma.$queryRaw<
        { indexname: string; column: string; position: number }[]
      >`
        SELECT ic.relname                AS indexname,
               a.attname                 AS column,
               k.ordinality::int          AS position
        FROM pg_index i
        JOIN pg_class ic ON ic.oid = i.indexrelid
        JOIN pg_class tc ON tc.oid = i.indrelid
        JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
        JOIN pg_attribute a
          ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE tc.relname = 'Note' AND i.indisunique AND NOT i.indisprimary
        ORDER BY ic.relname, k.ordinality
      `;

      // UM índice único não-primário, com essas duas colunas nessa ordem.
      expect(rows.map((row) => row.column)).toEqual(['planItemId', 'userId']);
      expect(new Set(rows.map((row) => row.indexname)).size).toBe(1);
    });

    it('keeps planItemId nullable, which is what makes free notes unlimited', async () => {
      const rows = await prisma.$queryRaw<
        { column_name: string; is_nullable: string }[]
      >`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'Note'
          AND column_name IN ('planItemId', 'userId', 'doc', 'updatedAt')
        ORDER BY column_name
      `;

      expect(rows).toEqual([
        { column_name: 'doc', is_nullable: 'NO' },
        { column_name: 'planItemId', is_nullable: 'YES' },
        { column_name: 'updatedAt', is_nullable: 'NO' },
        { column_name: 'userId', is_nullable: 'NO' },
      ]);
    });

    // A prova de que a FK é RESTRICT e não SET NULL, lida do catálogo — o
    // companheiro estático da regra 17.
    it('declares the planItem foreign key as ON DELETE RESTRICT', async () => {
      const rows = await prisma.$queryRaw<{ rule: string }[]>`
        SELECT rc.delete_rule AS rule
        FROM information_schema.referential_constraints rc
        WHERE rc.constraint_name = 'Note_planItemId_fkey'
      `;

      expect(required(rows[0]).rule).toBe('RESTRICT');
    });
  });

  /**
   * ⚠️ REGRA 24 — o caso do ADR 0007 com ANOTAÇÕES em cena, contra o Postgres.
   *
   * Acrescentar um dia na frente do plano renumera os sobreviventes numa só
   * operação. O que este bloco acrescenta ao teste que o repositório do plano
   * já tem é a `Note` ancorada nos sobreviventes: se o diff recriasse os itens
   * com ids novos, a FK `Restrict` recusaria a operação inteira — e é por isso
   * que o `replacePlanItems` é diff por `date` e não apaga-e-recria.
   */
  describe('a plan renumbered under anchored notes', () => {
    let dayA: string;
    let dayB: string;

    beforeEach(async () => {
      dayA = trackedPlanItemId('anchor-a');
      dayB = trackedPlanItemId('anchor-b');
      await planRepo.saveMany([
        planItem(dayA, PLAN_BOOK_ID, 0, '2026-10-01', 'Cap. 1'),
        planItem(dayB, PLAN_BOOK_ID, 1, '2026-10-02', 'Cap. 2'),
      ]);
    });

    it('inserts a day in front while the notes keep pointing at the survivors', async () => {
      const noteA = await repo.save(
        aDayNote('anchor-a', { bookId: PLAN_BOOK_ID, planItemId: dayA }),
      );
      const noteB = await repo.save(
        aDayNote('anchor-b', { bookId: PLAN_BOOK_ID, planItemId: dayB }),
      );
      const prologue = trackedPlanItemId('anchor-prologue');

      const replaced = await planRepo.replaceForBook(PLAN_BOOK_ID, {
        upsert: [
          planItem(prologue, PLAN_BOOK_ID, 0, '2026-09-30', 'Prólogo'),
          planItem(dayA, PLAN_BOOK_ID, 1, '2026-10-01', 'Cap. 1'),
          planItem(dayB, PLAN_BOOK_ID, 2, '2026-10-02', 'Cap. 2'),
        ],
        removeIds: [],
      });

      expect(replaced.map((item) => [item.id, item.order])).toEqual([
        [prologue, 0],
        [dayA, 1],
        [dayB, 2],
      ]);
      // As duas anotações continuam ancoradas, e nada nelas mudou.
      expect(await repo.byId(noteA.id)).toEqual(noteA);
      expect(await repo.byId(noteB.id)).toEqual(noteB);
      expect((await repo.planItemIdsWithAnyNote([dayA, dayB])).sort()).toEqual(
        [dayA, dayB].sort(),
      );
    });

    // E o lado que a guarda do `replacePlanItems` existe para nunca deixar
    // acontecer: pedir a remoção de um dia com nota derruba a operação inteira
    // na FK — inclusive a inserção do dia novo, que era legítima.
    it('refuses to remove an anchored day, and writes nothing when it does', async () => {
      await repo.save(
        aDayNote('anchor-doomed', { bookId: PLAN_BOOK_ID, planItemId: dayB }),
      );
      const fresh = trackedPlanItemId('anchor-fresh');

      await expect(
        planRepo.replaceForBook(PLAN_BOOK_ID, {
          upsert: [
            planItem(dayA, PLAN_BOOK_ID, 0, '2026-10-01', 'Cap. 1'),
            planItem(fresh, PLAN_BOOK_ID, 1, '2026-10-03', 'Cap. 3'),
          ],
          removeIds: [dayB],
        }),
      ).rejects.toThrow();

      const after = await planRepo.findByBook(PLAN_BOOK_ID);
      expect(after.map((item) => item.id)).toEqual([dayA, dayB]);
    });
  });
});

/** Um item de plano, no formato do domínio. Factory, nunca `const` (§7.7). */
function planItem(
  id: string,
  bookId: string,
  order: number,
  date: string,
  title: string,
) {
  return {
    id,
    bookId,
    order,
    date,
    title,
    reference: null,
    createdAt: CREATED_AT,
  };
}
