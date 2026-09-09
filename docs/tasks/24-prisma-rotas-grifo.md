# Tarefa 24 — O grifo chega ao banco e à API

> As Tarefas 22 e 23 deram ao grifo domínio, autoria, as três escritas e a leitura filtrada —
> tudo contra um fake em memória. Esta fatia o faz **existir**: tabela, migration, repositório
> Prisma, as quatro rotas, e o teste de integração do corte de tenant.
>
> Leia antes: `docs/tasks/{22-usecase-grifo,23-usecase-listar-grifos}.md`,
> `docs/CONVENCOES-CODIGO.md` **§6 inteiro** (o padrão de rota — é o documento que vence esta
> spec) e **§7.1 / §7.10**, `docs/adr/{0001,0002,0004,0005,0008}-*.md`, `CLAUDE.md`.
>
> **Os vizinhos a imitar quase linha por linha:** `src/repositories/prisma-note-repository.ts`,
> `src/routes/note-routes.ts`, `src/repositories/__tests__/prisma-note-repository.contract.integration.test.ts`,
> `src/routes/__tests__/note-routes.integration.test.ts`, `packages/shared/src/note.ts`, e
> `src/routes/__tests__/invite-routes.integration.test.ts` (o formato de limpeza de fixture que
> o §6.6 manda copiar).

## Objetivo

O grifo que eu registro no celular fica no banco, volta na listagem, e o grifo do clube da
minha esposa continua invisível para qualquer outro clube.

## Escopo enxuto

**Entra:** o `model Highlight` + a migration gerada pelo Prisma, o `PrismaHighlightRepository`
com teste de contrato, os schemas Zod em `shared`, as quatro rotas, a fiação, e o teste de
integração do corte de tenant.

| Fora | Por quê |
| --- | --- |
| Tela de grifos | É a **Tarefa 25**. `CLAUDE.md`: não se cria tela antes do domínio testado — e agora também não antes da rota existir. |
| `GET /highlights/:highlightId` | Nenhuma tela pede um grifo por id: a 25 lista e edita dentro da lista. Rota sem chamador é especulação (`docs/WORKFLOW.md`). |
| Filtro por texto na query | É a **Tarefa 29**, e o `HighlightFilter` não tem `text`. |
| Paginação por cursor | O teto é **válvula** (decisão A), como na nota. A primeira tela que paginar de verdade troca por cursor. |
| `unaccent` / busca sem acento | Tarefa 29, com migration e ADR próprios. |
| Desarquivar | MVP 4. |
| Mexer no `Note`, no `Book` ou em qualquer outro modelo | Só as **três linhas de back-relation** (`highlights Highlight[]` em `Club`, `Book` e `User`) — é o mínimo que o Prisma exige para a relação existir. Nada além disso. |

## Decisões já tomadas (não reabrir)

- **Migration SEMPRE via Prisma, NUNCA SQL à mão.** `prisma migrate dev --name highlight`.
  Não criar nem editar arquivo em `prisma/migrations/` manualmente. → `CLAUDE.md`.
- **⚠️ O modelo nasce SEM `@updatedAt`.** O `docs/plano-clube-do-livro.md` §6 declara
  `updatedAt DateTime @updatedAt` no `Highlight` e **está desatualizado**: o ADR 0008 o emenda,
  e o dono do instante é o domínio (é o que o relógio contado da Tarefa 22 prova).
- **`response` schema é fronteira de segurança**, não decoração: sem ele o objeto inteiro vai
  para a rede, e o boot **recusa** rota sem `response` para o status de sucesso. O curinga
  `'2xx'` **não compila** no `fastify-type-provider-zod@4.0.2` — enumere os status. → §6.1.
- **O tenant vem do JWT, e o spread vem ANTES.** Nenhum schema de corpo declara `userId`,
  `clubId` ou qualquer campo derivado. → §6.3.
- **Sem membership ativo → 404.** E **toda** rota de conteúdo tem teste de integração de
  tenant: não é opcional, é a única barreira entre dois clubes. → ADR 0005.
- **`commentText` é derivado no backend e nunca entra em input.** → ADR 0001.
- **Nada de `$queryRaw`** espalhado por feature, e nenhum acesso a banco fora de um
  repositório. → `CLAUDE.md`.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | `take: 500` no `find`, **o mesmo número da nota** | Medido na Tarefa 23: ~1,4 KiB de heap por grifo, então 500 grifos são ~0,7 MiB — folga enorme. Com o **mesmo orçamento de heap** do `take: 500` da nota o grifo caberia em ~1.200 linhas, e subir é barato — **mas não subo**: 500 já é muito mais do que uma tela mostra, e um número só entre os repositórios é uma coisa a menos para raciocinar. ⚠️ E o teto **não** sai da razão grifo/nota: ela varia com o fixture (2,43× × 3,30×, medido por dois harnesses na 23) e não sustenta peso. |
