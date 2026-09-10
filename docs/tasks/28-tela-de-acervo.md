# Tarefa 28 — O acervo do livro: anotações e grifos num só lugar

> A última tela do MVP 2. Ela junta o que o clube escreveu — anotações **e** grifos — numa
> listagem só, com o filtro completo; **tira o acervo da tela do livro**, que volta a ser o
> plano de leitura; e fecha a última inconsistência de vocabulário do MVP 2 (a tela de grifos
> é hoje o único lugar onde o alheio ainda é "Alguém do clube").
>
> Leia antes: `docs/tasks/27-filtro-compartilhado.md` (o `FilterBar`, do qual esta fatia é o
> **terceiro** consumidor, e o `nameOfWriter`), `docs/tasks/25-tela-de-grifos.md` (a tela que
> esta fatia absorve), `docs/tasks/{19-anotacao-avulsa-e-filtro,26a-rota-membros-do-clube}.md`,
> `docs/adr/{0002-visibilidade-total-no-clube,0004-grifo-entidade-propria}.md`, `CLAUDE.md`,
> `docs/CONVENCOES-CODIGO.md` **§7.4, §7.6.1, §7.8, §7.9** (e a **emenda** do §7.9 sobre
> vocabulário em catálogo, que nasceu na 27).
>
> **Os vizinhos a imitar:** `packages/app/src/pages/highlights.tsx` (a base desta tela),
> `book.tsx` (de onde o acervo sai), `packages/ui/src/components/filter-bar.tsx`,
> `pages/chrome.tsx`, `pages/paths.ts`.

## Objetivo

Num lugar só, vejo tudo que o clube escreveu neste livro — as anotações do dia, as avulsas e os
grifos — e recorto por pessoa, por tipo, por leitura e por cor. E a tela do livro volta a ser o
que ela é: o plano.

## Escopo enxuto

**Entra:** a tela de acervo (`/books/:bookId/acervo`), a **saída** do acervo de dentro do
`book.tsx`, o filtro com as **quatro** dimensões, e o nome de quem escreveu **nas duas** metades
(anotação e grifo).

| Fora | Por quê |
| --- | --- |
| Busca por texto | É a **Tarefa 29**, a última. O campo entra **nesta tela**, mas é fatia própria. |
| Filtro no **servidor** | O acervo do livro já vem em duas requisições; recortar no cliente é a decisão medida da 19 e da 25. Os filtros de servidor ficam para quem paginar. |
| Paginação | O `take: 500` de cada repositório é válvula. Medido: ~1,4 KiB por grifo (23) e ~3,4–6,8 KiB por nota (10/23). |
| Editar/criar dentro da lista | As telas de formulário (`/books/:bookId/notes/new`, `/books/:bookId/highlights/new`, e as de edição) **ficam como estão** — a lista **linka** para elas. |
| `Select` em `packages/ui` | Ver decisão D: o controle de "leitura" é `<select>` **nativo** no app. Um componente novo em `ui` exigiria tokens, foco, teste próprio — e não há segundo chamador. |
| Desarquivar | MVP 4. |
| Filtro por página do grifo | A rota aceita, e nenhuma tela pediu. As quatro dimensões do `BACKLOG` são pessoa · tipo · leitura · cor. |

## Decisões já tomadas (não reabrir)

- **Dentro do clube não existe conteúdo privado**, e o filtro é **navegação, não permissão**.
  → ADR 0002. As duas varreduras (catálogo **e** DOM) rodam nos estados novos — e a de
  privacidade do catálogo agora percorre `pt` **e** `en` (conserto da 27).
- **Ninguém edita nem arquiva o que é de outra pessoa.** O item alheio não tem affordance.
- **O grifo é entidade própria** (ADR 0004): ele **não** é um tipo de anotação, e a lista tem de
  deixar isso claro sem que o leitor precise adivinhar.
- **O chip de pessoa se monta só com membros `ACTIVE`**; os `ARCHIVED` resolvem o nome de quem
  saiu. → decisão A da 26a.
