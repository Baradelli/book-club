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
| **G** | **Três chaves ganham consumidor; as de "Último grifo" nascem** | `pages.book.inBook.{heading,notes,highlights}` existem desde a Tarefa 40 e estão sem consumidor (`pt.ts:399-403`). ⚠️ "Último grifo" e "Ver o acervo do livro" **não existem** e são **chaves novas** — a regra 9 da Tarefa 44 dizia "nenhuma chave nova", e ela valia **lá**; aqui o dono abriu escopo e elas entram |
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

7. **Os dois blocos só existem na margem**, que só existe acima de 1120px.
   ⚠️ **Guarda de visibilidade, não só de presença no DOM.** A rodada de correção da 44
   fechou dois mutantes exatamente assim (a legenda escondida por media query com 926 testes
   verdes). **Mutante:** esconda o bloco em toda largura → acusa.

8. **`aria-hidden` no que fala em dobro.** A bolinha da caneta em `:214` é decoração ao lado
   de um texto que já diz a página e o nome. **Mutante:** tire o `aria-hidden` → acusa.
   É a lição nº 16 do MVP 2, e a 44 pagou por ela.

9. **Nenhum acesso a banco fora de um Repository. Sem `$queryRaw`.**

10. **O tamanho, pelo contador canônico** — o comando está em `acervo.tsx:115-126` e é *"o
    único do projeto"*. ⚠️ **Não use `wc -l`**: a rodada de correção da 44 caiu exatamente
    nisso, comparando `wc -l` com um teto que era de outra unidade. `book.tsx` está em
    **356** linhas canônicas, e o dono registrou que **fica**; esta fatia acrescenta a ele.
    Se o acréscimo empurrar demais, **extraia e diga por medição o que saiu e para onde**.

11. **O orçamento de bytes, colado antes e depois.** Entrada em **443.693 B** contra o teto
    de **450.000** — ⚠️ **6.307 B de folga, e ainda faltam as Tarefas 45, 46, 47 e 48**. A 44
    custou 2.600 B. Se esta fatia comer mais de ~1.500 B, **diga**, porque a 46 e a 47 são as
    caras e a 48 é que decide o veredito do teto.

12. **Varredura de caracteres invisíveis** nos arquivos do diff, **provando antes que ela
    morde** com um soft hyphen e um NBSP plantados.

---

## Definição de pronto

- [ ] Os três métodos estreitos existem nos ports, nos fakes e nas implementações Prisma,
      com o vocabulário e o motivo escritos ao lado.
- [ ] `getBookWithPlan` devolve as duas contagens e o último grifo; o schema em
      `packages/shared` foi estendido, e back e front importam de lá.
- [ ] **A contagem está certa acima de 500**, provada por teste e pelo mutante da regra 2.
- [ ] O arquivado não conta, provado por teste e mutante.
- [ ] O corte de tenant provado com fixture **hostil** (ids diferentes).
- [ ] Teste de contrato contra o Prisma real para os três métodos.
- [ ] A margem do desktop mostra "Neste livro" e "Último grifo" como o artboard desenha,
      com `Eyebrow`, `GrifoText` e os filetes.
- [ ] `pages.book.inBook.{heading,notes,highlights}` ganham consumidor; as chaves de
      "Último grifo" e "Ver o acervo do livro" nascem em `pt.ts`.
- [ ] Os três links vão para `acervoPath(bookId)`; a pré-aplicação do filtro de tipo está
      **registrada como território da Tarefa 46**, não feita aqui.
- [ ] A varredura anti-culpa passa em todos os estados novos, e as contagens estão
      justificadas por escrito como inventário.
- [ ] **Nenhuma migration. `schema.prisma` intocado.**
- [ ] Gates colados antes e depois: `pnpm -r test` · `typecheck` · `lint` ·
      `prettier --check` · `build`, com o tamanho da entrada.
- [ ] Varredura de invisíveis, com a prova de que morde.

---

## Notas de reconciliação

_O executor anexa aqui o que mediu e divergiu da spec. Numere de 1 em diante. Se um número
desta spec estiver errado, **corrija-o aqui e no `BACKLOG.md`**, dizendo como mediu._
