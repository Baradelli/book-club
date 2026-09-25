import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MarginRail } from '@clube/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { Notice, Screen, ScreenContextBar } from '../chrome';
import { stripComments } from './anti-guilt-dom';
import { LocationProbe } from './harness';

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

  /**
   * ⚠️ **O TÍTULO NA TIPOGRAFIA DO CANVAS — e ele NÃO TINHA ACUSADOR NENHUM.**
   *
   * Medido na auditoria da Tarefa 42: trocar o `SCREEN_TITLE_CLASS` pela
   * classe **pré-42** (`text-2xl font-semibold`) — ou seja, desfazer a decisão
   * inteira — passava por **886 testes sem um vermelho**. O `h1` existia, o
   * texto estava lá, e nenhuma asserção falava da FONTE.
   *
   * É a mesma forma, pela mesma razão, do
   * `app.test.tsx › writes the name of the app in the reading serif`.
   *
   * ⚠️ **E OS NÚMEROS SÃO OS DA MAIORIA, contados h1 a h1 nos 21 artboards**
   * (`grep -n '<h1' *.html` → **15** ocorrências; **10** delas são o
   * `Screen.title` de uma tela que usa este cromo):
   *
   * | propriedade | o que o canvas usa nessas 10 | entregue |
   * | --- | --- | --- |
   * | `line-height` | 1.14 (×4) · 1.15 (×3) · 1.18 (×3) | **1.14**, a maioria |
   * | `letter-spacing` | −0.02em (×6) · −0.015em (×4) | **−0.02em**, a maioria |
   * | `font-size` | 23 · 25 · 26 (×2) · 27 · 28 (×3) · 30 px | **25px** (`text-title`), com a divergência declarada no docblock |
   *
   * ⚠️ **REPAGINAÇÃO VISUAL — decisão do dono de 2026-09-24** ("mais atual,
   * sofisticado, cara de app de celular", letra maior). A tabela acima é a do
   * canvas e fica como registro; o título entregue hoje é mais cheio e mais
   * justo: `font-semibold`, `leading-[1.08]`, `tracking-[-0.03em]`, com o
   * `text-title` subindo para 32px no `theme.css`. O que NÃO mudou, e é o
   * que esta guarda existe para segurar: a serifa de leitura (`font-reading`)
   * e o degrau da escala (`text-title`), nunca um `text-2xl` solto.
   */
  it('⚠️ writes the title in the reading serif of the canvas, not in the UI sans', () => {
    const { container } = render(
      <Screen title="Livro">
        <p>a</p>
      </Screen>,
    );
    const heading = container.querySelector('h1');
    if (heading === null) throw new Error('o `Screen` não desenhou `h1`');

    // A serifa de leitura é a propriedade que o mutante pré-42 apagava.
    expect(heading.className).toContain('font-reading');
    expect(heading.className).toContain('text-title');
    // O peso e os dois arbitrários da repaginação (2026-09-24) — eles NÃO
    // são degraus de escala, então ficam pinados aqui.
    expect(heading.className).toContain('font-semibold');
    expect(heading.className).toContain('leading-[1.08]');
    expect(heading.className).toContain('tracking-[-0.03em]');
    // O que a classe pré-42 tinha, e que a decisão da fatia revoga.
    expect(heading.className).not.toContain('text-2xl');
  });

  it('gives the entry screen the SAME title typography', () => {
    /*
      O par positivo: sem ele, o ramo `entry` poderia divergir em silêncio —
      ele tem `return` próprio, e foi exatamente assim que o `accept-invite` e
      o `not-found` ficaram com a tipografia pré-42 por uma rodada inteira.
    */
    const { container } = render(
      <Screen title="Entrar" width="entry">
        <p>a</p>
      </Screen>,
    );

    expect(container.querySelector('h1')?.className).toContain('font-reading');
    expect(container.querySelector('h1')?.className).toContain(
      'leading-[1.08]',
    );
  });

  /**
   * ⚠️ **ESTE `it()` SUBSTITUI O `is narrow by default and wide when asked —
   * the two widths that exist`, E A PROPRIEDADE MUDOU POR DECISÃO, NÃO POR
   * IMPLEMENTAÇÃO.**
   *
   * A decisão B da Tarefa 42 (fechada pelo dono, `docs/tasks/42-o-shell.md`)
   * diz: *"as duas larguras (`max-w-2xl` / `max-w-4xl`) dão lugar ao modelo do
   * canvas: coluna de 680px + margem de 320px acima de 1120px, uma coluna com
   * 20px de recuo abaixo"*. O teste antigo assertava exatamente as duas
   * grafias que a decisão manda apagar — mantê-lo seria pinar o que foi
   * revogado.
   *
   * `entry` (`max-w-md`) **não** foi tocado: ele continua servindo login e
   * aceite de convite, que o canvas desenha estreitos, e ganhou um `it()` só
   * dele logo abaixo.
   */
  it('puts the reading column INSIDE the Screen — the canvas model (decision B)', () => {
    /*
      A classe é a ÚNICA observável: o jsdom não tem layout, então "tem 680px"
      não é medível aqui — mesma escolha, e mesma razão, do teste que este
      substitui. Quem mede os 680px contra o canvas é
      `reading-column.test.tsx`, em `@clube/ui`.

      ⚠️ **A decisão A continua de pé:** o `ReadingColumn` entra DENTRO do
      `Screen`, não no lugar dele — por isso o `h1` continua saindo daqui, e a
      guarda `no page declares an h1 of its own` não precisou de uma linha.
    */
    const { container } = render(
      <Screen title="Livro">
        <p>a</p>
      </Screen>,
    );

    expect(
      screen.queryByRole('heading', { level: 1, name: 'Livro' }),
    ).not.toBeNull();

    const column = container.querySelector('[class*="w-[680px]"]');
    expect(column).not.toBeNull();
    // As duas grafias que a decisão B revoga não sobrevivem em lugar nenhum.
    expect(container.innerHTML).not.toContain('max-w-2xl');
    expect(container.innerHTML).not.toContain('max-w-4xl');
  });

  it('keeps the entry width for login and invite (decision B)', () => {
    /*
      ⚠️ `ScreenWidth` NÃO morreu: o canvas desenha login e convite estreitos
      (`Main.dc.html`, `Convite.dc.html`), e uma coluna de leitura de 680px
      para um formulário de dois campos é o contrário disso.
    */
    const { container } = render(
      <Screen spacing="airy" title="Entrar" width="entry">
        <p>a</p>
      </Screen>,
    );

    expect(container.querySelector('section')?.className).toContain('max-w-md');
    // E a tela de entrada NÃO é a edição crítica: não há coluna nem margem.
    expect(container.querySelector('[class*="w-[680px]"]')).toBeNull();
    expect(container.querySelector('aside')).toBeNull();
  });
});

