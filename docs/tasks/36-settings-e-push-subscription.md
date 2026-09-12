# Tarefa 36 — `Settings` de notificação + `PushSubscription` (backend)

> **A abertura do Bloco I, e o bloco traz DUAS famílias de risco que os MVPs 1 e 2 não
> tinham: segredo e efeito externo.** Esta fatia toca a primeira (as chaves VAPID) e **não**
> toca a segunda — nenhum push é enviado aqui.
>
> ⚠️ **FATIA DIVIDIDA:** esta é o **backend**; a tela mínima de preferências e o "ativar no
> aparelho" são a **36b**. O motivo é o mesmo medido na 32: a irmã do MVP 2 (Tarefa 24,
> Prisma + rotas) custou **4.324 inserções em 16 arquivos** *sem* tela.
>
> Leia antes: **`docs/NOTIFICACOES.md` §3 e §4** (a configuração VAPID e o contrato — **não
> improvise em cima dela**) · `docs/adr/0006` · `CLAUDE.md` ·
> `docs/CONVENCOES-CODIGO.md` **§6 inteiro** (§6.1 `response` é fronteira de segurança ·
> §6.3 tenant do JWT · §6.6 limpeza que **consulta o banco** · **§6.9** o port cresce com o
> Prisma na mesma unidade) · **§7.1**, **§7.3**, **§7.4**.
>
> **Os vizinhos:** `src/domain/settings.ts` + `usecases/ports/settings-repository.ts` +
> `_fakes/settings-repository-fake.ts` + `repositories/prisma-settings-repository.ts`
> (⚠️ **tudo isso JÁ EXISTE desde a Tarefa 03** — ver a medição abaixo) ·
> `src/repositories/prisma-activity-event-repository.ts` + contrato (a fatia irmã mais
> recente) · `src/routes/activity-routes.ts` (o molde de rota mais novo) ·
> `packages/shared/src/activity.ts`.

## ⚠️ O que eu medi antes de escrever esta spec

1. **Metade do `Settings` está entregue desde a Tarefa 03**, com **exatamente** as colunas que
   o MVP 3 precisa: `timezone`, `locale`, `reminderTime` ("HH:mm", validado por regex no Zod),
   `reminderEnabled`, `notifyGroupActivity`. Existem o modelo Prisma, a entidade, o
   `DEFAULT_SETTINGS`, o port (`save` · `byUserId`), o fake com suíte própria, o repositório
   Prisma e o teste de contrato. **E o `acceptInvite` já cria o `Settings` da pessoa.**
2. **O que NÃO existe:** nenhum UseCase que **leia** ou **atualize** o `Settings`, nenhuma
   rota, nenhuma tela. O `/me` **não** devolve o fuso (lacuna registrada na Tarefa 16).
3. **O `PushSubscription` é inteiro novo** — nada dele existe.
4. ⚠️ **As chaves VAPID já estão no `.env.example` como placeholder VAZIO** (`VAPID_PUBLIC_KEY=`
   e `VAPID_PRIVATE_KEY=`), o `.gitignore` cobre `.env` e `.env.*` com exceção do
   `.env.example`, e **nenhum `.env` real tem valor**. Logo `getVapidConfig()` devolve `null`
   e **a feature nasce desligada** — que é exatamente o caminho limpo do `NOTIFICACOES.md` §3.
5. **`web-push` NÃO é dependência de nenhum pacote**, e **não precisa ser nesta fatia**: o
   envio é a Tarefa 38. Aqui só se **lê** configuração e se **guarda** inscrição.

## Objetivo

O clube consegue guardar minha preferência de lembrete e a inscrição deste aparelho — e o
projeto continua rodando inteiro para quem nunca configurou VAPID.

## Escopo enxuto

**Entra:** `getSettings`/`updateSettings` + rota; o `PushSubscription` inteiro (modelo,
migration, port, fake, repo, contrato, rotas de subscribe/unsubscribe); e
`GET /notifications/config` com o `null` que **desliga a feature limpo**.

