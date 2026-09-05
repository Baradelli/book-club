# PROMPT-INICIAL.md — cole isto na primeira mensagem da sessão nova

> Este arquivo é o prompt de abertura do projeto. Abra o Claude Code na pasta deste
> repositório e cole **tudo o que está depois da linha** como sua primeira mensagem.
>
> Nas sessões seguintes não precisa colar nada: o `CLAUDE.md` é lido automaticamente e o
> `README-IA.md` diz a ordem de leitura.

---

Você vai construir, do zero, um app de **clube do livro em grupo**. Este repositório contém
**só documentação** — nenhuma linha de código ainda. Toda a especificação já existe e foi
decidida pelo dono; seu trabalho é executá-la, uma fatia por vez, com TDD.

## 1. Leia primeiro, nesta ordem, antes de tocar em qualquer arquivo

1. `CLAUDE.md` — as regras permanentes do projeto. Inegociáveis.
2. `CONTEXT.md` — o glossário. Todo termo do domínio está aqui.
3. `docs/plano-clube-do-livro.md` — por que o sistema é assim, o modelo de dados completo e
   os quatro MVPs. Contexto conceitual.
4. `docs/WORKFLOW.md` — como uma tarefa nasce, é executada e é fechada.
5. `docs/BACKLOG.md` — a fila de tarefas, em ordem.
6. `docs/tasks/01-usecase-clube-membership.md` — a sua primeira tarefa.

Consulte `docs/adr/` sempre que quiser saber **por que** uma regra existe. Não reabra as
decisões que estão lá; elas foram tomadas com o dono.

## 2. O que é o produto, em cinco linhas

Um admin cria um clube, convida as pessoas por link, e cadastra o livro do mês **já com um
plano de leitura por dia** (cada dia tem um tema pré-definido: capítulo, subcapítulo ou
assunto). Todo mundo do clube lê o mesmo trecho, escreve a anotação daquele dia num editor
rich-text, registra os grifos com cor e comentário, e **vê o que os outros escreveram**.
Quando alguém lê, escreve ou grifa, o clube recebe uma notificação — um incentiva o outro.

O caso crítico é **escrever no celular, à noite, com uma mão**. O app é um PWA mobile-first
que também serve no desktop, onde ficam as telas de administração.

## 3. Como o projeto trabalha (resumo — o detalhe está no `CLAUDE.md`)

- **Monorepo pnpm** com quatro pacotes: `packages/{shared,ui,backend,app}`. **Um único shell**
  (`app`) — nunca criar `web/` e `mobile/` separados.
- **Camadas:** `Rota (Zod) → UseCase → Repository (interface) → Prisma (+ fake em memória)`.
  O UseCase **não importa Fastify nem Prisma**.
- **TDD outside-in, sempre:** mini-domínio da fatia → contrato do UseCase → **testes primeiro,
  com o fake** → implementação mínima → red/green → refactor → **só então** rota e tela.
  Nunca escreva implementação de UseCase antes do teste dele.
- **Multi-tenant desde o dia 1:** todo conteúdo tem `clubId`; toda leitura confere
  `Membership` ativo do `req.user.sub`; sem membership → **404**, não 403.
- **Código em inglês, conteúdo em português.** Nenhum texto solto nas telas — tudo via
  `t('chave')`, com chaves semânticas em inglês.
- **Migrations só via Prisma.** Nunca escrever ou editar SQL de migration à mão.
- **Uma tarefa por vez.** Ao terminar: marque a checklist da tarefa e o `BACKLOG.md`, reporte
  **feito vs "Definição de pronto"** item por item, e **pare**. Não emende a próxima.
- **Se algo estiver ambíguo ou conflitar, pergunte antes de assumir.**

## 4. Ambiente e comandos (Windows + PowerShell, pnpm)

O esqueleto do monorepo ainda não existe: ele nasce seguindo `docs/SETUP.md`, que é o passo
zero. Depois disso:

```powershell
pnpm db:up                  # sobe o Postgres no Docker (Docker Desktop precisa estar aberto)
pnpm dev:backend            # Fastify em :3333, Swagger em /docs
pnpm dev:app                # PWA em :5173
pnpm -r test                # testes unitários de todos os pacotes
pnpm -r typecheck
pnpm --filter @clube/backend test:integration    # exige o Postgres de pé
pnpm prisma:migrate         # prisma migrate dev
```

## 5. Onde as coisas vivem

```
packages/shared     schemas Zod (fonte única), cliente HTTP, catálogos de i18n
packages/ui         componentes React, tokens de tema, O EDITOR (TipTap)
packages/backend    src/{http,routes,usecases,usecases/ports,usecases/_fakes,
                         repositories,domain,notifications}  ·  prisma/
packages/app        o PWA: telas, router, service worker
docs/               plano, backlog, tasks, adr, editor, notificações, setup, workflow
```

Testes ficam em `__tests__/` ao lado do código: `*.test.ts` é unitário (sem banco),
`*.integration.test.ts` usa Postgres real.

## 6. O editor é a peça mais importante — não improvise

O dono escolheu fazer este projeto **porque gostou de um editor** que já existe em outro
projeto dele: TipTap com barra auxiliar fixa, bubble menu na seleção, menu por `/` e grifos
coloridos, funcionando bem no celular. Essa experiência está especificada em detalhe em
**`docs/EDITOR.md`** — incluindo os detalhes que não são óbvios e que, se você errar, arruínam
a experiência (por exemplo: **nenhum botão do editor usa `onClick`**, senão o teclado do
celular fecha a cada toque).

Leia `docs/EDITOR.md` inteiro antes da Tarefa 14. Não invente uma variação.

## 7. A sua fila

`docs/BACKLOG.md`, MVP 1, de cima para baixo. As tarefas **01 a 04** já estão detalhadas em
`docs/tasks/`. Da **05** em diante o backlog diz `_a detalhar_`: quando uma dessas for a
próxima, **escreva a spec primeiro** (no template descrito em `docs/WORKFLOW.md`) e **pare**
para o dono revisar antes de implementar.

## 8. Comece assim

1. Leia os arquivos da seção 1.
2. Execute `docs/SETUP.md` até a "Definição de pronto do setup" — exceto o Prisma (§4), que
   depende do schema da Tarefa 03. Pare e reporte.
3. Aguarde o dono confirmar, e então comece a
   `docs/tasks/01-usecase-clube-membership.md` — testes primeiro.

Não escreva código de tela, nem Prisma, nem Fastify antes da tarefa que pede cada um.
