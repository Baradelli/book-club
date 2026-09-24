# Tarefa 47b — A anotação avulsa, o livro, e as margens que mostram o que vai sair

> **Décima segunda fatia do MVP 3.5**, e a segunda metade da 47. A **47a** fez o grifo no
> celular; esta faz a avulsa, o novo/editar livro, **e o desktop das três** — incluindo o do
> grifo, que a 47a adiou por medição.
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** e a entrada
> **47b** · ⚠️⚠️ **`docs/tasks/47a-o-grifo-vira-papel.md`, as notas 17 a 29** — em especial a
> **19** (os vinte números de contraste) e a **25** (o terceiro artboard) ·
> `docs/tasks/46-*.md`, as notas da rodada de correção · `docs/CONVENCOES-CODIGO.md` §7.1,
> §7.3, §7.4, §7.9, §7.10.

---

## ⚠️ O que a 47a ensinou, e que vale inteiro aqui

A auditoria da 47a achou **seis** mutantes sobreviventes em oito tentativas, e o veredito
foi: *"a suíte guarda **cor** e não guarda **forma**"*. Dezesseis mutantes atacavam **qual**
caneta pinta o quê; nenhum atacava **se** a pintura existe — largura, posição, altura,
degrau, presença.

⚠️ **Escreva os seus mutantes nos dois eixos desde o começo.** Para cada propriedade visual
que você entregar, pergunte: *existe um mutante de UMA LINHA que a apaga e deixa a suíte
verde?*

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | ⚠️⚠️ **As margens de desktop carregam a PRÉVIA: "Como vai aparecer no acervo"** | `NovaAnotacaoDesktop.dc.html:92` e `NovoGrifoDesktop.dc.html:105`. ⚠️ **A chave já existe nos DOIS namespaces desde a Tarefa 40** (`pt.ts:1070` em `freeNote`, `:1176` em `highlightForm`) e tem **zero consumidores de produção** — medido. Era planejada |
| **B** | ⚠️ **MEÇA se dá para reusar o `HighlightRow`, e decida com número** | `acervo-rows.tsx:95` nasceu na Tarefa 46 e desenha a linha do acervo. Mas ele recebe um `HighlightResponse` **salvo** e uma prop `onArchive` — e **arquivar não faz sentido numa prévia**. É o mesmo tipo de medição que a 47a fez com o `GrifoText` e que ela acertou na conclusão e errou no número: **meça as propriedades em comum de verdade**, não por impressão |
| **C** | ⚠️⚠️ **"Seus grifos recentes" NÃO entra** | `NovoGrifoDesktop.dc.html:123`. Ele precisa de **dado que o formulário não tem** — os grifos recentes de quem escreve —, e isso é endpoint. O cabeçalho do MVP 3.5 põe schema e endpoint **fora de escopo para a seção inteira**, com instrução literal de parar e perguntar. **Declare a ausência; não improvise com o que estiver na tela** |
| **D** | ⚠️ **Os parágrafos explicativos e os "Atalhos do editor" são CHAVES NOVAS** | `NovaAnotacaoDesktop:103` e `:108`, `NovoGrifoDesktop:118`. **Liste-as antes de escrever uma linha de produção**, com o texto exato, e **me diga quantas são**. Se passarem de **seis**, pare |
| **E** | **O desktop é 680 + 320 com filete**, como as fatias 42–46 fixaram | `NovaAnotacaoDesktop:47`/`:91` e `NovoGrifoDesktop:47`/`:104`. Nada de mecanismo novo |
| **F** | ⚠️⚠️ **O desktop do grifo herda a nota 19 da 47a, e o filete do artboard NÃO se copia** | `NovoGrifoDesktop` pinta o filete do papel com `--gold-line`, que dá **1,84:1** contra a página — **pior** que o `--pen-a-dot` de hoje (2,28) e pior que tudo. ⚠️ **Mantenha o filete da caneta** e declare a divergência. A nota 19 tem os vinte números; **leia antes** |
| **G** | ⚠️ **A regra do "dia com anotação" JÁ EXISTE — não a reimplemente** | `EditarLivro.dc.html:78` e `:103` descrevem o comportamento atual: `pt.ts:863` é `dayWithNote: 'Dia {{number}} · tem anotação'` e `:832` é a mensagem do 400 do domínio (regra 12). O canvas **descreve**, não pede |
| **H** | **O diálogo de arquivar da avulsa** | `Avulsa.dc.html:72` (o gatilho) e `:82` (o diálogo). ⚠️ **Ninguém arquiva conteúdo de outra pessoa** (`CLAUDE.md`) — o acusador do dono tem de continuar |
| **I** | ⚠️⚠️ **`free-note.tsx` tem 602 linhas canônicas: é o MAIOR arquivo do app, 202 acima do teto de 400** | Esta fatia **não pode engordá-lo**. Se crescer, corte por assunto e **diga por medição o que saiu e para onde** — ⚠️ **e registre o efeito no arquivo que RECEBER**, no docblock dele. É a lição da 46 (a tela encolheu 33 e o vizinho absorveu 208 em silêncio) e a 47a a cumpriu direito: imite a 47a |
| **J** | **Nenhuma migration, endpoint ou schema** | É fatia de tela |

---

## As medidas, e de onde tirá-las

⚠️ **Escreva o script que imprime a linha citada ANTES da primeira citação** — e ⚠️ **PERGUNTE SE A LISTA DE ARTBOARDS ESTÁ COMPLETA.** Na 47a a minha lista estava incompleta e o executor conferiu as dez citações uma a uma sem notar que faltava um artboard inteiro. Os desta fatia, medidos por mim:

| artboard | linhas |
| --- | --- |
| `NovaAnotacao.dc.html` | 98 |
| `NovaAnotacaoDesktop.dc.html` | 126 |
| `Avulsa.dc.html` | 102 |
| `NovoLivro.dc.html` | 125 |
| `EditarLivro.dc.html` | 131 |
| `NovoGrifoDesktop.dc.html` | 146 |

**Se existir um sétimo que eu não listei, diga.**

| peça | onde |
| --- | --- |
| a prévia | `NovaAnotacaoDesktop:92` · `NovoGrifoDesktop:105` |
| as colunas | `NovaAnotacaoDesktop:47`/`:91` · `NovoGrifoDesktop:47`/`:104` |
| o que **não** entra | `NovoGrifoDesktop:123` |
| as chaves novas | `NovaAnotacaoDesktop:103`, `:108` · `NovoGrifoDesktop:118` |
| o diálogo de arquivar | `Avulsa.dc.html:72`, `:82` |
| o plano | `NovoLivro.dc.html:85`, `:92` · `EditarLivro.dc.html:72`, `:78`, `:103` |

⚠️ **Case cada tamanho contra os sete `--size-*`** (`9.5 · 10 · 11 · 14 · 15 · 17.5 · 25`) e
**declare TODOS os que não baterem** — a 47a declarou dois e calou quatro, e a assimetria foi
o achado. ⚠️ **E prosa custa CSS:** o scanner do Tailwind lê o texto bruto, comentário
incluído. Confira o CSS antes/depois.

---

## As regras

1. **TDD estrito**. **Vermelho colado** para cada guarda nova. ⚠️ **Se a guarda nascer verde
   contra a implementação, diga isso** — o vermelho dela é o do mutante, e a 47a registrou
   essa distinção com honestidade. Imite.

2. ⚠️⚠️ **A prévia com acusador de CONTEÚDO, não de presença.** **Mutante:** a prévia mostra
   um texto fixo em vez do que está no formulário → acusa. **E o inverso:** ela deixa de
   refletir a última tecla digitada → acusa.

3. ⚠️ **A decisão C provada por ausência.** **Mutante:** invente "Seus grifos recentes" com o
   que estiver na tela → ⚠️ **não deve existir mutante, porque o bloco não deve existir.**
   O que tem de existir é a **declaração escrita** de por que ele não entrou.

4. ⚠️ **A decisão F com guarda.** **Mutante:** o filete do papel no desktop vira `--gold-line`
   (o do artboard) → acusa, e o acusador diz **por que** (1,84 contra 2,28).

5. ⚠️ **O par celular × desktop guardado dos DOIS lados**, por **token** e nunca por regex:
   `c.split(':').at(-1) === 'hidden'`. Este bloco já pagou **cinco** vezes por metade de par,
   e a 46 achou a forma frágil copiada para outra tela.

6. ⚠️ **A varredura anti-culpa em TODOS os estados das quatro telas**, incluindo os de erro,
   o de arquivar e o 400 do "dia com anotação". **Leia `anti-guilt-dom.ts` antes de escolher
   a variante** — as duas são mutuamente exclusivas desde a 44 e **não se copia de teste
   antigo**.

7. ⚠️ **A decisão H: ninguém arquiva conteúdo de outra pessoa.** **Mutante:** tire o guarda de
   autoria do diálogo → acusa.

8. ⚠️ **A decisão G não é reimplementada.** **Mutante:** troque a mensagem do 400 por texto
   solto → o catálogo acusa. E **não** invente lógica nova de plano.

9. **Nenhuma chave nova além das da decisão D**, e essas **listadas antes** de escrever.

10. **Tamanho pelo contador canônico** (`acervo.tsx:115-126`), **nunca `wc -l`**. Hoje:
    `free-note.tsx` **602** · `book-form.tsx` **456** · `plan-editor.tsx` **239**.
    ⚠️ **Dois já estão acima do teto de 400.** Ver decisão I.

11. **O orçamento, colado antes e depois.** Entrada em **441.343 B** contra o teto de
    **450.000** — folga **8.657 B**, e ainda falta a **48**. ⚠️ **Se esta fatia comer mais de
    ~4.000 B, diga** — e se passar de 6.000, **pare e me avise antes de continuar**.

12. **Varredura de caracteres invisíveis** nos arquivos do diff, **provando antes que morde**,
    com os code points montados **por número**.

---

## Definição de pronto

- [x] A prévia existe nas duas margens de desktop, **refletindo o formulário**, com os dois
      acusadores da regra 2. _(M1 e M3 = mostrar texto fixo; M2 e M4 = deixar de seguir a
      última tecla.)_ ⚠️⚠️ **E ESTE ITEM ESTAVA MARCADO PELA METADE — a auditoria
      mediu e é o BLOQUEADOR da rodada de correção.** O M2 foi consertado numa tela e
      num campo só; a rota de CORREÇÃO do grifo e a referência da avulsa seguiam sem
      dono, com **999 verdes** para `draft={EMPTY_DRAFT}` e para `reference=""`. Os seis
      `it()` da prévia do grifo usavam **todos** o `highlightNewPath`. Fechado na nota 20.
- [x] A decisão B medida e decidida **com número** — nota 3: **2 de 6** props honestas,
      **4 de 15** campos reais, e ⚠️ **10 de 13** propriedades em comum (o número era
      "8 de 13" e estava errado; apenas UMA das recusadas é estrutural — nota 3). Escolhido reusar as
      CLASSES e a truncagem, nunca o componente; e o par ficou guardado dos dois lados
      (M14 e M15).
- [x] "Seus grifos recentes" **declarado como ausente**, com o motivo (rota fora de escopo
      da seção inteira) — nota 4, mais a guarda do efeito observável. _(A auditoria não
      derrubou nada deste item.)_
- [x] ⚠️ **A barra de canetas ligada na avulsa** (decisão do dono, 2026-09-24), com o par
      guardado dos DOIS lados e o terceiro estado (leitura) provado — nota 17.
- [x] ⚠️ **A prévia da avulsa PAROU de mostrar a referência** (decisão do dono, 2026-09-24):
      a promessa "Como vai aparecer no acervo" passou a ser literalmente verdadeira. A
      ausência é **guardada, não só apagada** — acusador na rota de criar e na de corrigir,
      e o mutante que a traz de volta acusa **2 vezes** (M29). A pendência *"ou o acervo
      ganha a referência, ou a prévia a perde"* está **RESOLVIDA** — nota 31.
