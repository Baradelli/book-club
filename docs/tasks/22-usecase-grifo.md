# Tarefa 22 — Domínio `Highlight` + criar, corrigir e arquivar o grifo

> **A primeira fatia do MVP 2.** O dono grifa o livro **de papel** com canetas de cor, e quer
> registrar no app o trecho, a cor, a página e o comentário dele sobre aquele trecho. Esta
> fatia é o domínio e os três UseCases de escrita — sem persistência, sem rota, sem tela.
>
> Leia antes: `docs/adr/0004-grifo-entidade-propria.md` (é a espinha do MVP 2),
> `docs/adr/0001-doc-prosemirror-json.md` (governa o `commentDoc` **explicitamente**),
> `docs/adr/0002-visibilidade-total-no-clube.md`, `docs/adr/0008-updated-at-e-do-dominio.md`,
> `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` **§7.1, §7.1.1, §7.2, §7.3, §7.4**, e os quatro
> vizinhos que esta fatia imita quase linha por linha:
> `src/usecases/{create-free-note,edit-note,archive-note,note-for-author}.ts`.

## Objetivo

Registro um grifo que fiz no livro — o trecho, a cor da caneta, a página e o meu comentário —
sem depender de eu ter escrito anotação naquele dia. Depois corrijo e arquivo **o meu**, e o de
mais ninguém.

## Escopo enxuto

**Entra:** o domínio `Highlight`, a paleta fixa de 5 cores, o port + o fake, o guard de
autoria, e os UseCases `createHighlight` · `editHighlight` · `archiveHighlight`.

| Fora | Por quê |
| --- | --- |
| `listHighlights(filter)` e o `find` do port | É a **Tarefa 23**. Método de port sem chamador é especulação (`docs/WORKFLOW.md`), e o `NoteFilter` da Tarefa 10 nasceu bem justamente porque nasceu junto do UseCase que o usa. |
| `schema.prisma`, migration e repositório Prisma | É a **Tarefa 24**. Aqui não se toca em `prisma/` — e a regra de segurança desta sessão é absoluta. |
| Rotas `/highlights`, schemas Zod de corpo/resposta, `bodyLimit` | É a **Tarefa 24**. |
| Tela de grifos | É a **Tarefa 25**. `CLAUDE.md`: não se cria tela antes do domínio testado. |
| Vínculo com `Note` ou `ReadingPlanItem` (`noteId?`) | ADR 0004 descartou: é relação a mais, com regra de cascata, para uma navegação que ninguém pediu. O campo é **aditivo** se um dia surgir. |
| Desarquivar | MVP 4, como na nota. Arquivado é invisível até lá — inclusive para o autor. |
| Paleta configurável por clube | Decisão fechada do MVP 2: paleta **fixa** de 5 cores; configurável fica em aberto. |
| OCR / extrair o trecho de uma foto da página | Fora de escopo do `CLAUDE.md`. O trecho é **digitado** — é o preço de o livro ser de papel (ADR 0004). |

## Decisões já tomadas (não reabrir)

- **`Highlight` é entidade própria**, com tabela e tela próprias, e **não depende** de existir
  anotação nem `ReadingPlanItem`. → ADR 0004.
- **O comentário usa o mesmo editor:** `commentDoc` é ProseMirror JSON e `commentText` é
  **derivado no backend**, nunca entra no input. O ADR 0001 nomeia `Highlight.commentDoc` /
  `commentText` na própria decisão — não é analogia, é a regra.
- **Paleta fixa, 5 cores**, espelhada com a do editor (`docs/EDITOR.md` §6). → decisões
  fechadas do MVP 2.
- **Ninguém edita nem arquiva conteúdo de outra pessoa** — nem `OWNER`, nem super-admin.
  → ADR 0002. E **dentro do clube não existe conteúdo privado**: o grifo é visível para todo
  membro ativo desde que é salvo.
- **Sem membership ativo → 404**, nunca 403. O 403 de conteúdo existe em **um** lugar só
  (`NotTheAuthorError`) e só é alcançável **depois** do membership.
- **`updatedAt` é do domínio**, não do Prisma. → ADR 0008. ⚠️ O esqueleto do
  `docs/plano-clube-do-livro.md` §6 declara `updatedAt DateTime @updatedAt` no `Highlight`:
  **está desatualizado**, o ADR 0008 o emenda, e quem escrever a migration na Tarefa 24 tem de
  saber disso.
