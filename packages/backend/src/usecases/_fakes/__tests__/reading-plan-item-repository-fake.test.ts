import { beforeEach, describe, expect, it } from 'vitest';

import { aPlanItem, required } from '../../../test-support/builders';
import { ReadingPlanItemRepositoryFake } from '../reading-plan-item-repository-fake';

const CREATED_ISO = '2026-01-01T00:00:00.000Z';

async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`expected an Error, got ${typeof error}`);
  }
  throw new Error('expected the promise to reject, but it resolved');
}

describe('ReadingPlanItemRepositoryFake', () => {
  let plan: ReadingPlanItemRepositoryFake;

  beforeEach(() => {
    plan = new ReadingPlanItemRepositoryFake();
  });

  describe('saveMany', () => {
    it('returns the items it stored', async () => {
      const items = [
        aPlanItem({ order: 0, date: '2026-10-01' }),
        aPlanItem({ order: 1, date: '2026-10-02' }),
      ];

      const returned = await plan.saveMany(items);

      expect(returned).toEqual(items);
      expect(plan.saved).toEqual(items);
    });

    it('accepts an empty batch without storing anything', async () => {
      await expect(plan.saveMany([])).resolves.toEqual([]);

      expect(plan.saved).toHaveLength(0);
    });

    it('appends a second batch to what is already stored', async () => {
      await plan.saveMany([aPlanItem({ order: 0, date: '2026-10-01' })]);
      await plan.saveMany([aPlanItem({ order: 1, date: '2026-10-02' })]);

      expect(plan.saved.map((item) => item.date)).toEqual([
        '2026-10-01',
        '2026-10-02',
      ]);
    });
  });

  // O contador é o único jeito de o teste do replacePlanItems afirmar "nada
  // foi escrito NEM apagado" num caminho de erro: `saved` inalterado não
  // distingue "não chamou" de "chamou com lote vazio". É o mesmo padrão do
  // `compareCalls` do PasswordHasherFake (CONVENCOES-CODIGO §6.4).
  describe('call counters', () => {
    it('starts both counters at zero', () => {
      expect(plan.saveManyCalls).toBe(0);
      expect(plan.replaceForBookCalls).toBe(0);
      expect(plan.removedIds).toEqual([]);
    });

    it('counts each saveMany, including the empty batch', async () => {
      await plan.saveMany([aPlanItem()]);
      await plan.saveMany([]);

      expect(plan.saveManyCalls).toBe(2);
      expect(plan.replaceForBookCalls).toBe(0);
    });

    it('counts each replaceForBook, including the empty one', async () => {
      await plan.replaceForBook('book-1', { upsert: [], removeIds: [] });
      await plan.replaceForBook('book-1', {
        upsert: [],
        removeIds: ['plan-ghost'],
      });

      expect(plan.replaceForBookCalls).toBe(2);
      expect(plan.saveManyCalls).toBe(0);
      // O contador de removidos registra o PEDIDO, não o efeito: é o que
      // permite ao teste do replacePlanItems afirmar "não pediu remoção".
      expect(plan.removedIds).toEqual(['plan-ghost']);
    });

    /**
     * O contador de LEITURA do plano, que o `listPlanItemWriters` (Tarefa 10)
     * usa para afirmar "não leu o plano" quando o corte de tenant recusa. O
     * plano é conteúdo do clube — os temas de cada dia —, então lê-lo antes do
     * corte é o mesmo vazamento das notas numa coluna menor.
     *
     * Este teste é o lado POSITIVO: sem ele, um contador que nunca incrementa
     * deixaria todo `toBe(0)` passar por acidente — a asserção vazia da classe
     * do §7.4.
     */
    it('counts each findByBook, including the one that found nothing', async () => {
      expect(plan.findByBookCalls).toBe(0);

      await plan.findByBook('book-1');
      await plan.findByBook('book-ghost');

      expect(plan.findByBookCalls).toBe(2);
      expect(plan.saveManyCalls).toBe(0);
    });

    // Um lote recusado pelo índice único já mexeu no contador: quem conta é a
    // chamada, não o sucesso. Senão o contador mentiria sobre a tentativa.
    it('counts a saveMany that was refused by an index', async () => {
      await plan.saveMany([aPlanItem({ id: 'plan-1', date: '2026-10-01' })]);

      await expect(
        plan.saveMany([aPlanItem({ id: 'plan-2', date: '2026-10-01' })]),
      ).rejects.toThrow(/unique\(bookId, date\)/);

      expect(plan.saveManyCalls).toBe(2);
    });
  });

  // O método que a Tarefa 08 acrescentou ao port: o `upsertPlanNote` recebe um
  // `planItemId` solto e precisa do item para descobrir de que livro (e, por
  // ele, de que clube) a anotação do dia é. **Não confere clube** de propósito
  // — quem faz o corte de tenant é o `bookForActor`, com o `book.clubId`.
  describe('byId', () => {
    it('returns the item asked for', async () => {
      const item = aPlanItem({ id: 'plan-1', date: '2026-10-01' });
      await plan.saveMany([item]);

      await expect(plan.byId('plan-1')).resolves.toEqual(item);
    });

    it('returns null for an id that was never saved', async () => {
      await expect(plan.byId('plan-ghost')).resolves.toBeNull();
    });

    it('returns the item of the book it really belongs to', async () => {
      await plan.saveMany([
        aPlanItem({ id: 'plan-here', bookId: 'book-1', date: '2026-10-01' }),
        aPlanItem({ id: 'plan-there', bookId: 'book-2', date: '2026-10-01' }),
      ]);

      const found = await plan.byId('plan-there');

      expect(found?.bookId).toBe('book-2');
    });

    it('clones the Dates it returns', async () => {
      await plan.saveMany([aPlanItem({ id: 'plan-1' })]);

      required(await plan.byId('plan-1')).createdAt.setFullYear(1999);

      expect(required(await plan.byId('plan-1')).createdAt).toEqual(
        new Date(CREATED_ISO),
      );
    });
  });

  describe('findByBook', () => {
    it('returns only the items of the book asked for', async () => {
      await plan.saveMany([
        aPlanItem({ bookId: 'book-1', order: 0, date: '2026-10-01' }),
        aPlanItem({ bookId: 'book-2', order: 0, date: '2026-10-01' }),
      ]);

      const found = await plan.findByBook('book-1');

      expect(found.map((item) => item.bookId)).toEqual(['book-1']);
    });

    // O port promete ordem de `order`. O UseCase reordena de novo de
    // propósito, mas o fake não pode ser o que mente sobre o contrato.
    it('returns the items ordered by order even when they were saved shuffled', async () => {
      await plan.saveMany([
        aPlanItem({ order: 2, date: '2026-10-03' }),
        aPlanItem({ order: 0, date: '2026-10-01' }),
        aPlanItem({ order: 1, date: '2026-10-02' }),
      ]);

      const found = await plan.findByBook('book-1');

      expect(found.map((item) => item.order)).toEqual([0, 1, 2]);
      expect(found.map((item) => item.date)).toEqual([
        '2026-10-01',
        '2026-10-02',
        '2026-10-03',
      ]);
    });

    it('returns an empty list for a book with no plan', async () => {
      await expect(plan.findByBook('book-ghost')).resolves.toEqual([]);
    });

    it('clones the Dates it returns', async () => {
      await plan.saveMany([aPlanItem()]);

      const found = await plan.findByBook('book-1');
      required(found[0]).createdAt.setFullYear(1999);

      const again = await plan.findByBook('book-1');
      expect(required(again[0]).createdAt).toEqual(new Date(CREATED_ISO));
    });
  });

  describe('replaceForBook', () => {
    beforeEach(async () => {
      await plan.saveMany([
        aPlanItem({ id: 'plan-1', order: 0, date: '2026-10-01' }),
        aPlanItem({ id: 'plan-2', order: 1, date: '2026-10-02' }),
        aPlanItem({ id: 'plan-3', order: 2, date: '2026-10-03' }),
      ]);
    });

    it('removes only the ids it was given', async () => {
      await plan.replaceForBook('book-1', {
        upsert: [],
        removeIds: ['plan-2'],
      });

      expect(plan.saved.map((item) => item.id)).toEqual(['plan-1', 'plan-3']);
    });

    it('removes several ids at once', async () => {
      await plan.replaceForBook('book-1', {
        upsert: [],
        removeIds: ['plan-1', 'plan-3'],
      });

      expect(plan.saved.map((item) => item.id)).toEqual(['plan-2']);
    });

    it('removes nothing when the id list is empty', async () => {
      await plan.replaceForBook('book-1', { upsert: [], removeIds: [] });

      expect(plan.saved).toHaveLength(3);
    });

    // Remoção é IDEMPOTENTE, diferente do update: um retry da mesma operação
    // não pode falhar só porque o item já saiu.
    it('does not throw for an id that was never saved', async () => {
      await expect(
        plan.replaceForBook('book-1', {
          upsert: [],
          removeIds: ['plan-ghost'],
        }),
      ).resolves.toEqual([]);

      expect(plan.saved).toHaveLength(3);
    });

    it('does not throw when asked twice for the same id', async () => {
      const change = { upsert: [], removeIds: ['plan-2'] };
      await plan.replaceForBook('book-1', change);
      await expect(plan.replaceForBook('book-1', change)).resolves.toEqual([]);

      expect(plan.saved.map((item) => item.id)).toEqual(['plan-1', 'plan-3']);
    });

    // O escopo do livro não é decoração: um id de OUTRO livro no removeIds não
    // apaga nada. É a mesma cláusula que o `deleteMany` do Prisma carrega.
    it('never removes an item of another book', async () => {
      await plan.saveMany([
        aPlanItem({ id: 'plan-outro', bookId: 'book-2', date: '2026-10-01' }),
      ]);

      await plan.replaceForBook('book-1', {
        upsert: [],
        removeIds: ['plan-outro'],
      });

      expect(plan.saved.map((item) => item.id)).toContain('plan-outro');
    });

    // A remoção acontece ANTES do upsert, e é isso que libera a `date` que um
    // item novo do MESMO lote reivindica. Sem essa ordem, "trocar o dia 1 pelo
    // Prólogo na mesma data" bateria no unique(bookId, date).
    it('frees the date the removed item was holding, in the same call', async () => {
      const replaced = await plan.replaceForBook('book-1', {
        upsert: [aPlanItem({ id: 'plan-novo', order: 0, date: '2026-10-01' })],
        removeIds: ['plan-1'],
      });

      expect(replaced).toHaveLength(1);
      expect(plan.saved.map((item) => item.id).sort()).toEqual([
        'plan-2',
        'plan-3',
        'plan-novo',
      ]);
    });

    it('returns the upserted items in the order they came', async () => {
      const replaced = await plan.replaceForBook('book-1', {
        upsert: [
          aPlanItem({ id: 'plan-2', order: 0, date: '2026-10-02' }),
          aPlanItem({ id: 'plan-3', order: 1, date: '2026-10-03' }),
        ],
        removeIds: ['plan-1'],
      });

      expect(replaced.map((item) => [item.id, item.order])).toEqual([
        ['plan-2', 0],
        ['plan-3', 1],
      ]);
    });

    // ATOMICIDADE: o upsert que viola o índice não pode deixar a remoção
    // aplicada. É o que o `$transaction` da implementação Prisma garante, e é
    // a razão de este método existir em vez de deleteMany + saveMany.
    it('removes nothing when the upsert violates unique(bookId, date)', async () => {
      const before = plan.saved;

      await expect(
        plan.replaceForBook('book-1', {
          upsert: [
            aPlanItem({ id: 'plan-novo', order: 0, date: '2026-10-02' }),
          ],
          removeIds: ['plan-1'],
        }),
      ).rejects.toThrow(/unique\(bookId, date\)/);

      expect(plan.saved).toEqual(before);
    });

    // ...e o item novo que reivindica a data de um REMOVIDO passa, porque a
    // checagem roda contra o estado já sem os removidos.
    it('accepts an upsert that claims the date of a removed item', async () => {
      await expect(
        plan.replaceForBook('book-1', {
          upsert: [
            aPlanItem({ id: 'plan-novo', order: 0, date: '2026-10-02' }),
          ],
          removeIds: ['plan-2'],
        }),
      ).resolves.toHaveLength(1);
    });
  });

  describe('Date fidelity', () => {
    it('does not let the caller corrupt the store through a Date it saved', async () => {
      const createdAt = new Date(CREATED_ISO);
      await plan.saveMany([aPlanItem({ createdAt })]);

      createdAt.setFullYear(1999);

      expect(required(plan.saved[0]).createdAt).toEqual(new Date(CREATED_ISO));
    });

    it('does not let the caller corrupt the store through the Date it got back from saveMany', async () => {
      const [returned] = await plan.saveMany([aPlanItem()]);

      required(returned).createdAt.setFullYear(1999);

      expect(required(plan.saved[0]).createdAt).toEqual(new Date(CREATED_ISO));
    });

    it('clones the Dates exposed by the saved getter', async () => {
      await plan.saveMany([aPlanItem()]);

      required(plan.saved[0]).createdAt.setFullYear(1999);

      expect(required(plan.saved[0]).createdAt).toEqual(new Date(CREATED_ISO));
    });

    it('returns a different Date instance on every read', async () => {
      await plan.saveMany([aPlanItem()]);

      const first = required(plan.saved[0]);
      const second = required(plan.saved[0]);

      expect(first.createdAt).not.toBe(second.createdAt);
      expect(first.createdAt).toEqual(second.createdAt);
    });
  });

  // O Postgres rejeita o par duplicado com violação de índice único; o fake
  // tem que rejeitar também, senão uma regressão do plano passa em silêncio.
  //
  // E rejeitar do jeito CERTO: `@@unique` do Prisma emite
  // `CREATE UNIQUE INDEX`, e índice único no Postgres não é deferível (só
  // `CONSTRAINT ... UNIQUE` é). Cada linha do lote é validada SOZINHA, contra
  // a vizinha ainda não regravada — não o lote em conjunto. → ADR 0007.
  describe('unique(bookId, date)', () => {
    it('refuses an item whose date is already taken in the same book', async () => {
      await plan.saveMany([aPlanItem({ id: 'plan-1', date: '2026-10-01' })]);

      await expect(
        plan.saveMany([aPlanItem({ id: 'plan-2', date: '2026-10-01' })]),
      ).rejects.toThrow(/unique\(bookId, date\)/);
    });

    it('refuses a batch that repeats a date inside itself', async () => {
      await expect(
        plan.saveMany([
          aPlanItem({ id: 'plan-1', order: 0, date: '2026-10-01' }),
          aPlanItem({ id: 'plan-2', order: 1, date: '2026-10-01' }),
        ]),
      ).rejects.toThrow(/unique\(bookId, date\)/);
    });

    it('allows the same date in a different book', async () => {
      await plan.saveMany([
        aPlanItem({ bookId: 'book-1', date: '2026-10-01' }),
        aPlanItem({ bookId: 'book-2', date: '2026-10-01' }),
      ]);

      expect(plan.saved).toHaveLength(2);
    });

    it('allows overwriting the same item by id', async () => {
      await plan.saveMany([aPlanItem({ id: 'plan-1', title: 'Cap. 1' })]);

      await plan.saveMany([aPlanItem({ id: 'plan-1', title: 'Cap. 2' })]);

      expect(plan.saved).toHaveLength(1);
      expect(required(plan.saved[0]).title).toBe('Cap. 2');
    });

    // O par de testes que fixa a semântica SEQUENCIAL, nos dois sentidos.
    //
    // Aqui o lote troca as datas de dois itens guardados. Validando o lote em
    // conjunto (como um índice deferível faria) isso passaria; o Postgres
    // recusa, porque ao regravar plan-1 com 2026-10-02 a linha plan-2 ainda
    // tem 2026-10-02. Consequência de domínio: um "swap de datas" não é uma
    // operação legítima do plano — e não é, porque a `date` é a identidade do
    // dia de leitura, não um atributo que se move.
    it('refuses a batch that swaps dates between two stored items', async () => {
      const first = aPlanItem({ id: 'plan-1', order: 0, date: '2026-10-01' });
      const second = aPlanItem({ id: 'plan-2', order: 1, date: '2026-10-02' });
      await plan.saveMany([first, second]);

      await expect(
        plan.saveMany([
          { ...first, date: '2026-10-02' },
          { ...second, date: '2026-10-01' },
        ]),
      ).rejects.toThrow(/unique\(bookId, date\)/);

      expect(plan.saved).toEqual([first, second]);
    });

    // ...e o outro sentido: quando o item que LIBERA a data vem antes no
    // lote, a operação passa. É a prova de que a checagem acompanha a ordem
    // de aplicação, e não o estado inicial da tabela.
    it('accepts a batch whose earlier row frees the date the later row takes', async () => {
      const first = aPlanItem({ id: 'plan-1', order: 0, date: '2026-10-01' });
      await plan.saveMany([first]);

      await expect(
        plan.saveMany([
          { ...first, date: '2026-10-02' },
          aPlanItem({ id: 'plan-2', order: 1, date: '2026-10-01' }),
        ]),
      ).resolves.toHaveLength(2);

      expect(plan.saved.map((item) => [item.id, item.date]).sort()).toEqual([
        ['plan-1', '2026-10-02'],
        ['plan-2', '2026-10-01'],
      ]);
    });
  });

  // O `order` NÃO tem índice único — tem `@@index`. → ADR 0007.
  //
  // A unicidade do `order` é invariante de DOMÍNIO: `normalizePlanDrafts`
  // deriva o `order` da posição no array, então a sequência é sempre
  // `0..n-1`. O banco não reafirma o que o domínio não consegue violar — e,
  // ao reafirmar, impedia a renumeração legítima do plano.
  //
  // Um fake MAIS RESTRITIVO que o banco também é infiel: era o que deixava a
  // suíte verde enquanto "acrescentar um Prólogo na frente do plano" falharia
  // em produção.
  describe('order is indexed, not unique', () => {
    it('accepts two items sharing an order in the same book', async () => {
      await expect(
        plan.saveMany([
          aPlanItem({ id: 'plan-1', order: 0, date: '2026-10-01' }),
          aPlanItem({ id: 'plan-2', order: 0, date: '2026-10-02' }),
        ]),
      ).resolves.toHaveLength(2);

      expect(plan.saved).toHaveLength(2);
    });

    it('accepts an order already taken by a stored item', async () => {
      await plan.saveMany([
        aPlanItem({ id: 'plan-1', order: 0, date: '2026-10-01' }),
      ]);

      await expect(
        plan.saveMany([
          aPlanItem({ id: 'plan-2', order: 0, date: '2026-10-02' }),
        ]),
      ).resolves.toHaveLength(1);
    });

    // O CASO DO ADR 0007, no nível do fake: um item novo entra na frente e os
    // sobreviventes são renumerados, NUMA SÓ chamada. Com o índice único de
    // `order`, o item novo colidiria com o `order 0` do sobrevivente que
    // ainda não foi regravado — e é isso que o Postgres faria.
    it('accepts a new item in front while renumbering the survivors, in one call', async () => {
      const first = aPlanItem({
        id: 'plan-a',
        order: 0,
        date: '2026-10-01',
        title: 'Cap. 1',
      });
      const second = aPlanItem({
        id: 'plan-b',
        order: 1,
        date: '2026-10-02',
        title: 'Cap. 2',
      });
      await plan.saveMany([first, second]);

      await expect(
        plan.saveMany([
          aPlanItem({ id: 'plan-novo', order: 0, date: '2026-09-30' }),
          { ...first, order: 1 },
          { ...second, order: 2 },
        ]),
      ).resolves.toHaveLength(3);

      expect(
        plan.saved
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((item) => [item.id, item.order]),
      ).toEqual([
        ['plan-novo', 0],
        ['plan-a', 1],
        ['plan-b', 2],
      ]);
    });
  });

  // A violação é recusada ANTES de escrever: uma escrita parcial esconderia a
  // regra 16 (atomicidade) do createBook por trás de um plano meio salvo.
  describe('refuses before writing', () => {
    it('stores nothing from a batch whose last item duplicates a stored date', async () => {
      await plan.saveMany([
        aPlanItem({ id: 'plan-old', order: 9, date: '2026-10-09' }),
      ]);

      await expect(
        plan.saveMany([
          aPlanItem({ id: 'plan-1', order: 0, date: '2026-10-01' }),
          aPlanItem({ id: 'plan-2', order: 1, date: '2026-10-02' }),
          aPlanItem({ id: 'plan-3', order: 2, date: '2026-10-09' }),
        ]),
      ).rejects.toThrow(/unique\(bookId, date\)/);

      expect(plan.saved.map((item) => item.id)).toEqual(['plan-old']);
    });

    // A transação é o que dá o "tudo ou nada" da ESCRITA; o índice único é
    // conferido linha por linha. O fake modela os dois: simula a aplicação
    // sequencial e só grava se o lote inteiro passar.
    it('refuses on the offending row even when the earlier rows were fine', async () => {
      await plan.saveMany([
        aPlanItem({ id: 'plan-old', order: 9, date: '2026-10-09' }),
      ]);

      const error = await caught(
        plan.saveMany([
          aPlanItem({ id: 'plan-1', order: 0, date: '2026-10-01' }),
          aPlanItem({ id: 'plan-2', order: 1, date: '2026-10-09' }),
          aPlanItem({ id: 'plan-3', order: 2, date: '2026-10-03' }),
        ]),
      );

      expect(error.message).toMatch(/saving item plan-2/);
      expect(plan.saved.map((item) => item.id)).toEqual(['plan-old']);
    });
  });

  // Contrato do fake, não regra de domínio: quem cair aqui escreveu um plano
  // que o Postgres recusaria, e isso é bug de código, não entrada do usuário.
  it('signals an index violation with a raw Error, never a domain error', async () => {
    await plan.saveMany([aPlanItem({ id: 'plan-1', date: '2026-10-01' })]);

    const error = await caught(
      plan.saveMany([aPlanItem({ id: 'plan-2', date: '2026-10-01' })]),
    );

    expect(error.name).toBe('Error');
  });
});
