# SETUP.md — Rodar o projeto (uma vez)

> Passo a passo do zero até `pnpm dev` funcionando. Roda **uma vez**. Se você é o agente e o
> repositório ainda só tem documentos, este arquivo é a Tarefa 0 — o esqueleto do monorepo
> nasce aqui, e é a única parte do projeto que não segue TDD (não há regra de negócio em
> `package.json`).
>
> Ambiente de referência: **Windows 11 + PowerShell**, Node 20+, pnpm 9, Docker Desktop.

---

## 0. Pré-requisitos

```powershell
node --version    # >= 20
pnpm --version    # >= 9   (se faltar:  npm i -g pnpm)
docker --version
```

Docker Desktop precisa estar **rodando** — não só instalado. Metade dos erros de "não conecta
no banco" é o Docker fechado.

---

## 1. Esqueleto do monorepo

Na raiz do repositório:

```powershell
git init
```

`package.json` da raiz — privado, `type: module`, sem dependência de runtime:

```json
{
  "name": "clube-do-livro",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.0.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "db:up": "docker compose up -d",
    "db:down": "docker compose down",
    "dev:backend": "pnpm --filter @clube/backend dev",
    "dev:app": "pnpm --filter @clube/app dev",
    "test": "pnpm -r test",
    "test:integration": "pnpm -r test:integration",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint .",
    "prisma:migrate": "pnpm --filter @clube/backend prisma migrate dev",
    "prisma:studio": "pnpm --filter @clube/backend prisma studio",
    "prisma:seed": "pnpm --filter @clube/backend prisma db seed"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
```

`tsconfig.base.json` — um só, estendido pelos quatro pacotes (sem project references, sem
path alias: a resolução é pelos symlinks do workspace + `exports`):

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true, "noUncheckedIndexedAccess": true, "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true, "esModuleInterop": true, "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true, "resolveJsonModule": true,
    "isolatedModules": true, "declaration": true, "sourceMap": true
  }
}
```

Os quatro pacotes, com `@clube/shared` e `@clube/ui` apontando `main`/`types` direto para o
**código-fonte TS** (nada de build intermediário entre pacotes):

```
packages/shared   @clube/shared   → exports: "." , "./client", "./locales"
packages/ui       @clube/ui       → exports: "." , "./theme.css", "./editor.css"
                                    peerDeps: react, react-dom, react-router-dom
packages/backend  @clube/backend  → depende de @clube/shared (workspace:*)
packages/app      @clube/app      → depende de @clube/shared e @clube/ui (workspace:*)
```

Lint e formatação na raiz: `eslint.config.js` (flat config, ignorando `**/dist/**`,
`**/*.config.*`, `**/prisma/**`) com `@typescript-eslint/no-explicit-any: error` e
`simple-import-sort`; `.prettierrc.json` com
`{ semi: true, singleQuote: true, trailingComma: "all", printWidth: 80, tabWidth: 2 }`.

```powershell
pnpm install
```

---

## 2. Banco de dados

`docker-compose.yml` na raiz:

```yaml
services:
  db:
    image: postgres:16
    container_name: clube_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: clube
      POSTGRES_PASSWORD: clube
      POSTGRES_DB: clube
    ports: ['5432:5432']
    volumes: [clube_pgdata:/var/lib/postgresql/data]
volumes:
  clube_pgdata:
```

```powershell
pnpm db:up
docker ps        # o container clube_db precisa aparecer
```

---

## 3. Variáveis de ambiente

`.env.example` na raiz (copie para `packages/backend/.env`):

```
DATABASE_URL="postgresql://clube:clube@localhost:5432/clube?schema=public"
PORT=3333
JWT_SECRET="troque-isto-em-producao"
CORS_ORIGIN=
UPLOAD_DIR=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT="mailto:admin@localhost"
NOTIFICATION_WINDOW_MINUTES=10
SEED_ADMIN_EMAIL="admin@clube.local"
SEED_ADMIN_PASSWORD="troque-isto"
```

`packages/app/.env.example`:

```
VITE_API_URL=http://localhost:3333
```

```powershell
Copy-Item .env.example packages\backend\.env
Copy-Item packages\app\.env.example packages\app\.env
```

Notas:

- `JWT_SECRET` tem fallback de desenvolvimento no código, mas **produção não sobe sem ele**.
- `CORS_ORIGIN` vazio ⇒ `origin: true` (libera tudo — só em desenvolvimento).
- **VAPID vazio desliga as notificações inteiras, de forma limpa.** Não precisa configurar
  para desenvolver. Quando chegar o MVP 3:
  `pnpm --filter @clube/backend exec web-push generate-vapid-keys`.

---

## 4. Prisma

O schema nasce na **Tarefa 03**. Depois de escrevê-lo:

```powershell
pnpm --filter @clube/backend prisma generate
pnpm prisma:migrate      # prisma migrate dev --name init
```

**Nunca escreva nem edite SQL em `prisma/migrations/` à mão** — deixe o Prisma gerar
(`CLAUDE.md`).

Seed (`packages/backend/prisma/seed.ts`) — idempotente, cria **só** o super-admin e o
`Settings` dele. Não cria clube, livro nem nota: o clube se cria pela interface, é o fluxo
que precisa funcionar.

```powershell
pnpm prisma:seed
```

---

## 5. Rodar

Dois terminais:

```powershell
pnpm dev:backend     # http://localhost:3333  ·  Swagger em /docs
pnpm dev:app         # http://localhost:5173
```

Entre com o e-mail/senha do seed. Para testar no celular na mesma rede, suba o Vite com
`--host` e aponte `VITE_API_URL` para o IP da máquina (o service worker e o push exigem
`https` ou `localhost` — no celular, use um túnel se precisar testar notificação).

---

## Definição de pronto do setup

- [ ] `pnpm install` sem erro, e os quatro pacotes aparecem em `pnpm -r list --depth -1`.
- [ ] `pnpm db:up` sobe o `clube_db` e `docker ps` mostra ele saudável.
- [ ] `packages/backend/.env` e `packages/app/.env` existem (a partir dos `.example`).
- [ ] `pnpm prisma:migrate` aplica a migration inicial sem erro.
- [ ] `pnpm prisma:seed` cria o super-admin (rodar duas vezes não duplica).
- [ ] `pnpm dev:backend` responde `{"status":"ok"}` em `GET /health` e serve `/docs`.
- [ ] `pnpm dev:app` abre a tela de login e o login com o usuário do seed funciona.
- [ ] `pnpm -r test` e `pnpm -r typecheck` passam.
