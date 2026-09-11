# Tarefa 34 — `listActivity` + repositório + rota

> **A fatia que paga uma dívida datada.** A Tarefa 33 deixou um
> `PendingActivityEventRepository` que **lança de propósito**, e uma **guarda auto-desarmável**
> que fica vermelha no instante em que o `model ActivityEvent` existir no `schema.prisma`.
> Esta fatia cria o modelo — logo, **ela obrigatoriamente apaga o temporário**. Não é opção.
>
> Leia antes: `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` **§6 inteiro** (§6.1 `response` é
> fronteira de segurança · §6.3 tenant do JWT · §6.6 limpeza de fixture que **consulta o
> banco** · **§6.9** o port cresce com o Prisma na mesma unidade), **§7.1**, **§7.2**, **§7.3**,
> **§7.4**, ADRs `0002` (visibilidade total), `0006`, `0008`.
>
> **Os vizinhos:** `src/repositories/prisma-reading-log-repository.ts` + o contrato dele (a
> fatia irmã mais recente) · `src/repositories/prisma-note-repository.ts` (o `FIND_ROW_LIMIT` e
> o `toLikePattern`) · `src/routes/note-routes.ts` (o `GET /clubs/:clubId/notes`, que é o molde
> exato da rota nova) · `packages/shared/src/{highlight,reading-log}.ts` · ⚠️
> `src/http/{pending-activity-event-repository.ts,__tests__/pending-activity-event-repository.test.ts}`
> (**os dois arquivos que esta fatia apaga**).

## Objetivo

O clube consegue pedir "o que aconteceu por aqui", em ordem, sem que nada de outro clube
apareça.

## Escopo enxuto

**Entra:** o modelo Prisma + migration, `find(filter)` no port **com a implementação Prisma na
mesma unidade**, o repositório com contrato, o UseCase `listActivity`, os schemas em `shared`,
a rota `GET /clubs/:clubId/activity` com integração — **e a remoção do repositório
temporário**.

| Fora | Por quê |
| --- | --- |
| O feed na tela | É a **Tarefa 35**. |
| Push / `GROUP_ACTIVITY` | É a **Tarefa 38**. |
| ⚠️ **Resolver nome de pessoa, título do dia ou nome do livro dentro da resposta** | O evento guarda **referência, não conteúdo** (decisão G da 33). A tela já sabe resolver nome pelo `GET /clubs/:clubId/members` (usa isso desde a 26a) e já tem o livro. Fazer o backend juntar tudo seria um segundo `getBookWithPlan` com outra forma. ⚠️ **Se a Tarefa 35 medir que falta alguma coisa, ela reporta — não inventa.** |
| Paginação com cursor | O feed é "o que aconteceu recentemente". Cursor é contrato novo e não há tela que o peça. ⚠️ Ver decisão D: o limite é **explícito**, não escondido. |
| Filtro por tipo / por pessoa no feed | Ninguém pediu, e o feed não é listagem de acervo — o acervo já filtra por pessoa e tipo. |
| Apagar ou arquivar evento | Log imutável. |

## Decisões já tomadas (não reabrir)

- **Migration SEMPRE via Prisma** (`prisma migrate dev --name <nome>`), nunca SQL à mão.
- **`ActivityEvent` é log imutável**: sem `status`, sem `archivedAt`, sem `update` no port.
- **`ActivityEvent.type` é `String` validado por `z.enum`**, não enum Prisma. → `CLAUDE.md`.
- **`response` schema é fronteira de segurança** (§6.1); enumere os status.
- **Tenant do JWT, spread antes** (§6.3). Sem membership ativo → **404**.
- **Dentro do clube nada é privado** (ADR 0002): o feed mostra a todo membro ativo o que já
  era visível. O evento **não** cria visibilidade nova.
