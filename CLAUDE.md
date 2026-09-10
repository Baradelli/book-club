# CLAUDE.md — Regras do projeto "Clube do Livro"

> Leia este arquivo no início de toda sessão. São as decisões inegociáveis do projeto.
> O plano completo de produto está em `docs/plano-clube-do-livro.md` — consulte para
> contexto, mas as regras operacionais que você deve seguir estão AQUI.
>
> Ordem de leitura completa dos documentos: `README-IA.md`.

## O que é o projeto

Um **clube do livro em grupo**. Um admin cria o clube, convida as pessoas e cadastra o livro
do mês **já com um plano de leitura por dia** (cada dia tem um tema pré-definido: capítulo,
subcapítulo ou assunto). Todo mundo do clube lê o mesmo trecho, escreve sua anotação do dia
no editor, registra os grifos com cor e comentário, e **vê o que os outros escreveram**.
Quando alguém marca que leu, ou escreve uma nota ou um grifo, o clube recebe uma
notificação — um incentiva o outro.

Uso inicial: um clube de casal. Mas o banco e as rotas já nascem **multi-clube e
multiusuário** — adicionar gente e criar outros clubes não pode exigir refactor.

## Stack (não trocar sem decisão explícita do dono)

- **Monorepo pnpm workspaces** com quatro pacotes:
  - `packages/shared` — schemas Zod, cliente HTTP, catálogos de i18n. Sem deps internas.
  - `packages/ui` — componentes React compartilhados, tokens de tema, **o editor TipTap**.
  - `packages/backend` — Fastify + Prisma.
  - `packages/app` — **um único PWA Vite**, mobile-first, que também serve no desktop.
- **UM shell, não dois.** O app é responsivo: mobile-first no fluxo de leitura/escrita, e as
  telas de administração (cadastrar livro + plano, gerenciar membros, área super-admin)
  ganham layout largo no desktop. **Nunca** criar `packages/web` e `packages/mobile`
  separados.
- **Backend:** Node.js 20+ + TypeScript + **Fastify 5**. Sem BFF separado — o Fastify agrega
  para o front quando precisa (ex.: `getBookWithPlan` devolve livro + plano + quem já
  escreveu).
- **Validação + Docs:** Zod 3 + `fastify-type-provider-zod` + Swagger (um schema valida,
  infere tipos e gera o OpenAPI).
- **ORM/Banco:** Prisma 5 + PostgreSQL. **Sem pgvector** — não há busca semântica no escopo.
- **Frontend:** React 18 + **Vite 5** + `vite-plugin-pwa`, NÃO Next. Router:
  `react-router-dom` 7 com URL por página. Editor: **TipTap 2.10**. Formulários: React Hook
  Form + `@hookform/resolvers/zod`. i18n: react-i18next (pt default, en).
- **Estilização: Tailwind v4 via `@tailwindcss/vite`.** **Não existe `tailwind.config.js`** —
  os tokens vivem em CSS (`packages/ui/src/theme.css`) e o app declara `@theme inline`.
  Sem CSS inline em telas reais.
- **Datas:** **Luxon só no backend.** O front calcula "que dia é hoje" com
  `Intl.DateTimeFormat` (helper `local-day.ts` em `shared/`) para não empacotar Luxon no PWA.
- **Testes:** Vitest.
- **Ícones:** `lucide-react`.

## Arquitetura — camadas (DDD-lite)

```
Rota/Controller (Fastify) → UseCase → Repository (interface) → Prisma
   valida com Zod           regra      contrato de              impl real
   (borda)                  negócio    persistência     (+ fake em memória nos testes)
```

Regras de camada que você NUNCA viola:

- A **Rota** valida com Zod e chama o UseCase. Não contém regra de negócio. Traduz erro de
  domínio em status HTTP (`instanceof` na borda, e só na borda).
- O **UseCase** contém a regra. **Não importa Fastify nem Prisma.** Recebe dados já
  validados e tipados; depende só de interfaces de Repository. Gera ids com `randomUUID()`.
