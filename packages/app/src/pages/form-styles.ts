import { cx, FOCUS_RING } from '@clube/ui';

/**
 * O visual do campo de texto das telas de entrada.
 *
 * ⚠️ ACHADO DA TAREFA 15, registrado e não consertado: o design system da
 * Tarefa 13 entrega o `Field` (rótulo + dica + erro + a fiação de
 * acessibilidade) mas **nenhum controle** — o `Field` recebe o `input` por
 * render prop, então a primeira tela real é que decide altura, borda, raio e
 * cor de um campo de texto. Isso contraria o objetivo declarado da 13 ("quem
 * escrever a Tarefa 15 não decide cor, espaçamento nem altura de toque").
 *
 * A decisão E desta fatia proíbe criar componente em `ui/` ("pare e reporte"),
 * então a escolha conservadora foi manter a decisão visual **aqui**, no app,
 * num lugar só — e não espalhada pelas duas telas nem em CSS inline
 * (`CLAUDE.md`). Se o dono aprovar, isto vira um `TextInput` em `ui/`, com
 * teste, e este arquivo desaparece.
 *
 * `min-h-11` = 44px, o piso de toque da decisão F da Tarefa 13 — o mesmo do
 * `Button` tamanho `md`, para o campo e o botão terem a mesma altura de dedo.
 *
 * `aria-invalid:border-danger` fecha o par com o `Field`: é ele que põe o
 * `aria-invalid` no controle (regra 11 da Tarefa 13), e é o atributo — não uma
 * segunda prop de estado — que acende a borda. Um estado só, dois efeitos.
 */
export const TEXT_INPUT_CLASS = cx(
  'min-h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-content',
  'placeholder:text-subtle aria-invalid:border-danger',
  FOCUS_RING,
);

/** A mensagem que vale para o formulário todo, não para um campo. */
export const FORM_ERROR_CLASS = 'text-sm text-danger';
