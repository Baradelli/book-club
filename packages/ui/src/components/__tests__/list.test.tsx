import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  List,
  LIST_ITEM_HEIGHT_CLASS,
  LIST_ITEM_HEIGHT_PX,
  ListItem,
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
