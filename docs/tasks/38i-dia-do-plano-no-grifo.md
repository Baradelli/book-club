# Tarefa 38i — O grifo ganha o dia do plano (`planItemId?`)

> **Fatia gerada pela resposta do dono à pergunta 4 do MVP 2, opção (d)** (2026-09-18).
> → `docs/ACEITE-MVP.md`, MVP 2, pergunta 4 · **emenda de 2026-09-18** em
> `docs/adr/0004-grifo-entidade-propria.md`.
>
> ⚠️⚠️ **É A ÚNICA DAS TRÊS COM MIGRATION**, e a única que toca o backend.
>
> Leia antes: `CLAUDE.md` · **`docs/adr/0004-grifo-entidade-propria.md` inteiro**, incluindo a
> emenda e o aviso de citação · `docs/CONVENCOES-CODIGO.md` **§6.3** (o tenant vem do JWT),
> **§6.9** (port cresce + impl na mesma unidade), **§7.1**, **§7.3**, **§7.8** (um relógio só,
> provado por CONTAGEM de leituras) · `docs/tasks/38g-*.md` e `38h-*.md`, as duas irmãs.

---

## ⚠️ A saída que eu considerei e RECUSEI — leia antes de propô-la de novo

**Derivar o dia na leitura, sem coluna.** O grifo já tem `createdAt`, o acervo já carrega o
plano, e o `localDay` já existe no `shared`: dava para calcular *"de que dia do plano é este
grifo"* na tela, com **zero migration, zero backend** — a forma das três fatias anteriores.

⚠️ **Recusada, e a razão é a mesma da Tarefa 35:** a derivação **muda de significado sozinha**.
Se o admin corrigir as datas do plano, todo grifo antigo **remapeia em silêncio** — o que era
"Cap. 3" vira "Cap. 5" porque alguém mexeu no calendário. Para o **título** do feed (38e)
seguir o plano era **certo**, porque o título é propriedade do dia; aqui mudaria **o dia em
si**, que é a tela mentindo sobre o passado.

✅ **E a coluna tem uma segunda virtude que a derivação não tem:** ela é **onde CABERIA uma
correção** no dia em que o preenchimento automático errar (grifar no sábado o que se leu na
sexta). A derivação não tem onde — erraria para sempre, recalculando.

⚠️⚠️ **O CONDICIONAL É LITERAL, e a auditoria da execução me corrigiu: essa correção NÃO
FOI ENTREGUE, e hoje é impossível.** O `planItemId` é **write-once no nascimento**, e isso
está pinado por teste em três pontos:

- o `editHighlightSchema` recusa `planItemId` no patch (**400** pelo `.strict()`) — teste
  `refuses a patch that carries planItemId` em `highlight-schemas.test.ts`, e
  `never lets a planItemId in the patch move the day` na integração da rota;
- o campo está **fora do `HighlightPatch`** do port, como o `createdAt`;
- o único `highlights.save` do projeto é o do `createHighlight` (medido:
  `grep -rn 'highlights\.save(' src/usecases` devolve uma linha).

Esta fatia entregou **a coluna**, que é a precondição; **a tela de correção é fatia
própria**, e fica registrada aqui como possível — não como cumprida. Repetir o argumento
no indicativo faria o próximo agente procurar uma tela que não existe.

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | ⚠️ **A coluna é `planItemId String?` em `Highlight` — NÃO `noteId?`** | O ADR 0004 discute `noteId?` e a emenda explica a diferença. Passar pela anotação quebraria o caso que o ADR protege: *"quero registrar um grifo num dia que não escrevi anotação nenhuma"* |
| **B** | ⚠️ **OPCIONAL, e é o que preserva a decisão central do ADR 0004** | *"O grifo não depende de um dia de leitura"* continua verdade. Grifo em dia sem plano — ou em dia nenhum — continua existindo |
| **C** | **Preenchimento automático e silencioso na CRIAÇÃO** | Decisão do dono, perguntado: *"automático, sem perguntar"*. ⚠️ **Nenhum campo novo na tela** — o gesto continua de dois toques, que é o §1 do plano ("atrito mínimo") |
| **D** | ⚠️ **"Hoje" é o dia no `Settings.timezone` DA PESSOA**, por `localDay` | `CLAUDE.md`: nunca a hora do servidor. É a mesma conta do dispatcher da Tarefa 37 |
| **E** | ⚠️ **O `planItemId` NÃO vem do corpo da requisição.** É resolvido no servidor | §6.3, igual ao `userId` e ao `clubId`. Aceitá-lo do cliente deixaria qualquer um apontar o grifo para o dia que quisesse |
| **F** | **Sem item de plano para hoje naquele livro → grava `null`**, sem erro | É o estado normal entre dois livros, e nos dias que o plano pula. Falhar aqui seria impedir de grifar |
| **G** | **A dimensão "leitura" do acervo passa a alcançar o grifo** | É o ponto da fatia: `typeCanCarryReading` e `readingOf` deixam de tratar grifo como "sem dia" |

