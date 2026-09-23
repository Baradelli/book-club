# Tarefa 45 — Início: a corrente vira selo, o feed desce para a margem, e o admin sai da frente

> **Nona fatia do MVP 3.5.** É a que dá consumidor ao **último** componente da Tarefa 41b
> que nasceu sem um, e a segunda tela a exercitar a isenção do contador da Tarefa 40.
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** e a
> entrada **45** · ⚠️ **`docs/tasks/44-o-livro.md`, as notas 11 e 12** — elas explicam o que
> mudou na varredura anti-culpa e por que ela não se copia de teste antigo ·
> `docs/tasks/41b-*.md` (o `StreakSeal`) · `docs/adr/0010-*` (o `atRisk`) ·
> `docs/CONVENCOES-CODIGO.md` §7.1, §7.4, §7.9, §7.10.

---

## ⚠️ O que espera aqui

| o que | nasceu em | situação |
| --- | --- | --- |
| `StreakSeal` | Tarefa 41b | ⚠️ **o ÚLTIMO da 41b sem consumidor** — medido na 44b |
| `expectNoGuiltWithPlanPosition()` | Tarefa 40 | exercitado só pela tela do livro; esta é a **segunda** |
| `MarginRail` | Tarefa 41b | terceira tela a passar `rail` ao `Screen` |

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | ⚠️⚠️ **`adminEntry()` tem DOIS locais de chamada, e só UM se move** | Medido: `home.tsx:400` está **dentro** do estado vazio (`shelf.books.length === 0`) e `:407` está no estado normal, **acima** do bloco de hoje. O docblock de `:296-303` defende o primeiro por escrito: *"o mês começa: o admin abre o app, não vê livro nenhum, e o botão é a resposta"*. ⚠️ **Só o `:407` desce para o rodapé e vira link. O `:400` FICA como botão.** Mover os dois destrói o estado vazio que o docblock defende |
| **B** | **A corrente vira `StreakSeal`** | O artboard desenha pílula com ícone `Bookmark`, número em mono e dois tons. ⚠️⚠️ ~~e a API do componente (`tone: 'lit' \| 'quiet'`, `count`, `label`) **já casa**~~ **FALSO, e o erro é MEU — ver a nota nº 13.** **Não existia prop `tone`**: `StreakSealProps` tinha `count`, `label` e `className`, e o tom era decidido DENTRO do componente por `count > 0`. Eu li as constantes de estilo (`SEAL_CLASS`, com as chaves `lit`/`quiet`) e não a interface, e afirmei que a API "já casava". A consequência foi um **defeito de produto** que a primeira entrega da fatia carregou até a auditoria. Medido, tom a tom (isto continua certo): `lit` = `--gold-line`/`--gold-soft`/`--gold-strong`/`--gold`; `quiet` = `--border-soft`/`--surface`/`--text-muted`/`--text-subtle` |
| **C** | **Correntes e feed descem para o `MarginRail` no desktop** | `InicioDesktop.dc.html:104` é a coluna de 320px com `border-left`, e ela contém o rótulo (`:105`), as correntes (~~`:106-117`~~ **`:107-118`** — o `:106` é linha em branco e o `:118` é o `</div>` que fecha o empilhamento) e o feed (~~`:122-147`~~ **`:120-149`** — o `<div>` do feed abre em `:120` e fecha em `:149`). ⚠️ **As duas citações estavam erradas na minha spec; corrigidas na auditoria — ver a nota nº 17.** ⚠️ **No celular nada desaparece:** o `MarginRail` é montado **sempre** e desce para o fluxo (`reading-column.tsx:186-207`, medido na auditoria da 44b) |
| **D** | ⚠️ **O `atRisk` FICA** | Decisão do dono, e o **ADR 0010 vence** o §A.5.9 do `new-ui.md` (precedência do `README-IA.md`). **Não o remova, não o suavize.** Se ele não couber no desenho novo, **pare e pergunte** |
| **E** | ⚠️ **O texto da corrente reusa `days_one`/`days_other`; nenhuma chave nasce** | Medido: `pt.ts:128-129` já são `'{{count}} dia seguido'` / `'{{count}} dias seguidos'`, **idênticos ao desktop** (`InicioDesktop.dc.html:111`). ⚠️ **O celular diverge**: `Inicio.dc.html:100` escreve só `dias · Você`. **Fique com "dias seguidos" nas duas larguras e DECLARE a divergência** — encurtar pediria chave nova para ganhar quatro caracteres |
| **F** | ⚠️ **"Dia 11 de 30" na home é a isenção do contador, pela segunda vez** | `Inicio.dc.html:41` e `InicioDesktop.dc.html:42`. Os estados que a mostram chamam **`expectNoGuiltWithPlanPosition()`** |
| **G** | **Nenhuma outra tela é tocada** | `activity-feed.tsx` e `streak-bar.tsx` são da home e podem mudar. `book.tsx`, `acervo.tsx`, `busca.tsx`, `day-note.tsx` **não**. ⚠️ **Prove por `git diff 6149804 --name-only`** — a árvore está limpa |
| **H** | **Nenhuma migration, nenhum endpoint, nenhum schema** | É fatia de tela. O modelo do feed e o cálculo da corrente **não mudam** |

---

## As medidas, e de onde tirá-las

⚠️ **Escreva o script que imprime a linha citada ANTES da primeira citação.** É a prática que
mais se pagou neste bloco: cinco citações erradas na 42, cinco mais um botão escondido na 43,
e na 44c o executor pegou um erro meu de bytes com ela.

### A ordem do celular — `Inicio.dc.html` (150 linhas)

| # | peça | linha |
| --- | --- | --- |
| 1 | data · posição no plano | `:40`, `:41` |
| 2 | "A leitura de hoje" · capítulo · páginas·livro | `:50`, `:51`, `:52` |
| 3 | "Escrever a anotação de hoje" | `:56` |
| 4 | "O que o clube está lendo" + "Buscar" | `:66`, `:67` |
| 5 | a estante | `:72-86` |
| 6 | "O que aconteceu por aqui" | `:93` |
| 7 | as correntes | `:100`, `:105` |
| 8 | o feed | `:111-128` |
| 9 | ⚠️ **"Cadastrar o livro do mês", POR ÚLTIMO** | depois de `:128` |

### O desktop — `InicioDesktop.dc.html`

Cabeçalho 56px (`:21`) · coluna de **680px** (`:37`) · margem de **320px** com `border-left`
(`:104`), contendo rótulo, correntes e feed.

⚠️⚠️ ~~**"Cadastrar o livro do mês" NÃO é desenhado em lugar nenhum do artboard de desktop.**
Medido.~~ **FALSO — corrigido na execução; ver a nota de reconciliação nº 1.** Ele **é**
desenhado, em `InicioDesktop.dc.html:98-101`: no pé da coluna de 680px (o `</div>` de
`:102` fecha a coluna aberta em `:37`), empurrado para lá por um `flex-grow:1` (`:96`), com
o mesmo tratamento do celular — mono 10px maiúscula, `--text-muted`, `+` de 14px, `gap:9px`.
**A instrução não muda:** ele fica no rodapé nas duas larguras — só que isso é **fidelidade
ao canvas**, e não uma divergência a declarar. A divergência real é outra, e está na nota
nº 2 (no celular ele fica ACIMA do feed, porque o `MarginRail` vem sempre depois da coluna
no DOM).

### O selo da corrente — ~~`InicioDesktop.dc.html:106-117`~~ `:107-118` (nota nº 17)

⚠️⚠️ **E O QUE ESTA SEÇÃO NÃO DIZ É O QUE MAIS CUSTOU: o artboard também decide QUAL selo
acende, e eu li a tabela como se ele não decidisse.** `:115` dá ao Bruno **4 dias de
corrente** e `:113` o desenha na pílula APAGADA. Ou seja, `lit` não é "tem corrente" — é "é
o de quem está olhando". Ver a nota nº 13.

Pílula `border-radius: 999px`, `padding: 7px 14px`, `gap: 9px`; ícone 13px (`Bookmark` do
`lucide-react` — ⚠️ **componente, nunca `<svg>` inline**: `adr-0002-iconography.test.ts`);
número em mono 12,5px; rótulo 12,5px.

| tom | borda | fundo | número | ícone |
| --- | --- | --- | --- | --- |
| `lit` (a minha) | `#d6ae64` = `--gold-line` | `#faf3e4` = `--gold-soft` | `#785822` = `--gold-strong` | `#946d2c` = `--gold` |
| `quiet` (a do outro) | `#e3ddc9` = `--border-soft` | `#f9f5ec` = `--surface` | `#565b52` = `--text-muted` | `#74786e` = ⚠️ **NENHUM — ver abaixo** |

Casados por mim contra `theme.css` (`:150`, `:200`, e os demais). **Duas ressalvas medidas:**

⚠️ **`#faf3e4` é DOIS tokens:** `--gold-soft` (`:200`) e `--surface-today`. O `StreakSeal` usa
`bg-gold-soft`, que é o certo aqui — o outro é o papel do dia de hoje na tela do livro. Não
troque um pelo outro só porque o hex bate.

