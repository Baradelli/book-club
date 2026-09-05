import { InvalidCredentialsError } from '../domain/errors';
import { normalizeEmail } from '../domain/normalize-email';
import type { PasswordHasher } from './ports/password-hasher';
import type { UserRepository } from './ports/user-repository';

export interface AuthenticateUserInput {
  email: string;
  password: string;
}

export interface AuthenticateUserOutput {
  userId: string;
}

// Uma mensagem só para as três causas: conta inexistente, senha errada e
// pessoa sem senha definida. Distinguir vazaria quais e-mails têm conta.
const GENERIC_MESSAGE = 'invalid email or password';

/**
 * Hash bcrypt REAL de custo 10, de uma senha que ninguém usa. Serve para o
 * `compare` rodar mesmo quando não há usuário (ou não há senha), para que os
 * três caminhos de falha custem o mesmo tempo.
 *
 * Sem isto o caminho "conta não existe" retorna antes do bcrypt e fica ~35x
 * mais rápido — o que torna a existência de uma conta descobrível por
 * cronometragem, sem precisar de nenhuma resposta diferente.
 *
 * Tem de ser um hash de verdade: contra uma string qualquer o bcrypt falha
 * rápido e o vazamento continua.
 */
const DUMMY_HASH =
  '$2a$10$YBD0pgxZUMPgsjFUhvi1veoG/pkPhE5q5Zv4MN2YaUaryZC/rS1Ha';

export class AuthenticateUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: AuthenticateUserInput): Promise<AuthenticateUserOutput> {
    const email = normalizeEmail(input.email);
    const user = await this.users.byEmail(email);

    // Compara SEMPRE, mesmo sem usuário: é o que iguala o tempo dos três
    // caminhos de falha. A decisão vem depois, sobre os três fatos juntos.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const matches = await this.hasher.compare(input.password, hash);

    if (!user || user.passwordHash === null || !matches) {
      throw new InvalidCredentialsError(GENERIC_MESSAGE);
    }

    // Só o id: quem assina o JWT é a borda.
    return { userId: user.id };
  }
}
