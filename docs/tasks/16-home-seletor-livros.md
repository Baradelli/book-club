# Tarefa 16 — Home: seletor de clube, estante e a leitura de hoje

> A tela que abre o app. É aqui que o **clube ativo** deixa de ser um termo do glossário e
> passa a existir, e é aqui que o princípio anti-culpa é testado pela primeira vez.
>
> Leia antes: `CLAUDE.md`, **`docs/plano-clube-do-livro.md` §1** (os princípios são requisito),
> `CONTEXT.md` (as entradas **Clube ativo** e **Leitura de hoje**),
> `docs/CONVENCOES-CODIGO.md` (**§7.4, §7.6.1**) e `docs/tasks/15-telas-login-convite.md`.

## Objetivo

Eu abro o app e vejo: em qual clube estou, o que o clube está lendo, e — se hoje tem trecho —
um atalho de um toque para escrever a anotação de hoje.

## Decisões já tomadas (não reabrir)

- **Clube ativo é estado LOCAL, não de servidor** (`CONTEXT.md`). Nada o envia para a API; o
  tenant de cada request vem do JWT e do `clubId` na URL.
- **Leitura de hoje é CALCULADA, nunca guardada** (`CONTEXT.md`).
- **Princípio anti-culpa** (`plano` §1): o sistema **não pune ausência de registro**. Nada de
  "você está atrasado", contador de dívida, badge de pendência ou vermelho de atraso.
- **Incentivo por presença, não por comparação**: nada de ranking nem placar.
- Ordem da estante: **do mês mais recente para o mais antigo** — é regra de produto e já vive
  no `listBooks`. ⚠️ **Corrigido na rodada de correção:** esta linha dizia "mês corrente
  primeiro", e isso é **falso**. O `listBooks` ordena `month` **descendente**, então um livro
  de mês **futuro** (o do mês que vem, cadastrado adiantado) vem na frente do corrente. Quem
  precisa de "o livro de agora" descarta os futuros **no consumidor** — e é o que a home faz.
  A frase errada era a origem do bug do atalho que desaparecia.
- Nenhum texto solto; `t()` tipado.

## ⚠️ Duas coisas que a leitura do código revelou

### 1. O fuso do usuário **não chega ao front** — e a regra do `CLAUDE.md` não é cumprível hoje

O `CLAUDE.md` diz: *"Que dia é hoje SEMPRE se calcula no `timezone` do Settings, nunca na hora
do servidor."* Medido: o `/me` devolve `clubs: [{id, name, role}]` — **sem `timezone`** —, o
`Settings` não tem rota (é Tarefa 36/46), e **não existe `GET /clubs/:clubId`**. O front não
tem de onde tirar o fuso.

**Resolução, e ela é mais que um contorno:** o front usa o fuso do **navegador**
(`Intl.DateTimeFormat().resolvedOptions().timeZone`).

O propósito da regra é *"nunca a hora do servidor"* — e no front **o fuso do navegador É o fuso
de quem está olhando a tela**, que é exatamente o que "que dia é hoje para mim" significa. A
regra morde de verdade no **backend**, onde não há navegador: é lá que o lembrete da Tarefa 37
precisa do `Settings.timezone`, porque o servidor não pode adivinhar.

**Registrado:** quando o `Settings` for exposto (Tarefa 36/46), uma escolha explícita da pessoa
passa a **vencer** o navegador — e aí vira o caso de quem viaja e quer continuar no fuso de
casa. Até então, navegador.

### 2. O primeiro login do projeto cai no estado vazio — e é o que o dono vai ver

O seed cria `admin@clube.local` com `isSuperAdmin: true` e **zero memberships**. Então a
**primeira** abertura do app, na **primeira** vez que o dono entra, tem `clubs: []`.

Se a home quebrar, mostrar branco ou estourar num `clubs[0]`, é a primeira impressão do
projeto inteiro. O estado vazio de "nenhum clube" não é um caso de borda aqui: **é o caminho
que acontece primeiro.** E ele precisa dizer o que fazer (criar clube é super-admin, Tarefa 42
— então a mensagem aponta para isso, sem prometer botão que não existe).