| Fora | Por quê |
| --- | --- |
| **A tela de preferências e o "ativar no aparelho"** | É a **36b**. Medido acima. |
| ⚠️ **Enviar push / `sendPushToUser` / o port `PushSender`** | É a **Tarefa 38**. Esta fatia **não produz efeito fora da máquina** — e isso é uma escolha de segurança, não de escopo. |
| `dispatchDueNotifications` e o `NotificationDelivery` | É a **Tarefa 37**. |
| ⚠️ **`web-push` como dependência** | Só a 38 precisa. Instalar agora traria a biblioteca de efeito externo para dentro de uma fatia que não a usa. |
| Luxon | Tarefa 37, e **só** em `packages/backend`. |
| `POST /notifications/test` | `NOTIFICACOES.md` §4 o lista, mas ele **envia** — é a 38. |
| O `/me` devolver o fuso | A lacuna da Tarefa 16 é real, mas o front usa o fuso do **navegador**, que é o certo para "hoje para quem está olhando". Quando a tela expuser a escolha explícita (36b), ela vence. **Registre, não implemente.** |

## Decisões já tomadas (não reabrir)

- **Migration SEMPRE via Prisma**, nunca SQL à mão.
- ⚠️ **`getVapidConfig()` devolvendo `null` DESLIGA a feature inteira, limpo**: as rotas
  respondem `{ enabled: false }`, a tela esconde o toggle, o dispatcher não faz nada. **Ninguém
  precisa de VAPID configurado para rodar o projeto.** → `NOTIFICACOES.md` §3.
- ⚠️ **A chave PÚBLICA pode chegar ao front; a PRIVADA nunca sai do backend.** →
  `NOTIFICACOES.md` §4.
- **`PushSubscription.platform` é `String` validado por `z.enum`**, não enum Prisma. →
  `CLAUDE.md`.
- **Desativação de inscrição é SOFT** (`disabledAt`), e o `POST` reativa (`disabledAt = null`).
  → `NOTIFICACOES.md` §4.
- **`response` schema é fronteira de segurança** (§6.1); enumere os status.
- **Tenant do JWT, spread antes** (§6.3). **Nenhum handler aceita `userId` do corpo.**
- **Nenhum acesso a banco fora de um Repository.**

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | ⚠️ **O `Settings` é do USUÁRIO, não do clube — e não passa pelo `assertMembership`** | Ele é `unique(userId)` desde a Tarefa 03 e não tem `clubId`. O corte aqui é **o próprio JWT**: você só lê e escreve o **seu**. ⚠️ **Isso é diferente de todo o resto do projeto**, e por isso precisa de teste explícito: não há `clubId` na rota, e **nenhum input aceita `userId`**. |
| B | ⚠️ **`getSettings` devolve o `DEFAULT_SETTINGS` quando a linha não existe, sem criar** | O `acceptInvite` cria, mas o super-admin do seed **não tem** `Settings` (ele não aceitou convite). Ler não deve escrever — uma leitura que cria linha é efeito colateral escondido, e quebraria a idempotência de um `GET`. O `updateSettings` é que cria se faltar (upsert). |
| C | **`updateSettings` aceita PATCH parcial** — só os campos que vieram | A tela mínima da 36b mexe em três campos de cinco. Exigir o objeto inteiro faria a tela mandar `timezone` e `locale` que ela não edita, e um dia sobrescrever com valor velho. |
| D | ⚠️ **`reminderTime` é validado no DOMÍNIO, não só na borda** | O regex `HH:mm` já existe no Zod da borda (Tarefa 03), mas a borda é a **primeira** barreira, não a única — o mesmo argumento do `assertHighlightColor`. E o dispatcher da 37 vai fazer `split(':')` nele: um valor torto ali é `NaN` na janela. |
| E | **`PushSubscription` tem `unique(endpoint)`**, e o `POST` é upsert por ele | O `endpoint` **é** a identidade da inscrição no protocolo Web Push. Dois registros do mesmo endpoint fariam o mesmo aparelho receber duas vezes. |
| F | ⚠️ **A inscrição carrega `userId`, e o `clubId` NÃO existe nela** | Push é da **pessoa**, não do clube: a mesma pessoa em dois clubes tem um aparelho. Pôr `clubId` obrigaria a decidir "qual clube" num dado que não tem clube. |
| G | ⚠️ **`GET /notifications/config` responde `{ enabled: false, vapidPublicKey: null }` quando não há chave** — e **200**, não 404 | É o contrato do `NOTIFICACOES.md` §4. Um 404 faria a tela tratar "não configurado" como erro; o 200 com `enabled: false` é o que deixa a tela esconder o toggle sem drama. |
| H | ⚠️ **A chave privada tem TESTE provando que ela não sai** | `packages/shared` é **empacotado no PWA**, e a `notificationConfigResponseSchema` declara só `vapidPublicKey`. O §6.1 já corta campo não declarado — mas isto é segredo, e segredo merece asserção própria: um teste que prove que a resposta **não** contém a privada, e outro que prove que ela **não** aparece em `packages/shared`. |
| I | **O `disabledAt` é o único campo mutável da inscrição** | O patch é tipo próprio (§7.1.1), não `Partial<PushSubscription>`: nada de trocar `endpoint`, `userId` ou as chaves por update. |

