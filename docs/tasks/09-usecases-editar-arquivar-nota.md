# Tarefa 09 — UseCases `editNote` e `archiveNote`

> Continua o **Bloco C**. Fecha a escrita de anotação: corrigir o que se escreveu e tirar da
> vista o que não serve mais. Domínio puro, TDD estrito contra fakes.
> **Sem Prisma, sem migration, sem rota, sem tela** — isso é a Tarefa 11.
>
> Leia antes: `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md`, `docs/tasks/08-usecase-note.md`
> (esta fatia reusa `Note`, `assertNoteDoc`, `docToText`, `normalizeNoteTitle`,
> `optionalText` e o `NoteRepositoryFake`) e **`docs/adr/0002-visibilidade-total-no-clube.md`**,
> que é a regra central desta tarefa.

## Objetivo

O autor corrige a própria anotação — título, referência e texto — e arquiva a que não quer
mais na listagem. **Ninguém mais mexe:** nem o `OWNER` do clube, nem o super-admin. O grupo
lê tudo e não interfere em nada.

## Decisões já tomadas (do BACKLOG e dos ADRs — não reabrir)

- **Ninguém edita ou arquiva conteúdo de outra pessoa.** Nota e grifo só o autor mexe.
- **Não existe nota privada**: toda nota do clube é visível para os membros ativos. → ADR 0002.
- Sem membership ativo no clube → **404**, nunca 403.
- **O `doc` é ProseMirror JSON; `plainText` é derivado no backend** a cada escrita, por
  `docToText`. Nunca entra no input. → ADR 0001.
- Soft delete com `status` (`ACTIVE`/`ARCHIVED`) + `archivedAt`. **Hard delete só do que já
  está arquivado** — e não nesta fatia.
- `ReadingLog` e `ActivityEvent` são a exceção imutável, e não existem ainda (MVP 3).

## ⚠️ A decisão que precisa do dono ANTES de executar

### `editNote` recusa uma nota do dia (`kind = 'PLAN'`)

A anotação do dia já tem um caminho de escrita: o `upsertPlanNote` da Tarefa 08, endereçado
por `(planItemId, userId)` — e é justamente por ser idempotente que ele serve ao autosave da
Tarefa 18. **Proponho que `editNote` sirva só à anotação avulsa** e recuse uma nota `PLAN`
com `InvalidNoteError` (400).

O motivo é evitar **dois caminhos de escrita para o mesmo campo com regras diferentes**: o
`upsertPlanNote` **ressincroniza o título** com o tema do plano a cada escrita (regra 25 da
Tarefa 08), e o `editNote` não teria como fazer isso sem carregar o item do plano. Uma nota do
dia editada pelo `editNote` ficaria com o título velho — divergência silenciosa, do tipo que
só aparece meses depois quando alguém compara a tela do plano com a da anotação.

A alternativa, que eu **não** recomendo mas registro: **`editNote` aceita `PLAN` e edita só o
`doc`**, recusando `title`/`reference`. Fica mais cômodo para o front (uma rota `PATCH
/notes/:id` que "sempre funciona"), ao custo da divergência de título acima. Se o dono
preferir esse caminho, a regra 12 abaixo inverte e o `editNote` precisa receber o
`ReadingPlanItemRepository` para ressincronizar — e aí são **dois** lugares mantendo a mesma
regra em sincronia, que é exatamente o que o `bookForActor` e o `optionalText` existem para
evitar.

O front não perde nada com a recusa: são **telas diferentes** (Tarefa 18 × Tarefa 19), e cada
uma já sabe qual nota está editando.

### E a pergunta que segue em aberto (quarta tarefa seguida)

**Clube arquivado continua legível?** O `assertMembership` confere o status do *membership*,
nunca o do *clube*. Esta fatia acrescenta **mais duas escritas** ao conjunto que a decisão vai
atingir. Herda o comportamento atual sem mudá-lo.

## Por que aqui o 403 é o certo — e é o único lugar do projeto onde é

Em todo corte de **tenant** o projeto responde **404**: não vazamos a existência de um recurso
de outro clube. Aqui é diferente, e a diferença vem do ADR 0002.

Um membro ativo do clube **já vê** a nota de todo mundo — ela está na listagem, com autoria,
por decisão de produto. Responder 404 quando ele tenta editá-la não esconderia nada: ele
acabou de ler a nota na tela ao lado. Seria **teatro de segurança**, e pior, mentiria para o
front, que precisa distinguir "essa nota não existe" de "essa nota não é sua" para mostrar a
mensagem certa.

