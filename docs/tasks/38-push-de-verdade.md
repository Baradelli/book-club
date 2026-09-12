# Tarefa 38 — O push de verdade: `GROUP_ACTIVITY`, o service worker e o `PushSender`

> **A última fatia do MVP 3, e a única que pode quebrar o que já está entregue.** Ela mexe no
> service worker — a peça que serve o app inteiro — e liga, pela primeira vez, um efeito que
> sai da máquina. Tudo aqui é sobre **não estragar**: não quebrar o PWA, não vazar a chave
> privada, não ligar o envio sem o dono saber.

## O que ler antes (nesta ordem)

1. `CLAUDE.md` — "Stack" (o parágrafo do PWA) e "Arquitetura — camadas".
2. `docs/NOTIFICACOES.md` **inteiro** — §2 (o service worker, com o `push-handler.js` escrito
   por extenso), §3 (a chave), §5 (o envio e o `WebPushError`), §6 (último parágrafo: o
   `GROUP_ACTIVITY` **não** passa pelo dispatcher), §7 (o aparelho).
3. `docs/tasks/37-dispatcher-de-lembretes.md` — de onde vêm o `PushSender`, o
   `NotificationDelivery` e o script. ⚠️ E o docblock de
   `packages/backend/src/usecases/ports/push-sender.ts`, que tem uma **pergunta em aberto
   endereçada a esta fatia** (o caso misto — ver regra 8).
4. `docs/tasks/33-dominio-activity-event.md` — o `recordActivitySafely`, que é a costura onde
   esta fatia entra.
5. `docs/CONVENCOES-CODIGO.md` — §6.1 (o `response` é fronteira de segurança), §6.2, §7.1,
   §7.3, §7.4, §7.9, §7.10.
6. `packages/app/src/__tests__/service-worker-config.test.ts` — **as quatro propriedades que
   não podem cair**.

## Objetivo, em uma frase

Quando ela lê, escreve ou grifa, **o meu celular avisa** — e o aviso aparece de verdade,
porque agora existe um service worker que sabe recebê-lo e um remetente que sabe enviá-lo.

## Escopo

| Fica DENTRO | Fica FORA, e o motivo concreto |
| --- | --- |
| `push-handler.js` em `packages/app/public/` + `workbox.importScripts` | Trocar `generateSW` por `injectManifest`. ⚠️ Ver regra 3: é troca de estratégia, não acréscimo de chave, e as quatro propriedades pinadas teriam de ser remedidas uma a uma |
| O `WebPushSender` real, com `web-push` (dependência **só** do backend) | Qualquer envio de verdade contra inscrição real **por um subagente**. Quem vê push no celular é o **dono**, pelo `COMO-TESTAR.md` |
| O disparo de `GROUP_ACTIVITY` dentro do `recordActivitySafely` | Um quinto chamador, ou tocar nos quatro UseCases de escrita. Eles **não mudam uma linha** — ver decisão A |
| `POST /notifications/test` | Acrescentar `TEST` ao `NOTIFICATION_KINDS`. ⚠️ Decisão 7 da Tarefa 37: aquela lista é o vocabulário de uma **chave de idempotência**, e um `TEST` ali significaria "só dá para testar o push uma vez por dia" |
| A frase do aviso nos **dois** catálogos | Debounce de 60 s no servidor. ⚠️ Decisão D: o `tag` já resolve no aparelho, de graça e sem estado |
| Trocar **uma linha** do `dispatch-main.ts` (`sender: null` → o real) | Rodar o script depois de trocar. ⚠️ Ver regra 15 — a partir dessa linha ele **grava claim e envia** |

## Decisões já tomadas (não reabra)

- **`NOTIFICACOES.md` §6, último parágrafo:** `GROUP_ACTIVITY` **não passa pelo dispatcher**.
  É disparado no mesmo caminho que grava o `ActivityEvent`, para os membros **ativos** do clube
  **menos o autor**, e só para quem tem `notifyGroupActivity`.
- **`NOTIFICACOES.md` §1:** o push **nunca leva conteúdo** — só o que ler e onde. Notificação
  aparece em tela bloqueada.
- **`NOTIFICACOES.md` §5:** `WebPushError` **404/410** = inscrição morta → marca `disabledAt` e
  conta em `disabled`. **Qualquer outro erro relança** — falha de rede não desliga a inscrição
  de ninguém.
- **Decisão I da Tarefa 37:** o dispatcher decide, o sender **entrega**. O payload chega pronto;
  o sender não monta frase.
- **ADR 0002:** dentro do clube não existe conteúdo privado. O aviso de atividade é para todo
  membro ativo — o filtro é a **preferência da pessoa**, não permissão.

## Decisões que eu assumi (auditável — discorde COM MEDIÇÃO)

