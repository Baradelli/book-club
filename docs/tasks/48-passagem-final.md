# Tarefa 48 — As quatro telas que faltam, e a passagem final do bloco

> **A última fatia do MVP 3.5.** Ela tem duas naturezas: termina as **quatro telas** que
> nenhuma outra tocou, e é onde as **dívidas medidas** de doze fatias vêm cobrar — o
> contraste de base, o teto de bytes, os tokens órfãos.
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** e a entrada
> **48** · ⚠️⚠️ **`docs/tasks/47a-*.md`, a nota 19** — é ela que mede o contraste de base e a
> razão desta fatia ter uma decisão do dono · `docs/tasks/47b-*.md`, as notas 17–31 ·
> `docs/CONVENCOES-CODIGO.md` §7.1, §7.3, §7.4, §7.9, §7.10.

---

## ⚠️ O que esta fatia NÃO é

Ela **não** é "passar o pente e declarar pronto". As varreduras aqui **medem e consertam o
que o dono decidiu**, e **param e perguntam** no resto. ⚠️ **Uma varredura que só produz uma
tabela verde é a forma mais cara de não fazer nada** — este bloco já viu guardas que
pareciam cobrir e não cobriam **seis** vezes.

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | ⚠️⚠️ **DECISÃO DO DONO (2026-09-24): a borda de campo de texto ganha tom PRÓPRIO, escurecido até passar 3:1 nos dois temas** | A 47a mediu: o filete padrão dá **1,35:1** (claro) e **1,38** (escuro) contra a página, e **nenhum** token do projeto passa (o forte dá 2,37 / 1,88). ⚠️ **O conserto é cirúrgico:** os campos de texto compartilham **uma** constante (`form-styles.ts:26`, `TEXT_INPUT_CLASS`), usada por **nove** telas — medido. **Cards e filetes decorativos NÃO mudam:** o piso de 3:1 é para **componente de interface**, não para moldura, e o desenho "caderno encadernado" depende de filete discreto |
| **B** | **As quatro telas: entrar, convite, preferências, 404** | `Main.dc.html` (71) · `Convite.dc.html` (74) · `Preferencias.dc.html` (103) · `NaoEncontrada.dc.html` (67). ⚠️ `not-found.tsx` e `accept-invite.tsx` são as **duas exceções de `h1`** que `chrome.test.tsx` pina — **a lista de exceções não cresce nem encolhe** |
| **C** | ⚠️ **A varredura de contraste é uma TABELA MEDIDA, não uma afirmação** | Os pontos de risco que o bloco nomeou: os três cinzas de legenda, os cinco fundos de caneta, o par de pessoa, a borda dourada da caneta escolhida, o filete de campo (decisão A). **Escreva os números, nos dois temas.** ⚠️ **Se algum reprovar além da decisão A, PARE e pergunte** — não conserte por conta própria |
| **D** | **360 px sem rolagem horizontal**, nas quinze telas | É o §A.3 do briefing. ⚠️ **Meça, não olhe**: uma asserção que compare `scrollWidth` com `clientWidth` vale mais que uma inspeção |
| **E** | **`prefers-reduced-motion` respeitado** | Idem. ⚠️ **Meça o que existe antes de escrever**: se o app não anima nada, a guarda certa é a que **prova a ausência**, e dizer isso é mais honesto que inventar uma media query sem consumidor |
| **F** | ⚠️ **O veredito do teto de bytes, com o número na mão** | Entrada em **444.436 B** contra **450.000** — folga **5.564 B (1,2%)**. **Meça o custo desta fatia primeiro**, e só então diga se o teto sobe, fica, ou se algo sai do primeiro carregamento (a 44c já mostrou o caminho). ⚠️ **Se o teto tiver de subir, é decisão do dono — pare e pergunte com o número** |
| **G** | ⚠️ **Os tokens órfãos: medir antes de apagar** | ~~`--text-faint` e `--person-border` foram apontados como sem consumidor em fatias antigas.~~ ⚠️⚠️ **CORRIGIDO PELO DONO (2026-09-24), e a correção é a própria lição da decisão:** só o **`--text-faint`** foi apontado como sem consumidor. O `--person-border` **nunca** foi — o que a 41a (nota 9) registrou dele é coisa **diferente**: que ele fica **abaixo de 3:1** e que o dono decidiu não mexer. Esta linha confundia "abaixo do piso" com "sem consumidor", e as duas pedem ações OPOSTAS — uma manda apagar, a outra manda medir e deixar quieto. Medido na entrega: o `--person-border` tem consumidor vivo no `PersonAvatar`, com guarda de classe e medição de contraste próprias, e **apagá-lo quebraria o componente** — que é exatamente o desfecho que esta decisão existe para impedir. ⚠️⚠️ **A 47a mostrou que essa classe de afirmação envelhece e mente:** *"`rounded-mark` continua sem consumidor"* era **falsa**, e a frase entregava à 48 uma licença medida para **apagar um token vivo e quebrar um componente**. **Meça cada um você mesmo, hoje, com `grep` fora de teste — e NÃO apague nada sem me dizer o que mediu** |
| **H** | **A dívida do `acervo-filters.tsx` FICA registrada, não é cortada aqui** | 465 linhas, com o próximo corte nomeado (`activeChips` + `RefineBand` ≈ 125 linhas → `acervo-band.tsx`). Cortar numa fatia de passagem final é churn sobre trabalho auditado. ⚠️ **Confirme que o endereço continua escrito e correto** |
| **I** | **Nenhuma migration, endpoint ou schema** | É fatia de tela |

---

## As medidas, e de onde tirá-las

⚠️ **Escreva o script que imprime a linha citada ANTES da primeira citação — e PERGUNTE SE A LISTA DE ARTBOARDS ESTÁ COMPLETA.** Na 47a a minha lista estava incompleta e o artboard que faltava **discordava** da decisão central; na 47b faltavam dois, e um deles **decidiu** uma decisão. Os desta fatia, medidos por mim: `Main` (71) · `Convite` (74) · `Preferencias` (103) · `NaoEncontrada` (67). **Se existir um quinto, diga.**

| peça | onde |
| --- | --- |
| entrar: erro, campos, botão | `Main.dc.html:43`, `:48`, `:52`, `:57` |
| convite: nome, dicas, botão | `Convite.dc.html:45`, `:47`, `:56`, `:60` |
| preferências: hora, "salva sozinho", os dois avisos, o aparelho | `Preferencias.dc.html:52`, `:54`, `:60`, `:64`, `:70`, `:75`, `:79` |
| 404: título, frase, volta | `NaoEncontrada.dc.html:45`, `:46`, `:51` |
| a constante dos campos | `packages/app/src/pages/form-styles.ts:26` |
| os números de base | `docs/tasks/47a-*.md`, nota 19 |

⚠️ **Case TODOS os tamanhos** contra os sete `--size-*` (`9.5 · 10 · 11 · 14 · 15 · 17.5 · 25`, `theme.css:446-458`) e **declare todos os que não baterem** — a 47a declarou dois e calou quatro, e a assimetria foi o achado. ⚠️ **E prosa custa CSS:** o scanner do Tailwind lê o texto bruto, comentário incluído.

---

## As regras

1. **TDD estrito**. **Vermelho colado.** ⚠️ **Se a guarda nascer verde contra a implementação, DIGA** — o vermelho dela é o do mutante. A 47a e a 47b registraram essa distinção; mantenha.

2. ⚠️⚠️ **A decisão A com acusador e mutante.** **Mutante:** o campo volta ao filete padrão → **tem de acusar**, e o acusador **nomeia os números** (1,35 × o novo). ⚠️ **E prove o alcance:** uma guarda que valha para **uma** tela deixaria as outras oito sem dono — é a forma exata do bloqueador da 47b. **Meça quantas telas o mutante derruba.**

3. ⚠️ **A decisão C: a tabela é o entregável, e ela pode PARAR a fatia.** Escreva os números; se algum reprovar além da decisão A, **pare e pergunte**. ⚠️ **O script de contraste é seu — não confie no meu nem no de fatia nenhuma.** (Eu mesmo errei o canal azul num script destes e obtive 3,32 onde o certo era 2,28; só descobri porque **suspeitei de mim** ao discordar de duas medições independentes.)

4. ⚠️ **A decisão D medida, não olhada.** **Mutante:** plante um elemento largo numa tela → a guarda de 360 px tem de acusar. Sem o mutante, a guarda pode estar comparando duas grandezas que encolhem juntas (§7.8).

5. ⚠️ **A decisão E honesta.** Meça o que anima hoje. **Se nada anima, escreva a guarda que prova a ausência** e diga isso — inventar uma media query sem consumidor é a classe de defeito que a 41b e a 44c pagaram.

6. ⚠️⚠️ **A decisão G: NÃO apague token nenhum sem me dizer o que mediu.** Para cada um, `grep` fora de teste **hoje**, e o resultado por escrito. ⚠️ **Se encontrar uma afirmação antiga de "sem consumidor" que esteja errada, corrija-a onde ela mora** — foi assim que a 47a evitou que esta fatia quebrasse um componente.

7. ⚠️ **As duas exceções de `h1` não mudam.** `chrome.test.tsx` as pina; **mutante:** acrescente uma terceira → acusa.

8. ⚠️ **A varredura anti-culpa nas quatro telas, em TODOS os estados** — inclusive o erro do login, o convite expirado e o 404. **Leia `anti-guilt-dom.ts` antes de escolher a variante**; as duas são mutuamente exclusivas desde a 44 e **não se copia de teste antigo**.

9. ⚠️ **Guarda de visibilidade por TOKEN** (`c.split(':').at(-1) === 'hidden'`), que hoje mora no `harness.tsx` — **importe de lá, não copie**. A 47b a mudou de casa exatamente para isso.

10. ⚠️ **Par guardado dos DOIS lados.** Este bloco pagou **seis** vezes por metade de par.

11. **Tamanho pelo contador canônico** (`acervo.tsx:115-126`), nunca `wc -l`. Hoje: `preferencias.tsx` **161** · `push-section.tsx` **180** · `accept-invite.tsx` **147** · `login.tsx` **113** · `not-found.tsx` **19**. **Nenhuma passa de 400** — mantenha assim.

12. **Varredura de caracteres invisíveis** nos arquivos do diff, **provando antes que morde**, com os code points montados **por número**.

---

## Definição de pronto

- [x] As quatro telas no desenho do canvas, com as divergências **todas** declaradas.
      ⚠️ A 404 foi redesenhada (nota 12); as outras três já estavam no desenho, e as
      divergências que sobram são de **escala** — nove tamanhos fora dos sete degraus,
      listados um a um na nota 13.
- [x] ⚠️ **A borda de campo com tom próprio**, passando 3:1 nos dois temas, com o mutante da
      regra 2 vermelho **e o alcance medido** (quantas telas ele derruba). — `--border-field`,
      doze números na nota 3; **nove telas**, e o mutante M1 muda as nove com um acusador,
      mais o M2 que pega a tela que fugiria da constante.
- [x] **A tabela de contraste completa**, nos dois temas, com os pontos de risco que o bloco
      nomeou — e a declaração explícita de que nada além da decisão A reprova (ou a parada).
      ⚠️ **FOI A PARADA, e ela funcionou:** quatro coisas reprovavam além da decisão A
      (nota 4, itens C1 a C4), nenhuma foi consertada por conta própria, e as quatro
      voltaram ao dono com o número. ⚠️ **Ele decidiu o C1 na mesma rodada** — o papel do
      grifo ganhou a mesma borda dos outros campos, com os dez números medidos (3,63 / 4,01)
      e a premissa da 47a corrigida onde mora (nota 19). C2, C3 e C4 ficam como estavam.
- [x] 360 px sem rolagem horizontal, **provado por mutante**. — nota 5; a forma óbvia era a
      asserção vazia do §7.8 e está medida.
- [x] `prefers-reduced-motion` tratado — ou a **ausência de animação** provada e dita. —
      ⚠️ **não era ausência**: um `animate-*`, doze `transition-*` e **zero** media query.
      A regra entrou, com o par guardado dos dois lados (nota 6).
- [x] ⚠️ **O veredito do teto de bytes, com o custo desta fatia medido** — e, se o teto tiver
      de subir, a **parada** para o dono decidir. — **+183 B, o teto FICA**, folga 5.381
      (nota 7). Nenhuma pergunta a fazer.
- [x] ⚠️ **Os tokens órfãos medidos HOJE, um a um, e nada apagado sem eu saber.** —
      `--text-faint` é órfão de verdade e **fica** (decisão do dono de 2026-09-20, com guarda
      de primeiro uso); ⚠️ **`--person-border` NÃO é órfão** — tem consumidor vivo no
      `PersonAvatar`, e a premissa da decisão G estava errada (nota 9). **Nada apagado.**
- [x] As duas exceções de `h1` intactas, provadas por mutante. — M9, 2 acusadores.
- [x] Varredura anti-culpa verde em **todos** os estados das quatro telas. — ⚠️ ela **não
      existia em nenhuma das quatro**; dezesseis estados varridos, nota 11.
- [x] A dívida do `acervo-filters.tsx` **registrada e com endereço correto**, não cortada. —
      os três números reconferidos (465 · 65 · 48); ⚠️ o **ponteiro** estava velho
      ("endereçada à 47/48") e foi corrigido no arquivo (nota 10).
