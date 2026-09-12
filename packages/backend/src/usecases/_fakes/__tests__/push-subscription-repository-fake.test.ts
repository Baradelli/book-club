import { beforeEach, describe, expect, it } from 'vitest';

import type { PushSubscription } from '../../../domain/push-subscription';
import { required } from '../../../test-support/builders';
import { PushSubscriptionRepositoryFake } from '../push-subscription-repository-fake';

/**
 * A suíte do fake, e ela existe pelo §7.1: **fake infiel é bug escondido**, e a
 * direção RESTRITIVA esconde melhor, porque a suíte fica verde.
 *
 * As três fidelidades que este fake emula estão no docblock dele, e cada uma
 * tem teste aqui. O par de verdade é o
 * `prisma-push-subscription-repository.contract.integration.test.ts`: o que
 * este arquivo afirma sobre o Postgres, é lá que está medido.
 */

const MARIA = 'maria';
const MARCOS = 'marcos';
const CREATED_AT = new Date('2026-10-01T18:30:45.123Z');
const DISABLED_AT = new Date('2026-10-02T09:00:00.456Z');

/** Fixture de objeto é FACTORY, nunca `const` de `describe` (§7.7). */
function aSubscription(
  overrides: Partial<PushSubscription> = {},
): PushSubscription {
  return {
    id: 'sub-1',
    userId: MARIA,
    platform: 'web',
    endpoint: 'https://push.test/endpoint-1',
    p256dh: 'p256dh-1',
    auth: 'auth-1',
    userAgent: 'Mozilla/5.0 (fixture)',
    disabledAt: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe('PushSubscriptionRepositoryFake', () => {
  let repo: PushSubscriptionRepositoryFake;

  beforeEach(() => {
    repo = new PushSubscriptionRepositoryFake();
  });

  describe('save', () => {
    it('stores the subscription and reads it back by endpoint and owner', async () => {
      const subscription = aSubscription();

      const saved = await repo.save(subscription);

      expect(saved).toEqual(subscription);
      await expect(
        repo.byEndpointAndUser(subscription.endpoint, MARIA),
      ).resolves.toEqual(subscription);
    });

    /**
     * ⚠️ **A FIDELIDADE Nº 1 (§7.1): o upsert é por `endpoint`, e o `id` da
     * linha que JÁ EXISTE manda.**
     *
     * O banco tem `@@unique([endpoint])`, então um `save` com id novo e endpoint
     * existente é um UPDATE — e só o CREATE do upsert leva o id que chegou. Um
     * fake indexado por `id` guardaria DUAS linhas do mesmo endpoint, que é o
     * que o Postgres recusa (direção permissiva), ou trocaria a chave primária
     * na reativação, que é o que o Prisma não faz.
     */
    it('upserts by endpoint, keeping the id of the row that already exists', async () => {
      const first = await repo.save(aSubscription({ id: 'sub-1' }));

      const again = await repo.save(
        aSubscription({ id: 'sub-2-gerado-agora', userAgent: 'outro' }),
      );

      expect(again.id).toBe(first.id);
      expect(again.userAgent).toBe('outro');
      expect(repo.saved).toHaveLength(1);
    });

    /** Dois endpoints diferentes da mesma pessoa convivem: dois aparelhos. */
    it('keeps two devices of the same person', async () => {
      await repo.save(
        aSubscription({ id: 'a', endpoint: 'https://push.test/a' }),
      );
      await repo.save(
        aSubscription({ id: 'b', endpoint: 'https://push.test/b' }),
      );

      expect(repo.saved).toHaveLength(2);
      await expect(repo.byUserId(MARIA)).resolves.toHaveLength(2);
    });

    /**
     * A REATIVAÇÃO (regra 10): o `disabledAt` do `save` sobrescreve o que estava
     * guardado. É o que o `update` do upsert do Prisma faz, e sem isso a
     * inscrição voltaria desligada.
     */
    it('reactivates by overwriting the disabledAt with null', async () => {
      const saved = await repo.save(aSubscription());
      await repo.update(saved.id, { disabledAt: DISABLED_AT });

      const back = await repo.save(aSubscription());

      expect(back.disabledAt).toBeNull();
      await expect(repo.byUserId(MARIA)).resolves.toHaveLength(1);
    });

    /** O mesmo endpoint para outra pessoa muda o dono — ver o port. */
    it('hands the row to the new owner when the endpoint comes back for someone else', async () => {
      await repo.save(aSubscription());

      const moved = await repo.save(aSubscription({ userId: MARCOS }));

      expect(moved.userId).toBe(MARCOS);
      await expect(repo.byUserId(MARIA)).resolves.toEqual([]);
      await expect(repo.byUserId(MARCOS)).resolves.toHaveLength(1);
    });

    /** A cópia é completa: mexer no fixture depois não muda o guardado (§7.7). */
    it('clones what it stores, dates included', async () => {
      // ⚠️ Um `Date` NOVO, e não a constante do módulo: este teste MEXE no
      // objeto depois de salvar, e passar `DISABLED_AT` aqui mudaria a
      // constante que os outros testes usam — o §7.7 morde o próprio teste que
      // o exercita.
      const subscription = aSubscription({
        disabledAt: new Date(DISABLED_AT),
      });
      await repo.save(subscription);

      required(subscription.disabledAt).setFullYear(1999);
      subscription.p256dh = 'mexido-por-fora';

      const stored = required(repo.saved[0]);
      expect(stored.disabledAt).toEqual(DISABLED_AT);
      expect(stored.p256dh).toBe('p256dh-1');
    });
  });

  describe('byEndpointAndUser', () => {
    /** O PAR: a inscrição de outra pessoa é inalcançável (decisão E da 30). */
    it('never finds the subscription of another person', async () => {
      const theirs = await repo.save(aSubscription({ userId: MARCOS }));

      await expect(
        repo.byEndpointAndUser(theirs.endpoint, MARIA),
      ).resolves.toBeNull();
      // A precondição: a linha existe, e é achada pelo dono dela.
      await expect(
        repo.byEndpointAndUser(theirs.endpoint, MARCOS),
      ).resolves.toEqual(theirs);
    });

    /** "Desligada" não é "inexistente" — ver o port. */
    it('finds a disabled subscription too', async () => {
      const saved = await repo.save(aSubscription());
      await repo.update(saved.id, { disabledAt: DISABLED_AT });

      const found = required(
        await repo.byEndpointAndUser(saved.endpoint, MARIA),
      );

      expect(found.disabledAt).toEqual(DISABLED_AT);
    });

    it('returns null for an endpoint nobody registered', async () => {
      await repo.save(aSubscription());

      await expect(
        repo.byEndpointAndUser('https://push.test/ghost', MARIA),
      ).resolves.toBeNull();
    });
  });

  describe('byUserId', () => {
    /**
     * ⚠️ **A FIDELIDADE Nº 2 (§7.1): só as ATIVAS.** O filtro é do repositório
     * (`NOTIFICACOES.md` §5), e um fake que devolvesse todas faria os testes do
     * envio da Tarefa 38 afirmarem uma regra que o banco não tem — com a suíte
     * verde.
     */
    it('returns only the active subscriptions', async () => {
      const active = await repo.save(
        aSubscription({ id: 'on', endpoint: 'https://push.test/on' }),
      );
      const off = await repo.save(
        aSubscription({ id: 'off', endpoint: 'https://push.test/off' }),
      );
      await repo.update(off.id, { disabledAt: DISABLED_AT });

      await expect(repo.byUserId(MARIA)).resolves.toEqual([active]);
      // A precondição: as DUAS estão guardadas — o filtro é o que corta.
      expect(repo.saved).toHaveLength(2);
    });

    it('never returns a subscription of another person', async () => {
      const mine = await repo.save(aSubscription());
      const theirs = await repo.save(
        aSubscription({
          id: 'other',
          endpoint: 'https://push.test/other',
          userId: MARCOS,
        }),
      );

      await expect(repo.byUserId(MARIA)).resolves.toEqual([mine]);
      await expect(repo.byUserId(MARCOS)).resolves.toEqual([theirs]);
    });

    /**
     * ⚠️ **A ARMADILHA DE ORDEM (§7.2), e é aqui que ela é ASSUNTO.** O port não
     * promete ordem, e a ordem que o Postgres devolve sem `ORDER BY` é
     * indefinida de verdade — então "invertida" é tão fiel quanto qualquer
     * outra, e é a única que **falha** quando alguém confia na ordem.
     */
    it('enumerates in reverse insertion order', async () => {
      await repo.save(
        aSubscription({ id: 'a', endpoint: 'https://push.test/a' }),
      );
      await repo.save(
        aSubscription({ id: 'b', endpoint: 'https://push.test/b' }),
      );
      await repo.save(
        aSubscription({ id: 'c', endpoint: 'https://push.test/c' }),
      );

      await expect((await repo.byUserId(MARIA)).map((row) => row.id)).toEqual([
        'c',
        'b',
        'a',
      ]);
    });
  });

  describe('update', () => {
    it('writes the disabledAt and keeps the row', async () => {
      const saved = await repo.save(aSubscription());

      const disabled = await repo.update(saved.id, {
        disabledAt: DISABLED_AT,
      });

      expect(disabled.disabledAt).toEqual(DISABLED_AT);
      expect(repo.saved).toHaveLength(1);
    });

    /**
     * ⚠️ **A FIDELIDADE Nº 3 (§7.1.1): o patch VAZIO não mexe em nada.**
     * `undefined` no `data` do Prisma **some da consulta**; um
     * `patch.disabledAt ?? null` aqui apagaria a desativação a cada patch
     * vazio. Snapshot antes/depois, e não `toBe` de campo escolhido à mão
     * (§7.6).
     */
    it('leaves everything alone when the patch is empty', async () => {
      const saved = await repo.save(aSubscription());
      await repo.update(saved.id, { disabledAt: DISABLED_AT });
      const before = required(repo.saved[0]);

      await repo.update(saved.id, {});

      expect(required(repo.saved[0])).toEqual(before);
    });

    /**
     * ⚠️ **O COMPILADOR É QUEM RECUSA O CAMPO PROIBIDO** (§7.1.1): o
     * `PushSubscriptionPatch` enumera os patcheáveis, e o `disabledAt` é o
     * único. Este `@ts-expect-error` mais o `pnpm -r typecheck` substituem um
     * teste de runtime por campo, em duas implementações.
     */
    it('does not even compile with a forbidden field in a fresh literal', async () => {
      const saved = await repo.save(aSubscription());

      await repo.update(saved.id, {
        // @ts-expect-error o dono da inscrição não se patcheia
        userId: MARCOS,
      });

      // E o que o tipo NÃO fecha continua fechado pelo fake: o `userId` não
      // mudou, porque o `update` copia campo a campo em vez de espalhar.
      expect(required(repo.saved[0]).userId).toBe(MARIA);
    });

    /**
     * ⚠️ **E a variável solta ATRAVESSA o compilador** (§7.1.1: a checagem de
     * propriedade em excesso só vale para objeto literal fresco) — então a
     * segunda metade da frase tem de ser verdadeira: **o fake recusa o resto**,
     * copiando campo a campo, exatamente como o `toUpdateData` do Prisma.
     */
    it('ignores a forbidden field that arrives through a loose variable', async () => {
      const saved = await repo.save(aSubscription());
      const loose = {
        disabledAt: DISABLED_AT,
        userId: MARCOS,
        auth: 'roubado',
      };

      await repo.update(saved.id, loose);

      const stored = required(repo.saved[0]);
      expect(stored.disabledAt).toEqual(DISABLED_AT);
      expect(stored.userId).toBe(MARIA);
      expect(stored.auth).toBe('auth-1');
    });

    /**
     * **Lança para um id que não existe**, e é fidelidade MEDIDA: o
     * `prisma.pushSubscription.update` levanta `P2025` — provado no teste de
     * contrato `states the precondition: update on a missing id raises P2025`.
     * Um fake que devolvesse `null` aqui deixaria a assinatura do port mentir.
     */
    it('throws for an id that does not exist, like Prisma does', async () => {
      await repo.save(aSubscription());

      await expect(repo.update('nao-existe', {})).rejects.toThrow(/nao-existe/);
    });
  });

  /**
   * Os contadores, e os DOIS lados de cada um (§7.3: um contador só afirmado
   * como `toBe(0)` é meio contador — um incremento que alguém apague deixaria
   * todo `toBe(0)` passar por acidente).
   */
  describe('the call counters', () => {
    it('starts at zero and counts the call, not the success', async () => {
      expect({
        save: repo.saveCalls,
        byEndpointAndUser: repo.byEndpointAndUserCalls,
        byUserId: repo.byUserIdCalls,
        update: repo.updateCalls,
      }).toEqual({
        save: 0,
        byEndpointAndUser: 0,
        byUserId: 0,
        update: 0,
      });

      await repo.save(aSubscription());
      await repo.save(aSubscription());
      await repo.byEndpointAndUser('https://push.test/ghost', MARIA);
      await repo.byUserId(MARIA);
      await repo.update('sub-1', {});
      // Uma chamada que LANÇA também foi uma tentativa, e é isso que o teste
      // quer saber (§7.3).
      await expect(repo.update('nao-existe', {})).rejects.toThrow();

      expect({
        save: repo.saveCalls,
        byEndpointAndUser: repo.byEndpointAndUserCalls,
        byUserId: repo.byUserIdCalls,
        update: repo.updateCalls,
      }).toEqual({
        save: 2,
        byEndpointAndUser: 1,
        byUserId: 1,
        update: 2,
      });
    });
  });
});
