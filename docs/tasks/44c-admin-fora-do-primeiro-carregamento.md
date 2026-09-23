# Tarefa 44c — As telas de administração saem do primeiro carregamento

> **Fatia de orçamento, decidida pelo dono em 2026-09-23.** Ela existe porque a folga do
> chunk de entrada caiu para ~~**5.124 B**~~ **4.960 B** (1,1%, nota nº 1) com **quatro**
> tarefas ainda por vir, e a
> Tarefa 44 sozinha custou 2.600 B. O veredito sobre o teto era da Tarefa 48; o dono o
> **antecipou** para não interromper a 46 ou a 47 no meio.
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** ·
> ⚠️ **`packages/app/src/pages/day-note.tsx:52-135`** — é o precedente do `React.lazy()`
> neste projeto, com o argumento escrito · ⚠️ **`packages/app/vite.config.ts:90-140`** — a
> decisão da Tarefa 38d sobre o `globIgnores`, que esta fatia **não** desfaz ·
> `docs/CONVENCOES-CODIGO.md` §7.1, §7.4, §7.9, §7.10.

---

## ⚠️ O que esta fatia entrega, e o que ela NÃO entrega

**Entrega:** o código das telas de administração sai do arquivo que o navegador precisa
baixar **antes de qualquer coisa aparecer**. Isso devolve folga à trava do `bundle-guard`
e acelera o primeiro desenho para todo mundo.

**NÃO entrega — e isto foi medido, não suposto:** *"quem só lê e escreve nunca baixa esse
peso"*. O `globPatterns` do Workbox é `['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}']`
(`vite.config.ts:97`) e precacheia **todo** `.js` emitido, inclusive o chunk do editor. Num
PWA já instalado, o pedaço novo continua sendo baixado em segundo plano — só deixa de estar
no caminho crítico.

⚠️ **E tirá-lo do precache NÃO é tarefa desta fatia**, por duas razões medidas:

1. `vite.config.ts:98-107` registra que o `globIgnores` foi **apagado na Tarefa 38d** e
   avisa: *"é justamente esta chave que NÃO pode voltar com o `push-handler.js` dentro — e
   ela já custou uma rodada de conserto"*.
2. Tirar do precache quebraria **"cadastrar o livro do mês" offline** para o admin — que é
   exatamente quem precisa dela, e num app cuja Decisão D diz que offline é assunto próprio.

**Se o dono quiser essa metade, ela é fatia própria, com ADR.** Registre a opção; não a
faça aqui.

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | ⚠️ **MEÇA ANTES DE MEXER, e PARE se o ganho for pequeno** | Se separar as telas de admin devolver menos de ~4 KB, a fatia não resolve o problema que a motivou e vira churn. **Meça primeiro** (ver "As medidas"), escreva o número, e **só então** implemente. Se for pequeno, **pare e reporte** com o número na mão |
| **B** | **O padrão é `React.lazy()` + `Suspense`, como o editor** | `day-note.tsx:129` e `free-note.tsx:100` já o usam, e `day-note.tsx:52` argumenta por escrito que não é otimização prematura. **Não invente um mecanismo novo** |
| **C** | **As telas são as de administração do LIVRO**: `BOOK_NEW_PATH` e `BOOK_EDIT_PATH`, que hoje apontam para o mesmo `BookFormPage` (`router.tsx:111-112`) | São as que o dono nomeou. Elas carregam `book-form.tsx` **e** `plan-editor.tsx`, que é o editor do plano por dia — o maior candidato do app fora do TipTap |
| **D** | ⚠️ **`preferencias`, `acervo` e `busca` FICAM onde estão** | Não são administração: todo mundo as usa, e o acervo é caminho de leitura. **Não amplie o escopo por conta própria** — se você medir que uma delas vale muito, **reporte, não faça** |
| **E** | ⚠️ **O `Suspense` precisa de um `fallback` que não pisque** | O precedente tem os dois modos: `day-note.tsx:806` usa `fallback` visível e `:949` usa `fallback={null}` **de propósito**, com o motivo escrito ao lado. Leia os dois e **escreva por que escolheu o que escolheu** |
| **F** | ⚠️ **NÃO mexa no teto do `bundle-guard`** | O teto de 450.000 fica. A fatia existe para criar folga **debaixo** dele, não para levantá-lo. ⚠️ Se você achar que precisa levantá-lo, **pare e pergunte** |
| **G** | **Nenhuma mudança de comportamento, de rota ou de permissão** | As mesmas URLs, os mesmos papéis (`OWNER`/`ADMIN`), o mesmo 404 para quem não é membro. É uma fatia de empacotamento |

---

## As medidas, e de onde tirá-las

⚠️ **A medição vem primeiro, e ela é a decisão A.**

1. Rode `pnpm --filter @clube/app build` e anote **os bytes por `ls -l dist/assets`** — não
   os "kB" arredondados que o Vite imprime. Ponto de partida: ~~entrada **444.876 B**, CSS
   **35.229 B**~~ → **CORRIGIDO na nota nº 1**: entrada **445.040 B**, CSS **35.279 B**
   (os números riscados são de ANTES da 44b, que entrou em `038ac20`), editor
   **449.522 B**, `index.html` **1.638 B**, precache 26 entradas / 1190,84 KiB.