## O que a home precisa buscar, e o custo

Não existe endpoint de "leitura de hoje". Para o atalho, a sequência é:

1. `/me` → os clubes (já vem do `AuthProvider`).
2. `GET /clubs/:clubId/books` → a estante, **do mês mais recente para o mais antigo**
   (e o mais recente pode ser um mês **futuro** — ver as decisões acima).
3. `GET /books/:bookId` do primeiro livro **não futuro** → `planItems`, e procura o item cuja
   `date` é o dia de hoje. Se ele **não** tem item de hoje, o **próximo** da lista — e para aí.

⚠️ **Corrigido na rodada de correção.** A versão anterior pedia o plano de `books[0]`, e era
bug de produto vivo: com a estante `[out/2026, set/2026]` e hoje `2026-09-04`, a home pedia o
plano de **outubro** e o atalho **desaparecia**. E "o primeiro não futuro" sozinho ainda erra em
três casos medidos — plano de setembro que se estende até outubro, dois livros no mesmo mês, e
livro do mês corrente sem plano mascarando um anterior que cobre hoje —, nos três com o item de
hoje no **segundo**. Daí a segunda requisição condicional.

São **duas** requisições depois do `/me` no pior caso, e uma no caso comum — não a de todos.
**Registrado como dívida:** um `GET /clubs/:clubId/today` resolveria em uma, e é backend
(fechado). Para dois livros e trinta dias, duas requisições estão bem.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | **Clube ativo em `localStorage` + contexto**, semeado pelo `clubId` do aceite | É a pendência que a Tarefa 15 registrou: quem acabou de aceitar um convite não deve ter de escolher o clube em que acabou de entrar. |
| B | **Clube guardado que não está mais em `/me` cai para o primeiro** | O membership pode ter sido arquivado (MVP 4). Manter o id morto deixaria a home pedindo livros de um clube que responde 404 — tela quebrada por dado velho no `localStorage`. |
| C | O atalho aparece **só** quando existe item do plano com a data de hoje | Um atalho que abre "nada" é pior que a ausência dele. E é o anti-culpa: **sem trecho hoje, a home não cobra nada** — nem "você está atrasado", nem "faltam 3 dias". |
| D | `localDay` nasce em `shared/src/local-day.ts` | O `CLAUDE.md` promete esse arquivo e ele **nunca foi criado**. É puro, testável sem DOM (`Intl` está no lib `ES2022`), e a Tarefa 18 vai precisar do mesmo cálculo. |
| E | A home busca o plano de **até dois** livros: o primeiro **não futuro** e, só se ele não tem item de hoje, o seguinte | Buscar o plano de todos para achar "hoje" seria N requisições para um atalho. (Escrito originalmente como "só do primeiro livro" — e era o bug: `books[0]` pode ser um livro de mês **futuro**.) |
| F | Seletor de clube só aparece com **2+ clubes** | Com um clube, um seletor de um item é ruído. O nome do clube continua visível. |
| G | Sem contagem de anotações por pessoa na home | É `writers` do `GET /books/:bookId`, e é a tela do livro (Tarefa 17). Na home viraria placar — proibido pelo §1. |

## Regras (o que os testes provam)

### `localDay` — `packages/shared/src/local-day.ts`

1. Devolve `"YYYY-MM-DD"` do instante dado, no fuso dado.
2. **Usa `Intl`, nunca `getFullYear`/`getMonth`/`getDate`** — é a mesma lição que o
   `calendar-day-mapper` do backend aprendeu por teste de mutação, e o guard de ESLint dele
   cobre só `packages/backend`.
3. Atravessa a meia-noite certo nos dois sentidos: um instante UTC que já é "amanhã" em
   `Asia/Tokyo` e ainda é "ontem" em `America/Sao_Paulo`.
