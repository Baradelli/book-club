import {
  noContentResponseSchema,
  pushSubscriptionResponseSchema,
} from '@clube/shared';
import { Button } from '@clube/ui';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../auth/auth-context';
import { Notice } from './chrome';
import {
  browserPushDevice,
  type PushBlocker,
  PushDeviceError,
} from './push-device';

/**
 * "ATIVAR OS AVISOS NESTE APARELHO" — a única parte da tela de preferências com
 * máquina de estados (Tarefa 36b).
 *
 * ⚠️ **MÓDULO PRÓPRIO, E A RAZÃO É A LIÇÃO Nº 8 DO MVP 1 (divida ANTES de a
 * tela crescer).** Ela tem quatro recusas, dois gestos assíncronos e dois
 * caminhos de erro; a tela que a hospeda tem três controles e uma leitura.
 * Juntas passariam de 200 linhas, que é o número que a regra 19 da spec fixa —
 * e a spec já nomeia este corte como o óbvio.
 *
 * ⚠️ **MORA EM `packages/app`, NÃO EM `packages/ui` — e isto contraria o §7 do
 * `docs/NOTIFICACOES.md` DE PROPÓSITO** (decisão J).
 *
 * O §7 manda criar um `NotificationSettingsSection` em `packages/ui`. A
 * precedência do projeto é `CLAUDE.md` > decisões fechadas > spec > documento
 * de desenho, e o `CLAUDE.md` diz que `packages/ui` é de componentes
 * **compartilhados**. Isto tem **um chamador só**, fala com `navigator` e
 * `Notification` (que `packages/ui` hoje não toca em lugar nenhum) e conversa
 * com a API — três coisas que o design system não faz. É exatamente o
 * precedente do §7.1 que recusou subir o `matchesText` para o arquivo
 * compartilhado enquanto ele tivesse um chamador só, e o mesmo argumento com
 * que o `chrome.tsx` (o `Notice` e o `Screen`) ficou no app. Quando uma segunda
 * tela precisar dela, ela sobe — com o segundo chamador na mão.
 *
 * ⚠️ **ESTA FATIA NÃO EXIBE PUSH NENHUM** (regra 17). O `push-handler.js` do
 * service worker é a Tarefa 38, e o `POST /notifications/test` também. Por isso
 * o texto de sucesso fala do APARELHO ativado, nunca de um aviso que vai
 * chegar: prometer notificação que ainda não existe é a forma mais barata de
 * esta tela mentir.
 *
 * Contador canônico de linhas (o comando do docblock de `acervo.tsx`): **132**.
 */

export interface PushSectionProps {
  /**
   * A chave pública **vinda do `GET /notifications/config`** (decisão E), ou
   * `null` quando o servidor não tem VAPID configurado.
   *
   * ⚠️ **NUNCA `import.meta.env.VITE_VAPID_PUBLIC_KEY`.** Uma variável de build
   * seria um SEGUNDO dono da mesma chave, congelado no bundle: girar a chave
   * passaria a exigir rebuild do PWA, e um aparelho com o bundle velho se
   * inscreveria com a chave velha e receberia **silêncio** — a pior falha
   * possível numa feature de notificação, porque nada acusa.
   */
  vapidPublicKey: string | null;
  /**
   * ⚠️ **O `GET /notifications/config` CAIU — e isso é um terceiro estado.**
   *
   * Não é `enabled: false` (o estado normal de quem clona o projeto sem VAPID,
   * decisão F) e não é sucesso: é indisponibilidade, e ela tem conserto
   * diferente ("tente de novo" em vez de "configure o servidor"). Fundir os
   * dois faria uma queda de endpoint falar a língua de uma configuração
   * ausente, e a pessoa nunca saberia a diferença.
   *
   * ⚠️ E a queda **não derruba as três preferências**: elas são o trabalho
   * principal da tela, o aparelho é o secundário, e o secundário não leva o
   * principal junto (ver o `useEffect` de `preferencias.tsx`).
   */
  configFailed: boolean;
}

type DeviceState = 'loading' | 'active' | 'inactive';

