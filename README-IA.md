# README-IA.md — Guia dos documentos deste repositório

> Este repositório contém, neste momento, **só documentação**. Nenhuma linha de código, nenhum
> `package.json`, nenhum `node_modules`. O código nasce executando as tarefas de
> `docs/BACKLOG.md`, uma por vez.
>
> Se você é um agente começando aqui: **cole `PROMPT-INICIAL.md` como primeira mensagem** ou
> siga a ordem de leitura abaixo.

---

## Ordem de leitura

1. **`CLAUDE.md`** (raiz) — as regras permanentes: stack, camadas, TDD, multi-tenant,
   convenções. É o único arquivo que precisa ser lido em **toda** sessão. Nada aqui é
   sugestão.
2. **`CONTEXT.md`** (raiz) — a linguagem ubíqua. Consulte sempre que um termo aparecer
   (`ReadingPlanItem`? `Membership`? o que é uma nota `FREE`?).
3. **`docs/plano-clube-do-livro.md`** — o plano completo de produto e arquitetura. É a fonte
   **conceitual**: por que o sistema é assim, o modelo de dados inteiro, os MVPs.
   **Contexto, não instrução operacional.**
4. **`docs/SETUP.md`** — rode isto **uma vez**, antes da Tarefa 01. Deixa o monorepo, o
   Postgres e o Prisma de pé.
5. **`docs/WORKFLOW.md`** — como uma tarefa nasce, é executada e é fechada. Leia antes da
   primeira tarefa.
6. **`docs/BACKLOG.md`** — a fila. Pegue a próxima `[ ]`, de cima para baixo.
7. **`docs/tasks/NN-*.md`** — a spec da tarefa atual. **Uma por vez.** Se a linha do backlog
   diz `_a detalhar_`, escreva a spec primeiro e **pare** para o dono revisar.

Leia sob demanda:

- **`docs/EDITOR.md`** — antes da Tarefa 14. É a spec do editor, e o motivo deste projeto
  existir. Não improvise em cima dela.
- **`docs/NOTIFICACOES.md`** — antes do Bloco I (MVP 3).
- **`docs/adr/*.md`** — quando quiser saber **por que** uma regra é assim, ou quando for
  tomar uma decisão nova (aí você escreve o próximo ADR).

---

## O papel de cada arquivo

| Arquivo | É | Não é |
|---|---|---|
| `CLAUDE.md` | regras operacionais, inegociáveis | contexto de produto |
| `CONTEXT.md` | glossário de termos | decisão de implementação |
| `docs/plano-*.md` | por quê, modelo de dados, MVPs | instrução para executar |
| `docs/BACKLOG.md` | ordem + status + decisões fechadas por fase | detalhe de fatia |
| `docs/tasks/NN-*.md` | o que fazer nesta fatia, com testes e limites | regra geral do projeto |
| `docs/adr/*.md` | uma decisão, com alternativas e consequências | tutorial |
| `docs/EDITOR.md` | spec de uma peça específica | opcional |
| `docs/ACEITE-MVP.md` | o roteiro e as perguntas de fechamento de cada MVP; as respostas do dono | detalhe de fatia |
| `docs/PROMPT-MVP-2.md` | o prompt que põe uma IA orquestradora para executar o MVP 2 inteiro | spec de tarefa |
| `docs/COMO-TESTAR.md` | como subir, entrar e provocar cada tela | o que decide se o MVP fecha |
| `docs/WORKFLOW.md` | processo de colaboração | processo técnico |
| `docs/SETUP.md` | passo a passo de ambiente | parte do TDD |

## Precedência quando discordam

1. **ADR** — emenda o `CLAUDE.md`. É o mecanismo formal de mudar uma regra.
2. **`CLAUDE.md`** — vence o plano de produto em qualquer questão operacional.
3. **"Decisões fechadas" do `docs/BACKLOG.md`** — vencem suposições de uma spec de tarefa.
4. **Spec da tarefa.**
5. **`docs/plano-clube-do-livro.md`.**

Se o código real divergir das specs de forma consistente (caminhos, nomes de arquivo), crie
`docs/CONVENCOES-CODIGO.md` com pares ❌ spec-diz / ✅ real-é e declare lá que aquele arquivo
vence a spec. Não deixe divergência implícita.

---

## Como renomear o projeto

`clube-do-livro` e `@clube` são **placeholders**. Trocar é rápido se feito **antes** da
Tarefa 01 — depois, é um find-and-replace no código todo. Os lugares:

1. **Nome da pasta** do repositório.
2. **`package.json` da raiz** — o campo `name` e todos os `--filter @clube/...` dos scripts
   (`docs/SETUP.md` §1).
3. **Os quatro pacotes** — `packages/{shared,ui,backend,app}/package.json`: o `name`
   (`@clube/shared` etc.) e as dependências `workspace:*` entre eles. Os imports no código
   seguem o mesmo prefixo (`@clube/ui/editor.css`).
4. **`docker-compose.yml`** — `container_name`, `POSTGRES_USER/PASSWORD/DB`, o volume, e o
   `DATABASE_URL` correspondente no `.env` (`docs/SETUP.md` §2 e §3).
5. **Prefixo dos tokens de CSS** — `--clube-*` em `packages/ui/src/theme.css` e nos
   componentes (`docs/EDITOR.md` §13). É o único lugar onde o nome vira parte do estilo.
6. **Manifest do PWA** — `name` e `short_name` em `packages/app/vite.config.ts`, e o
   `<title>` do `index.html`. Este é o nome que aparece na tela do celular; pode ser diferente
   do nome técnico.
7. **Os documentos** — este arquivo, `CLAUDE.md`, `docs/plano-clube-do-livro.md` (inclusive o
   nome do arquivo) e as menções em `docs/SETUP.md` / `docs/EDITOR.md` /
   `docs/NOTIFICACOES.md`.

O título da API no Swagger (`docs/tasks/04-*.md`) também carrega o nome, mas é cosmético.

---

## O estado atual

Nada foi implementado. A próxima ação é `docs/SETUP.md` (uma vez) e depois
`docs/tasks/01-usecase-clube-membership.md`.

As tarefas **01 a 04** já estão detalhadas. As demais estão listadas no `docs/BACKLOG.md`
com `_a detalhar_` — por escolha: spec escrita cedo envelhece antes de ser usada.
