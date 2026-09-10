# Tarefa 26a — `GET /clubs/:clubId/members`: o clube ganha nomes

> **Fatia inserida pelo orquestrador do MVP 2**, antes da 27. Ela não estava no `BACKLOG`
> original, e existe porque a Tarefa 27 pede filtro **por pessoa** e isso **não é implementável
> hoje**: a lacuna está medida e registrada três vezes no MVP 1 (linhas 17, 18 e 19) e é a
> **pergunta 1** do `docs/ACEITE-MVP.md`, cuja recomendação era exatamente "fazer no início do
> MVP 2".
>
> Leia antes: `docs/adr/0002-visibilidade-total-no-clube.md` (o acervo de quem **saiu** do clube
> continua íntegro, com autoria — é o que decide a decisão A), `docs/adr/0005-multi-clube-desde-o-dia-1.md`,
> `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` **§6 inteiro** e **§7.1, §7.2, §7.3, §7.4, §7.8**.
>
> **Os vizinhos a imitar quase linha por linha:** `src/usecases/get-me.ts` (o laço de `byId` por
> membership — é o precedente da decisão F), `src/usecases/list-notes.ts` (o corte de tenant
> antes da leitura), `src/routes/{club,me}-routes.ts`, `src/repositories/prisma-membership-repository.ts`,
> `src/usecases/_fakes/membership-repository-fake.ts`.

## Objetivo

A anotação da minha esposa deixa de dizer "Alguém do clube" e passa a dizer o nome dela — e o
filtro por pessoa da Tarefa 27 passa a ter o que escrever no chip.

## Escopo enxuto

**Entra:** `MembershipRepository.findByClub`, o UseCase `listClubMembers`, o repositório Prisma
com teste de contrato, o schema Zod em `shared`, a rota `GET /clubs/:clubId/members` e o teste
de integração do corte de tenant.

| Fora | Por quê |
| --- | --- |
| Mudar papel, remover membro, convites ativos | É o **MVP 4** (linhas 40, 41, 43). Aqui é só **leitura**. |
| A tela que consome | O nome no avatar e o chip por pessoa são a **27** (o componente) e a **28** (o acervo). Esta fatia entrega a rota. |
| E-mail na resposta | Ver decisão B: é PII além da necessidade, e nenhuma tela pediu. |
| `UserRepository.byIds` | Ver decisão F: a lista tem 2–10 pessoas, e método novo sem necessidade medida é especulação. |
| `GET /clubs/:clubId` (o clube por id) | Lacuna registrada na Tarefa 16, e continua sem chamador. |

## Decisões já tomadas (não reabrir)

- **Sem membership ativo → 404**, nunca 403. → ADR 0005.
- **Toda rota de conteúdo tem teste de integração de tenant.** Não é opcional.
- **`response` schema é fronteira de segurança** — sem ele o objeto de domínio inteiro vai para
  a rede (foi provado com `passwordHash` vazando de um `/me` sem schema). Enumere os status; o
  curinga `'2xx'` não compila. → §6.1.
