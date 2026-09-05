# Tarefa 06 — UseCases `editBook` · `archiveBook` · `listBooks` · `getBookWithPlan` · `replacePlanItems`

> Continua o **Bloco B**. Fecha o domínio do livro: editar, arquivar, listar, ler com o plano
> e substituir o plano. Domínio puro e TDD estrito contra fakes, como a Tarefa 05.
> **Sem Prisma, sem migration, sem rota** — isso é a Tarefa 07.
>
> Leia antes: `CLAUDE.md`, `docs/tasks/05-usecase-book-plano.md` (esta fatia reusa
> `Book`, `ReadingPlanItem`, `calendar-day.ts`, `InvalidBookError` e os dois fakes) e
> `docs/CONVENCOES-CODIGO.md` §6.

## Objetivo

O admin do clube corrige o cadastro do livro, arquiva o que acabou e **reescreve o plano de
leitura sem destruir o que as pessoas já escreveram**. Qualquer membro ativo lista os livros
do clube e abre um livro com o plano ordenado.

## Decisões já tomadas (do BACKLOG — não reabrir)

- Editar livro e plano exige `Membership.role ∈ {OWNER, ADMIN}`; **ler exige apenas
  membership ativo** (o livro é do grupo).
- Sem membership ativo no clube do livro → **404**, nunca 403.
- Soft delete no `Book` (`status` + `archivedAt`); hard delete só do que já está arquivado.
- Plano com datas únicas por livro, `order` crescente, `title` do item obrigatório.
- **Ninguém edita conteúdo de outra pessoa.** O admin manda no livro e no plano, **não** no
  que os outros escreveram. → `docs/plano-clube-do-livro.md` §2.

## ⚠️ Duas decisões de fatiamento que precisam do dono ANTES de executar

### 1. `getBookWithPlan` **não** agrega "quem já escreveu em cada dia" nesta fatia

A linha 06 do `BACKLOG.md` diz "`getBookWithPlan` (agrega o plano + quem já escreveu em cada
dia)". **Proponho tirar essa metade daqui**, por um motivo concreto: `Note` não existe — nem
a entidade (Tarefa 08), nem a tabela (a migration do `Note` vem no Bloco C, Tarefa 11). Não
há implementação real possível antes disso.

As alternativas e por que as descartei:

- **Criar um port `PlanWritersReader` agora e implementá-lo na Tarefa 11.** O UseCase ficaria
  testado só contra fake por cinco tarefas, e a rota da Tarefa 07 não teria o que injetar.
- **Devolver `writers: []` até a Tarefa 11.** Pior de todas: um campo que existe, parece
  dado real e está permanentemente vazio. A tela da Tarefa 17 mostraria "ninguém escreveu"
  com convicção.

**Quem precisa disso é a Tarefa 17** (tela do livro, Bloco D) — depois de todo o Bloco C.
Então a proposta é: nesta fatia `getBookWithPlan` devolve **livro + plano ordenado**, e a
sobreposição de autoria entra no Bloco C, onde `listNotes` já existe e o dado é real.

**Se o dono aprovar**, é preciso registrar isso no `BACKLOG.md`: acrescentar à linha **10**
(ou como um item novo no Bloco C) o UseCase que devolve "quem escreveu em cada `planItemId`
de um livro". Não deixar a promessa órfã.

### 2. `replacePlanItems` faz **diff por data**, não apaga-e-recria

O nome sugere "apaga tudo e insere de novo". **Isso destruiria anotações.** `Note.planItemId`
tem FK para `ReadingPlanItem` (`docs/plano-clube-do-livro.md` §6), e a anotação do dia é
`unique(planItemId, userId)` — ou seja, cada nota do dia está amarrada ao **id** daquele item
do plano. Recriar os itens com ids novos:

- com `onDelete: Restrict` (o default que a Tarefa 03 herdou) → **erro de FK**, a operação
  simplesmente falha depois que existir uma nota;
- se alguém "consertar" pondo `Cascade` → **apaga as anotações das pessoas**, violando "o
  admin não mexe no que os outros escreveram".

Então o desenho é **diff pela `date`**, que é a chave natural do dia de leitura:

