import { beforeEach, describe, expect, it } from 'vitest';

import type { Book, ReadingPlanItem } from '../../domain/book';
import {
  BookNotFoundError,
  ForbiddenRoleError,
  InvalidBookError,
  NotAMemberError,
} from '../../domain/errors';
import type { Note } from '../../domain/note';
import type { ReadingLog } from '../../domain/reading-log';
import type { PlanItemDraft } from '../../domain/reading-plan';
import {
  aBook,
  aMembership,
  aNote,
  aPlanItem,
  aReadingLog,
  required,
} from '../../test-support/builders';
import { BookRepositoryFake } from '../_fakes/book-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { NoteRepositoryFake } from '../_fakes/note-repository-fake';
import { ReadingLogRepositoryFake } from '../_fakes/reading-log-repository-fake';
import { ReadingPlanItemRepositoryFake } from '../_fakes/reading-plan-item-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { ReplacePlanItemsInput } from '../replace-plan-items';
import { ReplacePlanItems } from '../replace-plan-items';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const BOOK_ID = 'book-1';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';
const OTHER_ADMIN_ID = 'user-other-admin';

const CREATED_ISO = '2026-01-01T00:00:00.000Z';

/** O plano que já está no banco antes de cada teste. */
const DAY_ONE = 'plan-book-1-2026-10-01';
const DAY_TWO = 'plan-book-1-2026-10-02';
const DAY_THREE = 'plan-book-1-2026-10-03';

function byId(
  items: readonly ReadingPlanItem[],
  id: string,
): ReadingPlanItem | undefined {
  return items.find((item) => item.id === id);
}

/**
 * O erro que a promessa rejeitou, para os testes que olham a MENSAGEM.
 *
 * Um `try`/`catch` e não um cast: `rejects.toThrow(/.../)` casa por regex e não
 * serve para afirmar o que a mensagem **não** contém, e um
 * `catch((e) => e as Error)` aceitaria calado uma promessa que resolveu. Mesmo
 * helper do `note-repository-fake.test.ts`.
 */
async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`expected an Error, got ${typeof error}`);
  }
  throw new Error('expected the promise to reject, but it resolved');
}

