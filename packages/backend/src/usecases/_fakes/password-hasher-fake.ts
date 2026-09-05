import type { PasswordHasher } from '../ports/password-hasher';

// O bcrypt real é adapter da Tarefa 03. Aqui o hash é reconhecível de fora
// (`hashed:<senha>`) para o teste provar que a senha nunca foi salva em claro.
export class PasswordHasherFake implements PasswordHasher {
  private hashCount = 0;
  private compareCount = 0;

  async hash(plain: string): Promise<string> {
    this.hashCount += 1;
    return `hashed:${plain}`;
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    this.compareCount += 1;
    return hash === `hashed:${plain}`;
  }

  /** Quantas vezes o `compare` foi chamado — o login prova por aqui que
   *  compara SEMPRE, inclusive quando a conta não existe. */
  get compareCalls(): number {
    return this.compareCount;
  }

  get hashCalls(): number {
    return this.hashCount;
  }
}
