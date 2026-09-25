import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HOME_PATH } from '../../auth/require-auth';
import { NotFoundPage } from '../not-found';
import { expectNoGuilt } from './anti-guilt-dom';
import { renderPage, tokensOf, utilitiesIn } from './harness';

/**
 * ============================================================================
 * A TELA DE ENDEREÇO ERRADO — `NaoEncontrada.dc.html` (Tarefa 48, decisão B)
 * ============================================================================
 *
 * ⚠️ **ELA NÃO TINHA ARQUIVO DE TESTE NENHUM ATÉ AQUI** — medido: a
 * `not-found.tsx` era a única das quinze telas sem suíte própria, e por isso
 * também a única cuja **varredura anti-culpa nunca rodou**. Uma tela que só
 * aparece quando algo já deu errado é justamente onde uma frase de cobrança
 * cabe sem ninguém revisar.
 *
 * ⚠️ **ELA É UMA DAS DUAS EXCEÇÕES DO `H1_EXCEPTIONS`**, e continua sendo:
 * o `h1` é dela, mas a CLASSE do título vem do cromo
 * (`chrome.test.tsx › gives the two h1 exceptions the SAME title class`). A
 * lista não cresce nem encolhe nesta fatia.
 *
 * O que o canvas desenha (`NaoEncontrada.dc.html:37-53`), e o que mudou:
 *
 * | peça | canvas | antes desta fatia |
 * | --- | --- | --- |
 * | alinhamento | `align-items:center`, texto centrado | `items-start`, texto à esquerda |
 * | o glifo | 56px, traço `--border-strong` | 32px, `opacity-60` |
 * | a frase | `--text-muted`, `text-wrap:pretty` | `opacity-70` |
 * | o filete | 72×1px `--border` | não existia |
 * | a volta | caixa de 48px com filete e raio | link sublinhado |
 *
 * ⚠️ **AS DUAS `opacity-*` ERAM CINZAS QUE NINGUÉM MEDIU**, e é o que as
 * tornava mais do que um detalhe: `opacity-70` sobre o creme resolve
 * `#5c5f58` (5,76:1) e `opacity-60` resolve `#72746c` (4,21:1) — valores que
 * não são token nenhum, que mudam sozinhos se a tinta ou o papel mudarem, e
 * que nenhuma guarda de contraste do projeto olha, porque todas leem o
 * `theme.css`. Nenhum dos dois REPROVA hoje (o de 4,21 é glifo decorativo,
 * piso de 3:1), e é por isso que isto entrou como decisão B — desenho — e não
 * como conserto de contraste.
 */
describe('a tela de endereço errado (decisão B, Tarefa 48)', () => {
  function renderNotFound(): void {
    renderPage(<NotFoundPage />, { path: '/nao-existe' });
  }

  it('⚠️ says the address does not exist, and never that the PERSON failed', () => {
    renderNotFound();

    /*
      ⚠️ `queryByRole` + `not.toBeNull()`, nunca `getByRole` + `toBeDefined()`:
      o `getBy*` LANÇA quando não acha, então o `expect` não assertaria nada
      (§7.4). O título é a prova de que a tela existe; a varredura é a de que
      ela não cobra.
    */
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeNull();
    expectNoGuilt();
  });

  it('⚠️ centres the page, like the canvas does', () => {
    renderNotFound();

    const heading = screen.getByRole('heading', { level: 1 });
    const section = heading.closest('section');

    expect(section).not.toBeNull();
    expect(tokensOf(section as HTMLElement, 'items-center')).toHaveLength(1);
    expect(tokensOf(heading, 'text-center')).toHaveLength(1);
  });

  it('⚠️ paints the greys with TOKENS, never with an opacity nobody measured', () => {
    renderNotFound();

    const classes = Array.from(document.querySelectorAll('*'))
      .map((node) => node.getAttribute('class') ?? '')
      .join(' ');

    /*
      ⚠️ **POR TOKEN, E A FUNÇÃO VEM DO HARNESS** (regra 9: a forma certa tem
      UM dono, e quem precisa dela importa em vez de copiar). Um
      `includes('opacity')` cru também acusaria um `group-hover:opacity-100` de
      outra tela; aqui só esta renderiza, mas a forma frágil é a que se copia.

      ⚠️ E a varredura é por PREFIXO, não pelos dois nomes: escrevê-los aqui
      seria trazer de volta o custo de CSS que a troca acabou de pagar — o
      scanner do Tailwind lê o texto bruto. (Os arquivos de `__tests__` estão
      fora do `@source`, então não custariam byte nenhum; a forma fica assim
      porque um prefixo pega também o utilitário de opacidade que ninguém
      previu.)
    */
    const utilities = utilitiesIn(classes);

    expect(utilities.filter((name) => name.startsWith('opacity-'))).toEqual([]);
    expect(utilities).toContain('text-muted');
  });

  it('⚠️ gives the way back a REAL touch target, with the 44px floor', () => {
    renderNotFound();

    const back = screen.getByRole('link');

    /*
      ⚠️ O canvas desenha a volta como uma CAIXA de 48px com filete e raio
      (`NaoEncontrada.dc.html:51`), não como um sublinhado. O que importa para
      quem toca é o piso de 44px da decisão F da Tarefa 13 — um link de texto
      de 20px de altura numa tela que só aparece depois de um erro é o pior
      alvo do app.
    */
    // Repaginação visual (decisão do dono, 2026-09-24): a caixa virou pílula.
    expect(tokensOf(back, 'rounded-full')).toHaveLength(1);
    expect(tokensOf(back, 'border')).toHaveLength(1);
    expect(tokensOf(back, 'min-h-12')).toHaveLength(1);
    // E deixou de ser sublinhado: a caixa é que diz que dá para tocar.
    expect(tokensOf(back, 'underline')).toEqual([]);
  });

  it('⚠️ and the way back actually GOES somewhere — the destination, not the shape', () => {
    /*
      ⚠️⚠️ **A ASSERÇÃO QUE FALTAVA, e ela é a única que a tela existe para
      cumprir.** Medido na rodada de correção da Tarefa 48: o mutante que troca
      o destino da volta por um endereço que não existe tinha **zero**
      acusadores. As quatro asserções acima pinam a FORMA do botão — raio,
      filete, alvo de toque, ausência de sublinhado — e nenhuma pergunta para
      onde ele leva. Numa tela cuja razão de existir é devolver a pessoa ao
      início, mandá-la para um segundo endereço inexistente é o defeito que ela
      deveria ser incapaz de ter: a 404 devolvendo 404.

      ⚠️ **E o esperado NÃO é uma string literal digitada aqui:** é o
      `HOME_PATH`, o mesmo módulo que o router lê
      (`<Route path={HOME_PATH} element={<HomePage />} />`). Comparar com `'/'`
      escrito à mão provaria só que duas pessoas digitaram a mesma barra; assim
      o par fica preso ao endereço de verdade, e uma mudança de rota move os
      dois lados juntos ou nenhum.
    */
    renderNotFound();

    const back = screen.getByRole('link');

    expect(back.getAttribute('href')).toBe(HOME_PATH);
    // E ele sai DESTE endereço errado — a volta não é um link para si mesma.
    expect(back.getAttribute('href')).not.toBe('/nao-existe');
  });
});