export function PushSection({
  configFailed,
  vapidPublicKey,
}: PushSectionProps) {
  const { t } = useTranslation();
  const { api } = useAuth();

  const device = useMemo(() => browserPushDevice(), []);
  const [state, setState] = useState<DeviceState>('loading');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  /**
   * ⚠️ A recusa corrente. Nasce do `blockedBy()` (o que dá para saber antes de
   * o dedo cair) e pode ser SUBSTITUÍDA pelo que o toque descobriu: a permissão
   * é uma pergunta, e a resposta só existe depois do diálogo do navegador.
   */
  const [blocker, setBlocker] = useState<PushBlocker | null>(null);

  const unavailable = vapidPublicKey === null;

  useEffect(() => {
    if (unavailable) return undefined;

    // ⚠️ REGRA 13: o feature-detect vem ANTES de mostrar qualquer coisa, e são
    // os três globais — não um. Quem responde é a costura, para o teste poder
    // derrubar cada um deles sem forjar global.
    const blocked = device.blockedBy();
    if (blocked !== null) {
      setBlocker(blocked);
      return undefined;
    }

    let cancelled = false;
    void device
      .current()
      .then((subscription) => {
        // ⚠️ O `endpoint` vem do NAVEGADOR, nunca de um `localStorage`
        // (decisão H): uma cópia local fica velha no dia em que o navegador
        // expira a inscrição sozinho.
        if (!cancelled) setState(subscription === null ? 'inactive' : 'active');
      })
      .catch(() => {
        if (!cancelled) setState('inactive');
      });

    return () => {
      cancelled = true;
    };
  }, [device, unavailable]);

  async function activate(): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      if (vapidPublicKey === null) return;
      // A ordem da regra 14 vive na costura (perguntar → esperar o service
      // worker → inscrever); aqui fica a metade que é NOSSA: o servidor só
      // soube do aparelho depois de o navegador ter dito sim.
      const subscription = await device.subscribe(vapidPublicKey);
      await api.post(
        '/notifications/subscriptions',
        // Sem `userId` e sem `clubId`: o dono da inscrição é o JWT (§6.3), e
        // push é da PESSOA — a mesma pessoa em dois clubes tem um aparelho.
        { platform: device.platform(), subscription },
        pushSubscriptionResponseSchema,
      );
      setState('active');
    } catch (error) {
      if (error instanceof PushDeviceError) setBlocker(error.blocker);
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      const subscription = await device.current();
      if (subscription !== null) {
        /*
          ⚠️ REGRA 16 — A ORDEM IMPORTA: o `DELETE` no servidor ANTES do
          `unsubscribe` no navegador. Desinscrever primeiro e o `DELETE` falhar
          deixaria o backend com uma inscrição morta que o dispatcher da Tarefa
          37 tentaria usar; nesta ordem, a falha deixa tudo como estava.
        */
        await api.request('/notifications/subscriptions', {
          // O `endpoint` vai no CORPO, e não na query: ele é uma URL com o
          // endereço do aparelho dentro, e URL em query string vai para log de
          // acesso, `Referer` e histórico do navegador.
          method: 'DELETE',
          body: { endpoint: subscription.endpoint },
          schema: noContentResponseSchema,
        });
      }
      await device.unsubscribe();
      setState('inactive');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  /*
    ⚠️ DECISÃO F: com o push desconfigurado a seção INTEIRA some, e sobra uma
    frase. Não um botão desligado — botão que não funciona é convite a tocar —,
    e não um recado de erro: `enabled: false` é o estado normal de quem clona o
    projeto sem VAPID.
  */
  if (configFailed) {
    // ⚠️ ANTES do `unavailable`, e é a ordem que preserva a distinção: sem
    // resposta do endpoint a chave também é nula, então o teste de baixo
    // engoliria este caso e a indisponibilidade viraria "não configurado".
    return <Notice title={t('pages.settings.device.configFailed')} />;
  }

  if (unavailable) {
    return <Notice title={t('pages.settings.device.unavailable')} />;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">
        {t('pages.settings.device.title')}
      </h2>
      {blocker !== null ? (
        // Cada recusa tem a SUA frase, e cada frase diz o conserto (decisão G).
        <Notice title={t(`pages.settings.device.${blocker}`)} />
      ) : (
        <>
          {/*
            ⚠️ Nada enquanto o navegador não respondeu se já existe inscrição:
            escrever "desativado" antes de saber é a tela afirmando o estado
            errado por um frame — e é justamente desse estado que sai o toque
            que inscreve um aparelho já inscrito.
          */}
          {state === 'loading' ? null : (
            <>
              <p className="text-sm text-muted">
                {state === 'active'
                  ? t('pages.settings.device.active')
                  : t('pages.settings.device.inactive')}
              </p>
              <Button
                loading={busy}
                onClick={() => {
                  void (state === 'active' ? deactivate() : activate());
                }}
                variant="ghost"
              >
                {state === 'active'
                  ? t('pages.settings.device.deactivate')
                  : t('pages.settings.device.activate')}
              </Button>
            </>
          )}
          {failed ? <Notice title={t('pages.settings.device.failed')} /> : null}
        </>
      )}
    </section>
  );
}
