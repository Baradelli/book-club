import { PrismaClient } from '@prisma/client';
import cron from 'node-cron';

import { installReminderCron } from '../notifications/install-reminder-cron';
import { buildServer } from './server';

const port = Number(process.env['PORT'] ?? 3333);
// Dev: 0.0.0.0, para o celular na mesma rede alcançar a API. Produção:
// HOST=127.0.0.1 — só o nginx fala com ela (o servidor não tem firewall).
const host = process.env['HOST'] || '0.0.0.0';

/**
 * ⚠️ **O cliente do processo é UM SÓ, e o servidor e o cron o compartilham.**
 *
 * Dois `PrismaClient` no mesmo processo seriam dois pools contra o mesmo
 * Postgres. Em troca, o servidor deixa de ser o dono do cliente (o `onClose`
 * dele só desconecta o que ele mesmo abriu) — o que aqui não muda nada: este
 * processo não fecha o servidor, ele termina.
 */
const prisma = new PrismaClient();

/**
 * ⚠️⚠️ **O AGENDADOR DO LEMBRETE, ATRÁS DE `NOTIFICATIONS_CRON=on` (Tarefa
 * 38f) — a variante registrada do ADR 0006.**
 *
 * Esta é a **única** linha do projeto que amarra o `node-cron`, e é só ela:
 * toda a fiação (ler o ambiente, ler o VAPID, montar a passada, escolher
 * `schedule` e não `createTask`) mora no `installReminderCron`, que é testado —
 * a auditoria da 38f mediu que as três mutações plantadas aqui dentro passavam
 * com a suíte inteira verde, e a saída foi tirar a fiação daqui.
 *
 * ⚠️ **Com a chave ligada e VAPID configurado, isto manda push DE VERDADE** e
 * gasta o claim do dia de cada pessoa. Quem liga é o dono.
 */
installReminderCron({
  cron,
  prisma,
  log: (line) => {
    console.log(line);
  },
});

buildServer({ prisma })
  .then((app) => app.listen({ port, host }))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
