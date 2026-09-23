/**
 * ⚠️ **O VOCABULÁRIO DA COBRANÇA — UMA LISTA SÓ, PARA AS DUAS GUARDAS.**
 *
 * `docs/plano-clube-do-livro.md` §1: *"o sistema **não pune ausência de
 * registro**; valoriza qualquer registro útil. Quem está atrasado não vê dívida
 * vermelha nem 'você falhou 3 dias' — vê a leitura de hoje e um convite para
 * escrever."*
 *
 * Duas guardas usam este vocabulário, em superfícies diferentes:
 *
 * - **o catálogo** (`./anti-guilt.test.ts`): varre o `pt` inteiro — o único que
 *   existe desde a Tarefa 38d —, sem renderizar nada e independente de estado;
 * - **o DOM** (`packages/app/src/pages/__tests__/anti-guilt-dom.ts`): varre o
 *   que **não** vem de catálogo — o número renderizado a partir de dado, a cor,
 *   e a palavra que entrou na tela sem passar pelo `t()`.
 *
 * ⚠️ **POR QUE UM ARQUIVO SÓ, e é um achado da Tarefa 19.** As duas listas eram
 * cópias, com o comentário "é a mesma lista do catálogo, de propósito". Ao
 * corrigir um radical largo demais, só uma das duas foi corrigida — e as duas
 * guardas passaram a discordar sobre o que é cobrança. Aqui a concordância é
 * estrutural: não há como corrigir uma e esquecer a outra.
 *
 * Ele mora em `__tests__/` de propósito: é vocabulário de teste, e nada em
 * `__tests__/` embarca no PWA.
 *
 * ⚠️ A lista veio de uma medição, não de intuição: a primeira versão tinha sete
 * termos e a auditoria passou por ela com **"deixou 3 dias para trás"** e **"em
 * atrazo"** (com erro de digitação) — zero acusadores. Daí `'deixou'` e
 * `'atraz'`.
 *
 * São **radicais**, não palavras — é isso que faz a lista sobreviver à
 * criatividade de quem escreve a próxima frase.
 */
export const GUILT_TERMS: readonly string[] = [
  // Português
  //
  // ⚠️ `atras` e `' tras'` (com ESPAÇO), e NÃO o radical `tras` solto.
  //
  // MEDIDO na Tarefa 19: `tras` casa dentro de **ou_tras_**, e por isso o
  // rótulo do filtro do acervo teve de virar "De alguém do clube" — ou seja,
  // **a guarda passou a mandar no texto do produto**, que é o contrário do que
  // ela existe para fazer. Também casava `mostras`, `cadastras`, `letras`.
  //
  // Os dois radicais juntos pegam os MESMOS 5 alvos ("atrás", "para trás",
  // "atrasado", "atraso", "ficou para trás") com **zero** falso positivo nos 6
  // inocentes medidos. Ampliar guarda é bom; ampliar até ela vetar palavra
  // inocente é como uma guarda morre — alguém a enfraquece inteira, ou
  // contorna o produto, para poder escrever uma frase legítima.
  'atras', // atrás · atrasado · atraso
  ' tras', // para trás · ficou para trás
  'atraz', // o erro de digitação, medido: "em atrazo"
  'deixou', // "você deixou 3 dias para trás"
  'penden', // pendência · pendências · pendente (o stem tem de parar no `n`:
  //           'pendenc' NÃO casa "pendentes", e a primeira versão desta lista
  //           deixou a frase medida passar por causa dessa letra)
  'divida', // dívida
  'falta', // faltam 3 dias · em falta
  'perdeu', // "você perdeu 2 leituras"
  // Inglês
  //
  // ⚠️ **FICAM, mesmo sem catálogo `en` (Tarefa 38d).** Esta lista também é a
  // da varredura de DOM e a da de fonte do `app`, e lá uma frase em inglês
  // escrita direto no código continua alcançável — nomes de variável, `aria-*`
  // e texto de placeholder são escritos em inglês neste projeto por convenção.
  'behind', // "you're 3 days behind"
  'overdue',
  'missed',
  'streak', // o placar disfarçado de incentivo (§1: nunca comparação)
];

