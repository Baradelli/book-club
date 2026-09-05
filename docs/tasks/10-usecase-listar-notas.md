# Tarefa 10 — UseCases `listNotes(filter)` e `listPlanItemWriters(bookId)`

> Fecha o **domínio** do Bloco C. É a fatia que alimenta o filtro geral
> **Tudo · Minhas · de \<pessoa\>** e a sobreposição de "quem já escreveu" na tela do livro.
> Domínio puro, TDD estrito contra fakes.
> **Sem Prisma, sem migration, sem rota, sem tela** — isso é a Tarefa 11.
>
> Leia antes: `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md`,
> **`docs/adr/0002-visibilidade-total-no-clube.md`** (é a regra que define o que esta fatia
> significa), `docs/tasks/08-usecase-note.md` e `docs/tasks/09-usecases-editar-arquivar-nota.md`.

## Objetivo

Eu vejo o que o clube escreveu, e escolho como olhar: deste livro, desta pessoa, deste dia de
leitura, com esta palavra. E, ao abrir um livro, vejo em quais dias cada pessoa já escreveu.

## Decisões já tomadas (do BACKLOG e dos ADRs — não reabrir)

- **O filtro é NAVEGAÇÃO, não permissão.** Toda nota de um clube é visível para todo membro
  ativo dele, desde o instante em que é salva. `Tudo · Minhas · de X` é uma forma de olhar o
  mesmo acervo — **nunca** implemente nem rotule como privacidade. → ADR 0002.
- Entre clubes a barreira é total: sem `Membership` ativo → **404**.
- **Busca é `ILIKE` no `plainText`.** Sem embeddings, sem `pgvector`. → "Decisões fechadas do
  MVP 2" no `BACKLOG.md`.
- **Progresso do grupo é calculado**, nunca guardado — e "quem escreveu em cada dia" é da
  mesma família: sai das notas, não de um contador.
- Arquivada é invisível (não há tela de arquivadas no MVP 1).

## ⚠️ A decisão de fatiamento que precisa do dono ANTES de executar

### A sobreposição de autoria sai como UseCase **separado**, e a agregação é da Tarefa 11

O `CLAUDE.md` dá como exemplo de agregação: "`getBookWithPlan` devolve livro + plano + **quem
já escreveu**". O instinto é crescer aquele UseCase aqui. **Não dá, e o motivo é concreto:**

`GetBookWithPlan` **já está ligado a uma rota viva** (`GET /books/:bookId`, Tarefa 07). Um
quarto parâmetro no construtor quebra `src/routes/book-routes.ts`, que passaria a precisar de
`repositories.notes` — e o `buildRepositories` **não expõe `notes`**, porque o
`PrismaNoteRepository` é da Tarefa 11. Crescer o UseCase aqui arrastaria a rota, o
`buildRepositories`, o repositório Prisma e o schema Zod da resposta para dentro desta fatia.

É a **lição da Tarefa 08 num nível acima**: lá a spec proibia tocar `src/repositories/` e ao
mesmo tempo mandava um port crescer, o que quebra o `implements`. Aqui a regra é a mesma
família — **um construtor de UseCase não cresce sem a fiação dele.**

E há um segundo motivo, do §6.1 do `docs/CONVENCOES-CODIGO.md`: o `serializerCompiler` do Zod
**descarta campo não declarado no `response`**. Um `writers` que o UseCase devolvesse hoje
sairia da rota **silenciosamente apagado** até alguém crescer o schema em `shared/`. Campo que
existe e não chega é pior que campo ausente.

**Proposta:** esta fatia entrega `listPlanItemWriters(bookId)` como UseCase próprio, testado
contra fake. A **Tarefa 11** decide como agregar — compondo os dois UseCases na rota (o que o
`CLAUDE.md` chama de "o Fastify agrega para o front") ou crescendo o `getBookWithPlan` lá,
onde rota, repositório e schema estão na mesma fatia. **Registrar isso na linha 11 do
`BACKLOG.md` é parte desta tarefa.**

### E a pergunta que segue em aberto (sexta tarefa seguida)

**Clube arquivado continua legível?** O `assertMembership` confere o status do *membership*,
nunca o do *clube*. Esta fatia acrescenta **duas leituras** ao conjunto. Herda o comportamento
atual sem mudá-lo.

