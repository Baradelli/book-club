# Tarefa 38e — O tema do dia na linha do feed

> **Fatia gerada pela resposta do dono à pergunta 3 do MVP 3** (2026-09-17):
> *"quero o tema do dia na linha"*. → `docs/ACEITE-MVP.md`, MVP 3, pergunta 3.
>
> Hoje a linha diz *"Maria leu um dia de **O Senhor dos Anéis**"*. Passa a poder dizer **qual**
> dia — *"Cap. 3 — A promessa"* —, que é o que faz a atividade do outro puxar ("ela escreveu
> sobre o capítulo 4" é o exemplo do §1 do plano, escrito lá desde o começo).
>
> Leia antes: `CLAUDE.md` · `docs/CONVENCOES-CODIGO.md` **§6.1** (o schema de `response` é
> barreira de segurança), **§6.8** (o cliente VALIDA a resposta de sucesso), **§6.9** (port que
> cresce + impl Prisma na MESMA unidade), **§7.1** (fidelidade do fake nos DOIS sentidos),
> **§7.2** (nenhum port promete ordem) · `docs/tasks/35-feed-na-home.md` — **a decisão E dela é
> o que esta fatia muda, e a recusa que ela escreveu continua valendo**.

---

## ⚠️ A saída que continua RECUSADA, e a recusa é da Tarefa 35

**Denormalizar o título dentro do `ActivityEvent`.** O evento é **log imutável** (`CLAUDE.md`),
e um título guardado envelhece no dia em que o admin corrigir o plano — aí o feed **mente sobre
o passado**, que é pior que não dizer nada.

⚠️ **A diferença que faz esta fatia ser possível sem desfazer aquela recusa:** o título é
resolvido **no momento da LEITURA**, a partir do plano **atual**. Ele nunca é guardado, nunca
tem versão, e não pode divergir do plano — porque é o plano. Quem corrige o plano corrige o
feed de graça, inclusive para eventos de meses atrás.

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | ⚠️ **O título entra no `activityEventResponseSchema` como `planItemTitle: z.string().nullable()`** — **obrigatório e ANULÁVEL, nunca `.optional()`** | É a mesma decisão, e o mesmo motivo, do `planItemId` que já está lá: o cliente **valida a resposta de sucesso** (§6.8), e um campo ausente quebraria a tela em cheio. `null` é **estado real**, e há dois deles — ver a decisão C |
| **B** | **A junção acontece no `ListActivity`, não na tela** | A tela teria de pedir o plano **de cada livro** do feed: N requisições no celular, que é exatamente o que a Tarefa 35 recusou. No servidor é **uma** consulta a mais, e ela é indexada por id |
| **C** | ⚠️ **`null` tem DOIS significados, e os dois são legítimos:** (1) o evento não tem dia (anotação avulsa, grifo — o `planItemId` já é `null`); (2) o dia **existia e sumiu** (o admin tirou aquele dia do plano) | A tela trata os dois **igual**: cai na frase de hoje, a que só diz o livro. ⚠️ **Não invente frase de "dia removido"** — é ruído sobre uma correção de plano que não é da conta de quem lê o feed |
| **D** | ⚠️ **O port cresce com `ids?: readonly string[]`, e o `bookIds` continua OBRIGATÓRIO** | O `ReadingPlanItemFilter` já diz por escrito que os livros chegam **já cortados por tenant pelo chamador**. Manter o `bookIds` é a **segunda barreira**: mesmo que um `planItemId` de outro clube entrasse na lista de ids, ele não casaria o recorte de livro. Um filtro só por id seria uma regra de tenant a menos para manter em dia — o erro que o `ReadingLogFilter` recusou na Tarefa 32 |
| **E** | **A impl Prisma do filtro novo entra na MESMA unidade que o port** (§6.9), com o fake acompanhando nos **dois sentidos** (§7.1) | Port que cresce sem impl é vermelho adiado; fake que aceita o que o Prisma recusa (ou vice-versa) é o furo nº 1 deste projeto, oito aparições |
| **F** | ⚠️ **Nenhuma ordem prometida** (§7.2) | A resposta continua indexada por evento. O fake **enumera invertido de propósito**, e já derrubou o orquestrador uma vez na Tarefa 38c |

---

## As regras

1. **TDD, outside-in.** Domínio/UseCase primeiro, com o fake. Tela por último.
2. ⚠️ **A prova de que o título NÃO envelhece é teste, não comentário.** Um caso que: grava o
   evento, **muda o título do item do plano**, lê o feed, e vê o título **novo**. Sem esse
   teste, a decisão que separa esta fatia da recusa da Tarefa 35 é só uma frase.
3. ⚠️ **Os dois `null` da decisão C, com teste cada um.** O segundo (o dia sumiu) é o que
   ninguém escreve: prove que o evento **continua aparecendo** no feed, sem título e **sem
   sumir da lista**. Um `.filter()` mal posto some com a linha inteira, e o teste do primeiro
   caso não pega isso.
4. ⚠️ **O corte de tenant, provado com o ator LEGÍTIMO** (§7.5): um título de outro clube não
   chega. Não teste isso com um forasteiro — o forasteiro já leva 404 antes da consulta, e o
   teste passaria provando a barreira errada.
5. **Contador de consultas, não cronômetro** (§7.3): prove que a junção é **uma** consulta a
   mais, não uma por evento. O acusador é a contagem de chamadas do fake.
6. ⚠️ **Lista vazia de ids não vai ao banco.** O port já documenta isso para `bookIds`; a
   mesma regra vale aqui — um `IN ()` por feed sem dia nenhum é consulta garantidamente vazia.
7. ⚠️ **O título é CONTEÚDO DO USUÁRIO** — quem o digita é o admin do clube. Ele não pode ser
   alimentado às guardas de vocabulário como se fosse texto nosso: as varreduras anti-culpa e
   `COUNTER_SHAPE` continuam medindo **as nossas frases**, com **as fixtures delas**. Diga no
   docblock por que o título não entra nelas.
8. ⚠️ **O docblock de `activity-feed.tsx` que diz "O EVENTO NÃO CARREGA O TEMA DO DIA, e isso é
   decisão registrada (decisão E)" fica FALSO com esta fatia.** Risque-e-explique, com a razão
   de a recusa de denormalizar continuar valendo.
9. **Um catálogo só** (Tarefa 38d): as frases novas nascem em `pt` e não têm irmã em inglês.
10. Gates: `pnpm -r test` · `pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` ·
    `pnpm --filter @clube/app build`. Hoje: **586 · 195 · 1904 · 750**; integração **611**;
    chunk **431.492 B** (teto **450.000**, nunca relaxado); precache **16 / 898,33 KiB**.

---

## Definição de pronto

- [x] A linha do feed diz o tema do dia quando há dia, e só o livro quando não há.
      (`pages.home.feed.planNoteOnTheme` / `readOnTheme`; `activitySentenceKey`.)
- [x] O título vem do plano **atual** — provado por teste que muda o plano e relê o feed,
      no unitário (`⚠️ reads the title from the CURRENT plan…`, que lê o feed **antes e
      depois** da correção) e na integração (`⚠️ says the title the plan says NOW…`).
- [x] Os dois `null` têm teste, inclusive o do dia removido **sem a linha sumir**
      (`⚠️ keeps the line when the day was REMOVED from the plan, with no title`).
- [x] Uma consulta a mais, provada por **contador de chamadas**
      (`⚠️ asks the plan ONCE for the whole feed, with the days deduplicated`).
- [x] Port + impl Prisma + fake na mesma unidade, com fidelidade nos dois sentidos
      (teste de contrato contra o Postgres + teste do fake, os dois com o par positivo).
- [x] Nenhuma migration. Nenhuma dependência nova. O `ActivityEvent` **não** ganhou coluna.

### Rodada de correção (auditoria independente: 0 ALTO, 2 MÉDIO, 4 BAIXO)

- **MÉDIO 1 — `saidBy` não distinguia as duas frases do `READ`.** Medido no catálogo real:
  `saidBy(read) = "leu um dia de"` e `saidBy(readOnTheme) = "leu"` — o segundo é **substring**
  do primeiro, então `toContain(saidBy(readOnTheme))` afirmava só *"a linha tem a palavra
  leu"*. O lado do `planNoteOnTheme` não tinha o problema. Nasceu o helper `lineOf(template,
  values)`, que **interpola e compara a frase inteira**; e o fixture do caso sem tema ganhou o
  `READ` que teria tornado a asserção negativa (`not.toContain('leu')`) vermelha **com o
  código certo**. Provado com o mutante "o `READ` nunca escolhe a frase com tema": **1
  acusador**, e é a própria asserção da frase (`expected 'Maria leu um dia de O Hobbithá 3
  horas' to contain 'Maria leu A promessa antiga, de O Hobbit'`). Sobre a mesma saída do
  mutante, a asserção antiga passaria (`"…".includes("leu") === true`).
