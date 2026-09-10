# Aceite de MVP — o roteiro e as perguntas

> **Este arquivo é do dono.** Todo fim de MVP passa por aqui: ele roda o roteiro, responde as
> perguntas, escreve as considerações, e só então o MVP fecha e o próximo começa.
>
> O `docs/COMO-TESTAR.md` ensina a **rodar e testar** (subir o projeto, entrar, provocar cada
> tela). Este aqui é o **aceite**: o que precisa estar funcionando para o MVP ser dado por
> pronto, e o que só o dono pode decidir. Um explica o como; o outro pergunta o quê.

## O ritual, em quatro passos

1. **A IA prepara** a seção do MVP: o roteiro de aceite (o que testar, na ordem) e as perguntas
   abertas, cada uma com contexto, alternativas e uma recomendação.
2. **O dono testa** e marca o roteiro. O que falhar vira tarefa antes do fechamento.
3. **O dono responde** as perguntas e escreve as considerações — texto livre, sem formato.
4. **Fecha-se o MVP**: as respostas viram decisões fechadas no `docs/BACKLOG.md` (ou ADR,
   quando mudam uma decisão anterior), e o backlog do MVP seguinte é detalhado a partir delas.

**Regra que este arquivo respeita:** nada aqui é cópia de outro documento. O roteiro **aponta**
para as seções do `COMO-TESTAR.md` e do `EDITOR.md`; as perguntas moram só aqui. Duas cópias
divergem na primeira correção — foi o que aconteceu duas vezes no MVP 1.

---

# MVP 1 — em aceite

**Estado:** as 21 tarefas estão entregues e verdes (285 · 175 · 949 · 424 testes). Falta o
aceite do dono.

**A definição, do `docs/BACKLOG.md`:** *"Eu crio um clube, mando um link de convite, ela entra e
define a senha dela. Eu cadastro o livro do mês com o plano de leitura dia por dia. Nós dois
abrimos o app no celular, vemos a leitura de hoje com o tema já definido, e escrevemos nossa
anotação no editor — com a barra auxiliar, o menu `/` e os grifos de cor funcionando, e salvando
sozinho mesmo com a internet ruim. Eu consigo criar quantas anotações avulsas eu quiser, com
título e referência minha. E eu vejo o que ela escreveu, com o filtro."*

## A. O roteiro de aceite

Marque o que funcionou. O que falhar, escreva **o que você viu**, não o que acha que é.

### A.1 — O circuito completo, no celular (o teste que decide o MVP)

Abra pelo IP da máquina (`pnpm dev:app -- --host`) e faça **nesta ordem**:

- [ ] Entro com meu e-mail e senha.
- [ ] Cadastro o livro do mês **pela tela**, com o gerador de dias → `COMO-TESTAR.md` §5.1.
- [ ] A home mostra o clube, a estante e o **atalho da leitura de hoje** com o tema do dia.
- [ ] Toco no atalho, o editor abre, escrevo, **paro** — em 1,5 s o status vira "salvando" e
      depois "salvo".
- [ ] **Recarrego a página e o texto volta exatamente como estava.**
- [ ] Ela escreve no mesmo dia; eu recarrego e a anotação dela aparece ao lado, **só leitura**,
      sem botão de editar.
- [ ] Crio uma **anotação avulsa** com título e referência minha, e ela aparece na aba
      Anotações do livro.
- [ ] O filtro **Tudo · Minhas · De outras pessoas** muda a lista.

> Os três últimos itens são o produto. Se funcionarem no celular, o app faz o que foi feito
> para fazer.

### A.2 — O editor, no celular

A checklist **§14 do `docs/EDITOR.md`**, item por item. Ela é o teste mais importante do
projeto, e o primeiro item decide todos os outros:

- [ ] **O teclado NÃO fecha** ao apertar qualquer botão da barra, do bubble menu ou das cores.
- [ ] Os outros 9 itens da §14.

> Dois itens da §14 **não são testáveis ainda, e não contam**: colar imagem (não existe
> endpoint de upload) e `@`/`[[` (a busca de anotação é MVP 2). Eles estão desligados de
> propósito, não quebrados.

### A.3 — A escrita sem conexão

→ `COMO-TESTAR.md` §6.1.

- [ ] Escrevo com o modo avião ligado: o indicador diz que está **guardado**, sem tom de erro.
- [ ] Fecho e reabro o app **com rede**: o texto está lá e sobe sozinho.
- [ ] Não aparece anotação duplicada em lugar nenhum.

