# Tarefa 46 — Acervo e Busca: seis dimensões recolhem numa linha, e a busca não ganha número

> **Décima fatia do MVP 3.5, e a mais cara.** `acervo.test.tsx` tem ~~2.845~~ **2.847 linhas** e
> `acervo.tsx` **511** pelo contador canônico. ⚠️ **Esta fatia muda QUEM DESENHA os
> controles, não o que eles filtram.**
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** e a
> entrada **46** · ⚠️⚠️ **`packages/ui/src/components/filter-bar.tsx:110-128`** — é um
> bilhete escrito **para esta tarefa**, com uma instrução literal · `docs/tasks/45-inicio.md`,
> as notas da rodada de correção (o teste de **token** para `hidden`) ·
> `docs/adr/0002-visibilidade-total-no-clube.md` · `docs/CONVENCOES-CODIGO.md` §7.1, §7.3,
> §7.4, §7.9, §7.10.

---

## ⚠️ O bilhete que a Tarefa 41a escreveu para você

`filter-bar.tsx:126-128`, literal:

> *"**O que a Tarefa 46 tem de fazer quando ligar o `collapsed`:** o estado recolhido da tela
> do acervo cai no `expectNoGuilt()` como qualquer outro estado dela. É lá que a frase passa
> a existir para a varredura de DOM."*

O contexto (`:110-125`) mede por que: a frase de resumo **não passa por guarda anti-culpa
nenhuma** hoje — a varredura vive em `packages/shared` e é exercitada pelos testes de tela do
`packages/app`, e não existe uma em `packages/ui`. O risco atual é baixo **por medição**, não
por sorte: o separador é ` · `, que não casa o `\d+ de \d+`. **Mas a partir desta fatia a
frase existe numa tela, e é lá que ela tem de ser varrida.**

⚠️ **E as props já existem.** `FilterBarProps` (`:92-93`) é **união discriminada**:
`{ collapsed?: false; onRefine?: never; refineLabel?: never }` ou
`{ collapsed: true; onRefine: () => void; refineLabel: string }`. Uma barra recolhida sem
`onRefine` **não compila** — é beco sem saída por construção. E `summaryOf()` (`:130-139`) já
junta os rótulos selecionados com ` · `, que é exatamente o que o canvas desenha.

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | **A faixa do acervo: linha de resumo + "Refinar" + chips removíveis** | `Acervo.dc.html:56` é a faixa (`border-top`/`border-bottom` de `--border-soft`, `padding:12px 0`, `gap:9px`); `:58` é o resumo (mono 10px, `0.08em`, maiúsculo, `--text-muted`) — no exemplo, `De todo mundo · Tudo · Todas as cores`; `:59-62` é o botão "Refinar" (36px, pílula, `--border`, ícone de linhas horizontais = `SlidersHorizontal`); `:64-66` é a fila de chips (30px, `--surface-2`, `--border`, pílula), com `Cap. 4` como exemplo |
| **B** | ⚠️ **O PAINEL que o "Refinar" abre NÃO é desenhado no artboard** | Medido: `grep -in "refinar"` nos 21 artboards devolve **uma** linha, `Acervo.dc.html:61` — o botão. O conteúdo do painel é lacuna, e **você a preenche**: **bottom sheet no celular** (o `Sheet` da 41a, com `open`/`onClose`/`title`/`closeLabel`) e **painel na margem no desktop**. ⚠️ **Declare que preencheu uma lacuna**, não a apresente como fidelidade |
| **C** | ⚠️ **Não existe `AcervoDesktop.dc.html` nem `BuscaDesktop.dc.html`** | Medido: os 21 artboards não os têm. O desktop destas duas telas é **derivado** do padrão que as fatias 42–45 já fixaram (coluna de 680px + margem de 320px acima de 1120px). **Declare** |
| **D** | ⚠️⚠️ **A CONTAGEM DE RESULTADOS NÃO ENTRA — decisão do dono, 2026-09-23** | `Busca.dc.html:60` desenha `3 resultados em todo o clube`. O dono decidiu **manter a proibição**: a decisão G fica de pé e **o canvas diverge**. `busca.test.tsx:986` (`shows NO result count anywhere, in any state`) continua valendo e **não se toca**. ⚠️ **Registre a divergência por escrito** — ela é escolha, não esquecimento |
| **E** | ⚠️ **A busca NÃO ganha faixa** | Medido: "Refinar" só existe no acervo. A busca continua com o campo único. **Não amplie o escopo** |
| **F** | ⚠️⚠️ **O modelo puro de `acervo-entries.ts` NÃO MUDA** | São **seis** dimensões em `AcervoFilter` (`:592-601`): `author`, `type`, `color`, `reading`, `text`, `page`. O que muda é **quem desenha os controles**. ⚠️ **Prove que o arquivo não foi tocado**, por `git diff` |
| **G** | ⚠️⚠️ **A visibilidade condicional dos controles TEM de sobreviver** | Hoje `typeCanCarryReading(typeFilter)` e `highlightApplies` decidem se os controles de leitura e de cor **existem** (`acervo.tsx:794` — ⚠️ ~~`:876`, `:926`~~ **são COMENTÁRIO; o código é `:793`, `:794`, `:859`, `:939` e `:958`**, nota 2). Recolher num painel **não pode** transformar isso em "sempre visível" — e a **linha de resumo** tem de refletir só o que está em jogo. É a decisão E de uma fatia anterior; **leia antes de mexer** |
| **H** | **Os chips são removíveis, um por dimensão** | `Acervo.dc.html:64-73`. Remover um chip mexe **só** na dimensão dele |
| **I** | **Nenhuma migration, endpoint ou schema.** Nenhuma chave nova sem me dizer qual | É fatia de tela |

---

## As medidas, e de onde tirá-las

⚠️ **Escreva o script que imprime a linha citada ANTES da primeira citação.** Nesta série ele
já pegou cinco citações erradas na 42, cinco mais um botão escondido na 43, um erro meu de
bytes na 44c e **quatro erros meus** na 45. Conferi as citações abaixo uma a uma — **confira
de novo**.

| peça | onde |
| --- | --- |
| a faixa | `Acervo.dc.html:56` |
| a linha de resumo | `:58` |
| o botão "Refinar" | `:59-62` |
| a fila de chips | ~~`:64-66`~~ **`:64-73`** — são DOIS chips (nota 2) |
| a contagem que **não** entra | `Busca.dc.html:60` |
| as três dimensões de chip | `acervo-filters.tsx:193` (`person`), `:202` (`type`), `:219` (`color`) |
| a leitura, que é `<select>` | ~~`:445-499`~~ **`acervo-filters.tsx:474-507`** (nota 2) |
| o texto | `acervo-filters.tsx:292` (`TextFilter`) |
| a faixa de página | `acervo-filters.tsx:405` (`PageRangeFilter`) |
| o `Sheet` | `packages/ui/src/components/sheet.tsx:32-39` |
| o resumo pronto | `filter-bar.tsx:130-139` (`summaryOf`) |

