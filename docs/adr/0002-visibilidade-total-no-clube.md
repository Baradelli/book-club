# ADR 0002 — Dentro do clube, tudo é visível: o filtro é navegação, não permissão

- Status: aceito
- Data: set/2026
- Fase: MVP 1 (transversal)

## Contexto

O app tem um filtro geral **Tudo · Minhas · de \<pessoa\>** nas listagens de anotações e de
grifos. Isso levanta a pergunta: existe conteúdo que só o autor vê? Uma anotação pode ser
privada? Existe rascunho que só é publicado quando a pessoa quiser?

A pergunta é de produto antes de ser técnica, porque a resposta muda o modelo de dados
(campo de visibilidade), muda toda query de leitura e muda o significado do filtro na
interface.

## Decisão

**Não existe conteúdo privado dentro de um clube.** Toda anotação e todo grifo de um clube
são visíveis para todos os membros ativos daquele clube, desde o instante em que são
salvos.

O filtro **Tudo · Minhas · de \<pessoa\>** é **navegação**: uma forma de olhar o mesmo
acervo. Ele nunca deve ser apresentado, rotulado ou explicado como privacidade.

Isso não afeta a autoria: **só o autor edita e arquiva** o que escreveu (nem `OWNER` do
clube, nem super-admin, pela interface). O grupo **lê**; não interfere.

Entre clubes a barreira é total: toda leitura confere `Membership` ativo, e sem membership a
resposta é **404** — não 403, para não confirmar a existência do recurso.

## Alternativas consideradas

- **Toggle "privada" por anotação.** Dá controle, e é o que a maioria dos apps de nota faz.
  Mas: (a) adiciona uma condição de visibilidade em toda query de leitura, que é o tipo de
  regra que se esquece numa rota nova e vaza; (b) muda o incentivo — sabendo que pode
  esconder, a pessoa escreve para si e o clube esvazia; (c) o filtro passaria a significar
  duas coisas ao mesmo tempo (o que eu escrevi × o que eu posso ver), que é a receita de
  confusão de UX.
- **Rascunho privado com botão "compartilhar com o clube".** Mais controle ainda, e resolve
  o medo de ser lido no meio da frase. Mas cria um estado extra em toda nota, exige uma tela
  de "meus rascunhos", e adiciona atrito exatamente no lugar onde o princípio é atrito
  mínimo — a pessoa precisaria lembrar de publicar. Uma anotação esquecida em rascunho é
  pior que nenhuma.
- **Visibilidade configurável por clube.** Empurra a decisão para o futuro sem resolver: o
  custo de implementação é o mesmo do toggle, e o clube teria de decidir uma política antes
  de usar o app.

## Consequências

- (+) Toda query de leitura de conteúdo tem uma única condição de visibilidade: o `clubId`
  vindo de um `Membership` ativo. Menos superfície para vazamento.
- (+) O incentivo funciona: o que o outro escreveu está lá, sempre, sem depender de ele
  lembrar de publicar.
- (+) O filtro tem um significado só, e a interface pode ser direta.
- (−) Ninguém deve escrever no app o que não quer que o clube leia — e o app precisa deixar
  isso claro (uma linha na tela de aceite do convite e nas preferências), senão alguém
  descobre do jeito ruim.
- (−) Se um dia um clube pedir nota privada, será uma feature nova, com migração e revisão
  de todas as queries. Está registrado como decisão em aberto no plano, §11.
- Sair do clube arquiva o `Membership`, mas **não** apaga o que a pessoa escreveu: o acervo
  do clube continua íntegro, com autoria. Apagar de verdade é operação manual, a pedido.
