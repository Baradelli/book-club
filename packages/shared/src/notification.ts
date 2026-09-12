import { z } from 'zod';

/**
 * O contrato do push (MVP 3, Bloco I) — `docs/NOTIFICACOES.md` §4.
 *
 * ⚠️ **ESTA FATIA NÃO ENVIA NADA.** Aqui só se **lê** configuração e se
 * **guarda** inscrição; o envio (`sendPushToUser`, o `PushSender`, o
 * `web-push`) é a Tarefa 38, e o dispatcher é a 37. É escolha de segurança, não
 * de escopo: a primeira fatia que toca segredo não produz efeito fora da
 * máquina.
 *
 * ⚠️ **O que NÃO nasceu aqui, e por quê.** O §4 do `NOTIFICACOES.md` também
 * lista `notificationKind` (`READING_REMINDER` | `GROUP_ACTIVITY` | `TEST`) e
 * `notificationSendResponseSchema` (`{ sent, disabled }`). Os dois pertencem a
 * rotas e tabelas que **não existem nesta fatia** — o `NotificationDelivery.kind`
 * é a Tarefa 37 e o `POST /notifications/test` é a 38 —, e vocabulário sem
 * chamador é especulação: o `docs/CONVENCOES-CODIGO.md` §7.1 registra a decisão
 * de não subir o `matchesText` para o arquivo compartilhado enquanto ele tivesse
 * um chamador só. Eles entram na fatia que os usa, com o teste que os pina.
 */

/**
 * ⚠️ **AS DUAS PLATAFORMAS, e a constante é o DONO da lista.**
 *
 * O `CLAUDE.md` nomeia `PushSubscription.platform` ao lado de
 * `ActivityEvent.type`, `NotificationDelivery.kind` e `Highlight.color` como a
 * mesma classe: **`String` validado por `z.enum`**, e não enum Prisma, porque a
 * lista ainda evolui (um dia pode haver `ios`/`android` nativo, e um enum
 * Prisma exigiria migration por plataforma).
 *
 * Mora em `packages/shared` pelo caminho que a paleta do grifo percorreu na
 * Tarefa 22: são **três chamadores da MESMA lista** — o domínio do backend
 * (`assertNotificationPlatform`), o `z.enum` da borda logo abaixo e a tela da
 * 36b, que decide o que mandar a partir do que o navegador é.
 *
 * `'mobile'` já entra hoje, e não é especulação: o PWA instalado no iPhone é o
 * caso que o §7 do `NOTIFICACOES.md` descreve por extenso, e a tela precisa
 * poder dizer de onde veio a inscrição para o aviso de "adicione à tela de
 * início" fazer sentido.
 */
export const NOTIFICATION_PLATFORMS = ['web', 'mobile'] as const;

/** Uma das duas — nunca uma plataforma inventada. */
export type NotificationPlatform = (typeof NOTIFICATION_PLATFORMS)[number];

/**
 * O portão da plataforma: recebe `unknown` e **estreita**.
 *
 * Recebe `unknown` pelo mesmo motivo do `isHighlightColor` e do
 * `isActivityType`: quem chama é o domínio, e é o domínio (não o chamador) que
 * decide o que é valor válido. Comparação exata, **sem `trim` e sem dobrar
 * caixa** — normalizar aqui criaria uma segunda grafia aceita que o `z.enum` da
 * borda recusaria, que é a divergência fake-banco do ADR 0007, e o `=` de texto
 * do Postgres é byte-sensível.
 */
export function isNotificationPlatform(
  value: unknown,
): value is NotificationPlatform {
  return (NOTIFICATION_PLATFORMS as readonly unknown[]).includes(value);
}

/**
 * A plataforma na borda: **a mesma constante** de cima, nunca uma lista
 * copiada. O teste pina as `options` do enum contra a constante **por
 * identidade**.
 */
export const notificationPlatform = z.enum(NOTIFICATION_PLATFORMS);

/**
 * A inscrição como o NAVEGADOR a entrega — é literalmente o
 * `PushSubscription.toJSON()` do Web Push, e o formato não é nosso: ele é do
 * protocolo.
 *
 * - `endpoint` é a URL do serviço de push do fabricante (FCM, Mozilla, WNS). Ele
 *   **é a identidade** da inscrição (decisão E), e é por isso que o `@@unique`
 *   da tabela está nele.
 * - `keys.p256dh` é a chave pública do aparelho e `keys.auth` é o segredo de
 *   autenticação; as duas cifram o payload. **Nenhuma das duas volta em
 *   resposta alguma** — ver o `pushSubscriptionResponseSchema`.
 *
 * **Sem `.strict()` aqui**, ao contrário do corpo que o envolve: este objeto é
 * copiado do navegador, e navegadores acrescentam campo (`expirationTime` é o
 * exemplo que já existe). Recusar o corpo inteiro por causa de um campo que o
 * Chrome passou a mandar quebraria a ativação de todo mundo num update de
 * navegador — e não há aqui campo derivado nem de tenant que o strip precise
 * defender. É o mesmo raciocínio com que o `listHighlightsQuerySchema` recusou
 * o `.strict()`.
 */
