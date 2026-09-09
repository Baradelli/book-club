/**
 * A igualdade do SQL, para os fakes de repositório — **uma implementação só.**
 *
 * ## O que esta função É
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
 * fidelidade entra num fake só, com os dois verdes. Ela já tem nome e data — o
 * `unaccent` da Tarefa 29 —, e o MVP 3 traz `ReadingLog` e `ActivityEvent`, que
 * seriam a 3ª e a 4ª cópia.
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
 * ## O que NÃO mora aqui
 *
 * O `matchesText` do `NoteRepositoryFake` (o `ILIKE` case-insensitive e
 * accent-**sensitive**) fica lá: tem **um** chamador só. Helper compartilhado sem
 * segundo chamador é especulação (`docs/WORKFLOW.md`) — quando a busca de grifo
 * da Tarefa 29 nascer, ela é que traz o segundo chamador, e aí ele se muda para
 * cá com o mesmo argumento desta função.
 */
export function matches<T>(
  filterValue: T | undefined,
  stored: T | null,
): boolean {
  return filterValue === undefined || filterValue === stored;
}
