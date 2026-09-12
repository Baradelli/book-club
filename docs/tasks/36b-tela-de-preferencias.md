# Tarefa 36b — A tela mínima de preferências, e "ativar neste aparelho"

> **Fatia inserida.** Ela é a metade de TELA da Tarefa 36, separada porque a metade de
> backend já era uma fatia inteira (migration + duas tabelas + quatro rotas + o primeiro
> segredo do projeto). Uma fatia que muda modelo, gera migration e ainda desenha tela é a
> fatia que ninguém consegue revisar.

## O que ler antes (nesta ordem)

1. `CLAUDE.md` — em especial "Multi-tenant desde o dia 1" e "i18n no frontend".
2. `docs/CONVENCOES-CODIGO.md` — §6.8 (o cliente valida a resposta de sucesso), §7.1
   (fidelidade do fake nos DOIS sentidos), §7.3 (contador de chamadas, nunca cronômetro),
   §7.4 (asserção vazia e o antídoto), §7.7 (factories), §7.9 (a guarda de vocabulário mora no
   CATÁLOGO e cobre os dois idiomas).
3. `docs/tasks/36-settings-e-push-subscription.md` — **a fatia irmã**. O contrato que esta
   tela consome nasceu lá, e os docblocks de `packages/shared/src/settings.ts` e
   `packages/shared/src/notification.ts` explicam cada campo e cada `.strict()`.
4. `docs/NOTIFICACOES.md` — §3 (a chave), §7 (o PWA no iPhone).
5. **Os vizinhos, para copiar o molde e não inventar um terceiro:**
   `packages/app/src/pages/reading-marks.tsx` (a página nova mais curta: fetch, estado de
   escrita, recado de falha), `packages/app/src/pages/busca.tsx` (formulário + i18n) e
   `packages/app/src/App.tsx` linhas 37–63 (o `LanguagePicker`, que é o controle de PESSOA
   que já existe no cabeçalho).

## Objetivo, em uma frase

A pessoa abre uma tela, escolhe a que horas quer ser lembrada, liga e desliga os dois avisos,
e **ativa o push neste aparelho** — e quando o navegador não pode fazer isso, a tela **diz por
quê** em vez de falhar em silêncio.

## Escopo

| Fica DENTRO | Fica FORA, e o motivo concreto |
| --- | --- |
| A rota `/preferencias` e a entrada para ela no cabeçalho | Um item de menu lateral — **não existe menu lateral** neste projeto, e criar um para uma tela é desenhar navegação nova numa fatia de preferência |
| Os **três** controles da decisão 7: horário do lembrete, ligar/desligar lembrete, ligar/desligar atividade do grupo | `timezone` e `locale`, que são os outros dois campos do `Settings`. **Medido:** o `LanguagePicker` do cabeçalho guarda a escolha com `persistLocale` (local), e `Settings.locale` **não tem um leitor sequer no front hoje**. Editá-lo aqui criaria DOIS donos de "em que língua eu falo" e o segundo ganharia às vezes. Unificar os dois é a Tarefa 46, inteira; fazer metade é pior que não fazer |
| Ativar/desativar o push **neste aparelho** (`POST`/`DELETE /notifications/subscriptions`) | **Listar os aparelhos inscritos.** Não existe `GET /notifications/subscriptions` — a Tarefa 36 não o criou, de propósito. A tela sabe do aparelho em que está, e é só disso que ela precisa |
| O recado de contexto inseguro e o de permissão negada | Um botão de "mandar uma notificação de teste". O `POST /notifications/test` é da **Tarefa 38**, e **nada nesta fatia envia coisa alguma** |
| Ler `GET /notifications/config` e esconder a seção quando `enabled` é `false` | Uma variável `VITE_VAPID_PUBLIC_KEY`. ⚠️ Ver a regra 6 — ela é proibida nesta fatia |
| As chaves de i18n nos **dois** catálogos | O `push-handler.js` e qualquer coisa dentro do service worker — **Tarefa 38** |