| # | Decisão | Por quê |
| --- | --- | --- |
| A | ⚠️ **O disparo entra DENTRO do `recordActivitySafely`, e os quatro UseCases não mudam** | **Medido:** `recordActivitySafely` é o **dono único** do `try/catch + log` nos quatro (`create-free-note`, `create-highlight`, `mark-read`, `upsert-plan-note`), e o docblock dele diz por que a regra tem um dono só. Pondo o leque ali, ele **herda a rede que já existe**: um push que falha nunca derruba a escrita da pessoa, e não há quatro `catch` novos para alguém esquecer. É a mesma razão que fez aquela função nascer |
| B | O leque vive num UseCase próprio (`NotifyGroupActivity`), chamado pelo `recordActivitySafely` — **não** dentro do `RecordActivity` | O `RecordActivity` grava um evento e só. Enfiar nele quatro repositórios novos (membership, settings, inscrições, sender) faria o UseCase de gravar depender de metade do sistema, e o teste de "gravou o evento" passaria a montar um mundo |
| C | ⚠️ **O autor NUNCA recebe o próprio aviso**, e isso é estrutural, não um `if` de tela | O `ActivityEvent.userId` **é** o autor. A exclusão acontece na seleção dos destinatários, e há teste que a mede com o mutante que a remove. Receber "você leu o capítulo 3" seria o app cobrando a pessoa do que ela acabou de fazer — §1 do plano |
| D | ⚠️ **Sem debounce de servidor. O `tag` É o debounce** | O §6 pede 60 s por clube+tipo para "evitar três notificações quando três coisas acontecem juntas". **Medido no contrato:** o `tag` do payload faz uma notificação nova **substituir** a anterior no aparelho (§2) — três atividades viram **uma** notificação visível, sem estado nenhum no servidor. O resíduo que o `tag` não resolve é **três vibrações**; é real e é menor. Um debounce de verdade precisaria de claim com chave de janela, e a coluna do claim se chama `localDate` — usá-la para um balde de minutos seria mentir no nome, e renomeá-la é migration numa fatia que já mexe no service worker. **Registrado como limite conhecido**, não escondido |
| E | A chave do payload é o `tag` = `kind` em minúsculas, e o `url` leva **à tela do livro** | §2: "o clique tem de cair na tela certa, senão a notificação não converte em leitura". O `reminder-message.ts` da 37 já resolveu o mesmo problema e **já conhece `/books/:bookId`** — reúse o mesmo dono, não invente um segundo |
| F | `POST /notifications/test` manda para os aparelhos **de quem chamou**, e **não** grava `NotificationDelivery` | É diagnóstico, não entrega: gravar claim faria o teste consumir a idempotência do dia. E manda só para si — um endereço que manda push para outra pessoa é uma arma, mesmo dentro do clube |
| G | ⚠️ **O `tag` do teste é a string `'test'`, e `TEST` NÃO entra no `NOTIFICATION_KINDS`** | Decisão 7 da 37, e ela continua valendo: aquela lista é o vocabulário da **chave de idempotência**. O `tag` é do protocolo do navegador e não precisa estar lá |
| H | ⚠️ **O caso misto: desativar e RELANÇAR (saída (a) do port)** | O port da 37 registrou a pergunta com duas saídas. Escolho (a): a desativação já aconteceu no banco e é o efeito que importa; o erro de rede **sobe**, e quem chama já sabe aguentar (o dispatcher tem teste para isso). A saída (b) preservaria o número ao custo de **apagar do chamador a diferença entre "entregou a todos" e "um aparelho ficou sem"** — e um contador terceiro seria mudança de contrato numa fatia que não pode crescer mais. **Escreva a escolha no port, apagando a pergunta** |

## As regras

1. **TDD estrito, outside-in.** Teste antes de implementação, em toda unidade. Comece pelo
   `NotifyGroupActivity` (seleção de destinatários), que é a única regra de negócio da fatia.
2. ⚠️ **AS QUATRO PROPRIEDADES DO SERVICE WORKER NÃO PODEM CAIR.** Rode
   `packages/app/src/__tests__/service-worker-config.test.ts` **antes** de tocar no
   `vite.config.ts` e **depois**, e cole os dois resultados. As quatro:
   a *denylist* do `navigateFallback` presa ao `DEFAULT_API_URL` · a existência do
   `navigateFallback` · o `globIgnores: ['assets/en-*.js']` da Tarefa 29a · "nenhuma resposta
   de API em cache".
3. ⚠️ **`workbox.importScripts: ['push-handler.js']` — ACRÉSCIMO DE CHAVE, não troca de
   estratégia.** `generateSW` continua. **Não** troque para `injectManifest`: seria reescrever
   o service worker inteiro, e as quatro propriedades acima teriam de ser remedidas uma a uma
   contra um arquivo que passaria a ser nosso.