2. Descubra **quanto** `book-form.tsx` + `plan-editor.tsx` (mais o que só eles importam)
   pesam hoje dentro da entrada. O `rollup-plugin-visualizer` **não** está no projeto —
   ⚠️ **não o instale sem perguntar**; prefira medir pela diferença (separar, buildar,
   comparar) ou pelo `build --mode` com `sourcemap` temporário que você **remove depois**.
3. Escreva o número **antes** de decidir seguir.

| peça | onde |
| --- | --- |
| o precedente do `lazy` | `day-note.tsx:52-135`, `free-note.tsx:100` |
| os dois `fallback` e por que diferem | `day-note.tsx:806` e `:949` |
| as rotas a separar | `router.tsx:111-112` |
| o que o SW precacheia | `vite.config.ts:90-140` |
| o acusador do teto | `packages/app/src/__tests__/bundle-guard.test.ts` — ⚠️ **ele compila de verdade** |

---

## As regras

1. **TDD estrito**, e vale para `packages/app`. **Vermelho colado** para cada guarda nova.

2. ⚠️⚠️ **A guarda que dá sentido à fatia: o chunk de entrada NÃO pode conter o formulário
   de livro.** Hoje o `bundle-guard` só mede **tamanho** — um teto que continua verde se o
   código voltar para a entrada e outra coisa encolher na mesma proporção.
   **Escreva a guarda de CONTEÚDO**, no espírito do *"NÃO HÁ EDITOR AQUI"* que
   `acervo.tsx:204` e `busca.tsx:88` já registram.
   **Mutante obrigatório:** troque o `lazy()` por `import` estático → **tem de ficar
   vermelho** *por conteúdo*, não só por byte. ⚠️ **Se só o teto de bytes acusar, a guarda
   é frágil**: no dia em que a fatia seguinte encolher outra coisa, o defeito volta em
   silêncio. É a classe "guarda unidirecional" que a Tarefa 41b pagou.

3. ⚠️ **O `Suspense` tem de ter acusador.** **Mutante:** tire o `Suspense` de volta do
   `lazy` → a tela tem de quebrar num teste, não em produção.

4. **A tela continua funcionando igual.** Os testes de `book-form.test.tsx` passam **sem
   serem reescritos para acomodar o `lazy`**. ⚠️ Se você precisar mudar muitos testes para
   eles passarem, **pare e diga** — é sinal de que o recorte está errado.

5. ⚠️ **O corte de tenant e o papel não mudam.** `OWNER`/`ADMIN` para as telas de admin;
   sem membership → **404**. **Mutante:** deixe a rota preguiçosa sem o guarda de papel →
   acusa.

6. **Nada de `globIgnores`.** A decisão da Tarefa 38d fica. Se você tocar em
   `vite.config.ts`, o `service-worker-config.test.ts` é quem cobra — e ele ~~pina
   propriedades, não texto~~ **pina TEXTO DE FONTE** (⚠️ erro do dono nesta spec,
   corrigido na **nota nº 21**: as seis asserções dele são `toContain("…")` sobre o
   código de `vite.config.ts`, em `:57`, `:58`, `:65`, `:125`, `:126` e `:133`).
   Isso não muda o que a regra manda — não mexa no `globIgnores` —, mas muda o que
   esperar dele: ele é a **quarta a sexta** aparição da classe "a guarda pina o texto
   do config em vez do comportamento" que o próprio `bundle-guard.test.ts` nomeia, e
   quem confiar nele para saber o que o Workbox FEZ vai se enganar.

7. ⚠️ **O precache vai ganhar uma entrada a mais** (o chunk novo). Isso é **esperado**:
   anote o número antes e depois e **escreva que é esperado e por quê**, senão a próxima
   auditoria lê como regressão.

8. **Nenhuma chave de catálogo nova**, a não ser que o `fallback` precise de texto — e aí
   ela é uma só, semântica, em inglês.

9. **O tamanho dos arquivos pelo contador canônico** (`acervo.tsx:115-126`), **nunca
   `wc -l`**. ⚠️ O `book.tsx` tem teto de **420** desde 2026-09-23 (decisão do dono).

10. **Varredura de caracteres invisíveis** nos arquivos do diff, **provando antes que
    morde**, com os code points montados **por número**.

---

## Definição de pronto

- [x] O número medido **antes** de mexer está escrito, e a decisão A foi respeitada
      (seguiu porque o ganho justifica, ou parou e reportou).
- [x] `BOOK_NEW_PATH` e `BOOK_EDIT_PATH` entram por `React.lazy()` + `Suspense`, no padrão
      do editor, com o `fallback` escolhido **e justificado**.
- [x] **A guarda de CONTEÚDO existe** e o mutante do `import` estático a deixa vermelha —
      não só o teto de bytes.