- [x] As chaves novas **listadas antes de escrever**: eram **cinco**, nota 2. ⚠️ **Hoje
      são SETE, por decisão do dono (2026-09-24):** a terceira linha de atalho entrou
      junto com a barra de canetas. A razão da ausência (**naquela tela o gesto não
      existia**, medido no `RichEditor`) estava CERTA e caiu por decisão, não por erro —
      notas 2 e 17. O teto de seis foi ultrapassado pelo dono, e está declarado.
- [x] O desktop do grifo entregue, **com o filete da caneta e a divergência do artboard
      declarada** — nota 5, com os quatro números (1,84 × 2,28 × 4,59 × 1,35) e o mutante
      M9 com 4 acusadores.
- [x] O diálogo de arquivar, com o guarda de autoria provado por mutante _(M8, **5**
      acusadores, um deles nomeando a propriedade em vez de contar botões)_.
- [x] A regra do "dia com anotação" **intacta**, sem lógica nova — nota 6 (M16, 2
      acusadores). ⚠️⚠️ E o **rótulo** `dayWithNote` continua sem consumidor — mas **NÃO
      por falta de dado**, como este item dizia: a tela carrega o
      `bookWithPlanResponseSchema`, que traz `writers` (`planItemId` + `userIds[]`), e
      `userIds` não vazio É "este dia tem anotação". **Zero schema, zero rota, zero
      requisição a mais.** A pendência é de ESCOPO (a decisão G diz que o canvas
      descreve), e a razão falsa foi corrigida na nota 6 e no `BACKLOG`.
- [x] Varredura anti-culpa verde em **todos** os estados das quatro telas — nota 10, com a
      lista dos dezenove estados e a escolha da variante justificada.
- [x] `free-note.tsx` **não engordou**: **602 → 568**. O corte está medido e registrado **no
      arquivo que recebeu** — nota 8. ⚠️ E o `highlight-form.tsx` também encolheu
      (427 → 407), pela mesma regra.
- [x] Nenhuma migration, endpoint ou schema. `schema.prisma` segue
      `968c9986f7a2dfb4ccbd738b13d44715`.
- [x] **Todos** os tamanhos fora da escala declarados — **nove**, mais ⚠️ **cinco**
      divergências de token e de família, nota 11. (Eram "três": a auditoria achou duas a
      mais, uma delas INTRODUZIDA pela fatia — o filete do card da prévia da avulsa. A
      47a declarou dois e calou quatro; esta declarou nove e calou duas.)
- [x] Gates colados antes e depois, com bytes, folga, CSS e os contadores canônicos —
      nota 13, e a rodada de correção na **nota 29**. Entrega: +2.888 B. Correção:
      **+276 B**, entrada em **444.507**, folga **5.493**, CSS **36.804 = zero byte**.
- [x] Varredura de invisíveis, com a prova de que morde — nota 14, refeita na rodada de
      correção: **zero** em **dezesseis** arquivos; o par positivo acusa 2 de 2 e o
      script estoura se acusar menos.

---

## Notas de reconciliação

_O executor anexa aqui o que mediu e divergiu da spec. Numere de 1 em diante. Se um número ou
uma citação desta spec estiver errado, **corrija-o aqui e no `BACKLOG.md`**, dizendo como
mediu — e **declare TODOS**. ⚠️ Na 47a a minha lista de artboards estava incompleta:
**pergunte se esta está.**_
---

### 1 · As citações desta spec, conferidas uma a uma — **todas exatas**, e a lista de artboards está INCOMPLETA

O script que imprime a linha citada foi escrito **antes** da primeira citação
(`scratchpad/t47b/cite.mjs`: lê o arquivo, imprime `nnnn | <linha>`, e escreve
`<<FORA DO ARQUIVO>>` quando o número passa do fim).

| peça | spec | medido | veredito |
| --- | --- | --- | --- |
| a prévia | `NovaAnotacaoDesktop:92` | `<span …>Como vai aparecer no acervo</span>` | ✅ |
| a prévia | `NovoGrifoDesktop:105` | idem | ✅ |
| as colunas | `NovaAnotacaoDesktop:47`/`:91` | `width:680px` · `width:320px` + filete à esquerda | ✅ |
| as colunas | `NovoGrifoDesktop:47`/`:104` | idem | ✅ |
| o que **não** entra | `NovoGrifoDesktop:123` | `<span …>Seus grifos recentes</span>` | ✅ |
| chave nova | `NovaAnotacaoDesktop:103` | o parágrafo "Anotação avulsa fica fora do plano do dia…" | ✅ |
| chave nova | `NovaAnotacaoDesktop:108` | `<span …>Atalhos do editor</span>` | ✅ |
| chave nova | `NovoGrifoDesktop:118` | o parágrafo "A cor da caneta é um filtro…" | ✅ |
| o diálogo | `Avulsa:72`, `:82` | "Arquivar anotação" (gatilho) · `<h2>Arquivar anotação</h2>` | ✅ |
| o plano | `NovoLivro:85`, `:92` | "Plano de leitura" · `<label for="primeiro">Primeiro dia` | ✅ |
| o plano | `EditarLivro:72`, `:78`, `:103` | "Plano de leitura" · o 400 do domínio · "Dia 3 · tem anotação" | ✅ |
| o filete do desktop | `NovoGrifoDesktop:54` | `border: 1px solid #d6ae64`, que é `--gold-line` | ✅ |
| as seis contagens | 98 · 126 · 102 · 125 · 131 · 146 | idênticas (`wc -l`) | ✅ |
| `pt.ts:1070` / `:1176` | as duas `preview.heading` | ❌ **as duas linhas são `preview: {`; as `heading:` estão em `:1071` e `:1177`** | ❌ nota 22 |
| `pt.ts:863` / `:832` | `dayWithNote` · o 400 | ✅ (`:831` é a chave, `:832` é a frase) | ✅ |
| `acervo-rows.tsx:95` | `HighlightRow` | ✅ `export function HighlightRow({` | ✅ |
| contador canônico | 602 · 456 · 239 | ✅ os três | ✅ |
| orçamento | 441.343 B · 36.804 · 10.059 · 449.522 · 1.638 · 27 | ✅ os seis, medidos no build de entrada | ✅ |

~~⚠️ **Zero citações erradas — é a primeira vez nesta série.**~~

⚠️⚠️ **FALSO, e a auditoria derrubou: a tabela tem 18 linhas e DUAS delas
estão erradas** — a do `pt.ts` (acima, desvio de uma linha) e a do
`Acervo.dc.html` na alínea (a) logo abaixo. Ver as notas 22 e 19. A linha
riscada fica para a próxima pessoa ver que a afirmação existiu e caiu.

⚠️⚠️ **MAS A LISTA DE ARTBOARDS NÃO ESTÁ COMPLETA, e a spec perguntou. São
DOIS a mais, e o primeiro decidiu a decisão B:**

**(a) `Acervo.dc.html`.** Ele não é tela desta fatia, e é **a referência de
desenho que as duas prévias prometem por escrito**: "como vai aparecer no
acervo". Sem lê-lo eu teria desenhado a prévia contra o artboard do
formulário e não contra aquilo que ela promete, que é a diferença entre uma
prévia e uma ilustração. É ele que resolve a decisão B — ver a nota 3.

⚠️⚠️ **MAS O QUE EU ESCREVI AQUI SOBRE ELE ERA FALSO, e a auditoria mediu.**
A frase original dizia que a linha de grifo do acervo (`:87-97`) e o card da
prévia do `NovoGrifoDesktop` (`:107-116`) eram *"o mesmo desenho — mesmo
fundo, mesmo filete, mesmo raio, mesma ordem de Grifo · bolinha · Página ·
avatar · trecho · comentário"*. Contado elemento a elemento: o acervo tem
**sete** elementos e a prévia do canvas tem **seis** — falta nela o **nome de
quem escreveu** (`Acervo.dc.html:93`, Instrument Serif itálico 15px). E os
números diferem: recuo **14 × 16**, espaço **9 × 10**, trecho **16 × 15**. A
ordem que eu citei é a do `NovoGrifoDesktop`, não a do acervo.

⚠️ **A DECISÃO CONTINUA CERTA; o apoio escrito é que não estava.** E ela fica
ainda mais certa medida assim: o que a prévia segue é o ACERVO, então ela
mostra o autor — o sétimo elemento, o que o artboard da prévia esqueceu.
Registrado no docblock do `highlight-rail.tsx`. → nota 19.

⚠️ **E A ALÍNEA (a) VALEU PARA O GRIFO E NÃO VALEU PARA A AVULSA** — ver a
nota 18, que é o achado mais caro desta auditoria.

**(b) `CorrigirGrifo.dc.html`.** Não existe `CorrigirGrifoDesktop`, e a tela de
correção do grifo **divide o `Screen` com a de registro**: a margem que esta
fatia entrega aparece nas duas. O desktop da correção é, portanto, **derivado**
— a mesma decisão que a Tarefa 46 tomou para o acervo, que também não tem
artboard de desktop. Declarado, não inventado.

⚠️ **E FALTAVA DECLARAR O TERCEIRO CASO DERIVADO, que a auditoria cobrou:** o
**desktop de `NovoLivro` e de `EditarLivro`** também é derivado. Os dois
artboards existem só na largura de celular, e as duas telas dividem o mesmo
`book-form.tsx`; o desktop delas sai do `Screen`/`ReadingColumn`, como o do
acervo e o da correção do grifo. Eu declarei o do `CorrigirGrifo` e calei
estes dois, que é a mesma assimetria que a decisão F desta fatia existe para
não repetir.

### 2 · As chaves novas, com o texto exato — eram cinco, hoje são SETE

Pedido: listar antes de escrever, e parar se passarem de seis. **São cinco.**

| chave | texto |
| --- | --- |
| `pages.freeNote.preview.about` | `Anotação avulsa fica fora do plano do dia. Ela aparece no acervo do livro e na busca do clube, junto com as do dia.` |
| `pages.freeNote.shortcuts.heading` | `Atalhos do editor` |
| `pages.freeNote.shortcuts.block` | `inserir bloco` |
| `pages.freeNote.shortcuts.quote` | `citação` |
| `pages.highlightForm.preview.about` | `A cor da caneta é um filtro no acervo e na busca — vale escolher uma e manter o significado dela ao longo do livro.` |
| `pages.freeNote.shortcuts.select` | `selecionar` — ⚠️ **na rodada de correção** |
| `pages.freeNote.shortcuts.highlight` | `grifar com a caneta` — ⚠️ **na rodada de correção** |

⚠️ **A FIDELIDADE LITERAL CUSTARIA SETE, e eu parei em cinco por duas razões —
uma de orçamento e uma que é melhor que orçamento.**

O canvas desenha **três** linhas de atalho (`:109`, `:110`, `:111`), e a
terceira é `selecionar · grifar com a caneta`. Ela custaria **duas** chaves, e
não uma: `/` e `>` são as teclas que a pessoa digita (iguais em qualquer
idioma, e por isso vão num `<kbd>` sem passar pelo catálogo), mas
"selecionar" é **prosa**. Duas chaves para uma linha = 7 no total, acima do
teto de seis.

⚠️⚠️⚠️ **A RAZÃO ABAIXO CAIU — POR DECISÃO DO DONO (2026-09-24), NÃO POR
ERRO DE MEDIÇÃO.** A medição estava certa e continua registrada porque ela
é o motivo pelo qual a linha **não podia** entrar então: o gesto não
existia. O dono mandou ligar a barra de canetas na avulsa (ver a nota 17),
o gesto passou a existir, e a linha entrou — com as duas chaves que esta
nota já tinha contado. **O teto de seis chaves foi ultrapassado por decisão
do dono, e está declarado aqui em vez de escondido.**

