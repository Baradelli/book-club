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
      para grifo** em lugar nenhum: o `readingOf` devolve `null` para `HIGHLIGHT`, o capítulo
      de um grifo mora na `reference`, e há teste que **pina** que a busca não a toca. A segunda
      é lacuna de produto que **ninguém tinha nomeado** até a auditoria da última fatia._
      _⚠️ **DUAS CORREÇÕES DE 2026-09-18, e as duas são da regra 11.** (a) A função **nunca se
      chamou `readingKeyOf`** — é `readingOf`, em `acervo-entries.ts`; o nome errado foi escrito
      aqui e copiado para a "Definição de MVP 2 pronto", e sobreviveu a dez fatias porque
      ninguém procurou. É a lição do `dayRange` que o `CLAUDE.md` registra: um nome que não
      existe faz o próximo leitor procurar, não achar, e inventar um terceiro. (b) A frase
      *"devolve `null` para `HIGHLIGHT`"* **deixou de ser verdade na Tarefa 38i** — ela fica
      como estava porque este parágrafo é o registro do que a auditoria da 29 mediu **naquele
      dia**, e o que mudou está escrito onde a lacuna foi nomeada._
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
2. ~~**"por capítulo" não existe para GRIFO em lugar nenhum.** O filtro por leitura alcança só a
   anotação do dia: o `readingOf` devolve `null` para `HIGHLIGHT`, porque o ADR 0004 decidiu
   (bem) que o grifo não depende de um dia do plano. O capítulo de um grifo mora na
   `reference` ("Cap. 12"), e **nem o filtro nem a busca a tocam** — há teste de contrato que
   **pina** que a busca não a casa. "Os grifos do capítulo 3" não tem como ser pedido.
   É lacuna de produto que **ninguém havia nomeado** em nove fatias.~~

   ✅ **ENTREGUE (2026-09-18), por TRÊS fatias, e a lacuna que este parágrafo nomeou é o que as
   gerou.** O dono leu isto no fechamento do MVP 2 e respondeu a pergunta 4 com **(c) e (d)**:

   - **38h** — a **faixa de página** (`p. 40–60`), que é o eixo que o grifo sempre teve;
   - **38i** — o **dia do plano no grifo** (`Highlight.planItemId?`, emenda ao ADR 0004): o
     grifo nasce ancorado no trecho que o clube está lendo, e o filtro por leitura do acervo
     passou a alcançá-lo (decisão G). *"Os grifos do capítulo 3"* **é pedível**;
   - **38g** — de quebra, o campo de texto que fechou o item 1 acima.

   ⚠️ **O que deste parágrafo CONTINUA verdade, e por isso ele fica riscado e não apagado:**
   a `reference` do grifo ("Cap. 12") **continua sem filtro e sem busca** — o teste de contrato
   que pina isso segue lá. O que mudou é que o capítulo deixou de depender dela: quem responde
   *"de que trecho é este grifo"* agora é o **dia do plano**, que tem título próprio e não é
   texto livre digitado à mão. ⚠️ **E o grifo ANTERIOR à migration continua com `planItemId`
   nulo** — a coluna é aditiva e não retroage; derivar o dia daqueles a partir do `createdAt` é
   exatamente a saída que a 38i recusou.

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

- [x] **32b** — A marca de leitura na tela do livro. ⚠️ **FATIA INSERIDA**, a metade de tela
      da 32. → `tasks/32b-marca-de-leitura-na-tela.md`
      _**PROGRESSO VIRA GESTO, E SEM UM NÚMERO NA TELA.** Entregue: a marca de quem leu em
      cada dia do plano, ao lado dos avatares de quem escreveu, e o toque "li hoje" em
      primeira pessoa. **428 shared** (era 426) **· 195 ui** (intocado) **· 1399 backend**
      (intocado) **· 641 app** (era 620). Integração **436**, inalterada. Chunk
      **418.320 B** (era 416.251, **+2.069**), folga **31.680**. Banco limpo, super-admin
      intacto._
      _**⚠️ A PRIMEIRA UNIDADE NÃO FOI A TELA — foi encerrar a fase 2 do `readers`**, e isso
      trocou a guarda por uma melhor. Com `.optional()`, o handler que **esquecia** o campo
      compilava e passava em **1399/1399** unitários (medido na 32). Com o campo obrigatório,
      o acusador passa a ser **o compilador** (`TS2345` em `book-routes.ts`) — que é um dos
      cinco gates e roda em toda fatia. A asserção que existia **de propósito** para ficar
      vermelha na fase 2 foi **trocada**, não apagada: `still accepts a response without
      readers, which is the phase-1 shape` → `refuses a response without readers, now that
      the phase-in is done`._
      _**A tela executa a decisão do dono** (`ACEITE-MVP.md`, MVP 3, pergunta 1): presença,
      não placar. Uma marca por leitor, nada quando ninguém leu, **nenhum número e nenhum
      "+N" de estouro** — e o toque só existe quando há dia de hoje no plano, porque um botão
      desabilitado seria cobrança silenciosa._
      _**⚠️ O ACHADO ALTO FOI DE DOCUMENTAÇÃO, e reabria um problema que o projeto já tinha
      fechado.** O executor mediu o `book.tsx` com um contador próprio (o canônico **com um
      passo a mais**: remove `{/*…*/}` antes dos blocos `/*…*/`), obteve 243, viu o docblock
      dizendo 247 e **escreveu no código que o canônico divergia**. Medido pelo orquestrador:
      o canônico dá **247** no HEAD — quem diverge é o contador novo. O repositório passou a
      ter **dois números para o mesmo arquivo no mesmo commit**, que é a repetição literal do
      que a auditoria da Tarefa 25 encontrou (**491, 483, 426** para o mesmo `book.tsx`) e a
      razão de o contador ter virado **um comando único**. Pior que o número errado era a
      prosa: ela **invertia quem diverge**, ensinando o próximo leitor a desconfiar do
      instrumento certo. Corrigido, e o executor achou **mais dois** números velhos na própria
      tabela que **define** o contador (`acervo.tsx` 514→**511**, `acervo-entries.ts`
      113→**120**). Os sete números da tabela foram reconferidos pelo orquestrador, um a um._
      _**⚠️ UM BURACO PRÉ-EXISTENTE NA GUARDA DO ADR 0002, medido e fechado.** A varredura de
      **fonte** do `app` usava `code.normalize('NFD')` — que **decompõe** o acento e **não o
      remove**. Verificado aritmeticamente pelo orquestrador: `'Só você vê'` em NFD **não**
      contém `'so voc'`. Cinco dos quinze termos (`so voc`, `somente voc`, `apenas voc`,
      `visivel para`, `visivel so`) eram **inalcançáveis** — e em português ninguém escreve
      esses sem acento. A mesma frase em ASCII acusava; acentuada dava **0 em 24**. Conserto
      de **uma palavra** (`withoutDiacritics`, helper que já existia), medido **0 → 1** pelo
      orquestrador, mais um **par de falsificação do matcher**, sem o qual voltar ao `NFD`
      deixaria os quinze `it.each` verdes. ⚠️ **`packages/ui` foi medido e NÃO tem o buraco** —
      ele paga com a lista dobrada (`'só voc'` **e** `'so voc'`), não com normalização._
      _**Dois achados sobre onde a guarda mora:** (1) a regra 13 (toque duplo não manda dois
      `PUT`) estava guardada **inteira pelo `Button` de `packages/ui`** — pacote que a fatia
      não pode tocar. Nasceu um `useRef` de "em voo" na própria tela; medido com honestidade:
      com o `Button` intacto os dois mecanismos se sobrepõem e remover só o `ref` dá **0**
      acusadores — o que o `ref` compra é a propriedade **deixar de depender** de um contrato
      alheio. (2) ⚠️ **A asserção de zero `aria-pressed` era o teste mandando no produto**
      (lição nº 4 do MVP 1): o corpo proibia o atributo **em qualquer lugar do documento**,
      num teste cujo nome promete "nenhuma aba sobrevivente". Consertada **a asserção, não o
      produto** — a escolha de trocar o rótulo em vez de usar `aria-pressed` está certa (usar
      os dois faz o leitor anunciar o estado duas vezes), e agora ela ainda pega uma aba de
      verdade (**1** acusador) sem vetar o atributo no botão de leitura (**0**)._
      _**A medição do executor foi corrigida pelo revisor num ponto:** os "2 acusadores" da
      regra 13 eram **sujos** — tirar `loading={busy}` tirava junto o `aria-busy`, então o
      segundo media o **spinner**, não a corrida. Com o mutante limpo é **1**._
      _**O executor achou um "zero acusadores" sozinho:** plantou "Ninguém leu este dia" no
      ramo de lista vazia e mediu **0 em 45** — nenhum fixture alcançava aquele ramo, porque o
      dia que o alcança é o que tem **escrita e não tem leitura**, caso que ninguém montara.
      Escreveu o teste: **0 → 1**. E fechou um ramo sem dono que a fatia tornou relevante
      (`me === null`, o `/me` que ainda não chegou decidindo o estado inicial do botão): o
      `BookSetup.me` do harness estava declarado e **morto** desde antes; agora tem uso e
      **1** acusador._
      _**Dividiu ANTES de crescer** (lição nº 8): nasceu `reading-marks.tsx` (**105**), e o
      `book.tsx` foi de **247 → 277**, com o teto da spec em ~350. E a varredura de cor foi
      **estendida ao arquivo novo** — uma guarda que ficasse só no `book.tsx` perderia
      justamente o arquivo que contém o caminho de erro. As varreduras de **desenho** e de
      **ícone** absorveram o arquivo novo **de graça** (são recursivas sobre `src`): 1
      acusador cada, a lição nº 12 coberta sem manutenção._
      _**Novo caminho no cliente HTTP:** o `DELETE` responde **204 sem corpo**, e o app nunca
      fizera isso (o único `api.delete` de hoje recebe a linha de volta). `grep 204` no teste
      do cliente dava **zero**. O teste nasceu no **`shared`**, onde a propriedade é decidível
      (§7.10), com os **dois** lados do par: corpo vazio passa quando o schema aceita, e um
      atalho que pulasse o `safeParse` no 204 é acusado pelo par negativo._
      _**Dívida registrada:** o módulo `reading-marks` tem **dois** assuntos (a marca, que é
      informação, e o toque, que é escrita com estado e duas chamadas HTTP) — o nome só cobre
      o primeiro, e é o segundo que vai crescer (desfazer, fila offline, `ActivityEvent`).
      Registrado no docblock, com o aviso de que é ele que sai quando crescer._
      _**A densidade de i18n caiu pela metade e o número velho circulava:** depois da 29a uma
      chave nova custa **~43 B** (só o lado `pt`), não ~86 — o `en` não está mais no chunk de
      entrada._
      _**Gates:** os cinco limpos, verificados pelo orquestrador, e a guarda da 29a ainda de
      pé (`grep 'assets/en-' dist/sw.js` = **0**). `backend` e `ui` intocados._
      _**Pergunta do dono registrada:** marcar leitura de um **dia que já passou** — ver
      `ACEITE-MVP.md`, MVP 3, pergunta 2._

- [x] **32c** — `replacePlanItems` recusa remover dia que já tem LEITURA: **400 com mensagem,
      não 500 mudo**. ⚠️ **FATIA INSERIDA**, com o motivo medido na 32.
      → `tasks/32c-guarda-de-leitura-no-plano.md`
      _**O ADMIN VOLTA A SER RECUSADO COM EDUCAÇÃO.** Entregue:
      `planItemIdsWithAnyReadingLog` no port (com a implementação Prisma **na mesma unidade**,
      §6.9), a segunda guarda no `replacePlanItems`, e três mensagens que não mentem.
      **428 shared · 195 ui · 1417 backend** (era 1399) **· 641 app**. Integração **442** (era
      436). Chunk **418.320 B**, byte a byte idêntico. Banco limpo, super-admin intacto,
      **zero** fixture sobrevivente em 10 tabelas._
      _**A lacuna, que a Tarefa 32 mediu e ESTA fatia fecha:** a guarda de domínio consultava
      **só `Note`**, então um dia do plano com **só leitura** passava por ela e batia na FK
      `ON DELETE RESTRICT` — erro de banco, **500**, sem mensagem. O dado sempre ficou a salvo
      (`replaceForBook` roda em `$transaction`). O pior detalhe era de produto: a guarda de
      nota **funciona** e dá mensagem clara, então o admin aprendia que o sistema recusa
      educadamente e era surpreendido por um 500 mudo no caso irmão._
      _**As três mensagens, como o cliente as recebe** (`error.message` só sai na classe 400,
      §6.2 — é a única string desta fatia que alguém lê):_
      ```
      só nota    → cannot remove 1 reading plan day(s) that already have notes
      só leitura → cannot remove 1 reading plan day(s) that somebody already read
      os dois    → a de nota (decisão D: a guarda antiga continua primeiro)
      ```
      _Nenhuma cita autor, id de dia, id de log ou título — **só a contagem**, a mesma decisão
      que o docblock da guarda de nota já registrava._
      _**⚠️ O EXECUTOR DISCORDOU DA SPEC E ESTAVA CERTO — pela terceira vez neste MVP, e pela
      mesma razão.** A regra 2 mandava provar `[] → []` "sem ida ao banco" **por contagem no
      fake**. Ele recusou com o §7.10: no fake **não existe banco**, então um contador ali
      conta a chamada ao próprio método, não a ida ao banco. Medido pelo revisor **e** pelo
      orquestrador: removendo a saída antecipada do fake, a suíte dá **1420/1420 — zero
      acusadores**, porque `resolves.toEqual([])` **não separa** as duas implementações (nem no
      fake nem no Prisma, onde `in: []` devolve `[]`). A prova mudou para o contrato, com
      `$on('query')` — o instrumento que já existia no mesmo arquivo. **A spec pedia a prova
      no lugar onde ela não vale**, e o próprio parágrafo seguinte da spec avisava disso._
      _**E ele acrescentou um teste que a spec deixou opcional, com o argumento medido:** a
      fiação de `book-routes.ts` (a quinta dependência) não é decidível nem no unitário (que
      usa fake) nem no contrato (que não conhece o UseCase). O precedente está em docblock
      desde a Tarefa 11: trocar `repos.notes` por um duplo devolvendo `[]` **sobrevivia a 1202
      testes**, com 500 como consequência real._
      _**A linha de maior rendimento da fatia foi UMA, num helper que já existia:** a asserção
      de contador que ele acrescentou ao `expectNothingTouched()` cobre **13 estados de erro**
      sem escrever 13 testes — o mutante que lê o log antes do corte de tenant dá **17**
      acusadores, e **16** deles são asserções de contagem._
      _**⚠️ E isso revelou três testes que cobriam duas vezes.** Os três `never reads a reading
      log for…` que ele escrevera assertavam o que o helper já assertava nos mesmos cenários.
      O revisor procurou e **não achou** mutante que os três matassem e os 13 deixassem viver.
      Apagados — **com trava**: o orquestrador exigiu que a contagem do mutante de tenant fosse
      remedida depois e **não caísse abaixo de 14**, sob pena de a decisão estar errada.
      Medido pelo orquestrador: **17 → 14**, exatamente o piso, com os **mesmos 42 passed** —
      a prova de que os três só acusavam o que o helper já acusava. (A trava existia porque a
      Tarefa 32b ensinou a desconfiar: lá o orquestrador quase cortou testes em nome de uma
      simetria que não existia.)_
      _**A troca do teste da Tarefa 32 preservou as duas metades.** O antigo
      (`lets a day with only a reading log through the note guard, and then the FK refuses it`)
      documentava o **defeito**, e continuaria passando depois do conserto — porque quem
      deixava passar era o **repositório**, e quem passa a recusar é o **UseCase**. O
      substituto (`is the net under the domain guard…`) mantém as 3 asserções do antigo e
      acrescenta 1. Comparado asserção por asserção pelo revisor._
      _**Um risco de INTERMITÊNCIA achado e consertado antes de existir:** o teste da regra 2
      lia o contador de queries **dentro** do `try`, logo após o `await` — mas os eventos de
      `$on('query')` do Prisma não têm entrega garantida antes de a promessa resolver, e o
      precedente no mesmo arquivo lê **depois** do `$disconnect()`. Passava, mas teste de
      integração intermitente é veneno: ele ensina a suíte a ser ignorada. Reescrito com um
      cliente por lado, e o docblock diz que a ordem é **por causa da entrega do evento**,
      não por estilo._
      _**⚠️ DUAS CORREÇÕES DE REGISTRO, e as duas eram do revisor e do orquestrador, não do
      executor.** (1) O revisor reportou que **o gate de lint é vácuo** (`pnpm -r lint` diz
      *"None of the selected packages has a 'lint' script"*), o que tornaria falsa a caixinha
      de lint de **todas** as fatias do MVP. **Medido pelo orquestrador: o gate é `pnpm lint`
      (raiz, `eslint .`) — outro comando, que roda** — e, porque verde não é guarda, foi
      plantado um `const naoUsada` e o eslint acusou (`@typescript-eslint/no-unused-vars`).
      Nenhuma caixinha era falsa. (2) O revisor "corrigiu" a contagem de linhas de 703→900
      para 954→1274; **não é correção, são instrumentos diferentes** — o executor usou o
      contador **canônico** (descarta comentário e linha em branco) e o revisor usou `wc -l`.
      Justo a fatia anterior teve um ALTO por confundir isso._
      _**Outros dois BAIXOS corrigidos:** o ponteiro no docblock do fake passou a dizer **onde**
      a propriedade é provada, **pelo NOME do teste e nunca pela linha** (§7.4); e uma asserção
      de contagem que usava `toContain('2')` — e portanto passaria para "12", "20" e "21" —
      virou comparação da frase inteira, que de brinde deu um segundo acusador à mensagem
      publicada (**1 → 3**)._
      _**Gates:** os cinco limpos, verificados pelo orquestrador. `app`, `ui`, `shared` e
      `prisma/` intocados; nenhuma migration (a FK e o índice já existiam desde a 32)._
      _**Nota operacional para o dono:** o Docker estava **desligado** quando a fatia começou;
      o executor subiu o Docker Desktop para rodar a integração e **deixou rodando**._

### Bloco H — Atividade

- [x] **33** — Domínio `ActivityEvent` + UseCase `recordActivity` + gatilho nos UseCases de
      nota, grifo e leitura. → `tasks/33-dominio-activity-event.md`
      _**O BLOCO H ABRE, E A FATIA É A PRIMEIRA QUE MEXE POR DENTRO DE CÓDIGO JÁ AUDITADO.**
      Entregue: `ACTIVITY_TYPES` num arquivo só em `shared` (molde do `HIGHLIGHT_COLORS`), a
      entidade, o port com fake, o `recordActivity`, e o gatilho nos **quatro** UseCases de
      nascimento. **454 shared** (era 428) **· 195 ui** (intocado) **· 1496 backend** (era
      1417) **· 641 app** (intocado). Integração **442**, medida nesta fatia. Chunk
      **418.320 B — +0 B** (o `activity.ts` é exportado mas nenhum código do app o importa; o
      tree-shaking o descarta)._
      _**⚠️ UMA MEDIÇÃO DECIDIU O DESENHO INTEIRO: o `upsertPlanNote` é chamado pelo
      AUTOSAVE, a cada 1500 ms** (`day-note.tsx:118`). Sem a condição `created === true`, meia
      hora escrevendo produziria **dezenas** de eventos e o feed afogaria o clube — o oposto de
      "um incentiva o outro", que é a razão de o feed existir. A saída saiu de graça: os dois
      UseCases idempotentes **já devolviam `created`**. Medido: **3 autosaves → 1 evento**, com
      2 acusadores no mutante que registra no ramo `existing`._
      _**A regra mais importante não era sobre o evento, era sobre o que acontece quando ele
      falha.** O que a pessoa escreveu é o produto; o feed é o acessório. Se o
      `recordActivity` lançar, a nota tem de estar salva e a resposta tem de ser 201 — **mas
      engolir em silêncio também é errado**. Provado nas **duas** metades: `try/catch` removido
      → **6** acusadores; `catch {}` vazio → **5** (os quatro UseCases + a forma do log). A
      decisão C não é prosa._
      _**⚠️ O EXECUTOR ACHOU UM BURACO REAL NA SPEC — ela era autocontraditória.** A spec
      mandava tocar as rotas para instanciar os UseCases **e** proibia `src/repositories/**` e
      migration: a rota precisa de algo que satisfaça o port, e a implementação real é a
      Tarefa 34. Ele listou três saídas e escolheu a melhor: um
      `PendingActivityEventRepository` em `http/` que **lança de propósito**, para cada
      nascimento deixar uma linha de log até a 34 — em vez de um `save` que devolve sucesso e
      joga o evento fora, *"que é a versão que ninguém descobre"*. A 34 troca **uma linha** e
      apaga um arquivo; nenhum UseCase nem rota é reaberto._
      _**⚠️ E A PREMISSA DE UMA REGRA MINHA CAIU JUNTO — o achado ALTO.** A regra 20 dizia
      *"integração não roda, a fatia não toca repositório nem rota"*. Deixou de ser verdade no
      instante em que o desenho mudou: a fatia passou a tocar quatro arquivos de `http/` e
      `routes/`, e existem três suítes de integração cobrindo exatamente essas rotas. **Ninguém
      havia medido** se `POST` de nota, grifo e "li" ainda devolve 201 com um repositório que
      **lança** dentro do grafo de injeção. Medido depois: **150 testes das três suítes verdes,
      442 na íntegra**, o log disparou **85 vezes** (uma por nascimento) e **zero conteúdo
      vazou** (`grep -c "quote:|plainText:|title:"` = **0** em 85 linhas) — a regra do
      `NOTIFICACOES.md` §1 vale no caminho real, não só no unitário. **Premissa de spec que cai
      junto com uma decisão de desenho não se corrige sozinha.**_
      _**⚠️ O §7.4 in fine cobrou: "reabriu um arquivo? olhe o teste do lado".** A fatia
      acrescentou uma **segunda** leitura de relógio aos quatro UseCases. Dois ganharam o
      contador nesta fatia; os outros dois **nunca tiveram**. Medido pelo revisor e
      **reconfirmado pelo orquestrador**: o mutante nominal do §7.8 — um `new Date()` por campo
      — passava em **1490/1490, zero acusadores**, nos dois. Depois: **0 → 2**._
      _**Uma guarda melhor do que a promessa do orquestrador.** O repositório temporário estava
      impecavelmente documentado, mas `grep` achava três ocorrências e **zero guardas** — nada
      falharia se a Tarefa 34 esquecesse de apagá-lo (§7.9: requisito sem guarda automática é
      intenção). O orquestrador ia resolver com uma regra dura na spec da 34; o revisor
      sugeriu melhor, e nasceu um teste **auto-desarmável**: ele lê o `schema.prisma` e exige
      que `repositories.ts` mencione o repositório temporário **enquanto o modelo não existir**
      — e que **não** o mencione a partir do instante em que existir. Passa hoje (4 testes);
      falharia com o modelo, provado por sonda no predicado. **Promessa não é guarda.** E o
      predicado é o `schema.prisma`, não o `Prisma.dmmf`, porque um cliente sem `generate`
      deixaria a guarda dormindo justo na janela em que ela precisa acordar._
      _**O executor registrou um MUTANTE DEGENERADO por conta própria**, aplicando a regra a si
      mesmo: o primeiro mutante de relógio dele (`new Date(new Date().getTime())`) passou em
      **1490/1490** porque o relógio de teste só conta leituras **sem argumento** — a chamada
      interna conta 1, a externa passa intacta. Semanticamente equivalente, não um buraco.
      Descartado e trocado por um genuíno (`new Date(Date.now())`), que deu **3** acusadores._
      _**Quatro gatilhos, e os cinco excluídos têm motivo, não economia:** editar, arquivar e
      desmarcar não são notícia — e `unmarkRead` é o caso mais claro, porque registrar "a Maria
      desmarcou" é o vocabulário de cobrança que o §1 do plano proíbe. O `NOTIFICACOES.md` §1
      usa verbos de **nascimento** ("lê, escreve, registra")._
      _**Outros achados corrigidos:** o log prometia dizer **"quem"** e não tinha `userId` (a
      prosa prometia o que o código não pagava, e quem fosse diagnosticar não saberia de quem
      era o evento) — corrigido, e a asserção de "sem conteúdo" virou **lista fechada de
      chaves**, porque `toMatchObject` é subconjunto e ficaria verde com um `quote` a mais.
      Três docblocks citavam o **ADR errado** (a regra "o push nunca leva o conteúdo" está no
      `NOTIFICACOES.md` §1, não no ADR 0006) — lição nº 17 na forma de ponteiro. E o docblock
      do domínio afirmava um **500 que não acontece**, porque os quatro chamadores reais passam
      pelo `recordActivitySafely`._
      _**O orquestrador RECUSOU duas sugestões do revisor**, pelo mesmo critério: ele apontou 8
      testes de "poder de morte quase nulo", mas escreveu que foi *"avaliação, não medição"* —
      e cortar teste sem medição já foi recusado duas vezes neste MVP (na 32b isso evitou um
      erro real). Ficam._
      _**Decisão registrada, medida, NÃO virada escopo:** reescrever uma nota **arquivada** a
      ressuscita (`status: 'ACTIVE'`, `archivedAt: null`) devolvendo `created: false`, logo
      **não registra** evento. Fica como está, pela razão que o revisor deu e que convence: a
      condição honesta **não é** `created`, é *"estava `ARCHIVED` e voltou a `ACTIVE`"* — regra
      nova com nome próprio, não ajuste de `if`. E a ressurreição é, do ponto de vista do
      gatilho, **indistinguível** de um autosave._
      _**Gates:** os cinco limpos, verificados pelo orquestrador. `app`, `ui` e `prisma/`
      intocados; nenhuma migration; nenhuma dependência nova._