- [x] O `Suspense` tem acusador próprio.
- [x] Os testes do formulário passam **sem reescrita para acomodar o `lazy`**.
- [x] Papel e corte de tenant inalterados, provados por teste.
- [x] `vite.config.ts` **sem `globIgnores`**; a entrada nova no precache está anotada como
      esperada, com o porquê.
- [x] Bytes colados antes e depois: entrada, CSS, editor, `index.html`, precache — e **a
      folga nova contra os 450.000**.
- [x] Gates: `pnpm -r test` · `typecheck` · `lint` · `prettier --check` · `build`.
- [x] Varredura de invisíveis, com a prova de que morde.
- [x] ⚠️ **A opção que esta fatia NÃO fez está registrada**: excluir o chunk do precache
      para que ele nunca seja baixado por quem não é admin — com o custo (admin perde a
      tela offline) e o risco (`globIgnores` + `push-handler.js`, `vite.config.ts:98-113`).

---

## Notas de reconciliação

_O executor anexa aqui o que mediu e divergiu da spec. Numere de 1 em diante. Se um número
desta spec estiver errado, **corrija-o aqui e no `BACKLOG.md`**, dizendo como mediu._

**1. O ponto de partida da spec é de ANTES da 44b — corrigido acima e no `BACKLOG.md`.**
A spec escreve entrada **444.876 B**, CSS **35.229 B** e folga **5.124 B**; o `BACKLOG.md`
repete os mesmos números na decisão **(D2)**, **três parágrafos depois de escrever os
certos** no fechamento da 44b. Medido em `038ac20` com a árvore limpa, por
`pnpm --filter @clube/app build` + `stat -c '%n %s' dist/assets/*`: entrada
**445.040 B**, CSS **35.279 B**, editor **449.522 B**, `index.html` **1.638 B**,
precache **26 / 1190,84 KiB**. Folga real contra os 450.000: **4.960 B**. As **dez outras
citações da spec foram conferidas uma a uma e estão todas CERTAS** —
`day-note.tsx:52`/`:129`/`:806`/`:949`, `free-note.tsx:100`, `router.tsx:111-112`,
`vite.config.ts:97` e `:98-113`, `acervo.tsx:204`, `busca.tsx:88`, `acervo.tsx:115-126`.

**2. A decisão A, com o número: o ganho é de 9.460 B, e a fatia seguiu.**
Medido **antes de escrever uma linha de implementação**, pelo método da diferença que a
spec manda (separar, buildar, comparar) — o `rollup-plugin-visualizer` **não** foi
instalado e **nenhum `sourcemap`** foi ligado. O experimento foi desfeito por `cp -p` com
`md5sum` conferido antes de o TDD começar.

| | antes (`038ac20`) | depois | delta |
| --- | --- | --- | --- |
| chunk de entrada | **445.040 B** | **435.580 B** | **−9.460 B** |
| folga contra 450.000 | 4.960 B (1,1%) | **14.420 B (3,2%)** | **+9.460** |
| chunk `book-form-*.js` | — | **10.059 B** (3,53 kB gzip) | novo |
| CSS | 35.279 B | 35.279 B | 0 |
| editor | 449.522 B | 449.522 B | 0 |
| `index.html` | 1.638 B | 1.638 B | 0 |
| precache | 26 / 1190,84 KiB | **27 / 1191,42 KiB** | **+1 entrada** |

O ganho é **2,4× o piso de ~4 KB** que a decisão A fixou, então a fatia seguiu. ⚠️ O chunk
tem 10.059 B mas a entrada só caiu 9.460: a diferença de **599 B** são ~~o preâmbulo do
chunk novo mais o `lazy`/`Suspense`/`useTranslation` e a chave do `fallback`~~ **duas
parcelas SOMADAS que nenhum build separou** — ver nota nº 18. A identidade aritmética
está conferida dos dois lados (10.059 − 9.460 = 599); a **atribuição** entre "preâmbulo
de chunk" e "máquina do `lazy` que ficou na entrada" é hipótese, não medição.

**3. ⚠️⚠️ A CORREÇÃO MAIS IMPORTANTE DESTA FATIA: um `lazy()` sem `Suspense` NÃO
estoura no React 18 — ele fica em branco, em silêncio.**
⚠️ **METADE DESTA NOTA CAI — leia a nota nº 11 ANTES desta.** A frase vale **na raiz
concorrente do cliente**; sob `renderToString` o mesmo `lazy()` **LANÇA**. E
`renderToString` é justamente o instrumento que o §7.10 manda tentar antes de
declarar um quadro indecidível — ele não foi tentado aqui.
A regra 3 diz *"tire o `Suspense` de volta do `lazy` → a tela tem de quebrar num teste"*,
e a primeira versão do acusador foi escrita na crença de que o React lançaria
*"A component suspended while rendering, but no fallback UI was specified"*. **Medido, e é
falso.** Sonda isolada (um `render(<Late />)` com `lazy()` e **nenhum** `<Suspense>` na
árvore): `document.body.innerHTML` é `'<div></div>'`, **sem exceção e sem
`console.error`**, e o conteúdo entra sozinho quando a promessa resolve — a raiz
concorrente se comporta como uma fronteira de `fallback={null}`.

