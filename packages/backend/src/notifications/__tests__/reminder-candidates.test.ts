import { beforeEach, describe, expect, it } from 'vitest';

import {
  aBook,
  aMembership,
  aPlanItem,
  aReadingLog,
} from '../../test-support/builders';
import { BookRepositoryFake } from '../../usecases/_fakes/book-repository-fake';
import { MembershipRepositoryFake } from '../../usecases/_fakes/membership-repository-fake';
import { ReadingLogRepositoryFake } from '../../usecases/_fakes/reading-log-repository-fake';
import { ReadingPlanItemRepositoryFake } from '../../usecases/_fakes/reading-plan-item-repository-fake';
import type { ReminderCandidateDeps } from '../reminder-candidates';
import { readingOfTheDay } from '../reminder-candidates';

/**
 * ⚠️ **A SELEÇÃO — "o que esta pessoa tem para ler hoje", separada da decisão
 * de mandar (regra 20 da Tarefa 37).**
 *
 * É aqui que moram a **supressão anti-culpa** (regra 8) e o **`skipped`
 * silencioso de quem não tem plano hoje** (regra 9, decisão B).
 */

const MARIA = 'user-maria';
const MARCOS = 'user-marcos';
const CLUB = 'club-casal';
const BOOK = 'book-hobbit';
/** Notoriamente NÃO-HOJE (§7.8): nada aqui deriva do relógio. */
const TODAY = '2026-10-05';