---

## As regras

1. **TDD, outside-in.** UseCase com os fakes primeiro; migration e tela depois.
2. ⚠️ **MIGRATION SÓ VIA `prisma migrate dev --name <nome>`**, no executor desta fatia, e
   **NUNCA SQL escrito à mão** (`CLAUDE.md`). ⚠️ **O banco é o de DESENVOLVIMENTO DO DONO**, com
   super-admin de seed e com dados que ele criou usando o app.
3. ⚠️⚠️ **O BANCO PROVADO IDÊNTICO POR CONSULTA, antes e depois** — contagem por tabela, e as
   linhas que o dono criou conferidas **por conteúdo**, não por contagem. **Nunca
   `deleteMany({})`.**
4. ⚠️ **O relógio é UM SÓ, e a prova é por CONTAGEM de leituras** (§7.8). O `CreateHighlight`
   passa a precisar de "agora" para achar o dia — ele **recebe** o relógio, não o chama.
5. ⚠️ **Contador de chamadas, não cronômetro** (§7.3): prove que a resolução do dia custa **uma**
   consulta de plano e **uma** de settings, não uma por grifo criado em lote.
6. ⚠️ **A decisão E com teste de contrabando (§7.5):** um `planItemId` **no corpo** é ignorado —
   e teste isso com o **ator legítimo**, não com forasteiro (o forasteiro leva 404 antes).
7. ⚠️ **A decisão F com teste:** dia sem plano → `null`, e o grifo **é criado assim mesmo**.
8. **Port cresce + impl Prisma na MESMA unidade** (§6.9), fake nos **dois sentidos** (§7.1).
9. ⚠️ **A decisão G muda `readingOf` e `typeCanCarryReading`**, que a 38g e a 38h acabaram de
   mexer. **Releia as duas specs**: o fixture do "E" não pode virar cúmplice de novo, e cada par
   precisa dos dois tamanhos.
10. ⚠️ **Contador canônico dos três arquivos do acervo colado ANTES e DEPOIS.** Hoje:
    `acervo.tsx` **511** (⚠️ **não pode subir**), `acervo-filters.tsx` **257**,
    `acervo-entries.ts` **167**. Um bloco `{/* … */}` de JSX conta **1 linha**.
11. ⚠️ **`grep` final dos nomes que você mexer** — as três fatias anteriores todas deixaram uma
    cópia de prosa para trás, e a terceira foi achada pela auditoria. Corrigir em N lugares e
    conferir N−1 é o padrão desta rodada.
12. **Um catálogo só**: frases novas em `pt`.
13. Gates: `pnpm -r test` · `pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` ·
    `pnpm --filter @clube/app build` · **e a integração**, que esta fatia toca.
    Hoje: **587 · 195 · 1943 · 799**; integração **618**; chunk **433.794 B** (teto **450.000**,
    folga 16.206); precache **16 / 900,62 KiB**.

---

## Definição de pronto

- [x] `Highlight.planItemId` existe, é opcional, e a migration foi gerada **pelo Prisma**.
- [x] O banco do dono **provado idêntico por consulta**, com as linhas dele conferidas por
      conteúdo.
- [x] O grifo nasce com o dia de hoje quando há plano para hoje; com `null` quando não há — os
      dois com teste.
- [x] `planItemId` no corpo é **ignorado**, provado com o ator legítimo.
      ⚠️ **E o que se mede é mais forte que "ignorado": é 400 e nada escrito.** O
      `createHighlightSchema` é `.strict()`, então a chave proibida nem chega ao handler
      — §6.3: o strip do `z.object` já a removeria em silêncio, e o `.strict()` troca o
      silêncio por um 400 que diz ao cliente que ele está enganado sobre quem manda no
      campo. O UseCase também é testado sozinho, com o campo contrabandeado no input e a
      **linha gravada** assertada, porque é lá que o mutante do §7.5 (`?? fallback`) mora.