- O **Repository** é uma interface. Tem 2 implementações: Prisma (produção) e **fake em
  memória** (testes). Vocabulário uniforme em todos os ports:
  `save` · `byId` · `update(id, patch)` · `find(filter)` · `delete`.
- **Entidades** simples (DDD-lite): sem value objects, agregados ou domain events por ora.

## Multi-tenant desde o dia 1 (a regra mais fácil de esquecer)

- Todo modelo de conteúdo carrega **`clubId`**; os que têm autor carregam também **`userId`**.
- O tenant do request é sempre `req.user.sub`. **Nenhum handler aceita `userId` do corpo.**
- Antes de ler ou escrever qualquer coisa de um clube, confirme que existe um `Membership`
  **ativo** daquele usuário naquele clube. Sem membership → **404** (não 403: não vazamos a
  existência do recurso).
- Ações de admin do clube (cadastrar/editar livro e plano, convidar, mudar papel) exigem
  `Membership.role` ∈ `OWNER | ADMIN`. Ações de plataforma (criar clube, criar usuário)
  exigem `User.isSuperAdmin`.
- **Ninguém edita ou arquiva conteúdo de outra pessoa.** Nota e grifo só o autor mexe; o
  admin do clube manda no livro e no plano, não no que os outros escreveram.
- **Dentro do clube não existe conteúdo privado.** Toda anotação e todo grifo são visíveis
  para os membros ativos. O filtro "Tudo · Minhas · de X" é **navegação, não permissão** —
  nunca implemente nem rotule como privacidade. → `docs/adr/0002-visibilidade-total-no-clube.md`.

## TDD — como você trabalha (outside-in), SEMPRE

Para cada caso de uso, nesta ordem:

1. Definir o mini-domínio **só da fatia atual** (não modelar o sistema inteiro).
2. Criar a assinatura/contrato do UseCase.
3. **Escrever os testes do UseCase primeiro** (com o Repository fake).
4. Implementar o mínimo para passar.
5. Rodar os testes (red → green).
6. Refatorar (mantendo verde).
7. **Só então** criar controller/rota/tela.

NUNCA escreva implementação de UseCase antes do teste dele.

## Política de testes (profundidade por camada)

- **UseCase/domínio:** TDD estrito, cobertura alta. Rápido, com Repository fake, sem banco.
- **Repository:** um teste de contrato contra o Prisma real. Poucos, mas existem.
- **Rotas:** integração só nos caminhos críticos — criar nota ponta a ponta; Zod rejeitando
  entrada inválida; **e o corte de tenant** (usuário de outro clube recebe 404).
- **UI:** só os fluxos que quebram em silêncio (autosave do editor, fila offline). O dono é
  o QA do resto.

Meta: **nunca ter medo de refatorar.** Não perseguir 100% de cobertura de UI.

## Convenções

- TypeScript estrito (`strict` + `noUncheckedIndexedAccess`). Sem `any` (use `unknown` +
  narrowing).
- Schemas Zod ficam em `shared/`; back e front importam de lá. Nunca duplicar schema.
  Nas rotas, `schema.omit({ userId: true, clubId: true })` quando o valor vem do JWT/rota.
- **Idioma: código em inglês, conteúdo em português.** Tabelas, colunas, entidades, enums,
  funções, variáveis e rotas SEMPRE em inglês (`Club`, `Membership`, `Invite`, `Book`,
  `ReadingPlanItem`, `ReadingLog`, `Note`, `Highlight`, `ActivityEvent`, `Settings`,
  `User`). Português só no conteúdo que o usuário vê.
- **i18n no frontend (react-i18next).** Nenhum texto solto nas telas — tudo via `t('chave')`.
  Chaves **semânticas em inglês** (`books.todayReading`). `pt` default, `en` segundo locale.
