import {
  notificationConfigResponseSchema,
  REMINDER_TIME_PATTERN,
  type SettingsResponse,
  settingsResponseSchema,
  type UpdateSettingsBody,
} from '@clube/shared';
import { Button, Field } from '@clube/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../auth/auth-context';
import { Notice, Screen } from './chrome';
import { TEXT_INPUT_CLASS } from './form-styles';
import { PushSection } from './push-section';

/**
 * AS PREFERÊNCIAS DA PESSOA (Tarefa 36b) — **três controles e o aparelho**.
 *
 * ⚠️ **TRÊS DE CINCO CAMPOS, E OS OUTROS DOIS FICAM FORA DE PROPÓSITO.** O
 * `Settings` tem `timezone` e `locale` também, e nenhum dos dois se edita aqui:
 * o `LanguagePicker` do cabeçalho guarda a escolha de idioma com
 * `persistLocale` (local), e `Settings.locale` **não tem um leitor sequer no
 * front hoje**. Editá-lo aqui criaria DOIS donos de "em que língua eu falo", e o
 * segundo ganharia às vezes. Unificar os dois é a Tarefa 46, inteira; fazer
 * metade é pior que não fazer.
 *
 * ⚠️ **CADA CONTROLE SALVA SOZINHO, com um `PATCH` de UM campo** (decisão C).
 * Não há botão "Salvar", e a razão não é gosto: um botão mandaria os cinco
 * campos e um dia sobrescreveria `timezone` com o valor velho lido no começo da
 * sessão — que é precisamente o bug que a parcialidade do `PATCH` existe para
 * impedir.
 *
 * ⚠️ **DOIS ESTADOS PARA A MESMA COISA, e é isso que faz a regra 10 funcionar:**
 * o `saved` é o que o SERVIDOR confirmou e o `draft` é o que está na tela.
 * Falha de escrita volta o `draft` para o `saved` **e** mostra um recado — um
 * interruptor ligado na tela e desligado no banco é a pior forma desta tela
 * errar, porque a pessoa acha que vai ser lembrada e não é.
 *
 * ⚠️ **O FUSO E A LÍNGUA VÃO NO `draft` sem aparecerem na tela**, e isso é
 * deliberado: o `PATCH` responde o estado INTEIRO (`settingsResponseSchema`, os
 * cinco campos), então o `draft` é uma cópia fiel do que o servidor tem — não um
 * objeto parcial que precisaria ser remontado à mão a cada resposta.
 *
 * ⚠️ **A SEÇÃO DO APARELHO MORA EM MÓDULO PRÓPRIO** (`push-section.tsx`), e é a
 * lição nº 8 do MVP 1 aplicada antes de doer: ela é a única parte desta tela com
 * máquina de estados (quatro recusas, dois gestos assíncronos, dois caminhos de
 * erro), e é exatamente o corte que a regra 19 da spec antecipa. **Medido pelo
 * contador canônico:** 161 aqui + 132 lá; num arquivo só seriam ~290 linhas,
 * bem acima das ~200 que a regra fixa como o momento de dividir.
 *
 * ⚠️ **E A SEÇÃO FICA EM `packages/app`, NÃO EM `packages/ui`** — decisão J,
 * desvio consciente do §7 do `docs/NOTIFICACOES.md`. Ver o docblock de
 * `push-section.tsx`.
 *
 * Contador canônico de linhas (o comando do docblock de `acervo.tsx`): **161**.
 */

/**
 * O estado do boot. O `ready` carrega só a **chave pública** — as preferências
 * em si moram no par `saved`/`draft`, porque elas mudam a cada toque e um
 * terceiro dono do mesmo valor seria o que divergiria primeiro.
 */
type LoadState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | {
      kind: 'ready';
      /** `null` quando o push está desligado (decisão F) **ou** indisponível. */
      vapidPublicKey: string | null;
      /**
       * ⚠️ O `/notifications/config` **caiu** — e isto não é a mesma coisa que
       * `enabled: false`. Ver o comentário do `useEffect`.
       */
      configFailed: boolean;
    };

