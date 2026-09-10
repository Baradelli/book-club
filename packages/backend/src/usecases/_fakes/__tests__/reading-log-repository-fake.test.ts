import { beforeEach, describe, expect, it } from 'vitest';

import type { ReadingLog } from '../../../domain/reading-log';
import { aReadingLog, required } from '../../../test-support/builders';
import { ReadingLogRepositoryFake } from '../reading-log-repository-fake';

const READER_ID = 'user-maria';
const OTHER_READER_ID = 'user-marcos';
const PLAN_ITEM_ID = 'plan-book-1-2026-10-01';
const OTHER_PLAN_ITEM_ID = 'plan-book-1-2026-10-02';
const READ_ISO = '2026-10-01T18:30:00.000Z';

/**
 * Regra 21 — o fake do log de leitura tem suíte própria, como os onze fakes
 * anteriores.
 *
 * O port tem `save` · `byPlanItemAndUser` · `find` · `delete`. Nasceu com os
 * três primeiros na Tarefa 30; o `find` chegou na **32**, junto da
 * implementação Prisma que o satisfaz — que é o que o §6.9 exige de quem
 * cresce um port. Não há `update`: o log é imutável por decisão fechada do
 * MVP 3.
 */
describe('ReadingLogRepositoryFake', () => {
  let logs: ReadingLogRepositoryFake;

  beforeEach(() => {
    logs = new ReadingLogRepositoryFake();
  });

  /**
   * ⚠️ **Regras 1 e 2 — o que a entidade NÃO tem, e quem é a barreira.**
   *
   * `planItemId` é obrigatório e **não anulável** (regra 2): diferente da
   * `Note`, onde ele é nulo justamente para a avulsa existir, **não existe
   * leitura avulsa**. E não há `status`, `archivedAt`, `createdAt` nem
   * `updatedAt` (regra 1, decisão D): o log é imutável — nada o arquiva e nada
   * o reescreve —, e `createdAt` **é** o `readAt`, porque a linha nasce no ato
   * de marcar.
   *
   * Quem recusa é o **COMPILADOR**, e a prova é este bloco mais o
   * `pnpm -r typecheck` — é o padrão do `docs/CONVENCOES-CODIGO.md` §7.1.1, e
   * não um teste de runtime por campo.
   *
   * ⚠️ E a frase honesta que o mesmo §7.1.1 exige: a checagem de propriedade em
   * excesso do TypeScript só vale para **literal fresco**, e nada no fake filtra
   * campo nenhum em runtime — é o que o `expect` abaixo mostra, e é por isso
   * que ele afirma as três chaves em vez de fingir que elas sumiram. A asserção
   * de runtime que fecha a regra 1 está no `mark-read.test.ts`
   * (`stores exactly the six fields of the entity...`), sobre a linha que o
   * UseCase **monta** — que é onde o objeto nasce.
   */
  it('refuses at compile time a null day, a status and a second instant', () => {
    // Um objeto POR campo, e não os três num só: o TypeScript para de reportar
    // propriedade em excesso assim que o literal já tem um erro de
    // atribuição, e dois dos três `@ts-expect-error` sairiam como
    // "unused directive" — medido.
    const nullDay: Partial<ReadingLog> = {
      // @ts-expect-error `planItemId` NÃO é anulável: não existe leitura avulsa
      planItemId: null,
    };
    const softDeleted: Partial<ReadingLog> = {
      // @ts-expect-error o log é imutável — não se arquiva, não tem `status`
      status: 'ARCHIVED',
    };
    const secondInstant: Partial<ReadingLog> = {
      // @ts-expect-error `createdAt` É o `readAt`: dois nomes para o mesmo instante
      createdAt: new Date(),
    };

    expect(Object.keys(nullDay)).toEqual(['planItemId']);
    expect(Object.keys(softDeleted)).toEqual(['status']);
    expect(Object.keys(secondInstant)).toEqual(['createdAt']);
  });

  describe('save is an upsert by id', () => {
    it('returns the log it stored', async () => {
      const log = aReadingLog({ userId: READER_ID });

      const returned = await logs.save(log);

      expect(returned).toEqual(log);
      expect(logs.saved).toEqual([log]);
    });

    it('overwrites the same id in place instead of adding a second row', async () => {
      const first = aReadingLog({ id: 'log-a', readAt: new Date(READ_ISO) });
      await logs.save(first);

      await logs.save({
        ...first,
        readAt: new Date('2026-10-02T08:00:00.000Z'),
      });

      expect(logs.saved).toHaveLength(1);
      expect(required(logs.saved[0]).readAt.toISOString()).toBe(
        '2026-10-02T08:00:00.000Z',
      );
    });

    it('keeps two logs with different ids', async () => {
      await logs.save(aReadingLog({ id: 'log-a', userId: READER_ID }));
      await logs.save(aReadingLog({ id: 'log-b', userId: OTHER_READER_ID }));

      expect(logs.saved).toHaveLength(2);
    });

    /**
     * Regra 19 — o contador, com o lado **POSITIVO** também assertado (§7.3):
     * um contador só afirmado como `toBe(0)` é meio contador, porque um
     * incremento que alguém apague deixa todo `toBe(0)` passar por acidente — e
     * aí ele é a asserção vazia do §7.4.
     */
    it('counts every save call', async () => {
      expect(logs.saveCalls).toBe(0);

      // Leitores diferentes: dois ids não bastam para escapar do índice único,
      // e o fake é fiel a isso — o par `(planItemId, userId)` é a identidade.
      await logs.save(aReadingLog({ id: 'log-a', userId: READER_ID }));
      await logs.save(aReadingLog({ id: 'log-b', userId: OTHER_READER_ID }));

      expect(logs.saveCalls).toBe(2);
    });

    /**
     * Conta a CHAMADA, e aqui a segunda **converge** sobre a primeira em vez
     * de ser recusada — é a rodada de correção da Tarefa 32 (achado 1). O
     * contador continua sendo o que separa "não chamou" de "chamou e a linha
     * não mudou de número" (§7.3): sem ele, `saved.length === 1` sozinho não
     * distingue as duas.
     */
    it('counts the save call that converged onto an existing pair', async () => {
      await logs.save(
        aReadingLog({
          id: 'log-a',
          planItemId: PLAN_ITEM_ID,
          userId: READER_ID,
        }),
      );

      await logs.save(
        aReadingLog({
          id: 'log-b',
          planItemId: PLAN_ITEM_ID,
          userId: READER_ID,
        }),
      );

      expect(logs.saveCalls).toBe(2);
      expect(logs.saved).toHaveLength(1);
    });
  });

  /**
   * ⚠️ Regra 17 — **A FIDELIDADE NAS DUAS DIREÇÕES** (§7.1), e já são **seis**
   * aparições desta classe de bug no projeto.
   *
   * ⚠️⚠️ **ESTE BLOCO MUDOU DE VEREDITO NA RODADA DE CORREÇÃO DA TAREFA 32, e
   * o motivo é a lição inteira.** Ele nascia (Tarefa 30) afirmando que o
   * segundo `save` do mesmo par é **recusado**, porque supunha que o
   * repositório Prisma faria upsert por `id`. A 32 implementou assim, e o
   * revisor mediu que aquilo produzia **500** no gesto central da 32b: o
   * `handle-domain-error.ts` não mapeia `P2002`, e a janela da corrida não é
   * "um toque duplo em milissegundos" — é a latência do round-trip mais o
   * retry da fila offline. O `save` passou a mirar o índice composto, como o
   * `PrismaNoteRepository`, e **o segundo `save` do mesmo par agora
   * ATUALIZA**.
   *
   * Se este arquivo tivesse ficado como estava, o fake seria **mais
   * restritivo que o banco** — a direção do §7.1 que esconde melhor, porque a
   * suíte fica verde: ele recusaria o que o Postgres aceita, e o caso legítimo
   * (a corrida convergindo) nunca teria teste. A pergunta é sempre "o Postgres
   * faria isto?", e a resposta mudou junto com a chamada de Prisma.
   *
   * As duas direções que continuam valendo, e as duas são o produto:
   *
   * - o clube inteiro lê o mesmo trecho (mesmo `planItemId`, outro `userId`);
   * - a pessoa lê o livro um dia por vez (mesmo `userId`, outro `planItemId`).
   *
   * Um fake que recusasse qualquer um dos dois faria o caso central nascer
   * provando o comportamento errado (→ ADR 0007).
   *
   * ⚠️ **O `P2002` NÃO desapareceu — mudou de porta.** O índice continua
   * mordendo um `INSERT` cru do mesmo par, e é isso que o teste de contrato
   * `states the precondition: a raw insert of the same pair raises P2002`
   * prova contra o Postgres. O que este fake emula é o `save`, e o `save` não
   * passa mais por lá.
   *
   * ⚠️ E a diferença em relação ao `NoteRepositoryFake`, que é o vizinho de
   * onde este fake foi copiado: **aqui não existe a metade do `NULL`**. O
   * `Note.planItemId` é anulável (é o que faz a anotação avulsa existir), e o
   * índice único do Postgres não compara `NULL` com `NULL`, então N avulsas do
   * mesmo autor convivem. `ReadingLog.planItemId` é **não anulável** — não há
   * leitura avulsa —, então aquela fidelidade não tem o que emular aqui. Nota
   * de dívida ALHEIA, medida nesta rodada e **não** consertada: o
   * `NoteRepositoryFake.save` ainda **lança** no par duplicado enquanto o
   * `PrismaNoteRepository.save` faz upsert no índice composto — é a mesma
   * divergência que este arquivo acabou de corrigir, na tabela do lado.
   */
  describe('upsert on (planItemId, userId)', () => {
    it('overwrites the row of the same pair instead of adding a second', async () => {
      await logs.save(
        aReadingLog({
          id: 'log-a',
          planItemId: PLAN_ITEM_ID,
          userId: READER_ID,
          readAt: new Date('2026-10-01T06:00:00.000Z'),
        }),
      );

      await logs.save(
        aReadingLog({
          id: 'log-b',
          planItemId: PLAN_ITEM_ID,
          userId: READER_ID,
          readAt: new Date(READ_ISO),
        }),
      );

      expect(logs.saved).toHaveLength(1);
      expect(required(logs.saved[0]).readAt.toISOString()).toBe(READ_ISO);
    });

    /**
     * ⚠️ O `id` do segundo `save` é **DESCARTADO**, e a linha mantém o do
     * primeiro — é o que o upsert no índice composto faz no Postgres, provado
     * lá pelo contrato (`keeps the id of the first row when a second save
     * carries the same pair`). Sem esta asserção, um fake que trocasse a chave
     * primária na convergência passaria no teste de cima.
     */
    it('keeps the id of the first row, and returns it', async () => {
      const first = await logs.save(
        aReadingLog({
          id: 'log-a',
          planItemId: PLAN_ITEM_ID,
          userId: READER_ID,
        }),
      );

      const second = await logs.save(
        aReadingLog({
          id: 'log-b',
          planItemId: PLAN_ITEM_ID,
          userId: READER_ID,
        }),
      );

      expect(second.id).toBe(first.id);
      expect(second.id).toBe('log-a');
      expect(logs.saved.map((log) => log.id)).toEqual(['log-a']);
    });

    // A OUTRA direção, e é o caso central do produto: o clube inteiro lê o
    // mesmo trecho no mesmo dia.
    it('allows two readers on the same plan item', async () => {
      await logs.save(
        aReadingLog({ planItemId: PLAN_ITEM_ID, userId: READER_ID }),
      );
      await logs.save(
        aReadingLog({ planItemId: PLAN_ITEM_ID, userId: OTHER_READER_ID }),
      );

      expect(logs.saved).toHaveLength(2);
    });

    // E a terceira: uma pessoa lê o livro inteiro, um dia por vez.
    it('allows the same reader on two plan items', async () => {
      await logs.save(
        aReadingLog({ planItemId: PLAN_ITEM_ID, userId: READER_ID }),
      );
      await logs.save(
        aReadingLog({ planItemId: OTHER_PLAN_ITEM_ID, userId: READER_ID }),
      );

      expect(logs.saved).toHaveLength(2);
    });

    it('lets the same id be rewritten: it does not collide with itself', async () => {
      const log = aReadingLog({
        planItemId: PLAN_ITEM_ID,
        userId: READER_ID,
      });
      await logs.save(log);

      await expect(
        logs.save({ ...log, readAt: new Date(READ_ISO) }),
      ).resolves.toBeTruthy();

      expect(logs.saved).toHaveLength(1);
    });

    /**
     * ⚠️ **A CORRIDA DO `markRead`, no fake**: dois `execute` que leram `null`
     * no `byPlanItemAndUser` chegam com ids diferentes e o mesmo par, e o
     * `save` **não lança** — é o irmão em memória de
     * `does not throw and leaves one row when two saves of the same pair race`
     * do teste de contrato.
     *
     * O `Promise.all` aqui não cria concorrência de verdade (o fake é
     * síncrono); o que ele registra é a FORMA da chamada, e ela é a que a 32b
     * vai produzir.
     */
    it('does not throw when two saves of the same pair race', async () => {
      const first = aReadingLog({
        id: 'log-a',
        planItemId: PLAN_ITEM_ID,
        userId: READER_ID,
      });
      const second = aReadingLog({
        id: 'log-b',
        planItemId: PLAN_ITEM_ID,
        userId: READER_ID,
      });

      const [a, b] = await Promise.all([logs.save(first), logs.save(second)]);

      expect(a.id).toBe(b.id);
      expect([first.id, second.id]).toContain(a.id);
      expect(logs.saved).toHaveLength(1);
    });
  });

  describe('byPlanItemAndUser', () => {
    it('returns the log of that pair', async () => {
      const log = aReadingLog({
        id: 'log-a',
        planItemId: PLAN_ITEM_ID,
        userId: READER_ID,
      });
      await logs.save(log);

      expect(await logs.byPlanItemAndUser(PLAN_ITEM_ID, READER_ID)).toEqual(
        log,
      );
    });

    it('returns null when nobody marked that day', async () => {
      expect(await logs.byPlanItemAndUser(PLAN_ITEM_ID, READER_ID)).toBeNull();
    });

    /**
     * ⚠️ As DUAS metades da chave, e é o que faz a decisão E ser estrutural: o
     * log de outra pessoa é **inalcançável** por esta busca.
     */
    it('returns null for another reader on the same plan item', async () => {
      await logs.save(
        aReadingLog({ planItemId: PLAN_ITEM_ID, userId: READER_ID }),
      );

      expect(
        await logs.byPlanItemAndUser(PLAN_ITEM_ID, OTHER_READER_ID),
      ).toBeNull();
    });

    it('returns null for the same reader on another plan item', async () => {
      await logs.save(
        aReadingLog({ planItemId: PLAN_ITEM_ID, userId: READER_ID }),
      );

      expect(
        await logs.byPlanItemAndUser(OTHER_PLAN_ITEM_ID, READER_ID),
      ).toBeNull();
    });

    /** Regra 19 — o contador, com os dois lados. */
    it('counts every byPlanItemAndUser call, including the ones that found nothing', async () => {
      expect(logs.byPlanItemAndUserCalls).toBe(0);

      await logs.byPlanItemAndUser(PLAN_ITEM_ID, READER_ID);
      await logs.byPlanItemAndUser(PLAN_ITEM_ID, OTHER_READER_ID);
      await logs.byPlanItemAndUser(OTHER_PLAN_ITEM_ID, READER_ID);

      expect(logs.byPlanItemAndUserCalls).toBe(3);
    });

    // O Prisma devolve `Date` nova a cada leitura: mexer no que voltou não pode
    // alcançar o store.
    it('hands back a copy, not the stored row', async () => {
      await logs.save(
        aReadingLog({
          id: 'log-a',
          planItemId: PLAN_ITEM_ID,
          userId: READER_ID,
          readAt: new Date(READ_ISO),
        }),
      );

      const found = required(
        await logs.byPlanItemAndUser(PLAN_ITEM_ID, READER_ID),
      );
      found.readAt.setFullYear(1999);

      expect(
        required(
          await logs.byPlanItemAndUser(PLAN_ITEM_ID, READER_ID),
        ).readAt.toISOString(),
      ).toBe(READ_ISO);
    });
  });

  /**
   * O HARD DELETE, que é a exceção documentada ao soft delete do projeto: o
   * `ReadingLog` não tem `status` nem `archivedAt` para arquivar.
   */
  describe('delete', () => {
    it('removes the row for good', async () => {
      await logs.save(
        aReadingLog({
          id: 'log-a',
          planItemId: PLAN_ITEM_ID,
          userId: READER_ID,
        }),
      );

      await logs.delete('log-a');

      expect(logs.saved).toEqual([]);
      expect(await logs.byPlanItemAndUser(PLAN_ITEM_ID, READER_ID)).toBeNull();
    });

    it('removes only that row', async () => {
      await logs.save(aReadingLog({ id: 'log-a', userId: READER_ID }));
      await logs.save(
        aReadingLog({
          id: 'log-b',
          userId: OTHER_READER_ID,
        }),
      );

      await logs.delete('log-a');

      expect(logs.saved.map((log) => log.id)).toEqual(['log-b']);
    });

    /**
     * ⚠️ **IDEMPOTENTE: id inexistente não é erro** — e é contrato do port, não
     * indulgência do fake.
     *
     * O porquê, e **o que ali está medido contra o banco e o que não está**,
     * moram num lugar só: o docblock de `delete` em
     * `usecases/ports/reading-log-repository.ts`. Não é repetido aqui de
     * propósito — afirmação sobre o Postgres copiada de arquivo em arquivo é a
     * dívida do §7.1, e a última viajou por quatro antes de alguém medi-la.
     */
    it('does nothing and does not throw when the id was never saved', async () => {
      await logs.save(aReadingLog({ id: 'log-a' }));

      await logs.delete('log-que-nunca-existiu');

      expect(logs.saved.map((log) => log.id)).toEqual(['log-a']);
    });

    it('does nothing the second time the same id is deleted', async () => {
      await logs.save(aReadingLog({ id: 'log-a' }));

      await logs.delete('log-a');
      await logs.delete('log-a');

      expect(logs.saved).toEqual([]);
    });

    /**
     * Regra 19 — o contador, com o lado positivo E a chamada que não apagou
     * nada: é ela que separa "não chamou o repositório" de "chamou e a linha
     * não estava lá" (§7.3), que é exatamente o par que a regra 14 do
     * `unmarkRead` precisa distinguir.
     */
    it('counts every delete call, including the one that removed nothing', async () => {
      expect(logs.deleteCalls).toBe(0);

      await logs.save(aReadingLog({ id: 'log-a' }));
      await logs.delete('log-a');
      await logs.delete('log-que-nunca-existiu');

      expect(logs.deleteCalls).toBe(2);
    });
  });

  /**
   * O `find(filter)` da Tarefa 32 — o que serve "quem já leu cada dia deste
   * livro" à resposta do livro e ao `computeBookProgress`.
   *
   * O filtro é `{ bookId, userId?, planItemId? }` e **não** tem `clubId`
   * (decisão F): quem corta o tenant é o `bookForActor`, que resolve o clube
   * pelo livro. Um `clubId` aqui criaria uma **segunda** regra de tenant para
   * manter em dia com aquela.
   */
  describe('find', () => {
    const BOOK_ID = 'book-1';
    const OTHER_BOOK_ID = 'book-2';

    /** Um log de um livro/dia/leitor, com id derivado dos três. */
    async function seed(
      bookId: string,
      planItemId: string,
      userId: string,
    ): Promise<ReadingLog> {
      return await logs.save(
        aReadingLog({
          id: `log-${bookId}-${planItemId}-${userId}`,
          bookId,
          planItemId,
          userId,
        }),
      );
    }

    it('returns only the logs of the asked book', async () => {
      const mine = await seed(BOOK_ID, PLAN_ITEM_ID, READER_ID);
      await seed(OTHER_BOOK_ID, OTHER_PLAN_ITEM_ID, READER_ID);

      await expect(logs.find({ bookId: BOOK_ID })).resolves.toEqual([mine]);
    });

    it('narrows by userId', async () => {
      const mine = await seed(BOOK_ID, PLAN_ITEM_ID, READER_ID);
      await seed(BOOK_ID, PLAN_ITEM_ID, OTHER_READER_ID);

      await expect(
        logs.find({ bookId: BOOK_ID, userId: READER_ID }),
      ).resolves.toEqual([mine]);
    });

    it('narrows by planItemId', async () => {
      const first = await seed(BOOK_ID, PLAN_ITEM_ID, READER_ID);
      await seed(BOOK_ID, OTHER_PLAN_ITEM_ID, READER_ID);

      await expect(
        logs.find({ bookId: BOOK_ID, planItemId: PLAN_ITEM_ID }),
      ).resolves.toEqual([first]);
    });

    /**
     * Os filtros entram em **AND**, não em OR: cada um sozinho casa mais de um
     * log, e juntos casam um só. Sem este par, um `find` que ignorasse um dos
     * campos passaria nos dois testes de cima.
     */
    it('combines every filter with AND', async () => {
      const target = await seed(BOOK_ID, PLAN_ITEM_ID, READER_ID);
      await seed(BOOK_ID, PLAN_ITEM_ID, OTHER_READER_ID);
      await seed(BOOK_ID, OTHER_PLAN_ITEM_ID, READER_ID);

      await expect(
        logs.find({
          bookId: BOOK_ID,
          planItemId: PLAN_ITEM_ID,
          userId: READER_ID,
        }),
      ).resolves.toEqual([target]);
      // Um campo trocado e o resultado é vazio — é o que prova que é AND.
      await expect(
        logs.find({
          bookId: BOOK_ID,
          planItemId: OTHER_PLAN_ITEM_ID,
          userId: OTHER_READER_ID,
        }),
      ).resolves.toEqual([]);
    });

    // Campo AUSENTE não filtra por ele — é o que faz `{ bookId }` sozinho
    // devolver o livro inteiro, que é o caso da sobreposição da tela.
    it('does not filter by a field the filter omits', async () => {
      await seed(BOOK_ID, PLAN_ITEM_ID, READER_ID);
      await seed(BOOK_ID, PLAN_ITEM_ID, OTHER_READER_ID);
      await seed(BOOK_ID, OTHER_PLAN_ITEM_ID, READER_ID);

      expect(await logs.find({ bookId: BOOK_ID })).toHaveLength(3);
    });

    it('returns an empty list for a book nobody read', async () => {
      await seed(BOOK_ID, PLAN_ITEM_ID, READER_ID);

      await expect(logs.find({ bookId: 'book-fantasma' })).resolves.toEqual([]);
    });

    /**
     * ⚠️ A ARMADILHA DO §7.2 vale para o `find` também, e é aqui que ela é
     * assunto: o port **não promete ordem**, e o fake enumera INVERTIDO de
     * propósito. Quem consome (`groupReadersByPlanItem`) ordena pelo plano.
     */
    it('enumerates in reverse insertion order', async () => {
      await seed(BOOK_ID, 'plan-b-inserido-1o', READER_ID);
      await seed(BOOK_ID, 'plan-a-inserido-2o', READER_ID);
      await seed(BOOK_ID, 'plan-c-inserido-3o', READER_ID);

      expect((await logs.find({ bookId: BOOK_ID })).map((l) => l.planItemId)) //
        .toEqual([
          'plan-c-inserido-3o',
          'plan-a-inserido-2o',
          'plan-b-inserido-1o',
        ]);
    });

    // Clona na saída, como o `saved`: o store nunca devolve referência sua.
    it('does not let the caller mutate the store through what find returned', async () => {
      await logs.save(
        aReadingLog({
          id: 'log-a',
          bookId: BOOK_ID,
          readAt: new Date(READ_ISO),
        }),
      );

      const [found] = await logs.find({ bookId: BOOK_ID });
      required(found).readAt.setFullYear(1999);

      expect(required(logs.saved[0]).readAt.toISOString()).toBe(READ_ISO);
    });

    /**
     * O contador, com o lado POSITIVO também (§7.3, e o §7.4 logo atrás): ele
     * existe para o `getBookWithPlan` poder afirmar que o corte de tenant
     * **recusou antes de ler** — quem não é membro ativo não gera nem uma
     * consulta ao registro de leitura do clube.
     */
    it('counts every find call', async () => {
      expect(logs.findCalls).toBe(0);

      await logs.find({ bookId: BOOK_ID });
      await logs.find({ bookId: OTHER_BOOK_ID });

      expect(logs.findCalls).toBe(2);
    });

    /**
     * E o que o contador NÃO distingue: "o filtro foi para o repositório" ×
     * "o resultado deu certo" (§7.3). O `findFilters` guarda uma **cópia** de
     * cada filtro, e é o que deixa o `getBookWithPlan` provar que manda UM
     * filtro só, com o `bookId` e nada à toa.
     */
    it('pins a copy of every filter it was given', async () => {
      const filter = { bookId: BOOK_ID, userId: READER_ID };

      await logs.find(filter);
      filter.userId = OTHER_READER_ID;

      expect(logs.findFilters).toEqual([
        { bookId: BOOK_ID, userId: READER_ID },
      ]);
    });
  });

  /**
   * ⚠️ Regra 18 — **A ARMADILHA DELIBERADA**, e o teste que a chama pelo nome
   * (§7.2). Não "conserte" esta ordem.
   *
   * O port **não promete ordem**, e a que o Postgres devolve sem `ORDER BY` é
   * indefinida de verdade (depende de plano de execução e de `VACUUM`). Então
   * "invertida" é tão fiel quanto qualquer outra — e é a única que **FALHA**
   * quando alguém confia na ordem do repositório, que foi o falso verde que a
   * Tarefa 07 descobriu.
   *
   * Ela nasce aqui **antes** do `find` da Tarefa 32, pelo mesmo motivo pelo
   * qual o fake do grifo a teve na Tarefa 22 sem `find`: quando o
   * `computeBookProgress` chegar, encontra a armadilha pronta em vez de uma
   * ordem "natural" de que alguém poderia depender no meio do caminho.
   *
   * Três logs, e não dois: com dois, "invertido" e "ordenado por id
   * decrescente" dariam o mesmo resultado.
   */
  it('enumerates in reverse insertion order', async () => {
    await logs.save(aReadingLog({ id: 'b-inserido-1o', userId: 'user-1' }));
    await logs.save(aReadingLog({ id: 'a-inserido-2o', userId: 'user-2' }));
    await logs.save(aReadingLog({ id: 'c-inserido-3o', userId: 'user-3' }));

    expect(logs.saved.map((log) => log.id)).toEqual([
      'c-inserido-3o',
      'a-inserido-2o',
      'b-inserido-1o',
    ]);
  });

  // Clone nos dois sentidos: nem o chamador contamina o store, nem o store
  // devolve referência sua. O Prisma devolve `Date` nova a cada leitura.
  it('does not let the caller mutate the stored row through what it passed in', async () => {
    const log = aReadingLog({ id: 'log-a', readAt: new Date(READ_ISO) });

    await logs.save(log);
    log.readAt.setFullYear(1999);

    expect(required(logs.saved[0]).readAt.toISOString()).toBe(READ_ISO);
  });

  it('does not let the caller mutate the stored row through what save returned', async () => {
    const returned = await logs.save(
      aReadingLog({ id: 'log-a', readAt: new Date(READ_ISO) }),
    );

    returned.readAt.setFullYear(1999);

    expect(required(logs.saved[0]).readAt.toISOString()).toBe(READ_ISO);
  });
});
