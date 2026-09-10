# Tarefa 31 — A sobreposição de leitura, e o agrupamento ganha um dono só

> **⚠️ Esta fatia é MENOR do que o `BACKLOG` faz parecer, e a medição é a entrega.** O
> `BACKLOG` a chama de *"`computeBookProgress` (por pessoa e do clube, puro — **TDD
> pesado**)"*. Medi antes de escrever esta spec, e duas coisas mudaram o escopo:
>
> 1. **O agrupamento que ela precisa já existe e já está testado.**
>    `groupWritersByPlanItem(plan, pairs)` em `src/domain/plan-item-writers.ts` faz
>    exatamente a conta — agrupa pares `(planItemId, userId)` **na ordem do plano** — e tem
>    **12 testes** cobrindo justamente as bordas que o TDD pesado desta fatia produziria:
>    plano vazio, duas pessoas no mesmo dia, autor repetido, `planItemId` fora do plano,
>    plano fora de ordem, e não-mutação dos arrays recebidos.
> 2. **O `ReadingLog` já passa por ele hoje, sem uma linha de mudança.** Medido com sonda de
>    compilação (`tsc --noEmit`, saída limpa, sonda apagada): `PlanItemWriter` é
>    `{ planItemId, userId }`, o `ReadingLog` tem os dois campos, e a tipagem estrutural do
>    TypeScript aceita `ReadingLog[]` no parâmetro **como está**.
>
> É a mesma situação da **Tarefa 26** do MVP 2, que não custou uma linha de código — e isso
> foi a entrega. Aqui custa algumas, mas por um motivo que não é "fazer a conta".
>
> Leia antes: `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` **§7.1** (em especial a saída da 4ª
> aparição: *"extrair, não cobrir duas vezes"* — e ela **nomeia o `ReadingLog` do MVP 3** como
> o caso que ia disparar isso), **§7.2**, **§7.4**, **§7.7**, e a **lição nº 3** do MVP 1
> (vocabulário compartilhado mora num arquivo só) e a **nº 15** do MVP 2 (o acusador vem
> primeiro, a extração depois).
>
> **Os vizinhos:** `src/domain/plan-item-writers.ts` e o seu
> `__tests__/plan-item-writers.test.ts` (os 12) · `src/domain/note.ts` (o `PlanItemWriter`) ·
> `src/domain/reading-log.ts` (entregue na Tarefa 30) · `src/usecases/get-book-with-plan.ts`.

## Objetivo

A mesma sobreposição que já diz **quem escreveu** em cada dia do plano passa a saber dizer
**quem leu** — e a conta que as duas fazem tem **um** dono, não dois.

## Escopo enxuto

**Entra:** generalizar o agrupamento para um dono neutro, com os 12 testes indo junto; a
sobreposição de leitura (`PlanItemReaders`) construída por ele; e a prova de que o
`ReadingLog` a atravessa.

| Fora | Por quê |
| --- | --- |
| ⚠️ **Um `computeBookProgress` que devolva CONTAGEM** (dias lidos, total, percentual) | **Decisão fechada do dono, na rodada de decisões do MVP 3** (`docs/ACEITE-MVP.md`, MVP 3, pergunta 1): progresso é **presença, não placar**. A rota **não devolve contagem nenhuma**, e é isso que torna o número impossível de renderizar por construção — mais forte que a regex, que tem furo medido (a `COUNTER_SHAPE` pega `"12 de 30"` e **não** pega um `"12 dias lidos"` solto). Um agregado sem consumidor é a especulação que o §7.1 condena, e o consumidor foi removido por decisão. |
| ⚠️ **A transposta "por pessoa"** (para cada membro, os dias que ela leu) | O `BACKLOG` diz "por pessoa e do clube", e a sobreposição **já responde os dois eixos**: cada marca num dia **é** uma pessoa. A transposta é o mesmo dado girado, sem nenhuma tela que a peça — a tela da 32 desenha por **linha do plano**, não por pessoa. Estrutura sem chamador é especulação (a mesma razão que manteve o port da 30 mínimo). |
| Repositório, rota, schema em `shared`, tela | É a **Tarefa 32**, e é lá que o `find(filter)` do port nasce junto da implementação Prisma (§6.9). |
| "Que dia é hoje" / o `readToday` do ator | O front calcula com `localDay` (`CLAUDE.md`), e deriva do overlay + o `planItemId` de hoje. O domínio **não** conhece relógio nem fuso — esta função é **pura**. |
| Migration, Prisma, Luxon, dependência nova | Nada disso. Se você achar que precisa, **pare e reporte**. |

