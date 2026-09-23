# Tarefa 43 — A anotação do dia, e o editor que perde a caixa

> **Sexta fatia do MVP 3.5, e a que o `docs/new-ui.md` chama de "a tela que justifica o
> projeto"** (§A.10, fase 4: *"é a tela que justifica o projeto, faça antes das outras"*).
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** ·
> **`docs/EDITOR.md` inteiro** — ⚠️ **é o contrato do editor, e esta fatia o emenda** ·
> `docs/tasks/42-o-shell.md`, as **notas de reconciliação** — ⚠️ **é o mapa do que dá errado
> aqui**, e ele nomeia a classe que se repetiu nas três últimas fatias: **não reler a própria
> medição antes de escrever a frase que a resume** · `docs/CONVENCOES-CODIGO.md` §7.1, §7.4,
> §7.9 · `docs/adr/0001-doc-prosemirror-json.md`.

---

## ⚠️⚠️ O que esta fatia NÃO pode tocar, e é a regra que vale mais que todas as outras

**Autosave e fila offline não mudam.** O §A.5 item 1 do `new-ui.md` diz, literalmente:
*"Autosave e fila offline **não mudam** — só o indicador"*. E o `docs/new-ui.md` põe os dois
em **"Fora de escopo"** junto com schema e endpoints.

Concretamente, ficam intocados:
- `AUTOSAVE_DELAY_MS = 1500` e `SAVED_RESET_MS = 2000` (`day-note.tsx`);
- o debounce, o flush no desmonte, e a máquina de `SaveStatus`
  (`idle | saving | saved | queued | unconfirmed | error`);
- `packages/app/src/offline/*` inteiro — `store.ts`, `queue.ts`, `offline-notes.tsx`;
- o contrato de `onChange` do `RichEditor` (ProseMirror JSON, nunca HTML; não emite ao
  montar, ao virar `editable`, nem ao receber `doc` por prop).

⚠️ **Se um passo parecer exigir mexer nisso, PARE e reporte.** O que muda é **como o estado
de salvamento aparece**, não como ele é calculado.

---

## ⚠️ A decisão de arquitetura da fatia: como uma barra FORA do editor comanda o editor

O canvas tira a barra de formatação de dentro da caixa e põe, fixa na tela, **as 5 canetas +
`Aa` + `/`** — no celular ancorada acima do teclado (62px), no desktop no rodapé da coluna
(56px). Mas quem tem a instância do TipTap é o `RichEditor`, e o contrato dele diz, por
escrito, que **nenhuma ref imperativa é exposta** (`docs/EDITOR.md` §3).

Três saídas foram consideradas:

| saída | veredito |
| --- | --- |
| a tela recebe a instância por `onReady(editor)` e renderiza a barra | ❌ **quebra o contrato declarado** e põe comando de editor dentro de `packages/app`, onde a regra §4.4 (o `preventDefault` que mantém o teclado aberto) não é varrida por `editor-touch-handlers.test.ts` |
| a barra vira `children` com render-prop que recebe o `editor` | ❌ mesmo problema: o botão nasce fora do grafo que a guarda percorre |
| ✅ **o `RichEditor` continua dono da barra e ganha uma prop de POSIÇÃO** | A barra é filha dele, dentro do grafo que as guardas varrem; a tela só diz **onde** ela fica. É a saída que preserva o contrato e a §4.4 |

