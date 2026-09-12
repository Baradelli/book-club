# NOTIFICACOES.md — Push VAPID (Web Push) no Clube do Livro

> Spec da feature de notificação. Entra no **MVP 3, Bloco I** (`docs/BACKLOG.md`, tarefas
> 36–38). Aqui mora o **como**; a decisão de arquitetura está em `docs/adr/0006-*.md`.
>
> Não implemente nada disto antes do MVP 3.

---

## 1. Por que push, e por que só duas notificações

O clube vive de um puxar o outro. Duas mensagens fazem esse trabalho:

- **`READING_REMINDER`** — "a leitura de hoje é o Cap. 3". No horário que a pessoa escolheu.
  **Não chega para quem já registrou a leitura de hoje** — princípio anti-culpa: o app não
  cobra quem já fez.
- **`GROUP_ACTIVITY`** — "\<pessoa\> escreveu sobre o Cap. 3". Imediato, quando alguém do
  clube lê, escreve uma anotação ou registra um grifo. É o incentivo.

Mais um tipo, só para diagnóstico: **`TEST`**, disparado pelo botão "enviar notificação de
teste" nas preferências.

**O push nunca leva o conteúdo.** Só quem fez e sobre qual tema. O conteúdo se lê no app,
autenticado. Notificação aparece em tela bloqueada.

---

## 2. Como o navegador recebe (service worker)

O PWA já gera um service worker pelo Workbox (`vite-plugin-pwa`). **Não crie um segundo
service worker** — injete o handler no gerado:

```ts
// packages/app/vite.config.ts — ⚠️ ESBOÇO DE 2026-09, NÃO COPIE (ver errata abaixo)
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
    navigateFallback: 'index.html',
    importScripts: ['push-handler.js'],
  },
  manifest: { /* … */ },
})
```

> ⚠️ **ERRATA (Tarefa 38) — o bloco acima é o ESBOÇO, e copiá-lo QUEBRA duas coisas
> entregues.** O `vite.config.ts` de verdade diverge em três pontos, e os três têm motivo:
>
> 1. **`globPatterns` termina em `webmanifest`, não em `woff2`** — o projeto não tem fonte
>    própria, e o manifesto do PWA precisa entrar.
> 2. ⚠️ **Falta o `globIgnores: ['assets/en-*.js']`**, que é a entrega inteira da **Tarefa
>    29a**. Sem ele o catálogo `en` volta ao precache e o install baixa o que a fatia tirou —
>    medido lá: 15 entradas / 887,15 KiB → 16 / 887,79 KiB, *mais* download, não menos.
> 3. **`navigateFallback` é `'/index.html'` com a barra**, e existe uma
>    `navigateFallbackDenylist` que o esboço não tem — sem ela o service worker devolve HTML
>    para `GET /api/...`, que é o bug clássico de PWA.
>
> **A fonte da verdade é o `vite.config.ts`**, e as cinco propriedades daquele bloco têm
> acusador medido em `packages/app/src/__tests__/service-worker-config.test.ts` (quatro) e
> `bundle-guard.test.ts` (a quinta, que roda **build real** e exige o `push-handler.js` no
> precache **com revisão** — é ela que faz uma correção no handler chegar a quem já tem o app
> instalado).

`packages/app/public/push-handler.js` — arquivo pequeno, sem build, sem imports:

```js
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch { return; }
  const { title, body, tag, url } = payload;
  event.waitUntil(
    self.registration.showNotification(title, { body, tag, data: { url } }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if ('navigate' in client) { await client.navigate(url); return client.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
```

O `tag` agrupa notificações do mesmo tipo (uma nova substitui a anterior em vez de empilhar).
O `url` leva direto para a leitura ou a anotação — o clique tem de cair na tela certa, senão
a notificação não converte em leitura.

---

## 3. Configuração (VAPID)

`packages/backend/src/notifications/vapid.ts`:

```ts
export interface VapidConfig { publicKey: string; privateKey: string; subject: string }

export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env['VAPID_PUBLIC_KEY'];
  const privateKey = process.env['VAPID_PRIVATE_KEY'];
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env['VAPID_SUBJECT'] ?? 'mailto:admin@localhost' };
}
```

**`null` desliga a feature inteira, limpo**: as rotas respondem `{ enabled: false }`, a tela
esconde o toggle, o dispatcher não faz nada. Ninguém precisa de VAPID configurado para rodar
o projeto em desenvolvimento.

Gerar as chaves uma vez:

```
pnpm --filter @clube/backend exec web-push generate-vapid-keys
```

Env: `VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY` · `VAPID_SUBJECT` ·
`NOTIFICATION_WINDOW_MINUTES` (default `10`).

---

## 4. Contrato (`packages/shared/src/notification.ts`)

```ts
export const notificationPlatform = z.enum(['web', 'mobile']);
// ⚠️ ERRATA: o `TEST` NÃO entrou — ver abaixo.
export const notificationKind = z.enum(['READING_REMINDER', 'GROUP_ACTIVITY', 'TEST']);

export const browserPushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export const savePushSubscriptionSchema = z.object({
  platform: notificationPlatform,
  subscription: browserPushSubscriptionSchema,
  userAgent: z.string().optional(),
});

export const deletePushSubscriptionSchema = z.object({ endpoint: z.string().url() });

export const notificationConfigResponseSchema = z.object({
  enabled: z.boolean(),
  vapidPublicKey: z.string().nullable(),
});

export const notificationSendResponseSchema = z.object({
  sent: z.number(), disabled: z.number(),
});
```

Rotas (dentro do escopo autenticado):

| Rota | O que faz |
|---|---|
| `GET /notifications/config` | `{ enabled, vapidPublicKey }` — **só a chave pública**; a privada nunca sai do servidor |
| `POST /notifications/subscriptions` | upsert por `endpoint`, reativando (`disabledAt = null`) se voltou |
| `DELETE /notifications/subscriptions` | desativação **soft** (`disabledAt = now`) |
| `POST /notifications/test` | manda um `TEST`; `400` quando VAPID não está configurado |

> ⚠️ **ERRATA (Tarefa 38) — o `TEST` NÃO entrou no vocabulário, e é decisão, não
> esquecimento.** O `NOTIFICATION_KINDS` de verdade tem **dois** valores:
> `READING_REMINDER` e `GROUP_ACTIVITY`. O motivo é que essa lista virou, na Tarefa 37, o
> vocabulário de uma **chave de idempotência** (`NotificationDelivery` é `unique(userId, kind,
> localDate)`): um `TEST` ali significaria **"só dá para testar o push uma vez por dia"** —
> exatamente o contrário do que um botão de diagnóstico serve.
>
> O `POST /notifications/test` **existe e funciona** (a linha da tabela está certa, inclusive o
> `400` sem VAPID). O que ele usa é um `tag` com a string `'test'`, que é do protocolo do
> navegador e não precisa estar no enum. E ele **não grava `NotificationDelivery`** — gravar
> faria o diagnóstico consumir a idempotência do dia da pessoa.

---

## 5. Envio

`packages/backend/src/notifications/web-push-service.ts` — atrás de um **port**
(`PushSender`) com fake, como qualquer dependência externa:

```ts
sendPushToUser(config, userId, payload): Promise<{ sent: number; disabled: number }>
```

> ⚠️ **ERRATA (Tarefa 38) — o arquivo e a assinatura são outros.** O adaptador é
> `packages/backend/src/notifications/**web-push-sender.ts**` (classe `WebPushSender`), e o
> método do port é **`send(userId, payload)`** — sem o `config`, que o adaptador recebe **no
> construtor** junto do `PushSubscriptionRepository`. O resto do §5 (o `TTL`, o `topic`, o
> tratamento de `WebPushError` 404/410 e o relance de qualquer outro erro) está **correto e
> implementado**.
>
> ⚠️ **E o §5 não responde o caso misto** — um aparelho morto **e** outro estourando rede na
> mesma chamada. A Tarefa 38 decidiu: **desativa e relança**, e a contagem `disabled` daquela
> passada se perde. A decisão está escrita no docblock do port, com o teste que a sustenta. E
> ela não é fail-fast: o adaptador **percorre todos os aparelhos**, guarda a primeira falha
> não-morta e relança no fim — a primeira versão era fail-fast, passou **22 de 23** testes, e o
> que a derrubou foi o fake enumerar **invertido de propósito** (§7.2 do
> `CONVENCOES-CODIGO.md`), mostrando que a desativação dependia de uma ordem que o port **não
> promete**.

- Carrega as inscrições do usuário com `disabledAt IS NULL` (**via repository**, não
  `$queryRaw`).
- `webPush.sendNotification(sub, JSON.stringify(payload), {
    TTL: 43200, urgency: 'normal', topic: kind.toLowerCase().slice(0, 32), vapidDetails: config
  })`.
