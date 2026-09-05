import { beforeEach, describe, expect, it } from 'vitest';

import { docToText } from '../../domain/doc-to-text';
import {
  InvalidNoteError,
  NotAMemberError,
  NoteNotFoundError,
  NotTheAuthorError,
} from '../../domain/errors';
import type { Note } from '../../domain/note';
import {
  aDoc,
  aMembership,
  aNote,
  FIXED_ISO,
  required,
} from '../../test-support/builders';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { NoteRepositoryFake } from '../_fakes/note-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { EditNoteInput } from '../edit-note';
import { EditNote } from '../edit-note';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';

const AUTHOR_ID = 'user-maria';
const OWNER_ID = 'user-owner';
const OTHER_MEMBER_ID = 'user-marcos';
const OUTSIDER_ID = 'user-forasteiro';

const NOTE_ID = 'note-avulsa-da-maria';
const SECOND_NOTE_ID = 'segunda-avulsa-da-maria';
const PLAN_NOTE_ID = 'note-do-dia-da-maria';
const ARCHIVED_NOTE_ID = 'note-arquivada-da-maria';
const LEGACY_NOTE_ID = 'note-com-plaintext-antigo';

/** O `plainText` que uma versão anterior do `docToText` deixou gravado. */
const LEGACY_PLAIN_TEXT = 'texto derivado por outra versao do docToText';

