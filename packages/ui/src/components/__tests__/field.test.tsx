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
