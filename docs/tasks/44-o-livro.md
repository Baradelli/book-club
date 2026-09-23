# Tarefa 44 — O livro: o plano vira sumário, e a presença vira um glifo por leitor

> **Sétima fatia do MVP 3.5.** É a fatia que dá consumidor às três chaves que a Tarefa 40
> criou para esta tela e que estão sem uso desde então, e a que **liga a isenção do contador**
> pela primeira vez.
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** e as
> entradas **44** e **45** (elas têm a cláusula do `expectNoGuiltWithPlanPosition()`) ·
> `docs/tasks/43-*.md`, as **20 notas de reconciliação** — ⚠️ **é o mapa do que dá errado
> aqui** · `docs/tasks/41a-*.md`, a nota do `ListItemLook` — ⚠️ **ela prevê, por escrito, o
> que o compilador vai recusar nesta fatia** · `docs/CONVENCOES-CODIGO.md` §7.1, §7.4, §7.8,
> §7.9 · `docs/adr/0002-visibilidade-total-no-clube.md`.

---

## ⚠️ A fatia que a Tarefa 40 escreveu um bilhete para

Três coisas nasceram sem consumidor e esperam aqui. Medido (`grep` em `packages/app/src`,
fora de teste, **zero** ocorrências de cada):

| o que espera | nasceu em | onde entra |
| --- | --- | --- |
| `pages.book.plan.dayOfPlan` = `'Dia {{number}} de {{total}}'` | Tarefa 40 | o cabeçalho do dia de hoje |
| `pages.book.marks.{heading,read,wrote,hint}` | Tarefa 40 | a legenda "As marcas" da margem |
| `pages.book.inBook.{heading,notes,highlights}` | Tarefa 40 | o bloco "Neste livro" da margem |
| `COUNTER_EXEMPT_KEYS` + `expectNoGuiltWithPlanPosition()` | Tarefa 40 | ⚠️ **ligam aqui, pela primeira vez** |
| `ListItem variant="sumario"` + `tone` | Tarefa 41a | a linha do plano |
| `PresenceMark` | Tarefa 41b | as marcas |
| `BookSpine` | Tarefa 41b | o cabeçalho do livro |

⚠️ **A isenção do contador é o item que mais pode dar errado.** Ela existe desde a Tarefa 40,
foi medida, tem par positivo — e **nunca foi exercitada por uma tela**. A entrada 44 do
`BACKLOG.md` diz, por escrito: *"os estados que mostram a posição no plano chamam
`expectNoGuiltWithPlanPosition()`, não `expectNoGuilt()`"*. ⚠️ **Prosa não é guarda**: se você
chamar `expectNoGuilt()` por hábito — como as outras 247 chamadas fazem — a decisão F da
Tarefa 40 morre sem uma linha vermelha.

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | **A linha do plano vira `ListItem variant="sumario"`**, e `subtitleFor` migra de `subtitle` para `end` | A nota do `ListItemLook` (41a) **previu isto por escrito**: `subtitle?: never` no braço `sumario` faz o compilador cobrar a migração na cara. `book.tsx:599` passa `subtitle` hoje |
| **B** | ⚠️⚠️ **`PresenceMark` substitui o par `ReadMarks` + `PersonAvatar`**, e a distinção muda de natureza | Hoje é **glifo × letra**: um `<Check>` = leu, uma inicial = escreveu. No canvas os dois são **círculo com a inicial**, e o que distingue é **vazado × cheio**. ⚠️ **A propriedade que `book.test.tsx › tells READING apart from WRITING on the same row` mede deixa de existir na forma atual** — ela compara `querySelector('svg')` dos dois. **Reescreva a asserção para a propriedade nova, não a apague**: cheio × vazado tem de continuar distinguível **sem cor** |
| **C** | **`BookSpine` no cabeçalho**: 58×84 no celular, 88×128 acima de 1120px | `Livro.dc.html` e `LivroDesktop.dc.html`. O app não tem capa e não vai ter — a lombada é o que dá cara de estante sem pedir arquivo a ninguém |
| **D** | ⚠️ **O dia de hoje ganha `tone="today"`; os futuros, `tone="future"`** | `--surface-today` + filete `--gold-line` no de hoje; `--text-subtle` no futuro. ⚠️ **`--text-subtle`, e não `--text-faint`** — é **decisão do dono de 2026-09-21** (os três cinzas não cabem todos acima de 4,5:1), registrada na nota 5 da 41a. O `--text-faint` continua sem consumidor, **com guarda de primeiro uso ativa** |
| **E** | **A margem do desktop ganha três blocos**: "As marcas" (a legenda), "Neste livro" (as contagens) e "Último grifo" | `LivroDesktop.dc.html`. É a segunda tela a passar `rail` ao `Screen` |
| **F** | **O botão de "li hoje" marcado vira `variant="seal"`** | `Livro.dc.html`: "Li hoje — tirar a marca" em `--gold-soft` / `--gold-line` / `--gold-strong`. A variante nasceu na 41a **sem consumidor** — este é o primeiro |
| **G** | **Os rótulos de seção usam o `Eyebrow`** | A Tarefa 43 já o pôs em uso na tela do dia; aqui é o mesmo rótulo, e duas tipografias de rótulo na mesma tela é a "correção incompleta" que este bloco já pagou |
| **H** | ⚠️ **As contagens de "Neste livro" são INVENTÁRIO, não placar** | "Anotações do clube 18 · Grifos 9" contam o acervo do livro, não o desempenho de ninguém. Elas **não** casam o `COUNTER_SHAPE` (não têm `de` entre dois números) — mas escreva **por que** elas são legítimas, ao lado, para a próxima auditoria não as ler como o placar que o §1 do plano proíbe |
| **I** | **Nenhuma chave de catálogo nova** | As sete que esta tela precisa já existem, desde a Tarefa 40 |
| **J** | ⚠️ **Nenhuma outra tela é tocada** | `reading-marks.tsx` é da tela do livro e pode mudar; `home.tsx`, `acervo.tsx` e `busca.tsx` **não**. ⚠️ **Prove por mtime** — há sete fatias não commitadas e `git diff --name-only` não serve |

---

## As medidas, e de onde tirá-las

⚠️ **Escreva o script que imprime a linha citada ANTES da primeira citação.** Na 42, cinco
citações estavam erradas; na 43, o mesmo script pegou cinco erros da spec, um sétimo botão
que a prosa escondia, e o revisor amostrou 45 e todas conferiram. É a prática que mais se
pagou neste bloco.