Então:

| situação | erro | status | por quê |
|---|---|---|---|
| nota não existe, ou é de outro clube, ou está arquivada | `NoteNotFoundError` | **404** | o corte de tenant; e arquivada é invisível até o MVP 4 |
| ator não é membro ativo do clube da nota | `NotAMemberError` | **404** | o corte de tenant da Tarefa 01, intocado |
| ator **é** membro ativo, mas **não é o autor** | `NotTheAuthorError` | **403** | ele já pode ler a nota (ADR 0002); esconder não protege nada |

**A ordem é obrigatória**: membership **antes** de autoria. Quem não é do clube não pode
descobrir, pela diferença entre 403 e 404, que aquela nota existe.

## Mini-domínio (só o que cresce)

Nada de entidade nova. Dois erros em `src/domain/errors.ts`:

```ts
export class NoteNotFoundError extends Error {}  // 404 — inexistente, de outro clube, ou arquivada
export class NotTheAuthorError extends Error {}  // 403 — é do clube, mas a nota não é dele
```

> **O gate de exaustividade.** Registre `[NoteNotFoundError, 404]` e `[NotTheAuthorError, 403]`
> em `src/http/handle-domain-error.ts` **no mesmo commit** em que criar as classes;
> `NOT_YET_MAPPED` **continua vazio**. É a única coisa que esta fatia toca em `src/http/`.
> Não repita a dívida que atravessou da Tarefa 05 até a 07.

E o guard, extraído desde o início porque **os dois UseCases da fatia precisam dele** — é o
mesmo critério que tirou o `bookForActor` do `getBookWithPlan` na Tarefa 06:

`src/usecases/note-for-author.ts`:

```ts
export interface NoteForAuthorInput {
  actorUserId: string;
  noteId: string;
}

/**
 * Carrega a nota e confirma que o ator é (a) membro ativo do clube DA NOTA e
 * (b) o autor. O clube vem de `note.clubId`, nunca do input.
 */
export async function noteForAuthor(
  notes: NoteRepository,
  assertMembership: AssertMembership,
  input: NoteForAuthorInput,
): Promise<Note>;
```

## Ports — o que cresce

`NoteRepository` ganha **dois** métodos, no vocabulário do projeto
(`save · byId · update · find · delete`):

```ts
/**
 * A nota por id, **inclusive arquivada**. O repositório não esconde: quem
 * decide o que fazer com uma nota arquivada é o `noteForAuthor`.
 */
byId(id: string): Promise<Note | null>;

/** `undefined` no patch é "não mexe"; `null` grava nulo — como no Prisma. */
update(id: string, patch: Partial<Note>): Promise<Note>;
```

Sem `find` e sem `delete`: `listNotes` é a Tarefa 10 e hard delete não está no escopo.

O `NoteRepositoryFake` precisa de `updateCalls` além do `saveCalls` que já tem (padrão
`compareCalls` do `docs/CONVENCOES-CODIGO.md` §6.4): sem contador, um `saved` inalterado não
distingue "não chamou o repo" de "chamou e o patch não mudou nada" nos testes de caminho de
erro. E o `update` tem de **continuar validando `unique(planItemId, userId)` linha por
linha** — `Partial<Note>` aceita `planItemId`, então o fake não pode confiar que só o `save`
cria par duplicado.

## Contratos dos UseCases

```ts
// src/usecases/edit-note.ts
export interface EditNoteInput {
  actorUserId: string;      // tem de ser o AUTOR
  noteId: string;
  /** Ausente = não mexe. Vazio/só-espaços = InvalidNoteError. */
  title?: string;
  /** Ausente = não mexe. `null`/`''`/espaços = limpa (grava `null`). */
  reference?: string | null;
  /** Ausente = não mexe (renomear não exige reenviar o documento). */
  doc?: unknown;
}
export interface EditNoteOutput { note: Note }
// deps: AssertMembership, NoteRepository
```

```ts
// src/usecases/archive-note.ts
export interface ArchiveNoteInput {
  actorUserId: string;
  noteId: string;
}
export interface ArchiveNoteOutput { note: Note }
// deps: AssertMembership, NoteRepository
```

**Não existem no input, e não podem entrar por contrabando:** `userId`, `clubId`, `bookId`,
`kind`, `planItemId`, `createdAt`, `status`, `archivedAt`, `plainText`. Autoria e tenant vêm
do JWT e da própria nota; `plainText` é derivado; `status` só muda pelo `archiveNote`.

