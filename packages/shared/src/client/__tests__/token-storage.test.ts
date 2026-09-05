import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  type ApiResponseLike,
  createApiClient,
  type RequestInitLike,
} from '../api-client';
import {
  createTokenStorage,
  type StorageLike,
  TOKEN_STORAGE_KEY,
} from '../token-storage';

/** Fixture é factory (§7.7): cada teste ganha o seu mapa. */
function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
  entries: () => Record<string, string>;
} {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    entries: () => Object.fromEntries(map),
  };
}

/**
 * O Safari em aba privada lança em `setItem`, e há navegador que lança até em
 * `getItem` quando o usuário bloqueia armazenamento do site.
 */
function throwingStorage(): StorageLike {
  const boom = (): never => {
    throw new DOMExceptionLike('QuotaExceededError');
  };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

class DOMExceptionLike extends Error {}

describe('createTokenStorage', () => {
  it('writes the token under a named constant key (rule 10)', () => {
    const storage = memoryStorage();

    createTokenStorage(storage).set('token-abc');

    // A chave é asserida pelo VALOR, não por `TOKEN_STORAGE_KEY`: senão um
    // rename da constante mudaria o que já está gravado no navegador de todo
    // mundo e o teste continuaria verde.
    expect(storage.entries()).toEqual({ 'clube.token': 'token-abc' });
    expect(TOKEN_STORAGE_KEY).toBe('clube.token');
  });

  it('reads back what was written (rule 10)', () => {
    const tokens = createTokenStorage(memoryStorage());

    tokens.set('token-abc');

    expect(tokens.get()).toBe('token-abc');
  });

  it('reads a token that was already there (rule 10)', () => {
    const tokens = createTokenStorage(
      memoryStorage({ 'clube.token': 'token-de-ontem' }),
    );

    expect(tokens.get()).toBe('token-de-ontem');
  });

  it('gives null when there is no token (rule 10)', () => {
    expect(createTokenStorage(memoryStorage()).get()).toBeNull();
  });

  it('clears the token and leaves nothing behind (rule 10)', () => {
    const storage = memoryStorage({ 'clube.token': 'token-abc' });
    const tokens = createTokenStorage(storage);

    tokens.clear();

    expect(tokens.get()).toBeNull();
    expect(storage.entries()).toEqual({});
  });

  it('does not touch other keys of the storage (rule 10)', () => {
    const storage = memoryStorage({ 'clube.theme': 'dark' });

    createTokenStorage(storage).clear();

    expect(storage.entries()).toEqual({ 'clube.theme': 'dark' });
  });

  it('survives a storage that throws on read (rule 11)', () => {
    const tokens = createTokenStorage(throwingStorage());

    // O app precisa ABRIR mesmo sem armazenamento — aqui ele apenas não tem
    // sessão salva.
    expect(tokens.get()).toBeNull();
  });

  it('survives a storage that throws on write (rule 11)', () => {
    const tokens = createTokenStorage(throwingStorage());

    expect(() => tokens.set('token-abc')).not.toThrow();
  });

  it('survives a storage that throws on clear (rule 11)', () => {
    const tokens = createTokenStorage(throwingStorage());

    expect(() => tokens.clear()).not.toThrow();
  });

  it('the api client sees a token stored after it was created (rule 12)', async () => {
    const calls: RequestInitLike[] = [];
    const response: ApiResponseLike = {
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
    };
    const tokens = createTokenStorage(memoryStorage());
    const client = createApiClient({
      baseUrl: 'https://api.exemplo.com',
      getToken: () => tokens.get(),
      onUnauthorized: () => undefined,
      fetchImpl: (_url, init) => {
        calls.push(init);
        return Promise.resolve(response);
      },
    });
    const schema = z.object({ ok: z.boolean() });

    await client.get('/me', schema);
    tokens.set('token-do-login');
    await client.get('/me', schema);

    expect(calls.map((init) => init.headers['Authorization'])).toEqual([
      undefined,
      'Bearer token-do-login',
    ]);
  });
});
