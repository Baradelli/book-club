import type { ActivityType } from '@clube/shared';
import { ACTIVITY_TYPES, isActivityType } from '@clube/shared';

/**
 * "A Maria escreveu sobre o Cap. 3": o registro de que alguém do clube **leu,
 * escreveu ou grifou**.
 *
 * É o que faz o clube ver o clube. O `CLAUDE.md` diz a regra do produto inteira
 * numa frase: *"Quando alguém marca que leu, ou escreve uma nota ou um grifo, o
 * clube recebe uma notificação — um incentiva o outro."* Esta entidade é o
 * registro desse acontecimento; o feed (Tarefa 35) e o push `GROUP_ACTIVITY`
 * (Tarefa 38) são dois leitores dele.
 *
 * ## Ele guarda REFERÊNCIA, nunca conteúdo
 *
 * `subjectId` + `bookId` + `planItemId?`, e mais nada. Copiar o trecho da nota
 * para dentro do evento duplicaria conteúdo do clube numa segunda tabela — e
 * **o push nunca leva o conteúdo** (`docs/NOTIFICACOES.md` §1; o ADR 0006
 * decide só de onde o `GROUP_ACTIVITY` sai, não o que ele carrega). Quem
 * precisa do texto o lê da `Note`/`Highlight`, autenticado.
 *
 * Pelo mesmo motivo **nada é denormalizado aqui**: nem o título do dia, nem o
 * nome do livro, nem o nome de quem fez. O título do dia muda (`editBook`
 * ressincroniza até o título da nota), e um evento com título velho é uma tela
 * que mente. O feed resolve na leitura.
 *
 * ## Ele é log IMUTÁVEL, como o `ReadingLog`
 *
 * Não se arquiva e não se edita (`CLAUDE.md`). Daí a lista de campos que **não**
 * existem, e cada ausência é decisão:
 *
 * - **`status` / `archivedAt`** — nada arquiva um evento. Não há a exceção do
 *   `ReadingLog` (lá desmarcar apaga a linha): aqui **nem apagar existe**, e é
 *   de propósito — desmarcar "li" é um não-evento, e um feed que apagasse o
 *   passado contaria outra história (decisão B).
 * - **`updatedAt`** — nenhum caminho reescreve a linha, e o ADR 0008 registra
 *   que instante sem dono é um campo que mente.
 *
 * ## `planItemId` é ANULÁVEL, e é o produto que decide
 *
 * A anotação avulsa e o grifo **não têm dia de leitura** — é a diferença que
 * salta aos olhos em relação ao `ReadingLog`, onde o campo é obrigatório porque
 * não existe leitura avulsa. O `PLAN_NOTE` e o `READ` o preenchem; o
 * `FREE_NOTE` e o `HIGHLIGHT` gravam `null`.
 *
 * ## Visibilidade
 *
 * **Dentro do clube não existe conteúdo privado** (ADR 0002), e o evento **não
 * cria visibilidade nova**: ele aponta para o que todo membro ativo já podia
 * ver. O `clubId` é o recorte do feed; o `userId` é o ator, e vem sempre do JWT
 * — nunca do input.
 */
export interface ActivityEvent {
  id: string;
  clubId: string;
  userId: string; // o ATOR. Sempre o ator; nunca vem do input.
  type: ActivityType; // um dos quatro nascimentos de `@clube/shared`
  bookId: string;
  planItemId: string | null; // o dia do plano, quando há — avulsa e grifo não têm
  subjectId: string; // o id da nota / do grifo / do log
  createdAt: Date; // o instante em que aconteceu. É o único.
}

/**
 * O portão do tipo: um dos quatro nascimentos, e nada mais.
 *
 * Recebe `unknown` pelo mesmo motivo do `assertHighlightColor`: o `z.enum` da
 * borda (Tarefa 34) é a primeira barreira, **não a única**. Aqui a diferença é
 * quem está do outro lado — o valor não vem de corpo de request, vem do código
 * que dispara o gatilho —, então um tipo fora da lista é **erro de
 * programação**, e é por isso que ele sai como `Error` cru em vez de ganhar
 * classe de domínio: nenhum cliente consegue provocá-lo, e uma classe nova aqui
 * daria a ele um status HTTP que sugere que alguém de fora poderia.
 *
 * ⚠️ **E a frase honesta sobre o que acontece com esse `Error`: nos quatro
 * chamadores reais, NADA chega à borda.** Todos passam pelo
 * `recordActivitySafely`, que captura e loga — a decisão C vale para o portão
 * como vale para o banco: um tipo errado não pode derrubar a nota da pessoa.
 * O único caminho que veria um 500 é chamar `RecordActivity.execute` direto, o
 * que só os testes fazem. A prova de que a recusa acontece **antes de
 * escrever** é `record-activity.test.ts`, no
 * `refuses a type that is not one of the four, before writing anything`.
 *
 * A mensagem lista os tipos aceitos e **não** ecoa o valor recusado: `value` é
 * `unknown`, e ecoar o que chegou é como um payload inteiro volta numa
 * mensagem.
 */
export function assertActivityType(value: unknown): ActivityType {
  if (!isActivityType(value)) {
    throw new Error(
      `activity type must be one of ${ACTIVITY_TYPES.join(', ')}`,
    );
  }
  return value;
}
