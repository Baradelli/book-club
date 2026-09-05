import { beforeEach, describe, expect, it } from 'vitest';

import type { ReadingPlanItem } from '../../domain/book';
import { BookNotFoundError, NotAMemberError } from '../../domain/errors';
import type { Note } from '../../domain/note';
import {
  aBook,
  aMembership,
  aNote,
  aPlanItem,
} from '../../test-support/builders';
import { BookRepositoryFake } from '../_fakes/book-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { NoteRepositoryFake } from '../_fakes/note-repository-fake';
import { ReadingPlanItemRepositoryFake } from '../_fakes/reading-plan-item-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { ListPlanItemWritersInput } from '../list-plan-item-writers';
import { ListPlanItemWriters } from '../list-plan-item-writers';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const BOOK_ID = 'book-1';
const OTHER_BOOK_ID = 'book-2';
const OTHER_CLUB_BOOK_ID = 'book-do-outro-clube';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';
// Nomes escolhidos para a ordem alfabética NÃO ser a de inserção nem a que o
// repositório de notas enumera: é o que faz um `userIds` sem `sort` falhar.
const ANA_ID = 'user-ana';
const ZECA_ID = 'user-zeca';

const DAY_1 = '2026-10-01';
const DAY_2 = '2026-10-02';
const DAY_3 = '2026-10-03';
const DAY_1_ID = `plan-${BOOK_ID}-${DAY_1}`;
const DAY_2_ID = `plan-${BOOK_ID}-${DAY_2}`;
const DAY_3_ID = `plan-${BOOK_ID}-${DAY_3}`;

/**
 * O plano como um repositório Prisma que perdeu o `orderBy` o devolveria.
 *
 * Existe para a ordenação do UseCase não ser linha morta: o fake honesto já
 * ordena por `order`, então contra ele "o UseCase ordenou" e "o repositório
 * ordenou" são indistinguíveis. É a mesma defesa do `getBookWithPlan` — a tela
 * do livro não pode virar um plano fora de ordem porque alguém perdeu o
 * `orderBy` no repositório.
 */
class UnsortedReadingPlanItemRepositoryFake extends ReadingPlanItemRepositoryFake {
  override async findByBook(bookId: string): Promise<ReadingPlanItem[]> {
    return (await super.findByBook(bookId)).reverse();
  }
}