| peça | artboard |
| --- | --- |
| cabeçalho do livro | `Livro.dc.html` (lombada 58×84, título, autor em Instrument Serif itálico, a linha de mono) · `LivroDesktop.dc.html` (88×128) |
| botão "li hoje" marcado | `Livro.dc.html` (46px) · `LivroDesktop.dc.html` (40px) |
| linha do sumário | `Livro.dc.html` e `LivroDesktop.dc.html` — condutor, meta em mono, o de hoje, os futuros |
| marcas | `Livro.dc.html` (18×18) · `LivroDesktop.dc.html` (19×19) · a legenda da margem |
| "Dia {{number}} de {{total}}" | `Inicio.dc.html` e `InicioDesktop.dc.html` — ⚠️ **o canvas o desenha no INÍCIO; confirme onde ele cabe nesta tela e declare se divergir** |
| margem | `LivroDesktop.dc.html` — os três blocos |

---

## As regras

1. **TDD estrito**, e ele vale para `packages/app` também.

2. ⚠️⚠️ **A decisão B com a propriedade reescrita, não apagada.** O `it()` de hoje
   (`tells READING apart from WRITING on the same row`) mede glifo × letra. A propriedade que
   **sobrevive** é: *leu e escreveu* tem de ser distinguível de *só leu* **sem depender de
   cor**. Reescreva para cheio × vazado e **mantenha a força**.
   **Mutantes:** (i) cheio e vazado com o mesmo preenchimento → acusa; (ii) a inicial some de
   um dos dois → acusa; (iii) a distinção passa a ser só matiz → acusa.

3. ⚠️⚠️ **A decisão da Tarefa 40 liga aqui, e é a regra que mais pode morrer em silêncio.**
   Os estados desta tela que mostram `dayOfPlan` chamam **`expectNoGuiltWithPlanPosition()`**.
   **Mutante obrigatório:** troque por `expectNoGuilt()` → **tem de ficar vermelho**.
   ⚠️ **Se ficar verde, a isenção da Tarefa 40 nunca foi exercitada e a decisão F dela é
   letra morta** — e aí o achado é maior que a fatia: reporte.

4. **A decisão A pelo compilador.** O `tsc` vai recusar o `subtitle`; **cole o erro no
   relatório**. É a previsão da 41a se cumprindo, e vale registrar que se cumpriu.

5. ⚠️ **A decisão D com o cinza certo.** `--text-subtle` no dia futuro, **não** `--text-faint`.
   **Mutante:** use `text-faint` → a guarda de primeiro uso da Tarefa 39 tem de acusar.

6. **A decisão F com acusador.** O `seal` nasceu na 41a sem consumidor; este é o primeiro.
   **Mutante:** volte para `ghost` → tem de acusar.

7. ⚠️ **A varredura anti-culpa em TODOS os estados**, e com atenção à decisão H: as contagens
   de inventário não podem virar placar. **Mutante:** escreva "18 de 27 anotações" → o
   `COUNTER_SHAPE` tem de acusar, **mesmo com a isenção ligada**. É o caso (b) do par positivo
   da Tarefa 40 chegando à tela de verdade.

8. **O corte de tenant não regride.** Esta tela já pede membros pelo clube do livro; se você
   tocar naquele efeito, o acusador tem de continuar mordendo.

9. ⚠️ **Nenhuma chave nova, nenhuma rota nova, nenhum schema.** As contagens de "Neste livro"
   saem do que a tela já carrega. **Se precisar de uma contagem que a API não devolve, PARE
   e reporte** — não invente endpoint e não conte errado.

10. ⚠️ **Os documentos, com riscar-e-explicar e data:**
    - **`docs/new-ui.md` §A.5 itens 3, 4 e 5** — as marcas, o sumário e a lombada **fecham**
      aqui; risque com a fatia;
    - **`docs/BACKLOG.md`** — o número do chunk medido, para a 45 saber a folga.

11. **Gates, com os números medidos ao fim da 43 (2026-09-22, tudo verde):**

    | | arquivos | testes |
    | --- | --- | --- |
    | `@clube/shared` | 22 | **601** |
    | `@clube/ui` | 34 | **303** |
    | `@clube/backend` (unit) | 85 | **1975** |
    | `@clube/app` | 35 | **914** |

    Build: entrada **441.093 B** (teto 450.000 — sobram **8.907**) · CSS **35.074 B** ·
    `index.html` **1.638 B** · precache **26 / 1186,79 KiB** · editor **449.522 B** pelo `ls`.
    ⚠️ **`BookSpine` e `PresenceMark` entram nesta fatia** — os dois estavam podados. **Meça
    antes de fechar; se a entrada passar de 450.000, PARE e reporte.**

---

## Definição de pronto

- [x] A linha do plano é `variant="sumario"`, com `subtitleFor` em `end` — e o erro do `tsc`
      que forçou a migração está colado no relatório.
- [x] `PresenceMark` no lugar do par; a propriedade "distinguível sem cor" **reescrita e com a
      mesma força**; os três mutantes da regra 2 acusaram.
- [x] ⚠️ **`expectNoGuiltWithPlanPosition()` nos estados com `dayOfPlan`, e o mutante da regra
      3 ficou VERMELHO.**
- [x] O par positivo da regra 7 entregue: um placar plantado é acusado **com a isenção ligada**.
- [x] `BookSpine` nos dois tamanhos; `seal` com consumidor; `Eyebrow` nos rótulos.
- [x] Dia de hoje com `--surface-today` e filete de ouro; futuro em `--text-subtle`, e o
      mutante do `text-faint` acusou.
- [x] A margem com ~~os três blocos~~ **UM** bloco ("As marcas"); ⚠️ **os outros dois
      PARARAM pela regra 9 — veja a nota nº 2.** "Neste livro" pede uma contagem que a API
      **não devolve**; "Último grifo" pede um rótulo que **não existe no catálogo**.
      ~~`pages.book.inBook.*` continua sem consumidor, e a decisão volta para o dono.~~
      ⚠️⚠️ **ADIADO, com decisão do dono de 2026-09-22:** "Neste livro" e "Último grifo"
      **saem desta tarefa e viram a Tarefa 44b**
      (`docs/tasks/44b-neste-livro-e-o-ultimo-grifo.md`). O dono **abriu
      exceção ao fora-de-escopo do MVP 3.5** e autorizou backend para elas — a contagem pede
      rota (ou envelope com total) e o "Último grifo" pede chave. `pages.book.inBook.*` fica
      sem consumidor **até a 44b**, e isso deixou de ser dívida aberta: é encomenda com
      endereço. O item desta fatia está fechado no que ela podia entregar.
- [x] Nenhuma chave, rota ou schema novo. ~~Nenhuma outra tela tocada~~ — ⚠️ **verdadeiro
      na fatia, emendado na rodada de correção:** a decisão **D1 do dono, de 2026-09-22**,
      mandou reaproveitar o `formatClubMonth`, que morava em `home.tsx`. Ele saiu para
      `pages/club-month.ts` e `home.tsx` passou a importá-lo. **A decisão J da spec foi
      emendada pelo dono, e só para este import** — provado por `git diff`: saem o
      `isClubMonth` do import, o corpo da função com o docblock, e entra uma linha de
      `import`; o render não mudou. ⚠️ A linha ficou marcada por inércia depois que o fato
      mudou — é a classe de defeito que este bloco mais paga, e foi por isso que ela foi
      reescrita em vez de simplesmente desmarcada.
