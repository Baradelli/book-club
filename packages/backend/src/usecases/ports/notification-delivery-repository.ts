import type { NotificationDelivery } from '../../domain/notification-delivery';

/**
 * O port da RESERVA do aviso do dia: **um método só, e ele se chama `claim`**.
 *
 * ⚠️ **Nasce com a implementação Prisma NA MESMA UNIDADE**, como o
 * `docs/CONVENCOES-CODIGO.md` §6.9 exige: criar um port sem implementar no
 * repositório real dá `TS2420` na classe e `TS2345` em todo arquivo que passa a
 * instância a um UseCase — 16 erros em 9 arquivos na medição da Tarefa 26a —, e
 * um vermelho de compilação em arquivo alheio esconde exatamente o vermelho de
 * teste que a unidade deveria mostrar.
 *
 * ## ⚠️ Por que NÃO há `save`, `byId`, `find` nem `delete`
 *
 * O vocabulário uniforme do `CLAUDE.md` (`save` · `byId` · `update` · `find` ·
 * `delete`) é a forma de um repositório de **conteúdo**. Esta tabela não guarda
 * conteúdo: ela guarda uma **reserva**, e a única pergunta que alguém lhe faz é
 * *"consigo o aviso de hoje?"* — que é escrita e leitura no mesmo ato, porque
 * separar as duas é exatamente o bug que a tabela existe para matar (duas
 * instâncias leem "não enviei ainda" e as duas enviam).
 *
 * Nada lê a linha depois: o `NOTIFICACOES.md` §6 diz *"Nada retornado = já foi
 * enviado hoje → `skipped++`"*, e o dispatcher não faz mais nenhuma pergunta a
 * ela. Um `find` aqui seria forma sem chamador — a especulação que o
 * `docs/WORKFLOW.md` proíbe —, e um `delete` transformaria a idempotência em
 * algo desfazível, que é o oposto do ponto.
 */
export interface NotificationDeliveryRepository {
  /**
   * ⚠️ **A RESERVA DO DIA — `INSERT … ON CONFLICT DO NOTHING`, e é a ÚNICA
   * exceção de SQL explícito da feature** (`NOTIFICACOES.md` §6, regra 11).
   *
   * Ela vive **dentro do repositório**: não na rota, não no scheduler, não num
   * `$queryRaw` solto. O alvo do conflito é o
   * `@@unique([userId, kind, localDate])`.
   *
   * Devolve **se conseguiu** — `true`/`false`, nunca a linha (regra 11). Quem
   * chama não precisa da linha: `false` já significa "alguém (ou eu mesmo, na
   * passada anterior) já reservou o aviso de hoje", e é isso que vira
   * `skipped++`.
   *
   * ⚠️ **Ele recebe a ENTIDADE inteira, e NÃO `(userId, kind, localDate)` como o
   * `NOTIFICACOES.md` §6 escreve. A divergência é deliberada e tem medição.**
   *
   * Com a assinatura de três argumentos, o `id` e o `deliveredAt` teriam de
   * nascer **dentro do repositório** — e as duas coisas quebram regra do
   * projeto:
   *
   * 1. **o `id`**: o `CLAUDE.md` diz que quem gera id com `randomUUID()` é o
   *    **UseCase**. Nenhum dos onze repositórios deste projeto inventa
   *    identidade;
   * 2. ⚠️ **o `deliveredAt`**: um `new Date()` aqui dentro seria uma **SEGUNDA
   *    leitura de relógio** na mesma passada — exatamente o que a regra 2 da
   *    Tarefa 37 e o ADR 0008 proíbem, e o que o teste
   *    `reads the clock exactly ONCE` do dispatcher acusa contando leituras.
   *    Com duas leituras, alguém perto da virada da janela entra pela primeira
   *    e sai pela segunda.
   *
   * Passar a entidade mantém o dono do id e o dono do instante onde eles já
   * moram — no UseCase —, e deixa este port com a mesma forma do `save` dos
   * outros (recebe a linha pronta). O nome continua `claim`, porque o que ele
   * faz não é salvar: é **reservar**, e pode falhar sem ser erro.
   */
  claim(delivery: NotificationDelivery): Promise<boolean>;
}