⚠️⚠️ **`#74786e` NÃO EXISTE MAIS NO TEMA, e isso é decisão do dono, não defeito.** Ele era o
`--text-subtle` do canvas; medido em `theme.css:138`, ele dá **4,00 / 4,15 / 3,82** — abaixo
dos 4,5:1. O dono mandou escurecê-lo na Tarefa 39, e hoje `--text-subtle` é `#686c63`
(`:150`). O `StreakSeal` já usa `stroke-subtle`, ou seja **já sai mais escuro que o
artboard**. **Isto é o desenho certo. NÃO "conserte" a cor de volta para o canvas** — seria
desfazer em silêncio uma decisão de contraste do dono. Se você achar que o selo ficou pesado,
**pare e pergunte**; não mexa na cor.

⚠️ Para qualquer hex que eu **não** tenha casado acima: case você, e se não bater, **declare
a divergência** em vez de aproximar.

⚠️ **12,5px:** case contra os sete `--size-*` antes de inventar valor arbitrário. Se nenhum
bater, declare.

---

## As regras

1. **TDD estrito**, e vale para `packages/app`. **Vermelho colado** para cada guarda nova.

2. ⚠️⚠️ **A decisão A com acusador nos DOIS lados.**
   **Mutante (i):** o `adminEntry()` do estado vazio (`:400`) também vira link de rodapé →
   **tem de acusar**. **Mutante (ii):** o do estado normal volta para cima do bloco de hoje →
   **tem de acusar**. ⚠️ **Este bloco já pagou TRÊS vezes por par guardado pela metade** (as
   duas lombadas e a legenda na 44, o link do acervo na 44b). **Guarde os dois lados.**

3. ⚠️⚠️ **A decisão F, e ela não se copia de teste antigo.** A rodada de correção da Tarefa 44
   trocou o desenho: `expectNoGuilt()` e `expectNoGuiltWithPlanPosition()` são hoje
   **mutuamente exclusivas** sobre o mesmo DOM — a primeira exige **zero** achados, a segunda
   exige que a frase isenta **esteja lá**. **Leia `packages/app/src/pages/__tests__/anti-guilt-dom.ts`
   antes de escolher qual chamar.**
   **Mutante obrigatório:** troque a estrita pela de sempre no estado que mostra a posição →
   **tem de ficar vermelho**. E o inverso: a frase de posição **vazando** num estado sem dia
   de hoje → também tem de acusar.

4. ⚠️ **A varredura anti-culpa em TODOS os estados da home**, e ela é a tela mais sensível do
   app: é aqui que "quem leu quantos dias" aparece. **Mutante:** escreva "11 de 30 dias" numa
   corrente → o `COUNTER_SHAPE` tem de acusar **mesmo com a isenção ligada**. É o par positivo.

5. **A decisão B com acusador.** O `StreakSeal` é o último da 41b sem consumidor; este é o
   primeiro. **Mutante:** volte para a marcação à mão de `streak-bar.tsx` → acusa.
   ⚠️ **E guarde a distinção sem cor:** `lit` × `quiet` não pode depender só de matiz — é a
   mesma regra que o `PresenceMark` cumpre na 44 e que `filter-bar.test.tsx` cobra desde a 41a.

6. ⚠️ **A decisão C com guarda de VISIBILIDADE, não de presença no DOM.** O `MarginRail` é
   montado sempre; o que muda é a largura. **Mutante:** esconda as correntes em toda largura
   (`hidden`) → acusa. ⚠️ **`toContain('hidden')` casaria `min-[1120px]:hidden` e daria falso
   verde** — use fronteira de palavra, como `book.test.tsx` passou a usar na 44b.

7. **A decisão D provada.** **Mutante:** apague o `atRisk` → acusa. Ele fica, e o acusador diz
   que fica.

8. **Nenhuma chave de catálogo nova.** Se você achar que precisa de uma, **pare e diga qual**
   — a decisão E mediu que as que existem bastam.

9. ⚠️ **O corte de tenant e o papel não mudam.** `adminEntry()` só existe para
   `OWNER`/`ADMIN`, e a **rota recusa igual** (`book-form.tsx`), *"senão isto seria só um
   botão escondido"* — a frase é do docblock de `home.tsx:302`. **Mutante:** deixe o link do
   rodapé sem o guarda de papel → acusa.

10. **Tamanho pelo contador canônico** (`acervo.tsx:115-126`), **nunca `wc -l`**. Hoje:
    `home.tsx` **283** · `activity-feed.tsx` **242** · `streak-bar.tsx` **61**.
    ⚠️ Se a home passar de ~350, **corte por assunto e diga por medição o que saiu e para
    onde** — e **não repita o erro da 44b**: extrair de um arquivo não encolhe o outro.

11. **O orçamento, colado antes e depois.** Entrada em **435.580 B** contra o teto de
    **450.000** — folga **14.420 B**, e ainda faltam as Tarefas 46, 47 e 48. A 44 custou
    2.600 B. **Se esta fatia comer mais de ~3.000 B, diga.**

12. **Varredura de caracteres invisíveis** nos arquivos do diff, **provando antes que morde**,
    com os code points montados **por número**.

---

## Definição de pronto

- [x] `adminEntry()` do estado normal virou link no rodapé; **o do estado vazio continua
      botão**, com os dois lados guardados (regra 2). → M1 (2 acusadores) e M2 (1).
- [x] As correntes são `StreakSeal`, nos dois tons, com a distinção **sem depender de cor**.
      → M6 (5 acusadores) e M7 (2).
- [x] ⚠️ **E o tom aceso é O MEU, como o canvas desenha** (`InicioDesktop.dc.html:113-116`:
      o Bruno tem 4 dias e o selo dele é apagado). Entregue na rodada de auditoria, com a
      prop `tone` nova no `StreakSeal` e o acusador usando **duas correntes > 0**.
      → MA1 (2 acusadores), MA2 (1), e do lado do componente MZ (2) e MSP (6).
      **Notas nº 13 e 14.**
- [x] Correntes e feed na margem acima de 1120px; **no celular descem para o fluxo**, com
      guarda de visibilidade (regra 6). → M8 e M8b (1 cada, os dois lados), M11 (2).
      ⚠️ **A guarda entregue tinha FALSO NEGATIVO e virou teste de TOKEN na auditoria** —
      a regex deixava passar `max-[1119px]:hidden`, que é literalmente o que o nome do
      `it()` promete impedir. → MH (1 acusador), e MH2 (1) no `book.test.tsx`, onde a
      mesma forma frágil tinha sido copiada na 44b. **Nota nº 15.**
- [x] ⚠️ **Três propriedades da fatia saíram SEM acusador e ganharam um na auditoria:** o
      rótulo do feed ser `Eyebrow` (MC), o ritmo de 18px da margem (MD) e a posição no
      plano ser dourada (ME). Um acusador para os três, 1 vermelho cada. **Nota nº 16.**
- [x] `atRisk` intacto, com acusador. → M9 (2 acusadores).
- [x] Os estados que mostram a posição no plano chamam `expectNoGuiltWithPlanPosition()`
      (são ~~**10**~~ **11**, contando a da `book.test.tsx` — **10** locais de chamada em
      `home.test.tsx` mais **1** na `book.test.tsx`; corrigido na auditoria, nota nº 18),
      e o mutante da regra 3 fica **vermelho nos dois sentidos** → M3a (1), M3b (10),
      M4 (28, o sentido inverso).
- [x] A varredura anti-culpa passa em **todos** os estados, com o par positivo da regra 4.
      → M5 (8 acusadores), **com a isenção ligada**.
- [x] Nenhuma chave nova; nenhuma outra tela tocada, **provado por `git diff 6149804`**
      (~~5~~ **6** arquivos na entrega original — faltava o `docs/BACKLOG.md`, nota nº 19 —
      e **8** depois da auditoria — **9** arquivos tocados, porque este documento é novo e
      não rastreado, e `git diff` não lista arquivo não rastreado (nota nº 19);
      `book.tsx`, `acervo.tsx`, `busca.tsx` e `day-note.tsx`
      intocados — a `book.test.tsx` entra por UMA asserção sobre a home, declarada na nota
      nº 10, mais a guarda de token da nota nº 15).
- [x] ⚠️ **`packages/ui` FOI TOCADO na auditoria, por autorização explícita do dono e só
      para três coisas:** a prop `tone` do `StreakSeal` (A1), a prosa de acessibilidade que
      afirmava o que não era (M4) e a prosa do `Flame` que ficou no futuro (B1).
      `streak-seal.tsx` 45 → **53** linhas; `streak-seal.test.tsx` ganhou 1 `it()`.
- [x] Nenhuma migration, nenhum endpoint, nenhum schema
      (`schema.prisma` md5 `968c9986f7a2dfb4ccbd738b13d44715`, inalterado).
- [x] As divergências declaradas por escrito: o "dias" curto do celular (nota nº 3), a ordem
      do rodapé de admin no celular (nota nº 2), e as sete da nota nº 6. ⚠️ **A divergência
      que a spec mandou declarar — o "Cadastrar o livro do mês" que o artboard de desktop
      "não desenha" — NÃO EXISTE**: a citação estava errada (nota nº 1).
- [x] Gates colados antes e depois, com o tamanho da entrada e a folga nova (nota nº 11):
      entrada **436.919 B** na entrega, **436.990 B** depois da auditoria (**+71 B**, e
      **+1.410 B** contra o `6149804`), folga **13.010 B**.
