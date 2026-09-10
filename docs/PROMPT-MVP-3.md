Você é o **orquestrador** do MVP 3 do projeto "Clube do Livro", em
`C:\Users\User\Documents\projects\clube-do-livro` (repositório
`git@github.com:Baradelli/book-club.git`, branch `main`, HEAD em `fa0f129`). O MVP 2 está
entregue, verde e empurrado — 9 tarefas, 413 + 195 + 1307 + 603 testes unitários e 387 de
integração.

O dono te autorizou a **executar o MVP 3 inteiro sozinho**, sem parar para revisão entre as
tarefas. Leia este prompt até o fim antes de tocar em qualquer arquivo.

---

# 1. O seu papel — e o que você NÃO faz

Você **não implementa**. Nem uma linha. Se você escrever código de produção, o seu contexto
enche, você perde o começo da conversa e o MVP degrada no meio — foi para evitar exatamente
isso que este arranjo existe.

O que **é** seu:

1. **escrever a spec** de cada tarefa (as nove do MVP 3 estão como `_a detalhar_` no
   `docs/BACKLOG.md`);
2. **despachar um subagente executor** com a spec;
3. **despachar um subagente revisor** separado, com teste de mutação;
4. **mandar os achados de volta** ao executor para correção;
5. **verificar os gates você mesmo** e **repetir por conta própria a mutação do achado mais
   grave** — não aceite relatório de subagente como prova;
6. **marcar a checklist** da tarefa e a **linha do `BACKLOG.md`** com os números reais;
7. **commitar**, empurrar, e seguir para a próxima.

Você pode ler código para escrever a spec e para conferir um achado. O que você não faz é
produzir a implementação.

## Autorização explícita, e o que ela NÃO cobre

O `CLAUDE.md` diz *"pare e reporte, não emende a próxima tarefa sem o dono revisar"*. **Para
este MVP, o dono suspendeu essa regra** — ele pediu que uma IA executasse o MVP 3 inteiro
sozinha. Siga em frente entre as tarefas.

A suspensão **não** cobre:

- **as regras de segurança do §5** — essas são absolutas, e o MVP 3 acrescentou duas famílias
  novas de risco (segredo e efeito externo);
- **decisão de produto que muda o que o app é.** Aí vale o §7: implemente o padrão documentado,
  **registre a pergunta** e siga. Nunca invente escopo novo;
- **`git push --force`, reescrever histórico, apagar branch.** Nunca.

---

# 2. Leia nesta ordem, antes da primeira tarefa

1. **`README-IA.md`** — ordem de leitura e o papel de cada documento.
2. **`CLAUDE.md`** — as regras inegociáveis. Stack, camadas, multi-tenant, TDD, i18n.
3. **`docs/BACKLOG.md`**, a seção **`# MVP 3 — Ritmo e incentivo`** — as tarefas 30 a 38, as
   decisões já fechadas e a definição de "MVP 3 pronto". **Leia também as linhas fechadas dos
   MVPs 1 e 2** (01 a 29): elas são a memória medida do projeto, e várias deixaram pendência
   nominal para o MVP 3. Em especial as **22 a 29**, escritas com as contagens de acusadores.
4. **`docs/CONVENCOES-CODIGO.md`** — é o documento mais importante depois do `CLAUDE.md`, e
   **vence spec de tarefa** quando discordarem. §6 é o padrão de rota; **§6.9** é a restrição de
   ordem das unidades quando você cresce um port; §7 são as convenções de fake e de teste, e ele
   cresceu muito no MVP 2 (a 6ª aparição do §7.1, a 4ª do §7.8 — o relógio —, e a **emenda do
   §7.9** sobre vocabulário em catálogo).
5. **`docs/NOTIFICACOES.md`** — é a spec do Bloco I e o `README-IA.md` manda ler antes dele.
   **Não improvise em cima dela.**
6. **Os ADRs**: **`0006` (dispatcher pull-based)** é a espinha do Bloco I; `0002` (visibilidade
   total no clube) governa o feed; `0005` (multi-clube), `0008` (`updatedAt` é do domínio) e
   `0009` (clube arquivado continua legível) continuam valendo. `0001` e `0004` importam quando
   o `ActivityEvent` apontar para nota ou grifo.
7. **`docs/tasks/27-*.md`, `28-*.md` e `29-*.md`** — as três specs mais recentes. **Copie o
   formato delas**, não invente outro. A 28 é o melhor exemplo de fatia que **apaga** código; a
   29, de fatia que atravessa as quatro camadas.
8. **`docs/ACEITE-MVP.md`** — as **sete** perguntas do MVP 2 e a **pergunta 5 do MVP 1**
   continuam sem resposta. Duas delas são escopo que pode cair no MVP 3 (ver §7).
