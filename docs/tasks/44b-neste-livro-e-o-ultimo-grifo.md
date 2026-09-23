# Tarefa 44b — "Neste livro" e "Último grifo": a margem ganha número, e o número é exato

> **Fatia extra do MVP 3.5, e a única do bloco que toca o backend.** Ela existe porque a
> Tarefa 44 **parou e perguntou** em vez de inventar um número, e o dono **abriu exceção
> ao fora-de-escopo** que o cabeçalho do MVP 3.5 declara para a seção inteira.
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** e a
> entrada **44b** · `docs/tasks/44-o-livro.md`, **a nota 2** — ⚠️ **é ela que explica por que
> esta fatia existe, e o que NÃO serve como atalho** · `docs/adr/0002-visibilidade-total-no-clube.md`
> · `docs/CONVENCOES-CODIGO.md` §7.1, §7.4, §7.8, §7.9.

---

## ⚠️ Por que esta fatia existe, e por que ela é backend

A Tarefa 44 entregou a tela do livro inteira, menos dois blocos da margem do desktop. O
executor parou, e a razão que ele deu foi medida e confirmada pelo revisor:

- **`GET /books/:bookId` não devolve contagem nenhuma.** `bookWithPlanResponseSchema` é
  `book` + `planItems` + `writers` + `readers` (`packages/shared/src/book.ts:239-244`).
- **As duas listagens truncam em 500.** `FIND_ROW_LIMIT = 500` em
  `packages/backend/src/repositories/prisma-note-repository.ts:35` (usado no `take` da
  linha 247) e em `prisma-highlight-repository.ts:53` (linha 297).

E a frase que fechou a decisão, do executor da 44:

> **Lista truncada é registro; contagem truncada é mentira.**

⚠️ **O atalho que parece existir e está errado.** O revisor mediu: `Note` tem
`@@unique([planItemId, userId])`, então somar os `writers[].userIds` que a rota **já**
devolve daria a contagem exata das notas **do plano** — sem uma linha de backend. Mas ela
**cegaria as anotações avulsas** (`planItemId` é nullable e não tem unicidade, logo são
ilimitadas), e o grifo não tem overlay nenhum. Havia um número *quase* certo à mão, e ele
estaria **errado**. Não o use.

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | ⚠️⚠️ **As contagens entram no `getBookWithPlan`. NÃO se cria rota de contagem, e NÃO se põe envelope nas listagens.** | **O argumento já está escrito no arquivo**, e esta é a terceira vez que ele se aplica: `packages/backend/src/usecases/get-book-with-plan.ts:56-67` diz que *"uma abertura de livro é UM corte de tenant, não três"*, e registra que a `GET /books/:bookId/writers` gêmea **nunca teve cliente**. O `writers` entrou assim na Tarefa 11, o `readers` na Tarefa 32. As contagens são a terceira |
| **B** | **Dois métodos estreitos nos ports, não um `find` seguido de `length`** | É o desenho que `note-repository.ts:119` (`planItemWritersByBook`) já usa, e o docblock dele diz o porquê: *"carregar as ~60 notas de um livro inteiras — com o `doc`, a maior coluna da tabela — para desenhar bolinhas de autoria é trafegar o acervo do clube"*. Contar 500 linhas para mostrar "18" é o mesmo defeito, e ainda por cima **erra acima de 500** |
| **C** | ⚠️ **A contagem é `count()` no banco, e conta só `ACTIVE`** | Soft delete é `status` + `archivedAt` (`CLAUDE.md`). Um arquivado somado ao inventário é a mesma mentira, só menor. ⚠️ **Meça** se a nota avulsa (`planItemId` nulo) entra — o acervo é por livro e tem filtro `FREE` (`acervo-filters.tsx:202-210`), então a leitura natural é que **entra**; confirme no schema em vez de assumir |
| **D** | **"Último grifo" é um terceiro método estreito**, não o primeiro item de um `find` | Mesmo argumento de B: puxar até 500 grifos para mostrar um é trafegar o acervo. ⚠️ E **confirme a ordem** — o `find` do grifo pode não prometer ordem, como o da nota explicitamente não promete (`note-repository.ts:113`) |
| **E** | **Os três links da margem vão todos para `acervoPath(bookId)`, sem filtro** | `ACERVO_PATH = '/books/:bookId/acervo'` (`paths.ts:108-112`) — o acervo **já é por livro**. ⚠️ Chegar com o tipo pré-aplicado exigiria pôr o estado do filtro na URL, e `acervo.tsx` **não usa `useSearchParams`** hoje (medido). Isso é território da **Tarefa 46**, que reescreve os filtros: **registre, não faça aqui** |
| **F** | ⚠️ **As contagens são INVENTÁRIO, não placar** | É a decisão H da Tarefa 44, e vale igual: "Anotações do clube 18 · Grifos 9" conta o acervo do livro, não o desempenho de ninguém. Elas não casam o `COUNTER_SHAPE` (não têm `de` entre dois números) — mas **escreva ao lado por que são legítimas**, para a próxima auditoria não as ler como o placar que o §1 do plano proíbe |
| **G** | **Três chaves ganham consumidor; a de "Último grifo" nasce** | `pages.book.inBook.{heading,notes,highlights}` existem desde a Tarefa 40 e estão sem consumidor. ⚠️ "Último grifo" **não existe** e é **chave nova** — a regra 9 da Tarefa 44 dizia "nenhuma chave nova", e ela valia **lá**; aqui o dono abriu escopo e ela entra. ⚠️⚠️ **"Ver o acervo do livro" JÁ EXISTE e esta linha estava ERRADA** — é `pages.book.acervoLink` (`pt.ts:270`), com o valor exato do artboard, e tem consumidor no corpo da tela desde a Tarefa 28. Corrigido na execução → **nota 1** |
| **H** | ⚠️ **NENHUMA migration. O `schema.prisma` não é tocado.** | `count()` e um `findFirst` ordenado não pedem coluna nova. ⚠️ Se você achar que pedem, **pare e pergunte** — o banco de teste é o de desenvolvimento do dono |

---

## As medidas, e de onde tirá-las

⚠️ **Escreva o script que imprime a linha citada ANTES da primeira citação.** É a prática
que mais se pagou neste bloco: na 42 pegou cinco citações erradas, na 43 pegou cinco e um
botão que a prosa escondia, e na 44 o revisor amostrou ~50 e todas conferiram.

O artboard é `LivroDesktop.dc.html`, a coluna de 320px que começa em `:180`:

| peça | linha | o que ela diz |
| --- | --- | --- |
| rótulo "Neste livro" | `:197` | mono 10px, `letter-spacing: 0.12em`, maiúsculo, `#565b52` — é o `Eyebrow` |
| linha "Anotações do clube" | `:198-201` | `<a>`, `justify-content: space-between`, rótulo 14px, número em **mono** 14px `#565b52`, `border-bottom: 1px solid #e3ddc9` |
| linha "Grifos" | `:202-205` | idem |
| "Ver o acervo do livro" | `:206` | mono 10px, `letter-spacing: 0.1em`, maiúsculo |
| filete entre blocos | `:194`, `:209` | `height: 1px`, `#e3ddc9` |
| rótulo "Último grifo" | `:212` | mesmo `Eyebrow` |
| a bolinha da caneta | `:214` | 9px, redonda, `#c89a44` = **`--pen-a-dot`** (medido: `theme.css:232`) |
| "Página 138 · Bruno" | `:215` | mono 9px, `letter-spacing: 0.1em`, maiúsculo, `#565b52` |
| o trecho grifado | `:217` | Fraunces **14,5px**, `line-height: 1.6`, fundo `#f0e2b4` = **`--pen-a`** (`theme.css:231`), com `box-shadow: 0 0 0 2px` da mesma cor — ⚠️ **é o `GrifoText` da Tarefa 41b**, que já existe e já tem consumidor; **use-o, não copie a regra** |

