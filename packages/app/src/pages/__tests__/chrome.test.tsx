import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Notice, Screen } from '../chrome';
import { stripComments } from './anti-guilt-dom';

/**
 * O CROMO DAS TELAS — as regras 1, 2 e 3 da Tarefa 25.
 *
 * ⚠️ **POR QUE ESTE MÓDULO NASCEU, e a medição que o pediu.** O `Notice` tinha
 * **cinco** cópias no `pages/` — três byte-idênticas (`book-form`, `day-note`,
 * `free-note`) e duas com um `description` a mais (`home`, `book`) — e o
 * `Screen` tinha **quatro** ocorrências do mesmo `<section>` + `h1`, três
 * `max-w-2xl` e uma `max-w-4xl`. A tela de grifos desta fatia seria a 6ª e a
 * 5ª. É a lição nº 3 do MVP 1 ("o que está duplicado com forças diferentes
 * divergiu na primeira correção") acontecendo em cima do CROMO, e a saída é a
 * mesma que a Tarefa 23 tomou com o `matches` dos fakes: **extrair, não copiar
 * uma sexta vez**.
 *
 * ⚠️ **E ELA TEM DE SER MENSURÁVEL (regra 2), não declarada.** Um módulo
 * compartilhado que ninguém importa é uma cópia com endereço novo. A prova de
 * que as telas usam ESTE `Notice` é dupla:
 *
 * 1. **estrutural, aqui**: nenhuma das cinco telas declara `function Notice` ou
 *    `function Screen`, e todas importam de `./chrome` (a varredura de fonte
 *    abaixo);
 * 2. **por mutação, no relatório**: apagar o `<p>` do `title` deste `Notice`
 *    deixa vermelho em **mais de uma** suíte de tela. Se acusasse em uma só, as
 *    telas não estariam usando o compartilhado — e é justamente esse o falso
 *    verde que a regra 2 existe para fechar.
 *
 * O que NÃO se testa aqui: espaçamento, cor e o resto da aparência — o dono é o
 * QA disso (`CLAUDE.md`, política de testes de UI). O que se testa é o que
 * quebra calado: um `description` ausente virando bloco vazio, e um `h1` que
 * desaparece (é ele que faz de "carregando" um ESTADO em vez de uma tela
 * branca).
 */

/** As cinco telas que a fatia migra. */
const MIGRATED_SCREENS: readonly string[] = [
  'home.tsx',
  'book.tsx',
  'book-form.tsx',
  'day-note.tsx',
  'free-note.tsx',
];

function pageSource(file: string): string {
  return readFileSync(resolve(__dirname, '..', file), 'utf8');
}

/**
 * Todas as TELAS de `pages/` — os `.tsx`, sem entrar em `__tests__`.
 *
 * O `chrome.tsx` sai porque ele **é** o cromo: é dele que o `h1` tem de sair, e
 * incluí-lo faria a guarda acusar a própria implementação que ela protege.
 */
function pageFiles(): string[] {
  return readdirSync(resolve(__dirname, '..'))
    .filter((entry) => entry.endsWith('.tsx') && entry !== 'chrome.tsx')
    .sort();
}

/**
 * ⚠️ **AS DUAS EXCEÇÕES DA GUARDA DO `h1`, e as duas são MEDIDAS** — não
 * "ainda não migrei".
 *
 * - `accept-invite.tsx`: o `h1` dele vive dentro de um
 *   `<div className="flex flex-col gap-2">` junto com a descrição da tela.
 *   Passá-lo para o `Screen` afastaria título e descrição de `gap-2` para
 *   `gap-6` — uma mudança VISUAL numa tela que esta fatia não tocou, e que o
 *   `Screen` não sabe expressar (ele não agrupa filhos).
 * - `not-found.tsx`: a `<section>` dele é
 *   `mx-auto flex max-w-md flex-col items-start gap-3 p-6` — **sem `w-full`**,
 *   com `items-start` e `gap-3`. São TRÊS divergências de layout, não uma;
 *   cobri-las pediria um terceiro `spacing`, uma prop de alinhamento e um
 *   `w-full` opcional, para a tela que não mostra conteúdo de clube nenhum.
 *
 * A lista é fechada e conferida pelo teste abaixo: uma exceção nova exige
 * escrevê-la aqui, com o motivo — é a disciplina das "isenções mínimas e
 * declaradas" da guarda de boot do backend (§6.1).
 */