- [x] **34** — UseCase `listActivity(clubId)` + repo + rota. → `tasks/34-listar-atividade.md`
      _**O FEED TEM DE ONDE VIR, E A DÍVIDA DATADA FOI PAGA.** Entregue: `model ActivityEvent`
      + migration, `find(filter)` no port **com a implementação Prisma na mesma unidade**
      (§6.9), o repositório com contrato, `listActivity`, os schemas em `shared` e
      `GET /clubs/:clubId/activity`. **478 shared** (era 454) **· 195 ui** (intocado) **· 1520
      backend** (era 1496) **· 641 app** (intocado). Integração **484** (era 442). Chunk
      **418.565 B** (+245), folga 31.435._
      _**⚠️ A GUARDA AUTO-DESARMÁVEL DA 33 FUNCIONOU COMO PROJETADA.** Ela lia o
      `schema.prisma` e ficou **vermelha** no instante em que o `model ActivityEvent` foi
      declarado — obrigando esta fatia a apagar o `PendingActivityEventRepository`. `grep`
      volta vazio. **Apagar a guarda junto é correto e foi exigido com justificativa:** as 4
      asserções dela eram todas sobre o **estado de transição**, e a preocupação viva ("falhar
      registrando não derruba a escrita") nunca morou lá — mora no `record-activity.test.ts`,
      intocada. O substituto (`the four births reach the feed`, pelas quatro rotas reais) cobre
      **por chegada**, não por fiação, que é mais forte do que a guarda era. **Dívida com
      cobrador automático, não com prazo.** E a prova do lado de fora: o log
      `activity_event_not_recorded`, que disparava **87 vezes** na suíte de integração, hoje
      dispara **0**._
      _**⚠️ O INCIDENTE: A FATIA VAZOU FIXTURE NO BANCO DO DONO, e o padrão é o pior
      possível.** A FK nova quebrou o `afterAll` de **quatro arquivos de integração que já
      existiam** — os testes ficavam **verdes** e a limpeza estourava depois. Três rodadas
      deixaram **261 eventos, 231 itens de plano, 138 livros, 24 clubes e 36 usuários**. O
      executor viu, apagou à mão **por id** (caminhando a partir dos clubes de fixture, com
      dry-run e conferência de que o conteúdo do dono ficava de fora) e consertou a causa. **O
      orquestrador conferiu o banco diretamente pelo Prisma**: 1 usuário (o super-admin, mesmo
      `createdAt`), 1 clube, 2 livros, 0 eventos, 0 logs — exatamente como antes._
      _**E o CONSERTO foi auditado com mais rigor que o vazamento.** A limpeza nova apaga
      evento **por âncora** (um `OR` sobre os ids que o teste declarou seus), porque o evento é
      o único fixture que o teste **não cria** — ele nasce do gatilho, com `randomUUID()` que
      nenhum arquivo conhece. O revisor leu os **20 chamadores**: os anchors só aceitam
      `in [...]` de ids concretos, o `TEST_ADMIN_ID` **nunca** é passado, e há rede embaixo —
      **mesmo apagando os ternários, `{ in: [] }` no Prisma casa zero linhas**, então o `OR`
      **não degenera para "tudo"** por nenhuma mutação de uma linha. E o `singleFork: true`
      torna colisão entre arquivos impossível por construção. ⚠️ **Mais forte que o §6.6
      exige, não mais fraco:** quem decide o conjunto apagado é o **banco**, não o teste — um
      evento deixado por um teste que morreu no meio ainda casa a âncora._
      _**⚠️ A REGRESSÃO QUE VIRA A 34b, confirmada elo por elo pelo orquestrador:** só existem
      **duas** guardas no `replacePlanItems`; o `unmarkRead` faz **hard delete** do log; o port
      do `ActivityEvent` **não tem `delete`**, então o evento fica; e `P2003` **não está
      mapeado**. O caminho é exatamente **um**: um dia **lido e depois DESMARCADO** perde o
      log, passa pelas duas guardas e estoura na FK do evento → **500 mudo**. Antes desta fatia
      esse mesmo dia se removia. **É regressão do que a 32c consertou**, um passo mais fora. Já
      tem testemunha automática (`is a third reason the plan replacement can fail`)._
      _**Dois achados contra código PRÉ-EXISTENTE, os dois medidos:** (1) ⚠️ **o pino do
      `highlightColor` — o molde que esta spec mandou copiar — era FRACO**: trocar
      `z.enum(HIGHLIGHT_COLORS)` por uma cópia à mão com os mesmos valores passava em
      **478 + 195 + 1520 + 641 + 484 — ZERO acusadores**. O executor apertou o dele para
      identidade (`toBe`), mediu, e a rodada de correção apertou o original: **0 → 1**. E o
      docblock registra o que a troca **não** fecha: a paleta continua sem a segunda rede (a
      varredura de produção) que o `activity.ts` tem. (2) O **`FIND_ROW_LIMIT` da nota não tem
      acusador nenhum** — removê-lo deixa a suíte inteira verde, porque nenhum teste cria mais
      de 500 notas; o do grifo tem 1. Registrado, **não consertado** (é da Tarefa 11, e
      consertar exigiria 501 notas no banco do dono)._
      _**O `take` do Prisma é COM SINAL, e isso virou conserto com dono único.** `take: -5`
      devolve os **mais antigos** — a ponta oposta do feed — e `take: 0` devolve nada. O teto
      morava só na borda, e os docblocks já nomeavam a **Tarefa 38** como segundo chamador
      **que não passa por Zod**. Conserto: `activityFeedTake` no **port**, chamado pelas duas
      implementações. ⚠️ **E o argumento para extrair em vez de clampar só no Prisma é medido:
      as duas implementações erram de formas DIFERENTES** com o mesmo limite inválido — no
      Prisma `-1` traz o mais antigo; num `slice(0, -1)` o último elemento some; `slice(0,-50)`
      devolve vazio. Clamp só no Prisma deixaria o fake com um **terceiro** comportamento
      (§7.1). Medido pelo orquestrador: **0 → 3** no unitário, +1 no contrato. E a precondição
      sobre o Prisma virou **teste permanente** — afirmação sobre o banco não colada é
      suposição (lição nº 17)._
      _**O `limit` na borda foi desvio da spec e era consequência necessária:** a spec pedia
      `limit?` no UseCase e não mencionava a query — o que faria dele código sem chamador de
      produção. Forma por forma igual ao `page` do grifo, e sem cursor/offset/contagem, então
      não vira paginação disfarçada._
      _**Dívidas registradas:** a **34b** (acima); o `FIND_ROW_LIMIT` da nota sem acusador; e o
      `buildRepositories` ficou **sem pino unitário** para a fiação de `activityEvents` — a
      guarda apagada era a única asserção de unidade que a tocava, e hoje só há testemunha de
      integração._
      _**Gates:** os cinco limpos, verificados pelo orquestrador. `app` e `ui` intocados;
      migration gerada pelo Prisma, sem drift (`migrate status` limpo)._
      _**Nota operacional:** o Docker estava desligado de novo no começo da fatia; foi subido
      para a migration e a integração, e **deixado de pé**._

- [x] **34b** — `replacePlanItems` recusa remover dia que já tem ATIVIDADE, **e nasce a guarda
      contra esquecer a quarta FK**. ⚠️ **FATIA INSERIDA**, com o motivo medido na 34.
      → `tasks/34b-guarda-de-atividade-no-plano.md`
      _**478 shared · 195 ui · 1548 backend** (era 1520) **· 641 app**. Integração **491** (era
      484). Chunk **418.565 B**, idêntico. Banco limpo, `ActivityEvent` em 0, super-admin
      intacto._
      _**⚠️ A ENTREGA PRINCIPAL NÃO FOI A TERCEIRA GUARDA — FOI A GUARDA CONTRA ESQUECER A
      QUARTA.** A terceira é 20 linhas copiadas da 32c. O que custava caro era o **padrão**:
      **duas fatias seguidas** introduziram FK sem guarda (32→32c, 34→34b), e nas duas a
      lacuna só apareceu porque **alguém foi procurar**. Duas vezes é coincidência; três é
      padrão, e padrão pede resposta estrutural (§7.9: requisito sem guarda automática é
      intenção). Nasceu o `plan-item-fk-guards.test.ts`: ele lê o `schema.prisma`, acha **toda**
      FK que recusa remoção apontando para `ReadingPlanItem`, e exige guarda de domínio para
      cada uma._
      _**A regressão consertada**, confirmada elo por elo pelo orquestrador antes da spec: um
      dia **lido e depois DESMARCADO** perdia o `ReadingLog` (hard delete) mas mantinha o
      `ActivityEvent` do tipo `READ` — o port do evento não tem `delete` e o log é imutável. As
      duas guardas devolviam `[]`, a remoção estourava na FK, e `P2003` **não está mapeado** →
      **500 mudo**. Antes da 34 esse dia se removia. Agora: **400** com
      `cannot remove N reading plan day(s) that already have activity` — e ela **não diz
      "leu"**, porque o dia do caso real não tem leitor nenhum._
      _**⚠️ O ACHADO ALTO: A GUARDA NOVA TINHA UM FURO DO TAMANHO DO PADRÃO DO PRISMA.** O
      predicado casava o **texto** `onDelete: Restrict`. Medido pelo revisor e **reconfirmado
      pelo orquestrador rodando o predicado contra quatro formas**: o **implícito obrigatório**
      — relação sem `?` e sem `onDelete` — **escapava**, e ele **é** `ON DELETE RESTRICT` no
      Postgres (o próprio `schema.prisma` já registrava isso, medido na Tarefa 24). Ou seja: a
      quarta FK podia nascer com `RESTRICT` de verdade, sem guarda, com a suíte **verde** —
      exatamente o bug que a fatia existe para matar, entrando pela porta que o ORM abre por
      omissão. Conserto: o predicado passou a decidir pelo **default do Prisma**, não pelo
      texto escrito. Verificado pelo orquestrador nos quatro casos: explícito **conta**,
      implícito obrigatório **conta**, opcional sem `onDelete` (`SetNull`) **não conta**,
      `Cascade` declarado **não conta**._
      _**⚠️ E o executor mediu o OUTRO lado com mutante, porque a asserção passava por
      acidente.** `restrictFksToPlanItem(implicitOptional) === []` já era verde **antes** do
      conserto — mas porque **tudo** devolvia `[]`. Com o mutante "toda omissão é Restrict",
      ela acusa. Asserção que passa pela razão errada não é asserção._
      _**As três mutações que provaram a guarda estrutural, e a mais valiosa não foi pedida:**
      **M2** (terceira guarda removida) → 9 acusadores e a mensagem **nomeia** a FK órfã, o
      método exato a escrever e a consequência (*"answers 500 instead of 400"*). **M5**
      (chamada da guarda de **nota** removida, **docblock intacto** citando o nome do método) →
      11 acusadores: o `withoutTsComments` funciona **contra o arquivo real**, não só contra a
      string fabricada — era o falso verde mais provável. **M6** (regex quebrado) → 3, o
      antídoto do §7.4. E o regex é robusto em 8 de 8 formas de escrita._
      _**O LIMITE da guarda, medido e agora escrito onde se lê:** com a chamada mantida e o
      `throw` removido, a guarda estrutural fica **VERDE** (7 acusadores comportamentais). Ela
      prova que a **chamada existe**, não que ela recusa. Para as três FKs de hoje é inofensivo;
      para a quarta é justamente o estado em que teste de comportamento ainda não existe — e é
      por isso que a mensagem de falha diz "add a call … **that throws**". Ponteiro para onde a
      recusa é provada, **pelo nome do teste** (§7.4)._
      _**O rename foi desvio da spec e melhorou a entrega:** `planItemIdsWithAnyActivityEvent`
      em vez de `…WithAnyActivity`, porque com o nome do **modelo inteiro** a derivação
      `guardMethodFor(model) = 'planItemIdsWithAny' + model` fica **mecânica** — e a guarda
      funciona sozinha para a quarta FK, sem tabela de-para mantida à mão. Os três ports já
      seguiam a convenção sem exceção._
      _**⚠️ NÃO generalizar as três guardas numa tabela — e o revisor corrigiu o RACIOCÍNIO sem
      mudar a conclusão.** O executor justificou dizendo que a tabela ficaria verde no mesmo
      mutante "porque a linha some junto com a guarda". Medido: **não é o mecanismo** — a
      varredura casa o **texto** do nome do método em qualquer ponto do arquivo, então uma
      tabela com os três nomes continuaria satisfazendo-a. A conclusão continua certa pela
      razão certa: **uma tabela não deriva de nada**, e a quarta FK sem linha nela não fica
      vermelha em lugar nenhum. A prateleira arrumada não tranca a porta. Registro corrigido no
      docblock._
      _**Um bug de produto que o executor tornou IRREPRESENTÁVEL, e o revisor mediu a
      diferença:** `ActivityEvent.planItemId` é **anulável** (grifo e avulsa não têm dia), e uma
      guarda que contasse esses eventos **recusaria toda edição de plano de um clube que
      grifa**. Nas duas implementações a exclusão do nulo é **estrutural** (`IN` contra `NULL` é
      falso; `Set<string>.has(null)` é falso), então os testes unitários do nulo são
      **documentação (§7.1), não rede** — o único acusador vivo é o contrato. Registrado para
      ninguém contá-los como proteção._
      _**Dois ponteiros mortos consertados no `schema.prisma` (só comentário, com autorização
      explícita do orquestrador):** o bloco ainda dizia que a FK do evento *"NÃO tem guarda"* e
      apontava para um teste que esta fatia renomeou — **as duas metades falsas**. É a lição do
      `dayRange` no `CLAUDE.md`: regra que aponta para o que não existe faz o próximo agente
      procurar, não achar e inventar. Provado que **nenhuma linha de modelo mudou** (md5 do
      schema sem comentários idêntico; `migrate status` sem drift; `migrate diff` vazio)._
      _**E a decomposição do "13" estava errada nos DOIS docblocks** — o texto da 34b fora
      **copiado verbatim** do da 32c, que já errava: são **sete** estados de permissão/tenant e
      **seis** formatos de rascunho, não seis e sete. Total certo, conta errada. Lição nº 17 em
      escala pequena: número copiado sem recontar._
      _**A troca do teste da lacuna** (feita sem a spec pedir, pelo molde da 32c):
      `is a third reason the plan replacement can fail…` → `is the net under the domain guard…`.
      Comparado asserção por asserção: os **seis** corpos idênticos, mais um acréscimo._
      _**Gates:** os cinco limpos, verificados pelo orquestrador. `app`, `ui` e `shared`
      intocados; nenhuma migration._

- [x] **35** — Feed de atividade na home. → `tasks/35-feed-na-home.md`
      _**O CLUBE FICA VISÍVEL, E SEM VIRAR PLACAR.** Entregue: o feed na home — quem, o quê, em
      que livro, quando —, com link por tipo, `activity-feed.tsx` (**190** linhas) e a home de
      **284 → 291**. **480 shared** (era 478) **· 195 ui** (intocado) **· 1548 backend**
      (intocado) **· 665 app** (era 641). Chunk **421.232 B** (+2.667), folga **28.768**.
      Integração **não rodada** — a fatia não toca backend._
      _**⚠️ ESTA ERA A FATIA MAIS PERIGOSA DO MVP PARA O §1 DO PLANO**, porque um feed é, por
      construção, uma superfície de **comparação**: quem fez mais aparece mais. As três decisões
      que endereçam isso: a linha é uma **frase**, não uma tabela (tabela com coluna de pessoa
      convida o olho a varrer aquela coluna e contar); **ordem cronológica pura, sem agrupar**
      (agrupar por pessoa **é** o placar; por dia cria cabeçalhos que viram régua); e **sem
      "carregar mais"** (paginação convida a rolar o histórico procurando quem fez mais)._
      _**⚠️ O ACHADO ALTO, E ELE CONFIRMA A LACUNA QUE O ORQUESTRADOR PREVIU NA PRIMEIRA
      RESPOSTA DESTE MVP.** As **duas** guardas do projeto deixam passar o placar em prosa —
      medido pelo orquestrador: `"…O Hobbit 3 atividades"` passa pela `COUNTER_SHAPE` **e** pela
      `GUILT_TERMS`; só uma asserção de "nenhum dígito" o pega. É a mesma lacuna do
      `"12 dias lidos"` que motivou a decisão estrutural da Tarefa 31 (tornar a contagem
      **irrenderizável no contrato**, em vez de confiar na regex). **Agora está medida duas
      vezes, em dois lugares.**_
      _**E a guarda nova nasceu com DOIS defeitos, os dois medidos:** (1) ela varria só o
      `<ul>`, então um contador no **cabeçalho** da seção — o lugar mais visível — embarcava com
      **662/662 verdes** (reconfirmado pelo orquestrador); (2) ela tinha **falso positivo
      garantido em produção**: com instantes realistas ("há 2 horas", "há 3 dias") a linha
      **tem** dígito, e o verde só existia porque o fixture caiu nas três faixas em que o
      `numeric:'auto'` escreve palavra. O nome (`writes NO NUMBER in the feed`) prometia mais do
      que a propriedade tinha (§7.9: o nome do teste é parte da guarda). ⚠️ **E um livro
      chamado `1984` deixava a suíte vermelha sem placar nenhum na tela** — o teste mandando no
      produto (lição nº 4 do MVP 1)._
      _**O conserto e o nome novo:** a guarda varre a **`<section>` inteira**, redige os valores
      que **vêm de dado** (título, autor, "quando") e exige que **o resto** não tenha dígito;
      o teste passou a se chamar `adds NO NUMBER OF ITS OWN to the feed section — every digit on
      it comes from data`. ⚠️ **E os valores redigidos são escritos à mão, nunca calculados pelo
      `formatActivityMoment`** — se fossem, um mutante que grudasse "+3" no formatador sairia
      junto na redação. Fixture hostil de propósito: livro `'O Hobbit 1984'` e instantes reais
      em três degraus. Medido nos três lados: livro com dígito **verde**, instante realista
      **verde**, placar em prosa (na frase **e** no cabeçalho) **vermelho**._
      _**⚠️ E o executor achou o vermelho pelo motivo errado antes de entregar:** com
      `getByText(heading)` **exato**, o mutante do cabeçalho quebrava a **query**, não a
      asserção — o teste acusaria "não achei o elemento" em vez de "entrou um placar". Trocado
      por um matcher que inclui. Vermelho honesto é o que diz **o que** quebrou._
      _**A escada de tempo relativo, medida nos dois idiomas:** **1.219 instantes por locale**,
      **derivados da própria escada** (mutante com degrau falso → 3 acusadores), varridos por
      `GUILT_TERMS` **e** `COUNTER_SHAPE` → **0 ofensores**. ⚠️ E o risco de ICU reduzido que o
      orquestrador levantou **não existe**: o `format()` nunca devolve vazio, e o **par
      positivo** (`toBe('há 2 horas')`) ficaria vermelho alto num Node small-icu, não verde
      calado — a rede já estava lá. **A escada para na SEMANA** de propósito: mês e ano não são
      múltiplos fixos de dia, aproximar em 30 dias seria **número errado na tela**, e a conta de
      calendário tem dono (Luxon, backend-only)._
      _**As quatro frases são distinguíveis nos DOIS lugares**, e a linha `en` prova que a
      partição do §7.9 foi aplicada certo: a tela pina `pt` e **nunca veria** duas frases `en`
      coladas — quem guarda essa metade é o catálogo (1 acusador), e guarda._
      _**Outro falso verde de SUBSTRING**, a terceira aparição da classe: `requestsTo(calls,
      '/me')` casava `/clubs/c-casal/members`, e `'/clubs/'` casava **três** endereços
      (`/books`, `/activity`, `/members`). ⚠️ Uma asserção de contagem passava só porque o
      `waitFor` resolvia **antes de o feed disparar** — verde que deixou de descrever a verdade.
      Trocado por igualdade exata de `pathname` e regex ancorada._
      _**A inversão que a decisão F não decidia virou teste:** o feed só monta com a estante
      pronta e não vazia — o que é **mais** do que "as duas requisições não bloqueiam a
      estante". Os motivos são bons (o nome do livro vem da estante; sem livro não há atividade
      possível), mas existiam **só em prosa**. Agora há dois testes (estante 500 → feed não é
      pedido; estante vazia → idem), com **2 acusadores** no mutante que monta o feed sempre._
      _**⚠️ UM DEFEITO DE REGISTRO QUE ERA DO ORQUESTRADOR, não do executor:** três docblocks
      diziam **"decisão do dono"** apontando para a pergunta 1 do MVP 3, cujo campo
      `**Resposta:**` estava **vazio** — o dono respondeu na rodada de decisões, e o
      orquestrador escreveu a pergunta no `ACEITE-MVP.md` e **nunca voltou para preencher a
      resposta**. É a lição nº 5 do MVP 1 (prosa não é prova) aplicada a quem a cobra. Resposta
      registrada com data e consequência estrutural; e a **pergunta 3** (o feed deve dizer o
      tema do dia?) foi escrita na mesma passada._
      _**Reusou vocabulário em vez de duplicar:** `pages.busca.item.unknownBook` e
      `pages.acervo.item.author.{you,other}` — precedente explícito do `busca.tsx` (vocabulário
      do **modelo**, não da tela). Duplicar seria a mesma frase com dois donos._
      _**Gates:** os cinco limpos, verificados pelo orquestrador. `backend` e `ui` intocados; a
      guarda da 29a continua de pé (`grep 'assets/en-' dist/sw.js` = **0**)._
      _**Pergunta do dono registrada:** o feed deve dizer o **tema do dia**? → `ACEITE-MVP.md`,
      MVP 3, pergunta 3._

### Bloco I — Push

- [x] **36** — `Settings` de notificação (**backend**) + `PushSubscription` inteiro (domínio,
      port, fake, repo Prisma, contrato) + rotas de config/subscribe/unsubscribe.
      → `tasks/36-settings-e-push-subscription.md`
      _**A PRIMEIRA FATIA DO PROJETO QUE TOCA SEGREDO**, e o desenho todo saiu disso: ela
      **guarda** inscrição e **lê** configuração, e **não envia nada**. O envio é a 38. Quem
      mexe com chave pela primeira vez não produz efeito fora da máquina na mesma fatia._
      _**575 shared** (era 480, +95) **· 195 ui** (intocado) **· 1684 backend** (era 1548,
      +136) **· 665 app** (intocado). Integração **581** (era 491, +90). Chunk **421.961 B**
      (era 421.232, +729), folga **28.039**. Migration `20260911225120_push_subscription`
      gerada pelo Prisma. Banco provado limpo **por consulta**: `PushSubscription` em 0,
      super-admin intacto, zero fixture com prefixo em tabela nenhuma._
      _**⚠️ O SEGREDO, auditado mais duro que todo o resto, e por três instrumentos
      independentes.** (1) A varredura de duas camadas em `packages/shared` — que **é**
      empacotado no PWA — tem **antídoto real**: fazer a varredura devolver lista vazia deixa
      **1 acusador** vermelho (`expected 0 to be greater than 20`), que é o padrão do §7.4.
      (2) Um literal **falso** de 43 caracteres colado no `notification.ts` → **1 acusador**;
      no `.env.example` → **2 acusadores**. (3) O revisor **construiu o bundle e o varreu**:
      **zero** ocorrências da chave privada nos assets, `vapidPublicKey` presente. E o
      orquestrador varreu o diff inteiro atrás de corrida base64url de 40+: **zero**.
      `process.env.VAPID_PRIVATE_KEY` existe em **um** arquivo do backend._
      _**⚠️ O MUTANTE DO §7.5 DEU "SOBREVIVEU" E A CLASSIFICAÇÃO CERTA ERA *EQUIVALENTE* —
      e isso só vale porque foi PROVADO, não afirmado.** R12a (o fallback `?? req.user.sub`
      com o `.strict()` intacto) passou **2265/2265**. Na Tarefa 30 **este mutante exato**
      passou 1377/1377 e era **furo real** — então "sobreviveu" aqui não podia ser aceito
      como equivalente sem prova. O orquestrador rodou sonda própria contra os três schemas
      exportados: `DELETE +userId` **400**, `POST +userId` **400**, `PATCH +userId` **400**,
      `POST` com `userId` **aninhado** aceito mas **stripado**. Não existe resultado de parse
      em que `req.body.userId` seja definido → o ramo não é alcançável. A diferença para a 30
      é **o `.strict()`**, que lá não existia naquele corpo. O mutante de verdade (R12b:
      **declarar** o campo no schema + o fallback) tem **1 acusador já no unitário de
      `shared`** — a primeira metade morre antes da integração._
      _**⚠️ O ACHADO MÉDIO, E ELE VIROU UMA SÉRIE DE QUATRO.** O teste
      `answers 400 …, and writes nothing` assertava o **status** antes de ler o banco: sob o
      mutante a resposta vira 200, o teste morre no status, e as asserções que o **nome
      promete** — as linhas do banco — **nunca rodam**. Ela pareceria provada sem nunca ter
      sido exercitada. O executor já tinha achado e consertado **um** caso e **não olhou o
      arquivo do lado**; a rodada de conserto achou o **terceiro e o quarto**. Medido nos
      dois: antes o acusador é `expected 200 to be 400`; depois é `expected '06:15' to be
      '05:00'` (e, no `POST`, `expected 1 to be +0` — a contagem de inscrições no nome do
      outro). **O vermelho honesto é o que diz O QUE quebrou**, e aqui o que quebrou é
      "escreveu no `Settings` de outra pessoa", não "o número do status"._
      _**⚠️ E o quinto candidato foi examinado e DELIBERADAMENTE não mexido, com medição** —
      tinha a forma, mas nenhum mutante único flipa o status ali: removido o `.regex` da
      borda, os 8 casos continuam **verdes** porque o `assertReminderTime` do domínio (a
      segunda barreira) recusa igual. Reordenar "por via das dúvidas" teria fingido conserto._
      _**⚠️ UM DEFEITO DE CONTAGEM NO PRÓPRIO RELATÓRIO, pego pelo orquestrador:** o executor
      disse ter varrido *"os 11 arquivos de integração do backend (todos)"*. São **23** — 11
      de rota e **12 de contrato de repositório**, que ele não abriu. Medido: nos contratos o
      defeito **não tem como existir**, porque ali o `rejects.toThrow()` e a ausência de
      efeito são **o mesmo fato** (se o delete passou, a linha sumiu — morrer ali já é a
      acusação certa), enquanto na rota são **dois fatos independentes**: um 400 **com**
      escrita é possível, e foi exatamente o bug da Tarefa 32. Escopo certo, **denominador
      errado** — e denominador errado num relatório de varredura é o que faz a próxima pessoa
      achar que já olharam._
      _**A premissa FALSA era da spec do orquestrador, e o executor a mediu.** A decisão D
      dizia *"o regex `HH:mm` já existe no Zod da borda (Tarefa 03)"* — e o comentário do
      `schema.prisma` dizia o mesmo. `grep -rn 'reminderTime' packages/shared/src` voltava
      **vazio**: **nunca existiu**, por **33 tarefas**. É a mesma classe do `dayRange`. O
      executor entregou as **duas** barreiras (borda e domínio) com **uma constante só** —
      `REMINDER_TIME_PATTERN`, importada pelos dois, porque duas barreiras não podem ser duas
      regras —, e o comentário do schema foi reescrito **nomeando os dois donos** e
      registrando quando deixou de ser falso. Só comentário: md5 do schema **sem comentários**
      idêntico, `migrate status` sem drift, `migrate diff` vazio._
      _**O `.strict()` é a barreira, e a segunda é o `response` (§6.1).** As **5** rotas novas
      declaram `response` por status enumerado, e nenhuma devolve objeto de domínio. Medido: um
      `toResponse` que juntasse a chave privada dá **2 acusadores unitários** — e a integração
      fica **VERDE**, porque o `serializerCompiler` corta o campo não declarado. Duas redes, e
      a de fora não dispensa a de dentro._
      _**Fidelidade do fake conferida nos SEIS eixos** (chave única, upsert, endpoint
      duplicado, `disable`, `byUserId`, id inexistente) — bate em todos. E está **pinada por
      teste**: tirar `disabledAt === null` do `byUserId` dá **4 acusadores**; trocar
      `existing?.id ?? subscription.id` por `subscription.id` dá **1**. ⚠️ **Uma divergência
      permissiva registrada e NÃO consertada:** o store indexado só por `endpoint` aceita dois
      endpoints com o mesmo `id`, que o Postgres recusa na PK. Inalcançável hoje — **um**
      chamador, com `existing?.id ?? randomUUID()` —, então não ganha rede: ganha registro no
      docblock, como a 34b fez com o `planItemId` nulo._
      _**Erro de domínio (§6.2):** as duas classes novas mapeadas **no mesmo commit**; remover
      uma dá **2 acusadores**, um deles o **estrutural de exaustividade** — é vermelho, não 500
      mudo. `NOT_YET_MAPPED` continua `[]`, e `error.message` só escapa na classe 400._
      _**A guarda estrutural da 34b ficou verde sem uma linha de mudança, e pelo motivo LIDO no
      schema:** a única FK do `PushSubscription` aponta para `User`, não para
      `ReadingPlanItem` — push não tem dia de plano, o lembrete se resolve por
      `timezone` + `reminderTime`. Escrito no comentário do modelo para a próxima pessoa não
      precisar deduzir._
      _**Gates:** os cinco verificados pelo orquestrador, não copiados — 575/195/1684/665,
      typecheck, lint e prettier limpos, chunk **421.961 B** medido por mim, e a guarda da 29a
      de pé (`grep 'assets/en-' dist/sw.js` = **0**). `app` e `ui` intocados; **nenhuma
      dependência nova** — `web-push` **não** entrou, é da 38._
      _**A metade de TELA virou a Tarefa 36b**, inserida: uma fatia que muda modelo, gera
      migration, cria duas tabelas, quatro rotas **e** desenha tela é uma fatia que ninguém
      consegue revisar._
