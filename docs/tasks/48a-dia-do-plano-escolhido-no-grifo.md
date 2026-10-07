# Tarefa 48a — A "Referência" do grifo vira o dia do plano, escolhido num select

> **Fatia pedida pelo dono em 2026-10-07**, numa sessão de perguntas (grilling). Ela reabre
> a decisão C e a decisão E da Tarefa 38i e a cláusula *"write-once no nascimento"* da
> emenda de 2026-09-18 ao ADR 0004. A reabertura é **explícita, do dono**, e esta fatia
> emenda o ADR de novo.
>
> Leia antes: `CLAUDE.md` · `docs/adr/0004-grifo-entidade-propria.md` inteiro ·
> `docs/tasks/38i-dia-do-plano-no-grifo.md` (a fatia que criou a coluna) ·
> `docs/CONVENCOES-CODIGO.md` §6.3, §6.9, §7.1, §7.5, §7.8.

---

## O pedido, nas palavras do dono

> *"na hora de adicionar [...] na referencia deve aparecer um select com as opções. Pois a
> referencia deve ser dos dias, dessa maneira vai ter como saber o que foi grifado naquele
> dia/naquela leitura. Já a pagina pode deixar livre mesmo"*

Hoje, "Referência" no formulário de grifo é **texto livre** (`highlight-fields.tsx`), e o dia
do plano (`Highlight.planItemId`) é preenchido **sozinho e em silêncio** com o dia de hoje,
sem poder ser corrigido. Com isso, quem grifa no sábado o que leu na sexta grava o dia errado,
e o grifo some do filtro "Leitura" do acervo, que já existe e já filtra por `planItemId`.

## As decisões (perguntadas ao dono, 2026-10-07)

| | Decisão | Fonte |
| --- | --- | --- |
| **A** | O campo de texto "Referência" do formulário **vira um `<select>` dos dias do plano** e grava `planItemId`. O rótulo visível continua **"Referência"**. A página continua livre | dono |
| **B** | Ao **criar**, o select já vem no **dia de hoje** do plano. Se hoje não tem leitura no plano, vem em **"Sem dia do plano"** | dono |
| **C** | O texto antigo de `Highlight.reference` **fica no banco, somente leitura**: não há migration nem perda de dados. O formulário para de oferecer o campo de texto | dono |
| **D** | Na tela de **corrigir**, o select também aparece: dá para **trocar** o dia e para **limpar**. Só o autor corrige o próprio grifo, pela regra que já existe | dono |
| **E** | As opções são **todos** os dias do plano (inclusive os futuros), na ordem do plano, no formato **`DD/MM · tema`**, com **"Sem dia do plano"** no topo | dono |
| **F** | A linha do acervo e a margem de prévia mostram **`DD/MM · tema`** no lugar da referência. Sem dia, mostram o texto antigo de `reference`. Sem os dois, não mostram nada | dono |

### Decisões técnicas (do orquestrador)

