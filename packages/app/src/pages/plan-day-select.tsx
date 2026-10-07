import { localDay, localTimeZone } from '@clube/shared';
import { cx, type FieldControlProps } from '@clube/ui';
import { CalendarOff, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { type LabelledPlanDay, planDayLabel } from './plan-day-label';
import { dayTileParts, writtenPlanDay } from './plan-day-tile';

/**
 * O SELETOR DO DIA DO PLANO — a "Referência" do grifo (Tarefa 48a), vestida
 * com o mesmo bloquinho de data da lista do plano na tela do livro.
 *
 * ⚠️ **O CONTROLE CONTINUA SENDO O `<select>` NATIVO, e é decisão.** No
 * celular ele abre o seletor do sistema (a roda do iOS, a folha do Android),
 * que trinta dias pedem; o teclado e o leitor de tela recebem um controle de
 * verdade. O que muda é o que se VÊ fechado: o `<select>` fica transparente,
 * POR CIMA da face, e recebe todo toque e todo clique — a face é
 * `aria-hidden` e não captura ponteiro nenhum.
 *
 * As `<option>` seguem o formato `DD/MM · tema` de `planDayLabel` (o dono
 * único) e a marca `data-plan-day-label` da isenção anti-culpa: é o que a
 * lista aberta mostra, e o que os testes leem.
 *
 * O foco é da MOLDURA (`focus-within:`), como no papel do trecho: o `<select>`
 * transparente não tem como desenhar o próprio anel.
 *
 * O bloquinho segue as três tintas da lista do plano: hoje em destaque, o
 * futuro tracejado, o passado em superfície. "Sem dia do plano" é um
 * bloquinho tracejado VAZIO, com o calendário riscado — a ausência de dia
 * desenhada como ausência, não como um dia.
 */
export function PlanDaySelect({
  control,
  days,
  onChange,
  value,
}: {
  control: FieldControlProps;
  days: readonly LabelledPlanDay[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'pt';
  const today = localDay(new Date(), localTimeZone());
  const chosen = days.find((day) => day.id === value);
  const tile = chosen === undefined ? null : dayTileParts(chosen.date, locale);
  const isToday = chosen !== undefined && chosen.date === today;
  const isFuture = chosen !== undefined && chosen.date > today;

  return (
    <div
      className={cx(
        'group relative flex min-h-[60px] items-center gap-3 rounded-control bg-surface py-2 pr-11 pl-2 shadow-field transition-shadow',
        'hover:bg-surface-raised focus-within:shadow-field-focus',
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-control leading-none transition-colors',
          chosen === undefined
            ? 'border border-dashed border-line text-subtle'
            : isToday
              ? 'bg-accent text-accent-fg'
              : isFuture
                ? 'border border-dashed border-line text-subtle'
                : 'bg-surface-raised text-content group-hover:bg-surface',
        )}
      >
        {chosen === undefined ? (
          <CalendarOff className="size-4" strokeWidth={1.75} />
        ) : (
          <>
            <span className="text-[10px] font-semibold uppercase tracking-[0.04em] opacity-80">
              {tile?.weekday ?? ''}
            </span>
            <span className="mt-1 text-[17px] font-semibold tabular-nums">
              {tile?.day ?? chosen.date}
            </span>
          </>
        )}
      </span>

      <span aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cx(
            'truncate font-reading text-[16px] font-medium leading-snug tracking-[-0.01em]',
            chosen === undefined ? 'text-muted' : 'text-content',
          )}
        >
          {chosen === undefined
            ? t('pages.highlightForm.fields.noPlanDay')
            : chosen.title}
        </span>
        {chosen === undefined ? null : (
          <span
            className={cx(
              'truncate text-label',
              isToday ? 'font-semibold text-gold-strong' : 'text-muted',
            )}
          >
            {isToday
              ? t('pages.book.plan.today')
              : writtenPlanDay(chosen.date, locale)}
          </span>
        )}
      </span>

      <ChevronsUpDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted transition-colors group-hover:text-content"
        strokeWidth={1.75}
      />

      {/*
        `text-base` no `<select>` invisível não é enfeite: abaixo de 16px o
        Safari do iOS dá zoom na página ao focar o campo.
      */}
      <select
        {...control}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-control text-base opacity-0 outline-hidden"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{t('pages.highlightForm.fields.noPlanDay')}</option>
        {days.map((day) => (
          <option data-plan-day-label="" key={day.id} value={day.id}>
            {planDayLabel(day)}
          </option>
        ))}
      </select>
    </div>
  );
}
