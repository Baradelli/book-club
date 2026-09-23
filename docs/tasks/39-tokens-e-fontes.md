# Tarefa 39 — Os tokens do caderno, e as quatro fontes

> **Primeira fatia do MVP 3.5**, nascida de `docs/new-ui.md` §A.6 e §A.7 e do canvas de
> design `https://claude.ai/artifact/YDHTxyof7ji1xqKhoocdDt`. É a única fatia que muda
> **todas as 15 telas de uma vez** — e ela faz isso sem tocar uma linha de JSX de produção.
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** ·
> `docs/CONVENCOES-CODIGO.md` **§7.1** (fidelidade nos dois sentidos), **§7.4** (asserção
> vazia), **§7.9** (a guarda mora onde a propriedade é decidível) · `docs/EDITOR.md` **§13**
> — ⚠️ **ele lista sete tokens que nunca existiram, e esta fatia corrige isso** ·
> `docs/adr/0002-visibilidade-total-no-clube.md` (é ele que proíbe `<svg>` à mão, e o
> desenho novo **não** precisa de nenhum).

---

## ⚠️ O que esta fatia é, e o que ela deliberadamente NÃO é

Ela troca a **camada de token**: os nomes, os valores e as famílias tipográficas. Ela
**não** troca o vocabulário de utilitário (`bg-canvas`, `text-content`, `rounded-control`
continuam se chamando assim) e **não** reescreve componente nenhum.

⚠️ **Isso é uma correção ao plano da Fase A, e ela ENCOLHE a fatia.** O plano dizia que a
paleta de seis cores de avatar morria aqui (decisão F) e que o `avatar-contrast.test.ts`
passaria a medir um par só. **Medido: `bg-avatar-1`…`bg-avatar-6` e `text-avatar-fg` são
usados por `avatar-color.ts:23-28` e `person-avatar.tsx:64`**, e `ui-source-scan.test.ts`
(`:383-384`) exige que toda classe usada por `packages/ui` tenha CSS emitido. Matar os seis
tokens aqui obrigaria a reescrever o `PersonAvatar` na mesma fatia — e aí ela deixaria de
ser "tokens e fontes" e viraria "tokens, fontes e um componente".

✅ **Logo: os seis tokens de avatar ficam nesta fatia, com o valor de hoje**, e são os
únicos cujo valor não vem do canvas. O `--person-*` nasce ao lado deles. **A decisão F é
executada na Tarefa 41**, junto com o `PersonAvatar`, e é lá que o `avatar-contrast.test.ts`
passa a medir o par único.

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | **Os nomes do canvas, sem prefixo**: `--bg`, `--surface`, `--accent`, `--gold-line`, `--pen-a`… O `--clube-*` morre | Decisão do dono (2026-09-19). De quebra some um dos sete lugares que o `README-IA.md` lista em "Como renomear o projeto" — era *"o único lugar onde o nome vira parte do estilo"* |
| **B** | ⚠️ **O discriminador do `theme-css.test.ts` deixa de ser o prefixo e passa a ser "toda custom property do `:root` do `theme.css`"** — `property.startsWith('--')` | **A guarda fica MAIS forte, não mais fraca.** Hoje um token de cor que alguém escrevesse sem o prefixo escapava das quatro varreduras em silêncio; sem prefixo nenhum, não existe token que escape. O `color-scheme` não começa com `--` e sai sozinho. ⚠️ **O piso `toBeGreaterThan(20)` sobe para `40`** — senão ele deixa de ser a guarda de asserção vazia do §7.4 que ele existe para ser |
| **C** | ⚠️ **O `DANGER_STYLE` TROCA `--clube-danger` por `--danger`. Nunca apaga o ramo** | Uma guarda que deixa de casar qualquer coisa **continua verde e para de guardar** — é a pior das duas falhas. A regra 4 abaixo exige o par positivo e o mutante |
| **D** | **A lista fechada de exceções ao `light-dark()` passa a ser os quatro raios**: `--r-1`, `--r-2`, `--r-3`, `--r-pill` | Mesma razão de sempre (raio não é cor), mesma forma: lista fechada, e cada item tem de existir de verdade no `:root` |
| **E** | **O trio de superfícies vira `--bg` · `--surface` · `--surface-2`**, e `--color-surface-raised` passa a apontar para `--surface-2` | `bg-surface-raised` é usado por `sheet.tsx:204` e `home.tsx:436`; remover o utilitário aqui quebraria `ui-source-scan`. `--surface-2` (`#f0ece0` / `#26282b`) é token do canvas e é distinto dos outros dois nos **dois** temas, que é o que o `theme-tokens.test.ts` cobra |
| **F** | **`--success` morre, token e utilitário** | Medido: `text-success` / `bg-success` têm **zero** ocorrências em `packages/{app,ui}/src`. O "Salvo" do canvas é mono `--text-subtle`. Token sem consumidor é exatamente o que a bijeção existe para não deixar acumular |
| **G** | **`--scrim` substitui o `bg-black/50` do backdrop do `Sheet`**, e `--color-black` sai do `@theme inline` | O valor vem do canvas (`Avulsa.dc.html`: `rgba(20,26,20,0.45)`). Com ele, o `--color-*: initial` fica **sem exceção nenhuma** — hoje `--color-black` é a única sobrevivente da paleta do Tailwind, e uma exceção é uma porta |
| **H** | **As famílias e a escala viram token** nos namespaces `--font-*` e `--text-*` do Tailwind, e a bijeção do `theme-tokens.test.ts` cresce para eles | A alternativa (`text-[17.5px]` espalhado) é permitida pela guarda — ela só proíbe cor arbitrária — mas espalharia a escala por 15 telas, e aí não há um lugar onde trocá-la |
| **I** | ⚠️ **Um `<link>` só do Google Fonts, como o §A.6 manda** | É o que o documento pede. **E fica registrado o preço, medido por leitura:** o `vite-plugin-pwa` precacheia o que está em `dist/`, e uma folha de estilo de `fonts.googleapis.com` não está — **offline, o app cai na fonte do sistema**. Auto-hospedar as quatro famílias em `public/fonts/` resolve, custa ~250 KB de `woff2` no precache, e **é pergunta em aberto para o dono**, não decisão desta fatia |
| **J** | **`meta theme-color` e o `background_color` do manifest passam a espelhar o `--bg` claro** (`#f5f1e8`) | O `theme-css.test.ts:300` já cobra esse espelhamento; ele só troca de token. Hoje o `meta` diz `#1c1a17`, que era o `--clube-fg` claro — ou seja, já estava espelhando a coisa errada |
| **K** | **Os cinco hexes do grifo não são tocados nesta fatia** | Decisão fechada do MVP 3.5: `HIGHLIGHT_COLORS` é dado persistido. Aqui os `--pen-*` só **nascem**; quem passa a pintar com eles é a Tarefa 47. ⚠️ **`highlight-palette.test.tsx` e `shared/src/highlight-color.ts` ficam intocados, e isso é para ser verificado por `git diff --stat`** |

