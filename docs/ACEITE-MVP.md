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

**Resposta (2026-09-18): ⚠️ ESTA PERGUNTA NUNCA PRECISOU DE RESPOSTA — ela foi ENTREGUE.**
A **Tarefa 26a** criou o `GET /clubs/:clubId/members` e a **27** pôs o nome no chip e no
avatar, ainda no MVP 2 — exatamente o que a recomendação acima pedia. ⚠️ **O que falhou foi o
registro:** o §C do aceite do MVP 2 já dizia "FECHADA pelo MVP 2", e esta linha continuou em
branco por dois MVPs, fazendo a pergunta reaparecer em toda varredura. **Conferido em disco
antes de escrever isto**, e não por memória: a rota está em `club-routes.ts` e o nome sai pelo
`nameOfWriter`.

### 2. Vocês vão continuar em duas pessoas, ou entra mais gente?

**Por que eu pergunto:** três decisões do MVP 1 assumem duas pessoas — o filtro acima, o
"você × a outra pessoa" no lugar do nome, e a ausência de paginação nas listas. Nenhuma delas
quebra com mais gente, mas duas ficam ruins.

**Recomendação:** se entra mais gente no MVP 2, a pergunta 1 deixa de ser "vale a pena" e passa
a ser obrigatória.

**Resposta (2026-09-18):** ✅ **Duas pessoas, por ora.**

**Consequência: nada muda, e nada vira dívida.** As três suposições continuam confortáveis — o
filtro é informação completa num clube de dois (o complemento de "minhas" é exatamente "dela"),
e sem paginação as listas aguentam anos. ⚠️ **O gatilho de reabertura, escrito para ser
achado:** reabra esta pergunta **antes** de mandar o terceiro convite, não depois. Três coisas
mudam de uma vez — paginação (a busca já corta em **500** sem avisar), os textos que dizem "a
outra pessoa", e ⚠️ **o desenho anti-placar, que é o mais difícil**: o foguinho com duas pessoas
é um par; com dez é um ranking.

### 3. A anotação do dia arquivada

**Como está:** se você arquivar a anotação de um dia e abrir aquele dia de novo, o editor
carrega o texto arquivado como rascunho — e escrever ali **desarquiva de fato**, sem registro
nenhum de que isso aconteceu.

**As alternativas:** (a) deixar como está — nada se perde e o app não faz cerimônia; (b) abrir
vazio e tratar a arquivada como passado; (c) desarquivar explicitamente, com registro (é MVP 4).

**Recomendação:** (a). O texto é seu, e recuperá-lo em silêncio é mais gentil do que escondê-lo.
Mas é o seu texto, então é a sua escolha.

**Resposta (2026-09-18):** ✅ **(a) deixar como está.**

**Consequência: nada a construir**, e o comportamento fica **documentado em vez de acidental** —
que é a diferença que importa. ⚠️ **O custo, dito com todas as letras:** "arquivar" vira um
gesto que se desfaz sem você perceber. Se você arquivou para tirar da frente e depois abriu
aquele dia, o texto voltou. A escolha foi pela gentileza (recuperar em silêncio é melhor que
esconder), **sabendo disso**. As opções (b) e (c) continuam existindo se incomodar — a (c),
desarquivar com registro, já está prevista no MVP 4.

### 4. Arquivar livro não tem tela

**Como está:** dá para arquivar um livro pela API, não pela interface. Um livro cadastrado
errado se **corrige** (a tela de edição existe), mas um livro que você quer tirar da estante
não sai.

**Recomendação:** deixar para o MVP 2, junto de uma tela de administração do clube. Só suba de
prioridade se você cadastrar um livro duplicado e ele te incomodar na estante.

**Resposta (2026-09-18):** ✅ **MVP 4, junto da administração do clube.**

**Consequência:** vira item do MVP 4 em vez de dívida solta. É onde ele cai naturalmente —
arquivar livro, remover membro e mudar papel são a **mesma tela** e o **mesmo conjunto de
guardas de permissão**; sozinho agora, seria uma tela de uma coisa só. ⚠️ **Conferido em disco
em 2026-09-18: continua sem tela** — a rota existe, o gesto não. A saída pela API continua
sendo a única, e ela está no `COMO-TESTAR.md`.

### 5. Abrir o app sem rede (cache de leitura)

**Como está:** a **escrita** sobrevive à falta de rede (MVP 1 fechou isso). A **leitura** não:
abrir o app do zero no metrô mostra falha de rede com botão de repetir.

**O que falta:** guardar localmente a última resposta de `/me`, do livro e das notas — é uma
fatia de tamanho médio, e é o que faz o app parecer nativo.

**Recomendação:** depende de vocês. Se a leitura acontece em transporte público ou em lugar com
sinal ruim, isto é a coisa mais valiosa do MVP 2, à frente dos grifos. Se vocês leem em casa,
pode esperar.

**Resposta (2026-09-17):** ❌ **Não. "Lemos em casa, com wi-fi."**

**Consequência:** o cache de leitura sai do radar — não é dívida, é escopo. ⚠️ **E ela fecha
uma pergunta que ficou aberta por TRÊS MVPs**, reaparecendo a cada fechamento com o custo
subindo; a última vez que subiu foi no MVP 3, quando a notificação passou a levar a pessoa
para um app que pede rede. **Com a resposta, ela para de reaparecer.** Se um dia a leitura
mudar de lugar — metrô, viagem —, reabra esta pergunta: a fatia continua existindo, e o que
estava certo aqui é que ela é média, não pequena.

### 6. Criar anotação avulsa sem rede

**Como está:** editar a anotação **do dia** funciona offline. **Criar** uma avulsa não — a tela
guarda o rascunho, mas exige conexão para criar.

**Por quê:** criar não é idempotente. Reenviar às cegas criaria a mesma anotação duas vezes, e o
backend não tem chave de idempotência (seria uma fatia de backend, não de tela).