- **Nenhum texto de interface no backend.** Quem escolhe a frase é o `t()` da tela.
- Nada de acesso a banco fora de um repositório.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | ⚠️ Devolve **todos** os memberships do clube — `ACTIVE` **e** `ARCHIVED` —, cada um com o seu `status` | O ADR 0002 decide que sair do clube **arquiva o `Membership` e não apaga o que a pessoa escreveu**: "o acervo do clube continua íntegro, **com autoria**". Se a rota devolvesse só os ativos, a anotação de quem saiu voltaria a ser "Alguém do clube" — **exatamente a lacuna que esta fatia existe para fechar**. O front usa o `status` para decidir o que vira chip de filtro (só os ativos) e o que serve apenas para resolver o nome. |
| B | **Sem e-mail na resposta** | A tela precisa de **nome** para atribuir autoria. Expor o e-mail de todo membro a todo membro é PII além da necessidade e nenhuma tela pediu. Se a gerência do clube (MVP 4) precisar, entra lá, com decisão do dono. |
| C | `name` é **anulável** e o backend **não inventa fallback** | Medido: `User.name` é `String?` no schema e o aceite de convite não exige nome. Um `?? 'Alguém'` aqui seria **texto de interface no servidor**, que o `CLAUDE.md` proíbe — e em inglês ou português? A tela decide, com `t()`. |
| D | Leitura **não exige papel**: todo membro ativo lê a lista | É atribuição, não administração. O ADR 0002 já diz que dentro do clube tudo é visível; o nome de quem escreveu é o mínimo disso. |
| E | Ordem: `name` crescente com **nulos no fim**, desempate por `userId`; comparação por **code point**, não `localeCompare` | Escolher locale no backend exigiria decidir **de quem** (do clube? de quem lê?), e a lista tem 2–10 pessoas — a tela pode reordenar. ⚠️ E o fixture da ordem se escolhe para a implementação **errada falhar**: na Tarefa 16 a ordem alfabética **coincidiu** com a da API (o espaço precede o `s`) e o teste não provava nada (§7.8). |
| F | `findByClub` no port + **um `byId` por membro** (laço), sem `byIds` novo | É o precedente **exato** do `getMe`, que faz `clubs.byId` por membership. 2–10 pessoas ⇒ ~11 consultas, barato. **Registrado**: se um clube passar de dezenas, o `byIds` é a saída, e aí ele nasce **com** chamador. |
| G | A rota mora em `club-routes.ts` | 64 linhas e uma rota hoje; `members` é sub-recurso de clube. |
| H | Sem `membershipId`, sem `joinedAt` na resposta | Nenhum chamador. Campo sem chamador é especulação, e a resposta é fronteira: cada campo declarado é um campo que sai. |

## Regras (o que os testes provam)

### O corte de tenant

1. ⚠️ O `assertMembership` roda **ANTES** de qualquer leitura: ator sem membership ativo recebe
   `NotAMemberError` (404) e **não gera nem uma consulta** — `findByClubCalls === 0`, **e** o
   lado positivo (`=== 1` no caminho feliz), senão um incremento apagado deixa todo `toBe(0)`
   passar por acidente (§7.3).
2. **Não exige papel:** `MEMBER`, `ADMIN` e `OWNER` recebem a lista — e o teste asserta **a
   saída real** (a lista com os nomes), nunca "não lançou" (§7.4).
3. Membership de **outro** clube nunca aparece na lista, nem quando o mesmo usuário é membro
   dos dois.
4. Membership **arquivado do próprio ator** continua sendo 404 (quem saiu do clube não lê mais
   nada) — é o corte da Tarefa 01 e ele não muda.

### O que a lista devolve

5. ⚠️ Devolve os memberships `ACTIVE` **e** `ARCHIVED`, cada um com o `status` correto
   (decisão A). Um teste com um membro que saiu prova que o **nome dele volta**.
6. `name` `null` atravessa como `null` — **nada** de fallback no backend (decisão C).
7. ⚠️ A resposta tem **exatamente** `userId`, `name`, `role`, `status` — e um teste prova que um
   campo extra presente no domínio **não sai** (é o §6.1: o serializer é que corta, e é isso que
   faz dele fronteira de segurança). **Nenhum e-mail**, nenhum `passwordHash`, nenhum
   `isSuperAdmin`.
8. Membership cujo usuário não existe é **ignorado**. ⚠️ É **inalcançável hoje** — a FK
   `Membership.userId → User.id` é `RESTRICT` (confirmado no catálogo na Tarefa 24) —, então a
   guarda é **defesa em profundidade e não tem acusador possível**. O docblock diz isso e
   aponta para onde a propriedade **é** garantida (a FK), como o §7.10 manda; não invente um
   fixture impossível para "cobri-la".

### A ordem

