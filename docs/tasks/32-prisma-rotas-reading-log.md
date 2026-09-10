# Tarefa 32 — O `ReadingLog` chega ao banco e à API

> **⚠️ FATIA DIVIDIDA, e o motivo é medido.** O `BACKLOG` pedia *"Repo Prisma + rotas +
> progresso na tela"*. A fatia equivalente do MVP 2 — a **Tarefa 24**, "Repo Prisma + rotas"
> do grifo — custou **4.324 inserções em 16 arquivos**, e a tela foi a **Tarefa 25**,
> separada. Juntar as duas aqui faria uma fatia do tamanho de duas das maiores do MVP 2, e o
> revisor perde o foco exatamente onde ele mais rende. Esta é o **backend**; a tela é a
> **32b**.
>
> Leia antes: `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` **§6 inteiro** (o padrão de rota:
> §6.1 `response` é fronteira de segurança · §6.2 `handleDomainError` · §6.3 o tenant vem do
> JWT e o spread vem antes · §6.5 erro de sessão ≠ de tenant · §6.6 composição e limpeza de
> fixture · **§6.8** o cliente valida a resposta · **§6.9 a ordem das unidades quando um port
> cresce**) e **§7** (§7.1 fidelidade nas duas direções · §7.3 contadores · §7.5 contrabando
> com o ator legítimo). ADRs `0002`, `0007`, `0008`, `0009`.
>
> **Os vizinhos a copiar, nesta ordem:** `src/repositories/prisma-note-repository.ts` e o seu
> `__tests__/*.contract.integration.test.ts` · `src/routes/note-routes.ts` (**em especial o
> `PUT /plan-items/:planItemId/note`**, que é o irmão exato do `markRead`: mesmo âncora, mesma
> idempotência, mesmo 201×200) · `src/routes/__tests__/invite-routes.integration.test.ts` (o
> formato de limpeza de fixture que **consulta o banco**) · `packages/shared/src/note.ts`.

## Objetivo

O "li" sobrevive ao recarregar a página: ele chega ao banco, volta na resposta do livro, e
ninguém de outro clube o alcança.

## Escopo enxuto

**Entra:** modelo Prisma + migration, `find(filter)` no port **com a implementação Prisma na
mesma unidade**, o repositório com teste de contrato, o `readers` na resposta do livro, as
duas rotas e a integração — incluindo o corte de tenant.

| Fora | Por quê |
| --- | --- |
| **A tela** (a marca no plano, o toque "li hoje") | É a **32b**. Medido acima: a fatia irmã do MVP 2 sem tela já foi 4.324 inserções. |
| ⚠️ **Uma rota `GET /books/:bookId/readers`** | **Medido: o app NUNCA chama a `/books/:bookId/writers` equivalente.** Ele lê o `writers` do `GET /books/:bookId` e pronto (`packages/app/src/pages/book.tsx:289`). Aquela rota existe sem cliente desde a Tarefa 11; criar a gêmea seria repetir um erro já pago. A 32b atualiza a sobreposição **rebuscando o livro**. |
| Qualquer contagem na resposta (`readDays`, total, percentual) | Decisão do dono (`ACEITE-MVP.md`, MVP 3, pergunta 1): progresso é presença. **É o contrato que torna o número irrenderizável** — mais forte que a regex, que tem furo medido. |
| `ActivityEvent` ao marcar | Tarefa 33, que põe o gatilho nos três UseCases de uma vez. |
| Extrair o `planItemForActor` | Dívida registrada na Tarefa 30: o preâmbulo está verbatim em três lugares e **já tem acusador**. ⚠️ **Decida nesta fatia** se as rotas mostram que o retorno certo é o par `{ planItem, book }` — e se decidir extrair, é **unidade própria**, com o `diff` provando que nenhum teste sumiu. |
| Luxon, fuso, "que dia é hoje" | Tarefa 37 (backend) e o `localDay` do front. Aqui não se calcula dia nenhum. |

## Decisões já tomadas (não reabrir)

- **Migration SEMPRE via Prisma** (`prisma migrate dev --name <nome>`). **NUNCA** escrever ou
  editar SQL de migration à mão. → `CLAUDE.md`.
