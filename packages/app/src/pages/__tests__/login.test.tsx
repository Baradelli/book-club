import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { pt } from '@clube/shared/locales';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoginPage } from '../login';
import {
  alwaysReply,
  BackButton,
  memoryStorage,
  meReply,
  readableText,
  type RecordedRequest,
  renderPage,
  replyByUrl,
  requestAt,
  requestsTo,
  stubFetch,
} from './harness';

/**
 * A TELA DE ENTRADA — regras 2 e 5 a 12, mais 19 a 21 pelo lado da tela.
 *
 * O que NÃO se testa aqui (a spec é explícita): aparência, posicionamento,
 * snapshot de markup, "renderiza sem erro". O `Field`, o `Button` e o foco têm
 * cobertura própria na Tarefa 13.
 */

const EMAIL_LABEL = pt.pages.login.email;
const PASSWORD_LABEL = pt.pages.login.password;
const SUBMIT_LABEL = pt.pages.login.submit;

function fill(email: string, password: string): void {
  fireEvent.change(screen.getByLabelText(EMAIL_LABEL), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(PASSWORD_LABEL), {
    target: { value: password },
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

/**
 * O texto que o `aria-describedby` do controle realmente aponta.
 *
 * É o ELO que interessa (regras 7, 11 e 12 da Tarefa 13): um `getByText` da
 * frase provaria só que a frase está em algum lugar da tela — inclusive no
 * campo errado.
 */
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

describe('the login screen sends the right request (rules 5, 6, 12)', () => {
  it('posts to /auth/login and stores the token, then goes home (rule 12)', async () => {
    const calls = stubFetch(
      alwaysReply({ status: 200, body: { token: 'token-novo' } }),
    );
    const storage = memoryStorage();

    renderPage(<LoginPage />, { storage });
    fill('marcos@clube.test', 'senha-secreta');
    await submit();

    await waitFor(() => {
      expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('token-novo');
    });

    const request = requestAt(calls, 0);
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://api.teste/auth/login');
    expect(request.body).toEqual({
      email: 'marcos@clube.test',
      password: 'senha-secreta',
    });
    expect(locationText()).toBe('/');
  });

  it('accepts an email with spaces around it and sends it trimmed (rule 6)', async () => {
    // O `loginSchema` de `shared` faz `.trim()` ANTES do `.email()`, e é o
    // valor PARSEADO que o React Hook Form entrega ao envio. Sem isso, o campo
    // ficaria vermelho para um e-mail certo digitado no celular, onde o espaço
    // depois do texto é o padrão do teclado.
    const calls = stubFetch(
      alwaysReply({ status: 200, body: { token: 'token-novo' } }),
    );

    renderPage(<LoginPage />);
    fill('  marcos@clube.test  ', 'senha-secreta');
    await submit();

    await waitFor(() => {
      // `requestsTo` e não `calls` inteiro: com o shell carregando o `/me` do
      // clube ativo (Tarefa 16), a sessão que nasce aqui soma uma requisição ao
      // array. A asserção honesta é sobre O ENDPOINT sob teste — e é mais forte
      // que a antiga, porque não confunde as duas.
      expect(requestsTo(calls, '/auth/login')).toHaveLength(1);
    });
    expect(requestAt(requestsTo(calls, '/auth/login'), 0).body).toEqual({
      email: 'marcos@clube.test',
      password: 'senha-secreta',
    });
  });

  it('never sends a request when the form is invalid (rule 5)', async () => {
    const calls = stubFetch(alwaysReply({ status: 200, body: { token: 'x' } }));

    renderPage(<LoginPage />);
    fill('nao-e-email', 'senha-secreta');
    await submit();

    // A validação é do `loginSchema`, no navegador: um e-mail inválido não
    // vira request nenhum.
    expect(calls).toHaveLength(0);
  });
});

describe('the login screen marks the field, not the top of the form (rule 7)', () => {
  it('marks the email field when the email is not an email', async () => {
    stubFetch(alwaysReply({ status: 200, body: { token: 'x' } }));

    renderPage(<LoginPage />);
    fill('nao-e-email', 'senha-secreta');
    await submit();

    const email = screen.getByLabelText(EMAIL_LABEL);
    await waitFor(() => {
      expect(email.getAttribute('aria-invalid')).toBe('true');
    });
    expect(describedText(email)).toContain(pt.errors.fields.email);

    // E NÃO um alerta genérico no topo: a regra 7 é sobre onde a mensagem vai.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('marks the password field when the password is empty', async () => {
    stubFetch(alwaysReply({ status: 200, body: { token: 'x' } }));

    renderPage(<LoginPage />);
    fill('marcos@clube.test', '');
    await submit();

    const password = screen.getByLabelText(PASSWORD_LABEL);
    await waitFor(() => {
      expect(password.getAttribute('aria-invalid')).toBe('true');
    });
    expect(describedText(password)).toContain(pt.errors.fields.password);

    // O par negativo: o campo que está certo NÃO fica marcado, senão um
    // "marca tudo" passaria no teste acima.
    expect(
      screen.getByLabelText(EMAIL_LABEL).getAttribute('aria-invalid'),
    ).toBeNull();
  });
});

describe('the login screen and the API error (rules 8, 9, 19, 20, 21)', () => {
  it('does NOT clear the stored token on a failed login (rule 8)', async () => {
    /*
      ⚠️ O TESTE DA ARMADILHA. O `createApiClient` chama `onUnauthorized()` em
      TODO 401, e no app esse callback é o `signOut()` — mas
      `POST /auth/login` com senha errada responde 401. Com o cliente
      autenticado, errar a senha dispararia o caminho de "a sessão morreu" e
      limparia o armazenamento.

      O ator é LEGÍTIMO e o teste asserta o ESTADO (§7.5): alguém que já tem
      token (chegou aqui com a sessão viva, por um link antigo) erra a senha, e
      o token dela continua onde estava.
    */
    /*
      ⚠️ O FIXTURE PRECISOU FICAR FIEL (§7.1 escrito para tela). Era
      `alwaysReply({ status: 401 })` — um servidor que recusa TUDO, o que nenhum
      servidor faz. Com o shell carregando o `/me` (Tarefa 16), esse 401
      universal chegava ao `/me` do cliente AUTENTICADO, o `onUnauthorized`
      deslogava, e o teste provava o CONTRÁRIO do que o nome dele promete.

      O 401 é do login, que é o assunto. O token guardado é de uma sessão VIVA,
      então o `/me` responde 200 — é o que faz "errar a senha não desloga" ser
      decidível.
    */
    stubFetch(
      replyByUrl([['/me', meReply()]], {
        status: 401,
        body: { error: 'Unauthorized' },
      }),
    );
    const storage = memoryStorage({ [TOKEN_STORAGE_KEY]: 'token-de-antes' });

    renderPage(<LoginPage />, { storage });
    fill('marcos@clube.test', 'senha-errada');
    await submit();

    await waitFor(() => {
      // `queryByRole` + `not.toBeNull` e não `getByRole` + `toBeDefined`
      // (§7.4): o `getBy*` LANÇA quando não acha, então o `toBeDefined` não
      // assertava nada — o teste dizia só "a query não explodiu".
      expect(screen.queryByRole('alert')).not.toBeNull();
    });
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBe('token-de-antes');
  });

  it('says the credentials do not match, not that the session ended (rule 8)', async () => {
    stubFetch(alwaysReply({ status: 401, body: { error: 'Unauthorized' } }));

    renderPage(<LoginPage />);
    fill('marcos@clube.test', 'senha-errada');
    await submit();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        pt.pages.login.invalidCredentials,
      );
    });
    // O genérico de 401 é "Sua sessão terminou. Entre outra vez." — uma frase
    // sem sentido para quem está justamente tentando entrar.
    expect(readableText()).not.toContain(pt.errors.unauthorized);
  });

  it('clears the previous error when the person tries again', async () => {
    /*
      A pessoa erra a senha, corrige, e reenvia: a mensagem velha
      ("E-mail ou senha não conferem") não pode continuar na tela enquanto o
      request novo está no ar — ela contradiz o que está acontecendo.

      A segunda resposta fica PENDURADA de propósito: se a asserção esperasse o
      sucesso, ela não distinguiria "limpou no envio" de "limpou no sucesso", e
      é o envio que importa.
    */
    let release: (() => void) | undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });

    stubFetch(async (_request, index) => {
      if (index === 0) return { status: 401, body: { error: 'Unauthorized' } };
      await inFlight;
      return { status: 200, body: { token: 'token-novo' } };
    });

    renderPage(<LoginPage />);
    fill('marcos@clube.test', 'senha-errada');
    await submit();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        pt.pages.login.invalidCredentials,
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

  it('tells a network failure apart from a server error (rule 9)', async () => {
    stubFetch(alwaysReply({ status: 0, offline: true }));

    renderPage(<LoginPage />);
    fill('marcos@clube.test', 'senha-secreta');
    await submit();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(pt.errors.network);
    });
    // Distinguível de erro do servidor, que é a outra metade da regra 9.
    expect(screen.getByRole('alert').textContent).not.toBe(
      pt.errors.serverError,
    );
  });

  it('shows a translated generic message for a status nobody mapped (rule 21)', async () => {
    stubFetch(alwaysReply({ status: 418, body: { error: "I'm a teapot" } }));

    renderPage(<LoginPage />);
    fill('marcos@clube.test', 'senha-secreta');
    await submit();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(pt.errors.unknown);
    });
  });

  it('puts a details path on the field the API named (rule 20)', async () => {
    stubFetch(
      alwaysReply({
        status: 400,
        body: {
          error: 'Bad Request',
          details: [
            { path: 'password', message: 'String must contain at least 1' },
          ],
        },
      }),
    );

    renderPage(<LoginPage />);
    fill('marcos@clube.test', 'senha-secreta');
    await submit();

    const password = screen.getByLabelText(PASSWORD_LABEL);
    await waitFor(() => {
      expect(password.getAttribute('aria-invalid')).toBe('true');
    });
    expect(describedText(password)).toContain(pt.errors.fields.password);
    // O campo que a API NÃO citou fica limpo.
    expect(
      screen.getByLabelText(EMAIL_LABEL).getAttribute('aria-invalid'),
    ).toBeNull();
  });

  it('puts no sentence the API wrote anywhere in the DOM (rule 19)', async () => {
    /*
      A prova da regra 19, e as frases são escolhidas para serem RECONHECÍVEIS:
      o texto genérico por status que o backend manda (§6.2), a mensagem do Zod
      em inglês, e a mensagem interna de uma usecase — a que vazaria se alguém
      renderizasse `error.message` na classe 400.

      ⚠️ A VARREDURA É O `readableText()`, NÃO O `document.body.textContent`, e
      isto foi medido: com `textContent` (que só vê nós de texto), mover a frase
      da API para um `title` ou um `aria-label` deixava os 152 testes VERDES — e
      `aria-label` é justamente o que o leitor de tela fala. A regra falhava
      exatamente para quem depende dela.
    */
    const sentences = [
      'Unauthorized',
      'String must contain at least 1 character(s)',
      'password must have at least 8 characters',
    ];

    stubFetch(
      alwaysReply({
        status: 400,
        body: {
          error: 'password must have at least 8 characters',
          details: [
            {
              path: 'password',
              message: 'String must contain at least 1 character(s)',
            },
          ],
        },
      }),
    );

    renderPage(<LoginPage />);
    fill('marcos@clube.test', 'senha-secreta');
    await submit();

    await waitFor(() => {
      expect(
        screen.getByLabelText(PASSWORD_LABEL).getAttribute('aria-invalid'),
      ).toBe('true');
    });

    const rendered = readableText();
    for (const sentence of sentences) {
      expect(rendered).not.toContain(sentence);
    }
    // Asserção vazia (§7.4): se a tela não tivesse mostrado NADA, o laço acima
    // passaria provando nada.
    expect(rendered).toContain(pt.errors.fields.password);
  });
});

