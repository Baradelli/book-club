import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarginRail, ReadingColumn } from '../reading-column';

/**
 * TAREFA 41b — A EDIÇÃO CRÍTICA: coluna de leitura e margem com o aparato.
 *
 * ⚠️ QUEM CONSOME (nota nº 10 da Tarefa 41a: parta do consumidor). São as
 * cinco telas que o canvas desenha em 1280px: a home (`pages/home.tsx`,
 * Tarefa 42), a tela do livro (`pages/book.tsx`, 44), a do dia
 * (`pages/day-note.tsx`, 43) e os dois formulários de escrita
 * (`pages/free-note.tsx` e `pages/highlight-form.tsx`, 45 e 47).
 *
 * As medidas, dos artboards dessas telas. ⚠️ **QUATRO dos cinco concordam, não
 * os cinco** — a primeira entrega desta fatia dizia "os cinco CONCORDAM" duas
 * linhas acima de uma tabela que já mostrava o contrário:
 *
 * | artboard | moldura | coluna | margem |
 * | --- | --- | --- | --- |
 * | `DiaDesktop.dc.html:46,48,96` | `gap:56px`, `padding:40px 92px 0 92px` | `width:680px` | `width:320px`, `border-left:1px solid var(--border)`, `padding-left:40px`, `gap:26px` |
 * | `InicioDesktop.dc.html:35,37,104` | `gap:56px`, **`padding:48px 92px 0`** | `680px` | idem, `gap:18px` |
 * | `LivroDesktop.dc.html:42,44,180` | `gap:56px`, `padding:40px 92px 0` | `680px` | idem, `gap:26px` |
 * | `NovaAnotacaoDesktop.dc.html:45,47,91` | idem | `680px` | idem, `gap:16px` |
 * | `NovoGrifoDesktop.dc.html:45,47,104` | idem | `680px` | idem, `gap:16px` |
 *
 * Ou seja: o vão de 56px, o recuo lateral de 92px, os 680px, os 320px, o
 * filete e o `padding-left:40px` são unânimes — e são o que o componente
 * entrega. O recuo de TOPO diverge numa tela (48px na home) e o `gap` vertical
 * da margem diverge em três valores; os dois viraram assunto da tela, cada um
 * com o seu `it()` abaixo.
 *
 * Abaixo de 1120px (decisão fechada do MVP 3.5): uma coluna só, 16px de
 * padding (o canvas media 20px em `Livro.dc.html:41`, `Dia.dc.html:41`; o
 * redesenho visual de 2026-09-24 trocou pela calha de 16px), e a margem DESCENDO para o
 * fluxo — sem filete e sem recuo.
 */
