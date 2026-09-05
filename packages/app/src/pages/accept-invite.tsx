import {
  type AcceptInviteBody,
  acceptInviteResponseSchema,
  acceptInviteSchema,
} from '@clube/shared';
import { Button, Field } from '@clube/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { HOME_PATH } from '../auth/require-auth';
import { useActiveClub } from '../club/active-club';
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
 * O aceite de convite: a pessoa abre o link que recebeu no WhatsApp, escolhe a
 * própria senha, e entra no clube (ADR 0003 — não existe cadastro aberto, e
 * ninguém mais conhece a senha dela).
 *
 * ⚠️ ESTE FORMULÁRIO É CEGO, e é decisão (A da Tarefa 15). Não existe
 * `GET /invites/:code` público, então a tela **não sabe** de qual clube é o
 * convite, para quem ele é, nem se ele já venceu — só descobre ao enviar. Foi
 * aceito para o MVP 1 porque o link chega pelo canal de quem convidou, que já
 * disse tudo isso. Fica **registrado como lacuna**: um endpoint de prévia
 * deixaria a tela dizer "Você foi convidada para o Clube do Casal" e recusar
 * código vencido ANTES de a pessoa escolher uma senha. É backend, e o backend
 * está fechado nesta fatia.
 */

const FIELDS: readonly string[] = ['email', 'password', 'name'];

const FIELD_KEYS: Readonly<Record<string, MessageKey>> = {
  email: 'errors.fields.email',
  password: 'errors.fields.password',
  name: 'errors.fields.name',
};

/**
 * ⚠️ 404 E 410 SÃO FRASES DIFERENTES (regra 15). São os dois erros que a
 * pessoa mais vai ver, e as genéricas de `apiErrorKey` não servem: `notFound`
 * é "Não encontramos o que você procurava" (o quê?) e `gone` é "Este link não
 * vale mais" — que é verdade para 404 também, e não distingue "o link está
 * errado" de "o link venceu".
 *
 * ⚠️ O 404 TAMBÉM É AMBÍGUO, e a frase paga por isso: ele sai de
 * `InviteNotFoundError` E de `ClubNotFoundError`. Quando é o clube que não
 * existe mais, o link está CERTO — então a frase não pode mandar conferi-lo com
 * convicção.
 *
 * ⚠️ O 409 ERA AMBÍGUO E DEIXOU DE SER — foi o conserto de backend desta
 * rodada. `InviteAlreadyUsedError` virou **410** (junto de `InviteExpiredError`:
 * "venceu" e "já foi usado" são a mesma frase para quem lê), então o 409 desta
 * rota significa só `DuplicateMembershipError` — este e-mail já é membro ativo
 * deste clube. É o único caso em que marcar o campo de e-mail (regra 16) está
 * correto, e agora é o único que chega aqui.
 *
 * `EmailAlreadyInUseError` — que a spec da regra 16 supõe ser o 409 desta rota
 * — **não é lançado por este caso de uso**: e-mail já cadastrado é o caminho de
 * SUCESSO aqui (a pessoa reaproveita a conta e só ganha o clube novo).
 *
 * ⚠️ E O 401, que a tela de login sobrescreve e esta NÃO sobrescrevia — a
 * assimetria que a auditoria achou. Nenhum 401 sai do `AcceptInvite` (a rota é
 * pública), mas um proxy, um gateway ou o service worker podem produzir um; sem
 * esta entrada, quem NUNCA teve sessão leria "Sua sessão terminou. Entre outra
 * vez." numa tela onde não há sessão nem para onde entrar. `errors.unknown` é a
 * frase honesta: "não foi possível concluir, tente de novo".
 */
const BY_STATUS: StatusMessages = {
  401: { key: 'errors.unknown' },
  404: { key: 'pages.acceptInvite.inviteNotFound' },
  409: { key: 'pages.acceptInvite.alreadyInClub', field: 'email' },
  410: { key: 'pages.acceptInvite.inviteExpired' },
};

