# Tarefa 40 — As dezessete frases novas, e a isenção que deixa "Dia 11 de 30" existir

> **Segunda fatia do MVP 3.5**, nascida do §A.9 de `docs/new-ui.md` e da decisão fechada
> *"'Dia 11 de 30' entra por isenção nominal"*. É a fatia mais curta do bloco e a que **não
> renderiza nada**: ela põe o texto no catálogo e a guarda em volta dele, para as Tarefas
> 42–48 só consumirem.
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** ·
> `docs/tasks/39-tokens-e-fontes.md`, a seção **"Notas de reconciliação"** — ⚠️ **é o mapa
> do que dá errado aqui: três afirmações "medido" caíram na 39, e a pior estava escrita num
> arquivo de produção** · `docs/CONVENCOES-CODIGO.md` **§7.1**, **§7.4**, **§7.9** ·
> `docs/adr/0010-corrente-de-leitura-visivel.md` — ⚠️ **é o molde da isenção que esta fatia
> copia, e a única isenção que o projeto já tem**.

---

## ⚠️ O §A.9 lista 21 chaves. São 17.

Medido no catálogo, chave por chave:

| §A.9 pede | O que acontece |
| --- | --- |
| `archiveAction` "Arquivar" | ⚠️ **já existe duas vezes** — `pages.acervo.archive.confirm` e `pages.freeNote.archive.confirm`, as duas com o valor `'Arquivar'`. **Reusar. Não criar gêmea.** |
| `excerptAsInBook` "Como está no livro." | ⚠️ **já existe** como `pages.highlightForm.fields.quoteHint` = `'Copie o trecho como ele está no livro.'` — que é **literalmente o texto do artboard de desktop** (`NovoGrifoDesktop`). O celular encurta por espaço. **Reusar o que existe; o encurtamento é assunto de layout, não de catálogo** (uma segunda chave com a mesma frase em dois tamanhos é a armadilha que o `mutacao-*` chama de "duas coisas que falam a MESMA frase são indistinguíveis por varredura de DOM") |
| `keepAsIs` "Deixar como está" | ⚠️ **não é chave nova: é troca de VALOR** em `pages.acervo.archive.cancel` e `pages.freeNote.archive.cancel`, hoje `'Cancelar'` |
| `searchResultCount` | ⚠️ **NÃO ENTRA nesta fatia.** Ver "A chave que fica de fora" abaixo |

Restam **17 chaves novas** (duas delas com par de plural) e **2 valores trocados**.

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | **Nenhuma chave na raiz.** Cada uma vai para o namespace da tela que a usa, no padrão `pages.<tela>.<grupo>.<chave>` | É a estrutura do arquivo, e não existe uma única chave plana na raiz hoje. O §A.9 as escreveu soltas porque é uma lista de compras, não um mapa |
| **B** | **Interpolação `{{…}}`, com nome em inglês** — `{{number}}`, `{{total}}`, `{{time}}`, `{{count}}` | `{n}` e `{hora}` do §A.9 não são a sintaxe do i18next e não seriam substituídos: sairiam **literais na tela**. E `CLAUDE.md` manda código em inglês |
| **C** | **Chave usada por duas telas vive no namespace do DONO do assunto**, não duplicada | Precedente medido: `pages.acervo.item.author.other` é lido por `acervo.tsx`, `busca.tsx`, `activity-feed.tsx` e `streak-bar.tsx`. Duplicar daria duas frases que dizem o mesmo e divergem na primeira correção — o defeito que o `GUILT_TERMS` viveu até a Tarefa 19 |
| **D** | ⚠️ **`dayWithNote`, e NÃO `dayHasNote`** | `pages.bookForm.plan.dayHasNotes` **já existe** e é outra coisa: a mensagem de erro do 400 ao tentar remover um dia que tem anotação. Duas chaves com um `s` de diferença, uma dizendo "Dia 3 · tem anotação" e a outra "Um dos dias que saiu do plano já tem anotação", é erro esperando acontecer |
| **E** | ⚠️⚠️ **A isenção do contador é por CHAVE, e a guarda DERIVA as frases dela** | `COUNTER_SHAPE` roda sobre o **DOM renderizado**, não sobre chaves — uma lista de chaves não isenta nada por si. Então: `COUNTER_EXEMPT_KEYS` é a lista pinada; a guarda interpola cada chave isenta com os valores que a tela usa, **remove essas frases exatas** do `readableText()`, e só então roda o `COUNTER_SHAPE` no que sobrou. Acrescentar chave à lista continua exigindo editar um `toEqual` exato |
| **F** | ⚠️ **A isenção tem de ser USADA para valer.** Se nenhuma frase isenta aparecer no DOM, o teste diz isso | Senão a isenção vira letra morta que isenta um texto futuro de mesmo formato sem ninguém reparar — é exatamente o defeito que o `anti-guilt.test.ts` já vigia no `STREAK_KEYS` com o teste "as chaves isentas existem de verdade" |
| **G** | **`planDays` e `savedAt` ganham par de plural / singular só onde o português muda** | `planDays` vira `_one`/`_other` (`'{{count}} dia'` / `'{{count}} dias'`) — são os únicos dois pares plurais do catálogo hoje, e a lista de sufixos permitidos é **fechada** em `['_one','_other']` por `catalogs.test.ts`. `savedAt` não pluraliza |
| **H** | **Nenhuma tela é tocada.** Nenhum `.tsx` no diff | Medido: não existe guarda que exija consumidor para chave de catálogo (varri `__tests__` de `shared`, `app` e `ui`). As chaves nascem aqui e ganham tela nas 42–48. ⚠️ **Isto também significa que nada prova que a frase aparece — e é por isso que a decisão F existe** |

