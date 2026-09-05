# Tarefa 07 — Prisma e rotas de `Book` / `ReadingPlanItem`

> Fecha o **Bloco B**. Segunda fatia de persistência: o domínio das Tarefas 05 e 06 ganha
> banco e HTTP. Como na Tarefa 03, **não há TDD de domínio** (não há regra nova) — o que
> existe é **teste de contrato** contra o Postgres real e **integração de rota** por
> `app.inject()`.
>
> Leia antes: `CLAUDE.md` (a regra de migrations e a seção de datas),
> **`docs/adr/0007-order-do-plano-nao-e-unique.md`** (é ele que diz o que o schema declara),
> `docs/CONVENCOES-CODIGO.md` §6 (o padrão de rota) e as Tarefas 03, 05 e 06.

## Objetivo

Um admin cadastra o livro do mês com o plano pela API, corrige, arquiva e reescreve o plano;
qualquer membro lista os livros do clube e abre um livro com o plano. Sem vazar entre clubes,
e **sem que o dia 5 do plano apareça como dia 4**.

## Decisões já tomadas (não reabrir)

- **Migration sempre via Prisma.** Nunca escrever nem editar SQL em `prisma/migrations/`.
- **`@@index([bookId, order])`, NÃO `@@unique`** — ADR 0007. A unicidade de `order` é
  invariante de domínio (`normalizePlanDrafts` o deriva da posição).
- **`@@unique([bookId, date])` fica** — é a chave natural do dia de leitura e do diff.
- `save`/`saveMany` são **upsert por `id`** (convenção da Tarefa 03).
- Sem membership ativo → **404**. Papel insuficiente → **403**. O clube vem de `book.clubId`.
- Todo erro sai como `{ error }`; `error.message` só na classe 400; `details` só para erro de
  validação. → `CONVENCOES-CODIGO` §6.2.
- Toda rota declara `response` schema por status — a guarda de boot recusa o que não declara.

## ⚠️ O ponto que decide esta fatia: `CalendarDay` ↔ `@db.Date`

O domínio guarda `date` como `string` `"YYYY-MM-DD"` (ADR-menos, decisão da Tarefa 05: um dia
de calendário não é um instante). A coluna é `DateTime @db.Date`, e o Prisma devolve um `Date`
em **meia-noite UTC**. A conversão vive **só no repositório**, e é a origem clássica do bug
"o plano do dia 5 aparece no dia 4".

Medido nesta máquina, que está em **UTC−3**:

```
new Date('2026-10-05')                    → 2026-10-05T00:00:00.000Z   ✅
new Date('2026-10-05T00:00:00')           → 2026-10-05T03:00:00.000Z   ❌ meia-noite LOCAL
d.getFullYear()+'-'+d.getMonth()+1+…      → 2026-10-04                 ❌ getters locais
d.toISOString().slice(0, 10)              → 2026-10-05                 ✅
```

Ou seja: **uma implementação ingênua erra na máquina do dono, hoje.** Regras, então:

- ida: `new Date(\`${day}T00:00:00.000Z\`)` — **com o `Z` explícito**;
- volta: `date.toISOString().slice(0, 10)` — **nunca** `getFullYear`/`getMonth`/`getDate`,
  `toLocaleDateString`, nem `date.toDateString()`;
- os dois num par de funções puras exportadas (`calendarDayToDate` / `dateToCalendarDay`),
  com **teste unitário próprio** provando o ida-e-volta e provando que os getters locais
  divergem (para o teste documentar por que o UTC é obrigatório).

> **Nota de ambiente:** `TZ=...` como variável de ambiente **não é confiável no Node do
> Windows**. Não escreva teste que dependa de trocar o fuso do processo. Prove por asserção
> do instante UTC exato armazenado e da string exata devolvida.

## Entregas

### 1. Mover `calendar-day` para `packages/shared`

