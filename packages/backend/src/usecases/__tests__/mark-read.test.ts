import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BookNotFoundError,
  ForbiddenRoleError,
  NotAMemberError,
  PlanItemNotFoundError,
} from '../../domain/errors';
import { installAdvancingClock } from '../../test-support/advancing-clock';
import {
  aBook,
  aMembership,
  aPlanItem,
  required,
} from '../../test-support/builders';
import { BookRepositoryFake } from '../_fakes/book-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { ReadingLogRepositoryFake } from '../_fakes/reading-log-repository-fake';
import { ReadingPlanItemRepositoryFake } from '../_fakes/reading-plan-item-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { MarkReadInput } from '../mark-read';
import { MarkRead } from '../mark-read';

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
const MEMBER_ID = 'user-maria';
const OTHER_MEMBER_ID = 'user-marcos';
const OTHER_CLUB_MEMBER_ID = 'user-de-outro-clube';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('MarkRead', () => {
  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let planItems: ReadingPlanItemRepositoryFake;
  let logs: ReadingLogRepositoryFake;
  let useCase: MarkRead;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    planItems = new ReadingPlanItemRepositoryFake();
    logs = new ReadingLogRepositoryFake();
    useCase = new MarkRead(
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
      [MEMBER_ID, 'MEMBER'],
      [OTHER_MEMBER_ID, 'MEMBER'],
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

  // O stub de relógio do teste da regra 10 é GLOBAL: sem isto ele vazaria para
  // os testes seguintes do arquivo, que leem o relógio de verdade.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Fábrica, nunca `const` de `describe` (CONVENCOES-CODIGO §7.7). */
  function validInput(overrides: Partial<MarkReadInput> = {}): MarkReadInput {
    return { actorUserId: MEMBER_ID, planItemId: DAY_1, ...overrides };
  }

  describe('permission and tenant', () => {
    /**
     * Regra 4 — item de plano inexistente é 404, e **antes de qualquer
     * escrita**. Não cobre "item de outro clube": esse corte é do
     * `bookForActor`, logo abaixo.
     */
    it('rejects a plan item that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ planItemId: 'plan-fantasma' })),
      ).rejects.toBeInstanceOf(PlanItemNotFoundError);

      expect(logs.saveCalls).toBe(0);
    });

    /**
     * Regra 7 — livro arquivado: o `bookForActor` já recusa com
     * `BookNotFoundError`, e este teste **FIXA** o comportamento herdado em vez
     * de o redecidir. Arquivado é invisível até o MVP 4, também para marcar
     * leitura.
     */
    it('rejects a plan item of an archived book', async () => {
      await expect(
        useCase.execute(validInput({ planItemId: ARCHIVED_BOOK_DAY })),
      ).rejects.toBeInstanceOf(BookNotFoundError);

      expect(logs.saveCalls).toBe(0);
    });

    /**
     * ⚠️ Regra 5 — **O CORTE DE TENANT VEM ANTES DA ESCRITA, E ANTES DA
     * LEITURA**, e é o contador que prova (§7.3): "recusou antes de ler" e
     * "leu e depois recusou" dão o **mesmo erro** ao cliente e são coisas
     * diferentes — a segunda trafega o registro de leitura de um clube para
     * quem não é dele antes de o descartar.
     */
    it('rejects a member of another club before reading or writing anything', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: OTHER_CLUB_MEMBER_ID })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(logs.saveCalls).toBe(0);
      expect(logs.byPlanItemAndUserCalls).toBe(0);
    });

    // Regra 5 — 404, e não 403: o membro do outro clube é membro de verdade, e
    // a diferença entre os dois status confirmaria que aquele dia existe.
    it('rejects a member of another club with 404, not 403', async () => {
      const error: unknown = await useCase
        .execute(validInput({ actorUserId: OTHER_CLUB_MEMBER_ID }))
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotAMemberError);
      expect(error).not.toBeInstanceOf(ForbiddenRoleError);
    });

    // Regra 5 — o caminho inverso: o membro do clube 1 não marca um dia do
    // plano do clube 2 nem sabendo o id do item.
    it('rejects marking a plan item of another club', async () => {
      await expect(
        useCase.execute(validInput({ planItemId: OTHER_CLUB_DAY })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(logs.saveCalls).toBe(0);
      expect(logs.byPlanItemAndUserCalls).toBe(0);
    });

    // Regra 5
    it('rejects an actor with no membership at all', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: 'user-forasteiro' })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(logs.saveCalls).toBe(0);
    });

    // Regra 5 — membership arquivado não é membership (ADR 0009: o guard olha
    // o status do `Membership`, nunca o do `Club`).
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

      expect(logs.saveCalls).toBe(0);
    });

    /**
     * ⚠️ Regra 5 — **o lado POSITIVO dos contadores**, sem o qual todo
     * `saveCalls === 0` acima passa por acidente se alguém apagar o incremento
     * do fake (§7.3: um contador só afirmado como `toBe(0)` é meio contador, e
     * aí ele é a asserção vazia do §7.4).
     *
     * ⚠️ **O `byPlanItemAndUserCalls === 1` daqui acusa o fallback do §7.5 por
     * COINCIDÊNCIA de fixture, e é por isso que ele não fica sozinho.** No
     * caminho feliz o ator ainda não tem log, então um
     * `byPlanItemAndUser(dia, ator) ?? byPlanItemAndUser(dia, outraPessoa)`
     * dispara o segundo lado e o contador anda. Quando o ator **tem** log, o
     * `??` curto-circuita e ninguém vê — foi exatamente assim que o mesmo
     * mutante passou em 1377/1377 no `unmarkRead`. A outra metade está no
     * `marks twice without writing twice`, que conta a consulta do caminho
     * IDEMPOTENTE.
     */
    it('writes exactly once on the happy path', async () => {
      await useCase.execute(validInput());

      expect(logs.saveCalls).toBe(1);
      expect(logs.byPlanItemAndUserCalls).toBe(1);
      expect(logs.saved).toHaveLength(1);
    });

    /**
     * Regra 6 — **não exige papel**: `MEMBER` marca. Papel de admin manda no
     * livro e no plano, não no que as pessoas registram — o mesmo argumento do
     * `upsertPlanNote`.
     *
     * O `saved` é assertado junto porque, só com `log.userId`, o teste
     * sobrevive a um UseCase que devolve o log e **não grava**: o nome promete
     * "marca o dia", e marcar é a linha.
     */
    it.each([
      ['MEMBER', MEMBER_ID],
      ['ADMIN', ADMIN_ID],
      ['OWNER', OWNER_ID],
    ])('lets the %s mark the day as read', async (_label, actorUserId) => {
      const { log } = await useCase.execute(validInput({ actorUserId }));

      expect(log.userId).toBe(actorUserId);
      expect(logs.saved).toHaveLength(1);
      expect(required(logs.saved[0]).userId).toBe(actorUserId);
    });

    /**
     * Regra 3 — contrabando, com o ator LEGÍTIMO e assertado na LINHA GRAVADA
     * (§7.5). Um teste com ator de fora morreria no guard e nunca chegaria aos
     * campos que são escritos, então não provaria nada sobre eles.
     *
     * O mutante perigoso não é `input.userId` cru: é
     * `input.userId ?? input.actorUserId`, o envenenamento com fallback, que se
     * comporta normalmente em todo teste que não manda o campo.
     */
    it('ignores a userId, a clubId and a bookId smuggled into the input', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        planItemId: DAY_1,
        // @ts-expect-error nenhum dos três existe no input: o autor é o ator, e
        // o clube e o livro vêm do item do plano
        userId: OWNER_ID,
        clubId: OTHER_CLUB_ID,
        bookId: OTHER_CLUB_BOOK_ID,
      } satisfies MarkReadInput;

      const { log } = await useCase.execute(smuggled);

      expect(log.userId).toBe(MEMBER_ID);
      expect(log.clubId).toBe(CLUB_ID);
      expect(log.bookId).toBe(BOOK_ID);
      expect(required(logs.saved[0]).userId).toBe(MEMBER_ID);
      expect(required(logs.saved[0]).clubId).toBe(CLUB_ID);
      expect(required(logs.saved[0]).bookId).toBe(BOOK_ID);
    });

    // A OUTRA coisa que o `clubId` contrabandeado não compra: o corte de tenant.
    it('does not let a smuggled clubId buy a way past the tenant cut', async () => {
      const smuggled = {
        actorUserId: OTHER_CLUB_MEMBER_ID,
        planItemId: DAY_1,
        // @ts-expect-error o input não declara clubId — ele vem de book.clubId
        clubId: OTHER_CLUB_ID,
      } satisfies MarkReadInput;

      await expect(useCase.execute(smuggled)).rejects.toBeInstanceOf(
        NotAMemberError,
      );
      expect(logs.saveCalls).toBe(0);
    });

    /**
     * Regra 3 — o `readAt` é do RELÓGIO, e não do cliente: um instante vindo do
     * corpo deixaria a pessoa antedatar a leitura, e o `readAt` é justamente o
     * dado que a supressão anti-culpa do lembrete (Bloco I) vai consultar.
     */
    it('ignores a readAt and an id smuggled into the input', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        planItemId: DAY_1,
        // @ts-expect-error nenhum dos dois existe no input
        readAt: new Date('1999-01-01T00:00:00.000Z'),
        id: 'log-escolhido-pelo-cliente',
      } satisfies MarkReadInput;

      const { log } = await useCase.execute(smuggled);

      expect(log.id).not.toBe('log-escolhido-pelo-cliente');
      expect(log.id).toMatch(UUID);
      expect(log.readAt.getFullYear()).toBeGreaterThan(2000);
      expect(required(logs.saved[0]).readAt.getFullYear()).toBeGreaterThan(
        2000,
      );
    });
  });

  describe('marking', () => {
    /**
     * Regra 8 — a primeira marcação: `created: true`, `id` de `randomUUID()`,
     * `userId` do ator e `clubId`/`bookId` vindos do LIVRO do item.
     */
    it('creates the log with the fields the domain decides', async () => {
      const { log, created } = await useCase.execute(validInput());

      expect(created).toBe(true);
      expect(log.id).toMatch(UUID);
      expect(log.userId).toBe(MEMBER_ID);
      expect(log.planItemId).toBe(DAY_1);
      expect(log.bookId).toBe(BOOK_ID);
      expect(log.clubId).toBe(CLUB_ID);
      expect(logs.saved).toEqual([log]);
    });

    /**
     * Regra 1 — a entidade tem **exatamente** seis campos, e nenhum instante
     * nem status a mais. Um `status`/`archivedAt`/`updatedAt`/`createdAt` que
     * alguém acrescentasse ao objeto gravado apareceria aqui.
     *
     * A asserção é sobre as CHAVES da linha gravada, e não sobre o tipo: o
     * `ReadingLog` não tem esses campos, então o compilador já recusa o literal
     * — mas o objeto que chega ao `save` é montado no UseCase, e um campo a
     * mais atravessaria por variável (o buraco medido no §7.1.1).
     */
    it('stores exactly the six fields of the entity, with no status and no other instant', async () => {
      await useCase.execute(validInput());

      expect(Object.keys(required(logs.saved[0])).sort()).toEqual([
        'bookId',
        'clubId',
        'id',
        'planItemId',
        'readAt',
        'userId',
      ]);
    });

    /**
     * ⚠️ Regra 9 — **IDEMPOTÊNCIA COM CONTADOR, não só com igualdade.**
     *
     * Marcar duas vezes (dois toques, ou o retry da fila offline) devolve o
     * MESMO `log.id` com `created: false` **e** `saveCalls === 1`: a segunda
     * chamada não escreve. Sem o contador, um `save` que sobrescrevesse a mesma
     * linha passaria por idempotente — §7.3, "não chamou" × "chamou e não mudou
     * nada", e "chamou à toa" é um `UPDATE` por toque.
     *
     * ⚠️ **UMA consulta por `execute`, e é aqui que essa metade é decidível.**
     * O `writes exactly once on the happy path` conta a consulta do caminho de
     * CRIAÇÃO, onde o ator ainda não tem log — e lá um
     * `byPlanItemAndUser(dia, ator) ?? byPlanItemAndUser(dia, outraPessoa)`
     * acusa por coincidência de fixture. Na segunda chamada o ator TEM log, o
     * `??` curto-circuita, e só um contador escrito **neste** cenário separa
     * "uma consulta por toque" de "duas na primeira e uma na segunda".
     */
    it('marks twice without writing twice, and gives back the same log', async () => {
      const first = await useCase.execute(validInput());

      const second = await useCase.execute(validInput());

      expect(second.created).toBe(false);
      expect(second.log.id).toBe(first.log.id);
      expect(second.log.readAt.getTime()).toBe(first.log.readAt.getTime());
      expect(logs.saveCalls).toBe(1);
      expect(logs.byPlanItemAndUserCalls).toBe(2);
      expect(logs.saved).toHaveLength(1);
    });

    // E a terceira vez também é inofensiva: nada de escrita acumulada.
    it('stays at one row and one write after three marks', async () => {
      await useCase.execute(validInput());
      await useCase.execute(validInput());
      await useCase.execute(validInput());

      expect(logs.saveCalls).toBe(1);
      expect(logs.saved).toHaveLength(1);
    });

    /**
     * ⚠️ Regra 10 — **`readAt` vem de UMA leitura de relógio, provada por
     * CONTAGEM.** É a 5ª aparição do §7.8.
     *
     * `expect(a).toEqual(b)` entre dois instantes **NÃO** prova "um relógio
     * só": duas chamadas a `new Date()` no mesmo tick devolvem o MESMO
     * milissegundo, e na Tarefa 22 o mutante passou em 1206/1206, três vezes.
     * O `installAdvancingClock` faz cada leitura sem argumento andar
     * `CLOCK_TICK_MS`, e **conta** — então uma segunda leitura muda `reads`.
     *
     * O esperado é `clock.at(1)`, derivado do `CLOCK_BASE_ISO` e **não** do
     * código sob teste, e a precondição "duas leituras consecutivas diferem" é
     * o primeiro teste de `advancing-clock.test.ts`.
     *
     * ⚠️ A spec da tarefa pede `clock.at(0)`, e isso **não passa**: `at(n)` é o
     * instante da n-ésima leitura, com `n` começando em 1 — `at(0)` é o
     * instante ANTES da primeira leitura, que nenhum `new Date()` devolve. O
     * que a spec quer (o esperado sai de uma constante, e não do código) é o
     * que `at(1)` dá.
     *
     * `reads` é 1 e não mais porque este é o único `new Date()` sem argumento
     * do caminho: o `clone` do fake reconstrói `Date` a partir de `Date`.
     */
    it('reads the clock exactly once and stamps readAt with it', async () => {
      const clock = installAdvancingClock();

      const { log } = await useCase.execute(validInput());

      expect(clock.reads).toBe(1);
      expect(log.readAt.getTime()).toBe(clock.at(1));
      expect(required(logs.saved[0]).readAt.getTime()).toBe(clock.at(1));
    });

    // O complemento do teste acima, sem stub: o instante gravado é AGORA, e cai
    // dentro da janela do `execute`.
    it('stamps readAt with now', async () => {
      const before = Date.now();

      const { log } = await useCase.execute(validInput());

      expect(log.readAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(log.readAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    /**
     * Regra 11 — duas pessoas marcam o mesmo dia: **duas** linhas, e nenhuma
     * pisa na outra. É o caso central do produto (todo mundo lê o mesmo
     * trecho), e é a direção em que um fake restritivo demais esconderia o bug
     * com a suíte verde (§7.1).
     */
    it('keeps one row per person on the same day', async () => {
      const mine = await useCase.execute(
        validInput({ actorUserId: MEMBER_ID }),
      );
      const theirs = await useCase.execute(
        validInput({ actorUserId: OTHER_MEMBER_ID }),
      );

      expect(theirs.created).toBe(true);
      expect(theirs.log.id).not.toBe(mine.log.id);
      expect(logs.saved).toHaveLength(2);
      // Ordenado antes de comparar: o assunto é QUEM marcou, não a ordem — e a
      // enumeração do fake é a armadilha invertida do §7.2.
      expect(logs.saved.map((log) => log.userId).sort()).toEqual(
        [MEMBER_ID, OTHER_MEMBER_ID].sort(),
      );
    });

    // Regra 11 — e uma pessoa marca dois dias do mesmo livro: duas linhas.
    it('keeps one row per day for the same person', async () => {
      await useCase.execute(validInput({ planItemId: DAY_1 }));
      const second = await useCase.execute(validInput({ planItemId: DAY_2 }));

      expect(second.created).toBe(true);
      expect(logs.saved).toHaveLength(2);
      expect(logs.saved.map((log) => log.planItemId).sort()).toEqual(
        [DAY_1, DAY_2].sort(),
      );
    });

    /**
     * Regra 5 — o `clubId` vem de `planItem.bookId` → `book.clubId`, nunca do
     * ator nem do input.
     *
     * O ator é membro dos DOIS clubes de propósito, e marca no livro do
     * segundo: com um clube só, a asserção passaria com uma implementação que
     * pegasse "o clube do membership do ator" ou "o primeiro livro do
     * repositório".
     */
    it('takes the club from the book of the plan item, even for an actor who is in two clubs', async () => {
      await memberships.save(
        aMembership({
          userId: MEMBER_ID,
          clubId: OTHER_CLUB_ID,
          role: 'MEMBER',
        }),
      );

      const { log } = await useCase.execute(
        validInput({ planItemId: OTHER_CLUB_DAY }),
      );

      expect(log.bookId).toBe(OTHER_CLUB_BOOK_ID);
      expect(log.clubId).toBe(OTHER_CLUB_ID);
    });
  });

  // Estado acidental entre chamadas seria bug de produção invisível: a Tarefa
  // 32 compõe o UseCase uma vez e o reusa por request.
  it('does not leak state between two executes of the same instance', async () => {
    const first = await useCase.execute(
      validInput({ actorUserId: MEMBER_ID, planItemId: DAY_1 }),
    );
    const second = await useCase.execute(
      validInput({ actorUserId: OTHER_MEMBER_ID, planItemId: DAY_2 }),
    );

    expect(first.log.userId).toBe(MEMBER_ID);
    expect(first.log.planItemId).toBe(DAY_1);
    expect(second.log.userId).toBe(OTHER_MEMBER_ID);
    expect(second.log.planItemId).toBe(DAY_2);
    expect(second.log.id).not.toBe(first.log.id);
  });
});
