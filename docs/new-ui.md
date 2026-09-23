# Reestruturar a UI do Clube do Livro — leia, planeje, depois execute

Você está no repositório do **Clube do Livro** e tem acesso ao canvas de design abaixo. Sua tarefa tem **duas fases**. Não comece a escrever código antes de eu aprovar o plano da Fase A.

**Canvas de design (fonte de verdade visual):**
https://claude.ai/artifact/YDHTxyof7ji1xqKhoocdDt

---

## FASE A — Ler tudo e me entregar um plano

Nesta fase você **não altera nenhum arquivo do app**. Você lê, entende e escreve o plano. Use subagentes em paralelo se ajudar a ler repositório e design ao mesmo tempo.

### A.1 — Leia o canvas de design

O link acima é um artifact do tipo **Design** (canvas). Ele guarda o conteúdo nos próprios arquivos, sob `project/`:

1. Leia **`project/canvas.json`** — é o índice. Cada chave de `boards` é um arquivo de artboard, com posição (`x`, `y`) e título.
2. Leia os arquivos **`project/<Nome>.dc.html`** — cada um é uma tela inteira, autocontida.

O canvas está organizado em três fileiras:

| Fileira | `y` | O que é |
|---|---|---|
| **Claro · celular** | `0` | as 15 telas do app, na ordem do produto, 390×1100 |
| **Escuro · celular** | `1550` | as mesmas 15 telas no tema escuro (sufixo `Escuro` no nome do arquivo) |
| **Desktop** | `3080` | 5 telas em 1280px, mostrando o layout de duas colunas |

As 15 telas, em ordem, e o arquivo de cada uma:

| # | Tela | Rota | Artboard |
|---|---|---|---|
| 1 | Entrar | `/login` | `Main.dc.html` |
| 2 | Aceitar convite | `/convite/:code` | `Convite.dc.html` |
| 3 | Início | `/` | `Inicio.dc.html` |
| 4 | O livro | `/books/:bookId` | `Livro.dc.html` |
| 5 | Anotação do dia | `/books/:bookId/days/:planItemId` | `Dia.dc.html` |
| 6 | Nova anotação | `/books/:bookId/notes/new` | `NovaAnotacao.dc.html` |
| 7 | Anotação avulsa | `/books/:bookId/notes/:noteId` | `Avulsa.dc.html` |
| 8 | Acervo do livro | `/books/:bookId/acervo` | `Acervo.dc.html` |
| 9 | Novo grifo | `/books/:bookId/highlights/new` | `NovoGrifo.dc.html` |
| 10 | Corrigir o grifo | `/books/:bookId/highlights/:id` | `CorrigirGrifo.dc.html` |
| 11 | Novo livro | `/clubs/:clubId/books/new` | `NovoLivro.dc.html` |
| 12 | Editar o livro | `/books/:bookId/edit` | `EditarLivro.dc.html` |
| 13 | Busca | `/busca` | `Busca.dc.html` |
| 14 | Preferências | `/preferencias` | `Preferencias.dc.html` |
| 15 | Não encontrada | `*` | `NaoEncontrada.dc.html` |

Desktop: `InicioDesktop`, `DiaDesktop`, `LivroDesktop`, `NovaAnotacaoDesktop`, `NovoGrifoDesktop`.

**Como ler um artboard.** Cada `.dc.html` tem um bloco `<helmet><style>` com os tokens de cor entre os marcadores `/*TOKENS*/` e `/*/TOKENS*/`, e depois markup com estilos inline que usam `var(--token)`. O arquivo claro e o arquivo escuro da mesma tela são **idênticos exceto por esse bloco** — é exatamente o contrato de `light-dark()` que vamos implementar no `theme.css`.

**Importante: não transcreva esse HTML para React.** Os artboards são maquetes estáticas. O que você extrai deles é: os valores dos tokens, a hierarquia tipográfica, a estrutura e a ordem dos blocos, os textos, os estados mostrados (erro, vazio, hoje, selecionado) e as medidas (alturas de barra, larguras de coluna, paddings). A implementação é feita com os componentes reais de `packages/ui`.

### A.2 — Leia o repositório

Levante, com caminhos de arquivo:

- Todo componente em `packages/ui` — o que ele expõe hoje (props, variantes, estados).
- `theme.css` e como os tokens são consumidos hoje (Tailwind v4, sem `tailwind.config.js`).
- `App.tsx` (o shell) e o roteador.
- Cada uma das 15 telas: onde o arquivo está, que componentes usa, que estados renderiza.
- `packages/shared/src/locales/pt.ts` — o catálogo inteiro de textos, e o teste que proíbe palavras de cobrança.
- O `RichEditor` (TipTap): extensões ativas, barra atual, menu `/`, autosave (1,5 s) e a fila offline em IndexedDB.
- Qualquer teste que trave layout, texto ou snapshot e que vá quebrar com a mudança.

### A.3 — O contexto do produto (para você julgar bem, não só seguir)