⚠️⚠️ **A armadilha da caneta, e ela é a mais fácil de cair nesta fatia.** O bloco inteiro
está na **caneta A** porque o grifo da maquete é amarelo — medido: `#c89a44` é
`--pen-a-dot` e `#f0e2b4` é `--pen-a`, e num artboard **claro** `#c89a44` não pode ser
`--gold` (que vale `#946d2c` no claro) nem `--accent` (`#143524`). **A bolinha e o fundo
são a cor da caneta DAQUELE grifo, não uma cor fixa.** Um grifo vermelho pinta o bloco de
vermelho. **Mutante obrigatório:** fixe a caneta em `a` → tem de ficar vermelho com um
grifo de outra cor.

⚠️ **14,5px e 9px:** a Tarefa 43 mediu que `17,5px` **é** `--size-reading` e que só `19px`
ficou fora da escala. Antes de inventar valor arbitrário, **case contra os sete `--size-*`**
e diga qual bate. Se nenhum bater, é divergência e **declare-a**.

---

## As regras

1. **TDD estrito, outside-in, e ele começa no UseCase.** Teste do `getBookWithPlan` com os
   Repositories **fake** primeiro, implementação depois. ⚠️ **Nunca** implementação antes do
   teste. Os fakes em memória ganham os métodos novos junto com os Prisma.

2. ⚠️⚠️ **A contagem tem de estar CERTA acima de 500, e é a razão de a fatia existir.**
   **Teste obrigatório:** um livro com **501** notas `ACTIVE` devolve **501**, não 500.
   **Mutante obrigatório:** troque o `count()` por `(await find({ bookId })).length` → **tem
   de ficar vermelho**. ⚠️ **Se ficar verde, a fatia inteira não guardou nada** — o defeito
   que ela existe para impedir voltou, e o teste que deveria pegá-lo não pega. Reporte.

3. ⚠️ **O arquivado não conta.** **Teste:** um livro com 3 notas `ACTIVE` e 2 `ARCHIVED`
   devolve **3**. **Mutante:** tire o `status` do `where` → acusa.

4. ⚠️ **O corte de tenant, com fixture HOSTIL.** A Tarefa 44 pagou por isto: um fixture que
   usa o mesmo id para o clube ativo e o clube do livro deixa **886 testes verdes** com o
   corte errado. Use ids diferentes (`c-outro` × `c-casal`) e prove que a contagem de um
   livro **não** soma o acervo de outro clube. Sem membership → **404**, não 403.

5. **Teste de contrato contra o Prisma real** para os três métodos novos, no arquivo de
   contrato que já existe de cada repositório. Poucos, mas existem — é a política de testes
   do `CLAUDE.md`.

6. ⚠️ **A varredura anti-culpa em TODOS os estados novos da tela**, com a decisão F acima em
   mente. **Mutante:** escreva "18 de 27 anotações" na margem → o `COUNTER_SHAPE` tem de
   acusar. ⚠️ **E respeite o que a rodada de correção da 44 fez com o
   `expectNoGuiltWithPlanPosition()`** — as duas variantes passaram a ser mutuamente
   exclusivas; leia o helper antes de escolher qual chamar, **não copie de um teste antigo**.

7. **Os dois blocos vivem na margem.** ⚠️⚠️ **E a frase original desta regra — "que só
   existe acima de 1120px" — é FALSA:** o `MarginRail` é montado sempre e **desce para o
   fluxo** abaixo de 1120px (medido em `packages/ui/src/components/reading-column.tsx:186-207`;
   o que é media query são a largura, o filete e o `padding-left`). Corrigido na execução →
   **nota 3**.
   ⚠️ **Guarda de visibilidade, não só de presença no DOM.** A rodada de correção da 44
   fechou dois mutantes exatamente assim (a legenda escondida por media query com 926 testes
   verdes). **Mutante:** esconda o bloco em toda largura → acusa.

8. **`aria-hidden` no que fala em dobro.** A bolinha da caneta em `:214` é decoração ao lado
   de um texto que já diz a página e o nome. **Mutante:** tire o `aria-hidden` → acusa.
   É a lição nº 16 do MVP 2, e a 44 pagou por ela.

9. **Nenhum acesso a banco fora de um Repository. Sem `$queryRaw`.**

10. **O tamanho, pelo contador canônico** — o comando está em `acervo.tsx:115-126` e é *"o
    único do projeto"*. ⚠️ **Não use `wc -l`**: a rodada de correção da 44 caiu exatamente
    nisso, comparando `wc -l` com um teto que era de outra unidade. ⚠️ **`book.tsx` está em
    ~~356~~ **360** linhas canônicas** — o 356 é o número do fim da Tarefa 44, antes da
    rodada de correção; medido no commit `dcac49a`: **360**, que é o que o `BACKLOG.md` já
    registrava. Corrigido na execução → **nota 7**. O dono registrou que **fica**; esta fatia
    acrescenta a ele.
    Se o acréscimo empurrar demais, **extraia e diga por medição o que saiu e para onde**.

11. **O orçamento de bytes, colado antes e depois.** Entrada em ~~443.693~~ **443.670 B**
    contra o teto de **450.000** — ⚠️ ~~6.307~~ **6.330 B de folga, e ainda faltam as Tarefas
    45, 46, 47 e 48** (o 443.693 é o número de ANTES da rodada de correção da 44, que fez a
    entrada encolher 23 B; o `BACKLOG.md`, item (d), já registrava o certo — medido no
    commit `dcac49a`). A 44
    custou 2.600 B. Se esta fatia comer mais de ~1.500 B, **diga**, porque a 46 e a 47 são as
    caras e a 48 é que decide o veredito do teto.

12. **Varredura de caracteres invisíveis** nos arquivos do diff, **provando antes que ela
    morde** com um soft hyphen e um NBSP plantados.

---

## Definição de pronto

- [x] Os três métodos estreitos existem nos ports, nos fakes e nas implementações Prisma,
      com o vocabulário e o motivo escritos ao lado. — `activeCountByBook` nos dois
      repositórios e `lastActiveByBook` no do grifo.
- [x] `getBookWithPlan` devolve as duas contagens e o último grifo; o schema em
      `packages/shared` foi estendido (`bookInventoryResponseSchema` e
      `lastHighlightResponseSchema`), e back e front importam de lá.
- [x] **A contagem está certa acima de 500**, provada por teste e pelo mutante da regra 2
      — nos dois repositórios, e **só o teste de contrato acusa** (nota 4).
- [x] O arquivado não conta, provado por teste e mutante (fake e Prisma, nota 5).
- [x] O corte de tenant provado com fixture **hostil** (`book-de-outro-clube` em
      `club-2`, contra `book-1` em `club-1`).
- [x] Teste de contrato contra o Prisma real para os três métodos — 11 `it()` novos,
      mais 2 de rota.
- [x] A margem do desktop mostra "Neste livro" e "Último grifo" como o artboard desenha,
      com `Eyebrow`, `GrifoText` e os filetes. ⚠️ **ESTA CAIXA ESTAVA MARCADA SEM OS
      FILETES** — eles não existiam no `rail()`, e a auditoria os mediu ausentes. Só passou
      a ser verdade na rodada de correção de 2026-09-23 → **nota 16**. Marcar a caixa é
      afirmação: ela agora tem acusador
      (`draws the three blocks in the CANVAS ORDER, with a hairline between them`).
