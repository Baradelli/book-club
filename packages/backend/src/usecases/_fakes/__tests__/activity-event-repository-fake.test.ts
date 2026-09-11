import { ACTIVITY_FEED_DEFAULT_LIMIT } from '@clube/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ActivityEvent } from '../../../domain/activity-event';
import { anActivityEvent, required } from '../../../test-support/builders';
import { ActivityEventRepositoryFake } from '../activity-event-repository-fake';

const MARIA_ID = 'user-maria';
const MARCOS_ID = 'user-marcos';

/**
 * Regra 16 — o fake do `ActivityEvent` tem suíte própria, como os doze fakes
 * anteriores.
 *
 * O port nasceu com **um método só** (`save`) na 33 e ganhou o `find` na
 * **Tarefa 34**, junto da implementação Prisma, na mesma unidade (§6.9) — o
 * bloco `find` no rodapé deste arquivo é o dela. Não há `update` nem `delete`:
 * o evento é log imutável — nada o reescreve, nada o arquiva e nada o apaga.
 */
describe('ActivityEventRepositoryFake', () => {
  let events: ActivityEventRepositoryFake;

  beforeEach(() => {
    events = new ActivityEventRepositoryFake();
  });

  /**
   * ⚠️ Regra 3 — o que a entidade NÃO tem, e quem é a barreira.
   *
   * Sem `status`, sem `archivedAt` e sem `updatedAt` (decisão H): o evento é
   * log imutável. Quem recusa é o **COMPILADOR**, e a prova é este bloco mais
   * o `pnpm -r typecheck` — o padrão do §7.1.1, não um teste de runtime por
   * campo. A asserção de runtime que fecha a regra 3 está no
   * `record-activity.test.ts` (`stores exactly the eight fields of the
   * entity...`), sobre a linha que o UseCase **monta**, que é onde o objeto
   * nasce.
   */
  it('refuses at compile time a status, an archivedAt and a second instant', () => {
    // Um objeto POR campo: o TypeScript para de reportar propriedade em
    // excesso assim que o literal já tem um erro de atribuição, e os
    // `@ts-expect-error` seguintes sairiam como "unused directive".
    const withStatus: Partial<ActivityEvent> = {
      // @ts-expect-error log imutável não se arquiva
      status: 'ACTIVE',
    };
    const withUpdatedAt: Partial<ActivityEvent> = {
      // @ts-expect-error nada reescreve a linha (ADR 0008)
      updatedAt: new Date(),
    };

    expect(Object.keys(withStatus)).toEqual(['status']);
    expect(Object.keys(withUpdatedAt)).toEqual(['updatedAt']);
  });

  describe('save', () => {
    it('stores the event and gives back an equal copy', async () => {
      const event = anActivityEvent({ userId: MARIA_ID });

      const saved = await events.save(event);

      expect(saved).toEqual(event);
      expect(events.saved).toHaveLength(1);
      expect(required(events.saved[0])).toEqual(event);
    });

    /**
     * ⚠️ **Quatro eventos do mesmo par `(userId, type)` convivem**, e é a
     * pergunta do §7.1 respondida na direção que esconde melhor: o fake que
     * recusasse o segundo ficaria **mais restritivo que o Postgres** — a tabela
     * da Tarefa 34 não tem `@@unique` nenhum, porque escrever a nota do dia 1 e
     * a do dia 2 são dois acontecimentos, e grifar o mesmo livro duas vezes
     * também.
     *
     * Quem impede a enxurrada do autosave **não é o banco**: é a decisão A, no
     * UseCase, que só dispara no nascimento (`created === true`). Emular
     * unicidade aqui esconderia exatamente o bug que a decisão A existe para
     * impedir, com a suíte verde.
     */
    it('keeps every event of the same person and type, because nothing is unique', async () => {
      await events.save(anActivityEvent({ id: 'e1', userId: MARIA_ID }));
      await events.save(anActivityEvent({ id: 'e2', userId: MARIA_ID }));
      await events.save(anActivityEvent({ id: 'e3', userId: MARIA_ID }));

      expect(events.saved).toHaveLength(3);
      expect(events.saveCalls).toBe(3);
    });

    it('keeps one row per person for the same subject', async () => {
      await events.save(
        anActivityEvent({ id: 'e1', userId: MARIA_ID, subjectId: 'note-9' }),
      );
      await events.save(
        anActivityEvent({ id: 'e2', userId: MARCOS_ID, subjectId: 'note-9' }),
      );

      expect(events.saved.map((event) => event.userId).sort()).toEqual([
        MARCOS_ID,
        MARIA_ID,
      ]);
    });

    // Upsert por `id`, a convenção dos outros repositórios (Tarefa 03).
    it('overwrites the row when the same id comes back', async () => {
      await events.save(anActivityEvent({ id: 'e1', subjectId: 'note-1' }));
      await events.save(anActivityEvent({ id: 'e1', subjectId: 'note-2' }));

      expect(events.saved).toHaveLength(1);
      expect(required(events.saved[0]).subjectId).toBe('note-2');
    });

    it('accepts a null planItemId, because the free note and the highlight have no day', async () => {
      await events.save(
        anActivityEvent({ type: 'FREE_NOTE', planItemId: null }),
      );

      expect(required(events.saved[0]).planItemId).toBeNull();
    });

    /**
     * Clona nos dois sentidos: nem o chamador contamina o acervo, nem o acervo
     * devolve referência sua. Só o `createdAt` precisa de cópia — o Prisma
     * devolve `Date` nova a cada leitura —, e não há clone profundo a fazer: a
     * entidade não tem nenhum campo mutável por dentro (nada de `doc`).
     */
    it('never shares the Date it stored with the caller', async () => {
      const event = anActivityEvent();
      const instant = event.createdAt.getTime();

      const saved = await events.save(event);
      saved.createdAt.setUTCFullYear(1999);
      event.createdAt.setUTCFullYear(1998);

      expect(required(events.saved[0]).createdAt.getTime()).toBe(instant);
    });
  });

  describe('counters', () => {
    /**
     * §7.3 — o contador conta a **chamada, não o sucesso**, e o lado POSITIVO
     * é afirmado aqui: um contador só afirmado como `toBe(0)` é meio contador,
     * porque um incremento que alguém apague deixa todo `toBe(0)` passar por
     * acidente (§7.4).
     *
     * Ele é a espinha da fatia inteira: as regras 8, 9 e 11 da Tarefa 33 não
     * existem sem ele — "não registrou" e "registrou e o acervo ficou igual"
     * dão o mesmo `saved`, e é a diferença entre um feed com um evento e um
     * feed com dezenas por meia hora de autosave.
     */
    it('counts every save, starting at zero', async () => {
      expect(events.saveCalls).toBe(0);

      await events.save(anActivityEvent({ id: 'e1' }));
      expect(events.saveCalls).toBe(1);

      await events.save(anActivityEvent({ id: 'e2' }));
      await events.save(anActivityEvent({ id: 'e3' }));
      expect(events.saveCalls).toBe(3);
    });

    // Conta a CHAMADA, não a linha: um upsert que converge sobre uma linha
    // existente também foi uma tentativa.
    it('counts an upsert over an existing id as a call', async () => {
      await events.save(anActivityEvent({ id: 'e1' }));
      await events.save(anActivityEvent({ id: 'e1' }));

      expect(events.saveCalls).toBe(2);
      expect(events.saved).toHaveLength(1);
    });
  });

  /**
   * ⚠️ **ARMADILHA DELIBERADA — não "conserte" esta ordem** (§7.2). O `saved`
   * enumera na ordem INVERSA à de inserção, como os doze fakes anteriores.
   *
   * Ela nasce **antes** de existir um `find` (que é da Tarefa 34) pelo mesmo
   * motivo pelo qual o fake do grifo a teve na Tarefa 22 sem `find`: o feed
   * encontra a armadilha pronta em vez de uma ordem "natural" de que alguém
   * poderia depender no meio do caminho — e o feed é justamente uma tela
   * ORDENADA, então é lá que confiar na ordem do repositório morderia.
   */
  it('enumerates in reverse insertion order', async () => {
    await events.save(anActivityEvent({ id: 'e1' }));
    await events.save(anActivityEvent({ id: 'e2' }));
    await events.save(anActivityEvent({ id: 'e3' }));

    expect(events.saved.map((event) => event.id)).toEqual(['e3', 'e2', 'e1']);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Tarefa 34 — o `find` do feed
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * O `find` chegou na Tarefa 34, **junto da implementação Prisma, na mesma
   * unidade** (§6.9).
   *
   * ⚠️ **Ele é o ÚNICO `find` do projeto que promete ordem**, e é por isso que
   * este bloco existe mesmo com o contrato provando a mesma coisa contra o
   * Postgres: o fake que não ordenasse seria a infidelidade do §7.1 na direção
   * permissiva — os UseCases escritos contra ele afirmariam uma ordem que só o
   * banco entrega, e o dia em que alguém trocasse o repositório a suíte não
   * diria nada.
   */
  describe('find', () => {
    const CLUB = 'club-1';
    const OTHER_CLUB = 'club-2';

    function at(iso: string): Date {
      return new Date(iso);
    }

    describe('the tenant cut', () => {
      it('returns only the events of the asked club', async () => {
        const mine = anActivityEvent({ id: 'e1', clubId: CLUB });
        const theirs = anActivityEvent({ id: 'e2', clubId: OTHER_CLUB });
        await events.save(mine);
        await events.save(theirs);

        expect(await events.find({ clubId: CLUB })).toEqual([mine]);
        // A precondição: o outro EXISTE e é achado pelo clube dele — senão um
        // `find` que devolvesse vazio passaria no teste de cima.
        expect(await events.find({ clubId: OTHER_CLUB })).toEqual([theirs]);
      });

      it('returns an empty list for a club where nothing happened', async () => {
        await events.save(anActivityEvent({ id: 'e1', clubId: CLUB }));

        expect(await events.find({ clubId: 'club-ghost' })).toEqual([]);
      });
    });

    describe('the order, which is the product', () => {
      /**
       * ⚠️ **FIXTURE HOSTIL, e as precondições pinadas** (§7.2). Três eventos em
       * que a ordem de inserção, a alfabética dos ids e a cronológica
       * **discordam** — as quatro implementações erradas plausíveis dão
       * resultados diferentes do esperado:
       *
       * ```
       * esperado (createdAt desc)   b, c, a
       * a enumeração do fake        c, a, b   (inversa da inserção)
       * a ordem de inserção         b, a, c
       * orderBy id asc              a, b, c
       * ```
       */
      it('returns the newest first, with insertion order, id and clock disagreeing', async () => {
        await events.save(
          anActivityEvent({ id: 'b', createdAt: at('2026-10-03T00:00:00Z') }),
        );
        await events.save(
          anActivityEvent({ id: 'a', createdAt: at('2026-10-01T00:00:00Z') }),
        );
        await events.save(
          anActivityEvent({ id: 'c', createdAt: at('2026-10-02T00:00:00Z') }),
        );

        // As precondições: a armadilha de ordem do fake continua armada, e ela
        // NÃO é o resultado esperado.
        expect(events.saved.map((event) => event.id)).toEqual(['c', 'a', 'b']);

        expect((await events.find({ clubId: CLUB })).map((e) => e.id)).toEqual([
          'b',
          'c',
          'a',
        ]);
      });

      /**
       * ⚠️ O desempate por `id` ASC. `createdAt desc` sozinho não é ordem total,
       * e empate no mesmo milissegundo é o caso normal de um clube — duas pessoas
       * salvando ao mesmo tempo, o retry da fila offline.
       */
      it('breaks a createdAt tie by id, ascending', async () => {
        const tie = at('2026-10-05T12:00:00Z');
        await events.save(anActivityEvent({ id: 'z', createdAt: tie }));
        await events.save(anActivityEvent({ id: 'm', createdAt: tie }));
        await events.save(anActivityEvent({ id: 'a', createdAt: tie }));

        expect((await events.find({ clubId: CLUB })).map((e) => e.id)).toEqual([
          'a',
          'm',
          'z',
        ]);
      });
    });

    describe('the limit', () => {
      async function saveDays(count: number): Promise<void> {
        for (let i = 0; i < count; i += 1) {
          await events.save(
            anActivityEvent({
              id: `e${String(i).padStart(4, '0')}`,
              createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, i)),
            }),
          );
        }
      }

      it('honours an explicit limit, keeping the newest', async () => {
        await saveDays(5);

        const found = await events.find({ clubId: CLUB, limit: 2 });

        expect(found.map((e) => e.id)).toEqual(['e0004', 'e0003']);
        // A precondição: sem o limite as cinco voltam.
        expect(await events.find({ clubId: CLUB })).toHaveLength(5);
      });

      /**
       * ⚠️ **O PADRÃO do port, emulado aqui porque o banco o aplica** (§7.1: o
       * fake mais permissivo que o Postgres esconde bug igual). Um fake sem teto
       * devolveria o acervo inteiro, e um UseCase escrito contra ele afirmaria um
       * feed que a produção corta.
       */
      it('falls back to ACTIVITY_FEED_DEFAULT_LIMIT when nobody asks', async () => {
        await saveDays(ACTIVITY_FEED_DEFAULT_LIMIT + 1);

        const found = await events.find({ clubId: CLUB });

        expect(found).toHaveLength(ACTIVITY_FEED_DEFAULT_LIMIT);
        // ...e o que ficou de fora é o MAIS ANTIGO, não um qualquer.
        expect(found.map((e) => e.id)).not.toContain('e0000');
        expect(events.saved).toHaveLength(ACTIVITY_FEED_DEFAULT_LIMIT + 1);
      });

      it('returns everything when the limit is bigger than the club', async () => {
        await saveDays(3);

        expect(await events.find({ clubId: CLUB, limit: 100 })).toHaveLength(3);
      });

      /**
       * ⚠️ **A normalização do `limit` é do PORT, e o fake chama a mesma
       * função** (§7.1: um fake que não a aplicasse divergiria do Postgres).
       *
       * A divergência seria feia dos dois lados, e por motivos DIFERENTES: no
       * Prisma o `take` é com sinal (`-1` traz os mais ANTIGOS), e aqui um
       * `slice(0, -1)` cortaria o ÚLTIMO elemento. Duas implementações erradas,
       * duas respostas erradas, nenhuma exceção — exatamente a família
       * "vazio × resultado errado" do §7.1.
       */
      it.each([
        ['a negative limit', -1],
        ['a very negative limit', -50],
        ['zero', 0],
      ])('clamps %s to a single newest event', async (_label, limit) => {
        await saveDays(3);

        const found = await events.find({ clubId: CLUB, limit });

        expect(found.map((e) => e.id)).toEqual(['e0002']);
      });

      it('truncates a fractional limit instead of passing it on', async () => {
        await saveDays(3);

        expect(await events.find({ clubId: CLUB, limit: 2.9 })).toHaveLength(2);
      });
    });

    describe('the counters (§7.3)', () => {
      /**
       * §7.3 — o contador conta a **chamada, não o sucesso**, e o lado POSITIVO é
       * afirmado aqui: sem ele, um incremento que alguém apague deixa todo
       * `toBe(0)` do corte de tenant passar por acidente (§7.4).
       */
      it('counts every find, starting at zero', async () => {
        expect(events.findCalls).toBe(0);

        await events.find({ clubId: CLUB });
        expect(events.findCalls).toBe(1);

        await events.find({ clubId: CLUB });
        await events.find({ clubId: OTHER_CLUB });
        expect(events.findCalls).toBe(3);
      });

      /**
       * O contador não distingue "o filtro foi para o repositório" de "o
       * resultado deu certo" (§7.3) — este distingue. É por ele que o
       * `listActivity` prova que manda **um** filtro só, com o `clubId` do
       * recurso e **nenhuma chave à toa**.
       */
      it('pins a copy of every filter it was given', async () => {
        const filter = { clubId: CLUB, limit: 3 };

        await events.find(filter);
        filter.limit = 999;

        expect(events.findFilters).toEqual([{ clubId: CLUB, limit: 3 }]);
      });
    });

    /** Nem o acervo devolve referência sua, nem o chamador o contamina. */
    it('never shares the Date it stored with the caller', async () => {
      const event = anActivityEvent({ id: 'e1' });
      const instant = event.createdAt.getTime();
      await events.save(event);

      const found = required((await events.find({ clubId: CLUB }))[0]);
      found.createdAt.setUTCFullYear(1999);

      expect(
        required((await events.find({ clubId: CLUB }))[0]).createdAt.getTime(),
      ).toBe(instant);
    });
  });
});