- [x] Nenhuma migration, endpoint ou schema. — `schema.prisma` segue
      `968c9986f7a2dfb4ccbd738b13d44715`.
- [x] Gates colados antes e depois, com bytes, folga, CSS e contadores. — nota 16.
- [x] Varredura de invisíveis, com a prova de que morde. — 3 de 3 plantados acusados; zero
      nos quinze arquivos do diff (nota 16).

---

## Notas de reconciliação

_O executor anexa aqui o que mediu e divergiu da spec. Numere de 1 em diante. Se um número ou
uma citação desta spec estiver errado, **corrija-o aqui e no `BACKLOG.md`**, dizendo como
mediu — e **declare TODOS**. ⚠️ **E pergunte se a lista de artboards está completa:** nas
duas fatias anteriores ela não estava._

---

### 1 · As treze citações da spec, conferidas uma a uma — **treze exatas**

O script que imprime a linha citada foi escrito **antes** da primeira citação
(`scratchpad/t48/cite.mjs`: lê o arquivo, imprime `nnnn | <linha>` e escreve
`<<FORA DO ARQUIVO>>` quando o número passa do fim).

| peça | spec | o que está lá | veredito |
| --- | --- | --- | --- |
| entrar: erro | `Main.dc.html:43` | `<span 13,5px --danger>` "E-mail ou senha não conferem." | ✅ |
| entrar: campos | `:48`, `:52` | os dois `<label>` mono 9,5px `--text-muted` | ✅ |
| entrar: botão | `:57` | `<button height:50px>` "Entrar" | ✅ |
| convite: nome | `Convite.dc.html:45` | `<label for="nome">` mono 9,5px | ✅ |
| convite: dicas | `:47`, `:56` | as duas `<span 11,5px --text-muted>` | ✅ |
| convite: botão | `:60` | `<button height:50px>` "Entrar no clube" | ✅ |
| preferências: hora | `Preferencias.dc.html:52` | `<label for="hora">` "Me lembre às" | ✅ |
| "salva sozinho" | `:54` | `<span 11,5px>` "Salva sozinho." | ✅ |
| os dois avisos | `:60`, `:64` | as duas `<span 14,5px>` dos interruptores | ✅ |
| o aparelho | `:70`, `:75`, `:79` | o rótulo "Neste aparelho", a frase de ativo, o botão de 46px | ✅ |
| 404: título | `NaoEncontrada.dc.html:45` | `<h1>` Fraunces 27px/500, centrado | ✅ |
| 404: frase | `:46` | `<p 14,5px --text-muted>` centrada | ✅ |
| 404: volta | `:51` | `<a height:48px border --border radius:4px>` | ✅ |

Os quatro números entre parênteses do cabeçalho (`Main` 71 · `Convite` 74 · `Preferencias`
103 · `NaoEncontrada` 67) também batem: são a linha do `</html>` de cada arquivo.

⚠️ **E uma citação DESTA spec envelheceu DENTRO desta fatia**, o que vale registrar porque é
o §7.4 em ação: `theme.css:446-458` (a escala de sete degraus) era **exata** em `ce63fd9` —
conferida com `git show ce63fd9:packages/ui/src/theme.css` —, e hoje a escala está em
**484-495**, porque o token novo desta fatia entrou acima dela. Nas notas abaixo a escala é
citada **pelo nome** (`--size-micro` … `--size-title`), nunca pela linha.

### 2 · ⚠️ A lista de artboards: **os quatro estão completos como ARQUIVO — e o canvas declara quatro irmãos que NÃO existem**

Não há um quinto artboard desta fatia. Mas a pergunta rendeu um achado, e ele é do tipo que
a 47a e a 47b pagaram: **`canvas.json` declara 35 boards e a pasta tem 21 arquivos.** Os 14
que faltam são a fileira escura inteira, menos o `DiaEscuro` — e quatro deles são
exatamente os desta fatia:

```
declarados em canvas.json e AUSENTES no disco:
  MainEscuro · ConviteEscuro · PreferenciasEscuro · NaoEncontradaEscuro
  (+ InicioEscuro, LivroEscuro, NovaAnotacaoEscuro, AvulsaEscuro, AcervoEscuro,
     NovoGrifoEscuro, CorrigirGrifoEscuro, NovoLivroEscuro, EditarLivroEscuro, BuscaEscuro)
```

⚠️ **Consequência prática, e ela é a razão de estar escrito aqui:** o `BACKLOG.md` abre o
MVP 3.5 dizendo *"35 artboards: as 15 telas no tema claro, as mesmas 15 no escuro, e 5 em
1280px"*. **O tema escuro do canvas nunca chegou como arquivo** — só o `DiaEscuro`. Toda
afirmação de fidelidade ao escuro feita por qualquer fatia deste bloco foi feita contra
**um** artboard, e o resto foi derivado dos tokens. Isso não muda nada do que já se
entregou (os tokens é que decidem o escuro, e eles são medidos), mas é um número errado num
documento permanente. Corrigido no `BACKLOG.md`.

### 3 · ⚠️⚠️ A DECISÃO A, entregue: `--border-field`, com o valor e os doze números

**O valor:** `--border-field: light-dark(#827d73, #737882)`, em `packages/ui/src/theme.css`,
com o utilitário `border-line-field` (`--color-line-field` no `@theme inline` do app).

**Como o valor foi escolhido, e não é gosto:** os dois lados saem do filete neutro
(`#d8d1bf` / `#303236`) por **escala multiplicativa nos três canais** — o matiz é o mesmo, só
a luminosidade muda. Varri a escala em passos de 0,02 e parei no **primeiro** valor que fecha
3:1 contra as seis superfícies em que um campo pode cair. Mais escuro seria trocar o caderno
por um formulário; mais claro não passa.

| superfície | claro (`#827d73`) | escuro (`#737882`) |
| --- | --- | --- |
| `--bg` | **3,63** ✅ | **4,01** ✅ |
| `--surface` (o fundo do campo) | **3,76** ✅ | **3,72** ✅ |
| `--surface-2` | **3,47** ✅ | **3,33** ✅ |
| `--surface-today` | **3,70** ✅ | **3,47** ✅ |
| `--gold-soft` | **3,70** ✅ | **3,47** ✅ |
| `--danger-bg` | **3,12** ✅ | **3,44** ✅ |

⚠️ **O ALCANCE, MEDIDO — e é a metade que a regra 2 cobra.** Os campos de texto compartilham
**uma** constante (`pages/form-styles.ts`, `TEXT_INPUT_CLASS`), e ela é lida por **nove**
telas — conferidas por `grep -l` e pinadas por igualdade exata em
`pages/__tests__/form-styles.test.ts`: `accept-invite`, `acervo-filters`, `book-form`,
`busca`, `free-note-fields`, `highlight-fields`, `login`, `plan-editor`, `preferencias`.
**O mutante M1 (o campo volta ao filete decorativo) muda a borda nas NOVE ao mesmo tempo, com
UM acusador** — e é assim que tem de ser: o alcance é a constante, não o número de `it()`.

⚠️ **A metade que faltaria, e ela é a forma exata do bloqueador da 47b:** contar quem
*importa* a constante não prova que quem a importa a *usa em todos os campos*. Então há um
terceiro `it()` que varre **cada tag `<input>` de `pages/`** e exige `TEXT_INPUT_CLASS`
dentro dela. Medido: **18 tags reais** (as três "sem" que um `grep` cru acha estão dentro de
comentário), **17 com a constante** e **uma isenção**, o `<input type="checkbox">` do
interruptor das preferências — que desenha a própria caixa. A isenção é por TIPO e está
pinada em **1**. O mutante M2 (uma tela desenha o campo à mão) o acusa.

⚠️ **E o canvas também não passava, o que vale dizer porque desfaz a leitura de "o app
divergiu do desenho":** `Main.dc.html:48` desenha o campo com
`border-bottom: 1px solid var(--border-strong)` — **2,37:1** no claro, **1,88:1** no escuro.
O tom próprio fecha o que o canvas deixou aberto.

### 4 · ⚠️⚠️ A DECISÃO C: a tabela completa — e **quatro coisas reprovam ALÉM da decisão A**

**O script de contraste é meu**, escrito do zero (`scratchpad/t48/contrast.mjs`), e ele
**se valida contra 19 pares conhecidos antes de medir qualquer coisa** e estoura se algum
errar: os canônicos (21,00 · 1,00 · 4,48), oito números publicados pelo `theme.css` e dez
publicados por fatias anteriores (47a notas 3, 5 e 19). ⚠️ **A auto-validação PEGOU um erro
meu na primeira rodada** — eu esperava 3,62 para `--gold` sobre a caneta amarela e obtive
1,99, porque tinha posto o dourado do tema ESCURO contra o papel do CLARO. O script estava
certo e a minha expectativa errada; sem o par conhecido eu teria publicado a mistura.

**1 · Os três cinzas de legenda** (piso de TEXTO, 4,5:1):

| tinta | vs `--bg` | vs `--surface` | vs `--surface-2` |
| --- | --- | --- | --- |
| `--text-muted` claro / escuro | 6,18 / 6,88 ✅ | 6,40 / 6,38 ✅ | 5,90 / 5,73 ✅ |
| `--text-subtle` claro / escuro | 4,76 / 5,79 ✅ | 4,93 / 5,37 ✅ | 4,54 / 4,82 ✅ |
| `--text-faint` claro / escuro | **2,45 / 2,58** ❌ | **2,54 / 2,39** ❌ | **2,34 / 2,15** ❌ |

**2 · Os cinco fundos de caneta.** O fundo contra a página (1,15 a 1,18 no claro; 1,29 a
1,65 no escuro) **não alcança 3:1 em nenhum dos dez** — e isso **não é reprovação**: o fundo
de grifo é preenchimento decorativo atrás de texto, e quem carrega a informação é o texto,
que passa com folga enorme (**12,84 a 12,44** no claro, **8,44 a 10,81** no escuro). O que
**é** fronteira é o filete de caneta (`--pen-x-dot`) contra a página:

| caneta | claro | escuro |
| --- | --- | --- |
| a · amarelo | **2,28** ❌ | 6,90 ✅ |
| v · verde | 3,46 ✅ | 4,56 ✅ |
| l · laranja | 4,18 ✅ | 5,02 ✅ |
| z · azul | 4,59 ✅ | 4,93 ✅ |
| r · rosa | 4,56 ✅ | 4,91 ✅ |

**3 · O par de pessoa:**

| par | piso | claro | escuro |
| --- | --- | --- | --- |
| `--person-fg` sobre `--person-bg` (a INICIAL) | 4,5 | **8,55** ✅ | **8,44** ✅ |
| `--person-border` contra a página | 3 | **1,43** ❌ | **2,12** ❌ |
| `--person-bg` contra a página | 3 | 1,11 ❌ | 1,31 ❌ |

**4 · A borda dourada da caneta escolhida** (piso 3:1) — **nenhuma reprova**, e os dez
batem com a nota 5 da 47a: 3,62 · 3,58 · 3,56 · 3,51 · 3,52 no claro; 4,18 · 4,93 · 5,27 ·
5,25 · 5,35 no escuro. O lado de fora (`--gold` contra a página) dá 4,16 / 6,90.

**5 · O filete de campo** — o que a decisão A consertou. Estado anterior: `--border`
**1,35 / 1,38** contra a página e **1,40 / 1,28** contra a superfície; `--border-strong`
**2,37 / 1,88**; `--border-soft` **1,21 / 1,20**. Nenhum passava. Hoje: a tabela da nota 3.

⚠️⚠️ **O QUE REPROVA ALÉM DA DECISÃO A — E EU NÃO CONSERTEI NADA DISSO. São quatro, e as
quatro voltam para o dono:**

| # | o que | números | por que eu parei |
| --- | --- | --- | --- |
| ~~**C1**~~ ✅ **RESOLVIDO** | `--pen-a-dot` contra a página, no claro | era **2,28**; a fronteira agora é a **moldura**, que dá **3,63 / 4,01** | ⚠️ **DECISÃO DO DONO (2026-09-24), tomada depois desta tabela: o papel do grifo ganhou a MESMA borda dos outros campos.** A saída não foi mexer no `--pen-a-dot` (valor de canvas, intocado) — foi **somar** a moldura de campo por fora, que a decisão A desta fatia acabara de tornar possível. Ver a **nota 19** |
| **C2** | `--person-border` contra a página e contra a própria superfície | **1,43 / 2,12** e 1,29 / 1,62 | A 41a (nota 9) mediu os mesmos seis números e **decidiu não mexer**, com argumento: o avatar não é controle e quem identifica é a inicial (8,55:1). Continuo achando o argumento bom — mas ele é do dono, não meu |
| **C3** | `--text-faint`, nos seis pares | **2,45 a 2,15** | Já é **decisão consciente do dono de 2026-09-20**, escrita no `theme.css`, com guarda de primeiro uso. Não é achado novo; entra na tabela porque a decisão C pede os números |
| **C4** | os cinco fundos de caneta contra a página | 1,15 a 1,65 | Na minha leitura **não** reprova (decoração atrás de texto, e o texto passa a 12:1). Fica na tabela porque o bloco nomeou "os cinco fundos de caneta" como ponto de risco, e calar o número seria a tabela verde que a spec proíbe |

