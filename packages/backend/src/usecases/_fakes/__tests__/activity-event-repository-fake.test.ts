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
 * O port tem **um método só** (`save`): nada lê eventos nesta fatia, e o `find`
 * chega na Tarefa 34 junto da implementação Prisma, na mesma unidade (§6.9).
 * Não há `update` nem `delete`: o evento é log imutável — nada o reescreve,
 * nada o arquiva e nada o apaga.
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
});
