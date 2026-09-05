# ADR 0005 — Multi-clube via `Membership` desde a primeira migration

- Status: aceito
- Data: set/2026
- Fase: MVP 1 (Bloco A — Clube, convite e sessão)

## Contexto

O uso imediato é **um** clube, de duas pessoas. O dono já disse que quer poder adicionar mais
gente e, eventualmente, criar outros clubes. A pergunta é quando pagar por isso: agora, ou
quando a necessidade aparecer.

O projeto que serviu de referência nasceu single-user com o banco "preparado para
multiusuário" (todo modelo com `userId`), e essa decisão se provou certa — o custo foi baixo
e nunca houve refactor. Aqui o eixo é o clube, não o usuário, e há um eixo a mais: a mesma
pessoa pode estar em vários clubes.

## Decisão

O modelo `user × club × role` nasce na **primeira migration**:

```
Membership { userId, clubId, role: OWNER|ADMIN|MEMBER, status, joinedAt }
  @@unique([userId, clubId])
```

Consequências que valem desde a Tarefa 01:

- **Todo modelo de conteúdo carrega `clubId`** (`Book`, `Note`, `Highlight`, `ActivityEvent`).
- **Toda leitura confere `Membership` ativo** do `req.user.sub` no `clubId` pedido. Sem
  membership → **404**.
- Existe o conceito de **clube ativo** na interface (seletor no topo, guardado localmente —
  não é estado de servidor).
- Papel de **plataforma** (`User.isSuperAdmin`) é separado de papel de **clube**
  (`Membership.role`). Criar clube e criar pessoa é plataforma; cadastrar livro e convidar é
  clube.
- Toda rota de conteúdo tem um **teste de integração de tenant**: um membro de outro clube
  recebe 404. Isso não é opcional — é a única barreira entre dois clubes.

Não existe, em nenhum momento, a versão "um clube só".

## Alternativas consideradas

- **Um clube por usuário (sem `Membership`).** O `User` teria um `clubId` direto. Menos uma
  tabela, menos um join, sem seletor de clube, sem escopo de clube em toda query. É
  genuinamente mais simples **hoje**. Mas migrar depois significa: nova tabela, backfill,
  reescrever toda query de leitura, toda rota, adicionar o seletor e revisar cada tela — um
  refactor que toca praticamente todo o código, feito num momento em que já existe dado de
  produção que importa (as anotações de meses de leitura). O custo de fazer agora é uma
  tabela e um guard; o custo de fazer depois é o projeto inteiro.
- **Sem clube nenhum: só um grupo implícito global.** O app serviria um clube só, para
  sempre. Descartado pelo pedido explícito do dono de criar outros grupos.
- **Multi-clube com hierarquia (clube → subgrupos).** Mais poder, e nada pede isso. Um nível
  só, e `Membership` não aninha.

## Consequências

- (+) Adicionar pessoas e abrir um segundo clube é **cadastro, não desenvolvimento**.
- (+) O escopo de tenant fica explícito e uniforme em todas as camadas desde o primeiro dia —
  é mais fácil acertar sempre do que retrofitar depois.
- (+) Papéis resolvem de graça o que senão seria condicional espalhado: quem cadastra livro,
  quem convida.
- (−) Toda query de conteúdo carrega o filtro de clube, e toda rota carrega o guard. Uma
  linha a mais em cada lugar — mitigado por um único helper `assertMembership` (Tarefa 01),
  usado por todos.
- (−) A interface precisa de um seletor de clube desde o MVP 1, mesmo com um clube só. Com um
  clube ele fica discreto (o nome no topo, sem menu).
- (−) 404 em vez de 403 é menos informativo ao depurar. Aceito de propósito: não confirmamos
  a existência de recurso de outro clube.
