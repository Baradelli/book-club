import { REMINDER_TIME_PATTERN } from '@clube/shared';

import { DEFAULT_TIMEZONE } from './club';
import { InvalidSettingsError } from './errors';

/**
 * As preferências de UMA PESSOA — e ela é do **usuário**, não do clube.
 *
 * ⚠️ **`unique(userId)` e NENHUM `clubId`** (decisão A da Tarefa 36), e isso é
 * diferente de todo o resto do projeto: não há `Membership` a conferir, porque
 * não há clube envolvido. **O corte de tenant aqui é o próprio JWT** — você só
 * lê e escreve o SEU —, e é por isso que nenhum input de UseCase ou de rota
 * aceita `userId`.
 *
 * O fuso é a decisão mais consequente da linha: "que dia é hoje" SEMPRE se
 * calcula no `timezone` do `Settings`, nunca na hora do servidor
 * (`CLAUDE.md`), e é ele que o dispatcher da Tarefa 37 usa para saber quando é
 * o `reminderTime` de cada pessoa.
 */
export interface Settings extends SettingsPreferences {
  id: string;
  userId: string;
}

/**
 * As CINCO preferências, sem identidade nem dono.
 *
 * ⚠️ **É este o tipo que os UseCases desta fatia falam**, e não o `Settings`
 * inteiro — porque o `getSettings` devolve o `DEFAULT_SETTINGS` quando não há
 * linha (decisão B), e o `DEFAULT_SETTINGS` **não tem `id`**. Inventar um id
 * para o padrão seria devolver a identidade de uma linha que não existe: a tela
 * poderia guardá-lo, e um dia mandá-lo de volta.
 *
 * É também a lista de campos **patcheáveis** (§7.1.1: o patch de um `update` é
 * um tipo próprio, nunca `Partial<Entidade>`) — o `SettingsPatch` abaixo é o
 * `Partial` DELE, e não do `Settings`, e é isso que impede um patch de alcançar
 * `id` ou `userId`.
 */
export interface SettingsPreferences {
  timezone: string;
  locale: string;
  /** `"HH:mm"`, validado pelo `assertReminderTime`. Nunca texto livre. */
  reminderTime: string;
  reminderEnabled: boolean;
  notifyGroupActivity: boolean;
}

/**
 * O PATCH das preferências: **só os campos que vieram** (decisão C).
 *
 * `Partial<SettingsPreferences>` e não `Partial<Settings>`, e a diferença é o
 * §7.1.1 na letra: `Partial<Settings>` incluiria `id` (identidade) e `userId`
 * (dono), campos que nenhum UseCase patcheia e que um dia atravessariam até o
 * `save`. Aqui a lista é a de PERMITIDOS, que não envelhece — se o `Settings`
 * ganhar um campo de identidade novo, ele não entra no patch de graça.
 */
export type SettingsPatch = Partial<SettingsPreferences>;

export const DEFAULT_SETTINGS = {
  timezone: DEFAULT_TIMEZONE,
  locale: 'pt',
  reminderTime: '21:00',
  reminderEnabled: true,
  notifyGroupActivity: true,
} as const;

/**
 * ⚠️ **O PORTÃO DO HORÁRIO: `"HH:mm"` de 24 horas, e nada mais** (decisão D da
 * Tarefa 36).
 *
 * O `reminderTimeSchema` da borda é a **primeira** barreira, não a única — o
 * mesmo argumento do `assertHighlightColor`. E aqui o preço de errar tem nome:
 * o dispatcher da Tarefa 37 faz `target.split(':').map(Number)` neste valor, e
 * um valor torto ali é `NaN` na janela — o lembrete da pessoa simplesmente
 * nunca sai, sem erro e sem ninguém notar.
 *
 * ⚠️ **Um dono para o regex.** O `REMINDER_TIME_PATTERN` vem de
 * `@clube/shared`, e é o MESMO objeto que a borda usa: duas barreiras não são
 * duas regras, e um segundo regex escrito aqui seria a lição nº 3 do MVP 1
 * outra vez. O teste o pina por identidade de comportamento.
 *
 * Recebe `unknown` pelo motivo do `assertNoteDoc`: o valor vem de corpo de
 * request, e quem decide o que é válido é o domínio, não o chamador. A
 * mensagem diz o formato — é a única publicada na resposta do 400 (§6.2) — e
 * **não ecoa o valor recusado**, porque ecoar o que chegou é como um payload
 * inteiro volta numa mensagem.
 *
 * ⚠️ **Ele NÃO dá `trim`**, de propósito: `" 21:00"` é recusado em vez de
 * aparado. Aparar criaria uma segunda grafia aceita que a borda recusa (a
 * divergência do ADR 0007), e o `=` de texto do Postgres é byte-sensível — o
 * dispatcher compara contra esta coluna.
 */
export function assertReminderTime(value: unknown): string {
  if (typeof value !== 'string' || !REMINDER_TIME_PATTERN.test(value)) {
    throw new InvalidSettingsError(
      'reminder time must be HH:mm, from 00:00 to 23:59',
    );
  }
  return value;
}
