import {
  type LoginBody,
  loginResponseSchema,
  loginSchema,
} from '@clube/shared';
import { Button, Field } from '@clube/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { destinationFrom } from '../auth/require-auth';
import { Screen } from './chrome';
import {
  fieldMessage,
  type FormMessage,
  formMessage,
  type MessageKey,
  resolveApiError,
  type StatusMessages,
} from './form-errors';
import { FORM_ERROR_CLASS, TEXT_INPUT_CLASS } from './form-styles';

/**
 * A tela de entrada — a primeira tela de produto do projeto.
 *
 * Três decisões que valem a leitura antes de mexer:
 *
 * 1. **O schema vem de `shared`** (`loginSchema`). Não existe schema de
 *    formulário no app: o mesmo objeto valida a borda do backend, tipa o
 *    `useForm` e é o que o `zodResolver` roda no navegador. Duplicá-lo aqui
 *    faria o front recusar o que o back aceita, ou o contrário, e a
 *    divergência só apareceria em produção.
 * 2. **O cliente é o `publicApi`**, sem `onUnauthorized` — senão errar a senha
 *    (401) dispararia o `signOut()`. Ver o docblock de `AuthValue.publicApi`.
 * 3. **Nada que a API escreveu aparece na tela.** Todo erro passa por
 *    `resolveApiError` → chave → `t()`.
 */

/** Os campos DESTE formulário: é o filtro do `details[].path` da API. */
const FIELDS: readonly string[] = ['email', 'password'];

/**
 * Campo inválido → chave. Nunca `errors.email.message`, que com o
 * `zodResolver` é a frase do Zod **em inglês**.
 *
 * A frase do comprimento mínimo não entra aqui de propósito: o `loginSchema`
 * só exige senha não vazia, e "Confira a senha" é o que serve para os dois
 * casos (vazia, ou digitada com o Caps Lock).
 */
const FIELD_KEYS: Readonly<Record<string, MessageKey>> = {
  email: 'errors.fields.email',
  password: 'errors.fields.password',
};

/**
 * O 401 do login não é `errors.unauthorized` ("Sua sessão terminou. Entre
 * outra vez.") — quem está digitando a senha não tem sessão nenhuma para ter
 * terminado. É a única sobrescrita de que esta tela precisa: 400 com `details`
 * marca o campo, e o resto (rede, 500) já tem chave genérica certa.
 */
const BY_STATUS: StatusMessages = {
  401: { key: 'pages.login.invalidCredentials' },
};

export function LoginPage() {
  const { t } = useTranslation();
  const { publicApi, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [apiMessage, setApiMessage] = useState<FormMessage | undefined>(
    undefined,
  );

  const { formState, handleSubmit, register } = useForm<LoginBody>({
    resolver: zodResolver(loginSchema),
    // Vazio e não `undefined`: um `input` sem `value` inicial vira controlado
    // no primeiro caractere e o React reclama no console.
    defaultValues: { email: '', password: '' },
  });

  async function submit(values: LoginBody): Promise<void> {
    setApiMessage(undefined);
    try {
      const { token } = await publicApi.post(
        '/auth/login',
        values,
        loginResponseSchema,
      );
      signIn(token);
      // O DESTINO PRESERVADO (regra 2). Sem `from`, a home. `replace` para o
      // botão "voltar" não devolver a pessoa ao login que ela já venceu.
      navigate(destinationFrom(location.state), { replace: true });
    } catch (error) {
      setApiMessage(
        resolveApiError(error, { fields: FIELDS, byStatus: BY_STATUS }),
      );
    }
  }

  const { errors, isSubmitting } = formState;
  const messageOf = (field: string, invalid: boolean): string | undefined =>
    fieldMessage(t, field, invalid, FIELD_KEYS, apiMessage);
  const formLevel = formMessage(t, apiMessage);

  /*
    ⚠️ O CROMO VEM DO `./chrome` desde a rodada de correção da Tarefa 25: esta
    `<section>` era **byte-idêntica** à do `accept-invite.tsx`, e as duas
    juntas eram a 6ª e a 7ª cópia do mesmo `<section>` + `h1`. `width="entry"`
    é a coluna estreita das telas de entrada (formulário curto, nenhuma lista).
  */
  return (
    <Screen spacing="airy" title={t('pages.login.title')} width="entry">
      {/*
        `noValidate`: sem ele o navegador barra o envio com a bolha nativa dele
        ("Please fill out this field") — texto que não passa pelo nosso
        catálogo e que muda de idioma com o navegador, não com o app.
      */}
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => void handleSubmit(submit)(event)}
      >
        <Field
          error={messageOf('email', errors.email !== undefined)}
          label={t('pages.login.email')}
        >
          {(control) => (
            <input
              {...control}
              {...register('email')}
              // Decisão F: sem `autoComplete` o gerenciador de senha não
              // oferece salvar, e a pessoa digita a senha toda noite.
              autoComplete="email"
              className={TEXT_INPUT_CLASS}
              inputMode="email"
              type="email"
            />
          )}
        </Field>

        <Field
          error={messageOf('password', errors.password !== undefined)}
          label={t('pages.login.password')}
        >
          {(control) => (
            <input
              {...control}
              {...register('password')}
              autoComplete="current-password"
              className={TEXT_INPUT_CLASS}
              type="password"
            />
          )}
        </Field>

        {formLevel !== undefined ? (
          // `role="alert"` aqui e NÃO no `Field`: a mensagem do campo já é
          // lida pelo `aria-describedby` quando o foco chega nele, mas esta
          // aparece longe do foco e ninguém a ouviria sem o anúncio.
          <p className={FORM_ERROR_CLASS} role="alert">
            {formLevel}
          </p>
        ) : null}

        {/*
          REGRA 10: `loading` desabilita, e é isso que impede o duplo envio de
          virar dois `POST /auth/login`.
        */}
        <Button loading={isSubmitting} size="lg" type="submit">
          {t('pages.login.submit')}
        </Button>
      </form>
    </Screen>
  );
}