**Recomendação:** deixar como está até acontecer com você de verdade. Se acontecer, me diga —
a correção é conhecida.

**Resposta (2026-09-18):** ✅ **Deixar como está.**

**Consequência: nada a construir** — e ⚠️ **a sua resposta à pergunta 5 esvaziou esta aqui**:
"lemos em casa, com wi-fi" tira do caminho o caso que a tornava incômoda. O rascunho não se
perde em momento nenhum; só o **envio** espera a rede voltar. Se um dia voltar a incomodar, o
conserto continua conhecido e é de **backend**, não de tela: uma chave de idempotência que o
cliente gera, para reenviar a mesma chave devolver a mesma nota em vez de criar outra.

### 7. Manter o inglês?

**Como está:** todo texto existe em `pt` e `en`, e o compilador reprova uma chave que falte num
dos dois.

**O custo:** cada fatia escreve tudo duas vezes. Não é grande, mas é constante.

**Recomendação:** manter. O custo é pequeno e o segundo catálogo é o que impede texto solto na
tela — se a frase não existe em dois lugares, ela não passou pelo `t()`. Só tire se for
incomodar.

**Resposta (2026-09-17):** ❌ **Não. "Só português — apagar o inglês."**

**Consequência: é a maior das duas fatias que o fechamento do MVP 3 gerou**, e maior do que a
pergunta fazia parecer, porque não é só apagar um arquivo. ⚠️ **A Tarefa 29a inteira existe por
causa do `en`** — ela tirou o catálogo do chunk de entrada por `import()`, e entregou o
`changeLocale`, o chunk separado, o `globIgnores` do service worker e as asserções do
`bundle-guard`. Sem o `en`, essa maquinaria toda vira código morto e sai junto: o seletor de
idioma, o `persistLocale`, o `SUPPORTED_LOCALES`/`isLocale`/`FALLBACK_LOCALE`, a metade `en`
dos testes de paridade e da varredura anti-culpa, e o caminho de locale do lembrete e do aviso
de atividade (`Settings.locale`).

⚠️ **O que se perde, e é justo registrar porque era o argumento da recomendação:** o segundo
catálogo era a rede que pegava texto solto na tela — *"se a frase não existe em dois lugares,
ela não passou pelo `t()`"*. Com um catálogo só, essa rede some. ~~✅ **O que sobra no lugar:**
a varredura de fonte das telas e as guardas de vocabulário do catálogo, que continuam de pé.~~

⚠️⚠️ **ESSA FRASE FOI ESCRITA ANTES DA FATIA E A MEDIÇÃO DA TAREFA 38d A DESMENTE PELA
METADE.** A regra 9 da spec pedia a perda **medida**, e ela foi:

- **a rede nunca foi automatizada.** Um `<p>Resumo do mês do clube</p>` plantado direto no JSX
  da home — texto solto, em português, renderizado de verdade — dá **ZERO acusadores em 749
  testes**. E daria zero antes da fatia também: nenhum teste do repositório compara o que a tela
  renderiza com o conjunto de chaves do catálogo (a paridade `pt`↔`en` comparava **chaves com
  chaves**, e uma frase no JSX não cria chave nenhuma). Era uma rede de **revisão humana** —
  escrever a frase duas vezes incomodava quem a escrevia —, não de teste;
- **"a varredura de fonte das telas" não existe.** A varredura de fonte que existe é a de
  `packages/ui` (`no-hardcoded-ui-text.test.ts`), e ela guarda o **design system**, não as
  telas;
- ✅ **o que sobra de verdade, e sobra medido:** as guardas de **vocabulário** do catálogo
  (anti-culpa e ADR 0002). Uma frase de cobrança e uma de privacidade plantadas no `pt.ts` dão
  **1 acusador cada**, mesmo numa chave que tela nenhuma renderiza — que é exatamente a
  propriedade pela qual elas moram no catálogo. Elas pegam **o que a frase diz**; nenhuma delas
  pega **onde a frase foi escrita**.

✅ **E uma dívida conhecida morre junto:** os **33 textos da barra do editor** que só existiam
em português deixam de ser dívida — eles eram a pergunta 6 do MVP 2.

### 8. Alguma coisa que você esperava e não está aqui?

Esta é a pergunta mais importante do aceite. O MVP 1 foi executado a partir de um plano escrito
antes de existir tela nenhuma — depois de usar o app de verdade, o que está faltando?

**Resposta (2026-09-18):** ✅ **Nada. O núcleo faz o que eu esperava.**

**Consequência:** o MVP 1 fica **sem nenhuma pergunta aberta** — as oito estão respondidas,
contando a nº 1 que era entrega e não pergunta. ⚠️ **E isto é um dado sobre o processo, não um
elogio:** o MVP 1 foi executado a partir de um plano escrito **antes de existir tela nenhuma**,
e nove meses de uso depois não apareceu buraco no núcleo. O que apareceu — o foguinho, o tema
no feed — nasceu **do uso**, que é exatamente onde essas coisas deviam nascer.

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

**Resposta (2026-09-18):** ❌ **Deixar como está — sem `unaccent`.**

**Consequência: nada a construir**, e o custo evitado é real: extensão de banco que o Prisma não
gera sozinho, índice funcional para a busca não virar varredura de tabela, e um **ADR novo**
porque muda decisão fechada.

⚠️⚠️ **E aqui vai o registro mais honesto que eu consigo fazer desta rodada: na minha leitura,
esta é a pergunta fechada com MAIOR chance de voltar.** Buscar com pressa é buscar sem acento, e
a busca vazia parece *"não existe"* em vez de *"escrevi diferente"*. A tela mitiga com uma frase
no estado sem resultado — é honesta, mas é remendo de texto. **Se voltar, o gatilho será você
procurando uma coisa que você sabe que escreveu e não achando.** Está escrito aqui para o
próximo leitor não achar que foi descuido.

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

