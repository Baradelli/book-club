import { describe, expect, it } from 'vitest';

import {
  acceptInviteSchema,
  createClubSchema,
  createInviteSchema,
  errorSchema,
  loginSchema,
} from '../index';

describe('acceptInviteSchema', () => {
  it('rejects a 7-character password', () => {
    const result = acceptInviteSchema.safeParse({
      email: 'maria@exemplo.com',
      password: '1234567',
    });

    expect(result.success).toBe(false);
  });

  it('accepts an 8-character password', () => {
    const result = acceptInviteSchema.safeParse({
      email: 'maria@exemplo.com',
      password: '12345678',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an email without shape', () => {
    const result = acceptInviteSchema.safeParse({
      email: 'nao-e-email',
      password: '12345678',
    });

    expect(result.success).toBe(false);
  });
});

describe('createInviteSchema', () => {
  it("rejects role 'OWNER'", () => {
    const result = createInviteSchema.safeParse({ role: 'OWNER' });

    expect(result.success).toBe(false);
  });

  it.each(['ADMIN', 'MEMBER'])('accepts role %s', (role) => {
    expect(createInviteSchema.safeParse({ role }).success).toBe(true);
  });

  it('accepts an empty body (all fields optional)', () => {
    expect(createInviteSchema.safeParse({}).success).toBe(true);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
  ])('rejects a %s ttlDays', (_label, ttlDays) => {
    expect(createInviteSchema.safeParse({ ttlDays }).success).toBe(false);
  });
});

describe('createClubSchema', () => {
  it('rejects an empty name', () => {
    expect(createClubSchema.safeParse({ name: '' }).success).toBe(false);
  });

  // Nenhum handler aceita userId do corpo: o schema descarta o que não declara.
  it('strips unknown keys such as userId', () => {
    const result = createClubSchema.parse({
      name: 'Clube do Casal',
      userId: 'user-invasor',
      actorUserId: 'user-invasor',
    });

    expect(result).toEqual({ name: 'Clube do Casal' });
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('actorUserId');
  });
});

describe('errorSchema', () => {
  it('carries a message the screen can show', () => {
    expect(errorSchema.parse({ error: 'algo deu errado' })).toEqual({
      error: 'algo deu errado',
    });
  });

  // `details` é opcional: só a classe 400 o preenche.
  it('accepts an error without details', () => {
    expect(errorSchema.parse({ error: 'x' }).details).toBeUndefined();
  });

  it('carries which field failed when there are details', () => {
    const parsed = errorSchema.parse({
      error: 'Bad Request',
      details: [{ path: 'password', message: 'Required' }],
    });

    expect(parsed.details).toEqual([{ path: 'password', message: 'Required' }]);
  });

  it('rejects details that are not path/message pairs', () => {
    expect(
      errorSchema.safeParse({ error: 'x', details: ['password'] }).success,
    ).toBe(false);
  });
});

// O .trim() tem de vir ANTES do .email(): teclado de celular manda espaço no
// fim, e o normalizeEmail do domínio nunca é alcançado se a borda rejeitar.
describe('email trimming at the edge', () => {
  it('accepts a padded email on loginSchema and stores it trimmed', () => {
    const result = loginSchema.safeParse({
      email: '  a@b.com  ',
      password: 'x',
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.email).toBe('a@b.com');
  });

  it('accepts a padded email on acceptInviteSchema and stores it trimmed', () => {
    const result = acceptInviteSchema.safeParse({
      email: '  a@b.com  ',
      password: '12345678',
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.email).toBe('a@b.com');
  });

  it('trims whitespace of every kind', () => {
    const padded = ` 	 maria@exemplo.com 
 `;

    const result = loginSchema.safeParse({ email: padded, password: 'x' });

    expect(result.success && result.data.email).toBe('maria@exemplo.com');
  });

  it('keeps the case (only normalizeEmail lowercases, in the domain)', () => {
    const result = loginSchema.safeParse({
      email: '  MARIA@Exemplo.COM  ',
      password: 'x',
    });

    expect(result.success && result.data.email).toBe('MARIA@Exemplo.COM');
  });

  // Só espaço nas pontas é aparado: lixo no meio continua inválido.
  it('still rejects an email that is not one after trimming', () => {
    expect(
      loginSchema.safeParse({ email: '   nao-e-email   ', password: 'x' })
        .success,
    ).toBe(false);
  });
});
