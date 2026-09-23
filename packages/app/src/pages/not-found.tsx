import { BookX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { HOME_PATH } from '../auth/require-auth';
import { SCREEN_TITLE_CLASS } from './chrome';

/**
 * Rota desconhecida tem tela, não página em branco (regra 24). Fica FORA do
 * `RequireAuth`: um endereço errado não deve virar redirecionamento para o
 * login, que faria a pessoa achar que perdeu a sessão.
 */
export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <section className="mx-auto flex max-w-md flex-col items-start gap-3 p-6">
      <BookX aria-hidden className="size-8 opacity-60" />
      {/*
        ⚠️ **A MESMA CLASSE DO `Screen`, importada e não copiada** (Tarefa 42,
        auditoria). Esta tela está no `H1_EXCEPTIONS` porque a `<section>` dela
        diverge em três coisas do cromo — não porque a TIPOGRAFIA do título
        divirja. O canvas a desenha na mesma serifa das outras
        (`NaoEncontrada.dc.html:45`: Fraunces 27px/500), e por uma rodada ela
        ficou em `text-2xl font-semibold` enquanto as outras oito telas
        mudavam. O acusador é `chrome.test.tsx › ⚠️ gives the two h1 exceptions
        the SAME title class, from the same owner`.
      */}
      <h1 className={SCREEN_TITLE_CLASS}>{t('pages.notFound.title')}</h1>
      <p className="text-sm opacity-70">{t('pages.notFound.description')}</p>
      <Link className="text-sm underline underline-offset-4" to={HOME_PATH}>
        {t('pages.notFound.backHome')}
      </Link>
    </section>
  );
}
