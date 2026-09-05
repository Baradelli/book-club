# Tarefa 01 — Domínio `Club` + `Membership` + UseCases `createClub` / `addMember` / `assertMembership`

> Abre o **Bloco A — Clube, convite e sessão**. É a primeira tarefa do projeto: cria a
> estrutura de pastas do `packages/backend`, o mini-domínio e os três casos de uso que todo o
> resto vai depender. TDD estrito: testes antes da implementação, contra o **fake em
> memória**. Sem Prisma, sem Fastify, sem Zod em `shared/` (entram nas Tarefas 03 e 04).
>
> Leia antes: `CLAUDE.md` (camadas + TDD + a seção "Multi-tenant desde o dia 1"),
> `docs/adr/0005-multi-clube-desde-o-dia-1.md` e as "Decisões fechadas do MVP 1" em
> `docs/BACKLOG.md`.

## Objetivo

Ter um clube que se cria, uma pessoa que se adiciona a ele com um papel, e — o mais
importante — **o guard de tenant** (`assertMembership`) que toda leitura e toda escrita do
sistema vai usar para decidir se aquela pessoa pode tocar naquele clube. Regra na camada de
aplicação, isolada de persistência e transporte.

## Decisões já tomadas (do BACKLOG — não reabrir)

- **Multi-clube desde a primeira migration.** `Membership` é `user × club × role`, com
  `@@unique([userId, clubId])`. Não existe a versão "um clube só".
- **Papel de plataforma ≠ papel de clube.** Criar clube exige `User.isSuperAdmin`; cadastrar
  livro/convidar exige `Membership.role ∈ {OWNER, ADMIN}`.
- **Sem membership ativo → 404, não 403.** O guard sinaliza "não existe", e a rota (Tarefa 04)
  traduz para 404.
- **Soft delete** em `Club` e `Membership` (`status` + `archivedAt`/`status`).

## Mini-domínio (só desta fatia)

`src/domain/club.ts`:

```ts
export type GeneralStatus = 'ACTIVE' | 'ARCHIVED';
export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export const MEMBER_ROLES: readonly MemberRole[] = ['OWNER', 'ADMIN', 'MEMBER'];
export const ADMIN_ROLES: readonly MemberRole[] = ['OWNER', 'ADMIN'];

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export interface Club {
  id: string;
  name: string;
  timezone: string;
  status: GeneralStatus;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface Membership {
  id: string;
  userId: string;
  clubId: string;
  role: MemberRole;
  status: GeneralStatus;
  joinedAt: Date;
}
```

`src/domain/errors.ts` (novo arquivo — cresce a cada tarefa):

```ts
export class InvalidClubError extends Error {}
export class ClubNotFoundError extends Error {}   // recebe o id na mensagem
export class NotAMemberError extends Error {}     // vira 404 na borda
export class ForbiddenRoleError extends Error {}  // vira 403 na borda
export class NotSuperAdminError extends Error {}  // vira 403 na borda
export class DuplicateMembershipError extends Error {}
```

> `NotAMemberError` e `ForbiddenRoleError` são erros **diferentes** de propósito: o primeiro
> significa "esse clube não existe para você" (404), o segundo "você está no clube mas não
> tem o papel" (403). Confundir os dois vaza a existência do clube.

## Repository (mínimo desta fatia)

Só o que estes três casos de uso precisam. A interface **cresce junto** com as tarefas
seguintes — não adicione `find`/`delete` agora.

`src/usecases/ports/club-repository.ts`:

```ts
export interface ClubRepository {
  save(club: Club): Promise<Club>;
  byId(id: string): Promise<Club | null>;
}
```

`src/usecases/ports/membership-repository.ts`:

```ts
export interface MembershipRepository {
  save(membership: Membership): Promise<Membership>;
  byUserAndClub(userId: string, clubId: string): Promise<Membership | null>;
}
```

`src/usecases/ports/user-reader.ts` — o mínimo para checar super-admin sem arrastar o
domínio de `User` inteiro para esta fatia:

```ts
export interface UserSummary { id: string; isSuperAdmin: boolean }

export interface UserReader {
  byId(id: string): Promise<UserSummary | null>;
}
```

Fakes correspondentes em `src/usecases/_fakes/`: `club-repository-fake.ts`,
`membership-repository-fake.ts`, `user-reader-fake.ts`. Molde de todos:
`private store = new Map<string, T>()`, um `clone()` interno para o chamador não mutar o
store, e um getter de teste `get saved(): T[]`.

## Contrato dos UseCases

`src/usecases/create-club.ts`:

```ts
export interface CreateClubInput {
  actorUserId: string;   // quem está criando — precisa ser super-admin
  name: string;
  timezone?: string;     // default DEFAULT_TIMEZONE
  ownerUserId?: string;  // quem vira OWNER; default = actorUserId
}
// Output: { club: Club; ownerMembership: Membership }
// Depende de: UserReader, ClubRepository, MembershipRepository
```

`src/usecases/add-member.ts`:

```ts
export interface AddMemberInput {
  actorUserId: string;   // precisa ser OWNER/ADMIN do clube
  clubId: string;
  userId: string;        // quem entra
  role?: MemberRole;     // default 'MEMBER'
}
// Output: Membership
// Depende de: ClubRepository, MembershipRepository
```

`src/usecases/assert-membership.ts` — **o guard**. É o que toda rota de conteúdo vai chamar:

```ts
export interface AssertMembershipInput {
  userId: string;
  clubId: string;
  requireRole?: readonly MemberRole[];  // ex.: ADMIN_ROLES
}
// Output: Membership  (o membership ativo, para o chamador usar o role)
// Depende de: MembershipRepository
```

## Regras de negócio (o que os testes provam)

**`createClub`**

1. `actorUserId` inexistente ou com `isSuperAdmin = false` → `NotSuperAdminError`.
2. `name` vazio/só-espaços → `InvalidClubError`. Quando válido, `trim` aplicado.
3. `timezone` ausente → `DEFAULT_TIMEZONE`. `timezone` presente e vazio → `InvalidClubError`.
   (Não validar se o fuso existe de verdade — isso é `shared/` na Tarefa 03.)
4. Defaults do clube: `status = 'ACTIVE'`, `archivedAt = null`, `createdAt = new Date()`,
   `id = randomUUID()`.
5. Cria **junto** o `Membership` do dono, com `role = 'OWNER'` e `status = 'ACTIVE'`. Se
   `ownerUserId` foi informado, é ele; senão, o `actorUserId`.
6. Ambos são persistidos (o teste confere `clubRepo.saved` e `membershipRepo.saved`).

**`addMember`**

7. Clube inexistente **ou** com `status = 'ARCHIVED'` → `ClubNotFoundError`.
8. `actorUserId` sem membership ativo no clube → `NotAMemberError`.
9. `actorUserId` com membership ativo mas `role = 'MEMBER'` → `ForbiddenRoleError`.
10. `role` fora de `MEMBER_ROLES` → `InvalidClubError`.
11. Já existe membership **ativo** de `userId` naquele clube → `DuplicateMembershipError`.
12. Existe membership **arquivado** de `userId` naquele clube → **reativa** (mesmo id,
    `status = 'ACTIVE'`, `role` do input, `joinedAt` atualizado) em vez de criar outro — o
    `@@unique([userId, clubId])` não permitiria duplicar.
13. Não é possível adicionar um segundo `OWNER` por `addMember` (`role = 'OWNER'` →
    `ForbiddenRoleError`). Transferência de dono é MVP 4.
14. Defaults: `role = 'MEMBER'`, `status = 'ACTIVE'`, `joinedAt = new Date()`.

**`assertMembership`**

15. Sem membership, ou com membership `ARCHIVED` → `NotAMemberError`.
16. Com membership ativo e `requireRole` ausente → devolve o membership.
17. Com membership ativo e `role` **fora** de `requireRole` → `ForbiddenRoleError`.
18. Com membership ativo e `role` **dentro** de `requireRole` → devolve o membership.

## Decisões que assumi (revisar antes de executar)

- **`createClub` cria o `OWNER` na mesma operação.** Um clube sem dono é um estado inválido
  que ninguém deveria conseguir criar. Se você preferir separar, tiro a regra 5 — mas então
  precisa de uma regra "clube sem membership não aparece em lugar nenhum".
- **`ownerUserId` opcional.** Assumi que o super-admin pode criar um clube já com outra
  pessoa como dono (o caso "criei o clube dos amigos e o dono é o João"). Se sempre o
  criador é o dono, removo o campo.