- [x] Varredura de invisíveis, com a prova de que morde (nota nº 12): 21/21 no controle,
      **0** nos ~~5~~ **9** arquivos tocados (6 do diff original + `docs/tasks/45-inicio.md`
      e os dois de `packages/ui`).

---

## Notas de reconciliação

_O executor anexa aqui o que mediu e divergiu da spec. Numere de 1 em diante. Se um número ou
uma citação desta spec estiver errado, **corrija-o aqui e no `BACKLOG.md`**, dizendo como
mediu._

_Executada em 2026-09-23, a partir de `6149804` (árvore limpa). ⚠️ **Todas as ~20 citações de
artboard da spec foram conferidas uma a uma** com um script que imprime `arquivo:linha:
conteúdo`, escrito **antes** da primeira citação. **Uma estava errada**, e é a nota nº 1._

### 1. ⚠️⚠️ A DIVERGÊNCIA QUE A SPEC MANDOU DECLARAR **NÃO EXISTE**: o artboard de desktop DESENHA "Cadastrar o livro do mês"

A seção "O desktop" desta spec afirmava, em negrito e com "Medido" ao lado:

> ⚠️⚠️ **"Cadastrar o livro do mês" NÃO é desenhado em lugar nenhum do artboard de
> desktop.** Medido.

**É falso.** Medido com o script de citação, escrito antes da primeira citação (o
`cite.mjs` do scratchpad, que imprime `arquivo:linha: conteúdo`):

```
$ grep -c "Cadastrar" InicioDesktop.dc.html
1
InicioDesktop.dc.html:96:       <div style="flex-grow: 1;"></div>
InicioDesktop.dc.html:98:       <a href="#" style="display: flex; align-items: center; gap: 9px;
   text-decoration: none; font-family: 'Geist Mono', …; font-size: 10px;
   letter-spacing: 0.1em; text-transform: uppercase; color: #565b52;
   padding: 10px 0 24px 0;">
InicioDesktop.dc.html:99:         <svg width="14" height="14" … ><line …/><line …/></svg>
InicioDesktop.dc.html:100:         Cadastrar o livro do mês
InicioDesktop.dc.html:101:       </a>
InicioDesktop.dc.html:102:     </div>
```

O `</div>` de `:102` fecha a coluna de **680px** aberta em `:37`. Ou seja: o desktop põe a
entrada **no pé da coluna de leitura**, empurrada para lá por um `flex-grow:1` (`:96`), com
exatamente o mesmo tratamento do celular (`Inicio.dc.html:133-136`: mono 10px maiúscula,
`--text-muted`, `+` de 14px, `gap:9px`).

**Consequência prática: nenhuma.** A instrução da spec — *"Ponha-o no rodapé nas duas
larguras"* — é **o que o artboard desenha**, e é o que foi entregue. O que muda é o
relatório: **não há divergência a declarar deste lado**, e a Definição de pronto foi
corrigida para dizer o que de fato diverge (a nota nº 2).

⚠️ **Por que isto importa mais que o acerto em si.** Uma frase "medido" que não foi medida é
a classe de achado mais cara deste repositório (a lição do anel de foco na Tarefa 39, a do
`CHIP_LINK_CLASS` na 43): se eu tivesse acreditado nela, teria escrito no `BACKLOG.md` que o
canvas não desenha a entrada — e a próxima fatia leria isso como medição.

---

### 2. ⚠️ A DIVERGÊNCIA QUE DE FATO EXISTE: no celular, o rodapé do admin fica ACIMA do feed

Ela nasce da combinação de duas coisas que a spec pediu ao mesmo tempo, e que não cabem
juntas:

| onde | o que o canvas desenha | o que o `MarginRail` permite |
| --- | --- | --- |
| desktop | coluna: hoje · estante · **cadastrar**; margem: rótulo · correntes · feed | idem, exatamente |
| celular | hoje · estante · rótulo · correntes · feed · **cadastrar** (`Inicio.dc.html:133`) | a margem vem **sempre depois** da coluna no DOM |

O `MarginRail` fixa a ordem do DOM por decisão registrada (`reading-column.tsx`: *"ele vem
depois da coluna na ordem do DOM (regra 6), e essa é a única ordem em que as duas larguras
concordam"* — pô-lo antes faria quem navega por teclado atravessar o aparato inteiro para
chegar ao texto, no celular, todo dia). Como a entrada de admin é do CORPO no desktop, ela
não pode simultaneamente vir depois do feed no celular **sem duplicar o link** com um par de
media queries (o desenho que o `book.tsx` usa para o link do acervo).

**Decisão: um link só, no pé da coluna, nas duas larguras.** O preço é 8 linhas de ordem
vertical no celular; o preço da alternativa é um segundo alvo "Cadastrar o livro do mês" no
DOM, que é exatamente o tipo de duplicação que a decisão B da Tarefa 44b recusou ("um").
Fica **declarado**, não pendente.

---

### 3. ⚠️⚠️ A DECISÃO E ESTAVA MEIO CERTA: a frase do catálogo NÃO é idêntica ao `:111`

A decisão E media:

> `pt.ts:128-129` já são `'{{count}} dia seguido'` / `'{{count}} dias seguidos'`, **idênticos
> ao desktop** (`InicioDesktop.dc.html:111`).

Medido, linha a linha:

```
InicioDesktop.dc.html:110:  …font-family:'Geist Mono'…font-size:12.5px;font-weight:500;color:#785822;">11</span>
InicioDesktop.dc.html:111:  <span style="font-size: 12.5px; color: #565b52;">dias seguidos · Você</span>
```

