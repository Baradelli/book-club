# Tarefa 33 — Domínio `ActivityEvent` + `recordActivity` + o gatilho

> **A abertura do Bloco H, e é a fatia mais delicada do MVP 3 até aqui**: ela põe um gatilho
> **dentro de quatro UseCases que já funcionam e já têm auditoria**. A pergunta que governa a
> fatia inteira não é "o evento nasce?", é **"o que o gatilho pode quebrar?"**.
>
> Leia antes: `CLAUDE.md`, `docs/NOTIFICACOES.md` **§1** (as duas notificações e por que só
> duas), `docs/CONVENCOES-CODIGO.md` **§7.1** (a 7ª aparição foi na Tarefa 32; e a saída da 4ª:
> *"extrair, não cobrir duas vezes"*, que **nomeia o `ActivityEvent`**), **§7.3**, **§7.4**,
> **§7.8** (o relógio: "um relógio só" se prova **contando leituras**), `docs/adr/0002`,
> `docs/adr/0006` (o `GROUP_ACTIVITY` sai do mesmo UseCase que grava o evento), `docs/adr/0008`.
>
> **Os vizinhos:** `packages/shared/src/highlight-color.ts` (⚠️ **o molde do vocabulário
> compartilhado** — lista num arquivo só, o `z.enum` da borda construído **a partir** dela, com
> teste pinando que `schema.options` **é** a constante) · `src/domain/reading-log.ts` (a
> entidade de log imutável, entregue na 30) · `src/usecases/assert-membership.ts` (⚠️ **o
> precedente de UseCase injetado em UseCase**) · `src/usecases/{upsert-plan-note,
> create-free-note,create-highlight,mark-read}.ts` (os quatro que ganham o gatilho) ·
> `src/test-support/advancing-clock.ts`.

## Objetivo

Quando alguém do clube lê, escreve ou grifa, fica registrado — e nada do que a pessoa escreveu
se perde se esse registro falhar.

## Escopo enxuto

**Entra:** a entidade `ActivityEvent`, o vocabulário de tipos num arquivo só em `shared`, o
port com fake, o UseCase `recordActivity`, e o gatilho nos **quatro** UseCases de nascimento.

| Fora | Por quê |
| --- | --- |
| Modelo Prisma, migration, repositório real, rota | É a **Tarefa 34**, e é lá que o port ganha `find` com a implementação Prisma na mesma unidade (§6.9). |
| O feed na tela | É a **Tarefa 35**. |
| ⚠️ **Push / `GROUP_ACTIVITY`** | É a **Tarefa 38**. O ADR 0006 diz que ele sai *"no mesmo UseCase que grava o `ActivityEvent`"* — ou seja, **este** UseCase é a casa dele, mas o envio só nasce com o port de push. Aqui fica o lugar, não o efeito. |
| ⚠️ **Gatilho em `editNote`, `editHighlight`, `archiveNote`, `archiveHighlight`, `unmarkRead`** | Ver decisão B. Não é economia: é o que separa um feed de incentivo de um log de auditoria. |
| Denormalizar título do dia / nome do livro no evento | O título do dia muda (`editBook`), e um evento com título velho é uma tela que mente. O feed resolve na leitura (Tarefa 34). É cache, e cache é a Tarefa 34 decidir se precisa. |
| Debounce de 60 s do ADR 0006 | Ele é do **envio de push** (Tarefa 38), não do registro. Registrar é barato e o feed quer o histórico. |

## Decisões já tomadas (não reabrir)

- **`ActivityEvent` é log imutável** — não se arquiva nem se edita. → `CLAUDE.md`.
- **`ActivityEvent.type` é `String` validado por `z.enum`** (ainda evolui), não enum Prisma.
  → `CLAUDE.md`.
- **Todo modelo de conteúdo carrega `clubId`; os que têm autor carregam `userId`.**
- **Dentro do clube nada é privado** (ADR 0002): o feed mostra o que todo membro ativo já
  podia ver. O evento **não** cria visibilidade nova.