> **O que NÃO funciona ainda, e é esperado:** abrir o app **do zero** sem rede. O app é
> instalável, mas as leituras (`/me`, o livro, as notas) precisam de conexão. É a pergunta 5
> abaixo.

### A.4 — O convite

→ `COMO-TESTAR.md` §7.

- [ ] Gero o link, ela abre, define a senha dela e entra.
- [ ] Ela vê o mesmo clube, o mesmo livro e o mesmo plano.
- [ ] Ela **não** vê os botões de cadastrar/corrigir livro (ela é `MEMBER`).

### A.5 — O que eu preciso que você olhe (não é bug, é gosto)

- [ ] **Contraste no celular:** o passo de cor entre o fundo da página e o cartão do livro está
      perceptível? Eu aumentei esse passo (o claro estava 5× mais fraco que o escuro), e a tela
      do livro é uma lista de 30 cartões — é onde isso pesa.
- [ ] **Tema escuro no celular:** é o modo de uso provável (escrever na cama). Confortável, ou
      algo está claro demais?
- [ ] **Qualquer frase estranha, errada ou em inglês.** Em especial o que parecer mensagem de
      programador (`Bad Request`, `Unexpected…`, uma chave como `errors.algo`). **Isso é bug** —
      me diga o texto exato e a tela.
- [ ] **A ordem da estante** (mês mais recente primeiro) faz sentido para você?

---

## B. As perguntas — o que só você decide

Responda na linha **Resposta:** de cada uma. "Concordo" já basta quando a recomendação servir.

### 1. O filtro por pessoa e o nome de quem escreveu

**Como está:** o filtro diz `Tudo · Minhas · De outras pessoas`, e a anotação da outra pessoa
aparece como "Alguém do clube" — com uma cor derivada do id, que a distingue mas não a nomeia.

**Por quê:** nenhuma rota do backend lista os membros de um clube com nome. O `/me` só traz os
**meus** clubes; as notas trazem `userId`, não nome.

**O que muda:** uma fatia curta de backend (`GET /clubs/:clubId/members`) resolve as **duas**
coisas de uma vez — o chip vira `de <nome>` e o avatar passa a dizer quem escreveu.

**Recomendação:** fazer no início do MVP 2. Num clube de duas pessoas o filtro atual é
informação completa (o complemento de "minhas" é exatamente "dela"), mas o **nome** no avatar
vale por si, e vocês vão querer isso antes de convidar uma terceira pessoa.

**Resposta:**

### 2. Vocês vão continuar em duas pessoas, ou entra mais gente?

**Por que eu pergunto:** três decisões do MVP 1 assumem duas pessoas — o filtro acima, o
"você × a outra pessoa" no lugar do nome, e a ausência de paginação nas listas. Nenhuma delas
quebra com mais gente, mas duas ficam ruins.

**Recomendação:** se entra mais gente no MVP 2, a pergunta 1 deixa de ser "vale a pena" e passa
a ser obrigatória.

**Resposta:**

### 3. A anotação do dia arquivada

**Como está:** se você arquivar a anotação de um dia e abrir aquele dia de novo, o editor
carrega o texto arquivado como rascunho — e escrever ali **desarquiva de fato**, sem registro
nenhum de que isso aconteceu.

**As alternativas:** (a) deixar como está — nada se perde e o app não faz cerimônia; (b) abrir
vazio e tratar a arquivada como passado; (c) desarquivar explicitamente, com registro (é MVP 4).

**Recomendação:** (a). O texto é seu, e recuperá-lo em silêncio é mais gentil do que escondê-lo.
Mas é o seu texto, então é a sua escolha.

**Resposta:**

### 4. Arquivar livro não tem tela

**Como está:** dá para arquivar um livro pela API, não pela interface. Um livro cadastrado
errado se **corrige** (a tela de edição existe), mas um livro que você quer tirar da estante
não sai.

**Recomendação:** deixar para o MVP 2, junto de uma tela de administração do clube. Só suba de
prioridade se você cadastrar um livro duplicado e ele te incomodar na estante.

**Resposta:**

### 5. Abrir o app sem rede (cache de leitura)

**Como está:** a **escrita** sobrevive à falta de rede (MVP 1 fechou isso). A **leitura** não:
abrir o app do zero no metrô mostra falha de rede com botão de repetir.