Clube de leitura em grupo. Hoje é um clube de casal; banco e rotas já são multi-clube e multiusuário. Mobile-first, PWA, usado **à noite, na cama, com o livro de papel na mão**.

O ciclo: um admin cadastra o livro do mês com um plano dia a dia (cada dia tem um tema) → todo mundo lê o mesmo trecho no mesmo dia → cada pessoa escreve a anotação do dia num editor rico, registra grifos (trecho do livro de papel digitado à mão, com cor de caneta, página e comentário) e marca "li hoje" → todo mundo vê o que os outros escreveram → cada ação vira evento no feed e push.

**Regras invioláveis. Quebrar qualquer uma é bug, não escolha de design:**

- **Tom anti-culpa.** Sem percentual de progresso, sem barra que enche, sem placar. Progresso é *presença* — uma marca por leitor, por dia. A única contagem é a corrente de dias seguidos.
- **Nenhum texto solto no JSX.** Tudo vem de `pt.ts`. Português no conteúdo, inglês no código.
- **44px de alvo mínimo** em tudo que se toca. Foco sempre visível.
- **Sem emoji** em lugar nenhum da UI. O vocabulário é ícone de linha, stroke 1.6.
- **Contraste 4.5:1** (3:1 acima de 24px), no claro e no escuro.
- Dentro do clube **não existe conteúdo privado**: o filtro "Tudo · Minhas · De Bruno" é navegação, não permissão.

### A.4 — A direção, em duas frases

**Edição crítica** — no desktop a tela se parte em coluna de leitura (680px) e margem (320px, separada por filete vertical) com o aparato: o que o clube escreveu, os grifos, o feed, as correntes. No celular a margem vira seção abaixo do conteúdo.

**Caderno encadernado** — papel creme, serifa de leitura, filetes hairline em vez de cartões com sombra, rótulos de seção em monoespaçada maiúscula espaçada, filete duplo como abertura. Serifa para leitura e títulos; a UI (botões, campos, rótulos) continua em sans.

### A.5 — O que muda de comportamento (não é só pele)

Estas decisões estão desenhadas nos artboards; liste no plano onde cada uma encosta no código:

1. **O editor perde a caixa e a barra fixa.** Serifa 17,5px/1,72 no celular e 19px/1,75 no desktop, medida máxima 620px, sem borda. Formatação vira **menu de bolha na seleção** (veja `Dia.dc.html`) mais o menu `/` que já existe. Fixas na tela ficam só as **5 canetas de grifo** + `Aa` + `/`, ancoradas acima do teclado no celular (barra de 62px) e no rodapé da coluna no desktop (56px). Autosave e fila offline **não mudam** — só o indicador, que vira nota de margem em mono.
2. **Barra de contexto nova**, abaixo do cabeçalho: `‹ A Coragem de Ser Imperfeito`. É a única navegação de volta do app hoje (não existe menu nem nav inferior) e nas telas de formulário ela também abriga a ação primária ("Criar anotação", "Registrar grifo", "Salvar").
3. ~~**As marcas do plano viram um glifo por leitor**: círculo vazado = leu; círculo cheio = leu e escreveu; ausente = não leu. Substitui o par ✓ + avatar. Legenda na margem do desktop.~~

   > ✅ **ENTREGUE NA TAREFA 44, EM 2026-09-22.** O par `ReadMarks` + `PersonAvatar`
   > deu lugar ao `PresenceMark` da Tarefa 41b nos dois papéis: vazado
   > (`Livro.dc.html:83`, `border` sem preenchimento) para quem leu, cheio (`:73`,
   > `background:var(--accent)`) para quem escreveu, e nada para quem não leu. A legenda
   > "As marcas" está na margem do desktop, com as duas amostras desenhadas.
   >
   > ⚠️ **O QUE MUDOU DE NATUREZA, e está escrito porque um teste mudou junto:** até
   > aqui a distinção era **glifo × letra** (um `<Check>` do lucide = leu, uma inicial =
   > escreveu). No canvas os dois são o MESMO círculo com a inicial, e o que separa é
   > **vazado × cheio**. O `it()` que media a propriedade antiga
   > (`book.test.tsx › tells READING apart from WRITING on the same row`) foi
   > **reescrito, não apagado**: a regra "distinguível sem depender de cor" continua, e
   > agora ela é medida procurando **qualquer** utilitário `bg-*` no vazado — o que mata
   > também o mutante que troca a forma por matiz.
   >
   > ⚠️ **UMA MEDIDA DO CANVAS NÃO VIROU PROP, e está declarada:** o desktop desenha
   > 19×19 (`LivroDesktop.dc.html:72`) contra os 18×18 do celular (`Livro.dc.html:73`).
   > Um pixel não paga uma prop; a marca fica em 18px nas duas larguras. A decisão é da
   > Tarefa 41b e esta fatia a herdou sem reabrir.