- data que **já existe** no plano → o item é **atualizado no lugar**, mantendo o **mesmo
  `id`** (a nota daquele dia sobrevive), com `title`, `reference` e `order` novos;
- data **nova** → item novo, `id = randomUUID()`;
- data que **desapareceu** → item removido.

Isso resolve o caso real dominante ("errei o tema do dia 12", "empurrei o plano"), custa o
mesmo, e evita uma migração dolorosa depois. **A remoção de um item que já tem nota** precisa
de guarda — mas a guarda só pode existir quando `Note` existir, então ela é **explicitamente
Bloco C** e está registrada no "Fora de escopo" abaixo.

## Mini-domínio (só o que cresce)

Nada de entidade nova. Um erro novo em `src/domain/errors.ts`:

```ts
export class BookNotFoundError extends Error {}   // vira 404 na borda
```

> **Atenção à pendência que a Tarefa 05 deixou:** `handle-domain-error.test.ts` tem uma lista
> `NOT_YET_MAPPED` com `'InvalidBookError'`, e o teste de exaustividade exige status para toda
> classe exportada de `domain/errors.ts`. Ao acrescentar `BookNotFoundError`, **acrescente-o
> também a `NOT_YET_MAPPED`** (a Tarefa 07 é que registra os dois status e limpa a lista).
> Se não fizer isso, a suíte fica vermelha — de propósito.

E a **extração** da validação de plano que hoje vive dentro do `create-book.ts`, porque
`replacePlanItems` precisa exatamente da mesma:

`src/domain/reading-plan.ts`:

```ts
export interface PlanItemDraft {
  date: string;
  title: string;
  reference?: string;
}

/**
 * Valida o rascunho do plano e devolve as linhas normalizadas, em ordem.
 * Lança InvalidBookError. Não gera id, não conhece bookId — quem faz isso é o UseCase.
 */
export function normalizePlanDrafts(
  drafts: readonly PlanItemDraft[],
): Array<{ order: number; date: CalendarDay; title: string; reference: string | null }>;
```

**É refactor, não comportamento novo:** `createBook` passa a chamar `normalizePlanDrafts`, e
os 50 testes dele têm de continuar verdes **sem alteração**. Mova para
`src/domain/__tests__/reading-plan.test.ts` os testes que são de validação de plano pura, e
mantenha em `create-book.test.ts` os que provam a integração (atomicidade, `bookId`, ids
distintos).

## Ports — o que cresce

`BookRepository` (era só `save`):

```ts
export interface BookRepository {
  save(book: Book): Promise<Book>;
  byId(id: string): Promise<Book | null>;
  update(id: string, patch: Partial<Book>): Promise<Book>;
  find(filter: { clubId: string; status?: GeneralStatus }): Promise<Book[]>;
}
```

`ReadingPlanItemRepository` (era só `saveMany`):

```ts
export interface ReadingPlanItemRepository {
  saveMany(items: ReadingPlanItem[]): Promise<ReadingPlanItem[]>;
  findByBook(bookId: string): Promise<ReadingPlanItem[]>;
  deleteMany(ids: readonly string[]): Promise<void>;
}
```

> `saveMany` é **upsert por `id`** (a convenção que a Tarefa 03 fixou para `save`), e é isso
> que faz o diff funcionar sem um `update` separado: os sobreviventes voltam com o mesmo id.

Os fakes crescem junto, e as suítes deles também: `find` respeitando o filtro de `status`,
`findByBook` devolvendo **em ordem de `order`**, `deleteMany` apagando só os ids pedidos e
`deleteMany` de id inexistente **não** estourando (é remoção idempotente, diferente do
`update`). Mantenha o clone de `Date` e a emulação dos dois índices únicos.

## Contratos dos UseCases

Todos recebem `actorUserId` e resolvem o clube **a partir do livro**, nunca do input — é o
que impede pedir um livro de outro clube passando o `clubId` "certo".

`src/usecases/edit-book.ts`

```ts
export interface EditBookInput {
  actorUserId: string;
  bookId: string;
  title?: string;
  author?: string | null;
  month?: string;
  coverUrl?: string | null;
  totalPages?: number | null;
}
// Output: Book
// Depende de: AssertMembership, BookRepository
```

`src/usecases/archive-book.ts`

