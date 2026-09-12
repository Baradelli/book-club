import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WINDOW_MINUTES,
  isInsideWindow,
  minutesOfDay,
} from '../reminder-window';

/**
 * ⚠️ **REGRAS 1 e 6 DA TAREFA 37 — a função pura, e os QUATRO limites da
 * janela.**
 *
 * A janela é `>= 0 && < windowMinutes` (decisão D), e "meia janela testada é
 * meia janela": os quatro limites são um minuto antes do horário (**fora**), o
 * minuto exato (**dentro**), o último minuto da janela (**dentro**) e o
 * primeiro minuto depois (**fora**).
 *
 * ⚠️ **NENHUM `Date` E NENHUM `DateTime` NA ASSINATURA** (regra 1, e é a
 * decisão A vista de perto): esta função não sabe que dia é, não sabe em que
 * fuso está e não faz aritmética de data. Ela recebe **minutos desde a
 * meia-noite local** — um inteiro — e o `"HH:mm"` que a pessoa escolheu. Quem
 * traduz "o instante `now`, no fuso dela" para esse inteiro é o
 * `local-clock.ts`, que é o único lugar do projeto onde Luxon encosta.
 */

/** Minutos desde a meia-noite, escrito do jeito que se lê no relógio. */
function at(hour: number, minute: number): number {
  return hour * 60 + minute;
}

