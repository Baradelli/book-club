import { cx } from '@clube/ui';

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
 * `min-h-12` = 48px, acima do piso de toque de 44px da decisão F da Tarefa 13
 * (a repaginação visual de 2026-09-24 subiu o campo junto com o corpo de texto).
 *
 * `aria-invalid:shadow-field-error` fecha o par com o `Field`: é ele que põe
 * o `aria-invalid` no controle (regra 11 da Tarefa 13), e é o atributo — não
 * uma segunda prop de estado — que acende o filete de erro. Um estado só, dois
 * efeitos.
 *
 * `outline-hidden` e não `outline-none`: o foco é desenhado pela sombra
 * (`focus:shadow-field-focus`), e sombra some no modo de alto contraste do
 * sistema. O `outline-hidden` do Tailwind v4 esconde o contorno só na tela
 * normal e o devolve em `forced-colors` — o `outline-none` o apagaria ali também.
 *
 * ⚠️ **A BORDA TEM TOM PRÓPRIO DESDE A TAREFA 48 — decisão do dono de
 * 2026-09-24, e ela vale para as NOVE telas que leem esta constante.**
 *
 * Até aqui o campo usava o filete decorativo do caderno, e a nota 19 da 47a
 * mediu o que isso valia: **1,35:1** contra a página no claro e **1,38:1** no
 * escuro, contra os **3:1** que a WCAG 1.4.11 pede para a fronteira de um
 * componente de interface. Nenhum token do projeto passava. A Tarefa 48 deu ao
 * campo o `--border-field`, que fecha 3:1 contra as seis superfícies.
 *
 * ⚠️ **REPAGINAÇÃO VISUAL — decisão do dono de 2026-09-24: o campo não tem mais
 * `border`.** A fronteira é um filete fino NA COR DO APP mais uma sombra, os
 * dois no token `--shadow-field` (utilitário `shadow-field`). O piso de 3:1
 * continua valendo para esse filete, e é medido no mesmo lugar.
 *
 * ⚠️ **O filete DECORATIVO não mudou junto, e isso é decisão:** cartão, item
 * de lista e divisor continuam discretos, porque o piso de 3:1 é de controle e
 * não de moldura. Quem guarda as duas metades é
 * `src/__tests__/theme-tokens.test.ts` (o número) e
 * `pages/__tests__/form-styles.test.ts` (o alcance: as nove telas, e nenhum
 * `<input>` desenhando borda à mão).
 */
export const TEXT_INPUT_CLASS = cx(
  'min-h-12 w-full rounded-control bg-surface px-4 text-base text-content shadow-field outline-hidden transition-shadow',
  'placeholder:text-subtle focus:shadow-field-focus aria-invalid:shadow-field-error',
);

/** A mensagem que vale para o formulário todo, não para um campo. */
export const FORM_ERROR_CLASS = 'text-sm text-danger';
