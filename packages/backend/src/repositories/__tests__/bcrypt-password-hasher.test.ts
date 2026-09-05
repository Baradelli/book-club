import { describe, expect, it } from 'vitest';

import { BcryptPasswordHasher, ROUNDS } from '../bcrypt-password-hasher';

const PASSWORD = 'senha-forte';

describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher();

  it('uses 10 rounds', () => {
    expect(ROUNDS).toBe(10);
  });

  it('never returns the password as the hash', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(hash).not.toBe(PASSWORD);
    expect(hash).not.toContain(PASSWORD);
  });

  it('produces a bcrypt hash carrying the cost', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(hash).toMatch(/^\$2[aby]\$10\$/);
  });

  it('accepts the right password', async () => {
    const hash = await hasher.hash(PASSWORD);

    await expect(hasher.compare(PASSWORD, hash)).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hasher.hash(PASSWORD);

    await expect(hasher.compare('outra-senha', hash)).resolves.toBe(false);
  });

  // Salt por hash: a mesma senha não gera o mesmo hash duas vezes.
  it('salts each hash', async () => {
    const first = await hasher.hash(PASSWORD);
    const second = await hasher.hash(PASSWORD);

    expect(first).not.toBe(second);
    await expect(hasher.compare(PASSWORD, second)).resolves.toBe(true);
  });
});