export const browserPushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/**
 * "Ative o push neste aparelho."
 *
 * ⚠️ **NENHUM campo de ator nem de tenant**: o dono da inscrição é `req.user.sub`
 * (§6.3), e a inscrição **não tem `clubId`** (decisão F) — push é da PESSOA, e
 * a mesma pessoa em dois clubes tem um aparelho.
 *
 * `.strict()` é o padrão dos corpos de escrita do projeto (os três da nota, os
 * dois do grifo): chave proibida é **400 e nada escrito**, que é mais forte que
 * "foi ignorada" — quem manda campo de tenant está enganado sobre quem manda
 * nele, e o silêncio o deixaria achar que funcionou.
 *
 * `userAgent` é `optional()` e não `nullable()`, o precedente do `reference` do
 * `createFreeNoteSchema`: numa inscrição nova não há campo a limpar, então
 * "ausente" e "`null`" significariam a mesma coisa.
 */
export const savePushSubscriptionSchema = z
  .object({
    platform: notificationPlatform,
    subscription: browserPushSubscriptionSchema,
    userAgent: z.string().optional(),
  })
  .strict();

/**
 * "Desligue o push deste aparelho" — **desativação SOFT** (`disabledAt`), e
 * idempotente.
 *
 * ⚠️ **O corpo tem UM campo, e é o `endpoint`.** Ele é a identidade da
 * inscrição no protocolo, e a busca do UseCase é pelo par
 * `(endpoint, actorUserId)` — a decisão E da Tarefa 30 outra vez: a inscrição
 * de outra pessoa é **inalcançável** porque a busca já é por dono.
 *
 * ⚠️ **`.strict()`, e aqui ele é a primeira barreira do §7.5.** O mutante
 * perigoso não é `input.userId` cru: é `input.userId ?? req.user.sub`, o
 * envenenamento com **fallback**, que se comporta normalmente sempre que o
 * campo está ausente. Para ele ser alcançável, alguém precisa **declarar o
 * campo aqui** — que é o que "romper o strip" significa (§6.3: não é "tirar o
 * `.strict()`"). Com o `.strict()`, um corpo que carregue `userId` é 400 antes
 * de o handler existir.
 */
export const deletePushSubscriptionSchema = z
  .object({ endpoint: z.string().url() })
  .strict();

/**
 * ⚠️ **O `null` que DESLIGA A FEATURE LIMPO** (`NOTIFICACOES.md` §3, decisão
 * G).
 *
 * Sem chave VAPID configurada a resposta é `{ enabled: false, vapidPublicKey:
 * null }` e o status é **200**, não 404: um 404 faria a tela tratar "não
 * configurado" como erro, e o 200 com `enabled: false` é o que deixa ela
 * esconder o toggle sem drama. **Ninguém precisa de VAPID configurado para
 * rodar o projeto.**
 *
 * ⚠️ **DOIS campos, e o nome do segundo diz PÚBLICA.** A chave pública pode
 * chegar ao front (é ela que vai no `applicationServerKey` do
 * `pushManager.subscribe`); a **privada nunca sai do backend**. Este schema é a
 * fronteira que o `serializerCompiler` aplica (§6.1) — um `toResponse` que um
 * dia junte a privada por engano não a faz atravessar —, e o teste
 * `strips a private key that some future toResponse might add` é o acusador.
 */
export const notificationConfigResponseSchema = z.object({
  enabled: z.boolean(),
  vapidPublicKey: z.string().nullable(),
});

/**
 * A inscrição como sai na resposta do `POST` — **e as CHAVES NÃO SAEM**.
 *
 * O `p256dh` e o `auth` são as credenciais que cifram o push daquele aparelho.
 * Devolvê-las não serve a tela nenhuma (o cliente acabou de mandá-las) e as
 * espalharia por log de proxy, histórico de devtools e cache. O schema é a
 * fronteira (§6.1), e o teste `strips the keys when something tries to send
 * them` prova que elas não atravessam nem por acidente.
 *
 * O `userId` também fica de fora, e por outro motivo: este endereço só fala do
 * dono do token, então devolvê-lo seria repetir o que o cliente já sabe.
 *
 * `userAgent` e `disabledAt` são **obrigatórios e anuláveis**, nunca
 * `optional()`: `null` é estado real (a inscrição ativa **é** a de `disabledAt`
 * nulo), e a ausência do campo quebraria a tela em cheio, porque o cliente
 * valida a resposta de sucesso (§6.8).
 */
export const pushSubscriptionResponseSchema = z.object({
  id: z.string(),
  platform: notificationPlatform,
  endpoint: z.string(),
  userAgent: z.string().nullable(),
  /** `null` = ativa. É o estado que o `POST` restaura quando a pessoa volta. */
  disabledAt: z.string().nullable(),
  createdAt: z.string(),
});

export type BrowserPushSubscription = z.infer<
  typeof browserPushSubscriptionSchema
>;
export type SavePushSubscriptionBody = z.infer<
  typeof savePushSubscriptionSchema
>;
export type DeletePushSubscriptionBody = z.infer<
  typeof deletePushSubscriptionSchema
>;
export type NotificationConfigResponse = z.infer<
  typeof notificationConfigResponseSchema
>;
export type PushSubscriptionResponse = z.infer<
  typeof pushSubscriptionResponseSchema
>;
