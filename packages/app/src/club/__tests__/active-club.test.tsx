import { type MeResponse, meResponseSchema } from '@clube/shared';
import { type StorageLike, TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { pt } from '@clube/shared/locales';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../App';
import {
  aBook,
  booksReply,
  bookWithPlanReply,
  memoryStorage,
  meReply,
  type RecordedRequest,
  renderPage,
  replyByUrl,
  requestsTo,
  stubFetch,
} from '../../pages/__tests__/harness';
import { AppRoutes } from '../../router';
import {
  ACTIVE_CLUB_STORAGE_KEY,
  type ClubSummary,
  useActiveClub,
} from '../active-club';

/**
 * O CLUBE ATIVO — regras 6 a 11 da Tarefa 16.
 *
 * ⚠️ **A OBSERVÁVEL PRINCIPAL É A URL DA ESTANTE**, e não um estado interno:
 * "qual clube está ativo" só significa alguma coisa se for o clube cujos livros
 * o app pede. Então a maioria dos testes daqui monta o `<App />` de verdade
 * (cabeçalho com o seletor + rotas) e olha para qual `GET /clubs/:clubId/books`
 * saiu — que é o mesmo caminho da produção.
 *
 * O `ClubProbe` existe só para os dois casos em que NÃO há requisição para
 * observar: `clubs: []` e o id morto.
 *
 * O harness é o de `pages/__tests__/harness.tsx` — importado, não recopiado
 * (uma segunda cópia sai de sincronia no primeiro conserto).
 */

/**
 * Fixture é factory (§7.7) — a lista do `/me`, na ORDEM que ele devolve.
 *
 * ⚠️ **A ORDEM ALFABÉTICA É O OPOSTO DA ORDEM DA API, e isto é escolhido** (§7.2).
 *
 * O segundo clube chamava-se `'Clube dos Amigos'`, e o comentário do teste de
 * ordem afirmava que ordenar por nome "mudaria o padrão da regra 8". MEDIDO:
 * **falso**. `'Clube do Casal'` vem **antes** de `'Clube dos Amigos'` tanto no
 * `sort()` cru quanto no `localeCompare(_, 'pt')` — o espaço (U+0020) precede o
 * `s` —, então a ordem alfabética COINCIDIA com a da API e o mutante que ordena
 * a lista por `name` sobrevivia aos 192 testes. Fixture de ordenação que
 * coincide com a implementação errada é fixture que anula o teste.
 *
 * `'Amigos do Livro'` inverte a coincidência: quem ordenar por nome põe o
 * SEGUNDO na frente, e a asserção acusa. A precondição é pinada no teste, como a
 * Tarefa 11 fez com `MARCOS_ID < MARIA_ID` — senão um clube renomeado devolve a
 * coincidência em silêncio.
 */
function twoClubs(): ClubSummary[] {
  return [
    { id: 'c-casal', name: 'Clube do Casal', role: 'OWNER' },
    { id: 'c-amigos', name: 'Amigos do Livro', role: 'MEMBER' },
  ];
}

const SESSION: Record<string, string> = {
  [TOKEN_STORAGE_KEY]: 'token-da-sessao',
};

/**
 * As respostas do shell autenticado: o refresh do boot, o `/me` e a estante.
 *
 * `clubs` entra por parâmetro; o resto é o que o app pede sem que o teste
 * peça.
 */
function shellResponder(clubs: readonly ClubSummary[]) {
  return replyByUrl(
    [
      ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
      ['/me', meReply({ clubs: [...clubs] })],
      ['/books/', bookWithPlanReply(aBook(), [])],
      ['/books', booksReply([aBook()])],
    ],
    { status: 500, body: { error: 'Internal Server Error' } },
  );
}

/** O clube de quem a estante foi pedida — a observável da fatia. */
function shelfClubIds(calls: readonly RecordedRequest[]): string[] {
  return requestsTo(calls, '/books')
    .map((call) => /\/clubs\/([^/]+)\/books/u.exec(call.url)?.[1] ?? '')
    .filter((id) => id !== '');
}

function ClubProbe() {
  const { activeClub, clubs, me, status } = useActiveClub();

  return (
    <>
      <span data-testid="status">{status}</span>
      <span data-testid="active">{activeClub?.id ?? 'nenhum'}</span>
      <span data-testid="clubs">{clubs.map((club) => club.id).join(',')}</span>
      {/*
        ⚠️ `'ninguem'` para `me === null`, e é o oposto de um objeto vazio: a
        armadilha da Tarefa 18 é justamente um `me` que EXISTE fora do `ready`.
      */}
      <span data-testid="me">
        {me === null ? 'ninguem' : `${me.id}|${me.name ?? ''}`}
      </span>
    </>
  );
}

function probeText(id: string): string {
  return screen.getByTestId(id).textContent ?? '';
}

async function renderApp(
  storage: StorageLike,
  clubs: readonly ClubSummary[],
): Promise<RecordedRequest[]> {
  const calls = stubFetch(shellResponder(clubs));

  await act(async () => {
    renderPage(<App />, { path: '/', storage });
    await Promise.resolve();
  });

  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the active club is local state (rules 6, 8, 10, 11)', () => {
  it('falls back to the FIRST club of /me when nothing is stored (rule 8)', async () => {
    const storage = memoryStorage({ ...SESSION });
    const calls = await renderApp(storage, twoClubs());

    await waitFor(() => {
      expect(shelfClubIds(calls)).toEqual(['c-casal']);
    });
    // E o padrão NÃO é gravado: guardar "o primeiro" faria o app lembrar de
    // uma decisão que ninguém tomou, e a ordem do `/me` já é a fonte dela.
    expect(storage.getItem(ACTIVE_CLUB_STORAGE_KEY)).toBeNull();
  });

  it('changes the shelf when the person switches club, with the NEW clubId (rule 10)', async () => {
    const storage = memoryStorage({ ...SESSION });
    const calls = await renderApp(storage, twoClubs());

    await waitFor(() => {
      expect(shelfClubIds(calls)).toEqual(['c-casal']);
    });

    // O seletor de verdade do cabeçalho (decisão F: ele só existe com 2+
    // clubes, e é o que faz este teste ser possível).
    const picker = screen.getByLabelText(pt.pages.home.clubLabel);
    await act(async () => {
      fireEvent.change(picker, { target: { value: 'c-amigos' } });
    });

    await waitFor(() => {
      // Requisição NOVA, com o clube novo no CAMINHO — não uma refiltragem em
      // memória do que já estava na tela.
      expect(shelfClubIds(calls)).toEqual(['c-casal', 'c-amigos']);
    });
  });

  it('persists the choice across a reload (rule 6)', async () => {
    const storage = memoryStorage({ ...SESSION });
    const calls = await renderApp(storage, twoClubs());

    await waitFor(() => {
      expect(shelfClubIds(calls)).toEqual(['c-casal']);
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(pt.pages.home.clubLabel), {
        target: { value: 'c-amigos' },
      });
    });
    await waitFor(() => {
      expect(storage.getItem(ACTIVE_CLUB_STORAGE_KEY)).toBe('c-amigos');
    });

    /*
      A "RECARGA": desmonta tudo e monta de novo com o MESMO armazenamento — é
      o que acontece quando a pessoa fecha a aba e volta amanhã. O `cleanup`
      explícito é necessário porque o do `test-setup.ts` roda no `afterEach`, e
      as duas montagens são DENTRO deste `it`: sem ele os dois `LocationProbe`
      coexistem e as queries ficam ambíguas.
    */
    cleanup();
    const second = await renderApp(storage, twoClubs());

    await waitFor(() => {
      // Sem a persistência, seria `c-casal` (o primeiro) outra vez, e a pessoa
      // teria de escolher o clube dela toda vez que abrisse o app.
      expect(shelfClubIds(second)).toEqual(['c-amigos']);
    });
  });

  it('sends the active club to the API in NO request body (rule 11)', async () => {
    const storage = memoryStorage({
      ...SESSION,
      [ACTIVE_CLUB_STORAGE_KEY]: 'c-amigos',
    });
    const calls = await renderApp(storage, twoClubs());

    await waitFor(() => {
      expect(shelfClubIds(calls)).toEqual(['c-amigos']);
    });

    /*
      ⚠️ O CLUBE ATIVO NÃO É ESTADO DE SERVIDOR (`CONTEXT.md`). O tenant de cada
      request vem do JWT (`req.user.sub`) e do `clubId` que está no CAMINHO da
      rota — que o backend valida contra o `Membership`. Nenhum CORPO o
      carrega, nenhuma QUERY o carrega, nenhum HEADER o carrega.

      A varredura é sobre as três, porque "não está no corpo" seria fácil de
      cumprir mandando-o na query string.
    */
    expect(calls.length).toBeGreaterThan(2);
    for (const call of calls) {
      expect(JSON.stringify(call.body ?? null)).not.toContain('c-amigos');
      expect(new URL(call.url).search).not.toContain('c-amigos');
      expect(JSON.stringify(call.headers)).not.toContain('c-amigos');
    }
  });
});