⚠️⚠️ **A RAZÃO, PARA O REGISTRO: naquela tela o gesto NÃO EXISTIA.** Medido no
`RichEditor`: quem aplica caneta é a `PenBar`, e ela é governada pela prop
`penBar`, cujo padrão é `'none'`; o `free-note.tsx` **não a passava** (só o
`day-note.tsx` passava, com `'fixed'` — hoje os dois passam). O menu de bolha que aparece na seleção
carrega o `FormatControls`, **não as canetas**. Ou seja: escrever "selecionar ·
grifar com a caneta" na margem da avulsa seria a tela **mentindo** sobre o que
ela faz — a mesma classe de defeito que a 47a recusou no "Rascunho guardado"
(nota 11 da 47a). As duas linhas que ficaram (`/` e `>`) são verdadeiras hoje:
o menu `/` é extensão sempre registrada, e o `>` é a regra de entrada de citação
do StarterKit.

**~~Pendência de desenho registrada, não executada~~ — ✅ EXECUTADA NA
RODADA DE CORREÇÃO (nota 17):** a barra de canetas do
`NovaAnotacao.dc.html:72-85` (celular) e do `NovaAnotacaoDesktop:77-88`
(rodapé da coluna) **foi ligada**. O que eu escrevi abaixo continua verdade,
e é o que fez a execução ser de uma linha. Ela é de uma linha (`penBar="fixed"` +
`slashHintLabel`), sem chave nova — e os dois artboards **discordam da forma**:
o de celular a desenha ancorada no fim da janela e o de desktop como rodapé da
coluna, que são exatamente as duas variantes `fixed` e `footer` que a Tarefa 43
criou. Escolher entre elas é decisão de desenho, a Definição de pronto desta
fatia não a pede, e ligá-la mudaria o comportamento de escrita da tela. **Se o
dono quiser, é uma linha — digo e faço.**

✅ **O DONO QUIS, E FOI UMA LINHA.** ⚠️ E as duas variantes **não
precisaram de escolha**: a forma `'fixed'` já é as duas, por media query —
ver a nota 17.

### 3 · A decisão B, medida com número: **não reusar o `HighlightRow`; reusar as CLASSES e a truncagem**

A 47a acertou a conclusão e errou o número ao medir o `GrifoText`. Aqui o
número vem primeiro.

**Props.** O `HighlightRow` tem **seis**. A prévia entrega **duas** honestas
(`t`, `mine`) e teria de **fabricar quatro**: `writerName` (um nome que o
artboard não mostra), `bookId` (para um link que não pode existir), `onArchive`
(arquivar um grifo que ainda não foi gravado) e `highlight`.

**Campos.** O `highlight` é um `HighlightResponse` de **quinze** campos. O
formulário tem **quatro** (trecho, cor, página, referência). Os outros **onze**
seriam invenção: `id`, `clubId`, `bookId`, `userId`, `planItemId`, `status`,
`archivedAt`, `createdAt`, `updatedAt`, `commentDoc` e `commentText` — e o
último é **derivado no backend** (ADR 0001), então ele nem poderia nascer aqui.

**Propriedades visuais.** Contadas uma a uma no `HighlightRow`: são **treze**.

⚠️⚠️ **O RECORTE DELAS ESTAVA ERRADO, e a auditoria remediu: é 10 querida de
13, recusa 3 — não 8 e 5.** Refeita a conta, propriedade a propriedade:

| # | propriedade | prévia |
| --- | --- | --- |
| 1 | o `<li>` | ❌ recusa — **e é a ÚNICA estrutural** |
| 2 | o papel do card | ✅ |
| 3 | a linha de metadados | ✅ |
| 4 | o rótulo "Grifo" | ✅ |
| 5 | a amostra de cor | ✅ |
| 6 | o nome da cor | ✅ |
| 7 | a página | ✅ |
| 8 | a referência | ✅ |
| 9 | o avatar | ✅ |
| 10 | o `authorLabel` | ✅ |
| 11 | o trecho truncado | ✅ |
| 12 | o comentário truncado | ❌ recusa (ADR 0001 — nota 12) |
| 13 | o par de ações (corrigir + arquivar) | ❌ recusa |

Os dois erros da conta antiga: **(a)** eu não contei o `authorLabel` entre as
queridas — e o meu próprio mutante M20 existe *porque* a prévia o renderiza —,
nem o comentário entre as recusadas; **(b)** as "cinco recusadas" contavam o
`<li>` **três vezes** (o `<li>`, "a posição em lista" e a `key` são a mesma
propriedade vista de três ângulos). **Apenas UMA é estrutural**, não duas.

**A conclusão não muda** — 10 de 13 compartilhadas, com 11 campos de
`HighlightResponse` a fabricar, continua dizendo "reuse as classes, não o
componente". O que muda é o apoio escrito, que é o que a próxima pessoa lê.

**Decidido: não reusar o COMPONENTE, e reusar o que é compartilhado de
verdade.** `ACERVO_CARD_CLASS` e `ACERVO_META_CLASS` saíram do meio do JSX de
`acervo-rows.tsx` e viraram exportações; a truncagem vem do `excerptOf` +
`QUOTE_EXCERPT_LENGTH` de `acervo-entries.ts`, que é o mesmo dono; e as
palavras vêm de `pages.acervo.kind.*` e `pages.acervo.item.page`, que são as do
acervo. A prévia passa a ser igual ao acervo **por construção**, sem fabricar
um registro salvo.

⚠️ **E o par está guardado dos DOIS lados**, o que só existe porque um mutante
cobrou: o lado da prévia por `highlight-form.test.tsx › wears the ACERVO’S
card`, e o lado do acervo por `acervo.test.tsx › draws the acervo card from the
SAME constant the preview reads`. O segundo **nasceu de um sobrevivente**
(M15) — sem ele, o acervo podia voltar a escrever as classes à mão e a promessa
quebrava com a suíte verde.

### 4 · A decisão C: "Seus grifos recentes" **não entrou**, e por quê

`NovoGrifoDesktop.dc.html:122-132` lista **grifos anteriores de quem escreve**.
Medido: o `highlight-form.tsx` não carrega o acervo em modo nenhum — na criação
ele não faz requisição de carga alguma, e na correção ele pede o livro e a
listagem **filtrada pelo grifo que está sendo corrigido**. A única fonte seria
`GET /books/:bookId/highlights` sem filtro, e o cabeçalho do MVP 3.5 põe **rota
e schema fora de escopo para a seção inteira**, com instrução literal de parar
e perguntar.

**Não há mutante, porque não há bloco.** O que existe é a declaração — aqui, no
docblock do `highlight-rail.tsx` — e uma guarda do **efeito observável**:
`highlight-form.test.tsx › has NO "your recent highlights" block` prova que a
margem não acrescenta requisição nenhuma e não tem lista. Se alguém improvisar
o bloco com o que está na tela, a primeira asserção acusa; se alguém o
implementar de verdade, a segunda acusa — e a conversa com o dono acontece
**antes** do endpoint, que é o ponto.

### 5 · A decisão F: o filete do papel continua o da caneta, e o acusador diz POR QUÊ

Lidos antes de decidir: a nota 19 da 47a (os vinte números) e a nota 25 (o
terceiro artboard). Os números que decidem, medidos contra a página, no tema
claro:

⚠️ **O CRITÉRIO É O 1.4.11 (contraste de não-texto, mínimo 3:1), e NÃO o
"3.2.2" que esta nota escreveu.** `3.2.2` é "On Input" — não tem nada a ver
com contraste; neste repositório o número circula como apelido da FÓRMULA de
luminância relativa, e a fórmula não é o critério. Herdado da 47a. O acusador
já escrevia `1.4.11` certo na asserção e errado no cabeçalho — corrigido nos
dois (`highlight-form.test.tsx`).

| filete | contraste | veredito |
| --- | --- | --- |
| `--gold-line`, o que o `NovoGrifoDesktop:54` pede | **1,84 : 1** | o pior de todos |
| o par escuro da caneta, pior caso (amarelo) | **2,28 : 1** | 24% melhor que o do artboard |
| o par escuro da caneta, melhor caso (azul) | **4,59 : 1** | 149% melhor |
| o filete neutro do app | 1,35 : 1 | pior ainda (e é o estado da base — nota 19 da 47a) |

**Mantido o da caneta.** Copiar o valor do desktop pioraria **as cinco**
canetas, e no escuro o `--gold-line` cai para 1,65.

⚠️ **E não havia como servir os dois:** os dois artboards são a MESMA tela em
duas larguras, servida por media query (o `ReadingColumn`, decisão G). Um
filete diferente por largura exigiria ramificação por dispositivo, que é o que
o projeto não faz.

O acusador é `highlight-form.test.tsx › ⚠️ THE EDGE OF THE PAPER IS THE PEN’S,
never the canvas gold (decision F)`, com os quatro números no docblock dele — e
o mutante **M9** (os cinco filetes viram `border-gold-line`) tem **4**
acusadores.

### 6 · A decisão G: a regra do "dia com anotação" está intacta — e o RÓTULO dela não tem de onde sair

Confirmado por medição, e são duas coisas diferentes no mesmo artboard:

- **`EditarLivro:78`, o 400 do domínio.** Existe e está guardado desde a Tarefa
  20: `book-form.tsx:604` mapeia a recusa para `pages.bookForm.plan.dayHasNotes`,
  e dois testes provam que a frase da API **não** chega à tela. O mutante
  **M16** (mandar o texto da API para a tela) tem **2** acusadores. **Nada foi
  reimplementado.**
- **`EditarLivro:103`, o rótulo "Dia 3 · tem anotação".** A chave
  `pages.bookForm.plan.dayWithNote` existe desde a Tarefa 40 e continua **sem
  consumidor de produção** — e agora está medido **por que**: o
  `PlanItemResponse` tem sete campos (`id`, `bookId`, `order`, `date`, `title`,
  `reference`, `createdAt`) e **nenhum diz se o dia tem anotação**.

  ⚠️⚠️ **MAS A RAZÃO QUE EU DEI ERA FALSA, e a auditoria mediu.** Eu escrevi
  que renderizar o rótulo *"exigiria um campo novo no schema de resposta ou
  uma segunda requisição — schema e rota, os dois fora de escopo"*. O
  `planItemResponseSchema` tem mesmo sete campos ✅, **mas a tela não carrega
  um `PlanItemResponse` solto**: `book-form.tsx:168` carrega o
  `bookWithPlanResponseSchema`, que traz **`writers`** —
  `Array<{ planItemId, userIds[] }>`. `userIds` não vazio **é** "este dia tem
  anotação". É literalmente o que o `CLAUDE.md` descreve como *"`getBookWithPlan`
  devolve livro + plano + quem já escreveu"*.

  **Zero schema, zero rota, zero requisição a mais.** A pendência é de
  **ESCOPO** — a decisão G diz que o canvas *descreve* aquele rótulo e não o
  pede, e esta fatia não o implementou —, e **não** de dado faltando. A
  diferença importa: "falta dado" manda a próxima pessoa abrir um schema;
  "falta decisão" manda ela perguntar ao dono. Corrigido também no `BACKLOG`.

### 7 · O que o livro ganhou, e por que só isso

`EditarLivro:71-74` desenha o rótulo da seção do plano e **a contagem de dias**
na mesma linha. A chave `pages.bookForm.plan.days` (com par de plural) nasceu na
Tarefa 40 e estava **sem consumidor**; agora tem um. É a única peça dos dois
artboards de livro que tinha **dado e chave** disponíveis — o rótulo do dia é a
nota 6, e o resto (o rótulo "Dia N" de cada card, a caixa tracejada do gerador)
exigiria chave nova, que a regra 9 proíbe além das cinco da decisão D.