4. **Fuso inválido não estoura** — cai no fuso de fallback, que por padrão é o do navegador
   (um `Settings.timezone` corrompido não pode derrubar a home). O fuso de fallback é
   **parâmetro**, e é o que torna a regra decidível: com ele fixo no código, o mutante que o
   troca por `'UTC'` sobrevivia, porque o teste calculava o esperado com a mesma função.
   ⚠️ Registrado: o `Intl` **aceita** `'+03:00'` e **recusa** `'UTC+3'` — quem validar
   `Settings.timezone` (Tarefa 36/46) não pode supor "tem sinal ⇒ inválido".
5. O resultado é `"YYYY-MM-DD"` e, **para todo instante da faixa 1583..9999**, um `CalendarDay`
   que o `isCalendarDay` aceita — reusa o `isCalendarDay` que já existe em `shared`.
   ⚠️ **Redação corrigida na rodada de correção:** a versão anterior dizia "o resultado é um
   `CalendarDay` válido", e o **tipo não promete isso** — `CalendarDay` é alias puro
   (`type CalendarDay = string`), sem marca. Fora da faixa a função devolve string
   sintaticamente bem-formada que o `isCalendarDay` recusa, e dois casos foram medidos: ano
   999 → `"0999-01-05"` (recusado, o mínimo é 1583) e `new Date(-8.64e15)` →
   `"271822-04-20"`, **com o sinal perdido** (o `Intl` formata a era à parte, e o helper não a
   lê — um ano BCE viraria um ano futuro). Nenhum dos dois é alcançável por `new Date()` num
   navegador; ficam registrados para quem reusar a função com instante vindo de fora.

### Clube ativo

6. Persiste entre recarregamentos; **storage que estoura não derruba o app** (a lição da
   Tarefa 12: `getItem`/`setItem`/`removeItem` que lançam).
7. Semeado pelo `clubId` do aceite quando ele existe.
8. Sem nada guardado, o **primeiro** clube de `/me`.
9. **Id guardado que não está mais em `/me`** → cai para o primeiro, e o valor morto é limpo.
10. Trocar de clube troca a estante (nova requisição, com o `clubId` novo).
11. **Nada envia o clube ativo para a API** — teste que varre os corpos das requisições.

### A home

12. **`clubs: []` → estado vazio útil, sem crash.** É o primeiro login do projeto (⚠️ 2).
13. Lista os livros do clube ativo na ordem que a API devolve (mês mais recente primeiro) — a tela
    **não** reordena.
14. Zero livros → estado vazio próprio, diferente do de zero clubes.
15. O atalho da leitura de hoje aparece **só** quando existe item com a data de hoje, e leva
    para a rota da anotação do dia.
16. **Sem item hoje, a home não cobra nada.** Teste que varre o DOM (texto **e** atributos)
    por cobrança: "atrasad", "pendente", "faltam", "dívida", "você não", e por uso de
    `text-danger`/`bg-danger`. É o princípio anti-culpa virando guarda automática, como o
    ADR 0002 virou no `FilterChip`.
17. 404 na estante (membership sumiu entre o `/me` e a listagem) → estado tratado, não tela
    branca.
18. Falha de rede → mensagem de rede **com ação de repetir**, e a repetição refaz a
    requisição.

### Erro, i18n e bundle

19. **Nenhuma string da API na tela** — texto **e atributos** (`title`, `aria-label`,
    `placeholder`, `alt`, `value`). É o furo que a Tarefa 15 mediu: `aria-label` é o que o
    leitor de tela fala.
20. Chaves novas em **`pt` e `en`**.
21. **O bundle continua sem TipTap.** A `bundle-guard` já existe; ela tem de continuar verde
    com a home real.

### O que **não** se testa

Aparência, ordem visual dos cartões, snapshot. O `List`, o `Button` e o `PersonAvatar` têm
cobertura própria na Tarefa 13.

## ⚠️ A armadilha de fixture que esta fatia herda

O `docs/CONVENCOES-CODIGO.md` **§7.6.1** nasceu na rodada da Tarefa 15: *"fixture que o
framework não interpreta é fixture que anula o teste"*. O caso concreto: `initialEntries` com
`{ pathname: '/x?a=1#b' }` — o react-router **não parseia** o campo, `search` e `hash` ficam
vazios, e o mutante que os joga fora passa.

