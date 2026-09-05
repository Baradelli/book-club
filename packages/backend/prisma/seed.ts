import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { normalizeEmail } from '../src/domain/normalize-email';
import { DEFAULT_SETTINGS } from '../src/domain/settings';
import { BcryptPasswordHasher } from '../src/repositories/bcrypt-password-hasher';

// Cria SÓ o super-admin e o Settings dele. Sem clube, livro ou nota: o clube
// se cria pela interface, que é o fluxo que precisa funcionar.
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const rawEmail = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!rawEmail || !password) {
    throw new Error(
      'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required (see packages/backend/.env)',
    );
  }

  const email = normalizeEmail(rawEmail);
  const hasher = new BcryptPasswordHasher();
  const force = process.env.SEED_ADMIN_FORCE_PASSWORD === '1';

  const existing = await prisma.user.findUnique({ where: { email } });

  // A senha é definida na criação e quando a pessoa ainda não tem nenhuma.
  // Um seed repetido NÃO sobrescreve senha existente: se o dono já trocou a
  // dele pelo app, o seed não a joga fora. SEED_ADMIN_FORCE_PASSWORD=1 é o
  // escape declarado — é o único caminho de reset até o MVP 4.
  const keepsExistingPassword =
    existing !== null && existing.passwordHash !== null && !force;

  const freshHash = await hasher.hash(password);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      id: randomUUID(),
      email,
      name: 'Super Admin',
      passwordHash: freshHash,
      isSuperAdmin: true,
    },
    update: {
      isSuperAdmin: true,
      ...(keepsExistingPassword ? {} : { passwordHash: freshHash }),
    },
  });

  const settings = await prisma.settings.upsert({
    where: { userId: user.id },
    create: { id: randomUUID(), userId: user.id, ...DEFAULT_SETTINGS },
    update: {},
  });

  const totalUsers = await prisma.user.count();
  const totalSettings = await prisma.settings.count();

  const lines = [
    existing ? 'super-admin already existed (kept)' : 'super-admin created',
    `  user:     ${user.email} (${user.id}) isSuperAdmin=${user.isSuperAdmin}`,
    `  settings: ${settings.id} timezone=${settings.timezone}`,
    `  totals:   users=${totalUsers} settings=${totalSettings}`,
  ];

  if (keepsExistingPassword) {
    lines.push(
      '',
      '  WARNING: SEED_ADMIN_PASSWORD was IGNORED.',
      '  This account already has a password, and the seed never overwrites one',
      '  (the owner may have changed it in the app). Editing the .env and re-running',
      '  the seed will NOT change it.',
      '  To force a reset: SEED_ADMIN_FORCE_PASSWORD=1 pnpm prisma:seed',
    );
  } else if (existing) {
    lines.push('', '  password was RESET (SEED_ADMIN_FORCE_PASSWORD=1).');
  }

  console.log(lines.join('\n'));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
