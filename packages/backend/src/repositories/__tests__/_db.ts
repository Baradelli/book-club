import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

// O banco de teste é o MESMO banco de desenvolvimento (docs/SETUP.md §2), então
// NENHUMA limpeza aqui pode ser `deleteMany({})` numa tabela inteira: cada
// arquivo apaga só os ids que ele mesmo criou.
export const prisma = new PrismaClient();

export const TEST_ADMIN_ID = `t03-admin-${randomUUID()}`;

// Ids únicos por execução: uma execução interrompida não deixa fixture no
// caminho da próxima. O `tag` marca a fatia que criou o fixture, para dar
// para achar (e apagar) sobra de uma execução interrompida.
export function prefixedId(tag: string, prefix: string): string {
  return `${tag}-${prefix}-${randomUUID()}`;
}

export function prefixedEmail(tag: string, prefix: string): string {
  return `${tag}-${prefix}-${randomUUID()}@exemplo.test`;
}

export function testId(prefix: string): string {
  return prefixedId('t03', prefix);
}

export function testEmail(prefix: string): string {
  return prefixedEmail('t03', prefix);
}

/** Cria (ou reaproveita) o usuário dono dos fixtures do arquivo. */
export async function setupTestUser(
  id: string = TEST_ADMIN_ID,
  email: string = testEmail('admin'),
): Promise<string> {
  await prisma.user.upsert({
    where: { id },
    create: { id, email, name: 'Fixture Admin', isSuperAdmin: false },
    update: {},
  });
  return id;
}

export interface Fixtures {
  pushSubscriptionIds?: string[];
  settingsIds?: string[];
  inviteIds?: string[];
  membershipIds?: string[];
  activityEventIds?: string[];
  highlightIds?: string[];
  readingLogIds?: string[];
  noteIds?: string[];
  planItemIds?: string[];
  bookIds?: string[];
  clubIds?: string[];
  userIds?: string[];
}

/**
 * Apaga só os fixtures informados, na ordem que respeita as foreign keys.
 * Sempre por `id in [...]` — nunca a tabela inteira.
 */
