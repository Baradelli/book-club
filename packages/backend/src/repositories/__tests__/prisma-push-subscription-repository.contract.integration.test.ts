import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { PushSubscription } from '../../domain/push-subscription';
import { required } from '../../test-support/builders';
import { PrismaPushSubscriptionRepository } from '../prisma-push-subscription-repository';
import { prefixedEmail, prefixedId, prisma, removeFixtures } from './_db';

/**
 * ⚠️ **REGRAS 7, 9 e 13 DA TAREFA 36** — o contrato do `PushSubscription`
 * contra o Postgres de verdade.
 *
 * ⚠️ **A limpeza CONSULTA O BANCO** (§6.6), e aqui isso não é zelo: a Tarefa 34
 * mediu o preço de errar — uma FK nova quebrou o `afterAll` de **quatro**
 * arquivos de integração **com os testes verdes**, e fixture vazou no banco de
 * desenvolvimento do dono. `PushSubscription_userId_fkey` é `ON DELETE
 * RESTRICT`, então uma inscrição esquecida impede o `user.delete` de toda
 * limpeza que venha depois.
 *
 * Nada de `deleteMany({})`: os ids têm prefixo próprio (`t36`), e a consulta é
 * pelos usuários DESTE arquivo.
 */

const MARIA_ID = prefixedId('t36', 'ps-maria');
const MARCOS_ID = prefixedId('t36', 'ps-marcos');
const EVERY_USER_ID = [MARIA_ID, MARCOS_ID] as const;

const CREATED_AT = new Date('2026-10-01T18:30:45.123Z');
const DISABLED_AT = new Date('2026-10-02T09:00:00.456Z');

/** Endpoint único por execução: o `@@unique` da tabela é global. */
function anEndpoint(label: string): string {
  return `https://fcm.googleapis.com/fcm/send/t36-${label}-${randomUUID()}`;
}