- [x] Uma consulta de plano e uma de settings, provadas por **contador**.
- [x] O acervo filtra grifo por dia de leitura, junto com as outras cinco dimensões.
- [x] `acervo.tsx` **não cresceu**.
- [x] Nenhuma dependência nova.

---

## O que ficou medido (execução de 2026-09-18)

### 1. A migration, e a prova de que o banco do dono não se mexeu

```
$ npx prisma migrate dev --name highlight_plan_item
Applying migration `20260918155532_highlight_plan_item`
Your database is now in sync with your schema.
```

O arquivo que o Prisma gerou — **nenhuma linha escrita à mão** —, inteiro:

```sql
-- AlterTable
ALTER TABLE "Highlight" ADD COLUMN     "planItemId" TEXT;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_planItemId_fkey" FOREIGN KEY ("planItemId")
  REFERENCES "ReadingPlanItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

**A prova do banco, por CONSULTA e não por raciocínio** (regra 3). Um despejo com a
contagem das 13 tabelas **mais o conteúdo inteiro** de `User`, `Club`, `Membership`,
`Book`, `ReadingPlanItem`, `Note`, `Highlight`, `ReadingLog`, `Settings` e
`ActivityEvent`, tirado três vezes: antes da migration, depois dela, e **depois da suíte
de integração inteira**.

```
user 1 · club 1 · membership 1 · invite 1 · book 2 · readingPlanItem 4 · note 1 ·
highlight 1 · readingLog 1 · activityEvent 2 · settings 1 · pushSubscription 2 ·
notificationDelivery 0
```

```
$ diff antes.txt depois-da-migration.txt
167a168
>       "planItemId": null,

$ diff depois-da-migration.txt depois-da-integração.txt
(vazio)
```

⚠️ **A única diferença em todo o despejo é a coluna nova aparecendo com `null` no único
grifo do dono** — o de `quote: "dsadsadsadsadas"`, `page: 10`, `reference: "Dia 3"`. A
`Note` dele, o `ReadingLog` dele, os dois `ActivityEvent`, os quatro `ReadingPlanItem`,
os dois livros e o `Settings` voltaram **byte a byte iguais**, com os mesmos ids e os
mesmos instantes. Nenhum `deleteMany({})` foi executado em lugar nenhum.

### 2. O contador canônico, antes e depois (regra 10)

```
                      ANTES   DEPOIS
acervo.tsx              511      511   ← não subiu uma linha
acervo-filters.tsx      257      257   ← intocado: nenhum controle novo (decisão C)
acervo-entries.ts       167      169   ← as duas linhas do `readingOf`
```

⚠️ **As duas linhas são o `readingOf`, e não uma dimensão nova.** Ele era um ternário de
uma linha (`? null : entry.note.planItemId`) e passou a ter dois ramos de verdade, que o
Prettier quebra em três. **A tela não ganhou nada**: a decisão C proíbe campo novo, e a
decisão G muda o **alcance** de uma dimensão que já existia — o `<select>` de leitura
passa a aparecer também com o tipo em "Grifo", sem uma linha nova para isso (o
`readingApplies` já estava lá).

### 3. ⚠️ A fatia cresceu num ponto que a spec não previu — e quem a obrigou foi um teste

`Highlight.planItemId` é a **QUARTA** FK `ON DELETE RESTRICT` apontando para o
`ReadingPlanItem`, e o `usecases/__tests__/plan-item-fk-guards.test.ts` (a entrega
principal da Tarefa 34b) ficou **vermelho no mesmo commit em que a coluna entrou no
`schema.prisma`**:

```
4 foreign key(s) that refuse the delete … point at ReadingPlanItem with NO domain guard:
  - Highlight.planItem: add a call to .planItemIdsWithAnyHighlight(removedIds) that throws
    InvalidBookError, or removing a plan day anchored by Highlight answers 500 instead of 400.
