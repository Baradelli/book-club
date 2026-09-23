import { cx } from '../cx';

/**
 * Os três tamanhos do canvas. Não há um quarto: cada um foi medido num
 * artboard de verdade, e um tamanho sem consumidor é peso (decisão B da
 * Tarefa 41a).
 */
export type BookSpineSize = 'sm' | 'md' | 'lg';

/**
 * As duas paletas de lombada.
 *
 * Elas existem por uma razão de desenho que o `theme.css` já registra: "São
 * duas, para que dois livros lado a lado não sejam o mesmo retângulo"
 * (`Inicio.dc.html:71` e `:81`, a estante com dois livros). **Quem escolhe é a
 * TELA** — este componente não sabe nada sobre o livro, e derivar a paleta de
 * um `id` aqui seria ressuscitar a paleta de avatar que a decisão F matou.
 *
 * ⚠️ **O SEGUNDO VALOR SE CHAMA `secondary` POR CAUSA DE UM FALSO POSITIVO DE
 * UMA GUARDA — e isso está escrito assim de propósito.**
 *
 * Com a chave `alt`, a linha dela no mapa abaixo casa o padrão
 * `TEXT_ATTRIBUTE` de `src/__tests__/no-hardcoded-ui-text.test.ts`, que
 * procura `alt` seguido de `=`/`:` e uma string — porque `alt` é o texto
 * alternativo de uma imagem. A guarda contou a lista de classes como a **34ª
 * string de interface do pacote** e estourou o teto de 33.
 *
 * ⚠️ **Isso NÃO foi a guarda pegando texto de interface: foi um FALSO
 * POSITIVO dela.** O valor é uma lista de classe do Tailwind, não frase
 * nenhuma. (Ele não está reescrito aqui de propósito: o Tailwind extrai nome
 * de classe de COMENTÁRIO também — medido na Tarefa 13 —, e uma classe citada
 * em prosa emite CSS mesmo que ninguém a use.) A primeira versão deste docblock
 * descrevia o episódio como se a guarda tivesse acertado, o que é a leitura
 * mais confortável e a menos verdadeira — corrigido na auditoria (2026-09-21).
 *
 * ⚠️ **E o preço real fica registrado: a guarda passou a mandar no NOME da
 * API pública deste componente.** Renomear a chave continua sendo mais barato
 * que alargar uma guarda fechada de outra fatia — `secondary` também é um nome
 * melhor que `alt` para uma paleta —, mas é exatamente o risco que o docblock
 * da própria guarda avisa ("uma guarda larga demais passa a mandar no
 * produto"). Se um terceiro componente esbarrar nela, a conversa é com o dono
 * sobre o extrator, não mais uma renomeação.
 */
export type BookSpinePalette = 'primary' | 'secondary';

/**
 * ⚠️ MAPAS LITERAIS, nunca montados em runtime (decisão C).
 *
 * `` `bg-spine${n}` `` compila e pinta nada: o Tailwind emite o CSS do que
 * encontra ESCRITO no código-fonte. É a lição que o `avatar-color.ts`
 * carregava por escrito antes de morrer na Tarefa 41a, e o acusador é
 * `app/src/__tests__/ui-source-scan.test.ts` — quando ele alcança a classe.
 */
const SIZE_CLASS: Record<BookSpineSize, string> = {
  // `Inicio.dc.html:71`: 42×60, raio `1px 3px 3px 1px`, `border-left:3px`,
  // `padding:5px 3px`.
  sm: 'h-15 w-10.5 rounded-[1px_3px_3px_1px] border-l-[3px] px-[3px] py-[5px]',
  // `Livro.dc.html:44`: 58×84, raio `1px 4px 4px 1px`, `border-left:4px`,
  // `padding:7px 4px`.
  md: 'h-21 w-14.5 rounded-[1px_4px_4px_1px] border-l-4 px-1 py-[7px]',
  // `LivroDesktop.dc.html:47`: 88×128, raio `1px 5px 5px 1px`,
  // `border-left:5px`, `padding:10px 6px`.
  lg: 'h-32 w-22 rounded-[1px_5px_5px_1px] border-l-[5px] px-1.5 py-2.5',
};

/**
 * O CORPO da lombada, e ele está fora da escala de sete degraus de propósito.
 *
 * ⚠️ Medido: 7,5px / 9px / 12px (`Inicio.dc.html:72`, `Livro.dc.html:45`,
 * `LivroDesktop.dc.html:48`). O menor degrau da escala é `--size-micro`
 * (9,5px), e o título de uma lombada de 42px de largura não tem para onde
 * crescer — ele é DESENHO de livro, não texto de interface, e é por isso que
 * ele não entra na escala. Fica registrado como divergência da fatia.
 */
const TITLE_SIZE_CLASS: Record<BookSpineSize, string> = {
  sm: 'text-[7.5px]',
  md: 'text-[9px]',
  lg: 'text-[12px]',
};

const PALETTE_CLASS: Record<BookSpinePalette, string> = {
  primary: 'bg-spine border-spine-edge text-spine-fg',
  secondary: 'bg-spine2 border-spine2-edge text-spine2-fg',
};

export interface BookSpineProps {
  /** `Book.title` — conteúdo do usuário, que não se traduz. */
  title: string;
  size?: BookSpineSize;
  palette?: BookSpinePalette;
  /**
   * Nome acessível, JÁ TRADUZIDO, para quando a lombada aparece SOZINHA.
   *
   * ⚠️ Sem ele a lombada é `aria-hidden`, e esse é o caso comum: nos TRÊS
   * artboards o título está escrito ao lado dela (`Inicio.dc.html:75`,
   * `Livro.dc.html:48`, `LivroDesktop.dc.html:51`). Anunciá-lo duas vezes
   * seguidas é o defeito que a regra 6 nomeia. Mesma prop, mesmo padrão e
   * mesmo motivo do `PersonAvatar`.
   */
  label?: string;
  className?: string;
}

/**
 * A LOMBADA TIPOGRÁFICA — o livro sem capa, desenhado.
 *
 * O app não tem imagem de capa e não vai ter: cadastrar um livro é digitar
 * título, autor e plano. A lombada é o que dá ao acervo a cara de estante sem
 * pedir um arquivo a ninguém — e ela é `div`, `span` e borda, nada de `<svg>`
 * (regra 8, conferido no canvas: o desenho inteiro é `writing-mode` mais um
 * `border-left` grosso).
 */
export function BookSpine({
  className,
  label,
  palette = 'primary',
  size = 'md',
  title,
}: BookSpineProps) {
  return (
    <span
      // O caso comum é a duplicação, então o padrão sai do caminho de quem
      // ouve; com `label`, a lombada passa a ser uma imagem com nome.
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
      className={cx(
        'flex shrink-0 items-center justify-center overflow-hidden border-solid',
        SIZE_CLASS[size],
        PALETTE_CLASS[palette],
        className,
      )}
      role={label === undefined ? undefined : 'img'}
    >
      <span
        className={cx(
          /*
            `writing-mode:vertical-rl` + `rotate(180deg)` é o par do canvas
            (`Inicio.dc.html:72`). Sem a rotação o texto corre de cima para
            baixo com as letras viradas para o lado errado — a lombada de um
            livro brasileiro se lê de baixo para cima.

            `whitespace-nowrap` + `overflow-hidden` no pai: uma lombada não
            quebra linha. O título que não cabe na altura é cortado, como a
            impressão corta.
          */
          '[writing-mode:vertical-rl] rotate-180 whitespace-nowrap font-reading',
          TITLE_SIZE_CLASS[size],
        )}
      >
        {title}
      </span>
    </span>
  );
}
