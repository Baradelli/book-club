/**
 * O que chega ao aparelho — e ele sai **pronto** do dispatcher (decisão I da
 * Tarefa 37).
 *
 * ⚠️ **O dispatcher decide, o sender entrega.** Se o sender montasse a frase, a
 * regra anti-culpa (§1 do plano) ficaria dentro do adaptador de rede, onde
 * nenhum teste de UseCase a alcança — e a guarda de vocabulário do catálogo
 * (§7.9) deixaria de cobrir o único texto do sistema que chega sem a pessoa
 * abrir a tela.
 *
 * Os quatro campos são exatamente os que o `push-handler.js` do
 * `docs/NOTIFICACOES.md` §2 lê: mais um campo aqui seria um campo que o
 * aparelho ignora.
 *
 * ⚠️ **O push NUNCA leva o conteúdo** (`NOTIFICACOES.md` §1): só o que ler, e
 * onde. A anotação se lê no app, autenticado — notificação aparece em tela
 * bloqueada.
 */
export interface PushPayload {
  /** O título da notificação. Vem do catálogo, no `locale` da pessoa. */
  title: string;
  /** O corpo: o trecho de hoje, e nada em volta. */
  body: string;
  /**
   * Agrupa notificações do mesmo tipo: uma nova **substitui** a anterior no
   * aparelho em vez de empilhar (§2). É o `kind` em minúsculas, o mesmo valor
   * que o §5 usa como `topic` do Web Push.
   */
  tag: string;
  /** Para onde o clique leva. O §2 é explícito: cair na tela errada não converte. */
  url: string;
}

/**
 * O que o envio devolve ao chamador, para ele logar
 * (`docs/NOTIFICACOES.md` §5).
 *
 * ⚠️ **Os dois são contadores de APARELHO, não de pessoa** — uma pessoa com
 * três aparelhos e um deles morto devolve `{ sent: 2, disabled: 1 }`. É por
 * isso que o `disabled` do `dispatchDueNotifications` não entra na conta de
 * pessoas: ele é a soma destes.
 */
export interface PushSendResult {
  /** Quantos aparelhos receberam. */
  sent: number;
  /**
   * Quantas inscrições foram **desativadas** nesta tentativa —
   * `WebPushError` 404/410, a pessoa desinstalou ou limpou o navegador. A
   * desativação é soft (`disabledAt`), e quem a faz é o sender.
   */
  disabled: number;
}

/**
 * ⚠️ **O PORT DE EFEITO EXTERNO DA FEATURE — e nesta fatia ele só tem FAKE.**
 *
 * A implementação real (`web-push`, `vapidDetails`, o tratamento de
 * `WebPushError` 404/410) é a **Tarefa 38**, e o pacote `web-push` **não é
 * dependência de nenhum pacote deste monorepo**. É escolha de segurança, não de
 * escopo: a fatia que decide sozinha mandar mensagem para o celular de alguém é
 * testada contra um fake, e quem vê push de verdade é o dono, pelo roteiro do
 * `docs/COMO-TESTAR.md`.
 *
 * Se alguém sentir falta do pacote ao mexer aqui, escorregou para a 38.
 */
export interface PushSender {
  /**
   * Manda o payload para **todos os aparelhos ativos** da pessoa.
   *
   * Quem carrega as inscrições é a implementação, via
   * `PushSubscriptionRepository.byUserId` (que já filtra `disabledAt IS NULL` —
   * `NOTIFICACOES.md` §5), e não o chamador: deixar o filtro para quem chama
   * seria a mesma classe do `status: 'ACTIVE'` que o `listNotes` manda ao port,
   * e um chamador que esquecesse mandaria push para um aparelho que pediu para
   * não receber mais.
   *
   * ⚠️ **Pode LANÇAR**, e o chamador tem de aguentar: uma falha de rede não
   * pode matar a passada do cron inteira — a pessoa seguinte da fila não tem
   * nada com o roteador de quem veio antes. E, por decisão E, um envio que
   * falha **não desfaz** o claim: o lembrete daquele dia está gasto, e isso é
   * deliberado — o erro caro deste app é repetir, não perder.
   *
   * ## ⚠️ PERGUNTA EM ABERTO PARA A TAREFA 38 — o CASO MISTO
   *
   * **Isto é ambiguidade registrada, NÃO propriedade garantida hoje** (§7.10:
   * não prometa o que o teste não sustenta). Nenhum teste desta fatia decide o
   * que segue, porque o fake nunca chega lá: através deste port só existem duas
   * condutas observáveis — devolver `{ sent, disabled }` ou **lançar**.
   *
   * O caso que o contrato **não** responde é uma pessoa com dois aparelhos em
   * que os dois problemas acontecem na MESMA chamada: um morto
   * (`WebPushError` 404/410, que a implementação desativa com `disabledAt` por
   * dentro) e outro estourando rede. O real pode ter **desativado uma inscrição
   * e ainda assim lançar** — e nesse caminho a contagem `disabled` **se perde**:
   * o chamador recebe exceção, não resultado, e nunca fica sabendo que um
   * aparelho saiu da lista. O efeito no banco aconteceu; o número que o
   * descreve, não.
   *
   * A Tarefa 38 tem de **decidir**, e as duas saídas são legítimas:
   *
   * - **(a) desativar e relançar** — o `disabledAt` já está gravado, o erro de
   *   rede sobe, e a contagem daquela passada se perde. Mais simples, e o log
   *   do script fica mudo sobre a desativação.
   * - **(b) colecionar as falhas e devolver a contagem sem lançar** — o
   *   `{ sent, disabled }` sai completo e o erro de rede vira, no máximo, um
   *   log de dentro do sender. Preserva o número, mas apaga do chamador a
   *   diferença entre "entregou a todos" e "um aparelho ficou sem".
   *
   * Quem decidir escreve a escolha aqui e o teste que a sustenta lá — e, se for
   * (b), o `PushSendResult` provavelmente precisa de um terceiro contador, o
   * que é mudança de contrato, não detalhe de adaptador.
   */
  send(userId: string, payload: PushPayload): Promise<PushSendResult>;
}