## Regras de negócio (o que os testes provam)

### `noteForAuthor` — o guard (suíte própria)

1. Nota inexistente → `NoteNotFoundError`.
2. Nota **arquivada** → `NoteNotFoundError` (o mesmo erro: arquivada é invisível até o MVP 4,
   e distinguir vazaria estado).
3. Ator sem `Membership` **ativo** no clube da nota → `NotAMemberError` (404). Vale também
   para membership **arquivado**.
4. Membro ativo do clube que **não é o autor** → `NotTheAuthorError` (403).
5. **A ordem**: um ator que **não é do clube** e **não é o autor** recebe `NotAMemberError`,
   **não** `NotTheAuthorError`. Inverter a ordem tem de deixar um teste vermelho.
6. O clube conferido é `note.clubId` — um ator membro de **dois clubes** não passa pela nota
   do clube em que ele não está.
7. O autor recebe a nota.
8. Ser `OWNER` **não** ajuda: `OWNER` do clube que não é o autor recebe 403.

### `editNote`

9. Delega ao `noteForAuthor` (as regras 1–8 valem; teste o suficiente para provar a
   delegação, não copie a suíte inteira).
10. Edita o `doc` de uma nota `FREE`: `doc` novo, `plainText` **derivado dele**, `updatedAt`
    novo.
11. `title`: ausente = não mexe; presente = aparado por `normalizeNoteTitle`.
12. **Nota `PLAN` → `InvalidNoteError`** (ver a decisão ⚠️ acima), e **nada é gravado**.
13. `title` vazio ou só-espaços → `InvalidNoteError`, **nada gravado**.
14. `reference`: ausente = não mexe; `null`, `''` ou só-espaços → grava `null`; texto → aparado.
    Usa `optionalText`, **não** uma cópia da regra.
15. `doc` ausente = não mexe, **e o `plainText` não é recalculado** (renomear não pode mexer no
    texto derivado).
16. `doc` malformado → `InvalidNoteError`, **nada gravado**.
17. Patch vazio (só o `noteId`) → devolve a nota como está e **não chama o repositório**
    (`updateCalls === 0`). Não é erro: é o retry de uma fila offline que já coalesceu tudo.
18. **Imutáveis**: `id`, `createdAt`, `kind`, `userId`, `clubId`, `bookId`, `planItemId`,
    `status` e `archivedAt` sobrevivem à edição.
19. **Contrabando**: mandar `userId`/`clubId`/`plainText`/`status` no input **não muda a linha
    gravada**. → ver "como testar contrabando" abaixo: o ator tem de ser o **autor
    legítimo**.
20. O `doc` é gravado **como veio** (snapshot antes/depois — ver abaixo).
21. Não vaza estado entre duas chamadas do mesmo instance.

### `archiveNote`

22. Delega ao `noteForAuthor`.
23. Arquiva: `status: 'ARCHIVED'`, `archivedAt` = agora **e `updatedAt` = o MESMO instante**.
    → **`docs/adr/0008-updated-at-e-do-dominio.md`**, que emenda esta regra: o domínio é o
    dono de `updatedAt` (o `Note` nasce **sem** `@updatedAt` no schema — Tarefa 11), e
    `updatedAt` significa "quando esta linha mudou pela última vez"; arquivar muda a linha.
    A leitura antiga desta spec ("arquivar mexe só em `status` e `archivedAt`") exigiria que
    `updatedAt` fosse "última edição de **conteúdo**", e aí faltaria uma terceira coluna para
    "última mudança de linha" — complexidade sem caso de uso. E o `archiveBook` **não** é
    precedente contra isso: o `Book` não tem a coluna.
    O instante é **um só** (`const archivedAt = new Date()` alimentando os dois campos): dois
    `new Date()` divergiriam em milissegundos e deixariam o teste de igualdade
    não-determinístico.
24. **Não apaga conteúdo**: `doc`, `plainText`, `title` e `reference` saem intactos. Arquivar
    é tirar da vista, não destruir — o acervo do clube continua íntegro (ADR 0002).
25. Nota **já arquivada** → `NoteNotFoundError`, e o `archivedAt` original **não é regravado**
    (é o precedente do `archiveBook`, que documenta exatamente isso).
26. `id` e `createdAt` preservados.
27. Só o autor arquiva: `OWNER` do clube → 403, com teste explícito.
28. Não existe hard delete nesta fatia.