```

✅ **É a primeira das quatro FKs que nasceu COM guarda.** As duas anteriores (32→32c,
34→34b) precisaram de uma fatia de conserto, e nas duas a lacuna só apareceu porque
alguém foi procurar. Entraram nesta fatia, por causa disso:

- `planItemIdsWithAnyHighlight` no port + Prisma + fake, na **mesma unidade** (§6.9);
- a **quarta guarda** do `replacePlanItems`, com mensagem própria
  (`…that already have highlights`) e **POR ÚLTIMO**: é a única posição que não rouba a
  frase que o admin já aprendeu nas outras três.

⚠️ **E o `onDelete` é `Restrict` EXPLÍCITO numa relação OPCIONAL** — onde o default do
Prisma seria `SetNull`. ✅ **E isto não é decisão nova: é a TERCEIRA aplicação de um padrão
que já está duas vezes no mesmo schema.** `Note.planItem` e `ActivityEvent.planItem` são
opcionais e **já declaram `Restrict` explicitamente**; um `SetNull` aqui faria o
`Highlight` ser a única das quatro com regra diferente.

⚠️ **E o argumento contra o `SetNull` que eu escrevi primeiro era retórica mais forte que
a medição**, corrigido aqui: eu disse que ele é *"exatamente a tela mentindo sobre o
passado"*, e não é exatamente — a derivação recusada **remapeava** para o dia errado
(mentira), o `SetNull` deixa **sem dia** (amnésia). **O argumento que se sustenta é outro,
e é mais forte:** o `null` resultante é **indistinguível do grifo legitimamente avulso**.
Como a coluna é anulável de propósito, depois do fato ninguém separa "nasceu sem dia" de
"o admin apagou o dia" — não há coluna, log nem evento que registre a diferença, e nenhuma
tela de correção futura teria como desfazê-la. Falhar é a única resposta que deixa a
informação de pé.

### 4. As regras 5, 6 e 7, com os mutantes e os acusadores

Protocolo completo em todos: `md5sum` → mutar → **confirmar por leitura do arquivo** →
rodar → contar → restaurar com `cp -p` → `md5sum -c` **e** `diff`.

| Regra | Mutante | Acusadores |
| --- | --- | --- |
| **5** | `find({bookIds,date})` → `findByBook(bookId)` filtrado em memória | **1** — `costs exactly one settings read and one plan query, with one filter` |
| **5** | uma leitura de `Settings` a mais (duas no total) | **1** — o mesmo teste |
| **5** | o `date` some do filtro (o plano inteiro, primeiro item) | **6** |
| **6** | `input.planItemId ?? <o resolvido>` — o envenenamento com FALLBACK (§7.5) | **1** — `ignores a planItemId smuggled into the input, for the legitimate actor` |
| **7** | dia sem plano passa a RECUSAR o grifo | **47**, entre eles `writes null when the plan has no day for today, and creates the highlight anyway` e `never takes the plan day of another book` |
| **D** | `localDay(now, timeZone)` → `localDay(now, 'UTC')` | **5** |
| **D** | o fallback sem `Settings` vira `'UTC'` | **1** — `falls back to the default timezone, not to the clock of the server` |
| **4** | o relógio lido DE NOVO para achar o dia | **8**, entre eles `reads the clock once…` e `resolves the day from the same single clock read…` |
| **G** | a quarta guarda não recusa nada (`length > 99`) | **8** |
| **G** | o fake conta o grifo AVULSO | **2** — `never counts a highlight that has no reading day` e `never lets a loose highlight keep a day alive` |
| **G** | a quarta guarda roda PRIMEIRO (rouba a mensagem das outras três) | **3**, os três pares combinados |
| **G** | `readingOf` volta a devolver `null` para todo grifo | **9** (8 no unitário, 1 na tela) |
| **G** | `typeCanCarryReading` volta a `type === null \|\| type === 'PLAN'` | **3** (1 no unitário, 2 na tela) |

⚠️ **O mutante da regra 5 que interessa é o do `findByBook`**, e não um contador
duplicado: ele é o bug que alguém escreveria de verdade — carregar o plano inteiro (~30
dias) para descartar 29 —, e o resultado é **idêntico**. Só o contador o separa (§7.3).

⚠️ **O `date` que some do filtro (6 acusadores) é o par que impede o contador de virar
meia prova**: com ele, a contagem continua "uma consulta", e o que muda é o `findFilters`.

### 5. A regra 9 — o fixture do "E" não é cúmplice, e os dois tamanhos de cada par

Fixture do unitário: **oito** entradas, dia do plano `p-1`, faixa `[10, 100]`.

| par | com a leitura `p-1` | sem a leitura |
| --- | --- | --- |
| leitura sozinha | 3 | 8 (as oito entradas) |
| ∧ PESSOA (minhas) | 1 | 5 |
| ∧ PESSOA (dela) | 2 | 3 |
| ∧ TIPO (grifo) | 2 | 5 |
| ∧ TIPO (do dia) | 1 | 2 |
| ∧ TIPO (avulsa) | 0 — vazio por construção | 1 |
| ∧ COR (amarelo) | 1 | 3 |
| ∧ COR (verde) | 1 | 2 |
| ∧ TEXTO ("colina") | 1 | 3 |
| ∧ FAIXA `[10,100]` | 1 | 3 |
| **as SEIS juntas** | 1 | 2 sem a leitura |

⚠️ **O fixture NÃO é cúmplice:** cada recorte das outras cinco contém pelo menos uma
entrada **fora** do dia `p-1` — o grifo do dia `p-2`, os **dois** grifos avulsos, a
anotação do outro dia e a avulsa —, e por isso nenhuma coluna da direita repete a da
esquerda. O par das SEIS juntas é o mais afiado: soltar a leitura devolve **dois**,
porque o grifo do outro dia satisfaz as outras cinco.

⚠️ **E o par "vazio por construção" mudou de dono.** Até a 38h era *"leitura ∧ cor"*
(nenhum grifo tinha dia); agora leitura com cor **tem** resultado, e o que resta vazio por
construção é *"leitura ∧ tipo Avulsa"* — a anotação avulsa é o único tipo que nunca carrega
dia. A frase do docblock do `filterEntries` que dizia o contrário foi corrigida, com o
registro do que mudou.

### 6. Contagens finais, e a diferença explicada

```
                 ANTES   DEPOIS   Δ