## Decisões já tomadas (não reabra)

- **Decisão 7 do plano do MVP 3:** a tela é **mínima**. Três controles e o botão do aparelho.
- **`packages/shared` é empacotado no PWA** — a chave privada nunca chega perto daqui, e o
  teste `no-vapid-private-key.test.ts` (Tarefa 36) é quem guarda isso.
- **ADR 0002** (visibilidade total no clube) não tem nada com esta tela: preferência é da
  PESSOA, e o `Settings` é `unique(userId)` sem `clubId` desde a Tarefa 03.
- O `PATCH /me/settings` é **parcial e `.strict()`**: manda só o que mudou, e chave não
  declarada é **400 com nada escrito**.

## Decisões que eu assumi (auditável — discorde COM MEDIÇÃO)

| # | Decisão | Por quê |
| --- | --- | --- |
| A | **A entrada fica no CABEÇALHO** (`App.tsx`), ao lado do idioma e do tema, não na home | O cabeçalho já é o lar dos controles da **pessoa**; a home é a tela do **clube** — é por isso que a entrada da busca mora nela (Tarefa 29). Preferência não pertence a clube nenhum |
| B | O endereço é **`/preferencias`**, constante `SETTINGS_PATH` em `pages/paths.ts` | Primeiro nível, segmento estático, sem `:clubId` — não disputa ranking com nada (as outras protegidas começam com `/books/`). O nome em português porque **URL é conteúdo que a pessoa vê**; `SETTINGS_PATH` em inglês porque **código é inglês** (`CLAUDE.md`). É exatamente o par `SEARCH_PATH` / `/busca` |
| C | **Cada controle salva sozinho** (`PATCH` com UM campo), sem botão "Salvar" | O `PATCH` é parcial de propósito (decisão C da 36). Um botão "Salvar" mandaria os cinco campos e um dia sobrescreveria `timezone` com valor velho lido no começo da sessão — que é precisamente o bug que a parcialidade existe para impedir |
| D | O horário usa **`<input type="time">`**, e só salva quando o valor **casa o `REMINDER_TIME_PATTERN`** | O controle nativo já produz `HH:mm` com zero à esquerda, que é a grafia única que o dispatcher da 37 vai fatiar com `split(':')`. ⚠️ E ele produz **`''` quando a pessoa limpa o campo** — `''` não casa o padrão, então **não se manda**; mandar daria 400 e o campo ficaria vermelho por um gesto que não é erro |
| E | A **chave pública vem do `GET /notifications/config`**, nunca de `import.meta.env` | Um `VITE_VAPID_PUBLIC_KEY` seria um SEGUNDO dono da mesma chave, congelado no **build**: girar a chave passaria a exigir rebuild do PWA, e um aparelho com o bundle velho se inscreveria com a chave velha e receberia silêncio. O endpoint já existe e já responde `{ enabled, vapidPublicKey }` |
| F | Com `enabled: false`, a tela **esconde a seção inteira do push** e diz uma frase de "indisponível" — **não** mostra um botão desligado | Botão que não funciona é convite a tocar. E `enabled: false` é o estado normal de quem clona o projeto sem VAPID configurado (decisão G da 36): não é erro, e não pode parecer erro |
| G | As **quatro** falhas do aparelho têm **frases distintas**: contexto inseguro · permissão negada · navegador sem suporte · **iPhone fora da tela de início** | São quatro causas com quatro consertos diferentes (abrir por HTTPS/localhost · reverter a permissão no navegador · usar outro navegador · **adicionar o PWA à tela de início**). Uma frase genérica de "não deu" manda a pessoa adivinhar qual das quatro. ⚠️ **A quarta é a mais cruel porque não parece falha**: no iPhone, o `PushManager` **existe** mesmo fora da tela de início, e a permissão simplesmente nunca é concedida — o feature-detect passa e o botão "não faz nada" (`docs/NOTIFICACOES.md` §7). E é o caso do **dono**, que testa no iPhone |
| H | O `endpoint` da inscrição ativa fica em **estado de componente**, lido do que o `pushManager` devolve — **não** em `localStorage` | O `DELETE` precisa do `endpoint`, e a fonte de verdade dele é o próprio navegador (`registration.pushManager.getSubscription()`). Um `localStorage` seria uma cópia que fica velha quando o navegador expira a inscrição sozinho |
| I | Toda a conversa com o navegador vive num **módulo com costura** (`push-device.ts`), e a página só fala com ele | O `jsdom` não tem `PushManager` nem `Notification`: sem a costura, os testes da página precisariam forjar três globais, e um teste que forja global testa o forjado. ⚠️ §7.1 vale para a costura: o dublê **precisa saber recusar** como o de verdade recusa (as quatro falhas da decisão G), senão ele conta uma mentira mais fácil que a realidade |
| J | ⚠️ **A seção do aparelho mora em `packages/app`, NÃO em `packages/ui`** — e isto contradiz o §7 do `docs/NOTIFICACOES.md` de propósito | O §7 manda criar `NotificationSettingsSection` em `packages/ui`. **Precedência:** `CLAUDE.md` > decisões fechadas > spec > documento de desenho — e o `CLAUDE.md` diz que `packages/ui` é de componentes **compartilhados**. Esta seção tem **um chamador só**, fala com `navigator` e `Notification` (que `packages/ui` hoje não toca em lugar nenhum) e conversa com a API. É exatamente o precedente do §7.1 que recusou subir o `matchesText` para o arquivo compartilhado enquanto ele tivesse um chamador só. Se um dia uma segunda tela precisar dela, ela sobe — com o segundo chamador na mão |