⚠️ **Como eu li o "PARE e pergunte".** Li como *"não conserte por conta própria"*, e não como
*"abandone a fatia"*: os quatro itens acima ficaram **exatamente como estavam**, nenhum token
deles foi tocado, e a pergunta foi ao dono com o número na mão. As outras decisões
(B, D, E, F, G, H, I) foram executadas.

⚠️ **O dono confirmou a leitura (2026-09-24): *"você leu certo — 'PARE e pergunte' era não
conserte por conta própria, não abandone a fatia"*.** E **decidiu o C1 na mesma resposta**:
ver a **nota 19**. O **C2** fica como está, com o argumento da 41a; o **C3** segue sendo
decisão dele de 2026-09-20; o **C4** segue como não-reprovação medida.

### 5 · ⚠️⚠️ A DECISÃO D: a forma óbvia é a asserção VAZIA do §7.8, e eu medi isso antes de escrever

`expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth)` é o que qualquer um
escreveria, e ela **não asserta nada**. Sonda rodada nesta fatia, num `<div style="width:800px">`
dentro do jsdom do projeto:

```
scrollWidth 0   clientWidth 0   offsetWidth 0
getBoundingClientRect {"x":0,"y":0,"width":0,"height":0,…}
getComputedStyle(el).width  →  "800px"
```

Ou seja `0 <= 0`, **verde para toda tela, em todo estado, com 800px dentro**. Os dois lados
vêm do mesmo motor ausente — é o §7.8 na forma mais limpa que este bloco já viu.

**Onde a propriedade É decidível:** o que faz uma tela rolar de lado em 360px é largura
FIXA, e largura fixa está escrita no fonte. `src/__tests__/no-h-scroll.test.ts` varre
`packages/{app,ui}/src` (sem `__tests__`, sem comentário) atrás de três formas —
`w-[Npx]`/`min-w-[Npx]`, a escala (`w-96` = 384px) e `width`/`min-width` de CSS — e é
**total**: cobre as quinze telas e os componentes que elas montam por construção, sem
depender de alguém lembrar de renderizar um estado.

**Medido hoje: zero.** As duas larguras grandes do projeto estão atrás de variante
(`min-[1120px]:w-[680px]` é a coluna de leitura; `min-[1120px]:w-80` é a margem), e a
varredura as isenta **pela VARIANTE, nunca pelo valor**.

⚠️ **Duas armadilhas de regex, as duas medidas e as duas com par negativo no teste:**
`(?:min-)?width:` casa o `width:` de dentro de **`max-width:`** — e o `editor.css` tem três
`max-width: 620px`, que são o **oposto** de um estouro; e `@media (min-width: 1120px)` é
CONDIÇÃO, não propriedade. As duas viravam falso positivo, e a varredura acusaria a coluna
de leitura de quebrar o celular.

**O que ela NÃO decide, dito em vez de calado:** uma palavra longa sem espaço vinda do
conteúdo do clube. A defesa disso é o `overflow-wrap: break-word` que o `editor.css` já
declara; provar o estouro exige navegador de verdade.

**Mutante M5** (um `w-[800px]` plantado na tela 404): **1 acusador**.

### 6 · ⚠️ A DECISÃO E: **não** era "nada anima" — e a media query não existia em lugar nenhum

Medi antes de escrever, que é o que a decisão E manda:

| o que | quantos | onde |
| --- | --- | --- |
| `animate-*` | **1** | `button.tsx` — o giro do `Loader2` enquanto o envio está em voo |
| `transition-*` | **12**, em 10 arquivos | **sempre** `transition-colors`: `App.tsx`, `chrome.tsx`, `home.tsx`, `highlight-fields.tsx`, `button.tsx`, `context-bar.tsx`, `filter-bar.tsx`, `filter-chip.tsx`, `list.tsx`, `RichEditor.tsx` |
| `transform:` cru | **1** | `editor.css` — `rotate(45deg)` **estático**, a ponta da setinha do menu de bolha |
| `prefers-reduced-motion` | **0** | não existia em nenhum arquivo do repositório |

Ou seja: **havia movimento e nenhuma media query o desligando**, contra uma decisão fechada
do MVP 3.5 em letra literal. A guarda certa aqui não é a da ausência — é a regra, e ela
entrou em `packages/app/src/styles.css`.

⚠️ **O par está guardado dos DOIS lados**, e é o que impede isto de virar a media query sem
consumidor que a 41b e a 44c pagaram: um `it()` exige a regra, o outro exige que **exista
movimento para ela desligar** (≥ 1 `animate-*` e ≥ 1 `transition-*` no fonte). No dia em que
o último `animate-*` sair, o segundo fica vermelho e a pergunta volta ao dono.

⚠️ **`animation-iteration-count: 1` não é redundância com a duração** — o `animate-spin` é
`infinite`, e com duração quase zero e repetição infinita ele continua girando, rápido
demais para se ver e caro igual. O mutante **M6** troca exatamente essa linha e acusa.

⚠️ **E uma asserção minha nasceu LARGA DEMAIS, medido e corrigido.** Escrevi "nenhuma
geometria em lugar nenhum" e ela ficou **vermelha contra a implementação**, por causa do
`rotate-180` do `BookSpine` — que é a lombada vertical do `Inicio.dc.html:72`, rotação
estática de tipografia, sem `hover:`, sem transição e sem movimento. A decisão fechada fala
da RESPOSTA ao gesto (*"hover/pressionado mudando cor — sem transform, sem escala"*), então
a guarda passou a ler a **variante**: `hover:`/`active:`/`focus:`/`group-hover:`/
`aria-pressed:` respondendo com geometria. Medido hoje: zero. Mutante **M8**: 2 acusadores.

### 7 · ⚠️⚠️ A DECISÃO F: o veredito do teto — **ele NÃO precisa subir**

Medido primeiro, como a decisão manda:

| | entrada (`ce63fd9`) | saída | Δ |
| --- | --- | --- | --- |
| chunk de entrada | 444.436 B | **444.619 B** | **+183** |
| folga até 450.000 | 5.564 | **5.381** | −183 |
| CSS | 36.804 B | **37.131 B** | **+327** |
| `book-form` | 10.244 | **10.244** | = |
| editor | 449.522 | **449.522** | = |
| `index.html` | 1.638 | **1.638** | = |
| precache | 27 | **27** | = |

**+183 B é 3,3% da folga.** O teto de 450.000 fica, nada sai do primeiro carregamento, e não
há pergunta a fazer ao dono. A fatia é barata porque o peso dela está onde não pesa: a
decisão A custa **um** nome de classe mais longo no JS e um seletor no CSS, a decisão E é CSS
puro, e as decisões C, D, G e H são **medição** — teste não entra em bundle.

⚠️ **Por que o CSS subiu 327 B e o JS só 183:** o CSS ganhou a regra de
`prefers-reduced-motion`, o `border-line-field` e os oito utilitários novos da tela 404
(`size-14`, `w-18`, `pt-30`, `px-8`, `min-h-12`, `text-pretty`, `text-line-strong`,
`text-center`). Auditado um a um: **cada um tem exatamente um escritor em CÓDIGO**, nenhum
é emitido só por prosa.

### 8 · ⚠️⚠️ PROSA CUSTA CSS — e a minha custou, com três seletores medidos e removidos

A primeira versão da tela 404 trocou as duas opacidades por token **e explicou a troca
nomeando os dois utilitários no docblock**. Medido no CSS construído: os seletores
continuavam emitidos, **sem nenhum escritor de código**. O scanner do Tailwind lê o texto
bruto, comentário incluído, e a minha explicação mantinha viva exatamente a classe que eu
acabara de tirar.

| seletor | quem o escrevia em CÓDIGO | veredito |
| --- | --- | --- |
| o utilitário de opacidade de 70% | **ninguém** | emitido **só pela minha prosa** — removido |
| o degrau de 24px em negrito | **ninguém, desde a Tarefa 42** | ⚠️ **dívida pré-existente**: ele estava no CSS há seis fatias porque o docblock da 404 o citava. Quitado aqui |
| o utilitário de opacidade de 60% | `button.tsx` (`disabled:`) | tem dono de verdade; só a forma nua sumiu |

Reescritos em palavras ("uma opacidade de 70%", "o degrau de 24px em negrito"), como a nota
12 da 47a fez com o anel do `GrifoText`. **CSS: 37.328 → 37.131 B (−197).** E a guarda que
substituiu a explicação varre por **PREFIXO** (`opacity-`), então ela não escreve nenhum dos
dois nomes — e ainda pega a opacidade que ninguém previu.

### 9 · ⚠️⚠️ A DECISÃO G, medida hoje: **a premissa da spec está errada para `--person-border`**

Os dois tokens, com `grep` fora de teste, hoje:

| token | utilitário | consumidor de PRODUÇÃO | veredito |
| --- | --- | --- | --- |
| `--text-faint` | `text-faint` | **ZERO** — só a declaração no `theme.css`, o mapeamento no `@theme inline` e **duas menções em prosa** que dizem justamente que ele NÃO é usado (`list.tsx`, `save-indicator.tsx`) | órfão de verdade |
| `--person-border` | `border-person-line` | **UM, VIVO**: `packages/ui/src/components/person-avatar.tsx`, na classe do avatar — com guarda própria (`person-avatar.test.tsx`, que pina a classe) e medição própria (`avatar-contrast.test.ts`, que mede os três `--person-*` nos dois temas) | ⚠️ **NÃO é órfão** |

⚠️ **A spec diz que os dois "foram apontados como sem consumidor em fatias antigas". Para o
`--person-border` isso nunca foi dito por fatia nenhuma** — eu procurei a afirmação onde ela
moraria e ela não existe: `grep -rn person-border docs/` devolve a 41a (nota 9), que diz
uma coisa **diferente e correta**, que ele fica **abaixo de 3:1** e que o dono decidiu não
mexer. A spec confundiu "token abaixo do piso" com "token sem consumidor" — e essa é
exatamente a confusão que a nota 18 da 47a descreve como perigosa, porque as duas coisas
levam a ações opostas (uma manda apagar, a outra manda medir). **Corrigido na entrada 48 do
`BACKLOG.md`.**

**NADA FOI APAGADO.** O `--text-faint` fica: ele é **decisão consciente do dono de
2026-09-20**, escrita no `theme.css`, com uma guarda de PRIMEIRO USO ativa
(`theme-tokens.test.ts`) que fica vermelha no dia em que alguém o pintar, e cujo conserto
prescrito é **escurecer o token, não apagar a guarda**. Apagá-lo agora seria desfazer uma
decisão do dono para economizar 40 bytes de CSS.

### 10 · A DECISÃO H: o endereço da dívida do `acervo-filters.tsx` está **escrito e certo** — e o PONTEIRO estava velho

Reconferido com o contador canônico, hoje:

```
acervo-filters.tsx   465   ✅ bate com o docblock
  activeChips()       65   ✅ bate (linhas 756-833)
  RefineBand()        48   ✅ bate (linhas 889-952)
  + os dois tipos     ≈12   → ~125 canônicas, como o docblock diz
```

⚠️ **OS DOIS INTERVALOS DE LINHA ACIMA ESTAVAM ERRADOS NA PRIMEIRA ENTREGA** (746-823
e 878-941), e o motivo é o mais barato de todos: **a própria fatia os moveu**, ao acrescentar
linhas de prosa ao docblock do arquivo. A rodada de correção os moveu de novo (mais duas
linhas de prosa da decisão A5). Os três números que importam — **465 · 65 · 48** — estavam
e seguem certos, porque são contagem canônica e não posição.

⚠️ **Por isso o docblock do próprio arquivo cita as funções pelo NOME e nunca pela linha**, e
esta é a única lista de linhas do conjunto: um intervalo de linhas é a citação que envelhece
mais rápido que qualquer outra, e envelhece por escrever prosa acima dela.

**Nada foi cortado**, que é o que a decisão H manda.

⚠️ **Mas o ponteiro dizia "dívida endereçada à 47/48", e as duas passaram sem cortar.** Um
endereço que aponta para fatias encerradas é a forma que o §7.4 proíbe nominalmente — o
próximo leitor bate numa porta fechada, não acha dono, e ou refaz a conta ou corta sem
contexto. Reescrito **no próprio arquivo**: a dívida segue **aberta e sem fatia dona**, quem
reabrir o arquivo faz o corte, e os três números estão datados desta fatia.

### 11 · ⚠️⚠️ AS QUATRO TELAS NÃO TINHAM VARREDURA ANTI-CULPA NENHUMA — zero, medido

`grep -c expectNoGuilt` nos quatro arquivos de teste, antes desta fatia: **0, 0, 0 e o
arquivo não existia**. As quatro telas desta fatia eram exatamente as quatro sem varredura
de DOM do app — e a `not-found.tsx` era a única das quinze telas **sem suíte própria**.

⚠️ **A variante foi escolhida LENDO o `anti-guilt-dom.ts`**, como a regra 8 manda (as duas
são mutuamente exclusivas desde a rodada de correção da 44): **`expectNoGuilt()`**, nunca
`expectNoGuiltWithPlanPosition()` — nenhuma das quatro telas mostra a posição no plano em
estado nenhum, e a variante da posição exige ≥ 1 subtração efetiva, então ela ficaria
vermelha na hora pelo motivo errado. Nos estados com campo ou formulário inválido,
`expectNoGuiltBesidesFormError()` com a lista exata dos vermelhos legítimos.