---

## As regras

1. ⚠️ **Nenhum `.tsx` de produção no diff.** Medido: as 191 ocorrências de `--clube-` vivem
   em 20 arquivos, e em `.ts`/`.tsx` **todas são comentário ou código de teste** — nenhum
   componente lê o token por `style` inline. O diff de produção é:
   `packages/ui/src/theme.css` · `packages/ui/src/editor.css` (⚠️ **44 ocorrências, é o
   segundo maior**) · `packages/app/src/styles.css` · `packages/app/index.html` ·
   `packages/app/vite.config.ts` (o manifest). Mais os docblocks que **citam** o prefixo em
   `App.tsx`, `book.tsx`, `button.tsx`. **Prove com `git diff --name-only` colado no
   relatório.**

2. **Todo token de cor com `light-dark()`, exceção só para os quatro raios.**
   Acusador: `theme-css.test.ts`, os testes `gives every colour token ONE declaration` e
   `keeps the list of light-dark() exceptions closed`.
   ⚠️ **Mutante obrigatório:** declarar `--gold: #946d2c` (sem `light-dark`) e confirmar por
   leitura que entrou. Tem de acusar. Segundo mutante: tirar `--r-2` da lista fechada — o
   teste que exige que cada exceção exista de verdade tem de acusar.

3. ⚠️ **A decisão B com os dois sentidos testados (§7.1).**
   (a) o piso de 40 acusa um `theme.css` esvaziado — **mutante:** comentar metade do `:root`;
   (b) o filtro `--` pega um token que o filtro `--clube-` deixava passar — **mutante:**
   acrescentar `--gold-line-2: #d6ae64;` sem `light-dark()` e confirmar que a regra 2 o
   acusa. ⚠️ **Sem (b) a decisão B é afirmação, não medição**: o teste passaria igual com o
   filtro antigo.

4. ⚠️⚠️ **A decisão C, e ela é a mais fácil de estragar sem ninguém ver.**
   O `DANGER_STYLE` (`packages/app/src/pages/__tests__/anti-guilt-dom.ts`) é regex, e depois
   da troca ele tem de **morder de verdade**. Exigido:
   - um **par positivo** no mesmo arquivo de teste plantando os quatro jeitos de a cor
     entrar — `class="text-danger"`, `class="bg-danger"`, `class="text-[#b3261e]"` e
     `style="color: var(--danger)"` — e provando que cada um é acusado;
   - **mutante:** apagar só o ramo `--danger` do regex. O par positivo tem de ficar vermelho.
   ⚠️ **Não basta rodar a suíte e ver verde:** verde aqui é exatamente o sintoma de uma
   guarda que parou de guardar.

5. **A bijeção token ↔ utilitário continua valendo nos dois sentidos**, e cresce para os
   namespaces `--font-` e `--text-` (decisão H).
   Acusador: `theme-tokens.test.ts`.
   **Mutantes:** (a) declarar `--leader` sem utilitário → "maps every declared token to a
   utility" acusa; (b) apontar um utilitário para `--nao-existe` → "points every utility at
   a token that exists" acusa. **Os dois com acusador nomeado.**

6. ⚠️ **O `editor.css` entra na fatia, e ele é o que mais esconde erro.** São 44 referências
   e o editor é a peça central do produto. Depois da troca, `editor-css.test.tsx` — que lê o
   arquivo do disco, injeta, renderiza o `RichEditor` **real** e lê `getComputedStyle` —
   tem de continuar verde. ⚠️ **`var(--nao-existe)` pinta transparente em silêncio**, que é
   o defeito que o `theme-tokens.test.ts:248` descreve por escrito. **Varra o `editor.css`
   atrás de `var(--` e confira cada nome contra o `:root` novo, um a um, e cole a lista.**

7. **Um catálogo só, e nenhuma chave nova nesta fatia.** Texto é da Tarefa 40.