- **Nenhum acesso a banco fora de um Repository.**

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | ⚠️ **Esta fatia APAGA `http/pending-activity-event-repository.ts` e o teste dele**, e liga o repositório Prisma no `buildRepositories` | Não é escolha: a guarda auto-desarmável da 33 lê o `schema.prisma` e **fica vermelha** assim que o `model ActivityEvent` existir. Ela foi escrita exatamente para isto. ⚠️ **Apagar a guarda junto é obrigatório e correto** — ela é a dívida, não um teste de produto; mas o relatório tem de dizer que a apagou **e por quê**, senão parece teste sumindo. |
| B | ⚠️ **`z.enum` da borda construído A PARTIR de `ACTIVITY_TYPES`**, com teste pinando que `schema.options` **é** a constante | É o molde medido do `Highlight.color` (o `CLAUDE.md` nomeia os dois como a mesma classe). Uma segunda lista escrita à mão no schema Zod é a lição nº 3, e a guarda da 33 varre produção — ela **acusaria**. |
| C | **A ordem é `createdAt` desc**, e o port **declara** isso | Feed é cronologia invertida por definição. ⚠️ **Diferente** do `ReadingLog.find`, que não promete ordem: aqui a ordem **é** o produto, então ela é contrato e tem teste contra o banco. |
| D | ⚠️ **O limite é PARÂMETRO explícito do UseCase, com padrão documentado — não um `FIND_ROW_LIMIT` escondido** | O `BACKLOG` previu que *"o terceiro `find` (`ReadingLog`/`ActivityEvent`) extrairia a constante"*. **A previsão errou duas vezes:** o `ReadingLog` a recusou com número (a tabela é limitada por dias × membros), e aqui a natureza é outra — o feed **cresce para sempre**, mas quem sabe quantos itens quer é a **tela**. Um 500 escondido no repositório serviria a uma tela que mostra 20 e mentiria para uma que mostrasse 1000. ⚠️ **Meça antes de aceitar**: se os dois `FIND_ROW_LIMIT = 500` existentes (nota e grifo) tiverem acusador hoje, diga; se não tiverem, **reporte, não conserte** — é fatia alheia. |
| E | **A rota é `GET /clubs/:clubId/activity`** | Simetria exata do `GET /clubs/:clubId/notes` e `/highlights`, que já existem. O feed é do **clube**, não do livro. |
| F | ⚠️ **A resposta NÃO traz contagem, nem "e mais N"** | `COUNTER_SHAPE` proíbe, e a decisão do dono (progresso é presença) vale para o feed também. Se a tela quiser dizer que há mais, isso é decisão de produto — **registre, não implemente**. |
| G | **`@@index([clubId, createdAt])`**, como `Note` e `Highlight` já têm | É exatamente a consulta do feed. Nada de índice por `type` ou `userId`: não há filtro por eles (escopo), e índice sem consulta é custo de escrita à toa. |
| H | ⚠️ **FKs `onDelete: Restrict` explícitas**, e o docblock diz por quê | O mesmo raciocínio da 32: o implícito já é `Restrict` para relação obrigatória, mas o `Note` registra que confiar no implícito quase produziu corrupção silenciosa. ⚠️ **E meça a consequência**: o `ActivityEvent` referencia `planItemId` — isso cria **um terceiro** motivo para `replacePlanItems` falhar na FK. **Meça e reporte**; o conserto pode não ser desta fatia, mas a lacuna tem de estar escrita (foi assim que a 32c nasceu). |

## Regras (o que os testes provam)

### O modelo e a dívida

1. `model ActivityEvent` com os 8 campos da entidade e **nada mais**, lido do
   `information_schema` (é a única forma de provar **ausências**).
2. Migration gerada por **`prisma migrate dev --name activity_event`**, no commit como o
   Prisma a escreveu.
3. `@@index([clubId, createdAt])` e as FKs `RESTRICT`, lidos do catálogo do Postgres (G, H).
4. ⚠️ **`http/pending-activity-event-repository.ts` e o teste dele NÃO EXISTEM mais**, e
   `buildRepositories` liga o repositório Prisma. `grep -rn PendingActivityEventRepository
   packages/backend/src` devolve **nada**.

### O repositório

5. Contrato contra o Postgres: `save` e `find`.
6. ⚠️ **`find({ clubId })` devolve em `createdAt` desc** — provado com fixture em que a ordem
   de inserção e a cronológica **discordam**, e a precondição **pinada** (§7.2: fixture de
   ordenação se escolhe para a implementação errada **falhar**).
7. ⚠️ **Nada de outro clube atravessa** — provado com dois clubes no banco.
8. O `limit` é honrado, e `find` sem `limit` usa o padrão documentado (D).
9. ⚠️ Limpeza de fixture que **consulta o banco** (§6.6), com prefixo próprio.

### O UseCase

10. `listActivity({ actorUserId, clubId, limit? })` corta o tenant pelo `assertMembership` e
    devolve os eventos do clube.
11. ⚠️ **Corte antes da leitura**, provado por contador (`findCalls === 0` para quem não é
    membro) — §7.3.
12. O `clubId` vem da **rota**, o ator do **JWT**; nenhum dos dois do corpo.

### A borda

13. `GET /clubs/:clubId/activity` → **200** com o array, `response` schema declarado (§6.1).
14. ⚠️ **404 para quem não é membro**, com precondição de que a rota existe e atende o ator
    legítimo **no mesmo verbo** (senão é o falso verde do Fastify — medido: 6 de 62 no MVP 2).
15. ⚠️ O `z.enum` do `type` **é** `ACTIVITY_TYPES` (B), com teste pinando `schema.options`.
16. Nenhuma classe de erro nova; `NOT_YET_MAPPED` continua `[]`.

### Transversais

