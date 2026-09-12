import { NOTIFICATION_KINDS } from '@clube/shared';
import { describe, expect, it } from 'vitest';

import {
  assertNotificationKind,
  type NotificationDelivery,
} from '../notification-delivery';

/**
 * ⚠️ **O CLAIM É UMA LINHA DE QUATRO COLUNAS, E O `kind` É O ÚNICO CAMPO COM
 * PORTÃO** (Tarefa 37, decisão G).
 *
 * A coluna é `String` — o `CLAUDE.md` nomeia `NotificationDelivery.kind` entre
 * os quatro campos "validados por `z.enum`/regex (ainda evoluem)" —, e o portão
 * é o mesmo desenho do `assertActivityType`: **`Error` cru, não classe de
 * domínio**, porque o valor **nunca vem de corpo de request**. Não há rota que
 * receba `kind`: quem o escreve é o dispatcher, e quem o lê de volta é o
 * repositório. Um valor fora da lista aqui é erro de programação ou coluna
 * corrompida — 500 é o status certo, e classe de erro nova exigiria mapeamento
 * que ninguém usaria.
 */

/** Fixture de objeto é FACTORY, nunca `const` de `describe` (§7.7). */
function aDelivery(
  overrides: Partial<NotificationDelivery> = {},
): NotificationDelivery {
  return {
    id: 'delivery-1',
    userId: 'maria',
    kind: 'READING_REMINDER',
    // ⚠️ Notoriamente NÃO-HOJE (§7.8, corolário de fixture): uma data derivada
    // do relógio faria o teste mudar de assunto sozinho no dia seguinte.
    localDate: '2026-10-05',
    deliveredAt: new Date('2026-10-05T21:00:03.000Z'),
    ...overrides,
  };
}

describe('assertNotificationKind', () => {
  it.each(NOTIFICATION_KINDS)('accepts %s', (kind) => {
    expect(assertNotificationKind(kind)).toBe(kind);
  });

  /**
   * ⚠️ **A caixa e os espaços importam MAIS aqui do que em qualquer outro
   * portão do projeto**, e o motivo é a chave única `(userId, kind,
   * localDate)`: o `=` de texto do Postgres é byte-sensível, então um
   * `'reading_reminder'` aceito não seria um sinônimo — seria uma **segunda
   * reserva do mesmo dia**, ou seja, o lembrete dobrado que a fatia inteira
   * existe para impedir.
   */
  it.each([
    'reading_reminder',
    'READING_REMINDER ',
    ' READING_REMINDER',
    'TEST',
    '',
    null,
    undefined,
    42,
    {},
  ])('refuses %p', (value) => {
    expect(() => assertNotificationKind(value)).toThrow(/kind must be one of/);
  });

  /** A mensagem diz o que é aceito, e NÃO ecoa o valor recusado. */
  it('names the accepted kinds and never echoes what arrived', () => {
    expect(() => assertNotificationKind('segredo-do-usuario')).toThrow(
      'notification delivery kind must be one of READING_REMINDER, GROUP_ACTIVITY',
    );
    try {
      assertNotificationKind('segredo-do-usuario');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).not.toContain('segredo-do-usuario');
    }
  });
});

describe('the NotificationDelivery entity', () => {
  /**
   * ⚠️ **QUATRO COLUNAS MAIS O `id`, E NADA MAIS** — e cada ausência é decisão,
   * não esquecimento. O docblock da entidade é o dono de cada uma; este teste é
   * quem **cobra** que a lista não cresça sem alguém pensar.
   *
   * O que NÃO está aqui, e por quê, em uma linha cada:
   * - **`planItemId`** (decisão J): a tabela NÃO aponta para `ReadingPlanItem`.
   *   O claim é por **dia de calendário no fuso da pessoa** — um vínculo com o
   *   plano faria a chave mudar quando o admin editasse o plano, e o lembrete
   *   sairia duas vezes.
   * - **`clubId`**: push é da PESSOA (decisão F da Tarefa 36), como no
   *   `PushSubscription` e no `Settings`.
   * - **`status`/`archivedAt`/`updatedAt`**: é log imutável. Nada reescreve, e
   *   instante sem dono mente (ADR 0008).
   * - **`payload`/`title`**: o registro diz que saiu, não o que dizia. Guardar
   *   a frase seria guardar conteúdo num log de entrega.
   */
  it('has exactly the five fields of the claim', () => {
    expect(Object.keys(aDelivery()).sort()).toEqual([
      'deliveredAt',
      'id',
      'kind',
      'localDate',
      'userId',
    ]);
  });

  /**
   * ⚠️ **O `localDate` é `CalendarDay` — a string `"YYYY-MM-DD"` —, e é a
   * decisão F.**
   *
   * Se fosse `@db.Date` ou instante, duas pessoas em fusos diferentes no mesmo
   * instante teriam a MESMA chave (e uma delas ficaria sem lembrete), ou a
   * mesma pessoa teria DUAS (e receberia duas vezes). O `CalendarDay` já é a
   * forma canônica do projeto, e é **exatamente** o que o
   * `localDay(instant, timeZone)` devolve — é por isso que a comparação com o
   * `ReadingPlanItem.date` é igualdade de string, e não aritmética (decisão A).
   */
  it('keeps localDate as the calendar-day STRING, never a Date', () => {
    const delivery = aDelivery();

    expect(typeof delivery.localDate).toBe('string');
    expect(delivery.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // E o par que dá sentido ao de cima: o instante da entrega É um `Date`, e
    // são campos diferentes — o dia da chave e a hora do registro.
    expect(delivery.deliveredAt).toBeInstanceOf(Date);
  });
});