/**
 * ⚠️ **A DECISÃO C — A CAPACIDADE NASCE, O CONTEÚDO NÃO.**
 *
 * O `Screen` passa a saber desenhar duas colunas, e **nenhuma tela desta fatia
 * passa `rail`**: quem preenche a margem são as Tarefas 43 (grifos da
 * leitura), 44 (marcas e "Neste livro"), 45 (correntes e feed) e 46 (o painel
 * de refinar).
 *
 * O caso que quebra calado é o VAZIO: uma margem que nasce sempre desenha um
 * `<aside>` com `border-left` e 320px de largura acima de 1120px — ou seja, um
 * filete vertical solto e um terço da tela em branco, em **todas** as telas, e
 * nada em teste de render acusaria porque o elemento existiria e estaria
 * vazio.
 */
describe('⚠️ the margin rail is a CAPACITY, not content (decision C)', () => {
  it('draws no aside and no hairline when no screen passes a rail', () => {
    const { container } = render(
      <Screen title="Dia">
        <p>a</p>
      </Screen>,
    );

    expect(container.querySelector('aside')).toBeNull();
    // E nada de `border-l`: o filete é propriedade da DUPLA, e sem margem não
    // há dupla. Um traço vertical solto à esquerda da página é o defeito.
    expect(container.innerHTML).not.toContain('border-l');
  });

  /**
   * ⚠️ **O NOME DESTE `it()` PROMETIA MAIS DO QUE ELE MEDIA** — achado da
   * auditoria da Tarefa 42.
   *
   * A primeira versão passava `rail={<aside>as marcas</aside>}` e então
   * procurava `container.querySelector('aside')`: o `<aside>` que ela achava
   * era **o próprio fixture**, e do "hairline que separa" não havia asserção
   * nenhuma. Ou seja, ela provava que o `Screen` **repassa** o `rail` — o que
   * é verdade e é útil —, mas com o nome de outra coisa.
   *
   * O `Screen` de fato **não** renderiza o `MarginRail`: quem o põe é a tela,
   * porque é a tela que sabe se a margem tem nome acessível (o `aria-label` é
   * opcional no `MarginRail` por decisão da 41b). Então o fixture agora é o que
   * as Tarefas 43 a 46 vão escrever de verdade, e a asserção é sobre o filete.
   */
  it('renders the rail it was given, with the hairline that separates it', () => {
    const { container } = render(
      <Screen rail={<MarginRail>as marcas</MarginRail>} title="Dia">
        <p>a</p>
      </Screen>,
    );

    const aside = container.querySelector('aside');
    const column = container.querySelector('[class*="w-[680px]"]');
    if (aside === null || column === null) {
      throw new Error('o `Screen` não desenhou coluna e margem');
    }

    expect(aside.textContent).toBe('as marcas');
    // O filete é propriedade da DUPLA, e só existe acima do corte: abaixo dele
    // a margem ocupa a largura da tela e um `border-left` seria um traço
    // vertical solto à esquerda da página.
    expect(aside.className).toContain('min-[1120px]:border-l');
    // E ele vem DEPOIS da coluna no DOM (regra 6 da Tarefa 41b): quem navega
    // por teclado chega ao texto antes do aparato.
    expect(
      column.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('passes the rail through UNTOUCHED — it does not wrap it in a MarginRail of its own', () => {
    /*
      A outra metade, e ela é o que impede o teste acima de ser lido como "o
      `Screen` embrulha a margem": ele repassa. Se um dia ele embrulhar, a
      tela que já passa um `MarginRail` ganha DOIS `<aside>` aninhados, com
      dois filetes e 640px de margem — e o teste acima continuaria verde.
    */
    const { container } = render(
      <Screen rail={<p data-testid="cru">as marcas</p>} title="Dia">
        <p>a</p>
      </Screen>,
    );

    expect(container.querySelector('aside')).toBeNull();
    expect(container.querySelector('[data-testid="cru"]')).not.toBeNull();
  });
});

/**
 * ⚠️ **O RECUO DE TOPO — e a classe que some em silêncio.**
 *
 * A primeira entrega desta fatia dedicou um parágrafo a provar **por byte** que
 * a ORDEM de emissão do Tailwind faz o `min-[1120px]:pt-0` vencer o `pt-5` no
 * mesmo elemento. Medido na auditoria: **apagar a classe** passava por 886
 * testes — não era só a ordem que não tinha pino, a **existência** também não.
 *
 * Sem ela, acima de 1120px o recuo de topo vira 40px (do `ReadingColumn`) mais
 * 20px (daqui) = **60px**, contra os 40px que quatro dos cinco artboards de
 * desktop desenham. E ninguém vê: é espaço em branco.
 */
describe('⚠️ the top gutter of the reading screen (task 42, audit A4)', () => {
  function sectionClasses(): string {
    const { container } = render(
      <Screen title="Dia">
        <p>a</p>
      </Screen>,
    );
    const section = container.querySelector('section');
    if (section === null) throw new Error('o `Screen` não desenhou `section`');
    return section.className;
  }

  it('gives the phone its own top gutter (16px since 2026-09-24), and hands the desktop back to the column', () => {
    const classes = sectionClasses();

    // `Livro.dc.html:41` e `Dia.dc.html:41` desenham `padding:…20px…` no
    // topo do `main`; a repaginação (2026-09-24) trouxe o topo para 16px
    // (`pt-4`), junto com o cabeçalho fixo e translúcido.
    expect(classes).toContain('pt-4');
    // E acima do corte quem manda é o `min-[1120px]:pt-10` do `ReadingColumn`:
    // sem este `pt-0` os dois se SOMAM, e o desktop fica com 60px.
    expect(classes).toContain('min-[1120px]:pt-0');
  });
});

/**
 * ============================================================================
 * O FILETE DUPLO — a contagem da primeira entrega estava errada, e o padrão
 * que ela escolheu era a MINORIA
 * ============================================================================
 *
 * ⚠️ **A primeira entrega desta fatia escreveu, com ênfase, "São TRÊS
 * artboards na primeira linha e UM na segunda — contados, não generalizados".
 * Medido agora, os dois números estão errados**, e a lista de três citava um
 * artboard (`NovaAnotacao`) que **não tem `<h1>` nenhum** e omitia o
 * `DiaEscuro`.
 *
 * Contado com o par de `<div>` de `gap:3px` dos 21 artboards: o canvas tem
 * **15** filetes duplos, não 4. E **onde o `Screen` põe o dele — logo abaixo
 * do `<h1>`** —, são **10**:
 *
 * | ordem | quantos | onde |
 * | --- | --- | --- |
 * | `--accent` 2px, depois hairline (`top`) | **7** | `Acervo:45`, `Busca:45`, `Convite:37`, `EditarLivro:48`, `Main:35`, `NovoLivro:48`, `Preferencias:45` |
 * | hairline, depois `--accent` 2px (`bottom`) | **3** | `Dia:49`, `DiaEscuro:49`, `DiaDesktop:58` |
 *
 * Logo o **padrão é `top`**, e `bottom` é a exceção das telas de escrita — que
 * é onde o filete "entrega a página". `Inicio:44` e `InicioDesktop:45` também
 * são `top`, mas ficam ACIMA do `h1`, então não entram nesta conta.
 *
 * ⚠️ **E existe uma terceira forma, que a primeira entrega não tinha:
 * NENHUM filete.** `Livro.dc.html` (a tela do livro) e os dois artboards de
 * grifo (`NovoGrifo`, `CorrigirGrifo`) não desenham filete algum — e o
 * `Screen` o desenhava incondicionalmente nas três. Daí o `rule="none"`.
 */
describe('the double rule, in the THREE forms the canvas draws', () => {
  function rule(container: HTMLElement): Element[] {
    // O `RuleDouble` é o único elemento com o `gap:3px` do canvas — mais
    // preciso que `[aria-hidden]`, que qualquer ícone também tem.
    const node = container.querySelector('[class*="gap-[3px]"]');
    if (node === null) throw new Error('o `Screen` não desenhou filete nenhum');
    return [...node.children];
  }

  it('⚠️ OPENS the section by default — the heavy accent first, which 7 of the 10 artboards draw', () => {
    const { container } = render(
      <Screen title="Acervo">
        <p>a</p>
      </Screen>,
    );

    const [first, second] = rule(container);
    expect(first?.className).toContain('bg-accent');
    expect(second?.className).toContain('bg-line');
  });

  it('HANDS the page over when asked: hairline first, then the heavy accent', () => {
    /*
      O par positivo, e ele é o que impede a guarda acima de virar "o filete é
      sempre assim": a inversão é de ORDEM, não de cor, e trocar só as cores
      deixaria o traço grosso sempre em cima — o gesto que o olho lê como
      "aqui começa". É a forma das três telas de escrita (`Dia`, `DiaEscuro`,
      `DiaDesktop`).
    */
    const { container } = render(
      <Screen rule="bottom" title="Dia">
        <p>a</p>
      </Screen>,
    );

    const [first, second] = rule(container);
    expect(first?.className).toContain('bg-line');
    expect(second?.className).toContain('bg-accent');
  });

  it('⚠️ draws NO rule at all when the canvas draws none', () => {
    /*
      A terceira forma. Sem ela o `Screen` inventa um traço em `Livro`,
      `NovoGrifo` e `CorrigirGrifo` — três telas em que o canvas não tem
      nenhum —, e nada acusaria, porque um filete a mais é decoração: ele não
      muda texto, nem papel, nem foco.
    */
    const { container } = render(
      <Screen rule="none" title="A Coragem de Ser Imperfeito">
        <p>a</p>
      </Screen>,
    );

    expect(container.querySelector('[class*="gap-[3px]"]')).toBeNull();
    // E o resto do cromo continua inteiro: é o FILETE que sai, não o título.
    expect(container.querySelector('h1')?.textContent).toBe(
      'A Coragem de Ser Imperfeito',
    );
  });

  it('⚠️ draws the rule on the ENTRY screen too — the canvas does', () => {
    /*
      A primeira entrega escreveu que a tela de entrada "não tem filete de
      abertura". **Medido: tem.** `Main.dc.html:35` (login) e
      `Convite.dc.html:37` (aceite) desenham o par, na forma `top` — a mesma
      das outras sete. O ramo `entry` tem `return` próprio, e foi por aí que a
      afirmação passou sem ninguém conferir.
    */
    const { container } = render(
      <Screen title="Entrar" width="entry">
        <p>a</p>
      </Screen>,
    );

    const [first, second] = rule(container);
    expect(first?.className).toContain('bg-accent');
    expect(second?.className).toContain('bg-line');
  });
});

/**
 * ⚠️ **QUEM PEDE `rule="none"` — e a lista é FECHADA e conferida contra o
 * canvas.**
 *
 * Esta varredura existe porque o padrão (`top`) é invisível: uma tela que
 * ESQUEÇA de declarar que não tem filete ganha um, e ninguém vê num teste de
 * render. É a mesma disciplina do `H1_EXCEPTIONS`.
 */
describe('⚠️ the screens the canvas draws with NO rule (task 42, audit B2)', () => {
  const NO_RULE_SCREENS: readonly string[] = [
    // `Livro.dc.html`: `<h1>` na linha 48, e nenhum par de `gap:3px`.
    'book.tsx',
    // `NovoGrifo.dc.html` e `CorrigirGrifo.dc.html`: nem `<h1>`, nem filete.
    'highlight-form.tsx',
  ];

  it.each(NO_RULE_SCREENS)('%s asks the Screen for no rule', (file) => {
    expect(stripComments(pageSource(file))).toContain('rule="none"');
  });

  it('and the two writing screens ask for the INVERTED one', () => {
    // `Dia.dc.html:49` e `Avulsa.dc.html:58`/`NovaAnotacao.dc.html:59`: o
    // filete que entrega a página a quem vai escrever.
    for (const file of ['day-note.tsx', 'free-note.tsx']) {
      expect(stripComments(pageSource(file))).toContain('rule="bottom"');
    }
  });
});

/**
 * ⚠️ **A BARRA DE CONTEXTO LIGADA AO ROTEADOR — a decisão D, e o defeito que
 * ela fecha é INVISÍVEL EM TESTE DE RENDER.**
 *
 * A `ContextBar` de `@clube/ui` renderiza um `<a href>` cru por padrão, porque
 * `packages/ui` não pode conhecer o roteador. Num PWA, âncora crua é navegação
 * de DOCUMENTO: o shell recarrega inteiro e o estado em memória (sessão, clube
 * ativo, rascunho do editor) some. E um teste de "o link aponta para o lugar
 * certo" fica **verde** com o defeito instalado — o `href` está lá, correto.
 *
 * A observável honesta é o ENDEREÇO depois do clique: em jsdom a âncora crua
 * não navega, então o endereço só muda se o roteador interceptou. É a mesma
 * forma, pela mesma razão, do
 * `home.test.tsx › opens the book screen from the shelf WITHOUT reloading the
 * PWA` (Tarefa 17).
 */
describe('⚠️ the context bar goes back WITHOUT reloading the PWA (decision D)', () => {
  function renderBar(): void {
    render(
      <MemoryRouter initialEntries={['/books/b-hobbit/days/p-1']}>
        <ScreenContextBar backLabel="A Coragem de Ser Imperfeito" href="/" />
        <LocationProbe />
      </MemoryRouter>,
    );
  }

  it('keeps a real anchor, with the real address', () => {
    renderBar();

    /*
      A metade que a alternativa `onClick` + `useNavigate` perderia: Ctrl+clique
      e "abrir em nova aba" dependem de o `href` existir de verdade. É por isso
      que a saída é o `Link` do react-router, e não um `<button>`.
    */
    const link = screen.getByRole('link', {
      name: 'A Coragem de Ser Imperfeito',
    });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/');
  });

  it('navigates in the APPLICATION, never in the document', () => {
    renderBar();

    fireEvent.click(
      screen.getByRole('link', { name: 'A Coragem de Ser Imperfeito' }),
    );

    // Sem o `Link` do roteador o endereço fica no inicial: a âncora crua não
    // navega em jsdom, que é exatamente o sintoma de "recarregou a página".
    expect(screen.getByTestId('location').textContent).toBe('/');
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

  /**
   * ⚠️ **AS DUAS EXCEÇÕES DO `h1` NÃO SÃO EXCEÇÃO DE TIPOGRAFIA** — achado da
   * auditoria da Tarefa 42.
   *
   * `accept-invite.tsx` e `not-found.tsx` têm `<section>` própria (é por isso
   * que estão no `H1_EXCEPTIONS`), e a primeira entrega desta fatia os deixou
   * com a classe **pré-42** (`text-2xl font-semibold`) enquanto as outras oito
   * telas mudavam para Fraunces — duas tipografias de título no mesmo app, e
   * nada acusava. O canvas as desenha na MESMA serifa das outras
   * (`Convite.dc.html:35`, `NaoEncontrada.dc.html:45`).
   *
   * A guarda é sobre o FONTE e não sobre o render porque nenhuma das duas
   * passa pelo `Screen`: o que se exige é que elas importem a MESMA constante,
   * e não que repitam a mesma string — repetir é o que sai de sincronia na
   * primeira correção (a lição nº 3 do MVP 1).
   */
  it('⚠️ gives the two h1 exceptions the SAME title class, from the same owner', () => {
    for (const file of H1_EXCEPTIONS) {
      const source = stripComments(pageSource(file));

      expect(source).toContain('SCREEN_TITLE_CLASS');
      // E a classe pré-42 não sobrevive em nenhuma das duas.
      expect(source).not.toContain('text-2xl');
    }
  });

  it('has read the pages where an h1 would live, and the exceptions still exist', () => {
    /*
      A precondição: sem ela, um `pageFiles()` que devolvesse lista vazia — ou
      uma lista de exceções que engolisse tudo — deixaria a guarda acima verde
      provando nada (§7.4 escrito como varredura de fonte).
    */
    const scanned = pageFiles();

    expect(scanned.length).toBeGreaterThan(10);
    for (const file of [...MIGRATED_SCREENS, 'acervo.tsx', 'login.tsx']) {
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