**Os dezesseis estados varridos:**

- **entrar** (4): formulário em repouso · os dois campos inválidos · **a senha errada** (o
  401, que é o erro que a pessoa mais vai ver) · a rede caída;
- **convite** (4): o formulário cego em repouso · **o convite vencido** (410) · **o convite
  que não existe** (404) · a senha curta demais;
- **preferências** (6+3): as três preferências carregadas · a leitura que falhou · **a
  escrita que falhou** (o estado que não pode mentir nem culpar) · o servidor sem VAPID · a
  configuração que caiu · **as quatro recusas do aparelho, uma a uma**;
- **404** (1): o único estado que ela tem.

⚠️ **E uma afirmação de arquivo permanente estava METADE certa — corrigida onde ela mora.**
O docblock do `preferencias.test.tsx` dizia *"a varredura anti-culpa desta tela é a do
VOCABULÁRIO, e ela não mora aqui"*. A metade certa é que vocabulário é do catálogo (§7.9); a
metade que faltava é a **outra metade da mesma partição** — *"o que não é catálogo é DOM"*:
a COR, o número renderizado a partir de dado, e a palavra que entrou na tela sem passar pelo
`t()`. Nenhuma das três é vista pelo teste de catálogo, e nenhuma tinha acusador nesta tela,
que tem **sete** estados que pintam recado. O mutante **M11** (um `text-danger` na seção do
aparelho) tinha **0** acusadores antes e tem **3** agora.

⚠️ **Conferido antes de escrever:** `07:30` **não** casa o `COUNTER_SHAPE` (que pede
`\d+ de \d+`, `\d+/\d+` ou `+\d+`). O dígito desta tela é legítimo e obrigatório.

### 12 · A tela 404 contra o canvas, e as divergências todas

| peça | `NaoEncontrada.dc.html` | antes | agora |
| --- | --- | --- | --- |
| alinhamento | `align-items:center`, texto centrado | `items-start`, à esquerda | centrado |
| o glifo | 56px, traço `--border-strong` | 32px, opacidade de 60% | `size-14` + `text-line-strong` |
| a frase | `--text-muted`, `text-wrap:pretty` | opacidade de 70% | `text-muted` + `text-pretty` |
| o filete | 72×1px `--border` | não existia | `h-px w-18 bg-line` |
| a volta | caixa de 48px, filete, raio 4px | link sublinhado, sem anel de foco | `min-h-12 rounded-control border` + `FOCUS_RING` |

⚠️ **As duas opacidades eram cinzas que NINGUÉM mediu** — não são token, mudam sozinhas se a
tinta ou o papel mudarem, e nenhuma guarda de contraste do projeto olha para elas (todas
leem o `theme.css`). Medidas antes de trocar: 70% sobre o creme resolve `#5c5f58` (**5,76:1**)
e 60% resolve `#72746c` (**4,21:1**). ⚠️ **Nenhuma das duas REPROVA** — o glifo é decorativo
e tem piso de 3:1 —, então a troca entrou como **decisão B (desenho)** e não como conserto de
contraste. Dizer isso importa: um leitor que ache que foi conserto vai procurar um número
que não existe.

⚠️ **O filete da caixa da volta é o DECORATIVO (1,35:1), e isso é decidido.** A decisão A deu
tom próprio ao filete do CAMPO DE TEXTO, que não tem conteúdo visível dizendo o que ele é.
Aqui quem identifica o controle é o texto dentro dele ("Voltar para o início", 11,9:1) — que
é o que a WCAG 1.4.11 pede: a informação necessária para **identificar** o componente. É o
mesmo argumento da nota 9 da 41a para a moldura do avatar. **Se o dono quiser o piso de 3:1
também em botão-fantasma, é trocar uma classe aqui e mais quatro no `Button` — digo e faço.**

⚠️ **As duas exceções de `h1` não mudaram**, e o mutante **M9** (uma terceira) acusa **2**
vezes, uma delas pela igualdade exata da lista.

### 13 · ⚠️ TODOS os tamanhos dos quatro artboards contra os sete degraus — **nove não batem**

A escala fechada tem sete degraus (`--size-micro` 9,5 · `--size-eyebrow` 10 · `--size-label`
11 · `--size-ui` 14 · `--size-body` 15 · `--size-reading` 17,5 · `--size-title` 25). Os
tamanhos distintos que os quatro artboards escrevem, contados com `grep -o font-size`:

| px | onde | degrau? |
| --- | --- | --- |
| 9,5 | os rótulos mono dos campos (as três telas de formulário) | ✅ `--size-micro` |
| 10 | os rótulos de seção e o "Sair" do cabeçalho | ✅ `--size-eyebrow` |
| **11,5** | as três dicas de campo (`Convite:47`, `:56`, `Preferencias:54`) | ❌ — o degrau vizinho é 11 |
| **13** | o aviso do iPhone (`Preferencias:85`) | ❌ |
| **13,5** | o erro do login (`Main:43`) | ❌ |
| 14 | os dois botões do aparelho e a frase de ativo | ✅ `--size-ui` |
| **14,5** | os dois interruptores, a frase e a volta do 404 | ❌ — meio pixel acima do degrau |
| 15 | os dois botões primários | ✅ `--size-body` |
| **16** | **todo `<input>` dos quatro artboards** | ❌ — e é o 16px que impede o iOS de dar zoom ao focar; `text-base` (16px) é o que o `TEXT_INPUT_CLASS` escreve, e ele **não** é degrau da escala |
| **26** | o campo de hora em mono (`Preferencias:53`) | ❌ |
| **27** | o `<h1>` do 404 | ❌ — sai 25 (`--size-title`) |
| **28** | o `<h1>` de Preferências | ❌ — sai 25 |
| **30** | os `<h1>` de Entrar e de Convite | ❌ — sai 25 |

⚠️ **Nove fora da escala, e o `16` é o mais interessante dos nove**, porque ele já estava no
código desde a Tarefa 15 (`text-base` no `TEXT_INPUT_CLASS`) e **nenhuma fatia o declarou**:
é um tamanho de fora da escala fechada, escrito em nove telas, com uma razão de acessibilidade
real (abaixo de 16px o Safari do iPhone dá zoom ao focar o campo) e sem uma linha registrando
isso. Fica registrado agora. Os quatro títulos (26/27/28/30) são a divergência do cromo, já
registrada na Tarefa 42; os outros quatro (11,5 · 13 · 13,5 · 14,5) são meio-pixel e
pixel-e-meio, e acrescentar degrau à escala fechada é decisão de desenho do dono.

### 14 · A tabela de mutação — **15 mutantes, 15 acusados, ZERO sobreviventes**

Protocolo em cada um: `md5sum` + `cp -p` → `.mjs` **ancorado, com âncora e substituto em
ARQUIVO** (estoura se a âncora não aparecer exatamente 1 vez **ou** se âncora = substituto)
→ `grep` de confirmação → `pnpm vitest run` na suíte inteira do app → contar e **nomear** →
`cp -p` de volta → `md5sum -c` **e** `cmp`. Os 15 restauraram idênticos.

| # | mutante | arquivo | acus. | quem acusou (1º) |
| --- | --- | --- | --- | --- |
| M1 | o campo volta ao filete decorativo (**nove telas de uma vez**) | `form-styles.ts` | ~~1~~ → **3** | `⚠️ draws the field edge with the FIELD tone …` |
| M2 | **uma** tela desenha o campo à mão | `login.tsx` | 2 | `⚠️ leaves no text input drawing an edge of its own` |
| M3 | o tom próprio aponta de volta para o filete neutro | `theme.css` | 2 | `⚠️ gives the text field an edge of its OWN, at 3:1 …` |
| M4 | o tom próprio vira o filete **forte** (2,37 / 1,88) | `theme.css` | 2 | idem |
| M5 | um elemento de **800px** plantado numa tela | `not-found.tsx` | 1 | `⚠️ pins nothing wider than the narrow viewport …` |
| M6 | o movimento volta pela **repetição infinita** | `styles.css` | 1 | `⚠️ turns motion OFF for whoever asked …` |
| M7 | a media query pergunta `no-preference` | `styles.css` | 1 | idem |
| M8 | o hover responde com **geometria** (`transition-all` + `hover:scale-105`) | `home.tsx` | 2 | `⚠️ keeps every transition a COLOUR one …` |
| M9 | uma **terceira** exceção de `h1` | `chrome.test.tsx` | 2 | `has read the pages where an h1 would live …` |
| M10 | cobrança plantada na tela 404 | `not-found.tsx` | 1 | `⚠️ says the address does not exist, and never that the PERSON failed` |
| M11 | **vermelho** plantado na seção do aparelho | `push-section.tsx` | **3** | `sweeps the three preferences, loaded and working` |
| M12 | a 404 volta a ficar alinhada à esquerda | `not-found.tsx` | 1 | `⚠️ centres the page, like the canvas does` |
| M13 | a volta do 404 perde o alvo de toque | `not-found.tsx` | 1 | `⚠️ gives the way back a REAL touch target …` |
| M14 | cobrança plantada no erro do **login** | `login.tsx` | **6** | `says the credentials do not match …` (4 antigos) + **2 novos** |
| M15 | **vermelho** plantado no aceite de convite | `accept-invite.tsx` | **4** | os quatro `it()` novos da varredura |

⚠️⚠️ **E ESTA TABELA ENVELHECEU DENTRO DA PRÓPRIA FATIA — o M1 tem TRÊS acusadores, não
um.** Ela foi levantada na primeira rodada, e depois dela a **nota 19** acrescentou as duas
guardas da moldura do grifo, que derivam o esperado do `TEXT_INPUT_CLASS`. Rerodado na
rodada de correção: `⚠️ draws the field edge with the FIELD tone …` mais
`⚠️ wraps the paper in the SAME field edge …` mais `⚠️ wraps it on the CORRECTION screen
too …`. É o mesmo defeito que esta fatia aponta em outros documentos, cometido aqui: uma
medição datada que não foi refeita depois de a base mudar.

⚠️ **M11 e M15 são os que mostram o buraco que existia:** os dois plantam a COR que o §1 do
plano proíbe, e antes desta fatia os dois tinham **zero** acusadores em 1.007 testes.

⚠️ **Sobre o "vermelho colado" destas guardas, com a distinção que a 47a e a 47b
registraram.** Nasceram **vermelhas contra a implementação** (o vermelho está colado no
relatório): as três da decisão A, as três da tela 404 e a de `prefers-reduced-motion` —
todas sete pediam comportamento que não existia. Nasceram **verdes**, e o vermelho delas é o
do mutante: as quatro de 360px e as dezesseis varreduras anti-culpa — ali o comportamento
já estava certo, o que faltava era a guarda. É o ciclo dirigido por mutação, e está dito em
vez de disfarçado.

⚠️ **Um falso acusador, declarado para ninguém contá-lo duas vezes.** Nas primeiras rodadas
de mutação o `ui-source-scan.test.ts › finds classes in packages/ui to check` apareceu
vermelho em **todos** os mutantes. Não era acusação: a sonda de contagem dele pinava
`rounded-control` em 10 arquivos do app, e a caixa da volta da tela 404 fez o número virar
**11**. Corrigido no próprio arquivo (some um, não apague — é o recado que ele mesmo dá), e
todos os 15 mutantes foram **re-rodados** contra a base já limpa. Os números da tabela são
os da segunda rodada.

### 15 · ⚠️ A guarda por TOKEN ganhou um dono só — a lição da 47b aplicada antes de doer

A regra 9 manda importar do `harness.tsx` em vez de copiar. Eu precisei dela em **duas**
formas que o `tokensOf()` não atende: sobre uma **string** de classes (a constante do campo,
que não é um nó) e por **PREFIXO** (as opacidades da 404). Escritas à mão, seriam a terceira
e a quarta cópia da mesma linha — que é exatamente por onde a forma frágil voltou na 45 e na
46.

Então a linha ganhou nome: `utilityOf(className)` e `utilitiesIn(classes)` no `harness.tsx`,
com o `tokensOf()` reescrito por cima do primeiro. Os dois arquivos novos **importam**.

### 16 · Gates, bytes e tamanho

| | entrada (`ce63fd9`) | saída | Δ |
| --- | --- | --- | --- |
| `pnpm -r test` shared | 607 | **607** | = |
| ui | 305 | **305** | = |
| backend | 1994 | **1994** | = |
| app | 1007 | **1040** | **+33** |
| chunk de entrada | 444.436 B | **444.619 B** | **+183** |
| folga até 450.000 | 5.564 | **5.381** | −183 |
| CSS | 36.804 B | **37.131 B** | **+327** |
| `book-form` | 10.244 | **10.244** | = |
| editor | 449.522 | **449.522** | = |
| `index.html` | 1.638 | **1.638** | = |
| precache | 27 | **27** | = |

`pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` · `pnpm --filter @clube/app
build`: **todos verdes**. `schema.prisma` segue `968c9986f7a2dfb4ccbd738b13d44715` —
**nenhuma migration, endpoint ou schema** (decisão I).

**Tamanho, pelo contador canônico** (`acervo.tsx`, nunca `wc -l`):