- **`randomUUID()` no UseCase**; instante do domínio, sem `@default`/`@updatedAt` (ADR 0008).
- **O UseCase não importa Fastify nem Prisma.**

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | ⚠️ **O gatilho dispara SÓ no nascimento — `created === true`** | **Medido, e é o que salva a fatia:** o `upsertPlanNote` é chamado pelo **autosave da tela do dia, a cada 1500 ms** (`day-note.tsx:118`). Sem essa condição, meia hora escrevendo produz **dezenas** de eventos e o feed afoga o clube — exatamente o oposto de "um incentiva o outro". Os dois UseCases idempotentes já devolvem `created` (`upsert-plan-note.ts:23`, `mark-read.ts:19`), então a condição **não custa consulta nova**. |
| B | ⚠️ **Quatro gatilhos, todos de nascimento: `upsertPlanNote` · `createFreeNote` · `createHighlight` · `markRead`** | Edição e arquivamento **não** entram. O `NOTIFICACOES.md` §1 diz *"quando alguém do clube **lê, escreve** uma anotação ou **registra** um grifo"* — verbos de nascimento. E o produto: corrigir a própria nota dois dias depois não é notícia para ninguém; arquivar é ainda menos. `unmarkRead` é um **não-evento** — registrar "a Maria desmarcou" é o vocabulário de cobrança que o §1 do plano proíbe. |
| C | ⚠️ **Falhar ao registrar NÃO pode derrubar a escrita da pessoa** | O que a pessoa escreveu é o produto; o feed é o acessório. Se o `recordActivity` lançar, a nota tem de estar salva e a resposta tem de ser 201/200. **Mas engolir em silêncio também é errado**, então: captura + `log` estruturado, e **um teste que prova que a escrita sobrevive** a um recorder que lança. ⚠️ Sem esse teste, a decisão é prosa. |
| D | **`recordActivity` é um UseCase injetado nos quatro**, não um port chamado direto | Precedente: o `AssertMembership` é exatamente isso — classe de UseCase injetada em UseCase. A alternativa (cada um monta o evento e chama o repositório) copiaria a construção **quatro vezes**, que é a lição nº 3. |
| E | **O vocabulário de tipos mora num arquivo só em `packages/shared`** | É o molde medido do `HIGHLIGHT_COLORS`: a lista num lugar, o `z.enum` da borda construído **a partir** dela, e teste pinando que `schema.options` **é** a constante. Três chamadores vão precisar da mesma lista (o domínio, a borda da 34, a tela da 35) — e o `CLAUDE.md` já nomeia `ActivityEvent.type` junto de `NotificationDelivery.kind` e `PushSubscription.platform` como a **mesma classe** do `Highlight.color`. |
| F | **Quatro tipos, não um genérico**: `PLAN_NOTE` · `FREE_NOTE` · `HIGHLIGHT` · `READ` | O feed diz frases diferentes ("escreveu sobre o Cap. 3" × "escreveu uma anotação" × "grifou" × "leu"), e um tipo só empurraria a distinção para a tela adivinhar pelo `subjectId`. |
| G | ⚠️ **O evento guarda referência, não conteúdo**: `subjectId` + `bookId` + `planItemId?` | Copiar trecho de nota para dentro do evento duplicaria conteúdo do clube numa segunda tabela, e o ADR 0006 é explícito que **o push nunca leva o conteúdo**. O feed resolve o que precisa na leitura. |
| H | **Sem `status`, sem `archivedAt`, sem `updatedAt`** | Log imutável, como o `ReadingLog`. Um instante só: `createdAt`. |
| I | ⚠️ **O gatilho vem DEPOIS da escrita principal, nunca antes** | Registrar antes e a escrita falhar produz feed que mente ("a Maria escreveu" sem nota nenhuma). A ordem é observável e tem de ter acusador por **contagem** (§7.3). |

## Regras (o que os testes provam)

### O vocabulário e a entidade

1. `ACTIVITY_TYPES` mora em **um** arquivo em `packages/shared`, no molde do
   `HIGHLIGHT_COLORS`. O domínio importa dela — **não** redeclara a lista.
2. ⚠️ Um teste pina que a lista tem exatamente os quatro tipos (F) e que **nada** a duplica:
   `grep` por uma segunda declaração é achado.
3. `ActivityEvent` tem `id`, `clubId`, `userId`, `type`, `bookId`, `planItemId` (anulável),
   `subjectId`, `createdAt` — e **nada mais** (H). Provado por `Object.keys` sobre a linha
   gravada, não só pelo tipo: com campo **opcional** o `typecheck` fica verde (medido na 30).
4. `planItemId` é anulável **porque a avulsa e o grifo não têm dia** — e o teste diz isso.

### `recordActivity`

5. Monta o evento com `randomUUID()`, `createdAt` do relógio, e grava.
6. ⚠️ **Uma leitura de relógio, provada por CONTAGEM** (§7.8, 6ª aparição), com o esperado
   derivado de constante. `expect(a).toEqual(b)` entre instantes **não** prova nada.
7. Tipo fora da lista é recusado no domínio — a borda (Tarefa 34) é a primeira barreira, não a
   única (o mesmo argumento do `assertHighlightColor`).

### O gatilho, nos quatro

8. ⚠️ **Só no nascimento** (A): `upsertPlanNote` com `created: false` (o autosave) **não**
   registra, e `markRead` idempotente **não** registra. Provado por **contagem**
   (`recordCalls === 0`), não por ausência de evento.
