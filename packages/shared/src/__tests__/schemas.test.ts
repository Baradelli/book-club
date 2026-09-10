import { describe, expect, it } from 'vitest';

import {
  acceptInviteSchema,
  clubMembersResponseSchema,
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

/*
  Tarefa 26a, regra 7 — a metade do SERIALIZER.

  O `response` schema é fronteira de segurança e não decoração: o
  `serializerCompiler` do Zod é o que corta campo não declarado, e sem ele o
  objeto de domínio inteiro vai para a rede — foi provado com `passwordHash`
  vazando de um `/me` sem schema (§6.1). Estes testes medem o corte no schema;
  a rota mede a mesma propriedade ponta a ponta.
*/
describe('clubMembersResponseSchema', () => {
  const aMember = {
    userId: 'user-1',
    name: 'Maria',
    role: 'MEMBER',
    status: 'ACTIVE',
  };

  it('carries exactly userId, name, role and status', () => {
    const [parsed] = clubMembersResponseSchema.parse([aMember]);

    expect(Object.keys(parsed ?? {}).sort()).toEqual([
      'name',
      'role',
      'status',
      'userId',
    ]);
  });

  // ⚠️ É ESTE o teste que faz do schema uma fronteira: os três campos abaixo
  // existem no `User` do domínio, e nenhum deles pode sair na rede.
  it('strips email, passwordHash and isSuperAdmin', () => {
    const [parsed] = clubMembersResponseSchema.parse([
      {
        ...aMember,
        email: 'maria@exemplo.com',
        passwordHash: '$2b$10$hash',
        isSuperAdmin: true,
      },
    ]);

    expect(parsed).toEqual(aMember);
    expect(parsed).not.toHaveProperty('email');
    expect(parsed).not.toHaveProperty('passwordHash');
    expect(parsed).not.toHaveProperty('isSuperAdmin');
  });

  // Regra 6: o nome anulável atravessa. O backend não inventa fallback.
  it('accepts a null name', () => {
    const [parsed] = clubMembersResponseSchema.parse([
      { ...aMember, name: null },
    ]);

    expect(parsed?.name).toBeNull();
  });

  // `null` NÃO é o mesmo que ausente: o campo é obrigatório e anulável, e é o
  // que impede o backend de deixar de mandá-lo sem o front quebrar em cheio
  // (§6.8 — campo removido é `ApiError` genérico numa tela que funcionava).
  it('rejects a member without the name key', () => {
    const withoutName = {
      userId: aMember.userId,
      role: aMember.role,
      status: aMember.status,
    };

    expect(clubMembersResponseSchema.safeParse([withoutName]).success).toBe(
      false,
    );
  });

  // Quem SAIU do clube continua na lista, com o status que diz isso: é o que a
  // tela usa para decidir o que vira chip de filtro. → ADR 0002.
  it('accepts the ARCHIVED status of someone who left', () => {
    const [parsed] = clubMembersResponseSchema.parse([
      { ...aMember, status: 'ARCHIVED' },
    ]);

    expect(parsed?.status).toBe('ARCHIVED');
  });

  it.each(['OWNER', 'ADMIN', 'MEMBER'])('accepts the role %s', (role) => {
    expect(
      clubMembersResponseSchema.safeParse([{ ...aMember, role }]).success,
    ).toBe(true);
  });

  it.each([
    ['a role outside the enum', { role: 'SUPERVISOR' }],
    ['a status outside the enum', { status: 'DELETED' }],
    ['a numeric userId', { userId: 7 }],
    ['a numeric name', { name: 7 }],
  ])('rejects %s', (_label, override) => {
    expect(
      clubMembersResponseSchema.safeParse([{ ...aMember, ...override }])
        .success,
    ).toBe(false);
  });

  it('accepts an empty list', () => {
    expect(clubMembersResponseSchema.parse([])).toEqual([]);
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
