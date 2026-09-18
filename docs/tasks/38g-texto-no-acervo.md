# Tarefa 38g — O campo de texto no acervo do livro

> **Fatia gerada pela resposta do dono à pergunta 3 do MVP 2** (2026-09-18):
> *"quero um campo de texto no acervo, e a busca do clube continua como está"*.
> → `docs/ACEITE-MVP.md`, MVP 2, pergunta 3.
>
> A frase de aceite do MVP 2 promete *"em qualquer listagem eu filtro… por texto"* e **isso
> nunca foi verdade**: o acervo do livro filtra por pessoa/tipo/leitura/cor **sem texto**, e a
> busca (`/busca`) filtra por texto no clube inteiro **sem os outros quatro**. As duas metades
> nunca coexistiram numa listagem.
>
> Leia antes: `CLAUDE.md` · `docs/CONVENCOES-CODIGO.md` **§7.4** (asserção vazia), **§7.9** (a
> guarda no lugar certo) · `docs/tasks/28-tela-de-acervo.md` e `docs/tasks/29-busca-por-texto.md`.

---

## ⚠️⚠️ DUAS CORREÇÕES AO PLANO QUE GEROU ESTA FATIA — leia antes de estimar

**1. O "já está medido, falta só o campo na tela" estava CERTO sobre o fato e ERRADO sobre a
razão, e a diferença muda o desenho.** O plano dizia que o filtro `text` existe em todas as
camadas dos dois recursos — e existe —, **mas nenhuma delas é usada aqui**. O acervo **não
pergunta ao servidor**: ele carrega notas e grifos do livro uma vez e **recorta no cliente**
(`filterEntries` em `acervo-entries.ts`), que é o que faz tocar num chip custar **zero**
requisição. O `text` do backend é da `/busca`. **Aqui o casamento é no cliente**, sobre o que
já está na memória. Continua barato — mas por outro motivo.

**2. ⚠️ O `acervo.tsx` JÁ ESTÁ EM 511 LINHAS pelo contador canônico**, e o plano mandava cortar
acima de 400. Ele já passou. **Esta fatia não pode acrescentar nada a ele.** ✅ E os vizinhos já
existem, criados exatamente para isso: `acervo-filters.tsx` (165) e `acervo-entries.ts` (120).
⚠️ **O docblock do `acervo.tsx` até PREVÊ este campo**, por escrito: *"é aqui que o campo de
busca da Tarefa 29 entra"*. Ele previu o lugar e não previu o tamanho.

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | **O recorte é no CLIENTE**, dentro do `filterEntries` — a quinta dimensão ao lado de pessoa/tipo/leitura/cor | É o modelo da tela desde a Tarefa 28, e o que faz o filtro custar zero requisição. ⚠️ **Nada de pedir ao servidor a cada tecla** |
| **B** | ⚠️ **O texto casa o MESMO que a busca do clube casa:** na nota, o `plainText`; no grifo, o **trecho** (`quote`) **e** o comentário | O dono acabou de decidir isto na **pergunta 2 do MVP 2** (2026-09-18: "manter os dois"). Se o acervo casar menos, as duas telas discordam sobre o que "achar por texto" significa — e a que mente é a nova |
| **C** | **Sem sensibilidade a maiúscula** (o `ILIKE` do servidor também não tem) | Consistência com a `/busca`, de graça |
| **D** | ⚠️ **COM sensibilidade a ACENTO**, igual à `/busca` | Tecnicamente seria **grátis** normalizar no cliente (`normalize('NFD')`), e eu quase o fiz. Mas o dono acabou de decidir **não** ligar o `unaccent` (pergunta 1 do MVP 2, 2026-09-18), e um acervo que acha "coracao" enquanto a busca do clube não acha seria **duas verdades sobre a mesma pergunta**. ⚠️ **Registre no código que esta é a ponta barata:** no dia em que o `unaccent` entrar, as duas se movem juntas |
| **E** | **O campo e o casamento moram nos vizinhos**, não no `acervo.tsx` | Ver a correção 2 acima. O `acervo.tsx` **não cresce** |
| **F** | ⚠️ **O estado vazio distingue "não há nada" de "nada com esse texto"** | São estados diferentes e a pessoa faz coisas diferentes com cada um. É a lição das Tarefas 19/25/28, e o feed já a paga (decisão G da 35) |

