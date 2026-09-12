# Tarefa 37 — `dispatchDueNotifications`: o lembrete que não cobra

> **A fatia mais pesada do MVP 3.** Ela é a única que decide, sozinha e sem ninguém olhando,
> mandar uma mensagem para o celular de uma pessoa. Tudo aqui é sobre **não mandar**: não
> mandar duas vezes, não mandar para quem já leu, não mandar quando não há o que ler.

## O que ler antes (nesta ordem)

1. `CLAUDE.md` — "Datas" (o parágrafo dos **dois** helpers) e "Arquitetura — camadas".
2. `docs/NOTIFICACOES.md` §5 e §6. ⚠️ **O §6 passo 3 foi CORRIGIDO** pelo orquestrador antes
   desta fatia começar — leia a caixa de correção inteira: o helper `dayRange` que ele citava
   **nunca existiu**, e a consulta que ele descrevia foi substituída pela decisão 2 do MVP 3.
3. `docs/adr/0006-luxon-so-no-backend.md` e `docs/adr/0008-updated-at-e-do-dominio.md`.
4. `docs/CONVENCOES-CODIGO.md` — §6.6 (limpeza de fixture CONSULTA o banco), §6.9 (o port
   cresce junto com a impl Prisma, na MESMA unidade), §7.1 (fidelidade do fake nos dois
   sentidos), §7.3 (contador de chamadas, nunca cronômetro), §7.4 (o antídoto), §7.8 (**um
   relógio só se prova CONTANDO leituras**), §7.9 (a guarda de vocabulário mora no catálogo).
5. `docs/tasks/36-settings-e-push-subscription.md` — de onde vêm o `PushSubscription`, o port
   e o fake que esta fatia consome.
6. `packages/backend/src/usecases/ports/` inteiro — o vocabulário uniforme dos ports.

## Objetivo, em uma frase

Um script chamado por cron externo acorda, descobre quem pediu para ser lembrado **agora** no
fuso de cada um, **cala a boca para quem já leu**, garante que ninguém receba duas vezes no
mesmo dia, e entrega a mensagem a um port de envio — que nesta fatia é um **fake**.

## Escopo

| Fica DENTRO | Fica FORA, e o motivo concreto |
| --- | --- |
| `dispatchDueNotifications` e a função pura `isInsideWindow` | `GROUP_ACTIVITY`. Ele **não passa pelo dispatcher** (`NOTIFICACOES.md` §6, último parágrafo): é disparado no mesmo UseCase que grava o `ActivityEvent`. É a Tarefa 38 |
| O modelo `NotificationDelivery` + migration + port + fake + repo, com o `claim` | Qualquer índice ou coluna "para o futuro". O modelo tem o que o `claim` precisa e nada mais |
| O port **`PushSender`** com **fake** | A implementação real com `web-push`. **Tarefa 38.** ⚠️ E o pacote `web-push` **não pode ser instalado nesta fatia** — ver regra 4 |
| O script de cron (`notifications:dispatch`) | O cron em si, e qualquer daemon dentro do processo Fastify. `NOTIFICACOES.md` §6: **não existe cron dentro do Fastify** |
| Luxon, **só em `packages/backend`**, com teste provando que `packages/shared` não o importa | Trocar o `local-day.ts` do `shared` por Luxon. Ele existe justamente para o PWA não empacotar Luxon (ADR 0006) |
| As chaves de i18n da mensagem, nos **dois** catálogos | A renderização no aparelho (título, ícone, clique). É o `push-handler.js`, Tarefa 38 |

## Decisões já tomadas (não reabra)

- **ADR 0006:** Luxon **só no backend**. O front calcula "que dia é hoje" com `Intl`.
- **ADR 0008 / §7.8:** o relógio é injetado, lido **uma vez**, e "uma vez" se prova
  **contando leituras** — nunca com cronômetro.
- **Decisão 2 do MVP 3:** o `ReadingLog` é ancorado em **`planItemId`**, não em data.
- **`NOTIFICACOES.md` §6:** a idempotência é por **claim no banco** (`INSERT … ON CONFLICT DO
  NOTHING`), não por lock e não por memória. É a **única** exceção de SQL explícito da feature,
  e vive **dentro do repository**.
- **`NOTIFICACOES.md` §8:** se esta fatia terminar sem os três testes — `isInsideWindow`, a
  supressão de quem já leu, e o claim idempotente — **ela não está pronta**.

## Decisões que eu assumi (auditável — discorde COM MEDIÇÃO)

