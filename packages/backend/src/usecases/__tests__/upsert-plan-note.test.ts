import { beforeEach, describe, expect, it } from 'vitest';

import { docToText } from '../../domain/doc-to-text';
import {
  BookNotFoundError,
  ForbiddenRoleError,
  InvalidNoteError,
  NotAMemberError,
  PlanItemNotFoundError,
} from '../../domain/errors';
import type { NoteDoc } from '../../domain/note';
import {
  aBook,
  aDoc,
  aMembership,
  aNote,
  aPlanItem,
  FIXED_ISO,
  required,
} from '../../test-support/builders';
import { BookRepositoryFake } from '../_fakes/book-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { NoteRepositoryFake } from '../_fakes/note-repository-fake';
import { ReadingPlanItemRepositoryFake } from '../_fakes/reading-plan-item-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { UpsertPlanNoteInput } from '../upsert-plan-note';
import { UpsertPlanNote } from '../upsert-plan-note';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const BOOK_ID = 'book-1';
const ARCHIVED_BOOK_ID = 'book-arquivado';
const OTHER_CLUB_BOOK_ID = 'book-do-outro-clube';

const DAY_ONE = 'plan-dia-1';
const DAY_TWO = 'plan-dia-2';
const ORPHAN_ITEM = 'plan-sem-livro';
const ARCHIVED_BOOK_ITEM = 'plan-do-livro-arquivado';
const OTHER_CLUB_ITEM = 'plan-do-outro-clube';

const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-maria';
const SECOND_MEMBER_ID = 'user-marcos';
const OTHER_CLUB_MEMBER_ID = 'user-de-outro-clube';