8. ⚠️ **Os documentos, com riscar-e-explicar e data (2026-09-19):**
   - **`docs/EDITOR.md` §13** — ele lista `--clube-card`, `--clube-raised`, `--clube-muted`,
     `--clube-faint`, `--clube-error`, `--clube-shadow-lg` e `--radius-card`. ⚠️ **Nenhum
     dos sete existe, nem nunca existiu** (`theme.css` tem `--clube-surface`,
     `--clube-surface-raised`, `--clube-fg-muted`, `--clube-fg-subtle`, `--clube-danger`,
     `--clube-shadow-popover`, `--clube-radius`). É a lição do `dayRange` que o `CLAUDE.md`
     registra: **um nome que não existe faz o próximo leitor procurar, não achar, e inventar
     um terceiro nome para a mesma coisa.** Reescreva a lista com os nomes novos e registre
     que ela estava errada desde a Tarefa 14;
   - **`README-IA.md`** — "Como renomear o projeto" perde o item dos tokens CSS (passa de
     sete lugares para seis); e ⚠️ **`docs/new-ui.md` e `docs/ui/` entram na árvore e na
     tabela "O papel de cada arquivo"** — hoje nenhum dos dois é citado em lugar nenhum;
   - **`docs/new-ui.md`** — o §A.5 item 9 ganha a nota de que **a remoção do `atRisk` foi
     recusada pelo dono em 2026-09-19**, porque o ADR 0010 vence, e a outra metade do item
     (o nome do autor na tela do dia) segue viva, na Tarefa 42.
   ⚠️ **Prosa deste repositório se edita com script `.mjs` no scratchpad rodado com `node`,
   que conta a âncora e estoura se não for exatamente 1** — nunca heredoc, nunca `sed` com o
   texto inline. Alguns arquivos são CRLF: normalize para LF em memória e devolva o final de
   linha original.
   ⚠️ **`docs/tasks/13-*.md`, `14-*.md` e `16-*.md` citam `--clube-` e NÃO se mexe neles**:
   são registro histórico do que foi feito naquele dia, não documentação viva.

9. **Gates, com os números medidos hoje (2026-09-19, tudo verde):**

   | | arquivos | testes |
   | --- | --- | --- |
   | `@clube/shared` | 22 | **590** |
   | `@clube/ui` | 23 | **195** |
   | `@clube/backend` (unit) | 85 | **1975** |
   | `@clube/app` | 34 | **811** |

   `pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` ·
   `pnpm --filter @clube/app build`.
   Build de hoje: entrada **433.828 B** (teto 450.000 — **sobram 16.172**) · editor
   **453.606 B** · CSS **22.714 B** · precache **16 / 900,65 KiB**.
   ⚠️ **O chunk de entrada não pode subir nesta fatia** — ela não acrescenta JavaScript
   nenhum. O CSS pode subir um pouco (tokens novos); **cole os dois números**.
   ⚠️ **A suíte de integração do backend não é gate aqui**: esta fatia não toca o backend, e
   rodá-la exige o banco de desenvolvimento do dono.

10. **Nenhuma migration, nenhum endpoint, nenhum schema.** Se parecer preciso, **pare**.

---

## Definição de pronto

- [x] `packages/ui/src/theme.css` declara os 43 tokens do canvas com os nomes do canvas,
      mais `--ring`, `--accent-soft`, `--scrim`, `--shadow-sheet`, `--shadow-popover`, os
      quatro raios e os seis tokens de avatar de hoje — cada cor numa declaração só, com
      `light-dark()`.
- [x] Os valores batem com o canvas **valor a valor**; a conferência está colada no
      relatório (claro de `Main.dc.html`, escuro de `DiaEscuro.dc.html`).
- [x] `color-scheme` continua declarado em exatamente três seletores, e só no `theme.css`.
- [x] A decisão B entregue: o discriminador é `--`, o piso é 40, e **os dois mutantes da
      regra 3 acusaram** — com o número e o nome de cada acusador.
- [x] A decisão C entregue: `DANGER_STYLE` casa `--danger`, o par positivo cobre os quatro
      jeitos, e **apagar o ramo deixa o par vermelho**.
- [x] A bijeção token ↔ utilitário fecha nos dois sentidos, incluindo `--font-*` e
      `--text-*`; os dois mutantes da regra 5 acusaram.
- [x] `--success` e `--color-black` saíram; `--color-*: initial` ficou sem exceção.
- [x] `editor.css` não tem nenhum `var(--)` apontando para token inexistente — a lista
      conferida um a um está colada.
- [x] O `<link>` das quatro famílias está no `index.html`, e `index-html.test.ts` continua
      verde (o script de tema segue síncrono e antes do módulo).
- [x] `meta theme-color` e `background_color` do manifest = `#f5f1e8`, com o teste do
      espelhamento verde.
- [x] `HIGHLIGHT_COLORS`, `highlight-palette.test.tsx` e `person-avatar.tsx` **intocados** —
      provado por `git diff --name-only`.
- [x] `EDITOR.md` §13, `README-IA.md` e `new-ui.md` corrigidos com riscar-e-explicar.
- [x] Gates verdes, com os números de antes e depois colados.
- [x] Varredura de caracteres invisíveis sobre os arquivos do diff, **provando antes que ela
      morde** com um soft hyphen e um NBSP plantados.

---

## Notas de reconciliação (2026-09-19, medidas na execução)

