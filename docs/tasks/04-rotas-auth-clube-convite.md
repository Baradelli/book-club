# Tarefa 04 — Fastify de pé: `buildServer`, JWT, Swagger e as rotas do Bloco A

> Fecha o **Bloco A**. Aqui o backend passa a existir como servidor: composição, autenticação,
> validação Zod na borda e as primeiras rotas. É também onde nascem os **schemas Zod em
> `packages/shared`** — a partir de agora back e front importam de lá.
>
> Leia antes: `CLAUDE.md` (camadas, multi-tenant, convenções de idioma) e as Tarefas 01–03.

## Objetivo

Subir o Fastify com Zod type provider, Swagger e JWT; expor login, renovação de sessão,
criação de clube, criação de convite e aceite de convite; e estabelecer o **padrão de rota**
que todas as tarefas seguintes vão copiar — incluindo o **corte de tenant** e a tradução de
erro de domínio em status HTTP.

## Decisões já tomadas (do BACKLOG — não reabrir)

- JWT **Bearer**, sem cookie e sem tabela de sessão. Payload mínimo: `{ sub: userId }`.
- **Nenhum handler aceita `userId` do corpo** — o tenant é sempre `req.user.sub`.
- Sem membership ativo → **404**. Membership sem o papel → **403**.
- Schemas Zod vivem em `packages/shared`; a rota usa `.omit()` do que vem do JWT/params.
- Sem cadastro aberto: não existe `POST /users` nem `POST /signup`.

## Entregas

### 1. `packages/shared` — os schemas

`src/auth.ts`:

```ts
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export const loginResponseSchema = z.object({ token: z.string() });
export const meResponseSchema = z.object({
  id: z.string(), email: z.string(), name: z.string().nullable(), isSuperAdmin: z.boolean(),
  clubs: z.array(z.object({ id: z.string(), name: z.string(), role: memberRole })),
});
```

`src/club.ts`: `memberRole = z.enum(['OWNER','ADMIN','MEMBER'])` ·
`createClubSchema` (`name` min 1, `timezone` opcional, `ownerUserId` opcional) ·
`clubResponseSchema`.

`src/invite.ts`: `createInviteSchema` (`role` opcional **sem** `OWNER`, `ttlDays` opcional int
positivo) · `acceptInviteSchema` (`email`, `password` min 8, `name` opcional) ·
`inviteResponseSchema` (com o `code`) · `acceptInviteResponseSchema` (`{ token, clubId }`).

`src/index.ts` reexporta tudo; `src/client/` ainda não (é a Tarefa 12).

Um teste em `packages/shared/src/__tests__/schemas.test.ts`: `acceptInviteSchema` rejeita
senha de 7 caracteres; `createInviteSchema` rejeita `role: 'OWNER'`.

### 2. `src/http/server.ts` — a raiz de composição

```ts
declare module '@fastify/jwt' {
  interface FastifyJWT { payload: { sub: string }; user: { sub: string } }
}

export async function buildServer() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();
  const prisma = new PrismaClient();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: corsEnv ? corsEnv.split(',').map(s => s.trim()) : true });
  await app.register(swagger, { openapi: { info: { title: 'Clube do Livro API', version: '0.0.0' } } });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  await app.register(jwt, { secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-me' });

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(publicRoutes, { prisma });      // login, refresh, aceite de convite

  await app.register(async (api) => {                 // escopo autenticado encapsulado
    api.addHook('onRequest', async (req, reply) => {
      try { await req.jwtVerify(); }
      catch { return reply.status(401).send({ error: 'Unauthorized' }); }
    });
    await api.register(meRoutes, { prisma });
    await api.register(clubRoutes, { prisma });
    await api.register(inviteRoutes, { prisma });
  });

  return app;
}
```

`src/http/main.ts` (curto): lê `PORT` (default 3333) e chama
`buildServer().then(app => app.listen({ port, host: '0.0.0.0' }))`.

**`buildServer()` devolve o app sem escutar** — é isso que permite `app.inject()` nos testes
de integração. Não inverter.

O escopo autenticado é um **plugin encapsulado**, não um hook global: rotas públicas ficam
fora dele por construção, não por esquecimento.

### 3. As rotas

