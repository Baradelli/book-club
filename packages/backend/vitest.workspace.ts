import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['src/**/*.test.ts'],
      exclude: ['src/**/*.integration.test.ts'],
      environment: 'node',
    },
  },
  {
    // Um fork só: os testes de contrato falam com o mesmo Postgres e criam
    // fixtures com ids próprios — rodar em paralelo embaralharia a limpeza.
    test: {
      name: 'integration',
      include: ['src/**/*.integration.test.ts'],
      environment: 'node',
      poolOptions: { forks: { singleFork: true } },
    },
  },
]);