| arquivo | antes | depois |
| --- | --- | --- |
| `preferencias.tsx` | 161 | **161** (intocado) |
| `push-section.tsx` | 180 | **180** (intocado) |
| `accept-invite.tsx` | 147 | **147** (intocado) |
| `login.tsx` | 113 | **113** (intocado) |
| `not-found.tsx` | 19 | **33** |
| `form-styles.ts` | 7 | **7** (só prosa) |
| `acervo-filters.tsx` | 465 | **465** (só prosa — decisão H) |

**Nenhuma passa de 400.** O crescimento é todo da 404, e ele está registrado **no próprio
arquivo**, não só aqui.

**Varredura de invisíveis** (`scratchpad/t48/invisiveis.mjs`, 24 code points montados **por
número**, nenhum glifo colado): ⚠️ **ela morde antes de varrer** — num texto plantado com
`U+200B`, `U+00A0` e `U+2028` acusa 3 de 3, e o script **estoura** se acusar menos. Nos
**quinze** arquivos do diff mais esta spec: **zero**.

### 17 · O que eu tentei e não deu certo

1. **`expect(scrollWidth).toBeLessThanOrEqual(clientWidth)` para os 360px.** É o que qualquer
   um escreve, e é `0 <= 0` no jsdom — verde com 800px na tela. Trocado pela varredura de
   fonte; a medição está na nota 5.
2. **Proibir geometria "em lugar nenhum"** na guarda de movimento. Vermelha contra a
   implementação por causa do `rotate-180` da lombada, que é tipografia estática. Estreitada
   para a variante de gesto — nota 6.
3. **Explicar a troca das opacidades nomeando os dois utilitários.** Custou dois seletores de
   CSS emitidos sem escritor de código, e quitou por acidente uma dívida de seis fatias —
   nota 8.
4. **`expect(TEXT_INPUT_CLASS).not.toContain('border-line')`.** Vermelha contra a própria
   entrega: `border-line-field` **contém** `border-line`. O conserto fácil (afrouxar a
   asserção) é o que a faria parar de guardar; o certo é comparar por token, com a função do
   harness — nota 15.
5. **Confiar no meu primeiro script de contraste.** Ele estava certo e a minha expectativa
   errada (1,99 onde eu esperava 3,62, por ter misturado o dourado escuro com o papel claro).
   Só apareceu porque o script **estoura** se um par conhecido não bater — nota 4.
6. **Uma âncora de edição curta demais** no `accept-invite.test.tsx`: ela aparecia **2** vezes
   e o `edit.mjs` recusou. É a guarda funcionando; anotado porque foi a segunda vez neste
   bloco que ela pagou por si.

### 18 · ⚠️ Dívidas de fatias anteriores que continuam SEM ENDEREÇO — eu digo, não conserto

A spec manda dizer, não consertar. São cinco, e as cinco foram reconferidas hoje:

1. **`pages.highlightForm.draftSaved` segue sem consumidor** (nasceu na Tarefa 40; a 47a a
   deixou de fora pela nota 11, que **parou** na decisão H daquela fatia). ⚠️ **A outra
   chave que a nota 11 citava junto — `pages.highlightForm.preview.heading` — JÁ TEM
   consumidor** (`highlight-rail.tsx:97`, entregue pela 47b), então aquela frase está meio
   velha. A pergunta da decisão H da 47a (o `SaveIndicator` num formulário que não tem
   autosave) **continua aberta**.
2. **`CorrigirGrifo.dc.html:87-90` desenha um "Arquivar este grifo"** que o formulário não
   tem — a 47a registrou como pendência de desenho e nenhuma fatia a pegou.
3. ~~**O `--pen-a-dot` a 2,28:1**~~ ✅ **RESOLVIDO pela decisão do dono de 2026-09-24 — nota
   19.** O valor do token **não** mudou (segue 2,28 contra a página no claro); o que mudou é
   que ele deixou de ser a fronteira do campo. Quem a faz agora é a moldura, a 3,63 / 4,01.
4. **As quatro fileiras escuras ausentes do canvas** — nota 2. Não é dívida de código; é um
   número errado no `BACKLOG.md`, corrigido lá.
5. **As fontes do Google não entram no precache** (`theme.css` registra: offline o app cai na
   fonte do sistema; auto-hospedar custa ~250 KB). Pergunta aberta ao dono desde a Tarefa 39,
   sem fatia dona.

⚠️⚠️ **OS ITENS 4 E 5 ESTAVAM SOLTOS NO FIM DO ARQUIVO, abaixo da tabela da nota 19, sem
cabeçalho nenhum — e isto é o §7.4 acontecendo dentro do documento que audita o §7.4.** A
nota dizia *"são cinco"* e listava três; quem procurasse as cinco achava três, e as duas
perdidas eram justamente as mais órfãs (nenhuma tem fatia dona). Trazidos de volta para
dentro da nota na rodada de correção.

---

### 19 · ⚠️⚠️ DECISÃO DO DONO (2026-09-24): o papel do grifo ganhou **a mesma borda dos outros campos**

A nota 4 desta fatia parou no **C1** e devolveu a pergunta. O dono decidiu: o papel do grifo
ganha `border-line-field` **por fora**, e o tom da caneta continua pintando o papel **por
dentro**. Feito.

⚠️ **E a decisão só pôde ser tomada AGORA — o motivo é o mais interessante desta fatia
inteira.** A nota 19 da Tarefa 47a tinha oferecido exatamente esta saída (a opção **(ii)**,
"filete neutro por fora") e a **recusado**, com um argumento medido e correto: o filete
neutro daquela época dava **1,35:1**, e emoldurar o filete de caneta (2,28 no pior caso) com
ele seria emoldurar o melhor com o pior. A nota escreveu, com essas palavras, que ele *"não
acrescenta fronteira"*.

**A decisão A desta fatia derrubou a premissa.** O `--border-field` nasceu escurecido até
fechar 3:1, e a frase deixou de valer — ela era uma conclusão sobre um número, e o número
mudou de 1,35 para 3,63. ⚠️ **Corrigido onde mora:** a nota 19 da 47a ganhou uma emenda
datada, com a tabela antes/depois, e o item (ii) dela está riscado com o desfecho. A nota
não foi apagada: ela não estava errada, ela **venceu** — e ter escrito o número ao lado da
conclusão foi justamente o que permitiu saber o que reabrir.

**OS DEZ NÚMEROS PEDIDOS** — o filete externo contra a página, cinco canetas × dois temas.
⚠️ **Eles são iguais de propósito, e é essa a diferença entre moldura de campo e pintura de
papel: a moldura não depende da caneta.** É o mesmo formato da tabela (a) da nota 19 da 47a,
onde os dez davam 1,35 / 1,38:

| caneta | claro | escuro |
| --- | --- | --- |
| a · amarelo | **3,63** ✅ | **4,01** ✅ |
| v · verde | **3,63** ✅ | **4,01** ✅ |
| l · laranja | **3,63** ✅ | **4,01** ✅ |
| z · azul | **3,63** ✅ | **4,01** ✅ |
| r · rosa | **3,63** ✅ | **4,01** ✅ |

**Nenhum reprova.** Nada foi aproximado.

⚠️ **E os números que a decisão NÃO pediu, medidos e declarados porque calar um deles seria
a tabela verde que esta fatia existe para não produzir:**

| par | claro | escuro | é fronteira? |
| --- | --- | --- | --- |
| a moldura contra o **filete de caneta** que fica ao lado dela | 1,05 a **1,59** | 1,14 a 1,72 | **não é informação**: as duas linhas encostadas leem-se como uma aresta de 2px, e o que precisa se distinguir é o conjunto contra a página (3,63 / 4,01 ✅) |
| a moldura contra o **preenchimento** de cada caneta | 3,07 a 3,17 ✅ | **2,42 a 3,10**, dois abaixo de 3 | **não são adjacentes** — o filete de caneta fica entre os dois. Fica medido para ninguém refazer a conta |
| o **filete de caneta** contra o papel que ele fecha | **1,99** (amarelo) e **2,98** (verde) abaixo de 3 | 3,26 a 4,18 ✅ | ⚠️ **já era assim antes desta rodada e não mudou**: é o filete interno contra o próprio fundo, e ele é a marca da caneta, não a fronteira do controle |
| o **vermelho do erro** contra a moldura ao lado | **2,18** | **2,82** | idem: o que importa é o vermelho contra a página (**7,90 / 11,28**) e contra o papel (**8,19 / 10,47**), e os quatro passam com folga |

**COMO FOI FEITO, e a forma não é zelo:** a moldura é um **elemento próprio**
(`<div className="rounded-control border border-line-field">`) envolvendo o papel.
⚠️ `border-line-field` e `border-pen-a-dot` são o **mesmo utilitário** (`border-<cor>`), e o
`cx` **não resolve conflito de utilitário** — escritos no mesmo elemento, quem venceria é a
ordem de emissão do CSS, que ninguém declara e que a auditoria da Tarefa 46 (B5) já teve de
pinar à mão. Em nós diferentes o conflito **não existe**: a pergunta deixa de ser respondida
por sorte. Há asserção pinando que os dois filetes nunca dividem elemento.

`rounded-control` (4px) e não `rounded-callout` (3px): o raio de fora é o de dentro mais a
espessura do filete, senão o canto da moldura corta o canto do papel — e 4px é o raio de
todo campo e botão do canvas (`Main.dc.html:57`), o que faz "a mesma borda dos outros
campos" valer também de **forma**, não só de cor.

⚠️ **O ALCANCE, MEDIDO, porque este bloco pagou um bloqueador por guardar só a tela de
criar:** o campo do trecho aparece em **registrar** e em **corrigir**, e há um `it()` para
cada rota. **O mutante M16 (a moldura volta ao filete decorativo) derruba os DOIS** — uma
rota cada. Se tivesse derrubado um só, a outra estaria sem dono.

⚠️⚠️ **AS GUARDAS DA 47a: reli as quatro, uma a uma, e NENHUMA mudou de significado —
medido, não assumido.** A razão é estrutural: o `paperParts()` acha o papel por
`control.parentElement`, e a moldura entrou **acima** dele. Nenhuma das guardas caminha para
cima, então nenhuma consegue ver o nó novo:

| guarda da 47a | o que ela lê | mudou? |
| --- | --- | --- |
| `paints the paper, its edge AND the quote mark …` | as classes do **papel** | não |
| `leaves the paper NEUTRAL while no pen has been chosen` | idem, e ela compara **token exato** — `border-line-field` **não** satisfaz um `toContain('border-line')` de array | não |
| `turns the edge of the paper DANGER …` | idem, mais a varredura estreitada de vermelho | não (ver a ressalva abaixo) |
| `refuses the desktop artboard's gold edge, in all five pens` | a string de classe do **papel** | não |

E a prova de que elas continuam mordendo o que importa: **o mutante M20 — "trocar em vez de
somar", que é a saída que a 47a mediu como PIORA — tem SETE acusadores**, três deles guardas
da 47a.

⚠️ **UMA RESSALVA DECLARADA, e ela é de NOME, não de asserção.** O `it()` do erro se chama
*"turns the edge of the paper DANGER … **the way every other field of the app does**"*. Nos
outros campos a borda **única** fica vermelha; aqui a borda **interna** fica vermelha e a
moldura continua neutra. A asserção não mudou e continua verdadeira; o que ficou meio
pixel mais largo é a promessa do nome. **Não mexi**, porque mover o vermelho para a moldura
é comportamento novo e a decisão do dono foi sobre a borda, não sobre o erro. **Se você
quiser o vermelho por fora, é uma linha no `QuoteField` e o nome do `it()` volta a ser
literal — digo e faço.**

**Custo: +77 B** no chunk de entrada (444.619 → 444.696) e **ZERO no CSS** — o arquivo saiu
com o **mesmo nome de hash de conteúdo** (`index-DaEfJNGm.css`), que é identidade e não
coincidência: as três classes da moldura (`rounded-control`, `border`, `border-line-field`)
já eram emitidas. Bem abaixo dos 300 B do orçamento. **Acumulado da fatia: +260 B**, folga
**5.304**.

**Mutantes desta rodada — cinco, cinco acusados:**

| # | mutante | acus. | quem acusou (1º) |
| --- | --- | --- | --- |
| M16 | a moldura volta ao filete decorativo (1,35) | **2** | `⚠️ wraps the paper in the SAME field edge …` **+ a rota de correção** |
| M17 | a moldura perde a **largura** (fica só a cor) | 2 | idem |
| M18 | a moldura repinta **por caneta** | 4 | idem + `keeps the pen INSIDE the frame` + `the frame is a node of its OWN` |
| M19 | a moldura vira nó invisível (sem filete nenhum) | 2 | idem |
| M20 | **trocar em vez de somar** (o filete de caneta some do papel) | **7** | `⚠️ paints the paper, its edge AND the quote mark …` (guarda da 47a) |

⚠️ **Vermelho colado:** as duas guardas de moldura nasceram **vermelhas contra a
implementação** —
`→ expected [ 'flex', 'flex-col', 'gap-2.5' ] to include 'border-line-field'`, nas duas
rotas. As duas do par (a moldura não repinta / o papel repinta; os dois filetes em nós
diferentes) nasceram **verdes**, e o vermelho delas é o do M18.

