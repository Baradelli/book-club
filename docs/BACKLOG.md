# BACKLOG.md — Clube do Livro fatiado

> A ordem de execução. Uma tarefa por vez, de cima para baixo. O racional de cada decisão
> está em `docs/plano-clube-do-livro.md`; as regras de como trabalhar estão em `CLAUDE.md`;
> o detalhe de cada fatia está em `docs/tasks/`.
>
> **As specs em `docs/tasks/` são detalhadas uma de cada vez**, conforme a tarefa se
> aproxima — para não gerar 40 specs que envelhecem antes do uso. O Bloco A já está
> detalhado. Quando chegar perto de uma tarefa ainda não detalhada, **peça para detalhá-la**
> antes de começar.

## Legenda de status

`[ ]` a fazer · `[~]` em revisão · `[x]` feito

---

# MVP 1 — Núcleo de leitura

## Decisões fechadas do MVP 1 (não reabrir sem decisão do dono)

- **Um único PWA responsivo** (`packages/app`). Não criar `web/` e `mobile/` separados.
- **Multi-clube via `Membership` desde a primeira migration.** Nunca existe a versão "um
  clube só".
- **Tenant conferido em toda leitura**: `Membership` ativo do `req.user.sub` no `clubId`.
  Sem membership → **404**, não 403.
- **Convite por link com código, uso único, sem SMTP.** Não existe cadastro aberto. A pessoa
  define a própria senha no aceite.
- **Plano de leitura com datas.** `ReadingPlanItem` tem `date` + `title` (tema) +
  `reference`. Datas únicas por livro e `order` crescente.
- **Anotação do dia é única por pessoa por leitura** (`unique(planItemId, userId)`).
  **Anotação avulsa é ilimitada** e exige `title`.
- **O `doc` é ProseMirror JSON; `plainText` é derivado no backend** e nunca entra no input.
- **Ninguém edita/arquiva conteúdo de outra pessoa.** Autor manda na nota; admin do clube
  manda no livro e no plano.
- **Tudo compartilhado dentro do clube.** O filtro é navegação, não permissão. Não existe
  nota privada.
- **Clube arquivado sai do seletor, mas o acervo continua legível** para quem tem
  `Membership` **ativo**. O guard de tenant confere só o membership, e a assimetria com o
  `createBook` (que recusa) é intencional: não se acrescenta a um clube encerrado, mas o que
  já está lá continua legível. → `docs/adr/0009-*.md`.
- **Sem grifos, sem `ReadingLog`, sem feed e sem push no MVP 1** — MVPs 2 e 3.

## Sequência do MVP 1

> Domínio primeiro (testável com fake repo), depois persistência, depois rota, depois tela.
> TDD estrito no domínio/UseCases; bordas (repo/rota) só no essencial; UI só nos fluxos que
> quebram em silêncio.

### Bloco A — Clube, convite e sessão

- [x] **01** — Domínio `Club`/`Membership` + UseCases `createClub` (só super-admin) e
      `addMember`/`assertMembership` (o guard de tenant, puro). → `tasks/01-usecase-clube-membership.md`
      _Entregue: `domain/{club,errors}.ts`, os 3 ports + 3 fakes (2 deles com suíte própria
      em `_fakes/__tests__/`), os 3 UseCases. **51 testes verdes** (create-club 13 ·
      add-member 12 · assert-membership 8 · club-repository-fake 7 ·
      membership-repository-fake 11). Setup do monorepo (Tarefa 0) junto — ver
      `docs/CONVENCOES-CODIGO.md`._
- [x] **02** — Domínio `Invite` + UseCases `createInvite` (só admin do clube; código, papel,
      validade) e `acceptInvite` (uso único, expiração, cria `User` + `Membership`, define
      senha). → `tasks/02-usecase-convite.md`
      _Entregue: domínio `User`/`Invite`/`Settings` + `normalizeEmail`, 6 erros novos, 5 ports
      + 5 fakes (com suíte própria), os 2 UseCases. `UserReader` removido e `createClub`
      migrado para `UserRepository`. Builders de teste extraídos para `src/test-support/`.
      **135 testes verdes** no pacote (84 desta fatia)._
- [x] **03** — Prisma: schema inicial + primeira migration + repos (`User`, `Club`,
      `Membership`, `Invite`, `Settings`) + `BcryptPasswordHasher` + teste de contrato.
      → `tasks/03-prisma-migration-inicial.md`
      _Entregue: `schema.prisma` com os 5 modelos do Bloco A + 2 enums, migration `init`
      gerada pelo Prisma, os 5 repos, `BcryptPasswordHasher` + `RandomCodeGenerator`, seed
      idempotente do super-admin, `vitest.workspace.ts` separando unit/integração.
      **150 testes unitários + 25 de integração** (os 4 índices únicos cobertos)._
- [x] **04** — Fastify de pé: `buildServer()`, Zod type provider, Swagger, JWT, escopo
      autenticado + rotas `/auth/login`, `/auth/refresh`, `/clubs`, `/invites`,
      `/invites/:code/accept`, `/me`. → `tasks/04-rotas-auth-clube-convite.md`
      _Entregue: schemas Zod em `packages/shared`, `buildServer()` (sem escutar), escopo
      autenticado encapsulado, `handleDomainError` (14 linhas), UseCases `authenticateUser`
      e `getMe`, `MembershipRepository.findByUser`, as 6 rotas + `/health`.
      **190 unit + 75 integração + 21 em `shared`.** Corte de tenant coberto.
      Padrão de rota documentado em `docs/CONVENCOES-CODIGO.md` §6._

### Bloco B — Livro e plano de leitura

- [x] **05** — Domínio `Book` + `ReadingPlanItem` + UseCase `createBook` (com o plano
      ordenado; só `OWNER`/`ADMIN`; datas únicas e crescentes; `title` do item obrigatório).
      → `tasks/05-usecase-book-plano.md`
      _Entregue: domínio `Book`/`ReadingPlanItem`, `calendar-day.ts` (`CalendarDay` como
      `string` "YYYY-MM-DD" — ver `CONTEXT.md`), `InvalidBookError`, 2 ports + 2 fakes com
      suíte própria, `createBook`. **316 testes unitários** no pacote ao fechar a fatia
      (126 desta fatia). _Nota: a Tarefa 06 extraiu a validação de plano para
      `domain/reading-plan.ts` e migrou 18 testes de `create-book.test.ts` para lá — os
      números acima são o registro histórico do fechamento da 05, não o estado atual._
      **Pendência para a Tarefa 07:** registrar `[InvalidBookError, 400]` no
      `handleDomainError` E remover `'InvalidBookError'` de `NOT_YET_MAPPED` no teste de
      exaustividade — os dois no mesmo commit, senão a suíte fica vermelha._
- [x] **06** — UseCases `editBook` · `archiveBook` · `listBooks(clubId)` ·
      `getBookWithPlan` (livro + plano ordenado) · `replacePlanItems` (**diff por data**, que
      preserva o `id` do item e portanto as anotações). → `tasks/06-usecases-book-plano-leitura.md`
      _Escopo ajustado com o dono: **"quem já escreveu em cada dia" saiu daqui** para o Bloco
      C (ver Tarefa 10), porque `Note` e a tabela dele só existem lá.
      Entregue: os 5 UseCases, `BookNotFoundError`, ports e fakes crescidos, e a extração de
      `domain/{reading-plan,book-fields,optional-text}.ts` + `usecases/book-for-actor.ts`
      (o guard de tenant do livro), cada um com suíte própria. **546 testes unitários.**
      **Gerou `docs/adr/0007-order-do-plano-nao-e-unique.md`** — a Tarefa 07 deve declarar
      `@@index([bookId, order])`, NÃO `@@unique`, senão "empurrar o plano" falha em produção._
- [x] **07** — Repos Prisma de `Book`/`ReadingPlanItem` + teste de contrato + rotas
      `/clubs/:clubId/books` e `/books/:bookId`. → `tasks/07-prisma-rotas-book-plano.md`
      _Entregue: migration `book_and_reading_plan` (com `@@index([bookId, order])` por
      ADR 0007), os 2 repos, `calendarDayToDate`/`dateToCalendarDay` (só UTC, com guarda de
      ESLint), `replaceForBook` atômico em `$transaction`, schemas Zod em `shared`, as 6
      rotas. `calendar-day` e a regra de sequência de datas **mudaram para `shared`** — uma
      implementação, borda e domínio como chamadores. `NOT_YET_MAPPED` esvaziado.
      **523 unit + 151 integração + 135 em `shared`.**_

**Bloco B fechado.** Falta registrar: `@@index([bookId, date])` é redundante com o
`@@unique([bookId, date])` — limpar quando alguma migration mexer na tabela de verdade.

### Bloco C — Anotações

- [x] **08** — Domínio `Note` + UseCases `upsertPlanNote` (uma por pessoa por `planItemId`;
      título vem do tema) e `createFreeNote` (`title` obrigatório, `reference` livre).
      → `tasks/08-usecase-note.md`
      _**`docToText` foi ANTECIPADO da Tarefa 09 para cá** — o ADR 0001 deriva `plainText` a
      cada escrita, e esta é a primeira escrita; sem ele a nota nasceria com `plainText: ''`,
      invisível na busca do MVP 2 para sempre. **A linha 09 fica só com `editNote` +
      `archiveNote`.**
      Entregue: `domain/{note,doc-to-text}.ts` (`Note`, `NoteDoc`, `assertNoteDoc`,
      `isNoteDocNode`, `normalizeNoteTitle`, `docToText` iterativo), `InvalidNoteError` (400)
      e `PlanItemNotFoundError` (404) **já mapeados** (`NOT_YET_MAPPED` continua vazio), o
      port + fake de `Note`, `ReadingPlanItemRepository.byId` (port + fake + repo Prisma + 3
      casos de contrato), os 2 UseCases. **717 unit + 154 integração + 135 em `shared`.**
      Auditoria por mutação: 41 mutantes, 35 mortos na primeira passada; os 6 sobreviventes
      viraram a rodada F1–F9 (+9 testes). Decisões registradas: título do PLAN
      **ressincroniza** com o tema a cada upsert · `reference` do PLAN é sempre `null` ·
      upsert **reativa** nota arquivada (senão o índice único vira 409 permanente) · tipo de
      nó desconhecido conta como **bloco** (inline grudaria palavras e as tiraria da busca) ·
      travessia **iterativa** (a recursiva estoura, e há teste que prova isso)._
      _**Pendência medida para a Tarefa 14:** `docToText` é linear e barato em CPU (50 mil
      nós em 10,6 ms), mas o custo é de MEMÓRIA — 1 milhão de nós dá ~230 MB de RSS. Hoje o
      `bodyLimit` default de 1 MB do Fastify segura; ao elevá-lo para colar imagem no editor,
      limite **contagem de nós**, não só bytes._
- [x] **09** — UseCases `editNote` (deriva `plainText`) e `archiveNote` (só o autor).
      → `tasks/09-usecases-editar-arquivar-nota.md`
      _`docToText` **saiu daqui** e foi entregue na Tarefa 08 — ver o motivo lá.
      Entregue: `noteForAuthor` (o guard de tenant + autoria, extraído por já ter 2
      chamadores), `editNote`, `archiveNote`, `NoteNotFoundError` (404) e
      **`NotTheAuthorError` (403)** — o **único 403 do projeto**, e é o ADR 0002 que faz isso:
      o membro já VÊ a nota na listagem, então 404 seria teatro e mentiria para o front, que
      precisa distinguir "não existe" de "não é sua". A **ordem é obrigatória**: membership
      antes de autoria, senão a diferença 403×404 vira o vazamento de existência que o 404
      evita. `NoteRepository` ganhou `byId` + `update` + `updateCalls`.
      **819 unit + 154 integração + 135 em `shared`.**
      Auditoria por mutação: 48 mutantes, 44 mortos na primeira passada; os 4 sobreviventes
      viraram a rodada de correção (+5 testes). Decisões: `editNote` **recusa** nota `PLAN`
      (o `upsertPlanNote` é o caminho da nota do dia, e é ele que ressincroniza o título —
      dois caminhos deixariam o título velho) · `archiveNote` **aceita** nota `PLAN`, e é
      seguro porque o `upsertPlanNote` reativa a arquivada · arquivar **não apaga conteúdo**.
      **Gerou `docs/adr/0008-updated-at-e-do-dominio.md`** — o `Note` nasce **sem**
      `@updatedAt` e o `archiveNote` PASSA a escrever `updatedAt`._
      _**Pendência para a Tarefa 11, do ADR 0008:** o `toUpdateData` do `PrismaNoteRepository`
      **mapeia `updatedAt`** e **nunca mapeia `id`** (um `id` no patch trocaria a chave
      primária de verdade, enquanto o fake o descarta — a classe do ADR 0007). Teste de
      contrato: o `updatedAt` que o domínio escreveu é o que volta, e patch com `id` não troca
      a chave._
      _**Para a Tarefa 18:** o `byPlanItemAndUser` devolve a nota **arquivada** de propósito,
      então a tela de hoje carregaria o `doc` dela como rascunho — decidir se é o desejado. E
      reativar zera o `archivedAt` sem registro: hoje o `upsertPlanNote` é um desarquivamento
      de facto para notas `PLAN` (desarquivar oficial é MVP 4)._
- [x] **10** — UseCase `listNotes(filter)` — por livro, autor, `kind`, `planItemId` e texto.
      É o que alimenta o filtro geral. → `tasks/10-usecase-listar-notas.md`
      _**Herdado da Tarefa 06:** inclui o UseCase que devolve **quem já escreveu em cada
      `planItemId`** de um livro — a sobreposição de autoria que a tela do livro (Tarefa 17)
      precisa. Saiu da 06 porque `Note` não existia ainda. **Entregue como UseCase próprio
      (`listPlanItemWriters`), não dentro do `getBookWithPlan`** — aquele já está ligado à rota
      da Tarefa 07, e crescer o construtor dele exigiria o `PrismaNoteRepository`, que é da
      11. A agregação ficou registrada na linha 11.
      Entregue: `listNotes`, `listPlanItemWriters`, `NoteFilter` + `find` +
      `planItemWritersByBook` no port, `PlanItemWriter` no domínio, `findFilters`/contadores no
      fake. **Nenhuma classe de erro nova**; `src/http/` intocado.
      **908 unit + 154 integração + 135 em `shared`.**
      Auditoria: 43 mutantes, 38 mortos; 2 equivalentes provados, 1 blindagem sem
      consequência, e **2 cegueiras reais** consertadas — o plano podia ser lido antes do corte
      de tenant (faltava contador de `findByBook` no fake do plano) e a fidelidade "coluna
      `NULL` não casa `= 'x'`" era comentário sem teste.
      Decisões: ordem é `createdAt` **desc** com desempate por `id` (não `updatedAt`, senão a
      lista pula embaixo do dedo de quem digita) · **sem `includeArchived`** e **sem
      paginação** (flag sem chamador é especulação) · `bookId` de outro clube devolve **vazio**,
      não 404 · o fake **enumera em ordem inversa de propósito**, para um UseCase sem `sort`
      falhar._
      _**Gerou o §7 do `docs/CONVENCOES-CODIGO.md`** ("Convenções de fake e de teste"): as duas
      direções de infidelidade de fake, a armadilha da ordem invertida, contador de chamadas em
      vez de cronômetro, a asserção vazia `resolves.not.toBeInstanceOf`, contrabando com ator
      legítimo e o mutante `?? fallback`. Subiu de nível porque o veredito da Tarefa 08 vivia
      num comentário de arquivo de teste — e o padrão condenado voltou nesta fatia._
      _**Dívida medida (decisão D, aceita):** `listNotes` não pagina. **~6,8 KiB de heap por
      nota** (o `doc` ProseMirror inteiro); a quebra é na ordem de **10 mil notas por clube** —
      clube de 10 pessoas em 3 anos, ~70 MB de heap e ~150 MB de pico. Irrelevante para o clube
      de casal (~2.100 notas em 3 anos ≈ 15 MB). Condição para a Tarefa 11: **não expor
      listagem de clube inteiro sem `bookId` sem um `take` de teto**, ou o teto vem com a
      primeira tela que pagine._
