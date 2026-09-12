import type { CalendarDay, NotificationKind } from '@clube/shared';
import { isNotificationKind, NOTIFICATION_KINDS } from '@clube/shared';

/**
 * ⚠️ **O CLAIM — "esta pessoa já recebeu ESTE tipo de aviso HOJE".**
 *
 * Não é o registro de uma mensagem: é uma **reserva**. O dispatcher pede a
 * reserva do dia **antes** de mandar qualquer coisa (decisão E), e o
 * `@@unique([userId, kind, localDate])` é quem garante que só uma das passadas
 * — de qualquer instância, de qualquer processo — a consegue. É a idempotência
 * do `NOTIFICACOES.md` §6: por **claim no banco**, não por lock e não por
 * memória, porque memória é exatamente o que reinicia.
 *
 * ## ⚠️ A tabela NÃO aponta para `ReadingPlanItem` (decisão J)
 *
 * De propósito, e a razão é de produto, não de esquema: o claim é por **dia de
 * calendário no fuso da pessoa**. Um vínculo com o item do plano faria a chave
 * mudar quando o admin editasse o plano — e o lembrete daquele dia sairia **de
 * novo**, para quem já o tinha recebido. O plano é editável; o dia 5 de outubro
 * não é.
 *
 * A consequência estrutural, e ela é boa: a guarda da Tarefa 34b
 * (`usecases/__tests__/plan-item-fk-guards.test.ts`) continua verde **sem uma
 * linha de mudança**. Ela cobra guarda de domínio no `replacePlanItems` para
 * toda FK que recuse a remoção de um DIA DO PLANO; esta tabela só recusa a
 * remoção de uma **pessoa**, como o `PushSubscription`.
 *
 * ## As QUATRO colunas mais o `id`, e o que NÃO existe
 *
 * - **SEM `clubId`**: push é da PESSOA (decisão F da Tarefa 36). A mesma pessoa
 *   em dois clubes recebe **um** lembrete por dia, e é isso que a chave diz.
 * - **SEM `status`/`archivedAt`/`updatedAt`**: é log imutável, como o
 *   `ReadingLog` e o `ActivityEvent` (`CLAUDE.md`). Nada reescreve a linha, e
 *   instante sem dono é campo que mente (ADR 0008).
 * - **SEM `payload`, SEM `title`, SEM `bookId`**: o registro diz que **saiu**,
 *   não o que dizia. Guardar a frase seria guardar conteúdo num log de entrega
 *   — e o texto muda com o catálogo, então um histórico dele envelheceria
 *   mentindo (é o mesmo argumento da decisão G da Tarefa 33, que manteve o
 *   `ActivityEvent` sem título do dia).
 * - **SEM `sent`/`disabled`**: quantos aparelhos receberam é resultado do
 *   envio, e quem o loga é o script. Uma reserva não tem contagem.
 */
export interface NotificationDelivery {
  id: string;
  /** A quem o aviso foi reservado. Nunca vem de input: é a varredura que o traz. */
  userId: string;
  /** `'READING_REMINDER'` | `'GROUP_ACTIVITY'` — `String` no banco (decisão G). */
  kind: NotificationKind;
  /**
   * ⚠️ **O dia no fuso DA PESSOA, como `"YYYY-MM-DD"`** (decisão F).
   *
   * `String`, e não `@db.Date` nem instante: com um instante, duas pessoas em
   * fusos diferentes no mesmo momento teriam a MESMA chave (e uma ficaria sem
   * lembrete), ou a mesma pessoa teria DUAS (e receberia duas vezes). É
   * **exatamente** o que `localDay(instant, timeZone)` devolve, e é por isso
   * que a comparação com `ReadingPlanItem.date` é igualdade de string e não
   * aritmética de data (decisão A).
   */
  localDate: CalendarDay;
  /** Quando a reserva foi feita — do relógio do dispatcher, lido UMA vez. */
  deliveredAt: Date;
}

/**
 * O portão do tipo: um dos de `@clube/shared`, e nada mais.
 *
 * ⚠️ **`Error` cru, e NÃO classe de domínio** — o mesmo desenho do
 * `assertActivityType` e o oposto do `assertNotificationPlatform`. A diferença
 * é quem está do outro lado: **nenhuma rota recebe `kind`**. Quem o escreve é o
 * dispatcher (código nosso) e quem o lê de volta é o repositório, então um valor
 * fora da lista é erro de programação ou coluna corrompida — 500 é o status
 * certo, e uma classe de erro nova exigiria mapeamento que nenhum cliente
 * alcançaria.
 *
 * O segundo chamador é o que torna isto mais que cerimônia: o
 * `PrismaNotificationDeliveryRepository` o atravessa na **leitura**, porque a
 * coluna é `String` e o domínio quer `NotificationKind`.
 *
 * A mensagem lista o que é aceito e **não ecoa o valor recusado**: ecoar o que
 * chegou é como um payload inteiro volta numa mensagem.
 */
export function assertNotificationKind(value: unknown): NotificationKind {
  if (!isNotificationKind(value)) {
    throw new Error(
      `notification delivery kind must be one of ${NOTIFICATION_KINDS.join(', ')}`,
    );
  }
  return value;
}
