import type { ReactNode } from 'react';

import { cx } from '../cx';
import { FOCUS_RING, SPACING_STEP_PX } from './styles';

export interface ListProps {
  children: ReactNode;
  /** Já traduzido. Nomeia a lista para o leitor de tela. */
  'aria-label'?: string;
  className?: string;
}

/**
 * A lista de livros (Tarefa 16), de anotações (19) e o plano de leitura (17).
 *
 * `<ul>` de verdade, e não um `<div>` com cara de lista: é o que faz o leitor
 * de tela anunciar "lista, 12 itens" — a informação que diz se vale a pena
 * continuar tabulando.
 */
export function List({ children, className, ...rest }: ListProps) {
  return (
    // `role="list"` EXPLÍCITO com `list-none`: o Safari remove a semântica de
    // lista de um `<ul>` com `list-style: none` — o marcador some e a fala
    // "lista, 12 itens" some com ele. É o par que se esquece.
    <ul
      className={cx('flex list-none flex-col', className)}
      role="list"
      {...rest}
    >
      {children}
    </ul>
  );
}

/**
 * A altura mínima do item. Mesma disciplina do `Button`: o número ao lado da
 * classe, porque o Tailwind precisa da classe literal e jsdom não mede layout.
 * 56px é acima do piso de 44px (decisão F) — o item de lista é o alvo que se
 * acerta com o polegar rolando a tela, e ele é o mais generoso do app.
 */
export const LIST_ITEM_HEIGHT_CLASS = 'min-h-14';
export const LIST_ITEM_HEIGHT_PX = 14 * SPACING_STEP_PX;

/**
 * A altura mínima da linha do SUMÁRIO, e por que ela é menor que a da linha
 * comum.
 *
 * ⚠️ MEDIDO no canvas (`Livro.dc.html:71`): a linha do plano tem
 * `padding:9px 0` sobre ~20px de conteúdo — algo em torno de **38px**, ABAIXO
 * do piso de 44px da decisão F. O sumário é denso de propósito (é sumário de
 * livro, não lista de aplicativo), mas ele também é um alvo de toque de
 * verdade: cada linha abre o dia.
 *
 * O piso vence, e o sumário fica no MÍNIMO dele — 44px, não os 56px da linha
 * comum. É a divergência canvas × decisão F desta fatia, e ela está registrada
 * no relatório.
 */
export const SUMARIO_ITEM_HEIGHT_CLASS = 'min-h-11';
export const SUMARIO_ITEM_HEIGHT_PX = 11 * SPACING_STEP_PX;

/**
 * `row` é a linha de sempre (livro, anotação, grifo); `sumario` é a linha do
 * PLANO DE LEITURA — pontinhos de condução e data/página em monoespaçada à
 * direita, como sumário de livro impresso (decisão G).
 */
export type ListItemVariant = 'row' | 'sumario';

/**
 * O estado da linha do sumário. `undefined` é o dia já passado (tinta cheia);
 * `today` é o dia de hoje (papel próprio e filete dourado); `future` é o dia
 * que ainda não chegou (apagado).
 */
export type ListItemTone = 'today' | 'future';

interface ListItemBase {
  /** Já traduzido (ou conteúdo do usuário, que não se traduz). */
  title: ReactNode;
  /** Slot de início: avatar de quem escreveu, ícone do dia, as marcas do dia. */
  start?: ReactNode;
  /**
   * Slot de fim: data, contador, chevron.
   *
   * ⚠️ Conteúdo NÃO interativo. O item inteiro já é um `button`/`a` (regra 22),
   * e um botão dentro de outro é HTML inválido — o navegador desfaz o
   * aninhamento e o layout quebra de um jeito difícil de achar.
   */
  end?: ReactNode;
  className?: string;
}

/**
 * O que o `ListItem` entrega a quem renderiza a âncora: o endereço, as classes
 * da superfície inteira e o conteúdo já montado.
 *
 * `className` vai junto de propósito — o alvo de toque, o `hover` e o anel de
 * foco são do `ListItem`, não do consumidor. Quem troca o elemento não deve ter
 * de saber (nem copiar) a lista de classes.
 */
export interface ListItemLinkProps {
  className: string;
  href: string;
  children: ReactNode;
}

/** O padrão: uma âncora de verdade. */
function defaultRenderLink({ className, href, children }: ListItemLinkProps) {
  return (
    <a className={className} href={href}>
      {children}
    </a>
  );
}