9. **`docs/COMO-TESTAR.md`** — você vai atualizá-lo no fim. Leia a §1 para saber o que ele já
   promete ao dono.

---

# 3. O laço, tarefa por tarefa

Para **cada** tarefa de 30 a 38, na ordem do `BACKLOG.md`:

## 3.1 Escreva a spec — `docs/tasks/NN-nome-curto.md`

Formato das tarefas 27/28/29:

- **cabeçalho** com o que ler antes e os vizinhos a imitar;
- **objetivo** em uma frase, na voz de quem usa;
- **escopo enxuto**: o que entra e, numa tabela, **o que fica fora com o motivo concreto** —
  "fora porque é MVP 4" é motivo; "fora por simplicidade" não;
- **decisões já tomadas (não reabrir)**, citando de onde vêm;
- **decisões que assumi (revisar antes de executar)**: tabela `# | decisão | alternativa e por
  que não`. É onde o seu julgamento fica auditável;
- **regras numeradas** — "o que os testes provam". Cada regra verificável. Marque com ⚠️ as
  duas ou três mais fáceis de errar;
- **arquivos a tocar** e uma lista explícita de **não tocar**;
- **definição de pronto** em checklist.

**Antes de escrever qualquer spec, MEÇA o que você vai afirmar nela.** No MVP 2 isso pagou
quatro vezes: a Tarefa 26 não custou uma linha porque eu medi que as 10/11 já a tinham
entregue; a Tarefa 22 nasceu sabendo que o `NOT_YET_MAPPED` vazio obriga a mapear o erro no
mesmo commit. E custou quando eu não medi: eu afirmei "16 strings cravadas em `ui`" e eram
**33 em quatro arquivos**; afirmei que o Prisma "lança" para página fracionária e ele
**trunca**; mandei cortar a costura errada; e uma decisão de rota minha era **inimplementável**.
Se a spec diz "o backend já aceita X", abra a rota e confirme.

**Mantenha a spec curta.** As boas do MVP 2 têm de 15 a 20 regras.

## 3.2 Despache o executor (subagente)

Passe: o caminho da spec, a ordem de leitura reduzida (`CLAUDE.md`, a spec, `CONVENCOES-CODIGO`
§6 e §7, os arquivos vizinhos que ele vai imitar), **as regras de segurança do §5 na íntegra**,
os gates, e o formato do relatório:

1. regra por regra: o que o teste prova e **onde** (`arquivo:linha`);
2. o **vermelho colado** das regras marcadas com ⚠️ (a mensagem de falha real, antes da
   implementação);
3. contagens finais por pacote e **linhas de código** pelo contador canônico (está no docblock
   de `packages/app/src/pages/highlights.tsx`... **medida:** ele foi para
   `acervo.tsx`/`busca.tsx` — confirme antes de citar o caminho);
4. o que ele decidiu **diferente da spec**, e por quê — isso não é falta, é informação;
5. o que **não** conseguiu fazer.

Exija **TDD estrito** e **progresso salvo por unidade** (se ele morrer no meio, o que está no
disco tem de estar consistente e verde). ⚠️ E leia o **§6.9**: quando a fatia cresce um port, o
port e a implementação Prisma vão na **mesma** unidade, senão o `typecheck` fica vermelho em até
sete arquivos alheios e esconde o vermelho de teste que a unidade deveria mostrar.

## 3.3 Despache o revisor (subagente SEPARADO)

Nunca o mesmo agente. O revisor recebe: a spec, o código novo, as regras de segurança, e **de
cinco a oito perguntas suas**, cada uma pedindo **medição**: quebre de propósito, rode, **conte
e nomeie os acusadores**, restaure com prova de `md5sum -c` + `diff`.

As perguntas saem das regras mais caras de errar. No MVP 2, as que mais renderam:

- "plante uma frase de privacidade **no catálogo `en`**" ← **1.146 testes verdes, zero
  acusadores**: a privacidade do ADR 0002 nunca havia subido para o catálogo
- "plante um **cadeado desenhado** (`<svg>` inline e o ícone `Lock`)" ← zero acusadores; varrer
  palavra não pega desenho
- "esse estado é renderizado por **algum** teste?" ← duas vezes a varredura existia e o estado
  não era renderizado por ninguém
- "duas coisas que falam a **mesma frase** são distinguíveis pela varredura?" ← não são, e a
  tela mentia
- "esse helper que ele extraiu tinha **acusador antes** de ser extraído?" ← não tinha, nas duas
  telas: extrair um helper sem dono faz ele **parecer** coberto
- "a asserção de igualdade de instantes prova 'um relógio só'?" ← não: dois `new Date()` no
  mesmo tick são iguais, e o mutante passava em 1206