| Método | Rota | Escopo | UseCase |
|---|---|---|---|
| `POST` | `/auth/login` | público | `authenticateUser` (novo, ver abaixo) |
| `POST` | `/auth/refresh` | público* | — (só `jwtVerify` + reassinatura) |
| `POST` | `/invites/:code/accept` | público | `acceptInvite` |
| `GET` | `/me` | autenticado | `getMe` (novo, ver abaixo) |
| `POST` | `/clubs` | autenticado | `createClub` |
| `POST` | `/clubs/:clubId/invites` | autenticado | `createInvite` |

\* `/auth/refresh` fica no escopo público mas chama `req.jwtVerify()` no próprio handler,
para poder devolver um 401 limpo em vez de o hook global cortar antes.

**Dois UseCases novos** (com TDD, fake repo, antes da rota):

`src/usecases/authenticate-user.ts`

```ts
{ email: string; password: string } -> { userId: string }
// depende de UserRepository + PasswordHasher
```

Regras: e-mail normalizado com `normalizeEmail`; **um único erro
`InvalidCredentialsError`** para "não existe" e "senha errada" (não vazar existência de
conta); `passwordHash = null` também dá `InvalidCredentialsError`. **A emissão do JWT é da
borda, não do UseCase.**

`src/usecases/get-me.ts`

```ts
{ userId: string } -> { user: User; clubs: Array<{ id, name, role }> }
// depende de UserRepository + MembershipRepository (novo método) + ClubRepository
```

Precisa de um método novo no port: `MembershipRepository.findByUser(userId): Promise<Membership[]>`
(só os `ACTIVE`). Estender a interface, o fake **e** o repo Prisma.

Padrão de todo arquivo de rota (copiar daqui em diante):

```ts
export const clubRoutes: FastifyPluginAsyncZod<{ prisma: PrismaClient }> = async (app, options) => {
  const clubRepo = new PrismaClubRepository(options.prisma);
  const membershipRepo = new PrismaMembershipRepository(options.prisma);
  const userRepo = new PrismaUserRepository(options.prisma);
  const createClub = new CreateClub(userRepo, clubRepo, membershipRepo);   // uma vez, no registro

  app.post('/clubs', {
    schema: {
      body: createClubSchema,
      response: { 201: clubResponseSchema, 400: errorSchema, 403: errorSchema },
    },
  }, async (req, reply) => {
    try {
      const { club } = await createClub.execute({ ...req.body, actorUserId: req.user.sub });
      return reply.status(201).send(toResponse(club));
    } catch (error) {
      return handleDomainError(error, reply);
    }
  });
};
```

`src/http/handle-domain-error.ts` — o mapa único, em um lugar só:

| Erro de domínio | Status |
|---|---|
| `InvalidClubError`, `InvalidInviteError`, `WeakPasswordError` | 400 |
| `InvalidCredentialsError` | 401 |
| `ForbiddenRoleError`, `NotSuperAdminError` | 403 |
| `ClubNotFoundError`, `NotAMemberError`, `InviteNotFoundError` | 404 |
| `DuplicateMembershipError`, `InviteAlreadyUsedError`, `EmailAlreadyInUseError` | 409 |
| `InviteExpiredError` | 410 |
| qualquer outro | **relança** (vira 500 e aparece no log) |

Cada arquivo de rota tem no topo um `toResponse(domain)` que converte `Date` em ISO string.
`TOKEN_TTL = '15d'`.

## Testes (integração, `app.inject()`)

`src/routes/__tests__/auth-routes.integration.test.ts`
- `beforeAll`: `buildServer()` + `app.ready()`, cria um usuário com senha hasheada;
- login correto → 200 com `token`; senha errada → **401**; e-mail inexistente → **401**
  (mesma mensagem dos dois, e o teste confere que são iguais);
- body sem `password` → **400** (Zod na borda);
- `/auth/refresh` com token válido → 200 com token novo; sem header → 401.

`src/routes/__tests__/club-routes.integration.test.ts`
- super-admin cria clube → 201, e o `Membership` `OWNER` existe no banco;
- usuário comum → **403**;
- sem token → **401**;
- `name` vazio → **400**.

`src/routes/__tests__/invite-routes.integration.test.ts`
- `OWNER` cria convite → 201 com `code`;
- `MEMBER` do clube → **403**;
- **usuário de outro clube → 404** (o corte de tenant — este teste é obrigatório);
- `role: 'OWNER'` no body → **400**;
- aceite do convite (público) → 201 com `{ token, clubId }`, e o `Membership` existe;
- aceitar o mesmo código duas vezes → **409** na segunda;
- convite expirado → **410**.