/**
 * REGRA 24: sem `href` é `button`, com `href` é `a`, e NUNCA os dois.
 *
 * A união discriminada é o que impede o erro na origem: passar `href` e
 * `onClick` juntos não compila. Um `<a>` com `onClick` e sem `href` não é
 * focável por teclado; um `<button>` com `href` ignora o link e não abre em
 * nova aba com Ctrl+clique — os dois defeitos são invisíveis com mouse.
 *
 * ⚠️ **E O `renderLink` EXISTE PORQUE A ÂNCORA CRUA RECARREGA O PWA.**
 *
 * `<a href>` é navegação de DOCUMENTO: num PWA com react-router ela **recarrega
 * o shell inteiro** e perde o estado em memória (a sessão do `AuthProvider`, o
 * clube ativo, o rascunho do editor). A Tarefa 16 registrou o achado e propôs,
 * para a 17, trocar por `onClick` + `useNavigate` — **e essa troca é um defeito
 * por outro**: perde Ctrl+clique e "abrir em nova aba", que é exatamente o que o
 * docblock acima argumenta que a âncora existe para dar. Um `onClick` sem `href`
 * não tem endereço nenhum para o navegador abrir.
 *
 * A saída é INVERSÃO, e ela é obrigatória, não estética: `packages/ui` **não
 * pode** importar `react-router-dom` como dependência de runtime — um design
 * system não conhece o roteador do app, e o barril passaria a arrastá-lo para
 * dentro de todo bundle que importa um `Button`. Então quem sabe do roteador é o
 * consumidor, e ele passa o `Link`:
 *
 * ```tsx
 * <ListItem
 *   href={bookPath(book.id)}
 *   renderLink={({ href, className, children }) => (
 *     <Link className={className} to={href}>
 *       {children}
 *     </Link>
 *   )}
 *   title={book.title}
 * />
 * ```
 *
 * O `Link` do react-router renderiza um `<a href>` de verdade, então Ctrl+clique
 * e "abrir em nova aba" continuam funcionando — e o clique normal é interceptado
 * e vira navegação de rota, sem recarga. Os dois defeitos vão embora juntos.
 */
type ListItemBehaviour =
  | {
      href: string;
      onClick?: never;
      renderLink?: (props: ListItemLinkProps) => ReactNode;
    }
  | {
      href?: undefined;
      onClick: () => void;
      renderLink?: never;
    };

/**
 * A APARÊNCIA, e ela é uma união pela mesma razão que o comportamento acima é:
 * o compilador recusa a combinação que não existe.
 *
 * - `row` (o padrão) tem `subtitle` e não tem `tone`: não existe "dia de hoje"
 *   numa linha de livro;
 * - `sumario` tem `tone` e não tem `subtitle`: a linha do plano é UMA linha, e
 *   um subtítulo ali não tem para onde ir — o canvas não desenha nenhum. Um
 *   `subtitle` aceito e silenciosamente jogado fora seria a pior das duas
 *   opções: o chamador não saberia que perdeu conteúdo.
 *
 * ⚠️ **E A MIGRAÇÃO DA TAREFA 44 NÃO É GRATUITA — medido, e está escrito aqui
 * porque "o canvas não desenha subtítulo" é verdade sobre o canvas e enganoso
 * sobre o código de hoje.**
 *
 * `packages/app/src/pages/book.tsx:599` é a ÚNICA lista que vai receber
 * `variant="sumario"`, e hoje ela passa `subtitle={subtitleFor(item, locale)}`
 * — que é `book.tsx:184-187`, `"8 SET · Cap. 1"`: **data + referência**.
 *
 * No canvas essa informação está no slot `end`, à direita, em monoespaçada
 * (`Livro.dc.html:78`: `8 SET · 9`). Então a 44 não "apaga o subtítulo": ela
 * **move** `subtitleFor` de `subtitle` para `end`, e o compilador vai cobrar
 * isso na cara dela — `subtitle?: never` com `variant: 'sumario'` não compila.
 * É de propósito: um erro de tipo na hora de migrar é melhor que uma data que
 * desaparece da tela em silêncio.
 */
type ListItemLook =
  | { variant?: 'row'; tone?: never; subtitle?: ReactNode }
  | { variant: 'sumario'; tone?: ListItemTone; subtitle?: never };

export type ListItemProps = ListItemBase & ListItemBehaviour & ListItemLook;

