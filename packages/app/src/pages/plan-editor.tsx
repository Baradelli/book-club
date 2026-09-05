import {
  type CalendarDay,
  findPlanDateProblem,
  isCalendarDay,
  type PlanItemResponse,
} from '@clube/shared';
import { Button } from '@clube/ui';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { messageFor } from './form-errors';
import { TEXT_INPUT_CLASS } from './form-styles';

/**
 * O EDITOR DE PLANO — as linhas do plano de leitura, num arquivo próprio.
 *
 * ⚠️ **A DECISÃO B DA TAREFA 20 É ESTE ARQUIVO, e ela é requisito, não
 * gosto.** O `free-note.tsx` chegou a **580 linhas de código** acumulando modos
 * numa tela só, e a Tarefa 19 registrou isso como o próximo lugar onde a
 * complexidade morde. Aqui a divisão foi feita ANTES de a tela crescer: o
 * `book-form.tsx` cuida do LIVRO e de quando salvar; este arquivo cuida das
 * LINHAS — gerar, acrescentar, remover, e dizer qual delas está errada.
 *
 * A fronteira entre os dois é a lista de `PlanRow` e o `PlanProblem`: o
 * formulário é o dono do estado (é ele que salva), e este componente é
 * controlado. Nenhuma requisição sai daqui.
 *
 * ⚠️ **E A REGRA DE SEQUÊNCIA NÃO É REESCRITA AQUI** (regra 10): quem responde
 * "esta data repete" e "esta data volta no tempo" é o `findPlanDateProblem` de
 * `@clube/shared`, o MESMO que o `.superRefine()` do `planItemDraftListSchema`
 * usa na borda e que o `normalizePlanDrafts` usa no domínio. Uma comparação
 * nova aqui divergiria das outras duas na primeira correção.
 */

/**
 * Uma linha do plano como o admin a digita.
 *
 * ⚠️ **O `key` NÃO é o `id` do dia, e não é decoração.** As linhas são
 * reordenadas e removidas pelo meio, e uma `key` de índice faria o React
 * reaproveitar o `<input>` da linha errada — o tema digitado na linha 3
 * apareceria na 2 depois de uma remoção. E não pode ser o `id` do servidor
 * porque a linha recém-criada não tem um: ela ainda não existe lá.
 *
 * `reference` é `string` e não `string | null`: aqui é o valor de um
 * `<input>`, e a tradução "vazio → ausente" acontece uma vez só, na montagem
 * do corpo (`book-form.tsx`).
 */
export interface PlanRow {
  key: string;
  date: string;
  title: string;
  reference: string;
}

/** Qual linha está errada, e qual frase do catálogo explica. */
export interface PlanProblem {
  index: number;
  /**
   * O campo que recebe o `aria-invalid`.
   *
   * `reference` entra porque o `details[].path` da API pode apontar para ela
   * (`planItems.7.reference`): marcar a data quando o servidor reclamou da
   * referência mandaria o admin corrigir o campo errado.
   */
  field: 'date' | 'title' | 'reference';
  /** Chave de catálogo. NUNCA texto da API (§6.2). */
  key: string;
}

/**
 * Contador de módulo, e não `crypto.randomUUID()`: a chave só precisa ser
 * única DENTRO desta lista, e um contador é determinístico — o mesmo roteiro
 * de teste produz as mesmas chaves em qualquer máquina.
 */
let nextKey = 0;

function freshKey(): string {
  nextKey += 1;
  return `row-${nextKey}`;
}

export function planRow(date: string, title = '', reference = ''): PlanRow {
  return { key: freshKey(), date, title, reference };
}

/** REGRA 14: o plano que veio do `GET /books/:bookId` vira linhas. */
export function planRowsFrom(
  items: readonly PlanItemResponse[],
): readonly PlanRow[] {
  return items.map((item) =>
    planRow(item.date, item.title, item.reference ?? ''),
  );
}

/**
 * `"2026-09-30"` + 1 → `"2026-10-01"`.
 *
 * ⚠️ **TUDO EM UTC, e é o mesmo cuidado do `formatPlanDay` da tela do livro**:
 * um dia de calendário não tem fuso, e somar dias com os getters LOCAIS
 * devolveria o dia anterior em qualquer fuso negativo — o bug de um dia que o
 * `localDay` existe para não cometer. `setUTCDate` normaliza sozinho a virada
 * de mês e de ano, inclusive 29 de fevereiro.
 *
 * Luxon fica no backend (`CLAUDE.md`): o PWA não embarca uma biblioteca de
 * datas para somar um dia.
 */