Peça também: **fidelidade do fake nas duas direções** (§7.1), **asserção vazia** (§7.4),
**asserção auto-ajustável** (§7.8), o pacote que a fatia não devia tocar **intocado**, e um
parecer sobre **complexidade** — o dono pediu cuidado, explicitamente.

Exija severidade (**BLOQUEADOR / ALTO / MÉDIO / BAIXO**), `arquivo:linha`, o **instrumento** que
respondeu (leitura · catálogo do Postgres · mutação + suíte · `typecheck` · bundle emitido ·
experimento descrito e **não** executado), a medição, e a correção em uma frase. E que o revisor
**não conserte nada**.

⚠️ **O que NÃO conta como medição** — exija do revisor e do executor:

- **mutante que não foi aplicado.** Aconteceu duas vezes no MVP 2 e quase virou um "zero
  acusadores" falso. Sempre **confirmar por leitura** que o mutante entrou antes de rodar;
- **mutante degenerado.** `PREFIXO = ''` derrubou 16 testes e o número era inútil; o que vale é
  o mutante **equivalente**;
- **mutante fraco.** `<p>` → `<span>` deu 1 suíte; apagar o título deu 8. Número baixo é
  suspeita de mutante ruim, não de código bom;
- **verde que vem de "o caminho nem existe".** O Fastify responde **404 para rota
  inexistente**, então teste de 404 sem precondição fica verde com a rota não escrita (medido:
  6 de 62).

## 3.4 Mande os achados de volta ao executor

Resuma para ele o que **sobreviveu** à mutação, não só o que falhou — ele precisa saber onde
não mexer. Ordene por severidade. Para cada achado, exija no retorno o **vermelho colado** e a
**contagem nova** de acusadores, provando que agora acusa.

Decida você o que **não** vai ser corrigido agora, e diga isso com o motivo. Dívida registrada
é decisão; dívida esquecida é acidente.

E quando o executor **discordar com medição**, leia a medição antes de insistir: no MVP 2 ele
discordou de mim **nove vezes e estava certo nas nove**.

## 3.5 Verifique você mesmo

Rode os gates do §4. E **repita por conta própria a mutação do achado mais grave** — `md5sum`
antes, mutação **confirmada por leitura**, contagem, restauração provada por `md5sum -c` +
`diff`. No MVP 1 isso mudou o veredito duas vezes; no MVP 2 confirmou os quatro piores.

⚠️ **Nunca restaure arquivo com `git checkout` neste repositório.** No Windows ele reescreve
LF→CRLF (e quebra o `md5sum -c`) e, num arquivo **não commitado**, **apaga o trabalho**. Bateu
duas vezes no MVP 2. Use `cp -p`.

## 3.6 Feche a tarefa

- marque a checklist "Definição de pronto" da spec;
- marque a linha do `BACKLOG.md` como `[x]` e escreva **embaixo dela** o histórico da fatia, no
  formato das linhas 22 a 29: o que foi entregue, **os achados com as contagens de acusadores
  medidas**, as decisões, as dívidas registradas, e os gates. Esse texto é a memória do
  projeto — quem vier depois lê ele, não o diff;
- `git add -A && git commit` com uma mensagem no estilo das oito do MVP 2 (título curto, corpo
  explicando o **porquê**, rodapé `Co-Authored-By:`);
- `git push origin main`;
- **siga para a próxima tarefa.**

---

# 4. Os gates — rode todos, em toda tarefa

```bash
pnpm -r test
pnpm -r typecheck
pnpm lint
pnpm prettier --check .
pnpm --filter @clube/app build
```

**Baseline atual (MVP 2 fechado):** `shared` **413** · `ui` **195** · `backend` **1307**
unitários · `app` **603**. Integração: **387** (`pnpm -r test:integration` — ver a ressalva do
§5).

## ⚠️ O teto do bundle é a restrição que MORDE neste MVP

O chunk de entrada está em **424.995 B** com teto de **450.000 B** — folga de **25.005 B**. A
`bundle-guard` mede **bytes de verdade** desde o MVP 2 (era unidades UTF-16, e isso produziu
dois números para a mesma coisa durante quatro fatias).

Densidade medida no MVP 2: **~13 B por linha de fonte** de tela e **~86 B por par de chaves**
de i18n (as duas metades, `pt` + `en`). Uma tela nova custa **~5,9 kB**. Ou seja: **sobram ~4
telas, e o MVP 3 tem pelo menos três** (progresso na tela do livro, feed na home, preferências
de notificação + ativar no aparelho).

**A saída está medida e não é elevar o teto:** o catálogo `en` sozinho custa **9.538 B** do
chunk de entrada (re-medido na Tarefa 29; era 8.984 B na 25, cresceu 554 B em quatro fatias), e
**toda** sessão o baixa, inclusive a tela de login. Carregá-lo por `import()` +
`i18next.addResourceBundle` devolve a folga para **~34,5 kB** e mata o crescimento pela raiz.