### Port e fake

29. `byId` devolve a nota **inclusive arquivada**.
30. `update(id, patch)`: `undefined` não mexe, `null` grava nulo.
31. `update` de id inexistente → `Error` cru (nunca erro de domínio — o padrão dos outros fakes).
32. `update` que criaria par `(planItemId, userId)` duplicado é recusado, **linha por linha**.
33. `updateCalls` existe e conta.

## Como testar — as quatro lições que a auditoria da Tarefa 08 comprou

Estas não são sugestões. Cada uma nasceu de um mutante que sobreviveu a 708 testes:

1. **Contrabando se testa com o ator LEGÍTIMO, assertando a linha gravada.** Um teste de
   contrabando com ator de fora do clube morre no guard e **nunca chega ao campo que é
   escrito** — prova que a *conferência* ignora o input, nunca que a *linha gravada* ignora.
   Faça **dois** testes por campo: o legítimo assertando `note.<campo>` e
   `notes.saved[0].<campo>`, e o de fora provando o corte. E lembre que o mutante perigoso
   não é `x: input.x` (que quebra com `undefined`), é **`input.x ?? note.x`** — o
   envenenamento com fallback, que funciona normalmente quando o campo está ausente.
2. **Losslessness do `doc` se prova por snapshot ANTES/DEPOIS, nunca por `toBe`.** `toBe`
   prova identidade de referência, que não é o contrato: uma travessia que apagasse os `marks`
   devolvendo o mesmo objeto passa nele. Fotografe com `structuredClone` antes do `execute` e
   compare o gravado contra o snapshot.
3. **Fixture de objeto é FACTORY, nunca `const` de `describe`.** Um teste que muta a fixture
   compartilhada neutraliza silenciosamente o teste seguinte
   (`docs/CONVENCOES-CODIGO.md` §6.6).
4. **Os dois eixos têm de se cruzar.** Todo teste de "ator errado" com corpo válido e todo
   teste de "corpo inválido" com ator válido deixam a **ordem** de validação sem prova. Escreva
   os cruzados: ator de fora **com** corpo malformado ⇒ o erro de tenant vence; não-autor
   **com** título vazio ⇒ o 403 vence.

E uma quinta, do estilo: **asserção exata (`toBe`) em string derivada**, não `toContain` —
foi um `toContain` que deixou passar um `docToText` que grudava palavras.

## Testes a escrever PRIMEIRO

```
src/usecases/__tests__/note-for-author.test.ts   regras 1–8
src/usecases/__tests__/edit-note.test.ts         regras 9–21
src/usecases/__tests__/archive-note.test.ts      regras 22–28
src/usecases/_fakes/__tests__/note-repository-fake.test.ts   crescer: 29–33
src/http/__tests__/handle-domain-error.test.ts   crescer: os 2 status novos
```

## Arquivos a tocar

```
NOVOS
  src/usecases/note-for-author.ts
  src/usecases/edit-note.ts
  src/usecases/archive-note.ts
  + os 3 arquivos de teste novos

CRESCEM
  src/domain/errors.ts                        +2 classes
  src/http/handle-domain-error.ts             +2 linhas de mapeamento (e só isso)
  src/usecases/ports/note-repository.ts       +byId, +update
  src/usecases/_fakes/note-repository-fake.ts +byId, +update, +updateCalls
  src/test-support/builders.ts                se `aNote` precisar de algo
```

**Não tocar:**

- `packages/backend/prisma/**` — o modelo `Note` nasce na **Tarefa 11**.
- `src/routes/**` e o resto de `src/http/**`.
- `src/repositories/**` — **e desta vez a proibição é real**: não existe
  `PrismaNoteRepository` (é da Tarefa 11), então crescer o `NoteRepository` não obriga
  implementação nenhuma. Confira com `pnpm -r typecheck` antes de concluir que está tudo
  bem — foi assim que a Tarefa 08 descobriu que a proibição equivalente lá era impossível.
- `src/usecases/upsert-plan-note.ts` e `create-free-note.ts` — a Tarefa 08 está fechada e
  auditada. Se precisar mexer, **pare e reporte**: significa que esta spec está errada.
- `packages/shared/**` (schemas Zod de nota são da Tarefa 11), `packages/ui/**`,
  `packages/app/**`.

## Fora de escopo

