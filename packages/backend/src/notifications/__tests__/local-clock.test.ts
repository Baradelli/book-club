import { localDay } from '@clube/shared';
import { describe, expect, it } from 'vitest';

import { localMinutesOfDay } from '../local-clock';
import { isInsideWindow } from '../reminder-window';

/**
 * ⚠️ **REGRA 7 DA TAREFA 37 — HORÁRIO DE VERÃO, E ELE NÃO É HIPÓTESE.**
 *
 * `America/Sao_Paulo` já teve DST e pode ter de novo, e o projeto tem usuário
 * em um fuso só **hoje**. `America/New_York` ainda tem, e é nele que os dois
 * casos que quebram a conta ingênua são observáveis **em 2026**:
 *
 * ```
 * 2026-03-08  02:00 EST → 03:00 EDT   a hora que NÃO EXISTE      (salto à frente)
 * 2026-11-01  02:00 EDT → 01:00 EST   a hora que acontece DUAS VEZES (salto atrás)
 * ```
 *
 * ⚠️ **Este arquivo é o ÚNICO do projeto que importa Luxon**, e é a razão de o
 * `local-clock.ts` existir separado do `reminder-window.ts`: a janela é
 * aritmética de inteiros e não precisa saber o que é um fuso; saber que horas
 * são em Nova York é um problema de biblioteca de calendário. ADR 0006 mantém
 * Luxon **só no backend** — o front usa `Intl` (`shared/src/local-day.ts`) para
 * o PWA não empacotá-lo, e há uma varredura provando isso
 * (`packages/shared/src/__tests__/no-luxon-in-shared.test.ts`).
 *
 * ⚠️ **A hora repetida NÃO é resolvida aqui, e é de propósito** (regra 7): ela
 * faz a janela casar **duas vezes** no mesmo dia local, e quem impede o
 * lembrete dobrado é o **claim** — que é o que o teste do `scheduler` mostra.
 * Consertar aqui seria pôr a idempotência em dois lugares, e o segundo é o que
 * fica para trás.
 */

/** Minutos desde a meia-noite, escrito do jeito que se lê no relógio. */
function at(hour: number, minute: number): number {
  return hour * 60 + minute;
}