describe('ListPlanItemWriters', () => {
  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let planItems: ReadingPlanItemRepositoryFake;
  let notes: NoteRepositoryFake;
  let useCase: ListPlanItemWriters;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    planItems = new ReadingPlanItemRepositoryFake();
    notes = new NoteRepositoryFake();
    useCase = new ListPlanItemWriters(
      new AssertMembership(memberships),
      books,
      planItems,
      notes,
    );

    for (const [userId, role] of [
      [OWNER_ID, 'OWNER'],
      [ADMIN_ID, 'ADMIN'],
      [MEMBER_ID, 'MEMBER'],
      [ANA_ID, 'MEMBER'],
      [ZECA_ID, 'MEMBER'],
    ] as const) {
      await memberships.save(aMembership({ userId, clubId: CLUB_ID, role }));
    }

    await books.save(aBook({ id: BOOK_ID, clubId: CLUB_ID }));
    await books.save(aBook({ id: OTHER_BOOK_ID, clubId: CLUB_ID }));
    await books.save(aBook({ id: OTHER_CLUB_BOOK_ID, clubId: OTHER_CLUB_ID }));
  });

  // Fixture como FACTORY, nunca `const` de describe (CONVENCOES-CODIGO §6.6).
  function validInput(
    overrides: Partial<ListPlanItemWritersInput> = {},
  ): ListPlanItemWritersInput {
    return { actorUserId: MEMBER_ID, bookId: BOOK_ID, ...overrides };
  }

  function aDayNote(overrides: Partial<Note> = {}): Note {
    return aNote({
      kind: 'PLAN',
      clubId: CLUB_ID,
      bookId: BOOK_ID,
      ...overrides,
    });
  }

  async function savePlanOfThreeDays(): Promise<void> {
    await planItems.saveMany([
      aPlanItem({ bookId: BOOK_ID, date: DAY_1, order: 0 }),
      aPlanItem({ bookId: BOOK_ID, date: DAY_2, order: 1 }),
      aPlanItem({ bookId: BOOK_ID, date: DAY_3, order: 2 }),
    ]);
  }

  describe('permission and tenant', () => {
    // Regra 25 — o corte é o `bookForActor`: o clube vem de `book.clubId`,
    // nunca do input.
    it('rejects a book that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ bookId: 'book-fantasma' })),
      ).rejects.toBeInstanceOf(BookNotFoundError);
    });

    // Regra 25 — arquivado é invisível, e dá o MESMO erro do inexistente.
    it('rejects an archived book', async () => {
      await books.save(
        aBook({
          id: BOOK_ID,
          clubId: CLUB_ID,
          status: 'ARCHIVED',
          archivedAt: new Date('2026-11-01T00:00:00.000Z'),
        }),
      );

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        BookNotFoundError,
      );
    });

    // Regra 25 — livro de outro clube é 404 de MEMBERSHIP: o clube sai do
    // livro, então nem mandando o id certo o forasteiro entra.
    it('rejects a book of a club the actor is not a member of', async () => {
      await expect(
        useCase.execute(validInput({ bookId: OTHER_CLUB_BOOK_ID })),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    // Regra 25
    it('rejects an actor without an active membership', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: 'user-outsider' })),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    // Regra 25
    it('rejects an actor whose membership is archived', async () => {
      await memberships.save(
        aMembership({
          userId: MEMBER_ID,
          clubId: CLUB_ID,
          role: 'MEMBER',
          status: 'ARCHIVED',
        }),
      );

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        NotAMemberError,
      );
    });

    /**
     * Regra 25 — **o corte vem ANTES de qualquer leitura de conteúdo.** Sem os
     * contadores, "recusou antes de ler" e "leu e depois recusou" dão o mesmo
     * erro para o cliente, e a segunda ordem trafega o acervo de um clube para
     * quem não é dele antes de descartá-lo.
     *
     * O **plano** conta junto com as notas: os temas de cada dia são conteúdo do
     * clube, e lê-los antes do corte é o mesmo vazamento numa coluna menor.
     */
    it('never reads the plan nor the notes when the actor is not a member', async () => {
      await savePlanOfThreeDays();
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: MEMBER_ID }));

      await expect(
        useCase.execute(validInput({ actorUserId: 'user-outsider' })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(planItems.findByBookCalls).toBe(0);
      expect(notes.planItemWritersByBookCalls).toBe(0);
    });

    // Regra 25 — e o mesmo para o livro que não existe: nem plano nem nota são
    // lidos.
    it('never reads the plan nor the notes when the book does not exist', async () => {
      await expect(
        useCase.execute(validInput({ bookId: 'book-fantasma' })),
      ).rejects.toBeInstanceOf(BookNotFoundError);

      expect(planItems.findByBookCalls).toBe(0);
      expect(notes.planItemWritersByBookCalls).toBe(0);
    });

    /**
     * Regra 25 — **não exige papel**: a sobreposição de "quem já escreveu" é a
     * régua de incentivo do grupo, e é o ADR 0002 (o acervo é do clube).
     */
    it.each([
      ['MEMBER', MEMBER_ID],
      ['ADMIN', ADMIN_ID],
      ['OWNER', OWNER_ID],
    ])('lets the %s see who wrote', async (_label, actorUserId) => {
      await savePlanOfThreeDays();
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));

      const found = await useCase.execute(validInput({ actorUserId }));

      expect(found).toEqual([{ planItemId: DAY_1_ID, userIds: [ANA_ID] }]);
    });

    /**
     * Regra 25 — e nenhum papel é recusado na leitura: o `MEMBER` recebe a
     * sobreposição, e recebe nela o dia em que OUTRA pessoa escreveu.
     *
     * O nome antigo (`never raises ForbiddenRoleError on a read`) prometia mais
     * do que provava: o valor resolvido é `PlanItemWriters[]` e NUNCA poderia
     * ser um `Error`, então o `resolves.not.toBeInstanceOf` não assertava nada —
     * só o `resolves` mordia. É o mesmo veredito da auditoria da Tarefa 08
     * (`upsert-plan-note.test.ts`), e agora o teste asserta o que o `resolves`
     * de fato entrega. → CONVENCOES-CODIGO §7.4.
     */
    it('hands a plain MEMBER the overlay instead of demanding a role', async () => {
      await savePlanOfThreeDays();
      await notes.save(aDayNote({ planItemId: DAY_2_ID, userId: ZECA_ID }));

      const found = await useCase.execute(
        validInput({ actorUserId: MEMBER_ID }),
      );

      expect(found).toEqual([{ planItemId: DAY_2_ID, userIds: [ZECA_ID] }]);
    });
  });

  describe('the overlay itself', () => {
    beforeEach(savePlanOfThreeDays);

    // Regra 26
    it('returns one entry per plan item that has a note', async () => {
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_3_ID, userId: ANA_ID }));

      const found = await useCase.execute(validInput());

      expect(found).toEqual([
        { planItemId: DAY_1_ID, userIds: [ANA_ID] },
        { planItemId: DAY_3_ID, userIds: [ANA_ID] },
      ]);
    });

    /**
     * Regra 26 — `userIds` **ordenado**, para a saída ser determinística.
     *
     * A inserção é Ana e depois Zeca, e o repositório de notas enumera
     * INVERTIDO: sem `sort`, sairia `[zeca, ana]`.
     */
    it('sorts the userIds of an entry', async () => {
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ZECA_ID }));

      const found = await useCase.execute(validInput());

      expect(found).toEqual([
        { planItemId: DAY_1_ID, userIds: [ANA_ID, ZECA_ID] },
      ]);
    });

    // Regra 27 — item sem nota nenhuma **não aparece**: o front sobrepõe no
    // plano que ele já tem, e devolver todos com `[]` duplicaria o plano na
    // resposta (decisão F da spec).
    it('omits a plan item nobody wrote in', async () => {
      await notes.save(aDayNote({ planItemId: DAY_2_ID, userId: ANA_ID }));

      const found = await useCase.execute(validInput());

      expect(found).toEqual([{ planItemId: DAY_2_ID, userIds: [ANA_ID] }]);
    });

    // Regra 27 — e um livro em que ninguém escreveu dá lista vazia, não três
    // entradas vazias.
    it('returns an empty list for a book nobody wrote in', async () => {
      await expect(useCase.execute(validInput())).resolves.toEqual([]);
    });

    // Regra 28 — duas pessoas no mesmo dia dão UMA entrada com DOIS userIds.
    it('groups two authors of the same day into one entry', async () => {
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ZECA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: MEMBER_ID }));

      const found = await useCase.execute(validInput());

      expect(found).toEqual([
        { planItemId: DAY_1_ID, userIds: [ANA_ID, MEMBER_ID, ZECA_ID] },
      ]);
    });

    // Regra 29 — a mesma pessoa em dias diferentes dá DUAS entradas.
    it('gives the same author one entry per day she wrote in', async () => {
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_2_ID, userId: ANA_ID }));

      const found = await useCase.execute(validInput());

      expect(found).toEqual([
        { planItemId: DAY_1_ID, userIds: [ANA_ID] },
        { planItemId: DAY_2_ID, userIds: [ANA_ID] },
      ]);
    });

    /**
     * Regra 30 — a ordem do array é a do **plano** (`order` crescente), não a do
     * repositório de notas.
     *
     * As notas são inseridas em `3, 1, 2` de propósito, e o repositório enumera
     * invertido — então a ordem que ele oferece é `2, 1, 3`. Montar a resposta a
     * partir dela FALHA aqui, que é exatamente o que a armadilha do fake existe
     * para provocar.
     */
    it('orders the array by the plan order, never by the order the notes came in', async () => {
      await notes.save(aDayNote({ planItemId: DAY_3_ID, userId: ANA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_2_ID, userId: ANA_ID }));

      // Pré-condição: o repositório de notas oferece uma ordem diferente da
      // esperada.
      await expect(notes.planItemWritersByBook(BOOK_ID)).resolves.toEqual([
        { planItemId: DAY_2_ID, userId: ANA_ID },
        { planItemId: DAY_1_ID, userId: ANA_ID },
        { planItemId: DAY_3_ID, userId: ANA_ID },
      ]);

      const found = await useCase.execute(validInput());

      expect(found.map((entry) => entry.planItemId)).toEqual([
        DAY_1_ID,
        DAY_2_ID,
        DAY_3_ID,
      ]);
    });

    // Regra 30 — e a ordenação é do UseCase: um repositório de plano que
    // perdesse o `orderBy` não desordena a tela do livro.
    it('orders by the plan order even when the plan repository forgets the orderBy', async () => {
      const unsortedPlanItems = new UnsortedReadingPlanItemRepositoryFake();
      await unsortedPlanItems.saveMany([
        aPlanItem({ bookId: BOOK_ID, date: DAY_1, order: 0 }),
        aPlanItem({ bookId: BOOK_ID, date: DAY_2, order: 1 }),
        aPlanItem({ bookId: BOOK_ID, date: DAY_3, order: 2 }),
      ]);
      const withUnsortedPlan = new ListPlanItemWriters(
        new AssertMembership(memberships),
        books,
        unsortedPlanItems,
        notes,
      );
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_2_ID, userId: ANA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_3_ID, userId: ANA_ID }));

      // Pré-condição: este repositório devolve o plano ao contrário.
      expect(
        (await unsortedPlanItems.findByBook(BOOK_ID)).map((item) => item.id),
      ).toEqual([DAY_3_ID, DAY_2_ID, DAY_1_ID]);

      const found = await withUnsortedPlan.execute(validInput());

      expect(found.map((entry) => entry.planItemId)).toEqual([
        DAY_1_ID,
        DAY_2_ID,
        DAY_3_ID,
      ]);
    });

    // Regra 31 — a avulsa não tem dia de leitura, então não entra na
    // sobreposição.
    it('never counts a free note', async () => {
      await notes.save(
        aDayNote({ id: 'note-avulsa', kind: 'FREE', planItemId: null }),
      );

      await expect(useCase.execute(validInput())).resolves.toEqual([]);
    });

    // Regra 32 — arquivada não entra: quem arquivou a nota do dia não escreveu
    // ali, para efeito da tela.
    it('never counts an archived note', async () => {
      await notes.save(
        aDayNote({
          planItemId: DAY_1_ID,
          userId: ANA_ID,
          status: 'ARCHIVED',
          archivedAt: new Date('2026-11-01T00:00:00.000Z'),
        }),
      );
      await notes.save(aDayNote({ planItemId: DAY_2_ID, userId: ANA_ID }));

      const found = await useCase.execute(validInput());

      expect(found).toEqual([{ planItemId: DAY_2_ID, userIds: [ANA_ID] }]);
    });

    /**
     * Regra 34 — o array é construído a partir do **plano**, não das notas: um
     * `planItemId` que não está no plano do livro (dado inconsistente) não
     * aparece.
     *
     * O `planItemId` fantasma leva o prefixo do livro de propósito — quem
     * montasse a resposta a partir das notas o devolveria, e o front sobreporia
     * uma bolinha num dia que a tela dele não tem.
     */
    it('never returns a planItemId that is not in the plan of the book', async () => {
      await notes.save(
        aDayNote({ planItemId: `plan-${BOOK_ID}-2026-10-09`, userId: ANA_ID }),
      );
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));

      const found = await useCase.execute(validInput());

      expect(found).toEqual([{ planItemId: DAY_1_ID, userIds: [ANA_ID] }]);
    });
  });

  // Regra 33 — nota de OUTRO livro não entra, mesmo do mesmo clube. O
  // `planItemId` da nota intrusa é o do plano procurado de propósito: é o que
  // faz um filtro por dia de leitura, em vez de por livro, falhar aqui.
  it('never counts a note of another book, even in the same club', async () => {
    await savePlanOfThreeDays();
    await notes.save(
      aDayNote({
        id: 'note-do-outro-livro',
        bookId: OTHER_BOOK_ID,
        planItemId: DAY_1_ID,
        userId: ANA_ID,
      }),
    );

    await expect(useCase.execute(validInput())).resolves.toEqual([]);
  });

  /**
   * Regra 35 — estado acidental entre chamadas seria bug de produção invisível:
   * a Tarefa 11 compõe o UseCase uma vez e reusa por request. Aqui o vazamento
   * mais perigoso é a sobreposição de um livro aparecendo no outro.
   */
  it('does not leak state between two executes of the same instance', async () => {
    await savePlanOfThreeDays();
    await planItems.saveMany([
      aPlanItem({ bookId: OTHER_BOOK_ID, date: DAY_1, order: 0 }),
    ]);
    await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));
    await notes.save(
      aDayNote({
        id: 'note-do-outro-livro',
        bookId: OTHER_BOOK_ID,
        planItemId: `plan-${OTHER_BOOK_ID}-${DAY_1}`,
        userId: ZECA_ID,
      }),
    );

    const first = await useCase.execute(validInput());
    const second = await useCase.execute(validInput({ bookId: OTHER_BOOK_ID }));
    const third = await useCase.execute(validInput());

    expect(first).toEqual([{ planItemId: DAY_1_ID, userIds: [ANA_ID] }]);
    expect(second).toEqual([
      { planItemId: `plan-${OTHER_BOOK_ID}-${DAY_1}`, userIds: [ZECA_ID] },
    ]);
    // A terceira repete a primeira: um acumulador na instância mudaria isto.
    expect(third).toEqual([{ planItemId: DAY_1_ID, userIds: [ANA_ID] }]);
  });
});