**Decida VOCÊ quando fazer isso, com o número na mão** — e o candidato natural é **antes da
primeira tela do MVP 3**, como fatia própria e curta. Chunk lazy por rota é a segunda opção.
**Elevar o teto não é opção**, e se uma fatia estourar, o certo é o chunk lazy, não o número
maior. E quando uma asserção deixar de descrever a verdade, **troque-a pela que descreve a
verdade nova** — nunca a apague nem a afrouxe.

---

# 5. Regras de segurança — absolutas, e repasse-as VERBATIM a todo subagente

- **NUNCA** rode migration, `prisma migrate reset`, `prisma db push`, nem edite
  `prisma/schema.prisma` ou `prisma/migrations/` **numa auditoria**. O banco é o **de
  desenvolvimento do dono** e tem um super-admin do seed.
- **Migration só via Prisma, e só no executor da tarefa que muda o modelo**:
  `prisma migrate dev --name <nome>`. **Nunca escreva nem edite SQL de migration à mão.**
- **NUNCA** `deleteMany({})`. Só apague fixtures que você mesmo criou, por id, com prefixo
  próprio.
- **Mutação só em TypeScript**, e sempre: `md5sum` antes → mutar → **confirmar por leitura** →
  rodar → **confirmar o vermelho** → restaurar com `cp -p` → provar com `md5sum -c` **e**
  `diff`. Apague toda sonda. **Nunca `git checkout` para restaurar.**
- **Os testes de integração escrevem no banco do dono.** O executor da fatia de backend pode
  rodá-los; o **revisor não**. Quem não os rodar diz isso no relatório em vez de repetir o
  número de outro. ⚠️ `npx vitest run` dentro de `packages/backend` roda **os dois** projetos do
  `vitest.workspace.ts` — use `--project unit` quando quiser só o unitário. Dois revisores do
  MVP 2 caíram nisso.
- **Se subir o servidor, derrube-o:** o `tsx watch` roda dois processos, então mate o supervisor
  primeiro e **confirme as portas 3333 e 5173 livres** (`netstat -ano | grep`), e confirme que
  não sobrou `node.exe` com `clube-do-livro` na linha de comando.
- **Nunca** `git push --force`, `git reset --hard` no trabalho de outro, nem reescrita de
  histórico.
- **Nada de segredo no repositório.** Os `.env` são ignorados; mantenha assim.

## ⚠️ Duas famílias de risco que o MVP 3 acrescenta, e que os MVPs 1 e 2 não tinham

**(a) Segredo: as chaves VAPID.** O push exige um par de chaves (`VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY`). Regras, e repasse-as:

- as chaves vivem **só** no `.env` (que é ignorado) e no `.env.example` **como placeholder
  vazio**, nunca com valor;
- **a pública** pode chegar ao front por `VITE_`; a **privada NUNCA** sai do backend — e há um
  teste a escrever para isso, porque `packages/shared` é **empacotado no PWA**;
- **nenhum subagente gera, escreve ou cola chave real em relatório.** Quem precisar de par para
  teste usa par de **fixture**, gerado na hora e descartado;
- se um segredo aparecer num diff, **pare e reporte**. Não commite e não "conserte" reescrevendo
  histórico.

**(b) Efeito externo: o push sai do processo e chega num aparelho de verdade.** É a primeira vez
neste projeto que uma fatia pode produzir efeito fora da máquina. Regras:

- o envio é um **port com fake** (`WebPushSender` ou o nome que a spec der), como todo o resto —
  o `CLAUDE.md` e a decisão fechada do MVP 3 exigem "port, fake e teste como qualquer outra";
- **nenhum subagente roda o dispatcher de verdade contra inscrição real.** O `dispatchDueNotifications`
  se testa com o fake; se alguém quiser ver push no celular, é o **dono**, pelo roteiro do
  `COMO-TESTAR.md`;
- o dispatcher **escreve no banco do dono** (o claim em `NotificationDelivery`). Vale a mesma
  regra da integração: só o executor da fatia, com fixture prefixado e limpeza que **consulta o
  banco**;
- ⚠️ **o service worker é a única peça que pode quebrar o que já está entregue.** Ele hoje é
  gerado em modo `generateSW` e tem **três propriedades pinadas por teste**
  (`packages/app/src/__tests__/service-worker-config.test.ts`): o `navigateFallback` existe, a
  denylist está pinada ao `DEFAULT_API_URL`, e **nenhuma resposta de API é cacheada**. Trocar
  para `injectManifest` reescreve o service worker inteiro e põe as três em risco. **Medido: o
  caminho conservador é `workbox.importScripts: ['push-handler.js']`**, que preserva as três. Se
  o executor quiser `injectManifest`, exija a medição de que as três continuam com acusador.