function addDays(date: CalendarDay, days: number): CalendarDay {
  const moment = new Date(`${date}T00:00:00.000Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

/**
 * REGRA 7 e DECISÃO C — O GERADOR.
 *
 * N linhas com as datas já preenchidas e o TEMA VAZIO: a data é mecânica, o
 * tema é conteúdo. É a diferença entre a tela ser usada e o dono voltar para o
 * Swagger para colar trinta objetos.
 */
export function generatePlanRows(
  startDate: string,
  count: number,
): readonly PlanRow[] {
  if (!isCalendarDay(startDate) || count < 1) return [];
  return Array.from({ length: count }, (_unused, index) =>
    planRow(addDays(startDate, index)),
  );
}

/**
 * REGRAS 9 e 10 — O PRIMEIRO problema do plano, ou `null`.
 *
 * A PRECEDÊNCIA é a mesma da borda, e isso importa: o formato de cada data é
 * conferido antes da sequência, porque a comparação lexicográfica do
 * `findPlanDateProblem` **pressupõe** `"YYYY-MM-DD"` canônico. O tema vazio
 * entra junto com o formato, item a item, que é a ordem em que o Zod avalia os
 * itens antes do `.superRefine()`.
 *
 * Um problema por vez, como no backend: apontar uma linha e resolvê-la é o que
 * alguém consegue fazer num celular; trinta marcas vermelhas de uma vez não é.
 */
export function findPlanProblem(rows: readonly PlanRow[]): PlanProblem | null {
  for (const [index, row] of rows.entries()) {
    if (row.date.trim() === '') {
      return { index, field: 'date', key: 'pages.bookForm.plan.dateRequired' };
    }
    if (!isCalendarDay(row.date)) {
      return { index, field: 'date', key: 'pages.bookForm.plan.dateInvalid' };
    }
    if (row.title.trim() === '') {
      return {
        index,
        field: 'title',
        key: 'pages.bookForm.plan.titleRequired',
      };
    }
  }

  const problem = findPlanDateProblem(rows.map((row) => row.date));
  if (problem === null) return null;

  return {
    index: problem.index,
    field: 'date',
    key:
      problem.kind === 'DUPLICATE'
        ? 'pages.bookForm.plan.dateDuplicate'
        : 'pages.bookForm.plan.dateOutOfOrder',
  };
}

/** A data que uma linha nova recebe: o dia seguinte ao último do plano. */
function nextDate(rows: readonly PlanRow[]): string {
  const last = rows[rows.length - 1];
  if (last === undefined || !isCalendarDay(last.date)) return '';
  return addDays(last.date, 1);
}

/** Quantos dias o gerador propõe por padrão — um mês de leitura. */
const DEFAULT_COUNT = '30';

export interface PlanEditorProps {
  rows: readonly PlanRow[];
  onChange: (rows: readonly PlanRow[]) => void;
  problem: PlanProblem | null;
}

/**
 * O gerador. Ele só aparece com o plano VAZIO, e é decisão:
 *
 * gerar por cima de um plano que já tem tema digitado apagaria o conteúdo —
 * que é a única parte que não dá para refazer sozinha. Com linhas na tela, o
 * caminho é acrescentar e remover à mão (regra 8), que nunca perde nada.
 */
function Generator({
  onGenerate,
}: {
  onGenerate: (rows: readonly PlanRow[]) => void;
}) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState('');
  const [count, setCount] = useState(DEFAULT_COUNT);

  return (
    <div
      aria-label={t('pages.bookForm.plan.generator.label')}
      className="flex flex-col gap-3 rounded-control border border-line bg-surface p-4 sm:flex-row sm:items-end"
      role="group"
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium text-content">
        {t('pages.bookForm.plan.generator.startDate')}
        <input
          className={TEXT_INPUT_CLASS}
          onChange={(event) => setStartDate(event.target.value)}
          type="date"
          value={startDate}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-content">
        {t('pages.bookForm.plan.generator.count')}
        <input
          className={TEXT_INPUT_CLASS}
          inputMode="numeric"
          min={1}
          onChange={(event) => setCount(event.target.value)}
          type="number"
          value={count}
        />
      </label>
      <Button
        onClick={() => onGenerate(generatePlanRows(startDate, Number(count)))}
      >
        {t('pages.bookForm.plan.generator.submit')}
      </Button>
    </div>
  );
}

/**
 * UMA LINHA — `data · tema · referência`.
 *
 * DECISÃO F: no celular os três campos empilham; a partir de `sm` eles ficam
 * na mesma linha, que é o layout largo do desktop que o `BACKLOG` pede para a
 * única tela de administração do MVP 1.
 *
 * ⚠️ O nome acessível de cada campo carrega o NÚMERO da linha. Trinta campos
 * chamados "Data" fazem o leitor de tela dizer a mesma coisa trinta vezes, e é
 * justamente quem não vê a tela que precisa saber em qual dia está.
 */
function Row({
  index,
  onChange,
  onRemove,
  problem,
  row,
}: {
  row: PlanRow;
  index: number;
  problem: PlanProblem | null;
  onChange: (row: PlanRow) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const number = index + 1;
  const mine = problem !== null && problem.index === index;

  /**
   * Um campo da linha. Três `<input>` quase iguais eram vinte e oito linhas em
   * que o que muda — o campo, o rótulo, o tipo e a largura — cabia em quatro
   * argumentos, e a diferença entre eles ficava escondida no meio da
   * repetição. É a mesma extração do `textField` do `book-form.tsx`.
   *
   * ⚠️ **É uma FUNÇÃO CHAMADA, não um componente declarado aqui dentro** — e a
   * diferença não é estilo. Um componente definido no corpo de outro tem
   * IDENTIDADE NOVA a cada render: o React desmonta e remonta a subárvore a
   * cada tecla, e o `<input>` perde o foco no meio da palavra. O acusador é
   * `does not remount the field on every keystroke`, em
   * `__tests__/book-form.test.tsx`.
   */
  function field(options: {
    name: 'date' | 'title' | 'reference';
    label: string;
    width: string;
    type?: 'date' | 'text';
  }): ReactNode {
    const { label, name, type = 'text', width } = options;

    return (
      <input
        aria-invalid={mine && problem.field === name ? true : undefined}
        aria-label={label}
        className={`${TEXT_INPUT_CLASS} ${width}`}
        onChange={(event) => onChange({ ...row, [name]: event.target.value })}
        type={type}
        value={row[name]}
      />
    );
  }

  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-col gap-2 rounded-control border border-line bg-surface p-3 sm:flex-row sm:items-center">
        {field({
          name: 'date',
          label: t('pages.bookForm.plan.dateLabel', { number }),
          type: 'date',
          width: 'sm:w-44',
        })}
        {field({
          name: 'title',
          label: t('pages.bookForm.plan.titleLabel', { number }),
          width: 'sm:flex-1',
        })}
        {field({
          name: 'reference',
          label: t('pages.bookForm.plan.referenceLabel', { number }),
          width: 'sm:w-44',
        })}
        <Button onClick={onRemove} variant="ghost">
          {t('pages.bookForm.plan.remove', { number })}
        </Button>
      </div>
      {mine ? (
        /*
          A mensagem fica NA LINHA, e não num resumo no topo: num plano de
          trinta dias, "confira a data do dia 7" no alto da tela obriga a
          pessoa a contar as linhas.
        */
        <p className="text-sm text-danger">{messageFor(t, problem.key)}</p>
      ) : null}
    </li>
  );
}

export function PlanEditor({ onChange, problem, rows }: PlanEditorProps) {
  const { t } = useTranslation();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">
        {t('pages.bookForm.plan.heading')}
      </h2>
      <p className="text-sm text-muted">
        {t('pages.bookForm.plan.description')}
      </p>

      {rows.length === 0 ? (
        <>
          <Generator onGenerate={onChange} />
          {/* REGRA 13: plano vazio é válido — a frase diz o que dá para
              fazer, não que falte alguma coisa. */}
          <p className="text-sm text-muted">{t('pages.bookForm.plan.empty')}</p>
        </>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <Row
              index={index}
              key={row.key}
              onChange={(next) =>
                onChange(
                  rows.map((current, at) => (at === index ? next : current)),
                )
              }
              onRemove={() => onChange(rows.filter((_row, at) => at !== index))}
              problem={problem}
              row={row}
            />
          ))}
        </ol>
      )}

      <div className="flex">
        <Button
          onClick={() => onChange([...rows, planRow(nextDate(rows))])}
          variant="ghost"
        >
          {t('pages.bookForm.plan.add')}
        </Button>
      </div>
    </section>
  );
}