- **`WebPushError` 404/410** = inscrição morta (a pessoa desinstalou/limpou o navegador):
  marca `disabledAt` e conta em `disabled`. Qualquer outro erro **relança** — falha de rede
  não deve silenciosamente desligar a inscrição de alguém.
- Devolve `{ sent, disabled }` para o chamador logar.

---

## 6. Agendamento — dispatcher pull-based

**Não existe cron dentro do processo do Fastify.** Um script é chamado por cron externo a
cada 5–10 min:

```
pnpm --filter @clube/backend notifications:dispatch
```

`packages/backend/src/notifications/scheduler.ts`:

```ts
dispatchDueNotifications({ prisma, vapid, now = new Date(), windowMinutes = 10 })
  : Promise<{ considered: number; sent: number; disabled: number; skipped: number }>
```

Passo a passo:

1. Seleciona os usuários que têm **pelo menos uma inscrição ativa** e `reminderEnabled`.
2. Para cada um, calcula o "agora local" com **Luxon** no `Settings.timezone`, e testa a
   janela:

```ts
// verdadeiro só na primeira passada depois do horário — nunca dispara duas vezes por atraso
function isInsideWindow(localNow: DateTime, target: string, windowMinutes: number): boolean {
  const [h, m] = target.split(':').map(Number);
  const targetDt = localNow.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  const minutesAfter = localNow.diff(targetDt, 'minutes').minutes;
  return minutesAfter >= 0 && minutesAfter < windowMinutes;
}
```

3. **Supressão anti-culpa:** se já existe `ReadingLog` da pessoa para a leitura de hoje, o
   lembrete **não** é enviado.

   > ⚠️ **CORRIGIDO ANTES DA TAREFA 37, e a correção muda a CONSULTA, não só um nome.**
   > Este passo dizia *"via `dayRange` no fuso dela"*. Esse helper **nunca existiu** — é a
   > mesma frase que o `CLAUDE.md` prometia e que o dono mandou corrigir na rodada de
   > decisões do MVP 3 (a lição nº 3: regra que aponta para o que não existe faz o próximo
   > agente procurar, não achar e inventar um terceiro nome para a mesma conta).
   >
   > E aqui ela não era só um ponteiro morto: ela descrevia um desenho que a **decisão 2 do
   > MVP 3 substituiu**. O `ReadingLog` é ancorado em **`planItemId`**, não em data — "li o
   > trecho do dia X do plano". Então **não há faixa de instantes a calcular**: o dispatcher
   > traduz o "agora" da pessoa em **um dia de calendário** com `localDay(instant, timeZone)`
   > (`packages/shared/src/local-day.ts`), acha o `ReadingPlanItem` **daquele dia** e pergunta
   > se existe `ReadingLog` do par `(planItemId, userId)`. Um `range` de instantes só faria
   > falta para consultar coluna de **instante** por dia, e nenhuma consulta do projeto faz
   > isso — a coluna `ReadingPlanItem.date` é `@db.Date`, e quem a traduz é o
   > `calendar-day-mapper.ts`.
   >
   > **Consequência para a Tarefa 37:** sem plano do dia, não há leitura de hoje — e sem
   > leitura de hoje **não há do que lembrar**. Esse caso é `skipped`, não um lembrete vazio.
4. **Idempotência por claim no banco** — não por lock, não por memória:

```sql
INSERT INTO "NotificationDelivery" ("id","userId","kind","localDate","deliveredAt")
VALUES ($1,$2,$3,$4,$5)
ON CONFLICT ("userId","kind","localDate") DO NOTHING
RETURNING "id"
```

`localDate` é `YYYY-MM-DD` **no fuso do usuário**. Nada retornado = já foi enviado hoje →
`skipped++`. É o que faz o cron poder rodar de minuto em minuto sem duplicar, e o que faz
duas instâncias do backend conviverem.

> Este `INSERT` é a única exceção de SQL explícito da feature, e vive **dentro do
> repository** de `NotificationDelivery` (método `claim(userId, kind, localDate)`), não na
> rota nem no scheduler.

`GROUP_ACTIVITY` não passa pelo dispatcher: é disparado no mesmo UseCase que grava o
`ActivityEvent` (Tarefa 33), para todos os membros ativos do clube **menos o autor**, e para
quem tem `notifyGroupActivity`. Um debounce curto (60 s, por clube + tipo) evita três
notificações quando três coisas acontecem juntas.