describe('localMinutesOfDay', () => {
  /**
   * A precondição de tudo o que vem abaixo: num fuso sem DST a conta é a
   * subtração simples do deslocamento, e o `instant` é UTC.
   */
  it('reads the wall clock of a fixed-offset zone', () => {
    const instant = new Date('2026-04-01T12:00:00.000Z');

    // São Paulo é UTC−3 o ano inteiro desde 2019.
    expect(localMinutesOfDay(instant, 'America/Sao_Paulo')).toBe(at(9, 0));
    // ...e o MESMO instante é outra hora em outro fuso — o par que mostra que
    // a função olha o fuso pedido, e não o do processo.
    expect(localMinutesOfDay(instant, 'UTC')).toBe(at(12, 0));
    expect(localMinutesOfDay(instant, 'Asia/Tokyo')).toBe(at(21, 0));
  });

  /**
   * ⚠️ **O SALTO PARA A FRENTE — a hora que NÃO EXISTE.**
   *
   * Em 2026-03-08, Nova York pula das 01:59:59 EST direto para as 03:00:00 EDT.
   * Nenhum instante do universo tem 02:30 como hora local ali.
   *
   * A consequência, e ela é a que o produto tem de conhecer: **quem marcou o
   * lembrete para 02:15 não é lembrado naquele dia**. Não é erro, não é log de
   * erro, e não há conserto honesto — a hora escolhida não aconteceu. O que
   * NÃO pode acontecer é o oposto: a função inventar um 02:xx e o lembrete sair
   * na hora errada.
   */
  it('never reports a wall-clock hour that the spring-forward skipped', () => {
    const beforeTheJump = new Date('2026-03-08T06:59:00.000Z');
    const afterTheJump = new Date('2026-03-08T07:00:00.000Z');

    expect(localMinutesOfDay(beforeTheJump, 'America/New_York')).toBe(
      at(1, 59),
    );
    expect(localMinutesOfDay(afterTheJump, 'America/New_York')).toBe(at(3, 0));

    // E a varredura do dia inteiro, minuto a minuto de UTC: NENHUM instante cai
    // na hora das 2. É o antídoto do teste acima — dois pontos escolhidos a dedo
    // não provam que o buraco é um buraco.
    const everyMinuteOfTheDay = Array.from({ length: 24 * 60 }, (_, index) =>
      localMinutesOfDay(
        new Date(Date.UTC(2026, 2, 8, 0, index)),
        'America/New_York',
      ),
    );

    expect(
      everyMinuteOfTheDay.filter(
        (minutes) =>
          minutes !== null && minutes >= at(2, 0) && minutes < at(3, 0),
      ),
    ).toEqual([]);
    // ...e a precondição: a varredura ACHOU as outras horas (§7.4).
    expect(everyMinuteOfTheDay.filter((m) => m === at(1, 59))).toHaveLength(1);
    expect(everyMinuteOfTheDay.filter((m) => m === at(3, 0))).toHaveLength(1);
  });

  /**
   * ⚠️ **O SALTO PARA TRÁS — a hora que acontece DUAS VEZES, e é o caso que faz
   * a janela casar duas vezes no mesmo dia local.**
   *
   * Em 2026-11-01, Nova York volta das 02:00 EDT para as 01:00 EST: a hora da
   * 01 acontece inteira, duas vezes, com uma hora de mundo entre as duas.
   *
   * ⚠️ **A função NÃO desambigua, e é deliberado**: as duas leituras devolvem o
   * mesmo inteiro porque as duas **são** 01:00 no relógio da parede — que é
   * exatamente o que o lembrete promete ("às 01:00 no seu fuso"). Quem impede o
   * lembrete dobrado é o claim, e o teste que mostra isso está no `scheduler`
   * (`sends ONE reminder on the day the clock falls back and the window matches
   * twice`).
   */
  it('reports the SAME wall-clock minute twice on the fall-back day', () => {
    const firstOneOClock = new Date('2026-11-01T05:00:00.000Z'); // 01:00 EDT
    const secondOneOClock = new Date('2026-11-01T06:00:00.000Z'); // 01:00 EST

    expect(localMinutesOfDay(firstOneOClock, 'America/New_York')).toBe(
      at(1, 0),
    );
    expect(localMinutesOfDay(secondOneOClock, 'America/New_York')).toBe(
      at(1, 0),
    );
    // A precondição do par: os dois instantes são MESMO diferentes — uma hora
    // inteira de mundo entre eles. Sem ela, "as duas leituras são iguais"
    // poderia estar comparando o mesmo instante consigo mesmo.
    expect(secondOneOClock.getTime() - firstOneOClock.getTime()).toBe(
      60 * 60 * 1000,
    );

    // E é isto que a janela vê: DUAS passadas do cron, uma hora apart, as duas
    // dentro da janela de um lembrete marcado para 01:00.
    expect(isInsideWindow(at(1, 0), '01:00', 10)).toBe(true);
  });

  /**
   * ⚠️ **Fuso inválido devolve `null`, e a pessoa fica SEM lembrete** — não com
   * um lembrete na hora do servidor.
   *
   * É a divergência deliberada com o `localDay` de `packages/shared`, que cai
   * no fuso do AMBIENTE quando o nome não é IANA: lá o pior caso é a tela
   * mostrar o dia errado para quem está olhando e pode corrigir; aqui o pior
   * caso é **acordar a pessoa de madrugada**. Um lembrete na hora errada é o
   * oposto do §1 do plano, e é por isso que o silêncio é a resposta certa.
   *
   * ⚠️ E o que o Luxon aceita **não é "só nome IANA"**, nem é o mesmo conjunto
   * que o `Intl` aceita — MEDIDO nesta fatia, e a divergência tem teste próprio
   * logo abaixo. A única checagem fiel é tentar.
   */
  it.each([
    ['America/Sao Paulo', 'o erro de digitação clássico, com espaço'],
    ['', 'vazio'],
    ['Mars/Olympus_Mons', 'nome inventado'],
  ])('answers null for the invalid zone %p (%s)', (zone) => {
    expect(localMinutesOfDay(new Date('2026-04-01T12:00:00.000Z'), zone)).toBe(
      null,
    );
  });

  /**
   * O ANTÍDOTO do bloco acima (§7.4): uma implementação que devolvesse `null`
   * para tudo passaria nos quatro. Estes são fusos estranhos e **válidos** —
   * inclusive o deslocamento com sinal, que é o que a suposição "tem sinal ⇒
   * inválido" recusaria.
   */
  it.each([
    ['+03:00', at(15, 0)],
    ['UTC', at(12, 0)],
    ['Pacific/Kiritimati', at(2, 0)],
    ['Asia/Kathmandu', at(17, 45)],
  ])('accepts the unusual but valid zone %p', (zone, expected) => {
    expect(localMinutesOfDay(new Date('2026-04-01T12:00:00.000Z'), zone)).toBe(
      expected,
    );
  });

  /**
   * ⚠️ **MEDIDO NESTA FATIA, e é uma divergência REAL entre os dois relógios do
   * projeto: `'UTC+3'` é fuso para o Luxon e NÃO é para o `Intl`.**
   *
   * O docblock de `packages/shared/src/local-day.ts` registra a medição do lado
   * dele — *"`'UTC+3'` → `RangeError` (cai no fallback)"* —, e este teste mede o
   * outro lado: o Luxon aceita e desloca de verdade.
   *
   * A consequência para o dispatcher, e é por isso que ela está pinada em teste
   * em vez de escrita em prosa: uma pessoa com `Settings.timezone = 'UTC+3'`
   * teria **a hora** calculada em UTC+3 (por aqui) e **o dia** calculado no fuso
   * do PROCESSO (pelo fallback do `localDay`) — dois relógios discordando sobre
   * a mesma pessoa, e ninguém avisado.
   *
   * Não é alcançável hoje: o `updateSettingsSchema` aceita qualquer string não
   * vazia como `timezone`, mas a tela da 36b oferece o que o navegador informa,
   * que é sempre nome IANA. Fica **registrado e travado** — no dia em que
   * alguém validar o `timezone` de verdade (a dívida que o `local-day.ts` já
   * nomeia), este teste diz qual dos dois conjuntos é o certo a escolher.
   */
  it('states the divergence: Luxon accepts UTC+3 and Intl does not', () => {
    const instant = new Date('2026-04-01T23:00:00.000Z');

    // O relógio do BACKEND (Luxon) aceita e desloca: 23:00Z + 3h = 02:00.
    expect(localMinutesOfDay(instant, 'UTC+3')).toBe(at(2, 0));
    // O relógio do FRONT (Intl) não: o `localDay` cai no fuso de fallback, e a
    // prova é que ele devolve o dia do FALLBACK PEDIDO, não o de UTC+3 (onde já
    // seria dia 2).
    expect(localDay(instant, 'UTC+3', 'UTC')).toBe('2026-04-01');
    // ...e o par que impede isto de ser uma identidade: com um fuso que o
    // `Intl` ACEITA, o `localDay` honra o fuso e devolve o dia seguinte.
    expect(localDay(instant, '+03:00', 'UTC')).toBe('2026-04-02');
  });

  /** Meia-noite local é `0`, e zero não é ausência: o `null` é outro valor. */
  it('answers 0 at local midnight, and 0 is not null', () => {
    const midnightInSaoPaulo = new Date('2026-04-01T03:00:00.000Z');

    expect(localMinutesOfDay(midnightInSaoPaulo, 'America/Sao_Paulo')).toBe(0);
    expect(localMinutesOfDay(midnightInSaoPaulo, 'America/Sao_Paulo')).not.toBe(
      null,
    );
  });
});
