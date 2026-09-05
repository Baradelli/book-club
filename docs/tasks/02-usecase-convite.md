# Tarefa 02 — Domínio `Invite` + `User` + UseCases `createInvite` / `acceptInvite`

> Continua o **Bloco A**. Fecha o único caminho de entrada no sistema. TDD estrito com os
> fakes; ainda sem Prisma, sem Fastify.
>
> Leia antes: `docs/adr/0003-convite-por-link-sem-smtp.md`, `CLAUDE.md` e a Tarefa 01 (esta
> fatia reusa `MembershipRepository`, `ClubRepository` e `assertMembership`).

## Objetivo

Um admin do clube gera um convite; a pessoa abre o link e entra no sistema definindo a
própria senha, já com o papel certo no clube certo. Convite é de **uso único** e expira.

## Decisões já tomadas (do BACKLOG — não reabrir)

- **Não existe cadastro aberto.** A única entrada é o aceite de um convite.
- **Sem SMTP.** O link é entregue fora do sistema; o `code` é o segredo.
- **A pessoa define a própria senha** no aceite. Ninguém mais a conhece.
- **Uso único** (`usedAt`/`usedById`) + `expiresAt`.
- Criar convite exige `Membership.role ∈ {OWNER, ADMIN}` — via `assertMembership`.

## Mini-domínio (só desta fatia)

`src/domain/user.ts`:

```ts
export interface User {
  id: string;
  email: string;          // sempre normalizado: trim + lowercase
  name: string | null;
  passwordHash: string | null;
  isSuperAdmin: boolean;
  createdAt: Date;
}
```

`src/domain/invite.ts`:

```ts
export interface Invite {
  id: string;
  clubId: string;
  code: string;
  role: MemberRole;       // nunca 'OWNER'
  createdById: string;
  expiresAt: Date;
  usedAt: Date | null;
  usedById: string | null;
  createdAt: Date;
}

export const DEFAULT_INVITE_TTL_DAYS = 7;
export const MIN_PASSWORD_LENGTH = 8;
```

`src/domain/normalize-email.ts` — helper puro, porque a normalização precisa ser a mesma no
convite, no aceite e no login (Tarefa 04):

```ts
export function normalizeEmail(email: string): string;   // trim + toLowerCase
```

Erros novos em `src/domain/errors.ts`:

```ts
export class InvalidInviteError extends Error {}
export class InviteNotFoundError extends Error {}     // vira 404
export class InviteExpiredError extends Error {}      // vira 410
export class InviteAlreadyUsedError extends Error {}  // vira 409
export class EmailAlreadyInUseError extends Error {}
export class WeakPasswordError extends Error {}
```

## Ports (mínimo desta fatia)

`src/usecases/ports/invite-repository.ts`:

```ts
export interface InviteRepository {
  save(invite: Invite): Promise<Invite>;
  byCode(code: string): Promise<Invite | null>;
  update(id: string, patch: Partial<Invite>): Promise<Invite>;
}
```

`src/usecases/ports/user-repository.ts` — **substitui** o `UserReader` da Tarefa 01 (mova o
`isSuperAdmin` para cá e apague o `user-reader.ts`, ajustando `createClub`):

```ts
export interface UserRepository {
  save(user: User): Promise<User>;
  byId(id: string): Promise<User | null>;
  byEmail(email: string): Promise<User | null>;   // recebe o e-mail JÁ normalizado
  update(id: string, patch: Partial<User>): Promise<User>;
}
```

`src/usecases/ports/password-hasher.ts`:

```ts
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}
```

`src/usecases/ports/code-generator.ts` — injetado para o teste ser determinístico:

```ts
export interface CodeGenerator { generate(): string }
```

`src/usecases/ports/settings-repository.ts` (mínimo — o aceite cria o `Settings` da pessoa):

```ts
export interface SettingsRepository {
  save(settings: Settings): Promise<Settings>;
  byUserId(userId: string): Promise<Settings | null>;
}
```

`src/domain/settings.ts` (mínimo desta fatia):

```ts
export interface Settings {
  id: string; userId: string; timezone: string; locale: string;
  reminderTime: string; reminderEnabled: boolean; notifyGroupActivity: boolean;
}
export const DEFAULT_SETTINGS = {
  timezone: DEFAULT_TIMEZONE, locale: 'pt', reminderTime: '21:00',
  reminderEnabled: true, notifyGroupActivity: true,
} as const;
```

Fakes novos: `invite-repository-fake.ts`, `user-repository-fake.ts`,
`password-hasher-fake.ts` (hash = `` `hashed:${plain}` ``; compare compara isso),
`code-generator-fake.ts` (devolve uma sequência previsível), `settings-repository-fake.ts`.