## Ports — o que cresce

`NoteRepository` ganha **dois** métodos:

```ts
export interface NoteFilter {
  /** OBRIGATÓRIO. É o corte de tenant, sempre em AND com o resto. */
  clubId: string;
  bookId?: string;
  /** O autor. É o "de \<pessoa\>" do filtro. */
  authorId?: string;
  kind?: NoteKind;
  planItemId?: string;
  /** Substring case-insensitive em `plainText`. Ver as regras 6–8. */
  text?: string;
  /** Ausente = os dois status. */
  status?: GeneralStatus;
}

/**
 * Sem promessa de ordem: quem ordena é o `listNotes`, porque a ordem é regra
 * de produto, não de persistência.
 */
find(filter: NoteFilter): Promise<Note[]>;

/**
 * Os pares (dia de leitura, autor) das notas ATIVAS de um livro.
 *
 * Método próprio, e não um `find` seguido de `map`, por um motivo de peso: o
 * `doc` é a maior coluna da tabela (ProseMirror JSON), e carregar as ~60 notas
 * de um livro inteiras para calcular uma sobreposição de autoria é trafegar
 * o acervo do clube para desenhar bolinhas na tela. Aqui o Prisma faz
 * `select` de duas colunas.
 */
planItemWritersByBook(bookId: string): Promise<PlanItemWriter[]>;
```

```ts
/** Em `src/domain/note.ts`. */
export interface PlanItemWriter {
  planItemId: string;
  userId: string;
}
```

### O fake tem duas obrigações de fidelidade — e uma armadilha deliberada

1. **`text` é case-insensitive e NÃO é accent-insensitive.** `ILIKE` do Postgres compara sem
   olhar caixa, mas **não** ignora acento: `'coração' ILIKE '%coracao%'` é **falso**. Um fake
   que normalizasse acentos seria infiel na direção permissiva — o teste passaria e a busca
   real não acharia. É a classe do ADR 0007, agora na terceira aparição. (Busca sem acento
   exigiria a extensão `unaccent`; se um dia for pedida, é Tarefa 29, com migration e ADR.)
2. **`text` casa só `plainText`** — não `title`, não `reference`. É decisão fechada do MVP 2
   ("busca é `ILIKE` no `plainText`/`commentText`"), e a spec de tarefa não a reabre.
3. **O fake enumera em ordem INVERSA à de inserção**, nos dois métodos. É deliberado: a
   Tarefa 07 descobriu um teste de ordenação que passava com a implementação errada porque os
   fixtures estavam na ordem esperada. Um fake que devolva na ordem "natural" deixa um
   `listNotes` sem `sort` passar. Documente isso no fake, senão alguém "conserta" a
   ordem achando que é bug.

## Contratos dos UseCases

```ts
// src/usecases/list-notes.ts
export interface ListNotesInput {
  actorUserId: string;
  /** OBRIGATÓRIO: é a âncora de tenant, como no `listBooks`. */
  clubId: string;
  bookId?: string;
  authorId?: string;
  kind?: NoteKind;
  planItemId?: string;
  text?: string;
}
export type ListNotesOutput = Note[];
// deps: AssertMembership, NoteRepository
```

```ts
// src/usecases/list-plan-item-writers.ts
export interface ListPlanItemWritersInput {
  actorUserId: string;
  bookId: string;
}
export interface PlanItemWriters {
  planItemId: string;
  /** Ordenado, para a saída ser determinística. */
  userIds: string[];
}
export type ListPlanItemWritersOutput = PlanItemWriters[];
// deps: AssertMembership, BookRepository, ReadingPlanItemRepository, NoteRepository
```

Por que o `clubId` é do input no `listNotes` (e não tirado de um livro): é o mesmo caso do
`listBooks` — **não há recurso de onde tirá-lo**, e quem faz o corte é o `assertMembership`.
Clube em que o ator não é membro ativo é **404, exista ele ou não**.

## Regras de negócio (o que os testes provam)

### `NoteRepository.find` e o fake

1. `clubId` é sempre AND: nota de **outro clube** nunca aparece, nem quando os outros filtros
   casam perfeitamente.