O Zod da borda precisa da **mesma** validação de `"YYYY-MM-DD"` e `"YYYY-MM"` que o domínio
usa, e `CLAUDE.md` proíbe duplicar schema/validação entre back e front. Então
`CalendarDay`, `isCalendarDay` e `isClubMonth` **mudam de casa**: de
`packages/backend/src/domain/calendar-day.ts` para `packages/shared/src/calendar-day.ts`,
reexportado pelo `index.ts`.

O backend passa a importar de `@clube/shared`. Os **47 testes** de `calendar-day` vão junto
para `packages/shared/src/__tests__/` e têm de continuar verdes, **sem alteração**. A Tarefa
20 (tela de cadastro) vai importar daí também.

`calendarDayToDate`/`dateToCalendarDay` **ficam no backend** (`src/repositories/`): são
tradução de persistência, o front não tem o que fazer com elas.

### 2. Schema (`packages/backend/prisma/schema.prisma`)

Acrescentar **só** `Book` e `ReadingPlanItem`, a partir do §6 do plano, recortando as relações
que apontam para modelos que ainda não existem (`notes`, `highlights`, `logs`) e **aplicando o
ADR 0007**:

```prisma
model ReadingPlanItem {
  // …
  @@unique([bookId, date])
  @@index([bookId, order])   // ADR 0007 — era @@unique
  @@index([bookId, date])
}
```

`Book` mantém `@@index([clubId, status])`. `date` é `DateTime @db.Date`. Relações reais:
`Book.club`, `Book.planItems`, `ReadingPlanItem.book`. `Club.books` e `User` (por
`createdById`) precisam do lado inverso.

### 3. Migration

```powershell
pnpm --filter @clube/backend prisma migrate dev --name book_and_reading_plan
```

Confirmar que nasceu em `prisma/migrations/<ts>_book_and_reading_plan/` e **não editar**.
Colar o SQL no relatório: quero ver `ReadingPlanItem_bookId_date_key` como **UNIQUE** e
`ReadingPlanItem_bookId_order_idx` como índice **não-único**.

### 4. Um port muda: `deleteMany` → `replaceForBook`

O `replacePlanItems` faz hoje duas chamadas ao repositório. Em memória isso é atômico; contra
o Postgres, um crash entre elas deixa o plano **truncado** — e é a tabela que ancora as
anotações das pessoas. A auditoria da Tarefa 06 registrou isso, com a ressalva certa: o
`CLAUDE.md` proíbe o UseCase importar Prisma, então **o UseCase não pode abrir transação**, e
um "port de unit-of-work" genérico vazaria o conceito de transação para dentro do domínio.

A saída é **um método de port único**, cuja implementação Prisma envolve as duas operações num
`$transaction`:

```ts
export interface ReadingPlanItemRepository {
  saveMany(items: ReadingPlanItem[]): Promise<ReadingPlanItem[]>;   // fica (createBook usa)
  findByBook(bookId: string): Promise<ReadingPlanItem[]>;           // fica
  /** Aplica o diff do plano de um livro numa só operação atômica. */
  replaceForBook(bookId: string, change: {
    upsert: readonly ReadingPlanItem[];
    removeIds: readonly string[];
  }): Promise<ReadingPlanItem[]>;
}
```

`deleteMany` **sai** (só o `replacePlanItems` o usava). O UseCase `replacePlanItems` passa a
fazer **uma** chamada; os 32 testes dele têm de continuar verdes, ajustando só o que for
mecânica de chamada. O fake implementa `replaceForBook` mantendo a fidelidade sequencial do
`unique(bookId, date)` que a Tarefa 06 construiu.

> **Ordem dentro da transação:** remover antes de inserir. Não é mais obrigatório pelo índice
> (ADR 0007 tirou o de `order`, e uma data do rascunho nunca é uma data removida), mas mantém
> a menor contagem de linhas no pico e faz a guarda do Bloco C ("não remover item com nota")
> falhar antes de escrever.

### 5. Repositórios Prisma (`src/repositories/`)

