import { beforeEach, describe, expect, it } from 'vitest';

import type { Book, ReadingPlanItem } from '../../domain/book';
import { BookNotFoundError, NotAMemberError } from '../../domain/errors';
import type { Highlight } from '../../domain/highlight';
import type { Note } from '../../domain/note';
import type { ReadingLog } from '../../domain/reading-log';
import {
  aBook,
  aHighlight,
  aMembership,
  aNote,
  aPlanItem,
  aReadingLog,
} from '../../test-support/builders';
import { BookRepositoryFake } from '../_fakes/book-repository-fake';
import { HighlightRepositoryFake } from '../_fakes/highlight-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { NoteRepositoryFake } from '../_fakes/note-repository-fake';
import { ReadingLogRepositoryFake } from '../_fakes/reading-log-repository-fake';
import { ReadingPlanItemRepositoryFake } from '../_fakes/reading-plan-item-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { GetBookWithPlanInput } from '../get-book-with-plan';
import { GetBookWithPlan } from '../get-book-with-plan';
import type {
  PlanChange,
  ReadingPlanItemRepository,
} from '../ports/reading-plan-item-repository';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const BOOK_ID = 'book-1';
/**
 * O livro do OUTRO clube — fixture HOSTIL da regra 4 da Tarefa 44b.
 *
 * Id próprio, diferente do `BOOK_ID` **e** diferente do `CLUB_ID`: a Tarefa 44
 * mediu que um fixture que reusa o mesmo id para o clube ativo e para o clube
 * do livro deixa a suíte inteira verde com o corte de tenant errado, porque
 * toda comparação acerta por acaso.
 */
const FOREIGN_BOOK_ID = 'book-de-outro-clube';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';
const OTHER_MEMBER_ID = 'user-other-member';
// Nomes escolhidos para a ordem alfabética NÃO ser a de inserção: é o que faz
// um `userIds` sem `sort` falhar.
const ANA_ID = 'user-ana';
const ZECA_ID = 'user-zeca';

const DAY_1_ID = `plan-${BOOK_ID}-2026-10-01`;
const DAY_2_ID = `plan-${BOOK_ID}-2026-10-02`;
const DAY_3_ID = `plan-${BOOK_ID}-2026-10-03`;

/**
 * Repositório adversário: devolve o plano ao CONTRÁRIO do que o port promete.
 *
 * O fake ordena por `order` porque é o contrato dele, então um teste em cima
 * do fake não distingue "o UseCase ordena" de "o UseCase confia no
 * repositório". A regra 19 é justamente "ordena mesmo que o repositório
 * devolva fora de ordem" — o Prisma da Tarefa 07 pode perder o `orderBy` numa
 * refatoração, e a tela não pode virar um plano fora de ordem por isso.
 */
class ReversingPlanRepository implements ReadingPlanItemRepository {
  constructor(private readonly inner: ReadingPlanItemRepositoryFake) {}

  async saveMany(items: ReadingPlanItem[]): Promise<ReadingPlanItem[]> {
    return this.inner.saveMany(items);
  }

  async byId(id: string): Promise<ReadingPlanItem | null> {
    return this.inner.byId(id);
  }

  async findByBook(bookId: string): Promise<ReadingPlanItem[]> {
    return (await this.inner.findByBook(bookId)).reverse();
  }

  // O `find` da Tarefa 37 não é assunto deste adversário (ele existe para
  // desordenar o `findByBook`, que é o que o `getBookWithPlan` chama), mas o
  // port o exige — delegar é o que mantém a classe satisfazendo a interface sem
  // inventar comportamento que nenhum teste daqui observa.
  async find(
    filter: Parameters<ReadingPlanItemRepository['find']>[0],
  ): Promise<ReadingPlanItem[]> {
    return this.inner.find(filter);
  }

  async replaceForBook(
    bookId: string,
    change: PlanChange,
  ): Promise<ReadingPlanItem[]> {
    return this.inner.replaceForBook(bookId, change);
  }
}

