import { cx, Eyebrow, Field, MarginRail, PersonAvatar } from '@clube/ui';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { ActiveClubMe } from '../club/active-club';
import { ACERVO_PAPER_CLASS, authorLabel } from './acervo-rows';
import { TEXT_INPUT_CLASS } from './form-styles';

/**
 * ============================================================================
 * OS CAMPOS DA AVULSA, E A MARGEM QUE MOSTRA NO QUE ELES VÃO DAR
 * ============================================================================
 *
 * ⚠️ **ESTE ARQUIVO NASCEU NA TAREFA 47b, E O MOTIVO É TAMANHO MEDIDO.**
 * O `free-note.tsx` tem **602** linhas pelo contador canônico
 * (`acervo.tsx`, nunca `wc -l`) — é o MAIOR arquivo do app e está **202**
 * acima do teto de 400. A decisão I da 47b proíbe engordá-lo, e a fatia
 * acrescenta uma margem de desktop inteira àquela tela. Então o `NoteFields`
 * saiu de lá e a margem nasceu aqui, em vez de lá.
 *
 * ⚠️ **−44 CANÔNICAS, e não −47: a auditoria remediu e o número deste
 * docblock estava errado.** O bloco que mudou de casa é o do `NoteFields` em
 * `e96204f`, linhas 238–282: são 45 linhas, uma delas em branco, e a linha de
 * comentário acima delas não conta porque o contador descarta comentário de
 * bloco. Num docblock cujo assunto é **tamanho medido** — e cujo vizinho de
 * `acervo-rows.tsx` carrega uma correção de erro de 1 com a frase *"num
 * docblock cujo assunto é medir em vez de estimar, um erro de 1 é o
 * assunto"* — um erro de 3 é o assunto.
 *
 * ⚠️ **E O EFEITO ESTÁ REGISTRADO NOS DOIS LADOS**, que é a lição da Tarefa 46
 * (uma tela encolheu 33 e a vizinha absorveu 208 sem uma linha de comentário
 * em lugar nenhum): o docblock do `free-note.tsx` diz o que saiu, e este diz o
 * que entrou. Os números estão na entrada 47b do `docs/BACKLOG.md`.
 *
 * O assunto é um só, e é o que justifica a vizinhança: **o que a pessoa digita
 * (os campos) e o espelho do que ela digitou (a margem)**. A margem não lê
 * estado nenhum por conta própria — ela recebe os mesmos valores que os campos
 * mostram, e é isso que faz "a prévia reflete o formulário" ser verdade por
 * construção, e não por disciplina.
 */

export interface NoteFieldsProps {
  title: string;
  reference: string;
  titleError: string | undefined;
  onTitle: (value: string) => void;
  onReference: (value: string) => void;
}

/** Título + referência: os dois campos que só a avulsa tem. */
export function NoteFields({
  onReference,
  onTitle,
  reference,
  title,
  titleError,
}: NoteFieldsProps) {
  const { t } = useTranslation();

  return (
    <>
      <Field error={titleError} label={t('pages.freeNote.fields.title')}>
        {(control) => (
          <input
            {...control}
            className={TEXT_INPUT_CLASS}
            onChange={(event) => onTitle(event.target.value)}
            type="text"
            value={title}
          />
        )}
      </Field>
      <Field
        hint={t('pages.freeNote.fields.referenceHint')}
        label={t('pages.freeNote.fields.reference')}
      >
        {(control) => (
          <input
            {...control}
            className={TEXT_INPUT_CLASS}
            onChange={(event) => onReference(event.target.value)}
            type="text"
            value={reference}
          />
        )}
      </Field>
    </>
  );
}

/**
 * UM ATALHO DO EDITOR — o que se faz, e o que aquilo faz.
 *
 * ⚠️ A esquerda vai num `<kbd>`, que é o elemento que o HTML tem para
 * exatamente isto. Nas duas primeiras linhas ela **não** é rótulo traduzido —
 * é o caractere que a pessoa digita, igual em qualquer idioma. Um `<span>`
 * estilizado mostraria a mesma coisa e diria menos.
 *
 * ⚠️ **NA TERCEIRA ELA É PALAVRA, e o canvas a desenha assim**
 * (`NovaAnotacaoDesktop:111`): o gesto de grifar não tem tecla, então a caixa
 * carrega o gesto — "selecionar" —, e gesto é prosa, logo passa pelo catálogo.
 * O `<kbd>` continua certo: o que ele marca é *o que a pessoa faz*, e não
 * necessariamente uma tecla física.
 */
function Shortcut({ press, text }: { press: string; text: string }): ReactNode {
  return (
    <div className="flex items-baseline gap-2.5">
      <kbd className="rounded-callout bg-surface-raised px-1.5 py-0.5 font-mono text-label text-content">
        {press}
      </kbd>
      <span className="text-sm text-muted">{text}</span>
    </div>
  );
}