export function PreferenciasPage() {
  const { t } = useTranslation();
  const { api } = useAuth();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  /** O que o servidor confirmou — o alvo do rollback da regra 10. */
  const [saved, setSaved] = useState<SettingsResponse | null>(null);
  /** O que está na tela. Diverge do `saved` enquanto uma escrita está em voo. */
  const [draft, setDraft] = useState<SettingsResponse | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      /*
        ⚠️ **`allSettled`, E AS DUAS LEITURAS TÊM PESOS DIFERENTES.**

        As três preferências são o trabalho PRINCIPAL desta tela; o aparelho é
        o secundário — e o secundário não leva o principal junto. Com um
        `Promise.all`, um `/notifications/config` em 500 apagava o horário do
        lembrete e os dois interruptores, que não dependem de push nenhum
        (medido na auditoria desta fatia: "campo de horário presente? false ·
        switches: 0").

        ⚠️ **E a distinção que o `Promise.all` protegia CONTINUA valendo:** a
        queda do endpoint **não** se traduz em "push não configurado". Tratá-la
        como `enabled: false` faria uma indisponibilidade falar a mesma língua
        do estado NORMAL de quem clona o projeto sem VAPID (decisão F), e a
        pessoa nunca saberia a diferença. Por isso ela vira um terceiro valor —
        `configFailed` — com um recado só dela.
      */
      const [settingsResult, configResult] = await Promise.allSettled([
        api.get('/me/settings', settingsResponseSchema),
        api.get('/notifications/config', notificationConfigResponseSchema),
      ]);
      if (cancelled) return;

      if (settingsResult.status === 'rejected') {
        // Nada da API na tela: o erro vira CHAVE de catálogo (§6.2).
        setState({ kind: 'failed' });
        return;
      }

      setSaved(settingsResult.value);
      setDraft(settingsResult.value);

      const config =
        configResult.status === 'fulfilled' ? configResult.value : null;
      setState({
        kind: 'ready',
        // Sem chave não há o que mandar ao `pushManager.subscribe`, então
        // `enabled: true` com chave nula vale o mesmo que desligado.
        vapidPublicKey:
          config !== null && config.enabled ? config.vapidPublicKey : null,
        configFailed: config === null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const save = useCallback(
    async (patch: UpdateSettingsBody): Promise<void> => {
      setSaveFailed(false);
      try {
        const next = await api.patch(
          '/me/settings',
          patch,
          settingsResponseSchema,
        );
        setSaved(next);
        setDraft(next);
      } catch {
        setSaveFailed(true);
        // ⚠️ REGRA 10: o valor volta ao que o servidor tem, não ao que a tela
        // mostrava — o recado sozinho deixaria a mentira na tela.
        setDraft(saved);
      }
    },
    [api, saved],
  );

  const body = useMemo(() => {
    if (state.kind === 'loading') {
      return <Notice title={t('pages.settings.loading')} />;
    }

    if (state.kind === 'failed') {
      return (
        <Notice
          action={
            <Button
              onClick={() => setAttempt((previous) => previous + 1)}
              variant="ghost"
            >
              {t('pages.settings.retry')}
            </Button>
          }
          title={t('pages.settings.failed')}
        />
      );
    }

    if (draft === null) return null;

    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Field className="max-w-40" label={t('pages.settings.reminderTime')}>
            {(control) => (
              <input
                {...control}
                className={TEXT_INPUT_CLASS}
                onChange={(event) => {
                  const typed = event.target.value;
                  // O gesto aparece na tela sempre — inclusive o de limpar.
                  setDraft({ ...draft, reminderTime: typed });
                  /*
                    ⚠️ REGRA 9: o `<input type="time">` produz `''` quando a
                    pessoa limpa o campo, e `''` não casa o padrão. Mandá-lo
                    daria 400 e pintaria o campo de vermelho por um gesto que
                    não é erro. O `REMINDER_TIME_PATTERN` é o MESMO da borda e
                    do domínio (`@clube/shared`) — nunca um segundo regex — e
                    ele é sem a flag `g` de propósito, senão o `lastIndex`
                    faria o mesmo valor alternar entre válido e inválido.
                  */
                  if (!REMINDER_TIME_PATTERN.test(typed)) return;
                  void save({ reminderTime: typed });
                }}
                type="time"
                value={draft.reminderTime}
              />
            )}
          </Field>

          <Switch
            checked={draft.reminderEnabled}
            label={t('pages.settings.reminderEnabled')}
            onChange={(next) => {
              setDraft({ ...draft, reminderEnabled: next });
              void save({ reminderEnabled: next });
            }}
          />
          <Switch
            checked={draft.notifyGroupActivity}
            label={t('pages.settings.notifyGroupActivity')}
            onChange={(next) => {
              setDraft({ ...draft, notifyGroupActivity: next });
              void save({ notifyGroupActivity: next });
            }}
          />
          {saveFailed ? (
            <Notice title={t('pages.settings.saveFailed')} />
          ) : null}
        </div>

        <PushSection
          configFailed={state.configFailed}
          vapidPublicKey={state.vapidPublicKey}
        />
      </div>
    );
  }, [draft, save, saveFailed, state, t]);

  return <Screen title={t('pages.settings.title')}>{body}</Screen>;
}

interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

/**
 * UM INTERRUPTOR — `<input type="checkbox">` dentro do `<label>`, e não um
 * `role="switch"`.
 *
 * O `checkbox` nativo é o que o leitor de tela já sabe anunciar e o que o
 * teclado já sabe operar; um `switch` de mentira precisaria de `aria-checked`,
 * de `onKeyDown` e de foco à mão para chegar ao mesmo lugar. O rótulo envolve o
 * controle, então **tocar no texto alterna** — o alvo de toque passa a ser a
 * linha inteira, que é o que importa no celular.
 */
function Switch({ checked, label, onChange }: SwitchProps) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm text-content">
      <input
        checked={checked}
        className="size-5 shrink-0 accent-accent"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}
