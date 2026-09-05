import { mergeAttributes, Node } from '@tiptap/core';

/**
 * O nó "Aviso" (`docs/EDITOR.md` §5) — um bloco de destaque dentro da
 * anotação: "reler este trecho", "perguntar isso no encontro".
 *
 * É um nó CUSTOMIZADO e não uma citação estilizada porque as duas coisas
 * convivem numa anotação de leitura: a citação é do livro, o aviso é de quem
 * está lendo. Com o mesmo nó, um dia alguém trocaria o estilo de um e mudaria
 * o outro.
 *
 * `content: 'block+'` (e não `'inline*'`): um aviso pode ter dois parágrafos e
 * uma lista dentro. `defining: true` faz o `Enter` no fim não escapar do bloco
 * e o paste de um parágrafo não substituir o aviso inteiro.
 *
 * O estilo vive em `editor.css`, no seletor `div[data-type='callout']` — e ele
 * usa a cor de AÇÃO, nunca `--clube-danger`: o princípio anti-culpa do
 * `docs/plano-clube-do-livro.md` §1 reserva o vermelho para erro de formulário
 * e ação destrutiva. Um aviso amarelo-vermelho ensinaria que anotar é falta.
 */
export const CALLOUT_TYPE = 'callout';

export const Callout = Node.create({
  name: CALLOUT_TYPE,
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': CALLOUT_TYPE }),
      0,
    ];
  },
});