⚠️ **Os tamanhos de 10px e 30px/36px:** case contra os sete `--size-*` e os raios antes de
inventar valor arbitrário. A 45 mediu que a escala é **9.5 · 10 · 11 · 14 · 15 · 17.5 · 25**
(`theme.css:447-458`). Se algo não bater, **declare**.

---

## As regras

1. **TDD estrito**, e vale para `packages/app`. **Vermelho colado** para cada guarda nova.

2. ⚠️⚠️ **A instrução do bilhete, cumprida: o estado RECOLHIDO cai na varredura anti-culpa.**
   **Mutante obrigatório:** ponha um rótulo culposo numa opção e recolha a barra → o
   `expectNoGuilt()` do estado recolhido tem de acusar. ⚠️ **Se ficar verde, o bilhete da 41a
   não foi cumprido e a frase de resumo continua sem guarda nenhuma** — e aí o achado é maior
   que a fatia: reporte.

3. ⚠️⚠️ **A decisão D com acusador, e um aviso sobre o acusador.** A contagem **não entra**.
   **Mutante:** escreva `3 resultados` na busca → `busca.test.tsx:986` tem de acusar.
   ⚠️ **MAS MEÇA ANTES:** aquele teste usa `/\b5\s+resultados?\b/iu` — o **5** é a contagem do
   fixture, escrita à mão. Se o seu mutante usar outro número, a guarda **não morde** e você
   terá provado nada. **Diga se ela é frágil e, se for, proponha a correção** — é a classe
   "guarda que deixa de casar qualquer coisa e continua verde".

4. ⚠️ **A decisão G com acusador nos DOIS sentidos.** **Mutante (i):** o controle de leitura
   passa a existir para um tipo que não carrega leitura → acusa. **Mutante (ii):** ele some
   de um tipo que carrega → acusa. ⚠️ E a **linha de resumo** tem de acompanhar: **mutante
   (iii)** o resumo cita uma dimensão fora de jogo → acusa.

5. ⚠️ **O par recolhido × aberto guardado dos DOIS lados.** Este bloco já pagou **quatro**
   vezes por par guardado pela metade (duas lombadas e a legenda na 44, o link na 44b, a
   margem na 45). **Mutante:** o painel nunca abre → acusa. **Mutante:** o painel já nasce
   aberto → acusa.

6. ⚠️ **Guarda de visibilidade por TOKEN, não por regex.** A rodada de correção da 45 mediu
   que `/(^|\s)(min-\[1120px\]:)?hidden(\s|$)/u` acerta **6 de 13** variantes e deixa passar
   `max-[1119px]:hidden`, `sm:`, `md:`, `print:` e `[@media…]:`. Use:
   ```ts
   node.className.split(/\s+/u).some((c) => c.split(':').at(-1) === 'hidden')
   ```
   **Mutante:** esconda a faixa com `max-[1119px]:hidden` → tem de acusar.

7. **Os chips removíveis, um por dimensão.** **Mutante:** remover um chip limpa **todas** as
   dimensões → acusa.

8. ⚠️ **A varredura anti-culpa em TODOS os estados das DUAS telas**, incluindo os vazios. O
   acervo vazio *"fala do que dá para fazer — nunca do que a pessoa deixou de registrar"*
   (`acervo.tsx:209-214`). **Mutante:** troque o vazio por uma frase de cobrança → acusa.

9. ⚠️ **O ADR 0002 intacto: o filtro é NAVEGAÇÃO, não permissão.** **Mutante:** rotule o
   painel com vocabulário de privacidade → `adr-0002-iconography.test.ts` tem de acusar.

10. ⚠️ **`acervo-entries.ts` NÃO é tocado**, provado por `git diff`. Se você achar que precisa,
    **pare e me diga por quê** — o modelo puro tem unitário próprio e não é assunto desta
    fatia.

11. ⚠️ **NÃO reescreva `acervo.test.tsx` em bloco.** São 2.845 linhas de guarda acumulada.
    **Mude o mínimo, e diga por medição quantas asserções mudaram e por quê.** Se precisar
    mexer em muitas, **pare e diga** — é sinal de que o recorte está errado.

12. **Tamanho pelo contador canônico** (`acervo.tsx:115-126`), **nunca `wc -l`**. Hoje:
    `acervo.tsx` **511** · `acervo-filters.tsx` **257** · `busca.tsx` (meça).
    ⚠️ **O `acervo.tsx` já é o maior arquivo de tela do projeto.** Esta fatia **não pode
    engordá-lo**: se crescer, corte por assunto e **diga por medição o que saiu e para onde**
    — e lembre da lição da 44b: **extrair de um arquivo não encolhe o outro**.

13. **O orçamento, colado antes e depois.** Entrada em **436.990 B** contra o teto de
    **450.000** — folga **13.010 B**, e ainda faltam as Tarefas 47 e 48. ⚠️ **Se esta fatia
    comer mais de ~4.000 B, diga.**

14. **Varredura de caracteres invisíveis** nos arquivos do diff, **provando antes que morde**,
    com os code points montados **por número**.

---

## Definição de pronto

- [x] A faixa do acervo existe: resumo + "Refinar" + chips removíveis, como o artboard desenha.
- [x] O painel abre em **bottom sheet no celular** e **na margem no desktop**, com o par
      guardado dos dois lados (regra 5).
- [x] ⚠️ **O estado recolhido cai na varredura anti-culpa**, cumprindo o bilhete de
      `filter-bar.tsx:126-128` — com o mutante da regra 2 vermelho.
- [x] ⚠️ **A busca continua SEM contagem de resultados** (decisão do dono), e a fragilidade do
      acusador está medida e dita (regra 3).
- [x] A visibilidade condicional dos controles sobrevive, com acusador nos dois sentidos, e a
      linha de resumo a acompanha.
- [x] Chips removem uma dimensão cada.
- [x] Varredura anti-culpa verde em **todos** os estados das duas telas, inclusive os vazios.
- [x] ADR 0002 intacto — o filtro continua rotulado como navegação.
- [x] `acervo-entries.ts` **intocado**, provado por `git diff`.
- [x] `acervo.test.tsx` **não** reescrito em bloco; o número de asserções mudadas está dito.
- [x] Nenhuma migration, endpoint ou schema. ⚠️ **DUAS chaves novas** (`filters.close`, `filters.remove`) — declaradas na nota 6.8.
- [x] As divergências declaradas: o painel que o artboard **não** desenha, a ausência de
      artboard de desktop, e a contagem de resultados que **o dono decidiu não trazer**.
- [x] Gates colados antes e depois, com bytes, folga e os contadores canônicos.
- [x] Varredura de invisíveis, com a prova de que morde.

### Acrescentado pela rodada de correção (notas 13–22)

- [x] ⚠️ **A MARGEM guardada nos DOIS sentidos**, simétrica à faixa e por token — os dois
      mutantes opostos tinham **0 acusadores em 961** cada (nota 13).
- [x] ⚠️ **A decisão D com o acusador CONSERTADO**, e a correção aplicada **não** é a que
      estava aprovada: o `\d+\s+` cria falso positivo sobre fixture inocente, medido e com o
      trecho impresso (nota 14). A aplicada é `\d+[^\S\r\n]+`, medida nos dois sentidos.
