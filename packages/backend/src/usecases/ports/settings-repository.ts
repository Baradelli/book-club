import type { Settings } from '../../domain/settings';

/**
 * O recorte das preferências, e ele tem **um campo só**.
 *
 * ⚠️ **`reminderEnabled` é obrigatório, e é o começo da varredura do dispatcher**
 * (decisão C da Tarefa 37): *quem não quer lembrete não deve nem ser
 * considerado*. É a expressão explícita da vontade da pessoa, e vontade
 * declarada decide antes de condição técnica — a inscrição ativa (o aparelho
 * existe?) é o **segundo** filtro, e vive no outro port.
 *
 * ⚠️ **Sem `clubId`**, ao contrário do `NoteFilter`, do `HighlightFilter` e do
 * `ActivityEventFilter`: o `Settings` é do USUÁRIO (decisão A da Tarefa 36) e
 * não tem clube. Não há corte de tenant a fazer aqui, e inventar um criaria uma
 * segunda regra de tenant para manter em dia com a que existe.
 *
 * ⚠️ **Sem `userId`**, e é o que separa este `find` do `byUserId` ao lado: quem
 * quer o Settings de UMA pessoa já tem o método certo. Este é o da varredura —
 * "todo mundo que pediu para ser lembrado" —, e ele é o único caminho do
 * projeto que lê preferência de outra pessoa. Pode, porque o chamador não é uma
 * requisição: é o script de cron, que não tem ator.
 */
export interface SettingsFilter {
  /** `true` = quem pediu para ser lembrado. Obrigatório: não há "tanto faz". */
  reminderEnabled: boolean;
}

/**
 * O port das preferências: `save` · `byUserId` · `find`.
 *
 * Nasceu com dois métodos na Tarefa 03 e ganhou o `find` na **37**, junto da
 * implementação Prisma, na **mesma unidade** — que é o que o
 * `docs/CONVENCOES-CODIGO.md` §6.9 exige de quem cresce um port: crescer sem
 * implementar no Prisma dá `TS2420` na classe e `TS2345` em todo arquivo que
 * passa a instância a um UseCase (16 erros em 9 arquivos na medição da Tarefa
 * 26a), e um vermelho de compilação em arquivo alheio esconde exatamente o
 * vermelho de teste que a unidade deveria mostrar.
 *
 * **Sem `update`**: o `updateSettings` faz upsert pelo `save`, porque a linha
 * pode não existir (o super-admin do seed nunca aceitou convite). **Sem
 * `delete`**: preferência não se apaga — a pessoa desliga o que não quer.
 */
export interface SettingsRepository {
  save(settings: Settings): Promise<Settings>;
  byUserId(userId: string): Promise<Settings | null>;
  /**
   * "Quem pediu para ser lembrado" — a primeira leitura do
   * `dispatchDueNotifications` (Tarefa 37).
   *
   * **Não promete ordem**, como todos os `find` do projeto menos o do feed: o
   * dispatcher trata cada pessoa por vez e o resultado não depende da ordem. O
   * fake enumera INVERTIDO de propósito, para ninguém depender dela sem
   * perceber (`docs/CONVENCOES-CODIGO.md` §7.2).
   *
   * ⚠️ **SEM teto de linhas (`take`)**, como o `find` do `ReadingLog` e o
   * `byUserId` do `PushSubscription`, e aqui um corte seria a FALHA e não a
   * válvula: cortar em N faria as pessoas depois do corte **nunca** receberem
   * lembrete, em silêncio e sempre as mesmas (sem `ORDER BY`, "as mesmas" é
   * decidido pelo plano de execução). O conjunto é "as pessoas do sistema que
   * querem lembrete", que é uma linha por usuário — a mesma conta que deixou o
   * `ReadingLog` sem `take`.
   */
  find(filter: SettingsFilter): Promise<Settings[]>;
}