- [x] `pages.book.inBook.{heading,notes,highlights}` ganham consumidor; **UMA** chave
      nasceu (`lastHighlight`), não duas — "Ver o acervo do livro" **já existia** e a
      decisão G estava errada (nota 1).
- [x] Os três links vão para `acervoPath(bookId)`; a pré-aplicação do filtro de tipo está
      **registrada como território da Tarefa 46**, não feita aqui.
- [x] A varredura anti-culpa passa em todos os estados novos, e as contagens estão
      justificadas por escrito como inventário (três lugares: o schema do `shared`, o
      `rail()` do `book.tsx` e o `pt.ts`).
- [x] **Nenhuma migration. `schema.prisma` intocado** — `md5sum` igual antes e depois:
      `968c9986f7a2dfb4ccbd738b13d44715`.
- [x] Gates colados antes e depois: `pnpm -r test` · `typecheck` · `lint` ·
      `prettier --check` · `build`, com o tamanho da entrada (nota 9).
- [x] Varredura de invisíveis, com a prova de que morde (nota 10).

---

## Notas de reconciliação (2026-09-23, medidas na execução)

_O executor anexa aqui o que mediu e divergiu da spec. Numere de 1 em diante. Se um número
desta spec estiver errado, **corrija-o aqui e no `BACKLOG.md`**, dizendo como mediu._

### 1. ⚠️ A DECISÃO G ESTAVA METADE ERRADA — só UMA chave nasceu, não duas

A decisão G diz: *"'Último grifo' e 'Ver o acervo do livro' **não existem** e são **chaves
novas**"*. **Medido:** `pages.book.acervoLink` existe desde a Tarefa 28 e o valor dele é
**exatamente** a frase do artboard:

```
packages/shared/src/locales/pt.ts:270      acervoLink: 'Ver o acervo do livro',
LivroDesktop.dc.html:206  ...>Ver o acervo do livro</a>
```

(As duas linhas saíram do script que imprime a linha citada, escrito **antes** da primeira
citação — é a prática que na 42 pegou cinco citações erradas e na 43 cinco mais um botão.)

Então o `pt.ts` ganhou **uma** chave: `pages.book.inBook.lastHighlight`. E o bilhete que
vivia ao lado de `inBook` — "as três chaves esperam a Tarefa 44b" — foi **trocado** pelo
que descreve a verdade nova, com a medição desta nota dentro.

⚠️ **A consequência não é cosmética**, e é por isso que ela é a nota nº 1: a frase existir
duas vezes na tela **é** um defeito, e foi ela que obrigou a decisão da nota 2.

### 2. ⚠️ O TERCEIRO LINK DA MARGEM OBRIGOU UM PAR DE MEDIA QUERIES — decisão nova, declarada

O canvas põe "Ver o acervo do livro" em **dois lugares diferentes conforme a largura**:

| artboard | onde | linha |
| --- | --- | --- |
| `Livro.dc.html` (celular) | no CORPO, botão de 42px de altura | `:60` |
| `LivroDesktop.dc.html` | **só** na margem, dentro de "Neste livro" | `:206` |

O corpo já tinha o link desde a Tarefa 28, em **todas** as larguras. Pôr o da margem sem
mais nada daria a **mesma frase duas vezes na mesma tela** — porque o `MarginRail` **não
desaparece** abaixo de 1120px (veja a nota 3). A saída foi o par de classes mutuamente
exclusivas, que é o MESMO desenho das duas lombadas do cabeçalho, já testado neste arquivo:
o do corpo leva `min-[1120px]:hidden` e o da margem `hidden min-[1120px]:inline-flex`.

⚠️ **O teste `has ONE link to the collection` foi TROCADO, não afrouxado.** Ele contava
elementos do DOM; passou a medir a **exclusão mútua**, que é o que a pessoa vê. Mutante:
tirar o `min-[1120px]:hidden` do corpo (os dois visíveis acima de 1120px) → **1 acusador**,
que a versão antiga do teste não tinha.

### 3. ⚠️ A REGRA 7 DESCREVE UMA MARGEM QUE NÃO EXISTE — e a guarda certa é outra

A regra 7 diz: *"Os dois blocos só existem na margem, que só existe acima de 1120px"*.
**Medido em `packages/ui/src/components/reading-column.tsx:186-207`:** o `MarginRail` é um
`<aside>` montado **sempre**, e o que é media query são a largura, o filete e o
`padding-left` (`min-[1120px]:w-80 min-[1120px]:border-l min-[1120px]:pl-10`). Abaixo de
1120px ele **desce para o fluxo** — é o que o `book.tsx` já documentava para a legenda "As
marcas" desde a Tarefa 44, e o que a tela do dia faz com os grifos desde a 43.

Ou seja: os dois blocos novos aparecem nas **duas** larguras, de propósito, e a guarda que a
regra 7 pede de fato ("visibilidade, não presença no DOM") é a ausência de `hidden` — que é
o que as asserções fazem. Mutante da regra 7 aplicado nas duas seções: **1 acusador cada**.

### 4. ⚠️⚠️ O MUTANTE DA REGRA 2 É INVISÍVEL PARA A SUÍTE UNITÁRIA — medido, e é o §7.10

A regra 2 manda trocar o `count()` por um `find(...).length` e exige vermelho. **Medido, e
o lugar do vermelho importa:**

| suíte | acusadores |
| --- | --- |
| `pnpm --filter @clube/backend test` (1987 unitários) | **0** |
| `pnpm --filter @clube/backend test:integration` | **2** |

Os dois acusadores são `counts every ACTIVE note of the book, past the 500-row valve of
find()` e o irmão do grifo. A razão é estrutural e está escrita nos dois fakes: **o fake não
tem teto de linhas**, então contra ele as duas implementações dão o mesmo número. É o §7.10
("não é decidível aqui" só vale com a medição e com o endereço de onde É decidível), e o
endereço está nos docblocks dos dois `activeCountByBook` dos fakes e das duas
implementações Prisma.

⚠️ **O mutante aplicado NÃO é degenerado.** `find` exige `clubId`, que o repositório não
tem; a primeira tentativa foi `find({ clubId: '' })`, que devolve **sempre vazio** — isso
seria um mutante degenerado, acusado por qualquer teste e por nenhuma razão interessante.
O mutante que vale é o `findMany` com o **mesmo `where`, o mesmo `orderBy` e o mesmo
`take: FIND_ROW_LIMIT`** do `find`, ou seja, exatamente a implementação errada que alguém
escreveria copiando o método de cima. Ele é correto para 500 linhas e mente da 501ª em
diante — e é só isso que o teste de contrato pega.

### 5. Os mutantes, um por um (11 aplicados, 11 acusados)

Cada um com `md5sum` + `cp -p` antes, aplicado por script `.mjs` **ancorado** (a âncora é
contada e o script estoura se não for exatamente 1), conferido por `grep` depois de
aplicado, e restaurado por `cp -p` com `md5sum -c` **e** `diff` por conteúdo.

