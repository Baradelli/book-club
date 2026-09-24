import { cx, FOCUS_RING } from '@clube/ui';
import { BookX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { HOME_PATH } from '../auth/require-auth';
import { SCREEN_TITLE_CLASS } from './chrome';

/**
 * Rota desconhecida tem tela, não página em branco (regra 24). Fica FORA do
 * `RequireAuth`: um endereço errado não deve virar redirecionamento para o
 * login, que faria a pessoa achar que perdeu a sessão.
 *
 * ⚠️ **DESENHADA CONTRA `NaoEncontrada.dc.html:37-53` NA TAREFA 48**, que é a
 * fatia das quatro telas que nenhuma outra tocou. O que mudou, e por quê:
 *
 * - **centrada.** O canvas põe `align-items:center` no `<main>` e centra o
 *   título e a frase. Ela era a única tela do app alinhada à esquerda numa
 *   coluna de 120px de topo;
 * - **os cinzas viraram TOKEN.** Eram duas opacidades sobre a tinta — 60% no
 *   glifo e 70% na frase —, cinzas que nenhum token nomeia e que nenhuma
 *   guarda de contraste do projeto olha (todas leem o `theme.css`). Medidos
 *   antes de trocar: 70% sobre o creme resolve `#5c5f58` (5,76:1) e 60%
 *   resolve `#72746c` (4,21:1). **Nenhum reprovava** — o glifo é decorativo e
 *   tem piso de 3:1 —, então isto é desenho, não conserto de contraste;
 *
 *   ⚠️ **E OS NOMES DOS DOIS UTILITÁRIOS SAÍRAM DESTA PROSA DE PROPÓSITO,
 *   porque prosa custa CSS.** Medido nesta fatia: o scanner do Tailwind lê o
 *   texto bruto, comentário incluído, e enquanto o docblock escrevia o nome do
 *   utilitário de 70% o seletor continuava emitido **sem nenhum consumidor de
 *   código** — a classe exata do defeito que a nota 12 da Tarefa 47a mediu. O
 *   acusador é a guarda de `pages/__tests__/not-found.test.tsx`, que varre por
 *   PREFIXO e não escreve nenhum dos dois nomes.
 * - **a volta virou CAIXA.** `NaoEncontrada.dc.html:51` desenha um retângulo
 *   de 48px com filete e raio, e não um sublinhado. O que isso compra é o piso
 *   de toque de 44px (decisão F da Tarefa 13) numa tela que só aparece depois
 *   de alguém já ter errado o caminho;
 * - **o foco passou a existir.** O link não tinha `FOCUS_RING` nenhum, e
 *   "foco sempre visível" é decisão fechada do MVP 3.5.
 *
 * ⚠️ **O FILETE DA CAIXA É O DECORATIVO (`border-line`, 1,35:1), E ISSO É
 * DECIDIDO, não esquecido.** A decisão A desta fatia deu tom próprio ao filete
 * do CAMPO DE TEXTO, que não tem conteúdo visível dizendo o que ele é. Aqui
 * quem identifica o controle é o texto dentro dele ("Voltar para o início",
 * 11,9:1) — que é o que a WCAG 1.4.11 pede: a informação visual necessária
 * para IDENTIFICAR o componente. O mesmo argumento que a nota 9 da Tarefa 41a
 * registrou para a moldura do avatar.
 *
 * ⚠️ **As divergências de escala, declaradas:** o `<h1>` do canvas tem 27px e
 * sai 25px (é o `SCREEN_TITLE_CLASS`, e a divergência é a do cromo inteiro,
 * registrada na Tarefa 42); a frase tem 14,5px e sai 14px; a volta tem 14,5px
 * e sai 14px; o `gap` de 22px sai 20px. Nenhum dos três é degrau da escala
 * fechada de sete (`theme.css`), e acrescentar degrau é decisão de desenho.
 *
 * Contador canônico de linhas (o comando do docblock de `acervo.tsx`): **33**
 * (eram **19** antes desta fatia; as 14 a mais são o glifo com token, o filete
 * de 72px, a caixa da volta e o anel de foco).
 */
export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-5 px-8 pt-30">
      {/*
        56px e o traço do filete forte (`NaoEncontrada.dc.html:38`). Ele é
        `aria-hidden`: quem não vê a tela ouve o `h1`, não o desenho.
      */}
      <BookX aria-hidden className="size-14 text-line-strong" />
      {/*
        ⚠️ **A MESMA CLASSE DO `Screen`, importada e não copiada** (Tarefa 42,
        auditoria). Esta tela está no `H1_EXCEPTIONS` porque a `<section>` dela
        diverge em três coisas do cromo — não porque a TIPOGRAFIA do título
        divirja. O canvas a desenha na mesma serifa das outras
        (`NaoEncontrada.dc.html:45`: Fraunces 27px/500), e por uma rodada ela
        ficou no degrau de 24px em negrito da paleta do Tailwind enquanto as
        outras oito telas mudavam. ⚠️ O nome daquele utilitário SAIU desta
        frase na Tarefa 48: medido, ele não tinha consumidor de código nenhum
        desde a Tarefa 42 e continuava emitido no CSS **só porque este
        comentário o escrevia**. O acusador é
        `chrome.test.tsx › ⚠️ gives the two h1 exceptions
        the SAME title class, from the same owner`.
      */}
      <h1 className={cx(SCREEN_TITLE_CLASS, 'text-center')}>
        {t('pages.notFound.title')}
      </h1>
      <p className="text-center text-sm text-pretty text-muted">
        {t('pages.notFound.description')}
      </p>
      {/* O filete de 72px do canvas — o respiro antes da saída. */}
      <div aria-hidden className="h-px w-18 bg-line" />
      <Link
        className={cx(
          'flex min-h-12 items-center rounded-control border border-line px-6 text-sm text-content',
          FOCUS_RING,
        )}
        to={HOME_PATH}
      >
        {t('pages.notFound.backHome')}
      </Link>
    </section>
  );
}
