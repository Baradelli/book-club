import type { ActivityEvent } from '../domain/activity-event';
import type { ActivityEventRepository } from '../usecases/ports/activity-event-repository';

/**
 * ⚠️ **ESTE ARQUIVO É TEMPORÁRIO: a Tarefa 34 o APAGA.**
 *
 * A Tarefa 33 entrega o domínio do `ActivityEvent`, o port, o `recordActivity`
 * e o gatilho nos quatro UseCases de nascimento. Ela **não muda o modelo** — o
 * `model ActivityEvent` do Prisma, a migration e o repositório real são a
 * Tarefa 34. Só que os quatro UseCases já têm rota, e a rota precisa de algo
 * que satisfaça o port **hoje**, senão o `typecheck` fica vermelho em três
 * arquivos de rota (a forma do `docs/CONVENCOES-CODIGO.md` §6.9, pela porta da
 * frente: sem implementação, quem instancia o UseCase não compila).
 *
 * As três saídas possíveis, e por que esta:
 *
 * 1. **Migration agora** — proibida pela fatia, e com razão: o modelo é da 34,
 *    onde ele nasce junto do `find`, do repositório e do teste de contrato.
 * 2. **Dependência opcional nos quatro UseCases** (`recordActivity?`) — deixa
 *    as rotas intocadas e o gatilho desligado, mas põe um `if` em quatro
 *    lugares para um estado que dura uma fatia, e deixa os quatro UseCases
 *    fora da forma final: a 34 teria de reabrir os quatro em vez de trocar uma
 *    linha de fiação.
 * 3. **Esta**: a dependência é obrigatória, os quatro UseCases já estão na
 *    forma final, e o que falta é **uma linha** em `buildRepositories`.
 *
 * **Ela LANÇA, e é de propósito — silêncio seria o erro.** A decisão C da
 * fatia diz que falhar registrando não pode derrubar a escrita da pessoa,
 * **e** que engolir em silêncio também é errado: o `recordActivitySafely`
 * captura e loga `activity_event_not_recorded`. Então, até a 34, cada
 * nascimento deixa uma linha de log dizendo exatamente o que falta — em vez de
 * um `save` que devolve sucesso e joga o evento fora, que é a única versão
 * disto que ninguém descobre.
 *
 * **O que NÃO acontece por causa dela:** nada do que a pessoa escreveu se
 * perde. A nota é gravada antes, a resposta continua 201/200, e o teste que
 * prova isso existe nos quatro UseCases (`survives a recorder that throws`).
 */
export class PendingActivityEventRepository implements ActivityEventRepository {
  // Sem parâmetro de propósito: não há o que fazer com o evento, e um
  // parâmetro que ninguém lê é ruído (o TypeScript aceita a assinatura mais
  // curta ao implementar a interface).
  save(): Promise<ActivityEvent> {
    return Promise.reject(
      new Error(
        'ActivityEvent persistence is not wired yet — the Prisma model, the migration and the repository are Tarefa 34',
      ),
    );
  }
}