- [x] O filete de cima do bloco recolhido, guardado por token em `packages/ui` (nota 15).
- [x] Nenhum texto solto nas telas, com o **negativo** que morde — o positivo sozinho ficava
      verde sobre o mutante (nota 16).
- [x] O positivo do `FilterBar` **contando** os dois consumidores em vez de mencionar o nome
      (nota 16).
- [x] ⚠️ Os dois parágrafos do docblock que viraram falsos nesta fatia, **riscados e
      explicados** (nota 17).
- [x] ⚠️ O tamanho do `acervo-filters.tsx` **registrado** e o próximo corte **nomeado**, como
      dívida endereçada à 47/48 — não cortado agora, de propósito (nota 18).
- [x] B1 (o título da nota 7), B2 (a aritmética que não fechava), B3 (o `gap-[9px]` declarado)
      e B4 (não há resumo nem chip no desktop) corrigidos (nota 19).
- [x] ⚠️ A invariante `hidden` × `flex` **pinada** contra o CSS compilado (nota 20).
- [x] Gates e bytes colados de novo: a rodada custou **zero byte** (nota 21).

---

## Notas de reconciliação

_O executor anexa aqui o que mediu e divergiu da spec. Numere de 1 em diante. Se um número ou
uma citação desta spec estiver errado, **corrija-o aqui e no `BACKLOG.md`**, dizendo como
mediu. ⚠️ Na 45 quatro citações minhas estavam erradas e só uma foi declarada — **declare
todas**._

### 1 — As citações conferidas UMA A UMA, antes da primeira citação

O script que imprime a linha pelo número rodou antes de qualquer frase desta entrega. **Dez
citações da spec estão certas** e foram conferidas contra o conteúdo impresso:
`Acervo.dc.html:56` (a faixa: `border-top`/`border-bottom` de `--border-soft`, `padding:12px 0`,
`gap:9px`) · `:58` (o resumo: mono 10px, `0.08em`, maiúsculo, `--text-muted`, e o exemplo é
literalmente `De todo mundo · Tudo · Todas as cores`) · `:59-62` (o botão: 36px, pílula,
`--border`, três linhas horizontais) · `Busca.dc.html:60` (`3 resultados em todo o clube`) ·
`filter-bar.tsx:126-128` (o bilhete, palavra por palavra) e `:130-139` (`summaryOf`) ·
`sheet.tsx:32-39` (`open`/`onClose`/`title`/`closeLabel`) · `acervo-filters.tsx:193` (`person`),
`:202` (`type`), `:219` (`color`), `:292` (`TextFilter`), `:405` (`PageRangeFilter`) ·
`acervo-entries.ts:592-601` (as seis dimensões do `AcervoFilter`) · `acervo.tsx:115-126` (o
contador canônico) e `:209-214` (o vazio que não cobra). Os tamanhos de partida
`acervo.tsx` **511** e `acervo-filters.tsx` **257** também batem.

### 2 — ⚠️ QUATRO citações erradas, e as quatro estão declaradas

| a spec diz | medido | como |
| --- | --- | --- |
| `acervo.test.tsx` tem **2.845** linhas | **2.847** | `wc -l` = 2847; `split('\n').length` = 2848 com a linha vazia final. Erro de 2, antes da fatia |
| decisão G: os booleanos decidem em `acervo.tsx:794`, **`:876`**, **`:926`** | só `:794` é código | `:876` e `:926` são linhas de **comentário** que *citam* os booleanos. Os sítios de decisão eram `:793` (`highlightApplies`), `:794` (`readingApplies`), `:859` (`colorApplies:`), **`:939`** (o `<select>` existe?) e **`:958`** (a faixa existe?) |
| a fila de chips é `Acervo.dc.html:`**`64-66`** | **`:64-73`** | são **dois** chips: `Cap. 4` (`:66`) e `p. 120–160` (`:70`). `:64-66` é a fila mais o primeiro |
| a leitura é `acervo-filters.tsx:`**`445-499`** | o componente é **`:474-507`** | `:445` é o `const READING_SELECT_ID`, e `:499` cai no meio do `map` das opções |

Uma quinta, **menor e não é erro**: o cabeçalho da spec cita `filter-bar.tsx:110-128` e o
pedido do dono cita `:110-139`. O intervalo maior é o que contém as props e o `summaryOf`; o
menor para antes dele. Os dois apontam para o bilhete.

### 3 — ⚠️ E DOIS números errados no REPOSITÓRIO, achados pelo mesmo script e corrigidos

O docblock do `acervo.tsx` — o arquivo que **define** o contador canônico — carregava dois
números velhos. Medidos com o comando dele mesmo, e corrigidos lá:

- `acervo-entries.ts` dizia **167** e tem **169** (ficou para trás depois da 38h);
- `free-note.tsx` dizia **565** e tem **602**.

É a lição do próprio comando se repetindo, e está escrita no arquivo ao lado da tabela nova.

### 4 — ⚠️⚠️ O BILHETE DA 41a FOI CUMPRIDO, e o mutante mede os dois lados

O mutante do bilhete não é um rótulo culposo numa opção (esse é pego pelo chip expandido
também, e não prova nada sobre o resumo): é **`' · 3 de 12'` no fim do `summaryOf()`** de
`packages/ui`, uma frase que existe **só** na linha de resumo.

| onde | acusadores | o que são |
| --- | --- | --- |
| `packages/ui` | **3 de 304** | os três testes de `collapsed` do `filter-bar.test.tsx`, por **igualdade de texto** — exatamente o que o bilhete dizia ser a única guarda de hoje |
| `packages/app`, `acervo.test.tsx` | **46 de 73** | a varredura anti-culpa de DOM, incluindo o teste que nomeia o bilhete |

Antes desta fatia o número do app seria **zero**: `git grep collapsed` não achava **um**
consumidor de produção do bloco recolhido. A frase passou a existir para a varredura de DOM,
que é o que o bilhete pedia.

### 5 — ⚠️⚠️ A DECISÃO D MANTIDA, E O ACUSADOR DELA É FRÁGIL — medido, e com correção proposta

A contagem de resultados **não entrou** (decisão do dono, 2026-09-23), e o canvas diverge:
`Busca.dc.html:60` desenha `3 resultados em todo o clube`. `busca.tsx` e `busca.test.tsx`
estão **intocados** (provado por `git diff --stat`, que não os lista).

⚠️ **E a guarda não morde o número que o canvas desenha.** Três mutantes, com `md5sum` e
restauro conferido por conteúdo:

| mutante plantado em `busca.tsx` | acusadores |
| --- | --- |
| `<span>3 resultados em todo o clube</span>` (o literal do canvas) | **0 em 961** — o app inteiro |
| `<span>5 resultados em todo o clube</span>` | **1** — `busca.test.tsx:986` |

O `5` é a contagem do fixture, escrita à mão em `/\b5\s+resultados?\b/iu`; o `COUNTER_SHAPE`
da varredura anti-culpa não vê a frase, porque ela não tem `\d+ de \d+`. É a classe "guarda
que deixa de casar qualquer coisa e continua verde".