**Testes: 1040 → 1044.** Gates todos verdes; `schema.prisma` intocado.

---

## Notas da RODADA DE CORREÇÃO (2026-09-24) — um revisor derrubou catorze afirmações e achou seis mutantes sobreviventes

_Numeradas a partir de 20. Cada uma diz **como foi medida** e onde o vermelho está._

### 20 · ⚠️⚠️ A1 — dois números de contraste estavam errados em QUATRO arquivos permanentes, e o defeito é do MECANISMO

`--surface-today` e `--gold-soft` no tema **claro** foram publicados como **3,48** e valem
**3,70**. Medido com script próprio desta rodada:

```
--border-field claro #827d73   L = 0,20651
--surface-today claro #faf3e4  L = 0,90027      (0,95027)/(0,25651) = 3,7046
```

⚠️ **A conclusão não muda** — 3,70 passa dos 3:1 com mais folga que 3,48 —, e é justamente
isso que torna o caso instrutivo: **um número errado que conclui certo não tem sintoma**.

⚠️⚠️ **O QUE FALHOU FOI O MECANISMO, e ele é o achado.** O script da entrega se autovalidava
contra 19 pares conhecidos antes de medir, e **nenhum dos 19 tocava essas duas superfícies**.
A autovalidação pegou um erro do dourado (1,99 onde se esperava 3,62) porque havia par ali;
aqui não havia, e o número saiu inteiro. Uma lista de pares conhecidos só cobre o que quem a
escreveu lembrou de pôr nela.

**O conserto tem duas camadas, e a segunda é a que importa:**

1. o script desta rodada acrescentou pares que **cobrem as superfícies que ele mede** —
   `--surface-today`, `--gold-soft`, `--border-field` e `--danger-bg`, nos dois temas: 23
   pares conhecidos, 23 OK;
2. ⚠️ **a tabela publicada ganhou acusador PERMANENTE**, que é o que um script de scratchpad
   nunca dá. Em `theme-tokens.test.ts` entraram dois `it()`:
   - **os doze números, pinados à segunda casa.** O `>= 3` antigo prova o piso; este prova o
     número que está escrito na prosa. Mutante **C1** (empurrar `--surface-today` de
     `#faf3e4` para `#f7f0e1`): **1 acusador**, e só ele — o piso continuava passando;
   - ⚠️ **a identidade que não depende de lista:** para QUALQUER cor,
     razão-contra-branco × razão-contra-preto é exatamente **21,00**, porque as duas frações
     se cancelam. Toda superfície que a suíte mede se valida sozinha, e um erro de canal
     (o clássico: trocar R por B) quebra a identidade em vez de produzir número plausível.

Corrigido em `packages/ui/src/theme.css`, no docblock de `theme-tokens.test.ts`, na nota 3
desta spec e no `BACKLOG.md`.

⚠️ **E um detalhe que explica por que os dois números são iguais, dito porque ninguém o
disse:** `--surface-today` e `--gold-soft` são **o mesmo valor** (`light-dark(#faf3e4,
#2a2419)`). As duas linhas da tabela nunca podiam divergir; medir as duas é medir uma.

### 21 · ⚠️⚠️ A2 e A3 — o `<select>` não tinha dono nenhum, e uma tela podia ANULAR a decisão A

**A2 · a guarda de alcance lia `<input>` e só.** O padrão era
`/<input\b[\s\S]*?\/>/gu`. Medido em `pages/`: há também **um** `<textarea>`
(`highlight-fields.tsx`, o trecho do grifo) e **um** `<select>` (`acervo-filters.tsx`, a
dimensão leitura) — os dois são "componente de interface" no sentido da WCAG 1.4.11. O
`<textarea>` estava coberto **por acidente** (a moldura dele tem guarda própria); o
`<select>` não tinha acusador real nenhum.

⚠️ **E não dava para consertar só alargando o padrão**, por duas razões medidas:
o `<select>` **não é auto-fechado** (um padrão ancorado em `/>` o atravessa inteiro), e um
`[^>]*>` cru quebra no `onChange={(event) => …}`, que tem um `>` dentro do atributo. A tag
passou a ser achada por **contagem de chaves**: um `>` só fecha a tag quando está fora de
`{ … }`. Medido depois: **20 controles**, 18 com a constante, **duas** isenções —
`checkbox` (por tipo) e o `<textarea>` do grifo (a aresta é da moldura de fora, e a isenção
**morde**: ela só vale enquanto ele não desenhar borda própria).

**A3 · a tela podia escrever o filete decorativo AO LADO da constante.** A asserção antiga
perguntava se a constante estava na tag; não perguntava o que mais estava escrito nela.
Mutante `` className={`${TEXT_INPUT_CLASS} border-line`} `` em `login.tsx`: **zero
acusadores**. ⚠️ **E quem decidiria no navegador é a ordem de emissão do CSS** —
`.border-line` sai antes de `.border-line-field`, então a decisão A estava funcionando por
**sorte alfabética**. Agora os utilitários são extraídos da tag inteira (normalizando a
pontuação de JSX antes, senão o token seria `` 'border-line')} ``) e comparados por
igualdade contra `border-line`, `border-line-soft` e `border-line-strong`.

| mutante | acus. antes | acus. agora | quem acusa |
| --- | --- | --- | --- |
| **C2** o `<select>` desenha o campo à mão com o filete decorativo | **0** reais (só o falso acusador de contagem) | **1** | `⚠️ leaves no text control drawing an edge of its own` |
| **C3** `border-line` escrito ao lado da constante em `login.tsx` | **0** | **1** | idem (a metade `decorated`) |

⚠️ **A guarda nasceu VERDE contra a implementação** (3 testes passando), e o vermelho dela é
o dos dois mutantes acima — dito, não disfarçado.

### 22 · ⚠️ A4 — a guarda de "hover nunca responde com geometria" estava meio pixel curta

O estreitamento **pela variante** estava certo (o `rotate-180` da lombada é tipografia
estática, sem gesto). O padrão é que estava curto: ele exigia o nome do utilitário **colado**
no `:`. Três formas escapavam, e a primeira é a mais idiomática do Tailwind:

| escapava | acus. antes | por quê |
| --- | --- | --- |
| `hover:-translate-y-1` | **0** | utilitário NEGATIVO põe o `-` antes do nome |
| `hover:[transform:scale(1.1)]` | **0** | valor arbitrário: a geometria entra como propriedade |
| `data-[state=open]:scale-105` | **0** | a variante de estado de dado não estava na lista |

Hoje: `-?` para o negativo, `\[transform:` para o arbitrário, `data-[…]` entre as variantes
de gesto, e `translate`/`skew` sem exigir o eixo. Mutante **C4** (`hover:-translate-y-1` em
`home.tsx:541`, o "levantar no hover"): **1 acusador**, era 0. Entrou também um par positivo
escrito (seis formas plantadas, cinco legítimas recusadas), para a varredura não virar tabela
verde.

### 23 · ⚠️⚠️ A5 — eram DEZESSEIS pela conta do revisor; medi **vinte e quatro**, e o CSS caiu **1.327 B**

**Como medi**, com script próprio: varri o CSS construído **por bloco** (o seletor só mora no
prelúdio de cada `{`; dentro do bloco mora declaração, e `.5rem` não é classe), extraí os
seletores de classe, e perguntei para cada um se algum arquivo de **produção** — sem
comentário de bloco, sem linha de `//`, sem `__tests__` — o escreve.

```
antes:  328 seletores de classe · 24 sem escritor em código · 1.098 B de regra nua
depois: 304 seletores de classe ·  0 sem escritor em código ·     0 B
CSS:    37.131 B → 35.804 B   (−1.327 B)
```

_(O único resto é o `com` de `https://tailwindcss.com` no comentário de licença — artefato do
meu próprio parser, sem regra nenhuma no CSS.)_

**Os vinte e quatro, e quem os mantinha vivos:**

| seletor | B | a prosa que o escrevia |
| --- | --- | --- |
| `ring` | 255 | `highlight-fields`, `styles.css`, `grifo-text` |
| `border-y-0` | 75 | `acervo-filters` (duas vezes) |
| `outline-none` | 57 | `components/styles.ts` |
| `ring-focus-halo` | 50 | `styles.css`, `components/styles.ts` |
| `px-10` · `px-23` | 48 + 48 | `App.tsx`, `reading-column` |
| `pt-10` · `pt-12` | 45 + 45 | `reading-column` |
| `leading-[…]` · `tracking-[…]` | 44 + 49 | `chrome.tsx` — **e o `…` é literal**: a prosa elidia o valor com reticências e o Tailwind emitiu a classe com a reticência dentro |
| `max-w-2xl` · `max-w-4xl` | 42 + 42 | `book-form`, `chrome.tsx` |
| `bg-danger` | 42 | `book.tsx`, `home.tsx`, `styles.css` |
| `rounded-sm` | 43 | `reading-marks` |
| `h-14` | 39 | `App.tsx` |
| `gap-14` · `w-80` · `p-2` | 38 × 3 | `reading-column`, `cx.ts` |
| `min-h-[46px]` | 32 | `context-bar` |
| `text-gold` | 29 | `eyebrow`, `streak-seal`, `editor.css` |
| `flex-row` | 29 | `book-form`, `chrome.tsx`, `reading-column` |
| `text-wrap` | 26 | `chrome.tsx` |
| `sticky` · `top-0` | 24 + 13 | `RichEditor` (três lugares) |

⚠️⚠️ **TRÊS SÃO ACHADO DE BLOCO, e os três dizem a mesma coisa de ângulos diferentes:**

1. **`reading-column.tsx:71` escreve *"`grep -rn "pt-12" …` devolve só prosa (este docblock e
   o do teste vizinho)"*.** ⚠️ **A MEDIÇÃO DO DEFEITO ERA O QUE MANTINHA O DEFEITO VIVO.** A
   frase estava certa e a prova dela era ela mesma. Reescrita para "procurar o recuo de topo
   de 48px em `packages/{app,ui}/src/`", que continua greppável e não emite nada.
2. **`chrome.tsx:157` é o OBITUÁRIO de `max-w-2xl`/`max-w-4xl`** — *"MORRERAM NA TAREFA 42"* —
   e emitia os dois até hoje, 84 B, seis fatias depois do enterro. Reescrito para "672px de
   conteúdo" e "896px".
3. **`RichEditor.tsx:69` diz *"não há mais `sticky top-0`"*** e havia: os dois seletores, 37 B.
   Reescrito para "nada mais GRUDA no topo".

⚠️ **NENHUM COMENTÁRIO FOI APAGADO — os vinte e quatro foram REESCRITOS**, mantendo o que
ensinam. A forma que funciona é a mesma da nota 8: dizer a coisa em palavras ou na forma de
**propriedade CSS** (`outline: none`, com dois-pontos e espaço), nunca na forma de utilitário.

⚠️ **E o custo não era só de bytes.** O `.ring` sozinho (255 B) é um utilitário que **ninguém
quer**: o projeto escreve `ring-3`, e um `ring` nu seria 1px — o comentário do `grifo-text`
explica exatamente por que ele é errado, e ao explicar o mantinha disponível.

### 24 · ⚠️⚠️ Os dois furos da guarda de 360 px — e a palavra "total" saiu

A guarda **não** é uma sétima "guarda que pina texto": ela varre propriedade real, tem par
positivo e negativo, e as duas armadilhas de regex declaradas (`max-width` casando `width:`,
e `@media (min-width:)` como condição) foram confirmadas. Mas o docblock dizia que ela é
**"total … por construção"** declarando **uma** limitação, e tinha **três**:

| mutante | acus. antes | por quê | acus. agora |
| --- | --- | --- | --- |
| **C5** `w-[50rem]` (= 800 px) em `not-found.tsx` | **0** | os três padrões só entendiam `px` | **1** |
| **C6** `size-96` (= 384 px) em `not-found.tsx` | **0** | a guarda lia `w-`/`min-w-`, e `size-N` **define largura** — este projeto o usa | **1** |
| palavra longa sem espaço vinda do conteúdo | — | não há largura fixa para ler | **continua fora, e agora está escrito como tal** |

Hoje ela converte `px`, `rem`, `em`, `vw` e `ch` (o `ch` com a aproximação **declarada** em
8px, porque é o único número aqui que depende da fonte), e o alvo inclui `size-` e `basis-`.
⚠️ **`max-w-` continua fora e nunca pode entrar** — o `-` antes do `w` é o que o mantém fora,
e há par negativo escrito para `max-w-[50rem]`, `max-width: 40rem`, `w-[100vw]` (que encosta
nos 360 e não estoura) e `size-14` (o glifo da 404).

A palavra "total" virou uma tabela de **o que ela cobre e o que não cobre**. Uma varredura
que se declara completa é a que ninguém volta a medir.

### 25 · ⚠️ M1 — a razão do `!important` estava errada, e a medição é de camada

O `styles.css` dizia que o `!important` existe *"porque isto tem de vencer o utilitário que a
tela escreveu"*. **Falso, medido no CSS construído:**

```
.transition-colors      byte 18.825   camada: utilities
prefers-reduced-motion  byte 33.248   camada: (SEM CAMADA)
```