| # | mutante | suíte | acusadores |
| --- | --- | --- | --- |
| M1 | `count()` → `findMany({…, take: FIND_ROW_LIMIT}).length` nos DOIS repositórios Prisma | unitária | **0** |
| M1 | idem | integração | **2** — `…past the 500-row valve of find()` (nota e grifo) |
| M2a | os dois **fakes** perdem o `status === 'ACTIVE'` da contagem | unitária | **1** — `inventory > counts neither an archived note nor an archived highlight` |
| M2b | os dois **Prisma** perdem o `status: 'ACTIVE'` (contagem e `lastActiveByBook`) | integração | **4** — os dois `counts only/the ACTIVE …`, `ignores an archived highlight…` e `carries the acervo inventory and the last highlight` |
| M3 | a margem escreve `{count} de 27` (o placar da regra 6) | app | **54** — a varredura anti-culpa morde em todo estado da tela |
| M4a | `hidden` na seção "Neste livro", em toda largura | app | **1** — `puts the ACERVO INVENTORY in the margin…` |
| M4b | `hidden` na seção "Último grifo", em toda largura | app | **1** — `paints the LAST HIGHLIGHT with the pen of THAT highlight…` |
| M5 | tirar o `aria-hidden` da bolinha da caneta (regra 8) | app | **1** — `paints the LAST HIGHLIGHT…` |
| M6 | ⚠️ **a caneta fixa em `a`** (a armadilha do amarelo do canvas), bolinha **e** papel | app | **1** — `paints the LAST HIGHLIGHT…` |
| M7 | trocar os dois números de lugar (`notes` ↔ `highlights`) | app | **1** — `puts the ACERVO INVENTORY… each number next to its OWN label` |
| M8 | o link do corpo deixa de se esconder acima de 1120px | app | **1** — `has ONE VISIBLE link to the collection per width` |
| M9 | `lastActiveByBook` → `(await find({…}))[0]` no UseCase | unitária | **2** — `counts each side exactly once for a member` e `returns the most recent ACTIVE highlight of the book` |
| M10 | os dois fakes perdem o corte por `bookId` (regra 4) | unitária | **3** — `never sums the acervo of another club into this book`, `never crosses into another club book…` e `does not leak between two executes…` |

⚠️ **O M5 merece uma linha própria.** A bolinha da caneta existe desde a Tarefa 43, na tela
do dia, e **não tinha acusador nenhum** para o `aria-hidden` — a medição mostra **1**, e ele
está em `book.test.tsx`. Isso é efeito da extração da nota 6: o desenho passou a ter um
dono, e a guarda que nasceu para a tela do livro protege as duas telas.

### 6. O `MarginHighlight` foi EXTRAÍDO, e a spec não pedia — §7.1, "extrair, não cobrir duas vezes"

O bloco do artboard (`LivroDesktop.dc.html:213-217`) é o **mesmo** que a Tarefa 43 já
desenha na tela do dia (`DiaDesktop.dc.html:115-121`): a bolinha de 9px com a cor da caneta,
a linha de mono com `Página {{number}} · nome`, e o trecho dentro do `GrifoText`.
Reimplementá-lo seria uma cópia byte a byte — a classe que o `club-names.ts` (Tarefa 28) e o
`sql-equality.ts` (Tarefa 23) já pagaram.

Ele nasceu como módulo **neutro** (`packages/app/src/pages/margin-highlight.tsx`), não
exportado de nenhuma das duas telas: é a lição do `router-link.tsx` e do
`highlight-colors.tsx` — exportá-lo de `day-note.tsx` faria o acusador do `book.tsx` viver
na suíte da outra tela.

**Medido, antes e depois da extração:** `pnpm --filter @clube/app test` = 927 passando nos
dois lados. ~~Ou seja, a extração é preservadora de comportamento por construção.~~

⚠️⚠️ **ESSA CONCLUSÃO ERA FALSA, e a rodada de correção de 2026-09-23 a mediu.**
**Contagem igual não é prova de comportamento igual** — ela só diz que nenhum teste
existente mudou de cor, e os testes existentes são justamente o que não olha o código
novo. A demonstração está no mutante MR12 da auditoria: o ramo `page === null` do
`MarginHighlight` renderizando a string `'PLACAR 18 de 27'` passava pelos **931** testes
do app, **com a varredura anti-culpa inteira passando ao largo** — porque nenhum teste do
projeto renderizava um grifo sem página (`grep "page: null"` = 0 em `book.test.tsx` e em
`day-note.test.tsx`). Um módulo extraído tem ramos; 927 = 927 não sabe disso.

O que se pode afirmar com a medição que foi feita, e é bem mais estreito: **nenhum
comportamento COBERTO mudou.** O que a extração de fato mudou, e só apareceu na auditoria,
está na nota 15 (o acusador que trocou de suíte) e na nota 16 (o ramo sem acusador).

### 7. Os tamanhos, pelo contador canônico, com a data ao lado

⚠️ **A regra 10 desta spec diz que `book.tsx` está em 356 linhas canônicas. Medido no
commit `dcac49a`: 360.** O 356 é o número do **fim da Tarefa 44**, antes da rodada de
correção; o `BACKLOG.md`, item (b) do bloco da rodada, já registra 360 e é ele que está
certo. Corrigido aqui e lá.

| arquivo | antes (`dcac49a`) | depois | delta |
| --- | --- | --- | --- |
| `packages/app/src/pages/book.tsx` | **360** | **408** | **+48** |
| `packages/app/src/pages/day-note.tsx` | **506** | **478** | **−28** |
| `packages/app/src/pages/margin-highlight.tsx` | — | **45** | **+45** |
| `packages/app/src/pages/reading-marks.tsx` | 107 | 107 | 0 |

Soma das telas tocadas: 866 → 931 (**+65**), dos quais 45 são o módulo novo. O comando é o
do docblock de `acervo.tsx:115-126` — **o único do projeto**; `wc -l` não é a unidade.

O dono registrou na 44 que `book.tsx` **fica** nos 360 sem teto novo; esta fatia o leva a
408. O corte que valeria a pena continua sendo por **assunto** (o cabeçalho × a margem), e a
margem agora tem três seções: se a 45 acrescentar uma quarta, é ali que a divisão cabe.

### 8. O que o desenho NÃO fez, e por quê

- **Nenhuma rota de contagem e nenhum envelope com total nas listagens** (decisão A). As
  contagens entraram no `getBookWithPlan`, que é a **terceira** aplicação do argumento
  escrito em `get-book-with-plan.ts:56-67` — o `writers` foi a primeira (Tarefa 11), o
  `readers` a segunda (32).
- **Nenhuma migration, nenhum `prisma migrate`, nenhum `db push`.** `count()` e um
  `findFirst` ordenado não pedem coluna: `md5sum` do `schema.prisma` igual antes e depois
  (`968c9986f7a2dfb4ccbd738b13d44715`).
- **O filtro de tipo pré-aplicado no acervo continua fora** (decisão E): `acervo.tsx` não
  usa `useSearchParams`, e pôr o estado do filtro na URL é a Tarefa 46. Os três links vão
  para `acervoPath(bookId)` sem query.
- ⚠️ **O `tracking` do link "Ver o acervo do livro" NÃO foi sobrescrito.** O canvas
  escreve 0,1em e o `Eyebrow` é 0,12em; um `tracking-[0.1em]` ao lado **não** seria o
  conserto — as duas são classes de valor arbitrário do Tailwind, então quem vence é a
  ordem no CSS emitido, não a ordem de escrita, e o espaçamento sairia decidido por sorte.
  Divergência declarada, a mesma que o `Eyebrow` do cabeçalho desta tela já carrega desde
  a rodada de correção da 44.
- **O `lastHighlight` viaja ESTREITO.** O schema do `shared` declara `id`, `userId`,
  `quote`, `color` e `page` — e nada mais. Um `highlightResponseSchema` cheio no lugar
  dele carregaria a árvore ProseMirror do comentário em **toda** abertura de livro; o
  acusador é `drops the comment tree of the last highlight`, em `note-schemas.test.ts`.

### 9. Os números, com a data ao lado (2026-09-23)

