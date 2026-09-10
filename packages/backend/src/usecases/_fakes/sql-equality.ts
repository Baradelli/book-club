/**
 * AS COMPARAÇÕES DO SQL que os fakes de repositório emulam — **uma
 * implementação de cada, para os dois fakes.**
 *
 * São duas, e as duas são **fidelidade ao Postgres, não regra de domínio**: o
 * `matches` (igualdade, inclusive contra coluna anulável) e o `matchesText` (o
 * `ILIKE '%…%'`). O arquivo continua se chamando `sql-equality.ts` porque é o
 * endereço que o `docs/CONVENCOES-CODIGO.md` §7.1 cita nominalmente — renomeá-lo
 * envelheceria o ponteiro do documento, que é a classe de dívida do §7.4
 * ("ponteiro por número/endereço que ninguém volta a conferir").
 *
 * ## O que o `matches` É
 *
 * Um campo do filtro: ausente é "não filtra"; presente compara por igualdade.
 *
 * ⚠️ **Fidelidade ao Postgres, não regra de domínio:** contra uma coluna nula,
 * `WHERE col = 'x'` é **falso** — `NULL` não é igual a nada, nem a `NULL`. É o
 * que a comparação estrita dá aqui, e é a **4ª aparição** da classe do
 * `docs/CONVENCOES-CODIGO.md` §7.1 (a tabela a lista como "coluna nula no
 * `find`"):
 *
 * - **Infiel permissiva** (casar `null`): a nota avulsa casaria o filtro por dia
 *   de leitura e a tela do dia mostraria o que não é dela; o grifo sem página
 *   apareceria no filtro da página 45. O teste passa verde e o banco discorda.
 * - **Infiel restritiva** (descartar toda linha nula): o grifo sem página
 *   desapareceria do acervo do clube, e a suíte ficaria **verde** — a direção
 *   que esconde melhor. É por isso que cada fake tem os **dois** testes, o "não
 *   casa quando pedem a página" e "aparece quando não pedem nada".
 *
 * ## Por que é COMPARTILHADA, e não uma cópia por fake
 *
 * A primeira redação da Tarefa 23 duplicou esta função no `HighlightRepositoryFake`
 * com um comentário dizendo "duplicada de propósito, são dois fakes
 * independentes". O argumento estava **errado de fato**, e a auditoria mediu que
 * os dois corpos eram byte-idênticos: o que está aqui não é detalhe de
 * repositório nenhum — é a codificação de **uma regra do Postgres**, e a
 * produção **compartilha essa regra**, porque os dois repositórios Prisma
 * delegam a mesma comparação ao mesmo banco. Este arquivo não acopla `Note` a
 * `Highlight`; acopla os dois ao `=` do Postgres, que é onde o acoplamento
 * verdadeiramente está.
 *
 * E é a **lição nº 3 do MVP 1** na letra ("vocabulário compartilhado mora num
 * arquivo só"): duas cópias com um comentário afirmando que são iguais
 * divergiram na primeira correção, **duas vezes**, e está registrado no
 * `BACKLOG`. O atenuante ("hoje cada fake tem o próprio teste de coluna nula,
 * então uma divergência ficaria vermelha") não cobre o risco real: a **próxima**
 * fidelidade entra num fake só, com os dois verdes. ⚠️ A previsão dizia
 * *"ela já tem nome e data — o `unaccent` da Tarefa 29"*, e a Tarefa 29 mediu
 * que **não era essa**: o `unaccent` ficou **fora** do escopo dela (é pergunta
 * do dono, e exige DDL + índice + ADR). A fidelidade que a 29 trouxe foi o
 * `matchesText` de duas colunas, e ela nasceu **aqui**, num arquivo só — que é o
 * que este parágrafo existia para comprar. O MVP 3 traz `ReadingLog` e
 * `ActivityEvent`, que seriam a 3ª e a 4ª cópia.
 *
 * ## Onde a propriedade é PROVADA
 *
 * Não há suíte própria, de propósito: qualquer mutante desta função já é acusado
 * pelos dois fakes que a usam e pelas suítes de UseCase que passam por eles. Uma
 * suíte aqui compraria **zero** acusador novo, e teste que não compra acusador é
 * decoração. Medido, por mutante e **por lado** — e os dois lados foram medidos
 * também com a cópia local pré-extração, para provar que a extração não derrubou
 * contagem nenhuma:
 *
 * | Mutante | Grifo | Nota |
 * |---|---|---|
 * | Permissiva (`\|\| stored === null \|\|`) — casa coluna nula | **2** | **1** |
 * | Restritiva (`return filterValue === stored`) — perde "ausente = não filtra" | **35** | **37** |
 * | Descarte cego de nulos (`if (stored === null) return false`) | **3** | **33** |
 *
 * A linha do meio é a que mede o valor deste arquivo: a direção **restritiva**
 * do §7.1 é a que esconde melhor (a suíte fica verde), e é a primeira vez no
 * projeto que ela nasce com acusador. O que a torna acusável é existir, em cada
 * fake, o teste do **outro lado da moeda** — "aparece quando não pedem nada" ao
 * lado de "não casa quando pedem a página".
 *
 * ## O `matchesText` mudou-se para cá na Tarefa 29, como estava combinado
 *
 * Até a Tarefa 28 ele morava no `NoteRepositoryFake`, e a razão escrita era
 * exata: *"tem um chamador só. Helper compartilhado sem segundo chamador é
 * especulação (`docs/WORKFLOW.md`) — quando a busca de grifo da Tarefa 29
 * nascer, ela é que traz o segundo chamador, e aí ele se muda para cá com o
 * mesmo argumento desta função."* A busca de grifo nasceu, o segundo chamador
 * existe, e ele está aqui. Nada foi antecipado.
 */
