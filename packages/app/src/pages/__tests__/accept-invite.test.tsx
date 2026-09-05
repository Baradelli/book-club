import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { pt } from '@clube/shared/locales';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '../../router';
import {
  alwaysReply,
  BackButton,
  memoryStorage,
  meReply,
  readableText,
  type RecordedRequest,
  renderPage,
  type Reply,
  replyByUrl,
  requestAt,
  requestsTo,
  stubFetch,
} from './harness';

/**
 * O ACEITE DE CONVITE — regras 13 a 19.
 *
 * Os testes entram pelo `AppRoutes`, e não montando a página à mão, porque
 * metade das regras é sobre a ROTA: o `code` que vem da URL (14) e o fato de o
 * endereço `/convite/:code` ser público (a única porta de entrada do sistema,
 * ADR 0003).
 */

const CODE = 'CONVITE-XYZ';
const PATH = `/convite/${CODE}`;

const NAME_LABEL = pt.pages.acceptInvite.name;
const EMAIL_LABEL = pt.pages.acceptInvite.email;
const PASSWORD_LABEL = pt.pages.acceptInvite.password;
const SUBMIT_LABEL = pt.pages.acceptInvite.submit;

/**
 * ⚠️ A RESPOSTA DE SUCESSO COMPLETA, e é factory por causa do §7.1.
 *
 * Quatro testes usavam `alwaysReply({ status: 201, body: {} })`, e a API
 * **nunca** responde isso: o `acceptInviteResponseSchema` de `shared` exige
 * `token` E `clubId`, e o cliente HTTP roda o schema sobre o corpo que voltou
 * (§6.8). Um 201 vazio vira `ApiError` genérico — `errors.unknown` na tela.
 *
 * Hoje era inofensivo (aqueles testes não enviavam o formulário), e é
 * exatamente a infidelidade RESTRITIVA do §7.1: quem copiasse a linha para um
 * teste que envia receberia `errors.unknown` e iria procurar o defeito no
 * `form-errors.ts`, que está certo.
 */
function acceptOk(): Reply {
  return { status: 201, body: { token: 'token-novo', clubId: 'c1' } };
}

interface Filling {
  email: string;
  password: string;
  name?: string;
}

/** Fixture é factory (§7.7), com `overrides`. */
function fill(overrides: Partial<Filling> = {}): void {
  const values: Filling = {
    email: 'maria@clube.test',
    password: 'senha-de-oito',
    ...overrides,
  };

  if (values.name !== undefined) {
    fireEvent.change(screen.getByLabelText(NAME_LABEL), {
      target: { value: values.name },
    });
  }
  fireEvent.change(screen.getByLabelText(EMAIL_LABEL), {
    target: { value: values.email },
  });
  fireEvent.change(screen.getByLabelText(PASSWORD_LABEL), {
    target: { value: values.password },
  });
}

function submitButton(): HTMLElement {
  return screen.getByRole('button', { name: SUBMIT_LABEL });
}

async function submit(): Promise<void> {
  await act(async () => {
    fireEvent.click(submitButton());
  });
}

