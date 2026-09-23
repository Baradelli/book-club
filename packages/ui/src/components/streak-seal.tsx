import { Bookmark } from 'lucide-react';

import { cx } from '../cx';

/**
 * ⚠️ MAPAS LITERAIS (decisão C): `` `border-${tone}-line` `` compila e pinta
 * nada. As duas pinturas do canvas, medidas em `Inicio.dc.html:97` (viva) e
 * `:102` (apagada).
 */
const SEAL_CLASS = {
  lit: 'border-gold-line bg-gold-soft',
  quiet: 'border-line-soft bg-surface',
} as const;

/**
 * ⚠️ `stroke-*` E NÃO `text-*`, e isso é ESTRUTURAL, não estética.
 *
 * `--gold` (`#946d2c`) dá 4,16 / 4,31 / **3,97** contra as três superfícies no
 * tema claro. Como TEXTO ele reprova (piso 4,5:1); como TRAÇO DE ÍCONE ele
 * passa, porque o piso de componente não textual é 3:1 — e é exatamente assim
 * que o canvas o usa aqui (`Inicio.dc.html:98`: `stroke="var(--gold)"`).
 *
 * Uma varredura de código-fonte não consegue adivinhar se um `text-gold` está
 * num `<span>` de texto ou num `<svg>`. Então a distinção virou estrutural:
 * quem pinta TRAÇO usa `stroke-*` (que só afeta SVG), e `text-gold` fica livre
 * para ser proibido como texto **sem proibir o token**. É isso que torna
 * possível a guarda de primeiro uso em
 * `app/src/__tests__/theme-tokens.test.ts › refuses the FIRST USE of text-gold`.
 *
 * O `stroke` do CSS vence o atributo `stroke="currentColor"` que o lucide
 * escreve no `<svg>`: propriedade CSS ganha de atributo de apresentação.
 */
const GLYPH_CLASS = {
  lit: 'stroke-gold',
  quiet: 'stroke-subtle',
} as const;

const COUNT_CLASS = {
  /*
    `--gold-strong` é o que o canvas usa aqui (`Inicio.dc.html:99`), e é
    também o único dourado que carrega texto com contraste: `--gold` dá
    4,16:1 contra `--bg` no tema claro, contra um piso de 4,5:1. A mesma conta
    está no `Eyebrow` e no `theme.css`.
  */
  lit: 'text-gold-strong',
  quiet: 'text-muted',
} as const;

export interface StreakSealProps {
  /**
   * `ClubStreak.streak` — quantos dias seguidos.
   *
   * ⚠️ **Zero é um estado válido, e o selo NÃO desenha o número nele.** "0" ao
   * lado de um convite ("Comece a sua sequência hoje") é a única parte da
   * frase que fala de dívida, e o §1 do `docs/plano-clube-do-livro.md` é
   * anti-culpa. Quem fica é a frase. O `count` continua sendo quem escolhe o
   * tom PADRÃO, e quem o chamador passa em `label` continua sendo tudo o que
   * se lê quando ele é zero.
   */
  count: number;
  /**
   * ⚠️⚠️ **QUAL SELO ACENDE — e o padrão NÃO é a regra que a home usa.**
   *
   * O canvas acende o selo **de quem está olhando** e apaga o dos outros,
   * mesmo quando os outros têm corrente viva: `InicioDesktop.dc.html:113-116`
   * desenha o Bruno com **4 dias** na pílula APAGADA
   * (`border:1px solid #e3ddc9`, `background:#f9f5ec`), e `Inicio.dc.html:102-105`
   * faz o mesmo no celular. O dourado é PERTENCIMENTO ("esta linha é você"),
   * nunca prêmio — se ele chegasse com a corrente e sumisse com ela, seria a
   * moldura de PERDA que o glifo deste selo já foi trocado para não ser.
   *
   * ⚠️ **Por que opcional, e por que o padrão é o que é.** `packages/ui` não
   * sabe quem é o usuário — só a tela sabe, e é ela que passa
   * `isMine ? 'lit' : 'quiet'`. O padrão (`count > 0`) é o desenho que este
   * componente já tinha, e ele fica **exatamente** onde estava para que a
   * prop seja acréscimo e não quebra: nenhum chamador muda de comportamento
   * por causa dela.
   *
   * ⚠️ **Quem escrever um SEGUNDO consumidor: passe `tone`.** Herdar o padrão
   * reproduz o defeito que a auditoria da Tarefa 45 achou — dois selos
   * dourados num clube em que as duas pessoas leram, e a distinção do artboard
   * sumindo sem nenhum teste ficar vermelho.
   */
  tone?: 'lit' | 'quiet';
  /**
   * O resto da frase, JÁ TRADUZIDO pela tela — "dias seguidos · Você".
   *
   * ⚠️ Inclusive o plural: "dia" × "dias" é regra de catálogo (o par de
   * plural de `pages.home.streak.days`, Tarefa 40), e `packages/ui` não
   * conhece catálogo (decisão A).
   */
  label: string;
  className?: string;
}

