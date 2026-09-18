/**
 * ⚠️⚠️ **O AGENDADOR DO LEMBRETE DENTRO DO PROCESSO DO FASTIFY — A VARIANTE
 * REGISTRADA DO ADR 0006, ATRÁS DE UMA CHAVE DE AMBIENTE (Tarefa 38f).**
 *
 * O ADR 0006 decidiu *"não existe cron dentro do processo do Fastify"* e listou
 * `node-cron` entre as alternativas **recusadas**, com três argumentos. Relidos
 * contra o que a Tarefa 37 entregou de fato:
 *
 * | argumento original | estado |
 * | --- | --- |
 * | *"o agendamento morre com o processo"* | continua valendo, e foi **aceito conscientemente** |
 * | *"com duas instâncias, todo mundo recebe duas notificações"* | caiu — o claim no banco (`ON CONFLICT DO NOTHING`) torna impossível |
 * | *"a idempotência ficaria na memória do processo"* | caiu pelo mesmo motivo |
 *
 * ⚠️ **Por isso isto é uma VARIANTE, não uma emenda ao ADR.** O próprio ADR
 * abre o precedente (*"um serviço externo de agendamento … fica registrado como
 * variante de deploy, não como arquitetura diferente"*), e o que mantém esta
 * sendo variante é a **chave de ambiente**: num deploy com duas instâncias ela
 * fica desligada e o cron externo assume, **sem tocar uma linha de código**.
 *
 * ## O que este módulo NÃO conhece
 *
 * Nem `node-cron`, nem Prisma, nem VAPID, nem o dispatcher. Ele recebe um
 * `schedule` (dois argumentos: expressão e callback — o tipo é o que torna a
 * decisão C irrepresentável aqui), um `runPass` e um `log`. Quem amarra o
 * `node-cron` de verdade é o `http/main.ts`, que é composição, como o
 * `dispatch-main.ts` faz com o script.
 *
 * É isso que deixa o agendamento **decidível sem relógio real** (§7.3: contador,
 * nunca cronômetro) e sem subir servidor — e subir servidor com esta chave
 * ligada manda push de verdade no aparelho do dono.
 */

/**
 * ⚠️ **DECISÃO B — de cinco em cinco minutos.** É metade da janela de tolerância
 * (`DEFAULT_WINDOW_MINUTES = 10`): uma passada perdida (deploy, máquina
 * ocupada) ainda tem a seguinte **dentro** da janela, e o claim no banco é quem
 * garante que passar duas vezes não manda duas.
 *
 * ⚠️ **DECISÃO C — sem `timezone`, de propósito.** Esta expressão é "todo minuto
 * múltiplo de 5, de toda hora": ela casa os **mesmos instantes** com qualquer
 * fuso, porque todo deslocamento real de fuso é múltiplo de 15 minutos (medido
 * no teste, contra `Asia/Kathmandu`, UTC+05:45). Passar `timezone` não mudaria
 * nada e faria o próximo leitor achar que o fuso do lembrete se decide aqui —
 * ele se decide no `Settings.timezone` de cada pessoa, com Luxon, dentro do
 * `scheduler.ts`.
 */
export const REMINDER_CRON_EXPRESSION = '*/5 * * * *';

/**
 * ⚠️ **DECISÃO A — só este valor liga.** Qualquer outro, e a ausência, deixam
 * desligado, que é o padrão **seguro**: quem sobe uma segunda instância sem ler
 * nada não passa a mandar push duplicado.
 *
 * A comparação é de **igualdade**, nunca `Boolean(env.NOTIFICATIONS_CRON)` —
 * com ele a string `'off'` ligaria o cron, porque toda string não vazia é
 * verdadeira.
 */
export const REMINDER_CRON_ON = 'on';

/**
 * O agendador, reduzido a dois argumentos.
 *
 * ⚠️ **A ausência do terceiro é a decisão C escrita no TIPO**: não há onde pôr
 * um `timezone` sem alguém mudar esta linha — e mudar esta linha é a conversa
 * que a decisão C quer que aconteça.
 */
export type ReminderCronSchedule = (
  expression: string,
  callback: () => void,
) => void;

export interface StartReminderCronOptions {
  /** O ambiente do processo. Só esta chave importa. */
  env: { NOTIFICATIONS_CRON?: string | undefined };
  /**
   * ⚠️ **Só para a linha de boot (decisão F).** O agendamento acontece de
   * qualquer jeito: o dispatcher já devolve `vapid-not-configured` **sem abrir
   * o banco**, e um segundo portão aqui dobraria os caminhos de configuração a
   * testar para não ganhar nada.
   */
  vapidConfigured: boolean;
  schedule: ReminderCronSchedule;
  /** Uma passada do dispatcher. O que ela devolve não interessa a este módulo. */
  runPass: () => Promise<unknown>;
  /** A saída que o dono lê no terminal. */
  log: (line: string) => void;
}

const PREFIX = '[notifications]';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Liga (ou não) o agendamento do lembrete. Devolve **se agendou** — é o que o
 * chamador precisa saber, e é a única resposta que o teste precisa observar
 * junto com as chamadas ao `schedule`.
 *
 * ⚠️ **DECISÃO D — o callback NUNCA deixa uma rejeição escapar.** Um `await`
 * solto num callback de cron vira *unhandled rejection*, e o Node 15+ **derruba
 * o processo por padrão**: o lembrete levaria a API junto, e uma noite de banco
 * instável derrubaria o app. Falha de uma passada é **logada**, e a próxima
 * acontece.
 *
 * ⚠️ **DECISÃO E — uma passada por vez.** Se uma passada demorar mais que o
 * intervalo, o agendador dispara a seguinte **em paralelo**. O claim no banco
 * impede notificação duplicada, mas duas passadas concorrentes são trabalho
 * jogado fora e log ilegível. (O `node-cron` 4 tem um `noOverlap` próprio; a
 * guarda mora **aqui** porque é aqui que ela é decidível sem o agendador de
 * verdade — e porque o port de agendamento tem dois argumentos, decisão C.)
 */
export function startReminderCron(options: StartReminderCronOptions): boolean {
  if (options.env.NOTIFICATIONS_CRON !== REMINDER_CRON_ON) {
    options.log(
      `${PREFIX} reminder cron is OFF (NOTIFICATIONS_CRON is not "${REMINDER_CRON_ON}"): ` +
        `the reminder only goes out when something external runs notifications:dispatch`,
    );
    return false;
  }

  /** ⚠️ O estado da decisão E. Ele vive no processo, e é tudo o que precisa: quem impede push duplicado é o claim no banco. */
  let passInFlight = false;

  options.schedule(REMINDER_CRON_EXPRESSION, () => {
    if (passInFlight) {
      options.log(
        `${PREFIX} reminder cron tick ignored: the previous pass is still running`,
      );
      return;
    }
    passInFlight = true;

    // A função assíncrona envolve a chamada inteira: ela pega tanto a rejeição
    // quanto um `throw` síncrono do `runPass`, e o `finally` devolve a vez
    // mesmo quando a passada falha — senão uma única falha desligaria o cron
    // para sempre, e ninguém veria.
    void (async () => {
      try {
        await options.runPass();
      } catch (error: unknown) {
        options.log(`${PREFIX} reminder cron pass failed: ${messageOf(error)}`);
      } finally {
        passInFlight = false;
      }
    })();
  });

  options.log(
    `${PREFIX} reminder cron is ON (${REMINDER_CRON_EXPRESSION}), ` +
      (options.vapidConfigured
        ? 'VAPID configured'
        : 'but VAPID is NOT configured: every pass will stop at vapid-not-configured'),
  );
  return true;
}