| gate | antes (`dcac49a`) | depois |
| --- | --- | --- |
| `pnpm -r test` — shared | 601 | **607** (+6) |
| — ui | 303 | **303** |
| — backend | 1975 | **1987** (+12) |
| — app | 927 | **931** (+4) |
| `pnpm --filter @clube/backend test:integration` | 629 | **642** (+13) |
| `pnpm -r typecheck` | verde | **verde** |
| `pnpm lint` | verde | **verde** |
| `pnpm prettier --check .` | verde | **verde** |
| chunk de entrada | 443.670 B | **444.876 B** (**+1.206**) |
| folga contra o teto de 450.000 | 6.330 | **5.124** |
| CSS | 35.180 B | **35.229 B** (+49) |
| `index.html` | 1.638 B | **1.638 B** |
| chunk do editor | 449.522 B | **449.522 B** |
| precache | 26 / 1189,41 KiB | 26 / **1190,63 KiB** |

⚠️ **A regra 11 pedia aviso acima de ~1.500 B: os +1.206 ficam abaixo, mas por pouco.** A
extração da nota 6 é parte do motivo de não ser mais — o bloco do grifo passou a existir uma
vez só para as duas telas. **Restam 5.124 B para as Tarefas 45, 46, 47 e 48.**

⚠️ O número de integração "antes" (629) é **derivado**, não medido isoladamente: 642 menos
os 13 `it()` que esta fatia acrescentou (8 no contrato do grifo, 3 no da nota, 2 na rota do
livro). A primeira execução de integração desta sessão já estava com os testes novos.

### 10. A varredura de invisíveis: 27 arquivos, zero ocorrências — e ela morde

A varredura é montada por **code point numérico** (`String.fromCodePoint`), nunca por escape
dentro de literal de regex — é a lição que a Tarefa 44 pagou: a ferramenta de edição converte
o escape em caractere de verdade, e a guarda passa a procurar o próprio invisível escrito no
fonte dela.

**Prova de que morde**, com um soft hyphen e um NBSP plantados num arquivo de teste:

```
planta.txt:2  U+00AD  SOFT HYPHEN
planta.txt:3  U+00A0  NO-BREAK SPACE
OCORRENCIAS: 2   (exit=1)
```

Nos 27 arquivos do diff: `OCORRENCIAS: 0` (exit=0). Vinte code points na lista, incluindo
U+2028, U+2029, U+FEFF, U+200B–U+200F, U+202A–U+202E, U+2060, NUL e ESC.

### 11. O banco de DESENVOLVIMENTO do dono não mudou — provado POR CONTEÚDO

O Docker Desktop estava fechado no início da sessão e foi aberto para o `clube_db` subir (a
integração é contra o banco de desenvolvimento do dono, `docs/SETUP.md` §2). Antes e depois
de rodar a integração — **cinco execuções ao todo, três delas com mutante aplicado** — o
retrato das 13 tabelas foi tirado POR CONTEÚDO (id, chaves, título, texto, status; nunca
contagem):

```
md5 antes   44e6ea660a6f7f12b3b1ed83c8021a9e
md5 depois  44e6ea660a6f7f12b3b1ed83c8021a9e
diff        (vazio) — IDENTICO POR CONTEUDO
```

3 usuários, 3 clubes, 4 memberships, 5 livros, 24 itens de plano, 11 notas, 8 grifos, 19
logs de leitura, 37 eventos, 2 convites, 3 settings, 2 inscrições de push, 0 entregas — as
mesmas linhas, byte a byte.

⚠️ **E a limpeza dos fixtures ganhou uma linha que faltava.** O `afterAll` de
`book-routes.integration.test.ts` consultava nota e log de leitura pelo `bookId`, mas **não
o grifo** — e esta fatia passou a gravar grifo ali. Sem a linha nova, a limpeza estouraria em
`Highlight_bookId_fkey` **com os testes verdes** e fixture vazando no banco do dono: é a
armadilha que o `ActivityEvent` (34), o `PushSubscription` (36) e o `planItemId` do grifo
(38i) já pregaram três vezes.

### 12. O que tentei e não deu certo

1. **`find({ clubId: '' })` como mutante da regra 2.** Devolve sempre vazio: mutante
   **degenerado**, acusado por tudo e por nada. Trocado pelo `findMany` com o `take` (nota
   4). Fica registrado porque a primeira versão parecia razoável.
2. **Ler o banco do dono com `node --env-file=.env` importando `@prisma/client` por nome.**
   Não resolve fora do pacote; o retrato passou a importar o cliente gerado por caminho de
   arquivo. E o primeiro retrato pediu `Invite.status`, coluna que **não existe** (o
   `Invite` marca uso com `usedAt`) — corrigido antes de valer como medição.
3. **Deixar o link do acervo na margem sem mexer no do corpo.** Dava a mesma frase duas
   vezes acima de 1120px. Virou o par de media queries da nota 2.
4. **Um `t()` com a chave montada por interpolação** para as duas linhas do inventário.
   Recusado antes de escrever: chave montada em runtime some de toda varredura que procura a
   chave no fonte — é a mesma classe do mapa `bg-pen-*` que o `GrifoText` documenta. As duas
   chaves ficaram literais.
5. **Rodar a integração antes de conferir o banco.** Não deu errado, mas quase: o retrato
   "antes" só foi possível depois de subir o Docker, e ele foi tirado **antes** da primeira
   execução — se tivesse ficado para depois, não haveria com o que comparar.

### 13. Uma pergunta aberta para o dono

A tela do dia desenha **todos** os grifos daquele dia na margem; a tela do livro desenha **um
só**, o mais recente, porque é o que o artboard mostra. As duas agora dividem o mesmo
componente. Se um dia a margem do livro tiver de mostrar "os três últimos", a mudança é de
uma linha no `rail()` e de nada no backend — o port devolveria uma lista em vez de um
registro. **Não foi feito porque ninguém pediu**, e um método que devolve N sem consumidor é
a especulação que o projeto recusa em todo port.

---

## Notas da RODADA DE CORREÇÃO (2026-09-23) — numeradas a partir das que já existiam

_A auditoria por mutação achou **cinco mutantes sobreviventes** e **seis afirmações
falsas**. As notas abaixo continuam a numeração acima; as notas 1 a 13 ficam como estão,
menos a **6**, corrigida no lugar dela porque a frase errada era a conclusão da nota._

### 14. ⚠️⚠️ AS DUAS DECISÕES DO DONO — o teto de 420, e a 44c que não é desta rodada

**(D1) O teto de linhas do `book.tsx` é 420 linhas canônicas desde 2026-09-23.** Medido
pelo contador canônico (`acervo.tsx:115-126`, *"o único do projeto"*), a tela estava em
**408** ao fim da 44b e esta rodada a levou a **414** — os dois filetes de 1px do canvas e
o fragmento que embrulha o segundo com o bloco do grifo (+6). **Folga: 6 linhas.**

⚠️ **O ~350 da Tarefa 32b fica riscado e explicado, NUNCA apagado.** Ele é histórico:
`docs/tasks/32b-marca-de-leitura-na-tela.md:126` continua sendo o endereço da cláusula, e a
numeração da **lição nº 8 do MVP 1** tem de continuar significando o que significava para
quem já a citou. É a mesma política da seção "o que NÃO fazer agora" do `CLAUDE.md`, que
risca em vez de apagar porque a seção é histórica. Registrado em **três** lugares: o
`BACKLOG.md`, o docblock do `book.tsx` e a própria cláusula da 32b.