describe('GetBookWithPlan', () => {
  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let plan: ReadingPlanItemRepositoryFake;
  let notes: NoteRepositoryFake;
  let logs: ReadingLogRepositoryFake;
  let highlights: HighlightRepositoryFake;
  let useCase: GetBookWithPlan;
  let stored: Book;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    plan = new ReadingPlanItemRepositoryFake();
    notes = new NoteRepositoryFake();
    logs = new ReadingLogRepositoryFake();
    highlights = new HighlightRepositoryFake();
    useCase = new GetBookWithPlan(
      new AssertMembership(memberships),
      books,
      plan,
      notes,
      logs,
      highlights,
    );

    stored = aBook({ id: BOOK_ID, clubId: CLUB_ID });
    await books.save(stored);

    for (const [userId, role] of [
      [OWNER_ID, 'OWNER'],
      [ADMIN_ID, 'ADMIN'],
      [MEMBER_ID, 'MEMBER'],
      [ANA_ID, 'MEMBER'],
      [ZECA_ID, 'MEMBER'],
    ] as const) {
      await memberships.save(aMembership({ userId, clubId: CLUB_ID, role }));
    }
    await memberships.save(
      aMembership({
        userId: OTHER_MEMBER_ID,
        clubId: OTHER_CLUB_ID,
        role: 'MEMBER',
      }),
    );
  });

  function validInput(
    overrides: Partial<GetBookWithPlanInput> = {},
  ): GetBookWithPlanInput {
    return { actorUserId: MEMBER_ID, bookId: BOOK_ID, ...overrides };
  }

  async function seedThreeDayPlan(): Promise<void> {
    await plan.saveMany([
      aPlanItem({ bookId: BOOK_ID, order: 0, date: '2026-10-01' }),
      aPlanItem({ bookId: BOOK_ID, order: 1, date: '2026-10-02' }),
      aPlanItem({ bookId: BOOK_ID, order: 2, date: '2026-10-03' }),
    ]);
  }

  function aDayNote(overrides: Partial<Note> = {}): Note {
    return aNote({
      kind: 'PLAN',
      clubId: CLUB_ID,
      bookId: BOOK_ID,
      ...overrides,
    });
  }

  /**
   * Um grifo deste livro, deste clube.
   *
   * O `aHighlight` dos builders já nasce **avulso** (`planItemId: null`), que é
   * o caso que o ADR 0004 protege — e é o certo aqui: o inventário do livro
   * conta o grifo tenha ele dia de plano ou não.
   */
  function aBookHighlight(overrides: Partial<Highlight> = {}): Highlight {
    return aHighlight({ clubId: CLUB_ID, bookId: BOOK_ID, ...overrides });
  }

  /** Uma leitura marcada. O id sai do par (dia, leitor), como no banco. */
  function aDayLog(planItemId: string, userId: string): ReadingLog {
    return aReadingLog({
      clubId: CLUB_ID,
      bookId: BOOK_ID,
      planItemId,
      userId,
    });
  }

  describe('permission and tenant', () => {
    // Regra 1
    it('rejects a book that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ bookId: 'book-ghost' })),
      ).rejects.toBeInstanceOf(BookNotFoundError);
    });

    // Regra 1 — livro arquivado é invisível também na leitura.
    it('rejects an archived book', async () => {
      await books.save(
        aBook({
          id: BOOK_ID,
          clubId: CLUB_ID,
          status: 'ARCHIVED',
          archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        BookNotFoundError,
      );
    });

    // Regra 2
    it('rejects an actor without an active membership', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: 'user-outsider' })),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    // Regra 2
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

    // Regra 3 — LEITURA exige só membership ativo. Este é o lado "MEMBER
    // pode" do corte de papel.
    it.each([
      ['MEMBER', MEMBER_ID],
      ['ADMIN', ADMIN_ID],
      ['OWNER', OWNER_ID],
    ])('lets the %s open the book', async (_label, actorUserId) => {
      await seedThreeDayPlan();

      const { book, planItems } = await useCase.execute(
        validInput({ actorUserId }),
      );

      expect(book.id).toBe(BOOK_ID);
      expect(planItems).toHaveLength(3);
    });

    /**
     * Regra 3 — o lado que ENTREGA: o `MEMBER` sem papel de admin recebe o
     * livro, o plano ordenado e a sobreposição de autoria do clube inteiro,
     * inclusive a nota de outra pessoa (→ ADR 0002).
     *
     * Era daqui que saía a terceira ocorrência do §7.4: um
     * `resolves.not.toBeInstanceOf(ForbiddenRoleError)` sobre
     * `{ book, planItems, writers }`, que NUNCA poderia ser um `Error` — só o
     * `resolves` mordia, e o nome prometia ter provado uma regra de
     * autorização. Medido: com o UseCase mutilado para devolver
     * `planItems: []` e `writers: []`, o teste antigo continuava verde. O
     * arquivo foi reaberto nesta fatia (ganhou o `writers`) e o teste ao lado
     * ficou como estava — por isso a lição vive no
     * `docs/CONVENCOES-CODIGO.md` §7.4, e não num comentário de um arquivo só.
     */
    it('gives the MEMBER the book, the plan and the writers of the whole club', async () => {
      await seedThreeDayPlan();
      await notes.save(
        aDayNote({
          id: 'note-de-outra-pessoa',
          planItemId: DAY_2_ID,
          userId: ANA_ID,
        }),
      );

      const output = await useCase.execute(
        validInput({ actorUserId: MEMBER_ID }),
      );

      expect(output.book.id).toBe(BOOK_ID);
      expect(output.planItems.map((item) => item.id)).toEqual([
        DAY_1_ID,
        DAY_2_ID,
        DAY_3_ID,
      ]);
      // A nota é da ANA, e quem lê é o MEMBER: dentro do clube não há conteúdo
      // privado, e o `writers` é o que a tela usa para desenhar a autoria.
      expect(output.writers).toEqual([
        { planItemId: DAY_2_ID, userIds: [ANA_ID] },
      ]);
    });

    // Regra 4 — o clube do guard vem de book.clubId. O membro do OUTRO clube
    // é membro de verdade, e ainda assim recebe 404 neste livro.
    it('rejects a member of another club', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: OTHER_MEMBER_ID })),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    // Regra 4
    it('ignores a clubId smuggled into the input', async () => {
      const smuggled = {
        actorUserId: OTHER_MEMBER_ID,
        bookId: BOOK_ID,
        // @ts-expect-error o input não declara clubId — ele vem de book.clubId
        clubId: OTHER_CLUB_ID,
      } satisfies GetBookWithPlanInput;

      await expect(useCase.execute(smuggled)).rejects.toBeInstanceOf(
        NotAMemberError,
      );
    });

    /**
     * **O corte vem ANTES de qualquer leitura de conteúdo** — e o `writers`
     * acrescentou uma segunda leitura, então precisa do seu contador.
     *
     * Sem os contadores, "recusou antes de ler" e "leu e depois recusou" dão o
     * mesmo erro para o cliente, e a segunda ordem trafega o acervo de um clube
     * para quem não é dele antes de descartá-lo. A auditoria da Tarefa 10 achou
     * um mutante exatamente assim. → CONVENCOES-CODIGO §7.3.
     */
    it('never reads the plan nor the notes when the actor is not a member', async () => {
      await seedThreeDayPlan();
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: MEMBER_ID }));

      await expect(
        useCase.execute(validInput({ actorUserId: 'user-outsider' })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(plan.findByBookCalls).toBe(0);
      expect(notes.planItemWritersByBookCalls).toBe(0);
      // ⚠️ E o REGISTRO DE LEITURA também: quem já leu cada dia é conteúdo
      // do clube tanto quanto o plano e a anotação, e o §7.3 pede o contador
      // para CADA leitura de conteúdo — foi a falta de um deles que deixou um
      // mutante sobreviver a 906 testes na Tarefa 10.
      expect(logs.findCalls).toBe(0);
    });

    it('never reads the plan, the notes nor the reading logs when the book does not exist', async () => {
      await expect(
        useCase.execute(validInput({ bookId: 'book-ghost' })),
      ).rejects.toBeInstanceOf(BookNotFoundError);

      expect(plan.findByBookCalls).toBe(0);
      expect(notes.planItemWritersByBookCalls).toBe(0);
      expect(logs.findCalls).toBe(0);
    });

    // O lado POSITIVO do contador: sem ele, um incremento apagado deixaria
    // todo `toBe(0)` acima passar por acidente. → §7.3.
    it('reads the plan, the notes and the reading logs exactly once for a member', async () => {
      await seedThreeDayPlan();

      await useCase.execute(validInput());

      expect(plan.findByBookCalls).toBe(1);
      expect(notes.planItemWritersByBookCalls).toBe(1);
      expect(logs.findCalls).toBe(1);
    });

    /**
     * ⚠️ E o que o contador NÃO distingue (§7.3): que o filtro que foi ao
     * repositório é **UM só**, com o `bookId` do livro e **nenhuma chave à
     * toa**. Um `find` por dia (N idas ao banco) e um `find({ bookId })`
     * devolvem exatamente a mesma sobreposição — só o `findFilters` os separa.
     *
     * E o `bookId` é o do LIVRO RESOLVIDO (`book.id`), não o do input: é o
     * mesmo motivo pelo qual o `clubId` não está no `ReadingLogFilter`.
     */
    it('asks the reading logs for the whole book, in one filter and with no spare key', async () => {
      await seedThreeDayPlan();

      await useCase.execute(validInput());

      expect(logs.findFilters).toEqual([{ bookId: BOOK_ID }]);
    });
  });

  /**
   * O `writers` — a pendência que a Tarefa 10 registrou para a 11. O
   * `CLAUDE.md` diz que o `getBookWithPlan` devolve "livro + plano + quem já
   * escreveu", e agora rota, repositório e schema estão na mesma fatia.
   *
   * O agrupamento em si é da função pura `groupWritersByPlanItem`; desde a
   * Tarefa 31 a conta mora no `groupUsersByPlanItem`, e os 12 testes dela no
   * `domain/__tests__/plan-item-groups.test.ts` (o
   * `domain/__tests__/plan-item-writers.test.ts` guarda o que é do NOME).
   * Aqui prova-se
   * a FIAÇÃO: que o campo existe, que sai na ordem do plano, e que o UseCase lê
   * pelo `planItemWritersByBook` (que filtra `ACTIVE` e ignora avulsa) em vez de
   * carregar o acervo com um `find`.
   */
  describe('writers', () => {
    beforeEach(seedThreeDayPlan);

    it('returns who already wrote on each day of the plan', async () => {
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ZECA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_3_ID, userId: ANA_ID }));

      const { writers } = await useCase.execute(validInput());

      expect(writers).toEqual([
        { planItemId: DAY_1_ID, userIds: [ANA_ID, ZECA_ID] },
        { planItemId: DAY_3_ID, userIds: [ANA_ID] },
      ]);
    });

    // Ordem do PLANO, não a que o repositório de notas enumerou — o fake
    // enumera invertido de propósito (§7.2).
    it('orders the overlay by the plan order', async () => {
      await notes.save(aDayNote({ planItemId: DAY_3_ID, userId: ANA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_2_ID, userId: ANA_ID }));

      const { writers } = await useCase.execute(validInput());

      expect(writers.map((entry) => entry.planItemId)).toEqual([
        DAY_1_ID,
        DAY_2_ID,
        DAY_3_ID,
      ]);
    });

    // Livro em que ninguém escreveu dá lista VAZIA, não três entradas vazias —
    // e o campo existe, para a tela não ter de adivinhar.
    it('returns an empty overlay for a book nobody wrote in', async () => {
      const { writers } = await useCase.execute(validInput());

      expect(writers).toEqual([]);
    });

    /**
     * Arquivada não entra, e avulsa não entra. É o que distingue "leu pelo
     * `planItemWritersByBook`" de "leu pelo `find` e agrupou": o `find` devolve
     * os dois status e a avulsa junto.
     */
    it('counts neither an archived note nor a free one', async () => {
      await notes.save(
        aDayNote({
          planItemId: DAY_1_ID,
          userId: ANA_ID,
          status: 'ARCHIVED',
          archivedAt: new Date('2026-11-01T00:00:00.000Z'),
        }),
      );
      await notes.save(
        aDayNote({ id: 'note-avulsa', kind: 'FREE', planItemId: null }),
      );
      await notes.save(aDayNote({ planItemId: DAY_2_ID, userId: ZECA_ID }));

      const { writers } = await useCase.execute(validInput());

      expect(writers).toEqual([{ planItemId: DAY_2_ID, userIds: [ZECA_ID] }]);
    });

    // A sobreposição de um livro não vaza para o outro, nem entre chamadas da
    // MESMA instância (a rota compõe o UseCase uma vez e reusa por request).
    it('does not leak the overlay between two executes of the same instance', async () => {
      await books.save(aBook({ id: 'book-2', clubId: CLUB_ID }));
      await plan.saveMany([
        aPlanItem({ bookId: 'book-2', order: 0, date: '2026-11-01' }),
      ]);
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));
      await notes.save(
        aDayNote({
          id: 'note-do-outro-livro',
          bookId: 'book-2',
          planItemId: 'plan-book-2-2026-11-01',
          userId: ZECA_ID,
        }),
      );

      const first = await useCase.execute(validInput());
      const second = await useCase.execute(validInput({ bookId: 'book-2' }));
      const third = await useCase.execute(validInput());

      expect(first.writers).toEqual([
        { planItemId: DAY_1_ID, userIds: [ANA_ID] },
      ]);
      expect(second.writers).toEqual([
        { planItemId: 'plan-book-2-2026-11-01', userIds: [ZECA_ID] },
      ]);
      expect(third.writers).toEqual(first.writers);
    });
  });

  /**
   * O `readers` — a Tarefa 32, e é a sobreposição irmã do `writers`.
   *
   * O agrupamento em si é do `groupReadersByPlanItem`, que delega ao
   * `groupUsersByPlanItem` (Tarefa 31): as três propriedades da saída (ordem
   * do plano, nenhum `planItemId` de fora, nenhum dia vazio) estão testadas
   * lá, uma vez só. Aqui prova-se a FIAÇÃO — que o campo existe, que sai na
   * ordem do plano, e que ele é INDEPENDENTE do `writers`.
   */
  describe('readers', () => {
    beforeEach(seedThreeDayPlan);

    it('returns who already read each day of the plan', async () => {
      await logs.save(aDayLog(DAY_1_ID, ZECA_ID));
      await logs.save(aDayLog(DAY_1_ID, ANA_ID));
      await logs.save(aDayLog(DAY_3_ID, ANA_ID));

      const { readers } = await useCase.execute(validInput());

      expect(readers).toEqual([
        { planItemId: DAY_1_ID, userIds: [ANA_ID, ZECA_ID] },
        { planItemId: DAY_3_ID, userIds: [ANA_ID] },
      ]);
    });

    // Ordem do PLANO, não a que o repositório enumerou — o fake enumera
    // invertido de propósito (§7.2), e os fixtures entram fora de ordem.
    it('orders the overlay by the plan order', async () => {
      await logs.save(aDayLog(DAY_3_ID, ANA_ID));
      await logs.save(aDayLog(DAY_1_ID, ANA_ID));
      await logs.save(aDayLog(DAY_2_ID, ANA_ID));

      const { readers } = await useCase.execute(validInput());

      expect(readers.map((entry) => entry.planItemId)).toEqual([
        DAY_1_ID,
        DAY_2_ID,
        DAY_3_ID,
      ]);
    });

    // Livro que ninguém leu dá lista VAZIA, não três entradas vazias — e o
    // campo existe, para a tela não ter de adivinhar.
    it('returns an empty overlay for a book nobody read', async () => {
      const { readers } = await useCase.execute(validInput());

      expect(readers).toEqual([]);
    });

    /**
     * ⚠️ **LER NÃO É ESCREVER, e as duas sobreposições são INDEPENDENTES.**
     *
     * É o teste que a decisão B da Tarefa 31 pede: `groupWritersByPlanItem` e
     * `groupReadersByPlanItem` têm a mesma conta por dentro e a tipagem é
     * estrutural, então trocar um pelo outro no `getBookWithPlan`
     * **compilaria**. Com os dias e as pessoas escolhidos para não coincidir,
     * essa troca acusa: quem leu o dia 1 é a ANA, quem escreveu nele é o ZECA,
     * e o dia 2 tem leitura e nenhuma nota.
     */
    it('keeps the reading overlay independent from the writing one', async () => {
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ZECA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_3_ID, userId: ZECA_ID }));
      await logs.save(aDayLog(DAY_1_ID, ANA_ID));
      await logs.save(aDayLog(DAY_2_ID, ANA_ID));

      const { writers, readers } = await useCase.execute(validInput());

      expect(writers).toEqual([
        { planItemId: DAY_1_ID, userIds: [ZECA_ID] },
        { planItemId: DAY_3_ID, userIds: [ZECA_ID] },
      ]);
      expect(readers).toEqual([
        { planItemId: DAY_1_ID, userIds: [ANA_ID] },
        { planItemId: DAY_2_ID, userIds: [ANA_ID] },
      ]);
    });

    // A sobreposição de um livro não vaza para o outro, nem entre chamadas da
    // MESMA instância (a rota compõe o UseCase uma vez e reusa por request).
    it('does not leak the overlay between two executes of the same instance', async () => {
      await books.save(aBook({ id: 'book-2', clubId: CLUB_ID }));
      await plan.saveMany([
        aPlanItem({ bookId: 'book-2', order: 0, date: '2026-11-01' }),
      ]);
      await logs.save(aDayLog(DAY_1_ID, ANA_ID));
      await logs.save(
        aReadingLog({
          clubId: CLUB_ID,
          bookId: 'book-2',
          planItemId: 'plan-book-2-2026-11-01',
          userId: ZECA_ID,
        }),
      );

      const first = await useCase.execute(validInput());
      const second = await useCase.execute(validInput({ bookId: 'book-2' }));
      const third = await useCase.execute(validInput());

      expect(first.readers).toEqual([
        { planItemId: DAY_1_ID, userIds: [ANA_ID] },
      ]);
      expect(second.readers).toEqual([
        { planItemId: 'plan-book-2-2026-11-01', userIds: [ZECA_ID] },
      ]);
      expect(third.readers).toEqual(first.readers);
    });

    /**
     * ⚠️ **NENHUM CONTADOR DE PROGRESSO NA SAÍDA** — progresso é presença, e é
     * decisão do dono (`docs/ACEITE-MVP.md`, MVP 3, pergunta 1). A guarda é
     * sobre as CHAVES da saída, e não sobre um número esperado: é o que faz um
     * `readDays` acrescentado por engano ficar vermelho aqui, em vez de
     * chegar ao `shared` e à tela.
     *
     * ⚠️⚠️ **A LISTA DE CHAVES CRESCEU NA TAREFA 44b, e o que ela afirma NÃO
     * mudou.** O `inventory` é o tamanho do acervo do LIVRO (quantas anotações
     * e quantos grifos o clube escreveu nele) e o `lastHighlight` é o grifo
     * mais recente. Nenhum dos dois é progresso: não há total contra o qual
     * comparar, nenhum deles muda quando alguém **deixa** de escrever, e
     * nenhum deles é por pessoa. É a decisão F da Tarefa 44b, e é a mesma
     * distinção que o `pt.ts` escreve ao lado de `pages.book.inBook.*`.
     *
     * O que continua proibido, e continua guardado aqui: um contador **dentro
     * do `readers`** (um `readDays`, um total de dias, um percentual). Por
     * isso a segunda asserção ficou intacta — é ela que guarda a afirmação
     * estreita que o docblock do `bookWithPlanResponseSchema` faz.
     */
    it('returns no reading count, no total and no percentage', async () => {
      await logs.save(aDayLog(DAY_1_ID, ANA_ID));

      const output = await useCase.execute(validInput());

      expect(Object.keys(output).sort()).toEqual([
        'book',
        'inventory',
        'lastHighlight',
        'planItems',
        'readers',
        'writers',
      ]);
      for (const entry of output.readers) {
        expect(Object.keys(entry).sort()).toEqual(['planItemId', 'userIds']);
      }
    });
  });

  /**
   * ⚠️ **O INVENTÁRIO DO LIVRO — A TAREFA 44b, e ela é a TERCEIRA aplicação do
   * argumento que abre o docblock deste UseCase.**
   *
   * "Uma abertura de livro é UM corte de tenant, não três": o `writers` entrou
   * assim na Tarefa 11, o `readers` na 32, e as duas contagens entram aqui.
   * **Não** existe rota de contagem, e **não** existe envelope com total nas
   * listagens — a `GET /books/:bookId/writers` gêmea nunca teve cliente, e uma
   * terceira requisição nesta tela bateria na regra 1 da Tarefa 28.
   *
   * ⚠️ **A LEITURA É UM `activeCountByBook`, NUNCA UM `find(...).length`.** O
   * `find` dos dois repositórios Prisma tem `take: FIND_ROW_LIMIT = 500`
   * (válvula de segurança, não paginação), então o `length` de um livro com
   * mais de 500 linhas seria **500** — um número plausível, estável e errado,
   * publicado como fato. É a frase que fechou a decisão: *lista truncada é
   * registro; contagem truncada é mentira*.
   *
   * ⚠️ **E ESSE DEFEITO NÃO É DECIDÍVEL AQUI (§7.10), com a medição ao lado:**
   * o fake não tem teto de linhas, então o mutante `count()` →
   * `find(...).length` passa por esta suíte inteira sem um vermelho. Quem o
   * acusa é o teste de contrato contra o Postgres — `counts every ACTIVE note
   * of the book, past the 500-row valve of find()` em
   * `repositories/__tests__/prisma-note-repository.contract.integration.test.ts`
   * e o irmão dele no grifo. O que esta suíte decide é tudo o resto: o
   * arquivado, a avulsa, o corte de livro e o corte de tenant.
   */
  describe('inventory', () => {
    beforeEach(seedThreeDayPlan);

    /**
     * ⚠️ **A AVULSA ENTRA, e é o ponto inteiro da fatia.** O atalho que parecia
     * existir — somar os `writers[].userIds`, exato para a nota do dia por
     * causa do `@@unique([planItemId, userId])` — **cegaria** a anotação
     * avulsa, porque índice único não compara `NULL` com `NULL` e o
     * `planItemWritersByBook` filtra `planItemId IS NOT NULL`. O acervo é por
     * LIVRO e tem filtro `FREE`, então a avulsa é acervo do livro.
     */
    it('counts every ACTIVE note of the book, the free ones included', async () => {
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_2_ID, userId: ANA_ID }));
      await notes.save(
        aDayNote({ id: 'note-avulsa', kind: 'FREE', planItemId: null }),
      );

      const { inventory } = await useCase.execute(validInput());

      expect(inventory.notes).toBe(3);
    });

    it('counts every ACTIVE highlight of the book', async () => {
      await highlights.save(aBookHighlight({ id: 'h-1' }));
      await highlights.save(aBookHighlight({ id: 'h-2' }));

      const { inventory } = await useCase.execute(validInput());

      expect(inventory.highlights).toBe(2);
    });

    /**
     * ⚠️ **O ARQUIVADO NÃO CONTA** (regra 3, decisão C). Soft delete é `status`
     * + `archivedAt`, e um arquivado somado ao inventário é a mesma mentira da
     * contagem truncada, só menor.
     *
     * Os dois lados no mesmo teste de propósito: são duas implementações
     * independentes da mesma regra, e um `status` esquecido em **um** dos dois
     * repositórios é exatamente a assimetria que passa despercebida.
     */
    it('counts neither an archived note nor an archived highlight', async () => {
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_2_ID, userId: ZECA_ID }));
      await notes.save(
        aDayNote({
          id: 'note-arquivada',
          planItemId: DAY_3_ID,
          userId: ANA_ID,
          status: 'ARCHIVED',
          archivedAt: new Date('2026-11-01T00:00:00.000Z'),
        }),
      );
      await highlights.save(aBookHighlight({ id: 'h-viva' }));
      await highlights.save(
        aBookHighlight({
          id: 'h-arquivado',
          status: 'ARCHIVED',
          archivedAt: new Date('2026-11-01T00:00:00.000Z'),
        }),
      );

      const { inventory } = await useCase.execute(validInput());

      expect(inventory).toEqual({ notes: 2, highlights: 1 });
    });

    /** Acervo vazio é zero, e o campo existe — a tela não tem de adivinhar. */
    it('counts zero for a book nobody wrote in', async () => {
      const { inventory } = await useCase.execute(validInput());

      expect(inventory).toEqual({ notes: 0, highlights: 0 });
    });

    /**
     * ⚠️⚠️ **O CORTE DE TENANT, COM FIXTURE HOSTIL** (regra 4) — ids
     * DIFERENTES para o clube do livro e para o outro clube. A Tarefa 44 pagou
     * por esta: um fixture que usa o mesmo id nos dois lados deixa centenas de
     * testes verdes com o corte errado, porque toda comparação acerta por
     * acaso.
     *
     * O acervo do outro clube tem **mais** linhas que o deste livro de
     * propósito: um `count()` sem o `bookId` daria 5 e 3, e um que contasse
     * "tudo do clube" daria outro número ainda — nenhum deles é 2 e 1.
     */
    it('never sums the acervo of another club into this book', async () => {
      await books.save(aBook({ id: FOREIGN_BOOK_ID, clubId: OTHER_CLUB_ID }));
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));
      await notes.save(aDayNote({ planItemId: DAY_2_ID, userId: ZECA_ID }));
      await highlights.save(aBookHighlight({ id: 'h-daqui' }));
      for (const suffix of ['a', 'b', 'c']) {
        await notes.save(
          aDayNote({
            id: `note-de-fora-${suffix}`,
            clubId: OTHER_CLUB_ID,
            bookId: FOREIGN_BOOK_ID,
            kind: 'FREE',
            planItemId: null,
          }),
        );
        await highlights.save(
          aBookHighlight({
            id: `h-de-fora-${suffix}`,
            clubId: OTHER_CLUB_ID,
            bookId: FOREIGN_BOOK_ID,
          }),
        );
      }

      const { inventory } = await useCase.execute(validInput());

      expect(inventory).toEqual({ notes: 2, highlights: 1 });
    });

    /**
     * **O corte vem ANTES de qualquer leitura de conteúdo**, e as contagens são
     * duas leituras novas — então precisam dos seus contadores (§7.3). Sem
     * eles, "recusou antes de contar" e "contou e depois recusou" dão o mesmo
     * erro para o cliente, e a segunda ordem conta o acervo de um clube para
     * quem não é dele.
     */
    it('never counts anything when the actor is not a member', async () => {
      await notes.save(aDayNote({ planItemId: DAY_1_ID, userId: ANA_ID }));
      await highlights.save(aBookHighlight({ id: 'h-1' }));

      await expect(
        useCase.execute(validInput({ actorUserId: 'user-outsider' })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(notes.activeCountByBookCalls).toBe(0);
      expect(highlights.activeCountByBookCalls).toBe(0);
      expect(highlights.lastActiveByBookCalls).toBe(0);
    });

    // O lado POSITIVO dos contadores: sem ele, um incremento apagado deixaria
    // todo `toBe(0)` acima passar por acidente. → §7.3.
    it('counts each side exactly once for a member', async () => {
      await useCase.execute(validInput());

      expect(notes.activeCountByBookCalls).toBe(1);
      expect(highlights.activeCountByBookCalls).toBe(1);
      expect(highlights.lastActiveByBookCalls).toBe(1);
    });

    /**
     * ⚠️⚠️ **AS SEIS LEITURAS DE CONTEÚDO PARTEM JUNTAS — e esta guarda é
     * CLOCK-FREE de propósito (§7.3: "contador de chamadas, nunca
     * cronômetro").**
     *
     * Depois do corte de tenant, a abertura de livro faz seis leituras
     * INDEPENDENTES: o plano, a sobreposição de autoria, os logs de leitura e
     * as três da Tarefa 44b. Em fila elas são seis idas ao banco em série —
     * seis tempos de rede somados para montar UMA tela.
     *
     * ⚠️ **Medido contra o Postgres de desenvolvimento** (200 amostras, depois
     * de 20 de aquecimento, no livro real do banco do dono): a sequência tem
     * **mediana 3,68 ms** e o `Promise.all`, **1,03 ms** — **−2,64 ms, 71,9%
     * do tempo de banco da requisição principal desta tela**. Em localhost a
     * ida de rede é quase zero; com RTT de verdade a conta piora linearmente,
     * porque o que se paga são **seis** viagens em vez de uma.
     *
     * ⚠️ **COMO SE PROVA PARALELISMO SEM CRONÔMETRO.** Um `expect` de duração
     * seria a asserção que se autoajusta do §7.8 com roupa de performance:
     * verde ou vermelha conforme a máquina. Aqui a propriedade é
     * ESTRUTURAL — *as seis chamadas partem antes de a primeira responder* —, e
     * ela se mede com os contadores que os fakes já têm: a primeira leitura
     * fica PRESA numa promessa que o teste controla, e as outras cinco já têm
     * de estar contadas enquanto ela ainda não respondeu. Em fila, quatro
     * delas nem teriam sido chamadas.
     *
     * ⚠️ **E o corte de tenant continua ANTES de todas** — é o `it()` logo
     * acima, que prova que ninguém conta nada para quem não é membro. Paralelo
     * é o que acontece DEPOIS do `bookForActor`, nunca em volta dele.
     */
    it('⚠️ fires the six content reads TOGETHER, not one after the other', async () => {
      let liberar: () => void = () => undefined;
      const portao = new Promise<void>((resolve) => {
        liberar = resolve;
      });
      // O contador do fake só incrementa quando o método DE VERDADE roda, e
      // ele fica preso atrás do portão — então a chegada se marca aqui.
      let chegou = false;
      const original = plan.findByBook.bind(plan);
      plan.findByBook = async (bookId: string) => {
        chegou = true;
        await portao;
        return original(bookId);
      };

      const rodando = useCase.execute(validInput());
      // Macrotarefa: descarrega TODA a fila de microtarefas pendentes, sem
      // medir tempo nenhum. É o idioma padrão de "deixe o que já partiu
      // partir", e não um `setTimeout` disfarçado de espera.
      await new Promise((resolve) => {
        setImmediate(resolve);
      });

      expect(chegou).toBe(true);
      expect(notes.planItemWritersByBookCalls).toBe(1);
      expect(logs.findCalls).toBe(1);
      expect(notes.activeCountByBookCalls).toBe(1);
      expect(highlights.activeCountByBookCalls).toBe(1);
      expect(highlights.lastActiveByBookCalls).toBe(1);

      liberar();
      // E o resultado continua inteiro: paralelizar não pode trocar o que a
      // tela recebe (o lado positivo do par, §7.4).
      const { planItems, inventory } = await rodando;
      expect(planItems).toHaveLength(3);
      expect(inventory).toEqual({ highlights: 0, notes: 0 });
    });
  });

  /**
   * ⚠️ **O ÚLTIMO GRIFO — decisão D da Tarefa 44b.**
   *
   * Método estreito (`lastActiveByBook`), e não o primeiro item de um `find`:
   * puxar até 500 grifos para mostrar **um** é trafegar o acervo do clube, o
   * mesmo defeito que o `planItemWritersByBook` existe para não cometer. E o
   * `find` do grifo **não promete ordem** — o port o diz por escrito, e o fake
   * enumera invertido de propósito (§7.2) —, então "o primeiro do `find`" nem
   * sequer seria o último grifo.
   */
  describe('lastHighlight', () => {
    beforeEach(seedThreeDayPlan);

    /**
     * ⚠️ A ordem de inserção é a INVERSA da esperada de propósito: o fake
     * enumera ao contrário (§7.2), então uma implementação que devolvesse "o
     * primeiro que o repositório enumerou" acertaria por acaso se o mais
     * recente fosse o último inserido.
     */
    it('returns the most recent ACTIVE highlight of the book', async () => {
      await highlights.save(
        aBookHighlight({
          id: 'h-novo',
          quote: 'o mais recente',
          createdAt: new Date('2026-10-03T00:00:00.000Z'),
        }),
      );
      await highlights.save(
        aBookHighlight({
          id: 'h-velho',
          quote: 'o mais antigo',
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
        }),
      );

      const { lastHighlight } = await useCase.execute(validInput());

      expect(lastHighlight?.id).toBe('h-novo');
      expect(lastHighlight?.quote).toBe('o mais recente');
    });

    it('returns null for a book without any highlight', async () => {
      const { lastHighlight } = await useCase.execute(validInput());

      expect(lastHighlight).toBeNull();
    });

    it('ignores an archived highlight, even when it is the most recent', async () => {
      await highlights.save(
        aBookHighlight({
          id: 'h-vivo',
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
        }),
      );
      await highlights.save(
        aBookHighlight({
          id: 'h-arquivado',
          createdAt: new Date('2026-10-09T00:00:00.000Z'),
          status: 'ARCHIVED',
          archivedAt: new Date('2026-10-10T00:00:00.000Z'),
        }),
      );

      const { lastHighlight } = await useCase.execute(validInput());

      expect(lastHighlight?.id).toBe('h-vivo');
    });

    /** Fixture hostil de novo: o grifo mais recente é o do OUTRO clube. */
    it('never crosses into another club book, even for a more recent highlight', async () => {
      await books.save(aBook({ id: FOREIGN_BOOK_ID, clubId: OTHER_CLUB_ID }));
      await highlights.save(
        aBookHighlight({
          id: 'h-daqui',
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
        }),
      );
      await highlights.save(
        aBookHighlight({
          id: 'h-de-fora',
          clubId: OTHER_CLUB_ID,
          bookId: FOREIGN_BOOK_ID,
          createdAt: new Date('2026-10-09T00:00:00.000Z'),
        }),
      );

      const { lastHighlight } = await useCase.execute(validInput());

      expect(lastHighlight?.id).toBe('h-daqui');
    });

    /**
     * ⚠️ **O DESEMPATE DO EMPATE NO MILISSEGUNDO — a guarda que FALTAVA, e ela
     * nasce de um mutante sobrevivente (rodada de correção da Tarefa 44b).**
     *
     * O port promete ordem TOTAL: `createdAt` **desc**, depois `id` **asc**.
     * O `createdAt` sozinho não é ordem total, e empate no mesmo milissegundo
     * é o caso normal de um clube (duas pessoas salvando ao mesmo tempo, o
     * retry da fila offline, um seed que grava em lote).
     *
     * ⚠️ **Medido: INVERTER o desempate do fake passava por 1987 testes
     * unitários sem um vermelho.** A metade da ordem que tinha acusador era só
     * a do `createdAt` (o `returns the most recent ACTIVE highlight` acima);
     * a outra metade — a que existe justamente para o empate — não tinha
     * nenhum. O contrato contra o Prisma real guardava o lado do banco
     * (`breaks a createdAt tie by id`), e o fake ficou solto: é o §7.1 na
     * frase exata dele, *"fidelidade afirmada em comentário e não em teste é
     * fidelidade que o próximo refactor apaga"*.
     *
     * Os dois grifos nascem com o MESMO instante, e o de id MENOR é o
     * esperado. A ordem de inserção é a inversa da esperada, como no teste de
     * cima: o fake enumera invertido (§7.2), então "o primeiro enumerado"
     * acertaria por acaso se o fixture estivesse na ordem amigável.
     */
    it('breaks a createdAt tie by the SMALLER id, never by insertion order', async () => {
      const mesmoInstante = new Date('2026-10-05T05:05:05.005Z');
      await highlights.save(
        aBookHighlight({
          id: 'h-z-depois',
          quote: 'o id maior',
          createdAt: mesmoInstante,
        }),
      );
      await highlights.save(
        aBookHighlight({
          id: 'h-a-antes',
          quote: 'o id menor',
          createdAt: mesmoInstante,
        }),
      );

      const { lastHighlight } = await useCase.execute(validInput());

      expect(lastHighlight?.id).toBe('h-a-antes');
      expect(lastHighlight?.quote).toBe('o id menor');
    });

    // A rota compõe o UseCase uma vez e reusa por request.
    it('does not leak between two executes of the same instance', async () => {
      await books.save(aBook({ id: 'book-2', clubId: CLUB_ID }));
      await highlights.save(aBookHighlight({ id: 'h-livro-1' }));
      await highlights.save(
        aBookHighlight({ id: 'h-livro-2', bookId: 'book-2' }),
      );

      const first = await useCase.execute(validInput());
      const second = await useCase.execute(validInput({ bookId: 'book-2' }));
      const third = await useCase.execute(validInput());

      expect(first.lastHighlight?.id).toBe('h-livro-1');
      expect(second.lastHighlight?.id).toBe('h-livro-2');
      expect(third.lastHighlight?.id).toBe(first.lastHighlight?.id);
    });
  });

  // Regra 19
  it('returns the book and its plan ordered by order', async () => {
    await seedThreeDayPlan();

    const { book, planItems } = await useCase.execute(validInput());

    expect(book).toEqual(stored);
    expect(planItems.map((item) => item.order)).toEqual([0, 1, 2]);
    expect(planItems.map((item) => item.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  // Regra 19 — o teste que importa: o repositório devolve ao contrário, de
  // propósito, e o output continua em ordem.
  it('orders the plan even when the repository returns it out of order', async () => {
    await seedThreeDayPlan();
    const reversing = new ReversingPlanRepository(plan);
    const withHostileRepo = new GetBookWithPlan(
      new AssertMembership(memberships),
      books,
      reversing,
      notes,
      logs,
      highlights,
    );

    // Pré-condição do teste: o repositório está realmente fora de ordem.
    const raw = await reversing.findByBook(BOOK_ID);
    expect(raw.map((item) => item.order)).toEqual([2, 1, 0]);

    const { planItems } = await withHostileRepo.execute(validInput());

    expect(planItems.map((item) => item.order)).toEqual([0, 1, 2]);
  });

  // Regra 20
  it('returns an empty plan for a book without one', async () => {
    const { book, planItems } = await useCase.execute(validInput());

    expect(book).toEqual(stored);
    expect(planItems).toEqual([]);
  });

  // O plano de outro livro não vaza para dentro deste.
  it('returns only the plan of the book asked for', async () => {
    await seedThreeDayPlan();
    await books.save(aBook({ id: 'book-2', clubId: CLUB_ID }));
    await plan.saveMany([
      aPlanItem({ bookId: 'book-2', order: 0, date: '2026-11-01' }),
    ]);

    const { planItems } = await useCase.execute(validInput());

    expect(planItems.map((item) => item.bookId)).toEqual([
      BOOK_ID,
      BOOK_ID,
      BOOK_ID,
    ]);
  });

  // Estado acidental entre chamadas seria bug de produção invisível: a Tarefa
  // 07 compõe o UseCase uma vez e reusa por request. Aqui o vazamento mais
  // perigoso seria o plano de um livro aparecendo no outro.
  it('does not leak state between two executes of the same instance', async () => {
    await seedThreeDayPlan();
    await books.save(aBook({ id: 'book-2', clubId: CLUB_ID, title: 'Outro' }));
    await plan.saveMany([
      aPlanItem({ bookId: 'book-2', order: 0, date: '2026-11-01' }),
    ]);

    const first = await useCase.execute(validInput());
    const second = await useCase.execute(validInput({ bookId: 'book-2' }));

    expect(first.planItems).toHaveLength(3);
    expect(second.book.title).toBe('Outro');
    expect(second.planItems).toHaveLength(1);
    expect(second.planItems.map((item) => item.date)).toEqual(['2026-11-01']);
  });
});