**Resposta (2026-09-18):** ✅ **Manter os dois — trecho grifado E comentário.**

**Consequência: nada muda no código, e uma decisão que eu tomei no seu lugar deixa de ser
minha.** Era a única da entrega inteira nessa situação: eu li a decisão fechada do MVP 2 como
sendo sobre o **mecanismo** (`ILIKE`, nada de vetor) e não uma lista exaustiva de campos, e
segui sem perguntar. ✅ **Você confirmou, então ela vira decisão sua e para de ser uma leitura
minha esperando ser derrubada.**

⚠️ **E o custo do contrário continua medido, para quem reabrir:** grifo sem comentário guarda
string **vazia** (não nulo), e `'' ILIKE '%qualquer%'` é **falso** no Postgres — com só o
comentário, **todo grifo registrado sem escrever nada junto ficaria inalcançável pela busca,
para sempre**. E grifo sem comentário é caso legítimo e comum.

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

**Resposta (2026-09-18):** ✅ **Um campo de texto no acervo do livro.** A busca do clube
continua como está.

**Consequência: é fatia** — a **38g** no `docs/BACKLOG.md`. ✅ **E é a mais barata das três desta
rodada, porque já está medido:** o filtro `text` **existe em todas as camadas dos dois
recursos** — port, fake, UseCase, repositório Prisma, borda e integração. Falta o campo na tela.

⚠️ **O que a fatia NÃO pode mudar:** o acervo recorta no **cliente** o que já carregou (decisão
registrada da Tarefa 28, e é o que faz o toque no chip custar zero requisição). O campo de texto
segue o mesmo modelo — nada de perguntar ao servidor a cada tecla.

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

**Resposta (2026-09-18):** ✅ **(c) E (d) — por página E por dia.** As duas.

**Consequência: são duas fatias**, a **38h** (faixa de página) e a **38i** (o dia do plano), e
só a segunda mexe no modelo.

✅ **A (c) já estava prevista pelo próprio código:** o `HighlightRepository` diz por escrito
*"sem faixa de página (`pageFrom`/`pageTo`): é aditiva e **ninguém pediu**"*. Agora pediram, e
a extensão entra pela porta que ela mesma deixou aberta.

