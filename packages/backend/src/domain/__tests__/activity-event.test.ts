import { ACTIVITY_TYPES } from '@clube/shared';
import { describe, expect, it } from 'vitest';

import type { ActivityEvent } from '../activity-event';
import { assertActivityType } from '../activity-event';

/**
 * Regras 3, 4 e 7 da Tarefa 33 — a entidade do `ActivityEvent` e o portão do
 * tipo.
 *
 * A entidade é um `interface` puro: quem prova que a LINHA GRAVADA tem
 * exatamente os oito campos é o `record-activity.test.ts`, por `Object.keys`,
 * porque é lá que o objeto nasce (§7.1.1: a checagem de propriedade em excesso
 * do TypeScript só vale para literal fresco, e o `typecheck` verde não acusa um
 * campo opcional — medido na Tarefa 30). Aqui ficam as duas metades que são do
 * domínio: o que o COMPILADOR recusa, e o portão do tipo.
 */
describe('ActivityEvent', () => {
  /**
   * ⚠️ Regra 3 — **sem `status`, sem `archivedAt`, sem `updatedAt`** (decisão
   * H): o `ActivityEvent` é log imutável, como o `ReadingLog`. Um instante só,
   * `createdAt`.
   *
   * Um objeto POR campo, e não os três num só: o TypeScript para de reportar
   * propriedade em excesso assim que o literal já tem um erro de atribuição, e
   * os `@ts-expect-error` seguintes sairiam como "unused directive" — medido na
   * Tarefa 30.
   */
  it('refuses at compile time a status, an archivedAt and a second instant', () => {
    const withStatus: Partial<ActivityEvent> = {
      // @ts-expect-error log imutável não se arquiva: não há `status`
      status: 'ACTIVE',
    };
    const withArchivedAt: Partial<ActivityEvent> = {
      // @ts-expect-error nada arquiva um evento
      archivedAt: null,
    };
    const withUpdatedAt: Partial<ActivityEvent> = {
      // @ts-expect-error nada reescreve a linha: instante sem dono mente (ADR 0008)
      updatedAt: new Date(),
    };

    // Nada filtra campo em runtime — a asserção honesta do §7.1.1 é que as
    // chaves CONTINUAM lá; quem recusa é o compilador, e a prova é o
    // `pnpm -r typecheck`.
    expect(Object.keys(withStatus)).toEqual(['status']);
    expect(Object.keys(withArchivedAt)).toEqual(['archivedAt']);
    expect(Object.keys(withUpdatedAt)).toEqual(['updatedAt']);
  });

  /**
   * ⚠️ Regra 4 — `planItemId` é **anulável**, e o motivo é o produto: a
   * anotação avulsa e o grifo **não têm dia de leitura**. É a diferença que
   * salta aos olhos em relação ao `ReadingLog`, onde ele é obrigatório porque
   * não existe leitura avulsa.
   */
  it('lets planItemId be null, because the free note and the highlight have no day', () => {
    const withoutDay: Pick<ActivityEvent, 'type' | 'planItemId'> = {
      type: 'FREE_NOTE',
      planItemId: null,
    };

    expect(withoutDay.planItemId).toBeNull();
  });
});

describe('assertActivityType', () => {
  /**
   * Regra 7 — o portão do tipo, e ele é do DOMÍNIO. A borda da Tarefa 34 (o
   * `z.enum` construído a partir do `ACTIVITY_TYPES`) é a primeira barreira,
   * não a única: é o mesmo argumento do `assertHighlightColor`.
   */
  it.each(ACTIVITY_TYPES)('accepts %s and returns it', (type) => {
    expect(assertActivityType(type)).toBe(type);
  });

  it.each([
    ['a type that the decision B left out', 'NOTE_EDITED'],
    ['the non-event of unmarking', 'UNREAD'],
    ['the same type in lowercase', 'plan_note'],
    ['an empty string', ''],
  ])('refuses %s (%s)', (_label, value) => {
    expect(() => assertActivityType(value)).toThrow(/activity type/i);
  });

  /**
   * A mensagem lista os tipos aceitos e **não** ecoa o valor recusado — o
   * mesmo desenho do `assertHighlightColor`: `value` é `unknown` aqui, e ecoar
   * o que chegou é como um payload inteiro volta numa mensagem.
   */
  it('names the accepted types and never echoes the refused value', () => {
    let message = '';
    try {
      assertActivityType('SEGREDO_DO_CLIENTE');
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    for (const type of ACTIVITY_TYPES) expect(message).toContain(type);
    expect(message).not.toContain('SEGREDO_DO_CLIENTE');
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an object', { type: 'READ' }],
  ])('refuses %s (%s) without leaking anything else', (_label, value) => {
    expect(() => assertActivityType(value)).toThrow(/activity type/i);
  });
});