## Contrato dos UseCases

`src/usecases/create-invite.ts`:

```ts
export interface CreateInviteInput {
  actorUserId: string;
  clubId: string;
  role?: MemberRole;   // default 'MEMBER'; 'OWNER' proibido
  ttlDays?: number;    // default DEFAULT_INVITE_TTL_DAYS
}
// Output: Invite
// Depende de: AssertMembership (ou MembershipRepository), ClubRepository,
//             InviteRepository, CodeGenerator
```

`src/usecases/accept-invite.ts`:

```ts
export interface AcceptInviteInput {
  code: string;
  email: string;
  password: string;
  name?: string;
  now?: Date;          // injetável para testar expiração
}
// Output: { user: User; membership: Membership; clubId: string }
// Depende de: InviteRepository, UserRepository, MembershipRepository,
//             ClubRepository, PasswordHasher, SettingsRepository
```

## Regras de negócio (o que os testes provam)

**`createInvite`**

1. Clube inexistente ou arquivado → `ClubNotFoundError`.
2. Ator sem membership ativo → `NotAMemberError`; ator `MEMBER` → `ForbiddenRoleError`
   (reusar `assertMembership` com `ADMIN_ROLES` — não reimplementar).
3. `role = 'OWNER'` → `InvalidInviteError`.
4. `role` fora de `MEMBER_ROLES` → `InvalidInviteError`.
5. `ttlDays` ≤ 0 ou não inteiro → `InvalidInviteError`. Ausente → `DEFAULT_INVITE_TTL_DAYS`.
6. `code` vem do `CodeGenerator`; se o código gerado já existir (`byCode` devolve algo),
   **tenta de novo** (até 5 vezes) e só então `InvalidInviteError`.
7. Defaults: `usedAt = null`, `usedById = null`, `createdAt = now`,
   `expiresAt = now + ttlDays`.

**`acceptInvite`**

8. `code` inexistente → `InviteNotFoundError`.
9. `invite.usedAt` preenchido → `InviteAlreadyUsedError`.
10. `invite.expiresAt <= now` → `InviteExpiredError`.
11. Clube do convite arquivado → `ClubNotFoundError`.
12. `email` vazio ou sem formato mínimo (`algo@algo`) → `InvalidInviteError`. Normalizado com
    `normalizeEmail` antes de qualquer busca.
13. `password` com menos de `MIN_PASSWORD_LENGTH` → `WeakPasswordError`.
14. **Pessoa nova** (`byEmail` → `null`): cria o `User` com `passwordHash` do hasher,
    `name` (trim, ou `null`), `isSuperAdmin = false`; cria o `Settings` com
    `DEFAULT_SETTINGS`; cria o `Membership` com o `role` do convite.
