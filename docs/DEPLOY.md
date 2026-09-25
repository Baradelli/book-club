# DEPLOY.md — Produção

> **https://clubelivro.vitorbaradelli.com** · servidor `devocional` (187.127.30.31, Ubuntu 24.04,
> compartilhado com outros apps — **não mexa no que não é do clube**).

## Como publicar

**Push na `main`.** O workflow `.github/workflows/deploy.yml` roda typecheck + testes
unitários (vermelho não publica), builda o PWA e publica. Também dá para disparar à mão:
aba **Actions → Deploy produção → Run workflow**.

Ordem do workflow: API primeiro (`git reset --hard origin/main` → `pnpm install` →
`prisma generate` → **`prisma migrate deploy`** → `pm2 startOrReload` → espera `/health`),
depois o PWA por `rsync`. Migration nova entra sozinha — desde que tenha sido gerada com
`prisma migrate dev` e commitada (`CLAUDE.md`).

Secrets do repositório (GitHub → Settings → Secrets → Actions): `DEPLOY_SSH_KEY` (chave
ed25519 **dedicada** a este repo, comentário `github-actions-book-club-deploy` no
`authorized_keys` do root), `DEPLOY_HOST`, `DEPLOY_USER`.

## O que mora no servidor

| O quê | Onde |
|---|---|
| Código (clone público, atualizado pelo workflow) | `/var/www/vitor/clube-do-livro` |
| PWA buildado (servido pelo nginx) | `/var/www/vitor/clube-do-livro-web` |
| API (Fastify, Node 24 via nvm, `tsx`) | pm2 `clube-api` → `127.0.0.1:3030` · `ecosystem.config.cjs` |
| `.env` da API (**só no servidor**, 600) | `packages/backend/.env` |
| Postgres 16 (docker, projeto `clube`) | container `clube_db_prod` → `127.0.0.1:5436` · `docker-compose.prod.yml` |
| Senha do Postgres | `/root/.secrets/clube-db.env` |
| nginx (cópia versionada em `deploy/nginx/`) | `/etc/nginx/sites-available/clubelivro.vitorbaradelli.com` |
| Certificado (Let's Encrypt, DNS-01 Cloudflare, renova sozinho) | `/etc/letsencrypt/live/clubelivro.vitorbaradelli.com/` |
| DNS | Cloudflare, registro `A clubelivro` → 187.127.30.31, proxy ligado |

O nginx serve o PWA na raiz e repassa `/api/*` para a API **tirando o prefixo** — o front
usa `DEFAULT_API_URL = '/api'` (`packages/app/src/env.ts`), então o build **não** recebe
`VITE_API_URL`.

## `.env` de produção

Mesmas chaves do `.env.example`, com: `PORT=3030`,
`CORS_ORIGIN=https://clubelivro.vitorbaradelli.com`, `JWT_SECRET` e VAPID gerados no
servidor, e **`NOTIFICATIONS_CRON=on`** — há uma instância só, então o lembrete roda dentro
da API (`docs/SETUP.md`, seção 3). Com duas instâncias, desligue e use cron externo.

⚠️ **Não troque as chaves VAPID** sem motivo: cada aparelho inscrito no push está preso à
chave pública atual, e trocar desinscreve todo mundo em silêncio.

## Operação

```bash
ssh devocional
pm2 logs clube-api                     # logs da API
pm2 restart clube-api --update-env     # depois de editar o .env
curl -s http://127.0.0.1:3030/health

# Postgres
cd /var/www/vitor/clube-do-livro
docker exec -it clube_db_prod psql -U clube clube
docker exec clube_db_prod pg_dump -U clube clube > ~/clube-$(date +%F).sql   # backup

# Redefinir a senha do super-admin (o seed NUNCA sobrescreve por padrão)
export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh; nvm use 24
SEED_ADMIN_FORCE_PASSWORD=1 SEED_ADMIN_PASSWORD='nova-senha' \
  corepack pnpm --filter @clube/backend exec prisma db seed
```

Subir o banco do zero (só na primeira vez, ou depois de perder o container):

```bash
cd /var/www/vitor/clube-do-livro
set -a; . /root/.secrets/clube-db.env; set +a
docker compose -f docker-compose.prod.yml up -d
```