- Datas: o banco guarda UTC. "Que dia é hoje" SEMPRE se calcula no `timezone` do Settings,
  nunca na hora do servidor. Todo cálculo "instante ↔ dia do calendário" passa por **um** dos
  dois helpers abaixo, nunca espalhado pelo código:
  - **`localDay(instant, timeZone)`** em `packages/shared/src/local-day.ts` — instante → dia
    de calendário (`"YYYY-MM-DD"`), com `Intl`. É o que compara com `ReadingPlanItem.date`.
  - **`calendarDayToDate` / `dateToCalendarDay`** em
    `backend/src/repositories/calendar-day-mapper.ts` — a tradução para a coluna `@db.Date`,
    sempre em UTC. Proibidos ali, para sempre: `getFullYear`/`getMonth`/`getDate`,
    `toLocaleDateString`, `toDateString` e `new Date(...)` sem `Z`.

  ⚠️ Esta regra dizia **`dayRange` em `backend/src/domain/`** até a Tarefa 30. Medido: esse
  helper **nunca existiu** — a conta que ele nomeava já tinha os dois donos acima, e um
  *range* de instantes só faz falta para consultar coluna de **instante** por dia, o que
  nenhuma consulta do projeto faz. Uma regra que aponta para um arquivo inexistente é pior
  que nenhuma: ela faz o próximo agente procurar, não achar, e inventar um terceiro nome
  para a mesma conta (lição nº 3). Corrigida pelo dono na rodada de decisões do MVP 3.
- O texto da nota é **ProseMirror JSON** (`doc`), nunca HTML. `plainText` é **derivado no
  backend** a partir do `doc` — nunca entra no input da API. → `docs/adr/0001-*.md`.
- Soft delete: tabelas de UI usam `status` (`ACTIVE`/`ARCHIVED`) + `archivedAt`. Hard delete
  só do que já está arquivado.
- **`ReadingLog` e `ActivityEvent` são logs imutáveis** — não se arquivam nem se editam.
  Desmarcar "li" = hard delete do `ReadingLog` (a exceção documentada).
- **Progresso do grupo é calculado** a partir dos logs, nunca guardado.
- `ActivityEvent.type`, `NotificationDelivery.kind`, `PushSubscription.platform` e
  `Highlight.color` são `String` validados por `z.enum`/regex (ainda evoluem); os demais
  status/tipos são enums Prisma.
- **Migrations SEMPRE via Prisma — NUNCA escreva/edite SQL de migration à mão.** Alterou o
  `schema.prisma`? Gere com `prisma migrate dev --name <nome>` (dev) e aplique em produção
  com `prisma migrate deploy`. Nunca crie/edite arquivos em `prisma/migrations/`
  manualmente nem invente o SQL — deixe o Prisma gerar.
- Nenhum acesso a banco fora de um Repository. Sem `$queryRaw` espalhado por feature.

## O que NÃO fazer agora (fora de escopo até o MVP indicado)

- Nada de IA/agente, OCR de foto de página, resumo automático de capítulo, busca semântica.
- Nada de reação, curtida ou comentário na nota de outra pessoa (registrado em aberto).
- Nada de e-mail transacional / SMTP — convite é **link com código**.
- Nada de `Highlight`/grifos no MVP 1 (isso é MVP 2).
- Nada de `ReadingLog`, feed ou push no MVP 1 e 2 (isso é MVP 3).
- Nada de resolução de conflito offline (Nível 2). Offline Nível 1 = rascunho local + fila
  de escrita de nota/grifo.
- Não criar telas antes do domínio testado.

## Fluxo de execução de tarefas

- Pegue UMA tarefa de `docs/tasks/` por vez, na ordem do `docs/BACKLOG.md`.
- Siga o ciclo TDD. Ao terminar, marque a checklist da tarefa e o `BACKLOG.md`, **pare** e
  reporte o que foi feito vs a "Definição de pronto" da tarefa. Não emende a próxima tarefa
  sem o dono revisar.
- Se algo no plano estiver ambíguo ou conflitar, PERGUNTE antes de assumir.
- Precedência quando os documentos discordarem: **ADR** emenda este arquivo · "decisões
  fechadas" do `BACKLOG.md` vencem suposições de uma spec de tarefa · este arquivo vence o
  plano de produto em qualquer questão operacional.