Regra **fora** de camada vence qualquer regra **em** camada, sem discutir especificidade — o
utilitário da tela já perdia. O que o `!important` realmente compra são duas coisas: uma
regra também sem camada e **mais específica** (o `editor.css` é a folha que mais teria como
escrevê-la) e o **atributo `style`** de um elemento, que vence toda folha de estilo e só perde
para `!important`. A outra metade da frase (*"é a única declaração do projeto que o usa"*)
estava certa e ficou.

### 26 · ⚠️ Os números que envelheceram DENTRO da própria fatia — M2, M5, B1, B2, M3

| # | o que estava escrito | o que é | como medi |
| --- | --- | --- | --- |
| **M2** | doze `transition-*` em **10** arquivos | **9** — a ocorrência de `chrome.tsx:89` é **comentário**, e a própria guarda descarta comentário antes de contar | `grep -rn 'transition-'` fora de `__tests__`, linha a linha |
| **M5** | o mutante M1 tem **1** acusador | **3** — a nota 19 acrescentou as duas guardas da moldura, que derivam o esperado da constante | mutante M1 re-rodado, suíte inteira |
| **B1** | a moldura contra o filete de caneta: "1,05 a **1,72** no claro" | **1,05 a 1,59** no claro; 1,72 é do **escuro** | script de contraste, cinco canetas × dois temas |
| **B2** | `activeChips` "746-823", `RefineBand` "878-941" | **756-833** e **889-952** | contador canônico + `awk` nos limites |
| **M3** | a nota 18 diz "são cinco" e lista **três** | os itens **4 e 5** tinham caído soltos no fim do arquivo, abaixo da tabela da nota 19 | leitura do arquivo inteiro |

⚠️ **O M2 é o mais feio dos cinco**, porque o número publicado discordava **da guarda que o
mede, na mesma fatia**. Conserto: a lista de arquivos deixou de viver só na prosa e virou
`TRANSITION_FILES`, comparada por **igualdade exata** — a forma "soma um, não apague" que o
`SCREENS_WITH_TEXT_FIELDS` já usa.

⚠️ **O B2 é o mais barato**, e ensina o contrário: **a própria fatia moveu as linhas**, ao
acrescentar prosa ao docblock do arquivo; esta rodada as moveu de novo. Os três números que
importam (465 · 65 · 48) estavam e seguem certos, porque são contagem, não posição. É por
isso que o docblock do arquivo cita as funções pelo **nome**.

⚠️ **O M3 é o §7.4 acontecendo dentro do documento que audita o §7.4:** quem procurasse as
cinco dívidas achava três, e as duas perdidas eram justamente as mais órfãs.

### 27 · ⚠️⚠️ M4 — três citações de artboard erradas, e o motivo ESTRUTURAL que ninguém tinha dito

| citação | estava | é | onde mora |
| --- | --- | --- | --- |
| o raio de 4px do campo/botão | `Main.dc.html:56` (linha em branco) | **`:57`** | `highlight-fields.tsx:485` · `styles.css` · `theme.css` · `41a` · esta spec |
| o glifo da 404 | `NaoEncontrada.dc.html:39` (`<path>`) | **`:38`** | `not-found.tsx:65` |
| o aviso do iPhone | `Preferencias:88` (linha em branco) | **`:85`** | nota 13 desta spec |

⚠️ **O `Main.dc.html:56` é HERDADO DA 41a** — a entrega da 48 o copiou para um arquivo novo
**sem passar o próprio script de citação nele**. A nota 1 diz que o script foi escrito antes
da primeira citação; foi, e depois não foi usado nas citações criadas por cópia. Corrigido
nos **cinco** lugares, porque é a mesma citação e a mesma linha.

⚠️⚠️ **E AQUI EU PAREI E DIGO, porque é uma afirmação que não consegui medir.** Os artboards
`*.dc.html` **não estão neste repositório e não existem em lugar nenhum que esta sessão
alcance**: não estão em `docs/ui/` (que tem 23 `.jpg` de print), não estão no histórico do git
(`git log --all -- '*.dc.html'` devolve vazio) e não estão nos scratchpads das fatias
anteriores. **As três correções acima são as do revisor, aplicadas sem eu poder reconferir.**

Isso é maior que as três linhas: **toda citação `*.dc.html:NN` escrita em arquivo permanente
deste projeto é hoje inverificável a partir da árvore de trabalho.** É a causa estrutural de
M4, e é a única classe de citação deste bloco que não tem como ter acusador. Fica registrado
no `BACKLOG.md` como dívida **aberta e sem dono**, porque a saída (versionar os artboards, ou
aceitar que essas citações são histórico e não referência) é decisão do dono.

### 28 · ⚠️ B3 — a tela que existe para devolver a pessoa ao início não checava o destino

Mutante: a volta da 404 aponta para uma rota inexistente → **zero acusadores**. As quatro
asserções da suíte pinavam a **forma** do botão (raio, filete, alvo de 44px, ausência de
sublinhado) e nenhuma perguntava para onde ele leva — numa tela cuja razão de existir é o
destino. A 404 devolvendo 404 era o defeito que ela deveria ser incapaz de ter.

⚠️ **E o esperado não é uma barra digitada à mão:** é o `HOME_PATH`, o mesmo módulo que o
router lê (`<Route path={HOME_PATH} element={<HomePage />} />`). Comparar com `'/'` provaria
só que duas pessoas digitaram a mesma barra. Mutante **C7** (`to="/inicio-que-nao-existe"`):
**1 acusador**, era 0.

### 29 · ⚠️ B4 — o NOME estreitou; o vermelho NÃO se moveu

O veredito do revisor, endossado pelo dono: mover o vermelho para a moldura é **comportamento
novo** decidido por auditoria numa passagem final, e a assimetria (duas arestas em erro, uma
vermelha) é menos ruim que uma decisão de desenho tomada assim. O `it()` perdeu a cláusula de
paridade e passou a ser
`⚠️ turns the INNER edge of the paper DANGER while the quote is invalid`. **Nenhuma asserção
mudou**, e a assimetria ficou escrita ao lado do nome, como divergência declarada.

### 30 · A tabela de mutação desta rodada — **7 mutantes, 7 acusados, 6 deles eram sobreviventes**

Protocolo em cada um: `md5sum` num arquivo de baseline + `cp -p` → `.mjs` **ancorado, com
âncora e substituto em ARQUIVO** (estoura se a âncora não aparecer exatamente 1 vez **ou** se
âncora = substituto) → `grep` de confirmação → `pnpm vitest run` na suíte inteira do app →
contar e **nomear** → `cp -p` de volta → `md5sum -c` **e** `cmp`. Nenhum `git checkout`,
`restore`, `stash`, `reset` ou `clean` em momento nenhum.

| # | mutante | arquivo | antes | agora | quem acusou |
| --- | --- | --- | --- | --- | --- |
| C1 | `--surface-today` empurrado de `#faf3e4` para `#f7f0e1` | `theme.css` | — | **1** | `⚠️ and the twelve PUBLISHED numbers are the real ones …` |
| C2 | o `<select>` desenha o campo à mão, com o filete decorativo | `acervo-filters.tsx` | **0** | **1** | `⚠️ leaves no text control drawing an edge of its own` |
| C3 | `` `${TEXT_INPUT_CLASS} border-line` `` | `login.tsx` | **0** | **1** | idem |
| C4 | `hover:-translate-y-1` | `home.tsx` | **0** | **1** | `⚠️ never answers a hover or a press with GEOMETRY …` |
| C5 | `w-[50rem]` (800 px em outra unidade) | `not-found.tsx` | **0** | **1** | `⚠️ pins nothing wider than the narrow viewport …` |
| C6 | `size-96` (384 px em outro utilitário) | `not-found.tsx` | **0** | **1** | idem |
| C7 | a volta da 404 aponta para rota inexistente | `not-found.tsx` | **0** | **1** | `⚠️ and the way back actually GOES somewhere …` |
| M1 | (re-rodado) o campo volta ao filete decorativo | `form-styles.ts` | 1 (publicado) | **3** | as duas guardas da moldura entraram depois da tabela |

⚠️ **O falso acusador declarado de novo, para ninguém contá-lo:** no C2 o
`ui-source-scan.test.ts › finds classes in packages/ui to check` ficou vermelho junto. Não é
acusação — é a sonda de contagem dele, que pina `rounded-control` num número de arquivos, e o
mutante escreveu a classe num décimo primeiro lugar. Nos outros seis mutantes ele nem apareceu.

⚠️ **Vermelho colado.** Todas as guardas desta rodada **nasceram VERDES contra a
implementação** — o comportamento já estava certo, o que faltava era o acusador —, e o
vermelho de cada uma é o do mutante da tabela acima. As únicas exceções são a asserção dos
doze números (que nasceu verde e foi provada pelo C1, um mutante de produção, não de teste) e
as correções de prosa, que não têm vermelho por não serem comportamento.

### 31 · Gates, bytes e CSS desta rodada

| | entrada da rodada | saída | Δ |
| --- | --- | --- | --- |
| `pnpm -r test` shared | 607 | **607** | = |
| ui | 305 | **305** | = |
| backend | 1994 | **1994** | = |
| app | 1044 | **1048** | **+4** |
| chunk de entrada | 444.696 B | **444.696 B** | **=** |
| folga até 450.000 | 5.304 | **5.304** | = |
| **CSS** | 37.131 B | **35.804 B** | ⚠️ **−1.327** |
| `book-form` | 10.244 | **10.244** | = |
| editor | 449.522 | **449.522** | = |
| `index.html` | 1.638 | **1.638** | = |
| precache | 27 | **27** | = |

`pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` · `pnpm --filter @clube/app
build`: **todos verdes**. `schema.prisma` segue `968c9986f7a2dfb4ccbd738b13d44715` —
**nenhuma migration, endpoint ou schema**.

⚠️ **O chunk de entrada não se mexeu um byte**, e isso é esperado: tudo o que esta rodada fez
é teste, comentário e número em prosa. O CSS caiu porque comentário **entra** no scanner do
Tailwind, e é o único lugar onde prosa vira peso.

**Varredura de invisíveis** (24 code points montados **por número**, nenhum glifo colado):
morde antes de varrer — 3 de 3 plantados acusados (`U+200B`, `U+00A0`, `U+2028`), e o script
estoura se acusar menos. Nos **37** arquivos do diff: **zero**.

**Tamanho, pelo contador canônico:** `acervo-filters.tsx` **465** · `preferencias.tsx` **161**
· `push-section.tsx` **180** · `accept-invite.tsx` **147** · `login.tsx` **113** ·
`not-found.tsx` **33** · `form-styles.ts` **7**. Nenhuma passa de 400.

### 32 · O que eu tentei e não deu certo

1. **Alargar o padrão de tags para `/<(?:input|textarea|select)\b[\s\S]*?\/>/`**, que é o
   conserto que o relatório do revisor sugere ao pé da letra. Não funciona: o `<select>` não
   é auto-fechado, então o padrão o atravessa até o `/>` do próximo `<input>` de outra tela.
   Trocado por contagem de chaves — nota 21.
2. **`[^>]*>` para achar o fim da tag.** Quebra em `onChange={(event) => …}`: o `>` da seta
   fecha a tag no meio do atributo.
3. **Medir os seletores do CSS com um `matchAll(/\.([\w\\-]+)/g)` no arquivo inteiro.** Devolve
   434 "seletores", dos quais dezenas são fragmentos de decimal (`.5rem`, `.875`) e o `com` de
   uma URL no comentário de licença. A varredura tem de ser **por bloco**, lendo só o prelúdio
   de cada `{`.
4. **Escrever a âncora de edição com `printf '…\n'`.** O `\n` final faz a âncora não casar
   quando ela é um pedaço de linha; o editor estoura com "0 vezes", que é a guarda
   funcionando, mas custou duas tentativas.
5. **Reconferir as três citações de artboard.** Não deu: os `*.dc.html` não existem nesta
   árvore nem no histórico — nota 27. É a única coisa deste relatório que **não** medi.
6. **Confiar na contagem do revisor para a A5** (dezesseis seletores, 731 B). Medi **vinte e
   quatro** e **1.098 B** de regra nua. Não é discordância de método: é que a conta dele
   separava "regra nua" de "seletor com variante", e a minha soma o que o `grep` do dono veria.

### 33 · ⚠️ As dívidas SEM DONO — quais ficam abertas, e onde cada uma está escrita

O revisor listou quatro. Conferidas uma a uma:

| dívida | estava escrita? | hoje |
| --- | --- | --- |
| **o `<select>` sem guarda** | não | ✅ **FECHADA nesta rodada** — nota 21 |
| **um artboard escuro para as quinze telas** | ⚠️ meio: a nota 2 e o `BACKLOG.md` dizem que a fileira escura falta, mas **não** diziam que fica aberta | ✅ escrita com endereço — **fica ABERTA, sem fatia dona** |
| **a ordem de emissão do CSS como invariante não declarada** | ⚠️ meio: aparece em três lugares como razão de uma decisão, nunca como dívida própria | ✅ escrita com endereço — **fica ABERTA, sem fatia dona** |
| **a 1.4.1 da identidade da caneta** (a caneta se identifica só pela COR) | ❌ **não existia em lugar nenhum** — `grep -rn "1\.4\.1" docs/ packages/` devolve vazio | ✅ registrada agora — **fica ABERTA, sem fatia dona** |

