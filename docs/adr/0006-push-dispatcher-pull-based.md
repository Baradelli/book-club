# ADR 0006 — Push: dispatcher pull-based com idempotência por claim no banco

- Status: aceito — ⚠️ **com uma segunda variante de deploy registrada em 2026-09-17**
  (Tarefa 38f, no fim deste arquivo): `node-cron` **dentro** do Fastify, atrás de
  `NOTIFICATIONS_CRON=on`. A decisão abaixo **não muda**; o que mudou foi um dos três
  argumentos contra ela deixar de valer.
- Data: set/2026
- Fase: MVP 3 (Bloco I — Push)

## Contexto

Duas notificações precisam sair: o **lembrete de leitura**, num horário escolhido por cada
pessoa e no fuso dela, e a **atividade do grupo**, imediata. Cada pessoa tem seu
`reminderTime` e seu `timezone`, então "o horário de enviar" não é um instante único — são
tantos quantos houver usuários.

O lembrete precisa sair **uma vez por dia**, e nunca duas, mesmo que o processo reinicie,
mesmo que existam duas instâncias do backend, mesmo que o agendador rode de minuto em minuto.

## Decisão

**Não existe cron dentro do processo do Fastify.** Um script (`notifications:dispatch`) é
chamado por **cron externo** a cada 5–10 minutos e executa:

```ts
dispatchDueNotifications({ now, windowMinutes = 10 })
  : { considered, sent, disabled, skipped }
```

Três mecanismos sustentam a decisão:

1. **Janela de tolerância, não igualdade de horário.** Um pulso é devido quando
   `0 <= minutosDepoisDoAlvo < windowMinutes`, com o "agora local" calculado com Luxon no
   `Settings.timezone` da pessoa. Assim o cron pode atrasar sem perder o disparo, e não
   dispara antes da hora.
2. **Idempotência por claim no banco**, não por lock nem memória:

```sql
INSERT INTO "NotificationDelivery" ("id","userId","kind","localDate","deliveredAt")
VALUES ($1,$2,$3,$4,$5)
ON CONFLICT ("userId","kind","localDate") DO NOTHING
RETURNING "id"
```

`localDate` é `YYYY-MM-DD` **no fuso do usuário**. Nada retornado = já foi enviado hoje →
`skipped++`. Esse `INSERT` vive **dentro do repository** de `NotificationDelivery`
(`claim(userId, kind, localDate)`), não na rota nem no scheduler.

3. **Supressão anti-culpa:** se a pessoa já registrou o `ReadingLog` da leitura de hoje, o
   lembrete **não** é enviado.

`GROUP_ACTIVITY` **não** passa pelo dispatcher — sai no mesmo UseCase que grava o
`ActivityEvent`, para os membros ativos do clube menos o autor, com um debounce curto.

Inscrição morta (`WebPushError` 404/410) é desativada de forma **soft** (`disabledAt`);
qualquer outro erro é relançado.

## Alternativas consideradas

- ~~**`node-cron` / `setInterval` dentro do Fastify.**~~ Zero infraestrutura extra e o timer
  vive onde já há acesso ao banco. Mas: o agendamento morre com o processo (deploy no meio do
  horário = ninguém é lembrado); com duas instâncias, todo mundo recebe duas notificações; e
  não há registro de "já enviei" — a idempotência ficaria na memória do processo, que é
  exatamente o que reinicia. Precisaria do claim no banco de qualquer forma, e então o timer
  interno não paga por si.
  ⚠️ **RECUSA REVISTA em 2026-09-17 (Tarefa 38f): virou a VARIANTE 2, no fim deste arquivo.**
  Dois dos três argumentos caíram quando o claim no banco foi entregue, e o parágrafo fica
  riscado no título e inteiro no corpo porque é ele que explica **por que a variante só pôde
  existir depois da Tarefa 37**.
- **Uma fila de jobs (BullMQ + Redis) com job agendado por usuário.** É a resposta "certa"
  para escala: retry, agendamento preciso, observabilidade. Custa um Redis, uma biblioteca,
  um worker e um modelo mental novo — para um app de um punhado de usuários por clube. E o
  problema de idempotência continua existindo (job pode rodar duas vezes).
- **Um serviço externo de agendamento (cron gerenciado chamando um endpoint HTTP).** É
  compatível com esta decisão — o script pode virar uma rota protegida. Fica registrado como
  variante de deploy, não como arquitetura diferente. **(É a VARIANTE 1; a 2 chegou depois.)**