**O que falta:** guardar localmente a última resposta de `/me`, do livro e das notas — é uma
fatia de tamanho médio, e é o que faz o app parecer nativo.

**Recomendação:** depende de vocês. Se a leitura acontece em transporte público ou em lugar com
sinal ruim, isto é a coisa mais valiosa do MVP 2, à frente dos grifos. Se vocês leem em casa,
pode esperar.

**Resposta:**

### 6. Criar anotação avulsa sem rede

**Como está:** editar a anotação **do dia** funciona offline. **Criar** uma avulsa não — a tela
guarda o rascunho, mas exige conexão para criar.

**Por quê:** criar não é idempotente. Reenviar às cegas criaria a mesma anotação duas vezes, e o
backend não tem chave de idempotência (seria uma fatia de backend, não de tela).

**Recomendação:** deixar como está até acontecer com você de verdade. Se acontecer, me diga —
a correção é conhecida.

**Resposta:**

### 7. Manter o inglês?

**Como está:** todo texto existe em `pt` e `en`, e o compilador reprova uma chave que falte num
dos dois.

**O custo:** cada fatia escreve tudo duas vezes. Não é grande, mas é constante.

**Recomendação:** manter. O custo é pequeno e o segundo catálogo é o que impede texto solto na
tela — se a frase não existe em dois lugares, ela não passou pelo `t()`. Só tire se for
incomodar.

**Resposta:**

### 8. Alguma coisa que você esperava e não está aqui?

Esta é a pergunta mais importante do aceite. O MVP 1 foi executado a partir de um plano escrito
antes de existir tela nenhuma — depois de usar o app de verdade, o que está faltando?

**Resposta:**

---

## C. Considerações do dono

> Texto livre. O que te incomodou, o que te surpreendeu, o que você mudaria.

_(a preencher)_

---

## D. Veredito

- [ ] **MVP 1 fechado** — data: ____
- [ ] Pendências que entram no MVP 2: ____

---

# MVP 2 — em aceite

**Estado:** as **nove** tarefas do MVP 2 estão entregues e verdes — 22, 23, 24, 25, 26, **26a**
(inserida), 27, 28 e 29. Contagens: **413** em `shared` · **195** em `ui` · **1307** no
`backend` unitários · **600** no `app`, mais **386** de integração. Falta o seu aceite.

**A definição, do `docs/BACKLOG.md`:** *"Eu registro tudo que grifei — trecho, cor, página e meu
comentário — e vejo a coleção de grifos do livro filtrada por cor e por pessoa. E em qualquer
listagem eu filtro por pessoa, por tipo de anotação (do dia × avulsa), por capítulo e por
texto."*

⚠️ **Dois pedaços dessa frase NÃO estão cumpridos, e estão medidos** — são as perguntas **3** e
**4** abaixo. Eu não os escondi na entrega e não os implementei por conta própria: são decisão
sua.

## O que mudou desde o MVP 1, em uma linha cada

- **O grifo existe** — entidade própria, com tabela, rotas e tela: trecho, cor da caneta,
  página e comentário no mesmo editor.
- **O acervo do livro existe** — anotações e grifos numa lista só, filtrável por pessoa, tipo,
  leitura e cor. E a tela do livro voltou a ser **só o plano**.
- **O filtro diz o NOME** (`Tudo · Minhas · De Maria`), com avatar — era a **pergunta 1 do
  MVP 1**, e ela está fechada.
- **A busca por texto existe**, no clube inteiro, em qualquer livro.

---

## A. O roteiro de aceite

Marque o que funcionou. O que falhar, escreva **o que você viu**, não o que acha que é.

### A.1 — O circuito do MVP 2, no celular (o teste que decide)

Abra pelo IP da máquina (`pnpm dev:app -- --host`) e faça **nesta ordem**:

- [ ] Pego o livro que estou lendo de papel, grifo uma frase, e **registro** no app: trecho,
      cor, página e um comentário → `COMO-TESTAR.md` §5.2.
- [ ] O grifo aparece no **acervo do livro**, com a cor e a página → §6.2.
- [ ] Registro um grifo **sem comentário** e ele fica coerente na lista (sem área de comentário
      vazia).
- [ ] Ela registra um grifo dela; eu recarrego e vejo **o nome dela** na linha.
- [ ] No acervo, o filtro **`De <nome dela>`** mostra só o que ela escreveu — anotação **e**
      grifo.