`afterAll` apaga **só** os fixtures criados, `$disconnect()` e `app.close()`.

## Decisões que assumi (revisar antes de executar)

- **`TOKEN_TTL = '15d'` com `/auth/refresh` deslizante.** É um app pessoal em celular; login
  a cada duas semanas é atrito. Se quiser mais curto, mudo a constante.
- **Erro genérico no login** (não distingue "não existe" de "senha errada"), e o teste
  garante que as mensagens são idênticas.
- **`/me` devolve a lista de clubes com o papel** — é o que o seletor de clube (Tarefa 16)
  precisa, numa chamada só.
- **`POST /clubs/:clubId/invites`** (aninhado) em vez de `POST /invites` com `clubId` no
  corpo: o clube é dono do convite, e o `clubId` fora do body facilita o guard.
- **`handleDomainError` centralizado** em vez de `if (error instanceof …)` em cada handler.
  Erro desconhecido é **relançado** de propósito: 500 no log é melhor que 400 mentiroso.
- **`getMe` como UseCase**, não query direta na rota — mesmo sendo só leitura, mantém a regra
  "rota não fala com Prisma".
- **Sem rate limit** nesta fatia. Registrar como dívida: o login e o aceite de convite são as
  duas rotas públicas, e merecem `@fastify/rate-limit` antes de expor na internet.

## Arquivos a tocar

- `packages/shared/package.json`, `tsconfig.json`, `vitest.config.ts` (novos) ·
  `src/{auth,club,invite,index}.ts` · `src/__tests__/schemas.test.ts`.
- `packages/backend/package.json` (`fastify`, `fastify-type-provider-zod`, `@fastify/cors`,
  `@fastify/jwt`, `@fastify/swagger`, `@fastify/swagger-ui`, `@clube/shared`; script `dev`).
- `src/http/server.ts` · `main.ts` · `handle-domain-error.ts` (novos).
- `src/routes/public-routes.ts` · `me-routes.ts` · `club-routes.ts` · `invite-routes.ts`
  (novos).
- `src/usecases/authenticate-user.ts` · `get-me.ts` + seus testes unitários (novos).
- `src/usecases/ports/membership-repository.ts` (+`findByUser`) · o fake · o repo Prisma.
- `src/domain/errors.ts` (+`InvalidCredentialsError`).
- `src/routes/__tests__/` — os 3 arquivos de integração.
- **Não** tocar: `packages/ui`, `packages/app`, e nenhuma regra das Tarefas 01/02.

## Fora de escopo

- `packages/shared/src/client/` (cliente HTTP e token) — Tarefa 12.
- Qualquer tela (Bloco D).
- `Book`, `ReadingPlanItem`, `Note` e suas rotas (Blocos B e C).
- Upload de arquivo / `@fastify/multipart` (vem com a imagem no editor, Tarefa 14).
- Rate limit, logs estruturados, Docker de produção, deploy.
- Listar/revogar convites, listar membros, mudar papel (MVP 4).

## Definição de pronto

- [x] `packages/shared` existe, exporta os schemas de auth/club/invite, e seu teste passa.
- [x] `buildServer()` devolve o app **sem escutar**; `main.ts` é quem escuta.
- [x] `GET /health` responde `{"status":"ok"}` e `/docs` serve o Swagger com as 6 rotas.
- [x] Escopo autenticado é um plugin encapsulado; rota sem token → 401.
- [x] `authenticateUser` e `getMe` têm teste unitário **escrito antes**, com fake.
- [x] O login não distingue conta inexistente de senha errada (com teste provando).
- [x] `handleDomainError` é o único ponto de tradução erro → status, e relança o desconhecido.
- [x] Nenhum handler lê `userId` do body (`grep` por `body.userId` → nada).
- [x] **O teste de corte de tenant passa**: usuário de outro clube recebe 404 ao criar convite.
- [x] `pnpm --filter @clube/backend test` e `test:integration` verdes; `pnpm -r typecheck`
      passa. Sem `any`. **190 unit + 75 integração + 21 em `shared`**.
- [x] Fluxo manual conferido: seed → login → `POST /clubs` → `POST /clubs/:id/invites` →
      `POST /invites/:code/accept` → login com a conta nova → `GET /me` mostra o clube.
- [x] Marcar `BACKLOG.md` + esta "Definição de pronto", reportar feito vs definição e
      **parar**.