## Regras (o que os testes provam)

### `Settings`

1. `getSettings({ actorUserId })` devolve o `Settings` da pessoa; **sem linha, devolve o
   `DEFAULT_SETTINGS`** e **não escreve** — provado por **contagem** (`saveCalls === 0`), não
   por resultado (§7.3).
2. `updateSettings` aceita **patch parcial** e preserva o que não veio — provado por
   **snapshot antes/depois** (§7.6), não por `toBe` de campo escolhido à mão.
3. `updateSettings` **cria** a linha quando não existe (o caso do super-admin do seed).
4. ⚠️ **`reminderTime` inválido é recusado no domínio** (`"25:00"`, `"9:00"`, `"21:5"`,
   `""`, `"abc"`), e a borda também o recusa. Os dois.
5. ⚠️ **Ninguém lê nem escreve o `Settings` de outra pessoa**: o input **não tem** `userId`, e
   o contrabando é testado com o **ator legítimo**, assertando a linha gravada (§7.5).
6. `GET /me/settings` → **200**; `PATCH /me/settings` → **200** com o estado novo.

### `PushSubscription`

7. Modelo com `id`, `userId`, `platform`, `endpoint`, `p256dh`, `auth`, `userAgent?`,
   `disabledAt?`, `createdAt` — e **nada mais**, lido do `information_schema`.
8. Migration gerada por **`prisma migrate dev --name push_subscription`**.
9. `@@unique([endpoint])` e `@@index([userId])`, lidos do catálogo do Postgres; FK
   `onDelete: Restrict` explícita. ⚠️ **E ela NÃO aponta para `ReadingPlanItem`** — confirme
   que a guarda estrutural da 34b continua verde e **diga por quê**.
10. `POST /notifications/subscriptions` é **upsert por `endpoint`** e **reativa**
    (`disabledAt = null`) quando a inscrição voltou.
11. `DELETE /notifications/subscriptions` é **soft** (`disabledAt = now`), e é **idempotente**.
12. ⚠️ **Ninguém desativa a inscrição de outra pessoa** — a busca é por
    `(endpoint, actorUserId)`, como a decisão E da Tarefa 30. ⚠️ **E aqui o mutante do §7.5 é o
    do fallback** (`?? req.user.sub`): meça-o, porque na Tarefa 30 ele passou em 1377/1377.
13. Contrato contra o Postgres: `save` (upsert por endpoint), `byUserId` (só as **ativas**),
    `disable`. ⚠️ Limpeza que **consulta o banco** (§6.6), com prefixo próprio.

### ⚠️ O segredo

14. ⚠️ **`GET /notifications/config` responde `{ enabled: false, vapidPublicKey: null }` sem
    chave configurada** (G), com **200**.
15. ⚠️ **Com chave configurada, responde a PÚBLICA — e a resposta NÃO contém a privada.**
    Teste com um **par de fixture gerado na hora e descartado**, nunca uma chave real.
16. ⚠️ **A privada não aparece em `packages/shared`** — um teste na família do
    `no-browser-globals.test.ts`, varrendo a fonte, com o **antídoto** do §7.4 (varredura vazia
    **falha**).
17. ⚠️ **O `.env.example` continua com as chaves VAZIAS.** Um teste que leia o arquivo e prove
    que `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` não têm valor. Se um dia alguém colar uma
    chave lá, isto fica vermelho.

### Transversais

18. Nenhuma classe de erro nova, ou mapeada no mesmo commit (`NOT_YET_MAPPED` é `[]`).
19. ⚠️ **`packages/app` e `packages/ui` INTOCADOS**; `packages/shared` cresce os schemas —
    **cole quanto o chunk subiu** (era **421.232 B**, teto 450.000, folga **28.768**).
20. ⚠️ **A integração roda, e é você quem a roda.** Baseline **491**. Cole o número, a prova
    por consulta de que nenhum fixture sobrou, o super-admin intacto e
    `PushSubscription` em **0**.

## Arquivos a tocar

