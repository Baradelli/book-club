/**
 * "Eu li o trecho de hoje": o registro de que uma pessoa leu **um dia do plano**
 * de leitura.
 *
 * ## Por que ele ancora no `planItemId`, e não numa data de calendário
 *
 * "Li" quer dizer "li **o trecho** do dia X do plano", nunca "li em tal data".
 * A alternativa `(bookId, date)` — "li no dia 5" — **não sabe expressar o caso
 * real**: quem lê no domingo o capítulo de sexta marcaria o domingo, e o
 * capítulo de sexta ficaria eternamente sem dono. O plano é a unidade de
 * leitura do produto inteiro (cada dia tem um tema pré-definido), a `Note` do
 * dia já ancora exatamente assim, e ancorar igual faz a sobreposição da tela do
 * livro estender de graça: hoje ela mostra **quem escreveu** em cada dia; a
 * Tarefa 32 acrescenta **quem leu**, na mesma linha.
 *
 * A consequência que se quer: marcar leitura **não faz aritmética de data
 * nenhuma**. Não há fuso, não há "que dia é hoje", não há `dayRange`.
 *
 * `planItemId` é obrigatório e **não anulável** — a diferença que salta aos
 * olhos em relação à `Note`, onde ele é nulo justamente para a anotação avulsa
 * existir. **Não existe leitura avulsa**: ler é sempre ler um trecho do plano.
 *
 * ## Por que só existe `readAt`, e nenhum outro instante nem `status`
 *
 * **`ReadingLog` é log imutável: não se arquiva nem se edita.** É a exceção
 * documentada ao soft delete do projeto (`CLAUDE.md`, e as decisões fechadas do
 * MVP 3 no `docs/BACKLOG.md`): desmarcar "li" é **hard delete** da linha, e não
 * um `status: 'ARCHIVED'`.
 *
 * Daí a lista de campos que **não** existem, e cada ausência é decisão:
 *
 * - **`status` / `archivedAt`** — nada arquiva um log; o desmarcar apaga.
 * - **`updatedAt`** — nenhum caminho reescreve a linha, então seria um campo
 *   que ninguém escreve, e o ADR 0008 registra que instante sem dono é um campo
 *   que mente.
 * - **`createdAt`** — **é** o `readAt`: a linha nasce no ato de marcar, e dois
 *   nomes para o mesmo instante são a duplicação que a lição nº 3 do MVP 1
 *   proíbe.
 *
 * ## O que ele NÃO carrega, e é de propósito
 *
 * Nenhum contador e nenhum percentual: **progresso é calculado** a partir dos
 * logs, nunca guardado (`CLAUDE.md`, e a decisão fechada do MVP 3). Quem soma é
 * o `computeBookProgress` da Tarefa 31, e ele é **puro** — recebe plano + logs
 * e não conhece repositório.
 *
 * ## Visibilidade
 *
 * **Dentro do clube não existe conteúdo privado** (ADR 0002): quem leu é
 * visível para todo membro ativo. O que a autoria protege é a **escrita** do
 * registro — ninguém marca nem desmarca a leitura de outra pessoa, nem o
 * `OWNER` do clube, nem o super-admin.
 *
 * `clubId` e `bookId` são **deriváveis** de `planItem.bookId` → `book.clubId` e
 * mesmo assim ficam gravados: o `CLAUDE.md` manda que todo modelo de conteúdo
 * carregue `clubId`, sem ressalva de derivabilidade, e é o que faz "os logs
 * deste livro" (Tarefas 31 e 32) ser um índice, e não um join.
 */
export interface ReadingLog {
  id: string;
  clubId: string;
  bookId: string;
  userId: string; // o AUTOR. Sempre o ator; nunca vem do input.
  planItemId: string; // o dia do plano. NÃO é anulável: não há leitura avulsa.
  readAt: Date; // o instante em que marcou. É também o "nasceu em".
}