describe('ReadingColumn + MarginRail', () => {
  it('stacks into ONE column below the cut and splits in two at ≥1120px', () => {
    const { container } = render(
      <ReadingColumn rail={<MarginRail>aparato</MarginRail>}>
        leitura
      </ReadingColumn>,
    );

    const frame = container.firstElementChild as HTMLElement;
    const classes = frame.className.split(/\s+/u);

    // Celular: uma coluna, 16px de recuo (o redesenho visual de 2026-09-24
    // trocou os 20px do canvas pela calha de 16px de app de celular).
    expect(classes).toContain('flex');
    expect(classes).toContain('flex-col');
    expect(classes).toContain('px-4');

    // Desktop: duas colunas, 56px de vão, 92px de recuo.
    expect(classes).toContain('min-[1120px]:flex-row');
    expect(classes).toContain('min-[1120px]:gap-14');
    expect(classes).toContain('min-[1120px]:px-23');
  });

  it('⚠️ branches by MEDIA QUERY only — no userAgent, no isMobile (decision G)', () => {
    /*
      A decisão G é explícita: "Nenhuma ramificação por dispositivo". Uma
      ramificação em JavaScript quebra no redimensionamento, mente no iPad e
      renderiza o layout errado no primeiro frame do servidor — e nada disso
      aparece num teste de unidade.

      O que se pina aqui é o que dá para pinar sem navegador: o componente NÃO
      lê nada do ambiente. Ele renderiza a mesma árvore sempre, e quem decide é
      o CSS. O par positivo abaixo é o que impede esta asserção de ser vazia.
    */
    const first = render(
      <ReadingColumn rail={<MarginRail>a</MarginRail>}>b</ReadingColumn>,
    );
    const firstHtml = (first.container.firstElementChild as HTMLElement)
      .outerHTML;
    first.unmount();

    const second = render(
      <ReadingColumn rail={<MarginRail>a</MarginRail>}>b</ReadingColumn>,
    );
    expect((second.container.firstElementChild as HTMLElement).outerHTML).toBe(
      firstHtml,
    );
    // E o par positivo: a decisão de layout ESTÁ no DOM, em forma de classe.
    expect(firstHtml).toContain('min-[1120px]:');
  });

  it('gives the reading column the 680px of the canvas, and only at the cut', () => {
    render(
      <ReadingColumn rail={<MarginRail>aparato</MarginRail>}>
        <p>leitura</p>
      </ReadingColumn>,
    );

    const column = screen.getByText('leitura').parentElement as HTMLElement;
    const classes = column.className.split(/\s+/u);
    expect(classes).toContain('min-[1120px]:w-[680px]');
    expect(classes).toContain('min-[1120px]:shrink-0');
    // No celular ela é a largura da tela: uma largura fixa ali empurraria a
    // página para a rolagem horizontal, que a decisão fechada proíbe em 360px.
    expect(classes).not.toContain('w-[680px]');
  });

  it('hangs the fillet on the RAIL, and only above the cut', () => {
    render(<MarginRail>aparato</MarginRail>);

    const rail = screen.getByText('aparato');
    const classes = rail.className.split(/\s+/u);
    // 320px, filete de 1px em `--border`, 40px de recuo — os três só a partir
    // de 1120px. Abaixo disso a margem desce para o fluxo, e um filete à
    // esquerda de uma coluna que ocupa a tela inteira seria uma linha solta.
    expect(classes).toContain('min-[1120px]:w-80');
    expect(classes).toContain('min-[1120px]:border-l');
    expect(classes).toContain('min-[1120px]:border-line');
    expect(classes).toContain('min-[1120px]:pl-10');
    expect(classes).not.toContain('border-l');
  });

  it('puts the rail AFTER the column in the DOM, so tab order follows the eye', () => {
    /*
      Regra 6: o `MarginRail` é aparato — ele vem DEPOIS da coluna na ordem do
      DOM. No desktop ele está à direita, então a ordem de teclado já bate com
      a visual; no celular ele desce para baixo do texto, e a ordem continua
      batendo. É a única ordem em que as duas larguras concordam.
    */
    const { container } = render(
      <ReadingColumn rail={<MarginRail>aparato</MarginRail>}>
        <p>leitura</p>
      </ReadingColumn>,
    );

    const frame = container.firstElementChild as HTMLElement;
    const order = [...frame.children].map((child) => child.textContent);
    expect(order).toEqual(['leitura', 'aparato']);
  });

  it('works with no rail at all — the column alone is a valid screen', () => {
    const { container } = render(<ReadingColumn>só leitura</ReadingColumn>);

    const frame = container.firstElementChild as HTMLElement;
    expect(frame.children).toHaveLength(1);
    expect(frame.textContent).toBe('só leitura');
  });

  it('names the rail for whoever is listening, when the screen gives it a name', () => {
    render(<MarginRail aria-label="Grifos desta leitura">…</MarginRail>);

    // `<aside>` com nome acessível vira uma região que o leitor de tela lista
    // e pula — que é exatamente o que "aparato de margem" quer dizer. Sem
    // nome, `<aside>` dentro de um `<main>` nem é região: o elemento é o
    // mesmo, e é o nome que decide. Por isso o rótulo entra por prop, já
    // traduzido (decisão A), e nunca é inventado aqui.
    const rail = screen.getByRole('complementary', {
      name: 'Grifos desta leitura',
    });
    expect(rail.tagName).toBe('ASIDE');
  });

  it('⚠️ leaves the RAIL rhythm to the screen, like it leaves the column rhythm', () => {
    /*
      ⚠️ CORREÇÃO DA RODADA DE AUDITORIA (2026-09-21).

      A entrega fixava `gap-6` (24px) na margem — **um número que não existe em
      artboard nenhum.** Medido nos cinco:

      | artboard | `gap` da margem |
      | --- | --- |
      | `InicioDesktop.dc.html:104` | **18px** |
      | `DiaDesktop.dc.html:96` | **26px** |
      | `LivroDesktop.dc.html:180` | **26px** |
      | `NovaAnotacaoDesktop.dc.html:91` | **16px** |
      | `NovoGrifoDesktop.dc.html:104` | **16px** |

      Nenhum é 24. E o agravante era interno: o docblock deste mesmo arquivo
      argumentava, longamente, que o `gap` vertical da COLUNA não é do
      componente ("é o ritmo do conteúdo de cada tela") — e então fixava o da
      MARGEM, em silêncio, num valor inventado. Dois pesos, uma medida.

      O mesmo argumento vale para os dois, então os dois saem. O que fica é a
      MOLDURA — largura, filete, recuo e o corte —, que é onde os cinco
      artboards de fato concordam.
    */
    const { container } = render(
      <ReadingColumn rail={<MarginRail>aparato</MarginRail>}>
        <p>leitura</p>
      </ReadingColumn>,
    );

    const frame = (container.firstElementChild as HTMLElement).className.split(
      /\s+/u,
    );
    const rail = screen.getByText('aparato').className.split(/\s+/u);

    // Nem a margem nem a moldura carregam ritmo vertical inventado.
    expect(rail.some((name) => /^gap-\d/u.test(name))).toBe(false);
    expect(frame.some((name) => /^gap-\d/u.test(name))).toBe(false);
    // Mas o vão ENTRE as colunas fica: 56px, e os cinco artboards concordam.
    expect(frame).toContain('min-[1120px]:gap-14');
  });

  it('⚠️ ships the 40px top gutter of FOUR artboards, and the home overrides it', () => {
    /*
      ⚠️ CORREÇÃO DA RODADA DE AUDITORIA (2026-09-21), e a afirmação que caiu
      era minha, rotulada "medidas".

      O docblock dizia "os cinco artboards concordam … `padding:40px 92px 0`".
      **São QUATRO.** Medido, com o comando:

      ```
      $ grep -n "justify-content: center; gap: 56px" *Desktop.dc.html \
          | grep -o "padding: [^;]*"
      padding: 48px 92px 0 92px     ← InicioDesktop.dc.html:35
      padding: 40px 92px 0 92px     ← DiaDesktop.dc.html:46
      padding: 40px 92px 0 92px     ← LivroDesktop.dc.html:42
      padding: 40px 92px 0 92px     ← NovaAnotacaoDesktop.dc.html:45
      padding: 40px 92px 0 92px     ← NovoGrifoDesktop.dc.html:45
      ```

      ⚠️ E o 48px **já estava na tabela deste arquivo**, duas linhas abaixo da
      frase que o contradizia: eu medi certo e escrevi errado no docblock de
      PRODUÇÃO, que é o primeiro que o próximo agente lê. É a classe nº 6 da
      lista da Tarefa 41a (correção incompleta) somada à nº 4 (generalização de
      amostra).

      ~~**A decisão:** … a HOME compensa com `min-[1120px]:pt-12` pelo
      `className` … Esta asserção é o pino do número que fica; a compensação da
      home é da Tarefa 42.~~

      ⚠️ **A COMPENSAÇÃO NUNCA FOI ENTREGUE, e a Tarefa 42 passou — corrigido
      na auditoria dela (2026-09-21).** Medido: `grep -rn "pt-12"` em
      `packages/{app,ui}/src/` devolve **só prosa** (este comentário e o docblock de
      produção), e o `ScreenProps` do app **não tem `className`** — ela não era
      sequer possível sem mexer no `Screen`.

      **Decisão, com o custo declarado:** fica `pt-10` (40px) em todas as
      telas, e os 8px de `InicioDesktop.dc.html:35` são uma **divergência
      declarada**. Um `className` no `Screen` é escotilha genérica; uma prop
      para um chamador só é o "peso" que a decisão B da 41a proíbe. A home é a
      tela da **Tarefa 45** — é lá que os 48px entram, se o dono quiser.

      Esta asserção continua sendo o pino do número que fica.
    */
    const { container } = render(<ReadingColumn>leitura</ReadingColumn>);

    expect(
      (container.firstElementChild as HTMLElement).className.split(/\s+/u),
    ).toContain('min-[1120px]:pt-10');
  });

  it('carries no text of its own (decision A)', () => {
    const { container } = render(
      <ReadingColumn rail={<MarginRail>{null}</MarginRail>}>
        {null}
      </ReadingColumn>,
    );

    expect(container.textContent).toBe('');
  });
});
