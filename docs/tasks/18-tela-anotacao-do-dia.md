# Tarefa 18 — Tela da anotação do dia: o editor e o autosave

> **É a fatia que torna o app usável.** Depois dela, duas pessoas abrem o trecho de hoje,
> escrevem, e veem o que a outra escreveu. Tudo antes disto foi preparação.
>
> Leia antes: **`docs/EDITOR.md` §7 e §14** (persistência e a checklist do dono),
> `docs/adr/0001-doc-prosemirror-json.md`, `docs/adr/0002-visibilidade-total-no-clube.md`,
> `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` (§7), `docs/tasks/14-rich-editor.md`.

## Objetivo

Toco no atalho de hoje, o editor abre com o que eu já havia escrito, escrevo, e **salva
sozinho**. Ao lado, leio o que a outra pessoa escreveu sobre o mesmo trecho.

## Escopo enxuto — o dono quer usar hoje

**Entra:** o editor, o autosave, o status, e as anotações das outras pessoas **do mesmo dia**.

**Não entra, e cada exclusão tem motivo concreto:**

| Fora | Por quê |
|---|---|
| Menções `@` e wikilinks `[[` | São `capability-gated` por prop (`noteSearch`): não passar a prop é não registrar a extensão. E não há tela de busca de anotação para elas apontarem — a Tarefa 19 é que cria. |
| Colar/soltar imagem | Idem (`onUploadImage`). **Não existe endpoint de upload** no backend. Ligar isso seria construir metade de uma feature. |
| Rascunho local / fila offline | Tarefa 21. Aqui o autosave fala com o servidor e **diz** quando falha. |
| Anotação avulsa e o filtro `Tudo · Minhas · de X` | Tarefa 19. |
| Arquivar a própria nota | Tarefa 19, junto da listagem que a mostra. |

## Decisões já tomadas (não reabrir)

- **A anotação do dia é UMA por pessoa por dia**, e o caminho de escrita é
  `PUT /plan-items/:planItemId/note` — **idempotente**, que é exatamente o que o autosave
  precisa. O título vem do tema do plano e é ressincronizado pelo backend.
- **`doc` é ProseMirror JSON**; `plainText` é derivado **no backend** e nunca entra no input.
  → ADR 0001.
- **Autosave de 1500 ms na TELA, não no editor** (`EDITOR.md` §7). O editor só emite
  `onChange`.
- `SaveStatus = 'idle' | 'saving' | 'saved' | 'error'` — e `saved` volta a `idle` depois de
  2000 ms. (**`queued` fica para a Tarefa 21**: é o estado offline, e sem fila não existe.)
- **Tudo compartilhado dentro do clube**: a anotação da outra pessoa aparece, **só leitura**,
  sem nenhuma affordance de editar. → ADR 0002.
- **Ninguém edita conteúdo de outra pessoa.**

## ⚠️ Três coisas que esta fatia precisa acertar

### 1. O editor entra por `@clube/ui/editor` e **lazy** — senão o login paga 143 kB

Medido na Tarefa 14: o editor custa **+454 kB brutos / +143 kB gzip**, cerca de 2,5× o app
inteiro. Ele mora numa entrada própria (`@clube/ui/editor`) justamente para não vazar pelo
barril — mas **importá-lo direto nesta tela o põe no chunk de entrada**, e aí a tela de login
volta a baixar o ProseMirror.

**Use `React.lazy()`** com `Suspense`, e **a `bundle-guard` tem de virar por chunk** — a dívida
já está registrada no docblock dela: hoje ela soma **todos** os `.js` contra um teto e exige
zero marcas de editor em **qualquer** asset, e as duas asserções são impossíveis nesta fatia.
O formato novo: (a) o chunk de **entrada** abaixo do teto e **sem** marcas de editor; (b) o
chunk do editor **existe** de fato; (c) o total num teto mais alto.

**Não relaxe o teste — troque a asserção pela que descreve a verdade nova.** É o próximo lugar
onde o caminho fácil seria apagar a guarda.

