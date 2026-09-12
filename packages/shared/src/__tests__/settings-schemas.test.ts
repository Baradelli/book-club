import { describe, expect, it } from 'vitest';

import {
  REMINDER_TIME_PATTERN,
  reminderTimeSchema,
  settingsResponseSchema,
  updateSettingsSchema,
} from '../settings';

/**
 * Regras 4 e 6 da Tarefa 36, do lado da BORDA.
 *
 * ⚠️ **A premissa da decisão D estava errada, e a medição está aqui.** A spec
 * diz que *"o regex `HH:mm` já existe no Zod da borda (Tarefa 03)"* — e o
 * comentário do `schema.prisma` diz o mesmo (`reminderTime String
 * @default("21:00") // HH:mm, validado por regex no Zod`). **Não existia:** o
 * `grep` por `reminderTime` em `packages/shared` voltava vazio, e não havia
 * schema nenhum de `Settings` na borda. Então esta fatia entrega as DUAS
 * barreiras que a regra 4 pede — esta, e o `assertReminderTime` do domínio —, e
 * o regex tem **um dono só**: a constante abaixo, importada pelo domínio.
 */

/** Os cinco recusados que a regra 4 nomeia, mais os que eles representam. */
const REFUSED = [
  '25:00', // hora fora da faixa
  '9:00', // sem o zero à esquerda
  '21:5', // minuto de um dígito
  '', // vazio
  'abc', // não é hora nenhuma
  '24:00', // 24 não existe no relógio de 24 horas
  '21:60', // minuto fora da faixa
  '21:00:00', // segundos não entram
  ' 21:00', // espaço na frente
  '21:00 ', // espaço atrás
  '2:00', // uma casa na hora
  '1:1',
] as const;

const ACCEPTED = ['00:00', '09:05', '21:00', '23:59', '12:34'] as const;

describe('reminderTime on the border', () => {
  /**
   * ⚠️ **O ANTÍDOTO do §7.4: a lista de recusados só vale se a de ACEITOS
   * passar.** Um regex que nunca casa recusaria os doze de cima e o teste
   * ficaria verde sem provar nada sobre o formato.
   */
  it.each(ACCEPTED)('accepts %s', (value) => {
    expect(reminderTimeSchema.safeParse(value).success).toBe(true);
    expect(REMINDER_TIME_PATTERN.test(value)).toBe(true);
  });

  it.each(REFUSED)('refuses %s', (value) => {
    expect(reminderTimeSchema.safeParse(value).success).toBe(false);
    expect(REMINDER_TIME_PATTERN.test(value)).toBe(false);
  });

  /**
   * O regex não tem a flag `g`, e isto é o pino disso: com `g`, o `lastIndex`
   * sobrevive entre chamadas e o MESMO valor alterna entre `true` e `false`.
   * O domínio chama o mesmo objeto.
   */
  it('is stateless: the same value answers the same thing twice', () => {
    expect(REMINDER_TIME_PATTERN.test('21:00')).toBe(true);
    expect(REMINDER_TIME_PATTERN.test('21:00')).toBe(true);
    expect(REMINDER_TIME_PATTERN.flags).not.toContain('g');
  });
});

describe('updateSettingsSchema', () => {
  /** Decisão C: PATCH parcial — um campo só é corpo legítimo. */
  it('accepts a patch with a single field', () => {
    expect(updateSettingsSchema.parse({ reminderEnabled: false })).toEqual({
      reminderEnabled: false,
    });
  });

  /** O patch vazio também: "nada mudou" não é erro de borda. */
  it('accepts an empty patch', () => {
    expect(updateSettingsSchema.parse({})).toEqual({});
  });

  it('accepts the five fields together', () => {
    const body = {
      timezone: 'Europe/Lisbon',
      locale: 'en',
      reminderTime: '07:30',
      reminderEnabled: false,
      notifyGroupActivity: false,
    };

    expect(updateSettingsSchema.parse(body)).toEqual(body);
  });

  it.each(REFUSED)('refuses the patch when reminderTime is %s', (value) => {
    expect(
      updateSettingsSchema.safeParse({ reminderTime: value }).success,
    ).toBe(false);
  });

  /**
   * ⚠️ **A decisão A da fatia, na borda: o `Settings` é do USUÁRIO e o input
   * NÃO TEM `userId`.** `.strict()` é o padrão dos corpos de escrita do projeto
   * (`createHighlightSchema`, os três da nota): chave proibida é **400 e nada
   * escrito**, que é mais forte que "foi ignorada" — quem manda campo de tenant
   * está enganado sobre quem manda nele, e o silêncio o deixaria achar que
   * funcionou (§6.3).
   */
  it.each(['userId', 'actorUserId', 'id', 'clubId'])(
    'refuses a body that declares %s',
    (field) => {
      const result = updateSettingsSchema.safeParse({
        reminderTime: '07:30',
        [field]: 'alguem-de-fora',
      });

      expect(result.success).toBe(false);
    },
  );

  it('never lets a smuggled userId through to the parsed body', () => {
    const parsed = updateSettingsSchema.safeParse({
      reminderEnabled: false,
      userId: 'alguem-de-fora',
    });

    expect(parsed.success).toBe(false);
    // ...e o par positivo: sem o campo proibido, o MESMO corpo passa.
    expect(
      updateSettingsSchema.safeParse({ reminderEnabled: false }).success,
    ).toBe(true);
  });

  it('refuses an empty timezone and an empty locale', () => {
    expect(updateSettingsSchema.safeParse({ timezone: '' }).success).toBe(
      false,
    );
    expect(updateSettingsSchema.safeParse({ locale: '' }).success).toBe(false);
  });
});

describe('settingsResponseSchema', () => {
  /**
   * ⚠️ **CINCO campos, e nem `id` nem `userId`** — o schema é a FRONTEIRA
   * (§6.1). O `id` da linha não serve a tela nenhuma, e o `userId` é o dono do
   * token: devolvê-lo seria repetir o que o cliente já sabe, num endereço que
   * só fala do próprio dono.
   */
  it('has exactly the five preference fields', () => {
    expect(Object.keys(settingsResponseSchema.shape).sort()).toEqual([
      'locale',
      'notifyGroupActivity',
      'reminderEnabled',
      'reminderTime',
      'timezone',
    ]);
  });

  it('strips anything the entity carries and the contract does not', () => {
    const parsed = settingsResponseSchema.parse({
      id: 'settings-1',
      userId: 'maria',
      timezone: 'America/Sao_Paulo',
      locale: 'pt',
      reminderTime: '21:00',
      reminderEnabled: true,
      notifyGroupActivity: true,
    });

    expect(parsed).toEqual({
      timezone: 'America/Sao_Paulo',
      locale: 'pt',
      reminderTime: '21:00',
      reminderEnabled: true,
      notifyGroupActivity: true,
    });
  });
});
