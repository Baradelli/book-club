import type { PushSubscriptionRepository } from './ports/push-subscription-repository';

export interface DisablePushSubscriptionInput {
  /**
   * Quem desliga, e é sempre a PRÓPRIA inscrição dele.
   *
   * ⚠️ **NÃO existe `userId` aqui, e é a regra 12.** O mutante perigoso do §7.5
   * é o do **fallback** — `input.userId ?? input.actorUserId` —, que se comporta
   * normalmente em todo teste que não manda o campo. O teste que o acusa manda
   * o campo **com o ator legítimo** e asserta que a inscrição da outra pessoa
   * **continua ativa**.
   */
  actorUserId: string;
  /**
   * O endpoint do aparelho — **a identidade da inscrição no protocolo**
   * (decisão E).
   *
   * ⚠️ **NÃO existe `subscriptionId` aqui, e é a decisão E da Tarefa 30
   * aplicada.** O recurso não tem endereço próprio na API: a identidade é o par
   * `(endpoint, pessoa)`, e é por isso que a busca abaixo é pelo par. A
   * alternativa — receber id e conferir `subscription.userId === ator` com um
   * erro de autoria — é a forma da nota e do grifo, e ela é certa **lá**, porque
   * lá o recurso tem endereço próprio. Aqui seria um guard de autoria sobre uma
   * busca que já é por dono: uma regra a manter em dia sem nada a guardar.
   */
  endpoint: string;
}

/**
 * "Não quero mais push neste aparelho": a pessoa desliga **a própria**
 * inscrição.
 *
 * ⚠️ **É DESATIVAÇÃO SOFT** (`disabledAt`), e não hard delete — o oposto do
 * `unmarkRead`. A diferença não é estilo: o `ReadingLog` **afirma um fato** ("eu
 * li"), e desmarcá-lo é dizer que o fato não aconteceu; a inscrição é um
 * **canal** ("mande para cá"), e um canal se desliga. A inscrição que volta é o
 * caso comum, e um hard delete perderia `createdAt` e `userAgent` a cada
 * vaivém. → `docs/NOTIFICACOES.md` §4.
 *
 * ⚠️ **É IDEMPOTENTE: não haver o que desligar NÃO é erro** — a decisão C da
 * Tarefa 30 outra vez. Lançar obrigaria a tela a distinguir "desliguei" de "já
 * estava desligado", que é a mesma coisa para quem olha, e criaria uma classe
 * de erro nova só para isso (a regra 18 pede o contrário).
 *
 * ⚠️ **NÃO HÁ `assertMembership`** (decisão F): a inscrição não tem `clubId` e
 * não é conteúdo de clube. O corte é o JWT, e ele é **estrutural** — ver o
 * `endpoint` no input.
 *
 * **Nada de `ActivityEvent`**: desligar push não é notícia para ninguém, e
 * registrar "a Maria desligou" é vocabulário de cobrança — o mesmo motivo pelo
 * qual desmarcar "li" é um não-evento (decisão B da Tarefa 33).
 */
export class DisablePushSubscription {
  constructor(private readonly subscriptions: PushSubscriptionRepository) {}

  async execute(input: DisablePushSubscriptionInput): Promise<void> {
    /*
      ⚠️ **A BUSCA É PELO PAR `(endpoint, actorUserId)`, e é ela que faz a regra
      12 ser ESTRUTURAL:** a inscrição do Marcos não aparece para a Maria, então
      não há linha alheia ao alcance do `update` abaixo. Nenhum `if` de autoria,
      porque não há nada que ele pudesse recusar.
    */
    const existing = await this.subscriptions.byEndpointAndUser(
      input.endpoint,
      input.actorUserId,
    );

    /*
      ⚠️ **O retorno antecipado é METADE da idempotência, e é a metade que SÓ O
      CONTADOR VÊ** (§7.3). Sem ele, o `update` rodaria com um id inexistente e
      levantaria `P2025` — que o `handle-domain-error.ts` **não mapeia**, ou
      seja **500** para quem desligou duas vezes, ou para quem mandou um
      endpoint que não é dele. É o mesmo desenho do `unmarkRead`, com uma
      diferença: lá o `delete` do port é idempotente por si (`deleteMany`), e
      aqui o `update` do Prisma **não** é — então este `if` não é economia, é a
      regra.
    */
    if (!existing) return;

    /*
      Já desligada? Grava o instante de novo, e é de propósito: "desligou às 10h
      e insistiu às 11h" é uma informação honesta, e um `if (existing.disabledAt)
      return` aqui trocaria uma escrita barata por um segundo caminho a testar.
      A regra 11 pede idempotência de EFEITO ("desligar duas vezes é
      inofensivo"), não ausência de escrita.
    */
    await this.subscriptions.update(existing.id, { disabledAt: new Date() });
  }
}