- [ ] Filtro por **cor** funciona, e o grupo de cor **desaparece** quando eu escolho "Do dia"
      ou "Avulsa".
- [ ] Filtro por **leitura** mostra só as anotações daquele dia — e as avulsas e os grifos
      **saem**, porque não pertencem a um dia.
- [ ] **Busco uma palavra** que eu escrevi num grifo de outro livro, e a busca acha, dizendo de
      qual livro é → §6.3.

> Os quatro últimos itens são o produto do MVP 2. Se funcionarem no celular, a fase fez o que
> foi feita para fazer.

### A.2 — O que eu preciso que você provoque (é onde eu erraria)

- [ ] **Acervo vazio × filtro sem resultado.** As duas frases têm de ser **diferentes**. Se
      forem iguais, é bug.
- [ ] **Trocar o tipo com uma cor escolhida** — a cor tem de ser descartada, não ficar um
      recorte invisível.
- [ ] **Arquivar um grifo:** pede confirmação, cancelar **não** faz nada, confirmar tira da
      lista e ele **não volta** ao recarregar.
- [ ] **O grifo dela** não tem botão de corrigir nem de arquivar. Em lugar nenhum.
- [ ] **Buscar uma letra só** — nada deve ser pedido ao servidor (não há como você ver isso na
      tela; se a busca parecer "travada" com uma letra, é isso, e é de propósito).
- [ ] **Desligar a rede** no acervo e no `/busca`: erro com "tentar de novo", e repetir tem de
      **funcionar**.

### A.3 — O que eu preciso que você olhe (não é bug, é gosto)

- [ ] **As cinco cores no celular.** Elas são as mesmas do grifo do editor, de propósito. Dá
      para distinguir as cinco na lista? O nome ao lado da bolinha ajuda ou atrapalha?
- [ ] **O acervo com 30 dias de anotação + grifos.** A lista fica longa; os filtros dão conta,
      ou falta alguma coisa?
- [ ] **O seletor de leitura** (o campo com os dias do plano). Ele é um `<select>` do sistema, e
      não chips, porque 30 chips não caberiam. No seu celular ele é usável?
- [ ] **Qualquer frase estranha, errada ou em inglês.** Em especial mensagem de programador
      (`Bad Request`, `Unexpected…`, uma chave como `errors.algo`). **Isso é bug** — me diga o
      texto exato e a tela.

### A.4 — O que continua valendo do MVP 1

O roteiro do MVP 1 (seção anterior) **não** foi substituído: o editor, o autosave, a escrita sem
conexão e o convite continuam sendo o que eles eram. Se você ainda não rodou aquele roteiro,
rode-o primeiro — um defeito lá é mais grave que qualquer coisa daqui.

---

## B. As perguntas — o que só você decide

Responda na linha **Resposta:** de cada uma. "Concordo" já basta quando a recomendação servir.

### 1. A busca deve achar "coracao" quando você escreveu "coração"?

**Como está:** **não acha.** A busca ignora **maiúscula** e respeita **acento**: `coracao` não
encontra "coração", e o contrário também não.

**Por quê:** é a decisão fechada do MVP 2 ("busca é `ILIKE` no `plainText`/`commentText`"), e
`ILIKE` do Postgres é exatamente assim. Está pinado por teste **contra o banco** desde a
Tarefa 11, e a 29 acrescentou o mesmo pino no lado do grifo, nas duas colunas. Confirmado por
consulta na auditoria: `'coração' ILIKE '%coracao%'` é **falso**; `'CORAÇÃO' ILIKE '%coração%'`
é **verdadeiro**.

**O que muda:** ligar a extensão `unaccent` do Postgres. São três coisas, e nenhuma é pequena:
um comando de banco que o Prisma **não** gera sozinho (e o `CLAUDE.md` proíbe SQL de migration
escrito à mão), um **índice funcional** para a busca não virar varredura de tabela, e um **ADR**,
porque muda uma decisão fechada. **É fatia própria.**

**Alternativas piores:** normalizar no cliente não funciona (o acervo do clube não está na
tela); guardar uma coluna "sem acento" espelhada resolve sem extensão, mas cria uma segunda
cópia de todo texto do clube para manter em dia em toda escrita.