O `harness.tsx` foi consertado com `parsePath`. **Esta fatia é a primeira que usa rota com
parâmetro de verdade** (`/clubs/:clubId/...` nas requisições, e a rota da anotação no atalho) —
confira que o harness continua parseando, e que **nenhum fixture novo** entrega URL como campo.

## Arquivos a tocar

```
packages/shared/src/local-day.ts              NOVO (decisão D) + __tests__ (regras 1–5)
packages/shared/src/index.ts                  exportar
packages/shared/src/locales/{pt,en}.ts        as chaves da home
packages/app/src/club/active-club.tsx         NOVO — contexto + persistência (regras 6–11)
packages/app/src/club/__tests__/
packages/app/src/pages/home.tsx               a tela de verdade (hoje é placeholder)
packages/app/src/pages/__tests__/home.test.tsx
packages/app/src/pages/accept-invite.tsx      semear o clube ativo com o `clubId` (regra 7)
packages/app/src/router.tsx                   a rota da anotação do dia (placeholder p/ 18)
packages/app/src/App.tsx                      o seletor no cabeçalho (regra 6/F)
```

**Não tocar:**

- `packages/backend/**` e `prisma/` — suíte em **949 / 262**. **Não** crie
  `GET /clubs/:clubId/today` nem exponha `timezone` no `/me` (as duas lacunas estão
  registradas).
- `packages/ui/**` — design system e editor fechados. Se faltar componente, **pare e
  reporte**.
- `packages/shared/src/client/**` — compõe, não altera.
- `packages/app/src/{i18n,theme,env}.ts` e `auth/require-auth.tsx` — fechados.
- A tela de login e a de aceite, **exceto** a linha que semeia o clube ativo no aceite.

## Fora de escopo

- **Tela do livro** (plano, quem escreveu, abas) → Tarefa 17.
- **Tela da anotação do dia** e autosave → Tarefa 18. O atalho aponta para a rota; a tela é
  placeholder.
- Criar clube / convidar pela interface → MVP 4.
- `writers`, progresso, contagem por pessoa (decisão G).
- Fuso vindo do `Settings` (⚠️ 1) e `GET /clubs/:clubId/today`.
- Offline e cache → Tarefa 21.

## Definição de pronto

- [x] `localDay` com as regras 1–5, incluindo **os dois sentidos da meia-noite** (3) e **fuso
      inválido sem estourar** (4). `packages/shared/src/local-day.ts` + **19** testes. ⚠️ A
      fixture original da regra 3 estava aritmeticamente errada (Tóquio +9 e São Paulo −3
      distam 12h: **nenhum instante** é "já amanhã" num e "ainda ontem" no outro) — são
      **dois** instantes, 16:00Z e 02:00Z, e a conta está escrita no arquivo.
      ⚠️ **Rodada de correção:** eram 12 testes e **4 de 5 mutantes sobreviviam**. Os quatro
      estão mortos agora: `FORMAT_LOCALE = undefined` (o ano budista de `th-TH`, que o
      `isCalendarDay` ACEITA — o atalho desapareceria em silêncio), o fallback fixo em
      `'UTC'` (o fuso de fallback virou **parâmetro**, e o padrão é provado mexendo em
      `process.env.TZ`), o `padStart` do ano, e o `'2-digit'` de mês/dia — os dois `padStart`
      de mês/dia eram **código morto que mascarava a mutação** e saíram.
- [x] Clube ativo com as regras 6–11; em especial **id morto cai para o primeiro** (9) e
      **nada o envia para a API** (11) — a varredura cobre corpo, query **e** header.
      `packages/app/src/club/active-club.tsx` + **13** testes. ⚠️ **Rodada de correção:** o
      `try` do `removeItem` não era exercitado por teste nenhum (o armazenamento hostil lança
      no `getItem`, então nunca havia id morto para limpar) — ganhou a combinação real, **id
      guardado morto E `removeItem` bloqueado**. E o fixture de ordem dos clubes não
      discriminava: `'Clube do Casal' < 'Clube dos Amigos'` no `sort()` cru **e** no
      `localeCompare(_, 'pt')`, então o mutante que ordena por `name` sobrevivia; o segundo
      clube virou `'Amigos do Livro'` e a precondição está pinada (§7.2).