- [x] `new-ui.md` §A.5 itens 3, 4 e 5 riscados-e-explicados.
- [x] Gates verdes, com o chunk medido e o custo de cada componente que entrou.
- [x] Varredura de caracteres invisíveis sobre os arquivos do diff, **provando antes que ela
      morde** com um soft hyphen e um NBSP plantados.


---

## Notas de reconciliação (2026-09-22, medidas na execução)

> Esta seção **não reescreve nada acima**. Ela registra o que foi **medido** ao executar, nos
> pontos em que a spec ou o canvas descreviam outra coisa. Molde: a seção equivalente das
> Tarefas 39 a 43.
>
> ⚠️ **Todo número aqui tem DATA e COMANDO**, porque a classe de erro que a auditoria da 43
> nomeou é "número medido num instante e escrito como se fosse permanente".

### 1. ⚠️⚠️ A ISENÇÃO DO CONTADOR FOI EXERCITADA — e o acusador dela teve de NASCER

> ⚠️⚠️ **ESTA NOTA FOI CORRIGIDA NA RODADA DE 2026-09-22 (nota nº 11). A afirmação central
> dela — "o mutante sobreviveria POR CONSTRUÇÃO" — é FALSA, e a medição está na nota 11.**
> O texto original fica **riscado e explicado**, não apagado: o erro é a lição.

O mutante obrigatório da regra 3 (trocar `expectNoGuiltWithPlanPosition()` por
`expectNoGuilt()`) **ficou VERMELHO**. Mas ~~ele só ficou porque um acusador nasceu nesta
fatia~~ **hoje ele fica vermelho sozinho, no `it()` em que a troca acontece**, e a razão da
confusão vale registrar:

~~**a troca AFROUXA uma asserção.** A variante mede tudo o que a de sempre mede **e** exige
≥ 1 subtração efetiva; trocá-la pela de sempre remove uma exigência. Uma asserção removida
nunca fica vermelha sozinha — a suíte inteira continua verde. Ou seja: **sem um pino de
fonte, o mutante da regra 3 sobreviveria por construção**, e a spec não poderia ter sido
cumprida como escrita.~~

⚠️ **O que era verdade e o que não era.** Era verdade que, **daquela forma**, a variante
media tudo o que a de sempre media e mais uma coisa — ela **chamava** `expectNoGuilt()` e
somava `expect(removed).toBeGreaterThan(0)`. Era falso que isso fosse "por construção": o
superconjunto vinha da **forma ANINHADA do helper**, que é uma escolha, não uma lei. Duas
asserções sobre o mesmo número podem ser **mutuamente exclusivas** em vez de encaixadas, e
aí a troca fica vermelha por si. Veja a nota nº 11.

~~Nasceu `book.test.tsx › ⚠️ scans the plan-position states with the EXEMPTION-EXERCISING
variant (task 40, decision F)`, que lê o próprio fonte (`testSource()`) e exige **≥ 45**
chamadas da variante — piso **escrito à mão** (§7.8), não recontado do arquivo.~~
**Esse pino foi APAGADO na rodada de correção**, junto com o `testSource()` que ele
justificava.

| mutante | acusadores (pino, 2026-09-22) | acusadores (hoje, sem pino) |
| --- | --- | --- |
| trocar **todas** as chamadas da variante pela de sempre | 1 | **42** |
| trocar **UMA** chamada (o defeito realista) | 1 | **1**, e no `it()` certo |
| a posição VAZANDO num estado sem dia de hoje (o defeito inverso) | **0** | **8** |

E um segundo sinal, colhido durante o TDD: os três primeiros testes desta fatia ficaram
vermelhos com `expected 0 to be greater than 0` **antes** de a frase entrar na tela — ou
seja, a variante morde por si nos estados certos.

⚠️ **E o número que esta nota dizia dos estados sem posição estava errado:** ela e o
docblock do pino falavam em "os dez estados"; `grep -c 'expectNoGuilt();'` em
`book.test.tsx` dava **onze** (linhas 875, 1369, 1775, 2006, 2160, 2216, 2232, 2274, 2320,
2354, 2386, conferidos um a um e todos legítimos). Hoje **nenhum número desses precisa ser
escrito**, porque nada o confere — e escrever número que ninguém confere é o que faz o
próximo leitor confiar nele.

### 2. ⚠️⚠️ DOIS DOS TRÊS BLOCOS DA MARGEM PARARAM — a regra 9 mordendo, com a medição

A decisão E pede três blocos. **Um entrou.** Os outros dois pararam, e a regra 9 é explícita
("se precisar de uma contagem que a API não devolve, PARE e reporte"):

**(a) "Neste livro" — a API não devolve contagem nenhuma.** `GET /books/:bookId` responde
`bookWithPlanResponseSchema` = `book` + `planItems` + `writers` + `readers`, e o docblock
daquele schema diz por escrito: *"⚠️ E **nenhum contador**: nem `readDays`, nem total, nem
percentual"*. As únicas fontes de nota e grifo são `GET /clubs/:clubId/notes` e
`/highlights`, que devolvem **array**, cortado em `FIND_ROW_LIMIT = 500`
(`prisma-note-repository.ts:35` e `prisma-highlight-repository.ts:53`, com
`orderBy createdAt desc`). Contar o `length` de uma lista truncada publica um número
**errado** como fato — e a regra 9 proíbe as duas saídas: inventar endpoint e contar errado.

⚠️ **E isto NÃO é o mesmo caso que a Tarefa 43 declarou aceitável.** Lá o corte de 500 truncava
uma **lista** (some um grifo antigo da margem); aqui ele corromperia um **número apresentado
como total**. Lista truncada é registro; contagem truncada é mentira.

**(b) "Último grifo" — o rótulo não existe.** O bloco precisa da frase "Último grifo"
(`LivroDesktop.dc.html:212`), e `grep` no `pt.ts` não acha nenhuma chave com esse valor.
Chave nova é proibida pela mesma regra 9.

**Consequência a registrar:** `pages.book.inBook.{heading,notes,highlights}` **continua sem
consumidor**. Das sete coisas do bilhete da Tarefa 40, **cinco** ligaram nesta fatia e **uma**
(o trio do `inBook`) ficou. ~~**Pergunta aberta para o dono:**~~ **FECHADA pelo dono em
2026-09-22:** contagem de acervo no livro pede ou uma rota de contagem, ou um envelope com
total nas duas listagens — e o dono **abriu exceção ao fora-de-escopo do MVP 3.5** e
autorizou backend para isso, numa fatia própria: **a Tarefa 44b**, com "Neste livro" e
"Último grifo" dentro dela.