4. ⚠️ **MEÇA SE O SERVICE WORKER ATUALIZA QUANDO SÓ O `push-handler.js` MUDA.** Este é o alçapão
   da fatia: se o `sw.js` gerado não mudar, o navegador **não** busca a versão nova, e uma
   correção no handler nunca chega a ninguém — em silêncio. Meça de verdade: build, guarde o
   `sw.js`, mude uma linha do `push-handler.js`, build de novo, `diff` nos dois `sw.js`. Se **não**
   mudar, **pare e reporte** — a saída conhecida é garantir que o arquivo entre no manifesto de
   precache (com revisão), mas eu quero a medição antes da solução.
5. O `push-handler.js` é **arquivo pequeno, sem build e sem imports** (§2), em
   `packages/app/public/`. ⚠️ Ele **não** passa pelo TypeScript nem pelo bundler — então
   `pnpm lint` e `pnpm typecheck` **não olham para ele**. Diga no relatório o que olha.

   > ⚠️ **METADE DESTA REGRA ESTAVA ERRADA, e o executor mediu.** O `pnpm typecheck` de fato
   > não o vê. Mas o **`pnpm lint` VÊ**: o `eslint .` da raiz varre `.js`, e o
   > `js.configs.recommended` traz `no-undef` — o arquivo entrou dando **5 erros
   > `'self' is not defined`** no gate. Conserto do executor: um bloco em `eslint.config.js`
   > declarando os globais de service worker. **E é melhor assim** — este é o único arquivo do
   > projeto que roda **fora** do app, onde ninguém vê a exceção, então o lint vira a segunda
   > rede dele.
   >
   > Sexta vez neste MVP em que uma spec minha afirmou uma propriedade sem medi-la (decisão E
   > da 30 · regra 20 da 33 · regra 2 da 32c · decisão D da 36 · regra 15 da 36b · esta). O
   > padrão é sempre o mesmo: **a afirmação sobre a ferramenta, não sobre o código.** Eu sei o
   > que o código faz porque leio o código; o que a ferramenta faz eu **suponho** — e é aí que
   > erro.
6. ⚠️ **O handler não pode explodir com payload torto.** `event.data` ausente, JSON inválido,
   campo faltando: cada um tem de resultar em **nada acontecendo**, nunca numa exceção dentro do
   service worker. Teste isso — é código que roda fora do app, onde ninguém vê o erro.
7. O `WebPushSender` carrega as inscrições **via `PushSubscriptionRepository.byUserId`** (que
   já filtra `disabledAt IS NULL`), nunca por `$queryRaw`, e desativa a morta pelo `update` do
   port. ⚠️ **§6.9:** se o port precisar crescer, cresce **com a implementação Prisma na mesma
   unidade**.
8. ⚠️ **Apague a pergunta em aberto do `push-sender.ts`** e escreva a decisão H no lugar, com o
   teste que a sustenta. Uma pergunta que sobrevive à fatia que devia respondê-la vira ponteiro
   morto — é a lição do `dayRange`.
9. `404` e `410` desativam; **qualquer outro erro relança** (§5). Teste os dois lados **e** o
   limite: um `500` do serviço de push **não** pode desligar a inscrição de ninguém.
10. ⚠️ **O leque exclui o autor** (decisão C), **exclui quem não tem `notifyGroupActivity`** e
    **exclui membership não-ativo**. Três exclusões, três mutantes, três contagens de acusadores
    no relatório.
11. ⚠️ **A falha de push NUNCA derruba a escrita da pessoa.** Decisão A: o leque entra dentro do
    `recordActivitySafely`, que já captura e loga. Escreva o teste que prova isso pelo lado que
    importa: com o sender **lançando**, a nota/o grifo/o log **continua gravado** e a rota
    responde **201**. É o mesmo teste que a Tarefa 33 fez para o evento — leia-o e espelhe.
12. ⚠️ **O log de falha não leva conteúdo** — nem trecho, nem título (o `recordActivitySafely`
    já registra isso por escrito). Confira que a sua adição não quebra essa propriedade, e diga
    como conferiu.
13. A frase do aviso vem do **catálogo compartilhado**, no `locale` da pessoa que **recebe** —
    não da que escreveu. E as chaves novas entram na varredura `GUILT_TERMS` nos **dois**
    idiomas (§7.9): confira que entram **de fato**, plantando uma frase de cobrança.
14. ⚠️ **Nenhuma chave real em lugar nenhum**, nem no relatório. Par de fixture descartável
    (`test-support/ephemeral-vapid-keys.ts`). E depois do `web-push` entrar, **reconfirme** que
    `packages/shared/src/__tests__/no-vapid-private-key.test.ts` continua verde **e mordendo** —
    plante um literal falso e cole o acusador.