4. ~~**O plano vira sumário** com pontinhos de condução e data/página em mono à direita. Dia de hoje com fundo próprio e filete dourado; dias futuros apagados.~~

   > ✅ **ENTREGUE NA TAREFA 44, EM 2026-09-22.** A linha do plano é
   > `ListItem variant="sumario"` (Tarefa 41a), com a coluna de marcas de largura fixa, o
   > condutor pontilhado e a meta em mono à direita. O dia de hoje tem `--surface-today`
   > mais o filete `--gold-line` em cima e embaixo (`Livro.dc.html:139`), e o anel
   > `ring-accent` da Tarefa 17 morreu.
   >
   > ⚠️ **"DIAS FUTUROS APAGADOS" SAIU COM `--text-subtle`, E NÃO COM O
   > `--text-faint` QUE O CANVAS DESENHA** (`Livro.dc.html:149`). É **decisão do dono de
   > 2026-09-21**, registrada na nota nº 5 de `tasks/41a-*.md`: `--text-faint` dá 2,45:1
   > no claro contra 4,5:1 de piso, os três cinzas de legenda não cabem todos acima do
   > piso, e a intenção (o futuro mais apagado que a linha lida) fica preservada. O
   > `--text-faint` segue sem consumidor, com a guarda de primeiro uso da Tarefa 39
   > ativa — e ela foi exercitada por mutante nesta fatia.
   >
   > ⚠️ **E A DATA/PÁGINA MIGROU DE SLOT, cobrada pelo COMPILADOR.** Ela era o
   > `subtitle` desde a Tarefa 17; o braço `sumario` declara `subtitle?: never`, e o
   > `tsc` recusou a combinação (`TS2322`), que é o que a nota do `ListItemLook` da
   > 41a previu por escrito. A função mudou de nome junto (`subtitleFor` → `endFor`),
   > porque um nome que aponta para o slot errado é a lição do `dayRange`.

5. ~~**Lombada tipográfica** no lugar da capa ausente — é o padrão, já que ninguém preenche `coverUrl`.~~

   > ✅ **ENTREGUE NA TAREFA 44, EM 2026-09-22.** O `BookSpine` da Tarefa 41b abre o
   > corpo da tela do livro, nos dois tamanhos que o canvas mede: 58×84 no celular
   > (`Livro.dc.html:44`) e 88×128 acima de 1120px (`LivroDesktop.dc.html:47`).
   >
   > ⚠️ **DUAS LOMBADAS NO DOM, e a duplicação tem guarda.** O tamanho é prop e o
   > corte é media query, então as duas ficam montadas e o CSS esconde uma. Medido: apagar
   > o `hidden min-[1120px]:flex` da lombada de desktop — duas lombadas lado a lado em
   > toda largura — passava por **926 testes do app sem um vermelho**. Tem acusador agora.
   >
   > ⚠️ **E O `h1` NÃO SE MOVEU.** O canvas põe a lombada à ESQUERDA do título; o
   > `h1` é do `Screen` desde a Tarefa 42, e trazê-lo para a tela mexeria no cromo de dez
   > telas por causa de uma. Divergência declarada: a lombada abre o corpo, com o autor e a
   > posição no plano ao lado dela.
6. **O Acervo recolhe as quatro faixas de filtro** numa linha de resumo + botão "Refinar" que abre bottom sheet no celular / painel na margem no desktop. Filtros ativos viram chips removíveis. As faixas em si não mudam.
7. **O grifo é o próprio papel grifado**: o campo do trecho tem o fundo da caneta escolhida, com aspa serifada pendurada, e repinta ao trocar de cor.
8. **"Cadastrar o livro do mês" desce** para o rodapé do Início, como link — é ação de admin e hoje ocupa o primeiro lugar da tela.
9. **Corrigir dois defeitos que já existem:** ~~na tela do dia o autor aparece como "Alguém do clube" (o livro, o acervo e o feed já resolvem o nome — resolva aqui também)~~; e ~~a frase de alerta de perda de sequência sai, porque é a única frase do app que cobra~~.

   > ⚠️ **METADE DESTE ITEM FOI RECUSADA PELO DONO EM 2026-09-19, e a outra metade segue
   > viva.**
   >
   > **Recusada — a remoção do alerta de perda de sequência.** `pages.home.streak.atRisk`
   > **FICA**. O `docs/adr/0010-*.md` registra que o dono foi avisado de que a moldura de
   > perda contraria o §1 do plano ("o sistema não pune ausência de registro") e
   > **reafirmou o pedido**; a precedência do `README-IA.md` põe ADR acima de spec, e o
   > dono reconfirmou na rodada de decisões do MVP 3.5. A divergência fica escrita nos
   > dois lugares — aqui e no `docs/BACKLOG.md` — em vez de sumir de um deles.
   >
   > ~~**Viva — o nome do autor na tela do dia.** Ela é a **Tarefa 42**, e o diagnóstico foi
   > medido: a tela diz "Alguém do clube" desde a Tarefa 18, com um comentário de catálogo
   > afirmando que não havia rota de membros — e `GET /clubs/:clubId/members` existe desde
   > a Tarefa 26a, com **quatro** telas já usando.~~
   >
   > ✅ **ENTREGUE NA TAREFA 42, EM 2026-09-21 — e eram DUAS telas e SEIS usuários, não
   > uma e quatro.** A metade viva deste item fecha aqui. Medido antes de escrever
   > (`grep -rn "nameOfWriter" packages/app/src/pages/*.tsx`): quem já
   > resolvia o nome pelo `nameOfWriter` eram **seis** telas — `acervo`, `activity-feed`,
   > `book`, `busca`, `reading-marks` e `streak-bar` —, e quem dizia "Alguém do clube"
   > eram **duas**: a do dia (`day-note.tsx`) e a **avulsa** (`free-note.tsx`), que este
   > item não citava. As duas passaram a resolver o nome pelo mesmo `club-names.ts`, o
   > avatar recebe o mesmo nome que o texto mostra, e as chaves
   > `pages.dayNote.others.author` e `pages.freeNote.author` morreram — o genérico ficou
   > com um dono só (`pages.acervo.item.author.other`).
   >
   > ⚠️ **A metade RECUSADA continua como está**: `pages.home.streak.atRisk` fica, pelo
   > ADR 0010 e pela reconfirmação do dono. Ela não foi tocada nesta fatia.