- **O editor entra por `lazy()`** e o chunk de entrada continua **sem TipTap**.
- **Nenhuma string da API na tela** — texto **e** atributos; chave nova em `pt` **e** `en`.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | O acervo é **rota própria** (`/books/:bookId/acervo`), e ela **substitui** a rota de lista de grifos (`/books/:bookId/highlights`). As rotas de **formulário** do grifo continuam | Hoje as duas abas da tela do livro são **inconsistentes**: "Anotações" lista ali mesmo e "Grifos" navega. Uma lista dos dois tem de ser um lugar, e o `BACKLOG` chama a fatia de "**tela** de acervo". |
| B | A tela do livro fica **só com o plano** e **um** link para o acervo, no lugar das duas abas | É o que devolve o `book.tsx` ao tamanho de tela do plano. Ele foi de 400 para **486** linhas na Tarefa 27, e é a 2ª maior do app (o `free-note.tsx` tem 565). A lição nº 8 do MVP 1 é dividir **antes**, e esta fatia é o "antes". |
| C | **Uma** lista, ordenada por `createdAt` desc, com o **tipo explícito em cada linha** | Duas listas lado a lado obrigariam a pessoa a comparar duas ordens. E o tipo na linha é o que o ADR 0004 exige: grifo não é anotação. |
| D | ⚠️ "Leitura" é um **`<select>` nativo**, não chips | **Medido:** o plano real tem **30 dias** (é o que o `docs/COMO-TESTAR.md` §5.1 manda gerar), e 30 chips num celular é um filtro que não se usa. `<select>` nativo é acessível, tem teclado de graça e não custa componente novo — `packages/ui` **não tem `Select`** (medido). Se um dia houver segundo chamador, ele se muda para `ui`. |
| E | ⚠️ O grupo de **cor** só aparece quando o tipo selecionado **pode** incluir grifo | Um chip de cor com o tipo em "Anotações" é um filtro que **garante zero resultados** — a armadilha que a 25 evitou distinguindo "vazio" de "filtrado sem resultado". Mostrar um controle que só pode esvaziar a lista é pior que esconder. |
| F | O tipo é **um** grupo de quatro: `Tudo · Do dia · Avulsa · Grifo` | O `BACKLOG` (linha 26) chama a distinção de "pré-definida × avulsa", e o ADR 0004 põe o grifo fora das duas. Três grupos separados seriam três perguntas para uma escolha. |
| G | O nome de quem escreveu vale para as **duas** metades, pelo **mesmo** `nameOfWriter` | É a última inconsistência de vocabulário do MVP 2, registrada na 27. Duas funções seriam duas verdades sobre o mesmo nome. |
| H | Sem estado de filtro na URL | Mecanismo novo, ninguém pediu, e a 29 traz um campo de busca que teria de entrar nele também. Registrado: compartilhar "o acervo filtrado por Maria" é o primeiro pedido que justifica. |
| I | A lista mostra **prévia** (`plainText`/`commentText`), nunca o `doc` renderizado | Decisão F da 19 e I da 25, pelo mesmo motivo: N documentos ProseMirror numa lista é caro e ilegível. |

## Regras (o que os testes provam)

### A tela nova

1. Carrega o livro, as anotações e os grifos, e a lista sai **ordenada por `createdAt` desc**,
   com anotação e grifo **intercalados** — o teste tem fixture em que a ordem por tipo e a ordem
   por data **discordam**, e a precondição é **pinada** (§7.2/§7.8: fixture de ordenação se
   escolhe para a implementação errada **falhar**).
2. Cada linha diz **o tipo** de forma inequívoca (do dia · avulsa · grifo), e o grifo mostra
   **cor com nome** (⚠️ cor nunca é o único portador — regra 4 da 25) e a **página** quando
   existe.
3. Cada linha diz **de quem é**: "você" × o **nome** da pessoa, pelo `nameOfWriter` — e isso
   vale para grifo **e** anotação (decisão G).
4. Tocar numa linha **minha** abre a tela certa: a do dia para nota `PLAN`, a avulsa para
   `FREE`, o formulário de grifo para grifo. Linha **alheia** abre em leitura, sem affordance de
   edição.
5. Acervo vazio → estado vazio **sem cobrança**; e ⚠️ **filtrado-sem-resultado é estado
   próprio**, distinto do vazio — em **cada** dimensão (é a lição da 19/25, agora com quatro).

### O filtro, com as quatro dimensões

6. `FilterBar` com **três** grupos de chips (pessoa · tipo · cor), cada um `role="group"` com
   `aria-label`, e `aria-pressed` nos chips. É o **terceiro** consumidor do componente.
7. ⚠️ **Pessoa:** um chip por membro **`ACTIVE`** + `Tudo` + `Minhas`; membro `ARCHIVED` **não**
   vira chip **e** o nome dele **continua** resolvendo autoria. Os dois lados têm teste (é a
   regra 11 da 27, agora na tela nova).
8. **Tipo:** `Tudo · Do dia · Avulsa · Grifo`, e cada um recorta de verdade (o teste tem os três
   tipos no fixture).
