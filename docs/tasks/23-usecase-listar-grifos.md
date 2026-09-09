# Tarefa 23 — `listHighlights(filter)`: a coleção de grifos do livro

> A Tarefa 22 deu ao grifo domínio, autoria e as três escritas. Falta **ler**: a coleção do
> clube, como o clube escolhe olhar — por livro, por pessoa, por cor, por página.
>
> Leia antes: `docs/tasks/22-usecase-grifo.md` (a fatia irmã, e o `HighlightRepository` que
> esta cresce), `docs/adr/0002-visibilidade-total-no-clube.md` (o filtro é **navegação, não
> permissão**), `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` **§7.1, §7.2, §7.3, §7.4**, e o
> vizinho que esta fatia imita quase linha por linha:
> `packages/backend/src/usecases/list-notes.ts` + `ports/note-repository.ts` (o `NoteFilter`).

## Objetivo

Vejo os grifos do clube neste livro — todos, ou só os meus, ou só os amarelos, ou só os de uma
página — e os mais recentes vêm primeiro.

## Escopo enxuto

**Entra:** o `HighlightFilter` no port, o `find` (com o fake), e o UseCase `listHighlights`.

| Fora | Por quê |
| --- | --- |
| **O filtro por texto (`text`)** | É a **Tarefa 29**, e é ela a chamadora. O `NoteFilter` nasceu com `text` porque a Tarefa 10 **era** a fatia da busca; aqui o `BACKLOG` lista "por livro, autor, cor, página". Campo de filtro sem chamador é especulação (`docs/WORKFLOW.md`). ⚠️ E a 29 tem uma pergunta de produto a resolver antes — ver "Registrado para a Tarefa 29" no fim. |
| Repositório Prisma, migration, rotas `/highlights` | É a **Tarefa 24**. Aqui não se toca em `prisma/` — regra de segurança absoluta desta sessão. |
| Tela de grifos | É a **Tarefa 25**. |
| Faixa de página (`pageFrom`/`pageTo`) | Aditivo, e ninguém pediu. O `NoteFilter` inteiro é igualdade; uma faixa entra sem quebrar nada quando um capítulo virar filtro de verdade. |
| `includeArchived` | Não há tela de arquivados (é MVP 4). Flag sem chamador é especulação — a mesma decisão C da Tarefa 10. |
| Paginação | Ver decisão F: o teto é **válvula** no repositório da Tarefa 24, não paginação. |
| Contagem por cor / agregação para a tela | A tela conta o que recebeu. Agregação no backend é otimização sem medição. |

## Decisões já tomadas (não reabrir)

- **Dentro do clube não existe conteúdo privado.** Todo grifo de um clube é visível para todo
  membro ativo, desde que é salvo. O `authorId` é uma **lente** sobre o mesmo acervo, nunca
  uma permissão, e nada aqui pode ser nomeado como privacidade. → ADR 0002.
- **`clubId` é o corte de tenant, obrigatório e em AND com todo o resto.** Sem membership
  ativo → **404** (`NotAMemberError`), exista o clube ou não.
