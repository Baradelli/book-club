import { z } from 'zod';

/**
 * As preferências da PESSOA (MVP 3, Tarefa 36).
 *
 * ⚠️ **Arquivo próprio, e não dentro do `notification.ts`** — espelha a
 * separação que o backend faz entre `settings-routes.ts` e
 * `notification-routes.ts`, que é o mesmo motivo pelo qual o `highlight.ts` e o
 * `reading-log.ts` nasceram separados do `note.ts`. E o recorte não é
 * arbitrário: `timezone` e `locale` não têm nada com push — quem os quer é a
 * home ("que dia é hoje") e o i18n.
 *
 * ⚠️ **O `Settings` é do USUÁRIO, não do clube** (decisão A): ele é
 * `unique(userId)` desde a Tarefa 03 e não tem `clubId`. O corte aqui é o
 * próprio JWT — você só lê e escreve o SEU —, e por isso **nenhum schema deste
 * arquivo declara `userId`, `actorUserId` ou `clubId`**.
 */

/**
 * ⚠️ **O REGEX DE `HH:mm`, e ele é o DONO da regra — nos dois lados.**
 *
 * O `assertReminderTime` do domínio do backend importa esta mesma constante: a
 * borda é a primeira barreira, não a única (decisão D), mas **duas barreiras
 * não são duas regras** — um segundo regex escrito à mão no domínio seria a
 * lição nº 3 do MVP 1 outra vez, e a divergência apareceria no dia em que um
 * dos dois aceitasse `"7:00"`.
 *
 * ⚠️ **Sem a flag `g`**, de propósito: `RegExp.test` com `g` guarda
 * `lastIndex` entre chamadas, e o MESMO valor passaria a alternar entre `true`
 * e `false` conforme a ordem das chamadas. Com dois donos chamando o mesmo
 * objeto (a borda e o domínio, no mesmo request), isso seria um bug
 * intermitente por construção. O pino está em
 * `__tests__/settings-schemas.test.ts`.
 *
 * Relógio de 24 horas, com zero à esquerda obrigatório: `00:00` a `23:59`. O
 * zero à esquerda não é preciosismo — o dispatcher da Tarefa 37 faz
 * `target.split(':').map(Number)`, e um `"9:00"` gravado seria `9` (que até
 * funciona) enquanto um `"9h"` seria `NaN` na janela, sem erro e sem ninguém
 * notar. Uma grafia por horário, como a cor do grifo tem uma grafia por cor.
 */
export const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** O horário do lembrete na borda: `"HH:mm"`, e nada mais. */
export const reminderTimeSchema = z
  .string()
  .regex(
    REMINDER_TIME_PATTERN,
    'reminderTime must be HH:mm, from 00:00 to 23:59',
  );

/**
 * As preferências como saem na resposta do `GET /me/settings`.
 *
 * ⚠️ **CINCO campos — sem `id` e sem `userId`** — e o schema é a FRONTEIRA: é o
 * `serializerCompiler` do Zod que corta o que não está declarado, e sem ele o
 * objeto de domínio inteiro iria para a rede (§6.1). O `id` da linha não serve
 * a tela nenhuma; o `userId` é o dono do token, e um endereço que só fala do
 * próprio dono devolvê-lo seria repetir o que o cliente já sabe.
 *
 * ⚠️ E é o **MESMO** schema da resposta do `PATCH`: as duas devolvem o estado
 * inteiro das preferências, porque a tela da 36b desenha os cinco controles com
 * o que voltou — um `PATCH` que devolvesse só o que mudou obrigaria a tela a
 * remontar o estado à mão.
 */
export const settingsResponseSchema = z.object({
  timezone: z.string(),
  locale: z.string(),
  reminderTime: reminderTimeSchema,
  reminderEnabled: z.boolean(),
  notifyGroupActivity: z.boolean(),
});

/**
 * O PATCH das preferências: **só os campos que vieram** (decisão C).
 *
 * A tela mínima da 36b mexe em três campos de cinco. Exigir o objeto inteiro
 * faria ela mandar `timezone` e `locale` que não edita — e um dia sobrescrever
 * com valor velho.
 *
 * ⚠️ **`.strict()`**, como os três corpos de escrita da nota e os dois do
 * grifo: chave proibida é **400 e nada escrito**, que é mais forte que "foi
 * ignorada". Aqui isso vale em dobro, porque a chave proibida que importa é o
 * `userId` — quem o manda está enganado sobre quem manda nele, e o strip
 * silencioso o deixaria achar que funcionou (§6.3).
 *
 * **Sem `.default()` em nada:** ausente significa "não mexe", e um default
 * colapsaria isso com "põe o padrão" — o patch vazio passaria a reescrever os
 * cinco campos.
 *
 * **Nada é `.nullable()`**, ao contrário do `editHighlightSchema`: aqui não há
 * campo a LIMPAR. As cinco preferências têm valor sempre (o `DEFAULT_SETTINGS`
 * é o que vale enquanto não há linha), então `null` não significaria nada.
 */
export const updateSettingsSchema = z
  .object({
    timezone: z.string().min(1).optional(),
    locale: z.string().min(1).optional(),
    reminderTime: reminderTimeSchema.optional(),
    reminderEnabled: z.boolean().optional(),
    notifyGroupActivity: z.boolean().optional(),
  })
  .strict();

export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export type UpdateSettingsBody = z.infer<typeof updateSettingsSchema>;