Consequência direta: o mutante **M2** (apagar o `<Suspense>`) deixaria **940 de 941**
testes verdes, inclusive os 47 de `book-form.test.tsx`. O defeito é o `<main>` **vazio**
debaixo do cabeçalho enquanto o chunk viaja — silencioso, e exatamente da classe "guarda
unidirecional" que esta fatia existe para não repetir. **Por isso o acusador do `Suspense`
teve de ser uma asserção SÍNCRONA do primeiro quadro**, e não um teste de "a tela abre":
o segundo quadro é idêntico com e sem fronteira. A prosa do `router.tsx` e a do
`lazy-admin-routes.test.tsx` foram corrigidas para dizer isto, com a sonda descrita.

**4. Uma linha entrou em `book-form.test.tsx` — e ela NÃO é reescrita de teste.**
A regra 4 pede que os 47 testes passem sem reescrita. **Nenhuma asserção, nenhum `settle`
e nenhum `describe` mudou.** O que entrou foi um `beforeAll(async () => { await
import('../book-form'); })` e o `beforeAll` na lista de imports do `vitest`.

⚠️ **O NÚMERO DESTA NOTA NÃO REPRODUZ — ver nota nº 16: são 2 a 4, é uma corrida.**

**Por quê, medido:** no vitest o `import()` do `lazy` é **I/O de verdade** (o vite-node
ainda lê e transforma `book-form.tsx` + `plan-editor.tsx`), e o `settle()` do arquivo
descarrega **microtarefas** de propósito — *"a suíte não usa timers falsos"*. As **três**
primeiras asserções que abrem a rota falhavam; as 44 seguintes passavam porque o módulo já
estava em cache. Subir o laço de 10 para **60** microtarefas **não resolveu** (prova de que
não é contagem de tick, é I/O).

**A alternativa foi medida e recusada:** pôr uma volta no laço de eventos dentro do
`settle()` resolve, e leva a suíte do arquivo de **1,07 s** para **24,35 s** (dez
`setTimeout` por `settle`, dezenas de `settle` por arquivo); **uma** volta só custa 2,65 s
e **ainda deixa 1 teste vermelho**. O `beforeAll` custa **um** carregamento de módulo, uma
vez, e mantém o `settle()` dizendo a verdade sobre o que faz. Ele tem acusador próprio: o
mutante **M6**.

**5. A marca de conteúdo teve de excluir `pages.bookForm.entry.` — e a exclusão é uma
propriedade, não uma conveniência.**
⚠️ **O NÚMERO ESTÁ ERRADO E A MARCA FOI APOSENTADA — ver notas nº 15 e nº 17.** São
**3** ocorrências de `pages.bookForm.` cru na entrada, não 2, e a terceira nasceu
desta própria fatia. A marca de texto deu lugar a uma âncora de **grafo de módulos do
Rollup**.
A varredura é por caminho de chave de catálogo (string literal, sobrevive à minificação; e
o `pt.ts` é objeto **aninhado**, então o caminho pontilhado só existe em quem chama o
`t()`). Mas `pages.bookForm.entry.new` e `.edit` são os **rótulos dos links**, escritos
por `home.tsx:315` e `book.tsx:650` — telas de leitura, que estão na entrada e **devem**
estar. Medido no build separado: `pages.bookForm.` cru dá **2** ocorrências na entrada e
42 no chunk; `pages.bookForm.(fields|plan).` dá **0** na entrada e **30** (12 + 18) no
chunk. A marca é a segunda.

**6. ⚠️ O teto de bytes NÃO acusa o mutante do `import` estático — medido, e é a
justificativa inteira da regra 2.**
⚠️ **O número do mutante foi remedido na rodada de correção: a entrada dele é
445.209 B, não 445.040 B** (os 445.040 são o `038ac20` LIMPO; o mutante deixa o
`lazy`/`Suspense`/`useTranslation` e a chave do `fallback` de pé, e isso custa
169 B). A conclusão não muda: 445.209 < 450.000, o teto fica **VERDE**.
Com o `lazy()` desfeito, o chunk de entrada volta a **445.040 B**, que está **abaixo** dos
450.000: o teste `keeps the FIRST LOAD under a ceiling that the editor cannot fit into`
fica **VERDE**. Quem acusa são as duas guardas de CONTEÚDO desta fatia mais a asserção
síncrona do primeiro quadro — **3 acusadores, zero deles de byte**. Era exatamente o cenário
que a spec temia, e ele é real hoje, não hipotético.

**7. O precache foi de 26 para 27 entradas, e isso é ESPERADO.**
O `globPatterns` do Workbox (`vite.config.ts:97`) lista **extensões** e precacheia **todo**
`.js` emitido; um chunk novo é uma entrada nova, por construção. O volume mal se mexe:
**1190,84 → 1191,42 KiB (+0,58 KiB)**, porque os 10.059 B do chunk novo são quase
inteiramente os 9.460 B que **saíram** da entrada. **Não é regressão.** O `vite.config.ts`
**não foi tocado** — `git diff` vazio nele, e o `service-worker-config.test.ts` (4 testes)
continua verde.