### 2. `onChange` espúrio = autosave espúrio

A Tarefa 14 achou e consertou dois: `setEditable` emite `update` mesmo sem mudança, e
`setContent(doc, true)` emitiria a cada carregamento. Os dois viram **um salvamento por
anotação aberta** — a pessoa abre a nota da outra para ler e o app grava.

Esta tela é o primeiro chamador real do `onChange`. **Regra:** abrir a tela, carregar o `doc` do
servidor e não digitar nada **não dispara nenhum `PUT`**. É teste, não intenção.

### 3. O `doc` vazio não é o mesmo que "nada escrito"

O editor emite `{ type: 'doc', content: [{ type: 'paragraph' }] }` para um documento vazio, e o
backend aceita (a regra 11 da Tarefa 08 é explícita: recusar quebraria a primeira digitação).
Então **abrir e fechar sem escrever pode criar uma nota vazia** se o autosave disparar.

Junto com o item 2, a regra é: **o `PUT` só sai depois de uma mudança de conteúdo feita pela
pessoa.**

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | A tela carrega o plano por `GET /books/:bookId` e acha o item pelo `planItemId` da URL | É a mesma requisição da Tarefa 17, e traz o **tema do dia** (o título da nota). Um endpoint de item só não existe. |
| B | As anotações das outras pessoas vêm de `GET /clubs/:clubId/notes?planItemId=…` | É o `listNotes` da Tarefa 10, que **não tem chamador** até hoje. Filtrar por `planItemId` é exatamente o caso dele. |
| C | **A minha nota vem da mesma listagem**, não de uma requisição própria | Uma requisição a menos, e o `listNotes` já devolve todas as do dia. Identifico a minha pelo `userId` — o que exige o `me` do contexto (ver ⚠️ 4). |
| D | O `doc` das notas alheias é renderizado com o **editor em `editable={false}}`** | Renderizar ProseMirror JSON à mão exigiria um segundo renderizador. O editor já sabe, e em leitura ele não mostra barra nem bubble menu (a Tarefa 14 provou). |
| E | Sem botão "salvar" | O autosave é o produto. Um botão que não faz nada de diferente é ruído; um que faz é dois caminhos de escrita. |
| F | Falha de salvamento **não perde o texto** | O `doc` fica no estado do React; a mensagem diz que não salvou e oferece **repetir**. Sem `localStorage` (é a Tarefa 21). |

## ⚠️ 4. O contexto de clube **descarta** o usuário do `/me`

A Tarefa 17 mediu: o `ActiveClubValue` expõe `status · clubs · activeClub · error · selectClub
· reload` e **joga fora** o `id`/`name` do `/me`. Consequência: nenhuma tela sabe **quem sou
eu** — e esta tela precisa disso para separar a minha anotação das outras (decisão C).

**Esta fatia expõe `me` no `club/active-club.tsx`** (`{ id, name }`, o que o `/me` já devolve).
É pequeno, é sem backend, e destrava também o avatar da Tarefa 17, que hoje mostra uma letra
derivada do UUID e não consegue dizer "você".

**Não** resolve o nome da **outra** pessoa: nenhuma rota lista os membros do clube. Para um
clube de duas pessoas, "você" × "a outra pessoa" comunica o que precisa; o nome dela fica
registrado como lacuna de backend.

## Regras (o que os testes provam)

### O editor e o carregamento

1. A tela carrega e mostra o **tema do dia** (o `title` do item do plano) como título.
2. O editor abre com o **meu** `doc` daquele dia, quando já existe.
3. Sem nota minha, o editor abre **vazio** e sem erro.
4. **`planItemId` que não está no plano do livro** → estado tratado, não tela branca.
5. **404 no livro** → frase própria (o mesmo caso da Tarefa 17).
6. O editor é carregado **lazy**: existe um estado de carregamento enquanto o chunk chega.

### O autosave

