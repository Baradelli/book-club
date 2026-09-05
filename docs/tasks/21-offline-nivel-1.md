# Tarefa 21 — Offline nível 1: o texto não se perde

> **A última fatia do MVP 1.** A definição de pronto do MVP diz: *"escrevemos nossa anotação no
> editor (…) salvando sozinho **mesmo com a internet ruim**"*. Hoje o autosave da Tarefa 18
> falha com elegância — diz que falhou e oferece repetir. Falta a parte em que a pessoa fecha o
> app, volta no metrô, e o que ela escreveu **está lá e foi enviado sozinho**.
>
> Leia antes: `docs/tasks/18-tela-anotacao-do-dia.md` (o autosave é da TELA, não do editor),
> `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` §6.8 e §7, e o docblock de `day-note.tsx:40-68`, que
> descreve exatamente o buraco que esta fatia preenche.

## Objetivo

Escrevo a anotação do dia sem sinal. O texto não se perde, o app não me alarma, e quando a
conexão volta ele sobe sozinho — **uma vez**, não quarenta.

## Escopo enxuto — e cada exclusão tem motivo concreto

**Entra:** rascunho local do `doc`, fila de escrita em IndexedDB, reenvio no evento `online`, e
o estado `queued` no indicador de salvamento.

| Fora | Por quê |
| --- | --- |
| **Resolução de conflito** (Nível 2) | Está fora do MVP por decisão do `CLAUDE.md`. Aqui **o último envio ganha**, e num clube de duas pessoas ninguém escreve na anotação do outro — o conflito real seria a mesma pessoa em dois aparelhos. |
| **Criar anotação avulsa offline** | `POST /books/:bookId/notes` **não é idempotente** e o backend não tem chave de idempotência (e `packages/backend` está fechado nesta fatia). Reenviar às cegas cria nota duplicada. A tela guarda o rascunho e **diz** que precisa de conexão para criar. |
| **Editar avulsa offline** (`PATCH`) | É idempotente e caberia na mesma fila, mas a `free-note.tsx` já tem 576 linhas de código e três modos. A fila se prova numa tela antes de ser fiada em todas. Fica registrado. |
| **Abrir o app offline do zero** (cold start) | O shell já vem do service worker, mas `/me`, o livro e as notas são leituras que falham sem rede — e cache de LEITURA é outra fatia. Aqui a premissa é o app **já aberto** (ou reaberto com rede) e a **escrita** sobrevivendo à queda. Isso precisa estar escrito no `COMO-TESTAR.md`, senão o dono testa no metrô e acha que a fatia não funciona. |
| Grifos | MVP 2. |

## Decisões já tomadas (não reabrir)

- **`ApiError` com status 2xx NUNCA é reenviado.** Decisão fechada na Tarefa 12: 2xx significa
  *"o servidor aceitou e executou, só não entendemos a resposta"*. Reenviar é escrever duas
  vezes. O discriminador tem de ser **explícito**, não `catch` genérico.
- **Só o que não chegou entra na fila.** `ApiError.isNetworkError` (status `0`) já existe em
  `shared/client` exatamente para isto — **use-o, não reimplemente**.
- **O autosave é da tela, não do editor.** `packages/ui` não é tocado.
- **Nada de banco fora de um repositório** vale aqui na forma de: nada de `indexedDB` espalhado
  por tela. Um port, uma implementação, um fake.

## Decisões que assumi (revisar antes de executar)

| #   | Decisão | Alternativa e por que não |
| --- | --- | --- |
| A   | **Existir rascunho já significa "não enviado"** — quando o servidor confirma, o rascunho é apagado | A alternativa é comparar o `updatedAt` do servidor com um carimbo local, e aí a fatia herda relógio de celular errado, fuso, e a pergunta "mais novo por quê?". Com a invariante, abrir a tela com rascunho é decidível sem nenhuma comparação: **o rascunho ganha**. |
| B   | **A fila é deduplicada por chave** (`planItemId` + usuário): um salvamento novo do mesmo dia **substitui** o anterior | Sem isso, escrever offline por dez minutos enfileira dezenas de versões do mesmo documento e o retorno da conexão vira uma saraivada de `PUT` — todos vencidos menos o último. |
| C   | O reenvio dispara no evento **`online`** e na **abertura do app**, e mais nada | Um timer que tenta a cada N segundos gasta bateria, e o navegador já avisa. Se o `online` mentir (ele às vezes mente: rede sem internet), o reenvio falha e a entrada continua na fila — que é o comportamento correto. |
| D   | **Só rede entra na fila.** `400/403/404/410` viram estado de erro com frase própria e **saem** | Uma fila que reenvia o que o servidor já recusou tenta para sempre e nunca esvazia. E 404/403 na anotação do dia é "a nota é de outra pessoa" ou "o membership sumiu" — repetir não conserta. |
| E   | **A fila é por usuário.** Entrar com outra conta não reenvia a nota de quem estava antes | O aparelho é de casa e as duas pessoas do clube podem usá-lo. Reenviar a anotação de um com o token do outro é escrever no lugar errado — e o backend aceitaria, porque o autor vem do JWT. |
| F   | **IndexedDB indisponível não quebra a tela**: sem ela, o app volta a se comportar como na Tarefa 18 (erro + repetir) | Modo privado, cota estourada e navegador antigo existem. Uma tela que morre porque o armazenamento local falhou troca "não salvou" por "não abre". |
| G   | O port tem **fake em memória** para os testes de tela, e **um** teste de contrato contra IndexedDB de verdade (`fake-indexeddb`) | É a política de testes do `CLAUDE.md` aplicada: fake rápido nas telas, um contrato contra a implementação real. Sem o contrato, o fake e a IndexedDB divergem em silêncio (§7.1). |