- O `id` é gerado no UseCase com `randomUUID()`.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | A paleta mora em **`packages/shared/src/highlight-color.ts`** (`HIGHLIGHT_COLORS` + `isHighlightColor` + o tipo `HighlightColor`), e o domínio do backend importa dela | Deixá-la no domínio do backend obrigaria a **mover** o arquivo na Tarefa 24 (o Zod da borda precisa da mesma lista) e a **copiá-la** na 25 (a tela precisa das mesmas cores). É exatamente o caminho que o `calendar-day` percorreu na Tarefa 07 — uma implementação, borda e domínio como chamadores — e a lição nº 3 do MVP 1 ("vocabulário compartilhado mora num arquivo só") custou dois bugs. |
| B | `Highlight.color` guarda o **hex de 6 dígitos, minúsculo, sem alpha**: `#facc15` · `#22c55e` · `#f97316` · `#3b82f6` · `#ec4899` | (1) Guardar a string `rgba(250, 204, 21, 0.40)` do editor faria o `z.enum` da Tarefa 24 depender de **espaço em branco e de duas casas decimais** — e o alpha é decisão de **renderização** (texto legível atrás do grifo, `EDITOR.md` §6), não identidade da cor. (2) Guardar nome semântico (`YELLOW`…) parece mais limpo, mas o futuro registrado é **paleta configurável por clube**, e nome não descreve cor arbitrária; o §6 do plano já diz "hex da paleta do clube". Os cinco hex são a **cor base** dos cinco `rgba` do `RichEditor`, então o espelhamento que o ADR 0004 pede continua exato. |
| C | **`commentDoc` é anulável**: dá para registrar o grifo sem comentário, e `commentText` fica `''` | Exigir comentário obrigaria a gravar um documento vazio só para ter onde marcar — o mesmo argumento com que o ADR 0004 recusou o grifo dentro da anotação. |
| D | O comentário reusa **`assertNoteDoc` e `docToText`** do domínio de `Note`, **sem renomear nada** | Renomear para um `editor-doc.ts` neutro tocaria arquivos de três fatias fechadas para ganhar uma palavra na mensagem de um 400 que **a tela nunca mostra** (§6.2 publica `message` só na classe 400, e a Tarefa 15 provou que o front mapeia `status`/`path`, nunca `message`). É o **mesmo tipo de dado**, e o ADR 0001 já governa os dois com a mesma frase. Um `assertCommentDoc` próprio seria uma **cópia** da regra — a lição nº 3 de novo. |
| E | `page` é inteiro **≥ 1**, e **não** é conferido contra `book.totalPages` | `totalPages` é opcional no `Book`, e a edição de quem grifa pode ser outra (bolso × capa dura). Uma guarda que recusa a página real do livro de papel é pior que nenhuma. |
| F | O port tem **só** `save` · `byId` · `update` | `find` é da Tarefa 23; `delete` não existe (hard delete não está no escopo). A interface cresce com quem a usa. |
| G | Sem teto de tamanho no `quote` | O teto é o `bodyLimit` da rota (Tarefa 24, 256 KiB pelo precedente da 11). Um número escolhido aqui seria arbitrário e recusaria uma citação longa legítima. |
| H | Os dois erros novos são registrados no `handleDomainError` **nesta fatia**, no mesmo commit | **Medido:** o `NOT_YET_MAPPED` do `handle-domain-error.test.ts` está **vazio** e o teste de exaustividade varre **todas** as classes exportadas de `domain/errors`. Uma classe nova sem status deixa a suíte **vermelha** — não é escolha. A Tarefa 05 já pagou por adiar isso. |
| I | `archiveHighlight` **não apaga conteúdo** e não tem hard delete | Cópia fiel do `archiveNote`: arquivar é tirar da vista. O acervo do clube continua íntegro, com autoria. |

## Mini-domínio (só desta fatia)