| # | Decisão | Por quê |
| --- | --- | --- |
| A | ⚠️ **Não há aritmética de data em lugar nenhum**, e isso é uma propriedade a defender, não um detalhe | **Medido:** `ReadingPlanItem.date` é `CalendarDay` — a string `"YYYY-MM-DD"` — e `localDay(instant, timeZone)` devolve **exatamente essa forma**. Logo "o dia de hoje desta pessoa" casa com o item do plano por **igualdade de string**. Nenhum range, nenhum `startOf('day')`, nenhuma comparação de `Date`. Luxon entra só para saber **que horas são no fuso dela** (a janela), não para achar o dia |
| B | O dispatcher **não manda nada quando não há plano para hoje** — e isso conta como `skipped` | Sem item de plano não há trecho do dia: um lembrete ali seria "leia" sem dizer o quê. E é o estado normal do clube entre dois livros. **Não é erro e não vira log de erro** |
| C | A varredura começa pelo **`Settings` com `reminderEnabled`**, e a inscrição ativa é o **segundo** filtro | Quem não quer lembrete não deve nem ser considerado, e `reminderEnabled` é a expressão explícita do desejo da pessoa. Inscrição ativa é uma condição **técnica** (o aparelho existe?), e condição técnica não decide antes da vontade declarada |
| D | `windowMinutes` **padrão 10**, e o cron roda a cada 5 | `NOTIFICACOES.md` §6. A janela **maior** que o intervalo é o que absorve um atraso do cron; a janela é fechada à esquerda e aberta à direita (`>= 0 && < windowMinutes`) para que duas passadas seguidas não caiam nela — e o claim é quem garante isso mesmo se caírem |
| E | ⚠️ **O claim acontece ANTES do envio**, nunca depois | Se o envio viesse primeiro, uma falha entre enviar e gravar faria a próxima passada **enviar de novo**. Claim primeiro significa que a pior falha possível é um lembrete **perdido**, não um lembrete **repetido** — e num app cujo §1 é "não virar cobrança", repetir é o erro caro |
| F | `localDate` no claim é o dia **no fuso da pessoa**, e é `String` `"YYYY-MM-DD"` | Se fosse `@db.Date` ou instante, duas pessoas em fusos diferentes no mesmo instante teriam a mesma chave, ou a mesma pessoa teria duas. O `CalendarDay` já é a forma canônica do projeto |
| G | `NotificationDelivery.kind` é **`String` validado por `z.enum`**, não enum Prisma | É literalmente o que o `CLAUDE.md` manda, nomeando `NotificationDelivery.kind` entre os quatro campos dessa classe. A lista nasce com `READING_REMINDER` **e** `GROUP_ACTIVITY` — o segundo não tem chamador nesta fatia, mas é a **chave de idempotência** dele que faz a tabela ter sentido, e a Tarefa 38 já a usa |
| H | O texto da mensagem vem do **catálogo compartilhado**, no `Settings.locale` da pessoa | Não se escreve português cru no backend (`CLAUDE.md`). E o `locale` está ali para isto: o lembrete é a **única** coisa do sistema que chega sem a pessoa abrir a tela, então é a única que não pode perguntar ao i18n do navegador |
| I | O `PushSender` recebe o payload **já pronto** — o dispatcher decide, o sender entrega | Fronteira de camada: se o sender montasse a frase, a regra anti-culpa ficaria dentro do adaptador de rede, onde nenhum teste de UseCase a alcança |
| J | ⚠️ **A tabela NÃO tem FK para `ReadingPlanItem`** | De propósito, e é o que mantém a guarda estrutural da Tarefa 34b verde **sem uma linha de mudança**. O claim é por **dia de calendário no fuso da pessoa**, não por item de plano: um vínculo com o plano faria a chave mudar quando o admin editasse o plano, e o lembrete sairia duas vezes. **Diga isso no comentário do modelo**, como o `PushSubscription` diz |

## As regras

1. **TDD estrito, outside-in.** Comece pelo `isInsideWindow` — função pura, sem Luxon na
   assinatura de entrada se você conseguir, e com o maior número de casos da fatia.
2. ⚠️ **Um relógio só, e prove CONTANDO** (§7.8 / ADR 0008). O `now` é injetado com valor
   padrão; o teste que prova "uma leitura" é um relógio que **incrementa um contador a cada
   leitura** e asserta `reads === 1` — nunca um cronômetro, nunca "os dois instantes são
   parecidos". ⚠️ E num dispatcher isso importa mais que no resto do projeto: com duas
   leituras, uma pessoa perto da virada da janela entra pela primeira e sai pela segunda.
3. ⚠️ **§6.9 — todo port que crescer cresce com a implementação Prisma NA MESMA UNIDADE.**
   Esta fatia faz crescer pelo menos dois (o de `Settings`, que hoje só tem `save`/`byUserId`,
   e o de `ReadingPlanItem`, que hoje só acha por livro). Deixar o port crescer sozinho
   **deixa o typecheck vermelho em arquivos que você não abriu** — já aconteceu neste projeto.