function describedText(control: HTMLElement): string {
  const ids = control.getAttribute('aria-describedby')?.split(' ') ?? [];
  return ids
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

function locationText(): string {
  return screen.getByTestId('location').textContent ?? '';
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the invite link is the door into the club (rules 14, 18)', () => {
  it('opens the accept screen without a session at all', () => {
    stubFetch(alwaysReply(acceptOk()));

    renderPage(<AppRoutes />, { path: PATH });

    // Fora do `RequireAuth`: quem abre um convite não tem conta ainda. Se esta
    // rota caísse no grupo protegido, o convite mandaria a pessoa para o
    // login, que é a tela onde ela não consegue fazer nada.
    expect(
      screen.queryByRole('heading', { name: pt.pages.acceptInvite.title }),
    ).not.toBeNull();
  });

  it('opens the accept screen even for someone who already has a session', () => {
    stubFetch(alwaysReply(acceptOk()));

    renderPage(<AppRoutes />, {
      path: PATH,
      storage: memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-de-outra-sessao' }),
    });

    // Decisão desta fatia: o aceite fica fora do `RequireAnonymous` também.
    // Quem já tem sessão e abre um link de convite está aceitando um convite —
    // mandá-lo para a home o deixaria sem nenhuma forma de entrar no clube
    // novo, e o link foi entregue a uma pessoa específica, fora do sistema.
    expect(
      screen.queryByRole('heading', { name: pt.pages.acceptInvite.title }),
    ).not.toBeNull();
    expect(
      screen.queryByRole('heading', { name: pt.pages.home.title }),
    ).toBeNull();
  });

  it('takes the code from the URL and never shows it as a field (rule 14)', async () => {
    const calls = stubFetch(alwaysReply(acceptOk()));

    renderPage(<AppRoutes />, { path: PATH });
    fill();
    await submit();

    await waitFor(() => {
      // `requestsTo` e não `calls` inteiro: com o shell carregando o `/me` do
      // clube ativo (Tarefa 16), a sessão que nasce no aceite soma uma
      // requisição ao array. A asserção honesta é sobre O ENDPOINT sob teste.
      expect(requestsTo(calls, '/invites/')).toHaveLength(1);
    });

    const request = requestAt(calls, 0);
    expect(request.method).toBe('POST');
    expect(request.url).toBe(`https://api.teste/invites/${CODE}/accept`);
    // O `code` vai no CAMINHO, e o corpo não o carrega — o
    // `acceptInviteSchema` de `shared` nem o declara.
    expect(request.body).toEqual({
      email: 'maria@clube.test',
      password: 'senha-de-oito',
    });
    // E ele não aparece no formulário: nada para a pessoa digitar nem conferir.
    expect(screen.queryByDisplayValue(CODE)).toBeNull();
  });

  it('escapes the code before putting it in the URL', async () => {
    /*
      O `code` vem da URL já DECODIFICADO pelo react-router, e vai para dentro
      de um caminho outra vez. Sem `encodeURIComponent`, um código que contenha
      `/` ou `?` deixa de ser um segmento: `POST /invites/CONV/ITE/accept` não
      casa a rota do backend (404 do Fastify, não o 404 de convite inexistente),
      e um `?` transformaria metade do código em query string.

      O fixture é `%2F` na URL de entrada exatamente para o `params.code` ser
      `CONV/ITE` e a reescrita ter de acontecer.
    */
    const calls = stubFetch(alwaysReply(acceptOk()));

    renderPage(<AppRoutes />, { path: '/convite/CONV%2FITE' });
    fill();
    await submit();

    await waitFor(() => {
      // `requestsTo` e não `calls` inteiro: com o shell carregando o `/me` do
      // clube ativo (Tarefa 16), a sessão que nasce no aceite soma uma
      // requisição ao array. A asserção honesta é sobre O ENDPOINT sob teste.
      expect(requestsTo(calls, '/invites/')).toHaveLength(1);
    });
    expect(requestAt(calls, 0).url).toBe(
      'https://api.teste/invites/CONV%2FITE/accept',
    );
  });

  it('sends the name when the person typed one, trimmed', async () => {
    const calls = stubFetch(alwaysReply(acceptOk()));

    renderPage(<AppRoutes />, { path: PATH });
    fill({ name: '  Maria  ' });
    await submit();

    await waitFor(() => {
      // `requestsTo` e não `calls` inteiro: com o shell carregando o `/me` do
      // clube ativo (Tarefa 16), a sessão que nasce no aceite soma uma
      // requisição ao array. A asserção honesta é sobre O ENDPOINT sob teste.
      expect(requestsTo(calls, '/invites/')).toHaveLength(1);
    });
    expect(requestAt(calls, 0).body).toEqual({
      email: 'maria@clube.test',
      password: 'senha-de-oito',
      name: 'Maria',
    });
  });

  it('omits the name entirely when the person left it blank', async () => {
    /*
      O outro lado do par — e ele estava PROMETIDO no nome do teste acima
      ("and omits it when blank") e provado noutro lugar, o que é a forma de o
      próximo leitor concluir que a propriedade não tem teste.

      Nome em branco é AUSÊNCIA de nome: `User.name` é nullable, e a chave não
      viaja. Um campo tocado e apagado é o caso realista (o `undefined` do
      campo nunca tocado já é coberto pelo teste da regra 14).
    */
    const calls = stubFetch(alwaysReply(acceptOk()));

    renderPage(<AppRoutes />, { path: PATH });
    fill({ name: '   ' });
    await submit();

    await waitFor(() => {
      // `requestsTo` e não `calls` inteiro: com o shell carregando o `/me` do
      // clube ativo (Tarefa 16), a sessão que nasce no aceite soma uma
      // requisição ao array. A asserção honesta é sobre O ENDPOINT sob teste.
      expect(requestsTo(calls, '/invites/')).toHaveLength(1);
    });
    const body = requestAt(calls, 0).body;
    expect(body).toEqual({
      email: 'maria@clube.test',
      password: 'senha-de-oito',
    });
    // `toEqual` ignora chave com `undefined`: a asserção de que ela não viajou
    // precisa ser explícita.
    expect(Object.keys(body as object)).not.toContain('name');
  });

  it('stores the token and goes into the club (rule 18)', async () => {
    stubFetch(alwaysReply(acceptOk()));
    const storage = memoryStorage();

    renderPage(<AppRoutes />, { path: PATH, storage });
    fill();
    await submit();

    await waitFor(() => {
      expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('token-novo');
    });
    // E a home aparece — o `RequireAuth` já a deixa passar, o que só é
    // verdade se o token entrou na sessão e não só no armazenamento.
    expect(locationText()).toBe('/');
    expect(
      screen.queryByRole('heading', { name: pt.pages.home.title }),
    ).not.toBeNull();
  });

  it('replaces the invite screen in the history instead of stacking on it', async () => {
    /*
      O `replace` do `navigate`, e o que ele custa quando falta: a tela de
      aceite fica FORA dos dois guardas, então o botão "voltar" do celular
      devolveria a pessoa — já dentro do clube — ao formulário de aceite de um
      convite que ela acabou de consumir. O próximo envio levaria 410.

      A sonda é o `BackButton` do harness: sem `replace` há uma entrada
      anterior para onde voltar, com `replace` não há.
    */
    stubFetch(alwaysReply(acceptOk()));

    renderPage(
      <>
        <AppRoutes />
        <BackButton />
      </>,
      { path: PATH },
    );
    fill();
    await submit();

    await waitFor(() => {
      expect(locationText()).toBe('/');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('voltar'));
    });

    expect(locationText()).toBe('/');
    expect(
      screen.queryByRole('heading', { name: pt.pages.acceptInvite.title }),
    ).toBeNull();
  });
});

