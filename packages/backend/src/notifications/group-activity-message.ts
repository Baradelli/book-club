import type { ActivityType } from '@clube/shared';
import type { Locale } from '@clube/shared/locales';
import { en, FALLBACK_LOCALE, isLocale, pt } from '@clube/shared/locales';

import type { PushPayload } from '../usecases/ports/push-sender';
import { bookUrl } from './reminder-message';

/**
 * ⚠️ **A FRASE DO AVISO DE ATIVIDADE — o irmão do `reminder-message.ts`, e com
 * as mesmas duas propriedades** (decisão H da Tarefa 37, regra 13 da 38):
 *
 * 1. o texto vem do **catálogo compartilhado**, nunca escrito em português cru
 *    aqui (`CLAUDE.md`) — é o que o põe dentro da varredura anti-culpa de
 *    `packages/shared/src/locales/__tests__/anti-guilt.test.ts`, que percorre
 *    os DOIS idiomas. Uma guarda de tela nunca veria esta frase, porque ela não
 *    passa por tela nenhuma (§7.9);
 * 2. o idioma é o `Settings.locale` **de quem RECEBE**, e não o de quem
 *    escreveu: não há navegador aberto quando o aviso sai, e o autor pode ler
 *    em português enquanto o resto do clube lê em inglês.
 *
 * ⚠️ **E a propriedade que é só desta: NADA DE CONTEÚDO** (`NOTIFICACOES.md`
 * §1 — *"o push nunca leva o conteúdo"*). O lembrete pode dizer o trecho de
 * hoje porque o trecho é o plano do clube e é o que a pessoa precisa saber para
 * ler; aqui não há assunto a levar. A notificação aparece em **tela
 * bloqueada**, e o que alguém escreveu se lê no app, autenticado.
 *
 * ⚠️ **E ela não diz o NOME de quem fez** — ausência deliberada, com três
 * razões medidas: o `ActivityEvent` guarda referência e não conteúdo (Tarefa
 * 33); o `listActivity` registra por extenso que *"não resolve nome de
 * pessoa"*, porque quem resolve é a TELA pelo `GET /clubs/:clubId/members`; e
 * `User.name` é anulável, então a frase com nome precisaria de uma segunda
 * frase para quem não tem nome. O aviso diz que o clube está vivo; quem foi, o
 * app conta quando a pessoa abrir.
 */

/** Os catálogos por locale. `pt` é o padrão e o fallback (`CLAUDE.md`). */
const CATALOGS: Record<Locale, typeof pt> = { pt, en };

/**
 * O `kind` em minúsculas — é o `tag` do `showNotification` (§2) e o `topic` do
 * Web Push (§5), e os dois querem a mesma string (decisão E).
 *
 * Uma notificação nova com o mesmo `tag` **substitui** a anterior no aparelho
 * em vez de empilhar, e é isso — e não um debounce de servidor — que faz três
 * atividades juntas virarem **uma** notificação visível (decisão D). O resíduo
 * que ele não resolve são três vibrações, e está registrado como limite
 * conhecido.
 */
export const GROUP_ACTIVITY_TAG = 'group_activity';

/**
 * O nascimento → a chave do catálogo.
 *
 * ⚠️ **`Record<ActivityType, …>` e não um `switch` com `default`:** o
 * compilador passa a exigir uma frase para todo tipo novo de `ACTIVITY_TYPES`,
 * em vez de deixar o tipo novo cair num texto genérico que ninguém revisou. É a
 * mesma escolha que o `ACTIVITY_TYPES` já cobra de quem o amplia.
 */
const BODY_KEY: Record<
  ActivityType,
  keyof (typeof pt)['notifications']['groupActivity']
> = {
  PLAN_NOTE: 'planNote',
  FREE_NOTE: 'freeNote',
  HIGHLIGHT: 'highlight',
  READ: 'read',
};

export interface GroupActivityMessageInput {
  /** O `Settings.locale` de quem RECEBE. Valor desconhecido cai no `pt`. */
  locale: string;
  /** O livro em que a atividade aconteceu — é para ele que o clique leva. */
  bookId: string;
  /** Qual dos quatro nascimentos aconteceu. */
  type: ActivityType;
}

/**
 * "O clube está lendo."
 *
 * ⚠️ **Locale desconhecido cai no `pt` e NÃO estoura**, como no lembrete: a
 * coluna `Settings.locale` é `String` livre (o `updateSettingsSchema` pede
 * `z.string().min(1)`, não um `z.enum`), então um valor inesperado é
 * alcançável — e um aviso que deixasse de sair por causa disso falharia do pior
 * jeito: em silêncio, para sempre, e só para aquela pessoa.
 */
export function buildGroupActivityMessage(
  input: GroupActivityMessageInput,
): PushPayload {
  const locale: Locale = isLocale(input.locale)
    ? input.locale
    : FALLBACK_LOCALE;
  const catalog = CATALOGS[locale].notifications.groupActivity;

  return {
    title: catalog.title,
    body: catalog[BODY_KEY[input.type]],
    tag: GROUP_ACTIVITY_TAG,
    url: bookUrl(input.bookId),
  };
}