⚠️ **Decisão J é desvio consciente de documento existente.** Anote-a no relatório: se você
discordar, discorde **com medição** (nomeie o segundo chamador), não por citar o §7.

## As regras

1. **TDD estrito, outside-in.** Teste antes de implementação, sempre. O `push-device.ts` é a
   unidade com regra de verdade — comece por ele.
2. A rota `/preferencias` entra no `router.tsx` **dentro do `RequireAuth`**, com a constante
   em `pages/paths.ts` e o docblock no molde dos vizinhos (por que primeiro nível, por que
   sem `:clubId`, por que não disputa ranking).
3. A entrada no cabeçalho é um **`Link` do react-router**, nunca `<a href>` cru — âncora crua
   é navegação de documento e recarrega o PWA inteiro (o `home.tsx` registra isso). Ícone do
   `lucide-react` **mais** um rótulo acessível: ícone sozinho não tem nome.
4. ⚠️ **Nenhum texto solto.** Tudo por `t('chave')`, chave semântica em inglês, e as chaves
   entram nos **dois** catálogos (`pt` e `en`). O catálogo `en` é carregado por `import()`
   desde a Tarefa 29a — **não** o traga de volta ao chunk de entrada.
5. A tela lê `GET /me/settings` e `GET /notifications/config` ao montar, e **valida as duas
   respostas com o schema do `shared`** (§6.8). Nada de `as` nem de acesso a campo de
   `unknown`.
6. ⚠️ **PROIBIDO** nesta fatia: `import.meta.env.VITE_VAPID_*`, o pacote `web-push`, qualquer
   arquivo dentro de `packages/app/public/` que pareça service worker, e qualquer alteração em
   `vite.config.ts`. Se você achar que precisa de um deles, **pare e reporte** — é sinal de que
   a fatia escorregou para a 38.
7. ⚠️ **Nenhuma chave real em lugar nenhum.** Nos testes, a chave pública é um valor de
   fixture inventado, com forma de base64url e nome que diz que é falso. Você **não gera** par
   VAPID, **não lê** o `.env` do dono e **não cola** chave em relatório.
8. Cada controle salva com um `PATCH` de **um campo só** (decisão C). O corpo tem exatamente
   a chave que mudou — nunca o objeto inteiro, nunca `userId`.
