import { describe, expect, it } from 'vitest';

import { aPlanItem } from '../../test-support/builders';
import type { ReadingPlanItem } from '../book';
import type { PlanItemWriter } from '../note';
import { groupWritersByPlanItem } from '../plan-item-writers';

const BOOK_ID = 'book-1';
const DAY_1 = '2026-10-01';
const DAY_2 = '2026-10-02';
const DAY_3 = '2026-10-03';
const DAY_1_ID = `plan-${BOOK_ID}-${DAY_1}`;
// Não há `DAY_2_ID`: o dia do meio existe no plano e **ninguém** escreve nele,
// e é justamente por não ter id citado na asserção que ele prova a omissão.
const DAY_3_ID = `plan-${BOOK_ID}-${DAY_3}`;
// Um dia que NÃO está no plano dado: dado inconsistente não desenha bolinha
// num dia que a tela não tem.
const OTHER_BOOK_DAY_ID = `plan-${BOOK_ID}-2026-10-09`;

// Nomes escolhidos para a ordem alfabética NÃO ser a de inserção: é o que faz
// um `userIds` sem `sort` falhar.
const ANA_ID = 'user-ana';
const ZECA_ID = 'user-zeca';

function aThreeDayPlan(): ReadingPlanItem[] {
  return [
    aPlanItem({ bookId: BOOK_ID, date: DAY_1, order: 0 }),
    aPlanItem({ bookId: BOOK_ID, date: DAY_2, order: 1 }),
    aPlanItem({ bookId: BOOK_ID, date: DAY_3, order: 2 }),
  ];
}

function pair(planItemId: string, userId: string): PlanItemWriter {
  return { planItemId, userId };
}

/**
 * A sobreposição de **autoria** da tela do livro — a mesma que o
 * `getBookWithPlan` devolve ao abrir o livro e que o `listPlanItemWriters`
 * recalcula depois de alguém salvar.
 *
 * ⚠️ **Este arquivo encolheu na Tarefa 31, e é de propósito.** Os 12 testes do
 * agrupamento **mudaram de casa** — inteiros, com os mesmos nomes — para
 * `plan-item-groups.test.ts`, junto da conta, que agora é neutra e tem duas
 * chamadoras nomeadas (`writers` e `readers`). Cobrir o agrupamento de novo
 * aqui seria "cobrir duas vezes" o que o §7.1 mandou **extrair**, e daria a
 * sensação de duas provas onde há uma.
 *
 * O que sobra aqui são os **dois** testes que o módulo neutro não pode fazer, e
 * são os mesmos dois que ficaram do lado da leitura: que a função com este NOME
 * devolve a sobreposição de autoria (e que os pares `PlanItemWriter` a
 * atravessam), e que ela não mexe no array de quem chamou. O primeiro é também
 * metade da regra 1 da tarefa — um mutante na conta neutra tem de acusar **nos
 * dois** lados, e este é o lado da autoria.
 */
describe('groupWritersByPlanItem', () => {
  it('groups the writers of each day, in the plan order', () => {
    const pairs = [
      pair(DAY_3_ID, ANA_ID),
      pair(DAY_3_ID, ANA_ID), // o mesmo par duas vezes: é UM autor
      pair(DAY_1_ID, ZECA_ID),
      pair(DAY_1_ID, ANA_ID),
      pair(OTHER_BOOK_DAY_ID, ANA_ID), // fora do plano: não vaza
    ];
    // As duas precondições PINADAS (§7.2), sem as quais a implementação errada
    // coincidiria com a certa e o verde seria sorte — e as duas contra o
    // **próprio fixture**, não contra as constantes: assim escritas elas caem
    // tanto se alguém renomear um id quanto se alguém reordenar as linhas.
    // 1. no dia com dois autores, a ordem em que eles CHEGAM não é a ordenada
    //    (foi a armadilha `marcos < maria` da Tarefa 11);
    const day1Arrivals = pairs
      .filter((entry) => entry.planItemId === DAY_1_ID)
      .map((entry) => entry.userId);
    expect(day1Arrivals).not.toEqual([...day1Arrivals].sort());

    // 2. e a ordem em que os pares chegam DISCORDA da ordem do plano.
    expect(pairs.map((entry) => entry.planItemId)).not.toEqual([
      DAY_1_ID,
      DAY_1_ID,
      DAY_3_ID,
      DAY_3_ID,
      OTHER_BOOK_DAY_ID,
    ]);

    const found = groupWritersByPlanItem(aThreeDayPlan(), pairs);

    // DAY_2 não aparece: ninguém escreveu nele.
    expect(found).toEqual([
      { planItemId: DAY_1_ID, userIds: [ANA_ID, ZECA_ID] },
      { planItemId: DAY_3_ID, userIds: [ANA_ID] },
    ]);
  });

  /**
   * Losslessness por snapshot antes/depois (§7.6), nunca por `toBe` de um
   * valor escrito à mão.
   *
   * Fica **aqui**, e não só no neutro, porque é a única coisa que um `pairs`
   * mexido **dentro do wrapper** faria aparecer: ordenar ou desduplicar o
   * array antes de delegar **não muda a saída** — ela é montada a partir do
   * plano —, e por isso passava calada por toda a suíte (medido na rodada de
   * correção da Tarefa 31: um `pairs.sort(...)` aqui sobrevivia a 1381 testes).
   *
   * O risco não é teórico: o `planItemWritersByBook` devolve um array que
   * acabou de vir do Prisma, e mutá-lo é o efeito que só aparece no dia em que
   * alguém puser cache no caminho.
   */
  it('never mutates the arrays it was given', () => {
    const plan = aThreeDayPlan();
    const pairs = [pair(DAY_3_ID, ZECA_ID), pair(DAY_1_ID, ANA_ID)];
    const planSnapshot = JSON.stringify(plan);
    const pairsSnapshot = JSON.stringify(pairs);

    groupWritersByPlanItem(plan, pairs);

    expect(JSON.stringify(plan)).toBe(planSnapshot);
    expect(JSON.stringify(pairs)).toBe(pairsSnapshot);
  });
});
