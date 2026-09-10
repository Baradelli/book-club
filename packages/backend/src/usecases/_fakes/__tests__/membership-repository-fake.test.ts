import { beforeEach, describe, expect, it } from 'vitest';

import { aMembership, required } from '../../../test-support/builders';
import { MembershipRepositoryFake } from '../membership-repository-fake';

const CLUB_ID = 'club-1';
const USER_ID = 'user-1';

describe('MembershipRepositoryFake', () => {
  let memberships: MembershipRepositoryFake;

  beforeEach(() => {
    memberships = new MembershipRepositoryFake();
  });

  describe('Date fidelity', () => {
    it('does not let the caller corrupt the store through a Date it read', async () => {
      await memberships.save(aMembership());

      const read = required(await memberships.byUserAndClub(USER_ID, CLUB_ID));
      read.joinedAt.setFullYear(1999);

      const reread = required(
        await memberships.byUserAndClub(USER_ID, CLUB_ID),
      );
      expect(reread.joinedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });

    it('does not let the caller corrupt the store through a Date it saved', async () => {
      const joinedAt = new Date('2026-01-01T00:00:00.000Z');
      await memberships.save(aMembership({ joinedAt }));

      joinedAt.setFullYear(1999);

      const read = required(await memberships.byUserAndClub(USER_ID, CLUB_ID));
      expect(read.joinedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });

    it('does not let the caller corrupt the store through the Date it got back from save', async () => {
      const returned = await memberships.save(aMembership());

      returned.joinedAt.setFullYear(1999);

      const read = required(await memberships.byUserAndClub(USER_ID, CLUB_ID));
      expect(read.joinedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });

    it('returns a different Date instance on every read', async () => {
      await memberships.save(aMembership());

      const first = required(await memberships.byUserAndClub(USER_ID, CLUB_ID));
      const second = required(
        await memberships.byUserAndClub(USER_ID, CLUB_ID),
      );

      expect(first.joinedAt).not.toBe(second.joinedAt);
      expect(first.joinedAt).toEqual(second.joinedAt);
    });

    it('clones the Dates exposed by the saved getter', async () => {
      await memberships.save(aMembership());

      const [first] = memberships.saved;
      required(first).joinedAt.setFullYear(1999);

      const read = required(await memberships.byUserAndClub(USER_ID, CLUB_ID));
      expect(read.joinedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });
  });

  describe('findByUser', () => {
    it('returns only the ACTIVE memberships of the user', async () => {
      await memberships.save(
        aMembership({ userId: USER_ID, clubId: 'club-1' }),
      );
      await memberships.save(
        aMembership({ userId: USER_ID, clubId: 'club-2' }),
      );
      await memberships.save(
        aMembership({
          userId: USER_ID,
          clubId: 'club-3',
          status: 'ARCHIVED',
        }),
      );
      await memberships.save(
        aMembership({ userId: 'user-outra', clubId: 'club-1' }),
      );

      const found = await memberships.findByUser(USER_ID);

      expect(found.map((m) => m.clubId).sort()).toEqual(['club-1', 'club-2']);
    });

    it('returns an empty array when the user has none', async () => {
      await expect(memberships.findByUser('user-ghost')).resolves.toEqual([]);
    });

    it('clones the Dates it returns', async () => {
      await memberships.save(aMembership({ userId: USER_ID }));

      const [first] = await memberships.findByUser(USER_ID);
      required(first).joinedAt.setFullYear(1999);

      const [again] = await memberships.findByUser(USER_ID);
      expect(required(again).joinedAt).toEqual(
        new Date('2026-01-01T00:00:00.000Z'),
      );
    });

    /*
      O teste DEDICADO da armadilha, um por método de coleção — é o que o §7.2
      manda, e é o que faltava aqui.

      A inversão do `findByUser` entrou na rodada de correção da Tarefa 26a
      **medida em 0 acusadores** (nada dependia da ordem). Mas "0 acusadores" é
      exatamente a razão de este teste existir: sem ele, a inversão é fidelidade
      afirmada em docblock e não em teste — a que o próximo refactor apaga
      (§7.1). Os clubes são escolhidos para que inserção, inversa e ordem
      alfabética sejam TRÊS ordens diferentes.
    */
    it('enumerates in reverse insertion order', async () => {
      await memberships.save(
        aMembership({ userId: USER_ID, clubId: 'club-b-inserido-1o' }),
      );
      await memberships.save(
        aMembership({ userId: USER_ID, clubId: 'club-a-inserido-2o' }),
      );
      await memberships.save(
        aMembership({ userId: USER_ID, clubId: 'club-c-inserido-3o' }),
      );

      expect(memberships.saved.map((m) => m.clubId)).toEqual([
        'club-b-inserido-1o',
        'club-a-inserido-2o',
        'club-c-inserido-3o',
      ]);

      const found = await memberships.findByUser(USER_ID);

      expect(found.map((m) => m.clubId)).toEqual([
        'club-c-inserido-3o',
        'club-a-inserido-2o',
        'club-b-inserido-1o',
      ]);
    });
  });

  /**
   * Tarefa 26a, regra 14.
   *
   * A pergunta do §7.1 ("o Postgres faria isto?") tem uma resposta que separa
   * este método do `findByUser` vizinho: o `findByClub` é um
   * `findMany({ where: { clubId } })` **sem** filtro de status, então o fake
   * também não filtra. Um fake que devolvesse só os `ACTIVE` seria a direção
   * RESTRITIVA do §7.1 — a que esconde melhor, porque a suíte fica verde — e
   * apagaria justamente a decisão A da fatia: quem saiu do clube continua
   * tendo nome no acervo (ADR 0002).
   */
  describe('findByClub', () => {
    it('returns every membership of the club, ACTIVE and ARCHIVED', async () => {
      await memberships.save(
        aMembership({ userId: 'user-ativa', clubId: CLUB_ID }),
      );
      await memberships.save(
        aMembership({
          userId: 'user-saiu',
          clubId: CLUB_ID,
          status: 'ARCHIVED',
        }),
      );

      const found = await memberships.findByClub(CLUB_ID);

      // Ordenado antes de comparar: a ordem NÃO é o assunto deste teste, e
      // depender da armadilha do fake o quebraria por outro motivo (§7.2).
      expect(found.map((m) => `${m.userId}:${m.status}`).sort()).toEqual([
        'user-ativa:ACTIVE',
        'user-saiu:ARCHIVED',
      ]);
    });

    it('does not return the memberships of another club', async () => {
      await memberships.save(aMembership({ userId: USER_ID, clubId: CLUB_ID }));
      await memberships.save(
        aMembership({ userId: USER_ID, clubId: 'club-2' }),
      );
      await memberships.save(
        aMembership({ userId: 'user-2', clubId: 'club-2' }),
      );

      const found = await memberships.findByClub(CLUB_ID);

      expect(found.map((m) => m.userId)).toEqual([USER_ID]);
    });

    it('returns an empty array for a club with no membership', async () => {
      await memberships.save(aMembership({ userId: USER_ID, clubId: CLUB_ID }));

      await expect(memberships.findByClub('club-ghost')).resolves.toEqual([]);
    });

    // O teste DEDICADO da armadilha (§7.2): é aqui que a ordem é assunto, e
    // é só aqui que ela se pina. Os ids são escolhidos para que a ordem de
    // inserção, a inversa e a alfabética sejam TRÊS ordens diferentes — senão
    // uma implementação que não inverte coincidiria com a esperada.
    it('enumerates in reverse insertion order', async () => {
      await memberships.save(
        aMembership({ userId: 'b-inserida-1a', clubId: CLUB_ID }),
      );
      await memberships.save(
        aMembership({ userId: 'a-inserida-2a', clubId: CLUB_ID }),
      );
      await memberships.save(
        aMembership({ userId: 'c-inserida-3a', clubId: CLUB_ID }),
      );

      expect(memberships.saved.map((m) => m.userId)).toEqual([
        'b-inserida-1a',
        'a-inserida-2a',
        'c-inserida-3a',
      ]);

      const found = await memberships.findByClub(CLUB_ID);

      expect(found.map((m) => m.userId)).toEqual([
        'c-inserida-3a',
        'a-inserida-2a',
        'b-inserida-1a',
      ]);
    });

    it('clones the Dates it returns', async () => {
      await memberships.save(aMembership({ userId: USER_ID, clubId: CLUB_ID }));

      const [first] = await memberships.findByClub(CLUB_ID);
      required(first).joinedAt.setFullYear(1999);

      const [again] = await memberships.findByClub(CLUB_ID);
      expect(required(again).joinedAt).toEqual(
        new Date('2026-01-01T00:00:00.000Z'),
      );
    });

    // O contador do §7.3: conta a CHAMADA, não o resultado. É ele que deixa o
    // corte de tenant do `listClubMembers` provar "recusou ANTES de ler".
    it('counts every call, including the one that finds nothing', async () => {
      expect(memberships.findByClubCalls).toBe(0);

      await memberships.findByClub(CLUB_ID);
      await memberships.findByClub('club-ghost');

      expect(memberships.findByClubCalls).toBe(2);
    });
  });

  // O Postgres rejeita o par duplicado com violação de índice único; o fake
  // tem que rejeitar também, senão uma regressão da regra 12 passa em silêncio.
  describe('unique(userId, clubId)', () => {
    it('refuses a second membership for the same user and club', async () => {
      await memberships.save(aMembership({ id: 'membership-1' }));

      await expect(
        memberships.save(aMembership({ id: 'membership-2' })),
      ).rejects.toThrow(/unique\(userId, clubId\)/);
    });

    it('keeps only the first membership when the second is refused', async () => {
      await memberships.save(aMembership({ id: 'membership-1' }));

      await expect(
        memberships.save(aMembership({ id: 'membership-2' })),
      ).rejects.toThrow();

      expect(memberships.saved).toHaveLength(1);
      expect(required(memberships.saved[0]).id).toBe('membership-1');
    });

    it('refuses the duplicate pair even when the existing one is archived', async () => {
      await memberships.save(
        aMembership({ id: 'membership-1', status: 'ARCHIVED' }),
      );

      await expect(
        memberships.save(aMembership({ id: 'membership-2' })),
      ).rejects.toThrow(/unique\(userId, clubId\)/);
    });

    it('allows updating the same membership by id', async () => {
      await memberships.save(aMembership({ id: 'membership-1' }));

      const updated = await memberships.save(
        aMembership({ id: 'membership-1', role: 'ADMIN', status: 'ARCHIVED' }),
      );

      expect(updated.role).toBe('ADMIN');
      expect(updated.status).toBe('ARCHIVED');
      expect(memberships.saved).toHaveLength(1);
    });

    it('allows the same user in a different club', async () => {
      await memberships.save(aMembership({ id: 'membership-1' }));

      await memberships.save(
        aMembership({ id: 'membership-2', clubId: 'club-2' }),
      );

      expect(memberships.saved).toHaveLength(2);
    });

    it('allows a different user in the same club', async () => {
      await memberships.save(aMembership({ id: 'membership-1' }));

      await memberships.save(
        aMembership({ id: 'membership-2', userId: 'user-2' }),
      );

      expect(memberships.saved).toHaveLength(2);
    });
  });
});