### A.6 — Os tokens

Extraia os valores do bloco `/*TOKENS*/` dos artboards — claro de qualquer arquivo da fileira de cima, escuro de qualquer arquivo da de baixo — e monte `theme.css` com `light-dark()`. Confira contra esta tabela; se divergir, o canvas manda e você me avisa da divergência.

| Token | Claro | Escuro |
|---|---|---|
| `--bg` | `#f5f1e8` | `#17181a` |
| `--surface` | `#f9f5ec` | `#1e1f22` |
| `--surface-2` | `#f0ece0` | `#26282b` |
| `--surface-today` | `#faf3e4` | `#2a2419` |
| `--border` | `#d8d1bf` | `#303236` |
| `--border-soft` | `#e3ddc9` | `#26282b` |
| `--border-strong` | `#a89e80` | `#44464a` |
| `--leader` | `#babcb2` | `#3a3c40` |
| `--leader-future` | `#d4d6cc` | `#2e3033` |
| `--text` | `#1a201a` | `#e8e4d6` |
| `--text-muted` | `#565b52` | `#a3a19c` |
| `--text-subtle` | ~~`#74786e`~~ **`#686c63`** | ~~`#86847f`~~ **`#95938e`** |
| `--text-faint` | `#9a9d92` | `#5c5a55` |
| `--accent` | `#143524` | `#c89a44` |
| `--accent-hover` | `#1b4632` | `#d6ae64` |
| `--accent-fg` | `#f5f1e8` | `#17181a` |
| `--gold` | `#946d2c` | `#c89a44` |
| `--gold-strong` | `#785822` | `#d6ae64` |
| `--gold-line` | `#d6ae64` | `#4a3c1c` |
| `--gold-soft` | `#faf3e4` | `#2a2419` |
| `--person-bg` / `--person-border` / `--person-fg` | `#dde9e2` / `#b5d3c3` / `#1b4632` | `#24312a` / `#3a5346` / `#b5d3c3` |
| `--spine-bg` / `--spine-edge` / `--spine-fg` | `#143524` / `#0f2419` / `#dde9e2` | `#1e3a2c` / `#132720` / `#cfe0d6` |
| `--spine2-bg` / `--spine2-edge` / `--spine2-fg` | `#785822` / `#5c4317` / `#f5ead4` | `#5c4317` / `#3d2c0f` / `#ecd8b0` |
| `--pen-a` / `--pen-a-dot` | `#f0e2b4` / `#c89a44` | `#4a3c1c` / `#c89a44` |
| `--pen-v` / `--pen-v-dot` | `#d7e5d5` / `#4a8e6e` | `#23372c` / `#4a8e6e` |
| `--pen-l` / `--pen-l-dot` | `#f2ddc9` / `#a9613a` | `#3d2a1e` / `#b87a4e` |
| `--pen-z` / `--pen-z-dot` | `#d8e0e8` / `#52708c` | `#22303b` / `#6c8aa6` |
| `--pen-r` / `--pen-r-dot` | `#f0dade` / `#9c5a6b` | `#3a2830` / `#b0768a` |
| `--danger` / `--danger-bg` | `#7a3520` / `#f4dcd0` | `#f4c4ac` / `#3a1e15` |
| `--sel` (seleção de texto) | `#cfe0d6` | `#2e3a34` |

Raios: `--r-1: 2px`, `--r-2: 3px`, `--r-3: 4px`, `--r-pill: 999px`. Nada de `rounded-2xl`. Cartão é borda, não sombra — sombra só em bottom sheet, modal e menu de bolha.

