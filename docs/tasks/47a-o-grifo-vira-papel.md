# Tarefa 47a — O grifo vira o próprio papel grifado

> **Décima primeira fatia do MVP 3.5.** A Tarefa 47 do plano encostaria em **cinco** arquivos
> — três deles já acima do teto de 400 (`free-note.tsx` **602**, o maior do app;
> `book-form.tsx` ~~**494**~~ **456** (nota 16); `highlight-form.tsx` **427**) — sobre **oito** artboards, com
> **10.392 B** de folga para ela e a 48. **Dividida em duas**, como a 44 foi: esta é o grifo;
> a **47b** é a anotação avulsa e o novo/editar livro.
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** e a entrada
> **47a** · `docs/tasks/41b-*.md` (o `GrifoText`) · ⚠️ **`docs/tasks/46-*.md`, as notas da
> rodada de correção** — a lição "prosa custa CSS" nasceu lá e vale aqui ·
> `docs/CONVENCOES-CODIGO.md` §7.1, §7.3, §7.4, §7.9, §7.10.

---

## ⚠️ A decisão que esta fatia NÃO pode tocar

**Os cinco hexes do grifo são DADO PERSISTIDO.** `HIGHLIGHT_COLORS` (`packages/shared/src/highlight-color.ts`) é coluna (`Highlight.color`), filtro de rota (`?color=%23facc15`) e índice (`@@index([bookId, color])`). O canvas define como a cor é **pintada** (`--pen-a`…`--pen-r` + `-dot`), **nunca** o que é **guardado**. É a decisão E do plano da Fase A.

⚠️ **Se algo nesta fatia parecer exigir mudar um hex, PARE e pergunte.**

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | ⚠️⚠️ **O campo do trecho VIRA o papel grifado, e ele repinta ao trocar de caneta** | `NovoGrifo.dc.html:51` — `background: var(--pen-a)`, `border: 1px solid var(--pen-a-dot)`, `border-radius: 3px`, `padding: 18px 18px 18px 34px`, `min-height: 150px`. É o coração da fatia |
| **B** | **A aspa serifada pendurada** | `:52` — `position:absolute; left:10px; top:8px`, Instrument Serif **40px**, `line-height:1`, cor `--pen-a-dot`. ⚠️ É o **caractere** `“`, não `<svg>` (`adr-0002-iconography.test.ts`) — e ele é **decoração**: o texto ao lado já diz tudo |
| **C** | **O texto do trecho em Fraunces 17px** | `:53` — `line-height:1.6`, `color: var(--text)`, `height:114px`. ⚠️ **17px NÃO está na escala** (`9.5 · 10 · 11 · 14 · 15 · 17.5 · 25`, `theme.css:447-458`). **Case e declare** — `--size-reading` é 17,5px, e a 43 já mediu que 17,5 **é** o degrau |
| **D** | ⚠️ **O rótulo do campo é `--gold`; a legenda das canetas é `--text-muted`** | `:48` × `:58`. **São cores diferentes de propósito** e é fácil uniformizar sem perceber: o rótulo dourado marca **o campo que é o papel**. Se você uniformizar, o desenho perde o que o distingue |
| **E** | **As cinco canetas: pílulas de 44px** | `:59-65`. Selecionada: `background: var(--pen-a)` + `border: 1.5px solid var(--gold)`. Não selecionada: `background:none` + `border: 1px solid var(--border)` |
| **F** | ⚠️ **A borda dourada da selecionada vale para TODA caneta — e isso é escolha, porque o canvas nunca desenha outra** | Medido: `NovoGrifo` e `CorrigirGrifo` desenham **só a caneta A** selecionada, e `--pen-a-dot` (`#c89a44`) ≠ `--gold` (`#946d2c`), então não é coincidência de valor. `--gold` é a cor de **"atual/escolhido"** em todo o resto do desenho (o papel de hoje, o selo da corrente, o filete do dia). ⚠️ **MEÇA O CONTRASTE** da borda dourada sobre os cinco fundos de caneta, nos dois temas. Se algum falhar, **pare e pergunte** — não troque a cor por conta própria |
| **G** | **O `GrifoText` já tem consumidor, e aqui ele ganha um de natureza diferente** | `margin-highlight.tsx:102` o usa **somente-leitura** desde a 44b. Aqui o papel é **editável**. ⚠️ **Meça se dá para reusar o componente ou se o editável é outra coisa** — e **diga por medição** qual escolheu |
| **H** | **O "Rascunho guardado" é o `SaveIndicator`** | `NovoGrifo.dc.html:96`. Ele nasceu na 41b e já tem consumidor na tela do dia |
| **I** | ⚠️ **Só `highlight-form.tsx` e `highlight-fields.tsx`** | `free-note.tsx`, `book-form.tsx` e `plan-editor.tsx` são da **47b**. **Prove por `git diff --name-only`** |
| **J** | **Nenhuma migration, endpoint ou schema.** Nenhuma chave nova sem me dizer qual | É fatia de tela |

---

## As medidas, e de onde tirá-las

⚠️ **Escreva o script que imprime a linha citada ANTES da primeira citação.** Nesta série ele
já pegou cinco citações erradas na 42, cinco mais um botão escondido na 43, um erro meu de
bytes na 44c, **quatro** erros meus na 45 e **quatro** na 46. Conferi as de baixo uma a uma —
**confira de novo, e declare TODAS as que achar**.

| peça | onde |
| --- | --- |
| o bloco inteiro | `NovoGrifo.dc.html:46-55` |
| o rótulo dourado + a dica | `:48`, `:49` (11,5px, `--text-muted`) |
| o papel | `:51` |
| a aspa | `:52` |
| o texto | `:53` |
| a legenda das canetas | `:58` |
| as cinco pílulas | `:59-65` (selecionada em `:60`) |
| o indicador de rascunho | `:96` |
| a tela de correção | ~~`CorrigirGrifo.dc.html:50-63`~~ ~~`:48-64`~~ **`:48-65`** — mesma estrutura, ⚠️ **tinta do rótulo DIFERENTE** (nota 2), e o intervalo corrigido ainda estava um byte curto (nota 24) |
| o `GrifoText` de hoje | `packages/app/src/pages/margin-highlight.tsx:102` |

⚠️ **`3px` é `--r-2`** e `1.5px` de borda não está em token nenhum. **Case tudo e declare o
que não bater** — não aproxime em silêncio.

⚠️⚠️ **PROSA CUSTA CSS NESTE PROJETO.** A rodada de correção da 46 mediu: o scanner do
Tailwind v4 lê o **texto bruto** do arquivo, **comentário incluído** — citar uma classe ou um
valor arbitrário na forma nua dentro de um docblock **emite o seletor** e engorda o CSS (24 B
por um seletor, medido em build pareado). **Escreva os valores de forma que não casem o
scanner**, e confira o CSS antes/depois.

---

## As regras

1. **TDD estrito**, e vale para `packages/app`. **Vermelho colado** para cada guarda nova.

2. ⚠️⚠️ **A decisão A com o mutante que é a razão da fatia: o papel repinta.**
   **Mutante obrigatório:** fixe a caneta em `a` (fundo **e** borda **e** aspa) → tem de ficar
   **vermelho** com um grifo de outra cor. ⚠️ É o mesmo mutante que a 44b exigiu para o bloco
   "Último grifo", e lá ele pegou. **Aqui vale para os TRÊS elementos** — fundo, borda e aspa.

3. ⚠️ **A decisão D com acusador.** **Mutante:** o rótulo do campo vira `--text-muted`, igual
   à legenda → acusa. **E o inverso:** a legenda vira `--gold` → acusa.

4. ⚠️ **A decisão E com o alvo de 44px.** É regra do projeto (§A.3 do briefing: 44px mínimo
   com foco sempre visível). **Mutante:** a pílula encolhe abaixo de 44 → acusa.
   ⚠️ **E a caneta selecionada tem de ser distinguível SEM COR** — é a mesma regra que o
   `PresenceMark` cumpre na 44 e o `StreakSeal` na 45. A borda de **1,5px × 1px** é a
   diferença de forma; **guarde-a**.

5. ⚠️ **A decisão F com a medição de contraste.** Meça a borda `--gold` sobre os cinco fundos
   de caneta, **nos dois temas**, e **escreva os dez números**. Se algum falhar o mínimo,
   **pare e pergunte**.

