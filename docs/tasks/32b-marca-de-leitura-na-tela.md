# Tarefa 32b — A marca de leitura na tela do livro

> **Fatia inserida**, a metade de tela da Tarefa 32 (o motivo da divisão está lá: a irmã do
> MVP 2 sem tela já custou 4.324 inserções). Aqui o "li" vira gesto.
>
> ⚠️ **A PRIMEIRA UNIDADE NÃO É A TELA — é encerrar a fase 2 do `readers`.** Ver regra 1.
>
> Leia antes: `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` **§6.8** (o cliente VALIDA a resposta,
> e a evolução de campo é em duas fases — esta fatia fecha a segunda), **§7.4** (asserção
> vazia, e a forma de tela: `expect(getByRole(...)).toBeDefined()` não asserta nada),
> **§7.6.1** (fixture que o framework não interpreta anula o teste; `document.body.textContent`
> cola nós irmãos sem separador), **§7.9** (guarda de vocabulário mora no **catálogo** e
> percorre `pt` **e** `en`; o que não é catálogo é DOM, e a varredura roda em **todos** os
> estados), **§7.10**. E `docs/ACEITE-MVP.md`, seção **MVP 3, pergunta 1** — é a decisão de
> produto que esta tela executa.
>
> **Os vizinhos:** `packages/app/src/pages/book.tsx` (**247** linhas, a tela que cresce) ·
> `pages/__tests__/book.test.tsx` · `pages/__tests__/harness.tsx` (o `readableText()`) ·
> `pages/__tests__/anti-guilt-dom.ts` (o `expectNoGuilt()`, que **já embute** a varredura de
> privacidade — não a chame duas vezes) · `pages/acervo.tsx:407` (o `api.delete` que existe) ·
> `pages/highlight-form.tsx:256` (o `api.post` com estado de escrita).

## Objetivo

Marco que li o trecho de hoje, e vejo no plano quem do clube já leu cada dia — sem número,
sem barra e sem comparação.

## Escopo enxuto

**Entra:** a fase 2 do `readers`, a marca de leitura por dia na lista do plano, o toque "li
hoje" em primeira pessoa, e o caminho de `204` no cliente HTTP.

| Fora | Por quê |
| --- | --- |
| ⚠️ **Qualquer contador, barra ou percentual** | Decisão do dono (`ACEITE-MVP.md`, MVP 3, pergunta 1). A rota **não devolve contagem**, então não há o que renderizar — e a guarda continua de pé. |
| ⚠️ **Marcar leitura de OUTRO dia que não hoje** | Não é "fora por simplicidade": a rota aceita qualquer `planItemId`, mas a tela oferecer 30 toggles transforma a lista num formulário de auditoria retroativa — e é exatamente onde "por que você não marcou o dia 4?" nasce. O toque é **só no dia de hoje**; ler atrasado se resolve marcando o dia do plano quando ele **for** hoje. ⚠️ **Registre como pergunta do dono** se ele vai querer marcar dia passado. |
| Feed, notificação, `ActivityEvent` | Blocos H e I. |
| A tela de preferências | Tarefa 36. |
| `GET /books/:bookId/readers` | Não existe, por medição da Tarefa 32. A tela **rebusca o livro**. |
| Desfazer com confirmação | Desmarcar é um toque e é reversível com outro toque. Cerimônia aqui é o oposto do gesto leve que a fatia quer. |

## Decisões já tomadas (não reabrir)

- **Progresso é presença, não placar** — marca por dia + toque em primeira pessoa. → decisão
  do dono, `ACEITE-MVP.md` MVP 3 pergunta 1.