export interface FreeNoteRailProps {
  t: TFunction;
  /** Quem escreve — é o avatar da linha que vai para o acervo. */
  me: ActiveClubMe | null;
  /** O MESMO valor que o campo mostra. Nunca uma segunda fonte. */
  title: string;
  /*
    ⚠️ **NÃO EXISTE UMA PROP `reference` AQUI, E A AUSÊNCIA É A DECISÃO** —
    ver o docblock abaixo. A margem não pode mostrar a referência porque ela
    **não a recebe**: a promessa é cumprida por construção, e não por
    disciplina de quem escreve o JSX.
  */
}

/**
 * ============================================================================
 * A MARGEM DA AVULSA — "Como vai aparecer no acervo"
 * ============================================================================
 *
 * `NovaAnotacaoDesktop.dc.html:91-113`: coluna de 320px com filete à esquerda,
 * o cabeçalho da prévia, a linha do acervo, o parágrafo explicativo, um
 * hairline, e os atalhos do editor. O aparato de coluna + margem é o
 * `ReadingColumn`/`MarginRail` das fatias 42–46 — **nenhum mecanismo novo**
 * (decisão E da 47b).
 *
 * ⚠️ **A PRÉVIA MOSTRA O QUE O FORMULÁRIO TEM COMO TEXTO, e NÃO o corpo da
 * anotação — isto é medição, não esquecimento.** A linha do acervo
 * (`acervo.tsx`) resume a anotação pelo `plainText`, e o `plainText` é
 * **derivado do documento no backend** (ADR 0001: ele nunca entra no corpo da
 * API). Recalculá-lo aqui criaria um SEGUNDO dono da mesma derivação, dentro
 * do PWA, garantido a divergir do primeiro na primeira nota com lista, citação
 * ou imagem — e a prévia passaria a mentir justamente sobre o que ela promete.
 * O título e a referência são texto de campo: esses a prévia espelha tecla a
 * tecla.
 *
 * ⚠️⚠️ **O AUTOR NÃO CABIA NESSA RAZÃO, e a entrega o deixou de fora mesmo
 * assim — a auditoria mediu.** `authorLabel` é `t()` puro, sem derivação
 * nenhuma; o argumento do ADR 0001 alcança o RESUMO, não quem assina. E o
 * acervo mostra o autor SEMPRE: em `acervo.tsx` o subtítulo é
 * `excerpt === '' ? author : …`, ou seja, **sem corpo ele é só o autor** —
 * que é exatamente o caso desta prévia. O canvas concorda dos dois lados
 * (`Acervo.dc.html:103` e `NovaAnotacaoDesktop:98`). Corrigido: o autor
 * entrou, e a prévia do grifo já o tinha.
 *
 * ⚠️⚠️ **A REFERÊNCIA NÃO ENTRA — DECISÃO DO DONO (2026-09-24), e ela é o que
 * torna a promessa literalmente verdadeira.**
 *
 * A entrega da 47b desenhava `Avulsa · p. 112`, contra o canvas
 * (`NovaAnotacaoDesktop:99` desenha "Avulsa · vários capítulos"). Medido na
 * auditoria: **o acervo NUNCA mostra a referência de uma anotação** —
 * `reference` aparece **zero** vezes em `acervo.tsx` e em
 * `acervo-entries.ts`. Uma margem que imprime *"Como vai aparecer no acervo"*
 * e desenha uma linha que o acervo não desenha em lugar nenhum é uma promessa
 * falsa, e promessa falsa é pior que informação a menos.
 *
 * ⚠️ **A ALTERNATIVA CONSIDERADA E RECUSADA: o acervo passar a MOSTRAR a
 * referência.** Ela fecharia a diferença pelo outro lado e é defensável de
 * desenho — mas mexeria numa tela já entregue e auditada (a 46), e custaria
 * bytes num orçamento com ~5,5 KB de folga e a Tarefa 48 ainda por vir.
 * Recusada pelo dono, e registrada aqui para ninguém refazer a conta.
 *
 * ⚠️ **A referência não sumiu do produto — sumiu da PRÉVIA.** Ela continua no
 * formulário, continua sendo salva e continua aparecendo na tela de leitura
 * da anotação (`free-note.tsx`). O que ela não faz é prometer um lugar onde
 * não vai aparecer. E a ausência **tem acusador dos dois lados**:
 * `free-note.test.tsx › ⚠️ does NOT show the reference` (digitada) e
 * `› ⚠️ hides the LOADED reference too` (carregada do servidor, na rota de
 * correção) — sem eles a próxima fatia a reintroduz e ninguém vê.
 *
 * ⚠️ **A OUTRA DIVERGÊNCIA CONTINUA, e é declarada: O CARD.** No acervo a
 * anotação é um `ListItem` **sem card** (um link com filete embaixo); aqui
 * ela vem dentro do papel do acervo. Quem manda é o canvas
 * (`NovaAnotacaoDesktop:94`), e o papel é a MOLDURA da prévia — o conteúdo
 * dentro dele é a linha do acervo, parte por parte.
 *
 * ⚠️ **ELA SOME NO CELULAR, e o par está guardado dos dois lados.** O canvas
 * de celular (`NovaAnotacao.dc.html`) não desenha prévia nenhuma: abaixo de
 * 1120px a tela é o formulário, e uma segunda cópia do título logo abaixo do
 * campo que o contém seria ruído. É a mesma assimetria que o painel de refino
 * do acervo assumiu na Tarefa 46.
 *
 * ⚠️ **AS PALAVRAS "Avulsa" E O AVATAR SÃO OS DO ACERVO, de propósito.** A
 * prévia promete uma coisa — que aquilo é o que o clube vai ver —, e usar um
 * vocabulário próprio para o mesmo objeto quebraria a promessa sem quebrar
 * teste nenhum. Daí `pages.acervo.kind.free` aqui, e não uma chave nova.
 *
 * ⚠️ **E AS DUAS PROPRIEDADES QUE ESTE PARÁGRAFO NOMEIA EM MAIÚSCULAS ERAM AS
 * DUAS QUE NINGUÉM GUARDAVA — a ironia é medida.** Dois mutantes de uma linha
 * apagavam exatamente o que está escrito aqui com **999 testes verdes**: o
 * avatar passando a mostrar outra pessoa (ou ninguém), e a palavra "Avulsa"
 * sumindo **quando há referência**. Os acusadores de hoje são
 * `free-note.test.tsx › ⚠️ signs the preview with ME` (a inicial comparada
 * com `me.name`) e `› says WHERE the note lands` (a palavra conferida COM a
 * referência preenchida, e não só sem ela).
 */