---

## O mapa: as 17 chaves e os 2 valores

| § A.9 | Chave nova | Valor |
| --- | --- | --- |
| `dayOfPlan` | `pages.book.plan.dayOfPlan` | `'Dia {{number}} de {{total}}'` |
| `theMarks` | `pages.book.marks.heading` | `'As marcas'` |
| `presenceLegendRead` | `pages.book.marks.read` | `'Leu neste dia'` |
| `presenceLegendWrote` | `pages.book.marks.wrote` | `'Leu e escreveu'` |
| `presenceHint` | `pages.book.marks.hint` | `'Cheio = escreveu'` |
| `inThisBook` | `pages.book.inBook.heading` | `'Neste livro'` |
| `clubNotesCount` | `pages.book.inBook.notes` | `'Anotações do clube'` |
| `highlightsCount` | `pages.book.inBook.highlights` | `'Grifos'` |
| `savedAt` | `pages.dayNote.save.savedAt` | `'Salvo {{time}}'` |
| `highlightsOfReading` | `pages.dayNote.highlights.heading` | `'Grifos desta leitura'` |
| `savedAt` | `pages.freeNote.save.savedAt` | `'Salvo {{time}}'` |
| `archivePreview` | `pages.freeNote.preview.heading` | `'Como vai aparecer no acervo'` |
| `draftSaved` | `pages.highlightForm.save.draft` | `'Rascunho guardado'` |
| `archivePreview` | `pages.highlightForm.preview.heading` | `'Como vai aparecer no acervo'` |
| `refine` | `pages.acervo.filters.refine` | `'Refinar'` |
| `planDays` | `pages.bookForm.plan.days_one` / `_other` | `'{{count}} dia'` / `'{{count}} dias'` |
| `dayHasNote` | `pages.bookForm.plan.dayWithNote` | `'Dia {{number}} · tem anotação'` |
| `savesItself` | `pages.settings.reminderTimeHint` | `'Salva sozinho.'` |
| `editorSlashHint` | `editor.slashHint` | `'Digite / para inserir um bloco'` |

⚠️ **`savedAt` e `archivePreview` aparecem duas vezes de propósito**, e não é violação da decisão C: `save.saved` e `archive.*` já são duplicados por tela no catálogo de hoje, porque a tela é a dona do seu indicador de salvamento. A decisão C vale para frase cujo **assunto** é de uma tela e é lida por outra — o caso do `dayOfPlan`, que vive em `pages.book.plan` e é lido também pelo Início e pela tela do dia.

⚠️ **`editor.slashHint` é a exceção ao §10 do `docs/EDITOR.md`**, que manda os rótulos internos do editor ficarem cravados em `packages/ui`. Esta frase **não** é rótulo interno: ela é renderizada pela TELA, no rodapé da coluna de leitura (`DiaDesktop`, `NovaAnotacaoDesktop`), e tela nenhuma tem texto solto. Escreva isso ao lado da chave.

