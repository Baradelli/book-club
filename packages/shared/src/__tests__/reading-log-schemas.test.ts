import { describe, expect, it } from 'vitest';

import {
  planItemReadersResponseSchema,
  planItemWritersResponseSchema,
  readingLogResponseSchema,
} from '../index';

describe('readingLogResponseSchema', () => {
  function aReadingLogResponse(): Record<string, unknown> {
    return {
      id: 'log-1',
      clubId: 'club-1',
      bookId: 'book-1',
      userId: 'user-1',
      planItemId: 'plan-1',
      readAt: '2026-10-01T18:30:45.123Z',
    };
  }

  it('carries the six fields of the entity', () => {
    const parsed = readingLogResponseSchema.parse(aReadingLogResponse());

    expect(parsed).toEqual(aReadingLogResponse());
  });

  /**
   * O AUTOR sai na resposta: dentro do clube não há conteúdo privado, e a
   * sobreposição mostra quem leu. → ADR 0002.
   */
  it('carries the reader out', () => {
    expect(readingLogResponseSchema.parse(aReadingLogResponse()).userId).toBe(
      'user-1',
    );
  });

  /**
   * ⚠️ A fronteira de segurança do §6.1: campo não declarado **NÃO sai**. É o
   * que impede um `toReadingLogResponse` errado de vazar coluna nova — e é o
   * que faz a ausência de contador ser CONTRATO e não estilo: um `readDays`
   * que alguém pusesse no handler seria apagado aqui, em silêncio, e a tela
   * nunca teria como desenhar o placar que o dono recusou.
   */
  it('drops a field the schema does not declare, a progress count included', () => {
    const parsed = readingLogResponseSchema.parse({
      ...aReadingLogResponse(),
      readDays: 7,
      totalDays: 30,
      passwordHash: 'nunca',
    });

    expect(parsed).toEqual(aReadingLogResponse());
  });

  // `planItemId` NUNCA é nulo, ao contrário do da nota: não existe leitura
  // avulsa. É a diferença que salta aos olhos entre os dois schemas.
  it('refuses a null planItemId', () => {
    expect(
      readingLogResponseSchema.safeParse({
        ...aReadingLogResponse(),
        planItemId: null,
      }).success,
    ).toBe(false);
  });
});

describe('planItemReadersResponseSchema', () => {
  it('carries the overlay of who read each day', () => {
    const parsed = planItemReadersResponseSchema.parse([
      { planItemId: 'plan-1', userIds: ['user-a', 'user-z'] },
    ]);

    expect(parsed).toEqual([
      { planItemId: 'plan-1', userIds: ['user-a', 'user-z'] },
    ]);
  });

  // Só os dias que têm leitura. Lista vazia é resposta legítima: ninguém leu.
  it('accepts an empty overlay', () => {
    expect(planItemReadersResponseSchema.parse([])).toEqual([]);
  });

  /**
   * ⚠️ **A DECISÃO D DA TAREFA 31, na borda: mesmo FORMATO, schema PRÓPRIO.**
   *
   * Os dois schemas aceitam o mesmo objeto — a tipagem do Zod é estrutural,
   * então trocar um pelo outro compilaria hoje sem uma linha de mudança. É
   * exatamente por isso que o teste existe: ele registra que a igualdade é de
   * forma e **não** autoriza o reuso. Um `writers` devolvendo leitores é a
   * prosa-que-mente que a Tarefa 29a pagou duas vezes, e no OpenAPI e no tipo
   * que a tela importa a mentira fica pública.
   *
   * O que se reusa é a CONTA (`groupUsersByPlanItem`, no domínio do backend),
   * que tem um dono só.
   */
  it('has the same shape as the writers overlay, and is a different schema', () => {
    const overlay = [{ planItemId: 'plan-1', userIds: ['user-a'] }];

    expect(planItemReadersResponseSchema.parse(overlay)).toEqual(
      planItemWritersResponseSchema.parse(overlay),
    );
    expect(planItemReadersResponseSchema).not.toBe(
      planItemWritersResponseSchema,
    );
  });

  // Nenhum contador na sobreposição: progresso é presença. Um `count` que
  // alguém acrescentasse ao handler é apagado aqui.
  it('drops a count somebody adds to an entry', () => {
    const parsed = planItemReadersResponseSchema.parse([
      { planItemId: 'plan-1', userIds: ['user-a'], count: 1 },
    ]);

    expect(parsed).toEqual([{ planItemId: 'plan-1', userIds: ['user-a'] }]);
  });
});