> Esta seção **não reescreve nada acima**. Ela registra o que foi **medido** ao executar,
> nos pontos em que a spec descrevia outra coisa. Molde: `docs/EDITOR.md` §15.

### 1. São **42** tokens no canvas, não 43

Contados por script nos dois artboards (`Main.dc.html`, claro; `DiaEscuro.dc.html`, escuro),
dentro do bloco `/*TOKENS*/`: **42** de cada lado, com os mesmos nomes na mesma ordem. A
tabela do §A.6 de `docs/new-ui.md` lista os mesmos 42 e bate valor a valor com os artboards.
O `--scrim` (decisão G) não está no bloco `/*TOKENS*/` de arquivo nenhum: ele é o `rgba()`
cru do backdrop em `Avulsa.dc.html`, e é por isso que a "Definição de pronto" acima o lista
**separado** dos tokens do canvas. O `43` era um a mais do que existe.

### 2. A regra 1 e a decisão G não podem valer as duas — e quem cede é a regra 1

A regra 1 diz "nenhum `.tsx` de produção no diff" e lista cinco arquivos. A decisão G manda
`--color-black` sair do `@theme inline`. **Medido:** com `--color-black` fora, o
`ui-source-scan.test.ts` fica vermelho em `emits every class packages/ui uses`, com
`[ 'bg-black/50' ]` — a classe do backdrop do `Sheet` deixa de compilar. Ou seja: cumprir a
decisão G **obriga** a editar `packages/ui/src/components/sheet.tsx`.

O `.tsx` tocado é **um**, e a mudança é **uma classe**: `bg-black/50` → `bg-scrim`. A lista
da regra 1 também esquecia `packages/ui/src/components/callout.ts`, que citava
`--clube-danger` em docblock.

### 3. A lista fechada de exceções ao `light-dark()` tem **15** entradas, não 4

A decisão D fixa a lista nos quatro raios; a decisão H põe **famílias e escala** como token
no `:root` do `theme.css`, e a "Definição de pronto" exige que a bijeção feche "incluindo
`--font-*` e `--text-*`" — o que só acontece se os valores forem tokens mapeados por
`var()`. Família tipográfica e corpo de texto **não são cor**, e o discriminador da decisão
B é `--`, sem exceção de nome. Logo os dois conjuntos entram na lista fechada, **pela mesma
razão dos raios e na mesma forma**: item nomeado, motivo escrito, e cada um tem de existir
de verdade no `:root`. A lista é hoje: os 4 raios + 4 `--family-*` + 7 `--size-*` = **15**.

Alargar o filtro para "só o que parece cor" foi considerado e recusado: seria devolver um
discriminador por FORMA do valor, e um `--x: rebeccapurple` voltaria a escapar — que é
exatamente o que a decisão B existe para impedir.

### 4. `--r-1: 2px` não aparece no canvas; `1px` aparece