**8. A opção que esta fatia NÃO fez, registrada como a Definição de pronto pede.**
Tirar o chunk de administração do precache — para que quem não é admin **nunca** o baixe,
nem em segundo plano — **não foi feito**, e não deve ser feito sem ADR. O custo: o admin
perde **"cadastrar o livro do mês" offline**, que é a pessoa que mais precisa dela num app
cuja Decisão D trata offline como assunto próprio. O risco: a única forma de fazê-lo é
ressuscitar a chave `globIgnores`, e `vite.config.ts:98-113` registra por escrito que ela
*"é justamente esta chave que NÃO pode voltar com o `push-handler.js` dentro"* e que isso
*"já custou uma rodada de conserto"* (Tarefa 38d). **É fatia própria, com ADR.**

**9. O que esta fatia NÃO entrega, repetido aqui porque a spec pediu que fosse dito:**
*"quem só lê e escreve nunca baixa esse peso"* continua **falso**. Num PWA instalado o
chunk novo continua chegando em segundo plano, pelo precache. O que a fatia entrega é ele
sair do **caminho crítico do primeiro desenho** — o navegador pinta a primeira tela com
9.460 B a menos.

**10. Escopo respeitado, e nada foi medido que valha ampliá-lo.**
Só `BOOK_NEW_PATH` e `BOOK_EDIT_PATH` entraram no `lazy()`. `preferencias`, `acervo` e
`busca` ficaram estáticas. O teto do `bundle-guard` continua em **450.000** — a fatia criou
folga **debaixo** dele. `book.tsx` **não foi tocado** e continua em **414** linhas canônicas
(teto 420). `router.tsx` ficou em **85** linhas canônicas; o arquivo novo,
`lazy-admin-routes.test.tsx`, em **67**. Backend intocado: `schema.prisma` com o mesmo
`md5` `968c9986f7a2dfb4ccbd738b13d44715`, nenhuma migration.

---

## Notas de reconciliação — RODADA DE CORREÇÃO (2026-09-23)

_O revisor derrubou oito afirmações, achou um mutante sobrevivente e, sobretudo, achou
que **o instrumento certo já existia no projeto e não tinha sido tentado**. Estas notas
são a resposta, item por item, com como cada coisa foi medida._

**11. ⚠️⚠️ O ACHADO PRINCIPAL: o instrumento era o `renderToString`, e o §7.10 já
mandava usá-lo. A asserção do primeiro quadro migrou para SSR.**

A primeira versão desta fatia escreveu, em três lugares e **sem qualificador**, que *"um
`lazy()` sem NENHUMA fronteira de `Suspense` não estoura no React 18"*. **Metade está
certa** — e o revisor confirmou com sonda própria: no cliente (React 18.3.1 + RTL,
jsdom), sem `Suspense`, `render()` dá `<div></div>`, sem exceção e sem
`console.error`. **A outra metade cai.** Medido aqui, com a mesma árvore desta guarda:

| árvore | `renderToString` |
| --- | --- |
| **com** fronteira | devolve o fallback: `<p class="text-sm text-muted">Carregando…</p>` |
| **sem** fronteira | **LANÇA** `Error: A component suspended while responding to synchronous input.` |

⚠️ **E `renderToString` é exatamente o que o `docs/CONVENCOES-CODIGO.md` §7.10 manda
tentar antes de declarar um quadro indecidível.** A convenção registra por escrito que
ele *"não roda efeito nenhum — ou seja, é literalmente o frame que o `act()` descarta e
o navegador pinta"*, e o repositório **já o usava em três arquivos**
(`pages/__tests__/home.test.tsx:9` e `:2213`, `pages/__tests__/anti-guilt-dom.ts:309`,
`__tests__/anti-guilt-dom.test.ts:88`). O executor não o citou, não o tentou, e construiu
um mecanismo próprio — render síncrono do RTL mais um `beforeAll` de aquecimento — para o
problema que a convenção já resolvia.

**A frase foi qualificada nos três lugares** (`router.tsx`, `lazy-admin-routes.test.tsx`,
`BACKLOG.md`), **riscada-e-explicada**, citando o §7.10. **E a asserção migrou.** O que a
migração comprou, medido:

| | antes (RTL síncrono) | depois (`renderToString`) |
| --- | --- | --- |
| como o mutante do `Suspense` acusa | `queryByText` devolve `null` | **exceção**, com a mensagem do React |
| acusadores do mutante `Suspense` | 1 | 1 |
| acusadores de `fallback={null}` | 1 | **2** |
| acusadores do `className` trocado (N3b) | **0 — sobrevivente** | **1** (nota nº 13) |
| `beforeAll` de aquecimento no arquivo | necessário | **desnecessário** (nota nº 12) |
| testes do arquivo | 2 | 3 |

