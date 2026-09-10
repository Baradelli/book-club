import { describe, expect, it } from 'vitest';

import { aPlanItem } from '../../test-support/builders';
import type { ReadingPlanItem } from '../book';
import type { PlanItemMark } from '../plan-item-groups';
import { groupUsersByPlanItem } from '../plan-item-groups';

const BOOK_ID = 'book-1';
const DAY_1 = '2026-10-01';
const DAY_2 = '2026-10-02';
const DAY_3 = '2026-10-03';
const DAY_1_ID = `plan-${BOOK_ID}-${DAY_1}`;
const DAY_2_ID = `plan-${BOOK_ID}-${DAY_2}`;
const DAY_3_ID = `plan-${BOOK_ID}-${DAY_3}`;

// Nomes escolhidos para a ordem alfabética NÃO ser a de inserção: é o que faz
// um `userIds` sem `sort` falhar.
const ANA_ID = 'user-ana';
const ZECA_ID = 'user-zeca';
const MEMBER_ID = 'user-member';

function aThreeDayPlan(): ReadingPlanItem[] {
  return [
    aPlanItem({ bookId: BOOK_ID, date: DAY_1, order: 0 }),
    aPlanItem({ bookId: BOOK_ID, date: DAY_2, order: 1 }),
    aPlanItem({ bookId: BOOK_ID, date: DAY_3, order: 2 }),
  ];
}

function pair(planItemId: string, userId: string): PlanItemMark {
  return { planItemId, userId };
}

/**
 * A parte PURA da sobreposição — a mesma conta que a autoria (`writers`) e a
 * leitura (`readers`) fazem, e que a partir da Tarefa 31 tem **um** dono.
 *
 * ⚠️ **Os nomes dos 12 testes vêm do `plan-item-writers.test.ts` e foram
 * preservados letra por letra** (decisão E da Tarefa 31): eles são os
 * acusadores que já existiam, e reescrevê-los na mudança de casa seria a chance
 * de perder um sem ninguém notar (lição nº 19 do MVP 2 — fatia que move código
 * pergunta *"o que perdeu o dono?"*). Onde eles dizem "writer"/"author", leia
 * "a pessoa que marcou o dia": o vocabulário de nota é herança do lugar de onde
 * vieram, e o dono da conta agora é neutro — quem nomeia é a chamadora
 * (`groupWritersByPlanItem`, `groupReadersByPlanItem`), nunca esta função.
 *
 * Ela existe para não haver duas implementações do agrupamento: com uma cópia
 * em cada UseCase, "quem já escreveu" na tela do livro e "quem já escreveu"
 * depois de alguém salvar divergiriam no primeiro ajuste, e a divergência
 * apareceria como uma bolinha que some ao recarregar. O mesmo vale, agora, para
 * "quem já leu" — cobrir a leitura com uma segunda cópia é o que o
 * `CONVENCOES-CODIGO` §7.1 já tinha decidido por antecipação: **extrair, não
 * cobrir duas vezes**.
 */