- **Leitura não exige papel:** `MEMBER` lê o acervo inteiro do clube.
- **Paleta fixa de 5 cores**, que já mora em `@clube/shared` (Tarefa 22, decisão A).
- **Arquivado é invisível** até o MVP 4, inclusive para o autor.
- O port **não promete ordem**; quem ordena é o UseCase, porque ordem é regra de produto.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | Ordem: **`createdAt` desc, desempate por `id`** — a mesma do `listNotes`, e decidida no UseCase | Ordenar por **`page` crescente** (a ordem de leitura do livro) é tentador e talvez seja o que a tela queira, mas: `page` é **anulável**, e os grifos sem página precisariam de uma posição arbitrária no meio da lista; e toda outra listagem do app é "mais recente primeiro". A tela da Tarefa 25 pode reordenar o que recebeu **sem** mudar este UseCase — o contrário (mudar a ordem aqui) muda o contrato para todo chamador futuro. Registrado como pergunta do dono. |
| B | Sem `text` (ver a tabela de fora de escopo) | — |
| C | `page` é **igualdade exata** | O `BACKLOG` diz "página". Faixa é aditiva. |
| D | `color` chega **tipado** (`HighlightColor`) e **não** é revalidado no UseCase | É o precedente exato do `kind?: NoteKind` do `listNotes`: quem valida enum de query string é o `z.enum` da borda (Tarefa 24). Revalidar aqui criaria **dois donos** da mesma regra, que é como as duas divergem na primeira correção. |
| E | Um `find` só, com **um** `HighlightFilter` completo | N idas ao banco por filtro é o bug com fatura de banco. O `findFilters` do fake é o que prova que foi uma (§7.3). |
| F | Sem paginação. O teto é **válvula** no repositório da 24 | A Tarefa 11 mediu e adotou `take: 500` como válvula na nota, com a nota de que "a primeira tela que paginar troca por cursor". Aqui vale igual. ⚠️ **E o custo por linha é para MEDIR, não afirmar:** a Tarefa 10 mediu ~6,8 KiB de heap por nota (o `doc` inteiro); o grifo é menor (o `quote` é uma frase e o `commentDoc` é um comentário), mas **eu não medi** — quem executa mede e cola o número, e a spec não afirma nenhum antes disso. |
| G | Nenhuma classe de erro nova | Não há erro novo a inventar: o único caminho de recusa é o `assertMembership`, que já tem o dele. |

## Regras (o que os testes provam)

### O corte de tenant

1. O `assertMembership` roda **ANTES** da consulta: um ator sem membership ativo recebe
   `NotAMemberError` (404) e **não gera nem uma leitura** — `findCalls === 0`. E o teste
   asserta o lado **positivo** (`findCalls === 1` no caminho feliz), senão um incremento
   apagado deixa todo `toBe(0)` passar por acidente (§7.3).
2. Leitura **não exige papel**: `MEMBER`, `ADMIN` e `OWNER` recebem o acervo — e o teste
   asserta **a saída real**, nunca "não lançou" (§7.4).
3. `clubId` é obrigatório e entra em **AND** com todo filtro: grifo de outro clube **nunca**
   aparece, nem com `bookId`/`authorId`/`color` batendo.
4. `bookId` de um livro de **outro clube** devolve **lista vazia**, não 404 — o precedente do
   `listNotes` (decisão da Tarefa 10): o corte é o `clubId`, e o `bookId` é filtro.

### Os filtros

5. Sem filtro nenhum além do `clubId`: vem o acervo de grifos do clube inteiro.
6. `authorId` recorta por autor, e é **navegação, não permissão**: o membro recebe o grifo de
   qualquer pessoa do clube pedindo o `authorId` dela. Nada no UseCase, no port ou nos nomes
   sugere privacidade (ADR 0002).
7. `color` recorta pela cor exata: pedir `#facc15` não traz `#22c55e`.
8. ⚠️ **`page` contra coluna nula.** `page: 45` **não** casa um grifo sem página. É a fidelidade
   do §7.1 (4ª aparição da classe): no Postgres `WHERE "page" = 45` contra `NULL` é **falso**, e
   um fake que casasse `null` faria o grifo sem página aparecer no filtro de uma página que não
   é a dele. O fake reproduz isso, e tem teste — **fidelidade afirmada em comentário e não em
   teste é fidelidade que o próximo refactor apaga**.
9. Dois ou mais filtros juntos são AND, não OR.
10. `status: 'ACTIVE'` é cortado **no repositório**, não em memória: o `findFilters` do fake
    prova que o UseCase manda o status no filtro (§7.3 — num cenário sem grifo arquivado, um
    UseCase que carregasse tudo e filtrasse depois devolveria exatamente o mesmo array).
11. **Um** `find` por chamada, com **um** filtro só e **sem chave à toa** — provado pelo
    `findFilters`, não pelo resultado.

### A ordem

12. Mais recente primeiro (`createdAt` desc), com desempate **determinístico** por `id`: duas
    pessoas grifando no mesmo instante é o caso normal de um clube.