> ⚠️ **ERRATA (Tarefa 38) — o debounce de 60 s NÃO foi feito, porque o `tag` já o faz.** O
> problema que ele resolveria — "três notificações quando três coisas acontecem juntas" — é
> resolvido **no aparelho**, de graça e sem estado no servidor: o `tag` do payload (§2) faz
> uma notificação nova **substituir** a anterior, então três atividades viram **uma**
> notificação visível.
>
> O resíduo que o `tag` **não** resolve são **três vibrações**. É real e é menor, e fica
> registrado como limite conhecido em vez de escondido. ⚠️ **Se incomodar**, o conserto não é
> memória de processo (que não sobrevive a duas instâncias): é um claim com chave de janela —
> e a coluna do claim se chama `localDate`, então usá-la para um balde de minutos seria mentir
> no nome. **Renomeá-la é migration**, ou seja, fatia própria.
>
> O resto do parágrafo está **implementado e medido**: o disparo vive dentro do
> `recordActivitySafely` (dono único do `try/catch` nos quatro UseCases de escrita, que **não
> mudaram uma linha**), e as três exclusões têm mutante com acusador — autor **7**, quem
> desligou `notifyGroupActivity` **1**, membership não-ativo **1**.

---

## 7. Ativar no aparelho (a tela)

Componente em `packages/ui` (`NotificationSettingsSection`), consumido pela tela de
preferências:

> ⚠️ **ERRATA (Tarefa 36b) — a seção mora em `packages/app`, não em `packages/ui`, e o nome é
> outro.** Os arquivos de verdade são `packages/app/src/pages/push-section.tsx` (a seção) e
> `push-device.ts` (a costura com o navegador). **Precedência:** o `CLAUDE.md` diz que
> `packages/ui` é de componentes **compartilhados**, e esta seção tem **um chamador só**, fala
> com `navigator`/`Notification` (que `packages/ui` não toca em lugar nenhum) e conversa com a
> API. É o mesmo precedente do §7.1 que recusou subir o `matchesText` enquanto ele tivesse um
> chamador só. Se uma segunda tela precisar dela, ela sobe — **com o segundo chamador na mão**.
>
> ⚠️ **E a lista de 1 a 5 abaixo está CERTA mas INCOMPLETA:** ela tem três recusas implícitas
> (contexto inseguro, permissão negada, navegador sem suporte) e falta a quarta, que é a do
> **dono**: no iPhone, push em PWA só funciona com o app **adicionado à tela de início** — fora
> dela o `PushManager` **existe**, o feature-detect passa, e a permissão simplesmente nunca é
> concedida. É a mais cruel porque **não parece falha**. A tela entregue tem **quatro** frases
> distintas, uma por causa, e a distinção é propriedade do **catálogo**, nos dois idiomas.
>
> ⚠️ **Uma medição que contraria o passo 5:** o `unsubscribe()` do navegador vem **depois** do
> `DELETE` no servidor, não junto. Se desinscrever primeiro e o `DELETE` falhar, o backend fica
> com uma inscrição morta que o dispatcher vai tentar usar. Há teste para a ordem **e** para o
> caso "o `DELETE` falhou → o navegador **continua** inscrito" (2 acusadores).

1. **Feature-detect** antes de mostrar qualquer coisa:
   `'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window`.
2. `Notification.requestPermission()`.
3. `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey) })`.
4. `savePushSubscription(platform, subscription)`.
5. Desligar: `subscription.unsubscribe()` **e** `DELETE` no servidor — os dois, senão a
   inscrição fica órfã recebendo push.

Helpers locais: `ensureServiceWorkerRegistration()` e `urlBase64ToArrayBuffer()`.

Aviso de iOS na tela: no iPhone, push em PWA só funciona se o app foi **adicionado à tela de
início**. Sem isso o `PushManager` existe mas a permissão nunca é concedida — a tela precisa
dizer isso, ou a pessoa acha que está quebrado.

---

## 8. Dívida que NÃO vamos repetir

No projeto que serviu de referência, essa feature nasceu:

- com `prisma.$queryRaw` direto na rota e no scheduler, furando as camadas;
- sem port, sem fake e **sem um único teste**;
- com o modelo de dados existindo só na migration, sem passar pelo repository.

Aqui ela entra como qualquer outra fatia: **port + fake + UseCase testado**, repository
dono do SQL, e teste de `isInsideWindow`, da supressão de quem já leu e do claim idempotente.
Se a Tarefa 37 terminar sem esses três testes, ela não está pronta.