describe('the login screen and the preserved destination (rule 2)', () => {
  it('goes to the preserved destination, with search and hash', async () => {
    stubFetch(alwaysReply({ status: 200, body: { token: 'token-novo' } }));

    renderPage(<LoginPage />, {
      state: { from: '/books/abc?tab=plano#dia-3' },
    });
    fill('marcos@clube.test', 'senha-secreta');
    await submit();

    // Asserção EXATA (regra 3): um destino sem a query passaria num
    // `toContain('/books/abc')`, e a âncora `#dia-3` é o link de um dia do
    // plano — justamente o que se manda no grupo.
    await waitFor(() => {
      expect(locationText()).toBe('/books/abc?tab=plano#dia-3');
    });
  });

  it('replaces the login in the history instead of stacking on it', async () => {
    /*
      O `replace` do `navigate`, e o que ele custa quando falta: sem ele, o
      botão "voltar" do celular devolve a pessoa — já autenticada — à tela de
      entrada que ela acabou de vencer, e aí o `RequireAnonymous` a manda de
      volta ao destino. O sintoma é um pingue-pongue visível, e ele acontece
      justamente no gesto mais comum do celular.

      A sonda é o `BackButton` do harness: com `replace` não existe entrada
      anterior para onde voltar.
    */
    stubFetch(alwaysReply({ status: 200, body: { token: 'token-novo' } }));

    renderPage(
      <>
        <LoginPage />
        <BackButton />
      </>,
      { state: { from: '/books/abc?tab=plano#dia-3' } },
    );
    fill('marcos@clube.test', 'senha-secreta');
    await submit();

    await waitFor(() => {
      expect(locationText()).toBe('/books/abc?tab=plano#dia-3');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('voltar'));
    });

    expect(locationText()).toBe('/books/abc?tab=plano#dia-3');
  });

  it('ignores a destination that is not an internal path (rule 4)', async () => {
    stubFetch(alwaysReply({ status: 200, body: { token: 'token-novo' } }));

    renderPage(<LoginPage />, {
      state: { from: 'https://evil.example/phish' },
    });
    fill('marcos@clube.test', 'senha-secreta');
    await submit();

    await waitFor(() => {
      expect(locationText()).toBe('/');
    });
  });
});

