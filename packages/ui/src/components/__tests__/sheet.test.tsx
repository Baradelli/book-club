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

  /*
    ============================================================================
    O DESENHO DO CANVAS — Tarefa 41a, decisão I
    ============================================================================

    Medido em `Avulsa.dc.html:79,80`: `border-radius: 10px 10px 0 0`,
    `box-shadow: 0 -14px 40px -18px rgba(20,30,20,0.55)` (a sombra que SOBE com
    o painel) e uma alça de 36×4 em `--border-strong`, centrada, com raio de
    pílula.
  */
  it('rounds the top corners with the sheet radius, and all four on the desktop', () => {
    /*
      ⚠️ O QUE ESTE TESTE GUARDA NÃO É O NÚMERO, É O ELO. O `--radius-sheet`
      apontava para `--r-3` (4px) desde a Tarefa 39, com a pendência escrita na
      nota nº 4 dela: o canvas pede 10px e a escala de quatro raios não tinha
      10px. A decisão I fez nascer `--r-4: 10px` e reapontou o token.

      Aqui se pina que o painel pede o RAIO DO SHEET, e só ele: um
      `rounded-t-control` (ou um `rounded-t-lg` do Tailwind) pintaria um valor
      que ninguém escolheu e o número certo no `theme.css` não chegaria à tela.
      O valor de `--r-4` é pinado do outro lado, em `theme-css.test.ts`.

      E o par mobile/desktop é uma decisão só: o painel SOBE de baixo no celular
      (só o topo arredonda) e fica CENTRADO no desktop (arredonda inteiro).
    */
    render(<Harness>Conteúdo do sheet</Harness>);
    openSheet();

    const panel = screen.getByRole('dialog');
    expect(panel.className.split(/\s+/u)).toContain('rounded-t-sheet');
    expect(panel.className.split(/\s+/u)).toContain('sm:rounded-sheet');
    // A sombra do canvas é a que sobe — `--shadow-sheet`, negativa no Y.
    expect(panel.className.split(/\s+/u)).toContain('shadow-sheet');
  });

  it('paints the panel with the page paper, not with a darker card (decision of 2026-09-21)', () => {
    /*
      ⚠️ DECISÃO DO DONO (2026-09-21): o painel usa `--surface`, como o canvas
      desenha (`Avulsa.dc.html:79`: `background:var(--surface)`). Ele usava
      `--surface-2` desde a Tarefa 13.

      ⚠️ E O MEDO QUE ADIOU ESSA TROCA ERA INFUNDADO, medido: `--text-subtle`
      (a dica de campo, que aparece DENTRO do sheet) passa 4,5:1 contra as TRÊS
      superfícies, e sobre `--surface` dá **4,93:1** — melhor que os 4,54:1 que
      ele dá sobre `--surface-2`. Trocar o papel do sheet MELHORA o contraste
      do pior caso; nada da Tarefa 39 é invalidado.

      E o argumento de desenho fecha: um painel que flutua SOBRE a página sendo
      mais escuro que ela é o contrário de elevação. O canvas separa o sheet por
      três outras coisas — o scrim, a sombra que sobe e o filete de topo —, e
      todas as três estão aqui.
    */
    render(<Harness>Conteúdo do sheet</Harness>);
    openSheet();

    const utilities = screen.getByRole('dialog').className.split(/\s+/u);
    expect(utilities).toContain('bg-surface');
    expect(utilities).not.toContain('bg-surface-raised');
  });

  it('draws the grab handle of the canvas, out of the screen reader path', () => {
    /*
      A alça é o que diz "isto sobe e desce" no celular, e ela é DECORAÇÃO: quem
      ouve a tela já recebe "diálogo, Anotação de hoje" pelo `aria-labelledby`.
      Anunciá-la seria um nó sem nome no meio do caminho.

      ⚠️ E ELA NÃO É UM CONTROLE: não é `<button>`, não recebe foco e não entra
      no ciclo de Tab (regra 18) — se fosse, o primeiro Tab dentro do sheet
      cairia num elemento que não faz nada.
    */
    const { container } = render(<Harness>Conteúdo do sheet</Harness>);
    openSheet();

    const handle = container.querySelector('[data-sheet-handle]');
    expect(handle).not.toBeNull();
    expect(handle?.getAttribute('aria-hidden')).toBe('true');
    expect(handle?.tagName).toBe('DIV');
    expect(handle?.hasAttribute('tabindex')).toBe(false);

    // 36×4 em `--border-strong`, com raio de pílula (`Avulsa.dc.html:80`).
    const utilities = (handle?.className ?? '').split(/\s+/u);
    expect(utilities).toContain('w-9');
    expect(utilities).toContain('h-1');
    expect(utilities).toContain('bg-line-strong');
    expect(utilities).toContain('rounded-pill');
  });
});