15. **Pessoa que já existe e já tem senha**: **não** sobrescreve a senha e **não** valida a
    senha informada; só cria o `Membership`. (Caso "já tenho conta, fui convidada para um
    segundo clube".)
16. **Pessoa que já existe sem senha** (`passwordHash = null`): define a senha agora.
17. Pessoa que **já tem membership ativo** naquele clube → `DuplicateMembershipError`, e o
    convite **não** é consumido.
18. Membership arquivado daquela pessoa naquele clube → **reativa** com o `role` do convite.
19. Sucesso marca o convite: `usedAt = now`, `usedById = user.id`. Um segundo aceite do mesmo
    código cai na regra 9.
20. Se `byEmail` encontra a pessoa, o `Settings` **não** é recriado (só cria quando não
    existe).

## Decisões que assumi (revisar antes de executar)

- **Convite não amarra e-mail.** Qualquer pessoa com o link entra, informando o e-mail dela.
  É o que faz o fluxo "mando no WhatsApp" funcionar. Se você quiser convite endereçado (só o
  e-mail X aceita), acrescento um campo `email?` e a regra de conferência.
- **Convite de pessoa que já existe não pede a senha atual** (regra 15). O link é o
  comprovante. Alternativa mais segura: exigir login antes de aceitar — mais telas.
- **TTL padrão de 7 dias.**
- **`MIN_PASSWORD_LENGTH = 8`**, sem exigência de maiúscula/símbolo. Clube pequeno; regra
  complexa gera senha anotada em papel.
- **`isSuperAdmin` nunca vem de convite** — só do seed ou do MVP 4.
- **Erros distintos para expirado (410) e usado (409)** — a tela de convite dá mensagens
  diferentes, e são situações diferentes.
- **`code` de 12 caracteres** base32 sem ambíguos (`0/O`, `1/I/l`) — é digitável se o link
  quebrar no WhatsApp. A geração real fica no adapter (Tarefa 03); aqui só a interface.
- **A Tarefa 01 é ajustada:** `UserReader` some e `createClub` passa a depender de
  `UserRepository`. É refactor previsto, com os testes da 01 verdes no fim.

## Testes a escrever PRIMEIRO (Vitest, fakes)

`src/usecases/__tests__/create-invite.test.ts`

- cria convite com defaults (`MEMBER`, TTL 7, não usado) e persiste;
- cria convite `ADMIN` quando o ator é `OWNER`;
- clube inexistente/arquivado → `ClubNotFoundError`;
- ator sem membership → `NotAMemberError`; ator `MEMBER` → `ForbiddenRoleError`;
- `role = 'OWNER'` e `role` inválido → `InvalidInviteError`;
- `ttlDays = 0` / negativo / fracionário → `InvalidInviteError`;
- código colidindo uma vez → gera outro e persiste; colidindo sempre → `InvalidInviteError`.

`src/usecases/__tests__/accept-invite.test.ts`

- pessoa nova: cria `User` + `Settings` + `Membership` com o papel do convite, e marca o
  convite como usado;
- a senha é gravada **hasheada** (nunca em claro);
- e-mail com espaços/maiúsculas é normalizado antes de buscar e de salvar;
- código inexistente → `InviteNotFoundError`;
- convite já usado → `InviteAlreadyUsedError`;
- convite expirado (`now` injetado) → `InviteExpiredError`;
- clube arquivado → `ClubNotFoundError`;
- e-mail inválido → `InvalidInviteError`; senha curta → `WeakPasswordError`;
- pessoa existente com senha: não sobrescreve o hash, não recria `Settings`, cria o
  membership;
- pessoa existente sem senha: define a senha;
- pessoa já membro ativo → `DuplicateMembershipError` **e o convite continua não usado**;
- membership arquivado → reativa com o papel do convite;
- aceitar duas vezes o mesmo código → segunda vez `InviteAlreadyUsedError`.

Ciclo red → green → refactor.

## Arquivos a tocar

- `src/domain/user.ts` · `invite.ts` · `settings.ts` · `normalize-email.ts` (novos) ·
  `errors.ts` (6 erros novos).
- `src/usecases/ports/invite-repository.ts` · `user-repository.ts` · `password-hasher.ts` ·
  `code-generator.ts` · `settings-repository.ts` (novos) · **apagar** `ports/user-reader.ts`.
- `src/usecases/_fakes/` — 5 fakes novos; **apagar** `user-reader-fake.ts`.
- `src/usecases/create-invite.ts` · `accept-invite.ts` (novos).
- `src/usecases/create-club.ts` — ajuste da dependência (`UserRepository`).
- `src/usecases/__tests__/create-invite.test.ts` · `accept-invite.test.ts` (novos) ·
  `create-club.test.ts` (ajuste do fake).
- **Não** tocar: `packages/shared`, `packages/ui`, `packages/app`, Prisma, rotas, telas.

## Fora de escopo

- Implementação real do hasher (bcrypt) e do gerador de código (Tarefa 03).
- Prisma, migration, teste de contrato (Tarefa 03).
- `POST /invites`, `POST /invites/:code/accept`, JWT, login (Tarefa 04).
- Revogar convite, listar convites ativos (MVP 4).
- Tela de aceite (Tarefa 15).
- Convite endereçado a um e-mail específico; reenvio; notificação de convite.

## Definição de pronto

- [x] Domínio `User`, `Invite`, `Settings` (mínimo) e `normalizeEmail` criados.
- [x] `UserReader` removido; `createClub` migrado para `UserRepository` com os testes da
      Tarefa 01 **ainda verdes**.
- [x] Ports e fakes de `Invite`, `User`, `PasswordHasher`, `CodeGenerator`, `Settings`.
- [x] `createInvite` e `acceptInvite` implementados, dependendo só de interfaces.
- [x] Testes escritos **antes**, todos verdes, cobrindo as 20 regras. **135 testes verdes no
      pacote** (84 desta fatia: accept-invite 31 · create-invite 16 · e 37 nas suítes dos 5
      fakes novos).
- [x] `createInvite` reusa `assertMembership` com `ADMIN_ROLES` (não duplica a regra de papel).
- [x] A senha nunca é persistida em claro, e o teste prova isso.
- [x] Convite não é consumido quando o aceite falha.
- [x] `pnpm --filter @clube/backend typecheck` passa. Sem `any`.
- [x] Marcar `BACKLOG.md` + esta "Definição de pronto", reportar feito vs definição e
      **parar**.