describe('the accept screen validates with the shared schema (rule 13)', () => {
  it('refuses a password shorter than 8 characters, on the password field', async () => {
    const calls = stubFetch(alwaysReply(acceptOk()));

    renderPage(<AppRoutes />, { path: PATH });
    fill({ password: 'curta12' });
    await submit();

    const password = screen.getByLabelText(PASSWORD_LABEL);
    await waitFor(() => {
      expect(password.getAttribute('aria-invalid')).toBe('true');
    });
    // O mínimo é 8 e vem do `acceptInviteSchema` de `shared` — o MESMO objeto
    // que o backend usa. Sete caracteres não viram request nenhum.
    expect(calls).toHaveLength(0);
    expect(describedText(password)).toContain(pt.errors.fields.password);
  });

  it('accepts a password of exactly 8 characters', async () => {
    // O lado POSITIVO do limite: sem ele, um `min(9)` passaria no teste acima.
    const calls = stubFetch(alwaysReply(acceptOk()));

    renderPage(<AppRoutes />, { path: PATH });
    fill({ password: 'oitochar' });
    await submit();

    await waitFor(() => {
      // `requestsTo` e não `calls` inteiro: com o shell carregando o `/me` do
      // clube ativo (Tarefa 16), a sessão que nasce no aceite soma uma
      // requisição ao array. A asserção honesta é sobre O ENDPOINT sob teste.
      expect(requestsTo(calls, '/invites/')).toHaveLength(1);
    });
  });

  it('keeps the length rule readable before the person gets it wrong', () => {
    stubFetch(alwaysReply(acceptOk()));

    renderPage(<AppRoutes />, { path: PATH });

    // A dica é `hint` e não mensagem de erro: ela existe para a pessoa NÃO
    // errar, e continua legível com o campo em erro (Tarefa 13).
    expect(describedText(screen.getByLabelText(PASSWORD_LABEL))).toContain(
      pt.pages.acceptInvite.passwordHint,
    );
  });
});