**Os dois valores trocados:** `pages.acervo.archive.cancel` e `pages.freeNote.archive.cancel`, de `'Cancelar'` para `'Deixar como está'`.

---

## A chave que fica de fora, e por quê

`searchResultCount` "{n} resultados em todo o clube" **não entra**, e isto é uma pergunta em
aberto para o dono, não uma decisão minha.

Medido, são **duas** proibições independentes:

1. `packages/app/src/pages/__tests__/busca.test.tsx:986` — o teste
   `shows NO result count anywhere, in any state (decision G)`. É decisão de produto
   **registrada** da Tarefa 29, não acidente;
2. `COUNTER_SHAPE` não a pega (`'3 resultados'` não tem `de` entre dois números), então a
   isenção da decisão E **não a resolveria** — quem a proíbe é o teste da busca.

⚠️ **A diferença que importa:** `dayOfPlan` é *posição no plano* — onde a leitura está —, e
a isenção existe para ela. Um *contador de resultados* é outra coisa, e a decisão B do
MVP 3.5 não a cobre. Se o dono quiser a frase, a saída é apagar a decisão G do teste da
busca, com a data e o motivo; enquanto isso, a busca continua sem contagem e o canvas fica
divergente nesse ponto. **Registrado no `new-ui.md` §A.9 com riscar-e-explicar.**

---

## As regras

1. **TDD, e aqui ele é barato:** tudo é decidível sem renderizar nada. Teste primeiro,
   vermelho colado, depois o catálogo.

2. **Os invariantes de `catalogs.test.ts` continuam valendo para toda chave nova:** camelCase
   em cada segmento (`/^[a-z][A-Za-z0-9]*$/`), nenhuma folha vazia, nenhuma folha que não
   seja string, e sufixo de plural só `_one`/`_other`.
   **Mutante:** escreva `pages.book.marks.legend_read` (snake) e confirme que
   `names every key in English camelCase (rule 16)` acusa.

3. ⚠️ **A varredura anti-culpa do catálogo passa nas 17.** Rode-a e cole o verde.
   ⚠️ **E confira à mão o radical `falta`**: `'Refinar'`, `'As marcas'` e
   `'Anotações do clube'` estão limpos, mas a próxima frase que alguém escrever pode não
   estar, e o acusador é `anti-guilt.test.ts`.

4. ⚠️⚠️ **A decisão E, e ela é o coração da fatia.**
   - `COUNTER_EXEMPT_KEYS` nasce em `packages/shared/src/locales/__tests__/guilt-terms.ts`,
     ao lado do `STREAK_KEYS` e **pinada por igualdade exata** (`toEqual` sobre a lista
     ordenada), com o teste companheiro que prova que **cada chave isenta existe no
     catálogo** — os dois no molde do que o `STREAK_KEYS` já tem;
   - `expectNoGuilt()` (e as irmãs `expectNoGuiltInHtml` e
     `expectNoGuiltBesidesFormError`) passam a remover do texto as frases derivadas dessas
     chaves **antes** de rodar o `COUNTER_SHAPE`;
   - ⚠️ **a remoção é por frase exata interpolada, nunca por regex larga.** Um
     `replace(/\d+ de \d+/g, '')` isentaria todo contador do app e a guarda morreria calada.
   - **Par positivo obrigatório**, três casos: (a) `'Dia 11 de 30'` passa; (b) `'3 de 30
     dias'` plantado em outro lugar da mesma tela **continua sendo acusado**; (c) `'Dia 11
     de 30'` plantado **duas** vezes não abre buraco para um contador de verdade.
   - **Mutantes:** (i) apagar a subtração da frase isenta → (a) tem de ficar vermelho;
     (ii) trocar a subtração exata por regex larga → (b) tem de ficar vermelho;
     (iii) acrescentar uma chave a `COUNTER_EXEMPT_KEYS` → o `toEqual` tem de acusar.

5. ⚠️ **A decisão F com teste:** se nenhuma frase isenta estiver no DOM, `expectNoGuilt()`
   não pode ficar silenciosamente verde a respeito da isenção. Escolha a forma (contar as
   subtrações efetivas e exigir ≥ 1 quando a lista não está vazia, por exemplo) e **prove
   com mutante**: apague a frase isenta da tela e mostre o acusador.
   ⚠️ **Cuidado com a asserção vazia do §7.4 ao contrário**: a exigência não pode valer em
   estado de carregamento, onde nenhuma tela mostra plano nenhum. Diga por escrito em que
   estados ela vale.

