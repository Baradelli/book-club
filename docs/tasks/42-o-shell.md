# Tarefa 42 — O shell, e o nome que faltava há vinte e quatro fatias

> **Quinta fatia do MVP 3.5, e a primeira que toca TELA.** As quatro anteriores construíram
> a camada de token, o catálogo e os componentes; esta liga o cromo do app neles.
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** ·
> `docs/tasks/41a-*.md` e `docs/tasks/41b-*.md`, as **notas de reconciliação** — ⚠️ **é o
> mapa do que dá errado neste bloco**, e elas nomeiam as duas classes de erro que mais se
> repetiram: **generalização de amostra** ("os cinco artboards concordam", quando eram
> quatro) e **correção incompleta** (o número certo no arquivo de teste, o errado no de
> produção) · `docs/CONVENCOES-CODIGO.md` **§7.1**, **§7.4**, **§7.9**.

---

## ⚠️ O que esta fatia entrega, e o que ela deliberadamente adia

**Entrega:** o cabeçalho, a barra de contexto ligada ao router, o cromo (`Screen`) capaz de
duas colunas, o filete duplo de abertura, e **o nome do autor nas duas telas que ainda dizem
"Alguém do clube"**.

**Adia:** o **conteúdo** da margem de cada tela. O `Screen` ganha a capacidade (`rail`), e
**nenhuma tela passa uma margem ainda** — quem a preenche são as Tarefas 43 (grifos da
leitura), 44 (as marcas e "Neste livro"), 45 (correntes e feed) e 46 (o painel de refinar).
⚠️ **Se você sentir vontade de "já preencher uma margem", PARE**: é o que faria esta fatia
deixar de ser auditável.

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | **O `Screen` continua dono do `h1`**, e a lista `H1_EXCEPTIONS` **não cresce** | É a guarda mais forte do cromo (`chrome.test.tsx:224`), e ela não depende do nome de nenhuma função. O `ReadingColumn` entra **dentro** do `Screen`, não no lugar dele |
| **B** | **As duas larguras (`max-w-2xl` / `max-w-4xl`) dão lugar ao modelo do canvas**: coluna de 680px + margem de 320px acima de 1120px, uma coluna com 20px de recuo abaixo | Medido nos artboards de desktop. ⚠️ **`ScreenWidth` não morre**: `entry` (`max-w-md`) continua servindo login e convite, que o canvas desenha estreitos |
| **C** | ⚠️ **`rail` é prop opcional do `Screen`, e nenhuma tela a passa nesta fatia** | A capacidade nasce testada; o conteúdo é de quem tem o conteúdo. Uma margem vazia não desenha filete nenhum — teste isso |
| **D** | **A `ContextBar` do `packages/ui` ganha um invólucro no app que injeta o `Link` do router** | É o padrão `renderLink` que o `ListItem` já usa (`list.tsx`, regra 24): sem ele o PWA recarrega a página inteira a cada volta |
| **E** | ⚠️⚠️ **`day-note.tsx` e `free-note.tsx` passam a resolver o nome do autor** | Medido: `club-names.ts` (`memberNamesOf`, `nameOfWriter`) já é usado por **seis** arquivos — `acervo`, `activity-feed`, `book`, `busca`, `reading-marks`, `streak-bar`. Só estas duas ficaram para trás, e a mesma pessoa aparece como "Maria" no acervo e como "Alguém do clube" aqui. É a metade do §A.5.9 do `new-ui.md` que continua de pé |
| **F** | **`pages.dayNote.others.author` e `pages.freeNote.author` MORREM** | Eles são duas das três chaves com o valor `'Alguém do clube'`. O fallback continua existindo — é `pages.acervo.item.author.other`, que o `nameOfWriter` já devolve. ⚠️ **Três chaves para um conceito era defeito, e a Tarefa 40 o pinou dizendo isso** |
| **G** | ⚠️ **Quando as três viram uma, o mapa de duplicatas fica VERMELHO — e a saída é APAGAR a linha** | Está escrito dentro do próprio teste (`catalogs.test.ts`, o grupo `'Alguém do clube'`): *"quando ela reduzir as três a uma, este teste fica vermelho e a saída é APAGAR a linha, nunca crescê-la"*. **Um valor com um dono só não é duplicata.** Não "conserte" a vermelhidão pinando o defeito de novo |
| **H** | **O cabeçalho é 52px no celular e 56px acima de 1120px** | `Inicio.dc.html:32` e `InicioDesktop.dc.html:32`. ⚠️ **Meça antes de gravar** — na 41b a `ContextBar` entregou duas das três alturas medidas porque ninguém releu a própria tabela |
| **I** | **Nenhum texto novo.** Toda frase do cromo já está no catálogo | As 17 chaves da Tarefa 40 cobrem o que as telas 43–48 precisam; o cromo usa o que já existia (`app.name`, `nav.*`, `theme.*`). Frase nova aqui significa que algo saiu do escopo |
| **J** | ⚠️ **O orçamento do chunk é desta fatia** | Sobram **7.977 B** até o teto de 450.000, e é a 42 que paga a primeira parcela dos componentes novos (medido: **+5.466 B** quando os dez ganham consumidor). **Meça antes de fechar. Se passar, PARE e reporte** — o teto é decisão do dono |