---

## As regras

1. **TDD.** O casamento por texto é decidível **sem tela** — é função pura sobre
   `AcervoEntry[]`. Teste lá primeiro, tela depois.
2. ⚠️ **A decisão B com teste dos DOIS lados do grifo:** um grifo que casa **só pelo trecho**
   (sem comentário nenhum) e um que casa **só pelo comentário**. ⚠️ **O primeiro é o que
   ninguém escreve**, e é exatamente o caso que o dono acabou de preservar na pergunta 2 — um
   grifo sem comentário guarda string **vazia**, não nulo.
3. ⚠️ **A quinta dimensão COMBINA com as outras quatro, e isso precisa de teste.** O `and` de
   texto + cor + pessoa é o ponto inteiro desta fatia (a frase de aceite prometia as duas
   metades juntas). Um teste que só exercite o texto sozinho não prova nada do que se pediu.
4. **Mutação obrigatória:** o `return true` no lugar do casamento (o filtro que não filtra), e
   o casamento que ignora o `quote` do grifo. Os dois com acusador.
5. ⚠️ **Contador canônico do `acervo.tsx` colado ANTES e DEPOIS.** Ele está em **511**. Se
   subir **uma linha**, a fatia foi feita no lugar errado.
6. ⚠️ **A varredura anti-culpa roda no estado novo** (`expectNoGuilt`), inclusive no estado
   "nada com esse texto" — é estado de tela nova, e a regra 10 do projeto manda.
7. **Um catálogo só** (Tarefa 38d): as frases novas nascem em `pt`, sem irmã em inglês.
8. ⚠️ **A frase de aceite do MVP 2 que estava mentindo deixa de mentir** — mas o
   `ACEITE-MVP.md` fala de *"qualquer listagem"* e continuarão sendo **duas telas com
   propósitos diferentes**. Risque-e-explique lá o que passou a ser verdade e o que não.
9. Gates: `pnpm -r test` · `pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` ·
   `pnpm --filter @clube/app build`. Hoje: **587 · 195 · 1943 · 757**; integração **618**;
   chunk **431.836 B** (teto **450.000**); precache **16 / 898,67 KiB**.
10. **Backend intocado.** Se você sentir vontade de mexer numa rota, pare — não é esta fatia.

---

## Definição de pronto

- [x] O acervo filtra por texto, **junto** com as outras quatro dimensões.
- [x] O grifo casa por **trecho** e por **comentário**; a nota, pelo `plainText`.
- [x] O estado "nada com esse texto" tem frase própria, diferente de "não há nada aqui".
- [x] `acervo.tsx` **não cresceu** — contador colado antes e depois.
- [x] Mutação nos dois pontos da regra 4, com acusador.
- [x] Nenhuma mudança no backend. Nenhuma migration. Nenhuma dependência nova.

---

## O que ficou medido (execução de 2026-09-18)

**O contador canônico, antes e depois (regra 5):**

```
                      ANTES   DEPOIS
acervo.tsx              511      511   ← não subiu uma linha
acervo-filters.tsx      165      194   ← o campo (TextFilter)
acervo-entries.ts       120      142   ← o casamento e o vazio
```

O saldo da tela veio de três lugares: o campo e o casamento nasceram nos vizinhos; a
escolha entre as **três** frases de vazio virou função pura (`emptyTitleKey`); e o
"Você × o nome", que estava escrito **duas** vezes no arquivo — uma por metade da lista —,
virou o `authorLabel`, um dono só.

**As mutações (regra 4), com acusadores nomeados:**