---

⚠️⚠️ **REFORÇO DE 2026-09-22 (rodada de correção) — a parada estava MAIS certa do que esta
nota diz, e é preciso escrever por quê.**

O texto acima defende a parada por **ausência**: "a API não devolve contagem nenhuma". O
revisor mediu e achou o contrário — **havia um número quase certo à mão, e ele estaria
errado**:

- `Note` tem `@@unique([planItemId, userId])` (`schema.prisma`; a fidelidade está registrada
  no §7.1 do `docs/CONVENCOES-CODIGO.md`, 2ª aparição). Logo, somar os `writers[].userIds`
  que `GET /books/:bookId` **já devolve** daria a contagem **exata** das anotações **do
  plano** — sem rota nova, sem schema novo, sem truncamento;
- **e essa contagem cegaria as AVULSAS.** O mesmo índice único **não compara `NULL` com
  `NULL`**: `planItemId` é anulável e a nota avulsa é ilimitada por decisão do
  `BACKLOG`. Elas não aparecem em `writers` — nem uma. O número sairia plausível,
  estável, e **errado para baixo**, sem nada acusando;
- **e o `Highlight` não tem sobreposição nenhuma** na resposta do livro: para o grifo não há
  nem o número errado.

⚠️ **A lição é o formato do erro, não o número.** Um `undefined` faz a pessoa parar; um
número plausível a faz seguir. A regra 9 mandou parar e a parada foi certa — mas o motivo
escrito ("a API não devolve") é o motivo **fraco**, e quem lesse só ele poderia "consertar"
com a soma dos `writers` na fatia seguinte, achando que tinha achado a saída.

⚠️ **E FALTAVA O CUSTO, que é o argumento independente:** buscar `GET /clubs/:clubId/notes`
e `/highlights` para contar seria uma **terceira requisição** nesta tela, contra a **regra 1
da Tarefa 28** — a fatia que tirou o acervo daqui justamente por causa dela. Mesmo que o
truncamento não existisse, o orçamento de requisições barraria.

### 3. ⚠️ A POSIÇÃO NO PLANO NÃO ESTÁ DESENHADA NESTA TELA — divergência declarada