---

## As medidas, e de onde tirá-las

⚠️ **Extraia dos artboards em disco, cite arquivo e linha, e confira que o elemento medido é
o que você pensa que é.** Na 41a um repinte inteiro foi "medido" contra o elemento errado.

| peça | artboard |
| --- | --- |
| cabeçalho, celular | `Inicio.dc.html:32` (52px, `--surface`, `border-bottom 1px --border`, nome em Fraunces 16px/600, ícone de preferências 44×44, "Sair" em mono 10px) |
| cabeçalho, desktop | `InicioDesktop.dc.html:32` (56px, recuo de 40px, o nome do clube em mono ao lado do nome do app, "Do sistema" à direita) |
| barra de contexto | já medida e entregue na 41b — **não remeça, reuse** |
| coluna + margem | `DiaDesktop.dc.html:46,48,96` e os outros quatro. ⚠️ **O recuo de topo NÃO é unânime**: `InicioDesktop.dc.html:35` usa **48px**, os outros quatro usam 40px. O `ReadingColumn` entrega 40 e a home compensa por `className` — está escrito no docblock dele |
| filete duplo | `Inicio.dc.html:44-47` (2px accent em cima) e `Dia.dc.html:49-52` (invertido) |
| uma coluna, celular | `Livro.dc.html:41` (recuo lateral de 20px) |

---

## As regras

1. **TDD estrito.** Teste primeiro, vermelho colado, implementação mínima, verde colado.

2. ⚠️ **A decisão A é a guarda que não pode cair.** `chrome.test.tsx:224`
   (`no page declares an h1 of its own`) e o teste companheiro que prova que as duas exceções
   ainda existem continuam verdes, **sem edição**. **Mutante:** declare um `<h1` numa tela
   migrada → tem de acusar.

3. **A decisão B com os dois sentidos.** O corte de 1120px é media query, **sem ramificação
   por dispositivo** — nenhum `userAgent`, nenhum `isMobile`.
   **Mutantes:** (i) remover o `min-[1120px]` da coluna → acusa; (ii) trocar os 680px por
   largura fluida → acusa.

4. ⚠️ **A decisão C com o caso vazio testado.** Sem `rail`, o `Screen` não desenha filete,
   não desenha `<aside>`, e a coluna ocupa a largura toda. **Mutante:** fazer o `<aside>`
   nascer sempre → tem de acusar.

5. ⚠️ **A decisão D com o teste que o `ListItem` já tem** (`list.test.tsx:140`,
   `lets the CONSUMER render the anchor, so a PWA is not reloaded`). **Mutante:** troque o
   `Link` por um `<a href>` cru e mostre o acusador. ⚠️ **Se não houver acusador, escreva-o**:
   é o defeito que faz o PWA recarregar inteiro a cada volta, e ele é invisível em teste de
   render.

6. ⚠️⚠️ **A decisão E é a que muda comportamento, e ela tem de ser testada como comportamento.**
   Não basta "a tela chama `nameOfWriter`". Exigido:
   - com membros carregados, a nota de outra pessoa mostra **o nome dela**;
   - com a chamada de membros **falhando**, a tela mostra o fallback e **não quebra**;
   - o `PersonAvatar` recebe o mesmo nome que o texto mostra — hoje ele recebe `name={null}`
     (`day-note.tsx:645`), e uma inicial que discorda do nome ao lado é pior que nenhuma.
   **Mutante:** devolva `name={null}` ao avatar → tem de acusar.

