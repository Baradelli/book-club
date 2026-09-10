# Tarefa 30 — Domínio `ReadingLog` + `markRead` / `unmarkRead`

> **A primeira fatia do MVP 3, e ela começa pelo domínio, como o `CLAUDE.md` manda** — sem
> persistência, sem rota, sem tela. É a mesma abertura da Tarefa 22 no MVP 2 (`Highlight`
> ganhou entidade, autoria e relógio antes de existir tabela).
>
> Leia antes: `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` **§6.9** (por que a ordem das unidades
> é restrita quando um port cresce — e por que **aqui ela não morde**, ver decisão G) e **§7
> inteiro** (§7.1 fidelidade do fake · §7.2 enumeração invertida · §7.3 contador de chamadas ·
> §7.4 asserção vazia · §7.7 factory · **§7.8 o relógio**), `docs/adr/0002` (visibilidade
> total), `docs/adr/0008` (`updatedAt` é do domínio), `docs/adr/0009` (clube arquivado
> continua legível).
>
> **Os vizinhos a imitar, nesta ordem:**
> `src/usecases/upsert-plan-note.ts` — é o parente mais próximo de `markRead`: recebe
> `planItemId`, resolve o livro pelo item, corta o tenant pelo `bookForActor` e é idempotente
> por `unique(planItemId, userId)`;
> `src/usecases/archive-note.ts` + `note-for-author.ts` — a forma "carrega, confere autoria,
> age";
> `src/domain/highlight.ts` — a forma de uma entidade nova com docblock que diz **por quê**;
> `src/usecases/_fakes/note-repository-fake.ts` — o fake com contadores, enumeração invertida
> e emulação do índice único;
> `src/test-support/advancing-clock.ts` — o relógio que **conta leituras**.

## Objetivo

Eu abro a leitura de hoje, marco que li — e desmarco se eu tiver me enganado.

## Escopo enxuto

**Entra:** a entidade `ReadingLog`, o port `ReadingLogRepository` com o fake, e os UseCases
`markRead` e `unmarkRead`, com TDD estrito.

| Fora | Por quê |
| --- | --- |
| Modelo Prisma, migration e repositório real | É a **Tarefa 32**, junto com as rotas. Esta fatia não cria port que o Prisma precise satisfazer hoje (decisão G) — e é isso que a mantém verde sem tabela. ⚠️ Se você achar que precisa de migration, **pare e reporte**. |
| `computeBookProgress` | É a **Tarefa 31**, e ela é **pura**: recebe plano + logs e não conhece repositório. Nada aqui precisa somar nada. |
| Rotas `POST`/`DELETE`, schemas Zod em `packages/shared` | É a **Tarefa 32**. O `Highlight` fez o mesmo caminho: domínio na 22, `shared/src/highlight.ts` só na 24. Consequência medida e desejada: **esta fatia não põe um byte no chunk de entrada.** |
| Tela, chave de i18n, qualquer coisa em `packages/app` ou `packages/ui` | Tarefa 32. Sem tela, sem texto. |
| `ActivityEvent` ao marcar leitura | É a **Tarefa 33**, que põe o gatilho nos três UseCases de escrita de uma vez. Espalhar o gatilho agora criaria dois donos da mesma regra. |
| Notificação / supressão anti-culpa do lembrete | Bloco I (Tarefas 36–38). Aqui só nasce o dado que a supressão vai consultar. |
| ⚠️ O helper `dayRange` que o `CLAUDE.md` promete | **Medido: ele não existe, e esta fatia não faz a conta que ele existiria para fazer.** Ver decisão G. |
| Luxon | Não é dependência de pacote nenhum hoje (medido), e nada aqui precisa de fuso. Ele é da Tarefa 37, **e só do `packages/backend`**. |
| Desmarcar leitura de outra pessoa, admin desmarcar pelos outros | `CLAUDE.md`: ninguém mexe no conteúdo de outra pessoa. Aqui é estrutural (decisão E), não um `if`. |

## Decisões já tomadas (não reabrir)