| Mutante | Acusadores |
| --- | --- |
| `matchesText` → `return true` (o filtro que não filtra) | **12** (8 no unitário, 4 na tela) |
| `textsOf` do grifo ignora o `quote` | **11** (8 no unitário, 3 na tela) |
| `emptyTitleKey` volta a ter dois estados em vez de três | **2** (1 no unitário, 1 na tela) |
| a tela passa `text: ''` ao `filterEntries` (o campo desligado) | **4**, todos na tela |

**Uma correção de método, medida durante a fatia:** a primeira versão do fixture do
unitário fazia **todo** grifo dizer a palavra, e com isso os testes `AND with TYPE` e
`AND with COLOUR` passavam **verdes com a dimensão de texto inexistente** — o recorte por
tipo e por cor já devolvia a mesma lista. Um teste de AND só prova o AND quando a outra
dimensão, **sozinha**, devolveria mais. O fixture ganhou quatro entradas "mudas".

**O que NÃO foi provado:** a suíte de integração do backend não foi rodada — esta fatia
não toca um arquivo de `packages/backend` (`git status` confirma) e não tem migration.

---

## Rodada de correção (auditoria da 38g) — três achados, os três de PROSA

A auditoria independente **não achou nada de ALTO**: 1 MÉDIO e 2 BAIXOs, e nenhum deles
toca uma linha de código. Nenhuma contagem mudou — o contador canônico continua **511 ·
194 · 142**, porque comentário de bloco não conta.

**🟡 MÉDIO — sobrou UMA das três cópias da previsão, e era a que morava ao lado do
campo.** `acervo.tsx`, dentro do `collection()`, ainda dizia *"é aqui que o campo de busca
da Tarefa 29 entra"* — no futuro, a ~55 linhas do `<TextFilter/>` que já estava
renderizado. As outras duas cópias (o docblock do topo e o do `acervo-filters.tsx`) foram
corrigidas na entrega; esta ficou para trás **dentro da função onde o campo vive**, que é
o pior lugar possível para uma promessa já cumprida. Corrigida, com o registro de que a
previsão eram três parágrafos e não um.

**🔵 BAIXO 1 — dois números desmentidos por escrito no arquivo vizinho.** O docblock do
`acervo-entries.ts` ainda dizia "514 na tela, 113 aqui", que a Tarefa 32b já havia
remedido para 511 e 120 — e a 38g escreveu "120 → 142" trinta linhas abaixo, deixando o
**mesmo docblock** dizendo 113 e 120 para o mesmo arquivo. Os números ficam **datados**
("os colados na época") em vez de consertados em silêncio, porque o defeito que eles
registram é o próprio assunto do parágrafo.

**🔵 BAIXO 2 — "0 acusadores em 557" com a suíte em 777.** Três marcadores (um no
`acervo-entries.ts`, dois no `acervo.tsx`). ⚠️ **As duas afirmações foram REMEDIDAS por
mim antes de eu escrever qualquer número novo**, com o protocolo completo
(`md5sum` → mutar → confirmar por leitura → rodar → restaurar → `md5sum -c` + `diff`):

| afirmação | mutante | resultado |
| --- | --- | --- |
| o ramo `myId === null` do `matchesAuthor` é inalcançável | `return true` → `return false` | **0 acusadores em 777** |
| repetir a condição de cor no recorte é código morto | reintroduzir `color: colorApplies ? color : null` | **0 acusadores em 777** |

As duas continuam **verdadeiras**; só o denominador era de outra época. Os três
marcadores passaram a trazer as duas medições (557 na Tarefa 28, 777 hoje), e as duas
continuam com o **endereço da prova** ao lado — que é o que o §7.10 exige e o que faz a
afirmação valer mesmo sem número.

Gates da rodada: **587 · 195 · 1943 · 777** · typecheck Done nos quatro · lint limpo ·
prettier limpo · build com chunk de **432.726 B** e precache 16 / 899,54 KiB. Varredura de
invisíveis rodada de novo sobre os arquivos do diff, provando antes que ela morde: nenhum.