```ts
// packages/shared/src/highlight-color.ts
export const HIGHLIGHT_COLORS = ['#facc15', '#22c55e', '#f97316', '#3b82f6', '#ec4899'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];
export function isHighlightColor(value: unknown): value is HighlightColor;

// packages/backend/src/domain/highlight.ts
export interface Highlight {
  id: string;
  clubId: string;
  bookId: string;
  userId: string;          // o AUTOR. Sempre o ator; nunca vem do input.
  quote: string;           // o trecho grifado, digitado à mão
  color: HighlightColor;
  page: number | null;     // inteiro >= 1
  reference: string | null;
  commentDoc: NoteDoc | null;  // ProseMirror JSON, ou nada ainda
  commentText: string;     // DERIVADO do commentDoc. '' quando não há comentário.
  status: GeneralStatus;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

## Regras (o que os testes provam)

### O domínio

1. `HIGHLIGHT_COLORS` tem **exatamente os cinco valores** da decisão B, e `isHighlightColor`
   recusa qualquer outro — inclusive o mesmo hex em **maiúsculas** e a forma `rgba(...)` do
   editor. ⚠️ Um teste pina os cinco valores como a **cor base** dos cinco `rgba` do
   `RichEditor` (`docs/EDITOR.md` §6): é o espelhamento que o ADR 0004 exige, e a única forma
   de ele não divergir na primeira correção.
2. `quote` é **obrigatório**: vazio ou só-espaços → `InvalidHighlightError`. O gravado vem
   **sem as pontas**.
3. `color` fora da paleta → `InvalidHighlightError`.
4. `page` ausente grava `null`. Presente tem de ser **inteiro ≥ 1**: `0`, negativo, fracionário
   e `NaN` → `InvalidHighlightError`.
5. `reference` passa pelo **mesmo `optionalText`** do livro, do item do plano e da nota:
   `''`/espaços → `null`, o resto sem as pontas. Nenhuma cópia da regra.
6. ⚠️ `commentDoc` ausente ou `null` grava `null` **e** `commentText: ''`. Presente é validado
   por `assertNoteDoc` e o `commentText` é derivado por `docToText` — **a cada escrita**, e
   nunca vindo do input. → ADR 0001.

### `createHighlight`

7. O `clubId` vem de **`book.clubId`**, via `bookForActor`, **nunca do input**; o `userId` é
   sempre o ator. Não existe `userId` nem `clubId` no input.
8. **Não exige papel:** `MEMBER` cria. Livro inexistente, arquivado ou de outro clube →
   `BookNotFoundError` (404); ator sem membership ativo do clube **do livro** →
   `NotAMemberError` (404).
9. ⚠️ O corte de tenant vem **antes** da validação do corpo, e nada é lido nem escrito quando
   ele recusa: `saveCalls === 0` — e o teste asserta também o lado **positivo** (`toBe(1)` no
   caminho feliz), senão um incremento apagado deixa todo `toBe(0)` passar por acidente
   (§7.3).
10. Entrada inválida não deixa **nada** gravado (`saveCalls === 0`): a validação inteira roda
    antes da escrita.
11. O grifo é **ilimitado**: duas chamadas idênticas criam **dois** grifos, com ids diferentes.
    Não há chave natural, não há upsert, e o fake **não** emula índice único nenhum.
12. Nasce `status: 'ACTIVE'`, `archivedAt: null`, e `createdAt === updatedAt` (**um** `new
    Date()` só).

### `editHighlight`

13. ⚠️ **A ordem é obrigatória: membership antes de autoria.** Quem não é do clube recebe
    `NotAMemberError` (404) mesmo não sendo o autor; o membro ativo que não é o autor recebe
    `NotTheAuthorError` (403). Invertê-la confirmaria a um forasteiro que aquele grifo existe.
14. Ausente = **não mexe**. `null` explícito em `page`, `reference` e `commentDoc` **limpa** o
    campo (e limpar o `commentDoc` zera o `commentText`).
15. Patch vazio **não custa um `update`** (`updateCalls === 0`) e devolve o grifo como está —
    é o retry de uma fila que já coalesceu tudo.
16. O patch **inteiro** é validado antes de escrever: um campo ruim não deixa os anteriores
    gravados nem meia edição.
17. `updatedAt` **anda** a cada escrita real. Identidade (`id`), tenant (`clubId`/`bookId`),
    autoria (`userId`), `createdAt`, `status` e `archivedAt` **não são patcheáveis** — o
    `HighlightPatch` é um tipo próprio que enumera os campos permitidos, **nunca**
    `Partial<Highlight>` (§7.1.1, que já nomeia esta fatia), e o fake copia **campo a campo**.

### `archiveHighlight`

18. Só o autor, pelo mesmo guard. Grava `status: 'ARCHIVED'` + `archivedAt` + `updatedAt` **no
    mesmo instante** (um `new Date()` só) e **não apaga conteúdo**: `quote`, `color`, `page`,
    `reference`, `commentDoc` e `commentText` ficam intactos — provado por snapshot
    antes/depois, não por `toBe` campo a campo (§7.6).
19. Grifo inexistente **e** grifo arquivado dão o mesmo `HighlightNotFoundError` (404) — nos
    três UseCases, e inclusive para o próprio autor.

### Transversais

20. ⚠️ `InvalidHighlightError` → **400** e `HighlightNotFoundError` → **404** entram no
    `handleDomainError` **neste commit** (decisão H), e o `NOT_YET_MAPPED` continua **vazio**.
21. O `HighlightRepositoryFake` enumera coleção na ordem **inversa** à de inserção (§7.2 — a
    armadilha deliberada, que esta fatia herda mesmo sem `find` ainda) e expõe
    `saveCalls`/`updateCalls`/`saved` (§7.3). Ele tem **suíte própria**, como os dez fakes
    anteriores.
22. Nenhuma asserção vazia: `resolves.not.toBeInstanceOf(...)` é proibido (§7.4) — asserte a
    saída real e nomeie o teste pelo que ele entrega.

## Testes a escrever PRIMEIRO

```
packages/shared/src/__tests__/highlight-color.test.ts                       regras 1
packages/backend/src/domain/__tests__/highlight.test.ts                     regras 2-6
packages/backend/src/usecases/_fakes/__tests__/highlight-repository-fake.test.ts  regra 21
packages/backend/src/usecases/__tests__/highlight-for-author.test.ts        regras 13, 19
packages/backend/src/usecases/__tests__/create-highlight.test.ts            regras 7-12
packages/backend/src/usecases/__tests__/edit-highlight.test.ts              regras 14-17
packages/backend/src/usecases/__tests__/archive-highlight.test.ts           regras 18-19
packages/backend/src/http/__tests__/handle-domain-error.test.ts             regra 20 (crescer)
```

## Arquivos a tocar

```
packages/shared/src/highlight-color.ts                          NOVO
packages/shared/src/index.ts                                    exporta o novo módulo
packages/backend/src/domain/highlight.ts                        NOVO
packages/backend/src/domain/errors.ts                           + as 2 classes novas
packages/backend/src/http/handle-domain-error.ts                + os 2 status (só isso)
packages/backend/src/usecases/ports/highlight-repository.ts     NOVO
packages/backend/src/usecases/_fakes/highlight-repository-fake.ts  NOVO
packages/backend/src/usecases/highlight-for-author.ts           NOVO
packages/backend/src/usecases/create-highlight.ts               NOVO
packages/backend/src/usecases/edit-highlight.ts                 NOVO
packages/backend/src/usecases/archive-highlight.ts              NOVO
packages/backend/src/test-support/builders.ts                   + aHighlight
+ os arquivos de teste da lista acima
```

**Não tocar:** `packages/backend/prisma/**` (schema, migration e seed são da Tarefa 24 — e a
regra de segurança desta sessão proíbe qualquer operação de banco) · `src/repositories/**` ·
`src/routes/**` · `src/http/{server,repositories,main,token}.ts` · `packages/ui/**` ·
`packages/app/**` · `packages/shared/src/{note,book,club,client,locales}` ·
`src/domain/{note,doc-to-text,optional-text}.ts` (esta fatia **importa** deles, não os
altera). Se precisar mexer em qualquer um destes, **pare e reporte**.

## Definição de pronto

- [x] A paleta é **uma lista, num arquivo**, e o espelhamento com a do editor tem **teste**
      (1) — e ele morde nas **duas** direções: mutar um hex dá **44** acusadores, mutar a
      `rgba` do `RichEditor.tsx` dá **1** em `shared`. Independente do diretório de trabalho.
- [x] `commentDoc` anulável, `commentText` **derivado** e nunca do input (6) — apagar a
      derivação dá **8** acusadores.
- [x] O `clubId` vem do livro e o `userId` do ator — **não existem** no input (7). O
      envenenamento com fallback (`input.userId ?? actor`) dá **1** acusador.
- [x] O corte de tenant vem antes de tudo, com `saveCalls === 0` **e** o lado positivo (9) —
      validar o corpo antes do `bookForActor` dá **1** acusador.
- [x] Grifo é **ilimitado**: duas chamadas idênticas, dois grifos (11). O fake não emula
      índice único nenhum — provado com três grifos byte-idênticos convivendo.
- [x] **Membership antes de autoria** nos três UseCases (13, 19) — inverter a ordem dá **9**
      acusadores, remover o `assertMembership` dá **12**.
- [x] Patch vazio **não** chama `update` (15) e `HighlightPatch` é tipo próprio (17) — mover a
      guarda para antes do guard de autoria dá **5** acusadores; apagá-la dá **3**; trocar a
      cópia campo a campo do fake por spread dá **3**.
- [x] Arquivar **não apaga conteúdo**, provado por snapshot (18).
- [x] Os 2 erros novos mapeados e `NOT_YET_MAPPED` **vazio** (20).
- [x] O fake enumera **invertido** e tem suíte própria (21).
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos: **320 · 175 · 1213 · 424** (baseline era
      285 · 175 · 949 · 424).
- [x] `packages/app` e `packages/ui` em **424** e **175** — intocados.
- [x] Os testes de **integração NÃO foram rodados** (escrevem no banco do dono) — e não havia
      como o número mudar: `prisma/`, `repositories/` e `routes/` estão intocados, provado por
      `git status` e por data de modificação (o mais recente é de 2026-09-04; a fatia é de
      2026-09-09).
- [x] **Contagem de linhas de código colada** por arquivo novo — o maior de produção tem
      **72** linhas (`edit-highlight.ts`), e o fake tem **68** contra **145** do
      `NoteRepositoryFake`.
- [x] Checklist marcada; a linha 22 do `BACKLOG.md` é do orquestrador.

## A rodada de correção (o que a auditoria por mutação mudou)

Um achado **ALTO**, três **BAIXO**, nenhum bloqueador.

- **[ALTO] `createdAt === updatedAt` e `archivedAt === updatedAt` tinham ZERO acusadores** — e
  cinco blocos de prosa afirmavam o contrário. Duas chamadas a `new Date()` no mesmo tick
  devolvem o mesmo milissegundo, então a igualdade provava "a suíte é rápida". Consertado com
  um **relógio que anda e conta leituras** (`test-support/advancing-clock.ts`, com a
  precondição "duas leituras diferem" como primeiro teste da própria suíte dele): **0 → 1**
  acusador em cada UseCase, verificado por mutação do orquestrador com `md5sum -c` + `diff`.
  A prosa falsa foi corrigida nos cinco blocos. → virou a **4ª aparição do §7.8** do
  `CONVENCOES-CODIGO`, com a regra nova: *"um relógio só" se prova contando leituras, nunca
  comparando instantes*.
- **[BAIXO]** O teste de contrabando de `clubId` no `edit` prometia no nome o que não provava.
  O executor **discordou com medição** e estava certo: o ator já era membro do clube
  contrabandeado, e o teste não pode acusar aquele mutante por um motivo **estrutural** — o
  `editHighlight` monta o input do guard campo por campo, então um `clubId` do corpo nunca
  chega lá. Renomeado para o que prova, com ponteiro **pelo nome** do teste que prova a
  propriedade. O "gêmeo no `archive`" que eu supus **não existe** (aquele input não tem corpo).
- **[BAIXO]** Duas asserções `expect(x).toBe(docToText(doc))` eram identidades (§7.8).
  Apagadas; o literal escrito à mão continua sendo o acusador, e a contagem **não caiu** (8).
- **[BAIXO]** Meia frase de docblock indistinguível por construção ("conta a chamada, não o
  sucesso" num `save` que não pode falhar) — ajustada para a verdade, apontando para onde a
  propriedade **é** decidível (§7.10). Medido: contar só o sucesso dá **0** acusadores ali.

**Registrado, não consertado:** `packages/ui` não tem pino próprio da paleta do editor — o
espelho morde nas duas direções, mas o único guarda das cores do editor vive em outro pacote.
Vai para a **Tarefa 25**, que toca a paleta do front de qualquer forma.
