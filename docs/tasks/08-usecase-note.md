# Tarefa 08 — Domínio `Note` + UseCases `upsertPlanNote` e `createFreeNote`

> Abre o **Bloco C**. É a primeira fatia em que uma pessoa **escreve** — até aqui só o admin
> cadastrava livro e plano. Domínio puro e TDD estrito contra fakes.
> **Sem Prisma, sem migration, sem rota, sem tela** — repo e rota são a Tarefa 11.
>
> Leia antes: `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` (§6 para o padrão de erro),
> `docs/adr/0001-doc-prosemirror-json.md`, `docs/adr/0002-visibilidade-total-no-clube.md` e
> `docs/tasks/06-usecases-book-plano-leitura.md` (esta fatia reusa `bookForActor`,
> `optionalText` e os fakes de `Book`/`ReadingPlanItem`).

## Objetivo

Uma pessoa do clube abre a leitura de hoje e escreve a anotação daquele dia — **sempre a
mesma nota**, com o título já vindo do tema do plano. E cria quantas anotações avulsas
quiser, com título e referência próprios.

## Decisões já tomadas (do BACKLOG e dos ADRs — não reabrir)

- **Anotação do dia é única por pessoa por leitura** (`unique(planItemId, userId)`).
  **Anotação avulsa é ilimitada** e exige `title`.
- **O `doc` é ProseMirror JSON; `plainText` é DERIVADO no backend** e **nunca entra no input
  da API**. Nenhum cliente manda `plainText`. → ADR 0001.
- **Não existe nota privada.** Toda nota é visível para os membros ativos do clube desde o
  instante em que é salva. Não há campo de visibilidade, nem rascunho, nem "publicar".
  → ADR 0002.
- **Ninguém edita conteúdo de outra pessoa.** O autor é sempre `req.user.sub` — e como esta
  fatia é só de escrita própria, **`userId` não existe no input de nenhum dos dois
  UseCases**.
- Sem membership ativo no clube → **404**, nunca 403.
- Escrever nota **não exige papel**: `MEMBER` escreve. Papel de admin manda no livro e no
  plano, não no que as pessoas escrevem.
- Sem `Highlight`, sem `ReadingLog`, sem `ActivityEvent` nesta fatia (MVPs 2 e 3).

## ⚠️ Uma decisão de fatiamento que precisa do dono ANTES de executar

### `docToText` sai da Tarefa 09 e vem para esta fatia

O `BACKLOG.md` põe `docToText` na linha **09**. **Proponho trazê-lo para cá**, e o motivo é o
ADR 0001: `plainText` é derivado **a cada escrita**, e esta é a fatia que **cria a primeira
escrita**. Sem `docToText` aqui, `upsertPlanNote` e `createFreeNote` teriam de gravar
`plainText: ''`.

Por que isso é pior que mover a função:

- `plainText` é o campo de **busca** (`ILIKE`, MVP 2) e de **prévia de listagem**. Uma nota
  criada e nunca reeditada ficaria invisível na busca **para sempre** — e ninguém
  perceberia, porque a nota abre certa (o `doc` está lá).
- Seria dado derivado **persistido errado**. É a mesma armadilha que a Tarefa 06 recusou com
  `writers: []`: um campo que existe, parece real e está permanentemente vazio.
- A alternativa "um `docToText` mínimo aqui e o pesado na 09" é a pior das três: a função
  passaria a existir com cara de pronta, e o TDD pesado prometido cairia sobre código que já
  tem chamador em produção.