**Decidido: `RichEditor` ganha `penBar?: 'fixed' | 'footer' | 'none'`** (`'none'` é o padrão,
para o editor de comentário do grifo e para o modo leitura).

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | **A barra fixa de formatação MORRE.** O que formata é o menu de bolha na seleção, mais o menu `/` que já existe | §A.5 item 1. ⚠️ **`EditorToolbar` sai; `BubbleControls` CRESCE** para o conjunto do canvas: **B · I · `<>` · H1 · H2 · citação · …** (`Dia.dc.html:60-67`) |
| **B** | **O editor perde a caixa**: sem borda, sem fundo, sem raio | `Dia.dc.html:70` — o texto senta no papel da página. Hoje a tela passa `className="rounded-control border border-line bg-surface"` (`day-note.tsx`), e é ela que some |
| **C** | **Serifa de leitura: 17,5px/1,72 no celular, 19px/1,75 acima de 1120px, medida máxima 620px** | `Dia.dc.html:70` e `DiaDesktop.dc.html:64`. ⚠️ **17,5 e 19 não estão na escala de sete degraus** — é a mesma família de divergência que a 41b registrou para a lombada. Declare, não invente degrau |
| **D** | **`penBar='fixed'` no celular, `'footer'` no desktop — e é UMA prop, não duas telas** | `Dia.dc.html:114` (62px, fixa) e `DiaDesktop.dc.html:76` (56px, `border-top`, no rodapé da coluna). ⚠️ **Sem ramificação por dispositivo**: media query e só |
| **E** | ⚠️ **`Aa` abre os MESMOS controles do menu de bolha**, ancorados na barra | É o que faz a formatação existir quando não há seleção. **Um só conjunto de controles, duas âncoras** — se virarem duas listas, elas divergem na primeira correção (é o `GUILT_TERMS` de novo) |
| **F** | **`/` insere o caractere e abre o menu `/` que já existe** | `slash-command.ts` não muda. O botão é um atalho para quem não tem teclado físico |
| **G** | **O indicador de salvamento vira nota de margem em mono** | `Dia.dc.html:56`: mono 9,5px, `uppercase`, `letter-spacing:.1em`, `--text-subtle`. ⚠️ **Use o `SaveIndicator` da 41b — não escreva um segundo** |
| **H** | ⚠️ **`pages.dayNote.save.savedAt` ("Salvo {{time}}") passa a ser usado** | A chave nasceu na Tarefa 40 e nunca teve consumidor. A hora sai do relógio local, pelo mesmo caminho que o resto do app usa. ⚠️ **Nenhuma chave nova** |
| **I** | **A margem do desktop ganha conteúdo: "O que o clube escreveu" e "Grifos desta leitura"** | `DiaDesktop.dc.html:96-140`. É a primeira tela a passar `rail` ao `Screen` — a capacidade nasceu na 42 sem consumidor |
| **J** | ⚠️ **A invariante §11 continua valendo: nenhum irmão do container monta ou desmonta** | O TipTap reparenteia o menu de bolha para o `body`, e montar/desmontar irmão dá `NotFoundError`. `rich-editor-image.test.tsx` mede isso em todos os estados — **a barra nova entra nessa conta** |
| **K** | ⚠️ **A regra §4.4 vale para todo botão novo**: `onMouseDown` + `onTouchEnd` com `preventDefault`, nunca `onClick` | Sem isso o teclado do celular fecha a cada toque, e o `new-ui.md` diz que o app é usado *"à noite, na cama"*. `editor-touch-handlers.test.ts` percorre o **grafo de módulos** — a barra nova cai nele por construção |
| **L** | **O chunk de entrada quase não muda; quem paga é o chunk do EDITOR** | Medido: o editor é lazy (`lazy(() => import('@clube/ui/editor'))`) e vive em chunk próprio (453.606 B). ⚠️ **Mas o `rail` da decisão I entra pela TELA, que é entrada** — meça os dois |

---

## As medidas, e de onde tirá-las

⚠️ **Extraia dos artboards em disco, cite arquivo e linha, e CONFIRME que a linha citada é o
elemento que você pensa.** Na 42, cinco citações estavam erradas — quatro achadas pela
auditoria e uma pelo próprio executor, ao reconferir as 45 com um script que **imprime a
linha citada**. Faça isso desde o começo.

| peça | artboard |
| --- | --- |
| corpo de leitura | `Dia.dc.html` (17,5px/1,72) · `DiaDesktop.dc.html` (19px/1,75, `max-width:620px`) |
| menu de bolha | `Dia.dc.html` — a fileira de 44×44 com separadores, o papel, a borda, o raio, a sombra e a seta de 12×7 |
| barra de canetas, celular | `Dia.dc.html` (62px, fixa, as 5 canetas de 22×22 com o anel de selecionada) |
| barra de canetas, desktop | `DiaDesktop.dc.html` (56px, `border-top`, canetas de 20×20, e a dica do `/` à direita) |
| indicador de salvamento | `Dia.dc.html` (celular) e `DiaDesktop.dc.html` (desktop) |
| margem | `DiaDesktop.dc.html` — "O que o clube escreveu" e "Grifos desta leitura" |
| grifo no texto | `Dia.dc.html` — o `GrifoText` da 41b já existe, **reuse** |

---

## As regras

1. **TDD estrito.** Teste primeiro, vermelho colado, implementação mínima, verde colado.
   ⚠️ **E o TDD vale para o `packages/ui` também** — na 42 um componente do cromo nasceu antes
   do teste, e o executor teve de comprar a prova com um mutante.

