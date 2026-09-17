import { ACTIVITY_FEED_DEFAULT_LIMIT } from '@clube/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ActivityEvent } from '../../domain/activity-event';
import { NotAMemberError } from '../../domain/errors';
import {
  aMembership,
  anActivityEvent,
  aPlanItem,
} from '../../test-support/builders';
import { ActivityEventRepositoryFake } from '../_fakes/activity-event-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { ReadingPlanItemRepositoryFake } from '../_fakes/reading-plan-item-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { ActivityFeedEntry, ListActivityInput } from '../list-activity';
import { ListActivity } from '../list-activity';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';
const OTHER_MEMBER_ID = 'user-other-member';
const OUTSIDER_ID = 'user-outsider';

describe('ListActivity', () => {
  let memberships: MembershipRepositoryFake;
  let events: ActivityEventRepositoryFake;
  let planItems: ReadingPlanItemRepositoryFake;
  let useCase: ListActivity;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    events = new ActivityEventRepositoryFake();
    planItems = new ReadingPlanItemRepositoryFake();
    useCase = new ListActivity(
      new AssertMembership(memberships),
      events,
      planItems,
    );

    for (const [userId, role] of [
      [OWNER_ID, 'OWNER'],
      [ADMIN_ID, 'ADMIN'],
      [MEMBER_ID, 'MEMBER'],
      [OTHER_MEMBER_ID, 'MEMBER'],
    ] as const) {
      await memberships.save(aMembership({ userId, clubId: CLUB_ID, role }));
      await memberships.save(
        aMembership({ userId, clubId: OTHER_CLUB_ID, role }),
      );
    }
    // O estranho é OWNER de OUTRO clube: tem conta e papel, só não neste.
    await memberships.save(
      aMembership({
        userId: OUTSIDER_ID,
        clubId: OTHER_CLUB_ID,
        role: 'OWNER',
      }),
    );
  });

  // Fixture como FACTORY, nunca `const` de describe (§7.7).
  function validInput(
    overrides: Partial<ListActivityInput> = {},
  ): ListActivityInput {
    return { actorUserId: MEMBER_ID, clubId: CLUB_ID, ...overrides };
  }

  function anEvent(
    id: string,
    overrides: Partial<ActivityEvent> = {},
  ): ActivityEvent {
    return anActivityEvent({ id, clubId: CLUB_ID, ...overrides });
  }

  /**
   * O evento como ele sai do feed quando **não há título** a resolver — porque
   * o dia é `null`, porque ele saiu do plano, ou porque nenhum plano foi
   * montado neste teste.
   *
   * Existe para o `planItemTitle` ser afirmado em TODA asserção de saída, e não
   * só nos testes que falam dele: uma junção que colasse o título errado em
   * toda linha passaria em qualquer `toEqual` que ignorasse o campo.
   */
  function withoutTitle(event: ActivityEvent): ActivityFeedEntry {
    return { ...event, planItemTitle: null };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Regras 10, 11 e 12 — o corte de tenant
  // ───────────────────────────────────────────────────────────────────────────

  describe('the tenant cut', () => {
    /**
     * ⚠️ REGRA 10 — o feed **não exige papel**. Ler o que o clube fez é do
     * clube: `MEMBER` lê igual ao `OWNER`, e papel de admin manda no livro e no
     * plano, não no que as pessoas escreveram (ADR 0002).
     *
     * ⚠️ E a asserção é sobre a **SAÍDA REAL**, nunca um
     * `not.toBeInstanceOf(ForbiddenRoleError)` — aquilo é asserção vazia
     * (§7.4): o valor resolvido é `ActivityEvent[]` e nunca poderia ser um
     * `Error`. Com o UseCase mutilado para `return []`, este teste **acusa**.
     */
    it.each([
      ['an OWNER', OWNER_ID],
      ['an ADMIN', ADMIN_ID],
      ['a MEMBER', MEMBER_ID],
    ])('gives %s the events of the club', async (_label, actorUserId) => {
      const event = anEvent('e1');
      await events.save(event);

      await expect(
        useCase.execute(validInput({ actorUserId })),
      ).resolves.toEqual([withoutTitle(event)]);
    });

    /**
     * ⚠️ **REGRA 11 — O CORTE VEM ANTES DA LEITURA, e a prova é o CONTADOR**
     * (§7.3).
     *
     * `NotAMemberError` sai igual nas duas ordens; o que as separa é
     * `findCalls === 0`. A ordem errada trafega o feed inteiro de um clube para
     * quem não é dele antes de descartá-lo — e transforma a rota num oráculo de
     * existência (e numa conta de banco) para qualquer pessoa com token.
     */
    it('refuses a non-member BEFORE reading a single event', async () => {
      await events.save(anEvent('e1'));

      await expect(
        useCase.execute(validInput({ actorUserId: OUTSIDER_ID })),
      ).rejects.toBeInstanceOf(NotAMemberError);
      expect(events.findCalls).toBe(0);
      // ⚠️ E o PLANO também não foi lido: os temas de cada dia são conteúdo do
      // clube tanto quanto a nota (§7.3), e a junção da 38e é a segunda
      // leitura que essa ordem precisa proteger.
      expect(planItems.findCalls).toBe(0);
    });

    /**
     * O lado POSITIVO do mesmo contador: um contador só afirmado como `toBe(0)`
     * é meio contador — um incremento que alguém apague deixaria o teste acima
     * passar por acidente (§7.4).
     */
    it('reads exactly once on the happy path', async () => {
      await events.save(anEvent('e1'));

      await useCase.execute(validInput());

      expect(events.findCalls).toBe(1);
      // A junção é UMA consulta a mais, nunca uma por evento (regra 5).
      expect(planItems.findCalls).toBe(1);
    });

    /** Membership ARQUIVADO é o mesmo que nenhum: quem saiu do clube não lê. */
    it('refuses a member who left the club, before reading', async () => {
      await memberships.save(
        aMembership({
          userId: MEMBER_ID,
          clubId: CLUB_ID,
          status: 'ARCHIVED',
        }),
      );
      await events.save(anEvent('e1'));

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        NotAMemberError,
      );
      expect(events.findCalls).toBe(0);
      expect(planItems.findCalls).toBe(0);
    });

    /**
     * ⚠️ REGRA 12 — o `clubId` que vai ao repositório é o do INPUT (que a rota
     * enche com o `req.params`), e o ator é o do JWT. Nenhum dos dois vem do
     * corpo — o `ListActivityInput` não declara `userId` nem nada parecido, e o
     * compilador é a primeira barreira.
     */
    it('sends the asked club to the repository, and nothing else', async () => {
      await useCase.execute(validInput({ clubId: OTHER_CLUB_ID }));

      expect(events.findFilters).toEqual([{ clubId: OTHER_CLUB_ID }]);
    });

    /** Evento de outro clube não atravessa — a prova através do fake. */
    it('never returns an event of another club', async () => {
      const mine = anEvent('e1');
      await events.save(mine);
      await events.save(anEvent('e2', { clubId: OTHER_CLUB_ID }));

      await expect(useCase.execute(validInput())).resolves.toEqual([
        withoutTitle(mine),
      ]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Regra 10 — o que ele devolve
  // ───────────────────────────────────────────────────────────────────────────

  describe('what it gives back', () => {
    it('gives back an empty list for a club where nothing happened', async () => {
      await expect(useCase.execute(validInput())).resolves.toEqual([]);
    });

    /**
     * ⚠️ **A ORDEM VEM DO REPOSITÓRIO, e o UseCase NÃO a refaz** — é a
     * diferença deliberada em relação ao `listNotes`, que ordena em memória.
     *
     * Lá o port declara não prometer ordem, então o UseCase é o dono dela. Aqui
     * o port **promete** `createdAt desc` com desempate por `id` (decisão C), e
     * um `sort` a mais aqui seria um SEGUNDO dono da mesma regra — o jeito como
     * as duas divergem na primeira correção. O que este teste prova é que a
     * ordem chega até a borda intacta.
     */
    it('keeps the order the repository promised, newest first', async () => {
      await events.save(
        anEvent('b', { createdAt: new Date('2026-10-03T00:00:00Z') }),
      );
      await events.save(
        anEvent('a', { createdAt: new Date('2026-10-01T00:00:00Z') }),
      );
      await events.save(
        anEvent('c', { createdAt: new Date('2026-10-02T00:00:00Z') }),
      );

      const found = await useCase.execute(validInput());

      expect(found.map((event) => event.id)).toEqual(['b', 'c', 'a']);
    });

    /**
     * ⚠️ **O feed mostra o que TODO MUNDO fez, não só o ator** (ADR 0002:
     * dentro do clube não existe conteúdo privado, e o evento **não cria
     * visibilidade nova**).
     *
     * Sem este teste, um `find({ clubId, userId: actor })` — o filtro que
     * alguém acrescentaria "por segurança" — passaria em todos os outros.
     */
    it('shows what everybody in the club did, not only the actor', async () => {
      await events.save(anEvent('e1', { userId: MEMBER_ID }));
      await events.save(anEvent('e2', { userId: OTHER_MEMBER_ID }));

      const found = await useCase.execute(validInput());

      expect(found.map((event) => event.userId).sort()).toEqual([
        MEMBER_ID,
        OTHER_MEMBER_ID,
      ]);
    });

    /** Os quatro nascimentos entram no mesmo feed — não há filtro por tipo. */
    it('mixes the four types in one list', async () => {
      await events.save(anEvent('e1', { type: 'PLAN_NOTE' }));
      await events.save(anEvent('e2', { type: 'FREE_NOTE', planItemId: null }));
      await events.save(anEvent('e3', { type: 'HIGHLIGHT', planItemId: null }));
      await events.save(anEvent('e4', { type: 'READ' }));

      const found = await useCase.execute(validInput());

      expect(found.map((event) => event.type).sort()).toEqual([
        'FREE_NOTE',
        'HIGHLIGHT',
        'PLAN_NOTE',
        'READ',
      ]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Decisão D — o `limit` é parâmetro explícito
  // ───────────────────────────────────────────────────────────────────────────

  describe('the limit', () => {
    async function saveEvents(count: number): Promise<void> {
      for (let i = 0; i < count; i += 1) {
        await events.save(
          anEvent(`e${String(i).padStart(4, '0')}`, {
            createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, i)),
          }),
        );
      }
    }

    /**
     * ⚠️ **DECISÃO D — quem sabe quantos itens quer é a TELA**, e por isso o
     * limite atravessa o UseCase até o repositório em vez de morar escondido
     * nele. A prova é o `findFilters`: o resultado sozinho não separa "o limite
     * foi para o repositório" de "o repositório devolveu pouco".
     */
    it('passes an explicit limit through to the repository', async () => {
      await saveEvents(5);

      const found = await useCase.execute(validInput({ limit: 2 }));

      expect(events.findFilters).toEqual([{ clubId: CLUB_ID, limit: 2 }]);
      expect(found.map((event) => event.id)).toEqual(['e0004', 'e0003']);
    });

    /**
     * ⚠️ **O UseCase NÃO tem padrão próprio**: `limit` ausente sai do filtro, e
     * quem aplica o `ACTIVITY_FEED_DEFAULT_LIMIT` é o repositório (o port é o
     * dono da regra). Um `?? ACTIVITY_FEED_DEFAULT_LIMIT` aqui seria o segundo
     * dono, e o número duplicado divergiria na primeira mudança.
     *
     * As duas asserções são necessárias: a do filtro prova que a chave NÃO
     * viaja, e a do resultado prova que o padrão de fato aconteceu.
     */
    it('sends no limit key at all when nobody asked, and the repository default applies', async () => {
      await saveEvents(ACTIVITY_FEED_DEFAULT_LIMIT + 1);

      const found = await useCase.execute(validInput());

      expect(events.findFilters).toEqual([{ clubId: CLUB_ID }]);
      expect(Object.keys(events.findFilters[0] ?? {})).toEqual(['clubId']);
      expect(found).toHaveLength(ACTIVITY_FEED_DEFAULT_LIMIT);
    });
  });
  // ───────────────────────────────────────────────────────────────────────────
  // Tarefa 38e — o tema do dia na linha do feed
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ⚠️ **O TÍTULO É RESOLVIDO NA LEITURA, e é isso que o separa da recusa da
   * Tarefa 35.**
   *
   * Denormalizar o título dentro do `ActivityEvent` continua RECUSADO: o evento
   * é log imutável, e um título guardado envelhece no dia em que o admin
   * corrigir o plano — aí o feed mente sobre o passado. Aqui o título vem do
   * plano **atual**, então ele não tem versão e não pode divergir: quem corrige
   * o plano corrige o feed de graça, inclusive para eventos de meses atrás.
   */
  describe('the theme of the day (task 38e)', () => {
    const BOOK_ID = 'book-do-clube';
    const OTHER_BOOK_ID = 'book-de-outro-clube';
    const DAY_ID = 'plan-dia-3';
    const NEXT_DAY_ID = 'plan-dia-4';

    /** O dia do plano como o admin o cadastrou. */
    async function planTheDay(
      title: string,
      id: string = DAY_ID,
      bookId: string = BOOK_ID,
    ): Promise<void> {
      await planItems.saveMany([
        aPlanItem({
          id,
          bookId,
          date: id === DAY_ID ? '2026-10-03' : '2026-10-04',
          title,
        }),
      ]);
    }

    it('says the theme of the day the event points at', async () => {
      await planTheDay('Cap. 3 — A promessa');
      await events.save(anEvent('e1', { bookId: BOOK_ID, planItemId: DAY_ID }));

      const [entry] = await useCase.execute(validInput());

      expect(entry?.planItemTitle).toBe('Cap. 3 — A promessa');
    });

    /**
     * ⚠️ **REGRA 2 — A PROVA DE QUE O TÍTULO NÃO ENVELHECE, e ela é teste e não
     * comentário.**
     *
     * Grava o evento, o admin **corrige o plano**, o feed é lido de novo — e o
     * que aparece é o título NOVO. Sem este caso, a decisão que separa esta
     * fatia da recusa da Tarefa 35 seria só uma frase: um `planItemTitle`
     * gravado dentro do evento passaria em todos os outros testes daqui.
     *
     * As duas metades são necessárias: que o novo está, e que o velho **não**
     * está — senão um título concatenado ("o velho / o novo") ficaria verde.
     */
    it('⚠️ reads the title from the CURRENT plan, so correcting the plan corrects the past', async () => {
      const AS_TYPED = 'Cap. 3 — A promesa';
      const AS_CORRECTED = 'Cap. 3 — A promessa';

      await planTheDay(AS_TYPED);
      await events.save(anEvent('e1', { bookId: BOOK_ID, planItemId: DAY_ID }));

      // ⚠️ O feed é lido ANTES da correção também, e isso não é decoração: com
      // uma leitura só, um título guardado em cache na primeira resposta (o
      // envelhecimento com outro nome) passaria sem acusador nenhum.
      const [before] = await useCase.execute(validInput());
      expect(before?.planItemTitle).toBe(AS_TYPED);

      // O admin corrige o plano DEPOIS de o evento ter nascido.
      await planTheDay(AS_CORRECTED);

      const [entry] = await useCase.execute(validInput());

      /*
        ⚠️ **`toContain` NA PRIMEIRA, e é o que torna as duas metades DUAS.**
        Com `toBe(AS_CORRECTED)`, a segunda linha era implicada pela primeira e
        não podia falhar sozinha — duas asserções, uma propriedade. Assim a
        primeira aceita um título que CONTENHA o novo, e a segunda é a que pega
        o concatenado ("o velho / o novo") que o docblock diz temer.
      */
      expect(entry?.planItemTitle).toContain(AS_CORRECTED);
      expect(entry?.planItemTitle).not.toContain(AS_TYPED);
    });

    /**
     * ⚠️ **REGRA 3, o PRIMEIRO `null`: o evento não tem dia.** A anotação avulsa
     * e o grifo gravam `planItemId: null` — não há título a resolver, e a tela
     * cai na frase que só diz o livro.
     */
    it('gives a null title to what has no day at all', async () => {
      await planTheDay('Cap. 3 — A promessa');
      await events.save(
        anEvent('e1', {
          type: 'FREE_NOTE',
          bookId: BOOK_ID,
          planItemId: null,
          subjectId: 'n-1',
        }),
      );

      const [entry] = await useCase.execute(validInput());

      expect(entry?.planItemTitle).toBeNull();
    });

    /**
     * ⚠️ **REGRA 3, o SEGUNDO `null`: o dia EXISTIA e sumiu** — o admin tirou
     * aquele dia do plano. E o que este caso prova não é o `null`: é que a
     * **linha continua na lista**.
     *
     * Um `.filter()` mal posto na junção some com o evento inteiro, e o teste do
     * primeiro `null` não pega isso — lá o evento nem tem dia. Por isso o
     * fixture tem DUAS linhas: a do dia que sumiu e uma vizinha, e as duas
     * continuam no feed.
     */
    it('⚠️ keeps the line when the day was REMOVED from the plan, with no title', async () => {
      await planTheDay('Cap. 4 — O caminho', NEXT_DAY_ID);
      await events.save(anEvent('e1', { bookId: BOOK_ID, planItemId: DAY_ID }));
      await events.save(
        anEvent('e2', {
          bookId: BOOK_ID,
          planItemId: NEXT_DAY_ID,
          subjectId: 'n-2',
        }),
      );

      const found = await useCase.execute(validInput());

      // A linha do dia removido NÃO sumiu: as duas estão lá.
      expect(found.map((entry) => entry.id).sort()).toEqual(['e1', 'e2']);
      const orphan = found.find((entry) => entry.id === 'e1');
      expect(orphan?.planItemTitle).toBeNull();
      // ⚠️ E o `planItemId` continua no evento: o log é imutável, e quem apaga
      // o dia do plano não reescreve o passado.
      expect(orphan?.planItemId).toBe(DAY_ID);
      // O par positivo: a vizinha, cujo dia continua no plano, tem título.
      expect(found.find((entry) => entry.id === 'e2')?.planItemTitle).toBe(
        'Cap. 4 — O caminho',
      );
    });

    /**
     * ⚠️ **REGRA 4 — O CORTE DE TENANT, COM O ATOR LEGÍTIMO** (§7.5).
     *
     * O forasteiro leva 404 antes da consulta, então testar com ele provaria a
     * barreira errada. Quem pede aqui é o MEMBRO, e o que não pode chegar é um
     * título de um livro que **não está no feed** — a segunda barreira da
     * decisão D: o `bookIds` corta mesmo com o id do dia na mão.
     *
     * O par positivo é o mesmo dia, com o livro dele dentro do feed: sem ele,
     * "o título nunca vem" passaria.
     */
    it('⚠️ never brings a title from a book outside the feed, asked by a MEMBER', async () => {
      const SMUGGLED = 'plan-do-outro-clube';
      await planItems.saveMany([
        aPlanItem({
          id: SMUGGLED,
          bookId: OTHER_BOOK_ID,
          date: '2026-10-09',
          title: 'O tema do outro clube',
        }),
      ]);
      await events.save(
        anEvent('e1', { bookId: BOOK_ID, planItemId: SMUGGLED }),
      );

      const [entry] = await useCase.execute(validInput());

      expect(entry?.planItemTitle).toBeNull();

      // O par positivo: o MESMO dia, agora com o livro dele no feed.
      await events.save(
        anEvent('e2', {
          bookId: OTHER_BOOK_ID,
          planItemId: SMUGGLED,
          subjectId: 'n-2',
        }),
      );
      const found = await useCase.execute(validInput());
      expect(found.find((row) => row.id === 'e2')?.planItemTitle).toBe(
        'O tema do outro clube',
      );
    });

    /**
     * ⚠️ **REGRA 5 — UMA CONSULTA A MAIS, PROVADA POR CONTADOR DE CHAMADAS**
     * (§7.3), nunca por cronômetro.
     *
     * Três eventos, dois dias: `findCalls` continua **1**. Uma junção escrita
     * como `for (const event of events) await planItems.byId(...)` daria o MESMO
     * resultado e três idas ao banco — o contador é a única coisa que as separa.
     *
     * E o `findFilters` prova o resto: que os ids vão **deduplicados** (dois
     * eventos do mesmo dia não pedem o dia duas vezes) e que os livros do
     * recorte são os do próprio feed.
     */
    it('⚠️ asks the plan ONCE for the whole feed, with the days deduplicated', async () => {
      await planTheDay('Cap. 3 — A promessa');
      await planTheDay('Cap. 4 — O caminho', NEXT_DAY_ID, OTHER_BOOK_ID);
      await events.save(anEvent('e1', { bookId: BOOK_ID, planItemId: DAY_ID }));
      await events.save(
        anEvent('e2', {
          bookId: BOOK_ID,
          planItemId: DAY_ID,
          subjectId: 'n-2',
        }),
      );
      await events.save(
        anEvent('e3', {
          bookId: OTHER_BOOK_ID,
          planItemId: NEXT_DAY_ID,
          subjectId: 'n-3',
        }),
      );

      await useCase.execute(validInput());

      expect(planItems.findCalls).toBe(1);

      // Ordenado antes de comparar: nenhum port promete ordem (§7.2), e o
      // assunto aqui é o CONTEÚDO do filtro.
      const [filter] = planItems.findFilters;
      expect([...(filter?.ids ?? [])].sort()).toEqual(
        [DAY_ID, NEXT_DAY_ID].sort(),
      );
      expect([...(filter?.bookIds ?? [])].sort()).toEqual(
        [BOOK_ID, OTHER_BOOK_ID].sort(),
      );
      // ⚠️ E NENHUMA chave à toa: um `date` aqui pediria o dia de hoje e
      // devolveria nada para todo evento antigo do feed.
      expect(Object.keys(filter ?? {}).sort()).toEqual(['bookIds', 'ids']);
    });

    /**
     * ⚠️ **REGRA 6 — feed sem dia nenhum pede uma lista VAZIA de ids**, e o port
     * é o dono da regra que a transforma em "nem vai ao banco" (o `IN ()` que a
     * impl Prisma e o fake recusam, cada um com o seu teste).
     *
     * A alternativa seria o UseCase decidir não chamar — e aí a regra teria DOIS
     * donos, que é como uma delas fica para trás.
     */
    it('asks for no day at all when no event of the feed has one', async () => {
      await planTheDay('Cap. 3 — A promessa');
      const highlight = anEvent('e1', {
        type: 'HIGHLIGHT',
        bookId: BOOK_ID,
        planItemId: null,
        subjectId: 'h-1',
      });
      await events.save(highlight);

      const found = await useCase.execute(validInput());

      expect(planItems.findFilters).toEqual([{ bookIds: [BOOK_ID], ids: [] }]);
      // E a linha continua inteira: o título é `null`, não um buraco.
      expect(found).toEqual([withoutTitle(highlight)]);
    });
  });
});