9. ⚠️ O campo de horário **não manda `''`** (decisão D). Escreva o teste que prova isso pelo
   lado da rede: limpar o campo → **zero** requisições. Uma asserção de "não quebrou" não
   vale; conte as chamadas (§7.3: contador, nunca cronômetro).
10. Falha de escrita **não pode mentir sobre o estado**: se o `PATCH` falha, o controle volta
    ao valor anterior **e** aparece um recado. Um toggle que fica ligado na tela e desligado no
    banco é a pior forma desta tela errar — a pessoa acha que vai ser lembrada e não é.
11. ⚠️ **A varredura anti-culpa desta tela é a do VOCABULÁRIO, não a de dígito.** O
    `GUILT_TERMS` roda no catálogo e cobre os dois idiomas (§7.9) — as chaves novas entram
    nessa varredura. **Não** copie a guarda de "nenhum dígito" do feed (Tarefa 35): aqui o
    dígito é legítimo e obrigatório (`07:30` **é** um número), e uma guarda copiada para onde
    a propriedade não vale é a guarda no lugar errado, que o §7.9 diz ser pior que nenhuma.
12. ⚠️ E o texto dos controles é **primeira pessoa e sem cobrança**: "me lembre às", nunca
    "você não leu hoje". O lembrete existe para ajudar, e a tela que o configura é o último
    lugar onde cabe uma régua.
13. ⚠️ **Feature-detect ANTES de mostrar qualquer coisa** (`NOTIFICACOES.md` §7):
    `'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window`. Os
    três, não um — e a costura da decisão I é quem responde isso, para o teste poder derrubar
    cada um deles sem forjar global.
14. O botão de ativar chama, nesta ordem: `Notification.requestPermission()` →
    `navigator.serviceWorker.ready` → `registration.pushManager.subscribe({ userVisibleOnly:
    true, applicationServerKey })` → `POST /notifications/subscriptions`. ⚠️ **`userVisibleOnly:
    true` é obrigatório** — o Chrome recusa a inscrição sem ele, e a recusa vem como exceção.
15. ⚠️ O `applicationServerKey` é **`Uint8Array`, não string base64url**. A conversão
    (base64url → bytes, com o padding `=` reposto e `-_` trocados por `+/`) é a linha mais fácil
    de errar da fatia inteira, e erra **em silêncio**: uma conversão torta gera inscrição que o
    servidor de push aceita e nunca entrega. Ela é função pura, própria, testada com vetor
    conhecido nos dois sentidos, e com caso de **comprimento 65** (a chave P-256 descomprimida
    real tem 65 bytes e começa com `0x04`).

    > ⚠️ **ESTA REGRA ESTAVA PARCIALMENTE ERRADA, e quem a corrigiu foi o executor, com
    > medição.** A metade do **padding `=`** não é guarda nenhuma: `atob` implementa o
    > *forgiving-base64* do WHATWG e **aceita entrada sem padding**. Medido duas vezes — o
    > executor apagou a reposição do `=` e a suíte passou **728/728, zero acusadores**; o
    > revisor então varreu **exaustivamente** todas as 266.240 strings base64url de
    > comprimento 2 e 3 e achou **zero** diferenças entre decodificar com e sem padding
    > (e `%4 === 1` lança dos dois lados). **Mutante equivalente, provado, não afirmado.**
    >
    > A linha ficou no código — é grátis e um decodificador estrito a exigiria — mas está
    > registrada no docblock **como sem acusador**, nunca afirmada como guarda (§7.10).
    >
    > O que **de fato** erra em silêncio é a outra metade: a troca `-_` → `+/`. E mesmo essa
    > não erra calada — ela **lança** `InvalidCharacterError`. Quem carrega a propriedade de
    > verdade são os **7 acusadores** dessa troca e o **1** do tipo `Uint8Array`.
    >
    > Fica registrado porque é a quarta vez neste MVP que uma spec minha afirmou uma
    > propriedade sem medi-la (a decisão E da 30, a premissa da regra 20 da 33, a regra 2 da
    > 32c, a decisão D da 36). **Escrever "erra em silêncio" é afirmação forte e precisa da
    > mesma medição que qualquer outra.**