- **`ReadingLog` é log imutável**: sem `status`, sem `archivedAt`, sem `update` no port.
  Desmarcar é **hard delete**. → decisões fechadas do MVP 3.
- **Progresso é calculado, nunca guardado.**
- **`response` schema é fronteira de segurança** (§6.1): rota sem `response` para o status de
  sucesso **não deixa o servidor subir**. Enumere os status (`200`, `201`); a chave `'2xx'` é
  recusada no boot, e isso é proteção.
- **O tenant vem do JWT, e o spread vem antes** (§6.3). Nenhum schema de corpo declara
  `userId` ou `clubId`.
- **Sem membership ativo → 404** (`NotAMemberError`), nunca 403.
- **Nenhum acesso a banco fora de um Repository**; sem `$queryRaw` espalhado.
- **`updatedAt` é do domínio** (ADR 0008): **sem `@updatedAt`** no schema. Aqui nem existe o
  campo.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | ⚠️ **As rotas são `PUT` e `DELETE` em `/plan-items/:planItemId/reading-log`** | É a simetria exata do `PUT /plan-items/:planItemId/note`, que já existe e é o irmão do `markRead`: mesma âncora, mesma idempotência. `POST /reading-logs` com o `planItemId` no corpo seria um endereço novo para um recurso que **não tem id próprio** na API (decisão E da Tarefa 30: o par `(dia, pessoa)` é a identidade). `PUT` porque marcar duas vezes é inofensivo — é a definição de idempotente. |
| B | **`PUT` responde `201` na primeira marcação e `200` nas seguintes**, a partir do `created` do UseCase | É o que o `upsertPlanNote` já faz, e a razão de o UseCase devolver `{ log, created }`. Sem isso, a borda teria de perguntar ao banco de novo. |
| C | **`DELETE` responde `204` sempre**, inclusive quando não havia o que apagar | Decisão C da Tarefa 30: desmarcar o que não estava marcado **não é erro**. Um `404` obrigaria a tela a distinguir dois casos que são o mesmo para quem olha. |
| D | ⚠️ **O `readers` entra na resposta do `GET /books/:bookId`, ao lado do `writers`** | Campo **novo** é seguro pelo §6.8 (o `parse` do Zod faz strip, o front antigo ignora) — o inverso não seria. E é o que faz a 32b desenhar as duas sobreposições numa requisição só. |
| E | ⚠️ **O port ganha `find(filter)` e a implementação Prisma vem na MESMA unidade** | §6.9, medido na Tarefa 26a: acrescentar um método ao port sem implementar no Prisma dá **16 erros em 9 arquivos**, sete deles em rotas alheias — e um vermelho de compilação em arquivo alheio **esconde** o vermelho de teste que a unidade deveria mostrar. |
| F | **O filtro é `{ bookId, userId?, planItemId? }`**, e o `clubId` **não** entra nele | Quem corta o tenant é o `bookForActor`, que resolve o clube pelo livro. Pôr `clubId` no filtro criaria uma **segunda** regra de tenant para manter em dia com aquela — e a primeira já é a que as rotas usam. |
| G | ⚠️ **O índice é `@@unique([planItemId, userId])`**, mais `@@index([bookId])` | O único é o que faz a idempotência do `markRead` ser do **banco** e não só do UseCase (dois toques simultâneos). O `@@index([bookId])` é o que serve o `find({bookId})` da resposta do livro. **Nada de `@@index([clubId, createdAt])`** como nas outras tabelas: não há listagem cronológica de leitura, e índice sem consulta é custo de escrita à toa. |
| H | ⚠️ **A FK do `planItem` é `onDelete: Restrict` EXPLÍCITO** | Medido no `Note`: para relação **opcional** o default do Prisma é `SetNull`, e aqui a relação é **obrigatória**, cujo default já é `Restrict` — mas o docblock do `Note` registra que o implícito foi o que quase produziu corrupção silenciosa. Declare, e diga por quê. ⚠️ **E confira o `replacePlanItems`:** hoje ele tem guarda de domínio para "não remover dia que já tem nota". Um dia que já tem **leitura** passa por essa guarda? Se não passar, remover o dia do plano vai estourar na FK com erro de banco (500) em vez de 400. **Meça e reporte** — o conserto pode ser desta fatia ou não, mas a lacuna tem de estar escrita. |
| I | **O `delete` do repositório é `deleteMany({ where: { id } })`** | É a prescrição registrada no port na Tarefa 30, e ela estava **rotulada como NÃO MEDIDA**. ⚠️ **Esta é a fatia que a mede**: o teste de contrato decide se `delete` levantaria `P2025`. **Meça contra o banco e troque o rótulo pelo fato**, nos dois sentidos que a medição der. |