- [x] **36b** — A tela mínima de preferências + "ativar neste aparelho". ⚠️ **FATIA
      INSERIDA**: a metade de TELA da 36 foi separada porque a metade de backend já era uma
      fatia inteira — migration, duas tabelas, quatro rotas e o **primeiro segredo do
      projeto**. Fatia que muda modelo, gera migration e ainda desenha tela é fatia que
      ninguém consegue revisar. → `tasks/36b-tela-de-preferencias.md`
      _**577 shared** (era 575) **· 195 ui** (intocado) **· 1684 backend** (intocado) **· 744
      app** (era 665, +79). Chunk **429.721 B** (era 421.961, **+7.760**), folga **20.279**.
      Integração **não rodada** — a fatia não toca backend. Guarda da 29a de pé
      (`grep 'assets/en-' dist/sw.js` = **0**)._
      _Entregue: `/preferencias` pelo cabeçalho (onde já moram os controles da PESSOA — a home
      é a tela do CLUBE, e é por isso que a busca mora nela), os três controles salvando
      sozinhos com `PATCH` de **um campo**, e a seção do aparelho com as **quatro** recusas
      distintas. `preferencias.tsx` **161** · `push-section.tsx` **132** · `push-device.ts`
      **124**._
      _**⚠️ O ACHADO ALTO: A COLA DO NAVEGADOR NÃO TINHA PAR POSITIVO, E O DOCBLOCK AFIRMAVA
      QUE TINHA.** Medido pelo revisor e **reconfirmado pelo orquestrador com o protocolo
      completo**: trocar `isSecureContext: window.isSecureContext` por `false` fixo passava
      **728/728, ZERO acusadores** — o push ficaria bloqueado em **todo** navegador, com a
      frase "abra por https", e nada acusaria. O mesmo com `hasServiceWorker: true`. E o
      docblock do único teste da cola dizia textualmente que *"a cola monta um host de verdade
      (em vez de constantes, ou de nada) é testado aqui"*. **A afirmação era falsa.** É a
      classe §7.10 e a **terceira aparição no MVP** (o feed na 35, o texto do `onDelete` na
      34b, esta)._
      _**A causa, e ela é instrutiva:** em jsdom o `insecureContext` vence por **curto-
      circuito**, então as outras **seis** leituras cruas ficavam inobserváveis atrás dela. Um
      teste que passa pela primeira condição nunca exercita as outras — e o docblock leu isso
      como força ("ele pina a ordem de prioridade") quando era cegueira. **Conserto:** um
      instalador de navegador em jsdom com desfazedor (o descritor original guardado, apagando
      a propriedade quando ela não existia — e ⚠️ **`window.isSecureContext` em jsdom 25 não é
      `false`, é `undefined`**, outra afirmação do docblock antigo que a medição negou).
      **Sete de sete** leituras cruas ganharam acusador, mais duas de lambuja (`matchMedia` e
      `requestPermission`). Reconfirmado pelo orquestrador: **0 → 6 acusadores**, 738/744._
      _**⚠️ O PRIMEIRO MÉDIO É O `writes NO NUMBER in the feed` OUTRA VEZ.** A guarda chamada
      `reads no VITE_VAPID_* **anywhere in the app source**` lia **quatro arquivos à mão**:
      plantar a variável no `router.tsx` — **arquivo que esta mesma fatia tocou** — passava
      728/728. O nome do teste é parte da guarda (§7.9), e este nome prometia o que a asserção
      não sustentava. Agora varre `src/**/*.{ts,tsx}` recursivamente (41 arquivos), e o
      vermelho **diz onde**: `expected 'auth/require-auth.tsx: …' not to contain 'VITE_VAPID'`._
      _**⚠️ O SEGUNDO MÉDIO É O §7.1 NA DIREÇÃO RESTRITIVA — OITAVA APARIÇÃO NO PROJETO.**
      **Nenhum dos dois dublês sabia REJEITAR**, então um `catch` inteiro ficava sem acusador:
      trocar `setState('inactive')` por `setState('active')` passava **728/728**. Consequência
      num aparelho onde `navigator.serviceWorker.ready` rejeita: a tela diz **"os avisos estão
      ativados neste aparelho"** e não chega aviso nenhum — exatamente o que a regra 10 da spec
      chama de a pior forma desta tela errar. ⚠️ E o código **documentava por escrito** que "o
      Chrome recusa a inscrição sem `userVisibleOnly`, e a recusa vem como **exceção**" — uma
      afirmação que o dublê não sabia produzir. Ensinadas quatro rejeições; **duas
      deliberadamente NÃO ensinadas, com motivo**: o `unsubscribe()` que devolve `false` (o
      booleano é descartado por desenho — não há estado observável, o teste nasceria sem
      acusador possível) e a rejeição do `unsubscribe` no dublê de tela (cairia no MESMO
      `catch` que outro teste já acusa — seria cobrir duas vezes, a crítica da 32c)._
      _**O `Promise.all` que derrubava a tela inteira** (BAIXO, consertado por decisão do
      orquestrador): com `/notifications/config` em 500 e `/me/settings` em 200, o DOM colado
      pelo revisor era *"Não foi possível abrir suas preferências"* — **sem campo de horário,
      sem interruptores, zero `PATCH`**. As três preferências são o trabalho **principal** da
      tela e o aparelho é o secundário; o secundário não leva o principal junto. Agora é
      `allSettled` com um `configFailed` próprio, **distinto** tanto de `enabled: false` quanto
      de sucesso — e a distinção virou propriedade do **catálogo** nos dois locales (§7.9), não
      só da tela._
      _**⚠️ A SPEC DO ORQUESTRADOR ERROU DE NOVO, E O EXECUTOR A CORRIGIU COM MEDIÇÃO —
      quarta vez neste MVP.** A regra 15 afirmava que a conversão base64url "erra em silêncio"
      e nomeava o padding `=` como parte da guarda. O executor apagou a reposição do `=`:
      **728/728, zero acusadores**. O revisor então varreu **exaustivamente** todas as
      **266.240** strings base64url de comprimento 2 e 3 e achou **zero** diferenças (e
      `%4 === 1` lança dos dois lados): `atob` é *forgiving-base64*. **Mutante equivalente,
      provado — não afirmado.** A linha ficou (é grátis), registrada no docblock **como sem
      acusador** (§7.10). Quem carrega a propriedade de verdade é a troca `-_`→`+/` (**7**
      acusadores) e o tipo `Uint8Array` (**1**) — e essa nem erra calada, ela **lança**._
      _**⚠️ O `import()` FOI MEDIDO E RECUSADO, e o motivo importa para as fatias seguintes.**
      O revisor mediu que passar a página para `lazy()` economizaria **4.798 B** na entrada
      (folga iria a 25.408) e recomendou. O orquestrador foi conferir: o service worker
      **precacheia os chunks de `assets/`** — o chunk lazy do **editor** está no precache. Ou
      seja, dividir encolheria a **métrica do teto sem reduzir um byte** do que a pessoa baixa
      na instalação. Seria jogar com o número, que é precisamente o erro que a 29a ensinou (lá
      o conserto verdadeiro não foi mover chunk, foi `globIgnores`). **Reavaliar na 38**, e
      então a pergunta certa não é "lazy?" e sim "lazy **e fora do precache**?"._
      _**De que é feito o crescimento do chunk, medido por mutação:** a página inteira
      **−5.128 B** (69%; dentro dela tela+seção ≈ 3.777 e a costura 1.351), as chaves novas do
      catálogo `pt` **−988**, o ícone do `lucide-react` **−707**; o resto é fiação. E o `en`
      continua em chunk próprio — prova de que as chaves novas **não** entraram na entrada._
      _**Dois números corrigidos no registro:** o executor reportou 2 acusadores para o mutante
      anti-culpa; o revisor mediu **1** (só o teste `pt`). E o revisor confirmou que a guarda
      anti-culpa alcança as chaves novas **por construção** — o `entries()` é recursivo sobre o
      objeto inteiro, sem lista de caminhos —, então a seção do aparelho está coberta nos dois
      idiomas: plantas em três chaves diferentes acusaram todas._
      _**⚠️ E UMA LIÇÃO DE PROTOCOLO QUE VALE MAIS QUE A FATIA:** um `cp -p` no meio de um laço
      de mutantes **reverteu uma edição feita depois de o backup ser tirado**, e o `md5sum -c`
      disse **"OK" justamente por isso**. O checksum prova que o arquivo voltou ao **backup**,
      não que o backup é a versão **certa**. Quando houver edição de verdade entre mutantes:
      retirar backup novo antes de cada um, e fechar a restauração com conferência **por
      conteúdo**, não só por checksum._
      _**Gates:** os cinco verificados pelo orquestrador — 577/195/1684/744, typecheck, lint e
      prettier limpos, chunk **429.721 B** medido por mim. `backend`, `prisma` e `ui`
      intocados; **nenhuma dependência nova**; nenhum `.env` tocado; nenhuma chave real em
      lugar nenhum (a fixture é uma progressão inventada de 65 bytes, nomeada como falsa)._
- [x] **37** — `dispatchDueNotifications` (`READING_REMINDER`, janela, fuso, supressão de
      quem já leu, idempotência) — **TDD pesado** + script de cron. Luxon entra aqui, backend
      **only**. → `tasks/37-dispatcher-de-lembretes.md`
      _**600 shared** (era 577) **· 195 ui** (intocado) **· 1826 backend** (era 1684, +142)
      **· 744 app** (intocado). Integração **601** (era 581, +20). Chunk **429.852 B** (era
      429.721, +131 — só as duas chaves novas do catálogo `pt`), folga **20.148**. Migration
      `20260912015107_notification_delivery` gerada pelo Prisma. Banco provado limpo **por
      consulta**, `diff` antes/depois IDENTICAL nas 13 tabelas._
      _**A fatia mais pesada do MVP, e tudo nela é sobre NÃO mandar:** não mandar duas vezes
      (claim no banco), não mandar para quem já leu, não mandar quando não há o que ler. Nada
      aqui envia coisa alguma para fora da máquina — o `PushSender` é port com **fake**, e
      `web-push` continua ausente do lockfile._
      _**⚠️ A DECISÃO DE SEGURANÇA QUE O EXECUTOR TOMOU SOZINHO, E A SPEC NÃO PEDIA.** O script
      de cron **RECUSA a passada** enquanto não houver `PushSender` real
      (`reason: 'push-sender-not-implemented'`). O motivo é a decisão E: o claim é gasto
      **ANTES** do envio, então uma passada com sender de mentira **queimaria a reserva do dia
      de todo mundo** — e ninguém receberia nada, nem hoje nem amanhã. Verificado pelo
      orquestrador por leitura e pelo revisor por `grep` do monorepo: `sender: null` é
      **literal** (sem env, sem flag, sem `NODE_ENV`), as duas recusas retornam **antes** de
      `options.open()` — o script nem abre o Prisma —, não há segundo chamador de
      `runDispatch` nem de `dispatchDueNotifications`, e não há `bin` nem `postinstall` em
      manifesto nenhum. **A propriedade é estrutural, não configuracional.**_
      _**⚠️⚠️ O ACHADO QUE VALE MAIS QUE A FATIA: O VEREDITO DA MUTAÇÃO DEPENDIA DA MÁQUINA.**
      O revisor mediu, e o orquestrador **reconfirmou com o protocolo completo**: o **mesmo**
      mutante, no **mesmo** arquivo — trocar `item.date === filter.date` por comparação de
      `new Date(...)` — dá **0 acusadores** em `America/Sao_Paulo` e **1** em `TZ=UTC`. Causa:
      `new Date('2026-10-5')` é meia-noite **local** e `new Date('2026-10-05')` é meia-noite
      **UTC** — iguais só em offset zero. E `grep TZ vitest.workspace.ts` voltava **vazio**.
      Isso não é defeito desta fatia: é defeito do **método inteiro do projeto**, que se apoia
      em teste de mutação. **Um "zero acusadores" só significa alguma coisa se o ambiente for
      determinístico.**_
      _**E o conserto encontrou um teste morto que era da própria fatia.** Com o `TZ` fixado,
      o mutante passou de 0 para **2** acusadores — e o segundo é
      `readingOfTheDay > matches the day by CalendarDay equality, so date arithmetic would
      fail here`, escrito **nesta fatia, para exatamente esta propriedade**, e que estava
      **verde com o mutante aplicado**. Ele existia, tinha o nome certo e não guardava nada. É
      a lição do MVP inteiro em uma linha: **o nome do teste não é a guarda; a medição é.**_
      _**⚠️ E O PINO QUE EU MANDEI COLOCAR APAGOU SEIS ACUSADORES — o executor pegou e
      consertou a causa raiz.** `TZ=UTC` no backend zerou a rede do
      `calendar-day-mapper.test.ts`: o mutante que apaga o `Z` de `calendarDayToDate` (o que o
      `CLAUDE.md` proíbe "para sempre") ia de **6 acusadores** em `America/Sao_Paulo` para
      **0** em `UTC`, porque em offset zero `new Date('…T00:00:00')` e `…T00:00:00Z'` são o
      **mesmo valor**. A rede inteira daquele arquivo dependia, **sem dizer**, de a máquina
      estar a oeste de Greenwich. Segunda baixa no mesmo arquivo: um teste com
      `if (offset > 0) … else expect(local).toBe(utc)` caía no `else` sob `UTC` e virava
      **tautologia** — o §7.8 escrito com um `if`. Conserto na causa, não no pino: os testes
      passaram a **escolher o fuso**, com precondição pinada e restauração no `finally`, e há
      um caso de **cada lado do meridiano**. Reconfirmado pelo orquestrador: **0 → 2
      acusadores, e agora independentes do pino** (medido sob o pino e com fuso forçado)._
      _**⚠️ NÃO EXISTE UM VALOR DE PINO QUE SIRVA PARA TUDO, e agora está medido.** No mesmo
      pacote, dois mutantes puxam para lados opostos: o do fake de plano precisa de **offset
      zero** para ter acusador; o do `calendarDayToDate` precisava de **offset não-zero**. E o
      `app` **não** foi para `UTC`: ele já pinava `America/Sao_Paulo` desde a Tarefa 17, e
      medir mostrou por quê — o mutante `localDay(...)` → `toISOString().slice(0,10)` tem **2
      acusadores** em São Paulo e **0** em UTC (em offset zero "o dia em UTC" e "o dia de quem
      olha" são o mesmo dia **por construção**, e não existe fixture que os separe).
      Padronizar teria cegado a suíte para o bug que a revisão da 17 existia para pegar.
      **Fixar troca variância por ponto cego fixo** — está escrito nos quatro arquivos de
      configuração._
      _**⚠️ E A REGRA QUE O EXECUTOR ESCREVEU SOBRE O `TZ` ESTAVA ERRADA — o orquestrador
      mediu.** Ele gravou no repositório que *"`TZ=` não é confiável no Node do Windows"*,
      com o controle `FOO=bar` (chega) × `TZ=Asia/Tokyo` (não chega). **O controle variava
      DUAS coisas**: o nome da variável **e** a forma do valor. Medido: `TZ=UTC` **chega**
      (`Intl = UTC`); `TZ=Asia/Tokyo` e `TZ=Etc/UTC` **não chegam**. A regra é
      **"valor com BARRA não chega"** — o MSYS2 trata valor que parece caminho POSIX como
      caminho e o descarta **sem erro**. Como quase todo nome IANA tem barra, a impressão que
      fica é a de que `TZ` não funciona. Comentário reescrito com as cinco rotas medidas,
      porque uma regra que diz "não dá para forçar o fuso pela linha de comando" **impede a
      próxima pessoa de fazer uma medição que dá**._
      _**Os três testes que o `NOTIFICACOES.md` §8 exige existem e mordem.** A janela nos
      quatro limites (`>= 0 && < windowMinutes`, fechada à esquerda e aberta à direita) → 5 e
      12 acusadores nos dois mutantes. **Horário de verão nos dois lados:** a hora que **não
      existe** (08/03, `America/New_York`, varrida **minuto a minuto do dia inteiro**, com o
      antídoto do §7.4 colado ao lado — `still fires for an hour that DOES exist`) e a que
      **acontece duas vezes** (01/11). ⚠️ E o revisor mediu **quem de fato corta o lembrete
      dobrado**: com o claim sempre concedendo, o teste da queda fica **vermelho** (6
      acusadores) — não é a janela que salva, é o claim, e o teste separa as duas coisas
      explicitamente (`claimCalls === 2`, uma linha gravada)._
      _**Um relógio só, provado CONTANDO** (§7.8): mutar `deliveredAt: now` → `new Date()` dá
      **1 acusador**, com `expect(clock.reads).toBe(1)` e o valor esperado vindo de uma
      **constante do relógio de teste**, não do código sob teste. Varredura completa do
      caminho do dispatcher: **uma** leitura de relógio em todo ele (`scheduler.ts:116`); os
      demais hits são prosa. O schema reforça — `NotificationDelivery.deliveredAt` nasce **sem
      `@default(now())`**, de propósito._
      _**Idempotência com concorrência de verdade:** o contrato dispara claims simultâneos com
      `Promise.all` — dois e **dez** — e exige exatamente **um** `true`. Quebrar o
      `DO NOTHING` para `DO UPDATE` dá 3 acusadores. O fake recusa pelos **três** campos da
      chave (tirar `localDate` → 3 acusadores; tirar `kind` → 1), com o separador escrito como
      **sequencia de escape, nunca como byte cru**._
      _**⚠️ O BYTE INVISÍVEL, TRÊS VEZES — E A TERCEIRA FOI DO ORQUESTRADOR, ESCREVENDO ESTE
      PARÁGRAFO.** (1) O fake do claim nasceu com um byte **NUL literal** como separador:
      passava em lint, prettier e nos 1823 testes, e fazia o `grep` tratar o arquivo como
      **binário** (`file` respondia `data`). O executor achou, trocou por escape e escreveu um
      scanner de caracteres de controle. (2) **Uma fatia depois o scanner pegou o seguinte**:
      ao redigir um docblock, ele mesmo introduziu um **soft hyphen (U+00AD)** dentro da
      palavra "contrato" — a ferramenta feita para um achado pegou o próximo, sozinha.
      Varredura independente do revisor nos 46 caminhos do diff: **zero**._
      _**(3) E ao escrever esta linha do `BACKLOG.md`, o orquestrador tentou renderizar a
      sequência de escape do separador e gravou um NUL CRU no lugar** — o `grep` passou a
      responder `Binary file docs/BACKLOG.md matches` no comando seguinte, que foi como se
      descobriu. ⚠️ **E o próprio harness recusou o comando de conserto**, por conter
      caractere de controle: confirmação independente, de uma terceira ferramenta, de que o
      perigo é real. Conserto: parar de tentar renderizar a sequência e **descrevê-la em
      prosa**. A lição não é "tome cuidado" — é **estrutural**: o byte entra quando alguém
      escreve o escape à mão, então não se escreve o escape à mão. E quem varre tem de varrer
      **a documentação também**, não só o código; nenhum `lint` deste projeto olha para
      `docs/`._
      _**⚠️ RECUSEI A MAIOR PARTE DO ÚNICO MÉDIO DO REVISOR, com o motivo lido no port.** Ele
      cobrou do `PushSenderFake` que distinguisse `WebPushError` 404/410, desativasse inscrição
      e lesse o `PushSubscriptionRepository`. Através do `PushSender` existem **exatamente
      duas** condutas observáveis: devolver `{ sent, disabled }` ou **lançar** — o docblock do
      port diz que o 404/410 e a escrita de `disabledAt` são **da implementação**, invisíveis
      para quem chama. Ele auditou o fake contra a **Tarefa 38**, não contra o **contrato do
      port**, e um fake de port não reimplementa o adaptador. **O resíduo que É real ficou
      registrado:** o caso misto (um aparelho morto **e** outro estourando rede) pode lançar
      **depois** de já ter desativado alguém, e aí a contagem `disabled` se perde. Escrito no
      port como **pergunta aberta para a 38**, com as duas saídas legítimas — não como
      propriedade garantida (§7.10)._
      _**Outros desvios do executor, todos com medição:** o `claim` recebe a **entidade**, não
      três argumentos (com três, `id` e `deliveredAt` nasceriam **dentro** do repositório — a
      segunda leitura de relógio que a regra 2 proíbe); `considered = sent + skipped`, com
      `disabled` como contador de **inscrição**, não de pessoa (somá-lo faria o log dizer que
      cinco pessoas foram lembradas quando foi uma com dois aparelhos mortos — quatro mutações
      provam que cada `+= 1` tem dono); o dispatcher **não recebe `vapid` nem lê ambiente**
      (quem decide "a feature está ligada" é o script); e o filtro do plano é
      `{ bookIds, date }`, não `{ userId, date }`, porque pôr a junção `Membership × Club ×
      Book` dentro do port criaria uma **segunda regra de tenant**._
      _**E a regra 20 da spec estava errada — o revisor pegou.** Ela cobrava contador de linhas
      no docblock de todo arquivo novo; essa convenção **só existe nas telas**
      (`packages/app/src/pages/*`), e nenhum arquivo de backend a segue. O executor seguiu a
      precedência certa. A metade substantiva foi cumprida com folga: o maior arquivo de
      produção tem **90** linhas, e o `scheduler` já nasceu dividido do `reminder-candidates`.
      Spec corrigida._
      _**Gates:** os seis verificados pelo orquestrador — 600/195/1826/744, typecheck, lint e
      prettier limpos, chunk **429.852 B** medido por mim, guarda da 29a de pé, e **zero
      `luxon` no bundle** (os 2 hits do meu primeiro `grep` eram `Intl.DateTimeFormat` — falso
      positivo do meu próprio comando). `plan-item-fk-guards` verde pelo motivo **lido no
      schema**: a única FK do `NotificationDelivery` aponta para `User`. Integração **601**,
      rodada pelo executor, com o banco provado limpo por consulta._
      _**Dívida registrada para fatia futura:** os dois testes que hoje só acusam **porque o
      pino é `UTC`** (`matches the calendar day exactly` e `readingOfTheDay > matches the day
      by CalendarDay equality`) **não pinam a precondição**, ao contrário dos do `app`. Se
      alguém trocar o pino, eles somem em silêncio — merecem o mesmo tratamento que o
      `calendar-day-mapper` recebeu._
- [x] **38** — `GROUP_ACTIVITY` imediato a partir do `ActivityEvent` + service worker
      (`push-handler.js`) + o `PushSender` de verdade. ⚠️ **A "tela de ativar notificações"
      saiu daqui**: ela é da **36b**, e deixá-la nas duas linhas daria dois donos para a mesma
      tela. O que sobra para cá é o que faz a notificação APARECER — nada na 36b exibe push.
      → `tasks/38-push-de-verdade.md`
      _**602 shared** (era 600) **· 195 ui** (intocado) **· 1891 backend** (era 1826, +65)
      **· 766 app** (era 744, +22). Integração **608** (era 601, +7). Chunk **430.252 B** (era
      429.852, **+400**), folga **19.748**. Precache **16 entradas / 897,12 KiB** (era 15 /
      892,48). `generateSW` intacto. Banco provado limpo por consulta, `NotificationDelivery`
      em **0** antes e depois._
      _**A ÚLTIMA FATIA DO MVP, E A ÚNICA QUE PODIA QUEBRAR O QUE JÁ ESTAVA ENTREGUE** — ela
      mexe no service worker, que serve o app inteiro, e **liga pela primeira vez um efeito que
      sai da máquina**. As quatro propriedades pinadas do SW foram remedidas **uma a uma**, e
      todas continuam **com acusador** (não só verdes): tirar o `globIgnores` → 2 · tirar o
      `navigateFallback` → 1 · mexer na denylist → 1 · pôr `runtimeCaching` de API → 1. A
      quinta (o `importScripts`) → 1._
      _**⚠️ O ACHADO PRINCIPAL É A TERCEIRA APARIÇÃO DO MESMO PADRÃO, E DESTA VEZ FOI PEGO
      ANTES DE MACHUCAR.** A guarda do `importScripts` pinava o **TEXTO do config**, e o
      `bundle-guard.test.ts` — o único teste que roda um **build real** — não olhava para o
      handler (`grep -c push-handler` nele = **0**, confirmado pelo orquestrador). A
      propriedade que ninguém guardava: o `push-handler.js` entra no manifesto de precache
      **COM REVISÃO**, e é isso que faz o `sw.js` mudar quando o handler muda — e portanto faz
      uma correção no handler **chegar a quem já tem o app instalado**. **Medido:** um
      `globIgnores: [… , 'push-handler.js']` amanhã tirava o arquivo do manifesto; o
      `importScripts` continuava funcionando, a suíte inteira ficava **verde (765/765, zero
      acusadores)**, e nenhuma correção chegava a ninguém — **em silêncio**. É a **Tarefa 29a
      outra vez** (lá a guarda pinava o texto e um `chunkFileNames` realista trazia o blocker
      de volta com 619 verdes) e a **34b** (o texto `onDelete: Restrict` deixando o implícito
      escapar)._
      _**O conserto seguiu o molde da 29a: guarda no build real, identificando por CONTEÚDO.**
      O `.js` da raiz do `dist/` é achado por ser **byte a byte** o `public/push-handler.js` —
      o nome sai daí, não entra. Depois a revisão do manifesto é comparada com o **md5 do
      conteúdo**. Reconfirmado pelo orquestrador: **1 acusador**, e o vermelho **nomeia a
      propriedade** (`expected null to be 'f7f3380444ef9e91db362f21bacbaddd'`). E os dois lados
      passaram a apontar um para o outro: o `service-worker-config.test.ts` diz por escrito que
      é **declaração de intenção** e onde mora a guarda; o `vite.config.ts` diz "NÃO acrescente
      `'push-handler.js'` ao `globIgnores`", nomeando o acusador._
      _**⚠️ O SEGUNDO ACHADO: UM SOBREVIVENTE REAL ATRÁS DE UM DOCBLOCK QUE DIZIA "RAZÃO
      MEDIDA".** O `isDeadSubscription` usa duck typing (`statusCode`), e o docblock dava duas
      razões "medidas". Trocar por `instanceof webPush.WebPushError` passava **1886/1886, zero
      acusadores** — reconfirmado pelo orquestrador. E a razão (1) era **factualmente
      contrariada pelo teste ao lado**: ela dizia que o `instanceof` obrigaria o dublê a
      construir a classe do pacote, e o `web-push-sender.test.ts` **já importava `WebPushError`
      de `'web-push'` na primeira linha**. O custo que ela dizia evitar já estava pago.
      Conserto: a razão falsa virou **errata explícita**, e a razão que fica (a forma sem a
      classe) ganhou **3 acusadores**._
      _**O caso misto, e um TESTE que corrigiu o executor.** A primeira versão do sender era
      *fail-fast* e passou **22 de 23**. O que a derrubou foi o fake enumerar **invertido de
      propósito** (§7.2): o aparelho de rede quebrada vinha primeiro e o morto **nunca chegava
      a ser desativado**. Ou seja, a desativação dependia de uma ordem que o port **não
      promete**. Guardando a primeira falha não-morta e relançando no fim, a decisão H passa a
      valer sempre. ⚠️ **E o revisor mediu a dependência:** com o *fail-fast* de volta **e** sem
      o `.reverse()` do fake, o teste do caso misto fica **VERDE** — quem o mata é a convenção
      do §7.2, não a fixture. A convenção **pagou** nesta fatia._
      _**O leque herdou a rede que já existia (decisão A):** ele entra **dentro** do
      `recordActivitySafely`, dono único do `try/catch + log` nos quatro UseCases de escrita —
      que **não mudaram uma linha**. Provado no unitário (2 acusadores) **e ponta a ponta**: com
      o sender real estourando, a rota responde **201** e a nota **continua gravada**. ⚠️ E o
      teste usa o `WebPushSender` **real** com par efêmero: o envio morre **na criptografia**
      (o `p256dh` de fixture tem 15 bytes, não 65), antes de qualquer socket — o revisor
      confirmou lendo o código do pacote, linha por linha. **Nenhum pacote saiu da máquina.**_
      _**As três exclusões do leque**, com mutante cada: autor → **7** acusadores · quem
      desligou `notifyGroupActivity` → **1** · membership não-ativo → **1**. E **404/410
      desativam, 500 NÃO** — três mutantes no reconhecedor, **3 · 5 · 6** acusadores, quatro
      deles só no lado do limite._
      _**O log de falha não leva conteúdo, e a asserção é de LISTA FECHADA de chaves.** Medido:
      acrescentar `title` ao log dá **2 acusadores**. Um `toMatchObject` ficaria verde com um
      campo a mais; a lista fechada não ficou._
      _**⚠️ A SPEC DO ORQUESTRADOR ERROU PELA SEXTA VEZ NESTE MVP, e o padrão ficou visível.** A
      regra 5 afirmava que `pnpm lint` **não** olha para o `push-handler.js`. O `typecheck` de
      fato não; o **lint VÊ** — o `eslint .` da raiz varre `.js`, e o arquivo entrou dando **5
      erros `'self' is not defined`**. Conserto: um bloco no `eslint.config.js` com os globais
      de service worker — **e é melhor assim**, porque este é o único arquivo do projeto que
      roda **fora** do app, onde ninguém vê a exceção. ⚠️ **O padrão dos seis erros:** em todos,
      a afirmação errada era **sobre a FERRAMENTA, não sobre o código** (`atob`, `eslint`,
      `TZ=`, o Zod da Tarefa 03, o padding, o lint). O que o código faz eu leio; o que a
      ferramenta faz eu **suponho**._
      _**Um sobrevivente EQUIVALENTE, com inalcançabilidade provada:** `if (!event.data)
      return;` no handler não tem acusador — sem ele, o `TypeError` de `null.json()` cai no
      `catch` que já existe duas linhas abaixo, e o desfecho observável é idêntico para toda
      entrada. A linha fica (o §2 a escreve, e push vazio é caso **normal** — não se quer o
      caminho normal dependendo de exceção), registrada **como sem acusador** (§7.10), e o
      comentário-âncora do teste foi corrigido para dizer que quem acusa aquele caso é o
      `catch`._
      _**Decisões de desenho que o executor tomou e mediu:** o `tag` **É** o debounce (três
      atividades viram **uma** notificação no aparelho, sem estado no servidor — o resíduo são
      três vibrações, registrado como limite conhecido, não escondido); a mensagem **não diz o
      nome** de quem fez (o `listActivity` registra que não resolve nome, `User.name` é
      anulável, e um `UserRepository` seria o quarto colaborador numa fatia que não podia
      crescer — se o dono quiser, é meia hora); e o `POST /notifications/test` responde **500
      deliberadamente** quando o envio falha, registrado por escrito em vez de crescer o
      contrato da API na última fatia._
      _**E o executor corrigiu uma afirmação falsa que ELE MESMO tinha acabado de escrever:**
      ele registrara que "o `setErrorHandler` já tem teste próprio", foi conferir, **não tem** —
      e reescreveu para o que existe de fato. §7.10 aplicado a si mesmo, sem ninguém pedir._
      _**Gates:** os seis verificados pelo orquestrador — 602/195/1891/766, typecheck, lint e
      prettier limpos, chunk **430.252 B**, precache **16/897,12 KiB**, `generateSW` intacto,
      guarda da 29a de pé, e a revisão do handler no `sw.js` **idêntica ao md5 do arquivo**.
      `prisma` e `ui` intocados; **nenhuma migration**; nenhum `.env` tocado; `web-push` só em
      `packages/backend`; zero bytes de controle e zero invisíveis no diff (varredura própria do
      executor **e** do revisor); e o **`notifications:dispatch` NÃO foi executado** — provado
      pelo `NotificationDelivery` em 0._

- [x] **38b** — O botão "enviar um aviso de teste" na tela de preferências. ⚠️ **FATIA
      INSERIDA depois do fechamento do MVP**, pedida pelo dono. Só tela: a rota
      `POST /notifications/test` já existia desde a 38.
      _**602 shared** (intocado) **· 195 ui** (intocado) **· 1891 backend** (intocado) **· 770
      app** (era 766, +4). Chunk **431.094 B** (era 430.252, **+842** — as frases novas do
      catálogo `pt`, que é *eager*), folga **18.906**. Precache 16 entradas / 897,95 KiB.
      Integração **não rodada** — a fatia não toca backend._
      _**POR QUE ELA EXISTE:** sem o botão, a única forma de saber se o push chega ao aparelho
      era o roteiro do `COMO-TESTAR.md` §6.7 — pôr o horário do lembrete alguns minutos atrás,
      garantir que não marcou "li hoje", e rodar o dispatcher à mão. Quatro passos, **três
      deles mexendo em estado de produção**, para responder uma pergunta binária. O botão troca
      isso por um toque._
      _**⚠️ ELE SÓ APARECE COM ESTE APARELHO INSCRITO, e não é estética.** A rota manda para
      **todas** as inscrições ativas de quem chamou: com este aparelho de fora, o aviso sairia
      para os **outros** e nada apareceria na tela de quem tocou. Um botão chamado "enviar um
      aviso de teste" que não faz nada aparecer para quem o tocou está mentindo sobre o que
      faz. Medido: tirar a guarda → **1 acusador**._
      _**⚠️ O ESTADO QUE O BOTÃO EXISTE PARA REVELAR, e ele era INVISÍVEL:** `sent: 0`. O
      navegador ainda tem a inscrição (por isso a tela diz "ativado") e o servidor **não tem
      nenhuma viva** — a linha foi apagada, ou o serviço de push a matou e o envio a desativou.
      Sem o botão, a pessoa só descobriria isso **na hora em que o lembrete não chegasse**, que
      é a hora em que ela não está olhando. Por isso `nobody` é **estado próprio, não um caso
      de `failed`**: a requisição deu **200**, o servidor funcionou, e o conserto é outro
      (desativar e ativar de novo) — fundir os dois mandaria a pessoa "tentar de novo" para
      sempre. Medido: colapsar os dois → **1 acusador**._
      _**O corpo vai VAZIO** (§6.3): o dono do envio é o JWT, e a rota não lê `userId` de lugar
      nenhum. Um corpo aqui seria um endereço capaz de mandar push **para outra pessoa** —
      arma, não diagnóstico. Medido com o mutante do contrabando (`{ userId: 'u-outra-pessoa' }`)
      → **1 acusador**._
      _**Três frases, três consertos**, e nenhuma delas conta aparelho: a resposta traz
      `{ sent, disabled }` e seria fácil escrever "mandei para 2 aparelhos", mas num clube de
      duas pessoas isso é ruído — os dois estados que mudam o que a pessoa **faz** são "saiu" e
      "não saiu para ninguém", e a contagem cobraria plural em dois idiomas para não dizer nada
      acionável. Cada frase diz o conserto, como as quatro recusas da 36b._
      _**⚠️ E o docblock do `push-section.tsx` ficou FALSO com esta fatia** — ele afirmava
      "ESTA FATIA NÃO EXIBE PUSH NENHUM … o `POST /notifications/test` é a Tarefa 38". Riscado,
      não apagado, com o aviso de que **esta tela agora produz efeito no aparelho**: um toque
      aqui faz o servidor mandar push de verdade. Contador canônico atualizado: **178** (era
      132). É a mesma classe de ponteiro morto que o fechamento do MVP consertou em cinco
      documentos — e ela reapareceu na primeira fatia depois._
      _**A varredura anti-culpa alcança as frases novas — medido, não presumido:** planta de
      cobrança em `pages.settings.device.testFailed` → **1 acusador**, e o vermelho **nomeia a
      chave e o termo**._
      _**Gates:** 602/195/1891/770, typecheck, lint e prettier limpos, chunk **431.094 B**
      medido, guarda da 29a de pé e a revisão do `push-handler.js` no `sw.js` intacta.
      `backend`, `prisma` e `ui` intocados; nenhuma dependência nova; nenhuma migration._

- [x] **38c** — A corrente de leitura: o "foguinho". ⚠️ **FATIA PEDIDA PELO DONO depois do
      fechamento do MVP 3, e ela REVERTE a decisão 1 — que era dele.**
      ⚠️ _Nasceu numerada **39** (é assim que o commit `2c00924` a chama) e virou **38c** no
      fechamento: já existia uma Tarefa 39 no MVP 4 (super-admin), e duas tarefas com o mesmo
      número num backlog são uma marcação de checklist na linha errada esperando acontecer.
      Sufixo de letra é a convenção do projeto para fatia inserida — 26a, 29a, 32b, 32c, 34b,
      36b, 38b._
      → `docs/adr/0010-corrente-de-leitura-visivel.md`
      _**605 shared** (era 602) **· 195 ui** (intocado) **· 1918 backend** (era 1891, +27)
      **· 777 app** (era 770, +7). Integração **611** (era 608, +3). Chunk **433.129 B** (era
      431.094, **+2.035**), folga **16.871**. **Nenhuma migration** — a corrente é calculada._
      _**⚠️ A OBJEÇÃO FOI LEVANTADA ANTES DE QUALQUER LINHA, COM A MEDIÇÃO NA MÃO — e o dono
      reafirmou, escolhendo a opção completa.** O termo `streak` estava **nominalmente
      proibido** pela `GUILT_TERMS`, com o comentário *"o placar disfarçado de incentivo (§1:
      nunca comparação)"* escrito no próprio código. E o mecanismo do Duolingo é enquadrado na
      **perda**: o fogo não premia ter lido doze dias, ele ameaça perder os doze — é daí que
      vem a eficácia. ⚠️ **Num clube de duas pessoas isso é pior que no Duolingo**, porque a
      outra pessoa **vê o seu fogo apagar**: não é você contra um app, é você devendo
      satisfação a quem dorme do seu lado. Tudo registrado no ADR 0010, com as alternativas
      recusadas._
      _**A decisão que mais importa não é técnica: DIAS DO PLANO, não do calendário.** Um plano
      que pula domingo é normal, e contar por calendário quebraria a corrente de quem fez tudo
      certo. E a corrente **atravessa livros** — uma que zerasse quando o clube termina o livro
      do mês seria visivelmente errada para quem a olha._
      _**⚠️ HOJE AINDA NÃO LIDO NÃO QUEBRA A CORRENTE**, e é o caso que decide se o fogo é
      usável: sem essa regra ele apagaria **toda manhã**, e a primeira coisa que o app faria ao
      ser aberto seria dar uma má notícia **falsa**. ⚠️ **E o par dela: o FUTURO não conta** —
      o plano do mês inteiro é cadastrado no dia 1, e sem esse corte os vinte dias por vir
      contariam como não lidos e a corrente seria sempre **zero**. A feature nasceria morta, e
      **verde**. Os dois mutantes têm **1 acusador** cada._
      _**`readToday` é campo do CONTRATO, não dedução da tela** — porque a tela **não consegue**
      deduzi-lo: uma corrente de 2 pode ser "leu anteontem e ontem" ou "leu ontem e hoje", e as
      duas contam 2. É ele que decide se a frase de perda aparece, e deduzi-lo errado mostraria
      a cobrança **para quem acabou de ler**. Tem teste próprio, com os dois casos de corrente
      igual e `readToday` diferente._
      _**⚠️ A GUARDA ANTI-CULPA NÃO FOI DESLIGADA — a isenção é nominal e PINADA.** Remover
      `streak`, `falta` e `perdeu` da lista (o que o texto da opção previa) entregaria o mesmo
      produto e desprotegeria **trinta telas** para liberar quatro frases. ⚠️ **E o docblock da
      própria guarda argumentava contra isenção por chave** — *"viraria uma lista de chaves que
      alguém amplia para calar o teste"*. A objeção foi **resolvida, não ignorada**: a lista é
      pinada por igualdade **exata**, então ampliá-la fica vermelho e quem ampliar tem de
      escrever no teste que está ampliando. Medido: cobrança plantada **fora** da isenção
      continua dando **1 acusador**, nomeando a chave e o termo._
      _**Cinco mutantes, com acusador cada:** hoje-não-quebra (**1**) · o futuro conta (**1**) ·
      cobrar quem está em zero, na tela (**1**) · cobrar quem já leu (**1**) · e o do lembrete,
      que passa a cobrar todo mundo (**6**)._
      _**⚠️ O §7.2 PEGOU O ORQUESTRADOR.** A primeira versão dos testes do UseCase assertava a
      ordem `[MARCOS, MARIA]` e ficou vermelha: o `findByClub` **não promete ordem** e o fake
      enumera invertido **de propósito**, justamente para derrubar quem depender dela. O teste
      estava errado, não o código — a resposta é indexada por `userId`, sem promessa de ordem,
      e quem precisa de uma ordem na tela a escolhe._
      _**⚠️ E A QUARTA APARIÇÃO DA CLASSE "FALSO VERDE POR SUBSTRING":**
      `/clubs/c-casal/streaks` **contém** `/clubs/`, e o stub da home casa por fragmento com o
      primeiro vencedor. Sem pôr `/streaks` antes, a corrente receberia o corpo da **estante**,
      o Zod recusaria, e o foguinho sumiria da tela **com o teste verde**._
      _**O que a decisão 1 deixou de pé, e continua de pé:** a corrente é **calculada, nunca
      guardada** (`CLAUDE.md`), não há coluna nem job noturno; e o lembrete **continua não
      chegando para quem já leu** — cobrar quem leu seria absurdo em qualquer modelo._
      _**Gates:** 605/195/1918/777, typecheck, lint e prettier limpos, chunk **433.129 B**
      medido, integração **611**, e o banco provado **idêntico por consulta** — inclusive o
      `ReadingLog` que o dono criou testando o app. Nenhuma dependência nova._