/** Fixture de objeto é FACTORY, nunca `const` de `describe` (§7.7). */
function aSubscription(
  overrides: Partial<PushSubscription> = {},
): PushSubscription {
  return {
    id: prefixedId('t36', 'ps'),
    userId: MARIA_ID,
    platform: 'web',
    endpoint: anEndpoint('default'),
    p256dh: 'BFake-p256dh-da-maria',
    auth: 'fake-auth-da-maria',
    userAgent: 'Mozilla/5.0 (fixture)',
    disabledAt: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

/** Apaga TODA inscrição dos usuários deste arquivo, por id, consultando o banco. */
async function cleanUpSubscriptions(): Promise<void> {
  const rows = await prisma.pushSubscription.findMany({
    where: { userId: { in: [...EVERY_USER_ID] } },
    select: { id: true },
  });
  if (rows.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
  }
}

describe('PrismaPushSubscriptionRepository (contract)', () => {
  const repo = new PrismaPushSubscriptionRepository(prisma);

  beforeAll(async () => {
    // A inscrição antes do usuário: a FK é RESTRICT.
    await cleanUpSubscriptions();
    await removeFixtures({ userIds: [...EVERY_USER_ID] });

    for (const [id, label] of [
      [MARIA_ID, 'maria'],
      [MARCOS_ID, 'marcos'],
    ] as const) {
      await prisma.user.create({
        data: {
          id,
          email: prefixedEmail('t36', `ps-${label}`),
          name: 'Fixture Reader',
        },
      });
    }
  });

  afterAll(async () => {
    await cleanUpSubscriptions();
    await removeFixtures({ userIds: [...EVERY_USER_ID] });
    await prisma.$disconnect();
  });

  /**
   * Cada teste começa sem inscrição nenhuma das pessoas do arquivo: um teste de
   * contrato não pode depender do estado que outro deixou — um que dependia
   * passava verde rodado isolado, sem exercitar o filtro que dizia provar
   * (§6.6).
   */
  beforeEach(async () => {
    await cleanUpSubscriptions();
  });

  describe('save', () => {
    it('creates the subscription and maps every field back', async () => {
      const subscription = aSubscription();

      const saved = await repo.save(subscription);

      expect(saved).toEqual(subscription);
      expect(saved.createdAt).toBeInstanceOf(Date);
      // ...e o que volta do banco numa SEGUNDA leitura é o mesmo.
      expect(
        await repo.byEndpointAndUser(subscription.endpoint, MARIA_ID),
      ).toEqual(subscription);
    });

    /** `userAgent` e `disabledAt` nulos atravessam como ausência, não como texto. */
    it('stores a null userAgent and a null disabledAt as real nulls', async () => {
      const subscription = aSubscription({
        endpoint: anEndpoint('nulls'),
        userAgent: null,
      });

      const saved = await repo.save(subscription);

      expect(saved.userAgent).toBeNull();
      expect(saved.disabledAt).toBeNull();
      const rows = await prisma.$queryRaw<
        { agentnull: boolean; disablednull: boolean }[]
      >`
        SELECT "userAgent" IS NULL AS agentnull, "disabledAt" IS NULL AS disablednull
        FROM "PushSubscription" WHERE "id" = ${subscription.id}
      `;
      expect(required(rows[0])).toEqual({
        agentnull: true,
        disablednull: true,
      });
    });

    /**
     * ⚠️ O `createdAt` é do DOMÍNIO (ADR 0008), com precisão de milissegundo, e
     * a asserção é sobre a COLUNA — não só sobre o que o mapper devolveu. O
     * `@default(now())` do schema é rede de segurança, e este teste é o que
     * prova que ela não está mandando.
     */
    it('stores the createdAt the domain sent, down to the millisecond', async () => {
      const subscription = aSubscription({ endpoint: anEndpoint('instant') });

      await repo.save(subscription);

      const rows = await prisma.$queryRaw<{ at: string }[]>`
        SELECT to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS at
        FROM "PushSubscription" WHERE "id" = ${subscription.id}
      `;
      expect(required(rows[0]).at).toBe('2026-10-01T18:30:45.123');
    });

    /**
     * ⚠️ **REGRA 10, primeira metade — O UPSERT É POR `endpoint`, E NÃO POR
     * `id`.** É a decisão E, e é a divergência com todos os outros repositórios
     * do projeto.
     *
     * O segundo `save` chega com um id **novo** (é o que o UseCase gera, que não
     * sabe que a linha existe) e o MESMO endpoint. Com upsert por `id`, ele
     * bateria no `@@unique([endpoint])` e viraria `P2002` — que a borda **não
     * mapeia**, ou seja **500** na reativação de alguém. Aqui ele vira UPDATE da
     * linha que já existe, e o id que fica é o da primeira.
     */
    it('upserts by endpoint: a second save with a NEW id updates the same row', async () => {
      const endpoint = anEndpoint('upsert');
      const first = await repo.save(aSubscription({ endpoint }));

      const again = await repo.save(
        aSubscription({ endpoint, userAgent: 'Mozilla/5.0 (outro dia)' }),
      );

      expect(again.id).toBe(first.id);
      expect(again.userAgent).toBe('Mozilla/5.0 (outro dia)');
      await expect(
        prisma.pushSubscription.count({ where: { userId: MARIA_ID } }),
      ).resolves.toBe(1);
    });

    /**
     * ⚠️ **REGRA 10, segunda metade — O `POST` REATIVA** (`disabledAt = null`).
     *
     * É o caso comum do produto: a pessoa desliga o push, muda de ideia, e o
     * navegador devolve o MESMO endpoint. Se o `disabledAt` não atravessasse o
     * UPDATE, a inscrição voltaria a existir **desligada** — e o envio da
     * Tarefa 38, que lê só as ativas, nunca mandaria nada, sem erro nenhum.
     */
    it('reactivates a disabled subscription, clearing the disabledAt', async () => {
      const endpoint = anEndpoint('reactivate');
      const saved = await repo.save(aSubscription({ endpoint }));
      await repo.update(saved.id, { disabledAt: DISABLED_AT });

      // A precondição: ela está DESLIGADA antes do `save` de volta.
      expect(
        required(await repo.byEndpointAndUser(endpoint, MARIA_ID)).disabledAt,
      ).toEqual(DISABLED_AT);

      const back = await repo.save(aSubscription({ endpoint }));

      expect(back.disabledAt).toBeNull();
      expect(await repo.byUserId(MARIA_ID)).toHaveLength(1);
    });

    /**
     * O mesmo endpoint chegando para OUTRA pessoa muda o dono, e é deliberado
     * (ver o docblock do `save` no port): o endpoint é a identidade do
     * APARELHO, e quem está com o navegador na mão é quem vai receber o push de
     * fato. Manter o dono antigo mandaria a notificação da Maria para o
     * navegador do Marcos.
     */
    it('hands the row to the new owner when the same endpoint comes back for someone else', async () => {
      const endpoint = anEndpoint('handover');
      await repo.save(aSubscription({ endpoint }));

      const moved = await repo.save(
        aSubscription({ endpoint, userId: MARCOS_ID }),
      );

      expect(moved.userId).toBe(MARCOS_ID);
      expect(await repo.byUserId(MARIA_ID)).toEqual([]);
      expect(await repo.byUserId(MARCOS_ID)).toHaveLength(1);
    });

    /** Dois aparelhos da mesma pessoa convivem: não há `@@unique` por dono. */
    it('keeps two devices of the same person', async () => {
      await repo.save(aSubscription({ endpoint: anEndpoint('phone') }));
      await repo.save(
        aSubscription({ endpoint: anEndpoint('laptop'), platform: 'mobile' }),
      );

      await expect(
        prisma.pushSubscription.count({ where: { userId: MARIA_ID } }),
      ).resolves.toBe(2);
    });

    it('stores both platforms of the vocabulary', async () => {
      await repo.save(
        aSubscription({ endpoint: anEndpoint('web'), platform: 'web' }),
      );
      await repo.save(
        aSubscription({ endpoint: anEndpoint('mob'), platform: 'mobile' }),
      );

      expect(
        (await repo.byUserId(MARIA_ID)).map((row) => row.platform).sort(),
      ).toEqual(['mobile', 'web']);
    });
  });

  describe('byEndpointAndUser', () => {
    /**
     * ⚠️ **A BUSCA É PELO PAR, e é ela que faz a decisão E ser estrutural:** a
     * inscrição do Marcos não aparece para a Maria, então não há linha alheia
     * ao alcance do `update` que vem depois. Nenhum `if` de autoria, porque não
     * há nada que ele pudesse recusar.
     */
    it('never finds the subscription of another person', async () => {
      const endpoint = anEndpoint('ofmarcos');
      const theirs = await repo.save(
        aSubscription({ endpoint, userId: MARCOS_ID }),
      );

      await expect(
        repo.byEndpointAndUser(endpoint, MARIA_ID),
      ).resolves.toBeNull();
      // A precondição: a linha EXISTE, e é achada pelo dono dela — senão um
      // método que devolvesse sempre `null` passaria neste teste.
      await expect(
        repo.byEndpointAndUser(endpoint, MARCOS_ID),
      ).resolves.toEqual(theirs);
    });

    /**
     * ⚠️ **Ignora o `disabledAt`**: a inscrição desligada tem de ser
     * ENCONTRADA, senão desativar duas vezes deixaria de ser idempotente e o
     * `POST` de reativação não saberia que a linha existe.
     */
    it('finds a disabled subscription too', async () => {
      const endpoint = anEndpoint('disabledfind');
      const saved = await repo.save(aSubscription({ endpoint }));
      await repo.update(saved.id, { disabledAt: DISABLED_AT });

      const found = required(await repo.byEndpointAndUser(endpoint, MARIA_ID));

      expect(found.id).toBe(saved.id);
      expect(found.disabledAt).toEqual(DISABLED_AT);
    });

    it('returns null for an endpoint nobody registered', async () => {
      await expect(
        repo.byEndpointAndUser(anEndpoint('ghost'), MARIA_ID),
      ).resolves.toBeNull();
    });
  });

  describe('byUserId', () => {
    /**
     * ⚠️ **REGRA 13 — SÓ AS ATIVAS (`disabledAt IS NULL`), e o filtro é do
     * REPOSITÓRIO.**
     *
     * É o contrato do `NOTIFICACOES.md` §5. Deixar o filtro para quem chama
     * seria a mesma classe do `status: 'ACTIVE'` que o `listNotes` manda ao
     * port — e a Tarefa 38 tem DOIS chamadores previstos, então um deles
     * esqueceria e mandaria push para um aparelho que pediu para não receber.
     */
    it('returns only the active subscriptions', async () => {
      const active = await repo.save(
        aSubscription({ endpoint: anEndpoint('active') }),
      );
      const off = await repo.save(
        aSubscription({ endpoint: anEndpoint('off') }),
      );
      await repo.update(off.id, { disabledAt: DISABLED_AT });

      await expect(repo.byUserId(MARIA_ID)).resolves.toEqual([active]);
      // A precondição: as DUAS linhas estão no banco — o filtro é o que corta,
      // não a ausência da segunda.
      await expect(
        prisma.pushSubscription.count({ where: { userId: MARIA_ID } }),
      ).resolves.toBe(2);
    });

    it('never returns a subscription of another person', async () => {
      const mine = await repo.save(
        aSubscription({ endpoint: anEndpoint('mine') }),
      );
      const theirs = await repo.save(
        aSubscription({ endpoint: anEndpoint('theirs'), userId: MARCOS_ID }),
      );

      await expect(repo.byUserId(MARIA_ID)).resolves.toEqual([mine]);
      await expect(repo.byUserId(MARCOS_ID)).resolves.toEqual([theirs]);
    });

    it('returns an empty list for someone with no device', async () => {
      await repo.save(aSubscription({ endpoint: anEndpoint('someone') }));

      await expect(repo.byUserId(MARCOS_ID)).resolves.toEqual([]);
    });
  });

  describe('update (the soft disable)', () => {
    /**
     * ⚠️ **REGRA 11 — a desativação é SOFT: a linha FICA, com o instante.**
     *
     * A asserção é sobre a COLUNA, e não só sobre o que o mapper devolveu: é o
     * que separa "gravou `disabledAt`" de "apagou a linha", e um hard delete
     * passaria em qualquer teste que só olhasse o `byUserId`.
     */
    it('writes the disabledAt and keeps the row', async () => {
      const saved = await repo.save(
        aSubscription({ endpoint: anEndpoint('soft') }),
      );

      const disabled = await repo.update(saved.id, {
        disabledAt: DISABLED_AT,
      });

      expect(disabled.disabledAt).toEqual(DISABLED_AT);
      const rows = await prisma.$queryRaw<{ at: string }[]>`
        SELECT to_char("disabledAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS at
        FROM "PushSubscription" WHERE "id" = ${saved.id}
      `;
      expect(required(rows[0]).at).toBe('2026-10-02T09:00:00.456');
      // A linha FICA — é isto que "soft" quer dizer.
      await expect(
        prisma.pushSubscription.count({ where: { id: saved.id } }),
      ).resolves.toBe(1);
    });

    /** Desativar duas vezes é inofensivo: o segundo update reescreve o instante. */
    it('is harmless twice', async () => {
      const saved = await repo.save(
        aSubscription({ endpoint: anEndpoint('twice') }),
      );
      await repo.update(saved.id, { disabledAt: DISABLED_AT });

      const later = new Date('2026-10-03T10:00:00.000Z');
      const again = await repo.update(saved.id, { disabledAt: later });

      expect(again.disabledAt).toEqual(later);
      await expect(
        prisma.pushSubscription.count({ where: { userId: MARIA_ID } }),
      ).resolves.toBe(1);
    });

    /**
     * ⚠️ **O PATCH VAZIO NÃO MEXE EM NADA** — é a prova de que o `toUpdateData`
     * não tem campo que ele escreva "por padrão". Sem isto, um mapper que
     * mandasse `disabledAt: patch.disabledAt ?? null` apagaria a desativação a
     * cada patch vazio.
     */
    it('leaves everything alone when the patch is empty', async () => {
      const saved = await repo.save(
        aSubscription({ endpoint: anEndpoint('emptypatch') }),
      );
      await repo.update(saved.id, { disabledAt: DISABLED_AT });
      const before = required(
        await prisma.pushSubscription.findUnique({ where: { id: saved.id } }),
      );

      await repo.update(saved.id, {});

      const after = required(
        await prisma.pushSubscription.findUnique({ where: { id: saved.id } }),
      );
      // Snapshot antes/depois, e não `toBe` de campo escolhido à mão (§7.6).
      expect(after).toEqual(before);
    });

    /**
     * ⚠️ **A PRECONDIÇÃO DO PORT, e ela é sobre o PRISMA:** `update` de um id
     * que não existe **lança** `P2025`.
     *
     * É a medição que o §7.1 exige de toda afirmação sobre o banco — e ela é o
     * que justifica o port dizer que **não** há corrida a absorver aqui (ao
     * contrário do `delete` do `ReadingLog`, que é `deleteMany` de propósito):
     * nada no produto faz hard delete de inscrição, então a linha que o UseCase
     * acabou de ler não desaparece.
     */
    it('states the precondition: update on a missing id raises P2025', async () => {
      let code = '';
      try {
        await repo.update(prefixedId('t36', 'ps-ghost'), {
          disabledAt: DISABLED_AT,
        });
      } catch (error) {
        code =
          error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          typeof error.code === 'string'
            ? error.code
            : String(error);
      }

      expect(code).toBe('P2025');
    });
  });

  /**
   * ⚠️ **REGRAS 7 e 9 — o schema lido do CATÁLOGO DO POSTGRES, não do arquivo.**
   * O que importa é o que o banco tem.
   */
  describe('the schema in the database', () => {
    /**
     * ⚠️ REGRA 7 — **NOVE colunas e nada mais.** É a única forma de provar as
     * AUSÊNCIAS: nenhum teste de comportamento acusa um `status`, um
     * `archivedAt`, um `updatedAt` ou um `clubId` que ninguém escreve, e é
     * assim que uma coluna morta entra e fica. Ela também é a guarda da decisão
     * F — um `clubId` aqui quebraria esta linha.
     */
    it('has exactly the nine columns of the entity', async () => {
      const rows = await prisma.$queryRaw<
        { column_name: string; is_nullable: string }[]
      >`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'PushSubscription'
        ORDER BY column_name
      `;

      expect(rows).toEqual([
        { column_name: 'auth', is_nullable: 'NO' },
        { column_name: 'createdAt', is_nullable: 'NO' },
        // ANULÁVEL, e `NULL` significa ATIVA (decisão I).
        { column_name: 'disabledAt', is_nullable: 'YES' },
        { column_name: 'endpoint', is_nullable: 'NO' },
        { column_name: 'id', is_nullable: 'NO' },
        { column_name: 'p256dh', is_nullable: 'NO' },
        { column_name: 'platform', is_nullable: 'NO' },
        // ANULÁVEL: o corpo o declara `optional()`.
        { column_name: 'userAgent', is_nullable: 'YES' },
        { column_name: 'userId', is_nullable: 'NO' },
      ]);
    });

    /**
     * O `platform` é **TEXT**, e não um enum do Postgres — a decisão do
     * `CLAUDE.md` lida do catálogo. Um enum Prisma criaria um tipo no banco e
     * exigiria migration por plataforma nova.
     */
    it('stores the platform as text, not as a database enum', async () => {
      const rows = await prisma.$queryRaw<{ data_type: string }[]>`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'PushSubscription' AND column_name = 'platform'
      `;

      expect(required(rows[0]).data_type).toBe('text');
    });

    /**
     * ⚠️ REGRA 9 — **UM índice único não-primário, e ele é o `endpoint`.** É a
     * chave natural que faz o upsert da decisão E ser possível; sem ele, dois
     * registros do mesmo endpoint fariam o aparelho receber duas vezes.
     */
    it('has exactly one unique index besides the primary key, on (endpoint)', async () => {
      const rows = await prisma.$queryRaw<
        { indexname: string; column: string }[]
      >`
        SELECT ic.relname AS indexname, a.attname AS column
        FROM pg_index i
        JOIN pg_class ic ON ic.oid = i.indexrelid
        JOIN pg_class tc ON tc.oid = i.indrelid
        JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
        JOIN pg_attribute a
          ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE tc.relname = 'PushSubscription'
          AND i.indisunique AND NOT i.indisprimary
        ORDER BY ic.relname, k.ordinality
      `;

      expect(rows.map((row) => row.column)).toEqual(['endpoint']);
      expect(new Set(rows.map((row) => row.indexname)).size).toBe(1);
    });

    /**
     * ⚠️ REGRA 9 — **UM índice não-único, e ele é `(userId)`**: exatamente a
     * consulta do `byUserId`, que é a que o envio da Tarefa 38 faz a cada push.
     * Nada por `disabledAt` nem por `platform` — não há consulta por eles, e
     * índice sem consulta é custo de escrita à toa.
     */
    it('has exactly one non-unique index, on (userId)', async () => {
      const rows = await prisma.$queryRaw<
        { indexname: string; column: string }[]
      >`
        SELECT ic.relname AS indexname, a.attname AS column
        FROM pg_index i
        JOIN pg_class ic ON ic.oid = i.indexrelid
        JOIN pg_class tc ON tc.oid = i.indrelid
        JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
        JOIN pg_attribute a
          ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE tc.relname = 'PushSubscription'
          AND NOT i.indisunique
        ORDER BY ic.relname, k.ordinality
      `;

      expect(rows.map((row) => row.column)).toEqual(['userId']);
      expect(new Set(rows.map((row) => row.indexname)).size).toBe(1);
    });

    /**
     * ⚠️ REGRA 9 — **UMA FK, e ela é `RESTRICT`.** Lida do catálogo, e não
     * suposta: apagar uma pessoa que tem aparelho inscrito tem de FALHAR, não
     * zerar coluna nenhuma — uma inscrição sem dono é uma linha que o envio da
     * Tarefa 38 não sabe para quem mandar.
     *
     * ⚠️ **E a lista tem UMA linha porque NÃO existe FK para `ReadingPlanItem`
     * nem para `Club`** (decisão F). É o que mantém a guarda estrutural da
     * Tarefa 34b verde sem uma linha de mudança: ela cobra guarda de domínio no
     * `replacePlanItems` para toda FK que recuse a remoção de um DIA DO PLANO, e
     * esta recusa a remoção de uma PESSOA.
     */
    it('declares exactly one foreign key, to User, as ON DELETE RESTRICT', async () => {
      const rows = await prisma.$queryRaw<
        { constraint_name: string; rule: string }[]
      >`
        SELECT rc.constraint_name, rc.delete_rule AS rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.table_constraints tc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_name = 'PushSubscription'
        ORDER BY rc.constraint_name
      `;

      expect(rows).toEqual([
        { constraint_name: 'PushSubscription_userId_fkey', rule: 'RESTRICT' },
      ]);
    });

    /**
     * ⚠️ **A REDE EMBAIXO DA DECISÃO F, do outro lado:** com uma inscrição
     * viva, apagar a pessoa FALHA. É o que a limpeza deste arquivo (e o
     * `removeFixtures`) tem de respeitar — e foi exatamente esta classe de FK
     * que quebrou o `afterAll` de quatro arquivos na Tarefa 34.
     */
    it('refuses to delete a person who still has a device registered', async () => {
      const saved = await repo.save(
        aSubscription({ endpoint: anEndpoint('fk'), userId: MARCOS_ID }),
      );

      await expect(
        prisma.user.delete({ where: { id: MARCOS_ID } }),
      ).rejects.toThrow();

      // E o par: sem a inscrição, nada impede — provado sem apagar o fixture do
      // arquivo, com a contagem de volta a zero.
      await prisma.pushSubscription.delete({ where: { id: saved.id } });
      await expect(
        prisma.pushSubscription.count({ where: { userId: MARCOS_ID } }),
      ).resolves.toBe(0);
    });
  });
});
