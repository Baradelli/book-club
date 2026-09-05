import { ApiError, NETWORK_ERROR_STATUS } from '@clube/shared/client';
import { pt } from '@clube/shared/locales';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../i18n';
import {
  fieldMessage,
  type FormMessage,
  formMessage,
  messageFor,
  type MessageKey,
  resolveApiError,
} from '../form-errors';
import { memoryStorage } from './harness';

/**
 * O TRADUTOR DE ERRO DA API — §6.2 e §6.8, o assunto central da Tarefa 15.
 *
 * Aqui é onde as regras 19, 20 e 21 são DECIDÍVEIS: o `t()` real, o
 * `apiErrorKey` real, e nenhum DOM no meio. As telas provam o elo (o campo
 * certo fica marcado); este arquivo prova a tradução.
 */

/** O `t` de verdade, com o catálogo `pt` — não um dublê que devolve a chave. */
function translator() {
  return createI18n(memoryStorage({ 'clube.locale': 'pt' })).t;
}

/** Fixture é factory (§7.7). */
function apiError(
  status: number,
  error: string,
  details?: ReadonlyArray<{ path: string; message: string }>,
): ApiError {
  return new ApiError({
    status,
    error,
    ...(details ? { details } : {}),
  });
}

/**
 * Os dois mapas eram `const` de módulo compartilhadas por vinte testes — o
 * estado escondido que o §6.6/§7.7 proíbe: `readonly` e `Readonly<>` são do
 * COMPILADOR, e um teste que os mutasse por uma variável alargada (ou um
 * `resolveApiError` futuro que ordenasse `fields` no lugar) contaminaria os
 * outros dezenove, na ordem em que o vitest resolvesse rodá-los. Factory.
 */
function loginFields(): readonly string[] {
  return ['email', 'password'];
}

function fieldKeys(): Readonly<Record<string, MessageKey>> {
  return {
    email: 'errors.fields.email',
    password: 'errors.fields.password',
  };
}

describe('resolveApiError (rules 19, 20, 21)', () => {
  it('points a known details path at that very field (rule 20)', () => {
    const resolved = resolveApiError(
      apiError(400, 'Bad Request', [
        { path: 'email', message: 'Invalid email' },
      ]),
      { fields: loginFields() },
    );

    expect(resolved).toEqual<FormMessage>({
      key: 'errors.fields.email',
      field: 'email',
    });
  });

  it('points the password path at the password field, not at the first one', () => {
    // O par do teste acima: sem ele, um mapeamento que devolvesse SEMPRE
    // `email` passaria — e a mensagem apareceria no campo errado.
    const resolved = resolveApiError(
      apiError(400, 'Bad Request', [
        { path: 'password', message: 'String must contain at least 1' },
      ]),
      { fields: loginFields() },
    );

    expect(resolved).toEqual<FormMessage>({
      key: 'errors.fields.password',
      field: 'password',
    });
  });

  it('keeps a details path that is not a field of this form off the fields', () => {
    // O `code` do convite vem da URL e NÃO tem `Field` na tela. Marcá-lo como
    // erro de campo esconderia a mensagem: não há onde mostrá-la.
    const resolved = resolveApiError(
      apiError(400, 'Bad Request', [
        { path: 'code', message: 'String must contain at least 1' },
      ]),
      { fields: loginFields() },
    );

    expect(resolved.field).toBeUndefined();
    expect(resolved.key).toBe('errors.fields.code');
  });

  it('lets the details win over the status override', () => {
    // A precedência: o `details` é a única informação que sabe QUAL campo, e
    // um override por status é sempre mais grosso que ele.
    const resolved = resolveApiError(
      apiError(400, 'Bad Request', [
        { path: 'email', message: 'Invalid email' },
      ]),
      {
        fields: loginFields(),
        byStatus: { 400: { key: 'errors.badRequest' } },
      },
    );

    expect(resolved.field).toBe('email');
  });

  it('uses the screen override for a status that has one', () => {
    const resolved = resolveApiError(apiError(401, 'Unauthorized'), {
      fields: loginFields(),
      byStatus: { 401: { key: 'pages.login.invalidCredentials' } },
    });

    expect(resolved).toEqual<FormMessage>({
      key: 'pages.login.invalidCredentials',
    });
  });

  it('falls back to the generic key of apiErrorKey when there is no override', () => {
    const resolved = resolveApiError(apiError(500, 'Internal Server Error'), {
      fields: loginFields(),
      byStatus: { 401: { key: 'pages.login.invalidCredentials' } },
    });

    expect(resolved).toEqual<FormMessage>({ key: 'errors.serverError' });
  });

  it('distinguishes a network failure from a server error (rule 9)', () => {
    // `status: 0` é o "não chegou" do cliente HTTP (Tarefa 12, decisão G), e a
    // pessoa precisa saber que o problema é a internet dela.
    const resolved = resolveApiError(
      apiError(NETWORK_ERROR_STATUS, 'Network request failed'),
      { fields: loginFields() },
    );

    expect(resolved).toEqual<FormMessage>({ key: 'errors.network' });
  });

  it('gives an unmapped status a translated generic key, never English (rule 21)', () => {
    const resolved = resolveApiError(apiError(418, "I'm a teapot"), {
      fields: loginFields(),
    });

    // A chave EXISTE no catálogo, e a prova de que ela existe é o
    // `messageFor` abaixo devolver a frase e não a chave — não um
    // `pt.errors.unknown.length > 0` daqui, que é propriedade DO CATÁLOGO e já
    // tem acusador em `shared/src/locales/__tests__/catalogs.test.ts` (§7.2).
    expect(resolved).toEqual<FormMessage>({ key: 'errors.unknown' });
  });

  it('turns something that is not an ApiError into the generic key', () => {
    // Um `TypeError` nosso não pode virar `String(error)` na tela.
    const resolved = resolveApiError(new Error('boom'), {
      fields: loginFields(),
    });

    expect(resolved).toEqual<FormMessage>({ key: 'errors.unknown' });
  });

  it('never returns the text the API wrote (rule 19)', () => {
    /*
      A prova negativa, sobre TODOS os caminhos de uma vez: as frases abaixo
      são as que a API realmente escreve — o texto genérico por status
      (§6.2), a mensagem do Zod e a mensagem interna de uma usecase — e
      nenhuma delas pode sair daqui.
    */
    const sentences = [
      'Unauthorized',
      'Conflict',
      'Gone',
      'Not found',
      'Bad Request',
      'password must have at least 8 characters',
    ];

    const keys = sentences.flatMap((sentence) => [
      resolveApiError(apiError(401, sentence), { fields: loginFields() }).key,
      resolveApiError(
        apiError(400, sentence, [{ path: 'email', message: sentence }]),
        { fields: loginFields() },
      ).key,
    ]);

    for (const key of keys) {
      expect(sentences).not.toContain(key);
      // E é CHAVE, não frase: toda chave do catálogo tem ponto e não tem
      // espaço.
      expect(key).toMatch(/^[a-z][a-zA-Z.]*$/u);
    }
  });
});