const H1_EXCEPTIONS: readonly string[] = ['accept-invite.tsx', 'not-found.tsx'];

describe('Notice (rule 1)', () => {
  it('shows the title, and nothing else when there is nothing else', () => {
    render(<Notice title="Este livro ainda não tem plano de leitura." />);

    expect(
      screen.queryByText('Este livro ainda não tem plano de leitura.'),
    ).not.toBeNull();
    // Nenhum botão inventado, e — a parte que quebra calado — nenhum parágrafo
    // vazio no lugar da descrição que ninguém passou.
    expect(document.querySelectorAll('button')).toHaveLength(0);
    expect(document.querySelectorAll('p')).toHaveLength(1);
  });

  it('shows the description when there IS one', () => {
    /*
      ⚠️ O `description` é o que separava as duas variantes divergentes: as
      cópias de `home`/`book` o tinham, as de `book-form`/`day-note`/`free-note`
      não. Um `description?` opcional cobre os cinco casos — e os dois testes
      acima e aqui são o par que impede o opcional de virar obrigatório (um
      bloco vazio) ou de ser ignorado (a frase desaparecendo).
    */
    render(
      <Notice
        description='Toque em "Nova anotação" para escrever a primeira.'
        title="Nenhuma anotação por aqui ainda."
      />,
    );

    expect(
      screen.queryByText('Toque em "Nova anotação" para escrever a primeira.'),
    ).not.toBeNull();
    expect(document.querySelectorAll('p')).toHaveLength(2);
  });

  it('renders the action it was given', () => {
    render(
      <Notice
        action={<button type="button">Tentar de novo</button>}
        title="Não foi possível abrir este livro agora."
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Tentar de novo' }),
    ).not.toBeNull();
  });
});

describe('Screen (rule 1)', () => {
  it('always has an h1 with the title — never a blank screen', () => {
    render(
      <Screen title="Livro">
        <p>Carregando…</p>
      </Screen>,
    );

    expect(
      screen.queryByRole('heading', { level: 1, name: 'Livro' }),
    ).not.toBeNull();
    expect(screen.queryByText('Carregando…')).not.toBeNull();
  });

  it('is narrow by default and wide when asked — the two widths that exist', () => {
    /*
      As duas larguras são as que as cópias tinham: `max-w-2xl` nas telas de
      leitura/escrita e `max-w-4xl` no cadastro do livro (decisão F da Tarefa
      20 — a linha do plano tem três campos e cabe inteira no desktop).

      A classe é assertada porque é a ÚNICA observável: o jsdom não tem layout,
      então "é mais larga" não é medível aqui. E as duas grafias existem
      literalmente no `chrome.tsx`, que é o que faz o Tailwind emiti-las.
    */
    const { container } = render(
      <Screen title="Livro">
        <p>a</p>
      </Screen>,
    );
    const narrow = container.querySelector('section');
    expect(narrow?.className).toContain('max-w-2xl');
    expect(narrow?.className).not.toContain('max-w-4xl');

    const wide = render(
      <Screen title="Novo livro" width="wide">
        <p>a</p>
      </Screen>,
    ).container.querySelector('section');
    expect(wide?.className).toContain('max-w-4xl');
    expect(wide?.className).not.toContain('max-w-2xl');
  });
});

