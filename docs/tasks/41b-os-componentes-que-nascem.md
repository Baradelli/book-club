# Tarefa 41b — Os nove componentes que nascem

> **Quarta fatia do MVP 3.5**, e a outra metade da entrada 41. A 41a reescreveu o que já
> existia; esta cria o que não existe. **Nenhuma tela é tocada** — quem consome é a 42 em
> diante.
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** ·
> `docs/tasks/41a-primitivos-sobre-os-tokens.md`, as **11 notas de reconciliação** — ⚠️ **é o
> mapa do que dá errado aqui**, e duas delas nomeiam as classes de erro a vigiar ·
> `docs/CONVENCOES-CODIGO.md` **§7.1**, **§7.3**, **§7.4**, **§7.9** ·
> `docs/adr/0002-visibilidade-total-no-clube.md` — ⚠️ **nenhum `<svg>` à mão em
> `packages/ui`**.

---

## ⚠️ São NOVE, não dez: o `SumarioItem` já existe

A entrada 41 do `BACKLOG.md` lista `SumarioItem` entre os que nascem. **Medido: ele nasceu
na 41a, como `ListItem variant="sumario"`** (`packages/ui/src/components/list.tsx:66,192-194`),
e já renderiza a linha inteira do plano: a coluna de marcas (`data-sumario-marks`), o condutor
pontilhado (`data-sumario-leader`), a meta em mono à direita, e os tons `today` / `future` com
o papel e o filete de ouro.

⚠️ **Criar um `SumarioItem` agora seria um segundo nome para a mesma coisa** — e é exatamente
o defeito que este repositório já pagou três vezes: o `GUILT_TERMS` que viveu em duas cópias
até a Tarefa 19, o `dayRange` que o `CLAUDE.md` registra, e o `'Alguém do clube'` que a
Tarefa 40 achou em três chaves. **Não crie.**

Restam **nove**: `Eyebrow` · `RuleDouble` · `ContextBar` · `ReadingColumn` · `MarginRail` ·
`BookSpine` · `PresenceMark` · `StreakSeal` · `GrifoText` · `SaveIndicator`.
(São dez nomes; `ReadingColumn` e `MarginRail` nascem juntos, no mesmo arquivo, porque um não
faz sentido sem o outro — o filete que separa os dois é propriedade da dupla.)

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | **Nenhum componente conhece catálogo.** Todos recebem texto por prop | A decisão J da 41a, e o teto de 33 do `no-hardcoded-ui-text.test.ts` **só pode cair**. `packages/ui` não importa i18n — `no-i18n.test.ts` o proíbe por allowlist |
| **B** | ⚠️ **`GrifoText` recebe a caneta por CHAVE (`'a'\|'v'\|'l'\|'z'\|'r'`), nunca por hexadecimal** | Os cinco hexes de `HIGHLIGHT_COLORS` são **dado persistido** (coluna `Highlight.color`, filtro `?color=%23facc15`, índice `@@index([bookId,color])`) — decisão fechada do MVP 3.5. A tradução hex→caneta é da TELA (`highlight-colors.tsx`, que já faz hex→chave de i18n). O componente não pode conhecer o dado |
| **C** | ⚠️⚠️ **O mapa caneta→classe é LITERAL, nunca montado em runtime** | `bg-pen-${key}` **não gera CSS**: o Tailwind compila o que encontra escrito. É a lição que o `avatar-color.ts` carregava por escrito antes de morrer na 41a (`avatar-color.ts:17`), e o `ui-source-scan.test.ts` é quem acusa — mas só depois de alguém notar a cor sumida |
| **D** | **`GrifoText` pinta com `background` E `box-shadow: 0 0 0 2px` da MESMA caneta** | É o §A.8: o `box-shadow` alarga a marca além da caixa, como caneta de verdade. Duas declarações, um token — se divergirem, a marca ganha uma auréola de outra cor |
| **E** | **`PresenceMark` tem três estados e o terceiro é a AUSÊNCIA** | Vazado = leu; cheio = leu e escreveu; **não renderiza nada** = não leu. ⚠️ O canvas mantém a coluna de 44px **vazia** no dia futuro (`Livro.dc.html:150-153`) — é ela que segura o alinhamento, e ela é do `ListItem`, não do `PresenceMark` |
| **F** | ⚠️ **A cor nunca é o único portador.** `PresenceMark` carrega a INICIAL; `StreakSeal` carrega o NÚMERO e o nome | É regra escrita e testada do projeto (`filter-bar.test.tsx`), e é o argumento que matou a paleta de avatar na 41a. Cheio × vazado é **forma**, não matiz |
| **G** | **`ReadingColumn` + `MarginRail` num arquivo só, e o corte é `≥1120px`** | Abaixo disso, uma coluna com 20px de padding e a margem descendo para o fluxo. ⚠️ **Nenhuma ramificação por dispositivo** — sem `userAgent`, sem `isMobile`: é media query e só |
| **H** | **`ContextBar` tem duas formas, e a diferença é a AÇÃO** | Sem ação: 38px no celular (`Livro.dc.html:36`). Com ação primária à direita: 48px (`NovaAnotacao.dc.html:36`). Desktop: 46px (`DiaDesktop.dc.html:29`). ⚠️ **Meça as três no canvas antes de gravar** |
| **I** | **`Eyebrow` tem duas tintas**: `--text-muted` (rótulo de seção) e `--gold` (o que é de hoje / o que está sendo criado) | Medido no canvas: "O que o clube está lendo" é muted; "A leitura de hoje", "Nova anotação avulsa" e "Trecho grifado" são gold |
| **J** | **Nenhuma tela tocada, e nenhum arquivo de `packages/app/src/pages/` no diff** | ⚠️ **Prove por mtime, não por `git diff --name-only`** — há quatro fatias não commitadas nesta árvore (lição L2 da Tarefa 40) |
| **K** | **Todo componente novo entra no barril** (`packages/ui/src/index.ts`) | Componente que a tela não consegue importar não existe. ⚠️ **E `ListItemLinkProps` continua esquecido lá desde a Tarefa 13** — se for barato, leve junto e registre |