`prisma-book-repository.ts` — `save` (upsert por id), `byId`, `update(id, patch)`, `find({ clubId, status? })`.
`prisma-reading-plan-item-repository.ts` — `saveMany`, `findByBook`, `replaceForBook`.

Molde da Tarefa 03: mapeadores puros no topo do módulo, fora da classe; `undefined` no patch
é ausência e `null` é valor; nenhuma regra de negócio. **`find` sem `status` devolve os dois**
(a regra de produto vive no `listBooks`). `findByBook` devolve **ordenado por `order`**.

### 6. Schemas Zod (`packages/shared`)

`src/book.ts`: `createBookSchema` · `editBookSchema` · `planItemDraftSchema` ·
`replacePlanSchema` · `listBooksQuerySchema` · `bookResponseSchema` ·
`planItemResponseSchema` · `bookWithPlanResponseSchema` · `bookIdParamsSchema`.

- `date` usa `isCalendarDay` via `.refine()` — **não** um regex novo.
- `month` usa `isClubMonth` via `.refine()`.
- `editBookSchema` precisa distinguir **ausente** de `null` (é a regra 5 da Tarefa 06):
  `author: z.string().nullable().optional()` etc. Não use `.default()`, que apagaria a
  distinção.
- Nenhum schema de corpo declara `actorUserId`, `clubId` (quando vem da rota) nem `order`.
  → `CONVENCOES-CODIGO` §6.3.
- `listBooksQuerySchema.includeArchived` vem como **string** na query
  (`z.enum(['true','false']).optional().transform(...)` ou `z.coerce.boolean()` — escolha e
  justifique; cuidado: `z.coerce.boolean()` transforma `'false'` em `true`).

Testes em `packages/shared/src/__tests__/`: `date` malformada rejeitada, `month` malformado
rejeitado, `editBookSchema` preservando `null` e omitindo ausente, e chave não declarada
sendo descartada.

### 7. As rotas

| Método | Rota | Escopo | UseCase |
|---|---|---|---|
| `POST` | `/clubs/:clubId/books` | autenticado | `createBook` → 201 |
| `GET` | `/clubs/:clubId/books` | autenticado | `listBooks` → 200 |
| `GET` | `/books/:bookId` | autenticado | `getBookWithPlan` → 200 |
| `PATCH` | `/books/:bookId` | autenticado | `editBook` → 200 |
| `DELETE` | `/books/:bookId` | autenticado | `archiveBook` → 200 (soft delete) |
| `PUT` | `/books/:bookId/plan` | autenticado | `replacePlanItems` → 200 |

Em `src/routes/book-routes.ts`, seguindo o §6 das convenções: `toResponse` no topo
convertendo `Date` em ISO string, UseCases instanciados **uma vez** no registro,
`buildRepositories` estendido, `handleDomainError` no `catch`, e **`response` declarado para
todo status que o handler pode enviar** (a guarda de boot recusa o resto).

### 8. `handleDomainError` — fechar a pendência das Tarefas 05 e 06

Registrar `[InvalidBookError, 400]` e `[BookNotFoundError, 404]` **e** remover os dois nomes
de `NOT_YET_MAPPED` em `handle-domain-error.test.ts`. **Os dois no mesmo commit:** o teste de
exaustividade é auto-limpante — mapear sem limpar a lista fica vermelho, e limpar sem mapear
também.

## Testes

### Contrato (Postgres real) — `*.contract.integration.test.ts`

`prisma-book-repository`
- `save` cria; `save` do mesmo id atualiza (upsert) e não duplica;
- `byId` mapeia os campos (datas como `Date`, `archivedAt` nulo), id inexistente → `null`;
- `update` altera **só** o campo do patch, e grava `null` explícito;
- `find({clubId})` devolve os dois status; `find({clubId, status})` filtra; **nunca devolve
  livro de outro clube**.

`prisma-reading-plan-item-repository` — **o coração da fatia**
- **ida-e-volta de `CalendarDay`**: gravar `'2026-10-05'` e ler `'2026-10-05'`; e conferir
  **no banco** (`SELECT date`) que a coluna guarda `2026-10-05`, não `2026-10-04`;
