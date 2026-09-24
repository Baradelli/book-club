import type { ReactNode } from 'react';

import { cx } from '../cx';

/**
 * ============================================================================
 * O CORTE É ≥1120px, E ELE MORA AQUI — UMA VEZ SÓ
 * ============================================================================
 *
 * Decisão fechada do MVP 3.5: acima de 1120px a tela se parte em coluna de
 * leitura de 680px e margem de 320px, com 56px de vão e 92px de recuo lateral;
 * abaixo disso é uma coluna com 20px de padding e a margem descendo para o
 * fluxo.
 *
 * ⚠️ **É MEDIA QUERY E SÓ** — nenhuma ramificação por dispositivo, nenhum
 * `userAgent`, nenhum `isMobile` (decisão G). Uma ramificação em JavaScript
 * quebra no redimensionamento, mente no tablet e pinta o layout errado no
 * primeiro frame; e nada disso aparece num teste de unidade, que é o que a
 * torna tentadora.
 *
 * `min-[1120px]:` é variante arbitrária do Tailwind, e não um breakpoint
 * nomeado, porque o número é do CANVAS e não da escala do Tailwind (o `xl`
 * dele é 1280px).
 *
 * ⚠️ E o prefixo é repetido por ESCRITO em cada classe, em vez de sair de uma
 * constante concatenada: juntar o prefixo ao nome em tempo de execução compila
 * em TypeScript e pinta NADA — o Tailwind emite o CSS do que encontra escrito
 * no fonte (decisão C). A repetição é o preço, e ela é barata perto de uma margem sem
 * filete que nenhum teste de unidade veria.
 */

export interface ReadingColumnProps {
  /** O texto: o que o leitor veio ler. */
  children: ReactNode;
  /**
   * O aparato de margem, normalmente um `<MarginRail>`.
   *
   * Prop e não `children` de uma segunda posição porque é o que garante a
   * ORDEM: a margem vem depois da coluna no DOM, sempre (regra 6).
   */
  rail?: ReactNode;
  className?: string;
}

/**
 * A EDIÇÃO CRÍTICA — a coluna de leitura e, ao lado dela, a margem.
 *
 * As medidas vêm dos cinco artboards de 1280px (`DiaDesktop.dc.html:46,48,96`,
 * `InicioDesktop.dc.html:35,37,104`, `LivroDesktop.dc.html:42,44,180`,
 * `NovaAnotacaoDesktop.dc.html:45,47,91`, `NovoGrifoDesktop.dc.html:45,47,104`).
 *
 * **Onde os CINCO concordam** — e é isto que o componente entrega: vão de
 * `56px` entre as colunas, recuo lateral de `92px`, coluna de `680px`, margem
 * de `320px` com `border-left:1px solid var(--border)` e `padding-left:40px`.
 *
 * ⚠️ **ONDE ELES NÃO CONCORDAM — e a primeira entrega desta fatia dizia que
 * sim.** O docblock afirmava "os cinco concordam … `padding:40px 92px 0`", e
 * **são quatro**: `InicioDesktop.dc.html:35` usa **`padding: 48px 92px 0 92px`**.
 * O 48 já estava medido, na tabela de `reading-column.test.tsx` — eu escrevi o
 * número certo no teste e o errado aqui, que é o arquivo que o próximo agente
 * lê primeiro (classe nº 6 da lista da Tarefa 41a, somada à nº 4).
 *
 * ~~**Decisão:** fica o recuo de topo de 40px (quatro dos cinco), e a HOME
 * compensa com 48px acima de 1120px pelo `className`. … a compensação
 * **funciona, medido**: no CSS emitido os 40px saíam no byte 19901 e os 48px no
 * 19962 … por isso a compensação da home é da Tarefa 42 e tem de ser conferida
 * na tela.~~
 *
 * ⚠️ **A COMPENSAÇÃO NUNCA EXISTIU, e este parágrafo a descrevia como se
 * existisse — corrigido na auditoria da Tarefa 42 (2026-09-21).** Medido:
 * procurar o recuo de topo de 48px em `packages/{app,ui}/src/` devolve **só
 * prosa** (este docblock e o do teste vizinho), e o `ScreenProps` do app **não tem `className`** — a
 * compensação não era sequer possível sem mexer no `Screen`. A Tarefa 42
 * passou e a home ficou em 40px.
 *
 * **Decisão, agora com o custo declarado: fica o recuo de topo de 40px em TODAS as
 * telas, inclusive a home**, e os 8px de `InicioDesktop.dc.html:35` são uma
 * **divergência declarada**, não uma tarefa pendente. As duas saídas foram
 * pesadas e as duas custam mais que 8px num artboard:
 *
 * - um `className` no `Screen` é uma escotilha genérica — ela deixa qualquer
 *   tela sobrescrever qualquer classe do cromo, que é o oposto do que o
 *   `Screen` existe para garantir;
 * - uma prop de recuo para **um** chamador é o "peso" que a decisão B da 41a
 *   proíbe com essas palavras.
 *
 * ⚠️ E a home é a tela da **Tarefa 45**: se o dono quiser os 48px, é lá que
 * eles entram, junto com o resto do redesenho dela — não numa escotilha aberta
 * seis fatias antes. O que **não** pode continuar é esta frase dizendo que já
 * está feito: uma afirmação falsa em arquivo permanente custa mais que a
 * ausência dela (a lição do `dayRange` do `CLAUDE.md`).
 *
 * ⚠️ **O RITMO VERTICAL NÃO É DO COMPONENTE — nem o da coluna, nem o da
 * margem.** Na coluna os cinco artboards usam quatro valores (24px no dia,
 * 26px no grifo, 28px no livro, 34px na home); na margem, três (18 · 26 · 26 ·
 * 16 · 16). É ritmo de CONTEÚDO, e quem o define é a tela.
 *
 * ⚠️ A primeira entrega fixava `gap-6` (24px) na margem — **um número que não
 * existe em artboard nenhum** — enquanto este mesmo docblock argumentava que o
 * da coluna não era do componente. Dois pesos, uma medida; corrigido na
 * auditoria, e o acusador é
 * `reading-column.test.tsx › leaves the RAIL rhythm to the screen`.
 *
 * ⚠️ E `ReadingColumn` e `MarginRail` moram no MESMO arquivo porque um não faz
 * sentido sem o outro: o filete que os separa é propriedade da dupla — ele
 * pertence à margem, mas só existe quando há uma coluna à esquerda dele, e é
 * por isso que ele some junto com o corte.
 */
