import { describe, expect, it } from 'vitest';

import { compareNewestFirst, type NewestFirst } from '../newest-first';

/**
 * ⚠️ **A ORDEM "MAIS RECENTE PRIMEIRO" PASSOU A TER UM DONO SÓ — e ele nasceu
 * de um mutante sobrevivente (rodada de correção da Tarefa 44b).**
 *
 * A mesma conta — `createdAt` **desc**, empate desfeito por `id` **asc** —
 * estava escrita **cinco** vezes: `list-notes.ts`, `list-highlights.ts`,
 * `list-books.ts` (com o `month` na frente), `activity-event-repository-fake.ts`
 * (`compareForTheFeed`) e o `lastActiveByBook` do `HighlightRepositoryFake`.
 * Quatro comparavam por **code point**; a quinta, escrita por último, usou
 * `localeCompare` — e **nada acusou a divergência**, porque nenhum teste
 * unitário tocava o desempate do fake (medido: inverter aquele desempate
 * passava por 1987 testes sem um vermelho).
 *
 * É a lição nº 3 do MVP 1 outra vez (regra que mora em N lugares) e o §7.1 na
 * frase que ele mesmo prescreve: *"extrair, não cobrir duas vezes"*. Não é
 * detalhe de cada listagem — é a codificação da MESMA cláusula que os dois
 * repositórios Prisma pedem ao Postgres
 * (`orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]`), então o acoplamento já
 * existia; ele só não estava escrito num lugar.
 *
 * ⚠️ **O QUE ESTE ARQUIVO NÃO AFIRMA.** Ele **não** diz qual ordem o Postgres
 * daria para dois ids que divergem: isso é do teste de contrato contra o banco
 * real (`breaks a createdAt tie by id, the same total order the listing uses`,
 * no contrato do `PrismaHighlightRepository`), que é o único lugar onde a
 * pergunta é decidível (§7.10). O que se afirma aqui é mais estreito e é o que
 * basta: **o projeto inteiro compara por code point, e este é o único dono
 * dessa escolha.**
 */
describe('compareNewestFirst', () => {
  function row(id: string, createdAt: string): NewestFirst {
    return { createdAt: new Date(createdAt), id };
  }

  const TIE = '2026-10-05T05:05:05.005Z';

  function idsOf(rows: readonly NewestFirst[]): string[] {
    return [...rows].sort(compareNewestFirst).map((each) => each.id);
  }

  it('puts the most recent first, whatever the ids say', () => {
    const novo = row('b', '2026-10-09T00:00:00.000Z');
    const velho = row('a', '2026-10-01T00:00:00.000Z');

    expect(compareNewestFirst(novo, velho)).toBeLessThan(0);
    expect(compareNewestFirst(velho, novo)).toBeGreaterThan(0);
  });

  /**
   * O empate no mesmo milissegundo é o caso normal de um clube: duas pessoas
   * salvando ao mesmo tempo, o retry da fila offline, um seed em lote.
   */
  it('breaks a createdAt tie by the SMALLER id', () => {
    expect(compareNewestFirst(row('a', TIE), row('z', TIE))).toBeLessThan(0);
    expect(compareNewestFirst(row('z', TIE), row('a', TIE))).toBeGreaterThan(0);
  });

  it('is zero only when the two rows tie on BOTH fields', () => {
    expect(compareNewestFirst(row('x', TIE), row('x', TIE))).toBe(0);
  });

  /**
   * ⚠️ **O PAR EM QUE `localeCompare` DISCORDA — medido, e é a razão de a
   * escolha estar escrita em vez de suposta.**
   *
   * `'A'.localeCompare('a')` é **1** (o ICU do Node põe a minúscula antes) e
   * `'A' < 'a'` é **true** (U+0041 < U+0061). Um id de fixture é escrito à mão
   * e pode ter maiúscula; um `randomUUID()` não pode, e é por isso que o
   * defeito era **latente** — varridos os 1.206.681 pares do alfabeto real
   * (`[0-9a-f-]`), zero divergências. Latente não é inexistente: o fake
   * enumera fixtures, e fixture é onde a maiúscula entra.
   */
  it('⚠️ compares by CODE POINT, on a pair where localeCompare disagrees', () => {
    expect(compareNewestFirst(row('A', TIE), row('a', TIE))).toBeLessThan(0);

    // O lado positivo do par (§7.4): a divergência é real, e não uma afirmação
    // sobre o `Intl` copiada de outro arquivo.
    expect('A'.localeCompare('a')).toBe(1);
    expect('A' < 'a').toBe(true);
  });

  /**
   * O uso real é `sort`, e `sort` exige comparador TOTAL: sem o desempate a
   * ordem sairia como o array chegou, que é diferente entre o fake e o Prisma.
   */
  it('gives a sort the same answer whatever order it started in', () => {
    const rows = [
      row('z', TIE),
      row('a', '2026-10-09T00:00:00.000Z'),
      row('b', TIE),
    ];

    expect(idsOf(rows)).toEqual(['a', 'b', 'z']);
    expect(idsOf([...rows].reverse())).toEqual(['a', 'b', 'z']);
  });
});