export function matches<T>(
  filterValue: T | undefined,
  stored: T | null,
): boolean {
  return filterValue === undefined || filterValue === stored;
}

/**
 * O `ILIKE '%…%'` do Postgres, com as duas fidelidades que importam — e ele casa
 * **qualquer uma** das colunas que recebe.
 *
 * 1. **Case-insensitive sim.** `toLowerCase` e não `toLocaleLowerCase`: a dobra
 *    de caixa do JS por locale depende do ICU do processo, e o banco não tem o
 *    locale do Node.
 * 2. ⚠️ **Accent-insensitive NÃO.** `'coração' ILIKE '%coracao%'` é **falso** no
 *    Postgres — pinado contra o banco desde a Tarefa 11
 *    (`prisma-note-repository.contract.integration.test.ts`,
 *    `matches case but not accent`) e, desde a Tarefa 29, também no lado do
 *    grifo. Normalizar acento aqui (`NFD` + tirar diacríticos) seria
 *    infidelidade na direção **PERMISSIVA**: o teste passaria verde e a busca
 *    real não acharia nada — a classe de bug do ADR 0007, e a 3ª aparição da
 *    tabela do §7.1.
 *
 *    **Isto é decisão fechada, não pendência.** A decisão do MVP 2 diz `ILIKE`,
 *    e `ILIKE` é accent-sensitive. Busca sem acento exige a extensão `unaccent`
 *    (DDL no banco + índice funcional + ADR) e é **fatia própria** — registrada
 *    como pergunta do dono na spec da Tarefa 29. Não "conserte" aqui: o
 *    conserto tem de mudar os dois lados juntos, e o banco é o lado que manda.
 *
 * ⚠️ **CURINGA NÃO SE EMULA AQUI**, e é de propósito: depois do
 * `toLikePattern` (`repositories/like-pattern.ts`) o contrato do port é
 * "substring **literal**, case-insensitive, accent-sensitive", e para uma
 * `String.includes` `%` e `_` **já são** literais. Emular curinga no fake seria
 * modelar um detalhe de uma camada **abaixo** do port — e a propriedade
 * "`%`/`_`/`\` são literais" só é decidível contra o Postgres, nos dois testes
 * de contrato que o `like-pattern.ts` nomeia.
 *
 * ## As COLUNAS são variádicas, e é o contrato de cada port que decide quais
 *
 * - **`Note`**: só o `plainText`. `title` e `reference` ficam FORA por decisão
 *   fechada do MVP 2, e o teste
 *   (`never matches the title or the reference, only the plainText`) é o que
 *   impede alguém de "melhorar" a busca — uma busca por "capítulo" que casasse
 *   o `title` da nota do dia devolveria o clube inteiro, porque o tema do dia é
 *   o MESMO para todo mundo.
 * - **`Highlight`**: o `quote` **OU** o `commentText` (decisão A da Tarefa 29).
 *   A decisão fechada nomeia os campos derivados e **não** menciona o `quote` —
 *   mas o `quote` é o **conteúdo** do grifo (o ADR 0004 o chama de "o trecho
 *   grifado"; o comentário é o que a pessoa achou dele), e uma busca de grifos
 *   que o ignore não acha *a frase que a pessoa grifou*, que é o caso de uso
 *   inteiro. **Registrado como pergunta do dono**; se ele discordar, é uma
 *   coluna a remover na chamada — nada muda aqui.
 *
 * O variádico é o que faz o "OU" ser **do chamador**: sem ele, o lado do grifo
 * escreveria `matchesText(t, quote) || matchesText(t, commentText)`, e com
 * `t === undefined` os dois lados dariam `true` — uma disjunção que não pode
 * falhar, escrita como se pudesse.
 */
export function matchesText(
  text: string | undefined,
  ...columns: readonly string[]
): boolean {
  if (text === undefined) return true;

  const needle = text.toLowerCase();
  return columns.some((column) => column.toLowerCase().includes(needle));
}