describe('readingOfTheDay', () => {
  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let planItems: ReadingPlanItemRepositoryFake;
  let readingLogs: ReadingLogRepositoryFake;
  let deps: ReminderCandidateDeps;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    planItems = new ReadingPlanItemRepositoryFake();
    readingLogs = new ReadingLogRepositoryFake();
    deps = { memberships, books, planItems, readingLogs };

    await memberships.save(aMembership({ userId: MARIA, clubId: CLUB }));
    await books.save(aBook({ id: BOOK, clubId: CLUB }));
  });

  it('finds the reading of the day nobody has read yet', async () => {
    await planItems.saveMany([
      aPlanItem({ id: 'dia-5', bookId: BOOK, date: TODAY, order: 4 }),
    ]);

    const result = await readingOfTheDay(deps, MARIA, TODAY);

    expect(result).toEqual({
      status: 'TO_READ',
      bookId: BOOK,
      planItem: expect.objectContaining({ id: 'dia-5' }),
    });
  });

  /**
   * ⚠️ **REGRA 9 / DECISÃO B — sem plano para hoje, não há do que lembrar.**
   *
   * É o estado normal do clube entre dois livros, e ele **não é erro**: nada de
   * exceção, nada de log de erro, nada de lembrete vazio.
   */
  it('answers NO_PLAN when there is no reading for today', async () => {
    await planItems.saveMany([
      aPlanItem({ id: 'ontem', bookId: BOOK, date: '2026-10-04' }),
      aPlanItem({ id: 'amanha', bookId: BOOK, date: '2026-10-06' }),
    ]);

    await expect(readingOfTheDay(deps, MARIA, TODAY)).resolves.toEqual({
      status: 'NO_PLAN',
    });
  });

  it('answers NO_PLAN when the person has no club at all', async () => {
    await planItems.saveMany([
      aPlanItem({ id: 'dia-5', bookId: BOOK, date: TODAY }),
    ]);

    await expect(readingOfTheDay(deps, MARCOS, TODAY)).resolves.toEqual({
      status: 'NO_PLAN',
    });
  });

  /**
   * ⚠️ **REGRA 8 — A SUPRESSÃO ANTI-CULPA: quem já leu não recebe.**
   *
   * `NOTIFICACOES.md` §1: *"Não chega para quem já registrou a leitura de hoje
   * — princípio anti-culpa: o app não cobra quem já fez."*
   *
   * E a pergunta é o par `(planItemId, userId)` (decisão 2 do MVP 3), que é
   * literalmente a chave única do `ReadingLog`: nenhuma faixa de instantes,
   * nenhuma data a comparar.
   */
  it('answers ALREADY_READ when the person registered the reading of the day', async () => {
    await planItems.saveMany([
      aPlanItem({ id: 'dia-5', bookId: BOOK, date: TODAY }),
    ]);
    await readingLogs.save(
      aReadingLog({ planItemId: 'dia-5', userId: MARIA, bookId: BOOK }),
    );

    await expect(readingOfTheDay(deps, MARIA, TODAY)).resolves.toEqual({
      status: 'ALREADY_READ',
    });
  });

  /**
   * ⚠️ **A supressão é DELA, não do clube.** O log do Marcos não cala o
   * lembrete da Maria — seria o pior tipo de silêncio: o app pararia de lembrar
   * quem não leu justamente porque outra pessoa leu.
   */
  it('is not silenced by somebody ELSE having read it', async () => {
    await memberships.save(aMembership({ userId: MARCOS, clubId: CLUB }));
    await planItems.saveMany([
      aPlanItem({ id: 'dia-5', bookId: BOOK, date: TODAY }),
    ]);
    await readingLogs.save(
      aReadingLog({ planItemId: 'dia-5', userId: MARCOS, bookId: BOOK }),
    );

    await expect(readingOfTheDay(deps, MARIA, TODAY)).resolves.toMatchObject({
      status: 'TO_READ',
    });
  });

  /**
   * ⚠️ **A supressão é do DIA DE HOJE.** Ter lido ontem não cala o lembrete de
   * hoje — é a forma mais provável de a supressão ficar larga demais, e a que
   * transformaria o app num lembrete que some depois da primeira leitura.
   */
  it('is not silenced by having read YESTERDAY', async () => {
    await planItems.saveMany([
      aPlanItem({ id: 'dia-4', bookId: BOOK, date: '2026-10-04', order: 3 }),
      aPlanItem({ id: 'dia-5', bookId: BOOK, date: TODAY, order: 4 }),
    ]);
    await readingLogs.save(
      aReadingLog({ planItemId: 'dia-4', userId: MARIA, bookId: BOOK }),
    );

    await expect(readingOfTheDay(deps, MARIA, TODAY)).resolves.toMatchObject({
      status: 'TO_READ',
      planItem: expect.objectContaining({ id: 'dia-5' }),
    });
  });

  /**
   * ⚠️ **NENHUMA ARITMÉTICA DE DATA (decisão A): a comparação é IGUALDADE DE
   * `CalendarDay`, e este é o teste que fica vermelho se alguém a trocar por
   * `Date`.**
   *
   * O fixture é escolhido para a implementação errada FALHAR (§7.2/§7.8): o dia
   * pedido é `'2026-10-05'` e o plano tem `'2026-10-5'` — a MESMA data para
   * qualquer conta que passe por `Date`, e dias diferentes para a igualdade de
   * string que o projeto usa. Uma implementação com `new Date(...)` dos dois
   * lados devolveria `TO_READ` aqui.
   */
  it('matches the day by CalendarDay equality, so date arithmetic would fail here', async () => {
    await planItems.saveMany([
      aPlanItem({ id: 'dia-torto', bookId: BOOK, date: '2026-10-5' }),
    ]);

    await expect(readingOfTheDay(deps, MARIA, '2026-10-05')).resolves.toEqual({
      status: 'NO_PLAN',
    });
    // O par positivo: com a grafia canônica, o MESMO item é achado — senão
    // "devolve NO_PLAN sempre" passaria aqui.
    await expect(
      readingOfTheDay(deps, MARIA, '2026-10-5'),
    ).resolves.toMatchObject({ status: 'TO_READ' });
  });

  /**
   * ⚠️ **MEMBRESIA ARQUIVADA NÃO RECEBE** — o corte de tenant do `CLAUDE.md`,
   * feito pelos repositórios que já são donos dele.
   */
  it('never reminds somebody whose membership is archived', async () => {
    await memberships.save(
      aMembership({ userId: MARCOS, clubId: CLUB, status: 'ARCHIVED' }),
    );
    await planItems.saveMany([
      aPlanItem({ id: 'dia-5', bookId: BOOK, date: TODAY }),
    ]);

    await expect(readingOfTheDay(deps, MARCOS, TODAY)).resolves.toEqual({
      status: 'NO_PLAN',
    });
  });

  /**
   * ⚠️ **LIVRO ARQUIVADO NÃO GERA LEMBRETE, e o CLUBE arquivado GERA** — as
   * duas metades, porque a assimetria é deliberada.
   *
   * Arquivar o livro é como o clube o tira da estante: o plano dele é história,
   * não "a leitura de hoje". Arquivar o **clube** é outra coisa — o ADR 0009
   * decidiu que ele sai do seletor e o acervo **continua legível** para quem era
   * membro, e o guard de tenant do projeto confere só o `Membership`. Não é
   * aqui que essa decisão se reabre.
   */
  it('skips an archived BOOK', async () => {
    await books.update(BOOK, { status: 'ARCHIVED' });
    await planItems.saveMany([
      aPlanItem({ id: 'dia-5', bookId: BOOK, date: TODAY }),
    ]);

    await expect(readingOfTheDay(deps, MARIA, TODAY)).resolves.toEqual({
      status: 'NO_PLAN',
    });
  });

  /**
   * ⚠️ **DOIS CLUBES LENDO NO MESMO DIA: o trecho escolhido é DETERMINÍSTICO.**
   *
   * O claim é um por pessoa por dia, então sai **um** lembrete — e qual trecho
   * ele nomeia não pode depender do plano de execução do Postgres. O fake
   * enumera INVERTIDO de propósito (§7.2), então este teste falha se alguém
   * confiar na ordem do repositório.
   */
  it('picks the same reading every time when two clubs read on the same day', async () => {
    await memberships.save(aMembership({ userId: MARIA, clubId: 'club-b' }));
    await books.save(aBook({ id: 'book-a-livro', clubId: 'club-b' }));
    await planItems.saveMany([
      aPlanItem({ id: 'do-hobbit', bookId: BOOK, date: TODAY, order: 4 }),
      aPlanItem({
        id: 'do-outro',
        bookId: 'book-a-livro',
        date: TODAY,
        order: 0,
      }),
    ]);

    const first = await readingOfTheDay(deps, MARIA, TODAY);
    const again = await readingOfTheDay(deps, MARIA, TODAY);

    expect(first).toEqual(again);
    // `book-a-livro` < `book-hobbit`: a ordem é por `bookId`, e o fixture é
    // escolhido para a ordem de INSERÇÃO (e a invertida do fake) darem outra
    // resposta — senão a asserção não escolheria nada (§7.2).
    expect(first).toMatchObject({
      status: 'TO_READ',
      planItem: expect.objectContaining({ id: 'do-outro' }),
    });
  });

  /**
   * E com dois clubes, ter lido **um** dos dois não cala o outro: só
   * `ALREADY_READ` quando **tudo** o que havia para hoje foi lido.
   */
  it('still reminds about the second club when only the first was read', async () => {
    await memberships.save(aMembership({ userId: MARIA, clubId: 'club-b' }));
    await books.save(aBook({ id: 'book-a-livro', clubId: 'club-b' }));
    await planItems.saveMany([
      aPlanItem({ id: 'do-hobbit', bookId: BOOK, date: TODAY }),
      aPlanItem({ id: 'do-outro', bookId: 'book-a-livro', date: TODAY }),
    ]);
    await readingLogs.save(
      aReadingLog({ planItemId: 'do-outro', userId: MARIA }),
    );

    await expect(readingOfTheDay(deps, MARIA, TODAY)).resolves.toMatchObject({
      status: 'TO_READ',
      planItem: expect.objectContaining({ id: 'do-hobbit' }),
    });
  });

  /**
   * ⚠️ **O FILTRO QUE FOI AO REPOSITÓRIO** (§7.3): o dia certo e **um** pedido
   * só, com os livros juntos — não uma ida ao banco por livro, e não "traz tudo
   * e filtra em memória". Nenhuma das três alternativas muda o resultado nos
   * cenários acima.
   */
  it('asks the repository for the day itself, in ONE call with every book', async () => {
    await memberships.save(aMembership({ userId: MARIA, clubId: 'club-b' }));
    await books.save(aBook({ id: 'book-b-livro', clubId: 'club-b' }));
    await planItems.saveMany([
      aPlanItem({ id: 'dia-5', bookId: BOOK, date: TODAY }),
    ]);

    await readingOfTheDay(deps, MARIA, TODAY);

    expect(planItems.findCalls).toBe(1);
    expect(planItems.findFilters).toHaveLength(1);
    const [filter] = planItems.findFilters;
    expect(filter?.date).toBe(TODAY);
    expect([...(filter?.bookIds ?? [])].sort()).toEqual(
      [BOOK, 'book-b-livro'].sort(),
    );
    // E o plano NÃO foi carregado inteiro por livro: `findByBook` fica zerado.
    expect(planItems.findByBookCalls).toBe(0);
  });
});
