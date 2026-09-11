# Tarefa 34b — A terceira guarda, e uma guarda contra esquecer a quarta

> **Fatia inserida, e é a SEGUNDA vez que a mesma classe de bug produz uma fatia.** A 32
> introduziu uma FK sem guarda e a **32c** a consertou. A 34 fez o mesmo, e esta conserta.
> **Duas vezes é coincidência; três é padrão** — então esta fatia não entrega só o conserto:
> entrega a guarda que impede a quarta.
>
> Leia antes: `docs/tasks/32c-guarda-de-leitura-no-plano.md` (⚠️ **o molde exato**, inclusive a
> decisão de mensagens distintas), `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` **§6.2** (⚠️
> `error.message` só sai na classe 400 — **a mensagem é publicada**), **§6.9**, **§7.1**,
> **§7.3**, **§7.9** (⚠️ *requisito sem guarda automática é intenção*).
>
> **Os vizinhos:** `src/usecases/replace-plan-items.ts:115` e `:162` (as **duas** guardas que
> já existem, e que esta copia) · `src/usecases/ports/reading-log-repository.ts`
> (`planItemIdsWithAnyReadingLog`, o irmão mais recente) ·
> `src/http/__tests__/` — ⚠️ **o padrão da guarda que lê o `schema.prisma`**, que a Tarefa 33
> inventou e a 34 provou funcionar.

## Objetivo

Remover um dia do plano que alguém já leu — e depois desmarcou — recusa com **400 e mensagem**,
não com 500 mudo. E a próxima FK que alguém criar não consegue mais passar sem guarda.

## O defeito, medido elo por elo

Confirmado pelo orquestrador, por leitura, na Tarefa 34:

1. `replacePlanItems` tem **duas** guardas: `planItemIdsWithAnyNote` (400) e
   `planItemIdsWithAnyReadingLog` (400). **Não há terceira.**
2. `unmarkRead` faz **hard delete** do `ReadingLog` (a exceção documentada do `CLAUDE.md`).
3. O port do `ActivityEvent` **não tem `delete`** — o evento `READ` fica.
4. `P2003` **não está mapeado** no `handle-domain-error` → cai no `throw` final → **500**.

**O caminho é exatamente um:** um dia **lido e depois desmarcado** perde o log, mantém o
evento, passa pelas duas guardas e estoura na FK do evento. **Antes da Tarefa 34 esse mesmo dia
se removia com sucesso** — é regressão. O dado fica a salvo (`$transaction`), como nas outras
duas vezes; o que está errado é o status e o silêncio.

⚠️ **E medido nesta spec:** há **exatamente três** FKs `ON DELETE RESTRICT` apontando para
`ReadingPlanItem` — `Note`, `ReadingLog` e `ActivityEvent`. Duas guardadas, uma não.

## Escopo enxuto

**Entra:** `planItemIdsWithAnyActivity` no port (com a implementação Prisma na mesma unidade),
a terceira guarda, **e a guarda estrutural contra a quarta**.

| Fora | Por quê |
| --- | --- |
| ⚠️ **Generalizar as três guardas numa tabela `{consulta, mensagem}`** | Ver decisão B. A forma se repete, mas a **regra** de cada uma é diferente (repositório diferente, mensagem diferente por decisão de produto da 32c) — e a tabela não impede o bug que esta fatia existe para matar. |
| Mapear `P2003` no `handle-domain-error` | Seria trocar 500 por 400 genérico em **toda** FK do sistema, sem mensagem útil. A guarda de domínio é que dá a frase decente; o `RESTRICT` é a rede embaixo. Decisão registrada na 32c. |
| Dar `delete` ao port do `ActivityEvent` | `ActivityEvent` é **log imutável** (`CLAUDE.md`). Apagar evento para o admin poder editar o plano é o mesmo argumento que a 32c recusou para o `ReadingLog`. |
| Tela, feed, push | Tarefas 35 e 38. |

## Decisões já tomadas (não reabrir)

- **`ActivityEvent` e `ReadingLog` são logs imutáveis.**
- **`handleDomainError` é o único tradutor**, e `error.message` só sai na classe **400**.
- **Mensagens distintas por guarda** — decisão B da 32c: uma frase combinada obrigaria o admin
  a adivinhar qual dos três é, e são coisas mentalmente diferentes.