- **`ReadingLog` é log imutável: não se arquiva nem se edita. Desmarcar "li" é hard delete.**
  → `CLAUDE.md` e as decisões fechadas do MVP 3 no `BACKLOG.md`. É a exceção documentada ao
  soft delete.
- **Progresso é calculado, nunca guardado.** → decisões fechadas do MVP 3. Nenhum contador
  mora nesta entidade.
- **Todo modelo de conteúdo carrega `clubId`; os que têm autor carregam `userId`.** O tenant
  do request é `req.user.sub`, e **nenhum input aceita `userId`**. → `CLAUDE.md`.
- **Sem membership ativo → 404**, nunca 403. → `CLAUDE.md`, e o `NotAMemberError` do
  `assertMembership` já é o 404 (`CONVENCOES-CODIGO` §6.5).
- **Dentro do clube não existe conteúdo privado** (ADR 0002): quem leu é visível para os
  membros ativos. O que a autoria protege é a **escrita** do registro.
- **Clube arquivado continua legível** (ADR 0009): o guard confere o status do `Membership`,
  não o do `Club`. Não invente uma segunda regra de tenant.
- **`randomUUID()` para ids**, no UseCase. → `CLAUDE.md`.
- **Entidade simples (DDD-lite)**: sem value object, sem agregado, sem domain event.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | ⚠️ **O `ReadingLog` ancora no `planItemId`, não numa data de calendário.** "Li" quer dizer "li **o trecho** do dia X do plano", não "li em tal data". | A alternativa é `(bookId, date)` — "li no dia 5". Ela **não sabe expressar o caso real**: quem lê no domingo o capítulo de sexta marcaria o domingo, e o plano de sexta ficaria eternamente sem dono. O plano é a unidade de leitura do produto inteiro (cada dia tem um tema pré-definido), a `Note` do dia já ancora exatamente assim (`planItemId`), e ancorar igual faz a sobreposição de autoria da tela do livro estender de graça: hoje ela mostra **quem escreveu** em cada dia; a 32 acrescenta **quem leu**, na mesma linha e com a mesma construção. Consequência que eu quero: `markRead` **não faz aritmética de data nenhuma**. |
| B | **Idempotente por `unique(planItemId, userId)`**, e a saída é `{ log, created }` | É a forma do `upsertPlanNote`, e é a que a rota da 32 usa para decidir 201 × 200 sem regra de negócio na borda. Marcar duas vezes (dois toques, ou o retry da fila offline) tem de ser **inofensivo** — a alternativa, lançar "já marcado", transformaria um toque duplo em erro na tela. |
| C | **`unmarkRead` é hard delete e é idempotente**: nada para apagar **não** é erro | Lançar `ReadingLogNotFoundError` obrigaria a tela a distinguir "desmarquei" de "já estava desmarcado", que é a mesma coisa para quem olha. E criaria classe de erro nova só para isso (ver decisão F). |
| D | **`readAt` e nada mais de instante**: sem `createdAt`, sem `updatedAt`, sem `status`, sem `archivedAt` | O log é imutável por decisão fechada, então `updatedAt` seria um campo que nenhum caminho escreve — e o ADR 0008 registra que instante sem dono é como um campo mente. `createdAt` **é** o `readAt` aqui: o registro nasce no ato de marcar, e dois nomes para o mesmo instante é a duplicação da lição nº 3. |
| E | ⚠️ **Ninguém desmarca a leitura de outra pessoa, e isso é ESTRUTURAL, não um `if`** | A busca é por `(planItemId, actorUserId)`, então o log de outra pessoa é **inalcançável** — não há id de log no input. A alternativa (receber `logId` e conferir `log.userId === actor` com um `NotTheAuthorError`) é a forma do grifo e da nota, e ela é certa **lá**, porque lá o recurso tem endereço próprio. Aqui não tem: o par (dia, pessoa) já é a identidade. Um guard de autoria sobre uma busca que já é por autor é uma regra a manter em dia sem nada a guardar. |
| F | **Nenhuma classe de erro nova** | `PlanItemNotFoundError` (404) e `NotAMemberError` (404) já existem e já estão mapeadas. ⚠️ Isso importa por um motivo medido: `NOT_YET_MAPPED` em `handle-domain-error.test.ts` é uma lista **vazia**, e o teste percorre toda classe exportada de `errors.ts` — então uma classe nova **quebra a suíte no mesmo commit** se não for mapeada. Se você concluir que precisa de uma, mapeie junto. |
| G | ⚠️ **O port é NOVO, e por isso a restrição do §6.9 não morde — mas ele nasce MÍNIMO** | O §6.9 mede que **crescer** um port sem implementar no Prisma dá 16 erros em 9 arquivos. Aqui não há classe Prisma prometendo satisfazer `ReadingLogRepository` nem rota que o receba, então `typecheck` fica verde com só o fake. **A contrapartida é que o port só ganha o que estes dois UseCases usam** (`save` · `byPlanItemAndUser` · `delete`): `find(filter)` chega na **Tarefa 32**, junto com a implementação Prisma, na **mesma unidade**. Port com método sem chamador é a especulação que o §7.1 condena — e seria, ainda por cima, um método sem teste de contrato por duas fatias. |
| H | ⚠️ **`dayRange` NÃO nasce aqui, e o `CLAUDE.md` está descrevendo algo que já existe com outro nome** | **Medido:** `grep -rn "dayRange" packages/backend/src` devolve **nada** — até aí o prompt do MVP 3 está certo. Mas a conta que ele existiria para fazer **já tem dono, em um lugar só, e em forma melhor**: `localDay(instant, timeZone)` em `packages/shared/src/local-day.ts` (19 testes) converte instante → `CalendarDay` com `Intl`, e o docblock dele **nomeia** a comparação por string com `ReadingPlanItem.date`; `calendarDayToDate`/`dateToCalendarDay` em `src/repositories/calendar-day-mapper.ts` fazem o ida-e-volta com a coluna `@db.Date`, e o docblock proíbe explicitamente os getters locais. Um `dayRange` (par de instantes) só faz falta para consultar coluna de **instante** por dia — e a decisão A garante que nenhuma consulta desta feature faz isso. **Registrado como pergunta**, não consertado por conta própria: quem decide corrigir a frase do `CLAUDE.md` é o dono. Reavaliar na **Tarefa 37**, onde "que horas são no fuso dela" é pergunta de verdade. |
| I | **`clubId` e `bookId` ficam desnormalizados no log** | São deriváveis de `planItem.bookId` → `book.clubId`, mas o `Note` carrega os três pelo mesmo motivo e a regra multi-tenant do `CLAUDE.md` diz "todo modelo de conteúdo carrega `clubId`" sem ressalva de derivabilidade. E é o que faz "os logs deste livro" (Tarefa 31/32) ser um índice, não um join. |
| J | **O fake emula o índice único e enumera INVERTIDO** (§7.1, §7.2) | Um fake que aceita o segundo `save` do mesmo par esconderia o `P2002` que o Postgres vai dar na 32; um que enumera na ordem de inserção deixa passar teste que confia em ordem que o port não promete. É o que o `NoteRepositoryFake` já faz, e o §7.2 manda repetir. |