```ts
{ actorUserId: string; bookId: string } -> Book
// Depende de: AssertMembership, BookRepository
```

`src/usecases/list-books.ts`

```ts
{ actorUserId: string; clubId: string; includeArchived?: boolean } -> Book[]
// Depende de: AssertMembership, BookRepository
```

`src/usecases/get-book-with-plan.ts`

```ts
{ actorUserId: string; bookId: string } -> { book: Book; planItems: ReadingPlanItem[] }
// Depende de: AssertMembership, BookRepository, ReadingPlanItemRepository
```

`src/usecases/replace-plan-items.ts`

```ts
{ actorUserId: string; bookId: string; planItems: PlanItemDraft[] }
  -> { planItems: ReadingPlanItem[]; created: number; updated: number; removed: number }
// Depende de: AssertMembership, BookRepository, ReadingPlanItemRepository
```

## Regras de negócio (o que os testes provam)

**Comuns aos cinco** (cada uma testada em **todos** os UseCases a que se aplica — é o corte
de tenant, e ele não é opcional)

1. Livro inexistente → `BookNotFoundError`. Livro `ARCHIVED` → `BookNotFoundError` em
   `editBook`, `archiveBook`, `getBookWithPlan` e `replacePlanItems` (livro arquivado é
   invisível; desarquivar é MVP 4).
2. Ator sem membership ativo **no clube do livro** → `NotAMemberError` (**404**, não 403).
3. Escrita (`editBook`, `archiveBook`, `replacePlanItems`) exige `ADMIN_ROLES`; ator `MEMBER`
   → `ForbiddenRoleError`. **Leitura** (`listBooks`, `getBookWithPlan`) exige só membership
   ativo — `MEMBER` **pode**.
4. O clube usado no guard vem de `book.clubId`, **nunca** do input.

**`editBook`**

5. Campo ausente no input **não** é alterado (`undefined` = ausência). `null` explícito em
   `author`, `coverUrl` e `totalPages` **limpa** o campo.
6. `title` presente e vazio/só-espaços → `InvalidBookError`; válido → `trim`.
7. `month` presente e reprovado por `isClubMonth` → `InvalidBookError`.
8. `totalPages` presente e ≤ 0 ou não inteiro → `InvalidBookError`.
9. `author`/`coverUrl` só-espaços → `null`; com espaços nas pontas → `trim`.
10. `clubId`, `createdById`, `status`, `archivedAt`, `createdAt` e `id` **não** são
    editáveis, nem se vierem no input (o tipo não os aceita, e há teste de runtime).
11. Input sem nenhum campo editável → devolve o livro inalterado, sem erro.

**`archiveBook`**

12. Sucesso: `status = 'ARCHIVED'` e `archivedAt = new Date()`. Nada mais muda.
13. Livro já arquivado → `BookNotFoundError` (cai na regra 1).
14. **O plano não é apagado.** Arquivar o livro não toca nos `ReadingPlanItem` (o teste
    confere que `planRepo.saved` não mudou) — o acervo continua legível.

**`listBooks`**

15. Devolve só os livros do `clubId` pedido — nunca de outro clube (teste com dois clubes).
16. Por padrão devolve só `ACTIVE`; `includeArchived: true` devolve os dois.
17. Ordenado por `month` **decrescente**, e `createdAt` decrescente como desempate — o livro
    do mês corrente aparece primeiro. Ordem determinística, provada por teste.
18. Clube sem livro → `[]`, não erro.

**`getBookWithPlan`**

19. Devolve o livro e o plano **ordenado por `order` crescente**, mesmo que o repositório
    devolva fora de ordem (o teste embaralha o fake de propósito).
20. Livro sem plano → `planItems: []`.

**`replacePlanItems`**

21. Valida o rascunho inteiro com `normalizePlanDrafts` **antes** de escrever: datas válidas,
    únicas, estritamente crescentes, `title` obrigatório. Qualquer falha → `InvalidBookError`
    e **nada** é escrito nem apagado (nem `saveMany`, nem `deleteMany`).
22. Data que já existe → **mesmo `id`**, com `title`/`reference`/`order` atualizados.
23. Data nova → item novo com `id = randomUUID()`.
24. Data que desapareceu → o id é passado a `deleteMany`.
25. `order` é sempre **derivado da posição** no rascunho — inclusive para os sobreviventes,
    que podem mudar de posição.