6. ⚠️ **Os cinco hexes NÃO mudam.** **Mutante:** troque um hex de `HIGHLIGHT_COLORS` → o
   teste de `packages/shared` tem de acusar. É dado persistido.

7. ⚠️ **A varredura anti-culpa em TODOS os estados das duas telas** (novo e correção),
   incluindo erro de validação e o estado de arquivar. ⚠️ **Leia
   `packages/app/src/pages/__tests__/anti-guilt-dom.ts` antes de escolher a variante** — as
   duas são mutuamente exclusivas desde a rodada de correção da 44, e **não se copia de teste
   antigo**.

8. ⚠️ **Guarda de visibilidade por TOKEN, não por regex:**
   `node.className.split(/\s+/u).some((c) => c.split(':').at(-1) === 'hidden')`. A 45 mediu
   que a regex de fronteira acerta **6 de 13** variantes, e a 46 achou a mesma forma frágil
   copiada para outra tela.

9. ⚠️ **Par guardado dos DOIS lados.** Este bloco já pagou **cinco** vezes por metade de par.

10. **Tamanho pelo contador canônico** (`acervo.tsx:115-126`), **nunca `wc -l`**. Hoje:
    `highlight-form.tsx` **427** · `highlight-fields.tsx` **189**.
    ⚠️ **O `highlight-form.tsx` já está 27 acima do teto de 400.** Esta fatia **não pode
    engordá-lo**. Se crescer, corte por assunto e **diga por medição o que saiu e para onde**
    — ⚠️ **e registre o efeito no arquivo que RECEBER**, que é a lição da 46: um teto que vale
    para um arquivo só é um teto que anda de lado.

11. **O orçamento, colado antes e depois.** Entrada em **439.608 B** contra o teto de
    **450.000** — folga **10.392 B**, e ainda faltam a **47b** e a **48**. ⚠️ **Se esta fatia
    comer mais de ~3.000 B, diga.**

12. **Varredura de caracteres invisíveis** nos arquivos do diff, **provando antes que morde**,
    com os code points montados **por número**.

---

## Definição de pronto

- [x] O campo do trecho é o papel grifado, e **repinta nos três elementos** ao trocar de
      caneta, com o mutante da regra 2 vermelho. _(M1, M2, M3, M4 e M14 — 2 a 3 acusadores
      cada, e cada um dos três elementos tem mutante próprio.)_
- [x] A aspa serifada pendurada, como **caractere**, decorativa. _(M11 e M12.)_
- [x] O rótulo dourado e a legenda neutra, **com acusador nos dois sentidos**. _(M5 e M6.)_
      ⚠️ **O dourado é `--gold-strong` e não `--gold`** — nota 3.
- [x] As cinco pílulas de **44px**, com a selecionada distinguível **sem cor**. _(M7 e M8.)_
- [x] Os **dez números de contraste** da borda dourada escritos — nota 5. Nenhum reprova.
- [x] `HIGHLIGHT_COLORS` intocado, provado por mutante. _(M13: 17 acusadores em
      `packages/shared`.)_
- [x] Varredura anti-culpa verde em **todos** os estados das duas telas — nota 8.
      ⚠️ **O "estado de arquivar" não existe nestas telas** (nota 9).
- [x] `free-note.tsx`, `book-form.tsx` e `plan-editor.tsx` **intocados**, provado por
      `git diff --name-only 4f99fbe` (quatro arquivos, nenhum deles).
- [x] Nenhuma migration, endpoint, schema ou chave nova. `schema.prisma` segue
      `968c9986f7a2dfb4ccbd738b13d44715`.
- [x] As divergências declaradas — notas 1 a 16, **mais as quatro que faltavam e as
      correções da rodada, notas 17 a 29**. Além dos **17px**: os **40px** da aspa, o
      **1,5px** da borda, os **13px** da pílula, o dourado que teve de virar `--gold-strong`
      (nota 3), o rótulo da tela de correção (nota 2), o "arquivar" que não existe (nota 9), a
      decisão H em aberto (nota 11) e o `book-form.tsx` **456 ≠ 494** (nota 16).
- [x] Gates colados antes e depois, com bytes, folga e os contadores canônicos — nota 13.
      ⚠️ CSS conferido antes/depois, com a atribuição seletor a seletor: **nenhum byte veio
      de prosa** (nota 11).
- [x] Varredura de invisíveis, com a prova de que morde — nota 12.

---

## Notas de reconciliação

_O executor anexa aqui o que mediu e divergiu da spec. Numere de 1 em diante. Se um número ou
uma citação desta spec estiver errado, **corrija-o aqui e no `BACKLOG.md`**, dizendo como
mediu — e **declare TODOS**._

---

### 1 · As dez citações da spec, conferidas uma a uma — **nove exatas, uma imprecisa**

O script que imprime a linha citada foi escrito **antes** da primeira citação
(`scratchpad/t47a/cite.mjs`: lê o arquivo, imprime `nnnn | <linha>`, e escreve
`<<FORA DO ARQUIVO>>` quando o número passa do fim — foi assim que o intervalo do
`CorrigirGrifo` se revelou ser sobre um arquivo de 105 linhas, não de 111).

| peça | spec | medido | veredito |
| --- | --- | --- | --- |
| o bloco inteiro | `NovoGrifo:46-55` | `<div gap:10px>` … `</div>` | ✅ |
| rótulo + dica | `:48`, `:49` | `--gold` 10px · 11,5px `--text-muted` | ✅ |
| o papel | `:51` | `--pen-a` · 1px `--pen-a-dot` · raio 3px · `18px 18px 18px 34px` · mín. 150px | ✅ |
| a aspa | `:52` | `left:10px top:8px` · Instrument Serif 40px · `line-height:1` · `--pen-a-dot` | ✅ |
| o texto | `:53` | Fraunces 17px · 1,6 · `--text` · 114px | ✅ |
| legenda das canetas | `:58` | `--text-muted` 10px | ✅ |
| as cinco pílulas | `:59-65` (sel. em `:60`) | `:59` é o `<div flex-wrap>`, `:60-64` são as cinco, `:65` fecha | ✅ |
| indicador de rascunho | `:96` | "Rascunho guardado", mono 9,5px `--text-subtle` | ✅ |
| a correção | `CorrigirGrifo:50-63` | papel `:50`, aspa `:51`, texto `:52`, pílulas `:59-63` | ⚠️ **imprecisa** |
| o `GrifoText` de hoje | `margin-highlight.tsx:102` | `<GrifoText pen={COLOR_PEN_KEYS[color]}>` | ✅ |

⚠️ **A imprecisão, e ela não é cosmética.** O intervalo `CorrigirGrifo.dc.html:50-63` cobre
o papel e as pílulas, mas **começa depois do rótulo do campo**, que está em `:49` — e é
justamente ali que os dois artboards **discordam**. Ver a nota 2.

### 2 · ⚠️ A decisão D **só vale no `NovoGrifo`**: na tela de correção o rótulo do trecho é NEUTRO

Medido linha a linha:

- `NovoGrifo.dc.html:48` — `<label for="trecho">` em `--gold`, **10px**, com a dica ao lado;
- `CorrigirGrifo.dc.html:49` — `<label for="trecho">` em **`--text-muted`, 9,5px**, sem dica;
  e o dourado daquela tela está em `:46`, num **rótulo de tela** ("Corrigir o grifo") que o
  `NovoGrifo` não tem (lá o mesmo papel é feito pelo `<h1>` da barra de contexto).

A spec afirma a decisão D sem qualificar a tela, e a tabela de medidas manda ler a correção
como "**mesma estrutura**". Estrutura sim; **tinta do rótulo, não**.

**O que foi entregue, e por quê:** os dois modos dividem **um** componente (`HighlightFields`),
que é a divisão que a Tarefa 25 fez de propósito, e o rótulo dourado entra nos **dois**. O
argumento é o da própria decisão D — *"o rótulo dourado marca o campo que é o papel"* —, e
ele não muda de valor entre registrar e corrigir: o campo é o mesmo campo. Partir o
componente em dois para pintar um rótulo de duas cores seria pagar uma divisão inteira por
meio pixel de tinta. **Se o dono quiser a fidelidade literal ao `CorrigirGrifo`, isso é uma
prop de tom no `QuoteField` e uma linha em cada chamador — digo e faço.**

