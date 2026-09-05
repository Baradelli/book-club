import bcrypt from 'bcryptjs';

import type { PasswordHasher } from '../usecases/ports/password-hasher';

export const ROUNDS = 10;

export class BcryptPasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, ROUNDS);
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