6. **Os dois valores trocados têm acusador.** `'Deixar como está'` no lugar de `'Cancelar'`
   muda o nome acessível de dois botões, e `acervo.test.tsx` e `free-note.test.tsx` buscam
   por `pt.pages.*.archive.cancel` — então eles passam sem tocar. ⚠️ **Confirme que passam
   por LEREM o catálogo e não por casarem a string `'Cancelar'` cravada**; se algum tiver a
   string crava, é ele que está errado, e o conserto é ler o catálogo.

7. **Um catálogo só.** Nenhuma chave em inglês, nenhum `en.ts` de volta —
   `catalogs.test.ts` tem o teste que prova que o arquivo **não existe** no disco.

8. ⚠️ **Os documentos, com riscar-e-explicar e data:**
   - **`docs/new-ui.md` §A.9** — as quatro linhas que mudaram de destino
     (`archiveAction` e `excerptAsInBook` já existiam; `keepAsIs` é troca de valor;
     `dayHasNote` virou `dayWithNote` para não colidir com `dayHasNotes`) e
     **`searchResultCount` riscada com a pergunta aberta**;
   - **`docs/EDITOR.md` §10** — a exceção do `editor.slashHint`, dizendo por que ela não
     contraria a regra (é a tela que renderiza, não o editor).

9. **Gates, com os números medidos no fim da Tarefa 39 (2026-09-20, tudo verde):**

   | | arquivos | testes |
   | --- | --- | --- |
   | `@clube/shared` | 22 | **590** |
   | `@clube/ui` | 24 | **201** |
   | `@clube/backend` (unit) | 85 | **1975** |
   | `@clube/app` | 35 | **855** |

   `pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` ·
   `pnpm --filter @clube/app build`.
   Build: entrada **433.876 B** (teto 450.000) · CSS **27.239 B** · `index.html` **1.638 B** ·
   precache **26 / 1176,07 KiB** · editor **452.818 B**.
   ⚠️ **O chunk de entrada VAI subir**, porque o catálogo embarca no PWA. Cole o número e
   diga quanto cada bloco de chaves custou. Se passar de 450.000, **pare** — o teto é decisão
   do dono.

10. **Nenhuma migration, nenhum endpoint, nenhum schema, nenhuma tela.** Se parecer preciso,
    **pare**.

---

## Definição de pronto

- [x] As 17 chaves novas no `pt.ts`, nos namespaces do mapa, com `{{…}}` e nome de
      placeholder em inglês.
- [x] `archiveAction` e `excerptAsInBook` **reusadas**, sem chave gêmea — provado por
      `grep` do valor no catálogo (uma ocorrência por dono legítimo, nenhuma nova).
- [x] `pages.acervo.archive.cancel` e `pages.freeNote.archive.cancel` = `'Deixar como está'`,
      e os testes das duas telas passam **por lerem o catálogo**.
- [x] `dayWithNote` não colide com `dayHasNotes`, e as duas frases estão no arquivo dizendo
      coisas diferentes.
- [x] `COUNTER_EXEMPT_KEYS` pinada por igualdade exata, com o teste de existência das chaves.
- [x] `expectNoGuilt()` subtrai a frase isenta **por frase exata**, e os três casos do par
      positivo passam.
- [x] Os três mutantes da regra 4 e o da regra 5 acusaram, com número e nome.
- [x] `searchResultCount` **fora**, com a pergunta registrada no `new-ui.md`.
- [x] `EDITOR.md` §10 com a exceção do `slashHint` escrita.
- [x] Nenhum `.tsx` no diff — ⚠️ **e o método de prova da linha original não funciona nesta
      árvore**: a Tarefa 39 não foi commitada, então `git diff --name-only` lista 6 `.tsx`
      dela e o próximo revisor reprovaria a fatia seguindo a spec ao pé da letra. A prova que
      vale aqui é o **mtime** (os `.tsx` do `git diff` são todos de 2026-09-20 16:12–16:13; os
      arquivos desta fatia, de 2026-09-21). Quando a 39 for commitada, o `git diff` volta a
      ser o método certo. ⚠️ **Uma exceção autorizada pelo dono na auditoria:**
      `packages/ui/src/components/RichEditor.tsx` — uma linha de **comentário** com um nome de
      chave que nunca existiu (item A2 abaixo). É a terceira exceção documentada à regra, e as
      duas primeiras foram `sheet.tsx` e `styles.ts`, na Tarefa 39.