> ⚠️ **`--text-subtle` foi corrigido em 2026-09-20, por decisão do dono, e o valor riscado
> acima é o do canvas.** Os dois lados reprovavam o contraste de TEXTO (4,5:1) contra pelo
> menos uma das três superfícies — claro `#74786e`: 4,00 / 4,15 / **3,82**; escuro `#86847f`:
> 4,76 / **4,41** / **3,96** (ordem: `--bg`, `--surface`, `--surface-2`). Os valores novos dão
> 4,76 / 4,93 / 4,54 e 5,79 / 5,37 / 4,82. É o token do *placeholder* e da dica de campo —
> texto que alguém precisa ler para saber o que digitar —, e os critérios de aceite desta
> seção já diziam que "os pontos de risco são os cinzas de legenda". Agora há acusador:
> `app/src/__tests__/theme-tokens.test.ts`.
>
> ⚠️ **`--text-faint` fica com o valor do canvas e NÃO passa** (2,45 / 2,58). O dono aceitou
> porque **nenhuma tela usa `text-faint` hoje** — e junto veio a guarda do primeiro uso: o dia
> em que alguém o usar, a suíte fica vermelha, e a saída é escurecer o token.

**Fontes**: ~~um único `<link>` do Google Fonts~~ → **auto-hospedadas em `public/fonts/`**
(decisão do dono, 2026-09-20).

A URL abaixo continua registrada porque é dela que os dez `.woff2` saíram — ela é a
**procedência** dos arquivos, não mais o jeito de carregá-los:

```
https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Geist+Mono:wght@400;500&family=Geist:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap
```

> ⚠️ **Por que o `<link>` morreu.** O `vite-plugin-pwa` precacheia o que está em `dist/`, e uma
> folha de `fonts.googleapis.com` não está: **offline, o app caía na fonte do sistema** — o
> defeito chegando exatamente na hora de uso de um app de leitura. Pior, um
> `<link rel="stylesheet">` pendente **bloqueia** o `<script>` clássico seguinte, e o script
> que aplica o tema antes da primeira pintura ficava esperando um terceiro responder.
>
> Agora são **10 arquivos** (`@font-face` em `app/src/fonts.css`, ~277 KB, todos no precache),
> e não 20: três das quatro famílias são **variáveis** — medido lendo a tabela `fvar` de cada
> `.woff2` —, então um arquivo cobre 400–600. O `unicode-range` mantém o `latin-ext` fora do
> caminho de quem só escreve português. Guardas: `index-html.test.ts` amarra
> `--family-*` ↔ `@font-face` ↔ **arquivo em disco**, nos dois sentidos, e
> `bundle-guard.test.ts` exige que todo `.woff2` do `dist/` esteja no precache.

| Papel | Família | Uso |
|---|---|---|
| Títulos e corpo de leitura | **Fraunces** 500 / 400 | h1 25px→38px (`letter-spacing -0.015em`→`-0.02em`, `text-wrap: balance`); corpo 17,5px/1,72→19px/1,75, `text-wrap: pretty` |
| Nomes de pessoas e citação | **Instrument Serif** *itálico* | só isso — nunca como ornamento |
| Toda a UI | **Geist** | 14–15px/1,5; botões 500 |
| Rótulos, datas, páginas, números, IDs | **Geist Mono** | 9,5–11px, `uppercase`, `letter-spacing .06–.12em`, numerais tabulares |

Rótulo de seção em Geist Mono 10px uppercase `--text-muted` **substitui todos os h2/h3 de seção**.

### A.7 — Layout

- **Cabeçalho** 52px (celular) / 56px (desktop), `--surface`, `border-bottom: 1px solid var(--border)`.
- **Barra de contexto** 38px (celular) / 46px (desktop), `border-bottom: 1px solid var(--border-soft)`.
- **Desktop ≥1120px:** padding lateral 92px, coluna 680px, gap 56px, margem 320px com `border-left: 1px solid var(--border)` e `padding-left: 40px`. Abaixo de 1120px: uma coluna, padding lateral 20px, e o conteúdo da margem desce para o fluxo com o mesmo rótulo de seção.
- **Filete duplo** de abertura: 2px `--accent` + 3px de respiro + 1px `--border`. Na tela de escrita a ordem se inverte (1px em cima, 2px embaixo).
- Campos de texto com `font-size: 16px` no mínimo, para o iOS não dar zoom.

### A.8 — Componentes

Reescrever sobre os tokens: `Button` (variantes **primary** sólida `--accent`, ~~**secondary** borda `--border`~~, e **seal** nova: `--gold-soft` + `--gold-line` + `--gold-strong`, que é o estado "li hoje" marcado), `Field` (sem caixa: rótulo mono, `border-bottom` que reage a preenchido e foco, dica abaixo), `List`/`ListItem` (linha com `border-bottom: 1px solid var(--border-soft)`, sem fundo, sem raio), `FilterBar`/`FilterChip` (44px, pill), `PersonAvatar`, `Sheet`, `RichEditor`.