- os limites que pegam erro de fuso: `'2026-01-01'`, `'2026-12-31'`, e um dia de horário de
  verão do fuso do clube;
- `saveMany` do mesmo id atualiza; segundo item com a **mesma `date`** no mesmo livro **falha**
  (prova o `@@unique`); mesma `date` em **outro** livro passa;
- **dois itens com o mesmo `order` no mesmo livro passam** — é o teste que prova o ADR 0007;
- **o caso do ADR**: inserir um item na frente de um plano existente renumerando os
  sobreviventes, **numa só chamada de `replaceForBook`**, sem erro de índice. É o teste que o
  fake não conseguia dar;
- `findByBook` ordenado por `order`;
- `replaceForBook` é **atômico**: se o `upsert` viola o `unique(bookId, date)`, **nada** foi
  removido (o teste confere que o plano antigo está intacto);
- `replaceForBook` com `removeIds` de id inexistente não estoura (idempotência).

### Rota (`app.inject()`) — `book-routes.integration.test.ts`

- `POST /clubs/:clubId/books` como `ADMIN` → 201 com o livro e o plano; como `MEMBER` → 403;
- **corte de tenant, obrigatório**: `OWNER` de **outro** clube → **404** em `POST` e em `GET`
  da lista; e em `GET`/`PATCH`/`DELETE`/`PUT` de um `bookId` de outro clube;
- `GET /clubs/:clubId/books` como `MEMBER` → 200 (leitura não exige papel);
- `GET /books/:bookId` → 200 com plano ordenado; livro arquivado → 404;
- `PATCH` com `month` inválido → **400 com `details` apontando `month`**;
- `PATCH` com `author: null` → limpa; sem o campo → não mexe;
- `DELETE` → 200 e o `GET` seguinte → 404;
- `PUT /books/:bookId/plan` inserindo um dia na frente → 200, e **o `id` do item sobrevivente
  é o mesmo de antes** (a prova ponta a ponta de que anotação não seria destruída);
- `PUT` com data repetida → 400 com `details`;
- sem token → 401 em todas.

Fixtures com prefixo `t07-`, limpeza que **consulta o banco** (o formato do
`invite-routes`, não o do `club-routes` — `CONVENCOES-CODIGO` §6.6), **nenhum**
`deleteMany({})`, `app.close()` e `$disconnect()`.

## Decisões que assumi (revisar antes de executar)

- **`calendar-day` muda para `shared`.** É o que evita duplicar validação de data entre back,
  borda e tela. Alternativa: manter no backend e o Zod ter o próprio regex — duas validações
  de data que vão divergir, exatamente o que o `CLAUDE.md` proíbe.
- **`deleteMany` sai do port, entra `replaceForBook`.** É o único jeito de a operação ser
  atômica sem o UseCase conhecer transação. Custo: o UseCase da Tarefa 06 muda (uma chamada
  em vez de duas) e o fake ganha um método. Se preferir aceitar a não-atomicidade, registro
  como dívida e mantenho `deleteMany` — mas a tabela ancora as anotações.
- **`DELETE /books/:bookId` para arquivar.** É soft delete, e o recurso realmente fica
  invisível (`GET` seguinte dá 404), então o verbo é honesto. Alternativa:
  `POST /books/:bookId/archive`, mais explícito e mais feio.
- **`PUT` (não `PATCH`) para o plano**, porque `replacePlanItems` substitui o recurso inteiro.
- **`listBooks` por query string `?includeArchived=true`**, não duas rotas.
- **A capa continua sendo `coverUrl` como texto.** Upload é outra fatia (vem com a imagem do
  editor, Tarefa 14).
- **Não crio rota de "empurrar o plano N dias"** — MVP 4, Tarefa 44.

## Arquivos a tocar

- `packages/shared/src/calendar-day.ts` (movido) · `book.ts` (novo) · `index.ts` ·
  `__tests__/` (os 47 de calendar-day + os novos de schema).
