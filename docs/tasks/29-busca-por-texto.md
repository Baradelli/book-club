# Tarefa 29 — Busca por texto no acervo do clube

> **A última fatia do MVP 2.** Ela é a **chamadora** que o filtro `text` do `listNotes` nunca
> teve: ele existe, funciona e está coberto por integração **desde a Tarefa 10**, e nenhuma tela
> jamais o chamou. Aqui ele ganha uso, o grifo ganha o dele, e a busca atravessa o clube — não
> um livro.
>
> Leia antes: `docs/tasks/{23-usecase-listar-grifos,28-tela-de-acervo}.md` (o "Registrado para a
> Tarefa 29" da 23 é a pergunta de produto desta fatia), `docs/CONVENCOES-CODIGO.md` **§6
> inteiro** e **§7.1** (a 3ª aparição — `ILIKE` é case-insensitive e **accent-SENSITIVE** — e a
> saída da 4ª, que foi **extrair** a regra), `docs/adr/{0001,0002,0004}-*.md`, `CLAUDE.md`.
>
> **Os vizinhos:** `src/usecases/list-notes.ts` (o `text` já normalizado lá),
> `src/repositories/prisma-note-repository.ts` (o `toLikePattern` e o `mode: 'insensitive'`),
> `src/usecases/_fakes/{sql-equality,note-repository-fake}.ts` (o `matchesText`),
> `packages/app/src/pages/{acervo,acervo-entries,club-names}.ts*`.

## Objetivo

Escrevo uma palavra e acho onde ela aparece no que o clube escreveu — em qualquer livro, em
anotação ou em grifo — e vejo de qual livro cada resultado é.

## Escopo enxuto

**Entra:** `HighlightFilter.text` (port, fake, UseCase, repositório Prisma, borda, integração) e
a tela de busca do clube, com o campo, o debounce e os resultados.

| Fora | Por quê |
| --- | --- |
| ⚠️ **`unaccent` / busca sem acento** | Ver "As duas perguntas do dono". A decisão fechada do MVP 2 diz **`ILIKE`**, e `ILIKE` **é** sensível a acento — é o que o fake reproduz de propósito e o que a integração da 11 **já pina** (`?text=coracao` devolve vazio). Ligar a extensão exige DDL no banco do dono, um índice funcional para servir de algo, e um ADR. **Fatia própria.** |
| Ranking por relevância | A ordem é `createdAt` desc, a mesma de todo o resto. ⚠️ E há um custo medido em trocá-la: a Tarefa 28 registra **12 testes** que comparam posicionalmente e ficariam vermelhos por um motivo alheio aos nomes deles. |
| Busca dentro de **um** livro | O acervo do livro (Tarefa 28) já recorta por quatro dimensões no cliente. O `BACKLOG` diz "acervo do **clube**", e é isso que não existe. |
| Destaque do termo no resultado (*highlighting*) | Ninguém pediu, e o `plainText`/`commentText` é prévia, não o documento. Aditivo. |
| Paginação | O `take: 500` de cada repositório é a válvula. ⚠️ Ver a regra 16: ela **não pode mentir**. |
| Busca em `title`/`reference` | A decisão fechada nomeia os campos de **conteúdo**. O `title` da nota do dia é o tema do plano (o mesmo para todos), e casá-lo faria uma busca por "capítulo" devolver o clube inteiro. |
| Filtro de pessoa/tipo/cor na tela de busca | O acervo do livro é quem filtra. Aqui a pergunta é "onde está esta palavra". |

## Decisões já tomadas (não reabrir)

- **Busca é `ILIKE` no `plainText`/`commentText`. Sem embeddings, sem pgvector.** → decisões
  fechadas do MVP 2.
- **`clubId` é o corte de tenant**, obrigatório e em AND com tudo. Sem membership ativo → 404.
- **Quem normaliza o `text` é o UseCase**, não o repositório: `''`/só-espaços = **não filtra**, e
  o resto vai sem as pontas. É o que o `listNotes` já faz, com o mesmo `optionalText`.
- **`%`, `_` e `\` são caracteres LITERAIS** no contrato do port; quem os escapa é o repositório
  Prisma. Medido na Tarefa 11: sem escapar, `'axb' ILIKE '%a_b%'` é **verdadeiro**.
- **Dentro do clube nada é privado**, e a busca não é exceção: ela acha o que a outra pessoa
  escreveu, com autoria. → ADR 0002.
- **Nenhuma string da API na tela**; chave nova em `pt` **e** `en`.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | ⚠️ Nos grifos, o `text` casa **`quote` OU `commentText`** | A decisão fechada nomeia os campos **derivados** de cada entidade e **não menciona o `quote`** — mas o `quote` é o **conteúdo** do grifo (o ADR 0004 o chama de "o trecho grifado"; o comentário é o que a pessoa achou dele). Uma busca de grifos que ignore o `quote` **não acha a frase que a pessoa grifou**, que é o caso de uso inteiro ("qual era aquela frase do capítulo 3?"). Leio a decisão fechada como sendo sobre o **mecanismo** (`ILIKE`, nada de vetor), não uma lista exaustiva de campos. **Registrada como pergunta do dono.** |
| B | ⚠️ O escape do `LIKE` vira **UMA** função, importada pelos dois repositórios | O `toLikePattern` existe só no `prisma-note-repository.ts`. Uma segunda cópia é a lição nº 3, e a Tarefa 23 já pagou por ela: a saída medida foi **extrair** (`_fakes/sql-equality.ts`). Isto é uma regra do **Postgres**, não política de repositório — o mesmo critério. |
| C | A busca é **do servidor**, não do cliente | A decisão fechada diz `ILIKE`, e substring em JavaScript não é `ILIKE` (a diferença é justamente o acento e o curinga). E o acervo do clube inteiro não está carregado em tela nenhuma — carregá-lo para filtrar seria trafegar tudo para descartar quase tudo. |
| D | Tela **própria** (`/busca`), alcançável da home | A home é a tela de clube; o acervo é de livro. Um campo de busca no acervo seria por livro, que é o que a 28 já faz melhor. |
| E | O resultado diz **de qual livro** é | Sem isso um resultado de clube é ambíguo: "página 112" em qual livro? É o campo que distingue esta tela do acervo. |
| F | Campo com **debounce**, e **nenhuma requisição** para termo vazio ou de 1 caractere | Uma letra casa quase tudo e custa duas consultas de 500 linhas. O debounce é o da Tarefa 18 (1500 ms é para autosave; aqui use algo menor e **meça por contagem com timers falsos**, §7.3 — nunca cronômetro). |
| G | ⚠️ **Sem contador de resultados** | "12 resultados" é a forma que a varredura anti-culpa proíbe (`COUNTER_SHAPE`), e ela existe por decisão de produto ("incentivo por presença, não por comparação", §1 do plano). A lista fala por si. **Se o dono quiser o número, é ele que decide relaxar a guarda** — e a guarda é que está certa até lá. |
| H | A ordem é `createdAt` desc, e os dois tipos vêm **intercalados** | A mesma do acervo, pelo mesmo `mergeEntries`. Ranking é fora de escopo (e o custo dele está medido na 28). |
| I | Reuso do `acervo-entries.ts` para unir e ordenar; a **linha** é própria | O módulo se **declara** reusável pela 29 ("ela é a segunda chamadora") e é neutro de React. A linha é outra porque mostra o **livro** (decisão E) — forçar o mesmo componente seria a abstração que não cabe. ⚠️ E o `matchesAuthor` tem um ramo `myId === null` **inalcançável no acervo**: se esta tela renderizar com `me` nulo, ela o herda sem teste (registrado na 28). |

## Regras (o que os testes provam)

### O backend

1. `HighlightFilter.text` entra no port, com o contrato do `NoteFilter.text`: substring
   **case-insensitive**, `%`/`_`/`\` **literais**, e quem normaliza é o UseCase.
2. ⚠️ Casa **`quote` OU `commentText`** (decisão A), e o teste tem os quatro casos: só no
   `quote`, só no comentário, nos dois, em nenhum.
3. ⚠️ **Accent-SENSITIVE**, no fake **e** contra o Postgres: `text: 'coracao'` **não** acha
   `'coração'`. É a 3ª aparição do §7.1, e o teste **diz o porquê** e aponta para a pergunta
   registrada — não deixe isso num comentário solto.
4. `listHighlights` normaliza (`''`/espaços = não filtra, o resto sem as pontas), pelo **mesmo**
   `optionalText`, e o `findFilters` prova que o `text` chega decidido (§7.3).
5. ⚠️ O escape do `LIKE` é **uma** função importada pelos dois repositórios (decisão B), e o
   teste de contrato prova, **contra o Postgres**, que `_` e `%` no termo são literais.
6. A borda ganha `text` no `listHighlightsQuerySchema` — sem `.strict()` na query (o precedente
   do `listNotesQuerySchema`), e a integração exercita `?text=`.
7. Nenhuma classe de erro nova; `NOT_YET_MAPPED` continua vazio.

### A tela

8. Termo vazio → estado **inicial** próprio ("escreva algo"), **sem cobrança** e **sem** pedir
   nada ao servidor.
9. ⚠️ **Nenhuma requisição** para termo de 1 caractere; **duas** (notas + grifos) para termo
   válido — provado por **contagem** com timers falsos, e o debounce é **debounce, não
   throttle** (o teste de fronteira da Tarefa 18: um tique antes, zero; no tique, uma).
10. Resultado mostra: o **livro**, o **tipo**, a **autoria pelo nome** (o `nameOfWriter` do
    `club-names.ts` — um dono só) e a prévia. Grifo mostra **cor com nome** (cor nunca é o único
    portador).
11. Termo sem resultado → estado próprio, **distinto** do inicial (é a lição da 19/25/28: os
    dois estados nunca são o mesmo).
12. Ordem `createdAt` desc **intercalada**, pelo `mergeEntries` — com fixture em que a ordem por
    tipo e a por data **discordam**, e a precondição **pinada**.
13. Tocar num resultado abre a tela certa (do dia · avulsa · formulário de grifo), e o alheio
    **sem affordance**.
14. Falha de uma das duas listagens é **falha da busca** (o precedente da 28: meia lista é uma
    lista silenciosamente incompleta), com "tentar de novo" que refaz **as duas**.
15. ⚠️ As varreduras **anti-culpa** e de **privacidade** rodam em **todos** os estados novos,
    pelo helper único — e o `expectNoGuilt()` **já embute** a de privacidade: **não a chame duas
    vezes**. A de catálogo cobre `pt` **e** `en`.

### Transversais

16. ⚠️ **A busca não mente sobre o teto.** Cada repositório corta em 500 linhas
    (`FIND_ROW_LIMIT`), então um clube grande pode ter resultado cortado **em silêncio**. Não há
    contador (decisão G), então **decida e registre**: ou a tela não diz nada (e o teto fica
    documentado como dívida com o número), ou ela diz algo que **não** seja contagem. Escreva a
    decisão no docblock com a medição.
17. Nenhuma string da API na tela — texto **e atributos**; chaves em `pt` **e** `en`. A
    varredura de strings cravadas em `packages/ui` continua em **33** (esta fatia não põe texto
    em `ui`).
18. ⚠️ Chunk de entrada **abaixo de 450.000 B**, número **em bytes** colado. Antes desta fatia:
    **419.142 B**, folga **30.858 B**; projeção medida: **1 a 2 kB**.

## As duas perguntas do dono (registre nas duas casas)

Estas **não** se decidem aqui. Implemente o que a spec manda, e registre na linha 29 do
`BACKLOG.md` **e** na seção do MVP 2 do `docs/ACEITE-MVP.md`:

1. **A busca deve achar "coracao" quando a pessoa escreveu "coração"?** Hoje **não** — `ILIKE` é
   accent-sensitive, e isso está pinado por teste desde a Tarefa 11. O conserto é a extensão
   `unaccent` + índice funcional + ADR, e é fatia própria. Contra: quem digita em teclado
   português escreve o acento naturalmente. A favor: quem busca no celular, com pressa, não.
2. **A busca de grifo deve casar o trecho grifado (`quote`), ou só o comentário?** Esta fatia
   **casa os dois** (decisão A), e a razão está lá. Se o dono discordar, é **uma cláusula** a
   remover.

## Arquivos a tocar

```
packages/backend/src/usecases/ports/highlight-repository.ts     + text no HighlightFilter
packages/backend/src/usecases/_fakes/highlight-repository-fake.ts   + o matchesText
packages/backend/src/usecases/_fakes/__tests__/                  crescer
packages/backend/src/usecases/list-highlights.ts                 + a normalização
packages/backend/src/usecases/__tests__/list-highlights.test.ts  crescer
packages/backend/src/repositories/like-pattern.ts                NOVO — o escape, UMA vez
packages/backend/src/repositories/prisma-note-repository.ts      importa o escape
packages/backend/src/repositories/prisma-highlight-repository.ts + o contains
packages/backend/src/repositories/__tests__/                     contrato dos dois
packages/backend/src/routes/highlight-routes.ts                  (só se a query mudar)
packages/backend/src/routes/__tests__/highlight-routes.integration.test.ts   crescer
packages/shared/src/highlight.ts                                 + text na query
packages/app/src/pages/busca.tsx                                 NOVA
packages/app/src/pages/__tests__/busca.test.tsx                  NOVO
packages/app/src/pages/{paths.ts,home.tsx}                       o endereço e a entrada
packages/app/src/router.tsx                                      a rota
packages/shared/src/locales/{pt,en}.ts                           as chaves
```

**Não tocar:** `prisma/**` (**esta fatia NÃO muda o modelo** — o `unaccent` está fora; se você
achar que precisa de migration, **pare e reporte**) · `packages/ui/**` · `src/domain/**` ·
`pages/{acervo,acervo-filters,book,free-note,day-note,highlight-form,chrome}.tsx` (a busca
**importa** do `acervo-entries.ts` e do `club-names.ts`; não reescreva as telas) ·
`app/src/{i18n,theme,env}.ts` · `offline/**`.

## Definição de pronto

- [x] ⚠️ O `text` do grifo casa **`quote` OU `commentText`**, com os quatro casos (2).
- [x] ⚠️ **Accent-sensitive** provado no fake **e** contra o Postgres, com o porquê escrito (3).
- [x] ⚠️ O escape do `LIKE` é **uma** função, e o contrato prova `_`/`%` literais (5).
- [x] Termo vazio **não** pede nada (8); 1 caractere **não** pede nada; termo válido pede
      **duas** vezes, provado por contagem com timers falsos (9).
- [x] Inicial ≠ sem-resultado (11); ordem intercalada com fixture hostil (12).
- [x] O resultado diz **de qual livro** é e **quem** escreveu, pelo nome (10).
- [x] Falha de uma listagem é falha da busca, e o retry refaz **as duas** (14).
- [x] ⚠️ **Sem contador de resultados**, e a decisão sobre o teto de 500 **escrita** (16, G) —
      a decisão é "a tela não diz nada", no docblock de `pages/busca.tsx`, com a medição.
- [x] Anti-culpa e privacidade em **todos** os estados novos, sem chamada dupla (15).
- [x] ⚠️ **Chunk em bytes colado**, abaixo de 450.000 (18) — **425.056 B** (era 419.142 B).
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos (413 · 195 · 1307 · 600).
- [x] `pnpm -r test:integration` rodado (a fatia toca repositório e rota): **386** (era 367),
      com a prova por consulta de que nenhum fixture sobrou.
- [x] `packages/ui` em **195** — intocado (`git status -- packages/ui` vazio).
- [x] **Linhas de código coladas** (contador canônico) dos arquivos novos.
- [ ] **As duas perguntas do dono registradas** no `BACKLOG` e no `ACEITE-MVP` — ⚠️ **NÃO
      feito pelo executor, de propósito**: elas estão no relatório final no formato do
      `ACEITE-MVP.md`, e os dois destinos são do **orquestrador/dono** (a linha 29 do
      `BACKLOG` é dele por esta mesma checklist, e o `ACEITE-MVP.md` declara na primeira
      linha que "este arquivo é do dono" e que a seção do MVP 2 nasce no fechamento do
      MVP 1). Todo docblock desta fatia aponta para a **spec** — o único endereço que
      existe hoje —, para não deixar ponteiro para frase que ainda não está lá (§7.4).
- [x] Checklist marcada; a linha 29 do `BACKLOG.md` é do orquestrador.
