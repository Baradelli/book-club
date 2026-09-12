import { DateTime } from 'luxon';

/**
 * ⚠️ **O ÚNICO ARQUIVO DO PROJETO QUE IMPORTA LUXON — e é ADR 0006.**
 *
 * Luxon é dependência de `packages/backend` e **só dele**. O front calcula "que
 * dia é hoje" com `Intl` (`packages/shared/src/local-day.ts`), justamente para
 * o PWA não empacotar a biblioteca; há uma varredura provando que `shared` não
 * o importa — nem direta nem **transitivamente** —, em
 * `packages/shared/src/__tests__/no-luxon-in-shared.test.ts`.
 *
 * ## ⚠️ Para que Luxon entra, e para que NÃO entra
 *
 * Entra para **uma** pergunta: *que horas são no relógio de parede desta
 * pessoa?* É a única do MVP 3 que `Intl` também responderia, mas com montagem
 * manual de partes — e é a única em que errar significa acordar alguém de
 * madrugada.
 *
 * **NÃO entra** para saber que dia é (decisão A): isso é `localDay(instant,
 * timeZone)` de `@clube/shared`, que devolve `"YYYY-MM-DD"` — exatamente a
 * forma de `ReadingPlanItem.date` —, e a comparação é **igualdade de string**.
 * Nenhum `startOf('day')`, nenhum range de instantes, nenhuma comparação de
 * `Date`. Se Luxon escapar para essa conta, passam a existir dois donos do
 * "que dia é hoje" — um no back e um no front —, e é o segundo que fica para
 * trás.
 */

/**
 * Minutos desde a meia-noite **local** do `timeZone`, ou `null` se o fuso não
 * existe.
 *
 * ⚠️ **NÃO desambigua o horário de verão, e é deliberado.** No dia do salto
 * para trás a mesma hora de parede acontece duas vezes e esta função devolve o
 * mesmo inteiro nas duas — porque as duas **são** aquela hora, que é o que o
 * lembrete promete. Quem impede o lembrete dobrado é o **claim** no banco
 * (`NOTIFICACOES.md` §6), e pôr a idempotência também aqui criaria dois donos
 * da mesma regra. No dia do salto para a frente a hora pulada simplesmente não
 * é reportada por instante nenhum, e quem marcou o lembrete nela fica sem ele
 * naquele dia — o que é a resposta honesta: a hora não aconteceu.
 *
 * ⚠️ **Fuso inválido é `null`, NÃO o fuso do ambiente.** É a divergência
 * deliberada com o `localDay` de `packages/shared`, que cai no fuso do
 * ambiente: lá o pior caso é a tela mostrar o dia errado para quem está olhando
 * e pode corrigir; aqui o pior caso é **push de madrugada**. O chamador conta
 * essa pessoa como `skipped` e segue — a passada do cron não morre por causa de
 * uma linha corrompida.
 */
export function localMinutesOfDay(
  instant: Date,
  timeZone: string,
): number | null {
  const local = DateTime.fromJSDate(instant, { zone: timeZone });
  // `isValid` é falso quando o `zone` não resolve — e aí `hour`/`minute` são
  // `NaN`. Tentar construir é a ÚNICA checagem fiel de fuso: `'+03:00'` é
  // deslocamento legítimo e `'UTC+3'` não, e nenhum regex acerta os dois.
  if (!local.isValid) return null;

  return local.hour * 60 + local.minute;
}
