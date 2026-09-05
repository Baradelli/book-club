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
 * - **o catálogo** (`./anti-guilt.test.ts`): varre `pt` e `en` inteiros, sem
 *   renderizar nada — independente de tela, de estado e de locale pinado;
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
  'behind', // "you're 3 days behind"
  'overdue',
  'missed',
  'streak', // o placar disfarçado de incentivo (§1: nunca comparação)
];