**Por que subiu:** entre a 32b e hoje a tela ganhou a **lombada** (`BookSpine`), o
**sumário** (`ListItemLook="sumario"`), a **margem de desktop** (`MarginRail` com "As
marcas") — as três da Tarefa 44 — e agora o **inventário** ("Neste livro" e "Último
grifo"). Quatro coisas do canvas, nenhuma de conveniência de quem escreveu. A série
medida: 247 → 277 → 356 → 360 → 408 → **414**.

⚠️⚠️ **E A IRONIA, MEDIDA E ESCRITA — é registro, não acusação.** A 44b **extraiu 45
linhas** para `margin-highlight.tsx` e se anotou (nota 7) como fatia que dividiu. O corte,
porém, saiu do **`day-note.tsx`**: 506 → 478, **−28**. **A tela que estourou o teto não
perdeu uma linha** — ela foi de 360 a 408. A extração estava certa pelo §7.1, e o número
dela é real; o que faltou foi notar que o alívio foi para o arquivo errado. **Extrair de A
não é encolher B.** A próxima fatia que tocar esta margem corta **aqui**, e o corte
continua sendo por ASSUNTO: o cabeçalho × a margem, que já tem três seções.

**(D2) A fatia 44c — tirar as telas de administração do primeiro carregamento — NÃO é
desta rodada.** A spec é do dono, e ela existe:
`docs/tasks/44c-admin-fora-do-primeiro-carregamento.md`, escrita por ele em 2026-09-23. Esta rodada **não** inventou code-splitting e **não**
tocou o teto do `bundle-guard`. O motivo da 44c está no orçamento: entrada em
**444.876 B** contra 450.000, **5.124 de folga (1,1%)**, com as Tarefas 45, 46 e 47 ainda
por vir.

### 15. ⚠️⚠️ OS CINCO MUTANTES SOBREVIVENTES, e o que cada um deixava passar

Protocolo por mutante: `md5sum` + `cp -p` antes de **cada** um, aplicação por script `.mjs`
**ancorado** (conta a âncora e estoura se ≠ 1), confirmação por `grep` depois de aplicado,
execução da suíte inteira, contagem e NOME dos acusadores, restauração por `cp -p` com
`md5sum -c` **e** `diff` por conteúdo.

| # | mutante | antes | depois | acusador que nasceu |
| --- | --- | --- | --- | --- |
| MR7 | o link do corpo com `hidden min-[1120px]:hidden` (escondido em toda largura) | **0 / 931** | **1** | `has ONE VISIBLE link to the collection per width, and no tab left` |
| MR12 | o ramo `page === null` do `MarginHighlight` renderiza `'PLACAR 18 de 27'` | **0 / 931** | **1** | `⚠️ says only the NAME when the highlight has no page` |
| MR8 | o desempate do `lastActiveByBook` invertido no fake | **0 / 1987** | **8** | ver nota 17 |
| MR9 | as linhas de inventário perdem `border-b border-line-soft` | **0 / 931** | **1** | `⚠️ underlines each inventory row with the canvas hairline` |
| MR6 | "Neste livro" e "Último grifo" trocam de lugar na margem | **0 / 931** | **1** | `⚠️ draws the three blocks in the CANVAS ORDER, with a hairline between them` |

⚠️ **O MR7 merece a linha própria, porque é a TERCEIRA aparição do padrão neste arquivo** —
as duas lombadas do cabeçalho, a legenda "As marcas" da Tarefa 44, e este par — **e a
primeira em que só metade foi fechada**. A entrega guardou o lado positivo (*"o do corpo
some acima de 1120px"*) e o lado da margem, e deixou solto o par negativo do corpo. O
efeito do mutante é o pior possível: **abaixo de 1120px, que é o celular, a tela do livro
fica sem nenhum caminho para o acervo**, com a suíte verde. A asserção usa fronteira de
palavra (`/(^|\s)hidden(\s|$)/u`) porque um `toContain('hidden')` casaria
`min-[1120px]:hidden` e daria o falso verde de novo.

⚠️ **O MR12 some com o problema da nota 18 (a varredura de fonte por lista).** O arquivo
que tem o ramo cego (`margin-highlight.tsx`) é **justamente** o que a varredura de fonte
não lia. E a varredura anti-culpa, que roda em todos os estados, passava ao largo por uma
razão simples e medida: **nenhum teste do projeto renderizava um grifo sem página**
(`grep "page: null"` = 0 nas duas suítes). Guarda que nunca renderiza o estado não guarda o
estado — §7.9, na forma mais direta dele.

### 16. ⚠️⚠️ OS DOIS FILETES DA MARGEM NÃO EXISTIAM — e a Definição de pronto os marcava

O artboard desenha dois separadores de 1px, conferidos com o conteúdo impresso pelo script
de citação:

```
LivroDesktop.dc.html:194  <div style="height: 1px; background: #e3ddc9;"></div>
LivroDesktop.dc.html:196  <div style="display: flex; flex-direction: column; gap: 12px;">
LivroDesktop.dc.html:197  <span style="...">Neste livro</span>
LivroDesktop.dc.html:209  <div style="height: 1px; background: #e3ddc9;"></div>
LivroDesktop.dc.html:211  <div style="display: flex; flex-direction: column; gap: 10px;">
LivroDesktop.dc.html:212  <span style="...">Último grifo</span>
```

`#e3ddc9` é `--border-soft` (`theme.css:112`), que no app é `--color-line-soft` → a classe
`bg-line-soft`. No `rail()` não havia nenhum: os três `<section>` eram separados só pelo
`gap-[26px]`, e a tabela de medidas da spec já os listava como entregues.

⚠️ **O segundo filete vive DENTRO do `null` do bloco do grifo**, e isso é a metade que
quase se perde: um separador escrito "depois de toda seção" deixaria um traço solto no fim
da coluna em todo livro recém-cadastrado — que é o estado mais comum de todos. O mutante
que escreve o filete fora do `null` tem **1 acusador**
(`⚠️ drops the second hairline together with the last-highlight block`).

**A guarda é UMA asserção**, e ela é a lista de rótulos na ordem do DOM
(`railShape()`), que fecha três propriedades de uma vez: a ordem (MR6), a presença dos
filetes e a contagem deles. Apagar o filete de cima dá **2 acusadores**.

### 17. ⚠️⚠️ O COMPARADOR "MAIS RECENTE PRIMEIRO" TINHA CINCO CÓPIAS — e a quinta divergiu

O `lastActiveByBook` do `HighlightRepositoryFake` desempatava com
`a.id.localeCompare(b.id)`. Os outros quatro lugares do backend comparam por **code
point**:

```
usecases/list-highlights.ts          compareByCreatedAtDesc   code point
usecases/list-notes.ts               compareByCreatedAtDesc   code point
usecases/list-books.ts               compareByMonthDesc       code point (depois do mês)
_fakes/activity-event-repository-fake.ts  compareForTheFeed   code point
_fakes/highlight-repository-fake.ts  lastActiveByBook         localeCompare  ← a quinta
```

⚠️ **Sendo justo: o defeito era LATENTE.** Varridos por força bruta os 1.206.681 pares do
alfabeto real dos ids (`randomUUID()` = `[0-9a-f-]`), **zero divergências**. Os dois só
discordam com maiúscula — `'A'.localeCompare('a')` é **1** e `'A' < 'a'` é **true** —, e
id de produção não tem maiúscula. Id de **fixture** tem, porque é escrito à mão.

Mas **o desempate não tinha acusador nenhum**: invertê-lo passava por **1987** testes
unitários. É o §7.1 na frase exata dele — *"fidelidade afirmada em comentário e não em
teste é fidelidade que o próximo refactor apaga"* —, e o docblock do fake afirmava a
fidelidade por escrito.

**As duas saídas, medidas, porque o dono pediu o número das duas:**

| opção | o que muda | mutante "inverter o desempate" |
| --- | --- | --- |
| (a) trocar só o fake pelo code point, mais um `it()` unitário | 1 arquivo | **1 acusador** |
| (b) **extrair o comparador para um dono só** | `domain/newest-first.ts` + 5 chamadores | **8 acusadores, em 6 arquivos** |

Os oito da (b), nominalmente: `compareNewestFirst > breaks a createdAt tie by the SMALLER
id`, `> ⚠️ compares by CODE POINT, on a pair where localeCompare disagrees`, `> gives a
sort the same answer whatever order it started in`, `GetBookWithPlan > lastHighlight >
breaks a createdAt tie by the SMALLER id, never by insertion order`, `ListBooks > order >
breaks a full tie by id…`, `ListHighlights > order > breaks a createdAt tie by id…`,
`ListNotes > order > breaks a createdAt tie by id…` e `ActivityEventRepositoryFake > find >
the order, which is the product > breaks a createdAt tie by id, ascending`.

**Escolhida a (b).** Três razões, e as três já estavam escritas no projeto: (1) é o §7.1 na
frase que ele mesmo prescreve, *"extrair, não cobrir duas vezes"* — o **mesmo** argumento
que esta fatia invocou para o `MarginHighlight` e **não** aplicou aqui; (2) o que estava
duplicado não é detalhe de cada listagem, é a codificação da MESMA cláusula que os dois
repositórios Prisma pedem ao Postgres (`orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]`),
então o acoplamento **já existia** e só não estava escrito num lugar — é o argumento
literal do `sql-equality.ts` (Tarefa 23); (3) o número: **uma** mutação do dono único acusa
nos cinco, contra uma por cópia.

O tipo do parâmetro é estrutural (`NewestFirst = { createdAt: Date; id: string }`), no
molde do `PlanItemMark` do `plan-item-groups.ts` (decisão C da Tarefa 31): as quatro
entidades (`Note`, `Highlight`, `Book`, `ActivityEvent`) o satisfazem como estão, sem
conversão e sem `as`.

⚠️ **O que o módulo NÃO decide:** qual ordem o Postgres daria. Essa pergunta é decidível só
no teste de contrato contra o banco real (`breaks a createdAt tie by id, the same total
order the listing uses`), e o docblock aponta para lá — §7.10.

### 18. ⚠️⚠️ A VARREDURA DE FONTE TINHA LISTA LITERAL, e o aviso estava DUAS LINHAS ACIMA

`book.test.tsx` varre os arquivos-fonte da tela procurando a cor de perigo, e a lista era
literal: `['book.tsx', 'reading-marks.tsx']`. Esta fatia fez a tela ter **três** arquivos, e
o que ficou de fora foi `margin-highlight.tsx` — **justamente o que pinta**: a bolinha da
caneta, o papel do `GrifoText`, a cor do grifo daquele grifo.

⚠️⚠️ **E o docblock imediatamente acima do `for` é o próprio aviso**, escrito na Tarefa 32b:

> *"Uma varredura de fonte que ficasse só no `book.tsx` teria perdido exatamente o arquivo
> novo: é a forma de 'guarda no lugar errado' do §7.9, nascendo de um `split`."*

A mesma lição, no mesmo arquivo, repetida pela fatia que fez o `split`.

**Provado, e não deduzido:** com a cor de perigo plantada em `margin-highlight.tsx` e a
lista de **dois**, o `it()` `keeps the danger colour out of the SOURCE FILES` **passa**
(`1 passed | 67 skipped`). Com a lista de **três**, falha. Acrescentado o arquivo **e o par
positivo dele** — e o par positivo é escolhido para valer: é a linha que **pinta**
(`PEN_DOT_CLASS[COLOR_PEN_KEYS[color]]`), não uma chave qualquer.

⚠️ **A varredura irmã absorveu o arquivo sozinha, e a diferença é o instrumento.** A de
`adr-0002-iconography.test.ts:57-64` é **recursiva** sobre `src/pages/` — medido: ela já
lia `margin-highlight.tsx` sem ninguém tocar nela. Só esta era por lista. A lista literal de
arquivos é a mesma classe de defeito que a lista literal de classes de cor que o §7.9 já
proíbe: as duas conhecem o que existia no dia em que foram escritas. Esta continua por
lista porque as três telas do arquivo são um conjunto nomeado — e o preço de ser por lista
é este `it()` ter de crescer junto com o próximo `split`.

### 19. ⚠️ A EXTRAÇÃO MOVEU UM ACUSADOR DE SUÍTE — e agora são dois, um em cada

Trocar `Página N · Nome` por `Nome · Página N` no `MarginHighlight` dava **1 acusador, e
ele estava em `book.test.tsx`**. Ou seja: depois da extração, o formato da linha de mono
**da tela do dia** passou a ser guardado por um teste que vive na suíte da tela do
**livro**. É exatamente o efeito que a nota 6 diz ter evitado ao fazer o módulo neutro, só
que na direção oposta — o módulo não é exportado de nenhuma tela, mas o único acusador
dele vive numa só.

⚠️ **Não é regressão**, e a medição é o argumento: em `dcac49a`, antes da extração, o
`day-note.test.tsx` **também** não assertava o formato da linha (só a presença do trecho).
A extração não apagou guarda nenhuma; ela revelou uma que nunca existiu.

Escrito o `it()` na suíte do dia (`⚠️ writes the mono line as "Página N · Nome", in THIS
order`), com fixture hostil: `Maria Rita` não é quem está lendo (`Marcos`), e a página
(167) não coincide com id nenhum — então "escreveu 'Você'", "passou o `userId` como nome" e
"trocou a ordem dos dois" ficam todos vermelhos. O mesmo mutante agora dá **2 acusadores**,
um em cada suíte.

### 20. ⚠️ O LINK DO CORPO — o único que a pessoa vê no celular — não era clicado por teste nenhum

A 44b trocou o teste de navegação para clicar **o da margem**, que é o que nasceu na fatia.
A troca estava certa (o da margem era o novo), mas o do corpo ficou guardado por uma
substring de classe. Somado ao MR7, o caminho do celular para o acervo estava guardado por
nada.

Escrito o `it()` `⚠️ navigates from the link in the BODY too — the only one on a phone`.
Mutante: trocar o `Link` do roteador por âncora crua no corpo → **1 acusador**, e é ele; a
suíte inteira antes dele não pegava a troca.

### 21. ⚠️ A ABERTURA DE LIVRO ERA SEIS IDAS AO BANCO EM FILA — medido, e paralelizado

A 44b acrescentou **três** `await` sequenciais sobre os quatro que já existiam. Os seis são
independentes: nenhum usa o resultado do outro, todos recebem o mesmo `book.id` já
resolvido.

**Medido contra o Postgres de desenvolvimento** (200 amostras, 20 de aquecimento, no livro
real do banco do dono, **só leitura**, nenhum write):

```
SEQUENCIAL (6 awaits): n=200  mediana=3,68ms  p90=4,09ms
Promise.all (6)      : n=200  mediana=1,03ms  p90=1,39ms
delta mediana: 2,64ms  (71,9% do sequencial)

SÓ AS TRÊS DA 44b, sequencial : mediana=1,75ms
SÓ AS TRÊS DA 44b, Promise.all: mediana=0,79ms   delta: 0,97ms
```

**Decisão com o número na mão: paralelizar.** 2,64 ms é pouco em absoluto, mas é **71,9% do
tempo de banco da requisição principal desta tela**, e em localhost a ida de rede é quase
zero — com RTT de verdade a conta piora linearmente, porque o que se paga são **seis**
viagens em vez de uma.

⚠️⚠️ **O `bookForActor` fica FORA do `Promise.all`, e isso é regra de tenant, não estilo.**
Quem não é membro não pode descobrir nem o TAMANHO do acervo do clube: a autorização vem
antes, sozinha, e só o que ela libera parte em paralelo. O acusador disso é o `it()` que já
existia (`never counts anything when the actor is not a member`).

⚠️ **E o paralelismo tem acusador SEM cronômetro** (§7.3, *"contador de chamadas, nunca
cronômetro"*). Um `expect` de duração seria a asserção que se autoajusta do §7.8 com roupa
de performance: verde ou vermelha conforme a máquina. A propriedade é **estrutural** — *as
seis chamadas partem antes de a primeira responder* — e se mede com os contadores que os
fakes já têm: a primeira leitura fica presa numa promessa que o teste controla, e as outras
cinco já têm de estar CONTADAS enquanto ela não respondeu. Em fila, quatro delas nem teriam
sido chamadas. O `it()` é `⚠️ fires the six content reads TOGETHER, not one after the
other`, e o vermelho antes da implementação foi `expected +0 to be 1`.

### 22. ⚠️ AS OUTRAS AFIRMAÇÕES FALSAS, corrigidas nos dois lugares

- **"`lastActiveByBook` é a ÚNICA leitura de coleção do projeto que promete ordem"**
  (`BACKLOG.md`, bloco 44b). Caem três coisas, medidas: (a)
  `usecases/ports/activity-event-repository.ts:101-102` já diz, desde a decisão C da Tarefa
  33, que **ele** é o único que promete — e promete a **mesma** ordem, com a mesma
  justificativa do empate no milissegundo; (b)
  `usecases/ports/reading-plan-item-repository.ts:98` promete `order` crescente; (c) o
  `lastActiveByBook` **não é leitura de coleção** — devolve um registro ou `null`. Havia
  **duas afirmações de unicidade que se contradiziam** sobre a mesma propriedade, em dois
  arquivos: é a lição nº 3 do MVP 1 aplicada a uma AFIRMAÇÃO em vez de a um código. A frase
  do `BACKLOG` foi riscada e corrigida no lugar dela, a do port do `ActivityEvent` ficou
  **precisa** (vale para a família `find(filter)`, e as outras duas leituras ordenadas estão
  nomeadas ali), e o docblock do `lastActiveByBook` **cita o precedente**.
- **A conclusão da nota 6** ("preservadora de comportamento por construção" porque
  927 = 927): corrigida na própria nota 6, porque a frase errada era a conclusão dela.
- **O docblock do `activeCountByBook` do fake do grifo DELEGAVA o endereço do §7.10**
  (*"está escrito no irmão deste método"*) enquanto os outros três nomeavam o próprio
  acusador. Um endereço que manda procurar noutro arquivo é a classe de defeito que o
  `dayRange` do `CLAUDE.md` registra: o próximo leitor procura, não acha o nome, e escreve
  um terceiro. Nomeado.

### 23. Os números desta rodada (2026-09-23)

| gate | antes (fim da 44b) | depois |
| --- | --- | --- |
| `pnpm -r test` — shared | 607 | **607** |
| — ui | 303 | **303** |
| — backend | 1987 | **1994** (+7) |
| — app | 931 | **937** (+6) |
| `test:integration` | 642 | **642** |
| `typecheck` · `lint` · `prettier --check` | verde | **verde** |
| chunk de entrada | 444.876 B | **445.040 B** (**+164**; folga 4.960) |
| CSS | 35.229 B | **35.279 B** (+50) |
| `index.html` · editor | 1.638 B · 449.522 B | **iguais** |
| precache | 26 / 1190,63 KiB | 26 / **1190,84 KiB** |
| `book.tsx`, contador canônico | 408 | **414** (teto **420**, folga 6) |
| `day-note.tsx` · `margin-highlight.tsx` | 478 · 45 | **iguais** |

⚠️ **A regra 11 da spec pedia aviso acima de ~1.500 B, e o dono pediu aviso acima de ~800 B
nesta rodada: os +164 ficam bem abaixo dos dois.** Eles são os dois filetes e o fragmento
que embrulha o segundo — o `Promise.all` é backend e não entra no pacote do PWA.

Os +7 do backend: **5** do `domain/__tests__/newest-first.test.ts`, **1** do desempate do
último grifo e **1** do paralelismo. Os +6 do app: **4** em `book.test.tsx` (ordem e
filetes, o filete sem grifo, o `border-b` das linhas, o grifo sem página), **1** do link do
corpo e **1** na suíte do dia (o formato da linha de mono).

### 24. O que tentei e não deu certo

1. **Assertar `plan.findByBookCalls` no teste de paralelismo.** O contador do fake só
   incrementa quando o método de verdade roda — e ele fica preso atrás do portão do teste.
   A chegada passou a ser marcada por uma variável local, e o contador continua sendo o
   instrumento das outras cinco leituras. O vermelho intermediário (`expected +0 to be 1`)
   era do teste, não da implementação.
2. **Assertar `'h-a'.localeCompare('ha') === 0`** como o par em que as duas comparações
   discordam. **Medido antes de escrever:** dá **−1**, igual ao code point — o ICU do Node
   não ignora hífen na força padrão. O par que discorda de verdade é a **maiúscula**
   (`'A'.localeCompare('a')` = 1, `'A' < 'a'` = true), e é esse que está no teste. Fica
   registrado porque a primeira versão parecia razoável e teria sido uma afirmação sobre o
   `Intl` escrita sem medir — exatamente o que o §7.1 registra sobre afirmações a respeito
   do banco.
3. **Ler a linha de mono com `section.querySelector('span.font-mono')`.** O primeiro
   `.font-mono` da seção é o `Eyebrow` do rótulo, não a linha do grifo: o teste falhava com
   `expected 'Último grifo' to be 'Zeca'`. A linha certa é a que fica **ao lado da
   bolinha** (`dot.nextElementSibling`), e as duas suítes passaram a lê-la assim.
4. **Ancorar o conserto do MR7 por `expect(plan.findByBookCalls).toBe(1);` sozinho.** A
   linha aparece **duas** vezes em `get-book-with-plan.test.ts`, e o script ancorado
   estourou como devia. Ancorado num bloco maior. É a razão de o protocolo contar a âncora
   em vez de confiar num `replace`.
5. **Escrever a prosa do `BACKLOG.md` por heredoc de bash.** Estourou com
   `unexpected EOF while looking for matching`. O texto passou a ser escrito num arquivo e
   inserido por script `.mjs` ancorado, que é a regra do repositório — e o `BACKLOG.md` é
   CRLF: conferido depois, **0 LF soltos**.

### 25. Uma pergunta aberta para o dono

O teto novo do `book.tsx` é **420** e a tela está em **414**: **6 linhas de folga**. A
Tarefa 45 acrescenta o `StreakSeal` (a contagem da linha (c) da Tarefa 44 ainda aponta para
ela), e a margem desta tela já tem **três** seções mais dois filetes. Se a 45 encostar no
teto, o corte por ASSUNTO está desenhado e é o mesmo que a nota 7 já dizia — **o cabeçalho
sai, a margem fica** —, mas ele é uma fatia própria e não cabe de carona. **Não foi feito
porque ninguém pediu**, e cortar uma tela no meio de uma rodada de correção é o oposto do
que uma rodada de correção existe para fazer.

