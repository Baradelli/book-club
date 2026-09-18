# ADR 0004 — O grifo é uma entidade própria, não um bloco dentro da anotação

- Status: aceito
- Data: set/2026
- Fase: MVP 2 (Bloco E — Grifos), decidido no MVP 1

## Contexto

O dono grifa o livro **físico** com canetas de cores diferentes, e quer registrar no app:
o trecho grifado, a cor usada, onde está (página/capítulo) e um comentário próprio sobre
aquele trecho. Depois quer ver a coleção de grifos do livro, filtrada por cor e por pessoa.

O editor já tem grifo de texto (marca `highlight` multicolor). A pergunta é se o registro de
grifo é o mesmo mecanismo — texto marcado dentro da anotação, agregado numa tela — ou uma
coisa separada.

## Decisão

**`Highlight` é uma entidade própria**, com tabela, rotas e tela próprias:

```
Highlight { clubId, bookId, userId, quote, color, page?, reference?,
            commentDoc (ProseMirror JSON), commentText (derivado),
            status, archivedAt, createdAt, updatedAt }
```

Ela **não depende** de existir uma anotação, nem de um `ReadingPlanItem`. O comentário usa
o **mesmo editor** (`commentDoc`), com `commentText` derivado no backend, pelas mesmas
razões do `docs/adr/0001-*.md`.

O grifo do **editor** (a marca colorida no texto de uma anotação) continua existindo e é
outra coisa: é formatação dentro de um documento. Os hex das duas paletas ficam espelhados
para não parecer bug, mas os mecanismos não se cruzam.

## Alternativas consideradas

- **Grifo como texto marcado dentro da anotação, agregado por varredura do `doc`.** Zero
  tabelas novas, e o registro acontece no fluxo de escrita que já existe. Mas quebra no caso
  real: **eu quero registrar um grifo em um dia que não escrevi anotação nenhuma.** Nesse
  modelo eu seria obrigado a criar uma nota vazia só para ter onde marcar. Além disso, cor,
  página e comentário por grifo teriam de virar atributos de uma marca do ProseMirror, e
  filtrar por cor exigiria varrer o JSON de todas as notas do livro a cada consulta — O(n ·
  tamanho do doc) por leitura, sem índice possível.
- **Entidade própria com vínculo opcional a uma anotação (`noteId?`).** Mais flexível: dá
  para ancorar o grifo na nota do dia quando ele vier de lá. Mas é uma relação a mais para
  manter, com regras de cascata (o que acontece com o grifo se a nota é arquivada?) para
  ganhar uma navegação que hoje ninguém pediu. Se surgir a necessidade, o campo é aditivo —
  adicionar `noteId?` depois não quebra nada.

  > ⚠️⚠️ **CUIDADO AO CITAR ESTE PARÁGRAFO — ele já foi citado errado uma vez, e o erro
  > durou até 2026-09-18.** O `docs/ACEITE-MVP.md` (MVP 2, pergunta 4, opção **d**) usou o
  > "o campo é aditivo" daqui para justificar um vínculo do grifo com o **dia do plano**.
  > **Não é sobre isso.** Este parágrafo fala de `noteId?` — vínculo com a **anotação** —, e
  > as regras de cascata que ele levanta são as da nota.
  >
  > ⚠️ **E a diferença decide a coluna.** Para *"os grifos do capítulo 3"* a coluna certa é
  > **`planItemId?`**, direta. Passar pela anotação quebraria justamente o caso que este ADR
  > protege — *"eu quero registrar um grifo em um dia que não escrevi anotação nenhuma"* —,
  > porque grifo em dia sem nota não teria `noteId` para carregar. **O `noteId?` continua
  > não existindo, e continua sem ninguém pedindo.**
- **Grifo como um tipo de `Note` (`kind = HIGHLIGHT`).** Reaproveita tabela e rotas. Mas
  `quote`, `color` e `page` ficariam ou como colunas nulas em toda anotação, ou dentro de um
  campo `Json` sem tipo — e a tela de grifos passaria a filtrar `Note` por `kind` em toda
  query. Economia falsa: uma tabela a menos, um monte de condicional a mais.

## Emenda de 2026-09-18 — o grifo ganha `planItemId?` (Tarefa 38i)

**Pedido do dono** no fechamento das perguntas abertas (`ACEITE-MVP.md`, MVP 2, pergunta 4,
opções **c** e **d**): poder pedir "os grifos do capítulo 3".

✅ **A decisão central deste ADR sobrevive inteira, e é por um detalhe:** o campo é
**opcional**. *"O grifo não depende de um dia de leitura"* continua verdade — grifar num dia em
que você não escreveu nada continua possível, e é o caso que derrubou a alternativa "grifo como
marca dentro da anotação" lá em cima.

**O que entra:**

- coluna **`planItemId String?`** em `Highlight` — **não** `noteId?`, pelo motivo do aviso
  acima;
- **preenchimento automático e silencioso**: se existe item de plano para **hoje** naquele
  livro, o grifo nasce com ele. ⚠️ **Nenhum campo novo na tela** — o gesto de registrar grifo
  continua sendo de dois toques, que é o §1 do plano ("atrito mínimo") e foi decisão explícita
  do dono quando perguntado;
- ⚠️ **"hoje" é o dia no `Settings.timezone` da pessoa**, por `localDay`, nunca a hora do
  servidor; e o `planItemId` **não vem do corpo da requisição** — é resolvido no servidor,
  como o `userId` e o `clubId`.

**O que NÃO entra:**

- o `noteId?`. Ele continua sendo a alternativa recusada que este ADR descreve, e continua
  sem ninguém pedindo;
- ⚠️ **a CORREÇÃO do dia.** O argumento que derrubou a derivação na leitura tem duas
  pernas, e só uma foi entregue: a coluna **preserva** o passado (✅ entregue) e ela seria
  **onde caberia** uma correção no dia em que o preenchimento automático errar — grifar no
  sábado o que se leu na sexta. ⚠️ **Essa correção não existe, e hoje é impossível:** o
  `planItemId` é **write-once no nascimento**, e três coisas o pinam — o
  `editHighlightSchema` o recusa com **400**, ele está fora do `HighlightPatch` do port, e o
  único `save` de grifo do projeto é o do `createHighlight`. **É fatia própria, e ninguém
  pediu ainda.** Fica escrito no condicional de propósito: o argumento repetido no
  indicativo mandaria o próximo leitor procurar uma tela que não foi feita.

---

## Consequências

- (+) Registrar um grifo é independente de escrever anotação — o caso real funciona.
- (+) Filtrar por cor, por pessoa e por página são queries relacionais indexadas
  (`@@index([bookId, color])`, `@@index([bookId, userId])`), rápidas e simples.
- (+) O comentário do grifo ganha o editor completo de graça, sem nenhuma lógica nova.
- (+) A tela de grifos tem um modelo direto: lista de `Highlight` filtrada, sem parsear
  documento.
- (−) Uma tabela e um CRUD a mais (Tarefas 22–25).
- (−) O trecho grifado é **digitado à mão** (ou colado), não extraído do livro. É o preço de
  o livro ser físico; OCR de foto de página está registrado como fora de escopo.
- (−) Duas paletas de cor coexistem (a da marca do editor e a do `Highlight`). Mitigação:
  manter os hex espelhados e documentar em `docs/EDITOR.md` §6 que são coisas diferentes.