- [x] **`clubs: []` não quebra a home** (12) — é o primeiro login do projeto. E é o fixture
      **padrão** do `meReply()` do harness, para o caminho que acontece primeiro não depender
      de alguém se lembrar dele.
- [x] **A home não cobra nada quando não há trecho hoje** (16), com a varredura de texto **e**
      atributos (`readableText()`), mais a varredura de vermelho por **regex** nas classes e
      nos `style` do DOM e no código-fonte da tela. Chamada em **todos** os estados desta
      suíte, inclusive no estado **com atalho**.
      ⚠️ **Rodada de correção — a varredura era em boa parte teatral, e 3 de 4 cobranças
      plantadas sobreviveram.** Três defeitos, três consertos:
      **(a) vocabulário** — "deixou 3 dias para trás" e "em atrazo" (com erro de digitação)
      estavam fora da lista de sete termos; o vocabulário é propriedade **do catálogo** e
      virou `packages/shared/src/locales/__tests__/anti-guilt.test.ts`, que percorre `pt`
      **e** `en` inteiros (todo teste de tela pina `pt`, então um "You're 3 days behind"
      embarcava sem um vermelho);
      **(b) cor** — a varredura conhecia duas strings literais, e `text-[#b3261e]` ou um
      `style` com `--clube-danger` passavam em 192 testes; virou regex sobre `class` **e**
      `style`;
      **(c) estado** — 6 de 13 estados eram varridos, e o estado **com atalho** não era
      nenhum deles: é exatamente onde um "você deixou 3 dias para trás" nasce, ao lado da
      leitura de hoje.
      E o teste `has no danger colour anywhere on the home, in ANY state` foi **renomeado**:
      ele lê o arquivo-fonte e não renderiza estado nenhum, e o nome prometia o que ele não
      entregava.
- [x] Nenhuma string da API na tela, atributos incluídos (19) — provado no 400, no 404 e no
      500 do plano.
- [x] `bundle-guard` verde com a home real (21): **350.715 B** de JS (teto 450.000), **0**
      marcas de TipTap/ProseMirror nos `.js`. ⚠️ **Registrado, não consertado:** a
      `bundle-guard` vai **colidir com a Tarefa 18** — ela soma TODOS os `.js` contra 450.000
      e exige zero marcas em QUALQUER asset, e as duas asserções são impossíveis na 18 mesmo
      com o editor num chunk `lazy()`. Ela precisa virar **por chunk**; o formato está escrito
      no docblock dela, porque é o próximo lugar onde alguém vai relaxar o teste.
- [x] Nenhum fixture entrega URL como campo (§7.6.1) — os dois únicos `initialEntries` de
      objeto passam por `parsePath`; os caminhos novos são string.
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos, contagens coladas no relatório.
- [x] Backend em **949 / 262** — verificado. ⚠️ **Rodada de correção:** `packages/backend/**`
      teve **um comentário** corrigido (`usecases/list-books.ts`: o docblock do
      `compareByMonthDesc` dizia "mês corrente primeiro", e o código ordena `month`
      DESCENDENTE — a frase errada foi a origem do bug do atalho). Nenhuma linha de código,
      nenhum teste. `prisma/` e `packages/shared/src/client/**` intocados; `packages/ui/**`
      foi reaberto **com autorização** para o `renderLink` do `ListItem` (ver abaixo).
- [x] ⚠️ **Rodada de correção — o `ListItem` com `href` recarregava o PWA.** `list.tsx`
      renderizava `<a href>` cru, que é navegação de DOCUMENTO: num PWA com react-router ela
      recarrega o shell inteiro e perde o estado em memória. A recomendação que esta fatia
      deixou para a Tarefa 17 (`onClick` + `useNavigate`) trocava um defeito por outro —
      perde Ctrl+clique e "abrir em nova aba". O conserto é **inversão**: um `renderLink` no
      `ListItem` para o CONSUMIDOR passar o `Link` do roteador (`packages/ui` não pode
      importar `react-router-dom`, é peer, e um design system não conhece o roteador). Com
      teste, e `packages/ui` em **175** testes. A estante da home **não** foi ligada ao
      mecanismo: a tela do livro é a Tarefa 17.