```
packages/backend/prisma/schema.prisma                      + model PushSubscription
packages/backend/prisma/migrations/<gerada>/migration.sql  GERADA
packages/backend/src/domain/settings.ts                    + a validação do reminderTime (D)
packages/backend/src/domain/push-subscription.ts           NOVO
packages/backend/src/domain/__tests__/                     crescer
packages/backend/src/notifications/vapid.ts                NOVO — o getVapidConfig
packages/backend/src/notifications/__tests__/              NOVO
packages/backend/src/usecases/{get-settings,update-settings}.ts        NOVOS
packages/backend/src/usecases/{save-push-subscription,disable-push-subscription}.ts  NOVOS
packages/backend/src/usecases/ports/push-subscription-repository.ts    NOVO
packages/backend/src/usecases/_fakes/push-subscription-repository-fake.ts  NOVO
packages/backend/src/usecases/__tests__/ e _fakes/__tests__/           crescer
packages/backend/src/repositories/prisma-push-subscription-repository.ts   NOVO
packages/backend/src/repositories/__tests__/                crescer + _db.ts
packages/backend/src/routes/{settings,notification}-routes.ts  NOVOS
packages/backend/src/routes/__tests__/                      NOVOS
packages/backend/src/http/{repositories,server}.ts          registrar
packages/shared/src/notification.ts                         NOVO — os schemas do §4
packages/shared/src/index.ts + __tests__/                   o export e os pinos
```

**Não tocar:** `packages/app/**` · `packages/ui/**` · `docs/**` · qualquer `package.json`
(⚠️ **nenhuma dependência nova**) · `.env` de verdade (⚠️ se precisar de chave para teste,
gere par de **fixture** na hora e descarte).

## ⚠️ Segurança desta fatia — ela é a primeira que toca SEGREDO

- **As chaves VAPID vivem SÓ no `.env`** (ignorado) **e no `.env.example` como placeholder
  VAZIO, nunca com valor.**
- ⚠️ **Você NÃO gera, NÃO escreve e NÃO cola chave real em relatório.** Quem precisar de par
  para teste **gera na hora e descarta** — e o par de fixture **não vai para o disco**.
- ⚠️ **Se um segredo aparecer num diff, PARE E REPORTE.** Não commite e não "conserte"
  reescrevendo histórico.
- **`prisma migrate dev --name push_subscription`** é o único comando de migration autorizado.
  Nunca `migrate reset`, nunca `db push`, nunca SQL à mão.
- **NUNCA `deleteMany({})`.** Fixture com prefixo próprio, limpeza que **consulta o banco**.
- O banco tem um **super-admin do seed** — prove por consulta que ele continua lá.

## Definição de pronto

- [x] `getSettings` devolve o padrão sem escrever, provado por **contagem** (1); patch parcial
      por **snapshot** (2); cria quando falta (3).
- [x] ⚠️ `reminderTime` recusado **no domínio e na borda** (4).
- [x] ⚠️ Ninguém lê nem escreve o `Settings` alheio, com contrabando pelo **ator legítimo** (5).
- [x] Modelo e índices lidos do **catálogo** (7, 9); migration **gerada pelo Prisma** (8).
- [x] Upsert por `endpoint` que **reativa** (10); `DELETE` soft e idempotente (11).
- [x] ⚠️ **O mutante do fallback do §7.5 medido** na desativação (12).
- [x] ⚠️ **`{ enabled: false }` sem chave, com 200** (14); **a privada não sai na resposta**
      (15); **não aparece em `packages/shared`**, com antídoto (16); **`.env.example` com as
      chaves vazias, provado por teste** (17).
- [x] ⚠️ A guarda estrutural da 34b **continua verde**, e o relatório diz **por quê** (9).
- [x] `pnpm -r test`, `typecheck`, `lint` (⚠️ **`pnpm lint` na raiz**), `prettier --check .`,
      `build` limpos — baseline **480** shared · **195** ui · **1548** backend · **665** app.
- [x] ⚠️ **Integração rodada por você** (era **491**) + banco limpo + super-admin intacto +
      `PushSubscription` em **0**.
- [x] ⚠️ `git status -- packages/app packages/ui` **vazio**; chunk colado (19).
- [x] ⚠️ **Nenhuma chave real em lugar nenhum** — nem no disco, nem no relatório.
- [x] **Linhas coladas** (contador canônico — o comando do docblock de `acervo.tsx`, **sem
      variantes**).
- [x] ⚠️ O **vermelho colado** das regras 1, 4, 5, 12, 15 e 17.