A tabela "As medidas" da spec já avisava ("o canvas o desenha no INÍCIO; confirme onde ele cabe
nesta tela e declare se divergir"). **Medido com o script que imprime a linha citada**, em
2026-09-22:

| arquivo:linha | o que está lá |
| --- | --- |
| `Inicio.dc.html:41` | `Dia 11 de 30` em mono 10px, `--gold` |
| `InicioDesktop.dc.html:42` | `Dia 11 de 30`, o mesmo |
| `DiaDesktop.dc.html:51` | `Dia 11 de 30 · sexta-feira, 18 set 2026` |
| `Livro.dc.html` / `LivroDesktop.dc.html` | **não existe** — zero ocorrências nos dois |

Ela entrou na **linha de monoespaçada do cabeçalho**, que é o slot que os dois artboards do
livro ocupam com a meta do mês: `Livro.dc.html:50` = `Setembro de 2026 · 288 p.` e
`LivroDesktop.dc.html:53` = `Setembro de 2026 · 288 páginas · 30 dias`.

⚠️ ~~**E o conteúdo original daquela linha NÃO pôde ser reproduzido:** o mês por extenso e o
"p."/"páginas" seriam chaves NOVAS, proibidas pela regra 9.~~

⚠️⚠️ **A FRASE RISCADA É FALSA NA METADE DO MÊS, e o revisor mediu.** O mês por extenso
**não é chave nenhuma**: `home.tsx:182 formatClubMonth` já formatava `"2026-09"` →
`"setembro de 2026"` com `Intl` desde a Tarefa 16, sem passar pelo catálogo, e
`book.month` está em `bookResponseSchema` (`packages/shared/src/book.ts:139` — o `:140` que
a decisão do dono cita é o `coverUrl` de baixo; conferido com o script que imprime a linha),
que **esta tela já carrega**. Ou seja: a regra 9 nunca proibiu o mês — a fatia se proibiu sozinha.

**Decisão do dono, 2026-09-22:** a linha vira **`Setembro de 2026 · Dia 2 de 3`**. O
`formatClubMonth` foi **extraído** para `packages/app/src/pages/club-month.ts` e as duas
telas o importam de lá (§7.1: extrair, não copiar). ⚠️ A decisão J desta spec proibia tocar
`home.tsx`; **esta decisão do dono a emenda, e só para este import** — o `git diff` do
`home.tsx` tem exatamente três coisas: o `isClubMonth` que saiu do import, o
`formatClubMonth` que saiu do arquivo, e o import novo.

**O `"288 p."` continua fora**, e esse sim seria chave nova: conferido no `pt.ts`, a única
ocorrência de "páginas" nessa vizinhança é `bookForm.fields.totalPages = 'Total de páginas'`,
que é rótulo de campo de formulário.

A posição continua sendo a informação que a tela **já tem** e que a Tarefa 40 **já
traduziu** — e é ela que faz a isenção deixar de ser letra morta.

### 4. TRÊS MUTANTES SOBREVIVERAM, e os três eram "divergência declarada sem guarda"

É a classe que a nota nº 20 da Tarefa 43 nomeou, e ela reapareceu inteira. Os três, com o
número medido em 2026-09-22 e o efeito na tela:

| mutante | passava por | o que some / aparece na tela |
| --- | --- | --- |
| `rail={rail()}` (margem SEMPRE montada) | **925** testes do app | um `<aside>` de 320px e um filete vertical ao lado de "Carregando…" e do 404 |
| apagar `hidden min-[1120px]:flex` da lombada `lg` | **926** testes do app | **duas lombadas lado a lado** em toda largura |
| apagar `border-b-2 border-accent` do rótulo de seção | **926** testes do app | o traço de 2px que separa o cabeçalho do sumário (`Livro.dc.html:66`, `LivroDesktop.dc.html:65`) |

Os três ganharam acusador na mesma fatia, e os três foram remedidos depois: **1 acusador
cada**. O primeiro é o mais caro dos três, e ele repete uma lição já paga: a Tarefa 42 criou a
prop `rail` com **2 acusadores nascidos do caso VAZIO**, e a Tarefa 43 escreveu o mesmo
"ausente ≠ vazio" no `day-note.tsx` — nenhuma das duas guardas alcança esta tela.

⚠️⚠️ **E ERAM SEIS, NÃO TRÊS.** A auditoria de 2026-09-22 achou **outros três** da mesma
classe, todos passando por **926 testes verdes** — veja a nota nº 12. A classe não
reapareceu "inteira": ela reapareceu **em dobro**, e metade dela sobreviveu a uma fatia que
já sabia o nome dela.

### 5. ⚠️ O `it()` reescrito, e por que a propriedade mudou de natureza

`book.test.tsx › ⚠️ tells READING apart from WRITING on the same row` media **glifo × letra**:
`mark.querySelector('svg')` não-nulo e `mark.textContent === ''` de um lado; `svg` nulo e
`/^\p{Lu}+$/` do outro. **Essa propriedade deixou de existir na forma atual** — no canvas os
dois são o MESMO círculo com a inicial (`Livro.dc.html:73` e `:83`).

Reescrito para **vazado × cheio**, com as três metades: a mesma inicial nos dois (para a
distinção não poder vir do texto), o preenchimento (o vazado não pode ter **nenhum**
utilitário `bg-*`), e a fala (os dois `aria-label` continuam diferentes para a MESMA
pessoa). Os três mutantes da regra 2, medidos:

| mutante | acusadores | quem |
| --- | --- | --- |
| (i) vazado e cheio com o mesmo preenchimento | **4** | `presence-mark.test.tsx` ×2, `book.test.tsx` ×2 |
| (ii) a inicial some de um dos dois | **2** | `presence-mark.test.tsx` ×1, `book.test.tsx` ×1 |
| (iii) a distinção passa a ser só matiz (`bg-surface-2`) | **5** | `presence-mark.test.tsx` ×2, `book.test.tsx` ×2, `ui-source-scan` ×1 |

⚠️ **A asserção ficou MAIS apertada, não menos:** a versão antiga comparava a presença de um
`<svg>`, que um redesenho qualquer satisfaria; a nova recusa **qualquer** fundo no vazado, que
é o que a regra "sem depender de cor" quer dizer de verdade.

### 6. Os outros `it()` editados, e o porquê de cada um

- **`marks NO other day`** — duas asserções mudaram de FORMA. (a) `getAllByText('Hoje')` casa
  o texto INTEIRO de um elemento, e desde a decisão A a palavra divide o slot `end` com a
  referência ("Hoje · p. 31-58", como `Livro.dc.html:146` desenha); virou uma asserção sobre
  ONDE a palavra está, que diz mais do que a anterior. (b) a marca visual era o anel
  `ring-accent` da Tarefa 17, e o canvas não desenha anel nenhum — virou papel próprio mais
  filete dourado, **com asserção nova de que o anel não volta**;
- **`marks no day at all when the plan has no day of today`** — o mesmo `ring-accent` → `bg-surface-today`;
- **os helpers `avatarsIn`/`readMarksIn`** — o `data-read-mark` passou a ser um ENVOLTÓRIO,
  porque quem desenha as duas marcas agora é o mesmo componente de `packages/ui`, que não
  aceita atributo arbitrário. Alargar a API dele para um chamador seria o "peso" que a decisão
  B da 41a proíbe. ⚠️ **E o recorte NÃO virou recorte por `aria-label`**: seria circular —
  metade dos testes daqui mede justamente que os dois rótulos são diferentes.

### 7. ⚠️ O compilador cobrou a migração, como a 41a previu — e o erro tem uma forma inesperada

Colado do `pnpm --filter @clube/app typecheck`, 2026-09-22, com `variant="sumario"` e o
`subtitle` ainda no lugar:

```
src/pages/book.tsx(509,18): error TS2322: Type '{ …; subtitle: string; title: string;
  variant: "sumario"; }' is not assignable to type 'IntrinsicAttributes & ListItemProps'.
  Types of property 'variant' are incompatible.
    Type '"sumario"' is not assignable to type '"row"'.
```

⚠️ **O erro chega pelo lado OPOSTO ao que a nota da 41a descreve.** Ela diz
"`subtitle?: never` com `variant: 'sumario'` não compila", e o que o TypeScript de fato
reclama é do `variant`: o `subtitle: string` estreita a união para o braço `row` **primeiro**,
e aí o `"sumario"` é que não cabe. **A previsão se cumpriu; a mensagem não é a que o texto
faz esperar** — e quem procurar "subtitle" no erro não vai achar.

E a função mudou de nome junto: `subtitleFor` → `endFor`. Um nome que aponta para o slot
errado é a lição do `dayRange` do `CLAUDE.md` em miniatura.

### 8. Divergências canvas × entrega, declaradas

1. **O `h1` não se moveu.** O canvas põe a lombada à ESQUERDA do título (`Livro.dc.html:43-52`);
   o `h1` é do `Screen` desde a Tarefa 42, e trazê-lo para a tela mexeria no cromo de dez
   telas por causa de uma. A lombada abre o CORPO, com o autor e a posição ao lado;
2. **duas lombadas no DOM**, escondidas por media query — o tamanho é prop, o corte é CSS. Com
   guarda, depois do mutante sobrevivente da nota 4;
3. **o rótulo de seção diz "Dias do plano de leitura"** e o canvas diz "Plano de leitura"
   (`Livro.dc.html:67`). Encurtar seria chave nova; a chave existente (`pages.book.plan.label`)
   já nomeava a lista;
4. **o autor sai em `text-reading` (17,5px) nas duas larguras.** O canvas usa 17px no celular
   (`Livro.dc.html:49`) e **21px** no desktop (`LivroDesktop.dc.html:52`); nenhum dos dois está
   na escala de sete degraus da Tarefa 39, e meio pixel não paga um degrau novo — mas os 3,5px
   do desktop ficam registrados;
5. **a amostra da legenda usa a MINHA inicial**, não o "A" do canvas (`LivroDesktop.dc.html:185`):
   um "A" cravado seria texto de interface fora do catálogo. Sem `/me`, ela cai no glifo neutro
   do `PresenceMark`, que é o que a linha do plano já faz;
6. **a marca fica em 18px nas duas larguras** — o desktop desenha 19×19
   (`LivroDesktop.dc.html:72`). É decisão da Tarefa 41b, herdada sem reabrir;
7. **"Cheio = escreveu" aparece nas duas larguras.** O canvas a desenha só no celular
   (`Livro.dc.html:68`); esconder por media query seria **invisível para o teste**, que é a
   armadilha da nota nº 20 da Tarefa 43. A legenda desenhada da margem e esta frase convivem de
   propósito — uma é a frase curta ao lado do sumário, a outra tem as duas amostras.

### 9. Os números, com a data ao lado

**Medidos em 2026-09-22, ao fim desta fatia, tudo verde:**

| | antes (fim da 43) | depois |
| --- | --- | --- |
| `@clube/shared` | 601 | **601** |
| `@clube/ui` | 303 | **303** |
| `@clube/backend` (unit) | 1975 | **1975** |
| `@clube/app` | 914 | **926** |

Chunk de entrada **443.693 B** (era 441.093; **+2.600 B** — teto 450.000, **sobram 6.307**) ·
CSS **35.180 B** (era 35.074; **+106**) · `index.html` **1.638 B** e editor **449.522 B**
inalterados · precache **26 / 1189,43 KiB** (era 1186,79).

⚠️ **`BookSpine` e `PresenceMark` entraram aqui, e os dois estavam podados.** Os **+2.600 B**
são o preço dos dois mais o `Eyebrow`, o `MarginRail` e os ramos novos da tela, **menos** o
`PersonAvatar` e o ícone `Check` do lucide, que esta tela deixou de importar. ~~Restam
**quatro** componentes da 41b por consumir (`ContextBar`, `StreakSeal`, `GrifoText`,
`SaveIndicator` — os três últimos com consumidor em outras telas)~~, dentro dos 6.307 B que
sobraram.

⚠️ **A FRASE RISCADA ESTÁ ERRADA: resta UM.** Medido em 2026-09-22 com `grep` em
`packages/app/src` fora de teste — `ContextBar` está em `chrome.tsx:2` (Tarefa 42);
`GrifoText` e `SaveIndicator` estão em `day-note.tsx` (Tarefa 43). O único sem consumidor é
o **`StreakSeal`**, e ele entra na Tarefa 45. A frase contava **três componentes já pagos**
contra o orçamento de bytes do futuro — ou seja, ela reservava três vezes o dinheiro que
ainda falta gastar.

⚠️⚠️ **E O TAMANHO ESTAVA NA UNIDADE ERRADA.** ~~Contado com `wc -l`: `book.tsx` foi de 634
para 886 linhas e `reading-marks.tsx` de 293 para 331. O teto que a Tarefa 32b registrou era
~350 — ele foi ultrapassado…~~ **O teto de ~350 é do CONTADOR CANÔNICO** (o comando do
docblock de `acervo.tsx:115-126`, "o único do projeto"), e o `wc -l` conta docblock. Comparar
os dois é a mesma família de erro que esta nota diz querer evitar. Medido de novo, com o
comando certo, em 2026-09-22:

| | `book.tsx` | `reading-marks.tsx` |
| --- | --- | --- |
| antes da Tarefa 44 (commit `11c9171`) | 277 | 105 |
| fim da Tarefa 44 | **356** | **107** |
| fim da rodada de correção | **360** | **107** |

O crescimento da fatia foi **+99 / −20 = +79** linhas canônicas (`diff -w` sobre o texto já
passado pelo contador) — **~2× o "~40 de JSX"** que esta nota estimou. A rodada de correção
somou **+4**.

⚠️ **DECISÃO DO DONO, 2026-09-22: fica nos 360, sem corte e sem teto novo.** 356 (e agora
360) contra um teto que o próprio texto da 32b escreve como **"~350"** é aproximação, não
estouro. O que continua valendo é a lição nº 8 do MVP 1: quem dividir esta tela divide **por
assunto** (cabeçalho × sumário × margem), não por contagem de linha.

### 10. A varredura de invisíveis: 6 arquivos, zero ocorrências — e ela morde

Cobre NUL, NBSP, soft hyphen, ZWSP/ZWNJ/ZWJ, LRM/RLM, U+2028/U+2029, narrow NBSP, word joiner,
BOM e U+FFFD, com arquivo, linha e coluna. **Provado que morde antes de confiar nela:** com um
soft hyphen e um NBSP plantados num docblock do `book.tsx`, ela acusou os dois
(`book.tsx:165:14 SOFT HYPHEN`, `:165:22 NBSP`). O canário foi desfeito por `cp -p`, com
`md5sum -c` OK e conferência por conteúdo.

---

## Notas de reconciliação da RODADA DE CORREÇÃO (2026-09-22)

> Nove afirmações da execução caíram numa auditoria separada e **três mutantes sobreviveram**.
> Esta seção continua a numeração acima, de 10 para 11. O dono tomou **três decisões** (D1,
> D2, D3) na mesma data; elas estão nomeadas onde mordem.

### 11. ⚠️⚠️ O PINO DE FONTE MORREU — a afirmação que o justificava era FALSA

A nota nº 1 afirmava que o mutante obrigatório da regra 3 **sobreviveria por construção**,
porque "trocar a variante estrita pela frouxa remove uma asserção, e asserção removida nunca
fica vermelha sozinha". Daí um acusador que lia o **próprio fonte do teste** —
`book.test.tsx › ⚠️ scans the plan-position states with the EXEMPTION-EXERCISING variant`,
com `expect(exercising).toBeGreaterThanOrEqual(45)`.

⚠️ **A causa não era "construção", era a FORMA ANINHADA do helper.** Enquanto
`expectNoGuiltWithPlanPosition()` **chamava** `expectNoGuilt()` e somava uma exigência, ela
era superconjunto da outra — e superconjunto é uma escolha de desenho, não uma lei sobre
asserções. O desenho novo:

```
scanGuilt(): number                      // vocabulário + formato + cor + ADR 0002;
                                         // devolve QUANTAS frases isentas foram subtraídas
expectNoGuilt()                = expect(scanGuilt()).toBe(0)
expectNoGuiltWithPlanPosition() = expect(scanGuilt()).toBeGreaterThan(0)
```

As duas passaram a ser **mutuamente exclusivas**, e o mutante fica vermelho **no `it()` em que
a troca acontece**. Colado, com o pino já apagado:

```
× ⚠️ THE POSITION IN THE PLAN… > ⚠️ says WHERE today is in the plan, and the
  exemption actually SUBTRACTS it
  → expected 12 to be +0 // Object.is equality
  Tests  1 failed | 926 passed (927)
```

⚠️ **E ele é estritamente MAIS FORTE que o pino, medido:**

| mutante | pino de fonte | desenho novo |
| --- | --- | --- |
| trocar **uma** chamada pela de sempre | 1 | **1** (e no `it()` certo) |
| trocar **todas** as chamadas da variante | 1 | **42** (de 46; o pino dava 1) |
| a posição **VAZANDO** num estado sem dia de hoje | **0** | **8** |

(As 45 chamadas do fim da fatia viraram **46** com o `it()` do cabeçalho; a medição acima é
a de 2026-09-22, ao fim desta rodada.)

A última linha é o defeito **inverso**, que ninguém pegava: o pino contava ocorrências no
texto do arquivo e não olhava a tela. O mutante aplicado foi `{todayItem === undefined ?` →
`{false ?`, que rende "Dia 0 de 2" — o vazio anunciado que o §1 do plano proíbe.

⚠️ **OS DOIS META-TESTES DE `anti-guilt-dom.test.ts` ACOMPANHARAM SEM AFROUXAR.** Os casos
(a), (b), (b-mesmo-elemento) e (c) passaram a chamar a variante estrita, porque nos quatro a
frase isenta **está na tela**. A força é a mesma, mutante a mutante: apagar a subtração deixa
(a) vermelho; a regex larga deixa (b) vermelho; subtrair só a primeira ocorrência deixa (c)
vermelho. O par positivo/negativo da decisão F da Tarefa 40 continua provando que a isenção
**subtrai** — é literalmente o que `toBeGreaterThan(0)` exige. E nasceu um `it()` novo,
`⚠️ (f) the two variants are MUTUALLY EXCLUSIVE on the same DOM`, que pina a exclusividade
nos dois sentidos.

⚠️ **O CUSTO, declarado:** `expectNoGuilt()` deixou de ser neutra quanto à frase isenta e
passou a **recusá-la**. É seguro porque `COUNTER_EXEMPT_KEYS` tem **uma** chave
(`guilt-terms.ts:155-157`) com **um** consumidor de produção (`book.tsx`) — conferido por
`grep`. E a prova de que não quebrou nada: a suíte inteira do app ficou verde com a troca
(**927**, antes de o pino sair), sem tocar em nenhuma das outras 247 chamadas.

⚠️ **O `testSource()` morreu junto**, porque a única propriedade que o justificava deixou de
precisar dele. Fica um bilhete no lugar de cada um dos dois, dizendo o que foi medido — não
um silêncio.

### 12. ⚠️⚠️ MAIS TRÊS MUTANTES DA MESMA CLASSE, e um deles a fatia NOMEOU por escrito

Os três passavam por **926 testes verdes, zero acusadores**, e os três são "divergência
declarada sem guarda" — a classe da nota nº 20 da Tarefa 43, que a nota nº 4 desta fatia já
tinha citado **e** aplicado a três outros. Ou seja: a fatia conhecia a classe, escreveu o
nome dela, e deixou passar outros três.

| | mutante | o que acontece na tela | acusadores antes → depois |
| --- | --- | --- | --- |
| **M7** | tirar `aria-hidden="true"` do envoltório do `PresenceMark` na legenda da margem | o leitor de tela anuncia "Leu neste dia" **duas vezes** por linha — uma pelo `role="img"`+`aria-label`, outra pelo texto ao lado | **0 → 1** |
| **M12** | pôr `hidden` na legenda "Cheio = escreveu" | a frase some em **toda** largura, e o jsdom não vê CSS | **0 → 1** |
| **M15** | trocar `font-mono text-eyebrow uppercase tracking-[0.12em] text-muted` por `text-ui text-muted` na linha de mono do cabeçalho | a frase que justifica a fatia inteira perde a forma | **0 → 1** |

**M7** é a lição nº 16 do MVP 2 ("duas coisas que falam a mesma frase"), que o docblock de
`book.test.tsx › ⚠️ tells READING apart from WRITING on the same row` **cita nominalmente**.
As lombadas têm a asserção análoga (`⚠️ draws the typographic SPINE in the two sizes the
canvas measures`, `aria-hidden="true"` nas duas); a legenda não tinha. ⚠️ **O ponteiro é pelo
NOME do teste, nunca pela linha** (§7.4): a auditoria citou `:1194` e `:1872`, e as duas
linhas já andaram nesta mesma rodada. A guarda nova exige
`mark.closest('[aria-hidden="true"]') !== null` nas duas amostras **e** um par positivo —
pelo menos uma marca da tela continua falando, senão "silenciar tudo" passaria e o dia com
leitor viraria bolinha muda.

**M12** é o caso mais constrangedor: a **nota 8.7 desta própria fatia** escreve
*"esconder por media query seria invisível para o teste, que é a armadilha da nota nº 20 da
Tarefa 43"* — e não escreveu a guarda. O `<aside>` da margem tem a guarda análoga
(`not.toContain('hidden')`) três `it()` acima. **Nomear a armadilha não é a guarda.**

**M15** entra na nota nº 13, porque o conserto não foi uma asserção — foi tirar a cópia.

Os vermelhos, colados:

```
M7  × ⚠️ puts the MARKS legend in the margin, and the two samples differ by FILL (decision E)
M12 × ⚠️ labels the plan section with the Eyebrow, and hangs the marks hint beside it (decision G)
M15 × ⚠️ writes the header META LINE as an Eyebrow: the month, then the position
    (cada um: Tests 1 failed | 926 passed (927))
```

### 13. ⚠️ A LINHA DE MONO DO CABEÇALHO: o mês volta, e a tipografia deixa de ser cópia

**Decisão D1 do dono (2026-09-22).** A linha virou **`Setembro de 2026 · Dia 2 de 3`** — veja a
correção da nota nº 3 para por que o mês **nunca** foi chave nova.

⚠️ **E ELA ERA O TERCEIRO SÍTIO DE TIPOGRAFIA DE RÓTULO NO ARQUIVO** — dois pelo `Eyebrow`,
um copiado **byte a byte** (`font-mono text-eyebrow uppercase tracking-[0.12em]` +
`text-muted`, exatamente o que `packages/ui/src/components/eyebrow.tsx` monta com
`tone="muted"`). Mudar o `tracking` do componente faria este divergir em silêncio, e o M15
prova que nada acusava. Agora é o componente, e a guarda nova recusa a volta da cópia
(`expect(source).not.toContain('font-mono text-eyebrow')`).

⚠️ **O TOM FOI MEDIDO NO ARTBOARD CERTO, e a advertência do revisor procedia.**
`Inicio.dc.html:41` desenha `Dia 11 de 30` em `var(--gold)` — mas isso é a **home**. O slot
desta tela é o da meta do mês, e ali:

| arquivo:linha | o que está lá |
| --- | --- |
| `Livro.dc.html:50` | `font-size:9.5px; letter-spacing:0.1em; text-transform:uppercase; color:var(--text-muted)` — `Setembro de 2026 · 288 p.` |
| `LivroDesktop.dc.html:53` | `font-size:10px; letter-spacing:0.1em; …; color:#565b52` — `#565b52` **é** `--text-muted` no claro (`theme.css:122`) |

Então o tom é **`muted`**, que é o padrão do `Eyebrow`. **Divergência declarada:** o canvas usa
9,5px/0,1em no celular e 10px/0,1em no desktop; o `Eyebrow` é 10px/0,12em nas duas. ⚠️ A cópia
à mão que saiu daqui **já** tinha 10px/0,12em — a divergência é da Tarefa 44, não deste
conserto.

⚠️ **UM ACHADO DE BÔNUS, e ele é do §7.1: extrair GANHOU acusadores.** O `formatClubMonth`
saiu do `home.tsx` para `packages/app/src/pages/club-month.ts`. Medido por mutação: apagar o
`timeZone: 'UTC'` dele — o bug de um dia que faz "março de 2024" virar "fevereiro de 2024" em
qualquer fuso negativo — tinha **0 acusadores** enquanto ele era privado da home (nenhum teste
de lá asserta o mês formatado) e passou a ter **2**, os dois na tela do livro. O valor esperado
do teste novo é escrito **à mão** (`'março de 2024'`, §7.8), e é por isso que ele morde.

⚠️ **O `home.tsx` foi tocado, e a decisão J desta spec o proibia.** O dono emendou a decisão
**só para este import**; o `git diff` do arquivo tem três coisas e nada mais: o `isClubMonth`
que saiu do import de `@clube/shared`, o `formatClubMonth` que saiu do corpo (com o docblock,
que foi junto), e o `import { formatClubMonth } from './club-month'`.

### 14. Os achados menores, e o que se decidiu em cada um

- **B1 · asserção tautológica** (`book.test.tsx`, `tells READING apart from WRITING on the
  same row`): `const filled = avatars.find((a) => a.textContent === 'Z')` e, três linhas
  abaixo, `expect(filled.textContent).toBe('Z')` — os dois lados vindos do mesmo lugar, §7.8
  na versão mais curta possível. **Apagada**, com um comentário dizendo que quem asserta essa
  metade é o `throw` da busca. A outra linha (`expect(hollow.textContent).toBe('Z')`) fica: o
  `hollow` não foi escolhido pelo texto, então ela pode ficar vermelha.
- **B2 · "os dez estados" eram ONZE.** `grep -c 'expectNoGuilt();'` em `book.test.tsx` = 11
  (875, 1369, 1775, 2006, 2160, 2216, 2232, 2274, 2320, 2354, 2386), todos legítimos. ⚠️ Com o
  pino de fonte apagado, **esse número deixou de precisar ser escrito em lugar nenhum** — e
  não foi reescrito. Número que ninguém confere é número que o próximo leitor trata como
  medido.
- **B3 · o estado morto do `PresenceMark`.** `state: 'read' | 'wrote' | 'unread'`, e
  `'unread'` não tem consumidor de produção: `grep` fora de teste dá **zero**, e a única
  ocorrência é `presence-mark.test.tsx:42`, o teste que o guarda — guarda auto-referente.
  **Medido por mutação** (apagado o `if (state === 'unread') return null`): **1** acusador em
  `@clube/ui` (302/303) e **0** em `@clube/app` (927/927 **verdes**). **Decisão: FICA**, com
  o motivo escrito no docblock do componente — (1) apagá-lo estreitaria o tipo e a regra "não
  leu = nada" deixaria de estar escrita em lugar nenhum; (2) o consumidor tem endereço (a
  coluna de largura fixa do `ListItem` já existe, e é decisão de tela); (3) nenhuma decisão
  do dono desta rodada pediu mudança de API em `packages/ui`. ⚠️ **E a fragilidade ficou
  registrada junto:** o argumento do ALINHAMENTO que o docblock dava **não** é o que o mantém
  vivo hoje — a coluna de 44px do `ListItem` segura o alinhamento sozinha. Quem reabrir tem a
  medição e não precisa refazê-la.
