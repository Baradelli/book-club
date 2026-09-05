# Tarefa 03 — Prisma: schema inicial, migration, repositórios reais e adapters

> Continua o **Bloco A**. É a primeira fatia de **persistência**: o domínio das Tarefas 01 e
> 02 ganha banco. Aqui **não há TDD de domínio** (não há regra nova) — o que existe é
> **teste de contrato** contra o Postgres real, provando que a implementação Prisma se comporta
> como o fake.
>
> Leia antes: `CLAUDE.md` (a regra de migrations e a de soft delete), `docs/SETUP.md`
> (passos 1–4) e o esqueleto Prisma de referência em `docs/plano-clube-do-livro.md` §6.

## Objetivo

Ter o Postgres com as tabelas do Bloco A, os repositórios Prisma implementando as interfaces
já definidas, os dois adapters externos (bcrypt e gerador de código), o seed do super-admin,
e um teste de contrato por repositório.

## Decisões já tomadas (do BACKLOG — não reabrir)

- **Migration sempre via Prisma.** `prisma migrate dev --name init`. **Nunca** escrever ou
  editar SQL em `prisma/migrations/` à mão.
- `@@unique([userId, clubId])` em `Membership`; `code` único em `Invite`.
- Soft delete (`status` + `archivedAt`) em `Club`; `status` em `Membership`.
- Enums Prisma para vocabulário fechado (`GeneralStatus`, `MemberRole`); `String` + `z.enum`
  para o que ainda evolui.
- Ids `String @id @default(cuid())` no schema — mas **quem gera o id é o UseCase**
  (`randomUUID()`); o default do banco é só rede de segurança.

## Entregas

### 1. Schema (`packages/backend/prisma/schema.prisma`)

**Só os modelos do Bloco A** — não adiante `Book`, `Note`, `Highlight` etc. (vêm nas
Tarefas 05+, cada uma com sua migration):

`User` (com `isSuperAdmin`) · `Club` · `Membership` · `Invite` · `Settings`.

Use o esqueleto de `docs/plano-clube-do-livro.md` §6 **verbatim** para esses cinco modelos,
recortando as relações que apontam para modelos ainda inexistentes. Enums: `GeneralStatus`,
`MemberRole`.

Índices que precisam existir desde já: `@@unique([userId, clubId])` e
`@@index([clubId, status])` em `Membership`; `code @unique` em `Invite`;
`email @unique` em `User`; `userId @unique` em `Settings`.

### 2. Migration

```powershell
pnpm --filter @clube/backend prisma migrate dev --name init
```

Confirmar que o arquivo gerado ficou em `prisma/migrations/<timestamp>_init/migration.sql` e
**não editá-lo**.

### 3. Repositórios Prisma (`src/repositories/`)

`prisma-user-repository.ts` · `prisma-club-repository.ts` ·
`prisma-membership-repository.ts` · `prisma-invite-repository.ts` ·
`prisma-settings-repository.ts`.

Molde de todos:

```ts
// mapeadores puros no topo do módulo, fora da classe
function toDomain(record: PrismaClub): Club { /* … */ }

export class PrismaClubRepository implements ClubRepository {
  constructor(private prisma: PrismaClient) {}
  async save(club: Club): Promise<Club> { /* upsert por id */ }
  async byId(id: string): Promise<Club | null> { /* … */ }
}
```

Regras:

- **`save` é upsert por `id`** (o UseCase já gerou o id). Assim `save` serve para criar e para
  reativar (regra 12 da Tarefa 01) sem um método novo.
- `update(id, patch)` usa `Partial<T>`; só os campos presentes vão para o `data`.
- `byEmail` recebe o e-mail **já normalizado** — o repositório não normaliza (isso é domínio).
- Nada de lógica de negócio aqui. Se um `if` de regra aparecer, ele está no lugar errado.

### 4. Adapters externos

`src/repositories/bcrypt-password-hasher.ts` — `bcryptjs`, `const ROUNDS = 10`.

