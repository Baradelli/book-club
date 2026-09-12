import { REMINDER_TIME_PATTERN } from '@clube/shared';

/**
 * ⚠️ **A JANELA DO LEMBRETE — a função pura da Tarefa 37, e a única peça da
 * fatia que não fala com nada.**
 *
 * `NOTIFICACOES.md` §6 e ADR 0006: um pulso é devido quando
 * `0 <= minutosDepoisDoAlvo < windowMinutes`. A janela existe porque comparar o
 * horário exato (`localNow.toFormat('HH:mm') === reminderTime`) só funciona se
 * o cron rodar de minuto em minuto e nunca atrasar — um atraso de 30 segundos
 * perderia o dia inteiro, em silêncio.
 *
 * ## ⚠️ Nem `Date` nem `DateTime` entram aqui (regra 1)
 *
 * A entrada é **minutos desde a meia-noite local**: um inteiro. Esta função não
 * sabe que dia é, em que fuso está, nem se houve horário de verão — e é isso
 * que a torna decidível em teste sem relógio, sem fuso e sem Luxon. Quem
 * traduz "o instante `now` no fuso desta pessoa" para o inteiro é o
 * `local-clock.ts`, que é o ÚNICO arquivo do projeto onde Luxon encosta
 * (ADR 0006).
 *
 * É também a decisão A vista de perto: **não há aritmética de data em lugar
 * nenhum** desta fatia. O dia de calendário se compara por igualdade de string
 * (`localDay` × `ReadingPlanItem.date`); a hora se compara por subtração de
 * dois inteiros.
 *
 * ## ⚠️ A janela NÃO atravessa a meia-noite
 *
 * É o comportamento de referência do §6 (`localNow.set({ hour, minute })` cai
 * sempre no MESMO dia local), e está testado em vez de consertado: a conta que
 * atravessasse teria de decidir **de qual dia** é o lembrete atrasado, e o
 * `localDate` do claim é a chave de idempotência — um lembrete de ontem
 * entregue hoje gastaria o claim de hoje e calaria o lembrete de hoje. Ver
 * `__tests__/reminder-window.test.ts`, teste `never wraps around midnight`.
 */

/**
 * O tamanho padrão da janela, em minutos (decisão D).
 *
 * ⚠️ **MAIOR que o intervalo do cron (5 min), e é isso que a faz absorver um
 * atraso.** Ela ser maior significa que duas passadas seguidas PODEM cair
 * dentro dela — e é o claim no banco, não a janela, quem garante que o segundo
 * não vira um segundo lembrete (`NOTIFICACOES.md` §6).
 */
export const DEFAULT_WINDOW_MINUTES = 10;

/**
 * `"HH:mm"` → minutos desde a meia-noite local, ou `null` se a string não é um
 * horário.
 *
 * ⚠️ **O portão é o `REMINDER_TIME_PATTERN` de `@clube/shared`, o MESMO objeto
 * que a borda e o `assertReminderTime` usam.** Três barreiras, uma regra só —
 * um segundo regex escrito aqui seria a lição nº 3 do MVP 1 outra vez, e a
 * divergência apareceria no dia em que um dos dois aceitasse `"7:00"`.
 */
export function minutesOfDay(target: string): number | null {
  if (!REMINDER_TIME_PATTERN.test(target)) return null;

  const [hours, minutes] = target.split(':');
  // O regex já garante os dois pedaços; o `if` é o que o
  // `noUncheckedIndexedAccess` exige, e não uma segunda validação.
  if (hours === undefined || minutes === undefined) return null;

  return Number(hours) * 60 + Number(minutes);
}

/**
 * "Agora é a hora desta pessoa?" — `>= 0 && < windowMinutes` (decisão D).
 *
 * `localMinutes` são os minutos desde a meia-noite **no fuso dela**.
 *
 * ⚠️ **Horário torto devolve `false`, e NÃO lança.** Lançar mataria a passada
 * inteira do cron por causa de UMA linha corrompida: todo mundo ficaria sem
 * lembrete porque uma pessoa tem `"9h"` gravado. Quem grita com o valor torto é
 * o `assertReminderTime` — na borda e na leitura do `getSettings` —; aqui a
 * resposta é "esta pessoa não tem horário válido, então não é agora".
 *
 * E a recusa é **explícita**, não um efeito do `NaN`: `NaN >= 0` e `NaN < 10`
 * são os dois `false`, então a conta ingênua calaria o lembrete **por
 * acidente** — e a primeira refatoração que invertesse um operador mandaria
 * push a toda hora do dia.
 */
export function isInsideWindow(
  localMinutes: number,
  target: string,
  windowMinutes: number,
): boolean {
  const targetMinutes = minutesOfDay(target);
  if (targetMinutes === null) return false;

  const minutesAfter = localMinutes - targetMinutes;
  return minutesAfter >= 0 && minutesAfter < windowMinutes;
}