**Contra mudar:** quem digita em teclado português escreve o acento naturalmente, e o teclado do
celular sugere. **A favor:** quem busca com pressa não escreve — e a busca vazia parece "não
existe" e não "escrevi diferente". Hoje a tela mitiga isso na frase do estado sem resultado,
que é honesta mas é remendo de texto.

**Recomendação:** **fatia própria no MVP 3**, se a busca virar hábito. Se você usar a busca
muito no celular, ela sobe de prioridade.

**Resposta:**

### 2. A busca de grifo deve casar o trecho grifado, ou só o comentário?

**Como está:** **casa os dois** — o trecho grifado (`quote`) **ou** o comentário. A referência
("Cap. 12") fica de fora, de propósito.

**Por quê, e é uma decisão que eu tomei no seu lugar:** a decisão fechada do MVP 2 nomeia os
campos **derivados** de cada coisa e **não menciona o trecho**. Mas o trecho **é** o conteúdo do
grifo — o ADR 0004 o chama de "o trecho grifado", e o comentário é o que você achou dele. Uma
busca de grifos que ignore o trecho **não acha a frase que você grifou**, que é o caso de uso
inteiro. Li a decisão fechada como sendo sobre o **mecanismo** (`ILIKE`, nada de vetor), não uma
lista exaustiva de campos.

**E o custo de fazer o contrário está medido:** com só o comentário, um grifo **sem comentário**
fica **inalcançável pela busca** — para sempre. A auditoria provou em dois passos: um grifo sem
comentário guarda string **vazia** (não nulo), e `'' ILIKE '%qualquer%'` é falso no Postgres. E
grifo sem comentário é caso legítimo e comum.

**Recomendação:** **manter os dois.** Se você discordar, o conserto é pequeno e localizado: uma
cláusula a remover.

**Resposta:**

### 3. ⚠️ "Em qualquer listagem eu filtro… por texto" não é verdade. Qual das duas metades você quer?

**Como está:** existem **duas** telas de listagem, e cada uma tem metade do filtro:

- o **acervo do livro** (`/books/:id/acervo`) filtra por **pessoa, tipo, leitura e cor** — e
  **não** tem campo de texto;
- a **busca** (`/busca`) filtra por **texto** no clube inteiro — e **não** tem os outros quatro.

Ou seja: as quatro dimensões e o texto **nunca coexistem** numa listagem, e a frase de aceite do
MVP 2 promete que sim.

**Por quê:** cada metade foi decidida por um motivo defensável — o acervo recorta no cliente o
que já está carregado (dois pedidos, zero por toque de chip), e a busca pergunta ao servidor
porque o acervo do **clube** não está em tela nenhuma. Juntar as duas exigiria escolher: ou a
busca ganha os quatro filtros (e passa a recortar no cliente o que o servidor já filtrou), ou o
acervo ganha um campo de texto (e aí ele filtra por texto **só naquele livro**).

**O bom da notícia:** a segunda opção ficou **barata**. O filtro `text` já existe em **todas** as
camadas dos **dois** recursos — port, fake, UseCase, repositório Prisma, borda e integração —,
e o acervo já tem o lugar para o campo. É uma fatia curta de tela.

**Recomendação:** **um campo de texto no acervo do livro**, e a busca do clube continua como
está. Motivo: "achar o que escrevemos neste livro" é o caso frequente, e "achar em qualquer
livro" é o raro — e é assim que as duas telas param de competir.

**Resposta:**

### 4. ⚠️ "Por capítulo" não existe para grifo, em lugar nenhum

**Como está:** o filtro por **leitura** (o dia do plano) alcança **só a anotação do dia**. O
grifo não pertence a um dia do plano — ele pertence a uma **página** e, se você escreveu, a uma
**referência** livre ("Cap. 12"). E **nada** filtra nem busca por essa referência: há um teste
que **pina** que a busca não a toca.

Então "os grifos do capítulo 3" não tem como ser pedido hoje.

**Por quê:** foi decisão do ADR 0004 o grifo não depender de um dia de leitura — e ela é boa (é
o que permite registrar um grifo num dia em que você não escreveu nada). O efeito colateral é
que o eixo "capítulo" existe para anotação e **não** existe para grifo, e ninguém tinha nomeado
isso até a auditoria da última fatia.

**As alternativas:**
- **(a)** deixar como está, e o capítulo do grifo continua sendo texto livre que você lê na
  linha;
