import { beforeEach, describe, expect, it } from 'vitest';

import { NotAMemberError } from '../../domain/errors';
import {
  aBook,
  aMembership,
  aPlanItem,
  aReadingLog,
  aSettings,
} from '../../test-support/builders';
import { BookRepositoryFake } from '../_fakes/book-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { ReadingLogRepositoryFake } from '../_fakes/reading-log-repository-fake';
import { ReadingPlanItemRepositoryFake } from '../_fakes/reading-plan-item-repository-fake';
import { SettingsRepositoryFake } from '../_fakes/settings-repository-fake';
import { GetClubStreaks } from '../get-club-streaks';

/**
 * A CORRENTE DE CADA PESSOA DO CLUBE (ADR 0010, o "foguinho").
 *
 * A regra de contagem é do `computeReadingStreak`, que é puro e tem suíte
 * própria. Aqui se testa o que é DESTE UseCase: o corte de tenant, quem entra
 * na lista, e o fuso em que cada "hoje" é resolvido.
 */
describe('GetClubStreaks', () => {
  const CLUBE = 'c-casal';
  const MARCOS = 'u-marcos';
  const MARIA = 'u-maria';
  const LIVRO = 'b-hobbit';

  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let planItems: ReadingPlanItemRepositoryFake;
  let readingLogs: ReadingLogRepositoryFake;
  let settings: SettingsRepositoryFake;
  let usecase: GetClubStreaks;

  const HOJE = new Date('2026-09-13T12:00:00.000Z');

  /**
   * ⚠️ **A ORDEM NÃO É PROMESSA, e o §7.2 me pegou escrevendo que era.**
   *
   * O `findByClub` não promete ordem, e o fake enumera **invertido de
   * propósito** justamente para derrubar quem depender dela. A primeira versão
   * destes testes assertava `[MARCOS, MARIA]` e ficou vermelha — o teste estava
   * errado, não o código. Quem precisa de ordem é a tela, e ela ordena pelo que
   * quiser: a resposta é indexada por `userId`.
   */
  const porPessoa = (rows: readonly { userId: string; streak: number }[]) =>
    [...rows].sort((a, b) => a.userId.localeCompare(b.userId));

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    planItems = new ReadingPlanItemRepositoryFake();
    readingLogs = new ReadingLogRepositoryFake();
    settings = new SettingsRepositoryFake();

    await memberships.save(aMembership({ clubId: CLUBE, userId: MARCOS }));
    await memberships.save(aMembership({ clubId: CLUBE, userId: MARIA }));
    await books.save(aBook({ id: LIVRO, clubId: CLUBE }));

    for (const [id, date] of [
      ['p-11', '2026-09-11'],
      ['p-12', '2026-09-12'],
      ['p-13', '2026-09-13'],
    ] as const) {
      await planItems.saveMany([aPlanItem({ id, bookId: LIVRO, date })]);
    }

    usecase = new GetClubStreaks(
      memberships,
      books,
      planItems,
      readingLogs,
      settings,
    );
  });

  it('devolve zero para todo mundo quando ninguém leu', async () => {
    const result = await usecase.execute({
      clubId: CLUBE,
      actorUserId: MARCOS,
      now: HOJE,
    });

    expect(porPessoa(result)).toEqual([
      { userId: MARCOS, streak: 0, readToday: false },
      { userId: MARIA, streak: 0, readToday: false },
    ]);
  });

  it('conta a corrente de cada pessoa separadamente', async () => {
    await readingLogs.save(
      aReadingLog({ planItemId: 'p-12', userId: MARCOS, bookId: LIVRO }),
    );
    await readingLogs.save(
      aReadingLog({ planItemId: 'p-13', userId: MARCOS, bookId: LIVRO }),
    );
    await readingLogs.save(
      aReadingLog({ planItemId: 'p-13', userId: MARIA, bookId: LIVRO }),
    );

    const result = await usecase.execute({
      clubId: CLUBE,
      actorUserId: MARCOS,
      now: HOJE,
    });

    expect(porPessoa(result)).toEqual([
      { userId: MARCOS, streak: 2, readToday: true },
      { userId: MARIA, streak: 1, readToday: true },
    ]);
  });

  /**
   * ⚠️ **`readToday` É DO SERVIDOR, e a tela não consegue deduzi-lo.**
   *
   * Os dois casos abaixo têm a MESMA corrente (2) e `readToday` diferente:
   * quem leu 11 e 12 (com hoje = 13, ainda não lido) e quem leu 12 e 13. É
   * este campo que decide se a frase de perda aparece — deduzi-lo pela corrente
   * mostraria a cobrança para quem acabou de ler.
   */
  it('⚠️ distingue "leu até ontem" de "leu hoje" com a MESMA corrente', async () => {
    for (const planItemId of ['p-11', 'p-12']) {
      await readingLogs.save(
        aReadingLog({ planItemId, userId: MARCOS, bookId: LIVRO }),
      );
    }
    for (const planItemId of ['p-12', 'p-13']) {
      await readingLogs.save(
        aReadingLog({ planItemId, userId: MARIA, bookId: LIVRO }),
      );
    }

    const result = await usecase.execute({
      clubId: CLUBE,
      actorUserId: MARCOS,
      now: HOJE,
    });

    expect(porPessoa(result)).toEqual([
      { userId: MARCOS, streak: 2, readToday: false },
      { userId: MARIA, streak: 2, readToday: true },
    ]);
  });

  /**
   * ⚠️ **O CORTE DE TENANT, e ele é a mesma regra de todo o resto** (`CLAUDE.md`):
   * sem membership ativo a resposta é **404**, não 403 — não vazamos nem a
   * existência do clube, quanto mais quem lê nele.
   */
  it('⚠️ recusa quem não é membro ativo do clube, sem ler nada', async () => {
    await expect(
      usecase.execute({
        clubId: CLUBE,
        actorUserId: 'u-estranha',
        now: HOJE,
      }),
    ).rejects.toBeInstanceOf(NotAMemberError);

    // ⚠️ E recusa ANTES de consultar (§7.3): quem não pode ver não descobre,
    // pelo tempo de resposta, que o clube tem plano.
    expect(planItems.findCalls).toBe(0);
    expect(readingLogs.planItemIdsReadByCalls).toBe(0);
  });

  it('não inclui quem saiu do clube', async () => {
    await memberships.save(
      aMembership({ clubId: CLUBE, userId: 'u-antiga', status: 'ARCHIVED' }),
    );

    const result = await usecase.execute({
      clubId: CLUBE,
      actorUserId: MARCOS,
      now: HOJE,
    });

    expect(porPessoa(result).map((row) => row.userId)).toEqual([MARCOS, MARIA]);
  });

  /**
   * ⚠️ **CADA PESSOA TEM O SEU "HOJE"**, e não o de quem está olhando.
   *
   * Medido aqui: às 12:00 UTC de 13/09, em São Paulo (UTC−3) ainda é dia 13,
   * e em Auckland (UTC+12) já é dia 14. Com um "hoje" só — o de quem pede — a
   * corrente da pessoa do outro fuso seria calculada num dia que não é o dela,
   * e o dia 14 (que ela ainda tem) contaria como falta.
   */
  it('⚠️ resolve o "hoje" no fuso de CADA pessoa, não no de quem pergunta', async () => {
    await settings.save(
      aSettings({ userId: MARIA, timezone: 'Pacific/Auckland' }),
    );
    await planItems.saveMany([
      aPlanItem({ id: 'p-14', bookId: LIVRO, date: '2026-09-14' }),
    ]);

    // Maria leu até o 13. No fuso dela já é dia 14 — que ela ainda tem, então
    // a corrente NÃO quebra e vale 3.
    for (const planItemId of ['p-11', 'p-12', 'p-13']) {
      await readingLogs.save(
        aReadingLog({ planItemId, userId: MARIA, bookId: LIVRO }),
      );
    }

    const result = await usecase.execute({
      clubId: CLUBE,
      actorUserId: MARCOS,
      now: HOJE,
    });

    expect(result.find((row) => row.userId === MARIA)?.streak).toBe(3);
  });

  /**
   * ⚠️ A corrente **atravessa livros** (ADR 0010): ela é do clube, na ordem das
   * datas. Uma corrente que zera quando o clube termina o livro do mês seria
   * visivelmente errada para quem a olha.
   */
  it('⚠️ atravessa livros — a corrente é do clube, não do livro', async () => {
    await books.save(aBook({ id: 'b-outro', clubId: CLUBE }));
    await planItems.saveMany([
      aPlanItem({ id: 'p-10', bookId: 'b-outro', date: '2026-09-10' }),
    ]);

    for (const [planItemId, bookId] of [
      ['p-10', 'b-outro'],
      ['p-11', LIVRO],
      ['p-12', LIVRO],
      ['p-13', LIVRO],
    ] as const) {
      await readingLogs.save(
        aReadingLog({ planItemId, userId: MARCOS, bookId }),
      );
    }

    const result = await usecase.execute({
      clubId: CLUBE,
      actorUserId: MARCOS,
      now: HOJE,
    });

    expect(result.find((row) => row.userId === MARCOS)?.streak).toBe(4);
  });

  /**
   * ⚠️ **O livro de OUTRO clube não entra.** O corte é por `clubId` nos livros,
   * e é ele que impede a corrente de um clube de contar dias de outro — o
   * mutante que troca `find({ clubId })` por `find({})` seria invisível num
   * clube só.
   */
  it('⚠️ ignora o plano de outro clube', async () => {
    await books.save(aBook({ id: 'b-alheio', clubId: 'c-outro' }));
    await planItems.saveMany([
      aPlanItem({ id: 'p-alheio', bookId: 'b-alheio', date: '2026-09-12' }),
    ]);
    await readingLogs.save(
      aReadingLog({
        planItemId: 'p-alheio',
        userId: MARCOS,
        bookId: 'b-alheio',
      }),
    );

    const result = await usecase.execute({
      clubId: CLUBE,
      actorUserId: MARCOS,
      now: HOJE,
    });

    expect(result.find((row) => row.userId === MARCOS)?.streak).toBe(0);
  });
});