2. ⚠️⚠️ **A regra de ouro tem acusador.** Escreva um teste que prove que **o autosave não
   mudou**: os dois números (1500/2000), a máquina de estados e o flush no desmonte.
   **Mutante:** troque `AUTOSAVE_DELAY_MS` por 3000 → tem de acusar. Se nada acusar hoje,
   **escreva o acusador antes de mexer em qualquer outra coisa**.

3. **A decisão A com os dois sentidos (§7.1).** A barra fixa **some** e o menu de bolha
   **cresce**. **Mutantes:** (i) devolver a `EditorToolbar` → acusa; (ii) tirar um controle do
   menu de bolha → acusa.

4. ⚠️ **A decisão E com teste de IDENTIDADE, não de presença.** O conjunto do `Aa` e o do menu
   de bolha têm de ser **a mesma lista** — compare as duas renderizações, não duas cópias
   escritas no teste. **Mutante:** acrescente um controle a um só → tem de acusar.

5. ⚠️ **A decisão J, e ela é a que quebra a tela inteira quando erra.** `rich-editor-image.test.tsx`
   já mede "nenhum irmão monta ou desmonta em nenhum estado". **Estenda para a barra nova**, e
   rode o mutante: fazer a barra montar condicionalmente → tem de acusar.

6. ⚠️ **A decisão K por varredura, não por revisão.** `editor-touch-handlers.test.ts` percorre
   o grafo de módulos do editor e proíbe `onClick` em botão. **Confirme que a barra nova cai
   nessa varredura** — e se não cair, o certo é a varredura crescer, não a barra escapar.

7. **A decisão I sem chave nova.** "O que o clube escreveu" e "Grifos desta leitura" já
   existem no catálogo (`pages.dayNote.others.heading` e
   `pages.dayNote.highlights.heading`, esta última nascida na Tarefa 40 sem consumidor).

8. ⚠️ **O corte de tenant continua sendo o que mais se esquece.** Esta tela já resolve o nome
   pelo clube **do livro** desde a 42, com fixture hostil. **Não regrida**: se você tocar o
   efeito dos membros, o acusador (`⚠️ asks the club OF THE BOOK, not the ACTIVE one`) tem de
   continuar mordendo.

9. ⚠️ **A varredura anti-culpa nos estados novos.** `expectNoGuilt()` em todos, e — quando o
   sumário do plano chegar na 44 — a variante `expectNoGuiltWithPlanPosition()`. Aqui:
   `expectNoGuilt()` no estado com a barra, no estado com o menu de bolha aberto, e no
   estado offline.

10. ⚠️ **`docs/EDITOR.md` é emendado, com riscar-e-explicar e data:** o §4.1 (a barra fixa
    morre), o §4.2 (o menu de bolha cresce), o §4.4 (continua valendo, e passa a valer para a
    barra de canetas) e o §13 (os tokens, que a Tarefa 39 já corrigiu uma vez).
    ⚠️ **E o §10** — a Tarefa 40 registrou lá a exceção do `editor.slashHint`, que agora ganha
    consumidor.

11. **Gates, com os números medidos ao fim da 42 (2026-09-22, tudo verde):**

    | | arquivos | testes |
    | --- | --- | --- |
    | `@clube/shared` | 22 | **601** |
    | `@clube/ui` | 33 | **284** |
    | `@clube/backend` (unit) | 85 | **1975** |
    | `@clube/app` | 35 | **898** |

    Build: entrada **438.586 B** (teto 450.000 — sobram **11.414**) · CSS **33.982 B** ·
    `index.html` **1.638 B** · precache **26 / 1187,26 KiB** · editor **453.606 B** pelo `ls`.
    ⚠️ **Meça os DOIS chunks.** O editor é lazy e tem teto próprio? Confira no
    `bundle-guard.test.ts` antes de gravar. Se o de entrada passar de 450.000, **pare**.

12. **Nenhuma migration, nenhum endpoint, nenhum schema, nenhuma rota nova.**

---

## Definição de pronto

- [x] O autosave e a fila offline **provadamente intocados** — o acusador da regra 2 existe e
      o mutante do 1500 acusou.