export function ListItem({
  className,
  end,
  href,
  onClick,
  renderLink = defaultRenderLink,
  start,
  subtitle,
  title,
  tone,
  variant = 'row',
}: ListItemProps) {
  /*
    REGRA 22: o item INTEIRO é o alvo — um `button`/`a` só, ocupando a linha.

    Um `<div onClick>` com um link pequeno dentro é o padrão que o celular
    castiga: o dedo acerta a linha e nada acontece. E `div` com `onClick` não
    recebe foco nem responde a Enter/Espaço.
  */
  const surface =
    variant === 'sumario'
      ? cx(
          /*
            A LINHA DO SUMÁRIO — `Livro.dc.html:71,139,149`, as três
            variantes: passada, HOJE e futura.

            Sem `rounded-*` e sem cartão: o desenho é caderno encadernado, e o
            que separa uma linha da outra é um filete hairline
            (`border-bottom:1px solid var(--border-soft)`), não sombra.

            ⚠️ O dia de HOJE troca o filete de baixo por um filete DOURADO em
            cima e embaixo, e ganha papel próprio (`--surface-today`). Ele
            também respira mais (`padding:12px 10px` contra `9px 0`), e é por
            isso que ele leva `px-2.5` — a linha de hoje é a única do sumário
            que avança sobre a margem.
          */
          'flex w-full items-center gap-2.5 text-left transition-colors',
          SUMARIO_ITEM_HEIGHT_CLASS,
          tone === 'today'
            ? 'border-y-2 border-gold-line bg-surface-today px-2.5 py-3'
            : 'border-b border-line-soft py-2 hover:bg-surface',
          // A divergência do `--text-faint` está escrita no teste
          // `fades the future with a grey that still passes contrast`.
          tone === 'future' && 'text-subtle',
          FOCUS_RING,
          className,
        )
      : cx(
          'flex w-full items-center gap-3 rounded-control p-3 text-left transition-colors',
          'hover:bg-surface',
          LIST_ITEM_HEIGHT_CLASS,
          FOCUS_RING,
          className,
        );

  const content =
    variant === 'sumario' ? (
      <>
        {/*
          A coluna das marcas tem largura FIXA e existe mesmo vazia
          (`Livro.dc.html:150` tem um `<div style="width:44px">` sem nada
          dentro, no dia futuro — a linha era citada como `:151` até a
          auditoria da Tarefa 41b, e `:151` é o `<span>` do TÍTULO daquele
          dia): sem ela os títulos desalinham entre o dia
          lido e o dia que ainda não chegou, e um sumário desalinhado é o
          defeito que a régua de pontinhos existe para não ter.
        */}
        <span
          className="flex w-11 shrink-0 items-center gap-1"
          data-sumario-marks=""
        >
          {start}
        </span>
        <span className="truncate font-reading text-ui">{title}</span>
        {/*
          O CONDUTOR. Ele é `aria-hidden` porque é decoração: quem ouve a tela
          não precisa de uma fileira de pontos entre o tema do dia e a data.

          `mb-1` levanta os pontos da linha de base do texto (o canvas usa
          `margin-bottom:5px`), e `min-w-2` garante que sobre pelo menos um
          tracinho quando o título é longo.
        */}
        <span
          aria-hidden="true"
          className={cx(
            'mb-1 min-w-2 flex-1 border-b border-dotted',
            tone === 'today'
              ? 'border-gold-line'
              : tone === 'future'
                ? 'border-leader-future'
                : 'border-leader',
          )}
          data-sumario-leader=""
        />
        {end !== undefined ? (
          <span
            className={cx(
              'shrink-0 whitespace-nowrap font-mono text-micro tracking-[0.06em]',
              tone === 'today' && 'uppercase tracking-[0.1em] text-gold-strong',
              // No dia futuro a data HERDA o cinza da linha, como no canvas.
              tone === undefined && 'text-muted',
            )}
          >
            {end}
          </span>
        ) : null}
      </>
    ) : (
      <>
        {start !== undefined ? (
          <span className="flex shrink-0 items-center">{start}</span>
        ) : null}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium text-content">{title}</span>
          {subtitle !== undefined ? (
            <span className="truncate text-sm text-muted">{subtitle}</span>
          ) : null}
        </span>
        {end !== undefined ? (
          <span className="shrink-0 text-sm text-muted">{end}</span>
        ) : null}
      </>
    );

  return (
    <li className="flex">
      {href !== undefined ? (
        renderLink({ className: surface, href, children: content })
      ) : (
        <button className={surface} onClick={onClick} type="button">
          {content}
        </button>
      )}
    </li>
  );
}