9. ⚠️ **Cor:** o grupo **só existe** quando o tipo pode incluir grifo (decisão E) — e o teste
   prova as duas direções: com "Anotações" o grupo **desaparece**, e a cor escolhida é
   **descartada** ao trocar o tipo (senão fica um recorte invisível — é a invariante "um chip
   aceso" da 27).
10. ⚠️ **Leitura:** `<select>` nativo com as opções vindas do **plano do livro**, na ordem do
    plano, mais "todas". Ele tem `<label>` associado (não `aria-label` num `<select>` sem
    rótulo visível), e recorta por `planItemId`. ⚠️ **A anotação avulsa e o grifo não têm
    `planItemId`** — escolher uma leitura os **exclui**, e isso é o comportamento certo (é a
    fidelidade do §7.1: `WHERE "planItemId" = 'x'` contra `NULL` é falso). O teste diz isso com
    todas as letras.
11. As dimensões combinam em **AND**, e o teste tem um caso com as quatro juntas.
12. ⚠️ **Sempre exatamente um chip aceso por grupo** — a invariante que a 27 descobriu sem dono.
    Um `scope` que aponta para um chip que deixou de existir cai no neutro.

### O que sai do `book.tsx`

13. ⚠️ O `book.tsx` **encolhe**: o acervo, o filtro por pessoa e a requisição de anotações saem.
    **Cole o número antes e depois** (contador canônico, no docblock do `highlights.tsx`) — era
    **486**, e a fatia tem de devolvê-lo à ordem de grandeza de uma tela de plano.
14. A tela do livro fica com **um** link para o acervo, pelo `Link` do roteador — **nunca**
    âncora crua (a lição medida da 16: âncora crua recarrega o PWA inteiro).
15. ⚠️ A **sobreposição de autoria do plano** continua funcionando e **continua dizendo o nome**
    (a 27 acabou de consertar isso; esta fatia não pode desfazer). Teste: o plano mostra a
    inicial de verdade e o `aria-label` interpolado.

### Transversais

16. ⚠️ As varreduras **anti-culpa** e de **privacidade** rodam em **todos** os estados novos,
    pelo helper único — e o `expectNoGuilt()` já **embute** a de privacidade (conserto da 25):
    **não a chame duas vezes**. A de catálogo cobre `pt` **e** `en` desde a 27.
17. Nenhuma string da API na tela — texto **e** atributos; chaves em `pt` **e** `en`. E a
    varredura de strings cravadas em `packages/ui` continua em **33** (esta fatia não põe texto
    em `ui`).
18. ⚠️ O chunk de entrada continua **abaixo de 450.000 B** e **cole o número em bytes** (a
    `bundle-guard` mede bytes desde a 27). Antes desta fatia: **418.114 B**, folga **31.886 B**.
    A projeção medida na 27 é de **~4,2 kB** para esta tela, porque o `FilterBar` já está pago.
    Se estourar a projeção, **diga o número** — a saída registrada é o catálogo `en` por
    `import()` (medido: **8.984 B**), nunca elevar o teto.

## Arquivos a tocar

```
packages/app/src/pages/acervo.tsx                      NOVA — a tela (absorve highlights.tsx)
packages/app/src/pages/highlights.tsx                  REMOVIDO ou reduzido (ver decisão A)
packages/app/src/pages/__tests__/acervo.test.tsx       NOVO
packages/app/src/pages/book.tsx                        o acervo SAI; fica o plano + o link
packages/app/src/pages/__tests__/book.test.tsx         encolher junto
packages/app/src/pages/__tests__/highlights.test.tsx   migra para o acervo
packages/app/src/pages/paths.ts                        o endereço novo
packages/app/src/router.tsx                            a rota
packages/shared/src/locales/{pt,en}.ts                 as chaves
```

**Não tocar:** `packages/backend/**` e `prisma/` (**nenhuma rota nova é necessária** — o acervo
usa `GET /clubs/:clubId/notes?bookId=`, `GET /clubs/:clubId/highlights?bookId=`,
`GET /books/:bookId` e `GET /clubs/:clubId/members`, todas prontas; se você achar que precisa de
rota, **pare e reporte**) · `packages/ui/**` (o `FilterBar` está pronto e é **agnóstico de
dimensão** de propósito — se ele não servir, **pare e reporte**, é achado) ·
`pages/{highlight-form,highlight-fields,highlight-colors,free-note,day-note,chrome}.tsx` (a
lista **linka** para os formulários; não os reescreva) · `app/src/{i18n,theme,env}.ts` ·
`offline/**`.

## Definição de pronto

- [x] Uma lista, `createdAt` desc, com anotação e grifo **intercalados**, e fixture em que a
      ordem errada **falha** (1).
- [x] Tipo inequívoco por linha; cor **com nome**; página quando existe (2).
- [x] O nome de quem escreveu nas **duas** metades (3) — a última inconsistência do MVP 2.
- [x] Cada linha abre a tela certa; a alheia **sem affordance** (4).
- [x] Vazio ≠ filtrado-sem-resultado, em **cada** dimensão (5).
- [x] ⚠️ Pessoa: `ARCHIVED` não vira chip **e** ainda resolve nome (7).
- [x] ⚠️ Cor **desaparece** quando o tipo exclui grifo, e a escolha é **descartada** (9).
- [x] ⚠️ Leitura em `<select>` com `<label>`, e escolher uma leitura **exclui** avulsa e grifo,
      com o teste dizendo isso (10).
- [x] As quatro dimensões combinam em AND (11); **um chip aceso por grupo** (12).
- [x] ⚠️ **`book.tsx` encolheu — número antes e depois colado** (13), e a sobreposição do plano
      **continua dizendo o nome** (15).
- [x] Anti-culpa e privacidade em **todos** os estados novos, sem chamada dupla (16).
- [x] ⚠️ **Chunk de entrada em bytes, colado**, abaixo de 450.000 (18).
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos (baseline: 408 · 195 · 1287 · 552).
- [x] `packages/backend` em **1287** e `packages/ui` em **195** — **intocados**, provado por
      `git status`; os **367** de integração **não** rodados.
- [x] **Linhas de código coladas** da tela nova e do `book.tsx` antes/depois.
- [x] Checklist marcada; a linha 28 do `BACKLOG.md` é do orquestrador.