## Regras (o que os testes provam)

### A entidade

1. `ReadingLog` tem exatamente: `id`, `clubId`, `bookId`, `userId`, `planItemId`, `readAt`.
   **Não tem** `status`, `archivedAt`, `updatedAt` nem `createdAt` (decisão D), e o docblock
   diz **por quê** — apontando para a decisão fechada do MVP 3, não para esta spec só.
2. `planItemId` é obrigatório e **não anulável** (decisão A). Diferente da `Note`, onde ele é
   nulo justamente para a avulsa existir: não existe leitura avulsa.

### `markRead`

3. Input é `{ actorUserId, planItemId }`, e **só**. Nem `userId`, nem `clubId`, nem `bookId`,
   nem `readAt` — os três primeiros se derivam, o quarto é do relógio.
4. Item de plano inexistente → `PlanItemNotFoundError`, **antes** de qualquer escrita.
5. ⚠️ **O corte de tenant vem antes da escrita, e prova-se por contador.** O `bookForActor`
   resolve o clube por `planItem.bookId` → `book.clubId`, **nunca** do input. Ator de outro
   clube recebe `NotAMemberError` **e** `logs.saveCalls === 0` (§7.3: "recusou antes de ler" ×
   "leu e depois recusou" dão o mesmo erro ao cliente e são coisas diferentes).