- [x] ⚠️ **Rodada de correção — a corrida de troca de clube estava certa e invisível.**
      Remover as duas linhas `if (cancelled) return` do efeito da estante passava nos 192
      testes. Agora há teste: resposta do clube A pendurada → troca para B → B na tela → A
      volta, e a estante do clube novo **não** é substituída. O mecanismo continua sendo a
      flag `cancelled` e **não** `AbortController`, porque o `stubFetch` do harness ignora
      `init.signal` — um teste de aborto seria falso verde. As duas infidelidades do harness
      (o `signal` ignorado e o `homeResponder` casando `/books/` para qualquer id) estão
      registradas nos docblocks; a segunda ganhou o `bookRepliesById`.
- [x] ⚠️ **Rodada de correção — `require-auth.test.tsx` fazia 16 requisições de rede REAIS.**
      O `ActiveClubProvider` do `renderAt` dispara `GET https://api.teste/me`, e o arquivo
      nunca stubava `fetch` (medido: 16 dos 33 testes, um `/me` cada). Hoje rejeitariam por
      DNS e o `.catch` do provider as absorve — mas o arquivo passou a depender do ambiente de
      rede, e `.teste` **não** é TLD reservado (o reservado é `.test`). Ganhou
      `stubFetch(alwaysReply(meReply()))` num `beforeEach`.
- [x] ⚠️ **Rodada de correção — o mutante do "primeiro frame" É decidível.** O comentário
      afirmava que prová-lo exigia "navegador de verdade, não jsdom": **falso**.
      `renderToString` não roda efeito nenhum, ou seja, é literalmente o frame que o `act()`
      descarta e o navegador pinta. Com as duas defesas fora (o provider nascer em
      `'loading'` e o `status !== 'ready'` da home), o SSR mostra "Seu clube aparece aqui";
      com qualquer uma delas, verde. Virou teste, e a frase errada saiu.
- [x] ⚠️ **Rodada de correção — dois furos pequenos de fixture.** Os NOMES dos parâmetros da
      rota do atalho não eram provados (trocar `/books/:bookId/days/:planItemId` por
      `/books/:planItemId/days/:bookId` sobrevivia, porque o placeholder nunca chamava
      `useParams`) — o `DayNotePage` passou a renderizar os dois, e a Tarefa 18 herda o
      contrato provado. E o `aPlanItem()` do harness tinha `date: '2026-09-04'`, **a data de
      hoje** — bomba de tempo: um teste futuro escrito com a fábrica sem sobrescrever `date`
      mostraria atalho hoje e nenhum amanhã. O `date` e o `month` das duas fábricas viraram
      valores notoriamente passados, e quem testa a fronteira do mês DERIVA de hoje.
- [ ] ⚠️ **Registrado e NÃO consertado:** o mutante que calcula `today` em `'UTC'` em vez do
      fuso do ambiente (`H3`) continua vivo na home, e é **indecidível por construção** no
      lugar onde ele mora: em jsdom o fuso do processo é o do teste, e "hoje em UTC" e "hoje
      no fuso local" só divergem em certas horas do dia — um teste disso seria verde ou
      vermelho conforme a hora em que a suíte roda. A propriedade é provada onde ela É
      decidível, no unitário de `localDay` (`packages/shared`), que exige dois fusos e dois
      dias diferentes. E o que se perdeu na troca do `toHaveLength(1)` pelo `requestsTo`
      (a propriedade "a tela não dispara mais nada") está registrado no docblock do
      `requestsTo`: risco baixo, sobrevive só no caminho anônimo.
- [ ] Checklist marcada e linha 16 do `BACKLOG.md` fechada. _(o `BACKLOG.md` fica para o dono)_