export function FreeNoteRail({ me, t, title }: FreeNoteRailProps): ReactNode {
  const kind = t('pages.acervo.kind.free');

  return (
    <MarginRail className="hidden gap-4 pt-4 min-[1120px]:flex">
      <Eyebrow>{t('pages.freeNote.preview.heading')}</Eyebrow>
      <div
        className={cx(ACERVO_PAPER_CLASS, 'gap-3')}
        data-testid="note-preview"
      >
        <PersonAvatar id={me?.id ?? ''} name={me?.name ?? null} size="sm" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-reading font-medium text-content">{title}</span>
          {/*
            ⚠️ **QUEM ESCREVEU — e ele entrou na RODADA DE CORREÇÃO, por
            medição.** A entrega não mostrava autor nenhum, e declarou a
            ausência pelo ADR 0001. Medido: a razão do ADR vale para o RESUMO
            do corpo, não para o autor — `authorLabel` é `t()` puro, sem
            derivação nenhuma, e a prévia do grifo já o usava.

            E o acervo mostra o autor SEMPRE: em `acervo.tsx` o subtítulo é
            `excerpt === '' ? author : …`, ou seja, **sem corpo o subtítulo é
            só o autor** — que é exatamente o caso desta prévia. `text-sm
            text-muted` é a classe do `subtitle` do `ListItem`, o mesmo nó.
          */}
          <span className="text-sm text-muted">
            {authorLabel(t, true, me?.name ?? null)}
          </span>
          {/*
            ⚠️ **SÓ A PALAVRA DO ACERVO — o canvas põe "Avulsa · vários
            capítulos" (`NovaAnotacaoDesktop:99`) e o ACERVO põe só "Avulsa"
            (`Acervo.dc.html:105`, o rótulo à direita da linha).** Entre o
            artboard do formulário e o que a margem promete por escrito, ganha
            o que ela promete. Ver o docblock acima.
          */}
          <Eyebrow>{kind}</Eyebrow>
        </div>
      </div>
      <p className="text-sm text-muted">{t('pages.freeNote.preview.about')}</p>
      <div aria-hidden="true" className="h-px bg-line-soft" />
      <div className="flex flex-col gap-2.5">
        <Eyebrow>{t('pages.freeNote.shortcuts.heading')}</Eyebrow>
        <Shortcut press="/" text={t('pages.freeNote.shortcuts.block')} />
        <Shortcut press=">" text={t('pages.freeNote.shortcuts.quote')} />
        {/*
          ⚠️ **A TERCEIRA LINHA ENTROU NA RODADA DE CORREÇÃO (decisão do dono,
          2026-09-24), e a razão da ausência CAIU POR DECISÃO, não por erro de
          medição.** A 47b a recusou porque naquela tela o gesto não existia —
          a barra de canetas não era passada ao editor, e escrever "grifar com
          a caneta" numa tela sem caneta seria a tela mentindo. O dono mandou
          ligar a barra (`free-note.tsx`, `penBar="fixed"`), o gesto passou a
          existir, e a linha deixou de mentir.
        */}
        <Shortcut
          press={t('pages.freeNote.shortcuts.select')}
          text={t('pages.freeNote.shortcuts.highlight')}
        />
      </div>
    </MarginRail>
  );
}
