# ADR 0007 — `ReadingPlanItem.order` tem índice, não `@@unique`

- Status: aceito
- Data: set/2026
- Fase: MVP 1 (Bloco B — Livro e plano de leitura)
- Emenda: `docs/plano-clube-do-livro.md` §6, que declara `@@unique([bookId, order])`

## Contexto

O `docs/plano-clube-do-livro.md` §6 declara dois índices únicos em `ReadingPlanItem`:

```prisma
@@unique([bookId, date])
@@unique([bookId, order])
```

A Tarefa 06 implementou `replacePlanItems` como **diff pela `date`** (o item cuja data
sobrevive mantém o mesmo `id`, para as anotações não serem destruídas — ver
`docs/tasks/06-usecases-book-plano-leitura.md`). O `order` é sempre **derivado da posição** no
rascunho, então um item que sobrevive mas muda de posição é **renumerado**.

A auditoria da Tarefa 06 encontrou o problema por teste de mutação. O fake do repositório
validava o lote **em conjunto** — isto é, como se o índice fosse
`DEFERRABLE INITIALLY DEFERRED`. Trocando o fake para validar **linha por linha**, que é a
semântica real do Postgres, o caso de uso dominante quebra:

```
plano: [2026-10-01 (order 0), 2026-10-02 (order 1)]
rascunho: acrescenta 2026-09-30 na frente
→ violates unique(bookId, order) — 2026-10-01 already uses order 0 in book book-1
```

Isso não é detalhe de fake: **`@@unique` do Prisma emite `CREATE UNIQUE INDEX`, e índice
único no Postgres não pode ser deferido** (só `CONSTRAINT ... UNIQUE` pode). Nem uma
transação resolve — transação garante atomicidade, não deferimento. Acrescentar um "Prólogo"
na frente do plano, ou empurrar o plano N dias (MVP 4, Tarefa 44), colidiria em produção
enquanto a suíte permanece verde.

## Decisão

`ReadingPlanItem` fica com:

```prisma
@@unique([bookId, date])   // mantido — é a chave natural do dia de leitura
@@index([bookId, order])   // era @@unique
```

A unicidade do `order` passa a ser **invariante de domínio**, garantida por construção:
`normalizePlanDrafts` (em `src/domain/reading-plan.ts`) atribui `order` a partir da posição no
array, portanto a sequência é sempre `0..n-1`, contígua e sem repetição. O banco não precisa
reafirmar o que o domínio não consegue violar — e, ao reafirmar, ele **impede** a renumeração
legítima.

`@@unique([bookId, date])` **fica**, e é o que importa: é a chave do diff, é o que garante
"um dia de leitura por data", e é o índice que uma nota do dia depende indiretamente
(`Note.planItemId` → o item daquele dia).

## Alternativas consideradas

- **Renumeração em duas fases dentro da transação** — mandar todos os sobreviventes para um
  `order` temporário (negativo) e depois para o final. Funciona, mas dobra as escritas em
  toda edição de plano e mantém o código acoplado a um índice que não protege nada.
- **Ordenar o lote conforme o sinal do deslocamento** — aplicar em `order` decrescente ao
  empurrar para frente, crescente ao encolher. Frágil, e não cobre o caso misto (alguns itens
  sobem, outros descem na mesma operação).
- **Trocar o índice único por `CONSTRAINT UNIQUE DEFERRABLE`** — resolveria de verdade, mas o
  Prisma não gera constraint deferível, e escrever isso exigiria **SQL de migration à mão**,
  o que o `CLAUDE.md` proíbe explicitamente.
- **Manter `@@unique` e desistir do diff, voltando a apagar-e-recriar** — descartado na
  Tarefa 06: destruiria as anotações das pessoas (`Note.planItemId` com `onDelete: Restrict`
  faria a operação falhar; com `Cascade`, apagaria nota de outra pessoa).

## Consequências

- (+) `replacePlanItems` funciona nos dois casos reais que motivaram o diff: corrigir o tema
  de um dia, e acrescentar/remover dias no meio do plano.
- (+) "Empurrar o plano N dias" (Tarefa 44) nasce possível, em vez de exigir esta mesma
  decisão sob pressão.
- (+) O índice `@@index([bookId, order])` continua servindo à ordenação, que é o uso real.
- (−) O banco deixa de barrar um `order` duplicado. Aceito: o único caminho de escrita passa
  por `normalizePlanDrafts`, e o `order` lá não é entrada — é a posição do array. Se um dia
  existir escrita de plano que não passe por ele, esta decisão precisa ser revista.
- (−) O fake do repositório precisa parar de emular `unique(bookId, order)`, senão continua
  reprovando o que o banco vai aceitar. A auditoria mostrou que **fake mais restritivo que o
  banco também é infidelidade** — não só o contrário.
- (−) Divergência registrada com o §6 do plano de produto. Este ADR é a emenda; o §6 não foi
  reescrito.

## Para a Tarefa 07

O `schema.prisma` deve declarar `@@index([bookId, order])`, **não** `@@unique`. Como as
tabelas `Book` e `ReadingPlanItem` ainda não existem no banco quando este ADR é escrito, isso
não custa migration corretiva — basta nascer certo.

E o teste de contrato do repositório Prisma deve provar o caso que motivou o ADR: **inserir um
item na frente de um plano existente, renumerando os sobreviventes, numa só operação.** É o
teste que o fake não conseguia dar.