describe('groupUsersByPlanItem', () => {
  it('returns one entry per plan item that has a writer', () => {
    const found = groupUsersByPlanItem(aThreeDayPlan(), [
      pair(DAY_1_ID, ANA_ID),
      pair(DAY_3_ID, ANA_ID),
    ]);

    expect(found).toEqual([
      { planItemId: DAY_1_ID, userIds: [ANA_ID] },
      { planItemId: DAY_3_ID, userIds: [ANA_ID] },
    ]);
  });

  // Item sem nota nenhuma NÃO aparece: o front sobrepõe no plano que ele já
  // tem, e devolver todos com `[]` duplicaria o plano na resposta.
  it('omits a plan item nobody wrote in', () => {
    const found = groupUsersByPlanItem(aThreeDayPlan(), [
      pair(DAY_2_ID, ANA_ID),
    ]);

    expect(found).toEqual([{ planItemId: DAY_2_ID, userIds: [ANA_ID] }]);
  });

  it('returns an empty list when nobody wrote', () => {
    expect(groupUsersByPlanItem(aThreeDayPlan(), [])).toEqual([]);
  });

  it('returns an empty list for a book without a plan', () => {
    expect(groupUsersByPlanItem([], [pair(DAY_1_ID, ANA_ID)])).toEqual([]);
  });

  // Duas pessoas no mesmo dia dão UMA entrada com DOIS userIds.
  it('groups two authors of the same day into one entry', () => {
    const found = groupUsersByPlanItem(aThreeDayPlan(), [
      pair(DAY_1_ID, ZECA_ID),
      pair(DAY_1_ID, ANA_ID),
      pair(DAY_1_ID, MEMBER_ID),
    ]);

    expect(found).toEqual([
      { planItemId: DAY_1_ID, userIds: [ANA_ID, MEMBER_ID, ZECA_ID] },
    ]);
  });

  // `userIds` ORDENADO, para a saída ser determinística: os pares chegam
  // fora da ordem alfabética de propósito.
  it('sorts the userIds of an entry', () => {
    const pairs = [pair(DAY_1_ID, ZECA_ID), pair(DAY_1_ID, ANA_ID)];
    // A precondição PINADA (§7.2), e ela é contra o **próprio fixture**, não
    // contra as duas constantes: a ordem em que os autores CHEGAM não pode já
    // ser a ordenada, senão a implementação sem `sort` coincide com a certa e
    // o verde é sorte — foi a armadilha `marcos < maria` da Tarefa 11. Assim
    // escrito, o pino cai tanto se alguém renomear um id quanto se alguém
    // reordenar as duas linhas acima; um `ANA_ID < ZECA_ID` só pega a primeira.
    const arriving = pairs.map((entry) => entry.userId);
    expect(arriving).not.toEqual([...arriving].sort());

    const found = groupUsersByPlanItem(aThreeDayPlan(), pairs);

    expect(found).toEqual([
      { planItemId: DAY_1_ID, userIds: [ANA_ID, ZECA_ID] },
    ]);
  });

  // O mesmo par repetido é UM autor: o port não promete unicidade, e uma
  // duplicata desenharia a mesma pessoa duas vezes na tela.
  it('never repeats an author who appears twice on the same day', () => {
    const found = groupUsersByPlanItem(aThreeDayPlan(), [
      pair(DAY_1_ID, ANA_ID),
      pair(DAY_1_ID, ANA_ID),
    ]);

    expect(found).toEqual([{ planItemId: DAY_1_ID, userIds: [ANA_ID] }]);
  });

  it('gives the same author one entry per day she wrote in', () => {
    const found = groupUsersByPlanItem(aThreeDayPlan(), [
      pair(DAY_1_ID, ANA_ID),
      pair(DAY_2_ID, ANA_ID),
    ]);

    expect(found).toEqual([
      { planItemId: DAY_1_ID, userIds: [ANA_ID] },
      { planItemId: DAY_2_ID, userIds: [ANA_ID] },
    ]);
  });

  /**
   * A ordem do array é a do **plano** (`order` crescente), nunca a em que os
   * pares chegaram — os dois repositórios de nota declaram explicitamente que
   * não prometem ordem, e o fake enumera INVERTIDO de propósito (§7.2).
   */
  it('orders the array by the plan order, never by the order the pairs came in', () => {
    const pairs = [
      pair(DAY_3_ID, ANA_ID),
      pair(DAY_1_ID, ANA_ID),
      pair(DAY_2_ID, ANA_ID),
    ];
    // A precondição PINADA (§7.2): a ordem em que os pares chegam tem de
    // DISCORDAR da ordem do plano, senão devolver "na ordem dos pares" — a
    // implementação errada — daria o mesmo array.
    expect(pairs.map((entry) => entry.planItemId)).not.toEqual([
      DAY_1_ID,
      DAY_2_ID,
      DAY_3_ID,
    ]);

    const found = groupUsersByPlanItem(aThreeDayPlan(), pairs);

    expect(found.map((entry) => entry.planItemId)).toEqual([
      DAY_1_ID,
      DAY_2_ID,
      DAY_3_ID,
    ]);
  });

  // E ordena por `order` mesmo que o plano chegue desordenado: um repositório
  // Prisma que perdesse o `orderBy` não desordena a tela do livro.
  it('orders by order even when the plan arrives out of order', () => {
    const found = groupUsersByPlanItem([...aThreeDayPlan()].reverse(), [
      pair(DAY_1_ID, ANA_ID),
      pair(DAY_2_ID, ANA_ID),
      pair(DAY_3_ID, ANA_ID),
    ]);

    expect(found.map((entry) => entry.planItemId)).toEqual([
      DAY_1_ID,
      DAY_2_ID,
      DAY_3_ID,
    ]);
  });

  /**
   * O array é construído a partir do **plano**, não dos pares: um `planItemId`
   * que não está no plano dado — dado inconsistente — não aparece.
   *
   * Sem esta propriedade o front sobreporia uma bolinha num dia que a tela dele
   * não tem.
   */
  it('never returns a planItemId that is not in the plan', () => {
    const found = groupUsersByPlanItem(aThreeDayPlan(), [
      pair(`plan-${BOOK_ID}-2026-10-09`, ANA_ID),
      pair(DAY_1_ID, ANA_ID),
    ]);

    expect(found).toEqual([{ planItemId: DAY_1_ID, userIds: [ANA_ID] }]);
  });

  // Sem I/O e sem efeito: os argumentos saem como entraram. Os dois chamadores
  // passam arrays que acabaram de ler do repositório, e mutá-los é smell de
  // fronteira — vira hábito e um dia o repositório os guarda em cache.
  it('never mutates the arrays it was given', () => {
    const plan = aThreeDayPlan();
    const pairs = [pair(DAY_3_ID, ZECA_ID), pair(DAY_1_ID, ANA_ID)];
    const planSnapshot = JSON.stringify(plan);
    const pairsSnapshot = JSON.stringify(pairs);

    groupUsersByPlanItem(plan, pairs);

    expect(JSON.stringify(plan)).toBe(planSnapshot);
    expect(JSON.stringify(pairs)).toBe(pairsSnapshot);
  });
});