- [x] Gates verdes, com o chunk de entrada antes e depois e o custo do catálogo.
- [x] Varredura de caracteres invisíveis sobre os arquivos do diff, **provando antes que ela
      morde** com um soft hyphen e um NBSP plantados.

---

## Notas de reconciliação (2026-09-21, medidas na execução)

> Esta seção **não reescreve nada acima**. Ela registra o que foi **medido** ao executar,
> nos pontos em que a spec descrevia outra coisa. Molde: a seção equivalente da Tarefa 39.

### 1. `pages.highlightForm.save.draft` é IMPOSSÍVEL, e a chave virou `draftSaved`

O mapa manda `draftSaved` para `pages.highlightForm.save.draft`. **Medido:**
`pages.highlightForm.save` já existe e é uma **string** — o rótulo do botão Salvar, lido por
`highlight-form.tsx:610` e por **14** asserções de `highlight-form.test.tsx` (contadas:
`grep -c "pt.pages.highlightForm.save"`; a linha de produção é exata). Transformá-la em
objeto para abrigar `draft` faria `t('pages.highlightForm.save')` devolver a chave crua na
tela, e o conserto exigiria editar a tela — o que a decisão H e a proibição de `.tsx` no diff
vetam na mesma linha.

Entregue como `pages.highlightForm.draftSaved`, plana, com o nome do §A.9. ⚠️ **E a forma
plana é a CONSISTENTE ali, não um consolo:** aquele formulário nunca teve grupo `save.*` —
o vocabulário de gravação dele é plano (`create`, `save`, `failed`) porque ele grava por
BOTÃO. Quem tem `save: { … }` são as duas telas que salvam sozinhas (a do dia e a avulsa), e
é lá que `savedAt` entrou.

### 2. São **20 folhas** no arquivo para as 17 chaves do §A.9 — e um par de plural, não dois

O cabeçalho da spec diz "17 chaves novas (duas delas com par de plural)". **Contado:**

| conta | quanto | o que é |
| --- | --- | --- |
| nomes do §A.9 | **17** | é o número da spec, e ele está certo |
| linhas do mapa | **19** | `savedAt` e `archivePreview` aparecem em DOIS namespaces cada |
| folhas no `pt.ts` | **20** | as 19 acima, com `days` virando `days_one` + `days_other` |

⚠️ **Par de plural é UM, não dois**, e a própria decisão G diz isso na frase seguinte
(*"`savedAt` não pluraliza"*). O "duas delas" do cabeçalho não tem par no arquivo.

⚠️ **E a decisão G erra a outra metade:** ela afirma que `days_one`/`days_other` "são os
únicos dois pares plurais do catálogo hoje". **Medido, o catálogo já tinha dois pares antes
desta fatia** — `pages.home.streak.days_one`/`_other` e
`notifications.readingReminder.streakBody_one`/`_other`. Com o de agora são **três**. O que
continua verdadeiro, e é o que importa para a regra 2, é que a lista de sufixos aceitos é
fechada em `_one`/`_other` por `catalogs.test.ts`.

O teste pina as **20 folhas**, porque é folha que o `t()` recebe e é folha que nasce no ramo
errado sem o `tsc` reclamar.

### 3. A decisão F não pode morar dentro do `expectNoGuilt()`, e por quê

A regra 5 pede que a exigência de "≥ 1 subtração efetiva" não valha em estado de carregamento.
**Medido, o corte é maior que isso:** pela decisão H **nenhuma tela** renderiza `dayOfPlan`
nesta fatia — as chaves nascem sem consumidor. Uma exigência dentro do `expectNoGuilt()`
deixaria **todas** as chamadas de hoje vermelhas de uma vez.

⚠️ **O número, medido — e a primeira versão desta nota escreveu `855`, que é outra coisa:**
`855` era a contagem de **testes** do `@clube/app`. As chamadas de `expectNoGuilt()` em teste
de tela são **247**, em 8 arquivos (`grep -rn "expectNoGuilt();" packages/app/src | grep -v
anti-guilt-dom | wc -l`: acervo 51 · book 45 · day-note 46 · home 42 · book-form 21 · busca 18
· free-note 14 · highlight-form 10). Há mais 6 menções em prosa de docblock e 1 chamada dentro
da própria variante. A conclusão não muda — a exigência não cabe dentro do `expectNoGuilt()`
—, mas o número errado foi copiado para o `docs/BACKLOG.md`, que é o arquivo de maior
precedência do projeto, e é por isso que ele conta.