⚠️ **Reconciliação da Tarefa 41a (2026-09-21) — o `secondary` NÃO nasceu, e o `danger` morreu.**

O `secondary` ficou **riscado em vez de apagado** porque esta seção é o pedido
original, e apagar faria o próximo leitor achar que ninguém pediu. **Medido antes
de escrever uma linha:**

| | medido | comando |
| --- | --- | --- |
| `variant="ghost"` | **29 usos em 12 arquivos** | `grep -rn 'variant="ghost"' packages/app/src` (29) e `grep -rln` (12) |
| `variant="danger"` | **zero** consumidores | varrido com aspas duplas, aspas simples e ternário em `packages/{app,ui}/src`; a única ocorrência era `button.tsx:7`, a própria declaração do tipo |

O `ghost` de hoje **já é** o secundário que este parágrafo descreve — borda
`--border`, sem preenchimento. Renomeá-lo tocaria 29 lugares para o nome
descrever a mesma coisa, e faria a fatia perder a propriedade "nenhuma tela
tocada", que é o que a torna auditável. Logo: **`ghost` mantém o nome, `danger`
morre (tipo — e estilo), `seal` nasce.**

⚠️ **NÃO CONFUNDIR COM `text-danger`/`border-danger`**, que ficam: o erro de
formulário de **8** telas é deles (contado; `form-styles.ts:28,33` as serve, e o
`field.tsx` do `packages/ui` também escreve `text-danger`) e a guarda
`DANGER_STYLE` da varredura anti-culpa casa o nome deles por regex. Conferido no
CSS compilado desta fatia: `.text-danger{` e `.border-danger{` continuam
emitidos; `.text-danger-fg{` deixou de ser (era o botão destrutivo, e só ele).

⚠️ **E o `Field` saiu pela METADE, medido:** "sem caixa" pede que o `border` e o
`rounded` do controle virem `border-bottom`, e quem pinta o controle **não é o
`Field`** — é `TEXT_INPUT_CLASS`, em `packages/app/src/pages/form-styles.ts`,
lido por 9 telas. A decisão K da 41a proíbe tocar `pages/`, então a 41a entregou
o que é do `Field` (rótulo mono maiúsculo, dica ABAIXO do controle) e a caixa do
`input` fica para a fatia que puder editar `form-styles.ts` (47 ou 48).

⚠️ **E o `ListItem` NÃO ficou "sem fundo, sem raio", medido — só a variante nova ficou.**
A frase acima pede a linha com `border-bottom` e sem cartão, e é isso que o
`variant="sumario"` faz. Mas o `variant="row"` (o padrão, e o único que tem consumidor
hoje) continua com `rounded-control p-3 hover:bg-surface` — e isso é a **decisão G** da
Tarefa 41a, que fez a variante ser ADITIVA justamente para as 5 telas consumidoras não
mudarem uma linha. Quem torna o `row` desnecessário é a fatia que reescrever cada tela
(42–48); no dia em que a última migrar, o `row` sai e esta linha do documento fica
verdadeira sozinha. ~~Riscar a frase agora seria apagar o pedido~~; ela fica de pé **com a
data de quando passou a valer pela metade**.

⚠️ **E o "15 telas" da spec da 41a é 12, medido.** O 29 está certo;
`grep -rln 'variant="ghost"' packages/app/src` devolve **12** arquivos, todos em
`pages/` e nenhum de teste: `acervo`, `book-form`, `book`, `busca`, `day-note`,
`free-note`, `highlight-form`, `home`, `plan-editor`, `preferencias`,
`push-section`, `reading-marks`. A conclusão não muda — renomear tocaria 29
lugares —, mas o número errado já estava copiado no `BACKLOG.md`, que é o arquivo
de maior precedência do projeto, e é por isso que ele conta.

Criar: `Eyebrow`, `RuleDouble`, `ContextBar`, `ReadingColumn` + `MarginRail`, `BookSpine` (3 tamanhos: 42×60, 58×84, 88×128), `PresenceMark`, ~~`SumarioItem`~~, `StreakSeal`, `GrifoText` (`background: var(--pen-X); box-shadow: 0 0 0 2px var(--pen-X)` — o box-shadow alarga a marca além da caixa, como caneta de verdade), `SaveIndicator`.

⚠️ **O `SumarioItem` está riscado, e não apagado — medido na Tarefa 41b (2026-09-21).**
Ele **já nasceu na 41a**, como `ListItem variant="sumario"`
(`packages/ui/src/components/list.tsx:66,192-194`), e já renderiza a linha inteira do
plano: a coluna de marcas (`data-sumario-marks`), o condutor pontilhado
(`data-sumario-leader`), a meta em monoespaçada à direita, e os tons `today`/`future` com
o papel `--surface-today` e o filete de ouro. Criá-lo em 41b seria **um segundo nome para
a mesma coisa** — o defeito que este repositório já pagou três vezes (o `GUILT_TERMS` em
duas cópias até a Tarefa 19, o `dayRange` que o `CLAUDE.md` registra, e o
`'Alguém do clube'` em três chaves que a Tarefa 40 achou).

