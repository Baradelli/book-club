import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  List,
  LIST_ITEM_HEIGHT_CLASS,
  LIST_ITEM_HEIGHT_PX,
  ListItem,
  SUMARIO_ITEM_HEIGHT_CLASS,
  SUMARIO_ITEM_HEIGHT_PX,
} from '../list';
import { MIN_TOUCH_TARGET_PX, SPACING_STEP_PX } from '../styles';

/**
 * Regras 22–24. O defeito que esta lista existe para impedir é o `<div
 * onClick>` com um link pequeno dentro: funciona com mouse, ignora o dedo que
 * acerta a linha, e é invisível para o teclado.
 */

describe('ListItem', () => {
  it('makes the whole row one interactive element (rule 22)', () => {
    render(
      <List aria-label="Livros">
        <ListItem
          end={<span>há 2 dias</span>}
          onClick={vi.fn()}
          start={<span>AB</span>}
          subtitle="Capítulo 3"
          title="Sapiens"
        />
      </List>,
    );

    const row = screen.getByRole('button');

    // UM alvo só, e ele carrega todo o conteúdo: título, subtítulo e os dois
    // slots. Dois controles na mesma linha dividiriam o alvo em dois pequenos.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(row.textContent).toContain('Sapiens');
    expect(row.textContent).toContain('Capítulo 3');
    expect(row.textContent).toContain('AB');
    expect(row.textContent).toContain('há 2 dias');
  });

  it('gives the row a touch target above the floor (rule 22)', () => {
    // Mesma disciplina do `Button`: jsdom não tem layout, então o par
    // classe ↔ número é o que se pina. O item de lista é o alvo que se acerta
    // rolando a tela com o polegar, e é o mais generoso do app.
    const match = /^min-h-(\d+)$/u.exec(LIST_ITEM_HEIGHT_CLASS);
    expect(match).not.toBeNull();
    expect(Number(match?.[1]) * SPACING_STEP_PX).toBe(LIST_ITEM_HEIGHT_PX);
    expect(LIST_ITEM_HEIGHT_PX).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);

    render(
      <List>
        <ListItem onClick={vi.fn()} title="Sapiens" />
      </List>,
    );
    expect(screen.getByRole('button').className).toContain(
      LIST_ITEM_HEIGHT_CLASS,
    );
  });

  it('calls onClick when the row is activated (rule 22)', () => {
    const onClick = vi.fn();
    render(
      <List>
        <ListItem onClick={onClick} title="Sapiens" />
      </List>,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the keyboard order equal to the visual order (rule 23)', () => {
    const { container } = render(
      <List aria-label="Plano de leitura">
        <ListItem onClick={vi.fn()} title="Dia 1" />
        <ListItem onClick={vi.fn()} title="Dia 2" />
        <ListItem onClick={vi.fn()} title="Dia 3" />
      </List>,
    );

    /*
      A ordem do DOM É a ordem do Tab, desde que ninguém ponha `tabindex`
      POSITIVO. Um `tabindex="2"` joga aquele nó para a frente de toda a lista,
      e a leitura por teclado deixa de acompanhar a vista — sem que nada mude
      na tela. (jsdom não simula Tab; o que se pina é o mecanismo que decide a
      ordem.)

      ⚠️ ESTE TESTE COMEÇAVA comparando `rows.map(textContent)` com
      `['Dia 1','Dia 2','Dia 3']`, e essa asserção SAIU: ela era garantida pela
      ordem do fixture — React não reordena irmãos —, então nenhuma mutação de
      `list.tsx` a quebrava. Ela dava ao teste uma cara de "prova a ordem" que
      ele não tinha.

      ⚠️ E MEDIDO na fatia: varrer só os `rows` deixava passar o mutante que
      põe `tabIndex={2}` no `<li>` — o `<li>` vira focável, entra na frente da
      lista inteira, e nenhum `button` mudou. A varredura é da SUBÁRVORE.
    */
    const focusable = [...container.querySelectorAll('[tabindex]')];
    const positive = focusable.filter(
      (node) => Number(node.getAttribute('tabindex')) > 0,
    );

    expect(positive).toEqual([]);

    // E que havia lista para varrer: sem isto um `container` vazio (ou um
    // `List` que não renderiza filho) deixaria o `toEqual([])` verde provando
    // nada (§7.4).
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('renders a button, and no anchor, without href (rule 24)', () => {
    render(
      <List>
        <ListItem onClick={vi.fn()} title="Sapiens" />
      </List>,
    );

    expect(screen.getByRole('button').tagName).toBe('BUTTON');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders an anchor, and no button, with href (rule 24)', () => {
    render(
      <List>
        <ListItem href="/livros/sapiens" title="Sapiens" />
      </List>,
    );

    // `<button>` com href ignoraria o link: nem Ctrl+clique, nem "abrir em
    // nova aba", nem endereço visível na barra de status.
    const link = screen.getByRole('link', { name: 'Sapiens' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/livros/sapiens');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('lets the CONSUMER render the anchor, so a PWA is not reloaded (rule 24)', () => {
    /*
      ⚠️ **O DEFEITO QUE ESTE PROP EXISTE PARA FECHAR.** `<a href>` é navegação
      de DOCUMENTO: num PWA com react-router ela recarrega o shell inteiro e
      perde o estado em memória. A saída óbvia — `onClick` + `useNavigate` —
      troca um defeito por outro: perde Ctrl+clique e "abrir em nova aba", que é
      justamente o que o docblock do `ListItem` argumenta que a âncora dá.

      E `packages/ui` não pode importar `react-router-dom` (um design system não
      conhece o roteador, e o barril o arrastaria para todo bundle que importa um
      `Button`), então a inversão é obrigatória: o consumidor passa o `Link`.

      O dublê abaixo é o que o `Link` do react-router faz — `<a href>` de
      verdade, com o clique normal interceptado. Não é o `Link` real de
      propósito: importá-lo aqui seria a dependência que este prop existe para
      evitar.
    */
    const navigations: string[] = [];
    render(
      <List>
        <ListItem
          href="/livros/sapiens"
          renderLink={({ className, href, children }) => (
            <a
              className={className}
              data-router-link="true"
              href={href}
              onClick={(event) => {
                event.preventDefault();
                navigations.push(href);
              }}
            >
              {children}
            </a>
          )}
          title="Sapiens"
        />
      </List>,
    );

    const link = screen.getByRole('link', { name: 'Sapiens' });
    // É o elemento DO CONSUMIDOR que está na tela — não uma âncora crua ao lado
    // dele, nem em vez dele.
    expect(link.getAttribute('data-router-link')).toBe('true');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    // E ele recebeu as DUAS coisas: o endereço (Ctrl+clique e "abrir em nova
    // aba" continuam funcionando) e as classes da superfície (o alvo de toque e
    // o anel de foco são do `ListItem`, e quem troca o elemento não deve ter de
    // copiá-los).
    expect(link.getAttribute('href')).toBe('/livros/sapiens');
    expect(link.className).toContain(LIST_ITEM_HEIGHT_CLASS);
    // O conteúdo montado também chegou: um `renderLink` que recebesse os filhos
    // vazios daria uma linha em branco clicável.
    expect(link.textContent).toContain('Sapiens');

    fireEvent.click(link);
    // A navegação foi do ROTEADOR, e o navegador não recarregou nada.
    expect(navigations).toEqual(['/livros/sapiens']);
  });

  it('falls back to a plain anchor when the consumer gives no renderLink (rule 24)', () => {
    /*
      O outro lado do par: sem `renderLink`, o comportamento é o de sempre. Uma
      implementação que exigisse o prop quebraria todo chamador existente, e uma
      que ignorasse o padrão renderizaria nada.
    */
    render(
      <List>
        <ListItem href="/livros/sapiens" title="Sapiens" />
      </List>,
    );

    const link = screen.getByRole('link', { name: 'Sapiens' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('data-router-link')).toBeNull();
    expect(link.getAttribute('href')).toBe('/livros/sapiens');
  });

  /*
    ============================================================================
    A VARIANTE `sumario` — Tarefa 41a, decisão G
    ============================================================================

    ⚠️ ADITIVA, E É ISSO QUE ESTÁ SENDO MEDIDO AQUI: os 9 `it()` acima não foram
    tocados, porque `variant` tem `'row'` como padrão e as 5 telas que usam o
    `ListItem` não passam a prop. A variante nasce nesta fatia porque ela é uma
    variante do que existe (uma linha interativa inteira), não um componente
    novo — quem a CONSOME é a Tarefa 44.

    As medidas saem de `Livro.dc.html:70-171` e `LivroDesktop.dc.html`.
  */
  describe('the sumario variant (decision G)', () => {
    it('keeps `row` as the default, so the five screens do not change', () => {
      // O pino da aditividade. Sem esta linha, trocar o padrão para `sumario`
      // repintaria cinco telas sem um vermelho em lugar nenhum.
      render(
        <List>
          <ListItem onClick={vi.fn()} title="Sapiens" />
        </List>,
      );

      const row = screen.getByRole('button');
      expect(row.className).toContain(LIST_ITEM_HEIGHT_CLASS);
      // Nenhum pontinho de condução e nenhum filete de plano na linha comum.
      expect(row.querySelector('[data-sumario-leader]')).toBeNull();
    });

    it('draws the dotted leader and the mono meta of the printed sumario', () => {
      /*
        Medido em `Livro.dc.html:77,78`:
        `border-bottom:1px dotted var(--leader)` no condutor (que cresce até
        encostar no número) e `'Geist Mono' 9.5px letter-spacing:0.06em
        color:var(--text-muted)` na data/página à direita.

        O condutor é DECORAÇÃO: ele sai do caminho do leitor de tela, senão a
        fala do plano fica cheia de pontos.
      */
      render(
        <List>
          <ListItem
            end="8 SET · 9"
            onClick={vi.fn()}
            title="Introdução — A vida na arena"
            variant="sumario"
          />
        </List>,
      );

      const row = screen.getByRole('button');
      const leader = row.querySelector('[data-sumario-leader]');
      expect(leader).not.toBeNull();
      expect(leader?.getAttribute('aria-hidden')).toBe('true');
      expect(leader?.className).toContain('border-dotted');
      expect(leader?.className).toContain('border-leader');

      const meta = screen.getByText('8 SET · 9');
      for (const utility of ['font-mono', 'text-micro', 'text-muted']) {
        expect(meta.className.split(/\s+/u)).toContain(utility);
      }

      // O título continua em serifa de leitura, que é o que faz o sumário
      // parecer sumário de livro e não tabela.
      expect(
        screen
          .getByText('Introdução — A vida na arena')
          .className.split(/\s+/u),
      ).toContain('font-reading');
    });

    it('gives today its own paper and its gold rule', () => {
      /*
        Medido em `Livro.dc.html:140`: `background:var(--surface-today)`,
        `border-top:2px solid var(--gold-line)` e
        `border-bottom:2px solid var(--gold-line)`; o condutor passa a dourado
        e a data vira "Hoje" em `--gold-strong` maiúsculo.

        ⚠️ E O OURO É FILETE, NÃO PREENCHIMENTO DE AÇÃO: o dia de hoje não é um
        botão primário no meio da lista. `--surface-today` é papel.
      */
      render(
        <List>
          <ListItem
            end="Hoje · 161"
            onClick={vi.fn()}
            title="Cap. 5 — Cultura e pertencimento"
            tone="today"
            variant="sumario"
          />
        </List>,
      );

      const row = screen.getByRole('button');
      expect(row.className).toContain('bg-surface-today');
      expect(row.className).toContain('border-gold-line');
      expect(row.querySelector('[data-sumario-leader]')?.className).toContain(
        'border-gold-line',
      );
      expect(screen.getByText('Hoje · 161').className).toContain(
        'text-gold-strong',
      );
    });

    it('fades the future with a grey that still passes contrast', () => {
      /*
        ⚠️ DIVERGÊNCIA CANVAS × GUARDA, REGISTRADA E MEDIDA.

        O canvas apaga o dia futuro com `--text-faint` (`Livro.dc.html:150`).
        Mas `--text-faint` NÃO passa contraste (2,45:1 no claro, 2,58:1 no
        escuro), e a Tarefa 39 deixou a guarda
        `theme-tokens.test.ts › refuses the FIRST USE of text-faint while it
        fails contrast` exatamente para este momento — ela fica VERMELHA no
        primeiro uso, e está escrito nela que a saída é ESCURECER o token.

        ⚠️ E ESCURECER É IMPOSSÍVEL SEM DESTRUIR A HIERARQUIA, medido: o vizinho
        `--text-subtle` já está no piso (4,54:1 contra `--surface-2`), então um
        `--text-faint` que passasse 4,5:1 ficaria igual ou mais escuro que ele —
        e a guarda `keeps the three greys in order` cairia. Os três cinzas não
        cabem todos acima de 4,5:1.

        Então esta fatia usa `text-subtle` no dia futuro: ele É mais apagado que
        a linha lida (que é `--text` cheio), o que preserva a INTENÇÃO do canvas
        ("futuros apagados"), e ele passa. Quem decide entre um quarto cinza e a
        isenção do `--text-faint` é o dono — está no relatório da fatia.

        O condutor futuro usa `--leader-future`, que é filete de 1px e não
        texto: a regra de 4,5:1 não se aplica a ele, e ele é do canvas.
      */
      render(
        <List>
          <ListItem
            end="21 SET · 193"
            onClick={vi.fn()}
            title="Cap. 7 — Ousar na educação"
            tone="future"
            variant="sumario"
          />
        </List>,
      );

      const row = screen.getByRole('button');
      expect(row.className).toContain('text-subtle');
      expect(row.className).not.toContain('text-faint');
      expect(row.querySelector('[data-sumario-leader]')?.className).toContain(
        'border-leader-future',
      );
    });

    it('keeps the sumario row above the 44px floor, and the row the whole target', () => {
      // Mesma disciplina do `Button` e da linha comum: jsdom não tem layout, e
      // o par classe ↔ número é o que se pina. ⚠️ O canvas desenha a linha do
      // sumário com ~38px (`padding:9px 0` + 20px de conteúdo), ABAIXO do piso
      // da decisão F — e o piso vence, porque a linha é um alvo de toque de
      // verdade. Fica em 44px, o mínimo, e não nos 56px da linha comum.
      const match = /^min-h-(\d+)$/u.exec(SUMARIO_ITEM_HEIGHT_CLASS);
      expect(match).not.toBeNull();
      expect(Number(match?.[1]) * SPACING_STEP_PX).toBe(SUMARIO_ITEM_HEIGHT_PX);
      expect(SUMARIO_ITEM_HEIGHT_PX).toBeGreaterThanOrEqual(
        MIN_TOUCH_TARGET_PX,
      );

      render(
        <List>
          <ListItem href="/livros/x/dias/11" title="Dia 11" variant="sumario" />
        </List>,
      );

      const link = screen.getByRole('link', { name: /Dia 11/u });
      expect(link.className).toContain(SUMARIO_ITEM_HEIGHT_CLASS);
      expect(screen.getAllByRole('link')).toHaveLength(1);
    });

    it('keeps the marks column aligned even when a day has no mark', () => {
      /*
        Medido em `Livro.dc.html:151`: o dia futuro tem um
        `<div style="width:44px">` VAZIO no lugar das marcas. Sem ele os títulos
        do sumário desalinham entre os dias lidos e os futuros — e um sumário
        desalinhado é o defeito que a régua de pontinhos existe para não ter.
      */
      render(
        <List>
          <ListItem
            onClick={vi.fn()}
            title="Cap. 6"
            tone="future"
            variant="sumario"
          />
        </List>,
      );

      const slot = screen
        .getByRole('button')
        .querySelector('[data-sumario-marks]');
      expect(slot).not.toBeNull();
      expect(slot?.className).toContain('w-11');
    });
  });

  it('gives the list a real list role, with its items (rule 23)', () => {
    render(
      <List aria-label="Anotações">
        <ListItem onClick={vi.fn()} title="Dia 1" />
        <ListItem onClick={vi.fn()} title="Dia 2" />
      </List>,
    );

    // "lista, 2 itens" é a informação que diz se vale continuar tabulando. Um
    // `<div>` com cara de lista não a dá. `list-none` remove o marcador
    // visual, e no jsdom não há CSS: a semântica continua de pé.
    expect(screen.getByRole('list', { name: 'Anotações' })).not.toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