13. ⚠️ A ordem é **do UseCase**, e o `find` do fake enumera na ordem **inversa** à de inserção
    (§7.2, a armadilha deliberada). O teste de ordem escolhe fixtures para os quais a
    implementação errada **falha** — e a precondição é **pinada** (`expect(ID_A < ID_B)`),
    senão um id renomeado devolve a coincidência em silêncio.
14. E o corolário: **teste cujo assunto não é a ordem não depende dela** — ordene antes de
    comparar, ou use `arrayContaining` + `toHaveLength` (§7.2).

### Transversais

15. **Nenhuma classe de erro nova**, `NOT_YET_MAPPED` continua vazio, e `src/http/` fica
    **intocado**.
16. O port cresce **só** com `find` + `HighlightFilter`. `save`, `byId` e `update` não mudam de
    assinatura, e nenhum método novo além do `find` aparece.

## Testes a escrever PRIMEIRO

```
packages/backend/src/usecases/__tests__/list-highlights.test.ts          regras 1-14
packages/backend/src/usecases/_fakes/__tests__/highlight-repository-fake.test.ts  crescer (8, 13)
```

## Arquivos a tocar

```
packages/backend/src/usecases/ports/highlight-repository.ts        + HighlightFilter e find
packages/backend/src/usecases/_fakes/highlight-repository-fake.ts  + find, findCalls, findFilters
packages/backend/src/usecases/list-highlights.ts                   NOVO
+ os dois arquivos de teste acima
```

**Não tocar:** `packages/backend/prisma/**` · `src/repositories/**` · `src/routes/**` ·
`src/http/**` · `src/domain/**` (o domínio do grifo está pronto; se esta fatia precisar mexer
nele, **pare e reporte**) · `packages/{ui,app,shared}/**`. Nenhuma classe de erro nova.

## Definição de pronto

- [ ] O corte de tenant vem **antes** da consulta, com `findCalls === 0` **e** o lado positivo
      (1).
- [ ] `bookId` de outro clube devolve **vazio**, não 404 (4).
- [ ] ⚠️ `page` **não** casa coluna nula, com teste no fake (8).
- [ ] `status: 'ACTIVE'` provado pelo `findFilters`, não pelo resultado (10).
- [ ] **Um** `find`, **um** filtro, sem chave à toa (11).
- [ ] A ordem tem fixture que faz a implementação errada **falhar**, com a precondição pinada
      (12, 13).
- [ ] Nada sugere privacidade em nome de campo, comentário ou teste (6).
- [ ] **Custo de heap por grifo MEDIDO** e colado (decisão F) — sem número afirmado sem
      medição.
- [ ] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos, contagens coladas.
- [ ] `shared`, `ui` e `app` **intocados** nas contagens da Tarefa 22.
- [ ] Integração **não rodada** (escreve no banco do dono), e `prisma/`/`repositories/`/
      `routes/` intocados — provado por `git status` e por data de modificação.
- [ ] **Linhas de código coladas** dos arquivos novos e do crescimento do port e do fake.
- [ ] Checklist marcada; a linha 23 do `BACKLOG.md` é do orquestrador.

## Registrado para a Tarefa 29 (a busca)

A decisão fechada do MVP 2 diz: *"Busca é `ILIKE` no `plainText`/`commentText`. Sem embeddings,
sem pgvector."* Ela nomeia o **mecanismo** (`ILIKE`, e nada de vetor) e os campos **derivados**
de cada entidade — mas **não** menciona o `quote`, que é justamente o conteúdo do grifo (o ADR
0004 chama o `quote` de "o trecho grifado"; o comentário é o que a pessoa achou dele).

Uma busca de grifos que ignore o `quote` não acha *a frase que a pessoa grifou* — que é o caso
de uso inteiro ("qual era aquela frase do capítulo 3?"). Então a Tarefa 29 tem de decidir se o
`text` casa **`quote` OU `commentText`**. A recomendação, registrada como pergunta do dono no
`docs/ACEITE-MVP.md`: **casar os dois**, porque o mecanismo (`ILIKE`) não muda e o campo é
conteúdo, não metadado. Não decidido aqui, porque aqui não há chamador.