describe('ReplacePlanItems', () => {
  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let plan: ReadingPlanItemRepositoryFake;
  let notes: NoteRepositoryFake;
  let logs: ReadingLogRepositoryFake;
  let useCase: ReplacePlanItems;
  let stored: Book;
  let planBefore: ReadingPlanItem[];
  /** Os contadores logo depois do seed, para não contar o seed como escrita. */
  let saveCallsBefore: number;
  let replaceCallsBefore: number;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    plan = new ReadingPlanItemRepositoryFake();
    notes = new NoteRepositoryFake();
    logs = new ReadingLogRepositoryFake();
    useCase = new ReplacePlanItems(
      new AssertMembership(memberships),
      books,
      plan,
      notes,
      logs,
    );

    stored = aBook({ id: BOOK_ID, clubId: CLUB_ID });
    await books.save(stored);

    await plan.saveMany([
      aPlanItem({
        bookId: BOOK_ID,
        order: 0,
        date: '2026-10-01',
        title: 'Cap. 1',
        reference: 'p. 1-20',
      }),
      aPlanItem({
        bookId: BOOK_ID,
        order: 1,
        date: '2026-10-02',
        title: 'Cap. 2',
        reference: 'p. 21-40',
      }),
      aPlanItem({
        bookId: BOOK_ID,
        order: 2,
        date: '2026-10-03',
        title: 'Cap. 3',
        reference: 'p. 41-60',
      }),
    ]);
    planBefore = plan.saved;
    saveCallsBefore = plan.saveManyCalls;
    replaceCallsBefore = plan.replaceForBookCalls;

    for (const [userId, role] of [
      [OWNER_ID, 'OWNER'],
      [ADMIN_ID, 'ADMIN'],
      [MEMBER_ID, 'MEMBER'],
    ] as const) {
      await memberships.save(aMembership({ userId, clubId: CLUB_ID, role }));
    }
    await memberships.save(
      aMembership({
        userId: OTHER_ADMIN_ID,
        clubId: OTHER_CLUB_ID,
        role: 'ADMIN',
      }),
    );
  });

  function validInput(
    overrides: Partial<ReplacePlanItemsInput> = {},
  ): ReplacePlanItemsInput {
    return {
      actorUserId: ADMIN_ID,
      bookId: BOOK_ID,
      planItems: [{ date: '2026-10-01', title: 'Cap. 1' }],
      ...overrides,
    };
  }

  /**
   * Regra 21: caminho de erro não escreve NEM APAGA. `saved` inalterado não
   * distinguiria "não chamou" de "chamou com lote vazio", então os contadores
   * do fake entram junto — e o livro também é conferido, porque "nada foi
   * escrito" inclui o livro, não só o plano.
   *
   * **Regra 23 da Tarefa 11**, e é por isso que o contador de notas entra
   * aqui: a guarda "não remover dia com anotação" roda DEPOIS do corte de
   * tenant e DEPOIS da validação do rascunho. Quem não é admin do clube — e
   * quem manda um rascunho malformado — não pode gerar nem uma leitura de
   * nota, senão a existência de anotação vira canal de informação sobre um
   * clube que não é o dele.
   */
  function expectNothingTouched(): void {
    expect(plan.saved).toEqual(planBefore);
    expect(plan.saveManyCalls).toBe(saveCallsBefore);
    expect(plan.replaceForBookCalls).toBe(replaceCallsBefore);
    expect(plan.removedIds).toEqual([]);
    expect(books.saved).toEqual([stored]);
    expect(books.updateCalls).toBe(0);
    expect(notes.planItemIdsWithAnyNoteCalls).toBe(0);
    // ⚠️ **E a SEGUNDA guarda pelo mesmo argumento** (Tarefa 32c): "alguém já
    // leu este dia" é conteúdo do clube tanto quanto "alguém escreveu nele".
    // Um contador só, afirmado para a guarda que já existia, deixaria a nova
    // consultar o registro de leitura de um clube que não é do ator — e §7.3
    // manda um `xxxCalls === 0` para CADA leitura de conteúdo.
    expect(logs.planItemIdsWithAnyReadingLogCalls).toBe(0);
  }

  describe('permission and tenant', () => {
    // Regra 1
    it('rejects a book that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ bookId: 'book-ghost' })),
      ).rejects.toBeInstanceOf(BookNotFoundError);

      expectNothingTouched();
    });

    // Regra 1
    it('rejects an archived book', async () => {
      stored = aBook({
        id: BOOK_ID,
        clubId: CLUB_ID,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      await books.save(stored);

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        BookNotFoundError,
      );

      expectNothingTouched();
    });

    // Regra 2
    it('rejects an actor without an active membership', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: 'user-outsider' })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expectNothingTouched();
    });

    // Regra 2
    it('rejects an actor whose membership is archived', async () => {
      await memberships.save(
        aMembership({
          userId: ADMIN_ID,
          clubId: CLUB_ID,
          role: 'ADMIN',
          status: 'ARCHIVED',
        }),
      );

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        NotAMemberError,
      );

      expectNothingTouched();
    });

    // Regra 3 — escrita exige OWNER/ADMIN.
    it('rejects an actor whose role is MEMBER', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: MEMBER_ID })),
      ).rejects.toBeInstanceOf(ForbiddenRoleError);

      expectNothingTouched();
    });

    // Regra 3
    it.each([
      ['ADMIN', ADMIN_ID],
      ['OWNER', OWNER_ID],
    ])('lets the %s replace the plan', async (_label, actorUserId) => {
      const { planItems } = await useCase.execute(validInput({ actorUserId }));

      expect(planItems).toHaveLength(1);
    });

    // Regra 4 — o clube do guard vem de book.clubId.
    it('rejects an admin of another club', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: OTHER_ADMIN_ID })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expectNothingTouched();
    });

    // Regra 4
    it('ignores a clubId smuggled into the input', async () => {
      const smuggled = {
        actorUserId: OTHER_ADMIN_ID,
        bookId: BOOK_ID,
        planItems: [{ date: '2026-10-01', title: 'Cap. 1' }],
        // @ts-expect-error o input não declara clubId — ele vem de book.clubId
        clubId: OTHER_CLUB_ID,
      } satisfies ReplacePlanItemsInput;

      await expect(useCase.execute(smuggled)).rejects.toBeInstanceOf(
        NotAMemberError,
      );

      expectNothingTouched();
    });
  });

  // Regra 21 — a validação inteira roda ANTES de escrever E antes de apagar.
  // Um plano ruim não pode ter apagado meio plano no caminho.
  describe('validation before any write', () => {
    it.each<[string, PlanItemDraft[]]>([
      ['an empty title', [{ date: '2026-10-01', title: '   ' }]],
      ['a malformed date', [{ date: '2026-02-30', title: 'Cap. 1' }]],
      [
        'a repeated date',
        [
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-01', title: 'Cap. 2' },
        ],
      ],
      [
        'dates out of order',
        [
          { date: '2026-10-03', title: 'Cap. 3' },
          { date: '2026-10-01', title: 'Cap. 1' },
        ],
      ],
      [
        // A lição da auditoria da Tarefa 05: '2026-9-30' ordena DEPOIS de
        // '2026-10-01' lexicograficamente, então a checagem de ordem não pega
        // nada — quem reprova é o formato, e ele roda em TODA posição.
        'a malformed date at position 1 that sorts after the valid one',
        [
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-9-30', title: 'Cap. 2' },
        ],
      ],
      [
        'a valid head followed by an invalid tail',
        [
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-02', title: 'Cap. 2' },
          { date: '2026-10-03', title: '' },
        ],
      ],
    ])(
      'writes and deletes nothing when the draft has %s',
      async (_label, planItems) => {
        await expect(
          useCase.execute(validInput({ planItems })),
        ).rejects.toBeInstanceOf(InvalidBookError);

        expectNothingTouched();
      },
    );

    it('states the precondition of the sorting trap', () => {
      expect('2026-9-30' > '2026-10-01').toBe(true);
    });
  });

  // Regras 22 e 29 — O TESTE QUE SALVA AS ANOTAÇÕES.
  //
  // `Note.planItemId` tem FK para `ReadingPlanItem`, e a anotação do dia é
  // unique(planItemId, userId): a nota daquele dia está amarrada ao ID do
  // item. Apagar-e-recriar falharia por FK (onDelete: Restrict) ou, com
  // Cascade, apagaria a anotação de outra pessoa — que é justamente o que o
  // admin não pode fazer.
  it('keeps the id and the createdAt of the item whose date survives', async () => {
    const before = byId(planBefore, DAY_TWO);
    expect(before).toBeDefined();

    const { planItems } = await useCase.execute(
      validInput({
        planItems: [
          {
            date: '2026-10-02',
            title: 'Cap. 2 — corrigido',
            reference: 'p. 21-44',
          },
        ],
      }),
    );

    const survivor = required(planItems[0]);
    expect(survivor.id).toBe(DAY_TWO);
    expect(survivor.createdAt).toEqual(new Date(CREATED_ISO));
    expect(survivor.createdAt).toEqual(required(before).createdAt);
    // ...e o que o admin quis mudar, mudou.
    expect(survivor.title).toBe('Cap. 2 — corrigido');
    expect(survivor.reference).toBe('p. 21-44');
    expect(survivor.order).toBe(0);
    // O que ficou no banco é o mesmo item, não um clone com id novo.
    expect(plan.saved.map((item) => item.id)).toEqual([DAY_TWO]);
    expect(required(plan.saved[0]).createdAt).toEqual(new Date(CREATED_ISO));
  });

  // Regra 22 — o mesmo, no caso real dominante: "errei o tema do dia 2".
  it('updates a surviving item in place, keeping every other item', async () => {
    const { planItems, created, updated, removed } = await useCase.execute(
      validInput({
        planItems: [
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-02', title: 'Cap. 2 — A promessa' },
          { date: '2026-10-03', title: 'Cap. 3' },
        ],
      }),
    );

    expect(planItems.map((item) => item.id)).toEqual([
      DAY_ONE,
      DAY_TWO,
      DAY_THREE,
    ]);
    expect(byId(planItems, DAY_TWO)?.title).toBe('Cap. 2 — A promessa');
    expect({ created, updated, removed }).toEqual({
      created: 0,
      updated: 3,
      removed: 0,
    });
  });

  // Regra 23
  it('creates a new item for a date that was not in the plan', async () => {
    const before = Date.now();

    const { planItems, created, updated, removed } = await useCase.execute(
      validInput({
        planItems: [
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-02', title: 'Cap. 2' },
          { date: '2026-10-03', title: 'Cap. 3' },
          { date: '2026-10-04', title: 'Cap. 4' },
        ],
      }),
    );

    const fresh = required(planItems[3]);
    expect(fresh.date).toBe('2026-10-04');
    expect(fresh.id).toEqual(expect.any(String));
    expect(planBefore.map((item) => item.id)).not.toContain(fresh.id);
    expect(fresh.bookId).toBe(BOOK_ID);
    expect(fresh.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect({ created, updated, removed }).toEqual({
      created: 1,
      updated: 3,
      removed: 0,
    });
  });

  // Regra 23 — ids distintos entre os itens novos de um mesmo lote.
  it('gives every new item its own id', async () => {
    const { planItems } = await useCase.execute(
      validInput({
        planItems: [
          { date: '2026-11-01', title: 'Cap. 1' },
          { date: '2026-11-02', title: 'Cap. 2' },
          { date: '2026-11-03', title: 'Cap. 3' },
        ],
      }),
    );

    expect(new Set(planItems.map((item) => item.id)).size).toBe(3);
  });

  // Regra 24
  it('removes the item whose date disappeared from the draft', async () => {
    const { planItems, created, updated, removed } = await useCase.execute(
      validInput({
        planItems: [
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-03', title: 'Cap. 3' },
        ],
      }),
    );

    expect(planItems.map((item) => item.id)).toEqual([DAY_ONE, DAY_THREE]);
    // Só o dia 2 saiu — e os outros dois continuam com os ids de antes.
    expect(plan.saved.map((item) => item.id).sort()).toEqual(
      [DAY_ONE, DAY_THREE].sort(),
    );
    expect({ created, updated, removed }).toEqual({
      created: 0,
      updated: 2,
      removed: 1,
    });
  });

  // Regra 25 — `order` é derivado da posição inclusive para o sobrevivente que
  // muda de posição: aqui o dia 1 sai e os dias 2 e 3 descem para 0 e 1.
  //
  // Este era o caso que a ordem "apaga depois salva" supostamente resolvia,
  // e ele é legítimo por si — o `order` não é único (ADR 0007), então a
  // renumeração passa nas duas ordens de chamada.
  it('renumbers the survivors that changed position', async () => {
    const { planItems } = await useCase.execute(
      validInput({
        planItems: [
          { date: '2026-10-02', title: 'Cap. 2' },
          { date: '2026-10-03', title: 'Cap. 3' },
        ],
      }),
    );

    expect(planItems.map((item) => [item.id, item.order])).toEqual([
      [DAY_TWO, 0],
      [DAY_THREE, 1],
    ]);
  });

  // Regra 25 e O CASO DO ADR 0007: acrescentar um "Prólogo" na frente de um
  // plano existente, renumerando os três sobreviventes, NUMA SÓ operação.
  //
  // Este teste passava antes por acidente: o fake validava o lote em conjunto
  // e escondia que o `@@unique([bookId, order])` do §6 do plano de produto
  // recusaria o item novo no `order 0` que o dia 1 ainda ocupava. Com o fake
  // sequencial (a semântica real de um índice único não deferível) ele só
  // passa porque o `order` deixou de ser único — que é a decisão do ADR.
  it('inserts a new item in front and renumbers the survivors, in one operation', async () => {
    const { planItems, created, updated, removed } = await useCase.execute(
      validInput({
        planItems: [
          { date: '2026-09-30', title: 'Prólogo' },
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-02', title: 'Cap. 2' },
          { date: '2026-10-03', title: 'Cap. 3' },
        ],
      }),
    );

    expect(planItems.map((item) => item.order)).toEqual([0, 1, 2, 3]);
    expect(byId(planItems, DAY_ONE)?.order).toBe(1);
    expect(byId(planItems, DAY_TWO)?.order).toBe(2);
    expect(byId(planItems, DAY_THREE)?.order).toBe(3);
    // Os três sobreviventes mantêm o id — as anotações deles continuam de pé.
    expect(planItems.map((item) => item.id).slice(1)).toEqual([
      DAY_ONE,
      DAY_TWO,
      DAY_THREE,
    ]);
    expect({ created, updated, removed }).toEqual({
      created: 1,
      updated: 3,
      removed: 0,
    });
    // "Numa só operação": UMA chamada de `replaceForBook`, sem nada removido.
    // Não há renumeração em duas fases nem ordenação do lote por sinal do
    // deslocamento (as alternativas que o ADR descartou).
    expect(plan.replaceForBookCalls).toBe(replaceCallsBefore + 1);
    expect(plan.saveManyCalls).toBe(saveCallsBefore);
    expect(plan.removedIds).toEqual([]);
  });

  // Regra 25 — o rascunho não manda `order`, nem no tipo nem em runtime.
  it('ignores an order smuggled into a draft', async () => {
    const smuggled = [
      // @ts-expect-error o rascunho não declara `order` — é derivado
      { date: '2026-10-01', title: 'Cap. 1', order: 99 },
      // @ts-expect-error o rascunho não declara `order` — é derivado
      { date: '2026-10-02', title: 'Cap. 2', order: 98 },
    ] satisfies PlanItemDraft[];

    const { planItems } = await useCase.execute(
      validInput({ planItems: smuggled }),
    );

    expect(planItems.map((item) => item.order)).toEqual([0, 1]);
  });

  // Regra 26 — plano vazio não é erro: é "vou remontar o plano depois".
  it('removes every item when the new plan is empty', async () => {
    const { planItems, created, updated, removed } = await useCase.execute(
      validInput({ planItems: [] }),
    );

    expect(planItems).toEqual([]);
    expect(plan.saved).toEqual([]);
    expect({ created, updated, removed }).toEqual({
      created: 0,
      updated: 0,
      removed: 3,
    });
  });

  // Regra 27 — substituir por um plano IDÊNTICO não recria nada.
  it('keeps every id when the new plan is identical to the old one', async () => {
    const identical: PlanItemDraft[] = planBefore.map((item) => ({
      date: item.date,
      title: item.title,
      ...(item.reference === null ? {} : { reference: item.reference }),
    }));

    const { planItems, created, updated, removed } = await useCase.execute(
      validInput({ planItems: identical }),
    );

    expect(planItems).toEqual(planBefore);
    expect({ created, updated, removed }).toEqual({
      created: 0,
      updated: 3,
      removed: 0,
    });
    expect(plan.removedIds).toEqual([]);
  });

  // Regra 28 — o caso misto, que é o que a tela da Tarefa 20 vai mostrar
  // antes de confirmar: "1 dia adicionado, 2 atualizados, 1 removido".
  it('counts created, updated and removed in a mixed replacement', async () => {
    const { planItems, created, updated, removed } = await useCase.execute(
      validInput({
        planItems: [
          { date: '2026-10-02', title: 'Cap. 2' },
          { date: '2026-10-03', title: 'Cap. 3' },
          { date: '2026-10-04', title: 'Cap. 4' },
        ],
      }),
    );

    expect({ created, updated, removed }).toEqual({
      created: 1,
      updated: 2,
      removed: 1,
    });
    expect(planItems.map((item) => item.date)).toEqual([
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(byId(planItems, DAY_TWO)?.order).toBe(0);
    expect(byId(planItems, DAY_ONE)).toBeUndefined();
  });

  // Regra 28 — o plano do livro que ainda não tinha nenhum.
  it('creates the whole plan for a book that had none', async () => {
    await books.save(aBook({ id: 'book-2', clubId: CLUB_ID }));

    const { planItems, created, updated, removed } = await useCase.execute(
      validInput({
        bookId: 'book-2',
        planItems: [
          { date: '2026-11-01', title: 'Cap. 1' },
          { date: '2026-11-02', title: 'Cap. 2' },
        ],
      }),
    );

    expect({ created, updated, removed }).toEqual({
      created: 2,
      updated: 0,
      removed: 0,
    });
    expect(planItems.every((item) => item.bookId === 'book-2')).toBe(true);
    // Nada foi apagado — e o plano do livro 1 continua inteiro.
    expect(plan.removedIds).toEqual([]);
    expect(plan.saved).toHaveLength(5);
  });

  // Regra 14 espelhada: substituir o plano de um livro não toca no do outro.
  it('never touches the plan of another book', async () => {
    await books.save(aBook({ id: 'book-2', clubId: CLUB_ID }));
    await plan.saveMany([
      aPlanItem({ bookId: 'book-2', order: 0, date: '2026-11-01' }),
    ]);
    const otherPlanBefore = plan.saved.filter(
      (item) => item.bookId === 'book-2',
    );

    await useCase.execute(validInput({ planItems: [] }));

    expect(plan.saved.filter((item) => item.bookId === 'book-2')).toEqual(
      otherPlanBefore,
    );
  });

  // Regra 14 espelhada: o livro em si não é reescrito por uma troca de plano.
  it('does not rewrite the book', async () => {
    await useCase.execute(validInput());

    expect(books.saved).toEqual([stored]);
  });

  // Estado acidental entre chamadas seria bug de produção invisível: a Tarefa
  // 07 compõe o UseCase uma vez e reusa por request. Aqui os contadores
  // created/updated/removed são o candidato óbvio a não zerar.
  it('does not leak state between two executes of the same instance', async () => {
    await books.save(aBook({ id: 'book-2', clubId: CLUB_ID }));

    const first = await useCase.execute(
      validInput({
        planItems: [
          { date: '2026-10-01', title: 'Cap. 1' },
          { date: '2026-10-09', title: 'Cap. 9' },
        ],
      }),
    );
    const second = await useCase.execute(
      validInput({
        bookId: 'book-2',
        planItems: [{ date: '2026-11-01', title: 'Cap. 1' }],
      }),
    );

    expect(first).toMatchObject({ created: 1, updated: 1, removed: 2 });
    expect(second).toMatchObject({ created: 1, updated: 0, removed: 0 });
    expect(first.planItems.map((item) => item.order)).toEqual([0, 1]);
    expect(second.planItems.map((item) => item.order)).toEqual([0]);
  });

  /**
   * ⚠️ A GUARDA DO BLOCO C (Tarefa 11, regras 19–23) — a pendência que a
   * Tarefa 06 registrou para cá e que só podia existir depois de `Note`.
   *
   * `Note.planItemId` tem FK com `onDelete: Restrict` **explícito**: remover um
   * dia que tem anotação falha no banco. A guarda existe para isso virar um 400
   * com mensagem decente em vez de um 500 de violação de FK — e para o admin
   * descobrir o problema ANTES de o plano ser escrito, não no meio.
   */
  describe('the guard that refuses to remove a day that has notes', () => {
    /** A anotação do dia 2 — o dia que os testes daqui tentam remover. */
    function aNoteOnDayTwo(overrides: Partial<Note> = {}): Note {
      return aNote({
        kind: 'PLAN',
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        planItemId: DAY_TWO,
        userId: MEMBER_ID,
        ...overrides,
      });
    }

    /** O rascunho que remove o dia 2 e mantém os dias 1 e 3. */
    const withoutDayTwo: PlanItemDraft[] = [
      { date: '2026-10-01', title: 'Cap. 1' },
      { date: '2026-10-03', title: 'Cap. 3' },
    ];

    // Regra 19 — o caso comum continua valendo: sem nota no dia, remove.
    it('removes a day that has no note, exactly as before', async () => {
      await notes.save(aNoteOnDayTwo({ planItemId: DAY_ONE }));

      const { planItems, removed } = await useCase.execute(
        validInput({
          planItems: [
            { date: '2026-10-01', title: 'Cap. 1' },
            { date: '2026-10-02', title: 'Cap. 2' },
          ],
        }),
      );

      // O dia 3 saiu, e o dia 1 — que É o que tem nota — ficou.
      expect(planItems.map((item) => item.id)).toEqual([DAY_ONE, DAY_TWO]);
      expect(removed).toBe(1);
      expect(plan.removedIds).toEqual([DAY_THREE]);
    });

    // Regra 20
    it('refuses to remove a day that has a note', async () => {
      await notes.save(aNoteOnDayTwo());

      await expect(
        useCase.execute(validInput({ planItems: withoutDayTwo })),
      ).rejects.toBeInstanceOf(InvalidBookError);
    });

    // Regra 20 — e NADA foi escrito nem removido. O `replaceForBookCalls` é o
    // que separa "recusou antes de escrever" de "escreveu e depois estourou":
    // `saved` inalterado não distinguiria as duas se o fake fosse atômico.
    it('writes nothing and removes nothing when it refuses', async () => {
      await notes.save(aNoteOnDayTwo());

      await expect(
        useCase.execute(validInput({ planItems: withoutDayTwo })),
      ).rejects.toBeInstanceOf(InvalidBookError);

      expect(plan.saved).toEqual(planBefore);
      expect(plan.saveManyCalls).toBe(saveCallsBefore);
      expect(plan.replaceForBookCalls).toBe(replaceCallsBefore);
      expect(plan.removedIds).toEqual([]);
      expect(books.saved).toEqual([stored]);
      // ...e a guarda de fato consultou: sem isto, um `if` sempre-falso
      // passaria este teste por não ter chegado a escrever de outro jeito.
      expect(notes.planItemIdsWithAnyNoteCalls).toBe(1);
    });

    // Regra 21 — ⚠️ A REGRA QUE DECIDE A ASSINATURA DO MÉTODO DO PORT. A FK
    // não olha `status`: uma nota ARQUIVADA ainda aponta para o item, então
    // remover o dia falharia no banco mesmo com a nota fora da vista. Uma
    // guarda que reusasse `planItemWritersByBook` (que filtra ACTIVE, e de
    // propósito) liberaria a remoção e o admin veria um 500.
    it('refuses even when the only note of the day is archived', async () => {
      await notes.save(
        aNoteOnDayTwo({
          status: 'ARCHIVED',
          archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );

      await expect(
        useCase.execute(validInput({ planItems: withoutDayTwo })),
      ).rejects.toBeInstanceOf(InvalidBookError);

      expect(plan.replaceForBookCalls).toBe(replaceCallsBefore);
      // A pré-condição que dá dente ao teste: pela outra leitura — a que a
      // sobreposição de tela usa — este dia não tem escritor nenhum.
      await expect(notes.planItemWritersByBook(BOOK_ID)).resolves.toEqual([]);
    });

    // Regra 22 — a mensagem diz QUANTOS dias.
    it('says how many days have notes', async () => {
      await notes.save(aNoteOnDayTwo({ id: 'note-dia-2' }));
      await notes.save(
        aNoteOnDayTwo({ id: 'note-dia-3', planItemId: DAY_THREE }),
      );

      const error = await caught(
        useCase.execute(
          validInput({ planItems: [{ date: '2026-10-01', title: 'C1' }] }),
        ),
      );

      expect(error).toBeInstanceOf(InvalidBookError);
      expect(error.message).toContain('2');
    });

    // Regra 22 — a mensagem é UM dia quando é um dia só. Sem este par, um
    // `${removeIds.length}` no lugar do `${withNotes.length}` passaria: o
    // rascunho acima remove os dois dias que têm nota.
    it('says one day when a single day has notes', async () => {
      await notes.save(aNoteOnDayTwo({ id: 'note-dia-2' }));

      const error = await caught(
        useCase.execute(
          validInput({ planItems: [{ date: '2026-10-01', title: 'C1' }] }),
        ),
      );

      // O rascunho remove DOIS dias (2 e 3) e só UM tem nota.
      expect(error.message).toContain('1');
      expect(error.message).not.toContain('2');
    });

    // Regra 22 — e NÃO cita autor nem conteúdo. O admin não precisa saber quem
    // escreveu para entender que não pode remover o dia (ADR 0002: dentro do
    // clube não há conteúdo privado, mas mensagem de erro não é tela de
    // leitura, e `error.message` é a única publicada na resposta — §6.2).
    it('never names the author nor quotes the content', async () => {
      await notes.save(
        aNoteOnDayTwo({
          userId: MEMBER_ID,
          title: 'Cap. 2 — o segredo',
          plainText: 'chorei nesta parte',
        }),
      );

      const { message } = await caught(
        useCase.execute(validInput({ planItems: withoutDayTwo })),
      );

      expect(message).not.toContain(MEMBER_ID);
      expect(message).not.toContain('chorei');
      expect(message).not.toContain('segredo');
      // Nem o id da nota, nem o id do dia: um id de item de plano na mensagem
      // seria conteúdo do clube vazando para o corpo de um 400.
      expect(message).not.toContain('note-');
      expect(message).not.toContain(DAY_TWO);
    });

    // Regra 20 — a nota de OUTRO dia não barra nada. Sem isto, um
    // `planItemIdsWithAnyNote` que ignorasse os ids pedidos (devolvendo todos)
    // passaria em todos os testes acima.
    it('lets a day go when the notes are all anchored on the survivors', async () => {
      await notes.save(
        aNoteOnDayTwo({ id: 'note-dia-1', planItemId: DAY_ONE }),
      );
      await notes.save(
        aNoteOnDayTwo({ id: 'note-dia-3', planItemId: DAY_THREE }),
      );

      const { removed } = await useCase.execute(
        validInput({ planItems: withoutDayTwo }),
      );

      expect(removed).toBe(1);
      expect(plan.removedIds).toEqual([DAY_TWO]);
    });

    // Regra 20 — a anotação AVULSA não ancora em dia nenhum, então não pode
    // impedir a remoção de um. No banco é o `IN (...)` contra coluna nula.
    it('is not blocked by a free note of the same book', async () => {
      await notes.save(
        aNoteOnDayTwo({ id: 'note-avulsa', kind: 'FREE', planItemId: null }),
      );

      const { removed } = await useCase.execute(
        validInput({ planItems: withoutDayTwo }),
      );

      expect(removed).toBe(1);
    });

    // O caso do ADR 0007 com anotações de verdade em cena: acrescentar um dia
    // na frente renumera os sobreviventes e não remove NADA, então a guarda
    // não tem o que barrar. É o caso dominante da tela de plano.
    it('lets a day be inserted in front while every survivor keeps its notes', async () => {
      await notes.save(
        aNoteOnDayTwo({ id: 'note-dia-1', planItemId: DAY_ONE }),
      );
      await notes.save(
        aNoteOnDayTwo({ id: 'note-dia-2', planItemId: DAY_TWO }),
      );

      const { planItems, created, removed } = await useCase.execute(
        validInput({
          planItems: [
            { date: '2026-09-30', title: 'Prólogo' },
            { date: '2026-10-01', title: 'Cap. 1' },
            { date: '2026-10-02', title: 'Cap. 2' },
            { date: '2026-10-03', title: 'Cap. 3' },
          ],
        }),
      );

      expect({ created, removed }).toEqual({ created: 1, removed: 0 });
      // Os ids que as anotações apontam sobreviveram, com o `order` novo.
      expect(byId(planItems, DAY_ONE)?.order).toBe(1);
      expect(byId(planItems, DAY_TWO)?.order).toBe(2);
      expect(plan.removedIds).toEqual([]);
    });

    // Regra 23 — o corte de tenant vem PRIMEIRO. Um admin de outro clube não
    // descobre, nem pela demora nem por diferença de erro, que o dia tem nota.
    it('never reads a note for an actor of another club', async () => {
      await notes.save(aNoteOnDayTwo());

      await expect(
        useCase.execute(
          validInput({
            actorUserId: OTHER_ADMIN_ID,
            planItems: withoutDayTwo,
          }),
        ),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(notes.planItemIdsWithAnyNoteCalls).toBe(0);
    });

    // Regra 23 — e a validação do rascunho também vem antes.
    it('never reads a note when the draft is malformed', async () => {
      await notes.save(aNoteOnDayTwo());

      await expect(
        useCase.execute(
          validInput({ planItems: [{ date: '2026-02-30', title: 'Cap. 1' }] }),
        ),
      ).rejects.toBeInstanceOf(InvalidBookError);

      expect(notes.planItemIdsWithAnyNoteCalls).toBe(0);
    });

    // Regra 23 — MEMBER também não. O papel é conferido antes de tudo.
    it('never reads a note for an actor whose role is MEMBER', async () => {
      await notes.save(aNoteOnDayTwo());

      await expect(
        useCase.execute(
          validInput({ actorUserId: MEMBER_ID, planItems: withoutDayTwo }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenRoleError);

      expect(notes.planItemIdsWithAnyNoteCalls).toBe(0);
    });
  });

  /**
   * ⚠️ **A SEGUNDA GUARDA (Tarefa 32c, regras 6–10)** — o caso irmão, e o que
   * ele conserta é um **500 mudo**.
   *
   * `ReadingLog.planItemId` tem FK com `onDelete: Restrict` (Tarefa 32), e a
   * guarda de nota **não vê** um dia que só tem leitura: `note.count` é zero
   * ali. O dia passava, batia na FK dentro do `replaceForBook` e virava erro de
   * banco — status 500, sem mensagem —, enquanto o caso da nota respondia 400
   * com uma frase clara. É caso de terça-feira: basta **uma** pessoa ter
   * marcado "li" sem escrever nada.
   *
   * O dado sempre esteve a salvo (o `replaceForBook` roda em `$transaction`, e
   * o teste de contrato prova que o plano fica intacto). O que estava errado
   * era o status e o silêncio.
   *
   * ⚠️ **A ORDEM ("a guarda só lê o log DEPOIS do corte de tenant, do papel e
   * da validação do rascunho") NÃO tem teste próprio aqui, e é de propósito: o
   * dono dela é o `expectNothingTouched()`.** A linha
   * `expect(logs.planItemIdsWithAnyReadingLogCalls).toBe(0)` que ele ganhou
   * cobre os **13** estados de erro que já chamavam o helper — livro
   * inexistente, livro arquivado, sem membership, membership arquivado, papel
   * MEMBER, clube alheio, e os sete formatos de rascunho inválido.
   *
   * Medido: o mutante que lê o log **antes** do `bookForActor` dá **17**
   * acusadores, e **16** deles são asserções de contador — 13 do helper e 3 de
   * testes de ordem escritos aqui, que eram cópia do mesmo cenário. Procurado e
   * **não encontrado** mutante que os três matassem e os 13 deixassem viver: o
   * contador conta a CHAMADA, não o resultado, então semear um log a mais não
   * acrescenta poder discriminante. Os três foram apagados na rodada de
   * correção — é o §7.1 (*extrair, não cobrir duas vezes*), e a extração já
   * tinha acontecido no helper.
   */
  describe('the guard that refuses to remove a day that has readings', () => {
    /** A leitura do dia 2 — o dia que os testes daqui tentam remover. */
    function aReadOfDayTwo(overrides: Partial<ReadingLog> = {}): ReadingLog {
      return aReadingLog({
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        planItemId: DAY_TWO,
        userId: MEMBER_ID,
        ...overrides,
      });
    }

    /** O rascunho que remove o dia 2 e mantém os dias 1 e 3. */
    const withoutDayTwo: PlanItemDraft[] = [
      { date: '2026-10-01', title: 'Cap. 1' },
      { date: '2026-10-03', title: 'Cap. 3' },
    ];

    // Regra 9 — o par POSITIVO, sem o qual uma guarda que recusasse tudo
    // passaria em todos os testes abaixo. A leitura está no dia 1, que fica.
    it('removes a day that nobody read, exactly as before', async () => {
      await logs.save(aReadOfDayTwo({ planItemId: DAY_ONE }));

      const { planItems, removed } = await useCase.execute(
        validInput({
          planItems: [
            { date: '2026-10-01', title: 'Cap. 1' },
            { date: '2026-10-02', title: 'Cap. 2' },
          ],
        }),
      );

      expect(planItems.map((item) => item.id)).toEqual([DAY_ONE, DAY_TWO]);
      expect(removed).toBe(1);
      expect(plan.removedIds).toEqual([DAY_THREE]);
    });

    /**
     * Regra 6 — e é `InvalidBookError` de propósito: ela já está mapeada em
     * 400, que é a única classe em que `error.message` sai na resposta (§6.2).
     * Classe nova não entra nesta fatia.
     *
     * ⚠️ **Asserta a FRASE, não só a classe.** A frase é a única coisa desta
     * fatia que o usuário lê, e a classe é a mesma nas duas guardas — ela não
     * distingue nada aqui. O `describe` de baixo prova que a mensagem não mente
     * nos três casos; esta linha põe o acusador também no caminho mais óbvio,
     * que é onde o próximo leitor vai procurar primeiro.
     */
    it('refuses to remove a day that somebody already read', async () => {
      await logs.save(aReadOfDayTwo());

      const error = await caught(
        useCase.execute(validInput({ planItems: withoutDayTwo })),
      );

      expect(error).toBeInstanceOf(InvalidBookError);
      expect(error.message).toBe(
        'cannot remove 1 reading plan day(s) that somebody already read',
      );
    });

    /**
     * ⚠️ **Regra 8 — a recusa vem ANTES de qualquer escrita, e a prova é a
     * CONTAGEM, não a ausência de erro** (§7.3).
     *
     * `plan.saved` inalterado não separa "não chamou o `replaceForBook`" de
     * "chamou e o fake foi atômico" — e é exatamente essa diferença que a
     * fatia existe para produzir: sem a guarda, o `replaceForBook` É chamado,
     * a FK estoura no meio da transação e o admin recebe 500.
     *
     * O `planItemIdsWithAnyReadingLogCalls === 1` é o outro lado: sem ele, um
     * `if` sempre-falso passaria neste teste por não ter chegado a escrever de
     * outro jeito.
     */
    it('writes nothing and removes nothing when it refuses', async () => {
      await logs.save(aReadOfDayTwo());

      await expect(
        useCase.execute(validInput({ planItems: withoutDayTwo })),
      ).rejects.toBeInstanceOf(InvalidBookError);

      expect(plan.saved).toEqual(planBefore);
      expect(plan.saveManyCalls).toBe(saveCallsBefore);
      expect(plan.replaceForBookCalls).toBe(replaceCallsBefore);
      expect(plan.removedIds).toEqual([]);
      expect(books.saved).toEqual([stored]);
      expect(logs.planItemIdsWithAnyReadingLogCalls).toBe(1);
    });

    // Regra 9 — a leitura de OUTRO dia não barra nada. Sem isto, um
    // `planItemIdsWithAnyReadingLog` que ignorasse os ids pedidos (devolvendo
    // todos) passaria em todos os testes acima.
    it('lets a day go when the readings are all anchored on the survivors', async () => {
      await logs.save(aReadOfDayTwo({ planItemId: DAY_ONE }));
      await logs.save(aReadOfDayTwo({ planItemId: DAY_THREE }));

      const { removed } = await useCase.execute(
        validInput({ planItems: withoutDayTwo }),
      );

      expect(removed).toBe(1);
      expect(plan.removedIds).toEqual([DAY_TWO]);
    });

    // Regra 10 — a mensagem diz QUANTOS dias. A frase INTEIRA, e não um
    // `toContain('2')`: esse casaria com "12", "20" e "21" — o lado negativo
    // que o teste irmão logo abaixo escreve à mão, e que aqui sai de graça.
    it('says how many days were already read', async () => {
      await logs.save(aReadOfDayTwo());
      await logs.save(aReadOfDayTwo({ planItemId: DAY_THREE }));

      const error = await caught(
        useCase.execute(
          validInput({ planItems: [{ date: '2026-10-01', title: 'C1' }] }),
        ),
      );

      expect(error).toBeInstanceOf(InvalidBookError);
      expect(error.message).toBe(
        'cannot remove 2 reading plan day(s) that somebody already read',
      );
    });

    // Regra 10 — e é UM dia quando é um dia só. Sem este par, um
    // `${removedIds.length}` no lugar do `${daysRead.length}` passaria: o
    // rascunho abaixo remove DOIS dias e só um foi lido.
    it('says one day when a single day was read', async () => {
      await logs.save(aReadOfDayTwo());

      const error = await caught(
        useCase.execute(
          validInput({ planItems: [{ date: '2026-10-01', title: 'C1' }] }),
        ),
      );

      expect(error.message).toContain('1');
      expect(error.message).not.toContain('2');
    });

    // Regra 10 — duas pessoas no MESMO dia são UM dia. O `Set` do repositório
    // é o dono disso, e este é o teste que o cobra pelo lado do produto: a
    // mensagem não pode dizer "2 dias" para um dia só.
    it('counts days, not readers', async () => {
      await logs.save(aReadOfDayTwo({ userId: MEMBER_ID }));
      await logs.save(aReadOfDayTwo({ userId: OWNER_ID }));

      const { message } = await caught(
        useCase.execute(validInput({ planItems: withoutDayTwo })),
      );

      expect(message).toContain('1');
      expect(message).not.toContain('2');
    });

    // Regra 10, decisão C — só a CONTAGEM. Nem quem leu, nem o id do dia:
    // `error.message` é a única publicada na resposta do 400 (§6.2), e o admin
    // não precisa saber quem leu para entender que não pode remover o dia.
    it('never names the reader nor the day', async () => {
      await logs.save(aReadOfDayTwo({ id: 'log-do-membro' }));

      const { message } = await caught(
        useCase.execute(validInput({ planItems: withoutDayTwo })),
      );

      expect(message).not.toContain(MEMBER_ID);
      expect(message).not.toContain(DAY_TWO);
      expect(message).not.toContain('log-');
    });
  });

  /**
   * ⚠️ **REGRA 10 — A MENSAGEM NÃO MENTE EM NENHUM DOS TRÊS CASOS**, e é por
   * isso que as guardas são DUAS com frases distintas (decisão B), e não uma
   * frase combinada.
   *
   * `error.message` é a única publicada ao cliente, e só na classe 400 (§6.2).
   * A frase que já existia diz *"…that already have notes"*: se um dia com
   * **só leitura** a reaproveitasse, a resposta **mentiria** para o admin — ele
   * abriria o dia procurando uma anotação que não existe. E uma frase única
   * ("notes or readings") não mente, mas obriga a adivinhar qual dos dois é:
   * são ações mentais diferentes ("alguém escreveu ali" × "alguém já leu
   * aquilo").
   *
   * Os três testes assertam a **mensagem**, não só a classe do erro — a classe
   * é `InvalidBookError` nos três, então ela não distingue nada aqui.
   */
  describe('the message never lies about which guard refused', () => {
    const withoutDayTwo: PlanItemDraft[] = [
      { date: '2026-10-01', title: 'Cap. 1' },
      { date: '2026-10-03', title: 'Cap. 3' },
    ];

    async function refusalFor(seed: () => Promise<unknown>): Promise<string> {
      await seed();
      const { message } = await caught(
        useCase.execute(validInput({ planItems: withoutDayTwo })),
      );
      return message;
    }

    it('talks about notes, and not about reading, when only a note anchors the day', async () => {
      const message = await refusalFor(() =>
        notes.save(
          aNote({
            kind: 'PLAN',
            clubId: CLUB_ID,
            bookId: BOOK_ID,
            planItemId: DAY_TWO,
            userId: MEMBER_ID,
          }),
        ),
      );

      expect(message).toContain('that already have notes');
      expect(message).not.toContain('already read');
    });

    it('talks about reading, and not about notes, when only a reading anchors the day', async () => {
      const message = await refusalFor(() =>
        logs.save(
          aReadingLog({
            clubId: CLUB_ID,
            bookId: BOOK_ID,
            planItemId: DAY_TWO,
            userId: MEMBER_ID,
          }),
        ),
      );

      expect(message).toContain('that somebody already read');
      expect(message).not.toContain('notes');
    });

    /**
     * Decisão D — quando o dia tem os DOIS, a mensagem é a de **nota**, que é
     * o comportamento que já existia. Manter a ordem é o que faz esta fatia não
     * mexer num caso que já funcionava: ordem estável é menos churn de teste e
     * menos surpresa para quem já aprendeu a frase.
     *
     * E a mensagem continua sem mentir: o dia **tem** nota.
     */
    it('keeps the note message when the day has both', async () => {
      const message = await refusalFor(async () => {
        await notes.save(
          aNote({
            kind: 'PLAN',
            clubId: CLUB_ID,
            bookId: BOOK_ID,
            planItemId: DAY_TWO,
            userId: MEMBER_ID,
          }),
        );
        await logs.save(
          aReadingLog({
            clubId: CLUB_ID,
            bookId: BOOK_ID,
            planItemId: DAY_TWO,
            userId: MEMBER_ID,
          }),
        );
      });

      expect(message).toContain('that already have notes');
      expect(message).not.toContain('already read');
    });
  });

  // A segunda chamada com o MESMO plano é idempotente: nada criado, nada
  // removido, mesmos ids. É o retry de um "salvar" que o app offline pode
  // reenviar.
  it('is idempotent when the same replacement is sent twice', async () => {
    const draft: PlanItemDraft[] = [
      { date: '2026-10-02', title: 'Cap. 2' },
      { date: '2026-10-05', title: 'Cap. 5' },
    ];

    const first = await useCase.execute(validInput({ planItems: draft }));
    const second = await useCase.execute(validInput({ planItems: draft }));

    expect(second.planItems.map((item) => item.id)).toEqual(
      first.planItems.map((item) => item.id),
    );
    expect(second).toMatchObject({ created: 0, updated: 2, removed: 0 });
  });
});