## Regras (o que os testes provam)

### O rascunho

1. Digitar grava o `doc` na store local — **antes** de qualquer tentativa de rede.
2. Recarregar a página e reabrir o dia traz o **rascunho**, não o `doc` do servidor.
3. Salvamento confirmado pelo servidor **apaga** o rascunho (decisão A).
4. Rascunho de um dia não vaza para outro dia nem para outro usuário (decisão E).

### A fila

5. Falha de **rede** (`isNetworkError`) põe a escrita na fila e o status vai para **`queued`** —
   não para `error`. O texto continua na tela.
6. Um segundo salvamento do mesmo dia **substitui** a entrada; a fila não cresce (decisão B).
7. `400/403/404/410` **não** entram na fila: status `error`, frase própria do catálogo, e o
   texto continua na tela (decisão D).
8. **`ApiError` com status 2xx não entra na fila e não é reenviado** — e o teste diz isso com
   todas as letras, porque é a regra mais fácil de perder num `catch` genérico.

### O reenvio

9. O evento **`online`** esvazia a fila, na ordem em que as entradas entraram.
10. Reenvio bem-sucedido apaga a entrada **e** o rascunho; com a tela daquele dia aberta, o
    status vira `saved`.
11. Reenvio que falha por rede **mantém** a entrada — sem duplicar, sem perder.
12. Reenvio que leva `4xx` permanente **remove** a entrada (senão a fila nunca esvazia) e o
    rascunho **continua**, porque o texto é da pessoa.
13. A abertura do app tenta esvaziar a fila uma vez.
14. Nada de timer: **não** existe reenvio periódico (prove por contagem, com timers falsos).

### A tela

15. O indicador ganha `queued`, com frase própria — **sem tom de erro e sem cobrança** (a
    varredura anti-culpa roda em todos os estados novos).
16. Fechar a tela com escrita na fila **não** perde nem duplica.
17. IndexedDB que falha ao abrir → a tela funciona como na Tarefa 18, sem quebrar (decisão F).

### Transversais

18. Nenhuma string da API na tela — texto **e** atributos; chaves novas em **`pt` e `en`**.
19. O chunk de entrada continua **sem TipTap**, e a fila não o engorda de forma relevante
    (cole o número antes e depois).

## Arquivos a tocar

```
packages/app/src/offline/store.ts                 NOVO — o port + a implementação IndexedDB
packages/app/src/offline/queue.ts                 NOVO — enfileirar, deduplicar, esvaziar
packages/app/src/offline/__tests__/               NOVOS — o fake, o contrato, a fila
packages/app/src/pages/day-note.tsx               o autosave passa a usar rascunho + fila
packages/app/src/pages/__tests__/day-note.test.tsx   crescer
packages/app/src/main.tsx (ou onde o app monta)   o gatilho de `online` e o de abertura
packages/shared/src/locales/{pt,en}.ts            as chaves
packages/app/package.json                         `fake-indexeddb` como devDependency
```

**Não tocar:** `packages/backend/**`, `prisma/`, `packages/ui/**`,
`packages/shared/src/client/**` (o `isNetworkError` já existe — **use-o**),
`app/src/{i18n,theme,env}.ts`, `auth/require-auth.tsx`, `pages/{book,book-form,free-note}.tsx`.
Se precisar de componente novo em `ui/`, **pare e reporte**.

## Definição de pronto

- [x] O texto **não se perde** ao recarregar sem rede (1, 2), e o rascunho some quando o
      servidor confirma (3).
- [x] A fila **deduplica** (6) — dez minutos escrevendo offline viram **uma** requisição.
- [x] **2xx nunca reenvia** (8), e `4xx` permanente não fica preso na fila (7, 12).
- [x] O `online` esvazia (9, 10, 11) e **não existe timer** (14), provado por contagem.
- [x] A fila é **por usuário** (4, decisão E).
- [x] IndexedDB quebrada **não quebra a tela** (17).
- [x] `queued` sem tom de erro e sem cobrança (15).
- [x] Um **teste de contrato** contra IndexedDB de verdade, além do fake (decisão G).
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos, contagens coladas.
- [x] Backend em **949** unitários — verificado, e `packages/backend` **intocado** (nenhum
      arquivo de `packages/backend/**` nem de `packages/backend/prisma/**` escrito nesta
      sessão; o mais recente é de 17:11 e a fatia começou às 22:11). Os **262** de integração
      **NÃO** foram rodados: eles escrevem no banco de desenvolvimento do dono, e a instrução
      desta fatia proibiu operações de banco. Como o backend está intocado, não há como o
      número ter mudado.
- [x] **Contagem de linhas de código colada** (`day-note.tsx` antes e depois, e os arquivos
      novos).
- [x] Checklist marcada; a linha 21 do `BACKLOG.md` é do orquestrador.

## Depois desta fatia

**O MVP 1 fecha.** O que continua faltando para o app funcionar de verdade dentro do metrô é o
cache de **leitura** (`/me`, o livro, as notas) — a escrita já sobrevive, a leitura ainda não.
Isso e os grifos são o MVP 2.