- **Comparar o horário exato (`localNow.toFormat('HH:mm') === reminderTime`).** Só funciona se
  o cron rodar de minuto em minuto e nunca atrasar. Um atraso de 30 segundos perde o dia
  inteiro, silenciosamente.

## Consequências

- (+) Reiniciar, fazer deploy ou rodar duas instâncias não duplica nem perde notificação.
- (+) O disparo é testável sem relógio real: `dispatchDueNotifications` recebe `now` por
  parâmetro, e `isInsideWindow` é uma função pura. É onde vai o TDD pesado da Tarefa 37.
- (+) Fuso por usuário sai de graça: o cálculo é local a cada linha de `Settings`.
- (+) `NotificationDelivery` é também o histórico do que foi enviado — dá para auditar.
- (−) ~~Depende de um cron externo configurado no deploy.~~ **Depende de alguém agendar a
  passada** — por cron externo, ou, desde 2026-09-17, pela **variante 2** abaixo
  (`NOTIFICATIONS_CRON=on`, que agenda dentro do próprio processo). Se ninguém fizer nenhuma
  das duas, nenhum lembrete sai — e o app não avisa. Mitigação: o script loga o resultado em
  JSON, **a variante 2 escreve no boot uma linha dizendo se ligou e se há VAPID**, e o
  `SETUP.md` registra as duas formas como passo de deploy.
- (−) A precisão é da ordem da janela (até ~10 min de atraso). Para um lembrete de leitura,
  irrelevante.
- (−) Uma tabela extra (`NotificationDelivery`) que só cresce. Limpeza periódica fica em
  aberto; o volume é de uma linha por usuário por tipo por dia.

## ⚠️ VARIANTE 2 (2026-09-17, Tarefa 38f) — `node-cron` dentro do Fastify, atrás de uma chave

**Isto NÃO emenda a decisão acima.** A decisão continua sendo *"o disparo é uma passada
pull-based, idempotente por claim no banco, com janela de tolerância"* — e é exatamente ela
que esta variante usa. O que muda é **quem chama a passada**, que este ADR já tratava como
questão de deploy (a variante 1, acima).

**Por que ela pôde existir agora**, argumento por argumento da recusa original, relidos
contra o que a Tarefa 37 entregou:

| argumento original contra o cron interno | estado em 2026-09-17 |
| --- | --- |
| *"o agendamento morre com o processo"* | ✅ **continua valendo, e foi aceito conscientemente** — se a API está fora do ar no horário de alguém, essa pessoa não é lembrada naquele dia |
| *"com duas instâncias, todo mundo recebe duas notificações"* | ❌ **caiu** — o claim (`INSERT ... ON CONFLICT DO NOTHING`) torna isso impossível, e ele foi entregue |
| *"a idempotência ficaria na memória do processo"* | ❌ **caiu pelo mesmo motivo** — a idempotência está no banco, não no processo |

O fecho da recusa era *"precisaria do claim no banco de qualquer forma, e então o timer
interno não paga por si"* — **argumento de custo, não de correção**. O claim está pago.

**O que a mantém sendo variante, e não arquitetura nova:** a chave de ambiente
**`NOTIFICATIONS_CRON`**. Só a string `on` liga; a ausência e qualquer outro valor deixam
desligado, que é o padrão **seguro**. Num deploy com duas instâncias, deixe desligada e use a
variante 1 — **sem tocar uma linha de código**.

Como ela é feita:

- `notifications/reminder-cron.ts` decide (portão da chave · a expressão `*/5` · a rejeição
  que não escapa · **uma passada por vez**) e **não conhece `node-cron`, nem Prisma, nem
  VAPID** — o agendador entra por parâmetro, e por isso tudo isso é decidível em teste **sem
  relógio real**.
- `http/main.ts` é a **única** linha do projeto que amarra o `node-cron`, do mesmo jeito que
  `dispatch-main.ts` é a única que amarra o Prisma ao script.
- **Sem `timezone` no agendador, de propósito:** "de cinco em cinco minutos de toda hora" casa
  os mesmos instantes em qualquer fuso (todo deslocamento real é múltiplo de 15 min) —
  medido no teste contra `Asia/Kathmandu` (UTC+05:45). O fuso do lembrete se decide onde
  sempre se decidiu: no `Settings.timezone` de cada pessoa, com Luxon, dentro do
  `scheduler.ts`.
- A janela de tolerância continua sendo o dobro do intervalo (10 min contra 5), pelo mesmo
  motivo do texto acima: uma passada perdida ainda tem a seguinte dentro da janela.
