import type {
  PushPayload,
  PushSender,
  PushSendResult,
} from '../ports/push-sender';

/** Uma chamada ao sender, guardada em cópia. */
export interface RecordedPush {
  userId: string;
  payload: PushPayload;
}

/**
 * ⚠️ **O FAKE DO ÚNICO PORT DE EFEITO EXTERNO DA FEATURE — e nesta fatia ele é
 * a ÚNICA implementação que existe.**
 *
 * `dispatchDueNotifications` é testado contra ele, e **nada sai da máquina**: a
 * implementação real (`web-push`) é a Tarefa 38, e o pacote não é dependência
 * de nenhum pacote deste monorepo. Quem vê push de verdade é o dono, pelo
 * roteiro do `docs/COMO-TESTAR.md`.
 *
 * ## O que ele guarda, e por quê
 *
 * - **`sends`** — a chamada inteira, em cópia: é o `findFilters` do §7.3
 *   aplicado a um efeito. O contador diz "mandou"; só o registro diz **para
 *   quem** e **o quê** — e a decisão I (o dispatcher monta o payload, o sender
 *   entrega) só é observável olhando o payload que chegou aqui.
 * - **`sendCalls`** — a CHAMADA, não o sucesso (§7.3). É o contador que prova a
 *   decisão E: com o claim recusando, ele tem de ficar em **zero**. "Não
 *   mandou" e "mandou e o aparelho não recebeu" dão o mesmo `sends` vazio se
 *   quem conta for o resultado.
 * - **`failFor` / `resultFor`** — o comportamento por pessoa, porque os dois
 *   caminhos que importam são por pessoa: o envio que **lança** (e não pode
 *   matar a passada do cron nem desfazer o claim) e o que volta com aparelho
 *   morto (`disabled`).
 */
export class PushSenderFake implements PushSender {
  sendCalls = 0;
  private readonly recorded: RecordedPush[] = [];
  private readonly failures = new Map<string, unknown>();
  private readonly results = new Map<string, PushSendResult>();

  /** O padrão: um aparelho, entregue. */
  private defaultResult: PushSendResult = { sent: 1, disabled: 0 };

  async send(userId: string, payload: PushPayload): Promise<PushSendResult> {
    this.sendCalls += 1;
    this.recorded.push({ userId, payload: { ...payload } });

    // `has`, e não `get(...) !== undefined`: com `unknown` no lugar de `Error`,
    // `undefined` passou a ser um valor lançável legítimo — e `!== undefined`
    // engoliria justamente esse caso, que é o mais fácil de chegar por engano
    // de um `catch` alheio.
    if (this.failures.has(userId)) throw this.failures.get(userId);

    return this.results.get(userId) ?? { ...this.defaultResult };
  }

  /** As chamadas, em cópia e na ordem em que aconteceram. */
  get sends(): RecordedPush[] {
    return this.recorded.map((send) => ({
      userId: send.userId,
      payload: { ...send.payload },
    }));
  }

  /** Quem recebeu, na ordem. O atalho mais usado nos testes do dispatcher. */
  get recipients(): string[] {
    return this.recorded.map((send) => send.userId);
  }

  /**
   * "O envio para esta pessoa LANÇA" — a rede caindo no meio da passada.
   *
   * ⚠️ **`unknown`, e não `Error` — §7.1, direção RESTRITIVA** (corrigido na
   * rodada de conserto da Tarefa 38). O tipo dizia `Error`, e a realidade
   * lança outra coisa: o `WebPushSender.send` guarda a falha em
   * `let failure: unknown` e **relança o que vier**, e os próprios testes de
   * `isDeadSubscription` enumeram string, `null` e objeto avulso. Um fake que
   * só aceita `Error` é o fake recusando o que o mundo faz — e o sintoma é o
   * clássico do §7.1: a suíte fica **verde**, porque o teste do caso legítimo
   * nunca chega a ser escrito.
   *
   * O que isso escondia, concretamente: o ramo `String(error)` do
   * `logWithoutContent` (`record-activity.ts`) — o que o log escreve quando o
   * que subiu **não** é um `Error` — não era alcançável pelo leque. Hoje é, e
   * o acusador é `logs a push failure that is not an Error at all…`.
   */
  failsFor(
    userId: string,
    error: unknown = new Error('push service is down'),
  ): void {
    this.failures.set(userId, error);
  }

  /** "O envio para esta pessoa volta assim" — aparelho morto, nenhum aparelho, etc. */
  answersFor(userId: string, result: PushSendResult): void {
    this.results.set(userId, result);
  }

  /** O resultado de quem não tem resposta própria. */
  answersByDefault(result: PushSendResult): void {
    this.defaultResult = result;
  }
}