export async function removeFixtures(fixtures: Fixtures): Promise<void> {
  const {
    pushSubscriptionIds = [],
    settingsIds = [],
    inviteIds = [],
    membershipIds = [],
    activityEventIds = [],
    highlightIds = [],
    readingLogIds = [],
    noteIds = [],
    planItemIds = [],
    bookIds = [],
    clubIds = [],
    userIds = [],
  } = fixtures;

  // ⚠️ **A INSCRIÇÃO DE PUSH SAI ANTES DO USUÁRIO — e ela também se apaga POR
  // ÂNCORA, não só por id** (Tarefa 36).
  //
  // `PushSubscription_userId_fkey` é `ON DELETE RESTRICT`, e a inscrição **não
  // é criada por id conhecido** no caminho que importa: o
  // `notification-routes.integration.test.ts` a cria pela ROTA, e o id sai de
  // um `randomUUID()` dentro do UseCase que nenhum teste vê.
  //
  // É exatamente a forma que a Tarefa 34 aprendeu com o `ActivityEvent`: uma FK
  // nova quebrou o `afterAll` de QUATRO arquivos de integração que já existiam,
  // **com os testes verdes** — a limpeza estourando em
  // `Foreign key constraint violated` e fixture vazando no banco de
  // desenvolvimento do dono. A saída é a mesma, e num lugar só: o `OR` cobre
  // apenas os `userIds` que o CHAMADOR já declarou como seus, então nada de
  // outra pessoa é tocado e **não existe `deleteMany({})`** — com a lista vazia,
  // o bloco inteiro é pulado.
  if (pushSubscriptionIds.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: pushSubscriptionIds } },
    });
  }
  if (userIds.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { userId: { in: userIds } },
    });
  }
  if (settingsIds.length > 0) {
    await prisma.settings.deleteMany({ where: { id: { in: settingsIds } } });
  }
  if (inviteIds.length > 0) {
    await prisma.invite.deleteMany({ where: { id: { in: inviteIds } } });
  }
  if (membershipIds.length > 0) {
    await prisma.membership.deleteMany({
      where: { id: { in: membershipIds } },
    });
  }
  // ⚠️ **O ActivityEvent sai antes das QUATRO TABELAS QUE ELE REFERENCIA —
  // plano, livro, clube e usuário —, e ele é o único que se apaga também POR
  // ÂNCORA, não só por id** (Tarefa 34).
  //
  // As QUATRO FKs dele são `ON DELETE RESTRICT` e apontam para clube, pessoa,
  // livro e dia do plano. E, ao contrário de toda outra linha deste arquivo, o
  // evento **não é criado pelo teste**: ele nasce como efeito colateral dos
  // quatro UseCases de escrita (o gatilho da Tarefa 33), com id de
  // `randomUUID()` que nenhum teste conhece. Medido na Tarefa 34, no instante
  // em que o gatilho passou a gravar de verdade: QUATRO arquivos de integração
  // que já existiam (`book`, `highlight`, `note` e `reading-log`) passaram a
  // estourar no `afterAll` com
  // `Foreign key constraint violated: ActivityEvent_planItemId_fkey` — os
  // testes verdes, a limpeza quebrada e fixture vazando no banco de
  // desenvolvimento do dono.
  //
  // A saída é apagar por âncora, aqui, num lugar só: o `OR` cobre exatamente os
  // ids que o CHAMADOR já declarou como seus, então nada de outro clube é
  // tocado e **não existe `deleteMany({})`** — com todas as listas vazias, o
  // bloco inteiro é pulado. A alternativa (cada arquivo consultar e passar os
  // ids dos eventos) precisaria de uma linha em cada arquivo de integração que
  // escreve alguma coisa, presente e futuro, e a lição nº 3 do MVP 1 diz o que
  // acontece com regras que moram em N lugares.
  if (activityEventIds.length > 0) {
    await prisma.activityEvent.deleteMany({
      where: { id: { in: activityEventIds } },
    });
  }
  const activityAnchors = [
    planItemIds.length > 0 ? { planItemId: { in: planItemIds } } : undefined,
    bookIds.length > 0 ? { bookId: { in: bookIds } } : undefined,
    clubIds.length > 0 ? { clubId: { in: clubIds } } : undefined,
    userIds.length > 0 ? { userId: { in: userIds } } : undefined,
  ].filter((clause) => clause !== undefined);
  if (activityAnchors.length > 0) {
    await prisma.activityEvent.deleteMany({ where: { OR: activityAnchors } });
  }
  // O grifo antes do livro, do clube e do usuário: as TRÊS relações do
  // `Highlight` são obrigatórias e saem `ON DELETE RESTRICT` (lido do
  // `prisma migrate diff` na Tarefa 24 — é o default do Prisma para relação
  // obrigatória, ao contrário do `SetNull` das opcionais). Sem isto a limpeza
  // estoura na FK, e um teste que falhe no meio vaza fixture no banco de
  // desenvolvimento do dono. Não tem ordem obrigatória em relação à nota: não
  // há FK entre as duas tabelas.
  if (highlightIds.length > 0) {
    await prisma.highlight.deleteMany({ where: { id: { in: highlightIds } } });
  }
  // O log de leitura antes do plano, do livro, do clube e do usuário: as
  // QUATRO relações do `ReadingLog` são obrigatórias e saem
  // `ON DELETE RESTRICT` (a do `planItem` está declarada explicitamente no
  // schema; as outras três são o default do Prisma para relação obrigatória, e
  // o SQL da migration `20260910165956_reading_log` confirma as quatro). Sem
  // isto a limpeza estoura na FK, e um teste que falhe no meio vaza fixture no
  // banco de desenvolvimento do dono. Não tem ordem obrigatória em relação à
  // nota nem ao grifo: não há FK entre essas tabelas.
  if (readingLogIds.length > 0) {
    await prisma.readingLog.deleteMany({
      where: { id: { in: readingLogIds } },
    });
  }
  // A nota antes do plano: `Note.planItemId` é ON DELETE RESTRICT (declarado
  // EXPLICITAMENTE no schema — para relação opcional o default do Prisma seria
  // SET NULL), então um item de plano com nota não se apaga.
  if (noteIds.length > 0) {
    await prisma.note.deleteMany({ where: { id: { in: noteIds } } });
  }
  // O plano antes do livro, e o livro antes do clube e do autor: as FKs são
  // ON DELETE RESTRICT.
  if (planItemIds.length > 0) {
    await prisma.readingPlanItem.deleteMany({
      where: { id: { in: planItemIds } },
    });
  }
  if (bookIds.length > 0) {
    await prisma.book.deleteMany({ where: { id: { in: bookIds } } });
  }
  if (clubIds.length > 0) {
    await prisma.club.deleteMany({ where: { id: { in: clubIds } } });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}