| B | As rotas espelham as de nota: `POST /books/:bookId/highlights` · `PATCH /highlights/:highlightId` · `DELETE /highlights/:highlightId` · `GET /clubs/:clubId/highlights` | Um `POST /clubs/:clubId/highlights` exigiria `bookId` **no corpo**, e aí o corte de tenant sairia de um campo que o cliente manda. Com o `bookId` na **rota**, o `bookForActor` resolve o clube a partir do recurso — é o desenho que a 22 já entregou. |
| C | `DELETE` responde **200 com a linha**, não 204 | O precedente exato do `DELETE /notes/:noteId` e do `/books/:bookId`: é soft delete, e o front quer o `status`/`archivedAt` que o **servidor** gravou, sem refetch. |
| D | ⚠️ `page` na **query** com `z.coerce`; no **corpo** sem | Ver regra 12. São duas naturezas: query string é texto, corpo é JSON. |
| E | Arquivo de rota **próprio** (`highlight-routes.ts`) | `note-routes.ts` já tem **353** linhas com 6 rotas; somar 4 lá passaria de 500. O dono pediu cuidado com complexidade, e a divisão feita **antes** foi o que pagou na Tarefa 20 (`book-form` + `plan-editor`). |
| F | `removeFixtures` do `_db.ts` ganha `highlightIds`, apagados **antes** de livro/clube/usuário | As três FKs do grifo são obrigatórias e `Restrict`; sem isso a limpeza estoura na FK e um teste que falhe no meio vaza fixture no banco do dono. |
| G | Um arquivo de schemas Zod próprio (`packages/shared/src/highlight.ts`) | `note.ts` já tem ~150 linhas de schema. Espelha a separação do backend. |

## Regras (o que os testes provam)

### O modelo e a migration

1. ⚠️ `model Highlight` com `updatedAt DateTime` **sem `@updatedAt`** (ADR 0008),
   `commentDoc Json?`, `commentText String @default("")`, `page Int?`, `color String`,
   `status GeneralStatus @default(ACTIVE)`, `archivedAt DateTime?`,
   `createdAt DateTime @default(now())`, `id String @id @default(cuid())`.
2. Três índices, e **nenhum `@@unique`** (grifo é ilimitado — um `@@unique` transformaria
   "grifei o mesmo trecho de novo com outra cor" em 409): `@@index([bookId, userId])` e
   `@@index([bookId, color])` (os do ADR 0004) mais `@@index([clubId, createdAt])` — o acervo
   do clube na ordem em que o `listHighlights` o pede, o mesmo do `Note`.
3. ⚠️ **O `onDelete` das três relações é LIDO, não suposto.** As três são obrigatórias, e o
   default do Prisma para relação obrigatória é `Restrict` — mas a Tarefa 11 descobriu que o
   default para relação **opcional** é `SetNull`, e a suposição da Tarefa 06 ("o `Restrict` que
   herdamos") era **falsa**. Confirme com
   `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
   (**offline, não toca o banco**) e declare no docblock o que o SQL mostrar.
4. A migration é **gerada** por `prisma migrate dev --name highlight`. Nenhuma linha de SQL
   escrita ou editada à mão, nenhum arquivo criado em `prisma/migrations/` por você.

### O repositório Prisma

5. ⚠️ **`Json?` + `null` no Prisma NÃO é `null`.** Numa coluna `Json?` o Prisma não aceita
   `null` literal — o tipo de entrada é `DbNull | JsonNull | InputJsonValue`, e `null` é **erro
   de compilação**. Use `Prisma.DbNull` para "não há comentário", e **prove no teste de
   contrato**: gravar `commentDoc: null` e ler de volta devolve **`null` do domínio** — não a
   string `"null"`, não um sentinela, não um objeto. Errar aqui grava JSON `null` onde o
   domínio quer ausência, e o `toDomain` devolveria um valor onde a 25 espera `null` para
   decidir se mostra o comentário.
6. `toDomain` estreita `Json` → `NoteDoc | null` com `assertNoteDoc` (o precedente do
   `PrismaNoteRepository`): `null` fica `null`, e um `commentDoc` corrompido no banco **estoura
   na leitura** — não três camadas depois, dentro do `docToText`.
7. ⚠️ `find` tem `take: 500` **e** `orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]`
   **colados**, com o teto num `const` documentado. `take` sem ordem **total** corta um
   conjunto que o Postgres devolve em qualquer ordem, e duas chamadas iguais trariam grifos
   diferentes. **O `sort` do `listHighlights` NÃO substitui o `orderBy`**: ele ordena o que
   chegou, e o que chegou é decidido pelo corte do banco. E `authorId` → coluna **`userId`**.
8. ⚠️ A truncagem é provada no **teste de contrato**, porque **não é decidível no unitário** —
   o fake não tem teto de linhas, então nenhum mutante unitário acusa `take` ausente ou
   `orderBy` faltando (§7.10). O teste grava mais que o teto (use um teto injetado ou um
   fixture que o exceda, o que você justificar), confere que voltam as N **mais recentes**, e
   **pina o desempate** com duas linhas de `createdAt` idêntico.
9. `toUpdateData` **não precisa de allowlist** — o `HighlightPatch` já é estreito (§7.1.1), e
   é esse o dividendo. Mapeia campo a campo as 9 chaves, e **nunca** `id`, `clubId`, `bookId`,
   `userId` ou `createdAt`. `save` é upsert por `id`, como os outros repos.
10. ⚠️ **Teste de contrato da coluna nula, contra o Postgres de verdade:** `page: 45` no filtro
    **não** traz o grifo com `page = NULL`. O fake afirma essa fidelidade e tem teste unitário
    (35 acusadores na direção restritiva), mas **este é o único lugar onde ela é decidível
    contra o banco** — é a 4ª aparição do §7.1 fechando o ciclo.

### Os schemas de borda (`packages/shared/src/highlight.ts`)

11. `color` é `z.enum(HIGHLIGHT_COLORS)` — **a mesma constante** de `@clube/shared`, nunca uma
    lista copiada (lição nº 3). E a borda **não normaliza caixa**: o `=` de texto do Postgres é
    byte-sensível, e aceitar `#FACC15` criaria uma segunda grafia que o banco não reconhece
    como a mesma cor — o filtro por cor perderia metade dos grifos.
