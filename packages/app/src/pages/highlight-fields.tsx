import { HIGHLIGHT_PAGE_MAX, type HighlightResponse } from '@clube/shared';
import { cx, Field, FilterChip } from '@clube/ui';
import { useTranslation } from 'react-i18next';

import { TEXT_INPUT_CLASS } from './form-styles';
import {
  COLOR_LABEL_KEYS,
  ColorSwatch,
  HIGHLIGHT_COLORS,
  type HighlightColor,
} from './highlight-colors';

/**
 * OS CAMPOS DO GRIFO — o que os dois modos do formulário dividem.
 *
 * ⚠️ **A DIVISÃO É FEITA ANTES DE A TELA CRESCER, e é o precedente exato da
 * decisão B da Tarefa 20** (`book-form.tsx` + `plan-editor.tsx`). Medido pelo
 * comando que o docblock de `highlights.tsx` fixa: com tudo num arquivo, o
 * `highlight-form.tsx` daria **618 linhas de código** — mais que o
 * `free-note.tsx` (**565**), que a Tarefa 19 já havia registrado como "o
 * próximo lugar onde a complexidade morde", e mais que qualquer tela do app.
 * Divididos, são **423 + 189**. Entregar a maior tela do projeto com um recado
 * no relatório dizendo "devia ser dividida" é o contrário da lição nº 8 do
 * MVP 1.
 *
 * O que fica no `highlight-form.tsx`: as duas TELAS (registrar e corrigir), o
 * editor `lazy` e os corpos das requisições — ou seja, tudo o que fala com a
 * API. O que mora aqui: os campos, a paleta e o que a tela recusa antes de
 * enviar. Este módulo **não conhece a API nem o roteador**.
 */

/** O que o editor emite para um documento vazio. */
export const EMPTY_DOC: Record<string, unknown> = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const EMPTY_DOC_JSON = JSON.stringify(EMPTY_DOC);

/**
 * ⚠️ **"NÃO HÁ COMENTÁRIO" É UMA PROPRIEDADE DO DOCUMENTO, NÃO DO EVENTO**
 * (regra 16).
 *
 * O editor sempre tem um documento — o parágrafo em branco —, então uma guarda
 * escrita como "o editor emitiu `onChange`?" trataria "abri e apaguei tudo"
 * como um comentário de verdade. O que se grava é `null`, e o backend deriva
 * `commentText: ''` dele (ADR 0001); um documento em branco gravado como
 * comentário faria a coleção renderizar uma área de comentário VAZIA, que é o
 * defeito que a regra 6 proíbe.
 *
 * `null` = não há comentário · objeto = há.
 */
export function commentOf(
  doc: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (doc === undefined) return null;
  return JSON.stringify(doc) === EMPTY_DOC_JSON ? null : doc;
}

/** O que a pessoa digitou — tudo `string`, porque é o que um `<input>` entrega. */
export interface Draft {
  quote: string;
  page: string;
  reference: string;
}

export const EMPTY_DRAFT: Draft = { quote: '', page: '', reference: '' };

export function draftOf(highlight: HighlightResponse): Draft {
  return {
    quote: highlight.quote,
    // `null` é campo em BRANCO, nunca a palavra "null" no `<input>`.
    page: highlight.page === null ? '' : String(highlight.page),
    reference: highlight.reference ?? '',
  };
}

/**
 * REGRA 14 — o que a tela recusa na PÁGINA, antes de enviar.
 *
 * ⚠️ **É a borda repetida de propósito, e a razão é medida.** Na Tarefa 24: o
 * Prisma **trunca** a fração (`page: 45.5` chega ao SQL como `45`) e é o
 * `.int()` da borda que responde 400; fora do int32 ele **lança**, e é o
 * `.max()` que responde 400. Nos dois casos quem escreveu descobriria o
 * problema por uma mensagem do Zod **em inglês**, sem lugar na tela para
 * mostrá-la (§6.2) — e depois de uma ida à rede.
 *
 * O teto vem de `HIGHLIGHT_PAGE_MAX`, de `@clube/shared`: é o contrato da
 * coluna `Int?`, não um número escolhido aqui. Uma segunda constante seria uma
 * segunda dona da mesma regra.
 */
export function isValidPage(value: string): boolean {
  if (!/^\d+$/u.test(value)) return false;
  const page = Number(value);
  return page >= 1 && page <= HIGHLIGHT_PAGE_MAX;
}