## Decisões já tomadas (não reabrir)

- **Progresso é calculado, nunca guardado.** → decisões fechadas do MVP 3.
- **Progresso na tela é presença, sem contador e sem comparação.** → decisão do dono,
  registrada como pergunta 1 do MVP 3 no `docs/ACEITE-MVP.md`.
- **O `ReadingLog` ancora no `planItemId`** (Tarefa 30, decisão A).
- **Entidade e função de domínio simples (DDD-lite)**, puras: sem I/O, sem relógio, sem mutar
  o que recebem.
- **Dentro do clube nada é privado** (ADR 0002): a sobreposição mostra **todo** membro ativo
  que leu, com autoria — não só o ator.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | ⚠️ **O agrupamento vira UMA função neutra**, e `groupWritersByPlanItem` / `groupReadersByPlanItem` passam a ser as duas chamadoras nomeadas | A alternativa é escrever um segundo agrupamento para leitura. O `CONVENCOES-CODIGO` §7.1 **já decidiu isto por antecipação**, e nomeia esta fatia: *"é o padrão a copiar quando uma fidelidade aparecer no terceiro fake (o MVP 3 traz `ReadingLog` e `ActivityEvent`): **extrair, não cobrir duas vezes**"*. É também a lição nº 3 (o que está duplicado não é detalhe, é a codificação de uma regra). ⚠️ E a lição nº 15 está satisfeita **antes** da extração: o agrupamento **já tem 12 acusadores**, então extrair não o faz *parecer* coberto — ele **é**. |
| B | ⚠️ **NÃO reusar `groupWritersByPlanItem` direto para leitura, mesmo compilando hoje** | Medido: `ReadingLog[]` já satisfaz o parâmetro, então `groupWritersByPlanItem(plan, logs)` funcionaria **sem tocar em nada**. Recusado porque o **nome mentiria** — é a prosa-que-mente que a 29a acabou de pagar duas vezes (`resources` com um locale, `ensureCatalog` que só carrega inglês). Um `writers` devolvendo leitores é pior que uma cópia: a cópia pelo menos se vê. |
| C | **O tipo de entrada do agrupamento neutro é estrutural** (`{ planItemId: string; userId: string }`), não `PlanItemWriter` nem `ReadingLog` | Amarrá-lo a uma das duas entidades faria a outra depender do vocabulário alheio. O `ActivityEvent` (Tarefa 33) é o terceiro candidato, e ele não é nem nota nem leitura. |
| D | **`PlanItemReaders` é tipo próprio, com o mesmo formato de `PlanItemWriters`** | Reusar `PlanItemWriters` para leitura economiza uma interface e custa a mesma mentira da decisão B, agora na resposta da API — onde ela viaja para o `shared` e para a tela. Duas interfaces de mesmo formato e nomes honestos é o preço certo. |
| E | ⚠️ **Os 12 testes MUDAM DE ARQUIVO junto com a função, e não são reescritos** | Reescrevê-los é a chance de perder um sem ninguém notar. A auditoria vai comparar **nome por nome** os testes de antes e de depois (lição nº 19 do MVP 2: fatia que move código exige a pergunta *"o que perdeu o dono?"*). Se um nome mudar, o relatório diz qual e por quê. |
| F | **Dia sem leitor não aparece no array** (a mesma regra do `writers`) | O front sobrepõe no plano que já tem; devolver 30 dias com `userIds: []` duplicaria o plano numa resposta que já vem ao lado dele. |

## Regras (o que os testes provam)

1. ⚠️ Existe **uma** função de agrupamento, e as duas nomeadas (`writers` e `readers`) a
   chamam. **Nenhuma** duplica a lógica — provado por leitura **e** por mutação: um mutante
   na função neutra tem de acusar **nos dois** lados.
2. ⚠️ Os **12 testes** do agrupamento continuam existindo, **com os mesmos nomes**, agora
   sobre a função neutra. O relatório cola a lista de antes e a de depois, **nome por nome**.
3. `groupWritersByPlanItem` continua com o **mesmo comportamento observável** — os chamadores
   (`get-book-with-plan.ts`, `list-plan-item-writers.ts`) não mudam de assinatura, e os
   testes deles ficam **verdes sem edição**. Se algum precisar de edição, **pare e reporte**.