4. ⚠️ **`web-push` NÃO pode ser instalado.** O `PushSender` é uma interface com um fake. Se
   você sentir falta do pacote, é sinal de que escorregou para a Tarefa 38: **pare e reporte**.
5. ⚠️ **Luxon entra como dependência de `packages/backend` e SÓ dele.** Escreva o teste que
   prova que `packages/shared` não o importa — varredura de código, com **antídoto** (§7.4:
   uma varredura que não acha nada e passa é asserção vazia; prove que ela fica vermelha
   plantando um import). ⚠️ E ela tem de pegar o import **transitivo**, não só o literal
   `from 'luxon'`: o furo real é `shared` importar um módulo que importa Luxon.
6. A janela é `>= 0 && < windowMinutes` (decisão D). Teste os **quatro** limites: um minuto
   antes do horário (fora), no minuto exato (dentro), no último minuto da janela (dentro), no
   primeiro minuto depois (fora). Limite aberto e fechado testados **dos dois lados** — meia
   janela testada é meia janela.
7. ⚠️ **Horário de verão, e ele não é hipótese:** `America/Sao_Paulo` já teve DST e pode ter de
   novo, e o projeto tem usuário em um fuso só **hoje**. Teste pelo menos um fuso que
   **ainda** tem DST (ex.: `America/New_York` ou `Europe/Lisbon`) no dia em que o relógio pula
   — inclusive a hora que **não existe** (o salto para a frente) e a que **acontece duas
   vezes** (o salto para trás). ⚠️ A hora repetida é o caso em que a janela casa **duas vezes**
   no mesmo dia local: quem impede o lembrete dobrado é o **claim**, e é isso que o teste tem
   de mostrar — não a janela.
8. A supressão anti-culpa é: `localDay(now, settings.timezone)` → o `ReadingPlanItem` **daquele
   dia** → existe `ReadingLog` do par `(planItemId, userId)`? Se existe, **não manda**.
   ⚠️ **Nenhuma aritmética de data** (decisão A) — a comparação é de string, e um teste deve
   ficar vermelho se alguém trocar por comparação de `Date`.
9. Sem item de plano para hoje → `skipped` (decisão B), silencioso. **Não** é erro, **não** vai
   para log de erro, e **não** manda lembrete vazio.
10. ⚠️ **O claim vem ANTES do envio** (decisão E). Escreva o teste que prova a ordem
    **contando chamadas**: com o claim recusando, o `PushSender` recebe **zero** chamadas. E o
    inverso: um envio que falha **não desfaz** o claim — o lembrete daquele dia está gasto, e
    isso é deliberado.
11. O `claim(userId, kind, localDate)` é o **único** SQL explícito da feature, e vive **dentro
    do repository** (`NOTIFICACOES.md` §6). Não na rota, não no scheduler, não num
    `$queryRaw` solto. Ele devolve se conseguiu — `true`/`false`, não a linha.
12. ⚠️ **O fake do `NotificationDelivery` tem de recusar o segundo claim igual**, senão ele é
    mais permissivo que o banco e todo teste de idempotência passa por acidente (§7.1). E o
    **contrato** contra o Prisma real é quem prova que o `ON CONFLICT` está lá: rode dois
    claims iguais e exija `true` depois `false`.
13. ⚠️ **Duas instâncias do dispatcher ao mesmo tempo** é o caso que o claim existe para
    resolver. O contrato deve tentar isso de verdade (dois claims concorrentes, `Promise.all`)
    e exigir **exatamente um** `true`. Um teste sequencial não prova concorrência.
14. O resultado é `{ considered, sent, disabled, skipped }`, e os quatro têm de **fechar a
    conta**: escreva o teste que asserta que `sent + skipped` mais os suprimidos é igual a
    `considered`. Contador que não fecha é contador que mente no log do dono.
15. ⚠️ **A mensagem não cobra** (§1 do plano). Nada de "você não leu", "faltam N dias", "você
    está atrasada", nem contagem de coisa alguma. Ela diz **o trecho de hoje**, em primeira
    pessoa e sem régua. As chaves novas entram nos **dois** catálogos e, portanto, na varredura
    `GUILT_TERMS` — confira que entram de fato (§7.9: a guarda mora no catálogo e cobre os dois
    idiomas), e que a varredura ficaria **vermelha** com uma frase de cobrança.
