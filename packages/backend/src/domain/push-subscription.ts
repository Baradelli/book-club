import type { NotificationPlatform } from '@clube/shared';
import { isNotificationPlatform, NOTIFICATION_PLATFORMS } from '@clube/shared';

import { InvalidPushSubscriptionError } from './errors';

/**
 * A inscrição de push de **um aparelho de uma pessoa**.
 *
 * ⚠️ **Ela carrega `userId` e o `clubId` NÃO existe** (decisão F da Tarefa 36).
 * Push é da **pessoa**, não do clube: a mesma pessoa em dois clubes tem **um**
 * aparelho, e pôr `clubId` aqui obrigaria a decidir "qual clube" num dado que
 * não tem clube. É a mesma família do `Settings`, que também é do usuário — e
 * as duas são a exceção ao "todo modelo de conteúdo carrega `clubId`" do
 * `CLAUDE.md`, porque nenhuma das duas é conteúdo de clube.
 *
 * ⚠️ **O `endpoint` É a identidade** (decisão E): é a URL do serviço de push do
 * fabricante, e é o que o protocolo Web Push usa para endereçar o aparelho. Daí
 * o `@@unique([endpoint])` da tabela e o upsert por ele — dois registros do
 * mesmo endpoint fariam o mesmo aparelho receber duas vezes.
 *
 * ## As NOVE colunas, e o que NÃO existe
 *
 * - **SEM `status`/`archivedAt`**, ao contrário das tabelas de UI do projeto: a
 *   desativação é o `disabledAt`, e ela não é soft delete de conteúdo — é
 *   "este aparelho não recebe mais". O nome vem do `NOTIFICACOES.md` §4 e do
 *   ADR 0006, que já o nomeiam (`WebPushError` 404/410 marca `disabledAt`), e
 *   dois nomes para o mesmo instante são a duplicação que a lição nº 3 proíbe.
 * - **SEM `updatedAt`**: nada reescreve a linha além do `disabledAt`, e esse
 *   instante já é o registro da mudança. Instante sem dono é campo que mente
 *   (ADR 0008).
 * - **SEM `lastSentAt`, SEM contador de envio**: a Tarefa 38 devolve
 *   `{ sent, disabled }` ao chamador para ele logar; guardar isso aqui seria
 *   inventar histórico que ninguém pediu, e `NotificationDelivery` (Tarefa 37)
 *   já é o registro do que saiu.
 */
export interface PushSubscription {
  id: string;
  /** O DONO. Sempre o ator; nunca vem do input. */
  userId: string;
  /** `'web'` | `'mobile'` — `String` no banco, validado por `z.enum` e por aqui. */
  platform: NotificationPlatform;
  /** ⚠️ A IDENTIDADE da inscrição no protocolo. `@@unique` no banco. */
  endpoint: string;
  /** A chave pública do aparelho, como o navegador a entregou. */
  p256dh: string;
  /** O segredo de autenticação do aparelho. Nunca sai em resposta alguma. */
  auth: string;
  /** O que o navegador disse ser, quando disse. Só para a tela listar aparelhos. */
  userAgent: string | null;
  /** `null` = ativa. É o único campo mutável da linha (decisão I). */
  disabledAt: Date | null;
  createdAt: Date;
}

/**
 * ⚠️ **O `disabledAt` É O ÚNICO CAMPO MUTÁVEL** (decisão I), e o patch é um
 * **tipo próprio** — nunca `Partial<PushSubscription>` (§7.1.1).
 *
 * `Partial<PushSubscription>` incluiria identidade (`id`, `endpoint`), dono
 * (`userId`) e as credenciais do aparelho (`p256dh`, `auth`) — campos que
 * nenhum UseCase patcheia e que o `toUpdateData` do Prisma teria de filtrar
 * calado, enquanto o fake obedeceria. Foi exatamente esse bug no `NotePatch`
 * que o §7.1.1 registra: `update(id, { userId: 'x' })` **trocava a autoria no
 * fake** e era **no-op silencioso no Postgres**.
 *
 * Aqui o `Pick` é a lista de PERMITIDOS, que não envelhece. E a reativação não
 * passa por ele: quem reativa é o `save` (o upsert por `endpoint`), que escreve
 * `disabledAt: null` junto com o resto — ver o docblock do port.
 *
 * ⚠️ **O que o tipo NÃO fecha, e a frase honesta** (§7.1.1): a checagem de
 * propriedade em excesso do TypeScript só vale para **objeto literal fresco** —
 * `update(id, loose)` com uma variável atravessa. Por isso o
 * `PushSubscriptionRepositoryFake.update` copia **campo a campo**, exatamente
 * como o `toUpdateData` do Prisma faz: o compilador recusa o literal, e o fake
 * recusa o resto.
 */
export type PushSubscriptionPatch = Partial<
  Pick<PushSubscription, 'disabledAt'>
>;

/**
 * O portão da plataforma: uma das duas de `@clube/shared`, e nada mais.
 *
 * Recebe `unknown` pelo mesmo motivo do `assertHighlightColor`: o valor vem de
 * corpo de request, e o `z.enum` da borda é a primeira barreira, não a única. E
 * há um **segundo chamador**, que é o que torna este portão mais que cerimônia:
 * o `PrismaPushSubscriptionRepository` o atravessa na **leitura** — a coluna é
 * `String` e o domínio quer `NotificationPlatform`, e uma plataforma fora da
 * lista no banco é erro de verdade que tem de aparecer ali, não na tela.
 *
 * ⚠️ **Classe de domínio, e não `Error` cru como no `assertActivityType`** — e a
 * diferença é quem está do outro lado. Lá o valor vem do código que dispara o
 * gatilho (é erro de programação, que nenhum cliente provoca). Aqui ele vem do
 * **corpo de um request**, então o cliente consegue provocá-lo, e o status certo
 * é **400** com mensagem — que é o que o `InvalidPushSubscriptionError` dá.
 *
 * A mensagem lista o que é aceito e **não** ecoa o valor recusado: `value` é
 * `unknown`, e ecoar o que chegou é como um payload inteiro volta na resposta.
 */
export function assertNotificationPlatform(
  value: unknown,
): NotificationPlatform {
  if (!isNotificationPlatform(value)) {
    throw new InvalidPushSubscriptionError(
      `push subscription platform must be one of ${NOTIFICATION_PLATFORMS.join(', ')}`,
    );
  }
  return value;
}