9. ⚠️ Nome crescente, **nulos no fim**, desempate por `userId`, e a ordem é do **UseCase** (o
   port não promete ordem; o fake enumera **invertido** — §7.2). O fixture é escolhido para a
   implementação errada **falhar**, e a precondição é **pinada** (`expect(ID_X < ID_Y)`), senão
   um id renomeado devolve a coincidência em silêncio.

### O repositório e a rota

10. `findByClub` devolve **todos** os memberships do clube, sem `orderBy` (o port não promete
    ordem) — com teste de **contrato** contra o Prisma real, incluindo um membro arquivado.
11. `GET /clubs/:clubId/members` → **200** com `response` schema declarado; **401** e **404**
    declarados. **Sem 400** (não há corpo nem query) e **sem 403** (leitura não exige papel) —
    declarar status que o handler não produz faz o OpenAPI mentir para a tela que o lê.
12. ⚠️ **Integração:** um membro de **outro clube** recebe **404**, e o teste pina que a mesma
    rota atende o ator legítimo com **200** (é a forma nova do §7.4 que a Tarefa 24 descobriu:
    o Fastify responde 404 para rota **inexistente**, então um teste de 404 sem precondição fica
    verde com a rota nem escrita).
13. Nenhuma classe de erro nova; `NOT_YET_MAPPED` continua **vazio**.
14. O fake de `Membership` cresce com `findByClub` + contador, e a suíte própria dele cresce
    junto.

## Arquivos a tocar

```
packages/shared/src/club.ts                                  + os schemas de membro
packages/shared/src/__tests__/                               crescer
packages/backend/src/usecases/ports/membership-repository.ts  + findByClub
packages/backend/src/usecases/_fakes/membership-repository-fake.ts        + findByClub e contador
packages/backend/src/usecases/_fakes/__tests__/membership-repository-fake.test.ts   crescer
packages/backend/src/usecases/list-club-members.ts           NOVO
packages/backend/src/usecases/__tests__/list-club-members.test.ts         NOVO
packages/backend/src/repositories/prisma-membership-repository.ts         + findByClub
packages/backend/src/repositories/__tests__/prisma-membership-repository.contract.integration.test.ts   crescer
packages/backend/src/routes/club-routes.ts                   + a rota
packages/backend/src/routes/__tests__/club-routes.integration.test.ts     crescer
```

**Não tocar:** `prisma/**` (**esta fatia NÃO muda o modelo** — o `Membership` já tem tudo:
`userId`, `clubId`, `role`, `status`; se você achar que precisa de migration, **pare e
reporte**) · `packages/ui/**` · `packages/app/**` · `src/domain/**` · qualquer coisa de
`Highlight` ou `Note`.

## Definição de pronto

- [x] O corte de tenant vem **antes** da consulta, com `findByClubCalls === 0` **e** o lado
      positivo (1).
- [x] `MEMBER` lê a lista, e o teste asserta a **saída real** (2).
- [x] ⚠️ O membro que **saiu** aparece, com `status: 'ARCHIVED'` e **com o nome** (5).
- [x] `name` `null` atravessa; **nenhum fallback** no backend (6).
- [x] ⚠️ A resposta tem **só** os quatro campos, provado com um campo extra no domínio que
      **não sai** (7).
- [x] A ordem tem fixture que faz a implementação errada **falhar**, com a precondição pinada
      (9).
- [x] Teste de **contrato** do `findByClub`, com membro arquivado (10).
- [x] ⚠️ **404 para membro de outro clube, com a precondição de que a rota atende quem pode**
      (12).
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos, contagens coladas.
- [x] `pnpm -r test:integration` rodado (esta fatia toca repositório e rota), com a contagem e
      o baseline de **359** declarados, e a **prova por consulta** de que nenhum fixture
      sobrou.
- [x] `packages/ui` e `packages/app` **intocados**.
- [x] **Linhas de código coladas** dos arquivos novos.
- [x] Checklist marcada; a linha 26a do `BACKLOG.md` é do orquestrador.