/**
 * ⚠️ **REGRA 2 — A UNIFICAÇÃO É ESTRUTURAL, e é isto que a torna mensurável.**
 *
 * Sem esta varredura, uma tela poderia continuar com a cópia local e passar em
 * tudo acima: o módulo existiria, os testes dele estariam verdes, e a mutação
 * do `Notice` compartilhado acusaria em **uma** suíte só. A propriedade "as
 * telas usam o compartilhado" é do CÓDIGO-FONTE, e é aqui que ela é decidível.
 */
describe('⚠️ NO SCREEN KEEPS A LOCAL COPY (rules 1, 2)', () => {
  it.each(MIGRATED_SCREENS)(
    '%s declares no Notice and no Screen of its own',
    (file) => {
      const source = stripComments(pageSource(file));

      expect(source).not.toContain('function Notice(');
      expect(source).not.toContain('function Notice({');
      expect(source).not.toContain('function Screen(');
      expect(source).not.toContain('function Screen({');
    },
  );

  it.each(MIGRATED_SCREENS)('%s imports the chrome from ./chrome', (file) => {
    const source = stripComments(pageSource(file));

    // O lado positivo do par: um caminho errado lançaria, mas um arquivo VAZIO
    // passaria calado nas duas asserções negativas acima (§7.4 escrito como
    // varredura de fonte).
    expect(source).toContain("from './chrome'");
  });

  /**
   * ⚠️ **A GUARDA QUE NÃO DEPENDE DO NOME DE NENHUMA FUNÇÃO** — a correção da
   * auditoria da Tarefa 25.
   *
   * As duas varreduras acima conferem ausência de `function Notice(`/`function
   * Screen(`, e a **home passava trivialmente**: ela nunca declarou uma função
   * `Screen` — tinha a `<section>` + `h1` escritas direto no `return`. Ou seja,
   * a 5ª cópia do cromo era invisível para a guarda que existe exatamente para
   * pegá-la, e o mesmo valia para o `login.tsx` e o `accept-invite.tsx`, que
   * eram **byte-idênticos** entre si.
   *
   * O `h1` é a propriedade certa porque é a única coisa que TODA tela tem e que
   * só o `Screen` deve produzir: é ele que faz de "carregando" um ESTADO em vez
   * de uma tela branca.
   */
  it('⚠️ no page declares an h1 of its own — the Screen owns it', () => {
    const offenders = pageFiles()
      .filter((file) => !H1_EXCEPTIONS.includes(file))
      .filter((file) => stripComments(pageSource(file)).includes('<h1'));

    expect(offenders).toEqual([]);
  });

  it('has read the pages where an h1 would live, and the exceptions still exist', () => {
    /*
      A precondição: sem ela, um `pageFiles()` que devolvesse lista vazia — ou
      uma lista de exceções que engolisse tudo — deixaria a guarda acima verde
      provando nada (§7.4 escrito como varredura de fonte).
    */
    const scanned = pageFiles();

    expect(scanned.length).toBeGreaterThan(10);
    for (const file of [...MIGRATED_SCREENS, 'highlights.tsx', 'login.tsx']) {
      expect(scanned).toContain(file);
    }
    // E as exceções são só as duas declaradas, e existem de fato.
    expect(H1_EXCEPTIONS).toEqual(['accept-invite.tsx', 'not-found.tsx']);
    for (const file of H1_EXCEPTIONS) {
      expect(scanned).toContain(file);
      expect(stripComments(pageSource(file))).toContain('<h1');
    }
  });

  it('reads the screens themselves, not some other file', () => {
    // A pré-condição da varredura: os arquivos lidos são MESMO as telas. Sem
    // ela, um `resolve` errado que devolvesse qualquer arquivo sem a palavra
    // "Notice" deixaria os dez testes acima verdes.
    for (const file of MIGRATED_SCREENS) {
      expect(pageSource(file)).toContain('export function');
    }
    expect(pageSource('book.tsx')).toContain('pages.book.plan.today');
    expect(pageSource('home.tsx')).toContain('pages.home.today.heading');
  });
});