~~**A correção proposta (medida, NÃO aplicada — o dono escreveu "não se toca"):** trocar o `5`
por `\d+` nas duas linhas.~~

```ts
// ⚠️ ESTA VERSÃO ESTÁ ERRADA — ver a nota 14.
expect(readableText()).not.toMatch(/\b\d+\s+resultados?\b/iu);
expect(readableText()).not.toMatch(/\b\d+\s+results?\b/iu);
```

⚠️⚠️ **O `\s+` CRIA FALSO POSITIVO, e a correção aplicada é outra — nota 14.**

Medido aplicando e restaurando por `md5sum`: com `\d+` a suíte da busca continua **44
passando** sem mutante nenhum, e o mutante do `3` passa a ter **1 acusador**. Os dois arquivos
voltaram aos hashes de origem (`1c7591c5…` e `4738f1ad…`).

### 6 — As TRÊS divergências que a spec manda declarar, mais CINCO que ela não previa

**As três pedidas:**

1. **O painel que o artboard não desenha.** `grep -in "refinar"` nos 21 artboards devolve
   **uma** linha — `Acervo.dc.html:61`, o botão. O conteúdo do painel é **lacuna preenchida
   por esta fatia**: os seis controles inteiros, no bottom sheet da 41a no celular e no
   `MarginRail` no desktop. **Não é fidelidade ao canvas.**
2. **Não existe `AcervoDesktop.dc.html` nem `BuscaDesktop.dc.html`** (medido nos 21). O
   desktop destas duas telas é **derivado** do padrão das fatias 42–45 — coluna de 680px e
   margem de 320px com filete acima de 1120px, pelo mesmo `MarginRail` do Início e do dia.
3. **A contagem de resultados** — nota 5 acima.

**As cinco que a execução encontrou:**

4. **Os chips ficam ABAIXO do filete, não dentro da moldura do `:56`.** O artboard põe o
   resumo (`:57`) e a fila (`:64`) dentro de **uma** caixa com filete em cima e embaixo; o
   bloco recolhido da 41a já carrega `border-y border-line-soft py-3` **na própria linha do
   resumo**. Reproduzir a moldura exigiria uma segunda decisão de borda no app (duas verdades
   sobre o mesmo filete) ou um `border-y-0` pelo `className` — e o `cx` **não resolve conflito
   de utilitário**, por decisão escrita em `packages/ui/src/cx.ts`. Ficou como está, declarado.
5. **O rótulo do chip de faixa é `Da página 10 · Até a página 90`, não `p. 120–160`.** As duas
   pontas são opcionais (decisão D da 38h), então uma frase fechada precisaria de **três**
   chaves para os três casos. O rótulo é montado dos dois rótulos que já existem — zero chave
   nova, e nenhuma frase para sair de sincronia.
6. **O chip tem os 30px do canvas e o X tem 44px de alvo.** A decisão fechada do MVP 3.5 fixa
   o alvo de toque em ≥44px e o `Acervo.dc.html:65` desenha `height:30px`. Os dois são
   atendidos por um pseudoelemento (`after:-inset-3.5`): 16px de botão mais 14px de cada lado
   dão 44px clicáveis sem pintar um pixel.
7. **A margem do acervo SOME no celular — ao contrário da home.** A home registra que *"no
   celular nada desaparece"*, e ali é certo: a corrente e o feed não têm segunda casa. Aqui
   têm — o bottom sheet —, e deixar a margem descer para o fluxo daria **duas cópias** dos seis
   controles na mesma tela, com `id` duplicado nos quatro campos de `id` fixo
   (`acervo-reading`, `acervo-text`, `acervo-page-from`/`-to`). Quem guarda a outra metade é a
   faixa, que some **só** acima do corte.
8. **Duas chaves novas, e um grupo do pino de frases repetidas cresceu.**
   `pages.acervo.filters.close` (`'Fechar'`) e `pages.acervo.filters.remove`
   (`'Remover {{label}}'`). O `refine` **já existia** desde a Tarefa 40 e ganhou o primeiro
   consumidor aqui. O `close` é gêmea de `pages.acervo.archive.close` — o grupo `'Fechar'` do
   `catalogs.test.ts` foi de 2 para 3 caminhos, com a justificativa escrita ao lado: um fecha
   confirmação de ação destrutiva, o outro fecha um painel de navegação (ADR 0002). O
   `{{label}}` é obrigatório porque seis chips com o nome acessível `"Remover"` seriam a mesma
   palavra para seis gestos.

### 7 — ~~A tabela de mutação: 13 mutantes, 13 acusados, zero sobreviventes~~ **14 linhas, 12 acusados, 1 sobrevivente**

⚠️ **O TÍTULO SE CONTRADIZIA COM A PRÓPRIA TABELA, e é a linha que alguém lê
primeiro** (achado B1 da rodada de correção). A tabela mostra o mutante nº 2 com
**0** acusadores e o parágrafo logo abaixo dela diz, literalmente, que ele *"é o
único que sobrevive, e sobreviver é o achado"*. O `BACKLOG.md` estava certo —
**12 acusados, 1 sobrevivente**. A tabela também tem **14** linhas para "13
mutantes": a linha `1b` é o mesmo mutante medido num segundo pacote. O título
fica riscado em vez de apagado porque quem voltar aqui procurando "13 acusados"
precisa achar o erro, não o silêncio.


Protocolo em todos: `md5sum` + `cp -p` antes → `.mjs` **ancorado** (estoura se ≠ 1) → `grep`
de confirmação → rodar → contar e nomear → `cp -p` de volta → `md5sum -c` **e** conferência
por conteúdo.

| # | regra | mutante | acusadores | acusador nomeado |
| --- | --- | --- | --- | --- |
| 1 | 2 | `summaryOf()` ganha `' · 3 de 12'` | **46/73** (app) | `⚠️ puts the COLLAPSED summary under the anti-guilt sweep` |
| 1b | 2 | o mesmo, medido em `packages/ui` | **3/304** | os três `collapsed` do `filter-bar.test.tsx`, por igualdade de texto |
| 2 | 3 | `3 resultados em todo o clube` na busca | **0/961** | ⚠️ **nenhum** — a guarda é frágil (nota 5) |
| 3 | 3 | `5 resultados em todo o clube` na busca | **1** | `busca.test.tsx:986 › shows NO result count anywhere` |
| 4 | 4 (i) | `readingApplies = true` | **2** | `⚠️ keeps the conditional controls conditional, and the SUMMARY follows` |
| 5 | 4 (ii) | `readingApplies = false` | **11** | o mesmo, mais `hides the READING select…` e as combinações |
| 6 | 4 (iii) | `colorApplies: true` (o resumo cita a cor fora de jogo) | **2** | `⚠️ keeps the conditional controls conditional, and the SUMMARY follows` |
| 7 | 5 | o painel **nunca abre** (`setRefining(false)` no "Refinar") | **2** | `⚠️ opens the panel in a bottom sheet and closes it again` |
| 8 | 5 | o painel **nasce aberto** (`useState(true)`) | **5** | o mesmo, mais `offers no filter at all over an empty collection` |
| 9 | 6 | a faixa vira `max-[1119px]:hidden` | **1** | `⚠️ keeps the band on the phone and takes it off ONLY above 1120px` |
| 10 | 7 | remover um chip limpa **todas** as dimensões | **1** | `⚠️ turns each chosen dimension into ONE removable chip` |
| 11 | 8 | o vazio vira `"Você deixou o acervo sem nada"` | **14** | `⚠️ EMPTY ≠ FILTERED-WITH-NO-RESULT, and neither one nags` |
| 12 | 9 | o painel se chama `"Só você vê este recorte"` | **3** | `adr-0002-iconography.test.ts › speaks of no so voc anywhere in app/src` |
| 13 | 9 | o X do chip vira `Lock as X` do `lucide-react` | **1** | `adr-0002-iconography.test.ts › imports no lock icon anywhere in app/src` |