**Riscado e não apagado porque esta lista é histórica:** ela registra o que a fase A
pediu, e apagar faria a próxima pessoa achar que ninguém nunca pensou nele. Logo são
**nove** componentes em **dez** nomes — `ReadingColumn` e `MarginRail` nascem juntos, no
mesmo arquivo, porque o filete que separa os dois é propriedade da dupla.

### A.9 — Textos novos para `pt.ts`

Nenhum destes existe no catálogo. Confira os nomes de chave contra a convenção do arquivo e ajuste:

```
dayOfPlan             "Dia {n} de {total}"
presenceLegendRead    "Leu neste dia"
presenceLegendWrote   "Leu e escreveu"
presenceHint          "Cheio = escreveu"
editorSlashHint       "Digite / para inserir um bloco"
draftSaved            "Rascunho guardado"
savedAt               "Salvo {hora}"
archivePreview        "Como vai aparecer no acervo"
theMarks              "As marcas"
inThisBook            "Neste livro"
clubNotesCount        "Anotações do clube"
highlightsCount       "Grifos"
highlightsOfReading   "Grifos desta leitura"
refine                "Refinar"
keepAsIs              "Deixar como está"
archiveAction         "Arquivar"
excerptAsInBook       "Como está no livro."
savesItself           "Salva sozinho."
planDays              "{n} dias"
dayHasNote            "Dia {n} · tem anotação"
searchResultCount     "{n} resultados em todo o clube"
```

~~E **remova** a frase de alerta de perda de sequência.~~

⚠️ **Recusado pelo dono em 2026-09-19** — a mesma decisão anotada no §A.5 item 9:
`pages.home.streak.atRisk` fica, porque o **ADR 0010** vence a spec e o dono reconfirmou.

⚠️ **Reconciliação da Tarefa 40 (2026-09-21) — são 17 chaves, não 21, e uma fica de fora.**

A lista acima fica **intacta de propósito**: ela é o pedido original, e apagar uma linha dela
faria a próxima pessoa achar que nunca houve pedido. O que mudou está aqui, medido chave por
chave contra o catálogo de hoje:

| a lista pede | o que foi entregue | por quê |
| --- | --- | --- |
| ~~`archiveAction` "Arquivar"~~ | **reusada, sem chave nova** | já existe DUAS vezes — `pages.acervo.archive.confirm` e `pages.freeNote.archive.confirm`, as duas com o valor `Arquivar`. Uma terceira seria a lição nº 16 do MVP 2 de novo: duas coisas que falam a MESMA frase são indistinguíveis por varredura, e a primeira correção de texto conserta uma e deixa a outra |
| ~~`excerptAsInBook` "Como está no livro."~~ | **reusada, sem chave nova** | já existe como `pages.highlightForm.fields.quoteHint` = `Copie o trecho como ele está no livro.`, que é o texto LITERAL do artboard `NovoGrifoDesktop`. O celular encurta por espaço, e encurtamento é assunto de layout, não de catálogo |
| ~~`keepAsIs` "Deixar como está"~~ | **troca de VALOR** | não é chave nova: `pages.acervo.archive.cancel` e `pages.freeNote.archive.cancel` diziam `Cancelar` e passaram a dizer `Deixar como está`. O diálogo tem duas saídas e nenhuma delas abandona um formulário |
| ~~`dayHasNote`~~ | **`dayWithNote`** | `pages.bookForm.plan.dayHasNotes` já existe e é OUTRA coisa: o recado do 400 do domínio ao remover do plano um dia que já tem anotação. Duas chaves a um `s` de distância, uma dizendo `Dia 3 · tem anotação` e a outra `Um dos dias que saiu do plano…`, é erro esperando acontecer |
| ~~`searchResultCount` "{n} resultados em todo o clube"~~ | **NÃO ENTROU** | ver a pergunta em aberto, logo abaixo |
| `{n}` · `{total}` · `{hora}` | `{{number}}` · `{{total}}` · `{{time}}` | chave simples **não** é a sintaxe do i18next: os três sairiam LITERAIS na tela, e o i18next nem tentaria substituí-los. E `{hora}` erra duas vezes, porque `CLAUDE.md` manda nome de código em inglês |
| `draftSaved` | `pages.highlightForm.draftSaved`, **plano** | o mapa da tarefa pedia `save.draft`, e `pages.highlightForm.save` já existe e é uma **string** — o rótulo do botão Salvar, lido por `highlight-form.tsx`. Virar objeto devolveria a chave crua na tela, e o conserto exigiria editar a tela, que esta fatia não toca. A forma plana também é a consistente ali: aquele formulário grava por BOTÃO, e o vocabulário de gravação dele sempre foi plano |