Os raios vieram do §A.6 de `docs/new-ui.md` ("`--r-1: 2px`, `--r-2: 3px`, `--r-3: 4px`,
`--r-pill: 999px`"). **Medido nos 22 artboards:** `999px` (116×), `4px` (32×), `3px` (17×),
`1px` (8×), `5px` (3×), `10px` (1×) — **`2px` não aparece nenhuma vez**. Mantive o `2px` do
documento, porque é ele que a decisão do dono nomeia; fica registrado que o canvas usa `1px`
no lugar que `--r-1` ocuparia. ⚠️ E o **bottom sheet** do canvas tem `10px 10px 0 0` no topo,
que a escala de quatro raios não tem: `--radius-sheet` aponta para `--r-3` (4px). Quem
reescreve o `Sheet` é a Tarefa 41.

### 5. As duas sombras **não** mudam com o tema no canvas

O `theme.css` afirmava desde a Tarefa 13 que "no escuro precisa ser mais funda" e escurecia
o lado escuro por conta própria. **Medido:** `Dia.dc.html` (claro) e `DiaEscuro.dc.html`
(escuro) declaram a MESMA sombra de menu de bolha — `0 10px 26px -14px rgba(20,30,20,0.45)`.
A do sheet só existe em `Avulsa.dc.html` (claro): `0 -14px 40px -18px rgba(20,30,20,0.55)`.
Os dois lados do `light-dark()` ficaram **iguais**, com o motivo escrito no arquivo. O
`light-dark()` continua ali porque a regra 2 o exige de todo token de cor — o mesmo vale
para `--scrim` (um valor só no canvas) e para `--ring` (o canvas pinta o foco com `--gold`
nos dois temas, então os dois lados são `var(--gold)`).

> ⚠️ **Pergunta em aberto para o dono:** `light-dark()` com os dois lados iguais é o preço
> de a lista de exceções ser fechada por NOME. A alternativa seria deixar um token **alias**
> (`--ring: var(--gold)`) fora da exigência — e ela é defensável, porque um alias de um token
> que já é `light-dark()` não tem o defeito que a regra 2 caça. Não abri a decisão D por
> conta própria.

### 6. O que a decisão I custa, medido e ainda em aberto

O `<link>` do Google Fonts não entra no precache do `vite-plugin-pwa` (ele precacheia o que
está em `dist/`). **Offline, o app cai na fonte do sistema.** Registrado em três lugares —
`index.html`, `theme.css` e `index-html.test.ts` — e **é pergunta para o dono**, não decisão
desta fatia.

---

## Notas de reconciliação — rodada de correção da auditoria (2026-09-19)

> Um revisor independente auditou a fatia e **derrubou três afirmações que diziam "medido"**.
> As notas 7 a 13 registram o que foi corrigido, o que passou a ter guarda e o que fica
> pendente do dono. Mesma regra das notas 1 a 6: **nada acima foi reescrito**.

### 7. O anel de foco: a frase do `theme.css` era falsa, e o valor é do dono

O `theme.css` afirmava que "o canvas pinta o anel de foco com `--gold` nos DOIS temas
(`0 0 0 2px var(--surface), 0 0 0 3.5px var(--gold)`)". **Falso — medido pelo revisor e
RE-MEDIDO nesta rodada, nos artboards de verdade, comando a comando:**
`grep` por regra de foco (`:focus`, `:focus-visible`, `:focus-within`) nos **21** artboards
devolve **zero**; `outline` aparece em 18 dos 21 arquivos e é **sempre** `outline: none` —
essa é a única forma de `outline` que o canvas tem; o
`box-shadow` citado existe só em `Dia.dc.html:106` e `DiaEscuro.dc.html:106`, e é o `<span>`
da **bolinha da caneta selecionada** na paleta de grifo — não é foco. **O canvas não desenha
foco em lugar nenhum.**

A frase foi apagada e substituída pela verdade, com a medição escrita ao lado do token.

⚠️ **PERGUNTA EM ABERTO PARA O DONO — e o valor NÃO foi trocado nesta rodada.** Os critérios
de aceite "válidos para toda fase" do `docs/new-ui.md` pedem **anel de 3px
`color-mix(in oklch, var(--accent) 18%, transparent)`, com `outline` nunca removido**. O
entregue é `--gold` **opaco**, a 2px. São duas coisas diferentes, e escolher entre elas é
decisão de desenho, não de execução. O que está medido do valor entregue é que ele **passa**
os 3:1 de componente não textual nos dois temas (conferido por conta própria nesta rodada,
com a fórmula de luminância relativa da WCAG):

| tema   | anel      | vs `--bg` | vs `--surface` | vs `--surface-2` |
|--------|-----------|-----------|----------------|------------------|
| claro  | `#946d2c` | 4,16:1    | 4,31:1         | 3,97:1           |
| escuro | `#c89a44` | 6,90:1    | 6,40:1         | 5,74:1           |

Nenhuma tela desta fatia desenha foco ainda — quem desenha é a Tarefa 41 em diante. A decisão
pode esperar até lá, mas não pode ser esquecida: enquanto ela não existir, `--ring` é um
token sem consumidor cujo valor ninguém escolheu de propósito.

### 8. `@theme inline` EMITE, sim — quem resolve é a ordem dos `@import`

O `styles.css` afirmava, com a palavra "MEDIDO" na frente, que "`@theme inline` NÃO emite as
suas próprias variáveis no `:root`". **Falso, e medido pelo revisor no CSS compilado:** a
primeira regra de `dist/assets/index-*.css` é
`:root,:host{…--shadow-sheet:var(--shadow-sheet);--shadow-popover:var(--shadow-popover)}`.
Elas **são** emitidas e **são** auto-referentes.

O que salva o `--shadow-sheet: var(--shadow-sheet)` de ser uma referência circular é a
**ordem dos `@import`**: o `@import 'tailwindcss'` vem primeiro, o `:root` de
`@import '@clube/ui/theme.css'` sai depois com a mesma especificidade, e vence a cascata.

⚠️ **E nada pinava essa ordem.** Inverter os dois `@import` faz a sombra do sheet sumir em
silêncio — sem erro de build, sem teste de renderização vermelho. Guarda nova:
`imports tailwindcss BEFORE the theme tokens, so the real :root wins`
(`theme-css.test.ts`). **Mutante:** os dois `@import` invertidos → **1 acusador**, ele.

### 9. O `<link>` das fontes bloqueava o script de tema — e o teste pinava a ordem ruim

Um `<link rel="stylesheet">` pendente **bloqueia a execução de `<script>` clássico
posterior**. O script inline de tema existe para aplicar `data-theme` **antes da primeira
pintura** (decisão F da Tarefa 12, regra 27); com o `<link>` cross-origin na frente, isso
passou a depender de `fonts.googleapis.com` responder — e o flash branco volta em rede ruim,
offline ou com o domínio bloqueado.

A justificativa que estava escrita no teste — *"se o `<link>` nascer depois dele,
`keeps the theme script synchronous` passa a medir outro elemento"* — **era falsa**, e o
revisor mediu: aquele teste faz `head.lastIndexOf('<script')`, e um `<link>` não é um
`<script>`; ele fica verde nas duas posições.

Corrigido: o `<link>` foi **movido para depois** do script inline, ganhou um
`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` na frente (os `woff2`
vêm de outro domínio, e sem o `preconnect` a segunda negociação de TLS só começa depois de a
primeira responder), e a asserção foi **invertida** com a justificativa verdadeira:
`keeps the stylesheet AFTER the theme script, so the theme never waits on a third party`.
`keeps the theme script synchronous, not deferred (rule 27)` continua verde.
**Mutante:** `<link>` de volta na frente → **1 acusador**, o teste invertido.

### 10. A lista fechada de exceções era um esconderijo para cor

O teste se chamava `…and only for non-colours` e **não tinha uma linha que decidisse "é
cor"**. O revisor plantou `--x-qualquer: #ff0000` no `:root` (sem `light-dark()`), pôs o nome
na lista fechada e mapeou um `--color-x-qualquer` no `@theme inline`: **1.031 testes verdes**.
Uma cor chapada, congelada no valor claro dentro do tema escuro, entrava sem vermelho.

Corrigido com uma asserção de **forma sobre o valor de cada isenção**: raio e corpo de texto
casam `/^\d+(\.\d+)?(px|rem)$/`; família casa `/^[A-Za-z'"]/` e **não** contém `#`, `rgb`,
`hsl`, `oklch` nem `color-mix`; e um nome fora das três famílias isentáveis é recusado de
saída. Mais o **par positivo** (`refuses a colour smuggled into the closed list`), que prova
que a regra morde, e o par negativo, que prova que ela não recusa tudo.

⚠️ **Isto NÃO é o "discriminador por FORMA do valor" que a nota nº 3 recusou** — e a
diferença está escrita dentro do teste para ninguém desfazer. O **discriminador** (o que
entra na varredura) continua sendo `--`, sem olhar valor, exatamente como a decisão B fixou.
O que ganhou forma é a **isenção**, que é um privilégio nominal — e um privilégio sem
condição é um esconderijo. **Mutante:** o mutante 10 do revisor, replicado inteiro →
**1 acusador**, `keeps the list of light-dark() exceptions closed, and only for non-colours`.

### 11. Os sete sobreviventes do revisor, e as guardas que os mataram

Nenhum era equivalente. Todos morreram, e **nenhuma guarda nova pina texto de arquivo** — as
seis medem propriedade.

| mutante do revisor | guarda nova | acusadores |
|---|---|---|
| `--text` invertido | `keeps the text LEGIBLE on the three surfaces, in both themes` | 1 |
| `--danger` invertido (1,20:1) | `keeps the danger ink ON the danger paper, in both themes` | 1 |
| `--scrim` opaco (alpha 1) | `keeps the scrim TRANSLUCENT, in both themes` | 1 |
| `font-family` apagada do `body` | `dresses the whole interface from the body, with the UI family token` | 1 |
| `--family-reading: Georgia, serif` | `names in a --family-* token every family it asks Google Fonts for` | 1 |
| `theme_color: '#1c1a17'` | `gives the browser bar the SAME token as the splash screen` | 1 |
| `<link>` apagado (o outro lado do mesmo defeito) | `asks Google Fonts for every web family the tokens name` + 5 | 6 |

⚠️ **Duas lições da própria rodada, medidas:**

1. **Orientação não basta.** A primeira versão da guarda de `--text` só exigia "tinta mais
   escura que o papel no claro, e o inverso no escuro". O mutante **sobreviveu**: com
   `light-dark(#e8e4d6, #1a201a)` a orientação continua *certa* (1,13:1 no claro, 1,07:1 no
   escuro) e o app fica ilegível. A guarda só passou a morder quando virou **contraste** —
   4,5:1 contra as três superfícies, nos dois temas. O piso de hoje é 11,6:1.
2. **O cruzamento `<link>` ↔ `--family-*` mata dois mutantes com uma guarda**, e só porque
   vale **nos dois sentidos** (§7.1): toda família nomeada num `--family-*` que não seja
   pilha de sistema tem de estar pedida na URL do Google Fonts, e toda família pedida na URL
   tem de estar nomeada num token. Perder a Fraunces do token é acusado pelo sentido de
   volta; apagar o `<link>` é acusado pelo de ida.

### 12. `--color-danger-fg → --danger-bg` **passa** o contraste — a dívida é de NOME

Medido: o par `--danger` (tinta) × `--danger-bg` (papel) dá **6,78:1 no claro** e **9,69:1 no
escuro** — melhor que o par anterior, e bem acima dos 4,5:1 da regra 32. Não há defeito de
legibilidade.

O defeito é de **vocabulário**: o papel do erro só existe como utilitário chamado
`bg-danger-fg`, que lido em voz alta diz o contrário do que faz (`fg` é *foreground*, e o que
ele pinta é fundo). **Dívida registrada para a Tarefa 41**, que é quem reescreve o `Button` —
é lá que os dois nomes voltam a concordar. Até então, o comentário do `@theme inline` explica
a inversão no lugar onde ela é lida.

### 13. `--surface-today` e `--gold-soft` são o MESMO valor nos dois temas

`light-dark(#faf3e4, #2a2419)` nos dois. Vem assim do canvas, e não é engano de transcrição.
São dois tokens porque são dois **papéis** — "o dia de hoje no sumário" e "o véu do ouro" —
e o dia em que um dos dois mudar, muda sozinho.

Registrado aqui para as **Tarefas 44 e 45** não descobrirem isso do zero e "consertarem" a
duplicação apagando um dos dois. A bijeção token ↔ utilitário não reclama de valores iguais,
e é de propósito: ela amarra nome, não cor.

### 14. Dois números de prosa corrigidos

- `docs/BACKLOG.md` dizia **"43 tokens"** na linha da Tarefa 39, que acabara de ser marcada
  `[x]`. São **42** — a nota nº 1 acima já media isso, e o `BACKLOG.md` tem precedência maior
  que a spec de tarefa, então ficar com o número errado ali era pior do que na spec.
  Corrigido (arquivo **CRLF**, final de linha preservado).
- `theme.css` dizia **"Seis degraus"** e logo abaixo declarava **sete** `--size-*` (e "os
  seis estão na lista fechada", com sete na lista). Corrigido nas duas frases.

### 15. São **21** artboards, não 22 — e o resto do canvas foi reconferido

⚠️ **Terceiro número de prosa errado, e este eu quase repeti.** A nota nº 4 acima e o
relatório da auditoria dizem "os 22 artboards". **Contados:** o canvas tem **21** arquivos
`.dc.html` (`Acervo`, `Avulsa`, `Busca`, `Convite`, `CorrigirGrifo`, `Dia`, `DiaDesktop`,
`DiaEscuro`, `EditarLivro`, `Inicio`, `InicioDesktop`, `Livro`, `LivroDesktop`, `Main`,
`NaoEncontrada`, `NovaAnotacao`, `NovaAnotacaoDesktop`, `NovoGrifo`, `NovoGrifoDesktop`,
`NovoLivro`, `Preferencias`), mais um `canvas.json` e um `ds/grine/tokens.json`, que não são
artboards. O `22` foi herdado sem recontagem e entrou na nota nº 4, no relatório do revisor e
na primeira versão do comentário do `--ring` desta rodada. Corrigido nos dois lugares desta
rodada; a nota nº 4 fica como está, porque esta seção **não reescreve nada acima** — é esta
linha que a emenda.

A nota nº 4 fica de pé no que importa: **`2px` continua não aparecendo nenhuma vez** em
`border-radius` no canvas. As contagens dela, porém, saíram de um recorte diferente do meu
(`999px` 116 nos dois; `4px` 38 aqui contra 32 lá; `3px` 21 contra 17; `1px` 15 contra 8;
`5px` 4 contra 3; `10px` 2 contra 1). Não vale relitigar — a conclusão é a mesma nas duas
contagens, e o número que decide (`2px` = 0) bate.

Reconferido por conta própria nesta rodada, tudo batendo:

| afirmação | onde ela vive | conferido |
|---|---|---|
| 42 tokens de cada lado, mesmos nomes na mesma ordem | nota nº 1 | ✅ `Main.dc.html` 42, `DiaEscuro.dc.html` 42, ordem idêntica |
| `--surface-today` == `--gold-soft` nos dois temas | nota nº 13 | ✅ `#faf3e4` no claro, `#2a2419` no escuro, nos dois tokens |
| zero regra de foco, 18 `outline:none` | nota nº 7 | ✅ e o `outline:none` é a ÚNICA forma de `outline` no canvas |
| o `box-shadow` citado é a bolinha da caneta | nota nº 7 | ✅ `<span>` com `background:var(--pen-a);border:1.5px solid var(--pen-a-dot)` |
| `@theme inline` emite `:root,:host{…--shadow-sheet:var(--shadow-sheet)…}` | nota nº 8 | ✅ no `dist/assets/index-*.css` desta rodada, e a declaração de verdade vem depois |

---

## Notas de reconciliação — as três decisões do dono (2026-09-20)

> As três pendências que a rodada de correção deixou em aberto voltaram decididas. As notas
> 16 a 18 registram o que foi implementado, o que foi medido e o que mudou de forma. Mesma
> regra: **nada acima é reescrito**.

### 16. O anel de foco: o §A.6 literal — contorno sólido **mais** halo

O dono leu o critério de aceite como ele está escrito: "`outline` nunca removido" **e** "anel
de 3px `color-mix(in oklch, var(--accent) 18%, transparent)`" são a MESMA frase, não duas
alternativas. ⚠️ E o motivo é medido: **o halo de 18% sozinho dá ~1,4:1 contra o creme** — ele
não é visível por si. Entregar só o `color-mix()` seria entregar um foco que não se vê.

O que mudou:

- **`--ring` passou a seguir `--accent`** (era `--gold` fixo). Contraste do contorno, medido
  com a fórmula de luminância relativa da WCAG:

  | tema   | contorno  | vs `--bg` | vs `--surface` | vs `--surface-2` |
  |--------|-----------|-----------|----------------|------------------|
  | claro  | `#143524` | 11,91:1   | 12,34:1        | 11,36:1          |
  | escuro | `#c89a44` | 6,90:1    | 6,40:1         | 5,74:1           |

  O `--gold` que ocupava o lugar dava 4,16 / 4,31 / **3,97** no claro — contra `--surface-2`
  ele **não** passava os 3:1 de componente não textual. A troca quase triplica o contorno no
  tema claro e conserta o caso que reprovava;
- **`--ring-halo` nasceu**, derivado de `--accent` por `color-mix(in oklch, … 18%,
  transparent)` — nunca um hex. Mesma razão do `--accent-soft`: a cor de ação não se duplica;
- **`--color-focus-halo`** entrou no `@theme inline` (a bijeção continua fechando);
- ⚠️ **`packages/ui/src/components/styles.ts` foi tocado** — `FOCUS_RING` ganhou
  `focus-visible:ring-3 focus-visible:ring-focus-halo`. É a **segunda exceção documentada à
  regra 1** (a primeira foi o `sheet.tsx`, nota nº 2), e pela mesma lógica: ele é o consumidor
  do token, e deixar `--ring` certo com `FOCUS_RING` errado seria pior que a exceção.

⚠️ **Nenhuma classe de cor arbitrária.** O halo sai de token. `ring-3` é largura, não cor.

Guardas novas, e a separação entre elas é de propósito (§7.9): `theme-tokens.test.ts` prende
os **tokens**, `ui/src/__tests__/focus-ring.test.ts` (arquivo novo) prende a **lista de
classes**. Um `--ring` perfeito com um `FOCUS_RING` dizendo `outline-none` é um app sem foco
visível, e até esta rodada o `FOCUS_RING` não tinha acusador NENHUM.

O teste `never ships the halo WITHOUT the solid outline` existe só para uma coisa: impedir que
alguém entregue metade da frase do §A.6. Ele é o que teria pegado a primeira entrega.

### 17. Os cinzas: `--text-subtle` conserta, `--text-faint` ganha guarda de primeiro uso

**Conferido por conta própria antes de gravar**, contra as TRÊS superfícies (`--bg`,
`--surface`, `--surface-2`) e nos dois temas:

| token / lado                  | contraste              | fecha 4,5:1? |
|-------------------------------|------------------------|--------------|
| `--text-subtle` claro `#74786e` | 4,00 / 4,15 / 3,82   | **não**      |
| `--text-subtle` claro `#6b6f66` | 4,55 / 4,72 / **4,35** | **não** — contra `--surface-2` |
| `--text-subtle` claro `#686c63` | 4,76 / 4,93 / 4,54   | **sim**      |
| `--text-subtle` escuro `#86847f` | 4,76 / 4,41 / 3,96  | **não**      |
| `--text-subtle` escuro `#95938e` | 5,79 / 5,37 / 4,82  | **sim**      |

⚠️ **O `#6b6f66` que a decisão nomeava NÃO fecha**: ele dá 4,35:1 contra `--surface-2`, que é
a cor do bottom sheet e do popover — e campo dentro de sheet é caso real. Como a decisão
previa ("se não fechar, escureça até fechar e diga o valor"), **usei `#686c63`**.

⚠️ **O lado escuro confirmou o que o revisor mediu** (4,41 contra `--surface`, e pior ainda
3,96 contra `--surface-2`) e foi corrigido também. **Mas fechando contraste no escuro se
CLAREIA, não se escurece** — a tinta está sobre papel escuro. A decisão dizia "escureça o lado
escuro também"; escurecer teria piorado os três números. Usei `#95938e`.

A hierarquia dos três cinzas continua monotônica nos dois temas (`muted` > `subtle` > `faint`
em contraste), e isso ganhou guarda própria: escurecer um cinza até ele virar o vizinho é o
jeito de "passar" destruindo a coisa.

**`--text-faint` fica com o valor do canvas e não passa** (2,45 claro / 2,58 escuro). Junto
veio a guarda que o dono pediu: `refuses the FIRST USE of text-faint while it fails contrast`
varre `packages/{app,ui}/src` e fica vermelha no primeiro uso. Está escrito **dentro do
teste** que a saída é escurecer o token, não apagar a guarda.

⚠️ **E a garantia que sumiu voltou.** A frase "passa 4,5:1 nos dois temas" existia no
comentário do token e foi apagada **no mesmo commit em que o valor deixou de cumpri-la** — é
isso que a torna perigosa, e é por isso que ela voltou com os seis números colados ao lado.

### 18. As fontes: auto-hospedadas, e a guarda mudou de lado

O `<link>` do Google Fonts e o `preconnect` saíram do `index.html`. Os dez `.woff2` moram em
`packages/app/public/fonts/` e os `@font-face` em `packages/app/src/fonts.css`.

⚠️ **São 10 arquivos e não 20, e isso foi MEDIDO, não suposto.** O Google serve 20
`@font-face` para latin/latin-ext, apontando para 10 arquivos distintos, porque três das
quatro famílias são variáveis. Conferido lendo o diretório de tabelas de cada `.woff2` (sem
descomprimir — os nomes de tabela ficam em claro no cabeçalho):

| família          | tabelas | `fvar`? | declaração |
|------------------|---------|---------|------------|
| Fraunces         | 20      | SIM     | `font-weight: 400 600` |
| Geist            | 20      | SIM     | `font-weight: 400 600` |
| Geist Mono       | 20      | SIM     | `font-weight: 400 500` |
| Instrument Serif | 17      | não     | `font-weight: 400`, romana e itálica separadas |

Faixa de peso numa fonte estática faria o navegador sintetizar negrito; peso cravado numa
variável jogaria fora os intermediários. Por isso a tabela decide a declaração, e não o
contrário.

⚠️ **`woff2` entrou no `globPatterns` do `vite.config.ts`, e sem isso a decisão não valeria
nada**: os arquivos iriam para o `dist/`, o CSS os pediria, e offline o app cairia na fonte do
sistema — o defeito exato que auto-hospedar comprou, só que agora pagando 277 KB para não
resolvê-lo. **Nada no projeto acusava isso**, então nasceu
`⚠️ precaches EVERY self-hosted font` em `bundle-guard.test.ts`, que lê o `sw.js` emitido. É a
**quinta** aparição da classe "a guarda pina o texto do config em vez do comportamento" (29a,
34b, 38, 38d e esta).

**A guarda do cruzamento mudou de lado e ganhou uma terceira ponta:**

```
--family-*  ↔  @font-face  ↔  arquivo existente em disco
```

A terceira é nova e é a pior de todas: um `url()` quebrado não dá erro de build nem muda um
teste de renderização — o navegador tenta, falha e usa o fallback. Com a folha do Google isso
era impossível por nossa causa; com arquivo nosso, um `mv` basta.

⚠️ **O `index.html` encolheu de 4,22 kB para 1,63 kB.** Eu mesmo medi, na rodada anterior, que
1,35 KiB de comentário embarcava para todo visitante, e o dono mandou cortar: a casca do PWA
não é lugar de argumento. O porquê foi para o teste e para a spec, que ninguém baixa.