⚠️ **Sobre a regra 9, a spec está certa no NOME do acusador e vale dizer qual cópia**: quem
acusa é o `packages/app/src/pages/__tests__/adr-0002-iconography.test.ts` — não a homônima de
`packages/ui`, que varre só o design system.

⚠️ **O mutante nº 2 é o único que sobrevive, e sobreviver é o achado** — ele não é uma falha
desta fatia, é a medição que a regra 3 pediu.

### 8 — `acervo.test.tsx` NÃO foi reescrito: 3 asserções mudaram, e todas no mesmo teste

Medido por `git diff -U0`: as linhas **removidas** do arquivo são exatamente três, e são as
três do mesmo `it()`:

```
-    expect(source).toContain('FilterBar');
-    expect(source).not.toContain('FilterChip');
-    expect(source).not.toContain('role="group"');
```

Por quê: o `<FilterBar>` saiu do `acervo.tsx` (os seis controles ganharam duas casas e viraram
um componente só, no vizinho). A guarda passou a ler o **par** de arquivos — o positivo exige o
componente compartilhado no `acervo-filters.tsx`, e os **dois negativos passaram a valer nos
dois arquivos**, o que é mais forte do que era: antes o `acervo-filters.tsx` podia montar um
chip à mão sem ninguém ver.

Nenhuma outra asserção antiga foi tocada. As outras **45** `expect(` acrescentadas são do
`describe` novo — sete testes.

### 9 — Tamanho: a tela ENCOLHEU, e o corte tem endereço

Pelo contador canônico de `acervo.tsx:115-126` (nunca `wc -l`):

| arquivo | antes | depois | |
| --- | --- | --- | --- |
| `acervo.tsx` | **511** | **478** | **−33** |
| `acervo-filters.tsx` | 257 | **465** | +208 — as duas casas, os chips e a faixa |
| `acervo-rows.tsx` | — | **88** | novo: o card de grifo e o `authorLabel` |
| `acervo-entries.ts` | 169 | **169** | **intocado**, provado por `git diff` |
| soma | **937** | **1.200** | **+263** |

~~A fatia por si custou **+20** linhas à tela (…), e o corte devolveu **52**.~~
⚠️ **OS DOIS NÚMEROS ESTAVAM ERRADOS, e a aritmética não fechava** (achado B2 da
rodada de correção): `511 + 20 − 52 = 479`, e o arquivo tem **478** — num
parágrafo cujo assunto é medir em vez de estimar. Remedido **por função**, que é
a única conta que não mistura as duas mudanças do mesmo commit:

| | canônicas |
| --- | --- |
| saíram para o `acervo-rows.tsx`: `authorLabel` 5 + `highlightRow` 59 | **64** |
| voltaram: o invólucro de 16 + a linha de `import` | **−17** |
| liberaram: os `import` de `COMMENT_EXCERPT_LENGTH` e `QUOTE_EXCERPT_LENGTH` | **+2** |
| **o corte devolve** | **49** |
| **a fatia por si** (`511 + x − 49 = 478`) | **+16** |

**49 e +16**, não 52 e +20 — e agora fecha. Corrigido também em
`acervo-rows.tsx`, que carregava o `52`. O que a devolveu a 478 foi **o corte
que o próprio docblock do `acervo.tsx` já nomeava desde a 38h**:
*"o card de grifo (63 linhas) tem quatro dependências da tela — `t`, o nome de quem escreveu,
o `bookId` e o `setConfirming`. Ele é fatia própria, com desenho de props"*. As quatro viraram
as quatro props do `HighlightRow`, e o `authorLabel` foi junto porque as **duas** metades da
lista o chamam.

⚠️ **E a lição da 44b fica escrita: extrair de um arquivo NÃO encolhe o outro.** A soma dos
quatro subiu 263 linhas. O que o corte compra é que a tela pare de crescer, não que o projeto
encolha.

### 10 — Orçamento de bytes

| | antes | depois | |
| --- | --- | --- | --- |
| chunk de entrada | 436.990 B | **439.608 B** | **+2.618 B** |
| folga contra o teto de 450.000 | 13.010 B | **10.392 B** | |
| CSS | 35.445 B | **35.919 B** | +474 B |
| `book-form` | 10.059 B | **10.059 B** | inalterado |
| chunk do editor | 449.522 B | **449.522 B** | inalterado |
| `index.html` | 1.638 B | **1.638 B** | inalterado |
| precache | 27 | **27** | inalterado |

Abaixo do aviso de ~4.000 B da regra 13. Sobram **10.392 B** para as Tarefas 47 e 48.

### 11 — Gates

`pnpm -r test`: shared **607** · ui **304** · backend **1994** · app **961** (era 954; +7, os
sete testes novos). `pnpm -r typecheck` verde · `pnpm lint` verde · `pnpm prettier --check .`
verde · `pnpm --filter @clube/app build` verde.

Nenhuma migration, endpoint ou schema: `schema.prisma` continua em
`968c9986f7a2dfb4ccbd738b13d44715`.

**Varredura de invisíveis**, com o par positivo primeiro: uma sonda `U+200B` plantada num
arquivo de rascunho é acusada (1 ocorrência, linha 1), e os **sete** arquivos do diff dão
**zero**. Os code points são montados por `String.fromCodePoint` — `0x0000`, `0x00A0`,
`0x00AD`, `0x200B`–`0x200F`, `0x2028`, `0x2029`, `0x202A`–`0x202E`, `0x2060`, `0xFEFF`.

### 12 — O que tentei e não deu certo

- **Manter os seis controles no fluxo, com `max-[1119px]:hidden`, sem mexer no `Screen`.**
  Era o recorte mais barato — zero hoisting, um `<div>` a mais — e foi descartado por medição
  de propósito, não de teste: "painel **na margem** no desktop" é item da Definição de pronto,
  e o `MarginRail` é o que as fatias 42–45 fixaram como margem. Custou subir ~40 linhas de
  derivação do `collection()` para o corpo do componente.
- **Renderizar os controles nas DUAS casas e esconder uma por media query.** É o padrão da
  home (*"no celular nada desaparece"*) e aqui ele quebra: o `TextFilter`, o `ReadingSelect` e
  as duas pontas da faixa têm `id` **fixo** (a tela é uma por rota), então duas cópias dão
  quatro `id` duplicados e o `getByLabelText` — o da suíte e o de quem usa leitor de tela —
  passa a achar dois controles com o mesmo rótulo. A invariante de **uma cópia** virou
  asserção própria dentro do teste do par aberto/fechado.