- [x] **38d** — Só português: apagar o catálogo `en` e a maquinaria que só existe por causa
      dele. ⚠️ **FATIA GERADA PELA RESPOSTA DO DONO à pergunta 7 do MVP 1** (2026-09-17):
      *"só português — apagar o inglês"*. → `docs/ACEITE-MVP.md`, MVP 1, pergunta 7.
      _⚠️ **Ela é maior do que "apagar um arquivo", e a razão é a Tarefa 29a**: aquela fatia
      inteira existe para tirar o `en` do chunk de entrada por `import()`. Sem o `en`, viram
      código morto e saem junto: o `import()` e o `changeLocale` (`app/src/i18n.ts`), o
      `LanguagePicker` e o `persistLocale` (`App.tsx`), o `SUPPORTED_LOCALES`, o `isLocale` e o
      `FALLBACK_LOCALE`, a metade `en` dos testes de paridade/anti-culpa/`catalogs`, e o
      caminho de locale do `reminder-message.ts`, do `group-activity-message.ts` e do
      `Settings.locale`._
      _⚠️⚠️ **O PERIGO CONHECIDO, e ele é de service worker:** o `globIgnores: ['assets/en-*.js']`
      do `vite.config.ts` sai — e a guarda que o pina tem **cinco** propriedades. Tirar uma não
      pode derrubar as outras quatro, e é isso que a fatia tem de MEDIR uma a uma. O service
      worker é a única peça capaz de quebrar o que já está entregue._
      _**Ganho previsto:** ~11 KiB de precache, e a dívida dos **33 textos do editor** que só
      existem em português deixa de ser dívida (era a pergunta 6 do MVP 2). **A perda,
      registrada:** o segundo catálogo era a rede que pegava texto solto na tela._
      _**⚠️⚠️ O GANHO DE PRECACHE PREVISTO NÃO ACONTECEU, e o número certo é o medido: 1,60 KiB,
      não ~11.** Motivo, e ele é uma lição sobre ler a fatia anterior: o chunk do `en` **já
      estava fora do precache** desde a 29a — era exatamente para isso que o `globIgnores`
      existia. Apagar o catálogo devolve os **12.524 B** que **não** eram baixados no install
      (só por quem trocava de idioma) e **1.637 B** do chunk de entrada, que são os únicos que
      o precache sentia. Entradas: **16 → 16** (o `en` nunca esteve na lista)._
      _**⚠️ A PERDA, MEDIDA em vez de suposta:** a rede que o segundo catálogo era — *"se a
      frase não existe em dois lugares, ela não passou pelo `t()`"* — **nunca foi automatizada**.
      Um `<p>Resumo do mês do clube</p>` plantado no JSX da home dá **ZERO acusadores** em
      749 testes, e daria zero antes da fatia também: nenhum teste do repositório compara o que
      a tela renderiza com o conjunto de chaves do catálogo. Era uma rede de **revisão humana**
      (escrever a frase duas vezes incomodava), não de teste. O que sobrou no lugar: a varredura
      de FONTE de `packages/ui` (`no-hardcoded-ui-text.test.ts`, teto que só cai) e as varreduras
      de vocabulário do catálogo — e as duas continuam mordendo (1 acusador cada, medido com
      frase plantada no `pt.ts`)._
      _**⚠️⚠️ RODADA DE CORREÇÃO — 1 ALTO e 4 MÉDIOs, e o ALTO é a QUARTA aparição da classe
      "a guarda pina o TEXTO do config em vez do COMPORTAMENTO" (29a, 34b, 38, esta).** Ao
      apagar o teste `keeps the en catalog OUT of the service worker PRECACHE`, a fatia levou de
      carona a única linha que pinava o **chunk de entrada dentro do `sw.js`** — e o bloco de
      comentário que ficou no lugar afirmava um dono que não existia (a asserção do
      `push-handler` só olha `rootScripts`). Medido: `globIgnores: ['assets/**']` derruba o
      precache de **16 entradas / 898,33 KiB para 13 / 11,84 KiB** — o app deixa de abrir
      offline — com a suíte **33/33 verde, ZERO acusadores**. Consertado com asserção própria
      (`⚠️ precaches the FIRST LOAD, so an installed app opens offline`), que cobre o chunk de
      entrada **e o CSS** (sem ele o app abre em branco) e hoje dá **1 acusador**. Daí
      `749 → 750` no `app`._
      _**Os quatro MÉDIOs:** (1) o docblock do `i18n.test.ts` prometia acusador para o `lng` e
      para o `initReactI18next` — **medido, os dois dão ZERO** (o `fallbackLng` cobre um, o
      `<I18nextProvider>` cobre o outro), e só o `resources` tem dono (405 de 749); reescrito com
      os números, sem guarda nova; (2) `has only string leaves in pt` era varredura vazia (§7.4):
      com `leaves()` devolvendo `[]` passava — ganhou o par positivo e agora acusa; (3)
      `docs/NOTIFICACOES.md` ainda mandava RECRIAR o `globIgnores` do `en` e falava em quatro
      propriedades no `service-worker-config.test.ts` (são três) — riscado com data; (4)
      docblocks apontando para um `it.each` que não existe mais, e o `describe` do
      `anti-guilt.test.ts` no plural._

- [x] **38e** — O tema do dia na linha do feed. ⚠️ **FATIA GERADA PELA RESPOSTA DO DONO à
      pergunta 3 do MVP 3** (2026-09-17): *"quero o tema do dia na linha"*.
      → `docs/ACEITE-MVP.md`, MVP 3, pergunta 3.
      _⚠️ **O `ActivityEvent` NÃO carrega o título do dia** — ele tem `bookId` e `planItemId`.
      Duas saídas, e a spec escolhe **com medição**: (a) a tela resolve o título pelo
      `planItemId` que o evento já carrega; (b) a rota do feed devolve o título junto. As duas
      custam uma consulta a mais e nenhuma toca o modelo._
      _⚠️⚠️ **A terceira saída está RECUSADA POR ESCRITO desde a Tarefa 35**: denormalizar o
      título dentro do evento. O `ActivityEvent` é log imutável, e um título velho é uma tela
      que mente sobre o passado no dia em que o admin corrigir o plano._
      _**Ordem:** depois da **38d**, de propósito — com um catálogo só, esta fatia mexe em
      metade dos arquivos de texto._
      _✅ **ENTREGUE.** A spec escolheu a saída **(b)** — a rota devolve o título junto —, e a
      medição que decidiu foi a da Tarefa 35: a saída (a) seria o plano de **cada livro** do
      feed, N requisições no celular. O `activityEventResponseSchema` ganhou
      `planItemTitle: z.string().nullable()`; o `ListActivity` resolve o título **na leitura**,
      contra o plano atual, numa consulta só (`ReadingPlanItemFilter.ids`, com o `bookIds`
      mantido como segunda barreira de tenant). ⚠️ **A recusa da 35 continua inteira:** o
      `ActivityEvent` **não ganhou coluna** e não houve migration._