/**
 * ⚠️ **AS ÚNICAS CHAVES ISENTAS DA VARREDURA DE VOCABULÁRIO — a corrente de
 * leitura (ADR 0010).**
 *
 * ⚠️ A palavra "de vocabulário" entrou na Tarefa 40, e não é enfeite: até ela,
 * esta era a única isenção do projeto e o docblock dizia "da varredura". Desde
 * o `COUNTER_EXEMPT_KEYS`, **logo abaixo**, há duas, de guardas diferentes —
 * esta isenta das PALAVRAS (`GUILT_TERMS`), aquela isenta do FORMATO
 * (`COUNTER_SHAPE`) —, e
 * um "as únicas" sem qualificação passaria a ser falso dentro de um arquivo que
 * o próximo agente lê como verdade.
 *
 * O dono pediu o "foguinho" do Duolingo e, avisado de que ele contraria o §1 do
 * plano, **reafirmou o pedido**. O mecanismo do Duolingo é enquadrado na PERDA:
 * o fogo não premia ter lido doze dias, ele ameaça perder os doze. Escrever isso
 * exige as palavras que esta lista proíbe.
 *
 * ⚠️ **POR QUE ISENÇÃO NOMINAL, E NÃO REMOVER OS TERMOS DA LISTA.** Remover
 * `streak`, `falta` e `perdeu` entregaria o mesmo produto e desprotegeria
 * **trinta telas** para liberar quatro frases — a primeira cobrança escrita por
 * engano em outra tela passaria sem ninguém ver.
 *
 * ⚠️ **E POR QUE ISSO NÃO É A "LISTA QUE ALGUÉM AMPLIA PARA CALAR O TESTE"**, que
 * é a objeção escrita no docblock do `anti-guilt.test.ts` e que vale: esta lista
 * é **pinada por um teste de igualdade exata**. Acrescentar uma chave aqui fica
 * VERMELHO, e quem quiser ampliá-la tem de dizer por escrito, no teste, que
 * está ampliando. A objeção original era contra uma isenção que cresce em
 * silêncio; esta não cresce em silêncio.
 */
export const STREAK_KEYS: readonly string[] = [
  'pages.home.streak.days_one',
  'pages.home.streak.days_other',
  'pages.home.streak.none',
  'pages.home.streak.atRisk',
  'pages.home.streak.mine',
  // O corpo do LEMBRETE com a moldura de perda (a outra metade do ADR 0010).
  'notifications.readingReminder.streakBody_one',
  'notifications.readingReminder.streakBody_other',
];

/**
 * ⚠️ **AS CHAVES ISENTAS DA VARREDURA DE **FORMATO** — a posição no plano
 * (MVP 3.5).**
 *
 * Isto é a segunda isenção do projeto, e ela é de OUTRA guarda: o
 * `STREAK_KEYS` acima isenta do VOCABULÁRIO (`GUILT_TERMS`); esta isenta do
 * FORMATO (`COUNTER_SHAPE`, em
 * `packages/app/src/pages/__tests__/anti-guilt-dom.ts`), que proíbe
 * `\d+ de \d+` no DOM porque é a forma do placar.
 *
 * "Dia 11 de 30" **não é placar.** Placar conta o que foi feito contra o que
 * havia para fazer, e compara; isto diz ONDE a leitura de hoje está no mês, e o
 * número não muda com o que ninguém fez. Decisão do dono, em `docs/BACKLOG.md`
 * ("decisões fechadas do MVP 3.5").
 *
 * ⚠️⚠️ **E A LISTA, POR SI, NÃO ISENTA NADA — este é o ponto que mais
 * facilmente se lê errado.** O `COUNTER_SHAPE` roda sobre o DOM RENDERIZADO, e
 * não sobre chaves: no texto de uma tela não há caminho de chave nenhum, só
 * "Dia 11 de 30". Então quem executa a isenção é a varredura de DOM, que
 * **deriva** a frase de cada chave daqui — pega o valor no catálogo, escapa
 * cada literal e troca só os buracos `{{…}}` por dígito — e subtrai essas
 * frases do texto ANTES de medir o formato.
 *
 * ⚠️ **POR QUE POR FRASE EXATA, E NUNCA POR REGEX LARGA.** Um
 * `replace(/\d+ de \d+/g, '')` entregaria os mesmos testes verdes e isentaria
 * **todo** contador do app: a guarda continuaria no relatório, verde, e teria
 * parado de guardar — a pior das duas falhas (é a lição da Tarefa 39 com o
 * `DANGER_STYLE`). O par positivo de `anti-guilt-dom.test.ts` planta
 * "3 de 30 dias" ao lado da frase isenta e exige que ele continue acusado.
 *
 * ⚠️ **POR QUE NOMINAL, E NÃO AFROUXAR O `COUNTER_SHAPE`.** Tirar `de` do regex
 * entregaria a mesma frase e desprotegeria **todas** as telas. A isenção por
 * chave custa uma linha num `toEqual` de igualdade exata (`anti-guilt.test.ts`,
 * no molde do `STREAK_KEYS`), e o custo é o ponto: ampliá-la fica VERMELHO, e
 * quem ampliar diz por escrito que está ampliando.
 *
 * ⚠️ **O QUE NÃO ENTRA, e é pergunta em aberto para o dono:** o
 * `searchResultCount` do §A.9 ("{n} resultados em todo o clube"). Quem o proíbe
 * não é esta lista — é a decisão de produto da Tarefa 29, registrada em
 * `busca.test.tsx` (`shows NO result count anywhere, in any state`). E o
 * `COUNTER_SHAPE` nem o pegaria ("3 resultados" não tem `de` entre dois
 * números), então isentá-lo aqui não resolveria nada. Registrado no
 * `docs/new-ui.md` §A.9.
 */
export const COUNTER_EXEMPT_KEYS: readonly string[] = [
  'pages.book.plan.dayOfPlan',
];