6. `MEMBER` marca. **Não exige papel** — papel de admin manda no livro e no plano, não no que
   as pessoas registram (o mesmo argumento do `upsertPlanNote`).
7. Livro arquivado: o `bookForActor` já recusa com `BookNotFoundError`, e o teste **fixa** esse
   comportamento herdado em vez de o redecidir.
8. Primeira marcação: devolve `{ log, created: true }`, com `id` de `randomUUID()`, `userId`
   igual ao ator, e `clubId`/`bookId` vindos do livro.
9. ⚠️ **Idempotência com contador, não só com igualdade.** Marcar duas vezes devolve o
   **mesmo** `log.id` com `created: false`, **e** `logs.saveCalls === 1` — a segunda chamada
   não escreve. Sem o contador, um `save` que sobrescreve a mesma linha passaria: §7.3, "não
   chamou" × "chamou e não mudou nada" (e "chamou à toa" é um `UPDATE` por toque).
10. ⚠️ **`readAt` vem de UMA leitura de relógio, provada por CONTAGEM.** Use o
    `advancing-clock.ts` e asserte contra `clock.at(0)`, derivado de constante. É a 5ª
    aparição do §7.8: **`expect(a).toEqual(b)` entre dois instantes NÃO prova "um relógio só"**
    — dois `new Date()` no mesmo tick são iguais, e o mutante passou em 1206 testes na Tarefa
    22. O primeiro teste do arquivo é a **precondição** de que duas leituras diferem.
11. Duas pessoas marcam o mesmo dia: **duas** linhas, e nenhuma pisa na outra. Uma pessoa marca
    dois dias do mesmo livro: **duas** linhas.

### `unmarkRead`

12. Input é `{ actorUserId, planItemId }` — **não** há `logId` (decisão E).
13. Hard delete de verdade: depois de desmarcar, `byPlanItemAndUser` devolve `null`. Nada de
    `status`/`archivedAt`.
14. ⚠️ **Idempotente e sem toque no banco quando não há o que apagar:** desmarcar o que não
    está marcado **não lança**, e `logs.deleteCalls === 0`. As duas metades importam — sem o
    contador, um `delete` de id inexistente disfarçado de no-op passaria.
15. ⚠️ **O log de outra pessoa é inalcançável (decisão E).** Com só a Maria tendo marcado, o
    Marcos desmarcando o **mesmo** `planItemId` não apaga nada, e o log da Maria **continua
    lá** — assertado sobre o estado do fake, não sobre a ausência de erro (§7.4: "não rejeitou"
    não é asserção).
16. O corte de tenant vale igual: ator de outro clube → `NotAMemberError` e
    `logs.deleteCalls === 0`.

### O fake e a suíte

17. ⚠️ **Fidelidade nas DUAS direções (§7.1).** O fake **recusa** o segundo `save` do mesmo par
    `(planItemId, userId)`, como o índice único fará — e **aceita** o mesmo `planItemId` com
    `userId` diferente e o mesmo `userId` com `planItemId` diferente. A pergunta é sempre "o
    Postgres faria isto?", e ela tem de ser respondida nos dois sentidos: já são **seis**
    aparições desta classe, e a restritiva é a que fica verde.
18. Enumeração em ordem **inversa** à de inserção, com teste dedicado que a chama pelo nome
    (§7.2) — e nenhum outro teste desta fatia depende de ordem.
19. Contadores `saveCalls` · `deleteCalls` · `byPlanItemAndUserCalls`, com o lado **positivo**
    também assertado em algum teste (§7.3: um contador só afirmado como `toBe(0)` é meio
    contador).
20. Fixtures por **factory** com `overrides` (§7.7), e a data padrão do `aPlanItem()` continua
    **notoriamente não-hoje** (o corolário do §7.8) — nada nesta fatia deriva de "hoje".