- [x] A barra fixa morreu; o menu de bolha tem o conjunto do canvas, com arquivo e linha.
- [x] `Aa` e o menu de bolha renderizam **a mesma lista**, provado por identidade.
- [x] O editor sem caixa; a serifa nos dois corpos, com a divergência da escala declarada.
- [x] `penBar` nas três formas, e a de `'none'` testada (o comentário do grifo não ganha barra).
- [x] A invariante §11 continua verde **com a barra nova incluída na conta**.
- [x] Nenhum `onClick` em botão do editor — provado pela varredura de grafo.
- [x] O `SaveIndicator` da 41b em uso; `savedAt` com consumidor; **nenhuma chave nova**.
- [x] A margem do desktop com as duas seções; `Screen` recebe `rail` pela primeira vez.
- [x] `expectNoGuilt()` nos estados novos.
- [x] O corte de tenant não regrediu.
- [x] `docs/EDITOR.md` emendado (§4.1, §4.2, §4.4, §10, §11, §13) com riscar-e-explicar.
- [x] Gates verdes, **com os dois chunks medidos** e o custo de cada peça.
- [x] Varredura de caracteres invisíveis sobre os arquivos do diff, **provando antes que ela
      morde** com um soft hyphen e um NBSP plantados.

---

## Notas de reconciliação (2026-09-22, medidas na execução)

> Esta seção **não reescreve nada acima**. Ela registra o que foi **medido** ao executar, nos
> pontos em que a spec ou o canvas descreviam outra coisa. Molde: a seção equivalente das
> Tarefas 39, 40, 41a, 41b e 42.

### 1. ⚠️ CINCO das seis citações de artboard da spec estão erradas — os NÚMEROS, não

A tabela "As medidas, e de onde tirá-las" e as decisões B, C, D e G citam seis linhas.
**Medidas por um script que IMPRIME a linha citada** (270 linhas conferidas, em 11 arquivos):

| a spec diz | é | o que está de fato na linha da spec |
| --- | --- | --- |
| `Dia.dc.html:70` (o corpo, decisão B) | **`:59`** | o botão "Citação" do menu de bolha |
| `Dia.dc.html:60-67` (o menu de bolha, decisão A) | **`:64-73`** | `:60` é linha em branco e `:61` é um `<p>` do texto |
| `Dia.dc.html:114` (a barra de 62px, decisão D) | **`:103`** | o botão "Caneta azul" |
| `DiaDesktop.dc.html:64` (19px/1,75, decisão C) | **`:63`** | um `<p>` do corpo |
| `DiaDesktop.dc.html:76` (a barra de 56px, decisão D) | **`:72`** | um `</button>` |
| `Dia.dc.html:56` (o indicador, decisão G) | **`:56`** ✅ | está certa |

Os **números** da spec (17,5/1,72 · 19/1,75 · 620px · 62px · 56px · 9,5px) estão todos
**certos** — conferidos um a um no artboard.

### 2. ⚠️⚠️ O CANVAS DESENHA UM SÉTIMO BOTÃO NO MENU DE BOLHA, E ELE NÃO FOI FEITO

A decisão A escreve o conjunto como *"B · I · `<>` · H1 · H2 · citação · …"*. O "…" final
**não é reticência de prosa**: `Dia.dc.html:71` é
`<button aria-label="Mais opções">…</button>`, um sétimo botão de 44×44.

**Não implementado, e é divergência declarada, não esquecimento.** O artboard é estático e
não diz para onde ele leva; e tudo o que um "mais opções" de editor conteria — lista, lista
numerada, tarefas, bloco de código, divisória, tabela, aviso, alternável — é **exatamente** o
menu `/`, que a decisão F mantém intacto e que ganhou botão próprio na barra de canetas. Um
segundo caminho para a mesma lista é decisão de produto. ⚠️ **E este achado veio do script de
citações**, não de leitura: a primeira versão desta entrega citava `:65-71` para SEIS
controles.

### 3. ⚠️ A divergência de escala da decisão C é METADE do que a spec diz

A decisão C avisa que *"17,5 e 19 não estão na escala de sete degraus"*. **Medido no
`theme.css`:** `--size-reading: 17.5px` **existe**, e nasceu na Tarefa 39 com este comentário
ao lado — *"Fraunces: a coluna de leitura (§A.6 diz 17,5px/1,72 no celular)"*. Quem não existe
é o **19px**, que ficou como literal no `editor.css`, declarado.

Divergências novas da mesma família, todas declaradas: os seis botões do menu de bolha usam
**quatro** corpos no canvas (16 · 13 · 14 · 24px) e saíram em três degraus (16 · 14 · 25); o
raio do papel do popover é 5px no canvas e saiu em `--r-3` (4px).

### 4. ⚠️ A amostra da caneta continua pintada com `--swatch`, e NÃO com `--pen-a`

