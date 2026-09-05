import { describe, expect, it } from 'vitest';

import { PasswordHasherFake } from '../password-hasher-fake';

// O formato `hashed:<senha>` é o que os testes de acceptInvite afirmam para
// provar que a senha nunca é persistida em claro.
describe('PasswordHasherFake', () => {
  it('hashes with the hashed: prefix', async () => {
    const hasher = new PasswordHasherFake();

    await expect(hasher.hash('senha-secreta')).resolves.toBe(
      'hashed:senha-secreta',
    );
  });

  it('never returns the plain password as the hash', async () => {
    const hasher = new PasswordHasherFake();

    await expect(hasher.hash('senha-secreta')).resolves.not.toBe(
      'senha-secreta',
    );
  });

  it('compares a matching password', async () => {
    const hasher = new PasswordHasherFake();
    const hash = await hasher.hash('senha-secreta');

    await expect(hasher.compare('senha-secreta', hash)).resolves.toBe(true);
  });

  it('rejects a password that does not match', async () => {
    const hasher = new PasswordHasherFake();
    const hash = await hasher.hash('senha-secreta');

    await expect(hasher.compare('outra-senha', hash)).resolves.toBe(false);
  });
});
