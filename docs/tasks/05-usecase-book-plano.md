# Tarefa 05 — Domínio `Book` + `ReadingPlanItem` + UseCase `createBook`

> Abre o **Bloco B — Livro e plano de leitura**. Volta ao ritmo das Tarefas 01/02: domínio
> puro e TDD estrito contra fakes. **Sem Prisma, sem migration, sem rota, sem Zod em
> `shared`** — isso é a Tarefa 07.
>
> Leia antes: `CLAUDE.md` (camadas, TDD, a seção de datas e a de multi-tenant),
> `CONTEXT.md` (`Book`, `ReadingPlanItem`, "Plano de leitura", "Leitura de hoje"),
> `docs/plano-clube-do-livro.md` §6 (o esqueleto Prisma dos dois modelos) e
> `docs/CONVENCOES-CODIGO.md` §6 (o padrão que a Tarefa 04 estabeleceu).

## Objetivo

Um admin do clube cadastra o livro do mês **já com o plano de leitura dia por dia**, e o
sistema garante que o plano é coerente: um dia por data, datas em ordem crescente, cada dia
com um tema. É o que faz a anotação do dia nascer com assunto definido.

## Decisões já tomadas (do BACKLOG — não reabrir)

- **Plano de leitura com datas.** `ReadingPlanItem` tem `date` + `title` (o tema) +
  `reference`. **Datas únicas por livro e `order` crescente.**
- **`title` do item é obrigatório** — é o tema pré-definido do dia.
- Cadastrar livro e plano exige `Membership.role ∈ {OWNER, ADMIN}` — via `assertMembership`.
- **O livro é do grupo.** Aparece para todos os membros ativos do clube; quem manda nele é o
  admin do clube. → `docs/plano-clube-do-livro.md` §2.
- Soft delete no `Book` (`status` + `archivedAt`).
- Todo modelo de conteúdo carrega `clubId`.

## Mini-domínio (só desta fatia)

`src/domain/book.ts`:

```ts
import type { GeneralStatus } from './club';

export interface Book {
  id: string;
  clubId: string;
  title: string;
  author: string | null;
  month: string;           // "YYYY-MM" — o mês do clube
  coverUrl: string | null;
  totalPages: number | null;
  createdById: string;
  status: GeneralStatus;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface ReadingPlanItem {
  id: string;
  bookId: string;
  order: number;           // DERIVADO da posição no plano (0-based)
  date: CalendarDay;       // "YYYY-MM-DD" — dia de calendário, NÃO instante
  title: string;           // o tema: "Cap. 3 — A promessa"
  reference: string | null; // texto livre: "p. 45-62"
  createdAt: Date;
}
```

`src/domain/calendar-day.ts` — helpers puros, porque a mesma validação vale aqui, na borda
(Tarefa 07) e na tela de cadastro (Tarefa 20):

```ts
/** Dia de calendário no formato "YYYY-MM-DD". Não é um instante. */
export type CalendarDay = string;

/** "YYYY-MM-DD" com dia que existe de verdade (rejeita 2026-02-30). */
export function isCalendarDay(value: string): boolean;

/** "YYYY-MM" com mês entre 01 e 12. */
export function isClubMonth(value: string): boolean;
```

Erro novo em `src/domain/errors.ts` (segue o padrão: corpo com
`override readonly name`, conforme `docs/CONVENCOES-CODIGO.md`):

```ts
export class InvalidBookError extends Error {}   // vira 400 na borda
```

> **Só esse.** `BookNotFoundError` nasce na Tarefa 06, com `editBook`/`archiveBook` — não
> antecipar.

## Ports (mínimo desta fatia)

Só o que `createBook` usa. **Não** adicione `byId`, `find` ou `delete` — a interface cresce
com a Tarefa 06.

`src/usecases/ports/book-repository.ts`:

```ts
export interface BookRepository {
  save(book: Book): Promise<Book>;
}
```

`src/usecases/ports/reading-plan-item-repository.ts`:

```ts
export interface ReadingPlanItemRepository {
  saveMany(items: ReadingPlanItem[]): Promise<ReadingPlanItem[]>;
}
```