Entregue como variante, no molde do `expectNoGuiltBesidesFormError` que a suíte já usa:
`expectNoGuiltWithPlanPosition()` mede tudo o que o `expectNoGuilt()` mede **e** exige a
subtração. **Os estados em que ela vale estão escritos no docblock dela:** só onde a tela
mostra a posição no plano — a tela do livro com plano carregado, a tela do dia e o bloco de
hoje no Início (Tarefas 42–45). Em carregamento, em erro, com plano vazio e em toda tela que
não fala do plano, quem se chama é o `expectNoGuilt()`.

⚠️ **O que esta forma NÃO garante, registrado:** que alguma tela chame a variante. Enquanto a
Tarefa 44 não renderizar o sumário, quem exercita a isenção é o par positivo de
`anti-guilt-dom.test.ts`. A guarda que faltaria — "a chave isenta tem consumidor" — é a mesma
classe do `refuses the FIRST USE of text-faint` da Tarefa 39, ao contrário: ela só pode nascer
depois do primeiro uso, e nascer hoje seria nascer vermelha.

### 4. O número do chunk do editor na regra 9 mistura duas unidades

A regra 9 diz "editor **452.818 B**". **Medido nesta fatia, no mesmo arquivo e sem uma linha
de editor tocada:** `ls` dá **453.606 B**, e o relatório do Vite dá **452,82 kB**. Os dois são
o mesmo arquivo: 452,82 é a leitura em kB do Vite, transcrita como se fosse byte. Os outros
três números da regra 9 (`CSS 27.239`, `index.html 1.638`, entrada `433.876`) batem com o `ls`
exatamente, então a lista **parece** estar em bytes e é a linha do editor que está fora.

⚠️ **A inferência foi abrandada na rodada de auditoria, porque ela era mais do que eu medi.**
Eu escrevi "logo a unidade da lista é byte". O que está medido é que três dos quatro números
batem com o `ls`; o que NÃO está medido é como o Vite chega ao dele. Ele não imprime
bytes/1000 para chunk nenhum (434,19 kB para 434.525 B; 452,82 kB para 453.606 B), o que
sugere comprimento em UTF-16, mas não conferi o código do relatório. A conclusão prática
continua a mesma: compare sempre pelo `ls`, e a linha do editor da regra 9 está numa unidade
diferente das outras três.

`453.606 B` é o valor de hoje e o da Tarefa 39 — o editor não mudou, o que era o esperado.

### 5. Dois comentários de produção ficaram falsos, e não foram consertados

`acervo.tsx:1069` e `free-note.tsx:786` explicam o diálogo de arquivar dizendo *o "Cancelar"*,
e o botão passou a dizer "Deixar como está". Os dois arquivos são `.tsx`, e a proibição de
`.tsx` no diff é explícita nesta fatia. **Dívida registrada para as Tarefas 46 e 47**, que são
quem reescreve as duas telas. O mesmo vale para os comentários gêmeos em `acervo.test.tsx:1333`
e `free-note.test.tsx:876`. ⚠️ Nenhum deles é asserção: as quatro buscas do botão passam por
`pt.pages.*.archive.cancel` (conferido por leitura), e é por isso que a troca de valor não
quebrou nada — e também por isso que ela não teria acusador nenhum sem o teste novo de
`catalogs.test.ts`.

### 6. `docs/EDITOR.md` §10 cita `editor.placeholder`, que não existe

Achado ao escrever a exceção do `slashHint`: a seção diz
`placeholder={t('editor.placeholder')}`, e **o catálogo não tem essa chave** — as duas telas
usam `pages.dayNote.placeholder` e `pages.freeNote.placeholder`.

⚠️ **A auditoria mostrou que esta nota era pequena em dois sentidos, e os dois estão
consertados na seção seguinte:** o nome fantasma estava também num arquivo de **produção**
(`RichEditor.tsx`), e a exceção que eu escrevi **se apoiava nele** em vez de citar as chaves
reais — ou seja, a nota dizia ter contornado um defeito que ela propagava.

---

## Notas de reconciliação — rodada de correção da auditoria (2026-09-21)