12. ⚠️ **`page` na query é `z.coerce.number().int().min(1).max(2147483647)`; no CORPO é
    `z.number().int().min(1)`, SEM `coerce`.** Query string é texto (sem `coerce`, `?page=45`
    é 400); corpo é JSON (com `coerce`, a string `"45"` passaria e a borda deixaria de ser a
    barreira que o §6.3 promete). O `.max` existe porque a coluna é `Int`: `page: 2**31` faz o
    Prisma **lançar**, e a rota responderia **500** onde a suíte unitária diz "lista vazia".
13. Corpos de escrita são `.strict()`: `commentText`, `userId`, `clubId`, `status` ou
    `archivedAt` no corpo dão **400** e **nada é escrito**. A **query** de listagem **não** é
    `.strict()` — o precedente do `listNotesQuerySchema`: um `utm_source` colado de um link não
    pode derrubar a listagem do clube.
14. `editHighlightSchema` distingue **ausente** de `null`: `page`, `reference` e `commentDoc`
    são `.nullable().optional()`, e **nunca** `.default()` — que colapsaria os dois casos num
    só e mataria a semântica "limpa o campo" que a Tarefa 22 entregou.
15. ⚠️ O `commentDoc` do **response** usa o `noteDocSchema` (que é `.passthrough()`), e é isso
    que impede a resposta de sair com o **comentário apagado**: o serializer descarta campo não
    declarado, então um `z.object({ type: z.literal('doc') })` responderia
    `{"commentDoc":{"type":"doc"}}` com **200 e sem erro nenhum**. Teste de losslessness na
    borda, com `content`, `marks` e `attrs` aninhados. → §6.1 e ADR 0001.

### As rotas

16. `POST /books/:bookId/highlights` → **201** · `PATCH /highlights/:highlightId` → **200** ·
    `DELETE /highlights/:highlightId` → **200** (decisão C) · `GET /clubs/:clubId/highlights` →
    **200**. Os status são enumerados **um por um**, e **só** os que o handler realmente produz
    — declarar um que ele não produz faz o OpenAPI mentir para a tela que o lê.
17. `bodyLimit` de **256 KiB** nas duas rotas de escrita, declarado **na rota** e não herdado
    do global (o corpo carrega um `doc`, e a Tarefa 14 elevou o limite global para colar
    imagem), com **413** declarado. É o precedente medido da Tarefa 11.
18. O `403` aparece **só** no `PATCH` e no `DELETE` — é o `NotTheAuthorError`, o único 403 de
    conteúdo do projeto. O `POST` e o `GET` **não** o produzem (leitura e escrita de grifo novo
    não exigem papel nem autoria).
19. ⚠️ **Teste de integração do corte de tenant:** um membro de **outro clube** recebe **404**
    nas **quatro** rotas. E o contrabando é testado **com o ator legítimo**, assertando **a
    linha gravada** (§7.5): `userId`/`clubId` no corpo não mudam nada.