- [x] **38f** — O lembrete passa a sair sozinho: `node-cron` atrás de `NOTIFICATIONS_CRON=on`.
      ⚠️ **FATIA PEDIDA PELO DONO no fechamento do MVP 3** (2026-09-17), depois de ele
      configurar as chaves VAPID e conferir a notificação no aparelho. Ela fecha o **primeiro
      dos três buracos de ambiente** do MVP 3 (*"ninguém chama o lembrete"*, abaixo).
      → `docs/tasks/38f-cron-do-lembrete.md`.
      _⚠️⚠️ **O ADR 0006 RECUSOU `node-cron` por escrito, e esta fatia NÃO o emenda — ela é
      uma VARIANTE REGISTRADA nele.** Dos três argumentos da recusa, **dois caíram** quando o
      claim no banco foi entregue (Tarefa 37: com `ON CONFLICT DO NOTHING`, duas instâncias
      não duplicam e a idempotência não mora na memória do processo), e o terceiro (*"o
      agendamento morre com o processo"*) **continua valendo e foi aceito conscientemente**. O
      que a mantém sendo variante é a **chave de ambiente**: num deploy com duas instâncias
      ela fica desligada e o cron externo assume, **sem tocar uma linha de código**._
      _✅ **ENTREGUE.** `notifications/reminder-cron.ts` (o portão, a expressão de 5 em 5
      minutos, a rejeição que não derruba o processo e a guarda de uma passada por vez) não
      conhece `node-cron` nem Prisma — o agendamento é decidível em teste **sem relógio real**
      (§7.3). A única linha que amarra o `node-cron` é o `http/main.ts`, e a expressão é
      medida contra a biblioteca de verdade (`createTask` sem `start()`): ela casa os minutos
      múltiplos de 5 e **os mesmos instantes com ou sem `timezone`**, até em `Asia/Kathmandu`
      (UTC+05:45). ⚠️ **Desligado é o padrão**: só a string `on` liga. Sem migration._
      _⚠️⚠️ **RODADA DE CORREÇÃO (auditoria da 38f): a FIAÇÃO não tinha um acusador, e
      isso virou código.** Três mutações plantadas no `http/main.ts` deixavam os 1938 testes
      verdes — `cron.schedule` → `cron.createTask` (tarefa criada e **nunca iniciada**),
      `env: process.env` → `env: {}` (a chave no `.env` deixa de ser lida) e
      `vapidConfigured: vapid !== null` → `true` (a linha de boot mente) —, e as três dão o
      mesmo sintoma: **um lembrete que não chega**, com todo documento dizendo que o buraco
      fechou. A fiação saiu para `notifications/install-reminder-cron.ts`, com teste por
      comportamento (duplo de cron com `schedule` **e** `createTask` instrumentados, ambiente
      do processo e chaves VAPID efêmeras). Acusadores depois: **4 · 2 · 1**. Uma quarta
      mutação, achada nesta rodada, também sobrevivia — a passada montada com `vapid: null`
      apesar das chaves — e ganhou teste (**1** acusador)._
      _⚠️ **O QUE FICOU SEM GUARDA, medido e registrado de propósito:** dentro do
      `dispatch-pass.ts` continuam sem acusador a fiação do `windowMinutes` (mutante para `1`:
      **0 acusadores**), o mapeamento dos sete repositórios e a construção do `WebPushSender`
      — todos só decidíveis com uma passada de verdade, que exige banco. **Não emendei fatia
      para isso**; fica aqui como dívida nomeada. O `windowMinutesFromEnv` em si é testado no
      `dispatch-script.test.ts`; o que falta é o fio, não a peça._

- [x] **38g** — Um campo de texto no acervo do livro. ⚠️ **FATIA GERADA PELA RESPOSTA DO DONO
      à pergunta 3 do MVP 2** (2026-09-18). → `docs/ACEITE-MVP.md`, MVP 2, pergunta 3.
      _⚠️ **A frase de aceite do MVP 2 promete "em qualquer listagem eu filtro… por texto", e
      isso NUNCA foi verdade:** o acervo filtra por pessoa/tipo/leitura/cor **sem texto**, e a
      busca filtra por texto no clube inteiro **sem os outros quatro**. As duas metades nunca
      coexistiram, e a auditoria da Tarefa 29 foi quem nomeou isso._
      _✅ **É a mais barata das três desta rodada, e já está medido:** o filtro `text` existe em
      **todas** as camadas dos **dois** recursos — port, fake, UseCase, repositório Prisma,
      borda e integração. Falta o campo na tela, e o `filter-bar.tsx` do `ui` já é o lugar._
      _⚠️ **O que a fatia não pode mudar:** o acervo recorta no **cliente** o que já carregou
      (decisão registrada da Tarefa 28 — é o que faz o toque no chip custar zero requisição).
      Nada de perguntar ao servidor a cada tecla._
      _⚠️ **Contador de linhas do `acervo.tsx`:** as três fatias desta rodada mexem na MESMA
      barra de filtro. Se passar de 400 pelo contador canônico, corta antes de crescer — é a
      lição nº 8 do MVP 1._
      _✅ **ENTREGUE (2026-09-18).** O acervo filtra pelas **cinco** dimensões em AND. O
      casamento é função pura (`matchesText`, em `acervo-entries.ts`), com unitário próprio
      escrito ANTES da tela; o campo é o `TextFilter` do `acervo-filters.tsx`. Contagens:
      **587** shared · **195** ui · **1943** backend · **777** app (+20: 15 unitários e 5 de
      tela). Chunk de entrada **432.726 B** (teto 450.000), precache 16 / 899,54 KiB._
      _DUAS CORREÇÕES AO QUE ESTAVA ESCRITO AQUI, as duas medidas:_
      _1. O **“já está medido, falta só o campo na tela”** estava CERTO sobre o fato e ERRADO
      sobre a razão: nenhuma daquelas camadas é usada aqui. O acervo **não pergunta ao
      servidor** — ele carrega as notas e os grifos do livro uma vez e recorta no cliente, e o
      `text` do backend é da `/busca`. A fatia continuou barata, por outro motivo._
      _2. O **“o `filter-bar.tsx` do `ui` já é o lugar”** não era: o `FilterBar` é agnóstico de
      dimensão e desenha GRUPOS DE CHIPS, um campo de texto não é um chip, e `packages/ui` não
      traduz (decisão B da Tarefa 13). O campo nasceu no `acervo-filters.tsx`, onde o
      vocabulário e a marcação dos outros quatro controles já moram — **zero linha nova em
      `packages/ui`**._
      _**O `acervo.tsx` NÃO cresceu: 511 antes, 511 depois**, pelo contador canônico. Os
      vizinhos absorveram a fatia (`acervo-filters.tsx` 165 → 194, `acervo-entries.ts` 120 →
      142), e o saldo da tela saiu de dois lugares: a escolha entre as TRÊS frases de vazio
      virou função pura, e o “Você × o nome” — que estava escrito DUAS vezes no arquivo, uma
      por metade da lista — virou o `authorLabel`, um dono só._

- [x] **38h** — A faixa de página no acervo (`p. 40–60`). ⚠️ **FATIA GERADA PELA RESPOSTA DO
      DONO à pergunta 4 do MVP 2, opção (c)** (2026-09-18).
      _✅ **O próprio código já tinha previsto esta extensão, por escrito.** O
      `HighlightRepository` diz: *"Sem faixa de página (`pageFrom`/`pageTo`): é aditiva e
      **ninguém pediu**"*. Agora pediram, e ela entra pela porta que o port deixou aberta._
      _⚠️ **`Highlight.page` é ANULÁVEL**, e o port já documenta a consequência: no Postgres
      `WHERE "page" = 45` contra `NULL` é **falso**. A faixa herda isso — **grifo sem página
      não entra em faixa nenhuma** —, e isso precisa de teste explícito nos DOIS lados
      (§7.1)._
      _⚠️ **As três armadilhas de `page` que o port já mediu valem para a faixa:** fração (o
      Prisma **trunca**), fora do int32 (o Prisma **lança** → 500), e o teto `.max(2147483647)`
      do Zod, que é o que defende a borda._
      _~~Port cresce + impl Prisma na **mesma unidade** (§6.9), fake acompanhando nos dois
      sentidos.~~ **CORRIGIDO ANTES DE EXECUTAR, e a correção ENCOLHEU a fatia: o backend NÃO
      foi tocado.** O `page` exato que já existe no port **não tem UM consumidor no app**
      (`grep` por `?page=` em `packages/app/src` e `packages/shared/src/client`: nada), e o
      acervo — a tela que pediu a faixa — recorta no CLIENTE desde a Tarefa 28. Crescer o port
      criaria um **segundo** filtro sem cliente, que é o erro que o `book.ts` já nomeia por
      escrito ("a `/writers` equivalente existe sem cliente nenhum desde a Tarefa 11"). ✅ E a
      frase do port ("é aditiva e ninguém pediu") **continua verdadeira**: quem pediu foi a
      tela, e a tela não passa por lá. **Nenhuma migration.**_
      _✅ **ENTREGUE (2026-09-18).** O acervo filtra pelas **seis** dimensões em AND. O
      casamento é função pura (`matchesPage`, em `acervo-entries.ts`), com unitário próprio
      escrito ANTES da tela; os dois campos são o `PageRangeFilter` do `acervo-filters.tsx`,
      e o controle inteiro SOME quando o tipo exclui grifo, pelo `typeCanIncludeHighlight` que
      já existia. Nota e grifo sem página **somem** da faixa (é o precedente da COR); faixa
      invertida devolve vazio, sem "consertar" a entrada. Contagens: **587** shared · **195**
      ui · **1943** backend · **799** app (+22: 16 unitários e 6 de tela). Chunk de entrada
      **433.794 B** (teto 450.000), precache 16 / 900,62 KiB._
      _**O `acervo.tsx` NÃO cresceu: 511 antes, 511 depois**, pelo contador canônico
      (`acervo-filters.tsx` 194 → 257, `acervo-entries.ts` 142 → 167). O saldo da tela saiu de
      um lugar só: o **"tentar de novo", que estava escrito TRÊS vezes ali** — um por carga que
      pode falhar —, virou o `retryButton`. É o `authorLabel` da 38g de novo: a dimensão nova
      se paga com uma repetição a menos._

- [x] **38i** — O grifo ganha o dia do plano (`planItemId?`). ⚠️ **FATIA GERADA PELA RESPOSTA
      DO DONO à pergunta 4 do MVP 2, opção (d)** (2026-09-18). ⚠️ **A ÚNICA DAS TRÊS COM
      MIGRATION.** → emenda de 2026-09-18 em `docs/adr/0004-grifo-entidade-propria.md`.
      _⚠️⚠️ **O ACEITE CITAVA O ADR ERRADO, e o erro estava lá desde que a pergunta foi
      escrita.** A opção (d) dizia *"o ADR 0004 já registra que o campo seria aditivo"* — e o
      ADR registra isso sobre **`noteId?`**, vínculo com a **anotação**, não com o dia do
      plano. ⚠️ **A diferença decide a coluna:** passar pela anotação quebraria o caso que o
      ADR protege por escrito — *"quero registrar um grifo num dia que não escrevi anotação
      nenhuma"* —, porque grifo em dia sem nota não teria `noteId` para carregar. A coluna é
      **`planItemId?`**, direta._
      _✅ **A decisão central do ADR 0004 sobrevive por um detalhe: o campo é OPCIONAL.** "O
      grifo não depende de um dia de leitura" continua verdade._
      _**Preenchimento automático e silencioso** (decisão do dono, perguntado): se existe item
      de plano para **hoje** naquele livro, o grifo nasce com ele. ⚠️ **Nenhum campo novo na
      tela** — o gesto continua de dois toques, que é o §1 do plano. E ⚠️ **"hoje" é o dia no
      `Settings.timezone` da pessoa**, por `localDay`, nunca a hora do servidor; o
      `planItemId` **não vem do corpo** (§6.3)._
      _⚠️ **Migration só via `prisma migrate dev --name <nome>`**, no executor desta fatia,
      **nunca SQL à mão** (`CLAUDE.md`). O banco é o de desenvolvimento do dono, com
      super-admin de seed — e o banco tem de ser **provado idêntico por consulta** depois._
      _✅ **ENTREGUE (2026-09-18).** Migration `20260918155532_highlight_plan_item`,
      gerada pelo Prisma (`prisma migrate dev --name highlight_plan_item`): duas linhas de SQL,
      `ADD COLUMN "planItemId" TEXT` mais a FK `ON DELETE RESTRICT`. ⚠️ **O banco do dono foi
      provado idêntico por consulta** — contagem das 13 tabelas e o CONTEÚDO inteiro de
      `User`/`Club`/`Membership`/`Book`/`ReadingPlanItem`/`Note`/`Highlight`/`ReadingLog`/
      `Settings`/`ActivityEvent` antes e depois: a ÚNICA diferença em todo o despejo é o
      `"planItemId": null` que apareceu no único grifo do dono, e ele continua idêntico depois
      da suíte de integração inteira._
      _O grifo nasce com o item do plano de **hoje no fuso da pessoa** quando existe um, e com
      `null` quando não existe — e é criado assim mesmo (decisão F). O `now` chega **injetado**
      de UMA leitura de relógio, e a resolução custa **uma** consulta de plano e **uma** de
      settings, provadas por contador (§7.3). `planItemId` no corpo é **400** pelo `.strict()`,
      testado com o ator legítimo (§7.5)._
      _⚠️⚠️ **A FATIA CRESCEU NUM PONTO QUE A SPEC NÃO PREVIU, e quem a obrigou foi um teste:**
      `Highlight.planItemId` é a **QUARTA FK `ON DELETE RESTRICT`** apontando para o
      `ReadingPlanItem`, e o `plan-item-fk-guards.test.ts` (Tarefa 34b) ficou **vermelho no
      mesmo commit da coluna**, nomeando `Highlight.planItem` e o método a escrever. Entraram
      o `planItemIdsWithAnyHighlight` (port + Prisma + fake, na MESMA unidade — §6.9) e a
      **quarta guarda** do `replacePlanItems`, POR ÚLTIMO para não roubar a mensagem das três
      que o admin já aprendeu. ✅ **É a primeira das quatro FKs que nasceu COM guarda** — as
      duas anteriores (32→32c, 34→34b) precisaram de fatia de conserto._
      _⚠️ **`onDelete: Restrict` EXPLÍCITO na relação opcional**, e não o `SetNull` que o Prisma
      daria por omissão. ✅ **Não é decisão nova: é a TERCEIRA aplicação de um padrão que já está
      duas vezes no mesmo schema** — `Note.planItem` e `ActivityEvent.planItem` são opcionais e
      já declaram `Restrict` explicitamente, e o `SetNull` faria o `Highlight` ser a única das
      quatro com regra diferente._
      _⚠️ **E o argumento contra o `SetNull` foi CORRIGIDO na rodada de auditoria, porque a
      retórica estava mais forte que a medição.** Ele dizia "é exatamente a tela mentindo sobre o
      passado": não é exatamente — a derivação recusada **remapeava** para o dia errado
      (mentira), o `SetNull` deixa **sem dia** (amnésia). O argumento que se sustenta é que o
      `null` resultante é **indistinguível do grifo legitimamente avulso**: depois do fato
      ninguém separa "nasceu sem dia" de "o admin apagou o dia", porque não há coluna, log nem
      evento que registre a diferença._
      _A dimensão de **leitura** do acervo passa a alcançar o grifo (decisão G): `readingOf`
      devolve o dia dele e `typeCanCarryReading` passou a ser escrito pela NEGATIVA — a
      única que nunca carrega dia é a **avulsa**. O grifo AVULSO continua sumindo
      quando se escolhe uma leitura, pela mesma fidelidade do §7.1._
      _Contagens: **590** shared (+3) · **195** ui · **1975** backend (+32) · **811** app (+12);
      integração **629** (+11). Chunk de entrada **433.828 B** (teto 450.000, folga 16.172),
      precache 16 / 900,65 KiB._
      _**O `acervo.tsx` NÃO cresceu: 511 antes, 511 depois**, pelo contador canônico
      (`acervo-filters.tsx` 257 → 257, `acervo-entries.ts` 167 → 169 — as duas linhas do
      `readingOf`, que deixou de ser um ternário de uma linha)._

## Definição de "MVP 3 pronto"

Eu marco que li o trecho de hoje e vejo onde eu e o clube estamos no livro. Recebo um
lembrete no horário que eu escolhi — e não recebo se eu já li. E quando ela lê, escreve ou
grifa, meu celular avisa e a atividade aparece no feed da home.

**Conferida frase por frase no fechamento** (o detalhe está em `ACEITE-MVP.md` §A.4).
⚠️ **A conferência é de `7aa764e`, ANTES das duas fatias que o dono pediu depois** (38b, o
botão de testar; e 38c, o foguinho). Só uma linha mudou de sentido, e ela está marcada:

| Pedaço | Estado |
| --- | --- |
| *"marco que li o trecho de hoje"* | ✅ ⚠️ **só o dia de hoje** — dia passado não se marca pela tela (pergunta 2) |
| *"vejo onde eu e o clube estamos no livro"* | ✅ ⚠️ **entregue duas vezes, e a segunda reverteu a primeira.** Primeiro como ~~**presença, não número**~~ (resposta do dono à pergunta 1, tornada estrutural: a rota da atividade não devolve contagem — **e isso continua verdade**); depois, a pedido dele, **também como número** — a corrente de dias, visível para o clube (Tarefa 38c, ADR 0010) |
| *"recebo um lembrete no horário que eu escolhi"* | ~~⚠️ **entregue, NÃO automático**~~ → ✅ **entregue e automático desde a Tarefa 38f** (2026-09-17), com `NOTIFICATIONS_CRON=on` no `.env` do backend. ⚠️ **Desligado é o padrão** — sem a chave, continua valendo a linha riscada |
| *"e não recebo se eu já li"* | ✅ |
| *"meu celular avisa"* | ⚠️ **entregue, com duas condições de ambiente** |
| *"a atividade aparece no feed da home"* | ✅ |

⚠️ **O QUE NÃO TEM DONO — eram três buracos entre a frase e a realidade, todos de AMBIENTE.
O nº 1 FECHOU na Tarefa 38f (2026-09-17); sobram DOIS.** A numeração fica como estava, e o
fechado fica riscado em vez de apagado: esta lista é histórica, e apagar faria a próxima
pessoa achar que o buraco nunca existiu.

1. ~~**Ninguém chama o lembrete.** Não existe cron instalado, e é decisão de desenho
   (`NOTIFICACOES.md` §6: não há agendador dentro do Fastify). Hoje o lembrete só sai se
   alguém rodar `notifications:dispatch`. Virar automático é instalar um cron externo a cada
   5–10 min na máquina do backend — **operação, não fatia**. É o maior dos três.~~
   ✅ **FECHADO pela Tarefa 38f** (2026-09-17): `NOTIFICATIONS_CRON=on` no `.env` do backend
   agenda a passada de 5 em 5 minutos **dentro do processo do Fastify** — a variante
   registrada do ADR 0006, que continua recusando o cron interno como *arquitetura* e o
   aceita como *variante de deploy*. ⚠️ **Continua sendo passo de ambiente**, só que de uma
   linha em vez de um cron de sistema: sem a chave, nada é agendado (é o padrão seguro, e
   com duas instâncias é o que se quer). Quem liga pela primeira vez é o dono.
2. ~~**Push no celular pela rede local não funciona** — contexto seguro, a mesma limitação
   que impede o PWA de instalar pelo IP. Exige `localhost` ou túnel HTTPS.~~
   ✅ **FECHADO pela medição do dono** (2026-09-18): *"push pela rede local também está ok"*.
   ⚠️ **E este é o único dos três que fechou sem ninguém escrever código nem explicar o
   porquê.** Contexto seguro é regra do navegador, não nossa; `http://<ip>` não é origem
   segura pela especificação. Alguma condição do ambiente dele difere do que o documento
   supunha, e **ninguém mediu qual** — a frase original era **previsão**, e ficou três MVPs
   no `COMO-TESTAR.md` com cara de fato. ⚠️ **Instalar como PWA pelo IP continua fora**: não
   foi medido junto, e é a mesma regra de navegador.
3. **As chaves VAPID não estão configuradas** por padrão, e nunca estarão — são segredo, e o
   `.env` não vai para o repositório. Sem elas a metade de notificação fica desligada, e **a
   tela diz isso** sem parecer erro. (⚠️ No `.env` **do dono** elas já estão, desde
   2026-09-17 — o buraco é de ambiente, e o ambiente dele deixou de tê-lo.)

⚠️⚠️ **OS TRÊS FECHARAM — e vale registrar COMO, porque os três caminhos foram
diferentes:** o nº 1 por **fatia** (a 38f, com auditoria e mutação); o nº 3 por **configuração
do dono** (as chaves VAPID no `.env` dele, que nunca vão ao repositório); e o nº 2 por
**medição que contradisse o documento**, sem código nenhum. Os passos continuam no
`COMO-TESTAR.md` (§6.6 e §6.7). Nenhum era dívida escondida — e o nº 2 mostra que um deles
nem era buraco.

---

# MVP 3.5 — Reestruturação da UI

> Nasceu de `docs/new-ui.md` (2026-09-19) e do canvas de design
> `https://claude.ai/artifact/YDHTxyof7ji1xqKhoocdDt` — 35 artboards: as 15 telas no tema
> claro, as mesmas 15 no escuro, e 5 em 1280 px mostrando o layout de duas colunas.
>
> A direção, em duas frases: **edição crítica** (no desktop a tela se parte em coluna de
> leitura de 680 px e margem de 320 px com o aparato; no celular a margem desce para o
> fluxo) e **caderno encadernado** (papel creme, serifa de leitura, filetes hairline em vez
> de cartão com sombra, rótulo de seção em monoespaçada maiúscula).
>
> ⚠️ **FORA DE ESCOPO, e isto vale para a seção inteira:** schema, endpoints, contratos de
> API, lógica de autosave, fila offline em IndexedDB, push e regras de permissão. Se uma
> fatia parecer exigir qualquer um deles, ela **para** e pergunta.

## Decisões fechadas do MVP 3.5 (não reabrir sem decisão do dono)

- **Os tokens adotam os nomes do canvas, sem prefixo** — `--bg`, `--surface`, `--accent`,
  `--pen-a`, `--gold-line`… O prefixo `--clube-*` morre, e com ele some um dos sete lugares
  onde o nome do projeto virava parte do estilo (`README-IA.md`, "Como renomear o projeto").
  ⚠️ **O `DANGER_STYLE` da varredura anti-culpa casa `--clube-danger` por regex.** Ele é
  **TROCADO, nunca apagado**: uma guarda que deixa de casar qualquer coisa continua verde e
  para de guardar, que é a pior das duas falhas possíveis.
- ⚠️ **Os cinco hexes do grifo NÃO mudam.** `HIGHLIGHT_COLORS`
  (`packages/shared/src/highlight-color.ts`) é **dado persistido**: `Highlight.color` é
  coluna, é filtro de rota (`?color=%23facc15`) e é índice (`@@index([bookId, color])`). O
  canvas define como a cor é **pintada** (`--pen-a`…`--pen-r` e os `-dot`), nunca o que é
  **guardado**. A tradução hex→token mora em `highlight-colors.tsx`, ao lado da hex→chave de
  i18n que já existe ali.
- **"Dia 11 de 30" entra por isenção nominal.** O `COUNTER_SHAPE` da varredura anti-culpa
  proíbe `\d+ de \d+`, e a posição no plano não é placar. A isenção é `COUNTER_EXEMPT_KEYS`,
  no modelo exato do `STREAK_KEYS` do ADR 0010: **pinada por igualdade exata**, com um teste
  companheiro provando que cada chave isenta existe mesmo no catálogo. Ampliá-la fica
  vermelho, e quem ampliar diz por escrito que está ampliando.
- ⚠️ **`pages.home.streak.atRisk` FICA, e isto contraria o §A.5.9 do `docs/new-ui.md`.** O
  documento manda remover "Você vai perder a sua sequência!"; o **ADR 0010** registra que o
  dono foi avisado de que a moldura de perda contraria o §1 do plano e **reafirmou o
  pedido**. A precedência do `README-IA.md` põe ADR acima de spec de tarefa, e o dono
  reconfirmou em 2026-09-19. A divergência fica escrita nos dois lugares.
- **A paleta de 6 cores de avatar morre**, e fica o par único `--person-bg`/`--person-border`
  /`--person-fg` do canvas. Quem carrega identidade é a **inicial**, não a cor — que é o que
  o `filter-bar.test.tsx` já cobra por escrito ("never lets the COLOUR be the only carrier of
  information"). O `avatar-contrast.test.ts` passa a medir **um** par, com o mesmo rigor WCAG
  de hoje, nos dois temas. ⚠️ **Executada na Tarefa 41a, não na 39**: `bg-avatar-1`…`-6` e
  `text-avatar-fg` são usados por `avatar-color.ts` e `person-avatar.tsx`, e
  `ui-source-scan.test.ts` exige CSS emitido para toda classe que `packages/ui` usa —
  matar os seis tokens antes do componente quebraria a guarda. Os seis sobrevivem à 39 com o
  valor de hoje, e são os únicos cujo valor não vem do canvas.
- **Um shell só, responsivo.** O corte de desktop é **≥1120 px**: padding lateral 92 px,
  coluna 680 px, gap 56 px, margem 320 px com `border-left` e `padding-left: 40px`. Abaixo
  disso, uma coluna com 20 px de padding e a margem descendo para o fluxo com o mesmo rótulo
  de seção. **Nunca** dois pacotes de front.
- **A barra de contexto é a única navegação de volta do app**, e nas telas de formulário ela
  também abriga a ação primária. Não nasce menu, não nasce nav inferior.
- **Nenhum valor hexadecimal fora do `theme.css`. Nenhuma string de interface fora do
  `pt.ts`.** Alvo de toque ≥ 44 px, foco sempre visível, contraste 4,5:1 (3:1 acima de
  24 px) nos dois temas, nenhum percentual/barra de progresso/placar, nenhuma rolagem
  horizontal em 360 px, `prefers-reduced-motion` desligando transição, e hover/pressionado
  mudando **cor** — sem `transform`, sem escala.

⚠️ **As specs continuam sendo detalhadas UMA DE CADA VEZ**, como manda o cabeçalho deste
arquivo. Só a 39 nasce escrita; as outras nove dizem `_a detalhar_` de propósito, porque o
recorte de cada uma depende do que a anterior entregou — a 46, por exemplo, depende de qual
API o `FilterBar` da 41 acabou expondo.

### Bloco J — Reestruturação da UI

- [x] **39** — **Tokens e fontes.** `theme.css` reescrito com os 42 tokens do canvas (nomes
      sem prefixo) mais os derivados que o código precisa (`--ring`, `--ring-halo`,
      `--accent-soft`, `--scrim`, as duas sombras, os quatro raios); `@theme inline`
      remapeado; ~~o `<link>` do Google Fonts~~ **as quatro famílias auto-hospedadas em
      `packages/app/public/fonts/`** (Fraunces · Instrument Serif · Geist · Geist Mono);
      `meta theme-color` e o `background_color` do manifest acompanhando o `--bg` claro.
      Todas as telas mudam de cor de uma vez, sem uma linha de JSX tocada.
      → `tasks/39-tokens-e-fontes.md`
      _⚠️ **O `<link>` ficou riscado em vez de reescrito** porque a decisão mudou **durante**
      a fatia: o §A.6 do `new-ui.md` pedia um `<link>` só, e o dono trocou por auto-hospedagem
      (2026-09-20) depois que a execução mediu que o Service Worker não precacheia rede de
      terceiro — ou seja, offline o PWA caía na fonte do sistema, que é exatamente o defeito
      que carregar fonte existe para não ter. ⚠️ E o `globPatterns` do `vite.config.ts` **não
      tinha `woff2`**: sem essa linha, auto-hospedar pagaria 277 KB para não resolver nada, e
      nada acusava, porque o `service-worker-config.test.ts` lê o TEXTO do config em vez do
      `sw.js` emitido. É a quinta aparição dessa classe (29a, 34b, 38, 38d, esta)._
      _Entregue: `theme.css` com 69 tokens — os **42** do canvas conferidos valor a valor
      **duas vezes, por executor e revisor independentes**, zero divergências —, `styles.css`
      com a bijeção token↔utilitário fechando nos dois sentidos, `editor.css` migrado (40
      `var(--…)`, nenhum órfão), `fonts.css` com 10 `.woff2` (277.576 B) no precache, e o anel
      de foco do §A.6 (contorno `--accent` + halo de 18%, com `FOCUS_RING` ganhando o primeiro
      acusador que ele já teve). **Testes: shared 590 · ui 201 · backend 1975 · app 855**
      (eram 590 · 195 · 1975 · 811). Chunk de entrada **433.876 B** (teto 450.000) · CSS
      27.239 B · `index.html` 1.638 B (era 4,22 kB) · precache 26 / 1176,07 KiB._
      _**Os dois números que justificam a fatia inteira.** (1) Apagar o ramo `--clube-danger`
      da guarda anti-culpa — em vez de trocá-lo pelo nome novo — passava por **816 testes sem
      um vermelho**: a guarda teria continuado verde e parado de guardar. (2) Inverter os dois
      lados do `--danger`, pondo o botão destrutivo a **1,20:1**, passava por **3.596**. Os
      dois têm acusador nomeado agora, e o segundo foi **remedido pelo orquestrador** depois
      da entrega (1 acusador: `theme-tokens.test.ts › keeps the danger ink ON the danger
      paper, in both themes`), com `cp -p`, `md5sum -c` e conferência por conteúdo._
      _⚠️ **A auditoria derrubou três afirmações do executor, e as três diziam "medido"** — a
      pior delas gravada no `theme.css`: *"o canvas pinta o anel de foco com `--gold`"*. O
      canvas **não desenha foco em lugar nenhum** (21 artboards, 18 `outline: none`, zero
      regras de foco); o dourado copiado era a bolinha da caneta selecionada na paleta de
      grifo. Sem a medição, a Tarefa 41 leria a frase e propagaria o erro. É a lição do
      `dayRange`, e é a razão de o revisor ser um agente separado._
- [x] **40** — **Catálogo e guardas.** As **17** chaves novas do §A.9 do `new-ui.md` em
      `pt.ts`, nos namespaces de cada tela (não na raiz) e com interpolação `{{…}}`. Mais o
      `COUNTER_EXEMPT_KEYS` com o pino de igualdade exata, o teste de existência, e a
      subtração **por frase exata** que faz "Dia 11 de 30" passar sem abrir buraco para um
      contador de verdade. → `tasks/40-catalogo-e-guardas.md`
      _⚠️ **São 17 e não as 21 que o §A.9 lista**, medido chave a chave no catálogo:
      `archiveAction` e `excerptAsInBook` **já existem** (`archive.confirm` e
      `fields.quoteHint`) e são reusadas; `keepAsIs` é **troca de valor** em duas
      `archive.cancel`, não chave nova; e `searchResultCount` **fica de fora**, porque
      `busca.test.tsx` tem decisão de produto registrada contra contagem de resultado em
      qualquer estado — pergunta aberta para o dono, registrada no `new-ui.md`._
      _Entregue: **20 folhas** no `pt.ts` para as 17 chaves (o `savedAt` e o `archivePreview`
      vivem em dois namespaces cada, e `days` tem par de plural), os dois `archive.cancel`
      dizendo "Deixar como está", e a isenção do contador inteira: `COUNTER_EXEMPT_KEYS`
      pinada por igualdade exata, o teste de existência das chaves, e a subtração por **frase
      exata interpolada** — o literal casa caractere por caractere e só o buraco aceita
      dígito. **Testes: shared 598 · app 861** (eram 590 · 855). Chunk de entrada **434.525 B**
      (era 433.876; **+649 B**, o preço de o catálogo embarcar — teto 450.000, sobram 15.475) ·
      CSS 27.239 B e `index.html` 1.638 B inalterados · precache 26 / 1176,71 KiB._
      _**O número que justifica a fatia:** trocar a subtração exata por
      `replace(/\d+ de \d+/g, '')` — o atalho óbvio — isentaria TODO contador do app, e a
      guarda seguiria verde no relatório. Medido: **2 acusadores**, os casos (b) e (c) do par
      positivo novo. Sem eles o atalho passaria em 861 testes. Seis mutantes aplicados, cada um
      com `md5sum`/`cp -p` próprio e conferência por leitura; todos acusados._
      _⚠️ **Quatro correções de spec, medidas:** (1) `pages.highlightForm.save.draft` é
      impossível — `save` já existe e é uma STRING lida pela tela, então a chave entrou como
      `draftSaved`, plana, que é a forma que aquele formulário já usa; (2) o par de plural é
      **um**, não "duas delas", e o catálogo **já tinha dois** pares antes desta fatia (a
      decisão G diz que estes seriam os únicos); (3) a exigência de "≥ 1 subtração" não cabe
      dentro do `expectNoGuilt()` — pela decisão H nenhuma tela renderiza a frase ainda, e ela
      deixaria as **247** chamadas de `expectNoGuilt()` vermelhas de uma vez, então virou a
      variante `expectNoGuiltWithPlanPosition()`; (4) o "editor 452.818 B" da regra 9 está numa
      unidade diferente das outras três linhas — o arquivo tem 453.606 B pelo `ls` e não mudou.
      Detalhe em `tasks/40-*.md`, "Notas de reconciliação"._
      _⚠️ **A auditoria voltou com 1 bloqueador, 5 altos, 5 médios e 4 baixos, e derrubou
      QUATRO afirmações do executor rotuladas "medido" — uma delas já copiada para esta linha
      do `BACKLOG.md`.** (a) `855 chamadas` eram **247** (`855` é a contagem de TESTES do app);
      (b) `quinze asserções` eram **14**; (c) *"a exceção nova cita as chaves que existem"* era
      falso — ela se apoiava em `editor.placeholder`, uma chave **fantasma** que também estava
      num arquivo de **produção** (`RichEditor.tsx`, docblock de prop) e que o `EDITOR.md` §10
      citava desde a Tarefa 14; (d) *"logo a unidade da lista é byte"* era inferência, não
      medição. **O bloqueador:** os dois docblocks de `guilt-terms.ts` ficaram empilhados, e
      `STREAK_KEYS` — a isenção do ADR 0010 — ficou **sem justificativa nenhuma ao lado**;
      consertado invertendo a ordem das declarações, com guarda nova (`keeps each exempt list
      glued to ITS docblock`), porque nada acusava. **E a auditoria também errou um ponto,
      medido:** o `(?!\d)` que ela pediu para o `\d+` guloso **não muda casamento nenhum** —
      as quatro variantes casam `Dia 11 de 303` igual —, então o padrão ficou como estava e o
      buraco foi fechado por outro lado (caso (b) no mesmo elemento + pino da linha por
      elemento do `readableText()`). **Testes: shared 601 · ui 201 · backend 1975 · app 865**
      (eram 598 · 201 · 1975 · 861 na entrega, e 590 · 201 · 1975 · 855 antes da fatia)._
      _**Os dois números que justificam a rodada de auditoria.** (1) A regex larga dentro de
      `expectNoGuiltInHtml` **ou** de `expectNoGuiltBesidesFormError` — a varredura de todo
      estado de campo inválido e a do primeiro frame — passava por **861 testes sem um
      vermelho**: o par positivo cobria só duas das quatro funções. (2) A guarda "não cresça uma
      gêmea" deixava passar três folhas novas com valores desta própria fatia, **0 acusadores em
      1.459 testes**; ela pinava duas strings e a propriedade que invocava já era falsa **28
      vezes**. Trocada pelo mapa completo dos 28 grupos — e, olhando um a um, `Alguém do clube`
      (×3) é **defeito**, não convenção: é um conceito com três chaves, e quem o resolve é a
      Tarefa 42._
- [x] **41a** — **Os primitivos sobre os tokens.** `Button` (a variante `seal` nasce, a
      `danger` morre), `Field` (sem caixa), `List`/`ListItem` (variante `sumario`),
      `FilterBar`/`FilterChip` (`collapsed`/`onRefine`, aditivos), `PersonAvatar` (a decisão
      F: a paleta de 6 cores morre), `Sheet` (o raio de 10 px do canvas, via `--r-4` novo).
      Nenhuma tela é tocada. → `tasks/41a-primitivos-sobre-os-tokens.md`
      _⚠️ **A entrada 41 foi PARTIDA em duas, e a medição que decidiu:** os primitivos desta
      fatia têm **69 `it()`** em 9 arquivos de teste (button 10 · field 7 · list 9 ·
      filter-bar 7 · filter-chip 3 · sheet 11 · person-avatar 17 · styles 3 ·
      avatar-contrast 2), e a entrada mandava criar **outros 11** componentes na mesma fatia
      (`ReadingColumn` e `MarginRail` são dois). Uma fatia desse tamanho não é auditável — o
      revisor perde o fio e um "zero acusadores" passa a valer pouco. As duas metades deixam o
      app funcionando._
      _⚠️ **E uma correção que ENCOLHE a fatia:** o §A.8 do `new-ui.md` e o plano da Fase A
      mandavam o `Button` passar a ter `'primary' | 'secondary' | 'seal'`. **Medido:**
      `variant="ghost"` tem **29 usos em 15 telas** e ele **já é** o secundário do canvas
      (borda `--border`, sem preenchimento) — renomear tocaria 29 lugares e faria desta fatia
      o redesign inteiro; e `variant="danger"` tem **zero** consumidores (a única ocorrência é
      a declaração do tipo, conferida com aspas duplas, simples e ternário). ⚠️ **Não confundir
      com os utilitários `text-danger`/`border-danger`**, que o erro de formulário de sete
      telas usa e de que a guarda `DANGER_STYLE` depende — esses ficam. Logo: `ghost` mantém o
      nome, `danger` morre, `seal` nasce, zero tela tocada._
      _Entregue: os sete primitivos reescritos sobre os tokens, **zero arquivo de
      `packages/app/src/pages/` no diff** (provado por `mtime`: os 49 arquivos de
      `pages/` têm o mesmo `mtime` do início da fatia). `Button` com `seal`
      (`--gold-soft`/`--gold-line`/`--gold-strong` + glifo `Check` do lucide) e sem
      `danger`; `Field` com rótulo mono maiúsculo e dica ABAIXO do controle;
      `ListItem` com `variant="sumario"` (pontinhos `--leader`, data/página em mono,
      `tone="today"`/`"future"`); `FilterChip` como pílula sobre `--surface-2`;
      `FilterBar` com `collapsed`/`onRefine`/`refineLabel` numa união discriminada;
      `PersonAvatar` sobre o par `--person-*` (a paleta de 6 cores morreu:
      `avatar-color.ts` apagado, 4 exports fora do barril, 7 tokens e 7 utilitários
      fora); `Sheet` com o raio de 10px via `--r-4` e a alça de 36×4.
      **Testes: shared 601 · ui 213 · backend 1975 · app 865** (ui era 201; 212 na
      primeira entrega, e o 213º nasceu na rodada de auditoria, pinando o papel do sheet).
      Chunk de entrada **436.546 B** (era 434.525; **+2.021 B**, o preço de dois
      ícones novos do lucide — `Check` e `ListFilter` — mais os ramos novos, menos o
      hash FNV-1a apagado; teto 450.000, sobram 13.454) · CSS **29.095 B** (era
      27.239; **+1.856 B**: entram as classes de ouro, de pessoa, do sumário e as
      três de `tracking-[...]`, e saem as sete de avatar) · `index.html` 1.638 B e
      editor 453.606 B **inalterados** · precache 26 / **1180,49 KiB** (era 1176,71;
      +3,78 KiB = exatamente o CSS + o chunk)._
      _**Os números que justificam a fatia — e o primeiro foi CORRIGIDO na auditoria,
      porque eu tinha subvendido a minha própria guarda.** (1) A ressurreição do
      `danger` tem **duas formas, e as duas têm acusador**: devolvê-lo **só ao tipo**
      não compila (`TS2741: Property 'danger' is missing`) e nenhum teste roda
      diferente — eu apliquei essa e concluí "só o `tsc` acusa"; o revisor aplicou a
      **realista** (tipo **e** tabela, que é o que alguém escreveria de verdade) e aí o
      `tsc` **passa** e o runtime dá **2 acusadores**, um deles o
      `offers exactly the three variants the canvas draws` desta fatia. **Existe pino
      em runtime das três variantes; não é buraco.** ⚠️ E a frase "o `typecheck` é
      gate" também foi medida e abrandada: **não há CI (`.github/` não existe) nem
      hook (`.husky/` não existe)** neste repositório — o `typecheck` é gate por
      disciplina de PROCESSO, e um mutante que só o `tsc` pega depende de alguém
      rodá-lo. (2) `--person-fg` igual a `--person-bg` — a inicial invisível — passa
      nos **865 testes do app** e só acusa em `@clube/ui`: 2 acusadores, os dois temas
      de `avatar-contrast.test.ts`. **Sete mutantes** aplicados entre as duas rodadas,
      cada um com `md5sum`/`cp -p` próprio e confirmação por leitura; todos acusados._
      _⚠️ **Três números desta própria entrada caíram na medição**, e ficam
      corrigidos aqui em vez de apagados: (a) são **68** `it()` e não 69 —
      `field.test.tsx` tem **6**, não 7 (`grep -c "^\s*it("` e a contagem do próprio
      vitest); os outros oito arquivos batem; (b) `variant="ghost"` tem 29 usos em
      **12** arquivos, não 15 (`grep -rln`), todos em `pages/` e nenhum de teste;
      (c) a decisão I falava de "`--radius-sheet` passa a apontar para `--r-4`" sem
      dizer que isso **órfão o `--r-3`** — a bijeção token↔utilitário é um para um,
      então `--radius-control` foi para `--r-3` (4px, que é o que o canvas desenha
      em botão e campo: 32 ocorrências) e o 3px do `--r-2` virou
      `--radius-callout` (a caixa de erro, `Main.dc.html:41`). Sem isso
      `theme-tokens.test.ts` fica vermelho._
      _⚠️ **A AUDITORIA VOLTOU COM 1 BLOQUEADOR, 3 ALTOS, 4 MÉDIOS E 7 BAIXOS, e
      derrubou OITO afirmações minhas — cinco rotuladas "medido".** A lista inteira,
      com a classe de erro de cada uma, está na nota nº 11 de `tasks/41a-*.md`. **O
      bloqueador:** a justificativa técnica que eu registrei para o `Field` ter saído
      pela metade era **falsa nos dois erros que ela continha** — eu escrevi que a
      variante `[&_input]:border-b` "ganha por especificidade (0,2,1 contra 0,1,0)" e
      "atropelaria o `aria-invalid:border-danger`". **O revisor compilou o Tailwind do
      próprio repositório** (`@tailwindcss/node@4.3.3`) e a saída diz o contrário: o
      descendente é `.classe input` = **(0,1,1)** e o utilitário é
      `.classe[aria-invalid="true"]` = **(0,2,0)**, ou seja a borda de erro **ganharia**
      — e não há briga nenhuma, porque `border-width`/`border-style` e `border-color`
      são longhands diferentes e **compõem**. Era bloqueador por ser arquivo permanente:
      a Tarefa 47 leria "não faça isso" e evitaria a saída CERTA por um motivo
      inexistente (a lição do `dayRange`). A decisão de adiar continua de pé — pela
      decisão K sozinha, e pelo acoplamento (o `[&_input]` não pega o `<textarea>` de
      `highlight-fields.tsx:189`)._
      _**E os três ALTOS, porque os três eram medição errada, não gosto:** (a) eu repintei
      o `FilterChip` citando `Acervo.dc.html:63,65` — medido, `:63` é um **contêiner** e
      `:65` é um `<span>` **não interativo** (o chip removível, componente da Tarefa 46).
      O `FilterChip` de verdade está em `CorrigirGrifo.dc.html:59-63` e
      `NovoGrifo.dc.html:60-64`, na paleta de canetas que `highlight-fields.tsx:138`
      renderiza, e lá o repouso é `background:none` + `color:var(--text-muted)` —
      **exatamente o que eu apaguei**. Revertido, com o teste reescrito na direção certa;
      (b) "o canvas desenha quatro alvos abaixo dos 44px" é falso nas duas pontas: o
      canvas tem **dezenas** (38px ×6, 34px ×6, 32px ×3… contra 44px ×91), e o chip da
      linha 1 da minha tabela tem **44px** no canvas — são **três** alvos desta fatia, e
      a divergência do chip não existia; (c) a correção do "15 telas" ficou nos
      documentos e **não chegou ao docblock de produção** do `button.tsx`, que é o texto
      que o próximo agente lê primeiro._
      _✅ **E AS DUAS PERGUNTAS EM ABERTO VOLTARAM DECIDIDAS (2026-09-21):** (1) o dia
      futuro do sumário **fica em `text-subtle`** — os três cinzas não cabem todos acima
      de 4,5:1, e `--text-faint` fica sem consumidor com a guarda do primeiro uso ativa;
      (2) o papel do bottom sheet **passa a ser `--surface`**, como o canvas desenha — e
      ⚠️ **o meu medo era o oposto da verdade, medido pelo dono:** `--text-subtle` dá
      **4,93:1** sobre `--surface` contra **4,54:1** sobre `--surface-2`, ou seja a troca
      MELHORA o pior caso da Tarefa 39 em vez de invalidá-lo. `--surface-2` mantém
      consumidor (`home.tsx:436`)._
      _⚠️ **Uma divergência canvas × projeto, NÃO resolvida por conta própria:**
      o canvas desenha a pílula "Refinar" com 36px, o selo do desktop com 40px e a linha
      do sumário com ~36–38px — **os três abaixo dos 44px da decisão F**, e o piso venceu
      nos três. Custo declarado: ~6px por linha de sumário, ~180px num plano de 30 dias.
      Ficam abertos para o dono os **quatro** arredondamentos de corpo de texto (13px do
      chip e da pílula, 14,5px do título do sumário e 11,5px da dica do campo — nenhum
      existe na escala de sete degraus da Tarefa 39) e o filete do avatar, que dá 1,36–1,48:1
      contra as superfícies no claro. Detalhe em `tasks/41a-*.md`, "Notas de
      reconciliação" (11 notas)._
- [x] **41b** — **Os nove componentes que nascem.** `Eyebrow`, `RuleDouble`, `ContextBar`,
      `ReadingColumn` + `MarginRail`, `BookSpine` (3 tamanhos: 42×60, 58×84, 88×128),
      `PresenceMark`, ~~`SumarioItem`~~, `StreakSeal`, `GrifoText` (`background` +
      `box-shadow` da mesma caneta, para a marca alargar além da caixa), `SaveIndicator`.
      Todos recebem texto por prop; nenhum consome catálogo. Nenhuma tela é tocada.
      → `tasks/41b-os-componentes-que-nascem.md`
      _⚠️ **O `SumarioItem` saiu da lista, e a medição que o tirou:** ele **já nasceu na 41a**,
      como `ListItem variant="sumario"` (`packages/ui/src/components/list.tsx:66,192-194`), e
      já renderiza a linha inteira do plano — a coluna de marcas (`data-sumario-marks`), o
      condutor pontilhado (`data-sumario-leader`), a meta em mono à direita, e os tons `today`
      e `future` com o papel e o filete de ouro. Criá-lo agora seria **um segundo nome para a
      mesma coisa** — o defeito que este repositório já pagou três vezes: o `GUILT_TERMS` em
      duas cópias até a Tarefa 19, o `dayRange` que o `CLAUDE.md` registra, e o
      `'Alguém do clube'` em três chaves que a Tarefa 40 achou. São **nove**._
      _Entregue: os dez nomes nascidos em nove arquivos (`ReadingColumn` e `MarginRail`
      dividem `reading-column.tsx`, porque o filete que os separa é propriedade da dupla),
      todos no barril, **zero arquivo de `packages/app/src/pages/` no diff** (provado por
      `mtime`: os 49 arquivos de `pages/` têm o mesmo `mtime` do início da fatia).
      `Eyebrow` com as duas tintas; `RuleDouble` com a inversão de ORDEM (não de cor);
      `ContextBar` nas três formas, com `renderLink` para o PWA não recarregar;
      `ReadingColumn`+`MarginRail` com o corte ≥1120px por media query e nada mais;
      `BookSpine` nos três tamanhos e nas duas paletas; `PresenceMark` nos três estados,
      com o terceiro sendo ausência de verdade; `StreakSeal` com número e nome em texto;
      `GrifoText` com a caneta por CHAVE e mapa literal; `SaveIndicator` sem região viva.
      **Testes: shared 601 · ui 284 · backend 1975 · app 866** (ui era 213, app 865).
      Chunk de
      entrada **436.557 B** — **idêntico**, porque nada consome os dez ainda e o Rollup os
      poda; CSS **32.891 B** (era 29.166; **+3.725 B**, que é onde a fatia inteira custou,
      porque o `@source` do Tailwind varre `ui/src` independentemente do grafo de imports) ·
      `index.html` 1.638 B e editor 453.606 B inalterados · precache 26 / 1184,42 KiB._
      _⚠️ **O NÚMERO QUE A TAREFA 42 PRECISA TER NA MÃO, e ele só aparece com um
      consumidor.** O chunk não subiu porque nada importa os dez e o Rollup os poda —
      medido plantando uma sonda que consome os dez e ligando-a ao `App.tsx`: a entrada
      vai de **436.557** para **442.023 B**, ou seja **+5.466 B de uma vez** (o número
      inclui a sonda, então ele é um TETO), deixando **7.977 B** de folga até os 450.000.
      A sonda foi desfeita por `cp -p` com `md5sum -c` OK. **As Tarefas 42 a 48 gastam
      essa folga**, e é a 42 que paga a primeira parcela._
      _**O número que justifica a fatia:** montar o mapa caneta→classe em runtime
      (`` `bg-pen-${key}` ``) — o atalho óbvio — apaga as **dez** regras `.bg-pen-*` e
      `.ring-pen-*` do CSS compilado (medido: CSS cai de 32.891 para 32.486 B, e o grifo
      fica sem cor nenhuma na tela) e **`ui-source-scan.test.ts` NÃO acusa** — 10/10 verde,
      medido, porque os dois extratores dele casam aspas simples e duplas e um template
      literal fica entre crases. O acusador teve de nascer: `grifo-text.test.tsx › writes
      the pen→class map as LITERALS`, que lê o próprio fonte. Treze mutantes aplicados,
      cada um com `md5sum`/`cp -p` próprio e conferência por leitura; todos acusados._
      _⚠️ **Três divergências canvas × entrega, medidas:** (1) o canvas pinta o rótulo de
      seção dourado com `--gold`, que no claro dá **4,16:1** contra `--bg` (piso 4,5:1 a
      10px) — entregue com `--gold-strong` (5,79 / 6,00 / 5,53), que é o dourado que o
      PRÓPRIO canvas usa quando o ouro carrega texto; (2) a barra de contexto sem ação tem
      **38px** no canvas e o link dentro dela ocupa a faixa toda — o piso de 44px da decisão
      F venceu, por padrão vertical no LINK, e a faixa fica 44px (custo: 6px); (3) ~~o selo
      da corrente é desenhado com um MARCADOR DE LIVRO no canvas, e foi entregue com o
      `Flame` do lucide, que é o que a regra 8 nomeia~~ — **REVERTIDO na auditoria: o selo
      passou a `Bookmark`, e quem estava errada era a spec** (veja o parágrafo abaixo). A
      divergência (3) deixou de existir; sobraram duas, e as duas continuam de pé._
      _⚠️ **A auditoria voltou com 1 alto, 5 médios e 7 baixos, e derrubou SETE afirmações
      do executor — três rotuladas "medido"/"medidas".** As duas classes que se repetem são
      as que a 41a já tinha nomeado: **generalização de amostra** ("os cinco artboards
      concordam" — são **quatro**: `InicioDesktop.dc.html:35` usa `padding:48px`; "os quatro
      artboards concordam … 9,5px" — são **três**, o desktop usa 10px; "em todas a ação é
      `--accent`" — `DiaDesktop.dc.html:40` é **contorno dourado**) e **correção incompleta**
      (o 48px e o 10px já estavam MEDIDOS CERTOS nos arquivos de teste e ERRADOS nos de
      produção, que é o primeiro que o próximo agente lê)._
      _**As duas decisões do dono na rodada.** (1) **`--gold` ganhou guarda de primeiro uso
      para TEXTO** (`theme-tokens.test.ts › refuses the FIRST USE of text-gold`), no molde
      da do `text-faint`: ela fica vermelha quando a primeira tela pintar texto com
      `text-gold` e manda usar `text-gold-strong`. ⚠️ Ela **não proíbe o token** — como
      traço e filete `--gold` passa (piso de 3:1), e a distinção virou ESTRUTURAL: o glifo
      do `StreakSeal` passou a `stroke-gold`, que só afeta SVG. (2) **O `StreakSeal` trocou
      `Flame` por `Bookmark`** — o canvas desenha um marcador (`Inicio.dc.html:98`), a regra
      8 da spec nomeava `Flame` por engano do orquestrador, e o argumento de produto fecha
      sozinho: a chama é a metáfora de PERDA do Duolingo e o marcador é PRESENÇA, que é o
      §1 do plano. O ADR 0010 não reabre (ele nomeia o mecanismo, não o glifo);
      `pages/streak-bar.tsx` troca na Tarefa 45._
      _**O buraco de guarda que a rodada fechou, e ele é de DIREÇÃO:**
      `emits every class packages/ui uses` é **unidirecional** — prova que toda classe
      escrita virou CSS, nunca que uma classe deixou de ser escrita; quando a lista encolhe,
      ele fica verde. Nasceu
      `ui-source-scan.test.ts › ships the CSS of every map assembled from a key`, que exige
      no CSS COMPILADO os seletores dos mapas por chave (`GrifoText`, `BookSpine`,
      `PresenceMark`, `StreakSeal`). Medido: o mutante que monta o mapa do **`BookSpine`** em
      runtime passava por **284 testes de `@clube/ui` sem um vermelho** e some com 5 dos 6
      seletores de paleta do CSS — ele **não tinha acusador nenhum** antes desta guarda._
- [x] **42** — **O shell.** Cabeçalho 52/56 px, barra de contexto 38/46 px, as duas colunas
      e o filete duplo de abertura; `pages/chrome.tsx` vira o cromo novo. ⚠️ Inclui
      **resolver o nome do autor** na tela do dia e na avulsa: elas dizem "Alguém do clube"
      desde a Tarefa 18, com um comentário de catálogo que afirma não haver rota de membros —
      `GET /clubs/:clubId/members` existe desde a 26a e **seis** telas já o usam.
      → `tasks/42-o-shell.md`
      _⚠️ **ORÇAMENTO: sobram 7.977 B no chunk de entrada, e esta fatia paga a primeira
      parcela.** Medido na auditoria da 41b: os dez componentes daquela fatia não custam nada
      hoje (o Rollup os poda por falta de consumidor), e **no instante em que a primeira tela
      os importa a entrada sobe +5.466 B de uma vez**, de 436.557 para 442.023 B, contra o
      teto de 450.000 que é decisão do dono. Meça o chunk ANTES de fechar a fatia; se passar,
      pare e reporte._
      _⚠️ ~~**E a home compensa o recuo de topo da coluna:** … a home passa
      `min-[1120px]:pt-12` pelo `className`.~~ **A COMPENSAÇÃO NUNCA EXISTIU, e esta linha a
      descrevia como se existisse — corrigida na auditoria da 42 (2026-09-21).** Medido:
      `grep -rn "pt-12" packages/*/src/` devolve **só prosa**, e o `ScreenProps` **não tem
      `className`** — ela não era possível sem mexer no `Screen`. **Decisão:** fica `pt-10`
      (40px) em todas as telas, e os 8px de `InicioDesktop.dc.html:35` viram **divergência
      declarada**: um `className` no `Screen` é escotilha genérica (qualquer tela
      sobrescrevendo qualquer classe do cromo) e uma prop para UM chamador é o "peso" que a
      decisão B da 41a proíbe. A home é a tela da **Tarefa 45** — é lá que os 48px entram, se
      o dono quiser._
      _Entregue: cabeçalho **52px / 56px** (`h-13` + `min-[1120px]:h-14`, recuo `px-5` /
      `min-[1120px]:px-10`, papel `--surface`, filete `--border`) com o nome do app em
      Fraunces e o nome do clube em mono ao lado; `Screen` sobre o `ReadingColumn` (coluna
      de 680px + margem de 320px acima de 1120px, uma coluna com 20px abaixo) com o `h1` na
      tipografia do canvas e o **filete duplo** logo abaixo dele, nas **três** formas que o
      canvas desenha (`top` padrão, `bottom` nas telas de escrita, `none` nas três em que
      o canvas não tem filete); `rail` como prop **sem nenhuma tela passando** (decisão C),
      com o caso vazio testado; `ScreenContextBar`, o invólucro que injeta o `Link` do
      roteador na `ContextBar` (decisão D). **E o nome do autor resolvido nas DUAS telas**
      que diziam "Alguém do clube" — `day-note.tsx` e `free-note.tsx` —, pelo mesmo
      `club-names.ts` das outras seis, com o `PersonAvatar` recebendo **o mesmo nome** que
      o texto mostra.
      **Testes: shared 601 · ui 284 · backend 1975 · app 898** (app era 868; +30).
      Chunk de entrada **438.586 B** (era 436.557; **+2.029 B** — teto 450.000, sobram
      **11.414**) · CSS **33.982 B** (era 33.106; +876) · `index.html` 1.638 B e editor
      453.606 B **inalterados** · precache 26 / **1187,26 KiB** (era 1184,42)._
      _⚠️ **O ORÇAMENTO CUSTOU UM TERÇO DO PREVISTO, e a 43 recebe OITO componentes por
      pagar, não seis.** A primeira entrega desta fatia escreveu "esta consome **quatro**
      (`ContextBar`, `ReadingColumn`, `MarginRail`, `RuleDouble`)"; **medido por
      enumeração de marcadores no chunk emitido**, são **DOIS**: `min-[1120px]:w-[680px]`
      (`ReadingColumn`) e `gap-[3px]` (`RuleDouble`) aparecem, e
      `min-[1120px]:pl-10` (`MarginRail`) e `rounded-callout px-4` (o botão de ação da
      `ContextBar`) **não** — o `MarginRail` nem é importado pelo `chrome.tsx`, e o
      `ScreenContextBar` é **exportado e nunca importado por tela nenhuma**, então o Rollup
      poda os dois. A sonda da 41b consumia os **dez** de uma vez (+5.466 B) e era um TETO,
      como ela mesma dizia; dois deles custaram **+2.029 B**. **Sobram oito por pagar** —
      `ContextBar` (que arrasta o `ChevronLeft` do lucide junto), `MarginRail`,
      `Eyebrow`, `BookSpine`, `PresenceMark`, `StreakSeal`, `GrifoText` e
      `SaveIndicator` —, dentro dos **11.414 B** que sobraram._
      _⚠️ **E o CSS e o JS medem CONJUNTOS DIFERENTES, o que é fácil de confundir ao ler os
      dois números lado a lado:** o `@source '../../ui/src'` faz o Tailwind varrer
      `packages/ui` inteiro **independentemente do grafo de imports**, então as classes dos
      dez componentes já estão no CSS desde a 41b (foi lá que ele subiu +3.725 B). O JS só
      carrega quem tem consumidor. Um componente "entrar" custa JS, não CSS._
      _**Os dois números que justificam a fatia.** (1) Trocar o `Link` do roteador pela
      âncora crua da `ContextBar` — o defeito que recarrega o PWA inteiro a cada volta —
      passa **invisível em teste de render**: o `<a href>` continua lá, com o endereço
      certo, e `keeps a real anchor, with the real address` fica **verde**. O acusador teve
      de ser sobre o ENDEREÇO depois do clique
      (`chrome.test.tsx › navigates in the APPLICATION, never in the document`, **1
      acusador**). (2) O `<aside>` da margem nascendo SEMPRE — 320px em branco e um filete
      vertical solto em todas as telas — tem **2 acusadores** (um em cada pacote), e os dois
      nasceram do caso VAZIO: sem ele a prop existiria, não pintaria nada, e a Tarefa 43
      descobriria na tela. **Dezessete mutantes aplicados entre as duas rodadas** (nove na
      entrega, mais os três sobreviventes que a auditoria achou e cinco novos), cada um com
      `md5sum`/`cp -p` próprio e conferência por leitura; **todos acusados ao fim**._
      _⚠️ **A AUDITORIA VOLTOU COM 2 BLOQUEADORES, 5 ALTOS, 6 MÉDIOS E 5 BAIXOS, e derrubou
      TREZE afirmações minhas — SETE rotuladas "medido". E TRÊS dos mutantes dela
      SOBREVIVERAM**, dois sobre propriedades que esta linha afirma entregar. Os três, e o
      que os matou:_
      _**(S1, bloqueador B1)** trocar o `SCREEN_TITLE_CLASS` pela classe **pré-42**
      (`text-2xl font-semibold`) — a decisão inteira da tipografia desfeita — passava por
      **886 testes**. E a classe entregue era o `Dia.dc.html` copiado e aplicado a **oito
      telas**: medido h1 a h1, dos **10** `<h1>` que são `Screen.title`, o `Dia` era o
      **único** que ela reproduzia. Pior, a justificativa que eu escrevi era falsa — eu disse
      que os títulos de `Inicio` e `Livro` eram *"conteúdo de tela, não o degrau da
      escala"*, e os dois **são** o `Screen.title`. Corrigido para a MAIORIA de cada
      propriedade (`leading-[1.14]`, 4 contra 3 e 3; `tracking-[-0.02em]`, 6 contra 4), com
      o arredondamento de tamanho (23–30px → 25px) **declarado**, e com acusador novo:
      **2 acusadores**._
      _**(S2, alto A2)** o **corte de tenant** — a regra que o `CLAUDE.md` chama de "a mais
      fácil de esquecer" — **não era testado**: nos fixtures
      `CASAL.id === CLUB_ID === book.clubId === 'c-casal'`, então a asserção da URL era
      verdadeira para as DUAS origens. Pedir os membros do clube **ativo** em vez do clube
      **do livro** passava por **886 testes**. Fixture hostil agora (o livro é de
      `c-outro`), nas duas telas: **2 acusadores**._
      _**(S3, alto A4)** eu dediquei um parágrafo a provar **por byte** que a ORDEM de
      emissão do Tailwind faz o `min-[1120px]:pt-0` vencer — e **apagar a classe** passava
      por 886 testes. Não era só a ordem que não tinha pino; a **existência** também não.
      Acusador novo: **1 acusador**, e sem ele o desktop soma 40+20=60px de recuo._
      _**E o bloqueador B2, que não era sobrevivente mas era pior: a contagem estava errada
      e o padrão escolhido era a MINORIA.** Eu escrevi, com ênfase, *"São TRÊS artboards na
      primeira linha e UM na segunda — contados, não generalizados"*. Medido: o canvas tem
      **15** filetes duplos, não 4; **abaixo de um `<h1>`** são **7** `top` contra **3**
      `bottom`; a minha lista de três citava `NovaAnotacao`, que **não tem `<h1>`**, e
      omitia `DiaEscuro`. O padrão virou `top`, nasceu a forma `none` (o canvas desenha
      **três** telas sem filete nenhum, e o `Screen` inventava um traço nas três), e o ramo
      `entry` **ganhou** o filete — eu tinha escrito que a tela de entrada "não tem filete de
      abertura", e `Main.dc.html:35` e `Convite.dc.html:37` **têm**. Custo: três telas a
      mais tocadas (`book.tsx` e `highlight-form.tsx` com `rule="none"`, `free-note.tsx`
      com `rule="bottom"`), autorizado porque é o canvas contra uma generalização._
      _⚠️ **E a compensação de 48px da home (alto A3) estava escrita como FEITA e não
      existia:** `grep -rn "pt-12"` devolve só prosa, e o `ScreenProps` não tem
      `className` — ela não era sequer possível. Os três documentos que a afirmavam foram
      corrigidos, e os 8px viraram **divergência declarada** para a Tarefa 45._
      _⚠️ **Mais correções da auditoria:** `accept-invite.tsx` e `not-found.tsx` ficaram
      com a tipografia de título **pré-42** por uma rodada (as duas exceções do `h1` não são
      exceção de TIPOGRAFIA — agora importam o mesmo `SCREEN_TITLE_CLASS`, com guarda);
      o `pb-7` foi generalizado de UM artboard — medido, **15 dos 16** de celular têm
      bottom 0, e o 28px do `Inicio` é o único que o canvas exercitou, então ele fica como
      **decisão do app**, não como medida do canvas; a armadilha de substring do
      `replyByUrl` continuava aberta no SEGUNDO responder do `day-note.test.tsx` (a minha
      nota declarava a classe fechada com metade dos responders arrumados); o `entry` tem
      **um** chamador e não dois (o convite não usa `Screen`); o `ScreenContextBar` aceitava
      e **descartava em silêncio** um `renderLink` (agora `Omit` distributivo — o `Omit`
      direto colapsa a união discriminada, e o `tsc` acusou); e o `nameOfWriter` era
      chamado **duas vezes por linha** nas duas telas, onde o `acervo.tsx` usa um `const`._
      _⚠️ **Quatro correções de spec, medidas:** (1) as linhas do cabeçalho estavam erradas
      nas duas citações — é `Inicio.dc.html:26` (não `:32`, que é o `<main>`) e
      `InicioDesktop.dc.html:21` (não `:32`, que é o `</div>` do grupo da direita — ⚠️ **a
      primeira correção desta fatia dizia `</header>`, e ele está na `:33`**); os números 52/56 estavam
      certos, e a unanimidade é de **16** artboards de celular e **5** de desktop; (2) a
      decisão F diz que o fallback *"é `pages.acervo.item.author.other`, que o `nameOfWriter`
      já devolve"* — **falso**: o `nameOfWriter` devolve `string | null`, e quem troca o
      `null` pela chave é a TELA (é o que `acervo`, `busca`, `activity-feed` e `streak-bar`
      já fazem, cada uma na sua linha); (3) o `new-ui.md` §A.5.9 falava de **uma** tela e
      **quatro** usuários — são **duas** (a avulsa também) e **seis**; (4) a decisão B
      revoga `max-w-4xl`, e o único chamador era o `book-form.tsx` — **ele é a única tela
      fora das duas do nome que esta fatia tocou**, com quatro deleções de `width="wide"`
      obrigadas pelo tipo._
      _⚠️ **Uma divergência canvas × entrega e uma pergunta em aberto.** (a) O nome do clube
      **fica visível no celular**, e o canvas não o desenha lá — escondê-lo com
      `hidden min-[1120px]:block` tiraria do celular o único lugar em que o clube é nomeado
      **e passaria despercebido**, porque o jsdom não aplica CSS e
      `home.test.tsx › shows the club name in the header even with a single club` ficaria
      verde com o nome invisível — ⚠️ **e por isso mesmo ela estava SEM GUARDA até a
      auditoria**: esconder o nome passava por 886 testes, e agora há acusador
      (`app.test.tsx › ⚠️ keeps the club name VISIBLE on the phone`); (b) **o canvas não tem artboard de desktop para o cadastro
      de livro** (os cinco são `Inicio`, `Dia`, `Livro`, `NovaAnotacao`, `NovoGrifo`), então
      os 680px do `book-form.tsx` são a decisão B aplicada e **não** uma medição: acima de
      1120px o campo do meio da linha do plano passa de ~490px para ~270px (ela continua em
      uma linha, `sm:flex-row` desde 640px), e abaixo do corte a tela ficou **mais larga**
      que antes. Fica para a Tarefa 47, dona dos formulários. Detalhe em
      `tasks/42-o-shell.md`, "Notas de reconciliação"._
- [x] **43** — **Anotação do dia e o `RichEditor`.** O editor perde a caixa e a barra fixa:
      formatação vira menu de bolha na seleção, e fixas na tela ficam só as 5 canetas + `Aa`
      + `/`, ancoradas acima do teclado no celular (62 px) e no rodapé da coluna no desktop
      (56 px). Serifa 17,5/1,72 → 19/1,75, medida máxima 620 px. ⚠️ **Autosave (1,5 s) e fila
      offline não mudam — só o indicador, que vira nota de margem em mono.**
      → `tasks/43-anotacao-do-dia-e-o-editor.md`
      _⚠️ **A decisão de arquitetura da fatia, tomada na spec:** a barra de canetas fica FORA
      da área de texto mas precisa comandar o editor, e o contrato do `RichEditor`
      (`docs/EDITOR.md` §3) diz por escrito que **nenhuma ref imperativa é exposta**. Passar a
      instância para a tela quebraria o contrato **e** tiraria os botões novos do grafo que
      `editor-touch-handlers.test.ts` percorre — que é a guarda da regra §4.4, a que impede o
      teclado do celular de fechar a cada toque. Saída: o `RichEditor` continua dono da barra
      e ganha `penBar?: 'fixed' | 'footer' | 'none'`; a tela só diz **onde** ela fica._
      _⚠️ **Orçamento:** o editor é lazy e tem chunk próprio (**453.606 B**), então a barra e o
      menu de bolha **não** pesam na entrada. Quem pesa é o `rail` do desktop, que entra pela
      tela. Entrada hoje **438.586 B**, teto 450.000, **sobram 11.414 B** — e restam **oito**
      componentes da 41b por consumir._
      _Entregue: a barra fixa do editor MORTA (com ela saíram o `sticky top-0`, o scroll
      lateral, o `backdrop-filter` e a exceção dos 36px, que virou o piso de **44px** do
      canvas); o menu de bolha com o conjunto do canvas (**B · I · `<>` · H1 · H2 ·
      citação**, glifos em TEXTO — o `RichEditor` deixou de importar `lucide-react` —, com
      separadores, o papel/borda/raio/sombra e a seta de 12×7); `penBar` nas três formas,
      com `'fixed'` ancorada acima do teclado no celular e devolvida ao rodapé da coluna
      acima de 1120px por **media query e só**; o editor **sem caixa** e com a serifa de
      leitura (17,5/1,72 → 19/1,75, medida máxima 620px); a nota de margem em mono pelo
      `SaveIndicator` da 41b, com `pages.dayNote.save.savedAt` ganhando o primeiro
      consumidor que teve; e a **margem do desktop** com as duas seções — é a primeira tela
      a passar `rail` ao `Screen`, capacidade que nasceu na 42 sem consumidor. **Nenhuma
      chave de catálogo nova**; `editor.slashHint` e `pages.dayNote.highlights.heading`,
      as duas órfãs da Tarefa 40, ganharam consumidor.
      **Testes: shared 601 · ui 299 · backend 1975 · app 912** (ui era 284, app 898).
      Chunk de entrada **440.949 B** (era 438.586; **+2.363 B** — teto 450.000, sobram
      **9.051**) · **chunk do editor 449.546 B** (era 453.606; **−4.060 B**, que é a barra
      morta mais os onze ícones do lucide) · CSS **35.074 B** (era 33.982; +1.092) ·
      `index.html` 1.638 B inalterado · precache 26 / **1186,67 KiB** (era 1187,26)._
      _**Os três números que justificam a fatia.** (1) **"A barra fixa morreu" não tinha
      acusador DELIBERADO**: devolvê-la — um `<div sticky top-0>` com os controles dentro,
      antes do menu de bolha — deixava a propriedade sem dono. Nasceu
      `pen-bar.test.tsx › mounts NO control above the text, and exactly SEVEN when the bar
      is asked for`. ⚠️ **A primeira redação desta linha dizia "passava por 299 testes", e o
      número descrevia o instante errado:** 299 é a contagem **depois** dos `it()` que esta
      fatia acrescentou, e a frase alegava descrever o estado **antes** deles. Medido agora:
      o mutante dá **3 acusadores**, dos quais **2 são COLATERAIS** e existiriam sem o
      arquivo novo (`reflects the active mark` e `prevents the default of mousedown` acham
      dois "Negrito" quando a barra volta). O deliberado é **um**, e é o que nasceu aqui. (2) **A identidade da decisão E nasceu
      AUTO-AJUSTÁVEL (§7.8)** — apagar um controle da lista encolhia os DOIS lados da
      igualdade e ela ficava verde; o único acusador era a pré-condição de contagem, que não
      diz qual sumiu. Com o pino escrito à mão, o mutante é nomeado. (3) O corte de tenant
      dos **grifos** — pedir ao clube ATIVO em vez do clube DO LIVRO — tem **1 acusador**,
      com fixture hostil (`c-outro` × `c-casal`). **Doze mutantes** aplicados, cada um com
      `md5sum`/`cp -p` próprio e conferência por leitura; **todos acusados**, e os dois
      arquivos voltaram com md5 idêntico._
      _⚠️ **CINCO das seis citações de artboard da spec estavam erradas** (os números não —
      17,5/1,72 · 19/1,75 · 620 · 62 · 56 · 9,5px conferem todos), e o script que **imprime
      a linha citada** achou um defeito maior: **`Dia.dc.html:71` é um SÉTIMO botão do menu
      de bolha** — `aria-label="Mais opções"` —, e o "…" com que a decisão A termina a lista
      é ele, não reticência de prosa. **Não implementado, divergência declarada**: o
      artboard é estático e não diz para onde ele leva, e tudo o que um "mais opções" conteria
      é o menu `/`, que já existe e ganhou botão próprio. Fica para o dono._
      _⚠️ **E a decisão C da spec está METADE errada, medido:** ela diz que *"17,5 e 19 não
      estão na escala de sete degraus"* — **17,5px É o `--size-reading`**, nascido na Tarefa
      39 com esse comentário ao lado. Só o 19px não existe, e ele ficou como literal no
      `editor.css`. Outras divergências declaradas: os seis botões do menu de bolha usam
      quatro corpos no canvas (16 · 13 · 14 · 24px) e saíram em três degraus; o raio do papel
      do popover é 5px no canvas e saiu em `--r-3` (4px); a amostra da caneta continua pintada
      com o `--swatch` (o `rgba` que ela APLICA) e não com `--pen-a`, porque o contrário
      apagaria o espelho do ADR 0004; e "Grifos desta leitura" aparece nas duas larguras,
      embora o artboard de celular não a desenhe — esconder por media query seria invisível
      para o teste. Detalhe em `tasks/43-*.md`, "Notas de reconciliação" (13 notas)._
      _⚠️ **A AUDITORIA VOLTOU COM ZERO BLOQUEADORES DE PRODUTO, 6 ALTOS, 5 MÉDIOS E 8
      BAIXOS — e SEIS mutantes novos SOBREVIVERAM**, cinco com consequência visível para quem
      usa. O pior: **a barra de canetas não tinha acusador de PINTURA nenhum.** Apagar
      `.clube-editor-swatch` inteira deixava as cinco bolinhas sem cor — a barra vira **cinco
      alvos de 44px invisíveis** — e passava por `ui` 299, `app` 912 e `shared` 601: **1.812
      testes sem ver**. Apagar só o anel de ouro tinha o mesmo efeito na caneta ligada. O
      `highlight-palette.test.tsx` usava a classe só como SELETOR (prova que a cor chega ao
      DOM, nunca que alguma regra a pinta), e o `editor-css.test.tsx` — o único arquivo que
      monta o CSS no jsdom — tinha três `it()` para o corpo de leitura e **zero** para a
      amostra. Nasceu `editor-css.test.tsx › the pen bar paints`, e os dois mutantes acusam._
      _**Os outros quatro sobreviventes, e os quatro tinham consequência:** a **ORDEM dos
      irmãos** (`<PenBar>` antes do `<EditorContent>`) passava por 299/299 e 912/912 — e no
      desktop, onde `min-[1120px]:static` tira o `fixed`, isso é **literalmente a barra do
      topo de volta**, a decisão A desfeita sem um vermelho (o `it()` media CONTAGEM e o nome
      dele prometia POSIÇÃO); a **seta de 12×7** do menu de bolha podia sumir; o **`ml-auto`**
      do separador podia sumir (é ele que põe `Aa`+`/` na borda direita no celular); e
      **"Grifos desta leitura" escondido no celular** — a divergência declarada por mim, e
      **desprotegida**, que é a terceira vez que este repositório paga por isso. **Oito
      mutantes novos nesta rodada, todos acusados**, cada um com `md5sum`/`cp -p` próprio e
      conferência por leitura._
      _⚠️ **E TRÊS AFIRMAÇÕES MINHAS CAÍRAM — as três são NÚMEROS MEDIDOS NUM INSTANTE E
      ESCRITOS COMO SE FOSSEM PERMANENTES**, que é uma classe nova neste repositório: nenhuma
      foi chute, todas saíram de um comando que rodou. (a) *"trocar o `--swatch` apagaria DOIS
      acusadores"* — é **um**: medido, o mutante dá 7 vermelhos, todos em
      `highlight-palette.test.tsx`, e `shared` fica **601/601 VERDE**, porque o espelho do ADR
      0004 lê os literais `rgba` do FONTE e nunca tocou o `--swatch` (a decisão está certa; o
      argumento estava pela metade); (b) *"devolver a barra passava por 299 testes"* — o 299 é
      a contagem **depois** dos `it()` desta fatia, e a frase alegava descrever o estado
      **antes**; medido, são 3 acusadores, **2 colaterais** e 1 deliberado; (c) *"a rota de
      grifos é paginada e a tela pede só a primeira página"* — **as duas metades falsas**: a
      rota não tem paginação (o `page` do schema é a **página do LIVRO**), e o corte é o
      `FIND_ROW_LIMIT = 500` com `createdAt desc`. **O veredito muda:** um grifo do dia só
      some se o livro passar de 500 grifos — num clube de casal é **registro, não defeito**._
      _**Mais: o `EDITOR.md` §6 documentava `unsetHighlight()`** — única ocorrência do nome em
      todo o repositório —, enquanto o §4.1 emendado na mesma fatia dizia "NÃO HÁ MAIS
      BORRACHA"; os **três rótulos de seção** da tela passaram ao `Eyebrow` da 41b (eles usavam
      `text-sm`, o default do Tailwind, e o canvas os desenha iguais em mono 10px — o
      componente tinha **zero** consumidores em `packages/app`; corrigidos os três e não os
      dois nomeados, porque duas tipografias de rótulo na mesma tela é a "correção incompleta"
      da 41b); a **lista de tokens do §13** estava errada nos dois sentidos e foi remedida (17
      tokens, `--bg` fora, `--border-soft`/`--r-3`/`--gold`/`--family-reading`/`--size-reading`
      dentro); o **§3** ganhou `penBar` e `slashHintLabel`; o **§14** perdeu as duas linhas
      impossíveis; e o `data-editor-bubble`, gancho que ninguém lia, saiu.
      **Testes ao fim da rodada: shared 601 · ui 303 · backend 1975 · app 914.** Entrada
      **441.093 B** (teto 450.000, sobram **8.907**) · editor **449.522 B** · CSS 35.074 B ·
      `index.html` 1.638 B · precache 26 / 1186,79 KiB._
- [x] **44** — **O livro.** O plano vira sumário com pontinhos de condução e data/página em
      mono à direita; hoje com fundo próprio e filete dourado, futuros apagados. As marcas
      viram **um glifo por leitor** (vazado = leu, cheio = leu e escreveu, ausente = não leu),
      com legenda na margem do desktop. Lombada tipográfica no lugar da capa ausente.
      ⚠️ **Os estados que mostram a posição no plano ("Dia 11 de 30") chamam
      `expectNoGuiltWithPlanPosition()`, não `expectNoGuilt()`** — a variante exige ≥ 1
      subtração efetiva da frase isenta, e é ela que impede a isenção da Tarefa 40 de virar
      letra morta. Chamar a de sempre por hábito deixa a decisão F morrer sem um vermelho.
      → `tasks/44-o-livro.md`
      _⚠️ **É a fatia para a qual a Tarefa 40 escreveu um bilhete.** Sete coisas nasceram sem
      consumidor e ligam aqui, medido por `grep` em `packages/app/src` fora de teste (zero
      ocorrências de cada): as chaves `pages.book.plan.dayOfPlan`, `pages.book.marks.*` e
      `pages.book.inBook.*` (Tarefa 40); a `COUNTER_EXEMPT_KEYS` com a
      `expectNoGuiltWithPlanPosition()` (Tarefa 40, **nunca exercitada por uma tela**); o
      `ListItem variant="sumario"` com `tone` e a variante `seal` do `Button` (Tarefa 41a);
      e o `PresenceMark` com o `BookSpine` (Tarefa 41b)._
      _⚠️ **E o compilador vai cobrar a migração do subtítulo**, como a nota do `ListItemLook`
      da 41a previu por escrito: `book.tsx` passa `subtitle={subtitleFor(item, locale)}`, e o
      braço `sumario` declara `subtitle?: never` — a data e a referência têm de ir para o
      slot `end`, em mono à direita, que é onde o canvas as desenha._
      _Entregue: a linha do plano virou `ListItem variant="sumario"` com `tone` — o dia de
      hoje em `--surface-today` com filete `--gold-line` em cima e embaixo, o futuro em
      `--text-subtle`, o passado sem tom nenhum —, e a data/referência **migrou de
      `subtitle` para `end`**, cobrada pelo compilador exatamente como a nota do
      `ListItemLook` da 41a previu por escrito (`TS2322: Type '"sumario"' is not assignable
      to type '"row"'`). O par `ReadMarks` + `PersonAvatar` deu lugar ao `PresenceMark`
      nos dois papéis (vazado = leu, cheio = escreveu), o `BookSpine` abre o corpo nos dois
      tamanhos, o "li hoje" marcado virou `variant="seal"` — **o primeiro consumidor que a
      variante teve** —, os rótulos de seção viraram `Eyebrow`, e a margem do desktop ganhou
      a legenda "As marcas". **Nenhuma chave de catálogo nova:** `pages.book.plan.dayOfPlan`
      e `pages.book.marks.{heading,read,wrote,hint}` ganharam o primeiro consumidor que
      tiveram.
      **Testes: shared 601 · ui 303 · backend 1975 · app 926** (app era 914).
      Chunk de entrada **443.693 B** (era 441.093; **+2.600 B** — teto 450.000, **sobram
      6.307** para as Tarefas 45 a 48) · CSS **35.180 B** (era 35.074; +106) ·
      `index.html` 1.638 B e editor 449.522 B **inalterados** · precache 26 /
      **1189,43 KiB** (era 1186,79)._

      _⚠️⚠️ **A ISENÇÃO DO CONTADOR FOI EXERCITADA POR UMA TELA PELA PRIMEIRA VEZ, e o
      mutante da regra 3 ficou VERMELHO** — ~~mas o acusador teve de NASCER, e a razão é
      estrutural: trocar `expectNoGuiltWithPlanPosition()` por `expectNoGuilt()`
      **afrouxa** uma asserção, e asserção afrouxada não fica vermelha sozinha. Nasceu
      `book.test.tsx › scans the plan-position states with the EXEMPTION-EXERCISING
      variant`, que lê o próprio fonte e exige ≥ **45** chamadas da variante (piso escrito
      à mão, §7.8)~~._

      _⚠️⚠️ **O TEXTO RISCADO É FALSO, e a auditoria de 2026-09-22 mediu.** O mutante não
      sobrevivia "por construção": sobrevivia pela **forma ANINHADA** do helper — a variante
      estrita chamava a de sempre e somava uma exigência, o que a tornava superconjunto. Os
      três helpers foram reestruturados em torno de um núcleo `scanGuilt(): number`, e as
      duas variantes ficaram **MUTUAMENTE EXCLUSIVAS**: `expectNoGuilt()` é
      `expect(scanGuilt()).toBe(0)` e `expectNoGuiltWithPlanPosition()` é
      `expect(scanGuilt()).toBeGreaterThan(0)`. **O pino de fonte foi APAGADO** (e o
      `testSource()` com ele), e o mutante fica vermelho no `it()` em que a troca acontece.
      Medido, sem pino: trocar **uma** chamada → **1** acusador, no lugar certo; trocar
      **todas** as 46 → **42**; e o defeito INVERSO — a posição vazando num estado sem dia de
      hoje —
      passou de **0** para **8**. ⚠️ **A troca é segura enquanto `COUNTER_EXEMPT_KEYS` tiver
      uma chave só com um consumidor de produção**, e o vermelho aparece na hora se alguém
      isentar uma frase que apareça em toda tela._

      _⚠️ **E A POSIÇÃO NO PLANO NÃO ESTÁ DESENHADA NESTA TELA NO CANVAS — divergência
      declarada.** Medido com o script que imprime a linha citada: "Dia 11 de 30" aparece em
      `Inicio.dc.html:41`, `InicioDesktop.dc.html:42` e `DiaDesktop.dc.html:51`, e
      **não** em `Livro.dc.html` nem em `LivroDesktop.dc.html`. Ela ocupa a linha de mono
      do cabeçalho, que é onde os dois artboards do livro põem a meta do mês
      ("Setembro de 2026 · 288 p.") — ~~e essa meta não pôde ser reproduzida porque o mês por
      extenso e o "p." seriam chaves NOVAS~~._

      _⚠️⚠️ **A FRASE RISCADA ACIMA É FALSA NA METADE DO MÊS, e a auditoria de 2026-09-22
      mediu.** O mês por extenso **não é chave nenhuma**: `home.tsx:182 formatClubMonth` já
      formatava `"2026-09"` → `"setembro de 2026"` com `Intl` desde a Tarefa 16, e
      `book.month` está em `bookResponseSchema` (`packages/shared/src/book.ts:139`), que esta
      tela já carrega. **Decisão do dono (D1, 2026-09-22): a linha vira
      `Setembro de 2026 · Dia 2 de 3`.** O `formatClubMonth` foi **extraído** do `home.tsx`
      para `packages/app/src/pages/club-month.ts` e as duas telas o importam de lá (§7.1:
      extrair, não copiar) — a decisão J da spec proibia tocar `home.tsx`, e o dono a emendou
      **só para este import**. O `"288 p."` continua fora: esse **seria** chave nova de
      verdade (`pt.ts` só tem `totalPages = 'Total de páginas'`, rótulo de campo). ⚠️ **E
      extrair GANHOU acusadores:** apagar o `timeZone: 'UTC'` do formatador — o bug de um dia
      em qualquer fuso negativo — tinha **0** acusadores enquanto ele era privado da home e
      passou a ter **2**._

      _⚠️⚠️ **DOIS DOS TRÊS BLOCOS DA MARGEM NÃO ENTRARAM, e a regra 9 é quem os barrou —
      `pages.book.inBook.*` continua SEM CONSUMIDOR.** (a) **"Neste livro"** é um par de
      CONTAGENS ("Anotações do clube 18 · Grifos 9"), e **a API não devolve contagem
      nenhuma**: `GET /books/:bookId` traz livro + plano + `writers` + `readers`, e as
      únicas fontes são `GET /clubs/:clubId/notes` e `/highlights`, que devolvem ARRAY
      cortado em `FIND_ROW_LIMIT = 500` (`prisma-note-repository.ts:35`,
      `prisma-highlight-repository.ts:53`). Contar o `length` de uma lista truncada é
      publicar número errado como fato, e a regra 9 manda **parar e reportar**, não contar
      errado; (b) **"Último grifo"** precisa do rótulo "Último grifo", que **não existe no
      `pt.ts`** — chave nova, proibida pela mesma regra. ~~**Pergunta aberta para o dono:**~~
      **FECHADA pelo dono em 2026-09-22 (decisão D3):** contagem de acervo no livro pede rota
      (ou envelope com total) e uma chave; as duas coisas estavam fora do escopo do MVP 3.5,
      e o dono **abriu exceção** e autorizou backend — os dois blocos viraram a **Tarefa
      44b**, logo abaixo. ⚠️ E a parada da 44 estava **mais** certa do que a nota diz: havia
      um número quase certo à mão (somar `writers[].userIds`) e ele estaria **errado**, por
      cegar as avulsas. Leia a nota nº 2 de `tasks/44-o-livro.md`._

      _**Três mutantes SOBREVIVERAM e os três ganharam acusador na mesma fatia** — os três
      da classe "divergência declarada sem guarda" que a nota nº 20 da Tarefa 43 nomeou:
      (1) a margem montada SEMPRE (`rail={rail()}`), que põe um `<aside>` de 320px e um
      filete vertical ao lado de "Carregando…" e do 404 — **925 testes verdes**;
      (2) apagar o `hidden min-[1120px]:flex` da lombada de desktop, que põe **duas
      lombadas lado a lado em toda largura** — **926 testes verdes**; (3) apagar o
      `border-b-2 border-accent` do rótulo de seção, o traço de 2px que separa o cabeçalho
      do sumário nos dois artboards — **926 testes verdes**. **Onze mutantes aplicados**,
      cada um com `md5sum`/`cp -p` próprio e conferência por leitura; todos acusados ao
      fim. ⚠️ **ERAM SEIS, não três** — a auditoria de 2026-09-22 achou outros três da mesma
      classe (M7, M12, M15), no item (a) do bloco da rodada de correção, logo abaixo._

      _⚠️ **Um `it()` foi REESCRITO e não apagado, e a propriedade mudou de natureza:**
      `tells READING apart from WRITING on the same row` media **glifo × letra** (um
      `<Check>` = leu, uma inicial = escreveu) comparando `querySelector('svg')`. No
      canvas os dois são o MESMO círculo com a inicial, e o que separa é **vazado × cheio**.
      A regra "distinguível sem depender de cor" sobreviveu com a mesma força, e ficou mais
      apertada: o vazado não pode ter **nenhum** utilitário `bg-*`, o que mata também o
      mutante que troca a forma por matiz. Os três mutantes da regra 2 acusaram
      **4 · 2 · 5**. ⚠️ **Este parágrafo dizia "(2, 1 e 3 acusadores)" e o número estava
      errado** — a nota nº 5 de `tasks/44-o-livro.md` sempre disse 4 · 2 · 5, e a auditoria
      de 2026-09-22 adjudicou por medição: o mutante (i), "vazado e cheio com o mesmo
      preenchimento", dá **4** (`@clube/ui` ×2, `@clube/app` ×2). Corrigido aqui porque é
      **este** arquivo que a próxima fatia lê._

      _⚠️⚠️ **RODADA DE CORREÇÃO DA 44 (2026-09-22): nove afirmações caíram e MAIS TRÊS
      mutantes sobreviveram.** As notas de reconciliação **11 a 16** de `tasks/44-o-livro.md`
      têm a medição de cada um. O resumo do que a próxima fatia precisa saber:_

      _**(a) Mais três mutantes da MESMA classe** ("divergência declarada sem guarda"), os
      três passando por **926 verdes**: **M7** — tirar o `aria-hidden` do envoltório do
      `PresenceMark` na legenda da margem, que faz o leitor de tela anunciar "Leu neste dia"
      **duas vezes** por linha (a lição nº 16 do MVP 2, que o docblock do teste **cita**);
      **M12** — esconder "Cheio = escreveu" com `hidden`, armadilha que a **nota 8.7 da
      própria fatia nomeia por escrito** e não guardou; **M15** — trocar a tipografia da
      linha de mono do cabeçalho, que era a string de classes do `Eyebrow` **copiada à mão**.
      Os três: **0 → 1 acusador**. ⚠️ A classe não reapareceu "inteira": reapareceu **em
      dobro**, numa fatia que já sabia o nome dela._

      _**(b) Decisão D2 do dono — o tamanho fica, e a UNIDADE estava errada.** A nota nº 9
      comparou `wc -l` (886) com o teto de "~350" da Tarefa 32b, que é do **contador
      canônico** (`acervo.tsx:115-126`, o único do projeto). Medido com o comando certo:
      `book.tsx` **277 → 356** na fatia (**+99 / −20 = +79**, ~2× o "~40 de JSX" que a nota
      estimou) e **360** ao fim da correção; `reading-marks.tsx` **105 → 107**. **O dono
      decidiu: fica nos 360, sem corte e sem teto novo** — 356 contra um teto que o próprio
      texto escreve como "~350" é aproximação, não estouro. E o docblock do `book.tsx` que
      ainda dizia "saiu de 247 para 277" foi atualizado **com data**._

      _**(c) "Restam quatro componentes da 41b por consumir" era falso: resta UM.**
      `ContextBar` está em `chrome.tsx:2` (Tarefa 42); `GrifoText` e `SaveIndicator` em
      `day-note.tsx` (Tarefa 43). Só o **`StreakSeal`** não tem consumidor, e ele entra na
      **45** — que é quem lê esta linha para saber a folga._

      _**(d) Números da rodada, 2026-09-22, tudo verde:** shared **601** · ui **303** ·
      backend **1975** · app **927** (era 926: +2 testes novos, −1 o pino de fonte apagado).
      Chunk de entrada **443.670 B** (era 443.693; **−23 B** — teto 450.000, **sobram
      6.330**) · CSS **35.180 B**, `index.html` **1.638 B** e editor **449.522 B**
      inalterados · precache 26 / **1189,41 KiB**. ⚠️ **A entrada ENCOLHEU** porque o
      conserto do M15 tirou uma string de classes copiada à mão e usou um componente que a
      tela já importava._

- [x] **44b** — **"Neste livro" e "Último grifo" na margem do livro.** ⚠️ **Decisão do dono de
      2026-09-22: ela existe porque o dono ABRIU EXCEÇÃO ao fora-de-escopo do MVP 3.5 e
      autorizou backend.** Os dois blocos saíram da Tarefa 44 pela regra 9 dela — a contagem
      de acervo pede backend e "Último grifo" pede chave nova.
      ⚠️ **E o desenho NÃO é rota nova nem envelope nas listagens** — medido ao escrever a
      spec: `usecases/get-book-with-plan.ts:56-67` já registra, por extenso, que *"uma
      abertura de livro é UM corte de tenant, não três"*, e anota que a `GET
      /books/:bookId/writers` gêmea **nunca teve cliente**. O `writers` entrou assim na
      Tarefa 11, o `readers` na Tarefa 32; as contagens são a **terceira** aplicação do
      mesmo argumento, por métodos estreitos nos ports — o desenho do
      `planItemWritersByBook`. **Nenhuma migration.** As três chaves `pages.book.inBook.{heading,notes,highlights}` (Tarefa 40)
      esperam **aqui**, e o `pt.ts` traz o bilhete ao lado delas dizendo isto.
      ⚠️ **Leia a nota nº 2 de `tasks/44-o-livro.md` ANTES de tocar no backend**: havia um
      número "quase certo" à mão — somar `writers[].userIds`, que é exato para a nota do
      plano por causa do `@@unique([planItemId, userId])` — e ele estaria **errado**, porque
      o mesmo índice não compara `NULL` com `NULL` e as **avulsas** ficariam de fora, sem
      nada acusando. E o `Highlight` não tem sobreposição nenhuma na resposta do livro.
      ⚠️ **O custo independente:** buscar as listagens para contar seria uma **terceira
      requisição** nesta tela, contra a regra 1 da Tarefa 28.
      → `tasks/44b-neste-livro-e-o-ultimo-grifo.md`

      _**ENTREGUE em 2026-09-23.** As contagens entraram no `getBookWithPlan` como previsto
      — **a terceira aplicação** do argumento de `get-book-with-plan.ts`, sem rota de
      contagem e sem envelope nas listagens. Três métodos estreitos nasceram:
      `NoteRepository.activeCountByBook`, `HighlightRepository.activeCountByBook` e
      `HighlightRepository.lastActiveByBook` (o último **é ordenado por contrato** —
      `createdAt desc`, depois `id asc` —, porque "o primeiro item de um `find` que não
      promete ordem" não é o último grifo). ⚠️ ~~**a ÚNICA leitura de coleção do projeto que
      promete ordem**~~ — **esta frase era FALSA e foi corrigida na rodada de correção**
      (bloco abaixo): o `find` do `ActivityEventRepository` já promete a mesma ordem desde
      a Tarefa 33, o `findByBook` do plano promete `order` crescente, e este método nem
      devolve coleção. O schema do
      `shared` ganhou `bookInventoryResponseSchema` e `lastHighlightResponseSchema`.
      **Nenhuma migration**: `md5sum` do `schema.prisma` igual antes e depois._

      _⚠️⚠️ **O MUTANTE QUE JUSTIFICA A FATIA É INVISÍVEL PARA A SUÍTE UNITÁRIA, e a
      medição é o argumento.** Trocar o `count()` por um `findMany` com o mesmo `where`,
      o mesmo `orderBy` e o mesmo `take: FIND_ROW_LIMIT` — ou seja, a implementação errada
      que alguém escreveria copiando o `find` de cima — passa por **1987 testes unitários
      sem um vermelho**, porque os fakes não têm teto de linhas. Quem o acusa são **2**
      testes de contrato (`…past the 500-row valve of find()`, nota e grifo), que gravam
      501 linhas e exigem **501**. É o §7.10 do `CONVENCOES-CODIGO` com o endereço escrito
      nos dois fakes e nas duas implementações Prisma._

      _⚠️ **DUAS AFIRMAÇÕES DESTE ARQUIVO E DA SPEC CAÍRAM, e a spec foi corrigida nos dois
      lugares:** (a) a decisão G dizia que "Ver o acervo do livro" era **chave nova** —
      ela **já existia** desde a Tarefa 28 (`pages.book.acervoLink`, `pt.ts:270`, com o
      valor exato do artboard), então **uma** chave nasceu, não duas; (b) a regra 7 dizia
      que a margem "só existe acima de 1120px" — o `MarginRail` é montado **sempre** e
      desce para o fluxo abaixo disso (`reading-column.tsx:186-207`). A (a) teve
      consequência de produto: como o corpo da tela já tinha o mesmo link em todas as
      larguras, o terceiro link da margem exigiu um **par de media queries mutuamente
      exclusivas** (o corpo com `min-[1120px]:hidden`, a margem com
      `hidden min-[1120px]:inline-flex`), que é o mesmo desenho das duas lombadas do
      cabeçalho. O teste `has ONE link to the collection` foi **trocado** por um que mede a
      exclusão mútua — mais apertado que o anterior, que só sabia contar elementos._

      _**O desenho do grifo na margem foi EXTRAÍDO** para
      `packages/app/src/pages/margin-highlight.tsx` (§7.1, "extrair, não cobrir duas
      vezes"): é o MESMO bloco que a Tarefa 43 já desenha na tela do dia, e a segunda cópia
      seria byte a byte. Efeito colateral medido: a bolinha da caneta **não tinha acusador
      nenhum** para o `aria-hidden` desde a 43, e passou a ter **1**. ⚠️ **Resta UM
      componente da 41b por consumir — o `StreakSeal`, que entra na 45** (a contagem da
      linha (c) da Tarefa 44 continua valendo)._

      _**Onze mutantes aplicados, onze acusados** — cada um com `md5sum`/`cp -p` próprio,
      aplicado por script ancorado, conferido por `grep` e restaurado com `md5sum -c` mais
      `diff` por conteúdo. Os obrigatórios da spec: a caneta fixa em `a` (a armadilha do
      amarelo do canvas) **1**; o `aria-hidden` da bolinha **1**; o bloco escondido em toda
      largura **1 cada**; o placar "{count} de 27" na margem **54**; o `status` fora do
      `where` **1** (fakes) e **4** (Prisma); o corte por `bookId` fora **3**. A tabela
      completa está na nota nº 5 de `tasks/44b-neste-livro-e-o-ultimo-grifo.md`._

      _**Números de 2026-09-23, tudo verde:** shared **607** (+6) · ui **303** · backend
      **1987** (+12) · app **931** (+4) · integração **642** (+13). Chunk de entrada
      **444.876 B** (era 443.670; **+1.206 B** — teto 450.000, **sobram 5.124**) · CSS
      **35.229 B** (+49) · `index.html` **1.638 B** e editor **449.522 B** inalterados ·
      precache 26 / **1190,63 KiB**. Tamanho pelo contador canônico: `book.tsx`
      **360 → 408**, `day-note.tsx` **506 → 478**, `margin-highlight.tsx` **45** (novo).
      ⚠️ **A regra 10 da spec dizia 356 para o `book.tsx`** — era o número do fim da
      Tarefa 44, antes da rodada de correção; o item (b) acima já registrava **360**, e é
      ele que está certo. ⚠️ **A regra 11 dizia 443.693 B de entrada e 6.307 de folga** —
      também o número de antes da correção; o item (d) acima já registrava 443.670 e 6.330.
      As duas corrigidas na spec._

      _**O banco de desenvolvimento do dono não mudou**, provado POR CONTEÚDO (retrato das
      13 tabelas com id, chaves e texto, nunca contagem): `md5` idêntico antes e depois das
      cinco execuções de integração, três delas com mutante aplicado. ⚠️ **E o `afterAll`
      de `book-routes.integration.test.ts` ganhou a limpeza do GRIFO, que faltava** — sem
      ela a fatia estouraria em `Highlight_bookId_fkey` **com os testes verdes**, que é a
      armadilha que o `ActivityEvent` (34), o `PushSubscription` (36) e o `planItemId` do
      grifo (38i) já pregaram três vezes._

      _**RODADA DE CORREÇÃO DA 44b, 2026-09-23.** A auditoria por mutação achou **cinco
      mutantes sobreviventes** e **seis afirmações falsas**. Os cinco ganharam acusador, e
      cada acusador foi provado pelo mutante que o justifica._

      _⚠️⚠️ **DUAS DECISÕES DO DONO (2026-09-23).**_

      _**(D1) O teto de linhas do `book.tsx` sobe para 420 linhas canônicas, com a data ao
      lado.** A tela estava em **408** pelo contador canônico (`acervo.tsx:115-126`, *"o
      único do projeto"*) contra o ~350 que a Tarefa 32b escreveu, e a rodada a levou a
      **414** (os dois filetes do canvas, abaixo). **O ~350 da 32b passa a valer como
      HISTÓRICO, riscado-e-explicado, não apagado** — ele está citado por outras fatias, e a
      numeração da **lição nº 8 do MVP 1** tem de continuar significando o que significava
      para quem já a citou; leia-o como data, não como proibição em vigor. Registrado em
      três lugares: aqui, no docblock do `book.tsx` e em
      `tasks/32b-marca-de-leitura-na-tela.md:126`. **Por que subiu:** entre a 32b e hoje a
      tela ganhou a **lombada**, o **sumário**, a **margem de desktop** (Tarefa 44) e o
      **inventário** (44b) — quatro coisas do canvas, nenhuma de conveniência. Série
      medida: 247 → 277 → 356 → 360 → 408 → **414** (folga de **6**)._

      _⚠️⚠️ **E A IRONIA, MEDIDA E REGISTRADA — é registro, não acusação; serve para a
      próxima fatia não repetir.** A 44b **extraiu 45 linhas** (`margin-highlight.tsx`) e se
      anotou como fatia que dividiu; o corte, porém, saiu do **`day-note.tsx`** (506 → 478,
      **−28**). **A tela que estourou não perdeu uma linha.** A extração estava certa pelo
      §7.1 e o número dela é real — o que faltou foi notar que o alívio foi para o arquivo
      errado. **Extrair de A não é encolher B.**_

      _**(D2) Uma fatia nova, a 44c, vai tirar as telas de ADMINISTRAÇÃO do primeiro
      carregamento** (code-splitting por rota). **A spec é do dono** e não foi escrita nesta
      rodada; a rodada **não** inventou code-splitting e **não** mexeu no teto do
      `bundle-guard`. O motivo é o chunk de entrada: **444.876 B** contra o teto de 450.000,
      **5.124 de folga (1,1%)**, com as Tarefas 45, 46 e 47 ainda por vir e a 48 como
      veredito. → `tasks/44c-admin-fora-do-primeiro-carregamento.md`, escrita pelo dono em
      2026-09-23._

      _**Os cinco mutantes sobreviventes, cada um com o acusador que nasceu para ele.**
      Protocolo por mutante: `md5sum` + `cp -p` antes, script `.mjs` **ancorado** que conta a
      âncora e estoura se ≠ 1, confirmação por `grep` depois de aplicado, execução da suíte
      inteira, restauração por `cp -p` com `md5sum -c` **e** `diff` por conteúdo._

      _**(1) O link do corpo escondido em TODA largura** (`flex min-[1120px]:hidden` →
      `hidden min-[1120px]:hidden`): era **0 de 931**. Abaixo de 1120px a tela do livro
      ficava **sem nenhum caminho para o acervo**, com a suíte verde. É a **terceira**
      aparição deste padrão no arquivo (as duas lombadas do cabeçalho, a legenda "As marcas"
      da 44, este par) e a primeira em que só metade havia sido fechada. Agora **1
      acusador**, por `not.toMatch(/(^|\s)hidden(\s|$)/u)` — com fronteira de palavra, porque
      um `toContain('hidden')` casaria `min-[1120px]:hidden` e daria o falso verde de novo._

      _**(2) O ramo `page === null` do `MarginHighlight`** renderizando `'PLACAR 18 de 27'`:
      era **0 de 931**, e **a varredura anti-culpa inteira passava ao largo** — não por
      fraqueza dela, mas porque **nenhum teste do projeto renderizava um grifo sem página**
      (`grep "page: null"` = 0 em `book.test.tsx` e em `day-note.test.tsx`). Guarda que nunca
      renderiza o estado não guarda o estado (§7.9). Agora **1 acusador**, e ele chama a
      varredura anti-culpa nesse estado._

      _**(3) O desempate do `lastActiveByBook` no fake**, invertido: era **0 de 1987**. →
      bloco próprio, abaixo._

      _**(4) O `border-b border-line-soft` das linhas de inventário**
      (`LivroDesktop.dc.html:198-205`): era **0 de 931** — toda asserção da margem era sobre
      TEXTO, e texto não vê traço. Agora **1 acusador**._

      _**(5) Trocar de lugar "Neste livro" e "Último grifo"** na margem: era **0 de 931**.
      Agora **1 acusador**, e é a mesma asserção que fecha os dois filetes que faltavam._

      _⚠️⚠️ **OS DOIS FILETES DA MARGEM NÃO EXISTIAM, e a Definição de pronto os marcava
      como feitos.** O canvas desenha dois (`LivroDesktop.dc.html:194` e `:209`,
      `height: 1px; background: #e3ddc9`, que é `--border-soft`) e o `rail()` não tinha
      nenhum — os três `<section>` eram separados só pelo `gap-[26px]`. Desenhados agora,
      com o segundo DENTRO do `null` do bloco do grifo: um separador escrito "depois de toda
      seção" deixaria um traço solto no livro recém-cadastrado, que é o estado mais comum de
      todos. A guarda é **uma asserção só** — a lista de rótulos na ordem do DOM —, e ela
      fecha a ordem, a presença e a contagem dos separadores de uma vez. Mutantes: filete de
      cima apagado → **2 acusadores**; segundo filete escrito fora do `null` → **1**._

      _⚠️⚠️ **AFIRMAÇÃO FALSA CORRIGIDA: o `lastActiveByBook` NÃO é "a única leitura de
      coleção do projeto que promete ordem".** Medido, caem três coisas: (a)
      `usecases/ports/activity-event-repository.ts:101-102` já diz, por escrito e desde a
      decisão C da Tarefa 33, que **ele** é o único que promete — e promete a **mesma** ordem
      (`createdAt` desc, `id` asc), com a mesma justificativa do empate no milissegundo; (b)
      `usecases/ports/reading-plan-item-repository.ts:98` promete `order` crescente; (c) o
      `lastActiveByBook` **não é leitura de coleção** — devolve um registro ou `null`. Havia
      **duas afirmações de unicidade que se contradiziam**, sobre a mesma propriedade, em
      dois arquivos: é a lição nº 3 do MVP 1 (regra que mora em N lugares) aplicada a uma
      AFIRMAÇÃO em vez de a um código. As duas foram corrigidas juntas, e o precedente está
      citado no docblock dos **dois** ports._

      _⚠️⚠️ **O FAKE NÃO REPRODUZIA A ORDEM DO PROJETO, e o docblock afirmava que sim.** O
      `lastActiveByBook` do `HighlightRepositoryFake` desempatava com `localeCompare`; os
      outros quatro lugares do backend comparam por **code point** (`list-highlights.ts`,
      `list-notes.ts`, `list-books.ts` e o `compareForTheFeed` do
      `ActivityEventRepositoryFake`). ⚠️ **Sendo justo: o defeito era LATENTE** — varridos
      por força bruta os 1.206.681 pares do alfabeto real dos ids (`randomUUID()` =
      `[0-9a-f-]`), **zero divergências**; os dois só discordam com maiúscula
      (`'A'.localeCompare('a')` = 1, `'A' < 'a'` = true), e id de FIXTURE é escrito à mão.
      Mas o desempate **não tinha acusador nenhum**, e o §7.1 fecha com a frase exata:
      *"fidelidade afirmada em comentário e não em teste é fidelidade que o próximo refactor
      apaga"*._

      _**A saída foi EXTRAIR, e a escolha está MEDIDA nas duas opções.** (a) trocar só o fake
      pelo code point, mais um `it()` unitário: o mutante "inverter o desempate" dá **1
      acusador**. (b) extrair o comparador para um dono só — `domain/newest-first.ts`, com o
      tipo estrutural `NewestFirst` no molde do `PlanItemMark` da Tarefa 31: o mesmo mutante
      no dono dá **8 acusadores em 6 arquivos**, porque as quatro cópias que já tinham guarda
      passaram a ser guardadas pelo mesmo dono. **Escolhida a (b)** — é o §7.1 na frase que
      ele mesmo prescreve (*"extrair, não cobrir duas vezes"*), o mesmo argumento que a 44b
      invocou para o `MarginHighlight` e não aplicou aqui, e o padrão do `sql-equality.ts`
      (23) e do `club-names.ts` (28). A conta estava escrita **cinco** vezes, não duas._

      _**Outras quatro correções, todas com mutante.** (A4) A varredura de fonte da cor de
      perigo (`book.test.tsx`) tinha **lista literal** de dois arquivos, e a tela passou a ter
      **três** na 44b: ficou de fora `margin-highlight.tsx`, justamente o que **pinta** (a
      caneta, a bolinha, o papel do `GrifoText`). ⚠️ **O docblock imediatamente acima dela é
      o próprio aviso, escrito na Tarefa 32b** — *"uma varredura de fonte que ficasse só no
      `book.tsx` teria perdido exatamente o arquivo novo"* —, e a mesma lição foi repetida no
      mesmo arquivo pela fatia que fez o `split`. Provado: com a lista de dois e a cor
      plantada no arquivo novo, o `it()` **passava**; com a de três, **falha**. O par
      positivo do terceiro arquivo é a linha que pinta a caneta. A varredura irmã de
      `adr-0002-iconography.test.ts:57-64` **é recursiva** e absorveu o arquivo sozinha
      (medido); só esta era por lista. (M1) A nota 6 afirmava que a extração do
      `MarginHighlight` era *"preservadora de comportamento por construção"* porque
      927 = 927 — **contagem igual não é prova**, e o mutante (2) acima é a demonstração;
      frase corrigida. (M4) A extração **moveu um acusador de suíte sem declarar**: trocar
      `Página N · Nome` por `Nome · Página N` dava **1 acusador, e ele estava em
      `book.test.tsx`** — o formato da linha **da tela do dia** passou a ser guardado pela
      suíte da tela do **livro**. Não é regressão (medido em `dcac49a`: antes da extração a
      suíte do dia também não assertava o formato), mas agora são **2**, um em cada suíte.
      (B2) O teste de navegação clicava **só** o link da margem; o do corpo — o único que a
      pessoa vê no celular — não era clicado por teste nenhum. Agora é: o mutante "âncora
      crua no lugar do `Link`" dá **1 acusador**, e ele é o `it()` novo. (B3) O docblock do
      `activeCountByBook` do fake do grifo **delegava** o endereço do §7.10 (*"está escrito
      no irmão deste método"*) enquanto os outros três nomeavam o próprio acusador; nomeado._

      _⚠️ **E A ABERTURA DE LIVRO DEIXOU DE SER SEIS IDAS AO BANCO EM FILA (B4).** A 44b
      acrescentou três `await` sequenciais sobre os quatro que já existiam, e os seis são
      independentes. **Medido contra o Postgres de desenvolvimento** (200 amostras, 20 de
      aquecimento, no livro real do banco do dono, só leitura): sequencial **mediana
      3,68 ms**, `Promise.all` **1,03 ms** — **−2,64 ms, 71,9% do tempo de banco da
      requisição principal desta tela**; só as três da 44b custavam **0,97 ms**. Em localhost
      a ida de rede é quase zero, e com RTT de verdade a conta piora linearmente: pagam-se
      **seis** viagens em vez de uma. ⚠️ **O `bookForActor` fica FORA do lote** — quem não é
      membro não descobre nem o TAMANHO do acervo do clube, e o acusador disso é o `it()`
      que já existia. ⚠️ **E o paralelismo tem acusador SEM cronômetro** (§7.3): a primeira
      leitura fica presa numa promessa que o teste controla, e as outras cinco já têm de
      estar CONTADAS enquanto ela não respondeu — um `expect` de duração seria a asserção que
      se autoajusta do §7.8 com roupa de performance._

      _**Números depois da rodada (2026-09-23):** shared **607** · ui **303** · backend
      **1994** (+7: 5 do `newest-first`, 1 do desempate do último grifo, 1 do paralelismo) ·
      app **937** (+6) · integração **642**. `typecheck`, `lint` e `prettier --check` verdes.
      Chunk de entrada **445.040 B** (era 444.876; **+164 B** — teto 450.000, **sobram
      4.960**, 1,1%) · CSS **35.279 B** (+50, as duas classes do filete) · `index.html`
      **1.638 B** e editor **449.522 B** inalterados · precache 26 / **1190,84 KiB**.
      Tamanho pelo contador canônico: `book.tsx` **408 → 414** (teto novo **420**, folga
      **6**); `day-note.tsx` **478** e `margin-highlight.tsx` **45**, inalterados.
      **Nenhuma migration; `schema.prisma` intocado**
      (`968c9986f7a2dfb4ccbd738b13d44715`), e o banco do dono provado idêntico POR CONTEÚDO
      (`md5` `44e6ea660a6f7f12b3b1ed83c8021a9e`: as mesmas 3 · 3 · 4 · 5 · 24 · 11 · 8 · 19 ·
      37 · 2 · 3 · 2 · 0 linhas)._
- [ ] **45** — **Início.** Correntes e feed descem para a margem; "Cadastrar o livro do mês"
      sai do primeiro lugar da tela e vira link no rodapé — é ação de admin que hoje empurra
      para baixo o gesto que é a razão de o app existir. ⚠️ **O `atRisk` fica.**
      ⚠️ **E se o bloco de hoje mostrar a posição no plano, o estado dele chama
      `expectNoGuiltWithPlanPosition()`, não `expectNoGuilt()`** (mesma razão da 44: a
      variante é o que prova que a isenção da Tarefa 40 está viva). → _a detalhar_
- [ ] **46** — **Acervo e Busca.** As seis dimensões de filtro recolhem numa linha de resumo
      mais um botão "Refinar", que abre bottom sheet no celular e painel na margem no desktop;
      filtros ativos viram chips removíveis. ⚠️ **O modelo puro de `acervo-entries.ts` não
      muda** — o que muda é quem desenha os controles. → _a detalhar_
- [ ] **47** — **Formulários.** O grifo vira o próprio papel grifado: o campo do trecho tem o
      fundo da caneta escolhida, com aspa serifada pendurada, e repinta ao trocar de cor.
      Mais a anotação avulsa e o novo/editar livro. → _a detalhar_
- [ ] **48** — **Preferências, 404, login, convite, e a passagem final.** Varredura de
      contraste nos dois temas com foco nos pontos de risco (os cinzas de legenda e os fundos
      de grifo), 360 px sem rolagem horizontal, `prefers-reduced-motion`, e o veredito sobre
      o teto de bytes do `bundle-guard`. → _a detalhar_

## Definição de "MVP 3.5 pronto"

Abro o app no celular à noite e ele parece um caderno, não um formulário: leio o tema de
hoje em serifa, escrevo num editor sem caixa e sem barra, grifo selecionando o texto, e vejo
o que a outra pessoa escreveu logo abaixo. Abro o mesmo endereço no desktop e a tela se parte
em coluna de leitura e margem, sem que ninguém tenha escrito uma segunda aplicação. Os dois
temas passam no contraste, nada cobra, e nenhuma guarda foi enfraquecida para isso acontecer.

---

# MVP 4 — Administração

## Decisões fechadas do MVP 4

- Duas áreas distintas: **super-admin** (plataforma) e **gerência do clube** (papel
  `OWNER`/`ADMIN`). Layout desktop.
- Super-admin **não** edita conteúdo de ninguém — só clube, pessoa e senha.
- Remover alguém do clube **arquiva o `Membership`**; o que a pessoa escreveu permanece.

### Bloco K — Administração

- [ ] **49** — UseCases de super-admin: `createUser` · `resetPassword` · `archiveClub` +
      guard `isSuperAdmin`. → _a detalhar_
- [ ] **50** — UseCases de gerência do clube: `changeMemberRole` · `removeMember` ·
      `revokeInvite` · `listMembers` · `listInvites`. → _a detalhar_
- [ ] **51** — Repos + rotas `/admin/*` e `/clubs/:clubId/members`. → _a detalhar_
- [ ] **52** — Tela super-admin: clubes e pessoas. → _a detalhar_
- [ ] **53** — Tela de gerência do clube: membros, papéis, convites ativos. → _a detalhar_
- [ ] **54** — Editar plano de leitura em lote (colar uma lista `data · tema · referência`).
      → _a detalhar_
- [ ] **55** — Arquivar livro e clube pela interface. → _a detalhar_
- [ ] **56** — Tela de preferências completa (fuso, locale, horário do lembrete, tema).
      → _a detalhar_

## Definição de "MVP 4 pronto"

Eu administro o sistema sem abrir o banco: crio clube e pessoa, reseto senha, mudo papel,
revogo convite, edito o plano de leitura colando uma lista, e arquivo o que acabou.