- **Nenhuma string solta na tela**: tudo via `t()`, chave nova em `pt` **e** `en`.
- **Dentro do clube nada é privado** (ADR 0002): a marca mostra **todo** membro que leu.
- **`PUT`/`DELETE /plan-items/:planItemId/reading-log`**, `201`/`200`/`204`. → Tarefa 32.
- **Teto do chunk de entrada: 450.000 B, não relaxado.** Hoje: **416.251 B**, folga 33.749.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | ⚠️ **A fase 2 do `readers` é a PRIMEIRA unidade, antes de qualquer pixel** | Medido na Tarefa 32: com `.optional()`, o handler que **esquece** o `readers` compila e passa em **1399/1399** unitários; os únicos acusadores são 4, todos em integração, num `describe` só. Deixar a fase 2 para o fim da fatia é como ela não acontece. Feita primeiro, o `response` schema volta a ser fronteira de verdade (§6.1) e o resto da fatia nasce em cima dela. |
| B | **A marca de leitura fica na MESMA linha do plano, ao lado dos avatares de quem escreveu** | É a construção que a tela já tem e que a decisão do dono nomeia. Uma segunda lista ("quem leu") duplicaria o plano e obrigaria o olho a cruzar duas colunas. |
| C | ⚠️ **A marca de quem leu é distinguível da de quem escreveu SEM depender de cor** | Lição nº 12 do MVP 2: varrer palavra não pega desenho, e cor sozinha não é portadora. As duas sobreposições falam na mesma linha, então precisam de forma **e** de `aria-label` distintos — senão o §7.9 vira "duas coisas que falam a mesma frase" (lição nº 16), que já mentiu numa tela deste projeto. |
| D | **O toque "li hoje" é um botão de dois estados, não um checkbox** | O estado é do servidor e a ação é assíncrona; um `checkbox` promete alternância local imediata. O rótulo diz o **estado atual** e a ação, em primeira pessoa. |
| E | ⚠️ **Ele só aparece quando existe um dia de hoje no plano** | Um livro do mês passado não tem "hoje". Mostrar o botão desabilitado seria cobrança silenciosa ("você não pode mais"); a ausência é o anti-culpa aplicado ao espaço vazio, como o dia sem autoria já faz. |
| F | ⚠️ **Depois de marcar/desmarcar, a tela REBUSCA o livro** | Não existe rota de sobreposição (medido na 32). Atualizar só o estado local faria a marca do ator aparecer e a dos outros envelhecer — e a divergência só apareceria no próximo recarregamento. Rebuscar é uma requisição e mantém uma verdade só. |
| G | **Erro ao marcar não desfaz a tela: mostra recado e deixa tentar de novo** | O precedente das telas de grifo e busca. ⚠️ E o recado **não** pode ter tom de cobrança nem de falha da pessoa. |
| H | ⚠️ **O `DELETE` responde 204 SEM CORPO, e esta é a primeira vez no app** | Medido: o único `api.delete` de hoje (`acervo.tsx:407`) recebe a linha atualizada de volta. O cliente faz `raw = await response.text()` → `safeJsonParse('')` devolve `undefined` → `schema.safeParse(undefined)`. Funciona com um schema que aceite `undefined`, **mas esse caminho não tem um único teste** em `api-client.test.ts` (grep por `204`: zero). A fatia escreve esse teste **no `shared`**, onde a propriedade é decidível. |
| I | **A marca não é link nem alvo de toque** | Ela é informação, e o dia inteiro já é um link para a anotação. Um alvo dentro de outro alvo em tela de celular é toque errado garantido. |

## Regras (o que os testes provam)

### Unidade 1 — a fase 2 (antes da tela)

1. ⚠️ `readers` deixa de ser `.optional()` em `bookWithPlanResponseSchema`. Os **7** arquivos
   do app que montam a resposta à mão passam a mandá-lo (medido: **não** há factory
   compartilhado — `book.tsx`, `harness.tsx` e 5 arquivos de teste).
2. ⚠️ O teste que existe **de propósito** para ficar vermelho na fase 2 —
   `still accepts a response without readers, which is the phase-1 shape`
   (`shared/.../note-schemas.test.ts`) — é **trocado** pelo que descreve a verdade nova, não
   apagado nem afrouxado. O relatório cola o nome antigo e o novo.
3. ⚠️ **A guarda volta a morder:** com o campo obrigatório, o handler que **esquecer** o
   `readers` no `send()` de `GET /books/:bookId` passa a falhar. Prove por mutação e **cole a
   contagem** — antes eram **0** acusadores fora da integração.
4. O `??` / `?? []` que a Tarefa 32 deixou nos consumidores morre junto (se houver).

### Unidade 2 — a tela

5. Cada dia do plano que alguém leu mostra **uma marca por leitor**, na ordem do plano.
6. Dia que ninguém leu **não** ganha marca nem frase — a ausência é silenciosa (o mesmo que o
   dia sem autoria já faz).
7. ⚠️ A marca de **leitura** e o avatar de **escrita** convivem na mesma linha e são
   **distinguíveis sem cor** (decisão C): formas diferentes e `aria-label` diferentes. O teste
   prova que os dois textos acessíveis **não são iguais**.
8. A marca diz **quem** leu, pelo nome, com o mesmo `nameOfWriter` do `club-names.ts` — um
   dono só. Sem nome resolvido, cai na frase neutra que já existe para escrita, na versão de
   leitura.
9. ⚠️ **Nenhum número em lugar nenhum**: nem "+2" de estouro, nem contagem ao lado, nem
   percentual. Um leitor a mais é uma marca a mais.
10. O botão "li hoje" aparece **só** quando há dia de hoje no plano (E), diz o **estado
    atual** em primeira pessoa, e alterna.
11. Marcar chama `PUT` **uma** vez — provado por **contagem** (§7.3), não por ausência de
    erro. Desmarcar chama `DELETE` uma vez.
12. ⚠️ Depois de marcar, a tela **rebusca o livro** (F) e a sobreposição reflete o novo
    estado. Provado por contagem de chamadas ao `GET`.
13. ⚠️ **Toque duplo não manda dois `PUT`**: enquanto a requisição está em voo o botão não
    reenvia. Provado por **contagem**. (A Tarefa 32 já matou o 500 do lado do servidor; aqui
    é o lado que evita a corrida.)