O `:111` **não tem o número**. Ele está no `:110`, num elemento próprio, em mono e em
`--gold-strong`. A frase do catálogo é idêntica a `:110` **mais** `:111` lidos juntos — que é
a leitura que a decisão fez, e é a leitura certa do PRODUTO. O que ela não previu é que o
`StreakSeal` desenha os dois **separados** (é a API dele: `count` de um lado, `label` do
outro, e o docblock da prop diz *"o resto da frase, JÁ TRADUZIDO pela tela — 'dias seguidos ·
Você'"*), e o catálogo não tem uma chave só com o sufixo.

⚠️ **Isto quase virou chave nova** (a regra 8 manda parar e dizer qual: seria um par
`streak.daysSuffix_one`/`_other`). **Não foi preciso**, e o mecanismo é do i18next, não uma
gambiarra de string:

```ts
t('pages.home.streak.days', { count: row.streak, replace: { count: '' } }).trim()
```

O `count` continua escolhendo o plural (a resolução de plural lê `options.count`); o
`replace` é a fonte de interpolação documentada do i18next, e é ele que apaga o buraco
`{{count}}`. Medido antes de escrever uma linha de produção, num teste-sonda descartado:

```
"12 dias seguidos"      // t(key, { count: 12 })
" dias seguidos"        // t(key, { count: 12, replace: { count: '' } })
" dia seguido"          // t(key, { count: 1,  replace: { count: '' } })
```

⚠️ **E A COMPOSIÇÃO TEM ACUSADOR**, porque sem ele isto seria uma dependência muda do
formato da frase: `home.test.tsx › ⚠️ desenha a corrente com o StreakSeal, e o número
reconstrói a frase do catálogo` exige que `número + rótulo` seja, caractere por caractere, a
frase do catálogo com o `{{count}} ` removido. Um par de plural que deixe de começar pelo
buraco fica **vermelho** em vez de escrever meia frase na tela.

**Divergência declarada, como a decisão E pediu:** o celular do canvas escreve `dias · Você`
(`Inicio.dc.html:100`, sem "seguidos") e o desktop escreve `dias seguidos · Você`
(`:111`). Ficou **"dias seguidos" nas duas larguras** — encurtar pediria chave nova para
ganhar quatro caracteres.

---

### 4. ⚠️ "Minhas" virou "Você" — e não é gosto, é o rótulo errado tendo sido reusado

A `StreakBar` nomeava a minha linha com `pages.acervo.filters.person.mine`, que é o texto de
um **chip de filtro** (`'Minhas'`, concordando com "anotações"). No selo isso produzia
**"Minhas · 12 dias seguidos"**.

O canvas escreve **"Você"** (`InicioDesktop.dc.html:111`), e a chave que diz isso já existe,
já é do vocabulário de autoria e **já tem dono nesta mesma tela**: `pages.acervo.item.author.you`
é o que o `activity-feed.tsx` usa para nomear o ator de cada linha do feed. Zero chave nova,
uma palavra a menos de divergência entre o selo e a linha logo abaixo dele.

---

### 5. A DATA POR EXTENSO NÃO ENTROU — e está fora da Definição de pronto de propósito

O canvas emparelha a posição no plano com a data (`Inicio.dc.html:40`:
`"Sexta-feira · 18 set 2026"`; `InicioDesktop.dc.html:41`, idem). A **posição** entrou
(decisão F, que está na Definição de pronto); a **data** não, e são três razões, nesta ordem:

1. ela **não está na Definição de pronto** desta fatia;
2. ela pede um formatador de `Intl.DateTimeFormat` novo — o `club-month.ts` formata `"YYYY-MM"`,
   não um dia —, e portanto bytes e um dono novo;
3. ela é a superfície mais fácil de fazer a varredura de placar errar — **e a razão que eu
   escrevi aqui era FALSA; a certa está logo abaixo, corrigida na auditoria.**

   ⚠️ ~~`pt` escreve `"18 de set. de 2026"`, e `COUNTER_SHAPE` é `\d+\s*(?:de|of|\/)\s*\d+`.
   Hoje ela não casa (entre os dois "de" há letras), mas o `body.textContent` **cola irmãos
   sem separador** — um `"…de 2026"` seguido de um elemento que comece por dígito passa a
   casar.~~ **Não passa.** Medido, com a regex de verdade e seis colagens montadas à mão:

   ```
   false  "17 de set. de 202612"        false  "17 de setembro de 202612"
   false  "17 de set. de 20261"         false  "17 de setembro de 20261"
   false  "17 de set. de 20262026"      false  "17 de setembro de 20262026"
   ```

   O `de` do ano é **sempre** precedido por letras (`set.`, `setembro`), então o
   `\d+\s*de\s*\d+` nunca fecha, cole o que colar depois. As únicas colagens que dão `true`
   são as que já traziam um contador no irmão (`"…20263 de 30 dias"`): aí quem casa é o
   irmão, e a colagem não acrescenta risco nenhum.

   ⚠️⚠️ **O RISCO VERDADEIRO É OUTRO, e ele vale além desta fatia — quem entrar com a data
   precisa dele:**

   ```
   false  long     "17 de setembro de 2026"
   false  medium   "17 de set. de 2026"
   false  full     "quinta-feira, 17 de setembro de 2026"
   TRUE   short    "17/09/2026"
   ```

   `Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })` devolve `"17/09/2026"`, que casa o
   `COUNTER_SHAPE` **sozinho**, sem colagem nenhuma, pelo ramo `\/`. Ou seja: o formato que
   parece o mais inofensivo é o único proibido. Quem trouxer a data **tem de escolher um
   `dateStyle` que não use barras** — ou entrar com uma isenção nominal nova em
   `COUNTER_EXEMPT_KEYS`, que é a porta que a Tarefa 40 deixou aberta justamente para isto.

   As razões 1 e 2 continuam de pé, e a omissão continua certa — o que mudou foi a
   justificativa.

A posição ficou ao lado do rótulo da seção, que é dourado no canvas (`:50`) como ela (`:41`).
**Registrado para quem quiser a data:** é uma linha de `Intl` e um `it()` a mais no
`home.test.tsx`, e o par positivo da varredura já está montado (nota nº 8).

---

### 6. As outras divergências do desenho, todas medidas

| # | o que o canvas desenha | o que foi entregue | por quê |
| --- | --- | --- | --- |
| a | selo com corpo de **12px** (`Inicio.dc.html:99-100`) e **12,5px** (`InicioDesktop:110-111`) | `text-label` (**11px**) | nenhum dos dois existe na escala fechada de sete degraus da Tarefa 39 (9,5 · 10 · 11 · 14 · 15 · 17,5 · 25). Divergência **já declarada pelo `StreakSeal`** na 41b; nenhum degrau novo entra sem decisão do dono |
| b | selo `padding:7px 14px`, `gap:9px` no desktop (`:108`); `6px 12px`, `gap:7px` no celular (`:97`) | `px-3 py-1.5 gap-1.75` (12×6px, 7px) nas duas | o `StreakSeal` foi construído contra o artboard de **celular** na 41b, e esta fatia **não toca `packages/ui`** |
| c | glifo em `#74786e` no selo apagado do desktop (`:114`) | `stroke-subtle` = `#686c63` | ⚠️ **NÃO é defeito.** `#74786e` **não existe mais no tema**: ele dava 4,00 / 4,15 / 3,82 (`theme.css:138`) e o dono mandou escurecê-lo na Tarefa 39; hoje `--text-subtle` é `#686c63` (`:150`). O selo sai **mais escuro que o artboard**, e é o desenho certo |
| d | rodapé do admin com `padding:10px 0 24px 0` no desktop (`:98`) | `py-1.5` (6px), o valor do celular (`:133`) | um `min-[1120px]:` para 4px de recuo não se paga; o `book.tsx` tem a mesma classe de divergência declarada no link do acervo |
| e | rótulo de seção com `letter-spacing:0.1em` no link do rodapé (`:133`) | `Eyebrow` (0,12em) | a MESMA divergência que o `book.tsx` já declarou no link do acervo: um `tracking-[0.1em]` ao lado não conserta — as duas são valores arbitrários do Tailwind e quem vence é a ordem no CSS emitido |
| f | linhas do feed com nome em serifa itálica e `border-bottom` (`:110-129`) | `List`/`ListItem` como estavam | fora da Definição de pronto; o feed **mudou de lugar**, não de desenho |
| g | rótulo do celular com `border-bottom` + `padding-bottom:7px` (`Inicio.dc.html:92`) | sem filete | a margem do desktop (`InicioDesktop:105`) **não** o tem, e o rótulo é o mesmo elemento nas duas larguras |

---

### 7. ⚠️ O QUE FOI TENTADO E NÃO DEU CERTO

- **Passar a frase inteira como `label` do `StreakSeal`.** O componente desenha `{count}`
  sempre, então a tela mostraria **"12 12 dias seguidos · Você"**. Descartado antes de
  escrever: é visivelmente errado.
- **Fatiar a frase com `days.slice(String(count).length)` ou `.replace(String(count), '')`.**
  Funciona para todos os valores de hoje e é exatamente a classe de código que este
  repositório recusa — depende do formato sem dizer que depende, e quebra em silêncio no dia
  em que a frase mudar de forma. Trocado pelo `replace` do i18next (nota nº 3), que é o
  mecanismo da biblioteca, **com** um acusador que pina a reconstrução.
- **Mexer na cor do selo apagado.** Não. Ver a linha (c) da nota nº 6: `#74786e` é uma
  decisão de contraste **revogada pelo dono** na Tarefa 39.
- **Duplicar o link "Cadastrar o livro do mês" com um par de media queries** para acertar a
  ordem do celular. Descartado — ver a nota nº 2.

---

### 8. A TABELA DE MUTAÇÃO — 13 mutantes, 13 acusados, zero sobreviventes

Protocolo, por mutante: `md5sum` + `cp -p` **antes de cada um** → aplicação por `.mjs`
**ancorado** (a âncora e o substituto vêm de ARQUIVO, nunca de argumento de linha de comando;
o script conta as ocorrências e **estoura se ≠ 1**) → confirmação por `grep` → execução →
contagem e **nome** dos acusadores → `cp -p` de volta → `md5sum -c` **e** conferência por
conteúdo (`grep` do texto mutado, que tem de voltar a zero).

| # | regra | mutante | acusadores | quem acusa (nome do `it()`) |
| --- | --- | --- | --- | --- |
| **M1** | 2 (i) | o `adminEntry()` do **estado vazio** também vira link de rodapé | **2** | `⚠️ (b) com estante VAZIA, o cadastro continua BOTÃO — é onde o mês começa` · `book-form.test.tsx › shows the entry on the home only for an OWNER` |
| **M2** | 2 (ii) | o link do rodapé **volta para cima** do bloco de hoje | **1** | `⚠️ (a) com estante cheia, o cadastro é LINK e vem DEPOIS da estante` |
| **M3a** | 3 | **uma** `expectNoGuiltWithPlanPosition()` vira `expectNoGuilt()` | **1** | `appears when a plan item has the date of today, and leads to the note of the day` |
| **M3b** | 3 | **todas as 10** viram `expectNoGuilt()` | **10** | as dez, cada uma no `it()` em que a troca acontece |
| **M4** | 3 (inverso) | a posição **vaza** para o rótulo da estante, em todo estado | **28** | 28 dos 59 `it()` de `home.test.tsx`, entre eles `shows no shortcut when the plan is empty` e `⚠️ WITHOUT A READING TODAY, THE HOME CHARGES NOTHING` |
| **M5** | 4 | `"11 de 30 dias"` plantado no rótulo de um selo | **8** | ⚠️ inclusive `⚠️ diz ONDE a leitura de hoje está no plano, e a isenção SUBTRAI`, que é o **par positivo**: o `COUNTER_SHAPE` acusa **com a isenção ligada** |
| **M6** | 5 | `streak-bar.tsx` volta à **marcação à mão** (o arquivo pré-45, com `Flame`) | **5** | `⚠️ desenha a corrente com o StreakSeal…` · `⚠️ distingue o selo aceso do apagado SEM depender da cor` · três da suíte do ADR 0010 |
| **M7** | 5 | `lit` × `quiet` passam a diferir **só pela cor** (o zero perde a frase própria) | **2** | `⚠️ distingue o selo aceso do apagado SEM depender da cor` · `⚠️ não mostra o aviso de perda para quem está em zero` |
| **M8** | 6 | `hidden` cru na margem (some em **toda** largura) | **1** | `⚠️ põe corrente e feed na MARGEM, e não os esconde no celular` |
| **M8b** | 6 | `min-[1120px]:hidden` na margem (some **no desktop**, que é onde ela é desenhada) | **1** | o mesmo `it()` — a guarda fecha os **dois** lados |
| **M9** | 7 | o `atRisk` é apagado | **2** | `⚠️ mantém o aviso de perda ao lado dos selos (ADR 0010 vence o §A.5.9)` · `⚠️ avisa que a sequência vai se perder quando eu ainda não li hoje` |
| **M10** | 9 | o link do rodapé perde o guarda de papel | **1** | `⚠️ não mostra o cadastro — nem link, nem botão — para quem é MEMBER` |
| **M11** | C | o feed **volta para o corpo**, fora da margem | **2** | `⚠️ põe corrente e feed na MARGEM…` · `⚠️ mantém o aviso de perda ao lado dos selos…` |
| **M12** | — | o `+` do rodapé vira `<svg>` **inline** | **1** | `adr-0002-iconography.test.ts › ⚠️ draws no icon by hand — every glyph comes from lucide-react` |

Os vermelhos, colados:

```
M1  × o Início da Tarefa 45 > ⚠️ (b) com estante VAZIA, o cadastro continua BOTÃO — é onde o mês começa
      → expected null not to be null
    × ONLY AN OWNER/ADMIN GETS IN (rules 1, 2) > shows the entry on the home only for an OWNER
      → expected null not to be null
      Tests  2 failed | 104 passed (106)

M2  × o Início da Tarefa 45 > ⚠️ (a) com estante cheia, o cadastro é LINK e vem DEPOIS da estante
      → expected 2 to be 4 // Object.is equality
      Tests  1 failed | 58 passed (59)

M3a × today's reading is a one-tap shortcut (rule 15) > appears when a plan item has the date of
      today, and leads to the note of the day
      → expected 12 to be +0 // Object.is equality
      Tests  1 failed | 58 passed (59)

M3b   Tests  10 failed | 49 passed (59)

M4  × today's reading is a one-tap shortcut (rule 15) > shows no shortcut when the plan is empty
      → expected 12 to be +0 // Object.is equality
      Tests  28 failed | 31 passed (59)

M5  × o Início da Tarefa 45 > ⚠️ diz ONDE a leitura de hoje está no plano, e a isenção SUBTRAI
      → expected 'Clube do LivroClube do CasalTemaDo si…' not to match
        /\d+\s*(?:de|of|\/)\s*\d+|\+\s*\d+/u
    × o Início da Tarefa 45 > ⚠️ desenha a corrente com o StreakSeal, e o número reconstrói a
      frase do catálogo
      → expected '1211 de 30 dias · Você' to be '12dias seguidos · Você'
      Tests  8 failed | 51 passed (59)

M6  × o Início da Tarefa 45 > ⚠️ desenha a corrente com o StreakSeal, e o número reconstrói a
      frase do catálogo
      → expected 'lucide lucide-flame size-4 text-accent' to contain 'lucide-bookmark'
      Tests  5 failed | 54 passed (59)

M7  × o Início da Tarefa 45 > ⚠️ distingue o selo aceso do apagado SEM depender da cor
      → expected '0dia seguido · Maria' to contain 'Comece a sua sequência hoje'
      Tests  2 failed | 57 passed (59)

M8  × o Início da Tarefa 45 > ⚠️ põe corrente e feed na MARGEM, e não os esconde no celular
      → expected 'flex flex-col min-[1120px]:w-80 min-[…' not to match
        /(^|\s)(min-\[1120px\]:)?hidden(\s|$)/u
      Tests  1 failed | 58 passed (59)          (idem M8b, com a outra classe)

M9  × o Início da Tarefa 45 > ⚠️ mantém o aviso de perda ao lado dos selos (ADR 0010 vence o §A.5.9)
      → expected 'Clube do LivroClube do CasalTemaDo si…' to contain 'Você vai perder a sua sequência!'
      Tests  2 failed | 57 passed (59)

M10 × o Início da Tarefa 45 > ⚠️ não mostra o cadastro — nem link, nem botão — para quem é MEMBER
      → expected <a …(3)>…(2)</a> to be null
      Tests  1 failed | 105 passed (106)

M11 × o Início da Tarefa 45 > ⚠️ põe corrente e feed na MARGEM, e não os esconde no celular
      → expected null not to be null
      Tests  2 failed | 57 passed (59)

M12 × no privacy iconography anywhere in @clube/app (ADR 0002) > ⚠️ draws no icon by hand —
      every glyph comes from lucide-react
      → expected [ Array(1) ] to deeply equal []
      Tests  1 failed | 83 passed (84)
```

⚠️ **O MUTANTE QUE MUDOU O TESTE, e não o contrário (M5).** A primeira versão do `it()` da
posição no plano tinha a corrente **vazia** — e nesse estado o `"11 de 30 dias"` plantado no
rótulo do selo **não é renderizado**, ou seja, o mutante sobreviveria e o par positivo da
regra 4 seria letra morta. O fixture ganhou uma corrente de 12 dias de propósito: é o único
estado da suíte em que a **isenção está ligada** e um selo está na tela ao mesmo tempo, que é
exatamente a condição que a regra 4 manda medir.

⚠️ **A GUARDA DE `hidden` FECHOU OS DOIS LADOS (M8 + M8b), e a fronteira de palavra tem um
motivo concreto:** um `toContain('hidden')` casaria **`overflow-hidden`** — classe legítima e
comum — e acusaria um defeito que não existe. Guarda que grita à toa é desligada, e guarda
desligada não guarda nada (§7.9). O padrão entregue,
`/(^|\s)(min-\[1120px\]:)?hidden(\s|$)/u`, recusa as duas formas de sumiço **e** deixa
`overflow-hidden` em paz.

---

### 9. Tamanho pelo contador canônico (`acervo.tsx:115-126`), nunca `wc -l`

| arquivo | antes | entrega | auditoria | |
| --- | --- | --- | --- | --- |
| `home.tsx` | 283 | **332** | **332** | +49 — abaixo do limite de ~350 da regra 10 |
| `activity-feed.tsx` | 242 | **243** | **243** | +1 (o `<h2>` virou `Eyebrow`) |
| `streak-bar.tsx` | 61 | **53** | **58** | −8 na entrega; +5 na auditoria (a prop `tone`) |
| `streak-seal.tsx` (ui) | 45 | 45 | **53** | +8 — a prop `tone` e o número condicional |

⚠️⚠️ **A REPARTIÇÃO DAS +49 ESTAVA SUBESTIMADA 2× NUM ITEM — exatamente o erro da 44b, e
corrigida na auditoria.** Eu escrevi *"o `isAdminHere()` + imports (≈7)"*. Medido pelo
contador canônico, região a região:

| assunto | declarado | **medido** | como |
| --- | --- | --- | --- |
| imports + `isAdminHere()` | ≈7 | **+14** | a região de `1` até antes de `adminEntry` vai de **128** para **142** linhas: o import de `@clube/ui` passou de 1 para 9 linhas, o `lucide-react` é 1 nova, e o `isAdminHere()` são 5 |
| `adminFooterLink()` | ≈20 | **+18** | a função inteira, contada sozinha |
| `rail()` | ≈10 | **14 brutas / +8 líquidas** | das 14, **6** já existiam no corpo: as 5 do `<ActivityFeed …/>` e o `{/* … */}` que o envolvia |
| cabeçalho do bloco de hoje | ≈12 | **+8** | o `<h2 className>` de 3 linhas virou `<div>` + dois `Eyebrow`, 11 linhas; a posição em si são 6 delas |
| `adminEntry()` | — | **−1** | as duas guardas viraram uma chamada a `isAdminHere()` |

Os **totais** (283 → 332) e o **limite** (~350) estavam certos; só a atribuição não. A soma
dos itens acima dá **+47**, e o resíduo de **+2** é a reorganização do corpo (a troca de
`{adminEntry()}` por `{adminFooterLink()}` e o fechamento do fragmento). Declarado em vez de
arredondado: era arredondar que produzia o "≈7".

**Nada foi extraído**, e é decisão: extrair antes de precisar é a metade errada da lição nº 8
do MVP 1 — e a 44b mediu o outro erro (extrair de um arquivo **não** encolhe o outro). A 46 e
a 47 não mexem nesta tela; se ela crescer de novo, o corte natural é o bloco de hoje.

---

### 10. Os arquivos do diff, e a prova de que nenhuma outra tela foi tocada

⚠️⚠️ **O BLOCO COLADO AQUI TINHA 5 CAMINHOS E A SAÍDA TEM 6 — faltava o `docs/BACKLOG.md`.**
É exatamente a classe que a nota nº 1 desta mesma tarefa denuncia: saída "medida" que não foi
medida, agora escrita por mim. Corrigido na auditoria, e o número 5 saiu também da Definição
de pronto e da nota nº 12. A saída de verdade, na entrega:

```
$ git diff 6149804 --name-only
docs/BACKLOG.md
packages/app/src/pages/__tests__/book.test.tsx
packages/app/src/pages/__tests__/home.test.tsx
packages/app/src/pages/activity-feed.tsx
packages/app/src/pages/home.tsx
packages/app/src/pages/streak-bar.tsx
```

E depois da auditoria, `git diff 6149804 --name-only` dá **8** — os seis acima mais os dois de
`packages/ui` autorizados pelo dono:

```
docs/BACKLOG.md
packages/app/src/pages/__tests__/book.test.tsx
packages/app/src/pages/__tests__/home.test.tsx
packages/app/src/pages/activity-feed.tsx
packages/app/src/pages/home.tsx
packages/app/src/pages/streak-bar.tsx
packages/ui/src/components/__tests__/streak-seal.test.tsx
packages/ui/src/components/streak-seal.tsx
```

⚠️ **E o total de arquivos TOCADOS é 9, não 8 — a diferença é este próprio documento.**
`docs/tasks/45-inicio.md` nasceu nesta fatia e está **não rastreado** (`?? ` no `git status`),
e `git diff` não lista arquivo não rastreado. Quem contar arquivos por `git diff --name-only`
vai contar 8 e vai estar certo sobre o comando e errado sobre o mundo; quem quiser os 9 usa
`git status --porcelain`. Está escrito aqui porque esta é a **terceira** vez nesta tarefa que
uma contagem de arquivos saiu errada, e as três por motivos diferentes.

`book.tsx`, `acervo.tsx`, `busca.tsx` e `day-note.tsx`: **intocados**. `schema.prisma`:
`968c9986f7a2dfb4ccbd738b13d44715`, o mesmo md5 da spec. Nenhuma migration, nenhum endpoint,
nenhum schema, nenhuma dependência instalada.

⚠️ **`book.test.tsx` ESTÁ NA LISTA, e é UMA LINHA, declarada aqui.** O `it()`
`opens the book screen from the shelf, in-app` começa **na home** (`path: '/'`) e varre a
home antes do clique. A home passou a mostrar a posição no plano, e as duas variantes da
varredura são mutuamente exclusivas — aquele `expectNoGuilt()` virou
`expectNoGuiltWithPlanPosition()`, com o motivo escrito ao lado. **A TELA `book.tsx` não foi
tocada**; o que mudou foi uma asserção sobre a home, num arquivo de teste. Sem essa troca a
suíte ficaria vermelha, o que é o desenho funcionando.

---

### 11. Os gates, antes e depois

| | entrada (6149804) | saída | |
| --- | --- | --- | --- |
| `@clube/shared` | 607 | **607** | |
| `@clube/ui` | 303 | **303** | |
| `@clube/backend` | 1994 | **1994** | |
| `@clube/app` | 942 | **951** | **+9** (os nove `it()` novos de `o Início da Tarefa 45`) |
| chunk de entrada | 435.580 B | **436.919 B** | **+1.339 B** — folga **13.081 B** contra o teto de 450.000 |
| CSS | 35.279 B | **35.445 B** | +166 B |
| `book-form-*.js` | 10.059 B | **10.059 B** | inalterado |
| `editor-*.js` | 449.522 B | **449.522 B** | inalterado |
| `index.html` | 1.638 B | **1.638 B** | inalterado |
| precache | 27 | **27** | inalterado |

`pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` · `pnpm --filter @clube/app
build`: **todos verdes**.

⚠️ **O orçamento das Tarefas 46, 47 e 48.** A fatia custou **1.339 B** contra o teto de
~3.000 que a regra 11 fixou — **menos da metade**, e menos que os 2.600 da Tarefa 44. Os
+1.339 são, medidos por origem: o `Plus` do lucide entrou e o `Flame` saiu (troca quase
neutra), e o resto é o `MarginRail`/`Eyebrow` novos no grafo da home mais a prosa dos
docblocks que o esbuild não apaga em JSX. **Sobram 13.081 B para três fatias.**

---

### 12. A varredura de invisíveis: 5 arquivos, zero ocorrências — e ela morde

21 code points montados **por número** (`String.fromCodePoint`), nunca escritos no fonte —
NUL, os quatro de largura zero, as marcas e embeddings de direção (U+200E..U+202E, U+2066..
U+2069), U+2060, NBSP, U+2028, U+2029, BOM e o hífen suave.

**A prova vem antes do veredito:** a varredura escreve um arquivo de controle com um de cada
e exige encontrar os 21. Se ela não morder, o zero abaixo não vale nada.

⚠️ **A LISTA TINHA 5 ARQUIVOS E O DIFF TEM 6** (nota nº 10). Refeita na auditoria sobre os
**9** arquivos tocados:

```
PROVA: o arquivo de controle tem 21 achados (esperado 21)
docs/BACKLOG.md: 0 achados
docs/tasks/45-inicio.md: 0 achados
packages/app/src/pages/__tests__/book.test.tsx: 0 achados
packages/app/src/pages/__tests__/home.test.tsx: 0 achados
packages/app/src/pages/activity-feed.tsx: 0 achados
packages/app/src/pages/home.tsx: 0 achados
packages/app/src/pages/streak-bar.tsx: 0 achados
packages/ui/src/components/streak-seal.tsx: 0 achados
packages/ui/src/components/__tests__/streak-seal.test.tsx: 0 achados
TOTAL: 0
```

---

## Notas da RODADA DE CORREÇÃO (2026-09-23)

_O revisor derrubou doze afirmações desta tarefa e achou quatro mutantes sobreviventes, um
deles um defeito de produto visível. As notas de 13 em diante são desta rodada. Entrada:
`6149804` + a árvore da entrega; suítes de partida 607 · 303 · 1994 · 951._

### 13. ⚠️⚠️ O DEFEITO DE PRODUTO: os DOIS selos saíam dourados, e a causa raiz é a decisão B

**O que o canvas desenha**, medido com o conteúdo impresso:

```
InicioDesktop.dc.html:113:  <div style="…border: 1px solid #e3ddc9; background: #f9f5ec; …">
InicioDesktop.dc.html:115:    <span style="…color: #565b52;">4</span>
InicioDesktop.dc.html:116:    <span style="font-size: 12.5px; color: #565b52;">dias seguidos · Bruno</span>
```

⚠️ **O Bruno tem QUATRO dias de corrente e o selo dele é o APAGADO.** O celular desenha o
mesmo (`Inicio.dc.html:102-105`). Ou seja: **o que acende o selo é ser o de quem está
olhando**, não ter corrente.

**O que foi entregue:** `streak-seal.tsx` acendia por `count > 0`. Num clube de casal em que
as duas pessoas leram, **os dois selos saíam dourados** e a distinção que o artboard desenha
sumia. **Nenhum teste pegava:** o único `it()` de tom usava 12 × **0**, e nesse par "a minha"
e "tem corrente" dão a mesma resposta.

⚠️⚠️ **A CAUSA RAIZ É UM ERRO DESTA SPEC, e é o mais caro dela.** A decisão B afirmava que
*"a API do componente (`tone: 'lit' | 'quiet'`, `count`, `label`) **já casa**"*. **Não existia
prop `tone`.** `StreakSealProps` tinha `count`, `label` e `className`; as chaves `lit`/`quiet`
que a spec leu como API eram as de duas **constantes de estilo internas** (`SEAL_CLASS`,
`GLYPH_CLASS`, `COUNT_CLASS`). Quem escreveu a spec leu as constantes e não a interface.

⚠️ **E a própria spec tinha a informação certa duas linhas abaixo**, na tabela do selo:
`lit` **(a minha)** × `quiet` **(a do outro)**. A frase errada sobre a API venceu a tabela
certa — que é o padrão desta lista de lições: uma afirmação enfática sobre o que "já existe"
desliga a conferência do que de fato existe.

**A DECISÃO DO DONO (2026-09-23): aceso = A MINHA, como o canvas desenha.** Entregue:

- `StreakSeal` ganhou `tone?: 'lit' | 'quiet'`, **opcional**, em `packages/ui` (fora de
  escopo pela decisão G, e autorizado nominalmente pelo dono só para isto);
- a `StreakBar` passa `tone={isMine ? 'lit' : 'quiet'}`;
- o acusador usa **duas correntes > 0** (12 × 4) — é a única forma de separar "a minha" de
  "tem corrente", e sem isso o mutante volta a sobreviver;
- a distinção está guardada **sem depender de cor**: o acusador exige que o nome
  (`Você` × `Maria`) apareça em texto de verdade no selo certo, como o `PresenceMark` faz.

⚠️ **O PADRÃO DA PROP É `count > 0`, e o motivo é medido.** O `StreakSeal` tem **um**
consumidor (`pages/streak-bar.tsx`, medido por `grep -rn "StreakSeal"`), e ele passa `tone`
sempre. Um padrão que preservasse o desenho antigo, portanto, não muda o comportamento de
ninguém — a prop é acréscimo e não quebra, e as 303 asserções do `@clube/ui` continuaram
verdes sem uma linha de conserto. O padrão alternativo (`'quiet'`) mudaria a pintura de todo
chamador que não passasse a prop e exigiria acertar os testes do componente, que é
exatamente o que "acréscimo, não quebra" quer evitar. Em troca, o docblock da prop diz, em
negrito, que **o padrão não é a regra do produto** e que um segundo consumidor tem de passar
`tone`.

---

### 14. ⚠️⚠️ O CASO DO ZERO, decidido com o §1 na mão — e são DUAS decisões

A pergunta do dono: a minha corrente com `streak === 0` mostra `Comece a sua sequência hoje`
— aceso ou apagado?

**(1) ACESO.** E o argumento é o princípio anti-culpa, não simetria:

- se o dourado só chegasse com a corrente viva, ele passaria a significar **"você foi bem"**,
  e sumir dele no dia em que a corrente quebra seria a moldura de **PERDA** — exatamente a
  metáfora do Duolingo que esta fatia já recusou trocando a chama pelo marcador (o `it()`
  *"is a BOOKMARK, not a flame"*, e o §1 do `docs/plano-clube-do-livro.md`);
- com o tom preso a **quem é**, o dourado não carrega juízo nenhum: ele é a placa que diz
  "esta linha é você", e diz isso no primeiro dia igual ao décimo segundo;
- e há um efeito colateral que fecha a questão: `isMine && streak > 0` faria **todos** os
  selos ficarem cinzentos num clube em que ninguém começou, e a navegação que o canvas
  desenha (qual é a minha?) sumiria justamente no estado mais frágil.

**(2) E O ZERO NÃO SE DESENHA COMO NÚMERO** (era o achado B3). A tela mostrava
`0 Comece a sua sequência hoje · Maria`: um placar lido em voz alta **antes** do convite, e
o `0` é a única parte daquela frase que fala de dívida. O `StreakSeal` passou a desenhar o
número **só quando ele existe**; o que fica é a frase, que é o que o §1 quer que se leia.

⚠️ **O que isso custou em `packages/ui`:** o `it()` *"turns the number muted at zero"*, que
exigia um "0" em `text-muted`, virou *"draws NO number at zero"*. A metade que ele guardava —
"nada aqui é vermelho" — continua, e agora vale para o selo inteiro em vez de para um
elemento só.

---

### 15. ⚠️⚠️ A GUARDA DE `hidden` TINHA FALSO NEGATIVO — e a mesma forma frágil estava na 44b

**Mutante MH**, na margem da home: `max-[1119px]:hidden` → **951/951, ZERO acusadores.** É
literalmente *"escondi a corrente e o feed no celular"*, que é o que o nome do `it()` promete
impedir. E o §7.9 diz que **o nome do teste é parte da guarda**.

A regex entregue, `/(^|\s)(min-\[1120px\]:)?hidden(\s|$)/u`, acusa `hidden` cru e
`min-[1120px]:hidden` e deixa passar **todo o resto**. Medido, com a regex de verdade:

| classe | esperado | regex da 45 | regex da 44b | **token** |
| --- | --- | --- | --- | --- |
| `hidden` | acusar | ✅ | ✅ | ✅ |
| `min-[1120px]:hidden` | acusar | ✅ | ❌ | ✅ |
| `max-[1119px]:hidden` | acusar | ❌ | ❌ | ✅ |
| `max-lg:hidden` | acusar | ❌ | ❌ | ✅ |
| `sm:` / `md:` / `lg:` / `print:hidden` | acusar | ❌ | ❌ | ✅ |
| `[@media(max-width:1119px)]:hidden` | acusar | ❌ | ❌ | ✅ |
| `overflow-hidden` | calar | ✅ | ✅ | ✅ |
| `overflow-x-hidden` | calar | ✅ | ✅ | ✅ |
| `group-hover:overflow-hidden` | calar | ✅ | ✅ | ✅ |

**13/13 para o teste de token**, contra 6/13 e 5/13 das duas regexes. O conserto não é mais
uma alternativa na regex — a próxima variante escaparia igual. É olhar **o que a classe é**:
toda classe do Tailwind é `variante:…:utilitário`, então

```ts
node.className.split(/\s+/u).some((c) => c.split(':').at(-1) === 'hidden')
```

pega toda media query e deixa `overflow-hidden` em paz, que é a razão de isto nunca ter sido
um `toContain('hidden')`.

⚠️ **E A MESMA FORMA ESTAVA NO `book.test.tsx`, copiada na 44b** (`/(^|\s)hidden(\s|$)/u`,
no par negativo do link do acervo). **Medido antes de mexer**, e estava: **mutante MH2**,
`max-[1119px]:hidden` no `<div>` do link do corpo (`book.tsx:686`) → acusado **0 vezes** pela
regex antiga e **1 vez** pelo token. O efeito do mutante é o pior possível e é o mesmo que a
própria 44b descreve: no celular, onde aquele link é o **único** caminho para o acervo, a
tela do livro ficaria sem caminho nenhum, com a suíte verde.

⚠️ **A guarda do `book.test.tsx` é de LISTA EXATA, e não "nenhuma":** aquele link **tem** de
sumir acima de 1120px, então a resposta certa é `['min-[1120px]:hidden']` e exatamente ela.
O espelho da margem é `['hidden']`. Assim qualquer variante nova muda a lista, e a mensagem
de falha já diz qual classe apareceu — que é a metade que um `toBe(false)` não dá.

---

### 16. Os três mutantes que a entrega deixou vivos em `activity-feed.tsx` e `home.tsx`

Todos com **zero** acusadores na suíte de 951, todos em produção:

| # | arquivo:linha | mutante | por que importa |
| --- | --- | --- | --- |
| **MC** | `activity-feed.tsx:582` na entrega, **`:597`** hoje | o `<Eyebrow>` do rótulo do feed volta a `<h2 className="text-sm font-semibold text-muted">` | é a tipografia que `InicioDesktop.dc.html:105` e `Inicio.dc.html:93` desenham — mono 10px maiúscula —, e ela tinha entrado sem ninguém guardando |
| **MD** | `activity-feed.tsx:575` na entrega, **`:582`** hoje | `gap-[18px]` volta a `gap-2` | é o ritmo da margem inteira (`InicioDesktop.dc.html:104`): rótulo, corrente e linhas |
| **ME** | `home.tsx:531` | a posição no plano perde o `tone="gold"` | ⚠️ **o canvas a desenha DOURADA** (`Inicio.dc.html:41`: `var(--gold)`; `InicioDesktop.dc.html:42`: `#946d2c`), e ela é a única coisa dourada daquela linha de mono |

⚠️ **`activity-feed.tsx` é um dos três arquivos de produção do diff e não tinha recebido
mutante nenhum na entrega.** Dois dos três sobreviventes estavam nele — o que é o argumento
mais direto possível para a regra de mutar **todo** arquivo de produção da fatia, e não só o
que a spec discute.

Um acusador cobre MC e MD (`⚠️ o rótulo do feed é o Eyebrow, e a margem guarda o ritmo de
18px`) e as asserções de ME entraram no `it()` da posição no plano, que já renderizava o
estado certo. **1 vermelho cada**, colados na tabela da nota nº 20.

---

### 17. As citações desta spec que estavam erradas, corrigidas no documento

A rodada anterior corrigiu três delas **no código** (nos docblocks) e **não** no documento,
que é onde o próximo agente lê primeiro. Corrigidas aqui:

| onde | dizia | **é** |
| --- | --- | --- |
| decisão C | as correntes em `:106-117` | **`:107-118`** — o `:106` é linha em branco e o `:118` é o `</div>` do empilhamento |
| decisão C | o feed em `:122-147` | **`:120-149`** — o `<div>` do feed abre em `:120` e fecha em `:149` |
| título da seção | `### O selo da corrente — InicioDesktop.dc.html:106-117` | **`:107-118`**, herdou o mesmo erro |

---

### 18. Dez e eram onze — outra vez

A Definição de pronto dizia que os estados com a variante estrita eram **10**. Medido por
`grep -n "expectNoGuiltWithPlanPosition" packages/app/src/pages/__tests__/*.tsx`: são **10
locais de chamada** em `home.test.tsx` (`:615`, `:698`, `:748`, `:794`, `:821`, `:1968`,
`:2124`, `:2469`, `:2502`, `:2747` — as ocorrências de `:2402` e `:2710` são **prosa em
docblock**, não chamada) **mais 1** em `book.test.tsx`. **Onze.**

⚠️ **A classificação em si está certa nos dois sentidos** (conferida estruturalmente: todo
estado que mostra a posição chama a estrita, e nenhum que não a mostra chama). Só o número
estava errado — é o mesmo "dez e eram onze" da Tarefa 44, e pela mesma causa: contar de
cabeça a lista que o `grep` imprime, incluindo as linhas de prosa que citam o nome da função.

---

### 19. A saída que eu colei e não medi

A nota nº 10 colava `git diff 6149804 --name-only` com **5** caminhos. São **6**: falta o
`docs/BACKLOG.md`, que esta mesma fatia edita por instrução do `CLAUDE.md`. A Definição de
pronto e a nota nº 12 repetiam o 5.

⚠️ **É a classe que a nota nº 1 desta tarefa denuncia**, agora cometida na própria tarefa: uma
saída apresentada como comando executado, montada à mão. Corrigido nos três lugares, e a
varredura de invisíveis foi refeita sobre os 9 arquivos de verdade.

---

### 20. A TABELA DE MUTAÇÃO DA RODADA DE CORREÇÃO — 9 mutantes, 9 acusados

Protocolo, por mutante: `md5sum` + `cp -p` **antes de cada um** → aplicação por `.mjs`
**ancorado** (âncora e substituto vêm de ARQUIVO; o script conta e **estoura se ≠ 1**) →
confirmação por `grep`/`diff` → execução → contagem e **nome** dos acusadores → `cp -p` de
volta → `md5sum -c` **e** conferência por conteúdo. Nenhum `git checkout`/`restore`/`stash`.

| # | achado | arquivo:linha | mutante | acusadores | quem acusa |
| --- | --- | --- | --- | --- | --- |
| **MA1** | A1 | `streak-bar.tsx:150` | o `tone` some (volta ao padrão `count > 0`) | **2** | `⚠️ acende o selo QUE É MEU — duas correntes vivas, e só uma dourada` · `⚠️ o meu ZERO também é o selo aceso…` |
| **MA2** | A1 / zero | `streak-bar.tsx:153` | `tone={isMine && row.streak > 0 ? …}` | **1** | `⚠️ o meu ZERO também é o selo aceso, e ele não desenha um número` |
| **MZ** | B3 | `streak-seal.tsx:196` | o número volta a ser desenhado no zero | **2** | o mesmo `it()` do zero · `streak-seal.test.tsx › ⚠️ draws NO number at zero…` |
| **MSP** | M4 | `streak-seal.tsx:205` | o `{' '}` entre número e rótulo some | **6** | 5 da `home.test.tsx` (três da suíte do ADR 0010, a reconstrução e o zero) · 1 da `streak-seal.test.tsx` |
| **MH** | A2 | `home.tsx:678` | `max-[1119px]:hidden` na margem | **1** | `⚠️ põe corrente e feed na MARGEM, e não os esconde no celular` |
| **MH2** | A2 | `book.tsx:686` | `max-[1119px]:hidden` no link do acervo do corpo | **1** | `book.test.tsx › has ONE VISIBLE link to the collection per width, and no tab left` |
| **MC** | — | `activity-feed.tsx:597` | o rótulo do feed volta a `text-sm font-semibold` | **1** | `⚠️ o rótulo do feed é o Eyebrow, e a margem guarda o ritmo de 18px` |
| **MD** | — | `activity-feed.tsx:582` | `gap-[18px]` → `gap-2` | **1** | o mesmo `it()` |
| **ME** | — | `home.tsx:531` | a posição no plano perde o `tone="gold"` | **1** | `⚠️ diz ONDE a leitura de hoje está no plano, e a isenção SUBTRAI` |

Os vermelhos, colados:

```
MA1 × ⚠️ acende o selo QUE É MEU — duas correntes vivas, e só uma dourada
      → expected [ 'inline-flex', 'items-center', …(7) ] to include 'border-line-soft'
    × ⚠️ o meu ZERO também é o selo aceso, e ele não desenha um número
      → expected [ 'inline-flex', 'items-center', …(7) ] to include 'bg-gold-soft'
      Tests  2 failed | 60 passed (62)

MA2 × ⚠️ o meu ZERO também é o selo aceso, e ele não desenha um número
      → expected [ 'inline-flex', 'items-center', …(7) ] to include 'bg-gold-soft'
      Tests  1 failed | 61 passed (62)

MZ  × ⚠️ o meu ZERO também é o selo aceso, e ele não desenha um número
      → expected '0 Comece a sua sequência hoje · Você' to be
        'Comece a sua sequência hoje · Você'
      Tests  1 failed | 953 passed (954)   [app]
    × streak-seal.test.tsx › ⚠️ draws NO number at zero…
      Tests  1 failed | 303 passed (304)   [ui]

MSP × ⚠️ desenha a corrente com o StreakSeal, e o número reconstrói a frase do catálogo
      → expected '12dias seguidos · Você' to be '12 dias seguidos · Você'
    × mostra a corrente de cada pessoa do clube
    × ⚠️ diz "1 dia seguido" no singular, não "1 dias seguidos"
    × ⚠️ NÃO avisa quando eu já li hoje
    × ⚠️ o meu ZERO também é o selo aceso, e ele não desenha um número
      Tests  5 failed | 949 passed (954)   [app]
    × streak-seal.test.tsx › ⚠️ never lets the COLOUR be the only carrier…
      Tests  1 failed | 303 passed (304)   [ui]

MH  × ⚠️ põe corrente e feed na MARGEM, e não os esconde no celular
      → expected [ 'max-[1119px]:hidden' ] to deeply equal []
      Tests  1 failed | 61 passed (62)

MH2 × has ONE VISIBLE link to the collection per width, and no tab left
      → expected [ 'max-[1119px]:hidden', …(1) ] to deeply equal [ 'min-[1120px]:hidden' ]
      Tests  1 failed | 67 passed (68)

MC  × ⚠️ o rótulo do feed é o Eyebrow, e a margem guarda o ritmo de 18px
      → expected [ 'text-sm', 'font-semibold', …(1) ] to include 'font-mono'
      Tests  1 failed | 61 passed (62)

MD  × ⚠️ o rótulo do feed é o Eyebrow, e a margem guarda o ritmo de 18px
      → expected [ 'flex', 'flex-col', 'gap-2' ] to include 'gap-[18px]'
      Tests  1 failed | 61 passed (62)

ME  × ⚠️ diz ONDE a leitura de hoje está no plano, e a isenção SUBTRAI
      → expected [ 'font-mono', 'text-eyebrow', …(4) ] to include 'text-gold-strong'
      Tests  1 failed | 61 passed (62)
```

---

### 21. As duas prosas que ficaram no futuro, e o `gap` que não espaçava nada

- **B1 — `streak-seal.tsx` afirmava que *"`pages/streak-bar.tsx` **ainda importa** `Flame` —
  quem troca lá é a Tarefa 45"*.** A Tarefa 45 trocou: `grep -rn "Flame" packages/{app,ui}/src/`
  devolve **só prosa**. É a lição do `dayRange` do `CLAUDE.md` — uma instrução que aponta para
  um estado que não existe mais faz o próximo agente procurar, não achar e inventar. Riscada e
  explicada. O cabeçalho do teste do componente tinha o mesmo defeito em dobro (*"a Tarefa 42
  troca aquele desenho"*, e quem trocou foi a 45) e também foi corrigido.
- **B2 — `home.tsx` passava `gap-[18px]` ao `MarginRail`, e o docblock o apresentava como o
  ritmo efetivo da margem.** Medido: o `MarginRail` é `flex flex-col` e aquela margem tem **UM**
  filho (o `ActivityFeed`), então o `gap` não espaçava coisa nenhuma; quem espaça o rótulo, a
  corrente e as linhas é o `<section>` de `activity-feed.tsx:575`. **Corrigi o CÓDIGO**, não a
  prosa: a classe morta saiu. Código que não faz nada mais um docblock dizendo que faz é a
  combinação que o próximo agente copia — e a prosa dos dois arquivos agora diz onde o ritmo
  mora de verdade, com o acusador nomeado (MD).

---

### 22. A medição que derrubou a terceira justificativa da nota nº 5

Está escrita na própria nota nº 5, corrigida. Em uma linha: `"…de 2026"` colado a um irmão que
comece por dígito **não** casa o `COUNTER_SHAPE` (o `de` do ano é sempre precedido por
letras), mas `Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })` devolve `"17/09/2026"`,
que casa **sozinho** pelo ramo `\/`. A omissão da data continua certa; a justificativa não
estava.

---

### 23. Os gates da rodada de correção

| | entrega (951) | **auditoria** | |
| --- | --- | --- | --- |
| `@clube/shared` | 607 | **607** | |
| `@clube/ui` | 303 | **304** | **+1** (o `it()` do `tone`) |
| `@clube/backend` | 1994 | **1994** | |
| `@clube/app` | 951 | **954** | **+3** (os três `it()` novos da home) |
| chunk de entrada | 436.919 B | **436.990 B** | **+71 B** — folga **13.010 B** contra o teto de 450.000 |
| CSS | 35.445 B | **35.445 B** | inalterado |
| `book-form-*.js` | 10.059 B | **10.059 B** | inalterado |
| `editor-*.js` | 449.522 B | **449.522 B** | inalterado |
| `index.html` | 1.638 B | **1.638 B** | inalterado |
| precache | 27 | **27** | inalterado |

`pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` · `pnpm --filter @clube/app
build`: **todos verdes**. `schema.prisma`: `968c9986f7a2dfb4ccbd738b13d44715`, inalterado —
nenhuma migration, nenhum endpoint, nenhum schema, nenhuma dependência instalada, nenhuma
chave de catálogo nova.

⚠️ **O orçamento das Tarefas 46, 47 e 48.** A rodada custou **71 B**, contra o teto de ~800
que o dono fixou. Sobram **13.010 B** para três fatias.

---

### 24. ⚠️ O QUE FOI TENTADO E NÃO DEU CERTO, nesta rodada

- **Fechar a guarda de `hidden` do `book.test.tsx` com `toEqual([])`, como na home.** Ficou
  vermelho na hora, e com razão: aquele link **tem** de sumir acima de 1120px. Virou lista
  exata (`['min-[1120px]:hidden']`), que é a forma certa para um par de larguras — a da home
  é `[]` porque lá **nada** pode sumir.
- **Resolver o zero (B3) só em `packages/app`.** Não dá: o `count` é prop obrigatória e quem
  desenha o número é o componente. O conserto tinha de ser em `packages/ui`, e está declarado
  como parte da autorização de A1.
- **Consertar a frase colada com um `aria-label` no `<li>`.** Recusado, e não por gosto: era
  exatamente o desenho que a Tarefa 45 removeu (informação duas vezes no DOM, uma delas
  invisível para a varredura anti-culpa, que lê texto). O que faltava era **um caractere de
  espaço**.
- **Deixar a prop `tone` obrigatória.** Seria a API mais honesta, e quebraria os chamadores
  existentes e o `@clube/ui` inteiro na hora — o oposto de "acréscimo, não quebra". Ficou
  opcional, com o padrão preservando o desenho e um docblock em negrito dizendo que o padrão
  **não** é a regra do produto.