21. O fake tem **suíte própria** em `_fakes/__tests__/`, como os outros onze.

### Transversais

22. `pnpm -r typecheck` verde ao fim de **cada** unidade — e é o que a decisão G compra.
    Nenhum arquivo de rota, nenhum repositório Prisma e nenhum `buildRepositories` é tocado.
23. Nenhuma classe de erro nova (decisão F). `NOT_YET_MAPPED` continua `[]` e
    `handle-domain-error.ts` fica **intocado**.
24. ⚠️ **`packages/shared`, `packages/ui`, `packages/app` e `prisma/` ficam INTOCADOS** —
    `git status` nesses caminhos tem de vir vazio no relatório. Consequência medida a colar:
    o chunk de entrada continua em **424.995 B** (folga 25.005), porque esta fatia não
    atravessa a fronteira do PWA.

## Arquivos a tocar

```
packages/backend/src/domain/reading-log.ts                          NOVO — a entidade
packages/backend/src/usecases/ports/reading-log-repository.ts       NOVO — o port mínimo
packages/backend/src/usecases/_fakes/reading-log-repository-fake.ts NOVO — o fake
packages/backend/src/usecases/_fakes/__tests__/reading-log-repository-fake.test.ts  NOVO
packages/backend/src/usecases/mark-read.ts                          NOVO
packages/backend/src/usecases/unmark-read.ts                        NOVO
packages/backend/src/usecases/__tests__/mark-read.test.ts           NOVO
packages/backend/src/usecases/__tests__/unmark-read.test.ts         NOVO
packages/backend/src/test-support/builders.ts                       + a factory do log, se couber lá
```

**Não tocar:** `packages/backend/prisma/**` (**esta fatia não muda o modelo**) ·
`packages/backend/src/repositories/**` · `packages/backend/src/routes/**` ·
`packages/backend/src/http/**` · `packages/shared/**` · `packages/ui/**` · `packages/app/**` ·
`docs/**` (a spec e o `BACKLOG` são do orquestrador) · qualquer `package.json` (**nenhuma
dependência nova nesta fatia** — Luxon inclusive).

## Definição de pronto

- [ ] A entidade tem os seis campos e **nenhum** instante ou status a mais (1, 2, D).
- [ ] ⚠️ Corte de tenant **antes** da escrita, provado por `saveCalls === 0` (5) e
      `deleteCalls === 0` (16).
- [ ] ⚠️ Idempotência de `markRead` provada por **mesmo id + `created: false` + `saveCalls`**
      (9), não só pela igualdade do resultado.
- [ ] ⚠️ `readAt` de **uma** leitura de relógio, provado por **contagem** com o
      `advancing-clock`, com a precondição de que duas leituras diferem (10).
- [ ] `unmarkRead` idempotente **e** sem chamada ao repositório quando não há o que apagar
      (14); o log alheio continua lá, assertado sobre o estado (15).
- [ ] ⚠️ Fake fiel nas **duas** direções do índice único (17) e enumeração invertida com teste
      pelo nome (18); suíte própria do fake (21).
- [ ] Nenhuma classe de erro nova; `NOT_YET_MAPPED` vazio; `handle-domain-error.ts` intocado
      (23).
- [ ] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos, com as **contagens por pacote coladas**
      (baseline: 413 · 195 · 1307 · 603).
- [ ] `pnpm -r test:integration` **NÃO precisa rodar** — esta fatia não toca repositório nem
      rota. Diga isso no relatório em vez de repetir o número de outro (**387** é o baseline).
- [ ] ⚠️ `git status -- packages/shared packages/ui packages/app packages/backend/prisma`
      **vazio**, colado no relatório (24).
- [ ] **Linhas de código coladas** (contador canônico, o do docblock de
      `packages/app/src/pages/acervo.tsx`) de cada arquivo novo.
- [ ] ⚠️ O **vermelho colado** das regras 5, 9, 10, 14, 15 e 17 — a mensagem de falha real,
      antes da implementação.