describe('the two errors the person will actually see (rules 15, 16, 19)', () => {
  it('says a missing invite is missing, not expired (rule 15)', async () => {
    stubFetch(alwaysReply({ status: 404, body: { error: 'Not found' } }));

    renderPage(<AppRoutes />, { path: PATH });
    fill();
    await submit();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        pt.pages.acceptInvite.inviteNotFound,
      );
    });
    /*
      As duas frases serem DIFERENTES é propriedade DO CATÁLOGO, e vive em
      `shared/src/locales/__tests__/catalogs.test.ts` (§7.2) — aqui era um
      `expect(pt.x).not.toBe(pt.y)` que passaria com a tela desmontada.

      O que este teste prova é o ELO: este status escolhe ESTA frase. Nem o
      genérico de 404 ("Não encontramos o que você procurava"), que não diz o
      quê, nem a palavra que a API escreveu.
    */
    expect(readableText()).not.toContain(pt.errors.notFound);
    expect(readableText()).not.toContain('Not found');
  });

  it('says an invite that no longer works is used or expired, not missing (rule 15)', async () => {
    /*
      ⚠️ O 410 COBRE OS DOIS CASOS desde o conserto de backend desta rodada:
      `InviteExpiredError` (venceu) e `InviteAlreadyUsedError` (uso único já
      gasto), que era 409. Para quem lê, é a mesma frase — "não vale mais, peça
      outro" —, e é a única ação possível nos dois casos.
    */
    stubFetch(alwaysReply({ status: 410, body: { error: 'Gone' } }));

    renderPage(<AppRoutes />, { path: PATH });
    fill();
    await submit();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        pt.pages.acceptInvite.inviteExpired,
      );
    });
    expect(readableText()).not.toContain(pt.pages.acceptInvite.inviteNotFound);
    expect(readableText()).not.toContain('Gone');
  });

  it('marks the email field on a 409, which now means only "already a member" (rule 16)', async () => {
    /*
      ⚠️ O 409 DESTA ROTA DEIXOU DE SER AMBÍGUO — foi o conserto de backend
      desta rodada. Antes ele saía de `InviteAlreadyUsedError` E de
      `DuplicateMembershipError`, sem discriminador no corpo (§6.2), então a
      frase tinha de servir para os dois e o campo de e-mail ganhava
      `aria-invalid="true"` por causa de um convite — com um e-mail válido, e
      sem `role="alert"` nenhum para o leitor de tela anunciar.

      Com `InviteAlreadyUsedError` em 410, o 409 é só "este e-mail já é membro
      ativo deste clube": marcar o campo (regra 16) fica correto, e a frase pode
      ser precisa.
    */
    stubFetch(alwaysReply({ status: 409, body: { error: 'Conflict' } }));

    renderPage(<AppRoutes />, { path: PATH });
    fill();
    await submit();

    const email = screen.getByLabelText(EMAIL_LABEL);
    await waitFor(() => {
      expect(email.getAttribute('aria-invalid')).toBe('true');
    });
    expect(describedText(email)).toContain(pt.pages.acceptInvite.alreadyInClub);
    // Erro de campo não vira alerta no topo (regra 7), e o genérico de 409
    // ("Isso já existe") não aparece.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(readableText()).not.toContain(pt.errors.conflict);
  });

  it('puts a details path on the field the API named (rule 20)', async () => {
    stubFetch(
      alwaysReply({
        status: 400,
        body: {
          error: 'password must have at least 8 characters',
          details: [{ path: 'email', message: 'Invalid email' }],
        },
      }),
    );

    renderPage(<AppRoutes />, { path: PATH });
    fill();
    await submit();

    const email = screen.getByLabelText(EMAIL_LABEL);
    await waitFor(() => {
      expect(email.getAttribute('aria-invalid')).toBe('true');
    });
    expect(describedText(email)).toContain(pt.errors.fields.email);
    // A mensagem INTERNA da usecase viajou no `error` e não pode aparecer: é
    // o único status em que o backend manda `error.message` cru (§6.2).
    expect(readableText()).not.toContain(
      'password must have at least 8 characters',
    );
  });

  it('puts a details path on the NAME field too, which has its own Field', async () => {
    /*
      O terceiro campo da tela, e o único cujo `Field` não tinha teste de erro:
      o `acceptInviteSchema` não valida o nome (é `optional()` sem `min`), então
      só a API o marca — e um `<Field>` do nome sem a prop `error` sobrevivia à
      suíte inteira. A mensagem simplesmente não apareceria em lugar nenhum.
    */
    stubFetch(
      alwaysReply({
        status: 400,
        body: {
          error: 'Bad Request',
          details: [{ path: 'name', message: 'Invalid name' }],
        },
      }),
    );

    renderPage(<AppRoutes />, { path: PATH });
    fill({ name: 'Maria' });
    await submit();

    const name = screen.getByLabelText(NAME_LABEL);
    await waitFor(() => {
      expect(name.getAttribute('aria-invalid')).toBe('true');
    });
    expect(describedText(name)).toContain(pt.errors.fields.name);
    // E o par negativo: o campo que a API não citou fica limpo.
    expect(
      screen.getByLabelText(EMAIL_LABEL).getAttribute('aria-invalid'),
    ).toBeNull();
  });

  it('clears the previous error when the person tries again', async () => {
    /*
      A pessoa leva um 410, corrige o que achava que era, e reenvia: a
      mensagem velha não pode continuar na tela enquanto o request novo está
      no ar — ela contradiz o que está acontecendo.

      A segunda resposta fica PENDURADA de propósito: se a asserção esperasse o
      sucesso, ela não distinguiria "limpou no envio" de "limpou no sucesso",
      e é o envio que importa.
    */
    let release: (() => void) | undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });

    stubFetch(async (_request, index) => {
      if (index === 0) return { status: 410, body: { error: 'Gone' } };
      await inFlight;
      return acceptOk();
    });

    renderPage(<AppRoutes />, { path: PATH });
    fill();
    await submit();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        pt.pages.acceptInvite.inviteExpired,
      );
    });

    await submit();

    expect(submitButton().getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('alert')).toBeNull();

    release?.();
    await waitFor(() => {
      expect(locationText()).toBe('/');
    });
  });
});

