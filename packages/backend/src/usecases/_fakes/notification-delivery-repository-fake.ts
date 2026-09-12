import type { NotificationDelivery } from '../../domain/notification-delivery';
import { assertNotificationKind } from '../../domain/notification-delivery';
import type { NotificationDeliveryRepository } from '../ports/notification-delivery-repository';

/**
 * ⚠️ **ELE RECUSA O SEGUNDO CLAIM IGUAL — e é a regra 12 da Tarefa 37.**
 *
 * Um fake mais permissivo que o banco faria **todo** teste de idempotência do
 * dispatcher passar por acidente: o segundo `claim` devolveria `true`, o
 * segundo lembrete sairia, e o teste que diz provar "não manda duas vezes"
 * estaria provando "o fake deixa". Quem prova que o `ON CONFLICT` existe de
 * verdade é o teste de contrato contra o Postgres — inclusive com dois claims
 * **concorrentes** (regra 13) —, mas o fake não pode ser o elo frouxo.
 *
 * A chave emulada é a do índice: **os TRÊS campos**
 * (`@@unique([userId, kind, localDate])`). Recusar por menos que isso calaria
 * lembrete legítimo em silêncio — por `userId` só, o `GROUP_ACTIVITY` de quem
 * já recebeu o lembrete; por `(userId, kind)`, o lembrete de amanhã. É a
 * direção restritiva do §7.1, a que esconde melhor porque a suíte fica verde.
 *
 * E a comparação é **byte a byte**, como o `=` de texto do Postgres: nada de
 * normalizar data, aparar espaço ou dobrar caixa.
 */

/**
 * O separador da chave emulada, e ele não pode aparecer em **nenhum** dos três
 * campos: com um separador comum (`|`, `:`, `-`), dois trios diferentes
 * poderiam colidir na string e o fake recusaria um claim legítimo — a direção
 * restritiva do §7.1 outra vez, a que esconde melhor porque a suíte fica verde.
 *
 * `U+0000` é impossível num `randomUUID()`, num `NotificationKind` e num
 * `CalendarDay`.
 */
const KEY_SEPARATOR = '\u0000';

export class NotificationDeliveryRepositoryFake implements NotificationDeliveryRepository {
  private store = new Map<string, NotificationDelivery>();

  /**
   * Contador de CHAMADA, nunca cronômetro (§7.3) — e ele conta a **tentativa**,
   * não o sucesso.
   *
   * É o que prova a decisão E ("o claim vem antes do envio") por contagem: a
   * recusa também foi uma chamada, e sem este contador "não pediu reserva" e
   * "pediu e perdeu" dariam o mesmo `claimed`.
   */
  claimCalls = 0;

  async claim(delivery: NotificationDelivery): Promise<boolean> {
    this.claimCalls += 1;

    /**
     * ⚠️ **O MESMO PORTÃO QUE O PRISMA ATRAVESSA ANTES DO INSERT — e sem ele o
     * fake é a direção PERMISSIVA do §7.1: aceita o que o banco recusa.**
     *
     * O `PrismaNotificationDeliveryRepository.claim` roda
     * `assertNotificationKind` antes do `INSERT … ON CONFLICT` justamente
     * porque a coluna é `String` (decisão G) e o banco engoliria qualquer
     * texto. Um fake que não valida deixa o teste de UseCase provar que um
     * `kind` torto "funciona" — e um `kind` torto gravado é uma reserva que
     * **nunca colide com nada**, ou seja, um lembrete que sai todo dia.
     *
     * Alcançabilidade hoje é baixa (`kind` é tipado e quem o escreve é o
     * dispatcher), e é exatamente por isso que o portão fica travado por teste:
     * o dia em que houver um segundo escritor, o fake e o banco têm de recusar
     * o mesmo valor.
     *
     * ⚠️ **Depois do contador, e de propósito:** `claimCalls` conta a CHAMADA
     * (§7.3), e uma chamada que estourou foi uma chamada. Antes do `store`, e
     * também de propósito: o contrato é `refuses a kind outside the vocabulary,
     * and writes nothing`.
     */
    const kind = assertNotificationKind(delivery.kind);

    const key = this.keyOf({ ...delivery, kind });
    if (this.store.has(key)) return false;

    this.store.set(key, this.clone(delivery));
    return true;
  }

  /** As reservas concedidas, em cópia. */
  get claimed(): NotificationDelivery[] {
    return [...this.store.values()].map((delivery) => this.clone(delivery));
  }

  /**
   * A chave do `@@unique([userId, kind, localDate])`.
   *
   * ⚠️ **O separador é ESCRITO COMO ESCAPE (`'\u0000'`), nunca cru — e isso é
   * uma correção desta fatia, não zelo.** A primeira versão deste arquivo tinha
   * o byte NUL **literal** no código: funcionava, passava no `lint`, no
   * `prettier` e nos testes, e era **invisível** — o `grep` passou a tratar o
   * arquivo como BINÁRIO (`file` respondia `data`), e nenhuma revisão por
   * leitura veria o caractere. Caractere de controle cru numa fonte é a classe
   * de coisa que sobrevive a toda revisão porque ninguém consegue vê-la.
   */
  private keyOf(delivery: NotificationDelivery): string {
    return [delivery.userId, delivery.kind, delivery.localDate].join(
      KEY_SEPARATOR,
    );
  }

  private clone(delivery: NotificationDelivery): NotificationDelivery {
    return { ...delivery, deliveredAt: new Date(delivery.deliveredAt) };
  }
}