describe('the active club survives bad data and bad storage (rules 6, 9)', () => {
  it('drops a stored id that is no longer in /me, and CLEANS it (rule 9)', async () => {
    /*
      O membership pode ter sido arquivado (MVP 4), ou o clube apagado. Manter
      o id morto deixaria a home pedindo a estante de um clube que responde 404
      — tela quebrada por dado velho no `localStorage`, e quebrada PARA SEMPRE,
      porque nada mais reescreveria a chave.
    */
    const storage = memoryStorage({
      ...SESSION,
      [ACTIVE_CLUB_STORAGE_KEY]: 'c-que-nao-existe-mais',
    });
    const calls = await renderApp(storage, twoClubs());

    await waitFor(() => {
      expect(shelfClubIds(calls)).toEqual(['c-casal']);
    });
    // A segunda metade, e é a que impede o valor morto de voltar a atrapalhar
    // na próxima abertura.
    expect(storage.getItem(ACTIVE_CLUB_STORAGE_KEY)).toBeNull();
    // E o clube morto nunca virou requisição: pedir a estante dele daria 404 e
    // a tela de erro apareceria por um instante.
    expect(shelfClubIds(calls)).not.toContain('c-que-nao-existe-mais');
  });

  it('survives a DEAD stored id when removeItem itself throws (rules 6, 9)', async () => {
    /*
      ⚠️ **A COMBINAÇÃO QUE FALTAVA, e sem ela o `try` do `removeItem` era código
      não exercitado.** MEDIDO: apagar o `try/catch` de `clearStoredClubId`
      sobrevivia aos 192 testes. O teste do armazenamento hostil lança no
      `getItem`, então o id guardado nunca é LIDO — e a limpeza da regra 9 só
      roda quando existe um id morto para limpar. Os dois testes existiam e
      nenhum tocava esta linha.

      O caso real é o Safari em aba privada depois de uma sessão normal: a
      escrita antiga está lá, a leitura funciona, e a remoção é que é recusada.
      Sem o `try`, o app **não abre** — e o id morto é justamente o que precisa
      sair.
    */
    let removeAttempts = 0;
    const stored = new Map<string, string>([
      [TOKEN_STORAGE_KEY, 'token-da-sessao'],
      [ACTIVE_CLUB_STORAGE_KEY, 'c-que-nao-existe-mais'],
    ]);
    const readableButUnclearable: StorageLike = {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => {
        stored.set(key, value);
      },
      removeItem: () => {
        removeAttempts += 1;
        throw new Error('storage bloqueado para escrita');
      },
    };

    const calls = await renderApp(readableButUnclearable, twoClubs());

    // O id morto não virou requisição, e a home caiu no primeiro clube.
    await waitFor(() => {
      expect(shelfClubIds(calls)).toEqual(['c-casal']);
    });
    expect(shelfClubIds(calls)).not.toContain('c-que-nao-existe-mais');
    // E a limpeza foi TENTADA: sem esta asserção, um provider que nem tentasse
    // remover passaria — e aí o teste provaria "não quebra" sem exercitar a
    // linha que ele existe para cobrir (§7.3, o contador).
    expect(removeAttempts).toBeGreaterThan(0);
    // O valor continua lá, porque o navegador recusou. É o preço honesto: a
    // escolha vale só enquanto a aba estiver aberta.
    expect(stored.get(ACTIVE_CLUB_STORAGE_KEY)).toBe('c-que-nao-existe-mais');
  });

  it('does not fall over when the storage THROWS on every operation (rule 6)', async () => {
    /*
      ⚠️ A LIÇÃO DA TAREFA 12, aplicada ao clube ativo: o Safari em aba privada
      lança em `setItem`, e um navegador com armazenamento do site bloqueado
      lança até em `getItem`. Sem o `try`, o app **não abre** — e abrir no
      primeiro clube é muito melhor que uma tela branca.
    */
    const hostile: StorageLike = {
      getItem: (key) => {
        if (key === TOKEN_STORAGE_KEY) return 'token-da-sessao';
        throw new Error('storage bloqueado');
      },
      setItem: () => {
        throw new Error('storage bloqueado');
      },
      removeItem: () => {
        throw new Error('storage bloqueado');
      },
    };

    const calls = await renderApp(hostile, twoClubs());

    await waitFor(() => {
      expect(shelfClubIds(calls)).toEqual(['c-casal']);
    });
    // E a escolha também não derruba nada — só não sobrevive à recarga.
    await act(async () => {
      fireEvent.change(screen.getByLabelText(pt.pages.home.clubLabel), {
        target: { value: 'c-amigos' },
      });
    });
    await waitFor(() => {
      expect(shelfClubIds(calls)).toEqual(['c-casal', 'c-amigos']);
    });
  });

  it('has no active club at all when /me returns an empty list (rule 8)', async () => {
    /*
      O PRIMEIRO LOGIN DO PROJETO: o seed cria `admin@clube.local` com
      `isSuperAdmin: true` e zero memberships. Aqui a observável não pode ser a
      estante — não há requisição nenhuma —, então é o probe.
    */
    stubFetch(shellResponder([]));

    await act(async () => {
      renderPage(<ClubProbe />, {
        path: '/',
        storage: memoryStorage({ ...SESSION }),
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(probeText('status')).toBe('ready');
    });
    // `activeClub` é `null` e não `clubs[0]` — o `clubs[0]` de uma lista vazia
    // é `undefined`, e é ele que quebraria a primeira impressão do projeto.
    expect(probeText('active')).toBe('nenhum');
    expect(probeText('clubs')).toBe('');
  });

  it('asks for no /me at all without a session', async () => {
    // A tela de login e a de aceite não podem disparar requisição autenticada
    // nenhuma: quem não tem token não tem `/me` para buscar.
    const calls = stubFetch(shellResponder(twoClubs()));

    await act(async () => {
      renderPage(<ClubProbe />, { path: '/login', storage: memoryStorage() });
      await Promise.resolve();
    });

    expect(probeText('status')).toBe('anonymous');
    expect(requestsTo(calls, '/me')).toHaveLength(0);
  });

  it('keeps the clubs in the order /me returned them (rule 13 upstream)', async () => {
    /*
      A ordem é a da API, e o contexto não a toca: se ele ordenasse por nome, o
      SEGUNDO clube viria na frente e o padrão da regra 8 mudaria de clube.

      ⚠️ **A PRECONDIÇÃO PINADA, e sem ela este teste não provava nada** (§7.2).
      Com `'Clube dos Amigos'` no lugar de `'Amigos do Livro'`, a ordem
      alfabética COINCIDIA com a da API (`'Clube do Casal' < 'Clube dos
      Amigos'`, porque o espaço precede o `s`), e o mutante que ordena por
      `name` sobrevivia. As duas comparações estão aqui porque as duas são
      candidatas plausíveis a implementação errada — `sort()` cru e
      `localeCompare` no idioma da tela.
    */
    const [first, second] = twoClubs();
    expect(second?.name.localeCompare(first?.name ?? '', 'pt')).toBeLessThan(0);
    expect((second?.name ?? '') < (first?.name ?? '')).toBe(true);

    stubFetch(shellResponder(twoClubs()));

    await act(async () => {
      renderPage(<ClubProbe />, {
        path: '/',
        storage: memoryStorage({ ...SESSION }),
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(probeText('clubs')).toBe('c-casal,c-amigos');
    });
  });
});

/**
 * ⚠️ **QUEM SOU EU** — a Tarefa 18 (regra 20), e a ⚠️ 4 daquela spec.
 *
 * Até aqui o provider lia o `/me` e DESCARTAVA o `id` e o `name`: nenhuma tela
 * sabia separar "o que EU escrevi" do que o clube escreveu. A anotação do dia
 * precisa disso para não mostrar a própria nota na lista "das outras pessoas".
 */
describe('the provider says WHO I AM, and says nothing when it does not know (rule 20)', () => {
  it('exposes the id and the name that /me returned', async () => {
    stubFetch(shellResponder(twoClubs()));

    await act(async () => {
      renderPage(<ClubProbe />, {
        path: '/',
        storage: memoryStorage({ ...SESSION }),
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(probeText('status')).toBe('ready');
    });
    // O `meReply()` do harness é o contrato real: `{ id, email, name, ... }`.
    expect(probeText('me')).toBe('u-marcos|Marcos');
  });

  it('has NO me at all without a session', () => {
    /*
      ⚠️ A ARMADILHA NOMEADA. Um `me` inventado fora do `ready` — um
      `{ id: '', name: null }` para o tipo ficar mais simples — faria a
      comparação `note.userId === me.id` responder `false` para TODO MUNDO, em
      silêncio: a sua anotação apareceria na lista das outras pessoas, em
      leitura, sem nada vermelho para denunciar. `null` obriga quem consome a
      decidir o que fazer com "ainda não sei".
    */
    stubFetch(shellResponder(twoClubs()));

    renderPage(<ClubProbe />, { path: '/login', storage: memoryStorage() });

    expect(probeText('status')).toBe('anonymous');
    expect(probeText('me')).toBe('ninguem');
  });

  it('has NO me while the /me is in flight, and none when it FAILED', async () => {
    // Uma resposta que nunca chega: é o estado `loading`, e nele o provider
    // ainda não sabe quem é a pessoa.
    stubFetch(
      replyByUrl(
        [
          ['/auth/refresh', { status: 200, body: { token: 't' } }],
          ['/me', () => new Promise<never>(() => undefined)],
        ],
        { status: 500, body: { error: 'Internal Server Error' } },
      ),
    );

    await act(async () => {
      renderPage(<ClubProbe />, {
        path: '/',
        storage: memoryStorage({ ...SESSION }),
      });
      await Promise.resolve();
    });

    expect(probeText('status')).toBe('loading');
    expect(probeText('me')).toBe('ninguem');

    cleanup();

    stubFetch(
      replyByUrl(
        [
          ['/auth/refresh', { status: 200, body: { token: 't' } }],
          ['/me', { status: 500, body: { error: 'Boom' } }],
        ],
        { status: 500, body: { error: 'Internal Server Error' } },
      ),
    );

    await act(async () => {
      renderPage(<ClubProbe />, {
        path: '/',
        storage: memoryStorage({ ...SESSION }),
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(probeText('status')).toBe('failed');
    });
    expect(probeText('me')).toBe('ninguem');
  });
});

describe('the accept screen seeds the active club (rule 7)', () => {
  it('puts the clubId of the accepted invite in charge, not the first of /me', async () => {
    /*
      ⚠️ A PENDÊNCIA QUE A TAREFA 15 REGISTROU, e esta fatia paga: quem acabou
      de aceitar um convite não deve ter de escolher o clube em que acabou de
      entrar.

      O fixture é escolhido para a implementação errada FALHAR (§7.2): o clube
      do convite é o SEGUNDO do `/me`. Se o aceite ignorasse o `clubId` da
      resposta, o ativo seria `c-casal` (o primeiro) e a asserção acusaria.
    */
    const calls = stubFetch(
      replyByUrl(
        [
          [
            '/invites/',
            { status: 201, body: { token: 'token-novo', clubId: 'c-amigos' } },
          ],
          ['/auth/refresh', { status: 200, body: { token: 'token-novo' } }],
          ['/me', meReply({ clubs: twoClubs() })],
          ['/books/', bookWithPlanReply(aBook(), [])],
          ['/books', booksReply([aBook()])],
        ],
        { status: 500, body: { error: 'Internal Server Error' } },
      ),
    );
    const storage = memoryStorage();

    renderPage(<AppRoutes />, { path: '/convite/CONVITE-XYZ', storage });

    fireEvent.change(screen.getByLabelText(pt.pages.acceptInvite.email), {
      target: { value: 'maria@clube.test' },
    });
    fireEvent.change(screen.getByLabelText(pt.pages.acceptInvite.password), {
      target: { value: 'senha-de-oito' },
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: pt.pages.acceptInvite.submit }),
      );
    });

    await waitFor(() => {
      expect(shelfClubIds(calls)).toEqual(['c-amigos']);
    });
    expect(storage.getItem(ACTIVE_CLUB_STORAGE_KEY)).toBe('c-amigos');
  });
});

describe('the storage key of the active club', () => {
  it('is the literal value, because changing it resets everyone', () => {
    // Mesma disciplina do `TOKEN_STORAGE_KEY`: mudar a chave manda todo mundo
    // de volta para o primeiro clube na próxima atualização, em silêncio.
    expect(ACTIVE_CLUB_STORAGE_KEY).toBe('clube.activeClub');
    // E ela NÃO é a do token — colidir apagaria a sessão.
    expect(ACTIVE_CLUB_STORAGE_KEY).not.toBe(TOKEN_STORAGE_KEY);
  });

  it('holds a club id that the /me schema would accept', () => {
    // O `meResponseSchema` é o contrato do que pode virar clube ativo: se um
    // dia `clubs[].id` deixar de ser `string`, este teste acusa antes de a
    // home comparar tipos diferentes.
    const parsed: MeResponse = meResponseSchema.parse({
      id: 'u',
      email: 'u@clube.test',
      name: null,
      isSuperAdmin: false,
      clubs: [{ id: 'c-casal', name: 'Clube do Casal', role: 'OWNER' }],
    });
    expect(parsed.clubs[0]?.id).toBe('c-casal');
  });
});