O canvas pinta as bolinhas com os tokens de caneta (`Dia.dc.html:106`). Dentro do editor isso
seria **mentira**: o grifo do editor é um `mark` que carrega o `rgba` no próprio documento, e
a amostra tem de mostrar a cor que a caneta **aplica**. Os `--pen-*` pintam a entidade
`Highlight` (o `GrifoText`), que é outra coisa — o `docs/BACKLOG.md` diz isso com todas as
letras ("o canvas define como a cor é **pintada**, nunca o que é **guardado**").

~~Trocar apagaria **dois** acusadores que leem a cor real pelo `--swatch`: o espelho do ADR
0004 em `packages/shared` e o `highlight-palette.test.tsx`.~~

⚠️ **SÃO UM, e o número caiu na auditoria — a decisão está certa, o argumento estava pela
metade.** Medido com o mutante que troca a amostra por `bg-pen-a` e tira o `style` inline:
`@clube/ui` dá **7** vermelhos, **todos** em `highlight-palette.test.tsx`, e `@clube/shared`
fica **601/601 VERDE** — o espelho do ADR 0004 lê os literais `rgba` do **fonte** do
`RichEditor.tsx`, e nunca tocou o `--swatch`.

O que **veio** do canvas foi a geometria: 22px/20px, filete de 1,5px e o **anel de ouro** da
caneta ligada, no lugar do `border-color: var(--text)`.

### 5. ⚠️ Os rótulos viraram "Caneta …", e isso tocou TRÊS guardas de outros pacotes

O canvas nomeia os cinco botões `aria-label="Caneta amarela"`… (`Dia.dc.html:105`), e é o
vocabulário que o MVP 3.5 já usava nos tokens `--pen-*` e no `GrifoText`. A troca obrigou a
mexer em três arquivos de teste **fora** da fatia, cada um com o motivo escrito ao lado:
`highlight-palette.test.tsx` (o pino da paleta, que também passou a pedir `penBar="fixed"` —
sem barra não há amostra), `shared/__tests__/highlight-color.test.ts` (a pré-condição do
espelho do ADR 0004) e `no-hardcoded-ui-text.test.ts` (a amostra do lado positivo).

### 6. ⚠️ O teto de texto cravado BAIXOU de 33 para 29, e a regra manda baixá-lo junto

Medido arquivo a arquivo pelo extrator da própria guarda: `RichEditor.tsx` foi de **18** para
**14** ocorrências (saíram os cinco rótulos que só existiam na barra fixa — `Lista`,
`Lista numerada`, `Bloco de código`, `Divisória`, `Remover grifo` — e as duas repetições do
menu de bolha; entraram `Formatar o texto`, `Abrir o menu de blocos` e o glifo `Aa`), e os
outros três arquivos não mudaram.

### 7. ⚠️ A borracha saiu, e a capacidade não

O canvas não desenha borracha em barra nenhuma. O `toggleHighlight({ color })` do TipTap
**desliga** quando aquela cor exata já está ligada: tirar o grifo é apertar de novo a caneta
que está com o anel. O acusador é novo e nasceu junto
(`rich-editor.test.tsx › …and the same pen UNDOES it`) — sem ele, "não há mais como tirar um
grifo" passaria verde.

### 8. ⚠️ A identidade da decisão E tem DUAS metades, e a primeira não é possível como render

Medido: o conteúdo do menu de bolha **não é alcançável** por `document.querySelector` no
jsdom. O `BubbleMenuView` chama `element.remove()` no construtor e o tippy só reanexa o
elemento ao `body` quando MOSTRA, o que depende de layout — **zero** `[data-tippy-root]`
depois de selecionar e disparar `mouseup`. Então a identidade é: (a) o `Aa` renderizado contra
`FORMAT_CONTROLS` **importada da produção**, mais um pino escrito à mão dos seis rótulos; e
(b) um acusador **estrutural** que exige uma só declaração de `FormatControls` e recusa um
`<ToolButton>` dentro de qualquer uma das duas âncoras.

⚠️ **E a metade (a) nasceu AUTO-AJUSTÁVEL (§7.8), medido pelo mutante:** apagando um controle
da lista, os dois lados da igualdade encolhiam juntos e ela ficava verde — o único acusador
era a pré-condição de contagem, que não diz QUAL sumiu. Daí o pino à mão, no molde do
`EXPECTED_PALETTE`.

### 9. ⚠️ "A barra fixa morreu" não tinha acusador, e ele teve de nascer

Devolver a barra — um `<div sticky top-0>` com os controles dentro, antes do menu de bolha —
**passava por toda a suíte**. A invariante da §11 não a pega (um irmão SEMPRE montado é
legítimo, e o teste recalcula a linha de base) e o teto de texto cravado só a pegaria se ela
trouxesse rótulos novos junto. Nasceu
`pen-bar.test.tsx › mounts NO control above the text, and exactly SEVEN when the bar is asked
for`: com o editor editável e sem barra pedida, **zero** botões; com a barra, **sete**.