16. O script de cron é um `script` do `package.json` do backend (`notifications:dispatch`).
    ⚠️ Ele **imprime o resultado e sai com código 0 mesmo sem ninguém a lembrar** — um script
    de cron que sai diferente de 0 em dia normal enche a caixa do dono de alerta falso, e o
    alerta que sempre toca é o alerta que ninguém lê.
17. ⚠️ **`NotificationDelivery` não aponta para `ReadingPlanItem`** (decisão J). Depois da
    migration, rode `plan-item-fk-guards.test.ts` e confirme que ele continua verde **pelo
    motivo certo** — leia o schema, não só o verde.
18. Migration **só via Prisma** (`prisma migrate dev --name <nome>`), nunca SQL à mão.
19. ⚠️ **A limpeza de fixture CONSULTA o banco** (§6.6), e a ordem das FKs importa: a tabela
    nova referencia `User`. Uma fixture órfã aqui estoura a limpeza do dono no `COMO-TESTAR.md`
    §8 — e isso já aconteceu nesta sessão (o incidente da Tarefa 34, 261 eventos vazados).
20. Contador canônico de linhas em todo arquivo novo, no docblock. Se o `scheduler.ts` passar
    de ~200 linhas, **divida antes de entregar**: o candidato óbvio é a seleção de candidatos
    (quem é considerado), que é separável da decisão (manda ou não manda).

    > ⚠️ **A PRIMEIRA METADE DESTA REGRA ESTAVA ERRADA, e o revisor a pegou.** "Contador no
    > docblock" é convenção de **tela** — ela só existe em `packages/app/src/pages/*`, e
    > **nenhum** arquivo de backend a segue. O executor seguiu a precedência do backend e
    > estava certo; cobrar dele o contrário teria espalhado uma convenção de um pacote para
    > outro sem ninguém decidir isso. A metade que vale é a **substantiva** — dividir antes de
    > doer —, e ela foi cumprida com folga: o maior arquivo de produção da fatia tem **90**
    > linhas, e o `scheduler` já nasceu dividido do `reminder-candidates`.
    >
    > Regra corrigida: **o contador vai ao docblock nas telas; no backend, medir e reportar,
    > sem escrever no arquivo.**
21. Gates, todos, com os números colados:
    ```
    pnpm -r test          # baseline: shared 575 · ui 195 · backend 1684 · app 665
    pnpm -r typecheck
    pnpm lint
    pnpm prettier --check .
    pnpm --filter @clube/app build     # chunk de entrada em BYTES (teto 450.000)
    pnpm -r test:integration           # baseline 581
    ```
    ⚠️ **O chunk é o gate que diz se o ADR 0006 foi respeitado**: se Luxon vazou para o
    `shared`, ele sobe muito. Cole o número.

## Arquivos

**A tocar:** `packages/backend/prisma/schema.prisma` (o modelo novo) + a migration gerada pelo
Prisma · `packages/backend/src/notifications/scheduler.ts` (novo) ·
`packages/backend/src/usecases/ports/notification-delivery-repository.ts` e
`push-sender.ts` (novos) · os fakes correspondentes · o repo Prisma + contrato · os ports de
`Settings` e `ReadingPlanItem` **com as impls Prisma juntas** (§6.9) · os dois catálogos ·
`packages/backend/package.json` (o script + Luxon) · os testes.

**A NÃO tocar:** `packages/app/**` · `packages/ui/**` · `packages/shared/src/local-day.ts`
(ele existe para o PWA não empacotar Luxon) · qualquer `.env` · `prisma/migrations/` à mão ·
`docs/**` (é do orquestrador).

## Definição de pronto

- [x] Os **três** testes que o `NOTIFICACOES.md` §8 exige existem e mordem: `isInsideWindow`,
      a supressão de quem já leu, e o claim idempotente.
- [x] Os quatro limites da janela testados, mais os dois casos de DST (a hora que não existe e
      a que acontece duas vezes), com o claim mostrando que a repetida não dobra o lembrete.
- [x] Claim antes do envio, provado por **contagem** (claim recusado → zero chamadas ao
      sender); envio que falha **não** desfaz o claim.
- [x] Concorrência real no contrato: dois claims simultâneos, exatamente um `true`.
- [x] `{ considered, sent, disabled, skipped }` fecham a conta, com teste.
- [x] Um relógio só, provado **contando** leituras.
- [x] Luxon só no backend, com teste que pega import **transitivo** e tem antídoto.
- [x] Nenhuma aritmética de data: a comparação de dia é igualdade de `CalendarDay`.
- [x] `web-push` **não** instalado. `PushSender` é port + fake.
- [x] `plan-item-fk-guards.test.ts` verde, e você leu o schema para saber por quê.
- [x] Seis gates verdes com números colados, chunk em bytes, e o **banco provado limpo por
      consulta** depois da integração.
