import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GrifoText, PEN_KEYS, type PenKey } from '../grifo-text';

/**
 * TAREFA 41b — O TRECHO GRIFADO, pintado.
 *
 * ⚠️ QUEM CONSOME (nota nº 10 da Tarefa 41a: parta do consumidor). As telas
 * que mostram grifo: o dia (`pages/day-note.tsx`), o acervo
 * (`pages/acervo.tsx`), a busca (`pages/busca.tsx`) e os dois formulários de
 * grifo — e a tradução hex → caneta mora em `pages/highlight-colors.tsx`, ao
 * lado da hex → chave de i18n que já está lá. As fatias são a 43, a 46 e a 47.
 *
 * As medidas, nos artboards dessas telas:
 *
 * | onde | linha | desenho |
 * | --- | --- | --- |
 * | dia | `Dia.dc.html:78` | `background:var(--pen-a)`, `box-shadow:0 0 0 2px var(--pen-a)`, `border-radius:1px` |
 * | dia, desktop | `DiaDesktop.dc.html:65` | idem |
 * | margem do desktop | `DiaDesktop.dc.html:120,128` | `background` + `box-shadow` da mesma caneta, sem raio |
 */
describe('GrifoText', () => {
  it('paints the excerpt with the pen the screen chose', () => {
    render(<GrifoText pen="v">encaixar-se é o oposto de pertencer</GrifoText>);

    const classes = screen
      .getByText('encaixar-se é o oposto de pertencer')
      .className.split(/\s+/u);
    expect(classes).toContain('bg-pen-v');
  });

  it('⚠️ takes the pen by KEY, never by hexadecimal (decision B)', () => {
    /*
      Os cinco hexes de `HIGHLIGHT_COLORS` (`packages/shared`) são DADO
      PERSISTIDO: `Highlight.color` é coluna, é filtro de rota
      (`?color=%23facc15`) e é índice (`@@index([bookId, color])`). O canvas
      define como o grifo é PINTADO, nunca o que é GUARDADO.

      Um componente que recebesse `'#facc15'` passaria a conhecer o dado — e o
      dia em que o dono trocasse um dos cinco hexes, `packages/ui` precisaria
      saber. A tradução hex → caneta é da TELA.

      O pino é o TIPO, e aqui ele é conferido do lado do valor: as cinco
      chaves são letras, e nenhuma delas se parece com uma cor.
    */
    expect([...PEN_KEYS]).toEqual(['a', 'v', 'l', 'z', 'r']);
    for (const key of PEN_KEYS) {
      expect(key).not.toContain('#');
      expect(key).toHaveLength(1);
    }
  });

  it('⚠️ uses the SAME pen for the background and for the halo (decision D)', () => {
    /*
      §A.8: o `box-shadow: 0 0 0 2px` alarga a marca além da caixa do texto,
      como caneta de verdade faz — sem ele o grifo fica colado nas letras.

      ⚠️ São DUAS declarações e UM token, e é por isso que este teste compara
      IGUALDADE e não presença: `bg-pen-a` com `ring-pen-v` daria à marca uma
      auréola de outra cor, e um teste que só checasse "tem fundo e tem
      sombra" ficaria verde.
    */
    for (const key of PEN_KEYS) {
      const { unmount } = render(<GrifoText pen={key}>trecho</GrifoText>);

      const classes = screen.getByText('trecho').className.split(/\s+/u);
      const background = classes.find((name) => name.startsWith('bg-pen-'));
      const halo = classes.find((name) => name.startsWith('ring-pen-'));

      expect(background).toBe(`bg-pen-${key}`);
      expect(halo).toBe(`ring-pen-${key}`);
      // A igualdade propriamente dita, escrita como tal: a caneta do fundo é
      // a mesma caneta da auréola.
      expect(background?.slice('bg-'.length)).toBe(halo?.slice('ring-'.length));

      unmount();
    }
  });

  it('gives the halo the 2px of the canvas', () => {
    render(<GrifoText pen="a">trecho</GrifoText>);

    // `ring-2` é `box-shadow: 0 0 0 2px <ring-color>` — exatamente o que o
    // canvas declara (`Dia.dc.html:78`). Um `ring` sem número seria 1px, e a
    // marca encostaria nas letras da linha de cima.
    expect(screen.getByText('trecho').className.split(/\s+/u)).toContain(
      'ring-2',
    );
  });

  it('⚠️ writes the pen→class map as LITERALS, never assembled at runtime (decision C)', () => {
    /*
      ⚠️ ESTA É A GUARDA QUE FALTAVA, E ELA PRECISOU EXISTIR — medido.

      `` `bg-pen-${key}` `` compila em TypeScript, roda, e põe a classe certa
      no DOM. Todo teste de render acima continuaria VERDE. O que ela não faz
      é gerar CSS: o Tailwind emite o CSS das classes que encontra ESCRITAS no
      código-fonte, e uma classe montada em runtime não está escrita em lugar
      nenhum. O sintoma é um grifo sem cor nenhuma, na tela, em produção.
      É a lição que o `avatar-color.ts` carregava por escrito antes de morrer
      na Tarefa 41a.

      ⚠️ E `emits every class packages/ui uses` **NÃO alcança este caso** —
      medido nesta fatia, não suposto. Os dois extratores dele
      (`classesFromContext` e `classesFromShape`) casam literais entre aspas
      SIMPLES e DUPLAS; um template literal fica entre CRASES e não casa
      nenhum dos dois. Com o mapa montado em runtime, o extrator simplesmente
      não vê classe nenhuma para exigir CSS — a lista de "classes que
      `packages/ui` usa" ENCOLHE, e aquele teste continua verde provando menos.
      Ele é UNIDIRECIONAL.

      Daí esta varredura, que lê o PRÓPRIO fonte do componente e exige que as
      cinco classes estejam lá, escritas.

      ⚠️ **E ELA NÃO É O ÚNICO ACUSADOR — desde a auditoria (2026-09-21) há um
      segundo, e ele é de outra espécie.**
      `app/src/__tests__/ui-source-scan.test.ts › ships the CSS of every map
      assembled from a key` exige `.bg-pen-a{` … `.ring-pen-r{` no CSS
      COMPILADO. Esta aqui pega uma GRAFIA (`${`); aquela pega QUALQUER
      montagem em runtime, porque não olha o fonte. As duas ficam: esta é
      rápida e mora ao lado do código; aquela é a que não se pode driblar.
    */
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/grifo-text.tsx'),
      'utf8',
    );

    /*
      ⚠️ COMENTÁRIO NÃO É CÓDIGO, e aqui isso DECIDE o teste — medido na
      primeira execução, que ficou vermelha: o docblock do `PEN_CLASS`
      explica a regra CITANDO a interpolação proibida, e a varredura acusou a
      própria documentação da regra que ela protege. É o mesmo tropeço que o
      `adr-0002-iconography.test.ts` já tinha resolvido do mesmo jeito
      (`docs/CONVENCOES-CODIGO.md` §7.1).

      E é a mesma razão pela qual a metade POSITIVA acima roda sobre o arquivo
      inteiro e não sobre o código limpo: ali, achar a classe num comentário
      não seria falso positivo — ela precisa mesmo estar escrita em algum
      lugar. O que morde é a metade de baixo.
    */
    const code = source
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');

    for (const key of PEN_KEYS) {
      expect(code).toContain(`bg-pen-${key}`);
      expect(code).toContain(`ring-pen-${key}`);
    }

    // E o lado negativo, que é o que morde: nenhuma interpolação dentro de um
    // nome de classe de caneta. Sem esta linha, um mapa montado em runtime
    // passaria desde que as cinco classes aparecessem num COMENTÁRIO.
    expect(code).not.toMatch(/(?:bg|ring)-pen-\$\{/u);
    // O par positivo: o padrão CASA de verdade. Sem ele, um regex quebrado
    // devolveria "não casou" para sempre e a guarda seria asserção vazia.
    expect('bg-pen-${key}').toMatch(/(?:bg|ring)-pen-\$\{/u);
  });

  it('is the span of the canvas, with the 2px radius of the mark', () => {
    const { container } = render(<GrifoText pen="l">trecho</GrifoText>);

    const mark = container.firstElementChild as HTMLElement;
    // `<span>` e não `<mark>`: o canvas desenha um `<span>`
    // (`Dia.dc.html:78`), e `<mark>` traz um fundo amarelo da folha de estilo
    // do navegador que brigaria com a caneta escolhida.
    expect(mark.tagName).toBe('SPAN');
    /*
      ⚠️ `rounded-mark` é `--r-1` (2px) e o canvas declara `border-radius:1px`
      — divergência de 1px, registrada. O `theme.css` já a conhece: "o canvas
      usa `1px` no lugar que ele [o `--r-1`] ocuparia". Acrescentar um sexto
      raio de 1px à escala fechada custaria mais que o pixel.

      E este é o PRIMEIRO consumidor de produção do `rounded-mark`, que estava
      sem nenhum desde a Tarefa 13 — o `styles.css` do app registra o prazo
      ("quem pinta grifo é a Tarefa 47").
    */
    expect(mark.className.split(/\s+/u)).toContain('rounded-mark');
  });

  it('carries no text of its own — the excerpt is the user’s (decision A)', () => {
    const { container } = render(<GrifoText pen="z">{null}</GrifoText>);

    expect(container.textContent).toBe('');
  });

  it('keeps the five keys in the order of HIGHLIGHT_COLORS', () => {
    // Amarelo, verde, laranja, azul, rosa — a ordem em que a paleta aparece
    // na barra do editor (`Dia.dc.html:105-119`) e no seletor de caneta
    // (`NovoGrifo.dc.html:60-64`). A tela traduz o hex para uma destas.
    const keys: PenKey[] = ['a', 'v', 'l', 'z', 'r'];
    expect([...PEN_KEYS]).toEqual(keys);
  });
});