7. **Abrir a tela e não digitar nada NÃO dispara `PUT` nenhum** (⚠️ 2 e 3).
8. Digitar dispara **um** `PUT` depois de **1500 ms** de silêncio — não um por tecla.
9. Digitar de novo **durante** a espera **reinicia** a espera (debounce, não throttle).
10. O `PUT` vai para `/plan-items/:planItemId/note` com **`{ doc }`** e nada mais — sem
    `plainText`, sem `userId`, sem `clubId`.
11. O status percorre `idle → saving → saved`, e `saved` volta a `idle` depois de 2000 ms.
12. Falha de rede → status `error`, **o texto continua na tela**, e há **repetir** que refaz o
    `PUT`.
13. **403/404 no `PUT`** (nota de outra pessoa, ou membership que sumiu) → frase própria, sem
    perder o texto.
14. Sair da tela com um salvamento pendente **não** deixa `setState` em componente
    desmontado nem dispara duas vezes.

### As anotações das outras pessoas (ADR 0002)

15. As notas do **mesmo dia** de outras pessoas aparecem, em **leitura**.
16. **A minha não aparece duplicada** na lista das outras (é identificada pelo `me.id`).
17. Não há **nenhuma** affordance de editar ou arquivar a nota de outra pessoa.
18. Dia em que só eu escrevi → nada de "ninguém mais escreveu" com tom de cobrança.
19. A varredura **anti-culpa** passa nesta tela, em todos os estados.

### Fiação e bundle

20. `me` exposto pelo contexto de clube, e a tela identifica a minha nota por ele (⚠️ 4).
21. **O chunk de entrada continua sem TipTap**, e existe um chunk separado com o editor (⚠️ 1).
22. Nenhuma string da API na tela — texto **e** atributos.
23. Chaves novas em **`pt` e `en`**.

## Arquivos a tocar

```
packages/app/src/pages/day-note.tsx            a tela de verdade (hoje é placeholder)
packages/app/src/pages/__tests__/day-note.test.tsx    NOVO
packages/app/src/club/active-club.tsx          +`me` (⚠️ 4)
packages/app/src/club/__tests__/               crescer
packages/app/src/__tests__/bundle-guard.test.ts        a guarda por chunk (⚠️ 1)
packages/app/vite.config.ts                    só se o chunk do editor exigir `manualChunks`
packages/shared/src/locales/{pt,en}.ts         as chaves da tela
packages/app/src/pages/book.tsx                se o avatar puder dizer "você" de graça
```

**Não tocar:** `packages/backend/**`, `prisma/`, `packages/ui/**` (inclusive o editor — ele
está fechado e auditado), `packages/shared/src/client/**`,
`packages/app/src/{i18n,theme,env}.ts`, `auth/require-auth.tsx`. Se o editor precisar de
mudança, **pare e reporte**.

## Definição de pronto

- [x] **Abrir e não digitar não salva nada** (7) — é a regra que impede um autosave por
      anotação aberta.
- [x] Debounce de 1500 ms com **reinício** (8, 9), provado por contagem de requisições.
- [x] O `PUT` manda **só `{ doc }`** (10).
- [x] Falha **não perde o texto** (12), e há repetir.
- [x] As notas das outras pessoas aparecem em leitura, sem affordance de edição (15, 17).
- [x] **`me` exposto** e a minha nota não duplicada (16, 20).
- [x] **A `bundle-guard` virou por chunk**, com as três asserções — e o chunk de entrada
      continua **sem** TipTap (21).
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos, contagens coladas.
- [x] Backend em **949 / 262** — verificado.
- [x] **Contagem de linhas de produção colada** (controle de complexidade).
- [x] Checklist marcada; a linha 18 do `BACKLOG.md` é do orquestrador.

## Depois desta fatia

O app fica usável: cadastrar livro pelo Swagger, abrir o dia, escrever, ler o do outro. **É
aqui que a checklist §14 do `docs/EDITOR.md` passa a ser testável** — e ela é do dono, no
celular. As Tarefas 19 (avulsas + filtro), 20 (cadastrar livro pela tela) e 21 (offline) são
conveniência.