### 10. ⚠️ "Grifos desta leitura" custou uma requisição, e o corte por dia é no CLIENTE

`listHighlightsQuerySchema` **não tem `planItemId`**, e acrescentá-lo seria schema novo, que a
regra 12 proíbe. Então a tela pede `GET /clubs/:clubId/highlights?bookId=…` (a rota que o
`acervo.tsx` já usa) e corta por `planItemId === item.id` aqui.

⚠️ **~~Limite declarado: a rota é paginada e esta tela pede só a primeira página.~~ AS DUAS
METADES ERAM FALSAS, e a auditoria as derrubou.** Medido: **a rota não tem paginação** — sem
`limit`, sem `cursor`, sem envelope. O `page` do `listHighlightsQuerySchema` é a **página do
LIVRO** (um filtro do acervo), não um cursor; e o corte real é o
`FIND_ROW_LIMIT = 500` do `prisma-highlight-repository.ts:53,297`, com
`orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]`.

**E isso muda o veredito:** um grifo daquele dia só some da margem se o livro passar de
**500 grifos** e ele não estiver entre os 500 mais novos. Num clube de casal isso é
**registro, não defeito** — e a válvula é a mesma que a `busca.tsx` e o `acervo.tsx` já
declaram desde a Tarefa 29.

### 11. Três divergências de margem, declaradas

1. **O artboard de celular não desenha "Grifos desta leitura"** — só o de desktop o tem.
   Entregue nas duas larguras, porque a alternativa (esconder por media query) seria
   **invisível para o teste**: o jsdom não aplica CSS e a guarda ficaria verde com a seção
   apagada na tela. É a mesma classe do nome do clube que a Tarefa 42 registrou.
2. **O `MarginRail` vai sem `aria-label`**, que ele declara opcional: nomear a região exigiria
   uma chave de catálogo NOVA, e a regra 7 não permite nenhuma. O que se perde é o atalho de
   pular a região, não informação.
3. **O nome na linha do grifo sai do `nameOfWriter`, não "Você"** (`DiaDesktop:126`): é o
   caminho das outras sete telas, e uma segunda regra de autoria só para esta margem é como
   as duas divergem na primeira correção.

### 12. O segundo `Suspense`, com `fallback={null}`

A nota alheia continua sendo renderizada pelo editor de verdade em modo leitura (é a única
forma de o negrito e o grifo DELA aparecerem), e ela mudou de lugar — foi para a margem. Como
a margem é uma **prop** do `Screen`, ela precisa do seu próprio limite de suspensão. Ele vai
com `fallback={null}` de propósito: a coluna principal já diz "Abrindo o editor…", e uma
segunda cópia da mesma frase deixaria `queryByText` (que reprova com dois casamentos)
**vermelho** no acusador do chunk.

### 13. A varredura de invisíveis: 15 arquivos, zero ocorrências — e ela morde

Cobre NUL, NBSP, soft hyphen, ZWSP/ZWNJ/ZWJ, LRM/RLM, U+2028/U+2029, narrow NBSP, word
joiner, BOM e U+FFFD, com arquivo, linha e coluna. **Provado que ela morde antes de confiar
nela:** com um soft hyphen e um NBSP plantados num comentário do `RichEditor.tsx`, ela acusou
os dois (`RichEditor.tsx:243:11 SOFT HYPHEN`, `:243:12 NBSP`). O canário foi desfeito por
`cp -p`, com `md5sum` conferindo e `grep` por conteúdo.


---

## Notas de reconciliação — rodada de correção da auditoria (2026-09-22)

> A auditoria voltou com **zero bloqueadores de produto, 6 altos, 5 médios e 8 baixos**, e
> **seis mutantes novos sobreviveram** — cinco com consequência visível para quem usa.
>
> ⚠️ **A classe de erro desta rodada tem nome próprio, e não é a mesma das anteriores:** as
> três afirmações minhas que caíram eram **números medidos num instante e escritos como se
> fossem permanentes**. Nenhuma foi chute — todas saíram de um comando que rodou. O defeito é
> escrever o número sem dizer *de quando ele é*, e é isso que as torna impossíveis de conferir
> depois.

### 14. ⚠️⚠️ A barra de canetas não tinha acusador de PINTURA nenhum (A2)

