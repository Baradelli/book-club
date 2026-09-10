import { beforeEach, describe, expect, it } from 'vitest';

import {
  BookNotFoundError,
  ForbiddenRoleError,
  NotAMemberError,
  PlanItemNotFoundError,
} from '../../domain/errors';
import {
  aBook,
  aMembership,
  aPlanItem,
  aReadingLog,
  required,
} from '../../test-support/builders';
import { BookRepositoryFake } from '../_fakes/book-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { ReadingLogRepositoryFake } from '../_fakes/reading-log-repository-fake';
import { ReadingPlanItemRepositoryFake } from '../_fakes/reading-plan-item-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { UnmarkReadInput } from '../unmark-read';
import { UnmarkRead } from '../unmark-read';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const BOOK_ID = 'book-1';
const OTHER_CLUB_BOOK_ID = 'book-do-outro-clube';
const ARCHIVED_BOOK_ID = 'book-arquivado';

const DAY_1 = 'plan-dia-1';
const DAY_2 = 'plan-dia-2';
const OTHER_CLUB_DAY = 'plan-dia-do-outro-clube';
const ARCHIVED_BOOK_DAY = 'plan-dia-do-livro-arquivado';

const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MARIA_ID = 'user-maria';
const MARCOS_ID = 'user-marcos';
const OTHER_CLUB_MEMBER_ID = 'user-de-outro-clube';

const MARIA_LOG_ID = 'log-da-maria';

