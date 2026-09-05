import { beforeEach, describe, expect, it } from 'vitest';

import { InvalidCredentialsError } from '../../domain/errors';
import { aUser } from '../../test-support/builders';
import { PasswordHasherFake } from '../_fakes/password-hasher-fake';
import { UserRepositoryFake } from '../_fakes/user-repository-fake';
import { AuthenticateUser } from '../authenticate-user';

const EMAIL = 'maria@exemplo.com';
const PASSWORD = 'senha-forte';

describe('AuthenticateUser', () => {
  let users: UserRepositoryFake;
  let hasher: PasswordHasherFake;
  let useCase: AuthenticateUser;

  beforeEach(async () => {
    users = new UserRepositoryFake();
    hasher = new PasswordHasherFake();
    useCase = new AuthenticateUser(users, hasher);

    await users.save(
      aUser({
        id: 'user-maria',
        email: EMAIL,
        passwordHash: await hasher.hash(PASSWORD),
      }),
    );
  });

  it('returns the user id for the right credentials', async () => {
    const result = await useCase.execute({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({ userId: 'user-maria' });
  });

  // A emissão do JWT é da borda: o UseCase devolve só o id.
  it('does not return a token', async () => {
    const result = await useCase.execute({ email: EMAIL, password: PASSWORD });

    expect(Object.keys(result)).toEqual(['userId']);
  });

  it('normalizes the email before looking the person up', async () => {
    const result = await useCase.execute({
      email: '  MARIA@Exemplo.COM  ',
      password: PASSWORD,
    });

    expect(result).toEqual({ userId: 'user-maria' });
  });

  it('rejects a wrong password', async () => {
    await expect(
      useCase.execute({ email: EMAIL, password: 'senha-errada' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('rejects an email that does not exist', async () => {
    await expect(
      useCase.execute({ email: 'ninguem@exemplo.com', password: PASSWORD }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  // Pessoa convidada que nunca definiu senha não entra por login.
  it('rejects a person whose passwordHash is null', async () => {
    await users.save(
      aUser({
        id: 'user-sem-senha',
        email: 'sem-senha@exemplo.com',
        passwordHash: null,
      }),
    );

    await expect(
      useCase.execute({ email: 'sem-senha@exemplo.com', password: PASSWORD }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  // Trava a propriedade de tempo sem cronometrar nada (teste de tempo seria
  // instável): o hasher tem de ser chamado nos TRÊS caminhos de falha. Se o
  // caminho "conta não existe" voltasse a retornar antes do bcrypt, a
  // contagem cairia para zero e este teste ficaria vermelho.
  describe('constant work on every failure path', () => {
    it('compares a hash even when the email does not exist', async () => {
      const before = hasher.compareCalls;

      await expect(
        useCase.execute({ email: 'ninguem@exemplo.com', password: PASSWORD }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);

      expect(hasher.compareCalls).toBe(before + 1);
    });

    it('compares a hash when the password is wrong', async () => {
      const before = hasher.compareCalls;

      await expect(
        useCase.execute({ email: EMAIL, password: 'senha-errada' }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);

      expect(hasher.compareCalls).toBe(before + 1);
    });

    it('compares a hash when the person has no password set', async () => {
      await users.save(
        aUser({
          id: 'user-sem-senha',
          email: 'sem-senha@exemplo.com',
          passwordHash: null,
        }),
      );
      const before = hasher.compareCalls;

      await expect(
        useCase.execute({
          email: 'sem-senha@exemplo.com',
          password: PASSWORD,
        }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);

      expect(hasher.compareCalls).toBe(before + 1);
    });

    it('compares exactly once on success too', async () => {
      const before = hasher.compareCalls;

      await useCase.execute({ email: EMAIL, password: PASSWORD });

      expect(hasher.compareCalls).toBe(before + 1);
    });
  });

  // O ponto central: não vazar a existência da conta. As três causas têm de
  // ser indistinguíveis de fora — mesma classe E mesma mensagem.
  it('gives the exact same error for unknown email, wrong password and null hash', async () => {
    await users.save(
      aUser({
        id: 'user-sem-senha',
        email: 'sem-senha@exemplo.com',
        passwordHash: null,
      }),
    );

    const errors = await Promise.all(
      [
        { email: 'ninguem@exemplo.com', password: PASSWORD },
        { email: EMAIL, password: 'senha-errada' },
        { email: 'sem-senha@exemplo.com', password: PASSWORD },
      ].map((input) =>
        useCase.execute(input).then(
          () => null,
          (error: unknown) => error,
        ),
      ),
    );

    const messages = errors.map((error) =>
      error instanceof Error ? error.message : 'not an error',
    );
    expect(new Set(messages).size).toBe(1);
    const names = errors.map((error) =>
      error instanceof Error ? error.name : 'not an error',
    );
    expect(new Set(names)).toEqual(new Set(['InvalidCredentialsError']));
  });
});