⚠️ **Dois mutantes cobraram, e os dois eram armadilhas de substring/plural:**

- **M10** — a contagem aparece também no plano VAZIO. Sobreviveu com **0**
  acusadores na primeira tentativa, e a causa é fina: o i18next em português
  escolhe `days_one` para `count: 0` (a regra `one` do CLDR cobre 0 e 1), então
  o defeito aparece como **"0 dia"** e a minha asserção procurava "0 dias".
  Corrigida para procurar as **duas** formas; hoje o mutante tem 1 acusador.
- **M11** — o plural perde a metade singular. Sobreviveu com **0** porque
  **"1 dias" contém "1 dia"**: a asserção positiva sozinha ficava verde com o
  texto errado na tela. Corrigida com a metade negativa; hoje tem 1 acusador.

### 8 · A decisão I: `free-note.tsx` **encolheu**, e os dois cortes estão registrados no arquivo que recebeu

| arquivo | entrada | saída | Δ |
| --- | --- | --- | --- |
| `free-note.tsx` | **602** | **568** | **−34** |
| `free-note-fields.tsx` | — | **99** | novo |
| `highlight-form.tsx` | 427 | **407** | **−20** |
| `highlight-fields.tsx` | 309 | **337** | +28 |
| `highlight-rail.tsx` | — | **63** | novo |
| `acervo-rows.tsx` | 88 | **92** | +4 |
| `plan-editor.tsx` | 239 | **247** | +8 |
| `book-form.tsx` | 456 | **456** | intocado |

Pelo contador canônico (`acervo.tsx`), nunca `wc -l`.

**O que saiu de onde, e por quê.** Do `free-note.tsx` saiu o `NoteFields` (os
dois campos), e a margem nasceu ao lado dele em vez de na tela: o assunto do
arquivo novo é *"o que a pessoa digita, e o espelho do que ela digitou"*, e é o
que faz "a prévia reflete o formulário" ser verdade **por construção** — a
margem recebe os mesmos valores que os campos mostram, não uma segunda fonte.

⚠️ **E o `highlight-form.tsx` também encolheu, de propósito.** A fatia lhe
acrescentava +14 (as duas props de margem e o `me` do contexto) estando **27
acima do teto**; a 47a tinha escrito, com essas palavras, que *"um teto que vale
para um arquivo só é um teto que anda de lado"*. Então o campo do comentário
(`LazyComment`, com o import dinâmico do editor) mudou para o vizinho, onde já
moram os outros campos do grifo, e a margem foi para **arquivo próprio** — que
é o que mantém os dois lados abaixo de 400 em vez de trocar uma violação por
duas.

**Registrado nos arquivos que RECEBERAM**, não só aqui: o docblock do
`free-note-fields.tsx`, o do `LazyComment` em `highlight-fields.tsx` e o do
`highlight-rail.tsx` dizem cada um o que ganharam e de onde. É a lição da 46.

⚠️ **Um ponteiro de teste teve de acompanhar o corte, e ele é do §7.4:**
`highlight-form.test.tsx › imports the editor DYNAMICALLY` lia o fonte do
formulário. Ele agora lê **os dois** arquivos **pelo nome** — o dinâmico é
exigido no vizinho, e o estático continua proibido nos dois, que é o que faz o
ponteiro não envelhecer para o lado errado.

### 9 · A tabela de mutação — **nos DOIS eixos, 20 mutantes, e QUATRO sobreviveram**

Protocolo em cada um: `md5sum` + `cp -p` → `.mjs` **ancorado, com âncora e
substituto em ARQUIVO** (estoura se a âncora não aparecer exatamente 1 vez, e
se âncora = substituto) → **`grep` de confirmação** → `pnpm --filter @clube/app
test` → contar e **nomear** → `cp -p` de volta → `md5sum -c` **e** `cmp` por
conteúdo. **Os 20 restauraram idênticos.**

**Eixo A — "a prévia mostra o que o formulário tem?" (conteúdo)**

| # | mutante | arquivo | acus. | quem acusou (1º) |
| --- | --- | --- | --- | --- |
| M1 | o título da prévia vira TEXTO FIXO | `free-note-fields` | **1** | `⚠️ shows the title of the LAST keystroke, and never a fixed text` |
| M2 | a margem recebe o título CARREGADO, não o digitado | `free-note` | **0 → 1** | `⚠️ follows the keystroke on the CORRECTION screen too…` |
| M3 | o trecho da prévia vira TEXTO FIXO | `highlight-rail` | **2** | `⚠️ shows the quote of the LAST keystroke…` |
| M4 | a prévia ignora a CANETA escolhida | `highlight-rail` | **1** | `follows the PEN, the page and the reference…` |
| M13 | a prévia deixa de TRUNCAR como o acervo | `highlight-rail` | **1** | `⚠️ wears the ACERVO’S card, and cuts the quote…` |
| M16 | o 400 do domínio vira o texto da API | `book-form` | **2** | `brings the removed day BACK…` |

**Eixo B — "a pintura existe? onde? de quem é?" (forma)**

| # | mutante | arquivo | acus. | quem acusou (1º) |
| --- | --- | --- | --- | --- |
| M5 | a margem da avulsa perde o `hidden` (aparece no celular) | `free-note-fields` | **1** | `⚠️ keeps the margin OFF the phone and ON the desktop` |
| M6 | a margem do grifo perde o `min-[1120px]:flex` (some no desktop) | `highlight-rail` | **1** | idem, do outro arquivo |
| M7 | a margem aparece na anotação de OUTRA pessoa | `free-note` | **2** | `⚠️ has NO margin on the note of ANOTHER person` |
| M8 | o guarda de AUTORIA do arquivar cai | `free-note` | **5** | `⚠️ ONLY THE AUTHOR ARCHIVES (decision H)` |
| M9 | o filete do papel vira o dourado do artboard de desktop | `highlight-fields` | **4** | `refuses the desktop artboard’s gold edge, in all five pens` |
| M10 | a contagem de dias aparece no plano VAZIO | `plan-editor` | **0 → 1** | `⚠️ says NOTHING when the plan has no day` |
| M11 | a contagem perde o singular ("1 dias") | `plan-editor` | **0 → 1** | `counts the days it HAS, in the plural the language asks for` |
| M12 | a tecla do atalho deixa de ser `<kbd>` | `free-note-fields` | **1** | `lists the editor shortcuts as a KEY and what it does` |
| M14 | a prévia do grifo escreve as PRÓPRIAS classes de card | `highlight-rail` | **2** | `⚠️ wears the ACERVO’S card…` |
| M15 | **o ACERVO** deixa de usar a constante compartilhada | `acervo-rows` | **0 → 1** | `draws the acervo card from the SAME constant the preview reads` |
| M17 | o cabeçalho "Como vai aparecer no acervo" some da avulsa | `free-note-fields` | **0 → 1** | `⚠️ keeps the margin OFF the phone and ON the desktop` |
| M18 | o cabeçalho some da margem do grifo | `highlight-rail` | **0 → 1** | idem, do outro arquivo |
| M19 | o filete entre a prévia e os atalhos some | `free-note-fields` | **0 → 1** | `lists the editor shortcuts as a KEY and what it does` |
| M20 | a prévia do grifo perde o AVATAR e o "Você" | `highlight-rail` | **0 → 1** | `⚠️ wears the ACERVO’S card…` |

⚠️⚠️ **QUATRO SOBREVIVERAM na primeira tentativa, e os dois piores são os
mesmos da 47a com outra roupa.** M17 e M18 apagam **a frase que dá sentido à
fatia inteira** — "Como vai aparecer no acervo", a chave que a Tarefa 40 plantou
para exatamente isto — e deixavam **999 testes verdes**: a margem continuava no
lugar, com as classes certas, dizendo nada. A suíte guardava **a caixa** e não
guardava **a promessa**. M15 e M19/M20 são a mesma família: meio par guardado
(M15) e pintura sem dono (M19, M20).

⚠️ **Sobre o "vermelho colado".** Dos guardas desta fatia, os de **conteúdo**
(M1, M3, M4) poderiam ter nascido vermelhos e não nasceram — a implementação foi
escrita antes deles, porque a fatia é de tela e não de regra. **Os quatro
vermelhos de verdade desta rodada são os dos sobreviventes**, colados acima na
coluna "0 → 1", cada um medido com o protocolo inteiro antes e depois do
conserto. É a mesma distinção que a nota 17 da 47a registrou, e ela continua
valendo: num ciclo dirigido por mutação, o vermelho da guarda **é** o do
mutante.

### 10 · A varredura anti-culpa: qual variante, e onde

`anti-guilt-dom.ts` lido antes de escolher (as duas variantes são **mutuamente
exclusivas** desde a rodada de correção da 44). Veredito: **`expectNoGuilt()`**,
nunca `expectNoGuiltWithPlanPosition()` — nenhuma das quatro telas mostra a
posição no plano em estado nenhum, e a variante da posição exige ≥ 1 subtração
efetiva, então usá-la aqui ficaria vermelha na hora. Nos estados com campo
inválido, `expectNoGuiltBesidesFormError()` com a lista exata dos vermelhos
legítimos (é o que os testes de 400 do `book-form` já faziam).

**Estados varridos nesta fatia:** margem da avulsa em branco · com título ·
com título reescrito · com referência · com referência apagada · na correção
da minha anotação · na anotação de OUTRA pessoa (ausente) · durante a carga
(ausente) · com o livro em 404 (ausente) · margem do grifo sem caneta · com
caneta · com página · com referência · com trecho longo truncado · no grifo de
outra pessoa (ausente) · plano com 3 dias · plano com 1 dia · plano vazio · o
400 do "dia com anotação" (com `expectNoGuiltBesidesFormError`).

⚠️ **E a contagem nova passa sem isenção**: "30 dias" não casa o
`COUNTER_SHAPE` (que exige `de`/`of`/`/` entre dois números), então ela não
precisou entrar em `COUNTER_EXEMPT_KEYS` — o que é o teste certo de que ela
**não é placar**.

### 11 · TODOS os tamanhos fora da escala — não só alguns

A escala fechada tem sete degraus (`theme.css:446-458` — ⚠️ a citação dizia
`:446-457` e o sétimo degrau está em **458**): **9,5 · 10 · 11 · 14 ·
15 · 17,5 · 25**. A 47a declarou dois e calou quatro; esta declara **nove**.

| # | onde | canvas | entregue | por quê |
| --- | --- | --- | --- | --- |
| 1 | `NovaAnotacaoDesktop:99`, a linha do tipo (⚠️ o canvas escreve "Avulsa · vários capítulos"; desde a nota 31 a prévia escreve só "Avulsa") | **9px** | 10px (`Eyebrow`) | 9 não é degrau; 10 é o do rótulo, e usar o `Eyebrow` compra as guardas dele em vez de escrever a tipografia à mão (é a lição N5 da 47a) |
| 2 | `NovaAnotacaoDesktop:103`, o parágrafo da margem | **13px** | 14px (`text-sm`) | 13 não é degrau; 14 é `--size-ui`, o degrau de interface |
| 3 | `NovaAnotacaoDesktop:109-111`, a descrição do atalho | **12,5px** | 14px (`text-sm`) | idem |
| 4 | `NovoGrifoDesktop:118`, o parágrafo da margem | **13px** | 14px (`text-sm`) | idem |
| 5 | `NovoGrifoDesktop:109` e `:111`, "Grifo" e "Página … · Cap. …" | **9px** | **12px** (`text-xs`) | ⚠️ **e aqui eu escolhi o ACERVO contra o canvas**: a linha de metadados vem inteira do `ACERVO_META_CLASS`, e é o que faz a prévia ser o acervo. 12px **também não é degrau** — é `text-xs` do Tailwind, e essa divergência é **herdada**, não introduzida: ela já estava no `acervo-rows.tsx` desde a Tarefa 28 |
| 6 | `NovoGrifoDesktop:114`, o trecho da prévia | **15px** | herda 16px | mesma razão: o `HighlightRow` mostra o trecho num `<p class="text-content">` sem degrau, e a prévia promete o acervo, não o artboard. **Divergência herdada** |
| 7 | `NovaAnotacaoDesktop:97`, o título da prévia | **15px** | herda 16px | o `ListItem` do acervo também não põe degrau no título. Idem |
| 8 | `EditarLivro:73`, a contagem de dias | **9,5px** | 10px (`Eyebrow`) | 9,5 **é** degrau (`--size-micro`), e mesmo assim saiu 10: o `Eyebrow` é o dono do rótulo de seção e ele é 10px fixo. Meio pixel, contra abrir uma prop de tamanho no componente para um chamador |
| 9 | `NovaAnotacaoDesktop:109-111`, a tecla do atalho | **11px** | 11px ✅ | **bate** — está aqui só para a lista ser completa |