### 3 · ⚠️⚠️ O dourado do rótulo é `--gold-strong`, **não** o `--gold` que o canvas escreve — e quem mandou foi uma guarda que já existia

A decisão D cita `NovoGrifo.dc.html:48`, que é `color:var(--gold)`. Escrito assim, o teste
`__tests__/theme-tokens.test.ts › ⚠️ refuses the FIRST USE of text-gold, and says where to go
instead` ficou **vermelho na hora** — ele nasceu na auditoria da Tarefa 41b exatamente para
isto, e nomeia **este** artboard no docblock dele.

A conta (WCAG 2.1 3.2.2, tema claro, contra as três superfícies):

| tinta | vs `--bg` | vs `--surface` | vs `--surface-2` |
| --- | --- | --- | --- |
| `--gold` `#946d2c` | **4,16** | **4,31** | **3,97** |
| `--gold-strong` `#785822` | 5,79 | 6,00 | 5,53 |

O rótulo tem 10px, então o piso é 4,5:1 — `--gold` reprova nas três. A saída que a guarda
manda tomar é `text-gold-strong`, e ela **não é invenção**: é a tinta que o próprio canvas
usa quando o dourado carrega texto (`Inicio.dc.html:99`, `Livro.dc.html:146`).

**Consequência boa:** em vez de escrever as classes à mão, a tela passou a usar o
`Eyebrow` de `@clube/ui` — cujo docblock já nomeava **"Trecho grifado"** como o exemplo do
tom dourado. A decisão D virou `tone="gold"` × `tone` ausente, que é mais difícil de
uniformizar por descuido do que duas listas de classes.

### 4 · ⚠️ A aspa sem caneta: `text-subtle`, **não** `text-faint`

O canvas não desenha o estado "ainda sem caneta" (nota 6). A primeira versão pintou a aspa
neutra com o cinza mais claro, e `theme-tokens.test.ts › refuses the FIRST USE of text-faint
while it fails contrast` ficou vermelho: `--text-faint` dá **2,45:1** no claro e **2,58:1**
no escuro, contra 4,5:1 de piso. A aspa é decorativa e o piso de texto não a alcançaria —
mas aquela guarda é de **uso do utilitário**, não de papel semântico, e contorná-la com uma
isenção abriria a porta que ela existe para manter fechada. Ficou `text-subtle`.

### 5 · Os dez números de contraste da borda dourada — **nenhum reprova**

WCAG 2.1 3.2.2, `--gold` sobre o fundo de cada caneta (é a borda **dentro** da pílula
selecionada). Piso aplicável: **3:1** (WCAG 1.4.11, componente não textual).

| caneta | tema claro | tema escuro |
| --- | --- | --- |
| a · amarelo | **3,62:1** | **4,18:1** |
| v · verde | **3,58:1** | **4,93:1** |
| l · laranja | **3,56:1** | **5,27:1** |
| z · azul | **3,51:1** | **5,25:1** |
| r · rosa | **3,52:1** | **5,35:1** |

E o outro lado da mesma borda, que a spec não pediu e que decide se ela se vê **de fora**:
`--gold` contra a página dá **4,16:1** no claro e **6,90:1** no escuro. Passa.

⚠️ **UM NÚMERO DE RISCO, MEDIDO E NÃO CONSERTADO — é da Tarefa 48.** O filete do **papel**
(`--pen-x-dot` sobre a página) dá, no tema claro: **2,28** (amarelo) · 3,46 (verde) · 4,18
(laranja) · 4,59 (azul) · 4,56 (rosa). O amarelo fica abaixo de 3:1, e o fundo do papel
contra a página é ainda mais fraco (1,15 a 1,18 no claro). Ou seja: **no tema claro, com a
caneta amarela, a fronteira do campo de texto quase não se vê.** Não mexi: os cinco hexes
são dado persistido e os `--pen-*` são valor de canvas; e a Tarefa 48 é literalmente
*"varredura de contraste nos dois temas com foco nos pontos de risco (… e os fundos de
grifo)"*. **Fica registrado aqui para ela não ter de descobrir de novo.**

Para fechar o quadro, a tinta do trecho sobre o papel (o que se lê de fato) passa com folga:
**12,84 a 12,44:1** no claro e **8,44 a 10,81:1** no escuro — os mesmos números que o
docblock do `GrifoText` já carregava, reconferidos com `--text` escuro `#e8e4d6`.

### 6 · O estado que o canvas não desenha: o papel **antes** de haver caneta

Os dois artboards mostram a tela já com a caneta amarela escolhida. Mas o registro **começa
sem cor** — ela é obrigatória (regra 13 da Tarefa 25) e o `NewHighlight` nasce com
`color = null`. Pintar de amarelo quem não escolheu amarelo mentiria sobre o que vai ser
gravado, e é a mesma classe de defeito do `aria-invalid="false"` num campo intocado. Sem
caneta: `bg-surface` + `border-line`, e a aspa em `text-subtle`. Guardado pelo teste
`leaves the paper NEUTRAL while no pen has been chosen` e pelo mutante **M9**.

### 7 · ⚠️ A decisão G, medida: o `GrifoText` **não** serve, e a pílula **não** é um `FilterChip`

**O `GrifoText`** (decisão G pede a medição): é um `<span>` **em linha**, com auréola de 2px
(anel, não borda), raio de 2px e **filete nenhum**; a razão de existir dele é alargar a marca
para fora da caixa do texto. O papel é um **bloco** com filete de 1px na cor escura da
caneta, raio de 3px, recuo de 34px à esquerda e um `<textarea>` dentro. ~~Zero propriedades em
comum além do nome da caneta~~ — reusá-lo exigiria três props novas (elemento, anel, borda)
para um segundo chamador que não quer nada do que ele faz. **Escolhido: não reusar.** O
consumidor somente-leitura de `margin-highlight.tsx:102` fica intocado.

⚠️⚠️ **"ZERO PROPRIEDADES EM COMUM" É FALSO, e a que existe é justamente a central — nota
20.** O preenchimento do papel é **a mesma classe, literal, duplicada em dois pacotes**: o
mapa de canetas do `GrifoText` começa pelo utilitário que o mapa de preenchimento daqui
inteiro é. A conclusão ("não reusar o **componente**") sobrevive à correção; o que eu não
medi foi o **mapa**. A medição está na nota 20, e a decisão — também não extrair — agora
vem com o número em vez de com uma frase.

**O `FilterChip`** — e aqui houve uma **escolha contra o que o docblock dele previa**. Ele
diz, desde a auditoria da 41a, que *"quem pinta isso é a Tarefa 47, pelo `start`/`className`
da opção"*. Medido com o diff na mão: o estado pressionado dele precisaria de **quatro**
sobreposições (preenchimento, cor do filete, **espessura** do filete e cor do texto), e o
`cx` **não resolve conflito de utilitário** — quem venceria seria a ordem de emissão do CSS.
Medido no CSS desta entrada: `.bg-pen-a` sai **366 bytes depois** de `.bg-accent`, ou seja,
hoje daria certo **por um motivo que ninguém declarou**. É exatamente a invariante que a
auditoria da 46 teve de pinar à mão (B5) depois de achá-la sem guarda nenhuma — e lá era
inevitável, porque o componente era compartilhado. **Aqui é evitável**, então a pílula
nasceu local em `highlight-fields.tsx` (`PenPill`, ~40 linhas), e o `FilterChip` segue com o
consumidor dele (o `FilterBar`).

~~⚠️ **DÍVIDA DECLARADA:** o docblock de `packages/ui/src/components/filter-chip.tsx` agora
aponta para um caminho que não foi tomado. **Não o corrigi porque a decisão I fecha a fatia
em dois arquivos**, e mexer em `packages/ui` muda o fonte que o CSS do app varre. **É uma
linha de prosa para a 47b ou a 48** — e é a classe de ponteiro envelhecido do §7.4, então
não deve ficar para depois da 48.~~

⚠️⚠️ **A DÍVIDA ERA MAIOR DO QUE ESTÁ ESCRITO AÍ, E FOI PAGA NESTA RODADA — nota 21.** Não
era "uma linha de prosa": eram **quatro frases em dois arquivos**, uma delas o **nome de um
teste**, e duas delas ponteiros **por número de linha** para `highlight-fields.tsx` — a
forma que o §7.4 proíbe nominalmente, e que já tinha envelhecido (a linha citada virou
outra coisa dentro da própria fatia). Pior: depois da 47a o `FilterChip` **não implementa
mais artboard nenhum**, e a auditoria inteira da Tarefa 41a estava pendurada num desenho
que o componente já não desenha. Corrigido em `filter-chip.tsx` e
`filter-chip.test.tsx`, **pelo nome e nunca pela linha**.