⚠️ **O que a migração NÃO faz, e por isso o terceiro teste continua sendo RTL:** o SSR
nunca espera a promessa, então ele **jamais vê o segundo quadro**. "A tela monta de
verdade quando o chunk chega" continua sendo medido com `<App />` e `settle()`.

⚠️ **E uma armadilha que a migração trouxe e está domada por construção:** só existe UM
"primeiro quadro" por registro de módulos — assim que a promessa do `lazy` resolve (o que
acontece sozinho entre um teste e o seguinte), o SSR passa a renderizar a tela inteira. O
quadro da fronteira por isso é renderizado **uma vez só**, memoizado em
`boundaryFirstFrame()`, e o docblock diz que a memoização é propriedade, não
conveniência. Sem ela a segunda guarda ficaria vermelha **por ordem de execução**.

**12. O `beforeAll` de aquecimento: SAIU de um arquivo, FICA no outro — os dois por
medição, não por gosto.**

- **`lazy-admin-routes.test.tsx`: saiu.** O arquivo passou a importar
  `BookFormPage` **estaticamente** (a segunda guarda precisa do quadro de carregamento da
  própria tela para comparar), e esse import já carrega o módulo em tempo de coleta. O
  aquecimento não sumiu — **mudou de forma**, e a forma nova tem uma razão própria para
  existir em vez de ser só um contorno. ⚠️ **Medido (mutante M7):** um arquivo com só o
  teste de RTL, sem o import estático e sem o `beforeAll`, fica **vermelho**
  (`AssertionError: expected null not to be null`). Ou seja: o import estático É o
  aquecimento, e isso está escrito no docblock.
  ⚠️ **E ele não desfaz a fatia:** é um arquivo de TESTE, e o que o `bundle-guard.test.ts`
  compila é o `index.html` — `__tests__` não entra em build nenhum.
- **`pages/__tests__/book-form.test.tsx`: fica, e o porquê está escrito.** A migração não
  o alcança: os testes dali abrem a rota pelo `<App />` de verdade, e é ali que a corrida
  de I/O mora. ⚠️ **Medido (mutante M6, suíte inteira, três rodadas seguidas): 4, 3 e 3
  falhas.** Ele **não** foi tirado "para parecer limpo".

**13. ⚠️ O MUTANTE SOBREVIVENTE (N3b) MORREU — e ele era a forma exata do §7.9.**

O revisor trocou **só o `className` do `fallback`** (`router.tsx:120`), mantendo a
chave de catálogo: `<p className="text-2xl font-bold text-red-600">`. Resultado então:
**941/941 VERDE, 0 acusadores**.
⚠️ **Reproduzido nesta rodada com medição própria, e não aceito de palavra:** com as
guardas na versão PRÉ-correção (os dois arquivos de teste restaurados do estado
anterior por `cp -p`, nunca por `git checkout`) e o mesmo mutante aplicado por âncora
contada — **941/941 verde, exit 0**. A frase *"a troca do fallback pelo conteúdo é
literalmente invisível"* estava escrita em **três** lugares como propriedade medida, e
dependia inteiramente de a classe ser **byte-idêntica** à de `book-form.tsx:122`/`:191`.
Nada a guardava.

**O acusador nasceu:** `⚠️ paints the SAME loading paragraph the screen itself paints,
class included (task 44c)`. Ele renderiza os DOIS quadros por SSR — o `fallback` do
`router.tsx` e o `<p>` que a própria tela emite, montada direto — e compara o parágrafo
inteiro, **classe inclusa**. São duas fontes independentes: mexer em uma só derruba.

⚠️ **E ele sai de graça do `renderToString`, que é o argumento do §7.10 em uma linha:**
o HTML emitido traz `class="text-sm text-muted"` no texto, enquanto o `queryByText` do
RTL enxergava só a frase. **Remedido com o mutante aplicado: 1 acusador**, com a mensagem
`expected '<p class="text-2xl font-bold text-red…' to be '<p class="text-sm
text-muted">Carrega…'`.

**14. O censo estava errado: o `book-form` é o QUARTO import dinâmico, não o terceiro —
e o quarto precedente REFORÇA a decisão E.**

Falta `highlight-form.tsx:82`, que existe desde a Tarefa 25 e se chama a si mesmo de
*"o terceiro import dinâmico do editor"* na linha 81. São quatro: `day-note.tsx:129`,
`free-note.tsx:100`, `highlight-form.tsx:82` e o desta fatia.

⚠️ **E `highlight-form.tsx:177-182` é um TERCEIRO precedente de `fallback` visível, com
o `<p className="text-sm text-muted">` IDÊNTICO** — a decisão E foi escrita citando só os
dois modos do `day-note.tsx`. A escolha continua certa e o terceiro precedente a
**reforça**: dos três `Suspense` de tela que o app já tinha, dois são visíveis, e os dois
usam exatamente esta marcação. Corrigido no `router.tsx` e no `lazy-admin-routes.test.tsx`.