describe('the login screen and the password manager (rules 10, 11)', () => {
  it('declares autoComplete on both fields (rule 11)', () => {
    stubFetch(alwaysReply({ status: 200, body: { token: 'x' } }));

    renderPage(<LoginPage />);

    // Decisão F: sem isto o gerenciador de senha não oferece salvar, e a
    // pessoa digita a senha toda noite. Quebra em silêncio — nada na tela
    // muda.
    expect(
      screen.getByLabelText(EMAIL_LABEL).getAttribute('autocomplete'),
    ).toBe('email');
    expect(
      screen.getByLabelText(PASSWORD_LABEL).getAttribute('autocomplete'),
    ).toBe('current-password');
  });

  it('does not send two requests when the button is pressed twice (rule 10)', async () => {
    let release: (() => void) | undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });

    const calls: RecordedRequest[] = stubFetch(async () => {
      await inFlight;
      return { status: 200, body: { token: 'token-novo' } };
    });

    renderPage(<LoginPage />);
    fill('marcos@clube.test', 'senha-secreta');

    await act(async () => {
      fireEvent.click(submitButton());
    });
    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });

    // O MECANISMO, pinado: é o `loading` do `Button` que desabilita.
    expect(submitButton().getAttribute('aria-busy')).toBe('true');
    expect(submitButton()).toHaveProperty('disabled', true);

    await act(async () => {
      fireEvent.click(submitButton());
    });
    // Duplo toque num botão que grava é o defeito clássico do celular, e aqui
    // ele significaria duas tentativas de login.
    expect(calls).toHaveLength(1);

    release?.();
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/');
    });
  });
});

describe('there is no form schema in the app (rule 5)', () => {
  it('declares no Zod schema of its own in the pages', () => {
    /*
      O `CLAUDE.md` é taxativo: "Schemas Zod ficam em `shared/`; back e front
      importam de lá. Nunca duplicar schema." Um schema de formulário escrito
      aqui passaria em TODOS os testes acima — e divergiria do backend no dia em
      que a regra mudasse de um lado só.

      Varredura estática porque é a única forma de acusar a AUSÊNCIA de uma
      duplicação: nenhum teste de comportamento distingue "validou com o schema
      de `shared`" de "validou com uma cópia idêntica".
    */
    for (const page of ['login.tsx', 'accept-invite.tsx', 'form-errors.ts']) {
      // `process.cwd()` (que é `packages/app`) e não `import.meta.url`: no
      // Windows o Vite entrega a URL do módulo sem a letra do drive, e o
      // `readFileSync` procurava em `C:\src\pages\login.tsx`.
      const source = readFileSync(
        resolve(process.cwd(), 'src', 'pages', page),
        'utf8',
      );
      expect(source).not.toContain("from 'zod'");
      expect(source).not.toContain('z.object(');
    }
  });
});