### 8 · A varredura anti-culpa: qual variante, e onde

`anti-guilt-dom.ts` lido antes de escolher (as duas variantes são **mutuamente exclusivas**
desde a rodada de correção da 44). O veredito: **`expectNoGuilt()`**, nunca
`expectNoGuiltWithPlanPosition()` — o formulário do grifo **não mostra a posição no plano em
estado nenhum**, e a variante da posição exige ≥ 1 subtração efetiva, então usá-la aqui
ficaria vermelha na hora. Nos estados com campo inválido, `expectNoGuiltBesidesFormError()`,
com a lista exata dos vermelhos legítimos.

Estados varridos (os dois modos): editor em voo · editor chegou · paleta · **papel com cada
uma das cinco canetas** · **papel neutro, sem caneta** · trecho em branco · cor não escolhida
· página inválida (5 valores) · criação falhou · correção carregada · **correção com trecho
em branco** (estado novo desta fatia) · grifo inexistente · 404 no livro · "tentar de novo" ·
`/me` morto · grifo de outra pessoa · correção falhou.

### 9 · ⚠️ O "estado de arquivar" da regra 7 **não existe nestas telas**

`CorrigirGrifo.dc.html:87-90` desenha um "Arquivar este grifo". Medido: `highlight-form.tsx`
**não tem arquivamento** — quem arquiva grifo é o acervo (`acervo.tsx`, com confirmação, e o
`DELETE` sai de lá). Trazê-lo para o formulário seria **comportamento novo**, não pintura, e
a decisão J fecha a fatia em tela. **Registrado como pendência de desenho, não executada.**

### 10 · As divergências de escala e de token, todas

1. **17px → `text-reading` (17,5px).** A escala fechada tem sete degraus
   (`theme.css:447-458`) e 17 não é um deles; 17,5 é o degrau de leitura, e a Tarefa 43 já o
   mediu como o degrau **deste** texto. Meio pixel.
2. **40px da aspa → valor arbitrário.** A escala vai até 25px. Um oitavo degrau para um
   glifo decorativo de um lugar só entraria também na lista fechada de isenções do
   `light-dark()`. Precedente: as três da lombada do `BookSpine`.
3. **1,5px da borda → valor arbitrário.** Não há token de espessura de borda no projeto.
4. **13px do texto da pílula → `text-sm` (14px).** Um pixel; mesmo argumento do 17,5.
5. **3px do raio → `rounded-callout`.** ~~⚠️ **E isto QUITA uma dívida com prazo:** o
   `styles.css` dizia que `rounded-callout` estava sem consumidor e que o **prazo era a
   Tarefa 47** — "se as duas passarem sem usá-lo, ele sai". Passou a ter um.
   ⚠️ **`rounded-mark` (`--r-1`) continua sem consumidor de produção** e tinha o mesmo prazo:
   ele é o raio da marca de grifo, e a marca é o `GrifoText`, que a nota 7 mediu como **não
   reusável aqui**. Fica para a 48 decidir — não o usei só para salvar o token.~~
   ⚠️⚠️ **AS DUAS FRASES RISCADAS ACIMA SÃO FALSAS, e a segunda armava uma deleção na
   Tarefa 48 — ver a nota 18.** Medido: `rounded-callout` **já tinha** consumidor de
   produção antes desta fatia e `rounded-mark` **também**; os dois ganharam o deles no
   mesmo commit, a Tarefa 41b. Eu copiei a frase de um comentário do `styles.css` que tinha
   envelhecido seis fatias antes, em vez de contar os consumidores. Esta fatia acrescentou
   um **segundo** consumidor ao `rounded-callout`; ela não quitou dívida nenhuma, porque
   não havia dívida.
6. **Altura mínima do papel: não escrita.** O canvas declara 150px no papel **e** 114px no
   `<textarea>`, com 18px de folga em cima e embaixo. 114 + 18 + 18 = 150, então escrever os
   dois seria dar dois donos à mesma medida. Escrito só o 114.
7. **A legenda das canetas continua `role="group"` + `aria-label`, e não `<fieldset>`/
   `<legend>` como o canvas.** Trocar orfanaria a chave `fields.colorGroup`, e apagar chave
   é mexer no catálogo — fora da decisão J. O resultado visual é o mesmo.
8. **A "Rascunho guardado" (decisão H) NÃO foi implementada** — ver a nota 11.

### 11 · ⚠️⚠️ A decisão H conflita com a regra 19 da Tarefa 25, e eu PAREI nela

A decisão H manda usar o `SaveIndicator` para o "Rascunho guardado" de
`NovoGrifo.dc.html:96`. Medido, e são três fatos contra:

1. **Esta tela não tem autosave nenhum**, por decisão escrita e documentada no próprio
   `highlight-form.tsx` (regra 19 da Tarefa 25): *"um autosave na tela de registro criaria um
   grifo por tela aberta — e `POST` não é idempotente"*. Não existe rascunho a indicar; um
   "Rascunho guardado" numa tela que não guarda rascunho é a tela **mentindo**;
2. **rascunho local é fila offline**, e o cabeçalho do MVP 3.5 põe *"lógica de autosave, fila
   offline em IndexedDB"* **fora de escopo para a seção inteira**, com a instrução literal
   de **parar e perguntar**;
3. **os dois artboards discordam entre si**: `CorrigirGrifo.dc.html` não tem barra inferior
   nem indicador nenhum. E a barra onde ele mora no `NovoGrifo` (`:91-97`) é a **barra do
   editor** (`Aa`, `/`), que é assunto da Tarefa 43, não desta.

A decisão H também **não aparece na Definição de pronto**. Então: **não implementada, e a
pergunta fica aberta.** A chave `pages.highlightForm.draftSaved` segue no catálogo sem
consumidor desde a Tarefa 40 — como `pages.highlightForm.preview.heading`, que é a prévia
"Como vai aparecer no acervo" e também não foi pedida nesta fatia.

### 12 · Prosa custa CSS: a conferência, e o que ela pegou

O CSS foi auditado **seletor a seletor**, não só no total. ~~Dos **+885 B**, **823 B** estão em
**20 seletores** que nenhum fonte do `4f99fbe` escrevia~~ ⚠️ **ERRADO — o número certo é
**932 B em 22 seletores**, menos os 47 B do seletor que SUMIU, o que fecha nos mesmos
+885 B (nota 22).** Os dois que faltavam estão **escritos em
código**, nenhum só em comentário (script em `scratchpad/t47a/css-delta.mjs`: casa o bloco
`.sel{…}` no CSS e pergunta ao `git grep` no commit de entrada se alguém já o escrevia).

⚠️ **O que a varredura de prosa pegou:** o docblock do `QuoteField` citava o nome nu do
utilitário de anel do `GrifoText` para explicar por que ele não serve. Ele **não** custou
bytes — o `packages/ui` já o escreve, então o seletor já existia —, mas é exatamente a
armadilha da 46 com a espoleta adiada: no dia em que o `GrifoText` mudasse, a minha prosa
manteria o seletor vivo sozinha. Reescrito em palavras ("um anel, não uma borda"), build
refeito, **CSS idêntico**. ~~Sobram três nomes de classe citados em prosa neste arquivo, e os
três são escritos em código na mesma tela.~~ ⚠️ **A última frase não bate: um dos três é
escrito em OUTRO arquivo** (a classe da bolinha mora em `highlight-colors.tsx`). Sem custo
de bytes — o seletor existe de qualquer jeito —, mas a frase afirmava uma propriedade mais
forte do que a medida, que é exatamente o vício que esta nota existe para caçar. E a
rodada de correção achou um caso **pior e verdadeiro**: nota 23.

**Varredura de invisíveis** (`scratchpad/t47a/invisiveis.mjs`, 22 code points montados
**por número**, nenhum glifo colado): ela **morde antes de varrer** — num texto plantado com
`U+200B` e `U+00A0` acusa 2 de 2, e estoura se acusar menos. Nos quatro arquivos do diff mais
esta spec: **zero**. O único não-ASCII novo é `U+201C` (LEFT DOUBLE QUOTATION MARK), a aspa
da decisão B — **visível, de propósito, e pinada por código no teste**
(`String.fromCodePoint(0x201c)`), nunca por glifo colado. ⚠️ Ela está no fonte como o
caractere literal e não como escape: o Prettier converte `'“'` em `'“'` ao formatar, o
que foi medido ao aplicar o mutante M12.

