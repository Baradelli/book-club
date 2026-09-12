import { describe, expect, it } from 'vitest';

import { calendarDayToDate, dateToCalendarDay } from '../calendar-day-mapper';

/**
 * Este arquivo é a rede que impede o bug "o plano do dia 5 aparece no dia 4".
 * A coluna é `DateTime @db.Date` e o Prisma devolve um `Date` em meia-noite
 * UTC; qualquer conversão que passe por hora LOCAL erra de um dia em metade do
 * planeta.
 *
 * ============================================================================
 * ⚠️ `TZ` — O QUE É CONFIÁVEL, O QUE NÃO É, E EM QUE CONDIÇÃO (medido)
 * ============================================================================
 *
 * O comentário que estava aqui dizia, em uma linha: *"NENHUM teste aqui troca
 * `TZ` do processo: `TZ=` não é confiável no Node do Windows."* Ele estava
 * **meio certo**, e a metade errada custou caro — porque "não confie em `TZ`"
 * ao lado de um `vitest` que agora **pina `TZ`** faz o próximo leitor desfazer
 * o pino. Medido nesta máquina (Windows 11, Node v24.16.0), as três rotas:
 *
 * | Rota | Resultado |
 * |---|---|
 * | `TZ=UTC node …` (prefixo no Git Bash, valor **sem barra**) | ✅ **chega**: `process.env.TZ = "UTC"` e o `Intl` segue |
 * | `TZ=Asia/Tokyo node …` (prefixo no Git Bash, valor **com barra**) | ❌ `undefined`, e o fuso continua o da máquina |
 * | `TZ=Etc/UTC node …` (com barra, valor válido) | ❌ `undefined` — confirma que é a **barra**, não o nome do fuso |
 * | `$env:TZ='Asia/Tokyo'; node …` (PowerShell) | ✅ chega, e o `Intl` segue |
 * | `process.env.TZ = '…'` **dentro** do processo | ✅ o `Intl` e o `getTimezoneOffset` releem na hora |
 *
 * ⚠️ **A REGRA NÃO É "`TZ=` não funciona" — É "VALOR COM BARRA NÃO CHEGA".** O
 * MSYS2 do Git Bash trata valor que parece caminho POSIX como caminho, e neste
 * caso o descarta **sem erro nenhum**. `TZ=UTC` passa; `TZ=Etc/UTC` não. E como
 * quase todo nome IANA tem barra (`America/Sao_Paulo`, `Asia/Tokyo`), a
 * impressão que fica é a de que `TZ` não funciona — daí o comentário antigo.
 *
 * ⚠️ **E O CONTROLE QUE SUSTENTAVA A REGRA ERRADA VARIAVA DUAS COISAS.** Ele
 * era `FOO=bar` (chega) contra `TZ=Asia/Tokyo` (não chega) — e as duas linhas
 * diferem **no nome da variável E na forma do valor**. O controle certo é
 * `TZ=UTC`: mesmo nome, sem barra, e **chega**. Medido pelo orquestrador ao
 * conferir a rodada de conserto da Tarefa 37. Fica registrado porque a regra
 * errada estava escrita aqui, e uma regra que diz "não dá para forçar o fuso
 * pela linha de comando" **impede a próxima pessoa de fazer uma medição que
 * dá**.
 *
 * Conclusão prática, e ela não muda por causa da correção: os testes abaixo
 * **escolhem o fuso explicitamente**, com `process.env.TZ` e restauração no
 * `finally` — a única rota que funciona para **qualquer** nome IANA, e a mesma
 * que o `env: { TZ }` do Vitest usa por dentro e que o `local-day.test.ts` do
 * `shared` já usava.
 *
 * ⚠️ **E POR QUE ISSO PASSOU A SER OBRIGATÓRIO AQUI (Tarefa 37).** Até esta
 * fatia o arquivo provava tudo por "asserção do INSTANTE UTC exato", e isso
 * **parecia** independente de fuso. Não é. Medido com o mutante que apaga o
 * `Z` de `calendarDayToDate` (`new Date(\`${day}T00:00:00.000\`)`, que é
 * literalmente o que o docblock da função chama de "o ponto todo desta
 * função"):
 *
 * | `TZ` da suíte | acusadores |
 * |---|---|
 * | `America/Sao_Paulo` (UTC−3) | **6** |
 * | `UTC` | **0** — 1824/1824 verdes |
 *
 * Em offset zero, `new Date('2026-10-05T00:00:00')` e
 * `new Date('2026-10-05T00:00:00Z')` são **o mesmo valor**, então nenhuma
 * asserção sobre o valor consegue separá-los. A rede inteira deste arquivo
 * dependia, sem dizer, de a máquina estar a oeste de Greenwich — e o pino de
 * `TZ=UTC` do `vitest.workspace.ts` a teria desligado em silêncio. O teste
 * `keeps the Z ...` abaixo é o que fecha isso em **qualquer** pino.
 */