---

## As medidas, e de onde tirá-las

⚠️ **Extraia cada uma dos artboards em disco. Não invente e não copie de memória** — na 41a
um repinte inteiro foi "medido" contra o elemento errado do canvas.

| componente | artboard de referência |
| --- | --- |
| `Eyebrow` | `Inicio.dc.html` (muted e gold), `Livro.dc.html`, `Dia.dc.html`, `NovoGrifo.dc.html` |
| `RuleDouble` | `Inicio.dc.html` (2px accent em cima) e `Dia.dc.html` / `NovaAnotacao.dc.html` (**invertido**: 1px border em cima, 2px accent embaixo) |
| `ContextBar` | `Livro.dc.html` (sem ação), `NovaAnotacao.dc.html` e `NovoGrifo.dc.html` (com ação), `DiaDesktop.dc.html` (desktop) |
| `ReadingColumn` + `MarginRail` | `DiaDesktop.dc.html`, `InicioDesktop.dc.html`, `LivroDesktop.dc.html` |
| `BookSpine` | `Inicio.dc.html` (42×60), `Livro.dc.html` (58×84), `LivroDesktop.dc.html` (88×128) — **duas paletas**, `--spine-*` e `--spine2-*` |
| `PresenceMark` | `Livro.dc.html` (18×18) e `LivroDesktop.dc.html` (19×19), mais a legenda "As marcas" da margem |
| `StreakSeal` | `Inicio.dc.html` e `InicioDesktop.dc.html` — **dois estados**, com corrente e sem |
| `GrifoText` | `Dia.dc.html`, `Acervo.dc.html`, `Busca.dc.html`, `DiaDesktop.dc.html` |
| `SaveIndicator` | `Dia.dc.html` ("Salvo 21:04"), `NovoGrifo.dc.html` ("Rascunho guardado"), `Avulsa.dc.html` |

---

## As regras

1. **TDD estrito, um componente por vez** — nove ciclos, não um. Vermelho colado a cada um.

2. ⚠️ **A decisão C com mutante.** Escreva o mapa caneta→classe como literais e **prove que a
   montagem em runtime não funcionaria**: mutante que troque o mapa por
   `` `bg-pen-${key}` `` tem de ser acusado por `ui-source-scan.test.ts`
   (`emits every class packages/ui uses` / `ships no class without emitted CSS`).
   ⚠️ **Se nada acusar, a guarda não cobre montagem em runtime** — e aí diga isso em vez de
   fingir que cobre.

3. ⚠️ **A decisão D com teste de igualdade, não de presença.** O `background` e o
   `box-shadow` têm de citar **a mesma** caneta. **Mutante:** ponha `--pen-a` no fundo e
   `--pen-v` na sombra — tem de acusar.

4. **A decisão E nos três estados, e o terceiro é o que se esquece.** Teste que "não leu"
   renderiza **nada** (não um espaço, não um `aria-hidden` vazio). **Mutante:** fazer o
   terceiro estado renderizar um disco transparente → tem de acusar.

5. ⚠️ **A decisão F com a mesma força do `filter-bar.test.tsx`.** Cheio × vazado tem de ser
   distinguível **sem cor**: teste que compara a presença do preenchimento, não o matiz. E o
   `PresenceMark` sem nome não pode virar bolinha anônima — ele carrega a inicial.