describe('isInsideWindow', () => {
  /**
   * ⚠️ **OS QUATRO LIMITES (regra 6), num teste só e com os quatro nomeados.**
   *
   * Separá-los em quatro testes esconderia o que eles são: uma fronteira
   * fechada à esquerda e aberta à direita. Com os quatro juntos, apagar
   * qualquer um dos dois operadores (`>=` → `>`, `<` → `<=`) fica vermelho aqui
   * e a mensagem diz qual lado caiu.
   */
  it('is closed on the left and open on the right: the four limits of a 10-minute window', () => {
    const target = '21:00';

    // um minuto ANTES do horário — fora
    expect(isInsideWindow(at(20, 59), target, 10)).toBe(false);
    // o minuto EXATO — dentro (o `>= 0`)
    expect(isInsideWindow(at(21, 0), target, 10)).toBe(true);
    // o ÚLTIMO minuto da janela — dentro (o `< windowMinutes`)
    expect(isInsideWindow(at(21, 9), target, 10)).toBe(true);
    // o PRIMEIRO minuto depois — fora
    expect(isInsideWindow(at(21, 10), target, 10)).toBe(false);
  });

  /**
   * O interior da janela, para o teste acima não ser só sobre as pontas: se
   * alguém trocasse a conta por "só o minuto exato", os limites 0 e 9
   * continuariam certos e errados nos oito minutos do meio.
   */
  it('is true for every minute strictly inside the window', () => {
    const inside = Array.from({ length: 10 }, (_, offset) =>
      isInsideWindow(at(21, 0) + offset, '21:00', 10),
    );

    expect(inside).toEqual(Array.from({ length: 10 }, () => true));
  });

  /** A janela de UM minuto: só o minuto exato, e é o menor caso legítimo. */
  it('accepts only the exact minute when the window is one minute long', () => {
    expect(isInsideWindow(at(21, 0), '21:00', 1)).toBe(true);
    expect(isInsideWindow(at(21, 1), '21:00', 1)).toBe(false);
  });

  /**
   * ⚠️ **Janela ZERO (ou negativa) nunca é verdadeira — nem no minuto exato.**
   *
   * Cai do `minutesAfter < windowMinutes` sem um `if` especial, e é a resposta
   * certa: uma janela de tamanho zero é um intervalo vazio. O teste existe
   * porque o valor vem de `NOTIFICATION_WINDOW_MINUTES` do ambiente
   * (`NOTIFICACOES.md` §3), e um `NOTIFICATION_WINDOW_MINUTES=0` mal digitado
   * tem de **calar** o lembrete, nunca mandá-lo o dia inteiro.
   */
  it.each([0, -1, -10])('never fires with a window of %i minutes', (window) => {
    expect(isInsideWindow(at(21, 0), '21:00', window)).toBe(false);
    expect(isInsideWindow(at(21, 5), '21:00', window)).toBe(false);
  });

  /** A meia-noite é um horário como outro qualquer, e o zero não é ausência. */
  it('treats midnight as a target like any other', () => {
    expect(isInsideWindow(at(0, 0), '00:00', 10)).toBe(true);
    expect(isInsideWindow(at(0, 9), '00:00', 10)).toBe(true);
    expect(isInsideWindow(at(0, 10), '00:00', 10)).toBe(false);
  });

  /**
   * ⚠️ **A JANELA NÃO ATRAVESSA A MEIA-NOITE, e isso é o comportamento de
   * referência, não um esquecimento.**
   *
   * O `NOTIFICACOES.md` §6 calcula o alvo com `localNow.set({ hour, minute })`
   * — ou seja, o alvo é sempre **do mesmo dia local** que o "agora". Um alvo às
   * 23:55 com a passada do cron já em 00:02 dá `minutesAfter = -1433`, e o
   * lembrete daquele dia se perde.
   *
   * Está testado em vez de consertado porque a conta nova teria de decidir
   * **de qual dia** é o lembrete perdido — e o `localDate` do claim é a chave
   * de idempotência: um lembrete de ontem entregue hoje gravaria o claim de
   * **hoje** e calaria o lembrete de hoje. O erro caro deste app é repetir e
   * cobrar (§1 do plano), não perder um lembrete quando o cron atrasa cinco
   * minutos na virada do dia.
   */
  it('never wraps around midnight: a 23:55 reminder is lost if the cron only wakes up after 00:00', () => {
    expect(isInsideWindow(at(23, 55), '23:55', 10)).toBe(true);
    expect(isInsideWindow(at(23, 59), '23:55', 10)).toBe(true);
    // 00:02 do dia seguinte, que é o minuto 2 — e não o 1442.
    expect(isInsideWindow(at(0, 2), '23:55', 10)).toBe(false);
  });

  /**
   * ⚠️ **HORÁRIO TORTO NA COLUNA É `false`, NUNCA `NaN`** — e o preço de errar
   * tem nome, escrito no `assertReminderTime`: *"um valor torto ali é `NaN` na
   * janela"*. `NaN >= 0` é `false` e `NaN < 10` também é `false`, então a conta
   * ingênua até calaria o lembrete por acidente — mas por acidente, e a
   * primeira refatoração que trocasse a ordem dos operadores mandaria push a
   * toda hora do dia.
   *
   * ⚠️ **Aqui a recusa é EXPLÍCITA, e ela não lança.** Lançar mataria a passada
   * inteira do cron por causa de UMA linha corrompida — todo mundo do clube
   * ficaria sem lembrete porque uma pessoa tem `"9h"` gravado. O
   * `assertReminderTime` é quem grita, na borda e na leitura do `getSettings`;
   * aqui a resposta é "esta pessoa não tem horário válido, então não é agora".
   */
  it.each([
    ['9:00', 'sem o zero à esquerda'],
    ['25:00', 'hora que não existe'],
    ['21:5', 'minuto de um dígito'],
    ['21:60', 'minuto que não existe'],
    ['', 'vazio'],
    ['abc', 'texto'],
    ['21h00', 'outro separador'],
    [' 21:00', 'com espaço na frente'],
  ])(
    'refuses the malformed target %p (%s) instead of producing NaN',
    (target) => {
      expect(isInsideWindow(at(21, 0), target, 10)).toBe(false);
      expect(isInsideWindow(at(9, 0), target, 10)).toBe(false);
      expect(minutesOfDay(target)).toBeNull();
    },
  );

  /**
   * ⚠️ **O ANTÍDOTO do bloco acima** (§7.4): uma implementação que devolvesse
   * `false` para TODO horário passaria nos oito casos de cima. Este par mostra
   * que o horário BEM formado mais próximo de cada um deles é aceito — ou seja,
   * o que recusa é a forma, não a função.
   */
  it.each([
    ['09:00', at(9, 0)],
    ['21:00', at(21, 0)],
    ['21:05', at(21, 5)],
  ])('accepts the well-formed %p at its own minute', (target, minutes) => {
    expect(isInsideWindow(minutes, target, 10)).toBe(true);
  });
});

describe('minutesOfDay', () => {
  it.each([
    ['00:00', 0],
    ['00:01', 1],
    ['09:30', 570],
    ['21:00', 1260],
    ['23:59', 1439],
  ])('turns %p into %i minutes since local midnight', (target, expected) => {
    expect(minutesOfDay(target)).toBe(expected);
  });
});

describe('DEFAULT_WINDOW_MINUTES', () => {
  /**
   * ⚠️ **10, e o número é a decisão D**: a janela tem de ser MAIOR que o
   * intervalo do cron (5 min) para absorver um atraso, e é o claim — não a
   * janela — que impede duas passadas seguidas de mandarem dois lembretes.
   *
   * O teste pina o número porque ele é contrato com o `SETUP.md` (o cron de 5
   * minutos) e com o `NOTIFICATION_WINDOW_MINUTES` do `NOTIFICACOES.md` §3.
   */
  it('is 10 minutes, strictly bigger than the 5-minute cron interval', () => {
    expect(DEFAULT_WINDOW_MINUTES).toBe(10);
    expect(DEFAULT_WINDOW_MINUTES).toBeGreaterThan(5);
  });
});
