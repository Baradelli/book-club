// PM2 — processo da API em produção (servidor `devocional`).
// Node 24 roda o TypeScript direto via tsx (`--import tsx`), do mesmo jeito que
// o `pnpm dev:backend` — `@clube/shared` exporta código-fonte TS, então não há
// build intermediário. `--env-file` carrega packages/backend/.env.
// Ver docs/DEPLOY.md.
module.exports = {
  apps: [
    {
      name: 'clube-api',
      cwd: '/var/www/vitor/clube-do-livro/packages/backend',
      script: 'src/http/main.ts',
      interpreter: '/root/.nvm/versions/node/v24.16.0/bin/node',
      interpreter_args: '--import tsx --env-file=.env',
      exec_mode: 'fork',
      // UMA instância só: o lembrete roda dentro do processo
      // (NOTIFICATIONS_CRON=on). Com duas, desligue e use cron externo.
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M',
    },
  ],
};
