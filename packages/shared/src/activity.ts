import { z } from 'zod';

/**
 * O VOCABULÁRIO DO `ActivityEvent` — os quatro nascimentos que o clube vê.
 *
 * "Quando alguém marca que leu, ou escreve uma nota ou um grifo, o clube recebe
 * uma notificação — um incentiva o outro" (`CLAUDE.md`). Esta é a lista desses
 * acontecimentos, e ela mora aqui pelo caminho que a paleta do grifo percorreu
 * na Tarefa 22: são **três chamadores com a MESMA lista** — o domínio do
 * backend (`domain/activity-event.ts`), o `z.enum` da borda (Tarefa 34) e o
 * feed da home (Tarefa 35). Deixá-la no backend obrigaria a mover o arquivo na
 * 34 e a copiar a lista na 35, e a lição nº 3 do MVP 1 ("vocabulário
 * compartilhado mora num arquivo só") custou dois bugs.
 *
 * O `CLAUDE.md` já nomeia `ActivityEvent.type` ao lado de
 * `NotificationDelivery.kind`, `PushSubscription.platform` e `Highlight.color`
 * como a mesma classe: **`String` validado por `z.enum`**, e não enum Prisma,
 * porque a lista ainda evolui.
 *
 * ## Por que QUATRO tipos, e não um genérico
 *
 * O feed diz frases diferentes — "escreveu sobre o Cap. 3" × "escreveu uma
 * anotação" × "grifou" × "leu". Um tipo só empurraria a distinção para a tela
 * adivinhar pelo `subjectId`, e adivinhar exige saber em qual tabela procurar.
 *
 * ## Por que são NASCIMENTOS, e o que ficou de fora
 *
 * Editar, arquivar e desmarcar **não** entram. O `docs/NOTIFICACOES.md` §1
 * descreve a notificação de grupo com verbos de nascimento ("quando alguém do
 * clube **lê**, **escreve** uma anotação ou **registra** um grifo"), e o
 * produto concorda: corrigir a própria nota dois dias depois não é notícia para
 * ninguém, e registrar "a Maria desmarcou" é o vocabulário de cobrança que o
 * princípio anti-culpa proíbe. Isto é um feed de incentivo, não um log de
 * auditoria.
 *
 * A ordem é a da leitura do dia: a nota do dia, a avulsa, o grifo, o "li".
 */
export const ACTIVITY_TYPES = [
  /** Nasceu a anotação do DIA DE LEITURA — `subjectId` é o id da `Note`. */
  'PLAN_NOTE',
  /** Nasceu uma anotação AVULSA — `subjectId` é o id da `Note`. */
  'FREE_NOTE',
  /** Nasceu um grifo — `subjectId` é o id do `Highlight`. */
  'HIGHLIGHT',
  /** Alguém marcou que leu um dia — `subjectId` é o id do `ReadingLog`. */
  'READ',
] as const;

/** Um dos quatro nascimentos — nunca um verbo inventado. */
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/**
 * O portão do tipo: recebe `unknown` e **estreita**.
 *
 * Recebe `unknown` pelo mesmo motivo do `isHighlightColor`: quem chama é o
 * domínio, e é o domínio (não o chamador) que decide o que é tipo válido.
 * Comparação exata, sem `trim` e sem dobrar caixa — normalizar aqui criaria uma
 * segunda grafia aceita que o `z.enum` da borda (Tarefa 34) recusaria, que é a
 * divergência fake-banco do ADR 0007.
 */
export function isActivityType(value: unknown): value is ActivityType {
  return (ACTIVITY_TYPES as readonly unknown[]).includes(value);
}

/**
 * ⚠️ **O PADRÃO do feed: quantos eventos o `find` devolve quando ninguém pede
 * um número.** (Tarefa 34, decisão D.)
 *
 * O `docs/BACKLOG.md` previa que "o terceiro `find` (`ReadingLog`/
 * `ActivityEvent`) extrairia a constante" `FIND_ROW_LIMIT` da nota e do grifo.
 * **A previsão errou as duas vezes**: o `ReadingLog` a recusou com número (o
 * conjunto é limitado por dias × membros), e aqui a natureza é outra — o feed
 * **cresce para sempre**, mas quem sabe quantos itens quer é a **tela**.
 *
 * Daí a diferença que importa, e ela não é de valor, é de **quem manda**: o
 * `FIND_ROW_LIMIT` é uma válvula ESCONDIDA (nenhum chamador consegue pedir
 * mais, e o corte não aparece na resposta); este é o **padrão de um parâmetro
 * explícito** — a tela que mostra 20 pede 20, e a que mostrar 200 pede 200, sem
 * ninguém precisar reabrir o repositório.
 *
 * **50** é o "recentemente" do feed: cabe a última semana de um clube ativo
 * (quatro nascimentos possíveis por pessoa por dia) sem carregar o histórico
 * inteiro. Não há paginação por cursor no escopo — ver a spec da Tarefa 34 —,
 * então este número é o que a tela recebe se não disser nada.
 */
export const ACTIVITY_FEED_DEFAULT_LIMIT = 50;