describe('the accept screen uses the PUBLIC client (rules 8, 19)', () => {
  it('does NOT clear the stored token when the accept fails with 401', async () => {
    /*
      ⚠️ A MESMA ARMADILHA DO LOGIN, e a tela de aceite não tinha o teste dela.
      O `createApiClient` chama `onUnauthorized()` em TODO 401, e no app esse
      callback é o `signOut()`. Um aceite feito por quem JÁ tem sessão (o caso
      real: alguém do clube A abre um convite do clube B) que levasse 401
      derrubaria a sessão do clube A.

      O ator é legítimo e a asserção é sobre o ESTADO (§7.5).
    */
    /*
      ⚠️ O FIXTURE PRECISOU FICAR FIEL (§7.1 escrito para tela). Era
      `alwaysReply({ status: 401 })` — um servidor que recusa TUDO. Com o shell
      carregando o `/me` (Tarefa 16), esse 401 universal chegava ao `/me` do
      cliente AUTENTICADO (o ator deste teste já tem sessão), o
      `onUnauthorized` deslogava, e o teste provava o CONTRÁRIO do que o nome
      dele promete. O 401 é do aceite, que é o assunto.
    */
    const calls = stubFetch(
      replyByUrl([['/me', meReply()]], {
        status: 401,
        body: { error: 'Unauthorized' },
      }),
    );
    const storage = memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-de-antes' });

    renderPage(<AppRoutes />, { path: PATH, storage });
    fill();
    await submit();

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeNull();
    });
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('token-de-antes');
    // E o mecanismo, pinado: o `publicApi` não manda `Authorization` — mandar
    // um token junto do aceite só daria ao servidor um header para ignorar.
    //
    // `requestsTo` e não `calls[0]`: quem já tem sessão dispara o `/me` do
    // shell ao ABRIR a tela, antes do aceite — então o índice 0 é o `/me`, que
    // manda `Authorization` com razão.
    expect(
      Object.keys(requestAt(requestsTo(calls, '/invites/'), 0).headers),
    ).not.toContain('Authorization');
  });

  it('does not tell someone who never had a session that it ended', async () => {
    /*
      A ASSIMETRIA que a auditoria achou: o login sobrescreve o 401 e o aceite
      não sobrescrevia. Nenhum 401 sai do `AcceptInvite` (a rota é pública), mas
      um proxy, um gateway ou o service worker produzem um — e a pessoa que
      abriu o link do WhatsApp leria "Sua sessão terminou. Entre outra vez."
      sem nunca ter tido sessão, numa tela onde não há para onde "entrar outra
      vez".
    */
    stubFetch(alwaysReply({ status: 401, body: { error: 'Unauthorized' } }));

    renderPage(<AppRoutes />, { path: PATH });
    fill();
    await submit();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(pt.errors.unknown);
    });
    expect(readableText()).not.toContain(pt.errors.unauthorized);
    expect(readableText()).not.toContain('Unauthorized');
  });
});

