import type { ActivityEventResponse, ActivityType } from '@clube/shared';
import { ACTIVITY_TYPES } from '@clube/shared';
import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_TIME_FLOOR,
  ACTIVITY_TIME_LADDER,
  activityMoment,
  activityTarget,
  formatActivityMoment,
} from '../activity-feed';
import {
  COUNTER_SHAPE,
  GUILT_TERMS,
  withoutDiacritics,
} from './anti-guilt-dom';

/**
 * O FEED DA HOME, nas duas propriedades que **não** precisam de tela — e é por
 * isso que elas moram aqui e não no `home.test.tsx` (§7.9: a guarda mora onde a
 * propriedade é decidível).
 *
 * 1. **O tempo relativo não vira cobrança, em NENHUM idioma** (regra 13). Esta
 *    é a única superfície de texto do app que **não vem do catálogo**: o
 *    `Intl.RelativeTimeFormat` escreve a frase, e a guarda de catálogo
 *    (`shared/src/locales/__tests__/anti-guilt.test.ts`) não a vê. A varredura
 *    de DOM também não bastaria: todo teste de tela pina `pt`, e `en` é metade
 *    dos idiomas que o app declara suportar — é exatamente a assimetria que a
 *    Tarefa 27 pagou caro para fechar no ADR 0002.
 * 2. **Cada tipo abre o alvo dele** (regra 4). É uma função de um evento para um
 *    endereço; provar isso clicando em quatro linhas seria testar o
 *    `react-router` de novo.
 */

/**
 * ⚠️ **AS FAIXAS VÊM DA ESCADA, NÃO DE UMA LISTA ESCRITA À MÃO.**
 *
 * Se o teste enumerasse `['minute', 'hour', 'day']` e alguém acrescentasse
 * `month` ao produto, a varredura ficaria verde sobre a faixa nova — a forma de
 * "guarda no lugar errado" do §7.9 nascendo de uma lista que envelhece. Aqui o
 * teste percorre a MESMA constante que a tela percorre.
 *
 * O teto de cada degrau é derivado do degrau de cima: um `day` nunca passa de 6
 * (aos 7 vira `week`), uma `hour` nunca passa de 23, um `minute` nunca passa de
 * 59. O topo da escada não tem teto — 520 semanas são dez anos, muito além de
 * qualquer evento que um clube vá ter.
 */
const TOP_OF_LADDER_STEPS = 520;

function stepsOf(index: number): number {
  const rung = ACTIVITY_TIME_LADDER[index];
  const above = ACTIVITY_TIME_LADDER[index - 1];
  if (rung === undefined) throw new Error(`degrau inexistente: ${index}`);
  if (above === undefined) return TOP_OF_LADDER_STEPS;
  return Math.floor(above.ms / rung.ms) - 1;
}

/** Todo instante que a tela consegue formatar, degrau por degrau. */
function everyElapsedMs(): number[] {
  const elapsed: number[] = [0, 1, 59_999];

  for (const [index, rung] of ACTIVITY_TIME_LADDER.entries()) {
    for (let step = 1; step <= stepsOf(index); step += 1) {
      elapsed.push(step * rung.ms);
      // E o meio do degrau, onde o `floor` arredonda para baixo.
      elapsed.push(step * rung.ms + Math.floor(rung.ms / 2));
    }
  }

  return elapsed;
}

const NOW = new Date('2026-09-11T12:00:00.000Z');

function at(elapsedMs: number): string {
  return new Date(NOW.getTime() - elapsedMs).toISOString();
}

