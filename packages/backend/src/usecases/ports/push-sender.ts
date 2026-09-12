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
 * ⚠️ **O PORT DE EFEITO EXTERNO DA FEATURE — e desde a Tarefa 38 ele tem DUAS
 * implementações.**
 *
 * - **`PushSenderFake`** (`usecases/_fakes/push-sender-fake.ts`) — contra quem
 *   tudo o que **decide** é testado: quem recebe (`NotifyGroupActivity`), o que
 *   a frase diz, se hoje já foi (o claim do dispatcher). Nada sai da máquina.
 * - **`WebPushSender`** (`notifications/web-push-sender.ts`) — o adaptador
 *   real, com `web-push`, `vapidDetails` e o tratamento de `WebPushError`
 *   404/410. Ele **entrega**, não decide, e é o **único** lugar do monorepo que
 *   importa `web-push` — dependência de `packages/backend` e só dele, porque
 *   `packages/shared` é empacotado no PWA.
 *
 * ⚠️ **Nem a implementação real precisa de rede para ser testada**: o cliente
 * `web-push` entra nela por construtor, com dublê nos testes. Quem vê push
 * chegando num celular é o **dono**, pelo roteiro do `docs/COMO-TESTAR.md` —
 * nenhum agente deste projeto manda push contra inscrição de verdade.
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
   * ## ⚠️ O CASO MISTO — DECIDIDO NA TAREFA 38: **desativa e RELANÇA**
   *
   * O caso é uma pessoa com dois aparelhos em que os dois problemas acontecem
   * na MESMA chamada: um morto (`WebPushError` 404/410, que a implementação
   * desativa com `disabledAt` por dentro) e outro estourando rede. A pergunta
   * era o que o chamador vê, e a resposta é: **a exceção** — com a desativação
   * já gravada.
   *
   * **A garantia, e ela é mais forte do que "acontece primeiro":** o
   * `WebPushSender` percorre **todos** os aparelhos, desativa **todos** os
   * mortos, guarda a primeira falha que não é aparelho morto e a relança **no
   * fim**. Não é detalhe de implementação: com o `throw` dentro do laço, a
   * desativação passava a depender da ORDEM em que o repositório devolvesse as
   * linhas — e este port, como todos, **não promete ordem** (§7.2). Foi o
   * mutante que o teste do caso misto pegou.
   *
   * **O que se perde, e é o preço escolhido:** a contagem `disabled` daquela
   * chamada. O chamador recebe exceção, não resultado, e não fica sabendo que
   * um aparelho saiu da lista — o efeito no banco aconteceu, o número que o
   * descreve não chegou a ninguém.
   *
   * **Por que não a saída (b)** (colecionar e devolver sem lançar): ela
   * preservaria o número ao custo de **apagar do chamador a diferença entre
   * "entregou a todos" e "um aparelho ficou sem"** — e quem chama precisa dessa
   * diferença (o dispatcher conta `sent` só quando alguém recebeu de verdade).
   * Um terceiro contador para separar as duas coisas seria mudança de contrato,
   * não detalhe de adaptador.
   *
   * O teste que sustenta isto é
   * `notifications/__tests__/web-push-sender.test.ts`, em
   * *"deactivates the dead one and STILL rethrows when both happen at once"*.
   */
  send(userId: string, payload: PushPayload): Promise<PushSendResult>;
}