7. ⚠️ **A decisão G, e ela vai ficar vermelha de propósito.** Quando as duas chaves morrerem,
   `catalogs.test.ts › ⚠️ pins EVERY repeated phrase of the catalog` acusa o grupo
   `'Alguém do clube'` com 1 caminho em vez de 3. **Apague a linha do mapa** e escreva ao
   lado que o defeito que ela registrava foi resolvido nesta fatia, com a data.
   ⚠️ **NÃO** reescreva a linha para 1 caminho: um valor com um dono só não é duplicata, e
   deixá-la lá pinaria um não-defeito.

8. **`app.test.tsx › takes every label of the shell from the catalog`** continua verde sem
   edição. Frase solta no `App.tsx` é vermelho, e tem de continuar sendo.

9. ⚠️ **`theme-tokens.test.ts › paints the shell with exactly one background utility`** —
   o cabeçalho é `--surface` e a página é `--bg`, então o shell ganha **duas** superfícies
   agora. **Leia o teste antes de mexer**: ele mede o `<div>` raiz do `App.tsx`, não o
   cabeçalho. Se precisar mudar, diga **qual propriedade** mudou e por quê — e não afrouxe.

10. **Nenhuma chave de catálogo nova** (decisão I). As que morrem são as duas da decisão F.

11. ⚠️ **O orçamento (decisão J).** Cole o chunk de entrada **antes e depois**, e o quanto
    cada peça custou. **Se passar de 450.000, pare.**

12. ⚠️ **Os documentos, com riscar-e-explicar e data:**
    - **`docs/new-ui.md` §A.5 item 9** — a metade do nome do autor **fecha** aqui; risque-a
      dizendo em qual fatia e deixe a outra metade (o `atRisk`, recusado pelo dono) como está;
    - **`docs/BACKLOG.md`**, entrada 42 — o número do chunk medido, para a 43 saber a folga.

13. **Nenhuma migration, nenhum endpoint, nenhum schema.** ⚠️ **E nenhuma rota nova:**
    `GET /clubs/:clubId/members` já existe desde a Tarefa 26a e é o que as seis telas usam.
    Se parecer preciso criar rota, **pare**.

14. **Gates, com os números medidos ao fim da 41b (2026-09-21, tudo verde):**

    | | arquivos | testes |
    | --- | --- | --- |
    | `@clube/shared` | 22 | **601** |
    | `@clube/ui` | 33 | **284** |
    | `@clube/backend` (unit) | 85 | **1975** |
    | `@clube/app` | 35 | **868** |

    Build: entrada **436.557 B** · CSS **33.106 B** · `index.html` **1.638 B** ·
    precache **26 / 1184,42 KiB** · editor **453.606 B** pelo `ls`.

---

## Definição de pronto

- [x] Cabeçalho 52/56px sobre os tokens, com as medidas citadas por arquivo e linha.
- [x] `ContextBar` ligada ao `Link` do router, com acusador para o `<a>` cru.
- [x] `Screen` capaz de duas colunas; **nenhuma tela passa `rail`**; o caso vazio testado.
- [x] Filete duplo nas duas orientações.
- [x] **O nome do autor resolvido em `day-note.tsx` e `free-note.tsx`**, com os três casos da
      regra 6 testados e o mutante do `name={null}` acusando.
- [x] `pages.dayNote.others.author` e `pages.freeNote.author` removidas; o mapa de duplicatas
      **com a linha apagada** e o porquê escrito ao lado.
- [x] `chrome.test.tsx` (h1 e exceções), `app.test.tsx` (rótulos do catálogo) e
      `active-club.test.tsx` verdes **sem afrouxar nada**; todo `it()` editado justificado.
- [x] Os mutantes das regras 2, 3, 4, 5 e 6 acusaram, com número e nome.
- [x] Chunk de entrada medido e **abaixo de 450.000**, com o custo por peça.
- [x] `new-ui.md` §A.5.9 e `BACKLOG.md` atualizados com riscar-e-explicar.
- [x] Varredura de caracteres invisíveis sobre os arquivos do diff, **provando antes que ela
      morde** com um soft hyphen e um NBSP plantados.