- `listNotes` e "quem escreveu em cada `planItemId`" → Tarefa 10.
- Repo Prisma de `Note`, migration, índice único real, rotas → Tarefa 11.
- **Hard delete** de nota arquivada. Não há tela para isso no MVP 1.
- **Desarquivar** → MVP 4 (Tarefa 45 arquiva pela interface; desarquivar nem isso).
- Resolução de conflito / lock otimista: `editNote` é **last-write-wins**. Offline Nível 2
  está explicitamente fora do escopo no `CLAUDE.md`.
- `NoteLink` (menções materializadas), `Attachment`, `ActivityEvent`.
- Qualquer poder de admin ou de super-admin sobre nota de outra pessoa. É o ADR 0002.

## Definição de pronto

- [x] `noteForAuthor` com as regras 1–8, **incluindo a 5** (a ordem membership→autoria, com o
      ator que falha nas duas) e a **8** (`OWNER` não ajuda).
      → 16 testes em `note-for-author.test.ts` (era 15); a ordem foi confirmada por mutação
      (inverter os dois blocos deixa 3 testes vermelhos). O 16º é o da rodada de correção:
      **um `clubId` que chegue no input é ignorado** — o guard confere `note.clubId`, e sem
      esse teste um `input.clubId ?? note.clubId` sobrevivia à suíte inteira, esperando o
      primeiro chamador que fizesse `noteForAuthor(..., { ...req.body, actorUserId })`.