2. `bookId` filtra.
3. `authorId` filtra.
4. `kind` filtra (`PLAN` × `FREE`).
5. `planItemId` filtra.
6. `text` é **substring case-insensitive** em `plainText` (`'PODER'` acha `'o poder'`).
7. `text` **não** ignora acento: `'coracao'` **não** acha `'coração'`, e vice-versa. Teste
   explícito, com comentário citando o `ILIKE`.
8. `text` **não** casa `title` nem `reference` — só `plainText`. Teste com uma nota cujo
   título contém a palavra e o `plainText` não: **não** aparece.
9. Filtros combinam com **AND** (livro + autor + `kind` + texto ao mesmo tempo).
10. `status` ausente devolve os dois; `status: 'ACTIVE'` devolve só ativas.
11. Os dois métodos enumeram em **ordem inversa** à inserção (a armadilha deliberada).
12. `planItemWritersByBook` devolve só notas **ACTIVE** com `planItemId` **não nulo** do livro
    pedido — avulsa não entra, arquivada não entra, nota de outro livro não entra.

### `listNotes`

13. Sem `Membership` **ativo** no `clubId` → `NotAMemberError` (404). Vale para membership
    arquivado.
14. **Não exige papel**: `MEMBER` lista. É o ADR 0002 — o acervo é do grupo.
15. **Nunca devolve arquivada** (o UseCase passa `status: 'ACTIVE'`).
16. Ordem **determinística**: `createdAt` decrescente, desempate por `id`. Provado contra o
    fake que enumera invertido.
17. O array devolvido é **cópia**: ordenar não muta o array do repositório.
18. `bookId` de **outro clube** → lista **vazia**, não erro. Não é vazamento: o `clubId` em AND
    já garante o corte, e um 404 aqui só diria "esse livro existe em outro lugar".
19. `authorId` que não escreveu nada → vazia.
20. `text` vazio, `''` ou só espaços → **ignorado** (não filtra nada). A normalização é do
    UseCase, não do repositório.
21. Filtros combinados chegam ao repositório como um `NoteFilter` só.
22. **O corte vem ANTES da consulta**: ator sem membership não gera nem uma chamada ao
    repositório (`findCalls === 0`).
23. Não vaza estado entre duas chamadas do mesmo instance.
24. **`clubId` do input não é contrabando**: ele É o parâmetro legítimo — o que a fatia tem de
    provar é que o `authorId` **não** vira um caminho para ler outro clube (nota de outro
    clube do mesmo autor não aparece).

### `listPlanItemWriters`

25. O corte de tenant é o `bookForActor` (livro inexistente/arquivado/de outro clube → 404;
    sem membership → 404). **Não exige papel.**
26. Devolve uma entrada por `planItemId` **que tem nota**, com `userIds` **ordenado**.
27. Item do plano **sem nota nenhuma não aparece** no array — o front sobrepõe no plano que
    ele já tem. (Devolver todos com `[]` duplicaria o plano na resposta.)
28. Duas pessoas no mesmo dia → **uma** entrada com **dois** `userIds`.
29. A mesma pessoa em dias diferentes → duas entradas.
30. A ordem do array segue a **ordem do plano** (`order` crescente), não a do repositório.
31. Notas **avulsas** não entram (não têm `planItemId`).
32. Notas **arquivadas** não entram.
33. Notas de **outro livro** não entram, mesmo do mesmo clube.
34. Um `planItemId` que não está no plano do livro (dado inconsistente) **não** aparece — o
    array é construído a partir do plano, não das notas.
35. Não vaza estado entre chamadas.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | **A agregação é da Tarefa 11** | Ver a seção ⚠️. É a única que mexe no BACKLOG. |
| B | Ordem do `listNotes` é `createdAt` desc | `updatedAt` desc parece melhor ("editadas recentemente"), mas a nota do dia é reescrita a cada autosave — a lista **pularia embaixo do dedo** de quem está digitando. Se a tela quiser outra ordem, ela ordena. |
| C | **Sem `includeArchived`** | O `listBooks` tem a flag porque a spec dele pediu. Aqui não há tela de arquivadas no MVP 1, e flag sem chamador é especulação (`WORKFLOW.md`). Quando a tela existir, é um parâmetro. |
| D | **Sem paginação nem limite** | Um clube de casal com 30 dias × 2 pessoas dá ~60 notas por livro. Registrado como dívida, não construído: paginar sem tela que pagine é inventar contrato. |
| E | `bookId` de outro clube → vazio, não 404 | 404 exigiria carregar o livro só para recusá-lo, e não esconde mais nada: o AND por `clubId` já corta. |
| F | Item sem nota não aparece no `listPlanItemWriters` | Devolver todos com `userIds: []` duplicaria o plano numa resposta que já vem ao lado dele. |
| G | `planItemWritersByBook` é método próprio do port | Um `find` + `map` carregaria o `doc` de todas as notas do livro — a maior coluna da tabela — para desenhar uma sobreposição. |