⚠️ **Fora da escala de TAMANHO, mais três divergências de token/valor, para a
lista não ficar parcial** (o defeito que a nota 26 da 47a nomeia):

1. **A tinta da linha do tipo** (a do "Avulsa"): o canvas usa `--text-subtle` e
   saiu `--text-muted` (o tom padrão do `Eyebrow`). É **mais escuro**, logo
   melhor contraste — e é o tom que a linha de metadados do acervo já usa.
2. **A família do título da prévia**: o canvas põe Fraunces nos dois lados (na
   prévia e na linha do acervo), e o `ListItem` de `packages/ui` **não** põe.
   A prévia saiu em Fraunces (o artboard desta fatia manda), então nesta única
   propriedade ela está **um passo à frente** do acervo de hoje. Registrado:
   quem repintar o `ListItem` fecha a diferença, e isso é `packages/ui`.
3. **O raio do card da prévia**: o canvas dá 4px nas duas margens; saiu
   `rounded-control`, que é o que o `ACERVO_CARD_CLASS` traz. Mesmo argumento
   da 5 e da 6 — a prévia segue o acervo.

⚠️⚠️ **E FALTAVAM DUAS, uma delas INTRODUZIDA por esta fatia — a auditoria
achou, e "lista parcial" é o defeito que esta própria nota diz existir para
não repetir:**

4. **O filete do card da prévia da avulsa**: saiu `border-line` (`#d8d1bf`) e
   os três artboards de card pedem `--border-soft` (`#e3ddc9`)
   (`Acervo.dc.html:87`, `NovaAnotacaoDesktop:94`, `NovoGrifoDesktop:107`).
   ⚠️ **Era introduzida** — o card era cópia à mão. Na rodada de correção ele
   passou a ler o `ACERVO_PAPER_CLASS`, e a divergência virou **herdada**: o
   card do acervo já a tinha desde a Tarefa 28. Mantida de propósito —
   `--border-soft` é mais claro, logo pior de contraste.
5. **A tinta da contagem de dias**: `EditarLivro:73` usa `--text-subtle` e o
   `Eyebrow` sai `muted`. É o mesmo par da divergência 1 desta lista (a linha
   do tipo), e eu declarei um e calei o outro. `muted` é mais
   escuro, logo melhor contraste.

Com as duas, a lista é de **nove tamanhos + cinco divergências de token**.

### 12 · O que a prévia **não** mostra, e é decisão: o corpo do texto

As duas margens mostram **o que o formulário tem como TEXTO** (título,
referência, trecho, página, cor) e **não** o resumo do corpo — que é o que a
linha do acervo mostra no subtítulo.

A razão é o ADR 0001: `plainText` (e `commentText`) são **derivados do documento
no backend** e nunca entram no corpo da API. Recalculá-los no PWA criaria um
**segundo dono da mesma derivação**, dentro do pacote errado, garantido a
divergir do primeiro na primeira anotação com lista, citação ou imagem — e a
prévia passaria a mentir exatamente sobre o que ela promete. O único dono hoje
é `packages/backend/src/domain/doc-to-text.ts`, e movê-lo para `shared` é
decisão de arquitetura, não de pintura.

**Consequência declarada:** a prévia da avulsa mostra título + "Avulsa ·
referência" + avatar, e não o `Você · Estou juntando aqui…` do
`NovaAnotacaoDesktop:98`; a do grifo mostra tudo menos o comentário
(`NovoGrifoDesktop:115`).

### 13 · Gates, bytes e CSS — antes e depois

| | entrada (`e96204f`) | saída | Δ |
| --- | --- | --- | --- |
| `pnpm -r test` shared | 607 | **607** | = |
| ui | 305 | **305** | = |
| backend | 1994 | **1994** | = |
| app | 981 | **999** | **+18** |
| chunk de entrada | 441.343 B | **444.231 B** | **+2.888** |
| folga até 450.000 | 8.657 | **5.769** | −2.888 |
| CSS | 36.804 B | **36.804 B** | **= (zero, e byte a byte idêntico)** |
| `book-form` | 10.059 | **10.244** | +185 |
| editor | 449.522 | **449.522** | = |
| `index.html` | 1.638 | **1.638** | = |
| precache | 27 | **27** | = |

**A fatia custou 3.073 B no total**, dentro do orçamento de ~4.000 e longe dos
6.000 que exigiriam parar. Sobram **5.769 B** para a **48**.

⚠️ **O CSS não mexeu UM BYTE, e isso foi conferido por `cmp`, não pelo total** —
o arquivo construído é idêntico ao da entrada. A razão: nenhuma classe nova
entrou no projeto. Todas as **treze** que a fatia escreve (⚠️ eram "doze" nesta nota: `gap-2.5`,
`px-1.5` e `py-0.5` são **três** espaçamentos fracionários, não dois — a
conclusão "nenhuma classe nova" continua certa)
(`rounded-callout`, `bg-surface-raised`, `font-mono`, `text-label`,
`text-content`, `h-px`, `bg-line-soft`, `min-w-0`, `items-baseline`,
`font-reading` e os dois espaçamentos fracionários) **já eram emitidas** por
outras telas — conferido uma a uma no CSS construído, com `grep -F` sobre o
seletor escapado (⚠️ a primeira conferência deu três **falsos negativos**
porque o ponto do nome da classe vem escapado no CSS e o meu padrão o tratava
como metacaractere; refeita com `-F`).

⚠️ **E a prosa não custou nada**, que é a lição da 46: os docblocks desta fatia
citam valores e nomes de utilitário, e o único que poderia emitir seletor novo
(`border-gold-line`, citado no acusador da decisão F) **já é escrito em
código** no `theme.css`/`packages/ui`.

`pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` ·
`pnpm --filter @clube/app build`: **todos verdes**.

`schema.prisma` segue `968c9986f7a2dfb4ccbd738b13d44715`. **Nenhuma migration,
endpoint ou schema** — `git diff --name-only e96204f` lista 12 arquivos
modificados e 2 novos, todos em `packages/app` e `packages/shared/src/locales`.

### 14 · A varredura de invisíveis, com a prova de que morde

`scratchpad/t47b/invisiveis.mjs`: 22 code points montados **por número**
(`String.fromCodePoint`), nenhum glifo colado no script. ⚠️ **O par positivo
vem antes da varredura e o script ESTOURA se ele falhar**: num texto plantado
com `U+200B` e `U+00A0` ele tem de acusar **2 de 2** — acusou.

Nos **quinze** arquivos do diff (os 12 modificados, os 2 novos e esta spec):
**zero invisíveis**. Os não-ASCII são todos visíveis e de propósito: acentos do
português, `U+2014` (travessão), `U+00B7` (o ponto médio dos separadores),
`U+26A0 U+FE0F` (o aviso dos docblocks), `U+2192`, `U+2212`, `U+201C`/`U+201D`
e `U+2019`.

### 15 · O que tentei e não deu certo

1. **Pendurar a margem do grifo no `highlight-fields.tsx`.** Escrito e medido:
   o arquivo ia a **373**, ainda abaixo do teto, mas o `highlight-form.tsx`
   ficava em **441** — +14 num arquivo já 27 acima. Desfeito; a margem virou
   arquivo próprio e o campo do comentário mudou de casa, e aí o formulário
   **encolheu**. O caminho abandonado está aqui para ninguém refazê-lo achando
   que economiza um arquivo: ele troca um arquivo a menos por um teto a mais.
2. **`tone="subtle"` no `Eyebrow`.** Vermelho no `tsc` na hora — o componente
   tem **duas** tintas (`muted` e `gold`), por decisão da Tarefa 41b. Somar uma
   terceira em `packages/ui` para meio tom de cinza numa prévia seria crescer o
   design system por um chamador. Ficou `muted` (nota 11).
3. **Assertar o tamanho da prévia com `toBe(pt.…kind.free)`.** Falhou na hora,
   e por um motivo que vale registrar: o `textContent` do card **inclui a
   inicial do avatar** ("MAvulsa"). Trocado por `toContain` mais a metade
   negativa do separador — que é a forma que continua provando a ausência da
   referência.
4. **Importar `tokensOf` do harness no `highlight-form.test.tsx`.** Colisão de
   nome: aquele arquivo já tem um `tokensOf(element)` local que responde outra
   pergunta (todas as classes de um nó). Importado com apelido, e o motivo está
   escrito no `import` — dois nomes iguais em escopos diferentes é o ponteiro
   ambíguo do §7.4.
5. **Procurar o contador indevido como "0 dias".** Nunca acusaria: o i18next em
   português usa `days_one` para zero. Só apareceu porque o mutante M10
   sobreviveu e eu fui ler o DOM.

### 16 · Uma guarda que mudou de casa, e o motivo é um achado da 46

`tokensOf` e `hidingOf` — a guarda de visibilidade **por token** — viviam
dentro do `acervo.test.tsx`. Esta fatia precisava da mesma guarda em mais duas
telas, e a 46 já tinha achado a forma **frágil** (a regex de fronteira, que
acerta 6 de 13 variantes) **copiada** de uma tela para outra.

Enquanto a função certa vive dentro de um arquivo de teste, a próxima tela que
precisar dela **copia** — e copiar é exatamente por onde a forma frágil volta.
As duas subiram para o `harness.tsx`, que é onde o `readableText` e o
`withoutDiacritics` já moram, com um dono só e o histórico escrito no docblock.
O `acervo.test.tsx` passou a importá-las (⚠️ **75** testes, não 74: o `it()`
que nasceu do M15 entrou no mesmo commit e eu contei o número de antes.
Verdes antes e depois).

---

## Notas da RODADA DE CORREÇÃO (2026-09-24)

_Um revisor separado auditou a entrega, derrubou **treze afirmações** e achou **seis mutantes
sobreviventes**, um deles bloqueador. Estas notas são do executor da correção — que não é quem
escreveu a fatia. Cada item diz **o que eu medi**, não o que me disseram._

### 17 · A DECISÃO DO DONO: as canetas entram na anotação avulsa — e o par, dos dois lados

A entrega deixou a barra de fora e registrou a ausência como **pendência de desenho** (nota 2),
com o argumento de que os dois artboards discordam da forma. **O dono decidiu ligá-la.**

⚠️ **Medido primeiro, e a medição desfaz a "discordância":** `RichEditor.tsx:648-664` monta a
barra com `placement === 'fixed'` valendo **as duas larguras ao mesmo tempo** — ela ancora a
barra acima do teclado no celular e a devolve ao rodapé da coluna acima de 1120px, por media
query e sem ramificação de dispositivo. Ou seja: `NovaAnotacao.dc.html:72-85` (celular,
ancorada na janela) e `NovaAnotacaoDesktop:77-88` (rodapé da coluna de 680px) **não são duas
formas**, são uma. A forma `'footer'` é a metade de desktop sozinha.