O pior achado da rodada, e é de produto. Dois mutantes do revisor, com a suíte inteira verde:

| mutante | efeito na tela | antes |
| --- | --- | --- |
| apagar `[aria-pressed='true'] > .clube-editor-swatch` | a caneta ligada perde **qualquer** sinal | `ui` 299 ✅ · `app` 912 ✅ |
| apagar `.clube-editor-swatch` inteira | as cinco bolinhas deixam de pintar: **cinco alvos de 44px invisíveis** | `ui` 299 ✅ · `app` 912 ✅ · `shared` 601 ✅ — **1.812 testes sem ver** |

**Por que nada pegava, e é uma lição de DIREÇÃO:** o `highlight-palette.test.tsx` usa
`.clube-editor-swatch` apenas como **seletor**, para achar o elemento e ler o `style` inline —
ele prova que a cor certa CHEGA ao DOM, nunca que alguma regra a PINTA. E o
`editor-css.test.tsx`, único arquivo do pacote que monta o CSS no jsdom e mede
`getComputedStyle`, tinha três `it()` para o corpo de leitura e **zero** para a amostra — eu
escrevi o arquivo inteiro da serifa e não olhei para o lado.

Nasceu `editor-css.test.tsx › the pen bar paints`, com dois `it()`: o fundo/filete e o anel de
ouro. **Os dois mutantes acusam agora, 1 acusador cada.**

### 15. ⚠️ O `EDITOR.md` §6 documentava uma API que esta fatia apagou (A1)

`unsetHighlight` tinha **uma única ocorrência em todo o repositório**, e era a linha 366 do
contrato do editor — enquanto o §4.1, duzentas linhas acima e emendado por mim na mesma fatia,
dizia *"NÃO HÁ MAIS BORRACHA"*. O mesmo §6 ainda chamava a paleta de "constante do módulo"
(exportei-a) e descrevia a amostra como 20px com contorno `--clube-fg` (é 22/20px com anel de
ouro, e `--clube-fg` é um dos sete nomes que **nunca existiram**).

É a lição do `dayRange` **dentro do documento que existe para evitá-la**: o próximo agente
leria a linha e chamaria um comando que nenhum botão expõe. Riscado-e-explicado, com a tabela
era→é e o limite do gesto novo.

### 16. ⚠️ `mounts NO control above the text` media CONTAGEM, e o nome prometia POSIÇÃO (A5)

O revisor trocou a **ordem dos irmãos** — `<PenBar>` antes do `<EditorContent>` — e passou por
**299/299 e 912/912**. No desktop, onde `min-[1120px]:static` tira o `fixed`, isso é
**literalmente a barra do topo de volta**: a decisão A desfeita sem um vermelho. A invariante
da §11 também não pega, porque ela captura a linha de base **depois** da troca e compara
consigo mesma.

Acusador novo no mesmo `it()`, por `compareDocumentPosition`. **1 acusador.**

### 17. ⚠️ Os dois rótulos da margem saíram fora do canvas e fora da escala (A6)

Eles usavam `text-sm font-semibold text-muted`, e `text-sm` é o **default do Tailwind** — não é
um dos sete degraus da escala fechada da Tarefa 39. O canvas desenha os **três** rótulos desta
tela iguais, valor a valor (`Dia.dc.html:55`, `DiaDesktop.dc.html:99` e `:113`): mono **10px**,
`0.12em`, uppercase, `--text-muted` — que é exatamente o `Eyebrow` da Tarefa 41b, um
componente com **zero** consumidores em `packages/app`.

⚠️ **Corrigidos os TRÊS, e não só os dois que a auditoria nomeou.** Deixar "Sua anotação" em
`text-sm` daria à mesma tela duas tipografias de rótulo de seção — a "correção incompleta" que
a auditoria da 41b nomeou como classe, e o mesmo defeito que a da 42 achou nos `h1`.

⚠️ **E o `<h2>` FICA.** O `Eyebrow` é um `<span>` por decisão escrita: *"a tipografia do
rótulo, não a semântica dele"*. Estas três SÃO seções, então o `<h2>` embrulha o componente.

### 18. ⚠️ As TRÊS afirmações minhas que caíram, e o que cada uma media de verdade

**(A3) "Trocar o `--swatch` apagaria DOIS acusadores".** São **um**. Medido com o mutante que
troca a amostra por `bg-pen-a` e tira o `style` inline: `@clube/ui` dá **7** vermelhos,
**todos** em `highlight-palette.test.tsx`, e `@clube/shared` fica **601/601 VERDE** — o espelho
do ADR 0004 lê os literais `rgba` do **fonte** do `RichEditor.tsx`, e nunca tocou o `--swatch`.
⚠️ A decisão de manter o `--swatch` **está certa**; o argumento estava pela metade. Corrigido
nos quatro lugares.