## Testes a escrever PRIMEIRO

```
src/usecases/__tests__/list-notes.test.ts               regras 13–24
src/usecases/__tests__/list-plan-item-writers.test.ts   regras 25–35
src/usecases/_fakes/__tests__/note-repository-fake.test.ts   crescer: 1–12
```

## Arquivos a tocar

```
NOVOS
  src/usecases/list-notes.ts
  src/usecases/list-plan-item-writers.ts
  + os 2 arquivos de teste novos

CRESCEM
  src/domain/note.ts                           +PlanItemWriter
  src/usecases/ports/note-repository.ts        +NoteFilter, +find, +planItemWritersByBook
  src/usecases/_fakes/note-repository-fake.ts  +os 2 métodos, +findCalls
  src/usecases/_fakes/__tests__/note-repository-fake.test.ts
  CONTEXT.md                                   se `PlanItemWriter` merecer entrada
```

**Não tocar:**

- `packages/backend/prisma/**` — o modelo `Note` é da Tarefa 11.
- `src/usecases/get-book-with-plan.ts` — **é a proibição central desta fatia.** Ele está
  ligado à rota da Tarefa 07; crescer o construtor dele quebra `src/routes/book-routes.ts` e
  exige um `PrismaNoteRepository` que não existe. Se você concluir que precisa mexer, **pare e
  reporte.**
- `src/routes/**`, `src/http/**` (não há erro novo nesta fatia — nenhuma classe nova, nenhum
  status novo, `NOT_YET_MAPPED` continua vazio).
- `src/repositories/**` — **verifique com `pnpm -r typecheck`** que crescer o `NoteRepository`
  não obriga implementação nenhuma. Não presuma: foi exatamente essa presunção que quebrou na
  Tarefa 08.
- `src/usecases/{upsert-plan-note,create-free-note,edit-note,archive-note,note-for-author}.ts`
  — as Tarefas 08 e 09 estão fechadas e auditadas. Confirme por `md5sum`.
- `packages/shared/**`, `packages/ui/**`, `packages/app/**`.

## Fora de escopo

- Repo Prisma de `Note`, migration, índices, rotas `/notes`, teste de integração de tenant →
  Tarefa 11.
- A **agregação** de `writers` na resposta do livro → Tarefa 11 (ver ⚠️).
- Filtro por **capítulo/intervalo de datas** e o filtro completo → Tarefa 26 (MVP 2).
- Busca **sem acento** (`unaccent`), ranking, destaque de trecho → Tarefa 29 (MVP 2), com
  migration e ADR próprios.
- Paginação, `limit`, cursor.
- Contagem de notas por pessoa, progresso, `ReadingLog` → MVP 3.
- Qualquer noção de nota privada, rascunho ou "publicar". É o ADR 0002.

## Definição de pronto

- [x] `find` com as regras 1–12, incluindo **a 7 (acento) e a 8 (só `plainText`)**, cada uma
      com teste explícito e comentário dizendo por que a semântica é essa.
- [x] O fake enumera em **ordem inversa** nos dois métodos, documentado no código (regra 11).
- [x] `listNotes` com as regras 13–24; em especial: **ordem determinística provada contra o
      fake invertido** (16), **arquivada nunca aparece** (15), **corte antes da consulta**
      (22) e **`authorId` não atravessa clube** (24).
- [x] `listPlanItemWriters` com as regras 25–35; em especial: **avulsa e arquivada fora**
      (31/32), **`userIds` ordenado** (26) e **a ordem do array é a do plano** (30).
- [x] Nenhuma classe de erro nova; `NOT_YET_MAPPED` continua vazio; `src/http/` intocado.
- [x] `get-book-with-plan.ts` **byte-idêntico** (md5), e os 5 UseCases das Tarefas 08/09
      também.