⚠️⚠️ **E A OPÇÃO (d) ACIMA CITA O ADR 0004 ERRADO — erro meu, e ele estava aqui desde que esta
pergunta foi escrita.** A frase *"o ADR 0004 já registra que o campo seria aditivo"* é
verdadeira sobre **`noteId?`** — vínculo com a **anotação** —, e é esse o campo que o ADR
discute, com as perguntas de cascata dele (*"o que acontece com o grifo se a nota é
arquivada?"*). **Não é** sobre vínculo com o **dia do plano**.

⚠️ **E a diferença não é acadêmica: ela decide a coluna.** Para *"os grifos do capítulo 3"* a
coluna certa é **`planItemId?`**, direta. Passar pela anotação quebraria justamente o caso que
o ADR 0004 protegeu com todas as letras — *"eu quero registrar um grifo em um dia que não
escrevi anotação nenhuma"* —, porque grifo em dia sem nota não teria `noteId` para carregar.

✅ **O que sobrevive intacto:** a decisão central do ADR — **o grifo não depende de um dia de
leitura** — continua de pé, porque o campo é **opcional**. E o **preenchimento é automático**
(escolha sua): se existe item de plano para hoje naquele livro, o grifo nasce com ele, sem
campo novo na tela e sem toque a mais. O gesto continua sendo de dois toques.

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

**Resposta (2026-09-17):** ✅ **Mantido sem contador de resultados** — e esta resposta merece
ler com atenção, porque o **gatilho que ela mesma escreveu disparou**, só que em outro lugar.

⚠️ **Você pediu um número** — a corrente de dias, o foguinho (Tarefa 38c, ADR 0010). Pela letra
do parágrafo acima, seria "relaxar a guarda". **Não foi isso que se fez, e a diferença importa:**

- a guarda **não foi relaxada**: a isenção é **nominal**, vale para **sete chaves** e é **pinada
  por igualdade exata** — ampliá-la deixa o teste vermelho, e quem ampliar tem de escrever no
  teste que está ampliando;
- o número que entrou é a **corrente**, que conta **dias seguidos de leitura**. O **contador de
  resultados** desta pergunta — *"12 anotações"*, *"3 resultados"* — **continua proibido**, e
  continua proibido pelo mesmo teste de sempre;
- o **custo real** que esta pergunta apontou continua sem dono, e ele não era o contador: a
  busca corta em **500** e **não avisa** que cortou. O conserto honesto é o **servidor** dizer
  que truncou. Isso continua de fora.

### 6. ~~A barra do editor está só em português. Isso conserta agora ou espera você?~~

✅ **FECHADA SEM CONSERTO EM 2026-09-17, pela resposta à pergunta 7 do MVP 1** — e a fatia que
a fechou é a **Tarefa 38d**.

~~**Como está:** trocar o idioma para inglês traduz o app inteiro **menos** os rótulos dos
botões do editor ("Negrito", "Citação", "Grifo amarelo") e os do menu `/`.~~ ⚠️ **NÃO SE TROCA
MAIS O IDIOMA:** o seletor saiu, o catálogo `en` foi apagado e o app é só português. Os **33
textos** cravados em `packages/ui` **continuam lá, e continuam em português** — só que agora
eles falam a mesma língua que o resto da tela.

~~**Por quê não consertei:** … depende da **pergunta 7 do MVP 1**, que continua sem resposta.~~
A pergunta foi respondida (*"só português — apagar o inglês"*), e a resposta escolheu o caminho
que o próprio parágrafo previa: **o conserto era deletar**, e deletar não é traduzir os 33.

⚠️ **O que NÃO morreu junto, e por isso o riscado não é apagado:** a guarda
`packages/ui/src/__tests__/no-hardcoded-ui-text.test.ts` **fica**, com o teto de 33 que **só
pode cair**. O motivo dela mudou de "texto não traduzido" para "`packages/ui` não é dono de
texto de interface" (decisão B da Tarefa 13) — que continua valendo com um idioma só, e é o
que impede o próximo componente de acrescentar a 34ª.

**Resposta (2026-09-17):** ✅ **Não precisa consertar — a pergunta 7 do MVP 1 a dissolveu.**

### 7. Alguma coisa que você esperava do MVP 2 e não está aqui?

Foi a pergunta mais útil do aceite do MVP 1. Depois de usar os grifos e o acervo de verdade — o
que falta?

**Resposta (2026-09-18):** ✅ **Nada. Faz o que eu esperava.**

**Consequência:** com as seis respondidas acima, o MVP 2 fica **sem nenhuma pergunta aberta**.
⚠️ **Com uma ressalva que é justa:** duas fatias desta rodada (38g, e 38h/38i) nasceram das
perguntas **3** e **4** deste mesmo aceite — ou seja, "nada faltou" quer dizer *nada que você
não tenha acabado de pedir*. As duas perguntas existiam justamente porque a auditoria achou a
frase de aceite do MVP 2 prometendo mais do que as telas entregavam.

---

## C. ~~As perguntas do MVP 1 que continuam sem resposta~~ — **nenhuma continua**

⚠️ **ESTA SEÇÃO ESVAZIOU EM 2026-09-18.** As oito perguntas do MVP 1 estão respondidas (a nº 1
nunca precisou de resposta — foi entregue). O título fica riscado em vez de reescrito porque a
seção virou **histórico**: ela registra o que estava aberto **enquanto o MVP 2 era executado**,
e é isso que explica por que certas decisões daquele MVP foram conservadoras.

Elas **afetaram** o MVP 2 e eu segui com o padrão conservador, sem decidir no seu lugar:

- **Pergunta 1** (filtro por pessoa e o nome de quem escreveu) — **FECHADA pelo MVP 2**: a
  Tarefa 26a criou a rota e a 27 pôs o nome no chip e no avatar.
- **Pergunta 5** (abrir o app sem rede — cache de leitura) — ~~**continua aberta, e o MVP 2
  não a fez.**~~ ✅ **RESPONDIDA EM 2026-09-17, no fechamento do MVP 3: "não — lemos em casa,
  com wi-fi".** O registro fica aqui riscado, e não apagado, porque esta seção conta a
  **história** da pergunta: ela atravessou o MVP 2 e o MVP 3 aberta, e a cada fechamento eu
  escrevi que era "a coisa mais valiosa que está de fora". Era — dado o uso que eu supunha.
  Não era, dado o uso real. A resposta está na pergunta 5 do MVP 1.
- **Pergunta 2** (entra mais gente no clube?) — o MVP 2 assumiu **"duas hoje, mais amanhã"**:
  nada na estrutura assume duas (o filtro por pessoa é por membro, com nome), e o texto de
  interface continua simples enquanto forem duas. ✅ **RESPONDIDA em 2026-09-18: duas pessoas,
  por ora** — a suposição do MVP 2 estava certa.
- **Perguntas 3, 4, 6, 7 e 8** — ~~sem resposta, e nenhuma bloqueou o MVP 2.~~ ✅ **TODAS
  RESPONDIDAS** (a **7**, o inglês, em 2026-09-17, e virou a Tarefa 38d; as outras em
  2026-09-18). A **7** virou a pergunta **6** desta seção. ⚠️ **E o registro que importa é
  este: nenhuma delas bloqueou o MVP 2, e nenhuma mudou de resposta depois de dois MVPs de
  uso.** O padrão conservador — "sem resposta, não entra" — custou zero retrabalho aqui.

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

## A. O roteiro de aceite

Marque o que funcionou. O que falhar, escreva **o que você viu**, não o que acha que é.

⚠️ ~~**Antes de começar, uma coisa que muda o roteiro:** … **Notificação não** — push exige
contexto seguro (HTTPS ou `localhost`) … Faça a parte A.1 no celular e a parte A.3 no
`localhost` do computador.~~

✅ **CAIU EM 2026-09-18, e foi você quem mediu:** *"push pela rede local também está ok"*.
**O roteiro inteiro pode ser feito no celular** — A.1 e A.3 no mesmo aparelho, pelo IP da
rede. A ressalva riscada era **previsão**, escrita a partir da regra de contexto seguro, e
ficou aqui três MVPs com cara de fato.

⚠️⚠️ **O MECANISMO NÃO ESTÁ REGISTRADO, e é a única coisa frágil nesta linha.**
  Contexto seguro é regra do NAVEGADOR, não código nosso: `http://<ip>` não é origem segura
  pela especificação. Se funcionou, alguma condição do ambiente do dono difere do que este
  documento supunha — aparelho, navegador, flag, ou o app já instalado a partir de uma origem
  segura anterior. **Ninguém mediu qual.** Registrado assim de propósito: no dia em que parar
  de funcionar, é aqui que se procura, e a resposta "mas funcionava" não vai bastar.

✅ **O que continua valendo:** a tela **explica** a recusa quando ela acontece (quatro frases,
uma por motivo), e `localhost` e túnel HTTPS continuam sendo caminhos garantidos.
⚠️ **Instalar como PWA pelo IP continua fora** — não foi medido junto.

### A.1 — O circuito do MVP 3, no celular

- [ ] Abro a tela do livro, toco em **"li hoje"**, e a marca aparece na linha do dia →
      `COMO-TESTAR.md` §6.4.
- [ ] Ela marca no aparelho dela; eu recarrego e vejo **duas** marcas naquele dia.
- [ ] Toco de novo e **desmarco**. A marca some e não volta ao recarregar.
- [ ] A marca de **leitura** (glifo) é distinguível da de **escrita** (inicial) sem eu precisar
      olhar a cor.
- [ ] Na home, o **feed** mostra o que aconteceu: quem, o quê, **sobre que dia**, em que livro,
      quando → §6.5.
- [ ] ⚠️ **O tema do dia na linha** (Tarefa 38e, a sua pergunta 3): a linha diz *"escreveu sobre
      Cap. 3 — A promessa"*, e a avulsa e o grifo continuam dizendo só o livro → §6.5.
- [ ] ⚠️ **Corrijo o título de um dia no plano e a linha ANTIGA do feed passa a dizer o título
      novo** — o feed nunca repete um texto velho → §6.5.
- [ ] Toco numa linha do feed e ela **cai na tela certa** — a anotação abre a anotação, o grifo
      abre o grifo.

⚠️ **O foguinho (Tarefa 38c, ADR 0010) — a parte que você pediu depois, e é a que mais precisa
do seu olho** → `COMO-TESTAR.md` §6.5.1:

- [ ] Acima do feed vejo **um fogo por pessoa** do clube, com o número de dias seguidos.
- [ ] Marco "li hoje" e **a minha corrente sobe**.
- [ ] **No dia seguinte, antes de eu marcar:** a corrente **continua** no número de ontem, e
      aparece **"Você vai perder a sua sequência!"**. ⚠️ **Se ela zerar de manhã, é bug** — é a
      regra que decide se o fogo é usável, e ela tem teste.
- [ ] Marco "li hoje" e **o aviso some**.
- [ ] Quem está em **zero** vê *"Comece a sua sequência hoje"* e **não** vê o aviso de perda.
- [ ] ⚠️ **O plano pula um dia (domingo, por exemplo) e a corrente NÃO quebra** — ela conta
      dias do **plano**, não do calendário.
- [ ] ⚠️ **A pergunta que não é técnica:** olhe o fogo dela ao lado do seu. **Você sentiu
      alguma coisa?** Alívio, orgulho, ou um aperto? A resposta honesta a isso vale mais que
      todo o resto desta lista — e é o §A.2.

### A.2 — ⚠️ A pergunta que decide o MVP, e ela não é técnica

Este MVP tem um princípio no meio: **o clube não pode virar placar.** Tudo abaixo é para você
julgar com o olho, não com o teste.

> ⚠️⚠️ **ESTA SEÇÃO MUDOU DE SENTIDO DEPOIS QUE VOCÊ PEDIU O FOGUINHO (Tarefa 38c, ADR 0010).**
> Ela foi escrita para conferir que o app **não** conta nada. Agora ele conta, por decisão sua.
> O que sobra aqui não é mais "o app conta?" — é **"contar fez o que você queria, ou fez o que
> eu avisei que faria?"**. É a pergunta mais importante de todo este aceite, e só você responde.

- [ ] ⚠️ **O único número inventado pelo app é a corrente** (o fogo). Se você vir **qualquer
      outro** — "2 de 30", percentual, "+3", "3 atividades" —, é bug: ele não foi pedido e não
      passou por decisão nenhuma.
- [ ] ⚠️ **Depois de alguns dias com o fogo aceso: eu olho o fogo dela antes de olhar o que ela
      escreveu?** Se sim, o clube virou competição — e é exatamente o risco que ficou registrado
      antes de eu escrever a primeira linha. A reversão é barata: nada foi guardado no banco.
- [ ] ⚠️ **Quando eu perco a sequência, o que eu sinto?** Se der vontade de abrir menos o app em
      vez de mais, o mecanismo está trabalhando contra o §1 do plano, não a favor.
- [ ] Olhando o feed **abaixo do fogo**, eu não sinto vontade de comparar quem escreveu mais. O
      feed continua sendo frase, sem coluna de pessoa — só a corrente virou coluna.
- [ ] O texto das preferências fala em **primeira pessoa** e não cobra ("me lembre às", nunca
      "você não leu hoje").
- [ ] ⚠️ **O ponto que eu mais quero que você teste:** marque "li hoje", e depois rode o
      lembrete (§6.7). **Ele não pode chegar.** Se chegar, a regra anti-culpa quebrou, e ela é
      a razão de a feature existir.

### A.3 — As notificações (no `localhost`, ou por túnel)

- [ ] Gero o par VAPID e ponho no `.env` do backend → §6.6. Antes disso, a seção de
      notificações diz **"indisponível"** — e isso **não é erro**.
- [ ] Em `/preferencias`, **ativo neste aparelho**. O navegador pede permissão; eu concedo.
- [ ] ⚠️ **Toco em "Enviar um aviso de teste" e a notificação aparece.** É o teste mais curto
      de todo este roteiro — se ele funcionar, o push está de pé ponta a ponta, e tudo o que
      vem depois é sobre *quando* mandar, não sobre *se* chega. → `COMO-TESTAR.md` §6.6.
- [ ] O botão de teste **não existe** quando o aparelho está desativado. (Se existir, ele
      mandaria o aviso para os outros aparelhos e nada apareceria aqui.)
- [ ] **Recuso** a permissão de propósito num navegador limpo: a tela diz **que foi a
      permissão**, não uma frase genérica de "não deu".
- [ ] Abro pelo **IP da rede** e tento ativar: a tela diz **que o endereço não é seguro**.
      (É o caso que mais vai acontecer com você.)
- [ ] Mudo o horário do lembrete para alguns minutos **atrás**, garanto que **não** marquei "li
      hoje", e rodo `pnpm --filter @clube/backend notifications:dispatch` → §6.7.
      **O lembrete chega.**
- [ ] Rodo **de novo** no mesmo dia: **não chega segunda vez** (`skipped`).
- [ ] ⚠️ **Com corrente viva, o lembrete MUDA de frase** (Tarefa 38c): em vez do tema do dia
      sozinho, chega *"Você vai perder a sua sequência de N dias"* **seguido do tema**. Quem
      está em **zero** continua recebendo o lembrete simples, sem moldura → `COMO-TESTAR.md`
      §6.7. ⚠️ **E quem já marcou "li hoje" continua não recebendo nada** — essa é a metade da
      regra anti-culpa que o foguinho **não** derrubou, e ela vem antes da moldura.
- [ ] Ela escreve uma anotação no aparelho dela. **Meu celular avisa.**
- [ ] Desligo "quero saber quando alguém do clube lê ou escreve", ela escreve de novo, e **não
      chega nada**.
- [ ] **Desativo neste aparelho.** Ela escreve, e não chega nada.

### A.4 — ⚠️ A frase "MVP 3 pronto", pedaço por pedaço — e o que NÃO tem dono

Confiro a definição frase por frase, e digo o que está entregue e o que depende de você.

| Pedaço da frase | Estado |
| --- | --- |
| *"Eu marco que li o trecho de hoje"* | ✅ **Entregue.** ⚠️ **Só o dia de hoje** — um dia passado não se marca pela tela (é a pergunta 2 desta seção) |
| *"e vejo onde eu e o clube estamos no livro"* | ✅ **Entregue duas vezes, e a segunda reverteu a primeira.** Primeiro como **presença** (a sua resposta à pergunta 1); depois, a seu pedido, também como **número** — a corrente de dias seguidos, visível para o clube (Tarefa 38c, ADR 0010). ⚠️ **É o pedaço a julgar com mais cuidado no aceite**, porque as duas formas respondem à mesma frase e puxam o clube para lados opostos |
| *"Recebo um lembrete no horário que eu escolhi"* | ~~⚠️ **Entregue, mas NÃO AUTOMÁTICO**~~ → ✅ **Entregue, e automático desde a Tarefa 38f** (2026-09-17): `NOTIFICATIONS_CRON=on` no `.env` do backend. ⚠️ **Desligado é o padrão** — sem a chave, vale a linha riscada. Ver abaixo |
| *"e não recebo se eu já li"* | ✅ **Entregue**, e é o item que eu mais quero que você teste (A.2) |
| *"quando ela lê, escreve ou grifa, meu celular avisa"* | ⚠️ **Entregue, com duas condições — ver abaixo** |
| *"e a atividade aparece no feed da home"* | ✅ **Entregue** |

⚠️ **O QUE NÃO TEM DONO — leia isto antes de dar o MVP por pronto. Eram três; o nº 1 FECHOU
na Tarefa 38f (2026-09-17), e sobram DOIS.** A numeração fica como estava e o fechado fica
riscado em vez de apagado: a lista é histórica, e apagar faria a próxima leitura achar que o
buraco nunca existiu.

1. ~~**NINGUÉM CHAMA O LEMBRETE.** Não existe cron instalado, e é decisão de desenho
   (`NOTIFICACOES.md` §6: não há agendador dentro do servidor). Hoje o lembrete só sai **se
   você rodar o comando à mão**. Para ele virar automático, alguém tem de instalar um cron
   externo (a cada 5–10 min) na máquina onde o backend roda — e isso **não é fatia de código**,
   é operação. ⚠️ **É o maior buraco entre a frase e a realidade**, e eu o deixo explícito em
   vez de escondê-lo atrás de "entregue".~~
   ✅ **FECHADO pela Tarefa 38f** (2026-09-17), a pedido seu: ponha **`NOTIFICATIONS_CRON=on`**
   no `packages/backend/.env` e reinicie a API — ela passa a chamar a passada do lembrete de
   **5 em 5 minutos** sozinha, e o boot escreve uma linha dizendo se ligou e se as chaves
   VAPID estão configuradas. ⚠️ **Sem a chave, nada é agendado** (é o padrão seguro: com duas
   instâncias do backend, um cron externo continua sendo o jeito certo). ⚠️ **Ligar é seu**:
   com VAPID configurado, a primeira passada manda push de verdade no seu aparelho e gasta o
   lembrete do dia. O passo a passo está no `COMO-TESTAR.md` §6.7.
2. **PUSH NO CELULAR PELA REDE LOCAL NÃO FUNCIONA.** Contexto seguro. A frase diz "meu celular
   avisa"; na sua rede, hoje, isso exige um túnel HTTPS ou rodar no `localhost`. Também é
   operação, não código.
3. **AS CHAVES VAPID NÃO ESTÃO CONFIGURADAS** e nunca estarão por padrão — elas são segredo, e
   o projeto roda sem elas de propósito. Enquanto não estiverem no `.env`, a metade de
   notificação do MVP 3 fica desligada e **a tela diz isso**, sem parecer erro. (⚠️ No **seu**
   `.env` elas já estão, desde 2026-09-17 — o buraco é do ambiente, e o seu deixou de tê-lo.)

Os dois que sobram são a mesma família do que fechou: **o código está pronto e o ambiente não
está.** Nenhum é dívida técnica escondida; os dois estão escritos no `COMO-TESTAR.md` com o
passo a passo.

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

**Resposta:** ✅ **(a) — só presença, sem agregado.** Respondida na rodada de decisões do
MVP 3 (11/09/2026), escolhendo entre as três opções acima. **É esta decisão que as Tarefas 31,
32, 32b e 35 executam**, e a consequência estrutural registrada: a rota **não devolve contagem
nenhuma**, então o número é irrenderizável por construção — mais forte que a regex, que tem
furo **medido duas vezes** (`"12 dias lidos"` e `"3 atividades"` passam pela `COUNTER_SHAPE`
**e** pela `GUILT_TERMS`). ⚠️ **Esta resposta continua aberta a revisão no aceite** — é para
ver na tela, com o app usado, que ela se confirma.

> ⚠️⚠️ **REVERTIDA PELO DONO EM 16/09/2026, ANTES DO ACEITE — ver `docs/adr/0010`.**
>
> O dono pediu um sistema de corrente ("foguinho") no molde do Duolingo. A objeção foi
> levantada **antes de qualquer linha de código**, com a medição na mão: `streak` estava
> **nominalmente proibido** pela `GUILT_TERMS` (com o comentário *"o placar disfarçado de
> incentivo"* escrito no código); o mecanismo do Duolingo é enquadrado na **perda**, não no
> ganho; e num clube de duas pessoas isso é pior do que no Duolingo, porque **a outra pessoa
> vê o seu fogo apagar** — não é você contra um app, é você devendo satisfação a quem dorme
> do seu lado.
>
> **O dono reafirmou, escolhendo a opção completa**, ciente do custo. A Tarefa 38c entregou:
> contagem por pessoa na API, fogo visível para o clube no feed, frase de perda na tela e no
> lembrete.
>
> **O que a resposta (a) deixou de pé, e continua de pé:** a corrente é **calculada, nunca
> guardada**; o lembrete continua **não chegando para quem já leu**; e a `GUILT_TERMS` **não
> foi desligada** — a isenção é nominal, por chave, e **pinada por teste de igualdade exata**,
> então ampliá-la fica vermelho.
>
> ⚠️ **A pergunta que fica para o aceite não é mais "presença ou número".** É: *depois de usar
> com o fogo aceso, o clube virou competição?* Se virou, a reversão é barata — nada foi
> guardado, e o ADR 0010 diz exatamente o que desfazer.

### 2. Marcar que li um dia que já passou?

**Como está:** o toque "li hoje" aparece **só no dia de hoje** do plano. Se você leu no
sábado e só abriu o app na segunda, não há como registrar o sábado.

**Por que ficou assim, e não é economia de esforço:** a rota aceita qualquer dia — pôr um
alternador em cada uma das 30 linhas é barato. O que não é barato é o que isso faz com a
tela: 30 alternadores transformam o plano numa **lista de auditoria retroativa**, e é
exatamente ali que *"por que você não marcou o dia 4?"* nasce. Todo o resto do MVP 3 foi
desenhado para não ter esse tom (a ausência é silenciosa, não há contador, não há barra), e
seria estranho a única exceção ser justo o gesto central.

**O custo de não ter, e ele é real:** quem lê em fim de semana e marca na segunda perde o
registro. Como o progresso é presença — a marca no dia do plano —, o dia fica em branco para
sempre, e o dia em branco é indistinguível de "não li".

**As alternativas:**
- **(a)** deixar como está: só hoje;
- **(b)** marcar o dia **ao abrir a anotação daquele dia** — você já está lá, já é o contexto
  daquele trecho, e não existe lista de alternadores em lugar nenhum;
- **(c)** 30 alternadores na lista do plano;
- **(d)** só o dia de hoje e o de ontem.

**Recomendação: (a) por enquanto, e (b) se incomodar.** A (b) é a única que dá o registro
sem criar a lista de auditoria — ela aparece onde você já está, e uma de cada vez. A (c) é a
que eu evitaria mesmo se você pedir o recurso; a (d) é uma régua arbitrária que vai gerar a
pergunta "por que ontem sim e anteontem não?".

**Resposta (2026-09-17):** ✅ **(a) — "Não. Só hoje, e a corrente é dura mesmo."**

**Consequência: nada a construir**, e a decisão ficou **mais** coerente depois do foguinho, não
menos. ⚠️ **As duas respostas se sustentam de propósito:** se desse para marcar sábado na
segunda, a corrente viraria um número que se conserta depois — e um fogo que se acende
retroativamente não incentiva ninguém a ler hoje. **Perder é perder**, e você disse isso com
todas as letras.

⚠️ **O custo continua real e não mudou:** quem lê no fim de semana e só abre o app na segunda
perde o registro **e** a corrente. Se um dia incomodar, a saída continua sendo a **(b)** —
marcar ao abrir a anotação daquele dia —, e ela continua sendo a única que dá o registro sem
criar a lista de auditoria. ⚠️ **Mas atenção:** com o foguinho no ar, a (b) deixou de ser só
uma tela. Ela passaria a **restaurar corrente perdida**, e isso é decisão de produto nova, não
mais "uma fatia de tela".

### 3. O feed deve dizer o TEMA do dia, ou basta o livro?

**Como está:** a linha do feed diz o **livro** ("Maria leu um dia de *O Senhor dos Anéis*"),
nunca o capítulo ("…sobre o Cap. 3").

**Por quê, e é medido:** o `ActivityEvent` guarda **referência, não conteúdo** — ele tem
`bookId` e `planItemId`, mas **não** o título do dia. A home tem a lista de livros (então o
nome do livro sai de graça) e **não** tem o plano dos outros livros. Dizer o tema exigiria uma
requisição por livro do feed, ou **denormalizar o título dentro do evento** — que envelhece no
dia em que o admin corrigir o plano, e aí o feed mente sobre o passado.

**As alternativas:**
- **(a)** deixar como está: quem, o quê, em que livro, quando — e o toque leva ao lugar certo;
- **(b)** a rota do feed devolver o título do dia junto (mudança de contrato, **uma** consulta
  a mais no servidor, nada de N requisições no celular);
- **(c)** denormalizar o título dentro do evento — descartada: um evento com título velho é uma
  tela que mente, e o `ActivityEvent` é log imutável.

**Recomendação: (a), e (b) se você sentir falta.** O feed responde "o clube está vivo?"; o
capítulo é detalhe que o toque já entrega. Se incomodar, a saída barata é a **(b)** — e ela é
uma mudança de contrato, não de arquitetura.

**Resposta (2026-09-17):** ✅ **"Quero o tema do dia na linha."**

**Consequência: é fatia**, e está no `docs/BACKLOG.md`. ⚠️ **A alternativa (c) continua
descartada, e a recusa é de escrita, da Tarefa 35:** denormalizar o título dentro do
`ActivityEvent` faria o feed **mentir sobre o passado** no dia em que o admin corrigisse o
plano, e o `ActivityEvent` é log imutável (`CLAUDE.md`).

Entre **(b)** e resolver o título na tela pelo `planItemId` que o evento **já carrega**, a
escolha é da spec da fatia, **com medição** — não deste documento. As duas custam uma consulta
a mais no servidor e nenhuma toca o modelo; o que muda é onde a junção acontece.

---

## C. ~~As perguntas dos MVPs 1 e 2 que continuam sem resposta~~ — **nenhuma continua**

⚠️⚠️ **ESTA SEÇÃO ESVAZIOU EM 2026-09-18, e é a primeira vez em três MVPs que isso acontece.**
As onze que restavam foram respondidas numa rodada só: seis viraram **registro** (nada a
construir), três viraram **fatia** (38g, 38h, 38i) e duas eram "faltou alguma coisa?", com a
mesma resposta — **nada**.

O título fica riscado em vez de apagado porque a seção é **histórico**: ela explica por que o
MVP 3 tomou as decisões conservadoras que tomou, e apagá-la faria o próximo leitor achar que
elas foram gratuitas.

Elas **afetaram** o MVP 3, e eu segui com o padrão conservador, sem decidir no seu lugar:

- ✅ **Pergunta 5 do MVP 1** (abrir o app sem rede — cache de leitura) — **FECHADA em
  2026-09-17: "não — lemos em casa, com wi-fi".** ⚠️ **Ela ficou aberta por três MVPs**, e em
  cada fechamento eu escrevi que era "a coisa mais valiosa que está de fora" — inclusive
  aqui, com o argumento novo de que a notificação leva a pessoa para um app que pede rede.
  **O argumento era bom e a premissa era minha, não sua.** Com a resposta, a fatia sai do
  radar e a pergunta para de reaparecer a cada fechamento.
- ✅ **Pergunta 1 do MVP 2** (busca sem acento, `unaccent`) — ~~sem resposta, não entrou.~~
  **RESPONDIDA em 2026-09-18: fica de fora**, por decisão e não por omissão — exigiria extensão
  de banco, índice funcional e ADR novo. ⚠️ **E está registrado lá, com todas as letras, que na
  minha leitura ela é a pergunta fechada com MAIOR chance de voltar no uso real.**
- **Pergunta 2 do MVP 1** (entra mais gente no clube?) — o MVP 3 assumiu **"duas hoje, mais
  amanhã"**, e desta vez com consequência medida: o feed é uma **frase por linha**, e o leque
  de notificação percorre **todos os membros ativos** menos o autor. Nenhum dos dois assume
  duas pessoas; mas **o desenho anti-placar é mais difícil com dez** do que com duas, e essa é
  a hora de você dizer se o clube vai crescer. ✅ **RESPONDIDA em 2026-09-18: duas pessoas, por
  ora**, com o gatilho de reabertura escrito na própria pergunta — **antes** do terceiro
  convite, não depois. ⚠️ E o aviso acima envelheceu bem: o foguinho entrou depois disto, e com
  dez pessoas ele **é** um ranking.
- ✅ **Pergunta 7 do MVP 1** (manter o inglês?) — **FECHADA em 2026-09-17: "só português —
  apagar o inglês".** E o aviso de que o custo **subia a cada MVP** se confirmou na conta
  final: além dos dois catálogos, sai a maquinaria inteira da **Tarefa 29a**, que só existe
  por causa do `en`. **É fatia própria**, está no `docs/BACKLOG.md`, e a lista do que sai está
  na resposta da pergunta.
- ✅ **Perguntas 3, 4, 6 e 8 do MVP 1** — ~~sem resposta, e nenhuma bloqueou o MVP 3.~~
  **TODAS RESPONDIDAS em 2026-09-18**, e nenhuma gerou fatia: a nota arquivada fica como está
  (o comportamento passa a ser documentado em vez de acidental), arquivar livro é MVP 4, criar
  avulsa offline fica como está, e "faltou alguma coisa no MVP 1?" fechou com **nada**.
- ✅ **Perguntas 2, 3, 4 e 7 do MVP 2** — respondidas em 2026-09-18. Duas delas geraram as
  **três fatias** desta rodada: o campo de texto no acervo (**38g**) e os dois eixos novos do
  grifo — **faixa de página** (38h) e **dia do plano** (38i).
- ✅ **Pergunta 5 do MVP 2** (o número de resultados na tela) — **respondida em 2026-09-17, e
  ela é a mais sutil das quatro.** O gatilho que ela mesma escreveu (*"se você quiser o número,
  diga explicitamente"*) **disparou** — você pediu o foguinho. Mas a guarda **não foi
  relaxada**, e o contador de resultados **continua fora**: leia a resposta lá, porque a
  diferença entre "um número" e "este número" é o que manteve a rede de pé.
- ⚠️ **O que continua sem dono, e não é pergunta:** a busca corta em **500** e **não avisa**.
  O conserto honesto não é o contador — é o **servidor** dizer que truncou, e isso é mudança de
  contrato da API. ⚠️ **Fica mais provável de doer agora**, porque a 38g põe um campo de texto
  no acervo e você vai buscar mais.

---

## D. Considerações do dono

> Texto livre. O que te incomodou, o que te surpreendeu, o que você mudaria.

_(a preencher)_

---

## E. Veredito

- [ ] **MVP 3 fechado** — data: ____
- [ ] Pendências que entram no MVP 4: ____

⚠️ **Lembrete de quem executou:** o MVP 3 **não fecha comigo.** Eu escrevi as specs, despachei
executor e revisor, verifiquei os gates e repeti por conta própria a mutação do achado mais
grave de cada fatia. O que eu **não** posso fazer é dizer se "ver onde estamos no livro" como
**presença** é o que você queria quando escreveu aquela frase. Isso é a pergunta 1, e é sua.

---