Fakes novos em `src/usecases/_fakes/`: `book-repository-fake.ts`,
`reading-plan-item-repository-fake.ts`. Sigam o molde já estabelecido, **incluindo o que as
auditorias das fatias anteriores exigiram**:

- `Map` privado, `clone()` interno, getter `saved`;
- **`clone()` copia as `Date`** (`Book.createdAt`, `Book.archivedAt` preservando `null`,
  `ReadingPlanItem.createdAt`), na leitura **e** na entrada do `save`/`saveMany`;
- **emulam os índices únicos que o `docs/plano-clube-do-livro.md` §6 declara**:
  `unique(bookId, date)` e `unique(bookId, order)` no plano. Violação lança `Error` cru
  (contrato do fake), **não** erro de domínio;
- suíte própria em `_fakes/__tests__/`.

Builders novos em `src/test-support/builders.ts`: `aBook`, `aPlanItem`.

## Contrato do UseCase

`src/usecases/create-book.ts`:

```ts
export interface CreateBookPlanItemInput {
  date: string;         // "YYYY-MM-DD"
  title: string;
  reference?: string;
}

export interface CreateBookInput {
  actorUserId: string;  // precisa ser OWNER/ADMIN do clube
  clubId: string;
  title: string;
  month: string;        // "YYYY-MM"
  author?: string;
  coverUrl?: string;
  totalPages?: number;
  planItems?: CreateBookPlanItemInput[];   // ausente ou [] = livro sem plano
}
// Output: { book: Book; planItems: ReadingPlanItem[] }
// Depende de: AssertMembership, ClubRepository, BookRepository,
//             ReadingPlanItemRepository
```

## Regras de negócio (o que os testes provam)

**Permissão e tenant**

1. Clube inexistente **ou** `ARCHIVED` → `ClubNotFoundError`.
2. Ator sem membership ativo → `NotAMemberError`; ator `MEMBER` → `ForbiddenRoleError`.
   **Reusar `assertMembership` com `ADMIN_ROLES`** — não reimplementar a regra de papel.

**O livro**

3. `title` vazio/só-espaços → `InvalidBookError`. Quando válido, `trim` aplicado.
4. `month` que não passa em `isClubMonth` → `InvalidBookError` (inclui `"2026-13"` e
   `"2026-1"`).
5. `totalPages` presente e ≤ 0, ou não inteiro → `InvalidBookError`. Ausente → `null`.
6. `author` e `coverUrl`: ausentes ou só-espaços → `null`; presentes → `trim`.
   (**Não** validar se `coverUrl` é uma URL — isso é Zod na borda, Tarefa 07.)
7. Defaults: `status = 'ACTIVE'`, `archivedAt = null`, `createdAt = new Date()`,
   `id = randomUUID()`, `createdById = actorUserId`, `clubId` do input.

**O plano**

8. `planItems` ausente ou `[]` → livro criado **sem** plano, e `planItems` do output é `[]`.
   Não é erro.
9. Item com `title` vazio/só-espaços → `InvalidBookError`. Quando válido, `trim`.
10. Item com `date` que não passa em `isCalendarDay` → `InvalidBookError` (inclui
    `"2026-02-30"`, `"05/10/2026"` e `"2026-10-5"`).
11. Duas datas iguais no plano → `InvalidBookError`.
12. Datas fora de ordem estritamente crescente → `InvalidBookError`. **Não reordenar em
    silêncio.**
13. `order` é **derivado** da posição no array (0, 1, 2, …) e **nunca** vem do input.
14. `reference` do item ausente/só-espaços → `null`; presente → `trim`.
15. Todo item carrega o `bookId` do livro criado, `id = randomUUID()` e
    `createdAt = new Date()`.

**Atomicidade da validação**

16. **Valida tudo antes de escrever qualquer coisa.** Se qualquer item do plano é inválido,
    **nada** é persistido — nem o livro. Os testes conferem `bookRepo.saved` **e**
    `planRepo.saved` vazios em todos os caminhos de erro.
17. No caminho de sucesso, livro e itens são persistidos (o teste confere os dois `saved`), e
    o output devolve exatamente o que foi salvo.

## Decisões que assumi (revisar antes de executar)