/** Roda `fn` num fuso ESCOLHIDO, e devolve o ambiente como estava. */
function withTimeZone(zone: string, fn: () => void): void {
  const previous = process.env['TZ'];
  try {
    process.env['TZ'] = zone;
    // Precondição pinada (§7.2): se um dia a plataforma ignorar a atribuição,
    // este teste falha ALTO em vez de virar tautologia.
    expect(new Date('2026-10-05T00:00:00.000Z').getTimezoneOffset()).not.toBe(
      0,
    );
    fn();
  } finally {
    if (previous === undefined) delete process.env['TZ'];
    else process.env['TZ'] = previous;
  }
}
describe('calendarDayToDate', () => {
  it('maps a calendar day to midnight UTC, never local midnight', () => {
    const date = calendarDayToDate('2026-10-05');

    // 03:00Z seria meia-noite LOCAL em UTC−3 — o erro que se quer barrar.
    expect(date.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(date.getTime()).toBe(Date.UTC(2026, 9, 5, 0, 0, 0, 0));
  });

  it.each([
    ['the first day of the year', '2026-01-01', '2026-01-01T00:00:00.000Z'],
    ['the last day of the year', '2026-12-31', '2026-12-31T00:00:00.000Z'],
    ['a leap day', '2028-02-29', '2028-02-29T00:00:00.000Z'],
    // Domingo da virada do horário de verão brasileiro de 2018 (o último):
    // é o dia em que a meia-noite local NÃO existe, e o `new Date('...T00:00:00')`
    // sem `Z` desliza para 01:00 local.
    ['a DST start day', '2018-11-04', '2018-11-04T00:00:00.000Z'],
    // E a volta do horário de verão, quando a hora local se repete.
    ['a DST end day', '2018-02-18', '2018-02-18T00:00:00.000Z'],
  ])('maps %s (%s) to %s', (_label, day, expected) => {
    expect(calendarDayToDate(day).toISOString()).toBe(expected);
  });

  /**
   * ⚠️ **O ÚNICO TESTE DESTE ARQUIVO QUE ACUSA O `Z` AUSENTE EM QUALQUER
   * PINO** — e a razão está no cabeçalho: em offset zero o `Z` não muda valor
   * nenhum, então todo teste acima fica verde sem ele.
   *
   * O fuso é ESCOLHIDO aqui dentro, não herdado: é o que separa "a suíte roda
   * numa máquina a oeste de Greenwich" (sorte) de "a função é em UTC"
   * (propriedade). Dois fusos, dos dois lados do meridiano, para o teste não
   * provar só o sinal de um deles.
   */
  it.each([
    ['west of Greenwich', 'America/Sao_Paulo'],
    ['east of Greenwich', 'Asia/Tokyo'],
  ])('keeps the Z: midnight UTC even %s (%s)', (_label, zone) => {
    withTimeZone(zone, () => {
      expect(calendarDayToDate('2026-10-05').toISOString()).toBe(
        '2026-10-05T00:00:00.000Z',
      );
      expect(calendarDayToDate('2026-10-05').getTime()).toBe(
        Date.UTC(2026, 9, 5, 0, 0, 0, 0),
      );
    });
  });
});

describe('dateToCalendarDay', () => {
  it('reads midnight UTC back as the same calendar day', () => {
    const day = dateToCalendarDay(new Date('2026-10-05T00:00:00.000Z'));

    expect(day).toBe('2026-10-05');
  });

  /**
   * Documenta POR QUE o UTC é obrigatório: a oeste de Greenwich os getters
   * locais leem a meia-noite UTC do dia 5 como o dia **4**.
   *
   * ⚠️ **O FUSO É ESCOLHIDO, E ISSO É UMA CORREÇÃO DA TAREFA 37.** A versão
   * anterior era condicional ao fuso da máquina (`if (offset > 0) … else …`),
   * com um comentário dizendo que assim ela "continua honesto onde a
   * divergência não existe". O galho `else` asserta `local === utc`, que é
   * verdade **por construção** quando o offset é zero — ou seja, sob o pino
   * `TZ=UTC` do `vitest.workspace.ts` este teste virava **tautologia**: o §7.8
   * escrito com um `if`. Um teste que muda de assunto conforme o ambiente não
   * prova a regra, prova o ambiente.
   */
  it('diverges from the local getters west of Greenwich', () => {
    withTimeZone('America/Sao_Paulo', () => {
      const stored = new Date('2026-10-05T00:00:00.000Z');

      const utc = dateToCalendarDay(stored);
      const local = [
        String(stored.getFullYear()).padStart(4, '0'),
        String(stored.getMonth() + 1).padStart(2, '0'),
        String(stored.getDate()).padStart(2, '0'),
      ].join('-');

      expect(utc).toBe('2026-10-05');
      expect(local).toBe('2026-10-04');
      expect(local).not.toBe(utc);
    });
  });
});

describe('round trip', () => {
  it.each([
    '2026-01-01',
    '2026-10-05',
    '2026-12-31',
    '2028-02-29',
    '2018-11-04',
    '2018-02-18',
    '1583-01-01',
    '9999-12-31',
  ])('gives back exactly %s', (day) => {
    expect(dateToCalendarDay(calendarDayToDate(day))).toBe(day);
  });
});