**15. ⚠️⚠️ A GUARDA DE CONTEÚDO CAI POR DUAS RAZÕES, o docblock afirmava uma — e a marca
de texto deu lugar a uma ÂNCORA DE GRAFO DO ROLLUP.**

O revisor mediu duas coisas que o docblock não previa:

- **N7** (refactor honesto: extrair o prefixo da chave para uma `const` não-dobrável, 42
  chamadas, runtime idêntico, `lazy()` intacto) → **1 acusador, falso positivo**. A
  guarda caía porque a **grafia** tinha mudado, não porque o defeito tivesse voltado.
- **N8** (N7 + `import` estático de volta) → `ships NO BOOK FORM in the FIRST LOAD`
  ficava **VERDE**: sem marca de texto no bundle, não havia o que achar na entrada. **Ponto
  cego real.**

A frase que faltava foi escrita, e a afirmação *"uma guarda, uma razão de cair (§7.9)"*
— que era **falsa** — foi corrigida. Mas a rodada foi além, porque a alternativa que a
spec de correção mandou **considerar e MEDIR** funcionou:

> ⚠️ **`build()` do Vite devolve, por chunk, os ids dos MÓDULOS-FONTE que o Rollup pôs
> dentro dele.** Medido neste build: o chunk de entrada tem 131 módulos e **nenhum** é
> `book-form.tsx`/`plan-editor.tsx`; o chunk `book-form-*.js` tem exatamente **2**, que
> são os dois, e seu `facadeModuleId` é `pages/book-form.tsx`.

A âncora agora é `BOOK_FORM_MODULES = /[\\/]pages[\\/](?:book-form|plan-editor)\.tsx(?:$|\?)/u`
sobre esses ids. Ela não depende de tradução, de minificador, de chave de catálogo nem de
lista de exclusões. **Quem responde "o que a pessoa baixa" continua sendo o `index.html`
do build** — as asserções cruzam as duas fontes de propósito.

**O que a troca mediu, com os mutantes reaplicados:**

| mutante | marca de TEXTO (antes) | âncora de GRAFO (agora) |
| --- | --- | --- |
| **M1** `lazy()` → `import` estático | 3 acusadores | **3 acusadores** |
| **N7** refactor de grafia | **1 — falso positivo** | **0 — 942/942 verde** |
| **N8** N7 + `import` estático | `ships NO BOOK FORM` **VERDE** (ponto cego) | **3 acusadores**, com `ships NO BOOK FORM` entre eles |
| **M5** âncora apontando para nada | 1 (o par positivo) | **1** (o par positivo) |

⚠️ **E a âncora nova também tem duas razões de cair, e isso está ESCRITO no teste** —
(1) o defeito, (2) o arquivo mudou de nome ou de pasta. A (2) é barata: renomear
`pages/book-form.tsx` quebra o `import('./pages/book-form')` do `router.tsx` e o
`typecheck` **antes** de chegar ao teste. A frase que o revisor pediu está lá:
*"se esta linha ficar vermelha sem que o `lazy()` tenha mudado, é a ÂNCORA que
envelheceu, e o conserto é a âncora, não o `lazy()`"*.

**16. O número do mutante M6 não reproduz — e o mutante é uma CORRIDA.**

A nota nº 4 escreveu *"as TRÊS primeiras asserções que abriam a rota falhavam"*.
⚠️ **Remedido com o `beforeAll` apagado e a suíte inteira rodada três vezes seguidas:
4, 3 e 3.** E na rodada de 4, a quarta falha foi `marks the title and sends NOTHING when
it is empty (rule 3)` — que **não** é uma das que abrem a rota primeiro. O que se mede é
**latência de I/O do vite-node sob a carga da máquina**, não uma propriedade. O número
certo é uma faixa: **2 a 4**. Corrigido no docblock do `book-form.test.tsx`.

⚠️ A corrida **não** foi eliminada na raiz pelo A1: a migração para SSR alcança o outro
arquivo, não este. O que o A1 eliminou foi a dependência do **acusador do primeiro
quadro** em relação a ela.

**17. `pages.bookForm.` cru dá 3 ocorrências na entrada, não 2 — e a terceira nasceu
DESTA fatia.**

Remedido no build desta rodada, contando no chunk de entrada emitido: são
`pages.bookForm.entry.new`, `pages.bookForm.entry.edit` e **`pages.bookForm.loading`**.
As duas primeiras são os rótulos dos links (`home.tsx:315`, `book.tsx:650`); a terceira é
o `fallback` do `Suspense` que **esta fatia** escreveu no `router.tsx`. O número 2 veio
do build exploratório, **antes** de o `fallback` existir, e não foi remedido.

⚠️ **Pior que o número:** o docblock justificava só a exclusão de `entry.` e **nunca
mencionava `loading`** — quem "simplificasse" a marca para `/pages\.bookForm\.(?!entry\.)/`
deixaria a guarda vermelha para sempre, pela razão errada. Foi este achado que fez a
âncora de texto ser aposentada em favor do grafo (nota nº 15); o número fica registrado
porque é o que prova que a fragilidade era real, não teórica.