- [x] `pnpm -r typecheck`, `pnpm lint` e `pnpm prettier --check .` limpos.
- [x] `pnpm test` verde, com a contagem colada no relatório. — **908 unitários / 40 arquivos**
      (era 819/38 antes da fatia; 906/40 na entrega, +2 na rodada de correção). Integração
      **não rodada** (toca o banco de desenvolvimento do dono; esta fatia não tem teste de
      integração).
- [x] `prisma/`, `src/routes/`, `src/repositories/`, `shared/`, `ui/` e `app/` intocados —
      **verificado**, não presumido.
- [ ] A linha **11** do `BACKLOG.md` registra que a agregação de `writers` (rota + schema Zod
      em `shared/` + `buildRepositories.notes`) é dela. — **do orquestrador**: quem mexe no
      `BACKLOG.md` não é o executor.
- [ ] Checklist marcada e linha 10 do `BACKLOG.md` fechada com o que foi entregue. — checklist
      marcada; a **linha 10 do `BACKLOG.md`** fica para o orquestrador, pelo mesmo motivo.

### Rodada de correção (auditoria por mutação — 43 mutantes, 2 cegueiras reais)

Cada item foi consertado pelo método mutante-primeiro: aplicar o mutante, confirmar VERDE (o
mutante sobrevive), escrever o teste, confirmar VERMELHO, restaurar e confirmar VERDE, com
`md5sum` provando a restauração.

- [x] **O plano não é lido antes do corte de tenant** (era cegueira: mover só
      `planItems.findByBook` para antes do `bookForActor` sobrevivia a 906 testes). O
      `ReadingPlanItemRepositoryFake` ganhou `findByBookCalls`, no padrão do `saveManyCalls`,
      e os dois testes de "corte antes da consulta" passaram a afirmar o que o comentário
      deles já prometia (`findByBookCalls === 0`). **2 acusadores.** O fake é das Tarefas
      05/06 e foi tocado com autorização explícita, só para isto; suas suítes seguem verdes.
- [x] **`NULL` não casa `= 'x'` no `find`** (era cegueira: `stored === null ||` a mais no
      `matches` sobrevivia). Teste novo em `describe('find')`: nota **avulsa** no store +
      filtro por `planItemId` devolve só a do dia. É a **quarta** aparição da classe do
      ADR 0007 nesta fatia, e era a única sem teste. **1 acusador.**
- [x] **Duas asserções não pinam mais a ordem do fake**: `find > returns both statuses...`
      ordena antes de comparar e `planItemWritersByBook > returns one pair per author...` usa
      `arrayContaining` + `toHaveLength`. A ordem continua com os dois testes dedicados
      (`enumerates in reverse insertion order`), que são o único lugar onde ela é assunto.
- [x] **As duas asserções vazias desta fatia foram trocadas pela saída real.** Os testes
      `never raises ForbiddenRoleError on a read` viraram `hands a plain MEMBER the
      notes of the club / the overlay instead of demanding a role`. Medido: com os dois
      UseCases mutilados para `return []`, as quatro ocorrências do padrão no repositório
      continuavam verdes. As de `list-books.test.ts:100` e `get-book-with-plan.test.ts:179`
      **ficam como estão** (fatias fechadas) e estão registradas no §7.4.
- [x] **`docs/CONVENCOES-CODIGO.md` ganhou o §7, "Convenções de fake e de teste"** — sete
      convenções que viviam só em docstring de arquivo de teste, e é por isso que a asserção
      vazia voltou depois de já ter sido condenada na Tarefa 08.
- [x] O docstring do `find` no port declara que `%`, `_` e `\` são **literais** no contrato e
      que escapar é do repositório Prisma (Tarefa 11). O fake **não** mudou.
- [x] Os 8 UseCases seguem **byte-idênticos** (md5 conferido depois de cada restauração),
      incluindo `list-notes.ts` e `list-plan-item-writers.ts`, que foram mutados e restaurados.
- [x] `pnpm --filter @clube/backend test` **908/40 verde**; `pnpm -r typecheck`, `pnpm lint` e
      `pnpm prettier --check .` limpos. Integração **não rodada**.