- **M5 · o número errado no `BACKLOG`**, que é o arquivo que a próxima fatia lê: ele dizia
  *"os três mutantes da regra 2 acusaram (2, 1 e 3)"* e a nota nº 5 desta tarefa diz
  **4 · 2 · 5**. Corrigido no `BACKLOG`. O mutante (i) dá **4** (`@clube/ui` ×2,
  `@clube/app` ×2), como a nota 5 registra.
- **M6 · "restam quatro componentes da 41b"**: resta **um**. Corrigido na nota nº 9.

### 15. Os números desta rodada, com a data ao lado

**Medidos em 2026-09-22, ao fim da rodada de correção, tudo verde:**

| | fim da 44 | fim da correção |
| --- | --- | --- |
| `@clube/shared` | 601 | **601** |
| `@clube/ui` | 303 | **303** |
| `@clube/backend` (unit) | 1975 | **1975** |
| `@clube/app` | 926 | **927** |

O app ganhou **+2** (`⚠️ (f) the two variants are MUTUALLY EXCLUSIVE on the same DOM` e
`⚠️ writes the header META LINE as an Eyebrow`) e perdeu **−1** (o pino de fonte apagado).

Build: chunk de entrada **443.670 B** (era 443.693; **−23 B** — teto 450.000, **sobram
6.330**) · CSS **35.180 B**, `index.html` **1.638 B** e editor **449.522 B** **inalterados** ·
precache 26 / **1189,41 KiB**.