14. Falha ao marcar → recado com "tentar de novo" que **funciona**, e a tela **não** perde a
    lista (G).
15. ⚠️ **As varreduras rodam em TODOS os estados novos** — carregando, com marca, sem marca,
    com erro de marcação, sem dia de hoje. Pelo helper único: o `expectNoGuilt()` **já embute**
    a de privacidade, **não a chame duas vezes**.
16. ⚠️ A varredura de **catálogo** cobre `pt` **e** `en` (§7.9). Chave nova nos **dois**.

### Transversais

17. ⚠️ **Chunk de entrada em BYTES, colado, abaixo de 450.000.** Antes: **416.251 B**, folga
    **33.749**. Densidade medida no MVP 2: ~13 B por linha de tela e ~43 B por par de chaves
    (⚠️ **metade do que era** — a Tarefa 29a tirou o `en` do chunk de entrada, então a chave
    nova só custa o lado `pt`). Projete e depois **meça**.
18. ⚠️ **`packages/backend` e `packages/ui` INTOCADOS** — `git status` vazio, colado. A
    varredura de strings cravadas em `ui` continua em **33**.
19. ⚠️ **`book.tsx` tem 247 linhas** pelo contador canônico. Lição nº 8: **divida antes de
    crescer**. Se passar de ~350, corte — e diga por medição o que saiu e para onde.
20. O teste de 204 do cliente (decisão H) mora em **`packages/shared`**, não na tela: é lá que
    a propriedade é decidível.

## Arquivos a tocar

```
packages/shared/src/book.ts                              readers deixa de ser optional (1)
packages/shared/src/__tests__/note-schemas.test.ts       a asserção TROCADA (2)
packages/shared/src/client/api-client.ts                 só se o 204 exigir (H)
packages/shared/src/client/__tests__/api-client.test.ts  o caminho do 204 (20)
packages/app/src/pages/book.tsx                          a marca + o botão
packages/app/src/pages/__tests__/book.test.tsx           crescer
packages/app/src/pages/__tests__/harness.tsx             o fixture ganha readers
packages/app/src/pages/__tests__/{acervo,book-form,day-note,free-note,highlight-form}.test.tsx
                                                         só o fixture (fase 2)
packages/shared/src/locales/{pt,en}.ts                   as chaves
```

**Não tocar:** `packages/backend/**` · `packages/ui/**` · `prisma/**` · `docs/**` ·
`pages/{acervo,acervo-filters,busca,free-note,day-note,highlight-form,chrome}.tsx` (a fase 2
mexe **só no fixture** dos testes deles) · `app/src/{i18n,theme,env}.ts` · `offline/**`.

## A pergunta do dono (registre, não decida)

**Marcar leitura de um dia que já passou.** A tela só oferece o toque no dia de **hoje**
(escopo). A rota aceita qualquer dia, então é aditivo. Contra: 30 toggles na lista viram
auditoria retroativa, que é onde a cobrança nasce. A favor: quem leu no fim de semana e
esqueceu de marcar não tem como registrar. **Recomendação:** deixar como está e ver se
incomoda de verdade — e, se incomodar, a saída provável não é 30 toggles, é marcar o dia
**ao abrir a anotação daquele dia**.

## Definição de pronto

- [x] ⚠️ **Fase 2 concluída na PRIMEIRA unidade** (1), com a asserção **trocada** (2) e a
      guarda medida voltando a morder — contagem colada, era **0** (3).
- [x] Marca por leitor, na ordem do plano (5); dia sem leitor sem marca e sem frase (6).
- [x] ⚠️ Leitura × escrita **distinguíveis sem cor**, com `aria-label` diferentes (7).
- [x] ⚠️ **Nenhum número**, nem "+N" de estouro (9).
- [x] Botão só com dia de hoje (10); marcar/desmarcar chamam **uma** vez, por contagem (11).
- [x] ⚠️ Rebusca depois de marcar, por contagem (12); **toque duplo não manda dois `PUT`** (13).
- [x] Falha com "tentar de novo" que funciona, sem perder a lista (14).
- [x] ⚠️ Anti-culpa e privacidade em **todos** os estados novos, **sem chamada dupla** (15);
      catálogo nos **dois** locales (16).
- [x] ⚠️ **O caminho de 204 do cliente com teste, no `shared`** (20, H).
- [x] ⚠️ **Chunk em bytes colado**, abaixo de 450.000 (17).
- [x] `pnpm -r test`, `typecheck`, `lint`, `prettier --check .`, `build` limpos — baseline
      **426** shared · **195** ui · **1399** backend · **620** app.
- [x] ⚠️ **Integração rodada por você** (a fase 2 muda um schema que as rotas usam): era
      **436**.
- [x] ⚠️ `git status -- packages/backend packages/ui` **vazio**, colado (18).
- [x] **Linhas do `book.tsx`** coladas, antes e depois (19).
- [x] ⚠️ O **vermelho colado** das regras 3, 7, 9, 13 e 20.