- **Membership arquivado é reativado, não recriado** (regra 12). É o que o índice único
  obriga; se você preferir erro explícito ("essa pessoa já saiu do clube, reative pela
  gerência"), mudo.
- **`addMember` não cria `OWNER`** (regra 13). Segundo dono só por transferência, no MVP 4.
- **Não valido o `timezone` contra a lista de fusos** nesta fatia — isso é validação de
  borda, e o Zod em `shared/` faz na Tarefa 03. Se preferir a regra no domínio, movo.
- **`UserReader` em vez do domínio `User` completo.** Esta fatia só precisa saber se alguém é
  super-admin; o domínio `User` nasce na Tarefa 02 (com o aceite do convite). Se você
  preferir criar `User` já aqui, dá para juntar.

## Testes a escrever PRIMEIRO (Vitest, fakes)

`src/usecases/__tests__/create-club.test.ts`

- cria clube com defaults e persiste (confere `saved` dos dois repos);
- cria o `Membership` do dono com `role = 'OWNER'`;
- `ownerUserId` informado → o membership é dele, não do ator;
- ator inexistente → `NotSuperAdminError`;
- ator com `isSuperAdmin = false` → `NotSuperAdminError`;
- `name` vazio / só espaços → `InvalidClubError`; `name` com espaços nas pontas → trim;
- `timezone` ausente → `DEFAULT_TIMEZONE`; `timezone` vazio → `InvalidClubError`.

`src/usecases/__tests__/add-member.test.ts`

- adiciona `MEMBER` com defaults e persiste;
- adiciona `ADMIN` quando o ator é `OWNER`;
- clube inexistente → `ClubNotFoundError`; clube arquivado → `ClubNotFoundError`;
- ator sem membership → `NotAMemberError`;
- ator `MEMBER` → `ForbiddenRoleError`;
- `role` inválido → `InvalidClubError`; `role = 'OWNER'` → `ForbiddenRoleError`;
- membership ativo já existente → `DuplicateMembershipError`;
- membership arquivado existente → reativa mantendo o mesmo `id`.

`src/usecases/__tests__/assert-membership.test.ts`

- membership ativo sem `requireRole` → devolve o membership;
- sem membership → `NotAMemberError`; membership arquivado → `NotAMemberError`;
- `requireRole = ADMIN_ROLES` com ator `ADMIN` → devolve; com ator `OWNER` → devolve;
- `requireRole = ADMIN_ROLES` com ator `MEMBER` → `ForbiddenRoleError`.

Ciclo red → green → refactor. Nenhuma implementação antes do teste correspondente falhar.

## Arquivos a tocar

- `packages/backend/package.json`, `tsconfig.json`, `vitest.config.ts` (o esqueleto mínimo do
  pacote: `vitest`, `typescript`; **sem** Fastify e **sem** Prisma ainda).
- `src/domain/club.ts` (novo) · `src/domain/errors.ts` (novo).
- `src/usecases/ports/club-repository.ts` · `ports/membership-repository.ts` ·
  `ports/user-reader.ts` (novos).
- `src/usecases/_fakes/club-repository-fake.ts` · `_fakes/membership-repository-fake.ts` ·
  `_fakes/user-reader-fake.ts` (novos).
- `src/usecases/create-club.ts` · `add-member.ts` · `assert-membership.ts` (novos).
- `src/usecases/__tests__/create-club.test.ts` · `add-member.test.ts` ·
  `assert-membership.test.ts` (novos).
- **Não** tocar: `packages/shared`, `packages/ui`, `packages/app`, Prisma, rotas, telas.

## Fora de escopo

- Prisma, migration, repositórios reais, teste de contrato (Tarefa 03).
- Fastify, JWT, rotas, tradução de erro para HTTP (Tarefa 04).
- Schemas Zod em `shared/` (Tarefas 03/04).
- `Invite` e `acceptInvite` (Tarefa 02). `User` completo com senha (Tarefa 02).
- `listClubs`, `archiveClub`, `changeMemberRole`, `removeMember` (MVP 4).
- Qualquer coisa de `Book`, `Note`, `Settings`.

## Definição de pronto

- [x] `packages/backend` existe com o mínimo para rodar Vitest, e `pnpm --filter
      @clube/backend test` executa.
- [x] Domínio `Club`/`Membership` + os 6 erros criados.
- [x] Interfaces `ClubRepository`, `MembershipRepository`, `UserReader` + os três fakes.
- [x] `createClub`, `addMember` e `assertMembership` implementados, dependendo **só** de
      interfaces (nenhum import de Fastify ou Prisma em `src/usecases/`).
- [x] Testes escritos **antes**, todos verdes, cobrindo as 18 regras. **51 testes verdes**
      (create-club 13 · add-member 12 · assert-membership 8 · club-repository-fake 7 ·
      membership-repository-fake 11).
- [x] Defaults corretos (`ACTIVE`, `archivedAt = null`, `MEMBER`, `DEFAULT_TIMEZONE`).
- [x] `NotAMemberError` e `ForbiddenRoleError` são erros distintos e testados como tal.
- [x] `pnpm --filter @clube/backend typecheck` passa. Sem `any`.
- [x] Marcar `BACKLOG.md` + esta "Definição de pronto", reportar feito vs definição e
      **parar**.
