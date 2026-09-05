import { buildServer } from './server';

const port = Number(process.env['PORT'] ?? 3333);

buildServer()
  .then((app) => app.listen({ port, host: '0.0.0.0' }))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