16. Desativar chama `registration.pushManager.getSubscription()`, manda o `endpoint` no
    `DELETE`, e **só então** desinscreve no navegador. Ordem importa: se desinscrever primeiro
    e o `DELETE` falhar, o backend fica com uma inscrição morta que o dispatcher da 37 vai
    tentar usar.
17. ⚠️ **A tela não promete notificação que ainda não existe.** Nada nesta fatia exibe push:
    o `push-handler.js` é a Tarefa 38. O texto de sucesso diz que o **aparelho foi ativado**,
    não que "você vai receber um aviso agora".
18. ⚠️ **Contexto seguro, e diga isso na tela** (decisão G). Push exige HTTPS ou `localhost` —
    é a MESMA limitação que já impede o PWA de instalar pelo IP da rede local
    (`docs/COMO-TESTAR.md`). O caminho do dono é abrir pelo `localhost` da própria máquina ou
    por um túnel; a tela que não explica isso vira um botão que "não funciona no celular".
19. Contador canônico de linhas em todo arquivo novo, e o número vai no docblock. Se a tela
    passar de ~200 linhas, **divida antes de entregar** (lição nº 8 do MVP 1) — o candidato
    óbvio é a seção do aparelho, que é a única com máquina de estados.
20. ⚠️ **O teto do chunk é 450.000 B e não se afrouxa.** A Tarefa 36 deixou o chunk em
    **421.961 B** (folga **28.039**). Meça antes e depois e **cole os dois números**. Se a
    folga acabar, a saída é `import()` nesta página (ela não está no caminho crítico), nunca
    mexer no teto.
21. Gates, todos, com os números colados:
    ```
    pnpm -r test          # baseline: shared 575 · ui 195 · backend 1684 · app 665
    pnpm -r typecheck
    pnpm lint
    pnpm prettier --check .
    pnpm --filter @clube/app build     # chunk de entrada em BYTES
    ```
    **Integração não roda aqui** — a fatia não toca backend. Se você achar que precisa, é
    porque escorregou para fora do escopo: pare e reporte.

## Arquivos

**A tocar:**
`packages/app/src/pages/preferencias.tsx` (novo) · `packages/app/src/pages/push-device.ts`
(novo) · `packages/app/src/pages/paths.ts` · `packages/app/src/router.tsx` ·
`packages/app/src/App.tsx` (só a entrada no cabeçalho) · os dois catálogos em
`packages/shared/src/locales/` · os testes correspondentes.

**A NÃO tocar:** `packages/backend/**` (inteiro — o contrato desta tela já existe e está
medido) · `packages/ui/**` (nenhum componente novo é necessário; se você achar que é, reporte
em vez de criar) · `packages/app/vite.config.ts` · `packages/app/public/**` ·
`prisma/**` · qualquer `.env`.

## Definição de pronto

- [x] `/preferencias` abre pelo cabeçalho, protegida, com as três preferências carregadas do
      `GET /me/settings`.
- [x] Cada controle salva sozinho com `PATCH` de um campo; falha volta o valor **e** avisa.
- [x] Limpar o horário **não** dispara requisição (medido por contagem de chamadas).
- [x] Com `enabled: false` a seção do push não aparece; com `true`, ativar e desativar
      funcionam ponta a ponta contra o dublê, e o `DELETE` acontece **antes** do `unsubscribe`.
- [x] As **quatro** falhas da decisão G têm quatro frases distintas, e o dublê sabe produzir
      as quatro — inclusive a do iPhone fora da tela de início, que é a que NÃO parece falha.
- [x] A conversão base64url→`Uint8Array` tem teste com vetor conhecido e com o caso de 65
      bytes.
- [x] Chaves novas nos dois catálogos, dentro da varredura `GUILT_TERMS`.
- [x] Cinco gates verdes com números colados, chunk em bytes com o "antes" e o "depois", e
      nenhum arquivo da lista de "não tocar" modificado.