- **`date` é `string` "YYYY-MM-DD" no domínio, não `Date`.** Um dia de calendário não é um
  instante: representá-lo como `Date` obriga a escolher um fuso e é a origem clássica do bug
  "o plano do dia 5 aparece no dia 4". A conversão para a coluna `@db.Date` acontece **no
  repositório** (Tarefa 07), que é o único lugar que conhece o banco. Consequência: nesta
  fatia **não** existe cálculo instante↔dia, e portanto o helper `dayRange` do `CLAUDE.md`
  **não** entra aqui — ele nasce quando alguém precisar de "que dia é hoje" (Tarefa 06 ou a
  tela). Se você preferir `Date` em UTC-meia-noite no domínio, o `dayRange` teria de entrar
  já nesta fatia e todo teste passaria a carregar fuso.
- **`order` derivado da posição, 0-based.** O input não manda `order`: mandar dois campos que
  precisam concordar (`order` e a posição) é convite a divergirem. 0-based por ser índice de
  array; se preferir 1-based para o admin ler "dia 1", é uma linha.
- **Data fora de ordem é erro, não reordenação silenciosa.** Um plano colado fora de ordem é
  provavelmente erro de digitação, e a Tarefa 44 (colar uma lista) vai querer saber. Se
  preferir ordenar em silêncio, removo a regra 12 — mas então o `order` deixa de refletir o
  que o admin digitou.
- **Plano vazio é permitido** (regra 8). O caso real: cadastrar o livro assim que ele é
  escolhido e montar o plano depois, com `replacePlanItems` (Tarefa 06). Se você quiser
  exigir plano no cadastro, viro a regra 8 em erro.
- **`month` NÃO é conferido contra as datas do plano.** Um livro de outubro pode legitimamente
  ter plano que entra em novembro (leitura de 3/10 a 2/11). Conferir isso rejeitaria o caso
  real mais comum de virada de mês.
- **Não valido duplicidade de livro por `(clubId, month)`.** O §6 do plano não declara esse
  índice, e dois livros no mesmo mês é cenário plausível. "Livro corrente" está registrado
  como decisão em aberto no §11 do plano.
- **`saveMany` no port do plano, divergindo do vocabulário uniforme** (`save`/`byId`/
  `update`/`find`/`delete`) do `CLAUDE.md`. Motivo: o plano nasce como unidade de 30 linhas;
  um `save` por item seriam 30 idas ao banco e uma escrita parcial possível na Tarefa 07. Se
  preferir manter o vocabulário estrito, o UseCase faz o laço e a atomicidade fica sendo
  problema da transação na Tarefa 07.
- **Um só erro novo, `InvalidBookError`**, para tudo que é entrada malformada de livro ou de
  plano. Alternativa: um erro por família (`InvalidPlanError`). Achei ruído — na borda os
  dois viram 400 igual, e o `details` do `errorSchema` (Tarefa 04) é que diz **qual** campo.

## Testes a escrever PRIMEIRO (Vitest, fakes)

`src/domain/__tests__/calendar-day.test.ts` — helpers puros, TDD pesado (é validação de
data, o lugar onde erro passa batido):

- `isCalendarDay`: aceita `2026-10-05`; rejeita `2026-2-5`, `2026-02-30`, `2026-13-01`,
  `05/10/2026`, `''`, `'2026-10-05T00:00:00Z'`; aceita `2028-02-29` (ano bissexto) e rejeita
  `2027-02-29`;
- `isClubMonth`: aceita `2026-10`; rejeita `2026-1`, `2026-13`, `2026-00`, `2026-10-05`, `''`.

`src/usecases/__tests__/create-book.test.ts`:

- cria livro com defaults e plano de 3 dias, e persiste os dois (confere os dois `saved`);
- `order` sai 0, 1, 2 mesmo com o input sem `order`;
- clube inexistente → `ClubNotFoundError`; clube arquivado → `ClubNotFoundError`;
- ator sem membership → `NotAMemberError`; ator `MEMBER` → `ForbiddenRoleError`;
  ator `ADMIN` → sucesso; ator `OWNER` → sucesso;