---

## Notas de reconciliação (2026-09-21, medidas na execução)

> Esta seção **não reescreve nada acima**. Ela registra o que foi **medido** ao executar,
> nos pontos em que a spec ou o canvas descreviam outra coisa. Molde: a seção equivalente
> das Tarefas 39, 40 e 41a.

### 1. ⚠️ As DUAS linhas de artboard do cabeçalho estão erradas na spec — os números, não

A tabela "As medidas, e de onde tirá-las" cita `Inicio.dc.html:32` e
`InicioDesktop.dc.html:32`. **Medido** (`grep -n '<header' *.html` nos 21 artboards):

| artboard | linha do `<header>` | o que está na linha 32 |
| --- | --- | --- |
| `Inicio.dc.html` | **26** | o `<main>` |
| `InicioDesktop.dc.html` | **21** | o `</header>` |

Os **números** da spec (52px e 56px) estão **certos**, e as duas alturas são **unânimes
dentro de cada classe**: 52px em **16** artboards de celular e 56px nos **5** de desktop
(`DiaDesktop:21`, `InicioDesktop:21`, `LivroDesktop:21`, `NovaAnotacaoDesktop:23`,
`NovoGrifoDesktop:23`). O número está escrito porque "os artboards concordam" é a
**generalização de amostra** que já derrubou afirmações nas quatro fatias anteriores.

### 2. ⚠️ A decisão F afirma que o `nameOfWriter` devolve o fallback. Ele NÃO devolve

A decisão F diz: *"O fallback continua existindo — é `pages.acervo.item.author.other`, que
o `nameOfWriter` já devolve"*. **Medido em `pages/club-names.ts`:**

```ts
export function nameOfWriter(…): string | null {
  if (me !== null && userId === me.id) return me.name;
  return names.get(userId) ?? null;
}
```

Ele devolve **`string | null`** e não conhece catálogo nenhum — e não pode conhecer: é um
módulo sem React e sem i18n, e é isso que o faz valer para as sete telas. Quem troca o
`null` pela chave é **a tela**, com `?? t('pages.acervo.item.author.other')`, que é
exatamente o que `acervo.tsx:560`, `busca.tsx:488`, `activity-feed.tsx:486` e
`streak-bar.tsx:62` já escrevem. As duas telas desta fatia fazem o mesmo.

⚠️ **Por que registrar uma imprecisão de prosa:** ela é a que faria o próximo agente
procurar a chave DENTRO do `club-names.ts`, não achar, e concluir que precisa pôr i18n
naquele módulo — que é o único jeito de quebrá-lo para todo mundo.

### 3. ⚠️ São DUAS telas e SEIS usuários — o `new-ui.md` §A.5.9 dizia uma e quatro

O §A.5 item 9 diz *"na tela do dia o autor aparece como 'Alguém do clube'"* e que
*"o livro, o acervo e o feed já resolvem o nome"* (a nota de rodapé dele conta **quatro**
telas). **Medido** (`grep -rn "nameOfWriter" packages/app/src/pages/*.tsx`):

- já resolviam: **seis** — `acervo`, `activity-feed`, `book`, `busca`,
  `reading-marks`, `streak-bar`;
- ainda diziam "Alguém do clube": **duas** — `day-note.tsx` **e `free-note.tsx`**, que o
  §A.5.9 não citava. A decisão E desta spec já tinha corrigido o número; o `new-ui.md`
  não, e agora tem o risco-e-explica ao lado.

(⚠️ E `grep -rln "club-names"` dá **sete** arquivos, não seis: `acervo-filters.tsx`
importa o `MembersState` sem usar o `nameOfWriter`. As duas contagens medem coisas
diferentes, e a que interessa aqui é a do `nameOfWriter`.)

### 4. ⚠️ A decisão B revoga o `max-w-4xl`, e isso obriga a tocar o `book-form.tsx`