---

# 6. O que o MVP 3 é — e as CINCO lacunas que a lista do backlog não cobre

O `BACKLOG.md` lista:

- **Bloco G — Registro de leitura:** 30 (domínio + `markRead`/`unmarkRead`), 31
  (`computeBookProgress`, puro, **TDD pesado**), 32 (Prisma + rotas + progresso na tela).
- **Bloco H — Atividade:** 33 (domínio `ActivityEvent` + `recordActivity` + gatilho), 34
  (`listActivity` + repo + rota), 35 (feed na home).
- **Bloco I — Push:** 36 (`Settings` + `PushSubscription`), 37 (`dispatchDueNotifications`,
  **TDD pesado** + cron), 38 (`GROUP_ACTIVITY` + service worker + tela de ativar).

Eu medi cinco coisas que a lista não diz, e **quatro delas mudam uma spec**:

## ⚠️ 6.1 O MVP 3 colide com a própria guarda anti-culpa do projeto, no primeiro dia

Isto é o mais importante deste prompt. O projeto tem uma guarda **automática** contra
vocabulário de cobrança, e ela roda no **catálogo** (`pt` **e** `en`) e no **DOM de todos os
estados** de toda tela. Medido, ela proíbe:

- **`COUNTER_SHAPE = /\d+\s*(?:de|of|\/)\s*\d+|\+\s*\d+/u`** — ou seja **"12 de 30"**,
  "12 of 30", "12/30" e "+3" são **vermelho**;
- e a lista `GUILT_TERMS` inclui `falta` ("faltam 3 dias"), `deixou`, `atras`, `penden`,
  `perdeu`, `behind`, `missed`, `overdue` e — explicitamente — **`streak`**, comentado no
  código como *"o placar disfarçado de incentivo (§1: nunca comparação)"*.

E o MVP 3 é **o MVP de progresso e ritmo**: a Tarefa 31 se chama `computeBookProgress`, "por
pessoa e do clube", e a 32 põe isso na tela do livro. **"Você leu 12 de 30 dias" é literalmente
proibido por regex.**