4. `groupReadersByPlanItem(plan, logs)` devolve `PlanItemReaders[]` na **ordem do plano**.
5. Duas pessoas que leram o mesmo dia viram **uma** entrada com **dois** `userIds`, ordenados.
6. A mesma pessoa em dois dias vira **duas** entradas.
7. Log repetido do mesmo par não duplica a pessoa (o `Set`).
8. ⚠️ `planItemId` **fora do plano não vaza** para a saída — dado inconsistente não desenha
   marca num dia que a tela não tem.
9. Dia sem leitor **não aparece** (decisão F).
10. Plano vazio → array vazio. Nenhum log → array vazio. As duas são respostas legítimas.
11. ⚠️ **Não muta os arrays recebidos** — provado por snapshot antes/depois (§7.6), não por
    `toBe`.
12. ⚠️ **A ordem é a do plano, e o fixture é escolhido para a implementação errada FALHAR**
    (§7.2/§7.8): a ordem dos logs e a ordem do plano têm de **discordar**, e a precondição
    disso fica **pinada** no teste. Um fixture em que as duas coincidem prova que a suíte é
    sortuda, não que o código ordena.
13. ⚠️ Idem para o `sort()` dos `userIds`: os ids do fixture têm ordem alfabética **oposta** à
    de inserção, com a precondição pinada (`expect(A_ID < B_ID).toBe(true)`). ⚠️ Leia o §7.2:
    esta é exatamente a armadilha em que a Tarefa 11 caiu — `marcos < maria` fazia a ordem
    errada **coincidir** com a certa.
14. A função é **pura**: sem `new Date()`, sem I/O, sem `Math.random`. Nenhum `clock`, nenhum
    repositório no módulo.
15. Nenhuma classe de erro nova; `NOT_YET_MAPPED` continua `[]`.

### Transversais

16. ⚠️ **`packages/shared`, `packages/ui`, `packages/app` e `prisma/` INTOCADOS** — `git
    status` vazio, colado. Chunk de entrada continua em **416.107 B**.
17. `pnpm -r typecheck` verde ao fim de **cada** unidade.
18. ⚠️ **Integração não roda** — a fatia não toca repositório nem rota. Diga isso em vez de
    repetir o **387**.

## Arquivos a tocar

```
packages/backend/src/domain/plan-item-groups.ts          NOVO — o agrupamento neutro (nome sugerido)
packages/backend/src/domain/__tests__/plan-item-groups.test.ts   NOVO — os 12, MOVIDOS
packages/backend/src/domain/plan-item-writers.ts         passa a chamar o neutro
packages/backend/src/domain/__tests__/plan-item-writers.test.ts  encolhe (o que sobra é o do NOME)
packages/backend/src/domain/plan-item-readers.ts         NOVO — PlanItemReaders + groupReadersByPlanItem
packages/backend/src/domain/__tests__/plan-item-readers.test.ts  NOVO
```

**Não tocar:** `prisma/**` · `packages/shared/**` · `packages/ui/**` · `packages/app/**` ·
`src/repositories/**` · `src/routes/**` · `src/http/**` · `src/usecases/get-book-with-plan.ts`
e `list-plan-item-writers.ts` (a regra 3 diz que eles **não** mudam; se mudarem, pare e
reporte) · `docs/**` · qualquer `package.json`.

## Definição de pronto

- [x] ⚠️ **Um** agrupamento, duas chamadoras nomeadas; mutante na função neutra acusa **nos
      dois** lados, com as duas contagens coladas (1).
- [x] ⚠️ Os **12 testes** com os **mesmos nomes**, lista de antes e depois colada nome por
      nome (2, E).
- [x] `get-book-with-plan` e `list-plan-item-writers` **verdes sem edição** (3).
- [x] `groupReadersByPlanItem` com as regras 4–10, e o nome dele não mente (B, D).
- [x] ⚠️ Não-mutação por **snapshot antes/depois**, não por `toBe` (11).
- [x] ⚠️ Fixtures **hostis** com precondição **pinada**, na ordem do plano (12) **e** no
      `sort()` dos userIds (13).
- [x] Função pura: sem relógio, sem I/O (14).
- [x] `pnpm -r test`, `typecheck`, `lint`, `prettier --check .`, `build` limpos, contagens
      coladas (baseline: **415** shared · **195** ui · **1377** backend · **620** app).
- [x] ⚠️ `git status --porcelain -- packages/shared packages/ui packages/app
      packages/backend/prisma` **vazio**, colado (16).
- [x] **Linhas de código coladas** (contador canônico) dos arquivos novos.
- [x] ⚠️ O **vermelho colado** das regras 1, 8, 12 e 13.