- **Passar `border-y-0` ao `FilterBar` recolhido** para pôr os chips dentro da moldura do
  `:56`. O `cx` não é `tailwind-merge` — está escrito no próprio arquivo dele — e quem
  venceria seria a ordem do CSS emitido, não a ordem do código. Virou a divergência nº 4.
- **Reusar `pages.acervo.archive.close` em vez de criar `filters.close`.** Teria evitado a
  chave nova e o crescimento do grupo `'Fechar'` do pino. Recusado pelo mesmo argumento que o
  pino existe para cobrar: as duas frases são iguais **hoje** e falam de coisas diferentes, e
  a primeira correção de texto que as distinguisse teria de desfazer a fusão antes de poder
  acontecer.
- **Um chip por PONTA da faixa de página.** Dá dois botões para desfazer meia faixa — e meia
  faixa é uma faixa válida, que o `boundOf` já sabe ler. Virou **um** chip, como a dimensão.

---

## Notas da RODADA DE CORREÇÃO (executor ≠ quem escreveu a fatia)

_Um revisor separado auditou a entrega, derrubou **sete afirmações** e achou **cinco mutantes
sobreviventes novos**. O que segue é o que este executor **mediu por conta própria** — inclusive
contra o revisor e contra o dono, onde a medição discordou dos dois. Protocolo em todos os
mutantes: `md5sum` + `cp -p` antes → `.mjs` **ancorado com âncora e substituto em ARQUIVO**
(estoura se ≠ 1) → `grep` de confirmação → rodar → contar e **nomear** → `cp -p` de volta →
`md5sum -c` **e** conferência por conteúdo. Nenhum `git checkout`/`restore`/`stash`/`reset`._

### 13 — ⚠️⚠️ A1: a visibilidade da margem não tinha guarda em DIREÇÃO NENHUMA

`packages/app/src/pages/acervo-filters.tsx:610` —
`<MarginRail className="hidden pt-4 min-[1120px]:flex">`.

Os dois mutantes opostos, reproduzidos aqui com o protocolo inteiro (hash de partida
`d7ff38a0879e09a272094bd752193f83`, restaurado e conferido depois de cada um):

| mutante | acusadores ANTES | acusadores DEPOIS |
| --- | --- | --- |
| tirar o `hidden` (a margem aparece **no celular**) | **0 em 961** | **1** |
| tirar o `min-[1120px]:flex` (a margem **nunca** aparece no desktop) | **0 em 961** | **1** |

⚠️ **O segundo é o pior, e a razão é a própria faixa:** acima de 1120px o `RefineBand` é
`min-[1120px]:hidden` e a margem continuaria `hidden` — o usuário de desktop perde os **seis
controles inteiros** e a suíte fica verde. A faixa tinha guarda de token exata, mordendo nos
dois sentidos, e era ela que fazia a margem **parecer** coberta (§7.9 literal). **Quinta vez
que este bloco paga por par guardado pela metade.**

**A guarda**, em `acervo.test.tsx`, dentro do `it('⚠️ opens the panel…')` — simétrica à da faixa
e com a conta extraída para dois helpers (`tokensOf`/`hidingOf`) em vez de copiada:

```ts
expect(hidingOf(marginRail())).toEqual(['hidden']);
expect(tokensOf(marginRail(), 'flex')).toEqual(['flex', 'min-[1120px]:flex']);
```

Os vermelhos, colados:

```
AssertionError: expected [] to deeply equal [ 'hidden' ]
AssertionError: expected [ 'flex' ] to deeply equal [ 'flex', 'min-[1120px]:flex' ]
```

⚠️ **O `flex` da base entra na asserção de propósito**, e é o que amarra esta nota à 20: o
`hidden` vem do `className` da tela e o `flex` vem do `MarginRail` de `packages/ui`.

⚠️ **E a guarda da FAIXA foi remedida depois do refactor**, para o helper não ter enfraquecido o
que já existia: o mutante `min-[1120px]:hidden` → `max-[1119px]:hidden` continua com **1**
acusador (`expected [ 'max-[1119px]:hidden' ] to deeply equal [ 'min-[1120px]:hidden' ]`).

### 14 — ⚠️⚠️ A2: a correção da decisão D que estava aprovada estava ERRADA — medido nos dois sentidos

O dono autorizou trocar o `5` por `\d+` em `busca.test.tsx:989-990`. **Medido: ela cria falso
positivo**, e o mecanismo é o `readableText()` do `harness.tsx`.

**A medição (a) — o falso positivo, reproduzido:** `readableText()` junta as partes com `'\n'` e
`\s` casa `'\n'`. Impresso por sonda antes de qualquer conserto, a parte que vem **logo depois**
do `textContent` do `<ul>` é o `aria-label` **dele**:

```
TAIL>>> "…A carta que ficouA Queda de Gondolin · MariaAvulsa\nResultados da busca\nMO dragao "
```

Com um fixture **inocente** — um comentário de grifo dizendo `reler a partir da pagina 3` na
última linha da lista — o `\d+\s+resultados` faz ponte por cima da quebra:

```
MATCH>>> "redonda e verdereler a partir da pagina 3\nResultados da busca\nMO dragao e o ouroO Hob"

AssertionError: expected 'Clube do LivroClube do CasalTemaDo si…' not to match /\b\d+\s+resultados?\b/iu
   989|    expect(readableText()).not.toMatch(/\b\d+\s+resultados?\b/iu);
```

**A medição (b) — a correção certa, ancorada a espaço horizontal:** com
`/\b\d+[^\S\r\n]+resultados?\b/iu` e a gêmea em `results?`, **o mesmo fixture inocente passa** (a
sonda ainda imprime o `MATCH>>>` da versão velha, e o teste fica verde), e o mutante do canvas
plantado em `busca.tsx` passa a ter **1 acusador em 961**:

```
AssertionError: expected 'Clube do LivroClube do CasalTemaDo si…' not to match /\b\d+[^\S\r\n]+resultados?\b/iu
   Tests  1 failed | 960 passed (961)
```

⚠️ **O porquê do `[^\S\r\n]` está escrito no docblock do teste**, junto com o `MATCH>>>`
literal, exatamente para a próxima pessoa não "simplificar" para `\s+`. A âncora à direita
(`\b`) não resolveria: quem faz a ponte é o **espaço**, não a fronteira de palavra.

⚠️ **Uma discordância menor com o revisor, declarada:** o trecho que ele imprimiu tem o
comentário de grifo como última linha da lista, e no fixture desta suíte a última linha é uma
anotação (que termina no rótulo de tipo, `Avulsa`). Para reproduzir a ponte foi preciso **mover**
o grifo dela para o fim da ordem. O fenômeno é o mesmo, o trecho impresso é idêntico, e a
condição exata fica escrita: **a ponte acontece quando o `textContent` do `<ul>` termina em
dígito**, porque a parte seguinte é sempre o `aria-label` dele.