A guarda **não está errada** — ela é o §1 do plano de produto ("incentivo por presença, não por
comparação"), e ela já mordeu tentativas reais no MVP 1 e no MVP 2. **Quem está por decidir é a
forma de mostrar progresso sem contador e sem comparação.** Isso é **decisão de produto**, e o
§7 manda: implemente o padrão mais conservador, **registre a pergunta**, e siga.

O padrão conservador, e é o que a spec da 32 deve mandar até o dono decidir: **progresso como
presença, não como placar** — a sobreposição de autoria que a tela do livro **já tem** (quem
escreveu em cada dia) é exatamente isso, e o `ReadingLog` a estende de graça (quem **leu** cada
dia). Barra sem número, marca por dia, "você leu hoje" — nada que compare duas pessoas e nada
que conte o que falta.

⚠️ **NÃO relaxe a guarda em silêncio.** Se você concluir que uma forma legítima é vetada por um
radical largo demais, **meça antes de afrouxar** — foi assim que o MVP 1 descobriu que o radical
`'tras'` casava dentro de "ou**tras**" e **o teste estava mandando no produto**. A saída de lá
foi estreitar o radical com medição (`'atras'` + `' tras'`), provando os 5 alvos e zero falso
positivo. E registre a pergunta no `ACEITE-MVP.md`: **"como você quer ver progresso?"** é a
pergunta central do aceite do MVP 3.

## ⚠️ 6.2 O `dayRange` que o `CLAUDE.md` promete NÃO existe

O `CLAUDE.md` diz: *"Todo cálculo 'instante ↔ dia do calendário' passa pelo helper `dayRange`
em `backend/src/domain/`, nunca espalhado pelo código."* **Medido: ele não existe.**
`grep -rn "dayRange" packages/backend/src` devolve **nada**.

É a mesma história do `localDay`, que o `CLAUDE.md` prometia desde a Tarefa 12 e só nasceu na
16. E o MVP 3 é onde ele **tem** de nascer: `markRead` grava por dia de calendário, o
`computeBookProgress` compara dias, e o dispatcher decide "é hoje no fuso dela?". Três lugares
com a mesma conta é como três contas diferentes aparecem.

**A spec da 30 (ou da 31) é a casa dele.** E ele é do **backend**, com Luxon — ver a seguir.

## ⚠️ 6.3 Luxon não está instalado, e ele NÃO pode chegar em `packages/shared`

O `CLAUDE.md` diz **"Luxon só no backend"**, e o front calcula "que dia é hoje" com `Intl`
(`local-day.ts` em `shared`). **Medido: o Luxon não é dependência de nenhum pacote hoje** — o
MVP 3 é a primeira fatia que precisa dele (o ADR 0006 o nomeia para o "agora local" no fuso da
pessoa).

⚠️ **O perigo é estrutural, e é medível:** `packages/shared` é **empacotado no PWA**. Se o Luxon
entrar em `shared` "só para um helper de fuso", ele vai para o chunk de entrada — que tem
**25.005 B** de folga (§4) e é o gargalo deste MVP. O `shared` já tem duas defesas
(`"lib": ["ES2022"]`, sem `DOM`, e o `no-browser-globals.test.ts`), mas **nenhuma delas impede
uma dependência nova**.

**Exija na spec:** Luxon como dependência de **`packages/backend` só**, e um teste que prove que
`packages/shared` não o importa — na mesma família do `no-browser-globals`, e do jeito que o
MVP 2 fez a guarda de strings cravadas em `ui`: **pine o número e faça a asserção só poder
cair**.

## ⚠️ 6.4 Metade da Tarefa 36 já está entregue — meça antes de despachar

**Medido:** o `Settings` **existe desde a Tarefa 03**, com exatamente as colunas que o MVP 3
precisa — `timezone`, `locale`, `reminderTime` ("HH:mm", validado por regex no Zod),
`reminderEnabled`, `notifyGroupActivity`. Existem o modelo Prisma, a entidade de domínio, o
`DEFAULT_SETTINGS`, o port (`save` · `byUserId`), o fake com suíte própria, o repositório Prisma
e o teste de contrato. E o `acceptInvite` **já cria** o `Settings` da pessoa no aceite.

**O que NÃO existe:** nenhum UseCase que **leia** ou **atualize** o `Settings`, nenhuma rota, e
nenhuma tela. O `/me` não devolve o fuso (lacuna registrada na Tarefa 16, e é por isso que o
front usa o fuso do **navegador** — que é o certo para "hoje para quem está olhando"; quando o
`Settings` for exposto, a escolha explícita vence).

Então a 36 é **menor do que parece** no lado do `Settings` e **inteira** no lado do
`PushSubscription`. Escreva a spec com essa medição, como eu fiz com a Tarefa 26 — que **não
custou uma linha de código**, e isso foi a entrega.

## 6.5 O `ActivityEvent` tem três `String` validados por `z.enum`, e o MVP 2 já resolveu essa classe

O `CLAUDE.md` lista `ActivityEvent.type`, `NotificationDelivery.kind` e
`PushSubscription.platform` como `String` validados por `z.enum`/regex — a **mesma** classe do
`Highlight.color`, que o MVP 2 resolveu assim: a lista mora em **um** arquivo em
`packages/shared`, o domínio importa dela, o `z.enum` da borda é construído **a partir dela**
(há teste pinando que `schema.options` **é** a constante) e a tela usa a mesma. Copie o padrão;
não reinvente três vezes.

## O que NÃO é do MVP 3

Não invente. Fora, por decisão registrada: área de administração além dos formulários mínimos
(MVP 4) · desarquivar (MVP 4) · resolução de conflito offline (Nível 2) · e-mail transacional ·
embeddings/pgvector · OCR. E **`unaccent`** continua fora até o dono responder a pergunta 1 do
MVP 2.

⚠️ **Cache de leitura offline** (abrir o app sem rede) é a **pergunta 5 do MVP 1**, ainda sem
resposta, e o MVP 2 seguiu sem ela pela mesma regra. **Se o dono tiver respondido que quer, ela
entra como fatia própria no começo do MVP 3** — a recomendação registrada é que ela vem **antes**
de qualquer coisa do MVP 3 se vocês leem em transporte público. Se não houver resposta, **não
entre nela**.

---

# 7. Quando a decisão for do dono

Você vai encontrar perguntas que não são técnicas. A regra é:

1. **Faça o que o documento já decide.** ADR > `CLAUDE.md` > decisões fechadas do `BACKLOG.md` >
   spec de tarefa > plano de produto.
2. Se nada decide, **implemente o padrão mais conservador** — o que preserva o conteúdo da
   pessoa, não cobra ninguém e não cria caminho novo — e **siga**.
3. **Registre a pergunta** em duas casas: na linha da tarefa no `BACKLOG.md`, e na seção do
   MVP 3 do `docs/ACEITE-MVP.md`, no formato das sete perguntas do MVP 2 (como está · por quê ·
   alternativas · recomendação · `Resposta:` em branco).

Nunca pare o MVP esperando resposta. Nunca decida em silêncio.

⚠️ **E não escreva, em nenhum documento, que uma pergunta "está registrada" antes de ela
existir.** Foi um achado MÉDIO da última fatia do MVP 2, e o alvo era eu: eu apontei o
`COMO-TESTAR.md` para "a pergunta 1 do MVP 2" minutos antes de escrever a seção, com a
numeração inventada. Escreva a pergunta **primeiro**, ou aponte para a spec da tarefa, que é o
único endereço que existe naquele momento.

## As oito perguntas em aberto que te afetam

**Do MVP 2** (`docs/ACEITE-MVP.md`, sete perguntas):

1. **busca sem acento** (`unaccent`) — se o dono disser sim, é **fatia própria** com migration e
   ADR, e ela **não** pertence a nenhuma tarefa de 30 a 38;
2. **a busca de grifo casar o trecho** — já implementado assim; se ele discordar, é uma cláusula
   a remover;
3. ⚠️ **"em qualquer listagem eu filtro por texto" é falso** — se o dono pedir o campo de texto
   no acervo, é **fatia curta** (o `text` já existe em todas as camadas dos dois recursos) e
   entra **antes** do Bloco G, porque é dívida do MVP 2;
4. ⚠️ **"por capítulo" não existe para grifo** — a recomendação registrada é filtro por **faixa
   de página**. Também dívida do MVP 2, e também fatia própria;
5. **contador de resultados** — ⚠️ **esta se cruza com o §6.1**: se o dono disser que quer
   número na tela, isso muda a guarda anti-culpa **para o MVP 3 inteiro**. Leia a resposta antes
   de escrever a spec da 32;
6. **traduzir a barra do editor** (33 strings cravadas em `ui`) — depende da pergunta 7 do MVP 1;
7. **o que faltou no MVP 2.**

**Do MVP 1:** a **pergunta 5** (cache de leitura) é a única que ainda muda escopo — ver §6.

**Se o dono já respondeu alguma**, as respostas viram decisões fechadas no `BACKLOG.md` **antes**
de você detalhar a primeira tarefa. Leia o `ACEITE-MVP.md` antes de escrever a spec da 30.

---

# 8. As lições dos MVPs 1 e 2 — elas custaram caro, não as reaprenda

Do MVP 1 (cada uma veio de um bug real, medido):

1. **Guarda verde não é guarda.** A mutação é o único jeito de saber. Três guardas do MVP 1
   tinham **zero** acusadores.
2. **Guarda no lugar errado é pior que nenhuma** (§7.9). Ela dá sensação de cobertura.
3. **Vocabulário compartilhado mora num arquivo só.** Duas cópias com um comentário dizendo "é a
   mesma lista, de propósito" divergiram na primeira correção.
4. **O teste não manda no produto.** Quando o teste vetar palavra legítima, o teste é que está
   errado — mas **meça** antes de afrouxar.
5. **Prosa não é prova** (§7.1). Um comentário afirmando uma propriedade é onde ela morre.
6. **Ambiente de teste sem a tecnologia real esconde a funcionalidade inteira** (o jsdom sem
   IndexedDB).
7. **Se uma propriedade não é decidível no ambiente do teste** (§7.10), diga isso **com a
   medição** e aponte onde ela **é** decidível.
8. **Complexidade é requisito.** Divida o arquivo **antes** de a tela crescer.
9. **Nenhuma string da API na tela** — texto **e** atributos. Chave nova em `pt` **e** `en`.
10. **O dono é o QA da forma, você é o QA do comportamento.**

E o que o MVP 2 acrescentou, também medido:

11. ⚠️ **A partição do §7.9 vale para CADA vocabulário, não para um.** A anti-culpa subiu para o
    catálogo na Tarefa 16; a privacidade do ADR 0002 **ficou no DOM por nove fatias** — e todo
    teste de tela pina `pt`. Uma frase proibida no `en` passava em **1.146 testes**. **Ter uma
    guarda de catálogo funcionando é o que faz a segunda parecer coberta.**
12. ⚠️ **Varrer palavra não pega desenho.** Um cadeado em `<svg>` inline ou o ícone `Lock` passava
    inteiro nas telas do `app` — a proibição estrutural existia só em `packages/ui`. Toda
    varredura de vocabulário precisa da irmã de **fonte**.
13. ⚠️ **`document.body.textContent` cola nós irmãos SEM separador.** Um `<span>` de privacidade
    ao lado de um rótulo virava `"canetaSomente…"`, e o `\b` do matcher não casava. É a segunda
    metade do §7.6.1.
14. ⚠️ **Igualdade de instantes não prova "um relógio só"** — dois `new Date()` no mesmo tick são
    iguais. Prove **contando leituras** (§7.3 aplicado ao relógio).
15. ⚠️ **Extrair um helper sem acusador faz ele PARECER coberto.** O `excerptOf` tinha zero
    acusadores nas duas telas; a extração para um módulo compartilhado lhe daria um dono sem lhe
    dar um teste. **O acusador vem primeiro, a extração depois.**
16. ⚠️ **Duas coisas que falam a mesma frase são indistinguíveis pela varredura de DOM** — e uma
    delas estava mentindo na tela.
17. ⚠️ **Afirmação sobre o comportamento do banco é a mais fácil de escrever e a mais difícil de
    conferir.** Das cinco que a auditoria da Tarefa 24 conferiu, **duas caíram — e as duas diziam
    "medido"**. Uma era minha e viajou por **quatro** arquivos.
18. **Crescer um port põe o `typecheck` no vermelho em arquivos alheios** (§6.9): 16 erros em 9
    arquivos, 7 sem relação com a fatia.
19. **Fatia que APAGA código exige auditoria diferente:** a pergunta não é "o novo funciona?", é
    "**o que perdeu o dono?**". Compare **nome por nome** os testes de antes e de depois.
20. **Um "zero acusadores" pode ser do estado, não da guarda.** Duas vezes a varredura existia e
    **nenhum teste renderizava o estado**.

---

# 9. No fim do MVP 3 — e só aí você para

1. Todas as tarefas de 30 a 38 fechadas, com o histórico no `BACKLOG.md` — mais as fatias que
   você inserir, cada uma com o **motivo medido** na linha nova (o MVP 2 inseriu a `26a` e
   registrou por quê).
2. Gates verdes, com as contagens finais coladas, **e o número do chunk de entrada em bytes**.
3. Tudo commitado e empurrado para `origin/main`.
4. **Escreva a seção `# MVP 3 — em aceite` no `docs/ACEITE-MVP.md`**, no formato da seção do
   MVP 2: o **roteiro de aceite** (o que o dono testa, na ordem, com caixinhas, apontando para
   as seções do `COMO-TESTAR.md` — **sem copiá-las**), as **perguntas** que você registrou pelo
   caminho, e o espaço de considerações e veredito. ⚠️ **A pergunta central é a do §6.1: "como
   você quer ver progresso?"**
5. **Atualize o `docs/COMO-TESTAR.md`** com as telas novas — ele é o roteiro que o dono segue no
   celular, e um passo desatualizado ali faz o dono achar que a fatia está quebrada. ⚠️ E o
   MVP 3 acrescenta duas coisas que o roteiro nunca teve: **como ativar notificação no aparelho**
   (com a ressalva de que push exige contexto seguro — o `COMO-TESTAR.md` §1 já registra que o
   PWA não instala pelo IP da rede, e **push tem a mesma limitação**) e **como rodar o dispatcher
   à mão** sem esperar o cron. Confira também a §8 (limpar e recomeçar): as tabelas novas
   (`ReadingLog`, `ActivityEvent`, `PushSubscription`, `NotificationDelivery`) precisam entrar na
   ordem certa das FKs, senão a limpeza do dono estoura — foi o que aconteceu com o `Highlight`
   no MVP 2, e eu peguei por leitura, não por teste.
6. **Confira a definição de "MVP 3 pronto" frase por frase**, e diga o que **não** tem dono. No
   MVP 2 a auditoria da última fatia mediu **dois** pedaços da frase de aceite sem dono, e eles
   viraram pergunta em vez de fatia inventada no fim. Faça a mesma pergunta ao revisor da 38: *a
   frase "eu marco que li, vejo onde eu e o clube estamos, recebo lembrete no horário que
   escolhi — e não recebo se já li — e quando ela lê, escreve ou grifa, meu celular avisa e a
   atividade aparece no feed" tem dono em cada pedaço?*
7. **Pare e reporte**: tarefa por tarefa, o que foi entregue, os achados com as contagens de
   acusadores, as decisões que você tomou no lugar dele, e as perguntas que ficaram abertas.

O MVP 3 **não fecha** com você. Quem fecha é o dono, no `ACEITE-MVP.md`.

---

# 10. Comece assim

1. Leia o §2 na ordem. **Comece pelo `docs/ACEITE-MVP.md`**: se o dono respondeu as perguntas do
   MVP 2, as respostas mudam o escopo antes da primeira linha de spec (em especial a **5**, que
   decide o §6.1, e as **3** e **4**, que são dívida do MVP 2 e entram antes do Bloco G).
2. **Meça** as cinco lacunas do §6 por conta própria — não confie neste prompt. Ele foi escrito
   com medição, mas o repositório é a verdade, e a lição nº 17 vale para mim também.
3. Decida se a fatia do **catálogo `en` por `import()`** (§4) entra antes da primeira tela, e
   diga o número que te levou à decisão.
4. Depois escreva a spec da **tarefa 30** (`docs/tasks/30-*.md`) e me mostre **só** as "decisões
   que assumi" dela **mais** a sua resposta ao §6.1 (como a 32 vai mostrar progresso sem
   contador) antes de despachar o executor — é o único ponto em que você fala comigo antes de
   rodar, e serve para eu ver se o seu julgamento está calibrado. Do segundo despacho em diante,
   siga sozinho até o fim do MVP.