export function ReadingColumn({
  children,
  className,
  rail,
}: ReadingColumnProps) {
  return (
    <div
      className={cx(
        /*
          Celular: uma coluna, 20px de recuo (`Livro.dc.html:41`,
          `Dia.dc.html:41`: `padding:…20px…`). Sem `gap` vertical: o canvas não
          desenha nenhuma tela de celular com a margem descida, então não há
          número para copiar — quem der o ar entre o texto e o aparato é a
          tela, com o número dela.

          Desktop: LINHA, `gap:56px` e `padding-inline:92px`, que os CINCO
          artboards têm iguais; o recuo de topo de 40px é de quatro deles — veja
          o docblock. `justify-center` porque a soma
          680+56+320 = 1056px é menor que a janela e o conjunto fica centrado.
        */
        'flex w-full flex-col px-5',
        'min-[1120px]:flex-row min-[1120px]:justify-center min-[1120px]:gap-14 min-[1120px]:px-23 min-[1120px]:pt-10',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col min-[1120px]:w-[680px] min-[1120px]:shrink-0">
        {children}
      </div>
      {rail}
    </div>
  );
}

export interface MarginRailProps {
  children: ReactNode;
  /**
   * Nome acessível, JÁ TRADUZIDO pela tela.
   *
   * ⚠️ Sem ele o `<aside>` dentro de um `<main>` **não é** uma região que o
   * leitor de tela lista — o elemento é o mesmo, e é o NOME que decide. Com
   * nome, quem ouve a tela consegue pular o aparato inteiro de uma vez, que é
   * a razão de a margem ser margem.
   *
   * ⚠️ **E POR QUE ELE É OPCIONAL AQUI E OBRIGATÓRIO NO `PresenceMark`** — a
   * auditoria da Tarefa 41b perguntou, e a resposta é o que acontece quando
   * falta:
   *
   * - sem nome, o `PresenceMark` vira **uma letra sem significado**: "A,
   *   imagem". A informação (leu? escreveu?) some, e não há nada perto dela no
   *   DOM que a reponha. Por isso o compilador cobra;
   * - sem nome, a margem continua **inteiramente legível**: o que ela tem
   *   dentro é texto de verdade, com os rótulos de seção da própria tela. O
   *   que se perde é o atalho de pular a região — comodidade, não informação.
   *
   * Obrigar aqui custaria uma tradução por uso e uma região nomeada em telas
   * onde a margem tem um bloco só (a `NovoGrifoDesktop`, por exemplo), o que
   * ENCHE a lista de regiões do leitor de tela em vez de encurtá-la. Quando a
   * margem tem aparato de verdade — grifos, marcas, corrente —, a tela nomeia.
   */
  'aria-label'?: string;
  className?: string;
}

/**
 * A MARGEM: o aparato ao lado do texto — o que o clube escreveu, os grifos
 * desta leitura, a corrente, as marcas.
 *
 * ⚠️ Ele vem **depois** da coluna na ordem do DOM (regra 6), e essa é a única
 * ordem em que as duas larguras concordam: no desktop ele está à direita, no
 * celular ele desce para baixo do texto — nos dois casos a ordem de teclado
 * segue a ordem visual. Pô-lo antes faria quem navega por teclado atravessar o
 * aparato inteiro para chegar ao texto, no celular, todo dia.
 *
 * O filete de 1px e o recuo de 40px só existem a partir de 1120px: abaixo do
 * corte a margem ocupa a largura da tela, e um `border-left` ali seria um
 * traço vertical solto à esquerda da página.
 */
export function MarginRail({ children, className, ...rest }: MarginRailProps) {
  return (
    <aside
      className={cx(
        /*
          ⚠️ SEM `gap`. Medido nos cinco artboards: 18px
          (`InicioDesktop.dc.html:104`), 26px (`DiaDesktop.dc.html:96`), 26px
          (`LivroDesktop.dc.html:180`), 16px (`NovaAnotacaoDesktop.dc.html:91`)
          e 16px (`NovoGrifoDesktop.dc.html:104`) — três valores, e o `gap-6`
          (24px) da primeira entrega não era nenhum deles. Ritmo de conteúdo é
          da tela, aqui pelo mesmo argumento que já valia para a coluna.
        */
        'flex flex-col',
        'min-[1120px]:w-80 min-[1120px]:shrink-0 min-[1120px]:border-l min-[1120px]:border-line min-[1120px]:pl-10',
        className,
      )}
      {...rest}
    >
      {children}
    </aside>
  );
}