15. ⚠️⚠️ **A LINHA QUE LIGA O ENVIO.** Trocar `sender: null` por `new WebPushSender(...)` em
    `dispatch-main.ts` faz o script **gravar claim e enviar de verdade**. A partir dela,
    `notifications:dispatch` deixa de ser inofensivo. **Você troca a linha, mas NÃO roda o
    script** — nem uma vez, nem "só para ver". Quem roda é o dono, pelo `COMO-TESTAR.md`. E
    escreva no docblock do `dispatch-main.ts` que essa transição aconteceu e em que fatia.
16. ⚠️ **Sem VAPID configurado, nada disso pode quebrar.** O `getVapidConfig()` devolvendo
    `null` já desliga o script; garanta que o **leque** também sobrevive a isso — um clube sem
    VAPID tem de continuar gravando nota, grifo e leitura normalmente. Teste.
17. Migration: **não há**. Esta fatia não muda modelo nenhum. Se você achar que precisa,
    **pare e reporte** — provavelmente é o debounce da decisão D entrando pela porta dos fundos.
18. Contador canônico de linhas nos arquivos novos de **tela** (convenção de
    `packages/app/src/pages/*`); no backend, **meça e reporte, sem escrever no arquivo**.
19. ⚠️ **O teto do chunk é 450.000 B e não se afrouxa.** Folga atual: **20.148 B**. O
    `push-handler.js` mora em `public/` e **não entra no bundle** — se o chunk de entrada subir,
    alguma coisa entrou onde não devia: meça e explique. ⚠️ E o precache **vai** crescer (um
    arquivo novo); diga em quantas entradas e quantos KiB, porque foi exatamente essa conta que
    virou BLOQUEADOR na Tarefa 29a.
20. Gates, todos, com os números colados:
    ```
    pnpm -r test          # baseline: shared 600 · ui 195 · backend 1826 · app 744
    pnpm -r typecheck
    pnpm lint             # ⚠️ na RAIZ (eslint .)
    pnpm prettier --check .
    pnpm --filter @clube/app build     # chunk em BYTES + entradas/KiB do precache
    pnpm -r test:integration           # baseline 601
    ```

## Arquivos

**A tocar:** `packages/app/public/push-handler.js` (novo) · `packages/app/vite.config.ts` (só o
`importScripts`) · `packages/app/src/__tests__/service-worker-config.test.ts` (a quinta
propriedade) · `packages/backend/src/notifications/web-push-sender.ts` (novo) ·
`packages/backend/src/usecases/notify-group-activity.ts` (novo) + fake e testes ·
`packages/backend/src/usecases/record-activity.ts` (a chamada dentro do `…Safely`) ·
`packages/backend/src/notifications/group-activity-message.ts` (novo) ·
`packages/backend/src/routes/notification-routes.ts` (o `POST /test`) ·
`packages/backend/src/usecases/ports/push-sender.ts` (a decisão H) ·
`packages/backend/src/notifications/dispatch-main.ts` (**uma** linha) · os dois catálogos ·
`packages/backend/package.json` (`web-push`).

**A NÃO tocar:** `prisma/**` (não há migration) · `packages/ui/**` · `packages/shared/src/`
fora dos catálogos · qualquer `.env` · `docs/**` (é do orquestrador) · os quatro UseCases de
escrita (decisão A).

## Definição de pronto

- [x] As **quatro** propriedades do service worker verdes **antes e depois**, com os dois
      resultados colados.
- [x] Medido se o `sw.js` muda quando só o `push-handler.js` muda — com o `diff` colado.
- [x] O handler sobrevive a payload ausente, JSON inválido e campo faltando, sem exceção.
- [x] Três exclusões do leque (autor · quem desligou · membership não-ativo) com três
      contagens de acusadores.
- [x] Sender lançando → a escrita da pessoa **continua** gravada e a rota responde 201.
- [x] 404/410 desativam; **500 não desativa**.
- [x] A pergunta em aberto do `push-sender.ts` **apagada** e substituída pela decisão H, com
      teste.
- [x] `POST /notifications/test` manda só para quem chamou e **não** grava claim.
- [x] Chaves novas nos dois catálogos, dentro da varredura `GUILT_TERMS`, com a planta medida.
- [x] `no-vapid-private-key.test.ts` verde **e mordendo**, depois do `web-push` entrar.
- [x] `dispatch-main.ts` com a linha trocada, o docblock explicando a transição, e **o script
      NÃO executado**.
- [x] Seis gates verdes, chunk em bytes, precache em entradas e KiB, e o banco provado limpo
      por consulta.