A decisão B manda as duas larguras de conteúdo darem lugar ao modelo do canvas. **Medido**:
`width="wide"` tem **quatro** ocorrências, todas em `packages/app/src/pages/book-form.tsx`;
`width="narrow"` tem **zero** (era o padrão). Com `ScreenWidth` reduzido a
`'reading' | 'entry'`, o `tsc` acusa os quatro — então **o `book-form.tsx` é a única tela
fora de `day-note`/`free-note` que esta fatia tocou**, com quatro deleções de uma palavra
e o docblock riscado-e-explicado.

⚠️ **E O QUE ISSO CUSTA É INFERÊNCIA, NÃO MEDIÇÃO — fica em aberto para o dono.** O canvas
**não tem artboard de desktop para o cadastro de livro**: os cinco de 1280px são
`Inicio`, `Dia`, `Livro`, `NovaAnotacao` e `NovoGrifo`. Medido no que existe
(`plan-editor.tsx:302,307,312,317`): a linha do plano vira `flex-row` a partir de `sm`
(640px) com `sm:w-44` + `sm:flex-1` + `sm:w-44`, logo ela **continua cabendo em uma
linha** — o campo do meio passa de ~490px para ~270px acima de 1120px. E **abaixo** do
corte a tela ficou **mais larga** que antes, porque o `max-w-4xl` (896px) deixou de
existir. Quem revisita é a **Tarefa 47**, dona dos formulários.

### 5. ⚠️ Uma divergência de canvas ADOTADA CONTRA o desenho: o nome do clube no celular

O canvas desenha o nome do clube **só** nos cinco artboards de 1280px
(`InicioDesktop.dc.html:24`), e o cabeçalho de celular não o tem. **Entregue visível nas
duas larguras**, em mono, e a razão não é gosto:

- é o **único** lugar do app em que o clube é nomeado no celular (o `ClubPicker` só vira
  `<select>` com 2+ clubes, e o uso inicial é um clube de casal);
- escondê-lo com `hidden min-[1120px]:block` seria **invisível para os testes**: o jsdom
  não aplica CSS, então `home.test.tsx › shows the club name in the header even with a
  single club (decision F)` continuaria **verde** com o nome apagado na tela. É a mesma
  classe do "medido e não entregue" que a 41b pagou nos 46px, com o agravante de a guarda
  existir e não morder.

### 6. O 1px do nome do app, e a mesma decisão do chevron da 41b

O canvas usa **16px** no celular (`Inicio.dc.html:27`) e **17px** no desktop
(`InicioDesktop.dc.html:23`). Entregue **16px** (`text-base`) nas duas larguras: 17px não
existe na escala fechada de sete degraus da Tarefa 39, e um degrau novo entra também na
lista fechada de isenções ao `light-dark()`. É a mesma decisão, e o mesmo registro, dos
14/15px do chevron da `ContextBar` e dos 18/19px do `PresenceMark`.

⚠️ Ele **não** engrossa a lista dos quatro arredondamentos de corpo que a 41a deixou em
aberto: aqueles são valores que o canvas usa e a escala não tem (13 · 14,5 · 11,5 · 12px);
este é um degrau que **existe** (16px = `text-base`) sendo usado nas duas larguras.

### 7. ⚠️ O recuo vertical da coluna depende da ORDEM DE EMISSÃO do Tailwind — medido

O `ReadingColumn` entrega `min-[1120px]:pt-10` e nada de recuo vertical abaixo do corte; o
canvas pede ~20px de topo no celular (`Livro.dc.html:41`) e 40px no desktop. O `Screen`
resolve com `pt-5 … min-[1120px]:pt-0` **na `<section>` interna** — os dois no MESMO
elemento, e é a ordem de emissão que decide.

**Medido no CSS compilado** (`dist/assets/index-*.css`): `.pt-5` no byte **14074**,
`@media (min-width:1120px)` no **19841**, `.min-\[1120px\]\:pt-0` no **20628** — o
utilitário de mídia sai depois, mesma especificidade, logo ele vence acima do corte.

⚠️ É a **mesma** dependência que a 41b registrou para o `pt-12` da home, e ela continua
**sem pino**: se uma atualização do Tailwind trocar a ordem, a coluna volta a somar 40+20px
no desktop, em silêncio. Registrado aqui porque agora são **dois** lugares que dependem
dela, e não um.

### 8. A varredura de invisíveis: 11 arquivos, zero ocorrências — e ela morde