- **MÉDIO 2 — o roteiro do dono.** `COMO-TESTAR.md` §6.5 e a linha-índice do MVP 3,
  `ACEITE-MVP.md` e as specs 34/35 afirmavam o mundo de antes. Corrigidos, com **riscado +
  data** nas specs (elas registram o dia) e reescrita nos documentos de conferência. O §6.5
  ganhou os passos 4 e 5 — *corrija o título no plano, recarregue, veja a linha antiga dizer o
  título novo* —, que é a propriedade central da fatia e que o dono não tinha como conferir.
- **BAIXO 1** — o docblock do fake prometia "sem procurar" para as duas guardas de lista
  vazia. Medido: são **mutantes equivalentes** (1916/1916 verde sem elas), porque `id: { in:
  [] }` devolve vazio de todo jeito. Agora o docblock diz que a guarda é de **custo**, não de
  comportamento, e que **não tem acusador** — a redação que o teste de contrato já usava.
- **BAIXO 2** — "as duas metades" eram uma só: `toBe(novo)` implica `not.toContain(velho)`.
  Trocado por `toContain(novo)`; medido sobre a testemunha `"o velho / o novo"`: com `toBe`, a
  negativa **nunca falha sozinha**; com `toContain`, ela falha sozinha. No teste de rota o
  título corrigido passou a ser `'Capítulo dois — A promessa'`, porque `'Cap. 2 — A promessa'`
  **contém** o `'Cap. 2'` que o seed grava e a metade negativa não teria como existir.
- **BAIXO 3** — o fake ganhou o espelho de `ignores an id that is not in the plan, and brings
  the rest` (§7.1). Ele não é caso de borda: é o **caminho de todo dia** da junção.
- **BAIXO 4** — `record-activity.ts` apontava para a Tarefa 34, que **recusou** resolver o
  título. Agora aponta para a 38e, dizendo por que o número antigo estava errado.

> ⚠️ **MEDIÇÃO QUE A SPEC NÃO PREVIA, e ela é sobre a decisão C.** O segundo `null` — "o dia
> existia e sumiu" — **não é alcançável pelos caminhos do produto**: `ActivityEvent.planItem`
> é `onDelete: Restrict` e o `replacePlanItems` tem guarda de domínio
> (`planItemIdsWithAnyActivityEvent`) que recusa com 400 remover um dia que o feed referencia.
> A decisão C continua certa e o ramo continua existindo — ele é a queda de **qualquer** id
> que não resolva, e a barreira de tenant da decisão D cai nele —, mas quem prova o "sem a
> linha sumir" é o unitário com o fake, e a integração o prova pelo **caminho do contrabando
> de tenant** (um dia de outro livro), que é o único que o banco deixa existir.