describe('⚠️ the relative time of the feed never speaks the vocabulary of debt (rule 13)', () => {
  it('sweeps every rung of the ladder, and the sweep is not empty', () => {
    /*
      A guarda contra a varredura vazia (§7.4): sem esta linha, um
      `ACTIVITY_TIME_LADDER` vazio — ou um `stepsOf` quebrado devolvendo 0 —
      deixaria os dois testes abaixo verdes provando nada.
    */
    expect(ACTIVITY_TIME_LADDER.length).toBeGreaterThanOrEqual(4);
    expect(everyElapsedMs().length).toBeGreaterThan(1000);
    // E a escada desce: cada degrau é menor que o de cima. Uma escada fora de
    // ordem daria "há 90 minutos" no lugar de "há 1 hora".
    for (const [index, rung] of ACTIVITY_TIME_LADDER.entries()) {
      const above = ACTIVITY_TIME_LADDER[index - 1];
      if (above !== undefined) expect(rung.ms).toBeLessThan(above.ms);
    }
  });

  it.each(['pt', 'en'])(
    'emits no guilt term and no counter shape in %s',
    (locale) => {
      const offenders = everyElapsedMs().flatMap((elapsed) => {
        const text = formatActivityMoment(at(elapsed), NOW, locale);
        const normalized = withoutDiacritics(text);
        const guilt = GUILT_TERMS.filter((term) => normalized.includes(term));
        const counter = COUNTER_SHAPE.test(text) ? ['(placar)'] : [];
        return [...guilt, ...counter].map(
          (reason) => `${String(elapsed)}ms → "${text}" (${reason})`,
        );
      });

      expect(offenders).toEqual([]);
    },
  );

  it('would catch a phrase of debt dressed as a timestamp', () => {
    /*
      ⚠️ O LADO POSITIVO DO PAR. Sem ele, um `GUILT_TERMS` esvaziado — ou um
      `formatActivityMoment` que devolvesse string vazia — deixaria o teste
      acima verde para sempre. Estas são as frases que um "tempo relativo"
      poderia ter, e que a lista TEM de pegar.
    */
    for (const phrase of ['há 3 dias de atraso', '3 days behind', '12 de 30']) {
      const normalized = withoutDiacritics(phrase);
      const caught =
        GUILT_TERMS.some((term) => normalized.includes(term)) ||
        COUNTER_SHAPE.test(phrase);
      expect(caught).toBe(true);
    }

    // E a formatação de verdade produz TEXTO — a varredura acima está olhando
    // alguma coisa.
    expect(formatActivityMoment(at(2 * 60 * 60_000), NOW, 'pt')).toBe(
      'há 2 horas',
    );
    expect(formatActivityMoment(at(2 * 60 * 60_000), NOW, 'en')).toBe(
      '2 hours ago',
    );
  });

  it('⚠️ never looks into the FUTURE, however skewed the clock is', () => {
    /*
      O `createdAt` vem do servidor e o "agora" vem do celular: um relógio
      adiantado faria a tela dizer "em 2 minutos" sobre uma coisa que já
      aconteceu. O piso da escada é `agora`, e ele também é a resposta para um
      `createdAt` que não parseia — que é o que uma resposta fora do contrato
      traria.
    */
    for (const createdAt of [
      at(-60 * 60_000),
      at(-1),
      at(0),
      'nem data isto é',
    ]) {
      expect(activityMoment(createdAt, NOW)).toEqual({
        value: 0,
        unit: ACTIVITY_TIME_FLOOR,
      });
    }

    // E nenhum degrau da escada devolve valor positivo.
    for (const elapsed of everyElapsedMs()) {
      expect(activityMoment(at(elapsed), NOW).value).toBeLessThanOrEqual(0);
    }
  });

  it('climbs to the biggest unit that fits, and not to the one below it', () => {
    // O par que impede a escada de virar "sempre minutos": os dois lados da
    // fronteira de cada degrau.
    expect(activityMoment(at(59_999), NOW)).toEqual({
      value: 0,
      unit: 'second',
    });
    expect(activityMoment(at(60_000), NOW)).toEqual({
      value: -1,
      unit: 'minute',
    });
    expect(activityMoment(at(59 * 60_000), NOW)).toEqual({
      value: -59,
      unit: 'minute',
    });
    expect(activityMoment(at(60 * 60_000), NOW)).toEqual({
      value: -1,
      unit: 'hour',
    });
    expect(activityMoment(at(24 * 60 * 60_000), NOW)).toEqual({
      value: -1,
      unit: 'day',
    });
    expect(activityMoment(at(7 * 24 * 60 * 60_000), NOW)).toEqual({
      value: -1,
      unit: 'week',
    });
    // E o topo não estoura: dez anos continuam sendo semanas, nunca um
    // "NaN" nem um mês aproximado em 30 dias (que seria um número errado na
    // tela — `CLAUDE.md` mantém o Luxon no backend).
    expect(activityMoment(at(520 * 7 * 24 * 60 * 60_000), NOW)).toEqual({
      value: -520,
      unit: 'week',
    });
  });
});

function anEvent(
  overrides: Partial<ActivityEventResponse> = {},
): ActivityEventResponse {
  return {
    id: 'a-1',
    clubId: 'c-casal',
    userId: 'u-maria',
    type: 'PLAN_NOTE',
    bookId: 'b-hobbit',
    planItemId: 'p-hoje',
    subjectId: 's-1',
    createdAt: at(60 * 60_000),
    ...overrides,
  };
}

describe('each kind of activity opens ITS target (rule 4)', () => {
  it('takes the note of the day, the standalone note and the highlight to different screens', () => {
    expect(activityTarget(anEvent({ type: 'PLAN_NOTE' }))).toBe(
      '/books/b-hobbit/days/p-hoje',
    );
    // O `READ` leva ao DIA: é onde a pessoa lê o trecho e escreve sobre ele.
    expect(activityTarget(anEvent({ type: 'READ', subjectId: 'log-1' }))).toBe(
      '/books/b-hobbit/days/p-hoje',
    );
    // A avulsa e o grifo apontam para o SUJEITO, não para o dia — eles não
    // pertencem a um dia do plano (ADR 0004).
    expect(
      activityTarget(
        anEvent({ type: 'FREE_NOTE', planItemId: null, subjectId: 'n-7' }),
      ),
    ).toBe('/books/b-hobbit/notes/n-7');
    expect(
      activityTarget(
        anEvent({ type: 'HIGHLIGHT', planItemId: null, subjectId: 'h-9' }),
      ),
    ).toBe('/books/b-hobbit/highlights/h-9');
  });

  it('⚠️ falls back to the book when the day is missing, instead of building /days/null', () => {
    /*
      O `planItemId` é **anulável** no contrato (`activityEventResponseSchema`),
      e os dois tipos que levam ao dia o leem. Sem esta queda, um evento sem dia
      montaria `/books/b/days/undefined` — uma rota que casa, abre a tela do dia
      e pede uma anotação de um `planItemId` que não existe.
    */
    for (const type of ['PLAN_NOTE', 'READ'] as const) {
      expect(activityTarget(anEvent({ type, planItemId: null }))).toBe(
        '/books/b-hobbit',
      );
    }
  });

  it('gives every type of the contract an address, not just the four written above', () => {
    /*
      ⚠️ A precondição que impede esta suíte de envelhecer em silêncio: um quinto
      tipo em `ACTIVITY_TYPES` (a lista é `String` validado por `z.enum`
      justamente porque ainda evolui) tem de continuar abrindo alguma coisa.
      Sem isto, o `activityTarget` cairia no ramo do dia por acidente e ninguém
      saberia.
    */
    expect(ACTIVITY_TYPES.length).toBe(4);
    for (const type of ACTIVITY_TYPES satisfies readonly ActivityType[]) {
      expect(activityTarget(anEvent({ type }))).toMatch(/^\/books\/b-hobbit/u);
    }
  });
});