### 13 · Gates, bytes e tamanho

| | entrada (`4f99fbe`) | saída | Δ |
| --- | --- | --- | --- |
| `pnpm -r test` shared | 607 | **607** | = |
| ui | 305 | **305** | = |
| backend | 1994 | **1994** | = |
| app | 964 | **975** | **+11** |
| chunk de entrada | 439.608 B | **441.297 B** | **+1.689** |
| folga até 450.000 | 10.392 | **8.703** | −1.689 |
| CSS | 35.919 B | **36.804 B** | **+885** |
| `book-form` | 10.059 | **10.059** | = |
| editor | 449.522 | **449.522** | = |
| `index.html` | 1.638 | **1.638** | = |
| precache | 27 | **27** | = |

**A fatia custou 2.574 B no total**, dentro do orçamento de ~3.000. Sobram **8.703 B** de
folga para a **47b** e a **48** — e a 47b pega três telas, duas delas maiores que estas.
⚠️ **Se as duas não couberem, quem decide o teto do `bundle-guard` é a 48, que já tem isso
na ementa.**

`pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` · `pnpm --filter @clube/app
build`: **todos verdes**.

**Tamanho, pelo contador canônico** (`acervo.tsx:115-126`, nunca `wc -l`):

| arquivo | antes | depois |
| --- | --- | --- |
| `highlight-form.tsx` | 427 | **427** (intocado em código; só prosa) |
| `highlight-fields.tsx` | 189 | **304** |

⚠️ **O crescimento foi todo para o lado que tinha folga, e está registrado NO ARQUIVO QUE
RECEBEU** — não só aqui. O `highlight-form.tsx` já está 27 acima do teto de 400 e não ganhou
uma linha de código; o docblock dos **dois** dizia "423 + 189" e os dois números estavam
velhos (o primeiro desde a 38i). Corrigidos e datados nos dois lugares. É a lição da 46, onde
uma tela encolheu 33 e a vizinha absorveu +208 sem uma linha de comentário em lugar nenhum.

⚠️ **Um número guardado dos dois lados subiu, e o vermelho veio da guarda:**
`ui-source-scan.test.ts` pina quantos arquivos de `packages/app/src` escrevem `min-h-11` — 5
até aqui, **6** agora, porque a pílula passou a escrever o piso de toque no próprio arquivo
(antes ele só chegava lá pelo `TEXT_INPUT_CLASS`, que mora em `form-styles.ts`). Número **e
prosa** atualizados, com o recado para quem vier: soma um, não apaga a asserção.

### 14 · A tabela de mutação — ~~**16 mutantes, 16 acusados, ZERO sobreviventes**~~

⚠️⚠️ **O NÚMERO ESTÁ CERTO E A CONCLUSÃO ESTÁ ERRADA, e a auditoria mostrou por quê: os 16
atacam todos o MESMO EIXO.** Todos perguntam *"qual caneta pinta o quê"*; nenhum pergunta
*"a pintura existe?"*. Na primeira tentativa de auditoria no eixo que faltava —
largura, posição, altura, degrau, presença — **seis de oito mutantes inéditos sobreviveram
com ZERO acusadores**, um deles apagando o filete que o nome de um teste jurava guardar.
A tabela corrigida, com os sete acusadores novos, está na **nota 17**.

Protocolo em cada um: `md5sum` + `cp -p` → `.mjs` **ancorado, com âncora e substituto em
arquivo** (estoura se a âncora não aparecer exatamente 1 vez, e se âncora = substituto) →
`grep` de confirmação → rodar → contar e **nomear** → `cp -p` de volta → `md5sum -c` **e**
`cmp` por conteúdo. Os 16 restauraram idênticos.

| # | mutante | acus. | quem acusou (1º) |
| --- | --- | --- | --- |
| M1 | papel e filete fixos na caneta `a` | 2 | `paints the paper, its edge AND the quote mark …` |
| M2 | **aspa** fixa na caneta `a` | 2 | idem |
| M3 | **só o filete** fixo em `a` | 2 | idem |
| M4 | **só o papel** fixo em `a` | 2 | idem |
| M5 | rótulo do trecho vira neutro | 1 | `paints the label of the paper with the gold …` |
| M6 | legenda das canetas vira dourada | 1 | `keeps the legend of the pens NEUTRAL …` |
| M7 | pílula encolhe abaixo de 44px | 1 | `gives every pen the 44px touch floor` |
| M8 | selecionada só difere pela **cor** | 1 | `tells the chosen pen apart by the WIDTH …` |
| M9 | papel nunca fica neutro (cai em `a`) | 1 | `leaves the paper NEUTRAL while no pen …` |
| M10 | as cinco canetas com um preenchimento só | 2 | `paints the paper, its edge AND …` |
| M11 | aspa deixa de ser `aria-hidden` | 1 | `hangs the quote mark as TEXT …` |
| M12 | aspa vira aspas reto (`U+0022`) | 1 | idem |
| M13 | **um hex de `HIGHLIGHT_COLORS`** | **17** | `HIGHLIGHT_COLORS > is exactly the five colours …` |
| M14 | os **três** elementos fixos em `a` | 3 | inclui `gives the five pens FIVE different paintings` |
| M15 | erro do trecho deixa de ser anunciado | 1 | `points the quote at its hint, and at the error …` |
| M16 | trecho nunca fica `aria-invalid` | 2 | `marks the QUOTE and sends nothing when it is empty` |

⚠️ **M10 é o que mostra por que a metade "cinco pinturas diferentes" precisa do M14 e não se
prova sozinha:** com as cinco canetas compartilhando o preenchimento, o filete e a aspa ainda
divergem, então o conjunto das três pinturas continua com cinco elementos e **aquele** teste
fica verde. Quem o mata é o M14, que fixa os três. Os dois estão na tabela de propósito.

### 15 · O que tentei e não deu certo

1. **Pintar o `FilterChip` pelo `className`**, que é o caminho que o docblock dele previa.
   Abandonado por medição — nota 7. Custo: o ponteiro dele ficou velho, e está declarado.
2. **`text-gold` no rótulo**, literal do canvas. Vermelho imediato — nota 3.
3. **`text-faint` na aspa sem caneta.** Vermelho imediato — nota 4.
4. **Manter o `Field` no campo do trecho**, mudando só o fundo. Não dá: o `Field` põe o
   rótulo em mono neutra e a dica **abaixo** do controle, e o canvas quer dourado e ao lado.
   Crescer o `Field` com duas props de variante para **um** chamador seria especulação paga
   por todas as outras telas — então a fiação foi refeita à mão, **com teste próprio** (M15 e
   M16), que é o preço honesto de sair de um componente que fazia isso por você.
5. **Escrever a aspa como `'“'`.** O Prettier converte para o caractere literal. Não é
   erro — o teste pina por número, que é o lado que importa —, mas está registrado porque o
   mutante M12 tropeçou nisso primeiro.

### 16 · ⚠️ Um quarto número errado, no cabeçalho desta spec: `book-form.tsx` tem **456**, não 494

Medido pelo contador canônico (`acervo.tsx:115-126`), no arquivo que esta fatia **não toca**,
e portanto idêntico ao do `4f99fbe`:

```
free-note.tsx    602   ✅ o cabeçalho acerta
book-form.tsx    456   ❌ o cabeçalho diz 494
plan-editor.tsx  239   (não citado)
highlight-form   427   ✅
```

O 494 não vem do `wc -l` (que dá **824**) nem de nenhum número anterior do `BACKLOG.md` — é
erro solto. Corrigido aqui, na entrada **47a** e na entrada **47b** do `BACKLOG.md`. Importa
porque é um dos três números que **justificaram a divisão da tarefa**: com 456 o
`book-form.tsx` continua acima do teto de 400 e o argumento da divisão continua de pé, mas o
próximo leitor não deve herdar um número que ninguém mediu.

---

## Notas da RODADA DE CORREÇÃO (17 em diante)

