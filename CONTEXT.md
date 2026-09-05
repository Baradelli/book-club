# CONTEXT — Linguagem ubíqua do "Clube do Livro"

> Glossário canônico do projeto. Só termos e seus significados — sem decisões de
> implementação (essas vão em `docs/adr/`) e sem visão de produto (essa vive em
> `docs/plano-clube-do-livro.md`). Código em inglês, conteúdo ao usuário em português.
>
> Se um termo aparecer no código sem estar aqui, ou aqui sem estar no código, um dos dois
> está errado. Atualize este arquivo junto com a tarefa que introduz o termo.

---

## Grupo e pessoas

- **Club (Clube)** — o clube do livro: um grupo de pessoas que lê os mesmos livros. É a
  unidade de tenant do sistema: todo conteúdo pertence a um clube. Tem `name`, `timezone`
  (fuso padrão do clube) e soft delete.
- **Membership (Participação)** — o vínculo entre uma pessoa e um clube, com um **papel**:
  `OWNER` (quem criou / dono do clube, não pode ser removido) · `ADMIN` (pode cadastrar
  livro e plano, convidar e mudar papéis) · `MEMBER` (lê, escreve e grifa). Uma pessoa pode
  ter vários memberships — daí o **clube ativo** na interface.
- **Clube ativo** — o clube que a pessoa está vendo agora. Escolhido num seletor no topo do
  app e guardado localmente. Não é estado de servidor.
- **Super-admin** — `User.isSuperAdmin`. Papel de **plataforma**, não de clube: cria clubes,
  cria pessoas, reseta senha. É o dono do sistema, não o dono de um clube.
- **Invite (Convite)** — um convite para entrar num clube: `code` (o que vai no link),
  `role` que a pessoa receberá, quem criou, validade e **uso único**. Aceitar o convite é
  como a pessoa entra no sistema e define a própria senha. **Não existe cadastro aberto.**

## Livro e plano de leitura

- **Book (Livro)** — o livro que o clube está lendo, cadastrado por um admin do clube. Tem
  `title`, `author`, `month` (o mês do clube, `YYYY-MM`), capa opcional, total de páginas
  opcional e soft delete. Aparece para **todos** do clube.