Cobre NUL, NBSP, soft hyphen, ZWSP/ZWNJ/ZWJ, LRM/RLM, U+2028/U+2029, narrow NBSP, word
joiner, BOM e U+FFFD, com arquivo, linha e coluna.

**Provado que ela morde antes de confiar nela:** com um soft hyphen e um NBSP plantados num
comentário de `chrome.tsx`, ela acusou os dois (`chrome.tsx:124:12 SOFT HYPHEN`,
`:124:13 NBSP`). O canário foi desfeito por `cp -p` do backup, com `md5sum -c` OK e
conferência por conteúdo (`grep -c canario` → 0).

### 9. ⚠️ A armadilha de substring do `replyByUrl`, de novo — e ela é silenciosa

O `dayResponder` do `day-note.test.tsx` não tinha rota de `/members`. **Medido:**
`replyByUrl` casa por `includes`, e `'/clubs/c-casal/members'.includes('/me')` é
**`true`** — ou seja, o pedido de membros receberia o corpo do `/me`, que não passa no
`clubMembersResponseSchema`. Consequência: o teste do caminho **feliz** estaria medindo o
caminho da **falha**, e verde.

É a **segunda** aparição: o `free-note.test.tsx` já tinha o comentário
"`/members` vem ANTES de `/me`", medido na Tarefa 27. A linha nova do `day-note` entrou
antes do `/me`, com o motivo escrito ao lado.

---

## Notas de reconciliação — rodada de correção da auditoria (2026-09-21)

> A auditoria voltou com **2 bloqueadores, 5 altos, 6 médios e 5 baixos**, e derrubou
> **treze** afirmações do executor — **sete rotuladas "medido"**. **Três dos mutantes dela
> sobreviveram**, dois sobre propriedades que a fatia afirma entregar.
>
> ⚠️ **A classe de erro não é falta de medição — é não reler a própria medição antes de
> escrever a frase que a resume.** O relatório da entrega abria dizendo que eu tinha
> corrigido as citações erradas da spec "porque recontei"; na mesma fatia, **quatro
> citações de artboard minhas estavam erradas** e **duas contagens que eu marquei como
> "contados, não generalizados" eram falsas**. É a terceira fatia seguida com esse padrão.

### 10. ⚠️⚠️ O título do `Screen` foi medido em UM artboard e aplicado a oito telas

A entrega escreveu que os 25px do `Dia` eram "o único dos títulos do canvas que não
precisou de arredondamento" e que `Inicio` e `Livro` eram *"conteúdo de tela, não o degrau
da escala"*. **As duas afirmações são falsas**, e a segunda é a pior: os dois **são** o
`Screen.title` (`home.tsx` passa `pages.home.title`; `book.tsx:617-620` passa o título
do livro).

**Medido agora** — `grep -n '<h1' *.html` nos 21 artboards dá **15** ocorrências, e **10**
são o `Screen.title` de uma tela que usa este cromo:

| artboard | px | `line-height` | `letter-spacing` |
| --- | --- | --- | --- |
| `Acervo:44` · `Busca:44` · `Preferencias:44` | 28 | 1.14 | −0.02em |
| `Main:34` | 30 | 1.14 | −0.02em |
| `EditarLivro:47` · `NovoLivro:47` | 26 | 1.15 | −0.02em |
| `Livro:48` | 23 | 1.15 | −0.015em |
| `Dia:45` · `DiaEscuro:45` | 25 | 1.18 | −0.015em |
| `Inicio:51` | 27 | 1.18 | −0.015em |

Entregue a **maioria de cada propriedade**: `leading-[1.14]` (4 contra 3 e 3) e
`tracking-[-0.02em]` (6 contra 4). Os dois são **arbitrários**, não degraus de escala —
nada obrigava arredondamento, que é o que torna copiar um artboard gratuito e errado.
O **tamanho** continua `text-title` (25px) para os dez, e isso é **divergência declarada**:
acrescentar seis degraus à escala fechada de sete é decisão de desenho, e cada degrau novo
entra na lista fechada de isenções ao `light-dark()`.

⚠️ **E não havia acusador nenhum:** trocar a classe pela **pré-42**
(`text-2xl font-semibold`) passava por **886 testes**. Agora são **2**.