_Executor diferente de quem escreveu as notas 1 a 16. O revisor derrubou **nove afirmações** e
achou **seis mutantes sobreviventes em oito tentativas inéditas**, com um veredito de uma
linha: **"a suíte guarda COR e não guarda FORMA"**._

### 17 · ⚠️⚠️ O eixo que faltava: sete mutantes novos, **sete acusados**

Os 16 mutantes da nota 14 atacam todos a mesma pergunta — *qual caneta pinta o quê*. Nenhum
ataca *se a pintura existe*. Protocolo por mutante, um a um: `md5sum` + `cp -p` → `.mjs`
**ancorado, com âncora e substituto em ARQUIVO** (estoura se a âncora não aparecer
exatamente 1 vez e se âncora = substituto) → `grep` de confirmação → `pnpm --filter
@clube/app test` → contar e **nomear** → `cp -p` de volta → `md5sum -c` **e** `cmp` por
conteúdo. Os sete restauraram idênticos.

| # | mutante | arquivo | antes | agora | quem acusa (1º) |
| --- | --- | --- | --- | --- | --- |
| A1 | o papel perde o utilitário de **largura** da borda (fica só a cor) | `highlight-fields.tsx` | **0** | **3** | `paints the paper, its edge AND the quote mark …` |
| N1 | a aspa migra para o canto **oposto** | `highlight-fields.tsx` | **0** | **1** | `hangs the quote mark in the TOP LEFT corner …` |
| N3 | o recuo do papel vira **simétrico** | `highlight-fields.tsx` | **0** | **1** | `cuts the recess for the quote mark on the LEFT ONLY …` |
| N5 | a bolinha das cinco pílulas fixa na **primeira caneta** | `highlight-fields.tsx` | **0** | **1** | `gives each pen pill ITS OWN dot — five pills, five dots` |
| N7 | o campo de texto perde a **altura mínima** | `highlight-fields.tsx` | **0** | **1** | `gives the paper the height the canvas asks for …` |
| N8 | o trecho perde o **degrau de leitura** | `highlight-fields.tsx` | **0** | **1** | `sets the quote at the READING step …` |
| M6 | o filete deixa de reagir ao **erro** | `highlight-fields.tsx` | — | **1** | `turns the edge of the paper DANGER …` |

⚠️ **O A1 é o mais grave dos seis, e a razão é o §7.9 literal.** A asserção era
`toContain` da CLASSE DE COR do filete, e o nome do teste jurava `its edge`. Em produção a
largura ia a **zero**: o filete sumia **nos dois temas e nas cinco canetas**, e 975 testes
ficavam verdes. Não era limitação do jsdom — faltava **uma linha** na função que o próprio
teste já tinha. Hoje são duas (a largura e o par negativo), e o mutante passou a ter **três**
acusadores, porque o estado sem caneta também o vê.

⚠️ **E o N5 é REGRESSÃO DE COBERTURA, não buraco herdado:** antes da 47a a amostra de cor
era o `ColorSwatch` de `packages/ui`, com guardas próprias no acervo e na busca. A pílula
passou a desenhá-la à mão e nada mais olhou para ela. **Toda vez que uma tela para de usar
um componente compartilhado, ela herda as guardas dele — ou perde as propriedades dele em
silêncio.** É a mesma classe do ponteiro da nota 21 e do vermelho da nota 23: sair de um
componente custa o que ele fazia por você, e o custo não aparece em nenhum vermelho.

⚠️ **Sobre o "vermelho colado" destas guardas.** Cinco das sete nasceram **verdes** contra a
implementação, e isso é o esperado num ciclo dirigido por mutação e não por funcionalidade:
o comportamento já existia, o que não existia era a guarda. O vermelho delas **é o do
mutante**, e está na tabela acima, medido um a um, com o contador de acusadores indo de 0 a
1 (ou a 3). Só o M6 nasceu vermelho contra a implementação, porque ali faltava
comportamento, não só guarda.

### 18 · ⚠️⚠️ A afirmação da nota 10.5 armava uma DELEÇÃO na Tarefa 48

A nota 10.5 e o `BACKLOG.md` diziam que *"`rounded-mark` continua sem consumidor de
produção"* e que esta fatia **quitava** a dívida do `rounded-callout`. **As duas frases são
falsas, e a primeira é perigosa.**

Medido, com `git grep` no commit de entrada:

| utilitário | consumidor de produção em `4f99fbe` | desde |
| --- | --- | --- |
| `rounded-callout` | o botão do `ContextBar`, em `packages/ui` | **Tarefa 41b** |
| `rounded-mark` | o `GrifoText`, em `packages/ui` (com teste próprio) | **Tarefa 41b**, o mesmo commit |

Ou seja: os dois ganharam consumidor **no mesmo commit**, seis fatias antes desta. A 47a
acrescentou um **segundo** consumidor ao `rounded-callout` e não quitou nada.

⚠️ **O risco era concreto.** A frase foi copiada de um comentário do `styles.css` que
envelheceu na 41b, e aquele comentário não diz só "sem consumidor": ele diz *"se as duas
passarem sem usá-lo, ele sai — e o `--r-2` sai com ele"*. Repetida no **registro
permanente**, a frase entrega à Tarefa 48 uma **licença medida** para apagar um token vivo e
quebrar o `GrifoText`. Corrigido em três lugares: o comentário do `styles.css` (que é o que
estava velho), esta nota e o `BACKLOG.md`.

**A lição, que é a nº 3 outra vez:** um prazo escrito sem alguém encarregado de reconferi-lo
vence sozinho — e vence apontando para o lado errado. Copiar uma afirmação de um comentário
em vez de medi-la é como ela viaja.

### 19 · ⚠️⚠️⚠️ **PARO AQUI: a decisão A4 do dono tem a premissa INVERTIDA, medido**

A decisão do dono (2026-09-23) manda trocar o filete do papel por *"a borda padrão do app"*,
com esta justificativa: o filete de caneta reprova a WCAG 1.4.11, o campo anterior usava o
estilo compartilhado de campo de texto *"que cumpre 3:1"*, e portanto isto é **regressão
introduzida** pela fatia. **Medi as três afirmações. As três não se sustentam.**

Fórmula WCAG 2.1 3.2.2, hexes lidos de `packages/ui/src/theme.css`, script em
`scratchpad/t47ac/contrast.mjs`.

**(a) OS DEZ NÚMEROS PEDIDOS — o filete neutro externo contra a página:**

| caneta | tema claro | tema escuro |
| --- | --- | --- |
| a · amarelo | **1,35** | **1,38** |
| v · verde | **1,35** | **1,38** |
| l · laranja | **1,35** | **1,38** |
| z · azul | **1,35** | **1,38** |
| r · rosa | **1,35** | **1,38** |

Os dez são iguais de propósito: **o filete neutro não depende da caneta** — é por isso que
ele não "volta a existir nas cinco canetas". Ele reprova 3:1 **nos dez**, por margem de mais
do dobro.

**(b) E o outro lado do mesmo filete** (ele emoldura o filete de caneta, então este é o par
que decide se a moldura se distingue do que ela emoldura): 1,69 · 2,56 · 3,09 · 3,40 · 3,37
no claro; 4,99 · 3,29 · 3,63 · 3,56 · 3,55 no escuro. Dois reprovam no claro.

**(c) O QUE A FATIA ENTREGOU, contra a página:**

| caneta | claro | escuro |
| --- | --- | --- |
| a · amarelo | **2,28** | 6,90 |
| v · verde | **3,46** | 4,56 |
| l · laranja | **4,18** | 5,02 |
| z · azul | **4,59** | 4,93 |
| r · rosa | **4,56** | 4,91 |

**(d) O QUE HAVIA ANTES DA FATIA:** o campo usava o estilo compartilhado, cujo filete é o
mesmo neutro da tabela (a): **1,40:1** contra a superfície e **1,35:1** contra a página, no
claro.

**As três conclusões, e elas são desconfortáveis:**

1. **Não houve regressão.** A fatia levou a fronteira do campo de **1,35–1,40** para
   **2,28–4,59** no claro e **4,56–6,90** no escuro. Quatro das cinco canetas passam 3:1 no
   claro; as cinco passam no escuro. O pior caso (amarelo, 2,28) é **69% melhor** que o
   filete que estava lá antes.
2. **A troca prescrita PIORA os dez casos.** Trocar o filete de caneta pelo neutro leva
   2,28→1,35 no amarelo e 4,59→1,35 no azul. Mantê-lo **por fora**, sem tirar o de dentro,
   não muda nada: a fronteira efetiva continua sendo a melhor das duas, que é a de caneta.
   O ganho seria de paridade visual com as outras telas — não de contraste.