- **ReadingPlanItem (Leitura do dia)** — uma linha do plano de leitura: a **meta de leitura
  daquele dia**, com `date` (dia local), `order`, `title` (o tema pré-definido — "Cap. 3 —
  A promessa") e `reference` (texto livre: "p. 45-62"). É o que faz a anotação do dia já
  nascer com assunto definido.
- **Plano de leitura** — a lista ordenada de `ReadingPlanItem` de um livro. Definido no
  cadastro do livro; editável pelo admin do clube.
- **Leitura de hoje** — o `ReadingPlanItem` cuja `date` é o dia de hoje no fuso do usuário.
  Calculado, nunca guardado.

## O que a pessoa escreve

- **Note (Anotação)** — o que uma pessoa escreveu, em **ProseMirror JSON** (`doc`) mais o
  `plainText` derivado. Tem dois tipos (`kind`):
  - **`PLAN` (Anotação do dia)** — ligada a um `ReadingPlanItem`. **Uma por pessoa por dia
    de leitura** — abrir a leitura de hoje e escrever sempre mexe na mesma nota. O título
    vem do tema pré-definido.
  - **`FREE` (Anotação avulsa)** — sem dia de leitura. **Sem limite de quantidade.** A
    pessoa escolhe o `title` (obrigatório) e informa a `reference` em texto livre (página,
    capítulo ou assunto).
- **NoteDoc** — o `doc` da anotação: o **ProseMirror JSON** do editor, gravado como veio.
  O domínio não interpreta `attrs` nem `marks`, só atravessa — é o que deixa uma extensão
  nova do editor entrar sem migração. `assertNoteDoc` é o único portão de entrada dele:
  estreita `unknown` e **não reescreve** o JSON.
- **`plainText` derivado** — o texto puro da anotação, calculado no **backend** pelo helper
  puro `docToText(doc)` a **cada escrita**. Alimenta a busca (`ILIKE`) e a prévia de
  listagem. **Nunca entra no input da API** — nenhum cliente manda `plainText`.
  → `docs/adr/0001-*.md`.
- **PlanItemWriter (Quem escreveu no dia)** — o par (`planItemId`, `userId`): "esta pessoa
  escreveu neste dia de leitura". É o mínimo da **sobreposição de autoria** na tela do livro,
  e não carrega a anotação de propósito — o `doc` é a maior coluna da tabela. **Sempre
  calculado** a partir das anotações ativas, nunca guardado num contador: da mesma família do
  **progresso do grupo**.
- **Sobreposição de autoria (`PlanItemWriters`)** — os pares acima **agrupados por dia, na
  ordem do plano**: uma entrada por dia que tem anotação, com os autores ordenados. Dia em
  que ninguém escreveu **não aparece** — o front sobrepõe no plano que ele já tem. Vem
  pronta em `GET /books/:bookId` (o campo `writers`, ao abrir o livro) **e** sozinha em
  `GET /books/:bookId/writers` (para atualizar só as bolinhas depois de alguém escrever).
  As duas saem da MESMA função pura, `groupWritersByPlanItem` no `domain/`: duas cópias
  divergiriam, e a divergência apareceria como uma bolinha que muda ao recarregar.
- **Filtro Tudo · Minhas · de \<pessoa\>** — a lente sobre o acervo de anotações e grifos do
  clube. É **navegação, não permissão**: dentro do clube não existe conteúdo privado, e o
  filtro nunca deve ser apresentado, rotulado ou implementado como privacidade.
  → `docs/adr/0002-*.md`.
- **Highlight (Grifo)** — um trecho que a pessoa grifou no livro físico, registrado no app:
  `quote` (o trecho), `color` (a cor com que grifou), `page` e/ou `reference`, e um
  **comentário rich-text** (`commentDoc`) — a nota da pessoa sobre aquele grifo. É uma
  **entidade própria**: existe sem depender de haver anotação naquele dia.
  → `docs/adr/0004-*.md`.
- **Attachment (Anexo)** — arquivo enviado (imagem colada no editor, foto da página).
  Pertence a quem enviou e ao clube.
- **NoteLink (Link entre notas)** — aresta materializada derivada das menções `@` /
  wikilinks `[[` dentro do `doc`. Recalculada a cada salvamento.

## Ritmo do grupo

- **ReadingLog (Registro de leitura)** — "eu li o trecho de hoje". **Log imutável**: não se
  arquiva nem se edita. Único por (`planItemId`, `userId`). Desmarcar = **hard delete** — a
  exceção documentada à imutabilidade.
- **Progresso do grupo** — quantas leituras do plano cada pessoa já registrou, e onde o clube
  está no livro. **Sempre calculado** dos `ReadingLog`, nunca guardado.
- **ActivityEvent (Atividade)** — log imutável do que aconteceu no clube: alguém leu
  (`READ`), escreveu uma nota (`NOTE`) ou registrou um grifo (`HIGHLIGHT`). Alimenta o
  **feed** e dispara o push. Não se arquiva.
- **Feed de atividade** — a lista recente de `ActivityEvent` do clube ativo. É o histórico
  das notificações dentro do app.

## Configuração e notificação

- **Settings (Preferências)** — por usuário: `timezone`, `locale`, `reminderTime` (`HH:mm` do
  lembrete de leitura), `reminderEnabled` e `notifyGroupActivity`.
- **PushSubscription (Inscrição de push)** — o endpoint do navegador que recebe as
  notificações. Desativação é **soft** (`disabledAt`) quando o provedor responde 404/410.
- **NotificationDelivery (Entrega)** — a marca de que um push já foi enviado para
  (`userId`, `kind`, `localDate`). É o que garante **idempotência** do disparo.
- **READING_REMINDER** — o lembrete no horário escolhido. Suprimido se a pessoa já registrou
  a leitura de hoje (princípio anti-culpa: não cobra quem já fez).
- **GROUP_ACTIVITY** — o push disparado pela atividade de outra pessoa do clube. É o
  mecanismo de incentivo mútuo.

## Camadas (DDD-lite) — termos de arquitetura

- **UseCase** — uma classe com um `execute(input)`. Contém a regra de negócio. Não conhece
  Fastify nem Prisma.
- **Repository (port)** — a interface de persistência de uma entidade
  (`save`/`byId`/`update`/`find`/`delete`). Duas implementações: Prisma e **fake em memória**.
- **Fake** — a implementação em memória do repository, usada em todo teste de UseCase. Expõe
  um getter `saved` para o teste inspecionar.
- **Rota** — o plugin Fastify. Valida com Zod, resolve o tenant do JWT, chama o UseCase e
  traduz erro de domínio em status HTTP.
- **Domínio** — entidades, tipos e helpers puros (`dayRange`, `docToText`). Sem I/O.
- **CalendarDay** — um **dia de calendário**, no formato `"YYYY-MM-DD"`, representado como
  `string` no domínio. Não é um instante: não tem hora nem fuso. É o tipo do
  `ReadingPlanItem.date`. A conversão para a coluna `@db.Date` acontece só no repositório.
  Existe para que "o plano do dia 5" nunca dependa de qual fuso alguém escolheu — o bug
  clássico de representar dia de calendário como `Date`. Validado por `isCalendarDay`
  (e `isClubMonth`, para o `"YYYY-MM"` do `Book.month`). Distinto de `dayRange`, que é o
  caminho oposto: converte um dia de calendário no **intervalo de instantes** que ele
  cobre num fuso, e é o que se usa para responder "que dia é hoje".