- `packages/backend/src/domain/calendar-day.ts` (**apagado**; imports passam a `@clube/shared`).
- `prisma/schema.prisma` · `prisma/migrations/` (**gerado**).
- `src/repositories/prisma-book-repository.ts` · `prisma-reading-plan-item-repository.ts` ·
  `calendar-day-mapper.ts` + os testes de contrato (novos).
- `src/usecases/ports/reading-plan-item-repository.ts` (`deleteMany` → `replaceForBook`) · o
  fake · `src/usecases/replace-plan-items.ts` (uma chamada).
- `src/routes/book-routes.ts` + o teste de integração (novos) · `src/http/repositories.ts` ·
  `src/http/server.ts` (registrar as rotas).
- `src/http/handle-domain-error.ts` (+2 status) · `__tests__/` (limpar `NOT_YET_MAPPED`).
- **Não** tocar: `packages/ui`, `packages/app`, nenhuma **regra** das Tarefas 01–06, e
  `src/routes/{public,me,club,invite}-routes.ts`.

## Fora de escopo

- `Note`, `Highlight`, `ReadingLog` e suas tabelas — Blocos C e MVPs 2/3.
- "Quem já escreveu em cada dia" e a guarda de "não remover item com nota" — Bloco C
  (registrados nas linhas 10 e 11 do `BACKLOG.md`).
- Telas — Bloco D. Upload de capa. Rate limit. Paginação.
- `unarchiveBook` e "empurrar o plano" — MVP 4.
- A decisão pendente **"clube arquivado deve ficar invisível para leitura?"** — está aberta
  com o dono e afeta o `assertMembership`, não esta fatia.

## Definição de pronto

- [x] `calendar-day` vive em `packages/shared`, o backend importa de lá, e os **47 testes
      continuam verdes sem alteração**.
- [x] `schema.prisma` com `Book` + `ReadingPlanItem`, `@@unique([bookId, date])` e
      **`@@index([bookId, order])`** (ADR 0007). Migration **gerada pelo Prisma**, SQL colado
      no relatório, nenhum SQL escrito à mão.
- [x] `calendarDayToDate`/`dateToCalendarDay` puros, com teste próprio, usando **só UTC**.
- [x] Teste de contrato provando que `'2026-10-05'` volta `'2026-10-05'` **e** que a coluna
      guarda `2026-10-05` (o bug do fuso não acontece).
- [x] Teste de contrato provando o **caso do ADR 0007**: inserção na frente com renumeração,
      numa só operação, sem erro de índice.
- [x] `replaceForBook` atômico, com teste provando que um `upsert` que viola o índice **não**
      removeu nada.
- [x] Os dois repos Prisma implementam os ports **sem alterar as regras** das Tarefas 05/06.
- [x] Schemas Zod em `shared` usando `isCalendarDay`/`isClubMonth` (sem regex duplicado), com
      `editBookSchema` distinguindo ausente de `null`.
- [x] As 6 rotas de pé, `/docs` listando-as, e **`response` declarado por status**.
- [x] **Corte de tenant testado nas 6 rotas** — usuário de outro clube recebe 404.
- [x] `PATCH` com campo inválido → 400 com `details` apontando o campo.
- [x] `PUT /books/:bookId/plan` preserva o `id` do item sobrevivente, provado **pela rota**.
- [x] `[InvalidBookError, 400]` e `[BookNotFoundError, 404]` registrados **e** os dois nomes
      removidos de `NOT_YET_MAPPED`.
- [x] `pnpm -r test`, `test:integration`, `pnpm -r typecheck`, `pnpm lint` passam. Sem `any`.
      **523 unit + 151 integração no backend, 135 em `shared`** (809 no total).
- [x] Banco limpo no fim: zero fixtures `t07-`, super-admin intacto.
- [x] Marcar `BACKLOG.md` + esta "Definição de pronto", reportar feito vs definição e
      **parar**.
