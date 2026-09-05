# Tarefa 11 — Migration + repo Prisma de `Note` + rotas `/notes`

> **Fecha o Bloco C** e é a maior fatia da sequência: ela torna a anotação real. Migration,
> repositório Prisma com teste de contrato, as rotas, o teste de integração do corte de
> tenant — **e as seis pendências que as Tarefas 06, 08, 10 e o ADR 0008 registraram para
> cá**.
>
> Leia antes: `CLAUDE.md`, **`docs/CONVENCOES-CODIGO.md` §6 (padrão de rota) e §7 (fake e
> teste)**, `docs/adr/0001-doc-prosemirror-json.md`,
> `docs/adr/0007-order-do-plano-nao-e-unique.md`, **`docs/adr/0008-updated-at-e-do-dominio.md`**
> e as specs 08/09/10.

## Objetivo

A anotação existe de verdade: tem tabela, sobrevive a restart, e chega ao front por HTTP com
o corte de tenant provado contra o Postgres. Depois desta fatia o backend do MVP 1 está
completo — o que falta é tela.

## Execute em DUAS metades, nesta ordem

A fatia é grande. Faça e **valide** a metade 1 inteira antes de começar a 2; se algo
interromper, o trabalho da 1 fica utilizável.

- **Metade 1 — persistência:** schema + migration, `PrismaNoteRepository`, teste de contrato,
  a guarda do `replacePlanItems`. Nada de rota.
- **Metade 2 — borda:** schemas Zod em `shared/`, as rotas, `buildRepositories.notes`, a
  agregação de `writers`, integração.

## Decisões já tomadas (não reabrir)

- **Migrations SEMPRE via Prisma.** Nunca escrever nem editar SQL em `prisma/migrations/`.
  Gere com `prisma migrate dev --name note`.
- Sem membership ativo → **404**. `NotTheAuthorError` → **403** (o único do projeto — Tarefa
  09 explica).
- `plainText` é derivado, nunca entra no input. O `doc` é ProseMirror JSON. → ADR 0001.
- **`updatedAt` é do domínio; o `Note` nasce SEM `@updatedAt`.** → ADR 0008.
- `@@unique([planItemId, userId])` exatamente nessas duas colunas. → pendência da Tarefa 08.
- Nenhum acesso a banco fora de um Repository. **Sem `$queryRaw`.**

## ⚠️ O que a leitura do schema revelou, e que muda a fatia

### `onDelete` **precisa ser declarado**: o default do Prisma para relação opcional é `SetNull`

`planItemId` é **opcional** (`String?`, é o que faz a avulsa não colidir no índice). E para
relação opcional o default do Prisma **não** é `Restrict` — é **`SetNull`**.

