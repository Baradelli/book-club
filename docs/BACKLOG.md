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
- [ ] **23** — UseCase `listHighlights(filter)` — por livro, autor, cor, página. → _a detalhar_
- [ ] **24** — Repo Prisma + rotas `/highlights` + teste de tenant. → _a detalhar_
- [ ] **25** — Tela de grifos do livro: lista por cor, criar/editar com o editor no
      comentário. → _a detalhar_

### Bloco F — Filtro geral e busca

- [ ] **26** — `listNotes` completo: `kind` (pré-definida × avulsa), `planItemId`/capítulo,
      texto. → _a detalhar_
- [ ] **26a** — `GET /clubs/:clubId/members` (id, nome, papel, status), com o corte de tenant
      de sempre. **Fatia INSERIDA pelo orquestrador do MVP 2**, antes da 27. → _a detalhar_
      _**Por que ela existe:** a 27 pede filtro **por pessoa**, e ele **não é implementável**
      sem esta rota — a lacuna está medida e registrada três vezes no MVP 1 (linhas 17, 18 e
      19). Medido de novo agora: o `MembershipRepository` tem só `save · byUserAndClub ·
      findByUser`, **não existe `findByClub`**; o `/me` traz só os **meus** clubes; e as notas
      e a sobreposição de autoria trazem `userId`, nunca nome. Por isso o filtro entregue na
      19 é `Tudo · Minhas · De outras pessoas` e a nota alheia aparece como "Alguém do clube".
      Resolve **duas** coisas de uma vez: o chip `de <nome>` e o avatar passar a dizer quem
      escreveu. É a pergunta 1 do `docs/ACEITE-MVP.md`, cuja recomendação era exatamente
      "fazer no início do MVP 2"._
      _**Ela antecipa parte da linha 41 (MVP 4)**, que lista `/clubs/:clubId/members` junto das
      rotas `/admin/*`. A 41 continua com os UseCases de gerência (`changeMemberRole`,
      `removeMember`); só a **leitura** da lista vem para cá._
      _⚠️ **Medido:** `User.name` é **anulável** no schema (`name String?`), então a resposta
      carrega `name: string | null` e a tela precisa de fallback — não dá para supor nome._
- [ ] **27** — Componente de filtro compartilhado (pessoa · tipo · leitura · cor) em `ui/`.
      → _a detalhar_
- [ ] **28** — Tela de acervo do livro: anotações + grifos num só lugar, com o filtro.
      → _a detalhar_
- [ ] **29** — Busca simples por texto no acervo do clube. → _a detalhar_

## Definição de "MVP 2 pronto"

Eu registro tudo que grifei — trecho, cor, página e meu comentário — e vejo a coleção de
grifos do livro filtrada por cor e por pessoa. E em qualquer listagem eu filtro por pessoa,
por tipo de anotação (do dia × avulsa), por capítulo e por texto.

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

### Bloco G — Registro de leitura

- [ ] **30** — Domínio `ReadingLog` + UseCases `markRead` e `unmarkRead` (hard delete).
      → _a detalhar_
- [ ] **31** — UseCase `computeBookProgress` (por pessoa e do clube, puro — **TDD pesado**).
      → _a detalhar_
- [ ] **32** — Repo Prisma + rotas + progresso na tela do livro. → _a detalhar_

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