### 15 — N6: o filete de cima da faixa sumia em silêncio

`packages/ui/src/components/filter-bar.tsx:187` — `border-y` → `border-b`: **0 em 304** (ui) e
**0 em 961** (app). Metade do desenho que a decisão A cita (`Acervo.dc.html:56` desenha
`border-top` **e** `border-bottom`).

**A guarda**, no `filter-bar.test.tsx` de `packages/ui` — por token, com o par de negativos, e a
cor deliberadamente **fora** dela (a cor é assunto do tema; o que a guarda protege é a moldura):

```ts
expect(tokens).toContain('border-y');
expect(tokens).not.toContain('border-t');
expect(tokens).not.toContain('border-b');
```

```
× FilterBar > collapsed (decision H) > ⚠️ keeps the filete on BOTH edges of the collapsed block
AssertionError: expected [ 'flex', 'items-center', …(5) ] to include 'border-y'
```

### 16 — N7 e M1: o positivo que só MENCIONAVA, e o texto solto que ninguém via

**N7** — `acervo-filters.tsx:814`, `refineLabel={t('pages.acervo.filters.refine')}` →
`refineLabel="Refinar"`: **0 em 961**. O `CLAUDE.md` é explícito (*"Nenhum texto solto nas telas
— tudo via `t('chave')`"*), e a chave ganhou aqui o primeiro consumidor.

⚠️ **E a primeira versão da guarda FICOU VERDE SOBRE O MUTANTE — medido, não suposto.** Exigir
`t('pages.acervo.filters.refine'` no arquivo não basta: a **mesma chave** tem dois consumidores
aqui (o `refineLabel` da faixa e o `title` do `Sheet`), e o segundo segurava a asserção sozinho.
É o mesmo defeito do M1, uma função abaixo. Quem morde é o **negativo**, que não depende de
formatação:

```ts
expect(filters).not.toMatch(/\s(?:refineLabel|closeLabel|title|placeholder|aria-label)="/u);
```

```
× ⚠️ takes every label of the band from the CATALOG, never a loose string
AssertionError: expected 'import { HIGHLIGHT_PAGE_MAX } from \'…' not to match /\s(?:refineLabel|closeLabel|title|pl…/u
```

**M1 / N8** — *"a guarda ficou mais forte"* era **meia verdade**. Os dois negativos, sim; o
**positivo** foi de *"o arquivo da TELA usa o componente compartilhado"* para *"o arquivo vizinho
menciona `FilterBar` em algum lugar"*, e o vizinho tem **dois** usos. Medido com o `RefineBand`
redesenhando o bloco recolhido **à mão** (um `<div>` com o mesmo `border-y`, o `summaryOf`
copiado e um `<button>`): **0 acusadores em 73**.

⚠️ **O único vermelho em 961 foi um acusador ACIDENTAL, e não conta**: a sonda de classes
canárias do `ui-source-scan.test.ts` acusou por **contagem de classe** (`expected [ …(6) ] to
have a length of 5 but got 6`) — ela teria ficado verde se a cópia à mão usasse outro nome de
classe, e não diz nada sobre a propriedade. O positivo agora **conta os consumidores**:

```ts
expect(filters.split('<FilterBar').length - 1).toBe(2);
```

```
× ⚠️ builds the filter with the SHARED FilterBar, and keeps NO chip composition of its own
AssertionError: expected 1 to be 2 // Object.is equality
```

### 17 — ⚠️ A3: dois parágrafos do docblock viraram FALSOS nesta mesma fatia

Os dois ficam **riscados e explicados**, nunca apagados — e os dois estão em `acervo.tsx`:

1. *"**A COSTURA QUE FICA REGISTRADA E NÃO CORTADA:** o card de grifo (63 linhas)… não é
   urgente: **nenhuma fatia planejada mexe nele**."* ⚠️ **O card foi cortado NESTA fatia**, e o
   `acervo-rows.tsx` **cita este parágrafo** como a previsão cumprida — duas verdades sobre a
   mesma coisa, no mesmo commit. O risco preserva a previsão certa (o lugar) junto com a errada
   (o "não é urgente").
2. O parágrafo que promete *"é **aqui** que o campo de texto mora"* e *"Ele é o `<TextFilter/>`,
   **algumas linhas abaixo, neste mesmo `collection()`**"*. ⚠️ **Falso por dois motivos ao mesmo
   tempo:** o símbolo **saiu do arquivo** (`grep -n TextFilter acervo.tsx` devolvia duas linhas
   no momento do achado, e as duas eram comentário — zero ocorrências de código) **e** o
   docblock saiu de dentro do `collection()`. ⚠️ E o parágrafo seguinte é literalmente a
   celebração de ter consertado a versão anterior desta mesma promessa (*"Achado MÉDIO da
   auditoria da 38g"*).

⚠️ **A lição, escrita no arquivo:** a entrega remediu os **números** da tabela e não releu os
**parágrafos** — e uma frase que diz "aqui" envelhece no instante em que o "aqui" se move, sem
que número nenhum mude.

### 18 — M4: 465 linhas, e ninguém perguntou

Medido com o contador canônico sobre os arquivos de produção de `packages/app/src`:

```
free-note.tsx        602
day-note.tsx         478
acervo.tsx           478   ← a TELA, que a regra 12 protegia
acervo-filters.tsx   465   ← o vizinho, +81% numa fatia (257 → 465)
book-form.tsx        456
```

O `acervo-filters.tsx` é o **4º maior arquivo do app** e está **65 acima do teto de 400** que o
próprio `acervo.tsx` nomeia. A regra 12 protegia a **tela**; o vizinho absorveu tudo, e a nota 9
celebrou o −33 sem uma palavra.

⚠️ **NÃO cortado agora** — a fatia está entregue e cortar de novo é churn. Ficou **registrado no
docblock** a conta por função e o **próximo corte nomeado**: `activeChips` (65) + `RefineBand`
(48) + os dois tipos deles ≈ **125 linhas canônicas**, para um `acervo-band.tsx`, com quatro
dependências do resto (`FilterGroup`, o `NEUTRAL_VALUE` lido do `acervo-entries.ts`, o `t` e o
pacote `AcervoControlsProps`). **Dívida endereçada à 47/48**, com endereço em vez de promessa.

### 19 — B1, B2, B3, B4: as quatro correções menores

- **B1** — o título da nota 7 dizia *"13 mutantes, 13 acusados, zero sobreviventes"* e a própria
  tabela mostra o nº 2 com **0**, e o parágrafo abaixo dela diz que ele é o único sobrevivente.
  O `BACKLOG.md` estava certo. ⚠️ **O título é a linha que alguém lê primeiro** — riscado e
  corrigido para **14 linhas, 12 acusados, 1 sobrevivente** (a linha `1b` é o mesmo mutante num
  segundo pacote).
- **B2** — a aritmética não fechava: `acervo-rows.tsx` dizia que o corte *"devolve 52"* e a nota
  9 que a fatia custou *"+20"*; `511 + 20 − 52 = 479`, e o arquivo tem **478**. ⚠️ Remedido
  **por função**, que é a única conta que não mistura as duas mudanças do mesmo commit:
  saíram 64 (`authorLabel` 5 + `highlightRow` 59), voltaram 17 (o invólucro de **16** mais a
  linha de `import`), e liberaram 2 (`COMMENT_EXCERPT_LENGTH` e `QUOTE_EXCERPT_LENGTH`) → **o
  corte devolve 49**, e **a fatia por si custou +16**. `511 + 16 − 49 = 478` fecha. Os dois
  números errados estavam em **dois** arquivos e os dois foram corrigidos.
- **B3** — o `gap-[9px]` não fora comparado com escala nenhuma nem declarado. **Declarado no
  docblock:** é o valor do `Acervo.dc.html:56`; os sete `--size-*` são **tamanho de fonte**, não
  espaçamento, então não há com o que comparar, e valor arbitrário de espaçamento já é prática
  medida no repo (`gap-[26px]` no `book.tsx` e no `day-note.tsx`). O valor estava certo; faltava
  a frase.
- **B4** — o `RefineBand` inteiro é `min-[1120px]:hidden`, então **no desktop não há linha de
  resumo nem chip removível** — só os seis controles abertos na margem. A Definição de pronto
  promete os três **sem qualificar**. É escolha defensável (lá o resumo parafrasearia o que está
  visível ao lado, e o chip seria um segundo botão para o gesto que o próprio controle faz), e a
  frase que faltava está agora no docblock.

### 20 — B5: a invariante que se apoiava em ordem de emissão do CSS, e agora está pinada

A recusa do `border-y-0` (nota 12) foi *"o `cx` não resolve conflito de utilitário"* — e a
invariante da margem se apoia num conflito **igual**: o `MarginRail` traz `flex` na base e o
`FilterMargin` passa `hidden` por `className`. Medido no CSS compilado desta build:

```
.flex{display:flex}                      offset  7099
.hidden{display:none}                    offset  7118   ← ganha do .flex na base
@media (min-width:1120px){ …:flex … }    offset 21305   ← ganha do .hidden acima do corte
```

As três têm especificidade `0,1,0` e `@media` não acrescenta nenhuma: quem decide é a **ordem de
emissão**. Funciona — mas funcionava por um fato do Tailwind que **nenhum teste afirmava**.

⚠️ **Vale guarda, e o argumento é a falha silenciosa:** invertida a ordem, a margem do acervo
fica `display:none` em **toda** largura — os seis controles somem do desktop inteiro — e
**nenhum teste de DOM vê**, porque o `jsdom` não aplica media query. É exatamente o par que o
A1 mediu como 0 acusadores em 961. O acusador novo mora em
`packages/app/src/__tests__/ui-source-scan.test.ts` (o único arquivo do repositório com o CSS
compilado na mão), com os dois sentidos: `min-[1120px]:flex` depois de `.hidden` (a margem
volta) e `min-[1120px]:hidden` depois de `.flex` (a faixa some).

### 21 — Orçamento, gates e varredura desta rodada

⚠️ **A rodada custou ZERO byte**, e os cinco números são idênticos aos da entrega:

| | entrega | rodada |
| --- | --- | --- |
| chunk de entrada | 439.608 B | **439.608 B** |
| CSS | 35.919 B | **35.919 B** |
| `book-form` | 10.059 B | **10.059 B** |
| chunk do editor | 449.522 B | **449.522 B** |
| `index.html` | 1.638 B | **1.638 B** |
| precache | 27 | **27** |

Folga contra o teto de 450.000: **10.392 B** para as Tarefas 47 e 48, intacta.

⚠️ **E o caminho até esse zero virou medição sobre o Tailwind v4:** uma versão intermediária do
docblock do `acervo-filters.tsx` citava a altura arbitrária do `context-bar.tsx` na forma **nua**,
e o CSS subiu **24 B** — o scanner lê o **texto bruto** do arquivo, comentário incluído, e emitiu
uma classe que no código só existe com variante. Medido por build pareado (fontes de origem →
35.919 B; fontes desta rodada → 35.943 B; diferença de seletores: exatamente um). Reescrita a
frase, o diff de seletores contra a build de origem ficou **vazio nos dois sentidos**.

**Gates:** `pnpm -r test` shared **607** · ui **305** (era 304) · backend **1994** · app **964**
(era 961) — os +4 são as quatro guardas novas. `pnpm -r typecheck` verde · `pnpm lint` verde ·
`pnpm prettier --check .` verde · `pnpm --filter @clube/app build` verde.

Nenhuma migration, endpoint ou schema: `schema.prisma` continua em
`968c9986f7a2dfb4ccbd738b13d44715`. `acervo-entries.ts` continua **intocado** (`git diff
942e338 -- acervo-entries.ts` vazio) e os contadores canônicos não mudaram: `acervo.tsx` **478** ·
`acervo-filters.tsx` **465** · `acervo-rows.tsx` **88** · `acervo-entries.ts` **169** (o que
esta rodada acrescentou aos três primeiros é comentário, que o contador descarta).

**Varredura de invisíveis**, com o par positivo primeiro: uma sonda com `U+200B` na linha 1 e
`U+00A0` na linha 2 é acusada (2 ocorrências, com a linha certa), e os **onze** arquivos tocados
dão **zero**. Code points montados por `String.fromCodePoint`: `0x0000`, `0x00A0`, `0x00AD`,
`0x200B`–`0x200F`, `0x2028`, `0x2029`, `0x202A`–`0x202E`, `0x2060`, `0xFEFF`.

### 22 — O que tentei e não deu certo, nesta rodada

- **A guarda do N7 só com o positivo** (`expect(filters).toContain("t('pages.acervo.filters.refine'")`).
  Ficou **verde sobre o mutante** e a medição é a nota 16: a mesma chave tem dois consumidores no
  arquivo. Virou positivo **mais** negativo, e é o negativo que morde.
- **Reproduzir o falso positivo do A2 sem mexer na ordem do fixture.** A ponte só acontece quando
  o `textContent` do `<ul>` termina em dígito, e o último resultado da suíte é uma **anotação**,
  cujo texto termina no rótulo de tipo. Plantar o comentário no grifo sem movê-lo deixava o
  dígito no meio da lista, onde `\s+` não faz ponte com nada. Foi preciso mover — e a condição
  exata ficou escrita, que é mais útil que o fixture.
- **Um `hidingOf()` que lesse só o próprio nó.** Seria mais curto e ficaria **verde com a tela
  inteira invisível**: esconder o pai esconde o filho. O helper sobe até o `body`, como a guarda
  da faixa já fazia.
- **Uma asserção de DOM para o M1** ("o bloco recolhido renderizado é o do `packages/ui`"). Não
  existe marca que distinga o componente compartilhado de uma cópia fiel feita à mão — o mutante
  do N8 reproduz classe por classe. A contagem de consumidores na fonte é o que separa os dois,
  e é a que ficou.
- **Cortar o `acervo-filters.tsx` agora** (M4). Recusado por ser churn sobre uma fatia já
  entregue e medida; virou dívida **endereçada**, com o corte nomeado e a conta por função no
  docblock.
