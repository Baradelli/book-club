import { randomUUID } from 'node:crypto';

import type { ReadingPlanItem } from '../domain/book';
import { ADMIN_ROLES } from '../domain/club';
import { InvalidBookError } from '../domain/errors';
import type { PlanItemDraft } from '../domain/reading-plan';
import { normalizePlanDrafts } from '../domain/reading-plan';
import type { AssertMembership } from './assert-membership';
import { bookForActor } from './book-for-actor';
import type { BookRepository } from './ports/book-repository';
import type { NoteRepository } from './ports/note-repository';
import type { ReadingLogRepository } from './ports/reading-log-repository';
import type { ReadingPlanItemRepository } from './ports/reading-plan-item-repository';

export interface ReplacePlanItemsInput {
  actorUserId: string;
  bookId: string;
  /** O plano NOVO inteiro. `[]` remove tudo — não é erro. */
  planItems: PlanItemDraft[];
}

export interface ReplacePlanItemsOutput {
  planItems: ReadingPlanItem[];
  created: number;
  updated: number;
  removed: number;
}

/**
 * Reescreve o plano de leitura **por diff da `date`**, não apaga-e-recria.
 *
 * Por que o diff, e não o nome do UseCase sugere: `Note.planItemId` tem FK
 * para `ReadingPlanItem`, e a anotação do dia é `unique(planItemId, userId)` —
 * a nota daquele dia está amarrada ao **id** do item. Recriar os itens com ids
 * novos falharia por FK (`onDelete: Restrict`) ou, com `Cascade`, apagaria a
 * anotação de outra pessoa, que é justamente o que o admin não pode fazer.
 *
 * Então a `date` é a chave natural do dia de leitura:
 * - data que já existe → item atualizado NO LUGAR, mesmo `id` e `createdAt`
 *   original, com `title`/`reference`/`order` novos;
 * - data nova → item novo;
 * - data que desapareceu → item removido.
 *
 * E as guardas "não remover item do plano que já tem nota" (Tarefa 11) e "…que
 * alguém já leu" (Tarefa 32c): o `Restrict` das duas FKs recusaria a remoção de
 * qualquer jeito, mas como erro de banco cru, que a borda relança como **500**.
 * As guardas transformam isso num **400** com mensagem, e antecipam a recusa
 * para antes de qualquer escrita.
 */