- `title` vazio / só-espaços → `InvalidBookError`; `title` com espaços nas pontas → trim;
- `month` inválido (`2026-13`, `2026-1`) → `InvalidBookError`;
- `totalPages` 0 / negativo / fracionário → `InvalidBookError`; ausente → `null`;
- `author`/`coverUrl` ausentes → `null`; só-espaços → `null`; com espaços → trim;
- `planItems` ausente → livro sem plano, output `[]`; `planItems: []` → idem;
- item com `title` vazio → `InvalidBookError`; item com `title` com espaços → trim;
- item com `date` malformada (`2026-02-30`, `05/10/2026`) → `InvalidBookError`;
- datas repetidas → `InvalidBookError`;
- datas decrescentes e datas fora de ordem no meio → `InvalidBookError`;
- `reference` ausente/só-espaços → `null`; presente → trim;
- **todo caminho de erro afirma `bookRepo.saved` e `planRepo.saved` vazios** (regra 16).

`src/usecases/_fakes/__tests__/book-repository-fake.test.ts` e
`reading-plan-item-repository-fake.test.ts`: clone de `Date` nas quatro direções,
`archivedAt: null` seguindo `null` (não epoch), e os dois índices únicos do plano
recusando **antes** de escrever.

Ciclo red → green → refactor. Nenhuma implementação antes do teste correspondente falhar.

## Arquivos a tocar

- `src/domain/book.ts` · `calendar-day.ts` (novos) · `errors.ts` (+`InvalidBookError`).
- `src/usecases/ports/book-repository.ts` · `reading-plan-item-repository.ts` (novos).
- `src/usecases/_fakes/book-repository-fake.ts` ·
  `reading-plan-item-repository-fake.ts` + as duas suítes (novos).
- `src/usecases/create-book.ts` + `__tests__/create-book.test.ts` (novos).
- `src/domain/__tests__/calendar-day.test.ts` (novo).
- `src/test-support/builders.ts` (+`aBook`, `aPlanItem`).
- **Não** tocar: `packages/shared`, `packages/ui`, `packages/app`, `prisma/`
  (schema **e** migrations), `src/repositories/`, `src/routes/`, `src/http/`, e nenhuma
  regra das Tarefas 01–04.

## Fora de escopo

- `editBook`, `archiveBook`, `listBooks`, `getBookWithPlan`, `replacePlanItems` — Tarefa 06.
- Repositórios Prisma, **a migration dos dois modelos**, teste de contrato e as rotas
  `/clubs/:clubId/books` e `/books/:bookId` — Tarefa 07.
- Schemas Zod em `packages/shared` para livro/plano — Tarefa 07.
- `dayRange` e "leitura de hoje" — nasce onde alguém precisar calcular o dia corrente.
- `Note` e qualquer coisa de anotação — Bloco C.
- Tela de cadastro de livro — Tarefa 20. "Empurrar o plano N dias" — MVP 4.
- Capa como upload de arquivo (aqui `coverUrl` é só texto).

## Definição de pronto

- [x] Domínio `Book` + `ReadingPlanItem` + `calendar-day.ts` + `InvalidBookError` criados.
- [x] Ports `BookRepository` e `ReadingPlanItemRepository` com **só** os métodos desta fatia,
      mais os dois fakes com suíte própria (clone de `Date` e os índices únicos do plano).
- [x] `createBook` implementado, dependendo **só** de interfaces (nenhum import de Fastify,
      Prisma ou Zod em `src/usecases/`).
- [x] `createBook` reusa `assertMembership` com `ADMIN_ROLES` (não duplica a regra de papel).
- [x] Testes escritos **antes**, todos verdes, cobrindo as 17 regras. **316 unit no pacote**
      (126 desta fatia: create-book 50 · calendar-day 47 · reading-plan-item-fake 17 ·
      book-fake 9 · handle-domain-error +3). _Contagem no fechamento desta fatia; a Tarefa
      06 migrou 18 testes de `create-book.test.ts` para `domain/__tests__/reading-plan.test.ts`._
- [x] `order` é derivado da posição e o input não o aceita (provado por teste).
- [x] Nenhum caminho de erro persiste nada — nem o livro (provado em todos eles).
- [x] As suítes das Tarefas 01–04 continuam verdes, com a mesma contagem por arquivo.
- [x] `pnpm --filter @clube/backend typecheck` e `pnpm lint` passam. Sem `any`.
- [x] Marcar `BACKLOG.md` + esta "Definição de pronto", reportar feito vs definição e
      **parar**.