describe('messageFor', () => {
  it('translates a key that exists', () => {
    expect(messageFor(translator(), 'errors.network')).toBe(pt.errors.network);
  });

  it('never renders the key itself when the key is missing', () => {
    /*
      ⚠️ ESTE É O ACUSADOR do `defaultValue` de `messageFor`, e ele existe
      porque o buraco é real: o `FormMessage.key` é `string` (vem do
      `apiErrorKey`, que mora em `shared` e não conhece o catálogo tipado do
      app), então o compilador NÃO garante que ela exista. Sem o
      `defaultValue`, o i18next renderiza a própria chave —
      `errors.fields.email` no lugar da frase — e ninguém percebe até um
      usuário reclamar.
    */
    const message = messageFor(translator(), 'chave.que.nao.existe');

    expect(message).toBe(pt.errors.unknown);
    expect(message).not.toContain('chave.que.nao.existe');
  });

  it('never renders the i18next diagnostic for a key that points at an object', () => {
    /*
      ⚠️ O `defaultValue` NÃO pega este caso, e é medido: `errors.fields` é um
      NÓ do catálogo (tem filhos), e o i18next não trata isso como chave
      faltando — ele devolve o diagnóstico dele,
      *"key 'errors.fields (pt)' returned an object instead of string."*, em
      inglês e na tela. É a regra 19 furada por dentro do nosso próprio código,
      e o docblock de `messageFor` prometia "nunca a chave crua" (não é a
      chave: é pior).

      Inalcançável hoje — o `apiErrorKey` só devolve folha —, mas o
      `FormMessage.key` é `string` de propósito, e é exatamente a porta por
      onde uma chave de nó entraria.
    */
    const message = messageFor(translator(), 'errors.fields');

    expect(message).toBe(pt.errors.unknown);
    expect(message).not.toContain('returned an object');
  });
});

describe('fieldMessage', () => {
  it('gives the field its own translated message when the field is invalid', () => {
    const t = translator();

    expect(fieldMessage(t, 'email', true, fieldKeys(), undefined)).toBe(
      pt.errors.fields.email,
    );
  });

  it('says nothing about a field that is neither invalid nor named by the API', () => {
    const t = translator();

    expect(
      fieldMessage(t, 'password', false, fieldKeys(), {
        key: 'errors.fields.email',
        field: 'email',
      }),
    ).toBeUndefined();
  });

  it('shows the API message on the field the API named', () => {
    const t = translator();

    expect(
      fieldMessage(t, 'email', false, fieldKeys(), {
        key: 'pages.acceptInvite.alreadyInClub',
        field: 'email',
      }),
    ).toBe(pt.pages.acceptInvite.alreadyInClub);
  });

  it('lets the local validation win over the API message on the same field', () => {
    // A pessoa levou um 409 no e-mail, foi corrigir e apagou o `@`: a frase
    // que ela precisa ler é a do campo inválido AGORA.
    const t = translator();

    expect(
      fieldMessage(t, 'email', true, fieldKeys(), {
        key: 'pages.acceptInvite.alreadyInClub',
        field: 'email',
      }),
    ).toBe(pt.errors.fields.email);
  });

  it('falls back to the generic field message for a field with no key mapped', () => {
    const t = translator();

    expect(fieldMessage(t, 'timezone', true, fieldKeys(), undefined)).toBe(
      pt.errors.fields.invalid,
    );
  });
});

describe('formMessage', () => {
  it('shows a message that belongs to no field', () => {
    expect(
      formMessage(translator(), { key: 'pages.login.invalidCredentials' }),
    ).toBe(pt.pages.login.invalidCredentials);
  });

  it('stays silent when the message already belongs to a field', () => {
    // Senão a mesma frase apareceria duas vezes: no campo e no topo.
    expect(
      formMessage(translator(), {
        key: 'errors.fields.email',
        field: 'email',
      }),
    ).toBeUndefined();
  });

  it('stays silent when there is no error at all', () => {
    expect(formMessage(translator(), undefined)).toBeUndefined();
  });
});
