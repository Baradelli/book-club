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

# MVP 2 — a preparar

A seção de aceite do MVP 2 nasce **no fechamento do MVP 1**, a partir das respostas acima. O
escopo previsto (`docs/BACKLOG.md`): grifos como entidade própria, o filtro completo, a tela de
acervo e a busca por texto.