17. ⚠️ **`packages/app` e `packages/ui` INTOCADOS**; `packages/shared` cresce os schemas —
    **cole quanto o chunk subiu** (era **418.320 B**, teto 450.000, folga 31.680).
18. `pnpm -r typecheck` verde ao fim de **cada** unidade (§6.9).
19. ⚠️ **A integração roda, e é você quem a roda.** Baseline **442**. Cole o número novo, a
    prova por consulta de que nenhum fixture sobrou, e o super-admin intacto.
20. ⚠️ **O log `activity_event_not_recorded` da Tarefa 33 PARA de sair.** Ele disparava 85
    vezes na suíte de integração; depois desta fatia tem de ser **zero**. Cole a contagem —
    é a prova, do lado de fora, de que a dívida foi paga.

## Arquivos a tocar

```
packages/backend/prisma/schema.prisma                         + model ActivityEvent
packages/backend/prisma/migrations/<gerada>/migration.sql     GERADA
packages/backend/src/usecases/ports/activity-event-repository.ts   + find
packages/backend/src/usecases/_fakes/activity-event-repository-fake.ts  + find
packages/backend/src/usecases/_fakes/__tests__/               crescer
packages/backend/src/repositories/prisma-activity-event-repository.ts   NOVO
packages/backend/src/repositories/__tests__/*.contract.integration.test.ts  NOVO
packages/backend/src/repositories/__tests__/_db.ts            a limpeza
packages/backend/src/http/repositories.ts                     liga o Prisma
packages/backend/src/http/pending-activity-event-repository.ts         ⚠️ APAGAR
packages/backend/src/http/__tests__/pending-activity-event-repository.test.ts  ⚠️ APAGAR
packages/backend/src/usecases/list-activity.ts                NOVO
packages/backend/src/usecases/__tests__/list-activity.test.ts NOVO
packages/backend/src/routes/activity-routes.ts                NOVO
packages/backend/src/routes/__tests__/*.integration.test.ts   NOVO
packages/backend/src/http/server.ts                           registrar
packages/shared/src/activity.ts                               + os schemas
packages/shared/src/__tests__/activity.test.ts                crescer
```

**Não tocar:** `packages/app/**` · `packages/ui/**` · `src/domain/**` (a entidade está pronta)
· `src/usecases/{upsert-plan-note,create-free-note,create-highlight,mark-read}.ts` (o gatilho
está pronto; se precisar mexer, **pare e reporte**) · `docs/**`.

## ⚠️ Segurança desta fatia — ela roda migration no banco do dono

- **`prisma migrate dev --name activity_event`** é o **único** comando de migration
  autorizado. **NUNCA** `migrate reset`, **NUNCA** `db push`, **NUNCA** SQL à mão.
- **NUNCA `deleteMany({})`.** Fixture com prefixo próprio, apagada por id, limpeza que
  **consulta o banco**.
- O banco tem um **super-admin do seed** — ele tem de continuar lá, e você **prova por
  consulta**.

## Definição de pronto

- [x] Migration **gerada pelo Prisma**, com o comando colado (2); modelo e índices lidos do
      catálogo (1, 3).
- [x] ⚠️ **O repositório temporário e a guarda dele APAGADOS**, com o `grep` vazio colado, e o
      relatório dizendo **por que** a guarda some junto (4, A).
- [x] ⚠️ Ordem `createdAt` desc com **fixture hostil e precondição pinada** (6).
- [x] ⚠️ Nada de outro clube atravessa (7); corte antes da leitura por contador (11);
      **404 com precondição do mesmo verbo** (14).
- [x] `z.enum` construído a partir de `ACTIVITY_TYPES`, com o pino (15).
- [x] ⚠️ **A medição da decisão D** (os dois `FIND_ROW_LIMIT` têm acusador?) — **reporte, não
      conserte**.
- [x] ⚠️ **A medição da decisão H** (o `ActivityEvent` vira um terceiro motivo de falha na FK
      do `replacePlanItems`?) — **reporte, não conserte**.
- [x] `pnpm -r test`, `typecheck`, `lint` (⚠️ **`pnpm lint` na raiz**, não `pnpm -r lint`),
      `prettier --check .`, `build` limpos — baseline **454** shared · **195** ui · **1496**
      backend · **641** app.
- [x] ⚠️ **Integração rodada por você** (era **442**) + banco limpo + super-admin intacto.
- [x] ⚠️ **`activity_event_not_recorded` some da saída da integração**: contagem **0** colada
      (20).
- [x] ⚠️ `git status -- packages/app packages/ui` **vazio**; chunk colado (17).
- [x] **Linhas coladas** (contador canônico — o comando do docblock de `acervo.tsx`, **sem
      variantes**).
- [x] ⚠️ O **vermelho colado** das regras 6, 7, 11, 14 e 15.