26. Plano novo vazio (`[]`) → remove todos os itens e devolve `planItems: []`,
    `removed = <quantos havia>`. **Não** é erro.
27. Substituir o plano por um **idêntico** → `created = 0`, `updated = <n>`, `removed = 0`, e
    os ids são os mesmos de antes.
28. `created`/`updated`/`removed` são contagens corretas em todos os casos acima.
29. `createdAt` de um item sobrevivente **não** é regravado (era criado antes; o teste
    confere que continua o original).

## Decisões que assumi (revisar antes de executar)

- **As duas decisões de fatiamento acima** — a autoria diferida e o diff por data. São as que
  mais importam; as outras são detalhe.
- **Livro arquivado é invisível para leitura e escrita** (regra 1), igual ao clube arquivado
  na Tarefa 01. Consequência: não há como desarquivar por estes UseCases — é MVP 4 (Tarefa 45).
  Se você quiser `getBookWithPlan` abrindo livro arquivado (para consultar acervo antigo),
  eu tiro o `getBookWithPlan` da regra 1 e ele passa a devolver arquivado também.
- **Leitura exige só membership ativo, não papel** (regra 3). É o princípio "o livro é do
  grupo". Um `MEMBER` que não pode listar os livros do próprio clube não faria sentido.
- **`editBook` distingue `undefined` (não mexe) de `null` (limpa).** É a mesma semântica que
  o `update(id, patch)` dos repositórios já tem, e foi auditada na Tarefa 03. Sem isso não há
  como apagar um `author` digitado errado.
- **`editBook` não muda `month` para "mover" o livro de mês com plano incoerente.** Não valido
  `month` contra as datas do plano, pela mesma razão da Tarefa 05: a virada de mês é legítima.
- **`listBooks` ordena por `month` desc.** É `string` `"YYYY-MM"`, então ordena
  lexicograficamente igual ao calendário — o mesmo truque (e a mesma dependência de formato)
  do plano. Alternativa: ordenar por `createdAt`, que erra quando se cadastra o livro de
  novembro antes do de outubro.
- **O terceiro critério de ordenação do `listBooks` é o `id` ascendente**, depois de `month`
  desc e `createdAt` desc. O sentido invertido em relação aos outros dois é **arbitrário de
  propósito**: `id` é `randomUUID()`, não carrega significado nenhum, e o objetivo do critério
  não é ordenar "melhor" — é só garantir que a ordem **não dependa de como o repositório
  enumerou as linhas** (ordem de inserção no `Map` do fake, não especificada no Prisma). Só
  entra em jogo quando `month` **e** `createdAt` empatam, o que acontece quando dois livros
  são cadastrados no mesmo lote.
- **`replacePlanItems` devolve contagens** (`created`/`updated`/`removed`) em vez de só a
  lista. A tela da Tarefa 20 vai querer dizer "3 dias adicionados, 1 removido" antes de
  confirmar, e é barato calcular aqui.
- **`deleteMany` de id inexistente não estoura**, diferente do `update`. Remoção é
  idempotente; um retry da mesma operação não pode falhar.
- **Não crio `unarchiveBook`, `deleteBook` nem paginação em `listBooks`.** Um clube lê ~12
  livros por ano; paginar é otimização sem caso de uso.

## Testes a escrever PRIMEIRO (Vitest, fakes)

- `src/domain/__tests__/reading-plan.test.ts` — a validação pura, migrada e ampliada.
  **Inclua o teste que a auditoria da Tarefa 05 exigiu:** data malformada em posição > 0
  (`'2026-9-30'` depois de `'2026-10-01'`), com a pré-condição de que ela ordena depois.
- `src/usecases/__tests__/edit-book.test.ts`
- `src/usecases/__tests__/archive-book.test.ts`
- `src/usecases/__tests__/list-books.test.ts`
- `src/usecases/__tests__/get-book-with-plan.test.ts`
- `src/usecases/__tests__/replace-plan-items.test.ts`
- As suítes dos dois fakes, ampliadas para os métodos novos.