⚠️ **PERGUNTA EM ABERTO PARA O DONO — `searchResultCount`.** Ela ficou de fora, e não por
desenho: `packages/app/src/pages/__tests__/busca.test.tsx` tem o teste
`shows NO result count anywhere, in any state (decision G)`, que é decisão de produto
**registrada** na Tarefa 29 — incentivo por presença, nunca por comparação. E a isenção
nominal do contador (a que faz `Dia 11 de 30` passar) **não resolveria** o caso: o
`COUNTER_SHAPE` nem pega `3 resultados`, porque não há `de` entre dois números. Quem a proíbe
é a decisão da busca, não a varredura. Se o dono quiser a frase, a saída é apagar aquela
decisão do teste, com a data e o motivo; enquanto isso a busca segue sem contagem e o canvas
fica divergente neste ponto.

⚠️ **E a diferença que decide:** `dayOfPlan` é POSIÇÃO no plano — onde a leitura de hoje está
no mês —, e o número não muda com o que ninguém fez; ela entrou por isenção nominal, decidida
no `docs/BACKLOG.md`. Um contador de resultado é outra coisa.

### A.10 — O que o plano deve conter

Entregue em markdown, neste formato:

1. **Inventário do código atual** — tabela: componente/tela → arquivo → o que muda (troca de token / reescrita / componente novo / sem mudança).
2. **Mapa de-para** — cada um dos 15 artboards → os arquivos que implementam aquela tela.
3. **Componentes**: os que mudam de API (com a assinatura nova) e os que nascem.
4. **Divergências e problemas** que você encontrou entre o design, o código e este documento. Não silencie nenhuma; liste e proponha a saída.
5. **Fases de execução**, uma por PR, cada uma deixando o app funcionando:
   1. tokens e fontes (só `theme.css` + o `<link>`; todas as telas mudam de cor de uma vez)
   2. primitivos (`Button`, `Field`, `List`, `FilterChip`, `PersonAvatar`, `Sheet`) + os componentes novos
   3. shell (cabeçalho, `ContextBar`, `ReadingColumn`, `MarginRail`)
   4. **Anotação do dia + `RichEditor`** — é a tela que justifica o projeto, faça antes das outras
   5. O livro (sumário + marcas)
   6. Início
   7. Acervo e Busca (o recolhimento dos filtros)
   8. Formulários (grifo, anotação avulsa, novo/editar livro)
   9. Preferências, 404, login, convite
   10. passagem final
6. **Riscos e testes que vão quebrar**, com o que fazer em cada um.
7. **Perguntas para mim** — as que travam decisão. Não invente resposta para nenhuma.

Estime esforço por fase em ordens de grandeza (pequeno / médio / grande), não em horas.

---

## FASE B — Executar, depois que eu aprovar

Uma fase por vez, na ordem do plano. Ao fim de cada uma: rode lint, tipos e testes, e me diga o que mudou e o que ficou pendente. Não comece a fase seguinte sem eu pedir.

### Critérios de aceite, válidos para toda fase

- Nenhum valor hexadecimal fora de `theme.css`.
- Nenhuma string de interface fora de `pt.ts`.
- Todo elemento interativo com 44px de alvo e foco visível (`outline` nunca removido; anel de 3px `color-mix(in oklch, var(--accent) 18%, transparent)`). ⚠️ **As duas metades são UMA decisão, e o dono confirmou isso em 2026-09-20**: contorno sólido em `--accent` **mais** o halo. Medido: o halo de 18% **sozinho** dá ~1,4:1 contra o creme — ele não é visível por si, é halo *sobre* o contorno. Entregue no `FOCUS_RING` de `@clube/ui`; quem acusa a separação das metades é `ui/src/__tests__/focus-ring.test.ts`.
- Contraste conferido no claro e no escuro. Os pontos de risco são os cinzas de legenda e os fundos de grifo.
- Nenhum percentual, barra de progresso ou placar em lugar nenhum.
- Sem rolagem horizontal em 360px de largura.
- `prefers-reduced-motion` desliga o modo foco e as transições de opacidade.
- Hover e pressionado mudam cor um passo — **sem `transform`, sem escala**.

### Pare e pergunte, não invente

- Se uma mudança de UI exigir campo novo, rota nova ou permissão nova.
- Se precisar de um texto que não está na lista da seção A.9.
- Nas duas perguntas em aberto do MVP 3 — marcar/desmarcar um dia que não é hoje, e a busca sensível a acento (`ILIKE`). **Nenhuma das duas é escopo deste redesign**; se esbarrar nelas, registre e siga.
- Se o canvas e este documento discordarem: o canvas manda, e você me avisa.

### Fora de escopo

Schema, endpoints, contratos de API, lógica de autosave, fila offline em IndexedDB, push e regras de permissão. Se um passo parecer exigir mexer nisso, pare e me diga.