const DAY_ONE_THEME = 'Cap. 1 — Uma reunião inesperada';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('UpsertPlanNote', () => {
  let memberships: MembershipRepositoryFake;
  let books: BookRepositoryFake;
  let plan: ReadingPlanItemRepositoryFake;
  let notes: NoteRepositoryFake;
  let useCase: UpsertPlanNote;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    books = new BookRepositoryFake();
    plan = new ReadingPlanItemRepositoryFake();
    notes = new NoteRepositoryFake();
    // O corte de tenant vem do assertMembership da Tarefa 01 e do
    // bookForActor da Tarefa 06, não de uma segunda implementação aqui.
    useCase = new UpsertPlanNote(
      new AssertMembership(memberships),
      books,
      plan,
      notes,
    );

    await books.save(aBook({ id: BOOK_ID, clubId: CLUB_ID }));
    await books.save(
      aBook({
        id: ARCHIVED_BOOK_ID,
        clubId: CLUB_ID,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    );
    await books.save(aBook({ id: OTHER_CLUB_BOOK_ID, clubId: OTHER_CLUB_ID }));

    await plan.saveMany([
      aPlanItem({
        id: DAY_ONE,
        bookId: BOOK_ID,
        order: 0,
        date: '2026-10-01',
        title: DAY_ONE_THEME,
        reference: 'p. 1-20',
      }),
      aPlanItem({
        id: DAY_TWO,
        bookId: BOOK_ID,
        order: 1,
        date: '2026-10-02',
        title: 'Cap. 2 — Carneiro assado',
      }),
      // Um item cujo livro foi apagado: o `bookForActor` é quem responde.
      aPlanItem({ id: ORPHAN_ITEM, bookId: 'book-fantasma' }),
      aPlanItem({ id: ARCHIVED_BOOK_ITEM, bookId: ARCHIVED_BOOK_ID }),
      aPlanItem({ id: OTHER_CLUB_ITEM, bookId: OTHER_CLUB_BOOK_ID }),
    ]);

    for (const [userId, role] of [
      [OWNER_ID, 'OWNER'],
      [ADMIN_ID, 'ADMIN'],
      [MEMBER_ID, 'MEMBER'],
      [SECOND_MEMBER_ID, 'MEMBER'],
    ] as const) {
      await memberships.save(aMembership({ userId, clubId: CLUB_ID, role }));
    }
    await memberships.save(
      aMembership({
        userId: OTHER_CLUB_MEMBER_ID,
        clubId: OTHER_CLUB_ID,
        role: 'MEMBER',
      }),
    );
  });

  function validInput(
    overrides: Partial<UpsertPlanNoteInput> = {},
  ): UpsertPlanNoteInput {
    return {
      actorUserId: MEMBER_ID,
      planItemId: DAY_ONE,
      doc: aDoc('Gostei do começo.'),
      ...overrides,
    };
  }

  describe('permission and tenant', () => {
    // Regra 13
    it('rejects a plan item that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ planItemId: 'plan-fantasma' })),
      ).rejects.toBeInstanceOf(PlanItemNotFoundError);

      expect(notes.saveCalls).toBe(0);
    });

    // Regra 14 — o livro do item foi apagado.
    it('rejects an item whose book does not exist', async () => {
      // Pré-condição: o item existe de verdade, então o 404 é do LIVRO.
      expect(await plan.byId(ORPHAN_ITEM)).not.toBeNull();

      await expect(
        useCase.execute(validInput({ planItemId: ORPHAN_ITEM })),
      ).rejects.toBeInstanceOf(BookNotFoundError);
    });

    // Regra 14 — arquivado é invisível até o MVP 4, também para escrever.
    it('rejects an item whose book is archived', async () => {
      expect(await plan.byId(ARCHIVED_BOOK_ITEM)).not.toBeNull();

      await expect(
        useCase.execute(validInput({ planItemId: ARCHIVED_BOOK_ITEM })),
      ).rejects.toBeInstanceOf(BookNotFoundError);

      expect(notes.saveCalls).toBe(0);
    });

    // Regra 15
    it('rejects an actor with no membership at all', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: 'user-forasteiro' })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(notes.saveCalls).toBe(0);
    });

    // Regra 15 — membership arquivado não escreve (saiu do clube).
    it('rejects an actor whose membership is archived', async () => {
      await memberships.save(
        aMembership({
          userId: MEMBER_ID,
          clubId: CLUB_ID,
          role: 'MEMBER',
          status: 'ARCHIVED',
        }),
      );

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        NotAMemberError,
      );
    });

    // Regra 15 — 404, NÃO 403: não vazamos a existência do recurso. O membro
    // do outro clube é membro de verdade, e ainda assim não existe este item
    // para ele.
    it('rejects a member of another club with 404, not 403', async () => {
      const error: unknown = await useCase
        .execute(validInput({ actorUserId: OTHER_CLUB_MEMBER_ID }))
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotAMemberError);
      expect(error).not.toBeInstanceOf(ForbiddenRoleError);
    });

    /**
     * A ORDEM: o corte de tenant vem ANTES da validação do corpo. Os dois
     * eixos se cruzam só aqui — todo outro teste de corpo malformado usa membro
     * válido, e todo outro teste de ator de fora usa corpo válido.
     *
     * Por que a ordem importa: um `InvalidNoteError` (400, e é a única classe
     * cuja `message` sai publicada — CONVENCOES-CODIGO §6.2) confirmaria a
     * quem não é do clube que o `planItemId` existe. O 404 do tenant não
     * confirma nada.
     */
    it('cuts the tenant before it validates the body', async () => {
      const error: unknown = await useCase
        .execute(
          validInput({
            actorUserId: OTHER_CLUB_MEMBER_ID,
            doc: 'não é um doc',
          }),
        )
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotAMemberError);
      expect(error).not.toBeInstanceOf(InvalidNoteError);
      expect(notes.saveCalls).toBe(0);
    });

    // Regra 15 — e o caminho inverso: o membro do clube 1 não escreve no item
    // do livro do clube 2, mesmo sabendo o id do item.
    it('rejects writing on an item of a book from another club', async () => {
      await expect(
        useCase.execute(validInput({ planItemId: OTHER_CLUB_ITEM })),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    // Regra 16 — escrever não exige papel. Este é o lado "MEMBER pode".
    it.each([
      ['MEMBER', MEMBER_ID],
      ['ADMIN', ADMIN_ID],
      ['OWNER', OWNER_ID],
    ])('lets the %s write the note of the day', async (_label, actorUserId) => {
      const { note, created } = await useCase.execute(
        validInput({ actorUserId }),
      );

      expect(created).toBe(true);
      expect(note.userId).toBe(actorUserId);
    });

    /**
     * Regra 16 — escrever não exige papel: um `MEMBER` simples grava.
     *
     * O nome antigo (`never raises ForbiddenRoleError for a plain MEMBER`)
     * prometia mais do que provava: o valor resolvido é `{ note, created }` e
     * NUNCA poderia ser um `Error`, então o `not.toBeInstanceOf` não assertava
     * nada — só o `resolves` mordia. Agora o teste asserta o que o `resolves`
     * de fato entrega.
     */
    it('writes the note of a plain MEMBER instead of demanding a role', async () => {
      const { note, created } = await useCase.execute(
        validInput({ actorUserId: MEMBER_ID }),
      );

      expect(created).toBe(true);
      expect(note.userId).toBe(MEMBER_ID);
      expect(note.title).toBe(DAY_ONE_THEME);
      expect(notes.saved).toHaveLength(1);
    });

    /**
     * Regra 15 + a "Definição de pronto": nem `userId`, nem `clubId`, nem
     * `plainText` existem no input. O `@ts-expect-error` é metade da prova (o
     * compilador recusa a chave) e o comportamento é a outra: o valor
     * contrabandeado é ignorado.
     */
    it('ignores a userId smuggled into the input', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        planItemId: DAY_ONE,
        doc: aDoc('tentei escrever como o outro'),
        // @ts-expect-error o input não declara userId — o autor é o ator
        userId: SECOND_MEMBER_ID,
      } satisfies UpsertPlanNoteInput;

      const { note } = await useCase.execute(smuggled);

      expect(note.userId).toBe(MEMBER_ID);
    });

    /**
     * O `clubId` GRAVADO ignora o input — e é isto que prova, porque o ator é
     * um MEMBRO LEGÍTIMO: a chamada atravessa o corte de tenant e chega ao
     * campo que vai para a linha. Um `clubId` vindo do corpo faria a nota
     * aparecer na listagem de OUTRO clube (envenenamento cross-tenant), e um
     * teste feito com ator de fora nunca chegaria a esse campo.
     */
    it('ignores a clubId smuggled into the input and stores the club of the book', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        planItemId: DAY_ONE,
        doc: aDoc('minha nota, no meu clube'),
        // @ts-expect-error o input não declara clubId — ele vem de book.clubId
        clubId: OTHER_CLUB_ID,
      } satisfies UpsertPlanNoteInput;

      const { note } = await useCase.execute(smuggled);

      expect(note.clubId).toBe(CLUB_ID);
      expect(required(notes.saved[0]).clubId).toBe(CLUB_ID);
    });

    // A OUTRA coisa que o `clubId` contrabandeado não compra: o corte de
    // tenant. Mandar o clube "certo" no corpo não faz o ator de fora entrar.
    it('does not let a smuggled clubId buy a way past the tenant cut', async () => {
      const smuggled = {
        actorUserId: OTHER_CLUB_MEMBER_ID,
        planItemId: DAY_ONE,
        doc: aDoc('tentei entrar no clube alheio'),
        // @ts-expect-error o input não declara clubId — ele vem de book.clubId
        clubId: OTHER_CLUB_ID,
      } satisfies UpsertPlanNoteInput;

      await expect(useCase.execute(smuggled)).rejects.toBeInstanceOf(
        NotAMemberError,
      );
      expect(notes.saveCalls).toBe(0);
    });

    it('ignores a plainText smuggled into the input', async () => {
      const smuggled = {
        actorUserId: MEMBER_ID,
        planItemId: DAY_ONE,
        doc: aDoc('o texto de verdade'),
        // @ts-expect-error plainText é DERIVADO, nunca entra na API (ADR 0001)
        plainText: 'texto adulterado pelo cliente',
      } satisfies UpsertPlanNoteInput;

      const { note } = await useCase.execute(smuggled);

      expect(note.plainText).toBe('o texto de verdade');
    });
  });

  describe('creating the note of the day', () => {
    // Regra 18
    it('creates it with the fields the domain decides', async () => {
      const { note, created } = await useCase.execute(validInput());

      expect(created).toBe(true);
      expect(note.kind).toBe('PLAN');
      expect(note.planItemId).toBe(DAY_ONE);
      expect(note.userId).toBe(MEMBER_ID);
      expect(note.status).toBe('ACTIVE');
      expect(note.archivedAt).toBeNull();
      expect(note.id).toMatch(UUID);
      expect(note.createdAt).toEqual(note.updatedAt);
      expect(notes.saved).toHaveLength(1);
    });

    // Regra 18 — dois ids sorteados, nunca derivados da chave natural: o id é
    // `randomUUID()`, e duas notas diferentes nunca compartilham id.
    it('gives each note its own id', async () => {
      const first = await useCase.execute(validInput());
      const second = await useCase.execute(
        validInput({ planItemId: DAY_TWO, actorUserId: SECOND_MEMBER_ID }),
      );

      expect(second.note.id).not.toBe(first.note.id);
      expect(second.note.id).toMatch(UUID);
    });

    /**
     * Regra 17 — `clubId` e `bookId` vêm de `planItem.bookId` → `book.clubId`,
     * e o input não tem nenhum dos dois.
     *
     * O item usado aqui é o do SEGUNDO livro de propósito: com um livro só, a
     * asserção passaria com uma implementação que pegasse "o primeiro livro do
     * repositório".
     */
    it('takes clubId and bookId from the plan item, not from the input', async () => {
      await books.save(aBook({ id: 'book-2', clubId: CLUB_ID }));
      await plan.saveMany([
        aPlanItem({ id: 'plan-do-book-2', bookId: 'book-2' }),
      ]);

      const { note } = await useCase.execute(
        validInput({ planItemId: 'plan-do-book-2' }),
      );

      expect(note.bookId).toBe('book-2');
      expect(note.clubId).toBe(CLUB_ID);
    });

    /**
     * Regra 17, a metade que só um segundo CLUBE prova: o ator é membro dos
     * dois e escreve no item do livro do outro. Uma implementação que tirasse
     * o clube do membership do ator (ou do primeiro livro do repositório)
     * passaria no teste acima e falharia aqui.
     */
    it('takes the clubId of the book even for an actor who is in two clubs', async () => {
      await memberships.save(
        aMembership({
          userId: MEMBER_ID,
          clubId: OTHER_CLUB_ID,
          role: 'MEMBER',
        }),
      );

      const { note } = await useCase.execute(
        validInput({ planItemId: OTHER_CLUB_ITEM }),
      );

      expect(note.bookId).toBe(OTHER_CLUB_BOOK_ID);
      expect(note.clubId).toBe(OTHER_CLUB_ID);
    });

    // Regra 19
    it('copies the title from the theme of the plan item', async () => {
      const { note } = await useCase.execute(validInput());

      expect(note.title).toBe(DAY_ONE_THEME);
    });

    // Regra 19 — o tema do item é o do item PEDIDO, não o do primeiro do plano.
    it('copies the title of the item asked for', async () => {
      const { note } = await useCase.execute(
        validInput({ planItemId: DAY_TWO }),
      );

      expect(note.title).toBe('Cap. 2 — Carneiro assado');
    });

    // Regra 20 — o item do plano TEM `reference` ('p. 1-20'), e a nota do dia
    // continua com `null`: a referência é do plano, e duas fontes para a mesma
    // string divergiriam quando o admin corrigisse o plano.
    it('never copies the reference of the plan item', async () => {
      expect(required(await plan.byId(DAY_ONE)).reference).toBe('p. 1-20');

      const { note } = await useCase.execute(validInput());

      expect(note.reference).toBeNull();
    });

    // Regra 21
    it('derives plainText from the doc', async () => {
      const doc: NoteDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'combinei com ' },
              {
                type: 'mention',
                attrs: { id: SECOND_MEMBER_ID, label: 'Marcos' },
              },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'de reler o capítulo' }],
          },
        ],
      };

      const { note } = await useCase.execute(validInput({ doc }));

      expect(note.plainText).toBe('combinei com Marcos\nde reler o capítulo');
      expect(note.plainText).toBe(docToText(doc));
    });

    /**
     * Regra 12 — o doc é gravado COMO VEIO, com todos os attrs e marks.
     *
     * A asserção é contra um SNAPSHOT tirado antes do `execute`: `note.doc` **é**
     * o mesmo objeto que entrou, e o `notes.saved[0].doc` é o `structuredClone`
     * que o fake fez dele — comparar um com o outro seria comparar a árvore
     * (possivelmente já danificada) com ela mesma.
     */
    it('stores the doc exactly as it arrived', async () => {
      const doc: unknown = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [
              {
                type: 'text',
                text: 'A promessa',
                marks: [{ type: 'bold' }],
              },
            ],
          },
          {
            type: 'extensaoQueAindaNaoExiste',
            attrs: { cor: 'azul' },
            content: [{ type: 'text', text: 'de uma versão futura' }],
          },
        ],
      };
      const snapshot = structuredClone(doc);

      const { note } = await useCase.execute(validInput({ doc }));

      expect(note.doc).toEqual(snapshot);
      expect(required(notes.saved[0]).doc).toEqual(snapshot);
      // O negrito e os attrs da extensão futura chegaram ao "banco".
      expect(JSON.stringify(required(notes.saved[0]).doc)).toContain('"marks"');
      expect(JSON.stringify(required(notes.saved[0]).doc)).toContain('azul');
    });

    // Regra 11 — o autosave da primeira digitação manda o doc vazio.
    it('accepts an empty doc', async () => {
      const { note } = await useCase.execute(validInput({ doc: aDoc() }));

      expect(note.plainText).toBe('');
      expect(note.doc).toEqual({ type: 'doc', content: [] });
    });

    // Regra 27
    it.each<[string, unknown]>([
      ['null', null],
      ['undefined', undefined],
      ['a string', 'só um texto'],
      ['an array', [{ type: 'paragraph' }]],
      ['a paragraph instead of a doc', { type: 'paragraph' }],
      ['an object with no type', { content: [] }],
    ])('writes nothing when the doc is %s', async (_label, doc) => {
      await expect(useCase.execute(validInput({ doc }))).rejects.toBeInstanceOf(
        InvalidNoteError,
      );

      expect(notes.saved).toEqual([]);
      expect(notes.saveCalls).toBe(0);
    });
  });

  describe('writing again', () => {
    // Regra 22
    it('updates the same note instead of creating a second one', async () => {
      const first = await useCase.execute(
        validInput({ doc: aDoc('primeira impressão') }),
      );

      const second = await useCase.execute(
        validInput({ doc: aDoc('reli e mudei de ideia') }),
      );

      expect(second.created).toBe(false);
      expect(second.note.id).toBe(first.note.id);
      expect(second.note.createdAt).toEqual(first.note.createdAt);
      expect(second.note.plainText).toBe('reli e mudei de ideia');
      expect(notes.saved).toHaveLength(1);
      expect(required(notes.saved[0]).plainText).toBe('reli e mudei de ideia');
    });

    /**
     * Regra 22 — `updatedAt` novo e `createdAt` intacto, provados contra uma
     * nota SEMEADA com data antiga. Duas chamadas seguidas podem cair no mesmo
     * milissegundo, e um teste que comparasse as duas datas do mesmo instante
     * passaria com uma implementação que não mexesse no `updatedAt`.
     */
    it('advances updatedAt and keeps createdAt when the note already exists', async () => {
      const stored = aNote({
        planItemId: DAY_ONE,
        userId: MEMBER_ID,
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        createdAt: new Date(FIXED_ISO),
        updatedAt: new Date(FIXED_ISO),
      });
      await notes.save(stored);

      const { note, created } = await useCase.execute(validInput());

      expect(created).toBe(false);
      expect(note.id).toBe(stored.id);
      expect(note.createdAt).toEqual(new Date(FIXED_ISO));
      expect(note.updatedAt.getTime()).toBeGreaterThan(
        new Date(FIXED_ISO).getTime(),
      );
    });

    // Regra 23
    it('keeps one note per author on the same plan item', async () => {
      const mine = await useCase.execute(
        validInput({ actorUserId: MEMBER_ID }),
      );
      const theirs = await useCase.execute(
        validInput({ actorUserId: SECOND_MEMBER_ID }),
      );

      expect(theirs.created).toBe(true);
      expect(theirs.note.id).not.toBe(mine.note.id);
      expect(notes.saved).toHaveLength(2);
      expect(notes.saved.map((note) => note.userId).sort()).toEqual(
        [MEMBER_ID, SECOND_MEMBER_ID].sort(),
      );
    });

    // Regra 24
    it('keeps one note per plan item for the same author', async () => {
      const dayOne = await useCase.execute(validInput());
      const dayTwo = await useCase.execute(validInput({ planItemId: DAY_TWO }));

      expect(dayTwo.created).toBe(true);
      expect(dayTwo.note.id).not.toBe(dayOne.note.id);
      expect(notes.saved).toHaveLength(2);
      expect(notes.saved.map((note) => note.planItemId).sort()).toEqual(
        [DAY_ONE, DAY_TWO].sort(),
      );
    });

    /**
     * Regra 25 — o título é RESSINCRONIZADO com o tema atual do item. O admin
     * corrigiu "Cap. 3" para "Cap. 3 — A promessa"; a nota acompanha, senão
     * ficaria com um tema que já não existe e sem caminho de conserto.
     */
    it('resyncs the title with the current theme of the plan item', async () => {
      const before = await useCase.execute(validInput());
      expect(before.note.title).toBe(DAY_ONE_THEME);

      // O admin corrige o plano (é o que o replacePlanItems faz: mesmo id).
      await plan.saveMany([
        aPlanItem({
          id: DAY_ONE,
          bookId: BOOK_ID,
          order: 0,
          date: '2026-10-01',
          title: 'Cap. 1 — Uma reunião inesperada (revisado)',
        }),
      ]);

      const after = await useCase.execute(validInput());

      expect(after.note.title).toBe(
        'Cap. 1 — Uma reunião inesperada (revisado)',
      );
      expect(after.note.id).toBe(before.note.id);
      expect(notes.saved).toHaveLength(1);
    });

    /**
     * Regra 26 — o upsert REATIVA a nota arquivada mantendo o id. O índice
     * `unique(planItemId, userId)` não olha status: criar uma segunda faria a
     * anotação do dia virar um 409 permanente para quem arquivou a sua.
     */
    it('reactivates an archived note keeping its id', async () => {
      const archived = aNote({
        planItemId: DAY_ONE,
        userId: MEMBER_ID,
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      await notes.save(archived);

      const { note, created } = await useCase.execute(
        validInput({ doc: aDoc('voltei a escrever aqui') }),
      );

      expect(note.id).toBe(archived.id);
      expect(note.status).toBe('ACTIVE');
      expect(note.archivedAt).toBeNull();
      expect(note.plainText).toBe('voltei a escrever aqui');
      // `created: false` porque a nota já existia — a rota devolve 200.
      expect(created).toBe(false);
      expect(notes.saved).toHaveLength(1);
    });

    // A nota de outra pessoa não é tocada por um upsert do ator.
    it('never touches the note of another author', async () => {
      const theirs = aNote({
        planItemId: DAY_ONE,
        userId: SECOND_MEMBER_ID,
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        doc: aDoc('o que o Marcos escreveu'),
      });
      await notes.save(theirs);

      await useCase.execute(
        validInput({ doc: aDoc('o que a Maria escreveu') }),
      );

      const stored = await notes.byPlanItemAndUser(DAY_ONE, SECOND_MEMBER_ID);
      expect(stored).toEqual(theirs);
    });
  });

  // Estado acidental entre chamadas seria bug de produção invisível: a Tarefa
  // 11 compõe o UseCase uma vez e reusa por request.
  it('does not leak state between two executes of the same instance', async () => {
    const first = await useCase.execute(validInput({ doc: aDoc('do dia um') }));
    const second = await useCase.execute(
      validInput({
        planItemId: DAY_TWO,
        actorUserId: SECOND_MEMBER_ID,
        doc: aDoc('do dia dois'),
      }),
    );

    expect(first.note.plainText).toBe('do dia um');
    expect(first.note.title).toBe(DAY_ONE_THEME);
    expect(second.note.plainText).toBe('do dia dois');
    expect(second.note.title).toBe('Cap. 2 — Carneiro assado');
    expect(second.note.planItemId).toBe(DAY_TWO);
    expect(second.note.userId).toBe(SECOND_MEMBER_ID);
  });
});