Isso é grave, e inverte a suposição da Tarefa 06 (que escreveu "o `onDelete: Restrict` que a
Tarefa 03 herdou"). Sem declaração explícita, remover um dia do plano **não falha**: ele
**zera o `planItemId` da nota** e deixa uma linha com `kind = 'PLAN'` e `planItemId = null` —
um estado que nenhum UseCase consegue produzir, que o `assertNoteDoc` não pega, que o
`listNotes({planItemId})` nunca mais devolve, e que **ninguém percebe**, porque a nota
continua aparecendo na listagem geral com o título do dia. Corrupção silenciosa, exatamente
o que o diff por data da Tarefa 06 existe para evitar.

**Decisão: declarar `onDelete: Restrict` explicitamente** na relação `planItem`, e provar em
teste de contrato. A guarda de domínio (pendência da 06) continua necessária — ela é o que
transforma um erro de FK numa mensagem decente; o `Restrict` é a rede embaixo dela.

### A guarda "não remover item com nota" é **cega a status**

A pendência da Tarefa 06 pede a guarda. O detalhe que decide a assinatura: **a FK não olha
`status`**. Uma nota **arquivada** ainda aponta para o item do plano, então remover o dia
falharia por FK mesmo que a nota esteja fora da vista.

Portanto **não reuse `planItemWritersByBook`** (que só devolve `ACTIVE`, e de propósito — é
sobreposição de tela). Precisa de método próprio:

```ts
/**
 * Dos `planItemIds` dados, quais têm ALGUMA nota — **inclusive arquivada**.
 *
 * Cego a `status` de propósito: quem barra a remoção é a FK, e a FK não olha
 * status. Usar aqui o `planItemWritersByBook` (que filtra ACTIVE) faria a
 * guarda liberar uma remoção que o banco vai recusar.
 */
planItemIdsWithAnyNote(planItemIds: readonly string[]): Promise<string[]>;
```

### O `response` do `doc` pode apagar a anotação inteira

`docs/CONVENCOES-CODIGO.md` §6.1: o `serializerCompiler` do Zod **descarta campo não
declarado**. O `doc` é um objeto de forma aberta. Um `z.object({ type: z.literal('doc') })`
no **response** faria a resposta sair com `{"doc":{"type":"doc"}}` — **a anotação inteira
apagada na saída**, com 200 e sem erro nenhum. O `content` todo, os `marks`, tudo.

Use `.passthrough()` (ou `z.unknown()`) para o `doc`, **nos dois sentidos**, e escreva um
teste de rota que salva um doc com `content` e `marks` aninhados e compara a resposta com o
que entrou. É o mesmo teste de losslessness da Tarefa 08, agora na borda.

### `PUT` idempotente devolve **200 ou 201** — e o serializer é **por status**

O `upsertPlanNote` devolve `created: boolean`. Se a rota responder 201 na criação e o schema
declarar só o 200, o `preSerialization` da §6.1 troca o corpo por `{error}` genérico e loga —
**toda primeira escrita de nota do dia quebraria**. Declare **os dois** status.
(E lembre: o curinga `'2xx'` é recusado no boot de propósito.)

## Metade 1 — persistência

### O modelo

```prisma
enum NoteKind { PLAN FREE }

model Note {
  id         String        @id @default(cuid())
  clubId     String
  bookId     String
  userId     String
  kind       NoteKind
  planItemId String?       // NULLABLE — é o que faz a avulsa não colidir
  title      String
  reference  String?
  doc        Json          // ProseMirror JSON — ADR 0001
  plainText  String        @default("")
  status     GeneralStatus @default(ACTIVE)
  archivedAt DateTime?
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      // ADR 0008: SEM @updatedAt — o dono é o domínio

  club     Club             @relation(fields: [clubId], references: [id])
  book     Book             @relation(fields: [bookId], references: [id])
  user     User             @relation(fields: [userId], references: [id])
  planItem ReadingPlanItem? @relation(fields: [planItemId], references: [id], onDelete: Restrict)

  @@unique([planItemId, userId])
  @@index([bookId, userId])
  @@index([clubId, createdAt])
}
```

Mais as relações inversas `notes Note[]` em `Club`, `Book`, `User` e `ReadingPlanItem`.
**Não** declare `NoteLink` nem `Attachment` — não são desta fatia.

### O repositório

`src/repositories/prisma-note-repository.ts`, no molde do `prisma-book-repository.ts`
(`toDomain` · `toUpdateData` · `save` como upsert). Sete métodos: `save`, `byId`, `update`,
`byPlanItemAndUser`, `find`, `planItemWritersByBook`, `planItemIdsWithAnyNote`.

Quatro pontos que **não** são mecânicos:

**1. `save` da nota do dia é upsert no ÍNDICE COMPOSTO, não no `id`** (pendência da Tarefa
08 — a corrida). Dois autosaves sobrepostos da mesma pessoa no mesmo dia leem `null` no
`byPlanItemAndUser` e ambos tentam criar; com upsert por `id` isso é `P2002`, que o
`handleDomainError` **relança como 500**. O editor autossalva e a fila offline reenvia, então
a forma é real.

```ts
// PLAN: upsert em (planItemId, userId). FREE: upsert em `id` — o compound
// não aceita null, e é justamente o null que faz a avulsa ser ilimitada.
where: note.planItemId === null
  ? { id: note.id }
  : { planItemId_userId: { planItemId: note.planItemId, userId: note.userId } }
```

Na corrida, o `id` gerado pelo segundo `execute` é descartado e a linha mantém o primeiro —
o `save` devolve a linha do banco, então o UseCase devolve o id certo. **O `update` do upsert
não escreve `id`.**

**2. `toUpdateData` mapeia `updatedAt` e NUNCA mapeia `id`** (ADR 0008). Um `id` no patch
trocaria a chave primária de verdade no Postgres, enquanto o fake o descarta.
`clubId`/`bookId`/`userId`/`kind`/`planItemId` também **não** entram — mover conteúdo entre
tenants ou trocar a autoria não é operação que exista.

**3. O `text` do `find` precisa ESCAPAR os curingas do `LIKE`** (pendência da Tarefa 10).
Medido no Postgres 16 deste projeto: `'axb' ILIKE '%a_b%'` é **verdadeiro** e
`'100% garantido' ILIKE '%100%%'` também. O `Prisma.contains` passa o valor como parâmetro, e
`%`/`_` **dentro do parâmetro são curinga**. Quem digitar `p. 100%` receberia toda nota que
contenha `p. 100`, em silêncio — nada na tela anuncia sintaxe de padrão.

```ts
// Um replace só, e é por isso que a ordem funciona: um replace único nunca
// revisita o que inseriu, então o `\` escapado não é re-escapado.
const like = filter.text.replace(/[\\%_]/g, '\\$&');
```

O Postgres honra `\` como escape default em `LIKE`/`ILIKE` sem cláusula `ESCAPE`, que é o que
o Prisma gera. `mode: 'insensitive'` continua sendo quem dá o `ILIKE`. **O fake NÃO muda**:
depois do escape o contrato do port é "substring literal, case-insensitive,
accent-sensitive" — exatamente o que ele já faz. Emular curinga no fake seria modelar um
detalhe de uma camada abaixo do port, e o deixaria **permissivamente** infiel.

**4. O `doc` vem do banco como `Prisma.JsonValue`** e o `Note.doc` é `NoteDoc`. Passe pelo
`assertNoteDoc` — um `doc` corrompido no banco é erro de verdade, e sem o assert você precisa
de um cast, que o `CLAUDE.md` proíbe. Na escrita, `doc` vai como `Prisma.InputJsonValue`.

**5. Teto de segurança no `find`** (dívida medida na Tarefa 10: **~6,8 KiB de heap por nota**,
quebra na ordem de **10 mil notas por clube**). `take: 500` com
`orderBy: { createdAt: 'desc' }` — o `orderBy` é obrigatório junto do `take`, senão o corte é
não-determinístico. É **válvula de segurança, não paginação**: a primeira tela que pagine
(MVP 2) troca por cursor. Constante nomeada, com o número e o motivo no comentário.

### A guarda do `replacePlanItems`

`ReplacePlanItems` passa a receber o `NoteRepository` e, **antes de qualquer escrita**,
confere `planItemIdsWithAnyNote(removeIds)`. Se houver, lança `InvalidBookError` (400) com
mensagem dizendo **quantos** dias têm anotação — sem citar autor nem conteúdo (o admin não
precisa saber quem escreveu para entender que não pode remover o dia).

O UseCase **está ligado à rota** `PUT /books/:bookId/plan`, então a fiação entra junto: é
por isso que esta pendência é desta fatia e não da 10.

## Metade 2 — borda

### Schemas Zod em `packages/shared/src/note.ts`

`noteDocSchema` (com `.passthrough()`), `upsertPlanNoteSchema` (só `doc`),
`createFreeNoteSchema` (`title`, `reference?`, `doc`), `editNoteSchema` (`title?`,
`reference?` aceitando `null`, `doc?`), `listNotesQuerySchema` (os 5 filtros, todos
opcionais), `noteResponseSchema`, `notesResponseSchema`, `planItemWritersResponseSchema`,
`noteIdParamsSchema`, `planItemIdParamsSchema`.

Nenhum schema de input declara `userId`, `clubId` ou `plainText`. Onde um deles vem do JWT ou
da rota, o padrão é `schema.omit(...)` (`CLAUDE.md`).

### As rotas

| método | caminho | UseCase | status |
|---|---|---|---|
| `PUT` | `/plan-items/:planItemId/note` | `upsertPlanNote` | **201 e 200** (ver ⚠️) |
| `POST` | `/books/:bookId/notes` | `createFreeNote` | 201 |
| `PATCH` | `/notes/:noteId` | `editNote` | 200 |
| `DELETE` | `/notes/:noteId` | `archiveNote` | 200 (soft delete, como `DELETE /books/:bookId`) |
| `GET` | `/clubs/:clubId/notes` | `listNotes` | 200 |
| `GET` | `/books/:bookId/writers` | `listPlanItemWriters` | 200 |

Tudo no escopo autenticado. `await useCase.execute({ ...req.body, actorUserId: req.user.sub })`
— tenant **depois** do spread (§6.3).

**`bodyLimit` explícito nas duas rotas de escrita de nota.** Declare o número na rota, com
comentário: a Tarefa 14 vai elevar o limite global para colar imagem no editor, e sem o
limite por rota isso elevaria também o corpo da nota. A Tarefa 08 mediu que o `docToText` é
linear em CPU mas **custa memória** (1 M de nós ≈ 230 MB), então o teto que importa é
**contagem de nós**, e o de bytes é a aproximação que temos hoje.

### A agregação de `writers` (pendência da Tarefa 10)

O `CLAUDE.md` diz que o `getBookWithPlan` devolve "livro + plano + quem já escreveu", e aqui
rota, repositório e schema estão na mesma fatia — então **cresça o `getBookWithPlan`**.

Para não ter duas implementações do agrupamento, **extraia a parte pura** para
`src/domain/plan-item-writers.ts`:

```ts
/** Agrupa os pares (dia, autor) na ordem do plano. Sem I/O. */
export function groupWritersByPlanItem(
  plan: readonly ReadingPlanItem[],
  pairs: readonly PlanItemWriter[],
): PlanItemWriters[];
```

`getBookWithPlan` e `listPlanItemWriters` passam a chamar **a mesma função** — o
`listPlanItemWriters` continua existindo porque a tela precisa **atualizar só a sobreposição**
depois de alguém escrever, sem rebuscar o livro inteiro.

**E cresça o `bookWithPlanResponseSchema` em `shared/`**, senão o `writers` sai apagado (§6.1).

## Regras (o que os testes provam)

### Contrato do repositório, contra o Postgres real (metade 1)

1. `save` cria e devolve a nota com todos os campos de volta, `doc` **idêntico** (objeto
   aninhado com `marks`).
2. `save` de novo com o mesmo `id` atualiza no lugar.
3. **`NULL` não colide:** três notas `FREE` do mesmo autor no mesmo livro convivem. É a regra
   que a Tarefa 08 registrou como a divergência mais perigosa possível.
4. **A nota do dia é única por pessoa:** duas notas `PLAN` do mesmo autor no mesmo
   `planItemId` são **uma** linha.
5. **A corrida:** dois `save` concorrentes (`Promise.all`) da mesma nota do dia **não** dão
   `P2002` e deixam **uma** linha.
6. `byId` devolve inclusive arquivada; `null` para id inexistente.
7. `update` aplica só as chaves presentes; `null` grava nulo; `undefined` não mexe.
8. **`update` grava o `updatedAt` que o domínio mandou**, com precisão de milissegundo
   (ADR 0008 — prova que o schema não tem `@updatedAt`).
9. **`update` com `id` no patch NÃO troca a chave primária** (ADR 0008).
10. `byPlanItemAndUser` acha inclusive arquivada.
11. `find` filtra por cada dimensão e combina com AND; `clubId` sempre.
12. **`find` casa acento estritamente:** `'coracao'` não acha `'coração'`. (Confirma no banco
    o que o fake promete.)
13. **`find` escapa os curingas:** `axb` **não** é achado por `a_b`; `a_b` **é** achado por
    `a_b`; `p. 100 e 5` **não** é achado por `p. 100%`; `100% garantido` **é** achado por
    `100%`. É o teste que o fake não consegue dar.
14. `find` casa só `plainText` — nota com a palavra no `title` não aparece.
15. `planItemWritersByBook` devolve só `ACTIVE` com `planItemId` não nulo do livro, e **não
    carrega o `doc`**.
16. `planItemIdsWithAnyNote` acha **inclusive por nota arquivada** — é a regra que separa
    este método do de cima.
17. **`onDelete: Restrict` está ativo:** apagar um `ReadingPlanItem` que tem nota **falha**,
    e o `planItemId` da nota **continua preenchido** (prova que não é `SetNull`).
18. Índices conferidos no `information_schema`: `@@unique([planItemId, userId])` existe com
    **essas duas colunas**, e a coluna `planItemId` é **nullable**.

### A guarda do `replacePlanItems` (unitário + integração)

19. Remover um dia **sem** nota funciona como antes (as regras da Tarefa 06 continuam verdes).
20. Remover um dia **com** nota → `InvalidBookError`, e **nada é escrito nem removido**
    (`replaceForBookCalls === 0`).
21. Vale para nota **arquivada** também.
22. A mensagem diz **quantos** dias, e **não** cita autor nem conteúdo.
23. A guarda roda **depois** do corte de tenant e **depois** da validação do rascunho — quem
    não é admin do clube não descobre que existem notas.
24. Integração: o caso do ADR 0007 (inserir um dia na frente renumerando) **continua
    funcionando** com notas ancoradas nos sobreviventes.

### Rotas (metade 2)

25. As 6 rotas exigem autenticação: sem token → 401.
26. **Corte de tenant em cada uma das 6**: ator de outro clube → **404** (nunca 403).
27. `PATCH`/`DELETE` de nota de outra pessoa, sendo membro do clube → **403**
    (`NotTheAuthorError`).
28. `PUT /plan-items/:id/note` devolve **201** na criação e **200** na atualização, **com
    corpo válido nos dois** (é a armadilha do serializer por status).
29. **O `doc` volta idêntico ao que entrou**, com `content` e `marks` aninhados — o teste de
    losslessness na borda.
30. `plainText` **aparece na resposta** (é derivado e útil ao front) e **é recusado no input**
    (chave a mais → 400, pelo `strict` do Zod).
31. `userId`/`clubId` no corpo não mudam a linha gravada.
32. Zod rejeita entrada malformada: `doc` que não é doc → 400 com `details`; `title` vazio na
    avulsa → 400.
33. `GET /clubs/:clubId/notes` aceita os 5 filtros por query string e os aplica.
34. `GET /books/:bookId/writers` devolve a sobreposição na ordem do plano.
35. `GET /books/:bookId` passa a devolver `writers` — **e o campo chega** (o schema em
   `shared/` cresceu).
36. `DELETE /notes/:noteId` arquiva e **não apaga**: o `GET` seguinte não a lista, e a linha
    continua no banco com `status: 'ARCHIVED'` (conferido por `SELECT`).
37. Nenhuma rota devolve campo que o schema não declara — o boot guard e o
    `preSerialization` da §6.1 continuam ativos.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | **`onDelete: Restrict` explícito** | O default (`SetNull`) corrompe em silêncio. Ver ⚠️. |
| B | `planItemIdsWithAnyNote` é método próprio, cego a status | Reusar `planItemWritersByBook` faria a guarda liberar o que o banco recusa. |
| C | `save` faz upsert no índice composto para `PLAN` | Upsert por `id` deixa a corrida virar 500. |
| D | **Cresce o `getBookWithPlan`** e o agrupamento vira função pura | Compor os dois UseCases na rota faria **dois** cortes de tenant por abertura de livro. |
| E | `take: 500` + `orderBy` no `find` | Sem teto, um clube grande é OOM (medido). Sem `orderBy`, o corte é não-determinístico. É válvula, não paginação. |
| F | `DELETE` para arquivar, e devolve 200 | 204 sem corpo seria mais REST, mas o front quer a nota atualizada, e é o padrão que `DELETE /books/:bookId` já usa. |
| G | `bodyLimit` por rota nas escritas de nota | Sem isso, a Tarefa 14 elevar o limite global para imagem eleva o corpo da nota também. |
| H | O repo chama `assertNoteDoc` ao ler | A alternativa é um cast, proibido. Doc corrompido no banco é erro de verdade. |
| I | `GET /books/:bookId/writers` existe além da agregação | A tela precisa atualizar só a sobreposição depois de escrever. |

## Arquivos a tocar

```
METADE 1
  prisma/schema.prisma                       +Note, +enum NoteKind, +4 relações inversas
  prisma/migrations/<gerada pelo Prisma>     NUNCA à mão
  src/repositories/prisma-note-repository.ts                        NOVO
  src/repositories/__tests__/prisma-note-repository.contract.integration.test.ts   NOVO
  src/usecases/ports/note-repository.ts      +planItemIdsWithAnyNote
  src/usecases/_fakes/note-repository-fake.ts  +o método
  src/usecases/replace-plan-items.ts         +NoteRepository e a guarda
  src/usecases/__tests__/replace-plan-items.test.ts

METADE 2
  packages/shared/src/note.ts                NOVO (+ export no index)
  packages/shared/src/book.ts                +writers no bookWithPlanResponseSchema
  src/domain/plan-item-writers.ts            NOVO (groupWritersByPlanItem, puro)
  src/usecases/get-book-with-plan.ts         +writers
  src/usecases/list-plan-item-writers.ts     passa a usar a função pura
  src/routes/note-routes.ts                  NOVO
  src/routes/book-routes.ts                  +fiação (writers, guarda do plano)
  src/http/repositories.ts                   +notes
  src/http/server.ts                         +registro de note-routes
  src/routes/__tests__/note-routes.integration.test.ts              NOVO
  CONTEXT.md · docs/CONVENCOES-CODIGO.md     se algo novo merecer registro
```

**Não tocar:** `packages/ui/**`, `packages/app/**`, e os UseCases das Tarefas 08/09/10 —
`upsert-plan-note.ts`, `create-free-note.ts`, `edit-note.ts`, `archive-note.ts`,
`note-for-author.ts`, `list-notes.ts` — que saem **byte-idênticos** (confira por `md5sum`).
Se achar que precisa mexer, **pare e reporte**.

## Fora de escopo

- `NoteLink` (menções materializadas), `Attachment`, upload de imagem.
- Paginação de verdade, cursor, `limit` no input. O `take` é válvula.
- Busca sem acento (`unaccent`) → Tarefa 29.
- Hard delete e desarquivar → MVP 4.
- Qualquer tela.

## Definição de pronto

- [x] Migration **gerada pelo Prisma**, nenhum SQL escrito à mão, `migrate status` limpo.
      (`20260903210948_note`)
- [x] O modelo nasceu com `planItemId String?`, `@@unique([planItemId, userId])`,
      **`onDelete: Restrict` explícito** e **sem `@updatedAt`** — os quatro conferidos no
      banco, não só no arquivo.
- [x] Contrato do repo com as regras 1–18, incluindo **a corrida (5)**, **os curingas (13)**,
      **o `Restrict` (17)** e os índices lidos do `information_schema` (18).
      ⚠️ Ressalva na 18: `@@unique` do Prisma emite `CREATE UNIQUE INDEX`, não
      `CONSTRAINT ... UNIQUE`, então o índice **não existe** em
      `information_schema.table_constraints` — as colunas do índice vêm de `pg_index`.
      A nulidade de `planItemId` e o `delete_rule` da FK vêm do `information_schema`.
- [x] A guarda do plano com as regras 19–23, e as regras da Tarefa 06 **continuam verdes**.
      A regra 24 foi provada no teste de contrato (o caso do ADR 0007 com notas ancoradas
      nos sobreviventes, contra o Postgres), não numa integração de rota — a rota é da
      metade 2.
      ⚠️ **Rodada de correção:** a FIAÇÃO da guarda na rota não tinha teste nenhum. O
      mutante que troca `repos.notes` por um duplo cujo `planItemIdsWithAnyNote` devolve `[]`
      sobrevivia aos 1202 testes, e a consequência real era `PUT /books/:bookId/plan`
      respondendo **500** (o `P2003` cru) em vez de 400. Fechado por
      `answers 400 without touching the plan when a removed day already has a note`, em
      `book-routes.integration.test.ts` (1 acusador; o `afterAll` do arquivo passou a
      consultar `Note` antes do plano, senão a limpeza estouraria na FK).
- [x] As 6 rotas com as regras 25–37, incluindo **201 e 200 no `PUT` (28)** e **o `doc`
      voltando idêntico (29)**.
      ⚠️ Ressalva na 29: a igualdade é **profunda**, não byte-a-byte. A coluna `Json` do
      Prisma é `jsonb`, e o `jsonb` normaliza a ordem das chaves de cada objeto (por
      comprimento, depois bytewise): `{type,text}` volta `{text,type}`. Nenhum valor, `mark`
      ou `attr` é perdido — é reordenação, e o ProseMirror não depende de ordem de chave.
      ⚠️ **Rodada de correção — três buracos na borda:**
      · o `bodyLimit` só tinha acusador no `PUT`; tirá-lo do `POST /books/:bookId/notes` e do
      `PATCH /notes/:noteId` passava em 52/52, e os `413: errorSchema` das duas eram ficção
      (o default do Fastify é 1 MiB). Virou um `it.each` das **três** rotas de escrita
      (2 acusadores novos).
      · o strip da query não tinha teste. Virou
      `strips tenant and derived keys from the query, and tolerates an unknown one`, que
      prova as duas propriedades do §6.3 de uma vez — `clubId`/`actorUserId`/`status`/
      `plainText` não entram, e o `utm_source` não derruba a listagem. Medido: com só a
      ordem do spread invertida ele fica verde (o strip é a barreira real); com o par
      rompido (`.passthrough()` na query **e** spread invertido) ele **acusa**.
      · as regras 34/35 não provavam a ordem que o nome prometia — ver o item do `writers`.
- [x] `writers` chega no `GET /books/:bookId` (35), com o schema em `shared/` crescido.
      ⚠️ **Rodada de correção:** os dois testes de rota da sobreposição sobreviviam ao
      mutante que monta a resposta na ordem dos pares. O `planItemWritersByBook` não promete
      ordem, o Postgres devolvia por `userId`, e `marcos < maria` fazia a ordem errada
      **coincidir** com a certa. Consertado como o §7.2 manda — **sem** `orderBy` no
      repositório: a autoria do fixture foi escolhida para a implementação errada falhar
      (quem ordena primeiro no alfabeto escreve o ÚLTIMO dia do plano) e a precondição
      `MARCOS_ID < MARIA_ID` ficou pinada no `beforeAll`. Os dois testes agora acusam.
      ⚠️ Ressalva: a **ordenação dos `userIds` não é decidível contra o Postgres** — quando
      a enumeração vem pelo índice `(bookId, userId)` os pares já chegam ordenados, então o
      mutante que remove o `.sort()` acusa numa execução e fica verde na seguinte. A
      propriedade é provada onde é decidível, no unitário com o fake invertido
      (`sorts the userIds of an entry`), e o comentário do teste de rota diz isso.
- [x] Nenhum input aceita `userId`, `clubId` ou `plainText`.
      Os três corpos de escrita são `.strict()`: chave proibida é **400**, e nada é escrito
      (mais forte que o strip silencioso). O `listNotesQuerySchema` fica sem `strict` de
      propósito — não há campo derivado nem de tenant numa query string, e um `utm_source`
      colado de um link não pode derrubar a listagem do clube.
- [x] Os 6 UseCases das Tarefas 08/09/10 byte-idênticos (`md5sum` colado no relatório).
      *(metade 2 reconfirmou os 6; o `list-plan-item-writers.ts` **mudou**, autorizado — ele
      passou a chamar a função pura `groupWritersByPlanItem`.)*
      *(a rodada de correção não tocou nenhum dos 6, nem o `plan-item-writers.ts`, nem as
      rotas, nem o `schema.prisma`/`prisma/migrations/` — os md5 voltaram idênticos depois de
      cada mutante.)*
- [x] **Rodada de correção — o que mudou em código de produção (md5 muda de propósito):**
      · `usecases/_fakes/note-repository-fake.ts` — o `update` copia **campo a campo** as
      sete chaves do `NotePatch` em vez de espalhar o patch. O tipo estreito só fecha o
      literal fresco; um patch montado por variável atravessava e **trocava a autoria no
      fake** enquanto o Prisma ignorava em silêncio (§7.1 outra vez). Provado por
      `never changes the authorship, even for a patch the compiler cannot check`.
      · `repositories/prisma-note-repository.ts` — o `update` do upsert deixou de escrever
      `createdAt` (agora só o `create` leva `id` e `createdAt`). Na corrida, o segundo
      `execute` reescrevia o nascimento do primeiro, e a nota que corre pulava para o topo do
      `listNotes`; a que não corre, não. Provado por
      `keeps the createdAt of the first write while the content is the last one`.
      · `repositories/prisma-note-repository.ts` — o `find` passou a
      `orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]`, alinhando o corte do `take: 500` com
      a ordem total do `compareByCreatedAtDesc`. Sem desempate, o conjunto cortado na
      fronteira era não-determinístico quando havia empate de milissegundo — o caso normal.
      Provado por `breaks a createdAt tie by id, the same total order the listing uses`.
      · `usecases/ports/note-repository.ts` — só **comentário**: a frase "o estado ilegal
      deixou de ser representável" era verdadeira só para literal.
- [x] **Rodada de correção — asserção vazia do §7.4:**
      `get-book-with-plan.test.ts` tinha
      `resolves.not.toBeInstanceOf(ForbiddenRoleError)` sobre
      `{ book, planItems, writers }`, que nunca poderia ser um `Error` — verde com o UseCase
      mutilado para devolver `planItems: []` e `writers: []`. Virou
      `gives the MEMBER the book, the plan and the writers of the whole club`, que asserta a
      saída real. O `list-books.test.ts` **não foi tocado** (fatia fechada). O ponteiro do
      §7.4 passou a citar o **nome** do teste, não a linha.
- [x] `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .` limpos.
- [x] `pnpm test` **e** a integração verdes, com as duas contagens coladas.
      *(metade 1: 930 unitários / 40 arquivos · 204 de integração / 13 arquivos)*
      *(metade 2: 947 unitários / 41 arquivos · 255 de integração / 14 arquivos · 179
      unitários no `@clube/shared` / 5 arquivos)*
      *(rodada de correção: **948** unitários / **41** arquivos · **261** de integração /
      **14** arquivos · **179** unitários no `@clube/shared` / 5 arquivos)*
- [x] O banco fica **sem fixture** ao fim: só o super-admin do seed (`admin@clube.local`) e
      o `Settings` dele. `Note`/`Book`/`ReadingPlanItem`/`Club`/`Membership`/`Invite` em 0.
- [ ] Checklist marcada e linha 11 do `BACKLOG.md` fechada — **Bloco C e o backend do MVP 1
      fechados.** *(o item do `BACKLOG.md` é do dono)*