### 11. ⚠️⚠️ O filete duplo: a contagem estava errada e o padrão escolhido era a MINORIA

A entrega escreveu, com ênfase: *"São TRÊS artboards na primeira linha e UM na segunda —
contados, não generalizados"*. **Medido** (pelo par de `<div>` de `gap:3px`):

- filetes duplos no canvas: **15**, não 4;
- **abaixo de um `<h1>`**, que é onde o `Screen` põe o dele: **7** `top` contra **3**
  `bottom`;
- a lista de três citava `NovaAnotacao`, que **não tem `<h1>` nenhum**, e omitia
  `DiaEscuro`; o "UM" (`Inicio:44`) fica **acima** do h1, não abaixo.

Consequências que a entrega não declarou, e que a correção fecha:

1. o padrão era `bottom` — a minoria. Acervo, busca, preferências, book-form e home
   desenhavam o traço grosso embaixo onde o canvas o desenha em cima. **Padrão agora é
   `top`**;
2. o `Screen` desenhava filete **incondicionalmente**, e o canvas tem **três** telas sem
   filete nenhum (`Livro`, `NovoGrifo`, `CorrigirGrifo`). **Nasceu `rule="none"`**, e
   `book.tsx` e `highlight-form.tsx` o declaram;
3. o ramo `entry` **não** desenhava, com um comentário afirmando que a tela de entrada
   "não tem filete de abertura" — e `Main.dc.html:35` e `Convite.dc.html:37` **têm**.
   **Agora desenha**, e o filete saiu para uma variável só, lida pelos dois `return`.

### 12. ⚠️ O corte de tenant NÃO era testado — e é a regra mais fácil de esquecer do `CLAUDE.md`

Os dois `it()` que a entrega chamou de *"asks for the members of the club OF THE BOOK"*
usavam o fixture comum, em que `CASAL.id === CLUB_ID === book.clubId === 'c-casal'`: a
asserção era verdadeira para **as duas** origens possíveis. Medido: trocar `state.clubId`
por `activeClub?.id` — **o defeito que o docblock novo diz existir para impedir** —
passava por **886 testes**.

Fixture hostil agora (§7.2): o livro é de `c-outro` e o clube ativo é `c-casal`, e há um
par que exige a mesma origem para as NOTAS. **2 acusadores.**

### 13. ⚠️ A compensação de 48px da home estava escrita como FEITA, e não existia

`grep -rn "pt-12"` em `packages/{app,ui}/src` devolve **só prosa** — o docblock de
produção do `ReadingColumn`, o do teste vizinho e a entrada 42 do `BACKLOG.md` —, e o
`ScreenProps` **não tem `className`**: ela não era sequer possível sem mexer no `Screen`.

É a classe "medido e não entregue" que a própria entrega citou para os 46px da 41b, **com o
agravante de estar escrita como se tivesse sido feita**. Os três documentos foram
corrigidos, e a decisão ficou: **`pt-10` (40px) em todas as telas**, com os 8px de
`InicioDesktop.dc.html:35` como **divergência declarada**. Um `className` no `Screen` é
escotilha genérica; uma prop para um chamador só é o "peso" que a decisão B da 41a proíbe;
e a home é a tela da **Tarefa 45**.

### 14. ⚠️ Cinco citações de artboard erradas — a auditoria achou quatro

| onde | citava | é | o que está na linha citada |
| --- | --- | --- | --- |
| `App.tsx`, botão de preferências | `Inicio:28` | **`:29`** | o `<div>` que o contém |
| `App.tsx`, o "Sair" | `Inicio:31` | **`:32`** | o `</button>` — ⚠️ **esta a auditoria não achou** |
| `chrome.tsx`, o título | `Dia:43` | **`:45`** | (corrigida junto com a nota 10) |
| `chrome.tsx`, o título | `Inicio:52` | **`:51`** | idem |
| `chrome.tsx`, o título | `Livro:47` | **`:48`** | idem |
| `App.tsx` + `app.test.tsx` + `BACKLOG`, a correção da spec | "a `:32` do `InicioDesktop` é o `</header>`" | **`</div>`** | o `</header>` está na `:33` |

