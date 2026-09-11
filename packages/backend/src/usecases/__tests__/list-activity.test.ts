import { ACTIVITY_FEED_DEFAULT_LIMIT } from '@clube/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ActivityEvent } from '../../domain/activity-event';
import { NotAMemberError } from '../../domain/errors';
import { aMembership, anActivityEvent } from '../../test-support/builders';
import { ActivityEventRepositoryFake } from '../_fakes/activity-event-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { ListActivityInput } from '../list-activity';
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
  let useCase: ListActivity;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    events = new ActivityEventRepositoryFake();
    useCase = new ListActivity(new AssertMembership(memberships), events);

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
      ).resolves.toEqual([event]);
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

      await expect(useCase.execute(validInput())).resolves.toEqual([mine]);
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
});