describe('the accept screen and the password manager (rules 10, 17)', () => {
  it('asks the manager for a NEW password, not the saved one', () => {
    stubFetch(alwaysReply(acceptOk()));

    renderPage(<AppRoutes />, { path: PATH });

    // `new-password` é o que faz o gerenciador oferecer GERAR uma senha. Com
    // `current-password` ele preencheria a senha de outro site, em silêncio.
    expect(
      screen.getByLabelText(PASSWORD_LABEL).getAttribute('autocomplete'),
    ).toBe('new-password');
    expect(
      screen.getByLabelText(EMAIL_LABEL).getAttribute('autocomplete'),
    ).toBe('email');
    expect(screen.getByLabelText(NAME_LABEL).getAttribute('autocomplete')).toBe(
      'name',
    );
  });

  it('does not send two requests when the button is pressed twice (rule 10)', async () => {
    /*
      ⚠️ A REGRA 10 SÓ ESTAVA ESCRITA PARA O LOGIN, E É AQUI QUE ELA CUSTA MAIS:
      o convite é de USO ÚNICO. Dois toques no celular são dois requests; o
      primeiro consome o convite e responde 201, o segundo responde 410 — e a
      pessoa que ACABOU DE ENTRAR no clube lê "este convite não vale mais",
      grudado numa tela que deu certo.
    */
    let release: (() => void) | undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });

    const calls: RecordedRequest[] = stubFetch(async () => {
      await inFlight;
      return acceptOk();
    });

    renderPage(<AppRoutes />, { path: PATH });
    fill();

    await act(async () => {
      fireEvent.click(submitButton());
    });
    await waitFor(() => {
      // `requestsTo` e não `calls` inteiro: com o shell carregando o `/me` do
      // clube ativo (Tarefa 16), a sessão que nasce no aceite soma uma
      // requisição ao array. A asserção honesta é sobre O ENDPOINT sob teste.
      expect(requestsTo(calls, '/invites/')).toHaveLength(1);
    });

    // O MECANISMO, pinado: é o `loading` do `Button` que desabilita.
    expect(submitButton().getAttribute('aria-busy')).toBe('true');
    expect(submitButton()).toHaveProperty('disabled', true);

    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(calls).toHaveLength(1);

    release?.();
    await waitFor(() => {
      expect(locationText()).toBe('/');
    });
  });
});