| | Decisão | Por quê |
| --- | --- | --- |
| **G** | `createHighlightSchema` ganha `planItemId: z.string().min(1).nullable().optional()`, com três sentidos: **ausente** = o servidor resolve o dia de hoje, como já faz; **`null`** = sem dia; **id** = aquele dia | "Ausente" mantém o caminho de quem não carregou o plano (decisão I) e todo chamador antigo |
| **H** | `editHighlightSchema` ganha `planItemId` com `.nullable().optional()`. **Ausente não mexe, `null` limpa**, na mesma semântica de `page`, `reference` e `commentDoc` | Uma regra só para o PATCH |
| **I** | Se o `GET /books/:bookId` falhar na tela de criar, **o select não aparece** e o corpo vai **sem** `planItemId` | O servidor resolve o dia de hoje, ou seja, o comportamento de antes desta fatia. A tela não trava por causa do plano |
| **J** | ⚠️ **O dia escolhido precisa ser DESTE livro.** O UseCase confere com `planItems.byId(id)`, e o item precisa existir e ter `bookId === book.id`. Se não, lança `InvalidHighlightError` e a rota responde **400**. Item inexistente e item de outro livro (ou de outro clube) recebem **a mesma resposta** | Esta é a razão que a decisão E da 38i dava para recusar o campo no corpo (*"deixaria qualquer um apontar o grifo para o dia que quisesse"*). A conferência é o que torna o campo seguro. Não há classe de erro nova |
| **K** | `HighlightPatch` do port ganha `planItemId?: string \| null`, nas **duas** implementações (a do Prisma e o fake), na mesma unidade (§6.9) | — |
| **L** | **Nenhuma migration.** A coluna e a FK `Restrict` já existem desde a 38i, e a guarda do `replacePlanItems` já impede tirar do plano um dia que tenha grifo | `schema.prisma` **não é tocado** |
| **M** | `ActivityEvent.planItemId` do grifo **continua `null`**. A regra atual de `create-highlight.ts` não muda | Fora do pedido |
| **N** | O "hoje" da **tela** sai de `localDay(new Date(), localTimeZone())`, a mesma conta de `book.tsx`. O "hoje" do **servidor**, usado no caso "ausente", continua sendo o `Settings.timezone` | O select só **sugere** o padrão; o valor que vale é o que a pessoa envia |
| **O** | O rótulo `DD/MM · tema` sai de **uma** função pura, que fatia a string `YYYY-MM-DD`. **Sem `Date`** (regra de datas do `CLAUDE.md`). Ela serve o select, a linha do acervo e a margem | Um dono só para o formato |
| **P** | O formulário **deixa de enviar `reference`**. O schema continua aceitando o campo; só a tela deixa de usá-lo | Decisão C, sem quebrar contrato |

## ⚠️ Os mutantes que esta fatia tem de matar (nomeados de antemão)

1. **O `??` envenenado.** `input.planItemId ?? <resolvido>` trata o **`null` explícito** como
   ausente e grava o dia de hoje em quem escolheu "Sem dia do plano". O código certo
   distingue `=== undefined`. Precisa existir um teste que manda `null` **num dia que TEM
   plano** e asserta `planItemId: null` na **linha gravada**.
2. **A conferência de livro.** Apagar `item.bookId === book.id` (ou só o `byId`) tem de deixar
   vermelho um teste com **um dia de outro livro do mesmo clube**, não só com um id
   inexistente. Os dois casos precisam de teste.
3. **O PATCH que não grava.** O fake e o Prisma precisam efetivamente escrever
   `planItemId`. Há um teste de contrato contra o Prisma real para `update` com id e com
   `null`.
4. **O padrão da tela.** Trocar o padrão de "hoje" por "o primeiro dia" ou por `''` tem de
   deixar vermelho um teste de `highlight-form.test.tsx`, com um fixture em que hoje **não**
   é o primeiro dia do plano.
5. **"Sem dia" na correção.** Escolher "Sem dia do plano" na edição tem de enviar
   **`planItemId: null`**, e não omitir a chave.
6. **O fallback da linha.** A linha mostra o dia quando há; o texto antigo só quando **não**
   há dia. Um grifo com **os dois** prova a precedência.

## Decisão do dono de 2026-10-07: o `DD/MM · tema` fica, e a guarda anti-culpa o isenta

**Perguntado diretamente ao dono, em 2026-10-07**, durante a execução. O formato da decisão E
(`07/10 · tema`) casa o `COUNTER_SHAPE` da varredura anti-culpa (`\d+/\d+`): para a
guarda, "07/10" tem a forma do placar "3/30". A execução parou ali e perguntou, em vez de
mexer na guarda sozinha.

| | Opção | Veredito |
| --- | --- | --- |
| **1** | Manter `07/10 · tema` e **isentá-lo** na guarda, com isenção nomeada | ✅ **escolhida pelo dono** |
| **2** | Trocar o formato por **`7 out · tema`**, que não casa a guarda | recusada |

**Como a isenção é estreita** (`PLAN_DAY_LABEL_SHAPE` e `PLAN_DAY_LABEL_ATTRIBUTE`, em
`packages/app/src/pages/__tests__/anti-guilt-dom.ts`):

- **pela forma:** o texto INTEIRO do elemento tem de ser `DD/MM · tema`, com dois dígitos,
  dia de 01 a 31 e mês de 01 a 12. Só o prefixo `DD/MM · ` sai do texto medido, e **o tema
  continua varrido**;
- **pelo lugar:** só elementos marcados com `data-plan-day-label`, que só três lugares põem:
  o `<option>` do select do formulário, a linha do acervo e a margem de prévia. O texto
  que não é dia (o "Sem dia do plano" e a referência antiga) não leva a marca;