export function AcceptInvitePage() {
  const { t } = useTranslation();
  const { publicApi, signIn } = useAuth();
  // A LINHA QUE SEMEIA O CLUBE ATIVO (regra 7 da Tarefa 16, decisão A): quem
  // acabou de aceitar um convite não deve ter de escolher o clube em que
  // acabou de entrar. Era a pendência que a Tarefa 15 registrou.
  const { selectClub } = useActiveClub();
  const navigate = useNavigate();
  const params = useParams();
  const [apiMessage, setApiMessage] = useState<FormMessage | undefined>(
    undefined,
  );

  // REGRA 14: o código vem da URL, nunca de um campo. Ele não é segredo que a
  // pessoa deva digitar — é o que o link já traz.
  const code = params.code ?? '';

  const { formState, handleSubmit, register } = useForm<AcceptInviteBody>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { email: '', password: '', name: '' },
  });

  async function submit(values: AcceptInviteBody): Promise<void> {
    setApiMessage(undefined);
    /*
      Nome em branco é AUSÊNCIA de nome, não nome vazio: `User.name` é nullable
      no banco justamente porque o convite pode criar alguém sem nome.

      ⚠️ E O RAMO É REDUNDANTE, NÃO NECESSÁRIO — a auditoria mediu, e o
      comentário anterior estava factualmente errado. Ele afirmava que "mandar
      `''` faria o backend gravar o vazio e depois normalizá-lo", e o backend
      **nunca grava o vazio**: o `AcceptInvite` normaliza na criação
      (`name: trimmedName ? trimmedName : null`), com teste. Então isto não
      conserta nada do outro lado — o que ele faz é manter o CORPO honesto: o
      request de quem não digitou nome não carrega a chave `name`, e é isso que
      o teste da regra 14 asserta. Fica.
    */
    const name = values.name?.trim();
    const body: AcceptInviteBody =
      name === undefined || name === ''
        ? { email: values.email, password: values.password }
        : { email: values.email, password: values.password, name };

    try {
      // O `code` vai no CAMINHO (`POST /invites/:code/accept`), não no corpo.
      const { token, clubId } = await publicApi.post(
        `/invites/${encodeURIComponent(code)}/accept`,
        body,
        acceptInviteResponseSchema,
      );
      signIn(token);
      /*
        E o `clubId` da resposta DEIXOU DE SER IGNORADO — era a pendência que a
        Tarefa 15 registrou aqui, e a Tarefa 16 a paga. Ele é o clube ativo
        natural de quem acabou de entrar.

        A ordem importa: `signIn` primeiro, porque é ele que faz o
        `ActiveClubProvider` buscar o `/me`; o `selectClub` guarda a escolha, e
        quando a lista chega o clube semeado já é o ativo. E ele NÃO viaja para
        a API — é estado local (`CONTEXT.md`).
      */
      selectClub(clubId);
      navigate(HOME_PATH, { replace: true });
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

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          {t('pages.acceptInvite.title')}
        </h1>
        <p className="text-sm text-muted">
          {t('pages.acceptInvite.description')}
        </p>
      </div>

      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => void handleSubmit(submit)(event)}
      >
        <Field
          error={messageOf('name', errors.name !== undefined)}
          hint={t('pages.acceptInvite.nameHint')}
          label={t('pages.acceptInvite.name')}
        >
          {(control) => (
            <input
              {...control}
              {...register('name')}
              autoComplete="name"
              className={TEXT_INPUT_CLASS}
              type="text"
            />
          )}
        </Field>

        <Field
          error={messageOf('email', errors.email !== undefined)}
          label={t('pages.acceptInvite.email')}
        >
          {(control) => (
            <input
              {...control}
              {...register('email')}
              autoComplete="email"
              className={TEXT_INPUT_CLASS}
              inputMode="email"
              type="email"
            />
          )}
        </Field>

        <Field
          error={messageOf('password', errors.password !== undefined)}
          // A dica do mínimo de 8 fica no `hint` e não na mensagem de erro: ela
          // é o contexto estável do campo, e precisa estar legível ANTES de a
          // pessoa errar (regra do `Field`, Tarefa 13).
          hint={t('pages.acceptInvite.passwordHint')}
          label={t('pages.acceptInvite.password')}
        >
          {(control) => (
            <input
              {...control}
              {...register('password')}
              // `new-password` e não `current-password`: é o que faz o
              // gerenciador oferecer GERAR uma senha em vez de preencher a
              // antiga.
              autoComplete="new-password"
              className={TEXT_INPUT_CLASS}
              type="password"
            />
          )}
        </Field>

        {formLevel !== undefined ? (
          <p className={FORM_ERROR_CLASS} role="alert">
            {formLevel}
          </p>
        ) : null}

        <Button loading={isSubmitting} size="lg" type="submit">
          {t('pages.acceptInvite.submit')}
        </Button>
      </form>
    </section>
  );
}