**(A4) "Devolver a barra fixa passava por 299 testes".** O **299 é a contagem DEPOIS** dos
`it()` que esta fatia acrescentou, e a frase alegava descrever o estado **antes** deles.
Medido: o mutante dá **3 acusadores**, dos quais **2 são colaterais** e existiriam sem o
arquivo novo (o `getByLabelText` acha dois "Negrito"). O deliberado é **um**.

**(M5) "A rota de grifos é paginada e a tela pede só a primeira página".** **As duas metades
eram falsas.** A rota **não tem paginação** — sem `limit`, sem `cursor`, sem envelope; o `page`
do `listHighlightsQuerySchema` é a **página do LIVRO**, um filtro do acervo. O corte real é o
`FIND_ROW_LIMIT = 500` de `prisma-highlight-repository.ts:53,297`, com
`orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]`.
⚠️ **E isso muda o veredito:** um grifo do dia só some se o livro passar de **500 grifos** e
ele não estiver entre os 500 mais novos. Num clube de casal é **registro, não defeito**.

### 19. Os outros médios e baixos

- **a lista de tokens do §13 ficou errada nos DOIS sentidos** — eu acrescentei tokens em PROSA
  e não mexi na LISTA, que é o que alguém lê. Remedida: **53 ocorrências em 51 linhas**,
  descartadas as duas que só aparecem em comentário (`var(--token)`, `var(--pen-a-dot)`), **17**
  tokens, todos conferidos um a um contra o `:root`. Saiu `--bg` (zero ocorrências desde que a
  barra do topo morreu); entraram `--border-soft`, `--r-3`, `--gold`, `--family-reading` e
  `--size-reading`;
- **o §3 não tinha `penBar` nem `slashHintLabel`** — e o §3 é justamente o contrato que a
  decisão de arquitetura da fatia cita como razão de existir. Agora tem as quatro props e a
  tabela das três saídas;
- **o §14 pedia "a barra visível no topo" e "a borracha limpa"** — duas linhas impossíveis.
  Riscadas, e nasceram duas: o `Aa` e o gesto de tirar o grifo;
- **`shared/highlight-color.test.ts` dizia que `HIGHLIGHT_COLORS` "não é exportada"**, num
  arquivo que editei e num símbolo que exportei. Riscado, com o motivo de o espelho continuar
  lendo o ARQUIVO (`packages/shared` é o pacote sem deps internas);
- **`data-editor-bubble` era gancho morto** — nenhum teste o lia, e o `.clube-editor-row` já
  identifica o elemento. Saiu. O `data-editor-separator` ganhou leitor (o `ml-auto`);
- **o separador do desktop** é 20px/10px no canvas (`DiaDesktop.dc.html:89`) e sai 22px/8px nas
  duas larguras — divergência declarada;
- **dois arredondamentos da margem**, declarados: o trecho grifado é 14,5px (`:120`) e sai
  `text-ui` (14px); o rótulo mono é 9px (`:118`) e sai `text-micro` (9,5px);
- **o docblock do `ToolButton` dizia "seis" citando `:65-71`**, que são **sete** linhas — o
  número dos controles implementados é seis, o do canvas é sete;
- **o piso do lado positivo voltou a ter tensão**: `> 25` deixava quatro ocorrências sumirem em
  silêncio com o teto em 29; agora é `> 28`;
- **o limite do gesto com CURSOR COLAPSADO fica escrito** (§6 e `RichEditor.tsx`): sem seleção,
  o `toggleMark` não estende a marca (`extendEmptyMarkRange` é `false`), então apertar a caneta
  ligada não tira nada e o `aria-pressed` mente. **Não é regressão** — a borracha antiga tinha
  o mesmo limite —, mas agora é o único caminho.

### 20. ⚠️ A divergência declarada que estava DESPROTEGIDA

"Grifos desta leitura" nas duas larguras é decisão minha, declarada na nota 11.1 — e escondê-la
com `hidden min-[1120px]:flex` **sobrevivia**. É a terceira vez que este repositório paga por
isso (o nome do clube no cabeçalho e a compensação de 48px da home, as duas na auditoria da
42). Guarda nova, no molde daquela: a `className` da seção **não** contém `hidden`.

⚠️ **Divergência declarada sem guarda é a próxima fatia a desfazê-la sem querer.**