describe('EditNote', () => {
  let memberships: MembershipRepositoryFake;
  let notes: NoteRepositoryFake;
  let useCase: EditNote;

  /** Fábrica, nunca `const` de `describe` (CONVENCOES-CODIGO §6.6). */
  function validInput(overrides: Partial<EditNoteInput> = {}): EditNoteInput {
    return { actorUserId: AUTHOR_ID, noteId: NOTE_ID, ...overrides };
  }

  /** A linha gravada — é nela que as asserções de contrabando batem. */
  function stored(noteId = NOTE_ID): Note {
    return required(notes.saved.find((note) => note.id === noteId));
  }

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    notes = new NoteRepositoryFake();
    useCase = new EditNote(new AssertMembership(memberships), notes);

    await notes.save(
      aNote({
        id: NOTE_ID,
        kind: 'FREE',
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        title: 'Sobre o anel',
        reference: 'p. 45',
        doc: aDoc('a ideia original'),
      }),
    );
    await notes.save(
      aNote({
        id: SECOND_NOTE_ID,
        kind: 'FREE',
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        title: 'Sobre a coragem',
        reference: null,
        doc: aDoc('outra ideia'),
      }),
    );
    await notes.save(
      aNote({
        id: PLAN_NOTE_ID,
        kind: 'PLAN',
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
      }),
    );
    await notes.save(
      aNote({
        id: ARCHIVED_NOTE_ID,
        kind: 'FREE',
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    );
    /**
     * ⚠️ Fixture com `plainText` DIVERGENTE do `doc` de propósito — é a única
     * forma de distinguir "não recalculou" de "recalculou e deu no mesmo".
     * O estado é real: o `plainText` de uma nota antiga foi derivado pela
     * versão do `docToText` da época, e a regra 15 promete que renomear não
     * mexe nele.
     */
    await notes.save(
      aNote({
        id: LEGACY_NOTE_ID,
        kind: 'FREE',
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        doc: aDoc('o texto de verdade'),
        plainText: LEGACY_PLAIN_TEXT,
      }),
    );

    await memberships.save(
      aMembership({ userId: AUTHOR_ID, clubId: CLUB_ID, role: 'MEMBER' }),
    );
    await memberships.save(
      aMembership({ userId: OWNER_ID, clubId: CLUB_ID, role: 'OWNER' }),
    );
    await memberships.save(
      aMembership({ userId: OTHER_MEMBER_ID, clubId: CLUB_ID }),
    );
    await memberships.save(
      aMembership({ userId: OUTSIDER_ID, clubId: OTHER_CLUB_ID }),
    );
  });

  /**
   * Regra 9 — a delegação ao `noteForAuthor`. Aqui só se prova que o guard É
   * chamado e que nada é escrito quando ele barra; as regras 1–8 têm suíte
   * própria (`note-for-author.test.ts`) e não se copiam.
   */
  describe('delegates the tenant and authorship cut to noteForAuthor', () => {
    it('refuses a note that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ noteId: 'note-fantasma' })),
      ).rejects.toBeInstanceOf(NoteNotFoundError);

      expect(notes.updateCalls).toBe(0);
    });

    it('refuses an archived note', async () => {
      await expect(
        useCase.execute(
          validInput({ noteId: ARCHIVED_NOTE_ID, title: 'novo título' }),
        ),
      ).rejects.toBeInstanceOf(NoteNotFoundError);

      expect(notes.updateCalls).toBe(0);
      expect(stored(ARCHIVED_NOTE_ID).status).toBe('ARCHIVED');
    });

    it('refuses an actor who is not a member of the club of the note', async () => {
      await expect(
        useCase.execute(
          validInput({ actorUserId: OUTSIDER_ID, title: 'novo título' }),
        ),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(notes.updateCalls).toBe(0);
      expect(stored().title).toBe('Sobre o anel');
    });

    it.each([
      ['a fellow member', OTHER_MEMBER_ID],
      ['the OWNER of the club', OWNER_ID],
    ])('refuses %s, who is not the author', async (_label, actorUserId) => {
      await expect(
        useCase.execute(validInput({ actorUserId, title: 'novo título' })),
      ).rejects.toBeInstanceOf(NotTheAuthorError);

      expect(notes.updateCalls).toBe(0);
      expect(stored().title).toBe('Sobre o anel');
    });
  });

  /**
   * Lição 4 da auditoria: os dois eixos TÊM de se cruzar. Um teste de "ator
   * errado" com corpo válido e um de "corpo inválido" com ator válido deixam a
   * ORDEM de validação sem prova nenhuma.
   */
  describe('the order: the cut comes before the body', () => {
    /**
     * O `InvalidNoteError` é 400, e 400 é a única classe cuja `message` sai
     * publicada (CONVENCOES-CODIGO §6.2): responder 400 a um forasteiro
     * confirmaria que aquela nota existe. O 404 não confirma nada.
     */
    it('answers the tenant cut to an outsider who also sends a malformed body', async () => {
      const error: unknown = await useCase
        .execute(
          validInput({
            actorUserId: OUTSIDER_ID,
            title: '   ',
            doc: 'não é um doc',
          }),
        )
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotAMemberError);
      expect(error).not.toBeInstanceOf(InvalidNoteError);
      expect(notes.updateCalls).toBe(0);
    });

    it('answers the authorship cut to a fellow member who also sends an empty title', async () => {
      const error: unknown = await useCase
        .execute(validInput({ actorUserId: OTHER_MEMBER_ID, title: '   ' }))
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotTheAuthorError);
      expect(error).not.toBeInstanceOf(InvalidNoteError);
      expect(notes.updateCalls).toBe(0);
    });

    // E o mesmo cruzamento contra a recusa da nota do dia (regra 12): o guard
    // vem antes dela também.
    it('answers the tenant cut to an outsider editing a plan note', async () => {
      const error: unknown = await useCase
        .execute(
          validInput({
            actorUserId: OUTSIDER_ID,
            noteId: PLAN_NOTE_ID,
            doc: aDoc('texto'),
          }),
        )
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotAMemberError);
      expect(error).not.toBeInstanceOf(InvalidNoteError);
      expect(notes.updateCalls).toBe(0);
    });

    it('answers the authorship cut to a fellow member editing a plan note', async () => {
      const error: unknown = await useCase
        .execute(
          validInput({
            actorUserId: OTHER_MEMBER_ID,
            noteId: PLAN_NOTE_ID,
            doc: aDoc('texto'),
          }),
        )
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotTheAuthorError);
      expect(error).not.toBeInstanceOf(InvalidNoteError);
      expect(notes.updateCalls).toBe(0);
    });
  });

  /**
   * Regra 12 — a nota do dia tem o próprio caminho de escrita (`upsertPlanNote`),
   * que RESSINCRONIZA o título com o tema do plano. Aceitá-la aqui criaria dois
   * caminhos de escrita com regras diferentes para o mesmo campo, e a nota do
   * dia editada por aqui ficaria com o título velho — divergência silenciosa.
   */
  describe('a plan note is not editable here', () => {
    it('refuses it and writes nothing', async () => {
      await expect(
        useCase.execute(
          validInput({ noteId: PLAN_NOTE_ID, doc: aDoc('texto novo') }),
        ),
      ).rejects.toBeInstanceOf(InvalidNoteError);

      expect(notes.updateCalls).toBe(0);
      expect(stored(PLAN_NOTE_ID).plainText).toBe('Gostei do começo.');
    });

    // Nem para a própria autora, e nem com um patch que seria válido numa
    // avulsa.
    it('refuses it even for a title-only patch from its author', async () => {
      await expect(
        useCase.execute(
          validInput({ noteId: PLAN_NOTE_ID, title: 'Cap. 3 — A promessa' }),
        ),
      ).rejects.toBeInstanceOf(InvalidNoteError);

      expect(notes.updateCalls).toBe(0);
      expect(stored(PLAN_NOTE_ID).title).toBe(
        'Cap. 1 — Uma reunião inesperada',
      );
    });

    // E um patch VAZIO numa nota do dia também é recusado: o "nada a fazer" da
    // regra 17 não pode virar um caminho em que a nota do dia parece editável.
    it('refuses it even for an empty patch', async () => {
      await expect(
        useCase.execute(validInput({ noteId: PLAN_NOTE_ID })),
      ).rejects.toBeInstanceOf(InvalidNoteError);

      expect(notes.updateCalls).toBe(0);
    });
  });

  describe('editing a free note', () => {
    // Regra 10
    it('replaces the doc, derives plainText from it and bumps updatedAt', async () => {
      const doc = aDoc('reescrevi tudo', 'e acrescentei um parágrafo');

      const { note } = await useCase.execute(validInput({ doc }));

      expect(note.plainText).toBe('reescrevi tudo\ne acrescentei um parágrafo');
      expect(note.plainText).toBe(docToText(doc));
      expect(note.updatedAt.getTime()).toBeGreaterThan(
        new Date(FIXED_ISO).getTime(),
      );
      expect(stored().plainText).toBe(
        'reescrevi tudo\ne acrescentei um parágrafo',
      );
      expect(notes.updateCalls).toBe(1);
    });

    /**
     * Regra 10 — e o `updatedAt` anda em TODA escrita, não só quando o `doc`
     * vem. Sem estes dois, um `updatedAt: patch.doc === undefined ?
     * note.updatedAt : new Date()` sobrevive à suíte inteira — e é o
     * `updatedAt` que ordena "editadas recentemente" e invalida o cache do PWA:
     * renomear uma nota deixaria a lista na ordem velha.
     *
     * A fixture tem `updatedAt` em `FIXED_ISO` de propósito: contra um
     * `new Date()` semeado no mesmo teste, o "avançou" cairia no mesmo
     * milissegundo e ficaria indecidível.
     */
    it.each<[string, Partial<EditNoteInput>]>([
      ['a title-only patch', { title: 'Sobre o poder' }],
      ['a reference-only patch', { reference: 'p. 99' }],
    ])('bumps updatedAt on %s', async (_label, patch) => {
      const { note } = await useCase.execute(validInput(patch));

      expect(note.updatedAt.getTime()).toBeGreaterThan(
        new Date(FIXED_ISO).getTime(),
      );
      expect(stored().updatedAt.getTime()).toBe(note.updatedAt.getTime());
      expect(notes.updateCalls).toBe(1);
    });

    // Regra 11
    it('trims a title that is present', async () => {
      const { note } = await useCase.execute(
        validInput({ title: '   Sobre o poder   ' }),
      );

      expect(note.title).toBe('Sobre o poder');
      expect(stored().title).toBe('Sobre o poder');
    });

    // Regra 11 — ausente é ausente: renomear não é obrigatório para reescrever.
    it('leaves the title alone when it is absent', async () => {
      const { note } = await useCase.execute(
        validInput({ doc: aDoc('só o texto mudou') }),
      );

      expect(note.title).toBe('Sobre o anel');
      expect(stored().title).toBe('Sobre o anel');
    });

    // Regra 13
    it.each([
      ['an empty title', ''],
      ['a title of spaces', '    '],
      ['a title of a tab', '\t'],
      ['a title of a newline', '\n'],
    ])('refuses %s and writes nothing', async (_label, title) => {
      await expect(
        useCase.execute(validInput({ title, doc: aDoc('texto novo') })),
      ).rejects.toBeInstanceOf(InvalidNoteError);

      expect(notes.updateCalls).toBe(0);
      // Nem o `doc`, que era válido, entrou: a validação é do patch INTEIRO
      // antes de qualquer escrita.
      expect(stored().title).toBe('Sobre o anel');
      expect(stored().plainText).toBe('a ideia original');
    });

    // Regra 14 — o MESMO `optionalText` do livro e do item do plano, sem cópia.
    it.each<[string, string | null, string | null]>([
      ['null', null, null],
      ['an empty string', '', null],
      ['only spaces', '   ', null],
      ['a reference with spaces around', '  p. 62-70  ', 'p. 62-70'],
      ['a clean reference', 'p. 62-70', 'p. 62-70'],
      ['a subject instead of a page', 'sobre a coragem', 'sobre a coragem'],
    ])(
      'normalizes a reference of %s into the stored one',
      async (_label, reference, expected) => {
        const { note } = await useCase.execute(validInput({ reference }));

        expect(note.reference).toBe(expected);
        expect(stored().reference).toBe(expected);
      },
    );

    // Regra 14 — ausente = não mexe, que é diferente de `null` (limpa).
    it('leaves the reference alone when it is absent', async () => {
      const { note } = await useCase.execute(
        validInput({ title: 'Sobre o poder' }),
      );

      expect(note.reference).toBe('p. 45');
      expect(stored().reference).toBe('p. 45');
    });

    /**
     * Regra 15 — renomear NÃO recalcula o `plainText`.
     *
     * A fixture tem `plainText` divergente do `doc` de propósito: com um
     * `plainText` coerente, uma implementação que recalculasse a cada escrita
     * passaria neste teste sem que ninguém notasse.
     */
    it('does not recompute plainText when the doc is absent', async () => {
      const { note } = await useCase.execute(
        validInput({ noteId: LEGACY_NOTE_ID, title: 'Outro título' }),
      );

      expect(note.plainText).toBe(LEGACY_PLAIN_TEXT);
      expect(stored(LEGACY_NOTE_ID).plainText).toBe(LEGACY_PLAIN_TEXT);
      expect(stored(LEGACY_NOTE_ID).title).toBe('Outro título');
    });

    // Regra 15 — e nem o `doc` é tocado quando só a referência muda.
    it('keeps the doc untouched when only the reference changes', async () => {
      const before = stored().doc;

      const { note } = await useCase.execute(
        validInput({ reference: 'p. 99' }),
      );

      expect(note.doc).toEqual(before);
      expect(stored().doc).toEqual(before);
      expect(stored().plainText).toBe('a ideia original');
    });

    // Regra 16 — o mesmo portão de `doc` do `createFreeNote`. `undefined` NÃO
    // entra nesta lista: ausência é a regra 15, não erro.
    it.each<[string, unknown]>([
      ['null', null],
      ['a string', 'só um texto'],
      ['a number', 42],
      ['an array', [{ type: 'paragraph' }]],
      ['a paragraph instead of a doc', { type: 'paragraph' }],
    ])('refuses a doc that is %s and writes nothing', async (_label, doc) => {
      await expect(
        useCase.execute(validInput({ doc, title: 'Sobre o poder' })),
      ).rejects.toBeInstanceOf(InvalidNoteError);

      expect(notes.updateCalls).toBe(0);
      expect(stored().title).toBe('Sobre o anel');
      expect(stored().plainText).toBe('a ideia original');
    });

    // O doc vazio é válido: é o que o autosave da primeira digitação manda.
    it('accepts an empty doc', async () => {
      const { note } = await useCase.execute(validInput({ doc: aDoc() }));

      expect(note.plainText).toBe('');
      expect(stored().plainText).toBe('');
    });

    /**
     * Regra 17 — nada a fazer NÃO é erro: é o retry de uma fila offline que já
     * coalesceu tudo. E não pode custar um `UPDATE` por request — daí o
     * `updateCalls`, que é a única forma de distinguir "não chamou" de "chamou
     * e o patch não mudou nada".
     */
    it('returns the note untouched for an empty patch, without calling the repository', async () => {
      const before = stored();

      const { note } = await useCase.execute(validInput());

      expect(note).toEqual(before);
      expect(notes.updateCalls).toBe(0);
    });

    // `doc: undefined` é ausência, não doc malformado — e ausência sozinha
    // continua sendo patch vazio.
    it('treats an explicit undefined as absence, not as a malformed doc', async () => {
      const { note } = await useCase.execute(
        validInput({ doc: undefined, title: undefined, reference: undefined }),
      );

      expect(note.title).toBe('Sobre o anel');
      expect(notes.updateCalls).toBe(0);
    });

    /**
     * Regra 20 — o `doc` é gravado COMO VEIO. A asserção é contra um SNAPSHOT
     * tirado antes do `execute` (lição 2): `toBe` provaria identidade de
     * referência, que não é o contrato — uma travessia que apagasse os `marks`
     * devolvendo o mesmo objeto passaria nele.
     */
    it('stores the doc exactly as it arrived, marks and attrs included', async () => {
      const doc: unknown = {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            attrs: { fonte: 'p. 45' },
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'não é o que você tem',
                    marks: [{ type: 'italic' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const snapshot = structuredClone(doc);

      const { note } = await useCase.execute(validInput({ doc }));

      expect(note.doc).toEqual(snapshot);
      expect(stored().doc).toEqual(snapshot);
      expect(JSON.stringify(stored().doc)).toContain('"marks"');
      expect(JSON.stringify(stored().doc)).toContain('p. 45');
    });

    // Regra 18 — os imutáveis atravessam a edição mais agressiva possível.
    it('keeps every immutable field', async () => {
      const before = stored();

      const { note } = await useCase.execute(
        validInput({
          title: 'Tudo novo',
          reference: 'p. 100',
          doc: aDoc('texto completamente diferente'),
        }),
      );

      for (const field of [
        'id',
        'kind',
        'userId',
        'clubId',
        'bookId',
        'planItemId',
        'status',
      ] as const) {
        expect(note[field]).toBe(before[field]);
        expect(stored()[field]).toBe(before[field]);
      }
      expect(note.createdAt).toEqual(new Date(FIXED_ISO));
      expect(note.archivedAt).toBeNull();
      expect(stored().archivedAt).toBeNull();
    });
  });

  /**
   * Regra 19 — contrabando, testado com o ator LEGÍTIMO e assertado na LINHA
   * GRAVADA (lição 1 da auditoria).
   *
   * Um teste de contrabando com ator de fora do clube morre no guard e nunca
   * chega ao campo que é escrito: provaria que a *conferência* ignora o input,
   * jamais que a *linha gravada* ignora. E o mutante perigoso não é
   * `campo: input.campo` (que quebraria com `undefined` em todo teste), é
   * **`input.campo ?? note.campo`** — o envenenamento com fallback, invisível
   * enquanto o campo está ausente. Por isso cada teste manda um patch REAL
   * junto: sem ele, a asserção passaria pelo atalho do patch vazio.
   */
  describe('smuggling, with the legitimate author', () => {
    it('never lets a smuggled userId change the author of the stored row', async () => {
      const smuggled = {
        actorUserId: AUTHOR_ID,
        noteId: NOTE_ID,
        title: 'Sobre o poder',
        // @ts-expect-error o input não declara userId — o autor é o da nota
        userId: OWNER_ID,
      } satisfies EditNoteInput;

      const { note } = await useCase.execute(smuggled);

      expect(note.userId).toBe(AUTHOR_ID);
      expect(stored().userId).toBe(AUTHOR_ID);
      expect(stored().title).toBe('Sobre o poder');
    });

    // Um `clubId` vindo do corpo faria a nota aparecer na listagem de OUTRO
    // clube — envenenamento cross-tenant sem nenhum 403 no caminho.
    it('never lets a smuggled clubId move the note to another club', async () => {
      const smuggled = {
        actorUserId: AUTHOR_ID,
        noteId: NOTE_ID,
        title: 'Sobre o poder',
        // @ts-expect-error o input não declara clubId — ele vem de note.clubId
        clubId: OTHER_CLUB_ID,
      } satisfies EditNoteInput;

      const { note } = await useCase.execute(smuggled);

      expect(note.clubId).toBe(CLUB_ID);
      expect(stored().clubId).toBe(CLUB_ID);
    });

    it('never lets a smuggled plainText reach the stored row', async () => {
      const smuggled = {
        actorUserId: AUTHOR_ID,
        noteId: NOTE_ID,
        doc: aDoc('o texto de verdade'),
        // @ts-expect-error plainText é DERIVADO, nunca entra na API (ADR 0001)
        plainText: 'texto adulterado pelo cliente',
      } satisfies EditNoteInput;

      const { note } = await useCase.execute(smuggled);

      expect(note.plainText).toBe('o texto de verdade');
      expect(stored().plainText).toBe('o texto de verdade');
    });

    /**
     * ⚠️ O mesmo contrabando, mas num patch **SEM `doc`** — e é este que morde.
     *
     * O teste acima manda um `doc`, e é o `doc` que faz `patch.plainText`
     * existir; num envenenamento colocado ANTES do spread do patch, o
     * `patch.plainText` derivado o cobre e o mutante sobrevive. Sem `doc` no
     * patch não há nada para cobri-lo, e o `plainText` do cliente chega à
     * linha: renomear a nota reescreveria o texto derivado com o que o
     * cliente mandou (ADR 0001).
     *
     * É por isso que a asserção é a do `plainText` ORIGINAL, não a do
     * derivado: aqui o contrato é "não mexeu", que é também a regra 15.
     */
    it('never lets a smuggled plainText reach the row on a title-only patch', async () => {
      const smuggled = {
        actorUserId: AUTHOR_ID,
        noteId: NOTE_ID,
        title: 'Sobre o poder',
        // @ts-expect-error plainText é DERIVADO, nunca entra na API (ADR 0001)
        plainText: 'texto adulterado pelo cliente',
      } satisfies EditNoteInput;

      const { note } = await useCase.execute(smuggled);

      expect(note.plainText).toBe('a ideia original');
      expect(stored().plainText).toBe('a ideia original');
      expect(stored().title).toBe('Sobre o poder');
    });

    // Arquivar é o `archiveNote`, e ele confere autoria por si. Um `status` no
    // corpo do editNote seria um segundo caminho para arquivar — e, pior, um
    // caminho para DESARQUIVAR, que é MVP 4.
    it('never lets a smuggled status or archivedAt archive the note', async () => {
      const smuggled = {
        actorUserId: AUTHOR_ID,
        noteId: NOTE_ID,
        title: 'Sobre o poder',
        // @ts-expect-error o input não declara status — arquivar é o archiveNote
        status: 'ARCHIVED',
        archivedAt: new Date('2026-05-05T00:00:00.000Z'),
      } satisfies EditNoteInput;

      const { note } = await useCase.execute(smuggled);

      expect(note.status).toBe('ACTIVE');
      expect(note.archivedAt).toBeNull();
      expect(stored().status).toBe('ACTIVE');
      expect(stored().archivedAt).toBeNull();
    });

    // Virar `PLAN` daria à avulsa uma chave `(planItemId, userId)` e a faria
    // colidir com a anotação do dia — 409 permanente na tela de hoje.
    it('never lets a smuggled kind or planItemId turn a free note into a plan note', async () => {
      const smuggled = {
        actorUserId: AUTHOR_ID,
        noteId: NOTE_ID,
        title: 'Sobre o poder',
        // @ts-expect-error o input não declara kind nem planItemId
        kind: 'PLAN',
        planItemId: 'plan-book-1-2026-10-01',
      } satisfies EditNoteInput;

      const { note } = await useCase.execute(smuggled);

      expect(note.kind).toBe('FREE');
      expect(note.planItemId).toBeNull();
      expect(stored().kind).toBe('FREE');
      expect(stored().planItemId).toBeNull();
    });

    it('never lets a smuggled bookId, id or createdAt reach the stored row', async () => {
      const smuggled = {
        actorUserId: AUTHOR_ID,
        noteId: NOTE_ID,
        title: 'Sobre o poder',
        // @ts-expect-error nenhum dos três existe no input
        bookId: 'book-de-outro-clube',
        id: 'note-inventada',
        createdAt: new Date('1999-01-01T00:00:00.000Z'),
      } satisfies EditNoteInput;

      const { note } = await useCase.execute(smuggled);

      expect(note.bookId).toBe('book-1');
      expect(note.id).toBe(NOTE_ID);
      expect(note.createdAt).toEqual(new Date(FIXED_ISO));
      expect(notes.saved).toHaveLength(5);
    });

    // O outro lado: o contrabando também não compra o corte de tenant. Mandar
    // o clube "certo" no corpo não faz o forasteiro entrar.
    it('does not let a smuggled clubId buy a way past the tenant cut', async () => {
      const smuggled = {
        actorUserId: OUTSIDER_ID,
        noteId: NOTE_ID,
        title: 'Sobre o poder',
        // @ts-expect-error o input não declara clubId
        clubId: OTHER_CLUB_ID,
      } satisfies EditNoteInput;

      await expect(useCase.execute(smuggled)).rejects.toBeInstanceOf(
        NotAMemberError,
      );
      expect(notes.updateCalls).toBe(0);
      expect(stored().title).toBe('Sobre o anel');
    });
  });

  /**
   * Regra 21 — estado acidental entre chamadas seria bug de produção
   * invisível: a Tarefa 11 compõe o UseCase uma vez e o reusa por request.
   */
  it('does not leak state between two executes of the same instance', async () => {
    const first = await useCase.execute(
      validInput({ title: 'Primeira', reference: 'p. 10', doc: aDoc('uma') }),
    );
    const second = await useCase.execute(
      validInput({ noteId: SECOND_NOTE_ID, title: 'Segunda' }),
    );

    expect(first.note.title).toBe('Primeira');
    expect(first.note.reference).toBe('p. 10');
    expect(first.note.plainText).toBe('uma');
    expect(second.note.title).toBe('Segunda');
    // Nem a referência nem o texto da primeira vazam para a segunda.
    expect(second.note.reference).toBeNull();
    expect(second.note.plainText).toBe('outra ideia');
    expect(second.note.id).toBe(SECOND_NOTE_ID);
  });
});