export class ReplacePlanItems {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly books: BookRepository,
    private readonly planItems: ReadingPlanItemRepository,
    private readonly notes: NoteRepository,
    private readonly readingLogs: ReadingLogRepository,
  ) {}

  async execute(input: ReplacePlanItemsInput): Promise<ReplacePlanItemsOutput> {
    const book = await bookForActor(this.books, this.assertMembership, {
      actorUserId: input.actorUserId,
      bookId: input.bookId,
      requireRole: ADMIN_ROLES,
    });

    // O rascunho inteiro é validado ANTES de qualquer escrita E de qualquer
    // remoção: um plano ruim não pode deixar o livro com meio plano.
    const rows = normalizePlanDrafts(input.planItems);

    const existing = await this.planItems.findByBook(book.id);
    const existingByDate = new Map(existing.map((item) => [item.date, item]));

    const now = new Date();
    let created = 0;

    const next = rows.map((row): ReadingPlanItem => {
      const survivor = existingByDate.get(row.date);
      if (survivor) {
        // `id` e `createdAt` do item antigo sobrevivem: é o que salva a nota.
        return { ...survivor, ...row };
      }

      created += 1;
      return {
        id: randomUUID(),
        bookId: book.id,
        ...row,
        createdAt: now,
      };
    });

    const keptDates = new Set(rows.map((row) => row.date));
    const removedIds = existing
      .filter((item) => !keptDates.has(item.date))
      .map((item) => item.id);

    /**
     * A PRIMEIRA GUARDA: nenhum dia com anotação pode ser removido.
     *
     * Roda **depois** do corte de tenant (o `bookForActor` acima) e **depois**
     * da validação do rascunho — quem não é admin daquele clube, e quem mandou
     * um rascunho ruim, não gera nem uma leitura de nota. E roda **antes** de
     * qualquer escrita, porque é isso que a torna útil: o `Restrict` da FK já
     * recusaria a remoção, mas no meio da transação e como erro de banco.
     *
     * `planItemIdsWithAnyNote` e não `planItemWritersByBook`: a FK **não olha
     * `status`**, então uma nota arquivada ainda ancora o dia. A leitura da
     * sobreposição de tela filtra `ACTIVE`, e usá-la aqui faria a guarda
     * liberar uma remoção que o banco vai recusar.
     *
     * Chamada sem `if` de lista vazia: o port declara que `[]` devolve `[]`
     * sem ida ao banco, então o caminho "não remove nada" não paga nada — e um
     * ramo a menos é um ramo a menos para alguém inverter.
     */
    const daysWithNotes = await this.notes.planItemIdsWithAnyNote(removedIds);
    if (daysWithNotes.length > 0) {
      // Só a CONTAGEM. Nem autor, nem título, nem id de dia: `error.message` é
      // a única publicada na resposta do 400 (CONVENCOES-CODIGO §6.2), e o
      // admin não precisa saber quem escreveu para entender que não pode
      // remover o dia.
      throw new InvalidBookError(
        `cannot remove ${daysWithNotes.length} reading plan day(s) that already have notes`,
      );
    }

    /**
     * A SEGUNDA GUARDA: nenhum dia que alguém já LEU pode ser removido.
     *
     * O caso irmão, e o que ele conserta é um **500 mudo**: `ReadingLog` tem a
     * mesma FK `Restrict` para `ReadingPlanItem` (Tarefa 32), e a guarda de
     * cima não o vê — `note.count({planItemId})` é zero num dia que só tem
     * leitura. O admin já tinha aprendido que o sistema recusa educadamente, e
     * era surpreendido por um erro de banco no caso gêmeo. Basta **uma** pessoa
     * ter marcado "li" sem escrever nada.
     *
     * **Depois da guarda de nota, e não em paralelo com ela** (decisão D da
     * Tarefa 32c): um dia com nota **e** leitura continua dando a mensagem de
     * nota, que é o comportamento que já existia — ordem estável é menos
     * surpresa para quem já aprendeu a frase. E, sequencial, o caso comum
     * (recusa por nota) não paga a segunda leitura.
     *
     * **Mensagem PRÓPRIA, e não a de cima reaproveitada** (decisão B): a frase
     * da guarda de nota diz *"…that already have notes"*, e `error.message` é a
     * única publicada ao cliente, só na classe 400 (§6.2). Um dia com só
     * leitura respondendo aquela frase faria a resposta **mentir** — o admin
     * abriria o dia procurando uma anotação que não existe.
     *
     * **Sem `status` a ignorar**, ao contrário da nota: o log é imutável, não
     * se arquiva, e a exceção documentada do `CLAUDE.md` (desmarcar "li" é hard
     * delete) é o que garante que toda linha que existe ainda ancora o dia.
     *
     * ⚠️ **A FK `Restrict` continua, e ela é a REDE embaixo desta guarda**
     * (decisão F): tirá-la porque "agora tem guarda" trocaria uma proteção
     * estrutural por uma que alguém pode esquecer de chamar — e a auditoria da
     * Tarefa 11 mediu exatamente isso na guarda irmã, com um duplo devolvendo
     * `[]` sobrevivendo a 1202 testes.
     *
     * Chamada sem `if` de lista vazia, como a de cima: o port declara que `[]`
     * devolve `[]` sem ida ao banco.
     */
    const daysRead =
      await this.readingLogs.planItemIdsWithAnyReadingLog(removedIds);
    if (daysRead.length > 0) {
      // Só a CONTAGEM, como na guarda de nota e pelo mesmo motivo: o admin não
      // precisa saber QUEM leu para entender que não pode remover o dia, e
      // nome de leitor num corpo de 400 é conteúdo do clube vazando.
      throw new InvalidBookError(
        `cannot remove ${daysRead.length} reading plan day(s) that somebody already read`,
      );
    }

    // UMA chamada, não duas. Até a Tarefa 07 isto era `deleteMany` seguido de
    // `saveMany`: em memória atômico de graça, mas contra o Postgres um crash
    // entre as duas deixaria o plano truncado — e é este plano que ancora as
    // anotações das pessoas. O UseCase não pode abrir transação (não conhece
    // Prisma), então quem garante o "tudo ou nada" é o port, declarando a
    // OPERAÇÃO inteira. A ordem remover→inserir é decisão do port.
    const saved = await this.planItems.replaceForBook(book.id, {
      upsert: next,
      removeIds: removedIds,
    });

    return {
      planItems: saved,
      created,
      updated: next.length - created,
      removed: removedIds.length,
    };
  }
}