3. **Nenhum token de filete do projeto resolve o amarelo.** Medido: o neutro dá 1,35, o
   neutro forte dá 2,37, e o dourado de filete que o **artboard de desktop** usa (nota 25)
   dá **1,84**. O único que passaria é o dourado forte de texto (4,16), e ele contraria a
   decisão A, que é a razão de existir da fatia: o filete repinta por caneta.

⚠️ **NÃO IMPLEMENTEI A DECISÃO A4**, porque implementá-la ao pé da letra cumpriria a
instrução e **derrotaria o objetivo escrito nela** ("a fronteira volta a existir"). As três
saídas que consigo enxergar, para o dono escolher:

- **(i) Não mexer.** O estado de hoje é o melhor dos três em todas as dez medições, e a
  divergência que sobra (amarelo, 2,28 no claro) é o item que a ementa da Tarefa 48 já
  nomeia — *"varredura de contraste … e os fundos de grifo"*.
- **(ii) Filete neutro por fora, assumido como PARIDADE e não como contraste.** É barato e
  não machuca; a nota tem de dizer que ele não acrescenta fronteira, senão o próximo leitor
  herda a premissa errada.
- **(iii) Levantar o piso do filete de caneta.** É o único caminho que resolve o amarelo de
  verdade, e mexe em valor de canvas (`--pen-a-dot`) ou cria um filete derivado. **Fora do
  alcance desta rodada** e, pela minha leitura, é exatamente o que a 48 existe para decidir.

⚠️⚠️ **E o achado que vale mais que os três:** o filete neutro do app **reprova 1.4.11 em
todo campo de texto do projeto** (1,35 contra a página, 1,40 contra a superfície, nos dois
temas). Não é um problema desta tela; é o estado da base. Fica registrado para a Tarefa 48
com os números já medidos.

### 20 · M9 — o mapa de canetas: **cinco mapas literais, e a duplicação real é de cinco nomes**

A nota 7 dizia "zero propriedades em comum além do nome da caneta". Falso: o preenchimento é
**a mesma classe, literal**, no mapa do `GrifoText` (`packages/ui`) e no mapa de
preenchimento do papel (`packages/app`).

Contados em produção, em todo o repositório:

| mapa | onde | o que pinta |
| --- | --- | --- |
| 1 | `packages/ui/src/components/grifo-text.tsx` | preenchimento **+ anel**, num par |
| 2 | `packages/app/src/pages/highlight-fields.tsx` | preenchimento do papel |
| 3 | `packages/app/src/pages/highlight-fields.tsx` | filete do papel |
| 4 | `packages/app/src/pages/highlight-fields.tsx` | tinta da aspa |
| 5 | `packages/app/src/pages/highlight-colors.tsx` | bolinha da amostra |

**A superfície duplicada é só entre 1 e 2, e é de cinco nomes de classe.** Os mapas 3, 4 e 5
pintam propriedades que nenhum outro pinta.

**Decisão, com o número: não extrair** — e agora por medição, não por frase.

1. o motivo de um mapa ser **literal** é o scanner do Tailwind, e ele já é satisfeito nos
   dois lugares de forma independente (o CSS do app varre `packages/ui`, e há guarda disso).
   Extrair não emite **um seletor a mais nem a menos**;
2. o mapa 1 guarda preenchimento e anel como **um par**, e o acusador dele compara as duas
   metades por **igualdade**. Partir a string para importar metade dela **enfraquece** a
   guarda — o oposto do que a extração deveria comprar;
3. o único risco que a duplicação cria (um rename de utilitário) **não passa em silêncio**:
   a bijeção token↔utilitário tem guarda própria e acusa dos dois lados.

⚠️ **O gatilho para reabrir, escrito para não depender de memória:** um **sexto** mapa, ou um
segundo mapa que duplique o par preenchimento+anel. Três donos do mesmo par é onde o §7.1
manda extrair em vez de cobrir de novo. Registrado também no docblock do `QuoteField`, para
não viver só aqui.

### 21 · A3 — a dívida de ponteiro era **quatro frases em dois arquivos**, e uma peça era proibida

Declarada como "uma linha de prosa para a 47b ou a 48". Medida:

| # | onde | o que dizia | por que caiu |
| --- | --- | --- | --- |
| 1 | `filter-chip.tsx`, docblock do repouso | a paleta de canetas é "o que `highlight-fields.tsx:138` renderiza com este componente" | ⚠️ **ponteiro por LINHA (§7.4)**, e a linha já era outra coisa; o componente **não é renderizado naquela tela em linha nenhuma** |
| 2 | `filter-chip.tsx`, docblock do pressionado | "quem pinta isso é a Tarefa 47, pelo `start`/`className` da opção" | a 47a mediu e **não tomou** esse caminho |
| 3 | `filter-chip.test.tsx`, corpo do teste | o mesmo ponteiro por linha, repetido | idem |
| 4 | `filter-chip.test.tsx`, **NOME do teste** | `…the way the canvas draws IT` | ⚠️ o "IT" era a paleta de canetas; depois da 47a o componente **não implementa mais artboard nenhum** |

⚠️ **A nº 4 é a que não podia esperar pela 48:** o §7.9 diz que *o nome do teste é parte da
guarda*, e este nome prometia fidelidade a um desenho que o componente deixou de desenhar —
a auditoria inteira da Tarefa 41a ficou pendurada nele. Renomeado para o que o teste de fato
prova (o tom de repouso que o canvas dá a **toda** pílula não escolhida, que é o que o
consumidor real do componente herda), e os três ponteiros reapontados **pelo nome**
(`PenPill`), nunca pela linha.

`packages/ui` foi tocado **só para isto e para o que a nota 18 exigiu**, por autorização
explícita desta rodada.

### 22 · M7 — os bytes de CSS da entrega anterior: **22 seletores / 932 B**, não 20 / 823

O erro de origem foi `git grep` por **substring**, que é o mesmo vício que esta série já
pagou. Reconferido um a um, com o texto da linha na mão:

| seletor | o executor disse | medido |
| --- | --- | --- |
| `.size-3` (71 B) | "já existia em `4f99fbe`" | ❌ as três ocorrências de `4f99fbe` são **`size-3.5`** — a classe de 12px é nova |
| `.border-gold` (38 B) | "já existia em `4f99fbe`" | ❌ todas as ocorrências são **`border-gold-line`** ou prosa sobre `border-gold` |
| `.min-h-24` (47 B) | não mencionado | ✅ **existia** e **SUMIU** — era a altura do campo antes de virar papel |

**A conta certa:** 932 B em 22 seletores novos, menos 47 B do que saiu = **+885 B**, que é o
delta total já registrado. ⚠️ **A conclusão sobrevive inteira** (nenhum byte veio de prosa);
o que estava errado era o número no registro permanente, e número errado em registro
permanente é o que a próxima fatia herda como base.

### 23 · ⚠️ O caso de prosa que a nota 12 procurava e não achou: **`.border-danger` vivia só de comentário**

A nota 12 diz que os nomes de classe citados em prosa "são escritos em código na mesma tela".
Medido nesta rodada, com `git grep` no commit de entrada: o seletor `.border-danger` (42 B)
estava no CSS construído **sem nenhum escritor de produção**. Quem o mantinha vivo eram
**três docblocks** — dois em `packages/ui` e um no `styles.css` —, porque o scanner do
Tailwind lê o texto bruto. O único uso real era a **variante de atributo**, que emite um
seletor **diferente**.

É a armadilha da Tarefa 46 com a espoleta já queimando: 42 B pagos por comentário, e um
seletor que sumiria no dia em que alguém reescrevesse uma frase. **A correção do M6 (nota
23a) deu a ele um escritor de produção de verdade** — e é por isso que esta rodada custou
**zero** byte de CSS, apesar de acrescentar uma classe nova ao papel.