⚠️ **A entrada ENCOLHEU, e o motivo é o conserto do M4:** o `formatClubMonth` já estava no
bundle (a home o usa) e o `Eyebrow` já estava importado por esta tela; o que saiu foi a string
de classes copiada à mão. Um conserto de duplicação que devolve bytes é o argumento mais
barato que existe para não copiar.

### 16. A varredura de invisíveis desta rodada: 10 arquivos, zero ocorrências — e ela morde

Mesmo escopo de caracteres da nota nº 10 (NUL, NBSP, soft hyphen, ZWSP/ZWNJ/ZWJ, LRM/RLM,
U+2028/U+2029, narrow NBSP, word joiner, BOM, U+FFFD), sobre os **10** arquivos tocados aqui.
**Provado que morde antes de confiar nela**, com um NBSP e um soft hyphen plantados no
`club-month.ts`:

```
packages/app/src/pages/club-month.ts:33:7  NBSP
packages/app/src/pages/club-month.ts:33:16 SOFT HYPHEN
--- 10 arquivos, 2 ocorrencias
```

O canário foi desfeito por `cp -p`, com `md5sum` idêntico antes e depois
(`760b4d87826254f1e2a6c46d1771065f`), e a varredura real deu **10 arquivos, 0 ocorrências**.

⚠️ **E o varredor ficou SEM literais de regex, de propósito: os codepoints vão por NÚMERO.**
A primeira versão usava um escape `\u2028` dentro de um literal de regex, e ele virou o
caractere de verdade no caminho até o disco — o arquivo não compilou
(`SyntaxError: Invalid regular expression: missing /`). É a
regra da memória do projeto se cumprindo: **um varredor de invisíveis escrito com os próprios
invisíveis é corrompível pelo que ele procura.**

Toda a prosa foi escrita por script `.mjs` **ancorado** no scratchpad, que conta a
âncora e estoura se ≠ 1, normaliza CRLF→LF em memória e restaura o EOL original (o
`BACKLOG.md` é CRLF; os demais são LF). Nenhum `git checkout`/`restore`/`stash`/`reset` foi
usado em nenhum momento: os mutantes foram desfeitos por mutação inversa ou `cp -p`, com
`md5sum -c` conferindo cada volta.