- **(b)** a **busca** passar a casar a referência também — barato, mas faz uma busca por
  "capítulo" devolver o clube inteiro (foi por isso que eu a deixei de fora);
- **(c)** um filtro por **faixa de página** no acervo (`p. 40–60`) — o campo `page` já está no
  banco e a rota já aceita filtro por página exata; a faixa é aditiva;
- **(d)** o grifo ganhar vínculo opcional com o dia do plano — o ADR 0004 já registra que o
  campo seria aditivo, mas é modelo novo e migration.

**Recomendação:** **(c)**, se e quando você sentir falta. É a única que fala a língua do grifo
(página), em vez de forçar o vocabulário da anotação (dia de leitura) sobre ele.

**Resposta:**

### 5. Você quer o número de resultados na tela?

**Como está:** **não existe contador** em lugar nenhum — nem "12 anotações", nem "3 resultados".

**Por quê:** o princípio do projeto é **incentivo por presença, não por comparação** (§1 do
plano), e um número ao lado de um nome convida a comparar quem escreveu mais. Hoje existe um
**teste que proíbe** qualquer forma de contador na tela, e ele já pegou tentativas.

**O custo de não ter:** a busca traz no máximo 500 anotações e 500 grifos por consulta e **não
avisa** se cortou — sem contador, não há como dizer "mostrando 500 de muitos". Para o clube de
duas pessoas isso é cerca de **oito meses** de anotação do dia; para **grifo**, se você grifa 5
trechos por dia, é **~3 meses**. O conserto honesto não é o contador: é o **servidor** dizer que
truncou, e isso é mudança de contrato da API.

**Recomendação:** **manter sem contador.** Se você quiser o número, é uma decisão sua e eu
relaxo a guarda — mas diga explicitamente, porque hoje ela está lá de propósito.

**Resposta:**

### 6. A barra do editor está só em português. Isso conserta agora ou espera você?

**Como está:** trocar o idioma para inglês traduz o app inteiro **menos** os rótulos dos botões
do editor ("Negrito", "Citação", "Grifo amarelo") e os do menu `/`. São **33 textos** cravados
em `packages/ui`, medidos, e existe um teste que impede esse número de **crescer**.

**Por quê não consertei:** o conserto é conhecido e não é caro (o editor recebe os rótulos por
prop, como os outros componentes já fazem). Mas ele depende da **pergunta 7 do MVP 1**, que
continua sem resposta: *"manter o inglês?"*. Se a resposta for **não**, o certo é **apagar** o
segundo catálogo — e as 32 entradas novas que esse conserto criaria seriam trabalho na direção
oposta à sua decisão.

**Recomendação:** responda a pergunta 7 do MVP 1 primeiro. Se o inglês fica, esta é uma fatia
curta; se sai, o conserto é deletar.

**Resposta:**

### 7. Alguma coisa que você esperava do MVP 2 e não está aqui?

Foi a pergunta mais útil do aceite do MVP 1. Depois de usar os grifos e o acervo de verdade — o
que falta?

**Resposta:**

---

## C. As perguntas do MVP 1 que continuam sem resposta

Elas **afetaram** o MVP 2 e eu segui com o padrão conservador, sem decidir no seu lugar:

- **Pergunta 1** (filtro por pessoa e o nome de quem escreveu) — **FECHADA pelo MVP 2**: a
  Tarefa 26a criou a rota e a 27 pôs o nome no chip e no avatar.
- **Pergunta 5** (abrir o app sem rede — cache de leitura) — **continua aberta, e o MVP 2 não a
  fez.** A regra do fechamento era: se não houver resposta, não entrar. A escrita sobrevive à
  falta de rede; a leitura, não. ⚠️ **Isto é hoje a coisa mais valiosa que está de fora**, e a
  recomendação do MVP 1 continua valendo: se vocês leem em transporte público, ela vem antes de
  qualquer coisa do MVP 3.
- **Pergunta 2** (entra mais gente no clube?) — o MVP 2 assumiu **"duas hoje, mais amanhã"**:
  nada na estrutura assume duas (o filtro por pessoa é por membro, com nome), e o texto de
  interface continua simples enquanto forem duas.
- **Perguntas 3, 4, 6, 7 e 8** — sem resposta, e nenhuma bloqueou o MVP 2. A **7** virou a
  pergunta **6** desta seção.

---

## D. Considerações do dono

> Texto livre. O que te incomodou, o que te surpreendeu, o que você mudaria.