/** REGRA 15 — campo opcional em branco é AUSÊNCIA, nem `''`. */
export function textOrAbsent(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * REGRA 13 — OS CINCO CHIPS DA PALETA, com estado ativo ACESSÍVEL.
 *
 * A cor é obrigatória e vem de `HIGHLIGHT_COLORS` (`@clube/shared`): a tela não
 * inventa cor nem grafia — o valor gravado é o hex minúsculo, e o `=` de texto
 * do Postgres é byte-sensível.
 *
 * ⚠️ E o estado ativo **não é só a cor**: é `aria-pressed`, que o leitor de tela
 * anuncia, mais o NOME da cor no rótulo do chip. Cor como único portador de
 * informação é o defeito que ninguém vê olhando a tela.
 */
export function ColorField({
  error,
  onPick,
  value,
}: {
  value: HighlightColor | null;
  error: string | undefined;
  onPick: (color: HighlightColor) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-content">
        {t('pages.highlightForm.fields.color')}
      </span>
      <div
        aria-label={t('pages.highlightForm.fields.colorGroup')}
        className="flex flex-wrap items-center gap-2"
        role="group"
      >
        {/* A ordem é a de `@clube/shared` — a mesma da barra do editor. */}
        {HIGHLIGHT_COLORS.map((candidate) => (
          <FilterChip
            key={candidate}
            label={t(COLOR_LABEL_KEYS[candidate])}
            onPress={() => {
              onPick(candidate);
            }}
            pressed={value === candidate}
            start={<ColorSwatch color={candidate} />}
          />
        ))}
      </div>
      {error !== undefined ? (
        <p className="text-sm text-danger">{error}</p>
      ) : null}
    </div>
  );
}

/** Os campos comuns aos dois modos. */
export function HighlightFields({
  color,
  colorError,
  draft,
  onColor,
  onField,
  pageError,
  quoteError,
}: {
  draft: Draft;
  color: HighlightColor | null;
  quoteError: string | undefined;
  pageError: string | undefined;
  colorError: string | undefined;
  onField: (key: keyof Draft, value: string) => void;
  onColor: (color: HighlightColor) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      {/*
        ⚠️ **`<textarea>` E NÃO `<input>`** (decisão E): é um trecho de livro
        copiado à mão, e duas frases é o caso normal. Não há teto de tamanho no
        domínio — o teto é o `bodyLimit` de 256 KiB da rota.
      */}
      <Field
        error={quoteError}
        hint={t('pages.highlightForm.fields.quoteHint')}
        label={t('pages.highlightForm.fields.quote')}
      >
        {(control) => (
          <textarea
            {...control}
            className={cx(TEXT_INPUT_CLASS, 'min-h-24 py-2')}
            onChange={(event) => onField('quote', event.target.value)}
            rows={3}
            value={draft.quote}
          />
        )}
      </Field>

      <ColorField error={colorError} onPick={onColor} value={color} />

      {/*
        ⚠️ **`type="text"` + `inputMode="numeric"`, NÃO `type="number"`** — o
        precedente medido do mês no `book-form.tsx` (§7.6.1): o algoritmo de
        sanitização do `type="number"` (que o jsdom implementa, como o
        navegador) troca todo valor malformado por `''`, então a regra 14
        viraria "página em branco" e o mutante que apaga o `isValidPage`
        sobreviveria. Fixture que o framework interpreta diferente do runtime
        real é falso verde.
      */}
      <Field
        error={pageError}
        hint={t('pages.highlightForm.fields.pageHint')}
        label={t('pages.highlightForm.fields.page')}
      >
        {(control) => (
          <input
            {...control}
            className={TEXT_INPUT_CLASS}
            inputMode="numeric"
            onChange={(event) => onField('page', event.target.value)}
            type="text"
            value={draft.page}
          />
        )}
      </Field>

      <Field
        hint={t('pages.highlightForm.fields.referenceHint')}
        label={t('pages.highlightForm.fields.reference')}
      >
        {(control) => (
          <input
            {...control}
            className={TEXT_INPUT_CLASS}
            onChange={(event) => onField('reference', event.target.value)}
            type="text"
            value={draft.reference}
          />
        )}
      </Field>
    </>
  );
}

/** O rótulo do comentário, acima do editor (que não é um controle de `Field`). */
export function CommentLabel() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-content">
        {t('pages.highlightForm.fields.comment')}
      </span>
      <span className="text-sm text-subtle">
        {t('pages.highlightForm.fields.commentHint')}
      </span>
    </div>
  );
}

/** Quais campos a tela reprova antes de enviar — regras 12, 13 e 14. */
export interface Problems {
  quote: boolean;
  color: boolean;
  page: boolean;
}

export const NO_PROBLEMS: Problems = {
  quote: false,
  color: false,
  page: false,
};

export function problemsOf(
  draft: Draft,
  color: HighlightColor | null,
): Problems {
  return {
    quote: draft.quote.trim() === '',
    color: color === null,
    page: draft.page.trim() !== '' && !isValidPage(draft.page.trim()),
  };
}

export function hasProblem(problems: Problems): boolean {
  return problems.quote || problems.color || problems.page;
}