**Entregue** (`free-note.tsx`, dentro do `LazyEditor`, que serve aos **dois** `return` da tela —
criar e corrigir — e ao de leitura):

```tsx
penBar={editable === false ? 'none' : 'fixed'}
slashHintLabel={t('editor.slashHint')}
```

⚠️ **"Ligada no celular e esquecida no desktop" é a metade de par que este bloco já pagou cinco
vezes** — então o par está guardado de três ângulos:

| lado | onde | o que prova |
| --- | --- | --- |
| a tela | `free-note.test.tsx › asks for the FIXED bar` | que a tela pede **exatamente** `'fixed'`, e não "alguma barra" |
| o editor | `packages/ui/.../pen-bar.test.tsx:135-136` | que `'fixed'` carrega o celular **e** o desktop, no mesmo `it()` |
| o avesso | `free-note.test.tsx › …and NEVER when reading` | que a anotação de OUTRA pessoa não ganha caneta nenhuma |

**Mutantes, com o protocolo inteiro:** **M25** (`'fixed'` → `'footer'`, a metade de desktop
sozinha) → **2** acusadores; **M25b** (`'none'` → `'fixed'` no ramo de leitura) → **1**.

⚠️ **E o dublê do editor precisou mudar**, pela partição do §7.9: ele passou a expor
`data-pen-bar` e `data-slash-hint`. O que se prova no app é **o que a tela decide** (qual das
três formas, e em que estado); quem desenha as classes é o `packages/ui`, e é lá que a prova
das duas larguras mora. Um dublê que renderizasse a barra de verdade seria uma segunda
implementação dela dentro de um arquivo de teste.

### 18 · A terceira linha de atalho entrou — e a nota 2 está corrigida, não apagada

A nota 2 dizia que "selecionar · grifar com a caneta" ficou de fora porque *"naquela tela o
gesto NÃO EXISTE"*. ⚠️ **A medição estava certa** — a tela não passava `penBar`, e escrever o
gesto ali seria a tela mentindo, que é a mesma classe de defeito que a 47a recusou no "Rascunho
guardado". **Com a decisão do dono o gesto passa a existir, e a razão cai por DECISÃO, não por
erro.** Está escrito assim na nota 2, no `pt.ts` e no `free-note-fields.tsx`: a distinção
importa, porque "eu errei a medição" e "o mundo mudou" mandam a próxima pessoa para lugares
diferentes.

**Duas chaves novas** (as que a nota 2 já tinha contado): `pages.freeNote.shortcuts.select` =
`selecionar` e `pages.freeNote.shortcuts.highlight` = `grifar com a caneta`. Com elas a fatia
vai a **sete**, acima do teto de seis da decisão D — **por decisão do dono, declarada**.

⚠️ **E a caixa da esquerda dela é PALAVRA, não tecla** — o canvas a desenha assim
(`NovaAnotacaoDesktop:111`). O `<kbd>` continua certo: ele marca *o que a pessoa faz*, e a
terceira linha é um gesto sem tecla. O docblock do `Shortcut` foi corrigido, porque ele afirmava
o contrário em maiúsculas.

### 19 · A6 · O `pt.ts` dava um motivo FALSO, e é o arquivo que a próxima pessoa abre

O comentário do bloco `shortcuts` dizia que a linha ficou de fora *"para nomear um gesto cujos
cinco botões estão desenhados na MESMA margem, três linhas abaixo
(`NovaAnotacaoDesktop:79-83`)"*.

**Medido, linha a linha do artboard:**

| afirmação | medido | veredito |
| --- | --- | --- |
| `:79-83` são as cinco canetas | sim, os cinco `<button aria-label="Caneta …">` | ✅ |
| "na MESMA margem" | não: estão no **rodapé da coluna de leitura** (`:77-88`); a margem de 320px começa em `:91` | ❌ |
| "três linhas abaixo" | **~29 linhas acima** do bloco de atalhos (`:108-111`) | ❌ |
| e estavam na tela entregue | **não existiam** — a tela não passava `penBar` | ❌ |

⚠️ **A nota 2 dava a razão CERTA e o `pt.ts` dava a OPOSTA e falsa.** Com a decisão do dono o
comentário mudou de assunto inteiro: ele agora conta a medição do `RichEditor`, a decisão, e
**o erro antigo**, para ninguém reconstruí-lo.

### 20 · BLOQUEADOR · A família que a entrega fechou pela metade

A entrega achou o M2 (*"a suíte guardava a tela de CRIAR e deixava a de corrigir sem dono"*) e
consertou **um campo de uma tela**. Medido o resto:

| mutante | arquivo:linha | antes | depois |
| --- | --- | --- | --- |
| a margem da correção do grifo congela num rascunho vazio (`draft={EMPTY_DRAFT}`) | `highlight-form.tsx:622` | **0** | **1** |
| a correção da avulsa ignora a referência para sempre (`reference=""`) | `free-note.tsx:904` | **0** | **1** |

**Como eu medi que estava aberto**, antes de escrever uma linha: `grep -n "renderForm(" ` nos
seis `it()` novos de `highlight-form.test.tsx` que tocam a prévia — **todos** passam
`highlightNewPath`. O único da rota de correção é o da margem ausente no grifo alheio, que prova
uma ausência, não um espelho. E a Definição de pronto marcava *"com os dois acusadores da regra
2"*.

**Consertado com a forma exata que a própria entrega tinha inventado para o título** — digitar
**por cima** do valor carregado e afirmar o novo **e a metade negativa do carregado**:

- `highlight-form.test.tsx › ⚠️ follows the keystroke on the CORRECTION screen too, not the
  loaded draft` — os **três** campos de texto da rota de correção (trecho, referência e página),
  cada um com as duas metades;
- `free-note.test.tsx › ⚠️ follows the REFERENCE on the CORRECTION screen too, not the loaded
  one`.

⚠️ **Por que a metade negativa não é redundância:** sem ela, uma prévia congelada no valor do
servidor passa no primeiro `toContain`; sem a positiva, uma prévia congelada no vazio passa no
`not.toContain`. Os dois mutantes são opostos e exigem as duas asserções.

### 21 · A2 · Quatro sobreviventes na mesma família, todos com 999 verdes

| # | mutante | arquivo:linha | antes | depois | acusador |
| --- | --- | --- | --- | --- | --- |
| M22 | a prévia da avulsa mostra outra pessoa no avatar | `free-note-fields.tsx:165` | **0** | **1** | `⚠️ signs the preview with ME` |
| M22b | a prévia do grifo mostra outra pessoa, com o rótulo ainda dizendo "Você" | `highlight-rail.tsx:93` | **0** | **1** | idem, do outro arquivo |
| M23 | os dois atalhos TROCAM de descrição (`/` = citação, `>` = inserir bloco) | `free-note-fields.tsx:194-195` | **0** | **1** | `… as a KEY and what it does — PAIRED` |
| M24 | a prévia da avulsa perde a palavra "Avulsa" **quando há referência** | `free-note-fields.tsx:188` | **0** | **2** | `says WHERE the note lands` |
| M26 | a terceira linha de atalho some | `free-note-fields.tsx` | — | **1** | `… — PAIRED` |
| M27 | a prévia da avulsa perde o AUTOR | `free-note-fields.tsx` | — | **1** | `⚠️ signs the preview with ME` |

**As formas dos consertos, e por que cada uma:**

- **O avatar** virou asserção de IDENTIDADE, não de presença: o `it()` renderiza com
  `meReply({ name: 'Zilda' })` — um nome que mais ninguém no fixture tem — e compara o
  `textContent` do avatar com `'Z'`. Contar `.bg-person` (o que havia) fica verde com o avatar
  de qualquer pessoa, e `name={null}` rende o glifo neutro, que também passava.