**18. Os 599 B são DUAS parcelas somadas, e nenhum build as separou.**

A identidade aritmética está certa e foi conferida dos dois lados
(10.059 − 9.460 = 599). Mas a **atribuição** — quanto é preâmbulo do chunk novo e quanto
é a máquina do `lazy`/`Suspense`/`useTranslation` mais a chave do `fallback` que ficaram
na entrada — **nunca foi medida separadamente por build nenhum**. É hipótese plausível
escrita com cara de medição. Fica dito que são duas parcelas não separadas.

**19. ⚠️ QUEM NÃO É `OWNER`/`ADMIN` BAIXA OS 10.059 B E SÓ ENTÃO É RECUSADO.**

O guarda de PAPEL é o `isClubAdmin` de `book-form.tsx:140` e `:212` — ou seja, ele mora
**dentro** do módulo preguiçoso. É **pré-existente** (o guarda já era da tela antes desta
fatia) e a **decisão G manda não movê-lo**: o `role` vem do `/me` por clube, e a rota de
edição só sabe de qual clube é o livro depois de carregá-lo. Mas a fatia se vende como
*"quem nunca abre esta tela não paga o peso"*, e este caso **não era mencionado em lugar
nenhum**. Registrado no `router.tsx`. Não é bug desta fatia, e mexer nele é fatia própria.

**20. São SEIS arquivos no diff, não quatro.**

O diff da fatia é `git diff 038ac20` (a árvore estava limpa antes dela):
`docs/BACKLOG.md`, `docs/tasks/44c-*.md`, `packages/app/src/router.tsx`,
`packages/app/src/__tests__/bundle-guard.test.ts`,
`packages/app/src/pages/__tests__/book-form.test.tsx` e o arquivo novo
`packages/app/src/__tests__/lazy-admin-routes.test.tsx`. A varredura de invisíveis desta
rodada correu os **seis**: **0 achados**, com a prova de que morde num arquivo-isca
(ZWSP + NBSP + U+2028 + BOM → **4 achados**) e os code points montados **por número**,
nunca colados.

**21. ⚠️ ERRO DA PRÓPRIA SPEC, corrigido na regra 6: o `service-worker-config.test.ts`
pina TEXTO DE FONTE.**

A regra 6 desta spec diz que ele *"pina propriedades, não texto"*. **Medido: é o
contrário.** As seis asserções dele são `toContain("…")` sobre o código de
`vite.config.ts` — `:57`, `:58`, `:65`, `:125`, `:126` e `:133`. É pré-existente, está
**4/4 verde**, e `vite.config.ts` está **intocado** nesta fatia (`git diff 038ac20` vazio
nele). A frase da spec foi riscada-e-explicada no lugar.

**22. O que foi tentado e NÃO deu certo, e o que não foi tentado.**

- ⚠️ **A âncora de grafo quase não foi usada por uma razão boba:** a primeira tentativa de
  aplicar os mutantes passava a regex por linha de comando em JSON, e a barra invertida
  dupla do `[\\/]` morria no shell (`SyntaxError: Bad escaped character in JSON`). O
  aplicador de mutante virou um par `apply.mjs` + `spec.mjs` — âncora em arquivo, nunca
  em argumento. Fica registrado porque é a mesma família da lição *"editar prosa por
  script, nunca por heredoc"*.
- **Não foi tentado comparar o `fallback` com a tela pelo SEGUNDO quadro.** O SSR não o
  alcança, e no RTL a comparação teria de pinar texto renderizado sem classe — que é a
  classe de guarda que o §7.10 e o `bundle-guard.test.ts` passam o projeto inteiro
  condenando.
- **Nenhuma dependência foi instalada.** `react-dom/server` já estava no repositório e já
  era usado em três arquivos.
- **`vite.config.ts`, backend, `schema.prisma` e o teto do `bundle-guard` intocados.** O
  `schema.prisma` continua em `968c9986f7a2dfb4ccbd738b13d44715`; o teto continua em
  **450.000**.

**23. Os números desta rodada.**

Gates **antes** (com a fatia, antes da correção): shared **607** · ui **303** · backend
**1994** · app **941**. **Depois:** shared **607** · ui **303** · backend **1994** · app
**942** (**+1**: a guarda do parágrafo do `fallback`). `typecheck`, `lint` e
`prettier --check .` verdes nas duas pontas. Integração não rodada (a fatia não toca o
backend).

Bytes **inalterados pela rodada de correção** — nenhum arquivo de produção mudou de
comportamento: entrada **435.580 B** (teto 450.000, folga **14.420**) · chunk
`book-form-*.js` **10.059 B** · CSS **35.279 B** · editor **449.522 B** · `index.html`
**1.638 B** · precache **27 / 1191,42 KiB**.

Contador canônico (`acervo.tsx:115-126`, nunca `wc -l`): `router.tsx` **85** (igual),
`lazy-admin-routes.test.tsx` **67 → 105**, `bundle-guard.test.ts` **190 → 219**,
`book.tsx` **414** (intocado, teto 420).