/**
 * O SELO DA CORRENTE DE LEITURA — o "foguinho" do
 * `docs/adr/0010-corrente-de-leitura-visivel.md`.
 *
 * ⚠️ **ELE CONTRARIA O DESENHO DO FEED DE PROPÓSITO, e o ADR registra por
 * quê.** O feed é uma frase por linha, deliberadamente sem coluna de pessoa e
 * sem número, porque uma coluna de número convida o olho a varrê-la e contar
 * quem fez mais. O selo é exatamente essa coluna. Foi escolha do dono, feita
 * depois de a objeção ser levantada e medida.
 *
 * ⚠️ **A COR NUNCA É O ÚNICO PORTADOR** (decisão F): o selo diz o NÚMERO e o
 * NOME, em texto de verdade. Uma pílula dourada sozinha diria "aconteceu algo
 * bom" e nada mais.
 *
 * ⚠️ **E O ZERO NÃO É COBRANÇA.** O selo apagado é a MESMA pílula em cinza —
 * nada de vermelho, nada de badge de pendência (`plano` §1). É por isso que o
 * estado quieto usa `--border-soft`/`--surface`, que é o papel comum do app.
 *
 * ============================================================================
 * ⚠️ O GLIFO É UM MARCADOR DE LIVRO, NÃO UMA CHAMA — e há dois motivos
 * ============================================================================
 *
 * **(1) Fidelidade.** O canvas desenha um marcador (`Inicio.dc.html:98` e
 * `InicioDesktop.dc.html:109`: o path `M6 3h12v18l-6-4.5L6 21z`, a ponta em V
 * de um marcador de página — não a língua de uma chama).
 *
 * **(2) O §1 do `docs/plano-clube-do-livro.md`, que é o motivo mais forte.** A
 * chama é a metáfora do Duolingo, e ela é enquadrada na **perda**: o fogo que
 * "apaga". O marcador é **presença** — ele diz onde você parou. Num app cujo
 * primeiro princípio é anti-culpa, o ícone é a parte do selo que fala mais
 * rápido que o número, e ele não pode falar de dívida.
 *
 * ⚠️ **A primeira entrega desta fatia usou `Flame`**, porque a regra 8 da spec
 * da 41b o nomeava. **A spec estava errada**, e o dono corrigiu na rodada de
 * auditoria (2026-09-21). O ADR 0010 **não é reaberto**: ele nomeia o
 * MECANISMO (a corrente visível, com "foguinho" de apelido), não o glifo.
 *
 * ⚠️ ~~`pages/streak-bar.tsx` ainda importa `Flame` — **quem troca lá é a
 * Tarefa 45**~~ **A TAREFA 45 TROCOU.** Medido na auditoria dela:
 * `grep -rn "Flame" packages/{app,ui}/src/` devolve **só prosa** (este
 * parágrafo e os docblocks que contam a história). A frase ficou riscada em
 * vez de apagada porque ela explica POR QUE o glifo mudou; deixá-la no
 * presente é a lição do `dayRange` do `CLAUDE.md` — uma instrução que aponta
 * para um estado que não existe mais faz o próximo agente procurar, não achar
 * e inventar.
 */
export function StreakSeal({ className, count, label, tone }: StreakSealProps) {
  /*
    ⚠️ **O PADRÃO, E ELE É O DESENHO ANTIGO DE PROPÓSITO.** Sem `tone` o selo
    acende por ter corrente, que é o que este componente fazia desde a Tarefa
    41b — assim a prop é acréscimo e nenhum chamador muda de comportamento.
    Quem sabe de quem é a linha é a TELA, e ela passa `tone` (ver a prop).
  */
  const paint = tone ?? (count > 0 ? 'lit' : 'quiet');

  return (
    <span
      className={cx(
        /*
          `Inicio.dc.html:97`: `border-radius:999px`, `padding:6px 12px`,
          `gap:7px`, filete de 1px. Nada de sombra — o desenho é caderno.

          `gap-1.75` é 7px e `px-3 py-1.5` é 12×6px, pela conversão
          `SPACING_STEP_PX` de `styles.ts`.
        */
        'inline-flex items-center gap-1.75 rounded-full border px-3 py-1.5',
        SEAL_CLASS[paint],
        className,
      )}
    >
      {/*
        13px no canvas (`Inicio.dc.html:98`). `aria-hidden` porque o número e o
        rótulo ao lado já dizem a frase inteira — um ícone anunciado no meio
        dela ("marcador, 11, dias seguidos") atrapalha quem ouve.
      */}
      <Bookmark
        aria-hidden="true"
        className={cx('size-[13px] shrink-0', GLYPH_CLASS[paint])}
        focusable="false"
      />
      {/*
        ⚠️ O corpo de 12px do canvas não existe na escala de sete degraus da
        Tarefa 39 — `text-label` é 11px, e é o degrau mais próximo para baixo.
        É o mesmo arredondamento de corpo que a nota nº 7 da Tarefa 41a já
        listou (12px, 13px, 14,5px e 11,5px) e deixou aberto para o dono.

        ⚠️⚠️ **O NÚMERO SÓ EXISTE QUANDO EXISTE, e o espaço ao lado dele é um
        NÓ DE TEXTO DE VERDADE.** São as duas correções da auditoria da Tarefa
        45:

        **(1) o zero não se desenha.** "0 Comece a sua sequência hoje · Você"
        põe um placar na frente de um convite, e o §1 do plano é anti-culpa.

        **(2) o `{' '}` entre os dois `<span>`.** Sem ele o `textContent` era
        `"12dias seguidos"` — colado —, e o docblock da `StreakBar` afirmava
        que quem ouve a tela lia a frase inteira. Não lia: o `gap-1.75` é CSS
        e não chega à árvore de acessibilidade. Num contêiner `flex` um item
        anônimo só de espaço **não é desenhado**, então a tela não mudou um
        pixel e a frase passou a ser a frase.
      */}
      {count > 0 ? (
        <>
          <span
            className={cx(
              'font-mono text-label font-medium',
              COUNT_CLASS[paint],
            )}
          >
            {count}
          </span>{' '}
        </>
      ) : null}
      <span className="text-label text-muted">{label}</span>
    </span>
  );
}