Em **cada** UseCase, os quatro casos de guard (livro inexistente · livro arquivado · sem
membership · papel insuficiente onde se aplica), e a asserção de que **nada foi escrito** nos
caminhos de erro. Em `replacePlanItems`, "nada escrito" inclui **nada apagado**.

Reuse `AssertMembership` **real** sobre o `MembershipRepositoryFake`, como as Tarefas 05 e 02
fazem — não um dublê.

E, pela lição da Tarefa 05: **um teste por UseCase que chama `execute()` duas vezes na mesma
instância** e confere que o segundo resultado não herda estado do primeiro.

## Arquivos a tocar

- `src/domain/errors.ts` (+`BookNotFoundError`) · `src/domain/reading-plan.ts` (novo,
  extraído de `create-book.ts`).
- `src/usecases/ports/book-repository.ts` · `reading-plan-item-repository.ts` (crescem).
- `src/usecases/_fakes/` — os dois fakes crescem, mais as suítes.
- `src/usecases/{edit-book,archive-book,list-books,get-book-with-plan,replace-plan-items}.ts`
  + os cinco testes (novos).
- `src/usecases/create-book.ts` — **só** para passar a usar `normalizePlanDrafts`.
- `src/usecases/__tests__/create-book.test.ts` — só a migração dos testes de validação pura.
- `src/http/__tests__/handle-domain-error.test.ts` — **só** acrescentar `'BookNotFoundError'`
  a `NOT_YET_MAPPED`.
- `src/test-support/builders.ts` se precisar.
- **Não** tocar: `packages/shared|ui|app`, `prisma/` (schema e migrations),
  `src/repositories/`, `src/routes/`, `src/http/handle-domain-error.ts`, e nenhuma regra das
  Tarefas 01–05.

## Fora de escopo

- Repos Prisma, migration de `Book`/`ReadingPlanItem`, teste de contrato e as rotas — Tarefa 07,
  que também **registra `[InvalidBookError, 400]` e `[BookNotFoundError, 404]`** e limpa a
  `NOT_YET_MAPPED`.
- **"Quem já escreveu em cada dia"** — Bloco C (ver a decisão de fatiamento 1).
- **A guarda de "não remover item do plano que já tem nota"** — Bloco C, quando `Note`
  existir. Registre como pendência no `BACKLOG.md` junto da Tarefa 11.
- `unarchiveBook`, `deleteBook`, paginação, "empurrar o plano N dias" — MVP 4.
- `Note`, `Highlight`, `ReadingLog`. Telas. Schemas Zod em `shared`.

## Definição de pronto

- [x] `BookNotFoundError` criado **e** acrescentado a `NOT_YET_MAPPED` (suíte verde).
- [x] `normalizePlanDrafts` extraído, com `create-book.ts` usando-o e os **50 testes do
      `createBook` verdes sem alteração de comportamento**.
- [x] Os cinco UseCases implementados, dependendo só de interfaces.
- [x] Ports e fakes crescidos, com as suítes cobrindo `find`, `findByBook` (ordenado),
      `deleteMany` (inclusive id inexistente) e o clone de `Date` mantido.
- [x] Testes escritos **antes**, todos verdes, cobrindo as 29 regras. **546 unit no pacote**
      (era 316; +230 líquido, com 18 migrados do `create-book` para o `reading-plan`).
- [x] **Corte de tenant testado nos cinco UseCases** — sem membership → 404, e o clube vem de
      `book.clubId`, não do input.
- [x] Leitura funciona para `MEMBER`; escrita exige `OWNER`/`ADMIN` (testado nos dois
      sentidos).
- [x] `replacePlanItems` preserva o `id` e o `createdAt` do item cuja data sobrevive (provado
      por teste — é o que salva as anotações).
- [x] Nenhum caminho de erro escreve **nem apaga** nada.
- [x] Um teste por UseCase provando que `execute()` duas vezes na mesma instância não vaza
      estado.
- [x] As suítes das Tarefas 01–05 continuam verdes, com a mesma contagem por arquivo (salvo a
      migração declarada dos testes de plano).
- [x] `pnpm -r typecheck` e `pnpm lint` passam. Sem `any`.
- [x] Marcar `BACKLOG.md` + esta "Definição de pronto", registrar as duas pendências do
      Bloco C nas linhas certas, reportar feito vs definição e **parar**.
