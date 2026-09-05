# Clube do Livro — Plano Geral do Projeto

> Documento de alinhamento. Descreve o sistema que vamos construir, as decisões já
> tomadas, o modelo de dados, os módulos e o roteiro por MVPs. Serve de fonte da verdade
> conceitual — **contexto, não instrução operacional**. As regras que o agente segue estão
> em `CLAUDE.md`; a ordem das tarefas está em `docs/BACKLOG.md`.

---

## 1. A dor, o objetivo e os princípios

Ler junto funciona muito melhor do que ler sozinho — mas só quando alguém segura o ritmo.
Eu e minha esposa começamos livros que morrem na terceira semana, e o que a gente comenta
sobre o que leu se perde na conversa. Falta duas coisas: **um ritmo combinado** ("hoje é o
capítulo 3, para os dois") e **um lugar onde o que cada um escreveu fica visível para o
outro**. O objetivo é um clube do livro onde o livro do mês já vem com um plano de leitura
por dia, cada um escreve sua anotação daquele trecho, registra seus grifos, e vê o do outro.

O clube inicial é de casal. Mas nada no sistema pode assumir duas pessoas: convidar mais
gente, ou abrir um segundo clube, tem que ser cadastro, não refactor.

### Princípios

- **Atrito mínimo.** O caso crítico é escrever no celular, à noite, na cama, com uma mão.
  Abrir o app e estar escrevendo o trecho de hoje custa dois toques. No segundo em que
  anotar virar trabalho, o clube morre.
- **Princípio anti-culpa.** O sistema **não pune ausência de registro; valoriza qualquer
  registro útil.** Quem está atrasado não vê dívida vermelha nem "você falhou 3 dias" — vê a
  leitura de hoje e um convite para escrever. O lembrete não chega para quem já leu. Atraso
  é normal; o app existe para retomar, não para cobrar.
- **Incentivo por presença, não por comparação.** A atividade do outro é o que puxa: "ela
  escreveu sobre o capítulo 4". Nunca um ranking, nunca um placar de quem leu mais.
- **Tudo compartilhado, e isso é decisão.** Dentro do clube, todo mundo vê tudo. O filtro
  ("Tudo / Minhas / de X") é **navegação, não permissão**. Não existe nota privada — porque
  a nota que ninguém lê não é clube do livro, é diário. → `docs/adr/0002-*.md`.
- **Núcleo vivo cedo, não sistema completo no dia 1.** O menor circuito de valor é: existe
  um livro com plano, eu abro o dia de hoje e escrevo, e o outro vê. Tudo o mais cresce
  sobre uso real.
- **O editor é a experiência.** É a tela onde a pessoa passa o tempo dela. A barra auxiliar,
  o menu `/` e os grifos coloridos não são detalhe de acabamento — são o produto.
  → `docs/EDITOR.md`.

---

## 2. Princípio central: o livro é do grupo, a anotação é da pessoa

Duas metades que não se misturam:

- **Do grupo:** o livro, o plano de leitura, o ritmo. Quem manda é o admin do clube. Todo
  mundo vê a mesma coisa, ao mesmo tempo, no mesmo trecho. É isso que faz a conversa
  acontecer — se cada um lê o que quer, não há clube.
- **Da pessoa:** a anotação e o grifo. Só o autor escreve, edita e arquiva. Nem o admin do
  clube mexe. O grupo **lê** o que a pessoa escreveu; não interfere.

Todo desenho de tela e toda permissão sai dessa divisão. Quando surgir dúvida de "quem pode
fazer isso?", a pergunta é: isso é do ritmo do grupo, ou é da escrita de alguém?

---

## 3. Decisões de arquitetura já tomadas

- **Um único PWA responsivo, não dois shells.** `packages/app` é mobile-first e também serve
  no desktop; as telas de admin só ganham layout mais largo. Manter dois shells dobraria as
  telas para ganhar liberdade de layout que este app não precisa.
- **Multi-clube desde o dia 1, via `Membership`.** O modelo `user × club × role` nasce na
  primeira migration. Nunca vai existir a versão "um clube só" — porque migrar depois mexe em
  toda query, toda rota e toda tela. → `docs/adr/0005-*.md`.
- **O tenant é o clube, e ele é verificado em toda leitura.** `req.user.sub` + `Membership`
  ativo. Sem membership, 404 — não 403, para não confirmar que o recurso existe.
- **Convite por link com código, sem SMTP.** O admin gera o link, passa por WhatsApp, a
  pessoa abre e define a própria senha. Zero infraestrutura de e-mail, zero custo, zero
  provedor para configurar. → `docs/adr/0003-*.md`.
- **Plano de leitura com datas.** Cada dia do livro tem `date`, `title` (o tema) e
  `reference`. É isso que permite "a leitura de hoje", o lembrete no horário e "onde o grupo
  está". A alternativa (sequência sem datas, cada um no seu ritmo) foi descartada: sem data
  comum não há clube, só notas paralelas.
- **A anotação do dia é única por pessoa por leitura.** `unique(planItemId, userId)`. Abrir
  o dia de hoje sempre cai na mesma nota; comparar "o que cada um escreveu sobre o cap. 3"
  vira uma listagem trivial. Já a **anotação avulsa é ilimitada** — é a válvula de escape
  para tudo que não cabe no plano.
- **O documento da nota é ProseMirror JSON, nunca HTML.** O `plainText` é derivado no
  backend a partir do `doc` e nunca entra no input da API. → `docs/adr/0001-*.md`.
- **Grifo é entidade própria.** `Highlight` existe independente de haver nota naquele dia,
  tem tela própria e filtro por cor. Ficar como bloco dentro da nota impediria o caso real:
  registrar um grifo sem escrever anotação. → `docs/adr/0004-*.md`.
- **Logs imutáveis para o ritmo.** `ReadingLog` e `ActivityEvent` não têm `status` nem
  `archivedAt`. Desmarcar "li" é hard delete — a única exceção, documentada.
- **Progresso é sempre calculado.** Nada de contador denormalizado que sai de sincronia.
- **Push VAPID com dispatcher pull-based.** Sem cron dentro do processo: um script chamado
  por cron externo a cada 5–10 min, com idempotência garantida por claim no banco.
  → `docs/adr/0006-*.md` e `docs/NOTIFICACOES.md`.
  > _Nota de atenção:_ no projeto que serviu de referência, essa feature nasceu furando as
  > camadas (`$queryRaw` direto na rota) e sem um único teste. Aqui ela entra com port,
  > fake e teste como qualquer outra.
- **Offline Nível 1 apenas.** Rascunho local da nota + fila de escrita em IndexedDB. Sem
  resolução de conflito (Nível 2) — se duas pessoas editassem a mesma nota haveria conflito,
  mas a nota tem um autor único, então não há.

---

## 4. Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Monorepo | pnpm workspaces, `packages/{shared,ui,backend,app}` | Um schema Zod e um editor servindo back e front sem duplicação; `pnpm -r` basta, sem Turborepo |
| Backend | Node 20+ · TypeScript · Fastify 5 | Rápido, plugin-based, e o type provider do Zod dá tipagem ponta a ponta |
| Validação/Docs | Zod 3 · `fastify-type-provider-zod` · Swagger | Um schema valida, infere o tipo e gera o OpenAPI |
| Banco | PostgreSQL · Prisma 5 | Relacional resolve clube/membro/livro/plano com integridade; migrations versionadas |
| Front | React 18 · Vite 5 · `vite-plugin-pwa` | PWA instalável no celular sem loja; build simples |
| Router | `react-router-dom` 7 | URL por página — o link para "a leitura de hoje" precisa ser compartilhável |
| Estilo | Tailwind v4 (`@tailwindcss/vite`) + tokens CSS | Sem arquivo de config; tema claro/escuro por custom properties |
| Editor | TipTap 2.10 + `@tiptap/suggestion` | ProseMirror com extensões; é o editor que já está aprovado |
| Formulários | React Hook Form + `@hookform/resolvers/zod` | O mesmo schema do backend valida a tela |
| i18n | react-i18next (pt default, en) | Nenhum texto solto; abre a porta para um clube em outra língua |
| Datas | Luxon **no backend** · `Intl.DateTimeFormat` no front | Fuso correto no servidor sem empacotar Luxon no PWA |
| Push | `web-push` (VAPID) + Workbox | Notificação sem app de loja e sem serviço de terceiro |
| Testes | Vitest | Um runner para os quatro pacotes |

---

## 5. Arquitetura e fluxo de desenvolvimento

### Camadas (DDD-lite)

Entidades simples, sem o arsenal tático completo de DDD (sem value objects/agregados/eventos
de domínio por ora). O que importa é a separação que torna o domínio testável sem
infraestrutura:

```
Rota/Controller (Fastify)  →  UseCase  →  Repository (interface)  →  Prisma
        ↑ valida com Zod       ↑ regra      ↑ contrato de            ↑ implementação real
        ↑ resolve o tenant     de negócio   persistência       (+ fake em memória nos testes)
        (borda)
```

O tenant (`clubId` + `Membership` ativo) é resolvido **na borda** e entra no UseCase como
dado já confiável. O UseCase não sabe o que é um JWT.

### Fluxo de trabalho (TDD + DDD, outside-in)

Para cada caso de uso, nesta ordem:

1. **Definir o domínio** — só da fatia atual (não modelar o sistema inteiro; evita paralisia).
2. **Criar o caso de uso** (assinatura/contrato).
3. **Escrever os testes** do caso de uso (usando o Repository fake).
4. **Implementar o mínimo** para passar.
5. **Rodar os testes** (red → green).
6. **Refatorar** (green mantém).
7. **Só então** criar controller/rota/tela por cima.

### Política de testes (calibrada — TDD a serviço de entregar o app)

- **UseCases / domínio** → TDD estrito, cobertura alta. É onde vivem as regras que doem se
  quebrarem: papel de admin, unicidade da nota do dia, datas do plano.
- **Repository** → um **teste de contrato** contra a implementação Prisma real, por entidade.
  Poucos, mas existem — é o que pega o índice único esquecido.
- **Rotas** → **integração nos caminhos críticos**: criar/editar nota ponta a ponta, Zod
  rejeitando entrada inválida, e **o corte de tenant** (membro de outro clube recebe 404).
  Esse último não é opcional: é a única barreira entre dois clubes.
- **UI/telas** → teste só nos fluxos que quebram em silêncio: autosave do editor e fila
  offline. O resto eu valido usando — eu sou o QA.

> Calibragem mudaria se o objetivo fosse _praticar TDD a fundo_. Aqui o objetivo é entregar o
> app; o TDD serve a isso.

---

## 6. Modelo de dados

> **Regra de idioma:** todo o código, schema e banco em **inglês** (tabelas, colunas,
> entidades, enums, funções, rotas). O **português** fica restrito ao conteúdo que o usuário
> vê (textos de UI, via i18n). As explicações abaixo seguem em português por serem
> documentação para o dono; os identificadores são os reais.

### Entidades

**Pessoas e grupo:** `User` (com `isSuperAdmin`) · `Club` · `Membership` (papel) · `Invite`
· `Settings` (por usuário).
**Livro e ritmo:** `Book` · `ReadingPlanItem` · `ReadingLog`.
**Escrita:** `Note` (`PLAN` | `FREE`) · `Highlight` · `Attachment` · `NoteLink`.
**Atividade e push:** `ActivityEvent` · `PushSubscription` · `NotificationDelivery`.

### Relações

```
User ──< Membership >── Club ──< Book ──< ReadingPlanItem
 │                        │       │            │
 │                        │       │            └──< ReadingLog >── User
 │                        │       │
 │                        │       ├──< Note ──(planItemId?)──> ReadingPlanItem
 │                        │       │      └──< NoteLink >── Note
 │                        │       └──< Highlight
 │                        └──< Invite
 ├──< Settings (1:1)
 ├──< PushSubscription
 ├──< NotificationDelivery
 ├──< Attachment
 └──< ActivityEvent >── Club
```

Leitura do diagrama: **tudo pende de `Club`** (o tenant) e **quase tudo pende de `User`** (o
autor). `Note` é o único nó com um pai opcional: com `planItemId` é a anotação do dia; sem,
é avulsa.

### Esqueleto Prisma (referência — o schema real nasce na Tarefa 03)

```prisma
enum GeneralStatus { ACTIVE ARCHIVED }
enum MemberRole    { OWNER ADMIN MEMBER }
enum NoteKind      { PLAN FREE }

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  passwordHash String?
  isSuperAdmin Boolean  @default(false)
  createdAt    DateTime @default(now())

  memberships   Membership[]
  settings      Settings?
  notes         Note[]
  highlights    Highlight[]
  readingLogs   ReadingLog[]
  activity      ActivityEvent[]
  attachments   Attachment[]
  invitesMade   Invite[]  @relation("InviteCreator")
  invitesUsed   Invite[]  @relation("InviteUser")
  subscriptions PushSubscription[]
  deliveries    NotificationDelivery[]
}

model Club {
  id         String        @id @default(cuid())
  name       String
  timezone   String        @default("America/Sao_Paulo")
  status     GeneralStatus @default(ACTIVE)
  archivedAt DateTime?
  createdAt  DateTime      @default(now())

  memberships Membership[]
  invites     Invite[]
  books       Book[]
  notes       Note[]
  highlights  Highlight[]
  activity    ActivityEvent[]
}

model Membership {
  id       String        @id @default(cuid())
  userId   String
  clubId   String
  role     MemberRole    @default(MEMBER)
  status   GeneralStatus @default(ACTIVE)
  joinedAt DateTime      @default(now())

  user User @relation(fields: [userId], references: [id])
  club Club @relation(fields: [clubId], references: [id])

  @@unique([userId, clubId])
  @@index([clubId, status])
}

model Invite {
  id          String     @id @default(cuid())
  clubId      String
  code        String     @unique
  role        MemberRole @default(MEMBER)
  createdById String
  expiresAt   DateTime
  usedAt      DateTime?
  usedById    String?
  createdAt   DateTime   @default(now())

  club      Club  @relation(fields: [clubId], references: [id])
  createdBy User  @relation("InviteCreator", fields: [createdById], references: [id])
  usedBy    User? @relation("InviteUser", fields: [usedById], references: [id])
}

model Settings {
  id                  String  @id @default(cuid())
  userId              String  @unique
  timezone            String  @default("America/Sao_Paulo")
  locale              String  @default("pt")
  reminderTime        String  @default("21:00")  // HH:mm, validado por regex no Zod
  reminderEnabled     Boolean @default(true)
  notifyGroupActivity Boolean @default(true)

  user User @relation(fields: [userId], references: [id])
}

model Book {
  id          String        @id @default(cuid())
  clubId      String
  title       String
  author      String?
  month       String        // "YYYY-MM" — o mês do clube
  coverUrl    String?
  totalPages  Int?
  createdById String
  status      GeneralStatus @default(ACTIVE)
  archivedAt  DateTime?
  createdAt   DateTime      @default(now())

  club       Club              @relation(fields: [clubId], references: [id])
  planItems  ReadingPlanItem[]
  notes      Note[]
  highlights Highlight[]

  @@index([clubId, status])
}

model ReadingPlanItem {
  id        String   @id @default(cuid())
  bookId    String
  order     Int
  date      DateTime @db.Date  // dia local do clube
  title     String            // o tema pré-definido: "Cap. 3 — A promessa"
  reference String?           // texto livre: "p. 45-62"
  createdAt DateTime @default(now())

  book Book         @relation(fields: [bookId], references: [id])
  logs ReadingLog[]
  notes Note[]

  @@unique([bookId, date])
  @@unique([bookId, order])
  @@index([bookId, date])
}

// Log imutável: sem status, sem archivedAt. Desmarcar = hard delete.
model ReadingLog {
  id         String   @id @default(cuid())
  planItemId String
  userId     String
  readAt     DateTime @default(now())

  planItem ReadingPlanItem @relation(fields: [planItemId], references: [id])
  user     User            @relation(fields: [userId], references: [id])

  @@unique([planItemId, userId])
}

model Note {
  id         String        @id @default(cuid())
  clubId     String
  bookId     String
  userId     String
  kind       NoteKind
  planItemId String?       // preenchido só quando kind = PLAN
  title      String
  reference  String?       // texto livre — usado pelas avulsas
  doc        Json          // ProseMirror JSON — a fonte da verdade
  plainText  String        @default("")  // DERIVADO do doc, no backend
  status     GeneralStatus @default(ACTIVE)
  archivedAt DateTime?
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  club     Club             @relation(fields: [clubId], references: [id])
  book     Book             @relation(fields: [bookId], references: [id])
  user     User             @relation(fields: [userId], references: [id])
  planItem ReadingPlanItem? @relation(fields: [planItemId], references: [id])
  outgoing NoteLink[]       @relation("NoteLinkFrom")
  incoming NoteLink[]       @relation("NoteLinkTo")

  // Uma anotação do dia por pessoa por leitura. As avulsas (planItemId = null)
  // não são afetadas: no Postgres, NULL nao colide em unique.
  @@unique([planItemId, userId])
  @@index([bookId, userId])
  @@index([clubId, createdAt])
}

model Highlight {
  id             String        @id @default(cuid())
  clubId         String
  bookId         String
  userId         String
  quote          String
  color          String        // hex da paleta do clube — validado por z.enum/regex
  page           Int?
  reference      String?
  commentDoc     Json?         // comentário rich-text, mesmo editor
  commentText    String        @default("")  // derivado
  status         GeneralStatus @default(ACTIVE)
  archivedAt     DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  club Club @relation(fields: [clubId], references: [id])
  book Book @relation(fields: [bookId], references: [id])
  user User @relation(fields: [userId], references: [id])

  @@index([bookId, userId])
  @@index([bookId, color])
}

model Attachment {
  id        String   @id @default(cuid())
  clubId    String
  userId    String
  filename  String
  mimeType  String
  size      Int
  url       String
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}

model NoteLink {
  id         String @id @default(cuid())
  clubId     String
  fromNoteId String
  toNoteId   String

  from Note @relation("NoteLinkFrom", fields: [fromNoteId], references: [id])
  to   Note @relation("NoteLinkTo",   fields: [toNoteId],   references: [id])

  @@unique([fromNoteId, toNoteId])
  @@index([toNoteId])
}

// Log imutável. Alimenta feed e push.
model ActivityEvent {
  id        String   @id @default(cuid())
  clubId    String
  userId    String
  type      String   // "READ" | "NOTE" | "HIGHLIGHT" — validado por z.enum
  bookId    String?
  refId     String?  // id do ReadingLog / Note / Highlight
  createdAt DateTime @default(now())

  club Club @relation(fields: [clubId], references: [id])
  user User @relation(fields: [userId], references: [id])

  @@index([clubId, createdAt])
}

model PushSubscription {
  id         String    @id @default(cuid())
  userId     String
  endpoint   String    @unique
  p256dh     String
  auth       String
  platform   String    // "web" | "mobile" — validado por z.enum
  userAgent  String?
  disabledAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@index([userId, disabledAt])
}

model NotificationDelivery {
  id          String   @id @default(cuid())
  userId      String
  kind        String   // "READING_REMINDER" | "GROUP_ACTIVITY" | "TEST"
  localDate   String   // "YYYY-MM-DD" no fuso do usuário
  deliveredAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, kind, localDate])
  @@index([userId, deliveredAt])
}
```

### Como os casos reais caem nesse modelo

| Caso real | No modelo |
|---|---|
| "Livro de outubro: Hábitos Atômicos" | um `Book` com `month = "2026-10"` |
| "Dia 5: Cap. 2 — O poder dos hábitos, p. 30-48" | um `ReadingPlanItem` |
| "Abri hoje e escrevi sobre o cap. 2" | `Note` `kind=PLAN` com `planItemId` — a mesma sempre |
| "Quero anotar uma ideia que veio da página 112" | `Note` `kind=FREE`, título meu, `reference="p. 112"` |
| "Grifei essa frase de amarelo e quero comentar" | um `Highlight` com `color`, `page`, `commentDoc` |
| "Terminei a leitura de hoje" | um `ReadingLog` + um `ActivityEvent` `READ` |
| "Ela escreveu, quero saber" | `ActivityEvent` `NOTE` → push `GROUP_ACTIVITY` + linha no feed |
| "Só quero ver o que EU escrevei do cap. 3" | `listNotes({ bookId, planItemId, authorId: eu })` |
| "Convidei minha esposa" | um `Invite` com `code`, ela aceita → `User` + `Membership` |
| "Quero abrir um clube com os amigos" | outro `Club`, outros `Membership` — nada muda no código |

---

## 7. Fluxos principais

**Entrar no clube.** O super-admin cria o `Club`. Um admin do clube gera um `Invite` (papel +
validade) e manda o link. A pessoa abre `/convite/<code>`, informa nome e senha, e o aceite
cria o `User` (se não existir) e o `Membership`. Não há cadastro aberto em nenhum lugar.

**Cadastrar o livro do mês.** O admin do clube preenche título, autor, mês, e monta o **plano
de leitura**: uma lista de linhas `data · tema · referência`. A tela é desktop-friendly (é
digitação em volume). O livro aparece na home de todos do clube imediatamente.

**Escrever a anotação do dia.** A home mostra o livro corrente e a **leitura de hoje**. Um
toque abre o editor já com o tema no título. Autosave a cada 1,5 s; sem rede, vira rascunho
local e entra na fila. Se eu já tinha escrito hoje, abro a mesma nota e continuo.

**Anotar algo fora do plano.** "Nova anotação avulsa": eu escolho o título e escrevo a
referência em texto livre. Sem limite de quantas.

**Registrar um grifo.** Aba de grifos do livro: trecho, cor, página/referência e um
comentário no mesmo editor. Independe de ter escrito a anotação do dia.

**Ver o que o grupo escreveu.** Em qualquer listagem (anotações ou grifos), o filtro geral:
**Tudo · Minhas · de \<pessoa\>**, mais **pré-definidas × avulsas** e por leitura/capítulo,
mais cor no caso dos grifos.

**Marcar que li.** Um toque na leitura de hoje cria o `ReadingLog`. O progresso do grupo no
livro é recalculado na hora. Desmarcar apaga o log.

**Ser lembrado, e lembrar o outro.** No `reminderTime`, quem ainda não registrou a leitura de
hoje recebe o `READING_REMINDER`. E toda vez que alguém lê, escreve ou grifa, o resto do
clube recebe um `GROUP_ACTIVITY` e vê a linha no feed.

---

## 8. Roteiro por MVPs

A regra: **cada MVP já é útil sozinho**, e o primeiro corte é o menor circuito de valor
possível. O banco já nasce preparado para o futuro (multi-clube, papéis, anexos), mas só
construímos o que cada MVP precisa.

- **MVP 1 — Núcleo de leitura (o clube nasce vivo).**
  `User`, `Club`, `Membership`, `Invite`, `Settings`, `Book`, `ReadingPlanItem`, `Note`,
  `Attachment`, `NoteLink`. Convite por link + login; seletor de clube; cadastro de livro com
  plano de leitura; home com os livros do clube; tela do livro com o plano e o dia de hoje
  destacado; **anotação do dia no editor**; anotação avulsa; filtro básico (Tudo / Minhas /
  de X); offline nível 1. Sem grifos, sem push, sem feed.
  _Se eu e ela abrirmos isso todo dia para escrever, o clube existe._
- **MVP 2 — Grifos e filtros.**
  `Highlight`. Tela de grifos por livro, com o mesmo editor no comentário; filtro por cor e
  por autor; e o filtro completo das anotações (pré-definida × avulsa, por leitura/capítulo,
  busca por texto no `plainText`).
  _É o que transforma o app de "diário de leitura" em acervo consultável do clube._
- **MVP 3 — Ritmo e incentivo.**
  `ReadingLog`, `ActivityEvent`, `PushSubscription`, `NotificationDelivery`. Marcar "li";
  progresso do grupo no livro (calculado); feed de atividade na home; push VAPID — lembrete
  no horário (suprimido para quem já leu) e atividade do grupo em tempo real.
  _É a parte que faz um puxar o outro; sem ela o clube depende de disciplina individual._
- **MVP 4 — Administração.**
  Área **super-admin** (criar clube, criar pessoa, resetar senha, arquivar clube) e
  **gerência do clube** (membros e papéis, convites ativos e revogação, editar o plano de
  leitura em lote / colar uma lista, arquivar livro). Layout desktop.
  _Hoje eu resolvo isso no seed e no banco; isso vira insustentável quando entrar o segundo
  clube._

### Fora de escopo (registrado, sem data)

IA de qualquer tipo (resumo de capítulo, perguntas de discussão, sugestão de grifo) · OCR de
foto de página · busca semântica/embeddings · reação, curtida e comentário na nota de outra
pessoa · e-mail transacional · offline nível 2 (resolução de conflito) · exportar o acervo ·
app de loja.

---

## 9. Limites e privacidade

- **Dentro do clube, não existe privacidade — e isso é intencional.** Ninguém deve escrever
  no app o que não quer que o clube leia. O filtro nunca deve ser apresentado como
  "privacidade", para não criar a expectativa errada.
- **Ninguém edita nem arquiva o que outra pessoa escreveu.** Nem `OWNER`, nem super-admin
  pela interface. Nota e grifo são do autor.
- **Sair do clube não apaga o que já foi escrito.** O `Membership` vira `ARCHIVED`; as notas
  continuam no acervo com o nome do autor. Apagar de verdade é pedido explícito da pessoa, e
  é operação manual — não tem botão.
- **Entre clubes não existe vazamento.** Toda leitura confere `Membership` ativo, e o teste de
  integração de tenant é obrigatório em toda rota de conteúdo.
- **O push nunca leva o conteúdo da nota** — só "\<pessoa\> escreveu sobre \<tema\>". O
  conteúdo se lê no app, autenticado.

---

## 10. Por onde começamos (dentro do MVP 1)

### Passo 1 — O circuito mínimo de escrita

Clube + membership + um livro com plano (cadastro tosco, sem tela bonita) e **o editor de pé
na anotação do dia**, salvando. É a fatia que prova o produto: se escrever no celular não
for gostoso, nada mais importa. Ordem: Blocos A → B → C no domínio, depois D no front,
priorizando `14` (editor) e `18` (tela da nota do dia).

### Passo 2 — O clube em volta

Convite funcionando de verdade (link → senha → membership), seletor de clube, home com os
livros, tela do livro com o plano, anotação avulsa e o filtro básico. No fim disso o MVP 1
está fechado e dá para usar de verdade por um mês.

---

## 11. Decisões em aberto / a revisitar no futuro

- **Reação / comentário na nota de outra pessoa.** É o próximo passo natural do "incentivo",
  mas muda o tom do app (de acervo para rede social). Decidir depois de um livro de uso real.
- **Paleta de grifos configurável por clube.** Hoje é uma paleta fixa de 5 cores. Se cada
  pessoa grifa com canetas diferentes, isso vira configuração do clube.
- **O que acontece quando o mês vira.** O livro antigo continua acessível (é só `month`), mas
  falta decidir se existe "livro corrente" explícito ou se é sempre derivado da data.
- **Plano de leitura que atrasa.** Se o clube inteiro atrasa uma semana, faz sentido um botão
  "empurrar o plano N dias"? Provavelmente sim, no MVP 4.
- **Agrupamento do push de atividade.** Se três pessoas escrevem no mesmo minuto, três
  notificações é ruído. Debounce curto no MVP 3; agrupamento de verdade fica em aberto.
- **Locale por pessoa vs por clube.** Hoje `Settings.locale` é da pessoa. Um clube
  multilíngue teria títulos de plano numa língua só — aceito por ora.
- **Convite para pessoa que já existe.** O aceite trata os dois casos, mas a UX de "você já
  tem conta, faça login para entrar no clube" ainda não foi desenhada.

---

_Próximo passo: `docs/BACKLOG.md`, Tarefa 01._
