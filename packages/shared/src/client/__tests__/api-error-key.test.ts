import { describe, expect, it } from 'vitest';

import { ApiError, NETWORK_ERROR_STATUS } from '../api-client';
import { API_ERROR_KEYS, apiErrorKey } from '../api-error-key';

/** Fixture é factory (§7.7). */
function anApiError(overrides: {
  status: number;
  error?: string;
  details?: ReadonlyArray<{ path: string; message: string }>;
}): ApiError {
  return new ApiError({
    status: overrides.status,
    error: overrides.error ?? 'Bad Request',
    ...(overrides.details ? { details: overrides.details } : {}),
  });
}

/**
 * Uma chave de i18n do projeto: segmentos em inglês, camelCase, separados por
 * ponto. Nenhum espaço — texto para humano sempre tem.
 */
const I18N_KEY = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;

describe('apiErrorKey', () => {
  it('gives a key, never a sentence (rule 17)', () => {
    const key = apiErrorKey(
      anApiError({
        status: 400,
        error: 'Bad Request',
        details: [{ path: 'email', message: 'Invalid email' }],
      }),
    );

    expect(key).toMatch(I18N_KEY);
  });

  it('never echoes the raw error text of the API (rule 18)', () => {
    const error = anApiError({
      status: 409,
      error: 'Email already in use',
    });

    const key = apiErrorKey(error);

    expect(key).not.toBe(error.error);
    expect(key).not.toBe(error.message);
    expect(key).not.toContain('Email already in use');
  });

  it("never echoes Zod's English message from details (rule 18)", () => {
    const key = apiErrorKey(
      anApiError({
        status: 400,
        details: [
          {
            path: 'password',
            message: 'String must contain at least 8 character(s)',
          },
        ],
      }),
    );

    // É o sintoma exato que a spec descreve: a pessoa vendo a mensagem do Zod
    // em inglês no meio de uma tela em português.
    expect(key).not.toContain('String must contain');
    expect(key).toMatch(I18N_KEY);
  });

  it.each([
    ['email', 'errors.fields.email'],
    ['password', 'errors.fields.password'],
    ['title', 'errors.fields.title'],
    ['month', 'errors.fields.month'],
    ['doc', 'errors.fields.doc'],
    ['planItems', 'errors.fields.planItems'],
  ])('maps the known path %s to its own key (rule 19)', (path, expected) => {
    expect(
      apiErrorKey(
        anApiError({ status: 400, details: [{ path, message: 'Required' }] }),
      ),
    ).toBe(expected);
  });

  it.each([
    ['planItems.0.date', 'errors.fields.planItem.date'],
    ['planItems.17.title', 'errors.fields.planItem.title'],
    ['planItems.3.reference', 'errors.fields.planItem.reference'],
  ])(
    'maps the indexed path %s to the key of the field, not of the row (rule 19)',
    (path, expected) => {
      // Um plano de 30 dias produziria 30 chaves diferentes se o índice
      // entrasse na chave — e nenhuma delas estaria no catálogo.
      expect(
        apiErrorKey(
          anApiError({
            status: 400,
            details: [{ path, message: 'Invalid date' }],
          }),
        ),
      ).toBe(expected);
    },
  );

  it.each([
    ['campoQueAindaNaoExiste'],
    // Herdados de `Object.prototype`: num mapa-objeto, `mapa['constructor']`
    // NÃO é `undefined` — é a função `Object`. Um `?? PADRAO` não dispara, e
    // `apiErrorKey` devolveria uma FUNÇÃO com o tipo dizendo `string`. Hoje
    // nenhum schema aceita chave vinda do usuário; é uma linha para nunca
    // depender disso.
    ['constructor'],
    ['toString'],
    ['__proto__'],
    ['hasOwnProperty'],
    ['valueOf'],
  ])(
    'falls back to a generic field key when the path %s is unknown (rule 19)',
    (path) => {
      const key = apiErrorKey(
        anApiError({
          status: 400,
          details: [{ path, message: 'Expected string' }],
        }),
      );

      expect(typeof key).toBe('string');
      expect(key).toBe('errors.fields.invalid');
      expect(key).not.toContain('Expected string');
    },
  );

  it('uses the FIRST detail when the API reports several (rule 19)', () => {
    const key = apiErrorKey(
      anApiError({
        status: 400,
        details: [
          { path: 'title', message: 'Required' },
          { path: 'month', message: 'Invalid' },
        ],
      }),
    );

    expect(key).toBe('errors.fields.title');
  });

  it.each([
    [NETWORK_ERROR_STATUS, 'errors.network'],
    [400, 'errors.badRequest'],
    [401, 'errors.unauthorized'],
    [403, 'errors.forbidden'],
    [404, 'errors.notFound'],
    [409, 'errors.conflict'],
    [413, 'errors.payloadTooLarge'],
    [500, 'errors.serverError'],
  ])('maps status %i to its generic key (rule 20)', (status, expected) => {
    expect(apiErrorKey(anApiError({ status, error: 'whatever' }))).toBe(
      expected,
    );
  });

  it('treats an empty details array as no details (rule 20)', () => {
    expect(
      apiErrorKey(anApiError({ status: 404, error: 'Not found', details: [] })),
    ).toBe('errors.notFound');
  });

  it('maps a status nobody mapped to the unknown key, not to text (rule 20)', () => {
    // 418 nunca sai da nossa API — é o caso "um proxy no meio do caminho".
    expect(
      apiErrorKey(anApiError({ status: 418, error: "I'm a teapot" })),
    ).toBe('errors.unknown');
  });

  it('declares every key it can return in API_ERROR_KEYS', () => {
    const produced = [
      apiErrorKey(anApiError({ status: 500 })),
      apiErrorKey(anApiError({ status: 418 })),
      apiErrorKey(
        anApiError({
          status: 400,
          details: [{ path: 'email', message: 'x' }],
        }),
      ),
      apiErrorKey(
        anApiError({
          status: 400,
          details: [{ path: 'nao-existe', message: 'x' }],
        }),
      ),
    ];

    expect(API_ERROR_KEYS.length).toBeGreaterThan(0);
    for (const key of produced) expect(API_ERROR_KEYS).toContain(key);
  });

  it('has no duplicate in API_ERROR_KEYS', () => {
    expect(new Set(API_ERROR_KEYS).size).toBe(API_ERROR_KEYS.length);
  });
});