- **não afrouxa o `COUNTER_SHAPE`** e **não conta como subtração** da
  `expectNoGuiltWithPlanPosition()`: a exclusividade mútua das duas variantes continua
  sendo sobre a posição no plano.

**Os negativos, todos com teste em `anti-guilt-dom.test.ts`:** "3/30", "3/30 dias",
"07/10" sem ` · tema`, "7/10 · x" (sem zero à esquerda), "07/1 · x", "32/10 · x",
"07/13 · x" e "00/10 · x", todos dentro de elemento marcado, continuam **acusados**. O
rótulo exato fora dos três lugares também é acusado, e um placar no tema também.

⚠️ **O risco aceito pelo dono, por escrito:** um placar disfarçado de data **na forma
exata**, num dos três lugares marcados, passaria pela varredura.

## Definição de pronto

- [x] Os schemas de criação e correção aceitam `planItemId` com os sentidos G e H, com
      teste em `highlight-schemas.test.ts`. Os testes antigos que pinavam *"refuses a patch
      that carries planItemId"* são **trocados**, não apagados em silêncio, e o relatório
      diz quais.
- [x] O `createHighlight` grava o dia escolhido, `null` e o dia de hoje quando ausente, os
      três com teste e com a **linha gravada** assertada.
- [x] O `editHighlight` troca e limpa o dia, e quem não é o autor continua recebendo o erro
      de sempre.
- [x] Um dia de outro livro e um dia inexistente dão **400** (integração), e o corte de
      tenant continua **404**, com precondição de que o ator legítimo consegue.
- [x] Contrato do Prisma: `update` com `planItemId` id e `null`.
- [x] O formulário mostra o select com o padrão B e as opções E, nos dois modos. "Sem dia"
      envia `null`, e a falha da carga do plano cai na decisão I.
- [x] A linha do acervo e a margem seguem a decisão F.
- [x] i18n: chaves novas em `pt` e `en`, sem texto solto.
      ⚠️ **O catálogo `en` não existe desde a Tarefa 38d** (o dono respondeu "só
      português — apagar o inglês" à pergunta 7 do MVP 1, e
      `locales/__tests__/catalogs.test.ts` pina que só há um catálogo). Este item vale
      **só para `pt`**: a menção a `en` foi um erro da spec, registrado aqui na execução
      em vez de apagado.
- [x] ADR 0004 emendado: o dia pode ser escolhido e corrigido, o padrão continua sendo hoje,
      e a decisão J é a guarda. Os docblocks que dizem "write-once" (`shared/src/highlight.ts`,
      `create-highlight.ts`, `edit-highlight.ts`, o port) atualizados.
- [x] Nenhuma migration, nenhuma dependência nova, `schema.prisma` intocado.
- [x] `pnpm -r test` e `pnpm -r typecheck` verdes, com a contagem real no relatório.

## Fechamento (orquestrador, 2026-10-07)

- Executor → revisor (10 mutantes, todos mortos; 1 MÉDIO + 4 BAIXOS) → correções → conferência do orquestrador.
- Gates medidos pelo orquestrador: `pnpm -r typecheck` verde; `pnpm -r test` shared **614** · ui **314** · backend **2008** · app **1115**; `pnpm -r test:integration` **653**; `pnpm lint` limpo.
- ⚠️ Na primeira rodada da suíte inteira, `preferencias.test.tsx` (arquivo **não tocado** pela fatia) falhou 1 teste perto dos 5 s; isolado passou 3/3 e a suíte do app repetida deu 1115/1115. Registrado como intermitência sob carga, não investigado nesta fatia.
- Mutação repetida pelo orquestrador no achado mais grave (o corte GLOBAL da isenção anti-culpa reposto sobre o código novo): **1 acusador**, `still accuses an UNMARKED element that repeats the prefix of a marked label`; restaurado com `cp -p` + `md5sum -c` OK.
- ⚠️ `highlight-form.tsx` saiu com **449** linhas (407 → 449), 49 acima do teto informal de 400 — declarado no docblock dele. Próximo corte sugerido: separar as telas de registrar e corrigir. **Decisão do dono, sem fatia dona ainda.**
