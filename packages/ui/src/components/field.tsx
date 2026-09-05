import { type ReactNode, useId } from 'react';

import { cx } from '../cx';

/**
 * O que o `Field` entrega ao controle. Espalhe no seu `input`/`textarea`:
 *
 * ```tsx
 * <Field label={t('auth.email')} error={emailError} hint={t('auth.emailHint')}>
 *   {(control) => <input {...control} {...register('email')} type="email" />}
 * </Field>
 * ```
 *
 * ⚠️ Ordem do espalhamento importa: o `register` do React Hook Form não define
 * `id` nem `aria-describedby`, então espalhá-lo DEPOIS é seguro. Qualquer prop
 * própria que redefina `id` desamarra o rótulo do campo (regra 10).
 */
export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

export interface FieldProps {
  /** Já traduzido pela tela. O `ui` não chama `t()` (decisão B). */
  label: string;
  children: (control: FieldControlProps) => ReactNode;
  /**
   * A dica estável do campo ("mínimo de 8 caracteres"). Continua legível com o
   * campo em erro — por isso ela não é substituída pela mensagem de erro.
   */
  hint?: string;
  /**
   * ⚠️ MENSAGEM JÁ TRADUZIDA, e nunca a string que a API devolveu.
   *
   * `docs/CONVENCOES-CODIGO.md` §6.2: fora da classe 400 o corpo de erro leva
   * texto GENÉRICO por status, e mesmo na 400 as mensagens do Zod vêm em
   * inglês. §6.8: o `ApiError` chega à tela com `apiErrorKey`, e é a tela que
   * faz `t(apiErrorKey)`. Passar `error.message` para cá põe inglês de
   * biblioteca — ou mensagem interna de domínio — na frente do usuário.
   *
   * ⚠️ PERGUNTA ABERTA, MEDIDA E NÃO RESOLVIDA (rodada de correção da Tarefa
   * 13): a frase acima **não tem imposição nenhuma**. `error?: string` aceita
   * `apiError.message` sem uma objeção do compilador ou de um teste, e nenhum
   * teste de runtime pode distinguir uma string traduzida de uma string da
   * API — as duas são `string`.
   *
   * As duas saídas conhecidas, e nenhuma foi tomada aqui porque a escolha é do
   * dono:
   *
   * 1. **Tipo nominal** — um `TranslatedText` (`string & { __translated: true }`)
   *    que só o `t()` da tela produz. Fecha de verdade, e contamina toda
   *    assinatura de prop de texto do design system (`label`, `hint`, `title`,
   *    `closeLabel`, …), não só esta.
   * 2. **Regra de ESLint** — proibir `error={...message}` / `apiError.message`
   *    em JSX. Mais barato e mais frouxo: pega a forma óbvia, não a variável
   *    intermediária.
   *
   * A Tarefa 15 é a primeira tela real com formulário e `apiErrorKey` na mão —
   * é lá que se decide, com um caso concreto na frente.
   */
  error?: string;
  /** Sobrescreve o id gerado. Útil quando a tela precisa focar o campo. */
  id?: string;
  className?: string;
}

/**
 * Rótulo + controle + dica + erro, com a fiação de acessibilidade amarrada.
 *
 * É o componente que quebra em silêncio: um `aria-describedby` apontando para
 * um id que não existe não muda um pixel na tela, e simplesmente não anuncia
 * nada para quem usa leitor de tela.
 */
export function Field({
  children,
  className,
  error,
  hint,
  id,
  label,
}: FieldProps) {
  const generated = useId();
  const controlId = id ?? `${generated}-control`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;

  /*
    REGRA 12: com dica E erro, os DOIS são referenciados, e nesta ordem.

    A ordem é a do GOV.UK Design System (`aria-describedby="…-hint …-error"`),
    que é o precedente pesquisado: a dica é o contexto estável e vem primeiro,
    a correção vem depois e fecha a fala. É também a ordem do DOM, então quem
    lê a tela e quem ouve a tela recebem a mesma sequência.
  */
  const describedBy =
    cx(hint !== undefined && hintId, error !== undefined && errorId) ||
    undefined;

  const control: FieldControlProps = {
    id: controlId,
    'aria-describedby': describedBy,
    // REGRA 13: sem erro NÃO existe o atributo. `aria-invalid="false"` num
    // campo intocado é ruído — e alguns leitores anunciam a negação.
    'aria-invalid': error !== undefined ? true : undefined,
  };

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {/* REGRA 10: `htmlFor` = `id` do controle, então clicar no rótulo foca o
          campo — o alvo de toque do rótulo passa a valer também. */}
      <label className="text-sm font-medium text-content" htmlFor={controlId}>
        {label}
      </label>
      {hint !== undefined ? (
        <p className="text-sm text-subtle" id={hintId}>
          {hint}
        </p>
      ) : null}
      {children(control)}
      {error !== undefined ? (
        /*
          Sem `role="alert"` de propósito: com `aria-describedby` apontando
          para cá, o leitor já lê a mensagem ao focar o campo, e o `alert`
          faria a mesma frase ser dita duas vezes. Erro que aparece com o foco
          longe do campo é responsabilidade da TELA (focar o primeiro campo
          inválido no submit) — Tarefa 15.
        */
        <p className="text-sm text-danger" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