- [x] **11** — Repo Prisma de `Note` (com o índice único) + teste de contrato + rotas
      `/notes` + **teste de integração do corte de tenant**. → `tasks/11-prisma-rotas-note.md`
      _Entregue: migration `note` gerada pelo Prisma, `PrismaNoteRepository` (7 métodos),
      as 6 rotas, `groupWritersByPlanItem` (puro) com `getBookWithPlan` **e**
      `listPlanItemWriters` chamando a mesma função, schemas Zod em `shared`, e as **seis
      pendências herdadas** das Tarefas 06/08/10 e do ADR 0008 — todas fechadas.
      **948 unit + 261 integração + 179 em `shared`.**
      **`onDelete: Restrict` DECLARADO, não herdado:** o default do Prisma para relação
      opcional é `SetNull` — medido com `migrate diff --from-empty`. Sem a declaração, remover
      um dia do plano zeraria o `planItemId` da nota e deixaria uma linha `kind='PLAN'` com
      `planItemId=null`: estado que nenhum UseCase produz, que nenhuma validação pega, e que
      ninguém percebe. A suposição da Tarefa 06 ("o `Restrict` que herdamos") era falsa.
      Auditoria: 33 mutantes, 5 sobreviventes, todos consertados — **o pior era a guarda do
      plano DESLIGADA na rota**, invisível a 1202 testes porque só a fiação não tinha teste._
      _**`NotePatch`:** o patch do `update` deixou de ser `Partial<Note>` — identidade,
      tenant, autoria e âncora saíram do tipo. Efeito colateral bom: nada cria par duplicado
      via `update`, então a validação do índice **saiu** do `update` do fake (uma semântica
      emulada a menos, §7.1). Ressalva medida: a checagem do TS só vale para **literal**, então
      quem fecha o resto é o fake copiando campo a campo. `BookRepository.update` tem a mesma
      forma latente — dívida anotada, não consertada._
      _**Registrado:** `find` tem `take: 500` + `orderBy [createdAt desc, id asc]` como
      **válvula, não paginação** (a primeira tela que paginar troca por cursor);
      `bodyLimit` de 256 KiB por rota de escrita — medido: cabem ~234 mil caracteres de prosa
      ou ~12,5 mil nós, e trava o `docToText` em ~2,9 MB de heap, duas ordens de grandeza
      abaixo do perigo. A Tarefa 14 eleva o limite global para colar imagem: **não elevar o
      das notas**._
      _**Herdado da Tarefa 06:** a guarda de **não remover um `ReadingPlanItem` que já tem
      nota** no `replacePlanItems`. Sem ela, o `onDelete: Restrict` faz a operação falhar por
      FK; e "consertar" com `Cascade` apagaria anotação de outra pessoa._
      _**Herdado da Tarefa 10 — a agregação de `writers` é desta fatia.** A 10 entregou
      `listPlanItemWriters` como UseCase próprio porque crescer o `getBookWithPlan` lá
      quebraria `src/routes/book-routes.ts` (construtor sem fiação: o `buildRepositories` não
      expõe `notes` até existir o `PrismaNoteRepository`). Aqui rota, repositório e schema
      estão na mesma fatia, então decida: compor os dois UseCases na rota (o "o Fastify
      agrega" do `CLAUDE.md`) ou crescer o `getBookWithPlan`. **E cresça o schema Zod da
      resposta em `shared/`** — pelo §6.1 do `CONVENCOES-CODIGO`, campo não declarado no
      `response` é apagado pelo serializer **em silêncio**._
      _**Herdado da Tarefa 10 — os curingas do `LIKE`.** Medido contra o Postgres 16 do
      projeto: `'axb' ILIKE '%a_b%'` é **verdadeiro** (o `_` casa qualquer caractere) e
      `'100% garantido' ILIKE '%100%%'` também. O `Prisma.contains` repassa `%` e `_` como
      curinga; o fake da Tarefa 10 os casa **literalmente**. Infidelidade na direção
      restritiva — o fake acha menos que o banco, então **nenhum teste verde acusa**. Decidir
      aqui: escapar `%`/`_`/`\` no `PrismaNoteRepository` antes do `contains` (o `$queryRaw` é
      proibido pelo `CLAUDE.md`), ou aceitar o curinga e documentar._
      _**Herdado da Tarefa 08 — forma obrigatória do índice.** O modelo tem de nascer com
      `planItemId String?` (NULLABLE) e `@@unique([planItemId, userId])` **exatamente nessas
      duas colunas**, sem `status` e sem `bookId`. Índice do Postgres é `NULLS DISTINCT` por
      default, e é isso que o fake emula. Se o `planItemId` nascer não-nulo com sentinela
      (`''`) para as avulsas, **toda avulsa do mesmo autor colide** — a regra "avulsa é
      ilimitada" vira 409 em produção com a suíte unitária verde. Se o índice incluir
      `status`, o banco aceita uma segunda nota depois de a primeira ser arquivada e o fake
      fica **mais restritivo que o banco** (a outra direção do ADR 0007)._
      _**Herdado da Tarefa 08 — corrida na nota do dia.** `upsertPlanNote` lê e depois
      escreve. Dois autosaves sobrepostos da mesma pessoa no mesmo dia leem `null` e ambos
      inserem → `P2002`, que o `handleDomainError` **relança** (500). O editor autossalva e a
      fila offline reenvia, então a forma é real. O `save` do repo Prisma precisa fazer upsert
      **no unique composto** (`where: { planItemId_userId: … }`), não por `id`. Teste de
      integração a escrever: dois `upsertPlanNote` do mesmo autor no mesmo item em
      `Promise.all` — sem 500 e com **uma** linha na tabela._

**Bloco C fechado — e com ele o BACKEND do MVP 1.** O que falta do MVP 1 é tela.

### Bloco D — Frontend

- [x] **12** — Scaffold do `packages/app`: Vite + PWA, Tailwind v4, tema claro/escuro,
      i18n (pt/en), `react-router-dom`, `RequireAuth`, cliente HTTP e token em `shared`.
      → `tasks/12-scaffold-app-pwa.md`
      _Entregue: `createApiClient`/`createTokenStorage`/`apiErrorKey` em `shared/client`
      (**fábricas com dependência injetada** — `shared` é dependência do backend, então nada
      lá pode tocar navegador), catálogos `pt`/`en`, o app Vite+PWA com tema, i18n, rotas e
      `RequireAuth`, tokens mínimos em `ui/theme.css`.
      **253 em `shared` + 52 no app + 948 no backend + 261 de integração.**
      Auditoria: 20 mutantes, 9 sobreviventes. **Os três consertos que mais valeram trocaram
      teste por erro de compilação:** (1) `"lib": ["ES2022"]` só no `shared` — o pacote herdava
      `DOM` e o compilador **nunca foi gate**, a regra vivia de regex, e sondas com
      `globalThis.location?.href` passavam pelas duas portas; (2) `@custom-variant dark` — o
      `dark:` do Tailwind ignorava o `data-theme`, então sistema escuro + "Claro" escolhido
      daria tokens claros com `dark:*` escuro (a Tarefa 13 nasceria em cima disso); (3)
      `CustomTypeOptions` do i18next — `t('chave.errada')` compilava e passava nos 31 testes,
      que é o sintoma exato que a regra de paridade existe para impedir. O tipo que resolve,
      `TranslationCatalog`, já existia sem uso._
      _**Confirmado por leitura do bundle, não por dedução:** o service worker **não**
      intercepta `/api` — `fetch` de API nunca tem `mode: 'navigate'`, e a denylist recusa
      mesmo em navegação direta (agora pinada por teste ao `DEFAULT_API_URL`)._
      _**Gerou o §6.8 do `CONVENCOES-CODIGO`:** o cliente valida a resposta de sucesso com o
      schema de `shared` (dá tipo à tela sem um `as`), e isso impõe duas regras às telas 15+ —
      campo de `*ResponseSchema` **não se renomeia nem se remove** sem deploy conjunto (campo
      novo é seguro, o `parse` faz strip; campo removido quebra a tela em cheio, e entra
      `optional()` primeiro); e um `ApiError` com status **2xx** significa "o servidor aceitou e
      executou, só não entendemos a resposta" — **a fila offline da Tarefa 21 não pode
      reenviar isso**, e precisa de discriminador explícito._
- [x] **13** — Design system em `packages/ui`: tokens `--clube-*` em `theme.css`, componentes
      base (botão, campo, sheet, lista, chip de filtro, avatar de pessoa).
      → `tasks/13-design-system-ui.md`
      _Entregue: a paleta `--clube-*` completa, `cx`, e os 6 componentes (`Button`, `Field`,
      `Sheet`, `List`/`ListItem`, `FilterChip`, `PersonAvatar`) com foco, `aria-*` e alvo de
      toque testados. **253 shared + 100 ui + 74 app + 948 backend + 261 integração.**
      **A cascata de tema deixou de ser duplicada:** `light-dark()` põe claro e escuro na mesma
      linha, e a escolha explícita passou a trocar **uma** declaração (`color-scheme`) em vez
      de repetir a paleta. Medido em Chrome headless nas 4 combinações de sistema × escolha, e
      a armadilha também: um componente que declare `color-scheme` próprio inverte os tokens
      dentro de si — daí a regra dos três seletores.
      Auditoria: 34 mutantes, 7 sobreviventes, todos fechados._
      _**Dois achados de ferramenta que valem para as fatias seguintes:** (1) o Tailwind v4
      **ignora `node_modules`**, e num workspace pnpm o `@clube/ui` chega como symlink lá —
      sem `@source '../../ui/src'` **todo componente renderiza cru**, e o sintoma parece bug de
      CSS; (2) o Tailwind extrai nome de classe de **comentário e de arquivo de teste** —
      medido: uma lista de utilitários citada num teste emitia 3,5 kB de CSS morto, e um
      `min-h-10` citado em comentário *para dizer que não serve* gerava a classe. Resolvido com
      `@source not '**/__tests__'` (17,77 kB → 14,27 kB). E o `grep` ingênuo mente: o Tailwind
      **escapa** o seletor (`mt-[137px]` → `.mt-\[137px\]`)._
      _**A regressão que a suíte não via:** o shell pintava `bg-surface` (cor de **cartão**)
      como fundo de página, então todo `hover:bg-surface` de componente ficou com **contraste
      zero** nos dois temas — o hover do item de lista, único retorno visual de "dá para tocar
      aqui", tinha desaparecido. Consertado para `bg-canvas`, com teste da hierarquia
      página ≠ cartão ≠ elevado._
      _**A guarda do ADR 0002 virou durável:** varrer palavras (`lock`, `private`) não pega
      cadeado **desenhado à mão** — um SVG inline passou pelos 89 testes. Agora a varredura
      cobre todo `ui/src` **e** `<svg` inline é proibido em `ui/`: todo ícone vem do
      `lucide-react` (como o `CLAUDE.md` exige), então o **nome importado** cai na varredura._
      _**E `--passWithNoTests` saiu dos 4 pacotes:** com o `include` do vitest quebrado, o
      comando responde **exit 0 com zero testes** — os 100 testes de `ui` podiam desaparecer
      com `pnpm -r test` verde._
- [x] **14** — **Editor `RichEditor`** em `packages/ui`, conforme `docs/EDITOR.md`: núcleo +
      tabela + callout + colar/soltar imagem + menções `@`/`[[`, barra fixa, bubble menu,
      menu `/`, drag handle, `editor.css`, teste de regressão do paste de imagem.
      → `tasks/14-rich-editor.md`
      _Entregue: `RichEditor` + menu `/` + menções `@`/`[[` + callout + upload por
      paste/drop + barra fixa + bubble menu + o `editor.css` inteiro, com os `@tiptap/*` **só
      em `packages/ui`** (o `app` não tem nenhum) e versões **pinadas exatas** (2.27.3).
      **173 ui + 253 shared + 75 app + 948 backend + 261 integração.**
      Auditoria: 37 mutantes, e ela achou **um crash no código entregue, não num mutante** —
      trocar `editable` de `true` para `false` matava a tela com o `NotFoundError` da §11. O
      `BubbleMenuView` destaca o próprio elemento no construtor, e a §11 tinha sido aplicada
      ao wrapper da pílula e **esquecida nas duas superfícies que são elas mesmas
      condicionais**. Barra e bubble menu agora ficam **sempre montados**, com o `editable?`
      no conteúdo. É a direção que a Tarefa 18 vai exercitar em cheio (abrir a nota de outra
      pessoa em leitura)._
      _**O `EDITOR.md` ganhou a §15, "Notas de reconciliação (Tarefa 14, medidas)"** — porque
      3 coisas que ele afirma deixaram de ser verdade e 1 nunca foi: (a) **6 dos 14 tokens do
      §13 não existem** com aquele nome, e `html.dark` nunca existiu (o tema é `light-dark()`
      desde a 13); (b) **a pegadinha da `PluginKey` do §9 não acontece mais** na 2.27.3 —
      medido removendo as duas chaves, suíte verde; elas ficam como proteção contra downgrade;
      (c) quem destaca o elemento na §11 é **o próprio TipTap**, não o tippy; (d) **o §4.3
      (drag handle) NÃO foi implementado** — não existe na linha 2.10 (primeira gratuita: 2.22)
      e o `extension-drag-handle` declara `y-prosemirror` + `extension-collaboration` como
      peers **obrigatórios**: embarcaria a stack yjs num PWA sem colaboração. **Decisão do
      dono.**_
      _**Dois `onChange` espúrios eliminados**, e os dois viravam autosave na Tarefa 18:
      `setEditable` emite `update` mesmo sem mudança (`emitUpdate` é `true` por default), e
      `setContent(doc, true)` emitiria a cada nota carregada do servidor — mais entrada no
      histórico, com o `Ctrl+Z` desfazendo o **carregamento**._
      _**Exigência medida para a Tarefa 18:** o editor custa **+454 kB brutos / +143 kB
      gzip** (~2,5× o app inteiro), não os ~300 kB estimados. O bundle de hoje tem **zero
      TipTap** porque nenhuma tela o importa — então o `lazy()` não é otimização, é requisito:
      a tela de login não pode baixar o ProseMirror. O `editor.css` já embarca 6,8 kB no CSS._
      _**A §14 do `EDITOR.md` (checklist no celular) continua do dono** — não marcada aqui._
- [x] **15** — Telas de login e de aceite de convite (`/login`, `/convite/:code`).
      → `tasks/15-telas-login-convite.md`
      _Entregue: as duas telas com React Hook Form + `zodResolver` sobre os schemas de
      `shared` (nenhum schema novo no app), o destino preservado funcionando ponta a ponta, e
      um cliente HTTP **público sem `onUnauthorized`** — porque `POST /auth/login` com senha
      errada responde 401 e disparava o `signOut()`.
      **255 shared + 173 ui + 163 app + 949 backend + 262 integração.**
      Auditoria: 47 mutantes, 11 sobreviventes, todos fechados._
      _**A premissa da spec estava INVERTIDA, e a guarda escrita cedo pegou:** eu afirmei que
      o tree-shaking já podava o editor. Nunca podou — o "zero TipTap" da Tarefa 14 foi
      medido quando **nenhuma tela importava de `@clube/ui`**. Com o primeiro
      `import { Button }` o bundle foi a **684 kB** com ProseMirror dentro. E o meu
      diagnóstico da causa também estava errado: medido, isentar **só** `packages/ui` dá o
      mesmo bundle que isentar `@tiptap` também — a metade `@tiptap` era peso morto que ainda
      **sobrescrevia** a declaração do próprio `tippy.js` sobre o CSS dele.
      **Conserto estrutural, feito no momento mais barato que ia existir:** `RichEditor` saiu
      do barril para a entrada `@clube/ui/editor`, e `packages/ui` declara
      `sideEffects: ["**/*.css"]`. Cada uma das duas basta sozinha; as duas ficam. O
      `vite.config.ts` do app ficou **sem isenção nenhuma** — a poda deixou de depender de
      metadado e passou a ser estrutural. E o editor foi provado **funcionando a partir do
      bundle emitido**: 5 tipos de nó renderizam e um clique em "Lista" produz transação real._
      _**O 409 do aceite mentia, e a minha regra 16 era factualmente errada.**
      `AcceptInvite` **não lança `EmailAlreadyInUseError`** — e-mail já cadastrado é o caminho
      de **sucesso** (`reuseUser`). Os 409 eram `InviteAlreadyUsedError` **e**
      `DuplicateMembershipError`, sem discriminador, e marcar o campo de e-mail dizia
      `aria-invalid="true"` num valor válido **e** suprimia o `role="alert"` — quem usa leitor
      de tela não ouvia nada. **`InviteAlreadyUsedError` passou a 410** (1 linha no
      `handle-domain-error.ts`): o 409 agora significa só membership duplicado, e o
      `field: 'email'` ficou correto. O 404 também era ambíguo (`InviteNotFound` +
      `ClubNotFound`) e a frase foi desambiguada._
      _**Gerou o §7.6.1 do `CONVENCOES-CODIGO`:** "fixture que o framework não interpreta é
      fixture que anula o teste". A regra 3 desta fatia **nunca foi provada** — o teste
      entregava o destino como campo `pathname`, o react-router não parseia isso, e `search`/
      `hash` ficavam vazios, então o mutante que os joga fora passava nos 152. A mesma
      armadilha estava plantada no harness, esperando a Tarefa 16. O §7.4 ganhou a segunda
      forma da classe: `expect(getBy*(...)).toBeDefined()` não asserta nada — quem morde é a
      query._
      _**E a regra 19 falhava exatamente para quem depende dela:** texto da API em
      `title`/`aria-label` passava nos 152, porque o teste lia `textContent`, que só vê nós de
      texto — e `aria-label` é o que o leitor de tela fala. O teste passou a varrer atributos._
      _**Registrado para a Tarefa 18:** o `docs/EDITOR.md` §1 não menciona a entrada nova
      `@clube/ui/editor`; a 18 é a primeira que vai importar dali._
      _**Herdado da Tarefa 12:** o `RequireAnonymous` manda todo mundo para a home
      incondicionalmente, e **ninguém lê o `state.from`** que o `RequireAuth` preserva — a
      regra 21 grava o destino e a 23 o joga fora. Quem abre `/books/abc#dia-3` sem sessão
      entra e cai na home. O helper `isFromLocationState` já existe e não tem chamador de
      produção._
- [x] **16** — Home: seletor de clube + lista de livros do clube + atalho para a leitura de
      hoje. → `tasks/16-home-seletor-livros.md`
      _Entregue: `localDay` em `shared` (que o `CLAUDE.md` prometia e **nunca havia sido
      criado**), o **clube ativo** como contexto + persistência (o termo do `CONTEXT.md` que
      até aqui não existia em código), a estante e o atalho da leitura de hoje.
      **277 shared + 175 ui + 199 app + 949 backend + 262 integração.**
      Auditoria: 32 mutantes, 11 sobreviventes, todos fechados._
      _**Um bug de produto VIVO, achado por sonda que passou de primeira:** o `listBooks`
      ordena `month` **descendente** — e o comentário dele **e a minha spec** diziam "mês
      corrente primeiro". Com o livro do mês seguinte já cadastrado (fluxo normal: o admin
      cadastra antes de o mês virar), a home pedia o plano do livro **futuro** e **o atalho de
      um toque desaparecia** no dia em que mais importa. Nenhum teste pegava: todos os fixtures
      do atalho usavam um livro só. Consertado com orçamento de 2 requisições — pede o plano do
      primeiro **não futuro** e, só se ele não tem item de hoje, o do próximo. Os dois
      comentários errados foram corrigidos._
      _**A guarda anti-culpa que eu criei era em boa parte teatro:** 3 de 4 cobranças plantadas
      sobreviveram. A lista de termos não pegava "deixou 3 dias para trás" nem "atrazo" com
      erro de digitação; o vermelho por valor arbitrário (`text-[#b3261e]`) passava nos 192,
      porque a varredura conhecia **duas strings literais**; e uma cobrança no estado **com
      atalho** tinha zero cobertura, porque a função de varredura nunca era chamada ali — que é
      exatamente onde a cobrança nasceria. Mais o catálogo `en`, descoberto.
      **A guarda mudou de lugar:** vocabulário agora é varrido no **catálogo** (`pt` e `en`,
      recursivo, independente de estado e de quem lembra de chamar), e o DOM ficou com cor e
      número, em **todos** os estados._
      _**Um modo de falha silenciosa por idioma no `localDay`:** sem a locale fixa, um
      navegador em **tailandês** formata o ano budista (`2569-…`), o validador de formato
      **aceita**, e "hoje" nunca casa nenhum item do plano — o atalho desaparece só para quem
      tem aquele idioma. Agora a locale é assertada. Também: `'UTC+3'` estoura e `'+03:00'`
      não, então quem validar `Settings.timezone` não pode supor "tem sinal ⇒ inválido"._
      _**"Não é testável" era falso, e eu tinha comprado.** O executor concluiu que o mutante
      do primeiro frame só seria decidível em navegador; o revisor provou com `renderToString`
      — SSR não roda efeito nenhum, então é literalmente o frame que o `act()` descarta.
      Gerou o **§7.10**: "não é decidível em jsdom" precisa de medição, com um caso falso e um
      verdadeiro._
      _**Gerou também §7.8** (asserção que se autoajusta ao ambiente não decide nada — o
      fallback de fuso comparado com `localTimeZone()` batia dos dois lados) **e §7.9** (a
      guarda mora onde a propriedade é decidível)._
      _**`ListItem` com `href` recarregava o PWA inteiro** (âncora crua num app com router).
      Consertado por **inversão** em `packages/ui`: `renderLink` deixa o consumidor passar o
      `Link` do roteador — e `ui` continua sem conhecer `react-router`. A recomendação anterior
      (`onClick` + `useNavigate`) trocava um defeito por outro: perderia Ctrl+clique e "abrir em
      nova aba"._
      _**Registrado para a Tarefa 18:** a `bundle-guard` soma **todos** os `.js` contra um teto
      e exige zero marcas de editor em qualquer asset — as duas asserções são **impossíveis** na
      18 mesmo com o editor em chunk lazy. Ela precisa virar **por chunk** antes, senão o
      caminho fácil vai ser relaxar o teste._
      _**Lacunas de backend registradas, não abertas:** o `/me` não devolve `timezone` e não
      existe `GET /clubs/:clubId` — então o front usa o fuso do **navegador**, que é o certo
      para "hoje para quem está olhando"; quando o `Settings` for exposto (36/46), a escolha
      explícita vence. E um `GET /clubs/:clubId/today` resolveria a home em **uma** requisição
      em vez de três._
- [x] **17** — Tela do livro: plano de leitura, dia de hoje destacado, quem já escreveu em
      cada dia, abas Anotações/Grifos (grifos desabilitada até o MVP 2).
      → `tasks/17-tela-do-livro.md`
      _Entregue em **247 linhas** de produção (spec curta de propósito — o dono pediu para
      cuidar da complexidade): uma requisição, uma lista, nenhum componente novo, nenhuma dep.
      **221 no app** (eram 200). A estante da home passou a linkar para cá pelo `renderLink`,
      que nasceu na Tarefa 16 e estava sem chamador._
      _**A revisão focada achou um buraco que valia para o app inteiro:** `text-red-600`
      atravessava **todas** as guardas de cor — a varredura de DOM (que procurava `text-[#` e
      `-danger`), a de arquivo-fonte, o lint e o typecheck. Causa: `@theme inline`
      **acrescenta** tokens e não zera `--color-red-*`, então a paleta padrão do Tailwind
      seguia viva. O princípio anti-culpa era contornável escrevendo a cor do jeito mais
      natural do mundo. **Conserto na raiz:** `--color-*: initial` no `@theme inline`, com
      `--color-black` redeclarado (única cor padrão em uso, o fundo do `Sheet`). Provado com o
      **mesmo comentário** citando `text-red-600`, `bg-rose-500`, `border-amber-400` e
      `text-danger`: o varredor vê as quatro, as três primeiras emitem **zero CSS** e a última
      é emitida. A cor errada deixou de ser detectada e passou a ser **impossível**._
      _**E o avatar mentia.** Com `name={userId}` o `PersonAvatar` extraía a primeira letra do
      UUID e desenhava um "F" ou um "C" — inicial com cara de inicial e de ninguém. Agora é
      `name={null}`, que cai no glifo neutro da regra 29 da Tarefa 13. A cor continua vindo do
      id (duas pessoas seguem distinguíveis); o que falta é saber **qual** é você._
      _**Registrado para a Tarefa 18** (que toca os mesmos arquivos): duas guardas anti-culpa
      divergentes (a `home.test.tsx` ficou com a versão fraca da Tarefa 16 — sem radicais, sem
      remoção de diacrítico, sem regex de placar — e cobranças que morrem na tela do livro
      **sobrevivem** na home); o elo `localDay` ↔ tela **não** está pinado (`new
      Date().toISOString()` sobrevive, e é cara-ou-coroa no relógio: vermelho só entre 21h e
      24h locais); e o `listItemRouterLink` mora em `book.tsx`, então o acusador da estante da
      **home** vive na suíte da **outra** tela._
- [x] **18** — Tela da anotação do dia: editor + autosave 1500 ms + indicador de status.
      → `tasks/18-tela-anotacao-do-dia.md`
      _**É A FATIA QUE TORNOU O APP USÁVEL.** Duas pessoas abrem o trecho do dia, escrevem com
      autosave, e leem o que a outra escreveu. **305 linhas** de lógica nova; **257 no app**
      (eram 221)._
      _**O editor entrou `lazy`, e o corte de chunk é o que salva a tela de login:** entrada
      com **364 kB e ZERO marcas** de TipTap, editor num chunk próprio de **452 kB que o
      `index.html` nem referencia**. A `bundle-guard` virou **por chunk** (entrada limpa e
      abaixo do teto · o chunk do editor existindo · total num teto maior) — a asserção mudou
      para descrever a verdade nova, não foi relaxada._
      _**As três armadilhas de autosave, todas pinadas:** abrir a nota e não digitar **não
      dispara `PUT` nenhum** (os dois `onChange` espúrios que a Tarefa 14 consertou chegariam
      aqui como "um salvamento por anotação aberta"); doc vazio é doc válido, então "abrir e
      sair" não cria nota vazia; e o debounce é **debounce, não throttle** — provado por
      contagem com timers falsos (1499 ms → 0 requisições, 1500 ms → 1)._
      _**Uma decisão do executor que melhorou a spec:** sair da tela com mudança pendente
      **faz** o `PUT`, uma vez. A regra só pedia "não dispara duas vezes" — mas com
      `clearTimeout` no desmonte, o que a pessoa digitou nos últimos 1500 ms iria para o lixo,
      e não há rascunho local até a Tarefa 21._
      _**`me` exposto no contexto de clube** (~14 linhas, zero backend): a tela separa a minha
      anotação das outras, e o avatar da Tarefa 17 finalmente diz **você**. A armadilha nomeada
      foi respeitada — `me` é `null` fora do `ready`, senão `userId === undefined` faria todo
      mundo deixar de ser "você" em silêncio (3 acusadores)._
      _**Os três achados da revisão da 17, fechados:** a varredura anti-culpa virou **um**
      helper usado pelas três telas (a da home era a versão fraca da Tarefa 16, e cobranças que
      morriam na tela do livro **sobreviviam** lá); o elo `localDay` ↔ tela ficou determinístico
      com `TZ` pinado no `vitest.config.ts` + `setSystemTime` (antes era cara-ou-coroa no
      relógio); e o `listItemRouterLink` saiu para `src/router-link.tsx`, com o acusador da
      estante da home agora **na suíte da home** (antes: 0 acusadores lá)._
      _**Lacunas registradas:** nenhuma rota lista os membros do clube, então a nota da outra
      pessoa aparece como "Alguém do clube" (a cor, vinda do id, ainda a distingue) — o `me`
      fechou só a metade "você". E a abertura da tela custa 2 requisições; um
      `GET /plan-items/:id/context` resolveria em 1._
- [x] **19** — Tela da anotação avulsa (título + referência livre + editor) e a listagem com
      o filtro básico **Tudo · Minhas · De outras pessoas**.
      → `tasks/19-anotacao-avulsa-e-filtro.md`
      _**A ESCRITA FECHOU.** Além da anotação do dia, a ideia que veio da página 112 tem tela
      própria (criar, editar, arquivar), e a aba **Anotações** da tela do livro deixou de ser
      um rótulo: mostra o acervo do clube, filtrável. **298 testes no app** (eram 262);
      **4.515 linhas** de produção no app, das quais **580 de código** em `free-note.tsx` — a
      maior tela do projeto, porque acumula criar + editar + ler a alheia + arquivar. É o
      próximo lugar onde a complexidade morde, e fica registrado._
      _**O filtro é `Tudo · Minhas · De outras pessoas`, e não `de <pessoa>` como esta linha
      pedia — a lacuna é de backend.** Medido: `listNotes` devolve `userId`, `writers` devolve
      `userId`, o `/me` traz só os **meus** clubes, e **não existe rota que liste os membros de
      um clube com nome**. Um chip escrito "de Alguém do clube" não é filtro, é enigma. Num
      clube de **duas** pessoas os três chips são informação completa (o complemento de
      "minhas" é exatamente "dela") e custam zero backend. Com três ou mais pessoas, o chip por
      pessoa exige `GET /clubs/:clubId/members` — **a mesma lacuna** que impede o avatar de
      dizer o nome de quem escreveu (Tarefas 17 e 18)._
      _**O filtro é feito no cliente**, sobre a lista já carregada: "minhas" é recorte do mesmo
      acervo, não pedido novo ao servidor. E ele é **navegação, não permissão** (ADR 0002) — a
      varredura de privacidade roda nesta tela também._
      _**Achado da revisão, consertado na raiz: o teste estava mandando no produto.** O radical
      anti-culpa `'tras'` (que existe para pegar "atrás"/"atrasado") casa dentro de
      **ou_tras_** — e por isso o chip havia virado "De alguém do clube". Medido: trocá-lo por
      **`'atras'` + `' tras'`** (com espaço) pega os **mesmos 5 alvos** ("atrás", "para trás",
      "atrasado", "atraso", "ficou para trás"), cada um provado por plantio no catálogo, com
      **zero** falso positivo nos 6 inocentes ("de outras pessoas", "outras", "mostras",
      "cadastras", "nossas outras notas", "letras"). A palavra clara voltou ao chip._
      _**E o vocabulário virou UMA lista** (`@clube/shared/anti-culpa`): a guarda do catálogo e
      a do DOM eram duas cópias com um comentário dizendo "é a mesma lista, de propósito" — e
      ao corrigir o radical, só uma foi corrigida. Agora a concordância é estrutural._
      _**O chunk de entrada continua sem TipTap:** **380.402 B** e **0 marcas**, com o editor
      em chunk próprio de 453.606 B. `pnpm -r test` 277+175+949+298, `typecheck`, `lint`,
      `prettier --check .` e o build do app limpos. Backend intocado, em **949**._
- [x] **20** — Tela de cadastro de livro + plano de leitura (admin do clube, layout largo no
      desktop, linhas `data · tema · referência`).
      → `tasks/20-cadastro-de-livro-e-plano.md`
      _**A FATIA QUE APOSENTOU O SWAGGER.** Cadastrar o livro do mês deixou de ser colar um
      JSON de 30 objetos no `/docs`. **Nada de backend** — `POST /clubs/:clubId/books` já
      aceitava o plano junto, e o mapa `planItems.7.date` → `errors.fields.planItem.date` já
      existia desde a Tarefa 15. **345 testes no app** (eram 298)._
      _**O gerador de dias é o que faz a tela ser usada:** data inicial + quantidade → N linhas
      com as datas prontas, e os temas digitados um a um (são o conteúdo). Ele **só aparece com
      o plano vazio** — gerar por cima apagaria os temas, a única parte do plano que não se
      refaz sozinha._
      _**O achado ALTO da revisão, e ele só apareceria no dia do segundo clube:** trocar o
      portão de admin para conferir o **clube ativo** em vez do **clube do livro** deixava os
      332 testes verdes — **zero acusadores**. A implementação estava certa; o teste é que não
      sabia distinguir, porque todo fixture da fatia tinha um clube só e ele era sempre o do
      livro (§7.1: a propriedade estava afirmada num comentário, não medida). Com o fixture de
      dois clubes são **5 acusadores**, nos dois sentidos — verificado por mutação minha, com
      restauração provada por md5 + `diff`. Sem isso: admin de um clube veria "Editar" no livro
      do outro, e seria recusado no próprio livro com outro clube ativo._
      _**O primeiro ciclo de import do projeto morreu antes de morder.** `book.tsx` ⇄
      `book-form.tsx` era seguro só porque as duas travessias eram declarações de função —
      a sonda do revisor provou que **uma `const` de módulo cruzando o ciclo derruba a rota
      inteira no import** (tela branca, não degradação), e que qual dos dois era o lado frágil
      dependia da ordem alfabética dos imports no `router.tsx`. Os caminhos e o `isClubAdmin`
      foram para `pages/paths.ts`, **sem nenhum import do app**._
      _**A lição da Tarefa 19 tentou voltar, na terceira cópia:** a varredura anti-culpa da tela
      nova era o `free-note.test.tsx` mais uma linha (a do ADR 0002) — o mesmo padrão do
      `GUILT_TERMS` duplicado. Subiu para `anti-guilt-dom.ts`, o `free-note` perdeu a cópia e
      ganhou a varredura de privacidade de brinde, e o `withoutDiacritics` foi para o
      `harness.tsx` para não criar um ciclo entre as duas guardas._
      _**Mais quatro achados fechados:** o discriminador `stage` (um `PATCH` recusado devolvia a
      frase do plano e ressuscitava linhas: 0 → 1 acusador) · três ramos de validação apagáveis
      sem uma linha vermelha, um deles **alcançável** — acrescentar um dia com o plano vazio
      gera linha sem data (0 → 3) · o `/me` que falha virava "Carregando…" para sempre, sem
      repetir · e `restoreRemovedRows` devolvia a versão do **servidor**, apagando em silêncio
      o tema que a pessoa havia corrigido antes de remover a linha._
      _**Uma decisão do executor que contrariou a spec e estava certa:** o campo de mês é
      `type="text"`, não `type="month"`. Medido em jsdom (e é o comportamento do Chrome): o tipo
      nativo **sanitiza** `2026-13` para vazio — a regra 4 viraria a regra 3 e o mutante que
      apaga o `isClubMonth` sobreviveria (§7.6.1). E o tipo não existe no Firefox nem no
      Safari, onde o texto malformado entra de verdade._
      _**Complexidade sob controle, e de propósito:** o editor de plano nasceu em arquivo
      próprio (decisão B), **antes** de a tela crescer. `book-form.tsx` **347** linhas de
      código, `plan-editor.tsx` **238**, `paths.ts` **21** — as três somadas (606) contra as
      **576** do `free-note.tsx` sozinho._
      _**Dívidas registradas:** o `Notice` está na **5ª** cópia e o `Screen` na **3ª** (candidatos
      legítimos a `packages/ui`, fatia própria) · o client não tem `put` (esta fatia usou
      `api.request`, porque `shared/src/client/**` estava fechado) · sem confirmação ao sair com
      mudança pendente · arquivar livro continua sem tela._
      _**Gates:** 277 · 175 · 949 · **345**; `typecheck`, `lint`, `prettier --check .` e o build
      limpos. Chunk de entrada **394.630 B** com **0 marcas** de TipTap. Backend **intocado**._
- [x] **21** — Offline nível 1: rascunho local da nota + fila de escrita em IndexedDB +
      reenvio no evento `online`. → `tasks/21-offline-nivel-1.md`
      _**FECHA O MVP 1.** Escrever a anotação do dia sem sinal deixou de perder texto: o `doc`
      vai para o IndexedDB **antes** de qualquer tentativa de rede, a falha de rede vira
      `queued` (não `error`), e o evento `online` esvazia a fila sozinho — **uma** requisição
      por dia escrito, não uma por tecla. **424 testes no app** (eram 345) e **285 em
      `shared`**._
      _**⚠️ O BLOQUEADOR, e ele era o oposto do que a fatia promete: a fila apagava o texto novo
      e a tela dizia "Salvo".** O `forget` era um delete incondicional depois do `await` do
      `PUT` — ou seja, a janela tinha a largura da **requisição inteira**, segundos na rede
      ruim para a qual a fatia existe. Sequência medida: digito "x" → `PUT(x)` no ar → digito
      "xx" (o rascunho grava por cima) → o servidor confirma o "x" → o registro que agora
      contém "xx" é apagado → fecho o app antes dos 1500 ms seguintes → **"xx" não está no
      servidor nem no aparelho**. **Zero acusadores em 414 testes**, porque nenhum teste
      digitava durante um envio em voo._
      _**Consertado no port, não na tela:** `enqueue`/`dequeue`/`forget` viraram **uma**
      operação `settle(input, fate)` com **compare-and-write** — a store só aplica o destino se
      o `doc` guardado ainda for o que subiu; se mudou, não toca em nada, porque aquele texto é
      outra escrita e terá o próprio destino. O `sameDoc` é **exportado e usado pelas duas
      implementações**, então a comparação é do contrato, não uma cópia em cada lado. Verificado
      por mutação minha: apagar a comparação nas duas implementações dá **8 acusadores** (contra
      0), e entre eles o teste ponta a ponta que faltava — **digito → recarrego → o texto está
      lá** —, que falha com o editor **vazio**. De brinde, a invariante A passou a valer sem
      exceção: no caminho `accepted` (2xx) o rascunho some se for igual ao que o servidor
      executou, e fica se a pessoa continuou digitando._
      _**O segundo achado é de outra natureza: a fatia inteira podia estar desligada em
      produção com 414/414 verde.** Fazer `browserIndexedDb()` devolver `undefined` não tinha
      **nenhum** acusador — o jsdom não tem IndexedDB, então a fiação real
      (`openPendingNoteStore(browserIndexedDb())`) nunca era exercida e todos os testes rodavam
      contra o fake. Agora há um teste que injeta um `IDBFactory` de verdade em `globalThis` e
      monta o provider **sem** store: a mutação dá **1 acusador** (medido por mim)._
      _**E um terceiro, de TOM:** trocar as frases de `queued` e `unconfirmed` por *"Não foi
      possível salvar agora. Tente salvar de novo, por favor."* — a frase que empurraria a
      pessoa a gravar duas vezes o que o servidor já executou — dava **0 acusadores**, porque a
      asserção comparava o resultado com ele mesmo (§7.4). Nasceu a guarda de **vocabulário de
      alarme** (`shared/src/locales/__tests__/offline-save-tone.test.ts`), irmã da anti-culpa:
      os dois estados nunca dizem que algo deu errado nem pedem ação. Ela mordeu na primeira
      execução, no próprio texto do executor._
      _**Um estado que a spec não previa e estava certo: `unconfirmed`.** Um `ApiError` com
      status **2xx** significa "o servidor executou, só não entendemos a resposta" (decisão
      fechada da Tarefa 12) — dizer "não foi possível salvar" seria falso e empurraria a
      pessoa a gravar duas vezes; dizer "Salvo" seria afirmar uma confirmação que não houve.
      Sem botão de repetir, como o `queued`._
      _**Desenho:** um registro por (pessoa, dia) com `seq: number | null` (`null` = rascunho
      fora da fila) — a dedupe da decisão B vira a **chave primária**, "existir rascunho =
      não enviado" vira um campo, e sair da fila mantendo o rascunho vira uma transição. A
      ordem usa `max(seq)+1` **dentro da transação**, nunca relógio. O `withStore` resolve no
      `transaction.oncomplete` e recusa no `onabort`/`onerror` — resolver no `onsuccess` do
      request faria uma cota estourada aparecer como sucesso, e a tela prometeria "guardado"
      sobre uma transação que abortou._
      _**Fidelidade provada nas duas direções (§7.1):** o `describe.each` roda **o mesmo corpo**
      contra o fake em memória e contra IndexedDB de verdade (`fake-indexeddb`), com o fake
      enumerando ao contrário de propósito. Mutar **só** o filtro por usuário da implementação
      real deixa vermelhos **exatamente os 2 testes da linha do IndexedDB** — sem o teste de
      contrato, essa divergência passaria calada._
      _**Fora de escopo, e cada exclusão com motivo:** criar anotação avulsa offline (o `POST`
      não é idempotente e o backend não tem chave de idempotência — reenviar às cegas duplica) ·
      `PATCH` da avulsa na fila (a fila se prova numa tela antes de ser fiada em todas) ·
      **abrir o app do zero sem rede** (o shell vem do service worker, mas `/me`, o livro e as
      notas são LEITURAS — cache de leitura é outra fatia, e isso está escrito no §6.1 do
      `COMO-TESTAR.md` para o dono não testar no metrô e achar que a fatia falhou) · resolução
      de conflito (Nível 2: o último envio ganha)._
      _**Complexidade:** `offline/` tem **414 linhas** de produção (store 208 · queue 91 ·
      provider 115) e o `day-note.tsx` foi a **288**. O `Set<listener>` com API de `subscribe`
      do provider — um mecanismo de assinatura para **um** assinante — foi cortado na auditoria,
      junto de `WriteStatus`, `saveDraftCalls`, `all` e o `unknownPerson` (todos provados mortos
      por mutação com 0 acusadores)._
      _**Decisões minhas, registradas para ninguém "consertar":** o vocabulário do
      `PendingNoteStore` (`saveDraft`/`settle`/`byDay`/`queue`) **não** segue o
      `save · byId · update · find · delete` do `CLAUDE.md` — aquele vocabulário é de
      **Repository de domínio**, e isto é armazenamento local do navegador cujas operações são
      transições de estado. E `offline/offline-notes.tsx` fica, apesar de fora da lista da
      spec: a fila precisa de um dono que sobreviva à saída da tela, e **um só** (dois ouvintes
      de `online` mandariam a mesma anotação duas vezes)._
      _**Gates:** 285 · 175 · 949 · **424**; `typecheck`, `lint`, `prettier --check .` e o build
      limpos. Chunk de entrada **400.126 B** (era 394.398) com **0 marcas** de TipTap — a fila
      custou **+1,4%**. Backend **intocado**, em 949._

## Definição de "MVP 1 pronto"

> **As 21 tarefas estão entregues e verdes. O MVP 1 está em ACEITE** — o roteiro de teste, as
> oito perguntas para o dono e o veredito que fecha a fase moram em `docs/ACEITE-MVP.md`.
> As respostas dele viram decisões fechadas aqui antes de o MVP 2 ser detalhado.

Eu crio um clube, mando um link de convite para minha esposa, ela entra e define a senha
dela. Eu cadastro o livro do mês com o plano de leitura dia por dia. Nós dois abrimos o app
no celular, vemos a leitura de hoje com o tema já definido, e escrevemos nossa anotação no
editor — com a barra auxiliar, o menu `/` e os grifos de cor funcionando, e salvando sozinho
mesmo com a internet ruim. Eu consigo criar quantas anotações avulsas eu quiser, com título
e referência minha. E eu vejo o que ela escreveu, com o filtro **Tudo · Minhas · dela**.

Sem grifos em tela própria (MVP 2), sem marcar "li", sem feed e sem notificação (MVP 3), sem
área de administração além dos formulários mínimos (MVP 4).

---

# MVP 2 — Grifos e filtros

> Detalhar quando o MVP 1 estiver fechado. As decisões abaixo já estão tomadas.

## Decisões fechadas do MVP 2

- **Grifo é entidade própria** (`Highlight`), não bloco dentro da nota. → `docs/adr/0004-*.md`.
- O comentário do grifo usa **o mesmo editor** (`commentDoc` em ProseMirror JSON,
  `commentText` derivado).
- Paleta de grifos **fixa** no MVP 2 (5 cores). Configurável por clube fica em aberto.
- Busca é `ILIKE` no `plainText`/`commentText`. **Sem embeddings, sem pgvector.**

### Bloco E — Grifos

- [x] **22** — Domínio `Highlight` + UseCases `createHighlight` · `editHighlight` ·
      `archiveHighlight` (só o autor). → `tasks/22-usecase-grifo.md`
      _**O MVP 2 COMEÇOU pelo domínio, e o grifo já nasce com autoria.** Entregue:
      `HIGHLIGHT_COLORS` (a paleta fixa de 5 cores) em **`packages/shared`**,
      `domain/highlight.ts` com os 4 portões (`normalizeHighlightQuote`,
      `assertHighlightColor`, `normalizeHighlightPage`, `normalizeHighlightComment`), 2 erros
      novos **já mapeados**, o port + o fake, `highlightForAuthor` (cópia fiel do
      `noteForAuthor`) e os 3 UseCases. **320 shared + 175 ui + 1213 backend + 424 app.**
      Backend +264: 252 de grifo, 5 do `handle-domain-error`, 7 da rodada de correção._
      _**A paleta mora em `shared` e guarda o HEX, não o `rgba` do editor.** Três chamadores
      precisam da mesma lista — o domínio, o `z.enum` da borda (Tarefa 24) e a tela (25) —, e é
      o caminho medido do `calendar-day` na Tarefa 07. O valor é a **cor base** (`#facc15` …)
      porque o alpha do editor é decisão de renderização: guardar `rgba(250, 204, 21, 0.40)`
      faria o `z.enum` depender de espaço em branco e de duas casas decimais. **O espelhamento
      que o ADR 0004 exige tem teste, e ele morde nas DUAS direções** — o teste de `shared` lê
      o `RichEditor.tsx` do disco: mutar um hex da paleta dá **44** acusadores, mutar a `rgba`
      do editor dá **1**, e ele não depende do diretório de trabalho. Duas listas escritas à
      mão não são espelho, são cópia que envelhece._
      _**Uma pendência da Tarefa 05 que não se repetiu:** medi antes de escrever a spec que o
      `NOT_YET_MAPPED` do teste de exaustividade está **vazio** e que ele varre todas as
      classes exportadas de `domain/errors` — então classe de erro nova **sem status deixa a
      suíte vermelha**. Registrar os dois erros no `handleDomainError` não era escolha, era
      requisito do mesmo commit, e a spec já nasceu dizendo isso (decisão H). O vermelho foi
      colado antes do conserto._
      _**⚠️ O ACHADO ALTO, e ele é uma classe de asserção nova: o relógio escolheu o valor
      esperado.** `createdAt === updatedAt` (e `archivedAt === updatedAt`) tinha **ZERO
      acusadores em 1206 testes, em três rodadas** — duas chamadas a `new Date()` no mesmo tick
      devolvem o **mesmo milissegundo**, então a igualdade provava "a suíte é rápida", não "o
      UseCase leu o relógio uma vez". E **cinco blocos de prosa afirmavam o contrário**, com a
      justificativa exata que a medição desmente (*"duas chamadas divergiriam em
      milissegundos"*). Consertado com um **relógio que anda e CONTA leituras**
      (`test-support/advancing-clock.ts`, 33 linhas), cujo primeiro teste é a precondição "duas
      leituras consecutivas diferem" — senão o acusador novo vira a identidade antiga. **0 → 1
      acusador** em cada UseCase, verificado por mutação do orquestrador com `md5sum -c` +
      `diff`. **Gerou a 4ª aparição do §7.8** do `CONVENCOES-CODIGO`, com a regra: *"um relógio
      só" se prova contando leituras, nunca comparando instantes* — é o §7.3 (contador, não
      cronômetro) aplicado ao relógio do próprio domínio._
      _**As guardas de tenant e de autoria, ao contrário do MVP 1, nasceram com acusador.**
      Medido por mutação: inverter a ordem membership→autoria no `highlightForAuthor` dá **9**
      acusadores e remover o `assertMembership` dá **12** (no MVP 1, três guardas tinham zero);
      mover a guarda de patch vazio para **antes** do guard de autoria dá **5**; apagá-la dá
      **3**; o envenenamento com fallback (`input.userId ?? actor`) dá **1**; validar o corpo
      antes do corte de tenant dá **1**; trocar a cópia campo a campo do fake por spread dá
      **3**. Nenhum zero em guarda._
      _**Três achados BAIXO, e num deles o executor discordou COM MEDIÇÃO e estava certo:** eu
      pedi para trocar o ator de um teste de contrabando de `clubId`, e ele mediu que o teste
      **não pode** acusar aquele mutante por um motivo **estrutural** — o `editHighlight` monta
      o input do guard campo por campo, então um `clubId` do corpo nunca chega lá. E o "gêmeo
      no `archive`" que eu supus **não existe** (aquele input não tem corpo). Aplicou a
      alternativa: renomear para o que o teste prova, com ponteiro **pelo nome** do teste que
      prova a propriedade (§7.4). Os outros dois: duas asserções `toBe(docToText(doc))` eram
      identidades (apagadas, e a contagem não caiu de 8) e meia frase de docblock
      indistinguível por construção ("conta a chamada, não o sucesso" num `save` que não pode
      falhar — contar só o sucesso dá **0** acusadores ali)._
      _**Decisões registradas para ninguém "consertar":** `commentDoc` é **anulável** (registro
      o grifo sem ter comentário ainda — o mesmo argumento com que o ADR 0004 recusou o grifo
      dentro da nota) · o comentário reusa **`assertNoteDoc` + `docToText` sem renomear**, então
      um `commentDoc` malformado sai como `InvalidNoteError`: outro nome, o **mesmo 400** na
      borda, e há teste pinando que as duas classes de um corpo de grifo caem no mesmo status ·
      `page` é inteiro ≥ 1 e **não** é conferido contra `book.totalPages` (é opcional, e a
      edição de quem grifa pode ser outra) · **sem teto no `quote`** (o teto é o `bodyLimit` da
      rota, Tarefa 24) · `color`/`page`/`commentDoc` são `unknown` no input, como o `doc` do
      `createFreeNote` — o portão é o domínio, não o cliente._
      _**⚠️ Para a Tarefa 24, medido:** o `docs/plano-clube-do-livro.md` §6 declara
      `updatedAt DateTime @updatedAt` no `Highlight` — **está desatualizado, o ADR 0008 o
      emenda**, e o modelo tem de nascer **sem** `@updatedAt` (o domínio já é o dono do campo,
      e é isso que o relógio contado prova). O plano não foi editado._
      _**Complexidade sob controle:** o maior arquivo de produção tem **72** linhas de código
      (`edit-highlight.ts`); o fake tem **68** contra **145** do `NoteRepositoryFake` — o
      dividendo do `HighlightPatch` estreito que o §7.1.1 mandava (ele cita esta fatia pelo
      nome). Nenhuma abstração sem chamador: 3 métodos no port, os 3 usados; 9 chaves no patch,
      as 9 usadas; `find` e `delete` **corretamente ausentes** (a 23 e o hard delete que não
      existe)._
      _**Dívida registrada:** `packages/ui` não tem pino próprio da paleta do editor — o
      espelho morde nas duas direções, mas o único guarda das cores do editor vive em **outro
      pacote**, e quem rodar só `pnpm --filter @clube/ui test` depois de corrigir uma cor vê
      verde. Vai para a **Tarefa 25**, que toca a paleta do front de qualquer forma._
      _**Gates:** 320 · 175 · 1213 · 424; `typecheck`, `lint`, `prettier --check .` e o build
      limpos. Chunk de entrada **400.129 B** com **0 marcas** de TipTap (era 400.126; +3 B de
      grafo de módulos — a paleta é totalmente tree-shaken, `grep -c facc15` no chunk dá 0).
      `prisma/`, `repositories/`, `routes/`, `ui/` e `app/` **intocados**; integração **não
      rodada** (escreve no banco do dono), e não havia como o número mudar._
- [x] **23** — UseCase `listHighlights(filter)` — por livro, autor, cor, página.
      → `tasks/23-usecase-listar-grifos.md`
      _Entregue: `HighlightFilter` + `find` no port e no fake, e o `listHighlights`.
      **320 shared + 175 ui + 1266 backend + 424 app** (+53 no backend: 35 do UseCase, 18 do
      `find` do fake). Nenhuma classe de erro nova; `src/http/` e `src/domain/` intocados; o
      diff do port é **puramente aditivo** (zero linha removida)._
      _**A fidelidade da coluna nula nasceu com acusador nas DUAS direções — a primeira vez no
      projeto.** `page` é a única coluna filtrável anulável do grifo, e no Postgres
      `WHERE "page" = 45` contra `NULL` é falso. Medido: a direção permissiva (o fake casa
      nulo) dá **2** acusadores, a **restritiva** dá **35**, e o descarte cego de nulos dá
      **3**. O que torna a restritiva acusável é o teste do **outro lado da moeda** ("sem
      filtro de página, o grifo sem página aparece") — sem ele, um fake que descartasse toda
      linha nula passaria na regra por acidente. É a 4ª aparição do §7.1, e a única que
      não precisou de rodada de correção._
      _**O §7.2 aconteceu de novo, e o executor o pegou sozinho:** na primeira redação, o teste
      `orders by createdAt and not by updatedAt` **não acusava** o mutante "sem `sort`" — a
      ordem de inserção fazia a enumeração invertida do fake **coincidir** com a ordem
      esperada. Nome certo, prova nenhuma. Fixture trocado: **3 → 4** acusadores, e o revisor
      reconstituiu a redação original para confirmar. A ordem inteira tem acusador: sem `sort`
      **4** · por `updatedAt` **3** · desempate por `id` **1** · comparador invertido **3** ·
      fake deixando de enumerar invertido **4**._
      _**O `matches` duplicado virou UM arquivo, contra a decisão do executor — e ele aceitou
      com o argumento medido.** Ele havia mantido a cópia de propósito ("dois fakes
      independentes"); o revisor mediu que os corpos eram **byte-idênticos** e desmontou o
      motivo: o que estava duplicado é a codificação de uma regra do **Postgres**, que a
      produção compartilha de fato (os dois repos Prisma delegam ao mesmo banco). Extraído para
      `_fakes/sql-equality.ts` com o §7.1 no docblock. **Verificado por mutação do
      orquestrador: 3 acusadores no lado do grifo + 33 no da nota, 36 na união, sem queda de
      nenhum lado.** O `matchesText` **não** se mudou — um chamador só, e o segundo chega com a
      busca da Tarefa 29. **Gerou o registro do desfecho no §7.1** ("extrair, não cobrir duas
      vezes"), irmão do §7.1.1. Motivo de fazer agora: o MVP 3 traz `ReadingLog` e
      `ActivityEvent`, a 3ª e a 4ª cópia, e o `unaccent` da 29 é a próxima fidelidade que
      entraria num fake só com os dois verdes._
      _**⚠️ O CUSTO DE HEAP, medido por dois harnesses independentes — e a reconciliação com a
      Tarefa 10.** **~1,4 KiB por grifo**, linear e estável em N = 10k/20k/50k (o executor
      1,38; o revisor 1,15 com fixture próprio). O equivalente aos ~70 MB que a Tarefa 10
      apontou como quebra chega em **~50 mil grifos por clube**, 5× o limiar de 10 mil notas;
      o clube de casal em 3 anos (~11 mil grifos) fica em ~15 MiB. **E o ~6,8 KiB por nota que
      a Tarefa 10 registrou NÃO estava errado:** o revisor varreu o tamanho da nota e
      `8 × 250 = 2.000` caracteres dá **6,55 KiB/linha**, `8 × 300` dá **7,30** — o 6,8 é uma
      nota do dia de ~2.000 caracteres, e os ~3,4 KiB medidos agora são uma de ~1.000. Não era
      divergência, era outro fixture, e **para válvula vale o número conservador**. O que **não**
      se sustenta é a **razão** grifo/nota (2,43× num fixture, 3,30× no outro): ela é escolha de
      fixture, não propriedade do modelo — então o teto da Tarefa 24 **não sai dela**._
      _**Decisões registradas:** ordem `createdAt` desc com desempate por `id`, a mesma do
      `listNotes` (ordenar por **página** é a ordem de leitura do livro e talvez seja o que a
      tela queira, mas `page` é anulável e os nulos precisariam de posição arbitrária; a tela da
      25 reordena o que recebeu **sem** mudar o contrato — fica como pergunta do dono) · `page`
      é **igualdade exata**, faixa é aditiva · `color` chega **tipado** e o UseCase **não**
      revalida (o precedente do `kind?: NoteKind`: quem valida enum de query é o `z.enum` da
      borda, e duas validações são dois donos) · **sem `text`** aqui, porque a busca é a 29 e é
      ela a chamadora._
      _**⚠️ Cinco entradas OBRIGATÓRIAS na spec da Tarefa 24, achadas pela auditoria:**
      (1) **`page` é `Int?` e o filtro é `number` JS.** ⚠️ **CORRIGIDO na Tarefa 24 — a frase
      original desta linha estava factualmente errada, e o erro era do orquestrador.** Eu
      escrevi que `page: 45.5` "lança no Prisma"; **medido** na 24, por sonda somente-leitura
      do orquestrador **e** do revisor: o Prisma **TRUNCA** a fração (`page: 45.5` chega ao SQL
      como `45`, visto no log de query) e **devolve os grifos da página 45**. Só valor fora do
      int32 lança (`ConversionError`). Então a divergência fake × Prisma não é "vazio × erro",
      é **"vazio × resultado de outra página"** — a 6ª aparição do §7.1, na direção que esconde
      melhor, porque não há erro nenhum. A conclusão prática não muda e a borda fecha as duas
      pontas com `z.coerce.number().int().min(1).max(2147483647)`, e **não** com um
      `Number.isInteger` no port (dois donos da regra). O que muda é o motivo, e quem for
      escrever a Tarefa 29 precisa do motivo certo. (2) **`orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]` colado no
      `take`** — `take` sem ordem total corta um conjunto que o Postgres devolve em qualquer
      ordem, e o `sort` do UseCase **não substitui** o `orderBy`: ele ordena o que chegou, e o
      que chegou é decidido pelo corte do banco. (3) A válvula **não é decidível no unitário**
      (o fake não tem teto de linhas): prova no **teste de contrato**, e o docblock do `find` já
      aponta para lá (§7.10). (4) `authorId` → coluna **`userId`** no `where`. (5) `color` casa
      **byte a byte** nos dois lados (o `=` de texto do Postgres com collation determinística) —
      é o desejado, e a borda **não** deve normalizar caixa._
      _**Dívida registrada:** a segunda cópia defensiva do getter `findFilters` tem **0**
      acusadores (mutá-la para devolver a referência não acusa). Fica: é código de teste, o
      `readonly` congela o array, e o `NoteRepositoryFake` tem a mesma cópia dupla — remover só
      de um criaria divergência gratuita._
      _**Complexidade:** `list-highlights.ts` tem **39** linhas de código contra 44 do
      `list-notes.ts`; o teste tem **461** contra 382, e o excedente é propriedade provada (a
      nulidade nas duas direções, o lado positivo do contador, os dois `findFilters`), não
      repetição. Nenhuma abstração sem chamador._
      _**Gates:** 320 · 175 · 1266 · 424; `typecheck`, `lint`, `prettier --check .` e o build
      limpos. Chunk de entrada **400.129 B** com **0 marcas** de TipTap. `prisma/`,
      `repositories/`, `routes/`, `http/`, `ui/` e `app/` **intocados** (provado por `git
      status` e mtime — o mais novo de `prisma/` é de 2026-09-03); integração **não rodada**._
- [x] **24** — Repo Prisma + rotas `/highlights` + teste de tenant.
      → `tasks/24-prisma-rotas-grifo.md`
      _**O GRIFO EXISTE.** Entregue: `model Highlight` + a migration `20260909205340_highlight`
      gerada pelo Prisma, o `PrismaHighlightRepository`, os schemas Zod em `shared`, as 4 rotas
      em arquivo próprio, e a fiação. **391 shared** (era 320) **+ 175 ui + 1266 backend + 424
      app**; **integração 359** (era 262: +34 do contrato, +63 das rotas). Chunk de entrada
      **401.148 B** (era 400.129) — o +1.019 B foi atribuído por mutação do barril de `shared`
      e é 100% dos schemas novos, com **0 marcas** de TipTap e o teto de 450.000 intacto._
      _**⚠️ A ARMADILHA QUE O TIPO PEGOU E NENHUM TESTE PEGARIA: `Json?` + `null` no Prisma não
      é `null`.** Numa coluna `Json?` o tipo de entrada é `DbNull | JsonNull | InputJsonValue`
      e `null` literal é **erro de compilação** — foi o `tsc` que mordeu primeiro, no fixture do
      próprio executor. Grava-se `Prisma.DbNull`. E o que faz esse acerto ser **testável** é uma
      sonda SQL: trocar `DbNull` por `JsonNull` deixa `expect(x).toBeNull()` **passar** (o
      Prisma devolve `null` em JS para JSON `null` também), e o **único** acusador no projeto é
      o `SELECT "commentDoc" IS NULL, "commentDoc"::text` do teste de contrato — typecheck 0,
      unitário 0. Medido no banco: `'null'::jsonb IS NULL` é **false** e `::text` dá `'null'`.
      Hoje não morde (a tabela nasceu vazia e nenhuma consulta filtra por presença de
      comentário); morde na **primeira** feature que perguntar "tem comentário?" — um chip "só
      os comentados" com `not: Prisma.DbNull` **incluiria** as linhas gravadas como `JsonNull`,
      e as duas populações não se pegam juntas sem `AnyNull`. Não simplifique a sonda para um
      `toBeNull()`._
      _**⚠️ A frase errada era MINHA, e viajou por QUATRO arquivos antes de alguém medir.** Eu
      escrevi, numa pergunta de auditoria da Tarefa 23, que `page: 45.5` "faz o Prisma lançar".
      **Falso.** Medido por sonda somente-leitura do revisor, do executor **e** do orquestrador:
      o Prisma **TRUNCA** (`45.5` chega ao SQL como `45`, visto no log de query) e **devolve os
      grifos da página 45** — provado com uma linha real no banco, as duas consultas devolvendo
      o mesmo grifo. Só fora do int32 lança (`ConversionError`). A divergência fake × Postgres
      não é "vazio × erro", é **"vazio × resultado de OUTRA página"** — a 6ª aparição do §7.1,
      na direção que esconde melhor porque não há erro nenhum. Corrigida nos 4 lugares (o
      executor achou a 4ª cópia que eu não listei) e registrada no §7.1, **com a lição sobre a
      lição**: afirmação sobre o comportamento do banco é a mais fácil de escrever e a mais
      difícil de conferir — das 5 que a auditoria conferiu, 3 sobreviveram e **2 caíram, e as 2
      que caíram eram as que diziam "medido"**._
      _**A segunda prosa falsa, e ela é sobre segurança:** três comentários diziam que "tirar o
      `.strict()` + inverter o spread" dá escalação de privilégio. Medido no Zod: **sem
      `.strict()` o `z.object` já faz STRIP**, então a chave nem chega ao handler e o spread
      invertido não tem o que sobrescrever — a escalação exige `.passthrough()` (ou declarar o
      campo). O valor real do `.strict()` é **400 explícito em vez de strip silencioso**.
      **Gerou a ressalva medida no §6.3** do `CONVENCOES-CODIGO`, porque a frase de lá
      ("romper as duas") estava certa e foi **parafraseada errado** — "romper o strip" não é
      "tirar o `.strict()`"._
      _**O furo dentro do bloco que se declarava imune a ele:** o Fastify responde **404 para
      rota inexistente**, então 6 testes de 404 ficavam verdes **sem uma linha de rota escrita**
      (medição do executor, corrigida por ele mesmo: era **6 de 62**, não "6 de 49" — ele havia
      somado ignorando 13 `skipped`). É a forma nova do §7.4, e ela sobreviveu **dentro** do
      docblock que afirmava estar protegido: a frase dizia que o pino do PATCH e do DELETE era o
      `createHighlight()`, que exercita o **POST**. Precondição posta nos **seis** testes (a
      mesma rota atende o ator legítimo). **Verificado por mutação do orquestrador: apagar o
      bloco `app.patch` dá 11 acusadores** — e os três testes de 404 que antes ficariam verdes
      estão entre eles. Apagar o `app.delete` dá 8._
      _**As guardas de tenant da FIAÇÃO: os três mutantes são mortos pelo COMPILADOR.**
      `actorUserId` do corpo com fallback → 2× TS2339; `clubId` da query em vez dos params →
      TS2339. E a ordem do spread invertida é **equivalente por construção** (o body parseado
      não tem as chaves), o que é informação e não lacuna — a ordem certa fica porque é grátis e
      passa a valer se alguém puser `.passthrough()`. ⚠️ **E o enquadramento que vale para
      quem vier depois: NENHUM teste unitário carrega `highlight-routes.ts`,
      `prisma-highlight-repository.ts` nem `http/server.ts`** (provado por `grep` e por 5
      mutantes com 1266/1266 verde). Nesta fatia "unitário verde" **não é sinal**; os
      instrumentos são o `tsc`, o catálogo do Postgres, uma sonda de boot **sem banco** (o
      revisor descobriu que `buildServer()` + `ready()` não conecta) e a integração._
      _**O catálogo confere com o schema, conferido por consulta independente:** **zero** índice
      único além da PK (grifo é ilimitado — um `@@unique` viraria 409 ao grifar o mesmo trecho
      com outra cor); os três índices declarados (`bookId,color` · `bookId,userId` ·
      `clubId,createdAt`) com colunas e ordem certas; `updatedAt` **NOT NULL sem DEFAULT** (ADR
      0008 — o §6 do plano dizia `@updatedAt` e **está desatualizado**); `commentDoc` é
      **`jsonb`** nullable; `page` é `integer` nullable; as três FKs **`RESTRICT` no delete**,
      **lidas** do `migrate diff --from-empty` (offline) e não supostas — é a lição da Tarefa 11,
      onde o default de relação **opcional** era `SetNull`._
      _**Decisões:** `take: 500` **igual ao da nota** — os ~1,4 KiB/grifo da Tarefa 23
      permitiriam ~1.200, e **não** subi: um número só entre os repositórios é uma coisa a menos
      para raciocinar · rotas espelhando as de nota, com o `bookId` **na rota** (no corpo, o
      corte de tenant sairia de um campo que o cliente manda) · `DELETE` devolve **200 com a
      linha** · **`.max(2147483647)` também no CORPO**, contra a spec e com razão: sem ele um
      `POST` com `page: 2147483648` responde **500** (medido — `ConversionError`), e é a mesma
      coluna · arquivo de rota próprio (`note-routes.ts` já tem 353 linhas; somar 4 lá passaria
      de 500)._
      _**⚠️ Para a Tarefa 25, medido:** `?color=#facc15` **não funciona** numa URL — `#` é
      delimitador de fragmento, e a cor precisa ir `%23facc15`. A armadilha **já está desarmada
      pelo caminho sancionado**: o `buildUrl` do `ApiClient` usa `URLSearchParams`, que escapa
      sozinho (`new URLSearchParams({color:'#facc15'}).toString()` → `color=%23facc15`). A tela
      só cai nela se concatenar query string à mão. O aviso está no docblock do `highlightColor`
      em `shared/highlight.ts`, que é o arquivo que a 25 importa._
      _**Dívida registrada:** `FIND_ROW_LIMIT = 500` e ~30 linhas de docblock quase idênticas em
      `prisma-note-repository.ts` e `prisma-highlight-repository.ts`. Diferente do `matches` que
      a Tarefa 23 extraiu — aquele é **regra do Postgres**, este é **política do projeto** —,
      então fica. **Para o MVP 3:** quando o terceiro `find` precisar da válvula (`ReadingLog`/
      `ActivityEvent`), extraia constante + docblock como o `sql-equality.ts` foi extraído._
      _**Complexidade:** `highlight-routes.ts` **174** linhas de código para 4 rotas (43,5 por
      rota) contra **243** para 6 do `note-routes.ts` (40,5) — densidade igual;
      `prisma-highlight-repository.ts` **109** contra 142 do da nota. Nenhuma abstração sem
      chamador. Os tipos exportados sem consumidor (`CreateHighlightBody` etc.) têm precedente
      exato (`ListNotesQuery` também tem zero)._
      _**Uma quebra de protocolo declarada:** o **revisor** rodou a integração uma vez, por
      acidente (`npx vitest run` sem `--project unit` roda os dois projetos do
      `vitest.workspace.ts` — vale saber). Conferiu o banco depois, e o executor e o
      orquestrador conferiram de novo no fim: **`Highlight` 0 linhas no total**, zero `t24-*` em
      todas as tabelas, super-admin do seed intacto. A limpeza aguentou **três** execuções — é
      prova a mais de que ela funciona, e o formato é o do `invite-routes` (§6.6: a limpeza
      **consulta o banco**, não uma lista alimentada pelas respostas esperadas)._
      _**Gates:** 391 · 175 · 1266 · 424 unitários e **359** de integração; `typecheck`, `lint`,
      `prettier --check .` e o build limpos. Nenhuma migration além da desta fatia, nenhum SQL
      escrito à mão, `packages/ui` e `packages/app` **intocados**._
- [x] **25** — Tela de grifos do livro: lista por cor, criar/editar com o editor no
      comentário. → `tasks/25-tela-de-grifos.md`
      _**O DONO VÊ UM GRIFO NA TELA.** Entregue: `/books/:bookId/highlights` (a coleção com
      filtro por cor, feito no cliente), o formulário de criar/editar com o editor `lazy` no
      comentário, arquivar com confirmação, a aba "Grifos" do `book.tsx` deixando de ser
      desabilitada, e mais duas coisas que a fatia pagou de dívida. **391 shared + 182 ui**
      (era 175) **+ 1266 backend** (intocado) **+ 536 app** (era 424, +112)._
      _**⚠️ DOIS BLOQUEADORES, os dois no ADR 0002, os dois com ZERO acusadores — e os dois por
      CHAMADOR AUSENTE, não por instrumento fraco.** (1) Uma **frase de privacidade** plantada
      em cinco estados renderizados passava em **508 testes**, porque `expectNoPrivacyTalk()`
      era uma **segunda chamada** que cinco testes não faziam — e o diagnóstico estava escrito
      no docblock do próprio executor ("guarda que depende de memória não é guarda"), aplicado
      num helper e esquecido no outro. Consertado movendo a chamada para **dentro** do
      `expectNoGuilt()`. (2) Um **cadeado DESENHADO** (o ícone `Lock` do `lucide-react` **e** um
      `<svg>` cru) em toda linha do acervo dava **0 acusadores** — e a lacuna estava
      **declarada** no docblock do `adr-0002-dom.ts`, que dizia que um cadeado desenhado "**
      passaria** por esta função" e delegava para uma varredura que lê **só `packages/ui`**. A
      dívida foi assumida quando as telas do app não mostravam autoria por linha; agora mostram.
      Consertado com um `adr-0002-iconography.test.ts` **no `app`**, espelho do de `ui/`, com a
      `PRIVACY_TERMS` **importada** e não copiada._
      _**⚠️ E O TERCEIRO DEFEITO, que o executor achou sozinho e que os plantes do revisor
      escaparam POR SORTE — é a lição mais profunda da fatia:** `document.body.textContent`
      **cola nós irmãos sem separador**. Com um `<span>Somente voce ve este grifo.</span>` ao
      lado de um rótulo, o texto falado sai `"cor da canetasomente voce ve este grifo."` — e o
      `\b` do matcher de privacidade (que existe por medição, senão `block`/`unlock` acusam)
      **não casa entre fronteiras de nó**. Os dois plantes do revisor escaparam disso porque
      caíram depois de um espaço **dentro** do mesmo nó. Zero acusadores. Consertado na
      **superfície, não na âncora**: o `readableText()` mantém o `body.textContent` (é ele que
      faz um `toContain` de frase quebrada em vários nós funcionar) **e** acrescenta o texto de
      cada elemento numa linha própria — a união só acrescenta casamentos. **Verificado por
      mutação do orquestrador: 21 acusadores só na suíte do formulário** (era 0). É a irmã do
      §7.6.1 — "`document.body.textContent` só vê nós de texto" agora tem uma segunda metade:
      **e os cola.**_
      _**A DECISÃO H SE PAGOU EM BYTES, e isso foi medido por remoção e rebuild.** O `Notice`
      tinha **duas variantes divergentes** (três cópias byte-idênticas + duas com `description`)
      e o `Screen` duas que diferiam só na largura; esta fatia criaria a 6ª e a 4ª. Unificadas
      em `pages/chrome.tsx` **antes** de qualquer tela nova (unidade 1). Atribuição do bundle:
      as duas telas + rotas **+13.311 B**, o catálogo de i18n novo **+3.784 B**, e o cromo
      unificado **−1.383 B** — a única parcela **negativa** da fatia, e a conta fecha nos
      +15.712 B. Apagar o `<p>{title}</p>` do `Notice` compartilhado dá **8 suítes / 36
      acusadores**._
      _**A assimetria que o revisor pegou, e o executor aceitou com a medição:** o `ScreenWidth`
      foi construído com o argumento "as duas larguras que existem hoje", e a prop de
      espaçamento foi chamada de "abstração especulativa para um chamador" — o **mesmo critério
      dando duas respostas**. E a consequência era medível: a guarda que confere ausência de
      `function Screen(` deixava a home **passar trivialmente**, porque ela nunca declarou uma —
      a 5ª cópia era **invisível** para a guarda que existe para pegar isso. Com o `spacing`, a
      home e o **login** migraram (o login era byte-idêntico ao `accept-invite`: a 6ª e a 7ª
      cópia), e a guarda nova é estrutural: **nenhuma tela de `pages/` declara `<h1` própria**,
      com duas exceções **declaradas e conferidas por teste** (`accept-invite`, cujo `h1` vive
      num grupo com a descrição, e `not-found`, com três divergências de layout)._
      _**Prosa descrevendo código inexistente, dentro do commit que cita a lição nº 3:** o
      `book.tsx` dizia que as classes moravam em `highlights.tsx` como `CHIP_LINK_CLASS` "para
      não serem uma segunda cópia" — e `grep` devolvia **uma** ocorrência: a própria frase.
      Havia sim uma segunda cópia, byte-idêntica entre as duas telas novas. Extraída
      (`TEXT_LINK_CLASS` no `chrome.tsx`), e a aba fica de fora **com o `diff` colado**: ela é
      um chip (alvo de 44px, pílula com borda e fundo) e o link é sublinhado com cor de ação —
      não têm classe em comum além do `FOCUS_RING`._
      _**⚠️ A guarda nova de cor pegou o docblock do próprio executor, minutos depois de
      nascer.** O Tailwind extrai nome de classe **de comentário** (medido na Tarefa 13), e ele
      havia copiado a anedota de lá para um docblock de **produção**, citando `bg-[#facc15]` e
      `min-h-10` — as duas menções **compilaram regras de verdade** no CSS que o navegador
      baixa, onde a varredura de DOM nunca olha. A guarda antiga pinava a sonda nominal
      (`.min-h-10{`); a nova é geral (**nenhuma classe de cor arbitrária no CSS emitido**) e
      acusou a família inteira sem conhecer o valor. CSS 22.520 → **22.470 B**._
      _**O desvio do executor que estava CERTO e a minha spec estava errada:** a decisão B da
      spec pedia `/highlights/:highlightId`, e **não é implementável** — a Tarefa 24 tem quatro
      rotas e **nenhum** `GET /highlights/:highlightId`; a única leitura é por **clube**, e o
      `clubId` vem do livro. Sem o livro no endereço, a tela adivinharia o clube pelo seletor do
      cabeçalho e o link de um grifo de outro clube daria 404 para um grifo que existe. Ficou
      `/books/:bookId/highlights/:highlightId` — o **precedente exato** do `FREE_NOTE_PATH` da
      Tarefa 19. Confirmado por leitura das quatro rotas pelo revisor._
      _**E a regra 6 do executor é estritamente melhor que a que eu escrevi**, medida nos dois
      sentidos: eu pedi o gate em `commentDoc === null`; ele gateia pela **prévia vazia**. O meu
      dá 1 acusador, o dele dá o mesmo **mais** o do documento que existe e não diz nada — e a
      premissa dele é verdadeira: o `normalizeHighlightComment` devolve `commentText: ''`
      sempre que o doc é `null`, então a resposta que o meu gate precisaria para ser testável
      **não existe** (§7.1: fixture infiel). O meu tinha uma metade sem acusador possível._
      _**Outros dois desvios medidos:** a varredura de cor da tela virou **"exatamente 1 linha
      vermelha"** em vez de "zero", porque esta tela tem **um** vermelho legítimo (a falha de
      arquivar, uma ação destrutiva que não deu certo) — não é frouxidão: plantar um **segundo**
      vermelho acusa, inclusive em hex arbitrário, e o `not.toMatch` que eu esperava seria a
      asserção **falsa**. E a `page` também é recusada **acima do int32** na tela, importando o
      `HIGHLIGHT_PAGE_MAX` de `shared` (uma dona só): a Tarefa 24 mediu que fora do int32 o
      Prisma **lança**, e um 500 é pior que um 400 para quem digitou._
      _**Complexidade, com o comando colado no docblock** (a fatia carregava **três** números
      diferentes para o mesmo arquivo — 491, 483 e 426 —, e é assim que um número viaja sem
      ninguém medir): `highlights.tsx` **380** · `highlight-form.tsx` **423** ·
      `highlight-fields.tsx` **189** · `highlight-colors.tsx` **34** · `chrome.tsx` **58** ·
      `book.tsx` **426 → 400** · `home.tsx` 300 → **278**. A divisão foi feita **antes**: num
      arquivo só o formulário daria **618** linhas, acima do `free-note.tsx` (**565**), que
      continua sendo o maior arquivo do app — e esta fatia **não o tocou**._
      _**Dívidas registradas:** (a) a edição acha o grifo por `.find()` sobre o acervo, que tem
      `take: 500` — um grifo além do 500º renderiza "não foi possível abrir" para um grifo que
      existe e é seu. É o preço correto de não haver rota por id, e leva anos para acontecer
      (~1,4 KiB/grifo, medido na 23); **é a razão pela qual a 28/29 precisa da rota por id ou de
      paginação real**. (b) `packages/ui` continua sem `FilterChip` com `renderLink`/`disabled`,
      sem `TextArea` e sem `FieldGroup` (o `Field` amarra **um** controle, não um grupo de
      botões), então a aba-link e o `<textarea>` têm classes à mão. (c) O `ListItem` não serve à
      lista de grifos (a linha tem ações próprias e o `end` proíbe conteúdo interativo) — é o
      próximo lugar onde um `ListItem` com slot de ações seria útil, na **28**._
      _**⚠️ O TETO DO BUNDLE, e a conta que decide as fatias seguintes.** Entrada **416.643 B**
      (era 401.148), **0 marcas** de TipTap, editor em chunk próprio que o `index.html` não
      referencia, teto de **450.000 não relaxado** — folga de **33.357 B**. A projeção medida
      pelo revisor, a partir do custo unitário desta fatia (~6,7 kB de código + ~1,9 kB de
      catálogo por tela): 27 ≈ 5,1 kB · 28 ≈ 8,4 kB · 29 ≈ 6,1 kB ⇒ **~19,6 kB**. **Cabem, e a
      folga acaba ali.** E a saída correta está **medida, não opinada**: removendo o `en` de
      `resources` e reconstruindo, a entrada cai para **407.876 B** — o catálogo `en` sozinho
      são **8.984 B**, 27% da folga inteira, baixados por **toda** sessão, inclusive a tela de
      login. Carregar o locale não-padrão por `import()` + `addResourceBundle` devolve ~9 kB
      **e mata o crescimento futuro pela raiz** (metade de cada chave nova é `en` que quase
      ninguém lê). É fatia própria, fora do MVP 2, e virou **pergunta do dono** no
      `ACEITE-MVP.md`. Chunk lazy por rota é a **segunda** opção. **Elevar o teto não é opção.**_
      _**Gates:** 391 · 182 · 1266 · **536**; `typecheck`, `lint`, `prettier --check .` e o
      build limpos. `packages/backend` e `prisma/` **intocados** (`git diff` vazio); os **359**
      de integração **não** rodados (fatia de front)._

### Bloco F — Filtro geral e busca

- [x] **26** — `listNotes` completo: `kind` (pré-definida × avulsa), `planItemId`/capítulo,
      texto. → **JÁ ENTREGUE pelas Tarefas 10 e 11.** Nenhuma linha de código foi escrita
      nesta fatia, e isso é a entrega.
      _**Medido antes de despachar qualquer executor**, porque a regra do prompt do MVP 2 é
      medir o que se vai afirmar. O escopo desta linha está **inteiro** no código desde o Bloco
      C, nas quatro camadas:_
      _• **port** — `NoteFilter` tem `clubId` · `bookId` · `authorId` · `kind` · `planItemId` ·
      `text` · `status` (`usecases/ports/note-repository.ts`);_
      _• **UseCase** — `ListNotesInput` tem os mesmos, menos o `status` (que o `listNotes` fixa
      em `ACTIVE` no repositório, decisão C da Tarefa 10);_
      _• **borda** — `listNotesQuerySchema` expõe `bookId`, `authorId`, `kind`, `planItemId` e
      `text` (`packages/shared/src/note.ts`);_
      _• **rota** — `GET /clubs/:clubId/notes` declara aquele `querystring`
      (`note-routes.ts:294`)._
      _E a **integração já exercita cada um**: `?bookId`, `?bookId&authorId`, `?kind=PLAN`,
      `?kind=FREE`, `?planItemId`, `?text=PODER` (case-insensitive), `?text=coração` **e**
      `?text=coracao` devolvendo vazio (a **sensibilidade a acento** que o ADR do `unaccent`
      deixa para a Tarefa 29), a combinação dos quatro juntos, e `?kind=DIA` → **400**.
      `note-routes.integration.test.ts:975-1056`._
      _**Por que a linha existia:** ela foi escrita no planejamento do MVP 2, antes de a Tarefa
      10 nascer — e a 10 entregou o filtro completo de uma vez, porque `listNotes` "é o que
      alimenta o filtro geral" e fatiá-lo em dois teria criado um `NoteFilter` que crescia
      depois de ter chamador. A linha 10 registra isso na época; esta linha só confirma que
      nada ficou._
      _**O que a linha NÃO cobria e continua sendo de outra fatia:** a **interface** desses
      filtros. A Tarefa 19 entregou `Tudo · Minhas · De outras pessoas` (filtro no cliente,
      sem `kind` na tela); o filtro por **pessoa com nome** é a **26a** + a **27**; `kind` e
      capítulo na tela são a **28**; e o campo de **busca** é a **29**. Nenhuma delas precisa de
      backend novo para os filtros de nota._
      _**Nenhum gate foi rodado para esta linha** — não houve mudança. As contagens do momento
      em que ela foi conferida são as da Tarefa 25: 391 · 182 · 1266 · 536, e 359 de
      integração._
- [x] **26a** — `GET /clubs/:clubId/members` (id, nome, papel, status), com o corte de tenant
      de sempre. **Fatia INSERIDA pelo orquestrador do MVP 2**, antes da 27.
      → `tasks/26a-rota-membros-do-clube.md`
      _**O CLUBE GANHOU NOMES.** Entregue: `MembershipRepository.findByClub`, o UseCase
      `listClubMembers`, o repositório Prisma com contrato, os schemas Zod em `shared`, a rota
      e o teste de integração do corte de tenant. **404 shared** (era 391) **+ 182 ui**
      (intocado) **+ 1287 backend** (era 1266) **+ 536 app** (intocado); **integração 367**
      (era 359). Nenhuma migration — o `Membership` já tinha tudo._
      _**Por que ela existe:** a 27 pede filtro **por pessoa**, e a lacuna estava medida e
      registrada **três vezes** no MVP 1 (linhas 17, 18 e 19) — é a **pergunta 1** do
      `ACEITE-MVP.md`, cuja recomendação era "fazer no início do MVP 2". Medido de novo antes
      de escrever a spec: o `MembershipRepository` tinha só `save · byUserAndClub · findByUser`._
      _**⚠️ A DECISÃO QUE O ADR 0002 DECIDE, e a consequência de produto que ninguém tinha
      escrito: a rota devolve `ACTIVE` E `ARCHIVED`.** A última linha do ADR é *"sair do clube
      arquiva o `Membership`, mas **não** apaga o que a pessoa escreveu: o acervo do clube
      continua íntegro, **com autoria**"* — e autoria sem nome é anonimato, que é exatamente a
      lacuna desta fatia. Medido: filtrar só `ACTIVE` no UseCase dá **1** acusador, no fake dá
      **2** (a direção **restritiva** do §7.1 — a que costuma ficar verde — tem acusador nos
      dois lados aqui). **A frase para a Tarefa 27:** o chip do filtro por pessoa se monta **só
      com `status === 'ACTIVE'`**; os `ARCHIVED` existem **exclusivamente** para resolver o
      nome de quem escreveu e saiu. E a consequência: **todo membro passa a ver quem saiu, pelo
      nome**. É o que o ADR quer, mas significa que "sair do clube" não é "apagar-se dele" — se
      um dia isso for pedido, é feature nova, não reinterpretação do `ARCHIVED`._
      _**⚠️ O ACHADO ALTO era de SEIS rotas, não de uma — e um TESTE pinava a mentira.** O
      docblock da rota afirmava que *"o Fastify nunca casa o `:clubId` vazio"*. **Casa:**
      `GET /clubs//members` responde **400** (medido com sonda de boot **sem banco** — um
      `Proxy` que lança em qualquer acesso ao prisma, e que **nunca disparou**, provando de
      brinde que o 400 é da validação, antes do handler), e o OpenAPI declarava só 200/401/404.
      A regra 11 proíbe declarar status que o handler não produz; **o inverso mente igual** — a
      tela que lê o contrato não sabe do 400, e o front chega lá no dia em que nenhum clube
      estiver selecionado. O executor varreu o OpenAPI inteiro em vez de conferir as duas rotas
      que eu apontei e achou **seis** mentindo (`GET /clubs/:clubId/members`, `GET /books/:bookId`,
      `GET /books/:bookId/writers`, `DELETE /books/:bookId`, `DELETE /notes/:noteId`,
      `DELETE /highlights/:highlightId`) — e as três que acertavam só acertavam **por acidente**
      (têm `querystring`, então já declaravam 400 por outro motivo). **E `book-routes.integration.test.ts`
      tinha um teste chamado `declares exactly the statuses each handler can send` PINANDO a
      lista errada**, com o comentário "nenhum dos dois UseCases lança `InvalidBookError` — então
      não declaram 400": as duas premissas verdadeiras, a conclusão falsa (o 400 é da
      **validação**, não do UseCase). A afirmação não estava só num docblock — **estava pinada em
      asserção, o que a fazia parecer conferida**. É a pior forma da lição nº 5._
      _**A saída foi uma VARREDURA, não seis comentários corrigidos** (§7.9: a guarda mora onde
      a propriedade é decidível e não depende de alguém lembrar dela na rota nº 7). O
      `server-guards.integration.test.ts` percorre **todo** o OpenAPI, injeta o param vazio em
      cada rota que tem param e exige **"400 respondido → 400 declarado"**, com
      **anti-vacuidade pinada** (`toBeGreaterThanOrEqual(6)`) — sem ela, o dia em que nenhuma
      rota responder 400 o `toEqual([])` fica verde sem medir nada (§7.4). **Verificado por
      mutação do orquestrador: apagar o `400` da rota de membros faz a varredura acusar E
      NOMEAR a rota** (`expected [ 'GET /clubs/{clubId}/members' ] to deeply equal []`). O
      `app.swagger()` antes/depois: só as **6** operações mudaram, e só ganhando `400`; as
      outras **18** saíram byte-idênticas._
      _**⚠️ O SEGUNDO ALTO: a precondição da ordem pinava LITERAIS, não o fixture** — a Tarefa
      16 pela metade. Os **ids** estavam pinados; os **nomes** não. Medido: trocar
      `'ana maria'` por `'Zilda'` no fixture deixava o teste `pins the preconditions that make
      this fixture discriminate` **VERDE** (ele comparava literais), e com aquele fixture o
      mutante `localeCompare` — que tem 1 acusador — **sobrevivia a 1286/1286**. Consertado
      extraindo os nomes para constantes usadas **no `seedMember` e nas precondições**, mais um
      pino novo (sem homônimas não há empate para desempatar). Agora a mutação do nome **falha**
      (`expected 1 to be less than 0`)._
      _**A ordem é o fixture mais forte que este projeto já produziu para ordenação** (avaliação
      do revisor): as **quatro** alternativas morrem — sem `sort` **7→2**, nulos na frente **3**,
      `localeCompare` **1**, sem desempate por `userId` **1** —, e o desempate não sobrevive por
      estabilidade acidental do `sort`, porque o fake entrega as homônimas na ordem **inversa**
      da esperada. Ele mata o mutante sem `sort` **até com o fake enumerando naturalmente**._
      _**Cinco testes cujo assunto não era a ordem dependiam dela** (§7.2, corolário): os três
      `gives the OWNER/ADMIN/MEMBER…`, o do membro que saiu e o do nome nulo, todos com `toEqual`
      posicional sobre coleção de 2. Trocados por `toHaveLength` + `arrayContaining`, e o mutante
      "sem `sort`" caiu de **7 para 2** acusadores — os dois dedicados. Com verificação de
      não-regressão: o mutante do espalhamento do `User` continua com **8**._
      _**E a justificativa do fake estava errada sobre a própria medição:** o docblock dizia que
      "se este método devolvesse na ordem natural, um UseCase sem `sort` passaria verde". Medido
      (mutação **dupla**): **3 acusadores**. Quem mata o mutante é o **fixture**, não a inversão
      — a inversão é seguro contra o fixture **futuro**, que pode nascer já na ordem esperada.
      Reescrito com a medição colada._
      _**A dívida que saiu de graça, e o executor não a deixou sair pela metade:** o
      `findByUser` do fake não enumerava invertido enquanto o `findByClub` novo enumerava — a
      armadilha do §7.2 existia em **metade** do port. Medi que o conserto custa **0 acusadores
      em 1286**, então decidi pagar. **E o executor discordou de "custa zero e acabou", com
      razão:** 0 acusadores significa fidelidade **afirmada em docblock e não em teste** — a que
      o próximo refactor apaga —, e o §7.2 exige "testes dedicados, **um por método**". Ele
      acrescentou o do `findByUser` (clubes escolhidos para inserção, inversa e alfabética serem
      três ordens diferentes): **0 → 1** acusador. A convenção passa a valer nos dois métodos,
      agora com quem a defenda._
      _**As duas sondas que provam que o `response` é fronteira e não decoração:** (P1) mutilar
      o UseCase para espalhar o `User` no objeto devolvido dá **8** acusadores, com um teste
      dedicado à regra 7; (P2) remover o `200: clubMembersResponseSchema` faz o **servidor não
      subir**, com a mensagem da guarda de boot — e o unitário fica **1286/1286**, ou seja a
      guarda de boot é o **único** acusador, e é decidível **sem banco** (`buildServer()` +
      `ready()` não conecta). Três barreiras até um e-mail chegar à resposta: construção campo a
      campo (8 acusadores), o `response` schema, e o boot guard._
      _**Decisões:** **sem e-mail** na resposta (a tela precisa de **nome** para atribuir
      autoria; expor o e-mail de todo membro a todo membro é PII além da necessidade, e nenhuma
      tela pediu — se a gerência do MVP 4 precisar, entra lá com decisão do dono) · `name`
      **anulável sem fallback** no backend (`User.name` é `String?` e o aceite não exige nome;
      um `?? 'Alguém'` seria texto de interface **no servidor**, e em que idioma?) · leitura
      **não exige papel** (é atribuição, não administração) · ordem por **code point**, não
      `localeCompare` (escolher locale no backend exigiria decidir **de quem**) · **sem
      `toResponse`**, e é medido: renomear `name` **já** é pego pelo `tsc` (`TS2345`), e a
      direção do campo extra tem 8 acusadores — a identidade protegeria o que já está protegido
      dos dois lados · **um `byId` por membro** (laço), o precedente exato do `getMe`; o `byIds`
      nasce **com** chamador se um clube passar de dezenas._
      _**⚠️ Gerou o §6.9 do `CONVENCOES-CODIGO`, e ele é uma restrição da MINHA instrução:**
      acrescentar **um** método ao port e rodar `typecheck` sem implementá-lo no Prisma dá **16
      erros em 9 arquivos** — `TS2420` na classe e `TS2345` em **sete arquivos de rota sem
      relação nenhuma com a fatia**. Então "ao fim de cada unidade o disco fica verde" é
      **incompatível** com "port+fake primeiro, Prisma depois": quem cresce um port entrega o
      port e a implementação Prisma **na mesma unidade**. O TDD não se perde (o contrato veio
      primeiro, com o vermelho `repo.findByClub is not a function`); muda a granularidade._
      _**Complexidade:** `list-club-members.ts` tem **51 linhas de código** (o precedente
      `get-me.ts` tem 41) — o excedente real são **10 linhas** (`compareByName` + `compareByUserId`),
      que compram **quatro** mutantes com acusador. O "141" do primeiro relatório era contagem
      de **arquivo**, não de código, e ficou registrado para ninguém repetir "141 contra ~60"._
      _**A regra 8 é honesta:** `if (!user) throw` **sobrevive a 1286/1286** — a guarda é defesa
      em profundidade e **não tem acusador possível**, porque a FK `Membership_userId_fkey` é
      `ON DELETE RESTRICT` **e** `ON UPDATE CASCADE` (conferido no catálogo pelo revisor, não
      citado de terceiro). O docblock **aponta para a FK**, como o §7.10 manda, em vez de só
      declarar a indecidibilidade._
      _**Dívidas registradas:** o `UserRepositoryFake` não tem contador de chamadas, então "um
      `byId` por membro" está provado pelo **resultado** e não por contagem — o mutante que
      buscasse o mesmo usuário duas vezes sobreviveria; o contador se justifica quando o `byIds`
      nascer. E `UserRepository.update` continua com `Partial<User>` (a forma latente do
      §7.1.1, como o `BookRepository`)._
      _**Gates:** 404 · 182 · 1287 · 536 unitários e **367** de integração; `typecheck`, `lint`,
      `prettier --check .` e o build limpos. Chunk de entrada **416.714 B** (+71 B do
      `export * from './club'` no barril — adiantamento, porque a 27 usa os dois schemas), 0
      marcas de TipTap. Banco em **0** por consulta ao prefixo `t26a-` **e** a `^t[0-9]{2}-` em
      todas as tabelas; super-admin do seed intacto. Nenhuma migration, `packages/ui` e
      `packages/app` **intocados**._
- [x] **27** — Componente de filtro compartilhado (pessoa · tipo · leitura · cor) em `ui/`.
      → `tasks/27-filtro-compartilhado.md`
      _**O FILTRO DIZ O NOME.** A fatia onde a 26a é cobrada: `De outras pessoas` virou
      **`De Maria`**, e a lacuna que o MVP 1 registrou três vezes (linhas 17, 18, 19) — a
      **pergunta 1** do `ACEITE-MVP` — está fechada. Entregue: o `FilterBar` em
      `packages/ui` (controlado, **agnóstico de dimensão**), a migração dos **dois** filtros
      que já existiam, o chip por pessoa alimentado pela rota da 26a, e a varredura de
      strings cravadas. **408 shared + 195 ui + 1287 backend** (intocado) **+ 552 app**._
      _**⚠️ O BLOQUEADOR É O ACHADO MAIS IMPORTANTE DO MVP 2, e é uma lição que o projeto
      tinha aprendido pela METADE.** A Tarefa 16 criou a partição do §7.9 — vocabulário é
      propriedade do **catálogo** (percorre `pt` **e** `en`), o resto é DOM — e a aplicou ao
      eixo **anti-culpa**. A **privacidade do ADR 0002 ficou no DOM**, por **nove fatias**. E
      todo teste de tela **pina `pt`**. Medido: `person: 'By {{name}} (only you can see this)'`
      plantado no **`en.ts`** passava em **1.146 testes** com **ZERO acusadores**; a **mesma**
      frase em `pt` dava **12**. **Verificado por mutação do orquestrador: 1 acusador em
      `shared` depois do conserto (era 0), e o `book.test.tsx` do app segue 49/49 VERDE com o
      plante — que é exatamente a prova de que a guarda estava no LUGAR errado, não fraca.**
      Consertado com `privacy-terms.ts` ao lado do `guilt-terms.ts`, e o `adr-0002-dom.ts` do
      app passou a **importar** a lista em vez de ser dono dela (lição nº 3). Falso positivo
      zero, medido de duas formas — inclusive um teste que pina as palavras legítimas que um
      radical mal escolhido acusaria (`'isso você escreveu ontem'`, salvo pela âncora `\b`).
      **Gerou a emenda do §7.9:** ter **uma** guarda de catálogo funcionando é o que faz a
      segunda parecer coberta._
      _**Dois ALTO, os dois com zero acusadores:** (1) a invariante "**sempre exatamente um
      chip pressionado**" não tinha dono, e o próprio docblock nomeava **dois caminhos reais**
      em que o filtro fica sem nenhum chip aceso recortando a lista por critério invisível
      (`/members` chega devagar → toco "De outras pessoas" → os membros chegam → o chip morre e
      o recorte fica). O revisor mediu que **é decidível** (o `Responder` do harness devolve
      `Promise`, então uma resposta resolvida à mão produz a transição em jsdom) — 0 → 1.
      (2) O extrator de strings cravadas era **contornável por duas escritas naturais** —
      `title={'X'}` (o Prettier **não** normaliza `={'x'}` para `="x"`, medido) e
      `const X = 'prosa'` —, as duas com `eslint`, `prettier` e `tsc` verdes, e o teto de 33
      **não se movia**. 0 → 2 em cada. É a única guarda que impede o buraco de crescer enquanto
      a pergunta 7 do aceite não é respondida._
      _**⚠️ A minha contagem estava pela metade, e o executor a corrigiu:** eu medi "16 strings
      cravadas, todas no `RichEditor`". São **33 ocorrências / 24 textos / QUATRO arquivos** —
      `RichEditor.tsx` (18/16), **`slash-command.ts` (13)**, `SlashMenu.tsx` e `MentionList.tsx`
      —, e o revisor reimplementou o extrator do zero e chegou no mesmo número. O meu `grep`
      só olhava `label=`/`label:` em `components/*.tsx`. E o executor acrescentou a asserção que
      a minha regra não pedia e **sem a qual o teto não guarda nada**: **nenhuma string cravada
      fora dos 4 arquivos isentos** — o teto sozinho deixaria trocar um rótulo do editor por um
      do filtro em silêncio._
      _**O número do bundle não eram dois números:** a `bundle-guard` media `asset.code.length`
      sobre string **decodificada** — unidades **UTF-16**, não bytes —, e os acentos dos
      catálogos custam 2 bytes e 1 char. Daí o "417.719 × 418.003" e a "divergência de 283 B
      não reproduzida" que a minha spec registrou: **sempre foi o mesmo build medido de dois
      jeitos**. Consertado com `Buffer.byteLength`, e agora o número medido é o número do nome.
      Entrada **418.114 B**, folga **31.886 B**, **0 marcas** de TipTap._
      _**A atribuição do crescimento, por 4 builds:** `FilterBar` **+347 B** (entra uma vez) ·
      `book.tsx` **+848 B** · `highlights.tsx` **−12 B — ela ECONOMIZA** · catálogos **+106 B**
      = +1.289 B, fechando exato. **E a projeção das duas últimas fatias melhorou**, porque a 28
      **reusa** o `FilterBar`: ~4,2 kB (28) + ~1,6 kB (29) + ~1,1 kB de chaves ≈ **7 kB**, contra
      os ~14,5 kB projetados na 25. Sobram ~25 kB. **Não precisa do `en` por `import()`** (os
      8.984 B medidos ficam registrados para quando precisar), e o teto não se eleva._
      _**Duas prosas falsas, as duas minhas ou copiadas de mim:** (a) *"o slot `start` do
      `FilterChip` nunca teve chamador"* — **falso**, tinha **dois** (`highlights.tsx:455` e
      `highlight-fields.tsx:145`, desde as Tarefas 24/25), e a linha 455 é **uma das que esta
      fatia migrou**; a afirmação estava em quatro arquivos e era a justificativa de peso da
      minha decisão D. O que é novo é o **`PersonAvatar`** no slot. (b) O docblock do retry
      dizia que ligar as duas cargas ao mesmo gatilho era "exatamente o defeito medido no
      `notesAttempt`" — **não era**: aquele defeito era reusar o `attempt` do **livro**, que
      joga o `state` para `loading`. **A analogia estava vestida de medição**, a classe que já
      caiu duas vezes na Tarefa 24._
      _**Três MÉDIO mais, todos com 0 acusadores antes:** o `MembersState.failed` era
      indistinguível de `loading` (o union voltou a **duas** variantes — a terceira era peso
      morto e fazia o teste da regra 14 parecer provar "a falha é vista" quando provava "o
      não-`ready` degrada"); o **retry** não estava pinado em **nenhuma** das duas direções
      (agora refaz as três cargas, com `/members` = 1 → retry → 2); e o prefixo `author:` era
      defesa sem dono — o revisor mostrou que o fixture **é** produzível pela fronteira que a
      tela valida (`clubMemberResponseSchema` declara `userId: z.string()`, **sem `.uuid()`**),
      então `{ userId: 'mine' }` passa e daria **dois chips acesos**. 0 → 1._
      _**A inconsistência de vocabulário na MESMA tela, consertada nas duas metades:** o plano
      dizia "Alguém do clube escreveu neste dia" com glifo neutro enquanto o acervo dois dedos
      abaixo dizia "M · Maria". Agora um `nameOfWriter` alimenta os dois, com chave
      **interpolada** (`{{name}} escreveu neste dia`) e fallback na frase genérica. Custo
      medido: **+111 B**. O fixture teve de trocar `Maria`→`Zeca` porque `Maria`/`Marcos` dão a
      **mesma** inicial "M" e a asserção não distinguiria "o nome de cada um" de "o meu nos
      dois" — é o §7.8 aplicado a um fixture de inicial._
      _**Uma honestidade do executor que vale registrar como método:** o primeiro mutante do
      item 9 (`AUTHOR_SCOPE_PREFIX = ''`) deu **16** acusadores, e ele o descartou por ser
      **degenerado** — com prefixo vazio, `''.startsWith('')` faz todo scope virar autor e a
      lista inteira desaparece. **Mutante degenerado não é medição**; o número que vale é o 1 do
      mutante equivalente. É a primeira vez no projeto que um agente rejeita o próprio número
      alto por ser inútil._
      _**Onde eu errei na direção pessimista:** perguntei se a lista de arquivos da varredura do
      ADR 0002 em `ui/` era escrita à mão (a classe "guarda que depende de memória"). **É
      derivada** (`readdirSync` recursivo), e o nome do arquivo na lista é só o **pino positivo**
      do §7.4. Provado: um componente novo em `ui/src/components/` com cadeado + `<svg>` +
      frase de privacidade dá **6 acusadores**. Componente novo nasce **dentro** das guardas._
      _**A migração não perdeu nada**, e o revisor provou mecanizando o `git diff`: nenhum
      `role=`, nenhum `aria-label=` além do que virou prop, **nenhum token de `className`**
      (`comm -23` vazio nos dois arquivos), nenhuma chave `pages.*`. E ela é real por **três
      eixos independentes**, cada um acusando nas **duas** suítes de tela: `aria-label` do grupo
      (7+1), `start` (2+1), `pressed` (2+2)._
      _**Complexidade — e o número a vigiar mudou:** `book.tsx` foi de **400 para 486** linhas
      (a Tarefa 25 o havia aliviado de 426→400). É a **2ª maior tela**, a 79 linhas do
      `free-note.tsx` (**565**), que segue sendo a maior e que esta fatia não tocou. `FilterBar`
      **45** linhas, com **2 consumidores provados por mutação** (não por leitura).
      **A Tarefa 28 é quem tira o acervo do `book.tsx`** — e o número a vigiar agora é 486._
      _**Dívidas registradas:** a tela de grifos é **o último lugar** onde o alheio ainda é
      "Alguém do clube" (ela não carrega `/members`) — é da 28, que junta os dois acervos · as
      17 chamadas duplas `expectNoGuilt(); expectNoPrivacyTalk();` herdadas das Tarefas 19/25
      (esta fatia **não** acrescentou nenhuma: 10→10 e 12→12, medido) · `FilterChip` sem
      `renderLink`/`disabled`, então a aba "Anotações" segue como chip à mão — **agora com
      acusador** (`toHaveLength(1)` sobre `<FilterChip`) · a 3ª cópia de `sourceFiles`/
      `stripComments` em `ui`, com razão medida (as três varreduras isentam conjuntos
      diferentes)._
      _**Gates:** 408 · 195 · 1287 · 552; `typecheck`, `lint`, `prettier --check .` e o build
      limpos. Entrada **418.114 B** (agora em bytes de verdade). `packages/backend` e `prisma/`
      **intocados**; os **367** de integração **não** rodados._
- [x] **28** — Tela de acervo do livro: anotações + grifos num só lugar, com o filtro.
      → `tasks/28-tela-de-acervo.md`
      _**O ACERVO EXISTE, E A TELA DO LIVRO VOLTOU A SER O PLANO.** Uma lista com as anotações
      do dia, as avulsas e os grifos, ordenada por `createdAt` desc e **intercalada**, com as
      **quatro** dimensões de filtro; a tela de grifos foi **absorvida** e a de livro
      **encolheu de 486 para 247 linhas**. **408 shared + 195 ui** (intocado) **+ 1287
      backend** (intocado) **+ 558 app** (era 552)._
      _**⚠️ ESTA É A ÚNICA FATIA DO MVP 2 QUE APAGA CÓDIGO DE UMA TELA MADURA**, e a pergunta da
      auditoria não foi "o novo funciona?" e sim "**o que perdeu o dono no caminho?**". O
      revisor comparou **nome por nome** as **78** asserções que existiam (49 no `book.test.tsx`
      + 29 no `highlights.test.tsx`) contra as **81** de hoje, mutou as **cinco** propriedades
      mais caras e mutou **todas** as funções exportadas do módulo novo. **Nenhuma propriedade
      de produto ficou sem dono.** Asserções: 378 → **406**. O único nome que sumiu sem
      equivalente é o da regra 13 da 27 (`nobody stops being "you"…`), e é porque **o estado
      deixou de existir**: o acervo não renderiza a lista antes do `/me` chegar, e essa garantia
      mais forte tem acusador próprio (`nada é pedido`)._
      _**⚠️ O ACHADO ALTO: eu escrevi "impossível" sem medir, e o §7.10 proíbe exatamente
      isso.** O executor registrou que generalizar a decisão E (esconder o controle que só pode
      esvaziar a lista) para o `<select>` de leitura **tornaria a regra 11 impossível**. O
      revisor **aplicou** a generalização e a suíte ficou **557/557 verde**, por dois motivos
      medidos: o teste da regra 11 já põe o tipo no **neutro**, e a exclusão mútua já valia para
      a **cor** sem impedir nada. Custo real: **+8 linhas, 3 pontos de edição**. Sem isso, a
      sequência ficava sem dono: a pessoa toca "Avulsa", o `<select>` continua oferecendo os 30
      dias do plano, ela escolhe um, e a lista vai a zero. **Verificado por mutação do
      orquestrador: 0 → 1 acusador**, e a frase falsa foi corrigida no código com o porquê._
      _**Dois trechos que sobreviviam a 557 testes, e a saída foi diferente em cada um** — é a
      distinção que o §7.10 pede: (a) o `colorApplies ? color : null` no recorte era **código
      morto** (o `setColor(null)` do `onSelect` já garantia a invariante), e o docblock afirmava
      "um dono só" e **escrevia o segundo** — foi **apagado**, e agora são duas regras com um
      dono cada (o render decide se o controle **EXISTE**, o `onSelect` decide se a escolha
      **SOBREVIVE**); (b) o ramo `myId === null` do `matchesAuthor` é **inalcançável** nesta
      tela e **ficou**, porque o módulo se declara reusável pela Tarefa 29 e uma segunda
      chamadora que renderize com `me` nulo herdaria a lista partida ao contrário — mas o
      docblock passou a dizer as três coisas que faltavam: a medição, **por que** é inalcançável,
      e **onde a propriedade é provada**._
      _**A lição nº 3 apareceu pela TERCEIRA vez nesta sessão, e a fatia a tinha criado:** ela
      duplicou `nameOfWriter` + `MembersState` entre o `book.tsx` e o `acervo.tsx` — dois corpos
      **byte-idênticos** —, que é exatamente a "duas verdades sobre o mesmo nome" que a decisão
      G proíbe e que a Tarefa 27 existiu para fechar. Subiram para `pages/club-names.ts` (23
      linhas). **E ficou estritamente melhor, medido:** antes eram necessárias **duas** mutações
      (uma por cópia) para obter os 3 acusadores; agora **uma** mutação do dono único atinge os
      dois lados — uma correção não pode mais esquecer a outra tela._
      _**⚠️ A COSTURA QUE EU MANDEI CORTAR ERA A ERRADA, e o executor discordou de ONDE ela
      deveria morar — com medição, e ele estava certo.** Eu apontei o `highlightRow` (que ele
      havia nomeado como "~90 linhas"; são **63** pelo contador canônico) e disse que o
      construtor de `FilterGroup[]` era "função pura e já é o assunto do `acervo-entries.ts`".
      **Não é pura:** o `FilterOption.start` é um `ReactNode` — o chip de pessoa carrega um
      `<PersonAvatar>` e cada chip de cor uma `<ColorSwatch>` —, então construir os grupos
      **exige JSX**, e a **única** propriedade que o `acervo-entries.ts` promete é não saber o
      que é React. Foi para um `acervo-filters.tsx` novo (165 linhas), e no `acervo-entries.ts`
      ficaram só as **constantes de vocabulário** que os dois lados comparam — essas sim puras,
      e é por isso que comparação e construção nunca discordam. A costura certa era o
      `collection()`: **146 → 98** linhas, e é lá dentro que o campo de busca da 29 entra._
      _**Complexidade — e o acervo DEIXOU de ser a maior tela do app:** `acervo.tsx` **514**
      (nasceu com 703, foi a 610 com a primeira extração e a 514 com a segunda) ·
      `acervo-filters.tsx` **165** · `acervo-entries.ts` **113** · `club-names.ts` **23** ·
      `book.tsx` **247** (era 486). O maior arquivo do app continua sendo o `free-note.tsx`
      (**565**), que nenhuma fatia do MVP 2 tocou. A costura registrada e **não** cortada é o
      card de grifo (63 linhas, 4 dependências), e nenhuma fatia planejada mexe nele._
      _**Dois desvios que tocaram arquivo que a spec proibia — os dois obrigatórios, medidos:**
      (a) o `highlight-form.tsx` navegava para `highlightsPath` em **4** lugares; apagar a rota
      deixaria os quatro caindo no `NotFoundPage`. (b) O `free-note.tsx` navegava para o
      `bookPath` ao arquivar: com o acervo fora daquela tela, o teste `sends DELETE on confirm,
      and the note is GONE from the collection` **perde o acusador inteiro** — o revisor mutou e
      confirmou (1 acusador). E **o arquivamento de grifo entrou sem estar nas 18 regras**,
      porque `grep -n "archive|api.delete"` no `highlight-form.tsx` devolve **vazio**: não
      migrá-lo apagaria do produto a **única** forma de arquivar um grifo._
      _**A fidelidade da coluna nula, agora na tela:** escolher uma **leitura** exclui a avulsa e
      o grifo (nenhum dos dois tem `planItemId`), e escolher uma **cor** exclui as anotações —
      esta segunda foi desvio do executor, porque "sem isso o AND não é AND". As duas com
      acusador (3 e 4), e o teste **diz o porquê** (o `planItemId` nulo, a 4ª aparição do §7.1)
      em vez de só assertar o resultado. O AND foi medido cláusula por cláusula: tipo 4 · cor 4
      · leitura 3 · pessoa 6._
      _**O achado que o executor pegou em si mesmo, e que é a forma mais pura do §7.9:** ao
      reescrever o teste para o acervo unificado ele **perdeu o bloco do estado vazio**, e a
      mutação de privacidade no `title` daquele estado deu **0 acusadores no DOM** — a varredura
      existia, a lista de termos estava certa, e **o estado não era renderizado por ninguém**. O
      bloco voltou, e o revisor confirmou plantando privacidade **e** cobrança em **sete**
      estados, um por chave de catálogo: vazio **5** · filtrado **4** · falha do acervo **3** ·
      404 do livro **1** · sheet de arquivar **1** · falha do `/me` **5** · carregando **2**._
      _**Um teste vacuoso, achado por mutação:** `never lets the COLOUR be the only carrier`
      percorria `highlightRows()` **sem precondição de comprimento** — com o rótulo do tipo
      mutado para `''` a lista ficava vazia, o laço não rodava e **o teste passava**. Nenhuma
      propriedade se perdia (o mutante morria em dois outros lugares), mas o teste que
      **promete** a regra 4 da 25 não provava nada. Com `toHaveLength(5)`: 2 → **3** acusadores._
      _**O bundle: +288 B nesta rodada e +740 B na fatia**, contra uma projeção de ~4,2 kB —
      porque a fatia **substituiu** uma tela em vez de somar (linhas líquidas: +610 +110 −381
      −232 = **+107**). Entrada **419.142 B**, **0 marcas** de TipTap, teto **450.000 não
      relaxado**, folga **30.858 B**. Para a Tarefa 29 (um `<input>`, ~2 chaves × 2 locales e
      uma cláusula no `filterEntries`): ordem de 1 a 2 kB. Sobra com muita margem._
      _**Dívidas registradas:** **12 testes** comparam posicionalmente embora a ordem não seja o
      assunto deles — mantidos, porque aqui a ordem **é** regra de produto (regra 1),
      determinística e pinada em teste próprio, e a precondição de índices está pinada; **o
      risco é da 29**: se ela trocar a ordem por ranking de relevância, os 12 ficam vermelhos
      por um motivo alheio aos nomes deles · um dos quatro destinos do `highlight-form.tsx` não
      tem acusador de destino (pré-existente; o compilador é o acusador de rota morta) · "sem
      requisição nova" é nomeado só para a dimensão pessoa (mesmo efeito, mesmo mecanismo) ·
      `FilterChip` sem `renderLink`/`disabled` (esta fatia deixou de ter chamador para a
      lacuna)._
      _**Gates:** 408 · 195 · 1287 · 558; `typecheck`, `lint`, `prettier --check .` e o build
      limpos. `packages/ui` e `packages/backend` **intocados** (`git status` sem entradas);
      os **367** de integração **não** rodados._
- [x] **29** — Busca simples por texto no acervo do clube. → `tasks/29-busca-por-texto.md`
      _**A ÚLTIMA FATIA, e ela é a CHAMADORA que o filtro `text` do `listNotes` nunca teve** —
      ele existia, funcionava e estava coberto por integração **desde a Tarefa 10**, e nenhuma
      tela jamais o chamou. Entregue: `HighlightFilter.text` (port, fake, UseCase, Prisma,
      borda, integração), o escape do `LIKE` extraído para **um** arquivo, e a tela `/busca` —
      do **clube inteiro**, em qualquer livro, dizendo de qual livro é cada resultado.
      **413 shared + 195 ui** (intocado) **+ 1307 backend + 603 app**; **integração 387**._
      _**⚠️ O ACHADO ALTO tinha causa raiz mais funda que a falta do teste: uma FRASE servia
      DOIS estados.** `pages.busca.loading` era usada pela espera do **clube** e pela espera da
      **busca** — então (a) a tela dizia "Procurando…" com o `/me` no ar, quando **nada** havia
      sido pedido (não há nem campo em tela), e (b) **a varredura de DOM não consegue separar
      dois estados que falam com a mesma frase** (§7.9 na letra). Medido: `return null` no ramo
      de `loading` dava **0 acusadores em 600**, e uma cobrança plantada ali também. Consertado
      com **duas** chaves (`clubLoading` × `loading`), cada teste afirmando a sua e **negando a
      do outro**. **Verificado por mutação do orquestrador na forma mais fina possível:** com a
      frase **intacta** e a cobrança num nó **IRMÃO** — o único arranjo em que só a varredura
      pode acusar — dá **1 acusador** (`expected … not to contain 'deixou'`). Era 0._
      _**⚠️ E a extração de um helper achou um buraco maior que a duplicação:** o `excerptOf`
      estava byte-idêntico nas duas telas e **não tinha acusador em NENHUMA** — mutá-lo para
      `return text` (matando truncamento, colapso de `\s+` e `trim`) dava **0 em `acervo.test`
      (55) e 0 em `busca.test` (44)**, porque nenhum fixture tinha texto acima do teto nem
      espaço nas pontas. **Extrair um helper sem acusador para um módulo compartilhado é a
      forma do §7.4: ele passa a PARECER coberto porque tem dono.** O executor pôs o acusador
      **primeiro** (sem pinar o número do teto, que seria a identidade do §7.8) e só então
      extraiu: cópias 2 → 1, acusadores 0 → 1._
      _**O `noteTarget` NÃO desceu, e a discordância vem com medição — eu estava errado.** Eu
      disse que "a única diferença entre as duas versões é o parâmetro". A diferença que decide
      é a **aresta de import**: `paths.ts` seria **ciclo de verdade** (o `free-note.tsx` **já
      importa** `paths.ts`, e os dois lados têm `const` de **módulo** — exatamente a forma que a
      auditoria da Tarefa 20 mediu e precificou: derruba a rota **no import**, tela branca, e
      qual lado é o frágil depende da ordem alfabética dos imports do `router.tsx`); e
      `acervo-entries.ts` **quebraria a promessa que o próprio docblock dele faz** ("não importa
      nenhuma tela, e é isso que o mantém livre do ciclo"). A duplicação **está guardada nos
      dois lados** (3 e 1 acusadores), então não pode divergir em silêncio. **Dívida registrada
      com o conserto nomeado:** mover `dayNotePath`/`freeNotePath` para o `paths.ts` com as
      telas reexportando — o **precedente já está no próprio `paths.ts`** (o `book.tsx`
      reexporta `BOOK_PATH`) — e aí o `noteTarget` cabe sem ciclo. ~10 linhas e três imports,
      para quem reabrir o `free-note.tsx`._
      _**O corte de tenant da busca: o meu medo não se confirmou, e o dono é forte.** O revisor
      provou a semântica pelo **SQL gerado**: a forma correta emite
      `WHERE ("clubId" = $1 AND (quote ILIKE $2 OR commentText ILIKE $3))`, e a variante que põe
      o `clubId` **dentro de cada ramo** do `OR` **passa e deve passar** (é equivalente). O dono
      carrega o tenant **no título** do teste, no docblock e num fixture que existe só para
      matá-lo. ⚠️ **Mas a rota nunca buscava sem `bookId` — que é como a TELA busca:** o
      `searchIds()` mandava sempre `?bookId=`, então um `clubId` perdido no `where` era
      **invisível** ali (0 acusadores na rota). Consertado com um teste de clube inteiro **sem
      `bookId`**, com fixture de grifo de outro clube que casa o termo: 0 → **1** na rota, mais
      2 no contrato._
      _**O par positivo que faltava** (§7.3, "meio contador"): o lado negativo tinha dois donos
      (0 e 1 caractere não pedem), o positivo **nenhum** — `MIN_TERM_LENGTH` 2→3 dava **0
      acusadores em 600**, e subir o mínimo deixaria a tela parada para quem digitou uma palavra
      de duas letras. Teste de fronteira com termo de **exatamente dois** caracteres (com
      `'esmeralda'` um mínimo de 3, 4 ou 5 passaria igual): 0 → **1**._
      _**Decisões, e as duas primeiras são perguntas do dono registradas:** a busca casa
      **`quote` OU `commentText`** nos grifos — a decisão fechada nomeia só os campos derivados,
      mas o `quote` é o **conteúdo** (ADR 0004), e o revisor mediu que só-`commentText` deixaria
      o **grifo sem comentário INALCANÇÁVEL** pela busca, em dois passos: sem comentário o
      `commentText` é string **vazia** (não nulo), e `'' ILIKE '%x%'` é **false** no Postgres ·
      **`unaccent` fora de escopo** (a decisão fechada diz `ILIKE`, que é accent-sensitive, e
      está pinado contra o banco desde a 11; ligar exige DDL + índice funcional + ADR) · busca
      **do servidor**, não do cliente (substring em JS não é `ILIKE`) · tela **própria**, porque
      a home é de clube e o acervo é de livro · **sem contador de resultados** (a forma que a
      varredura anti-culpa proíbe, por decisão de produto — se o dono quiser o número, é ele que
      relaxa a guarda) · debounce de **400 ms**, provado por **contagem** com timers falsos e
      **debounce, não throttle** (399 → 1 acusador; 401 → **24**)._
      _**O escape do `LIKE` virou UM arquivo** (`repositories/like-pattern.ts`, 3 linhas), e a
      extração **não custou nada**: o mutante "descarte cego de nulos" continua dando **3 no
      grifo e 33 na nota** — número por número igual ao registro da Tarefa 23. O `matchesText`
      mudou-se para o `sql-equality.ts` e o arquivo **não** foi renomeado, de propósito: o §7.1
      cita aquele endereço nominalmente, e renomear envelheceria o ponteiro do documento._
      _**Uma atribuição causal a mais, corrigida:** o executor creditou 11 acusadores ao
      `matchesText` **variádico**. O revisor mediu que a disjunção (`m(t,a) || m(t,b)`) dá
      **0 acusadores de diferença** — os 11 vêm de **a segunda coluna existir**, e seriam os
      mesmos com qualquer das duas escritas. O argumento dele contra a disjunção continua
      **factualmente certo** (com `t === undefined` ela dá `true || true`, "uma disjunção que
      não pode falhar escrita como se pudesse"), mas o variádico é escolha de **legibilidade**,
      não propriedade testável. Ele aceitou: *"apresentei uma medição como se fosse dela"._
      _**⚠️ E o fechamento do MVP: o revisor mediu que DOIS pedaços da frase de aceite não têm
      dono**, e os dois viraram pergunta do dono (3 e 4 do `ACEITE-MVP`): (1) *"em qualquer
      listagem eu filtro… por texto"* é **falso** — o acervo filtra por quatro dimensões e
      **não** tem campo de texto; a busca filtra por texto e **não** tem as outras quatro; as
      cinco **nunca coexistem**. A boa notícia é que a segunda metade ficou **barata** (o `text`
      já existe em todas as camadas dos **dois** recursos). (2) *"por capítulo"* **não existe
      para grifo** em lugar nenhum: o `readingKeyOf` devolve `null` para `HIGHLIGHT`, o capítulo
      de um grifo mora na `reference`, e há teste que **pina** que a busca não a toca. A segunda
      é lacuna de produto que **ninguém tinha nomeado** até a auditoria da última fatia._
      _**Dívidas registradas:** a aritmética do teto de 500 vale para a anotação do plano
      (~8 meses); para **grifo** é **~3 meses** para quem grifa 5 trechos por dia, e essa
      correção está no docblock · a tela **não avisa** quando corta em 500, e o conserto honesto
      é o **servidor** dizer que truncou (mudança de contrato, §6.8) · o `noteTarget` duplicado,
      com o conserto nomeado acima._
      _**Gates:** 413 · 195 · 1307 · 603 e **387** de integração; `typecheck`, `lint`,
      `prettier --check .` e o build limpos. Entrada **424.995 B** — a extração do `excerptOf`
      devolveu **mais** do que as duas chaves novas custaram (−61 B) —, **0 marcas** de TipTap,
      teto **450.000 não relaxado**, folga **25.005 B**. Banco em **0** por consulta a `t2%`,
      super-admin intacto. `packages/ui` **intocado**._

## Definição de "MVP 2 pronto"

> **As nove tarefas estão entregues e verdes (22, 23, 24, 25, 26, 26a, 27, 28, 29). O MVP 2
> está em ACEITE** — o roteiro, as **sete** perguntas e o veredito moram em
> `docs/ACEITE-MVP.md`. As respostas do dono viram decisões fechadas aqui antes de o MVP 3 ser
> detalhado. **Quem fecha é o dono, não a IA.**
>
> Contagens: **413** `shared` · **195** `ui` · **1307** `backend` unitários · **603** `app`,
> mais **387** de integração. Chunk de entrada em **424.995 B** (teto 450.000, folga 25.005),
> com **0 marcas** de TipTap.

Eu registro tudo que grifei — trecho, cor, página e meu comentário — e vejo a coleção de
grifos do livro filtrada por cor e por pessoa. E em qualquer listagem eu filtro por pessoa,
por tipo de anotação (do dia × avulsa), por capítulo e por texto.

⚠️ **DOIS PEDAÇOS DESSA FRASE NÃO ESTÃO CUMPRIDOS, e foram MEDIDOS na auditoria da última
fatia** — não descobertos por leitura otimista no fim. Estão registrados como as perguntas
**3** e **4** do MVP 2 no `docs/ACEITE-MVP.md`, e **não** foram implementados por conta
própria porque mudam o que o app é:

1. **"em QUALQUER listagem eu filtro… por texto" é falso.** Existem duas telas de listagem e
   cada uma tem metade do filtro: o **acervo do livro** recorta por pessoa, tipo, leitura e cor
   e **não** tem campo de texto; a **busca do clube** recorta por texto e **não** tem as outras
   quatro. As cinco dimensões **nunca coexistem**. Cada metade tem razão medida (o acervo
   recorta no cliente o que já carregou; a busca pergunta ao servidor porque o acervo do clube
   não está em tela nenhuma), mas a frase, como escrita, promete o que não existe. **A saída
   ficou barata:** o filtro `text` já existe em **todas** as camadas dos **dois** recursos —
   port, fake, UseCase, repositório Prisma, borda e integração —, então um campo de texto no
   acervo é fatia curta de tela.
2. **"por capítulo" não existe para GRIFO em lugar nenhum.** O filtro por leitura alcança só a
   anotação do dia: o `readingKeyOf` devolve `null` para `HIGHLIGHT`, porque o ADR 0004 decidiu
   (bem) que o grifo não depende de um dia do plano. O capítulo de um grifo mora na
   `reference` ("Cap. 12"), e **nem o filtro nem a busca a tocam** — há teste de contrato que
   **pina** que a busca não a casa. "Os grifos do capítulo 3" não tem como ser pedido.
   É lacuna de produto que **ninguém havia nomeado** em nove fatias.

**O que o MVP 2 entregou além da frase:** a rota de membros do clube (**26a**, inserida), que
fechou a **pergunta 1 do MVP 1** — o filtro diz o nome e o avatar diz quem escreveu. E a
**Tarefa 26 não custou uma linha de código**: o escopo dela já estava entregue pelas Tarefas
10 e 11, medido nas quatro camadas antes de qualquer executor ser despachado.

⚠️ **O que continua FORA, e é decisão pendente do MVP 1:** abrir o app **sem rede** (cache de
leitura) — a **pergunta 5** do MVP 1, sem resposta. A regra do fechamento era não entrar sem
ela, e o MVP 2 seguiu sem. Hoje é a coisa mais valiosa de fora.

---

# MVP 3 — Ritmo e incentivo

## Decisões fechadas do MVP 3

- `ReadingLog` e `ActivityEvent` são **logs imutáveis**; desmarcar "li" é **hard delete**.
- **Progresso é calculado**, nunca guardado.
- Push VAPID com **dispatcher pull-based** chamado por cron externo; idempotência por claim
  em `NotificationDelivery`. → `docs/adr/0006-*.md` e `docs/NOTIFICACOES.md`.
- **O lembrete não chega para quem já registrou a leitura de hoje** (princípio anti-culpa).
- **O push nunca leva o conteúdo da nota** — só quem e sobre qual tema.
- Essa feature entra **com port, fake e teste** como qualquer outra. Sem `$queryRaw` na rota.

### Fatia inserida antes do Bloco G

- [x] **29a** — O catálogo `en` sai do chunk de entrada: `import()` + `addResourceBundle`.
      **Fatia INSERIDA pelo orquestrador do MVP 3**, antes da 30.
      → `tasks/29a-catalogo-en-sob-demanda.md`
      _**A FOLGA QUE AS NOVE FATIAS SEGUINTES PRECISAVAM.** Entregue: o subpath
      `@clube/shared/locales/en`, o `resources` virou `eagerResources` (só `pt`), e o
      carregador preguiçoso em `packages/app/src/i18n/lazy-catalog.ts`. **415 shared**
      (era 413) **+ 195 ui** (intocado) **+ 1307 backend** (intocado) **+ 620 app** (era 603).
      Integração **não rodada** — a fatia não toca repositório, rota nem banco (baseline 387)._
      _**Por que ela existe, e o número que decidiu:** a folga era **25.005 B** e o MVP 3 tem
      pelo menos três telas a ~5,9 kB cada. Mas o número que decidiu não foi a folga, foi a
      **taxa**: com os dois catálogos eager, toda chave nova custava o chunk **duas** vezes
      (~86 B por par `pt`+`en`); agora custa uma. Feita primeiro, ela barateia as nove fatias
      seguintes; feita no fim, salvaria só a última._
      _**⚠️ A MEDIÇÃO CORTOU METADE DO ESCOPO ANTES DE A SPEC SER ESCRITA.** Eu esperava ter de
      apagar o `export { en }` do barril e reescrever os **10 arquivos de teste** que importam
      esse binding. Medido por mutação: com o `en` fora do `eagerResources`, o Rollup
      **tree-shaka o re-export não usado** e os bytes saem igual (415.412 B **com** o
      re-export). Os 10 arquivos ficaram **intocados** — e isso importa além do churn: as três
      guardas do §7.9 importam `en` **do barril**, e apagá-lo as teria feito ver metade dos
      idiomas._
      _**⚠️ O BLOQUEADOR, E A LIÇÃO Nº 1 DUAS VEZES SEGUIDAS.** A primeira entrega tinha o
      chunk de entrada 9,6 kB menor e **o service worker precacheando o chunk do `en`** —
      `globPatterns: ['**/*.{js,...}']` o pegava. Medido contra o baseline **verdadeiro** do
      HEAD: precache **15 entries (887,15 KiB) → 16 entries (887,79 KiB)**, ou seja a fatia
      fazia o install baixar **0,64 KiB a MAIS**. Verde em todos os testes. ⚠️ **E o revisor
      chegou à conclusão certa pelo número errado:** ele comparou contra um "antes" que ele
      reconstruiu, e esse "antes" já continha os 660 B do carregador da fatia — então ele viu
      empate onde havia regressão. Foi a repetição da medição pelo orquestrador, contra o
      baseline de verdade, que deu a gravidade. Conserto: `globIgnores: ['assets/en-*.js']`._
      _**⚠️ E A GUARDA DO CONSERTO ERA OCA — achado do orquestrador, e é a mesma classe um
      nível acima.** A primeira guarda afirmava que a string `globIgnores: ['assets/en-*.js']`
      estava no `vite.config.ts`. Mas a propriedade é *"o `en` não está no manifest de
      precache"*, e ela quebra **sem aquela string mudar um byte**: o glob está amarrado a um
      nome que o **Rollup** escolheu. Mutante realista (`chunkFileNames:
      'assets/chunk-[name]-[hash].js'`, `globIgnores` intacto): o chunk virou
      `chunk-en-DQfkl5UE.js`, o precache voltou a **16 entries (887,85 KiB)** e a suíte deu
      **619 passed — ZERO acusadores**. A guarda mudou de lugar para o `bundle-guard.test.ts`,
      que **já roda um build real** no `beforeAll` (o `sw.js` estava sendo gerado ali de
      graça), e identifica o chunk **por conteúdo, não por nome**. Depois: **0 → 1 acusador**,
      com o vermelho nomeando o arquivo que vazou. A de texto ficou, rebatizada para
      `DECLARES the intent…`, e os dois docblocks apontam um para o outro._
      _**Os outros quatro achados, todos corrigidos com acusador novo:** (1) `ensureCatalog`
      mentia no nome — sempre carregava o inglês e o registrava sob o locale recebido, uma
      armadilha de **zero acusadores** no dia do terceiro idioma; virou `ensureEnCatalog` e o
      `if` do `changeLocale` tem **2** acusadores. (2) Corrida de toque duplo no seletor: a
      carga em voo do `en` vencia a escolha posterior de `pt`, deixando tela, `<select>` e
      preferência gravada em desacordo — conserto "quem pediu por último manda", **1**
      acusador. (3) A profundidade do `eagerResourcesCopy` era indistinguível da cópia rasa
      (**0** acusadores); ganhou dono, e a rasa agora dá **5**. (4) O caminho de boot com
      `import()` rejeitado não era percorrido por ninguém; ganhou teste._
      _**O bug que o executor achou e a spec não previa:** `addResourceBundle` escreve
      **dentro** do objeto passado em `resources`, e esse objeto era um só, exportado do
      `shared` — uma instância do i18next contaminava as outras, e `hasResourceBundle('en')`
      respondia `true` numa instância recém-criada. A memoização estaria guardando catálogo
      alheio._
      _**Complexidade (o dono pediu):** o `i18n.ts` dobrou (64 → 124 linhas canônicas) com três
      assuntos que não conversam. Dividido em `i18n/lazy-catalog.ts` (**55**), e o `i18n.ts`
      voltou a **87**. ⚠️ **Na ordem certa** — os acusadores primeiro, a extração depois
      (lição nº 15 do MVP 2: extrair helper sem acusador o faz **parecer** coberto)._
      _**Gates:** `test` · `typecheck` · `lint` · `prettier --check` · `build` limpos.
      Entrada **416.107 B** (era 424.995 — **−8.888 B**), teto **450.000 não relaxado**, folga
      **33.893**. Chunk do `en`: **9.585 B**, fora do `index.html` **e** fora do precache.
      Precache **878,47 KiB** (era 887,15 — **−8,68 KiB**). `packages/ui` e `packages/backend`
      intocados._
      _**Dívidas registradas, não consertadas:** o chunk do **editor** (**453.606 B**) também
      está no precache — pré-existente, maior que tudo isto junto, e misturá-lo aqui tornaria a
      medição desta fatia ilegível; fica para fatia própria. E o **terceiro** nível do
      `eagerResourcesCopy` continua compartilhado (com `deep: true` a cópia também vaza), hoje
      inalcançável porque ninguém chama assim._

### Bloco G — Registro de leitura

- [x] **30** — Domínio `ReadingLog` + UseCases `markRead` e `unmarkRead` (hard delete).
      → `tasks/30-usecase-reading-log.md`
      _**O BLOCO G COMEÇA PELO DOMÍNIO**, como o `CLAUDE.md` manda — sem persistência, sem
      rota, sem tela. Entregue: a entidade `ReadingLog` (seis campos), o port
      `ReadingLogRepository` **mínimo** (`save` · `byPlanItemAndUser` · `delete`), o fake com
      suíte própria, e os dois UseCases com TDD estrito. **415 shared** (intocado) **+ 195 ui**
      (intocado) **+ 1377 backend** (era 1307, **+70**) **+ 620 app** (intocado). Chunk de
      entrada **416.107 B**, inalterado — a fatia não atravessa a fronteira do PWA. Integração
      **não rodada**: não toca repositório nem rota (baseline 387)._
      _**A decisão que molda as Tarefas 31, 32 e 37: o log ancora no `planItemId`, não numa
      data de calendário.** "Li" quer dizer "li o trecho do dia X do plano". A alternativa
      (`bookId` + data) não sabe expressar o caso real — quem lê no domingo o capítulo de
      sexta marcaria o domingo, e o dia de sexta ficaria eternamente sem dono. Consequência
      desejada: `markRead` **não faz aritmética de data nenhuma**._
      _**⚠️ O ACHADO ALTO ERA DA SPEC, NÃO DA IMPLEMENTAÇÃO — e o orquestrador o mediu de
      novo por conta própria.** A decisão E da spec afirmava que ninguém alcança a leitura de
      outra pessoa porque a busca é por `(planItemId, actorUserId)`, logo o log alheio é
      *"inalcançável — estrutural, não um `if`"*. **Verdade da assinatura do port; FALSO do
      UseCase:** o `bookForActor` devolve um `Book` com `createdById` em escopo. O mutante do
      §7.5 (`byPlanItemAndUser(actor) ?? byPlanItemAndUser(book.createdById)`) passou em
      **1377/1377 — ZERO acusadores** —, com os três testes de autoria (`never lets Marcos…`,
      `never lets the OWNER…`, `ignores a logId smuggled…`) **todos verdes** enquanto o
      UseCase alcançava o log alheio. É a assinatura do envenenamento com fallback: ele se
      comporta normalmente sempre que o ator TEM log, que é a precondição dos três. Conserto:
      `byPlanItemAndUserCalls === 1` nos três — **0 → 4 acusadores**, medido pelo
      orquestrador. **A lição é sobre a spec:** escrever "estrutural" é afirmação forte e
      precisa da mesma medição que qualquer outra._
      _**⚠️ E os 6 acusadores que o executor tinha medido eram do FAKE.** Mutar
      `byPlanItemAndUser` no fake prova que o fake guarda o par; não prova que o UseCase o
      usa. §7.9 aplicado a esta fatia: a guarda estava no lugar fácil de escrever, não no
      lugar onde a propriedade é decidível._
      _**O mesmo mutante no `markRead` dava 1 acusador — por COINCIDÊNCIA DE FIXTURE.** No
      caminho feliz do `markRead` o ator não tem log, o `??` dispara e o contador anda; no do
      `unmarkRead` o ator tem log, o `??` curto-circuita e ninguém vê. Fechado com a asserção
      no caminho **idempotente**, que não depende da coincidência: **1 → 2**._
      _**A 5ª aparição do §7.8, e desta vez limpa nas duas metades.** Três mutantes de relógio:
      duas leituras → **1** acusador (o da contagem); leitura não contada via `Date.now()` →
      **1**; uma leitura contada com valor errado → **2** (contagem **e** igualdade). O
      esperado vem de constante (`clock.at(1)`, derivado de `CLOCK_BASE_ISO`), não do código
      sob teste. ⚠️ O `at(1)` e não o `at(0)` da spec: o contador incrementa **antes** de
      construir, então `at(0)` é o instante anterior a qualquer leitura._
      _**Os outros achados, todos com acusador novo:** a afirmação de que o `delete` do Prisma
      levanta **`P2025`** estava escrita como **fato em três arquivos** e **nunca foi medida
      contra o banco** — lição nº 17, cuja última aparição viajou por quatro arquivos antes de
      alguém medir; agora está num dono só, **rotulada como NÃO MEDIDA**, com a Tarefa 32
      encarregada de confirmar no teste de contrato (a metade `deleteMany` idempotente **tem**
      precedente medido em `prisma-reading-plan-item-repository.ts`). E três testes da decisão
      E sobreviviam a um UseCase **no-op** (16/20); com as correções o arquivo inteiro acusa
      (**20/20**)._
      _**O que sobreviveu à mutação, e é onde não se mexe:** a idempotência do `markRead` está
      provada como **propriedade** e não como implementação (o mutante que salva sempre e
      engole o `P2002` dá **3** acusadores via `saveCalls`); o fake é fiel nas duas direções do
      upsert por id (**2** e **6**), aterrado no `upsert({where:{id}})` que o
      `prisma-highlight-repository.ts` já usa; e os seis campos da entidade têm acusador de
      **runtime** — com o campo a mais **opcional** o `typecheck` fica verde, e quem guarda é
      o `Object.keys` sobre a linha montada._
      _**⚠️ O `CLAUDE.md` foi corrigido nesta fatia (decisão do dono).** A regra de datas
      apontava para um helper **`dayRange` em `backend/src/domain/` que nunca existiu**. A
      conta já tinha dois donos — `localDay` em `shared` (19 testes) e o `calendar-day-mapper`
      no repositório — e um *range* de instantes só faz falta para consultar coluna de
      instante por dia, o que nenhuma consulta do projeto faz. Regra que aponta para arquivo
      inexistente faz o próximo agente inventar um terceiro nome para a mesma conta._
      _**Dívidas registradas, não consertadas:** (a) o preâmbulo `planItems.byId` →
      `PlanItemNotFoundError` → `bookForActor` está agora **verbatim em três** lugares
      (`upsert-plan-note`, `mark-read`, `unmark-read`) e **já tem acusador próprio** (1, o
      mesmo teste nos três), então a extração de um `planItemForActor` é segura pela lição
      nº 15 — mas ela é da **Tarefa 32**, quando as rotas mostrarem se o retorno certo é o par
      `{ planItem, book }`. (b) O contador dos três testes de autoria prova **alcance**
      ("consultou por uma chave que não é o ator"), não exclusão: nenhum fixture tem o criador
      do livro com log no dia. (c) `grep -rn "dayRange" packages/backend/src` **não é mais
      vazio** — são 2 ocorrências de **prosa** dizendo "não há `dayRange`", zero em código;
      quem repetir a sonda na Tarefa 37 não deve concluir que o helper nasceu._
      _**Gates:** `test` · `typecheck` · `lint` · `prettier --check` · `build` limpos.
      `shared`, `ui`, `app` e `prisma/` **intocados** (`git status` vazio)._
- [x] **31** — A sobreposição de leitura, e o agrupamento ganha **um dono só**.
      → `tasks/31-sobreposicao-de-leitura.md`
      _**⚠️ A FATIA ERA MENOR DO QUE O BACKLOG DIZIA, e a medição foi a entrega.** Esta linha
      pedia `computeBookProgress` "por pessoa e do clube, **TDD pesado**". Medido **antes** de
      escrever a spec: (a) o agrupamento que ela precisa **já existia e já tinha 12 testes**
      (`groupWritersByPlanItem`, cobrindo plano vazio, duas pessoas no mesmo dia, autor
      repetido, `planItemId` fora do plano, plano fora de ordem e não-mutação); (b) o
      `ReadingLog` **já atravessava esse agrupamento sem uma linha de mudança** — confirmado
      com sonda de compilação (`tsc --noEmit` limpo, sonda apagada), porque `PlanItemWriter`
      é `{planItemId, userId}` e a tipagem estrutural aceita. É a situação da **Tarefa 26** do
      MVP 2. **415 shared · 195 ui · 1382 backend** (era 1377) **· 620 app**; chunk
      **416.107 B**, inalterado. Integração **não rodada** (não toca repositório nem rota)._
      _**O que a fatia de fato entregou:** o agrupamento virou **um** módulo neutro
      (`plan-item-groups.ts`), com os 12 testes se **mudando** para lá, e `writers`/`readers`
      viraram duas chamadoras de **uma linha**. É o `CONVENCOES-CODIGO` §7.1 executando a
      própria previsão: *"o padrão a copiar quando uma fidelidade aparecer no terceiro fake (o
      MVP 3 traz `ReadingLog` e `ActivityEvent`): **extrair, não cobrir duas vezes**"`._
      _**⚠️ O ATALHO FOI RECUSADO DE PROPÓSITO.** `groupWritersByPlanItem(plan, logs)`
      compilava hoje, sem tocar em nada. Recusado porque **o nome mentiria** — e a Tarefa 29a
      tinha acabado de pagar duas vezes por prosa-que-mente (`resources` com um locale só,
      `ensureCatalog` que só carregava inglês). Uma cópia pelo menos se vê; um `writers`
      devolvendo leitores, não._
      _**Fatia que MOVE código exige a pergunta da lição nº 19 — "o que perdeu o dono?" — e a
      resposta foi NADA, medida asserção por asserção.** `diff` normalizado HEAD↔hoje: 12
      nomes idênticos na mesma ordem, `expect(` de **13 → 15** (+2 pinos), **zero** asserção
      removida, **zero** operador trocado, **zero** afrouxada. E o lado writers, que encolheu
      de 12 testes para 2, acusa em **5 de 5** mutantes plantados no wrapper — inclusive as
      duas reimplementações inline sutis (sem `sort`: 3; sem filtro: 2) e a que devolve na
      ordem de chegada: 7._
      _**⚠️ O ACHADO QUE VEIO DO EXECUTOR, e ele desmentiu o argumento do orquestrador.** Eu
      mandei encolher o `readers` de 10 para 2 testes com o argumento "os dois wrappers têm de
      ser guardados pelo mesmo critério". Medindo o gêmeo de um mutante seu no outro lado, o
      executor achou que o `writers` estava com **um critério a menos**: o wrapper podia
      **ordenar o array de quem chamou** antes de delegar — não muda a saída, só corrompe o
      array alheio — e isso passava em **1381/1381, ZERO acusadores** (reconfirmado pelo
      orquestrador). Sem o teste que faltava, o corte do `readers` teria sido feito em nome de
      uma simetria **que não existia**. Agora são **2 e 2**, pelo mesmo critério: que a função
      com aquele nome delega, e que não mexe no array recebido (§7.6, snapshot). **0 → 1
      acusador**, medido dos dois lados._
      _**⚠️ A PUREZA TINHA ZERO ACUSADORES, e o `grep` do relatório não era guarda.** A regra
      14 da spec exige função pura, e o executor entregou um `grep` colado em vez de teste —
      decisão explícita e honestamente registrada. §7.9 decide: **requisito sem guarda
      automática é intenção**, e `grep` num relatório é medição de um instante. Medido pelo
      orquestrador: `const impureNow = new Date();` dentro do agrupamento → **1388/1388
      verdes**. Nasceu o `domain-is-pure.test.ts`, no molde do `no-browser-globals.test.ts`,
      varrendo `src/domain/` **inteiro** (**17** módulos, nenhum violando) contra `new Date(`,
      `Date.now(`, `Math.random(` e `process.env` — **com o antídoto do §7.4 medido, não só
      copiado**: com `sourceFiles` devolvendo `[]`, o teste falha em `expected 0 to be greater
      than 10`._
      _**O pino alfabético era MEIO-PINO.** O executor acrescentou aos 12 testes movidos a
      precondição que antes era só comentário (§7.2, a armadilha `marcos < maria` da Tarefa
      11) — mas `expect(ANA_ID < ZECA_ID)` afirma um fato sobre duas **constantes**, não sobre
      a ordem do fixture: **renomear** acusava, **reordenar as duas linhas** dava **0
      acusadores** e o mutante do `sort` voltava a passar. Trocado por asserção contra o
      próprio fixture, nos três arquivos; acusa nas duas direções agora._
      _**O desvio do executor foi MELHOR que a spec, e está medido.** A decisão C pedia tipo
      estrutural só no neutro; ele o levou também ao `groupReadersByPlanItem`, em vez de
      receber `ReadingLog`. Isso não amarra o port da Tarefa 32 **e** compra a guarda de
      travessia hoje: remover `userId` do `ReadingLog` quebra **16** linhas do `typecheck` do
      domínio; remover `planItemId`, **17**._
      _**Dois ponteiros que a fatia QUEBROU e consertou** (o preço da lição nº 19):
      `note-routes.integration.test.ts:1110` e `get-book-with-plan.test.ts:311` mandavam
      procurar testes num arquivo que deixou de tê-los. É a forma do §7.4 (*"o ponteiro é pelo
      NOME do teste"*) com o destino apagado._
      _**Dívida registrada, não consertada:** os 12 nomes movidos carregam vocabulário de nota
      (`has a writer`, `two authors`) numa função que não conhece nota, e o §7.9 diz que o
      nome do teste é parte da guarda. **Não renomeados de propósito**: fazê-lo na mesma fatia
      que os moveu destruiria a prova que mais importa aqui — o `diff` de 12 nomes idênticos.
      Fica para um commit que **só** renomeie, com o `diff` 12→12 provando que nenhum sumiu._
      _**Gates:** `test` · `typecheck` · `lint` · `prettier --check` · `build` limpos.
      `shared`, `ui`, `app` e `prisma/` **intocados**._
- [x] **32** — Repo Prisma + rotas do `ReadingLog`. ⚠️ **FATIA DIVIDIDA pelo orquestrador**:
      a tela é a **32b**, e a lacuna que esta fatia descobriu é a **32c**.
      → `tasks/32-prisma-rotas-reading-log.md`
      _**O "LI" SOBREVIVE AO RECARREGAR.** Entregue: `model ReadingLog` + migration
      (`20260910165956_reading_log`, gerada pelo Prisma), `find(filter)` no port **com a
      implementação Prisma na mesma unidade** (§6.9), o repositório com contrato,
      `PUT`/`DELETE /plan-items/:planItemId/reading-log`, e o `readers` na resposta do livro.
      **426 shared** (era 415) **· 195 ui** (intocado) **· 1399 backend** (era 1382) **· 620
      app** (intocado). **Integração 436** (era 387). Chunk **416.251 B** (+144), folga
      33.749. Banco conferido por consulta: `ReadingLog` em **0** linhas, zero fixture `t32`,
      super-admin do seed intacto com o mesmo `createdAt`._
      _**Por que dividida, com o número:** a fatia irmã do MVP 2 — a **24**, "Repo Prisma +
      rotas" do grifo — custou **4.324 inserções em 16 arquivos**, e a tela foi a **25**,
      separada. Juntar tela aqui faria uma fatia do tamanho de duas das maiores do MVP 2._
      _**Escopo cortado por medição:** **não** existe `GET /books/:bookId/readers`. O app
      **nunca chama** a `/books/:bookId/writers` equivalente — ele lê o `writers` do
      `GET /books/:bookId` (`book.tsx:289`). Aquela rota existe **sem cliente** desde a
      Tarefa 11; criar a gêmea repetiria um erro já pago._
      _**⚠️ O ACHADO ALTO: 500 no gesto central da fatia seguinte.** O `save` fazia upsert por
      `id`, então dois `PUT` concorrentes no mesmo dia geravam ids diferentes, os dois viravam
      INSERT, e o segundo violava o índice → `P2002`. Conferido elo por elo pelo orquestrador:
      `grep P2002` no `handle-domain-error.ts` devolve **nada** (não é erro de domínio, cai no
      handler genérico → **500**), e o `prisma-note-repository.ts:149` documenta, palavra por
      palavra, que é por isso que a nota mira o índice composto. O executor havia registrado a
      corrida com honestidade exemplar no docblock ("é o registrado, não o desejado"), mas
      **duas premissas dele caíram**: a janela não é "um toque duplo em milissegundos", é a
      **latência do round-trip** (200 ms–1 s em rede ruim) mais o retry da fila offline; e as
      regras 5 e 6 da spec **não o obrigavam** — a regra 5 é sobre o índice morder, e isso se
      prova melhor com um `create` cru. Consertado: upsert em `planItemId_userId`, com os dois
      lados medidos._
      _**⚠️ E o conserto obrigou uma correção que ninguém pediu — a 7ª aparição do §7.1.** Com
      o Prisma passando a fazer upsert no par, o **fake** que lançava ficou **mais restritivo
      que o banco** — a direção que o §7.1 diz esconder melhor, porque a suíte fica verde. O
      executor viu e corrigiu no mesmo commit, em vez de plantar o bug que o próprio arquivo
      existe para avisar._
      _**⚠️ DÍVIDA ALHEIA DESCOBERTA, medida pelo orquestrador e NÃO consertada:** o
      `NoteRepositoryFake.save` **lança** no par duplicado (`assertUniquePlanItemAndUser`)
      enquanto o `PrismaNoteRepository.save` faz **upsert no índice composto** — a **mesma**
      divergência, viva desde a Tarefa 11. Medido: **exatamente um** teste a pina
      (`refuses a second note of the same author on the same plan item`), e ele codifica um
      comportamento que o repositório real não tem. Fica para quem reabrir o fake da nota._
      _**O outro ALTO, e a decisão do orquestrador: `readers` é `.optional()` — FASE 1 de
      propósito.** Obrigatório derruba **164 testes em 7 arquivos** do app (que a spec proibia
      tocar) e `.default([])` **não compila** contra o `RequestOptions.schema`. Medido pelo
      orquestrador: **não há factory compartilhado no app**, os 7 arquivos montam a resposta à
      mão — fechar agora seria churn nos mesmos arquivos que a 32b abre. **O preço está
      medido e escrito:** o handler que **esquece** o `readers` compila e passa em
      **1399/1399** unitários (mutação do orquestrador em `book-routes.ts`); os únicos
      acusadores são **4, todos em integração, num `describe` só**. **A fase 2 é regra dura da
      primeira unidade da 32b** — dívida com prazo é decisão._
      _**A afirmação do `P2025` foi MEDIDA e o rótulo trocado pelo fato:** `delete` levanta
      `P2025`, `deleteMany` devolve `{count: 0}`. E virou **teste permanente** — sem ele,
      "escolhemos `deleteMany`" e "`delete` também serviria" dariam o mesmo resultado
      observável, e a prescrição seria superstição._
      _**Outros achados corrigidos:** uma **asserção vazia** (`asks the database for every
      row, with no LIMIT` rodava `EXPLAIN` sobre uma consulta escrita **à mão no teste**, não
      sobre a que o repositório emite — um `take: 500` a deixaria verde; trocada por captura
      do SQL realmente emitido, e de brinde descobriu-se que o Prisma acrescenta `ORDER BY id`
      junto do `take`, dando um segundo acusador); **4 dos 5 testes de 404 sem precondição do
      próprio verbo** (o falso verde do Fastify — medido: com a rota desregistrada, o bloco
      isolado ficava todo verde; agora 4 e 5 acusam); e prosa falsa num teste cujo `ghostDay`
      **tinha** sido marcado._
      _**A recusa do `FIND_ROW_LIMIT` ficou, e agora com o número:** ~30 dias × 2–10 membros =
      **60 a 300** linhas; patológico ~3.000 ≈ **1,2 MB** contra os **3,4 MB** que o
      `take: 500` da nota permite (a linha de log é ~17× mais barata: sem o `doc`). E um
      `take` aqui seria **a falha**, não a válvula — a sobreposição perderia leitores em
      silêncio._
      _**Decisão registrada (o orquestrador pediu, o executor mediu): NÃO extrair o
      `planItemForActor`.** O preâmbulo está verbatim em três UseCases, mas o retorno útil é
      **assimétrico** — o `markRead` usa o livro, o `unmarkRead` o **descarta** (só quer o
      efeito do guard), o `upsertPlanNote` usa o `planItem.title`. Um par `{ planItem, book }`
      não é o retorno certo em um dos três. Fica para o quarto chamador._
      _**Dívidas registradas:** a **32c** (abaixo); e **não há checagem de drift**
      `schema.prisma` × migrations no repositório — se alguém tirar o `@@unique` do schema sem
      gerar migration, os dois guardas do índice ficam verdes e o estrago aparece na próxima
      `migrate dev` de outra pessoa. É do repositório inteiro, não desta tabela._
      _**Gates:** os cinco limpos, verificados pelo orquestrador. `ui` e `app` intocados._

- [ ] **32b** — A marca de leitura na tela do livro. ⚠️ **FATIA INSERIDA**, e a **primeira
      unidade dela encerra a fase 2 do `readers`** (tirar o `.optional()`), antes da tela.
      → _a detalhar_

- [ ] **32c** — `replacePlanItems` recusa remover dia que já tem LEITURA. ⚠️ **FATIA
      INSERIDA**, com o motivo medido na 32. → _a detalhar_
      _**A lacuna, medida e pinada em teste na Tarefa 32:** a guarda de domínio do
      `replacePlanItems` consulta **só `Note`** (`planItemIdsWithAnyNote`), então um dia do
      plano que tem **só leitura** passa por ela e estoura na **FK** — vira **500** em vez do
      **400** com mensagem. O dado **fica a salvo** (`replaceForBook` roda em `$transaction`).
      É **caso de terça-feira**, não raro: o admin edita o plano do livro do mês e basta uma
      pessoa ter marcado "li" sem escrever nota — e pior, a guarda de nota **funciona**, então
      o admin aprende que o sistema recusa com mensagem clara e é surpreendido por um 500 mudo
      no caso irmão. **Foi a Tarefa 32 que introduziu este caminho.** O conserto cabe no port
      como está (`logs.find({bookId})` intersectado com `removeIds`), mas cresce o construtor
      do `ReplacePlanItems` para cinco dependências e mexe em `book-routes.ts` e em toda
      instanciação do teste dele — unidade com auditoria própria._

### Bloco H — Atividade

- [ ] **33** — Domínio `ActivityEvent` + UseCase `recordActivity` + gatilho nos UseCases de
      nota, grifo e leitura. → _a detalhar_
- [ ] **34** — UseCase `listActivity(clubId)` + repo + rota. → _a detalhar_
- [ ] **35** — Feed de atividade na home. → _a detalhar_

### Bloco I — Push

- [ ] **36** — `Settings` de notificação (backend + tela) + `PushSubscription` (port, fake,
      repo, rotas de config/subscribe/unsubscribe). → _a detalhar_
- [ ] **37** — `dispatchDueNotifications` (`READING_REMINDER`, janela, fuso, supressão de
      quem já leu, idempotência) — **TDD pesado** + script de cron. → _a detalhar_
- [ ] **38** — `GROUP_ACTIVITY` imediato a partir do `ActivityEvent` + service worker
      (`push-handler.js`) + tela de ativar notificações. → _a detalhar_

## Definição de "MVP 3 pronto"

Eu marco que li o trecho de hoje e vejo onde eu e o clube estamos no livro. Recebo um
lembrete no horário que eu escolhi — e não recebo se eu já li. E quando ela lê, escreve ou
grifa, meu celular avisa e a atividade aparece no feed da home.

---

# MVP 4 — Administração

## Decisões fechadas do MVP 4

- Duas áreas distintas: **super-admin** (plataforma) e **gerência do clube** (papel
  `OWNER`/`ADMIN`). Layout desktop.
- Super-admin **não** edita conteúdo de ninguém — só clube, pessoa e senha.
- Remover alguém do clube **arquiva o `Membership`**; o que a pessoa escreveu permanece.

### Bloco J — Administração

- [ ] **39** — UseCases de super-admin: `createUser` · `resetPassword` · `archiveClub` +
      guard `isSuperAdmin`. → _a detalhar_
- [ ] **40** — UseCases de gerência do clube: `changeMemberRole` · `removeMember` ·
      `revokeInvite` · `listMembers` · `listInvites`. → _a detalhar_
- [ ] **41** — Repos + rotas `/admin/*` e `/clubs/:clubId/members`. → _a detalhar_
- [ ] **42** — Tela super-admin: clubes e pessoas. → _a detalhar_
- [ ] **43** — Tela de gerência do clube: membros, papéis, convites ativos. → _a detalhar_
- [ ] **44** — Editar plano de leitura em lote (colar uma lista `data · tema · referência`).
      → _a detalhar_
- [ ] **45** — Arquivar livro e clube pela interface. → _a detalhar_
- [ ] **46** — Tela de preferências completa (fuso, locale, horário do lembrete, tema).
      → _a detalhar_

## Definição de "MVP 4 pronto"

Eu administro o sistema sem abrir o banco: crio clube e pessoa, reseto senha, mudo papel,
revogo convite, edito o plano de leitura colando uma lista, e arquivo o que acabou.