_(a preencher)_

---

## E. Veredito

- [ ] **MVP 2 fechado** — data: ____
- [ ] Pendências que entram no MVP 3: ____

---

# MVP 3 — em aceite

**Estado:** em execução. Esta seção nasce **durante** o MVP, não no fim: as perguntas são
escritas no momento em que a decisão aparece, e não depois — apontar para uma pergunta que
ainda não existe foi um achado MÉDIO da última fatia do MVP 2, e o alvo era a própria IA.
O roteiro de aceite e o veredito são preenchidos no fechamento.

**A definição, do `docs/BACKLOG.md`:** *"Eu marco que li o trecho de hoje e vejo onde eu e o
clube estamos no livro. Recebo um lembrete no horário que eu escolhi — e não recebo se eu já
li. E quando ela lê, escreve ou grifa, meu celular avisa e a atividade aparece no feed da
home."*

## B. As perguntas — o que só você decide

### 1. ⚠️ Como você quer ver progresso? (a pergunta central do MVP 3)

**Por que ela existe:** o MVP 3 é o MVP de ritmo, e o projeto tem uma guarda **automática**
contra vocabulário de cobrança que roda no catálogo (`pt` **e** `en`) e no DOM de **todos** os
estados de toda tela. Ela proíbe, por regex, a forma `"12 de 30"` / `"12 of 30"` / `"12/30"` /
`"+3"` (`COUNTER_SHAPE`), e a lista `GUILT_TERMS` proíbe `falta`, `deixou`, `atras`, `penden`,
`perdeu`, `behind`, `missed`, `overdue` e — explicitamente — **`streak`**, comentado no código
como *"o placar disfarçado de incentivo"*. Ou seja: **"você leu 12 de 30 dias" é literalmente
vermelho por teste.**

A guarda **não está errada** — ela é o §1 do plano de produto (*"incentivo por presença, não
por comparação"*) e já mordeu tentativas reais no MVP 1 e no MVP 2. O que estava por decidir
era **a forma de mostrar progresso sem contador e sem comparação**.

**Como ficou (o padrão conservador, implementado):** progresso é **presença, não placar**. A
tela do livro já mostrava, em cada dia do plano, um avatar por pessoa que **escreveu** — sem
número, sem "+2" de estouro, e nada quando ninguém escreveu. O `ReadingLog` estende isso de
graça: cada dia ganha também a marca de quem **leu**, na mesma linha e com a mesma construção,
mais um toque em primeira pessoa no dia de hoje ("li hoje"). "Onde estamos" se lê varrendo a
lista com o olho — que é uma resposta **espacial**, não um número.

**E a metade estrutural, que é mais forte que a regex:** a rota de progresso **não devolve
contagem nenhuma**. Só presença por dia. Um número que não existe no contrato não pode ser
renderizado por engano. Isso importa porque foi **medido** que a guarda tem um furo: a
`COUNTER_SHAPE` pega `"12 de 30"` mas **não** pega um `"12 dias lidos"` solto, e `GUILT_TERMS`
não tem "lidos". Em vez de alargar a regex por palpite — o caminho que quase matou a guarda no
MVP 1, quando o radical `'tras'` casava dentro de "ou**tras**" e o teste passou a mandar no
produto —, o número foi tornado **inalcançável na fronteira da API**.

**As alternativas, se você quiser outra coisa:**

- **(a)** como está: marca por dia, sem agregado nenhum;
- **(b)** uma **barra sem número** por pessoa. Não tem dígito, mas põe duas pessoas na mesma
  escala — é placar sem placar, e responde "quem está na frente?" num relance;
- **(c)** **número na tela** ("12 de 30", porcentagem, contador). Isto **exige afrouxar a
  guarda anti-culpa**, e o efeito não é local: muda o MVP 3 inteiro e reabre a **pergunta 5 do
  MVP 2** (contador de resultados na busca), que hoje está respondida por "não existe contador
  em lugar nenhum".

**Recomendação:** **(a)**, e use o app por algumas semanas antes de decidir. A pergunta que
importa não é "quantos dias eu li", é "eu leio hoje?" — e a lista de dias com marca responde
essa, sem convidar ninguém a se comparar com a outra pessoa. Se depois de usar você **sentir
falta** do número, ele é aditivo: um campo na rota e uma linha na tela. Relaxar a guarda é a
parte cara, e é sua.

**Resposta:**