9. ⚠️ **O caso que a decisão A existe para impedir:** três autosaves seguidos do mesmo dia
   produzem **um** evento. Com contagem.
10. `createFreeNote` e `createHighlight` registram **sempre** (não são idempotentes).
11. ⚠️ **O gatilho vem DEPOIS da escrita** (I): provado por contagem — com a escrita
    principal falhando, `recordCalls === 0`.
12. ⚠️ **A escrita SOBREVIVE a um recorder que lança** (C): com o `recordActivity` mutilado
    para rejeitar, o `upsertPlanNote` **resolve normalmente** e a nota **está gravada**.
    Assertado sobre o estado do fake, não sobre ausência de erro (§7.4). Idem para os outros
    três.
13. O evento carrega o `clubId` e o `bookId` do recurso, e o `userId` do **ator** — nunca do
    input (§7.5). Contrabando testado com o **ator legítimo**, assertando a linha gravada.
14. `planItemId` é preenchido no `PLAN_NOTE` e no `READ`, e **nulo** no `FREE_NOTE` e no
    `HIGHLIGHT`.
15. `subjectId` é o id da nota / do grifo / do log.

### O fake e transversais

16. O fake tem suíte própria, contadores (`saveCalls`) e enumeração invertida (§7.2).
17. Nenhuma classe de erro nova. `NOT_YET_MAPPED` continua `[]`.
18. ⚠️ **`packages/app`, `packages/ui` e `prisma/` INTOCADOS**; `packages/shared` cresce
    **só** o arquivo do vocabulário. Chunk de entrada colado (era **418.320 B**) — diga quanto
    subiu.
19. `pnpm -r typecheck` verde ao fim de **cada** unidade.
20. ⚠️ **Integração NÃO roda** (a fatia não toca repositório nem rota). Diga isso em vez de
    repetir o **442**.

## Arquivos a tocar

```
packages/shared/src/activity.ts                              NOVO — ACTIVITY_TYPES
packages/shared/src/index.ts                                 o export
packages/shared/src/__tests__/                               o pino da lista
packages/backend/src/domain/activity-event.ts                NOVO — a entidade
packages/backend/src/domain/__tests__/                       crescer
packages/backend/src/usecases/ports/activity-event-repository.ts   NOVO — port mínimo (save)
packages/backend/src/usecases/_fakes/activity-event-repository-fake.ts  NOVO
packages/backend/src/usecases/_fakes/__tests__/              NOVO
packages/backend/src/usecases/record-activity.ts             NOVO
packages/backend/src/usecases/__tests__/record-activity.test.ts  NOVO
packages/backend/src/usecases/{upsert-plan-note,create-free-note,create-highlight,mark-read}.ts
                                                             o gatilho (5ª/4ª dependência)
packages/backend/src/usecases/__tests__/  (os quatro)         crescer
packages/backend/src/routes/{note,highlight,reading-log}-routes.ts   a instanciação
packages/backend/src/test-support/builders.ts                a factory
```

**Não tocar:** `prisma/**` (**esta fatia não muda o modelo**; se achar que precisa, **pare e
reporte**) · `packages/app/**` · `packages/ui/**` · `src/repositories/**` · `docs/**` ·
`src/usecases/{edit-note,archive-note,edit-highlight,archive-highlight,unmark-read}.ts`
(decisão B — se você achar que um deles deve disparar, **reporte, não implemente**).

## Definição de pronto

- [x] Vocabulário num arquivo só, no molde do `HIGHLIGHT_COLORS`, com o pino (1, 2).
- [x] A entidade com os 8 campos e **nada mais**, por `Object.keys` (3).
- [x] ⚠️ **Uma leitura de relógio, por contagem** (6).
- [x] ⚠️ **Autosave não registra**: `created: false` → `recordCalls === 0` (8), e três
      autosaves → **um** evento (9).
- [x] ⚠️ **O gatilho vem depois da escrita**, provado com a escrita falhando (11).
- [x] ⚠️ **A escrita sobrevive ao recorder que lança**, nos quatro, assertado sobre o estado
      (12).
- [x] Contrabando com o ator legítimo (13); `planItemId` nulo onde deve (14).
- [x] `pnpm -r test`, `typecheck`, `lint`, `prettier --check .`, `build` limpos — baseline
      **428** shared · **195** ui · **1417** backend · **641** app.
- [x] ⚠️ **Integração não rodada**, dito explicitamente (20).
- [x] ⚠️ `git status -- packages/app packages/ui packages/backend/prisma` **vazio**; chunk
      colado (18).
- [x] **Linhas coladas** (contador canônico — o comando do docblock de `acervo.tsx`, **sem
      variantes**).
- [x] ⚠️ O **vermelho colado** das regras 6, 8, 9, 11 e 12.