> Um revisor independente auditou a fatia: **1 bloqueador, 5 altos, 5 médios, 4 baixos**, e
> **quatro afirmações minhas rotuladas "medido" caíram** — uma delas já copiada para o
> `docs/BACKLOG.md`. Mesma regra das notas 1 a 6: **nada acima foi reescrito**, exceto os quatro
> números errados, que foram corrigidos no lugar com a medição ao lado.

### 7. O bloqueador: dois docblocks, e a lista do ADR 0010 sem nenhum

Escrevi o docblock da isenção nova **abaixo** do que eu queria emendar. Resultado:
`COUNTER_EXEMPT_KEYS` herdou **os dois** e `STREAK_KEYS` ficou **sem nenhum** — a isenção que o
dono reconfirmou contra o §1 do plano perdeu a justificativa de ao lado dela. As duas palavras
"acima" apontaram para o lado errado do arquivo.

Consertado invertendo a **ordem das declarações** (`STREAK_KEYS` antes, `COUNTER_EXEMPT_KEYS`
depois), como a auditoria propôs. ⚠️ **Mas a proposta não fechava sozinha, e isto é medição:**
com a inversão, a frase do `STREAK_KEYS` que diz "o `COUNTER_EXEMPT_KEYS` **acima**" continua
falsa — a outra lista passa a ficar 55 linhas **abaixo**. As duas palavras não voltam a ser
verdade só com a troca de ordem; uma delas teve de virar "logo abaixo".

**Guarda nova, porque nada acusava:** `anti-guilt.test.ts › ⚠️ keeps each exempt list glued to
ITS docblock`. Duas propriedades — toda lista exportada tem docblock imediatamente acima, e não
existem dois docblocks empilhados. A segunda é a que pega este defeito exato.

### 8. A isenção vivia em quatro funções e o par positivo cobria duas

**Medido pelo revisor:** trocar a subtração exata pela regex larga **dentro** do
`expectNoGuiltInHtml` ou do `expectNoGuiltBesidesFormError` dava **zero acusadores em 861
testes**, nas duas. O atalho que o docblock do arquivo chama de "a pior das duas falhas" tinha
dois caminhos abertos — e nenhum deles é periférico: a segunda função é a varredura de **todo
estado de campo inválido** da avulsa e do formulário de livro, e a primeira é a do **primeiro
frame** (§7.10).

Consertado com o caso (b) pelos dois caminhos que faltavam, cada um com o lado negativo ao lado
(senão a linha ficaria verde com uma função que sempre lança).

### 9. `(?!\d)` **não** conserta o `\d+` guloso — medido, e a auditoria errou aqui

A auditoria pediu `(?!\d)` ao fim do padrão derivado e afirmou que "o revisor mediu que com
isso o texto colado passa a acusar". **Medido nesta rodada, nas quatro variantes:**

| padrão | casa em `"Dia 11 de 303 de 30 dias"` | resíduo ainda acusa? |
| --- | --- | --- |
| `/Dia \d+ de \d+/` | `Dia 11 de 303` | não |
| `/Dia \d+ de \d+(?!\d)/` | `Dia 11 de 303` | não |
| `/Dia \d+ de \d+?(?!\d)/` | `Dia 11 de 303` | não |
| `/(?<!\d)Dia \d+ de \d+(?!\d)/` | `Dia 11 de 303` | não |

A razão é simples: `\d+` guloso **já** para no primeiro não-dígito, então `(?!\d)` é sempre
verdadeiro e o `303` continua dentro do casamento. **Nada foi acrescentado ao padrão de
propósito** — uma asserção que não muda o casamento pareceria o conserto sem ser, e o próximo
leitor a trataria como resolvido.

O que foi feito, e fecha o buraco por outro lado:

1. **um caso (b) no MESMO elemento** (`<p>Dia 11 de 30 — 3 de 30 dias</p>`), onde não há
   colagem possível e o contador continua acusado. A propriedade deixa de depender da
   superfície;
2. **o pino da linha por elemento** do `readableText()`, que era a coincidência não pinada:
   `⚠️ pins the per-element line of readableText(), which case (b) leans on`. Se alguém
   "simplificar" o harness para devolver só o `body.textContent`, fica vermelho no arquivo que
   depende disso;