- **Só a CONTAGEM na mensagem** — nem autor, nem id, nem título (decisão C da 32c).
- **O port cresce com a implementação Prisma na mesma unidade** (§6.9).

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | ⚠️ **A entrega principal desta fatia NÃO é a terceira guarda — é a guarda que lê o `schema.prisma`** | A terceira guarda é 20 linhas de cópia. O que custa caro é o **padrão**: duas fatias seguidas (32→32c, 34→34b) introduziram FK sem guarda, e nas duas a lacuna só apareceu porque **alguém foi procurar**. §7.9: requisito sem guarda automática é intenção. O projeto já tem o instrumento — a guarda auto-desarmável que a 33 inventou e a 34 provou. |
| B | **NÃO generalizar as três guardas numa tabela** | A forma é idêntica, a **regra** não: repositórios diferentes, mensagens diferentes por decisão de produto. E o teste decisivo: **a tabela não mataria o bug desta fatia** — alguém que acrescenta uma FK também esquece de acrescentar a linha na tabela. Generalizar aqui é arrumar a prateleira sem trancar a porta. ⚠️ Se você discordar **com medição**, reporte. |
| C | ⚠️ **A guarda estrutural lê o `schema.prisma`, não o `Prisma.dmmf`** | O mesmo motivo que a 33 mediu e a 34 confirmou: o cliente é **derivado**, e um cliente sem `prisma generate` deixaria a guarda dormindo exatamente na janela em que ela precisa acordar. |
| D | **A guarda estrutural mora em `usecases/__tests__/`, ao lado do `replacePlanItems`** | É onde quem acrescenta a guarda vai olhar. Pô-la em `http/` a esconderia de quem mexe no UseCase. |
| E | **A mensagem nova fala de ATIVIDADE, não de "evento"** | "Evento" é vocabulário interno. O admin entende "alguém já registrou atividade neste dia". ⚠️ E ela **não pode** dizer "leu", senão mente: o caso é justamente o de quem leu **e desmarcou**. |
| F | ⚠️ **A ordem das guardas: nota → leitura → atividade** | Manter as duas primeiras onde estão evita mudar o comportamento observável de casos que já funcionam. A nova é a **última** porque é a mais improvável — e porque um dia com nota **ou** leitura já tem evento, então pôr a de atividade antes faria as outras duas nunca dispararem. ⚠️ **Isso tem de ter teste**: dia com nota **e** atividade continua dando a mensagem de **nota**. |

## Regras (o que os testes provam)

### O port e o repositório

1. `ActivityEventRepository` ganha `planItemIdsWithAnyActivity(planItemIds)`, espelhando os
   dois irmãos: recebe ids do plano, devolve os que **têm** evento.
2. ⚠️ **`[]` de entrada devolve `[]` sem ida ao banco** — provado onde a propriedade **é**
   decidível: no **contrato**, com `$on('query')` (⚠️ e a leitura do contador vem **depois do
   `$disconnect()`**, pelo motivo que a 32c mediu: a entrega do evento não é garantida antes
   de a promessa resolver). No fake, contador de chamadas (§7.3).
3. Contrato contra o Postgres: só os ids que têm evento, **sem duplicar** quando o mesmo dia
   tem dois eventos, e nunca id de dia sem evento.
4. ⚠️ **A implementação Prisma vem na MESMA unidade que o port** (§6.9).

### A terceira guarda

5. Dia com **só atividade** (o caso real: lido e depois desmarcado) → `InvalidBookError` (400)
   com mensagem que fala de **atividade**, e o plano **não** é tocado.
6. ⚠️ **O caso que dá nome à fatia, ponta a ponta:** marcar leitura → desmarcar → tentar
   remover o dia. Hoje isso é 500; depois tem de ser **400 com a frase de atividade**.
7. ⚠️ Dia com **nota** continua dando a mensagem de **nota**; dia com **leitura** continua
   dando a de **leitura** (F). Os dois comportamentos existentes não mudam.
8. ⚠️ Recusa **antes de qualquer escrita**, por **contagem** (`replaceForBookCalls`) — §7.3.
9. Dia sem nada é removido normalmente (o par positivo).
10. ⚠️ **A mensagem não mente em nenhum dos quatro casos** (só nota · só leitura · só atividade
    · combinações), assertada por **texto**, não por classe.