- [x] `editNote` com as regras 9–21; em especial: **`plainText` não é recalculado quando o
      `doc` não vem** (15), **patch vazio não chama o repo** (17) e **nada é gravado quando a
      validação falha** (13/16).
      → 49 testes em `edit-note.test.ts` (era 46). A regra 15 é provada com fixture de
      `plainText` deliberadamente divergente do `doc` (sem ela, "recalculou" e "não
      recalculou" dão o mesmo resultado). Os 3 da rodada de correção: **o `updatedAt` anda
      também num patch só de título e num só de `reference`** (sem eles, um
      `updatedAt: patch.doc === undefined ? note.updatedAt : new Date()` sobrevivia — e é o
      `updatedAt` que ordena "editadas recentemente" e invalida o cache do PWA), e **o
      contrabando de `plainText` num patch SEM `doc`** (o teste antigo mandava `doc`, e o
      `patch.plainText` derivado tapava um envenenamento colocado antes do spread).
- [x] `archiveNote` com as regras 22–28; em especial: **o conteúdo sai intacto** (24),
      **`archivedAt` de nota já arquivada não é regravado** (25) e **o `updatedAt` anda, para
      o mesmo instante do `archivedAt`** (23 — ADR 0008).
      → 16 testes em `archive-note.test.ts` (era 15). O 16º é o do ADR 0008, que **inverteu**
      o que esta fatia havia entregue: o executor original decidira não mexer em `updatedAt`
      citando um precedente do `archiveBook` que não existe (o `Book` não tem a coluna), e o
      mutante que acrescentava `updatedAt` ao patch sobrevivia aos 814 testes porque nenhum
      teste olhava o campo. Agora dois mutantes morrem nele: tirar `updatedAt` do patch, e
      gravá-lo num instante diferente do `archivedAt`.
      Um teste também foi **renomeado**: `answers the tenant cut to an outsider aiming at an
      archived note` prometia o corte de tenant (`NotAMemberError`) e assertava
      `NoteNotFoundError`, que é o corte da nota arquivada — checado antes da membership. O
      nome novo diz o que a asserção faz.
- [x] Fake com `byId`, `update` e `updateCalls`, e o índice único validado **linha por linha**
      também no `update` (29–33).
      → 18 testes novos em `note-repository-fake.test.ts` (27 → 45).
- [x] `NoteNotFoundError` e `NotTheAuthorError` mapeados no `handleDomainError` no mesmo commit
      em que nascem; `NOT_YET_MAPPED` **continua vazio**.
      → o gate de exaustividade ficou vermelho ao criar as classes e verde ao mapeá-las, no
      mesmo conjunto de mudanças (o commit é do dono).
- [x] Os testes **cruzados** dos dois eixos existem (lição 4): ator de fora + corpo malformado,
      e não-autor + título vazio.
      → `describe('the order: the cut comes before the body')` no `edit-note.test.ts` (4
      cruzamentos, incluindo os dois contra a recusa de nota `PLAN`) e um no
      `archive-note.test.ts` (forasteiro × nota arquivada). Os **4** cruzados do `editNote`
      assertam `updateCalls === 0` — os dois contra a nota `PLAN` só checavam a classe do
      erro, e "o erro certo" sem "nada escrito" é meia prova.
- [x] Contrabando testado com o **ator legítimo** e asserção na linha gravada (lição 1),
      inclusive contra o mutante `input.x ?? note.x`.
      → 8 testes (era 7). Na rodada de correção o mutante **antes do spread** foi injetado nos
      **9** campos imutáveis, um a um: 8 morrem, e o único sobrevivente é o `id` — porque o
      fake **descarta** um `id` que venha no patch (`{...existing, ...patch, id}`), o que
      torna a propriedade indecidível no teste unitário. Não é conserto desta fatia: a
      decisão está registrada no ADR 0008 ("Para a Tarefa 11", item 2) — o
      `PrismaNoteRepository.toUpdateData` **nunca mapeia `id`**, e o teste de contrato prova
      que um patch com `id` não troca a chave. **O fake não foi mexido.**
      O 8º teste fechou o ponto cego do `plainText`: o teste antigo mandava sempre um `doc`,
      e era o `patch.plainText` derivado dele que tapava o envenenamento colocado antes do
      spread. Num patch **só de título** o mutante passava incólume.
- [x] Losslessness do `doc` por **snapshot antes/depois** (lição 2). Nenhuma fixture de objeto
      é `const` de `describe` (lição 3).
      → `structuredClone` antes do `execute` no `editNote` e no `archiveNote`; as fixtures
      são as fábricas `validInput()`/`input()`/`stored()`.
- [x] O JSDoc do `aNote` (`src/test-support/builders.ts`) **diz o que o código faz**.
      → Ele afirmava que `plainText` é derivado do `doc` "aqui também" e que aceitar os dois
      independentemente deixaria o teste provar um estado impossível. Mas o
      `plainText: docToText(doc)` está **antes** do `...overrides`, então um `plainText`
      explícito **vence** — ao contrário do `email`/`id` do `aUser`, que vêm **depois** do
      spread justamente para o invariante ser inescapável. A assimetria fica: a **regra 15**
      só é mensurável com um `plainText` divergente do `doc` (com os dois coerentes, "não
      recalculou" e "recalculou e deu no mesmo" dão o mesmo resultado), e o estado é
      realista — `plainText` derivado por uma versão anterior do `docToText`, que é o que o
      próprio ADR 0001 pressupõe ao dizer que reconstruí-lo de tudo é trivial. **O código do
      builder não mudou; o comentário mudou.**
- [x] `pnpm -r typecheck`, `pnpm lint` e `pnpm prettier --check .` limpos.
- [x] `pnpm test` verde, com a contagem colada no relatório. → **819 testes, 38 arquivos**
      (era 814 em 38 na entrega da fatia; 717 em 35 antes dela).
- [x] `prisma/`, `src/routes/`, `src/repositories/`, `shared/`, `ui/` e `app/` intocados —
      **verificado**, não presumido. → `find -newermt` lista só os 12 arquivos da fatia, e
      `find prisma -newermt` volta vazio também na rodada de correção. O modelo `Note` (e o
      `updatedAt DateTime` **sem** `@updatedAt` que o ADR 0008 exige) é da Tarefa 11.
- [x] `src/usecases/upsert-plan-note.ts` e `create-free-note.ts` **byte-idênticos** (confira
      por `md5sum`). → `4c8e9d9c484184042bfb9f648686a14d` e `07bd634cfd1729e585fc195e14a42dfa`,
      reconferidos ao fim da rodada de correção.
- [x] Rodada de correção: os 3 arquivos de produção mutados voltaram **byte-idênticos**, e o
      único que mudou de propósito é o `archive-note.ts` (ADR 0008).
      → `note-for-author.ts` `409730bc80f565e2f4467d8e5ca5dfef` (antes = depois),
      `edit-note.ts` `a9a398a4400fa112a0c9de11780f29b3` (antes = depois),
      `note-repository-fake.ts` `1a249067b2b8fd2d240c76c507c1b651` (nem foi tocado),
      `archive-note.ts` `c106087a6630dcfb250a945a6764c94d` → `318c755eae022ef456f5dfc17310a832`.
- [ ] Checklist marcada e linha 09 do `BACKLOG.md` fechada com o que foi entregue.
      → checklist marcada; **o `BACKLOG.md` não foi tocado**: quem fecha a linha é o
      orquestrador/dono, por instrução explícita desta execução.