- **Os atalhos** viraram asserção de **PAR**: cada `<kbd>` casado com o `nextElementSibling`, numa
  lista de três pares. As duas metades soltas — teclas de um lado, descrições do outro — é o que
  deixava a troca passar. ⚠️ **É a mesma classe que a entrega RECUSOU por escrito** (*"seria a
  tela mentindo"*): as duas linhas que ficaram podiam passar a mentir sem vermelho.
- **A palavra do acervo** passou a ser conferida **COM** a referência preenchida
  (`${kind} · p. 112`), e não só sem ela.

⚠️ **O quarto é o mais irônico dos seis:** o docblock do `FreeNoteRail` diz, em maiúsculas,
*"AS PALAVRAS 'Avulsa' E O AVATAR SÃO OS DO ACERVO, de propósito"* — e as **duas** propriedades
que ele nomeia eram as duas que um mutante apagava sem acusador. Está escrito lá agora, com os
acusadores pelo nome: um docblock que afirma uma propriedade e não aponta quem a guarda é um
convite a apagá-la.

### 22 · A5 · A prévia da avulsa quebrava a promessa que ela imprime

A margem imprime *"Como vai aparecer no acervo"*. Medido contra o que o acervo **desenha**:

**1. O AUTOR — corrigido.** `acervo.tsx:591-605`: `subtitle={excerpt === '' ? author : …}`, ou
seja, **sem corpo o subtítulo é só o autor**, que é exatamente o caso da prévia.
`Acervo.dc.html:103` e `NovaAnotacaoDesktop:98` desenham os dois. A prévia não mostrava autor
nenhum. ⚠️ A nota 12 declarava a ausência pelo **ADR 0001**, e a razão **vale para o RESUMO, não
para o AUTOR**: `authorLabel` é `t()` puro, sem derivação — e a prévia do **grifo** já o usava
(`highlight-rail.tsx:94`). Entrou, com `text-sm text-muted`, que é a classe do `subtitle` do
`ListItem` (o mesmo nó do acervo). Mutante **M27**, 1 acusador.

**2. A REFERÊNCIA — ~~declarada, não corrigida~~ ✅ RESOLVIDA (nota 31).**
`grep -n reference acervo.tsx acervo-entries.ts` → **zero**. A prévia escrevia
`Avulsa · p. 112`, uma linha que o acervo não desenha em lugar nenhum. Eu declarei a
divergência e devolvi a escolha ao dono; **ele escolheu tirar a referência da prévia**, que é
a opção que torna a promessa literalmente verdadeira. Feito, com acusador dos dois lados —
**nota 31**.

**3. O CARD — o dono compartilhado entrou.** O papel era **cópia à mão** do `ACERVO_CARD_CLASS`
(`free-note-fields.tsx:154`), que é literalmente o defeito que o par M14/M15 existe para
impedir, do lado que ninguém guardou. `ACERVO_CARD_CLASS` foi partido em
`ACERVO_PAPER_CLASS` (fundo, filete, raio, recuo) + a direção, que fica com quem chama — o card
de grifo empilha, a prévia da avulsa põe o avatar ao lado, e o canvas concorda
(`Acervo.dc.html:87` × `NovaAnotacaoDesktop:94`). Mutante **M28** (o papel repintado à mão, com
desvio) → **1** acusador, `⚠️ wears the ACERVO'S paper, and not a hand copy of it`.

⚠️ **E o card em si é divergência declarada:** no acervo a anotação é um `ListItem` **sem card**
(um link com filete embaixo). O papel aqui é a **moldura da prévia**, que o canvas desenha; o
**conteúdo** dentro dele é a linha do acervo, parte por parte.

⚠️ **A nota 1(a) diz que ler o `Acervo.dc.html` impediu "desenhar a prévia contra o artboard do
formulário".** Isso valeu para o **grifo**. Para a **avulsa** a entrega desenhou contra
`NovaAnotacaoDesktop:94-101` e **nunca comparou** com `Acervo.dc.html:99-106` — o achado mais
caro desta auditoria, porque é a fatia inteira prometendo uma coisa e desenhando outra.

### 23 · A1 · Uma razão falsa num item `[x]` e no `BACKLOG`

A nota 6 dizia que renderizar `dayWithNote` *"exigiria um campo novo no schema de resposta ou
uma segunda requisição — schema e rota, os dois fora de escopo"*.

**Medido:** `planItemResponseSchema` tem mesmo **7** campos ✅ — mas a tela não carrega um
`PlanItemResponse` solto. `book-form.tsx:168` carrega o `bookWithPlanResponseSchema`, que
inclui **`writers`**: `Array<{ planItemId, userIds[] }>`. **`userIds` não vazio É "este dia tem
anotação".** É literalmente o que o `CLAUDE.md` descreve como *"`getBookWithPlan` devolve livro
+ plano + quem já escreveu"*.

⚠️ **Zero schema, zero rota, zero requisição a mais.** ⚠️ **NÃO implementado** — a decisão G diz
que o canvas *descreve* aquele rótulo, e implementá-lo seria emendar a próxima tarefa. O que
mudou foi a **razão**, na nota 6 e no `BACKLOG.md`: a pendência é de **escopo**, não de dado.
A diferença manda a próxima pessoa para lugares opostos — "falta dado" manda abrir um schema,
"falta decisão" manda perguntar ao dono.

### 24 · As sete medições erradas de tamanho médio, uma a uma

| # | afirmação da entrega | medido | onde ficou corrigido |
| --- | --- | --- | --- |
| A3 | decisão B: "8 de 13 queridas, recusa 5, duas estruturais" | **10 de 13, recusa 3, UMA estrutural** — o `authorLabel` não estava entre as queridas (e o M20 existe porque a prévia o renderiza), o comentário não estava entre as recusadas, e o `<li>` era contado **três vezes** (`<li>`, "posição em lista", `key`) | nota 3, e o docblock do `acervo-rows.tsx` |
| A4 | "o mesmo desenho, na mesma ordem" (acervo × prévia do grifo) | **falso**: o acervo tem **sete** elementos e a prévia do canvas **seis** — falta nela o NOME (`Acervo.dc.html:93`, Instrument Serif itálico 15px); recuo **14 × 16**, espaço **9 × 10**, trecho **16 × 15**; a ordem citada é a do `NovoGrifoDesktop` | nota 1(a), e o docblock do `highlight-rail.tsx` |
| M1 | `acervo-rows.tsx:52-53` aponta a prévia para `highlight-fields.tsx` | é o caminho **ABANDONADO** (a própria nota 15, item 1, conta por que ele foi desfeito). O consumidor é `highlight-rail.tsx` | `acervo-rows.tsx` |
| M2 | o docblock do `free-note-fields.tsx` diz **−47** canônicas | **−44**: o bloco que mudou de casa é `e96204f:238-282`, 45 linhas com uma em branco | `free-note-fields.tsx` |
| M3 | `ui-source-scan.test.ts:469-476`: o `highlight-fields.tsx` *"já escrevia"* `rounded-control` | **zero** ocorrências em `e96204f`. A mudança do comentário foi TROCA (saldo 0); o +1 vinha só do arquivo novo. Pela explicação escrita o número seria **10**, e o valor **11** estava certo pelo motivo errado | `ui-source-scan.test.ts` |
| M4 | "zero citações erradas" | **cai**: `pt.ts:1070`/`:1176` são `preview: {`; as `heading:` estão em `:1071`/`:1177`. É o mesmo desvio de uma linha que a nota 1 corrigiu CERTO duas linhas abaixo (no `:831`/`:832`) | nota 1 |
| M5 | "nove tamanhos + três divergências de token" | faltavam **duas**, uma **introduzida**: o filete do card da prévia da avulsa (`border-line` onde três artboards pedem `--border-soft`) e a tinta da contagem de dias (`EditarLivro:73` usa `--text-subtle`, o `Eyebrow` sai `muted`) | nota 11 |
| M6 | "as doze classes" que a fatia escreve | são **treze** — `gap-2.5`, `px-1.5` e `py-0.5` são três, não dois. Conclusão ("nenhuma classe nova") continua certa | nota 13 |
| M7 | `acervo.test.tsx` com **74** testes | **75** — o `it()` do M15 nasceu no mesmo commit, e a contagem citada era a de antes | nota 16 |

⚠️ **O M3 é o pior dos sete e merece o parágrafo**, porque o que envelheceu ali não é o número:
é **o recado que ensina a manter o número**. Uma sonda de contagem com explicação falsa é pior
que uma sem explicação — ela manda a próxima pessoa ajustar o valor pelo raciocínio errado. O
comentário foi reescrito com as duas contas (a de 11, e a de 10 em que a fatia voltou a cair
quando o papel do card passou a ter um dono só).

### 25 · O M15 como descrito era DEGENERADO — corrigida a frase, não a asserção

O `it()` se chamava *"draws the acervo card from the **SAME constant** the preview reads"*, e a
asserção é `expect(card.getAttribute('class')).toBe(ACERVO_CARD_CLASS)`.

**Medido, com o protocolo inteiro:** inlinar no `acervo-rows.tsx` a **mesma string** da
constante (`className="flex rounded-control border border-line bg-surface p-3 w-full flex-col
gap-2"`) → **suíte inteira VERDE, zero acusadores**. A frase promete mais do que a asserção
entrega.

**Mas a asserção não está errada — a frase estava.** O que ela pega é **qualquer DESVIO**, dos
dois lados: **M15b** (o card do acervo com uma classe trocada, `rounded-callout` no lugar de
`rounded-control`) → **1** acusador. E o desvio é o que quebra a promessa: um inline idêntico
não muda pixel nenhum hoje, e o dia em que ele passa a mentir é o dia em que alguém edita um dos
dois lados — e aí o `it()` fica vermelho, que é o trabalho dele.

**Renomeado para `draws the acervo card with EXACTLY the class the preview reads`**, com o
degenerado escrito no docblock para ninguém "consertar" a asserção achando que ela é fraca.

### 26 · Os três achados de detalhe

1. **`WCAG 2.1 3.2.2` não é o critério de contraste.** É **1.4.11** (contraste de não-texto,
   mínimo 3:1); `3.2.2` é "On Input". Neste repositório o número circula como apelido da
   **fórmula** de luminância relativa, e a fórmula não é o critério. ⚠️ O acusador da decisão F
   escrevia `1.4.11` **certo na asserção e errado no cabeçalho** — a pior das duas metades para
   quem lê só o topo. Corrigido na nota 5 e no docblock do acusador.

   ⚠️ **Medido antes de sair corrigindo o repositório inteiro: a 47a NÃO tem o erro.**
   `47a:618` escreve *"o filete de caneta reprova a WCAG 1.4.11"* — o critério, certo — e
   `47a:622` escreve *"Fórmula WCAG 2.1 3.2.2"*, rotulando o número como a FÓRMULA. As
   outras dez citações do repositório (`grifo-text.tsx`, `presence-mark.tsx`,
   `avatar-contrast.test.ts`, `eyebrow.test.tsx`, `theme-tokens.test.ts`, `41a`) também
   dizem "fórmula" ou "luminância relativa". **O erro é só da 47b**, que herdou o número e
   perdeu o rótulo — que é como um apelido vira uma afirmação falsa.
2. **`theme.css:446-457`** → a escala vai até **458** (`--size-title: 25px`). Corrigido na
   nota 11.
3. **O `BACKLOG` dizia "as 12 citações"** e a tabela da nota 1 tem **18** linhas. Corrigido.

### 27 · A tabela de mutação da rodada de correção — os DOIS eixos

Protocolo em cada um: `md5sum` + `cp -p` → `.mjs` **ancorado, com âncora e substituto em
ARQUIVO** (estoura se a âncora não aparecer exatamente 1 vez **e** se âncora = substituto) →
**`grep` de confirmação** → `pnpm --filter @clube/app test` → contar e **nomear** → `cp -p` de
volta → `md5sum -c` **e** `cmp` por conteúdo. **Os 11 restauraram idênticos.** ⚠️ E a guarda de
"âncora = substituto" **mordeu de verdade** uma vez, numa edição de prosa em que eu colei o mesmo
bloco dos dois lados — ela é o que impede um mutante degenerado de entrar na tabela como medição.

**Eixo A — "a prévia mostra o que o formulário tem?" (conteúdo)**

| # | mutante | arquivo | antes | depois | quem acusou |
| --- | --- | --- | --- | --- | --- |
| M20b | ⚠️ **BLOQUEADOR** — a margem da CORREÇÃO do grifo congela num rascunho vazio | `highlight-form` | **0** | **1** | `⚠️ follows the keystroke on the CORRECTION screen too` |
| M21 | ⚠️ **BLOQUEADOR** — a CORREÇÃO da avulsa ignora a referência para sempre | `free-note` | **0** | **1** | `⚠️ follows the REFERENCE on the CORRECTION screen too` |
| M24 | a prévia perde a palavra "Avulsa" **quando há referência** | `free-note-fields` | **0** | **2** | `says WHERE the note lands` |
| M27 | a prévia da avulsa perde o AUTOR | `free-note-fields` | — | **1** | `⚠️ signs the preview with ME` |

**Eixo B — "a pintura existe? onde? de quem é?" (forma)**

| # | mutante | arquivo | antes | depois | quem acusou |
| --- | --- | --- | --- | --- | --- |
| M22 | o avatar da prévia da avulsa deixa de ser o de `me` | `free-note-fields` | **0** | **1** | `⚠️ signs the preview with ME` |
| M22b | idem na prévia do grifo, com o rótulo ainda dizendo "Você" | `highlight-rail` | **0** | **1** | idem, do outro arquivo |
| M23 | os dois atalhos TROCAM de descrição | `free-note-fields` | **0** | **1** | `… — PAIRED` |
| M25 | a barra de canetas vira `'footer'` (perde o celular) | `free-note` | — | **2** | `asks for the FIXED bar` |
| M25b | a barra aparece na anotação de OUTRA pessoa | `free-note` | — | **1** | `…and NEVER when reading` |
| M26 | a terceira linha de atalho some | `free-note-fields` | — | **1** | `… — PAIRED` |
| M28 | a prévia da avulsa repinta o papel à mão (com desvio) | `free-note-fields` | — | **1** | `⚠️ wears the ACERVO'S paper` |
| M15b | o card do ACERVO desvia da constante compartilhada | `acervo-rows` | — | **1** | `draws the acervo card with EXACTLY the class…` |

**Degenerado, medido e NÃO contado como medição:** o inline **idêntico** do
`ACERVO_CARD_CLASS` no `acervo-rows.tsx` → **zero acusadores, suíte verde**. Está na nota 25 e
no docblock do `it()`, porque um mutante que não muda comportamento nenhum não mede cobertura —
ele mede a própria tautologia.

⚠️ **Sobre o "vermelho colado", com a mesma honestidade da nota 9.** Nesta rodada houve **dois**
tipos de vermelho, e eles não valem a mesma coisa:

- **Vermelho de TDD de verdade (4):** `⚠️ signs the preview with ME` nas duas telas, `… —
  PAIRED` e os dois `it()` da barra de canetas nasceram **vermelhos contra a implementação**,
  porque o comportamento que eles pedem (o autor, a terceira linha, a barra) não existia. Colado
  acima: 4 falhas na primeira execução, antes de uma linha de produção.
- **Vermelho de MUTANTE (o resto):** os dois bloqueadores e o `⚠️ wears the ACERVO'S paper`
  guardam comportamento que já estava certo — o vermelho deles é o do mutante, medido com o
  protocolo inteiro antes e depois. É a mesma distinção que a nota 17 da 47a e a nota 9 desta
  registraram, e ela continua sendo a diferença entre "eu escrevi a guarda primeiro" e "eu provei
  que a guarda morde".

### 28 · O que eu tentei e não deu certo

1. **Deixar a barra de canetas passar SEMPRE, inclusive em leitura**, apoiado no contrato do
   `RichEditor` (`active = editable && placement !== 'none'`, que a torna inerte). Funciona e
   tem um dono só — mas o dublê do editor não vê o contrato do `packages/ui`, então o app
   ficaria **sem asserção nenhuma** sobre "a anotação alheia não ganha caneta", que é uma regra
   de AUTORIA e não um detalhe de renderização. Trocado por `editable === false ? 'none' :
   'fixed'`: a tela diz onde a barra fica, e na tela de leitura a resposta é "em lugar nenhum".
   Custou um acusador a mais (M25b) e vale.
2. ~~**Apagar a referência da prévia da avulsa**~~ — eu desfiz e devolvi a escolha ao dono,
   argumentando que apagar da prévia um dado recém-digitado trocaria uma promessa imprecisa
   por uma tela que esconde o que ela mesma pediu. ⚠️ **O dono decidiu apagar, e ele está
   certo pelo argumento que eu não pesei: a referência NÃO some do produto, some da PRÉVIA**
   — ela continua no formulário, continua sendo salva e continua aparecendo na tela de
   leitura. Eu tinha confundido "a prévia não mostra" com "o produto perde". **Feito na
   nota 31.**
3. **Provar o M15 com um inline idêntico.** Zero acusadores, e a suíte estava certa: o mutante é
   que era degenerado. Refeito com **desvio** (nota 25).
4. **Usar `Marcos` (o `me` padrão do harness) na asserção do avatar.** Fraco de propósito
   escondido: `Maria`, a outra pessoa dos fixtures, também começa com **M** — um mutante que
   trocasse `me` pela autora da nota passaria. Trocado por um `meReply({ name: 'Zilda' })` local.
5. **Editar a prosa do `pt.ts` com `sed`.** Não tentei duas vezes: prosa deste repositório vai
   por `.mjs` ancorado, e a guarda de "âncora ≠ substituto" já pagou por si (nota 27).

### 29 · Gates da rodada de correção — antes e depois

| | entrega 47b | correção | Δ |
| --- | --- | --- | --- |
| `pnpm -r test` shared | 607 | **607** | = |
| ui | 305 | **305** | = |
| backend | 1994 | **1994** | = |
| app | 999 | **1006** | **+7** |
| chunk de entrada | 444.231 B | **444.507 B** | **+276** |
| folga até 450.000 | 5.769 | **5.493** | −276 |
| CSS | 36.804 B | **36.804 B** | **= (zero)** |
| `book-form` | 10.244 | **10.244** | = |
| editor | 449.522 | **449.522** | = |
| `index.html` | 1.638 | **1.638** | = |
| precache | 27 | **27** | = |

**+276 B**, muito abaixo do limite de ~1.200 que mandaria parar. Sobram **5.493 B** para a 48.

⚠️ **O CSS não mexeu um byte, e eu confirmei de duas formas**, porque desta vez não havia como
comparar com o artefato de entrada (restaurar por `git` é proibido aqui): **(a)** o `dist/`
reconstruído depois de TODA a prosa saiu com **o mesmo nome de arquivo com hash de conteúdo**
(`index-C2qIJo1L.css`) do build anterior às notas — hash de conteúdo igual é identidade, não
coincidência; **(b)** cada classe que a prosa nova cita foi conferida no CSS construído com
`grep -F "<seletor>{"`: `.fixed`, `.gap-3`, `.flex-col`, `.border-line`, `.rounded-control`,
`.text-sm`, `.text-muted`, `.bg-surface`, `.p-3` → **1 cada** (já emitidas); `.footer`,
`.none`, `.static` → **0** (não são utilitários, e nada as emitiu).

**Contador canônico** (`acervo.tsx`, nunca `wc -l`):

| arquivo | entrada 47b | saída 47b | correção |
| --- | --- | --- | --- |
| `free-note.tsx` | 602 | 568 | **570** (+2, a barra de canetas) |
| `free-note-fields.tsx` | — | 99 | **109** (+10: autor, terceira linha, papel) |
| `highlight-form.tsx` | 427 | 407 | **407** |
| `highlight-fields.tsx` | 309 | 337 | **337** |
| `highlight-rail.tsx` | — | 63 | **63** |
| `acervo-rows.tsx` | 88 | 92 | **93** (+1, o `ACERVO_PAPER_CLASS`) |
| `plan-editor.tsx` | 239 | 247 | **247** |
| `book-form.tsx` | 456 | 456 | **456** |

`pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` · `pnpm --filter @clube/app build`:
**todos verdes**. `schema.prisma` segue `968c9986f7a2dfb4ccbd738b13d44715`. **Nenhuma migration,
endpoint ou schema.**

### 30 · Varredura de invisíveis, refeita

`scratchpad/t47bfix/invisiveis.mjs`: 22 code points montados **por número**
(`String.fromCodePoint`), nenhum glifo colado no script. ⚠️ **O par positivo vem antes da
varredura e o script ESTOURA se ele falhar**: num texto plantado com `U+200B` e `U+00A0` ele tem
de acusar **2 de 2** — acusou. Nos **dezesseis** arquivos tocados (os 13 do diff, os 2 novos e
esta spec): **zero invisíveis**.

### 31 · DECISÃO DO DONO (2026-09-24): a prévia da avulsa para de mostrar a referência

A nota 22 deixou a escolha em aberto — *"ou o acervo ganha a referência, ou a prévia a perde"*.
**O dono escolheu a segunda**, e é a que torna a promessa impressa na margem literalmente
verdadeira: a prévia mostra **exatamente** o que o acervo mostra.

**A medição que decide, refeita antes de mexer:** `grep -n reference acervo.tsx
acervo-entries.ts` → **zero ocorrências**. O acervo não desenha a referência de uma anotação em
estado nenhum.

**A alternativa recusada, registrada para ninguém refazer a conta:** o **acervo** passar a
mostrar a referência. Fecha a diferença pelo outro lado e é defensável de desenho — mas mexe
numa tela **já entregue e auditada** (a 46) e custa bytes num orçamento com ~5,5 KB de folga e a
Tarefa 48 ainda por vir. Está escrito no docblock do `FreeNoteRail`, não só aqui.

⚠️ **E eu estava errado na nota 28, item 2.** Eu argumentei que apagar da prévia um dado
recém-digitado *"troca uma promessa imprecisa por uma tela que esconde o que ela mesma pediu"*.
O argumento não se sustenta: **a referência não some do produto, some da PRÉVIA.** Ela continua
no formulário, continua sendo salva (`POST` e `PATCH`) e continua aparecendo na tela de leitura
da anotação. Eu tinha confundido as duas coisas.

**O que mudou no código:**

| | antes | depois |
| --- | --- | --- |
| `FreeNoteRailProps` | tinha `reference: string` | ⚠️ **não tem a prop** |
| `free-note.tsx:358` e `:904` | passavam `reference={reference}` | não passam |
| a linha do tipo | o tipo **mais** a referência, com separador | `{kind}`, e nada mais |

⚠️ **A AUSÊNCIA É POR CONSTRUÇÃO, e isso é mais forte que uma guarda:** a margem não pode
mostrar a referência porque **não a recebe**. Uma reintrodução não é um erro de digitação de uma
linha — ela exige a prop, o render e os dois `call sites`, que é exatamente o tamanho de uma
decisão deliberada. O comentário no lugar da prop diz isso, para ninguém "consertar" a assinatura
achando que faltou um campo.

**Mas a ausência também se guarda, que é o pedido** (a forma da 44b e da 46) — e dos **dois**
lados, pelo motivo do M2:

| `it()` | rota | o que prova |
| --- | --- | --- |
| `⚠️ does NOT show the reference — the acervo does not show it either` | criar | a referência **digitada** não chega à prévia |
| `⚠️ hides the LOADED reference too, on the correction screen` | corrigir | a referência **carregada do servidor** também não |

⚠️ **As duas metades positivas vêm primeiro (§7.3), senão isto é asserção vazia:** o campo tem o
valor escrito (lido por `valueOf`, com `instanceof` e `throw` — nunca `as`), e o `POST` de
criação **leva** `reference: 'p. 112'` no corpo. Sem elas, uma tela que simplesmente **perdeu o
campo** passaria em todas as negativas — e seria um defeito bem pior que o que se está
consertando.

⚠️ **E a ordem dentro do `it()` tem motivo:** as asserções da prévia vêm **antes** do botão de
criar, porque criar **navega** (regra 16 da Tarefa 19) e depois dele não há mais formulário nem
margem para olhar. A primeira versão pôs o `POST` no meio e ficou vermelha com
`Unable to find [data-testid="note-preview"]` — o vermelho certo, pelo motivo certo.

**Vermelho colado:** os dois `it()` nasceram **vermelhos contra a implementação** (2 falhas, 44
passando) antes de uma linha de produção mudar. Este é TDD de verdade, não vermelho de mutante.

**Mutação, protocolo inteiro (`md5sum` + `cp -p` → `.mjs` ancorado → `grep` → suíte → `cp -p`
de volta → `md5sum -c` **e** `cmp`):

| # | mutante | arquivos | acusadores |
| --- | --- | --- | --- |
| **M29** | ⚠️ **a referência VOLTA para a prévia** — o código da entrega restaurado verbatim (prop + `trimmed` + render + os dois `call sites`) | `free-note-fields` + `free-note` | **2** — um por rota |
| M24b | a palavra do acervo some da prévia (`{kind}` → `{''}`) | `free-note-fields` | **3** |

⚠️ **O M29 é multi-arquivo de propósito, e eu declaro isso em vez de fingir que é de uma
linha:** com a prop removida não **existe** mutante de uma linha que reintroduza a referência —
e essa é a propriedade que se ganhou, não uma limitação da medição. O mutante mede o que
importa: **a reintrodução realista, do tamanho que ela teria de verdade**, acusa.

**Os dois mutantes que o dono mandou reconferir, medidos e NÃO assumidos:**

- **M24** (`\`${kind} · ${trimmed}\`` → `trimmed`) **deixou de existir**: a expressão que ele
  mutava não está mais no arquivo. Ele provava *"a palavra 'Avulsa' sobrevive quando há
  referência"*, e **não há mais estado "com referência" na prévia** — a propriedade mudou de
  significado junto com a tela. O que o substitui é o **M24b**, que prova a mesma coisa que
  restou (a palavra do acervo está lá), com **3** acusadores.
- **M27** (o autor) e **M22** (o avatar) **não mudaram de significado, e eu medi em vez de
  assumir**: o `it()` deles (`⚠️ signs the preview with ME`) roda em `freeNoteNewPath` e nunca
  tocou na referência. Remedidos com o protocolo inteiro depois da mudança: **1 acusador cada,
  o mesmo `it()` de antes.**

**Gates:** shared **607** · ui **305** · backend **1994** · app **1006 → 1007** (+1: dois `it()`
de ausência no lugar de um de conteúdo). `typecheck` · `lint` · `prettier` · `build` verdes.

⚠️ **E ISTO ENCOLHEU O PACOTE, como tinha de encolher:** entrada **444.507 → 444.436 B**
(**−71**), folga **5.493 → 5.564**. CSS **36.804 B**, com o mesmo nome de arquivo com hash de
conteúdo (`index-C2qIJo1L.css`) — zero byte. `book-form` 10.244, editor 449.522, `index.html`
1.638, precache 27, todos iguais. Contador canônico: `free-note-fields.tsx` **109 → 102**;
`free-note.tsx` segue **570**. `schema.prisma` segue `968c9986f7a2dfb4ccbd738b13d44715`.