describe('UnmarkRead', () => {
  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let planItems: ReadingPlanItemRepositoryFake;
  let logs: ReadingLogRepositoryFake;
  let useCase: UnmarkRead;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    planItems = new ReadingPlanItemRepositoryFake();
    logs = new ReadingLogRepositoryFake();
    useCase = new UnmarkRead(
      new AssertMembership(memberships),
      books,
      planItems,
      logs,
    );

    await books.save(aBook({ id: BOOK_ID, clubId: CLUB_ID }));
    await books.save(aBook({ id: OTHER_CLUB_BOOK_ID, clubId: OTHER_CLUB_ID }));
    await books.save(
      aBook({
        id: ARCHIVED_BOOK_ID,
        clubId: CLUB_ID,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    );

    await planItems.saveMany([
      aPlanItem({ id: DAY_1, bookId: BOOK_ID, order: 0, date: '2026-10-01' }),
      aPlanItem({ id: DAY_2, bookId: BOOK_ID, order: 1, date: '2026-10-02' }),
      aPlanItem({
        id: OTHER_CLUB_DAY,
        bookId: OTHER_CLUB_BOOK_ID,
        order: 0,
        date: '2026-10-01',
      }),
      aPlanItem({
        id: ARCHIVED_BOOK_DAY,
        bookId: ARCHIVED_BOOK_ID,
        order: 0,
        date: '2026-10-01',
      }),
    ]);

    for (const [userId, role] of [
      [OWNER_ID, 'OWNER'],
      [ADMIN_ID, 'ADMIN'],
      [MARIA_ID, 'MEMBER'],
      [MARCOS_ID, 'MEMBER'],
    ] as const) {
      await memberships.save(aMembership({ userId, clubId: CLUB_ID, role }));
    }
    await memberships.save(
      aMembership({
        userId: OTHER_CLUB_MEMBER_ID,
        clubId: OTHER_CLUB_ID,
        role: 'MEMBER',
      }),
    );
  });

  /** Fábrica, nunca `const` de `describe` (CONVENCOES-CODIGO §7.7). */
  function validInput(
    overrides: Partial<UnmarkReadInput> = {},
  ): UnmarkReadInput {
    return { actorUserId: MARIA_ID, planItemId: DAY_1, ...overrides };
  }

  /** A leitura da Maria no dia 1, já gravada — o estado que se desmarca. */
  async function givenMariaMarkedDay1(): Promise<void> {
    await logs.save(
      aReadingLog({
        id: MARIA_LOG_ID,
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        userId: MARIA_ID,
        planItemId: DAY_1,
      }),
    );
  }

  describe('permission and tenant', () => {
    // Item de plano inexistente é 404, e antes de qualquer apagar.
    it('rejects a plan item that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ planItemId: 'plan-fantasma' })),
      ).rejects.toBeInstanceOf(PlanItemNotFoundError);

      expect(logs.deleteCalls).toBe(0);
    });

    // O comportamento herdado do `bookForActor`, FIXADO e não redecidido:
    // livro arquivado é invisível até o MVP 4, também para desmarcar.
    it('rejects a plan item of an archived book', async () => {
      await expect(
        useCase.execute(validInput({ planItemId: ARCHIVED_BOOK_DAY })),
      ).rejects.toBeInstanceOf(BookNotFoundError);

      expect(logs.deleteCalls).toBe(0);
    });

    /**
     * ⚠️ Regra 16 — **o corte de tenant vale igual aqui, e vem antes de tudo**,
     * provado pelo contador (§7.3): "recusou antes de ler" e "leu e depois
     * recusou" dão o mesmo erro ao cliente e são coisas diferentes.
     */
    it('rejects a member of another club before reading or deleting anything', async () => {
      await givenMariaMarkedDay1();

      await expect(
        useCase.execute(validInput({ actorUserId: OTHER_CLUB_MEMBER_ID })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(logs.deleteCalls).toBe(0);
      expect(logs.byPlanItemAndUserCalls).toBe(0);
      expect(logs.saved.map((log) => log.id)).toEqual([MARIA_LOG_ID]);
    });

    // Regra 16 — 404, e não 403.
    it('rejects a member of another club with 404, not 403', async () => {
      const error: unknown = await useCase
        .execute(validInput({ actorUserId: OTHER_CLUB_MEMBER_ID }))
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotAMemberError);
      expect(error).not.toBeInstanceOf(ForbiddenRoleError);
    });

    // Regra 16 — e o caminho inverso.
    it('rejects unmarking a plan item of another club', async () => {
      await expect(
        useCase.execute(validInput({ planItemId: OTHER_CLUB_DAY })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(logs.deleteCalls).toBe(0);
      expect(logs.byPlanItemAndUserCalls).toBe(0);
    });

    // Regra 16
    it('rejects an actor with no membership at all', async () => {
      await givenMariaMarkedDay1();

      await expect(
        useCase.execute(validInput({ actorUserId: 'user-forasteiro' })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(logs.deleteCalls).toBe(0);
    });

    // Regra 16 — membership arquivado não é membership (ADR 0009: o guard olha
    // o status do `Membership`, nunca o do `Club`).
    it('rejects an actor whose membership is archived', async () => {
      await givenMariaMarkedDay1();
      await memberships.save(
        aMembership({
          userId: MARIA_ID,
          clubId: CLUB_ID,
          role: 'MEMBER',
          status: 'ARCHIVED',
        }),
      );

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        NotAMemberError,
      );

      expect(logs.deleteCalls).toBe(0);
      expect(logs.saved.map((log) => log.id)).toEqual([MARIA_LOG_ID]);
    });

    /**
     * ⚠️ Regra 16 — **o lado POSITIVO do contador**, sem o qual todo
     * `deleteCalls === 0` acima passa por acidente se alguém apagar o
     * incremento do fake (§7.3: um contador só afirmado como `toBe(0)` é meio
     * contador, e aí ele é a asserção vazia do §7.4).
     */
    it('deletes exactly once on the happy path', async () => {
      await givenMariaMarkedDay1();

      await useCase.execute(validInput());

      expect(logs.deleteCalls).toBe(1);
      expect(logs.byPlanItemAndUserCalls).toBe(1);
    });

    /**
     * Desmarcar **não exige papel**, e papel nenhum substitui autoria: cada um
     * desmarca a sua leitura, e o `OWNER` não é exceção — ele desmarca a DELE.
     */
    it.each([
      ['MEMBER', MARIA_ID],
      ['ADMIN', ADMIN_ID],
      ['OWNER', OWNER_ID],
    ])('lets the %s unmark their own reading', async (_label, actorUserId) => {
      await logs.save(
        aReadingLog({
          id: `log-${actorUserId}`,
          userId: actorUserId,
          planItemId: DAY_1,
        }),
      );

      await useCase.execute(validInput({ actorUserId }));

      expect(logs.saved).toEqual([]);
    });
  });

  describe('unmarking', () => {
    /**
     * Regra 13 — **hard delete de verdade**: a linha some, e o
     * `byPlanItemAndUser` devolve `null`. Nada de `status`/`archivedAt` — a
     * entidade nem os tem. É a exceção documentada ao soft delete do projeto.
     */
    it('removes the row for good', async () => {
      await givenMariaMarkedDay1();

      await useCase.execute(validInput());

      expect(await logs.byPlanItemAndUser(DAY_1, MARIA_ID)).toBeNull();
      expect(logs.saved).toEqual([]);
    });

    // E só a linha daquele dia: desmarcar sexta não desmarca sábado.
    it('removes only the day it was asked about', async () => {
      await givenMariaMarkedDay1();
      await logs.save(
        aReadingLog({
          id: 'log-da-maria-dia-2',
          userId: MARIA_ID,
          planItemId: DAY_2,
        }),
      );

      await useCase.execute(validInput({ planItemId: DAY_1 }));

      expect(logs.saved.map((log) => log.id)).toEqual(['log-da-maria-dia-2']);
    });

    /**
     * ⚠️ Regra 14 — **IDEMPOTENTE E SEM TOQUE NO BANCO quando não há o que
     * apagar.** As duas metades importam.
     *
     * Que não lança é o que o `await` sem `rejects` já cobra: uma rejeição
     * falharia o teste. E o `deleteCalls === 0` é a outra metade — sem ele, um
     * `delete` de id inexistente disfarçado de no-op passaria por igual, e a
     * decisão C ("nada para apagar não é erro") ficaria provada por um
     * comportamento que gasta uma ida ao banco por toque.
     */
    it('does nothing and does not throw when the day was never marked', async () => {
      await useCase.execute(validInput());

      // ⚠️ O `byPlanItemAndUserCalls === 1` é o que separa "não havia o que
      // apagar" de "o UseCase não fez NADA": sem log gravado, um `execute`
      // mutilado para no-op deixa `deleteCalls` e `saved` idênticos aos do
      // caminho real — medido, era o único teste do arquivo que sobrevivia ao
      // mutante no-op. Ele consultou; é isso que o contador vê.
      expect(logs.byPlanItemAndUserCalls).toBe(1);
      expect(logs.deleteCalls).toBe(0);
      expect(logs.saved).toEqual([]);
    });

    // Regra 14 — desmarcar duas vezes é a mesma coisa que desmarcar uma: é o
    // segundo toque, e é o retry da fila offline.
    it('is idempotent: unmarking twice leaves the same state and deletes once', async () => {
      await givenMariaMarkedDay1();

      await useCase.execute(validInput());
      await useCase.execute(validInput());

      expect(logs.saved).toEqual([]);
      expect(logs.deleteCalls).toBe(1);
    });

    /**
     * ⚠️ Regra 15 — **O LOG DE OUTRA PESSOA NÃO É ALCANÇADO**, e o
     * `byPlanItemAndUserCalls === 1` é o que prova.
     *
     * ⚠️ **A palavra "estrutural" da decisão E é otimista, e a auditoria mediu
     * o preço.** É verdade que a **assinatura do port** não oferece caminho
     * largo — não existe método que aceite só `planItemId`. Mas o UseCase tem
     * mais coisa em escopo do que o ator, e o `bookForActor` devolve um `Book`
     * com `createdById`. O mutante do §7.5 traduzido para cá,
     *
     * ```ts
     * const existing =
     *   (await this.logs.byPlanItemAndUser(planItem.id, input.actorUserId)) ??
     *   (await this.logs.byPlanItemAndUser(planItem.id, book.createdById));
     * ```
     *
     * passava em **1377/1377** — zero acusadores. É o `input.userId ??
     * req.user.sub` outra vez: comporta-se normalmente sempre que o ator TEM
     * log, e só alcança o alheio quando ele não tem — que é exatamente a
     * precondição destes testes.
     *
     * ⚠️ E os acusadores que a primeira rodada mediu eram do **FAKE**: mutar o
     * `byPlanItemAndUser` do fake prova que o fake guarda o par, **não** que o
     * UseCase o usa. É o §7.9 — a guarda estava onde é fácil de escrever, não
     * onde a propriedade é decidível. Quem a torna decidível é o contador
     * (§7.3), na sua terceira forma: ele separa "não alcançou" de "alcançou por
     * OUTRO caminho e não achou".
     *
     * A asserção de estado é sobre o fake, e não sobre ausência de erro:
     * `resolves.not.toBeInstanceOf(...)` sobre um retorno que nunca poderia ser
     * um `Error` não asserta nada (§7.4) — diria só "não rejeitou", com um nome
     * de teste prometendo uma regra de autorização.
     */
    it('never lets Marcos unmark what Maria read on the same day', async () => {
      await givenMariaMarkedDay1();

      await useCase.execute(validInput({ actorUserId: MARCOS_ID }));

      // ⚠️ ANTES de qualquer leitura do próprio teste: o `byPlanItemAndUser`
      // lá embaixo também conta, e leria o contador já sujo.
      expect(logs.byPlanItemAndUserCalls).toBe(1);
      expect(logs.deleteCalls).toBe(0);
      expect(logs.saved.map((log) => log.id)).toEqual([MARIA_LOG_ID]);
      expect(required(logs.saved[0]).userId).toBe(MARIA_ID);
      expect(await logs.byPlanItemAndUser(DAY_1, MARIA_ID)).not.toBeNull();
    });

    /**
     * ⚠️ Regra 15 — e nem sendo `OWNER` do clube: papel de admin manda no livro
     * e no plano, não no que as pessoas registram (`CLAUDE.md`, ADR 0002).
     *
     * O `byPlanItemAndUserCalls === 1` está aqui pelo motivo do teste acima —
     * **uma** consulta por `execute`, e ela é a do ator.
     */
    it('never lets the OWNER of the club unmark what Maria read', async () => {
      await givenMariaMarkedDay1();

      await useCase.execute(validInput({ actorUserId: OWNER_ID }));

      expect(logs.byPlanItemAndUserCalls).toBe(1);
      expect(logs.deleteCalls).toBe(0);
      expect(logs.saved.map((log) => log.id)).toEqual([MARIA_LOG_ID]);
    });

    /**
     * ⚠️ Regra 12 — **não há `logId` no input**, e é isso que fecha a porta por
     * construção. Um id de log contrabandeado não alcança a linha da Maria: o
     * UseCase nem tem por onde recebê-lo.
     *
     * O `byPlanItemAndUserCalls === 1` está aqui pelo motivo dos dois testes
     * acima: sem ele, este teste também sobrevivia ao fallback do §7.5.
     */
    it('ignores a logId smuggled into the input', async () => {
      await givenMariaMarkedDay1();

      const smuggled = {
        actorUserId: MARCOS_ID,
        planItemId: DAY_1,
        // @ts-expect-error o input não declara logId — a identidade é o par
        // (planItemId, actorUserId)
        logId: MARIA_LOG_ID,
      } satisfies UnmarkReadInput;

      await useCase.execute(smuggled);

      expect(logs.byPlanItemAndUserCalls).toBe(1);
      expect(logs.deleteCalls).toBe(0);
      expect(logs.saved.map((log) => log.id)).toEqual([MARIA_LOG_ID]);
    });

    /**
     * Regra 15 — e a Maria continua desmarcando a DELA, com o log do Marcos no
     * mesmo dia. Sem este par positivo, uma implementação que não apagasse nada
     * passaria em todos os testes acima.
     */
    it('unmarks only the reading of the actor when both read the same day', async () => {
      await givenMariaMarkedDay1();
      await logs.save(
        aReadingLog({
          id: 'log-do-marcos',
          userId: MARCOS_ID,
          planItemId: DAY_1,
        }),
      );

      await useCase.execute(validInput({ actorUserId: MARIA_ID }));

      expect(logs.saved.map((log) => log.id)).toEqual(['log-do-marcos']);
      expect(await logs.byPlanItemAndUser(DAY_1, MARIA_ID)).toBeNull();
      expect(await logs.byPlanItemAndUser(DAY_1, MARCOS_ID)).not.toBeNull();
    });
  });

  // Estado acidental entre chamadas seria bug de produção invisível: a Tarefa
  // 32 compõe o UseCase uma vez e o reusa por request.
  it('does not leak state between two executes of the same instance', async () => {
    await givenMariaMarkedDay1();
    await logs.save(
      aReadingLog({
        id: 'log-do-marcos-dia-2',
        userId: MARCOS_ID,
        planItemId: DAY_2,
      }),
    );

    await useCase.execute(validInput({ actorUserId: MARIA_ID }));
    await useCase.execute(
      validInput({ actorUserId: MARCOS_ID, planItemId: DAY_2 }),
    );

    expect(logs.saved).toEqual([]);
    expect(logs.deleteCalls).toBe(2);
  });
});
