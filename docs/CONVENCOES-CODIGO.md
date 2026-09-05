# CONVENCOES-CODIGO.md — Onde o código real diverge das specs

> Criado conforme `README-IA.md` ("Se o código real divergir das specs de forma
> consistente, crie `docs/CONVENCOES-CODIGO.md` ... e declare lá que aquele arquivo vence a
> spec").
>
> **Este arquivo vence a spec** nos pontos listados abaixo. Cada entrada tem o que a spec
> diz, o que o código realmente é, e por quê. Se a razão deixar de valer, apague a entrada e
> volte ao que a spec manda.

---

## 1. Porta do Postgres no host: `5436`, não `5432`

- ❌ **Spec diz** (`docs/SETUP.md` §2 e §3): `ports: ['5432:5432']` e
  `DATABASE_URL=...@localhost:5432/clube`.
- ✅ **Real é**: `ports: ['5436:5432']` e `DATABASE_URL=...@localhost:5436/clube`.

**Por quê:** na máquina de desenvolvimento do dono as portas 5432, 5433, 5434 e 5435 já
estão ocupadas por outros containers Postgres de outros projetos (`cerebro_db`, `pg`,
`gateway-wl-pg`). Subir o `clube_db` em 5432 falharia com *port is already allocated*.

**Onde aparece:** `docker-compose.yml`, `.env.example`, `packages/backend/.env`.
Só a porta do **host** mudou — dentro do container o Postgres continua em 5432.

---

## 2. `.prettierignore` exclui Markdown

- ❌ **Spec diz** (`docs/SETUP.md` §1): `.prettierrc.json` com `printWidth: 80`, sem
  ressalva sobre quais arquivos.
- ✅ **Real é**: `*.md` e `docs/**` estão no `.prettierignore`.

**Por quê:** os documentos do projeto são escritos à mão com quebra de linha deliberada.
Rodar o Prettier neles reescreveria toda a documentação do dono num commit de formatação.
O Prettier governa o **código**; a prosa é do dono.

---

## 3. Root `package.json` tem `devDependencies`

- ❌ **Spec diz** (`docs/SETUP.md` §1): o `package.json` da raiz é "privado, `type: module`,
  **sem dependência de runtime**" e o JSON de exemplo não tem bloco `devDependencies`.
- ✅ **Real é**: a raiz tem `devDependencies` de ferramenta —
  `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-simple-import-sort`,
  `eslint-config-prettier`, `prettier`, `typescript`, `vitest`, `@types/node`.

**Por quê:** o próprio SETUP pede `"lint": "eslint ."` e um `eslint.config.js` na raiz — sem
essas devDependencies o script não roda. Nenhuma delas é dependência de **runtime**, então a
regra da spec ("sem dependência de runtime") continua respeitada.

Também foi adicionado um script `"format": "prettier --write ."` na raiz.

---

## 4. Os scripts `prisma:*` da raiz dependem de um shim no backend

- ❌ **Spec diz** (`docs/SETUP.md` §1): a raiz tem
  `"prisma:migrate": "pnpm --filter @clube/backend prisma migrate dev"` (e idem
  `prisma:studio`, `prisma:seed`), como se `prisma` fosse invocável direto.
- ✅ **Real é**: isso faz o pnpm procurar um **script** chamado `prisma` no backend. Sem ele,
  o comando não falha — imprime `None of the selected packages has a "prisma" script` e
  **sai 0**, ou seja, era um no-op que reportava sucesso. O `packages/backend/package.json`
  ganhou um script `"prisma": "prisma"` que repassa para o binário, e os três scripts da raiz
  passaram a funcionar.

**Não apague esse shim** sem antes trocar os scripts da raiz. O jeito limpo é a raiz usar
`pnpm --filter @clube/backend exec prisma ...`, ou delegar aos scripts `prisma:*` que o
backend já tem.

---

## 5. `.env.example` vive só na raiz

- ❌ **Spec diz** (`docs/tasks/03-*.md`, "Arquivos a tocar"): `packages/backend/.env.example`.
- ✅ **Real é**: só existe `.env.example` na raiz, copiado para `packages/backend/.env`.

**Por quê:** é o que o `docs/SETUP.md` §3 descreve ("`.env.example` na raiz — copie para
`packages/backend/.env`") e o que o `.gitignore` assume. A spec da tarefa é que estava
desalinhada com o SETUP. O `packages/app/.env.example` existe porque as variáveis do PWA
(`VITE_*`) são outras.

O `.env.example` da raiz também documenta `SEED_ADMIN_FORCE_PASSWORD=1`, o escape para o seed
redefinir a senha de um super-admin que já existe (por padrão ele nunca sobrescreve).

---

## 6. O padrão de rota (Tarefa 04) — decisões que as próximas ~30 tarefas copiam

Registradas aqui porque são **decisões de padrão**, não defeitos, e foram tomadas com
medição. Copie-as; não as reinvente.

### 6.1 `response` schema é fronteira de segurança, não decoração

O `serializerCompiler` do Zod é o que **corta campos não declarados**. Sem `response`
schema, o objeto de domínio inteiro vai para a rede — foi provado com `passwordHash`
vazando de um `/me` sem schema.

Duas proteções existem, e as duas importam:

1. **Guarda de boot** (`onRoute` em `src/http/server.ts`): rota sem `response` para o status
   de sucesso **não deixa o servidor subir**. Isenções mínimas e declaradas: prefixo `/docs`
   (assets do swagger-ui) e método `OPTIONS` (preflight do CORS).
2. **Rede de runtime** (`preSerialization`): se não há serializer compilado para o status
   corrente, o corpo **não sai** — vira envelope `{ error }` genérico e um `log.error`. É
   fail-safe de propósito: vazar dado privado é pior que devolver erro genérico.

**A chave `'2xx'` é recusada no boot, e isso é proteção.** `fastify-type-provider-zod@4.0.2`
não compila o coringa: a rota responderia **500 em todo sucesso**. Enumere os status
(`200`, `201`). A mensagem da guarda explica isso a quem tentar. Se o plugin for trocado um
dia, reavalie.

### 6.2 Todo erro sai como `{ error }`, e `error.message` só na classe 400

`handleDomainError` é o **único** ponto de tradução erro-de-domínio → status HTTP
(`instanceof` só ali, e só na borda). Fora da classe 400 o corpo leva **texto genérico por
status**, nunca `error.message`: mensagem de domínio é string interna, e a primeira usecase
que escrever `` `email ${x} já está em uso` `` vazaria sem nenhum gate.

O `setErrorHandler` normaliza também os erros do próprio Fastify (413, JSON malformado), para
o front não ter dois formatos. `publicMessageForStatus` é exportado e usado pelos três
pontos, para a API não ter três vocabulários de erro.

`errorSchema` tem `details?: Array<{ path, message }>`, populado **só** na classe 400 e
**só** para erro de validação do Zod. `instancePath` vira caminho legível
(`/planItems/0/title` → `planItems.0.title`). As mensagens vêm do Zod **em inglês** — a
Tarefa 12 tem de mapear `path` + código do issue para chave de i18n, **nunca** exibir
`message` cru (`CLAUDE.md`: nenhum texto solto na tela).

### 6.3 O tenant vem sempre do JWT, e o spread vem antes

```ts
await useCase.execute({ ...req.body, actorUserId: req.user.sub });
```

O tenant é atribuído **depois** do spread, sempre. E **nenhum schema de corpo declara chave
de ator ou de tenant** (`userId`, `actorUserId`, `clubId` quando vem da rota) — é o strip do
Zod que é a primeira barreira, e a ordem do spread é a segunda. Romper as duas ao mesmo
tempo dá escalação de privilégio; foi medido.

### 6.4 Autenticação: comparar sempre, mesmo sem usuário

`authenticateUser` compara o hash **sempre** — contra um `DUMMY_HASH` bcrypt real de custo 10
quando o usuário não existe ou está sem senha. Sem isso, o tempo de resposta distinguia
"conta não existe" de "senha errada" em **35x**, com status, corpo e headers idênticos.
Depois da correção: **1,06x**.

A propriedade é travada por **contagem de chamadas** do hasher (`compareCalls` no fake), não
por cronômetro — teste de tempo é instável.

### 6.5 Erro de sessão ≠ erro de tenant

`NotAMemberError` é **404** e é usado pelo guard de tenant. Nunca o remapeie para 401: um
membro legítimo que erra de clube seria **deslogado**. Sessão cujo usuário não existe mais
tem classe própria — `SessionUserNotFoundError` → **401**.

### 6.6 Composição e testes de rota

- `buildServer()` **devolve o app sem escutar**; só `main.ts` chama `listen`. É o que
  permite `app.inject()`.
- O escopo autenticado é um **plugin encapsulado**: rota nova dentro dele ganha o 401 sem o
  autor escrever uma linha sobre autenticação, e rota pública fica fora **por construção**.
- `buildRepositories(prisma)` em `src/http/` — não instancie repositórios arquivo por
  arquivo de rota.
- `BuildServerOptions.prisma?` permite injetar o cliente; o `onClose` só desconecta o que o
  servidor abriu.
- **Limpeza de fixture em teste de integração consulta o banco**, não uma lista alimentada
  pelas respostas esperadas — senão um teste que falha no meio vaza fixture e a limpeza
  estoura na FK. O formato a copiar é o de `invite-routes.integration.test.ts`.
- **Teste de contrato não depende de estado deixado por outro teste.** Um que dependia
  passava verde quando rodado isolado, sem exercitar o filtro que dizia provar.

### 6.7 Matar o servidor de desenvolvimento exige matar o watcher

`pnpm dev:backend` sobe **dois** processos: o supervisor `tsx watch` e o filho que escuta.
Matar só quem está na porta faz o supervisor respawnar. Mate o supervisor primeiro.

### 6.8 O cliente VALIDA a resposta de sucesso — e isso obriga as telas a duas coisas

`RequestOptions.schema` é obrigatório de propósito (Tarefa 12): toda chamada roda o
`response` schema de `shared` sobre o corpo que voltou, e é isso que dá tipo à tela **sem um
`as` sequer**. A decisão fica. Mas ela tem duas consequências que precisam estar escritas
antes de as telas 15+ nascerem em cima delas.

**1. Campo de `*ResponseSchema` não se renomeia nem se remove sem deploy do front junto.**
As duas direções não são simétricas:

- Campo **novo** no backend é seguro — o `parse` do Zod faz *strip*, o front antigo ignora.
- Campo **renomeado ou removido** quebra a tela **em cheio**: o `safeParse` falha, vira
  `ApiError` genérico, e a pessoa vê `errors.unknown` numa tela que funcionava. Não é
  degradação parcial; é a tela inteira.

Precisa evoluir? O campo entra `optional()` primeiro, os dois lados sobem, e só então a
obrigatoriedade muda. É a mesma disciplina de migration em duas fases, aplicada ao contrato
HTTP.

**2. `ApiError` com `status` 2xx significa "o servidor aceitou e EXECUTOU".**
É o único caso em que o erro na mão da tela não corresponde a uma recusa: o `POST` gravou a
nota, respondeu `201`, e o corpo é que não casou o schema (ou nem era JSON — o
`navigateFallback` do service worker devolvendo `index.html` para um `GET /api/...` produz
exatamente isto, com `status: 200`).

**A fila offline da Tarefa 21 não pode reenviar isso** — reenviar é gravar a nota duas vezes.
E a 21 precisa de um **discriminador explícito** no `ApiError` (um campo dizendo "chegou e foi
recusado" × "chegou e foi aceito" × "não chegou"), **não** de uma dedução por faixa de status
espalhada pelo código da fila: hoje a distinção existe só para quem souber que `status >= 200
&& status < 300` num `ApiError` quer dizer isso. `isNetworkError` (`status: 0`) já cobre "não
chegou"; falta a outra ponta.

O `cause` do `ApiError` guarda o `ZodError` original nesse caminho — é o único que sabe **qual
campo** quebrou. Não vai para a tela (a tela usa `apiErrorKey`); existe para o log não dizer
só `Unexpected response body`.

---

## 7. Convenções de fake e de teste

Registradas aqui, e não em docstring de arquivo de teste, porque **é isso que as torna
convenção**. A auditoria da Tarefa 10 achou a mesma asserção vazia que a auditoria da
Tarefa 08 já tinha condenado: o veredito estava escrito, mas escrito num único arquivo de
teste, onde ninguém que escreve o próximo passa. Uma lição que vive num comentário não é
regra do projeto — é lembrança de quem estava lá.

### 7.1 Fake mais restritivo que o banco também é infidelidade

As duas direções escondem bug, e a **restritiva esconde melhor**, porque a suíte fica
**verde**: o fake recusa o que o Postgres aceitaria, o teste do caso legítimo nunca é escrito
(ou nasce provando o comportamento errado), e a divergência só aparece quando alguém tenta a
operação real. A direção permissiva pelo menos costuma quebrar em produção logo. → ADR 0007
(`docs/adr/0007-order-do-plano-nao-e-unique.md`), que nasceu exatamente disto: um fake
emulando `unique(bookId, order)` reprovava a renumeração de plano que o banco aceita.

Ao escrever ou crescer um fake de repositório, a pergunta é sempre **"o Postgres faria
isto?"** — nas duas direções. Já são **cinco** aparições desta classe, e nenhuma delas era
óbvia antes de alguém procurar:

| Onde | A fidelidade | O que o fake errado esconderia |
|---|---|---|
| Plano de leitura (Tarefas 06/07 → ADR 0007) | `@@unique` emite índice único, que **não é deferível**: valide **linha por linha**, contra o estado da tabela naquele instante — não o lote em conjunto | Aceitaria um swap de datas que o banco recusa e recusaria a renumeração que ele aceita |
| `unique(planItemId, userId)` (Tarefa 08) | Índice único **não compara `NULL` com `NULL`**: N anotações avulsas do mesmo autor convivem | Reprovaria a segunda avulsa — o oposto do "ilimitado" que o BACKLOG decidiu |
| `ILIKE` do `text` (Tarefa 10) | Case-insensitive **sim**, accent-insensitive **NÃO**: `'coração' ILIKE '%coracao%'` é falso | Passaria verde e a busca real não acharia nada (`unaccent` é Tarefa 29, com migration e ADR) |
| Coluna nula no `find` (Tarefa 10) | `WHERE "planItemId" = 'x'` contra coluna nula é **falso** | A nota avulsa casaria o filtro por dia de leitura, e a tela do dia mostraria o que não é dela |
| `update(id, patch)` da nota (Tarefa 11) | O patch que o repositório **honra de fato** — o `toUpdateData` do Prisma tinha allowlist (`title`, `reference`, `doc`, `plainText`, `status`, `archivedAt`, `updatedAt`), o fake aplicava **toda** chave menos `id` | `update(id, { userId: 'x' })` **trocava a autoria no fake** e era **no-op silencioso no Postgres**: todo teste de autoria escrito contra o fake afirmaria uma regra que o banco não tem |

As duas do meio são do mesmo par de linhas de código, e a quarta **foi entregue sem teste**:
o comentário afirmava a fidelidade, e a assimetria (o método vizinho tinha o teste análogo
para `= NULL`) foi o que denunciou o esquecimento. **Fidelidade afirmada em
comentário e não em teste é fidelidade que o próximo refactor apaga.**

### 7.1.1 O patch de um `update` é um TIPO PRÓPRIO, nunca `Partial<Entidade>`

A quinta aparição é a primeira em que a saída **não** foi cobrir a divergência com teste, e
sim **estreitar o tipo do patch** — e é o padrão a copiar. A origem do bug era o próprio
`Partial<Note>` na assinatura do port: ele **promete o que o repositório Prisma não cumpre**,
porque `Partial<Entidade>` inclui identidade (`id`), tenant (`clubId`/`bookId`), autoria
(`userId`) e âncora (`kind`/`planItemId`) — campos que nenhum UseCase patcheia e que o
`toUpdateData` filtrava calado, enquanto o fake obedecia.

A regra, em uma frase: **o patch de um `update` deve ser um tipo próprio que enumera os
campos patcheáveis, não `Partial<Entidade>`.** No `NoteRepository` isso é o `NotePatch`
(`Partial<Pick<Note, 'title' | 'reference' | 'doc' | 'plainText' | 'status' | 'archivedAt' |
'updatedAt'>>`). As três consequências vieram de graça, e é isso que mede a escolha:

1. O `toUpdateData` **não precisa de allowlist** — não há o que filtrar.
2. O `NoteRepositoryFake.update` **encolheu**: nenhum patch alcança par
   `(planItemId, userId)` de outra nota, então a checagem do índice único saiu do `update` e
   ficou só no `save`. Uma semântica emulada a menos é uma fonte de bug a menos.
3. Os testes por campo proibido **encolheram para um**: o compilador recusa
   `update(id, { userId })`, e a prova disso é um `@ts-expect-error` em
   `note-repository-fake.test.ts` mais o `pnpm -r typecheck`, em vez de um teste de runtime
   por campo, em duas implementações.

⚠️ **O que o tipo NÃO fecha, e a frase honesta.** A checagem de propriedade em excesso do
TypeScript só vale para **objeto literal fresco**. Medido na auditoria: `update(id, { userId })`
é recusado nos 7 casos, mas

```ts
const loose = { title: 'ok', userId: 'x' };
await notes.update(id, loose); // compila
```

**atravessa**. Então a frase certa não é "o estado ilegal deixou de ser representável" — é
**o compilador recusa o literal, e o fake recusa o resto**: o `NoteRepositoryFake.update`
copia **campo a campo** as sete chaves do `NotePatch` em vez de espalhar o patch, e é isso que
faz a divergência deixar de existir mesmo com o tipo furado. Copiar campo a campo é uma
semântica emulada **a menos** (§7.1), não a mais: o fake passa a fazer exatamente o que o
`toUpdateData` do Prisma faz.

A alternativa mais forte, **não adotada**: declarar o `NotePatch` com as chaves proibidas
tipadas como `never` (`{ userId?: never; clubId?: never; ... }`), o que reprova também o patch
por variável. Descartada porque paga caro pelo pouco que acrescenta — a lista de proibidos
teria de ser mantida à mão e em dia com a entidade (o `Pick` atual é a lista de PERMITIDOS, que
não envelhece), o erro do compilador vira uma mensagem sobre `never` que não diz o que fazer, e
o buraco que ela fecha já está fechado pelo fake, onde é observável em teste. Se um dia um
UseCase montar patch dinamicamente, reavalie.

**Corolário a registrar, não consertar:** com o `id` fora do `NotePatch`, a regra 9 do contrato
("`id` no patch não troca a chave primária") **não tem mais teste de runtime** — o mutante que
faz o `toUpdateData` mapear `id` sobrevive. Hoje é equivalente: nenhum chamador consegue
montar o patch, e o `@ts-expect-error` do fake guarda a porta do literal. Fica anotado porque a
regra continua no ADR 0008 e no contrato, e quem a ler vai procurar o teste que a prova.

**Dívida anotada, não consertada:** `BookRepository.update` tem **a mesma forma latente** —
`Partial<Book>` no port e allowlist no `toUpdateData` do `PrismaBookRepository`. Hoje não
morde (nenhum UseCase manda campo proibido, e o teste de contrato prova a allowlist), e é
fatia fechada; fica registrado aqui para quem a reabrir aplicar o `BookPatch`. Quem escrever
o port de `Highlight` (Tarefa 22) já nasce com o tipo estreito.

### 7.2 A enumeração do fake é INVERTIDA de propósito — e o teste que não é sobre ordem não pode depender dela

O `NoteRepositoryFake` devolve, nos dois métodos de coleção, na ordem **inversa** à de
inserção. **Não conserte isso.** Nasceu de um teste de ordenação da Tarefa 07 que passava com
`orderBy: id` porque os fixtures já estavam na ordem esperada — um falso verde perfeito. Como
o port declara explicitamente que **não promete ordem**, e a ordem que o Postgres devolve sem
`ORDER BY` é indefinida de verdade (depende de plano de execução e de `VACUUM`), "invertida" é
tão fiel quanto qualquer outra — e é a única que **falha** quando alguém confia na ordem do
repositório. Quem escrever o fake de `Highlight` (Tarefa 22) faz o mesmo.

**E o mesmo cuidado vale contra o BANCO, onde não há armadilha nenhuma para ajudar.** Medido na
rodada de correção da Tarefa 11: o `planItemWritersByBook` do Prisma não tem `orderBy` (o port
promete "sem ordem"), e o Postgres devolve ora na ordem de inserção, ora pelo índice
`(bookId, userId)` — **na mesma suíte, entre execuções**. Os dois testes de rota da
sobreposição escreviam "fora da ordem do plano de propósito" e mesmo assim não acusavam o
mutante que monta a resposta na ordem dos pares: a autora do primeiro dia era a `marcos`, e
`marcos < maria` fazia a ordem errada **coincidir** com a certa. O `beforeAll` tinha a
intenção certa e um acidente de nomenclatura a anulava.

O conserto **não** foi acrescentar `orderBy` ao repositório — seria pedir à persistência uma
promessa que o port não faz, e o fake já enumera invertido justamente para ninguém depender
dela. Foi escolher **ids de autor cuja ordem alfabética é o oposto da ordem esperada** (quem
ordena primeiro no alfabeto escreve o último dia do plano), e **pinar a precondição no teste**
(`expect(MARCOS_ID < MARIA_ID).toBe(true)`), senão um `prefixedId` renomeado devolve a
coincidência em silêncio. Fixture de ordenação se escolhe para a implementação errada
**falhar**; se você não mediu que ela falha, você não tem o teste que o nome promete.

⚠️ E o limite honesto, também medido: a ordenação dos `userIds` **não é decidível contra o
Postgres**. Quando a enumeração vem pelo índice `(bookId, userId)`, os pares já chegam em
`userId` crescente — que é o que o `.sort()` produziria —, então o mutante que remove o `sort`
acusa quando o banco enumera por inserção e fica **verde** quando enumera pelo índice, sem que
nada no teste escolha qual. Ordenar um conjunto que já vem ordenado é indistinguível por
construção: essa propriedade se prova onde ela é decidível, no unitário com o fake invertido
(`sorts the userIds of an entry`), e o teste de rota diz no comentário que não a prova.

**O corolário, que é a parte fácil de esquecer:** se a enumeração é armadilha, um teste cujo
assunto **não é** a ordem não deve depender dela. **Ordene antes de comparar**
(`expect([...ids].sort()).toEqual(...)`) ou use `arrayContaining` + `toHaveLength`. Senão o dia
em que a armadilha virar outro critério legítimo, esses testes quebram por um motivo que não
tem nada a ver com o nome deles — e quem estiver lendo o vermelho vai procurar o bug no lugar
errado. A ordem tem **testes dedicados** (`enumerates in reverse insertion order`, um por
método): é lá que ela é assunto, e é só lá que se pina.

### 7.3 Contador de chamadas, nunca cronômetro

`saveCalls` · `updateCalls` · `findCalls` · `findByBookCalls` · `planItemWritersByBookCalls` ·
`compareCalls` — o padrão vem do §6.4, onde travar a comparação de hash por **tempo** seria
teste instável e travar por **contagem** é exato.

O contador conta a **chamada, não o sucesso**: uma escrita recusada pelo índice também foi
uma tentativa, e é isso que o teste quer saber. E é o que distingue coisas que o resultado não
distingue:

- **"não chamou" × "chamou e não mudou nada"** — `saved` inalterado não separa as duas, e
  "chamou à toa" é um `UPDATE` por request em toda tela que salva sem mudar nada.
- **"recusou antes de ler" × "leu e depois recusou"** — dão o mesmo erro para o cliente, e a
  segunda ordem trafega o acervo de um clube para quem não é dele antes de descartá-lo. Todo
  corte de tenant precisa de um `xxxCalls === 0`, e precisa dele para **cada** leitura de
  conteúdo: o plano de um livro (os temas de cada dia) é conteúdo do clube tanto quanto a
  nota. A auditoria da Tarefa 10 achou um mutante que lia o plano antes do corte e sobrevivia
  a 906 testes, porque o único contador afirmado era o das notas.
- **"o filtro foi para o repositório" × "o resultado deu certo"** — e aqui o contador não
  basta: quem pina isso é o `findFilters`, que guarda uma **cópia** do filtro de cada chamada.
  Três propriedades da Tarefa 10 só existem por causa dele: que o UseCase manda
  `status: 'ACTIVE'` (em vez de carregar tudo e filtrar em memória — o mesmo bug com uma
  fatura de banco maior), que manda **um** `NoteFilter` só e sem chave à toa (em vez de N idas
  ao banco), e que o `text` chega normalizado (vazio não vai; o de verdade vai sem as pontas).
  Nenhuma das três muda o resultado num cenário sem nota arquivada.

Um contador só afirmado como `toBe(0)` é meio contador: escreva também o lado **positivo**
(`toBe(2)`), senão um incremento que alguém apague deixa todo `toBe(0)` passar por acidente —
e aí ele é a asserção vazia do §7.4.

### 7.4 `resolves.not.toBeInstanceOf(AlgumError)` é asserção vazia

Quando o valor resolvido é `Note[]`, `PlanItemWriters[]` ou `{ note, created }`, ele **nunca**
poderia ser um `Error`: o `not.toBeInstanceOf` não asserta nada, e só o `resolves` morde. O
teste passa a dizer apenas "não rejeitou" — com um nome que promete ter provado uma regra de
autorização.

**Asserte a saída real** ("o `MEMBER` recebe as notas do clube"), e nomeie o teste pelo que ele
entrega, não pelo erro que não veio. Medido: com os dois UseCases da Tarefa 10 mutilados para
`return []`, as **quatro** ocorrências do padrão continuavam verdes.

**O ponteiro é pelo NOME do teste, nunca pela linha.** As duas ocorrências anteriores estavam
registradas como `list-books.test.ts:100` e `get-book-with-plan.test.ts:179`, e a segunda já
tinha virado a linha 208 na fatia seguinte: um ponteiro por número envelhece sozinho, e o
próximo leitor confere a linha errada, não acha nada e conclui que a dívida foi paga.

**E a segunda forma da mesma classe, medida na rodada de correção da Tarefa 15:**
`expect(screen.getByRole(...)).toBeDefined()`. O `getBy*` do Testing Library **lança**
quando não acha — então o `expect` não asserta nada, e o teste diz só "a query não
explodiu". Eram 11 ocorrências nos testes de tela do app. O conserto é `queryBy*` +
`not.toBeNull()`, que é asserção de verdade (o `queryBy*` devolve `null`), ou uma
asserção sobre o conteúdo. **Um `expect(...).toBeDefined()` só vale sobre valor que
PODE ser `undefined`** — `expect(bodyToken).toBeDefined()` em `theme-tokens.test.ts` é
legítimo e fica.

- ❌ **Ainda existe:** `list-books.test.ts`, teste `never raises ForbiddenRoleError on a read`
  — fatia fechada, registrado aqui para quem a reabrir. **Não copie de lá.**
- ✅ **Corrigida:** `get-book-with-plan.test.ts` tinha o mesmo teste, com o mesmo nome, sobre
  `{ book, planItems, writers }`. Foi consertada na rodada de correção da Tarefa 11 — o
  arquivo tinha sido reaberto naquela fatia (ganhou o `writers`) e o teste ao lado continuou
  como estava, que é exatamente como esta classe sobrevive. Hoje é
  `gives the MEMBER the book, the plan and the writers of the whole club`, e asserta a saída:
  com o UseCase mutilado para devolver `planItems: []` e `writers: []`, ele **acusa**.

**Reabriu um arquivo? Olhe o teste do lado.** Foi a lição da rodada: o esforço estava todo no
campo novo, e a asserção vazia de dois metros acima passou batida outra vez.

### 7.5 Contrabando se testa com o ator legítimo, assertando a linha gravada

Testar "o `userId` do corpo é ignorado" com um **ator de fora** não prova nada sobre o campo:
a requisição morre no guard de tenant, e morreria igual se o contrabando funcionasse. O teste
tem de usar o **ator legítimo**, mandar o campo proibido, e assertar **o que foi gravado** (ou
devolvido) — que é a única coisa que muda quando o contrabando pega.

E o mutante perigoso não é `input.userId` cru: é **`input.userId ?? req.user.sub`**, o
envenenamento com fallback. Ele se comporta **normalmente** quando o campo está ausente, ou
seja, em todo teste que não manda o campo — e é exatamente por isso que um teste que só olha o
caminho felizapassa. → §6.3 (o tenant vem do JWT, e o spread vem antes).

### 7.6 Losslessness se prova por snapshot antes/depois, nunca por `toBe`

Para afirmar "esta operação não perdeu nada", capture o estado **antes**, execute, capture
**depois** e compare os dois. Um `toBe(valorEsperado)` escrito à mão prova só que aquele valor
sobreviveu — e o campo que a operação apagou é justamente o que ninguém pensou em listar.

### 7.6.1 Fixture que o framework não interpreta é fixture que anula o teste

Duas aparições, as duas na rodada de correção da Tarefa 15, e as duas **verdes**. É a
irmã de tela do §7.1: o fixture é *mais pobre* do que o real, o teste continua passando,
e a propriedade que o nome dele promete deixa de ser provada.

| Onde | O que parecia | O que era |
|---|---|---|
| `MemoryRouter initialEntries` | `[{ pathname: '/books/abc?tab=plano#dia-3' }]` monta aquele endereço | o react-router **confia no campo** e NÃO parseia: `search` e `hash` ficam `''`. Aí `${pathname}${search}${hash}` **é** o `pathname`, e o mutante que joga fora `search` e `hash` no `RequireAuth` passava nos 33 testes do arquivo — três deles chamados *"preserves the destination /books/abc?tab=plano#dia-3"* |
| `document.body.textContent` | "a frase não está na tela" | ele só vê **nós de texto**. Mover a frase da API para `title` ou `aria-label` deixava os 152 testes verdes — e `aria-label` é justamente o que o leitor de tela **fala**. A regra 19 falhava exatamente para quem depende dela |

O conserto do primeiro é `parsePath(path)` (ou a string crua, quando não há `state`); o do
segundo é varrer **texto + atributos que carregam texto** (`title`, `aria-label`,
`placeholder`, `alt`, `value`) — é o `readableText()` de
`packages/app/src/pages/__tests__/harness.tsx`. Os dois valem para as telas 16+.

A pergunta a fazer, e ela é a do §7.1 escrita para tela: **o navegador faria isto?** Um
fixture que o framework interpreta diferente do runtime real é falso verde, mesmo quando
o valor escrito nele está certo.

### 7.7 Fixture de objeto é factory, nunca `const` de `describe`

Já é o §6.6 e vale para todo fake e todo teste: um objeto compartilhado entre testes é estado
escondido, e o `doc` de uma `Note` é mutável por dentro (é uma árvore ProseMirror). Factory
com `overrides` — `aNote`, `aBook`, `aPlanItem`, `validInput`.

### 7.8 A asserção que se AUTOAJUSTA — os dois lados calculados pelo código sob teste

A irmã do §7.4: aqui o `expect` existe, o valor não é impossível, e a asserção **ainda** não
asserta nada — porque o esperado é produzido pela mesma coisa que produz o obtido. Se a
implementação mudar, os dois lados mudam **juntos**, e o teste continua verde.

Três aparições, todas medidas na rodada de correção da Tarefa 16:

| Onde | O que parecia | O que era |
|---|---|---|
| `localDay`, regra 4 (fuso inválido) | `expect(localDay(AHEAD, broken)).toBe(localDay(AHEAD, localTimeZone()))` prova "cai no fuso do ambiente" | o **fallback** estava fixo no código; o mutante que o troca por `'UTC'` sobrevive, porque os dois lados usam o mesmo fuso, qualquer que ele seja. O conserto foi **injetar** o fuso de fallback e exigir **dois fusos, dois dias diferentes** — e provar o PADRÃO mexendo em `process.env.TZ`, que é a única forma de escolher o lado esperado à mão |
| `FORMAT_LOCALE` | `expect(new Intl.DateTimeFormat(FORMAT_LOCALE).resolvedOptions().calendar).toBe('gregory')` prova o pino da locale | numa máquina `en-US` (o CI) o `undefined` **também** resolve `gregory`/`latn`. O que precisa estar certo é o pino, então a asserção é sobre a **string** da locale, mais um par positivo que mostra `th-TH` respondendo o ano budista |
| Ordem dos clubes | `'Clube do Casal'` antes de `'Clube dos Amigos'` é a ordem da API, e ordenar por nome "mudaria o padrão" | **falso**: o espaço (U+0020) precede o `s`, então a ordem alfabética COINCIDIA com a da API, no `sort()` cru **e** no `localeCompare(_, 'pt')`. É o §7.2 outra vez, e a saída é a mesma: escolher o fixture para a implementação errada **falhar**, e **pinar a precondição** |

A pergunta a fazer, e ela é uma só: **quem escolheu o valor esperado?** Se a resposta for "a
função que estou testando", ou "o ambiente", não há asserção — há uma identidade.

**Corolário de fixture: fixture não depende do RELÓGIO.** Um `month: '2026-09'` escrito à mão
num teste que compara `book.month` com o mês de hoje prova a regra só enquanto o relógio
estiver naquele mês — em outro mês o mesmo livro vira "passado" ou "futuro" e o teste muda de
assunto sem uma linha alterada. Foi o que o `aPlanItem()` com `date: '2026-09-04'` (a data de
hoje na rodada em que ele nasceu) instalou: quem escrevesse o próximo teste com a fábrica veria
o atalho de hoje aparecer e concluiria que provou a regra. Data padrão de fábrica é
**notoriamente não-hoje**; quem testa a fronteira do calendário **deriva** de hoje.

### 7.9 Guarda de requisito mora onde a propriedade é DECIDÍVEL — e não onde é fácil de escrever

Requisito de produto sem guarda automática é intenção (`docs/adr/0002-*.md` virou varredura no
`FilterChip`; o §1 do plano virou varredura na home). Mas **uma guarda no lugar errado é pior
que nenhuma**, porque ela dá a sensação de cobertura: a varredura anti-culpa da Tarefa 16 tinha
sete termos, duas classes literais e rodava em 6 dos 13 estados da tela, e **três de quatro**
cobranças plantadas pela auditoria passaram por ela.

A partição a copiar, e ela é a lição:

- **VOCABULÁRIO é propriedade do catálogo**, não da tela. Um teste em
  `packages/shared/src/locales/__tests__/` percorre `pt` **e** `en` inteiros: independe de
  estado, independe de locale, e não depende de alguém lembrar de chamá-lo no estado novo.
  ⚠️ Todo teste de tela **pina `pt`** (o `navigator.language` do jsdom é `en-US`), então uma
  guarda de palavra que vive na tela **nunca vê o catálogo `en`** — metade dos idiomas que o
  app declara suportar.
- **O que não é catálogo é DOM**: número renderizado a partir de dado (um "0 de 30 dias" não
  está em catálogo nenhum) e cor. E aí a varredura roda em **todos** os estados — o estado
  "feliz" incluído, que na Tarefa 16 era exatamente o que faltava.
- **Palavra e cor pedem larguras diferentes.** Palavra se varre por **radical** (`'tras'` pega
  "atrás", "para trás", "atrasado" e "atraso"), porque a próxima frase é escrita por alguém
  que não leu a lista. Cor se varre por **regex**, nunca por strings literais de classe:
  `['text-danger', 'bg-danger']` conhecia duas grafias e `text-[#b3261e]` ou um `style` com a
  variável crua passavam em 192 testes.
- **E o NOME do teste é parte da guarda.** `has no danger colour anywhere on the home, in ANY
  state` lia o arquivo-fonte e não renderizava estado nenhum. O nome prometia a propriedade
  que a auditoria mostrou não existir, e foi o nome que fez ninguém ir procurá-la.

### 7.10 "Não é decidível em jsdom" é uma afirmação que precisa de medição

O comentário que declara um mutante indecidível é uma dívida sem prazo: ninguém volta a
conferir. Dois foram conferidos na rodada da Tarefa 16, e o resultado foi um de cada lado.

- ❌ **Era falso.** *"o `act()` descarrega os efeitos antes de qualquer asserção, e quem quiser
  provar o primeiro frame precisa de navegador de verdade, não de jsdom."* `renderToString`
  (`react-dom/server`, já disponível) **não roda efeito nenhum** — ou seja, é literalmente o
  frame que o `act()` descarta e o navegador pinta. Vinte linhas, e as duas defesas do frame
  inicial passaram a ter acusador.
- ✅ **Era verdade, e a saída é outra.** "que dia é hoje" calculado em `'UTC'` em vez do fuso do
  ambiente: em jsdom o fuso do processo **é** o do teste, e os dois só divergem em certas horas
  do dia — o teste seria verde ou vermelho conforme a hora em que a suíte roda. A propriedade
  se prova onde ela É decidível (o unitário de `localDay`, que exige dois fusos e dois dias),
  e o comentário no lugar indecidível **aponta para lá**.

A regra: antes de escrever "isto não é testável aqui", tente a ferramenta que não roda efeito
(SSR), a que escolhe o ambiente (`process.env.TZ`) e a que conta chamadas (§7.3). E se a
afirmação sobreviver, ela vem com **onde a propriedade É provada** — não sozinha.