shared             587      590   +3   (o `planItemId` no response schema: nullable, não
                                        optional; e a coluna nas duas tabelas de contrabando)
ui                 195      195    0   (intocado)
backend           1943     1975  +32   (9 do dia do plano no `createHighlight`, 12 da quarta
                                        guarda no `replacePlanItems`, 10 do método novo no
                                        fake, 1 do `plan-item-fk-guards` que passou a
                                        enxergar a quarta FK)
app                799      811  +12   (11 no unitário do acervo, 1 na tela)
integração         618      629  +11   (7 no contrato do Prisma, 4 na rota)
```

```
chunk de entrada   433.794 B → 433.828 B   (+34; teto 450.000, folga 16.172)
precache           16 / 900,62 KiB → 16 / 900,65 KiB
```

Gates: `pnpm -r test` **590 · 195 · 1975 · 811** · `pnpm -r typecheck` Done nos quatro ·
`pnpm lint` limpo · `pnpm prettier --check .` "All matched files use Prettier code style!"
· `pnpm --filter @clube/app build` ok · integração **629 passed (24 arquivos)**.

### 7. O `grep` final (regra 11)

- **`planItemIdsWithAnyHighlight`** — 27 ocorrências, todas do método novo (port, Prisma,
  fake, contador, os dois arquivos de teste e os dois docblocks que o citam). Nenhuma
  cópia órfã.
- **a prosa que dizia que o grifo não tem a coluna** — uma só ocorrência sobrou, e é a
  que **cita a frase antiga para explicar por que o comportamento mudou**
  (`acervo-entries.ts`, no docblock do `readingOf`).
- **as contagens "três"** que a quarta FK envelheceu, corrigidas em **seis** lugares:
  o docblock do `ReplacePlanItems`, o do `plan-item-fk-guards.test.ts` (mais a tabela e o
  nome do teste `finds the four foreign keys…`), o limite do §7.10 naquele arquivo, o
  `schema.prisma` (duas: "as três relações" e "quem garante que a QUARTA"), o
  `replace-plan-items.test.ts` ("a classe é a mesma nas QUATRO guardas") e o
  `prisma-highlight-repository.contract.integration.test.ts` (a quarta FK é opcional e tem
  teste próprio).
- ⚠️ **E um achado que só o `grep` pegou:** o `_db.ts` da integração explicava a ordem de
  limpeza dizendo *"as TRÊS relações do `Highlight` são obrigatórias"* e **não mencionava
  o plano**. A ordem já estava certa por acaso (o grifo sai antes do `readingPlanItem`),
  mas era a mesma armadilha que a Tarefa 34 e a 36 pregaram com os testes verdes — o
  comentário passou a dizer que a ordem agora é **obrigatória**.

### 8. O que NÃO foi provado

- **O fuso da pessoa, na integração.** O bloco de rota da 38i pina o `Settings.timezone`
  em `'UTC'` de propósito: "que dia é hoje" depende da hora em que a suíte roda, e um
  fixture com fuso deslocado ficaria verde por 14 horas do dia e vermelho pelas outras —
  falha não reprodutível é pior que nenhuma. **Quem prova que o fuso é o DA PESSOA é o
  unitário**, com dois fusos e dois dias a partir de UM instante
  (`create-highlight.test.ts`, `gives two people in different timezones two different plan
  days, from one instant`). O endereço está escrito no docblock do bloco de integração.
- **O grifo que o dono já tem continua com `planItemId: null`** — a migration é aditiva e
  não retroage. Não há backfill, e não deveria haver: derivar o dia daquele grifo a partir
  do `createdAt` é exatamente a saída que esta fatia recusou.
- **O `ActivityEvent` do grifo continua gravando `planItemId: null`.** É escolha, não
  consequência — propagá-lo mudaria o TÍTULO da linha do feed (Tarefa 38e), que é decisão
  de tela. Registrado no `createHighlight` como fatia possível, não como lacuna.
---

## Rodada de correção (auditoria da 38i) — 4 MÉDIOs e 3 BAIXOs, nenhum de ALTO

A auditoria independente **não achou nada de ALTO**. Nenhuma contagem de teste mudou — o
contador canônico continua **511 · 257 · 169** e as suítes continuam **590 · 195 · 1975 ·
811**, mais **629** de integração, porque **nenhum dos sete achados toca uma linha
executável**. Três deles são a **regra 11 da própria fatia falhando**.

### ✅ Duas medições do orquestrador, que fecham o que o revisor não podia rodar

- **O mutante de integração:** `toDomain` → `planItemId: null` no
  `PrismaHighlightRepository`. **3 acusadores contra o Postgres real** —
  `round-trips a highlight that was born on a plan day` (contrato),
  `is born anchored on the plan day of today, with nothing new in the body` e
  `never lets a planItemId in the patch move the day` (rota). O mapeamento da coluna nova
  tem acusador dos dois lados.
- **O banco do dono, por consulta própria, DUAS vezes** (depois da entrega e depois de uma
  rodada de integração com mutante): contagens idênticas, o grifo dele
  (`"dsadsadsadsadas"`, página 10, `reference: "Dia 3"`) com `planItemId: null`, o
  `ReadingLog` de `2026-09-16T14:31:29.547Z` intacto, nenhuma fixture vazada.

### ✅ E o veredito do `onDelete: Restrict`, que corrigiu o relatório e não o código

Eu reportei o `Restrict` na relação **opcional** como "decisão de produto que a spec não
pediu". **Medido, é a TERCEIRA aplicação de um padrão que já está duas vezes no mesmo
schema:** `Note.planItem` e `ActivityEvent.planItem` são opcionais e **já declaram
`Restrict` explicitamente**. Um `SetNull` faria o `Highlight` ser a única das quatro com
regra diferente. A decisão estava certa; o que estava errado era eu apresentá-la como
excepcional.

### 🟡 MÉDIO 1 — a regra 11 falhou pela QUARTA fatia seguida, e no arquivo onde entraram testes

Eu disse ter corrigido as contagens "três" em **seis** lugares; ficaram **sete**. O pior é o
docblock do `describe('the message never lies about which guard refused')`, em
`replace-plan-items.test.ts` — **o mesmo `describe` em que eu acrescentei quatro testes**:
ele dizia *"as guardas são TRÊS com frases distintas"* e *"obriga a adivinhar qual dos três
é"*, com três termos na frase combinada hipotética. Corrigido para quatro, com o registro de
que a falha foi no lugar mais caro possível.

E cinco em `plan-item-fk-guards.test.ts` — *"nos três `describe`"*, *"as três de hoje
continuam cobertas"*, *"cita os três métodos"*, *"existe em três comentários do schema"* e
*"são os sete testes de comportamento"*. Os três primeiros viraram quatro; os dois últimos
foram **remedidos**, e os dois números estavam errados:

| afirmação | medição |
| --- | --- |
| *"a convenção existe em **três** comentários do schema"* | **seis** — `grep -n 'EXPLÍCITO, e não herdado\|EXPLICITAMENTE' prisma/schema.prisma`: `Note.planItem`, `Highlight.planItem`, `ReadingLog.planItem`, `ActivityEvent`, `PushSubscription.user`, `NotificationDelivery.user` |
| *"o `replacePlanItems` cita os **três** métodos em prosa"* | **UM** — `grep -n planItemIdsWithAny replace-plan-items.ts` devolve `planItemIdsWithAnyNote` num comentário (linha 124) e os outros **três só como chamada** |
| *"são os **sete** testes de comportamento que acusam"* | **7** para a guarda de atividade (34b) e **8** para a de grifo (38i). Os dois números passaram a ficar com a fatia que os mediu |

⚠️ **O segundo é um achado meu, e ele é mais interessante que o número:** a frase já era
falsa **antes** desta fatia. E o teste continua sendo necessário exatamente por causa do
**um** que existe — apagar a chamada de `Note` e deixar o comentário daria verde para ela.
O docblock passou a dizer isso, com a medição colada.

### 🟡 MÉDIO 2 — dois NOMES de teste viraram mentira (§7.9)

`flips the moment a fourth foreign key arrives without a guard` e
`flips when the fourth foreign key arrives with an implicit Restrict`. ⚠️ **A quarta FK
chegou nesta fatia** — o `Bookmark` que esses testes fabricam passou a ser a **quinta**. Eu
reescrevi o docblock acima deles trocando "a quarta" por "a próxima" e **deixei os dois
nomes para trás**: metade do conserto, que é exatamente a forma que a auditoria da 38h já
tinha pegado nos comentários dos setters.

Os dois passaram a dizer `ANOTHER foreign key`, sem contar FKs — um nome que conta
envelhece a cada fatia que acrescenta uma.

### 🟡 MÉDIO 3 — o BACKLOG declarava aberta a lacuna que esta fatia fechou

A *"Definição de MVP 2 pronto"* ainda dizia, no item 2: *"**'por capítulo' não existe para
GRIFO em lugar nenhum** … 'Os grifos do capítulo 3' não tem como ser pedido. É lacuna de
produto que ninguém havia nomeado em nove fatias."* É **exatamente** o pedido que gerou a
38h e a 38i. Eu marquei o `[x]` 1.600 linhas abaixo e não voltei ali.

Riscado-e-explicado, com ✅ **ENTREGUE** e as três fatias nomeadas — e com o registro do que
daquele parágrafo **continua verdade**: a `reference` do grifo segue sem filtro e sem busca,
e o grifo anterior à migration segue com `planItemId` nulo.

⚠️ **E um alias fantasma que só o `grep` pegou:** aquele parágrafo, e a retrospectiva da
Tarefa 29 logo acima, citavam **`readingKeyOf`** — uma função que **nunca existiu**. O nome
é `readingOf`. Duas ocorrências, escritas uma vez e copiadas, sobrevivendo a dez fatias
porque ninguém procurou. É a lição do `dayRange` que o `CLAUDE.md` registra, e eu passei a
fatia inteira dentro do `readingOf` sem achá-la.

⚠️ **E o número certo, porque o primeiro que eu escrevi aqui era auto-referente e errado:**
`grep -rn readingKeyOf docs packages` devolve **três** linhas, e **zero em código** — uma no
`BACKLOG.md` e duas neste parágrafo, as três **nomeando o erro**. Escrever "agora devolve uma
linha" seria repetir, dentro do conserto, a forma exata do defeito consertado: um número que
não se confere. O que importa não é a contagem, é que **nenhuma ocorrência é uma citação**.

### 🟡 MÉDIO 4 — a segunda virtude da coluna NÃO foi entregue, e três textos afirmavam que sim

O argumento que derrubou a derivação na leitura tem **duas pernas**, e eu entreguei uma: a
coluna **preserva** o passado (✅), e ela seria **onde caberia** uma correção no dia em que o
preenchimento automático errar. ⚠️ **Essa correção é impossível hoje, e está pinada por
teste que seja:**

```
$ grep -rn 'highlights\.save(' src/usecases     → 1 linha (o createHighlight)
$ sed -n '/HighlightPatch/,/>;/p' ports/highlight-repository.ts
  → quote · color · page · reference · commentDoc · commentText · status · archivedAt · updatedAt
    (sem planItemId)