### ⚠️ A guarda estrutural — a entrega principal

11. Um teste lê o `schema.prisma`, encontra **toda** relação com `ReadingPlanItem` que tenha
    `onDelete: Restrict`, e exige que `replace-plan-items.ts` tenha uma guarda para cada.
12. ⚠️ **Ela passa hoje** (três FKs, três guardas) **e falha** com uma quarta FK sem guarda —
    provado por **simulação do predicado**, sem criar modelo nem rodar migration.
13. ⚠️ **O antídoto do §7.4**: se a varredura não achar **nenhuma** FK, o teste falha. Sem
    isso, um regex quebrado deixa a guarda verde sem olhar nada.
14. O teste **nomeia**, na mensagem de falha, qual FK ficou sem guarda — senão quem o vir
    vermelho não sabe o que fazer.

### Transversais

15. Nenhuma classe de erro nova; `NOT_YET_MAPPED` continua `[]`.
16. ⚠️ **`packages/app`, `packages/ui` e `packages/shared` INTOCADOS**; chunk de entrada
    **418.565 B**, idêntico.
17. ⚠️ **Nenhuma migration** — as três FKs já existem. Se achar que precisa, **pare e
    reporte**.
18. ⚠️ **A integração roda, e é você quem a roda.** Baseline **484**. Cole o número, a prova
    por consulta de que nenhum fixture sobrou, o super-admin intacto, **e a contagem de
    `ActivityEvent` no banco em 0**.

## Arquivos a tocar

```
packages/backend/src/usecases/ports/activity-event-repository.ts        + o método
packages/backend/src/usecases/_fakes/activity-event-repository-fake.ts  + o método e o contador
packages/backend/src/usecases/_fakes/__tests__/                         crescer
packages/backend/src/repositories/prisma-activity-event-repository.ts   + a implementação
packages/backend/src/repositories/__tests__/*.contract.integration.test.ts  crescer
packages/backend/src/usecases/replace-plan-items.ts                     + a terceira guarda
packages/backend/src/usecases/__tests__/replace-plan-items.test.ts      crescer
packages/backend/src/usecases/__tests__/plan-item-fk-guards.test.ts     NOVO — a guarda estrutural
packages/backend/src/routes/book-routes.ts                              a 6ª dependência
packages/backend/src/routes/__tests__/book-routes.integration.test.ts   o caso ponta a ponta (6)
```

**Não tocar:** `prisma/**` · `packages/app/**` · `packages/ui/**` · `packages/shared/**` ·
`src/domain/**` · `docs/**` · `src/usecases/{unmark-read,mark-read,record-activity}.ts`.

## Definição de pronto

- [x] `planItemIdsWithAnyActivity` no port + Prisma **na mesma unidade** (1, 4).
- [x] ⚠️ `[] → []` sem ida ao banco, provado no **contrato**, com a leitura **depois do
      `$disconnect()`** (2).
- [x] Dia com só atividade → **400** com mensagem de **atividade** (5); e o **caso ponta a
      ponta** marcar→desmarcar→remover (6).
- [x] ⚠️ As duas mensagens antigas **não mudam** (7); recusa antes da escrita por contagem (8);
      dia livre é removido (9); a mensagem não mente nos **quatro** casos (10).
- [x] ⚠️ **A guarda estrutural**: passa hoje, falha com uma quarta FK simulada, tem o antídoto
      do §7.4, e **nomeia** a FK órfã (11–14).
- [x] `pnpm -r test`, `typecheck`, `lint` (⚠️ **`pnpm lint` na raiz**), `prettier --check .`,
      `build` limpos — baseline **478** shared · **195** ui · **1520** backend · **641** app.
- [x] ⚠️ **Integração rodada por você** (era **484**) + banco limpo + super-admin intacto +
      `ActivityEvent` em **0**.
- [x] ⚠️ `git status -- packages/app packages/ui packages/shared packages/backend/prisma`
      **vazio**.
- [x] **Linhas coladas** (contador canônico — o comando do docblock de `acervo.tsx`, **sem
      variantes**).
- [x] ⚠️ O **vermelho colado** das regras 5, 6, 7, 8 e 12.