⚠️ **A última linha é a mais importante da tabela: ela é um erro DENTRO da correção.** A
entrega corrigiu as duas linhas erradas da spec e, ao explicar o que havia naquelas linhas,
errou uma — conferindo de cabeça em vez de ler o arquivo. É o mesmo defeito uma camada
acima, e nenhuma das duas auditorias o tinha achado.

Todas as **45** citações `Artboard.dc.html:N` dos arquivos desta fatia (8 arquivos) foram
reconferidas por um script que **imprime a linha citada** para leitura, e não por contagem
de cabeça. As 40 restantes estavam certas.

### 15. `pb-7` generalizado de um artboard — e o zero dos outros 15 é artefato do mock

A entrega citou `Inicio.dc.html:36` (`padding:… 28px …`) como se fosse a regra. Medido nos
16 artboards de celular: **15 têm `padding-bottom:0`**, e só o `Inicio` tem 28px.

Mas o zero dos 15 **não é decisão de desenho**: naqueles artboards o `<main>` é
`flex-grow:1` com `overflow:hidden` dentro de uma moldura de altura fixa, então o conteúdo
nunca chega à borda de baixo e o recuo inferior não pinta nada. O `Inicio` é o único em que
o conteúdo termina de verdade. Num app que **rola**, todas as telas terminam — então os
28px ficam, **declarados como decisão do app** e não como medida do canvas. (O `pt-5`, ao
contrário, é a maioria de verdade: **11 dos 16**.)

### 16. As outras correções da rodada

- **as duas exceções do `h1` não são exceção de TIPOGRAFIA**: `accept-invite.tsx` e
  `not-found.tsx` ficaram com `text-2xl font-semibold` enquanto as outras oito telas
  mudavam para Fraunces — duas tipografias de título no mesmo app, e nada acusava. As duas
  passaram a importar o mesmo `SCREEN_TITLE_CLASS`, com guarda de fonte;
- **`draws the aside, and the hairline that separates it` não asseria nem um nem outro**:
  o `<aside>` que ele achava era o **próprio fixture**, e não havia asserção de
  `border-l`. O fixture virou um `MarginRail` de verdade, e nasceu o par que prova que o
  `Screen` **repassa** a margem em vez de embrulhá-la;
- **a armadilha do `replyByUrl` continuava aberta** no SEGUNDO responder do
  `day-note.test.tsx` — a nota nº 9 declarava a classe fechada com metade dos responders
  arrumados, que é a própria "correção incompleta" que ela nomeia;
- **o `entry` tem UM chamador, não dois**: o `accept-invite.tsx` não usa `Screen`. A
  frase vinha da Tarefa 25 e foi repetida sem conferir;
- **o `ScreenContextBar` aceitava e descartava um `renderLink` em silêncio**. Agora o tipo
  o proíbe — com `Omit` **distributivo**, porque o `Omit` direto colapsa a união
  discriminada da `ContextBar` e devolve a combinação que a decisão H da 41b torna
  impossível (o `tsc` acusou: `TS2322`);
- **o `nameOfWriter` era chamado duas vezes por linha** nas duas telas, com os mesmos
  argumentos, onde o `acervo.tsx:570` usa um `const`. São dois lugares para alguém mexer
  em um só — o defeito que a decisão E fecha, em escala menor;
- **o pedido de membros é serializado depois da carga do livro**, e isso fica **registrado
  como custo, não consertado**: o `clubId` vem do livro, e o único palpite que permitiria
  paralelizar é o clube ATIVO — que é exatamente o defeito da nota 12;
- **o `gap-2` do grupo da direita do cabeçalho** (8px contra os 4px do canvas) ganhou
  justificativa escrita: lá o "Sair" é um `<a>` de 34px, aqui os dois são alvos de 44px
  pelo piso da decisão F, e 4px entre duas áreas de toque de 44px faz o dedo errar.

### 17. ⚠️ A divergência do nome do clube estava CERTA e SEM GUARDA

A nota 5 mediu certo e decidiu certo — mas **esconder o nome com `hidden
min-[1120px]:block` passava por 886 testes**. O jsdom não aplica CSS, então a guarda que
existe para isso (`home.test.tsx › shows the club name in the header even with a single
club`) fica **verde** com o nome apagado na tela: ela é cega justamente para a forma mais
provável de o defeito entrar. O acusador novo mede a CLASSE, que é a propriedade decidível.
