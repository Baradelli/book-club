import { BookX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { HOME_PATH } from '../auth/require-auth';

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
      <h1 className="text-2xl font-semibold">{t('pages.notFound.title')}</h1>
      <p className="text-sm opacity-70">{t('pages.notFound.description')}</p>
      <Link className="text-sm underline underline-offset-4" to={HOME_PATH}>
        {t('pages.notFound.backHome')}
      </Link>
    </section>
  );
}