## Regras (o que os testes provam)

### O modelo

1. `ReadingLog` no `schema.prisma` com os seis campos da entidade e **nada mais** — sem
   `status`, `archivedAt`, `updatedAt`, `createdAt`. `readAt` é `DateTime` **sem** `@default`
   (o dono do instante é o UseCase, ADR 0008).
2. ⚠️ Migration gerada **por `prisma migrate dev --name reading_log`**. Nunca à mão. O
   arquivo gerado vai no commit **como o Prisma o escreveu**.
3. `@@unique([planItemId, userId])` e `@@index([bookId])` (decisão G); FKs para `Club`,
   `Book`, `User` e `ReadingPlanItem`, esta com `onDelete: Restrict` explícito (H).

### O repositório

4. ⚠️ Teste de **contrato contra o Postgres real**, no formato do
   `prisma-note-repository.contract.integration.test.ts`: `save` · `byPlanItemAndUser` ·
   `delete` · `find`.
5. ⚠️ **O índice único morde de verdade:** salvar um `id` novo com o par `(planItemId,
   userId)` repetido levanta **`P2002`** — provado **contra o banco**, não contra o fake. É
   isso que faz a fidelidade do fake da Tarefa 30 deixar de ser afirmação.
6. `save` é **upsert por `id`**: re-salvar o mesmo id **atualiza** e não viola o único
   (o fake já promete isso; aqui prova-se contra o banco).
7. ⚠️ **A decisão I, medida:** `delete` de id inexistente é **no-op silencioso**. Cole a
   medição e **troque o rótulo "NÃO MEDIDO" do docblock do port pelo fato** — nos dois
   sentidos que ela der.
8. `find({ bookId })` devolve os logs do livro; `find({ bookId, userId })` e
   `find({ bookId, planItemId })` recortam. Filtro vazio de um campo **não** filtra por ele.
9. ⚠️ **Limpeza de fixture que CONSULTA o banco** (§6.6), com prefixo próprio — nunca uma
   lista alimentada pelas respostas esperadas. Um teste que falha no meio vaza fixture, e a
   limpeza estoura na FK.

### As rotas

10. `PUT /plan-items/:planItemId/reading-log` → **201** na primeira, **200** nas seguintes
    (B). Corpo de resposta declarado no `response` schema para **os dois** status (§6.1).
11. `DELETE /plan-items/:planItemId/reading-log` → **204** sempre (C), inclusive sem nada para
    apagar.
12. ⚠️ **O corte de tenant, ponta a ponta:** usuário de outro clube recebe **404** nas duas
    rotas. Item de plano inexistente → **404**. Sem token → **401** (vem de graça do escopo
    autenticado).
13. ⚠️ **Contrabando com o ator LEGÍTIMO** (§7.5): mandar `userId` no corpo **não** troca a
    autoria, e o teste asserta **a linha gravada**, não o status. ⚠️ E o mutante perigoso é
    `input.userId ?? req.user.sub` — o corpo não declara a chave, então o strip do Zod é a
    primeira barreira e a **ordem do spread** é a segunda (§6.3).
14. `GET /books/:bookId` devolve `readers` ao lado de `writers`, **declarado no `response`
    schema de `shared`** (§6.1: sem a declaração, o serializer apaga o campo e nada avisa).
15. Nenhuma classe de erro nova. ⚠️ Se você criar uma, **mapeie no mesmo commit**:
    `NOT_YET_MAPPED` é `[]` e o teste percorre toda classe exportada.

### Transversais