20. A fiação: `highlights` em `buildRepositories`, `highlightRoutes` registrado no escopo
    **autenticado** (rota nova fora dele nasceria pública), e o `listHighlights` fiado na rota
    — é o que torna segura a decisão D da Tarefa 23 (o UseCase não revalida a cor porque a
    **borda** valida).

## Segurança do banco — leia duas vezes

Esta é **a fatia que muda o modelo**, então é a única em que a migration é permitida — e só
por `prisma migrate dev --name highlight`. O banco é o **de desenvolvimento do dono** e tem um
super-admin do seed.

- **NUNCA** `prisma migrate reset`, `prisma db push`, nem SQL de migration escrito à mão.
- **NUNCA** `deleteMany({})`. Fixture só com `prefixedId('t24', …)`, apagado **por id**, e a
  limpeza **consulta o banco** em vez de uma lista alimentada pelas respostas esperadas — senão
  um teste que falhe no meio vaza fixture e a limpeza seguinte estoura na FK (§6.6).
- Se subir o servidor, **derrube-o**: mate o supervisor `tsx watch` primeiro e confirme as
  portas **3333** e **5173** livres.

## Arquivos a tocar

```
packages/shared/src/highlight.ts                             NOVO — os schemas Zod
packages/shared/src/index.ts                                 exporta o novo módulo
packages/shared/src/__tests__/highlight-schemas.test.ts      NOVO
packages/backend/prisma/schema.prisma                        + model Highlight e 3 back-relations
packages/backend/prisma/migrations/<gerada>/                  GERADA pelo Prisma — não escreva SQL
packages/backend/src/repositories/prisma-highlight-repository.ts        NOVO
packages/backend/src/repositories/__tests__/prisma-highlight-repository.contract.integration.test.ts   NOVO
packages/backend/src/repositories/__tests__/_db.ts           + highlightIds no removeFixtures
packages/backend/src/http/repositories.ts                    + highlights
packages/backend/src/http/server.ts                          + highlightRoutes no escopo autenticado
packages/backend/src/routes/highlight-routes.ts              NOVO
packages/backend/src/routes/__tests__/highlight-routes.integration.test.ts   NOVO
```

**Não tocar:** `src/domain/**` e `src/usecases/**` (o domínio, os UseCases, o port e o fake do
grifo estão prontos e auditados — se esta fatia precisar mudá-los, **pare e reporte**) ·
`prisma/seed.ts` · qualquer migration existente · qualquer outro `model` do `schema.prisma`
além das três linhas de back-relation · `packages/ui/**` · `packages/app/**` ·
`packages/shared/src/{note,book,club,client,locales}`.

## Definição de pronto

- [x] Migration **gerada pelo Prisma**, nenhuma linha de SQL escrita à mão (4).
- [x] O modelo nasce **sem `@updatedAt`** e **sem `@@unique`** (1, 2).
- [x] O `onDelete` das três relações **lido** do `migrate diff` e declarado (3).
- [x] ⚠️ `commentDoc: null` grava e volta como `null` — provado no contrato (5).
- [x] `take` **e** `orderBy` colados, e a truncagem provada no **contrato** (7, 8).
- [x] ⚠️ `page = NULL` não casa filtro de página **contra o Postgres** (10).
- [x] `page` com `coerce` na query e **sem** no corpo, com `.max` de int32 (12).
- [x] Corpo `.strict()`, query **não** (13); ausente ≠ `null` no `PATCH` (14).
- [x] Losslessness do `commentDoc` na borda, com `marks`/`attrs` aninhados (15).
- [x] `bodyLimit` por rota + **413** declarado (17).
- [x] ⚠️ **404 para membro de outro clube nas QUATRO rotas** (19).
- [x] Contrabando testado com o **ator legítimo**, assertando a linha gravada (19).
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos: **391 · 175 · 1266 · 424** (baseline era
      320 · 175 · 1266 · 424 — só o `shared` cresceu, +71 testes de schema).
      ⚠️ Nenhum teste UNITÁRIO carrega `highlight-routes.ts`,
      `prisma-highlight-repository.ts` nem `http/server.ts`: nesta fatia os
      instrumentos são o `tsc`, o catálogo do Postgres, a guarda de boot e a
      integração — "verde no unitário" não é sinal aqui.
- [x] `pnpm -r test:integration` rodado **por esta fatia** (é a exceção: ela muda o modelo):
      **359** (baseline **262** — +34 do contrato e +63 das rotas).
- [x] `packages/ui` em **175** e `packages/app` em **424** — intocados.
- [x] Nenhum fixture sobrou no banco: prove consultando por `t24-` **depois** da suíte.
- [x] **Linhas de código coladas** dos arquivos novos.
- [x] Checklist marcada; a linha 24 do `BACKLOG.md` é do orquestrador.
