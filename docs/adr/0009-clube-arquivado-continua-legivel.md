# ADR 0009 — Clube arquivado sai do seletor, mas o acervo continua legível

- Status: aceito
- Data: set/2026
- Fase: MVP 1 (transversal)
- Decisão do dono, tomada depois de a pergunta ser levantada em **13 tarefas seguidas**

## Contexto

O `assertMembership` — o guard de tenant que **toda** leitura e **toda** escrita de conteúdo
atravessa — confere o status do **`Membership`**, e nunca o status do **`Club`**:

```ts
if (!membership || membership.status !== 'ACTIVE') throw new NotAMemberError(...);
```

Isso produz uma assimetria observável, que apareceu na Tarefa 06 e foi relevantada em cada
fatia seguinte: o `createBook` **recusa** um clube arquivado (ele carrega o clube e confere
`club.status`), enquanto o `listBooks`, o `getBookWithPlan`, o `listNotes` e todas as escritas
de anotação **funcionam** normalmente num clube arquivado, desde que o membership da pessoa
esteja ativo.

A pergunta, portanto: **arquivar um clube deve torná-lo invisível?**

Ela não bloqueou nenhuma fatia — o comportamento foi herdado sem mudança 13 vezes —, mas o
conjunto que a decisão atinge cresceu a cada uma: hoje são todas as leituras e escritas de
livro, plano e anotação.

## Decisão

**Arquivar um clube o remove do seletor. Não apaga o acervo, e não o torna ilegível para quem
era membro.** O comportamento atual está correto e **não** se conserta.

O `assertMembership` continua conferindo **só** o `Membership`. O status do `Club` **não** entra
no guard de tenant.

## Por quê

- **O que o clube escreveu é das pessoas, não do clube.** O ADR 0002 já decidiu que sair do
  clube arquiva o `Membership` e **não** apaga o que a pessoa escreveu. Tornar o acervo
  ilegível ao arquivar o clube contradiria isso pelo outro lado: as anotações continuariam
  existindo e ninguém poderia lê-las.
- **Arquivar é "acabou", não "nunca existiu".** Um clube que leu doze livros e parou é um
  arquivo, não um erro. O `status`/`archivedAt` do projeto é **soft delete de UI** — tirar da
  vista corrente —, e é essa a semântica em `Book` e em `Note` também.
- **O caso real é o oposto do medo.** O medo de "vazar" um clube arquivado não se aplica: só
  quem tem `Membership` **ativo** lê qualquer coisa. Não há acesso novo; há continuidade de
  acesso de quem já tinha.
- **A assimetria do `createBook` é a correta, e é intencional:** não se **acrescenta** conteúdo
  a um clube encerrado, mas o que já está lá continua legível. Escrever é ato presente; ler é
  memória.

## O que isso NÃO autoriza

- `Membership` arquivado continua sendo **404**. Quem saiu do clube não lê mais nada — é o
  corte de tenant da Tarefa 01, e ele não muda.
- O clube arquivado **sai** do seletor de clube ativo (Tarefa 16). Ele não é um destino de
  navegação; é alcançável por link direto de quem tem membership ativo.
- **Não** existe "desarquivar" no MVP 1. Arquivar clube pela interface é a Tarefa 45.

## Consequências

- (+) Nenhuma fatia precisa mudar. As ~10 leituras e ~4 escritas que herdaram o comportamento
  estão certas como estão.
- (+) O guard de tenant continua com **uma** condição (`Membership` ativo), que é o que o
  ADR 0002 chama de "menos superfície para vazamento".
- (−) A assimetria com o `createBook` fica **permanente**, e é a primeira coisa que alguém vai
  achar estranha ao ler o código. **É por isso que este ADR existe:** o comentário do
  `assertMembership` deve apontar para cá, para ninguém "consertar" o que é decisão.
- (−) Se um dia o produto quiser encerrar um clube **de verdade** (sem leitura), isso é feature
  nova, com nome próprio (`CLOSED`? `SEALED`?) e revisão de todas as queries — **não** uma
  reinterpretação de `ARCHIVED`.
