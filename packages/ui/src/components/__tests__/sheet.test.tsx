import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { SCROLL_LOCK_CLASS, Sheet } from '../sheet';

/**
 * Regras 15–21 — foco e semântica de diálogo, que é a definição de "quebra em
 * silêncio": nada disso aparece na tela de quem usa mouse. Um sheet que deixa o
 * foco escapar para o fundo funciona perfeitamente com o dedo e prende quem
 * navega por teclado num lugar que ele não vê.
 */

/**
 * O arnês monta o mundo REAL do sheet: um botão que abre, e um link no FUNDO —
 * porque "o foco não escapa" (regra 18) só é testável se existir para onde
 * escapar. Fixture é factory (§7.7).
 */
function Harness({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Abrir
      </button>
      <a href="/atras">Link do fundo</a>
      <Sheet
        closeLabel="Fechar"
        onClose={() => setOpen(false)}
        open={open}
        title="Anotação de hoje"
      >
        {children}
      </Sheet>
    </>
  );
}

/** Abre pelo botão, com o foco NELE — é o que a regra 19 vai cobrar de volta. */
function openSheet(): HTMLElement {
  const opener = screen.getByRole('button', { name: 'Abrir' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe('Sheet', () => {
  it('is absent from the DOM while closed, not merely hidden (rule 15)', () => {
    render(<Harness>Conteúdo do sheet</Harness>);

    // `hidden` bastaria para a vista, mas o conteúdo continuaria TABULÁVEL:
    // quem navega por teclado cairia dentro de um sheet invisível.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Conteúdo do sheet')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull();
  });

  it('closes on Escape (rule 16)', () => {
    render(<Harness>Conteúdo do sheet</Harness>);
    openSheet();
    expect(screen.getByRole('dialog')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on a click in the backdrop (rule 17)', () => {
    const { container } = render(<Harness>Conteúdo do sheet</Harness>);
    openSheet();

    const backdrop = container.querySelector('[data-sheet-backdrop]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays open on a click INSIDE the panel (rule 17)', () => {
    // O par obrigatório do teste acima: um `onClick` no contêiner externo
    // fecharia o sheet ao clicar no próprio texto que a pessoa está lendo, e o
    // teste do backdrop sozinho passaria igual.
    render(<Harness>Conteúdo do sheet</Harness>);
    openSheet();

    fireEvent.click(screen.getByText('Conteúdo do sheet'));

    expect(screen.queryByRole('dialog')).not.toBeNull();
  });

  it('moves the focus into the panel when it opens (rule 18)', () => {
    render(<Harness>Conteúdo do sheet</Harness>);
    openSheet();

    // Sem isto o foco fica no botão que abriu, ATRÁS do backdrop: o Tab
    // seguinte anda pelo fundo e o sheet nunca recebe o teclado.
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('does not let Tab escape to the background (rule 18)', () => {
    render(
      <Harness>
        <button type="button">Descartar</button>
      </Harness>,
    );
    openSheet();

    const inside = screen.getByRole('button', { name: 'Descartar' });
    inside.focus();

    fireEvent.keyDown(inside, { key: 'Tab' });

    // O ciclo volta para o primeiro controle do painel (o "Fechar"), e NÃO
    // para o link do fundo — que é o defeito real: um link clicável pelo
    // teclado, escondido atrás do backdrop.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Fechar' }),
    );
    expect(document.activeElement).not.toBe(
      screen.getByRole('link', { name: 'Link do fundo' }),
    );
  });

  it('wraps Shift+Tab backwards inside the panel (rule 18)', () => {
    render(
      <Harness>
        <button type="button">Descartar</button>
      </Harness>,
    );
    openSheet();

    const close = screen.getByRole('button', { name: 'Fechar' });
    close.focus();

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });

    // Para trás é a direção que se esquece de implementar, e é por onde o foco
    // sai para a barra do navegador.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Descartar' }),
    );
  });

  it('gives the focus back to whoever opened it (rule 19)', () => {
    render(<Harness>Conteúdo do sheet</Harness>);
    const opener = openSheet();

    fireEvent.keyDown(document, { key: 'Escape' });

    // Sem isto o foco cai no `<body>` e quem usa teclado recomeça a tabular da
    // barra do navegador — perdendo o lugar onde estava na lista.
    expect(document.activeElement).toBe(opener);
  });

  it('locks the background scroll while open and unlocks on close (rule 20)', () => {
    render(<Harness>Conteúdo do sheet</Harness>);

    expect(document.body.classList.contains(SCROLL_LOCK_CLASS)).toBe(false);

    openSheet();
    expect(document.body.classList.contains(SCROLL_LOCK_CLASS)).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    // O destravamento é a metade que some: um sheet que trava e não destrava
    // deixa a página inteira sem rolagem, e o sintoma aparece na tela SEGUINTE.
    expect(document.body.classList.contains(SCROLL_LOCK_CLASS)).toBe(false);
  });

  it('is a modal dialog with an accessible name (rule 21)', () => {
    render(<Harness>Conteúdo do sheet</Harness>);
    openSheet();

    // `getByRole('dialog', { name })` só resolve se o `aria-labelledby`
    // apontar para o nó do título de verdade.
    const dialog = screen.getByRole('dialog', { name: 'Anotação de hoje' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('labels the close button with the text the screen gave it (rule 21)', () => {
    // O `ui` não traduz (decisão B): o rótulo do "Fechar" chega por prop. Um
    // botão de ícone sem `aria-label` é anunciado como "botão", e ninguém
    // descobre que ele fecha.
    render(<Harness>Conteúdo do sheet</Harness>);
    openSheet();

    expect(screen.getByRole('button', { name: 'Fechar' })).not.toBeNull();
  });
});