**Se o dono aprovar**, a linha **09** do `BACKLOG.md` fica com `editNote` + `archiveNote`
(que continua sendo uma fatia inteira: é onde entram `NoteNotFoundError`, o corte "só o
autor" e o soft delete), e a linha **08** passa a declarar `docToText`. A spec abaixo já
assume a aprovação — se o dono recusar, **as regras 1–8 e o arquivo
`domain/doc-to-text.ts` saem da fatia** e os dois UseCases passam a receber uma função
`docToText` injetada, o que eu **não** recomendo (é um helper puro, não uma dependência).

### E uma pergunta ainda em aberto, que não bloqueia esta fatia

**Clube arquivado continua legível?** Levantada nas Tarefas 06 e 07 e ainda sem resposta. O
`assertMembership` confere o status do *membership*, nunca o do *clube* — então hoje um
`GET` de livro de clube arquivado responde 200 enquanto `createBook` recusa. Esta fatia
**herda o comportamento atual sem mudá-lo** (`bookForActor` já é o único caminho), mas
acrescenta **duas escritas** ao conjunto que a decisão vai atingir. Se a resposta for
"arquivar torna invisível", o conserto continua sendo uma fatia curta no `assertMembership`
— não aumenta de tamanho por causa desta tarefa.

## Mini-domínio (só o que esta fatia precisa)

`src/domain/note.ts`:

```ts
export type NoteKind = 'PLAN' | 'FREE';

export interface Note {
  id: string;
  clubId: string;
  bookId: string;
  userId: string;               // o AUTOR. Sempre o ator; nunca vem do input.
  kind: NoteKind;
  planItemId: string | null;    // preenchido só quando kind = 'PLAN'
  title: string;                // PLAN: copiado do tema. FREE: escolhido pela pessoa.
  reference: string | null;     // texto livre — só as avulsas usam
  doc: NoteDoc;                 // ProseMirror JSON, como veio do editor
  plainText: string;            // DERIVADO do doc. Nunca entra no input.
  status: GeneralStatus;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

O tipo do `doc` — sem `any`, como o `CLAUDE.md` exige:

```ts
/** Um nó de ProseMirror. `attrs`/`marks` ficam sem tipar de propósito: o
 *  domínio não interpreta o que o editor põe lá, só atravessa. */
export interface NoteDocNode {
  type: string;
  text?: string;
  content?: NoteDocNode[];
  [key: string]: unknown;
}

export interface NoteDoc extends NoteDocNode {
  type: 'doc';
}

/** O único portão de entrada do `doc`: recebe `unknown` e estreita. */
export function assertNoteDoc(value: unknown): NoteDoc;
```

`src/domain/doc-to-text.ts` (ver a decisão de fatiamento acima):

```ts
/** O `plainText` de um doc. Puro, sem I/O, sem regex de HTML. */
export function docToText(doc: NoteDoc): string;
```

Erros novos em `src/domain/errors.ts`:

```ts
export class InvalidNoteError extends Error {}      // 400 — título vazio, doc malformado
export class PlanItemNotFoundError extends Error {} // 404 — item inexistente
```

> **O gate de exaustividade.** `handle-domain-error.test.ts` exige status para **toda** classe
> exportada de `domain/errors.ts`, e `NOT_YET_MAPPED` está **vazio** desde a Tarefa 07.
> Registre `[InvalidNoteError, 400]` e `[PlanItemNotFoundError, 404]` no
> `src/http/handle-domain-error.ts` **no mesmo commit** em que criar as classes. Isso difere
> do que a Tarefa 05 fez (ela pôs `InvalidBookError` em `NOT_YET_MAPPED` e deixou a dívida
> para a 07): a tabela do `handleDomainError` é mapeamento puro, não tem rota nem Fastify
> dentro, e registrar já custa duas linhas — enquanto a dívida custou uma pendência
> atravessando duas tarefas. É a **única** coisa que esta fatia toca em `src/http/`.

## Ports — o que nasce e o que cresce

`src/usecases/ports/note-repository.ts` (novo, com **só** o que esta fatia usa):

```ts
export interface NoteRepository {
  /** Upsert por `id` — a mesma convenção dos outros repos (Tarefa 03). */
  save(note: Note): Promise<Note>;
  /**
   * A nota do dia daquela pessoa, se existir. Devolve **inclusive arquivada**
   * (ver regra 26): o índice único não distingue status, então esconder a
   * arquivada faria o upsert tentar criar uma segunda e bater no índice.
   */
  byPlanItemAndUser(planItemId: string, userId: string): Promise<Note | null>;
}
```

Sem `byId`, sem `find`, sem `delete`: `editNote`/`archiveNote` são a Tarefa 09 e
`listNotes` a Tarefa 10. **A interface cresce com quem a usa.**

`ReadingPlanItemRepository` ganha **um** método:

```ts
/** O item do plano por id. Não confere clube: quem faz o corte é o `bookForActor`. */
byId(id: string): Promise<ReadingPlanItem | null>;
```

O fake `NoteRepositoryFake` precisa emular o índice `unique(planItemId, userId)` **com a
semântica exata do Postgres** — e a lição do ADR 0007 vale nos dois sentidos:

- valida **linha por linha**, não o conjunto (fake mais restritivo que o banco também é
  infidelidade);
- **`NULL` não colide**: N notas `FREE` do mesmo autor no mesmo livro convivem. Um fake que
  tratasse `planItemId: null` como valor reprovaria a segunda avulsa — exatamente o
  comportamento que o BACKLOG declara ilimitado.

## Contratos dos UseCases

```ts
// src/usecases/upsert-plan-note.ts
export interface UpsertPlanNoteInput {
  actorUserId: string;   // o autor. NÃO existe `userId` aqui.
  planItemId: string;
  doc: unknown;          // validado por assertNoteDoc
}
export interface UpsertPlanNoteOutput {
  note: Note;
  created: boolean;      // a rota da Tarefa 11 devolve 201 × 200
}
// deps: AssertMembership, BookRepository, ReadingPlanItemRepository, NoteRepository
```

```ts
// src/usecases/create-free-note.ts
export interface CreateFreeNoteInput {
  actorUserId: string;
  bookId: string;
  title: string;         // obrigatório
  reference?: string;
  doc: unknown;
}
export interface CreateFreeNoteOutput { note: Note }
// deps: AssertMembership, BookRepository, NoteRepository
```

**Nem `clubId` nem `bookId` do PLAN aparecem no input.** O `clubId` vem de `book.clubId` e o
`bookId` da nota do dia vem de `planItem.bookId` — é isso que impede escrever num livro de
outro clube mandando o `clubId` "certo" no corpo. É a mesma regra que o `bookForActor`
implementa desde a Tarefa 06, e por isso ele é reusado sem cópia.

## Regras de negócio (o que os testes provam)

### `docToText` — puro, TDD pesado

1. Doc vazio (`{ type: 'doc' }` ou `content: []`) → `''`.
2. O `text` dos nós de texto é concatenado **na ordem do documento**.
3. Nó de **bloco** separa com `\n` (parágrafo, heading, item de lista, célula de tabela,
   callout); nó **inline** não separa (`text` com `marks`, menção, link).
4. `hardBreak` vira `\n`.
5. **Tipo desconhecido é atravessado pelo `content`, nunca descartado** — é o que faz uma
   extensão nova do editor (Tarefa 14) entrar na busca sem mexer aqui.
6. Nó de menção contribui com `attrs.label` quando é `string` (buscar o nome de uma pessoa
   tem de achar a nota). `attrs` ausente ou de outro tipo não quebra.
7. **A travessia é iterativa** (pilha explícita), não recursiva: um doc de 50 mil níveis de
   profundidade devolve texto em vez de estourar a pilha do Node.
8. O resultado não tem espaço nas pontas nem sequência de 3+ `\n`.

### `assertNoteDoc`

9. `null`, array, número, string ou `undefined` → `InvalidNoteError`.
10. Objeto com `type` diferente de `'doc'` → `InvalidNoteError`.
11. `content` ausente **é aceito**: o editor autossalva com o doc vazio, e recusar isso
    quebraria a primeira digitação.
12. O doc é gravado **como veio**: `assertNoteDoc` estreita o tipo e **não reescreve** o
    JSON. Nada de limpar, reordenar chaves ou descartar `attrs` — o ADR 0001 escolheu
    ProseMirror JSON justamente para o round-trip ser lossless.

### `upsertPlanNote`

13. `planItemId` inexistente → `PlanItemNotFoundError` (404).
14. Livro do item inexistente ou **arquivado** → `BookNotFoundError` (404).
15. Ator sem `Membership` **ativo** no clube do livro → `NotAMemberError` (404, não 403).
16. `MEMBER` escreve: nenhum papel é exigido (`bookForActor` sem `requireRole`).
17. `clubId` e `bookId` da nota vêm de `planItem.bookId` → `book.clubId`.
18. Primeira escrita **cria**: `kind: 'PLAN'`, `planItemId`, `userId` = ator,
    `id = randomUUID()`, `status: 'ACTIVE'`, `archivedAt: null`, `created: true`.
19. `title` é **copiado do tema** do `ReadingPlanItem`.
20. `reference` da nota do dia é **sempre `null`** (a referência é do item do plano).
21. `plainText` é `docToText(doc)`.
22. Segunda escrita do **mesmo ator** no **mesmo item** atualiza a **mesma nota**: mesmo
    `id`, mesmo `createdAt`, `updatedAt` novo, `created: false`. **E o repo continua com uma
    nota só.**
23. Dois atores diferentes no mesmo item → duas notas.
24. O mesmo ator em itens diferentes → duas notas.
25. O `title` é **ressincronizado** com o tema atual do item a cada upsert (o admin corrigiu
    "Cap. 3" para "Cap. 3 — A promessa"; a nota acompanha).
26. Upsert numa nota **arquivada** reativa (`status: 'ACTIVE'`, `archivedAt: null`) mantendo
    o `id` — sem isso o índice único transformaria a nota do dia num 409 permanente.
27. **Nada é escrito se a validação falha**: doc malformado → `repo.saved` vazio.

### `createFreeNote`

28. Livro inexistente ou arquivado → `BookNotFoundError`.
29. Sem membership ativo → `NotAMemberError`.
30. Cria com `kind: 'FREE'`, `planItemId: null`, `title` aparado.
31. `title` vazio ou só espaços → `InvalidNoteError`, e **nada é gravado**.
32. `reference` passa por `optionalText` (`''`/espaços → `null`) — o mesmo helper do livro e
    do item do plano, não uma cópia.
33. **Ilimitado**: duas chamadas idênticas criam **duas** notas, com ids distintos.
34. `clubId` vem de `book.clubId`.
35. `plainText` é `docToText(doc)`.

### O fake do `NoteRepository` (suíte própria, como os outros)

36. `save` é upsert por `id`.
37. `unique(planItemId, userId)` é validado **linha por linha**.
38. `planItemId: null` **não colide**: 3 avulsas do mesmo autor no mesmo livro convivem.
39. `byPlanItemAndUser` devolve a nota **arquivada** também.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | **`docToText` vem para esta fatia** | Ver a seção ⚠️ acima. É a única que muda o BACKLOG. |
| B | O `title` do PLAN é **ressincronizado** a cada upsert | "Snapshot no primeiro save" deixaria notas antigas com tema errado depois de o admin corrigir o plano, sem caminho de conserto. |
| C | `reference` do PLAN é sempre `null` | Copiar do item criaria duas fontes para a mesma string; o read path já tem o item do plano ao lado. |
| D | Upsert **reativa** nota arquivada | A alternativa é 409 permanente na nota do dia. `archiveNote` só existe na 09, mas o índice já torna a regra decidível hoje. |
| E | Doc vazio é **aceito** | Recusar quebraria o autosave da primeira digitação (Tarefa 18). |
| F | Menção contribui com `attrs.label` | Ignorá-la tiraria da busca justamente o nome que se procura. Se o dono preferir, é uma linha. |
| G | Travessia **iterativa** | Recursão é mais curta, mas um doc profundo (colado, ou de um cliente ruim) derruba o processo — e o `doc` é o único campo que vem inteiro do cliente. |
| H | Status registrado direto no `handleDomainError` | Ver o box do gate. Evita repetir a pendência que atravessou 05→07. |
| I | O `doc` **não é sanitizado** no domínio | Limite de tamanho e recusa de `blob:`/`data:` são **borda** (Tarefa 11 e ADR 0001, que resolve na inserção do nó de imagem). Registrado, não feito. |
| J | Continua `new Date()` no UseCase | Port de clock é dívida já registrada (`archiveBook`, `dayRange`, lembretes). Não abro isso numa fatia de domínio. |

## Testes a escrever PRIMEIRO

```
src/domain/__tests__/doc-to-text.test.ts        regras 1–8
src/domain/__tests__/note.test.ts               regras 9–12  (assertNoteDoc)
src/usecases/__tests__/upsert-plan-note.test.ts regras 13–27
src/usecases/__tests__/create-free-note.test.ts regras 28–35
src/usecases/_fakes/__tests__/note-repository-fake.test.ts   regras 36–39
src/http/__tests__/handle-domain-error.test.ts  (crescer: os 2 status novos)
```

Builder novo em `src/test-support/builders.ts`: `aNote(overrides)` e `aDoc(...texts)`, na
mesma estratégia de id derivado da chave natural (`note-${planItemId}-${userId}` para o PLAN;
id explícito nas avulsas).

## Arquivos a tocar

```
NOVOS
  src/domain/note.ts                     Note, NoteKind, NoteDocNode, NoteDoc, assertNoteDoc
  src/domain/doc-to-text.ts              docToText
  src/usecases/ports/note-repository.ts
  src/usecases/_fakes/note-repository-fake.ts
  src/usecases/upsert-plan-note.ts
  src/usecases/create-free-note.ts
  + os 5 arquivos de teste acima

CRESCEM
  src/domain/errors.ts                   +2 classes
  src/http/handle-domain-error.ts        +2 linhas de mapeamento (e só isso)
  src/usecases/ports/reading-plan-item-repository.ts   +byId
  src/usecases/_fakes/reading-plan-item-repository-fake.ts
  src/test-support/builders.ts           +aNote, +aDoc
  CONTEXT.md                             `Note` já está no glossário; acrescentar NoteDoc/plainText derivado
```

**Não tocar:**

- `packages/backend/prisma/**` — nem `schema.prisma`, nem migration. O modelo `Note` nasce na
  **Tarefa 11**. Esta fatia **não** cria tabela.
- `src/routes/**` e o resto de `src/http/**` (só a tabela do `handleDomainError`).
- `src/repositories/**` — não existe repo Prisma de `Note` nesta fatia.
  ⚠️ **Correção desta spec, feita durante a execução:** esta linha estava errada e o executor
  acertou em não obedecê-la. O port `ReadingPlanItemRepository` cresce `byId`, e
  `PrismaReadingPlanItemRepository implements` esse port — então `tsc --noEmit` para com
  `TS2420: Property 'byId' is missing`, o que a própria Definição de pronto proíbe. Um port
  não pode crescer sem que a implementação real cresça junto. O certo: **`byId` no repo
  Prisma (6 linhas) + os 3 casos no teste de contrato**, porque `CLAUDE.md` manda um teste de
  contrato por método de repositório. O que continua proibido aqui é criar repo Prisma **de
  `Note`** — esse é da Tarefa 11.
- `src/usecases/replace-plan-items.ts` — a guarda "não remover item que já tem nota" é da
  **Tarefa 11** (está registrada na linha 11 do BACKLOG). Não emendar aqui.
- `packages/shared/**` — os schemas Zod de nota são da Tarefa 11, junto com a rota. Criar
  agora seria schema sem chamador.
- `packages/ui/**`, `packages/app/**`.

## Fora de escopo

- `editNote`, `archiveNote`, `NoteNotFoundError` → Tarefa 09.
- `listNotes` e "quem escreveu em cada `planItemId`" → Tarefa 10.
- Repo Prisma de `Note`, migration, índice único real, rotas `/notes`, teste de integração de
  tenant → Tarefa 11.
- A guarda de remoção de `ReadingPlanItem` com nota → Tarefa 11.
- `NoteLink` (menções materializadas), `Attachment`, `ActivityEvent`.
- Qualquer regra de "só pode escrever no dia de hoje": **não existe**. Ler adiantado e
  anotar depois é uso normal.
- Limite de tamanho do `doc` e rate limit → borda, registrado como dívida.

## Definição de pronto

- [x] `docToText` com as regras 1–8 provadas, incluindo o doc de 50 mil níveis (39 testes em
      `domain/__tests__/doc-to-text.test.ts`, com a pré-condição de que a travessia
      recursiva REALMENTE estoura nessa profundidade).
- [x] `assertNoteDoc` com as regras 9–12; o doc gravado é **idêntico** ao recebido, provado
      por **snapshot antes/depois**: `structuredClone` do input ANTES do `assertNoteDoc` (e
      antes do `execute`, nos dois UseCases), `toEqual` do retorno contra o snapshot e do
      input contra o snapshot — mais a ordem das chaves preservada.
      ⚠️ `toBe` no mesmo objeto **não é** a prova de losslessness: ele prova identidade de
      referência, que não é o contrato do ADR 0001 — uma travessia que apagasse os `marks`
      devolvendo o mesmo objeto passaria nele, e um `structuredClone` defensável no retorno
      o quebraria. Ele fica só para documentar que hoje não há cópia defensiva, e o nome do
      teste diz isso. Idem nos UseCases: `expect(note.doc).toEqual(doc)` compararia o objeto
      **com ele mesmo** — a asserção é contra o snapshot.
- [x] `upsertPlanNote` com as regras 13–27; em especial: **segunda escrita mantém `id` e
      `createdAt`** e o repo continua com **uma** nota.
- [x] `createFreeNote` com as regras 28–35; em especial: **duas chamadas idênticas → duas
      notas**.
- [x] `NoteRepositoryFake` com suíte própria (36–39), inclusive **`NULL` não colide**.
- [x] `InvalidNoteError` e `PlanItemNotFoundError` mapeados no `handleDomainError` no mesmo
      commit em que nascem; `NOT_YET_MAPPED` **continua vazio**.
- [x] Nenhum input dos dois UseCases aceita `userId`, `clubId` ou `plainText` (provado por
      `@ts-expect-error` + comportamento nos dois UseCases).
- [x] `pnpm -r typecheck`, `pnpm lint` e `pnpm prettier --check .` limpos.
- [x] `pnpm test` verde: **717 testes unitários** (35 arquivos), dos quais 254 nos 7
      arquivos desta fatia — 708 na entrega, +9 na rodada de correção da auditoria por teste
      de mutação (F1 a F9; ver o relatório). Integração rodada pelo orquestrador:
      **154 verdes** (eram 151), incluindo os 3 casos novos de `byId` no contrato do
      `PrismaReadingPlanItemRepository`. `shared`: 135, intocado.
- [x] `prisma/`, `src/routes/`, `shared/`, `ui/` e `app/` intocados.
      ⚠️ `src/repositories/` **não** ficou intocado: o `byId` novo no port obriga o
      `PrismaReadingPlanItemRepository` a implementá-lo, senão `tsc` falha no `implements`.
      São 6 linhas + 3 casos no teste de contrato. Ver o relatório.
- [x] `CONTEXT.md` atualizado com `NoteDoc`/`plainText` derivado.
- [x] Checklist marcada. A linha 08 do `BACKLOG.md` **não** foi tocada: quem fecha é o
      orquestrador.