3. **o buraco residual escrito no docblock da origem**: a colagem dígito|dígito entre dois
   elementos ainda engole um contador que venha IMEDIATAMENTE depois da frase isenta. Está lá
   com a medição, para ninguém o descobrir do zero nem o "consertar" com regex larga.

### 10. A guarda da gêmea não guardava a propriedade que invocava

**Medido pelo revisor:** três folhas novas carregando valores que ESTA fatia criou (`As marcas`,
`Refinar`, `Como vai aparecer no acervo`) passavam com **zero acusadores em 1.459 testes**. O
nome do teste prometia "não cresça uma gêmea"; o corpo media duas strings. E a propriedade
invocada já era falsa **28 vezes** no catálogo — duas delas criadas por esta fatia.

Substituída por `⚠️ pins EVERY repeated phrase of the catalog`, que pina os **28 grupos** por
igualdade exata. A unicidade do `quoteHint` passa a ser guardada pela AUSÊNCIA dele no mapa, o
que também tira o defeito oposto: um reword legítimo na Tarefa 47 não fica mais vermelho por um
motivo que não tem nada a ver com gêmeas.

⚠️ **E, olhando os 28 um a um, um deles é DEFEITO e não convenção:** `Alguém do clube` em três
caminhos (`pages.acervo.item.author.other`, `pages.dayNote.others.author`,
`pages.freeNote.author`) é UM conceito com três chaves — e o próprio catálogo registra a regra
contrária no bloco da busca, que **reusa** `pages.acervo.item.author.*` "pela lição nº 3 do MVP
1". **A Tarefa 42 é quem resolve o nome do autor nessas telas**, e quando ela reduzir as três a
uma o teste fica vermelho: a saída é APAGAR a linha, nunca crescê-la. Está escrito dentro do
teste para o próximo agente não pinar o defeito de novo. Outros dois merecem leitura e
continuam legítimos: `A leitura de hoje` (cruza mídia — seção da tela × título do push) e
`Ver o acervo do livro` (dois botões, duas telas, mesmo destino).

### 11. Três guardas que faltavam, e as três eram do que esta fatia escreveu

| buraco | medido | guarda nova |
| --- | --- | --- |
| `days_one` idêntico ao `_other` (o app diria "1 dias") | 0 acusadores em 1.459 | `⚠️ keeps _one and _other saying DIFFERENT things` — **genérica**, e por isso passa a guardar também os dois pares que o catálogo já tinha |
| `{{time}` desbalanceado (o i18next renderiza literal) | 0 acusadores em 1.459 | a contagem de `{` × `}` por valor, dentro do teste de placeholder |
| docblock órfão em `guilt-terms.ts` | 0 acusadores | a guarda da nota 7 |

⚠️ **A guarda do plural é genérica de propósito.** Uma linha sobre
`bookForm.plan.days` protegeria o que acabou de ser escrito e deixaria exposto o que já estava
lá — §7.9 ao contrário.

### 12. O sobrevivente equivalente, com a prova de inalcançabilidade

Rotear também o **vocabulário** pela subtração (varrer os `GUILT_TERMS` no texto já subtraído)
sobrevive com **zero acusadores**. É equivalente **hoje**, e a prova é de inalcançabilidade: os
literais do único padrão isento são `Dia ` e ` de `, e **nenhum** dos 12 `GUILT_TERMS` é
substring de nenhum dos dois — então a subtração não pode apagar termo nenhum.

⚠️ **Deixa de ser equivalente no dia em que a lista de chaves isentas crescer:** uma frase
isenta que contenha um radical passaria a esconder a palavra também. Por isso a ordem das
linhas do `expectNoGuilt()` é deliberada — vocabulário e cor sobre o texto **inteiro**,
subtração só na medida do formato — e está escrita lá.

### 13. `expectNoGuiltWithPlanPosition()` é código morto até a Tarefa 44, e agora as duas
entradas do `BACKLOG.md` dizem isso

Seis referências, todas no par positivo e na definição; zero menções nas entradas 42–45. Quando
a 44 renderizar o sumário, quem a escrever chamará `expectNoGuilt()` por hábito — é o que as
**247** chamadas de hoje fazem — e a decisão F morre sem uma linha vermelha. As entradas **44**
e **45** do `BACKLOG.md` ganharam a cláusula.

⚠️ Uma cláusula em prosa não é guarda, e isto fica dito: a guarda de verdade ("a chave isenta
tem consumidor") só pode nascer depois do primeiro uso.
