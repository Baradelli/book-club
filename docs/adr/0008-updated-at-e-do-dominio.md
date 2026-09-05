# ADR 0008 — `updatedAt` é do domínio: o `Note` nasce **sem** `@updatedAt`

- Status: aceito
- Data: set/2026
- Fase: MVP 1 (Bloco C — Anotações)
- Emenda: `docs/plano-clube-do-livro.md` §6, que declara `updatedAt DateTime @updatedAt` no
  modelo `Note`

## Contexto

O `Note` é a primeira entidade do projeto com `updatedAt` — nenhum dos cinco modelos que já
existem no banco tem a coluna (`grep -n updatedAt packages/backend/prisma/schema.prisma` volta
vazio). O esqueleto Prisma do §6 do plano de produto declara:

```prisma
updatedAt DateTime @updatedAt
```

A Tarefa 09 (`editNote`/`archiveNote`) tropeçou nisso. O executor decidiu que `archiveNote`
**não** mexe em `updatedAt`, por leitura literal da spec e "seguindo o precedente do
`archiveBook`". A auditoria por teste de mutação mostrou duas coisas:

1. **O precedente não existe.** O `Book` não tem `updatedAt`; o `archiveBook` é precedente
   para "não regravar `archivedAt`", que é outra propriedade.
2. **A decisão era comentário, não comportamento.** O mutante que *acrescenta*
   `updatedAt: new Date()` ao patch do `archiveNote` sobreviveu aos 814 testes. Nenhum teste
   olhava o campo.

E o problema de fundo: `@updatedAt` do Prisma **bombeia a coluna em todo `UPDATE`**, ignorando
o que o domínio mandou. Com o §6 como está:

- o `archiveNote` devolveria um `updatedAt` antigo enquanto o banco grava "agora" — o domínio
  mentindo sobre o que gravou;
- o `updatedAt: new Date()` do `editNote` seria redundante no melhor caso e silenciosamente
  descartado no pior (varia por versão do Prisma);
- **fake e Postgres divergiriam** — a classe de bug do ADR 0007, que já mordeu este projeto
  duas vezes.

## Decisão

**O `Note` nasce sem `@updatedAt`. O domínio atribui `updatedAt`, como já atribui
`createdAt`.**

```prisma
updatedAt DateTime          // era @updatedAt
```

E, como consequência direta, **`archiveNote` passa a escrever `updatedAt`**: `updatedAt`
significa "quando esta linha mudou pela última vez", e arquivar muda a linha. Qualquer outra
leitura exigiria um segundo conceito ("última edição de conteúdo") que ninguém pediu.

## O argumento que decide: `@default(now())` é queda de braço que nunca acontece, `@updatedAt` é

Os cinco modelos existentes declaram `createdAt DateTime @default(now())` — **e o domínio
sempre fornece o valor**. Ou seja, o `@default` é um **fallback que nunca dispara**: quem
manda no `createdAt` é o UseCase, e o atributo do Prisma é só uma rede caso alguém insira uma
linha por fora.

`@updatedAt` **não** é da mesma família. Não é fallback: é **override**, e dispara sempre.
Adotá-lo criaria, só nesta coluna e só nesta tabela, um dono diferente do de todas as outras
colunas de instante do projeto (`createdAt`, `archivedAt`, `joinedAt`, `usedAt` — todas do
domínio).

Então isto não é um padrão novo: é o padrão que o `createdAt` já usa, aplicado à coluna irmã.

## Alternativas consideradas

- **Manter `@updatedAt` e o domínio parar de escrever o campo** (a recomendação da auditoria).
  É defensável, e o argumento a favor é forte: `@updatedAt` não pode ser burlado, então toda
  escrita futura ganha a coluna de graça, e tirar o atributo significa que a primeira escrita
  que esquecer de setá-lo grava a época. Descartada por dois motivos:
  (a) o **fake teria de emular** o bombeamento — e cada semântica que este projeto pediu ao
  fake para emular virou fonte de bug (ADR 0007, e o `unique(planItemId, userId)` da Tarefa
  08); (b) o domínio continuaria **construindo** um `updatedAt` (o tipo `Note` o exige e o
  fake o guarda) que o banco descartaria — um campo escrito e ignorado é pior que um campo com
  dono claro. O risco do esquecimento é real mas contido: o `CLAUDE.md` já proíbe acesso a
  banco fora de um Repository, e cada repositório tem teste de contrato.
- **Manter os dois** — `@updatedAt` no schema e o domínio escrevendo. Duas fontes para a mesma
  verdade, e a do banco ganha sem avisar. É exatamente o estado que este ADR existe para
  encerrar.
- **`archiveNote` não mexer em `updatedAt`** (o que a Tarefa 09 entregou). Exigiria que
  `updatedAt` significasse "última edição de **conteúdo**", e aí arquivar precisaria de uma
  terceira coluna para "última mudança de linha". Complexidade sem caso de uso.

## Consequências

- (+) Uma fonte só para todo instante do projeto: o domínio. Nenhuma exceção por coluna.
- (+) O fake não emula nada: guarda o que o domínio deu. Zero superfície de divergência.
- (+) "Arquivar não move `updatedAt`" deixa de ser uma afirmação indecidível no teste
  unitário — a propriedade passa a ser decidível onde a decisão mora.
- (+) Quando existir o **port de clock** (dívida já registrada: `archiveBook`, `dayRange`,
  lembretes), ele controla `updatedAt` também. Com `@updatedAt` essa seria a única coluna
  fora do alcance de um teste determinístico.
- (−) Toda escrita nova tem de setar `updatedAt`. Mitigação: o `toUpdateData` do
  `PrismaNoteRepository` mapeia o campo, e o teste de contrato da Tarefa 11 prova o
  round-trip ("o que o domínio escreveu é o que volta") — **não** "o banco bombeia".
- (−) Divergência registrada com o §6 do plano de produto. Este ADR é a emenda; o §6 não foi
  reescrito.

## Para a Tarefa 11

1. O `schema.prisma` declara `updatedAt DateTime`, **sem** `@updatedAt`.
2. O `PrismaNoteRepository.toUpdateData` **mapeia `updatedAt`** e **nunca mapeia `id`** — um
   `id` que chegasse no patch trocaria a chave primária de verdade no Postgres, enquanto o
   fake o descarta. Sem essa regra o fake fica mais indulgente que o banco.
3. O teste de contrato prova: (a) o `updatedAt` que o domínio escreveu é o que volta do banco,
   com precisão de milissegundo; (b) um patch com `id` não troca a chave.
