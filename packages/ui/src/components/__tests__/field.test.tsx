import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Field, type FieldProps } from '../field';

/**
 * Regras 10–13 — o componente que quebra em silêncio por definição.
 * (A 14 não tem teste próprio; o porquê está no fim do arquivo.)
 *
 * Um `aria-describedby` apontando para um id que não existe não muda um pixel
 * na tela: o campo fica bonito e simplesmente não anuncia nada. Idem para o
 * `aria-invalid` que ficou ligado depois de a pessoa corrigir o campo.
 */

/** Fixture é factory (§7.7). */
function renderField(props: Partial<FieldProps> = {}) {
  const { children, label = 'E-mail', ...rest } = props;

  return render(
    <Field label={label} {...rest}>
      {children ?? ((control) => <input {...control} type="email" />)}
    </Field>,
  );
}

function control(): HTMLInputElement {
  const input = screen.getByLabelText('E-mail');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('o controle do Field não é um input');
  }
  return input;
}

describe('Field', () => {
  it('ties the label to the control, so clicking the label focuses it (rule 10)', () => {
    renderField();

    // `getByLabelText` só acha o campo se `htmlFor` casar o `id` — é a mesma
    // ligação que faz o rótulo virar alvo de toque no celular. Se ela quebrar,
    // esta busca falha, e é de propósito.
    const label = screen.getByText('E-mail');
    expect(label.getAttribute('for')).toBe(control().id);
    expect(control().id).not.toBe('');
  });

  it('honours an explicit id, so the screen can focus the field (rule 10)', () => {
    renderField({ id: 'login-email' });

    expect(control().id).toBe('login-email');
    expect(screen.getByText('E-mail').getAttribute('for')).toBe('login-email');
  });

  it('points aria-describedby at the error message, not at some other node (rule 11)', () => {
    renderField({ error: 'Informe um e-mail válido' });

    const describedBy = control().getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();

    // O ELO: o id referenciado tem de ser o do nó que carrega a mensagem.
    // Um `aria-describedby` com id inexistente é exatamente o defeito
    // invisível — a tela fica igual e o leitor de tela fica calado.
    const described = document.getElementById(describedBy ?? '');
    expect(described?.textContent).toBe('Informe um e-mail válido');
    expect(control().getAttribute('aria-invalid')).toBe('true');
  });

  it('references both the hint and the error, hint first (rule 12)', () => {
    renderField({
      error: 'Informe um e-mail válido',
      hint: 'Usamos só para entrar',
    });

    const ids = (control().getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toHaveLength(2);

    // Os DOIS, e na ordem do GOV.UK Design System (dica, depois erro) — que é
    // também a ordem do DOM, então quem lê e quem ouve recebem a mesma
    // sequência. Um `describedby` que sobrescreve a dica com o erro faz a
    // pessoa perder a única explicação do campo justamente quando errou.
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      'Usamos só para entrar',
      'Informe um e-mail válido',
    ]);
  });

  it('describes the field by the hint alone when there is no error (rule 12)', () => {
    renderField({ hint: 'Usamos só para entrar' });

    const describedBy = control().getAttribute('aria-describedby');
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe(
      'Usamos só para entrar',
    );
  });

  it('has no aria-invalid and no aria-describedby when the field is clean (rule 13)', () => {
    renderField();

    // `aria-invalid="false"` num campo intocado é ruído, e alguns leitores
    // anunciam a negação. `aria-describedby=""` é pior: referência vazia.
    expect(control().hasAttribute('aria-invalid')).toBe(false);
    expect(control().hasAttribute('aria-describedby')).toBe(false);
  });

  /*
    ============================================================================
    A PINTURA DO CANVAS — Tarefa 41a, decisão F
    ============================================================================

    ⚠️ Os `it()` acima NÃO foram tocados, e é isso que a decisão F promete: a
    pintura não tem permissão para mexer na associação rótulo↔controle. Os dois
    abaixo medem só o que o canvas mudou.

    ⚠️ E SÃO **SEIS**, NÃO SETE. A spec da Tarefa 41a (regra 6 e a tabela "por
    que a 41 virou 41a e 41b") diz "os 7 `it()` do `field.test.tsx`", e o
    número foi CONTADO nesta fatia: `grep -c "^\s*it("` dá 6 aqui, e o próprio
    vitest reportou 6 antes de os dois de baixo nascerem. Com isso o total da
    fatia é **68** `it()`, não 69 — os outros oito arquivos batem com a tabela
    (button 10 · list 9 · filter-bar 7 · filter-chip 3 · sheet 11 ·
    person-avatar 17 · styles 3 · avatar-contrast 2).
  */
  it('writes the label in the mono uppercase of the canvas (decision F)', () => {
    /*
      Medido em `Main.dc.html:48` e `Convite.dc.html:45`, valor a valor:
      `font-family:'Geist Mono'` · `font-size:9.5px` · `letter-spacing:0.12em` ·
      `text-transform:uppercase` · `color:var(--text-muted)`.

      O rótulo do caderno encadernado é rótulo de seção em monoespaçada
      maiúscula, não um `text-sm font-medium` de formulário de aplicativo.
      `text-micro` é o degrau de 9,5px da escala (`--size-micro`), e
      `text-muted` é o cinza que passa 4,5:1 nas três superfícies (medido na
      Tarefa 39).
    */
    renderField();

    const label = screen.getByText('E-mail');
    for (const utility of [
      'font-mono',
      'text-micro',
      'uppercase',
      'text-muted',
    ]) {
      expect(label.className.split(/\s+/u)).toContain(utility);
    }
  });

  it('puts the hint BELOW the control, the way the canvas draws it (decision F)', () => {
    /*
      ⚠️ ESTA É A ÚNICA MUDANÇA DE ORDEM DO DOM DA FATIA, e ela é do canvas:
      em `Convite.dc.html` a dica ("É como o clube vai te ver…",
      "Mínimo de 8 caracteres.") vem DEPOIS do `<input>`, não antes.

      E a ordem do `aria-describedby` continua dica→erro (o teste da regra 12,
      intocado): dica e erro continuam nesta ordem RELATIVA no DOM, então quem
      lê a tela e quem ouve a tela continuam recebendo a mesma sequência. É a
      propriedade que o GOV.UK Design System fixa, e ela sobrevive à mudança.
    */
    renderField({
      error: 'Informe um e-mail válido',
      hint: 'Usamos só para entrar',
    });

    const nodes = [
      screen.getByText('E-mail'),
      control(),
      screen.getByText('Usamos só para entrar'),
      screen.getByText('Informe um e-mail válido'),
    ];

    for (let index = 1; index < nodes.length; index += 1) {
      const previous = nodes[index - 1];
      const current = nodes[index];
      if (previous === undefined || current === undefined) {
        throw new Error('o fixture do Field não montou os quatro nós');
      }
      // `DOCUMENT_POSITION_FOLLOWING` = 4. Comparar POSIÇÃO e não índice de
      // filho: o controle é do consumidor e pode vir embrulhado.
      expect(
        previous.compareDocumentPosition(current) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeGreaterThan(0);
    }
  });

  /*
    ⚠️ A REGRA 14 NÃO TEM MAIS TESTES PRÓPRIOS AQUI, e é uma remoção medida.

    Havia dois — `shows the message it was given, and nothing it invented` e
    `keeps the hint readable while the field is in error` —, e os dois eram
    INFALSIFICÁVEIS: faziam `getByText(mensagem)` num componente cujo corpo do
    `<p>` é literalmente `{error}`. Medido: removendo o `id={errorId}` do `<p>`
    de erro — o que quebra toda a fiação que a prosa da regra 14 descreve — os
    dois continuavam VERDES, e só os testes 11 e 12 acusavam.

    Eram dois testes que somavam contagem sem somar cobertura. O conteúdo que
    eles diziam provar está nos testes 11 e 12, e lá ele é provado pelo ELO: a
    mensagem é lida através do id que o `aria-describedby` aponta, e a dica
    continua referenciada JUNTO com o erro. Um componente que invente texto, ou
    que troque a dica pelo erro, é acusado lá.

    A metade da regra 14 que NÃO tem imposição nenhuma — "a mensagem nunca é uma
    string da API" — está registrada como pergunta aberta no docblock de
    `FieldProps.error`. Não é coisa que teste de runtime pegue.
  */
});