**23a · M6 — o campo tinha perdido o vermelho de erro que todo campo do app tem.** Ao sair do
estilo compartilhado de campo de texto, o papel levou junto o filete vermelho do campo
inválido; sobrava a mensagem abaixo, enquanto **o campo de página da mesma tela** continuava
acendendo a borda. Restaurado no filete do próprio papel, que passa a **substituir** o da
caneta (somar dois utilitários de cor de borda deixaria a ordem de emissão do CSS decidir —
a invariante B5 da 46). ⚠️ **Divergência declarada:** aqui o estado vem da **prop** e não do
atributo, porque o padrão do atributo existe para uma **constante compartilhada**, que não
enxerga estado; este componente já é o dono do `error` e já decide por ele três vezes, então
a quarta sai da mesma fonte. O ganho é o §7.9: a propriedade fica **decidível em jsdom**.

### 24 · B3 — os intervalos de artboard, conferidos de novo

O intervalo corrigido na nota 1 (`CorrigirGrifo.dc.html:48-64`) fecha o contêiner das
pílulas mas **não** o `<fieldset>`, que fecha em `:65`. O intervalo é **`:48-65`**, e o
análogo no `NovoGrifo` é **`:46-66`** — a tabela de medidas da spec cita `:46-55` (só o
campo do trecho) e `:59-65` (só as pílulas), e nunca o bloco dos dois.

Corrigido na tabela "As medidas". É cosmético; está aqui porque a nota 1 se apresenta como
*a* conferência de citações, e uma conferência que erra a própria correção é pior do que uma
que não se apresenta assim.

### 25 · ⚠️⚠️ A5 — **existe um TERCEIRO artboard desta tela, e ele discorda do filete**

`NovoGrifoDesktop.dc.html` desenha o mesmo campo, e não estava na lista de medidas da spec.
Medido, linha a linha:

| peça | `NovoGrifo` (móvel) | `NovoGrifoDesktop` |
| --- | --- | --- |
| o papel | `:51` — recuo `18 18 18 34`, mínimo 150px | `:54` — recuo **`24 24 24 48`**, mínimo **168px** |
| a aspa | `:52` — 40px, em `10/8` | `:55` — **54px**, em **`14/10`** |
| o trecho | `:53` — 17px, altura 114 | `:56` — **20px**, altura **120** |
| a dica | `:49` — 11,5px | `:52` — **12,5px** |
| as pílulas | `:60-64` — recuo lateral 14px, texto 13px | `:63-67` — recuo lateral **16px**, texto **13,5px** |
| ⚠️ **o filete do papel** | `var(--pen-a-dot)` | ⚠️ **`#d6ae64`, que é `--gold-line`** |

⚠️ **O canvas dá DUAS FONTES DIFERENTES para o filete da decisão A** — e a do desktop é a
**mais fraca das duas**: `--gold-line` contra a página dá **1,84:1** no claro e **1,65:1** no
escuro, contra os 2,28–4,59 do filete de caneta. Quem for implementar o desktop **não pode
copiar aquele valor sem ler a nota 19**.

⚠️ **NÃO IMPLEMENTADO — é da 47b**, junto com os outros artboards de desktop. Registrado na
entrada 47b do `BACKLOG.md`.

⚠️ **E a lição é a da 45 e a da 46, pela terceira vez:** a lista de artboards da spec estava
incompleta e o executor **não perguntou**. A varredura certa não é "conferir as citações que
a spec faz" (nota 1, que foi bem feita) — é **`ls` no diretório do canvas e procurar toda
tela que desenhe o mesmo componente**, porque a spec não sabe o que ela não citou.

### 26 · M8 — as divergências que ficaram de fora da nota 10, e a assimetria é o problema

A nota 10 declara o 17→17,5 e o 13→14, e cala estas **quatro**:

1. **A dica do campo: 11,5px do canvas → 11px do degrau de rótulo.** Meio pixel, mesmo
   argumento dos outros dois — mas não declarado.
2. **O rótulo da tela de correção: 9,5px do canvas → 10px do degrau de sobrancelha.** Meio
   pixel. Some com a nota 2, que trata a **cor** daquele rótulo e não o tamanho.
3. **O papel da tela de correção inteiro.** O canvas dá mínimo de 132px, altura de 96px e
   três linhas; foi entregue com 150/114/quatro, porque os dois modos dividem um componente
   só. É a mesma escolha da nota 2 (componente único vence fidelidade literal) — mas a nota 2
   só a declarou para a cor do rótulo.
4. **A dica é renderizada onde o canvas não a tem:** o `CorrigirGrifo` não desenha dica
   nenhuma ao lado do rótulo, e o componente compartilhado a põe nos dois modos.

⚠️ **Por que isto importa mais do que os meio-pixels somados:** uma lista de divergências
**parcial** é pior que nenhuma, porque ela passa a ser lida como completa. Quem conferir a
tela contra o canvas vai bater o olho nos quatro itens acima, não achá-los na lista, e
concluir que são defeito — ou, pior, "consertá-los" contra uma decisão que foi tomada de
propósito. As quatro são todas defensáveis; o defeito era o silêncio.

### 27 · B1 — "três correções à spec" × quatro

O `BACKLOG.md` diz *"Três correções à spec da própria tarefa"* e a Definição de pronto da
tarefa lista **quatro** (o intervalo, a decisão D, o "arquivar" e o `book-form.tsx` 456≠494).
Somadas as desta rodada, são **sete**. Corrigido no `BACKLOG.md`. É a linha que alguém lê
primeiro, e a própria 46 pagou por este mesmo defeito (o item B1 da auditoria dela).

### 28 · Gates, bytes e tamanho da rodada de correção

| | antes (entrega 47a) | depois | Δ |
| --- | --- | --- | --- |
| `pnpm -r test` shared | 607 | **607** | = |
| ui | 305 | **305** | = |
| backend | 1994 | **1994** | = |
| app | 975 | **981** | **+6** |
| chunk de entrada | 441.297 B | **441.343 B** | **+46** |
| folga até 450.000 | 8.703 | **8.657** | −46 |
| CSS | 36.804 B | **36.804 B** | **= (zero)** |
| `book-form` | 10.059 | **10.059** | = |
| editor | 449.522 | **449.522** | = |
| `index.html` | 1.638 | **1.638** | = |
| precache | 27 | **27** | = |

**A rodada custou 46 B**, muito abaixo dos ~800 B que o revisor pediu para eu sinalizar.
⚠️ **O CSS não mexeu um byte**, e a razão está na nota 23: a única classe nova de produção
(o filete vermelho) já tinha o seletor emitido — por **prosa**.

**Tamanho, pelo contador canônico** (`acervo.tsx`, nunca `wc -l`):

| arquivo | antes | depois |
| --- | --- | --- |
| `highlight-form.tsx` | 427 | **427** (não tocado) |
| `highlight-fields.tsx` | 304 | **309** |

O crescimento (+5) continua todo no arquivo que tinha folga. O `highlight-form.tsx` segue
nos 427, 27 acima do teto de 400, e **não ganhou uma linha** nesta rodada também.

### 29 · O que tentei nesta rodada e não deu certo

1. **Implementar a decisão A4 como prescrita.** Abandonada por medição, e é a nota 19. Não é
   "não deu certo" no sentido técnico — é que a medição diz que ela piora os dez números que
   ela existe para melhorar. **Pergunta aberta para o dono.**
2. **Restaurar o vermelho do erro pela variante de ATRIBUTO**, para manter o padrão do
   estilo compartilhado literalmente. Não dá sem inventar: o atributo mora no `<textarea>` e
   o filete mora no elemento de fora. As saídas seriam um seletor `:has()` (primeiro uso no
   projeto, e **indecidível em jsdom** — o teste provaria a string, não o efeito) ou um
   segundo `aria-invalid` num `<div>`, que é ruído para o leitor de tela. Ficou a prop, e a
   troca está declarada na nota 23a.
3. **Escrever um medidor de CSS seletor a seletor do zero**, para reproduzir o número da nota
   22 de ponta a ponta. Duas tentativas: a saída do Tailwind v4 é aninhada em camadas, e as
   duas varreduras que escrevi pegaram 184 e 7 classes de umas 800. Desisti do medidor e
   conferi **as três entradas contestadas uma a uma, com a linha do fonte na mão** — que é o
   que decidia a questão. Registrado para quem precisar do medidor completo não recomeçar
   pelo mesmo caminho.
4. **Assertar o recuo do papel por `toContain` da classe.** Trocado por ler o **número** do
   valor arbitrário e assertar a **relação** (esquerda > direita). A primeira forma prova que
   alguém escreveu um texto; a segunda prova o desenho, e continua valendo se o canvas mudar
   de 34 para 36.