6. **Acessibilidade de cada um, e ela não é opcional:**
   - `PresenceMark` e `StreakSeal` são informação, não decoração → `role="img"` com
     `aria-label` vindo por prop, ou texto real;
   - `BookSpine` é o título do livro desenhado → o título tem de estar legível para o leitor
     de tela, sem duplicar quando a tela já o escreve ao lado;
   - `RuleDouble` é decoração → **fora** do caminho do leitor de tela;
   - `ContextBar` é navegação → `<a>` de verdade, alvo ≥ 44px, e a ação primária é `<button>`;
   - `MarginRail` é aparato → ele vem **depois** da coluna na ordem do DOM, e a ordem de
     teclado segue a ordem visual.

7. **44px de alvo em tudo que se toca**, e `FOCUS_RING` **não muda** (ele é da Tarefa 39).
   ⚠️ **O canvas desenha três alvos desta família abaixo do piso** — a `ContextBar` de 38px é
   o caso: a linha tem 38px, mas o **link dentro dela** tem de ter 44px de alvo. Resolva com
   padding, não baixando o piso, e escreva como resolveu.

8. ⚠️ **Nenhum `<svg>` à mão, nenhum `dangerouslySetInnerHTML`.** `ChevronLeft` e `Flame` vêm
   do `lucide-react` (o `Flame` já é usado por `streak-bar.tsx`). O resto do desenho é `div`,
   `span` e borda — conferido no canvas: a lombada é `writing-mode`, o filete duplo são dois
   `div`, a marca é `span` com letra.

9. **Nenhuma chave de catálogo, nenhum texto em `packages/ui`.** O teto de 33 tem de ficar
   igual ou **menor**.

10. ⚠️ **Os documentos, com riscar-e-explicar e data:**
    - **`docs/BACKLOG.md`**, entrada 41b — o `SumarioItem` riscado, com a medição
      (`list.tsx:66,192-194`) e o motivo;
    - **`docs/new-ui.md` §A.8** — a lista de "criar" perde o `SumarioItem` pela mesma razão.

11. **Gates, com os números medidos ao fim da 41a (2026-09-21, tudo verde):**

    | | arquivos | testes |
    | --- | --- | --- |
    | `@clube/shared` | 22 | **601** |
    | `@clube/ui` | 24 | **213** |
    | `@clube/backend` (unit) | 85 | **1975** |
    | `@clube/app` | 35 | **865** |

    Build: entrada **436.557 B** (teto 450.000 — sobram 13.443) · CSS **29.166 B** ·
    `index.html` **1.638 B** · precache **26 / 1180,57 KiB** · editor **453.606 B** pelo `ls`.
    ⚠️ **O chunk de entrada VAI subir** — nove componentes novos, mesmo sem consumidor, entram
    no barril. Cole o número e diga quanto cada um custou. **Se passar de 450.000, PARE**: o
    teto é decisão do dono.

12. **Nenhuma migration, nenhum endpoint, nenhum schema, nenhuma tela.** Se parecer preciso,
    **pare**.

---

## Definição de pronto

- [x] Os nove nascem, cada um com o seu ciclo de TDD e o vermelho colado.
- [x] `SumarioItem` **não** foi criado, e o `BACKLOG.md` e o `new-ui.md` §A.8 dizem por quê.
- [x] As medidas de cada componente vieram do canvas, com **arquivo e linha** citados.
- [x] `GrifoText` recebe caneta por chave; o mapa é literal; os mutantes das regras 2 e 3
      acusaram.
- [x] `PresenceMark` nos três estados, com o terceiro sendo ausência, e o mutante da regra 4
      acusou.
- [x] Cheio × vazado distinguível sem cor (regra 5).
- [x] A acessibilidade da regra 6 entregue e testada, componente por componente.
- [x] Alvo ≥ 44px em tudo que se toca; `FOCUS_RING` intocado — provado por `git diff`.
- [x] Nenhum `<svg>` à mão; `adr-0002-iconography.test.ts` verde.
- [x] Teto do `no-hardcoded-ui-text` igual ou menor que 33.
- [x] Os nove no barril; `ListItemLinkProps` levado junto ou registrado.
- [x] **Nenhum arquivo de `packages/app/src/pages/` no diff** — provado por **mtime**.
- [x] Gates verdes, com chunk e CSS antes e depois e o custo por componente.
- [x] Varredura de caracteres invisíveis sobre os arquivos do diff, **provando antes que ela
      morde** com um soft hyphen e um NBSP plantados.