16. ⚠️ **`packages/ui` e `packages/app` INTOCADOS** — `git status` vazio, colado. O chunk de
    entrada continua **416.107 B**: `packages/shared` cresce (os schemas), então **meça e
    cole**; se subir, diga quanto.
17. `pnpm -r typecheck` verde ao fim de **cada** unidade (E).
18. ⚠️ **A integração roda, e é você quem a roda** (o revisor não pode). Baseline **387**.
    Cole o número novo **e** a prova, por consulta ao banco, de que **nenhum fixture sobrou**.

## Arquivos a tocar

```
packages/backend/prisma/schema.prisma                          + model ReadingLog
packages/backend/prisma/migrations/<gerada>/migration.sql      GERADA pelo Prisma, não escrita
packages/backend/src/usecases/ports/reading-log-repository.ts  + find(filter); rótulo do P2025 (7)
packages/backend/src/usecases/_fakes/reading-log-repository-fake.ts  + find
packages/backend/src/usecases/_fakes/__tests__/                crescer
packages/backend/src/repositories/prisma-reading-log-repository.ts   NOVO
packages/backend/src/repositories/__tests__/*.contract.integration.test.ts  NOVO
packages/backend/src/repositories/__tests__/_db.ts             a limpeza
packages/backend/src/http/repositories.ts                      + o repositório
packages/backend/src/usecases/get-book-with-plan.ts            + readers
packages/backend/src/usecases/__tests__/get-book-with-plan.test.ts   crescer
packages/backend/src/routes/reading-log-routes.ts              NOVO
packages/backend/src/routes/__tests__/*.integration.test.ts    NOVO
packages/backend/src/http/server.ts                            registrar as rotas
packages/shared/src/reading-log.ts                             NOVO — os schemas
packages/shared/src/book.ts                                    + readers na resposta
packages/shared/src/index.ts                                   o export
packages/shared/src/__tests__/                                 crescer
```

**Não tocar:** `packages/ui/**` · `packages/app/**` · `src/domain/**` (a entidade e o
agrupamento estão prontos; se precisar mexer, **pare e reporte**) · `docs/**`.

## ⚠️ Segurança desta fatia — ela é a primeira do MVP 3 que escreve no banco do dono

- **`prisma migrate dev --name reading_log`** é o **único** comando de migration autorizado.
  **NUNCA** `migrate reset`, **NUNCA** `db push`, **NUNCA** editar SQL à mão.
- **NUNCA `deleteMany({})`.** Fixture com prefixo próprio, apagada por id, e a limpeza
  **consulta o banco**.
- O banco tem um **super-admin do seed**. Ele tem de continuar lá ao fim — **prove por
  consulta**.

## Definição de pronto

- [x] Migration **gerada pelo Prisma**, com o nome do comando colado (2).
- [x] ⚠️ `P2002` do índice único provado **contra o banco** (5).
- [x] ⚠️ A decisão I **medida**, e o rótulo "NÃO MEDIDO" do port **trocado pelo fato** (7).
- [x] Contrato de `save`/`byPlanItemAndUser`/`delete`/`find` (4, 6, 8).
- [x] ⚠️ Limpeza de fixture que **consulta o banco** (9), e a prova de que nada sobrou (18).
- [x] `201`/`200`/`204` (10, 11); **404** de tenant nas duas rotas (12).
- [x] ⚠️ Contrabando de `userId` com o **ator legítimo**, assertando a linha gravada (13).
- [x] `readers` na resposta do livro, **declarado no `response` schema** (14).
- [x] ⚠️ A lacuna do `replacePlanItems` × dia com leitura **medida e escrita** (H).
- [x] `pnpm -r test`, `typecheck`, `lint`, `prettier --check .`, `build` limpos — baseline
      **415** shared · **195** ui · **1382** backend · **620** app.
- [x] ⚠️ **Integração rodada por você**, número novo colado (era **387**) + prova de banco
      limpo + super-admin intacto.
- [x] ⚠️ `git status -- packages/ui packages/app` **vazio**; chunk de entrada colado (16).
- [x] **Linhas de código coladas** (contador canônico) dos arquivos novos.
- [x] ⚠️ O **vermelho colado** das regras 5, 12, 13 e 14.
