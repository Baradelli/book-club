import { TOKEN_STORAGE_KEY } from '@clube/shared/client';
import { pt } from '@clube/shared/locales';
import { act, cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import { AuthProvider } from '../auth/auth-context';
import { ActiveClubProvider } from '../club/active-club';
import { createI18n } from '../i18n';
import {
  memoryStorage,
  meReply,
  renderPage,
  replyByUrl,
  stubFetch,
} from '../pages/__tests__/harness';
import { BookFormPage } from '../pages/book-form';
import { BOOK_NEW_PATH, bookNewPath } from '../pages/paths';
import { AppRoutes } from '../router';

/**
 * ⚠️ **AS TELAS DE ADMINISTRAÇÃO ENTRAM POR `React.lazy()` — E A FRONTEIRA DE
 * `Suspense` É DESTE ARQUIVO** (Tarefa 44c).
 *
 * O acusador de BYTES é `src/__tests__/bundle-guard.test.ts`, que compila de
 * verdade e prova duas coisas: o formulário de livro **não** está no chunk de
 * entrada, e ele tem chunk próprio que o `index.html` não pede.
 *
 * ⚠️ **MAS AQUELA GUARDA NÃO SABE O QUE A PESSOA VÊ ENQUANTO O CHUNK NÃO
 * CHEGA.** Um `lazy()` sem fronteira de `Suspense` acima dele passa no build
 * inteiro e encolhe a entrada exatamente do mesmo tanto. Aqui mora o QUADRO.
 *
 * ⚠️⚠️ **O INSTRUMENTO É `renderToString`, E ELE É O QUE O §7.10 MANDA USAR.**
 * A convenção registra por escrito que *"`renderToString` (`react-dom/server`,
 * já disponível) **não roda efeito nenhum** — ou seja, é literalmente o frame
 * que o `act()` descarta e o navegador pinta"*, e o projeto já o usa em
 * `pages/__tests__/home.test.tsx:9` e `:2213` e em
 * `pages/__tests__/anti-guilt-dom.ts:309`. A primeira versão desta fatia
 * inventou um mecanismo próprio (render síncrono do RTL + um `beforeAll` de
 * aquecimento) para o problema que a convenção já resolvia. Trocado, e o que
 * a troca comprou está medido nas notas nº 11 e nº 12 da tarefa.
 *
 * ⚠️⚠️ **E A TROCA MUDA O QUE O DEFEITO FAZ — de silêncio para EXCEÇÃO.** A
 * fatia mediu, e a metade certa continua valendo: **na raiz concorrente do
 * cliente**, um `lazy()` sem NENHUMA fronteira de `Suspense` não estoura no
 * React 18. A sonda foi um `render(<Late />)` solto, sem `Suspense` em lugar
 * nenhum da árvore: `document.body.innerHTML` é `'<div></div>'`, sem exceção e
 * sem `console.error`, e o conteúdo entra sozinho quando a promessa resolve.
 *
 * **Mas sob `renderToString` ele LANÇA** — medido com a mesma árvore desta
 * guarda, um `lazy()` sem fronteira:
 *
 *   Error: A component suspended while responding to synchronous input.
 *
 * É por isso que apagar o `<Suspense>` do `router.tsx` deixava, na versão
 * anterior, **940 de 941** testes verdes (o defeito era o `<main>` VAZIO
 * debaixo do cabeçalho, em silêncio) e hoje derruba os dois testes deste
 * arquivo com um erro que se lê de cima a baixo.
 *
 * ⚠️ **POR QUE O `fallback` É VISÍVEL, E NÃO `null`** (decisão E). O precedente
 * do editor tem os dois modos, cada um com a razão ao lado:
 *
 * - `day-note.tsx:806` usa `fallback` VISÍVEL porque *"o chunk do editor pode
 *   demorar e sem um fallback a tela ficaria em branco no lugar dele"*;
 * - `day-note.tsx:949` usa `fallback={null}` porque *"a coluna principal já
 *   diz 'Abrindo o editor…', e uma segunda cópia da mesma frase na margem seria
 *   ruído"*.
 *
 * ⚠️ **E HÁ UM TERCEIRO PRECEDENTE, que a primeira versão desta fatia não
 * citou: `highlight-form.tsx:177-182`** — `fallback` visível, com o
 * `<p className="text-sm text-muted">` IDÊNTICO ao daqui. Ele REFORÇA a
 * escolha: dos três `Suspense` de tela que o app já tinha, dois são visíveis e
 * os dois usam exatamente esta marcação.
 *
 * Aqui o `lazy()` é a ROTA INTEIRA: não há coluna principal ao lado dizendo
 * outra coisa, e `null` deixaria o `<main>` **vazio** debaixo do cabeçalho do
 * shell — que para quem está numa rede ruim é indistinguível de "o app
 * quebrou". Então vale o primeiro modo.
 *
 * ⚠️ **O QUE ESTE ARQUIVO NÃO REFAZ:** as 47 asserções de
 * `pages/__tests__/book-form.test.tsx` continuam como estavam, palavra por
 * palavra — papel, corte de tenant, validação, plano. O `lazy()` não muda o
 * que a tela faz, e a regra 4 da fatia é justamente que elas não precisem ser
 * reescritas para acomodá-lo. Aqui mora só o que é da FRONTEIRA.
 *
 * ⚠️ **O `import` ESTÁTICO DO `book-form` AQUI EM CIMA NÃO DESFAZ NADA.** Ele é
 * de um arquivo de TESTE, e o que o `bundle-guard.test.ts` compila é o
 * `index.html` — a pasta `__tests__` não entra em build nenhum. Ele existe para
 * a segunda guarda, que precisa do quadro de carregamento da TELA para comparar
 * com o do `fallback`. E ele tem um efeito colateral bom, medido: o módulo do
 * formulário já está carregado quando o terceiro teste abre a rota de verdade,
 * então o `beforeAll` de aquecimento que a versão anterior deste arquivo tinha
 * **deixou de existir** (nota nº 12).
 */

const CLUB_ID = 'c-casal';

const SESSION: Record<string, string> = {
  [TOKEN_STORAGE_KEY]: 'token-da-sessao',
};

/**
 * O PRIMEIRO QUADRO, sem efeito nenhum — a ferramenta do §7.10.
 *
 * A árvore é a mesma de `home.test.tsx:2213`, e pelo mesmo motivo: providers de
 * verdade, `MemoryRouter` no endereço que interessa, e nenhum `act()` para
 * descarregar os efeitos que o navegador ainda não rodou.
 */
function firstFrame(children: ReactNode): string {
  const storage = memoryStorage({ ...SESSION });

  return renderToString(
    <I18nextProvider i18n={createI18n()}>
      <AuthProvider storage={storage} baseUrl="https://api.teste">
        <ActiveClubProvider storage={storage}>
          <MemoryRouter initialEntries={[bookNewPath(CLUB_ID)]}>
            {children}
          </MemoryRouter>
        </ActiveClubProvider>
      </AuthProvider>
    </I18nextProvider>,
  );
}

/**
 * ⚠️ **O QUADRO DA FRONTEIRA, RENDERIZADO UMA VEZ SÓ — e a memoização é uma
 * PROPRIEDADE, não cache de conveniência.**
 *
 * Só existe UM "primeiro quadro" por registro de módulos: o `React.lazy` do
 * `router.tsx` guarda o estado da promessa no próprio objeto, e assim que ela
 * resolve (o que acontece sozinho entre um teste e o seguinte) a fábrica deixa
 * de suspender e o SSR passa a renderizar a tela inteira. Medido: sem esta
 * memoização o segundo teste veria o `<h1>Novo livro</h1>` e a guarda ficaria
 * vermelha por ORDEM DE EXECUÇÃO, não por defeito.
 *
 * Ela não esconde falha nenhuma: o render acontece uma vez, e se ele lançar
 * (fronteira apagada) ninguém guarda nada — o teste seguinte tenta de novo e
 * lança igual.
 */
let boundaryFrame: string | undefined;

function boundaryFirstFrame(): string {
  boundaryFrame ??= firstFrame(<AppRoutes />);
  return boundaryFrame;
}

/**
 * O `<p>` do "Carregando…" **como o HTML o traz — com a classe dentro**.
 *
 * É a classe que faz a segunda guarda morder: a promessa escrita no
 * `router.tsx` é que a troca do `fallback` pelo conteúdo não repinta, e ela
 * depende inteiramente de os dois `<p>` serem byte a byte iguais.
 */
function loadingParagraph(html: string): string | null {
  const text = pt.pages.bookForm.loading.replace(
    /[.*+?^${}()|[\]\\]/gu,
    '\\$&',
  );

  return new RegExp(`<p\\b[^>]*>${text}</p>`, 'u').exec(html)?.[0] ?? null;
}

/** Descarrega as microtarefas pendentes — a suíte não usa timers falsos. */
async function settle(): Promise<void> {
  for (let step = 0; step < 10; step += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the admin routes behind React.lazy (task 44c)', () => {
  it('⚠️ shows the loading line INSTEAD of an empty main while the admin chunk arrives', () => {
    /*
      ⚠️ **ESTA CHAMADA É O ACUSADOR DO `Suspense`, e ela acusa LANÇANDO.**
      Sem a fronteira, o `renderToString` morre com *"A component suspended
      while responding to synchronous input"* antes de chegar a qualquer
      asserção. Era o defeito que a versão anterior desta guarda tinha de
      perseguir com um `queryByText` sutil, porque no cliente ele é silencioso.
    */
    const html = boundaryFirstFrame();

    /*
      ⚠️ **O TÍTULO AUSENTE É O QUE PROVA QUE O CHUNK AINDA NÃO CHEGOU.**

      Com um `import` ESTÁTICO do `book-form.tsx`, este primeiro quadro já
      teria o `<h1>Novo livro</h1>`: a tela renderiza
      `<Screen title={newTitle}>{waiting}</Screen>` enquanto espera o `/me`
      (`book-form.tsx:134`). Quem prova que ele apareceria é a guarda seguinte,
      que renderiza a tela de verdade no mesmo quadro e o encontra lá.
    */
    expect(html).not.toContain(pt.pages.bookForm.newTitle);

    /*
      ⚠️ **E O `<main>` NÃO FICA VAZIO** — o acusador da decisão E. Trocar o
      `fallback` por `null` deixa esta linha vermelha, que é exatamente o que
      se quer: a escolha do fallback passa a ter dono, em vez de ser um detalhe
      que a próxima fatia troca sem perceber.
    */
    expect(loadingParagraph(html)).not.toBeNull();
  });

  it('⚠️ paints the SAME loading paragraph the screen itself paints, class included (task 44c)', () => {
    /*
      ⚠️⚠️ **A GUARDA DA FRASE ESCRITA EM TRÊS LUGARES: "a troca do fallback
      pelo conteúdo é literalmente invisível".**

      Ela é uma propriedade de DUAS fontes independentes — o `fallback` do
      `router.tsx` e o `meNotice` do `book-form.tsx:122` — e vale só enquanto os
      dois `<p>` forem byte a byte iguais, classe inclusa. Até esta rodada
      **nada a guardava**: trocar só o `className` do `fallback` (mantendo a
      chave de catálogo) deixava **941/941 verdes, zero acusadores**. É a forma
      exata do §7.9 — requisito escrito como propriedade medida, sem guarda.

      ⚠️ **E ela sai de graça do `renderToString`**, que é o argumento do §7.10
      em uma linha: o HTML emitido traz `class="text-sm text-muted"` no texto,
      enquanto o `queryByText` do RTL enxergava só a frase.
    */
    const boundary = boundaryFirstFrame();
    const screenHtml = firstFrame(
      <Routes>
        <Route path={BOOK_NEW_PATH} element={<BookFormPage />} />
      </Routes>,
    );

    /*
      ⚠️ O PAR POSITIVO (§7.4), e aqui ele é duplo. Sem a primeira linha, uma
      tela que não renderizasse nada faria `null === null` passar — provando
      nada. Sem a segunda, "o título não está no quadro da fronteira" (a guarda
      acima) seria verdade por omissão: é esta linha que mede que o `<h1>`
      **apareceria** se o chunk já estivesse lá.
    */
    expect(screenHtml).toContain(pt.pages.bookForm.newTitle);
    expect(loadingParagraph(screenHtml)).not.toBeNull();

    expect(loadingParagraph(boundary)).toBe(loadingParagraph(screenHtml));
  });

  it('⚠️ mounts the admin screen once the chunk lands, so the boundary is not decorative', async () => {
    /*
      ⚠️ **O ÚNICO TESTE DESTE ARQUIVO QUE MONTA A ROTA DE VERDADE**, e é o que
      o SSR não sabe fazer: `renderToString` nunca espera a promessa, então ele
      jamais veria o segundo quadro.

      O que ele impede é as duas guardas de cima ficarem verdes **por omissão**:
      "não há título no primeiro quadro" é trivialmente verdade no dia em que a
      rota deixar de montar — um `import()` apontando para um caminho que não
      existe, a rota apagada do `router.tsx`, o `lazy()` rejeitando. Sem esta
      linha, a fatia inteira passaria com a tela de administração morta.
    */
    stubFetch(
      replyByUrl(
        [
          ['/auth/refresh', { status: 200, body: { token: 'token-renovado' } }],
          [
            '/me',
            meReply({
              clubs: [{ id: CLUB_ID, name: 'Clube do Casal', role: 'OWNER' }],
            }),
          ],
        ],
        { status: 500, body: { error: 'Internal Server Error' } },
      ),
    );

    renderPage(<App />, {
      path: bookNewPath(CLUB_ID),
      storage: memoryStorage({ ...SESSION }),
    });
    await settle();

    expect(
      screen.queryByRole('heading', { name: pt.pages.bookForm.newTitle }),
    ).not.toBeNull();
  });
});
