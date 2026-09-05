# WORKFLOW.md — Como o dono e o agente trabalham

> Como uma tarefa nasce, é executada e é fechada. As regras técnicas estão em `CLAUDE.md`;
> a ordem das tarefas está em `docs/BACKLOG.md`.

---

## O ciclo de uma tarefa

1. **O dono aponta a tarefa** — a próxima `[ ]` do `docs/BACKLOG.md`, na ordem.
2. **Se a spec não existe** (`→ _a detalhar_`), o agente **escreve a spec primeiro** em
   `docs/tasks/NN-slug.md`, no template abaixo, e **para** para o dono revisar. Não se
   detalha uma tarefa antes de ela ser a próxima — spec escrita cedo envelhece.
3. **O agente executa** seguindo o ciclo TDD do `CLAUDE.md`.
4. **O agente fecha**: marca a checklist da tarefa e a linha do `BACKLOG.md`, reporta
   **feito vs "Definição de pronto"** item por item, e **para**.
5. **O dono revisa** e aponta a próxima.

Uma tarefa por vez. Não emendar a próxima.

---

## Anatomia de um arquivo de tarefa

Todo arquivo em `docs/tasks/` tem:

- **Objetivo** — uma frase do que a fatia entrega.
- **Decisões já tomadas (do BACKLOG — não reabrir)** — o que não se discute nesta tarefa.
- **Mini-domínio (só desta fatia)** — os tipos/entidades, em TypeScript. Só o que esta fatia
  precisa.
- **Repository (mínimo desta fatia)** — a interface e o fake, com **só os métodos usados
  aqui**. A interface cresce junto com as tarefas; não invente `find`/`delete` antes de
  alguém precisar.
- **Contrato do UseCase** — input, output, dependências.
- **Regras de negócio (o que os testes provam)** — numeradas. Cada número deve virar pelo
  menos um teste.
- **Decisões que assumi (revisar antes de executar)** — onde a spec escolheu por conta
  própria. O dono lê isso antes de mandar executar.
- **Testes a escrever PRIMEIRO** — a lista de casos, com o caminho do arquivo.
- **Arquivos a tocar** — inclusive um **`Não` tocar:** explícito, para a mudança não se
  espalhar.
- **Fora de escopo** — o que NÃO fazer nesta tarefa.
- **Definição de pronto** — checklist objetivo, verificável, marcado em `[x]` na própria
  tarefa quando acabar.

O tamanho varia. Uma fatia de migração ou de tela pode ter só **Objetivo · Entregas · Fora de
escopo · Definição de pronto**. O que nunca falta é a Definição de pronto.

---

## Regras de ouro durante a execução

- **TDD sempre**: teste antes da implementação no domínio. Nunca o contrário.
- Se a tarefa estiver ambígua ou conflitar com o plano, **perguntar antes de assumir**.
- **Não criar tela antes do domínio testado.**
- **Não emendar a próxima tarefa** sozinho.
- **Respeitar o "Fora de escopo"** — é tão importante quanto o objetivo.
- **Não refatorar de carona.** Achou algo errado fora da fatia? Registra no fim do relatório;
  não conserta agora.
- **Rodar os testes de verdade** antes de dizer que passou, e colar a contagem no relatório
  (ex.: `20 testes verdes`). Item de checklist que não foi verificado fica `[ ]` com o motivo
  escrito na frente.

---

## Precedência quando os documentos discordam

1. **ADR** (`docs/adr/`) — emenda o `CLAUDE.md`. É o mecanismo formal de mudar uma regra.
2. **`CLAUDE.md`** — regras operacionais, vence o plano de produto.
3. **"Decisões fechadas" do `docs/BACKLOG.md`** — vencem suposições de uma spec de tarefa.
4. **Spec da tarefa** (`docs/tasks/NN-*.md`).
5. **`docs/plano-clube-do-livro.md`** — contexto conceitual, não instrução operacional.

Se o código real divergir das specs de forma consistente (caminhos, nomes), crie
`docs/CONVENCOES-CODIGO.md` com pares ❌ spec-diz / ✅ real-é, e declare lá que **aquele
arquivo vence a spec**. Não deixe a divergência implícita.

---

## Como o dono fecha um bloco

Ao terminar o último item de um bloco, o agente:

1. Roda a bateria completa: `pnpm -r test` e `pnpm -r typecheck`.
2. Reporta o bloco inteiro contra a "Definição de pronto" do MVP.
3. Registra em `docs/BACKLOG.md`, nas linhas `[x]`, o que efetivamente foi entregue e a
   contagem de testes.
4. Se alguma decisão nova foi tomada no caminho, **escreve o ADR** antes de encerrar.

Commit só quando o dono pedir.