`src/repositories/random-code-generator.ts` — `CodeGenerator` com 12 caracteres do alfabeto
base32 **sem ambíguos** (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`), usando `crypto.randomInt` (não
`Math.random`).

### 5. Seed (`packages/backend/prisma/seed.ts`)

Idempotente (`upsert`), criando **só** o super-admin e o `Settings` dele, a partir de
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. **Não** cria clube, livro nem nota — o clube se
cria pela interface, é o fluxo que precisa funcionar.

### 6. Infra de teste

`packages/backend/vitest.workspace.ts` separando os dois projetos:

```ts
export default defineWorkspace([
  { test: { name: 'unit', include: ['src/**/*.test.ts'],
            exclude: ['src/**/*.integration.test.ts'], environment: 'node' } },
  { test: { name: 'integration', include: ['src/**/*.integration.test.ts'],
            environment: 'node', poolOptions: { forks: { singleFork: true } } } },
]);
```

Scripts: `test` = `vitest run --project unit`; `test:integration` =
`vitest run --project integration`.

`src/repositories/__tests__/_db.ts` — helper compartilhado: um `prisma` exportado,
`TEST_ADMIN_ID`, `setupTestUser()` (upsert) e limpezas que **só apagam os próprios
fixtures** (nunca `deleteMany({})` numa tabela inteira).

## Testes (integração, Postgres real)

Um arquivo `*.contract.integration.test.ts` por repositório. O objetivo é provar que a
implementação Prisma honra a interface — não reescrever os testes de regra.

`prisma-club-repository.contract.integration.test.ts`
- `save` cria; `save` do mesmo id **atualiza** (upsert) e não duplica;
- `byId` devolve o clube com os campos mapeados (datas como `Date`, `archivedAt` nulo);
- `byId` de id inexistente → `null`.

`prisma-membership-repository.contract.integration.test.ts`
- `save` cria; `byUserAndClub` encontra;
- **`save` de um segundo membership do mesmo (user, club) com id diferente falha** — prova o
  `@@unique`. É este teste que justifica a fatia;
- `save` do mesmo id com `status = 'ARCHIVED'` atualiza no lugar (reativação/arquivamento).

`prisma-user-repository.contract.integration.test.ts`
- `save` + `byId` + `byEmail`; `byEmail` com e-mail de outro caso ≠ encontra nada;
- segundo usuário com o **mesmo e-mail** falha (prova o `@unique`);
- `update` altera só o campo do patch (os outros permanecem).

`prisma-invite-repository.contract.integration.test.ts`
- `save` + `byCode`; `byCode` inexistente → `null`;
- segundo convite com o **mesmo `code`** falha;
- `update` marca `usedAt`/`usedById`.

`prisma-settings-repository.contract.integration.test.ts`
- `save` + `byUserId`; segundo `Settings` para o mesmo `userId` falha.

Cada arquivo cria seus fixtures no `beforeAll`, apaga **os seus** no `afterAll`, e chama
`prisma.$disconnect()`.

## Decisões que assumi (revisar antes de executar)

- **`save` como upsert por id** em vez de `create` + `update` separados. Menos métodos na
  interface, e a reativação de membership sai de graça. Se você preferir `create` explícito
  (falhando em id repetido), separo.
- **Só os 5 modelos do Bloco A nesta migration.** Uma migration por bloco, em vez de um
  schema completo de uma vez — assim cada tabela nasce junto do código que a usa.
- **O UseCase gera o id**, e o `@default(cuid())` fica no schema apenas como rede de
  segurança. Alternativa: deixar o banco gerar e o UseCase não saber o id antes de salvar —
  complica os testes com fake.
- **Seed só do super-admin.** Sem clube nem livro de exemplo: dado de mentira no banco atrapalha
  mais do que ajuda quando se está testando o fluxo real de convite.
- **`ROUNDS = 10`** no bcrypt.
- **Nenhum `deleteMany({})`** nos testes de integração — o banco local pode ter dado que o dono
  está usando.

## Arquivos a tocar

- `packages/backend/package.json` (`prisma`, `@prisma/client`, `bcryptjs`, `tsx`,
  `@types/bcryptjs`; scripts `prisma:*`, `test`, `test:integration`, `db seed`).
- `packages/backend/prisma/schema.prisma` (novo) · `prisma/migrations/` (**gerado**) ·
  `prisma/seed.ts` (novo).
- `packages/backend/.env` / `.env.example` (`DATABASE_URL`, `SEED_ADMIN_*`).
- `src/repositories/prisma-{user,club,membership,invite,settings}-repository.ts` (novos).
- `src/repositories/bcrypt-password-hasher.ts` · `random-code-generator.ts` (novos).
- `src/repositories/__tests__/_db.ts` + os 5 `*.contract.integration.test.ts` (novos).
- `packages/backend/vitest.workspace.ts` (novo); `vitest.config.ts` fica vazio
  (`defineConfig({})`).
- **Não** tocar: `src/usecases/` (as interfaces já estão fechadas — se precisar mudar uma,
  **pare e pergunte**), `packages/shared`, `packages/ui`, `packages/app`, rotas.

## Fora de escopo

- Fastify, JWT, rotas, Swagger (Tarefa 04).
- Schemas Zod em `shared/` (Tarefa 04).
- Modelos `Book`, `ReadingPlanItem`, `Note`, `Highlight`, `ReadingLog`, `ActivityEvent`,
  `PushSubscription`, `NotificationDelivery`, `Attachment`, `NoteLink` — cada um na sua
  tarefa.
- Qualquer regra de negócio nova.

## Definição de pronto

- [x] `schema.prisma` com `User`, `Club`, `Membership`, `Invite`, `Settings` + os 2 enums.
- [x] Migration `init` **gerada pelo Prisma** (nenhum SQL escrito à mão) e aplicada.
- [x] Os 5 repositórios Prisma implementam as interfaces das Tarefas 01/02 **sem alterá-las**.
- [x] `BcryptPasswordHasher` e `RandomCodeGenerator` implementados (código sem caracteres
      ambíguos, `crypto.randomInt`).
- [x] Seed idempotente cria o super-admin + `Settings`; rodar duas vezes não duplica.
- [x] `vitest.workspace.ts` separa `unit` de `integration`.
- [x] `pnpm --filter @clube/backend test` (unit) continua verde — as Tarefas 01/02 não
      quebraram. **150 verdes** (135 das Tarefas 01/02, na distribuição original, + 13 dos
      adapters + 2 de fidelidade de fake).
- [x] `pnpm --filter @clube/backend test:integration` verde com o Docker de pé, cobrindo os 4
      índices únicos (`Membership`, `User.email`, `Invite.code`, `Settings.userId`).
      **25 verdes** em 5 arquivos de contrato.
- [x] `pnpm --filter @clube/backend typecheck` passa. Sem `any`.
- [x] Marcar `BACKLOG.md` + esta "Definição de pronto", reportar feito vs definição e
      **parar**.
