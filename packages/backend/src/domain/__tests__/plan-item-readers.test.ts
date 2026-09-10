import { describe, expect, it } from 'vitest';

import { aPlanItem, aReadingLog } from '../../test-support/builders';
import type { ReadingPlanItem } from '../book';
import { groupReadersByPlanItem } from '../plan-item-readers';
import type { ReadingLog } from '../reading-log';

const BOOK_ID = 'book-1';
const DAY_1 = '2026-10-01';
const DAY_2 = '2026-10-02';
const DAY_3 = '2026-10-03';
const DAY_1_ID = `plan-${BOOK_ID}-${DAY_1}`;
// Não há `DAY_2_ID`: o dia do meio existe no plano e **ninguém** o lê, e é por
// não ser citado na asserção que ele prova a omissão.
const DAY_3_ID = `plan-${BOOK_ID}-${DAY_3}`;
// Um dia que NÃO está no plano dado — dado inconsistente.
const OTHER_BOOK_DAY_ID = `plan-${BOOK_ID}-2026-10-09`;

// Nomes escolhidos para a ordem alfabética NÃO ser a de inserção: é o que faz
// um `userIds` sem `sort` falhar. (§7.2 — a armadilha `marcos < maria` da
// Tarefa 11, em que a ordem errada coincidia com a certa.)
const ANA_ID = 'user-ana';
const ZECA_ID = 'user-zeca';

function aThreeDayPlan(): ReadingPlanItem[] {
  return [
    aPlanItem({ bookId: BOOK_ID, date: DAY_1, order: 0 }),
    aPlanItem({ bookId: BOOK_ID, date: DAY_2, order: 1 }),
    aPlanItem({ bookId: BOOK_ID, date: DAY_3, order: 2 }),
  ];
}

/**
 * ⚠️ Um `ReadingLog` **inteiro**, de propósito, e não um par `{ planItemId,
 * userId }` escrito à mão: é o que prova que a entidade da Tarefa 30 atravessa
 * o agrupamento como está — com `id`, `clubId`, `bookId` e `readAt` a mais —,
 * sem conversão, sem `as` e sem um mapeamento que alguém teria de manter. E é
 * uma guarda de compilação, não só de runtime: tirar `userId` da entidade põe
 * **16** erros de `tsc` neste arquivo, e tirar `planItemId`, **17**.
 */
function aLog(planItemId: string, userId: string, id?: string): ReadingLog {
  return aReadingLog({
    bookId: BOOK_ID,
    planItemId,
    userId,
    ...(id ? { id } : {}),
  });
}

/**
 * A sobreposição de **leitura** da tela do livro: "quem já leu em cada dia do
 * plano".
 *
 * O nome é o ponto da fatia (decisão B da Tarefa 31). O
 * `groupWritersByPlanItem` compilaria com `ReadingLog[]` hoje, sem uma linha de
 * mudança — a tipagem do TypeScript é estrutural e o log tem os dois campos —,
 * e mesmo assim reusá-lo está recusado: um `writers` devolvendo leitores é
 * prosa-que-mente, e pior que uma cópia, porque a cópia pelo menos se vê. O que
 * se reusa é a **conta** (`groupUsersByPlanItem`, neutra e testada uma vez só),
 * não o nome.
 *
 * ⚠️ **Este arquivo tem DOIS testes, e não os dez da primeira entrega.** O
 * agrupamento é do módulo neutro e tem lá os 12 acusadores dele; reprovar aqui
 * ordem, `Set`, dia vazio e plano vazio seria **cobrir duas vezes** o que o
 * §7.1 mandou extrair — o mesmo critério que deixou o `plan-item-writers.test`
 * com um teste só. O que fica é o que o neutro **não** pode provar: que a
 * função com este NOME devolve a sobreposição de leitura de verdade (e não uma
 * reimplementação inline nem um `[]`), que o `ReadingLog` inteiro a atravessa,
 * e que ela não mexe no array de quem chamou.
 *
 * **Dentro do clube nada é privado** (ADR 0002): a sobreposição mostra todo
 * membro ativo que leu, com autoria — não só o ator. E **não há contagem**: a
 * saída é presença (quem leu em que dia), nunca placar — decisão do dono na
 * rodada do MVP 3.
 */
describe('groupReadersByPlanItem', () => {
  it('returns who already read each day, from ReadingLogs, in the plan order', () => {
    const logs = [
      aLog(DAY_3_ID, ANA_ID),
      aLog(DAY_3_ID, ANA_ID, 'reading-log-outro-id'), // o mesmo par: UM leitor
      aLog(DAY_1_ID, ZECA_ID),
      aLog(DAY_1_ID, ANA_ID),
      aLog(OTHER_BOOK_DAY_ID, ANA_ID), // fora do plano: não vaza
    ];
    // As duas precondições PINADAS (§7.2), e as duas contra o **próprio
    // fixture**, não contra as constantes: assim escritas elas caem tanto se
    // alguém renomear um id quanto se alguém reordenar as linhas acima.
    // 1. no dia com dois leitores, a ordem em que eles CHEGAM não é a ordenada;
    const day1Arrivals = logs
      .filter((log) => log.planItemId === DAY_1_ID)
      .map((log) => log.userId);
    expect(day1Arrivals).not.toEqual([...day1Arrivals].sort());

    // 2. e a ordem em que os logs chegam DISCORDA da ordem do plano.
    expect(logs.map((log) => log.planItemId)).not.toEqual([
      DAY_1_ID,
      DAY_1_ID,
      DAY_3_ID,
      DAY_3_ID,
      OTHER_BOOK_DAY_ID,
    ]);

    const found = groupReadersByPlanItem(aThreeDayPlan(), logs);

    // DAY_2 não aparece: ninguém o leu. E a ANA, que leu dois dias, tem uma
    // entrada em cada um.
    expect(found).toEqual([
      { planItemId: DAY_1_ID, userIds: [ANA_ID, ZECA_ID] },
      { planItemId: DAY_3_ID, userIds: [ANA_ID] },
    ]);
  });

  /**
   * Losslessness por snapshot antes/depois (§7.6), nunca por `toBe` de um
   * valor escrito à mão.
   *
   * Fica **aqui**, e não só no neutro, porque é a única coisa que um `logs`
   * mexido **dentro do wrapper** faria aparecer: ordenar ou desduplicar o
   * array antes de delegar não muda a saída — ela é montada a partir do plano —
   * e passaria calada por todo o resto da suíte. O array veio de um
   * repositório, e mutá-lo é smell de fronteira.
   */
  it('never mutates the ReadingLog array it was given', () => {
    const plan = aThreeDayPlan();
    const logs = [aLog(DAY_3_ID, ZECA_ID), aLog(DAY_1_ID, ANA_ID)];
    const planSnapshot = JSON.stringify(plan);
    const logsSnapshot = JSON.stringify(logs);

    groupReadersByPlanItem(plan, logs);

    expect(JSON.stringify(plan)).toBe(planSnapshot);
    expect(JSON.stringify(logs)).toBe(logsSnapshot);
  });
});