/**
 * ⚠️ **O TETO do que a borda aceita pedir.**
 *
 * Ele existe porque o parâmetro é explícito: um `?limit=1000000` sem teto é uma
 * consulta que o cliente escolhe o tamanho — a mesma classe do
 * `HIGHLIGHT_PAGE_MAX`, e o mesmo lugar de conserto (a borda, não o port: dois
 * donos da mesma regra é como as duas divergem).
 *
 * ⚠️ **É o MESMO número do `FIND_ROW_LIMIT` da nota e do grifo, e é de
 * propósito — mas NÃO é a constante extraída que a decisão D recusa.** São
 * coisas diferentes (válvula escondida × teto de um parâmetro explícito) que
 * respondem à mesma pergunta física: quantas linhas de conteúdo de um clube
 * cabem numa resposta sem doer. Um terceiro número diferente aqui seria uma
 * terceira verdade sobre a mesma coisa, sem nada que a justificasse.
 */
export const ACTIVITY_FEED_MAX_LIMIT = 500;

/**
 * O tipo do evento na borda: **a mesma constante** de cima, nunca uma lista
 * copiada.
 *
 * É o molde medido do `highlightColor` (Tarefa 24), e o `CLAUDE.md` nomeia os
 * dois campos como a mesma classe — `String` validado por `z.enum`, porque a
 * lista ainda evolui. O teste pina as `options` do enum contra a constante **por
 * identidade**: uma lista escrita à mão aqui ficaria verde no dia em que a lista
 * crescesse e o schema não.
 *
 * ⚠️ **A borda NÃO normaliza caixa nem dá `trim`**, pelo motivo do
 * `isActivityType`: uma segunda grafia aceita viraria uma segunda grafia
 * gravada, e o `=` de texto do Postgres é byte-sensível.
 */
export const activityType = z.enum(ACTIVITY_TYPES);

/**
 * Um evento do feed como sai na resposta.
 *
 * **Os OITO campos da entidade, e nada mais** — e o schema é a FRONTEIRA: é o
 * `serializerCompiler` do Zod que corta o que não está declarado, e sem ele o
 * objeto de domínio inteiro iria para a rede (§6.1).
 *
 * ⚠️ **Ele leva REFERÊNCIA, nunca conteúdo** (decisão G da Tarefa 33): nem o
 * nome de quem fez, nem o título do dia, nem o nome do livro, nem um trecho.
 * A tela resolve nome pelo `GET /clubs/:clubId/members` (usa isso desde a 26a)
 * e já tem o livro. Denormalizar aqui seria um segundo `getBookWithPlan` com
 * outra forma — e um evento com título velho é uma tela que mente.
 *
 * ⚠️ **E NENHUMA contagem, nenhum "e mais N"** (decisão F): `COUNTER_SHAPE`
 * proíbe, e progresso é presença. É o CONTRATO que torna o número
 * irrenderizável — uma tela não pode desenhar um placar que a resposta não
 * carrega.
 *
 * `userId` aparece porque dentro do clube não existe conteúdo privado (ADR
 * 0002): o evento **não cria visibilidade nova** — ele aponta para o que todo
 * membro ativo já podia ver.
 */
export const activityEventResponseSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  /** O ATOR. Visível para todo o clube, por decisão: → ADR 0002. */
  userId: z.string(),
  type: activityType,
  bookId: z.string(),
  /**
   * O dia do plano, quando há. **Obrigatório e ANULÁVEL**, nunca `optional()`:
   * a anotação avulsa e o grifo gravam `null`, que é estado real, e a ausência
   * do campo quebraria a tela em cheio — o cliente valida a resposta de sucesso
   * (§6.8).
   */
  planItemId: z.string().nullable(),
  /** O id da nota / do grifo / do log. Referência, não conteúdo. */
  subjectId: z.string(),
  createdAt: z.string(),
});

export const activityResponseSchema = z.array(activityEventResponseSchema);

/**
 * ⚠️ **A única coisa que o cliente escolhe no feed: QUANTOS.** (Decisão D.)
 *
 * Sem filtro por tipo e sem filtro por pessoa — ninguém pediu, e o feed não é
 * listagem de acervo (o acervo já filtra por pessoa e por tipo). Sem cursor —
 * é contrato novo e não há tela que o peça.
 *
 * `z.coerce` porque query string é **texto**: é o precedente exato do `page` do
 * `listHighlightsQuerySchema`. O `.int()` fecha a fração e o `.max()` fecha o
 * pedido gigante — as duas pontas na borda, que é onde o `HIGHLIGHT_PAGE_MAX`
 * as fechou.
 *
 * Ausente = o servidor usa o `ACTIVITY_FEED_DEFAULT_LIMIT`. **Sem `.default()`
 * aqui**, de propósito: o padrão tem UM dono, e ele é o repositório (o port
 * declara "sem `limit` usa o padrão"). Um `.default()` na borda faria a rota
 * mandar sempre um número e o padrão do port nunca rodar — dois donos da mesma
 * regra, e o que fica para trás é o que ninguém exercita.
 */
export const listActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(ACTIVITY_FEED_MAX_LIMIT).optional(),
});

export type ActivityEventResponse = z.infer<typeof activityEventResponseSchema>;
export type ActivityResponse = z.infer<typeof activityResponseSchema>;
export type ListActivityQuery = z.infer<typeof listActivityQuerySchema>;