E uma quinta, nova desta rodada: **os artboards `*.dc.html` não estão versionados**, o que
torna inverificável toda citação `*.dc.html:NN` dos arquivos permanentes (nota 27). **Fica
ABERTA, sem fatia dona.**

⚠️ **Nenhuma das cinco foi consertada aqui**, que é o que a instrução manda. As cinco estão
na entrada 48 do `BACKLOG.md`, com endereço.

---

## Notas das DUAS DECISÕES DO DONO (2026-09-24, depois da rodada de correção)

### 34 · ⚠️⚠️ DECISÃO 1 — o canvas foi versionado, e a dívida da nota 27 fecha COM ACUSADOR

**O que entrou em `docs/ui/canvas/`:** os **21 artboards** `.dc.html`, o `canvas.json` e
`ds/grine/tokens.json`.

⚠️ **O `ds/` eu avaliei antes de levar, como a instrução manda, e ele É do canvas** —
conferido contra o `theme.css`: `#f5f1e8` é o `--bg`, `#946d2c` é o `--gold`, a serifa é
Fraunces. É a paleta deste projeto, não um padrão genérico da ferramenta. ⚠️ **Mas ele traz
temas que o projeto NÃO tem** (`card-style-flat`, `card-style-outlined`,
`card-style-elevated`, …) e verdes que não são da paleta (`#2d7050`, `#1b4632`): quem for
usá-lo, **o `theme.css` continua sendo a fonte da verdade**, e o `ds/` é referência do
canvas. Dito aqui para ninguém tratar um pelo outro.

**Cópia verificada, não confiada** — `md5sum` na origem e no destino, arquivo a arquivo,
`diff` das duas listas: **23 de 23 idênticos**, zero divergência.

| | |
| --- | --- |
| artboards no disco | **21** |
| boards declarados no `canvas.json` | **35** |
| ausentes | **14** — a fileira escura inteira menos o `DiaEscuro` |
| no disco e não declarados | **nenhum** |

⚠️ Isso **confirma documentalmente** a nota 2 desta fatia, que até agora era uma afirmação
sem o arquivo ao lado.

**As contagens de linha publicadas pelas fatias — todas batem:**
`Main` **71** · `Convite` **74** · `Preferencias` **103** · `NaoEncontrada` **67** (nota 1
desta fatia) e `Inicio` **150** (Tarefa 45). Os cinco são a linha do `</html>`.

⚠️⚠️ **E AS TRÊS CITAÇÕES QUE EU APLIQUEI SEM PODER MEDIR ESTÃO CONFIRMADAS** — era a única
coisa da rodada de correção que eu não tinha medido, e agora está medida:

| | o que há na linha citada | o que há na corrigida |
| --- | --- | --- |
| `Main.dc.html` | **:56 está em branco** | **:57** é o `<button height:50px … border-radius:4px>` |
| `NaoEncontrada.dc.html` | **:39** é um `<path>` | **:38** é o `<svg width="56" stroke="var(--border-strong)">` |
| `Preferencias.dc.html` | **:88 está em branco** | **:85** é o `<span 13px>` do aviso do iPhone |

### 35 · ⚠️⚠️ A varredura das 914 citações — e ela achou um erro que a auditoria não tinha visto

Escrevi a varredura antes de olhar o resultado: ela extrai toda citação
`Arquivo.dc.html:NN` (nas três formas em uso — número só, intervalo com hífen, lista com
vírgula), expande os intervalos e confere cada número contra o artboard.

```
artboards versionados: 21
arquivos permanentes com citação: 96
citações conferidas: 914
  OK       904        a linha existe e tem conteúdo
  VAZIA     10        a linha existe e está em branco
  FORA       0        o número passa do fim do arquivo
  SEM-ARQ    0        o artboard citado não existe
```

⚠️⚠️ **O ERRO REAL: `Livro.dc.html:70,140,150` estava errado NOS TRÊS NÚMEROS.** A citação é
"a linha do sumário" nas três variantes, e está em **quatro** lugares
(`ui/components/list.tsx` duas vezes, `list.test.tsx`, Tarefa 41a). Medido procurando
`padding:9px 0` no artboard: as linhas do plano estão em **71, 81, 91, 100, 109, 119, 129,
149, 156, 163**, e a de HOJE (`padding:12px 10px`, com `href` para `Dia.dc.html`) em **139**.
Ou seja: a `:70` é **branca**, a `:140` e a `:150` são `<div>` de avatar **dentro** de uma
linha. As três variantes são **`:71` (passada) · `:139` (hoje) · `:149` (futura)**. Corrigido
nos quatro lugares.

⚠️ **E o erro não é uniforme** — `70→71` é +1, `140→139` e `150→149` são −1. Não é um
deslocamento do arquivo: são três medições erradas, cada uma do seu jeito. É exatamente o que
acontece quando ninguém tem como conferir.

**As dez "VAZIA" que sobram, auditadas uma a uma, e nenhuma é defeito:**

- **sete são o documento citando o número ERRADO de propósito, para dizer que ele está
  errado** — `Dia.dc.html:60` (corrigido para `:64-73` na Tarefa 43, três ocorrências),
  `InicioDesktop.dc.html:106` (para `:107-118` na Tarefa 45, duas) e `Main.dc.html:56` (para
  `:57` na nota 27 desta fatia, duas);
- **três são extremo de intervalo** que calha de cair numa linha vazia (`:37-53` da tela 404,
  duas vezes, e `:96-140` da margem do dia).

⚠️ **É por isso que a guarda permanente NÃO exige "linha não vazia".** Ela exigiria uma lista
de exceções que mistura "citação correta de um número errado" com "extremo de intervalo" — e
listas de exceção assim são as que apodrecem. Ela decide o que é decidível sem lista: **o
artboard existe** e **o número cai dentro dele**.

**A guarda:** `packages/app/src/__tests__/canvas-citations.test.ts`.
**Mutante D1** (a citação do glifo da tela 404 empurrada para a linha **99**, num
artboard que tem **67**): **1 acusador**, era **0** — não havia como haver.
⚠️ **E o mutante não pode ser escrito aqui na forma de citação**, pelo mesmo motivo do
parágrafo abaixo: esta nota é um arquivo do repositório, e a guarda a leria. A primeira
versão dela escreveu o exemplo e **ficou vermelha no gate** — a terceira vez que a guarda
morde quem escreve sobre ela, e a melhor prova de que ela varre o que diz varrer.
⚠️ **E ela mordeu a si mesma antes de eu rodar o mutante:** a primeira versão escrevia um
exemplo fictício de citação no próprio docblock, e a varredura o acusou — ela varre o
repositório inteiro, e este arquivo faz parte do repositório. As citações que **sobraram** no
docblock são todas reais e resolvem.
⚠️ **E um detalhe que afrouxaria a guarda em exatamente um número:** os 21 arquivos terminam
em quebra de linha, então um `split()` cru devolve **72** para o `Main.dc.html`, cuja última
linha de verdade é a **71**. Com 72 ela aceitaria uma citação para uma linha que não existe —
o defeito que ela existe para pegar, uma unidade adiante. O `\n` final não é uma linha.

### 36 · ⚠️ O custo de versionar o canvas: ZERO, e está PROVADO, não presumido

| | antes da cópia | depois | |
| --- | --- | --- | --- |
| chunk de entrada | 444.696 B | **444.696 B** | mesmo hash, `index-DR8hv80B.js` |
| CSS | 35.804 B | **35.804 B** | mesmo hash, `index-CuOTdgcm.css` |
| `book-form` | 10.244 | **10.244** | mesmo hash |
| editor | 449.522 | **449.522** | mesmo hash |
| `index.html` | 1.638 | **1.638** | = |
| precache | 27 entradas, 1201,02 KiB | **27 entradas, 1201,02 KiB** | = |
| `.dc.html` dentro de `dist/` | — | **0** | |

⚠️ **O hash de conteúdo idêntico é prova mais forte que tamanho igual:** dois arquivos podem
ter o mesmo tamanho e conteúdo diferente; com o mesmo hash, são os mesmos bytes.

⚠️⚠️ **E O SCANNER DO TAILWIND NÃO LÊ `docs/` — provado por DISCRIMINADOR, não por
raciocínio.** A instrução avisa que o scanner lê texto bruto, e os artboards têm palavras que
são utilitário válido. Medido: eles **não têm um `class=` sequer** (é tudo estilo inline), mas
escrevem `flex` 978 vezes, `uppercase` 196, `hidden` 64, `italic` 26, `absolute` 5,
`relative` 4 e **`grid` 2** — como VALOR de propriedade CSS. O discriminador é o `grid`: o app
não o escreve em lugar nenhum, e **`.grid` não existe no CSS emitido**. Se `docs/` estivesse
no `@source`, ele estaria lá. (`italic`, `absolute` e `uppercase` estão no CSS, mas porque o
app os escreve — `book.tsx:547`, entre outros.)

⚠️ **`docs/**` já estava no `.prettierignore`**, então nada precisou mudar para o gate passar
— mas a **razão** escrita lá ficou maior e foi reescrita: até ontem era "quebra de linha é do
dono"; hoje é que reformatar a pasta **invalidaria as 914 citações de uma vez, em silêncio**.
Quem tirar `docs/**` de lá quebra a guarda da nota 35, e essa é a intenção.

### 37 · ⚠️⚠️ DECISÃO 2 — a caneta e a 1.4.1: MEDI, A PREMISSA CAIU, E EU PAREI

O enquadramento do dono foi *"a caneta já tem rótulo em texto"*. Medi os **seis** lugares em
que a cor da caneta aparece — por leitura de fonte **e** por render —, e o rótulo existe em
cinco:

| lugar | nome em texto? | como, e o que prova |
| --- | --- | --- |
| acervo, chips do filtro | ✅ | `acervo-filters.tsx:291`, `label: t(COLOR_LABEL_KEYS[…])` — texto do `FilterChip`; a `ColorSwatch` ao lado é `aria-hidden` |
| acervo, card do grifo | ✅ | `acervo-rows.tsx:183`, `<span>{t(COLOR_LABEL_KEYS[…])}</span>` |
| busca, resultado | ✅ | `busca.tsx:570`, idem |
| prévia do formulário | ✅ | `highlight-rail.tsx:107`, idem |
| paleta do formulário de grifo | ✅ | `highlight-fields.tsx:321` → o `PenPill` imprime `{label}` como texto visível, com a bolinha `aria-hidden` ao lado |
| ⚠️⚠️ **margem do livro** | ❌ **NÃO** | `pages/margin-highlight.tsx` |

⚠️⚠️ **A MARGEM DO LIVRO É O LUGAR EM QUE A COR É O ÚNICO PORTADOR.** Ela é usada por **duas
telas**: `day-note.tsx:1044` ("Grifos deste dia") e `book.tsx:1081` ("Último grifo"). O
componente renderiza a bolinha de 9px (`aria-hidden`) e o `GrifoText`, e a linha de mono ao
lado diz **página · autor**, nunca a cor. Render medido:

```
<span aria-hidden="true" class="size-[9px] … bg-pen-a-dot"></span>
<span class="font-mono …">página · Marcos</span>
<p …><span class="rounded-mark ring-2 bg-pen-a ring-pen-a">um trecho qualquer</span></p>

texto visível: "página · Marcos" + o trecho
"Amarelo" presente? false   "Verde"? false   "Laranja"? false   "Azul"? false   "Rosa"? false
```

Nenhum dos cinco nomes aparece — nem em texto, nem em `aria-*`.

⚠️ **E O COMENTÁRIO DO PRÓPRIO COMPONENTE AFIRMA O CONTRÁRIO.** `margin-highlight.tsx`, na
bolinha: *"`aria-hidden` porque a cor **nunca** é o único portador de informação (ADR 0002,
regra 4 da Tarefa 25): o que a linha diz está escrito ao lado"*. O que está escrito ao lado é
a **página e o autor**. A justificativa é falsa como está escrita — é a **15ª** afirmação
derrubada neste bloco, e a única achada por uma decisão do dono em vez de por auditoria.

**NÃO CONSERTEI A TELA e NÃO ESCREVI A GUARDA**, e as duas coisas são a instrução literal.
Escrever a guarda de 1.4.1 cobrindo cinco lugares e isentando o sexto seria **forçar o
enquadramento para caber** — a premissa do dono é que o rótulo existe, e nas duas telas da
margem ele não existe. **A decisão volta para ele**, agora com o lugar nomeado, o render
colado e o comentário falso apontado. A dívida **(c) continua ABERTA**.

⚠️ **O que eu não decido, dito em vez de calado:** se a cor da caneta **carrega informação**
na margem é a pergunta de desenho, e ela é do dono. Argumento de um lado: ali cada grifo já
traz página, autor e o trecho, e a caneta pode ser decoração de autoria. Do outro: a cor é
uma **dimensão de filtro** no acervo e na busca, então alguém que use a caneta como código
("amarelo = conversar") perde esse código exatamente na tela de leitura. **A guarda está
pronta para ser escrita nos dois desfechos** — se o dono disser que a margem precisa do
rótulo, ela nasce vermelha contra a implementação; se disser que ali a caneta é decoração, ela
nasce cobrindo os cinco e a margem entra como isenção **escrita**, não como silêncio.