```

mais o `refuses a patch that carries planItemId` (shared) e o
`never lets a planItemId in the patch move the day` (integração). O campo é **write-once no
nascimento, para sempre**.

Não é defeito de código — a spec não pediu tela de correção. Mas é **metade de um argumento
repetido como cumprido**, e o próximo agente iria procurar a tela. O docblock do domínio já
estava no condicional ("onde CABERIA"); a emenda do ADR e esta spec não estavam. Os três
passaram a dizer a mesma coisa, e a tela de correção ficou registrada como **fatia possível,
que ninguém pediu**.

### 🔵 BAIXO 1 — a retórica era mais forte que a medição

O `schema.prisma`, esta spec e o BACKLOG chamavam o `SetNull` de *"exatamente a TELA
MENTINDO SOBRE O PASSADO"*. **Não é exatamente:** a derivação recusada **remapeava** o grifo
para o dia errado (mentira); o `SetNull` o deixa **sem dia** (amnésia). São defeitos
diferentes.

✅ **E o argumento real, que é mais forte, não estava escrito em lugar nenhum:** o `null`
resultante é **indistinguível do grifo legitimamente avulso**. Como a coluna é anulável de
propósito, depois do fato ninguém separa "nasceu sem dia" de "o admin apagou o dia" — não há
coluna, log nem evento que registre a diferença. A perda não é só do dado, é da
**possibilidade de saber que houve perda**, e nenhuma tela de correção futura teria como
desfazê-la. Trocado nos três lugares.

### 🔵 BAIXOs 2 e 3 — nada a fazer, registrados

- **(2)** `new Date(\`${date}T00:00:00.000Z\`)` nos fixtures de integração: o `Z` está lá, e
  são cinco arquivos que já fazem assim. Padrão estabelecido, não desvio desta fatia.
- **(3)** ✅ Zero asserção vazia nas ~1.000 linhas novas, e o revisor destacou o `rows()` no
  lugar do `labelsOnScreen()` no teste de tela — aquele helper recorta contra o
  `ORDERED_LABELS` do fixture grande e devolveria `[]` para **qualquer** implementação, que é
  a asserção vazia do §7.4. Está explicado por escrito no próprio teste.

### ➕ O que a varredura pedida achou ALÉM da lista da auditoria

O orquestrador mandou rodar o `grep` de **"três"/"quatro"** antes de dizer que fechou.
Ele achou mais **seis** lugares, os seis do mesmo defeito e nenhum na lista original:

- **três** frases em `plan-item-fk-guards.test.ts` que diziam *"a QUARTA FK"* querendo dizer
  *"a próxima"* — no docblock do `restrictFksToPlanItem` (o furo do `Restrict` implícito), no
  do `guardMethodFor` e no teste do implícito. A quarta chegou; as três passaram a dizer
  "uma FK nova" / "a PRÓXIMA". ✅ A do `guardMethodFor` ganhou de brinde a **prova** de que a
  convenção mecânica funciona: o `planItemIdsWithAnyHighlight` saiu dela sem tabela de-para e
  sem ninguém decidir o nome;
- *"uma tabela com os **três** nomes"* e *"a forma das **três** guardas"*, no mesmo arquivo —
  reescritos **sem número**, porque um argumento que conta FKs envelhece a cada fatia que
  acrescenta uma;
- *"As **TRÊS** têm guarda desde a Tarefa 34b"*, no `schema.prisma` — a frase é historicamente
  correta e ficou, mas passou a dizer **"as TRÊS DE ENTÃO"**, com o ponteiro para o parágrafo
  do fim do bloco. Contagem histórica sem data é lida como a de hoje.

⚠️⚠️ **E um defeito que eu plantei DENTRO do próprio conserto, pego pelo `grep` que o
orquestrador pediu.** Eu escrevi, no achado do `readingKeyOf`, que *"`grep -rn readingKeyOf`
agora devolve **uma** linha"*. Devolve **três** — a do `BACKLOG.md` e duas deste parágrafo,
as três **nomeando o erro**, e **zero em código**. Um número auto-referente, escrito no
parágrafo que condena números que ninguém confere. Trocado pelo que importa: **nenhuma
ocorrência é uma citação.**
### Gates da rodada

`pnpm -r test` **590 · 195 · 1975 · 811** · integração **629** · `pnpm -r typecheck` Done nos
quatro · `pnpm lint` limpo · `pnpm prettier --check .` limpo · build com chunk de
**433.828 B** (inalterado — nenhum achado toca código do app) e precache 16 / 900,65 KiB.
Contador canônico **511 · 257 · 169**, os três inalterados. Varredura de invisíveis sobre os
arquivos do diff: nenhum. Banco do dono conferido de novo por consulta, **idêntico**.
